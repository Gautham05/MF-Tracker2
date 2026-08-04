import React from 'react';

let _resolve = null;
let _setDialog = null;
let _cancelled = false;

export function wasDialogCancelled() { return _cancelled; }
export function resetDialogCancel() { _cancelled = false; }

export function appUpdateDialog(updates) {
  // Update live dialog — message, button labels, disabled state
  if (_setDialog) _setDialog(prev => ({ ...prev, ...updates }));
}

// Variants: 'confirm-delete', 'confirm-generic', 'alert', 'alert-warn'
export function appConfirm(message, opts={}) {
  return new Promise(resolve => {
    _resolve = resolve;
    if (_setDialog) _setDialog({ open:true, message, variant: opts.variant||'confirm-delete', confirmLabel: opts.confirmLabel||'Delete', cancelLabel: opts.cancelLabel||'Cancel' });
  });
}

export function appAlert(message, opts={}) {
  return new Promise(resolve => {
    _resolve = resolve;
    if (_setDialog) _setDialog({ open:true, message, variant: opts.variant||'alert', confirmLabel: opts.confirmLabel||'OK', cancelLabel: opts.cancelLabel||null, confirmDisabled:false, cancelDisabled:false });
  });
}

// Open dialog that stays open — caller controls close via appUpdateDialog + appCloseDialog
export function appOpenProgress(message, opts={}) {
  if (_setDialog) _setDialog({ open:true, message, variant: opts.variant||'alert', confirmLabel: opts.confirmLabel||'', cancelLabel: opts.cancelLabel||null, confirmDisabled: opts.confirmDisabled||false, cancelDisabled: opts.cancelDisabled||false });
}

export function appCloseDialog() {
  if (_setDialog) _setDialog(d => ({ ...d, open:false }));
  if (_resolve) { _resolve(false); _resolve = null; }
}

export default function AppDialog() {
  const [dialog, setDialog] = React.useState({ open:false, message:'', variant:'confirm-delete', confirmLabel:'Delete', cancelLabel:'Cancel', confirmDisabled:false, cancelDisabled:false });
  _setDialog = setDialog;

  // Read current theme so dialog matches dark/off mode
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const panelBg     = isDark ? '#111111' : '#1a2235';
  const panelBorder = isDark ? '#222222' : '#2a3348';
  const titleColor  = isDark ? '#ffffff' : '#e0e8ff';
  const msgColor    = isDark ? '#e8e8e8' : '#c0ccdc';
  const cancelBg    = isDark ? '#161616' : '#2a3348';
  const cancelColor = isDark ? '#888888' : '#8899bb';
  const cancelBorder= isDark ? '#222222' : '#3a4560';

  function handleConfirm() {
    if (dialog.confirmDisabled) return; // blocked during progress
    setDialog(d=>({...d,open:false}));
    if (_resolve){_resolve(true);_resolve=null;}
  }
  function handleCancel() {
    _cancelled = true;
    setDialog(d=>({...d,open:false}));
    if (_resolve){_resolve(false);_resolve=null;}
  }

  if (!dialog.open) return null;

  const isDanger = dialog.variant==='confirm-delete';
  const isAlert  = dialog.variant==='alert';
  const isWarn   = dialog.variant==='alert-warn';

  const iconColor   = isDanger?'#ef4444':isWarn?'#f97316':'#7ab8ff';
  const iconBg      = isDanger?'#2a1515':isWarn?'#2a1a0a':'#0f2040';
  const iconBorder  = isDanger?'#4d2020':isWarn?'#4d2e0a':'#1e3a5f';
  const iconChar    = isDanger?'!':isWarn?'⚠':'ℹ';
  const confirmBg   = isDanger?'#3a1a1a':isWarn?'#3a2a0a':'#1a3a20';
  const confirmBorder = isDanger?'#4d2020':isWarn?'#4d3a0a':'#2a4a30';
  const confirmColor  = isDanger?'#ef4444':isWarn?'#f97316':'#34d399';
  const title = isDanger?'Confirm Delete':isWarn?'Warning':isAlert?'Notice':'Confirm';

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(5,8,20,0.82)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{background:panelBg,border:'1px solid '+panelBorder,borderRadius:14,padding:'28px 28px 20px',width:390,maxWidth:'92vw',boxShadow:'0 24px 64px rgba(0,0,0,0.6)'}}>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16}}>
          <div style={{width:32,height:32,borderRadius:'50%',background:iconBg,border:'1px solid '+iconBorder,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
            <span style={{color:iconColor,fontSize:16,fontWeight:700}}>{iconChar}</span>
          </div>
          <div style={{fontSize:14,fontWeight:700,color:titleColor}}>{title}</div>
        </div>
        <div style={{fontSize:13,color:msgColor,lineHeight:1.6,marginBottom:24,whiteSpace:'pre-line'}}>{dialog.message}</div>
        <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
          {dialog.cancelLabel&&(
            <button onClick={handleCancel} disabled={dialog.cancelDisabled} style={{background:cancelBg,border:'1px solid '+cancelBorder,padding:'9px 20px',borderRadius:7,cursor:dialog.cancelDisabled?'not-allowed':'pointer',color:cancelColor,fontSize:12.5,fontWeight:600,opacity:dialog.cancelDisabled?0.5:1}}>
              {dialog.cancelLabel}
            </button>
          )}
          {dialog.confirmLabel&&<button onClick={handleConfirm} disabled={dialog.confirmDisabled} style={{background:confirmBg,border:'1px solid '+confirmBorder,padding:'9px 20px',borderRadius:7,cursor:dialog.confirmDisabled?'not-allowed':'pointer',color:confirmColor,fontSize:12.5,fontWeight:700,opacity:dialog.confirmDisabled?0.5:1}}>
            {dialog.confirmLabel}
          </button>}
        </div>
      </div>
    </div>
  );
}
