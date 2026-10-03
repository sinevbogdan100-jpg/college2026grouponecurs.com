import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
        import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
                import { getFirestore, doc, setDoc, getDoc, collection, getDocs, onSnapshot, updateDoc, deleteDoc, deleteField } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

        const appId = 'sbpgroup-toe-26-9-1';
        const firebaseConfig = {
            apiKey: "AIzaSyDwFm2OB9BTKnGYmPG_siRsZoAh_cCMK2w",
            authDomain: "sbpgroup-toe-26-9-1.firebaseapp.com",
            projectId: "sbpgroup-toe-26-9-1",
            storageBucket: "sbpgroup-toe-26-9-1.firebasestorage.app",
            messagingSenderId: "984164177952",
            appId: "1:984164177952:web:c332ee08c78ce87b4b4445",
            measurementId: "G-V88BPGYH33"
        };

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
        let scheduleUnsubscribe = null;
        window.__attendanceListenerActive = false;
        window.__firebaseDebug = window.__firebaseDebug || {init:false, auth:null};
        window.__firebaseUid = '';
        window.__realtimeDate = '';


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

        function getWeekTypeForDate(dateObj) {
            const baselineMonday = new Date(2026, 8, 21); 
            const d = new Date(dateObj);
            let day = d.getDay();
            if (day === 0) day = 7;
            const diff = d.getDate() - day + 1;
            const targetMonday = new Date(new Date(dateObj).setDate(diff));
            targetMonday.setHours(0, 0, 0, 0);
            baselineMonday.setHours(0, 0, 0, 0);

            const diffTime = targetMonday.getTime() - baselineMonday.getTime();
            const diffWeeks = Math.round(diffTime / (7 * 24 * 60 * 60 * 1000));

            return (Math.abs(diffWeeks) % 2 === 0) ? 'denominator' : 'numerator';
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

        function getCurrentDateStr() {
            // Используем локальную дату устройства, чтобы после полуночи дата
            // менялась именно по местному времени, а не по UTC.
            return formatLocalDate(new Date());
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
            updateWeekRangeLabels();
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
        let schedulePollTimer = null;
        let scheduleReconnectTimer = null;
        let scheduleReconnectAttempt = 0;
        let lastScheduleAppliedUpdatedAt = '';
        let lastScheduleLocalWriteAt = '';
        window.__scheduleDebug = { lastSnapshotAt:'', lastUpdatedAt:'', lastSource:'', lastSaveOk:false };
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

        const DB_NAME = 'toe26_persistence';
        const DB_VERSION = 1;
        const DB_STORE = 'data';

        function openPersistenceDB() {
            return new Promise((resolve, reject) => {
                if (!('indexedDB' in window)) return reject(new Error('IndexedDB недоступна'));
                const request = indexedDB.open(DB_NAME, DB_VERSION);
                request.onupgradeneeded = () => {
                    const dbLocal = request.result;
                    if (!dbLocal.objectStoreNames.contains(DB_STORE)) dbLocal.createObjectStore(DB_STORE);
                };
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error || new Error('Ошибка IndexedDB'));
            });
        }

        async function dbPut(key, value) {
            const dbLocal = await openPersistenceDB();
            return new Promise((resolve, reject) => {
                const tx = dbLocal.transaction(DB_STORE, 'readwrite');
                tx.objectStore(DB_STORE).put(value, key);
                tx.oncomplete = () => { dbLocal.close(); resolve(true); };
                tx.onerror = () => { dbLocal.close(); reject(tx.error); };
            });
        }

        async function dbGet(key) {
            const dbLocal = await openPersistenceDB();
            return new Promise((resolve, reject) => {
                const tx = dbLocal.transaction(DB_STORE, 'readonly');
                const req = tx.objectStore(DB_STORE).get(key);
                req.onsuccess = () => { dbLocal.close(); resolve(req.result || null); };
                req.onerror = () => { dbLocal.close(); reject(req.error); };
            });
        }

        async function dbDelete(key) {
            const dbLocal = await openPersistenceDB();
            return new Promise((resolve, reject) => {
                const tx = dbLocal.transaction(DB_STORE, 'readwrite');
                tx.objectStore(DB_STORE).delete(key);
                tx.oncomplete = () => { dbLocal.close(); resolve(true); };
                tx.onerror = () => { dbLocal.close(); reject(tx.error); };
            });
        }

        async function savePersistentValue(key, value) {
            localStorage.setItem(key, value);
            try { await dbPut(key, value); } catch (e) { console.warn('Резервное сохранение не сработало', e); }
        }

        async function initFirebase() {
            // ВАЖНО: ошибка чтения/правил Firestore не должна отключать сам Firebase.
            // Иначе сайт ошибочно переключается в локальный режим даже при успешной инициализации SDK.
            try {
                app = initializeApp(firebaseConfig);
                auth = getAuth(app);
                db = getFirestore(app);
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
                    subscribeToSchedule();
                    startSchedulePolling();
                    diagLog('Облачные обработчики журнала и расписания запущены');
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

        function applyCloudScheduleData(data, source = 'cloud') {
            if (!data) return false;
            const remoteUpdatedAt = String(data.updatedAt || '');
            // Если это собственная более новая запись, не откатываем её старым snapshot/poll.
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
                if (typeof updateHomeNextLesson === 'function') updateHomeNextLesson();
                if (window.__scheduleDebug) {
                    window.__scheduleDebug.lastSource = source;
                    window.__scheduleDebug.lastUpdatedAt = remoteUpdatedAt;
                    window.__scheduleDebug.lastSnapshotAt = new Date().toISOString();
                }
            }
            return changed;
        }

        function subscribeToSchedule() {
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
                    // Собственное pending-изменение не применяем повторно.
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
                firebaseDiag.realtime = {ok:true, detail:'onSnapshot расписания подключён; включена резервная серверная проверка.'};
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

        function startSchedulePolling() {
            if (schedulePollTimer) clearInterval(schedulePollTimer);
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

        window.addEventListener('DOMContentLoaded', async () => {
            // Сначала сразу показываем интерфейс и список группы.
            // Загрузка Firebase/резервного хранилища не должна блокировать отображение учеников.
            // Дата журнала всегда синхронизирована с текущим днём.
            // Если страница остаётся открытой через полночь, автоматически
            // переключаем календарь на новый день и загружаем его записи.
            if (!window.__attendanceDateWatcher) {
                window.__attendanceDateWatcher = setInterval(async () => {
                    const picker = document.getElementById('date-picker');
                    if (!picker) return;
                    const today = getCurrentDateStr();
                    const effectiveToday = isWeekendDate(today) ? getLastWorkingDate(today) : today;
                    if (picker.value !== effectiveToday) {
                        picker.value = effectiveToday;
                        const label = document.getElementById('calendar-trigger-text');
                        if (label) label.textContent = formatCalendarLabel(new Date(effectiveToday + 'T00:00:00'));
                        updateSelectedDateUI(effectiveToday);
                        renderMiniCalendar();
                        await loadAttendanceForDate(effectiveToday);
                        if (isCloudConnected && db && auth?.currentUser) {
                            subscribeToAttendance(effectiveToday);
                        }
                    }
                }, 30000);
            }

            try {
                const rosterCount = document.getElementById('roster-student-count');
                if (rosterCount) rosterCount.textContent = students.length;
                renderRosterList();
                renderApp();
            } catch (e) {
                console.warn('Не удалось сразу отрисовать список группы', e);
            }

            // Облачное/резервное сохранение запускаем отдельно.
            try { await initFirebase(); } catch (e) { console.warn('Firebase init skipped', e); }
            try { await loadScheduleData(); } catch (e) { console.warn('Schedule load skipped', e); }
            const todayStr = getCurrentDateStr();
            const effectiveTodayStr = isWeekendDate(todayStr) ? getLastWorkingDate(todayStr) : todayStr;
            const datePicker = document.getElementById('date-picker');
            if (datePicker) {
                datePicker.value = effectiveTodayStr;
                const label = document.getElementById('calendar-trigger-text');
                if (label) label.textContent = formatCalendarLabel(new Date(effectiveTodayStr + 'T00:00:00'));
                updateSelectedDateUI(effectiveTodayStr);
            }
            try { await loadAttendanceForDate(effectiveTodayStr); } catch (e) { console.warn('Attendance load skipped', e); }
            if (isCloudConnected && db && auth?.currentUser) {
                subscribeToAttendance(effectiveTodayStr);
            }
            try {
                renderRosterList();
            } catch (e) {
                console.warn('Повторная отрисовка списка группы не удалась', e);
            }
            try {
                const savedDay = localStorage.getItem('toe_current_schedule_day');
                const savedWeek = localStorage.getItem('toe_schedule_week_type');
                const savedView = localStorage.getItem('toe_current_view');
                if (savedWeek === 'numerator' || savedWeek === 'denominator') currentScheduleWeekType = savedWeek;
                if (savedDay && ['mon','tue','wed','thu','fri'].includes(savedDay)) currentScheduleDay = savedDay;
                syncScheduleToToday();
                if (savedView && ['home','tracker','roster','schedule'].includes(savedView)) {
                    switchView(savedView, true);
                } else {
                    renderSchedule(currentScheduleDay);
                    restoreScrollPosition('home');
                }
            } catch(e) {
                renderSchedule(currentScheduleDay);
            }
            updateHomeWeekBanner();
            updateHomeTodayCard();
            setInterval(updateHomeTodayCard, 60000);
        });


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


        let miniCalendarMonth = new Date();

        const ruMonths = ['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];

        function formatLocalDate(date) {
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        }

        function isWeekendDate(dateOrString) {
            const date = typeof dateOrString === 'string'
                ? new Date(dateOrString + 'T00:00:00')
                : new Date(dateOrString);
            const day = date.getDay();
            return day === 0 || day === 6;
        }

        function getLastWorkingDate(dateOrString) {
            const date = typeof dateOrString === 'string'
                ? new Date(dateOrString + 'T00:00:00')
                : new Date(dateOrString);
            while (isWeekendDate(date)) date.setDate(date.getDate() - 1);
            return formatLocalDate(date);
        }

        function getNextWorkingDate(dateOrString) {
            const date = typeof dateOrString === 'string'
                ? new Date(dateOrString + 'T00:00:00')
                : new Date(dateOrString);
            while (isWeekendDate(date)) date.setDate(date.getDate() + 1);
            return formatLocalDate(date);
        }

        function formatCalendarLabel(date) {
            const months = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
            const today = new Date();
            const sameToday = formatLocalDate(date) === formatLocalDate(today);
            return sameToday ? 'Сегодня' : `${date.getDate()} ${months[date.getMonth()]}`;
        }

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

        document.addEventListener('click', function(e) {
            const wrap = document.getElementById('calendar-trigger')?.parentElement;
            const popup = document.getElementById('mini-calendar');
            if (popup && wrap && !wrap.contains(e.target)) popup.classList.add('is-hidden');
        });

        let attendanceState = {};
        let currentWeekType = 'denominator';
        let currentScheduleDay = 'mon';
        let currentScheduleWeekType = 'denominator';

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

        function syncScheduleToToday() {
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
            if (type === 'numerator') {
                btnNum.className = "w-full px-2 py-1 rounded-lg font-bold transition text-[10px] bg-indigo-600 text-white shadow-[0_0_12px_rgba(79,70,229,0.55)]";
                btnDen.className = "w-full px-2 py-1 rounded-lg font-bold transition text-[10px] text-slate-500 hover:text-slate-900";
            } else {
                btnNum.className = "w-full px-2 py-1 rounded-lg font-bold transition text-[10px] text-slate-500 hover:text-slate-900";
                btnDen.className = "w-full px-2 py-1 rounded-lg font-bold transition text-[10px] bg-indigo-600 text-white shadow-[0_0_12px_rgba(79,70,229,0.55)]";
            }
            renderSchedule(currentScheduleDay);
        };


        const DEFAULT_GROUP_INFO = { curator: 'Негманова Г.Б.', headman: 'Синёв Б.П.', deputy: '—', studentCount: 19 };

        function getGroupInfo() {
            try {
                const saved = JSON.parse(localStorage.getItem('toe_group_info') || '{}');
                return { ...DEFAULT_GROUP_INFO, ...saved };
            } catch (e) { return { ...DEFAULT_GROUP_INFO }; }
        }

        function renderGroupInfo() {
            const info = getGroupInfo();
            const ids = {
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

        window.saveGroupInfo = function() {
            const info = getGroupInfo();
            localStorage.setItem('toe_group_info', JSON.stringify(info));
            renderGroupInfo();
            showToast('Данные группы сохранены');
        };

        function makeGroupFieldEditable(el) {
            if (!el) return;
            el.contentEditable = sessionStorage.getItem('toe_admin') === '1' ? 'true' : 'false';
            el.setAttribute('spellcheck', 'false');
        }

        function syncGroupFieldFromDisplay(el) {
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
            localStorage.setItem('toe_group_info', JSON.stringify(info));
            renderGroupInfo();
            updateAdminUI();
            showToast('Данные группы сохранены');
        }

        function setupInlineGroupEditing() {
            document.querySelectorAll('.admin-inline-edit').forEach(el => {
                makeGroupFieldEditable(el);
                if (el.dataset.inlineBound === '1') return;
                el.dataset.inlineBound = '1';
                el.addEventListener('blur', () => syncGroupFieldFromDisplay(el));
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
                renderSchedule(currentScheduleDay);
            }
            restoreScrollPosition(viewName);
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

        function renderSchedule(dayKey) {
            const container = document.getElementById('schedule-container');
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

        let editingScheduleIndex = -1;
        function getCurrentScheduleList() { return (currentScheduleWeekType === 'numerator' ? scheduleDataNumerator : scheduleDataDenominator)[currentScheduleDay]; }
        window.openScheduleEditor = function(index) {
            if (sessionStorage.getItem('toe_admin') !== '1') { showToast('Редактирование расписания доступно только администратору'); return; }
            editingScheduleIndex = index;
            const item = index >= 0 ? getCurrentScheduleList()[index] : {time:'',breakDuration:'',subject:'',room:'',teacher:'',isClassHour:false};
            document.getElementById('schedule-editor-title').innerText = index >= 0 ? 'Редактирование пары' : 'Добавление пары';
            document.getElementById('edit-time').value = item.time || ''; document.getElementById('edit-break').value = item.breakDuration || ''; document.getElementById('edit-subject').value = item.subject || ''; document.getElementById('edit-room').value = item.room || ''; document.getElementById('edit-teacher').value = item.teacher || ''; document.getElementById('edit-class-hour').checked = !!item.isClassHour;
            document.getElementById('schedule-delete-btn').classList.toggle('hidden', index < 0);
            const modal=document.getElementById('schedule-editor-modal'); modal.classList.remove('hidden'); modal.classList.add('flex');
        };
        window.closeScheduleEditor = function() { const modal=document.getElementById('schedule-editor-modal'); modal.classList.add('hidden'); modal.classList.remove('flex'); };
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
                closeScheduleEditor(); renderSchedule(currentScheduleDay);
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
                closeScheduleEditor(); renderSchedule(currentScheduleDay);
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

        async function saveScheduleData(){
            saveScheduleHistorySnapshot();
            const num = JSON.stringify(scheduleDataNumerator);
            const den = JSON.stringify(scheduleDataDenominator);
            await savePersistentValue('toe_schedule_num', num);
            await savePersistentValue('toe_schedule_den', den);
            await savePersistentValue('toe_schedule_last_saved', new Date().toISOString());

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

                // Обязательно подтверждаем запись чтением с сервера. Это исключает ситуацию,
                // когда интерфейс сообщает об успехе, а облачная запись фактически не обновилась.
                const verify = await getDoc(ref, { source: 'server' });
                if (!verify.exists()) throw new Error('Firebase не подтвердил сохранение расписания');
                const verified = verify.data() || {};
                if (String(verified.updatedAt || '') !== updatedAt) {
                    throw new Error('Firebase вернул другую версию расписания');
                }
                lastScheduleAppliedUpdatedAt = updatedAt;
                firebaseDiag.write = {ok:true, detail:`Расписание сохранено и подтверждено сервером: ${updatedAt}`};
                diagLog('Firestore SCHEDULE WRITE VERIFIED', {updatedAt});
                window.__scheduleLastSaveOk = true;
                window.__scheduleLastSaveAt = updatedAt;
                if (window.__scheduleDebug) {
                    window.__scheduleDebug.lastUpdatedAt = updatedAt;
                    window.__scheduleDebug.lastSource = 'Firestore (подтверждено сервером)';
                }
            } catch (e) {
                window.__scheduleLastSaveOk = false;
                firebaseDiag.write = {ok:false, detail:e?.code ? `${e.code}: ${e.message}` : String(e)};
                diagLog('Firestore SCHEDULE WRITE ERROR', firebaseDiag.write.detail);
                console.error('Cloud schedule save failed:', e);
                throw e;
            }
            try { await createAutomaticBackup(); } catch (e) { console.warn('Автоматическая резервная копия расписания не создана', e); }
            updateBackupStatus();
            return true;
        }
        async function loadScheduleData(){
            try {
                let num = localStorage.getItem('toe_schedule_num');
                let den = localStorage.getItem('toe_schedule_den');
                if (!num) { num = await dbGet('toe_schedule_num'); if (num) localStorage.setItem('toe_schedule_num', num); }
                if (!den) { den = await dbGet('toe_schedule_den'); if (den) localStorage.setItem('toe_schedule_den', den); }
                const parsedNum = num ? JSON.parse(num) : null;
                const parsedDen = den ? JSON.parse(den) : null;
                if (parsedNum) Object.keys(scheduleDataNumerator).forEach(k => { if (Array.isArray(parsedNum[k])) scheduleDataNumerator[k] = parsedNum[k]; });
                if (parsedDen) Object.keys(scheduleDataDenominator).forEach(k => { if (Array.isArray(parsedDen[k])) scheduleDataDenominator[k] = parsedDen[k]; });
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
                renderSchedule(currentScheduleDay);
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

        function getStudentAttendanceStats(studentName) {
            const stats = { total: 0, present: 0, late: 0, sick: 0, excused: 0, unexcused: 0 };

            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (!key || !key.startsWith('toe_att_')) continue;
                try {
                    const saved = JSON.parse(localStorage.getItem(key));
                    const state = saved && saved.state ? saved.state : null;
                    if (!state || typeof state !== 'object' || !(studentName in state)) continue;
                    const status = state[studentName];
                    if (stats[status] !== undefined) {
                        stats[status]++;
                        stats.total++;
                    }
                } catch (e) {}
            }

            stats.absent = stats.sick + stats.excused + stats.unexcused;
            stats.attendancePercent = stats.total > 0 ? Math.round((stats.present / stats.total) * 100) : 0;
            return stats;
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

        function getStatusName(status) {
            switch(status) {
                case 'present': return 'Присутствует';
                case 'late': return 'Опаздывает';
                case 'sick': return 'Болеет';
                case 'excused': return 'Уважительная';
                case 'unexcused': return 'Неуважительная';
                default: return 'Не отмечено';
            }
        }

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

            const source = weekType === 'numerator' ? scheduleDataNumerator : scheduleDataDenominator;
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

        function getWeekRangeText() {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setHours(0,0,0,0);
  monday.setDate(now.getDate() + diffToMonday);
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  const months = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  return `${monday.getDate()} ${months[monday.getMonth()]} — ${friday.getDate()} ${months[friday.getMonth()]}`;
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

        function getStatusBadgeClass(status) {
            switch(status) {
                case 'present': return 'bg-emerald-50 text-emerald-700 border border-emerald-100';
                case 'late': return 'bg-amber-50 text-amber-700 border border-amber-100';
                case 'sick': return 'bg-teal-50 text-teal-700 border border-teal-100';
                case 'excused': return 'bg-indigo-50 text-indigo-700 border border-indigo-100';
                case 'unexcused': return 'bg-rose-50 text-rose-700 border border-rose-100';
                default: return 'bg-slate-50 text-slate-700 border border-slate-100';
            }
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
