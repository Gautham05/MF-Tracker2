export function calcTaxInfo(key, db) {
  const txs=(db.mf[key]?.transactions||[]).filter(t=>t.type==='Invested').map(t=>({...t,remaining:parseFloat(t.units||0),date:new Date(t.date)}));
  const cNav=db.navData[key]?.nav||0;const today=new Date();const ONE_YEAR=365*24*3600*1000;
  let ltcgUnits=0,ltcgInvested=0,stcgUnits=0,stcgInvested=0;
  txs.forEach(lot=>{const held=today-lot.date;const u=lot.remaining;const inv=parseFloat(lot.amount||0);
    if(held>=ONE_YEAR){ltcgUnits+=u;ltcgInvested+=inv;}else{stcgUnits+=u;stcgInvested+=inv;}});
  const ltcgCurVal=ltcgUnits*cNav,stcgCurVal=stcgUnits*cNav;
  const ltcgGain=ltcgCurVal-ltcgInvested,stcgGain=stcgCurVal-stcgInvested;
  const ltcgTax=Math.max(0,(ltcgGain-125000)*0.125);
  const stcgTax=stcgGain>0?stcgGain*0.20:0;
  return{ltcgUnits,ltcgInvested,ltcgCurVal,ltcgGain,ltcgTax,stcgUnits,stcgInvested,stcgCurVal,stcgGain,stcgTax};
}