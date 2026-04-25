# MF Tracker v2.1 — React App

Exact React replica of MF_Tracker_v4_140.html.

## Features
- Live NAV from api.mfapi.in
- AMC logo auto-detection (Groww CDN)
- Hide/show amounts eye button
- Portfolio Value Chart (Current vs Invested)
- Fund NAV chart with Buy/Sell markers (green=buy, red=sell)
- XIRR per fund + portfolio XIRR
- Allocation pie chart with outside labels
- XIRR bar chart + Returns bar chart (paginated)
- Fund Performance Comparison chart (Insights page)
- P&L day calendar
- Monthly summary (best/worst month highlighted)
- Quarterly investment & returns calendar
- Tax estimates (LTCG 12.5% / STCG 20%)
- CSV import with auto column detection
- PDF export
- localStorage (same key: mf_manage_v2.0)

## Install & Run (local)

```bash
# 1. Enter project folder
cd mf-tracker

# 2. Install dependencies (one time)
npm install

# 3. Start dev server
npm run dev
```

Open http://localhost:3000 in your browser.

## Build for production

```bash
npm run build
npm run preview   # preview production build locally
```

## Deploy to Vercel (free hosting)

```bash
# Option A: Drag & drop the dist/ folder at vercel.com/new
npm run build
# then drag the dist/ folder to vercel.com

# Option B: GitHub + Vercel auto-deploy
git init && git add . && git commit -m "init"
# push to GitHub, then connect repo at vercel.com
```

## LocalStorage
Data is stored with key `mf_manage_v2.0` — same as the original HTML file.
Your existing data from the HTML version loads automatically.

## Project Structure
```
src/
  constants/funds.js       # MF_FUNDS registry, AMC logos, fund utilities
  store/
    db.js                  # localStorage load/save
    useAppStore.js         # Zustand global state
  utils/
    formatters.js          # fIN, fmtDate, fINd
    mfStats.js             # getMFStats, getDayChange, filterByTF
    xirr.js                # XIRR calculation
    taxCalc.js             # LTCG/STCG tax estimates
    importParser.js        # CSV import parsing
  components/
    layout/                # Topbar, Sidebar
    charts/                # PortfolioValueChart, NAVChart, AllocationChart,
                           # XIRRChart, ReturnsChart, ComparisonChart
    modals/                # AddTransactionModal, AddFundModal,
                           # ManageFundsModal, ImportModal
  pages/
    Dashboard.jsx
    FundDetail.jsx
    Insights.jsx
    QuarterlyCalendar.jsx
  services/
    pdfExport.js
```
