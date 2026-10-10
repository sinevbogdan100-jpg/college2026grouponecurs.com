const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createCanvas}=require('@napi-rs/canvas');
const root=path.join(__dirname,'..');
const source=name=>fs.readFileSync(path.join(root,name),'utf8').replace(/^import .*;\n/gm,'').replaceAll('export ','');
const copy=x=>JSON.parse(JSON.stringify(x));

async function main(){
  const values=new Map([['toe_ui_language','ru']]),nodes=new Map(),toasts=[];
  const node=id=>{if(!nodes.has(id))nodes.set(id,{value:id==='gt-share-language'?'ru':'day',textContent:'',disabled:false,hidden:false,dataset:{},setAttribute(){}});return nodes.get(id);};
  const context={console,Blob,File,URL,Date,Intl,setTimeout,clearTimeout,crypto:require('node:crypto').webcrypto,
    localStorage:{getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)},
    navigator:{onLine:true},document:{getElementById:node,fonts:{ready:Promise.resolve()},createElement(type){
      assert.equal(type,'canvas');const canvas=createCanvas(1,1);canvas.toBlob=callback=>canvas.encode('png').then(bytes=>callback(new Blob([bytes],{type:'image/png'})));return canvas;
    }},window:{}};
  vm.createContext(context);vm.runInContext(source('i18n.js')+'\n'+source('schedule-dates.js')+'\n'+source('group-tools-data.js')+'\n'+source('group-tools.js')+`
    globalThis.api={scheduleShareSnapshot,pinnedAnnouncement,attendanceChanges,scheduleChanges,wrapCanvasText,scheduleImageRows,WORDS,gt,generateShare,sendShare,
      setup(snapshot,language){shareSnapshot=snapshot;byId('gt-share-language').value=language;bridge={groupName:()=> 'ТОЭ-26-9-1',toast:value=>toasts.push(value)};},
      blob(){return shareBlob;},preview(){return shareURL;}};`,Object.assign(context,{toasts}));
  const {api}=context;
  const teacher='Урунбаева Б.Т.';
  const data={mon:[{time:'08:00 - 09:30',subject:'Физика',room:'Каб. 301',teacher}],wed:[{time:'09:40 - 11:10',subject:'История Казахстана',room:'Каб. 503',teacher,cancelled:true,changeType:'cancel',changeNote:'Отмена пары'}]};
  const selected=api.scheduleShareSnapshot(data,'wed','numerator',new Date(2026,9,14),'day');
  assert.equal(selected.days[0].date,'2026-10-14','export uses selected week and local date, not today/UTC');
  assert.equal(selected.weekType,'numerator');assert.equal(selected.days[0].lessons[0].cancelled,true);
  selected.days[0].lessons[0].teacher='Preview';assert.equal(data.wed[0].teacher,teacher,'preview is isolated from stored names');
  const week=api.scheduleShareSnapshot(data,'wed','denominator',new Date(2026,9,14),'week');
  assert.deepEqual(copy(week.days.map(x=>x.date)),['2026-10-12','2026-10-13','2026-10-14','2026-10-15','2026-10-16']);
  assert.equal(api.pinnedAnnouncement([{id:'old',pinned:true,pinnedAt:'2026-10-01',pinnedUntil:''},{id:'new',pinned:true,pinnedAt:'2026-10-05',pinnedUntil:'2026-10-06T00:00:00Z'}],Date.parse('2026-10-06T00:00:00Z')),null,'expiry never revives an older pin');
  assert.equal(api.pinnedAnnouncement([{id:'forever',pinned:true,pinnedAt:'2026-10-05',pinnedUntil:''}],Number.MAX_SAFE_INTEGER).id,'forever');
  assert.equal(api.pinnedAnnouncement([{id:'broken',pinned:true,pinnedUntil:'invalid'}]),null);
  assert.deepEqual(copy(api.attendanceChanges({state:{'Студент Ә':'present'},notes:{'Студент Ә':'old'}},{state:{'Студент Ә':'late'},notes:{'Студент Ә':'new'}})),[
    {student:'Студент Ә',field:'state',oldValue:'present',newValue:'late'},
    {student:'Студент Ә',field:'notes',oldValue:'old',newValue:'new'}]);
  const changes=api.scheduleChanges({numerator:data},{numerator:{...data,mon:[]}});
  assert(changes.some(x=>x.field==='teacher'&&x.oldValue===teacher&&x.newValue===''),'deletions retain prior values');
  assert.equal(api.attendanceChanges({state:{x:'present'}},{state:{x:'present'}}).length,0,'manual save without changes creates no entry');
  const long='ҚазақшаӨтеҰзынСөзABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lines=api.wrapCanvasText(long,t=>t.length*10,100);assert(lines.every(x=>x.length<=10));assert.equal(lines.join(''),long,'long words are wrapped without losing characters');
  for(const [key,pair] of Object.entries(api.WORDS)){assert(pair[0]&&pair[1],key);assert.equal(api.gt(key,'ru'),pair[0]);assert.equal(api.gt(key,'kz'),pair[1]);}
  const kzRows=api.scheduleImageRows(week,'kz');assert(kzRows.some(x=>x.text.includes('Физика')));assert(kzRows.some(x=>x.note?.includes('Тоқтатылды')));assert(kzRows.some(x=>x.meta?.includes(teacher)));
  assert.equal(context.api.scheduleImageRows(week,'kz').find(x=>x.meta?.includes(teacher)).meta.includes(teacher),true);
  assert.equal(vm.runInContext("translateUI('Поделиться расписанием','kz')",context),'Поделиться расписанием','unknown custom text stays intact');
  assert.equal(vm.runInContext("translateUI('Замена предмета: вместо История Казахстана — Иностранный язык','kz')",context),'Пәнді ауыстыру: Қазақстан тарихы орнына Шет тілі','export language translates nested labels independently from UI language');
  for(const language of ['ru','kz']){
    api.setup(week,language);await api.generateShare();assert(api.blob(),'PNG created');assert.equal(api.blob().type,'image/png');
    fs.writeFileSync(path.join(root,`../schedule-preview-${language}.png`),Buffer.from(await api.blob().arrayBuffer()));
  }
  let shared=null;context.navigator.canShare=()=>true;context.navigator.share=async value=>{shared=value;};await api.sendShare();assert.equal(shared.files[0].type,'image/png');
  assert.match(shared.files[0].name,/2026-10-12-week-kz\.png$/);
  context.navigator.canShare=()=>false;await api.sendShare();assert(toasts.includes(api.gt('shareFallback')),'unsupported native sharing explains saving fallback');
  console.log('Share data, PNG generation, RU/KZ, names, expiry and change capture passed');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
