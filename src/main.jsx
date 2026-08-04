import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles/globals.css';

window._amtHidden = false;
const savedTheme = localStorage.getItem('mft_theme') || 'dark';
if (savedTheme !== 'off') document.documentElement.setAttribute('data-theme', savedTheme);
if (savedTheme === 'dark') localStorage.setItem('mft_theme', 'dark');

// No StrictMode — prevents Chart.js canvas double-mount errors
ReactDOM.createRoot(document.getElementById('root')).render(<App />);
