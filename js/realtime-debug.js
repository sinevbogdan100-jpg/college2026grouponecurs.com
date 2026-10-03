(function(){
  const logEl=()=>document.getElementById('rtd-log');
  const state={events:[],listener:false,lastSnapshot:null,lastSource:'—',lastUpdatedAt:'—'};
  function t(){return new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit',second:'2-digit'});}
  function log(msg){state.events.push('['+t()+'] '+msg);if(state.events.length>80)state.events.shift();const e=logEl();if(e)e.textContent=state.events.join('\\n');}
  function set(id,text,cls){const e=document.getElementById(id);if(!e)return;e.textContent=text;e.className='rtd-value '+(cls||'');}
  function render(){
    set('rtd-firebase',window.__firebaseDebug?.init?'🟢 OK':'🔴 ошибка',window.__firebaseDebug?.init?'rtd-ok':'rtd-bad');
    set('rtd-auth',window.__firebaseDebug?.auth?'🟢 '+window.__firebaseDebug.auth:'🟡 проверяется',window.__firebaseDebug?.auth?'rtd-ok':'rtd-warn');
    const listenerOk = !!window.__attendanceListenerActive || !!window.__attendanceFallbackActive || state.listener;
    const listenerText = window.__attendanceFallbackActive && !window.__attendanceListenerActive ? '🟢 активен (резервная синхронизация)' : (listenerOk ? '🟢 активен' : '🔴 не активен');
    set('rtd-listener',listenerText,listenerOk?'rtd-ok':'rtd-bad');
    set('rtd-read',state.lastSnapshot?'🟢 '+state.lastSnapshot:'🟡 нет проверки',state.lastSnapshot?'rtd-ok':'rtd-warn');
    set('rtd-update',state.lastUpdatedAt||'—');
    set('rtd-doc',window.__realtimeDate?('attendance_records/'+window.__realtimeDate):'—');
    set('rtd-uid',window.__firebaseUid||'—');
    set('rtd-source',state.lastSource||'—');
  }
  window.__rtd={log,render,set,state};
  document.getElementById('realtime-debug-toggle').onclick=()=>document.getElementById('realtime-debug-panel').classList.toggle('open');
  document.getElementById('rtd-rebind').onclick=()=>{ try { if (typeof window.subscribeToAttendance==='function' && window.__realtimeDate) { window.subscribeToAttendance(window.__realtimeDate); log('Listener переподключён вручную'); render(); } else log('Нельзя переподключить: Firebase/Auth/дата ещё не готовы'); } catch(e){ log('REBINd ERROR: '+(e?.message||e)); render(); }};
  document.getElementById('rtd-copy').onclick=async()=>{try{await navigator.clipboard.writeText(state.events.join('\\n'));log('Лог скопирован');}catch(e){log('Не удалось скопировать лог');}};
  document.getElementById('rtd-check').onclick=()=>window.__realtimeManualCheck&&window.__realtimeManualCheck();
  log('Режим запущен');
  render();
  window.addEventListener('load',()=>{
    setTimeout(()=>{
      try {
        if (window.__attendanceListenerActive && window.__realtimeDate) {
          log('Listener уже активен: attendance_records/'+window.__realtimeDate);
        } else if (typeof window.subscribeToAttendance === 'function' && window.__realtimeDate && window.__firebaseUid) {
          window.subscribeToAttendance(window.__realtimeDate);
          log('Listener принудительно подключён после загрузки интерфейса');
        } else {
          log('Ожидание Firebase/Auth перед подключением listener…');
        }
        render();
      } catch(e) { log('Listener rebind ERROR: '+(e?.message||e)); render(); }
    },1200);
  });
})();
