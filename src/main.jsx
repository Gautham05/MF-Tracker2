import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles/globals.css';
import { loadDB } from './store/db.js';
import { syncFundsFromDB, navHistoryCache } from './constants/funds.js';

// Load DB synchronously (localStorage - instant, no network)
const db = loadDB();
syncFundsFromDB(db);

// Pre-populate navHistoryCache from saved db.navHistory — exact HTML loadNavHistory() logic
// This makes charts render instantly on first load (same as HTML)
if (db.navHistory) {
  Object.entries(db.navHistory).forEach(([key, hist]) => {
    if (hist && hist.length && !navHistoryCache[key]) {
      navHistoryCache[key] = hist.map(d => ({ ...d, date: new Date(d.dateStr) }));
    }
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>
);
