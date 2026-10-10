// Date-specific changes are separate from the recurring numerator/denominator.
export const SCHEDULE_SCHEMA_VERSION = 2;
export const SCHEDULE_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];
const clone = value => JSON.parse(JSON.stringify(value));
export function scheduleDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
export function scheduleDayForDate(date) {
    return SCHEDULE_DAYS[date.getDay()-1] || null;
}
export function scheduleForDate(payload, date, weekType) {
    const day = scheduleDayForDate(date);
    if (!day) return [];
    const override = payload.dateOverrides?.[scheduleDateKey(date)];
    return override?.weekType === weekType && Array.isArray(override.lessons)
        ? override.lessons : (payload[weekType]?.[day] || []);
}
export function ensureDateSchedule(payload, date, weekType) {
    const key = scheduleDateKey(date);
    payload.dateOverrides ||= {};
    if (payload.dateOverrides[key]?.weekType !== weekType || !Array.isArray(payload.dateOverrides[key]?.lessons)) {
        payload.dateOverrides[key] = { weekType, lessons: clone(scheduleForDate(payload, date, weekType)) };
    }
    return payload.dateOverrides[key].lessons;
}
function restoreItem(item, fallback, forcePhysics = false) {
    const restored = clone(item);
    for (const field of ['time','subject','room','teacher']) {
        const original = item['original'+field[0].toUpperCase()+field.slice(1)];
        if (typeof original === 'string' && original.trim()) restored[field] = original;
        else if (fallback && (item.changeType === 'replace' || item.changeType === 'subject')) restored[field] = fallback[field];
    }
    // The old Monday subject itself contained a hand-written replacement notice.
    if (forcePhysics && fallback) {
        restored.subject = fallback.subject; restored.teacher = fallback.teacher; restored.room = fallback.room;
    }
    if (item.originalBreakDuration) restored.breakDuration = item.originalBreakDuration;
    for (const key of ['originalTime','originalSubject','originalRoom','originalTeacher','originalBreakDuration','changeId','changedAt','changeNote']) delete restored[key];
    restored.changeType = 'normal'; restored.cancelled = false;
    return restored;
}
export function migrateLegacySchedule(input, defaults) {
    const data = clone(input);
    data.dateOverrides ||= {};
    if (Number(data.scheduleSchemaVersion) >= SCHEDULE_SCHEMA_VERSION) return { data, migrated:false };
    const original = clone(data.denominator || defaults.denominator);
    data.denominator = clone(original);
    let migrated = false;
    for (const [dayIndex,day] of SCHEDULE_DAYS.entries()) {
        const list = data.denominator[day];
        if (!Array.isArray(list)) continue;
        const date = `2026-10-${String(5+dayIndex).padStart(2,'0')}`;
        const changed = list.some(item => item.cancelled || (item.changeType && item.changeType !== 'normal') || /ЗАМЕНА|ОТМЕН/i.test(item.subject || ''));
        if (!changed) continue;
        // Keep the complete actual day, including cancellations, for historical views.
        if (!data.dateOverrides[date]) data.dateOverrides[date] = { weekType:'denominator', lessons:clone(list) };
        data.denominator[day] = list.map((item,index) => {
            const temporary = item.cancelled || (item.changeType && item.changeType !== 'normal') || /ЗАМЕНА|ОТМЕН/i.test(item.subject || '');
            if (!temporary) return item;
            const physics = day === 'mon' && index === 0 && /Физика|Русская литература/i.test(`${item.originalSubject || ''} ${item.subject || ''}`);
            const fallback = defaults.denominator?.[day]?.find(row => row.time === (item.originalTime || item.time)) || defaults.denominator?.[day]?.[index];
            return restoreItem(item,fallback,physics);
        });
        migrated = true;
    }
    // Recover known removed rows as well as retained cancelled rows.
    for (const [day,subject] of [['mon','История Казахстана'],['tue','Классный час']]) {
        const list = data.denominator[day];
        if (!Array.isArray(list) || list.some(item => item.subject === subject)) continue;
        const fallback = defaults.denominator[day].find(item => item.subject === subject);
        const date = day === 'mon' ? '2026-10-05' : '2026-10-06';
        if (!data.dateOverrides[date]) data.dateOverrides[date] = { weekType:'denominator',lessons:clone(original[day]) };
        list.push(clone(fallback)); list.sort((a,b) => String(a.time).localeCompare(String(b.time)));
        migrated = true;
    }
    data.scheduleSchemaVersion = SCHEDULE_SCHEMA_VERSION;
    if (migrated) data.legacyScheduleArchive = input.legacyScheduleArchive || { weekStart:'2026-10-05',denominator:original };
    return { data,migrated };
}
