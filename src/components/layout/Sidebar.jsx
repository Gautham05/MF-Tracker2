import React, { useState, useRef } from 'react';
import useAppStore from '../../store/useAppStore.js';
import { MF_FUNDS } from '../../constants/funds.js';
import ManageFundsModal from '../modals/ManageFundsModal.jsx';
import AddFundModal from '../modals/AddFundModal.jsx';
import ImportModal from '../modals/ImportModal.jsx';
import { exportPDF } from '../../services/pdfExport.js';
import { appAlert, appConfirm } from '../ui/ConfirmDialog.jsx';

export default function Sidebar() {
  // Theme: 'dark' | 'light' | 'off' — default 'dark', persisted in localStorage
  const [theme, setTheme] = React.useState(()=>{ const t=localStorage.getItem('mft_theme')||'dark'; return t==='light'?'dark':t; });
  const [showSettings, setShowSettings] = React.useState(false);
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
  const [showImport, setShowImport] = useState(false);
  const funds = Object.keys(MF_FUNDS);
  const importInputRef = useRef(null);

  // ── Export: download full localStorage as JSON ──
  function handleExportJSON() {
    try {
      const raw = localStorage.getItem('mf_manage_v2.0');
      if (!raw) { appAlert('No data found to export.', {variant:'alert-warn'}).then(()=>{}); return; }
      const full = JSON.parse(raw);
      // Export ONLY mf (transactions) and customFunds (fund definitions)
      // Everything else (navData, navHistory, navDate) is refreshed via Refresh NAV
      const exportData = { mf: full.mf || {}, customFunds: full.customFunds || [] };
      const fundCount = exportData.customFunds.length;
      const txCount = Object.values(exportData.mf).reduce((s,f)=>s+(f.transactions?.length||0),0);
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
          '⚠ This will REPLACE all current data.\nMake sure you have a backup first.',
          { variant:'alert-warn', confirmLabel:'Import & Replace', cancelLabel:'Cancel' }
        );
        if (!ok) return;
        // Write ONLY mf and customFunds — clear navData and navHistory completely
        // so stale/mismatched NAV data from old session doesn't break the app
        // User clicks Refresh NAV after import to rebuild everything fresh
        const clean = {
          mf: data.mf || {},
          customFunds: data.customFunds || [],
          navData: {},
          navHistory: {},
          navDate: '',
        };
        localStorage.setItem('mf_manage_v2.0', JSON.stringify(clean));
        appAlert(
          '✓ Data imported successfully!\n\n' +
          fundCount + ' fund' + (fundCount!==1?'s':'') + ' and ' +
          txCount + ' transaction' + (txCount!==1?'s':'') + ' restored.\n\n' +
          'The page will reload — then click Refresh NAV to load chart data.',
          {variant:'alert', confirmLabel:'Reload Now'}
        ).then(()=>{
          localStorage.setItem('mft_auto_nav', '1');
          window.location.reload();
        });
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
            <button key={k} className={`nav-btn${currentPage===k?' active':''}`} onClick={()=>setPage(k)}>
              <span className="nicon" style={{color:MF_FUNDS[k]?.color||'#c9a84c'}}>◈</span>
              <span>{k}<span className="nsub">{MF_FUNDS[k]?.name||k}</span></span>
            </button>
          ))}
        </div>
        <div className="sidebar-footer">
          <button className="dl-btn" onClick={()=>setShowSettings(true)}
            style={{color:'#c9a84c',borderColor:'#c9a84c',background:'#2a2010',fontSize:12,fontWeight:700,letterSpacing:'0.3px'}}>
            ⚙ Settings
          </button>
          <div className="sver">mfapi.in · AMFI data · v2.1</div>
        </div>
      </div>
      <input ref={importInputRef} type="file" accept=".json" style={{display:'none'}} onChange={handleFileSelected}/>
      {showSettings&&(
        <div className="mbg open" onClick={e=>{if(e.target===e.currentTarget)setShowSettings(false);}}>
          <div className="modal" style={{width:320,padding:20}}>
            <div className="mh" style={{marginBottom:16}}>
              <div className="mt">⚙ Settings</div>
              <button className="mc2" onClick={()=>setShowSettings(false)}>✕</button>
            </div>
            {/* Theme */}
            <div style={{marginBottom:14}}>
              <div style={{fontSize:10,fontWeight:700,color:'#6b7a9a',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:8}}>Theme</div>
              <div style={{display:'flex',gap:4}}>
                {[['dark','🌙 Dark'],['off','⊙ Off']].map(([t,label])=>(
                  <button key={t} onClick={()=>setTheme(t)} style={{
                    flex:1,padding:'7px 4px',borderRadius:7,cursor:'pointer',
                    fontSize:11,fontWeight:700,
                    background:theme===t?'#2a2010':'transparent',
                    color:theme===t?'#c9a84c':'#6b7a9a',
                    border:'1px solid '+(theme===t?'#c9a84c':'#2a3348'),
                  }}>{label}</button>
                ))}
              </div>
            </div>
            <hr className="divider"/>
            {/* Fund Management */}
            <div style={{marginBottom:14}}>
              <div style={{fontSize:10,fontWeight:700,color:'#6b7a9a',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:8}}>Funds</div>
              <button className="dl-btn" onClick={()=>{setShowSettings(false);setShowManage(true);}}
                style={{color:'#c9a84c',borderColor:'#3a3010',background:'#2a2010',marginBottom:6}}>⚙ Manage Funds</button>
              <button className="dl-btn" onClick={()=>{setShowSettings(false);setShowImport(true);}}
                style={{color:'#7ab8ff',borderColor:'#1a2f50',background:'#101d30'}}>⬆ Import Statement</button>
            </div>
            <hr className="divider"/>
            {/* Data */}
            <div style={{marginBottom:14}}>
              <div style={{fontSize:10,fontWeight:700,color:'#6b7a9a',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:8}}>Data</div>
              <div style={{display:'flex',gap:6,marginBottom:6}}>
                <button className="dl-btn" onClick={()=>{setShowSettings(false);handleExportJSON();}}
                  style={{color:'#34d399',borderColor:'#1a3020',background:'#0d1f14',flex:1}}>⬇ Save Data</button>
                <button className="dl-btn" onClick={()=>{setShowSettings(false);handleImportJSON();}}
                  style={{color:'#f97316',borderColor:'#2a1a08',background:'#1a1008',flex:1}}>⬆ Load Data</button>
              </div>
              <button className="dl-btn" onClick={()=>{setShowSettings(false);exportPDF(db,MF_FUNDS);}}
                style={{color:'#7ab8ff',borderColor:'#1a2f50',background:'#101d30'}}>⬇ Export PDF</button>
            </div>
          </div>
        </div>
      )}
      {showManage&&<ManageFundsModal onClose={()=>setShowManage(false)} onAddNew={()=>setShowAddFund(true)}/>}
      {showAddFund&&<AddFundModal onClose={()=>setShowAddFund(false)} onBack={()=>{setShowAddFund(false);setShowManage(true);}}/>}
      {showImport&&<ImportModal onClose={()=>setShowImport(false)}/>}
    </>
  );
}
