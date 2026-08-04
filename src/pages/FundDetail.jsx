import { appConfirm, appAlert } from '../components/ui/ConfirmDialog.jsx';
import { dbLoadHoldings, dbSaveHoldings } from '../store/db.js';
import React, { useState, useEffect } from 'react';
import useAppStore from '../store/useAppStore.js';
import { MF_FUNDS, getFundLogo, normalizeFundCategory, fundMetaCache } from '../constants/funds.js';
import { getMFStats, getDayChange } from '../utils/mfStats.js';
import { calcXIRR } from '../utils/xirr.js';
import { calcTaxInfo } from '../utils/taxCalc.js';
import { fIN, fINd, fmtDate } from '../utils/formatters.js';
import PortfolioValueChart from '../components/charts/PortfolioValueChart.jsx';
import NAVChart from '../components/charts/NAVChart.jsx';
import AddTransactionModal from '../components/modals/AddTransactionModal.jsx';

// ── Donut chart — 2-col legend left, large donut right, hover dims others ────
function DonutChart({ title, data, isDark, canvasId }) {
  const ref = React.useRef(null);
  const inst = React.useRef(null);
  const [hovered, setHovered] = React.useState(-1);

  React.useEffect(()=>{
    if(!ref.current||!window.Chart||!data?.length)return;
    if(inst.current){ inst.current.destroy(); inst.current=null; }
    const ctx=ref.current.getContext('2d');
    if(!ctx)return;
    inst.current=new window.Chart(ctx,{
      type:'doughnut',
      data:{
        labels:data.map(d=>d.label),
        datasets:[{
          data:data.map(d=>d.value),
          backgroundColor:data.map(d=>d.color),
          borderWidth:0,
          hoverOffset:10,
          hoverBorderWidth:0,
        }],
      },
      options:{
        responsive:true,maintainAspectRatio:false,cutout:'65%',
        layout:{padding:10},
        plugins:{ legend:{display:false}, tooltip:{enabled:false} },
        animation:{duration:600},
        onHover:(_,elements)=>{
          if(elements.length>0) setHovered(elements[0].index);
          else setHovered(-1);
        },
      },
    });
    return()=>{ if(inst.current){inst.current.destroy();inst.current=null;} };
  },[data,isDark,canvasId]);

  const bgCard=isDark?'#111111':'#162030';
  const border=isDark?'#1e1e1e':'#2a3a52';
  const half=Math.ceil(data.length/2);
  const col1=data.slice(0,half);
  const col2=data.slice(half);

  return(
    <div style={{background:bgCard,borderRadius:8,border:'1px solid '+border,padding:'14px 16px'}}>
      <div className="tax-label" style={{marginBottom:12}}>{title}</div>
      <div style={{display:'flex',alignItems:'center',gap:12}}>
        {/* Legend 2-col left — dim non-hovered */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'6px 12px',flex:1,minWidth:0}}>
          {[col1,col2].map((col,ci)=>(
            <div key={ci} style={{display:'flex',flexDirection:'column',gap:5}}>
              {col.map((d,li)=>{
                const idx=ci===0?li:half+li;
                const dim=hovered!==-1&&hovered!==idx;
                return(
                  <div key={d.label} style={{display:'flex',alignItems:'flex-start',gap:5,opacity:dim?0.35:1,transition:'opacity 0.15s'}}>
                    <div style={{width:3,height:26,borderRadius:2,background:d.color,flexShrink:0,marginTop:1}}/>
                    <div>
                      <div style={{fontSize:10,color:isDark?'#aaaaaa':'#8899bb',lineHeight:1.3}}>{d.label}</div>
                      <div style={{fontSize:12,fontWeight:700,color:isDark?'#ffffff':'#e0e8ff'}}>{d.value.toFixed(2)}%</div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        {/* Donut — overflow:visible so hover expand doesn't clip */}
        <div style={{width:150,height:150,flexShrink:0,overflow:'visible'}} onMouseLeave={()=>setHovered(-1)}>
          <canvas ref={ref} id={canvasId} style={{overflow:'visible'}}/>
        </div>
      </div>
    </div>
  );
}

export default function FundDetail({ fundKey }) {
  const db = useAppStore(s => s.db);
  const deleteTx = useAppStore(s => s.deleteTx);
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
  const [activeTab,setActiveTab]=useState('holdings');
  const [holdings,setHoldings]=useState(null);
  const [fundInfo,setFundInfo]=useState(null); // full Groww proxy response
  const [showRiskInfo,setShowRiskInfo]=useState(false);
  const [holdingsLoading,setHoldingsLoading]=useState(false);
  const [holdingsError,setHoldingsError]=useState(null);
  const fund=MF_FUNDS[fundKey];
  const hide=v=>amtHidden?'••••':v;

  // Load nav history immediately — from db (instant) or network fallback


  // Fetch holdings — check DB first, only call Groww proxy if not saved today
  useEffect(()=>{
    if(holdings!==null)return;
    let cancelled=false;
    async function fetchHoldings(){
      setHoldingsLoading(true);
      setHoldingsError(null);
      const code=fund?.code;
      if(!code){ setHoldingsError('No fund code'); setHoldingsLoading(false); return; }
      try{
        // Check DB first
        const saved=await dbLoadHoldings(code);
        if(saved?.holdings?.length){
          const savedDate=saved.fetched_at?.split('T')[0];
          const todayDate=new Date().toISOString().split('T')[0];
          if(savedDate===todayDate){
            if(!cancelled){
              setHoldings(saved.holdings);
              if(saved.fund_info) setFundInfo(saved.fund_info);
              setHoldingsLoading(false);
            }
            return;
          }
        }
        // DB empty or stale — fetch from Groww proxy (single endpoint, all fields)
        const r=await fetch(`https://groww-fund-data.onrender.com/groww?code=${code}`);
        if(!r.ok)throw new Error('Groww proxy error '+r.status);
        const d=await r.json();
        if(!cancelled){
          setHoldings(d.holdings||[]);
          setFundInfo(d);
          dbSaveHoldings(code, d);
        }
      }catch(e){
        if(!cancelled)setHoldingsError(e.message);
      }finally{
        if(!cancelled)setHoldingsLoading(false);
      }
    }
    fetchHoldings();
    return()=>{cancelled=true;};
  },[fundKey,holdings]);

  if(!fund)return<div style={{padding:20,color:'#6b7a9a'}}>Fund not found.</div>;
  // Show full page spinner until holdings data is fetched
  if(holdingsLoading||holdings===null){
    return(
      <div style={{display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:16,height:'calc(100vh - 52px)'}}>
        <div style={{width:40,height:40,borderRadius:'50%',border:'3px solid '+(isDark?'#222222':'#2a3348'),borderTopColor:'#c9a84c',animation:'spin 0.8s linear infinite'}}/>
        <div style={{fontSize:12,color:isDark?'#555':'#6b7a9a',letterSpacing:'0.5px'}}>Loading fund data...</div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

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
        <PortfolioValueChart canvasId={`pvc-${fundKey}`} keys={[fundKey]} db={db} amtHidden={amtHidden} isFundPage={true} key={`pvc-${fundKey}`}/>
        {/* RIGHT: NAV Movement Chart */}
        <NAVChart fundKey={fundKey} db={db} tf={navTF} onTFChange={setNavTF} amtHidden={amtHidden} key={`nav-${fundKey}`}/>
      </div>

      {/* TAX + FUND INFO ROW */}
      <div style={{display:'grid',gridTemplateColumns:'65% 1fr',gap:12,marginBottom:16}}>
        {/* LEFT 65%: Tax Breakdown */}
        <div className="tax-section" style={{marginBottom:0}}>
          <div className="tax-title">🏛 Tax Breakdown — {fundKey}</div>
          <div className="tax-grid">
            <div className="tax-card">
              <div className="tax-label"><span className="tax-badge-lt">LTCG</span> Long Term (&gt;1 yr) — {tax.ltcgUnits.toFixed(3)} units<span style={{fontSize:9,color:'#4a5570',marginLeft:6}}>12.5% above ₹1.25L</span></div>
              <div className={`tax-val ${tax.ltcgGain>0?'up-text':tax.ltcgGain<0?'dn-text':'neutral-text'}`}>{tax.ltcgGain>0?'+₹'+(amtHidden?'••••':fIN(tax.ltcgGain)):tax.ltcgGain<0?'-₹'+(amtHidden?'••••':fIN(Math.abs(tax.ltcgGain))):'₹0'}</div>
              <div className="tax-sub">Invested: ₹{amtHidden?'••••':fIN(tax.ltcgInvested)} → Current: ₹{amtHidden?'••••':fIN(tax.ltcgCurVal)}</div>
              {tax.ltcgGain>0?<div className="tax-sub" style={{marginTop:3}}>Est. Tax: <b style={{color:'#f97316'}}>₹{amtHidden?'••••':fIN(tax.ltcgTax)}</b></div>
                :tax.ltcgGain<0?<div className="tax-sub" style={{marginTop:3,color:'#f87171'}}>Unrealised loss — no tax</div>
                :<div className="tax-sub" style={{marginTop:3,color:'#7080a0'}}>No tax liability</div>}
            </div>
            <div className="tax-card">
              <div className="tax-label"><span className="tax-badge-st">STCG</span> Short Term (≤1 yr) — {tax.stcgUnits.toFixed(3)} units<span style={{fontSize:9,color:'#4a5570',marginLeft:6}}>20% flat</span></div>
              <div className={`tax-val ${tax.stcgGain>0?'up-text':tax.stcgGain<0?'dn-text':'neutral-text'}`}>{tax.stcgGain>0?'+₹'+(amtHidden?'••••':fIN(tax.stcgGain)):tax.stcgGain<0?'-₹'+(amtHidden?'••••':fIN(Math.abs(tax.stcgGain))):'₹0'}</div>
              <div className="tax-sub">Invested: ₹{amtHidden?'••••':fIN(tax.stcgInvested)} → Current: ₹{amtHidden?'••••':fIN(tax.stcgCurVal)}</div>
              {tax.stcgGain>0?<div className="tax-sub" style={{marginTop:3}}>Est. Tax: <b style={{color:'#ef4444'}}>₹{amtHidden?'••••':fIN(tax.stcgTax)}</b></div>
                :tax.stcgGain<0?<div className="tax-sub" style={{marginTop:3,color:'#f87171'}}>Unrealised loss — no tax</div>
                :<div className="tax-sub" style={{marginTop:3,color:'#7080a0'}}>No tax liability</div>}
            </div>
          </div>
        </div>
        {/* RIGHT 35%: Fund Info — AUM + TER + Risk Metrics in one compact box */}
        <div className="tax-section" style={{marginBottom:0}}>
          <div className="tax-title">
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{marginRight:6,verticalAlign:'middle'}}><rect x="1" y="1" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.2" fill="none"/><rect x="3" y="4" width="8" height="1.2" rx="0.6" fill="currentColor"/><rect x="3" y="6.5" width="8" height="1.2" rx="0.6" fill="currentColor"/><rect x="3" y="9" width="5" height="1.2" rx="0.6" fill="currentColor"/></svg>Fund Info
            <button onClick={()=>setShowRiskInfo(true)} style={{background:'none',border:'none',cursor:'pointer',padding:'0 0 0 6px',display:'inline-flex',alignItems:'center',color:isDark?'#555':'#6b7a9a',verticalAlign:'middle'}} title="What do these mean?">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7.5" stroke="currentColor" strokeWidth="1.2"/><text x="8" y="12" textAnchor="middle" fontSize="10" fill="currentColor" fontWeight="600">i</text></svg>
            </button>
          </div>
          {/* AUM · TER · PE · PB — all in one row, same box design as risk metrics */}
          <div className="tax-card" style={{padding:'8px 10px',marginBottom:8}}>
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:4}}>
              {[
                {label:'AUM', value:fundInfo?.aum!=null?`₹${fundInfo.aum} Cr`:null},
                {label:'TER', value:fundInfo?.expense_ratio!=null?`${fundInfo.expense_ratio}%`:null},
                {label:'PE',  value:fundInfo?.pe!=null?parseFloat(fundInfo.pe).toFixed(2):null},
                {label:'PB',  value:fundInfo?.pb!=null?parseFloat(fundInfo.pb).toFixed(2):null},
              ].map(item=>(
                <div key={item.label} style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:isDark?'#1a1a1a':'#1e2840',borderRadius:5,padding:'5px 4px',gap:3}}>
                  <span style={{fontSize:10,color:isDark?'#c0c0c0':'#8899bb',fontWeight:600}}>{item.label}</span>
                  <span style={{fontSize:12,fontWeight:700,color:isDark?'#e8e8e8':'#e0e8ff'}}>{item.value||'—'}</span>
                </div>
              ))}
            </div>
          </div>
          {/* Risk Metrics — Alpha, Beta, Sharpe, Sortino, Std Dev */}
          {(fundInfo?.alpha!=null||fundInfo?.beta!=null||fundInfo?.sharpe!=null||fundInfo?.sortino!=null||fundInfo?.std_dev!=null)&&(
            <div className="tax-card" style={{padding:'8px 10px'}}>
              <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}>
                <div className="tax-label" style={{marginBottom:0}}>Risk Metrics</div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:4}}>
                {[
                  {key:'alpha',  label:'Alpha',   val:fundInfo?.alpha,   color:v=>v>0?'#34d399':v<0?'#f87171':(isDark?'#fff':'#e0e8ff'), suffix:''},
                  {key:'beta',   label:'Beta',    val:fundInfo?.beta,    color:v=>v<1?'#34d399':v>1?'#f87171':'#f97316',                 suffix:''},
                  {key:'sharpe', label:'Sharpe',  val:fundInfo?.sharpe,  color:v=>v>=1?'#34d399':v<0?'#f87171':'#f97316',               suffix:''},
                  {key:'sortino',label:'Sortino', val:fundInfo?.sortino, color:v=>v>=2?'#34d399':v<0?'#f87171':'#f97316',               suffix:''},
                  {key:'std_dev',label:'Std Dev', val:fundInfo?.std_dev, color:()=>isDark?'#ffffff':'#e0e8ff',                          suffix:'%'},
                ].filter(m=>m.val!=null).map(m=>(
                  <div key={m.key} style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:isDark?'#1a1a1a':'#1e2840',borderRadius:5,padding:'5px 4px',gap:3}}>
                    <span style={{fontSize:10,color:isDark?'#c0c0c0':'#8899bb',fontWeight:600}}>{m.label}</span>
                    <span style={{fontSize:12,fontWeight:700,color:m.color(parseFloat(m.val))}}>{parseFloat(m.val).toFixed(2)}{m.suffix}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Risk Metrics Info Popup */}
          {showRiskInfo&&(
            <div className="mbg" onClick={()=>setShowRiskInfo(false)} style={{position:'fixed',inset:0,background:isDark?'rgba(0,0,0,0.85)':'rgba(0,0,0,0.6)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}}>
              <div className="modal" onClick={e=>e.stopPropagation()} style={{width:480,maxWidth:'94vw',padding:'16px 18px',background:isDark?'#111111':'#1a2235',border:`1px solid ${isDark?'#222':'#2a3348'}`,borderRadius:14}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
                  <div style={{fontSize:14,fontWeight:700,color:isDark?'#e8e8e8':'#e0e8ff'}}>Fund Metrics Explained</div>
                  <button onClick={()=>setShowRiskInfo(false)} style={{background:'none',border:'none',cursor:'pointer',color:isDark?'#555':'#6b7a9a',fontSize:18,lineHeight:1}}>✕</button>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                {[
                  {label:'Alpha',color:'#34d399',text:'Measures fund performance vs benchmark. +1 means 1% outperformance; -1 means 1% underperformance. Higher is better.'},
                  {label:'Beta',color:'#7ab8ff',text:'Measures fund volatility vs market. Beta > 1 means more volatile; Beta < 1 means lower volatility.'},
                  {label:'Sharpe',color:'#c9a84c',text:'Return earned per unit of total risk. Sharpe of 1–3 or above indicates strong risk-adjusted returns. Higher is better.'},
                  {label:'Sortino',color:'#c9a84c',text:'Like Sharpe but only penalises downside volatility. Sortino > 2 is considered good. Higher is better.'},
                  {label:'Std Dev',color:'#a78bfa',text:'Measures how much fund returns fluctuate over time. Lower means more consistent; higher means more volatile.'},
                  {label:'TER',color:'#f97316',text:'Total Expense Ratio — annual fee charged by the fund house to manage the fund, expressed as a % of AUM. Lower is better.'},
                  {label:'PE Ratio',color:'#06b6d4',text:'Weighted avg P/E of underlying stocks. Ratio of share price to earnings per share. High P/E may indicate overvaluation; low P/E may indicate undervaluation.'},
                  {label:'PB Ratio',color:'#06b6d4',text:'Weighted avg P/B of underlying stocks. Ratio of share price to book value per share. Lower P/B may mean undervalued stock or weak fundamentals.'},
                ].map(m=>(
                  <div key={m.label} style={{padding:'8px 10px',background:isDark?'#1a1a1a':'#1e2840',borderRadius:8}}>
                    <div style={{fontSize:11,fontWeight:700,color:m.color,marginBottom:4}}>{m.label}</div>
                    <div style={{fontSize:11,color:isDark?'#aaaaaa':'#8899bb',lineHeight:1.5}}>{m.text}</div>
                  </div>
                ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* HOLDINGS + TRANSACTIONS TABS */}
      <div className="tw">
        <div className="th2">
          {/* Tab switcher */}
          <div style={{display:'flex',gap:0,borderRadius:8,overflow:'hidden',border:'1px solid #2a3348'}}>
            {[['holdings','holdings'],['transactions','transactions']].map(([tab,label])=>(
              <button key={tab} onClick={()=>setActiveTab(tab)} style={{
                padding:'7px 18px',fontSize:11,fontWeight:700,cursor:'pointer',border:'none',
                background:activeTab===tab?(isDark?'#1a2235':'#1e3a5f'):'transparent',
                color:activeTab===tab?'#c9a84c':'#6b7a9a',
                transition:'all 0.15s',letterSpacing:'0.3px',
              }}>{tab==='holdings'
  ?<><svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{marginRight:5,verticalAlign:'middle'}}><rect x="1" y="1" width="5" height="5" rx="1" fill="currentColor" opacity="0.7"/><rect x="8" y="1" width="5" height="5" rx="1" fill="currentColor" opacity="0.7"/><rect x="1" y="8" width="5" height="5" rx="1" fill="currentColor" opacity="0.4"/><rect x="8" y="8" width="5" height="5" rx="1" fill="currentColor" opacity="0.4"/></svg>Holdings</>
  :<><svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{marginRight:5,verticalAlign:'middle'}}><rect x="1" y="2" width="12" height="1.5" rx="0.75" fill="currentColor"/><rect x="1" y="5.5" width="12" height="1.5" rx="0.75" fill="currentColor" opacity="0.7"/><rect x="1" y="9" width="8" height="1.5" rx="0.75" fill="currentColor" opacity="0.4"/></svg>Transactions</>
}</button>
            ))}
          </div>
          {activeTab==='transactions'&&(
            <div style={{display:'flex',gap:6,alignItems:'center'}}>
              {editMode&&<span style={{fontSize:11,color:'#c9a84c'}}>Edit mode</span>}
              <button className={`btn btn-dark${editMode?' on':''}`} onClick={()=>setEditMode(e=>!e)}>{editMode?'✓ Done':'✎ Edit'}</button>
              <button className="btn btn-gold" onClick={()=>setTxModal({editIdx:null})}>+ Add Transaction</button>
            </div>
          )}
        </div>
        {/* ── HOLDINGS TAB ─────────────────────────────────────────── */}
        {activeTab==='holdings'&&(
          <div style={{padding:'12px 14px 14px'}}>
            {/* Loading */}
            {holdingsLoading&&(
              <div style={{textAlign:'center',padding:'40px 0',color:isDark?'#555555':'#6b7a9a'}}>
                <div style={{width:28,height:28,borderRadius:'50%',border:'2px solid '+(isDark?'#222222':'#2a3348'),borderTopColor:'#c9a84c',animation:'spin 0.8s linear infinite',margin:'0 auto 12px'}}/>
                <div style={{fontSize:12}}>Loading holdings...</div>
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
              </div>
            )}
            {/* Error */}
            {holdingsError&&(
              <div style={{textAlign:'center',padding:'32px 0',fontSize:12,color:'#f97316'}}>
                ⚠ {holdingsError}<br/>
                <button onClick={()=>setHoldings(null)} style={{marginTop:10,padding:'6px 16px',borderRadius:6,border:'1px solid #4d2e0a',background:'#1a1008',color:'#f97316',cursor:'pointer',fontSize:11}}>Retry</button>
              </div>
            )}
            {/* Data */}
            {!holdingsLoading&&!holdingsError&&holdings&&(
              <div>
                {/* ── ALLOCATION SECTION ──────────────────────────────────── */}
                {(()=>{
                  const COLORS8=['#c9a84c','#34d399','#7ab8ff','#f97316','#a78bfa','#f87171','#06b6d4','#84cc16'];
                  // Market cap donut
                  const capData=[
                    {label:'Large Cap',value:parseFloat(fundInfo?.large_cap)||0,color:'#7ab8ff'},
                    {label:'Mid Cap',value:parseFloat(fundInfo?.mid_cap)||0,color:'#c9a84c'},
                    {label:'Small Cap',value:parseFloat(fundInfo?.small_cap)||0,color:'#f97316'},
                  ].filter(d=>d.value>0);
                  const showCap=capData.length>0;
                  // Equity sector donut — sorted high to low
                  const eqSec=fundInfo?.equity_sector||null;
                  const eqSecData=eqSec?Object.entries(eqSec).filter(([,v])=>parseFloat(v)>0).sort((a,b)=>b[1]-a[1]).map(([label,value],i)=>({label,value:parseFloat(value),color:COLORS8[i%8]})):[];
                  const showEqSec=eqSecData.length>0;
                  // Debt sector donut — sorted high to low
                  const dtSec=fundInfo?.debt_sector||null;
                  const dtSecData=dtSec?Object.entries(dtSec).filter(([,v])=>parseFloat(v)>0).sort((a,b)=>b[1]-a[1]).map(([label,value],i)=>({label,value:parseFloat(value),color:COLORS8[i%8]})):[];
                  const showDtSec=dtSecData.length>0;
                  // Asset allocation donut — sorted high to low
                  const assetObj=fundInfo?.asset_allocation||null;
                  const assetData=assetObj?Object.entries(assetObj).filter(([,v])=>parseFloat(v)>0).sort((a,b)=>b[1]-a[1]).map(([label,value],i)=>({label,value:parseFloat(value),color:COLORS8[i%8]})):[];
                  const showAsset=assetData.length>0;
                  // Sector donut titles
                  const eqTitle=showDtSec?'Equity Sector Allocation':'Sector Allocation (Equity)';
                  const dtTitle=showEqSec?'Debt Sector Allocation':'Sector Allocation (Debt)';
                  const cols=[showCap,showEqSec,showDtSec,showAsset].filter(Boolean).length;
                  if(cols===0)return null;
                  return(
                    <div style={{marginBottom:20}}>
                      <div style={{display:'grid',gridTemplateColumns:`repeat(${cols},1fr)`,gap:12,marginBottom:12}}>
                        {showCap&&<DonutChart title="Market Cap Split" data={capData} isDark={isDark} canvasId={`donut-cap-${fundKey}`}/>}
                        {showEqSec&&<DonutChart title={eqTitle} data={eqSecData} isDark={isDark} canvasId={`donut-eqsec-${fundKey}`}/>}
                        {showDtSec&&<DonutChart title={dtTitle} data={dtSecData} isDark={isDark} canvasId={`donut-dtsec-${fundKey}`}/>}
                        {showAsset&&<DonutChart title="Asset Allocation" data={assetData} isDark={isDark} canvasId={`donut-asset-${fundKey}`}/>}
                      </div>
                    </div>
                  );
                })()}
                {/* Holdings table */}
                <div className="tax-label" style={{marginBottom:8}}>
                  All Holdings · {holdings.length} stocks
                </div>
                <div className="tbl-scroll">
                  <table className="tx-table">
                    <thead><tr>
                      <th style={{width:28,textAlign:'center',paddingLeft:0,paddingRight:0}}>#</th>
                      <th style={{width:'40%'}}>Stock</th>
                      <th>Instrument</th>
                      <th>Sector</th>
                      <th style={{textAlign:'right'}}>Mkt Val (Cr)</th>
                      <th style={{textAlign:'right'}}>Weight</th>
                    </tr></thead>
                    <tbody>
                      {holdings.map((h,i)=>{
                        const wt=parseFloat(h.corpus_per)||0;
                        const barW=Math.min(wt/10*100,100);
                        return(
                          <tr key={i}>
                            <td style={{color:isDark?'#555555':'#6b7a9a',fontSize:10,textAlign:'center',paddingLeft:0,paddingRight:0}}>{i+1}</td>
                            <td style={{paddingTop:7,paddingBottom:7}}>
                              <div style={{fontSize:12,fontWeight:600,color:isDark?'#e8e8e8':'#e0e8ff'}}>{h.company}</div>
                              <div style={{height:3,background:isDark?'#1e1e1e':'#162030',borderRadius:2,marginTop:4,width:'90%'}}>
                                <div style={{height:'100%',width:barW+'%',background:'#c9a84c',borderRadius:2}}/>
                              </div>
                            </td>
                            <td style={{fontSize:12,color:isDark?'#c0c0c0':'#e0e8ff'}}>{h.instrument||<span style={{color:isDark?'#555':'#6b7a9a'}}>—</span>}</td>
                            <td style={{fontSize:12,color:isDark?'#c0c0c0':'#e0e8ff'}}>{h.sector||<span style={{color:isDark?'#555':'#6b7a9a'}}>—</span>}</td>
                            <td style={{textAlign:'right',fontSize:12,color:isDark?'#c0c0c0':'#e0e8ff'}}>{h.market_value!=null?'₹'+h.market_value:'—'}</td>
                            <td style={{textAlign:'right',fontSize:12,fontWeight:700,color:'#c9a84c'}}>{wt.toFixed(2)}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={{fontSize:10,color:isDark?'#333333':'#4a5570',textAlign:'right',marginTop:8}}>
                  Source: groww.in · Holdings data may lag 30–60 days
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TRANSACTIONS TAB ──────────────────────────────────────── */}
        {activeTab==='transactions'&&<div className="tbl-scroll">
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
        </div>}
      </div>

      {txModal&&<AddTransactionModal fundKey={fundKey} editIdx={txModal.editIdx} onClose={()=>setTxModal(null)}/>}
    </div>
  );
}
