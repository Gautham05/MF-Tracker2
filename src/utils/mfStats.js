import { MF_FUNDS, navHistoryCache } from '../constants/funds.js';

export function getMFStats(key, db) {
  const txs=db.mf[key]?.transactions||[];const nv=db.navData[key];const cNav=nv?.nav||0;
  let tu=0,ti=0,tr=0,tuAmt=0;
  txs.forEach(t=>{if(t.type==='Invested'){tu+=parseFloat(t.units||0);ti+=Math.round(parseFloat(t.amount||0)+parseFloat(t.stamp||0));tuAmt+=parseFloat(t.amount||0);}else{tu-=parseFloat(t.units||0);tr+=parseFloat(t.amount||0);}});
  const cv=tu*cNav,gain=cv-ti+tr,gp=ti?(gain/ti*100):0,avgNav=tu>0?tuAmt/tu:0;
  return{totalUnits:tu,totalInvested:ti,totalRedeemed:tr,currentValue:cv,gain,gainPct:gp,currentNAV:cNav,avgNav,navDate:nv?.date||'--'};
}

export function filterByTF(data, tf) {
  if(!data||!data.length)return[];
  const last=data[data.length-1].date,cut=new Date(last);
  if(tf==='1M')cut.setMonth(cut.getMonth()-1);else if(tf==='3M')cut.setMonth(cut.getMonth()-3);
  else if(tf==='6M')cut.setMonth(cut.getMonth()-6);else if(tf==='1Y')cut.setFullYear(cut.getFullYear()-1);
  else if(tf==='3Y')cut.setFullYear(cut.getFullYear()-3);else if(tf==='5Y')cut.setFullYear(cut.getFullYear()-5);
  else cut.setFullYear(cut.getFullYear()-50);
  return data.filter(d=>d.date>=cut);
}

export function filterDatesByTF(dates, tf) {
  if(!dates||!dates.length)return[];
  const last=new Date(dates[dates.length-1]),cut=new Date(last);
  if(tf==='1M')cut.setMonth(cut.getMonth()-1);else if(tf==='3M')cut.setMonth(cut.getMonth()-3);
  else if(tf==='6M')cut.setMonth(cut.getMonth()-6);else if(tf==='1Y')cut.setFullYear(cut.getFullYear()-1);
  else if(tf==='3Y')cut.setFullYear(cut.getFullYear()-3);else if(tf==='5Y')cut.setFullYear(cut.getFullYear()-5);
  else cut.setFullYear(cut.getFullYear()-50);
  const cutStr=cut.toISOString().split('T')[0];
  return dates.filter(d=>d>=cutStr);
}

// Convert DD-MM-YYYY or YYYY-MM-DD to YYYY-MM-DD for comparison
function toYMD(d){if(!d)return'';const p=d.split('-');return p[0].length===4?d:`${p[2]}-${p[1]}-${p[0]}`;}

export function _getMaxNavDate(db) {
  // Max nav_cache date (AMFI) = source of truth for latest NAV date
  // After Step 3.5 in fetchNAV, nav_history also has this date
  // Fallback to navHistoryCache if nav_cache not loaded yet
  let max='';
  if(db?.navData&&Object.keys(db.navData).length){
    Object.values(db.navData).forEach(v=>{const dt=toYMD(v?.date||'');if(dt>max)max=dt;});
    if(max)return max;
  }
  Object.keys(MF_FUNDS).forEach(k=>{const d=navHistoryCache[k];if(d&&d.length){const dt=d[d.length-1].dateStr;if(dt>max)max=dt;}});
  return max;
}

export function getDayChange(key, db) {
  const data=navHistoryCache[key];
  if(!data||data.length<2)return null;

  // ── STALE CHECK ───────────────────────────────────────────────────────────────
  // max = latest nav_cache date among ALL funds (AMFI source of truth)
  // thisLatest = this fund's nav_history latest date
  // After Step 3.5, nav_history always has today's AMFI date → single fixed case
  // A fund is stale if its nav_history latest < max nav_cache date
  const maxNavDate=_getMaxNavDate(db);
  const thisLatest=data[data.length-1].dateStr; // YYYY-MM-DD from navHistoryCache
  const gapDays=Math.round((new Date()-new Date(maxNavDate))/86400000);
  if(gapDays>5)return{navChg:0,navChgPct:0,portChg:0,portChgPct:0,curNav:data[data.length-1].nav,prevNav:data[data.length-1].nav,units:0,newMoney:0,stale:true};
  const isRecent=thisLatest===maxNavDate;
  if(!isRecent)return{navChg:0,navChgPct:0,portChg:0,portChgPct:0,curNav:data[data.length-1].nav,prevNav:data[data.length-1].nav,units:0,newMoney:0,stale:true};

  // ── SINGLE FIXED CASE ─────────────────────────────────────────────────────────
  // nav_history always has today's date (via Step 3.5 sync from nav_cache)
  // data[-1] = today's NAV, data[-2] = yesterday's NAV — always
  const curNav=data[data.length-1].nav;
  const prevNav=data[data.length-2].nav;
  const lastNavDate=data[data.length-1].dateStr; // YYYY-MM-DD

  // ── TRANSACTION ADJUSTMENT ────────────────────────────────────────────────────
  // Subtract units bought/sold today so day change reflects only held-before-today units
  const s=getMFStats(key,db);
  const txs=db.mf[key]?.transactions||[];
  // tx.date is DD-MM-YYYY — convert lastNavDate YYYY-MM-DD for comparison
  const p=lastNavDate.split('-');
  const lastNavDateTx=`${p[2]}-${p[1]}-${p[0]}`; // DD-MM-YYYY
  let units=s.totalUnits,newMoney=0;
  txs.forEach(t=>{if(t.date===lastNavDateTx){if(t.type==='Invested'){units-=parseFloat(t.units||0);newMoney+=Math.round(parseFloat(t.amount||0)+parseFloat(t.stamp||0));}else{units+=parseFloat(t.units||0);}}});
  units=Math.max(0,units);

  const navChg=curNav-prevNav,navChgPct=prevNav?(navChg/prevNav*100):0;
  const portChg=units*navChg,prevPortVal=units*prevNav;
  const portChgPct=prevPortVal>0?(portChg/prevPortVal*100):navChgPct;
  return{navChg,navChgPct,portChg,portChgPct,curNav,prevNav,units,newMoney};
}

export function getDayChangeAll(db) {
  let total=0;Object.keys(MF_FUNDS).forEach(k=>{const d=getDayChange(k,db);if(d)total+=d.portChg;});return total;
}
