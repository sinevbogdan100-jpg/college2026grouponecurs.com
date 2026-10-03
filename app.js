import {
    createFirebaseServices,
    signInAnonymously,
    doc,
    setDoc,
    getDoc,
    collection,
    getDocs,
    onSnapshot,
    updateDoc,
    deleteDoc,
    deleteField
} from "./firebase.js?v=20261003-step8-root";

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
} from "./utils.js?v=20261003-step8-root";
import { dbPut, dbGet, dbDelete, savePersistentValue } from "./storage.js?v=20261003-step8-root";
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
} from "./schedule.js?v=20261003-step8-root";

        
window.__SITE_BUILD__ = 'step8-2026-10-03';
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
              diagRow('Firebase Anonymous Auth', firebaseDiag.auth?.ok ?? null, firebaseDiag.auth?.detail),
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
            try {
                // ВАЖНО: тестируем запись именно в РАЗРЕШЁННЫЙ правилами путь attendance_records.
                // Ранее диагностика ошибочно писала в /diagnostics/connection, которого нет в правилах,
                // поэтому она всегда показывала permission-denied даже при исправной записи журнала.
                const oldData = (await getDoc(ref)).data() || null;
                const marker = `firebase-diagnostic-${Date.now()}`;
                await setDoc(ref, { __firebaseDiagnostic: marker }, { merge: true });
                if (oldData) {
                    await updateDoc(ref, { __firebaseDiagnostic: deleteField() });
                } else {
                    await deleteDoc(ref);
                }
                firebaseDiag.write = {ok:true, detail:`Запись в разрешённый путь прошла и тестовый маркер удалён: toe_group/shared/attendance_records/${date}`};
                diagLog('Firestore WRITE OK', firebaseDiag.write.detail);
            } catch(e) {
                if (window.__rtd) { window.__rtd.log('WRITE ERROR: '+(e?.code||'')+' '+(e?.message||e)); window.__rtd.render(); }
                    firebaseDiag.write = {ok:false, detail:e?.code ? `${e.code}: ${e.message}` : String(e)};
                diagLog('Firestore WRITE ERROR', firebaseDiag.write.detail);
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
        const GROUP_INFO_DOC_ID = 'group_info_shared';
        const ROSTER_STATS_DOC_ID = 'roster_stats_shared';
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


        const students = [
            "Бондаренко Роман",
            "Ган Штефан",
            "Гудель Никита",
            "Елькина Маргарита",
            "Кайруллинов Нурсултан",
            "Кальнаус Михаил",
            "Қуанышбай Әлихан",
            "Маженов Адиль",
            "Масгутов Ансар",
            "Оразбеков Ернур",
            "Пулат Альбина",
            "Рахметов Кадырали",
            "Сарсенбинов Амир",
            "Синёв Богдан",
            "Сироткин Виктор",
            "Тлеулесов Ерсұлтан",
            "Толеубайулы Мухамед",
            "Турсуканов Диас",
            "Федосеенков Иван"
        ];

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
                    if (parsed.weekType) currentWeekType = parsed.weekType;
                } catch(e) {
                    attendanceState = {};
                }
            } else {
                attendanceState = {};
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

                // Авторизуем каждого посетителя анонимно. Это необходимо для правил
                // Firestore вида: allow read, write: if request.auth != null;
                try {
                    if (!auth.currentUser) {
                        diagLog('Запрашиваем анонимную авторизацию Firebase...');
                        await signInAnonymously(auth);
                    }
                    if (auth.currentUser) {
                        userId = auth.currentUser.uid;
                        window.__firebaseUid = auth.currentUser.uid;
                        window.__firebaseDebug.auth = auth.currentUser.uid;
                        firebaseDiag.auth = {ok:true, detail:`Anonymous Auth OK. UID: ${auth.currentUser.uid}`};
                        diagLog('Anonymous Auth OK', {uid: auth.currentUser.uid});
                        isCloudConnected = true;
                        updateCloudBadge(true);
                    } else {
                        throw new Error('Firebase не вернул currentUser после signInAnonymously');
                    }
                } catch (e) {
                    firebaseDiag.auth = {ok:false, detail:e?.code ? `${e.code}: ${e.message}` : String(e)};
                    firebaseDiag.error = firebaseDiag.auth.detail;
                    diagLog('ANONYMOUS AUTH ERROR', firebaseDiag.auth.detail);
                    console.error('Firebase anonymous auth error:', e);
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
                    subscribeToRosterStats();
                    subscribeToGroupInfo();
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
            updateHomeWeekBanner();
            updateHomeTodayCard();
            setInterval(updateHomeTodayCard, 60000);
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
                const marked = students.filter(name => state[name]).length;
                if (!marked) return null;
                return marked >= students.length ? 'complete' : 'partial';
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
            if (popup && wrap && !wrap.contains(e.target)) popup.classList.add('is-hidden');
        });

        let attendanceState = {};
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
                'group-student-count': info.studentCount,
                'group-student-count-card': info.studentCount,
                'tracker-curator': info.curator,
                'roster-student-count': info.studentCount
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

                    // Если облачных данных ещё нет — переносим текущие локальные настройки.
                    await persistGroupInfoToCloud(getGroupInfo());
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

        window.saveGroupInfo = async function() {
            const info = getGroupInfo();
            saveGroupInfoLocally(info);
            const cloudOk = await persistGroupInfoToCloud(info);
            showToast(cloudOk ? 'Данные группы сохранены в облаке' : 'Данные группы сохранены только на этом устройстве');
        };

        function makeGroupFieldEditable(el) {
            if (!el) return;
            el.contentEditable = sessionStorage.getItem('toe_admin') === '1' ? 'true' : 'false';
            el.setAttribute('spellcheck', 'false');
        }

        async function syncGroupFieldFromDisplay(el) {
            if (!el || sessionStorage.getItem('toe_admin') !== '1') return;
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

        // Администраторские настройки редактора
        window.openAdminSettings = function() {
            const modal = document.getElementById('admin-settings-modal');
            modal.classList.remove('hidden');
            modal.classList.add('flex');
            const isAdmin = sessionStorage.getItem('toe_admin') === '1';
            if (isAdmin) loadGroupInfoToAdminForm();
            document.getElementById('admin-login-box').classList.toggle('hidden', isAdmin);
            document.getElementById('admin-panel').classList.toggle('hidden', !isAdmin);
        };

        window.closeAdminSettings = function() {
            const modal = document.getElementById('admin-settings-modal');
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        };

        window.adminLogin = function() {
            const password = document.getElementById('admin-password').value;
            if (password === '1245') {
                sessionStorage.setItem('toe_admin', '1');
                document.getElementById('admin-login-box').classList.add('hidden');
                document.getElementById('admin-panel').classList.remove('hidden');
                document.getElementById('admin-password').value = '';
                updateAdminUI();
                showToast('Режим администратора включён');
            } else {
                showToast('Неверный пароль');
            }
        };

        function updateAdminUI() {
            const isAdmin = sessionStorage.getItem('toe_admin') === '1';
            document.body.classList.toggle('admin-mode', isAdmin);
            const hint = document.getElementById('journal-admin-hint');
            if (hint) hint.classList.toggle('hidden', isAdmin);
            setupInlineGroupEditing();
        }

        window.adminLogout = function() {
            sessionStorage.removeItem('toe_admin');
            updateAdminUI();
            closeAdminSettings();
            showToast('Вы вышли из редактора');
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
            if (sessionStorage.getItem('toe_admin') !== '1') { showToast('Только для администратора'); return; }
            try {
                await createAutomaticBackup();
                updateBackupStatus();
                showToast('Резервная копия создана');
            } catch (e) { showToast('Не удалось создать копию'); console.warn(e); }
        };

        window.restoreLatestBackup = async function() {
            if (sessionStorage.getItem('toe_admin') !== '1') { showToast('Только для администратора'); return; }
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
            container.innerHTML = '';
            students.forEach((name, index) => {
                const stats = getStudentAttendanceStats(name);
                const item = document.createElement('div');
                item.className = "bg-white p-3 rounded-xl border border-slate-200 shadow-xs";
                item.innerHTML = `
                    <div class="flex items-center justify-between gap-3">
                        <div class="flex items-center space-x-3 min-w-0">
                            <span class="w-6 h-6 shrink-0 rounded-lg bg-slate-100 text-slate-600 font-bold flex items-center justify-center text-[10px]">${index + 1}</span>
                            <div class="min-w-0">
                                <div class="font-bold text-slate-800 text-sm truncate">${name}</div>
                                <div class="text-[10px] text-slate-400 mt-0.5">Отмечено дней: ${stats.total}</div>
                            </div>
                        </div>
                        <div class="text-right shrink-0">
                            <div class="text-sm font-bold text-indigo-600">${stats.attendancePercent}%</div>
                            <div class="text-[9px] text-slate-400">посещаемость</div>
                        </div>
                    </div>
                    <div class="grid grid-cols-4 gap-1 mt-2.5 text-center">
                        <div class="rounded-lg bg-emerald-50 px-1 py-1.5"><div class="text-[10px] font-bold text-emerald-700">${stats.present}</div><div class="text-[8px] text-emerald-600">присут.</div></div>
                        <div class="rounded-lg bg-amber-50 px-1 py-1.5"><div class="text-[10px] font-bold text-amber-700">${stats.late}</div><div class="text-[8px] text-amber-600">опозд.</div></div>
                        <div class="rounded-lg bg-rose-50 px-1 py-1.5"><div class="text-[10px] font-bold text-rose-700">${stats.absent}</div><div class="text-[8px] text-rose-600">пропусков</div></div>
                        <div class="rounded-lg bg-slate-100 px-1 py-1.5"><div class="text-[10px] font-bold text-slate-700">${stats.sick}/${stats.excused}/${stats.unexcused}</div><div class="text-[8px] text-slate-500">бол./ув./неув.</div></div>
                    </div>
                `;
                container.appendChild(item);
            });
        }

        window.setAttendance = function(studentName, status) {
            const selectedDate = document.getElementById('date-picker')?.value;
            if (selectedDate && isWeekendDate(selectedDate)) {
                showToast('В субботу и воскресенье журнал недоступен');
                return;
            }
            if (sessionStorage.getItem('toe_admin') !== '1') {
                showToast('Изменение журнала доступно только администратору');
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
            if (sessionStorage.getItem('toe_admin') !== '1') {
                showToast('Изменение журнала доступно только администратору');
                return;
            }
            students.forEach(s => {
                attendanceState[s] = status;
            });
            window.__journalDirty = true;
            renderApp();
            saveCurrentDateState();
            showToast("Всем установлен статус: " + getStatusName(status));
        };

        function updateHomeTodayCard() {
            const dateEl = document.getElementById('home-today-date');
            const weekEl = document.getElementById('home-today-week');
            const lessonEl = document.getElementById('home-next-lesson');
            if (!dateEl || !weekEl || !lessonEl) return;

            const now = new Date();
            const day = now.getDay();
            const dayNames = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];
            const months = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
            dateEl.textContent = `${dayNames[day]}, ${now.getDate()} ${months[now.getMonth()]}`;

            let effectiveDay = day;
            if (day === 0) effectiveDay = 5;
            if (day === 6) effectiveDay = 5;
            const dayKeys = {1:'mon',2:'tue',3:'wed',4:'thu',5:'fri'};
            const dayKey = dayKeys[effectiveDay];
            const weekType = getWeekTypeForDate(now);
            weekEl.textContent = weekType === 'numerator' ? 'Числитель' : 'Знаменатель';

            const source = getScheduleDataForWeek(weekType);
            const lessons = (source[dayKey] || []).filter(item => !item.isClassHour);
            const nowMinutes = now.getHours() * 60 + now.getMinutes();
            let next = null;

            if (day >= 1 && day <= 5) {
                for (const item of lessons) {
                    const match = String(item.time || '').match(/(\d{1,2}):(\d{2})/);
                    if (!match) continue;
                    const startMinutes = Number(match[1]) * 60 + Number(match[2]);
                    if (startMinutes >= nowMinutes) { next = item; break; }
                }
            }

            if (next) {
                lessonEl.innerHTML = `<span class="text-indigo-600">${next.time}</span> · ${next.subject} · ${next.room}`;
            } else if (day === 0 || day === 6) {
                const first = lessons[0];
                lessonEl.innerHTML = first
                    ? `В выходной день занятий нет. В понедельник: <span class="text-indigo-600">${first.time}</span> · ${first.subject}`
                    : 'В выходной день занятий нет.';
            } else {
                lessonEl.textContent = 'На сегодня занятий больше нет.';
            }
        }

        function renderApp() {
            const container = document.getElementById('students-container');
            const searchVal = (document.getElementById('search-input').value || '').toLowerCase();
            container.innerHTML = '';

            let counts = { present: 0, late: 0, sick: 0, excused: 0, unexcused: 0 };

            students.forEach((name, index) => {
                if (searchVal && !name.toLowerCase().includes(searchVal)) return;

                const currentStatus = attendanceState[name] || 'present';
                if (counts[currentStatus] !== undefined) counts[currentStatus]++;

                const card = document.createElement('div');
                card.className = "bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex flex-col space-y-2.5";

                let buttonsHtml = `
                    <div class="grid grid-cols-5 gap-1">
                        <button onclick="setAttendance('${name}', 'present')" class="py-1.5 rounded-lg text-[10px] font-semibold transition ${currentStatus === 'present' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}" title="Присутствует">П</button>
                        <button onclick="setAttendance('${name}', 'late')" class="py-1.5 rounded-lg text-[10px] font-semibold transition ${currentStatus === 'late' ? 'bg-amber-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}" title="Опаздывает">О</button>
                        <button onclick="setAttendance('${name}', 'sick')" class="py-1.5 rounded-lg text-[10px] font-semibold transition ${currentStatus === 'sick' ? 'bg-teal-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}" title="Болеет">Б</button>
                        <button onclick="setAttendance('${name}', 'excused')" class="py-1.5 rounded-lg text-[10px] font-semibold transition ${currentStatus === 'excused' ? 'bg-indigo-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}" title="Уважительная причина">У</button>
                        <button onclick="setAttendance('${name}', 'unexcused')" class="py-1.5 rounded-lg text-[10px] font-semibold transition ${currentStatus === 'unexcused' ? 'bg-rose-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}" title="Неуважительная причина">Н</button>
                    </div>
                `;

                card.innerHTML = `
                    <div class="flex items-center justify-between">
                        <div class="flex items-center space-x-2.5">
                            <span class="w-5 h-5 rounded-md bg-slate-100 text-slate-600 font-bold flex items-center justify-center text-[10px]">${index + 1}</span>
                            <span class="font-bold text-sm text-slate-900">${name}</span>
                        </div>
                        <span class="text-[10px] font-medium px-2 py-0.5 rounded-md ${getStatusBadgeClass(currentStatus)}">${getStatusName(currentStatus)}</span>
                    </div>
                    ${buttonsHtml}
                `;
                container.appendChild(card);
            });

            document.getElementById('stat-present').innerText = counts.present;
            document.getElementById('stat-late').innerText = counts.late;
            document.getElementById('stat-sick').innerText = counts.sick;
            document.getElementById('stat-excused').innerText = counts.excused;
            document.getElementById('stat-unexcused').innerText = counts.unexcused;
        }

        async function saveCurrentDateState() {
            setSaveStatus('Сохранение…', true);
            const dateVal = document.getElementById('date-picker').value || getCurrentDateStr();
            const dataToSave = {
                state: { ...attendanceState },
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
            if (sessionStorage.getItem('toe_admin') !== '1') {
                openAdminSettings();
                showToast('Сначала войдите как администратор');
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
            students.forEach((name) => {
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
