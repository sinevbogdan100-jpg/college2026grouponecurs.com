import {
    createFirebaseServices,
    signInAnonymously,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    setPersistence,
    browserLocalPersistence,
    doc,
    setDoc,
    getDoc,
    collection,
    getDocs,
    onSnapshot,
    updateDoc,
    deleteDoc,
    deleteField
} from "./firebase.js?v=20261003-step18-3-recovery1";

import {
    getWeekTypeForDate,
    getCurrentDateStr,
    formatLocalDate,
    isWeekendDate,
    getLastWorkingDate,
    getNextWorkingDate,
    formatCalendarLabel,
    getStatusName,
    getStatusBadgeClass
} from "./utils.js?v=20261003-step18-3-recovery1";
import { dbPut, dbGet, dbDelete, savePersistentValue } from "./storage.js?v=20261003-step18-3-recovery1";
import {
    configureSchedule,
    loadScheduleData,
    subscribeToSchedule,
    startSchedulePolling,
    syncScheduleToToday,
    renderSchedule,
    getCurrentScheduleDay,
    getScheduleDataForWeek,
    restoreScheduleSelection
} from "./schedule.js?v=20261003-step18-3-recovery1";

        
window.__SITE_BUILD__ = 'step18.3-journal-ref2-2026-10-04';
window.__journalDateInitialized = false;
console.info('[SBP GROUP] build', window.__SITE_BUILD__);
// ===== ВРЕМЕННАЯ ДИАГНОСТИКА FIREBASE =====
        const firebaseDiag = { events: [], init: false, auth: null, read: null, write: null, realtime: null, error: null };
        function diagLog(message, data) {
            const line = `[${new Date().toLocaleTimeString()}] ${message}${data ? "\n" + (typeof data === "string" ? data : JSON.stringify(data, null, 2)) : ""}`;
            firebaseDiag.events.push(line);
            console.log("[Firebase diagnostic]", message, data || "");
            const el = document.getElementById('firebase-diagnostic-log');
            if (el) el.textContent = firebaseDiag.events.slice(-30).join("\n\n");
        }
        function diagRow(label, ok, detail) {
            const color = ok === true ? 'emerald' : ok === false ? 'rose' : 'amber';
            return `<div class="p-2.5 rounded-xl bg-${color}-50 border border-${color}-100"><b>${label}:</b> ${ok === true ? '🟢 OK' : ok === false ? '🔴 ОШИБКА' : '🟡 НЕ ПРОВЕРЕНО'}${detail ? `<div class="mt-1 text-[10px] text-slate-600 break-words">${String(detail).replace(/</g,'&lt;')}</div>` : ''}</div>`;
        }
        function renderFirebaseDiagnostic() {
            const el = document.getElementById('firebase-diagnostic-status'); if (!el) return;
            el.innerHTML = [
              diagRow('Firebase SDK / инициализация', firebaseDiag.init, firebaseDiag.error),
              diagRow('Firebase Auth', firebaseDiag.auth?.ok ?? null, firebaseDiag.auth?.detail),
              diagRow('Firestore чтение', firebaseDiag.read?.ok ?? null, firebaseDiag.read?.detail),
              diagRow('Firestore запись', firebaseDiag.write?.ok ?? null, firebaseDiag.write?.detail),
              diagRow('Realtime listener', firebaseDiag.realtime?.ok ?? null, firebaseDiag.realtime?.detail),
              diagRow('Режим облака', isCloudConnected === true, isCloudConnected ? 'isCloudConnected = true' : 'Сайт работает в локальном режиме'),
              diagRow('Путь журнала', true, `${['toe_group','shared','attendance_records', document.getElementById('date-picker')?.value || getCurrentDateStr()].join(' / ')}`),
              diagRow('Путь расписания', true, 'toe_group / shared / schedule / main')
            ].join('');
        }
        window.openFirebaseDiagnostic = function(){ const p=document.getElementById('firebase-diagnostic-panel'); if(p){p.classList.remove('hidden');p.classList.add('flex');renderFirebaseDiagnostic();} };
        window.closeFirebaseDiagnostic = function(){ const p=document.getElementById('firebase-diagnostic-panel'); if(p){p.classList.add('hidden');p.classList.remove('flex');} };
        function updateCloudBadge(connected) {
            // В текущем дизайне отдельный badge не обязателен. Функция нужна, чтобы ошибка badge не отключала Firebase.
            isCloudConnected = !!connected;
            diagLog(connected ? 'Облако подключено' : 'Облако отключено');
            renderFirebaseDiagnostic();
        }
        window.runFirebaseDiagnostic = async function(){
            firebaseDiag.events = []; firebaseDiag.error = null; firebaseDiag.read = null; firebaseDiag.write = null; firebaseDiag.realtime = null; // auth сохраняем: он уже проверен при инициализации
            diagLog('Начало полной проверки Firebase');
            if (!db || !isCloudConnected) {
                firebaseDiag.init = false;
                firebaseDiag.error = 'Firebase/Firestore не инициализирован';
                diagLog('STOP: Firebase/Firestore не инициализирован');
                renderFirebaseDiagnostic();
                return;
            }
            firebaseDiag.init = true;
            const date = document.getElementById('date-picker')?.value || getCurrentDateStr();
            const ref = doc(db, ...CLOUD_ROOT, 'attendance_records', date);
            try {
                const snap = await getDoc(ref);
                firebaseDiag.read = {ok:true, detail:`Чтение прошло. Документ ${snap.exists() ? 'существует' : 'не существует'}; дата ${date}.`};
                diagLog('Firestore READ OK', {date, exists:snap.exists(), path:`toe_group/shared/attendance_records/${date}`});
            } catch(e) {
                firebaseDiag.read = {ok:false, detail:e?.code ? `${e.code}: ${e.message}` : String(e)};
                diagLog('Firestore READ ERROR', firebaseDiag.read.detail);
            }
            if (!canEditJournal()) {
                firebaseDiag.write = {ok:null, detail:'Для текущей учётной записи запись в журнал отключена или недоступна.'};
                diagLog('Firestore WRITE SKIPPED: viewer mode');
            } else {
                try {
                    const oldData = (await getDoc(ref)).data() || null;
                    const marker = `firebase-diagnostic-${Date.now()}`;
                    await setDoc(ref, { __firebaseDiagnostic: marker }, { merge: true });
                    if (oldData) {
                        await updateDoc(ref, { __firebaseDiagnostic: deleteField() });
                    } else {
                        await deleteDoc(ref);
                    }
                    firebaseDiag.write = {ok:true, detail:`Запись в журнал разрешена для текущей роли: toe_group/shared/attendance_records/${date}`};
                    diagLog('Firestore WRITE OK', firebaseDiag.write.detail);
                } catch(e) {
                    if (window.__rtd) { window.__rtd.log('WRITE ERROR: '+(e?.code||'')+' '+(e?.message||e)); window.__rtd.render(); }
                    firebaseDiag.write = {ok:false, detail:e?.code ? `${e.code}: ${e.message}` : String(e)};
                    diagLog('Firestore WRITE ERROR', firebaseDiag.write.detail);
                }
            }
            try {
                let diagUnsub = null;
                let diagRealtimeError = null;
                diagUnsub = onSnapshot(ref, () => {}, e => {
                    diagRealtimeError = e;
                    firebaseDiag.realtime = {ok:false, detail:e?.code ? `${e.code}: ${e.message}` : String(e)};
                    diagLog('Realtime listener ERROR', firebaseDiag.realtime.detail);
                    renderFirebaseDiagnostic();
                });
                if (!diagRealtimeError) {
                    firebaseDiag.realtime = {ok:true, detail:'onSnapshot зарегистрирован; ожидается первый снимок.'};
                    diagLog('Realtime listener REGISTERED');
                }
                setTimeout(() => { try { if (diagUnsub) diagUnsub(); } catch(_) {} }, 1500);
            } catch(e) {
                firebaseDiag.realtime = {ok:false, detail:e?.code ? `${e.code}: ${e.message}` : String(e)};
                diagLog('Realtime listener ERROR', firebaseDiag.realtime.detail);
            }
            renderFirebaseDiagnostic();
        };


        // Единое облачное хранилище группы. Оно одинаковое для всех устройств.
        const CLOUD_ROOT = ['toe_group', 'shared'];
        let app, db, auth;
        let userId = 'shared-group';
        let isCloudConnected = false;
        let attendanceUnsubscribe = null;
        let attendanceArchiveUnsubscribe = null;
        let attendanceArchiveReady = false;
        let attendanceArchive = {};
        let groupInfoUnsubscribe = null;
        let groupInfoPollTimer = null;
        let lastGroupInfoUpdatedAt = '';
        let rosterStatsUnsubscribe = null;
        let rosterStatsReady = false;
        let rosterStatsByStudent = {};
        let rosterStatsRebuildTimer = null;
        let rosterStatsRebuildInFlight = false;
        let rosterStatsRebuildPending = false;
        let studentsUnsubscribe = null;
        let studentsPollTimer = null;
        let lastStudentsUpdatedAt = '';
        const GROUP_INFO_DOC_ID = 'group_info_shared';
        const ROSTER_STATS_DOC_ID = 'roster_stats_shared';
        const STUDENTS_DOC_ID = 'students_shared';
        const ADMIN_PERMISSIONS_DOC_ID = 'admin_permissions';
        const DEFAULT_ADMIN_PERMISSIONS = Object.freeze({
            admin1: Object.freeze({ journal: true, schedule: true, groupInfo: false, students: false, backups: false, manageAdmins: false, notifications: false, support: false }),
            admin2: Object.freeze({ journal: true, schedule: true, groupInfo: false, students: false, backups: false, manageAdmins: false, notifications: false, support: false })
        });
        const FULL_ACCESS_PERMISSIONS = Object.freeze({
            journal: true,
            schedule: true,
            groupInfo: true,
            students: true,
            backups: true,
            manageAdmins: true,
            notifications: true,
            support: true
        });
        let adminPermissions = {
            admin1: { ...DEFAULT_ADMIN_PERMISSIONS.admin1 },
            admin2: { ...DEFAULT_ADMIN_PERMISSIONS.admin2 }
        };
        let adminPermissionsUnsubscribe = null;
        let adminPermissionsPollTimer = null;
        let lastAdminPermissionsUpdatedAt = '';

        // Три фиксированные учётные записи редакторов. Пароли никогда не хранятся в коде.
        // В интерфейсе используются короткие логины, а Firebase Authentication работает с внутренними email.
        const AUTH_ACCOUNTS = Object.freeze({
            owner:  { email: 'owner.toe2691@example.com',  role: 'owner', label: 'Владелец' },
            admin1: { email: 'admin1.toe2691@example.com', role: 'admin', label: 'Администратор 1' },
            admin2: { email: 'admin2.toe2691@example.com', role: 'admin', label: 'Администратор 2' }
        });
        let currentAccessRole = 'viewer';
        let currentAccountLogin = '';
        let authStateUnsubscribe = null;
        try {
            const cachedAdminPermissions = JSON.parse(localStorage.getItem('toe_admin_permissions') || 'null');
            if (cachedAdminPermissions) adminPermissions = normalizeAdminPermissions(cachedAdminPermissions);
        } catch (_) {}

        function getAccountByUser(user) {
            const email = String(user?.email || '').trim().toLowerCase();
            if (!email || user?.isAnonymous) return null;
            return Object.entries(AUTH_ACCOUNTS).find(([, account]) => account.email.toLowerCase() === email) || null;
        }

        function isEditorRole() {
            return currentAccessRole === 'owner' || currentAccessRole === 'admin';
        }

        function isOwnerRole() {
            return currentAccessRole === 'owner';
        }

        function normalizeAdminPermissions(data = {}) {
            const out = {};
            ['admin1', 'admin2'].forEach(login => {
                const incoming = data?.[login] || {};
                const defaults = DEFAULT_ADMIN_PERMISSIONS[login];
                out[login] = {};
                Object.keys(FULL_ACCESS_PERMISSIONS).forEach(key => {
                    out[login][key] = typeof incoming?.[key] === 'boolean' ? incoming[key] : defaults[key];
                });
            });
            return out;
        }

        function getPermissionsForLogin(login = currentAccountLogin) {
            if (isOwnerRole()) return { ...FULL_ACCESS_PERMISSIONS };
            if (currentAccessRole !== 'admin' || !adminPermissions[login]) {
                return Object.fromEntries(Object.keys(FULL_ACCESS_PERMISSIONS).map(key => [key, false]));
            }
            return { ...adminPermissions[login] };
        }

        function canEditJournal() { return !!getPermissionsForLogin().journal; }
        function canEditSchedule() { return !!getPermissionsForLogin().schedule; }
        function canEditGroupInfo() { return !!getPermissionsForLogin().groupInfo; }
        function canManageStudents() { return !!getPermissionsForLogin().students; }
        function canUseBackups() { return !!getPermissionsForLogin().backups; }
        function canManageAdminPermissions() { return !!getPermissionsForLogin().manageAdmins; }
        function canPublishNotificationsPermission() { return !!getPermissionsForLogin().notifications; }
        function canUseSupportStaff() { return !!getPermissionsForLogin().support; }

        function syncSessionPermissionFlags() {
            sessionStorage.setItem('toe_role', currentAccessRole);
            if (isEditorRole()) sessionStorage.setItem('toe_admin', '1');
            else sessionStorage.removeItem('toe_admin');
            if (isOwnerRole()) sessionStorage.setItem('toe_owner', '1');
            else sessionStorage.removeItem('toe_owner');
            const flags = {
                journal: canEditJournal(),
                schedule: canEditSchedule(),
                group_info: canEditGroupInfo(),
                students: canManageStudents(),
                backups: canUseBackups(),
                manage_admins: canManageAdminPermissions()
            };
            Object.entries(flags).forEach(([key, allowed]) => {
                const storageKey = `toe_can_${key}`;
                if (allowed) sessionStorage.setItem(storageKey, '1');
                else sessionStorage.removeItem(storageKey);
            });
            window.__toeCanJournal = flags.journal;
            window.__toeCanSchedule = flags.schedule;
            window.__toeCanGroupInfo = flags.group_info;
            window.__toeCanStudents = flags.students;
            window.__toeCanBackups = flags.backups;
            window.__toeCanManageAdmins = flags.manage_admins;
        }

        function applyAccessRoleFromUser(user) {
            const found = getAccountByUser(user);
            currentAccountLogin = found?.[0] || '';
            currentAccessRole = found?.[1]?.role || 'viewer';
            syncSessionPermissionFlags();
            window.__toeRole = currentAccessRole;
            window.__toeLogin = currentAccountLogin;
            updateAdminUI();
        }
        window.__attendanceListenerActive = false;
        window.__firebaseDebug = window.__firebaseDebug || {init:false, auth:null};
        window.__firebaseUid = '';
        window.__realtimeDate = '';

        configureSchedule({
            getCloudState: () => ({ isCloudConnected, db, auth }),
            showToast: (message) => showToast(message),
            createAutomaticBackup: () => createAutomaticBackup(),
            updateBackupStatus: () => updateBackupStatus(),
            setRealtimeDiagnostic: (detail) => { firebaseDiag.realtime = { ok: true, detail }; },
            setWriteDiagnostic: (ok, detail) => { firebaseDiag.write = { ok, detail }; },
            diagLog: (message, data) => diagLog(message, data)
        });


        const DEFAULT_STUDENT_RECORDS = [
            { name: "Бондаренко Роман", joinedAt: "" },
            { name: "Ган Штефан", joinedAt: "" },
            { name: "Гудель Никита", joinedAt: "" },
            { name: "Елькина Маргарита", joinedAt: "" },
            { name: "Кайруллинов Нурсултан", joinedAt: "" },
            { name: "Кальнаус Михаил", joinedAt: "" },
            { name: "Қуанышбай Әлихан", joinedAt: "" },
            { name: "Маженов Адиль", joinedAt: "" },
            { name: "Масгутов Ансар", joinedAt: "" },
            { name: "Оразбеков Ернур", joinedAt: "" },
            { name: "Пулат Альбина", joinedAt: "" },
            { name: "Рахметов Кадырали", joinedAt: "" },
            { name: "Сарсенбинов Амир", joinedAt: "" },
            { name: "Синёв Богдан", joinedAt: "" },
            { name: "Сироткин Виктор", joinedAt: "" },
            { name: "Тлеулесов Ерсұлтан", joinedAt: "" },
            { name: "Толеубайулы Мухамед", joinedAt: "" },
            { name: "Турсуканов Диас", joinedAt: "" },
            { name: "Федосеенков Иван", joinedAt: "" }
        ];

        function normalizeStudentName(value) {
            return String(value || '').replace(/\s+/g, ' ').trim();
        }

        function normalizeStudentRecords(list) {
            const result = [];
            const seen = new Set();
            (Array.isArray(list) ? list : []).forEach(item => {
                const rawName = typeof item === 'string' ? item : item?.name;
                const name = normalizeStudentName(rawName);
                if (!name || seen.has(name.toLocaleLowerCase('ru-RU'))) return;
                seen.add(name.toLocaleLowerCase('ru-RU'));
                const joinedAt = typeof item === 'object' && /^\d{4}-\d{2}-\d{2}$/.test(String(item?.joinedAt || ''))
                    ? String(item.joinedAt)
                    : '';
                result.push({ name, joinedAt });
            });
            return result.sort((a,b) => a.name.localeCompare(b.name, 'ru-RU', {sensitivity:'base'}));
        }

        function readLocalStudentRecords() {
            try {
                const raw = localStorage.getItem('toe_students_roster');
                if (raw !== null) {
                    const saved = JSON.parse(raw);
                    if (Array.isArray(saved)) return normalizeStudentRecords(saved);
                }
            } catch (_) {}
            return normalizeStudentRecords(DEFAULT_STUDENT_RECORDS);
        }

        let studentRecords = readLocalStudentRecords();
        let students = studentRecords.map(item => item.name);

        function getStudentsForDate(dateStr) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ''))) return [...students];
            return studentRecords
                .filter(item => !item.joinedAt || item.joinedAt <= dateStr)
                .map(item => item.name);
        }

        function storeStudentRecordsLocally(records) {
            studentRecords = normalizeStudentRecords(records);
            students = studentRecords.map(item => item.name);
            localStorage.setItem('toe_students_roster', JSON.stringify(studentRecords));
        }

        function updateHomeWeekBanner() {
            const now = new Date();
            const dayOfWeek = now.getDay();
            const adjustedDate = new Date(now);
            if (dayOfWeek === 6) adjustedDate.setDate(now.getDate() + 2);
            if (dayOfWeek === 0) adjustedDate.setDate(now.getDate() + 1);

            const type = getWeekTypeForDate(adjustedDate);
            const bannerText = document.getElementById('home-week-banner-text');
            const bannerDates = document.getElementById('home-week-dates');

            const d = new Date(adjustedDate);
            const day = d.getDay() === 0 ? 7 : d.getDay();
            const diffToMon = d.getDate() - day + 1;
            const monday = new Date(new Date(adjustedDate).setDate(diffToMon));
            const friday = new Date(new Date(adjustedDate).setDate(diffToMon + 4));

            const options = { month: 'short', day: 'numeric' };
            const dateStr = `${monday.toLocaleDateString('ru-RU', options)} — ${friday.toLocaleDateString('ru-RU', options)}`;

            if (bannerText) {
                bannerText.innerText = type === 'numerator' ? 'Числитель' : 'Знаменатель';
            }
            if (bannerDates) {
                bannerDates.innerText = dateStr;
            }
        }

        async function loadAttendanceForDate(dateStr) {
            let saved = localStorage.getItem(`toe_att_${dateStr}`);

            if (!saved) {
                try {
                    const backup = await dbGet(`toe_att_${dateStr}`);
                    if (backup) {
                        saved = backup;
                        localStorage.setItem(`toe_att_${dateStr}`, backup);
                    }
                } catch (e) {
                    console.warn('Не удалось прочитать резервную копию журнала', e);
                }
            }

            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    attendanceState = parsed.state || {};
                    attendanceNotes = parsed.notes || {};
                    if (parsed.weekType) currentWeekType = parsed.weekType;
                } catch(e) {
                    attendanceState = {}; attendanceNotes = {};
                }
            } else {
                attendanceState = {}; attendanceNotes = {};
                currentWeekType = getWeekTypeForDate(new Date(dateStr));
            }

            updateWeekTypeButtons(currentWeekType);
            renderApp();
            renderRosterList();

            // Если облако подключено, общая запись имеет приоритет над локальной.
            if (isCloudConnected && db && auth?.currentUser) {
                try {
                    const snap = await getDoc(doc(db, ...CLOUD_ROOT, 'attendance_records', dateStr));
                    if (snap.exists()) {
                        const data = snap.data();
                        attendanceState = data.state || {};
                        attendanceNotes = data.notes || {};
                        if (data.weekType) currentWeekType = data.weekType;
                        localStorage.setItem(`toe_att_${dateStr}`, JSON.stringify(data));
                        updateWeekTypeButtons(currentWeekType);
                        renderApp();
                    }
                } catch (e) {
                    console.warn('Не удалось загрузить облачную посещаемость', e);
                }
            }
        }

        let attendancePollTimer = null;
        let attendanceReconnectTimer = null;
        let attendanceReconnectAttempt = 0;
        let lastAppliedCloudUpdatedAt = '';

        function stopAttendancePolling() {
            if (attendancePollTimer) { clearInterval(attendancePollTimer); attendancePollTimer = null; }
        }

        function startAttendancePolling(dateStr) {
            stopAttendancePolling();
            if (!isCloudConnected || !db || !auth?.currentUser) return;
            const poll = async () => {
                try {
                    const snap = await getDoc(doc(db, ...CLOUD_ROOT, 'attendance_records', dateStr), { source: 'server' });
                    if (!snap.exists()) return;
                    const data = snap.data() || {};
                    const updated = String(data.updatedAt || '');
                    if (!updated || updated === lastAppliedCloudUpdatedAt) return;
                    // Не перетираем более новое локальное изменение своим же старым чтением.
                    const local = String(window.__lastLocalAttendanceUpdatedAt || '');
                    if (local && updated === local) {
                        lastAppliedCloudUpdatedAt = updated;
                        return;
                    }
                    lastAppliedCloudUpdatedAt = updated;
                    window.__realtimeLastSnapshotAt = new Date().toISOString();
                    attendanceState = data.state || {};
                    if (data.weekType) currentWeekType = data.weekType;
                    localStorage.setItem(`toe_att_${dateStr}`, JSON.stringify(data));
                    window.__attendanceFallbackActive = true;
                    if (window.__rtd) {
                        window.__rtd.state.listener = true;
                        window.__rtd.state.lastSnapshot = 'polling: ' + new Date().toLocaleTimeString('ru-RU');
                        window.__rtd.state.lastUpdatedAt = updated;
                        window.__rtd.state.lastSource = 'Firestore (резервная проверка)';
                        window.__rtd.log('POLL UPDATE: сервер изменился; updatedAt=' + updated);
                        window.__rtd.render();
                    }
                    updateWeekTypeButtons(currentWeekType);
                    renderApp();
                } catch (e) {
                    if (window.__rtd) {
                        window.__rtd.log('POLL ERROR: ' + (e?.code || '') + ' ' + (e?.message || e));
                        window.__rtd.render();
                    }
                }
            };
            poll();
            attendancePollTimer = setInterval(poll, 2500);
            window.__attendanceFallbackActive = true;
        }

        function subscribeToAttendance(dateStr) {
            if (!isCloudConnected || !db || !auth?.currentUser) {
                if (window.__rtd) window.__rtd.log('Listener: Firebase/Auth ещё не готовы');
                return false;
            }
            window.__realtimeDate = dateStr;
            if (attendanceUnsubscribe) { try { attendanceUnsubscribe(); } catch(_) {} attendanceUnsubscribe = null; }
            if (attendanceReconnectTimer) { clearTimeout(attendanceReconnectTimer); attendanceReconnectTimer = null; }
            window.__attendanceListenerActive = false;
            const ref = doc(db, ...CLOUD_ROOT, 'attendance_records', dateStr);

            try {
                attendanceUnsubscribe = onSnapshot(ref, { includeMetadataChanges: true }, snap => {
                    window.__attendanceListenerActive = true;
                    attendanceReconnectAttempt = 0;
                    window.__realtimeLastSnapshotAt = new Date().toISOString();
                    if (!snap.exists()) {
                        if (window.__rtd) {
                            window.__rtd.state.listener = true;
                            window.__rtd.state.lastSnapshot = 'документ отсутствует';
                            window.__rtd.state.lastSource = 'Firestore';
                            window.__rtd.log('REALTIME: документ отсутствует');
                            window.__rtd.render();
                        }
                        return;
                    }
                    const data = snap.data() || {};
                    const updated = String(data.updatedAt || '');
                    const source = snap.metadata?.hasPendingWrites ? 'этот браузер → Firestore (pending)' : (snap.metadata?.fromCache ? 'кэш Firestore' : 'Firestore (сервер)');
                    if (updated) lastAppliedCloudUpdatedAt = updated;
                    if (window.__rtd) {
                        window.__rtd.state.listener = true;
                        window.__rtd.state.lastSnapshot = 'получен ' + new Date().toLocaleTimeString('ru-RU');
                        window.__rtd.state.lastUpdatedAt = updated || 'без updatedAt';
                        window.__rtd.state.lastSource = source;
                        window.__rtd.log('REALTIME SNAPSHOT: ' + source + '; updatedAt=' + (updated || '—') + '; state=' + Object.keys(data.state || {}).length + ' записей');
                        window.__rtd.render();
                    }
                    // Не применяем пустой pending-снимок поверх уже сохранённых данных.
                    if (snap.metadata?.hasPendingWrites && !snap.metadata?.fromCache) return;
                    attendanceState = data.state || {};
                    if (data.weekType) currentWeekType = data.weekType;
                    localStorage.setItem(`toe_att_${dateStr}`, JSON.stringify(data));
                    updateWeekTypeButtons(currentWeekType);
                    renderApp();
                }, err => {
                    window.__attendanceListenerActive = false;
                    if (window.__rtd) {
                        window.__rtd.state.listener = false;
                        window.__rtd.log('REALTIME ERROR: ' + (err?.code || '') + ' ' + (err?.message || err));
                        window.__rtd.render();
                    }
                    firebaseDiag.realtime = {ok:false, detail:err?.code ? `${err.code}: ${err.message}` : String(err)};
                    diagLog('Realtime attendance ERROR', firebaseDiag.realtime.detail);
                    renderFirebaseDiagnostic();
                    // Автоматически восстанавливаем listener. Даже если он временно падает,
                    // резервная проверка продолжает синхронизацию каждые 2.5 секунды.
                    attendanceReconnectAttempt = Math.min(attendanceReconnectAttempt + 1, 8);
                    const delay = Math.min(1000 * Math.pow(2, attendanceReconnectAttempt - 1), 15000);
                    if (attendanceReconnectTimer) clearTimeout(attendanceReconnectTimer);
                    attendanceReconnectTimer = setTimeout(() => subscribeToAttendance(dateStr), delay);
                });
                window.__attendanceListenerActive = true;
                firebaseDiag.realtime = {ok:true, detail:'onSnapshot подключён; включена резервная серверная проверка.'};
                if (window.__rtd) {
                    window.__rtd.state.listener = true;
                    window.__rtd.log('Listener подключён: attendance_records/' + dateStr);
                    window.__rtd.render();
                }
            } catch (e) {
                window.__attendanceListenerActive = false;
                if (window.__rtd) { window.__rtd.state.listener = false; window.__rtd.log('REALTIME REGISTER ERROR: ' + (e?.code || '') + ' ' + (e?.message || e)); window.__rtd.render(); }
                firebaseDiag.realtime = {ok:false, detail:e?.code ? `${e.code}: ${e.message}` : String(e)};
                diagLog('Realtime attendance REGISTER ERROR', firebaseDiag.realtime.detail);
                const delay = Math.min(1000 * Math.pow(2, Math.min(attendanceReconnectAttempt++, 7)), 15000);
                attendanceReconnectTimer = setTimeout(() => subscribeToAttendance(dateStr), delay);
            }
            startAttendancePolling(dateStr);
            return true;
        }

        // Делаем функцию доступной диагностической панели и другим частям страницы.
        window.subscribeToAttendance = subscribeToAttendance;

        window.__realtimeManualCheck = async function(){
            if (!isCloudConnected || !db || !auth?.currentUser) { if(window.__rtd)window.__rtd.log('CHECK: Firebase/Auth ещё не готовы'); return; }
            const dateStr=document.getElementById('date-picker')?.value || getCurrentDateStr();
            window.__realtimeDate=dateStr;
            try{
                const snap=await getDoc(doc(db,...CLOUD_ROOT,'attendance_records',dateStr));
                if(!snap.exists()){ if(window.__rtd){window.__rtd.state.lastSnapshot='документ отсутствует';window.__rtd.state.lastSource='getDoc';window.__rtd.log('CHECK: документа нет');window.__rtd.render();} return; }
                const d=snap.data()||{};
                const source=snap.metadata?.fromCache?'кэш':'сервер';
                if(window.__rtd){window.__rtd.state.lastSnapshot='прочитан '+new Date().toLocaleTimeString('ru-RU');window.__rtd.state.lastUpdatedAt=String(d.updatedAt||'без updatedAt');window.__rtd.state.lastSource='getDoc ('+source+')';window.__rtd.log('CHECK READ: '+source+'; updatedAt='+String(d.updatedAt||'без updatedAt')+'; state='+Object.keys(d.state||{}).length);window.__rtd.render();}
            }catch(e){if(window.__rtd){window.__rtd.log('CHECK ERROR: '+(e?.code||'')+' '+(e?.message||e));window.__rtd.render();}}
        };

        function updateWeekTypeButtons(type) {
            const btnNum = document.getElementById('btn-numerator');
            const btnDen = document.getElementById('btn-denominator');
            const weekLabel = document.getElementById('current-week-label');
            if (type === 'numerator') {
                if (btnNum) btnNum.className = "px-2.5 py-1 rounded-md font-semibold transition text-[11px] bg-indigo-600 text-white shadow-xs";
                if (btnDen) btnDen.className = "px-2.5 py-1 rounded-md font-semibold transition text-[11px] text-slate-600 hover:text-slate-900";
                if (weekLabel) weekLabel.innerText = "Текущая неделя: Числитель";
            } else {
                if (btnNum) btnNum.className = "px-2.5 py-1 rounded-md font-semibold transition text-[11px] text-slate-600 hover:text-slate-900";
                if (btnDen) btnDen.className = "px-2.5 py-1 rounded-md font-semibold transition text-[11px] bg-indigo-600 text-white shadow-xs";
                if (weekLabel) weekLabel.innerText = "Текущая неделя: Знаменатель";
            }
        }

        async function initFirebase() {
            // ВАЖНО: ошибка чтения/правил Firestore не должна отключать сам Firebase.
            // Иначе сайт ошибочно переключается в локальный режим даже при успешной инициализации SDK.
            try {
                ({ app, auth, db } = createFirebaseServices());
                firebaseDiag.init = true;
                window.__firebaseDebug.init = true;
                firebaseDiag.error = null;
                diagLog('Firebase initializeApp/getAuth/getFirestore OK');

                // Посетитель остаётся анонимным, а три редактора входят через Firebase Email/Password.
                // Ждём восстановления сохранённой Firebase-сессии, чтобы не перезаписать вход владельца/админа анонимным пользователем.
                try {
                    await setPersistence(auth, browserLocalPersistence);
                    if (typeof auth.authStateReady === 'function') await auth.authStateReady();
                    if (!auth.currentUser) {
                        diagLog('Запрашиваем анонимную авторизацию Firebase для режима просмотра...');
                        await signInAnonymously(auth);
                    }
                    if (!auth.currentUser) throw new Error('Firebase не вернул currentUser после авторизации');

                    applyAccessRoleFromUser(auth.currentUser);
                    if (authStateUnsubscribe) authStateUnsubscribe();
                    authStateUnsubscribe = onAuthStateChanged(auth, user => {
                        if (user) applyAccessRoleFromUser(user);
                        else applyAccessRoleFromUser(null);
                    });

                    userId = auth.currentUser.uid;
                    window.__firebaseUid = auth.currentUser.uid;
                    window.__firebaseDebug.auth = auth.currentUser.uid;
                    const roleLabel = isOwnerRole() ? 'Владелец' : (currentAccessRole === 'admin' ? 'Администратор' : 'Посетитель');
                    firebaseDiag.auth = {ok:true, detail:`Firebase Auth OK. Роль: ${roleLabel}. UID: ${auth.currentUser.uid}`};
                    diagLog('Firebase Auth OK', {uid: auth.currentUser.uid, role: currentAccessRole, login: currentAccountLogin || 'viewer'});
                    isCloudConnected = true;
                    updateCloudBadge(true);
                } catch (e) {
                    firebaseDiag.auth = {ok:false, detail:e?.code ? `${e.code}: ${e.message}` : String(e)};
                    firebaseDiag.error = firebaseDiag.auth.detail;
                    diagLog('FIREBASE AUTH ERROR', firebaseDiag.auth.detail);
                    console.error('Firebase auth error:', e);
                    isCloudConnected = false;
                    updateCloudBadge(false);
                }
            } catch (e) {
                firebaseDiag.init = false;
                firebaseDiag.error = e?.code ? `${e.code}: ${e.message}` : String(e);
                diagLog('FIREBASE INIT ERROR', firebaseDiag.error);
                console.error('Firebase init error:', e);
                isCloudConnected = false;
                updateCloudBadge(false);
            }

            const datePicker = document.getElementById('date-picker');
            const today = datePicker?.value || getCurrentDateStr();
            if (isCloudConnected && db && auth?.currentUser) {
                try {
                    await loadAttendanceForDate(today);
                    subscribeToAttendance(today);
                    subscribeToAttendanceArchive();
                    subscribeToStudents();
                    subscribeToRosterStats();
                    subscribeToGroupInfo();
                    subscribeToAdminPermissions();
                    if (isOwnerRole()) await ensureAdminPermissionsDocument();
                    subscribeToSchedule();
                    startSchedulePolling();
                    diagLog('Облачные обработчики журнала, данных группы и расписания запущены');
                } catch (e) {
                    // Оставляем isCloudConnected=true: это уже ошибка операции Firestore, а не инициализации SDK.
                    firebaseDiag.error = e?.code ? `${e.code}: ${e.message}` : String(e);
                    diagLog('CLOUD OPERATION ERROR', firebaseDiag.error);
                    renderFirebaseDiagnostic();
                }
            } else {
                await loadAttendanceForDate(today);
            }
            renderFirebaseDiagnostic();
        }


        window.addEventListener('DOMContentLoaded', async () => {
            // При каждом новом входе/обновлении страницы журнал открывается на текущей
            // рабочей дате. После ручного выбора другой даты она не меняется сама.
            const todayStr = getCurrentDateStr();
            const effectiveTodayStr = isWeekendDate(todayStr) ? getLastWorkingDate(todayStr) : todayStr;
            const datePicker = document.getElementById('date-picker');
            if (datePicker && !window.__journalDateInitialized) {
                datePicker.value = effectiveTodayStr;
                const label = document.getElementById('calendar-trigger-text');
                if (label) label.textContent = formatCalendarLabel(new Date(effectiveTodayStr + 'T00:00:00'));
                updateSelectedDateUI(effectiveTodayStr);
                window.__journalDateInitialized = true;
            }

            // Сначала сразу показываем интерфейс и список группы.
            try {
                renderGroupInfo();
                renderRosterList();
                renderApp();
            } catch (e) {
                console.warn('Не удалось сразу отрисовать список группы', e);
            }

            // Облачное/резервное сохранение запускаем отдельно.
            try { await initFirebase(); } catch (e) { console.warn('Firebase init skipped', e); }
            try { await loadScheduleData(); } catch (e) { console.warn('Schedule load skipped', e); }
            try {
                renderRosterList();
            } catch (e) {
                console.warn('Повторная отрисовка списка группы не удалась', e);
            }
            try {
                const savedDay = localStorage.getItem('toe_current_schedule_day');
                const savedWeek = localStorage.getItem('toe_schedule_week_type');
                const savedView = localStorage.getItem('toe_current_view');
                restoreScheduleSelection(savedDay, savedWeek);
                syncScheduleToToday();
                if (savedView && ['home','tracker','roster','schedule'].includes(savedView)) {
                    switchView(savedView, true);
                } else {
                    renderSchedule(getCurrentScheduleDay());
                    restoreScrollPosition('home');
                }
            } catch(e) {
                renderSchedule(getCurrentScheduleDay());
            }
            ensureMainViewVisible();
            updateHomeWeekBanner();
            updateHomeTodayCard();
            setInterval(updateHomeTodayCard, 15000);
        });




        let miniCalendarMonth = new Date();

        const ruMonths = ['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];

        function toggleMiniCalendar() {
            const popup = document.getElementById('mini-calendar');
            if (!popup) return;
            const isHidden = popup.classList.contains('is-hidden');
            if (isHidden) {
                const value = document.getElementById('date-picker')?.value;
                const base = value ? new Date(value + 'T00:00:00') : new Date();
                miniCalendarMonth = new Date(base.getFullYear(), base.getMonth(), 1);
                renderMiniCalendar();
                popup.classList.remove('is-hidden');
            } else {
                popup.classList.add('is-hidden');
            }
        }
        window.toggleMiniCalendar = toggleMiniCalendar;
        window.changeMiniCalendarMonth = changeMiniCalendarMonth;

        function changeMiniCalendarMonth(delta) {
            miniCalendarMonth = new Date(miniCalendarMonth.getFullYear(), miniCalendarMonth.getMonth() + delta, 1);
            renderMiniCalendar();
        }

        function getCalendarDateStatus(dateKey) {
            try {
                let raw = localStorage.getItem(`toe_att_${dateKey}`);
                if (!raw) return null;
                const saved = JSON.parse(raw);
                const state = saved?.state || {};
                const expectedStudents = getStudentsForDate(dateKey);
                const marked = expectedStudents.filter(name => state[name]).length;
                if (!marked) return null;
                return marked >= expectedStudents.length ? 'complete' : 'partial';
            } catch (e) { return null; }
        }

        function renderMiniCalendar() {
            const title = document.getElementById('mini-calendar-title');
            const days = document.getElementById('mini-calendar-days');
            if (!title || !days) return;
            title.textContent = `${ruMonths[miniCalendarMonth.getMonth()]} ${miniCalendarMonth.getFullYear()}`;
            days.innerHTML = '';

            const first = new Date(miniCalendarMonth.getFullYear(), miniCalendarMonth.getMonth(), 1);
            const startOffset = (first.getDay() + 6) % 7;
            const daysInMonth = new Date(miniCalendarMonth.getFullYear(), miniCalendarMonth.getMonth() + 1, 0).getDate();
            const prevDays = new Date(miniCalendarMonth.getFullYear(), miniCalendarMonth.getMonth(), 0).getDate();
            const selected = document.getElementById('date-picker')?.value || formatLocalDate(new Date());
            const today = formatLocalDate(new Date());

            for (let i = 0; i < 42; i++) {
                let dayNumber, date;
                if (i < startOffset) {
                    dayNumber = prevDays - startOffset + i + 1;
                    date = new Date(miniCalendarMonth.getFullYear(), miniCalendarMonth.getMonth() - 1, dayNumber);
                } else if (i < startOffset + daysInMonth) {
                    dayNumber = i - startOffset + 1;
                    date = new Date(miniCalendarMonth.getFullYear(), miniCalendarMonth.getMonth(), dayNumber);
                } else {
                    dayNumber = i - startOffset - daysInMonth + 1;
                    date = new Date(miniCalendarMonth.getFullYear(), miniCalendarMonth.getMonth() + 1, dayNumber);
                }
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'mini-calendar-day';
                if (date.getMonth() !== miniCalendarMonth.getMonth()) btn.classList.add('muted');
                const key = formatLocalDate(date);
                const weekend = isWeekendDate(date);
                if (key === today) btn.classList.add('today');
                if (key === selected) btn.classList.add('selected');
                if (weekend) {
                    btn.classList.add('weekend');
                    btn.disabled = true;
                    btn.title = 'В субботу и воскресенье журнал недоступен';
                }
                const calendarStatus = getCalendarDateStatus(key);
                if (calendarStatus) {
                    btn.classList.add('has-data', calendarStatus);
                    btn.title = calendarStatus === 'complete' ? 'Журнал заполнен' : 'Журнал заполнен частично';
                }
                btn.textContent = dayNumber;
                if (!weekend) btn.onclick = () => selectMiniCalendarDate(key);
                days.appendChild(btn);
            }
        }

        async function selectMiniCalendarDate(value) {
            if (isWeekendDate(value)) {
                showToast('В субботу и воскресенье журнал недоступен');
                return;
            }
            const picker = document.getElementById('date-picker');
            if (!picker) return;
            picker.value = value;
            document.getElementById('calendar-trigger-text').textContent = formatCalendarLabel(new Date(value + 'T00:00:00'));
            document.getElementById('mini-calendar')?.classList.add('is-hidden');
            await onDateChanged();
        }
        window.selectMiniCalendarDate = selectMiniCalendarDate;
        window.formatLocalDate = formatLocalDate;

        document.addEventListener('click', function(e) {
            const wrap = document.getElementById('calendar-trigger')?.parentElement;
            const popup = document.getElementById('mini-calendar');
            if (!popup || !wrap) return;
            if (e.target.closest?.('[data-calendar-toggle]')) return;
            if (!wrap.contains(e.target)) popup.classList.add('is-hidden');
        });

        let attendanceState = {};
        let attendanceNotes = {};
        let currentWeekType = 'denominator';

        window.setWeekType = function(type) {
            currentWeekType = type;
            const btnNum = document.getElementById('btn-numerator');
            const btnDen = document.getElementById('btn-denominator');
            const weekLabel = document.getElementById('current-week-label');
            
            if (type === 'numerator') {
                btnNum.className = "px-2.5 py-1 rounded-md font-semibold transition text-[11px] bg-indigo-600 text-white shadow-xs";
                btnDen.className = "px-2.5 py-1 rounded-md font-semibold transition text-[11px] text-slate-600 hover:text-slate-900";
                if (weekLabel) weekLabel.innerText = "Текущая неделя: Числитель";
                showToast("Установлена неделя: Числитель");
            } else {
                btnNum.className = "px-2.5 py-1 rounded-md font-semibold transition text-[11px] text-slate-600 hover:text-slate-900";
                btnDen.className = "px-2.5 py-1 rounded-md font-semibold transition text-[11px] bg-indigo-600 text-white shadow-xs";
                if (weekLabel) weekLabel.innerText = "Текущая неделя: Знаменатель";
                showToast("Установлена неделя: Знаменатель");
            }
            saveCurrentDateState();
        };



        const DEFAULT_GROUP_INFO = {
            groupName: 'ТОЭ-26-9-1',
            curator: 'Негманова Г.Б.',
            headman: 'Синёв Б.П.',
            deputy: '—',
            studentCount: 19
        };

        function readLocalGroupInfo() {
            try {
                const saved = JSON.parse(localStorage.getItem('toe_group_info') || '{}');
                return { ...DEFAULT_GROUP_INFO, ...saved };
            } catch (e) {
                return { ...DEFAULT_GROUP_INFO };
            }
        }

        let groupInfoState = readLocalGroupInfo();

        function getGroupInfo() {
            return { ...DEFAULT_GROUP_INFO, ...groupInfoState };
        }

        function saveGroupInfoLocally(info) {
            groupInfoState = { ...DEFAULT_GROUP_INFO, ...info };
            localStorage.setItem('toe_group_info', JSON.stringify(groupInfoState));
            renderGroupInfo();
        }

        function renderGroupInfo() {
            const info = getGroupInfo();
            const ids = {
                'group-name': info.groupName,
                'group-name-footer': info.groupName,
                'tracker-group-name': info.groupName,
                'schedule-group-name': info.groupName,
                'roster-group-name': info.groupName,
                'group-curator': info.curator,
                'group-headman': info.headman,
                'group-deputy': info.deputy,
                'group-student-count': students.length,
                'group-student-count-card': students.length,
                'tracker-curator': info.curator,
                'roster-student-count': students.length
            };
            Object.entries(ids).forEach(([id, value]) => {
                const el = document.getElementById(id);
                if (el) el.textContent = value;
            });
        }

        function normalizeGroupInfoCloudData(data = {}) {
            return {
                groupName: data.groupName ?? DEFAULT_GROUP_INFO.groupName,
                curator: data.curator ?? DEFAULT_GROUP_INFO.curator,
                headman: data.headman ?? DEFAULT_GROUP_INFO.headman,
                deputy: data.deputy ?? DEFAULT_GROUP_INFO.deputy,
                studentCount: Number.isFinite(Number(data.studentCount)) ? Number(data.studentCount) : DEFAULT_GROUP_INFO.studentCount
            };
        }

        function applyCloudGroupInfo(data = {}) {
            const updatedAt = String(data.updatedAt || '');
            if (updatedAt && updatedAt === lastGroupInfoUpdatedAt) return;
            if (updatedAt) lastGroupInfoUpdatedAt = updatedAt;
            saveGroupInfoLocally(normalizeGroupInfoCloudData(data));
            setupInlineGroupEditing();
        }

        async function persistGroupInfoToCloud(info) {
            if (!canEditGroupInfo()) return false;
            if (!isCloudConnected || !db || !auth?.currentUser) return false;
            const payload = {
                ...DEFAULT_GROUP_INFO,
                ...info,
                updatedAt: new Date().toISOString(),
                build: window.__SITE_BUILD__
            };
            try {
                // Используем тот же раздел attendance_records, где уже работает журнал.
                // Специальное имя документа не пересекается с датами YYYY-MM-DD.
                await setDoc(doc(db, ...CLOUD_ROOT, 'attendance_records', GROUP_INFO_DOC_ID), payload, { merge: false });
                lastGroupInfoUpdatedAt = payload.updatedAt;
                return true;
            } catch (e) {
                console.warn('Не удалось сохранить данные группы в облако', e);
                return false;
            }
        }

        async function pollGroupInfoOnce() {
            if (!isCloudConnected || !db || !auth?.currentUser) return;
            try {
                const snap = await getDoc(doc(db, ...CLOUD_ROOT, 'attendance_records', GROUP_INFO_DOC_ID));
                if (snap.exists()) applyCloudGroupInfo(snap.data() || {});
            } catch (e) {
                console.warn('Group info polling error', e);
            }
        }

        function startGroupInfoPolling() {
            if (groupInfoPollTimer) clearInterval(groupInfoPollTimer);
            groupInfoPollTimer = setInterval(() => { void pollGroupInfoOnce(); }, 5000);
        }

        function subscribeToGroupInfo() {
            if (!isCloudConnected || !db || !auth?.currentUser) return false;
            if (groupInfoUnsubscribe) {
                try { groupInfoUnsubscribe(); } catch (_) {}
                groupInfoUnsubscribe = null;
            }
            const ref = doc(db, ...CLOUD_ROOT, 'attendance_records', GROUP_INFO_DOC_ID);
            try {
                groupInfoUnsubscribe = onSnapshot(ref, async snap => {
                    if (snap.exists()) {
                        applyCloudGroupInfo(snap.data() || {});
                        return;
                    }

                    // Однократная миграция из предыдущего облачного пути step5.
                    try {
                        const oldSnap = await getDoc(doc(db, ...CLOUD_ROOT, 'schedule', 'group_info'));
                        if (oldSnap.exists()) {
                            const migrated = normalizeGroupInfoCloudData(oldSnap.data() || {});
                            saveGroupInfoLocally(migrated);
                            await persistGroupInfoToCloud(migrated);
                            return;
                        }
                    } catch (_) {}

                    // Первый облачный документ может создать только владелец.
                    if (canEditGroupInfo()) await persistGroupInfoToCloud(getGroupInfo());
                }, err => {
                    console.warn('Realtime group info error', err);
                });
                startGroupInfoPolling();
                return true;
            } catch (e) {
                console.warn('Group info listener registration error', e);
                startGroupInfoPolling();
                return false;
            }
        }

        function renderStudentDependentViews() {
            renderGroupInfo();
            const roster = document.getElementById('roster-container');
            if (roster) renderRosterList();
            const journal = document.getElementById('students-container');
            if (journal) renderApp();
            renderMiniCalendar();
        }

        function syncStudentCountLocally() {
            const info = getGroupInfo();
            if (Number(info.studentCount) === students.length) {
                renderGroupInfo();
                return;
            }
            saveGroupInfoLocally({ ...info, studentCount: students.length });
        }

        async function syncStudentCountToCloud() {
            if (!canEditGroupInfo()) return false;
            const info = { ...getGroupInfo(), studentCount: students.length };
            saveGroupInfoLocally(info);
            return persistGroupInfoToCloud(info);
        }

        function applyStudentsPayload(data = {}) {
            const updatedAt = String(data.updatedAt || '');
            if (updatedAt && updatedAt === lastStudentsUpdatedAt) return;
            if (!Array.isArray(data.students)) return;
            const incoming = normalizeStudentRecords(data.students);
            if (!incoming.length && data.students.length > 0) return;
            if (updatedAt) lastStudentsUpdatedAt = updatedAt;
            storeStudentRecordsLocally(incoming);
            syncStudentCountLocally();
            rosterStatsReady = false;
            renderStudentDependentViews();
            scheduleRosterStatsRebuild(200);
        }

        async function persistStudentsToCloud(records = studentRecords) {
            if (!canManageStudents()) return false;
            const normalized = normalizeStudentRecords(records);
            storeStudentRecordsLocally(normalized);
            syncStudentCountLocally();
            renderStudentDependentViews();
            rosterStatsReady = false;
            scheduleRosterStatsRebuild(150);

            if (!isCloudConnected || !db || !auth?.currentUser) return false;
            const payload = {
                students: normalized,
                updatedAt: new Date().toISOString(),
                build: window.__SITE_BUILD__
            };
            try {
                await setDoc(doc(db, ...CLOUD_ROOT, 'attendance_records', STUDENTS_DOC_ID), payload, { merge: false });
                lastStudentsUpdatedAt = payload.updatedAt;
                await syncStudentCountToCloud();
                return true;
            } catch (e) {
                console.warn('Не удалось сохранить состав группы в облако', e);
                return false;
            }
        }

        async function pollStudentsOnce() {
            if (!isCloudConnected || !db || !auth?.currentUser) return;
            try {
                const snap = await getDoc(doc(db, ...CLOUD_ROOT, 'attendance_records', STUDENTS_DOC_ID));
                if (snap.exists()) applyStudentsPayload(snap.data() || {});
            } catch (e) {
                console.warn('Students polling error', e);
            }
        }

        function startStudentsPolling() {
            if (studentsPollTimer) clearInterval(studentsPollTimer);
            studentsPollTimer = setInterval(() => { void pollStudentsOnce(); }, 5000);
        }

        function subscribeToStudents() {
            if (!isCloudConnected || !db || !auth?.currentUser) return false;
            if (studentsUnsubscribe) {
                try { studentsUnsubscribe(); } catch (_) {}
                studentsUnsubscribe = null;
            }
            const ref = doc(db, ...CLOUD_ROOT, 'attendance_records', STUDENTS_DOC_ID);
            try {
                studentsUnsubscribe = onSnapshot(ref, async snap => {
                    if (snap.exists()) {
                        applyStudentsPayload(snap.data() || {});
                    } else if (canManageStudents()) {
                        await persistStudentsToCloud(studentRecords);
                    }
                }, err => {
                    console.warn('Realtime students error', err);
                });
                startStudentsPolling();
                return true;
            } catch (e) {
                console.warn('Students listener registration error', e);
                startStudentsPolling();
                return false;
            }
        }

        window.addStudent = async function() {
            if (!canManageStudents()) {
                showToast('Нет права на изменение состава группы');
                return;
            }
            const input = document.getElementById('new-student-name');
            const name = normalizeStudentName(input?.value);
            if (!name) {
                showToast('Введите фамилию и имя студента');
                input?.focus();
                return;
            }
            if (name.length > 80 || /[<>&"'`]/.test(name)) {
                showToast('Проверьте имя студента');
                input?.focus();
                return;
            }
            if (students.some(existing => existing.toLocaleLowerCase('ru-RU') === name.toLocaleLowerCase('ru-RU'))) {
                showToast('Такой студент уже есть в группе');
                return;
            }

            const next = [...studentRecords, { name, joinedAt: getCurrentDateStr() }];
            const cloudOk = await persistStudentsToCloud(next);
            if (input) input.value = '';
            showToast(cloudOk ? `Студент ${name} добавлен в облако` : `Студент ${name} добавлен только на этом устройстве`);
        };

        window.removeStudent = async function(index) {
            if (!canManageStudents()) {
                showToast('Нет права на изменение состава группы');
                return;
            }
            const record = studentRecords[index];
            if (!record) return;
            if (!confirm(`Убрать ${record.name} из группы? Старые записи посещаемости останутся в архиве.`)) return;
            const next = studentRecords.filter((_, i) => i !== index);
            const cloudOk = await persistStudentsToCloud(next);
            showToast(cloudOk ? `${record.name} удалён из состава группы` : `${record.name} удалён только на этом устройстве`);
        };

        window.saveGroupInfo = async function() {
            if (!canEditGroupInfo()) { showToast('Нет права на изменение данных главной страницы'); return; }
            const info = getGroupInfo();
            saveGroupInfoLocally(info);
            const cloudOk = await persistGroupInfoToCloud(info);
            showToast(cloudOk ? 'Данные группы сохранены в облаке' : 'Данные группы сохранены только на этом устройстве');
        };

        function makeGroupFieldEditable(el) {
            if (!el) return;
            if (el.dataset.groupField === 'studentCount') {
                el.contentEditable = 'false';
                el.title = 'Количество меняется автоматически по составу группы';
            } else {
                el.contentEditable = canEditGroupInfo() ? 'true' : 'false';
            }
            el.setAttribute('spellcheck', 'false');
        }

        async function syncGroupFieldFromDisplay(el) {
            if (!el || !canEditGroupInfo()) return;
            const field = el.dataset.groupField;
            const info = getGroupInfo();
            let value = el.textContent.trim();
            if (field === 'studentCount') {
                value = String(Math.max(0, Math.min(999, parseInt(value.replace(/[^0-9]/g, ''), 10) || 0)));
            } else {
                value = value || (field === 'deputy' ? '—' : '');
            }
            info[field] = field === 'studentCount' ? Number(value) : value;
            saveGroupInfoLocally(info);
            updateAdminUI();
            const cloudOk = await persistGroupInfoToCloud(info);
            showToast(cloudOk ? 'Данные группы сохранены в облаке' : 'Данные группы сохранены только на этом устройстве');
        }

        function setupInlineGroupEditing() {
            document.querySelectorAll('.admin-inline-edit').forEach(el => {
                makeGroupFieldEditable(el);
                if (el.dataset.inlineBound === '1') return;
                el.dataset.inlineBound = '1';
                el.addEventListener('blur', () => { void syncGroupFieldFromDisplay(el); });
                el.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
                    if (e.key === 'Escape') { renderGroupInfo(); el.blur(); }
                });
            });
        }

        function loadGroupInfoToAdminForm() {
            // Данные группы больше не дублируются в окне настроек.
            // Редактирование выполняется прямо в месте их отображения на главной.
            setupInlineGroupEditing();
        }

        // Настройки доступа: владелец + два администратора. Обычные посетители работают без входа.
        window.openAdminSettings = function() {
            const modal = document.getElementById('admin-settings-modal');
            modal.classList.remove('hidden');
            modal.classList.add('flex');
            document.body.classList.add('settings-open');
            if (canEditGroupInfo()) loadGroupInfoToAdminForm();
            document.getElementById('admin-login-box')?.classList.toggle('hidden', isEditorRole());
            document.getElementById('admin-panel')?.classList.toggle('hidden', !isEditorRole());
            updateAdminUI();
        };

        window.closeAdminSettings = function() {
            const modal = document.getElementById('admin-settings-modal');
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            document.body.classList.remove('settings-open');
        };

        window.adminLogin = async function() {
            if (!auth) { showToast('Firebase ещё загружается. Попробуйте через пару секунд.'); return; }
            const loginInput = document.getElementById('admin-login');
            const passwordInput = document.getElementById('admin-password');
            const button = document.getElementById('admin-login-btn');
            const login = String(loginInput?.value || '').trim().toLowerCase();
            const password = String(passwordInput?.value || '');
            const account = AUTH_ACCOUNTS[login];
            if (!account) { showToast('Неизвестный логин'); loginInput?.focus(); return; }
            if (!password) { showToast('Введите пароль'); passwordInput?.focus(); return; }
            if (button) { button.disabled = true; button.textContent = 'Вход…'; }
            try {
                const credential = await signInWithEmailAndPassword(auth, account.email, password);
                applyAccessRoleFromUser(credential.user);
                if (currentAccessRole === 'viewer') throw new Error('У этой учётной записи нет прав редактора');
                if (isOwnerRole()) await ensureAdminPermissionsDocument();
                if (loginInput) loginInput.value = '';
                if (passwordInput) passwordInput.value = '';
                document.getElementById('admin-login-box')?.classList.add('hidden');
                document.getElementById('admin-panel')?.classList.remove('hidden');
                showToast(isOwnerRole() ? 'Вход выполнен: Владелец' : `${account.label}: вход выполнен`);
            } catch (e) {
                console.warn('Editor login failed', e);
                const code = String(e?.code || '');
                if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) showToast('Неверный логин или пароль');
                else if (code.includes('operation-not-allowed')) showToast('В Firebase нужно включить вход Email/Password');
                else showToast('Не удалось войти');
            } finally {
                if (button) { button.disabled = false; button.textContent = 'Войти'; }
            }
        };

        function renderOwnerPermissionControls() {
            const section = document.getElementById('owner-permissions-section');
            if (section) section.classList.toggle('hidden', !canManageAdminPermissions());
            const keys = ['journal', 'schedule', 'groupInfo', 'students', 'backups', 'manageAdmins', 'notifications', 'support'];
            ['admin1', 'admin2'].forEach(login => {
                const perms = adminPermissions[login] || DEFAULT_ADMIN_PERMISSIONS[login];
                keys.forEach(key => {
                    const input = document.getElementById(`perm-${login}-${key}`);
                    if (input) input.checked = !!perms[key];
                });
            });
        }

        function applyAdminPermissionsPayload(data = {}) {
            const next = normalizeAdminPermissions(data);
            adminPermissions = next;
            const updatedAt = String(data.updatedAt || '');
            if (updatedAt) lastAdminPermissionsUpdatedAt = updatedAt;
            try { localStorage.setItem('toe_admin_permissions', JSON.stringify(next)); } catch (_) {}
            syncSessionPermissionFlags();
            renderOwnerPermissionControls();
            updateAdminUI();
            renderApp();
            renderSchedule(getCurrentScheduleDay());
        }

        async function persistAdminPermissionsToCloud(nextPermissions) {
            if (!canManageAdminPermissions() || !db || !auth?.currentUser) return false;
            const normalized = normalizeAdminPermissions(nextPermissions);
            const payload = {
                ...normalized,
                updatedAt: new Date().toISOString(),
                updatedBy: currentAccountLogin || 'owner',
                build: window.__SITE_BUILD__
            };
            await setDoc(doc(db, ...CLOUD_ROOT, 'access', ADMIN_PERMISSIONS_DOC_ID), payload, { merge: false });
            applyAdminPermissionsPayload(payload);
            return true;
        }

        async function ensureAdminPermissionsDocument() {
            if (!isOwnerRole() || !db || !auth?.currentUser) return false;
            try {
                const ref = doc(db, ...CLOUD_ROOT, 'access', ADMIN_PERMISSIONS_DOC_ID);
                const snap = await getDoc(ref);
                if (snap.exists()) {
                    applyAdminPermissionsPayload(snap.data() || {});
                    return true;
                }
                return persistAdminPermissionsToCloud(adminPermissions);
            } catch (e) {
                console.warn('Admin permissions initialization error', e);
                return false;
            }
        }

        async function pollAdminPermissionsOnce() {
            if (!isCloudConnected || !db || !auth?.currentUser) return;
            try {
                const snap = await getDoc(doc(db, ...CLOUD_ROOT, 'access', ADMIN_PERMISSIONS_DOC_ID), { source: 'server' });
                if (snap.exists()) {
                    const data = snap.data() || {};
                    const updatedAt = String(data.updatedAt || '');
                    if (!updatedAt || updatedAt !== lastAdminPermissionsUpdatedAt) applyAdminPermissionsPayload(data);
                }
            } catch (e) {
                console.warn('Admin permissions polling error', e);
            }
        }

        function startAdminPermissionsPolling() {
            if (adminPermissionsPollTimer) clearInterval(adminPermissionsPollTimer);
            adminPermissionsPollTimer = setInterval(() => { void pollAdminPermissionsOnce(); }, 5000);
        }

        function subscribeToAdminPermissions() {
            if (!isCloudConnected || !db || !auth?.currentUser) return false;
            if (adminPermissionsUnsubscribe) {
                try { adminPermissionsUnsubscribe(); } catch (_) {}
                adminPermissionsUnsubscribe = null;
            }
            const ref = doc(db, ...CLOUD_ROOT, 'access', ADMIN_PERMISSIONS_DOC_ID);
            try {
                adminPermissionsUnsubscribe = onSnapshot(ref, snap => {
                    if (snap.exists()) applyAdminPermissionsPayload(snap.data() || {});
                }, err => {
                    console.warn('Realtime admin permissions error', err);
                });
                startAdminPermissionsPolling();
                return true;
            } catch (e) {
                console.warn('Admin permissions listener registration error', e);
                startAdminPermissionsPolling();
                return false;
            }
        }

        window.saveAdminPermissions = async function() {
            if (!canManageAdminPermissions()) { showToast('Нет права на управление администраторами'); return; }
            const button = document.getElementById('save-admin-permissions-btn');
            const status = document.getElementById('admin-permissions-status');
            const readPermissions = (login) => ({
                journal: !!document.getElementById(`perm-${login}-journal`)?.checked,
                schedule: !!document.getElementById(`perm-${login}-schedule`)?.checked,
                groupInfo: !!document.getElementById(`perm-${login}-groupInfo`)?.checked,
                students: !!document.getElementById(`perm-${login}-students`)?.checked,
                backups: !!document.getElementById(`perm-${login}-backups`)?.checked,
                manageAdmins: !!document.getElementById(`perm-${login}-manageAdmins`)?.checked,
                notifications: !!document.getElementById(`perm-${login}-notifications`)?.checked,
                support: !!document.getElementById(`perm-${login}-support`)?.checked
            });
            const next = {
                admin1: readPermissions('admin1'),
                admin2: readPermissions('admin2')
            };
            if (button) { button.disabled = true; button.textContent = 'Сохранение…'; }
            if (status) status.textContent = 'Сохраняем права в Firebase…';
            try {
                await persistAdminPermissionsToCloud(next);
                if (status) status.textContent = 'Права сохранены и применяются на всех устройствах.';
                showToast('Права администраторов сохранены');
            } catch (e) {
                console.error('Admin permissions save error', e);
                if (status) status.textContent = 'Не удалось сохранить права. Проверьте Firebase Rules.';
                showToast('Не удалось сохранить права');
            } finally {
                if (button) { button.disabled = false; button.textContent = 'Сохранить права'; }
            }
        };


        function ensureMainViewVisible() {
            const viewIds = ['view-home','view-tracker','view-roster','view-schedule'];
            const views = viewIds.map(id => document.getElementById(id)).filter(Boolean);
            if (!views.length) return;
            const hasVisibleView = views.some(el => !el.classList.contains('hidden'));
            const bottomNav = document.getElementById('bottom-nav');
            if (bottomNav) bottomNav.classList.remove('hidden');
            if (!hasVisibleView) {
                views.forEach(el => el.classList.add('hidden'));
                const home = document.getElementById('view-home');
                if (home) home.classList.remove('hidden');
                try { localStorage.setItem('toe_current_view', 'home'); } catch (_) {}
                document.querySelectorAll('#bottom-nav button[data-nav]').forEach(btn =>
                    btn.classList.toggle('active', btn.dataset.nav === 'home')
                );
            }
        }

        function updateAdminUI() {
            const editor = isEditorRole();
            const owner = isOwnerRole();
            const journalAllowed = canEditJournal();
            const scheduleAllowed = canEditSchedule();
            const groupInfoAllowed = canEditGroupInfo();
            const studentsAllowed = canManageStudents();
            const backupsAllowed = canUseBackups();
            const adminRightsAllowed = canManageAdminPermissions();

            document.body.classList.toggle('admin-mode', editor);
            document.body.classList.toggle('owner-mode', owner);
            document.body.classList.toggle('journal-edit-mode', journalAllowed);
            document.body.classList.toggle('schedule-edit-mode', scheduleAllowed);
            document.body.classList.toggle('group-info-edit-mode', groupInfoAllowed);
            document.body.classList.toggle('students-edit-mode', studentsAllowed);

            const hint = document.getElementById('journal-admin-hint');
            if (hint) {
                hint.classList.toggle('hidden', journalAllowed);
                if (!journalAllowed && currentAccessRole === 'admin') hint.innerHTML = '<i class="fa-solid fa-lock"></i> Нет права на редактирование журнала';
                else if (!journalAllowed) hint.innerHTML = '<i class="fa-solid fa-lock"></i> Изменение журнала доступно только после входа с соответствующими правами';
            }
            const journalTools = document.getElementById('journal-edit-tools');
            if (journalTools) journalTools.classList.toggle('hidden', !journalAllowed);
            const manualSave = document.getElementById('manual-save-journal-btn');
            if (manualSave) manualSave.classList.toggle('hidden', !journalAllowed);
            const rosterTools = document.getElementById('roster-admin-tools');
            if (rosterTools) rosterTools.classList.toggle('hidden', !studentsAllowed);

            const loginBox = document.getElementById('admin-login-box');
            const panel = document.getElementById('admin-panel');
            if (loginBox) loginBox.classList.toggle('hidden', editor);
            if (panel) panel.classList.toggle('hidden', !editor);
            const backup = document.getElementById('owner-backup-section');
            if (backup) backup.classList.toggle('hidden', !backupsAllowed);
            const permissionsSection = document.getElementById('owner-permissions-section');
            if (permissionsSection) permissionsSection.classList.toggle('hidden', !adminRightsAllowed);

            const banner = document.getElementById('admin-role-banner');
            const description = document.getElementById('admin-role-description');
            if (banner) banner.textContent = owner ? 'Владелец: полный доступ включён.' : (editor ? `${AUTH_ACCOUNTS[currentAccountLogin]?.label || 'Администратор'}: вход выполнен.` : '');
            if (description) {
                if (owner) {
                    description.textContent = 'Доступно всё: главная страница, состав группы, журнал, расписание, управление правами и резервные копии.';
                } else if (editor) {
                    const labels = [
                        [journalAllowed, 'журнал'],
                        [scheduleAllowed, 'расписание'],
                        [groupInfoAllowed, 'главная информация'],
                        [studentsAllowed, 'состав группы'],
                        [backupsAllowed, 'резервные копии'],
                        [adminRightsAllowed, 'управление правами'],
                        [canPublishNotificationsPermission(), 'уведомления'],
                        [canUseSupportStaff(), 'поддержка']
                    ].filter(([allowed]) => allowed).map(([, label]) => label);
                    description.textContent = labels.length
                        ? `Разрешено владельцем: ${labels.join(', ')}.`
                        : 'Владелец отключил все права редактирования. Сейчас доступен только просмотр сайта.';
                } else {
                    description.textContent = '';
                }
            }
            renderOwnerPermissionControls();
            setupInlineGroupEditing();
            renderRosterList();
            try { renderSchedule(getCurrentScheduleDay()); } catch (_) {}
            // После восстановления Firebase-роли ни один сценарий не должен оставлять приложение без видимого раздела.
            setTimeout(ensureMainViewVisible, 0);
        }

        window.adminLogout = async function() {
            try {
                if (auth) await signOut(auth);
                applyAccessRoleFromUser(null);
                if (auth) {
                    await signInAnonymously(auth);
                    applyAccessRoleFromUser(auth.currentUser);
                }
                updateAdminUI();
                closeAdminSettings();
                showToast('Вы вышли из редактора');
            } catch (e) {
                console.warn('Editor logout failed', e);
                applyAccessRoleFromUser(null);
                updateAdminUI();
                closeAdminSettings();
                showToast('Вы вышли из редактора');
            }
        };

        updateAdminUI();
        renderGroupInfo();
        updateBackupStatus();

        // Запоминаем не только открытый раздел, но и точное положение страницы.
        // Поэтому после перезагрузки каждый раздел возвращается туда, где его оставили.
        function saveCurrentScrollPosition() {
            try {
                const currentView = localStorage.getItem('toe_current_view') || 'home';
                localStorage.setItem(`toe_scroll_${currentView}`, String(window.scrollY || window.pageYOffset || 0));
            } catch (e) {}
        }

        function restoreScrollPosition(viewName) {
            let saved = 0;
            try { saved = parseInt(localStorage.getItem(`toe_scroll_${viewName}`) || '0', 10) || 0; } catch (e) {}
            requestAnimationFrame(() => {
                requestAnimationFrame(() => window.scrollTo({ top: saved, left: 0, behavior: 'auto' }));
            });
        }

        let scrollSaveTimer = null;
        window.addEventListener('scroll', () => {
            clearTimeout(scrollSaveTimer);
            scrollSaveTimer = setTimeout(saveCurrentScrollPosition, 80);
        }, { passive: true });

        window.addEventListener('beforeunload', saveCurrentScrollPosition);

        window.switchView = function(viewName, fromReload = false) {
            saveCurrentScrollPosition();
            try { localStorage.setItem('toe_current_view', viewName); } catch(e) {}

            document.getElementById('view-home').classList.add('hidden');
            document.getElementById('view-tracker').classList.add('hidden');
            document.getElementById('view-roster').classList.add('hidden');
            document.getElementById('view-schedule').classList.add('hidden');

            document.querySelectorAll('#bottom-nav button[data-nav]').forEach(btn => btn.classList.toggle('active', btn.dataset.nav === viewName));
            const bottomNav = document.getElementById('bottom-nav');
            if (bottomNav) bottomNav.classList.toggle('hidden', false);
            if (viewName === 'home') {
                document.getElementById('view-home').classList.remove('hidden');
            } else if (viewName === 'tracker') {
                document.getElementById('view-tracker').classList.remove('hidden');
                renderApp();
            } else if (viewName === 'roster') {
                document.getElementById('view-roster').classList.remove('hidden');
            } else if (viewName === 'schedule') {
                document.getElementById('view-schedule').classList.remove('hidden');
                syncScheduleToToday();
                renderSchedule(getCurrentScheduleDay());
            }
            restoreScrollPosition(viewName);
        };


        async function collectBackupSnapshot() {
            const data = {};
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && (key.startsWith('toe_') || key === 'toe_current_view')) data[key] = localStorage.getItem(key);
            }
            data['toe_backup_current_view'] = localStorage.getItem('toe_current_view') || 'home';
            data['toe_backup_created_at'] = new Date().toISOString();
            return { version: 1, createdAt: new Date().toISOString(), data };
        }

        async function createAutomaticBackup() {
            const snapshot = await collectBackupSnapshot();
            const serialized = JSON.stringify(snapshot);
            await dbPut('toe_full_backup_latest', serialized);
            try { localStorage.setItem('toe_full_backup_latest_meta', JSON.stringify({ createdAt: snapshot.createdAt })); } catch(e) {}
        }

        async function cleanupOldAttendanceBackups(keepCount = 30) {
            try {
                const keys = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith('toe_att_backup_')) keys.push(key);
                }
                keys.sort((a,b) => b.localeCompare(a));
                for (const key of keys.slice(keepCount)) {
                    localStorage.removeItem(key);
                    try { await dbDelete(key); } catch(e) {}
                }
            } catch(e) { console.warn('Очистка старых резервных копий не выполнена', e); }
        }

        window.createManualBackup = async function() {
            if (!canUseBackups()) { showToast('Нет права на резервные копии'); return; }
            try {
                await createAutomaticBackup();
                updateBackupStatus();
                showToast('Резервная копия создана');
            } catch (e) { showToast('Не удалось создать копию'); console.warn(e); }
        };

        window.restoreLatestBackup = async function() {
            if (!canUseBackups()) { showToast('Нет права на резервные копии'); return; }
            if (!confirm('Восстановить данные из последней резервной копии? Текущие локальные данные будут заменены.')) return;
            try {
                const raw = await dbGet('toe_full_backup_latest');
                if (!raw) { showToast('Резервная копия не найдена'); return; }
                const snapshot = JSON.parse(raw);
                Object.entries(snapshot.data || {}).forEach(([key, value]) => {
                    if (key === 'toe_full_backup_latest_meta' || key === 'toe_backup_created_at') return;
                    localStorage.setItem(key, value);
                });
                const today = getCurrentDateStr();
                const picker = document.getElementById('date-picker');
                if (picker) picker.value = picker.value || today;
                await loadAttendanceForDate(picker?.value || today);
                await loadScheduleData();
                renderGroupInfo();
                renderSchedule(getCurrentScheduleDay());
                renderRosterList();
                renderApp();
                updateBackupStatus();
                showToast('Данные восстановлены');
            } catch (e) {
                console.warn('Восстановление не удалось', e);
                showToast('Не удалось восстановить данные');
            }
        };

        async function updateBackupStatus() {
            const el = document.getElementById('backup-status');
            if (!el) return;
            try {
                const raw = await dbGet('toe_full_backup_latest');
                if (!raw) { el.textContent = 'Резервная копия ещё не создана'; return; }
                const snap = JSON.parse(raw);
                const d = new Date(snap.createdAt);
                el.textContent = `Последняя копия: ${d.toLocaleString('ru-RU', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'})}`;
            } catch(e) { el.textContent = 'Резервная копия доступна локально'; }
        }

        function readLocalAttendanceArchive() {
            const archive = {};
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                const match = key?.match(/^toe_att_(\d{4}-\d{2}-\d{2})$/);
                if (!match) continue;
                try {
                    const saved = JSON.parse(localStorage.getItem(key));
                    if (saved?.state && typeof saved.state === 'object') archive[match[1]] = saved;
                } catch (e) {}
            }
            return archive;
        }

        function getAttendanceArchiveForStats() {
            if (isCloudConnected && attendanceArchiveReady) return attendanceArchive;
            return readLocalAttendanceArchive();
        }

        function emptyAttendanceStats() {
            return { total: 0, present: 0, late: 0, sick: 0, excused: 0, unexcused: 0, absent: 0, attendancePercent: 0 };
        }

        function computeRosterStatsFromArchive(archive) {
            const byStudent = {};
            students.forEach(name => { byStudent[name] = emptyAttendanceStats(); });
            Object.values(archive || {}).forEach(saved => {
                const state = saved?.state;
                if (!state || typeof state !== 'object') return;
                students.forEach(name => {
                    if (!(name in state)) return;
                    const status = state[name];
                    const stats = byStudent[name];
                    if (stats && stats[status] !== undefined) {
                        stats[status]++;
                        stats.total++;
                    }
                });
            });
            students.forEach(name => {
                const stats = byStudent[name];
                stats.absent = stats.sick + stats.excused + stats.unexcused;
                stats.attendancePercent = stats.total > 0 ? Math.round((stats.present / stats.total) * 100) : 0;
            });
            return byStudent;
        }

        function makeRosterStatsPayload(byStudent) {
            return {
                students: students.map(name => ({ name, stats: byStudent[name] || emptyAttendanceStats() })),
                updatedAt: new Date().toISOString(),
                build: window.__SITE_BUILD__
            };
        }

        function applyRosterStatsPayload(data = {}) {
            const next = {};
            const rows = Array.isArray(data.students) ? data.students : [];
            rows.forEach(row => {
                if (!row || typeof row.name !== 'string' || !row.stats) return;
                next[row.name] = { ...emptyAttendanceStats(), ...row.stats };
            });
            rosterStatsByStudent = next;
            rosterStatsReady = rows.length > 0;
            renderRosterList();
        }

        async function rebuildRosterStatsFromCloud() {
            if (!canEditJournal()) return false;
            if (!isCloudConnected || !db || !auth?.currentUser) return false;
            if (rosterStatsRebuildInFlight) {
                rosterStatsRebuildPending = true;
                return false;
            }
            rosterStatsRebuildInFlight = true;
            rosterStatsRebuildPending = false;
            try {
                const snapshot = await getDocs(collection(db, ...CLOUD_ROOT, 'attendance_records'));
                const cloudArchive = {};
                snapshot.forEach(snap => {
                    if (!/^\d{4}-\d{2}-\d{2}$/.test(snap.id)) return;
                    const data = snap.data() || {};
                    if (data.state && typeof data.state === 'object') cloudArchive[snap.id] = data;
                });
                attendanceArchive = cloudArchive;
                attendanceArchiveReady = true;
                const byStudent = computeRosterStatsFromArchive(cloudArchive);
                const payload = makeRosterStatsPayload(byStudent);
                await setDoc(doc(db, ...CLOUD_ROOT, 'attendance_records', ROSTER_STATS_DOC_ID), payload, { merge: false });
                applyRosterStatsPayload(payload);
                return true;
            } catch (e) {
                console.warn('Roster stats cloud rebuild error', e);
                return false;
            } finally {
                rosterStatsRebuildInFlight = false;
                if (rosterStatsRebuildPending) {
                    rosterStatsRebuildPending = false;
                    scheduleRosterStatsRebuild(200);
                }
            }
        }

        function scheduleRosterStatsRebuild(delay = 700) {
            if (!canEditJournal()) return;
            if (rosterStatsRebuildTimer) clearTimeout(rosterStatsRebuildTimer);
            rosterStatsRebuildTimer = setTimeout(() => { void rebuildRosterStatsFromCloud(); }, delay);
        }

        function subscribeToRosterStats() {
            if (!isCloudConnected || !db || !auth?.currentUser) return false;
            if (rosterStatsUnsubscribe) {
                try { rosterStatsUnsubscribe(); } catch (_) {}
                rosterStatsUnsubscribe = null;
            }
            const ref = doc(db, ...CLOUD_ROOT, 'attendance_records', ROSTER_STATS_DOC_ID);
            try {
                rosterStatsUnsubscribe = onSnapshot(ref, snap => {
                    if (snap.exists()) applyRosterStatsPayload(snap.data() || {});
                    else scheduleRosterStatsRebuild(150);
                }, err => {
                    rosterStatsReady = false;
                    console.warn('Realtime roster stats error', err);
                    renderRosterList();
                });
                return true;
            } catch (e) {
                rosterStatsReady = false;
                console.warn('Roster stats listener registration error', e);
                return false;
            }
        }

        function subscribeToAttendanceArchive() {
            if (!isCloudConnected || !db || !auth?.currentUser) return false;
            if (attendanceArchiveUnsubscribe) {
                try { attendanceArchiveUnsubscribe(); } catch (_) {}
                attendanceArchiveUnsubscribe = null;
            }
            const ref = collection(db, ...CLOUD_ROOT, 'attendance_records');
            try {
                attendanceArchiveUnsubscribe = onSnapshot(ref, snapshot => {
                    const nextArchive = {};
                    snapshot.forEach(snap => {
                        const dateKey = snap.id;
                        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return;
                        const data = snap.data() || {};
                        if (!data.state || typeof data.state !== 'object') return;
                        nextArchive[dateKey] = data;
                        try { localStorage.setItem(`toe_att_${dateKey}`, JSON.stringify(data)); } catch (_) {}
                    });
                    attendanceArchive = nextArchive;
                    attendanceArchiveReady = true;
                    renderRosterList();
                    renderMiniCalendar();
                    if (!rosterStatsReady) scheduleRosterStatsRebuild(250);
                }, err => {
                    attendanceArchiveReady = false;
                    console.warn('Realtime attendance archive error', err);
                    renderRosterList();
                });
                return true;
            } catch (e) {
                attendanceArchiveReady = false;
                console.warn('Attendance archive listener registration error', e);
                return false;
            }
        }

        function getStudentAttendanceStats(studentName) {
            if (rosterStatsReady && rosterStatsByStudent[studentName]) {
                return { ...emptyAttendanceStats(), ...rosterStatsByStudent[studentName] };
            }
            const archive = getAttendanceArchiveForStats();
            const byStudent = computeRosterStatsFromArchive(archive);
            return byStudent[studentName] || emptyAttendanceStats();
        }

        function renderRosterList() {
            const container = document.getElementById('roster-container');
            if (!container) return;
            container.innerHTML = '';
            const info = getGroupInfo();
            const rc=document.getElementById('roster-curator'), rh=document.getElementById('roster-headman'), rd=document.getElementById('roster-deputy');
            if(rc) rc.textContent=info.curator||'—'; if(rh) rh.textContent=info.headman||'—'; if(rd) rd.textContent=info.deputy||'—';
            students.forEach((name, index) => {
                const item = document.createElement('div');
                item.className = 'roster-person-card';
                item.innerHTML = `
                    <div class="roster-person-main">
                        <div class="roster-avatar"><i class="fa-regular fa-user"></i></div>
                        <div class="roster-person-text"><strong>${index+1}. ${name}</strong><span>Студент группы</span></div>
                    </div>
                    <div class="roster-admin-actions roster-person-actions">
                        <button onclick="renameStudent(${index})" title="Изменить"><i class="fa-regular fa-pen-to-square"></i></button>
                        <button class="danger" onclick="removeStudent(${index})" title="Удалить"><i class="fa-regular fa-trash-can"></i></button>
                    </div>`;
                container.appendChild(item);
            });
        }

        window.renameStudent = async function(index) {
            if (!canManageStudents()) { showToast('Нет права на изменение состава группы'); return; }
            const record=studentRecords[index]; if(!record) return;
            const nextName=normalizeStudentName(prompt('Фамилия и имя студента', record.name));
            if(!nextName || nextName===record.name) return;
            if(students.some((n,i)=>i!==index && n.toLocaleLowerCase('ru-RU')===nextName.toLocaleLowerCase('ru-RU'))) { showToast('Такой студент уже есть'); return; }
            const next=studentRecords.map((r,i)=>i===index?{...r,name:nextName}:r);
            const ok=await persistStudentsToCloud(next);
            showToast(ok?'Данные студента обновлены':'Изменено только на этом устройстве');
        };

        window.setAttendance = function(studentName, status) {
            const selectedDate = document.getElementById('date-picker')?.value;
            if (selectedDate && isWeekendDate(selectedDate)) {
                showToast('В субботу и воскресенье журнал недоступен');
                return;
            }
            if (!canEditJournal()) {
                showToast(currentAccessRole === 'admin' ? 'Владелец отключил вам редактирование журнала' : 'Нет прав на изменение журнала');
                return;
            }
            attendanceState[studentName] = status;
            window.__journalDirty = true;
            renderApp();
            saveCurrentDateState();
        };

        window.markAll = function(status) {
            const selectedDate = document.getElementById('date-picker')?.value;
            if (selectedDate && isWeekendDate(selectedDate)) {
                showToast('В субботу и воскресенье журнал недоступен');
                return;
            }
            if (!canEditJournal()) {
                showToast(currentAccessRole === 'admin' ? 'Владелец отключил вам редактирование журнала' : 'Нет прав на изменение журнала');
                return;
            }
            const selectedStudents = getStudentsForDate(selectedDate);
            selectedStudents.forEach(s => {
                attendanceState[s] = status;
            });
            window.__journalDirty = true;
            renderApp();
            saveCurrentDateState();
            showToast("Всем установлен статус: " + getStatusName(status));
        };

        function parseScheduleTimeRange(timeText) {
            const text = String(timeText || '').trim();
            const range = text.match(/(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})/);
            if (range) {
                return {
                    start: Number(range[1]) * 60 + Number(range[2]),
                    end: Number(range[3]) * 60 + Number(range[4])
                };
            }
            const single = text.match(/(\d{1,2}):(\d{2})/);
            if (!single) return null;
            const start = Number(single[1]) * 60 + Number(single[2]);
            return { start, end: start };
        }

        function getScheduleDayKey(date) {
            return ({1:'mon', 2:'tue', 3:'wed', 4:'thu', 5:'fri'})[date.getDay()] || null;
        }

        function getLessonsForScheduleDate(date) {
            const dayKey = getScheduleDayKey(date);
            if (!dayKey) return [];
            const weekType = getWeekTypeForDate(date);
            const source = getScheduleDataForWeek(weekType);
            return (source[dayKey] || []).filter(item => !item.isClassHour);
        }

        function getFloorFromRoom(roomText) {
            const room = String(roomText || '').trim();
            const match = room.match(/\b([1-9])\d{2}\b/);
            return match ? Number(match[1]) : null;
        }

        function findNextHomeLesson(now) {
            const today = new Date(now);
            today.setHours(0, 0, 0, 0);
            const nowMinutes = now.getHours() * 60 + now.getMinutes();

            // Ищем текущую/следующую пару сегодня. Текущая пара остаётся
            // на карточке до фактического времени её окончания.
            if (getScheduleDayKey(today)) {
                const lessons = getLessonsForScheduleDate(today);
                for (const item of lessons) {
                    const range = parseScheduleTimeRange(item.time);
                    if (!range) continue;
                    if (range.end > nowMinutes) {
                        return { date: today, lesson: item, weekType: getWeekTypeForDate(today) };
                    }
                }
            }

            // После последней пары (а также в выходные) сразу ищем первую
            // пару следующего учебного дня. Поиск допускает дни без занятий.
            const candidate = new Date(today);
            for (let i = 0; i < 14; i++) {
                candidate.setDate(candidate.getDate() + 1);
                candidate.setHours(0, 0, 0, 0);
                if (!getScheduleDayKey(candidate)) continue;
                const lessons = getLessonsForScheduleDate(candidate);
                if (!lessons.length) continue;
                return {
                    date: new Date(candidate),
                    lesson: lessons[0],
                    weekType: getWeekTypeForDate(candidate)
                };
            }
            return null;
        }

        function updateHomeTodayCard() {
            const captionEl = document.getElementById('home-date-caption');
            const dateEl = document.getElementById('home-today-date');
            const weekEl = document.getElementById('home-today-week');
            const lessonEl = document.getElementById('home-next-lesson');
            if (!dateEl || !weekEl || !lessonEl) return;

            const now = new Date();
            const result = findNextHomeLesson(now);
            const dayNames = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];
            const months = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];

            if (!result) {
                if (captionEl) captionEl.textContent = 'Расписание';
                dateEl.textContent = `${dayNames[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]}`;
                weekEl.textContent = '—';
                lessonEl.textContent = 'Ближайших занятий в расписании не найдено.';
                return;
            }

            const { date, lesson, weekType } = result;
            const sameDay = formatLocalDate(date) === formatLocalDate(now);
            if (captionEl) captionEl.textContent = sameDay ? 'Следующая пара' : 'Следующий учебный день';
            dateEl.textContent = `${dayNames[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]}`;
            weekEl.textContent = weekType === 'numerator' ? 'Числитель' : 'Знаменатель';

            const room = String(lesson.room || '').trim();
            const floor = getFloorFromRoom(room);
            const locationParts = [];
            if (room) locationParts.push(room);
            if (floor) locationParts.push(`${floor} этаж`);
            const locationText = locationParts.length
                ? `<span class="text-slate-500">${locationParts.join(' · ')}</span>`
                : '';

            lessonEl.innerHTML = `
                <div class="home-next-subject">${lesson.subject}</div>
                <div class="home-next-time">${lesson.time}</div>
                <div class="home-next-location">
                    ${room ? `<span><i class="fa-solid fa-location-dot"></i>${room}</span>` : ''}
                    ${floor ? `<span><i class="fa-solid fa-building"></i>${floor} этаж</span>` : ''}
                </div>
            `;
        }

        function renderJournalScoreCard() {
            const select = document.getElementById('journal-score-select');
            if (!select) return;
            const previous = select.value;
            const selected = previous && students.includes(previous) ? previous : (students[0] || '');
            select.innerHTML = students.map(name => `<option value="${name.replace(/"/g,'&quot;')}" ${name === selected ? 'selected' : ''}>${name}</option>`).join('');
            if (selected) select.value = selected;
            const stats = selected ? getStudentAttendanceStats(selected) : emptyAttendanceStats();
            const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = String(value); };
            setText('journal-score-name', selected || '—');
            setText('journal-score-percent', (stats.attendancePercent || 0) + '%');
            setText('journal-score-present', stats.present || 0);
            setText('journal-score-sick', stats.sick || 0);
            setText('journal-score-excused', stats.excused || 0);
            setText('journal-score-unexcused', stats.unexcused || 0);
            setText('journal-score-late', stats.late || 0);
            setText('journal-score-total', stats.total || 0);
            const progress = document.getElementById('journal-score-progress');
            if (progress) progress.style.width = Math.max(0, Math.min(100, stats.attendancePercent || 0)) + '%';

            const history = document.getElementById('journal-score-history');
            if (history) {
                const rows = [];
                Object.keys(attendanceArchive || {}).sort().reverse().forEach(date => {
                    const saved = attendanceArchive[date];
                    const status = saved?.state?.[selected];
                    if (!status) return;
                    const note = saved?.notes?.[selected] || '';
                    rows.push(`<div class="journal-history-row">
                        <div><strong>${new Date(date + 'T00:00:00').toLocaleDateString('ru-RU',{day:'2-digit',month:'long',year:'numeric'})}</strong><span>${note || 'Без примечания'}</span></div>
                        <b class="${status}">${getStatusName(status)}</b>
                    </div>`);
                });
                history.innerHTML = rows.length ? rows.join('') : '<div class="journal-history-empty">Пока нет сохранённых отметок по этому студенту.</div>';
            }
        }
        window.renderJournalScoreCard = renderJournalScoreCard;

        function renderApp() {
            const container = document.getElementById('students-container');
            if (!container) return;
            const searchVal = (document.getElementById('search-input')?.value || '').toLowerCase();
            container.innerHTML = '';

            const counts = { present: 0, late: 0, sick: 0, excused: 0, unexcused: 0 };
            const selectedDate = document.getElementById('date-picker')?.value || getCurrentDateStr();
            const journalStudents = getStudentsForDate(selectedDate);
            const editable = canEditJournal();
            const defs = [
                ['present', 'П', 'Присутствует'],
                ['sick', 'Б', 'Болеет'],
                ['excused', 'У', 'Уважительная причина'],
                ['unexcused', 'Н', 'Неуважительная причина'],
                ['late', 'О', 'Опоздание']
            ];

            journalStudents.forEach((name, index) => {
                if (searchVal && !name.toLowerCase().includes(searchVal)) return;
                const currentStatus = attendanceState[name] || null;
                if (currentStatus && counts[currentStatus] !== undefined) counts[currentStatus]++;

                const row = document.createElement('div');
                row.className = 'journal-ref-row';
                const safeName = name.replace(/'/g, "\\'");
                const buttons = defs.map(([status, label, title]) => {
                    const selected = currentStatus === status ? ' selected' : '';
                    const action = editable ? `onclick="setAttendance('${safeName}', '${status}')"` : 'disabled';
                    return `<button ${action} class="journal-status-btn ${status}${selected}" title="${title}">${label}</button>`;
                }).join('');
                const note = attendanceNotes[name] || '';
                const noteControl = currentStatus
                    ? `<button class="journal-ref-note ${note ? 'has-note' : ''}" ${editable ? `onclick="openAttendanceNote('${safeName}')"` : 'disabled'} title="${note || 'Добавить примечание'}"><i class="fa-regular fa-note-sticky"></i><span>${note || 'Добавить...'}</span></button>`
                    : '<span class="journal-ref-note-placeholder" aria-hidden="true"></span>';
                row.innerHTML = `
                    <span class="journal-ref-index">${index + 1}</span>
                    <div class="journal-ref-person">
                        <span class="journal-ref-avatar"><i class="fa-solid fa-user"></i></span>
                        <strong>${name}</strong>
                    </div>
                    ${buttons}
                    ${noteControl}`;
                container.appendChild(row);
            });

            const marked = counts.present + counts.late + counts.sick + counts.excused + counts.unexcused;
            const attending = counts.present + counts.late;
            const groupPercent = marked ? Math.round((attending / marked) * 100) : 0;
            const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = String(value); };
            setText('stat-present', counts.present);
            setText('stat-late', counts.late);
            setText('stat-sick', counts.sick);
            setText('stat-excused', counts.excused);
            setText('stat-unexcused', counts.unexcused);
            setText('journal-group-percent', 'Посещаемость группы: ' + groupPercent + '%');
            setText('journal-group-marked', marked + ' из ' + journalStudents.length);
            const groupProgress = document.getElementById('journal-group-progress');
            if (groupProgress) groupProgress.style.width = groupPercent + '%';

            renderJournalScoreCard();
        }

        async function saveCurrentDateState() {
            if (!canEditJournal()) return false;
            setSaveStatus('Сохранение…', true);
            const dateVal = document.getElementById('date-picker').value || getCurrentDateStr();
            const dataToSave = {
                state: { ...attendanceState },
                notes: { ...attendanceNotes },
                weekType: currentWeekType,
                updatedAt: new Date().toISOString()
            };
            const serialized = JSON.stringify(dataToSave);
            window.__lastLocalAttendanceUpdatedAt = dataToSave.updatedAt;
            lastAppliedCloudUpdatedAt = dataToSave.updatedAt;

            // Основное сохранение + независимая резервная копия.
            await savePersistentValue(`toe_att_${dateVal}`, serialized);
            const dates = JSON.parse(localStorage.getItem('toe_att_dates') || '[]');
            if (!dates.includes(dateVal)) {
                dates.push(dateVal);
                dates.sort();
                await savePersistentValue('toe_att_dates', JSON.stringify(dates));
            }

            // Отдельный журнал последних сохранений позволяет восстановить данные,
            // даже если одна запись localStorage будет повреждена.
            const backupKey = `toe_att_backup_${dateVal}`;
            await savePersistentValue(backupKey, serialized);
            await cleanupOldAttendanceBackups(30);

            let cloudSaveOk = false;
            if (isCloudConnected && db && auth?.currentUser) {
                try {
                    await setDoc(doc(db, ...CLOUD_ROOT, 'attendance_records', dateVal), dataToSave, { merge: false });
                    if (window.__realtimeDate !== dateVal || !attendanceUnsubscribe) {
                        subscribeToAttendance(dateVal);
                    }
                    cloudSaveOk = true;
                    attendanceArchive[dateVal] = dataToSave;
                    renderRosterList();
                    scheduleRosterStatsRebuild(500);
                    if (window.__rtd) { window.__rtd.state.lastSource='этот браузер → Firestore'; window.__rtd.state.lastUpdatedAt=dataToSave.updatedAt; window.__rtd.log('WRITE OK: '+dateVal+' updatedAt='+dataToSave.updatedAt); window.__rtd.render(); }
                    firebaseDiag.write = {ok:true, detail:`Запись посещаемости прошла: toe_group/shared/attendance_records/${dateVal}`};
                    diagLog('Firestore WRITE OK', firebaseDiag.write.detail);
                } catch(e) {
                    firebaseDiag.write = {ok:false, detail:e?.code ? `${e.code}: ${e.message}` : String(e)};
                    diagLog('Firestore WRITE ERROR', firebaseDiag.write.detail);
                    console.warn("Cloud save failed; local backup is safe", e);
                }
            }
            try { await createAutomaticBackup(); } catch (e) { console.warn('Автоматическая резервная копия не создана', e); }
            window.__journalDirty = false;
            setSaveStatus(cloudSaveOk || !isCloudConnected ? 'Сохранено' : 'Только локально', false);
            if (isCloudConnected && !cloudSaveOk) showToast('Не удалось сохранить в облако');
            if (!isCloudConnected) renderRosterList();
            updateBackupStatus();
        }

        window.onDateChanged = async function() {
            const picker = document.getElementById('date-picker');
            let val = picker?.value;
            if (!val) return;
            if (isWeekendDate(val)) {
                val = getLastWorkingDate(val);
                if (picker) picker.value = val;
                showToast('В субботу и воскресенье журнал недоступен');
            }
            const label = document.getElementById('calendar-trigger-text');
            if (label) label.textContent = formatCalendarLabel(new Date(val + 'T00:00:00'));
            updateSelectedDateUI(val);
            renderMiniCalendar();
            await loadAttendanceForDate(val);
            // Переподключаем realtime listener именно к выбранной дате.
            if (isCloudConnected && db && auth?.currentUser) subscribeToAttendance(val);
        };



        function updateSelectedDateUI(dateStr) {
            const label = document.getElementById('selected-date-label');
            if (label) label.textContent = formatCalendarLabel(new Date(dateStr + 'T00:00:00'));
        }

        function setSaveStatus(text, saving=false) {
            const box = document.getElementById('save-status');
            const label = document.getElementById('save-status-text');
            if (label) label.textContent = text;
            if (box) box.classList.toggle('saving', !!saving);
        }

        // Ручное сохранение журнала по кнопке. Автосохранение при изменении
        // статуса сохраняется — эта кнопка просто позволяет принудительно
        // отправить текущий журнал в Firestore ещё раз.
        window.saveJournalManually = async function() {
            // Кнопка всегда доступна. Если пользователь ещё не вошёл как администратор,
            // открываем окно входа вместо того, чтобы делать кнопку визуально/логически
            // неактивной. Само изменение статусов по-прежнему доступно только админу.
            if (!canEditJournal()) {
                openAdminSettings();
                showToast(currentAccessRole === 'admin' ? 'Владелец отключил вам редактирование журнала' : 'Сначала войдите с правом редактирования журнала');
                return;
            }
            const btn = document.getElementById('manual-save-journal-btn');
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>Сохранение…</span>';
            }
            try {
                await saveCurrentDateState();
                showToast(isCloudConnected ? 'Журнал сохранён в облако' : 'Журнал сохранён локально');
            } catch (e) {
                console.error('Manual journal save error:', e);
                showToast('Не удалось сохранить журнал');
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i><span>Сохранить</span>';
                }
            }
        };

        window.changeJournalDate = async function(delta) {
            const picker = document.getElementById('date-picker');
            const base = picker?.value ? new Date(picker.value + 'T00:00:00') : new Date();
            base.setDate(base.getDate() + delta);
            while (isWeekendDate(base)) base.setDate(base.getDate() + (delta >= 0 ? 1 : -1));
            const value = formatLocalDate(base);
            if (picker) picker.value = value;
            const label = document.getElementById('calendar-trigger-text');
            if (label) label.textContent = formatCalendarLabel(base);
            updateSelectedDateUI(value);
            await loadAttendanceForDate(value);
            if (isCloudConnected && db && auth?.currentUser) subscribeToAttendance(value);
        };

        window.goToToday = async function() {
            const today = getCurrentDateStr();
            const value = isWeekendDate(today) ? getLastWorkingDate(today) : today;
            const picker = document.getElementById('date-picker');
            if (picker) picker.value = value;
            const date = new Date(value + 'T00:00:00');
            const label = document.getElementById('calendar-trigger-text');
            if (label) label.textContent = formatCalendarLabel(date);
            updateSelectedDateUI(value);
            await loadAttendanceForDate(value);
        };

        window.closeHistoryModal = function() {
            document.getElementById('history-modal').classList.add('hidden');
        };

        let previewReportText = '';
        let previewReportType = 'absent';

        function buildReport(type) {
            let lines = [];
            let presentCount = 0;
            let absentCount = 0;
            const reportDate = document.getElementById('date-picker')?.value || getCurrentDateStr();
            getStudentsForDate(reportDate).forEach((name) => {
                const st = attendanceState[name] || 'present';
                if (st === 'present') {
                    presentCount++;
                } else {
                    absentCount++;
                    if (type === 'absent') lines.push(`${name}, ${getStatusName(st)}.`);
                }
                if (type === 'full') lines.push(`${name}, ${getStatusName(st)}.`);
            });
            lines.push(`Присутствуют: ${presentCount}. Отсутствуют: ${absentCount}.`);
            return lines.join('\n');
        }

        window.openReportPreview = function(type) {
            previewReportType = type;
            previewReportText = buildReport(type);
            const modal = document.getElementById('report-preview-modal');
            const content = document.getElementById('report-preview-content');
            const title = document.getElementById('report-preview-title');
            const date = document.getElementById('report-preview-date');
            const picker = document.getElementById('date-picker');
            const dateStr = picker?.value || getCurrentDateStr();
            if (title) title.textContent = type === 'full' ? 'Полный отчёт' : 'Отчёт по отсутствующим';
            if (date) date.textContent = formatCalendarLabel(new Date(dateStr + 'T00:00:00'));
            if (content) content.textContent = previewReportText;
            if (modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
        };

        window.closeReportPreview = function() {
            const modal = document.getElementById('report-preview-modal');
            if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
        };

        window.copyPreviewReport = function() {
            copyToClipboard(previewReportText);
            showToast('Отчёт скопирован!');
        };

        window.downloadPreviewReport = function() {
            const picker = document.getElementById('date-picker');
            const dateStr = picker?.value || getCurrentDateStr();
            const typeName = previewReportType === 'full' ? 'полный-отчёт' : 'отчёт-отсутствующие';
            const blob = new Blob([previewReportText], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${typeName}-${dateStr}.txt`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            showToast('Отчёт скачан!');
        };

        window.copyAbsentReport = function() { openReportPreview('absent'); };
        window.copyFullReport = function() { openReportPreview('full'); };

        function copyToClipboard(text) {
            const textarea = document.createElement("textarea");
            textarea.value = text;
            textarea.style.position = "fixed";
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();
            try {
                document.execCommand('copy');
            } catch (err) {
                console.error('Failed to copy', err);
            }
            document.body.removeChild(textarea);
        }

        function showToast(msg) {
            const toast = document.getElementById('toast');
            const msgEl = document.getElementById('toast-message');
            msgEl.innerText = msg;
            toast.classList.remove('-translate-y-20', 'opacity-0');
            toast.classList.add('translate-y-0', 'opacity-100');
            setTimeout(() => {
                toast.classList.remove('translate-y-0', 'opacity-100');
                toast.classList.add('-translate-y-20', 'opacity-0');
            }, 2500);
        }
    
        // Режим отображения: телефон / ПК
        window.setDeviceMode = function(mode) {
            document.body.classList.toggle('layout-phone', mode === 'phone');
            document.body.classList.toggle('layout-pc', mode === 'pc');
            document.getElementById('device-phone')?.classList.toggle('active', mode === 'phone');
            document.getElementById('device-pc')?.classList.toggle('active', mode === 'pc');
            localStorage.setItem('toe_device_mode', mode);
        };

        window.__journalDirty = false;
        window.addEventListener('beforeunload', function(event) {
            const saving = document.getElementById('save-status')?.classList.contains('saving');
            if (window.__journalDirty || saving) {
                event.preventDefault();
                event.returnValue = 'Изменения ещё сохраняются. Покинуть страницу?';
                return event.returnValue;
            }
        });

        (function initDeviceMode() {
            const saved = localStorage.getItem('toe_device_mode');
            const mode = saved || (window.innerWidth <= 767 ? 'phone' : 'pc');
            window.setDeviceMode(mode);
        })();


// ===== STEP18: новый интерфейс, посещаемость, уведомления и поддержка =====
const UI_LANG_KEY='toe_ui_language';
let activeJournalTab='editor';
let editingAttendanceNoteStudent='';
let notificationsCache=[];
let notificationsUnsubscribe=null;
let supportUnsubscribe=null;
const visitorSupportId=(()=>{let id=localStorage.getItem('toe_support_id'); if(!id){id='v_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,9);localStorage.setItem('toe_support_id',id);}return id;})();

const KZ_EXACT={
 'Главная':'Басты бет','Журнал':'Журнал','Расписание':'Кесте','Группа':'Топ','Настройки':'Баптаулар','Поддержка':'Қолдау',
 'Сегодня':'Бүгін','Следующий учебный день':'Келесі оқу күні','Ближайшее занятие':'Келесі сабақ','Расписание на сегодня':'Бүгінгі сабақтар',
 'Числитель':'Алым','Знаменатель':'Бөлім','Куратор':'Куратор','Староста':'Топ старостасы','Зам. старосты':'Староста орынбасары','Студентов':'Студенттер',
 'Посещаемость':'Қатысу','Посещаемость студентов':'Студенттердің қатысуы','Присутствуют':'Қатысқан','Опаздывают':'Кешіккен','Болеет':'Ауырған','Уважит.':'Себепті','Неуваж.':'Себепсіз',
 'Добавить':'Қосу','Уведомления':'Хабарландырулар','Все расписание':'Толық кесте','Подробная статистика':'Толық статистика',
 'История посещаемости':'Қатысу тарихы','Физика':'Физика','Математика':'Математика','Химия':'Химия','Биология':'Биология','География':'География',
 'Информатика':'Информатика','История Казахстана':'Қазақстан тарихы','Физическая культура':'Дене шынықтыру','Иностранный язык':'Шет тілі',
 'Русская литература':'Орыс әдебиеті','Русский язык и литература':'Орыс тілі мен әдебиеті','Казахский язык и литература':'Қазақ тілі мен әдебиеті',
 'Глобальные компетенции':'Жаһандық құзыреттер','Классный час':'Тәрбие сағаты','Перемена':'Үзіліс','Большая перемена':'Үлкен үзіліс','Конец занятий':'Сабақ аяқталды'
};
function currentLang(){return localStorage.getItem(UI_LANG_KEY)||'ru';}
window.setInterfaceLanguage=function(lang){localStorage.setItem(UI_LANG_KEY,lang==='kz'?'kz':'ru'); updateLanguageButtons(); location.reload();};
function updateLanguageButtons(){const lang=currentLang();document.getElementById('lang-ru')?.classList.toggle('active',lang==='ru');document.getElementById('lang-kz')?.classList.toggle('active',lang==='kz');}
function applyKzTranslations(root=document.body){if(currentLang()!=='kz') return; const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT); const nodes=[]; while(walker.nextNode()) nodes.push(walker.currentNode); nodes.forEach(n=>{const t=n.nodeValue.trim(); if(KZ_EXACT[t]) n.nodeValue=n.nodeValue.replace(t,KZ_EXACT[t]);});}
window.addEventListener('DOMContentLoaded',()=>{updateLanguageButtons();setTimeout(()=>applyKzTranslations(),120);});
const langObserver=new MutationObserver(m=>{if(currentLang()==='kz')m.forEach(x=>x.addedNodes.forEach(n=>{if(n.nodeType===1)applyKzTranslations(n);}));});
window.addEventListener('DOMContentLoaded',()=>langObserver.observe(document.body,{childList:true,subtree:true}));

window.openAppMenu=function(){const x=document.getElementById('app-menu-drawer');x?.classList.remove('hidden');document.body.classList.add('modal-open');};
window.closeAppMenu=function(){document.getElementById('app-menu-drawer')?.classList.add('hidden');document.body.classList.remove('modal-open');};
window.showJournalTab=function(tab){
    activeJournalTab=tab==='stats'?'stats':'editor';
    document.getElementById('journal-tab-editor')?.classList.toggle('active',activeJournalTab==='editor');
    document.getElementById('journal-tab-stats')?.classList.toggle('active',activeJournalTab==='stats');
    document.getElementById('journal-editor-main')?.classList.toggle('hidden',activeJournalTab==='stats');
    document.getElementById('attendance-analytics')?.classList.toggle('hidden',activeJournalTab!=='stats');
    if(activeJournalTab==='stats') renderJournalScoreCard();
};

window.renderAttendanceAnalytics=function(){
 const summary=document.getElementById('analytics-summary'), select=document.getElementById('analytics-student-select'), hist=document.getElementById('analytics-history'), head=document.getElementById('analytics-student-head'); if(!summary||!select||!hist) return;
 let totals={present:0,late:0,sick:0,excused:0,unexcused:0,marked:0};
 Object.values(attendanceArchive||{}).forEach(day=>Object.values(day?.state||{}).forEach(s=>{if(totals[s]!==undefined){totals[s]++;totals.marked++;}}));
 const absent=totals.sick+totals.excused+totals.unexcused; const pct=totals.marked?Math.round(((totals.present+totals.late)/totals.marked)*100):0;
 summary.innerHTML=`<div class="metric-card primary"><strong>${pct}%</strong><span>Общая посещаемость</span></div><div class="metric-card"><strong>${totals.present}</strong><span>Присутствий</span></div><div class="metric-card"><strong>${absent}</strong><span>Пропусков</span></div><div class="metric-card"><strong>${totals.late}</strong><span>Опозданий</span></div>`;
 const selected=select.value&&students.includes(select.value)?select.value:students[0]; select.innerHTML=students.map(n=>`<option ${n===selected?'selected':''}>${n}</option>`).join('');
 const stats=getStudentAttendanceStats(selected); if(head)head.innerHTML=`<div><strong>${selected||'—'}</strong><span>Посещаемость ${stats.attendancePercent}% · отмечено дней ${stats.total}</span></div><div class="analytics-chips"><span class="ok">П ${stats.present}</span><span class="late">О ${stats.late}</span><span class="bad">Пропуски ${stats.absent}</span></div>`;
 const rows=[]; Object.keys(attendanceArchive||{}).sort().reverse().forEach(date=>{const d=attendanceArchive[date];const status=d?.state?.[selected];if(!status||status==='present')return;const note=d?.notes?.[selected]||'';rows.push(`<div class="history-row"><div class="history-date">${new Date(date+'T00:00:00').toLocaleDateString('ru-RU',{day:'2-digit',month:'long',year:'numeric'})}</div><div class="history-status ${status}">${getStatusName(status)}</div>${note?`<div class="history-note">${note}</div>`:''}</div>`);}); hist.innerHTML=rows.length?rows.join(''):'<div class="empty-state">Пропусков и опозданий пока нет.</div>';
};

window.openAttendanceNote=function(name){editingAttendanceNoteStudent=name;const m=document.getElementById('attendance-note-modal');document.getElementById('attendance-note-title').textContent=name;const status=attendanceState[name]||'';const presets=status==='late'?['Опоздал на 5 минут','Опоздал на 10 минут','Опоздал на 15 минут','Опоздал на 20 минут']:status==='sick'?['Больничный','По справке','На лечении']:status==='excused'?['По справке','Семейные обстоятельства','Разрешение куратора']:status==='unexcused'?['Причина не указана','Без уважительной причины']:['Без примечания'];document.getElementById('attendance-note-presets').innerHTML=presets.map(t=>`<button onclick="useAttendanceNotePreset('${t}')">${t}</button>`).join('');document.getElementById('attendance-note-text').value=attendanceNotes[name]||'';m?.classList.remove('hidden');};
window.closeAttendanceNote=function(){document.getElementById('attendance-note-modal')?.classList.add('hidden');editingAttendanceNoteStudent='';};
window.useAttendanceNotePreset=function(t){document.getElementById('attendance-note-text').value=t;};
window.saveAttendanceNote=async function(){if(!editingAttendanceNoteStudent)return;attendanceNotes[editingAttendanceNoteStudent]=document.getElementById('attendance-note-text').value.trim();window.__journalDirty=true;await saveCurrentDateState();closeAttendanceNote();renderApp();};

function parseMinutes(text){const m=String(text||'').match(/(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})/);return m?{start:+m[1]*60+(+m[2]),end:+m[3]*60+(+m[4])}:null;}
function homeMinutesLabel(total){const value=Math.max(0,Math.ceil(total));return value===1?'1 мин':`${value} мин`;}
function renderHomeReferenceDate(now=new Date()){
    const dateEl=document.getElementById('home-reference-date');
    const weekdayEl=document.getElementById('home-reference-weekday');
    if(!dateEl||!weekdayEl)return;
    const locale=currentLang()==='kz'?'kk-KZ':'ru-RU';
    dateEl.textContent=now.toLocaleDateString(locale,{day:'numeric',month:'long',year:'numeric'});
    const weekday=now.toLocaleDateString(locale,{weekday:'long'});
    weekdayEl.textContent=weekday.charAt(0).toUpperCase()+weekday.slice(1);
}
function homeBreakInfo(current,next){
    const a=parseMinutes(current?.time),b=parseMinutes(next?.time);
    if(!a||!b||b.start<=a.end)return null;
    return {start:a.end,end:b.start,duration:b.start-a.end};
}
function renderHomeLessonCard(entry,nowMinutes){
    const {it,index,r}=entry;
    const floor=getFloorFromRoom(it.room);
    const current=!!r&&nowMinutes>=r.start&&nowMinutes<r.end;
    const remaining=current?r.end-nowMinutes:0;
    const progress=current?Math.max(1,Math.min(100,((nowMinutes-r.start)/(r.end-r.start))*100)):0;
    return `<article class="home-ref-lesson-card ${current?'current':''}">
        <div class="home-ref-lesson-row">
            <div class="home-ref-lesson-number">${index+1}</div>
            <div class="home-ref-lesson-main">
                <strong>${it.subject||'Занятие'}</strong>
                <span>${it.time||''}</span>
            </div>
            <div class="home-ref-lesson-meta">
                <div><span>Кабинет</span><strong>${it.room||'—'}</strong></div>
                <div><span>Этаж</span><strong>${floor||'—'}</strong></div>
            </div>
        </div>
        ${current?`<div class="home-ref-progress-row">
            <div class="home-ref-progress-labels"><strong>Идёт урок</strong><span>Осталось ${homeMinutesLabel(remaining)}</span></div>
            <div class="home-ref-progress"><i style="width:${progress}%"></i></div>
            <div class="home-ref-progress-percent">${Math.round(progress)}%</div>
        </div>`:''}
    </article>`;
}
function renderHomeBreakCard(info,active=false,nowMinutes=0){
    const startH=String(Math.floor(info.start/60)).padStart(2,'0'),startM=String(info.start%60).padStart(2,'0');
    const endH=String(Math.floor(info.end/60)).padStart(2,'0'),endM=String(info.end%60).padStart(2,'0');
    const remaining=active?Math.max(0,info.end-nowMinutes):info.duration;
    return `<article class="home-ref-break-card ${active?'current':''}">
        <div class="home-ref-break-icon"><i class="fa-solid fa-mug-hot"></i></div>
        <div class="home-ref-break-main"><strong>${active?'Идёт перемена':'Перемена'}</strong><span>${startH}:${startM} – ${endH}:${endM}</span></div>
        <div class="home-ref-break-duration">${homeMinutesLabel(remaining)}</div>
    </article>`;
}
function renderHomeDayTimeline(){
    const box=document.getElementById('home-day-timeline');
    if(!box)return;
    const now=new Date();
    renderHomeReferenceDate(now);
    const dayKey=getScheduleDayKey(now);
    if(!dayKey){box.innerHTML='<div class="home-ref-empty">Сегодня учебных занятий нет.</div>';return;}
    const type=getWeekTypeForDate(now),source=getScheduleDataForWeek(type);
    const raw=(source[dayKey]||[]).filter(x=>!x.isClassHour);
    if(!raw.length){box.innerHTML='<div class="home-ref-empty">На сегодня занятий нет.</div>';return;}
    const entries=raw.map((it,index)=>({it,index,r:parseMinutes(it.time)})).filter(x=>x.r);
    if(!entries.length){box.innerHTML='<div class="home-ref-empty">Расписание на сегодня ещё не заполнено.</div>';return;}
    const mins=now.getHours()*60+now.getMinutes();
    let activeLesson=entries.findIndex(x=>mins>=x.r.start&&mins<x.r.end);
    let activeBreak=-1;
    for(let i=0;i<entries.length-1;i++){
        const info=homeBreakInfo(entries[i].it,entries[i+1].it);
        if(info&&mins>=info.start&&mins<info.end){activeBreak=i;break;}
    }
    let startIndex=0;
    if(activeLesson>=0) startIndex=activeLesson;
    else if(activeBreak>=0) startIndex=activeBreak+1;
    else {
        const upcoming=entries.findIndex(x=>mins<x.r.end);
        if(upcoming<0){box.innerHTML='<div class="home-ref-empty">Занятия на сегодня закончились.</div>';return;}
        startIndex=upcoming;
    }
    const selected=entries.slice(startIndex,startIndex+3);
    let html='';
    if(activeBreak>=0){
        const bi=homeBreakInfo(entries[activeBreak].it,entries[activeBreak+1].it);
        if(bi)html+=renderHomeBreakCard(bi,true,mins);
    }
    selected.forEach((entry,pos)=>{
        html+=renderHomeLessonCard(entry,mins);
        if(pos<selected.length-1){
            const next=selected[pos+1];
            const bi=homeBreakInfo(entry.it,next.it);
            if(bi)html+=renderHomeBreakCard(bi,false,mins);
        }
    });
    box.innerHTML=html;
    applyKzTranslations(box);
}
setInterval(renderHomeDayTimeline,15000);setTimeout(renderHomeDayTimeline,250);
function canPublishNotifications(){return currentAccessRole==='owner'||canPublishNotificationsPermission();}
const NOTIFICATIONS_READ_KEY='toe_notifications_read_v1';
function getReadNotificationIds(){try{return new Set(JSON.parse(localStorage.getItem(NOTIFICATIONS_READ_KEY)||'[]'));}catch(e){return new Set();}}
function saveReadNotificationIds(ids){try{localStorage.setItem(NOTIFICATIONS_READ_KEY,JSON.stringify([...ids].slice(-500)));}catch(e){}}
function notificationTimeLabel(value){if(!value)return '';const d=new Date(value);return Number.isNaN(d.getTime())?'':d.toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});}
function escapeNotificationText(value){return String(value??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));}
function updateNotificationBadge(){const badge=document.getElementById('notification-badge');if(!badge)return;const read=getReadNotificationIds();const unread=notificationsCache.filter(n=>!read.has(n.id)).length;badge.textContent=String(unread);badge.classList.toggle('hidden',unread===0);}
function renderHomeLatestNotification(){
    const box=document.getElementById('home-latest-notification');
    if(!box)return;
    const n=notificationsCache[0];
    if(!n){box.innerHTML='<div class="home-ref-notification-empty">Новых уведомлений пока нет.</div>';return;}
    const title=escapeNotificationText(n.title||'Объявление');
    const body=escapeNotificationText(n.text||'');
    const lower=(title+' '+body).toLowerCase();
    const icon=lower.includes('распис')?'fa-calendar-days':lower.includes('поддерж')?'fa-comments':'fa-bullhorn';
    let time='';
    if(n.createdAt){
        const d=new Date(n.createdAt);
        if(!Number.isNaN(d.getTime()))time=d.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
    }
    box.innerHTML=`<button class="home-ref-notification-card" onclick="openNotifications()">
        <span class="home-ref-notification-icon"><i class="fa-solid ${icon}"></i></span>
        <span class="home-ref-notification-copy"><strong>${title}</strong><span>${body||'Открыть уведомление'}</span></span>
        <span class="home-ref-notification-time">${time}</span>
    </button>`;
}
function renderNotifications(){renderHomeLatestNotification();const box=document.getElementById('notifications-list');if(!box)return;const read=getReadNotificationIds();if(!notificationsCache.length){box.innerHTML='<div class="empty-state">Новых объявлений пока нет.</div>';return;}box.innerHTML=notificationsCache.map(n=>{const unread=!read.has(n.id);return `<article class="notification-item ${unread?'unread':''}"><div class="notification-item-icon"><i class="fa-regular fa-bell"></i></div><div class="notification-item-body"><div class="notification-item-head"><strong>${escapeNotificationText(n.title||'Объявление')}</strong><span>${notificationTimeLabel(n.createdAt)}</span></div><p>${escapeNotificationText(n.text||'')}</p>${n.author?`<small>${escapeNotificationText(n.author)}</small>`:''}</div></article>`;}).join('');applyKzTranslations(box);}
function markNotificationsRead(){const read=getReadNotificationIds();notificationsCache.forEach(n=>read.add(n.id));saveReadNotificationIds(read);updateNotificationBadge();renderNotifications();}
function subscribeNotifications(){if(!db||!auth?.currentUser||notificationsUnsubscribe)return;const ref=collection(db,...CLOUD_ROOT,'notifications');notificationsUnsubscribe=onSnapshot(ref,snap=>{notificationsCache=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));renderNotifications();renderHomeLatestNotification();updateNotificationBadge();},e=>{console.warn('notifications realtime',e);notificationsUnsubscribe=null;});}
window.openNotifications=function(){document.getElementById('notifications-modal')?.classList.remove('hidden');document.body.classList.add('modal-open');document.getElementById('notification-admin-composer')?.classList.toggle('hidden',!canPublishNotifications());renderNotifications();setTimeout(markNotificationsRead,250);};
window.closeNotifications=function(){document.getElementById('notifications-modal')?.classList.add('hidden');document.body.classList.remove('modal-open');};
window.publishNotification=async function(){if(!canPublishNotifications()){showToast('Нет права публиковать уведомления');return;}const title=document.getElementById('notification-title')?.value.trim()||'';const text=document.getElementById('notification-text')?.value.trim()||'';if(!title&&!text){showToast('Введите заголовок или текст');return;}const id=`n_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;try{await setDoc(doc(db,...CLOUD_ROOT,'notifications',id),{title:title||'Объявление',text,createdAt:new Date().toISOString(),author:currentAccessLogin||'Владелец',type:'announcement'});const t=document.getElementById('notification-title'),b=document.getElementById('notification-text');if(t)t.value='';if(b)b.value='';showToast('Уведомление опубликовано');}catch(e){console.warn('publish notification',e);showToast('Не удалось опубликовать уведомление');}};
let activeSupportThreadId='';
function isSupportStaff(){return currentAccessRole==='owner'||(currentAccessRole==='admin'&&canUseSupportStaff());}
function ownSupportThreadId(){return auth?.currentUser?.uid || visitorSupportId;}
window.openSupport=async function(){
    document.getElementById('support-modal')?.classList.remove('hidden');document.body.classList.add('modal-open');
    const inbox=document.getElementById('support-staff-inbox'), name=document.getElementById('support-name');
    if(isSupportStaff()) { if(name) name.classList.add('hidden'); if(inbox) inbox.classList.remove('hidden'); await loadSupportInbox(); }
    else { if(name) name.classList.remove('hidden'); if(inbox) inbox.classList.add('hidden'); activeSupportThreadId=ownSupportThreadId(); subscribeSupportThread(activeSupportThreadId); }
};
window.closeSupport=function(){document.getElementById('support-modal')?.classList.add('hidden');document.body.classList.remove('modal-open');};
async function loadSupportInbox(){
    const inbox=document.getElementById('support-staff-inbox'); if(!inbox||!db)return;
    try{const snap=await getDocs(collection(db,...CLOUD_ROOT,'support')); const threads=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
      inbox.innerHTML=threads.length?`<div class="support-inbox-title">Обращения</div>`+threads.map(t=>`<button class="support-thread-btn ${t.id===activeSupportThreadId?'active':''}" onclick="openSupportThread('${t.id}')"><strong>${t.displayName||'Пользователь'}</strong><span>${t.updatedAt?new Date(t.updatedAt).toLocaleString('ru-RU'):''}</span><p>${(t.messages?.at(-1)?.text||'').slice(0,80)}</p></button>`).join(''):'<div class="empty-state">Обращений пока нет.</div>';
      if(threads.length&&!activeSupportThreadId) openSupportThread(threads[0].id);
    }catch(e){console.warn('support inbox',e);inbox.innerHTML='<div class="empty-state">Не удалось загрузить обращения.</div>';}
}
window.openSupportThread=function(id){activeSupportThreadId=id;document.getElementById('support-active-thread')?.classList.remove('hidden');subscribeSupportThread(id);loadSupportInbox();};
function subscribeSupportThread(id){if(!db||!auth?.currentUser||!id)return;if(supportUnsubscribe)supportUnsubscribe();supportUnsubscribe=onSnapshot(doc(db,...CLOUD_ROOT,'support',id),snap=>{const data=snap.exists()?snap.data():{};const active=document.getElementById('support-active-thread');if(active&&isSupportStaff())active.textContent=`Диалог: ${data.displayName||'Пользователь'}`;renderSupportMessages(data.messages||[]);},e=>console.warn('support',e));}
function renderSupportMessages(msgs){const box=document.getElementById('support-messages');if(!box)return;box.innerHTML=msgs.length?msgs.map(m=>`<div class="support-msg ${m.role==='staff'?'staff':'visitor'}"><strong>${m.author|| (m.role==='staff'?'Поддержка':'Пользователь')}</strong><p>${m.text||''}</p><span>${m.at?new Date(m.at).toLocaleString('ru-RU'):''}</span></div>`).join(''):'<div class="empty-state">Диалог пока пуст. Напишите первое сообщение.</div>';box.scrollTop=box.scrollHeight;}
window.sendSupportMessage=async function(){
    const text=document.getElementById('support-text').value.trim();if(!text)return;
    const staff=isSupportStaff(); const id=staff?activeSupportThreadId:ownSupportThreadId(); if(!id){showToast('Выберите обращение');return;}
    const ref=doc(db,...CLOUD_ROOT,'support',id);
    try{const snap=await getDoc(ref),data=snap.exists()?snap.data():{},messages=Array.isArray(data.messages)?data.messages:[];const displayName=staff?(data.displayName||'Пользователь'):(document.getElementById('support-name').value.trim()||data.displayName||'Пользователь');messages.push({text,author:staff?(currentAccessLogin||'Поддержка'):displayName,role:staff?'staff':'visitor',at:new Date().toISOString()});await setDoc(ref,{messages,updatedAt:new Date().toISOString(),displayName,ownerUid:staff?(data.ownerUid||''):auth.currentUser.uid},{merge:true});document.getElementById('support-text').value='';if(staff)loadSupportInbox();}catch(e){console.warn(e);showToast('Не удалось отправить сообщение');}
};

// Запускаем новые realtime-модули после авторизации.
setInterval(()=>{if(db&&auth?.currentUser&&!notificationsUnsubscribe)subscribeNotifications();},1200);
