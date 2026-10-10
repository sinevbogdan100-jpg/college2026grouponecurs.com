import { SCHEDULE_SCHEMA_VERSION, scheduleDateKey, scheduleForDate, ensureDateSchedule, migrateLegacySchedule } from './schedule-dates.js?v=20261010-date-overrides-v2';
import { interfaceLocale, translateUI } from "./i18n.js?v=20261010-date-overrides-v2";
import { doc, setDoc, getDoc, onSnapshot } from "./firebase.js?v=20261005-group-tools-v2";
import { getWeekTypeForDate } from "./utils.js?v=20261004-performance-v1";
import { dbGet, dbDelete, savePersistentValue } from "./storage.js?v=20261004-performance-v1";
import { scheduleShareSnapshot } from './group-tools-data.js?v=20261010-date-overrides-v2';

const CLOUD_ROOT = ['toe_group', 'shared'];
const PENDING_SCHEDULE_KEY = 'toe_pending_schedule_v1';

let dependencies = {
    getCloudState: () => ({ isCloudConnected: false, db: null, auth: null }),
    showToast: () => {},
    reportError: () => null,
    createAutomaticBackup: async () => {},
    updateBackupStatus: () => {},
    setRealtimeDiagnostic: () => {},
    setWriteDiagnostic: () => {},
    diagLog: () => {},
    publishScheduleChange: async () => false,
    recordActionHistory: () => {},
    confirmActionHistory: () => {}
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

function animateScheduleRefresh() {
    const container = document.getElementById('schedule-container');
    const heading = document.getElementById('schedule-day-heading');
    window.animateUiRefresh?.(container, 'ui-refreshing', 220);
    window.animateUiRefresh?.(heading, 'ui-refreshing-soft', 180);
}

function reportError(scope, error, options = {}) {
    const reported = dependencies.reportError?.(scope, error, options);
    if (!reported && options.fallback) showToast(options.fallback);
    return reported;
}

function readPendingSchedule() {
    try {
        const raw = localStorage.getItem(PENDING_SCHEDULE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (_) {
        return null;
    }
}

async function storePendingSchedule(payload, changeEvent = null) {
    const previous = readPendingSchedule();
    const events = Array.isArray(previous?.events) ? [...previous.events] : [];
    if (changeEvent?.id && !events.some(item => item?.id === changeEvent.id)) events.push(changeEvent);
    const pending = {
        ...payload,
        events: events.slice(-20),
        queuedAt: new Date().toISOString()
    };
    await savePersistentValue(PENDING_SCHEDULE_KEY, JSON.stringify(pending));
    return pending;
}

async function clearPendingSchedule() {
    localStorage.removeItem(PENDING_SCHEDULE_KEY);
    try { await dbDelete(PENDING_SCHEDULE_KEY); } catch (_) {}
}

async function publishPendingScheduleEvents(events = []) {
    for (const event of events) {
        try { await dependencies.publishScheduleChange?.(event); }
        catch (e) { console.warn('Pending schedule notification publish failed', e); }
    }
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

const scheduleDefaults = JSON.parse(JSON.stringify({numerator:scheduleDataNumerator,denominator:scheduleDataDenominator}));
let scheduleDateOverrides = {};
let scheduleLegacyArchive = null;
let scheduleMigrationNeeded = false;
let scheduleEditScope = 'date';
function schedulePayload() {
    return { numerator:scheduleDataNumerator,denominator:scheduleDataDenominator,dateOverrides:scheduleDateOverrides,scheduleSchemaVersion:SCHEDULE_SCHEMA_VERSION,legacyScheduleArchive:scheduleLegacyArchive };
}
function installSchedulePayload(input) {
    const result = migrateLegacySchedule(input, scheduleDefaults);
    const data = result.data;
    for (const [key,target] of [['numerator',scheduleDataNumerator],['denominator',scheduleDataDenominator]]) {
        if (data[key]) { Object.keys(target).forEach(k=>delete target[k]); Object.assign(target,data[key]); }
    }
    scheduleDateOverrides = data.dateOverrides || {};
    scheduleLegacyArchive = data.legacyScheduleArchive || null;
    scheduleMigrationNeeded = result.migrated;
    return data;
}
async function persistScheduleMigration() {
    if (!scheduleMigrationNeeded || sessionStorage.getItem('toe_can_schedule') !== '1' || readPendingSchedule()) return;
    const cloud = getCloudState();
    if (!navigator.onLine || !cloud.isCloudConnected || !cloud.db || !cloud.auth?.currentUser) return;
    scheduleMigrationNeeded = false;
    // The normal verified save retains a backup and uses the existing editor permission.
    try { await saveScheduleData(); } catch(error) { scheduleMigrationNeeded = true; console.warn('Schedule migration save',error); }
}
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
let scheduleAuditBaseline = JSON.parse(JSON.stringify(schedulePayload()));

window.__scheduleDebug = window.__scheduleDebug || { lastSnapshotAt:'', lastUpdatedAt:'', lastSource:'', lastSaveOk:false };
window.__scheduleListenerActive = false;

const SCHEDULE_DAY_KEYS = ['mon','tue','wed','thu','fri'];
const SCHEDULE_DAY_INDEX = { mon:0, tue:1, wed:2, thu:3, fri:4 };
let scheduleReferenceDate = new Date();

function scheduleMidnight(date = new Date()) {
    const d = new Date(date);
    d.setHours(0,0,0,0);
    return d;
}

function scheduleNearestWorkingDate(date = new Date()) {
    const d = scheduleMidnight(date);
    if (d.getDay() === 6) d.setDate(d.getDate() + 2);
    if (d.getDay() === 0) d.setDate(d.getDate() + 1);
    return d;
}

function scheduleMonday(date = scheduleReferenceDate) {
    const d = scheduleMidnight(date);
    const day = d.getDay() === 0 ? 7 : d.getDay();
    d.setDate(d.getDate() - day + 1);
    return d;
}

function scheduleDateForDay(dayKey, anchor = scheduleReferenceDate) {
    const d = scheduleMonday(anchor);
    d.setDate(d.getDate() + (SCHEDULE_DAY_INDEX[dayKey] ?? 0));
    return d;
}

function scheduleSameDay(a, b) {
    return !!a && !!b
        && a.getFullYear() === b.getFullYear()
        && a.getMonth() === b.getMonth()
        && a.getDate() === b.getDate();
}

function scheduleFormatFullDate(date) {
    const text = date.toLocaleDateString(interfaceLocale(), { weekday:'long', day:'numeric', month:'long', year:'numeric' });
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

function scheduleFormatShortDate(date) {
    return date.toLocaleDateString(interfaceLocale(), { day:'numeric', month:'short' }).replace(/\s*г\.?$/i,'');
}

function scheduleFormatRange(date = scheduleReferenceDate) {
    const monday = scheduleMonday(date);
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);
    const left = monday.toLocaleDateString(interfaceLocale(), { day:'numeric' });
    const right = friday.toLocaleDateString(interfaceLocale(), { day:'numeric', month:'long', year:'numeric' });
    return `${left} – ${right}`;
}

function scheduleEscape(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
        '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
    })[ch]);
}

function scheduleParseRange(value) {
    const match = String(value || '').match(/(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})/);
    if (!match) return null;
    return {
        start: Number(match[1]) * 60 + Number(match[2]),
        end: Number(match[3]) * 60 + Number(match[4])
    };
}

function scheduleClock(minutes) {
    const safe = Math.max(0, Number(minutes) || 0);
    const h = Math.floor(safe / 60);
    const m = safe % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

function scheduleRemainingLabel(minutes) {
    const value = Math.max(0, Math.ceil(Number(minutes) || 0));
    if (value < 60) return `${value} минут`;
    const h = Math.floor(value / 60);
    const m = value % 60;
    return m ? `${h} ч ${m} мин` : `${h} ч`;
}

function scheduleReferenceIsActualToday() {
    const today = scheduleMidnight(new Date());
    const selected = scheduleDateForDay(currentScheduleDay);
    return scheduleSameDay(selected, today) && currentScheduleWeekType === getWeekTypeForDate(today);
}

function updateScheduleReferenceControls() {
    document.getElementById('sched-btn-num')?.classList.toggle('active', currentScheduleWeekType === 'numerator');
    document.getElementById('sched-btn-den')?.classList.toggle('active', currentScheduleWeekType === 'denominator');

    SCHEDULE_DAY_KEYS.forEach(day => {
        const btn = document.getElementById(`tab-${day}`);
        btn?.classList.toggle('active', day === currentScheduleDay);
        const dateEl = document.getElementById(`date-${day}`);
        if (dateEl) dateEl.textContent = scheduleFormatShortDate(scheduleDateForDay(day));
    });

    const selectedDate = scheduleDateForDay(currentScheduleDay);
    document.getElementById('schedule-edit-scope-box')?.classList.toggle('hidden',sessionStorage.getItem('toe_can_schedule') !== '1');
    const scopeText = scheduleEditScope === 'template' ? translateUI('Постоянное расписание') : translateUI('Только на выбранную дату');
    for (const id of ['schedule-scope-hint','schedule-editor-scope','schedule-bell-scope']) {
        const node = document.getElementById(id);
        if (node) node.textContent = `${scopeText} · ${scheduleFormatFullDate(selectedDate)}`;
    }
    const dateEl = document.getElementById('schedule-reference-date');
    const rangeEl = document.getElementById('schedule-week-range');
    if (dateEl) dateEl.textContent = scheduleFormatFullDate(selectedDate);
    if (rangeEl) rangeEl.textContent = scheduleFormatRange(selectedDate);

    const legacyType = document.getElementById('home-week-banner-text');
    const legacyDates = document.getElementById('home-week-dates');
    if (legacyType) legacyType.textContent = currentScheduleWeekType === 'numerator' ? 'Числитель' : 'Знаменатель';
    if (legacyDates) legacyDates.textContent = scheduleFormatRange(selectedDate);
}

function buildScheduleEntries(list) {
    let normalNumber = 0;
    return (Array.isArray(list) ? list : []).map((item, index) => ({
        item,
        index,
        range: scheduleParseRange(item?.time),
        number: item?.isClassHour ? 'КЧ' : String(++normalNumber)
    }));
}

function scheduleCurrentState(entries) {
    if (!scheduleReferenceIsActualToday()) return { type:'other-day' };
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();

    const active = entries.find(entry =>
        entry.range && !entry.item?.cancelled && minutes >= entry.range.start && minutes < entry.range.end
    );
    if (active) return { type:'lesson', entry:active, minutes };

    for (let i=0; i<entries.length-1; i++) {
        const current = entries[i];
        const next = entries[i+1];
        if (!current.range || !next.range) continue;
        if (next.range.start <= current.range.end) continue;
        if (minutes >= current.range.end && minutes < next.range.start) {
            return {
                type:'break',
                previous:current,
                next,
                start:current.range.end,
                end:next.range.start,
                minutes
            };
        }
    }

    const timed = entries.filter(entry => entry.range && !entry.item?.cancelled);
    if (!timed.length) return { type:'empty', minutes };
    if (minutes < timed[0].range.start) return { type:'before', next:timed[0], minutes };
    if (minutes >= timed[timed.length-1].range.end) return { type:'after', previous:timed[timed.length-1], minutes };
    return { type:'idle', minutes };
}

function renderScheduleSummary(entries, selectedDate) {
    const host = document.getElementById('schedule-live-summary');
    if (!host) return;
    const state = scheduleCurrentState(entries);
    if (state.type === 'other-day') {
        host.innerHTML = '';
        return;
    }

    let mode = 'neutral';
    let icon = 'fa-book-open';
    let title = 'Сегодня';
    let stateTitle = 'Занятия';
    let stateIcon = '';
    let stateTime = '';
    let footer = '';
    let progress = 0;

    if (state.type === 'lesson') {
        mode = 'lesson';
        stateTitle = state.entry.item?.isClassHour ? 'Классный час (идёт)' : `${state.entry.number} пара (идёт)`;
        stateTime = String(state.entry.item?.time || '');
        const duration = Math.max(1, state.entry.range.end - state.entry.range.start);
        progress = Math.max(0, Math.min(100, ((state.minutes - state.entry.range.start) / duration) * 100));
        footer = `До конца пары: ${scheduleRemainingLabel(state.entry.range.end - state.minutes)}`;
    } else if (state.type === 'break') {
        mode = 'break';
        stateTitle = 'Перемена';
        stateIcon = 'fa-mug-hot';
        stateTime = `${scheduleClock(state.start)} – ${scheduleClock(state.end)}`;
        const duration = Math.max(1, state.end - state.start);
        progress = Math.max(0, Math.min(100, ((state.minutes - state.start) / duration) * 100));
        footer = `До следующей пары: ${scheduleRemainingLabel(state.end - state.minutes)}`;
    } else if (state.type === 'before') {
        stateTitle = 'До начала занятий';
        stateTime = String(state.next.item?.time || '');
        footer = `До первой пары: ${scheduleRemainingLabel(state.next.range.start - state.minutes)}`;
    } else if (state.type === 'after') {
        mode = 'done';
        stateTitle = 'Занятия завершены';
        progress = 100;
        footer = 'На сегодня пары закончились';
    } else if (state.type === 'empty') {
        stateTitle = 'Пар сегодня нет';
        footer = 'Расписание на этот день пустое';
    }

    host.innerHTML = `
        <section class="schedule-live-card ${mode}">
            <div class="schedule-live-head">
                <div class="schedule-live-today">
                    <span class="schedule-live-icon"><i class="fa-solid ${icon}"></i></span>
                    <div><strong>${title}</strong><span>${scheduleEscape(scheduleFormatFullDate(selectedDate))}</span></div>
                </div>
                <div class="schedule-live-state">
                    <strong>${stateIcon ? `<i class="fa-solid ${stateIcon}"></i>` : ''}${scheduleEscape(stateTitle)}</strong>
                    <span>${scheduleEscape(stateTime)}</span>
                </div>
            </div>
            <div class="schedule-live-progress"><i style="width:${progress}%"></i></div>
            <p>${scheduleEscape(footer)}</p>
        </section>`;
}

function renderScheduleDayHeading(selectedDate) {
    const heading = document.getElementById('schedule-day-heading');
    if (!heading) return;
    if (scheduleReferenceIsActualToday()) {
        heading.innerHTML = '';
        heading.classList.add('hidden');
        return;
    }
    heading.classList.remove('hidden');
    const text = selectedDate.toLocaleDateString(interfaceLocale(), { weekday:'long', day:'numeric', month:'long' });
    heading.textContent = text.charAt(0).toUpperCase() + text.slice(1);
}

export function getCurrentScheduleDay() {
    return currentScheduleDay;
}

export function getCurrentScheduleWeekType() {
    return currentScheduleWeekType;
}

export function getScheduleShareData(mode = 'day') {
    return scheduleShareSnapshot(getScheduleDataForWeek(currentScheduleWeekType, scheduleReferenceDate), currentScheduleDay, currentScheduleWeekType, scheduleReferenceDate, mode);
}

export function getScheduleDataForWeek(type, reference = new Date()) {
    const monday = scheduleMonday(reference);
    return Object.fromEntries(SCHEDULE_DAY_KEYS.map((day,index) => {
        const date = new Date(monday); date.setDate(date.getDate()+index);
        return [day,scheduleForDate(schedulePayload(),date,type)];
    }));
}
window.setScheduleEditScope = function(scope) {
    scheduleEditScope = scope === 'template' ? 'template' : 'date';
    window.closeScheduleEditor?.(); window.closeScheduleBellEditor?.();
    lastScheduleRenderKey = ''; renderSchedule(currentScheduleDay);
};

export function restoreScheduleSelection(savedDay, savedWeek) {
    if (savedWeek === 'numerator' || savedWeek === 'denominator') currentScheduleWeekType = savedWeek;
    if (savedDay && ['mon','tue','wed','thu','fri'].includes(savedDay)) currentScheduleDay = savedDay;
}

export function syncScheduleToToday() {
    const target = scheduleNearestWorkingDate(new Date());
    const dayMap = {1:'mon',2:'tue',3:'wed',4:'thu',5:'fri'};
    scheduleReferenceDate = target;
    currentScheduleDay = dayMap[target.getDay()] || 'mon';
    currentScheduleWeekType = getWeekTypeForDate(target);
    try {
        localStorage.setItem('toe_current_schedule_day', currentScheduleDay);
        localStorage.setItem('toe_schedule_week_type', currentScheduleWeekType);
    } catch(e) {}
    updateScheduleReferenceControls();
}

window.setScheduleWeekType = function(type) {
    if (type !== 'numerator' && type !== 'denominator') return;
    window.closeScheduleEditor?.(); window.closeScheduleBellEditor?.();
    if (getWeekTypeForDate(scheduleReferenceDate) !== type) scheduleReferenceDate.setDate(scheduleReferenceDate.getDate()+(type === 'numerator' ? 7 : -7));
    currentScheduleWeekType = type;
    try { localStorage.setItem('toe_schedule_week_type', type); } catch(e) {}
    updateScheduleReferenceControls();
    renderSchedule(currentScheduleDay);
    animateScheduleRefresh();
};

window.setScheduleDay = function(day) {
    if (!SCHEDULE_DAY_KEYS.includes(day)) return;
    window.closeScheduleEditor?.(); window.closeScheduleBellEditor?.();
    currentScheduleDay = day;
    scheduleReferenceDate = scheduleDateForDay(day);
    try { localStorage.setItem('toe_current_schedule_day', day); } catch(e) {}
    updateScheduleReferenceControls();
    renderSchedule(day);
    animateScheduleRefresh();
};

window.shiftScheduleReferenceDate = function(delta) {
    window.closeScheduleEditor?.(); window.closeScheduleBellEditor?.();
    const step = Number(delta) < 0 ? -1 : 1;
    const previousMonday = scheduleMonday(scheduleReferenceDate).getTime();
    let next = scheduleMidnight(scheduleDateForDay(currentScheduleDay));
    do {
        next.setDate(next.getDate() + step);
    } while (next.getDay() === 0 || next.getDay() === 6);

    scheduleReferenceDate = next;
    const dayMap = {1:'mon',2:'tue',3:'wed',4:'thu',5:'fri'};
    currentScheduleDay = dayMap[next.getDay()] || 'mon';

    if (scheduleMonday(next).getTime() !== previousMonday) {
        currentScheduleWeekType = getWeekTypeForDate(next);
        try { localStorage.setItem('toe_schedule_week_type', currentScheduleWeekType); } catch(e) {}
    }
    try { localStorage.setItem('toe_current_schedule_day', currentScheduleDay); } catch(e) {}
    updateScheduleReferenceControls();
    renderSchedule(currentScheduleDay);
    animateScheduleRefresh();
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

const SCHEDULE_SUBJECT_SUGGESTIONS = Object.freeze([
    'Физика','Иностранный язык','Физическая культура','История Казахстана','Всемирная история',
    'Русский язык','Русский язык и литература','Русская литература','Математика','География',
    'Графика и проектирование','Биология','Химия','Глобальные компетенции',
    'Казахский язык и литература','Информатика','НВП','Классный час'
]);

function buildSubjectCatalog() {
    const catalog = new Map(SCHEDULE_SUBJECT_SUGGESTIONS.map(subject => [subject, { subject, room:'', teacher:'' }]));
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
            option.value = translateUI(item.subject);
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
            option.value = translateUI(value);
            breakList.appendChild(option);
        });
    }
}

function restoreScheduleSubject(value) {
    const text = String(value || '').trim();
    const match = buildSubjectCatalog().find(item =>
        item.subject.toLocaleLowerCase(interfaceLocale()) === text.toLocaleLowerCase(interfaceLocale()) ||
        translateUI(item.subject).toLocaleLowerCase(interfaceLocale()) === text.toLocaleLowerCase(interfaceLocale())
    );
    return match?.subject || text;
}

function restoreScheduleBreak(value) {
    const text = String(value || '').trim();
    const match = text.match(/^(Үзіліс|Үлкен үзіліс): (\d+) минут$/);
    if (match) return `${match[1] === 'Үзіліс' ? 'Перемена' : 'Большая перемена'}: ${match[2]} мин`;
    return text === 'Сабақ аяқталды' ? 'Конец занятий' : text;
}

window.onScheduleSubjectChanged = function(fromTyping = false) {
    const subjectInput = document.getElementById('edit-subject');
    const roomInput = document.getElementById('edit-room');
    const teacherInput = document.getElementById('edit-teacher');
    if (!subjectInput || !roomInput || !teacherInput) return;
    const value = restoreScheduleSubject(subjectInput.value);
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
    if (match) breakInput.value = translateUI(String(match.breakDuration || '').trim());
};
function scheduleMinutesToClock(total) {
    const minutes = ((Number(total) % 1440) + 1440) % 1440;
    return `${String(Math.floor(minutes / 60)).padStart(2,'0')}:${String(minutes % 60).padStart(2,'0')}`;
}

function scheduleClockToMinutes(value) {
    const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const h = Number(match[1]), m = Number(match[2]);
    return h >= 0 && h < 24 && m >= 0 && m < 60 ? h * 60 + m : null;
}

function scheduleBellBreaks() {
    return [...document.querySelectorAll('[data-bell-break]')].map(input => Math.max(0, Number(input.value) || 0));
}

window.renderScheduleBellPreview = function() {
    const preview = document.getElementById('schedule-bell-preview');
    const start = scheduleClockToMinutes(document.getElementById('schedule-bell-start')?.value);
    const duration = Math.max(1, Number(document.getElementById('schedule-bell-duration')?.value) || 60);
    const list = (getCurrentScheduleList() || []).filter(item => !item?.isClassHour);
    if (!preview || start === null) return;
    const breaks = scheduleBellBreaks();
    let cursor = start;
    preview.innerHTML = list.map((item, index) => {
        const finish = cursor + duration;
        const row = `<div class="flex justify-between gap-3"><span>${index + 1}. ${scheduleEscape(item.subject || 'Пара')}</span><b>${scheduleMinutesToClock(cursor)} – ${scheduleMinutesToClock(finish)}</b></div>`;
        cursor = finish + (breaks[index] ?? 10);
        return row;
    }).join('');
};

window.openScheduleBellEditor = function() {
    if (sessionStorage.getItem('toe_can_schedule') !== '1') return;
    const list = (getCurrentScheduleList() || []).filter(item => !item?.isClassHour);
    if (!list.length) { showToast('На выбранный день нет пар'); return; }
    const first = scheduleParseRange(list[0]?.time);
    document.getElementById('schedule-bell-start').value = first ? scheduleClock(first.start) : '08:00';
    document.getElementById('schedule-bell-duration').value = first ? Math.max(1, first.end - first.start) : 60;
    const breaks = document.getElementById('schedule-bell-breaks');
    breaks.innerHTML = list.slice(0, -1).map((item, index) => {
        const current = String(item?.breakDuration || '').match(/(\d+)/);
        const fallback = index === 0 ? 10 : index === 1 ? 20 : 10;
        return `<label>Перемена после ${index + 1} пары<input data-bell-break type="number" inputmode="numeric" min="0" max="120" value="${current ? Number(current[1]) : fallback}" oninput="renderScheduleBellPreview()"></label>`;
    }).join('');
    const modal = document.getElementById('schedule-bell-modal');
    modal.classList.remove('hidden');
    document.body.classList.add('bell-editor-open');
    window.renderScheduleBellPreview();
    modal.querySelector('.bell-editor-close')?.focus({ preventScroll: true });
};

window.closeScheduleBellEditor = function() {
    const modal = document.getElementById('schedule-bell-modal');
    const wasOpen = modal && !modal.classList.contains('hidden');
    modal?.classList.add('hidden');
    document.body.classList.remove('bell-editor-open');
    if (wasOpen) document.getElementById('schedule-bell-btn')?.focus({ preventScroll: true });
};

document.addEventListener('keydown', event => {
    const modal = document.getElementById('schedule-bell-modal');
    if (!modal || modal.classList.contains('hidden')) return;
    if (event.key === 'Escape') { event.preventDefault(); window.closeScheduleBellEditor(); }
    if (event.key === 'Tab') {
        const controls = [...modal.querySelectorAll('button,input')].filter(node => !node.disabled);
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
});

window.saveScheduleBellEditor = async function() {
    if (sessionStorage.getItem('toe_can_schedule') !== '1') return;
    const list = getCurrentScheduleList(true);
    const start = scheduleClockToMinutes(document.getElementById('schedule-bell-start')?.value);
    const duration = Math.max(1, Number(document.getElementById('schedule-bell-duration')?.value) || 0);
    if (!list || start === null || !duration) { showToast('Проверьте время начала и длительность пары'); return; }
    const breaks = scheduleBellBreaks();
    const backup = list.map(cloneScheduleItem);
    let cursor = start, pairIndex = 0;
    list.forEach(item => {
        if (item?.isClassHour) return;
        const finish = cursor + duration;
        const breakMinutes = breaks[pairIndex] ?? 10;
        if (!item.originalTime) item.originalTime = item.time || '';
        item.time = `${scheduleMinutesToClock(cursor)} - ${scheduleMinutesToClock(finish)}`;
        item.breakDuration = pairIndex === list.filter(x => !x?.isClassHour).length - 1 ? 'Конец занятий' : `${pairIndex === 1 && breakMinutes === 20 ? 'Большая перемена' : 'Перемена'}: ${breakMinutes} мин`;
        item.changeType = item.changeType === 'normal' ? 'time' : item.changeType;
        item.changedAt = new Date().toISOString();
        cursor = finish + breakMinutes;
        pairIndex++;
    });
    try {
        const date = scheduleDateForDay(currentScheduleDay);
        const event = {
            id:`bells_${Date.now()}`, type:'schedule_change', changeType:'bells', dayKey:currentScheduleDay,
            weekType:currentScheduleWeekType, date:scheduleDateKey(date),
            title:'Изменено расписание звонков', titleKz:'Қоңырау кестесі өзгертілді',
            text:`На ${date.toLocaleDateString('ru-RU',{day:'numeric',month:'long'})} изменено расписание звонков.`,
            textKz:`${date.toLocaleDateString('kk-KZ',{day:'numeric',month:'long'})} күнгі қоңырау кестесі өзгертілді.`,
            createdAt:new Date().toISOString()
        };
        const cloudSaved = await saveScheduleData(event);
        lastScheduleRenderKey = '';
        renderSchedule(currentScheduleDay);
        window.closeScheduleBellEditor();
        showToast(cloudSaved ? 'Расписание звонков сохранено в облако' : 'Расписание звонков сохранено на устройстве');
    } catch (e) {
        list.splice(0, list.length, ...backup);
        lastScheduleRenderKey = '';
        renderSchedule(currentScheduleDay);
        console.error('Bell schedule save failed:', e);
    }
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
        cancelled: !!item.cancelled,
        originalTime: String(item.originalTime || '').trim(),
        originalSubject: String(item.originalSubject || '').trim(),
        originalRoom: String(item.originalRoom || '').trim(),
        originalTeacher: String(item.originalTeacher || '').trim(),
        changeId: String(item.changeId || '').trim(),
        changedAt: String(item.changedAt || '').trim()
    };
}

function scheduleOriginalValue(item, field) {
    const originalKey = 'original' + field.charAt(0).toUpperCase() + field.slice(1);
    return String(item?.[originalKey] || item?.[field] || '').trim();
}

function scheduleChangeEvent(oldItem, newItem, index) {
    if (!newItem || newItem.changeType === 'normal') return null;
    const entries = buildScheduleEntries(getCurrentScheduleList());
    const pairNumber = entries.find(entry => entry.index === index)?.number || String(index + 1);
    const date = scheduleDateForDay(currentScheduleDay);
    const ruDate = date.toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long'});
    const kzDate = date.toLocaleDateString('kk-KZ',{weekday:'long',day:'numeric',month:'long'});
    const oldSubject = scheduleOriginalValue(newItem,'subject') || oldItem?.subject || newItem.subject || 'Пара';
    const oldRoom = scheduleOriginalValue(newItem,'room') || oldItem?.room || '';
    const oldTeacher = scheduleOriginalValue(newItem,'teacher') || oldItem?.teacher || '';
    const oldTime = scheduleOriginalValue(newItem,'time') || oldItem?.time || '';
    const pairRu = pairNumber === 'КЧ' ? 'классный час' : pairNumber + ' пара';
    const pairKz = pairNumber === 'КЧ' ? 'сынып сағаты' : pairNumber + '-сабақ';
    let textRu = '';
    let textKz = '';

    if (newItem.cancelled || newItem.changeType === 'cancel') {
        textRu = `${ruDate}, ${pairRu}: пары не будет — ${oldSubject}${oldTime ? ` (${oldTime})` : ''}.`;
        textKz = `${kzDate}, ${pairKz}: сабақ болмайды — ${oldSubject}${oldTime ? ` (${oldTime})` : ''}.`;
    } else if (['subject','replace'].includes(newItem.changeType) && oldSubject !== newItem.subject) {
        textRu = `${ruDate}, ${pairRu}: замена — ${oldSubject} → ${newItem.subject}. Новый кабинет: ${newItem.room || 'не указан'}${newItem.teacher ? `. Преподаватель: ${newItem.teacher}` : ''}.`;
        textKz = `${kzDate}, ${pairKz}: ауыстыру — ${oldSubject} → ${newItem.subject}. Жаңа кабинет: ${newItem.room || 'көрсетілмеген'}${newItem.teacher ? `. Оқытушы: ${newItem.teacher}` : ''}.`;
    } else if (newItem.changeType === 'room') {
        textRu = `${ruDate}, ${pairRu}: кабинет изменён — ${newItem.subject}: ${oldRoom || '—'} → ${newItem.room || '—'}.`;
        textKz = `${kzDate}, ${pairKz}: кабинет өзгерді — ${newItem.subject}: ${oldRoom || '—'} → ${newItem.room || '—'}.`;
    } else if (newItem.changeType === 'teacher') {
        textRu = `${ruDate}, ${pairRu}: преподаватель изменён — ${newItem.subject}: ${oldTeacher || '—'} → ${newItem.teacher || '—'}.`;
        textKz = `${kzDate}, ${pairKz}: оқытушы өзгерді — ${newItem.subject}: ${oldTeacher || '—'} → ${newItem.teacher || '—'}.`;
    } else if (newItem.changeType === 'time') {
        textRu = `${ruDate}, ${pairRu}: время изменено — ${newItem.subject}: ${oldTime || '—'} → ${newItem.time || '—'}.`;
        textKz = `${kzDate}, ${pairKz}: уақыт өзгерді — ${newItem.subject}: ${oldTime || '—'} → ${newItem.time || '—'}.`;
    } else {
        textRu = `${ruDate}, ${pairRu}: расписание изменено — ${newItem.subject}.`;
        textKz = `${kzDate}, ${pairKz}: сабақ кестесі өзгерді — ${newItem.subject}.`;
    }

    return {
        id: newItem.changeId || `sch_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
        type: 'schedule_change',
        changeType: newItem.changeType,
        dayKey: currentScheduleDay,
        weekType: currentScheduleWeekType,
        date: scheduleDateKey(date),
        pairNumber,
        title: pairNumber === 'КЧ' ? 'Изменение расписания · Классный час' : `Изменение расписания · ${pairNumber} пара`,
        titleKz: pairNumber === 'КЧ' ? 'Сабақ кестесі өзгерді · Сынып сағаты' : `Сабақ кестесі өзгерді · ${pairNumber}-сабақ`,
        text: textRu,
        textKz,
        createdAt: new Date().toISOString()
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
        breakDuration: restoreScheduleBreak(document.getElementById('edit-break')?.value),
        subject: restoreScheduleSubject(document.getElementById('edit-subject')?.value),
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
    note.value = translateUI(buildScheduleChangeNote(type));
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

let lastScheduleRenderKey = '';
export function renderSchedule(dayKey = currentScheduleDay) {
    if (scheduleMigrationNeeded) void persistScheduleMigration();
    const container = document.getElementById('schedule-container');
    if (!container) return;
    if (SCHEDULE_DAY_KEYS.includes(dayKey)) currentScheduleDay = dayKey;

    updateScheduleReferenceControls();
    const list = getCurrentScheduleList() || [];
    const entries = buildScheduleEntries(list);
    const selectedDate = scheduleDateForDay(currentScheduleDay);
    const liveState = scheduleCurrentState(entries);
    const isActualToday = liveState.type !== 'other-day';
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const adminCanEdit = sessionStorage.getItem('toe_can_schedule') === '1';
    const stateSignature = entries.map(entry => {
        const item = entry.item || {};
        if (item.cancelled) return 'cancelled';
        if (!isActualToday || !entry.range) return 'normal';
        if (nowMinutes >= entry.range.end) return 'past';
        if (nowMinutes >= entry.range.start && nowMinutes < entry.range.end) return 'current';
        return 'upcoming';
    }).join('|');
    const renderKey = JSON.stringify([
        currentScheduleDay,
        currentScheduleWeekType,
        selectedDate instanceof Date ? selectedDate.toISOString() : String(selectedDate),
        stateSignature,
        adminCanEdit,
        list
    ]);

    // The live summary changes with the clock. The heavier lesson-card DOM only
    // rebuilds when the data or a lesson state actually changes.
    renderScheduleSummary(entries, selectedDate);
    renderScheduleDayHeading(selectedDate);
    if (renderKey === lastScheduleRenderKey) return;

    const fragment = document.createDocumentFragment();

    if (adminCanEdit) {
        const hint = document.createElement('div');
        hint.className = 'schedule-ref-admin-hint';
        hint.innerHTML = '<i class="fa-solid fa-pen-to-square"></i><span>Режим администратора: пары можно изменять, удалять и переставлять.</span>';
        fragment.appendChild(hint);
    }

    if (!entries.length) {
        const empty = document.createElement('div');
        empty.className = 'schedule-ref-empty';
        empty.innerHTML = '<i class="fa-regular fa-calendar-xmark"></i><strong>Пар нет</strong><span>На выбранный день расписание пустое.</span>';
        fragment.appendChild(empty);
        container.replaceChildren(fragment);
        lastScheduleRenderKey = renderKey;
        return;
    }

    entries.forEach((entry, position) => {
        const item = entry.item || {};
        const cancelled = !!item.cancelled;
        const isCurrent = isActualToday && entry.range && !cancelled
            && nowMinutes >= entry.range.start && nowMinutes < entry.range.end;
        const isPast = isActualToday && entry.range && nowMinutes >= entry.range.end;
        const row = document.createElement('article');
        row.className = [
            'schedule-ref-row',
            isCurrent ? 'current' : '',
            isPast ? 'past' : '',
            cancelled ? 'cancelled' : '',
            item.isClassHour ? 'class-hour' : ''
        ].filter(Boolean).join(' ');

        let stateBadge = '';
        if (cancelled) {
            stateBadge = '<span class="schedule-ref-state cancelled"><i class="fa-solid fa-ban"></i> Отменена</span>';
        } else if (isCurrent) {
            stateBadge = '<span class="schedule-ref-state current"><i class="fa-solid fa-circle"></i> Идёт</span>';
        } else if (isPast) {
            stateBadge = '<span class="schedule-ref-state done"><i class="fa-solid fa-circle-check"></i> Завершена</span>';
        }

        const changeNote = String(item.changeNote || '').trim();
        const changeHtml = changeNote
            ? `<div class="schedule-ref-change ${cancelled ? 'cancelled' : ''}"><i class="fa-solid ${cancelled ? 'fa-ban' : 'fa-triangle-exclamation'}"></i><span>${scheduleEscape(changeNote)}</span></div>`
            : '';
        const originalSubject = scheduleOriginalValue(item,'subject') || item.subject || 'Занятие';
        const isSubjectReplacement = !cancelled && ['subject','replace'].includes(item.changeType) && originalSubject !== item.subject;
        const routeHtml = cancelled
            ? `<div class="schedule-change-route cancelled"><span class="schedule-change-tag">${translateUI('Пары не будет')}</span><s>${scheduleEscape(originalSubject)}</s></div>`
            : isSubjectReplacement
                ? `<div class="schedule-change-route"><span class="schedule-change-from"><small>${translateUI('Было')}</small><s>${scheduleEscape(originalSubject)}</s></span><i class="fa-solid fa-arrow-right"></i><span class="schedule-change-tag">${translateUI('Замена')}</span></div>`
                : (item.changeType && item.changeType !== 'normal' ? `<div class="schedule-change-route compact"><span class="schedule-change-tag">${scheduleEscape(translateUI(item.changeNote || 'Расписание изменено'))}</span></div>` : '');
        const metaHtml = cancelled
            ? `<div class="schedule-cancel-meta"><i class="fa-solid fa-ban"></i><span>${translateUI('Кабинет и преподаватель неактуальны')}</span></div>`
            : `<div class="schedule-ref-meta ${isSubjectReplacement ? 'changed-meta' : ''}">
                <span><small>${translateUI(isSubjectReplacement ? 'Новый кабинет' : 'Кабинет')}</small><b><i class="fa-solid fa-door-open"></i>${scheduleEscape(item.room || '—')}</b></span>
                ${item.teacher ? `<span data-i18n-skip><small>${translateUI(isSubjectReplacement ? 'Новый преподаватель' : 'Преподаватель')}</small><b><i class="fa-solid fa-user-graduate"></i>${scheduleEscape(item.teacher)}</b></span>` : ''}
            </div>`;

        row.innerHTML = `
            <div class="schedule-ref-rail">
                <span class="schedule-ref-number">${scheduleEscape(entry.number)}</span>
                <i></i>
            </div>
            <div class="schedule-ref-card">
                <div class="schedule-ref-card-head">
                    <time>${scheduleEscape(item.time || '—')}</time>
                    ${stateBadge}
                </div>
                ${routeHtml}
                ${cancelled ? '' : `<span class="schedule-now-label">${isSubjectReplacement ? translateUI('Теперь') : ''}</span><strong class="schedule-ref-subject">${scheduleEscape(item.subject || 'Занятие')}</strong>`}
                ${metaHtml}
                ${changeHtml}
                <div class="schedule-admin-actions">
                    <button onclick="moveScheduleLesson(${entry.index}, -1)" title="Поднять выше" ${entry.index === 0 ? 'disabled' : ''}><i class="fa-solid fa-arrow-up"></i></button>
                    <button onclick="moveScheduleLesson(${entry.index}, 1)" title="Опустить ниже" ${entry.index === list.length - 1 ? 'disabled' : ''}><i class="fa-solid fa-arrow-down"></i></button>
                    <button onclick="openScheduleEditor(${entry.index})" title="Изменить"><i class="fa-solid fa-pen"></i><span>Изменить</span></button>
                </div>
            </div>`;
        fragment.appendChild(row);

        const next = entries[position + 1];
        if (!entry.range || !next?.range || next.range.start <= entry.range.end) return;
        const start = entry.range.end;
        const end = next.range.start;
        const duration = end - start;
        if (duration <= 0) return;

        const currentBreak = isActualToday && nowMinutes >= start && nowMinutes < end;
        const pastBreak = isActualToday && nowMinutes >= end;
        const breakRow = document.createElement('div');
        breakRow.className = [
            'schedule-ref-break',
            currentBreak ? 'current' : '',
            pastBreak ? 'past' : ''
        ].filter(Boolean).join(' ');
        breakRow.innerHTML = `
            <div class="schedule-ref-break-rail"><span><i class="fa-solid fa-mug-hot"></i></span></div>
            <div class="schedule-ref-break-card">
                <div><i class="fa-solid fa-mug-hot"></i><strong>Перемена — ${duration} минут</strong></div>
                <time><i class="fa-regular fa-clock"></i>${scheduleClock(start)} – ${scheduleClock(end)}</time>
                ${currentBreak ? '<b><i class="fa-solid fa-circle"></i> Идёт</b>' : pastBreak ? '<b class="done"><i class="fa-solid fa-circle-check"></i> Завершена</b>' : ''}
            </div>`;
        fragment.appendChild(breakRow);
    });
    container.replaceChildren(fragment);
    lastScheduleRenderKey = renderKey;
}

function getCurrentScheduleList(forWrite = false) {
    if (scheduleEditScope === 'template') return (currentScheduleWeekType === 'numerator' ? scheduleDataNumerator : scheduleDataDenominator)[currentScheduleDay];
    const date = scheduleDateForDay(currentScheduleDay);
    return forWrite ? ensureDateSchedule(schedulePayload(),date,currentScheduleWeekType) : scheduleForDate(schedulePayload(),date,currentScheduleWeekType);
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
    document.getElementById('edit-break').value = translateUI(item.breakDuration || '');
    document.getElementById('edit-subject').value = translateUI(item.subject || '');
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
    const list=getCurrentScheduleList(true);
    if (!list) { showToast('Не удалось определить день расписания'); return; }
    const changeType = document.getElementById('edit-change-type')?.value || 'normal';
    const oldItem = editingScheduleIndex >= 0 ? cloneScheduleItem(list[editingScheduleIndex]) : null;
    const baseline = scheduleEditorOriginal || oldItem || {};
    const changed = changeType !== 'normal';
    const item={
        time:document.getElementById('edit-time').value.trim(),
        breakDuration:restoreScheduleBreak(document.getElementById('edit-break').value),
        subject:restoreScheduleSubject(document.getElementById('edit-subject').value),
        room:document.getElementById('edit-room').value.trim(),
        teacher:document.getElementById('edit-teacher').value.trim(),
        isClassHour:document.getElementById('edit-class-hour').checked,
        changeType,
        changeNote:scheduleChangeNoteManuallyEdited ? (document.getElementById('edit-change-note')?.value.trim() || '') : buildScheduleChangeNote(changeType),
        cancelled:changeType === 'cancel',
        originalTime:changed ? (baseline.originalTime || baseline.time || '') : '',
        originalSubject:changed ? (baseline.originalSubject || baseline.subject || '') : '',
        originalRoom:changed ? (baseline.originalRoom || baseline.room || '') : '',
        originalTeacher:changed ? (baseline.originalTeacher || baseline.teacher || '') : '',
        changeId:changed ? `sch_${Date.now()}_${Math.random().toString(36).slice(2,7)}` : '',
        changedAt:changed ? new Date().toISOString() : ''
    };
    if(!item.subject || !item.time){showToast('Укажите предмет и время');return;}
    if (changeType !== 'normal' && !item.changeNote) item.changeNote = buildScheduleChangeNote(changeType);
    if(editingScheduleIndex>=0) list[editingScheduleIndex]=item; else list.push(item);
    const savedIndex = editingScheduleIndex >= 0 ? editingScheduleIndex : list.length - 1;
    const changeEvent = scheduleChangeEvent(oldItem, item, savedIndex);
    try {
        const cloudSaved = await saveScheduleData(changeEvent);
        window.closeScheduleEditor();
        lastScheduleRenderKey = '';
        renderSchedule(currentScheduleDay);
        if (window.__scheduleDebug) window.__scheduleDebug.lastSaveOk = cloudSaved;
        showToast(
            cloudSaved
                ? (changeType === 'cancel' ? 'Отмена пары сохранена в облако' : 'Расписание сохранено в облако')
                : (changeType === 'cancel' ? 'Отмена пары сохранена на устройстве' : 'Расписание сохранено на устройстве')
        );
    } catch (e) {
        if (editingScheduleIndex >= 0) list[editingScheduleIndex] = oldItem; else list.pop();
        lastScheduleRenderKey = '';
        renderSchedule(currentScheduleDay);
        console.error('Schedule save failed:', e);
        if (window.__scheduleDebug) window.__scheduleDebug.lastSaveOk = false;
        // Причина уже показана единой системой ошибок.
    }
};

window.moveScheduleLesson = async function(index, delta) {
    if (sessionStorage.getItem('toe_can_schedule') !== '1') return;
    const list = getCurrentScheduleList(true);
    if (!list || !Number.isInteger(index) || !Number.isInteger(delta)) return;
    const target = index + delta;
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
    renderSchedule(currentScheduleDay);
    try {
        const cloudSaved = await saveScheduleData();
        showToast(cloudSaved ? 'Порядок пар сохранён в облако' : 'Порядок пар сохранён на устройстве');
    } catch (e) {
        [list[index], list[target]] = [list[target], list[index]];
        renderSchedule(currentScheduleDay);
        console.error('Schedule reorder failed:', e);
        // Причина уже показана единой системой ошибок.
    }
};

window.deleteScheduleLesson = async function() {
    if (sessionStorage.getItem('toe_can_schedule') !== '1') return;
    const list=getCurrentScheduleList(true);
    if(editingScheduleIndex<0 || !list)return;
    if(!confirm(translateUI('Удалить эту пару из расписания?')))return;

    const removedIndex=editingScheduleIndex;
    const removed=list.splice(removedIndex,1)[0];
    const targetList=list;

    try {
        const cloudSaved = await saveScheduleData();
        window.closeScheduleEditor();
        renderSchedule(currentScheduleDay);

        window.showUndoAction?.(
            cloudSaved ? 'Пара удалена из расписания' : 'Пара удалена и сохранена на устройстве',
            async () => {
                if (sessionStorage.getItem('toe_can_schedule') !== '1') throw new Error('Нет права изменять расписание');
                if (!removed) return;
                targetList.splice(Math.min(removedIndex,targetList.length),0,removed);
                lastScheduleRenderKey='';
                renderSchedule(currentScheduleDay);
                await saveScheduleData();
            },
            6500
        );
    } catch (e) {
        targetList.splice(Math.min(removedIndex,targetList.length),0,removed);
        lastScheduleRenderKey='';
        renderSchedule(currentScheduleDay);
        console.error('Schedule delete failed:', e);
        if (window.__scheduleDebug) window.__scheduleDebug.lastSaveOk = false;
        // Причина уже показана единой системой ошибок.
    }
};

function saveScheduleHistorySnapshot() {
    try {
        const history = JSON.parse(localStorage.getItem('toe_schedule_history') || '[]');
        history.unshift({
            savedAt: new Date().toISOString(),
            num: scheduleDataNumerator,
            den: scheduleDataDenominator,
            dateOverrides:scheduleDateOverrides,
            legacyScheduleArchive:scheduleLegacyArchive
        });
        localStorage.setItem('toe_schedule_history', JSON.stringify(history.slice(0, 50)));
    } catch (e) { console.warn('Не удалось сохранить историю расписания', e); }
}

export async function saveScheduleData(changeEvent = null){
    saveScheduleHistorySnapshot();
    const updatedAt = new Date().toISOString();
    let before = scheduleAuditBaseline;
    const auditActorUid = getCloudState().auth?.currentUser?.uid;
    const auditAfter = JSON.parse(JSON.stringify(schedulePayload()));
    const num = JSON.stringify(scheduleDataNumerator);
    const den = JSON.stringify(scheduleDataDenominator);
    await savePersistentValue('toe_schedule_num', num);
    await savePersistentValue('toe_schedule_den', den);
    await savePersistentValue('toe_schedule_last_saved', updatedAt);
    await savePersistentValue('toe_schedule_dated_v2', JSON.stringify(schedulePayload()));
    dependencies.recordActionHistory?.({kind:'schedule',target:'main',before,after:auditAfter,operationId:updatedAt,actorUid:auditActorUid});
    scheduleAuditBaseline = auditAfter;
    lastScheduleLocalWriteAt = updatedAt;

    const payload = {
        ...schedulePayload(),
        lastChange: changeEvent || null,
        updatedAt
    };
    const existingPending = readPendingSchedule();
    const pendingEvents = Array.isArray(existingPending?.events) ? existingPending.events : [];

    const { isCloudConnected, db, auth } = getCloudState();
    if (!isCloudConnected || !db || !auth?.currentUser || !navigator.onLine) {
        await storePendingSchedule(payload, changeEvent);
        window.__scheduleLastSaveOk = false;
        window.__schedulePendingSync = true;
        reportError('schedule-save', new Error(navigator.onLine ? 'Firebase не подключён или пользователь не авторизован' : 'offline'), {
            localSaved:true,
            fallback:'Расписание сохранено на устройстве'
        });
        try { await dependencies.createAutomaticBackup?.(); } catch (e) { console.warn('Автоматическая резервная копия расписания не создана', e); }
        dependencies.updateBackupStatus?.();
        return false;
    }

    try {
        const ref = doc(db, ...CLOUD_ROOT, 'schedule', 'main');
        await setDoc(ref, payload, { merge: false });

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
        window.__schedulePendingSync = false;
        if (window.__scheduleDebug) {
            window.__scheduleDebug.lastUpdatedAt = updatedAt;
            window.__scheduleDebug.lastSource = 'Firestore (подтверждено сервером)';
        }

        const events = [...pendingEvents];
        if (changeEvent?.id && !events.some(item => item?.id === changeEvent.id)) events.push(changeEvent);
        await publishPendingScheduleEvents(events);
        await clearPendingSchedule();
        dependencies.confirmActionHistory?.(updatedAt);
    } catch (e) {
        await storePendingSchedule(payload, changeEvent);
        window.__scheduleLastSaveOk = false;
        window.__schedulePendingSync = true;
        const detail = e?.code ? `${e.code}: ${e.message}` : String(e);
        dependencies.setWriteDiagnostic?.(false, detail);
        dependencies.diagLog?.('Firestore SCHEDULE WRITE ERROR', detail);
        console.error('Cloud schedule save failed:', e);
        reportError('schedule-save', e, { localSaved:true, fallback:'Расписание сохранено на устройстве' });
        try { await dependencies.createAutomaticBackup?.(); } catch (backupError) { console.warn('Автоматическая резервная копия расписания не создана', backupError); }
        dependencies.updateBackupStatus?.();
        return false;
    }

    try { await dependencies.createAutomaticBackup?.(); } catch (e) { console.warn('Автоматическая резервная копия расписания не создана', e); }
    dependencies.updateBackupStatus?.();
    return true;
}

export async function syncPendingScheduleData(){
    const pending = readPendingSchedule();
    if (!pending) {
        window.__schedulePendingSync = false;
        return true;
    }

    const { isCloudConnected, db, auth } = getCloudState();
    if (!navigator.onLine || !isCloudConnected || !db || !auth?.currentUser) return false;

    try {
        const updatedAt = String(pending.updatedAt || new Date().toISOString());
        const ref = doc(db, ...CLOUD_ROOT, 'schedule', 'main');
        const normalized = installSchedulePayload(pending);
        await setDoc(ref, { ...schedulePayload(), lastChange: normalized.lastChange || null, updatedAt }, { merge:false });
        await savePersistentValue('toe_schedule_dated_v2', JSON.stringify(schedulePayload()));

        lastScheduleAppliedUpdatedAt = updatedAt;
        lastScheduleLocalWriteAt = updatedAt;
        await publishPendingScheduleEvents(Array.isArray(pending.events) ? pending.events : []);
        await clearPendingSchedule();
        window.__schedulePendingSync = false;
        dependencies.confirmActionHistory?.(updatedAt);
        window.__scheduleLastSaveOk = true;
        dependencies.setWriteDiagnostic?.(true, `Офлайн-расписание синхронизировано: ${updatedAt}`);
        return true;
    } catch (e) {
        window.__schedulePendingSync = true;
        reportError('schedule-offline-sync', e, { localSaved:true, fallback:'Расписание пока остаётся на устройстве' });
        return false;
    }
}

export async function loadScheduleData(){
    try {
        const stored = localStorage.getItem('toe_schedule_dated_v2') || await dbGet('toe_schedule_dated_v2');
        if (stored) installSchedulePayload(JSON.parse(stored));
        else {
            const num = localStorage.getItem('toe_schedule_num') || await dbGet('toe_schedule_num');
            const den = localStorage.getItem('toe_schedule_den') || await dbGet('toe_schedule_den');
            installSchedulePayload({numerator:num?JSON.parse(num):scheduleDataNumerator,denominator:den?JSON.parse(den):scheduleDataDenominator});
        }
        const pending = readPendingSchedule();
        if (pending) installSchedulePayload(pending);
        const {isCloudConnected,db,auth} = getCloudState();
        if (!pending && navigator.onLine && isCloudConnected && db && auth?.currentUser) {
            const snap = await getDoc(doc(db,...CLOUD_ROOT,'schedule','main'));
            if (snap.exists()) installSchedulePayload(snap.data());
        }
        await savePersistentValue('toe_schedule_dated_v2',JSON.stringify(schedulePayload()));
    } catch(error) { reportError('schedule-load',error,{localSaved:true,fallback:'Не удалось обновить расписание из облака'}); }
    scheduleAuditBaseline = JSON.parse(JSON.stringify(schedulePayload()));
    await persistScheduleMigration();
}

export function applyCloudScheduleData(data, source = 'cloud') {
    if (!data) return false;
    if (readPendingSchedule()) return false;
    const remoteUpdatedAt = String(data.updatedAt || '');
    if (remoteUpdatedAt && lastScheduleLocalWriteAt && remoteUpdatedAt < lastScheduleLocalWriteAt) return false;
    if (remoteUpdatedAt && lastScheduleAppliedUpdatedAt && remoteUpdatedAt < lastScheduleAppliedUpdatedAt) return false;

    const beforePayload = JSON.stringify(schedulePayload());
    installSchedulePayload(data);
    const changed = beforePayload !== JSON.stringify(schedulePayload());
    if (remoteUpdatedAt) lastScheduleAppliedUpdatedAt = remoteUpdatedAt;

    if (changed) {
        localStorage.setItem('toe_schedule_num', JSON.stringify(scheduleDataNumerator));
        localStorage.setItem('toe_schedule_den', JSON.stringify(scheduleDataDenominator));
        localStorage.setItem('toe_schedule_dated_v2', JSON.stringify(schedulePayload()));
        renderSchedule(currentScheduleDay);
        if (window.__scheduleDebug) {
            window.__scheduleDebug.lastSource = source;
            window.__scheduleDebug.lastUpdatedAt = remoteUpdatedAt;
            window.__scheduleDebug.lastSnapshotAt = new Date().toISOString();
        }
    }
    scheduleAuditBaseline = JSON.parse(JSON.stringify(schedulePayload()));
    if (scheduleMigrationNeeded) setTimeout(persistScheduleMigration,0);
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
            reportError('schedule-realtime', err, { localSaved:true, fallback:'Синхронизация расписания временно недоступна' });
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
        reportError('schedule-realtime', e, { localSaved:true, fallback:'Синхронизация расписания временно недоступна' });
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
            reportError('schedule-sync', e, { localSaved:true, fallback:'Не удалось обновить расписание из облака' });
        }
    };
    // Realtime listener is the primary path. A lightweight server read remains only as a safety net.
    schedulePollTimer = setInterval(() => {
        if (document.visibilityState !== 'visible') return;
        // A healthy realtime listener already has fresher data than polling.
        if (window.__scheduleListenerActive) return;
        void pollSchedule();
    }, 120000);
}


let scheduleReferenceClockTimer = null;
if (typeof window !== 'undefined') {
    scheduleReferenceClockTimer = window.setInterval(() => {
        if (document.visibilityState !== 'visible') return;
        const view = document.getElementById('view-schedule');
        if (view && !view.classList.contains('hidden')) renderSchedule(currentScheduleDay);
    }, 60000);
}

