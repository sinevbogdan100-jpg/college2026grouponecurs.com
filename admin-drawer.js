// Administrative tools use the existing authenticated role and permission checks.
const escape = text => String(text ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function adminDrawerLabels(language) {
    return language === 'kz' ? {
        title:'Әкімші панелі', owner:'Иесі', admin:'Әкімші', close:'Панельді жабу',
        trigger:'Әкімші панелін ашу', schedule:'Сабақ кестесі',
        journal:'Журнал', roster:'Топ құрамы', notifications:'Хабарландырулар', access:'Қол жеткізу және құқықтар',
        openJournal:'Журналды ашу', openRoster:'Топты ашу', openSchedule:'Кестені ашу', publish:'Хабарландыру жариялау',
        edit:'Өзгерту', up:'Жоғары жылжыту', down:'Төмен жылжыту', empty:'Таңдалған күнде сабақтар жоқ',
        pair:'сабақ', classHour:'Тәрбие сағаты', numerator:'Алым', denominator:'Бөлім',
        dateScope:'Тек таңдалған күнге', templateScope:'Тұрақты сабақ кестесі'
    } : {
        title:'Панель администратора', owner:'Владелец', admin:'Администратор', close:'Закрыть панель',
        trigger:'Открыть панель администратора', schedule:'Расписание',
        journal:'Журнал', roster:'Состав группы', notifications:'Уведомления', access:'Доступ и права',
        openJournal:'Открыть журнал', openRoster:'Открыть группу', openSchedule:'Открыть расписание', publish:'Опубликовать уведомление',
        edit:'Изменить', up:'Поднять выше', down:'Опустить ниже', empty:'На выбранный день занятий нет',
        pair:'пара', classHour:'Классный час', numerator:'Числитель', denominator:'Знаменатель',
        dateScope:'Только на выбранную дату', templateScope:'Постоянное расписание'
    };
}

export function hasAdministrativeRole(access = {}) {
    return access.role === 'owner' || access.role === 'admin';
}

export function initAdminDrawer({access, language, snapshot, formatDate, journalDate = () => '', translate = text => text, actions = {}, applyTranslations = () => {}}) {
    const root = document.createElement('div');
    root.id = 'sbp-admin-drawer';
    root.hidden = true;
    root.innerHTML = `<div class="sbp-admin-backdrop" data-drawer-close></div>
      <aside class="sbp-admin-sheet" role="dialog" aria-modal="true" aria-labelledby="sbp-admin-title" tabindex="-1">
        <header><div data-i18n-skip><h2 id="sbp-admin-title"></h2><span id="sbp-admin-role"></span></div><button type="button" class="sbp-admin-close" data-drawer-close data-i18n-skip>×</button></header>
        <div class="sbp-admin-content">
          <details class="sbp-admin-section" id="sbp-admin-schedule" data-permission="schedule"><summary data-admin-label="schedule" data-i18n-skip></summary><div class="sbp-admin-section-body"><p id="sbp-admin-schedule-context" data-i18n-skip></p><button type="button" data-admin-action="openSchedule" data-admin-label="openSchedule" data-i18n-skip></button><div id="sbp-admin-schedule-tools"></div><div id="sbp-admin-lessons" data-i18n-skip></div></div></details>
          <details class="sbp-admin-section" id="sbp-admin-journal" data-permission="journal"><summary data-admin-label="journal" data-i18n-skip></summary><div class="sbp-admin-section-body"><p id="sbp-admin-journal-context" data-i18n-skip></p><button type="button" data-admin-action="openJournal" data-admin-label="openJournal" data-i18n-skip></button><div id="sbp-admin-journal-tools"></div></div></details>
          <details class="sbp-admin-section" id="sbp-admin-roster" data-permission="students"><summary data-admin-label="roster" data-i18n-skip></summary><div class="sbp-admin-section-body"><button type="button" data-admin-action="openRoster" data-admin-label="openRoster" data-i18n-skip></button><div id="sbp-admin-roster-tools"></div></div></details>
          <div id="sbp-admin-group-tools" data-permission="groupInfo"></div>
          <details class="sbp-admin-section" data-permission="notifications"><summary data-admin-label="notifications" data-i18n-skip></summary><div class="sbp-admin-section-body"><button type="button" data-admin-action="publish" data-admin-label="publish" data-i18n-skip></button></div></details>
          <details class="sbp-admin-section" id="sbp-admin-access"><summary data-admin-label="access" data-i18n-skip></summary><div id="sbp-admin-access-tools" class="sbp-admin-section-body"></div></details>
          <div id="sbp-admin-backup-tools" data-permission="backups"></div>
        </div><footer id="sbp-admin-footer"></footer>
      </aside>`;
    document.body.appendChild(root);
    const sheet = root.querySelector('.sbp-admin-sheet');
    const closeButton = root.querySelector('.sbp-admin-close');
    const portals = [
        ['schedule-edit-scope-box', 'sbp-admin-schedule-tools'], ['schedule-pause-manage-btn', 'sbp-admin-schedule-tools'],
        ['schedule-add-btn', 'sbp-admin-schedule-tools'], ['schedule-bell-btn', 'sbp-admin-schedule-tools'],
        ['journal-edit-tools', 'sbp-admin-journal-tools'], ['roster-admin-tools', 'sbp-admin-roster-tools'],
        ['settings-group-section', 'sbp-admin-group-tools'], ['admin-panel', 'sbp-admin-access-tools'],
        ['settings-backups-section', 'sbp-admin-backup-tools'], ['settings-logout', 'sbp-admin-footer']
    ];
    const anchors = new Map();
    let trigger = null, menuButton = null, previousFocus = null, lessonSignature = '';
    const allowed = permission => {
        const state = access();
        return hasAdministrativeRole(state) && (!permission || state[permission] === true);
    };
    function close(returnFocus = true) {
        const wasOpen = !root.hidden;
        root.hidden = true;
        document.body.classList.remove('sbp-admin-drawer-open');
        trigger?.setAttribute('aria-expanded', 'false');
        if (wasOpen && returnFocus) {
            const target = previousFocus?.isConnected && previousFocus.getClientRects().length ? previousFocus : trigger;
            target?.focus({preventScroll:true});
        }
    }
    function relocate(editor) {
        portals.forEach(([id, host]) => {
            const node = document.getElementById(id);
            if (!node) return;
            if (editor) {
                if (!anchors.has(id)) {
                    const marker = document.createComment(`admin-tools:${id}`);
                    node.before(marker);
                    anchors.set(id, marker);
                }
                const parent = document.getElementById(host);
                if (node.parentNode !== parent) parent.appendChild(node);
            } else {
                const marker = anchors.get(id);
                if (marker?.parentNode) { marker.after(node); marker.remove(); }
                anchors.delete(id);
            }
        });
        document.getElementById('settings-admins-section')?.classList.toggle('hidden', editor);
    }
    function refreshLessons() {
        const host = document.getElementById('sbp-admin-lessons');
        const state = snapshot();
        const labels = adminDrawerLabels(language());
        const signature = JSON.stringify([language(), state, allowed('schedule')]);
        if (signature === lessonSignature) return;
        lessonSignature = signature;
        const context = document.getElementById('sbp-admin-schedule-context');
        context.textContent = `${formatDate(state.date)} · ${labels[state.weekType] || ''} · ${state.scope === 'template' ? labels.templateScope : labels.dateScope}`;
        if (!allowed('schedule')) { host.replaceChildren(); return; }
        let pair = 0;
        host.innerHTML = state.lessons.length ? state.lessons.map((item, index) => {
            const number = item.isClassHour ? labels.classHour : `${++pair}${language() === 'kz' ? '-' : '-я '}${labels.pair}`;
            return `<div class="sbp-admin-lesson"><div><small>${escape(number)} · ${escape(item.time || '—')}</small><strong>${escape(translate(item.subject || 'Занятие'))}</strong></div><div class="sbp-admin-lesson-actions"><button type="button" data-lesson-action="up" data-index="${index}" aria-label="${labels.up}" title="${labels.up}" ${index === 0 ? 'disabled' : ''}>↑</button><button type="button" data-lesson-action="down" data-index="${index}" aria-label="${labels.down}" title="${labels.down}" ${index === state.lessons.length - 1 ? 'disabled' : ''}>↓</button><button type="button" data-lesson-action="edit" data-index="${index}">${labels.edit}</button></div></div>`;
        }).join('') : `<p>${labels.empty}</p>`;
    }
    function refresh() {
        const state = access();
        const editor = hasAdministrativeRole(state);
        relocate(editor);
        if (!editor) {
            close(false);
            trigger?.remove();
            trigger = null;
            menuButton?.remove();
            menuButton = null;
            root.querySelectorAll('[data-permission]').forEach(node => { node.hidden = true; });
            document.body.classList.remove('sbp-admin-tools-ported');
            return;
        }
        document.body.classList.add('sbp-admin-tools-ported');
        const labels = adminDrawerLabels(language());
        if (!trigger) {
            trigger = document.createElement('button');
            trigger.id = 'sbp-admin-edge';
            trigger.type = 'button';
            trigger.dataset.i18nSkip = '';
            trigger.setAttribute('aria-controls', root.id);
            trigger.setAttribute('aria-haspopup', 'dialog');
            trigger.setAttribute('aria-expanded', 'false');
            trigger.innerHTML = '<span aria-hidden="true"><i class="fa-solid fa-user-shield"></i></span>';
            trigger.addEventListener('click', event => {
                if (event.button > 0) return;
                open();
            });
            document.body.appendChild(trigger);
        }
        if (!menuButton) {
            const supportButton = document.getElementById('menu-support-button');
            if (supportButton?.parentElement) {
                menuButton = document.createElement('button');
                menuButton.id = 'menu-admin-drawer-button';
                menuButton.type = 'button';
                menuButton.dataset.i18nSkip = '';
                menuButton.setAttribute('aria-controls', root.id);
                menuButton.setAttribute('aria-haspopup', 'dialog');
                menuButton.innerHTML = '<i class="fa-solid fa-user-shield" aria-hidden="true"></i><span></span>';
                menuButton.addEventListener('click', () => open());
                supportButton.after(menuButton);
            }
        }
        trigger.setAttribute('aria-label', labels.trigger);
        trigger.setAttribute('title', labels.trigger);
        if (menuButton) menuButton.querySelector('span').textContent = labels.title;
        closeButton.setAttribute('aria-label', labels.close);
        document.getElementById('sbp-admin-title').textContent = labels.title;
        document.getElementById('sbp-admin-role').textContent = state.role === 'owner' ? labels.owner : labels.admin;
        root.querySelectorAll('[data-admin-label]').forEach(node => { node.textContent = labels[node.dataset.adminLabel]; });
        root.querySelectorAll('[data-permission]').forEach(node => { node.hidden = !allowed(node.dataset.permission); });
        const selectedJournalDate = journalDate();
        const journalContext = document.getElementById('sbp-admin-journal-context');
        journalContext.hidden = !selectedJournalDate;
        journalContext.textContent = selectedJournalDate ? formatDate(new Date(selectedJournalDate + 'T12:00:00')) : '';
        ['schedule-add-btn','schedule-bell-btn','schedule-edit-scope-box','schedule-pause-manage-btn'].forEach(id => document.getElementById(id)?.classList.toggle('hidden', !allowed('schedule')));
        refreshLessons();
        applyTranslations(root);
    }
    function open(section = '') {
        if (!allowed()) return false;
        actions.beforeOpen?.();
        refresh();
        previousFocus = document.activeElement;
        root.hidden = false;
        document.body.classList.add('sbp-admin-drawer-open');
        trigger.setAttribute('aria-expanded', 'true');
        const target = section === 'group' ? document.getElementById('settings-group-section') : document.getElementById(`sbp-admin-${section}`);
        if (target && !target.hidden && !target.closest('[hidden]')) { target.open = true; target.scrollIntoView?.({block:'nearest'}); }
        closeButton.focus({preventScroll:true});
        return true;
    }
    root.addEventListener('click', event => {
        const button = event.target.closest('button[onclick]');
        if (!button) return;
        const handler = button.getAttribute('onclick') || '';
        if (/openSchedule(?:Editor|BellEditor|PauseEditor)|openStudentProfileEditor/.test(handler)) {
            const permission = handler.includes('openStudentProfileEditor') ? 'students' : 'schedule';
            if (!allowed(permission)) { event.preventDefault(); event.stopImmediatePropagation(); return; }
            close(false);
        }
    }, true);
    root.addEventListener('click', event => {
        if (event.target.closest('[data-drawer-close]')) { close(); return; }
        const lesson = event.target.closest('[data-lesson-action]');
        if (lesson) {
            if (!allowed('schedule') || lesson.disabled) return;
            const index = Number(lesson.dataset.index);
            if (!Number.isInteger(index) || !snapshot().lessons[index]) return;
            if (lesson.dataset.lessonAction === 'edit') { close(false); actions.editLesson?.(index); }
            else actions.moveLesson?.(index, lesson.dataset.lessonAction === 'up' ? -1 : 1);
            return;
        }
        const button = event.target.closest('[data-admin-action]');
        if (!button) return;
        const permissions = {openSchedule:'schedule', openJournal:'journal', openRoster:'students', publish:'notifications'};
        const action = button.dataset.adminAction;
        if (!allowed(permissions[action]) || !actions[action]) return;
        close(false);
        actions[action]();
    });
    document.addEventListener('keydown', event => {
        if (root.hidden) return;
        if (event.key === 'Escape') { event.preventDefault(); close(); return; }
        if (event.key !== 'Tab') return;
        const nodes = [...sheet.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex="0"]')].filter(node => node.getClientRects().length && !node.closest('[hidden],.hidden'));
        const first = nodes[0] || closeButton, last = nodes.at(-1) || closeButton;
        if (event.shiftKey && (document.activeElement === first || !sheet.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !sheet.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    });
    window.refreshAdminDrawer = refresh;
    window.openAdminDrawer = open;
    window.closeAdminDrawer = close;
    refresh();
    return {refresh, open, close};
}
