// SBP Information PWA service worker: fast app-shell caching + Web Push.
const CACHE_NAME = 'sbp-shell-20261004-launch-animation-v1';
const CACHE_PREFIX = 'sbp-shell-';
const CORE_ASSETS = [
  './',
  './index.html',
  './app.js?v=20261004-ui-polish-v1',
  './style.css?v=20261004-ui-polish-v1',
  './desktop.css?v=20261004-desktop-readability',
  './gradients.css?v=20261004-ui-polish-v1',
  './responsive-fit.css?v=20261004-layout-fit-v1',
  './firebase.js?v=20261004-performance-v1',
  './utils.js?v=20261004-performance-v1',
  './storage.js?v=20261004-performance-v1',
  './schedule.js?v=20261004-performance-v1',
  './i18n.js?v=20261004-ui-polish-v1',
  './notification-center.js?v=20261004-performance-v1',
  './notification-state.js?v=20261004-performance-v1',
  './support-state.js?v=20261004-performance-v1',
  './sbp-information-icon-20261004-v4.png',
  './sbp-information-favicon-20261004-v4.png',
  './sbp-information-apple-20261004-v4.png',
  './manifest.webmanifest?v=20261004-force-publish-v4'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(CORE_ASSETS.map(async url => {
      try {
        const response = await fetch(url, { cache: 'reload' });
        if (response.ok) await cache.put(url, response);
      } catch (_) {}
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function networkFirstNavigation(event) {
  const cache = await caches.open(CACHE_NAME);
  const networkPromise = fetch(event.request, { cache: 'no-cache' }).then(async response => {
    if (response?.ok) {
      await cache.put('./index.html', response.clone());
      await cache.put('./', response.clone());
    }
    return response;
  }).catch(() => null);

  const quickNetwork = await Promise.race([
    networkPromise,
    new Promise(resolve => setTimeout(() => resolve(null), 700))
  ]);

  if (quickNetwork) return quickNetwork;
  const cached = await cache.match('./index.html') || await cache.match('./');
  if (cached) {
    event.waitUntil(networkPromise);
    return cached;
  }
  return (await networkPromise) || Response.error();
}

async function staleWhileRevalidate(event) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(event.request);
  const networkPromise = fetch(event.request).then(async response => {
    if (response?.ok) await cache.put(event.request, response.clone());
    return response;
  }).catch(() => null);

  if (cached) {
    event.waitUntil(networkPromise);
    return cached;
  }
  return (await networkPromise) || Response.error();
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(event));
    return;
  }

  const destination = request.destination;
  if (['script', 'style', 'image', 'font', 'manifest'].includes(destination) || /\.(?:js|css|png|webmanifest)(?:\?|$)/i.test(url.pathname + url.search)) {
    event.respondWith(staleWhileRevalidate(event));
  }
});

self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let payload;
    try { payload = event.data?.json(); } catch (_) {}
    payload ||= { title: 'SBP Information', body: 'Новое уведомление', key: 'toe-new', kind: 'events' };
    await self.registration.showNotification(payload.title || 'SBP Information', {
      body: payload.body || '',
      icon: './sbp-information-icon-20261004-v4.png',
      badge: './sbp-information-icon-20261004-v4.png',
      tag: payload.key || 'toe-new',
      silent: false,
      renotify: true,
      vibrate: [110, 70, 110],
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
    if (client) {
      await client.focus();
      client.postMessage({ type: 'notification-open', ...data });
      return;
    }
    const url = new URL('./', self.registration.scope);
    url.searchParams.set('notification', data.kind === 'support' ? 'support' : 'events');
    if (data.threadId) url.searchParams.set('thread', data.threadId);
    await self.clients.openWindow(url.href);
  })());
});
