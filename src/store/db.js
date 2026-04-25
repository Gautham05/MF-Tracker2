const DB_KEY = 'mf_manage_v2.0';
export function loadDB() { try { const s=localStorage.getItem(DB_KEY); return s?JSON.parse(s):{navData:{},navDate:'',mf:{}}; } catch(e){return{navData:{},navDate:'',mf:{}};} }
export function saveDB(db) { try { db.savedAt=Date.now(); localStorage.setItem(DB_KEY,JSON.stringify(db)); } catch(e){} }