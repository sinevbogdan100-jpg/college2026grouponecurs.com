// Shared pure helpers for the displayed build and incoming support messages.
export function getSiteVersion(build) {
  return String(build || '').match(/^step(\d+(?:\.\d+)*)/i)?.[1] || String(build || '—');
}

export function incomingSupportCount(messages, staff) {
  const incomingRole = staff ? 'visitor' : 'staff';
  return (Array.isArray(messages) ? messages : []).filter(message => message?.role === incomingRole).length;
}

// Support conversations are append-only arrays; each reader keeps a cursor per thread.
export function unreadSupportCount(messages, staff, readCount = 0) {
  const cursor = Number.isSafeInteger(readCount) && readCount >= 0 ? readCount : 0;
  return Math.max(0, incomingSupportCount(messages, staff) - cursor);
}
