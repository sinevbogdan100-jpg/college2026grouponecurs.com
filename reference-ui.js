(() => {
  'use strict';
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => [...r.querySelectorAll(s)];
  const safe = (fn) => { try { fn(); } catch (e) { console.warn('[reference-ui]', e); } };

  function topbar(viewId, title, subtitle='') {
    const view = document.getElementById(viewId);
    if (!view || view.querySelector(':scope > .ref-topbar')) return;
    const bar = document.createElement('div');
    bar.className = 'ref-topbar';
    bar.innerHTML = `
      <button class="ref-topbar-btn" onclick="openAppMenu()" aria-label="Меню"><i class="fa-solid fa-bars"></i></button>
      <div class="ref-topbar-copy"><strong>${title}</strong>${subtitle ? `<span>${subtitle}</span>` : ''}</div>
      <button class="ref-topbar-btn ref-bell" onclick="openNotifications()" aria-label="Уведомления"><i class="fa-regular fa-bell"></i><span class="ref-bell-dot"></span></button>
    `;
    view.prepend(bar);
  }

  function enhanceHome() {
    const root = document.querySelector('#view-home > .pt-3');
    const group = root?.querySelector(':scope > .bg-white:first-child');
    const hero = document.getElementById('home-today-card');
    if (!root || !group || !hero) return;
    group.classList.add('ref-home-heading');
    const grid = group.querySelector('.grid');
    if (grid && !grid.classList.contains('ref-home-info-grid')) {
      grid.classList.add('ref-home-info-grid');
      hero.insertAdjacentElement('afterend', grid);
      const iconMap = [
        ['fa-user-group','ref-blue'],
        ['fa-user-tie','ref-indigo'],
        ['fa-graduation-cap','ref-pink'],
        ['fa-user-shield','ref-violet']
      ];
      [...grid.children].forEach((card, i) => {
        card.classList.add('ref-info-card');
        if (!card.querySelector('.ref-info-icon')) {
          const icon = document.createElement('span');
          icon.className = `ref-info-icon ${iconMap[i]?.[1] || 'ref-blue'}`;
          icon.innerHTML = `<i class="fa-solid ${iconMap[i]?.[0] || 'fa-user'}"></i>`;
          card.prepend(icon);
        }
      });
    }
    hero.classList.add('ref-next-lesson-card');
    const timeline = document.querySelector('.home-timeline-card');
    if (timeline) timeline.classList.add('ref-home-schedule');
  }

  function addJournalUI() {
    const view = document.getElementById('view-tracker');
    if (!view) return;
    topbar('view-tracker','Журнал','Посещаемость студентов');

    const main = view.querySelector(':scope > main');
    if (main && !main.id) main.id = 'journal-editor-main';

    if (!document.getElementById('ref-journal-tabs')) {
      const tabs = document.createElement('div');
      tabs.id = 'ref-journal-tabs';
      tabs.className = 'ref-journal-tabs';
      tabs.innerHTML = `
        <button id="journal-tab-editor" class="active" onclick="showJournalTab('editor')"><i class="fa-regular fa-square-check"></i>Журнал</button>
        <button id="journal-tab-stats" onclick="showJournalTab('stats')"><i class="fa-solid fa-chart-column"></i>Посещаемость</button>
      `;
      const header = view.querySelector(':scope > header');
      header?.insertAdjacentElement('beforebegin', tabs);
    }

    if (!document.getElementById('attendance-analytics')) {
      const analytics = document.createElement('section');
      analytics.id = 'attendance-analytics';
      analytics.className = 'attendance-analytics hidden';
      analytics.innerHTML = `
        <div class="ref-analytics-card ref-score-card">
          <div class="ref-card-title"><div><strong>Оценка посещаемости</strong><span>Накопительная статистика</span></div><i class="fa-solid fa-chart-line"></i></div>
          <select id="analytics-student-select" onchange="renderAttendanceAnalytics()"></select>
          <div id="analytics-student-head" class="analytics-student-head"></div>
        </div>
        <div class="ref-analytics-card">
          <div class="ref-card-title"><div><strong>Общая статистика</strong><span>По сохранённым отметкам</span></div></div>
          <div id="analytics-summary" class="analytics-summary"></div>
        </div>
        <div class="ref-analytics-card ref-history-card">
          <div class="ref-card-title"><div><strong>Подробная статистика</strong><span>Даты, статусы и примечания</span></div></div>
          <div id="analytics-history" class="analytics-history"></div>
        </div>
        <div class="ref-analytics-card ref-quick-actions">
          <div class="ref-card-title"><div><strong>Быстрые действия</strong></div></div>
          <div class="ref-actions-grid">
            <button onclick="openReportPreview('full')"><i class="fa-regular fa-file-lines"></i>Отчёт за день</button>
            <button onclick="openReportPreview('absent')"><i class="fa-regular fa-clipboard"></i>Отсутствующие</button>
          </div>
        </div>
      `;
      const actions = document.getElementById('journal-report-actions');
      actions?.insertAdjacentElement('beforebegin', analytics);
    }
    setTimeout(() => { if (window.renderAttendanceAnalytics) window.renderAttendanceAnalytics(); }, 250);
  }

  function journalColumns() {
    const box = document.getElementById('students-container');
    if (!box || box.querySelector(':scope > .ref-journal-columns')) return;
    const row = document.createElement('div');
    row.className = 'ref-journal-columns';
    row.innerHTML = '<span>№ / ФИО</span><span>П</span><span>Б</span><span>У</span><span>Н</span><span>О</span><span>Примечание</span>';
    box.prepend(row);
  }

  function enhanceJournalRows() {
    journalColumns();
    $$('.journal-student-card').forEach(card => {
      card.classList.add('ref-journal-row');
      const head = card.querySelector('.journal-student-head');
      if (head) head.classList.add('ref-journal-person');
      const status = card.querySelector('.journal-status-badge');
      if (status) status.classList.add('ref-current-status');
    });
  }

  function addScheduleUI() {
    const view = document.getElementById('view-schedule');
    if (!view) return;
    topbar('view-schedule','Расписание');
    if (!document.getElementById('ref-schedule-status')) {
      const status = document.createElement('section');
      status.id = 'ref-schedule-status';
      status.className = 'ref-schedule-status';
      status.innerHTML = `
        <div class="ref-status-head">
          <div><i class="fa-regular fa-map"></i><strong>Сегодня</strong><span id="ref-status-date"></span></div>
          <b id="ref-status-label">Расписание</b>
        </div>
        <div class="ref-status-time" id="ref-status-time"></div>
        <div class="ref-status-progress"><i id="ref-status-progress"></i></div>
        <div class="ref-status-note" id="ref-status-note"></div>
      `;
      const days = document.getElementById('tab-mon')?.parentElement;
      days?.insertAdjacentElement('afterend', status);
    }
    decorateScheduleTabs();
    updateScheduleState();
  }

  function mondayOf(date) {
    const d = new Date(date.getFullYear(),date.getMonth(),date.getDate());
    const day = (d.getDay()+6)%7;
    d.setDate(d.getDate()-day);
    return d;
  }
  function pad(n){ return String(n).padStart(2,'0'); }
  function decorateScheduleTabs() {
    const mon = mondayOf(new Date());
    const ids = ['tab-mon','tab-tue','tab-wed','tab-thu','tab-fri'];
    ids.forEach((id,i) => {
      const b = document.getElementById(id); if (!b) return;
      const d = new Date(mon); d.setDate(mon.getDate()+i);
      const wd = ['Пн','Вт','Ср','Чт','Пт'][i];
      if (!b.querySelector('.ref-day-date')) b.innerHTML = `<strong>${wd}</strong><span class="ref-day-date">${pad(d.getDate())}.${pad(d.getMonth()+1)}</span>`;
    });
  }
  function parseRange(text) {
    const m = String(text||'').match(/(\d{1,2}):(\d{2})\s*[–—-]\s*(\d{1,2}):(\d{2})/);
    return m ? {s:+m[1]*60 + +m[2], e:+m[3]*60 + +m[4], label:m[0]} : null;
  }
  function updateScheduleState() {
    const cards = $$('#schedule-container .schedule-timeline-card');
    const breaks = $$('#schedule-container .schedule-break-row');
    cards.forEach((c,i) => {
      c.dataset.refNumber = String(i+1);
      c.classList.remove('ref-current','ref-past','ref-future');
    });
    breaks.forEach(b => b.classList.remove('ref-current','ref-past','ref-future'));
    const now = new Date(), mins=now.getHours()*60+now.getMinutes();
    let current=null, currentType='', next=null;
    cards.forEach((c,i) => {
      const r=parseRange(c.textContent);
      if (!r) return;
      const state=mins>=r.e?'ref-past':mins>=r.s?'ref-current':'ref-future';
      c.classList.add(state);
      if(state==='ref-current') current={el:c,r,index:i};
      if(!next && mins<r.s) next={el:c,r,index:i};
    });
    breaks.forEach((b,i) => {
      let r=parseRange(b.textContent);
      if(!r){
        const prev=cards[i] ? parseRange(cards[i].textContent) : null;
        const nxt=cards[i+1] ? parseRange(cards[i+1].textContent) : null;
        if(prev && nxt && nxt.s>prev.e) r={s:prev.e,e:nxt.s,label:`${String(Math.floor(prev.e/60)).padStart(2,'0')}:${String(prev.e%60).padStart(2,'0')} – ${String(Math.floor(nxt.s/60)).padStart(2,'0')}:${String(nxt.s%60).padStart(2,'0')}`};
      }
      if (!r) return;
      b.dataset.refRange=r.label;
      const state=mins>=r.e?'ref-past':mins>=r.s?'ref-current':'ref-future';
      b.classList.add(state);
      if(state==='ref-current'){current={el:b,r,index:-1};currentType='break';}
    });
    const date = document.getElementById('ref-status-date');
    if(date) date.textContent = now.toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long'});
    const label=$('#ref-status-label'), time=$('#ref-status-time'), bar=$('#ref-status-progress'), note=$('#ref-status-note');
    if(current){
      const dur=Math.max(1,current.r.e-current.r.s), p=Math.max(0,Math.min(100,(mins-current.r.s)/dur*100));
      if(bar) bar.style.width=p+'%';
      if(time) time.textContent=current.r.label;
      if(currentType==='break'){
        if(label){label.textContent='Перемена';label.dataset.type='break';}
        if(note) note.textContent=`До следующей пары: ${Math.max(0,current.r.e-mins)} мин`;
      }else{
        if(label){label.textContent=`${current.index+1} пара (идёт)`;label.dataset.type='lesson';}
        if(note) note.textContent=`До конца пары: ${Math.max(0,current.r.e-mins)} мин`;
      }
    }else if(next){
      if(bar) bar.style.width='0%';
      if(time) time.textContent=next.r.label;
      if(label){label.textContent='Следующая пара';label.dataset.type='next';}
      if(note) note.textContent=`До начала: ${Math.max(0,next.r.s-mins)} мин`;
    }else{
      if(bar) bar.style.width='100%';
      if(time) time.textContent='';
      if(label){label.textContent='Занятия завершены';label.dataset.type='done';}
      if(note) note.textContent='На сегодня всё';
    }
  }

  function enhanceRoster() {
    const view=document.getElementById('view-roster'); if(!view)return;
    topbar('view-roster','Группа');
    const oldHead=[...view.children].find(el=>el.tagName==='DIV' && !el.classList.contains('ref-topbar'));
    if(oldHead) oldHead.classList.add('ref-roster-head');
    if(!view.querySelector('.ref-roster-title')){
      const title=document.createElement('div');
      title.className='ref-roster-title';
      title.innerHTML='<div><i class="fa-solid fa-users"></i><span><strong>Состав группы</strong><small><span id="ref-roster-count">0</span> студентов</small></span></div>';
      const list=document.getElementById('roster-container');
      list?.insertAdjacentElement('beforebegin',title);
    }
    updateRosterSummary();
  }
  function updateRosterSummary(){
    const count=document.getElementById('roster-student-count')?.textContent?.trim()||'0';
    const dst=document.getElementById('ref-roster-count'); if(dst)dst.textContent=count;
    const hidden=document.getElementById('roster-group-name');
    const h=document.querySelector('.ref-roster-head h1');
    if(h && hidden){h.innerHTML=`<span class="ref-group-icon"><i class="fa-solid fa-users"></i></span><span><b>${hidden.textContent.trim()||'ТОЭ-26-9-1'}</b><small>${count} студентов</small></span>`;}
  }

  function enhanceNotifications(){
    const modal=document.getElementById('notifications-modal');
    if(!modal)return;
    modal.classList.add('ref-notifications');
    const h=modal.querySelector('.sheet-head h2'); if(h)h.textContent='Уведомления';
  }

  function syncBellBadge(){
    const src=document.getElementById('notification-badge');
    $$('.ref-bell-dot').forEach(d=>{
      const n=Number(src?.textContent||0);
      d.textContent=n>0?String(Math.min(n,9)):'';
      d.classList.toggle('show',n>0 && !src?.classList.contains('hidden'));
    });
  }

  function init(){
    document.body.classList.add('reference-design');
    safe(enhanceHome);
    safe(addJournalUI);
    safe(enhanceJournalRows);
    safe(addScheduleUI);
    safe(enhanceRoster);
    safe(enhanceNotifications);
    safe(syncBellBadge);
    const mo=new MutationObserver(() => {
      safe(enhanceJournalRows);
      safe(updateScheduleState);
      safe(updateRosterSummary);
      safe(syncBellBadge);
    });
    mo.observe(document.body,{childList:true,subtree:true,characterData:true});
    setInterval(()=>safe(updateScheduleState),30000);
    setTimeout(()=>{safe(updateScheduleState);safe(enhanceJournalRows);},700);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();