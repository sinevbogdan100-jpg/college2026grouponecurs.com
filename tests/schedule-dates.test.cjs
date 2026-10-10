const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
async function main(){
 const pure=await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync(path.join(root,'schedule-dates.js'),'utf8')).toString('base64'));
 assert.equal(pure.scheduleCalendarLabel(new Date('2026-10-20T12:00:00'),'kk-KZ',{weekday:'long',day:'numeric',month:'long',year:'numeric'}),'Сейсенбі, 20 қазан 2026 ж.');
 const imports=new Set();for(const file of fs.readdirSync(root).filter(name=>name.endsWith('.js')))for(const [,version] of fs.readFileSync(path.join(root,file),'utf8').matchAll(/schedule\.js\?v=([\w-]+)/g))imports.add(version);assert.equal(imports.size,1,'all consumers must share the same stateful schedule module');
 const writes=[],store=new Map(),nodes=new Map();
 const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',checked:false,textContent:'',classList:{add(){},remove(){},toggle(){},contains:()=>true},setAttribute(){},addEventListener(){}});return nodes.get(id);};
 const localStorage={getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)};
 const document={getElementById:id=>id==='schedule-container'?null:node(id),addEventListener(){},querySelectorAll:()=>[],body:{classList:{add(){},remove(){}}}};
 const context={...pure,console,Date,Math,JSON,Object,Array,String,Number,Set,Map,Promise,navigator:{onLine:true},localStorage,sessionStorage:{getItem:()=> '1'},document,
  window:{addEventListener(){},setInterval:()=>1,__scheduleDebug:{}},setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},confirm:()=>true,
  interfaceLocale:()=> 'ru-RU',translateUI:v=>v,doc:()=>({}),getDoc:async()=>({exists:()=>true,data:()=>writes.at(-1)}),setDoc:async(ref,data)=>writes.push(JSON.parse(JSON.stringify(data))),onSnapshot:()=>()=>{},
  dbGet:async()=>null,dbDelete:async()=>{},savePersistentValue:async(key,value)=>store.set(key,value),scheduleShareSnapshot:(data,day,type,date,mode)=>({data,day,type,date,mode}),
  getWeekTypeForDate(date){const d=new Date(date);d.setDate(d.getDate()-(d.getDay()||7)+1);return Math.abs(Math.round((d-new Date(2026,8,21))/(7*86400000)))%2===0?'denominator':'numerator';}
 };
 vm.createContext(context);
 const source=fs.readFileSync(path.join(root,'schedule.js'),'utf8').replace(/^import .*;\n/gm,'').replaceAll('export ','');
 vm.runInContext(source+`\nglobalThis.api={schedulePayload,installSchedulePayload,getScheduleDataForWeek,getCurrentScheduleList,loadScheduleData,applyCloudScheduleData,syncPendingScheduleData,getScheduleShareData,configureSchedule,defaults:scheduleDefaults,setSelection(date,type,day){scheduleReferenceDate=new Date(date);currentScheduleWeekType=type;currentScheduleDay=day;},setEditing(index){editingScheduleIndex=index;scheduleEditorOriginal=cloneScheduleItem(getCurrentScheduleList()[index]);}};`,context);
 const api=context.api,defaults=JSON.parse(JSON.stringify(api.defaults)),legacy=JSON.parse(JSON.stringify(defaults));
 legacy.denominator.mon[0]={...legacy.denominator.mon[0],subject:'Русская литература',teacher:'Магауина А.Т.',room:'Каб. 509',changeType:'subject',originalSubject:'Физика ЗАМЕНА!!! Русская Литература 509каб',originalTeacher:'Урунбаева Б.Т.',originalRoom:'Каб. 301'};
 legacy.denominator.mon[3]={...legacy.denominator.mon[3],cancelled:true,changeType:'cancel'};
 legacy.denominator.tue[0]={...legacy.denominator.tue[0],cancelled:true,changeType:'cancel'};
 legacy.denominator.tue[2]={...legacy.denominator.tue[2],subject:'Русская литература',changeType:'subject',originalSubject:'Всемирная история',originalRoom:'Каб. 503',originalTeacher:'Негманова Г.Б.'};
 legacy.denominator.tue[3].subject='Графика и проектирование';legacy.denominator.tue[3].teacher='Тайлаков С.А.';
 legacy.denominator.mon[2].room='Зал';
 legacy.denominator.thu[1]={...legacy.denominator.thu[1],subject:'Физвоспитание',room:'Зал',teacher:'Каримов Е.К.',changeType:'replace',originalSubject:'История Казахстана',originalRoom:'Каб. 503',originalTeacher:'Негманова Г.Б.'};
 const original=JSON.stringify(legacy),migrated=pure.migrateLegacySchedule(legacy,defaults);
 assert.equal(JSON.stringify(legacy),original,'migration never mutates its source');
 assert.equal(migrated.data.denominator.mon[0].subject,'Физика');assert.equal(migrated.data.denominator.mon[0].teacher,'Урунбаева Б.Т.');
 assert.equal(migrated.data.denominator.mon[3].cancelled,false);assert.equal(migrated.data.denominator.tue[0].cancelled,false);
 assert.equal(migrated.data.denominator.tue[2].subject,'Всемирная история');assert.equal(migrated.data.denominator.tue[3].subject,'Графика и проектирование');assert.equal(migrated.data.denominator.mon[2].room,'Зал');
 assert.deepEqual(migrated.data.dateOverrides['2026-10-05'].lessons,legacy.denominator.mon);
 assert.equal(pure.scheduleForDate(migrated.data,new Date('2026-10-19T00:00:00'),'denominator')[0].subject,'Физика');
 assert.equal(pure.scheduleForDate(migrated.data,new Date('2026-10-05T00:00:00'),'denominator')[0].subject,'Русская литература');
 assert.equal(pure.migrateLegacySchedule(migrated.data,defaults).migrated,false,'migration is idempotent');
 assert.deepEqual(pure.migrateLegacySchedule(migrated.data,defaults).data,migrated.data);
 api.installSchedulePayload(migrated.data);api.setSelection('2026-10-19T12:00:00','denominator','mon');api.setEditing(0);
 api.configureSchedule({getCloudState:()=>({isCloudConnected:true,db:{},auth:{currentUser:{uid:'test-owner'}}})});
 const fields={'edit-time':'08:00 - 09:30','edit-break':'Перемена: 10 мин','edit-subject':'Русская литература','edit-room':'Каб. 508','edit-teacher':'Магауина А.Т.','edit-change-type':'subject','edit-change-note':''};
 for(const [id,value] of Object.entries(fields))node(id).value=value;
 await context.window.saveScheduleLesson();
 assert.equal(writes.at(-1).denominator.mon[0].subject,'Физика','date edit never changes template');
 assert.equal(writes.at(-1).dateOverrides['2026-10-19'].lessons[0].subject,'Русская литература');
 assert.equal(writes.at(-1).lastChange.date,'2026-10-19','notification uses local calendar date');
 assert.equal(api.getScheduleDataForWeek('denominator',new Date('2026-11-02T00:00:00')).mon[0].subject,'Физика','next matching week returns to normal');
 assert.equal(api.getScheduleShareData().data.mon[0].subject,'Русская литература','share export resolves selected date');
 api.setSelection('2026-10-19T12:00:00','denominator','mon');api.setEditing(3);node('edit-change-type').value='cancel';
 for(const key of ['time','subject','room','teacher'])node('edit-'+key).value=api.getCurrentScheduleList()[3][key];
 await context.window.saveScheduleLesson();
 assert.equal(writes.at(-1).dateOverrides['2026-10-19'].lessons[3].cancelled,true);assert.equal(writes.at(-1).denominator.mon[3].cancelled,false);
 const base=JSON.stringify(writes.at(-1).denominator.mon);await context.window.moveScheduleLesson(0,1);assert.equal(JSON.stringify(writes.at(-1).denominator.mon),base);
 api.setEditing(1);await context.window.deleteScheduleLesson();assert.equal(writes.at(-1).dateOverrides['2026-10-19'].lessons.length,3);assert.equal(writes.at(-1).denominator.mon.length,4);
 api.setSelection('2026-11-02T12:00:00','denominator','mon');context.window.setScheduleEditScope('template');api.setEditing(0);node('edit-change-type').value='normal';node('edit-subject').value='Физика';node('edit-time').value='08:00 - 09:30';node('edit-room').value='Каб. 302';await context.window.saveScheduleLesson();assert.equal(writes.at(-1).denominator.mon[0].room,'Каб. 302','explicit permanent mode is retained');
 assert.equal(writes.at(-1).dateOverrides['2026-10-05'].lessons[0].subject,'Русская литература','later edits retain old actual schedules');
 context.window.setScheduleEditScope('date');context.window.setScheduleWeekType('numerator');assert.equal(context.getWeekTypeForDate(api.getScheduleShareData().date),'numerator','week selector and visible calendar agree');
 api.setSelection('2026-11-02T12:00:00','denominator','mon');node('schedule-bell-start').value='10:00';node('schedule-bell-duration').value='60';
 await context.window.saveScheduleBellEditor();assert.equal(writes.at(-1).dateOverrides['2026-11-02'].lessons[0].time,'10:00 - 11:00');assert.equal(writes.at(-1).denominator.mon[0].time,'08:00 - 09:30');
 context.navigator.onLine=false;api.setSelection('2026-11-16T12:00:00','denominator','mon');api.setEditing(0);node('edit-change-type').value='normal';node('edit-room').value='Каб. 304';await context.window.saveScheduleLesson();
 assert.equal(JSON.parse(store.get('toe_pending_schedule_v1')).dateOverrides['2026-11-16'].lessons[0].room,'Каб. 304','offline queue includes overrides');
 context.navigator.onLine=true;await api.syncPendingScheduleData();assert.equal(writes.at(-1).dateOverrides['2026-11-16'].lessons[0].room,'Каб. 304');assert.equal(store.has('toe_pending_schedule_v1'),false);
 const cloud=JSON.parse(JSON.stringify(writes.at(-1)));cloud.updatedAt='2099-01-01T00:00:00.000Z';cloud.dateOverrides['2026-11-16'].lessons[0].room='Каб. 305';assert.equal(api.applyCloudScheduleData(cloud),true);assert.equal(api.getScheduleDataForWeek('denominator',new Date('2026-11-16T12:00:00')).mon[0].room,'Каб. 305','remote changes to overrides are applied');
 const i18nSource=fs.readFileSync(path.join(root,'i18n.js'),'utf8').replaceAll('export ','');const langStore=new Map([['toe_ui_language','kz']]);const langContext={localStorage:{getItem:key=>langStore.get(key)},window:{},document:{},WeakMap,console};vm.createContext(langContext);vm.runInContext(i18nSource+'\nglobalThis.translate=translateUI;',langContext);
 for(const text of ['Режим изменений','Только на выбранную дату','Постоянное расписание'])assert.notEqual(langContext.translate(text),text);
 console.log('Passed: migration, factual history, teachers, dated edits/cancellations/deletion/reordering, cloud persistence, next recurrence, date exports, permanent editing, RU/KZ');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
