import { getMFStats } from '../utils/mfStats.js';
import { calcXIRR } from '../utils/xirr.js';
import { fmtDate } from '../utils/formatters.js';

function r(n){return Math.round(parseFloat(n||0)).toLocaleString('en-IN');}

function pdfFundName(k, MF_FUNDS) {
  const f=MF_FUNDS[k];const fn=f.fullName||f.name||k;
  const hasPlan=/direct|regular/i.test(fn),hasOpt=/growth|idcw|dividend/i.test(fn);
  if(!hasPlan||!hasOpt)return k;
  const base=f.name||k;
  const plan=/direct/i.test(fn)?'Dr':/regular/i.test(fn)?'Re':'';
  const opt=/idcw/i.test(fn)?'IDCW':/dividend/i.test(fn)?'Div':'Gr';
  return base+' '+plan+' '+opt;
}

function truncName(name,maxLen=31){
  if(!name||name.length<=maxLen)return name;
  const half=Math.floor((maxLen-3)/2);
  return name.slice(0,half)+'...'+name.slice(name.length-half);
}

function _buildPDF(keys, db, MF_FUNDS, notoB64, notoBold) {
  const{jsPDF}=window.jspdf;
  const doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});

  // Register NotoSans for ₹ symbol support
  if(notoB64){
    doc.addFileToVFS('NotoSans.ttf',notoB64);
    doc.addFont('NotoSans.ttf','NotoSans','normal');
    if(notoBold){doc.addFileToVFS('NotoSans-Bold.ttf',notoBold);doc.addFont('NotoSans-Bold.ttf','NotoSans','bold');}
    else{doc.addFont('NotoSans.ttf','NotoSans','bold');}
  }
  const usefont=notoB64?'NotoSans':'helvetica';
  const RS=notoB64?'₹':'Rs.';
  function setF(style){doc.setFont(usefont,style||'normal');}

  const pw=210,ph=297,margin=14,cw=pw-margin*2;
  let y=margin;

  function newPageIfNeeded(h){if(y+h>ph-margin){doc.addPage();y=margin;return true;}return false;}
  function hline(){doc.setDrawColor(201,168,76);doc.setLineWidth(0.3);doc.line(margin,y,pw-margin,y);y+=4;}

  function tableRow(cells,widths,colors,bold,bg){
    const x0=margin;const rh=7;
    if(bg){const rgb=bg==='alt'?[248,249,252]:[245,246,250];doc.setFillColor(...rgb);doc.rect(margin,y-5,cw,rh+1,'F');}
    doc.setFontSize(8.5);setF(bold?'bold':'normal');
    let x=x0;
    cells.forEach((c,i)=>{
      const tw=widths[i];const col=colors&&colors[i]?colors[i]:[50,50,50];
      doc.setTextColor(...col);
      const align=i===0?'left':'center';
      const tx=align==='center'?x+tw/2:x+2;
      doc.text(String(c||'--'),tx,y,{align,maxWidth:tw-2,lineHeightFactor:1.1});
      x+=tw;
    });
    y+=rh;
  }

  // ── Header ──
  doc.setFillColor(26,34,53);doc.rect(0,0,pw,18,'F');
  doc.setFontSize(13);doc.setTextColor(201,168,76);setF('bold');
  doc.text('Mutual Fund Tracker',margin,11);
  doc.setFontSize(8.5);doc.setTextColor(136,153,187);setF('normal');
  doc.text('Portfolio Summary  |  '+new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}),pw-margin,11,{align:'right'});
  y=26;

  // ── Summary Cards ──
  let totalInv=0,totalCur=0,totalGain=0;
  keys.forEach(k=>{const s=getMFStats(k,db);totalInv+=s.totalInvested||0;totalCur+=s.currentValue||0;totalGain+=s.gain||0;});
  const totalPct=totalInv>0?(totalGain/totalInv*100):0;
  const cw4=(cw-9)/4;
  const cards=[
    {label:'Total Invested',val:RS+r(totalInv),col:[50,50,50]},
    {label:'Current Value',val:RS+r(totalCur),col:totalCur>=totalInv?[20,120,74]:[180,30,30]},
    {label:'Total Return',val:(totalGain>=0?'+':'-')+RS+r(Math.abs(totalGain))+' ('+Math.abs(totalPct).toFixed(2)+'%)',col:totalGain>=0?[20,120,74]:[180,30,30]},
    {label:'No. of Funds',val:keys.length+' funds',col:[26,58,122]}
  ];
  cards.forEach((card,i)=>{
    const cx=margin+i*(cw4+3);
    doc.setFillColor(244,246,250);doc.rect(cx,y-5,cw4,18,'F');
    doc.setFontSize(7.5);doc.setTextColor(107,122,154);setF('normal');
    doc.text(card.label,cx+cw4/2,y,{align:'center'});
    doc.setFontSize(10);doc.setTextColor(...card.col);setF('bold');
    doc.text(card.val,cx+cw4/2,y+7,{align:'center',maxWidth:cw4-2});
  });
  y+=22;hline();

  // ── Fund Overview Table ──
  doc.setFontSize(11);doc.setTextColor(26,34,53);setF('bold');
  doc.text('Fund Overview',margin,y);y+=6;
  const ow=[55,27,27,27,22,24];
  const oh=['Fund Name','Invested','Current Value','Return','Return %','XIRR'];
  tableRow(oh,ow,oh.map(()=>[107,122,154]),true);
  doc.setDrawColor(220,220,220);doc.setLineWidth(0.2);doc.line(margin,y,pw-margin,y);y+=2;
  keys.forEach((k,idx)=>{
    newPageIfNeeded(8);
    const s=getMFStats(k,db);const xirr=calcXIRR(k,db);
    const xv=xirr!==null?(xirr*100).toFixed(2):null;
    const xirrStr=xv!==null?(parseFloat(xv)>=0?'+':'')+xv+'%':'--';
    const retPct=s.totalInvested>0?(s.gain/s.totalInvested*100):0;
    const gainCol=s.gain>=0?[20,120,74]:[180,30,30];
    const xirrCol=xirr!==null&&xirr>=0?[20,120,74]:[180,30,30];
    tableRow([
      truncName(pdfFundName(k,MF_FUNDS)),
      RS+r(s.totalInvested),RS+r(s.currentValue),
      (s.gain>=0?'+':'-')+RS+r(Math.abs(s.gain)),
      (retPct>=0?'+':'')+retPct.toFixed(2)+'%',xirrStr
    ],ow,[[30,30,30],[50,50,50],s.currentValue>=s.totalInvested?[20,120,74]:[180,30,30],gainCol,gainCol,xirrCol],false,idx%2===0?'alt':null);
  });
  y+=4;hline();

  // ── Per-Fund Transaction Tables ──
  keys.forEach(k=>{
    newPageIfNeeded(35);
    const fund=MF_FUNDS[k];const txs=db.mf[k]?.transactions||[];if(!txs.length)return;
    const s=getMFStats(k,db);const curNav=db.navData[k]?.nav||0;
    doc.setFillColor(26,34,53);doc.rect(margin,y-5,cw,18,'F');
    doc.setFontSize(10);doc.setTextColor(201,168,76);setF('bold');
    const fullN=fund.fullName||fund.name||k;const navDate=db.navData[k]?.date||'';
    doc.text(fullN,margin+2,y+1,{maxWidth:cw-25});
    doc.setFontSize(8);doc.setTextColor(180,190,210);
    doc.text('('+k+')',pw-margin-2,y+1,{align:'right'});
    doc.setFontSize(7.5);doc.setTextColor(200,215,240);setF('bold');
    const statsLine='Invested: '+RS+r(s.totalInvested)
      +'   Current: '+RS+r(s.currentValue)
      +'   Units: '+s.totalUnits.toFixed(3)
      +'   Avg NAV: '+RS+parseFloat(s.avgNav||0).toFixed(4)
      +'   NAV: '+RS+parseFloat(curNav||0).toFixed(4)+(navDate?' (as on '+fmtDate(navDate)+')':'');
    doc.text(statsLine,margin+2,y+9,{maxWidth:cw-4});
    y+=20;
    const tw=[6,22,20,18,16,20,20,22,38];
    const th=['#','Date','Type','Units','NAV','Amount','Total','Current','Return'];
    tableRow(th,tw,th.map(()=>[107,122,154]),true);
    doc.setDrawColor(220,220,220);doc.setLineWidth(0.2);doc.line(margin,y,pw-margin,y);y+=2;
    [...txs].reverse().forEach((tx,i)=>{
      newPageIfNeeded(8);
      const origIdx=txs.length-1-i;
      const txUnits=parseFloat(tx.units||0),txNav=parseFloat(tx.nav||0);
      const totalAmt=Math.round(parseFloat(tx.amount||0)+parseFloat(tx.stamp||0));
      const isBuy=tx.type==='Invested';
      const curVal=isBuy&&curNav?Math.round(txUnits*curNav):0;
      const costBasis=Math.round(txUnits*txNav+parseFloat(tx.stamp||0));
      const retAmt=isBuy&&curNav?curVal-costBasis:0;
      const retPct2=costBasis>0?(retAmt/costBasis*100):0;
      const retStr=isBuy&&curNav?(retAmt>=0?'+':'-')+RS+r(Math.abs(retAmt))+'('+(retPct2>=0?'+':'')+retPct2.toFixed(2)+'%)':'--';
      const retCol=retAmt>=0?[20,120,74]:[180,30,30];
      tableRow([
        origIdx+1,fmtDate(tx.date),isBuy?'Invested':'Redeemed',
        txUnits.toFixed(3),txNav.toFixed(2),RS+r(tx.amount),RS+r(totalAmt),
        isBuy&&curNav?RS+r(curVal):'--',retStr
      ],tw,[
        [100,100,100],[50,50,50],isBuy?[20,120,74]:[180,30,30],
        [50,50,50],[50,50,50],[50,50,50],[50,50,50],
        isBuy&&curNav?[50,50,50]:[150,150,150],
        isBuy&&curNav?retCol:[150,150,150]
      ],false,i%2===0?'alt':null);
    });
    y+=8;
  });

  // ── Stamp Duty Summary Page ──
  doc.addPage();y=margin;
  doc.setFillColor(26,34,53);doc.rect(0,0,pw,28,'F');
  doc.setFontSize(13);doc.setTextColor(201,168,76);setF('bold');
  doc.text('Stamp Duty Summary',margin,y+6);
  doc.setFontSize(8.5);doc.setTextColor(160,180,210);setF('normal');
  doc.text('Stamp duty is charged at 0.005% on each purchase transaction',margin,y+13);
  y+=22;hline();
  const sw=[8,55,22,25,25,25,22];
  const sh=['#','Fund','Transactions','Total Invested','Total Stamp','% of Invested','TER%'];
  tableRow(sh,sw,sh.map(()=>[107,122,154]),true);
  doc.setDrawColor(220,220,220);doc.setLineWidth(0.2);doc.line(margin,y,pw-margin,y);y+=2;
  let grandStamp=0,grandInv=0;
  keys.forEach((k,idx)=>{
    newPageIfNeeded(8);
    const txs=db.mf[k]?.transactions||[];
    const buyTxs=txs.filter(t=>t.type==='Invested');if(!buyTxs.length)return;
    const totalStamp=buyTxs.reduce((s,t)=>s+parseFloat(t.stamp||0),0);
    const totalInvested=buyTxs.reduce((s,t)=>s+parseFloat(t.amount||0),0);
    const stampPct=totalInvested>0?(totalStamp/totalInvested*100):0;
    grandStamp+=totalStamp;grandInv+=totalInvested;
    tableRow([
      idx+1,truncName(pdfFundName(k,MF_FUNDS)),buyTxs.length+' buys',
      RS+r(totalInvested),RS+totalStamp.toFixed(2),
      stampPct.toFixed(4)+'%',
      (MF_FUNDS[k].ter>0?MF_FUNDS[k].ter+'%':'-')
    ],sw,[[100,100,100],[30,30,30],[80,80,80],[50,50,50],[201,168,76],[80,80,80],[80,80,80]],false,idx%2===0?'alt':null);
  });
  y+=4;hline();
  const grandPct=grandInv>0?(grandStamp/grandInv*100):0;
  const grandTxns=keys.reduce((s,k)=>s+((db.mf[k]?.transactions||[]).filter(t=>t.type==='Invested').length),0);
  tableRow(['','TOTAL',grandTxns+' buys',RS+r(grandInv),RS+grandStamp.toFixed(2),grandPct.toFixed(4)+'%',''],
    sw,[[0,0,0],[30,30,30],[80,80,80],[50,50,50],[201,168,76],[80,80,80],[0,0,0]],true);
  y+=10;

  // Footer
  const totalPages=doc.getNumberOfPages();
  for(let p=1;p<=totalPages;p++){
    doc.setPage(p);doc.setFontSize(7.5);doc.setTextColor(170,170,170);setF('normal');
    doc.text('Generated by Mutual Fund Tracker  |  Page '+p+' of '+totalPages,pw/2,ph-6,{align:'center'});
  }
  doc.save('MF_Portfolio_'+new Date().toISOString().slice(0,10)+'.pdf');
}

export function exportPDF(db, MF_FUNDS) {
  const keys=Object.keys(MF_FUNDS);
  if(!keys.length){alert('No funds to export.');return;}
  // Try to load NotoSans for ₹ symbol (cached in localStorage)
  let cacheReg=null,cacheBold=null;
  try{cacheReg=localStorage.getItem('mft_noto_reg');cacheBold=localStorage.getItem('mft_noto_bold');}catch(e){}
  if(cacheReg&&cacheBold){_buildPDF(keys,db,MF_FUNDS,cacheReg,cacheBold);return;}
  // Download fonts
  const base='https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io/fonts/NotoSans/hinted/ttf/';
  function xhrFont(url,cb){
    const x=new XMLHttpRequest();x.open('GET',url,true);x.responseType='arraybuffer';
    x.onload=()=>{
      if(x.status===200){const b=new Uint8Array(x.response);let s='',c=8192;for(let i=0;i<b.length;i+=c)s+=String.fromCharCode.apply(null,b.subarray(i,i+c));cb(btoa(s));}
      else cb(null);
    };
    x.onerror=()=>cb(null);x.send();
  }
  xhrFont(base+'NotoSans-Regular.ttf',reg=>{
    xhrFont(base+'NotoSans-Bold.ttf',bold=>{
      if(reg&&bold){try{localStorage.setItem('mft_noto_reg',reg);localStorage.setItem('mft_noto_bold',bold);}catch(e){}}
      _buildPDF(keys,db,MF_FUNDS,reg,bold);
    });
  });
}
