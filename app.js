'use strict';
(() => {
  // Keep the original storage key so a published v1 installation retains its expenses.
  const STORE = 'gastos_de_casa_v1';
  const LAST_MONTH = 'gastos_de_casa_last_month_v2';
  const CATS = [
    {id:'supermercado', name:'Supermercado', emoji:'🛒'},
    {id:'servicios', name:'Recibos', emoji:'💡'},
    {id:'comida', name:'Comida', emoji:'🍽️'},
    {id:'transporte', name:'Transporte', emoji:'🚗'},
    {id:'salud', name:'Salud', emoji:'💊'},
    {id:'hogar', name:'Casa', emoji:'🏡'},
    {id:'otros', name:'Otros', emoji:'📦'}
  ];
  const $ = id => document.getElementById(id);
  const ids = ['homeView','historyView','homeNav','historyNav','homeMonth','monthTotal','monthTransactions','todayTotal','weekTotal','addBtn','breakdownList','breakdownEmpty','recentList','recentEmpty','seeAllBtn','weeklyTab','monthlyTab','prevPeriod','nextPeriod','periodLabel','periodRange','historyStatus','historyTotal','historyCount','categoryFilter','historyList','historyEmpty','settingsBtn','settingsDialog','closeSettings','expenseDialog','expenseForm','expenseTitle','closeExpense','amount','categoryPicker','note','date','formError','saveBtn','deleteBtn','detailDialog','detailBody','closeDetail','detailCloseBtn','backupBtn','restoreBtn','restoreFile','csvBtn','toast'];
  const el = Object.fromEntries(ids.map(id => [id, $(id)]));
  let records = [];
  let view = 'home';
  let periodMode = 'month';
  let cursor = firstOfMonth(new Date());
  let activeMonth = monthKey(new Date());
  let editingId = null;
  let selectedCategory = null;
  let toastTimer;

  function localISO(d) {return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
  function monthKey(d) {return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;}
  function firstOfMonth(d){return new Date(d.getFullYear(),d.getMonth(),1,12);}
  function plusDays(d,number){return new Date(d.getFullYear(),d.getMonth(),d.getDate()+number,12);}
  function weekStart(d){return plusDays(d,-((d.getDay()+6)%7));}
  function dayFromISO(value){const a=value.split('-').map(Number);return new Date(a[0],a[1]-1,a[2],12);}
  function validDate(value) {
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [y,m,d] = value.split('-').map(Number);
    const date = new Date(y,m-1,d,12);
    return date.getFullYear()===y&&date.getMonth()===m-1&&date.getDate()===d;
  }
  function money(cents){return 'Q '+(cents/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});}
  function category(id){return CATS.find(c=>c.id===id)||CATS[CATS.length-1];}
  function readableMonth(d){let text=d.toLocaleDateString('es-GT',{month:'long',year:'numeric'});return text[0].toUpperCase()+text.slice(1);}
  function readableDate(d,options={day:'numeric',month:'short'}){return d.toLocaleDateString('es-GT',options);}
  function isClosed(date){return date.slice(0,7)<monthKey(new Date());}
  function validRecord(r){return !!(r&&typeof r.id==='string'&&r.id.length<120&&validDate(r.fecha)&&CATS.some(c=>c.id===r.categoria)&&Number.isSafeInteger(r.centavos)&&r.centavos>0&&r.centavos<100000000000&&typeof r.nota==='string'&&r.nota.length<=90);}
  function uid(){return (globalThis.crypto&&crypto.randomUUID)?crypto.randomUUID():String(Date.now())+'-'+Math.random().toString(36).slice(2);}
  function sorted(items){return items.slice().sort((a,b)=>b.fecha.localeCompare(a.fecha)||(b.creado||0)-(a.creado||0));}
  function sum(items){return items.reduce((acc,r)=>acc+r.centavos,0);}
  function load(){try {const data=JSON.parse(localStorage.getItem(STORE)||'[]');if(Array.isArray(data)){records=data.filter(validRecord);}}catch(err){console.warn('Storage error',err);notify('⚠️ No se pudieron leer los gastos guardados');}}
  function persist(){try{localStorage.setItem(STORE,JSON.stringify(records));return true;}catch(err){alert('No se pudieron guardar los datos. Revisa el espacio de tu teléfono.');return false;}}
  function notify(text){el.toast.textContent=text;el.toast.classList.add('is-visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.toast.classList.remove('is-visible'),3000);}
  function rolloverCheck(){
    const next=monthKey(new Date());
    if(next===activeMonth)return;
    const previous=activeMonth;
    activeMonth=next;
    try{localStorage.setItem(LAST_MONTH,next);}catch(_err){}
    // The new calendar month is automatically the active open month;
    // all earlier months remain in records, visible but read-only.
    cursor=(periodMode==='month'?firstOfMonth(new Date()):weekStart(new Date()));
    renderAll();
    if(previous<next)notify('🔒 Mes anterior cerrado. ¡Nuevo mes, contador en cero!');
  }
  function showView(target){
    rolloverCheck();view=target;
    el.homeView.hidden=target!=='home';el.historyView.hidden=target!=='history';
    el.homeNav.classList.toggle('selected',target==='home');el.historyNav.classList.toggle('selected',target==='history');
    for(const [button,active] of [[el.homeNav,target==='home'],[el.historyNav,target==='history']]){if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');}
    renderAll();window.scrollTo({top:0,behavior:'instant'});
  }
  function renderAll(){renderHome();renderHistory();}
  function renderHome(){
    const now=new Date(),thisMonth=monthKey(now),today=localISO(now),week=localISO(weekStart(now));
    const monthItems=sorted(records.filter(r=>r.fecha.startsWith(thisMonth)));
    el.homeMonth.textContent=readableMonth(now);
    el.monthTotal.textContent=money(sum(monthItems));
    el.monthTransactions.textContent=`${monthItems.length} ${monthItems.length===1?'gasto':'gastos'}`;
    el.todayTotal.textContent=money(sum(monthItems.filter(r=>r.fecha===today)));
    // Keep this home-screen counter in the CURRENT MONTH even if the week crosses months.
    el.weekTotal.textContent=money(sum(monthItems.filter(r=>r.fecha>=week)));
    el.breakdownList.replaceChildren();el.breakdownEmpty.hidden=monthItems.length!==0;
    const totals=CATS.map(c=>({...c,cents:sum(monthItems.filter(r=>r.categoria===c.id))})).filter(c=>c.cents>0).sort((a,b)=>b.cents-a.cents);
    const total=sum(monthItems);
    for(const item of totals){
      const wrap=document.createElement('div'),head=document.createElement('div');head.className='breakdown-head';
      const title=document.createElement('span');title.textContent=`${item.emoji} ${item.name}`;
      const amount=document.createElement('strong');amount.textContent=money(item.cents);
      head.append(title,amount);const bar=document.createElement('div');bar.className='progress-track';
      const fill=document.createElement('div');fill.className='progress-fill';fill.style.width=`${item.cents/total*100}%`;bar.append(fill);wrap.append(head,bar);el.breakdownList.append(wrap);
    }
    el.recentList.replaceChildren();el.recentEmpty.hidden=monthItems.length!==0;
    for(const r of monthItems.slice(0,4))el.recentList.append(expenseRow(r));
    el.seeAllBtn.hidden=monthItems.length===0;
  }
  function currentRange(){
    if(periodMode==='month'){
      const start=firstOfMonth(cursor),end=new Date(start.getFullYear(),start.getMonth()+1,1,12);
      return {start:localISO(start),end:localISO(end),heading:readableMonth(start),sub:monthKey(start)===monthKey(new Date())?'Mes actual':'Resumen mensual',closed:monthKey(start)<monthKey(new Date())};
    }
    const start=weekStart(cursor),end=plusDays(start,7),last=plusDays(start,6);
    const heading=`${readableDate(start)} – ${readableDate(last)}`;
    const same=localISO(start)===localISO(weekStart(new Date()));
    return {start:localISO(start),end:localISO(end),heading,sub:same?'Semana actual':`${start.getFullYear()}${start.getFullYear()===last.getFullYear()?'':' – '+last.getFullYear()}`,closed:false};
  }
  function renderHistory(){
    const weekly=periodMode==='week';
    el.weeklyTab.classList.toggle('active',weekly);el.weeklyTab.setAttribute('aria-pressed',String(weekly));
    el.monthlyTab.classList.toggle('active',!weekly);el.monthlyTab.setAttribute('aria-pressed',String(!weekly));
    const range=currentRange();el.periodLabel.textContent=range.heading;el.periodRange.textContent=range.sub;
    el.nextPeriod.disabled=weekly?localISO(weekStart(cursor))>=localISO(weekStart(new Date())):monthKey(cursor)>=monthKey(new Date());
    const tag=periodMode==='month'?(range.closed?'🔒 Mes cerrado · Solo lectura':'🟢 Mes abierto'):'';
    el.historyStatus.hidden=!tag;el.historyStatus.textContent=tag;
    const periodRecords=records.filter(r=>r.fecha>=range.start&&r.fecha<range.end);
    const cat=el.categoryFilter.value;
    const items=sorted(cat==='all'?periodRecords:periodRecords.filter(r=>r.categoria===cat));
    el.historyTotal.textContent=money(sum(items));
    el.historyCount.textContent=`${items.length} ${items.length===1?'gasto':'gastos'}`;
    el.historyList.replaceChildren();el.historyEmpty.hidden=items.length!==0;
    let lastDate='';
    for(const r of items){
      if(r.fecha!==lastDate){const sep=document.createElement('div');sep.className='date-divider';const d=dayFromISO(r.fecha);
        sep.textContent=r.fecha===localISO(new Date())?'HOY · '+readableDate(d):readableDate(d,{weekday:'long',day:'numeric',month:'long'});
        el.historyList.append(sep);lastDate=r.fecha;}
      el.historyList.append(expenseRow(r));
    }
  }
  function expenseRow(item){
    const c=category(item.categoria),row=document.createElement('button');row.type='button';row.className='expense-row';
    row.setAttribute('aria-label',`${c.name}, ${money(item.centavos)}, ${item.fecha}. ${isClosed(item.fecha)?'Ver detalle':'Ver o editar'}`);
    const emoji=document.createElement('span');emoji.className='expense-emoji';emoji.textContent=c.emoji;emoji.setAttribute('aria-hidden','true');
    const labels=document.createElement('span');labels.className='expense-labels';const name=document.createElement('strong');name.textContent=c.name;
    const desc=document.createElement('span');desc.textContent=item.nota||(isClosed(item.fecha)?'🔒 Mes cerrado':'Toca para editar');labels.append(name,desc);
    const side=document.createElement('span');side.className='expense-side';const amount=document.createElement('strong');amount.textContent=money(item.centavos);
    const date=document.createElement('span');date.textContent=readableDate(dayFromISO(item.fecha));side.append(amount,date);
    row.append(emoji,labels,side);row.addEventListener('click',()=>{rolloverCheck();if(isClosed(item.fecha))openDetail(item);else openExpense(item);});return row;
  }
  function openDetail(item){
    el.detailBody.replaceChildren();const total=document.createElement('div');total.className='detail-big';total.textContent=money(item.centavos);el.detailBody.append(total);
    const fields=[['Categoría',`${category(item.categoria).emoji} ${category(item.categoria).name}`],['Fecha',readableDate(dayFromISO(item.fecha),{day:'numeric',month:'long',year:'numeric'})],['Descripción',item.nota||'Sin descripción']];
    for(const [label,value] of fields){const line=document.createElement('div');line.className='detail-row';const k=document.createElement('span');k.textContent=label;const v=document.createElement('strong');v.textContent=value;line.append(k,v);el.detailBody.append(line);}
    el.detailDialog.showModal();
  }
  function selectCategory(id){selectedCategory=id;for(const child of el.categoryPicker.children)child.setAttribute('aria-pressed',String(child.dataset.category===id));}
  function openExpense(item=null){
    rolloverCheck();if(item&&isClosed(item.fecha)){openDetail(item);return;}
    editingId=item?.id||null;el.expenseForm.reset();el.formError.hidden=true;
    el.expenseTitle.textContent=item?'✏️ Editar gasto':'➕ Nuevo gasto';el.saveBtn.textContent=item?'✅ Guardar cambios':'✅ Guardar gasto';el.deleteBtn.hidden=!item;
    el.amount.value=item?(item.centavos/100).toFixed(2):'';el.note.value=item?.nota||'';
    el.date.value=item?.fecha||localISO(new Date());el.date.min=monthKey(new Date())+'-01';el.date.max=localISO(new Date());
    selectCategory(item?.categoria||null);el.expenseDialog.showModal();
  }
  function parseAmount(raw){
    let s=String(raw).trim().replace(/\s/g,'').replace(/[qQ]/g,'');if(!s)return null;
    const dot=s.lastIndexOf('.'),comma=s.lastIndexOf(',');
    if(dot>=0&&comma>=0)s=dot>comma?s.replace(/,/g,''):s.replace(/\./g,'').replace(',','.');
    else if(comma>=0){const parts=s.split(',');s=(parts.length===2&&parts[1].length===3&&parts[0].length<=3)?s.replace(',',''):s.replace(',','.');}
    else if(dot>=0){const parts=s.split('.');if(parts.length===2&&parts[1].length===3&&parts[0].length<=3)s=s.replace('.','');}
    if(!/^\d+(?:\.\d{1,2})?$/.test(s))return null;
    const cents=Math.round(Number(s)*100);return Number.isSafeInteger(cents)&&cents>0&&cents<100000000000?cents:null;
  }
  function showError(text){el.formError.textContent=text;el.formError.hidden=false;}
  function saveExpense(event){
    event.preventDefault();rolloverCheck();el.formError.hidden=true;
    const cents=parseAmount(el.amount.value),date=el.date.value;
    if(cents===null){showError('Escribe un monto válido, mayor que Q 0.00.');el.amount.focus();return;}
    if(!selectedCategory){showError('Elige una categoría para tu gasto.');return;}
    if(!validDate(date)||date.slice(0,7)!==monthKey(new Date())||date>localISO(new Date())){showError('Solo puedes anotar o editar gastos del mes actual, hasta el día de hoy.');return;}
    const old=editingId?records.find(r=>r.id===editingId):null;
    if(editingId&&(!old||isClosed(old.fecha))){showError('Este gasto es de un mes cerrado y ya no se puede modificar.');return;}
    const item={id:editingId||uid(),fecha:date,categoria:selectedCategory,centavos:cents,nota:el.note.value.trim().slice(0,90),creado:old?.creado||Date.now()};
    const prev=records;records=records.slice();
    if(editingId)records[records.findIndex(r=>r.id===editingId)]=item;else records.push(item);
    if(!persist()){records=prev;return;}
    el.expenseDialog.close();renderAll();notify(editingId?'✅ Gasto actualizado':'✅ ¡Gasto guardado!');
  }
  function deleteExpense(){
    rolloverCheck();if(!editingId)return;
    const old=records.find(r=>r.id===editingId);if(!old||isClosed(old.fecha)){showError('Este mes ya está cerrado.');return;}
    if(!confirm(`¿Eliminar el gasto de ${money(old.centavos)}?`))return;
    const prev=records;records=records.filter(r=>r.id!==editingId);if(!persist()){records=prev;return;}
    el.expenseDialog.close();renderAll();notify('🗑️ Gasto eliminado');
  }
  function switchPeriod(mode){periodMode=mode;cursor=mode==='month'?firstOfMonth(new Date()):weekStart(new Date());el.categoryFilter.value='all';renderHistory();}
  function movePeriod(step){
    cursor=periodMode==='month'?new Date(cursor.getFullYear(),cursor.getMonth()+step,1,12):plusDays(weekStart(cursor),step*7);
    renderHistory();
  }
  function download(content,name,mime){const url=URL.createObjectURL(new Blob([content],{type:mime}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);}
  function backup(){download(JSON.stringify({tipo:'gastos_de_casa',version:2,exportado:new Date().toISOString(),gastos:records},null,2),`Respaldo_Gastos_${localISO(new Date())}.json`,'application/json;charset=utf-8');notify('💾 Respaldo descargado');}
  function csvEscape(x){let s=String(x??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return /[";\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}
  function csv(){const rows=[['Fecha','Categoria','Descripcion','Monto (Q)'],...records.slice().sort((a,b)=>a.fecha.localeCompare(b.fecha)).map(r=>[r.fecha,category(r.categoria).name,r.nota,(r.centavos/100).toFixed(2)])];download('\ufeff'+rows.map(row=>row.map(csvEscape).join(';')).join('\r\n'),`Gastos_Casa_${localISO(new Date())}.csv`,'text/csv;charset=utf-8');notify('📊 Archivo para Excel descargado');}
  async function restore(event){
    const file=event.target.files?.[0];event.target.value='';if(!file)return;
    try{
      if(file.size>8000000)throw new Error('El archivo es demasiado grande.');
      const data=JSON.parse(await file.text());
      if(data?.tipo!=='gastos_de_casa'||![1,2].includes(data?.version)||!Array.isArray(data.gastos)||data.gastos.length>50000||!data.gastos.every(validRecord))throw new Error('Este archivo no es un respaldo válido de Gastos de Casa.');
      const seen=new Set();if(data.gastos.some(r=>{if(seen.has(r.id))return true;seen.add(r.id);return false;}))throw new Error('El respaldo contiene gastos duplicados.');
      if(!confirm(`El respaldo tiene ${data.gastos.length} gastos. ¿Quieres REEMPLAZAR tus ${records.length} gastos actuales?`))return;
      const prev=records;records=data.gastos;if(!persist()){records=prev;return;}
      el.settingsDialog.close();switchPeriod('month');renderAll();notify('✅ ¡Respaldo recuperado!');
    }catch(err){alert(err?.message||'No se pudo recuperar el respaldo.');}
  }
  for(const c of CATS){
    const option=document.createElement('button');option.type='button';option.className='category-option';option.dataset.category=c.id;option.setAttribute('aria-pressed','false');
    const emoji=document.createElement('span');emoji.textContent=c.emoji;emoji.setAttribute('aria-hidden','true');
    const label=document.createElement('span');label.textContent=c.name;option.append(emoji,label);option.addEventListener('click',()=>selectCategory(c.id));el.categoryPicker.append(option);
    const filter=document.createElement('option');filter.value=c.id;filter.textContent=`${c.emoji} ${c.name}`;el.categoryFilter.append(filter);
  }
  el.addBtn.addEventListener('click',()=>openExpense());el.seeAllBtn.addEventListener('click',()=>{switchPeriod('month');showView('history');});
  el.homeNav.addEventListener('click',()=>showView('home'));el.historyNav.addEventListener('click',()=>showView('history'));
  el.weeklyTab.addEventListener('click',()=>switchPeriod('week'));el.monthlyTab.addEventListener('click',()=>switchPeriod('month'));
  el.prevPeriod.addEventListener('click',()=>movePeriod(-1));el.nextPeriod.addEventListener('click',()=>movePeriod(1));
  el.categoryFilter.addEventListener('change',renderHistory);
  el.expenseForm.addEventListener('submit',saveExpense);el.deleteBtn.addEventListener('click',deleteExpense);
  el.closeExpense.addEventListener('click',()=>el.expenseDialog.close());
  el.closeDetail.addEventListener('click',()=>el.detailDialog.close());el.detailCloseBtn.addEventListener('click',()=>el.detailDialog.close());
  el.settingsBtn.addEventListener('click',()=>el.settingsDialog.showModal());el.closeSettings.addEventListener('click',()=>el.settingsDialog.close());
  el.backupBtn.addEventListener('click',backup);el.csvBtn.addEventListener('click',csv);el.restoreBtn.addEventListener('click',()=>el.restoreFile.click());el.restoreFile.addEventListener('change',restore);
  for(const dialog of [el.expenseDialog,el.detailDialog,el.settingsDialog])dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
  load();
  try{localStorage.setItem(LAST_MONTH,activeMonth);}catch(_err){}
  renderAll();
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){rolloverCheck();renderAll();}});
  window.addEventListener('focus',()=>{rolloverCheck();renderAll();});
  setInterval(()=>rolloverCheck(),60000);
  if('serviceWorker' in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
})();
