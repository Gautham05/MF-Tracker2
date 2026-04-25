export function xirr(cashflows) {
  if(!cashflows||cashflows.length<2)return null;
  if(!cashflows.some(c=>c.amount<0)||!cashflows.some(c=>c.amount>0))return null;
  const dates=cashflows.map(c=>c.date),amounts=cashflows.map(c=>c.amount),d0=dates[0];
  const xnpv=r=>amounts.reduce((s,a,i)=>s+a/Math.pow(1+r,(dates[i]-d0)/(365*24*3600*1000)),0);
  const dxnpv=r=>amounts.reduce((s,a,i)=>{const t=(dates[i]-d0)/(365*24*3600*1000);return s-t*a/Math.pow(1+r,t+1);},0);
  let rate=0.1;
  for(let i=0;i<100;i++){const f=xnpv(rate),df=dxnpv(rate);if(Math.abs(df)<1e-10)break;const nr=rate-f/df;if(Math.abs(nr-rate)<1e-8){rate=nr;break;}rate=nr;if(rate<-0.999)rate=-0.999;}
  return isFinite(rate)&&!isNaN(rate)?rate:null;
}
export function calcXIRR(key,db) {
  const txs=db.mf[key]?.transactions||[];const navInfo=db.navData[key];const cNav=navInfo?.nav||0;
  if(!txs.length||cNav===0)return null;
  const cf=txs.map(t=>({amount:t.type==='Invested'?-Math.round(parseFloat(t.amount||0)+parseFloat(t.stamp||0)):parseFloat(t.amount||0),date:new Date(t.date)}));
  let tu=0;txs.forEach(t=>{if(t.type==='Invested')tu+=parseFloat(t.units||0);else tu-=parseFloat(t.units||0);});
  const cv=tu*cNav;if(cv<=0)return null;
  cf.push({amount:cv,date:new Date()});cf.sort((a,b)=>a.date-b.date);
  try{return xirr(cf);}catch(e){return null;}
}