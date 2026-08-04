export const MF_FUNDS = {};
export const navHistoryCache = {};
export const fundMetaCache = {};

export const AMC_LOGO_MAP = {
  // Specific multi-word matches first (longer = higher priority)
  'kotak mahindra':'kotak',
  'parag parikh':'ppfas','nippon india':'reliance','aditya birla sun life':'birla','aditya birla':'birla',
  'canara robeco':'canara','franklin templeton':'franklin','motilal oswal':'motilal','mahindra manulife':'mahindra',
  'jm financial':'jm','bajaj finserv':'bajaj','baroda bnp paribas':'barodabnpparibasmutualfund',
  'bank of india':'boi','white oak':'whiteoak','whiteoak':'whiteoak','360 one':'iifl','old bridge':'old',
  'angel one':'angel','jio blackrock':'jioblackrock','mirae asset':'mirae','icici prudential':'icici',
  'pgim india':'dhfl','ppfas':'ppfas','kotak':'kotak','reliance':'reliance','nippon':'reliance',
  'navi':'navi','motilal':'motilal','hdfc':'hdfc','icici':'icici','sbi':'sbi','axis':'axis',
  'mirae':'mirae','dsp':'dsp','franklin':'franklin','birla':'birla','uti':'uti','tata':'tata',
  'bandhan':'bandhan','canara':'canara','invesco':'invesco','sundaram':'sundaram','edelweiss':'edelweiss',
  'pgim':'dhfl','quantum':'quantum','quant':'escorts','lic':'lic','union':'union','jm':'jm',
  'bajaj':'bajaj','groww':'indiabulls','zerodha':'zerodha','hsbc':'hsbc','mahindra':'mahindra',
  'baroda':'barodabnpparibasmutualfund','samco':'samco','trust':'trust','helios':'helios','nj':'nj',
};

export function getFundLogo(key) {
  const sources=[MF_FUNDS[key]?.amcName||'',MF_FUNDS[key]?.fullName||'',MF_FUNDS[key]?.name||''];
  const fh=sources.join(' ').toLowerCase();if(!fh.trim())return null;
  const keys=Object.keys(AMC_LOGO_MAP).sort((a,b)=>b.length-a.length);
  for(const k of keys){if(new RegExp('\\b'+k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b').test(fh))return'https://assets-netstorage.groww.in/mf-assets/logos/'+AMC_LOGO_MAP[k]+'_groww.png';}
  return null;
}

export function normalizeFundCategory(cat, fundName) {
  if (!cat) return '';
  // For vague/broken categories, reconstruct from fund name
  if (fundName && (cat === 'Income' || cat === 'Growth' || cat === 'Balanced')) {
    const fn = fundName.toLowerCase();
    if (/liquid/i.test(fn)) return 'Debt Scheme - Liquid Fund';
    if (/overnight/i.test(fn)) return 'Debt Scheme - Overnight Fund';
    if (/gilt/i.test(fn)) return 'Debt Scheme - Gilt Fund';
    if (/money market/i.test(fn)) return 'Debt Scheme - Money Market Fund';
    if (/ultra short/i.test(fn)) return 'Debt Scheme - Ultra Short Duration Fund';
    if (/short dur/i.test(fn)) return 'Debt Scheme - Short Duration Fund';
    if (/credit risk/i.test(fn)) return 'Debt Scheme - Credit Risk Fund';
    if (/corporate bond/i.test(fn)) return 'Debt Scheme - Corporate Bond Fund';
    if (/arbitrage/i.test(fn)) return 'Hybrid Scheme - Arbitrage Fund';
    if (/balanced/i.test(fn)) return 'Hybrid Scheme - Balanced Hybrid Fund';
    if (/large.*mid/i.test(fn)) return 'Equity Scheme - Large & Mid Cap Fund';
    if (/multi.*cap/i.test(fn)) return 'Equity Scheme - Multi Cap Fund';
    if (/flexi.*cap/i.test(fn)) return 'Equity Scheme - Flexi Cap Fund';
    if (/small.*cap/i.test(fn)) return 'Equity Scheme - Small Cap Fund';
    if (/mid.*cap/i.test(fn)) return 'Equity Scheme - Mid Cap Fund';
    if (/large.*cap/i.test(fn)) return 'Equity Scheme - Large Cap Fund';
    if (/elss|tax saver|tax saving/i.test(fn)) return 'Equity Scheme - ELSS';
    if (/index/i.test(fn)) return 'Other Scheme - Index Funds';
  }
  // Only fix vague/broken mfapi names — keep proper names as-is (pass-through)
  const map = {
    'Income': 'Debt Scheme - Income Fund',
    'Liquid': 'Debt Scheme - Liquid Fund',
    'Liquid Plan': 'Debt Scheme - Liquid Fund',
    'Gilt': 'Debt Scheme - Gilt Fund',
    'Balanced': 'Hybrid Scheme - Balanced Hybrid Fund',
    'Growth': 'Equity Scheme - Growth',
    'ELSS': 'Equity Scheme - ELSS',
    'Index Funds': 'Index Fund',
    'Fund of Funds': 'Fund of Funds',
  };
  return map[cat] || cat;
}

// ── Fund name builder ────────────────────────────────────────────────────────
const _IDCW_PREFIXES=['Daily','Weekly','Fortnightly','Monthly','Quarterly','Half-Yearly','Half Yearly','Semi Annual','Annual','Flexi','Periodic','Discretionary'];
function _firstOutsideDash(s){
  let depth=0;
  for(let i=0;i<s.length;i++){
    const ch=s[i];
    if(ch==='('||ch==='[')depth++;
    else if(ch===')'||ch===']')depth--;
    else if(ch==='-'&&depth===0)return i;
  }
  return -1;
}
export function buildStandardFullName(rawName) {
  if(!rawName)return '';
  const name=rawName.trim();
  // Normalize "Income Distribution cum Capital Withdrawal..." → IDCW
  const nameN=name.replace(/Income\s+Distribution\s+cum\s+Capital\s+With\w*/gi,'IDCW');
  // Find first dash outside brackets
  const d1=_firstOutsideDash(name);
  if(d1===-1)return name; // no dash → return raw
  // Extract base
  let base=name.slice(0,d1).trim();
  // 5-char rule: base too short → extend to next outside-dash
  if(base.length<5){
    const rest=name.slice(d1+1);
    const d2=_firstOutsideDash(rest);
    if(d2!==-1)base=name.slice(0,d1+1+d2).trim();
  }
  // Remove text-only brackets from base (no digits inside)
  base=base.replace(/\([^)0-9]*\)/g,'').replace(/\s*-\s*$/,'').trim();
  // Plan type
  const plan=/\bdirect\b/i.test(name)?'Direct Plan':'';
  // Option — search only AFTER the base to avoid base words false matching plan/option
  // base ends at either d1 or extended d2 position — find where base ends in original name
  const baseEnd=name.indexOf(base)+base.length;
  const after=nameN.slice(baseEnd).toUpperCase();
  let option='';
  if(after.includes('IDCW')){
    const pre=_IDCW_PREFIXES.find(p=>new RegExp('\\b'+p.toUpperCase().replace(/-/g,'[-\\s]')+'\\b').test(after));
    option=pre?pre+' IDCW':after.includes('REINVESTMENT')?'IDCW Reinvestment':after.includes('PAYOUT')?'IDCW Payout':'IDCW';
  } else if(after.includes('DIVIDEND')){
    const pre=_IDCW_PREFIXES.find(p=>new RegExp('\\b'+p.toUpperCase().replace(/-/g,'[-\\s]')+'\\b').test(after));
    option=pre?pre+' IDCW':'IDCW';
  } else if(after.includes('BONUS')){
    const pre=['Annual','Half-Yearly','Monthly','Quarterly'].find(p=>new RegExp('\\b'+p.toUpperCase().replace(/-/g,'[-\\s]')+'\\b').test(after));
    option=pre?pre+' Bonus':'Bonus';
  } else {
    option='Growth';
  }
  return [base,plan,option].filter(Boolean).join(' - ');
}
export function buildShortName(fullName) {
  if(!fullName)return '';
  // Base = everything before first outside-bracket dash in fullName
  const d=_firstOutsideDash(fullName);
  let base=d===-1?fullName:fullName.slice(0,d).trim();
  if(d!==-1&&base.length<5){
    const rest=fullName.slice(d+1);
    const d2=_firstOutsideDash(rest);
    if(d2!==-1)base=fullName.slice(0,d+1+d2).trim();
  }
  // Remove "Fund" at end
  let short=base.replace(/\s+Fund\s*$/i,'').trim();
  if(short.length>32)short=short.slice(0,30)+'…';
  return short;
}

export function parseMFData(data) {
  return data.map(d=>{const[dd,mm,yyyy]=d.date.split('-');return{date:new Date(`${yyyy}-${mm}-${dd}`),nav:parseFloat(d.nav),dateStr:`${yyyy}-${mm}-${dd}`};}).filter(d=>!isNaN(d.nav)).sort((a,b)=>a.date-b.date);
}

export function syncFundsFromDB(db) {
  // Returns array of {code, name, fullName} for funds that needed rebuild — caller saves to DB
  Object.keys(MF_FUNDS).forEach(k=>delete MF_FUNDS[k]);
  const toSave=[];
  if(db.customFunds)db.customFunds.forEach(f=>{
    if(f?.key&&f?.data){
      const missingName=!f.data.name||f.data.name.trim()==='';
      const missingFull=!f.data.fullName||f.data.fullName.trim()==='';
      if(missingName||missingFull){
        // Either or both missing — rebuild from whichever field has data
        const raw=f.data.fullName||f.data.name||'';
        const fn=buildStandardFullName(raw);
        const sn=buildShortName(fn);
        f.data.fullName=fn;
        f.data.name=sn;
        if(f.data.code)toSave.push({code:f.data.code,name:sn,fullName:fn});
      }
      MF_FUNDS[f.key]=f.data;
    }
  });
  return toSave; // useAppStore.initDB calls dbUpdateFund for each
}
