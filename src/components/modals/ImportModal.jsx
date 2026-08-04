import React, { useState, useRef } from 'react';
import useAppStore from '../../store/useAppStore.js';
import { MF_FUNDS } from '../../constants/funds.js';
import { parseCSVRow, autoDetectColumns, parseImportRows } from '../../utils/importParser.js';
import { fIN, fmtDate } from '../../utils/formatters.js';
import { appAlert } from '../ui/ConfirmDialog.jsx';
const _appAlert = appAlert; // shared with TextHoldingsTab
// ── AMC Excel parser ──────────────────────────────────────────────────────────
async function parseAMCExcel(file) {
  if (!window.XLSX) {
    await new Promise((res, rej) => {
      const sc = document.createElement('script');
      sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      sc.onload = res; sc.onerror = rej;
      document.head.appendChild(sc);
    });
  }
  const buf = await file.arrayBuffer();
  const wb = window.XLSX.read(buf, { type: 'array' });
  const results = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    if (!rows.length) continue;

    // ── Detect format ─────────────────────────────────────────────────────────
    let headerRow = -1;
    let namecol = -1, sectorcol = -1, pctcol = -1, mktcol = -1;
    let isDecimalPct = false; // PPFCF stores 0.0833 instead of 8.33

    for (let i = 0; i < Math.min(10, rows.length); i++) {
      const r = rows[i].map(v => String(v || '').trim().toLowerCase());
      const joined = r.join(' ');
      if (joined.includes('name of instrument') || joined.includes('name of the instrument')) {
        headerRow = i;
        // Find columns by header text
        pctcol = r.findIndex(c => c.includes('% to net') || c.includes('% to nav') || c.includes('net assets'));
        mktcol = r.findIndex(c => c.includes('market') && (c.includes('value') || c.includes('fair')));
        sectorcol = r.findIndex(c => c.includes('industry') || c.includes('sector') || c.includes('rating'));

        // PPFCF: header in col0 = None/blank, name in col1
        // Kotak:  header in col0 = 'Name of Instrument', actual name in col2
        const hcell = String(rows[i][0] || '').trim().toLowerCase();
        if (hcell.includes('name of instrument')) {
          // Kotak style: name is in col2 (first data row has col0=None, col1=' ', col2=name)
          namecol = 2;
          if (sectorcol === -1) sectorcol = 4; // Kotak: Industry in col4
          if (mktcol === -1) mktcol = 7;        // Kotak: Market Value in col7
          if (pctcol === -1) pctcol = 8;         // Kotak: % in col8
        } else {
          // PPFAS style: name in col1
          namecol = 1;
          // Check if pct is decimal (0.0833) or percentage (8.33)
          // Look at first real data row after headers
          for (let j = i + 2; j < Math.min(i + 10, rows.length); j++) {
            const testPct = parseFloat(rows[j]?.[pctcol]);
            if (!isNaN(testPct) && testPct > 0) {
              if (testPct < 1) isDecimalPct = true; // decimal format
              break;
            }
          }
        }
        break;
      }
    }
    if (headerRow === -1 || namecol === -1) continue;

    const holdings = [];
    const sectorMap = {};
    let equity = 0, debt = 0, cash = 0;

    for (let i = headerRow + 1; i < rows.length; i++) {
      const row = rows[i];
      const rawName = String(row[namecol] || '').trim();
      if (!rawName || rawName === ' ') continue;

      const nl = rawName.toLowerCase();
      // Stop ONLY at grand total — everything else we skip and continue
      if (nl === 'grand total' || nl === 'net assets' || nl === 'total assets') break;
      // Skip section headers, sub-totals, footnotes — continue to find more data
      if (nl === 'total' || nl === 'nil' || nl === 'n.a.' ||
          nl.includes('sub total') || nl.includes('sub-total') ||
          nl.includes('equity &') || nl.includes('equity and') ||
          nl.includes('listed/') || nl.includes('awaiting listing') ||
          nl.includes('foreign investments') || nl.includes('unlisted') ||
          nl.includes('money market') || nl.includes('certificate of deposit') ||
          nl.includes('commercial paper') || nl.includes('treasury bill') ||
          nl.includes('reverse repo') || nl.includes('mutual fund units') ||
          nl.includes('reits') || nl.includes('arbitrage') ||
          /^\([a-z]\)/.test(nl) ||
          nl.startsWith('$') || nl.startsWith('note') ||
          nl.includes('since inception') || nl.includes('total amount') ||
          nl.includes('market value of') || nl.includes('returns (annualised)') ||
          nl.includes('nifty') || nl.includes('benchmark')) continue;

      let pct = parseFloat(row[pctcol]);
      if (isNaN(pct) || pct <= 0) continue;
      if (isDecimalPct) pct = pct * 100; // convert 0.0833 → 8.33

      // Skip rows where pct is unreasonably large (qty column mistaken for pct)
      if (pct > 100) continue;

      const mktVal = parseFloat(row[mktcol]) || 0;
      const sector = String(row[sectorcol] || '').trim() || 'Other';
      const sl = sector.toLowerCase();
      const isEquity = !['cash','repo','tbill','t-bill','nil','mutual fund'].some(x => sl.includes(x));

      holdings.push({
        name: rawName,
        weightage: pct.toFixed(4),
        sector,
        marketValue: mktVal ? mktVal.toFixed(2) : null,
      });

      if (isEquity) {
        equity += pct;
        sectorMap[sector] = (sectorMap[sector] || 0) + pct;
      } else if (sl.includes('cash') || sl.includes('repo')) {
        cash += pct;
      } else {
        debt += pct;
      }
    }

    if (!holdings.length) continue;

    const sectors = Object.entries(sectorMap)
      .sort((a, b) => b[1] - a[1])
      .map(([sector, w]) => ({ sector, weightage: w.toFixed(2) }));

    const title = String(rows[0]?.find(v=>v) || sheetName).trim();
    results.push({ sheetName, title, holdings, sectors, equity, debt, cash });
  }
  return results;
}

// ── Text Holdings Tab ─────────────────────────────────────────────────────────
function TextHoldingsTab({ isDark, bg, bord, textPri, textSec, inputBg, onClose, saveToLocalStorage }) {
  const [raw, setRaw] = React.useState('');
  const [parsed, setParsed] = React.useState(null);
  const [error, setError] = React.useState('');
  const [fundKey, setFundKey] = React.useState('');

  function parse(txt) {
    setRaw(txt); setError(''); setParsed(null);
    if (!txt.trim()) return;
    try {
      const match = txt.match(/"holdings"\s*:\s*(\[[\s\S]*?\])/);
      if (!match) throw new Error('Cannot find "holdings":[...] — copy more of the page source');
      const arr = JSON.parse(match[1]);
      const holdings = arr.filter(h=>h.corpus_per>0&&h.company_name).map(h=>({
        name: h.company_name,
        weightage: String(h.corpus_per),
        sector: h.nature_name==='EQUITY'?(h.sector_name||'Other'):h.nature_name,
        type: h.nature_name,
      }));
      const sectorMap = {};
      arr.filter(h=>h.nature_name==='EQUITY'&&h.corpus_per>0).forEach(h=>{
        const sec=h.sector_name||'Other';
        sectorMap[sec]=(sectorMap[sec]||0)+h.corpus_per;
      });
      const sectors = Object.entries(sectorMap).sort((a,b)=>b[1]-a[1]).map(([sector,w])=>({sector,weightage:w.toFixed(2)}));
      const equity = arr.filter(h=>h.nature_name==='EQUITY').reduce((s,h)=>s+h.corpus_per,0);
      const debt   = arr.filter(h=>h.nature_name==='DEBT').reduce((s,h)=>s+Math.abs(h.corpus_per),0);
      const cash   = arr.filter(h=>h.nature_name==='CASH').reduce((s,h)=>s+Math.abs(h.corpus_per),0);
      const schemeCode = arr[0]?.scheme_code;
      const portfolioDate = arr[0]?.portfolio_date?.split('T')[0]||null;
      // Auto-detect fund
      if (schemeCode && !fundKey) {
        const found = Object.entries(MF_FUNDS).find(([,f])=>f.code===schemeCode);
        if (found) setFundKey(found[0]);
      }
      setParsed({ holdings, sectors, equity, debt, cash, portfolioDate, schemeCode });
    } catch(e) { setError(e.message); }
  }

  function doSave() {
    if (!fundKey||!parsed) return;
    saveToLocalStorage(fundKey, parsed.holdings, parsed.sectors,
      { equity: parsed.equity.toFixed(2), debt: parsed.debt.toFixed(2), cash: parsed.cash.toFixed(2) },
      'text', parsed.portfolioDate
    );
    _appAlert(`✓ Holdings saved for ${MF_FUNDS[fundKey]?.name||fundKey}\n${parsed.holdings.length} stocks · ${parsed.sectors.length} sectors`);
    onClose();
  }

  return (<>
    <div style={{fontSize:11,color:textSec,marginBottom:10,lineHeight:1.7}}>
      Open fund page on Groww → View Page Source (Ctrl+U) → Ctrl+F <code style={{background:isDark?'#1a1a1a':'#1e2840',padding:'1px 4px',borderRadius:3}}>"holdings":[</code> → copy from there to the closing <code style={{background:isDark?'#1a1a1a':'#1e2840',padding:'1px 4px',borderRadius:3}}>]</code>
    </div>
    <div className="fg">
      <label>Fund</label>
      <select value={fundKey} onChange={e=>setFundKey(e.target.value)}>
        <option value="">— Select fund —</option>
        {Object.keys(MF_FUNDS).map(k=><option key={k} value={k}>{MF_FUNDS[k].name} ({k})</option>)}
      </select>
    </div>
    <div className="fg">
      <label>Paste Holdings JSON</label>
      <textarea value={raw} onChange={e=>parse(e.target.value)} rows={7}
        style={{width:'100%',padding:'9px 11px',border:'1px solid '+bord,borderRadius:7,background:inputBg,color:isDark?'#e8e8e8':'#e0e4ef',fontSize:11,fontFamily:'monospace',resize:'vertical',outline:'none',boxSizing:'border-box'}}
        placeholder={'"holdings":[{"scheme_code":"118632","company_name":"HDFC Bank Ltd","sector_name":"Financial","nature_name":"EQUITY","corpus_per":9.31,...}]'}/>
    </div>
    {error&&<div style={{fontSize:12,color:'#f97316',marginBottom:8}}>⚠ {error}</div>}
    {parsed&&<div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:10}}>
        <div className="tax-card" style={{padding:'7px 10px'}}><div className="tax-label">Holdings</div><div className="tax-val" style={{fontSize:13}}>{parsed.holdings.length} stocks</div></div>
        <div className="tax-card" style={{padding:'7px 10px'}}><div className="tax-label">Sectors</div><div className="tax-val" style={{fontSize:13}}>{parsed.sectors.length}</div></div>
        <div className="tax-card" style={{padding:'7px 10px'}}><div className="tax-label">Date</div><div className="tax-val" style={{fontSize:13}}>{parsed.portfolioDate||'—'}</div></div>
      </div>
      <div className="tax-card" style={{padding:'8px 12px',marginBottom:10}}>
        <div className="tax-label" style={{marginBottom:4}}>Asset Allocation</div>
        <div style={{display:'flex',gap:14}}>
          <span style={{fontSize:11,color:'#7ab8ff'}}>Equity <b>{parsed.equity.toFixed(1)}%</b></span>
          <span style={{fontSize:11,color:'#c9a84c'}}>Debt <b>{parsed.debt.toFixed(1)}%</b></span>
          <span style={{fontSize:11,color:'#34d399'}}>Cash <b>{parsed.cash.toFixed(1)}%</b></span>
        </div>
      </div>
    </div>}
    <div className="mfooter">
      <button className="mcn" onClick={onClose}>Cancel</button>
      <button className="msv" onClick={doSave} disabled={!fundKey||!parsed} style={{opacity:(!fundKey||!parsed)?0.4:1}}>Save Holdings</button>
    </div>
  </>);
}

export default function ImportModal({ onClose }) {
  const { db, saveTx } = useAppStore();
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const fileRef = useRef(null);

  // Tab
  const [tab, setTab] = useState('transactions');

  // Holdings import state
  const [xlFile, setXlFile] = useState(null);
  const [xlParsed, setXlParsed] = useState(null); // array of sheet results
  const [xlLoading, setXlLoading] = useState(false);
  const [xlError, setXlError] = useState('');
  const [xlFundMap, setXlFundMap] = useState({}); // sheetName → fundKey

  // Transaction import state
  const [csv,setCsv]=useState('');const [parseStatus,setParseStatus]=useState('');
  const [headers,setHeaders]=useState([]);const [dataRows,setDataRows]=useState([]);
  const [colMap,setColMap]=useState({date:-1,type:-1,units:-1,nav:-1,amount:-1});
  const [parsed,setParsed]=useState([]);const [warns,setWarns]=useState([]);
  const [fundKey,setFundKey]=useState('');const [showMap,setShowMap]=useState(false);

  // ── Excel upload ─────────────────────────────────────────────────────────────
  async function onFileChange(e) {
    const f = e.target.files[0];
    if (!f) return;
    setXlFile(f); setXlParsed(null); setXlError(''); setXlLoading(true);
    try {
      const results = await parseAMCExcel(f);
      if (!results.length) throw new Error('No holdings data found in file');
      setXlParsed(results);
      // Auto-match sheets to funds by scheme code search
      const autoMap = {};
      results.forEach(r => {
        const titleLower = r.title.toLowerCase();
        const found = Object.entries(MF_FUNDS).find(([k, f]) =>
          titleLower.includes(f.name.toLowerCase().slice(0, 8)) ||
          r.sheetName.toLowerCase().includes(k.toLowerCase())
        );
        if (found) autoMap[r.sheetName] = found[0];
      });
      setXlFundMap(autoMap);
    } catch(e) {
      setXlError(e.message);
    } finally {
      setXlLoading(false);
    }
  }

  function saveToLocalStorage(fundKey, holdings, sectors, assetAllocation, source, portfolioDate) {
    try {
      const raw = localStorage.getItem('mf_holdings_manual');
      const all = raw ? JSON.parse(raw) : {};
      all[fundKey] = { holdings, sectors, assetAllocation, source, portfolioDate, importedAt: new Date().toISOString() };
      localStorage.setItem('mf_holdings_manual', JSON.stringify(all));
    } catch(e) { console.error('save holdings:', e); }
  }

  function doSaveHoldings() {
    let saved = 0;
    for (const result of xlParsed) {
      const key = xlFundMap[result.sheetName];
      if (!key) continue;
      saveToLocalStorage(key, result.holdings, result.sectors,
        { equity: result.equity.toFixed(2), debt: result.debt.toFixed(2), cash: result.cash.toFixed(2) },
        'amc_excel', null
      );
      saved++;
    }
    appAlert(`✓ Holdings saved for ${saved} fund${saved!==1?'s':''}.`);
    onClose();
  }

  // ── Transaction import ────────────────────────────────────────────────────────
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
  async function doImport(){
    if(!fundKey||!parsed.length)return;
    const existing=db.mf[fundKey]?.transactions||[];
    let dupes=0, imported=0;
    for(const tx of parsed){
      const isDupe=existing.some(t=>t.date===tx.date&&Math.abs(parseFloat(t.units||0)-tx.units)<0.001&&Math.abs(parseFloat(t.nav||0)-tx.nav)<0.001);
      if(isDupe){dupes++;continue;}
      await saveTx(fundKey,{...tx,amount:String(tx.amount),stamp:String(tx.stamp||0),units:String(tx.units),nav:String(tx.nav)});
      imported++;
    }
    appAlert(`✓ Imported ${imported} transaction${imported!==1?'s':''} into ${MF_FUNDS[fundKey]?.name||fundKey}${dupes?`\n(${dupes} duplicate${dupes!==1?'s':''} skipped)`:''}.`);
    onClose();
  }

  const fields=[{key:'date',label:'Date *'},{key:'type',label:'Type (Buy/Sell)'},{key:'units',label:'Units *'},{key:'nav',label:'NAV (₹) *'},{key:'amount',label:'Amount (₹)'}];
  const colOpts=[<option key="-1" value="-1">— ignore —</option>,...headers.map((h,i)=><option key={i} value={i}>{h||'Col '+(i+1)}</option>)];

  const bg = isDark ? '#111111' : '#162030';
  const bord = isDark ? '#222' : '#2a3348';
  const textPri = isDark ? '#e8e8e8' : '#e0e8ff';
  const textSec = isDark ? '#888' : '#9aaac8';
  const inputBg = isDark ? '#0a0a0a' : '#0d1117';

  return(
    <div className="mbg open" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" style={{width:640,maxHeight:'92vh',overflowY:'auto'}}>
        <div className="mh"><div className="mt">⬆ Import</div><button className="mc2" onClick={onClose}>×</button></div>

        {/* Tabs */}
        <div style={{display:'flex',gap:0,borderRadius:8,overflow:'hidden',border:'1px solid '+bord,marginBottom:16}}>
          {[['transactions','📋 Transactions'],['text','📄 Holdings (Text)'],['excel','📊 Holdings (Excel)']].map(([t,label])=>(
            <button key={t} onClick={()=>setTab(t)} style={{
              flex:1,padding:'8px',fontSize:11,fontWeight:700,cursor:'pointer',border:'none',
              background:tab===t?(isDark?'#1a2235':'#1e3a5f'):bg,
              color:tab===t?'#c9a84c':textSec,transition:'all 0.15s',
            }}>{label}</button>
          ))}
        </div>

        {/* ── TRANSACTIONS TAB ────────────────────────────────────────────────── */}
        {tab==='transactions'&&<div>
          <div className="fg"><label>Target Fund</label>
            <select value={fundKey} onChange={e=>setFundKey(e.target.value)}>
              <option value="">— Select fund —</option>
              {Object.keys(MF_FUNDS).map(k=><option key={k} value={k}>{MF_FUNDS[k].name} ({k})</option>)}
            </select></div>
          <div className="fg">
            <label>Paste CSV / Statement Data</label>
            <div style={{fontSize:10,color:textSec,marginBottom:6}}>Copy rows from Groww / CAMS / Zerodha statement and paste below. Header row recommended. Stamp Duty is auto-calculated (0.005%).</div>
            <textarea value={csv} onChange={e=>onCSVChange(e.target.value)} rows={8} style={{width:'100%',padding:'9px 11px',border:'1px solid '+bord,borderRadius:7,background:inputBg,color:isDark?'#e8e8e8':'#e0e4ef',fontSize:12,fontFamily:'monospace',resize:'vertical',outline:'none',boxSizing:'border-box'}} placeholder="Date,Type,Units,NAV,Amount&#10;2024-01-10,Purchase,250.000,72.00,18000"/>
            <div className="nfs" style={{color:parseStatus.startsWith('Detected')?'#34d399':'#f97316'}}>{parseStatus}</div>
          </div>
          {showMap&&<div>
            <div style={{fontSize:11,fontWeight:700,color:'#c9a84c',marginBottom:8,textTransform:'uppercase',letterSpacing:'1px'}}>Map Columns</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:12}}>
              {fields.map(f=><div key={f.key} className="fg" style={{marginBottom:0}}>
                <label>{f.label}</label>
                <select value={colMap[f.key]} onChange={e=>onColMapChange(f.key,e.target.value)} style={{width:'100%',padding:'7px 10px',border:'1px solid '+bord,borderRadius:7,background:inputBg,color:isDark?'#e8e8e8':'#e0e4ef',fontSize:12,outline:'none'}}>{colOpts}</select>
              </div>)}
            </div>
            {warns.length>0&&<div style={{fontSize:11,color:'#f97316',marginBottom:8}}>⚠ {warns.slice(0,3).join(' | ')}{warns.length>3?` + ${warns.length-3} more`:''}</div>}
            {parsed.length>0&&<div>
              <div style={{fontSize:11,fontWeight:700,color:'#c9a84c',marginBottom:6,textTransform:'uppercase'}}>Preview ({parsed.length} rows{parsed.length>50?' — showing first 50':''})</div>
              <div style={{overflowX:'auto',maxHeight:180,overflowY:'auto',border:'1px solid '+bord,borderRadius:7}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                  <thead style={{background:isDark?'#0a0a0a':'#131b2a',position:'sticky',top:0}}><tr>
                    {['Date','Type','Units','NAV ₹','Amount ₹','Stamp ₹'].map(h=><th key={h} style={{padding:'6px 10px',textAlign:'left',color:'#8899bb',fontWeight:700,borderBottom:'1px solid '+bord,whiteSpace:'nowrap'}}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {parsed.slice(0,50).map((r,i)=><tr key={i} style={{borderBottom:'1px solid '+(isDark?'#111':'#1e2840')}}>
                      <td style={{padding:'5px 10px',color:textPri}}>{fmtDate(r.date)}</td>
                      <td style={{padding:'5px 10px',color:r.type==='Invested'?'#34d399':'#f87171',fontWeight:600}}>{r.type==='Invested'?'Buy':'Sell'}</td>
                      <td style={{padding:'5px 10px',textAlign:'right',color:textPri}}>{r.units.toFixed(3)}</td>
                      <td style={{padding:'5px 10px',textAlign:'right',color:textPri}}>{r.nav.toFixed(4)}</td>
                      <td style={{padding:'5px 10px',textAlign:'right',color:textPri}}>{fIN(r.amount)}</td>
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
        </div>}

        {/* ── HOLDINGS TAB (AMC Excel) ─────────────────────────────────────── */}
        {/* ── TEXT PASTE TAB ─────────────────────────────────────────────── */}
        {tab==='text'&&<div>
          <TextHoldingsTab isDark={isDark} bg={bg} bord={bord} textPri={textPri} textSec={textSec} inputBg={inputBg} onClose={onClose} saveToLocalStorage={saveToLocalStorage}/>
        </div>}

                {tab==='excel'&&<div>
          <div style={{fontSize:11,color:textSec,marginBottom:12,lineHeight:1.7}}>
            Upload the monthly portfolio disclosure Excel from the AMC website.<br/>
            Supports PPFAS, Kotak and similar formats. Multi-sheet files supported.
          </div>
          <div className="fg">
            <label>Upload AMC Portfolio Excel (.xlsx / .xls)</label>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={onFileChange}
              style={{display:'none'}}/>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <button className="btn btn-dark" onClick={()=>fileRef.current.click()}>
                📂 Choose File
              </button>
              <span style={{fontSize:11,color:textSec}}>{xlFile?.name||'No file chosen'}</span>
            </div>
          </div>

          {xlLoading&&<div style={{textAlign:'center',padding:'24px',color:textSec}}>
            <div style={{width:24,height:24,borderRadius:'50%',border:'2px solid '+bord,borderTopColor:'#c9a84c',animation:'spin 0.8s linear infinite',margin:'0 auto 8px'}}/>
            <div style={{fontSize:12}}>Parsing Excel...</div>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>}

          {xlError&&<div style={{fontSize:12,color:'#f97316',background:isDark?'#1a1008':'#1a1008',border:'1px solid #4d2e0a',borderRadius:7,padding:'8px 12px',marginBottom:12}}>⚠ {xlError}</div>}

          {xlParsed&&xlParsed.map(result=>(
            <div key={result.sheetName} className="tax-section" style={{marginBottom:12}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
                <div>
                  <div style={{fontSize:12,fontWeight:700,color:textPri}}>{result.title}</div>
                  <div style={{fontSize:10,color:textSec,marginTop:2}}>Sheet: {result.sheetName} · {result.holdings.length} stocks · Equity {result.equity.toFixed(1)}% / Cash {result.cash.toFixed(1)}%</div>
                </div>
                <div className="fg" style={{marginBottom:0,minWidth:180}}>
                  <select value={xlFundMap[result.sheetName]||''} onChange={e=>setXlFundMap(m=>({...m,[result.sheetName]:e.target.value}))}
                    style={{padding:'6px 10px',border:'1px solid '+bord,borderRadius:7,background:inputBg,color:textPri,fontSize:11,outline:'none',width:'100%'}}>
                    <option value="">— Map to fund —</option>
                    {Object.keys(MF_FUNDS).map(k=><option key={k} value={k}>{MF_FUNDS[k].name}</option>)}
                  </select>
                </div>
              </div>
              {/* Top 5 preview */}
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                {result.holdings.slice(0,5).map((h,i)=>(
                  <div key={i} style={{background:isDark?'#111':'#1e2840',borderRadius:5,padding:'4px 8px',fontSize:10}}>
                    <span style={{color:textSec}}>{h.name}</span>
                    <span style={{color:'#c9a84c',fontWeight:700,marginLeft:5}}>{parseFloat(h.weightage).toFixed(1)}%</span>
                  </div>
                ))}
                {result.holdings.length>5&&<div style={{fontSize:10,color:textSec,padding:'4px 0'}}>+{result.holdings.length-5} more</div>}
              </div>
            </div>
          ))}

          <div className="mfooter">
            <button className="mcn" onClick={onClose}>Cancel</button>
            <button className="msv"
              onClick={doSaveHoldings}
              disabled={!xlParsed||!Object.values(xlFundMap).some(v=>v)}
              style={{opacity:(!xlParsed||!Object.values(xlFundMap).some(v=>v))?0.4:1}}>
              Save Holdings{xlParsed&&Object.values(xlFundMap).filter(v=>v).length>0?` (${Object.values(xlFundMap).filter(v=>v).length} fund${Object.values(xlFundMap).filter(v=>v).length!==1?'s':''})`:''}</button>
          </div>
        </div>}
      </div>
    </div>
  );
}
