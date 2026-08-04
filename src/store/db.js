import { getSupaClient } from './supabase.js';

// ─── LOAD ────────────────────────────────────────────────────────────────────
// Returns the same shape as the old localStorage db so the rest of the app
// doesn't need to change its data access patterns yet.
// Shape: { mf:{}, customFunds:[], navData:{}, navHistory:{}, navDate:'' }
export async function loadDB() {
  const sb = getSupaClient();
  if (!sb) return emptyDB();

  // 1. funds → customFunds[]
  const { data: fundsRows, error: fe } = await sb.from('funds').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: true });
  if (fe) { console.error('loadDB funds:', fe.message); return emptyDB(); }

  const customFunds = (fundsRows || []).map(r => ({
    key: r.key,
    data: {
      code:     r.code,
      name:     r.name,
      fullName: r.full_name,
      color:    r.color,
      ter:      r.ter,
      category: r.category,
      amcName:  r.amc_name,
    },
  }));

  // 2. transactions → mf{}
  const { data: txRows, error: te } = await sb.from('transactions').select('*').order('date', { ascending: true });
  if (te) console.error('loadDB transactions:', te.message);

  const mf = {};
  for (const f of customFunds) mf[f.key] = { transactions: [] };
  // build a code→key map for fast lookup
  const codeToKey = {};
  for (const f of customFunds) codeToKey[f.data.code] = f.key;

  for (const tx of (txRows || [])) {
    const key = codeToKey[tx.fund_code];
    if (!key) continue;
    mf[key].transactions.push({
      _id:    tx.id,
      date:   tx.date,
      type:   tx.type,
      amount: String(tx.amount),
      stamp:  String(tx.stamp ?? 0),
      units:  String(tx.units),
      nav:    String(tx.nav),
      note:   tx.note || '',
    });
  }

  // 3. nav_cache → navData{}
  const { data: navCacheRows, error: ne } = await sb.from('nav_cache').select('*');
  if (ne) console.error('loadDB nav_cache:', ne.message);

  const navData = {};
  for (const r of (navCacheRows || [])) {
    const key = codeToKey[r.fund_code];
    if (!key) continue;
    // Convert YYYY-MM-DD → DD-MM-YYYY for app consistency (mfapi format)
    const nd = r.nav_date; // "2026-07-16"
    const navDateDisplay = nd && nd.length===10 ? nd.slice(8)+'-'+nd.slice(5,7)+'-'+nd.slice(0,4) : nd;
    navData[key] = { nav: r.nav, date: navDateDisplay, updatedAt: r.updated_at, fetchedAt: r.cloudflare_fetched_at||null };
  }

  // nav_history is NOT loaded here — too large.
  // loadNavHistory() fetches per-fund on demand (same as before).

  const navDates = Object.values(navData).map(n => n.date).filter(Boolean);
  const navDate = navDates.length ? navDates.sort().at(-1) : '';

  return { mf, customFunds, navData, navHistory: {}, navDate };
}

// ─── FUND OPERATIONS ─────────────────────────────────────────────────────────

export async function dbAddFund(fundData) {
  // fundData = { code, key, name, fullName, color, ter, category, amcName }
  const sb = getSupaClient();
  if (!sb) return;
  const { error } = await sb.from('funds').upsert({
    code:      fundData.code,
    key:       fundData.key,
    name:      fundData.name,
    full_name: fundData.fullName,
    color:     fundData.color,
    ter:       fundData.ter,
    category:  fundData.category,
    amc_name:  fundData.amcName,
  }, { onConflict: 'code' });
  if (error) console.error('dbAddFund:', error.message);
}

export async function dbUpdateFund(code, updates) {
  // updates keys use camelCase — map to DB columns
  const sb = getSupaClient();
  if (!sb) return;
  const row = {};
  if (updates.key      != null) row.key       = updates.key;
  if (updates.name     != null) row.name      = updates.name;
  if (updates.fullName != null) row.full_name  = updates.fullName;
  if (updates.color    != null) row.color      = updates.color;
  if (updates.ter      != null) row.ter        = updates.ter;
  if (updates.category != null) row.category   = updates.category;
  if (updates.amcName  != null) row.amc_name   = updates.amcName;
  if (!Object.keys(row).length) return;
  const { error } = await sb.from('funds').update(row).eq('code', code);
  if (error) console.error('dbUpdateFund:', error.message);
}

export async function dbDeleteFund(code) {
  const sb = getSupaClient();
  if (!sb) return;
  // cascade deletes transactions, nav_cache, fund_details automatically
  const { error } = await sb.from('funds').delete().eq('code', code);
  if (error) console.error('dbDeleteFund:', error.message);
}

// ─── TRANSACTION OPERATIONS ───────────────────────────────────────────────────

export async function dbSaveTx(fundCode, tx) {
  // tx._id present → update existing row; absent → insert new
  const sb = getSupaClient();
  if (!sb) return null;
  const row = {
    fund_code: fundCode,
    date:      tx.date,
    type:      tx.type,
    amount:    parseFloat(tx.amount),
    stamp:     parseFloat(tx.stamp || 0),
    units:     parseFloat(tx.units),
    nav:       parseFloat(tx.nav),
    note:      tx.note || '',
  };
  if (tx._id) {
    const { error } = await sb.from('transactions').update(row).eq('id', tx._id);
    if (error) console.error('dbSaveTx update:', error.message);
    return tx._id;
  } else {
    const { data, error } = await sb.from('transactions').insert(row).select('id').single();
    if (error) console.error('dbSaveTx insert:', error.message);
    return data?.id ?? null;
  }
}

export async function dbDeleteTx(txId) {
  const sb = getSupaClient();
  if (!sb) return;
  const { error } = await sb.from('transactions').delete().eq('id', txId);
  if (error) console.error('dbDeleteTx:', error.message);
}

// ─── NAV CACHE ───────────────────────────────────────────────────────────────

export async function dbSaveNavCache(fundCode, nav, navDate, cloudflareFetchedAt=null) {
  const sb = getSupaClient();
  if (!sb) return;
  // Convert DD-MM-YYYY to YYYY-MM-DD for Supabase date column
  let dateStr = navDate;
  if (dateStr && dateStr.match(/^\d{2}-\d{2}-\d{4}$/)) {
    const [dd, mm, yyyy] = dateStr.split('-');
    dateStr = `${yyyy}-${mm}-${dd}`;
  }
  const row = {
    fund_code:  fundCode,
    nav:        nav,
    nav_date:   dateStr,
    updated_at: new Date().toISOString(),
  };
  if (cloudflareFetchedAt) row.cloudflare_fetched_at = cloudflareFetchedAt;
  const { error } = await sb.from('nav_cache').upsert(row, { onConflict: 'fund_code' });
  if (error) console.error('dbSaveNavCache:', error.message);
}

// ─── NAV HISTORY ─────────────────────────────────────────────────────────────

export async function dbLoadNavHistory(fundCode) {
  const sb = getSupaClient();
  if (!sb) return null;
  const { data, error } = await sb
    .from('nav_history')
    .select('date_str, nav')
    .eq('fund_code', fundCode)
    .order('date_str', { ascending: true })
    .limit(10000);
  if (error) { console.error('dbLoadNavHistory:', error.message); return null; }
  return data?.length ? data.map(r => ({ dateStr: r.date_str, nav: r.nav })) : null;
}

export async function dbSaveNavHistory(fundCode, entries) {
  // entries = [{ dateStr, nav }]
  const sb = getSupaClient();
  if (!sb) return;
  const rows = entries.map(e => ({ fund_code: fundCode, date_str: e.dateStr, nav: e.nav }));
  // upsert in batches of 500 to avoid payload limits
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb.from('nav_history').upsert(rows.slice(i, i + 500), { onConflict: 'fund_code,date_str' });
    if (error) { console.error('dbSaveNavHistory batch:', error.message); break; }
  }
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function emptyDB() {
  return { mf: {}, customFunds: [], navData: {}, navHistory: {}, navDate: '' };
}

export async function dbLoadNavHistoryRange(fundCode, from, to) {
  const sb = getSupaClient();
  if (!sb) return null;
  const { data, error } = await sb
    .from('nav_history')
    .select('date_str, nav')
    .eq('fund_code', fundCode)
    .order('date_str', { ascending: true })
    .range(from, to);
  if (error) { console.error('dbLoadNavHistoryRange:', error.message); return null; }
  return data?.length ? data.map(r => ({ dateStr: r.date_str, nav: r.nav })) : null;
}

export async function dbGetLatestNavDate(fundCode) {
  const sb = getSupaClient();
  if (!sb) return null;
  const { data, error } = await sb
    .from('nav_history')
    .select('date_str')
    .eq('fund_code', fundCode)
    .order('date_str', { ascending: false })
    .limit(1);
  if (error) { console.error('dbGetLatestNavDate:', error.message); return null; }
  return data?.[0]?.date_str ?? null;
}

export async function dbDeleteAllTxForFund(fundCode) {
  const sb = getSupaClient();
  if (!sb) return;
  const { error } = await sb.from('transactions').delete().eq('fund_code', fundCode);
  if (error) console.error('dbDeleteAllTxForFund:', error.message);
}

// ── FUND DETAILS (holdings, sectors from Groww proxy) ─────────────────────────
export async function dbLoadHoldings(fundCode) {
  const sb = getSupaClient();
  if (!sb) return null;
  const { data, error } = await sb
    .from('fund_details')
    .select('holdings, fund_info, fetched_at')
    .eq('fund_code', fundCode)
    .maybeSingle();
  if (error) return null;
  return data; // { holdings, sectors, fund_info, fetched_at }
}

export async function dbSaveHoldings(fundCode, growwData) {
  const sb = getSupaClient();
  if (!sb) return;
  const row = {
    fund_code:          fundCode,
    holdings:           growwData.holdings || [],
    fund_info:          growwData,                         // full response blob
    fetched_at:         new Date().toISOString(),
    aum:                growwData.aum ?? null,
    expense_ratio:      growwData.expense_ratio ? parseFloat(growwData.expense_ratio) : null,
    fund_manager:       growwData.fund_manager || null,
    benchmark:          growwData.benchmark || null,
    exit_load:          growwData.exit_load || null,
    pe_ratio:           growwData.pe ?? null,
    pb_ratio:           growwData.pb ?? null,
    portfolio_turnover: growwData.portfolio_turnover ?? null,
    sharpe:             growwData.sharpe ?? null,
    beta:               growwData.beta ?? null,
    std_dev:            growwData.std_dev ?? null,
  };
  const { error } = await sb.from('fund_details').upsert(row, { onConflict: 'fund_code' });
  if (error) console.error('dbSaveHoldings:', error.message);
}

export async function dbLoadAllHoldings() {
  const sb = getSupaClient();
  if (!sb) return [];
  const { data, error } = await sb
    .from('fund_details')
    .select('fund_code, holdings, fund_info, fetched_at');
  if (error) { console.error('dbLoadAllHoldings:', error.message); return []; }
  return data || [];
}
