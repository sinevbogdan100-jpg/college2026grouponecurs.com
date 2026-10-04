const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const storage = new Map(), nodes = new Map(), toasts = [], notices = [], handlers = {};
const node = id => {
  if (!nodes.has(id)) nodes.set(id, { textContent: '', addEventListener(type, callback) { handlers[`${id}:${type}`] = callback; } });
  return nodes.get(id);
};
let permissionCalls = 0, cloudCalls = 0, notes = 0;
const cloud = { auth: { currentUser: { uid: 'visitor-a', async getIdToken() { return 'test-auth-token'; } } } };
const registration = { async showNotification(title, options) { notices.push({ title, ...options }); }, pushManager: { async getSubscription() { return null; } } };
const context = {
  console, JSON, Object, String, Uint8Array, AbortSignal, Date, atob,
  firebaseConfig: { projectId: 'test-project' },
  localStorage: { getItem(key) { return storage.get(key); }, setItem(key, value) { storage.set(key, value); } },
  Notification: { permission: 'default', async requestPermission() { permissionCalls++; this.permission = 'granted'; return 'granted'; } },
  navigator: { userAgent: 'Desktop', platform: 'Linux', maxTouchPoints: 0, serviceWorker: { async register() { return registration; }, ready: Promise.resolve(registration), addEventListener() {} } },
  document: { visibilityState: 'visible', getElementById: node, addEventListener() {} },
  async fetch() { cloudCalls++; return { ok: false }; },
  window: { isSecureContext: true, Notification: {}, matchMedia() { return { matches: false }; }, addEventListener() {}, AudioContext: class {
    constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; }
    createOscillator() { notes++; return { frequency: {}, connect() {}, start() {}, stop() {}, disconnect() {} }; }
    createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
  } }
};
vm.createContext(context);
const root = path.join(__dirname, '..');
vm.runInContext(fs.readFileSync(path.join(root, 'notification-state.js'), 'utf8').replaceAll('export function', 'function'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'notification-center.js'), 'utf8').replace(/^import .*;\n/, '').replaceAll('export function', 'function'), context);
const tracker = context.createArrivalTracker();
assert.deepEqual([...tracker.update([{ id: 'old', count: 1 }])], []);
assert.equal(tracker.update([{ id: 'old', count: 1 }, { id: 'new', count: 1 }]).length, 1);
assert.equal(tracker.update([{ id: 'old', count: 1 }, { id: 'new', count: 1 }]).length, 0);
tracker.reset(); assert.equal(tracker.update([{ id: 'new', count: 1 }]).length, 0);
const center = context.createNotificationCenter({ getCloud: () => cloud, translate: x => x, toast: x => toasts.push(x), open() {} });
(async () => {
  assert.equal(permissionCalls, 0, 'no unsolicited permission prompt');
  await handlers['notification-sound-toggle:change']({ target: { checked: true } });
  const initialNotes = notes;
  await center.incoming({ key: 'support:a:staff:1', title: 'Новый ответ поддержки', kind: 'support' });
  assert.equal(notes, initialNotes + 2, 'two gentle tones for one incoming message');
  assert.equal(toasts.length, 1);
  await center.incoming({ key: 'support:a:staff:1', title: 'Новый ответ поддержки', kind: 'support' });
  assert.equal(notes, initialNotes + 2, 'same event is silent on repeated delivery');
  await center.refreshAccount();
  await handlers['notification-device-enable:click']();
  assert.equal(permissionCalls, 1);
  assert.match(node('notification-device-status').textContent, /пока сайт открыт/);
  assert.doesNotMatch(node('notification-device-status').textContent, /в том числе/);
  context.document.visibilityState = 'hidden';
  await center.incoming({ key: 'event:new', title: 'Новое объявление', body: 'Собрание', kind: 'events' });
  assert.equal(notices.length, 1);
  assert.equal(notices[0].data.kind, 'events');
  assert.equal(notes, initialNotes + 2, 'background tab does not play foreground sound');
  await handlers['notification-device-disable:click']();
  await center.incoming({ key: 'event:second', title: 'Новое объявление', kind: 'events' });
  assert.equal(notices.length, 1, 'disabled notifications remain disabled');
  assert.equal(cloudCalls, 2, 'setup retry happens on the explicit enable button only');
  context.window.PushManager = function() {};
  const requests = [];
  let subscription = null, unsubscriptions = 0;
  registration.pushManager = {
    async getSubscription() { return subscription; },
    async subscribe() { subscription = { endpoint: 'https://fcm.googleapis.com/test', toJSON() { return { endpoint: this.endpoint, keys: {} }; }, async unsubscribe() { unsubscriptions++; subscription = null; } }; return subscription; }
  };
  context.fetch = async (url, options) => {
    requests.push({ url, data: JSON.parse(options.body).data });
    return { ok: true, async json() { return { result: url.endsWith('getPushConfiguration') ? { vapidPublicKey: 'a'.repeat(87) } : { registered: true } }; } };
  };
  context.document.visibilityState = 'visible';
  await center.refreshAccount();
  assert.equal(requests.length, 1, 'server configuration does not opt users in');
  await handlers['notification-device-enable:click']();
  assert.match(node('notification-device-status').textContent, /в том числе при закрытом сайте/);
  assert.ok(requests.at(-1).url.endsWith('registerPushDevice'));
  await center.detach();
  assert.equal(unsubscriptions, 1, 'account switching drops the previous private push subscription');
  assert.ok(requests.at(-1).url.endsWith('unregisterPushDevice'));
  console.log('PASS: arrival baseline, repeat deduplication, optional sound, user-initiated permission, honest missing-backend status, background notifications and disabling. APIs mocked.');
})().catch(error => { console.error(error); process.exitCode = 1; });
