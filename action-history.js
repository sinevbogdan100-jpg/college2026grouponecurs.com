import { doc, setDoc, getDoc, collection, query, orderBy, limit, onSnapshot, serverTimestamp } from './firebase.js?v=20261005-group-tools-v2';
import { currentLang, translateUI } from './i18n.js?v=20261010-date-overrides-v4';
import { gt, escapeGT, openGTModal } from './group-tools.js?v=20261010-date-overrides-v4';
import { attendanceChanges, scheduleChanges } from './group-tools-data.js?v=20261010-date-overrides-v4';

let bridge = {}, context = '', entries = [], remote = [], unsubscribe = null, cloudStatus = 'offline', flushing = false, flushAgain = false;
const byId = id => document.getElementById(id);
function state() { return bridge.state?.() || {}; }
function key(uid) { return `sbp_action_history_v1_${uid}`; }
function canRead(s) { return !!s.uid && (s.owner || s.journal || s.schedule); }
function saveLocal(uid = state().uid) {
  try { localStorage.setItem(key(uid),JSON.stringify(entries));return true; }
  catch(error){console.warn('Action history storage',error);bridge.toast?.(gt('storageError'));return false;}
}
export function configureActionHistory(dependencies) {
  bridge=dependencies;
  if(!byId('action-history-modal')) {
    const div=document.createElement('div');div.id='action-history-modal';div.dataset.i18nSkip='';div.className='group-tools-overlay hidden';
    div.innerHTML=`<section class="group-tools-sheet gt-history-sheet" role="dialog" aria-modal="true" aria-labelledby="gt-history-heading"><header><h2 id="gt-history-heading" data-gt="audit"></h2><button id="gt-history-close" type="button" data-gt-aria="close"><i class="fa-solid fa-xmark"></i></button></header><div class="group-tools-body"><p id="gt-history-status" role="status" aria-live="polite"></p><div class="gt-selects"><select id="gt-history-filter" data-gt-aria="audit"><option value="all" data-gt="all"></option><option value="attendance" data-gt="attendance"></option><option value="schedule" data-gt="schedule"></option></select><button id="gt-history-retry" type="button" data-gt="retry"></button></div><div id="gt-history-list"></div></div></section>`;
    const close=()=>{div.classList.add('hidden');document.body.classList.remove('group-tools-open');byId('menu-action-history-button')?.focus();};
    document.body.appendChild(div);byId('gt-history-close').addEventListener('click',close);
    div.addEventListener('click',event=>{if(event.target===div)close();});
    div.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.stopPropagation();close();}
      if(event.key!=='Tab')return;
      const controls=[...div.querySelectorAll('button,select,summary')].filter(x=>!x.disabled&&x.getClientRects().length);
      if(event.shiftKey&&document.activeElement===controls[0]){event.preventDefault();controls.at(-1)?.focus();}
      else if(!event.shiftKey&&document.activeElement===controls.at(-1)){event.preventDefault();controls[0]?.focus();}
    });
    byId('gt-history-filter').addEventListener('change',renderHistory);
    byId('gt-history-retry').addEventListener('click',()=>{context='';refreshActionHistoryAccess();});
    byId('menu-action-history-button')?.addEventListener('click',()=>{if(!canRead(state()))return;window.closeAppMenu?.();openGTModal('action-history-modal');renderHistory();});
    window.refreshAuditHistory=renderHistory;
    window.addEventListener('online',()=>{context='';refreshActionHistoryAccess();});
  }
  refreshActionHistoryAccess();
}
export function refreshActionHistoryAccess() {
  const s=state(),allowed=canRead(s);byId('menu-action-history-button')?.classList.toggle('hidden',!allowed);
  const next=`${s.uid||''}:${allowed}:${!!s.db}:${s.journal}:${s.schedule}`;
  if(next===context)return;
  context=next;unsubscribe?.();unsubscribe=null;remote=[];entries=[];cloudStatus='offline';
  if(!allowed){const modal=byId('action-history-modal');if(modal&&!modal.classList.contains('hidden')){modal.classList.add('hidden');document.body.classList.remove('group-tools-open');}renderHistory();return;}
  try{entries=JSON.parse(localStorage.getItem(key(s.uid))||'[]');if(!Array.isArray(entries))entries=[];}catch(_){entries=[];}
  if(s.db&&navigator.onLine){
    const ownContext=context;
    unsubscribe=onSnapshot(query(collection(s.db,'toe_group','shared','audit_logs'),orderBy('receivedAt','desc'),limit(100)),{includeMetadataChanges:true},snapshot=>{
      if(ownContext!==context)return;
      remote=snapshot.docs.map(doc=>({id:doc.id,...doc.data(),status:doc.metadata?.hasPendingWrites?'pending':'synced'}));
      if(!snapshot.metadata.fromCache){cloudStatus='shared';flushAuditEntries();}
      renderHistory();
    },error=>{if(ownContext!==context)return;cloudStatus=error.code==='permission-denied'?'rules':'offline';console.warn('Private action history',error.code);renderHistory();});
  }
  renderHistory();
}
export function recordActionHistory({kind,target,before,after,operationId,actorUid}) {
  const s=state();
  if(!canRead(s)||!(kind==='attendance'?s.journal:s.schedule))return;
  if(actorUid&&actorUid!==s.uid)return;
  const changes=kind==='attendance'?attendanceChanges(before,after):scheduleChanges(before,after);
  if(!changes.length)return;
  const event={id:`a_${Date.now()}_${crypto.randomUUID().replaceAll('-','')}`,actorUid:s.uid,actorLogin:s.login,kind,target:String(target||''),operationId,createdAt:new Date().toISOString(),changes,status:'local-data'};
  entries.push(event);
  // Retain all pending records; only trim older records already confirmed by the server.
  const synced=entries.filter(x=>x.status==='synced').slice(-100);entries=[...entries.filter(x=>x.status!=='synced'),...synced];
  saveLocal();renderHistory();
}
export function confirmActionHistory(operationId) {
  const s=state();if(!canRead(s))return;
  for(const event of entries)if(event.operationId===operationId&&event.actorUid===s.uid)event.status='pending';
  saveLocal();renderHistory();flushAuditEntries();
}
async function flushAuditEntries() {
  if(flushing){flushAgain=true;return;}
  const s=state(),ownContext=context;
  if(cloudStatus!=='shared'||!canRead(s)||!navigator.onLine||!s.db)return;
  flushing=true;
  try {
    for(const event of entries.filter(x=>x.status==='pending'&&x.actorUid===s.uid)) {
      if(ownContext!==context)break;
      if(!(event.kind==='attendance'?state().journal:state().schedule))continue;
      try {
        const ref=doc(s.db,'toe_group','shared','audit_logs',event.id);
        const existing=await getDoc(ref);
        if(ownContext!==context||state().uid!==s.uid)break;
        if(existing.exists()&&(existing.data().actorUid!==s.uid||existing.data().operationId!==event.operationId))throw new Error('Audit identity mismatch');
        if(!existing.exists()) {
          const {id,status,...payload}=event;
          await setDoc(ref,{...payload,receivedAt:serverTimestamp()});
        }
        if(ownContext!==context)break;
        event.status='synced';saveLocal(s.uid);renderHistory();
      }catch(error){if(ownContext!==context)break;cloudStatus=error.code==='permission-denied'?'rules':'offline';renderHistory();break;}
    }
  }finally{flushing=false;if(flushAgain){flushAgain=false;flushAuditEntries();}}
}
function label(change,kind) {
  if(kind==='attendance')return `${change.student} · ${gt(change.field)}`;
  return `${change.date ? change.date+' · ' : ''}${gt(change.week)} · ${gt(change.day)} · ${gt('row')} ${change.row} · ${gt(change.field)}`;
}
function value(change,raw) {
  if(raw==='')return gt('unset');if(typeof raw==='boolean')return gt(raw?'yes':'no');
  if(change.field==='state'||change.field==='changeType')return gt(String(raw));
  return ['subject','room','breakDuration'].includes(change.field)?translateUI(String(raw)):String(raw);
}
function renderHistory() {
  const box=byId('gt-history-list');if(!box)return;
  byId('gt-history-heading').textContent=gt('audit');byId('gt-history-close').setAttribute('aria-label',gt('close'));
  byId('gt-history-retry').textContent=gt('retry');
  byId('gt-history-filter').setAttribute('aria-label',gt('audit'));
  for(const option of byId('gt-history-filter').options)option.textContent=gt(option.value==='all'?'all':option.value);
  byId('gt-history-status').textContent=gt(cloudStatus==='shared'?'auditShared':cloudStatus==='rules'?'auditRules':'auditOffline');
  if(!canRead(state())){box.replaceChildren();return;}
  const combined=new Map(entries.map(x=>[x.id,x]));for(const event of remote)combined.set(event.id,event);
  const filter=byId('gt-history-filter').value;
  const visible=[...combined.values()].filter(x=>filter==='all'||x.kind===filter).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  box.innerHTML=visible.length?visible.map(event=>{
    const actor=event.actorLogin==='owner'?(currentLang()==='kz'?'Иесі':'Владелец'):`${currentLang()==='kz'?'Әкімші':'Администратор'} ${event.actorLogin==='admin1'?'1':'2'}`;
    const date=new Date(event.createdAt).toLocaleString(currentLang()==='kz'?'kk-KZ':'ru-RU');
    const changeHTML=change=>`<li><strong>${escapeGT(label(change,event.kind))}</strong><div class="gt-history-values"><div><small>${gt('before')}</small><span>${escapeGT(value(change,change.oldValue))}</span></div><div><small>${gt('after')}</small><span>${escapeGT(value(change,change.newValue))}</span></div></div></li>`;
    return `<article class="gt-history-event"><div class="gt-history-meta"><strong>${escapeGT(actor)} · ${gt(event.kind)}</strong><time>${escapeGT(date)}</time><span class="gt-history-chip">${gt(event.status==='synced'?'synced':event.status==='pending'?'pending':'localData')}</span></div>${event.kind==='attendance'?`<p>${escapeGT(event.target)}</p>`:''}<ul>${event.changes.slice(0,3).map(changeHTML).join('')}</ul>${event.changes.length>3?`<details><summary>${gt('allChanges')} (${event.changes.length})</summary><ul>${event.changes.slice(3).map(changeHTML).join('')}</ul></details>`:''}</article>`;
  }).join(''):`<p class="gt-history-empty">${gt('auditEmpty')}</p>`;
}

