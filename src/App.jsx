import React from 'react';
import { HashRouter, Routes, Route, useNavigate, useParams, Navigate } from 'react-router-dom';
import useAppStore from './store/useAppStore.js';
import { MF_FUNDS } from './constants/funds.js';
import Topbar from './components/layout/Topbar.jsx';
import AppDialog from './components/ui/ConfirmDialog.jsx';
import Sidebar from './components/layout/Sidebar.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Insights from './pages/Insights.jsx';
import FundDetail from './pages/FundDetail.jsx';
import HoldingsPage from './pages/HoldingsPage.jsx';
import PortfolioAnalytics from './pages/PortfolioAnalytics.jsx';

// Defined OUTSIDE AppInner so it never gets recreated on re-render
function FundRoute() {
  const { key } = useParams();
  if (!MF_FUNDS[key]) return <Navigate to="/" replace />;
  return <FundDetail key={key} fundKey={key} />;
}

function HoldingsRoute() {
  const { key } = useParams();
  if (!MF_FUNDS[key]) return <Navigate to="/" replace />;
  return <HoldingsPage key={key} fundKey={key} />;
}

function AppInner() {
  const navigate    = useNavigate();
  const initDB      = useAppStore(s => s.initDB);
  const setNavigate = useAppStore(s => s.setNavigate);
  const fetchNAV    = useAppStore(s => s.fetchNAV);
  const dbReady     = useAppStore(s => s.dbReady);

  React.useEffect(() => { setNavigate(navigate); }, [navigate]);

  React.useEffect(() => { initDB(); }, []);
  React.useEffect(() => {
    if (!dbReady) return;
    if (localStorage.getItem('mft_auto_nav') === '1') {
      localStorage.removeItem('mft_auto_nav');
      fetchNAV();
    }
  }, [dbReady]);

  if (!dbReady) {
    return (
      <div id="app">
        <AppDialog />
        <Topbar />
        <div className="shell">
          <Sidebar />
          <div id="main-content" className="content" style={{display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:16}}>
            <div style={{width:40,height:40,borderRadius:'50%',border:'3px solid #2a3348',borderTopColor:'#c9a84c',animation:'spin 0.8s linear infinite'}}/>
            <div style={{fontSize:12,color:'#6b7a9a',letterSpacing:'0.5px'}}>Loading…</div>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div id="app">
      <AppDialog />
      <Topbar />
      <div className="shell">
        <Sidebar />
        <div id="main-content" className="content">
          <Routes>
            <Route path="/"          element={<Dashboard />} />
            <Route path="/insights"  element={<Insights />} />
            <Route path="/fund/:key" element={<FundRoute />} />
            <Route path="/holdings/:key" element={<HoldingsRoute />} />
            <Route path="/analytics" element={<PortfolioAnalytics />} />
            <Route path="*"          element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AppInner />
    </HashRouter>
  );
}
