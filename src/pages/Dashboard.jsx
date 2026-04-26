import React, { useState, useEffect } from 'react';
import useAppStore from '../store/useAppStore.js';
import { MF_FUNDS, navHistoryCache, getFundLogo } from '../constants/funds.js';
import { getMFStats, getDayChange, getDayChangeAll } from '../utils/mfStats.js';
import { calcXIRR } from '../utils/xirr.js';
import { calcTaxInfo } from '../utils/taxCalc.js';
import { fIN } from '../utils/formatters.js';
import PortfolioValueChart from '../components/charts/PortfolioValueChart.jsx';
import AllocationChart from '../components/charts/AllocationChart.jsx';
import XIRRChart from '../components/charts/XIRRChart.jsx';
import ReturnsChart from '../components/charts/ReturnsChart.jsx';

function computePortXIRR(allCF) {
  if(!allCF||allCF.length<2)return null;
  if(!allCF.some(c=>c.amount<0)||!allCF.some(c=>c.amount>0))return null;
  const d0=allCF[0].date;
  const xnpv=rate=>allCF.reduce((s,c)=>s+c.amount/Math.pow(1+rate,(c.date-d0)/(365*24*3600*1000)),0);
  const dxnpv=rate=>allCF.reduce((s,c)=>{const t=(c.date-d0)/(365*24*3600*1000);return s-t*c.amount/Math.pow(1+rate,t+1);},0);
  let rate=0.1;
  for(let i=0;i<100;i++){const f=xnpv(rate),df=dxnpv(rate);if(Math.abs(df)<1e-10)break;const nr=rate-f/df;if(Math.abs(nr-rate)<1e-8){rate=nr;break;}rate=nr;if(rate<-0.999)rate=-0.999;}
  return isFinite(rate)&&!isNaN(rate)?rate:null;
}

export default function Dashboard() {
  // Selective subscriptions - only re-render when these specific fields change
  const db = useAppStore(s => s.db);
  const setPage = useAppStore(s => s.setPage);
  const amtHidden = useAppStore(s => s.amtHidden);
  const [chartPage,setChartPage]=useState(0);
  const keys=Object.keys(MF_FUNDS);

  // Pre-load nav history for all funds from db (localStorage) — instant, no network
  // Pre-load all nav histories then trigger ONE re-render for charts
  useEffect(()=>{
    let cancelled=false;
    async function preload(){
      // Skip if auto-fetch is running after import (fetchNAV handles everything)
      if(localStorage.getItem('mft_auto_nav')==='1')return;
      // Check if any fund is missing from cache (not pre-populated by main.jsx)
      const missing=keys.filter(k=>!navHistoryCache[k]);
      if(!missing.length)return; // All already in cache — no render needed
      for(const k of missing){
        if(cancelled)break;
        await loadNavHistory(k);
      }
      // ONE state update only if we actually loaded something new
      if(!cancelled) setHistLoaded(v=>v+1);
    }
    preload();
    return ()=>{cancelled=true;};
  },[keys.join(',')]);
  const hide=v=>amtHidden?'••••':v;

  // Totals
  let tInv=0,tCur=0;
  keys.forEach(k=>{const s=getMFStats(k,db);tInv+=s.totalInvested;tCur+=s.currentValue;});
  const pl=tCur-tInv,plPct=tInv?(pl/tInv*100):0;

  // Portfolio XIRR
  let allCF=[];
  keys.forEach(k=>{
    const txs=db.mf[k]?.transactions||[];
    txs.forEach(tx=>allCF.push({amount:tx.type==='Invested'?-parseFloat(tx.amount||0):parseFloat(tx.amount||0),date:new Date(tx.date)}));
    const s=getMFStats(k,db);if(s.currentValue>0)allCF.push({amount:s.currentValue,date:new Date()});
  });
  allCF.sort((a,b)=>a.date-b.date);
  let portXIRR=null;
  try{portXIRR=computePortXIRR(allCF);}catch(e){}

  // Day change
  const portDayChg=getDayChangeAll(db);
  let _prevPortVal=0,_anyStale=false;
  keys.forEach(k=>{const d=getDayChange(k,db);if(d){if(d.stale)_anyStale=true;else _prevPortVal+=d.units*d.prevNav;}});
  const _pdPct=_prevPortVal>0?(portDayChg/_prevPortVal*100):0;
  const _updatedCount=keys.filter(k=>{const d=getDayChange(k,db);return d&&!d.stale;}).length;

  // Tax totals
  const totalLTCG=keys.reduce((s,k)=>s+calcTaxInfo(k,db).ltcgGain,0);
  const totalSTCG=keys.reduce((s,k)=>s+calcTaxInfo(k,db).stcgGain,0);
  const totalLTCGTax=Math.max(0,(totalLTCG-125000)*0.125);
  const totalSTCGTax=totalSTCG>0?totalSTCG*0.20:0;
  const ltcgInv=keys.reduce((s,k)=>s+calcTaxInfo(k,db).ltcgInvested,0);
  const ltcgCur=keys.reduce((s,k)=>s+calcTaxInfo(k,db).ltcgCurVal,0);
  const stcgInv=keys.reduce((s,k)=>s+calcTaxInfo(k,db).stcgInvested,0);
  const stcgCur=keys.reduce((s,k)=>s+calcTaxInfo(k,db).stcgCurVal,0);

  return (
    <div>
      <div className="ph"><div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}><div className="pt">◎ Portfolio Dashboard</div></div></div>

      {/* ROW 1: METRICS */}
      <div className="metrics">
        <div className="mc"><div className="mcl">Total Invested</div><div className="mcv">{hide('₹'+fIN(tInv))}</div></div>
        <div className="mc"><div className="mcl">Current Value</div><div className="mcv">{hide('₹'+fIN(tCur))}</div></div>
        <div className="mc"><div className="mcl">Total Return</div><div className={`mcv ${pl>=0?'up':'dn'}`}>{hide((pl>=0?'+':'-')+'₹'+fIN(Math.abs(pl))+' ('+(pl>=0?'+':'-')+Math.abs(plPct).toFixed(2)+'%)')}</div></div>
        <div className="mc"><div className="mcl">Portfolio XIRR</div><div className={`mcv ${portXIRR!=null?(portXIRR>=0?'up':'dn'):'gold'}`}>{portXIRR!=null?((portXIRR*100).toFixed(2)+'% p.a.'):'N/A'}</div></div>
        <div className="mc" style={{borderColor:portDayChg>=0?'#1e4a2a':'#4a1e1e'}}>
          <div className="mcl">Day Change <span style={{fontSize:9,color:'#7080a0'}}>{_updatedCount}/{keys.length}</span></div>
          <div className={`mcv ${portDayChg>=0?'up':'dn'}`}>{hide((portDayChg>=0?'+':'-')+'₹'+fIN(Math.abs(portDayChg))+' ('+(_pdPct>=0?'+':'-')+Math.abs(_pdPct).toFixed(2)+'%)')}</div>
        </div>
        <div className="mc"><div className="mcl">Funds</div><div className="mcv">{keys.length}</div></div>
      </div>

      {/* ROW 2: 3-col: Allocation Pie | XIRR bar | Returns bar */}
      {keys.length>0&&(
        <div className="dash-3col" style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14,marginBottom:16}}>
          <div className="cc" style={{marginBottom:0}}>
            <div className="cct">Allocation by Fund (Invested Value)</div>
            <div style={{position:'relative',height:240}}>
              <AllocationChart db={db} amtHidden={amtHidden} key="dash-pie"/>
            </div>
          </div>
          <div className="cc" style={{marginBottom:0,display:'flex',flexDirection:'column'}}>
            <XIRRChart db={db} page={chartPage} onPageChange={setChartPage} key="dash-xirr"/>
          </div>
          <div className="cc" style={{marginBottom:0,display:'flex',flexDirection:'column'}}>
            <ReturnsChart db={db} page={chartPage} onPageChange={setChartPage} key="dash-ret"/>
          </div>
        </div>
      )}
      {keys.length>0&&<div style={{height:14}}/>}

      {/* ROW 3: PORTFOLIO VALUE CHART */}
      {keys.length>0&&(
        <PortfolioValueChart canvasId="dash-pvc" keys={keys} db={db} amtHidden={amtHidden} key="dash-pvc"/>
      )}

      {/* ROW 4: FUND OVERVIEW CARDS */}
      {keys.length>0&&(
        <>
          <div style={{fontSize:10,color:'#6b7a9a',marginBottom:10,fontWeight:600,letterSpacing:'0.5px'}}>FUND OVERVIEW</div>
          <div className="ov-grid">
            {keys.map(k=>{
              const s=getMFStats(k,db),f=MF_FUNDS[k],kx=calcXIRR(k,db);
              const dc=getDayChange(k,db);
              const retColor=s.gain>=0?'#34d399':'#f87171';
              const xirrColor=kx!=null?(kx>=0?'#34d399':'#f87171'):'#6b7a9a';
              const dcStr=!dc?'--':dc.stale?'NAV not updated':(dc.portChg>=0?'+':'-')+'₹'+fIN(Math.abs(dc.portChg))+' ('+(dc.portChg>=0?'+':'-')+Math.abs(dc.portChgPct||dc.navChgPct).toFixed(2)+'%)';
              const dcColor=!dc?'#7080a0':dc.stale?'#4a5570':(dc.portChg>=0?'#34d399':'#f87171');
              const logo=getFundLogo(k);
              return(
                <div key={k} className="fc" onClick={()=>setPage(k)}>
                  <div className="fcn">
                    <div className="fca" style={{background:f.color}}>{k[0]}</div>
                    {k}
                  </div>
                  <div className="fcf">{f.name}</div>
                  <div className="sr"><span>Invested</span><b>{hide('₹'+fIN(s.totalInvested))}</b></div>
                  <div className="sr"><span>Current</span><b>{hide('₹'+fIN(s.currentValue))}</b></div>
                  <div className="sr"><span>Return</span><b style={{color:retColor}}>{hide((s.gain>=0?'+':'')+'₹'+fIN(Math.abs(s.gain))+' ('+s.gainPct.toFixed(2)+'%)')}</b></div>
                  <div className="sr"><span>XIRR</span><b style={{color:xirrColor,fontWeight:700}}>{kx!=null?((kx*100).toFixed(2)+'% p.a.'):'N/A'}</b></div>
                  <div className="sr"><span>Day Change</span><b style={{color:dcColor}}>{hide(dcStr)}</b></div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ROW 5: TAX SUMMARY */}
      {keys.length>0&&(
        <div className="tax-section">
          <div className="tax-title">🏛 Portfolio Tax Summary</div>
          <div className="tax-grid">
            <div className="tax-card">
              <div className="tax-label"><span className="tax-badge-lt">LTCG</span> Long Term Gains (&gt;1 year) — all funds<span style={{fontSize:9,color:'#4a5570',marginLeft:6}}>12.5% tax above ₹1.25L</span></div>
              <div className={`tax-val ${totalLTCG>0?'up-text':totalLTCG<0?'dn-text':'neutral-text'}`}>{totalLTCG>0?'+₹'+fIN(totalLTCG):totalLTCG<0?'-₹'+fIN(Math.abs(totalLTCG)):'₹0'}</div>
              <div className="tax-sub">Invested: {hide('₹'+fIN(ltcgInv))} → Current: {hide('₹'+fIN(ltcgCur))}</div>
              {totalLTCG>0?<div className="tax-sub">Est. tax: <b style={{color:'#f97316'}}>₹{fIN(totalLTCGTax)}</b> (12.5% tax above ₹1.25L)</div>
                :totalLTCG<0?<div className="tax-sub" style={{color:'#f87171'}}>Unrealised loss — no tax</div>
                :<div className="tax-sub" style={{color:'#8899bb'}}>No tax liability</div>}
            </div>
            <div className="tax-card">
              <div className="tax-label"><span className="tax-badge-st">STCG</span> Short Term Gains (≤1 year) — all funds<span style={{fontSize:9,color:'#4a5570',marginLeft:6}}>20% tax flat</span></div>
              <div className={`tax-val ${totalSTCG>0?'up-text':totalSTCG<0?'dn-text':'neutral-text'}`}>{totalSTCG>0?'+₹'+fIN(totalSTCG):totalSTCG<0?'-₹'+fIN(Math.abs(totalSTCG)):'₹0'}</div>
              <div className="tax-sub">Invested: {hide('₹'+fIN(stcgInv))} → Current: {hide('₹'+fIN(stcgCur))}</div>
              {totalSTCG>0?<div className="tax-sub">Est. tax: <b style={{color:'#ef4444'}}>₹{fIN(totalSTCGTax)}</b> (20% tax flat)</div>
                :totalSTCG<0?<div className="tax-sub" style={{color:'#f87171'}}>Unrealised loss — no tax</div>
                :<div className="tax-sub" style={{color:'#8899bb'}}>No tax liability</div>}
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {keys.length===0&&(
        <div style={{textAlign:'center',padding:'80px 20px',color:'#6b7a9a'}}>
          <div style={{fontSize:40,marginBottom:16}}>📊</div>
          <div style={{fontSize:17,fontWeight:700,color:'#9aaac8',marginBottom:8}}>No funds yet</div>
          <div style={{fontSize:13}}>Click <b style={{color:'#c9a84c'}}>⚙ Manage Funds</b> in the sidebar to add your first fund.</div>
        </div>
      )}
    </div>
  );
}
