import React, { useEffect, useRef, useCallback } from 'react';
import { navHistoryCache } from '../../constants/funds.js';
import { getMFStats, filterByTF } from '../../utils/mfStats.js';
import { fmtDate, fIN } from '../../utils/formatters.js';
import useAppStore from '../../store/useAppStore.js';
const TFS=['1M','3M','6M','1Y','3Y','5Y','All'];

const drawLinePlugin={
  id:'drawLineNav',
  beforeInit(chart){chart._ltrDone=false;chart._ltrStart=null;},
  afterRender(chart){chart._ltrDone=true;},
  beforeDraw(chart){
    if(chart._ltrDone)return;
    const now=performance.now();if(!chart._ltrStart)chart._ltrStart=now;
    const p=Math.min((now-chart._ltrStart)/900,1);
    if(p>=1){chart._ltrDone=true;return;}
    const{ctx:c2,canvas}=chart;
    c2.save();c2.beginPath();c2.rect(0,0,canvas.width*p,canvas.height);c2.clip();
    requestAnimationFrame(()=>chart.draw());
  },
  afterDraw(chart){if(!chart._ltrDone)chart.ctx.restore();}
};

export default function NAVChart({ fundKey, db, tf, onTFChange, amtHidden }) {
  const navVersion = useAppStore(s => s.navVersion);
  const chartRef=useRef(null);
  const chartInst=useRef(null);
  const hoverRef=useRef(null);
  const hideRef=useRef(v=>amtHidden?'••••':v);
  useEffect(()=>{hideRef.current=v=>amtHidden?'••••':v;},[amtHidden]);
  const dbRef=useRef(db);
  useEffect(()=>{dbRef.current=db;},[db]);
  // Track if user has manually changed TF — if not, show 52W hi/lo (exact HTML)
  const userChangedTFRef=useRef(false);

  const build=useCallback(()=>{
    if(typeof window.Chart==='undefined')return;
    const db=dbRef.current;
    const h=navHistoryCache[fundKey];
    if(!h||!h.length)return;
    const filtered=filterByTF(h,tf);
    if(!filtered.length)return;
    const txs=db.mf[fundKey]?.transactions||[];
    const s=getMFStats(fundKey,db);
    const avgNav=s.avgNav||0;

    const firstNav=filtered[0].nav,lastNav=filtered[filtered.length-1].nav;
    const perfPct=((lastNav-firstNav)/firstNav*100);
    const isUp=perfPct>=0;
    const lineColor=isUp?'#22c55e':'#ef4444';
    const fillColor=isUp?'rgba(34,197,94,0.12)':'rgba(239,68,68,0.10)';

    const perfEl=document.getElementById('nav-perf-'+fundKey);
    if(perfEl){
      perfEl.textContent='NAV: '+(isUp?'+':'-')+'₹'+Math.abs(lastNav-firstNav).toFixed(2)+' ('+(isUp?'+':'-')+Math.abs(perfPct).toFixed(2)+'%) ('+tf+')';
      perfEl.style.color=lineColor;
    }
    const d1El=document.getElementById('nav-1d-'+fundKey);
    if(h.length>=2&&d1El){
      const p2=h[h.length-2].nav,c2=h[h.length-1].nav;
      const ch=(c2-p2),chp=(ch/p2*100);const up2=ch>=0;
      d1El.textContent=(up2?'+':'-')+'₹'+Math.abs(ch).toFixed(2)+' ('+(up2?'+':'-')+Math.abs(chp).toFixed(2)+'%) 1D';
      d1El.style.color=up2?'#34d399':'#f87171';
    }

    // Thin labels
    let finalLabels=filtered.map(d=>fmtDate(d.dateStr));
    let finalNavVals=filtered.map(d=>d.nav);
    if(finalLabels.length>500){
      const step=Math.ceil(finalLabels.length/400);
      const kept=[];finalLabels.forEach((_,i)=>{if(i%step===0||i===finalLabels.length-1)kept.push(i);});
      finalLabels=kept.map(i=>fmtDate(filtered[i].dateStr));finalNavVals=kept.map(i=>filtered[i].nav);
    }
    const labelIndexMap={};finalLabels.forEach((l,i)=>labelIndexMap[l]=i);

    // TX scatter dots — EXACT HTML approach with pointHoverRadius:12 for grow-on-hover
    const txMap={};txs.forEach(tx=>{if(tx.date){if(!txMap[tx.date])txMap[tx.date]=[];txMap[tx.date].push(tx);}});
    const filteredStart=filtered[0].dateStr,filteredEnd=filtered[filtered.length-1].dateStr;
    const dots=[];
    Object.entries(txMap).forEach(([txDate,dayTxs])=>{
      if(txDate<filteredStart||txDate>filteredEnd)return;
      let matchDate=null;for(let i=filtered.length-1;i>=0;i--){if(filtered[i].dateStr<=txDate){matchDate=filtered[i];break;}}
      if(!matchDate)return;
      let labelIdx=labelIndexMap[fmtDate(matchDate.dateStr)];
      if(labelIdx===undefined){let bestDiff=Infinity;finalLabels.forEach((l,i)=>{const lp=l.split('-');const ld=lp.length===3?new Date(lp[2]+'-'+lp[1]+'-'+lp[0]):new Date(l);const diff=Math.abs(ld-new Date(matchDate.dateStr));if(diff<bestDiff){bestDiff=diff;labelIdx=i;}});}
      if(labelIdx===undefined)return;
      const a=dayTxs.reduce((s,t)=>s+parseFloat(t.amount||0)+parseFloat(t.stamp||0),0);
      const u=dayTxs.reduce((s,t)=>s+parseFloat(t.units||0),0);
      dots.push({x:finalLabels[labelIdx],y:matchDate.nav,_amt:a,_units:u,_nav:matchDate.nav,_date:txDate,_type:dayTxs[0].type});
    });

    // Avg NAV plugin
    const avgLabelPlugin={id:'avgLabel',afterDraw(chart){
      if(!avgNav||avgNav<=0)return;
      const{ctx:c3,chartArea:{left,right},scales}=chart;
      const yPos=scales.y.getPixelForValue(avgNav);
      if(yPos<scales.y.top||yPos>scales.y.bottom)return;
      c3.save();c3.beginPath();c3.strokeStyle='#c9a84c';c3.lineWidth=1.5;c3.setLineDash([4,4]);
      c3.moveTo(left,yPos);c3.lineTo(right,yPos);c3.stroke();c3.setLineDash([]);
      const lbl='₹'+avgNav.toFixed(2);c3.font='bold 10px Segoe UI,system-ui,sans-serif';
      const tw=c3.measureText(lbl).width,pad=5,bw=tw+pad*2,bh=18,mx=(left+right)/2;
      c3.fillStyle='rgba(26,34,53,0.85)';c3.strokeStyle='#c9a84c';c3.lineWidth=1;
      c3.beginPath();c3.roundRect(mx-bw/2,yPos-bh-4,bw,bh,4);c3.fill();c3.stroke();
      c3.fillStyle='#c9a84c';c3.textAlign='center';c3.textBaseline='middle';
      c3.fillText(lbl,mx,yPos-bh/2-4);c3.restore();
    }};

    if(chartInst.current){chartInst.current.destroy();chartInst.current=null;}
    const ctx=chartRef.current;if(!ctx)return;

    chartInst.current=new window.Chart(ctx.getContext('2d'),{
      type:'line',
      data:{labels:finalLabels,datasets:[
        // NAV line — PVC-style: hover anywhere shows tooltip
        {label:'NAV',data:finalNavVals,borderColor:lineColor,backgroundColor:fillColor,
         borderWidth:2,pointRadius:0,pointHoverRadius:5,
         pointHoverBackgroundColor:'#7ab8ff',pointHoverBorderColor:'#ffffff',pointHoverBorderWidth:2,
         tension:0.3,fill:true,order:2},
        // TX dots — scatter with grow-on-hover (exact HTML: pointRadius:8, pointHoverRadius:12)
        {label:'Tx',data:dots,type:'scatter',parsing:{xAxisKey:'x',yAxisKey:'y'},
         pointRadius:dots.map(()=>8),
         pointHoverRadius:12,
         pointHitRadius:20,
         pointBackgroundColor:dots.map(p=>p._type==='Invested'?'#c9a84c':'#f87171'),
         pointBorderColor:'#0d1117',pointBorderWidth:2,
         pointHoverBackgroundColor:dots.map(p=>p._type==='Invested'?'#f0c96a':'#fca5a5'),
         showLine:false,order:1}
      ]},
      options:{responsive:true,maintainAspectRatio:false,
        // Exact HTML: nearest+intersect:true — tooltip only on direct hover
        interaction:{mode:'nearest',intersect:true},
        plugins:{legend:{display:false},
          tooltip:{
            backgroundColor:'#1a2235',titleColor:'#e0e8ff',bodyColor:'#c0ccdc',
            borderColor:'#3a4560',borderWidth:1,padding:10,cornerRadius:8,displayColors:false,
            callbacks:{
              title:(items)=>{
                // If tx dot hovered (nearest), show tx date; else show label date
                const txItem=items.find(i=>i.datasetIndex===1);
                if(txItem){const pt=dots[txItem.dataIndex];if(pt){const p=pt._date.split('-');return p.length===3?p[2]+'-'+p[1]+'-'+p[0]:pt._date;}}
                const n=items.find(i=>i.datasetIndex===0);return n?n.label:'';
              },
              label:(item)=>{
                if(item.datasetIndex===0)return'NAV: ₹'+parseFloat(item.raw).toFixed(4);
                return null;// tx dots handled in onHover info div
              },
              filter:(item)=>item.datasetIndex===0
            }
          }
        },
        scales:{
          x:{type:'category',ticks:{color:'#8899bb',maxTicksLimit:6,font:{size:10}},grid:{display:false},border:{display:false}},
          y:{ticks:{color:'#8899bb',font:{size:10},callback:v=>'₹'+v},grid:{display:false},border:{display:false}}
        },
        onHover:(evt,elements)=>{
          const infoEl=hoverRef.current;if(!infoEl)return;
          // Check if hovering a tx dot
          const txEl=elements.find(e=>e.datasetIndex===1);
          if(txEl){
            const pt=dots[txEl.index];
            if(pt){
              const p=pt._date.split('-');const d=p.length===3?p[2]+'-'+p[1]+'-'+p[0]:pt._date;
              const amtStr=hideRef.current('₹'+parseFloat(pt._amt||0).toLocaleString('en-IN',{maximumFractionDigits:0}));
              const unitStr=hideRef.current(parseFloat(pt._units||0).toFixed(3));
              infoEl.innerHTML='<span style="color:#c9a84c;font-weight:700">'+pt._type+'</span>'
                +' &nbsp;<span style="color:#9aaac8">Date:</span> <b>'+d+'</b>'
                +' &nbsp;<span style="color:#9aaac8">Amount:</span> <b>'+amtStr+'</b>'
                +' &nbsp;<span style="color:#9aaac8">Units:</span> <b>'+unitStr+'</b>'
                +' &nbsp;<span style="color:#9aaac8">NAV:</span> <b>₹'+parseFloat(pt._nav||0).toFixed(2)+'</b>';
              return;
            }
          }
          infoEl.innerHTML='';
        }
      },
      plugins:[avgLabelPlugin,drawLinePlugin]
    });

    // Hi/Lo — exact HTML:
    // Page open (user hasn't changed TF): show 52W High/Low from full year history
    // After user manually switches TF: show TF High/Low from filtered data
    const hiEl=document.getElementById('nav-high-'+fundKey);
    const loEl=document.getElementById('nav-low-'+fundKey);
    if(hiEl&&loEl&&filtered.length){
      const hi=Math.max(...filtered.map(d=>d.nav));
      const lo=Math.min(...filtered.map(d=>d.nav));
      const tfLabel=tf==='All'?'All':tf;
      // Default: TF hi/lo
      hiEl.innerHTML='<span style="color:#6b7a9a">'+tfLabel+' High:</span> <span style="color:#34d399;font-weight:600">₹'+hi.toFixed(2)+'</span>';
      loEl.innerHTML='<span style="color:#6b7a9a">'+tfLabel+' Low:</span> <span style="color:#f87171;font-weight:600">₹'+lo.toFixed(2)+'</span>';
      // Override with 52W if user hasn't manually changed TF (exact HTML renderFundPage block)
      if(!userChangedTFRef.current){
        const yr52=new Date();yr52.setFullYear(yr52.getFullYear()-1);
        const subset=h.filter(d=>d.date>=yr52);
        if(subset.length){
          const hi52=Math.max(...subset.map(d=>d.nav));
          const lo52=Math.min(...subset.map(d=>d.nav));
          hiEl.innerHTML='<span style="color:#6b7a9a">52W High:</span> <span style="color:#34d399;font-weight:600">₹'+hi52.toFixed(2)+'</span>';
          loEl.innerHTML='<span style="color:#6b7a9a">52W Low:</span> <span style="color:#f87171;font-weight:600">₹'+lo52.toFixed(2)+'</span>';
        }
      }
    }
  },[fundKey,tf,amtHidden]);

  useEffect(()=>{build();},[build,navVersion]);
  useEffect(()=>()=>{if(chartInst.current){chartInst.current.destroy();chartInst.current=null;}},[]);

  return(
    <div className="cc" style={{marginBottom:0}}>
      <div className="nav-header-fund" style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:4,flexWrap:'wrap',gap:6}}>
        <div>
          <div style={{fontSize:15,fontWeight:700}} id={'nav-perf-'+fundKey}>--</div>
          <div style={{fontSize:13,fontWeight:600,color:'#c0ccdc',height:20,marginTop:4}} id={'nav-1d-'+fundKey}></div>
        </div>
        <div className="nav-tf-fund" style={{display:'flex',gap:3,flexWrap:'wrap'}}>
          {TFS.map(t=><button key={t} className={"tf-btn"+(tf===t?' tf-active':'')} onClick={()=>{onTFChange(t);userChangedTFRef.current=true;}}>{t}</button>)}
        </div>
      </div>
      <div style={{height:13,fontSize:10,color:'#7080a0',marginBottom:4}} id={'nav-chart-status-'+fundKey}></div>
      <div style={{position:'relative',height:240}}><canvas ref={chartRef} id={'nvc-'+fundKey}/></div>
      <div className="nav-tf-fund-bottom" style={{display:'none',marginTop:8}}>
        <div style={{display:'flex',justifyContent:'center',gap:3,flexWrap:'wrap'}}>
          {TFS.map(t=><button key={t} className={"tf-btn"+(tf===t?' tf-active':'')} onClick={()=>{onTFChange(t);userChangedTFRef.current=true;}}>{t}</button>)}
        </div>
      </div>
      <div ref={hoverRef} id={'nav-tx-hover-'+fundKey} style={{height:16,fontSize:10.5,color:'#c0ccdc',marginTop:3,overflow:'hidden'}}></div>
      <div className="nav-chart-footer" style={{marginTop:8,display:'flex',gap:10,fontSize:10.5,color:'#9aaac8',flexWrap:'wrap',alignItems:'center'}}>
        <span><span style={{display:'inline-block',width:9,height:9,borderRadius:'50%',background:'#c9a84c',marginRight:4,verticalAlign:'middle'}}></span>Investment</span>
        <span><span style={{display:'inline-block',width:9,height:9,borderRadius:'50%',background:'#f87171',marginRight:4,verticalAlign:'middle'}}></span>Redemption</span>
        <span style={{marginLeft:'auto',display:'flex',gap:10,alignItems:'center'}}>
          <span id={'nav-low-'+fundKey} style={{fontSize:10,color:'#6b7a9a'}}></span>
          <span id={'nav-high-'+fundKey} style={{fontSize:10,color:'#6b7a9a'}}></span>
        </span>
      </div>
    </div>
  );
}
