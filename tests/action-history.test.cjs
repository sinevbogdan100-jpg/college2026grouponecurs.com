const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..');
const source=name=>fs.readFileSync(path.join(root,name),'utf8').replace(/^import .*;\n/gm,'').replaceAll('export ','');
const storage=new Map(),nodes=new Map(),listeners=[],writes=[];
let active={uid:'owner-uid',login:'owner',owner:true,journal:true,schedule:true,db:{}},writeFailure=false,deferredRead=null;
const classList=()=>({values:new Set(['hidden']),add(x){this.values.add(x);},remove(x){this.values.delete(x);},contains(x){return this.values.has(x);},toggle(x,flag){if(flag)this.add(x);else this.remove(x);}});
const node=id=>{if(!nodes.has(id))nodes.set(id,{classList:classList(),textContent:'',innerHTML:'',value:'all',options:[{value:'all'},{value:'attendance'},{value:'schedule'}],setAttribute(){},replaceChildren(){this.innerHTML='';},focus(){}});return nodes.get(id);};
const ctx={console,Date,Intl,crypto:require('node:crypto').webcrypto,
  gt:key=>key,escapeGT:value=>String(value??'').replaceAll('<','&lt;'),translateUI:value=>value,currentLang:()=> 'ru',
  localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},navigator:{onLine:true},
  document:{getElementById:node,body:{classList:classList()}},window:{},
  doc:(db,...parts)=>parts.join('/'),collection:(db,...parts)=>parts.join('/'),query:(...parts)=>parts,orderBy:()=> 'receivedAt',limit:n=>n,
  serverTimestamp:()=> 'SERVER_TIME',onSnapshot(query,options,success,error){const record={query,success,error,closed:false};listeners.push(record);return()=>record.closed=true;},
  async getDoc(){if(deferredRead){const p=deferredRead;deferredRead=null;return p;}return {exists:()=>false};},
  async setDoc(ref,data){if(writeFailure){const error=new Error('Blocked');error.code='permission-denied';throw error;}writes.push({ref,data});}
};
vm.createContext(ctx);vm.runInContext(source('group-tools-data.js')+'\n'+source('action-history.js')+'\nglobalThis.api={configureActionHistory,refreshActionHistoryAccess,recordActionHistory,confirmActionHistory};',ctx);
const api=ctx.api;
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const saved=uid=>JSON.parse(storage.get(`sbp_action_history_v1_${uid}`)||'[]');
function record(id){api.recordActionHistory({kind:'attendance',target:'2026-10-05',before:{state:{'Студент':'present'}},after:{state:{'Студент':'late'}},operationId:id});}
async function main(){
  api.configureActionHistory({state:()=>active});assert.equal(listeners[0].query[0],'toe_group/shared/audit_logs');assert.equal(listeners[0].query[2],100,'shared history query is bounded');
  record('op1');assert.equal(saved(active.uid)[0].status,'local-data');assert.equal(writes.length,0,'local edits do not masquerade as successful server writes');
  api.confirmActionHistory('op1');assert.equal(writes.length,0,'no attempt to bypass blocked audit rules');
  listeners[0].error({code:'permission-denied'});assert.equal(node('gt-history-status').textContent,'auditRules');
  listeners[0].success({docs:[],metadata:{fromCache:false}});await tick();await tick();
  assert.equal(writes.length,1);assert.equal(writes[0].data.actorUid,'owner-uid');assert.equal(writes[0].data.receivedAt,'SERVER_TIME');assert.equal(saved(active.uid)[0].status,'synced');
  assert.equal('status' in writes[0].data,false,'local transport state is not published as audit data');
  record('op2');writeFailure=true;api.confirmActionHistory('op2');await tick();await tick();
  assert.equal(saved(active.uid).find(x=>x.operationId==='op2').status,'pending');assert.equal(node('gt-history-status').textContent,'auditRules','permission failure stays visible and queued');
  const old=listeners[0];active={uid:'visitor-uid',login:'',owner:false,journal:false,schedule:false,db:{}};api.refreshActionHistoryAccess();
  assert(old.closed);assert.equal(node('gt-history-list').innerHTML,'');assert(node('menu-action-history-button').classList.contains('hidden'));
  old.success({docs:[{id:'private',data:()=>({createdAt:'2026',changes:[]})}],metadata:{fromCache:false}});assert.equal(node('gt-history-list').innerHTML,'','late callbacks cannot leak previous account history');
  active={uid:'admin-uid',login:'admin1',owner:false,journal:true,schedule:false,db:{}};api.refreshActionHistoryAccess();api.confirmActionHistory('op2');assert.equal(saved(active.uid).length,0,'another account cannot submit owner queued records');
  api.recordActionHistory({kind:'schedule',target:'main',before:{},after:{numerator:{mon:[{subject:'New'}]}},operationId:'denied'});assert.equal(saved(active.uid).length,0,'missing schedule permission cannot create an audit record');
  // Switching accounts while a duplicate check is pending must cancel that account's write.
  active={uid:'owner-uid',login:'owner',owner:true,journal:true,schedule:true,db:{}};api.refreshActionHistoryAccess();writeFailure=false;
  let resolveRead;deferredRead=new Promise(resolve=>{resolveRead=resolve;});
  listeners.at(-1).success({docs:[],metadata:{fromCache:false}});await tick();
  active={uid:'admin-uid',login:'admin1',owner:false,journal:true,schedule:false,db:{}};api.refreshActionHistoryAccess();
  resolveRead({exists:()=>false});await tick();await tick();assert.equal(writes.length,1,'in-flight owner write is cancelled on account switch');
  console.log('Audit account isolation, permissions, confirmation, failure retention and bounded reads passed');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
