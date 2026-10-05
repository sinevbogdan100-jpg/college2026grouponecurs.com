import { createArrivalTracker } from './notification-state.js?v=20261004-performance-v1';
import { createNotificationCenter } from './notification-center.js?v=20261004-console-fixes-v2';
import { getSiteVersion, incomingSupportCount, unreadSupportCount } from './support-state.js?v=20261004-performance-v1';
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
} from "./firebase.js?v=20261004-console-fixes-v1";

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
} from "./utils.js?v=20261004-performance-v1";
import { dbPut, dbGet, dbDelete, savePersistentValue } from "./storage.js?v=20261004-performance-v1";
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
} from "./schedule.js?v=20261004-schedule-change-v1";
import { currentLang, interfaceLocale, translateUI, applyKzTranslations, startInterfaceTranslations } from "./i18n.js?v=20261005-live-progress-v2";

        
window.__SITE_BUILD__ = document.querySelector('meta[name="app-build"]')?.content || 'step18.10';
window.__journalDateInitialized = false;
const FIREBASE_DIAGNOSTICS_ENABLED = new URLSearchParams(location.search).get('debug') === '1';
console.info('[SBP Information] build', window.__SITE_BUILD__);
// ===== ВРЕМЕННАЯ ДИАГНОСТИКА FIREBASE =====
        const firebaseDiag = { events: [], init: false, auth: null, read: null, write: null, realtime: null, error: null };
        function diagLog(message, data) {
            if (!FIREBASE_DIAGNOSTICS_ENABLED) return;
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
            if (!FIREBASE_DIAGNOSTICS_ENABLED) return;
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
        window.openFirebaseDiagnostic = function(){ if(!FIREBASE_DIAGNOSTICS_ENABLED)return; const p=document.getElementById('firebase-diagnostic-panel'); if(p){p.classList.remove('hidden');p.classList.add('flex');renderFirebaseDiagnostic();} };
        if (FIREBASE_DIAGNOSTICS_ENABLED) queueMicrotask(() => { const t=document.getElementById('firebase-diagnostic-toggle'); if(t)t.hidden=false; });
        window.closeFirebaseDiagnostic = function(){ const p=document.getElementById('firebase-diagnostic-panel'); if(p){p.classList.add('hidden');p.classList.remove('flex');} };
        function updateCloudBadge(connected) {
            const wasConnected = isCloudConnected;
            isCloudConnected = !!connected;
            diagLog(connected ? 'Облако подключено' : 'Облако отключено');
            renderFirebaseDiagnostic();

            if (!navigator.onLine) {
                syncSystemStatus();
            } else if (isCloudConnected) {
                syncSystemStatus({ recovered: !wasConnected && cloudProblemSeen });
            } else {
                cloudProblemSeen = true;
                syncSystemStatus();
            }
            refreshSettingsSystem?.();
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
        let systemStatusTimer = null;
        let lastReportedIssueKey = '';
        let lastReportedIssueAt = 0;
        let cloudProblemSeen = false;
        let lastKnownOnlineState = navigator.onLine;

        function statusIcon(kind) {
            return ({
                offline: 'fa-wifi',
                warning: 'fa-triangle-exclamation',
                error: 'fa-circle-exclamation',
                success: 'fa-circle-check',
                info: 'fa-circle-info'
            })[kind] || 'fa-circle-info';
        }

        function setSystemStatus(kind, title, text, options = {}) {
            const banner = document.getElementById('system-status-banner');
            const icon = document.getElementById('system-status-icon');
            const titleEl = document.getElementById('system-status-title');
            const textEl = document.getElementById('system-status-text');
            const close = document.getElementById('system-status-close');
            if (!banner || !icon || !titleEl || !textEl || !close) return;

            clearTimeout(systemStatusTimer);
            systemStatusTimer = null;
            banner.dataset.kind = kind || 'info';
            banner.dataset.statusKey = String(options.key || kind || 'info');
            icon.className = `fa-solid ${statusIcon(kind)}`;
            titleEl.textContent = translateUI(title);
            textEl.textContent = translateUI(text);
            close.classList.toggle('hidden', options.dismissible !== true);
            banner.classList.remove('hidden');

            const autoHide = Number(options.autoHide || 0);
            if (autoHide > 0) {
                systemStatusTimer = setTimeout(() => {
                    banner.classList.add('hidden');
                    systemStatusTimer = null;
                }, autoHide);
            }
        }

        function clearSystemStatus(statusKey = '') {
            const banner = document.getElementById('system-status-banner');
            if (!banner) return;
            if (statusKey && banner.dataset.statusKey && banner.dataset.statusKey !== statusKey) return;
            clearTimeout(systemStatusTimer);
            systemStatusTimer = null;
            banner.classList.add('hidden');
        }

        window.dismissSystemStatus = function() {
            clearSystemStatus();
        };

        function appErrorCode(error) {
            return String(error?.code || '').toLowerCase();
        }

        function classifyAppError(error) {
            if (!navigator.onLine) return 'offline';
            const code = appErrorCode(error);
            const message = String(error?.message || error || '').toLowerCase();

            if (code.includes('permission-denied') || code.includes('unauthorized') || message.includes('permission')) return 'permission';
            if (code.includes('unauthenticated') || code.includes('auth/invalid-user-token')) return 'auth';
            if (code.includes('quota') || code.includes('resource-exhausted') || message.includes('quota')) return 'quota';
            if (
                code.includes('unavailable') ||
                code.includes('deadline-exceeded') ||
                code.includes('aborted') ||
                code.includes('network') ||
                message.includes('network') ||
                message.includes('offline') ||
                message.includes('firebase не подключ')
            ) return 'temporary';
            if (message.includes('localstorage') || message.includes('indexeddb') || message.includes('storage')) return 'storage';
            return 'unknown';
        }

        function friendlyIssue(scope, error, options = {}) {
            const type = classifyAppError(error);
            const localSaved = options.localSaved === true;
            if (type === 'offline') {
                return {
                    kind:'offline',
                    title:'Нет интернета',
                    text:localSaved
                        ? 'Изменения сохранены на этом устройстве. Облачная синхронизация сейчас недоступна.'
                        : 'Показываем сохранённые данные с устройства. Обновление из облака временно недоступно.',
                    persistent:true
                };
            }
            if (type === 'permission') {
                return {
                    kind:'error',
                    title:'Недостаточно прав',
                    text:'Это действие недоступно для текущей учётной записи.',
                    persistent:false
                };
            }
            if (type === 'auth') {
                return {
                    kind:'warning',
                    title:'Нужно переподключение',
                    text:'Не удалось подтвердить облачную сессию. Локальные данные остаются доступны.',
                    persistent:true
                };
            }
            if (type === 'quota') {
                return {
                    kind:'error',
                    title:'Облако временно не принимает данные',
                    text:localSaved
                        ? 'Изменения сохранены на устройстве, но сейчас не отправлены в облако.'
                        : 'Попробуйте повторить действие позже.',
                    persistent:true
                };
            }
            if (type === 'storage') {
                return {
                    kind:'error',
                    title:'Не удалось сохранить на устройстве',
                    text:'Проверьте свободное место и разрешения браузера, затем повторите действие.',
                    persistent:true
                };
            }
            if (type === 'temporary') {
                return {
                    kind:'warning',
                    title:'Облако временно недоступно',
                    text:localSaved
                        ? 'Изменения сохранены на устройстве. Облачное сохранение не выполнено.'
                        : 'Используем последнюю сохранённую версию данных и попробуем подключиться снова.',
                    persistent:true
                };
            }
            const isSave = String(scope || '').includes('save') || String(scope || '').includes('write');
            return {
                kind:'error',
                title:isSave ? 'Не удалось сохранить изменения' : 'Не удалось обновить данные',
                text:localSaved
                    ? 'Локальная копия сохранена, но облачная операция не завершилась.'
                    : 'Повторите действие. Если проблема останется, приложение продолжит использовать сохранённые данные.',
                persistent:false
            };
        }

        function reportAppError(scope, error, options = {}) {
            const issue = friendlyIssue(scope, error, options);
            const code = appErrorCode(error);
            const dedupeKey = `${scope || 'app'}|${issue.kind}|${code || issue.title}`;
            const now = Date.now();
            console.warn('[App status]', scope, error);

            if (dedupeKey === lastReportedIssueKey && now - lastReportedIssueAt < 4500) return issue;
            lastReportedIssueKey = dedupeKey;
            lastReportedIssueAt = now;

            if (issue.persistent) {
                setSystemStatus(issue.kind, issue.title, issue.text, {
                    key: issue.kind === 'offline' ? 'offline' : 'cloud',
                    dismissible: issue.kind !== 'offline'
                });
                if (issue.kind !== 'offline') cloudProblemSeen = true;
            } else {
                showToast(issue.text, issue.kind === 'error' ? 'error' : 'warning', 3200);
            }
            return issue;
        }
        window.reportAppError = reportAppError;

        function syncSystemStatus(options = {}) {
            if (!navigator.onLine) {
                setSystemStatus(
                    'offline',
                    'Нет интернета',
                    'Показываем сохранённые данные. Облачные обновления временно недоступны.',
                    { key:'offline', dismissible:false }
                );
                return;
            }

            if (!isCloudConnected) {
                setSystemStatus(
                    'warning',
                    'Облако временно недоступно',
                    'Сохранённые данные на устройстве доступны. Подключение будет восстановлено автоматически.',
                    { key:'cloud', dismissible:true }
                );
                cloudProblemSeen = true;
                return;
            }

            if (options.recovered || cloudProblemSeen) {
                cloudProblemSeen = false;
                setSystemStatus(
                    'success',
                    'Соединение восстановлено',
                    'Облачная синхронизация снова доступна.',
                    { key:'recovered', autoHide:2600, dismissible:false }
                );
            } else {
                clearSystemStatus();
            }
        }

        window.addEventListener('offline', () => {
            lastKnownOnlineState = false;
            syncSystemStatus();
            refreshSettingsSystem?.();
        });

        window.addEventListener('online', () => {
            const wasOffline = lastKnownOnlineState === false;
            lastKnownOnlineState = true;
            if (wasOffline && isCloudConnected) syncSystemStatus({ recovered:true });
            else syncSystemStatus();
            refreshSettingsSystem?.();
        });
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
            const previousContext = `${currentAccountLogin}:${currentAccessRole}`;
            const found = getAccountByUser(user);
            currentAccountLogin = found?.[0] || '';
            currentAccessRole = found?.[1]?.role || 'viewer';
            syncSessionPermissionFlags();
            window.__toeRole = currentAccessRole;
            window.__toeLogin = currentAccountLogin;
            updateAdminUI();
            if (previousContext !== `${currentAccountLogin}:${currentAccessRole}`) window.notificationAccountChanged?.();
        }
        window.__attendanceListenerActive = false;
        window.__firebaseDebug = window.__firebaseDebug || {init:false, auth:null};
        window.__firebaseUid = '';
        window.__realtimeDate = '';

        configureSchedule({
            getCloudState: () => ({ isCloudConnected, db, auth }),
            showToast: (message) => showToast(message),
            reportError: (scope, error, options) => reportAppError(scope, error, options),
            createAutomaticBackup: () => createAutomaticBackup(),
            updateBackupStatus: () => updateBackupStatus(),
            setRealtimeDiagnostic: (detail) => { firebaseDiag.realtime = { ok: true, detail }; },
            setWriteDiagnostic: (ok, detail) => { firebaseDiag.write = { ok, detail }; },
            diagLog: (message, data) => diagLog(message, data),
            publishScheduleChange: async (event) => {
                if (!event || !db || !auth?.currentUser) return false;
                const id = `schedule_${event.id || Date.now()}`;
                const payload = {
                    title: event.title || 'Изменение расписания',
                    titleKz: event.titleKz || 'Сабақ кестесі өзгерді',
                    text: event.text || '',
                    textKz: event.textKz || '',
                    createdAt: event.createdAt || new Date().toISOString(),
                    author: AUTH_ACCOUNTS[currentAccountLogin]?.label || 'Редактор расписания',
                    authorUid: auth.currentUser.uid,
                    type: 'schedule_change',
                    changeId: event.id || '',
                    changeType: event.changeType || '',
                    date: event.date || '',
                    pairNumber: event.pairNumber || ''
                };
                try {
                    await setDoc(doc(db,...CLOUD_ROOT,'notifications',id),payload);
                    return true;
                } catch (error) {
                    console.warn('schedule notification',error);
                    // The schedule itself is already saved. Do not roll it back only because
                    // this account is not allowed to publish into the event center.
                    return false;
                }
            }
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
                const genderRaw = typeof item === 'object' ? String(item?.gender || '') : '';
                const gender = genderRaw === 'male' || genderRaw === 'female' ? genderRaw : '';
                const avatarRaw = typeof item === 'object' ? String(item?.avatar || '') : '';
                const avatar = /^data:image\/(?:jpeg|jpg|png|webp);base64,/i.test(avatarRaw) && avatarRaw.length <= 40000 ? avatarRaw : '';
                result.push({ name, joinedAt, gender, avatar });
            });
            return result.sort((a,b) => a.name.localeCompare(b.name, 'ru-RU', {sensitivity:'base'}));
        }

        function getStudentRecordByName(name) {
            return studentRecords.find(item => item.name === name) || { name: String(name || ''), joinedAt: '', gender: '', avatar: '' };
        }

        function escapeStudentText(value) {
            return String(value || '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
        }

        function studentAvatarMarkup(recordOrName, className = '') {
            const record = typeof recordOrName === 'string' ? getStudentRecordByName(recordOrName) : (recordOrName || {});
            const cls = ['student-profile-avatar', record.gender || 'neutral', className].filter(Boolean).join(' ');
            if (record.avatar && /^data:image\//i.test(record.avatar)) {
                return `<span class="${cls} has-photo"><img src="${record.avatar}" alt=""></span>`;
            }
            return `<span class="${cls}"><i class="fa-solid fa-user"></i></span>`;
        }

        let studentRosterFallbackActive = false;

        function readLocalStudentRecords() {
            try {
                const raw = localStorage.getItem('toe_students_roster');
                if (raw !== null) {
                    const saved = JSON.parse(raw);
                    if (Array.isArray(saved)) {
                        const normalized = normalizeStudentRecords(saved);
                        const confirmedEmpty = localStorage.getItem('toe_students_empty_confirmed') === '1';
                        if (normalized.length || confirmedEmpty) {
                            studentRosterFallbackActive = false;
                            return normalized;
                        }
                    }
                }
            } catch (_) {}
            studentRosterFallbackActive = true;
            return normalizeStudentRecords(DEFAULT_STUDENT_RECORDS);
        }

        let studentRecords = readLocalStudentRecords();
        let students = studentRecords.map(item => item.name);

        function recoverJournalStudentNames(dateStr) {
            const names = new Set();
            const addState = state => {
                if (!state || typeof state !== 'object') return;
                Object.keys(state).forEach(name => {
                    const normalized = normalizeStudentName(name);
                    if (normalized) names.add(normalized);
                });
            };

            try {
                const raw = localStorage.getItem(`toe_att_${dateStr}`);
                if (raw) addState(JSON.parse(raw)?.state);
            } catch (_) {}

            addState(attendanceState);
            addState(attendanceArchive?.[dateStr]?.state);

            if (!names.size && attendanceArchive && typeof attendanceArchive === 'object') {
                Object.values(attendanceArchive).forEach(saved => addState(saved?.state));
            }

            return [...names].sort((x,y) => x.localeCompare(y,'ru-RU',{sensitivity:'base'}));
        }

        function getStudentsForDate(dateStr) {
            const validDate = /^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ''));
            const filtered = validDate
                ? studentRecords.filter(item => !item.joinedAt || item.joinedAt <= dateStr).map(item => item.name)
                : [...students];

            if (studentRosterFallbackActive) {
                const recovered = recoverJournalStudentNames(dateStr);
                if (recovered.length) return recovered;
            }
            if (filtered.length) return filtered;

            // Защита от ошибочно будущей joinedAt: активный состав всё равно показываем.
            if (students.length) return [...students];

            const recovered = recoverJournalStudentNames(dateStr);
            if (recovered.length) return recovered;

            return normalizeStudentRecords(DEFAULT_STUDENT_RECORDS).map(item => item.name);
        }

        function storeStudentRecordsLocally(records, options = {}) {
            studentRecords = normalizeStudentRecords(records);
            students = studentRecords.map(item => item.name);
            const confirmedEmpty = options.confirmedEmpty === true && studentRecords.length === 0;
            studentRosterFallbackActive = false;
            localStorage.setItem('toe_students_roster', JSON.stringify(studentRecords));
            if (confirmedEmpty) localStorage.setItem('toe_students_empty_confirmed', '1');
            else localStorage.removeItem('toe_students_empty_confirmed');
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
            const dateStr = `${monday.toLocaleDateString(interfaceLocale(), options)} — ${friday.toLocaleDateString(interfaceLocale(), options)}`;

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
            attendancePollTimer = setInterval(() => { if (document.visibilityState === 'visible') void poll(); }, 30000);
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

            // FAST BOOT: local data and the last opened screen are restored before any network wait.
            const savedDay = localStorage.getItem('toe_current_schedule_day');
            const savedWeek = localStorage.getItem('toe_schedule_week_type');
            const savedView = localStorage.getItem('toe_current_view');
            const initialView = savedView && ['home','tracker','roster','schedule'].includes(savedView) ? savedView : 'home';
            restoreScheduleSelection(savedDay, savedWeek);

            // Show the last-used screen immediately. Its skeleton masks the short
            // local/IndexedDB restore instead of leaving a blank or half-built page.
            showSectionLoading(initialView);
            switchView(initialView, true);

            await Promise.allSettled([
                loadAttendanceForDate(effectiveTodayStr),
                loadScheduleData()
            ]);

            try {
                renderGroupInfo();
                renderRosterList();
                renderApp(true);
                syncScheduleToToday();
                renderSchedule(getCurrentScheduleDay());
                if (savedView && ['home','tracker','roster','schedule'].includes(savedView)) switchView(savedView, true);
                else {
                    switchView('home', true);
                    restoreScrollPosition('home');
                }
            } catch (e) {
                console.warn('Быстрая локальная отрисовка частично пропущена', e);
                ensureMainViewVisible();
            }

            hideSectionLoading(initialView);
            ensureMainViewVisible();
            updateHomeWeekBanner();
            updateHomeTodayCard();
            setInterval(() => {
                if (document.visibilityState === 'visible') updateHomeTodayCard();
            }, 30000);

            // CLOUD BOOT: Firebase and realtime listeners connect in parallel without blocking the UI.
            queueMicrotask(async () => {
                try {
                    await initFirebase();
                    renderGroupInfo();
                    renderRosterList();
                    renderApp(true);
                    renderSchedule(getCurrentScheduleDay());
                } catch (e) {
                    console.warn('Firebase init skipped', e);
                }
            });
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
            title.textContent = miniCalendarMonth.toLocaleDateString(interfaceLocale(), {month:'long',year:'numeric'});
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
            curatorAvatar: '',
            headmanAvatar: '',
            deputyAvatar: '',
            groupIcon: 'user-group',
            groupAvatar: '',
            studentCount: 19
        };

        const GROUP_ICONS = Object.freeze({
            'user-group': 'Группа', 'graduation-cap': 'Учёба', 'book-open': 'Книга',
            'bolt': 'Энергия', 'atom': 'Наука', 'laptop-code': 'Технологии',
            'gear': 'Механика', 'building-columns': 'Колледж'
        });
        function normalizeGroupIcon(value) {
            return Object.prototype.hasOwnProperty.call(GROUP_ICONS, value) ? value : 'user-group';
        }

        function normalizeLeaderAvatar(value) {
            const avatar = String(value || '');
            return /^data:image\/(?:jpeg|jpg|png|webp);base64,/i.test(avatar) && avatar.length <= 40000 ? avatar : '';
        }

        function readLocalGroupInfo() {
            try {
                const saved = JSON.parse(localStorage.getItem('toe_group_info') || '{}');
                return normalizeGroupInfoCloudData(saved);
            } catch (e) {
                return { ...DEFAULT_GROUP_INFO };
            }
        }

        let groupInfoState = readLocalGroupInfo();
        let groupSettingsDirty = false;
        let groupIconDraft = 'user-group';
        let groupAvatarDraft = '';
        let groupSettingsSaving = false;
        let settingsSystemTimer = null;

        function getGroupInfo() {
            return { ...DEFAULT_GROUP_INFO, ...groupInfoState };
        }

        function saveGroupInfoLocally(info) {
            groupInfoState = { ...DEFAULT_GROUP_INFO, ...info };
            localStorage.setItem('toe_group_info', JSON.stringify(groupInfoState));
            renderGroupInfo();
        }

        function renderLeaderAvatarElement(el, avatar) {
            if (!el) return;
            const safeAvatar = normalizeLeaderAvatar(avatar);
            el.classList.toggle('has-photo', !!safeAvatar);
            el.innerHTML = safeAvatar
                ? `<img src="${safeAvatar}" alt="">`
                : '<i class="fa-regular fa-user"></i>';
            const editable = canEditGroupInfo();
            el.disabled = !editable;
            el.setAttribute('aria-disabled', editable ? 'false' : 'true');
        }

        function renderLeaderAvatars(info) {
            const map = {
                curator: info.curatorAvatar,
                headman: info.headmanAvatar,
                deputy: info.deputyAvatar
            };
            Object.entries(map).forEach(([role, avatar]) => {
                renderLeaderAvatarElement(document.getElementById(`leader-avatar-${role}-home`), avatar);
                renderLeaderAvatarElement(document.getElementById(`leader-avatar-${role}-roster`), avatar);
            });
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
            renderLeaderAvatars(info);
            renderGroupIcon(info);
            loadGroupInfoToAdminForm();
        }

        function normalizeGroupInfoCloudData(data = {}) {
            return {
                groupName: data.groupName ?? DEFAULT_GROUP_INFO.groupName,
                curator: data.curator ?? DEFAULT_GROUP_INFO.curator,
                headman: data.headman ?? DEFAULT_GROUP_INFO.headman,
                deputy: data.deputy ?? DEFAULT_GROUP_INFO.deputy,
                curatorAvatar: normalizeLeaderAvatar(data.curatorAvatar),
                headmanAvatar: normalizeLeaderAvatar(data.headmanAvatar),
                deputyAvatar: normalizeLeaderAvatar(data.deputyAvatar),
                groupIcon: normalizeGroupIcon(data.groupIcon),
                groupAvatar: normalizeLeaderAvatar(data.groupAvatar),
                studentCount: Number.isFinite(Number(data.studentCount)) ? Number(data.studentCount) : DEFAULT_GROUP_INFO.studentCount
            };
        }

        let leaderPhotoEditRole = '';
        let leaderPhotoDraft = '';

        function leaderRoleLabel(role) {
            return ({ curator:'Куратор', headman:'Староста', deputy:'Зам. старосты' })[role] || 'Профиль';
        }

        function leaderRoleName(role, info = getGroupInfo()) {
            return ({ curator:info.curator, headman:info.headman, deputy:info.deputy })[role] || '—';
        }

        function renderLeaderPhotoPreview() {
            const preview = document.getElementById('leader-profile-preview');
            if (!preview) return;
            preview.classList.toggle('has-photo', !!leaderPhotoDraft);
            preview.innerHTML = leaderPhotoDraft
                ? `<img src="${leaderPhotoDraft}" alt="">`
                : '<i class="fa-regular fa-user"></i>';
            document.getElementById('leader-profile-remove-photo')?.classList.toggle('hidden', !leaderPhotoDraft);
        }

        window.openLeaderPhotoEditor = function(role) {
            if (!['curator','headman','deputy'].includes(role)) return;
            if (!canEditGroupInfo()) {
                showToast('Фото руководства может менять только пользователь с правом редактирования данных группы');
                return;
            }
            const info = getGroupInfo();
            leaderPhotoEditRole = role;
            leaderPhotoDraft = normalizeLeaderAvatar(info[`${role}Avatar`]);
            const title = document.getElementById('leader-profile-modal-title');
            const name = document.getElementById('leader-profile-name');
            if (title) title.textContent = leaderRoleLabel(role);
            if (name) name.textContent = leaderRoleName(role, info);
            const input = document.getElementById('leader-profile-photo');
            if (input) input.value = '';
            renderLeaderPhotoPreview();
            document.getElementById('leader-profile-modal')?.classList.remove('hidden');
            document.body.classList.add('modal-open');
        };

        window.closeLeaderPhotoEditor = function() {
            document.getElementById('leader-profile-modal')?.classList.add('hidden');
            document.body.classList.remove('modal-open');
            leaderPhotoEditRole = '';
            leaderPhotoDraft = '';
        };

        window.handleLeaderProfilePhoto = async function(input) {
            const file = input?.files?.[0];
            if (!file) return;
            try {
                leaderPhotoDraft = await compressStudentAvatar(file);
                renderLeaderPhotoPreview();
            } catch (e) {
                showToast(e?.message || 'Не удалось обработать фото');
                if (input) input.value = '';
            }
        };

        window.removeLeaderProfilePhoto = function() {
            leaderPhotoDraft = '';
            const input = document.getElementById('leader-profile-photo');
            if (input) input.value = '';
            renderLeaderPhotoPreview();
        };

        window.saveLeaderProfilePhoto = async function() {
            if (!canEditGroupInfo() || !['curator','headman','deputy'].includes(leaderPhotoEditRole)) return;
            const info = getGroupInfo();
            const next = { ...info, [`${leaderPhotoEditRole}Avatar`]: normalizeLeaderAvatar(leaderPhotoDraft) };
            const approxBytes = new Blob([JSON.stringify(next)]).size;
            if (approxBytes > 250000) {
                showToast('Фотографии профилей слишком большие');
                return;
            }
            saveGroupInfoLocally(next);
            const ok = await persistGroupInfoToCloud(next);
            closeLeaderPhotoEditor();
            showToast(ok ? 'Фото профиля сохранено' : 'Фото сохранено только на этом устройстве');
        };

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
            groupInfoPollTimer = setInterval(() => { if (document.visibilityState === 'visible') void pollGroupInfoOnce(); }, 30000);
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
            const confirmedEmpty = data.emptyRosterConfirmed === true;

            if (!incoming.length) {
                if (data.students.length > 0) return; // malformed records
                if (!confirmedEmpty) {
                    console.warn('Empty students_shared ignored to protect the roster from accidental wipe');
                    if (updatedAt) lastStudentsUpdatedAt = updatedAt;
                    renderStudentDependentViews();
                    return;
                }
            }

            if (updatedAt) lastStudentsUpdatedAt = updatedAt;
            studentRosterFallbackActive = false;
            storeStudentRecordsLocally(incoming, { confirmedEmpty });
            syncStudentCountLocally();
            rosterStatsReady = false;
            renderStudentDependentViews();
            scheduleRosterStatsRebuild(200);
        }

        async function persistStudentsToCloud(records = studentRecords) {
            if (!canManageStudents()) return false;
            const normalized = normalizeStudentRecords(records);
            const confirmedEmpty = normalized.length === 0;
            storeStudentRecordsLocally(normalized, { confirmedEmpty });
            const approxBytes = new Blob([JSON.stringify(normalized)]).size;
            if (approxBytes > 800000) {
                showToast('Профили стали слишком большими для облачной записи. Уменьшите или удалите часть фотографий.');
                return false;
            }
            syncStudentCountLocally();
            renderStudentDependentViews();
            rosterStatsReady = false;
            scheduleRosterStatsRebuild(150);

            if (!isCloudConnected || !db || !auth?.currentUser) return false;
            const payload = {
                students: normalized,
                emptyRosterConfirmed: confirmedEmpty,
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
            studentsPollTimer = setInterval(() => { if (document.visibilityState === 'visible') void pollStudentsOnce(); }, 30000);
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
            if (!confirm(translateUI(`Убрать ${record.name} из группы? Старые записи посещаемости останутся в архиве.`))) return;
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
            el.contentEditable = 'false';
            el.removeAttribute('tabindex');
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
            const info = getGroupInfo();
            if (!groupSettingsDirty) {
                ['groupName', 'curator', 'headman', 'deputy'].forEach(field => {
                    const id = field === 'groupName' ? 'name' : field;
                    const input = document.getElementById(`settings-group-${id}`);
                    if (input) input.value = info[field] || (field === 'deputy' ? '—' : '');
                });
                groupIconDraft = normalizeGroupIcon(info.groupIcon);
                groupAvatarDraft = normalizeLeaderAvatar(info.groupAvatar);
            }
            const count = document.getElementById('settings-student-count');
            if (count) count.textContent = students.length;
            const allowed = canEditGroupInfo();
            const fields = document.getElementById('settings-group-fields');
            if (fields) fields.disabled = !allowed || groupSettingsSaving;
            document.getElementById('settings-group-icon-tools')?.classList.toggle('hidden', !allowed);
            const save = document.getElementById('settings-group-save');
            if (save) { save.classList.toggle('hidden', !allowed); save.disabled = groupSettingsSaving; }
            const upload = document.getElementById('settings-group-photo');
            if (upload) upload.disabled = !allowed || groupSettingsSaving;
            renderGroupIconOptions();
        }

        function renderGroupIcon(info = getGroupInfo()) {
            const el = document.getElementById('group-icon-home');
            if (!el) return;
            const avatar = normalizeLeaderAvatar(info.groupAvatar);
            el.innerHTML = avatar ? `<img src="${avatar}" alt="">` : `<i class="fa-solid fa-${normalizeGroupIcon(info.groupIcon)}"></i>`;
            el.disabled = !canEditGroupInfo();
            el.setAttribute('aria-disabled', String(el.disabled));
        }

        function renderGroupIconOptions() {
            const preview = document.getElementById('settings-group-icon-preview');
            if (preview) preview.innerHTML = groupAvatarDraft
                ? `<img src="${groupAvatarDraft}" alt="">`
                : `<i class="fa-solid fa-${normalizeGroupIcon(groupIconDraft)}"></i>`;
            const options = document.getElementById('settings-group-icon-options');
            if (options) options.innerHTML = Object.entries(GROUP_ICONS).map(([icon, label]) =>
                `<button type="button" onclick="chooseGroupIcon('${icon}')" aria-label="${translateUI(label)}" title="${translateUI(label)}" aria-pressed="${!groupAvatarDraft && icon === groupIconDraft}" ${!canEditGroupInfo() || groupSettingsSaving ? 'disabled' : ''}><i class="fa-solid fa-${icon}"></i></button>`
            ).join('');
            document.getElementById('settings-group-remove-photo')?.classList.toggle('hidden', !groupAvatarDraft);
        }

        window.markGroupSettingsDirty = function() {
            if (!canEditGroupInfo() || groupSettingsSaving) return;
            groupSettingsDirty = true;
            const status = document.getElementById('settings-group-save-status');
            if (status) status.textContent = '';
        };
        window.chooseGroupIcon = function(icon) {
            if (!canEditGroupInfo() || groupSettingsSaving) return;
            ++groupPhotoRequest;
            groupIconDraft = normalizeGroupIcon(icon);
            groupAvatarDraft = '';
            markGroupSettingsDirty();
            renderGroupIconOptions();
        };
        let groupPhotoRequest = 0;
        window.handleGroupPhoto = async function(input) {
            if (!canEditGroupInfo() || groupSettingsSaving) return;
            const file = input?.files?.[0];
            if (!file) return;
            const request = ++groupPhotoRequest;
            try {
                const avatar = await compressStudentAvatar(file);
                if (request !== groupPhotoRequest || !canEditGroupInfo()) return;
                groupAvatarDraft = normalizeLeaderAvatar(avatar);
                markGroupSettingsDirty();
                renderGroupIconOptions();
            } catch (e) { showToast(e?.message || 'Не удалось обработать фото'); }
            finally { if (input) input.value = ''; }
        };
        window.removeGroupPhoto = function() {
            if (!canEditGroupInfo() || groupSettingsSaving) return;
            ++groupPhotoRequest;
            groupAvatarDraft = '';
            markGroupSettingsDirty();
            renderGroupIconOptions();
        };
        window.saveGroupSettings = async function(event) {
            event?.preventDefault();
            if (!canEditGroupInfo() || groupSettingsSaving) return;
            const next = { ...getGroupInfo(), groupIcon: normalizeGroupIcon(groupIconDraft), groupAvatar: normalizeLeaderAvatar(groupAvatarDraft), studentCount: students.length };
            for (const field of ['groupName', 'curator', 'headman', 'deputy']) {
                const id = field === 'groupName' ? 'name' : field;
                const value = normalizeStudentName(document.getElementById(`settings-group-${id}`)?.value);
                if ((field === 'groupName' && !value) || value.length > (field === 'groupName' ? 60 : 80) || /[<>]/.test(value)) {
                    showToast('Проверьте данные группы');
                    return;
                }
                next[field] = value || '—';
            }
            ++groupPhotoRequest;
            groupSettingsSaving = true;
            loadGroupInfoToAdminForm();
            try {
                saveGroupInfoLocally(next);
                const ok = await persistGroupInfoToCloud(next);
                groupSettingsDirty = false;
                const message = ok ? 'Данные группы сохранены в облаке' : 'Данные группы сохранены только на этом устройстве';
                const status = document.getElementById('settings-group-save-status');
                if (status) status.textContent = message;
                showToast(message);
                renderRosterList();
            } finally {
                groupSettingsSaving = false;
                loadGroupInfoToAdminForm();
            }
        };
        window.openGroupSettings = function() {
            openAdminSettings();
            const section = document.getElementById('settings-group-section');
            if (section) { section.open = true; section.scrollIntoView({block:'start',behavior:'smooth'}); }
        };

        function refreshSettingsSystem() {
            const version = document.getElementById('settings-build-version');
            if (version) version.textContent = getSiteVersion(document.querySelector('meta[name="app-build"]')?.content);
            const sync = document.getElementById('settings-sync-status');
            if (sync) sync.textContent = translateUI(isCloudConnected ? 'Подключено к облаку' : 'Нет подключения к облаку');
        }

        // Настройки доступа: владелец + два администратора. Обычные посетители работают без входа.
        window.openAdminSettings = function() {
            const modal = document.getElementById('admin-settings-modal');
            modal.classList.remove('hidden');
            modal.classList.add('flex');
            document.body.classList.add('settings-open');
            loadGroupInfoToAdminForm();
            document.getElementById('admin-login-box')?.classList.toggle('hidden', isEditorRole());
            document.getElementById('admin-panel')?.classList.toggle('hidden', !isEditorRole());
            updateAdminUI();
            refreshSettingsSystem();
            window.refreshNotificationSettings?.();
            clearInterval(settingsSystemTimer);
            settingsSystemTimer = setInterval(refreshSettingsSystem, 15000);
            document.querySelectorAll('#bottom-nav button[data-nav]').forEach(btn => btn.classList.toggle('active', btn.dataset.nav === 'settings'));
        };

        window.closeAdminSettings = function() {
            const modal = document.getElementById('admin-settings-modal');
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            document.body.classList.remove('settings-open');
            clearInterval(settingsSystemTimer);
            settingsSystemTimer = null;
            document.querySelectorAll('#bottom-nav button[data-nav]').forEach(btn => btn.classList.toggle('active', btn.dataset.nav === (localStorage.getItem('toe_current_view') || 'home')));
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
                await window.notificationAccountWillChange?.();
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
            adminPermissionsPollTimer = setInterval(() => { if (document.visibilityState === 'visible') void pollAdminPermissionsOnce(); }, 30000);
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
            renderLeaderAvatars(getGroupInfo());
            renderGroupIcon();
            loadGroupInfoToAdminForm();
            document.getElementById('settings-backups-section')?.classList.toggle('hidden', !backupsAllowed);
            document.getElementById('settings-logout')?.classList.toggle('hidden', !editor);
            const rosterView = document.getElementById('view-roster');
            if (rosterView && !rosterView.classList.contains('hidden')) renderRosterList();
            const scheduleView = document.getElementById('view-schedule');
            if (scheduleView && !scheduleView.classList.contains('hidden')) {
                try { renderSchedule(getCurrentScheduleDay()); } catch (_) {}
            }
            // После восстановления Firebase-роли ни один сценарий не должен оставлять приложение без видимого раздела.
            setTimeout(ensureMainViewVisible, 0);
            window.refreshSupportNotifications?.();
        }

        window.adminLogout = async function() {
            try {
                await window.notificationAccountWillChange?.();
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
        if ('requestIdleCallback' in window) requestIdleCallback(() => updateBackupStatus(), { timeout: 2200 });
        else setTimeout(updateBackupStatus, 900);

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
            scrollSaveTimer = setTimeout(saveCurrentScrollPosition, 160);
        }, { passive: true });

        window.addEventListener('beforeunload', saveCurrentScrollPosition);

        const mainViews = {
            home: document.getElementById('view-home'),
            tracker: document.getElementById('view-tracker'),
            roster: document.getElementById('view-roster'),
            schedule: document.getElementById('view-schedule')
        };

        const sectionLoadingTimers = new Map();

        function showSectionLoading(viewName, delay = 0) {
            const view = mainViews[viewName];
            if (!view) return;
            const previous = sectionLoadingTimers.get(viewName);
            if (previous) clearTimeout(previous);
            sectionLoadingTimers.delete(viewName);

            if (delay > 0) {
                const timer = setTimeout(() => {
                    sectionLoadingTimers.delete(viewName);
                    view.classList.add('is-section-loading');
                    view.setAttribute('aria-busy', 'true');
                }, delay);
                sectionLoadingTimers.set(viewName, timer);
                return;
            }

            view.classList.add('is-section-loading');
            view.setAttribute('aria-busy', 'true');
        }

        function hideSectionLoading(viewName) {
            const view = mainViews[viewName];
            const timer = sectionLoadingTimers.get(viewName);
            if (timer) clearTimeout(timer);
            sectionLoadingTimers.delete(viewName);
            if (!view) return;
            view.classList.remove('is-section-loading');
            view.removeAttribute('aria-busy');
        }
        const mainNavButtons = [...document.querySelectorAll('#bottom-nav button[data-nav]')];
        const bottomNavElement = document.getElementById('bottom-nav');
        let currentVisibleView = '';
        window.switchView = function(viewName, fromReload = false) {
            const settingsModal = document.getElementById('admin-settings-modal');
            const settingsOpen = !!settingsModal && !settingsModal.classList.contains('hidden');
            if (settingsOpen) window.closeAdminSettings?.();
            if (currentVisibleView === viewName && !fromReload) return;
            const targetView = mainViews[viewName] || mainViews.home;
            if (!targetView) return;

            saveCurrentScrollPosition();
            try { localStorage.setItem('toe_current_view', viewName); } catch(e) {}

            Object.values(mainViews).forEach(view => view?.classList.add('hidden'));
            mainNavButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.nav === viewName));
            bottomNavElement?.classList.remove('hidden');

            // Build expensive DOM while the target is still hidden: this avoids repeated
            // layout/paint work during the actual visible transition.
            if (viewName === 'home') {
                renderHomeDayTimeline();
            } else if (viewName === 'tracker') {
                renderApp();
            } else if (viewName === 'roster') {
                renderRosterList();
            } else if (viewName === 'schedule') {
                syncScheduleToToday();
                renderSchedule(getCurrentScheduleDay());
            }

            targetView.classList.remove('hidden');
            currentVisibleView = viewName;
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
            if (!confirm(translateUI('Восстановить данные из последней резервной копии? Текущие локальные данные будут заменены.'))) return;
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
                el.textContent = `Последняя копия: ${d.toLocaleString(interfaceLocale(), {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'})}`;
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
                stats.attendancePercent = stats.total > 0 ? Math.round(((stats.present + stats.late) / stats.total) * 100) : 0;
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
            if (activeJournalTab === 'stats') renderAttendanceAssessmentList();
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
                    renderApp();
                    renderMiniCalendar();
                    if (activeJournalTab === 'stats') renderAttendanceAssessmentList();
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
            const fragment = document.createDocumentFragment();
            const info = getGroupInfo();
            const rc=document.getElementById('roster-curator'), rh=document.getElementById('roster-headman'), rd=document.getElementById('roster-deputy');
            if(rc) rc.textContent=info.curator||'—';
            if(rh) rh.textContent=info.headman||'—';
            if(rd) rd.textContent=info.deputy||'—';
            const editable = canManageStudents();

            studentRecords.forEach((record, index) => {
                const item = document.createElement('div');
                item.className = 'roster-person-card';
                item.innerHTML = `
                    <div class="roster-person-main">
                        ${studentAvatarMarkup(record, 'roster-profile-avatar')}
                        <div class="roster-person-text"><strong>${index+1}. ${escapeStudentText(record.name)}</strong><span>Студент группы</span></div>
                    </div>
                    ${editable ? `<div class="roster-admin-actions roster-person-actions">
                        <button type="button" onclick="openStudentProfileEditor(${index})" title="Редактировать профиль" aria-label="Редактировать профиль ${escapeStudentText(record.name)}"><i class="fa-regular fa-pen-to-square"></i></button>
                        <button type="button" class="danger" onclick="removeStudent(${index})" title="Удалить" aria-label="Удалить ${escapeStudentText(record.name)}"><i class="fa-regular fa-trash-can"></i></button>
                    </div>` : ''}`;
                fragment.appendChild(item);
            });
            container.replaceChildren(fragment);
        }

        let studentProfileEditIndex = -1;
        let studentProfileGenderDraft = '';
        let studentProfileAvatarDraft = '';

        function renderStudentProfilePreview() {
            const preview = document.getElementById('student-profile-preview');
            if (!preview) return;
            preview.className = 'student-profile-preview ' + (studentProfileGenderDraft || 'neutral') + (studentProfileAvatarDraft ? ' has-photo' : '');
            preview.innerHTML = studentProfileAvatarDraft
                ? `<img src="${studentProfileAvatarDraft}" alt="">`
                : '<i class="fa-solid fa-user"></i>';
            document.getElementById('student-gender-male')?.classList.toggle('active', studentProfileGenderDraft === 'male');
            document.getElementById('student-gender-female')?.classList.toggle('active', studentProfileGenderDraft === 'female');
            document.getElementById('student-profile-remove-photo')?.classList.toggle('hidden', !studentProfileAvatarDraft);
        }

        window.openStudentProfileEditor = function(index = -1) {
            if (!canManageStudents()) { showToast('Нет права на изменение состава группы'); return; }
            studentProfileEditIndex = Number.isInteger(index) ? index : -1;
            const record = studentProfileEditIndex >= 0 ? studentRecords[studentProfileEditIndex] : null;
            studentProfileGenderDraft = record?.gender || '';
            studentProfileAvatarDraft = record?.avatar || '';
            const nameInput = document.getElementById('student-profile-name');
            if (nameInput) nameInput.value = record?.name || '';
            const photoInput = document.getElementById('student-profile-photo');
            if (photoInput) photoInput.value = '';
            const title = document.getElementById('student-profile-modal-title');
            if (title) title.textContent = record ? 'Редактирование ученика' : 'Добавление ученика';
            renderStudentProfilePreview();
            document.getElementById('student-profile-modal')?.classList.remove('hidden');
            document.body.classList.add('modal-open');
            setTimeout(() => nameInput?.focus(), 50);
        };

        window.closeStudentProfileEditor = function() {
            document.getElementById('student-profile-modal')?.classList.add('hidden');
            document.body.classList.remove('modal-open');
            studentProfileEditIndex = -1;
            studentProfileGenderDraft = '';
            studentProfileAvatarDraft = '';
        };

        window.setStudentProfileGender = function(gender) {
            if (gender !== 'male' && gender !== 'female') return;
            studentProfileGenderDraft = gender;
            renderStudentProfilePreview();
        };

        async function compressStudentAvatar(file) {
            if (!file || !String(file.type || '').startsWith('image/')) throw new Error('Выберите изображение');
            const dataUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result || ''));
                reader.onerror = () => reject(new Error('Не удалось прочитать фото'));
                reader.readAsDataURL(file);
            });
            const image = await new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => reject(new Error('Не удалось открыть фото'));
                img.src = dataUrl;
            });
            const attempts = [[144,.78],[128,.72],[112,.66],[96,.60]];
            let last = '';
            for (const [size, quality] of attempts) {
                const canvas = document.createElement('canvas');
                canvas.width = canvas.height = size;
                const ctx = canvas.getContext('2d', { alpha:false });
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0,0,size,size);
                const width = image.naturalWidth || image.width;
                const height = image.naturalHeight || image.height;
                const side = Math.min(width,height);
                const sx = (width-side)/2;
                const sy = (height-side)/2;
                ctx.drawImage(image,sx,sy,side,side,0,0,size,size);
                last = canvas.toDataURL('image/jpeg',quality);
                if (last.length <= 36000) return last;
            }
            if (last.length > 40000) throw new Error('Фото получилось слишком большим. Выберите другое изображение.');
            return last;
        }

        window.handleStudentProfilePhoto = async function(input) {
            const file = input?.files?.[0];
            if (!file) return;
            try {
                studentProfileAvatarDraft = await compressStudentAvatar(file);
                renderStudentProfilePreview();
            } catch (e) {
                showToast(e?.message || 'Не удалось обработать фото');
                if (input) input.value = '';
            }
        };

        window.removeStudentProfilePhoto = function() {
            studentProfileAvatarDraft = '';
            const input = document.getElementById('student-profile-photo');
            if (input) input.value = '';
            renderStudentProfilePreview();
        };

        window.saveStudentProfile = async function() {
            if (!canManageStudents()) { showToast('Нет права на изменение состава группы'); return; }
            const name = normalizeStudentName(document.getElementById('student-profile-name')?.value);
            if (!name) { showToast('Введите фамилию и имя ученика'); return; }
            if (name.length > 80 || /[<>&"'\x60]/.test(name)) { showToast('Проверьте имя ученика'); return; }
            if (studentProfileGenderDraft !== 'male' && studentProfileGenderDraft !== 'female') {
                showToast('Выберите пол ученика');
                return;
            }
            if (students.some((existing,i) => i !== studentProfileEditIndex && existing.toLocaleLowerCase('ru-RU') === name.toLocaleLowerCase('ru-RU'))) {
                showToast('Такой ученик уже есть в группе');
                return;
            }
            const existing = studentProfileEditIndex >= 0 ? studentRecords[studentProfileEditIndex] : null;
            const record = {
                name,
                joinedAt: existing?.joinedAt || getCurrentDateStr(),
                gender: studentProfileGenderDraft,
                avatar: studentProfileAvatarDraft || ''
            };
            const next = studentProfileEditIndex >= 0
                ? studentRecords.map((item,i) => i === studentProfileEditIndex ? record : item)
                : [...studentRecords, record];
            const ok = await persistStudentsToCloud(next);
            closeStudentProfileEditor();
            showToast(ok ? (existing ? 'Профиль ученика обновлён' : 'Ученик добавлен в облако') : 'Изменения сохранены только на этом устройстве');
        };

        window.renameStudent = async function(index) {
            if (!canManageStudents()) { showToast('Нет права на изменение состава группы'); return; }
            const record=studentRecords[index]; if(!record) return;
            const nextName=normalizeStudentName(prompt(translateUI('Фамилия и имя студента'), record.name));
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
                dateEl.textContent = now.toLocaleDateString(interfaceLocale(), {weekday:'long',day:'numeric',month:'long'});
                weekEl.textContent = '—';
                lessonEl.textContent = 'Ближайших занятий в расписании не найдено.';
                return;
            }

            const { date, lesson, weekType } = result;
            const sameDay = formatLocalDate(date) === formatLocalDate(now);
            if (captionEl) captionEl.textContent = sameDay ? 'Следующая пара' : 'Следующий учебный день';
            dateEl.textContent = date.toLocaleDateString(interfaceLocale(), {weekday:'long',day:'numeric',month:'long'});
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

        function renderAttendanceAssessmentList() {
            const list = document.getElementById('attendance-student-list');
            if (!list) return;
            list.innerHTML = studentRecords.map(record => {
                const stats = getStudentAttendanceStats(record.name);
                const encoded = encodeURIComponent(record.name);
                return `<button class="assessment-student-row" onclick="openAttendanceStudentDetail(decodeURIComponent('${encoded}'))">
                    <span class="assessment-student-main">${studentAvatarMarkup(record, 'assessment-student-avatar')}<strong>${escapeStudentText(record.name)}</strong></span>
                    <b class="assessment-percent">${stats.attendancePercent || 0}%</b>
                    <span>${stats.present || 0}</span>
                    <span>${stats.sick || 0}</span>
                    <span>${stats.excused || 0}</span>
                    <span>${stats.unexcused || 0}</span>
                    <span>${stats.late || 0}</span>
                    <span>${stats.absent || 0}</span>
                </button>`;
            }).join('') || '<div class="assessment-empty">В группе пока нет учеников.</div>';
            applyKzTranslations(list);
        }

        function renderAttendanceStudentDetail(name) {
            const record = getStudentRecordByName(name);
            const stats = getStudentAttendanceStats(name);
            const avatar = document.getElementById('assessment-detail-avatar');
            if (avatar) avatar.innerHTML = studentAvatarMarkup(record, 'assessment-detail-avatar-inner');
            const setText = (id, value) => { const el=document.getElementById(id); if(el) el.textContent=String(value); };
            setText('assessment-detail-name', name || '—');
            setText('assessment-detail-percent', (stats.attendancePercent || 0) + '%');
            setText('assessment-detail-present', stats.present || 0);
            setText('assessment-detail-sick', stats.sick || 0);
            setText('assessment-detail-excused', stats.excused || 0);
            setText('assessment-detail-unexcused', stats.unexcused || 0);
            setText('assessment-detail-late', stats.late || 0);
            setText('assessment-detail-total', stats.total || 0);

            const history = document.getElementById('assessment-detail-history');
            if (!history) return;
            const rows = [];
            Object.keys(attendanceArchive || {}).sort().reverse().forEach(date => {
                const saved = attendanceArchive[date];
                const status = saved?.state?.[name];
                if (!status) return;
                const note = saved?.notes?.[name] || '';
                rows.push(`<div class="assessment-history-row">
                    <div class="assessment-history-date"><strong>${new Date(date+'T00:00:00').toLocaleDateString(interfaceLocale(),{weekday:'short',day:'2-digit',month:'long',year:'numeric'})}</strong><span>${note ? escapeStudentText(note) : 'Без примечания'}</span></div>
                    <b class="${status}">${getStatusName(status)}</b>
                </div>`);
            });
            history.innerHTML = rows.length ? rows.join('') : '<div class="assessment-empty">По этому ученику пока нет сохранённых отметок.</div>';
        }

        window.openAttendanceStudentDetail = function(name) {
            document.getElementById('attendance-student-list-view')?.classList.add('hidden');
            document.getElementById('attendance-student-detail')?.classList.remove('hidden');
            renderAttendanceStudentDetail(name);
        };

        window.closeAttendanceStudentDetail = function() {
            document.getElementById('attendance-student-detail')?.classList.add('hidden');
            document.getElementById('attendance-student-list-view')?.classList.remove('hidden');
        };

        function renderJournalScoreCard() {
            renderAttendanceAssessmentList();
        }
        window.renderJournalScoreCard = renderJournalScoreCard;

        let lastJournalRenderKey = '';
        function renderApp(force = false) {
            const container = document.getElementById('students-container');
            if (!container) return;
            const searchVal = (document.getElementById('search-input')?.value || '').toLowerCase();
            const counts = { present: 0, late: 0, sick: 0, excused: 0, unexcused: 0 };
            const selectedDate = document.getElementById('date-picker')?.value || getCurrentDateStr();
            const journalStudents = getStudentsForDate(selectedDate);
            const editable = canEditJournal();
            const renderKey = JSON.stringify([selectedDate, searchVal, editable, currentLang(), activeJournalTab, journalStudents, attendanceState, attendanceNotes]);
            if (!force && renderKey === lastJournalRenderKey) {
                if (activeJournalTab === 'stats') renderAttendanceAssessmentList();
                return;
            }
            lastJournalRenderKey = renderKey;
            const fragment = document.createDocumentFragment();
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
                let noteControl = '<span class="journal-ref-note-placeholder" aria-hidden="true"></span>';
                if (currentStatus && editable) {
                    noteControl = note
                        ? `<button class="journal-ref-note has-note" onclick="openAttendanceNote('${safeName}')" title="Изменить примечание"><i class="fa-regular fa-note-sticky"></i><span>${escapeStudentText(note)}</span></button>`
                        : `<button class="journal-ref-note empty-note" onclick="openAttendanceNote('${safeName}')" title="Добавить примечание" aria-label="Добавить примечание"><i class="fa-solid fa-pencil"></i><span>Добавить примечание</span></button>`;
                } else if (currentStatus && note) {
                    noteControl = `<span class="journal-ref-note-view"><i class="fa-regular fa-note-sticky"></i><span>${escapeStudentText(note)}</span></span>`;
                }
                row.innerHTML = `
                    <span class="journal-ref-index">${index + 1}</span>
                    <div class="journal-ref-person">
                        ${studentAvatarMarkup(name, 'journal-student-avatar')}
                        <strong>${escapeStudentText(name)}</strong>
                    </div>
                    ${buttons}
                    ${noteControl}`;
                fragment.appendChild(row);
            });

            container.replaceChildren(fragment);

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

            if (activeJournalTab === 'stats') renderAttendanceAssessmentList();
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
            showSectionLoading('tracker', 140);
            try {
                await loadAttendanceForDate(val);
                // Переподключаем realtime listener именно к выбранной дате.
                if (isCloudConnected && db && auth?.currentUser) subscribeToAttendance(val);
            } finally {
                hideSectionLoading('tracker');
            }
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
            showSectionLoading('tracker', 140);
            try {
                await loadAttendanceForDate(value);
                if (isCloudConnected && db && auth?.currentUser) subscribeToAttendance(value);
            } finally {
                hideSectionLoading('tracker');
            }
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
            showSectionLoading('tracker', 140);
            try {
                await loadAttendanceForDate(value);
            } finally {
                hideSectionLoading('tracker');
            }
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
                    if (type === 'absent') lines.push(`${name}, ${translateUI(getStatusName(st))}.`);
                }
                if (type === 'full') lines.push(`${name}, ${translateUI(getStatusName(st))}.`);
            });
            lines.push(translateUI(`Присутствуют: ${presentCount}. Отсутствуют: ${absentCount}.`));
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
            msgEl.innerText = translateUI(msg);
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
                event.returnValue = translateUI('Изменения ещё сохраняются. Покинуть страницу?');
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

window.setInterfaceLanguage = function(lang) {
    localStorage.setItem(UI_LANG_KEY, lang === 'kz' ? 'kz' : 'ru');
    updateLanguageButtons();
    applyKzTranslations();
    renderHomeDayTimeline();
    renderSchedule(getCurrentScheduleDay());
    renderMiniCalendar();
    renderApp();
    if (activeJournalTab === 'stats') renderAttendanceAssessmentList();
    updateAdminUI();
    updateBackupStatus();
    refreshSettingsSystem();
    window.refreshNotificationSettings?.();
    window.updateInstallButton?.();
    applyKzTranslations();
};
function updateLanguageButtons() {
    const lang = currentLang();
    document.getElementById('lang-ru')?.classList.toggle('active', lang === 'ru');
    document.getElementById('lang-kz')?.classList.toggle('active', lang === 'kz');
    document.documentElement.lang = lang === 'kz' ? 'kk' : 'ru';
}
startInterfaceTranslations();
updateLanguageButtons();

let deferredInstallPrompt = null;

const ANDROID_APK_URL = 'https://github.com/sinevbogdan100-jpg/college2026grouponecurs.com/releases/latest/download/SBP-Information-latest.apk';
const APP_VERSION_URL = 'app-version.json';
let publicAndroidVersion = null;

function isNativeAndroidShell() {
    try { return !!window.SBPAndroid && window.SBPAndroid.isNativeApp(); }
    catch (_) { return false; }
}
function getNativeVersionCode() {
    try { return Number(window.SBPAndroid?.getVersionCode?.() || 0); }
    catch (_) { return 0; }
}
function getNativeVersionName() {
    try { return String(window.SBPAndroid?.getVersionName?.() || ''); }
    catch (_) { return ''; }
}
function openAndroidDownload(url = ANDROID_APK_URL) {
    const target = String(url || ANDROID_APK_URL);
    if (isNativeAndroidShell()) {
        try { window.SBPAndroid.openUpdate(target); return; } catch (_) {}
    }
    window.location.href = target;
}
window.downloadLatestAndroidApp = function() {
    openAndroidDownload(publicAndroidVersion?.apkUrl || ANDROID_APK_URL);
};
function renderNativeAppUpdate(info) {
    if (!isNativeAndroidShell() || !info) return;
    document.getElementById('native-app-update')?.remove();
    const banner = document.createElement('aside');
    banner.id = 'native-app-update';
    banner.className = 'native-app-update';
    banner.innerHTML = '<span class="native-app-update-icon"><i class="fa-solid fa-rotate"></i></span><div class="native-app-update-copy"><strong></strong><span></span></div><div class="native-app-update-actions"><button type="button" class="update-primary"></button><button type="button" class="update-later"></button></div>';
    banner.querySelector('.native-app-update-copy strong').textContent = translateUI('Доступно обновление приложения');
    const version = info.versionName || String(info.versionCode || '');
    banner.querySelector('.native-app-update-copy span').textContent = translateUI('Новая версия SBP Information готова к установке.') + (version ? ' ' + translateUI('Версия') + ': ' + version : '');
    const update = banner.querySelector('.update-primary');
    const later = banner.querySelector('.update-later');
    update.textContent = translateUI('Обновить');
    later.textContent = translateUI('Позже');
    update.addEventListener('click', () => {
        showToast(translateUI('Открываем страницу обновления'));
        openAndroidDownload(info.apkUrl || ANDROID_APK_URL);
    });
    later.addEventListener('click', () => banner.remove());
    document.body.appendChild(banner);
}
async function loadPublicAndroidVersion() {
    try {
        const url = new URL(APP_VERSION_URL, location.href);
        url.searchParams.set('_', Date.now().toString());
        const response = await fetch(url.href, { cache: 'no-store' });
        if (!response.ok) return;
        const info = await response.json();
        publicAndroidVersion = info;
        const versionEl = document.getElementById('menu-apk-version');
        if (versionEl) versionEl.textContent = translateUI('Актуальная версия') + ': ' + (info.versionName || info.versionCode || '—');
        window.updateInstallButton?.();
        if (isNativeAndroidShell() && Number(info.versionCode || 0) > getNativeVersionCode()) renderNativeAppUpdate(info);
    } catch (error) {
        console.warn('android app version check', error);
    }
}
if (isNativeAndroidShell()) setTimeout(loadPublicAndroidVersion, 900);

function isStandaloneApp() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}
function isIOSDevice() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
window.updateInstallButton = function() {
    const button = document.getElementById('menu-install-button');
    const label = document.getElementById('menu-install-label');
    const hint = document.getElementById('menu-install-hint');
    const apkButton = document.getElementById('menu-apk-download-button');
    if (!button || !label || !hint) return;
    const nativeApp = isNativeAndroidShell();
    const installed = isStandaloneApp() || nativeApp;
    button.classList.toggle('is-installed', installed);
    button.disabled = installed;
    label.textContent = translateUI(installed ? 'Приложение установлено' : 'Установить веб-приложение');
    hint.textContent = translateUI(installed ? 'SBP Information уже работает как приложение' : 'Установить SBP Information');
    if (apkButton) {
        apkButton.hidden = nativeApp;
        apkButton.disabled = true;
        apkButton.setAttribute('aria-disabled', 'true');
    }
};
window.installSBPApp = async function() {
    if (isNativeAndroidShell() || isStandaloneApp()) {
        showToast(translateUI('Приложение уже установлено'));
        window.updateInstallButton();
        return;
    }
    if (!deferredInstallPrompt) {
        showToast(translateUI('Установка пока недоступна'));
        return;
    }
    const promptEvent = deferredInstallPrompt;
    deferredInstallPrompt = null;
    try {
        await promptEvent.prompt();
        await promptEvent.userChoice;
    } catch (_) {}
    window.updateInstallButton();
};
window.addEventListener('beforeinstallprompt', event => {
    deferredInstallPrompt = event;
    window.updateInstallButton();
});
window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    window.updateInstallButton();
    showToast(translateUI('Приложение установлено'));
});
window.matchMedia('(display-mode: standalone)').addEventListener?.('change', window.updateInstallButton);

window.openHelpNavigation=function(){
    window.closeAppMenu?.();
    document.getElementById('help-navigation-modal')?.classList.remove('hidden');
    document.body.classList.add('modal-open');
    applyKzTranslations();
};
window.closeHelpNavigation=function(){
    document.getElementById('help-navigation-modal')?.classList.add('hidden');
    document.body.classList.remove('modal-open');
};

window.openAppMenu=function(){
    window.refreshSupportNotifications?.();
    const x=document.getElementById('app-menu-drawer');
    x?.classList.remove('hidden');
    document.body.classList.add('modal-open');
    window.updateInstallButton();
};
window.closeAppMenu=function(){document.getElementById('app-menu-drawer')?.classList.add('hidden');document.body.classList.remove('modal-open');};
window.showJournalTab=function(tab){
    activeJournalTab=tab==='stats'?'stats':'editor';
    document.getElementById('journal-tab-editor')?.classList.toggle('active',activeJournalTab==='editor');
    document.getElementById('journal-tab-stats')?.classList.toggle('active',activeJournalTab==='stats');
    document.getElementById('journal-editor-main')?.classList.toggle('hidden',activeJournalTab==='stats');
    document.getElementById('attendance-analytics')?.classList.toggle('hidden',activeJournalTab!=='stats');
    if(activeJournalTab==='stats'){
        closeAttendanceStudentDetail();
        renderAttendanceAssessmentList();
    }
};

window.renderAttendanceAnalytics=function(){
 const summary=document.getElementById('analytics-summary'), select=document.getElementById('analytics-student-select'), hist=document.getElementById('analytics-history'), head=document.getElementById('analytics-student-head'); if(!summary||!select||!hist) return;
 let totals={present:0,late:0,sick:0,excused:0,unexcused:0,marked:0};
 Object.values(attendanceArchive||{}).forEach(day=>Object.values(day?.state||{}).forEach(s=>{if(totals[s]!==undefined){totals[s]++;totals.marked++;}}));
 const absent=totals.sick+totals.excused+totals.unexcused; const pct=totals.marked?Math.round(((totals.present+totals.late)/totals.marked)*100):0;
 summary.innerHTML=`<div class="metric-card primary"><strong>${pct}%</strong><span>Общая посещаемость</span></div><div class="metric-card"><strong>${totals.present}</strong><span>Присутствий</span></div><div class="metric-card"><strong>${absent}</strong><span>Пропусков</span></div><div class="metric-card"><strong>${totals.late}</strong><span>Опозданий</span></div>`;
 const selected=select.value&&students.includes(select.value)?select.value:students[0]; select.innerHTML=students.map(n=>`<option ${n===selected?'selected':''}>${n}</option>`).join('');
 const stats=getStudentAttendanceStats(selected); if(head)head.innerHTML=`<div><strong>${selected||'—'}</strong><span>Посещаемость ${stats.attendancePercent}% · отмечено дней ${stats.total}</span></div><div class="analytics-chips"><span class="ok">П ${stats.present}</span><span class="late">О ${stats.late}</span><span class="bad">Пропуски ${stats.absent}</span></div>`;
 const rows=[]; Object.keys(attendanceArchive||{}).sort().reverse().forEach(date=>{const d=attendanceArchive[date];const status=d?.state?.[selected];if(!status||status==='present')return;const note=d?.notes?.[selected]||'';rows.push(`<div class="history-row"><div class="history-date">${new Date(date+'T00:00:00').toLocaleDateString(interfaceLocale(),{day:'2-digit',month:'long',year:'numeric'})}</div><div class="history-status ${status}">${getStatusName(status)}</div>${note?`<div class="history-note">${note}</div>`:''}</div>`);}); hist.innerHTML=rows.length?rows.join(''):'<div class="empty-state">Пропусков и опозданий пока нет.</div>';
};

window.openAttendanceNote=function(name){editingAttendanceNoteStudent=name;const m=document.getElementById('attendance-note-modal');document.getElementById('attendance-note-title').textContent=name;const status=attendanceState[name]||'';const presets=status==='late'?['Опоздал на 5 минут','Опоздал на 10 минут','Опоздал на 15 минут','Опоздал на 20 минут']:status==='sick'?['Больничный','По справке','На лечении']:status==='excused'?['По справке','Семейные обстоятельства','Разрешение куратора']:status==='unexcused'?['Причина не указана','Без уважительной причины']:['Без примечания'];document.getElementById('attendance-note-presets').innerHTML=presets.map(t=>`<button onclick="useAttendanceNotePreset('${t}')">${t}</button>`).join('');document.getElementById('attendance-note-text').value=attendanceNotes[name]||'';m?.classList.remove('hidden');};
window.closeAttendanceNote=function(){document.getElementById('attendance-note-modal')?.classList.add('hidden');editingAttendanceNoteStudent='';};
window.useAttendanceNotePreset=function(t){document.getElementById('attendance-note-text').value=t;};
window.saveAttendanceNote=async function(){if(!editingAttendanceNoteStudent)return;attendanceNotes[editingAttendanceNoteStudent]=document.getElementById('attendance-note-text').value.trim();window.__journalDirty=true;await saveCurrentDateState();closeAttendanceNote();renderApp();};

function parseMinutes(text){const m=String(text||'').match(/(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})/);return m?{start:+m[1]*60+(+m[2]),end:+m[3]*60+(+m[4])}:null;}
function homeMinutesLabel(total){const value=Math.max(0,Math.ceil(total));return value===1?'1 мин':`${value} мин`;}
function homeDurationLabel(seconds){
    const safe=Math.max(0,Math.floor(Number(seconds)||0));
    const mins=Math.floor(safe/60);
    const secs=safe%60;
    return `${mins} мин ${String(secs).padStart(2,'0')} сек`;
}
function homeLiveMetrics(timeText, now=new Date()){
    const range=parseMinutes(timeText);
    if(!range || range.end<=range.start) return null;
    const startSec=range.start*60;
    const endSec=range.end*60;
    const nowSec=now.getHours()*3600+now.getMinutes()*60+now.getSeconds();
    const durationSec=endSec-startSec;
    const elapsedSec=Math.max(0,Math.min(durationSec,nowSec-startSec));
    const remainingSec=Math.max(0,endSec-nowSec);
    const current=nowSec>=startSec&&nowSec<endSec;
    const progress=current?Math.max(.1,Math.min(100,(elapsedSec/durationSec)*100)):0;
    return {startSec,endSec,nowSec,durationSec,elapsedSec,remainingSec,current,progress};
}
function renderHomeReferenceDate(displayDate=new Date(),isNearestStudyDay=false){
    const dateEl=document.getElementById('home-reference-date');
    const weekdayEl=document.getElementById('home-reference-weekday');
    const titleEl=document.getElementById('home-reference-title');
    if(!dateEl||!weekdayEl)return;
    const locale=currentLang()==='kz'?'kk-KZ':'ru-RU';
    dateEl.textContent=displayDate.toLocaleDateString(locale,{day:'numeric',month:'long',year:'numeric'});
    const weekday=displayDate.toLocaleDateString(locale,{weekday:'long'});
    weekdayEl.textContent=weekday.charAt(0).toUpperCase()+weekday.slice(1);
    if(titleEl) titleEl.textContent=isNearestStudyDay?'Ближайший учебный день':'Сегодня';
}

function getHomeStudyDate(now=new Date()){
    const target=new Date(now);
    target.setHours(0,0,0,0);
    if(target.getDay()===6) target.setDate(target.getDate()+2);
    else if(target.getDay()===0) target.setDate(target.getDate()+1);
    return target;
}
function homeBreakInfo(current,next){
    const a=parseMinutes(current?.time),b=parseMinutes(next?.time);
    if(!a||!b||b.start<=a.end)return null;
    return {start:a.end,end:b.start,duration:b.start-a.end};
}
function renderHomeLessonCard(entry,nowMinutes){
    const {it,index,r}=entry;
    const floor=getFloorFromRoom(it.room);
    const cancelled=!!it.cancelled||it.changeType==='cancel';
    const live=nowMinutes>=0&&!cancelled?homeLiveMetrics(it.time):null;
    const current=!!live?.current;
    const originalSubject=String(it.originalSubject||it.subject||'Занятие');
    const replacement=!cancelled&&['subject','replace'].includes(it.changeType)&&originalSubject!==it.subject;
    const changeMain=cancelled
        ? `<div class="home-change-route cancelled"><span>${translateUI('Пары не будет')}</span><s>${originalSubject}</s></div><span>${it.time||''}</span>`
        : replacement
            ? `<div class="home-change-route"><small>${translateUI('Было')}</small><s>${originalSubject}</s><span>${translateUI('Замена')}</span></div><small class="home-now-label">${translateUI('Теперь')}</small><strong>${it.subject||'Занятие'}</strong><span>${it.time||''}</span>`
            : `<strong>${it.subject||'Занятие'}</strong><span>${it.time||''}</span>`;
    const meta=cancelled
        ? `<div class="home-cancel-meta"><i class="fa-solid fa-ban"></i><span>${translateUI('Кабинет неактуален')}</span></div>`
        : `<div class="home-ref-lesson-meta ${replacement?'changed-meta':''}">
            <div><span>${translateUI(replacement?'Новый кабинет':'Кабинет')}</span><strong>${it.room||'—'}</strong></div>
            <div><span>${translateUI(replacement?'Новый этаж':'Этаж')}</span><strong>${floor||'—'}</strong></div>
        </div>`;
    const progressHtml=current&&live?`<div class="home-ref-progress-row" data-start-sec="${live.startSec}" data-end-sec="${live.endSec}">
            <div class="home-ref-progress-top">
                <span class="home-ref-progress-time"><i class="fa-regular fa-clock"></i>${it.time||''}</span>
                <span class="home-ref-live-badge"><i></i>${translateUI('Идёт сейчас')}</span>
                <strong class="home-ref-progress-remaining">${translateUI('Осталось')} <b data-live-remaining>${homeDurationLabel(live.remainingSec)}</b></strong>
            </div>
            <div class="home-ref-progress-line">
                <div class="home-ref-progress"><i data-live-progress style="width:${live.progress}%"></i></div>
                <strong class="home-ref-progress-percent" data-live-percent>${Math.round(live.progress)}%</strong>
            </div>
            <div class="home-ref-progress-bottom">
                <span><span>${translateUI('Прошло')}:</span> <b data-live-elapsed>${homeDurationLabel(live.elapsedSec)}</b> ${translateUI('из')} <b data-live-total>${homeDurationLabel(live.durationSec)}</b></span>
            </div>
        </div>`:''; 
    return `<article class="home-ref-lesson-card ${current?'current':''} ${cancelled?'cancelled':''} ${replacement?'replacement':''}" ${current&&live?`data-live-lesson="1" data-start-sec="${live.startSec}" data-end-sec="${live.endSec}"`:''}>
        <div class="home-ref-lesson-row">
            <div class="home-ref-lesson-number">${index+1}</div>
            <div class="home-ref-lesson-main">${changeMain}</div>
            ${meta}
        </div>
        ${progressHtml}
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
    const studyDate=getHomeStudyDate(now);
    const isNearestStudyDay=studyDate.toDateString()!==new Date(now.getFullYear(),now.getMonth(),now.getDate()).toDateString();
    renderHomeReferenceDate(studyDate,isNearestStudyDay);

    const dayKey=getScheduleDayKey(studyDate);
    if(!dayKey){box.innerHTML='<div class="home-ref-empty">Учебных занятий нет.</div>';return;}

    const type=getWeekTypeForDate(studyDate);
    const source=getScheduleDataForWeek(type);
    const raw=(source[dayKey]||[]).filter(x=>!x.isClassHour);
    if(!raw.length){box.innerHTML='<div class="home-ref-empty">На ближайший учебный день занятий нет.</div>';return;}

    const entries=raw.map((it,index)=>({it,index,r:parseMinutes(it.time)})).filter(x=>x.r);
    if(!entries.length){box.innerHTML='<div class="home-ref-empty">Расписание ещё не заполнено.</div>';return;}

    // На выходных показываем понедельник с начала дня, без ложного статуса "идёт".
    if(isNearestStudyDay){
        let html='';
        const selected=entries.slice(0,3);
        selected.forEach((entry,pos)=>{
            html+=renderHomeLessonCard(entry,-1);
            if(pos<selected.length-1){
                const next=selected[pos+1];
                const bi=homeBreakInfo(entry.it,next.it);
                if(bi)html+=renderHomeBreakCard(bi,false,0);
            }
        });
        box.innerHTML=html;
        applyKzTranslations(box);
        return;
    }

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
function updateHomeLiveProgress(){
    if(document.visibilityState!=='visible') return;
    const homeView=document.getElementById('view-home');
    if(!homeView||homeView.classList.contains('hidden')) return;
    const card=homeView.querySelector('[data-live-lesson="1"]');
    if(!card) return;
    const startSec=Number(card.dataset.startSec);
    const endSec=Number(card.dataset.endSec);
    if(!Number.isFinite(startSec)||!Number.isFinite(endSec)||endSec<=startSec) return;
    const now=new Date();
    const nowSec=now.getHours()*3600+now.getMinutes()*60+now.getSeconds();
    if(nowSec<startSec||nowSec>=endSec){
        renderHomeDayTimeline();
        return;
    }
    const durationSec=endSec-startSec;
    const elapsedSec=Math.max(0,Math.min(durationSec,nowSec-startSec));
    const remainingSec=Math.max(0,endSec-nowSec);
    const progress=Math.max(.1,Math.min(100,(elapsedSec/durationSec)*100));
    const bar=card.querySelector('[data-live-progress]');
    const percent=card.querySelector('[data-live-percent]');
    const remaining=card.querySelector('[data-live-remaining]');
    const elapsed=card.querySelector('[data-live-elapsed]');
    const total=card.querySelector('[data-live-total]');
    if(bar) bar.style.width=`${progress}%`;
    if(percent) percent.textContent=`${Math.round(progress)}%`;
    if(remaining) remaining.textContent=homeDurationLabel(remainingSec);
    if(elapsed) elapsed.textContent=homeDurationLabel(elapsedSec);
    if(total) total.textContent=homeDurationLabel(durationSec);
}
const homeLiveProgressTimer=setInterval(updateHomeLiveProgress,1000);
const homeTimelineTimer=setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    const homeView = document.getElementById('view-home');
    if (homeView && !homeView.classList.contains('hidden')) renderHomeDayTimeline();
},60000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){updateHomeLiveProgress();}});
setTimeout(()=>{renderHomeDayTimeline();updateHomeLiveProgress();},80);
function canPublishNotifications(){return currentAccessRole==='owner'||canPublishNotificationsPermission();}
const NOTIFICATIONS_READ_KEY='toe_notifications_read_v1';
function getReadNotificationIds(){try{return new Set(JSON.parse(localStorage.getItem(NOTIFICATIONS_READ_KEY)||'[]'));}catch(e){return new Set();}}
function saveReadNotificationIds(ids){try{localStorage.setItem(NOTIFICATIONS_READ_KEY,JSON.stringify([...ids].slice(-500)));}catch(e){}}
function notificationTimeLabel(value){if(!value)return '';const d=new Date(value);return Number.isNaN(d.getTime())?'':d.toLocaleString(interfaceLocale(),{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});}
function escapeNotificationText(value){return String(value??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));}
function notificationTitleForLocale(item){
    return currentLang()==='kz' && item?.titleKz ? item.titleKz : (item?.title || 'Объявление');
}
function notificationTextForLocale(item){
    return currentLang()==='kz' && item?.textKz ? item.textKz : (item?.text || '');
}
function updateNotificationBadge(){const badge=document.getElementById('notification-badge');if(!badge)return;const read=getReadNotificationIds();const unread=notificationsCache.filter(n=>!read.has(n.id)).length;badge.textContent=String(unread);badge.classList.toggle('hidden',unread===0);}
function renderHomeLatestNotification(){
    const box=document.getElementById('home-latest-notification');
    if(!box)return;
    const n=notificationsCache[0];
    if(!n){box.innerHTML='<div class="home-ref-notification-empty">Новых уведомлений пока нет.</div>';return;}
    const title=escapeNotificationText(notificationTitleForLocale(n));
    const body=escapeNotificationText(notificationTextForLocale(n));
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
function renderNotifications(){
    renderHomeLatestNotification();
    const box=document.getElementById('notifications-list');
    if(!box)return;
    const read=getReadNotificationIds();
    if(!notificationsCache.length){
        box.innerHTML='<div class="empty-state">Новых объявлений пока нет.</div>';
        return;
    }
    const canDelete=canPublishNotifications();
    box.innerHTML=notificationsCache.map(n=>{
        const unread=!read.has(n.id);
        const deleteButton=canDelete
            ? `<button class="notification-delete-button" type="button" data-notification-id="${encodeURIComponent(n.id)}" title="Удалить уведомление" aria-label="Удалить уведомление"><i class="fa-regular fa-trash-can"></i></button>`
            : '';
        return `<article class="notification-item ${unread?'unread':''}">
            <div class="notification-item-icon"><i class="fa-regular fa-bell"></i></div>
            <div class="notification-item-body">
                <div class="notification-item-head">
                    <strong>${escapeNotificationText(notificationTitleForLocale(n))}</strong>
                    <div class="notification-item-actions"><span>${notificationTimeLabel(n.createdAt)}</span>${deleteButton}</div>
                </div>
                <p>${escapeNotificationText(notificationTextForLocale(n))}</p>
                ${n.author?`<small>${escapeNotificationText(n.author)}</small>`:''}
            </div>
        </article>`;
    }).join('');
    if(canDelete){
        box.querySelectorAll('.notification-delete-button').forEach(button=>{
            button.addEventListener('click',()=>deleteNotification(decodeURIComponent(button.dataset.notificationId||''),button));
        });
    }
    applyKzTranslations(box);
}
function markNotificationsRead(){const read=getReadNotificationIds();notificationsCache.forEach(n=>read.add(n.id));saveReadNotificationIds(read);updateNotificationBadge();renderNotifications();}
const deletingNotifications=new Set();
async function deleteNotification(notificationId,button){
    const id=String(notificationId||'');
    if(!id||deletingNotifications.has(id))return;
    if(!canPublishNotifications()){showToast('Нет права удалять уведомления');return;}
    if(!db||!auth?.currentUser){showToast('Нет подключения к облаку');return;}
    const item=notificationsCache.find(n=>n.id===id);
    const label=item?.title||'это уведомление';
    if(!window.confirm(`Удалить «${label}»? Уведомление исчезнет у всех пользователей.`))return;
    deletingNotifications.add(id);
    if(button){button.disabled=true;button.classList.add('is-busy');}
    try{
        await deleteDoc(doc(db,...CLOUD_ROOT,'notifications',id));
        notificationsCache=notificationsCache.filter(n=>n.id!==id);
        const read=getReadNotificationIds();
        read.delete(id);
        saveReadNotificationIds(read);
        renderNotifications();
        updateNotificationBadge();
        showToast('Уведомление удалено');
    }catch(error){
        console.warn('delete notification',error);
        showToast(error.code==='permission-denied'?'Нет права удалять уведомления':'Не удалось удалить уведомление');
    }finally{
        deletingNotifications.delete(id);
        if(button?.isConnected){button.disabled=false;button.classList.remove('is-busy');}
    }
}
window.deleteNotification=deleteNotification;
const eventArrivals=createArrivalTracker();
function subscribeNotifications(){
    if(!db||!auth?.currentUser||notificationsUnsubscribe)return;
    const ref=collection(db,...CLOUD_ROOT,'notifications');
    notificationsUnsubscribe=onSnapshot(ref,snap=>{
        notificationsCache=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
        if(!snap.metadata?.fromCache){
            const arrivals=eventArrivals.update(notificationsCache.map(item=>({id:item.id,count:1,item})));
            arrivals.forEach(({item})=>{if(item.authorUid!==auth?.currentUser?.uid && (!item.author || item.author!==currentAccountLogin)){const scheduleChange=item.type==='schedule_change';notificationCenter.incoming({key:`event:${item.id}`,title:scheduleChange?notificationTitleForLocale(item):translateUI('Новое объявление'),body:scheduleChange?notificationTextForLocale(item):notificationTitleForLocale(item),kind:'events'});}});
        }
        renderNotifications();renderHomeLatestNotification();updateNotificationBadge();
    },e=>{console.warn('notifications realtime',e);notificationsUnsubscribe=null;});
}
window.openNotifications=function(){document.getElementById('notifications-modal')?.classList.remove('hidden');document.body.classList.add('modal-open');document.getElementById('notification-admin-composer')?.classList.toggle('hidden',!canPublishNotifications());renderNotifications();setTimeout(markNotificationsRead,250);};
window.closeNotifications=function(){document.getElementById('notifications-modal')?.classList.add('hidden');document.body.classList.remove('modal-open');};
let publishingNotification=false;
window.publishNotification=async function(){
    if(publishingNotification)return;
    if(!canPublishNotifications()){showToast('Нет права публиковать уведомления');return;}
    if(!db||!auth?.currentUser){showToast('Нет подключения к облаку');return;}
    const titleField=document.getElementById('notification-title'),textField=document.getElementById('notification-text');
    const title=titleField?.value.trim()||'',text=textField?.value.trim()||'';
    if(!title&&!text){showToast('Введите заголовок или текст');return;}
    const button=document.getElementById('notification-publish-button');publishingNotification=true;if(button)button.disabled=true;
    const id=`n_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
    try{
        await setDoc(doc(db,...CLOUD_ROOT,'notifications',id),{title:title||'Объявление',text,createdAt:new Date().toISOString(),author:currentAccountLogin||'Владелец',authorUid:auth.currentUser.uid,type:'announcement'});
        if(titleField?.value.trim()===title)titleField.value='';if(textField?.value.trim()===text)textField.value='';
        showToast('Уведомление опубликовано');
    }catch(error){console.warn('publish notification',error);showToast(error.code==='permission-denied'?'Нет права публиковать уведомления':'Не удалось опубликовать уведомление');}
    finally{publishingNotification=false;if(button)button.disabled=false;}
};
let activeSupportThreadId='';
let sendingSupportMessage=false;
const supportDrafts=new Map();
function isSupportStaff(){return currentAccessRole==='owner'||(currentAccessRole==='admin'&&canUseSupportStaff());}
function ownSupportThreadId(){return auth?.currentUser?.uid || visitorSupportId;}
function updateSupportRecipient(){
    const staff=isSupportStaff(),thread=supportThreadsCache.find(item=>item.id===activeSupportThreadId);
    const recipient=document.getElementById('support-active-thread');
    if(recipient){recipient.classList.toggle('hidden',!staff);recipient.textContent=staff?(thread?`${translateUI('Получатель')}: ${thread.displayName||translateUI('Пользователь')}`:translateUI('Выберите обращение')):'';}
    const button=document.getElementById('support-send-button');if(button)button.disabled=sendingSupportMessage||(staff&&!activeSupportThreadId);
}
let supportNotificationsUnsubscribe=null;
let supportNotificationsContext='';
let supportThreadsCache=[];
let supportReadCounts={};
const supportArrivals=createArrivalTracker();
let displayedSupportMessages=[];
let supportRetryAfter=0;
function supportContext(){return auth?.currentUser?.uid ? `${auth.currentUser.uid}:${isSupportStaff()?'staff':'visitor'}` : '';}
function supportReadKey(){return `toe_support_read_v1:${supportNotificationsContext}`;}
function isSupportOpen(){const modal=document.getElementById('support-modal');return !!modal&&!modal.classList.contains('hidden')&&document.visibilityState==='visible';}
function threadUnread(thread){return unreadSupportCount(thread.messages,isSupportStaff(),supportReadCounts[thread.id]);}
function updateSupportBadge(){
    const badge=document.getElementById('support-menu-badge');if(!badge)return;
    const unread=supportNotificationsContext===supportContext()?supportThreadsCache.reduce((total,thread)=>total+threadUnread(thread),0):0;
    badge.textContent=unread>99?'99+':String(unread);
    badge.classList.toggle('hidden',unread===0);
    document.querySelectorAll('.support-menu-dot').forEach(dot=>dot.classList.toggle('hidden',unread===0));
    const dialogBadge=document.getElementById('support-dialog-badge');
    if(dialogBadge){const count=threadUnread(supportThreadsCache.find(thread=>thread.id===activeSupportThreadId)||{});dialogBadge.textContent=count>99?'99+':String(count);dialogBadge.classList.toggle('hidden',count===0);}
}
function markSupportThreadRead(id,messages){
    if(!isSupportOpen()||id!==activeSupportThreadId||supportNotificationsContext!==supportContext())return;
    supportReadCounts[id]=incomingSupportCount(messages,isSupportStaff());
    try{localStorage.setItem(supportReadKey(),JSON.stringify(supportReadCounts));}catch(_){}
    updateSupportBadge();
    if(isSupportStaff())renderSupportInbox();
}
function renderSupportInbox(){
    const inbox=document.getElementById('support-staff-inbox');if(!inbox||!isSupportStaff())return;
    inbox.innerHTML=supportThreadsCache.length?'<div class="support-inbox-title">Обращения</div>'+supportThreadsCache.map(thread=>{
        const unread=threadUnread(thread),id=escapeNotificationText(thread.id);
        return `<button data-support-thread="${id}" class="support-thread-btn ${thread.id===activeSupportThreadId?'active':''}"><strong>${escapeNotificationText(thread.displayName||'Пользователь')}${unread?`<span class="support-unread-badge" data-i18n-skip>${unread>99?'99+':unread}</span>`:''}</strong><span>${thread.updatedAt?new Date(thread.updatedAt).toLocaleString(interfaceLocale()):''}</span><p>${escapeNotificationText((thread.messages?.at(-1)?.text||'').slice(0,80))}</p><span class="support-reply-label">${translateUI('Ответить')}</span></button>`;
    }).join(''):'<div class="empty-state">Обращений пока нет.</div>';
    inbox.querySelectorAll('[data-support-thread]').forEach(button=>button.addEventListener('click',()=>window.openSupportThread(button.dataset.supportThread)));
    applyKzTranslations(inbox);
    updateSupportRecipient();
}
window.refreshSupportNotifications=function(){
    const context=supportContext();
    if(context!==supportNotificationsContext){
        supportNotificationsUnsubscribe?.();supportNotificationsUnsubscribe=null;
        supportUnsubscribe?.();supportUnsubscribe=null;activeSupportThreadId='';
        supportNotificationsContext=context;supportThreadsCache=[];supportReadCounts={};supportRetryAfter=0;supportDrafts.clear();supportArrivals.reset();displayedSupportMessages=[];
        const draft=document.getElementById('support-text');if(draft)draft.value='';
        try{const saved=JSON.parse(localStorage.getItem(supportReadKey())||'{}');if(saved&&typeof saved==='object'&&!Array.isArray(saved))supportReadCounts=saved;}catch(_){}
        const box=document.getElementById('support-messages');if(box)box.innerHTML='';
        document.getElementById('support-active-thread')?.classList.add('hidden');
        updateSupportBadge();
        if(isSupportOpen())window.openSupport();
    }
    if(!db||!context||supportNotificationsUnsubscribe||Date.now()<supportRetryAfter)return;
    const staff=isSupportStaff();
    const ref=staff?collection(db,...CLOUD_ROOT,'support'):doc(db,...CLOUD_ROOT,'support',ownSupportThreadId());
    supportNotificationsUnsubscribe=onSnapshot(ref,snapshot=>{
        if(context!==supportContext()||context!==supportNotificationsContext)return;
        supportThreadsCache=(staff?snapshot.docs.map(item=>({id:item.id,...item.data()})):(snapshot.exists()?[{id:snapshot.id,...snapshot.data()}]:[])).sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
        if(!snapshot.metadata?.fromCache){
            const arrivals=supportArrivals.update(supportThreadsCache.map(thread=>({id:thread.id,count:incomingSupportCount(thread.messages,staff),thread})));
            arrivals.forEach(({id,count})=>notificationCenter.incoming({key:`support:${id}:${staff?'visitor':'staff'}:${count}`,title:translateUI(staff?'Новое обращение в поддержку':'Новый ответ поддержки'),body:translateUI('Откройте поддержку, чтобы прочитать сообщение'),kind:'support',threadId:staff?id:''}));
        }
        updateSupportBadge();
        if(staff)renderSupportInbox();
    },error=>{
        if(context!==supportNotificationsContext)return;
        console.warn('support notifications',error);supportNotificationsUnsubscribe=null;supportThreadsCache=[];supportRetryAfter=Date.now()+10000;updateSupportBadge();
    });
};
window.openSupport=async function(){
    window.refreshSupportNotifications();
    document.getElementById('support-modal')?.classList.remove('hidden');document.body.classList.add('modal-open');
    const inbox=document.getElementById('support-staff-inbox'), name=document.getElementById('support-name');
    if(isSupportStaff()) { if(name) name.classList.add('hidden'); if(inbox) inbox.classList.remove('hidden'); await loadSupportInbox(); }
    else { if(name) name.classList.remove('hidden'); if(inbox) inbox.classList.add('hidden'); activeSupportThreadId=ownSupportThreadId(); subscribeSupportThread(activeSupportThreadId,true); }
    updateSupportRecipient();
};
window.closeSupport=function(){document.getElementById('support-modal')?.classList.add('hidden');document.body.classList.remove('modal-open');supportUnsubscribe?.();supportUnsubscribe=null;};
async function loadSupportInbox(){
    window.refreshSupportNotifications();renderSupportInbox();
    if(activeSupportThreadId&&!supportUnsubscribe)subscribeSupportThread(activeSupportThreadId);
}
window.openSupportThread=function(id){
    if(!isSupportStaff()||!supportThreadsCache.some(thread=>thread.id===id))return;
    const field=document.getElementById('support-text');
    if(activeSupportThreadId&&field)supportDrafts.set(activeSupportThreadId,field.value);
    activeSupportThreadId=id;if(field)field.value=supportDrafts.get(id)||'';
    const box=document.getElementById('support-messages');if(box)box.innerHTML='';
    updateSupportRecipient();subscribeSupportThread(id,true);loadSupportInbox();
};
function subscribeSupportThread(id,readOnOpen=false){
    if(!db||!auth?.currentUser||!id||(!isSupportStaff()&&id!==ownSupportThreadId()))return;
    if(supportUnsubscribe)supportUnsubscribe();const context=supportContext();
    supportUnsubscribe=onSnapshot(doc(db,...CLOUD_ROOT,'support',id),snap=>{
        if(context!==supportContext()||id!==activeSupportThreadId)return;
        const data=snap.exists()?snap.data():{};displayedSupportMessages=Array.isArray(data.messages)?data.messages:[];
        updateSupportRecipient();renderSupportMessages(displayedSupportMessages);
        // A new realtime reply must not disappear from the badge merely because
        // the conversation was left open. Reading follows opening or interaction.
        if(readOnOpen && !snap.metadata?.fromCache){markSupportThreadRead(id,displayedSupportMessages);readOnOpen=false;}
    },e=>console.warn('support',e));
}
function renderSupportMessages(msgs){const box=document.getElementById('support-messages');if(!box)return;box.innerHTML=msgs.length?msgs.map(m=>`<div class="support-msg ${m.role==='staff'?'staff':'visitor'}"><strong>${escapeNotificationText(m.author|| (m.role==='staff'?'Поддержка':'Пользователь'))}</strong><p>${escapeNotificationText(m.text||'')}</p><span>${m.at?new Date(m.at).toLocaleString(interfaceLocale()):''}</span></div>`).join(''):'<div class="empty-state">Диалог пока пуст. Напишите первое сообщение.</div>';box.scrollTop=box.scrollHeight;}
window.sendSupportMessage=async function(){
    if(sendingSupportMessage)return;
    const field=document.getElementById('support-text'),text=field?.value.trim()||'';if(!text)return;
    if(!db||!auth?.currentUser){showToast('Нет подключения к облаку');return;}
    const staff=isSupportStaff(),context=supportContext();const id=staff?activeSupportThreadId:ownSupportThreadId();if(!id){showToast('Выберите обращение');return;}
    const ref=doc(db,...CLOUD_ROOT,'support',id);
    sendingSupportMessage=true;updateSupportRecipient();
    try{
        const snap=await getDoc(ref);if(context!==supportContext()){showToast('Не удалось отправить сообщение');return;}
        if(staff&&!snap.exists()){showToast('Выберите обращение');return;}
        const data=snap.exists()?snap.data():{},messages=Array.isArray(data.messages)?[...data.messages]:[];
        const displayName=staff?(data.displayName||'Пользователь'):(document.getElementById('support-name')?.value.trim()||data.displayName||'Пользователь');
        messages.push({id:crypto.randomUUID(),senderUid:auth.currentUser.uid,text,author:staff?(currentAccountLogin||'Поддержка'):displayName,role:staff?'staff':'visitor',at:new Date().toISOString()});
        await setDoc(ref,{messages,updatedAt:new Date().toISOString(),displayName,ownerUid:staff?(data.ownerUid||id):auth.currentUser.uid},{merge:true});
        if(context===supportContext()){
            if(activeSupportThreadId===id&&field.value.trim()===text)field.value='';
            if(supportDrafts.get(id)?.trim()===text)supportDrafts.delete(id);
            showToast('Сообщение отправлено');if(staff)loadSupportInbox();
        }
    }catch(error){console.warn('send support',error);showToast('Не удалось отправить сообщение');}
    finally{sendingSupportMessage=false;updateSupportRecipient();}
};

const notificationCenter=createNotificationCenter({
    getCloud:()=>({auth,db}),translate:translateUI,toast:showToast,
    open:async data=>{if(data.kind==='support'){await window.openSupport();if(data.threadId&&isSupportStaff())window.openSupportThread(data.threadId);}else window.openNotifications();}
});
window.refreshNotificationSettings=()=>notificationCenter.render();
window.notificationAccountChanged=()=>notificationCenter.refreshAccount();
window.notificationAccountWillChange=()=>notificationCenter.detach();
let notificationIdentity='';
['support-messages','support-text'].forEach(id=>{
    const element=document.getElementById(id);
    ['pointerdown','keydown'].forEach(type=>element?.addEventListener(type,()=>markSupportThreadRead(activeSupportThreadId,displayedSupportMessages),{passive:true}));
});
const notificationDeepLink=new URL(location.href).searchParams;
let pendingNotificationLink=notificationDeepLink.get('notification');

// Realtime listeners are primary. This small maintenance pass only reconnects
// something that is missing; it does not poll Firestore on every tick.
function syncRealtimeModules(){
    if(db&&auth?.currentUser&&!notificationsUnsubscribe)subscribeNotifications();
    window.refreshSupportNotifications();
    const identity=auth?.currentUser?.uid||'';
    if(identity!==notificationIdentity){notificationIdentity=identity;notificationCenter.refreshAccount();}
    if(pendingNotificationLink&&identity&&(pendingNotificationLink!=='support'||!isSupportStaff()||supportThreadsCache.length)){
        const kind=pendingNotificationLink;pendingNotificationLink='';
        if(kind==='support'){window.openSupport().then(()=>{const thread=notificationDeepLink.get('thread');if(thread&&isSupportStaff())window.openSupportThread(thread);});}else if(kind==='events')window.openNotifications();
        const url=new URL(location.href);url.searchParams.delete('notification');url.searchParams.delete('thread');history.replaceState(null,'',url);
    }
}
const realtimeMaintenanceTimer=setInterval(()=>{if(document.visibilityState==='visible')syncRealtimeModules();},5000);
queueMicrotask(syncRealtimeModules);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){syncRealtimeModules();if(isSupportOpen()&&activeSupportThreadId)subscribeSupportThread(activeSupportThreadId);}});
window.addEventListener('storage',event=>{if(event.key===supportReadKey()){try{const saved=JSON.parse(event.newValue||'{}');supportReadCounts=saved&&typeof saved==='object'&&!Array.isArray(saved)?saved:{};}catch(_){supportReadCounts={};}updateSupportBadge();if(isSupportStaff())renderSupportInbox();}});
window.refreshSupportNotifications();
