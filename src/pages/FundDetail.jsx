import { appConfirm, appAlert } from '../components/ui/ConfirmDialog.jsx';
import React, { useState, useEffect } from 'react';
import useAppStore from '../store/useAppStore.js';
import { MF_FUNDS, navHistoryCache, getFundLogo, normalizeFundCategory, fundMetaCache } from '../constants/funds.js';
import { getMFStats, getDayChange } from '../utils/mfStats.js';
import { calcXIRR } from '../utils/xirr.js';
import { calcTaxInfo } from '../utils/taxCalc.js';
import { fIN, fINd, fmtDate } from '../utils/formatters.js';
import PortfolioValueChart from '../components/charts/PortfolioValueChart.jsx';
import NAVChart from '../components/charts/NAVChart.jsx';
import AddTransactionModal from '../components/modals/AddTransactionModal.jsx';

export default function FundDetail({ fundKey }) {
  const db = useAppStore(s => s.db);
  const deleteTx = useAppStore(s => s.deleteTx);
  const loadNavHistory = useAppStore(s => s.loadNavHistory);
  const amtHidden = useAppStore(s => s.amtHidden);
  const [themeMode, setThemeMode] = React.useState(()=>localStorage.getItem('mft_theme')||'off');
  React.useEffect(()=>{
    const obs = new MutationObserver(()=>setThemeMode(document.documentElement.getAttribute('data-theme')||'off'));
    obs.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
    return()=>obs.disconnect();
  },[]);
  const isDark = themeMode === 'dark';
  const [navTF,setNavTF]=useState('3M');
  const [editMode,setEditMode]=useState(false);
  const [txModal,setTxModal]=useState(null);
  const fund=MF_FUNDS[fundKey];
  const hide=v=>amtHidden?'••••':v;

  // Load nav history immediately — from db (instant) or network fallback
  // Then force chart rebuild via navLoaded counter
  const [navLoaded,setNavLoaded]=useState(0);
  useEffect(()=>{
    let cancelled=false;
    async function init(){
      if(!navHistoryCache[fundKey]){
        await loadNavHistory(fundKey);
        if(!cancelled) setNavLoaded(v=>v+1);
      }
    }
    init();
    return ()=>{cancelled=true;};
  },[fundKey]);

  if(!fund)return<div style={{padding:20,color:'#6b7a9a'}}>Fund not found.</div>;

  const s=getMFStats(fundKey,db);
  const tax=calcTaxInfo(fundKey,db);
  const kx=calcXIRR(fundKey,db);
  const dc=getDayChange(fundKey,db);
  const txs=db.mf[fundKey]?.transactions||[];
  const curNav=db.navData[fundKey]?.nav||0;
  const logo=getFundLogo(fundKey);
  const cat=normalizeFundCategory((fundMetaCache[fundKey]?.schemeCategory)||fund.category||'',fund.fullName||fund.name||'');

  // Day change card — exact HTML
  let dcCard;
  if(!dc) {
    dcCard=<div className="mc"><div className="mcl">Day Change</div><div className="mcv" style={{fontSize:12,color:'#7080a0'}}>Refresh NAV</div></div>;
  } else if(dc.stale) {
    dcCard=<div className="mc"><div className="mcl">Day Change</div><div className="mcv" style={{fontSize:11,color:'#7080a0',whiteSpace:'nowrap'}}>NAV not updated today</div></div>;
  } else {
    const dcPos=dc.portChg>=0;
    const dcPct=Math.abs(dc.portChgPct||dc.navChgPct);
    dcCard=<div className="mc" style={{borderColor:dcPos?'#1e4a2a':'#4a1e1e'}}>
      <div className="mcl">Day Change</div>
      <div className={`mcv ${dcPos?'up':'dn'}`}>{(dcPos?'+':'-')+'₹'+(amtHidden?'••••':fIN(Math.abs(dc.portChg)))+' ('+(dcPos?'+':'-')+dcPct.toFixed(2)+'%)'}</div>
    </div>;
  }

  // Totals for summary row
  const buyTxs=txs.filter(t=>t.type==='Invested');
  const totalUnitsHeld=txs.reduce((s,t)=>s+(t.type==='Invested'?parseFloat(t.units||0):-parseFloat(t.units||0)),0);
  const avgNavCalc=buyTxs.length?buyTxs.reduce((s,t)=>s+parseFloat(t.amount||0),0)/buyTxs.reduce((s,t)=>s+parseFloat(t.units||0),0):0;
  const portfolioAge=(()=>{
    if(!txs.length)return'';
    const first=new Date(txs[0].date),now2=new Date();
    const days=Math.floor((now2-first)/(1000*60*60*24));
    const yrs=Math.floor(days/365),rem=days%365,mons=Math.floor(rem/30),rdays=rem%30;
    return (yrs>0?yrs+'y ':'')+( mons>0?mons+'m ':'')+rdays+'d · '+txs.length+' trans';
  })();

  return(
    <div>
      {/* HEADER */}
      <div className="ph">
        <div className="ph-fund-outer" style={{display:'flex',alignItems:'center',gap:12,flex:1,minWidth:0}}>
          {logo
            ?<div className="fca" style={{width:42,height:42,borderRadius:'50%',flexShrink:0,overflow:'hidden'}}>
               <img src={logo} style={{width:'100%',height:'100%',objectFit:'cover'}}
                 onError={e=>{e.target.parentElement.style.background=fund.color;e.target.parentElement.innerHTML=fundKey[0];e.target.parentElement.style.fontSize='16px';e.target.parentElement.style.color='#1a2235';e.target.parentElement.style.fontWeight='800';e.target.parentElement.style.display='flex';e.target.parentElement.style.alignItems='center';e.target.parentElement.style.justifyContent='center';}}/>
             </div>
            :<div className="fca" style={{background:fund.color,width:42,height:42,borderRadius:'50%',fontSize:16,flexShrink:0}}>{fundKey[0]}</div>
          }
          <div style={{minWidth:0}}>
            <div style={{fontSize:20,fontWeight:800,color:'#ffffff',letterSpacing:'0.3px'}}>{fund.fullName||fund.name}</div>
            <div className="ph-fund-badges" style={{display:'flex',gap:6,alignItems:'center',marginTop:5,flexWrap:'wrap'}}>
              {cat&&<div className="nbadge" style={{fontSize:11,fontWeight:600,color:'#a0b4d6'}}>{cat}</div>}
              {fund.ter>0&&<div className="nbadge expense-badge-inline"><span style={{color:'#c9a84c',fontWeight:700}}>EXPENSE RATIO: {fund.ter}%</span></div>}
            </div>
          </div>
        </div>
        {/* Mobile ha - expense badge */}
        <div className="ha">
          {fund.ter>0&&<div className="nbadge expense-badge-ha"><span style={{color:'#c9a84c',fontWeight:700}}>EXPENSE RATIO: {fund.ter}%</span></div>}
        </div>
      </div>

      {/* METRICS — exact HTML order */}
      <div className="metrics">
        <div className="mc"><div className="mcl">Total Invested</div><div className="mcv">{'₹'+fIN(s.totalInvested)}</div></div>
        <div className="mc"><div className="mcl">Current Value</div><div className="mcv">{'₹'+fIN(s.currentValue)}</div></div>
        <div className="mc"><div className="mcl">Total Return</div><div className={`mcv ${s.gain>=0?'up':'dn'}`}>{(s.gain>=0?'+':'-')+'₹'+(amtHidden?'••••':fIN(Math.abs(s.gain)))+' ('+(s.gain>=0?'+':'-')+Math.abs(s.gainPct).toFixed(2)+'%)'}</div></div>
        <div className="mc"><div className="mcl">XIRR</div><div className={`mcv ${kx!=null?(kx>=0?'up':'dn'):'gold'}`}>{kx!=null?((kx*100).toFixed(2)+'% p.a.'):'N/A'}</div></div>
        {dcCard}
        <div className="mc"><div className="mcl">NAV (as on date)</div><div className="mcv"><span style={{color:'#7ab8ff',fontWeight:800}}>₹{curNav?fINd(curNav):'--'}</span> <span style={{fontSize:10,fontWeight:500,color:'#8899bb'}}>({s.navDate==='--'?'--':fmtDate(s.navDate)})</span></div></div>
        <div className="mc"><div className="mcl">Avg NAV</div><div className="mcv">{'₹'+fINd(s.avgNav)}</div></div>
        <div className="mc"><div className="mcl">Total Units</div><div className="mcv">{amtHidden?'••••':parseFloat(s.totalUnits).toFixed(3)}</div></div>
      </div>

      {/* CHARTS: LEFT=PVC, RIGHT=NAV (exact HTML order) */}
      <div className="fund-charts-grid" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:16}}>
        {/* LEFT: Portfolio Value Chart */}
        <PortfolioValueChart canvasId={`pvc-${fundKey}`} keys={[fundKey]} db={db} amtHidden={amtHidden} isFundPage={true} key={`pvc-${fundKey}-${navLoaded}`}/>
        {/* RIGHT: NAV Movement Chart */}
        <NAVChart fundKey={fundKey} db={db} tf={navTF} onTFChange={setNavTF} amtHidden={amtHidden} key={`nav-${fundKey}-${navLoaded}`}/>
      </div>

      {/* TAX BREAKDOWN */}
      <div className="tax-section">
        <div className="tax-title">🏛 Tax Breakdown — {fundKey}</div>
        <div className="tax-grid">
          <div className="tax-card">
            <div className="tax-label"><span className="tax-badge-lt">LTCG</span> Long Term (&gt;1 yr) — {tax.ltcgUnits.toFixed(3)} units<span style={{fontSize:9,color:'#4a5570',marginLeft:6}}>12.5% tax above ₹1.25L</span></div>
            <div className={`tax-val ${tax.ltcgGain>0?'up-text':tax.ltcgGain<0?'dn-text':'neutral-text'}`}>{tax.ltcgGain>0?'+₹'+(amtHidden?'••••':fIN(tax.ltcgGain)):tax.ltcgGain<0?'-₹'+(amtHidden?'••••':fIN(Math.abs(tax.ltcgGain))):'₹0'}</div>
            <div className="tax-sub">Invested: ₹{amtHidden?'••••':fIN(tax.ltcgInvested)} → Current: ₹{amtHidden?'••••':fIN(tax.ltcgCurVal)}</div>
            {tax.ltcgGain>0?<div className="tax-sub" style={{marginTop:3}}>Est. LTCG Tax: <b style={{color:'#f97316'}}>₹{amtHidden?'••••':fIN(tax.ltcgTax)}</b> (12.5% tax above ₹1.25L)</div>
              :tax.ltcgGain<0?<div className="tax-sub" style={{marginTop:3,color:'#f87171'}}>Unrealised loss — no tax</div>
              :<div className="tax-sub" style={{marginTop:3,color:'#7080a0'}}>No tax liability</div>}
          </div>
          <div className="tax-card">
            <div className="tax-label"><span className="tax-badge-st">STCG</span> Short Term (≤1 yr) — {tax.stcgUnits.toFixed(3)} units<span style={{fontSize:9,color:'#4a5570',marginLeft:6}}>20% tax flat</span></div>
            <div className={`tax-val ${tax.stcgGain>0?'up-text':tax.stcgGain<0?'dn-text':'neutral-text'}`}>{tax.stcgGain>0?'+₹'+(amtHidden?'••••':fIN(tax.stcgGain)):tax.stcgGain<0?'-₹'+(amtHidden?'••••':fIN(Math.abs(tax.stcgGain))):'₹0'}</div>
            <div className="tax-sub">Invested: ₹{amtHidden?'••••':fIN(tax.stcgInvested)} → Current: ₹{amtHidden?'••••':fIN(tax.stcgCurVal)}</div>
            {tax.stcgGain>0?<div className="tax-sub" style={{marginTop:3}}>Est. STCG Tax: <b style={{color:'#ef4444'}}>₹{amtHidden?'••••':fIN(tax.stcgTax)}</b> (20% tax flat)</div>
              :tax.stcgGain<0?<div className="tax-sub" style={{marginTop:3,color:'#f87171'}}>Unrealised loss — no tax</div>
              :<div className="tax-sub" style={{marginTop:3,color:'#7080a0'}}>No tax liability</div>}
          </div>
        </div>
      </div>

      {/* TRANSACTIONS TABLE */}
      <div className="tw">
        <div className="th2">
          <div className="tt">Transactions</div>
          <div style={{display:'flex',gap:6,alignItems:'center'}}>
            {editMode&&<span style={{fontSize:11,color:'#c9a84c'}}>Edit mode</span>}
            <button className={`btn btn-dark${editMode?' on':''}`} onClick={()=>setEditMode(e=>!e)}>{editMode?'✓ Done':'✎ Edit'}</button>
            <button className="btn btn-gold" onClick={()=>setTxModal({editIdx:null})}>+ Add Transaction</button>
          </div>
        </div>
        <div className="tbl-scroll">
          <table className="tx-table">
            <thead><tr>
              <th style={{width:30,textAlign:'center',paddingLeft:0,paddingRight:0}}>#</th>
              <th style={{width:95,textAlign:'center'}}>Date</th>
              <th style={{width:85,textAlign:'center'}}>Type</th>
              <th style={{width:90,textAlign:'center'}}>Units</th>
              <th style={{width:95,textAlign:'center'}}>NAV (₹)</th>
              <th style={{width:105,textAlign:'center'}}>Amount (₹)</th>
              <th style={{width:105,textAlign:'center'}}>Stamp Duty</th>
              <th style={{width:110,textAlign:'center'}}>Total Amount</th>
              <th style={{width:110,textAlign:'center'}}>Current Value</th>
              <th style={{width:135,textAlign:'center'}}>Return</th>
              <th style={{width:76}}></th>
            </tr></thead>
            <tbody>
              {txs.length===0
                ?<tr><td colSpan={11} className="empty-row">No transactions yet.</td></tr>
                :[...txs].reverse().map((tx,ri)=>{
                  const origIdx=txs.length-1-ri;
                  const txUnits=parseFloat(tx.units||0),txNav=parseFloat(tx.nav||0);
                  const totalAmt=Math.round(parseFloat(tx.amount||0)+parseFloat(tx.stamp||0));
                  const isBuy=tx.type==='Invested';
                  const curVal2=isBuy&&curNav?Math.round(txUnits*curNav):0;
                  const costBasis=Math.round(txUnits*txNav+parseFloat(tx.stamp||0));
                  const retAmt=isBuy&&curNav?curVal2-costBasis:0;
                  const retPct=costBasis>0?(retAmt/costBasis*100):0;
                  const retCol=retAmt>=0?'#34d399':'#f87171';
                  return(
                    <tr key={origIdx}>
                      <td style={{color:'#6b7a9a',fontSize:10,textAlign:'center',paddingLeft:0,paddingRight:0}}>{origIdx+1}</td>
                      <td style={{textAlign:'center'}}>{fmtDate(tx.date)}</td>
                      <td style={{textAlign:'center'}}><span className={isBuy?'bo':'bc'}>{tx.type}</span></td>
                      <td style={{textAlign:'center'}}>{hide(txUnits.toFixed(3))}</td>
                      <td style={{textAlign:'center'}}>₹{fINd(txNav)}</td>
                      <td style={{textAlign:'center'}}>{'₹'+fIN(tx.amount)}</td>
                      <td style={{color:'#c9a84c',fontSize:11,textAlign:'center'}}>{tx.stamp?('₹'+(amtHidden?'••••':parseFloat(tx.stamp).toFixed(2))):'--'}</td>
                      <td style={{textAlign:'center',fontWeight:600}}>{'₹'+fIN(totalAmt)}</td>
                      {isBuy&&curNav
                        ?<><td style={{textAlign:'center',fontWeight:600,color:'#e0e8ff'}}>{'₹'+fIN(curVal2)}</td><td style={{textAlign:'center',fontWeight:600,color:retCol}}>{(retAmt>=0?'+':'−')+'₹'+(amtHidden?'••••':fIN(Math.abs(retAmt)))+' ('+(retPct>=0?'+':'')+retPct.toFixed(2)+'%)'}</td></>
                        :<><td style={{textAlign:'center',color:'#6b7a9a'}}>--</td><td style={{textAlign:'center',color:'#6b7a9a'}}>--</td></>
                      }
                      <td>
                        {editMode&&(
                          <div style={{display:'flex',gap:3,justifyContent:'flex-end'}}>
                            <button className="btn btn-sm btn-dark" onClick={()=>setTxModal({editIdx:origIdx})}>✎</button>
                            <button className="btn btn-sm btn-red" onClick={()=>{appConfirm('Delete this transaction?\n\nThis cannot be undone.').then(ok=>{if(ok)deleteTx(fundKey,origIdx);});}}>✕</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              }
              {txs.length>0&&(()=>{
                const totCur=curNav?buyTxs.reduce((s,t)=>s+Math.round(parseFloat(t.units||0)*curNav),0):0;
                const totCost=buyTxs.reduce((s,t)=>s+Math.round(parseFloat(t.units||0)*parseFloat(t.nav||0)+parseFloat(t.stamp||0)),0);
                const diff=totCur-totCost,pct=totCost>0?(diff/totCost*100):0;
                return(
                  <tr style={{background:isDark?'#0d0d0d':'#0f1929',borderTop:`2px solid ${isDark?'#1e1e1e':'#2a3a55'}`}}>
                    <td style={{color:'#6b7a9a',fontSize:10,textAlign:'center'}}></td>
                    <td style={{color:'#e0e8ff',fontSize:12,fontWeight:600,textAlign:'center'}}>{portfolioAge}</td>
                    <td style={{color:'#e0e8ff',fontSize:12,fontWeight:600,textAlign:'center'}}>{buyTxs.length} invested</td>
                    <td style={{textAlign:'center',color:'#e0e8ff',fontWeight:600}}>{hide(totalUnitsHeld.toFixed(3))}</td>
                    <td style={{textAlign:'center',color:'#e0e8ff',fontWeight:600}}>₹{fINd(avgNavCalc)}</td>
                    <td style={{textAlign:'center',color:'#e0e8ff',fontWeight:600}}>{'₹'+fIN(txs.reduce((s,t)=>s+(t.type==='Invested'?parseFloat(t.amount||0):-parseFloat(t.amount||0)),0))}</td>
                    <td style={{color:'#c9a84c',fontWeight:600,textAlign:'center'}}>{'₹'+(amtHidden?'••••':txs.reduce((s,t)=>s+parseFloat(t.stamp||0),0).toFixed(2))}</td>
                    <td style={{textAlign:'center',color:'#c9a84c',fontWeight:600}}>{'₹'+fIN(txs.reduce((s,t)=>s+parseFloat(t.amount||0)+parseFloat(t.stamp||0),0))}</td>
                    <td style={{textAlign:'center',fontWeight:600,color:'#e0e8ff'}}>{curNav?'₹'+fIN(totCur):'--'}</td>
                    <td style={{textAlign:'center',fontWeight:600}}>
                      {curNav?<span style={{color:diff>=0?'#34d399':'#f87171'}}>{(diff>=0?'+':'−')+'₹'+(amtHidden?'••••':fIN(Math.abs(diff)))+' ('+(pct>=0?'+':'')+pct.toFixed(2)+'%)'}</span>:'--'}
                    </td>
                    <td></td>
                  </tr>
                );
              })()}
            </tbody>
          </table>
        </div>
      </div>

      {txModal&&<AddTransactionModal fundKey={fundKey} editIdx={txModal.editIdx} onClose={()=>setTxModal(null)}/>}
    </div>
  );
}
