// Notification delivery only: no caching of pages, authentication or cloud data.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let payload;
    try { payload = event.data?.json(); } catch (_) {}
    payload ||= { title: 'SBP GROUP', body: 'Новое уведомление', key: 'toe-new', kind: 'events' };
    await self.registration.showNotification(payload.title || 'SBP GROUP', {
      body: payload.body || '', icon: './icon.png', tag: payload.key || 'toe-new',
      data: { kind: payload.kind, threadId: payload.threadId || '' }
    });
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    windows.forEach(client => client.postMessage({ ...payload, type: 'notification-arrival' }));
  })());
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const data = event.notification.data || {};
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = windows.find(item => item.url.startsWith(self.registration.scope));
    if (client) { await client.focus(); client.postMessage({ type: 'notification-open', ...data }); return; }
    const url = new URL('./', self.registration.scope);
    url.searchParams.set('notification', data.kind === 'support' ? 'support' : 'events');
    if (data.threadId) url.searchParams.set('thread', data.threadId);
    await self.clients.openWindow(url.href);
  })());
});
