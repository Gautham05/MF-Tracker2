import useAppStore from '../../store/useAppStore.js';
import React, { useEffect, useRef } from 'react';
import { MF_FUNDS } from '../../constants/funds.js';
import { getMFStats } from '../../utils/mfStats.js';
import { fIN } from '../../utils/formatters.js';


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
export default function AllocationChart({ db, amtHidden }) {
  const navVersion = useAppStore(s => s.navVersion);
  const lastAmtHiddenRef = React.useRef(amtHidden);
  const lastNavVersionRef = React.useRef(navVersion);
  const chartRef = useRef(null);
  const chartInst = useRef(null);

  useEffect(() => {
    if (typeof window.Chart === 'undefined') return;
    const keys = Object.keys(MF_FUNDS);
    const allPieData = keys.map(k => ({ key:k, val: getMFStats(k,db).totalInvested||0 }));
    const sorted = [...allPieData].sort((a,b)=>b.val-a.val);
    const top5keys = new Set(sorted.slice(0,5).map(f=>f.key));
    const topFunds = allPieData.filter(f=>top5keys.has(f.key));
    const otherFunds = allPieData.filter(f=>!top5keys.has(f.key));
    const otherTotal = otherFunds.reduce((s,f)=>s+f.val,0);
    const pieKeys = topFunds.map(f=>f.key);
    const pieData = topFunds.map(f=>f.val);
    if(otherTotal>0){pieKeys.push('__other__');pieData.push(otherTotal);}
    const pieColors = pieKeys.map(k=>k==='__other__'?'#7a8aa8':MF_FUNDS[k]?.color||'#7a8aa8');
    const pieLabels = pieKeys.map(k=>k==='__other__'?'Others':k);
    const pieTotal = pieData.reduce((a,b)=>a+b,0)||1;

    const outsideLabelPlugin = {
      id:'outsideLabels',
      afterDraw(chart){
        const{ctx,chartArea:{width,height}}=chart;
        const arcData=chart.getDatasetMeta(0).data;
        const cx=arcData[0]?.x||width/2, cy=arcData[0]?.y||height/2;
        const isMob=window.innerWidth<=768;
        const lineH=isMob?31:32;
        let items=[];
        arcData.forEach((arc,i)=>{
          const value=chart.data.datasets[0].data[i];
          const pct=value/pieTotal*100;const label=chart.data.labels[i];
          const color=chart.data.datasets[0].backgroundColor[i];
          if(pct<2&&label!=='Others')return;
          const midAngle=(arc.startAngle+arc.endAngle)/2;
          const outerRadius=arc.outerRadius;
          const x1=cx+Math.cos(midAngle)*(outerRadius+4);const y1=cy+Math.sin(midAngle)*(outerRadius+4);
          const x2=cx+Math.cos(midAngle)*(outerRadius+18);const y2=cy+Math.sin(midAngle)*(outerRadius+18);
          const isRight=Math.cos(midAngle)>=0;const x3=x2+(isRight?10:-10);
          items.push({x1,y1,x2,y2,x3,y:y2,isRight,value,pct,label,color,i});
        });
        ['left','right'].forEach(side=>{
          const grp=items.filter(it=>side==='right'?it.isRight:!it.isRight);
          grp.sort((a,b)=>a.y-b.y);
          for(let g=1;g<grp.length;g++){const prev=grp[g-1],curr=grp[g];if(curr.y-prev.y<lineH)curr.y=prev.y+lineH;}
        });
        items.forEach(it=>{
          const{x1,y1,x2,x3,isRight,value,pct,label,color}=it;const y3=it.y;
          ctx.save();ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y3);ctx.lineTo(x3,y3);
          ctx.strokeStyle=color;ctx.lineWidth=1.2;ctx.stroke();
          ctx.textAlign=isRight?'left':'right';ctx.textBaseline='middle';ctx.fillStyle=color;
          if(isMob){
            ctx.font='bold 12px Segoe UI,system-ui,sans-serif';ctx.fillText(label,x3+(isRight?3:-3),y3-7);
            ctx.font='11px Segoe UI,system-ui,sans-serif';ctx.fillStyle='#c0ccdc';
            ctx.fillText(amtHidden?'••••':'₹'+fIN(value),x3+(isRight?3:-3),y3+6);
            ctx.fillStyle='#8899bb';ctx.font='10.5px Segoe UI,system-ui,sans-serif';
            ctx.fillText(pct.toFixed(1)+'%',x3+(isRight?3:-3),y3+18);
          }else{
            ctx.font='bold 12px Segoe UI,system-ui,sans-serif';ctx.fillText(label,x3+(isRight?3:-3),y3-9);
            ctx.font='600 11.5px Segoe UI,system-ui,sans-serif';ctx.fillStyle='#e0e8ff';
            ctx.fillText(amtHidden?'••••':'₹'+fIN(value),x3+(isRight?3:-3),y3+5);
            ctx.fillStyle='#d0d8f0';ctx.font='600 11px Segoe UI,system-ui,sans-serif';
            ctx.fillText('('+pct.toFixed(1)+'%)',x3+(isRight?3:-3),y3+19);
          }
          ctx.restore();
        });
      }
    };

    // If only navVersion changed (not amtHidden) → update data in-place, no flash
    const amtHiddenChanged = lastAmtHiddenRef.current !== amtHidden;
    lastAmtHiddenRef.current = amtHidden;
    lastNavVersionRef.current = navVersion;
    if(!amtHiddenChanged && chartInst.current){
      chartInst.current.data.datasets[0].data = pieData;
      chartInst.current.data.datasets[0].backgroundColor = pieColors;
      chartInst.current.data.labels = pieLabels;
      chartInst.current.update('none');
      return;
    }
    if(chartInst.current){chartInst.current.destroy();chartInst.current=null;}
    if(!chartRef.current)return;
    const isMob=window.innerWidth<=768;
    chartInst.current=new window.Chart(chartRef.current.getContext('2d'),{
      type:'pie',
      data:{labels:pieLabels,datasets:[{data:pieData,backgroundColor:pieColors,borderWidth:2,borderColor:'#1a2235'}]},
      options:{responsive:true,maintainAspectRatio:false,
        animation:{duration:0},
        layout:{padding:isMob?{top:30,bottom:30,left:80,right:80}:{top:40,bottom:40,left:100,right:100}},
        plugins:{legend:{display:false},tooltip:{enabled:true,callbacks:{label:function(ctx){
          const lbl=ctx.label||'',val=ctx.parsed||0,pct=(val/pieTotal*100).toFixed(1);
          if(lbl==='Others'){const lines=['Others: ₹'+fIN(val)+' ('+pct+'%)'];otherFunds.forEach(f=>{const fp=(f.val/pieTotal*100).toFixed(1);lines.push('  '+f.key+': ₹'+fIN(f.val)+' ('+fp+'%)');});return lines;}
          return lbl+': ₹'+fIN(val)+' ('+pct+'%)';
        }}}}
      },plugins:[outsideLabelPlugin]
    });
    return ()=>{if(chartInst.current){chartInst.current.destroy();chartInst.current=null;}};
  },[db,amtHidden,navVersion]);

  return <canvas ref={chartRef}/>;
}
