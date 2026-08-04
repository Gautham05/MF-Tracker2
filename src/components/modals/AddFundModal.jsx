import React, { useState, useRef, useEffect } from 'react';
import useAppStore from '../../store/useAppStore.js';
import { parseMFData, normalizeFundCategory, buildStandardFullName, buildShortName, MF_FUNDS } from '../../constants/funds.js';

const PRESET_COLORS=['#c9a84c','#4a7fcb','#22c55e','#a78bfa','#f97316','#ef4444','#06b6d4','#ec4899','#84cc16','#f59e0b'];

export default function AddFundModal({ onClose, onBack }) {
  const [themeMode, setThemeMode] = React.useState(()=>localStorage.getItem('mft_theme')||'off');
  React.useEffect(()=>{
    const obs = new MutationObserver(()=>setThemeMode(document.documentElement.getAttribute('data-theme')||'off'));
    obs.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
    return()=>obs.disconnect();
  },[]);
  const isDark = themeMode === 'dark';
  const { addFund } = useAppStore();

  // State
  const [query,setQuery]=useState('');
  const [searchStatus,setSearchStatus]=useState('');
  const [searchStatusColor,setSearchStatusColor]=useState('#6b7a9a');
  const [results,setResults]=useState([]);
  const [showResults,setShowResults]=useState(false);
  const [selected,setSelected]=useState(null); // {code,name,house,type,cat}
  const [key,setKey]=useState('');
  const [keyStatus,setKeyStatus]=useState('');
  const [keyStatusColor,setKeyStatusColor]=useState('#6b7a9a');
  const [ter,setTer]=useState('');
  const [color,setColor]=useState(null); // auto-selected on open
  const [customColor,setCustomColor]=useState(null); // if user picked custom
  const [customLabelBg,setCustomLabelBg]=useState(isDark?'#111':'#1a2235'); // + label background
  const [customLabelBorder,setCustomLabelBorder]=useState('#3a4560'); // + label border
  const [btnEnabled,setBtnEnabled]=useState(false);
  const [adding,setAdding]=useState(false);
  const debounce=useRef(null);
  const colorInputRef=useRef(null);

  // Auto-pick first unused color on mount
  useEffect(()=>{
    const usedColors=Object.values(MF_FUNDS).map(f=>f.color);
    const autoColor=PRESET_COLORS.find(c=>!usedColors.includes(c))||PRESET_COLORS[0];
    setColor(autoColor);
  },[]);

  const usedColors=Object.values(MF_FUNDS).map(f=>f.color);
  const activeColor=customColor||color||PRESET_COLORS[0];

  function validateKey(k, selFund) {
    const ku=k.toUpperCase().trim();
    if(ku.length<2){setKeyStatus('Too short (min 2)');setKeyStatusColor('#f97316');setBtnEnabled(false);return false;}
    if(MF_FUNDS[ku]){setKeyStatus('Key already in use');setKeyStatusColor('#f97316');setBtnEnabled(false);return false;}
    if(!/^[A-Z0-9]+$/.test(ku)){setKeyStatus('Letters & digits only');setKeyStatusColor('#f97316');setBtnEnabled(false);return false;}
    if(selFund){
      const dupKey=Object.entries(MF_FUNDS).find(([,f])=>f.code===String(selFund.code));
      if(dupKey){setKeyStatus('Already added as '+dupKey[0]);setKeyStatusColor('#f97316');setBtnEnabled(false);return false;}
    }
    setKeyStatus('✓ Available');setKeyStatusColor('#34d399');
    setBtnEnabled(!!selFund);
    return true;
  }

  function onQueryChange(v){
    setQuery(v);clearTimeout(debounce.current);
    setResults([]);setShowResults(false);
    if(v.trim().length<3){setSearchStatus('');return;}
    setSearchStatus('Searching…');setSearchStatusColor('#6b7a9a');
    debounce.current=setTimeout(()=>doSearch(v.trim()),500);
  }

  async function doSearch(q){
    try{
      const r=await fetch(`https://amfi-search.mfnav.workers.dev/search?q=${encodeURIComponent(q)}`);
      const j=await r.json();
      if(!j?.results?.length){setSearchStatus('No results found');setSearchStatusColor('#f97316');setShowResults(false);return;}
      setSearchStatus(j.count+' results');setSearchStatusColor('#34d399');
      setResults(j.results.slice(0,15));setShowResults(true);
    }catch{setSearchStatus('Search failed');setSearchStatusColor('#f87171');}
  }

  function selectFund(f){
    // Check if already exists
    const existingKey=Object.entries(MF_FUNDS).find(([,fd])=>fd.code===String(f.schemeCode));
    setQuery(f.schemeName);setShowResults(false);
    if(existingKey){
      setSearchStatus('⚠ This fund is already in your tracker as '+existingKey[0]+'. Direct & Regular plans have different codes — search for the other plan if needed.');
      setSearchStatusColor('#f97316');
      setSelected(null);setBtnEnabled(false);return;
    }
    setSearchStatus('');
    setSelected({code:f.schemeCode,name:f.schemeName,house:f.fundHouse||'',type:f.schemeType||'',cat:f.schemeCategory||''});
    // Auto-generate key
    const baseName=f.schemeName
      .replace(/\s*-?\s*direct\s*plan\s*-?\s*/gi,' ')
      .replace(/\s*-?\s*regular\s*plan\s*-?\s*/gi,' ')
      .replace(/\s*-?\s*growth\s*(option)?\s*-?\s*/gi,' ')
      .replace(/\s*-?\s*idcw\s*-?\s*/gi,' ')
      .replace(/\bfund\b/gi,' ').replace(/\bplan\b/gi,' ')
      .replace(/[^a-zA-Z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
    let autoKey=baseName.split(/\s+/).filter(Boolean).map(w=>w[0].toUpperCase()).join('')+'F';
    autoKey=autoKey.replace(/[^A-Z0-9]/g,'').slice(0,6);
    let base=autoKey,n=1;
    while(MF_FUNDS[autoKey])autoKey=base.slice(0,4)+(n++);
    setKey(autoKey);
    validateKey(autoKey,{code:f.schemeCode});
  }

  function onKeyChange(v){
    const ku=v.toUpperCase();
    setKey(ku);
    validateKey(ku,selected);
  }

  function onSelectPresetColor(c){
    if(usedColors.includes(c)){appAlert('This color is already used by another fund.\nPlease choose a different color.',{variant:'alert-warn'}).then(()=>{});return;}
    setColor(c);setCustomColor(null);
    // Reset + label
    setCustomLabelBg('#1a2235');setCustomLabelBorder('#3a4560');
  }

  function onCustomColorChange(c){
    if(usedColors.includes(c)){alert('This color is used by '+Object.entries(MF_FUNDS).find(([,f])=>f.color===c)?.[0]+'. Please choose a different color.');return;}
    setColor(null);setCustomColor(c);
    // + label shows selected color
    setCustomLabelBg(c);setCustomLabelBorder('#fff');
  }

  async function doAdd(){
    if(!selected||!key.trim()||!btnEnabled)return;
    const k=key.toUpperCase().trim();
    setAdding(true);
    let navDataEntry=null,navHistArr=null,category=selected.cat||selected.type||'',amcName=selected.house||'';
    try{
      const r=await fetch(`https://api.mfapi.in/mf/${selected.code}`);
      const j=await r.json();
      if(j.data&&j.data.length){
        navDataEntry={nav:parseFloat(j.data[0].nav),date:j.data[0].date,meta:j.meta||{}};
        const parsed=parseMFData(j.data);
        navHistArr=parsed.map(d=>({dateStr:d.dateStr,nav:d.nav}));
        if(j.meta){
          if(j.meta.scheme_category)category=normalizeFundCategory(j.meta.scheme_category,j.meta.scheme_name||'');
          else if(j.meta.scheme_type)category=normalizeFundCategory(j.meta.scheme_type,j.meta.scheme_name||'');
          if(j.meta.fund_house)amcName=j.meta.fund_house;
        }
      }
    }catch{}
    const fn=buildStandardFullName(selected.name||'');
    const sn=buildShortName(fn);
    const fundData={name:sn,fullName:fn,code:selected.code,color:activeColor,ter:parseFloat(ter)||0,category,amcName};
    addFund(k,fundData,navDataEntry,navHistArr);
    setAdding(false);onClose();
  }

  return(
    <div className="mbg open" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" style={{width:520,height:730,maxHeight:'92vh',display:'flex',flexDirection:'column',overflow:'hidden'}}>
        <div className="mh">
          {onBack&&<button onClick={onBack} style={{background:'none',border:'none',color:'#c9a84c',fontSize:18,cursor:'pointer',padding:'0 8px 0 0',lineHeight:1}}>←</button>}
          <div className="mt" style={{flex:1}}>➕ Add Fund</div>
          <button className="mc2" onClick={onClose}>×</button>
        </div>

        {/* SCROLLABLE SEARCH AREA */}
        <div style={{flex:1,overflowY:'auto',padding:'0 4px',scrollbarWidth:'none',msOverflowStyle:'none'}}>
          <div className="fg">
            <label>Search Fund Name</label>
            <input id="af-search" type="text" placeholder="Type fund name e.g. Nippon Large Cap…"
              value={query} onChange={e=>onQueryChange(e.target.value)} autoComplete="off" style={{fontSize:13}}/>
            <div id="af-search-status" className="nfs" style={{color:searchStatusColor}}>{searchStatus}</div>
          </div>
          {showResults&&results.length>0&&(
            <div id="af-results" style={{maxHeight:220,overflowY:'auto',marginBottom:10,border:`1px solid ${isDark?'#222':'#2a3348'}`,borderRadius:8,scrollbarWidth:'none',msOverflowStyle:'none'}}>
              {results.map((f,i)=>(
                <div key={i} onClick={()=>selectFund(f)}
                  style={{padding:'9px 12px',cursor:'pointer',borderBottom:`1px solid ${isDark?'#1e1e1e':'#1e2840'}`,fontSize:12,color:'#d0d8f0',transition:'background 0.1s'}}
                  onMouseEnter={e=>e.currentTarget.style.background=isDark?'#1a1a1a':'#1e2840'}
                  onMouseLeave={e=>e.currentTarget.style.background='none'}>
                  <div style={{fontWeight:600,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{f.schemeName}</div>
                  <div style={{fontSize:10,color:'#6b7a9a',marginTop:2}}>{f.fundHouse||''}{f.schemeCategory?' · '+f.schemeCategory:''}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* FIXED BOTTOM: selected info + key/ter/color + buttons — ALWAYS VISIBLE */}
        <div style={{flexShrink:0,borderTop:`1px solid ${isDark?'#222':'#2a3348'}`,padding:'10px 4px 4px'}}>
          {/* Selected fund info box — shown when fund selected */}
          <div id="af-selected-info" style={{display:selected?'block':'block',background:isDark?'#141414':'#162238',border:`1px solid ${isDark?'#222':'#1e3a5f'}`,borderRadius:8,padding:10,marginBottom:8,height:90,overflow:'hidden',boxSizing:'border-box'}}>
            {selected
              ?<>
                <div style={{fontSize:11,color:'#9aaac8',marginBottom:3}}>Selected Fund</div>
                {(()=>{const fn=buildStandardFullName(selected.name||'');return <div id="af-sel-name" style={{fontSize:13,fontWeight:700,color:'#e0e8ff',marginBottom:3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={fn}>{fn}</div>;})()}
                <div id="af-sel-meta" style={{fontSize:11,color:'#7ab8ff'}}>{selected.house}{selected.cat?' · '+selected.cat:''} · Code: {selected.code}</div>
              </>
              :<div style={{fontSize:11,color:'#4a5570',padding:'18px 0',textAlign:'center'}}>Selected Fund</div>
            }
          </div>

          {/* Config row: Key + TER + Color — always visible */}
          <div className="fr" id="af-config-row">
            <div className="fg">
              <label>Short Key (3–6 chars)</label>
              <input id="af-key" type="text" placeholder="E.G. HDFC" maxLength={8}
                value={key} onChange={e=>onKeyChange(e.target.value)} style={{textTransform:'uppercase'}}/>
              <div id="af-key-status" className="nfs" style={{color:keyStatusColor}}>{keyStatus}</div>
            </div>
            <div className="fg">
              <label>Expense Ratio (%)</label>
              <input id="af-ter" type="number" placeholder="e.g. 0.68" step="0.01" min="0" max="5"
                value={ter} onChange={e=>setTer(e.target.value)} style={{fontSize:13}}/>
            </div>
            <div className="fg">
              <label>Colour</label>
              <div id="af-color-picker" style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:4}}>
                {PRESET_COLORS.map(c=>{
                  const isUsed=usedColors.includes(c);
                  const isSel=!customColor&&color===c;
                  return(
                    <div key={c} onClick={()=>onSelectPresetColor(c)} data-color={c}
                      style={{width:22,height:22,borderRadius:'50%',background:c,cursor:isUsed?'not-allowed':'pointer',
                        border:isSel?'2px solid #fff':'2px solid transparent',
                        opacity:isUsed?0.3:1,transition:'border 0.15s,opacity 0.15s',flexShrink:0}}/>
                  );
                })}
                {/* + custom color button — shows chosen custom color as background */}
                <label style={{width:22,height:22,borderRadius:'50%',border:`2px solid ${customLabelBorder}`,background:customLabelBg,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden',flexShrink:0,transition:'background 0.15s,border 0.15s'}}>
                  <input ref={colorInputRef} type="color" onChange={e=>onCustomColorChange(e.target.value)} style={{opacity:0,width:1,height:1,position:'absolute'}}/>
                  {!customColor&&<span style={{fontSize:13,color:'#6b7a9a',lineHeight:1}}>+</span>}
                </label>
              </div>
            </div>
          </div>

          <div className="mfooter">
            <button className="mcn" onClick={onBack||onClose}>Cancel</button>
            <button id="af-add-btn" className="msv" onClick={doAdd}
              disabled={!btnEnabled||adding}
              style={{opacity:btnEnabled&&!adding?1:0.4}}>
              {adding?'Adding…':'Add Fund'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
