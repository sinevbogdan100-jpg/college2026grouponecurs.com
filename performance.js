(() => {
  const pageUrl = new URL(location.href);
  if (pageUrl.searchParams.has('app-refresh')) {
    pageUrl.searchParams.delete('app-refresh');
    history.replaceState(history.state, '', pageUrl.href);
  }
  const currentBuild = document.querySelector('meta[name="app-build"]')?.content || '';
  let registration = null;
  let waitingWorker = null;
  let dismissed = '';
  let availableBuild = '';
  let busy = false;
  let checking = false;
  const text = (ru, kz) => localStorage.getItem('toe_ui_language') === 'kz' ? kz : ru;
  const elements = () => ({
    bar: document.getElementById('app-update-bar'),
    now: document.getElementById('app-update-now'),
    later: document.getElementById('app-update-later'),
    manual: document.getElementById('menu-update-button'),
    hint: document.getElementById('menu-update-hint')
  });

  function showUpdatePrompt(worker, build = '') {
    waitingWorker = worker || waitingWorker;
    availableBuild = build || availableBuild;
    if (busy || dismissed === (availableBuild || 'worker')) return;
    elements().bar?.classList.remove('hidden');
    if (elements().hint) elements().hint.textContent = text('Доступна новая версия', 'Жаңа нұсқа қолжетімді');
  }

  async function fetchPage() {
    const response = await fetch(new URL('./index.html', location.href), { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const page = new DOMParser().parseFromString(await response.text(), 'text/html');
    if (!page.querySelector('meta[name="app-build"]')) throw new Error('Invalid app page');
    return page;
  }

  async function checkForUpdate() {
    if (checking || busy || !navigator.onLine) return;
    checking = true;
    try {
      const page = await fetchPage();
      const build = page.querySelector('meta[name="app-build"]').content;
      if (build !== currentBuild) showUpdatePrompt(null, build);
      await registration?.update();
      if (registration?.waiting && navigator.serviceWorker.controller) showUpdatePrompt(registration.waiting);
    } catch (error) { console.debug('Update check unavailable', error.message); }
    finally { checking = false; }
  }

  async function refreshShell(page) {
    // Refresh only the app shell. Accounts, journal records and drafts stay intact.
    if (!('caches' in window)) return;
    const cacheNames = (await caches.keys()).filter(name => name.startsWith('sbp-shell-'));
    if (!cacheNames.length) return;
    const base = new URL('./', location.href);
    const assets = new Set([new URL('index.html', base).href]);
    page.querySelectorAll('script[src],link[rel="stylesheet"][href],link[rel="modulepreload"][href]').forEach(node => {
      const url = new URL(node.getAttribute('src') || node.getAttribute('href'), base);
      if (url.origin === location.origin) assets.add(url.href);
    });
    const shellCaches = await Promise.all(cacheNames.map(name => caches.open(name)));
    for (const cache of shellCaches) {
      for (const request of await cache.keys()) {
        const url = new URL(request.url);
        if (url.origin === location.origin && /\.(js|css|webmanifest)$/.test(url.pathname)) assets.add(url.href);
      }
    }
    // Follow local module imports so newly introduced modules are fresh too.
    const responses = new Map();
    while ([...assets].some(url => !responses.has(url))) {
      const pending = [...assets].filter(url => !responses.has(url));
      await Promise.all(pending.map(async url => {
        const response = await fetch(url, { cache: 'reload', signal: AbortSignal.timeout(20000) });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        responses.set(url, response);
        if (new URL(url).pathname.endsWith('.js')) {
          const source = await response.clone().text();
          for (const match of source.matchAll(/(?:from\s*|import\s*)['"](\.\.?\/[^'"]+)['"]/g)) {
            const dependency = new URL(match[1], url);
            if (dependency.origin === location.origin) assets.add(dependency.href);
          }
        }
      }));
    }
    for (const cache of shellCaches) {
      for (const [url, response] of responses) await cache.put(url, response.clone());
      const html = responses.get(new URL('index.html', base).href);
      await cache.put(base.href, html.clone());
    }
  }

  window.refreshSBPApp = async function() {
    if (busy) return;
    const { now, manual, hint } = elements();
    if (!navigator.onLine) {
      elements().bar?.classList.remove('hidden');
      const copy = document.querySelector('.app-update-copy span');
      if (copy) copy.textContent = text('Для обновления подключитесь к интернету.', 'Жаңарту үшін интернетке қосылыңыз.');
      return;
    }
    busy = true;
    if (now) { now.disabled = true; now.textContent = text('Обновление…', 'Жаңартылуда…'); }
    if (manual) manual.disabled = true;
    if (hint) hint.textContent = text('Загружаем свежую версию…', 'Жаңа нұсқа жүктелуде…');
    try {
      const page = await fetchPage();
      await registration?.update();
      if (registration?.installing) {
        const worker = registration.installing;
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Install timeout')), 30000);
          const done = () => {
            if (!['installed', 'redundant'].includes(worker.state)) return;
            clearTimeout(timeout);
            worker.removeEventListener('statechange', done);
            if (worker.state === 'redundant') reject(new Error('Install failed')); else resolve();
          };
          worker.addEventListener('statechange', done);
          done();
        });
      }
      await refreshShell(page);
      waitingWorker = registration?.waiting || (waitingWorker?.state === 'installed' ? waitingWorker : null);
      if (waitingWorker) {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => { navigator.serviceWorker.removeEventListener('controllerchange', done); reject(new Error('Activation timeout')); }, 15000);
          const done = () => { clearTimeout(timeout); navigator.serviceWorker.removeEventListener('controllerchange', done); resolve(); };
          navigator.serviceWorker.addEventListener('controllerchange', done);
          waitingWorker.postMessage({ type: 'SKIP_WAITING' });
        });
      }
      const url = new URL(location.href);
      url.searchParams.set('app-refresh', Date.now().toString());
      location.replace(url.href);
    } catch (error) {
      console.warn('App update incomplete', error);
      busy = false;
      if (now) { now.disabled = false; now.textContent = text('Повторить обновление', 'Жаңартуды қайталау'); }
      if (manual) manual.disabled = false;
      if (hint) hint.textContent = text('Не удалось обновить. Попробуйте ещё раз.', 'Жаңарту сәтсіз. Қайталап көріңіз.');
      elements().bar?.classList.remove('hidden');
      const copy = document.querySelector('.app-update-copy span');
      if (copy) copy.textContent = text('Не удалось загрузить обновление. Попробуйте ещё раз.', 'Жаңарту жүктелмеді. Қайталап көріңіз.');
    }
  };
  elements().now?.addEventListener('click', window.refreshSBPApp);
  elements().manual?.addEventListener('click', window.refreshSBPApp);
  elements().later?.addEventListener('click', () => {
    dismissed = availableBuild || 'worker';
    elements().bar?.classList.add('hidden');
  });
  function watchInstalling(worker) {
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdatePrompt(registration?.waiting || worker);
    });
  }
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./notifications-sw.js', { scope: './', updateViaCache: 'none' }).then(reg => {
      registration = reg;
      if (reg.waiting && navigator.serviceWorker.controller) showUpdatePrompt(reg.waiting);
      watchInstalling(reg.installing);
      reg.addEventListener('updatefound', () => watchInstalling(reg.installing));
    }).catch(error => console.warn('PWA registration unavailable', error));
  }
  setTimeout(checkForUpdate, 2500);
  window.addEventListener('online', checkForUpdate);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { dismissed = ''; checkForUpdate(); }
  });
  window.setInterval(() => { if (document.visibilityState === 'visible') checkForUpdate(); }, 60000);
})();
