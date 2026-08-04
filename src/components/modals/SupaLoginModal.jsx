import React, { useState } from 'react';
import { saveSupaCreds, getSupaClient, clearSupaCreds } from '../../store/supabase.js';

export default function SupaLoginModal({ onClose, onConnected }) {
  const [url, setUrl]         = useState('');
  const [key, setKey]         = useState('');
  const [err, setErr]         = useState('');
  const [testing, setTesting] = useState(false);

  async function handleConnect() {
    setErr('');
    const u = url.trim();
    const k = key.trim();
    if (!u || !k)                  { setErr('Both fields are required.'); return; }
    if (!u.startsWith('https://')) { setErr('URL must start with https://'); return; }
    setTesting(true);
    try {
      saveSupaCreds(u, k);
      const sb = getSupaClient();
      const { error } = await sb.from('funds').select('code').limit(1);
      if (error) {
        clearSupaCreds();
        setErr('Connection failed: ' + error.message);
        setTesting(false);
        return;
      }
      setTesting(false);
      onConnected();
    } catch(e) {
      clearSupaCreds();
      setErr('Connection failed: ' + e.message);
      setTesting(false);
    }
  }

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const divColor = isDark ? '#222222' : '#2a3348';

  return (
    <div className="mbg open">
      <div className="modal" style={{width:420,maxWidth:'92vw'}}>

        {/* Header */}
        <div className="mh">
          <span className="mt">⚡ Connect Database</span>
          <button onClick={onClose} className="btn-dark" style={{padding:'4px 10px',fontSize:14,lineHeight:1,borderRadius:6,cursor:'pointer'}}>✕</button>
        </div>

        {/* URL */}
        <div className="fg">
          <label>Project URL</label>
          <input
            value={url}
            onChange={e=>setUrl(e.target.value)}
            placeholder="https://xxxx.supabase.co"
          />
        </div>

        {/* Anon Key */}
        <div className="fg">
          <label>Anon Public Key</label>
          <input
            value={key}
            onChange={e=>setKey(e.target.value)}
            placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
            type="password"
          />
        </div>

        {/* Error */}
        {err&&(
          <div style={{
            fontSize:12,color:'#f97316',borderRadius:7,marginBottom:14,
            padding:'8px 11px',lineHeight:1.5,background:'#1a1008',border:'1px solid #4d2e0a',
          }}>{err}</div>
        )}

        {/* Buttons */}
        <div style={{display:'flex',gap:10,justifyContent:'flex-end',paddingTop:16,borderTop:'1px solid '+divColor,marginTop:4}}>
          <button className="btn-dark" onClick={onClose} style={{padding:'9px 20px',fontSize:12.5,fontWeight:600,borderRadius:7,cursor:'pointer'}}>
            Cancel
          </button>
          <button
            className="btn-gold"
            onClick={handleConnect}
            disabled={testing}
            style={{padding:'9px 22px',fontSize:12.5,fontWeight:700,borderRadius:7,cursor:testing?'not-allowed':'pointer',opacity:testing?0.7:1}}
          >
            {testing?'⌛ Testing…':'⚡ Connect'}
          </button>
        </div>
      </div>
    </div>
  );
}
