import { create } from 'zustand';
import { loadDB, dbAddFund, dbUpdateFund, dbDeleteFund, dbSaveTx, dbDeleteTx, dbSaveNavCache, dbGetLatestNavDate, dbLoadNavHistory, dbLoadNavHistoryRange, dbSaveNavHistory } from './db.js';
import { isLoggedIn } from './supabase.js';
import { appAlert } from '../components/ui/ConfirmDialog.jsx';
import { MF_FUNDS, navHistoryCache, fundMetaCache, syncFundsFromDB, normalizeFundCategory, parseMFData } from '../constants/funds.js';

function notLoggedInAlert() {
  appAlert('Not connected to database.\n\nOpen Settings → Connect Database to connect your Supabase project first.', { variant:'alert-warn' });
}

const useAppStore = create((set, get) => ({
  db: { mf: {}, customFunds: [], navData: {}, navHistory: {}, navDate: '' },
  currentPage: (()=>{
    // Read hash synchronously so sidebar shows correct active item on reload
    const h = window.location.hash.replace('#','') || '/';
    if (h.startsWith('/fund/')) return h.replace('/fund/','');
    if (h === '/insights') return 'Insights';
    return 'Dashboard';
  })(),
  sidebarOpen: false,
  amtHidden: false,
  tick: 0,
  dbReady: false,
  _navigate: null, // registered from App after HashRouter mounts

  setNavigate(fn) { set({ _navigate: fn }); },
  setCurrentPageOnly(page) { set({ currentPage: page }); },

  async initDB() {
    if (get().dbReady) return; // prevent double-call from React StrictMode
    const rawDb = await loadDB();
    const toSave=syncFundsFromDB(rawDb);
    // Save any funds that had missing name/fullName rebuilt on load
    if(toSave.length){
      const {dbUpdateFund}=await import('./db.js');
      toSave.forEach(({code,name,fullName})=>dbUpdateFund(code,{name,fullName}));
    }

    // Load ALL nav history for all funds BEFORE setting dbReady — single render, no flicker
    const codes = (rawDb.customFunds || []).map(f => ({ key: f.key, code: f.data.code }));
    const navHistoryOut = {};
    const navDataOut = { ...rawDb.navData };
    if (codes.length) {
      await Promise.all(codes.map(async ({ key, code }) => {
        if (navHistoryCache[key]) { navHistoryOut[key] = navHistoryCache[key].map(d=>({dateStr:d.dateStr,nav:d.nav})); return; }
        // Fetch ALL rows from Supabase with pagination (default limit is 1000)
        let allRows = [];
        let from = 0;
        const pageSize = 1000;
        while (true) {
          const rows = await dbLoadNavHistoryRange(code, from, from + pageSize - 1);
          if (!rows?.length) break;
          allRows = allRows.concat(rows);
          if (rows.length < pageSize) break;
          from += pageSize;
        }
        if (allRows.length) {
          navHistoryCache[key] = allRows.map(d => ({ ...d, date: new Date(d.dateStr) }));
          navHistoryOut[key] = allRows;
          return;
        }
        // Supabase empty — fetch from mfapi.in and save
        try {
          const r = await fetch(`https://api.mfapi.in/mf/${code}`);
          const j = await r.json();
          if (j.data?.length) {
            navHistoryCache[key] = parseMFData(j.data);
            const entries = navHistoryCache[key].map(d => ({ dateStr: d.dateStr, nav: d.nav }));
            navHistoryOut[key] = entries;
            dbSaveNavHistory(code, entries);
            if (!navDataOut[key]) {
              navDataOut[key] = { nav: parseFloat(j.data[0].nav), date: j.data[0].date };
              dbSaveNavCache(code, navDataOut[key].nav, navDataOut[key].date);
            }
          }
        } catch(e) {}
      }));
    }
    // ONE single set — spinner disappears, everything renders correctly first time
    const finalDb = { ...rawDb, navHistory: navHistoryOut, navData: navDataOut };
    set({ db: finalDb, dbReady: true, tick: get().tick + 1 });

    // Set topbar status from nav_cache DB data immediately (no fetchNAV needed)
    const navEntries = Object.values(navDataOut);
    if (navEntries.length) {
      // Pick latest nav_date among all funds
      const latestEntry = navEntries.reduce((best, cur) => {
        if (!best) return cur;
        // Compare dates — both are DD-MM-YYYY, convert to YYYY-MM-DD for comparison
        const toComp = d => { if(!d)return''; const p=d.split('-'); return p[0].length===4?d:`${p[2]}-${p[1]}-${p[0]}`; };
        return toComp(cur.date) > toComp(best.date) ? cur : best;
      }, null);
      if (latestEntry?.date) {
        const statusEl = document.getElementById('nav-status');
        if (statusEl) {
          // Show nav date + cloudflare fetch time if available
          // Format: "NAV: 16-07-2026 · 17-07-2026, 03:06 PM"
          const fmtIST = iso => {
            if (!iso) return '';
            const dt = new Date(iso);
            const ist = new Date(dt.getTime() + (5.5*60*60*1000));
            const dd = String(ist.getUTCDate()).padStart(2,'0');
            const mm = String(ist.getUTCMonth()+1).padStart(2,'0');
            const yyyy = ist.getUTCFullYear();
            const hh = ist.getUTCHours();
            const min = String(ist.getUTCMinutes()).padStart(2,'0');
            const ampm = hh >= 12 ? 'PM' : 'AM';
            const hh12 = String(hh % 12 || 12).padStart(2,'0');
            return `${dd}-${mm}-${yyyy}, ${hh12}:${min} ${ampm}`;
          };
          const timeStr = fmtIST(latestEntry.fetchedAt);
          let statusText = `NAV: ${latestEntry.date}${timeStr ? ' · ' + timeStr : ''}`;
          statusEl.textContent = statusText;
        }
      }
    }
  },

  saveAndRefresh(newDb) {
    // No more single-blob save — each action writes its own rows to Supabase.
    // This only updates in-memory state + MF_FUNDS for React re-renders.
    syncFundsFromDB(newDb); // fetchNAV — memory sync only, DB already updated
    set({ db: newDb, tick: get().tick + 1 });
  },

  setPage(page) {
    set({ currentPage: page, sidebarOpen: false });
    // Drive URL via React Router navigate
    const nav = get()._navigate;
    if (nav) {
      if (page === 'Dashboard') nav('/');
      else if (page === 'Insights') nav('/insights');
      else if (page.startsWith('Holdings:')) nav('/holdings/' + page.replace('Holdings:',''));
      else nav('/fund/' + page);
    }
    setTimeout(()=>{
      const el = document.getElementById('main-content');
      if(el) el.scrollTop = 0;
      window.scrollTo({top:0, left:0, behavior:'instant'});
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }, 0);
  },
  toggleSidebar() { set(s => ({ sidebarOpen: !s.sidebarOpen })); },
  closeSidebar() { set({ sidebarOpen: false }); },
  toggleAmtHidden() {
    const newVal = !get().amtHidden;
    window._amtHidden = newVal; // sync global for chart canvas text
    set({ amtHidden: newVal });
  },

  async fetchNAV() {
    const keys = Object.keys(MF_FUNDS);
    if (!keys.length) return;
    const btnEl    = document.getElementById('nav-btn');
    const statusEl = document.getElementById('nav-status');
    if (btnEl)    { btnEl.textContent = '⌛'; btnEl.disabled = true; }
    if (statusEl) { statusEl.textContent = 'Fetching...'; }
    const db    = get().db;
    const newDb = { ...db, navData: { ...db.navData }, navHistory: { ...(db.navHistory||{}) } };
    const t0    = performance.now();

    // ── STEP 1: Fetch latest NAV for ALL funds in ONE call via Cloudflare→AMFI ──
    // Single HTTP request, returns all scheme codes at once
    const codes = Object.values(MF_FUNDS).map(f => f.code).join(',');
    console.log(`[fetchNAV] Step1: Cloudflare/AMFI single call for ${keys.length} funds`);
    let amfiData = {};
    let workerFetchedAt = null; // declared outside try so accessible in Steps 2+3
    try {
      const r = await fetch(`https://amfi-latest-nav.mfnav.workers.dev/nav?codes=${codes}`);
      if (!r.ok) throw new Error('Cloudflare error ' + r.status);
      const raw = await r.json();
      workerFetchedAt = raw.fetchedAt || null;
      amfiData = Object.fromEntries(Object.entries(raw).filter(([k]) => k !== 'fetchedAt'));
      console.log(`[fetchNAV] Step1 done in ${(performance.now()-t0).toFixed(0)}ms`);
      if (workerFetchedAt) console.log(`[fetchNAV] AMFI fetchedAt: ${workerFetchedAt}`);
    } catch(e) {
      console.error('[fetchNAV] Step1 FAILED:', e.message, '— falling back to mfapi');
    }

    // ── STEP 2: Update navData in memory + save nav_cache to Supabase ────────────
    // Convert AMFI date "16-Jul-2026" → "16-07-2026" (DD-MM-YYYY for app consistency)
    const MONTHS = {Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12'};
    function amfiDateToAppDate(d) {
      // "16-Jul-2026" → "16-07-2026"
      if (!d) return d;
      const parts = d.split('-');
      if (parts.length === 3 && isNaN(parts[1])) {
        return `${parts[0]}-${MONTHS[parts[1]] || parts[1]}-${parts[2]}`;
      }
      return d; // already DD-MM-YYYY or unknown
    }

    let fetchedAtDisplay = ''; // for status bar display
    // workerFetchedAt is set from the Cloudflare response (top-level field)
    for (const [key, fund] of Object.entries(MF_FUNDS)) {
      const amfi = amfiData[fund.code];
      if (!amfi || amfi.error) {
        console.warn(`[fetchNAV] ${key}: not in AMFI response`);
        continue;
      }
      const latestNav  = parseFloat(amfi.nav);
      const latestDate = amfiDateToAppDate(amfi.date); // DD-MM-YYYY
      if (!fetchedAtDisplay && workerFetchedAt) {
        // Show IST time from worker fetchedAt (top-level field)
        const dt = new Date(workerFetchedAt);
        const ist = new Date(dt.getTime() + (5.5*60*60*1000));
        const dd=String(ist.getUTCDate()).padStart(2,'0'),mm=String(ist.getUTCMonth()+1).padStart(2,'0'),yyyy=ist.getUTCFullYear();
        const hh=ist.getUTCHours(),min=String(ist.getUTCMinutes()).padStart(2,'0'),ampm=hh>=12?'PM':'AM',hh12=String(hh%12||12).padStart(2,'0');
        fetchedAtDisplay = `${dd}-${mm}-${yyyy}, ${hh12}:${min} ${ampm}`;
      }
      newDb.navData[key] = { nav: latestNav, date: latestDate };
      console.log(`[fetchNAV] ${key}: NAV=${latestNav} date=${latestDate}`);
      // Save nav_cache — dbSaveNavCache converts DD-MM-YYYY → YYYY-MM-DD internally
      dbSaveNavCache(fund.code, latestNav, latestDate, workerFetchedAt);
    }
    console.log(`[fetchNAV] Step2 nav_cache saved in ${(performance.now()-t0).toFixed(0)}ms`);

    // ── STEP 3: Per fund — check nav_history gap, fetch from mfapi only if needed ─
    // Uses latestDate from AMFI (Step2) vs dbLatestDate from nav_history table
    if (statusEl) statusEl.textContent = 'Checking history...';
    console.log(`[fetchNAV] Step3: history gap check`);
    await Promise.all(
      Object.entries(MF_FUNDS).map(async ([key, fund]) => {
        const latestDate = newDb.navData[key]?.date;
        if (!latestDate) return; // AMFI didn't return this fund
        // Convert DD-MM-YYYY → YYYY-MM-DD for comparison with nav_history dateStr
        const [dd,mm,yyyy] = latestDate.split('-');
        const mfapiLatestDateStr = `${yyyy}-${mm}-${dd}`;
        const ts = performance.now();
        const dbLatestDate = await dbGetLatestNavDate(fund.code);
        console.log(`[fetchNAV] ${key}: dbLatest=${dbLatestDate??'EMPTY'} amfiLatest=${mfapiLatestDateStr}`);
        if (dbLatestDate === mfapiLatestDateStr) {
          console.log(`[fetchNAV] ${key}: UP TO DATE — skip mfapi`);
          return;
        }
        // Gap or empty — fetch full history from mfapi (only way to get history)
        console.log(`[fetchNAV] ${key}: fetching history from mfapi...`);
        try {
          const r = await fetch(`https://api.mfapi.in/mf/${fund.code}`);
          const j = await r.json();
          if (!j.data?.length) return;
          // Update name/category from mfapi meta
          const rawCat = j.meta?.scheme_category || j.meta?.scheme_type || '';
          const cat = normalizeFundCategory(rawCat, MF_FUNDS[key]?.fullName||'');
          fundMetaCache[key] = { fundHouse: j.meta?.fund_house||'', schemeCategory: cat };
          // Name/fullName not rebuilt here — already set correctly at Add Fund time
          if (MF_FUNDS[key] && cat) {
            MF_FUNDS[key].category = cat;
            if (newDb.customFunds) newDb.customFunds.forEach(f=>{if(f.key===key)f.data.category=cat;});
            dbUpdateFund(fund.code, { category: cat });
          }
          const allEntries = parseMFData(j.data);
          if (!dbLatestDate) {
            // DB empty — save full history
            const entries = allEntries.map(d => ({ dateStr: d.dateStr, nav: d.nav }));
            navHistoryCache[key] = allEntries;
            newDb.navHistory[key] = entries;
            console.log(`[fetchNAV] ${key}: DB EMPTY — saving ${entries.length} rows (${(performance.now()-ts).toFixed(0)}ms)`);
            await dbSaveNavHistory(fund.code, entries);
          } else {
            // Save only missing rows
            const newEntries = allEntries.filter(d => d.dateStr > dbLatestDate).map(d => ({ dateStr: d.dateStr, nav: d.nav }));
            if (newEntries.length) {
              navHistoryCache[key] = navHistoryCache[key]
                ? [...navHistoryCache[key], ...newEntries.map(d => ({ ...d, date: new Date(d.dateStr) }))]
                : allEntries;
              newDb.navHistory[key] = [...(newDb.navHistory[key] || []), ...newEntries];
              console.log(`[fetchNAV] ${key}: saving ${newEntries.length} new rows (${newEntries[0].dateStr}→${newEntries[newEntries.length-1].dateStr}) (${(performance.now()-ts).toFixed(0)}ms)`);
              await dbSaveNavHistory(fund.code, newEntries);
            } else {
              // mfapi hasn't updated yet for the expected date
              const mfapiActualLatest = allEntries.length ? allEntries[allEntries.length-1].dateStr : 'unknown';
              console.log(`[fetchNAV] ${key}: mfapi doesn't have missing data yet (mfapi latest=${mfapiActualLatest}, expected=${mfapiLatestDateStr}) — will retry on next refresh`);
            }
          }
        } catch(e) { console.error(`[fetchNAV] ${key} mfapi ERROR:`, e.message); }
      })
    );
    console.log(`[fetchNAV] Step3 done in ${(performance.now()-t0).toFixed(0)}ms`);

    // ── STEP 3.5: Sync nav_cache into nav_history for each fund ──────────────────
    // Saves today's AMFI NAV as a nav_history row so:
    // 1. Chart shows today's NAV immediately (no wait for mfapi)
    // 2. Nav_history always has same date as nav_cache after this step
    // 3. Stale check becomes simple: nav_history latest === nav_cache max
    // Uses upsert — safe to call every time, no duplicates
    for (const [key, fund] of Object.entries(MF_FUNDS)) {
      const navEntry = newDb.navData[key];
      if (!navEntry?.nav || !navEntry?.date) continue;
      // Convert DD-MM-YYYY to YYYY-MM-DD for nav_history dateStr
      const [dd,mm,yyyy] = navEntry.date.split('-');
      const dateStr = `${yyyy}-${mm}-${dd}`;
      const navVal = navEntry.nav;
      // Update navHistoryCache with today's entry
      const existing = navHistoryCache[key];
      if (existing) {
        const last = existing[existing.length-1];
        if (last.dateStr !== dateStr) {
          // Add today's entry to cache
          navHistoryCache[key] = [...existing, { dateStr, date: new Date(dateStr), nav: navVal }];
          newDb.navHistory[key] = [...(newDb.navHistory[key]||[]), { dateStr, nav: navVal }];
        }
      }
      // Save to nav_history table (upsert — no duplicates)
      dbSaveNavHistory(fund.code, [{ dateStr, nav: navVal }]);
    }
    console.log(`[fetchNAV] Step3.5: nav_cache synced to nav_history`);

    // ── STEP 4: ONE state update — load app with fresh nav + history ─────────────
    newDb.navDate = new Date().toLocaleDateString('en-IN');
    set({ db: newDb, tick: get().tick + 1 });
    if (btnEl)    { btnEl.textContent = '↻'; btnEl.disabled = false; }
    // Show AMFI fetch time in status bar
    const statusElF = document.getElementById('nav-status');
    // Pick latest nav date among all funds (some funds update later than others)
    const toYMD = d => { if(!d)return''; const p=d.split('-'); return p[0].length===4?d:`${p[2]}-${p[1]}-${p[0]}`; };
    const displayDate = Object.values(newDb.navData).reduce((best,cur)=>{
      return toYMD(cur?.date||'') > toYMD(best||'') ? cur.date : best;
    }, '') || '';
    const statusText  = displayDate
      ? `NAV: ${displayDate}${fetchedAtDisplay ? ' · ' + fetchedAtDisplay : ''}`
      : 'Loaded';
    if (statusElF) statusElF.textContent = statusText;
    console.log(`[fetchNAV] DONE — total ${(performance.now()-t0).toFixed(0)}ms | status: ${statusText}`);
  },

  async loadNavHistory(key) {
    // Already in memory — return immediately (no re-render, no network)
    if (navHistoryCache[key]) return navHistoryCache[key];
    // Try Supabase first
    const fund = MF_FUNDS[key];
    if (fund?.code) {
      const rows = await dbLoadNavHistory(fund.code);
      if (rows?.length) {
        navHistoryCache[key] = rows.map(d => ({ ...d, date: new Date(d.dateStr) }));
        return navHistoryCache[key];
      }
    }
    // Not in DB — fetch from mfapi.in
    try {
      const r = await fetch(`https://api.mfapi.in/mf/${fund?.code}`);
      const j = await r.json();
      if (j.data && j.data.length) {
        navHistoryCache[key] = parseMFData(j.data);
        // Save to Supabase silently — NO set() call = zero React re-renders
        const entries = navHistoryCache[key].map(d=>({dateStr:d.dateStr,nav:d.nav}));
        dbSaveNavHistory(fund.code, entries);
        return navHistoryCache[key];
      }
    } catch(e) {}
    return null;
  },

  async saveTx(key, txData, editIdx, silent=false) {
    if (!isLoggedIn()) { notLoggedInAlert(); return; }
    const db = get().db;
    const fund = MF_FUNDS[key];
    const txs = [...(db.mf[key]?.transactions||[])];
    if (editIdx != null) {
      const existing = txs[editIdx];
      const savedId = await dbSaveTx(fund.code, { ...txData, _id: existing._id });
      txs[editIdx] = { ...txData, _id: savedId ?? existing._id };
    } else {
      const savedId = await dbSaveTx(fund.code, txData);
      txs.push({ ...txData, _id: savedId });
    }
    if (silent) return; // bulk import — caller does ONE reload at end
    txs.sort((a,b) => a.date.localeCompare(b.date));
    const newDb = { ...db, mf: { ...db.mf, [key]: { ...db.mf[key], transactions: txs } } };
    get().saveAndRefresh(newDb);
  },

  async deleteTx(key, idx) {
    if (!isLoggedIn()) { notLoggedInAlert(); return; }
    const db = get().db;
    const txs = [...(db.mf[key]?.transactions||[])];
    const tx = txs[idx];
    if (tx?._id) await dbDeleteTx(tx._id);
    txs.splice(idx, 1);
    const newDb = { ...db, mf: { ...db.mf, [key]: { ...db.mf[key], transactions: txs } } };
    get().saveAndRefresh(newDb);
  },

  async addFund(key, fundData, navDataEntry, navHistArr, silent=false) {
    if (!isLoggedIn()) { notLoggedInAlert(); return; }
    MF_FUNDS[key] = fundData;
    // Persist fund row to Supabase
    await dbAddFund({ ...fundData, key });
    if (navDataEntry) dbSaveNavCache(fundData.code, navDataEntry.nav, navDataEntry.date);
    if (navHistArr) {
      navHistoryCache[key] = navHistArr.map(d=>({...d,date:new Date(d.dateStr)}));
      dbSaveNavHistory(fundData.code, navHistArr);
    }
    if (silent) return; // bulk import — caller does ONE reload at end
    const db = get().db;
    const newDb = {
      ...db,
      mf: { ...db.mf, [key]: db.mf[key]||{transactions:[]} },
      navData: { ...db.navData },
      navHistory: { ...(db.navHistory||{}) },
      customFunds: [...(db.customFunds||[]).filter(f=>f.key!==key), {key, data:fundData}],
    };
    if (navDataEntry) newDb.navData[key] = navDataEntry;
    if (navHistArr) newDb.navHistory[key] = navHistArr;
    get().saveAndRefresh(newDb);
    get().setPage(key); // drives URL via navigate
  },

  async deleteFund(key) {
    if (!isLoggedIn()) { notLoggedInAlert(); return; }
    const fund = MF_FUNDS[key];
    delete MF_FUNDS[key]; delete navHistoryCache[key];
    if (fund?.code) await dbDeleteFund(fund.code);
    const db = get().db;
    const newDb = { ...db, mf: {...db.mf}, navData: {...db.navData}, navHistory: {...(db.navHistory||{})},
      customFunds: (db.customFunds||[]).filter(f=>f.key!==key) };
    delete newDb.mf[key]; delete newDb.navData[key]; delete newDb.navHistory[key];
    const newPage = get().currentPage === key ? 'Dashboard' : get().currentPage;
    get().saveAndRefresh(newDb);
    get().setPage(newPage);
  },

  async updateFund(key, updates) {
    if (!isLoggedIn()) { notLoggedInAlert(); return; }
    if (MF_FUNDS[key]) Object.assign(MF_FUNDS[key], updates);
    const fund = MF_FUNDS[key];
    if (fund?.code) await dbUpdateFund(fund.code, updates);
    const db = get().db;
    const newDb = { ...db, customFunds: (db.customFunds||[]).map(f=>f.key===key?{...f,data:{...f.data,...updates}}:f) };
    get().saveAndRefresh(newDb);
  },

  // Exact HTML saveMFEdit: rename key, migrate all data, clean old key
  async renameFundKey(oldKey, newKey, ter) {
    if (!isLoggedIn()) { notLoggedInAlert(); return; }
    const db = get().db;
    // 1. Rename in MF_FUNDS — preserve insertion order
    const allKeys = Object.keys(MF_FUNDS);
    const tmp = {};
    allKeys.forEach(k => { tmp[k] = { ...MF_FUNDS[k] }; delete MF_FUNDS[k]; });
    allKeys.forEach(k => { MF_FUNDS[k === oldKey ? newKey : k] = tmp[k]; });
    if (MF_FUNDS[newKey]) MF_FUNDS[newKey].ter = ter;

    // 2. Persist key + ter change to Supabase (fund_code stays the same — only key label changes)
    const code = MF_FUNDS[newKey]?.code || db.customFunds?.find(f=>f.key===oldKey)?.data?.code;
    if (code) await dbUpdateFund(code, { key: newKey, ter });

    // 3. Migrate in-memory db — deep copy to avoid mutation
    const newDb = {
      ...db,
      mf: { ...db.mf },
      navData: { ...(db.navData||{}) },
      navHistory: { ...(db.navHistory||{}) },
      customFunds: (db.customFunds||[]).map(f => {
        if (f.key !== oldKey) return f;
        return { key: newKey, data: { ...f.data, ter } };
      }),
    };
    // Move in-memory buckets to new key label
    if (newDb.mf[oldKey]) { newDb.mf[newKey] = newDb.mf[oldKey]; delete newDb.mf[oldKey]; }
    if (newDb.navData[oldKey]) { newDb.navData[newKey] = newDb.navData[oldKey]; delete newDb.navData[oldKey]; }
    if (newDb.navHistory[oldKey]) { newDb.navHistory[newKey] = newDb.navHistory[oldKey]; delete newDb.navHistory[oldKey]; }
    if (navHistoryCache[oldKey]) { navHistoryCache[newKey] = navHistoryCache[oldKey]; delete navHistoryCache[oldKey]; }

    // 4. Update currentPage if viewing renamed fund
    const currentPage = get().currentPage;
    const newPage = currentPage === oldKey ? newKey : currentPage;

    get().saveAndRefresh(newDb);
    get().setPage(newPage);
  },
}));

export default useAppStore;
