import { create } from 'zustand';
import { loadDB, saveDB } from './db.js';
import { MF_FUNDS, navHistoryCache, fundMetaCache, syncFundsFromDB, normalizeFundCategory, parseMFData } from '../constants/funds.js';

const useAppStore = create((set, get) => ({
  db: loadDB(),
  currentPage: 'Dashboard',
  sidebarOpen: false,
  amtHidden: false,
  tick: 0,

  saveAndRefresh(updaterOrDb) {
    const newDb = typeof updaterOrDb === 'function' ? updaterOrDb({...get().db}) : updaterOrDb;
    saveDB(newDb);
    syncFundsFromDB(newDb);
    set({ db: newDb, tick: get().tick + 1 });
  },

  setPage(page) {
    set({ currentPage: page, sidebarOpen: false });
    // Exact HTML: main-content.scrollTop=0; window.scrollTo(0,0)
    setTimeout(()=>{
      const el = document.getElementById('main-content');
      if(el) el.scrollTop = 0;
      window.scrollTo(0,0);
    }, 0);
  },
  toggleSidebar() { set(s => ({ sidebarOpen: !s.sidebarOpen })); },
  closeSidebar() { set({ sidebarOpen: false }); },
  toggleAmtHidden() { set(s => ({ amtHidden: !s.amtHidden })); },

  async fetchNAV() {
    const keys = Object.keys(MF_FUNDS);
    if (!keys.length) return;
    // Exact HTML: update DOM directly — no React re-renders during fetch
    const btnEl = document.getElementById('nav-btn');
    const statusEl = document.getElementById('nav-status');
    if (btnEl) btnEl.textContent = '⌛ Loading...';
    if (btnEl) btnEl.disabled = true;
    if (statusEl) statusEl.textContent = 'Fetching...';
    const db = get().db;
    const newDb = { ...db, navData: { ...db.navData }, navHistory: { ...(db.navHistory||{}) } };
    let loaded = 0;
    // Fetch all funds — update ONLY navStatus during loop, NO state flush until all done
    for (const [key, fund] of Object.entries(MF_FUNDS)) {
      try {
        const r = await fetch(`https://api.mfapi.in/mf/${fund.code}`);
        const j = await r.json();
        if (j.data && j.data.length) {
          newDb.navData[key] = { nav: parseFloat(j.data[0].nav), date: j.data[0].date, meta: j.meta||{} };
          navHistoryCache[key] = parseMFData(j.data);
          newDb.navHistory[key] = navHistoryCache[key].map(d => ({ dateStr: d.dateStr, nav: d.nav }));
          const rawCat = j.meta?.scheme_category || j.meta?.scheme_type || '';
          const cat = normalizeFundCategory(rawCat, MF_FUNDS[key]?.fullName||'');
          fundMetaCache[key] = { fundHouse: j.meta?.fund_house||'', schemeCategory: cat };
          if (MF_FUNDS[key] && cat) {
            MF_FUNDS[key].category = cat;
            if (newDb.customFunds) newDb.customFunds.forEach(f => { if(f.key===key) f.data.category=cat; });
          }
          loaded++;
          // Update status text directly on DOM — no React re-render (exact HTML approach)
          const statusEl = document.getElementById('nav-status');
          if (statusEl) statusEl.textContent = `Funds ${loaded}/${keys.length}...`;
        }
      } catch(e) {}
    }
    // ONE single state update for everything — charts, page, status
    newDb.navDate = new Date().toLocaleDateString('en-IN');
    saveDB(newDb);
    const lastDate = Object.values(newDb.navData)[0]?.date || '';
    // ONE React state update — only db changes, no navStatus/navLoading = no extra re-renders
    set({ db: newDb, tick: get().tick+1 });
    // Update DOM directly for final status (exact HTML)
    const btnElF = document.getElementById('nav-btn');
    const statusElF = document.getElementById('nav-status');
    if (btnElF) { btnElF.textContent = '↻ Refresh NAV'; btnElF.disabled = false; }
    if (statusElF) statusElF.textContent = lastDate ? `NAV: ${lastDate}` : 'Loaded';
  },

  async loadNavHistory(key) {
    // Already in memory — return immediately (no re-render, no network)
    if (navHistoryCache[key]) return navHistoryCache[key];
    // In db from previous session — load synchronously (exact HTML loadNavHistory logic)
    const db = get().db;
    if (db.navHistory?.[key]?.length) {
      navHistoryCache[key] = db.navHistory[key].map(d => ({ ...d, date: new Date(d.dateStr) }));
      return navHistoryCache[key];
    }
    // Not available locally — fetch from network
    try {
      const r = await fetch(`https://api.mfapi.in/mf/${MF_FUNDS[key]?.code}`);
      const j = await r.json();
      if (j.data && j.data.length) {
        navHistoryCache[key] = parseMFData(j.data);
        // Save to localStorage directly — NO set() call = zero React re-renders
        // Charts read navHistoryCache directly, not from db.navHistory
        const currentDb = get().db;
        const updatedDb = { ...currentDb, navHistory: { ...(currentDb.navHistory||{}), [key]: navHistoryCache[key].map(d=>({dateStr:d.dateStr,nav:d.nav})) } };
        saveDB(updatedDb);
        // Update db ref silently so future loadDB() calls have the history
        // but do NOT call set() - no re-render
        return navHistoryCache[key];
      }
    } catch(e) {}
    return null;
  },

  saveTx(key, txData, editIdx) {
    const db = get().db;
    const txs = [...(db.mf[key]?.transactions||[])];
    if (editIdx != null) txs[editIdx] = txData; else txs.push(txData);
    txs.sort((a,b) => a.date.localeCompare(b.date));
    const newDb = { ...db, mf: { ...db.mf, [key]: { ...db.mf[key], transactions: txs } } };
    get().saveAndRefresh(newDb);
  },

  deleteTx(key, idx) {
    const db = get().db;
    const txs = [...(db.mf[key]?.transactions||[])];
    txs.splice(idx, 1);
    const newDb = { ...db, mf: { ...db.mf, [key]: { ...db.mf[key], transactions: txs } } };
    get().saveAndRefresh(newDb);
  },

  addFund(key, fundData, navDataEntry, navHistArr) {
    MF_FUNDS[key] = fundData;
    const db = get().db;
    const newDb = { ...db, mf: { ...db.mf, [key]: db.mf[key]||{transactions:[]} },
      navData: { ...db.navData }, navHistory: { ...(db.navHistory||{}) },
      customFunds: [...(db.customFunds||[]).filter(f=>f.key!==key), {key, data:fundData}] };
    if (navDataEntry) newDb.navData[key] = navDataEntry;
    if (navHistArr) { newDb.navHistory[key] = navHistArr; navHistoryCache[key] = navHistArr.map(d=>({...d,date:new Date(d.dateStr)})); }
    get().saveAndRefresh(newDb);
    set({ currentPage: key });
  },

  deleteFund(key) {
    delete MF_FUNDS[key]; delete navHistoryCache[key];
    const db = get().db;
    const newDb = { ...db, mf: {...db.mf}, navData: {...db.navData}, navHistory: {...(db.navHistory||{})},
      customFunds: (db.customFunds||[]).filter(f=>f.key!==key) };
    delete newDb.mf[key]; delete newDb.navData[key]; delete newDb.navHistory[key];
    const newPage = get().currentPage === key ? 'Dashboard' : get().currentPage;
    get().saveAndRefresh(newDb);
    set({ currentPage: newPage });
  },

  updateFund(key, updates) {
    if (MF_FUNDS[key]) Object.assign(MF_FUNDS[key], updates);
    const db = get().db;
    const newDb = { ...db, customFunds: (db.customFunds||[]).map(f=>f.key===key?{...f,data:{...f.data,...updates}}:f) };
    get().saveAndRefresh(newDb);
  },

  // Exact HTML saveMFEdit: rename key, migrate all data, clean old key
  renameFundKey(oldKey, newKey, ter) {
    const db = get().db;
    // 1. Rename in MF_FUNDS — preserve insertion order
    const allKeys = Object.keys(MF_FUNDS);
    const tmp = {};
    allKeys.forEach(k => { tmp[k] = { ...MF_FUNDS[k] }; delete MF_FUNDS[k]; });
    allKeys.forEach(k => { MF_FUNDS[k === oldKey ? newKey : k] = tmp[k]; });
    if (MF_FUNDS[newKey]) MF_FUNDS[newKey].ter = ter;

    // 2. Migrate db — deep copy to avoid mutation
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
    // Move transactions
    if (newDb.mf[oldKey]) { newDb.mf[newKey] = newDb.mf[oldKey]; delete newDb.mf[oldKey]; }
    // Move navData
    if (newDb.navData[oldKey]) { newDb.navData[newKey] = newDb.navData[oldKey]; delete newDb.navData[oldKey]; }
    // Move navHistory
    if (newDb.navHistory[oldKey]) { newDb.navHistory[newKey] = newDb.navHistory[oldKey]; delete newDb.navHistory[oldKey]; }
    // Move navHistoryCache (in-memory)
    if (navHistoryCache[oldKey]) { navHistoryCache[newKey] = navHistoryCache[oldKey]; delete navHistoryCache[oldKey]; }

    // 3. Update currentPage if viewing renamed fund
    const currentPage = get().currentPage;
    const newPage = currentPage === oldKey ? newKey : currentPage;

    get().saveAndRefresh(newDb);
    set({ currentPage: newPage });
  },
}));

export default useAppStore;
