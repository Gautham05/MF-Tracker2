export function parseCSVRow(row, delim) {
  if(delim==='\t')return row.split('\t').map(c=>c.trim().replace(/^"|"$/g,''));
  var result=[],cur='',inQ=false;
  for(var i=0;i<row.length;i++){var c=row[i];if(c==='"'&&inQ&&row[i+1]==='"'){cur+='"';i++;}else if(c==='"'){inQ=!inQ;}else if(c===','&&!inQ){result.push(cur.trim());cur='';}else{cur+=c;}}
  result.push(cur.trim());return result;
}
export function parseImportDate(raw) {
  if(!raw)return'';raw=raw.trim().replace(/"/g,'');
  if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw;
  var m=raw.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if(m)return m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');
  var months={jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12'};
  m=raw.match(/^(\d{1,2})[-\s]([A-Za-z]{3})[-\s](\d{4})$/);
  if(m)return m[3]+'-'+(months[m[2].toLowerCase()]||'01')+'-'+m[1].padStart(2,'0');
  m=raw.match(/^([A-Za-z]{3})[\s-](\d{1,2})[\s,]+(\d{4})$/);
  if(m)return m[3]+'-'+(months[m[1].toLowerCase()]||'01')+'-'+m[2].padStart(2,'0');
  return'';
}
export function autoDetectColumns(headers) {
  const c={date:-1,type:-1,units:-1,nav:-1,amount:-1};
  headers.forEach((h,i)=>{const hl=h.toLowerCase().replace(/[^a-z]/g,'');
    if(c.date<0&&/date|dt|tradedate|transactiondate/.test(hl))c.date=i;
    if(c.type<0&&/type|txtype|transtype|nature|trxtype|purchaseredeem/.test(hl))c.type=i;
    if(c.units<0&&/unit|qty|quantity/.test(hl))c.units=i;
    if(c.nav<0&&/nav|price|rate/.test(hl))c.nav=i;
    if(c.amount<0&&/amount|amt|value|gross/.test(hl))c.amount=i;
  });return c;
}
export function parseImportRows(dataRows, colMap) {
  const parsed=[],warns=[];
  dataRows.forEach((row,ri)=>{
    const m=colMap;let dateStr='',type='Invested',units=0,nav=0,amount=0;
    if(m.date>=0){const raw=(row[m.date]||'').trim();dateStr=parseImportDate(raw);if(!dateStr){warns.push('Row '+(ri+1)+': bad date');return;}}
    else{warns.push('Row '+(ri+1)+': no date');return;}
    if(m.type>=0){const t=(row[m.type]||'').toLowerCase().trim();if(/redeem|sell|withdraw|switch.?out/.test(t))type='Redeemed';}
    if(m.units>=0)units=parseFloat((row[m.units]||'').replace(/,/g,''))||0;
    if(!units){warns.push('Row '+(ri+1)+': units=0');return;}
    if(m.nav>=0)nav=parseFloat((row[m.nav]||'').replace(/,/g,''))||0;
    if(m.amount>=0)amount=parseFloat((row[m.amount]||'').replace(/,/g,''))||0;
    if(!amount&&nav&&units)amount=parseFloat((nav*units).toFixed(2));
    if(!nav&&amount&&units)nav=parseFloat((amount/units).toFixed(4));
    if(!nav){warns.push('Row '+(ri+1)+': NAV=0');return;}
    const stamp=type==='Invested'?parseFloat((amount*0.00005).toFixed(2)):0;
    parsed.push({date:dateStr,type,units:parseFloat(units.toFixed(3)),nav:parseFloat(nav.toFixed(4)),amount:parseFloat(amount.toFixed(2)),stamp,note:''});
  });
  return{parsed,warns};
}