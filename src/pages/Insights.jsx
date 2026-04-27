import React, { useState, useMemo, useCallback } from 'react';
import useAppStore from '../store/useAppStore.js';
import { MF_FUNDS, navHistoryCache } from '../constants/funds.js';
import { fIN, fmtDate } from '../utils/formatters.js';
import ComparisonChart from '../components/charts/ComparisonChart.jsx';
import QuarterlyCalendar from './QuarterlyCalendar.jsx';

export default function Insights() {
  const db = useAppStore(s => s.db);
  const amtHidden = useAppStore(s => s.amtHidden);
  // Reactive theme detection - re-renders when theme changes
  const [themeMode, setThemeMode] = React.useState(()=>localStorage.getItem('mft_theme')||'off');
  React.useEffect(()=>{
    const obs = new MutationObserver(()=>setThemeMode(document.documentElement.getAttribute('data-theme')||'off'));
    obs.observe(document.documentElement, {attributes:true, attributeFilter:['data-theme']});
    return ()=>obs.disconnect();
  },[]);
  const isDark = themeMode === 'dark';
  const isLight = false;
  const keys = Object.keys(MF_FUNDS);
  const hide = v => amtHidden ? '••••' : v;

  // Calendar state
  const now = new Date();
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [selYear, setSelYear] = useState(now.getFullYear());
  const [qCalFund, setQCalFund] = useState('ALL');
  const [calFund, setCalFund] = useState('ALL');   // day calendar fund filter
  const [moFund, setMoFund] = useState('ALL');     // monthly table fund filter
  const [calTooltip, setCalTooltip] = useState('');

  const firstDate = useMemo(()=>{
    const allTx=[];keys.forEach(k=>(db.mf[k]?.transactions||[]).forEach(t=>allTx.push(new Date(t.date))));
    return allTx.length?new Date(Math.min(...allTx)):null;
  },[keys,db]);
  const startYr=firstDate?firstDate.getFullYear():now.getFullYear();

  if(!keys.length) return(
    <div className="insights-page"><div className="ph"><div className="pt">✦ Insights</div></div>
      <div style={{color:'#6b7a9a',padding:40,textAlign:'center'}}>Add funds and transactions to see insights.</div>
    </div>
  );

  // Build date→portfolio value map (carry-forward NAV)
  function buildDateValMap(ks){
    const _allDatesSet={};
    ks.forEach(k=>{const h=navHistoryCache[k];if(h)h.forEach(d=>{_allDatesSet[d.dateStr]=true;});});
    const _allDates=Object.keys(_allDatesSet).sort();
    const map={};
    ks.forEach(k=>{
      const h=navHistoryCache[k],txs=db.mf[k]?.transactions||[];
      if(!h||!h.length)return;
      const navByDate={};h.forEach(d=>{navByDate[d.dateStr]=d.nav;});
      let lastNav=0;
      _allDates.forEach(dt=>{
        if(navByDate[dt])lastNav=navByDate[dt];
        if(!lastNav)return;
        let units=0;txs.forEach(t=>{if(t.date<=dt){units+=t.type==='Invested'?parseFloat(t.units||0):-parseFloat(t.units||0);}});
        if(units>0){if(!map[dt])map[dt]=0;map[dt]+=units*lastNav;}
      });
    });
    return map;
  }
  const dateValMap = useMemo(()=>{
    const _allDatesSet={};
    keys.forEach(k=>{const h=navHistoryCache[k];if(h)h.forEach(d=>{_allDatesSet[d.dateStr]=true;});});
    const _allDates=Object.keys(_allDatesSet).sort();
    const map={};
    keys.forEach(k=>{
      const h=navHistoryCache[k],txs=db.mf[k]?.transactions||[];
      if(!h||!h.length)return;
      const navByDate={};h.forEach(d=>{navByDate[d.dateStr]=d.nav;});
      let lastNav=0;
      _allDates.forEach(dt=>{
        if(navByDate[dt])lastNav=navByDate[dt];
        if(!lastNav)return;
        let units=0;txs.forEach(t=>{if(t.date<=dt){units+=t.type==='Invested'?parseFloat(t.units||0):-parseFloat(t.units||0);}});
        if(units>0){if(!map[dt])map[dt]=0;map[dt]+=units*lastNav;}
      });
    });
    return map;
  },[keys,db]);
  const allNavDates = Object.keys(dateValMap).sort();
  // Filtered keys for each section
  const calKeys = calFund === 'ALL' ? keys : keys.filter(k => k === calFund);
  const moKeys  = moFund  === 'ALL' ? keys : keys.filter(k => k === moFund);

  function getDayPL(dateStr, ks=keys){
    const idx=allNavDates.indexOf(dateStr);if(idx<0)return null;
    const curVal=dateValMap[dateStr];if(idx===0)return null;
    const prevVal=dateValMap[allNavDates[idx-1]];if(!prevVal)return null;
    let newMoney=0;
    ks.forEach(k=>{(db.mf[k]?.transactions||[]).forEach(t=>{
      if(t.date===dateStr){if(t.type==='Invested')newMoney+=Math.round(parseFloat(t.amount||0)+parseFloat(t.stamp||0));else newMoney-=parseFloat(t.amount||0);}
    });});
    const chg=(curVal-prevVal)-newMoney;const pct=prevVal>0?(chg/prevVal*100):0;
    return{chg,pct};
  }

  // ── Day Calendar ── (exact HTML: 42 cells, colored bg with intensity, pill for text, gold dot for tx)
  function renderCalendar(){
    // Build filtered map for selected fund
    const calDVM = calFund==='ALL' ? dateValMap : buildDateValMap(calKeys);
    const calNavDates = Object.keys(calDVM).sort();
    function getCalDayPL(dateStr){
      const idx=calNavDates.indexOf(dateStr);if(idx<0)return null;
      const curVal=calDVM[dateStr];if(idx===0)return null;
      const prevVal=calDVM[calNavDates[idx-1]];if(!prevVal)return null;
      let newMoney=0;
      calKeys.forEach(k=>{(db.mf[k]?.transactions||[]).forEach(t=>{
        if(t.date===dateStr){if(t.type==='Invested')newMoney+=Math.round(parseFloat(t.amount||0)+parseFloat(t.stamp||0));else newMoney-=parseFloat(t.amount||0);}
      });});
      const chg=(curVal-prevVal)-newMoney;const pct=prevVal>0?(chg/prevVal*100):0;
      return{chg,pct};
    }
    const firstDay=new Date(calYear,calMonth,1).getDay();
    const daysInMonth=new Date(calYear,calMonth+1,0).getDate();
    const dayLabels=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    let profitDays=0,lossDays=0,tradingDays=0;

    const cells=[];
    // 42 fixed cells
    for(let cell=0;cell<42;cell++){
      const day=cell-firstDay+1;
      if(day<1||day>daysInMonth){cells.push(<div key={cell} style={{height:40}}/>);continue;}
      const mm=String(calMonth+1).padStart(2,'0'),dd=String(day).padStart(2,'0');
      const dateStr=`${calYear}-${mm}-${dd}`;
      const pl=getCalDayPL(dateStr);
      const chg=pl?pl.chg:null,pct=pl?pl.pct:null;
      if(chg!==null){tradingDays++;if(chg>0)profitDays++;else if(chg<0)lossDays++;}

      let bg=isLight?'#f0f2f5':isDark?'#141414':'#131c2e', border=isLight?'#dde3ed':isDark?'#1e1e1e':'#1e2840';
      if(chg!==null){
        const intensity=Math.min(Math.abs(pct)/2,1);
        if(chg>0){
          if(isLight){const gv=Math.round(180+intensity*60);bg=`rgba(20,${gv},80,0.15)`;border='#16a34a';}
          else{const gv=Math.round(40+intensity*60);bg=`rgba(20,${gv},35,0.85)`;border='#1e5030';}
        }
        else if(chg<0){
          if(isLight){const rv=Math.round(200+intensity*30);bg=`rgba(${rv},30,30,0.12)`;border='#dc2626';}
          else{const rv=Math.round(50+intensity*60);bg=`rgba(${rv},15,15,0.85)`;border='#5a1e1e';}
        }
        else{bg=isLight?'#e8ecf5':isDark?'#1a1a1a':'#1a2640';border=isLight?'#c8d0e0':isDark?'#282828':'#2a3560';}
      }

      const hasTx=calKeys.some(k=>(db.mf[k]?.transactions||[]).some(t=>t.date===dateStr));
      const amtStr=chg!==null?(chg>=0?'+':'−')+'₹'+fIN(Math.abs(Math.round(chg))):'';
      const pctStr=chg!==null?'('+(pct>=0?'+':'')+pct.toFixed(2)+'%)':'';
      const titleData=chg!==null?amtStr+' '+(pct>=0?'+':'')+pct.toFixed(2)+'%':'';

      cells.push(
        <div key={cell} onClick={()=>{
          if(!titleData){setCalTooltip('');return;}
          const txInfo=[];
          ks.forEach(k=>{(db.mf[k]?.transactions||[]).forEach(t=>{if(t.date===dateStr)txInfo.push(k+': '+(t.type==='Invested'?'Bought':'Sold')+' ₹'+fIN(parseFloat(t.amount||0)));});});
          setCalTooltip(`${dateStr}   P&L: ${titleData}${txInfo.length?' | '+txInfo.join(' | '):''}`);
        }}
          style={{background:bg,border:`1px solid ${border}`,borderRadius:5,cursor:chg!==null?'pointer':'default',height:40,overflow:'hidden',display:'flex',flexDirection:'column',justifyContent:'space-between',position:'relative',padding:'4px 5px',boxSizing:'border-box'}}>
          <div style={{fontSize:12,fontWeight:700,color:isLight?'rgba(0,0,0,0.4)':'rgba(255,255,255,0.4)',lineHeight:1}}>{day}</div>
          {chg!==null&&(
            <div style={{display:'flex',alignItems:'center',justifyContent:'center',marginTop:2}}>
              <div style={{background:'rgba(0,0,0,0.35)',borderRadius:4,padding:'2px 5px',display:'flex',gap:4,alignItems:'center'}}>
                <span style={{fontSize:10,fontWeight:700,color:chg>=0?'#34d399':'#f87171'}}>{amtStr}</span>
                <span style={{fontSize:10,color:chg>=0?'#34d399':'#f87171'}}>{pctStr}</span>
              </div>
            </div>
          )}
          {hasTx&&<div style={{width:4,height:4,borderRadius:'50%',background:'#c9a84c',position:'absolute',top:4,right:4}}/>}
        </div>
      );
    }

    return(
      <div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:3}}>
          {dayLabels.map(d=><div key={d} style={{textAlign:'center',fontSize:10,fontWeight:700,color:'#6b7a9a',padding:'4px 0'}}>{d}</div>)}
          {cells}
        </div>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:8,flexWrap:'wrap',gap:6}}>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <div style={{display:'flex',alignItems:'center',gap:4}}><div style={{width:10,height:10,borderRadius:2,background:'rgba(20,80,35,0.85)',border:'1px solid #1e5030'}}/><span style={{fontSize:10,color:'#6b7a9a'}}>Gain</span></div>
            <div style={{display:'flex',alignItems:'center',gap:4}}><div style={{width:10,height:10,borderRadius:2,background:'rgba(80,15,15,0.85)',border:'1px solid #5a1e1e'}}/><span style={{fontSize:10,color:'#6b7a9a'}}>Loss</span></div>
            <div style={{display:'flex',alignItems:'center',gap:4}}><div style={{width:4,height:4,borderRadius:'50%',background:'#c9a84c'}}/><span style={{fontSize:10,color:'#6b7a9a'}}>Transaction</span></div>
          </div>
          {tradingDays>0&&<div style={{fontSize:10,color:'#8899bb'}}>
            <span style={{color:'#34d399',fontWeight:700}}>{profitDays} profit</span>
            {' '}&nbsp;<span style={{color:'#f87171',fontWeight:700}}>{lossDays} loss</span>
            {' / '}{tradingDays} trading days
          </div>}
        </div>
      </div>
    );
  }

  // ── Monthly Summary ── (handoff approach like HTML)
  function getMonthlyData(year, ks=keys){
    const now2=new Date(),curYear=now2.getFullYear(),curMon=now2.getMonth()+1;
    const now2Str=`${curYear}-${String(curMon).padStart(2,'0')}-${String(now2.getDate()).padStart(2,'0')}`;
    const monthNames=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const months=[];
    let prevEndVal=0;
    for(let m=1;m<=12;m++){
      const mStr=`${year}-${String(m).padStart(2,'0')}`;
      const mStartStr=mStr+'-01';
      const lastDay=new Date(year,m,0).getDate();
      const mEndStr=`${mStr}-${String(lastDay).padStart(2,'0')}`;
      const isCurrent=year===curYear&&m===curMon;
      const isFuture=(year>curYear)||(year===curYear&&m>curMon);
      if(isFuture){months.push({m,label:monthNames[m-1],isFuture:true});continue;}
      const effectiveEnd=isCurrent?now2Str:mEndStr;

      if(m===1||prevEndVal===0){
        // Use dates filtered to this fund set
        const moDVM=ks===keys?dateValMap:buildDateValMap(ks);
        const moNavDts=Object.keys(moDVM).sort();
        const preStart=moNavDts.slice().reverse().find(d=>d<mStartStr);
        prevEndVal=preStart?moDVM[preStart]:0;
      }

      let invested=0,redeemed=0,sipBase=0,hasData=false,endVal=0;
      ks.forEach(k=>{
        const hist=navHistoryCache[k],txs=db.mf[k]?.transactions||[];
        if(!hist||!hist.length)return;
        const navEndEntry=hist.slice().reverse().find(d=>d.dateStr<=effectiveEnd);
        const navEnd=(navEndEntry?.nav)||(isCurrent?(db.navData[k]?.nav||0):0)||0;
        if(!navEnd)return;
        let unitsEnd=0;txs.forEach(t=>{if(t.date<=effectiveEnd){unitsEnd+=t.type==='Invested'?parseFloat(t.units||0):-parseFloat(t.units||0);}});
        endVal+=Math.max(0,unitsEnd)*navEnd;
        txs.forEach(t=>{if(t.date>=mStartStr&&t.date<=effectiveEnd){
          if(t.type==='Invested'){const amt=Math.round(parseFloat(t.amount||0)+parseFloat(t.stamp||0));invested+=amt;sipBase+=parseFloat(t.units||0)*parseFloat(t.nav||0)+parseFloat(t.stamp||0);}
          else{redeemed+=parseFloat(t.amount||0);}
        }});
        if(unitsEnd>0||prevEndVal>0)hasData=true;
      });
      const added=invested-redeemed;
      const ret=hasData?(endVal-prevEndVal-added):0;
      const base=prevEndVal+sipBase;
      months.push({m,label:monthNames[m-1],mStr,invested,redeemed,ret,base,endVal,hasData,isFuture:false,isCurrent});
      prevEndVal=endVal;
    }
    return months;
  }
  const monthlyData=getMonthlyData(selYear,moKeys);
  const valid=monthlyData.filter(x=>x.hasData&&x.base>0&&!x.isFuture);
  const bestM=valid.length?valid.reduce((a,b)=>(b.ret/b.base)>(a.ret/a.base)?b:a):null;
  const worstM=valid.length?valid.reduce((a,b)=>(b.ret/b.base)<(a.ret/a.base)?b:a):null;

  function calNav(dir){
    let m=calMonth+dir,y=calYear;
    if(m>11){m=0;y++;}if(m<0){m=11;y--;}
    // Clamp to first tx month
    if(firstDate){const minYr=firstDate.getFullYear(),minMo=firstDate.getMonth();if(y<minYr||(y===minYr&&m<minMo)){m=minMo;y=minYr;}}
    setCalMonth(m);setCalYear(y);setCalTooltip('');
  }

  const months=['January','February','March','April','May','June','July','August','September','October','November','December'];

  return(
    <div className="insights-page">
      <div className="ph"><div className="pt">✦ Insights</div></div>

      {/* ROW 1: Day Calendar (full width) */}
      <div className="cc" style={{marginBottom:16}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
          <div className="cct" style={{marginBottom:0}}>P&L Calendar — Daily Portfolio Change</div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <button onClick={()=>calNav(-1)} style={{background:isLight?'#fff':isDark?'#111':'#1a2235',border:`1px solid ${isDark?'#222':'#2a3348'}`,color:isLight?'#b8921e':'#c9a84c',width:26,height:26,borderRadius:5,cursor:'pointer',fontSize:14}}>‹</button>
            <span id="ins-cal-label" style={{fontSize:13,fontWeight:700,color:'#e0e8ff',minWidth:90,textAlign:'center'}}>{months[calMonth]} {calYear}</span>
            <button onClick={()=>calNav(1)} style={{background:isLight?'#fff':isDark?'#111':'#1a2235',border:`1px solid ${isDark?'#222':'#2a3348'}`,color:isLight?'#b8921e':'#c9a84c',width:26,height:26,borderRadius:5,cursor:'pointer',fontSize:14}}>›</button>
            <select value={calFund} onChange={e=>setCalFund(e.target.value)} style={{background:isDark?'#111':'#1a2235',border:`1px solid ${isDark?'#222':'#2a3348'}`,color:'#c9a84c',padding:'4px 8px',borderRadius:6,fontSize:11,outline:'none',cursor:'pointer'}}>
              <option value="ALL">All Funds</option>
              {keys.map(k=><option key={k} value={k}>{k}</option>)}
            </select>
          </div>
        </div>
        <div id="ins-cal-body">{renderCalendar()}</div>
        <div id="ins-cal-tooltip" style={{fontSize:11,color:'#9aaac8',minHeight:16,marginTop:8,textAlign:'center'}}>{calTooltip}</div>
      </div>

      {/* ROW 2: Monthly Summary (65%) + Quarterly (35%) */}
      <div className="ins-monthly-quarterly" style={{display:'grid',gridTemplateColumns:'65fr 35fr',gap:14,marginBottom:16}}>
        {/* Monthly */}
        <div className="cc" style={{marginBottom:0}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
            <div className="cct" style={{marginBottom:0}}>Monthly Summary</div>
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <select id="ins-cal-year" value={selYear} onChange={e=>{setSelYear(parseInt(e.target.value));}} style={{background:isDark?'#111':'#1a2235',border:`1px solid ${isDark?'#222':'#2a3348'}`,color:'#c9a84c',padding:'4px 8px',borderRadius:6,fontSize:11,outline:'none'}}>
                {Array.from({length:now.getFullYear()-startYr+1},(_,i)=>now.getFullYear()-i).map(y=><option key={y} value={y}>{y}</option>)}
              </select>
              <select value={moFund} onChange={e=>setMoFund(e.target.value)} style={{background:isDark?'#111':'#1a2235',border:`1px solid ${isDark?'#222':'#2a3348'}`,color:'#c9a84c',padding:'4px 8px',borderRadius:6,fontSize:11,outline:'none',cursor:'pointer'}}>
                <option value="ALL">All Funds</option>
                {keys.map(k=><option key={k} value={k}>{k}</option>)}
              </select>
            </div>
          </div>
          <div id="ins-monthly-body">
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,tableLayout:'fixed'}}>
              <thead><tr style={{borderBottom:`1px solid ${isDark?'#222':'#2a3348'}`}}>
                <th style={{textAlign:'left',padding:'6px 8px',color:'#8899bb',fontSize:10,fontWeight:700}}>MONTH</th>
                <th style={{textAlign:'right',padding:'6px 8px',color:'#8899bb',fontSize:10,fontWeight:700}}>INVESTED</th>
                <th style={{textAlign:'right',padding:'6px 8px',color:'#8899bb',fontSize:10,fontWeight:700}}>REDEEMED</th>
                <th style={{textAlign:'right',padding:'6px 8px',color:'#8899bb',fontSize:10,fontWeight:700}}>RETURN</th>
                <th style={{textAlign:'right',padding:'6px 8px',color:'#8899bb',fontSize:10,fontWeight:700}}>RETURN %</th>
              </tr></thead>
              <tbody>
                {monthlyData.map(mo=>{
                  if(mo.isFuture)return<tr key={mo.m}><td style={{padding:'5px 8px',color:'#3a4560'}}>{mo.label}</td><td colSpan={4}></td></tr>;
                  const retPct=mo.hasData&&mo.base>0?(mo.ret/mo.base*100):null;
                  const retColor=retPct===null?'#6b7a9a':retPct>=0?'#34d399':'#f87171';
                  const isBest=bestM&&mo.m===bestM.m,isWorst=worstM&&mo.m===worstM.m;
                  const rowBg=isBest?'rgba(52,211,153,0.06)':isWorst?'rgba(248,113,113,0.06)':'';
                  return(
                    <tr key={mo.m} style={{borderBottom:`1px solid ${isDark?'#111':'#1a2235'}`,background:rowBg}}>
                      <td style={{padding:'5px 8px',color:'#d0d8f0',fontWeight:mo.isCurrent?700:500}}>
                        {mo.label}
                        {mo.isCurrent&&<span style={{fontSize:9,color:'#c9a84c',marginLeft:4}}>(now)</span>}
                        {isBest&&<span style={{fontSize:9,background:'#1e4a2a',color:'#34d399',borderRadius:3,padding:'1px 4px',marginLeft:4}}>BEST</span>}
                        {isWorst&&<span style={{fontSize:9,background:'#4a1e1e',color:'#f87171',borderRadius:3,padding:'1px 4px',marginLeft:4}}>WORST</span>}
                      </td>
                      <td style={{padding:'5px 8px',textAlign:'right',color:'#9aaac8'}}>{mo.invested?'₹'+fIN(Math.round(mo.invested)):'--'}</td>
                      <td style={{padding:'5px 8px',textAlign:'right',color:'#f87171'}}>{mo.redeemed?'₹'+fIN(Math.round(mo.redeemed)):'--'}</td>
                      <td style={{padding:'5px 8px',textAlign:'right',color:retColor}}>{mo.hasData?(mo.ret>=0?'+':'−')+'₹'+fIN(Math.abs(Math.round(mo.ret))):'--'}</td>
                      <td style={{padding:'5px 8px',textAlign:'right',color:retColor,fontWeight:700}}>{retPct!==null?(retPct>=0?'+':'')+retPct.toFixed(2)+'%':'--'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Quarterly (same as QuarterlyCalendar component, compact for insights) */}
        <div className="cc" style={{marginBottom:0,display:'flex',flexDirection:'column'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
            <div className="cct" style={{marginBottom:0}}>Quarterly</div>
            <select id="ins-cal-fund" value={qCalFund} onChange={e=>setQCalFund(e.target.value)} style={{background:isDark?'#111':'#1a2235',border:`1px solid ${isDark?'#222':'#2a3348'}`,color:'#c9a84c',padding:'4px 8px',borderRadius:6,fontSize:11,outline:'none',cursor:'pointer'}}>
              <option value="ALL">All</option>
              {keys.map(k=><option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div id="ins-qcal-container" style={{overflowY:'auto',flex:1,scrollbarWidth:'none',msOverflowStyle:'none'}}>
            <QuarterlyCalendar keys={qCalFund==='ALL'?keys:[qCalFund]} db={db} amtHidden={amtHidden} compact={true}/>
          </div>
        </div>
      </div>

      {/* ROW 3: Fund Performance Comparison */}
      <div className="cc" style={{marginBottom:16}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
          <div className="cct" style={{marginBottom:0}}>Fund Performance Comparison</div>
        </div>
        <div id="ins-rolling-body">
          <ComparisonChart db={db}/>
        </div>
      </div>
    </div>
  );
}
