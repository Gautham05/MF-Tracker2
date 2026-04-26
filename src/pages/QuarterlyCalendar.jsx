import React, { useMemo } from 'react';
import { navHistoryCache } from '../constants/funds.js';
import { getMFStats } from '../utils/mfStats.js';
import { fIN } from '../utils/formatters.js';

// Exact HTML buildCalendar logic — used for Dashboard and Insights quarterly calendar
export default function QuarterlyCalendar({ keys, db, amtHidden, compact=false }) {
  const now = new Date();
  const curYear  = now.getFullYear();
  const curQ     = Math.floor(now.getMonth()/3)+1;
  const now2Str  = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

  // Reactive theme detection
  const [themeMode, setThemeMode] = React.useState(()=>localStorage.getItem('mft_theme')||'off');
  React.useEffect(()=>{
    const obs = new MutationObserver(()=>setThemeMode(document.documentElement.getAttribute('data-theme')||'off'));
    obs.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
    return()=>obs.disconnect();
  },[]);
  const isDark = themeMode === 'dark';

  const { quarters, qReturns, years, totalInvestedAll } = useMemo(()=>{
    // ── Collect investments grouped by YYYY-Qx (exact HTML) ──────────────────
    const quarters = {};
    keys.forEach(k=>{
      const txs = db.mf[k]?.transactions || [];
      txs.forEach(tx=>{
        const d=new Date(tx.date), y=d.getFullYear(), q=Math.floor(d.getMonth()/3)+1;
        const qk = y+'-Q'+q;
        if(!quarters[qk]) quarters[qk] = {year:y, q, invested:0};
        if(tx.type==='Invested') quarters[qk].invested += Math.round(parseFloat(tx.amount||0)+parseFloat(tx.stamp||0));
      });
    });

    // ── Years list — always include current year (exact HTML) ─────────────────
    const txYears = Object.keys(quarters).map(k=>parseInt(k));
    const years = [...new Set([...txYears, curYear])].sort((a,b)=>b-a);

    // ── Build dateValMapQ with carry-forward NAV (exact HTML) ─────────────────
    // Collect all NAV dates across all funds
    const _allDatesSet = {};
    keys.forEach(k=>{ const h=navHistoryCache[k]; if(h) h.forEach(d=>{_allDatesSet[d.dateStr]=true;}); });
    const _allDates = Object.keys(_allDatesSet).sort();

    const dateValMapQ = {};
    keys.forEach(k=>{
      const h   = navHistoryCache[k];
      const txs = db.mf[k]?.transactions || [];
      if(!h||!h.length) return;
      // Build nav lookup by date
      const navByDate = {};
      h.forEach(d=>{ navByDate[d.dateStr]=d.nav; });
      let lastNav = 0;
      // Iterate every known date with carry-forward (exact HTML)
      _allDates.forEach(dt=>{
        if(navByDate[dt]) lastNav = navByDate[dt];
        if(!lastNav) return; // no NAV yet for this fund at all
        let units = 0;
        txs.forEach(t=>{ if(t.date<=dt){ units += t.type==='Invested' ? parseFloat(t.units||0) : -parseFloat(t.units||0); }});
        if(units > 0){
          if(!dateValMapQ[dt]) dateValMapQ[dt] = 0;
          dateValMapQ[dt] += units * lastNav;
        }
      });
    });
    const allNavDatesQ = Object.keys(dateValMapQ).sort();

    function getLastValOnOrBefore(ds){
      const d = allNavDatesQ.slice().reverse().find(d=>d<=ds);
      return d ? dateValMapQ[d] : 0;
    }

    // ── Quarter returns with HANDOFF (exact HTML) ─────────────────────────────
    const qReturns = {};
    let prevQEndVal = 0;
    let _prevQInited = false; // only initialise from pre-quarter data ONCE (exact HTML)

    const sortedYears = [...years].sort((a,b)=>a-b);
    sortedYears.forEach(y=>{
      [1,2,3,4].forEach(q=>{
        const qk = y+'-Q'+q;
        const isFuture = (y>curYear)||(y===curYear&&q>curQ);
        if(isFuture) return;

        const qStartStr = `${y}-${String((q-1)*3+1).padStart(2,'0')}-01`;
        const qEndDate  = new Date(y, q*3, 0);
        const qEndStr   = `${qEndDate.getFullYear()}-${String(qEndDate.getMonth()+1).padStart(2,'0')}-${String(qEndDate.getDate()).padStart(2,'0')}`;
        const isCurrentQ = y===curYear && q===curQ;
        const effectiveEndStr = isCurrentQ ? now2Str : qEndStr;

        // Handoff: first quarter only — look up pre-quarter value (exact HTML _prevQInited)
        if(!_prevQInited){
          const preStart = allNavDatesQ.slice().reverse().find(d=>d<qStartStr);
          prevQEndVal = preStart ? dateValMapQ[preStart] : 0;
          _prevQInited = true;
        }
        const startValue = prevQEndVal;
        const endValue   = getLastValOnOrBefore(effectiveEndStr);

        // Money added/redeemed this quarter + sipBase (exact HTML)
        let added=0, sipBase=0;
        keys.forEach(k=>{
          const txs = db.mf[k]?.transactions || [];
          txs.forEach(tx=>{
            if(tx.date>=qStartStr && tx.date<=effectiveEndStr){
              if(tx.type==='Invested'){
                const amt = Math.round(parseFloat(tx.amount||0)+parseFloat(tx.stamp||0));
                added   += amt;
                sipBase += parseFloat(tx.units||0)*parseFloat(tx.nav||0)+parseFloat(tx.stamp||0);
              } else {
                added -= parseFloat(tx.amount||0);
              }
            }
          });
        });

        if(endValue>0 || startValue>0){
          const qReturn = endValue - startValue - added;
          const qBase   = startValue + sipBase;
          if(!qReturns[qk]) qReturns[qk] = {ret:0, base:0};
          qReturns[qk].ret  += qReturn;
          qReturns[qk].base += qBase;
        }

        // Handoff (exact HTML) — carry this quarter's end value to next quarter
        prevQEndVal = endValue || prevQEndVal;
      });
    });

    // totalInvestedAll for % calc (exact HTML)
    const totalInvestedAll = keys.reduce((s,k)=>s+(getMFStats(k,db).totalInvested||0),0) || 1;

    return { quarters, qReturns, years, totalInvestedAll };
  },[keys, db]);

  // ── Best/worst (exact HTML) ───────────────────────────────────────────────
  const retVals    = Object.entries(qReturns).filter(([,v])=>v.ret!==0&&v.base>0);
  const bestQk     = retVals.length ? retVals.reduce((a,b)=>(b[1].ret/b[1].base)>(a[1].ret/a[1].base)?b:a)[0] : null;
  const worstQk    = retVals.length ? retVals.reduce((a,b)=>(b[1].ret/b[1].base)<(a[1].ret/a[1].base)?b:a)[0] : null;

  // ── Global invested % high/low (exact HTML) ───────────────────────────────
  const invPctMap  = {};
  Object.entries(quarters).forEach(([qk,qd])=>{ if(qd.invested>0) invPctMap[qk]=qd.invested/totalInvestedAll; });
  const invPctVals  = Object.values(invPctMap);
  const globalMaxPct = invPctVals.length ? Math.max(...invPctVals) : 0;
  const globalMinPct = invPctVals.length ? Math.min(...invPctVals) : 0;

  const qLabels  = ['Q1','Q2','Q3','Q4'];
  const qMonths  = ['Jan–Mar','Apr–Jun','Jul–Sep','Oct–Dec'];
  const hide = v => amtHidden ? '••••' : v;

  if(!years.length) return null;

  return(
    <div className={compact ? '' : 'cc'} style={{marginBottom: compact ? 0 : 16}}>
      {!compact && <div className="cct">Quarterly Investment & Returns Calendar</div>}
      <div style={{overflowX:'auto',scrollbarWidth:'none',msOverflowStyle:'none'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,tableLayout:'fixed'}}>
          <thead><tr>
            <td style={{color:'#9aaac8',padding:4,fontSize:11,fontWeight:700,width:'14%'}}>Year</td>
            {qLabels.map((ql,i)=>(
              <td key={ql} style={{color:'#c0ccdc',padding:4,fontSize:12,fontWeight:700,textAlign:'center',width:'21.5%'}}>
                {ql}<br/><span style={{fontSize:10,color:'#8899bb',fontWeight:600}}>{qMonths[i]}</span>
              </td>
            ))}
          </tr></thead>
          <tbody>
            {years.map(y=>{
              // Within-year best/worst (exact HTML — only if 2+ quarters)
              const yearRetEntries = Object.entries(qReturns).filter(([k])=>k.startsWith(y+'-Q')&&qReturns[k]?.ret!==0&&qReturns[k]?.base>0);
              const yearBestQk  = yearRetEntries.length>=2 ? yearRetEntries.reduce((a,b)=>(b[1].ret/b[1].base)>(a[1].ret/a[1].base)?b:a)[0] : null;
              const yearWorstQk = yearRetEntries.length>=2 ? yearRetEntries.reduce((a,b)=>(b[1].ret/b[1].base)<(a[1].ret/a[1].base)?b:a)[0] : null;
              // Within-year invested high/low (exact HTML — only if 2+ quarters)
              const yearInvEntries = Object.entries(quarters).filter(([k])=>k.startsWith(y+'-Q')&&quarters[k]?.invested>0);
              const yearInvPcts  = yearInvEntries.map(([,v])=>v.invested/totalInvestedAll);
              const yearMaxPct   = yearInvEntries.length>=2 ? Math.max(...yearInvPcts) : null;
              const yearMinPct   = yearInvEntries.length>=2 ? Math.min(...yearInvPcts) : null;

              return(
                <tr key={y}>
                  <td style={{color:'#c0ccdc',padding:4,fontWeight:700,fontSize:12}}>{y}</td>
                  {[1,2,3,4].map(q=>{
                    const qk     = y+'-Q'+q;
                    const qData  = quarters[qk];
                    const retObj = qReturns[qk];
                    const ret    = retObj?.ret  || 0;
                    const retBase= retObj?.base || 0;
                    const isFuture = (y>curYear)||(y===curYear&&q>curQ);

                    if(isFuture) return(
                      <td key={q} style={{padding:3,textAlign:'center'}}>
                        <div style={{background:isDark?'#0a0a0a':'#0d1117',border:`1px dashed ${isDark?'#1e1e1e':'#1e2840'}`,borderRadius:7,height:52,boxSizing:'border-box',overflow:'hidden'}}/>
                      </td>
                    );

                    // Background: global best/worst (exact HTML)
                    const isGlobalBest  = qk===bestQk;
                    const isGlobalWorst = qk===worstQk;
                    const bgColor = isGlobalBest?(isDark?'#0a1a0e':'#0d2a1f'):isGlobalWorst?(isDark?'#1a0a0a':'#2a0d0d'):(isDark?'#141414':'#162238');

                    // Border: within-year best/worst (exact HTML)
                    const isYearBest  = qk===yearBestQk;
                    const isYearWorst = qk===yearWorstQk;
                    let border='1px solid #2a3348', boxShadow='';
                    if(isYearBest) { border='2px solid #34d399'; boxShadow='0 0 5px rgba(52,211,153,0.35)'; }
                    else if(isYearWorst){ border='2px solid #f87171'; boxShadow='0 0 5px rgba(248,113,113,0.35)'; }

                    // Invested colour (exact HTML)
                    const qInvPct    = qData ? qData.invested/totalInvestedAll : 0;
                    const isGlobalHigh = qData && Math.abs(qInvPct-globalMaxPct)<0.0001;
                    const isGlobalLow  = qData && Math.abs(qInvPct-globalMinPct)<0.0001;
                    const isYearHigh   = !isGlobalHigh&&!isGlobalLow&&yearMaxPct!==null&&Math.abs(qInvPct-yearMaxPct)<0.0001;
                    const isYearLow    = !isGlobalHigh&&!isGlobalLow&&yearMinPct!==null&&Math.abs(qInvPct-yearMinPct)<0.0001;
                    const invAmtColor  = isGlobalHigh?'#c9a84c':isGlobalLow?'#7ab8ff':'#e0e8ff';
                    const invPctColor  = isGlobalHigh?'#c9a84c':isGlobalLow?'#7ab8ff':isYearHigh?'#c9a84c':isYearLow?'#7ab8ff':'#8899bb';

                    const retSign  = ret>=0?'+':'-';
                    const retColor = ret>=0?'#34d399':'#f87171';
                    const retPct   = retBase>0 ? Math.abs(ret/retBase*100).toFixed(2) : null;

                    return(
                      <td key={q} style={{padding:3,textAlign:'center'}}>
                        <div style={{background:bgColor,border,boxShadow,borderRadius:7,padding:'4px 3px',cursor:'default',height:52,boxSizing:'border-box',overflow:'hidden',display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center'}}>
                          {qData&&qData.invested>0 ? (
                            <>
                              <div style={{color:invAmtColor,fontSize:'10.5px',fontWeight:700,whiteSpace:'nowrap'}}>
                                {'₹'+fIN(qData.invested)}{' '}
                                <span style={{color:invPctColor,fontSize:'9.5px',fontWeight:600}}>({(qData.invested/totalInvestedAll*100).toFixed(1)}%)</span>
                              </div>
                              {ret
                                ? <div style={{color:retColor,fontSize:'10.5px',fontWeight:700,marginTop:2,whiteSpace:'nowrap'}}>{retSign+'₹'+fIN(Math.abs(ret))}{' '}<span style={{fontSize:'9.5px',fontWeight:500}}>({retSign}{retPct}%)</span></div>
                                : <div style={{color:'#4a5570',fontSize:10,marginTop:2}}>--</div>
                              }
                            </>
                          ) : (
                            <>
                              <div style={{color:'#6b7a9a',fontSize:'10.5px'}}>--</div>
                              {ret
                                ? <div style={{color:retColor,fontSize:'10.5px',fontWeight:700,marginTop:2,whiteSpace:'nowrap'}}>{retSign+'₹'+fIN(Math.abs(ret))}{' '}<span style={{fontSize:'9.5px',fontWeight:500}}>({retSign}{retPct}%)</span></div>
                                : null
                              }
                            </>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
