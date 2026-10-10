import { doc, writeBatch } from './firebase.js?v=20261005-group-tools-v2';
import { currentLang, translateUI } from './i18n.js?v=20261010-date-overrides-v2';
import { getScheduleShareData } from './schedule.js?v=20261010-date-overrides-v2';
import { pinnedAnnouncement, wrapCanvasText } from './group-tools-data.js?v=20261010-date-overrides-v2';

export const WORDS = {
  share: ['Поделиться расписанием','Сабақ кестесімен бөлісу'], day: ['День','Күн'], week: ['Неделя','Апта'],
  save: ['Сохранить картинку','Суретті сақтау'], send: ['Поделиться','Бөлісу'], close: ['Закрыть','Жабу'],
  preparing: ['Готовим картинку…','Сурет дайындалуда…'], shareHint: ['Картинка отражает выбранную дату, тип недели, замены и отмены.','Суретте таңдалған күн, апта түрі, ауыстырулар мен тоқтатылған сабақтар көрсетіледі.'],
  shareError: ['Не удалось создать картинку. Попробуйте выбрать один день.','Суретті жасау мүмкін болмады. Бір күнді таңдап көріңіз.'],
  shareFallback: ['Сохраните картинку и отправьте её в нужный чат.','Суретті сақтап, қажетті чатқа жіберіңіз.'],
  downloadError: ['Не удалось сохранить картинку.','Суретті сақтау мүмкін болмады.'],
  cancelled: ['Отменена','Тоқтатылды'], changed: ['Замена / изменение','Ауыстыру / өзгеріс'], empty: ['Занятий нет','Сабақ жоқ'],
  numerator: ['Числитель','Алым'], denominator: ['Знаменатель','Бөлім'],
  mon: ['Понедельник','Дүйсенбі'], tue: ['Вторник','Сейсенбі'], wed: ['Среда','Сәрсенбі'], thu: ['Четверг','Бейсенбі'], fri: ['Пятница','Жұма'],
  pin: ['Закрепить','Бекіту'], unpin: ['Открепить','Бекітуді алып тастау'], pinned: ['Закреплённое объявление','Бекітілген хабарландыру'],
  pinHint: ['Выберите срок. Объявление появится на главной у всей группы.','Мерзімді таңдаңыз. Хабарландыру бүкіл топтың басты бетінде көрсетіледі.'],
  expires: ['Показывать до','Көрсету мерзімі'], forever: ['Без срока','Мерзімсіз'], pinSave: ['Закрепить на главной','Басты бетке бекіту'],
  pinError: ['Не удалось изменить закрепление. Проверьте подключение и права.','Бекітуді өзгерту мүмкін болмады. Байланыс пен құқықтарды тексеріңіз.'],
  pinDateError: ['Выберите дату и время в будущем.','Болашақ күн мен уақытты таңдаңыз.'],
  pinSaved: ['Объявление закреплено','Хабарландыру бекітілді'], pinRemoved: ['Объявление откреплено','Хабарландыру бекітуден алынды'],
  ownerOnly: ['Закреплять объявления может владелец.','Хабарландыруды тек иесі бекіте алады.'],
  audit: ['История действий','Әрекеттер тарихы'], all: ['Все действия','Барлық әрекеттер'], attendance: ['Журнал','Журнал'], schedule: ['Расписание','Сабақ кестесі'],
  auditEmpty: ['Пока нет записей. История ведётся с этой версии.','Әзірге жазбалар жоқ. Тарих осы нұсқадан бастап жүргізіледі.'],
  auditRules: ['Общая история пока недоступна: нужны новые правила Firebase. Здесь показаны действия этой учётной записи на этом устройстве.','Ортақ тарих әзірге қолжетімсіз: Firebase ережелерін жаңарту қажет. Мұнда осы құрылғыдағы осы тіркелгінің әрекеттері көрсетіледі.'],
  auditOffline: ['Нет связи с общей историей. Показаны доступные записи.','Ортақ тарихпен байланыс жоқ. Қолжетімді жазбалар көрсетіледі.'],
  auditShared: ['Общая история группы · последние 100 записей','Топтың ортақ тарихы · соңғы 100 жазба'],
  local: ['На устройстве','Құрылғыда'], pending: ['Ожидает синхронизации','Синхрондауды күтуде'], synced: ['В общей истории','Ортақ тарихта'],
  localData: ['Изменение сохранено локально','Өзгеріс құрылғыда сақталды'], retry: ['Проверить подключение','Байланысты тексеру'],
  before: ['Было','Бұрын'], after: ['Стало','Қазір'], state: ['Посещаемость','Қатысу'], notes: ['Примечание','Ескерту'],
  time: ['Время','Уақыт'], subject: ['Предмет','Пән'], teacher: ['Преподаватель','Оқытушы'], room: ['Кабинет','Кабинет'],
  breakDuration: ['Перемена','Үзіліс'], isClassHour: ['Классный час','Сынып сағаты'], changeType: ['Тип изменения','Өзгеріс түрі'], changeNote: ['Причина изменения','Өзгеріс себебі'],
  yes: ['Да','Иә'], no: ['Нет','Жоқ'], unset: ['Не указано','Көрсетілмеген'], row: ['Занятие','Сабақ'],
  present: ['Присутствует','Қатысады'], late: ['Опоздание','Кешігу'], sick: ['Болеет','Ауырады'], excused: ['Уважительная причина','Дәлелді себеп'], unexcused: ['Неуважительная причина','Себепсіз'],
  normal: ['Без замены','Ауыстырусыз'], cancel: ['Отмена','Тоқтату'], replace: ['Замена','Ауыстыру'],
  allChanges: ['Все изменения','Барлық өзгерістер'], storageError: ['Изменение сохранено, но запись истории на устройстве недоступна.','Өзгеріс сақталды, бірақ құрылғыда тарих жазбасын сақтау мүмкін емес.'],
  titleRu: ['Заголовок на русском','Орысша тақырып'], textRu: ['Текст на русском','Орысша мәтін'], titleKz: ['Заголовок на казахском','Қазақша тақырып'], textKz: ['Текст на казахском','Қазақша мәтін'],
  bothLanguages: ['Заполните объявление на русском и казахском.','Хабарландыруды орысша және қазақша толтырыңыз.']
};
export function gt(key, language = currentLang()) { return WORDS[key]?.[language === 'kz' ? 1 : 0] || key; }
export function escapeGT(value) { return String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
let bridge = {}, items = [], pinBusy = false, shareBlob = null, shareURL = '', generation = 0, selectedPin = '', shareSnapshot = null;
const focusReturn = new Map();
const byId = id => document.getElementById(id);
function setGTStatus(id,key) { const node=byId(id);if(key){node.dataset.gt=key;node.textContent=gt(key);}else{delete node.dataset.gt;node.textContent='';} }
export function configureGroupTools(dependencies) { bridge = dependencies; install(); refreshGroupTools(); }
function makeModal(id, title, content, footer = '') {
  const div = document.createElement('div'); div.id = id; div.className = 'group-tools-overlay hidden'; div.dataset.i18nSkip = '';
  div.innerHTML = `<section class="group-tools-sheet" role="dialog" aria-modal="true" aria-labelledby="${id}-heading"><header><h2 id="${id}-heading" data-gt="${title}"></h2><button type="button" class="gt-close" data-gt-aria="close"><i class="fa-solid fa-xmark"></i></button></header><div class="group-tools-body">${content}</div>${footer ? `<footer>${footer}</footer>` : ''}</section>`;
  div.querySelector('.gt-close').addEventListener('click',()=>closeModal(id));
  div.addEventListener('click',event=>{if(event.target===div)closeModal(id);});
  div.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.stopPropagation();closeModal(id);}
    if(event.key!=='Tab')return;
    const controls=[...div.querySelectorAll('button,input,select,a[href],summary')].filter(x=>!x.disabled&&x.getClientRects().length);
    const first=controls[0],last=controls.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  });
  document.body.appendChild(div);
}
export function openGTModal(id) { focusReturn.set(id,document.activeElement); byId(id)?.classList.remove('hidden');document.body.classList.add('group-tools-open');refreshGroupTools();byId(id)?.querySelector('button')?.focus(); }
function closeModal(id) {
  byId(id)?.classList.add('hidden');
  if(![...document.querySelectorAll('.group-tools-overlay')].some(x=>!x.classList.contains('hidden')))document.body.classList.remove('group-tools-open');
  focusReturn.get(id)?.focus?.();
  if(id==='schedule-share-modal'){generation++;shareBlob=null;shareSnapshot=null;if(shareURL)URL.revokeObjectURL(shareURL);shareURL='';}
}
function install() {
  if(byId('schedule-share-modal'))return;
  makeModal('schedule-share-modal','share',`<p data-gt="shareHint"></p><div class="gt-selects"><select id="gt-share-mode" data-gt-aria="share"><option value="day" data-gt="day"></option><option value="week" data-gt="week"></option></select><select id="gt-share-language" aria-label="Русский / Қазақша"><option value="ru">Русский</option><option value="kz">Қазақша</option></select></div><p id="gt-share-status" role="status" aria-live="polite"></p><img id="gt-share-preview" hidden alt="">`,`<button id="gt-share-save" type="button" data-gt="save" disabled></button><button id="gt-share-send" type="button" class="gt-primary" data-gt="send" disabled></button>`);
  byId('gt-share-mode').addEventListener('change',()=>{shareSnapshot=getScheduleShareData(byId('gt-share-mode').value);generateShare();});
  byId('gt-share-language').addEventListener('change',generateShare);
  byId('gt-share-save').addEventListener('click',saveShare);
  byId('gt-share-send').addEventListener('click',sendShare);
  makeModal('announcement-pin-modal','pinned',`<p id="gt-pin-title"></p><p data-gt="pinHint"></p><label class="gt-field"><span data-gt="expires"></span><input id="gt-pin-until" type="datetime-local"></label><label class="gt-check"><input id="gt-pin-forever" type="checkbox"><span data-gt="forever"></span></label><p id="gt-pin-status" role="status" aria-live="polite"></p>`,`<button id="gt-pin-submit" class="gt-primary" type="button" data-gt="pinSave"></button>`);
  byId('gt-pin-forever').addEventListener('change',()=>{byId('gt-pin-until').disabled=byId('gt-pin-forever').checked;});
  byId('gt-pin-submit').addEventListener('click',()=>changePin(selectedPin));
  byId('schedule-share-button')?.addEventListener('click',()=>{
    shareSnapshot=getScheduleShareData('day');byId('gt-share-mode').value='day';byId('gt-share-language').value=currentLang();openGTModal('schedule-share-modal');generateShare();
  });
  window.refreshGroupTools=refreshGroupTools;
  setInterval(renderPin,30000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)renderPin();});
}
export function refreshGroupTools() {
  document.querySelectorAll('[data-gt]').forEach(node=>{node.textContent=gt(node.dataset.gt);});
  document.querySelectorAll('[data-gt-aria]').forEach(node=>node.setAttribute('aria-label',gt(node.dataset.gtAria)));
  document.querySelectorAll('[data-gt-placeholder]').forEach(node=>node.setAttribute('placeholder',gt(node.dataset.gtPlaceholder)));
  byId('gt-share-preview')?.setAttribute('alt',gt('share'));
  if(byId('gt-pin-title'))byId('gt-pin-title').textContent=bridge.title?.(items.find(x=>x.id===selectedPin))||'';
  renderPin();
  window.refreshAuditHistory?.();
}
export function updateGroupAnnouncements(next) { items=next;renderPin(); }
export function pinControl(item, owner) {
  if(!owner||!['announcement','important_announcement'].includes(item.type))return '';
  const active=pinnedAnnouncement(items);
  const removing=active?.id===item.id;
  return `<button type="button" class="gt-pin-button" data-gt-pin="${escapeGT(item.id)}" data-gt-remove="${removing?'1':'0'}" title="${gt(removing?'unpin':'pin')}" aria-label="${gt(removing?'unpin':'pin')}"><i class="fa-solid fa-thumbtack"></i></button>`;
}
export function bindPinControls(box) {
  box.querySelectorAll('[data-gt-pin]').forEach(button=>button.addEventListener('click',()=>{
    if(button.dataset.gtRemove==='1'){changePin('');return;}
    selectedPin=button.dataset.gtPin;
    const date=new Date(Date.now()+7*86400000); date.setMinutes(date.getMinutes()-date.getTimezoneOffset());
    byId('gt-pin-until').value=date.toISOString().slice(0,16);byId('gt-pin-until').disabled=false;byId('gt-pin-forever').checked=false;
    setGTStatus('gt-pin-status','');openGTModal('announcement-pin-modal');
  }));
}
function renderPin() {
  const box=byId('home-pinned-announcement');if(!box)return;
  const item=pinnedAnnouncement(items);box.hidden=!item;
  if(!item){box.replaceChildren();return;}
  const until=item.pinnedUntil?new Date(item.pinnedUntil).toLocaleString(currentLang()==='kz'?'kk-KZ':'ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'';
  box.innerHTML=`<span class="gt-pin-heading"><i class="fa-solid fa-thumbtack"></i>${gt('pinned')}</span><strong>${escapeGT(bridge.title?.(item)||'')}</strong><p>${escapeGT(bridge.text?.(item)||'')}</p>${until?`<small>${gt('expires')}: ${escapeGT(until)}</small>`:''}`;
}
async function changePin(id) {
  const state=bridge.state?.()||{};
  if(!state.owner){bridge.toast?.(gt('ownerOnly'));return;}
  if(pinBusy)return;
  if(!state.db||!state.uid||!navigator.onLine){bridge.toast?.(gt('pinError'));return;}
  const until=id&&!byId('gt-pin-forever').checked?new Date(byId('gt-pin-until').value):null;
  if(id&&until&&!(until.getTime()>Date.now())){setGTStatus('gt-pin-status','pinDateError');return;}
  const item=items.find(x=>x.id===id);if(id&&!item){bridge.toast?.(gt('pinError'));return;}
  pinBusy=true;byId('gt-pin-submit').disabled=true;
  try {
    const batch=writeBatch(state.db);
    for(const previous of items.filter(x=>x.pinned&&x.id!==id))batch.update(doc(state.db,'toe_group','shared','notifications',previous.id),{pinned:false});
    const pinnedAt=new Date().toISOString();
    if(id)batch.update(doc(state.db,'toe_group','shared','notifications',id),{pinned:true,pinnedAt,pinnedUntil:until?until.toISOString():'',pinnedByUid:state.uid});
    await batch.commit();
    items=items.map(x=>x.id===id?{...x,pinned:true,pinnedAt,pinnedUntil:until?until.toISOString():''}:{...x,pinned:false});
    renderPin();bridge.renderNotifications?.();closeModal('announcement-pin-modal');bridge.toast?.(gt(id?'pinSaved':'pinRemoved'));
  } catch(error) { console.warn('Announcement pin',error);setGTStatus('gt-pin-status','pinError');bridge.toast?.(gt('pinError')); }
  finally {pinBusy=false;byId('gt-pin-submit').disabled=false;}
}
function imageText(value, lang) { return lang==='kz'?translateUI(String(value||''), 'kz'):String(value||''); }
export function scheduleImageRows(snapshot, language) {
  const rows=[];
  for(const day of snapshot.days){
    rows.push({heading:true,text:`${gt(day.key,language)} · ${new Date(day.date+'T12:00:00').toLocaleDateString(language==='kz'?'kk-KZ':'ru-RU',{day:'numeric',month:'long',year:'numeric'})}`});
    if(!day.lessons.length)rows.push({text:gt('empty',language),meta:''});
    for(const lesson of day.lessons){
      rows.push({text:`${lesson.time||'—'}   ${imageText(lesson.subject,language)}`,meta:[lesson.teacher,imageText(lesson.room,language)].filter(Boolean).join(' · '),
        note:[lesson.cancelled?gt('cancelled',language):(lesson.changeType&&lesson.changeType!=='normal')?gt('changed',language):'',imageText(lesson.changeNote,language)].filter(Boolean).join(' · '),cancelled:!!lesson.cancelled});
    }
  }
  return rows;
}
async function generateShare() {
  const token=++generation;shareBlob=null;byId('gt-share-save').disabled=true;byId('gt-share-send').disabled=true;byId('gt-share-preview').hidden=true;
  setGTStatus('gt-share-status','preparing');
  try {
    const language=byId('gt-share-language').value;
    if(document.fonts?.ready)await Promise.race([document.fonts.ready,new Promise(resolve=>setTimeout(resolve,1500))]);
    if(token!==generation)return;
    const canvas=document.createElement('canvas');canvas.width=960;const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas unavailable');
    const rows=scheduleImageRows(shareSnapshot,language),font='Inter, Arial, sans-serif';
    let height=190;
    for(const row of rows){
      ctx.font=`${row.heading?'700 27':'600 26'}px ${font}`;row.lines=wrapCanvasText(row.text,t=>ctx.measureText(t).width,824);
      ctx.font=`22px ${font}`;row.metaLines=row.meta?wrapCanvasText(row.meta,t=>ctx.measureText(t).width,824):[];row.noteLines=row.note?wrapCanvasText(row.note,t=>ctx.measureText(t).width,824):[];
      row.height=row.heading?row.lines.length*35+32:row.lines.length*35+(row.metaLines.length+row.noteLines.length)*30+38;
      height+=row.height+12;
    }
    if(height>8100)throw new Error('Image too tall');canvas.height=height+110;
    const gradient=ctx.createLinearGradient(0,0,960,canvas.height);gradient.addColorStop(0,'#eeeaff');gradient.addColorStop(1,'#f8fafc');ctx.fillStyle=gradient;ctx.fillRect(0,0,960,canvas.height);
    ctx.fillStyle='#6555ab';ctx.font=`700 25px ${font}`;ctx.fillText('SBP Information',48,57);
    const group=String(bridge.groupName?.()||'ТОЭ-26-9-1');ctx.font=`700 32px ${font}`;
    const groupLines=wrapCanvasText(group,t=>ctx.measureText(t).width,864);if(groupLines.length>2)throw new Error('Group title too long');
    groupLines.forEach((line,i)=>ctx.fillText(line,48,102+i*38));
    ctx.font=`22px ${font}`;ctx.fillStyle='#766d91';ctx.fillText(`${gt(shareSnapshot.mode==='week'?'week':'day',language)} · ${gt(shareSnapshot.weekType,language)}`,48,groupLines.length>1?170:146);
    let y=groupLines.length>1?208:170;
    for(const row of rows){
      if(!row.heading){ctx.fillStyle='#ffffff';ctx.beginPath();ctx.roundRect(48,y,864,row.height,20);ctx.fill();}
      ctx.font=`${row.heading?'700 27':'600 26'}px ${font}`;ctx.fillStyle=row.cancelled?'#a94b6a':row.heading?'#6555ab':'#30283f';
      let baseline=y+(row.heading?37:36);for(const line of row.lines){ctx.fillText(line,68,baseline);baseline+=35;}
      ctx.font=`22px ${font}`;ctx.fillStyle='#70677d';for(const line of row.metaLines){ctx.fillText(line,68,baseline);baseline+=30;}
      ctx.fillStyle='#a94b6a';for(const line of row.noteLines){ctx.fillText(line,68,baseline);baseline+=30;}
      y+=row.height+12;
    }
    ctx.font=`18px ${font}`;ctx.fillStyle='#766d91';ctx.fillText(new Date().toLocaleString(language==='kz'?'kk-KZ':'ru-RU'),48,canvas.height-25);
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('PNG unavailable')),'image/png'));
    if(token!==generation)return;shareBlob=blob;if(shareURL)URL.revokeObjectURL(shareURL);shareURL=URL.createObjectURL(blob);
    byId('gt-share-preview').src=shareURL;byId('gt-share-preview').hidden=false;setGTStatus('gt-share-status','');byId('gt-share-save').disabled=false;byId('gt-share-send').disabled=false;
  }catch(error){if(token!==generation)return;console.warn('Schedule image',error);setGTStatus('gt-share-status','shareError');}
}
function imageFilename(){return `SBP-${shareSnapshot?.days[0]?.date||'schedule'}-${shareSnapshot?.mode||'day'}-${byId('gt-share-language').value}.png`;}
function saveShare() {if(!shareBlob)return;try{const link=document.createElement('a');link.href=shareURL;link.download=imageFilename();document.body.appendChild(link);link.click();link.remove();}catch(error){bridge.toast?.(gt('downloadError'));}}
async function sendShare() {
  if(!shareBlob)return;
  try {
    const file=new File([shareBlob],imageFilename(),{type:'image/png'});
    if(navigator.share&&navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:gt('share')});return;}
    bridge.toast?.(gt('shareFallback'));
  }catch(error){if(error.name!=='AbortError')bridge.toast?.(gt('shareFallback'));}
}
