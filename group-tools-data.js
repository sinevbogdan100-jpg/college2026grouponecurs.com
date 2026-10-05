export const SHARE_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];
export function localISO(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
export function scheduleShareSnapshot(data, day, weekType, reference, mode = 'day') {
  const monday = new Date(reference); monday.setHours(0,0,0,0);
  monday.setDate(monday.getDate() - (monday.getDay() || 7) + 1);
  return { weekType, mode, days: (mode === 'week' ? SHARE_DAYS : [day]).map(key => {
    const date = new Date(monday); date.setDate(date.getDate()+SHARE_DAYS.indexOf(key));
    return { key, date: localISO(date), lessons: JSON.parse(JSON.stringify(data[key] || [])) };
  }) };
}
export function pinnedAnnouncement(items, now = Date.now()) {
  // Only the most recently pinned item is authoritative; an expired pin never revives an older one.
  const latest = items.filter(item => item.pinned === true).sort((a,b) => String(b.pinnedAt||'').localeCompare(String(a.pinnedAt||'')) || String(b.id).localeCompare(String(a.id)))[0];
  if (!latest) return null;
  return latest.pinnedUntil && !(Date.parse(latest.pinnedUntil) > now) ? null : latest;
}
export function attendanceChanges(before = {}, after = {}) {
  const changes = [];
  for (const field of ['state','notes']) {
    const old = before[field] || {}, next = after[field] || {};
    for (const student of new Set([...Object.keys(old),...Object.keys(next)])) {
      if ((old[student] || '') !== (next[student] || '')) changes.push({ student, field, oldValue: old[student] || '', newValue: next[student] || '' });
    }
  }
  return changes;
}
export function scheduleChanges(before = {}, after = {}) {
  const changes = [];
  for (const week of ['numerator','denominator']) for (const day of SHARE_DAYS) {
    const old = before[week]?.[day] || [], next = after[week]?.[day] || [];
    for (let row = 0; row < Math.max(old.length,next.length); row++) {
      for (const field of ['time','subject','teacher','room','breakDuration','cancelled','isClassHour','changeType','changeNote']) {
        const a = old[row]?.[field] ?? '', b = next[row]?.[field] ?? '';
        if (a !== b) changes.push({ week, day, row: row+1, field, oldValue: a, newValue: b });
      }
    }
  }
  return changes;
}
export function wrapCanvasText(text, measure, width) {
  const lines = [];
  for (const paragraph of String(text || '').split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate) <= width) { line = candidate; continue; }
      if (line) { lines.push(line); line = ''; }
      for (const char of word) {
        if (line && measure(line+char) > width) { lines.push(line); line = ''; }
        line += char;
      }
    }
    lines.push(line);
  }
  return lines;
}
