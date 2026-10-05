// SBP Information PWA service worker: fast app-shell caching + Web Push.
const CACHE_NAME = 'sbp-shell-20261005-group-tools-v1';
const CACHE_PREFIX = 'sbp-shell-';
const CORE_ASSETS = [
  './group-tools.js?v=20261005-group-tools-v1',
  './group-tools-data.js?v=20261005-group-tools-v1',
  './action-history.js?v=20261005-group-tools-v1',
  './',
  './index.html',
  './release-notes.js?v=20261005-group-tools-v1',
  './release-data.js?v=20261005-group-tools-v1',
  './app.js?v=20261005-group-tools-v1',
  './style.css?v=20261005-live-progress-v1',
  './desktop.css?v=20261004-desktop-readability',
  './gradients.css?v=20261004-ui-polish-v1',
  './responsive-fit.css?v=20261005-group-tools-v1',
  './firebase.js?v=20261005-group-tools-v1',
  './utils.js?v=20261004-performance-v1',
  './storage.js?v=20261004-performance-v1',
  './schedule.js?v=20261005-group-tools-v1',
  './i18n.js?v=20261005-group-tools-v1',
  './performance.js?v=20261005-mobile-bells-update-v1',
  './notification-center.js?v=20261005-performance-v2',
  './notification-state.js?v=20261004-performance-v1',
  './support-state.js?v=20261004-performance-v1',
  './sbp-information.png?v=20261004-console-fixes-v1',
  './tailwind-local.css?v=20261004-console-fixes-v1',
  './manifest.webmanifest?v=20261005-brand-icon-v1',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-solid-900.woff2',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-regular-400.woff2',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-brands-400.woff2',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js',
  'https://www.gstatic.com/firebasejs/12.19.0/firebase-functions.js'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(CORE_ASSETS.map(async url => {
      try {
        const response = await fetch(url, { cache: 'reload', mode: url.startsWith('http') ? 'cors' : 'same-origin' });
        if (response.ok || response.type === 'opaque') await cache.put(url, response);
      } catch (_) {}
    }));
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map(name => caches.delete(name)));
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch (_) {}
    }
    await self.clients.claim();
  })());
});

async function networkFirstNavigation(event) {
  const cache = await caches.open(CACHE_NAME);
  const networkPromise = (async () => {
    const preloaded = await event.preloadResponse;
    const response = preloaded || await fetch(event.request, { cache: 'no-cache' });
    if (response?.ok) {
      await cache.put('./index.html', response.clone());
      await cache.put('./', response.clone());
    }
    return response;
  })().catch(() => null);

  const quickNetwork = await Promise.race([
    networkPromise,
    new Promise(resolve => setTimeout(() => resolve(null), 140))
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
    if (response && (response.ok || response.type === 'opaque')) await cache.put(event.request, response.clone());
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
  // Explicit update requests must reach the network, never stale cached code.
  if (request.cache === 'reload' || request.cache === 'no-store') return;
  const url = new URL(request.url);
  const externalOfflineHosts = new Set([
    'cdnjs.cloudflare.com',
    'fonts.googleapis.com',
    'fonts.gstatic.com',
    'www.gstatic.com'
  ]);

  if (url.origin !== self.location.origin) {
    if (externalOfflineHosts.has(url.hostname)) {
      event.respondWith(staleWhileRevalidate(event));
    }
    return;
  }

  if (request.mode === 'navigate' && url.searchParams.has('app-refresh')) {
    event.respondWith(fetch(request, { cache: 'reload' }));
    return;
  }

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
      icon: './sbp-information.png',
      
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

