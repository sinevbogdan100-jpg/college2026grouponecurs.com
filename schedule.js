import { doc, setDoc, getDoc, onSnapshot } from "./firebase.js?v=20261003-step8-root";
import { getWeekTypeForDate } from "./utils.js?v=20261003-step8-root";
import { dbGet, savePersistentValue } from "./storage.js?v=20261003-step8-root";

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

export function syncScheduleToToday() {
    const now = new Date();
    const day = now.getDay();
    const dayKeys = {1:'mon', 2:'tue', 3:'wed', 4:'thu', 5:'fri'};
    // В выходные расписание автоматически остаётся на пятнице.
    currentScheduleDay = dayKeys[day] || 'fri';
    currentScheduleWeekType = getWeekTypeForDate(now);
    try {
        localStorage.setItem('toe_current_schedule_day', currentScheduleDay);
        localStorage.setItem('toe_schedule_week_type', currentScheduleWeekType);
    } catch(e) {}
    ['mon', 'tue', 'wed', 'thu', 'fri'].forEach(d => {
        const btn = document.getElementById(`tab-${d}`);
        if (btn) {
            if (d === currentScheduleDay) {
                btn.className = "py-2 text-xs font-semibold rounded-lg transition bg-slate-900 text-white";
            } else {
                btn.className = "py-2 text-xs font-semibold rounded-lg transition text-slate-600 hover:bg-slate-100";
            }
        }
    });
    const btnNum = document.getElementById('sched-btn-num');
    const btnDen = document.getElementById('sched-btn-den');
    if (btnNum && btnDen) {
        if (currentScheduleWeekType === 'numerator') {
            btnNum.className = "w-full px-2 py-1 rounded-lg font-bold transition text-[10px] bg-indigo-600 text-white shadow-[0_0_12px_rgba(79,70,229,0.55)]";
            btnDen.className = "w-full px-2 py-1 rounded-lg font-bold transition text-[10px] text-slate-500 hover:text-slate-900";
        } else {
            btnNum.className = "w-full px-2 py-1 rounded-lg font-bold transition text-[10px] text-slate-500 hover:text-slate-900";
            btnDen.className = "w-full px-2 py-1 rounded-lg font-bold transition text-[10px] bg-indigo-600 text-white shadow-[0_0_12px_rgba(79,70,229,0.55)]";
        }
    }
}

window.setScheduleWeekType = function(type) {
    currentScheduleWeekType = type;
    try { localStorage.setItem('toe_schedule_week_type', type); } catch(e) {}
    const btnNum = document.getElementById('sched-btn-num');
    const btnDen = document.getElementById('sched-btn-den');
    if (btnNum && btnDen) {
        if (type === 'numerator') {
            btnNum.className = "w-full px-2 py-1 rounded-lg font-bold transition text-[10px] bg-indigo-600 text-white shadow-[0_0_12px_rgba(79,70,229,0.55)]";
            btnDen.className = "w-full px-2 py-1 rounded-lg font-bold transition text-[10px] text-slate-500 hover:text-slate-900";
        } else {
            btnNum.className = "w-full px-2 py-1 rounded-lg font-bold transition text-[10px] text-slate-500 hover:text-slate-900";
            btnDen.className = "w-full px-2 py-1 rounded-lg font-bold transition text-[10px] bg-indigo-600 text-white shadow-[0_0_12px_rgba(79,70,229,0.55)]";
        }
    }
    renderSchedule(currentScheduleDay);
};

window.setScheduleDay = function(day) {
    currentScheduleDay = day;
    try { localStorage.setItem('toe_current_schedule_day', day); } catch(e) {}
    ['mon', 'tue', 'wed', 'thu', 'fri'].forEach(d => {
        const btn = document.getElementById(`tab-${d}`);
        if (btn) {
            if (d === day) {
                btn.className = "py-2 text-xs font-semibold rounded-lg transition bg-slate-900 text-white";
            } else {
                btn.className = "py-2 text-xs font-semibold rounded-lg transition text-slate-600 hover:bg-slate-100";
            }
        }
    });
    renderSchedule(day);
};

export function renderSchedule(dayKey = currentScheduleDay) {
    const container = document.getElementById('schedule-container');
    if (!container) return;
    container.innerHTML = '';
    const source = currentScheduleWeekType === 'numerator' ? scheduleDataNumerator : scheduleDataDenominator;
    const list = source[dayKey] || [];
    let lessonCounter = 1;
    if (sessionStorage.getItem('toe_admin') === '1') {
        const hint = document.createElement('div');
        hint.className = 'bg-indigo-50 border border-indigo-100 text-indigo-800 rounded-xl p-2.5 text-[11px]';
        hint.innerHTML = '<i class="fa-solid fa-pen-to-square mr-1"></i> Режим администратора: можно изменять, удалять и добавлять пары.';
        container.appendChild(hint);
    }
    list.forEach((item, index) => {
        const card = document.createElement('div');
        card.className = "bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs space-y-1.5";
        const badgeText = item.isClassHour ? `Классный час (${item.time})` : `Пара ${lessonCounter++} (${item.time})`;
        const badgeColor = item.isClassHour ? "text-amber-700 bg-amber-50" : "text-indigo-600 bg-indigo-50";
        card.innerHTML = `
            <div class="flex items-center justify-between gap-2">
                <span class="text-[10px] font-bold ${badgeColor} px-2 py-0.5 rounded-md border border-indigo-100">${badgeText}</span>
                <div class="flex items-center gap-2"><span class="text-[10px] text-slate-400">${item.breakDuration || ''}</span><div class="schedule-admin-actions"><button onclick="openScheduleEditor(${index})" class="px-2 py-1 rounded-md bg-indigo-50 text-indigo-700 text-[10px] font-semibold border border-indigo-100">Изменить</button></div></div>
            </div>
            <div><h3 class="font-bold text-sm text-slate-900">${item.subject}</h3><div class="flex items-center gap-3 mt-1 text-xs text-slate-500"><span><i class="fa-solid fa-location-dot text-indigo-500 mr-1"></i>${item.room}</span>${item.teacher ? `<span><i class="fa-solid fa-chalkboard-user text-indigo-500 mr-1"></i>${item.teacher}</span>` : ''}</div></div>`;
        container.appendChild(card);
    });
}

function getCurrentScheduleList() {
    return (currentScheduleWeekType === 'numerator' ? scheduleDataNumerator : scheduleDataDenominator)[currentScheduleDay];
}

window.openScheduleEditor = function(index) {
    if (sessionStorage.getItem('toe_admin') !== '1') { showToast('Редактирование расписания доступно только администратору'); return; }
    editingScheduleIndex = index;
    const item = index >= 0 ? getCurrentScheduleList()[index] : {time:'',breakDuration:'',subject:'',room:'',teacher:'',isClassHour:false};
    document.getElementById('schedule-editor-title').innerText = index >= 0 ? 'Редактирование пары' : 'Добавление пары';
    document.getElementById('edit-time').value = item.time || '';
    document.getElementById('edit-break').value = item.breakDuration || '';
    document.getElementById('edit-subject').value = item.subject || '';
    document.getElementById('edit-room').value = item.room || '';
    document.getElementById('edit-teacher').value = item.teacher || '';
    document.getElementById('edit-class-hour').checked = !!item.isClassHour;
    document.getElementById('schedule-delete-btn').classList.toggle('hidden', index < 0);
    const modal=document.getElementById('schedule-editor-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
};

window.closeScheduleEditor = function() {
    const modal=document.getElementById('schedule-editor-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
};

window.saveScheduleLesson = async function() {
    if (sessionStorage.getItem('toe_admin') !== '1') return;
    const list=getCurrentScheduleList();
    if (!list) { showToast('Не удалось определить день расписания'); return; }
    const item={time:document.getElementById('edit-time').value.trim(),breakDuration:document.getElementById('edit-break').value.trim(),subject:document.getElementById('edit-subject').value.trim(),room:document.getElementById('edit-room').value.trim(),teacher:document.getElementById('edit-teacher').value.trim(),isClassHour:document.getElementById('edit-class-hour').checked};
    if(!item.subject || !item.time){showToast('Укажите предмет и время');return;}
    const oldItem = editingScheduleIndex >= 0 ? list[editingScheduleIndex] : null;
    if(editingScheduleIndex>=0) list[editingScheduleIndex]=item; else list.push(item);
    try {
        await saveScheduleData();
        window.closeScheduleEditor();
        renderSchedule(currentScheduleDay);
        if (window.__scheduleDebug) window.__scheduleDebug.lastSaveOk = true;
        showToast('Расписание сохранено в облако');
    } catch (e) {
        if (editingScheduleIndex >= 0) list[editingScheduleIndex] = oldItem; else list.pop();
        renderSchedule(currentScheduleDay);
        console.error('Schedule save failed:', e);
        if (window.__scheduleDebug) window.__scheduleDebug.lastSaveOk = false;
        showToast('Ошибка сохранения расписания');
    }
};

window.deleteScheduleLesson = async function() {
    if (sessionStorage.getItem('toe_admin') !== '1') return;
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
