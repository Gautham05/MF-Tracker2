import { appConfirm, appAlert } from '../ui/ConfirmDialog.jsx';
import React, { useState, useEffect } from 'react';
import useAppStore from '../../store/useAppStore.js';
import { navHistoryCache } from '../../constants/funds.js';

export default function AddTransactionModal({ fundKey, editIdx, onClose }) {
  const { db, saveTx, loadNavHistory } = useAppStore();
  const existing = editIdx!=null ? db.mf[fundKey]?.transactions?.[editIdx] : null;
  const [form, setForm] = useState({
    date: existing?.date||new Date().toISOString().split('T')[0],
    type: existing?.type||'Invested',
    units: existing?.units||'', nav: existing?.nav||'',
    amount: existing?.amount||'', stamp: existing?.stamp!=null?existing.stamp.toFixed(2):'0.00',
    note: existing?.note||'',
  });
  const [navStatus, setNavStatus] = useState('');

  useEffect(()=>{ if(form.date) fetchNavForDate(form.date); },[]);

  async function fetchNavForDate(d) {
    if(!d||!fundKey)return;
    setNavStatus('Fetching NAV...');
    if(!navHistoryCache[fundKey]) await loadNavHistory(fundKey);
    const h=navHistoryCache[fundKey];
    if(!h||!h.length){setNavStatus('⚠ No NAV data');return;}
    const lastDate=h[h.length-1].dateStr;
    if(d>lastDate){setNavStatus('⚠ No NAV data after '+lastDate);return;}
    const exact=h.find(x=>x.dateStr===d);
    if(exact){
      setForm(f=>({...f,nav:exact.nav.toFixed(4)}));
      setNavStatus('✓ NAV: ₹'+exact.nav.toFixed(2)+' on '+d);
      calcStampFromAmt(form.amount, form.type);
    } else {
      let prev=null;for(const x of h){if(x.dateStr<=d)prev=x;else break;}
      const hint=prev?'Last: '+prev.dateStr+' (₹'+prev.nav.toFixed(2)+')':'';
      setNavStatus('⚠ No NAV on this date. '+hint);
    }
  }

  function calcStampFromAmt(amount, type) {
    const amt=parseFloat(amount)||0;
    const stamp=type==='Invested'?parseFloat((amt*0.00005).toFixed(2)):0;
    setForm(f=>({...f,stamp:stamp>0?stamp.toFixed(2):'0.00'}));
  }

  function onNavChange(val) {
    setForm(f=>{
      const n=parseFloat(val)||0,u=parseFloat(f.units)||0;
      const amount=n>0&&u>0?(n*u).toFixed(2):f.amount;
      const stamp=f.type==='Invested'?parseFloat((parseFloat(amount)*0.00005).toFixed(2)):0;
      return{...f,nav:val,amount,stamp:stamp>0?stamp.toFixed(2):'0.00'};
    });
  }
  function onUnitsChange(val) {
    setForm(f=>{
      const n=parseFloat(f.nav)||0,u=parseFloat(val)||0;
      const amount=n>0&&u>0?(n*u).toFixed(2):f.amount;
      const stamp=f.type==='Invested'?parseFloat((parseFloat(amount)*0.00005).toFixed(2)):0;
      return{...f,units:val,amount,stamp:stamp>0?stamp.toFixed(2):'0.00'};
    });
  }
  function onAmountChange(val) {
    setForm(f=>{
      const n=parseFloat(f.nav)||0,a=parseFloat(val)||0;
      const units=n>0&&a>0&&!f.units?(a/n).toFixed(3):f.units;
      const stamp=f.type==='Invested'?parseFloat((a*0.00005).toFixed(2)):0;
      return{...f,amount:val,units,stamp:stamp>0?stamp.toFixed(2):'0.00'};
    });
  }
  function onTypeChange(val) {
    setForm(f=>{
      const stamp=val==='Invested'?parseFloat(((parseFloat(f.amount)||0)*0.00005).toFixed(2)):0;
      return{...f,type:val,stamp:stamp>0?stamp.toFixed(2):'0.00'};
    });
  }

  function save() {
    const{date,type,units,nav,amount,stamp,note}=form;
    const u=parseFloat(units)||0,n=parseFloat(nav)||0;
    if(!date||!u||!n){appAlert('Please fill Date, Units and NAV.').then(()=>{});return;}
    const amt=parseFloat(amount)||(u*n);
    saveTx(fundKey,{date,type,units:u,nav:n,amount:amt,stamp:parseFloat(stamp)||0,note},editIdx!=null?editIdx:null);
    onClose();
  }

  return (
    <div className="mbg open" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div className="mh"><div className="mt">{editIdx!=null?'Edit Transaction':'Add Transaction'}</div><button className="mc2" onClick={onClose}>×</button></div>
        <div className="fr">
          <div className="fg"><label>Date</label><input type="date" value={form.date} onChange={e=>{setForm(f=>({...f,date:e.target.value}));fetchNavForDate(e.target.value);}}/></div>
          <div className="fg"><label>Type</label><select value={form.type} onChange={e=>onTypeChange(e.target.value)}><option value="Invested">Invested (Buy)</option><option value="Redeemed">Redeemed (Sell)</option></select></div>
        </div>
        <div className="fg">
          <label>NAV on Date (₹) <span style={{color:'#c9a84c',fontSize:9}}>AUTO-FETCHED</span></label>
          <input type="number" step="0.0001" placeholder="Select date to auto-fetch" value={form.nav} onChange={e=>onNavChange(e.target.value)}/>
          <div className="nfs" style={{color:navStatus.startsWith('✓')?'#22c55e':'#f97316'}}>{navStatus}</div>
        </div>
        <div className="fr">
          <div className="fg"><label>Units</label><input type="number" step="0.001" placeholder="0.000" value={form.units} onChange={e=>onUnitsChange(e.target.value)}/></div>
          <div className="fg"><label>Amount (₹) <span style={{color:'#c9a84c',fontSize:9}}>AUTO-CALC</span></label><input type="number" step="0.01" placeholder="Auto-calculated" value={form.amount} onChange={e=>onAmountChange(e.target.value)}/></div>
        </div>
        <div className="fg" style={{display:'flex',gap:10,alignItems:'flex-end'}}>
          <div style={{flex:1}}><label>Stamp Duty (₹) <span style={{color:'#c9a84c',fontSize:9}}>AUTO-CALC</span></label><input type="number" step="0.01" value={form.stamp} readOnly style={{background:'#111827',color:'#aabbcc'}}/></div>
          <div style={{flex:1}}><label>Note</label><input type="text" placeholder="Optional note" value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))}/></div>
        </div>
        <div className="mfooter"><button className="mcn" onClick={onClose}>Cancel</button><button className="msv" onClick={save}>Save Transaction</button></div>
      </div>
    </div>
  );
}
