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

  // After import reload: auto-fetch NAV so charts load immediately
  // fetchNAV does ONE set() at end — no mid-loop state updates = no flicker
  React.useEffect(()=>{
    if (localStorage.getItem('mft_auto_nav') === '1') {
      localStorage.removeItem('mft_auto_nav');
      fetchNAV();
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
