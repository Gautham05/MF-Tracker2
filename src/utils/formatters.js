export const _fIN_raw = n => Math.round(parseFloat(n||0)).toLocaleString('en-IN',{maximumFractionDigits:0});
export const fIN = n => window._amtHidden ? '••••' : _fIN_raw(n);
export const fmtDate = s => { if(!s||s==='--')return s; const p=s.split('-'); return p.length===3&&p[0].length===4?p[2]+'-'+p[1]+'-'+p[0]:s; };
export const fINd = n => { const v=parseFloat(n||0); const d=v.toString().split('.')[1]; const dec=d?Math.min(d.length,4):2; return v.toLocaleString('en-IN',{minimumFractionDigits:dec,maximumFractionDigits:4}); };