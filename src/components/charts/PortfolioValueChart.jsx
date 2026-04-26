import React, { useEffect, useRef, useState, useCallback } from 'react';
import { navHistoryCache } from '../../constants/funds.js';
import { filterDatesByTF } from '../../utils/mfStats.js';
import { fIN, fmtDate } from '../../utils/formatters.js';
import useAppStore from '../../store/useAppStore.js';
const TFS=['1M','3M','6M','1Y','3Y','5Y','All'];

// Left-to-right draw animation — exact HTML drawLinePlugin
const drawLinePlugin={
  id:'drawLine',
  beforeInit(chart){chart._ltrDone=false;chart._ltrStart=null;},
  afterRender(chart){chart._ltrDone=true;},
  beforeDraw(chart){
    if(chart._ltrDone)return;
    const now=performance.now();
    if(!chart._ltrStart)chart._ltrStart=now;
    const p=Math.min((now-chart._ltrStart)/900,1);
    if(p>=1){chart._ltrDone=true;return;}
    const{ctx:c2,canvas}=chart;
    c2.save();c2.beginPath();c2.rect(0,0,canvas.width*p,canvas.height);c2.clip();
    requestAnimationFrame(()=>chart.draw());
  },
  afterDraw(chart){if(!chart._ltrDone)chart.ctx.restore();}
};

export default function PortfolioValueChart({ canvasId, keys, db, defaultTF='3M', amtHidden, isFundPage=false }) {
  const chartRef=useRef(null);
  const chartInst=useRef(null);
  const hilowRef=useRef(null);
  const hilowMobileRef=useRef(null);
  const hoverRef=useRef(null);
  const [tf,setTf]=useState(defaultTF);
  const [curVal,setCurVal]=useState('--');
  const [invVal,setInvVal]=useState('--');
  const [retTxt,setRetTxt]=useState('');
  const [retColor,setRetColor]=useState('#e0e8ff');
  const [status,setStatus]=useState('');
  const hide=v=>amtHidden?'••••':v;
  // Refs for stable access without re-creating buildChart
  const keysRef=useRef(keys);
  const dbRef=useRef(db);
  useEffect(()=>{keysRef.current=keys;},[keys]);
  useEffect(()=>{dbRef.current=db;},[db]);

  // Full chart rebuild with LTR animation — uses refs, no closure deps
  const buildChart=useCallback((activeTf)=>{
    if(typeof window.Chart==='undefined')return;
    const keys=keysRef.current;
    const db=dbRef.current;
    const allHistory=[];
    for(const key of keys){if(navHistoryCache[key])allHistory.push(...navHistoryCache[key]);}
    if(!allHistory.length){setStatus('Refresh NAV to load chart data');return;}
    setStatus('');

    const allDates=[...new Set(allHistory.map(d=>d.dateStr))].sort();
    const filteredDates=filterDatesByTF(allDates,activeTf);
    if(!filteredDates.length)return;
    const startDate=filteredDates[0];

    function getNav(h,ds){let best=null;for(const d of h){if(d.dateStr<=ds)best=d;else break;}return best?best.nav:0;}

    let totalStartInvested=0,totalStartValue=0;
    for(const key of keys){
      const h=navHistoryCache[key],txs=db.mf[key]?.transactions||[];let u=0;
      txs.forEach(tx=>{if(tx.date<=startDate){if(tx.type==='Invested'){u+=parseFloat(tx.units||0);totalStartInvested+=Math.round(parseFloat(tx.amount||0)+parseFloat(tx.stamp||0));}else{u-=parseFloat(tx.units||0);totalStartInvested-=parseFloat(tx.amount||0);}}});
      if(h)totalStartValue+=Math.max(0,u)*getNav(h,startDate);
    }

    const curLine=[],invLine=[],addedLine=[],investedUpTo=[];
    for(const ds of filteredDates){
      let cur=0,added=0,cumInv=0;
      for(const key of keys){
        const h=navHistoryCache[key];if(!h)continue;
        const txs=db.mf[key]?.transactions||[];let u=0;
        txs.forEach(tx=>{if(tx.date<=ds){if(tx.type==='Invested'){u+=parseFloat(tx.units||0);cumInv+=Math.round(parseFloat(tx.amount||0)+parseFloat(tx.stamp||0));}else{u-=parseFloat(tx.units||0);cumInv-=parseFloat(tx.amount||0);}}});
        cur+=Math.max(0,u)*getNav(h,ds);
        txs.forEach(tx=>{if(tx.date>startDate&&tx.date<=ds){if(tx.type==='Invested')added+=Math.round(parseFloat(tx.amount||0)+parseFloat(tx.stamp||0));else added-=parseFloat(tx.amount||0);}});
      }
      curLine.push(cur);invLine.push(Math.max(0,totalStartInvested+added));
      addedLine.push(Math.max(0,added));investedUpTo.push(Math.max(0,cumInv));
    }

    const latestCur=curLine[curLine.length-1]||0;
    const latestInvested=investedUpTo[investedUpTo.length-1]||0;
    const latestAdded=addedLine[addedLine.length-1]||0;
    const periodRet=latestCur-(totalStartValue+latestAdded);
    const periodBase=totalStartValue+latestAdded;
    const periodPct=periodBase?(periodRet/periodBase*100):0;

    function setHeader(cur,inv){
      setCurVal('₹'+fIN(cur));setInvVal('₹'+fIN(inv));
      const r=cur-inv,rp=inv?(r/inv*100):0;
      setRetTxt((r>=0?'+':'-')+(amtHidden?'₹••••':'₹'+fIN(Math.abs(r)))+' ('+Math.abs(rp).toFixed(2)+'%)');
      setRetColor(r>=0?'#34d399':'#f87171');
    }

    function buildHoverHTML(dateStr){
      const sign=periodRet>=0?'+':'-';
      const rc=periodRet>=0?'#34d399':'#f87171';
      const dt=fmtDate(dateStr||filteredDates[filteredDates.length-1]);
      const rv=sign+(amtHidden?'₹••••':'₹'+fIN(Math.abs(periodRet)))+' ('+sign+Math.abs(periodPct).toFixed(2)+'%)';
      const at='Added in '+activeTf+': '+(amtHidden?'₹••••':'₹'+fIN(latestAdded));
      const isMob=window.innerWidth<=768;
      return '<span style="color:#c0ccdc;font-size:13px;font-weight:500;'+(isMob?'':'min-width:90px;display:inline-block;')+'">'+dt+'</span>'
        +'&nbsp;&nbsp;<span style="color:#c0ccdc;font-size:13px;font-weight:500">'+activeTf+' return</span>'
        +'&nbsp;&nbsp;<span style="color:'+rc+';font-size:13px;font-weight:700;'+(isMob?'':'min-width:120px;display:inline-block;')+'">'+rv+'</span>'
        +(isMob?'<br>':'&nbsp;&nbsp;')
        +'<span style="color:#c0ccdc;font-size:13px;font-weight:500">'+at+'</span>';
    }

    function showStatic(){
      setHeader(latestCur,latestInvested);
      if(hoverRef.current)hoverRef.current.innerHTML=buildHoverHTML(null);
    }

    // Full rebuild with LTR animation — exact HTML renderContent behavior
    if(chartInst.current){chartInst.current.destroy();chartInst.current=null;}
    const ctx=chartRef.current;if(!ctx)return;

    const ctx2d=ctx?.getContext('2d');if(!ctx2d)return;
    chartInst.current=new window.Chart(ctx2d,{
      type:'line',
      data:{labels:filteredDates,datasets:[
        {label:'Current',data:curLine,borderColor:'#7c83f5',backgroundColor:'rgba(124,131,245,0.07)',borderWidth:2.5,pointRadius:0,pointHoverRadius:5,tension:0.3,fill:false,order:1},
        {label:'Invested',data:invLine,borderColor:'#aabbcc',backgroundColor:'transparent',borderWidth:1.8,pointRadius:0,pointHoverRadius:4,tension:0,fill:false,order:2},
      ]},
      options:{
        responsive:true,maintainAspectRatio:false,
        interaction:{mode:'index',intersect:false},
        plugins:{legend:{display:false},tooltip:{enabled:false}},
        scales:{
          x:{type:'category',ticks:{color:'#8899bb',maxTicksLimit:6,font:{size:10}},grid:{display:false},border:{display:false}},
          y:{ticks:{color:'#8899bb',font:{size:10},callback:v=>'₹'+fIN(v)},grid:{display:false},border:{display:false}}
        },
        onHover:(evt,elements)=>{
          if(elements.length>0){const i=elements[0].index;setHeader(curLine[i]||0,investedUpTo[i]||0);if(hoverRef.current)hoverRef.current.innerHTML=buildHoverHTML(filteredDates[i]);}
          else{showStatic();}
        }
      },
      plugins:[drawLinePlugin]
    });

    // mouseleave restore
    const canvasEl=ctx;
    if(canvasEl._ml)canvasEl.removeEventListener('mouseleave',canvasEl._ml);
    canvasEl._ml=showStatic;canvasEl.addEventListener('mouseleave',canvasEl._ml);
    if(canvasEl._te)canvasEl.removeEventListener('touchend',canvasEl._te);
    canvasEl._te=()=>showStatic();canvasEl.addEventListener('touchend',canvasEl._te,{passive:true});

    showStatic();

    if(curLine.length&&hilowRef.current){
      const returns=curLine.map((v,i)=>v>0?v-(investedUpTo[i]||0):null).filter(v=>v!==null);
      if(returns.length){
        const hi=Math.max(...returns),lo=Math.min(...returns);
        const hiS=hi>=0?'+':'-',loS=lo>=0?'+':'-';
        const hiC=hi>=0?'#34d399':'#f87171',loC=lo>=0?'#34d399':'#f87171';
        hilowRef.current.innerHTML=
          '<span style="color:#6b7a9a">'+activeTf+' returns — High: </span>'
          +'<span style="color:'+hiC+';font-weight:600">'+hiS+'₹'+fIN(Math.abs(hi))+'</span>'
          +'&nbsp;&nbsp;<span style="color:#6b7a9a">Low: </span>'
          +'<span style="color:'+loC+';font-weight:600">'+loS+'₹'+fIN(Math.abs(lo))+'</span>';
          // Mobile footer: colored line indicators left, hilow right (exact HTML)
          if(hilowMobileRef.current)hilowMobileRef.current.innerHTML=
            '<span style="display:inline-flex;align-items:center;gap:6px;color:#9aaac8;">'
            +'<span style="display:inline-block;width:14px;height:2.5px;background:#7c83f5;border-radius:2px;"></span>Val'
            +'&nbsp;<span style="display:inline-block;width:14px;height:2px;background:#aabbcc;border-radius:2px;"></span>Inv'
            +'</span>'
            +'<span style="margin-left:auto;white-space:nowrap;color:#6b7a9a;">'
            +activeTf+' returns — High: <span style="color:'+hiC+'">'+hiS+'₹'+fIN(Math.abs(hi))+'</span>'
            +'&nbsp;Low: <span style="color:'+loC+'">'+loS+'₹'+fIN(Math.abs(lo))+'</span>'
            +'</span>';
      }
    }
  // eslint-disable-next-line
  },[amtHidden]);

  // Rebuild when tf changes OR navVersion changes (NAV refresh completed)
  // Rebuild when tf changes OR when db changes (NAV refresh completed)
  useEffect(()=>{buildChart(tf);},[tf,db,buildChart]);
  useEffect(()=>()=>{if(chartInst.current){chartInst.current.destroy();chartInst.current=null;}},[]);

  if(isFundPage){
    return(
      <div className="pvc-wrap" style={{marginBottom:0}}>
        {/* Header: values + TF top — exact HTML */}
        <div className="pvc-header pvc-header-fund">
          <div className="pvc-left" style={{gap:12}}>
            <div className="pvc-item">
              <div className="pvc-item-label"><span className="pvc-line-cur"></span>Current</div>
              <div className="pvc-val" style={{fontSize:16}}>{curVal}</div>
            </div>
            <div className="pvc-item">
              <div className="pvc-item-label"><span className="pvc-line-inv"></span>Invested</div>
              <div className="pvc-val" style={{fontSize:16}}>{invVal}</div>
            </div>
          </div>
          {/* pvc-ret-inner: shown on mobile only (inside header) */}
          <div className="pvc-ret-inner" style={{fontSize:13,fontWeight:700,color:retColor,display:'none'}}>{retTxt}</div>
          <div className="pvc-tf pvc-tf-top">
            {TFS.map(t=><button key={t} className={"tf-btn"+(tf===t?' tf-active':'')} onClick={()=>{setTf(t);userChangedTFRef.current=true;}}>{t}</button>)}
          </div>
        </div>
        {/* pvc-ret-pc: shown on desktop only */}
        <div className="pvc-ret-pc" style={{fontSize:13,fontWeight:700,height:20,color:retColor,marginBottom:2}}>{retTxt}</div>
        <div style={{height:13,fontSize:10,color:'#7080a0',marginBottom:4}}>{status}</div>
        <div ref={hoverRef} style={{height:'auto',minHeight:20,marginBottom:4,overflow:'visible',whiteSpace:'normal'}}/>
        <div style={{position:'relative',height:200}}><canvas ref={chartRef} id={canvasId}/></div>
        <div className="pvc-canvas-spacer" style={{height:16,marginTop:3}}/>
        {/* TF buttons below chart — shown on mobile only */}
        <div className="pvc-tf-bottom" style={{display:'none',justifyContent:'center',gap:3,flexWrap:'wrap'}}>
          {TFS.map(t=><button key={t} className={"tf-btn"+(tf===t?' tf-active':'')} onClick={()=>{setTf(t);userChangedTFRef.current=true;}}>{t}</button>)}
        </div>
        {/* Mobile footer: hilow below labels */}
        <div ref={hilowMobileRef} className="pvc-footer-mobile" style={{display:'none'}}/>
        {/* PC footer: all on one line */}
        <div className="pvc-footer-pc" style={{marginTop:8,display:'flex',gap:10,fontSize:10.5,color:'#9aaac8',flexWrap:'nowrap',alignItems:'center',overflow:'hidden'}}>
          <span style={{whiteSpace:'nowrap'}}><span className="pvc-line-cur" style={{marginRight:4}}/> Portfolio Value</span>
          <span style={{whiteSpace:'nowrap'}}><span className="pvc-line-inv" style={{marginRight:4}}/> Invested</span>
          <span ref={hilowRef} className="pvc-hilow-span" style={{fontSize:'9.5px',color:'#7080a0',marginLeft:'auto',whiteSpace:'nowrap'}}/>
        </div>
      </div>
    );
  }

  return(
    <div className="pvc-wrap">
      <div className="pvc-header">
        <div className="pvc-left">
          <div className="pvc-item">
            <div className="pvc-item-label"><span className="pvc-line-cur"></span>Current</div>
            <div className="pvc-val">{curVal}</div>
          </div>
          <div className="pvc-item">
            <div className="pvc-item-label"><span className="pvc-line-inv"></span>Invested</div>
            <div className="pvc-val">{invVal}</div>
          </div>
        </div>
        <div className="pvc-tf dash-pvc-tf-top">
          {TFS.map(t=><button key={t} className={"tf-btn"+(tf===t?' tf-active':'')} onClick={()=>setTf(t)}>{t}</button>)}
        </div>
      </div>
      <div style={{fontSize:13,fontWeight:700,height:20,color:retColor,marginBottom:2}}>{retTxt}</div>
      <div style={{height:13,fontSize:10,color:'#7080a0',marginBottom:4}}>{status}</div>
      <div ref={hoverRef} style={{height:'auto',minHeight:20,marginBottom:4,overflow:'visible',whiteSpace:'normal'}}/>
      <div style={{position:'relative',height:240}}><canvas ref={chartRef} id={canvasId}/></div>
      <div className="dash-pvc-tf-bottom" style={{display:'none',justifyContent:'center',gap:3,flexWrap:'wrap',marginTop:8,marginBottom:8}}>
        {TFS.map(t=><button key={t} className={"tf-btn"+(tf===t?' tf-active':'')} onClick={()=>setTf(t)}>{t}</button>)}
      </div>
      {/* Single footer - labels hidden on mobile via CSS, hilow stays right-aligned */}
      <div className="dash-pvc-footer" style={{marginTop:10,display:'flex',gap:14,fontSize:10.5,color:'#9aaac8',flexWrap:'nowrap',alignItems:'center',overflow:'hidden'}}>
        <span className="dash-pvc-line-labels" style={{whiteSpace:'nowrap'}}><span className="pvc-line-cur" style={{marginRight:4}}/> Current Portfolio Value</span>
        <span className="dash-pvc-line-labels" style={{whiteSpace:'nowrap'}}><span className="pvc-line-inv" style={{marginRight:4}}/> Total Invested</span>
        <span ref={hilowRef} style={{fontSize:'9.5px',color:'#7080a0',marginLeft:'auto',whiteSpace:'nowrap'}}/>
      </div>
    </div>
  );
}
