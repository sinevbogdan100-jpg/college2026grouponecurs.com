import { doc, setDoc, getDoc, onSnapshot } from "./firebase.js?v=20261003-step18-3-recovery1";
import { getWeekTypeForDate } from "./utils.js?v=20261003-step18-3-recovery1";
import { dbGet, savePersistentValue } from "./storage.js?v=20261003-step18-3-recovery1";

const CLOUD_ROOT = ['toe_group', 'shared'];

let dependencies = {
    getCloudState: () => ({ isCloudConnected: false, db: null, auth: null }),
    showToast: () => {},
    createAutomaticBackup: async () => {},
    updateBackupStatus: () => {},
    setRealtimeDiagnostic: () => {},
    setWriteDiagnostic: () => {},
    diagLog: () => {}
};

export function configureSchedule(nextDependencies = {}) {
    dependencies = { ...dependencies, ...nextDependencies };
}

function getCloudState() {
    return dependencies.getCloudState?.() || { isCloudConnected: false, db: null, auth: null };
}

function showToast(message) {
    dependencies.showToast?.(message);
}

// Schedule Data with specified teachers & room rules
const scheduleDataNumerator = {
    mon: [
        { time: '08:00 - 09:30', breakDuration: 'Перемена: 10 мин', subject: 'Физика', room: 'Каб. 301', teacher: 'Урунбаева Б.Т.' },
        { time: '09:40 - 11:10', breakDuration: 'Большая перемена: 20 мин', subject: 'Иностранный язык', room: 'Каб. 504', teacher: 'Хамитова А.С.' },
        { time: '11:30 - 13:00', breakDuration: 'Перемена: 10 мин', subject: 'Физическая культура', room: 'Улица', teacher: 'Каримов Е.К.' },
        { time: '13:10 - 14:40', breakDuration: 'Конец занятий', subject: 'История Казахстана', room: 'Каб. 503', teacher: 'Негманова Г.Б.' }
    ],
    tue: [
        { time: '08:00 - 08:30', breakDuration: 'Перемена: 0 мин', subject: 'Классный час', room: 'Каб. 503', teacher: 'Негманова Г.Б.', isClassHour: true },
        { time: '08:30 - 10:00', breakDuration: 'Перемена: 10 мин', subject: 'Русский язык и литература', room: 'Каб. 508', teacher: 'Магауина А.Т.' },
        { time: '10:10 - 11:40', breakDuration: 'Большая перемена: 20 мин', subject: 'Математика', room: 'Каб. 505', teacher: 'Жанкаринова Ж.Т.' },
        { time: '12:00 - 13:30', breakDuration: 'Перемена: 10 мин', subject: 'География', room: 'Каб. 506', teacher: 'Кожахметов Н.С.' },
        { time: '13:40 - 15:10', breakDuration: 'Конец занятий', subject: 'Физическая культура', room: 'Улица', teacher: 'Каримов Е.К.' }
    ],
    wed: [
        { time: '08:00 - 09:30', breakDuration: 'Перемена: 10 мин', subject: 'Биология', room: 'Каб. 303', teacher: 'Кульшманова Ж.Т.' },
        { time: '09:40 - 11:10', breakDuration: 'Большая перемена: 20 мин', subject: 'Физика', room: 'Каб. 301', teacher: 'Урунбаева Б.Т.' },
        { time: '11:30 - 13:00', breakDuration: 'Перемена: 10 мин', subject: 'Казахский язык и литература', room: 'Каб. 509', teacher: '' },
        { time: '13:10 - 14:40', breakDuration: 'Конец занятий', subject: 'НВП', room: 'Каб. 507', teacher: 'Нұрпейіс Н.Т.' }
    ],
    thu: [
        { time: '08:00 - 09:30', breakDuration: 'Перемена: 10 мин', subject: 'Математика', room: 'Каб. 505', teacher: 'Жанкаринова Ж.Т.' },
        { time: '09:40 - 11:10', breakDuration: 'Большая перемена: 20 мин', subject: 'Русский язык и литература', room: 'Каб. 508', teacher: 'Магауина А.Т.' },
        { time: '11:30 - 13:00', breakDuration: 'Конец занятий', subject: 'Химия', room: 'Каб. 502', teacher: 'Кульшманова Ж.Т.' }
    ],
    fri: [
        { time: '08:00 - 09:30', breakDuration: 'Перемена: 10 мин', subject: 'Химия', room: 'Каб. 502', teacher: 'Кульшманова Ж.Т.' },
        { time: '09:40 - 11:10', breakDuration: 'Большая перемена: 20 мин', subject: 'Русская литература', room: 'Каб. 508', teacher: 'Магауина А.Т.' },
        { time: '11:30 - 13:00', breakDuration: 'Конец занятий', subject: 'Казахский язык и литература', room: 'Каб. 509', teacher: '' }
    ]
};

const scheduleDataDenominator = {
    mon: [
        { time: '08:00 - 09:30', breakDuration: 'Перемена: 10 мин', subject: 'Физика', room: 'Каб. 301', teacher: 'Урунбаева Б.Т.' },
        { time: '09:40 - 11:10', breakDuration: 'Большая перемена: 20 мин', subject: 'Иностранный язык', room: 'Каб. 504', teacher: 'Хамитова А.С.' },
        { time: '11:30 - 13:00', breakDuration: 'Перемена: 10 мин', subject: 'Физическая культура', room: 'Улица', teacher: 'Каримов Е.К.' },
        { time: '13:10 - 14:40', breakDuration: 'Конец занятий', subject: 'История Казахстана', room: 'Каб. 503', teacher: 'Негманова Г.Б.' }
    ],
    tue: [
        { time: '08:00 - 08:30', breakDuration: 'Перемена: 0 мин', subject: 'Классный час', room: 'Каб. 503', teacher: 'Негманова Г.Б.', isClassHour: true },
        { time: '08:30 - 10:00', breakDuration: 'Перемена: 10 мин', subject: 'Русский язык и литература', room: 'Каб. 508', teacher: 'Магауина А.Т.' },
        { time: '10:10 - 11:40', breakDuration: 'Большая перемена: 20 мин', subject: 'История Казахстана', room: 'Каб. 503', teacher: 'Негманова Г.Б.' },
        { time: '12:00 - 13:30', breakDuration: 'Перемена: 10 мин', subject: 'Биология', room: 'Каб. 303', teacher: 'Кульшманова Ж.Т.' },
        { time: '13:40 - 15:10', breakDuration: 'Конец занятий', subject: 'Иностранный язык', room: 'Каб. 504', teacher: 'Хамитова А.С.' }
    ],
    wed: [
        { time: '08:00 - 09:30', breakDuration: 'Перемена: 10 мин', subject: 'Биология', room: 'Каб. 303', teacher: 'Кульшманова Ж.Т.' },
        { time: '09:40 - 11:10', breakDuration: 'Большая перемена: 20 мин', subject: 'Глобальные компетенции', room: 'Каб. 308', teacher: 'Байбаева М.В.' },
        { time: '11:30 - 13:00', breakDuration: 'Перемена: 10 мин', subject: 'Информатика', room: 'Каб. 207', teacher: '' },
        { time: '13:10 - 14:40', breakDuration: 'Конец занятий', subject: 'НВП', room: 'Каб. 507', teacher: 'Нұрпейіс Н.Т.' }
    ],
    thu: [
        { time: '08:00 - 09:30', breakDuration: 'Перемена: 10 мин', subject: 'Математика', room: 'Каб. 505', teacher: 'Жанкаринова Ж.Т.' },
        { time: '09:40 - 11:10', breakDuration: 'Большая перемена: 20 мин', subject: 'История Казахстана', room: 'Каб. 503', teacher: 'Негманова Г.Б.' },
        { time: '11:30 - 13:00', breakDuration: 'Перемена: 10 мин', subject: 'Биология', room: 'Каб. 303', teacher: 'Кульшманова Ж.Т.' },
        { time: '13:10 - 14:40', breakDuration: 'Конец занятий', subject: 'Иностранный язык', room: 'Каб. 504', teacher: 'Хамитова А.С.' }
    ],
    fri: [
        { time: '08:00 - 09:30', breakDuration: 'Перемена: 10 мин', subject: 'Химия', room: 'Каб. 502', teacher: 'Кульшманова Ж.Т.' },
        { time: '09:40 - 11:10', breakDuration: 'Большая перемена: 20 мин', subject: 'Русская литература', room: 'Каб. 508', teacher: 'Магауина А.Т.' },
        { time: '11:30 - 13:00', breakDuration: 'Конец занятий', subject: 'Казахский язык и литература', room: 'Каб. 509', teacher: '' }
    ]
};

let currentScheduleDay = 'mon';
let currentScheduleWeekType = 'denominator';
let editingScheduleIndex = -1;
let scheduleEditorOriginal = null;
let scheduleChangeNoteManuallyEdited = false;
let scheduleUnsubscribe = null;
let schedulePollTimer = null;
let scheduleReconnectTimer = null;
let scheduleReconnectAttempt = 0;
let lastScheduleAppliedUpdatedAt = '';
let lastScheduleLocalWriteAt = '';

window.__scheduleDebug = window.__scheduleDebug || { lastSnapshotAt:'', lastUpdatedAt:'', lastSource:'', lastSaveOk:false };
window.__scheduleListenerActive = false;

export function getCurrentScheduleDay() {
    return currentScheduleDay;
}

export function getCurrentScheduleWeekType() {
    return currentScheduleWeekType;
}

export function getScheduleDataForWeek(type) {
    return type === 'numerator' ? scheduleDataNumerator : scheduleDataDenominator;
}

export function restoreScheduleSelection(savedDay, savedWeek) {
    if (savedWeek === 'numerator' || savedWeek === 'denominator') currentScheduleWeekType = savedWeek;
    if (savedDay && ['mon','tue','wed','thu','fri'].includes(savedDay)) currentScheduleDay = savedDay;
}


const REF_SCHEDULE_DAYS=['mon','tue','wed','thu','fri'];
function refParseRange(text){
    const m=String(text||'').match(/(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})/);
    return m?{start:+m[1]*60+(+m[2]),end:+m[3]*60+(+m[4])}:null;
}
function refDayIndex(day){return Math.max(0,REF_SCHEDULE_DAYS.indexOf(day));}
function refSelectedDate(day=currentScheduleDay){
    const now=new Date(); const dow=now.getDay()===0?7:now.getDay();
    const monday=new Date(now); monday.setHours(0,0,0,0); monday.setDate(now.getDate()-(dow-1));
    const d=new Date(monday); d.setDate(monday.getDate()+refDayIndex(day)); return d;
}
function refFloor(room){const m=String(room||'').match(/\b([1-9])\d{2}\b/);return m?m[1]:'';}
function updateReferenceScheduleControls(){
    document.getElementById('sched-btn-num')?.classList.toggle('active',currentScheduleWeekType==='numerator');
    document.getElementById('sched-btn-den')?.classList.toggle('active',currentScheduleWeekType==='denominator');
    REF_SCHEDULE_DAYS.forEach(day=>document.getElementById('tab-'+day)?.classList.toggle('active',day===currentScheduleDay));
    const labels=['date-mon','date-tue','date-wed','date-thu','date-fri'];
    REF_SCHEDULE_DAYS.forEach((day,i)=>{
      const d=refSelectedDate(day),el=document.getElementById(labels[i]);
      if(el)el.textContent=d.toLocaleDateString('ru-RU',{day:'numeric',month:'short'}).replace('.','');
    });
    const d=refSelectedDate();
    const dateEl=document.getElementById('schedule-reference-date');
    if(dateEl)dateEl.textContent=d.toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).replace(/^./,x=>x.toUpperCase());
}
window.shiftScheduleReferenceDate=function(delta){
    const i=refDayIndex(currentScheduleDay),next=Math.max(0,Math.min(4,i+(delta<0?-1:1)));
    window.setScheduleDay(REF_SCHEDULE_DAYS[next]);
};

export function syncScheduleToToday() {
    const now=new Date(), dayKeys={1:'mon',2:'tue',3:'wed',4:'thu',5:'fri'};
    currentScheduleDay=dayKeys[now.getDay()]||'fri';
    currentScheduleWeekType=getWeekTypeForDate(now);
    try{localStorage.setItem('toe_current_schedule_day',currentScheduleDay);localStorage.setItem('toe_schedule_week_type',currentScheduleWeekType);}catch(e){}
    updateReferenceScheduleControls();
}

window.setScheduleWeekType = function(type) {
    currentScheduleWeekType=type==='numerator'?'numerator':'denominator';
    try{localStorage.setItem('toe_schedule_week_type',currentScheduleWeekType);}catch(e){}
    updateReferenceScheduleControls();
    renderSchedule(currentScheduleDay);
};

window.setScheduleDay = function(day) {
    if(!REF_SCHEDULE_DAYS.includes(day))return;
    currentScheduleDay=day;
    try{localStorage.setItem('toe_current_schedule_day',day);}catch(e){}
    updateReferenceScheduleControls();
    renderSchedule(day);
};

function collectScheduleItems() {
    const items = [];
    [scheduleDataNumerator, scheduleDataDenominator].forEach(source => {
        Object.values(source || {}).forEach(dayList => {
            (Array.isArray(dayList) ? dayList : []).forEach(item => items.push(item));
        });
    });
    return items;
}

function buildSubjectCatalog() {
    const catalog = new Map();
    collectScheduleItems().forEach(item => {
        const subject = String(item?.subject || '').trim();
        if (!subject) return;
        const existing = catalog.get(subject) || { subject, room: '', teacher: '' };
        if (!existing.room && item.room) existing.room = String(item.room).trim();
        if (!existing.teacher && item.teacher) existing.teacher = String(item.teacher).trim();
        catalog.set(subject, existing);
    });
    return [...catalog.values()].sort((a, b) => a.subject.localeCompare(b.subject, 'ru'));
}

function fillScheduleEditorDatalists() {
    const subjectList = document.getElementById('schedule-subject-list');
    const timeList = document.getElementById('schedule-time-list');
    const breakList = document.getElementById('schedule-break-list');

    if (subjectList) {
        subjectList.innerHTML = '';
        buildSubjectCatalog().forEach(item => {
            const option = document.createElement('option');
            option.value = item.subject;
            const details = [item.room, item.teacher].filter(Boolean).join(' · ');
            if (details) option.label = details;
            subjectList.appendChild(option);
        });
    }

    const items = collectScheduleItems();
    const times = [...new Set(items.map(item => String(item?.time || '').trim()).filter(Boolean))];
    const breaks = [...new Set(items.map(item => String(item?.breakDuration || '').trim()).filter(Boolean))];

    if (timeList) {
        timeList.innerHTML = '';
        times.forEach(value => {
            const option = document.createElement('option');
            option.value = value;
            timeList.appendChild(option);
        });
    }
    if (breakList) {
        breakList.innerHTML = '';
        breaks.forEach(value => {
            const option = document.createElement('option');
            option.value = value;
            breakList.appendChild(option);
        });
    }
}

window.onScheduleSubjectChanged = function(fromTyping = false) {
    const subjectInput = document.getElementById('edit-subject');
    const roomInput = document.getElementById('edit-room');
    const teacherInput = document.getElementById('edit-teacher');
    if (!subjectInput || !roomInput || !teacherInput) return;
    const value = subjectInput.value.trim();
    const match = buildSubjectCatalog().find(item => item.subject.toLocaleLowerCase('ru') === value.toLocaleLowerCase('ru'));
    if (!match) return;
    if (fromTyping && value.length < 2) return;
    roomInput.value = match.room || '';
    teacherInput.value = match.teacher || '';
};

window.onScheduleTimeChanged = function() {
    const timeInput = document.getElementById('edit-time');
    const breakInput = document.getElementById('edit-break');
    if (!timeInput || !breakInput) return;
    const time = timeInput.value.trim();
    const match = collectScheduleItems().find(item => String(item?.time || '').trim() === time && item?.breakDuration);
    if (match) breakInput.value = String(match.breakDuration || '').trim();
};


function cloneScheduleItem(item = {}) {
    return {
        time: String(item.time || '').trim(),
        breakDuration: String(item.breakDuration || '').trim(),
        subject: String(item.subject || '').trim(),
        room: String(item.room || '').trim(),
        teacher: String(item.teacher || '').trim(),
        isClassHour: !!item.isClassHour,
        changeType: String(item.changeType || 'normal'),
        changeNote: String(item.changeNote || '').trim(),
        cancelled: !!item.cancelled
    };
}

function setScheduleEditorReadOnly(ids, readOnly) {
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.readOnly = !!readOnly;
        el.classList.toggle('bg-slate-50', !!readOnly);
        el.classList.toggle('text-slate-400', !!readOnly);
    });
}

function getScheduleEditorValues() {
    return {
        time: document.getElementById('edit-time')?.value.trim() || '',
        breakDuration: document.getElementById('edit-break')?.value.trim() || '',
        subject: document.getElementById('edit-subject')?.value.trim() || '',
        room: document.getElementById('edit-room')?.value.trim() || '',
        teacher: document.getElementById('edit-teacher')?.value.trim() || ''
    };
}

function buildScheduleChangeNote(type) {
    const original = scheduleEditorOriginal || {};
    const current = getScheduleEditorValues();
    const subject = current.subject || original.subject || 'Пара';
    switch (type) {
        case 'room':
            return current.room && original.room && current.room !== original.room
                ? `Замена кабинета: ${subject} — вместо ${original.room} ${current.room}`
                : `Замена кабинета: ${subject}`;
        case 'teacher':
            return current.teacher && original.teacher && current.teacher !== original.teacher
                ? `Замена преподавателя: ${subject} — вместо ${original.teacher} ${current.teacher}`
                : `Замена преподавателя: ${subject}`;
        case 'subject':
            return current.subject && original.subject && current.subject !== original.subject
                ? `Замена предмета: вместо ${original.subject} — ${current.subject}`
                : `Замена предмета`;
        case 'time':
            return current.time && original.time && current.time !== original.time
                ? `Перенос пары: ${subject} — с ${original.time} на ${current.time}`
                : `Перенос пары: ${subject}`;
        case 'replace':
            return current.subject && original.subject && current.subject !== original.subject
                ? `Замена пары: вместо ${original.subject} — ${current.subject}${current.time ? `, ${current.time}` : ''}`
                : `Замена пары: ${subject}${current.time ? `, ${current.time}` : ''}`;
        case 'cancel':
            return `Пара отменена: ${original.subject || subject}${original.time ? ` (${original.time})` : ''}`;
        default:
            return '';
    }
}

function refreshScheduleChangeNote(force = false) {
    const note = document.getElementById('edit-change-note');
    const type = document.getElementById('edit-change-type')?.value || 'normal';
    if (!note || (!force && scheduleChangeNoteManuallyEdited)) return;
    note.value = buildScheduleChangeNote(type);
}

window.markScheduleChangeNoteManual = function() {
    scheduleChangeNoteManuallyEdited = true;
};

window.onScheduleEditorFieldChanged = function() {
    refreshScheduleChangeNote(false);
};

window.onScheduleChangeTypeChanged = function() {
    const type = document.getElementById('edit-change-type')?.value || 'normal';
    const hint = document.getElementById('schedule-change-hint');
    const fields = ['edit-time', 'edit-break', 'edit-subject', 'edit-room', 'edit-teacher'];
    setScheduleEditorReadOnly(fields, false);

    let message = 'Можно изменить любые данные пары.';
    if (type === 'room') {
        setScheduleEditorReadOnly(['edit-time', 'edit-break', 'edit-subject', 'edit-teacher'], true);
        message = 'Изменяется только кабинет. Остальные данные пары защищены от случайного изменения.';
        setTimeout(() => document.getElementById('edit-room')?.focus(), 0);
    } else if (type === 'teacher') {
        setScheduleEditorReadOnly(['edit-time', 'edit-break', 'edit-subject', 'edit-room'], true);
        message = 'Изменяется только преподаватель.';
        setTimeout(() => document.getElementById('edit-teacher')?.focus(), 0);
    } else if (type === 'subject') {
        setScheduleEditorReadOnly(['edit-time', 'edit-break'], true);
        message = 'Выберите новый предмет — известные кабинет и преподаватель подставятся автоматически.';
        setTimeout(() => document.getElementById('edit-subject')?.focus(), 0);
    } else if (type === 'time') {
        setScheduleEditorReadOnly(['edit-subject', 'edit-room', 'edit-teacher'], true);
        message = 'Измените время пары. Перемена подставится из уже известных интервалов, если совпадение найдено.';
        setTimeout(() => document.getElementById('edit-time')?.focus(), 0);
    } else if (type === 'replace') {
        message = 'Полная замена: можно поменять предмет, время, кабинет и преподавателя.';
        setTimeout(() => document.getElementById('edit-subject')?.focus(), 0);
    } else if (type === 'cancel') {
        setScheduleEditorReadOnly(fields, true);
        message = 'Пара останется в расписании как отменённая. При необходимости измените только комментарий.';
        setTimeout(() => document.getElementById('edit-change-note')?.focus(), 0);
    }
    if (hint) hint.textContent = message;
    scheduleChangeNoteManuallyEdited = false;
    refreshScheduleChangeNote(true);
};

export function renderSchedule(dayKey = currentScheduleDay) {
    const container=document.getElementById('schedule-container'); if(!container)return;
    container.innerHTML=''; updateReferenceScheduleControls();
    const source=currentScheduleWeekType==='numerator'?scheduleDataNumerator:scheduleDataDenominator;
    const list=source[dayKey]||[];
    const now=new Date(), mins=now.getHours()*60+now.getMinutes();
    const selectedDate=refSelectedDate(dayKey);
    const todayKey=({1:'mon',2:'tue',3:'wed',4:'thu',5:'fri'})[now.getDay()]||'';
    const isToday=dayKey===todayKey && currentScheduleWeekType===getWeekTypeForDate(now);

    let lessonNo=0;
    const lessonEntries=list.map((item,index)=>{
      const no=item.isClassHour?null:++lessonNo;
      return {item,index,no,r:refParseRange(item.time)};
    });

    let currentLesson=null,currentBreak=null;
    if(isToday){
      currentLesson=lessonEntries.find(x=>x.r&&mins>=x.r.start&&mins<x.r.end&&!x.item.cancelled)||null;
      if(!currentLesson){
        for(let i=0;i<lessonEntries.length-1;i++){
          const a=lessonEntries[i],b=lessonEntries[i+1];
          if(a.r&&b.r&&b.r.start>a.r.end&&mins>=a.r.end&&mins<b.r.start){currentBreak={start:a.r.end,end:b.r.start};break;}
        }
      }
    }

    const summary=document.createElement('section'); summary.className='schedule-live-summary';
    let summaryTitle='Сегодня',summaryState='Расписание',summaryTime='',summaryProgress=0,summaryClass='';
    if(currentLesson){
      summaryState=`${currentLesson.no||''} пара (идёт)`.trim(); summaryTime=currentLesson.item.time;
      summaryProgress=Math.max(1,Math.min(100,((mins-currentLesson.r.start)/(currentLesson.r.end-currentLesson.r.start))*100)); summaryClass='lesson';
    }else if(currentBreak){
      summaryState='Перемена'; summaryTime=`${String(Math.floor(currentBreak.start/60)).padStart(2,'0')}:${String(currentBreak.start%60).padStart(2,'0')} – ${String(Math.floor(currentBreak.end/60)).padStart(2,'0')}:${String(currentBreak.end%60).padStart(2,'0')}`;
      summaryProgress=Math.max(1,Math.min(100,((mins-currentBreak.start)/(currentBreak.end-currentBreak.start))*100)); summaryClass='break';
    }else if(!isToday){summaryTitle=selectedDate.toLocaleDateString('ru-RU',{weekday:'long'}).replace(/^./,x=>x.toUpperCase());summaryState='Расписание дня';}
    else {summaryState='Занятия';}
    summary.innerHTML=`<div class="schedule-live-head"><div><i class="fa-solid fa-book-open"></i><strong>${summaryTitle}</strong><span>${selectedDate.toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</span></div><div class="${summaryClass}"><strong>${summaryState}</strong><span>${summaryTime}</span></div></div>
      <div class="schedule-live-progress"><i class="${summaryClass}" style="width:${summaryProgress}%"></i></div>
      ${currentLesson?`<p>До конца пары: ${Math.max(0,currentLesson.r.end-mins)} минут</p>`:currentBreak?`<p>До следующей пары: ${Math.max(0,currentBreak.end-mins)} минут</p>`:''}`;
    container.appendChild(summary);

    if(sessionStorage.getItem('toe_can_schedule')==='1'){
      const hint=document.createElement('div');hint.className='schedule-ref-admin-hint';hint.innerHTML='<i class="fa-solid fa-pen-to-square"></i> Режим администратора: расписание можно редактировать.';container.appendChild(hint);
    }

    lessonEntries.forEach((entry,pos)=>{
      const {item,index,no,r}=entry; const past=isToday&&r&&mins>=r.end; const current=currentLesson===entry;
      const row=document.createElement('article');
      row.className=`schedule-ref-row ${current?'current ':''}${past?'past ':''}${item.cancelled?'cancelled':''}`;
      const status=current?'<span class="schedule-ref-state current"><i class="fa-solid fa-circle"></i> Идёт</span>':past?'<span class="schedule-ref-state done"><i class="fa-solid fa-circle-check"></i> Завершена</span>':'';
      row.innerHTML=`<div class="schedule-ref-rail"><span class="schedule-ref-number">${no||'<i class="fa-solid fa-star"></i>'}</span><i></i></div>
        <div class="schedule-ref-content">
          <div class="schedule-ref-row-head"><span>${item.time||''}</span>${status}</div>
          <strong>${item.subject||'Занятие'}${item.cancelled?' · отменена':''}</strong>
          <div class="schedule-ref-meta"><span><i class="fa-regular fa-square"></i> ${item.room||'—'}${refFloor(item.room)?' · '+refFloor(item.room)+' этаж':''}</span>${item.teacher?`<span><i class="fa-regular fa-user"></i> ${item.teacher}</span>`:''}</div>
          ${item.changeNote?`<div class="schedule-ref-change">${item.changeNote}</div>`:''}
          <div class="schedule-admin-actions"><button onclick="moveScheduleLesson(${index},-1)">↑</button><button onclick="moveScheduleLesson(${index},1)">↓</button><button onclick="openScheduleEditor(${index})">Изменить</button></div>
        </div>`;
      container.appendChild(row);

      const next=lessonEntries[pos+1];
      if(next&&r&&next.r&&next.r.start>r.end){
        const start=r.end,end=next.r.start,active=isToday&&mins>=start&&mins<end,done=isToday&&mins>=end;
        const br=document.createElement('div'); br.className=`schedule-ref-break ${active?'current ':''}${done?'past':''}`;
        br.innerHTML=`<div class="schedule-ref-break-rail"><span></span></div><div class="schedule-ref-break-card"><span><i class="fa-solid fa-mug-hot"></i> Перемена — ${end-start} минут</span><time>${String(Math.floor(start/60)).padStart(2,'0')}:${String(start%60).padStart(2,'0')} – ${String(Math.floor(end/60)).padStart(2,'0')}:${String(end%60).padStart(2,'0')}</time>${active?'<b>Идёт</b>':done?'<b>Завершена</b>':''}</div>`;
        container.appendChild(br);
      }
    });
}

function getCurrentScheduleList() {
    return (currentScheduleWeekType === 'numerator' ? scheduleDataNumerator : scheduleDataDenominator)[currentScheduleDay];
}

window.openScheduleEditor = function(index) {
    if (sessionStorage.getItem('toe_can_schedule') !== '1') { showToast('Нет права на редактирование расписания'); return; }
    editingScheduleIndex = index;
    fillScheduleEditorDatalists();
    const item = index >= 0 ? getCurrentScheduleList()[index] : {time:'',breakDuration:'',subject:'',room:'',teacher:'',isClassHour:false,changeType:'normal',changeNote:'',cancelled:false};
    scheduleEditorOriginal = cloneScheduleItem(item);
    scheduleChangeNoteManuallyEdited = false;
    document.getElementById('schedule-editor-title').innerText = index >= 0 ? 'Редактирование пары' : 'Добавление пары';
    document.getElementById('edit-time').value = item.time || '';
    document.getElementById('edit-break').value = item.breakDuration || '';
    document.getElementById('edit-subject').value = item.subject || '';
    document.getElementById('edit-room').value = item.room || '';
    document.getElementById('edit-teacher').value = item.teacher || '';
    document.getElementById('edit-class-hour').checked = !!item.isClassHour;
    document.getElementById('edit-change-type').value = index < 0 ? 'normal' : (item.cancelled ? 'cancel' : (item.changeType || 'normal'));
    document.getElementById('edit-change-note').value = item.changeNote || '';
    if (item.changeNote) scheduleChangeNoteManuallyEdited = true;
    document.getElementById('schedule-delete-btn').classList.toggle('hidden', index < 0);
    const modal=document.getElementById('schedule-editor-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    window.onScheduleChangeTypeChanged();
    if (item.changeNote) {
        document.getElementById('edit-change-note').value = item.changeNote;
        scheduleChangeNoteManuallyEdited = true;
    }
};

window.closeScheduleEditor = function() {
    const modal=document.getElementById('schedule-editor-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
};

window.saveScheduleLesson = async function() {
    if (sessionStorage.getItem('toe_can_schedule') !== '1') return;
    const list=getCurrentScheduleList();
    if (!list) { showToast('Не удалось определить день расписания'); return; }
    const changeType = document.getElementById('edit-change-type')?.value || 'normal';
    const item={
        time:document.getElementById('edit-time').value.trim(),
        breakDuration:document.getElementById('edit-break').value.trim(),
        subject:document.getElementById('edit-subject').value.trim(),
        room:document.getElementById('edit-room').value.trim(),
        teacher:document.getElementById('edit-teacher').value.trim(),
        isClassHour:document.getElementById('edit-class-hour').checked,
        changeType,
        changeNote:document.getElementById('edit-change-note')?.value.trim() || '',
        cancelled:changeType === 'cancel',
        changedAt: changeType === 'normal' ? '' : new Date().toISOString()
    };
    if(!item.subject || !item.time){showToast('Укажите предмет и время');return;}
    if (changeType !== 'normal' && !item.changeNote) item.changeNote = buildScheduleChangeNote(changeType);
    const oldItem = editingScheduleIndex >= 0 ? list[editingScheduleIndex] : null;
    if(editingScheduleIndex>=0) list[editingScheduleIndex]=item; else list.push(item);
    try {
        await saveScheduleData();
        window.closeScheduleEditor();
        renderSchedule(currentScheduleDay);
        if (window.__scheduleDebug) window.__scheduleDebug.lastSaveOk = true;
        showToast(changeType === 'cancel' ? 'Отмена пары сохранена в облако' : 'Расписание сохранено в облако');
    } catch (e) {
        if (editingScheduleIndex >= 0) list[editingScheduleIndex] = oldItem; else list.pop();
        renderSchedule(currentScheduleDay);
        console.error('Schedule save failed:', e);
        if (window.__scheduleDebug) window.__scheduleDebug.lastSaveOk = false;
        showToast('Ошибка сохранения расписания');
    }
};

window.moveScheduleLesson = async function(index, delta) {
    if (sessionStorage.getItem('toe_can_schedule') !== '1') return;
    const list = getCurrentScheduleList();
    if (!list || !Number.isInteger(index) || !Number.isInteger(delta)) return;
    const target = index + delta;
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
    renderSchedule(currentScheduleDay);
    try {
        await saveScheduleData();
        showToast('Порядок пар сохранён в облако');
    } catch (e) {
        [list[index], list[target]] = [list[target], list[index]];
        renderSchedule(currentScheduleDay);
        console.error('Schedule reorder failed:', e);
        showToast('Не удалось сохранить порядок пар');
    }
};

window.deleteScheduleLesson = async function() {
    if (sessionStorage.getItem('toe_can_schedule') !== '1') return;
    const list=getCurrentScheduleList();
    if(editingScheduleIndex<0 || !list)return;
    if(!confirm('Удалить эту пару из расписания?'))return;
    const removed=list.splice(editingScheduleIndex,1)[0];
    try {
        await saveScheduleData();
        window.closeScheduleEditor();
        renderSchedule(currentScheduleDay);
        showToast('Пара удалена из расписания');
    } catch (e) {
        list.splice(editingScheduleIndex,0,removed);
        renderSchedule(currentScheduleDay);
        console.error('Schedule delete failed:', e);
        if (window.__scheduleDebug) window.__scheduleDebug.lastSaveOk = false;
        showToast('Ошибка сохранения расписания');
    }
};

function saveScheduleHistorySnapshot() {
    try {
        const history = JSON.parse(localStorage.getItem('toe_schedule_history') || '[]');
        history.unshift({
            savedAt: new Date().toISOString(),
            num: scheduleDataNumerator,
            den: scheduleDataDenominator
        });
        localStorage.setItem('toe_schedule_history', JSON.stringify(history.slice(0, 50)));
    } catch (e) { console.warn('Не удалось сохранить историю расписания', e); }
}

export async function saveScheduleData(){
    saveScheduleHistorySnapshot();
    const num = JSON.stringify(scheduleDataNumerator);
    const den = JSON.stringify(scheduleDataDenominator);
    await savePersistentValue('toe_schedule_num', num);
    await savePersistentValue('toe_schedule_den', den);
    await savePersistentValue('toe_schedule_last_saved', new Date().toISOString());

    const { isCloudConnected, db, auth } = getCloudState();
    if (!isCloudConnected || !db || !auth?.currentUser) {
        throw new Error('Firebase не подключён или пользователь не авторизован');
    }

    const updatedAt = new Date().toISOString();
    lastScheduleLocalWriteAt = updatedAt;
    try {
        const ref = doc(db, ...CLOUD_ROOT, 'schedule', 'main');
        await setDoc(ref, {
            numerator: scheduleDataNumerator,
            denominator: scheduleDataDenominator,
            updatedAt
        }, { merge: false });

        const verify = await getDoc(ref, { source: 'server' });
        if (!verify.exists()) throw new Error('Firebase не подтвердил сохранение расписания');
        const verified = verify.data() || {};
        if (String(verified.updatedAt || '') !== updatedAt) {
            throw new Error('Firebase вернул другую версию расписания');
        }
        lastScheduleAppliedUpdatedAt = updatedAt;
        dependencies.setWriteDiagnostic?.(true, `Расписание сохранено и подтверждено сервером: ${updatedAt}`);
        dependencies.diagLog?.('Firestore SCHEDULE WRITE VERIFIED', {updatedAt});
        window.__scheduleLastSaveOk = true;
        window.__scheduleLastSaveAt = updatedAt;
        if (window.__scheduleDebug) {
            window.__scheduleDebug.lastUpdatedAt = updatedAt;
            window.__scheduleDebug.lastSource = 'Firestore (подтверждено сервером)';
        }
    } catch (e) {
        window.__scheduleLastSaveOk = false;
        const detail = e?.code ? `${e.code}: ${e.message}` : String(e);
        dependencies.setWriteDiagnostic?.(false, detail);
        dependencies.diagLog?.('Firestore SCHEDULE WRITE ERROR', detail);
        console.error('Cloud schedule save failed:', e);
        throw e;
    }
    try { await dependencies.createAutomaticBackup?.(); } catch (e) { console.warn('Автоматическая резервная копия расписания не создана', e); }
    dependencies.updateBackupStatus?.();
    return true;
}

export async function loadScheduleData(){
    try {
        let num = localStorage.getItem('toe_schedule_num');
        let den = localStorage.getItem('toe_schedule_den');
        if (!num) { num = await dbGet('toe_schedule_num'); if (num) localStorage.setItem('toe_schedule_num', num); }
        if (!den) { den = await dbGet('toe_schedule_den'); if (den) localStorage.setItem('toe_schedule_den', den); }
        const parsedNum = num ? JSON.parse(num) : null;
        const parsedDen = den ? JSON.parse(den) : null;
        if (parsedNum) Object.keys(scheduleDataNumerator).forEach(k => { if (Array.isArray(parsedNum[k])) scheduleDataNumerator[k] = parsedNum[k]; });
        if (parsedDen) Object.keys(scheduleDataDenominator).forEach(k => { if (Array.isArray(parsedDen[k])) scheduleDataDenominator[k] = parsedDen[k]; });
        const { isCloudConnected, db, auth } = getCloudState();
        if (isCloudConnected && db && auth?.currentUser) {
            try {
                const snap = await getDoc(doc(db, ...CLOUD_ROOT, 'schedule', 'main'));
                if (snap.exists()) {
                    const data = snap.data();
                    if (data.numerator) {
                        Object.keys(scheduleDataNumerator).forEach(k => delete scheduleDataNumerator[k]);
                        Object.assign(scheduleDataNumerator, data.numerator);
                    }
                    if (data.denominator) {
                        Object.keys(scheduleDataDenominator).forEach(k => delete scheduleDataDenominator[k]);
                        Object.assign(scheduleDataDenominator, data.denominator);
                    }
                    localStorage.setItem('toe_schedule_num', JSON.stringify(scheduleDataNumerator));
                    localStorage.setItem('toe_schedule_den', JSON.stringify(scheduleDataDenominator));
                }
            } catch (e) { console.warn('Не удалось загрузить облачное расписание', e); }
        }
    } catch(e) { console.warn('Не удалось загрузить изменённое расписание', e); }
}

export function applyCloudScheduleData(data, source = 'cloud') {
    if (!data) return false;
    const remoteUpdatedAt = String(data.updatedAt || '');
    if (remoteUpdatedAt && lastScheduleLocalWriteAt && remoteUpdatedAt < lastScheduleLocalWriteAt) return false;
    if (remoteUpdatedAt && lastScheduleAppliedUpdatedAt && remoteUpdatedAt < lastScheduleAppliedUpdatedAt) return false;

    let changed = false;
    if (data.numerator && JSON.stringify(data.numerator) !== JSON.stringify(scheduleDataNumerator)) {
        Object.keys(scheduleDataNumerator).forEach(k => delete scheduleDataNumerator[k]);
        Object.assign(scheduleDataNumerator, data.numerator);
        changed = true;
    }
    if (data.denominator && JSON.stringify(data.denominator) !== JSON.stringify(scheduleDataDenominator)) {
        Object.keys(scheduleDataDenominator).forEach(k => delete scheduleDataDenominator[k]);
        Object.assign(scheduleDataDenominator, data.denominator);
        changed = true;
    }
    if (remoteUpdatedAt) lastScheduleAppliedUpdatedAt = remoteUpdatedAt;

    if (changed) {
        localStorage.setItem('toe_schedule_num', JSON.stringify(scheduleDataNumerator));
        localStorage.setItem('toe_schedule_den', JSON.stringify(scheduleDataDenominator));
        renderSchedule(currentScheduleDay);
        if (window.__scheduleDebug) {
            window.__scheduleDebug.lastSource = source;
            window.__scheduleDebug.lastUpdatedAt = remoteUpdatedAt;
            window.__scheduleDebug.lastSnapshotAt = new Date().toISOString();
        }
    }
    return changed;
}

export function subscribeToSchedule() {
    const { isCloudConnected, db, auth } = getCloudState();
    if (!isCloudConnected || !db || !auth?.currentUser) return false;
    if (scheduleUnsubscribe) { try { scheduleUnsubscribe(); } catch(e) {} scheduleUnsubscribe = null; }
    if (scheduleReconnectTimer) { clearTimeout(scheduleReconnectTimer); scheduleReconnectTimer = null; }
    window.__scheduleListenerActive = false;
    const ref = doc(db, ...CLOUD_ROOT, 'schedule', 'main');

    try {
        scheduleUnsubscribe = onSnapshot(ref, { includeMetadataChanges: true }, snap => {
            window.__scheduleListenerActive = true;
            scheduleReconnectAttempt = 0;
            const source = snap.metadata?.hasPendingWrites
                ? 'этот браузер → Firestore (pending)'
                : (snap.metadata?.fromCache ? 'кэш Firestore' : 'Firestore (сервер)');
            if (window.__scheduleDebug) {
                window.__scheduleDebug.lastSnapshotAt = new Date().toISOString();
                window.__scheduleDebug.lastSource = source;
            }
            if (!snap.exists()) return;
            if (snap.metadata?.hasPendingWrites && !snap.metadata?.fromCache) return;
            applyCloudScheduleData(snap.data() || {}, 'realtime');
        }, err => {
            window.__scheduleListenerActive = false;
            console.warn('Realtime schedule error', err);
            scheduleReconnectAttempt = Math.min(scheduleReconnectAttempt + 1, 8);
            const delay = Math.min(1000 * Math.pow(2, scheduleReconnectAttempt - 1), 15000);
            if (scheduleReconnectTimer) clearTimeout(scheduleReconnectTimer);
            scheduleReconnectTimer = setTimeout(() => subscribeToSchedule(), delay);
        });
        window.__scheduleListenerActive = true;
        dependencies.setRealtimeDiagnostic?.('onSnapshot расписания подключён; включена резервная серверная проверка.');
        return true;
    } catch (e) {
        window.__scheduleListenerActive = false;
        console.warn('Schedule listener registration error', e);
        scheduleReconnectAttempt = Math.min(scheduleReconnectAttempt + 1, 8);
        const delay = Math.min(1000 * Math.pow(2, scheduleReconnectAttempt - 1), 15000);
        scheduleReconnectTimer = setTimeout(() => subscribeToSchedule(), delay);
        return false;
    }
}

export function startSchedulePolling() {
    if (schedulePollTimer) clearInterval(schedulePollTimer);
    const { isCloudConnected, db, auth } = getCloudState();
    if (!isCloudConnected || !db || !auth?.currentUser) return;
    const pollSchedule = async () => {
        try {
            const snap = await getDoc(doc(db, ...CLOUD_ROOT, 'schedule', 'main'), { source: 'server' });
            if (!snap.exists()) return;
            applyCloudScheduleData(snap.data() || {}, 'polling');
        } catch (e) {
            console.warn('Schedule fallback sync error', e);
        }
    };
    pollSchedule();
    schedulePollTimer = setInterval(pollSchedule, 2500);
}
