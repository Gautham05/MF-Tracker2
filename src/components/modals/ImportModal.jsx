import React, { useState } from 'react';
import useAppStore from '../../store/useAppStore.js';
import { MF_FUNDS } from '../../constants/funds.js';
import { parseCSVRow, autoDetectColumns, parseImportRows } from '../../utils/importParser.js';
import { fIN, fmtDate } from '../../utils/formatters.js';

export default function ImportModal({ onClose }) {
  const { db, saveAndRefresh } = useAppStore();
  const [csv,setCsv]=useState('');const [parseStatus,setParseStatus]=useState('');
  const [headers,setHeaders]=useState([]);const [dataRows,setDataRows]=useState([]);
  const [colMap,setColMap]=useState({date:-1,type:-1,units:-1,nav:-1,amount:-1});
  const [parsed,setParsed]=useState([]);const [warns,setWarns]=useState([]);
  const [fundKey,setFundKey]=useState('');const [showMap,setShowMap]=useState(false);

  function onCSVChange(raw){
    setCsv(raw);if(!raw.trim()){setParseStatus('');setShowMap(false);return;}
    const rows=raw.trim().split(/\r?\n/).filter(l=>l.trim());
    if(rows.length<2){setParseStatus('Need at least 2 rows');return;}
    const delim=rows[0].indexOf('\t')>=0?'\t':',';
    const hdrs=parseCSVRow(rows[0],delim);
    const dRows=rows.slice(1).map(r=>parseCSVRow(r,delim)).filter(r=>r.some(c=>c.trim()));
    setHeaders(hdrs);setDataRows(dRows);
    const cm=autoDetectColumns(hdrs);setColMap(cm);
    setParseStatus(`Detected ${hdrs.length} columns, ${dRows.length} rows`);
    setShowMap(true);
    const{parsed:p,warns:w}=parseImportRows(dRows,cm);setParsed(p);setWarns(w);
  }
  function onColMapChange(field,val){
    const newMap={...colMap,[field]:parseInt(val)};setColMap(newMap);
    const{parsed:p,warns:w}=parseImportRows(dataRows,newMap);setParsed(p);setWarns(w);
  }
  function doImport(){
    if(!fundKey||!parsed.length)return;
    const newDb={...db,mf:{...db.mf}};
    if(!newDb.mf[fundKey])newDb.mf[fundKey]={transactions:[]};
    let dupes=0;
    parsed.forEach(tx=>{
      const exists=newDb.mf[fundKey].transactions.some(t=>t.date===tx.date&&Math.abs(parseFloat(t.units||0)-tx.units)<0.001&&Math.abs(parseFloat(t.nav||0)-tx.nav)<0.001);
      if(exists){dupes++;return;}
      newDb.mf[fundKey].transactions.push({...tx});
    });
    newDb.mf[fundKey].transactions.sort((a,b)=>a.date.localeCompare(b.date));
    saveAndRefresh(newDb);
    const imported=parsed.length-dupes;
    appAlert(`✓ Imported ${imported} transaction${imported!==1?'s':''} into ${MF_FUNDS[fundKey]?.name||fundKey}${dupes?`\n(${dupes} duplicate${dupes!==1?'s':''} skipped)`:''}.`);
    onClose();
  }
  const fields=[{key:'date',label:'Date *'},{key:'type',label:'Type (Buy/Sell)'},{key:'units',label:'Units *'},{key:'nav',label:'NAV (₹) *'},{key:'amount',label:'Amount (₹)'}];
  const colOpts=[<option key="-1" value="-1">— ignore —</option>,...headers.map((h,i)=><option key={i} value={i}>{h||'Col '+(i+1)}</option>)];
  return(
    <div className="mbg open" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" style={{width:600,maxHeight:'92vh',overflowY:'auto'}}>
        <div className="mh"><div className="mt">⬆ Import Statement</div><button className="mc2" onClick={onClose}>×</button></div>
        <div className="fg"><label>Target Fund</label>
          <select value={fundKey} onChange={e=>setFundKey(e.target.value)}>
            <option value="">— Select fund —</option>
            {Object.keys(MF_FUNDS).map(k=><option key={k} value={k}>{MF_FUNDS[k].name} ({k})</option>)}
          </select></div>
        <div className="fg">
          <label>Paste CSV / Statement Data</label>
          <div style={{fontSize:10,color:'#6b7a9a',marginBottom:6}}>Copy rows from Groww / CAMS / Zerodha statement and paste below. Header row recommended. Stamp Duty is auto-calculated (0.005%).</div>
          <textarea value={csv} onChange={e=>onCSVChange(e.target.value)} rows={8} style={{width:'100%',padding:'9px 11px',border:'1px solid #2a3348',borderRadius:7,background:'#0d1117',color:'#e0e4ef',fontSize:12,fontFamily:'monospace',resize:'vertical',outline:'none',boxSizing:'border-box'}} placeholder="Date,Type,Units,NAV,Amount&#10;2024-01-10,Purchase,250.000,72.00,18000"/>
          <div className="nfs" style={{color:parseStatus.startsWith('Detected')?'#34d399':'#f97316'}}>{parseStatus}</div>
        </div>
        {showMap&&<div>
          <div style={{fontSize:11,fontWeight:700,color:'#c9a84c',marginBottom:8,textTransform:'uppercase',letterSpacing:'1px'}}>Map Columns</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:12}}>
            {fields.map(f=><div key={f.key} className="fg" style={{marginBottom:0}}>
              <label>{f.label}</label>
              <select value={colMap[f.key]} onChange={e=>onColMapChange(f.key,e.target.value)} style={{width:'100%',padding:'7px 10px',border:'1px solid #2a3348',borderRadius:7,background:'#0d1117',color:'#e0e4ef',fontSize:12,outline:'none'}}>{colOpts}</select>
            </div>)}
          </div>
          {warns.length>0&&<div style={{fontSize:11,color:'#f97316',marginBottom:8}}>⚠ {warns.slice(0,3).join(' | ')}{warns.length>3?` + ${warns.length-3} more`:''}</div>}
          {parsed.length>0&&<div>
            <div style={{fontSize:11,fontWeight:700,color:'#c9a84c',marginBottom:6,textTransform:'uppercase'}}>Preview ({parsed.length} rows{parsed.length>50?' — showing first 50':''})</div>
            <div style={{overflowX:'auto',maxHeight:180,overflowY:'auto',border:'1px solid #2a3348',borderRadius:7}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                <thead style={{background:'#131b2a',position:'sticky',top:0}}><tr>
                  {['Date','Type','Units','NAV ₹','Amount ₹','Stamp ₹'].map(h=><th key={h} style={{padding:'6px 10px',textAlign:'left',color:'#8899bb',fontWeight:700,borderBottom:'1px solid #2a3348',whiteSpace:'nowrap'}}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {parsed.slice(0,50).map((r,i)=><tr key={i} style={{borderBottom:'1px solid #1e2840'}}>
                    <td style={{padding:'5px 10px',color:'#d0d8f0'}}>{fmtDate(r.date)}</td>
                    <td style={{padding:'5px 10px',color:r.type==='Invested'?'#34d399':'#f87171',fontWeight:600}}>{r.type==='Invested'?'Buy':'Sell'}</td>
                    <td style={{padding:'5px 10px',textAlign:'right',color:'#d0d8f0'}}>{r.units.toFixed(3)}</td>
                    <td style={{padding:'5px 10px',textAlign:'right',color:'#d0d8f0'}}>{r.nav.toFixed(4)}</td>
                    <td style={{padding:'5px 10px',textAlign:'right',color:'#d0d8f0'}}>{fIN(r.amount)}</td>
                    <td style={{padding:'5px 10px',textAlign:'right',color:'#c9a84c'}}>{r.stamp.toFixed(2)}</td>
                  </tr>)}
                </tbody>
              </table>
            </div>
          </div>}
        </div>}
        <div className="mfooter">
          <button className="mcn" onClick={onClose}>Cancel</button>
          <button className="msv" onClick={doImport} disabled={!fundKey||!parsed.length} style={{opacity:(!fundKey||!parsed.length)?0.4:1}}>Import Transactions{parsed.length>0?` (${parsed.length})`:''}</button>
        </div>
      </div>
    </div>
  );
}
