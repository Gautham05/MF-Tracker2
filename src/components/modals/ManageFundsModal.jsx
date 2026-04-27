import { appConfirm, appAlert } from '../ui/ConfirmDialog.jsx';
import React, { useState } from 'react';
import useAppStore from '../../store/useAppStore.js';
import { navHistoryCache } from '../../constants/funds.js';
import { MF_FUNDS, getFundLogo } from '../../constants/funds.js';
import { getMFStats } from '../../utils/mfStats.js';
import { fIN } from '../../utils/formatters.js';

const COLORS=['#c9a84c','#4a7fcb','#22c55e','#a78bfa','#f97316','#ef4444','#06b6d4','#ec4899','#84cc16','#f59e0b'];

export default function ManageFundsModal({ onClose, onAddNew }) {
  const [themeMode, setThemeMode] = React.useState(()=>localStorage.getItem('mft_theme')||'off');
  React.useEffect(()=>{
    const obs = new MutationObserver(()=>setThemeMode(document.documentElement.getAttribute('data-theme')||'off'));
    obs.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
    return()=>obs.disconnect();
  },[]);
  const isDark = themeMode === 'dark';
  const amtHidden = useAppStore(s => s.amtHidden);
  const hide = v => amtHidden ? '••••' : v;
  const { db, deleteFund, updateFund, renameFundKey } = useAppStore();
  const [editMode, setEditMode] = useState(false);
  const [terVals, setTerVals] = useState({});
  const [keyVals, setKeyVals] = useState({});
  const [colorVals, setColorVals] = useState({});
  const allColors = ['#c9a84c','#4a7fcb','#22c55e','#a78bfa','#f97316','#ef4444','#06b6d4','#ec4899','#84cc16','#f59e0b'];
  const funds = Object.keys(MF_FUNDS);

  function handleSave(k) {
    const ter = parseFloat(terVals[k] ?? MF_FUNDS[k]?.ter ?? '') || 0;
    const rawKey = (keyVals[k] ?? k).trim().toUpperCase();
    const nk = rawKey || k;
    const newColor = colorVals[k];

    // Apply color if changed
    if (newColor && newColor !== MF_FUNDS[k]?.color) {
      updateFund(k, { color: newColor });
    }
    // Exact HTML saveMFEdit: rename key if changed and not already taken
    if (nk && nk !== k && !MF_FUNDS[nk]) {
      renameFundKey(k, nk, ter);
    } else {
      updateFund(k, { ter });
    }
    // Clear pending color for this fund
    setColorVals(v=>{ const n={...v}; delete n[k]; return n; });
  }

  function handleDelete(k) {
    appConfirm(`Delete "${MF_FUNDS[k]?.name||k}" and ALL its transactions?\n\nThis cannot be undone.`).then(ok=>{if(ok)deleteFund(k);});return;
  }

  function handleColorChange(k, col) {
    // Check if color used by another fund (check pending changes too)
    const pendingColors = {...colorVals};
    const usedBy = Object.keys(MF_FUNDS).find(ok => ok !== k && (pendingColors[ok]||MF_FUNDS[ok].color) === col);
    if (usedBy) { appAlert('This color is already used by another fund. Please choose a different color.',{variant:'alert-warn'}).then(()=>{}); return; }
    // Store pending change - NOT applied until Save
    setColorVals(v=>({...v,[k]:col}));
  }

  return (
    <div className="mbg open" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" style={{width:520,height:730,maxHeight:'90vh',display:'flex',flexDirection:'column',overflow:'hidden'}}>
        <div className="mh">
          <div className="mt">⚙ Manage Funds</div>
          <button className="mc2" onClick={onClose}>×</button>
        </div>
        <div id="mf-manage-body" style={{flex:1,overflowY:'auto',scrollbarWidth:'none',msOverflowStyle:'none',padding:'0 2px'}}>
          {funds.length===0
            ?<div style={{color:'#6b7a9a',textAlign:'center',padding:20}}>No funds yet. Add one!</div>
            :<div>
              {funds.map(k=>{
                const f=MF_FUNDS[k],s=getMFStats(k,db),txCount=db.mf[k]?.transactions?.length||0;
                const logo=getFundLogo(k);
                const allColors=[...COLORS];
                if(!allColors.includes(f.color)) allColors.push(f.color);
                return(
                  <div key={k} style={{border:`1px solid ${isDark?'#222':'#2a3348'}`,borderRadius:8,marginBottom:8,background:isDark?'#141414':'#162238',overflow:'hidden'}}>
                    {/* Top row: logo + info + action btns */}
                    <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px'}}>
                      {logo
                        ?<div id={`mf-dot-${k}`} style={{width:30,height:30,borderRadius:'50%',flexShrink:0,overflow:'hidden'}}>
                           <img src={logo} style={{width:'100%',height:'100%',objectFit:'cover'}}
                             onError={e=>{e.target.parentElement.style.background=f.color;e.target.parentElement.innerHTML=k[0];}}/>
                         </div>
                        :<div id={`mf-dot-${k}`} style={{width:30,height:30,borderRadius:'50%',background:colorVals[k]||f.color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:'#1a2235',flexShrink:0}}>{k[0]}</div>
                      }
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:'12.5px',fontWeight:700,color:'#e0e8ff',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{f.name}</div>
                        <div style={{fontSize:10,color:'#6b7a9a',marginTop:1}}>{k} · {f.category||'—'} · TER: {f.ter>0?<span style={{color:'#c9a84c',fontWeight:700}}>{f.ter}%</span>:<span style={{color:'#6b7a9a'}}>-</span>}</div>
                        <div style={{fontSize:10,color:'#9aaac8',marginTop:1}}>{txCount} txns · {'₹'+fIN(s.totalInvested)}</div>
                      </div>
                      <div style={{display:'flex',flexDirection:'column',gap:3,flexShrink:0}}>
                        <button onClick={()=>handleDelete(k)} style={{visibility:editMode?'visible':'hidden',background:'#2a1515',border:'1px solid #4a2020',color:'#f87171',width:26,height:22,borderRadius:5,cursor:'pointer',fontSize:10,padding:0,lineHeight:1}}>✕</button>
                        <button onClick={()=>handleSave(k)} style={{visibility:editMode?'visible':'hidden',background:'#1a3a20',border:'1px solid #2a4a30',color:'#34d399',width:26,height:22,borderRadius:5,cursor:'pointer',fontSize:10,fontWeight:700,padding:0,lineHeight:1}}>✓</button>
                      </div>
                    </div>
                    {/* Bottom row: KEY + TER% + color dots */}
                    <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap',padding:'6px 12px',borderTop:`1px solid ${isDark?'#1e1e1e':'#1e2840'}`,background:isDark?'#0d0d0d':'#111a2a'}}>
                      <span style={{fontSize:10,color:'#8899bb',fontWeight:700}}>KEY</span>
                      <input id={`mf-key-${k}`} defaultValue={k} maxLength={8} disabled={!editMode}
                        style={{width:56,padding:'3px 5px',border:`1px solid ${isDark?'#222':'#2a3348'}`,borderRadius:5,background:isDark?'#0a0a0a':'#0d1117',color:'#e0e4ef',fontSize:11,outline:'none',textTransform:'uppercase',opacity:editMode?1:0.45,pointerEvents:editMode?'auto':'none'}} onChange={e=>setKeyVals(v=>({...v,[k]:e.target.value.toUpperCase()}))}
                        onInput={e=>e.target.value=e.target.value.toUpperCase()}/>
                      <span style={{fontSize:10,color:'#8899bb',fontWeight:700}}>TER%</span>
                      <input type="number" id={`ter-${k}`} defaultValue={f.ter||''} placeholder="0.68" step="0.01" min="0" max="5" disabled={!editMode}
                        style={{width:56,padding:'3px 5px',border:`1px solid ${isDark?'#222':'#2a3348'}`,borderRadius:5,background:isDark?'#0a0a0a':'#0d1117',color:'#e0e4ef',fontSize:11,outline:'none',opacity:editMode?1:0.45,pointerEvents:editMode?'auto':'none',MozAppearance:'textfield'}}
                        onChange={e=>setTerVals(v=>({...v,[k]:e.target.value}))}/>
                      <div style={{display:'flex',gap:3,flexWrap:'wrap',alignItems:'center'}}>
                        {allColors.map(c=>(
                          <div key={c} onClick={()=>editMode&&handleColorChange(k,c)}
                            style={{width:16,height:16,borderRadius:'50%',background:c,cursor:editMode?'pointer':'default',border:(colorVals[k]||f.color)===c?'2px solid #fff':'2px solid transparent',flexShrink:0,display:editMode||f.color===c?'inline-block':'none'}}/>
                        ))}
                        {editMode&&(
                          <label style={{width:16,height:16,borderRadius:'50%',border:colorVals[k]&&!allColors.includes(colorVals[k])?'2px solid #fff':`2px solid ${isDark?'#333':'#3a4560'}`,background:colorVals[k]&&!allColors.includes(colorVals[k])?colorVals[k]:isDark?'#111':'#1a2235',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center',overflow:'hidden'}}>
                            <input type="color" onChange={e=>handleColorChange(k,e.target.value)} style={{opacity:0,width:1,height:1,position:'absolute'}}/>
                            <span style={{fontSize:11,color:'#6b7a9a',lineHeight:1}}>+</span>
                          </label>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          }
        </div>
        <div id="mf-manage-footer" style={{padding:10,borderTop:`1px solid ${isDark?'#222':'#2a3348'}`,flexShrink:0}}>
          <div style={{display:'flex',gap:8}}>
            <button id="mf-edit-mode-btn" onClick={()=>setEditMode(e=>!e)}
              style={{flex:1,background:isDark?'#1a1a1a':'#253358',border:`1px solid ${isDark?'#333':'#3a4560'}`,color:'#c9a84c',padding:10,borderRadius:7,cursor:'pointer',fontSize:12,fontWeight:700}}>
              {editMode?'✎ Done':'✎ Edit Funds'}
            </button>
            <button onClick={()=>{onClose();onAddNew();}} className="msv"
              style={{flex:1,justifyContent:'center',display:'flex',gap:6,padding:10}}>
              ➕ Add New Fund
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
