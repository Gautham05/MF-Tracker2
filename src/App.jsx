import React from 'react';
import useAppStore from './store/useAppStore.js';
import { MF_FUNDS } from './constants/funds.js';
import Topbar from './components/layout/Topbar.jsx';
import AppDialog from './components/ui/ConfirmDialog.jsx';
import Sidebar from './components/layout/Sidebar.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Insights from './pages/Insights.jsx';
import FundDetail from './pages/FundDetail.jsx';

export default function App() {
  const currentPage = useAppStore(s => s.currentPage);
  const fetchNAV = useAppStore(s => s.fetchNAV);

  // Auto-fetch NAV after import reload (flag set by import handler)
  React.useEffect(()=>{
    if(localStorage.getItem('mft_auto_nav')==='1'){
      localStorage.removeItem('mft_auto_nav');
      // Small delay so React finishes first render before fetching
      setTimeout(()=>fetchNAV(), 300);
    }
  },[]);
  function renderPage() {
    if (currentPage==='Dashboard') return <Dashboard />;
    if (currentPage==='Insights') return <Insights />;
    if (MF_FUNDS[currentPage]) return <FundDetail key={currentPage} fundKey={currentPage} />;
    return <Dashboard />;
  }
  return (
    <div id="app">
      <AppDialog />
      <Topbar />
      <div className="shell">
        <Sidebar />
        <div id="main-content" className="content">{renderPage()}</div>
      </div>
    </div>
  );
}
