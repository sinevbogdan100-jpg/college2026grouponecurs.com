const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(require('node:path').join(__dirname, '../performance.js'), 'utf8');

function app({ build = '18.45', remoteBuild = build, online = true, waiting = false, sw = true, fail = false } = {}) {
  const nodes = new Map();
  const calls = [], navigations = [], writes = [], timers = [], events = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { disabled: false, textContent: '', handlers: {}, classList: {
      hidden: id === 'app-update-bar', add() { this.hidden = true; }, remove() { this.hidden = false; }
    }, addEventListener(type, fn) { this.handlers[type] = fn; } });
    return nodes.get(id);
  };
  const cache = {
    async keys() { return [{ url: 'https://example.com/site/style.css?v=old' }]; },
    async put(url, response) { writes.push([url, await response.text()]); }
  };
  const worker = { state: 'installed', postMessage(message) {
    assert.equal(message.type, 'SKIP_WAITING');
    assert.ok(writes.some(([url]) => url.endsWith('index.html')), 'shell ready before activation');
    this.state = 'activated'; registration.waiting = null;
    queueMicrotask(() => events.get('controllerchange')?.());
  } };
  const registration = { waiting: waiting ? worker : null, async update() {}, addEventListener() {} };
  const navigator = { onLine: online };
  if (sw) navigator.serviceWorker = {
    controller: {}, async register() { return registration; },
    addEventListener(type, fn) { events.set(type, fn); },
    removeEventListener(type) { events.delete(type); }
  };
  const localStorage = { getItem() { return 'ru'; }, setItem() { throw new Error('Do not modify user data'); }, clear() { throw new Error('Do not delete user data'); } };
  const document = { visibilityState: 'visible',
    querySelector(selector) { return selector.includes('meta') ? { content: build } : node('copy'); },
    getElementById: node, addEventListener(type, fn) { events.set(type, fn); }
  };
  const page = { querySelector() { return { content: remoteBuild }; },
    querySelectorAll() { return [{ getAttribute(name) { return name === 'src' ? './app.js?v=new' : null; } }]; }
  };
  const location = { href: 'https://example.com/site/?source=android-app#schedule', origin: 'https://example.com', replace(url) { navigations.push(url); } };
  const context = { console: { debug() {}, warn() {} }, URL, Date, Map, Set, Promise, AbortSignal,
    location, history: { state: {}, replaceState() {} }, document, navigator, localStorage,
    caches: { async keys() { return ['unrelated-data-cache', 'sbp-shell-test']; }, async open(name) { assert.equal(name, 'sbp-shell-test'); return cache; } },
    DOMParser: class { parseFromString() { return page; } },
    async fetch(url, options) {
      calls.push([String(url), options]);
      if (fail) return new Response('failure', { status: 503 });
      return new Response(String(url).includes('app.js') ? "import { data } from './schedule.js?v=new';" : 'fresh source');
    },
    setTimeout(fn, ms) { timers.push([fn, ms]); return timers.length; }, clearTimeout() {},
    window: { addEventListener(type, fn) { events.set(type, fn); }, setInterval(fn, ms) { assert.equal(ms, 60000); } }
  };
  context.window.caches = context.caches;
  vm.runInNewContext(source, context);
  return { context, node, calls, navigations, writes, timers, events, registration };
}

(async () => {
  const same = app();
  await Promise.resolve();
  await same.timers.find(([, ms]) => ms === 2500)[0]();
  assert.equal(same.node('app-update-bar').classList.hidden, true, 'same version does not nag');

  const changed = app({ remoteBuild: '18.46' });
  await Promise.resolve();
  await changed.timers.find(([, ms]) => ms === 2500)[0]();
  assert.equal(changed.node('app-update-bar').classList.hidden, false, 'HTML version detects update even when worker does not change');
  changed.node('app-update-later').handlers.click();
  assert.equal(changed.node('app-update-bar').classList.hidden, true);
  await changed.context.window.refreshSBPApp();
  assert.equal(changed.navigations.length, 1);
  const url = new URL(changed.navigations[0]);
  assert.equal(url.hash, '#schedule'); assert.equal(url.searchParams.get('source'), 'android-app');
  assert.ok(url.searchParams.has('app-refresh'));
  assert.ok(changed.writes.some(([url]) => url.includes('schedule.js?v=new')), 'refresh follows module dependencies');
  assert.ok(changed.calls.filter(([url]) => !url.endsWith('index.html')).every(([, opts]) => opts.cache === 'reload'));

  const nextWorker = app({ waiting: true });
  await Promise.resolve();
  assert.equal(nextWorker.node('app-update-bar').classList.hidden, false);
  await nextWorker.context.window.refreshSBPApp();
  assert.equal(nextWorker.navigations.length, 1, 'waiting worker activates before one reload');

  const offline = app({ online: false });
  await offline.context.window.refreshSBPApp();
  assert.equal(offline.calls.length, 0); assert.equal(offline.navigations.length, 0);
  assert.match(offline.node('copy').textContent, /интернет/);
  assert.equal(offline.node('menu-update-button').disabled, false);

  const failed = app({ fail: true });
  await failed.context.window.refreshSBPApp();
  assert.equal(failed.navigations.length, 0, 'failed update never reloads or reports success');
  assert.equal(failed.node('menu-update-button').disabled, false);
  assert.equal(failed.node('app-update-now').disabled, false);

  const noWorker = app({ sw: false, remoteBuild: '18.46' });
  await noWorker.timers.find(([, ms]) => ms === 2500)[0]();
  assert.equal(noWorker.node('app-update-bar').classList.hidden, false);
  await noWorker.context.window.refreshSBPApp();
  assert.equal(noWorker.navigations.length, 1);
  console.log('App updates: version detection, manual refresh, module freshness, worker activation, offline, failure, and no-worker fallback passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
