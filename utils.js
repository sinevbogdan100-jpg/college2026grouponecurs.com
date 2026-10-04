import { interfaceLocale, translateUI } from "./i18n.js?v=20261004-performance-v1";
// Общие независимые функции проекта.
// Здесь нет доступа к Firebase и состоянию журнала.

export function getWeekTypeForDate(dateObj) {
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

export function getCurrentDateStr() {
    // Используем локальную дату устройства, чтобы после полуночи дата
    // менялась именно по местному времени, а не по UTC.
    return formatLocalDate(new Date());
}

export function formatLocalDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export function isWeekendDate(dateOrString) {
    const date = typeof dateOrString === 'string'
        ? new Date(dateOrString + 'T00:00:00')
        : new Date(dateOrString);
    const day = date.getDay();
    return day === 0 || day === 6;
}

export function getLastWorkingDate(dateOrString) {
    const date = typeof dateOrString === 'string'
        ? new Date(dateOrString + 'T00:00:00')
        : new Date(dateOrString);
    while (isWeekendDate(date)) date.setDate(date.getDate() - 1);
    return formatLocalDate(date);
}

export function getNextWorkingDate(dateOrString) {
    const date = typeof dateOrString === 'string'
        ? new Date(dateOrString + 'T00:00:00')
        : new Date(dateOrString);
    while (isWeekendDate(date)) date.setDate(date.getDate() + 1);
    return formatLocalDate(date);
}

export function formatCalendarLabel(date) {
    const months = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
    const today = new Date();
    const sameToday = formatLocalDate(date) === formatLocalDate(today);
    return sameToday ? translateUI('Сегодня') : date.toLocaleDateString(interfaceLocale(), {day:'numeric',month:'long'});
}

export function getStatusName(status) {
    switch(status) {
        case 'present': return 'Присутствует';
        case 'late': return 'Опаздывает';
        case 'sick': return 'Болеет';
        case 'excused': return 'Уважительная';
        case 'unexcused': return 'Неуважительная';
        default: return 'Не отмечено';
    }
}

export function getWeekRangeText() {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setHours(0,0,0,0);
  monday.setDate(now.getDate() + diffToMonday);
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  const months = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  return `${monday.toLocaleDateString(interfaceLocale(), {day:'numeric',month:'long'})} — ${friday.toLocaleDateString(interfaceLocale(), {day:'numeric',month:'long'})}`;
}

export function getStatusBadgeClass(status) {
    switch(status) {
        case 'present': return 'bg-emerald-50 text-emerald-700 border border-emerald-100';
        case 'late': return 'bg-amber-50 text-amber-700 border border-amber-100';
        case 'sick': return 'bg-teal-50 text-teal-700 border border-teal-100';
        case 'excused': return 'bg-indigo-50 text-indigo-700 border border-indigo-100';
        case 'unexcused': return 'bg-rose-50 text-rose-700 border border-rose-100';
        default: return 'bg-slate-50 text-slate-700 border border-slate-100';
    }
}

