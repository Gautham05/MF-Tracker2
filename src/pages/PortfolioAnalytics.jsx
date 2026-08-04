import React, { useState, useEffect, useRef } from 'react';
import { MF_FUNDS } from '../constants/funds.js';
import { dbLoadAllHoldings } from '../store/db.js';

const COLORS10 = ['#c9a84c','#34d399','#7ab8ff','#f97316','#a78bfa','#f87171','#06b6d4','#84cc16','#fb923c','#e879f9'];

// ── DonutChart ────────────────────────────────────────────────────────────────
function DonutChart({ title, data, isDark, canvasId }) {
  const ref = useRef(null);
  const inst = useRef(null);
  const [hovered, setHovered] = useState(-1);

  useEffect(()=>{
    if(!ref.current||!window.Chart||!data?.length)return;
    if(inst.current){ inst.current.destroy(); inst.current=null; }
    const ctx=ref.current.getContext('2d');
    if(!ctx)return;
    inst.current=new window.Chart(ctx,{
      type:'doughnut',
      data:{ labels:data.map(d=>d.label), datasets:[{ data:data.map(d=>d.value), backgroundColor:data.map(d=>d.color), borderWidth:0, hoverOffset:10, hoverBorderWidth:0 }] },
      options:{
        responsive:true, maintainAspectRatio:false, cutout:'65%', layout:{padding:10},
        plugins:{ legend:{display:false}, tooltip:{enabled:false} },
        animation:{duration:600},
        onHover:(_,els)=>{ setHovered(els.length>0?els[0].index:-1); },
      },
    });
    return()=>{ if(inst.current){inst.current.destroy();inst.current=null;} };
  },[data,isDark,canvasId]);

  const bg=isDark?'#111111':'#162030', bord=isDark?'#1e1e1e':'#2a3a52';
  const half=Math.ceil(data.length/2), col1=data.slice(0,half), col2=data.slice(half);

  return(
    <div style={{background:bg,borderRadius:8,border:'1px solid '+bord,padding:'14px 16px'}}>
      <div className="tax-label" style={{marginBottom:12}}>{title}</div>
      <div style={{display:'flex',alignItems:'center',gap:12}}>
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
                      <div style={{fontSize:11,color:isDark?'#aaa':'#8899bb',lineHeight:1.3}}>{d.label}</div>
                      <div style={{fontSize:12,fontWeight:700,color:isDark?'#fff':'#e0e8ff'}}>{d.value.toFixed(2)}%</div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div style={{width:150,height:150,flexShrink:0,overflow:'visible'}} onMouseLeave={()=>setHovered(-1)}>
          <canvas ref={ref} id={canvasId} style={{overflow:'visible'}}/>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function PortfolioAnalytics() {
  const [themeMode, setThemeMode] = useState(()=>localStorage.getItem('mft_theme')||'off');
  useEffect(()=>{
    const obs=new MutationObserver(()=>setThemeMode(document.documentElement.getAttribute('data-theme')||'off'));
    obs.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
    return()=>obs.disconnect();
  },[]);
  const isDark=themeMode==='dark';

  const [loading, setLoading]   = useState(true);
  const [error,   setError]     = useState('');
  const [fundsData, setFundsData] = useState([]);
  const [showRiskInfo, setShowRiskInfo] = useState(false);

  // ── Load fund_details + rolling returns ───────────────────────────────────
  useEffect(()=>{
    async function load() {
      try {
        const rows = await dbLoadAllHoldings();
        const codeToKey={};
        Object.entries(MF_FUNDS).forEach(([k,f])=>{ codeToKey[f.code]=k; });
        const mapped = rows
          .filter(r=>r.fund_info||r.holdings?.length)
          .map(r=>({
            fundCode:  r.fund_code,
            fundKey:   codeToKey[r.fund_code]||r.fund_code,
            name:      MF_FUNDS[codeToKey[r.fund_code]]?.name||r.fund_code,
            holdings:  r.holdings||[],
            fi:        r.fund_info||{},
            fetchedAt: r.fetched_at,
          }));
        setFundsData(mapped);


      } catch(e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  },[]);

  // ── Theme tokens ──────────────────────────────────────────────────────────
  const textPri = isDark?'#f0f0f0':'#e0e8ff';
  const textSec = isDark?'#aaa':'#9aaac8';
  const textDim = isDark?'#666':'#6b7a9a';
  const cardBg  = isDark?'#111111':'#162030';
  const cardBord= isDark?'#1e1e1e':'#2a3a52';
  const rowBord = isDark?'#1a1a1a':'#1e2840';
  const headBg  = isDark?'#0a0a0a':'#131b2a';

  if (loading) return(
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:16,height:'calc(100vh - 52px)'}}>
      <div style={{width:36,height:36,borderRadius:'50%',border:'3px solid '+(isDark?'#222':'#2a3348'),borderTopColor:'#c9a84c',animation:'spin 0.8s linear infinite'}}/>
      <div style={{fontSize:12,color:textSec}}>Loading analytics...</div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
  if (error) return <div style={{padding:40,color:'#f97316',textAlign:'center'}}>⚠ {error}</div>;
  if (!fundsData.length) return(
    <div style={{padding:40,textAlign:'center',color:textSec}}>
      <div style={{fontSize:14,fontWeight:700,color:textPri,marginBottom:8}}>No holdings data</div>
      <div style={{fontSize:12}}>Visit each fund page first to populate data.</div>
    </div>
  );

  const n=fundsData.length;

  // ── Aggregations ──────────────────────────────────────────────────────────
  // Asset allocation — dynamic keys, divide by count of funds that have each key
  const assetAgg={}, assetCount={};
  fundsData.forEach(({fi})=>{
    const aa=fi?.asset_allocation||{};
    Object.entries(aa).forEach(([k,v])=>{
      const val=parseFloat(v)||0;
      if(val<=0)return;
      assetAgg[k]=(assetAgg[k]||0)+val;
      assetCount[k]=(assetCount[k]||0)+1;
    });
  });
  const assetData=Object.entries(assetAgg)
    .map(([label,sum],i)=>({label,value:sum/assetCount[label],color:COLORS10[i%10]}))
    .filter(d=>d.value>0.01).sort((a,b)=>b.value-a.value);

  // Market cap — flat fields, divide by count of funds that have each field
  const capAgg={'Large Cap':0,'Mid Cap':0,'Small Cap':0}, capCount={'Large Cap':0,'Mid Cap':0,'Small Cap':0};
  fundsData.forEach(({fi})=>{
    if(fi?.large_cap!=null){capAgg['Large Cap']+=parseFloat(fi.large_cap)||0;capCount['Large Cap']++;}
    if(fi?.mid_cap!=null)  {capAgg['Mid Cap']  +=parseFloat(fi.mid_cap)||0;  capCount['Mid Cap']++;}
    if(fi?.small_cap!=null){capAgg['Small Cap']+=parseFloat(fi.small_cap)||0; capCount['Small Cap']++;}
  });
  const capData=[
    {label:'Large Cap',value:capCount['Large Cap']?(capAgg['Large Cap']/capCount['Large Cap']):0,color:'#7ab8ff'},
    {label:'Mid Cap',  value:capCount['Mid Cap']  ?(capAgg['Mid Cap']  /capCount['Mid Cap']  ):0,color:'#c9a84c'},
    {label:'Small Cap',value:capCount['Small Cap']?(capAgg['Small Cap']/capCount['Small Cap']):0,color:'#f97316'},
  ].filter(d=>d.value>0.01);

  // Equity sector — object, divide by count of funds that have each sector
  const eqSecAgg={}, eqSecCount={};
  fundsData.forEach(({fi})=>{
    Object.entries(fi?.equity_sector||{}).forEach(([k,v])=>{
      const val=parseFloat(v)||0; if(val<=0)return;
      eqSecAgg[k]=(eqSecAgg[k]||0)+val; eqSecCount[k]=(eqSecCount[k]||0)+1;
    });
  });
  const eqSecData=Object.entries(eqSecAgg)
    .map(([label,sum],i)=>({label,value:sum/eqSecCount[label],color:COLORS10[i%10]}))
    .filter(d=>d.value>0.01).sort((a,b)=>b.value-a.value);

  // Debt sector — same approach
  const dtSecAgg={}, dtSecCount={};
  fundsData.forEach(({fi})=>{
    Object.entries(fi?.debt_sector||{}).forEach(([k,v])=>{
      const val=parseFloat(v)||0; if(val<=0)return;
      dtSecAgg[k]=(dtSecAgg[k]||0)+val; dtSecCount[k]=(dtSecCount[k]||0)+1;
    });
  });
  const dtSecData=Object.entries(dtSecAgg)
    .map(([label,sum],i)=>({label,value:sum/dtSecCount[label],color:COLORS10[i%10]}))
    .filter(d=>d.value>0.01).sort((a,b)=>b.value-a.value);

  const showEqSec=eqSecData.length>0;
  const showDtSec=dtSecData.length>0;
  const eqSecTitle=showDtSec?'Equity Sector Allocation':'Sector Allocation (Equity)';
  const dtSecTitle=showEqSec?'Debt Sector Allocation':'Sector Allocation (Debt)';

  // Top stocks — equity only, divide by count of funds that have each stock
  const stockAgg={}, stockCount={};
  fundsData.forEach(({holdings})=>{
    holdings.filter(h=>h.nature==='EQUITY'&&parseFloat(h.corpus_per)>0).forEach(h=>{
      stockAgg[h.company]=(stockAgg[h.company]||0)+parseFloat(h.corpus_per);
      stockCount[h.company]=(stockCount[h.company]||0)+1;
    });
  });
  const topStocks=Object.entries(stockAgg)
    .map(([name,sum])=>([name,sum/stockCount[name]]))
    .sort((a,b)=>b[1]-a[1]).slice(0,25);
  const barMax=topStocks[0]?.[1]||1;

  return(
    <div style={{padding:20}}>
      {/* Header */}
      <div style={{marginBottom:20}}>
        <div style={{fontSize:18,fontWeight:800,color:textPri,letterSpacing:'-0.3px'}}>Portfolio Analytics</div>
      </div>

      {/* ── MAIN LAYOUT: Left donuts + Right stocks ─────────────────────── */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:20,alignItems:'start'}}>

        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          {/* Sector Allocation — equity + debt in one card */}
          {(showEqSec||showDtSec)&&(
            <div style={{background:cardBg,borderRadius:8,border:'1px solid '+cardBord,padding:'14px 16px'}}>
              <div className="tax-label" style={{marginBottom:12}}>Sector Allocation</div>
              <div style={{display:'flex',flexDirection:'column',gap:12}}>
                {showEqSec&&<DonutChart title={eqSecTitle} data={eqSecData} isDark={isDark} canvasId="pa-eqsec"/>}
                {showDtSec&&<DonutChart title={dtSecTitle} data={dtSecData} isDark={isDark} canvasId="pa-dtsec"/>}
              </div>
            </div>
          )}
          {capData.length>0
            ?<DonutChart title="Market Cap Split" data={capData} isDark={isDark} canvasId="pa-cap"/>
            :<div style={{background:cardBg,borderRadius:8,border:'1px solid '+cardBord,padding:'14px 16px'}}>
               <div className="tax-label" style={{marginBottom:8}}>Market Cap Split</div>
               <div style={{fontSize:12,color:textDim}}>No data — visit fund pages first</div>
             </div>
          }
          <DonutChart title="Asset Allocation" data={assetData} isDark={isDark} canvasId="pa-asset"/>
        </div>

        {/* RIGHT: Stock concentration + Fund Info per fund */}
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <div style={{background:cardBg,borderRadius:8,border:'1px solid '+cardBord,padding:'14px 16px'}}>
          <div className="tax-label" style={{marginBottom:12}}>Stock Concentration · Top 25</div>
          <div style={{display:'flex',flexDirection:'column',gap:7}}>
            {topStocks.map(([name,wt],i)=>(
              <div key={name} style={{display:'grid',gridTemplateColumns:'20px 1fr 56px',alignItems:'center',gap:8}}>
                <div style={{fontSize:10,color:textDim,textAlign:'right'}}>{i+1}</div>
                <div>
                  <div style={{fontSize:12,fontWeight:600,color:textPri,marginBottom:2}}>{name}</div>
                  <div style={{height:3,background:isDark?'#1e1e1e':'#1e2840',borderRadius:2}}>
                    <div style={{height:'100%',width:((wt/barMax)*100).toFixed(1)+'%',background:'#c9a84c',borderRadius:2}}/>
                  </div>
                </div>
                <div style={{fontSize:12,fontWeight:700,color:'#ffffff',textAlign:'right'}}>{wt.toFixed(2)}%</div>
              </div>
            ))}
          </div>
          </div>
        </div>
      </div>

      {/* ── FUND INFO TABLE ─────────────────────────────────────────────────── */}
      <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:12}}>
        <div style={{fontSize:11,fontWeight:700,color:textSec,textTransform:'uppercase',letterSpacing:'0.8px'}}>Fund Info</div>
        <button onClick={()=>setShowRiskInfo(true)} style={{background:'none',border:'none',cursor:'pointer',padding:0,display:'inline-flex',alignItems:'center',color:isDark?'#555':'#6b7a9a'}} title="What do these mean?">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7.5" stroke="currentColor" strokeWidth="1.2"/><text x="8" y="12" textAnchor="middle" fontSize="10" fill="currentColor" fontWeight="600">i</text></svg>
        </button>
      </div>
      {/* Fund Info popup */}
      {showRiskInfo&&(
        <div onClick={()=>setShowRiskInfo(false)} style={{position:'fixed',inset:0,background:isDark?'rgba(0,0,0,0.85)':'rgba(0,0,0,0.6)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div onClick={e=>e.stopPropagation()} style={{width:480,maxWidth:'94vw',padding:'16px 18px',background:isDark?'#111111':'#1a2235',border:`1px solid ${isDark?'#222':'#2a3348'}`,borderRadius:14}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
              <div style={{fontSize:14,fontWeight:700,color:isDark?'#e8e8e8':'#e0e8ff'}}>Fund Metrics Explained</div>
              <button onClick={()=>setShowRiskInfo(false)} style={{background:'none',border:'none',cursor:'pointer',color:isDark?'#555':'#6b7a9a',fontSize:18,lineHeight:1}}>✕</button>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
              {[
                {label:'Alpha',   color:'#34d399',text:'Measures fund performance vs benchmark. +1 means 1% outperformance; -1 means 1% underperformance. Higher is better.'},
                {label:'Beta',    color:'#7ab8ff',text:'Measures fund volatility vs market. Beta > 1 means more volatile; Beta < 1 means lower volatility.'},
                {label:'Sharpe',  color:'#c9a84c',text:'Return earned per unit of total risk. Sharpe of 1–3 or above indicates strong risk-adjusted returns. Higher is better.'},
                {label:'Sortino', color:'#c9a84c',text:'Like Sharpe but only penalises downside volatility. Sortino > 2 is considered good. Higher is better.'},
                {label:'Std Dev', color:'#a78bfa',text:'Measures how much fund returns fluctuate over time. Lower means more consistent; higher means more volatile.'},
                {label:'TER',     color:'#f97316',text:'Total Expense Ratio — annual fee charged by the fund house to manage the fund, expressed as a % of AUM. Lower is better.'},
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
      <div style={{background:cardBg,borderRadius:8,border:'1px solid '+cardBord,marginBottom:20,overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
          <thead>
            <tr style={{background:headBg}}>
              <th style={{textAlign:'left',padding:'8px 12px',color:textSec,fontWeight:700,borderBottom:'1px solid '+cardBord}}>Fund</th>
              {['AUM','TER','PE','PB','Alpha','Beta','Sharpe','Sortino','Std Dev'].map(h=>(
                <th key={h} style={{textAlign:'right',padding:'8px 12px',color:textSec,fontWeight:700,borderBottom:'1px solid '+cardBord,whiteSpace:'nowrap'}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {fundsData.map(({fundKey,name,fi})=>{
              const alphaV=fi?.alpha!=null?parseFloat(fi.alpha):null;
              const betaV= fi?.beta!=null ?parseFloat(fi.beta):null;
              const sharpeV=fi?.sharpe!=null?parseFloat(fi.sharpe):null;
              const sortinoV=fi?.sortino!=null?parseFloat(fi.sortino):null;
              const stdV=fi?.std_dev!=null?parseFloat(fi.std_dev):null;
              return(
                <tr key={fundKey} style={{borderBottom:'1px solid '+rowBord}}>
                  <td style={{padding:'9px 12px',color:textPri,fontWeight:600,fontSize:12,whiteSpace:'nowrap'}}>{name}</td>
                  <td style={{textAlign:'right',padding:'9px 12px',color:textPri,fontSize:12}}>{fi?.aum!=null?`₹${fi.aum} Cr`:'—'}</td>
                  <td style={{textAlign:'right',padding:'9px 12px',color:textPri,fontSize:12}}>{fi?.expense_ratio!=null?`${fi.expense_ratio}%`:'—'}</td>
                  <td style={{textAlign:'right',padding:'9px 12px',color:textPri,fontSize:12}}>{fi?.pe!=null?parseFloat(fi.pe).toFixed(2):'—'}</td>
                  <td style={{textAlign:'right',padding:'9px 12px',color:textPri,fontSize:12}}>{fi?.pb!=null?parseFloat(fi.pb).toFixed(2):'—'}</td>
                  <td style={{textAlign:'right',padding:'9px 12px',fontWeight:700,fontSize:12,color:alphaV==null?textDim:alphaV>0?'#34d399':alphaV<0?'#f87171':(isDark?'#fff':'#e0e8ff')}}>{alphaV==null?'—':alphaV.toFixed(2)}</td>
                  <td style={{textAlign:'right',padding:'9px 12px',fontWeight:700,fontSize:12,color:betaV==null?textDim:betaV<1?'#34d399':betaV>1?'#f87171':'#f97316'}}>{betaV==null?'—':betaV.toFixed(2)}</td>
                  <td style={{textAlign:'right',padding:'9px 12px',fontWeight:700,fontSize:12,color:sharpeV==null?textDim:sharpeV>=1?'#34d399':sharpeV<0?'#f87171':'#f97316'}}>{sharpeV==null?'—':sharpeV.toFixed(2)}</td>
                  <td style={{textAlign:'right',padding:'9px 12px',fontWeight:700,fontSize:12,color:sortinoV==null?textDim:sortinoV>=2?'#34d399':sortinoV<0?'#f87171':'#f97316'}}>{sortinoV==null?'—':sortinoV.toFixed(2)}</td>
                  <td style={{textAlign:'right',padding:'9px 12px',fontWeight:700,fontSize:12,color:stdV==null?textDim:(isDark?'#ffffff':'#e0e8ff')}}>{stdV==null?'—':stdV.toFixed(2)+'%'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── CAGR TABLE ─────────────────────────────────────────────────────── */}
      <div style={{fontSize:11,fontWeight:700,color:textSec,textTransform:'uppercase',letterSpacing:'0.8px',marginBottom:12}}>CAGR Returns</div>
      <div style={{background:cardBg,borderRadius:8,border:'1px solid '+cardBord,marginBottom:20,overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
          <thead>
            <tr style={{background:headBg}}>
              <th style={{textAlign:'left',padding:'8px 12px',color:textSec,fontWeight:700,borderBottom:'1px solid '+cardBord}}>Fund</th>
              {['1Y','3Y','5Y','7Y','10Y'].map(p=>(
                <th key={p} style={{textAlign:'right',padding:'8px 12px',color:textSec,fontWeight:700,borderBottom:'1px solid '+cardBord,whiteSpace:'nowrap'}}>{p}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {fundsData.map(({fundKey,name,fi})=>(
              <tr key={fundKey} style={{borderBottom:'1px solid '+rowBord}}>
                <td style={{padding:'9px 12px',color:textPri,fontWeight:600,fontSize:12}}>{name}</td>
                {['1y','3y','5y','7y','10y'].map(p=>{
                  const v=fi?.cagr?.[p]!=null?parseFloat(fi.cagr[p]):null;
                  return(
                    <td key={p} style={{textAlign:'right',padding:'9px 12px',fontWeight:700,fontSize:12,
                      color:v==null?textDim:v>0?'#34d399':v<0?'#f87171':textPri}}>
                      {v==null?'—':(v>0?'+':'')+v.toFixed(2)+'%'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>



      {/* ── DATA COVERAGE ─────────────────────────────────────────────────── */}
      <div style={{fontSize:11,fontWeight:700,color:textSec,textTransform:'uppercase',letterSpacing:'0.8px',marginBottom:12}}>Data Coverage</div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:10}}>
        {fundsData.map(({fundKey,name,holdings,fi,fetchedAt})=>(
          <div key={fundKey} style={{background:cardBg,borderRadius:8,border:'1px solid '+cardBord,padding:'10px 12px'}}>
            <div style={{fontSize:12,fontWeight:700,color:textPri,marginBottom:4}}>{name}</div>
            <div style={{fontSize:11,color:textSec,lineHeight:1.7}}>
              {holdings.filter(h=>h.nature==='EQUITY').length} equity · {holdings.filter(h=>h.nature!=='EQUITY').length} debt<br/>
              <span style={{color:fi?.equity_sector?'#34d399':textDim}}>{fi?.equity_sector?'Sector ✓':'No sector'}</span><br/>
              <span style={{color:textDim,fontSize:10}}>{fetchedAt?new Date(fetchedAt).toLocaleDateString('en-IN'):'Not fetched'}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
