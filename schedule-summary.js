// Read-only comparison of an actual date with its recurring schedule.
const fields = ['subject', 'time', 'room', 'teacher', 'breakDuration'];
const value = (item, field) => String(item?.[field] || '').trim();
const cancelled = item => !!item?.cancelled || item?.changeType === 'cancel';
export const escapeSummary = text => String(text ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export function nextCalendarDay(now = new Date()) {
    const date = new Date(now);
    date.setDate(date.getDate() + 1);
    date.setHours(0, 0, 0, 0);
    return date;
}

export function summarizeScheduleChanges(baseline = [], actual = []) {
    const remaining = new Set(baseline.map((_, index) => index));
    let pair = 0;
    const numbers = baseline.map(item => item.isClassHour ? null : ++pair);
    let actualPair = 0;
    const changes = [];
    actual.forEach((item, actualIndex) => {
        const number = item.isClassHour ? null : ++actualPair;
        const originalTime = value(item, 'originalTime') || value(item, 'time');
        const originalSubject = value(item, 'originalSubject') || value(item, 'subject');
        const candidates = [...remaining].filter(index => !!baseline[index].isClassHour === !!item.isClassHour);
        // Original time survives repeated edits, so removals do not shift the
        // comparison onto another pair. Subject is a fallback for untagged edits.
        let index = candidates.find(index => value(baseline[index], 'time') === originalTime && value(baseline[index], 'subject') === originalSubject);
        if (index === undefined) index = candidates.find(index => originalTime && value(baseline[index], 'time') === originalTime);
        if (index === undefined) index = candidates.find(index => originalSubject && value(baseline[index], 'subject') === originalSubject);
        if (index === undefined && actual.length === baseline.length && candidates.includes(actualIndex)) index = actualIndex;
        if (index === undefined) {
            changes.push({kind: cancelled(item) ? 'cancel' : 'added', number, next:item, previous:null, fields:[]});
            return;
        }
        remaining.delete(index);
        const previous = baseline[index];
        if (cancelled(item) && !cancelled(previous)) {
            changes.push({kind:'cancel', number:numbers[index], previous, next:item, fields:[]});
            return;
        }
        if (cancelled(item) && cancelled(previous)) return;
        const changedFields = fields.filter(field => value(previous, field) !== value(item, field));
        if (changedFields.length || cancelled(previous)) {
            changes.push({kind:cancelled(previous) ? 'restored' : 'changed', number, previous, next:item, fields:changedFields});
        }
    });
    remaining.forEach(index => {
        if (!cancelled(baseline[index])) changes.push({kind:'cancel', number:numbers[index], previous:baseline[index], next:null, fields:[]});
    });
    return changes.sort((a,b) => (a.number ?? 0) - (b.number ?? 0));
}

export function summaryLabels(language) {
    return language === 'kz'
        ? {title:'Ертеңгі өзгерістер', pair:'сабақ', classHour:'Тәрбие сағаты', cancelled:'болмайды', added:'қосылды', restored:'қайта болады', room:'кабинет', time:'уақыты', teacher:'оқытушы', break:'үзіліс'}
        : {title:'Изменения на завтра', pair:'пара', classHour:'Классный час', cancelled:'отменена', added:'добавлена', restored:'восстановлена', room:'кабинет', time:'время', teacher:'преподаватель', break:'перемена'};
}

export function scheduleSummaryMarkup(changes, dateLabel, language = 'ru', translate = text => text) {
    if (!changes.length) return '';
    const labels = summaryLabels(language);
    const text = value => escapeSummary(translate(value));
    const rows = changes.map(change => {
        const pairLabel = change.number === null ? labels.classHour : (language === 'kz' ? `${change.number}-${labels.pair}` : `${change.number}-я ${labels.pair}`);
        const item = change.next || change.previous || {};
        let detail;
        if (change.kind === 'cancel') detail = `${labels.cancelled} · ${text(item.subject)}`;
        else if (change.kind === 'added' || change.kind === 'restored') detail = `${labels[change.kind]} · ${text(item.subject)}${item.time ? ` · ${escapeSummary(item.time)}` : ''}${item.room ? ` · ${labels.room} ${text(item.room)}` : ''}`;
        else {
            const parts = [];
            if (change.fields.includes('subject')) parts.push(`${text(change.previous.subject)} → ${text(item.subject)}`);
            if (change.fields.includes('time')) parts.push(`${labels.time} ${escapeSummary(change.previous.time)} → ${escapeSummary(item.time)}`);
            if (change.fields.includes('room') || (change.fields.includes('subject') && item.room)) parts.push(`${labels.room} ${text(item.room || '—')}`);
            if (change.fields.includes('teacher')) parts.push(`${labels.teacher} ${escapeSummary(item.teacher || '—')}`);
            if (change.fields.includes('breakDuration')) parts.push(`${labels.break}: ${text(item.breakDuration || '—')}`);
            detail = parts.join(' · ');
        }
        return `<li${change.kind === 'cancel' ? ' class="cancelled"' : ''}><strong>${escapeSummary(pairLabel)}</strong><span>${detail}</span></li>`;
    }).join('');
    return `<div class="sbp-summary-heading"><h2>${labels.title}</h2><span>${escapeSummary(dateLabel)}</span></div><ul>${rows}</ul>`;
}
