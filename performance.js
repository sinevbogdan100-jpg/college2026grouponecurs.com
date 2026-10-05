(() => {
  const SW_URL = './notifications-sw.js';
  let registration = null;
  let waitingWorker = null;
  let updateDismissed = false;
  let updateInProgress = false;
  let controllerReloadArmed = false;

  function updateElements() {
    return {
      bar: document.getElementById('app-update-bar'),
      now: document.getElementById('app-update-now'),
      later: document.getElementById('app-update-later')
    };
  }

  function hideUpdatePrompt() {
    updateElements().bar?.classList.add('hidden');
  }

  function showUpdatePrompt(worker) {
    if (!worker || updateDismissed || updateInProgress) return;
    waitingWorker = worker;
    const { bar, now, later } = updateElements();
    if (!bar || !now || !later) return;

    bar.classList.remove('hidden');
    now.disabled = false;
    now.textContent = 'Обновить сейчас';

    now.onclick = () => {
      if (updateInProgress || !waitingWorker) return;
      updateInProgress = true;
      controllerReloadArmed = true;
      now.disabled = true;
      now.textContent = 'Обновление…';
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    };

    later.onclick = () => {
      updateDismissed = true;
      hideUpdatePrompt();
    };
  }

  function watchInstalling(worker) {
    if (!worker) return;
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) {
        showUpdatePrompt(registration?.waiting || worker);
      }
    });
  }

  async function checkForUpdate() {
    if (!registration || !navigator.onLine) return;
    try {
      await registration.update();
      if (registration.waiting && navigator.serviceWorker.controller) {
        showUpdatePrompt(registration.waiting);
      }
    } catch (_) {}
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!controllerReloadArmed) return;
      controllerReloadArmed = false;
      window.location.reload();
    });

    navigator.serviceWorker.register(SW_URL, { scope: './', updateViaCache: 'none' })
      .then(reg => {
        registration = reg;

        if (registration.waiting && navigator.serviceWorker.controller) {
          showUpdatePrompt(registration.waiting);
        }

        if (registration.installing) watchInstalling(registration.installing);
        registration.addEventListener('updatefound', () => {
          watchInstalling(registration.installing);
        });

        const update = () => checkForUpdate();
        if ('requestIdleCallback' in window) requestIdleCallback(update, { timeout: 3500 });
        else setTimeout(update, 2200);

        window.addEventListener('online', update);
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            updateDismissed = false;
            update();
          }
        });

        window.setInterval(() => {
          if (document.visibilityState === 'visible') update();
        }, 15 * 60 * 1000);
      })
      .catch(error => console.warn('PWA service worker registration skipped', error));
  }

  // Warm only tiny/local modules after the first visible paint. The main module is module-preloaded from HTML.
  const warm = () => {
    if (navigator.connection?.saveData) return;
    [
      './notification-center.js?v=20261004-console-fixes-v2',
      './notification-state.js?v=20261004-performance-v1',
      './support-state.js?v=20261004-performance-v1'
    ].forEach(url => fetch(url, { cache: 'force-cache', priority: 'low' }).catch(() => {}));
  };

  if ('requestIdleCallback' in window) requestIdleCallback(warm, { timeout: 2500 });
  else setTimeout(warm, 1200);
})();
