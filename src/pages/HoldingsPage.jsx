import React, { useState, useEffect, useRef } from 'react';
import { MF_FUNDS } from '../constants/funds.js';
import useAppStore from '../store/useAppStore.js';

const HOLDINGS_KEY = 'mf_holdings_manual'; // localStorage key

// ── Load holdings for a fund from localStorage ────────────────────────────────
function loadManualHoldings(fundKey) {
  try {
    const raw = localStorage.getItem(HOLDINGS_KEY);
    if (!raw) return null;
    const all = JSON.parse(raw);
    return all[fundKey] || null;
  } catch { return null; }
}

// ── Donut chart (same as FundDetail) ─────────────────────────────────────────
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
        responsive:true, maintainAspectRatio:false, cutout:'65%',
        layout:{padding:10},
        plugins:{ legend:{display:false}, tooltip:{enabled:false} },
        animation:{duration:600},
        onHover:(_,elements)=>{ setHovered(elements.length>0?elements[0].index:-1); },
      },
    });
    return()=>{ if(inst.current){inst.current.destroy();inst.current=null;} };
  },[data,isDark,canvasId]);

  const bgCard=isDark?'#111111':'#162030';
  const border=isDark?'#1e1e1e':'#2a3a52';
  const half=Math.ceil(data.length/2);
  const col1=data.slice(0,half), col2=data.slice(half);

  return(
    <div style={{background:bgCard,borderRadius:8,border:'1px solid '+border,padding:'14px 16px'}}>
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
                      <div style={{fontSize:10,color:isDark?'#aaaaaa':'#8899bb',lineHeight:1.3}}>{d.label}</div>
                      <div style={{fontSize:11,fontWeight:700,color:isDark?'#ffffff':'#e0e8ff'}}>{d.value.toFixed(2)}%</div>
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

// ── Main HoldingsPage ─────────────────────────────────────────────────────────
export default function HoldingsPage({ fundKey }) {
  const setPage = useAppStore(s => s.setPage);
  const [themeMode, setThemeMode] = useState(()=>localStorage.getItem('mft_theme')||'off');
  useEffect(()=>{
    const obs=new MutationObserver(()=>setThemeMode(document.documentElement.getAttribute('data-theme')||'off'));
    obs.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
    return()=>obs.disconnect();
  },[]);
  const isDark = themeMode === 'dark';

  const fund = MF_FUNDS[fundKey];
  const [data, setData] = useState(()=>loadManualHoldings(fundKey));

  // Reload when fundKey changes
  useEffect(()=>{ setData(loadManualHoldings(fundKey)); },[fundKey]);

  const bg   = isDark?'#111111':'#162030';
  const bord = isDark?'#1e1e1e':'#2a3a52';
  const textSec = isDark?'#888':'#9aaac8';
  const textPri = isDark?'#e8e8e8':'#e0e8ff';

  if (!fund) return <div style={{padding:20,color:textSec}}>Fund not found.</div>;

  return(
    <div>
      {/* Header */}
      <div className="ph">
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <button onClick={()=>setPage(fundKey)} style={{background:'none',border:'none',color:textSec,cursor:'pointer',fontSize:18,lineHeight:1,padding:'0 4px'}}>←</button>
          <div className="pt">{fund.name} · Holdings</div>
          <span style={{fontSize:10,color:textSec,background:isDark?'#1a1a1a':'#1e2840',padding:'2px 8px',borderRadius:10,border:'1px solid '+bord}}>Manual Import</span>
        </div>
      </div>

      {!data && (
        <div style={{textAlign:'center',padding:'60px 20px',color:textSec}}>
          <div style={{fontSize:32,marginBottom:12}}>📂</div>
          <div style={{fontSize:14,fontWeight:700,color:textPri,marginBottom:8}}>No manual holdings data for {fund.name}</div>
          <div style={{fontSize:12,lineHeight:1.8}}>
            Go to Settings → ⬆ Import Statement → Holdings tab<br/>
            Import text or upload AMC Excel for this fund
          </div>
        </div>
      )}

      {data && (
        <div>
          {/* Meta bar */}
          <div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:16}}>
            <div className="tax-card" style={{padding:'6px 12px',display:'flex',gap:8,alignItems:'center'}}>
              <span className="tax-label">Source</span>
              <span style={{fontSize:11,color:'#c9a84c',fontWeight:700}}>{data.source==='amc_excel'?'AMC Excel':'Text Import'}</span>
            </div>
            {data.portfolioDate&&<div className="tax-card" style={{padding:'6px 12px',display:'flex',gap:8,alignItems:'center'}}>
              <span className="tax-label">Portfolio Date</span>
              <span style={{fontSize:11,color:textPri,fontWeight:700}}>{data.portfolioDate}</span>
            </div>}
            <div className="tax-card" style={{padding:'6px 12px',display:'flex',gap:8,alignItems:'center'}}>
              <span className="tax-label">Stocks</span>
              <span style={{fontSize:11,color:textPri,fontWeight:700}}>{data.holdings.filter(h=>parseFloat(h.weightage)>0).length}</span>
            </div>
            {data.importedAt&&<div className="tax-card" style={{padding:'6px 12px',display:'flex',gap:8,alignItems:'center'}}>
              <span className="tax-label">Imported</span>
              <span style={{fontSize:11,color:textSec}}>{new Date(data.importedAt).toLocaleDateString('en-IN')}</span>
            </div>}
          </div>

          {/* Charts: Sector donut + Asset allocation bar */}
          {(data.assetAllocation||data.sectors?.length>0)&&(
            <div style={{marginBottom:16}}>
              {/* Row 1: Sector donut (full width or side by side with asset donut) */}
              <div style={{display:'grid',gridTemplateColumns:data.assetAllocation?'1fr 1fr':'1fr',gap:12,marginBottom:12}}>
                {data.sectors?.length>0&&(
                  <DonutChart title="Sector Allocation"
                    data={data.sectors.slice(0,8).map((sec,i)=>({
                      label:sec.sector, value:parseFloat(sec.weightage)||0,
                      color:['#c9a84c','#34d399','#7ab8ff','#f97316','#a78bfa','#f87171','#06b6d4','#84cc16'][i%8],
                    }))}
                    isDark={isDark} canvasId={`donut-sector-${fundKey}`}
                  />
                )}
                {data.assetAllocation&&(
                  <DonutChart title="Asset Allocation"
                    data={[
                      {label:'Equity',value:parseFloat(data.assetAllocation.equity)||0,color:'#7ab8ff'},
                      {label:'Debt',value:parseFloat(data.assetAllocation.debt)||0,color:'#c9a84c'},
                      {label:'Cash',value:parseFloat(data.assetAllocation.cash)||0,color:'#34d399'},
                    ].filter(d=>d.value>0)}
                    isDark={isDark} canvasId={`donut-asset-${fundKey}`}
                  />
                )}
              </div>
            </div>
          )}

          {/* Holdings table */}
          <div className="tw">
            <div className="th2">
              <div className="tt">All Holdings · {data.holdings.filter(h=>parseFloat(h.weightage)>0).length} stocks</div>
            </div>
            <div className="tbl-scroll">
              <table className="tx-table">
                <thead><tr>
                  <th style={{width:28,textAlign:'center',paddingLeft:0,paddingRight:0}}>#</th>
                  <th style={{width:'50%'}}>Stock</th>
                  <th>Sector</th>
                  <th style={{textAlign:'right'}}>Mkt Val (Cr)</th>
                  <th style={{textAlign:'right'}}>Weight</th>
                </tr></thead>
                <tbody>
                  {data.holdings.filter(h=>parseFloat(h.weightage)>0).map((h,i)=>{
                    const wt=parseFloat(h.weightage)||0;
                    const barW=Math.min(wt/10*100,100);
                    return(
                      <tr key={i}>
                        <td style={{color:isDark?'#555':'#6b7a9a',fontSize:10,textAlign:'center',paddingLeft:0,paddingRight:0}}>{i+1}</td>
                        <td style={{paddingTop:7,paddingBottom:7}}>
                          <div style={{fontSize:12,fontWeight:600,color:textPri}}>{h.name}</div>
                          <div style={{height:3,background:isDark?'#1e1e1e':'#162030',borderRadius:2,marginTop:4,width:'90%'}}>
                            <div style={{height:'100%',width:barW+'%',background:'#c9a84c',borderRadius:2}}/>
                          </div>
                        </td>
                        <td style={{fontSize:12,color:isDark?'#c0c0c0':'#e0e8ff'}}>{h.sector||<span style={{color:textSec}}>—</span>}</td>
                        <td style={{textAlign:'right',fontSize:12,color:isDark?'#c0c0c0':'#e0e8ff'}}>{h.marketValue?(()=>{
                          const lakhs=parseFloat(h.marketValue);
                          if(!lakhs||isNaN(lakhs))return'—';
                          const cr=lakhs/100;
                          const fmt=n=>n.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
                          return cr>=1?`₹${fmt(cr)} Cr`:`₹${fmt(lakhs)} L`;
                        })():'—'}</td>
                        <td style={{textAlign:'right',fontSize:12,fontWeight:700,color:'#c9a84c'}}>{wt.toFixed(2)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
