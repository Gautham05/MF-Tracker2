import React, { useState, useRef } from 'react';
import useAppStore from '../../store/useAppStore.js';
import { MF_FUNDS } from '../../constants/funds.js';
import ManageFundsModal from '../modals/ManageFundsModal.jsx';
import AddFundModal from '../modals/AddFundModal.jsx';
import ImportModal from '../modals/ImportModal.jsx';
import SupaLoginModal from '../modals/SupaLoginModal.jsx';
import { exportPDF } from '../../services/pdfExport.js';
import { appAlert, appConfirm, appUpdateDialog, appOpenProgress, appCloseDialog, wasDialogCancelled, resetDialogCancel } from '../ui/ConfirmDialog.jsx';
import { isLoggedIn, clearSupaCreds } from '../../store/supabase.js';

export default function Sidebar() {
  // Theme: 'dark' | 'light' | 'off' — default 'dark', persisted in localStorage
  const [theme, setTheme] = React.useState(()=>{ const t=localStorage.getItem('mft_theme')||'dark'; return (t==='dark'||t==='off')?t:'dark'; });
  const [showSettings, setShowSettings] = React.useState(false);
  const [showLogin, setShowLogin] = React.useState(false);
  const [loggedIn, setLoggedIn] = React.useState(isLoggedIn);
  // Derive colors from current theme so settings panel matches dark/off
  const sLabelColor = theme==='dark' ? '#555555' : '#6b7a9a';
  const sDivColor   = theme==='dark' ? '#222222' : '#333333';

  React.useEffect(()=>{
    if(!showSettings)return;
    const handler=(e)=>{
      if(!e.target.closest('#main-sidebar'))setShowSettings(false);
    };
    document.addEventListener('mousedown',handler);
    return()=>document.removeEventListener('mousedown',handler);
  },[showSettings]);
  React.useEffect(()=>{
    if(theme==='off') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('mft_theme', theme);
  },[theme]);
  const currentPage = useAppStore(s => s.currentPage);
  const setPage = useAppStore(s => s.setPage);
  const sidebarOpen = useAppStore(s => s.sidebarOpen);
  const closeSidebar = useAppStore(s => s.closeSidebar);
  const db = useAppStore(s => s.db);
  const [showManage, setShowManage] = useState(false);
  const [showAddFund, setShowAddFund] = useState(false);
  const [showAddFundDirect, setShowAddFundDirect] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const funds = Object.keys(MF_FUNDS);
  const importInputRef = useRef(null);

  // ── Export: download current db state as JSON ──
  function handleExportJSON() {
    try {
      const db = useAppStore.getState().db;
      const exportData = { mf: db.mf || {}, customFunds: db.customFunds || [] };
      const fundCount = exportData.customFunds.length;
      const txCount = Object.values(exportData.mf).reduce((s,f)=>s+(f.transactions?.length||0),0);
      if (!fundCount && !txCount) { appAlert('No data found to export.', {variant:'alert-warn'}).then(()=>{}); return; }
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'MF_Tracker_Backup_' + new Date().toISOString().slice(0,10) + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      appAlert('✓ Backup saved!\n\n' + fundCount + ' fund' + (fundCount!==1?'s':'') + ', ' + txCount + ' transaction' + (txCount!==1?'s':'') + '\n\nClick Refresh NAV after importing to reload NAV data.', {variant:'alert', confirmLabel:'OK'}).then(()=>{});
    } catch(e) {
      appAlert('Export failed: ' + e.message, {variant:'alert-warn'}).then(()=>{});
    }
  }

  // ── Import: restore from JSON file ──
  function handleImportJSON() {
    if (importInputRef.current) {
      importInputRef.current.value = '';
      importInputRef.current.click();
    }
  }

  function handleFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (typeof data !== 'object' || data === null) throw new Error('Invalid JSON structure');
        const hasMF = data.mf && typeof data.mf === 'object';
        const hasCustomFunds = data.customFunds && Array.isArray(data.customFunds);
        if (!hasMF && !hasCustomFunds) throw new Error('File does not look like an MF Tracker backup');
        const fundCount = (data.customFunds||[]).length;
        const txCount = Object.values(data.mf||{}).reduce((s,f)=>s+(f.transactions?.length||0),0);
        const ok = await appConfirm(
          'Import backup file "' + file.name + '"?\n\n' +
          fundCount + ' fund' + (fundCount!==1?'s':'') + ', ' +
          txCount + ' transaction' + (txCount!==1?'s':'') + '\n\n' +
          '⚠ Existing transactions for these funds will be deleted and replaced with data from this file.',
          { variant:'alert-warn', confirmLabel:'Import & Replace', cancelLabel:'Cancel' }
        );
        if (!ok) return;
        // Validate each fund code against mfapi before importing
        const funds = data.customFunds || [];
        const invalidFunds = [];
        const validFunds = [];
        if (funds.length > 0) {
          // Show non-closeable validating dialog with only Cancel
          resetDialogCancel();
          appOpenProgress('Validating fund codes with mfapi...', {variant:'alert', confirmLabel:'', cancelLabel:'Cancel'});
          for (const f of funds) {
            if (wasDialogCancelled()) break; // user clicked Cancel — stop validation
            const code = f.data?.code || f.code;
            if (!code) { invalidFunds.push(`${f.key}: no scheme code`); continue; }
            try {
              const r = await fetch(`https://api.mfapi.in/mf/${code}`);
              const j = await r.json();
              if (j.data && j.data.length && j.meta?.scheme_name) {
                validFunds.push({ f, schemeName: j.meta.scheme_name, navData: j.data, navMeta: j.meta });
              } else {
                invalidFunds.push(`${f.key} (code ${code}): not found in AMFI`);
              }
            } catch(e) {
              invalidFunds.push(`${f.key} (code ${code}): network error`);
            }
          }
          appCloseDialog();
          if (wasDialogCancelled()) return; // cancelled — stop entire import
        }
        if (invalidFunds.length > 0) {
          if (validFunds.length === 0) {
            await appAlert('⚠ All fund codes are invalid:\n\n' + invalidFunds.join('\n') + '\n\nImport cancelled.', {variant:'alert-warn', confirmLabel:'OK'});
            return;
          }
          const skip = await appConfirm(
            '⚠ These fund codes are invalid and will be skipped:\n\n' + invalidFunds.join('\n') +
            '\n\n' + validFunds.length + ' valid fund(s) will be imported. Continue?',
            {variant:'alert-warn', confirmLabel:'Import Valid Funds', cancelLabel:'Cancel'}
          );
          if (!skip) return;
        }
        // Show final confirmation
        const validList = validFunds.map(v => `✓ ${v.f.key} - ${v.f.data?.code||v.f.code}: ${v.schemeName}`).join('\n');
        const finalOk = await appConfirm(
          'Ready to import ' + validFunds.length + ' fund' + (validFunds.length!==1?'s':'') + ':\n\n' + validList + '\n\n⚠ Existing transactions for these funds will be wiped and replaced.',
          {variant:'alert-warn', confirmLabel:'Import & Replace', cancelLabel:'Cancel'}
        );
        if (!finalOk) return;
        // Disable buttons and show progress while importing
        // Open progress dialog for import — non-closeable, shows fund count
        appOpenProgress('Importing funds into database...\nPlease wait.', {variant:'alert', confirmLabel:'', cancelLabel:'Cancel', cancelDisabled:true});
        // Import each valid fund + its transactions via store actions (silent — no re-renders)
        const { addFund, saveTx, initDB } = useAppStore.getState();
        const { dbDeleteAllTxForFund } = await import('../../store/db.js');
        const { parseMFData, buildStandardFullName, normalizeFundCategory } = await import('../../constants/funds.js');
        let importedFunds = 0, importedTx = 0;
        for (const { f, navData, navMeta } of validFunds) {
          const key = f.key;
          const fundData = f.data || {};
          // Build nav entries
          const parsed = parseMFData(navData);
          const navHistArr = parsed.map(d=>({dateStr:d.dateStr,nav:d.nav}));
          const navDataEntry = navData.length ? {nav:parseFloat(navData[0].nav),date:navData[0].date} : null;
          // Normalise names
          const fn = buildStandardFullName(fundData.fullName||fundData.name||navMeta?.scheme_name||'');
          let sn = fn.replace(/\s*-\s*Direct Plan\s*-\s*Growth$/,'').replace(/\s*-\s*Regular Plan\s*-\s*Growth$/,' (Reg)')
            .replace(/\s*-\s*Direct Plan\s*-\s*IDCW$/,' IDCW').replace(/\s*-\s*Regular Plan\s*-\s*IDCW$/,' IDCW (Reg)')
            .replace(/\s*Fund$/,'').replace(/\s+/g,' ').trim();
          if(/Regular Plan/i.test(fn)&&!/IDCW/i.test(fn)&&!sn.endsWith(' (Reg)'))sn+=' (Reg)';
          if(sn.length>32)sn=sn.slice(0,30)+'\u2026';
          const cat = normalizeFundCategory(navMeta?.scheme_category||fundData.category||'', fn);
          const cleanFundData = {
            name: sn, fullName: fn,
            code: String(fundData.code),
            color: fundData.color||'#c9a84c',
            ter: fundData.ter||0,
            category: cat||fundData.category||'',
            amcName: navMeta?.fund_house||fundData.amcName||'',
          };
          appUpdateDialog({ message:`Importing fund ${importedFunds+1}/${validFunds.length}: ${key}...\nPlease wait.` });
          await addFund(key, cleanFundData, navDataEntry, navHistArr, true); // silent
          importedFunds++;
          // Wipe existing transactions for this fund by scheme code, then insert fresh
          // Matches by fund_code (scheme code) not short key — handles renamed funds correctly
          await dbDeleteAllTxForFund(String(fundData.code));
          const txList = data.mf?.[key]?.transactions || [];
          for (const tx of txList) {
            await saveTx(key, { date:tx.date, type:tx.type, amount:tx.amount, stamp:tx.stamp||'0', units:tx.units, nav:tx.nav }, null, true); // silent
            importedTx++;
          }
        }
        // Close progress dialog, show success
        appCloseDialog();
        await appAlert(
          '✓ Import complete!\n\n' + importedFunds + ' fund' + (importedFunds!==1?'s':'') + ' and ' + importedTx + ' transaction' + (importedTx!==1?'s':'') + ' imported.\n\nClick OK to reload.',
          {variant:'alert', confirmLabel:'OK'}
        );
        // Reload page — cleanest way to re-run initDB from scratch after bulk import
        localStorage.setItem('mft_auto_nav', '1');
        window.location.reload();
      } catch(err) {
        appAlert('Import failed: ' + err.message + '\n\nMake sure you selected a valid MF Tracker backup file.', {variant:'alert-warn'}).then(()=>{});
      }
    };
    reader.onerror = () => appAlert('Could not read file.', {variant:'alert-warn'}).then(()=>{});
    reader.readAsText(file);
  }

  return (
    <>
      {sidebarOpen && <div className="sidebar-backdrop open" onClick={closeSidebar}/>}
      <div className={`sidebar${sidebarOpen?' open':''}`} id="main-sidebar">
        <div className="sidebar-nav" id="sidebar-nav">
          <div className="slabel">Overview</div>
          <button className={`nav-btn${currentPage==='Dashboard'?' active':''}`} onClick={()=>setPage('Dashboard')}>
            <span className="nicon">◎</span><span>Dashboard</span>
          </button>
          <button className={`nav-btn${currentPage==='Insights'?' active':''} sidebar-insights-btn`} onClick={()=>setPage('Insights')}>
            <span className="nicon">✦</span><span>Insights</span>
          </button>
          {funds.length>0&&<div className="slabel" style={{marginTop:6}}>Funds</div>}
          {funds.map(k=>(
            <div key={k} style={{display:'flex',alignItems:'center',gap:0}}>
              <button className={`nav-btn${currentPage===k?' active':''}`} style={{flex:1,minWidth:0}} onClick={()=>setPage(k)}>
                <span className="nicon" style={{color:MF_FUNDS[k]?.color||'#c9a84c'}}>◈</span>
                <span>{k}<span className="nsub">{MF_FUNDS[k]?.name||k}</span></span>
              </button>
              <button title="Holdings" onClick={(e)=>{e.stopPropagation();setPage('Holdings:'+k);}} style={{background:'none',border:'none',cursor:'pointer',color:currentPage===('Holdings:'+k)?'#c9a84c':'#4a5570',padding:'4px 6px',fontSize:11,flexShrink:0,transition:'color 0.15s'}}>⊞</button>
            </div>
          ))}
        </div>
        <div className="sidebar-footer" style={{padding:0}}>
          {/* Inline animated settings list */}
          <div style={{
            overflow:'hidden',
            maxHeight:showSettings?'480px':'0',
            opacity:showSettings?1:0,
            transition:'max-height 0.4s cubic-bezier(0.4,0,0.2,1),opacity 0.3s ease',
          }}>
            <div style={{padding:'6px 8px 4px'}}>
              {/* Theme */}
              <div style={{fontSize:10,fontWeight:700,color:sLabelColor,textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:8}}>Theme</div>
              <div style={{display:'flex',gap:4,marginBottom:10}}>
                {[['dark','🌙 Dark'],['off','⚙ Off']].map(([t,label],i)=>(
                  <button key={t} onClick={()=>setTheme(t)} style={{
                    flex:1,padding:'7px 4px',borderRadius:7,cursor:'pointer',fontSize:11,fontWeight:700,
                    background:theme===t?'#2a2010':'transparent',
                    color:theme===t?'#c9a84c':sLabelColor,
                    border:'1px solid '+(theme===t?'#c9a84c':sDivColor),
                    transform:showSettings?'translateY(0)':'translateY(8px)',
                    opacity:showSettings?1:0,
                    transition:`transform 0.35s cubic-bezier(0.34,1.56,0.64,1) ${0.03+i*0.05}s,opacity 0.3s ease ${0.03+i*0.05}s,background 0.15s`,
                  }}>{label}</button>
                ))}
              </div>
              <hr style={{border:'none',borderTop:'1px solid '+sDivColor,margin:'0 0 8px'}}/>
              {/* Funds */}
              <div style={{fontSize:10,fontWeight:700,color:sLabelColor,textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:6}}>Funds</div>
              {[
                {label:'➕ Add Fund',color:'#34d399',bc:'#1a3020',bg:'#0d1f14',delay:0.08,action:()=>{setShowSettings(false);setShowAddFundDirect(true);}},
                {label:'⚙ Manage Funds',color:'#c9a84c',bc:'#3a3010',bg:'#2a2010',delay:0.13,action:()=>{setShowSettings(false);setShowManage(true);}},
                {label:'⬆ Import Statement',color:'#a78bfa',bc:'#2d1f5a',bg:'#1a1035',delay:0.18,action:()=>{setShowSettings(false);setShowImport(true);}},
              ].map((item,i)=>(
                <button key={i} onClick={item.action} style={{
                  color:item.color,borderColor:item.bc,background:item.bg,
                  marginBottom:6,width:'100%',padding:'8px',borderRadius:7,cursor:'pointer',
                  fontSize:11,display:'flex',alignItems:'center',justifyContent:'center',gap:5,
                  border:`1px solid ${item.bc}`,transition:'all 0.15s',
                  transform:showSettings?'translateY(0)':'translateY(8px)',
                  opacity:showSettings?1:0,
                }}>{item.label}</button>
              ))}
              <hr style={{border:'none',borderTop:'1px solid '+sDivColor,margin:'0 0 8px'}}/>
              {/* Data */}
              <div style={{fontSize:10,fontWeight:700,color:sLabelColor,textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:6}}>Data</div>
              <div style={{
                display:'flex',gap:6,marginBottom:6,
                transform:showSettings?'translateY(0)':'translateY(8px)',
                opacity:showSettings?1:0,
                transition:'transform 0.35s cubic-bezier(0.34,1.56,0.64,1) 0.20s,opacity 0.3s ease 0.20s',
              }}>
                <button onClick={()=>{setShowSettings(false);handleExportJSON();}} style={{color:'#34d399',border:'1px solid #1a3020',background:'#0d1f14',flex:1,padding:'8px',borderRadius:7,cursor:'pointer',fontSize:11}}>⬇ Save Data</button>
                <button onClick={()=>{setShowSettings(false);handleImportJSON();}} style={{color:'#f97316',border:'1px solid #2a1a08',background:'#1a1008',flex:1,padding:'8px',borderRadius:7,cursor:'pointer',fontSize:11}}>⬆ Load Data</button>
              </div>
              <button onClick={()=>{setShowSettings(false);exportPDF(db,MF_FUNDS);}} style={{
                color:'#06b6d4',border:'1px solid #0e3540',background:'#071e24',width:'100%',padding:'8px',borderRadius:7,cursor:'pointer',fontSize:11,
                transform:showSettings?'translateY(0)':'translateY(8px)',
                opacity:showSettings?1:0,
                transition:'transform 0.35s cubic-bezier(0.34,1.56,0.64,1) 0.25s,opacity 0.3s ease 0.25s',
              }}><svg width='13' height='13' viewBox='0 0 14 14' fill='none' style={{flexShrink:0}}><rect x='2' y='1' width='8' height='11' rx='1' stroke='#06b6d4' strokeWidth='1.2'/><path d='M5 1v3h5' stroke='#06b6d4' strokeWidth='1.2' strokeLinejoin='round'/><text x='4' y='10' fontSize='4' fontWeight='700' fill='#06b6d4'>PDF</text></svg> Export PDF</button>
              <hr style={{border:'none',borderTop:'1px solid '+sDivColor,margin:'8px 0 6px'}}/>
              {/* Database */}
              <div style={{fontSize:10,fontWeight:700,color:sLabelColor,textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:6}}>Database</div>
              <button
                onClick={async()=>{
                  if(loggedIn){
                    const ok=await appConfirm('Disconnect from Supabase?\n\nNo data will be deleted. You can reconnect anytime.',{variant:'confirm-generic',confirmLabel:'Disconnect',cancelLabel:'Cancel'});
                    if(!ok)return;
                    clearSupaCreds();
                    setLoggedIn(false);
                  }else{
                    setShowSettings(false);
                    setShowLogin(true);
                  }
                }}
                style={{
                  color:loggedIn?'#34d399':sLabelColor,
                  border:loggedIn?'1px solid #1a3020':'1px solid '+sDivColor,
                  background:loggedIn?'#0d1f14':'transparent',
                  marginBottom:6,width:'100%',padding:'8px',borderRadius:7,cursor:'pointer',
                  fontSize:11,display:'flex',alignItems:'center',justifyContent:'center',gap:5,
                  transition:'all 0.15s',
                  transform:showSettings?'translateY(0)':'translateY(8px)',
                  opacity:showSettings?1:0,
                }}
              >
                {loggedIn?'● Connected — Disconnect':'○ Connect Database'}
              </button>
            </div>
          </div>
          {/* Settings button */}
          <div style={{padding:'8px 10px'}}>
            <button className="dl-btn" onClick={()=>setShowSettings(v=>!v)}
              style={{color:'#c9a84c',borderColor:'#c9a84c',background:'#2a2010',fontSize:12,fontWeight:700,letterSpacing:'0.3px'}}>
              ⚙ Settings
            </button>
            <div className="sver">React · v2.0</div>
          </div>
        </div>
      </div>
      <input ref={importInputRef} type="file" accept=".json" style={{display:'none'}} onChange={handleFileSelected}/>
      
      {showLogin&&<SupaLoginModal onClose={()=>setShowLogin(false)} onConnected={()=>{setLoggedIn(true);setShowLogin(false);window.location.reload();}}/>}
      {showManage&&<ManageFundsModal onClose={()=>setShowManage(false)} onAddNew={()=>setShowAddFund(true)}/>}
      {showAddFund&&<AddFundModal onClose={()=>setShowAddFund(false)} onBack={()=>{setShowAddFund(false);setShowManage(true);}}/>
      }{showAddFundDirect&&<AddFundModal onClose={()=>setShowAddFundDirect(false)}/>}
      {showImport&&<ImportModal onClose={()=>setShowImport(false)}/>}
    </>
  );
}
