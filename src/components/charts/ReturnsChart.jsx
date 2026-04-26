import useAppStore from '../../store/useAppStore.js';
import React, { useEffect, useRef } from 'react';
import { MF_FUNDS } from '../../constants/funds.js';
import { getMFStats } from '../../utils/mfStats.js';
import { fIN } from '../../utils/formatters.js';
const PER_PAGE=5;


const drawLTRPlugin={
  id:'drawLTR',
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

export default function ReturnsChart({ db, page, onPageChange }) {
  const chartRef=useRef(null);const chartInst=useRef(null);
  useEffect(()=>{
    if(typeof window.Chart==='undefined')return;
    const keys=Object.keys(MF_FUNDS);const pages=Math.max(1,Math.ceil(keys.length/PER_PAGE));const p=Math.min(page,pages-1);
    const slice=keys.slice(p*PER_PAGE,(p+1)*PER_PAGE);
    const rv=slice.map(k=>{const s=getMFStats(k,db);return s.totalInvested>0?parseFloat((s.gain/s.totalInvested*100).toFixed(2)):0;});
    const ra=slice.map(k=>getMFStats(k,db).gain);
    const retValPlugin={id:'retVals',afterDraw(chart){
      const{ctx,data,scales}=chart;const y0=scales.y.getPixelForValue(0);
      ctx.save();ctx.beginPath();ctx.strokeStyle='rgba(180,190,220,0.35)';ctx.lineWidth=1.5;
      ctx.moveTo(chart.chartArea.left,y0);ctx.lineTo(chart.chartArea.right,y0);ctx.stroke();
      chart.getDatasetMeta(0).data.forEach((bar,i)=>{
        const v=data.datasets[0].data[i];const isPos=v>=0;const amt=ra[i];const amtSign=amt>=0?'+':'−';const col=isPos?'#34d399':'#f87171';
        ctx.textAlign='center';ctx.fillStyle=col;ctx.font='bold 11px Segoe UI,system-ui,sans-serif';
        if(isPos){ctx.textBaseline='bottom';ctx.fillText('+'+v+'%',bar.x,bar.y-3);}else{ctx.textBaseline='top';ctx.fillText(v+'%',bar.x,Math.min(bar.y+3,scales.x.top-20));}
        ctx.textBaseline='top';ctx.font='bold 11px Segoe UI,system-ui,sans-serif';
        ctx.fillText('('+amtSign+'₹'+fIN(Math.abs(Math.round(amt)))+')',bar.x,scales.x.bottom+4);
      });ctx.restore();
    }};
    if(chartInst.current){chartInst.current.destroy();chartInst.current=null;}
    if(!chartRef.current)return;
    const ctx2d=chartRef.current?.getContext('2d');if(!ctx2d)return;
    chartInst.current=new window.Chart(ctx2d,{
      type:'bar',data:{labels:slice,datasets:[{label:'Return %',data:rv,backgroundColor:rv.map(v=>v>=0?'#34d399':'#f87171'),borderRadius:5,barPercentage:0.5,categoryPercentage:0.6,clip:false}]},
      options:{responsive:true,maintainAspectRatio:false,clip:false,layout:{padding:{bottom:18}},
        plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>{const k=slice[c.dataIndex];const s=getMFStats(k,db);return[`Return: ${s.gain>=0?'+':'−'}₹${fIN(Math.abs(Math.round(s.gain)))} (${c.raw}%)`,`Invested: ₹${fIN(s.totalInvested)}`];}}}},
        scales:{x:{ticks:{color:'#8899bb',font:{size:11}},grid:{display:false},border:{display:false}},
          y:{ticks:{color:'#8899bb',callback:v=>v+'%',maxTicksLimit:5},grid:{display:false},border:{display:false},afterDataLimits(a){if(a.min<0)a.min=a.min*1.6;if(a.max>0)a.max=a.max*1.2;}}}
      },plugins:[retValPlugin]
    });
    return()=>{if(chartInst.current){chartInst.current.destroy();chartInst.current=null;}};
  },[db,page]);
  const keys=Object.keys(MF_FUNDS);const pages=Math.max(1,Math.ceil(keys.length/PER_PAGE));
  return(
    <div style={{display:'flex',flexDirection:'column',height:'100%'}}>
      <div style={{position:'relative'}}>
        <div className="cct">Returns by Fund</div>
        {keys.length>PER_PAGE&&<div style={{position:'absolute',top:0,right:0,display:'flex',alignItems:'center',gap:6}}>
          <button onClick={()=>onPageChange(Math.max(0,page-1))} disabled={page===0} style={{background:'#1a2235',border:'1px solid #2a3348',color:'#c9a84c',width:24,height:24,borderRadius:5,cursor:'pointer',fontSize:13,opacity:page===0?0.3:1}}>‹</button>
          <span style={{fontSize:10,color:'#6b7a9a',minWidth:40,textAlign:'center'}}>{page+1}/{pages}</span>
          <button onClick={()=>onPageChange(Math.min(pages-1,page+1))} disabled={page>=pages-1} style={{background:'#1a2235',border:'1px solid #2a3348',color:'#c9a84c',width:24,height:24,borderRadius:5,cursor:'pointer',fontSize:13,opacity:page>=pages-1?0.3:1}}>›</button>
        </div>}
      </div>
      <div style={{position:'relative',flex:1,minHeight:200}}><canvas ref={chartRef}/></div>
    </div>
  );
}
