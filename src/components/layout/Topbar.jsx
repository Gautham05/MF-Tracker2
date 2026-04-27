import React from 'react';
import useAppStore from '../../store/useAppStore.js';
export default function Topbar() {
  const fetchNAV = useAppStore(s => s.fetchNAV);
  const toggleSidebar = useAppStore(s => s.toggleSidebar);
  const amtHidden = useAppStore(s => s.amtHidden);
  const toggleAmtHidden = useAppStore(s => s.toggleAmtHidden);
  return (
    <div className="topbar">
      <button className="hamburger" onClick={toggleSidebar}><span/><span/><span/></button>
      <div className="topbar-brand"><b>Mutual Fund Tracker</b></div>
      <div className="topbar-right">
        <span className="nav-status" id="nav-status">NAV not loaded</span>
        <button className="refresh-btn" id="nav-btn" onClick={fetchNAV} style={{minWidth:34,width:34,height:34,padding:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:16}}>↻</button>
        <button className="eye-btn" onClick={toggleAmtHidden} title={amtHidden?'Show amounts':'Hide amounts'}>
          {amtHidden
            ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
            : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          }
        </button>
      </div>
    </div>
  );
}
