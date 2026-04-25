import useAppStore from '../../store/useAppStore.js';
import React, { useEffect, useRef, useState } from 'react';
import { MF_FUNDS, navHistoryCache } from '../../constants/funds.js';
import { filterByTF } from '../../utils/mfStats.js';
const TFS=['1M','3M','6M','1Y','3Y','All'];

// Exact HTML drawLinePlugin — LTR animation
const drawLinePlugin={
  id:'drawLineComp',
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

export default function ComparisonChart({ db }) {
  const chartRef=useRef(null);
  const chartInst=useRef(null);
  const [tf,setTf]=useState('1Y');
  const [selected,setSelected]=useState({});

  // Init all funds as selected
  useEffect(()=>{
    const keys=Object.keys(MF_FUNDS);
    setSelected(prev=>{
      const next={...prev};
      keys.forEach(k=>{if(next[k]===undefined)next[k]=true;});
      Object.keys(next).forEach(k=>{if(!MF_FUNDS[k])delete next[k];});
      return next;
    });
  },[db]);

  useEffect(()=>{
    if(typeof window.Chart==='undefined')return;
    const allKeys=Object.keys(MF_FUNDS);
    const keys=allKeys.filter(k=>selected[k]!==false);
    const chartEl=chartRef.current;
    const boxEl=chartEl?.parentElement;

    // No funds selected — show message, hide canvas (exact HTML)
    if(!keys.length){
      if(chartInst.current){chartInst.current.destroy();chartInst.current=null;}
      if(chartEl)chartEl.style.display='none';
      if(boxEl){boxEl.style.display='flex';boxEl.style.alignItems='center';boxEl.style.justifyContent='center';}
      let msg=document.getElementById('comp-nofund');
      if(!msg){msg=document.createElement('div');msg.id='comp-nofund';msg.style.cssText='color:#4a5570;font-size:13px;text-align:center';msg.textContent='No fund selected';boxEl?.appendChild(msg);}
      return;
    }

    // Restore canvas (exact HTML)
    if(chartEl){chartEl.style.display='';}
    if(boxEl){boxEl.style.display='';boxEl.style.alignItems='';boxEl.style.justifyContent='';}
    const msg=document.getElementById('comp-nofund');if(msg)msg.remove();

    // Build datasets
    const datasets=[];const allLabels=[];
    keys.forEach(k=>{
      const hist=navHistoryCache[k];if(!hist||!hist.length)return;
      const filtered=filterByTF(hist,tf);if(!filtered||filtered.length<2)return;
      const baseNav=filtered[0].nav;
      const labels=filtered.map(d=>d.dateStr);
      const data=filtered.map(d=>parseFloat(((d.nav-baseNav)/baseNav*100).toFixed(2)));
      labels.forEach(l=>{if(allLabels.indexOf(l)<0)allLabels.push(l);});
      datasets.push({key:k,labels,data,color:MF_FUNDS[k].color,name:MF_FUNDS[k].name});
    });
    allLabels.sort();

    if(!datasets.length){
      if(chartInst.current){chartInst.current.destroy();chartInst.current=null;}
      return;
    }

    const step=Math.max(1,Math.floor(allLabels.length/8));
    const displayLabels=allLabels.map((l,i)=>i%step===0?l.slice(5):'');
    const chartDatasets=datasets.map(ds=>{
      const map={};ds.labels.forEach((l,i)=>map[l]=ds.data[i]);
      return{
        label:ds.name,
        data:allLabels.map(l=>map[l]!==undefined?map[l]:null),
        borderColor:ds.color,backgroundColor:'transparent',
        pointBackgroundColor:ds.color,pointBorderColor:ds.color,
        borderWidth:2,pointRadius:0,pointHoverRadius:4,tension:0.3,spanGaps:true
      };
    });

    if(chartInst.current){chartInst.current.destroy();chartInst.current=null;}
    if(!chartRef.current)return;

    // Exact HTML: animation:{duration:900,easing:'easeInOutCubic'} — NOT LTR plugin
    if(!chartRef.current)return;
    const ctx2d=chartRef.current?.getContext('2d');if(!ctx2d)return;
    chartInst.current=new window.Chart(ctx2d,{
      type:'line',
      data:{labels:displayLabels,datasets:chartDatasets},
      options:{
        responsive:true,maintainAspectRatio:false,
        animation:{duration:900,easing:'easeInOutCubic'},
        interaction:{mode:'index',intersect:false},
        plugins:{
          legend:{display:false},
          tooltip:{
            backgroundColor:'rgba(10,15,30,0.85)',borderColor:'rgba(255,255,255,0.08)',borderWidth:1,
            titleColor:'#8899bb',titleFont:{size:11,weight:'500'},
            bodyColor:'#e0e8ff',bodyFont:{size:12,weight:'700'},
            padding:10,boxWidth:8,boxHeight:8,boxPadding:0,
            usePointStyle:true,pointStyle:'circle',
            callbacks:{
              title:items=>allLabels[items[0].dataIndex]||''  ,
              label:item=>{const v=item.raw;if(v===null)return null;return' '+item.dataset.label+':  '+(v>=0?'+':'')+v.toFixed(2)+'%';}
            }
          }
        },
        scales:{
          x:{ticks:{color:'#8899bb',font:{size:10},maxRotation:0},grid:{display:false},border:{display:false}},
          y:{ticks:{color:'#8899bb',font:{size:10},callback:v=>(v>=0?'+':'')+v.toFixed(1)+'%'},grid:{display:false},border:{display:false}}
        }
      },
      plugins:[drawLinePlugin]
    });
  },[db,tf,selected]);

  const allKeys=Object.keys(MF_FUNDS);

  // Legend: same as HTML — fund color line + name + latest %
  const legendItems=allKeys.filter(k=>selected[k]!==false).map(k=>{
    const hist=navHistoryCache[k];if(!hist||hist.length<2)return null;
    const filtered=filterByTF(hist,tf);if(!filtered||filtered.length<2)return null;
    const baseNav=filtered[0].nav,lastNav=filtered[filtered.length-1].nav;
    const pct=parseFloat(((lastNav-baseNav)/baseNav*100).toFixed(2));
    return{key:k,pct};
  }).filter(Boolean);

  return(
    <div>
      {/* Fund selector buttons + TF buttons */}
      <div style={{display:'flex',gap:5,flexWrap:'wrap',marginBottom:8}}>
        {allKeys.map(k=>{
          const sel=selected[k]!==false;const col=MF_FUNDS[k]?.color||'#c9a84c';
          return(
            <button key={k} onClick={()=>setSelected(s=>({...s,[k]:!sel}))} title={MF_FUNDS[k]?.name}
              style={{background:sel?col+'22':'transparent',border:'2px solid '+(sel?col:'#2a3348'),
                color:sel?col:'#4a5570',padding:'2px 9px',borderRadius:20,cursor:'pointer',
                fontSize:11,fontWeight:700,transition:'all 0.15s',whiteSpace:'nowrap'}}>{k}</button>
          );
        })}
        <div style={{display:'flex',gap:4,marginLeft:'auto'}}>
          {TFS.map(t=>(
            <button key={t} onClick={()=>setTf(t)}
              style={{background:t===tf?'#253358':'none',border:'1px solid '+(t===tf?'#3a4560':'#2a3348'),
                color:t===tf?'#c9a84c':'#6b7a9a',padding:'3px 10px',borderRadius:20,
                cursor:'pointer',fontSize:11,fontWeight:600}}>{t}</button>
          ))}
        </div>
      </div>
      {/* Chart canvas */}
      <div style={{position:'relative',height:260}}>
        <canvas ref={chartRef}/>
      </div>
      {/* Legend — exact HTML */}
      {legendItems.length>0&&(
        <div id="ins-comp-legend" style={{display:'flex',gap:12,flexWrap:'wrap',marginTop:10}}>
          {legendItems.map(({key,pct})=>{
            const col=pct>=0?'#34d399':'#f87171';
            return(
              <div key={key} style={{display:'flex',alignItems:'center',gap:5}}>
                <div style={{width:16,height:3,background:MF_FUNDS[key]?.color||'#c9a84c',borderRadius:2}}/>
                <span style={{fontSize:11,color:'#d0d8f0'}}>{MF_FUNDS[key]?.name||key}</span>
                <span style={{fontSize:11,fontWeight:700,color:col}}>{pct>=0?'+':''}{pct.toFixed(2)}%</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
