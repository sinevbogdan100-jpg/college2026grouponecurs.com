(() => {
  const SW_URL = './notifications-sw.js';

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register(SW_URL, { scope: './', updateViaCache: 'none' })
      .then(registration => registration.update().catch(() => {}))
      .catch(error => console.warn('PWA service worker registration skipped', error));
  }

  // Warm only tiny/local modules after the first visible paint. The main module is module-preloaded from HTML.
  const warm = () => {
    if (navigator.connection?.saveData) return;
    [
      './notification-center.js?v=20261004-performance-v1',
      './notification-state.js?v=20261004-performance-v1',
      './support-state.js?v=20261004-performance-v1'
    ].forEach(url => fetch(url, { cache: 'force-cache', priority: 'low' }).catch(() => {}));
  };

  if ('requestIdleCallback' in window) requestIdleCallback(warm, { timeout: 2500 });
  else setTimeout(warm, 1200);
})();
