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

export function buildStandardFullName(rawName) {
  const name=rawName||'';
  const hasPlan=/direct\s*plan|regular\s*plan|[-\s]direct\s*$|[-\s]direct\s*[-\s]/i.test(name);
  const stdGrowth=/\bgrowth(\s*option)?\b/i.test(name);
  const stdIDCW=/\bidcw\b/i.test(name);
  const stdDividend=/\bdividend(\s+(payout|reinvest(ment)?))?(\s*[-,]|\s*$)/i.test(name)&&!/\b(monthly|quarterly|weekly|daily|annual|periodic|fortnightly)\s+dividend/i.test(name);
  const stdBonus=/\bbonus\b/i.test(name);
  if(!hasPlan||!(stdGrowth||stdIDCW||stdDividend||stdBonus))return name.replace(/\s+/g,' ').trim();
  const planType=/regular\s*plan/i.test(name)?'Regular Plan':'Direct Plan';
  const optionType=stdIDCW||stdDividend?'IDCW':stdBonus?'Bonus':'Growth';
  let base=name
    .replace(/\s*-?\s*direct\s*plan\s*-?\s*/gi,' ').replace(/\s*-?\s*regular\s*plan\s*-?\s*/gi,' ')
    .replace(/\s*-?\s*growth\s*(option)?\s*-?\s*/gi,' ').replace(/\s*-?\s*idcw\s*-?\s*/gi,' ')
    .replace(/\s*-?\s*dividend\s*(payout|reinvest)?\s*-?\s*/gi,' ').replace(/\s*-?\s*bonus\s*-?\s*/gi,' ')
    .replace(/\s*-?\s*payout\s*-?\s*/gi,' ').replace(/\bplan\b/gi,' ')
    .replace(/\s*-?\s*\bdirect\b\s*$/gi,'').replace(/\s*-?\s*\bregular\b\s*$/gi,'')
    .replace(/\s+/g,' ').trim();
  if(!/fund$/i.test(base))base+=' Fund';
  return base.replace(/\bfund\s+fund\b/gi,'Fund').trim()+' - '+planType+' - '+optionType;
}

export function parseMFData(data) {
  return data.map(d=>{const[dd,mm,yyyy]=d.date.split('-');return{date:new Date(`${yyyy}-${mm}-${dd}`),nav:parseFloat(d.nav),dateStr:`${yyyy}-${mm}-${dd}`};}).filter(d=>!isNaN(d.nav)).sort((a,b)=>a.date-b.date);
}

export function syncFundsFromDB(db) {
  Object.keys(MF_FUNDS).forEach(k=>delete MF_FUNDS[k]);
  if(db.customFunds)db.customFunds.forEach(f=>{
    if(f?.key&&f?.data){
      const fn=buildStandardFullName(f.data.fullName||f.data.name||'');
      let sn=fn.replace(/\s*-\s*Direct Plan\s*-\s*Growth$/,'').replace(/\s*-\s*Regular Plan\s*-\s*Growth$/,' (Reg)')
        .replace(/\s*-\s*Direct Plan\s*-\s*IDCW$/,' IDCW').replace(/\s*-\s*Regular Plan\s*-\s*IDCW$/,' IDCW (Reg)')
        .replace(/\s*Fund$/,'').replace(/\s+/g,' ').trim();
      if(/Regular Plan/i.test(fn)&&!/IDCW/i.test(fn)&&!sn.endsWith(' (Reg)'))sn+=' (Reg)';
      if(sn.length>32)sn=sn.slice(0,30)+'\u2026';
      f.data.name=sn;f.data.fullName=fn;MF_FUNDS[f.key]=f.data;
    }
  });
}
