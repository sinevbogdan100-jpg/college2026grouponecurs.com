import { callCloudFunction } from './firebase.js?v=20261004-console-fixes-v1';

const SOUND_KEY = 'toe_notification_sound_v1';
const DEVICE_KEY = 'toe_device_notifications_v1';
const DELIVERY_KEY = 'toe_notification_deliveries_v1';

export function createNotificationCenter({ getCloud, translate, toast, open }) {
  let audio, registration, configuration, registeredContext = '', busy = false;
  let statusOverride = '';
  let audioUnlockedByGesture = false;
  const read = key => { try { return localStorage.getItem(key); } catch (_) { return null; } };
  const write = (key, value) => { try { localStorage.setItem(key, value); } catch (_) {} };
  const soundEnabled = () => read(SOUND_KEY) === '1';
  const deviceEnabled = () => read(DEVICE_KEY) === '1';
  const context = () => getCloud().auth?.currentUser?.uid || '';
  const supported = () => window.isSecureContext && 'Notification' in window && 'serviceWorker' in navigator;
  const ios = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const installed = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

  function render() {
    const sound = document.getElementById('notification-sound-toggle');
    if (sound) sound.checked = soundEnabled();
    const enable = document.getElementById('notification-device-enable');
    const disable = document.getElementById('notification-device-disable');
    const active = supported() && Notification.permission === 'granted' && deviceEnabled();
    if (enable) { enable.disabled = busy || !supported(); enable.hidden = active; }
    if (disable) { disable.disabled = busy; disable.hidden = !active; }
    let text = 'Уведомления на устройство выключены';
    if (ios() && !installed()) text = 'На iPhone добавьте сайт на экран «Домой» и откройте его оттуда';
    else if (!supported()) text = 'Этот браузер не поддерживает уведомления на устройство';
    else if (Notification.permission === 'denied') text = 'Уведомления заблокированы. Разрешите их в настройках браузера';
    else if (active) text = registeredContext === context() && registeredContext
      ? 'Включены, в том числе при закрытом сайте'
      : 'Включены, пока сайт открыт. Доставка при закрытом сайте ещё не подключена';
    const status = document.getElementById('notification-device-status');
    if (status) status.textContent = translate(statusOverride || text);
  }

  async function unlockAudio(fromUserGesture = false) {
    if (!soundEnabled()) return;
    if (fromUserGesture) audioUnlockedByGesture = true;
    if (!audioUnlockedByGesture) return;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      audio ||= new Audio();
      if (audio.state === 'suspended') await audio.resume();
    } catch (_) {}
  }

  async function chime() {
    if (!soundEnabled() || !audioUnlockedByGesture) return;
    await unlockAudio(false);
    if (!audio || audio.state !== 'running') return;
    const now = audio.currentTime;
    [660, 880].forEach((frequency, index) => {
      const oscillator = audio.createOscillator(), gain = audio.createGain();
      const start = now + index * 0.14;
      oscillator.type = 'sine'; oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.075, start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.24);
      oscillator.connect(gain); gain.connect(audio.destination);
      oscillator.start(start); oscillator.stop(start + 0.25);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    });
  }

  async function worker() {
    registration ||= navigator.serviceWorker.register('./notifications-sw.js', { scope: './' }).then(async () => navigator.serviceWorker.ready);
    return registration;
  }

  async function call(name, data = {}) {
    if (!getCloud().auth?.currentUser) throw new Error('auth');
    return await callCloudFunction(name, data);
  }

  function publicKey(value) {
    const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(binary, c => c.charCodeAt(0));
  }

  async function registerPush() {
    const expected = context();
    if (!expected || !deviceEnabled() || Notification.permission !== 'granted' || !configuration?.vapidPublicKey || !('PushManager' in window)) return;
    const sw = await worker();
    let subscription = await sw.pushManager.getSubscription();
    subscription ||= await sw.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: publicKey(configuration.vapidPublicKey) });
    if (context() !== expected || !deviceEnabled()) { await subscription.unsubscribe(); return; }
    await call('registerPushDevice', { subscription: subscription.toJSON(), language: read('toe_ui_language') === 'kz' ? 'kz' : 'ru' });
    if (context() !== expected || !deviceEnabled()) { await subscription.unsubscribe(); return; }
    registeredContext = expected;
    render();
  }

  async function refreshAccount() {
    registeredContext = ''; statusOverride = ''; render();
    const expected = context();
    if (!expected || !supported()) return;
    try {
      configuration = await call('getPushConfiguration');
      if (context() === expected) await registerPush();
    } catch (_) { configuration = null; }
    render();
  }

  async function detach() {
    registeredContext = '';
    if (!supported()) return;
    const sw = await worker();
    const subscription = await sw.pushManager?.getSubscription();
    if (subscription) {
      try { await call('unregisterPushDevice', { endpoint: subscription.endpoint }); } catch (_) {}
      await subscription.unsubscribe();
    }
    render();
  }

  async function enableDevice() {
    if (busy || !supported()) return;
    if (ios() && !installed()) { render(); return; }
    // Request directly from the click, before asynchronous registration/network calls.
    const permissionRequest = Notification.requestPermission();
    busy = true; statusOverride = ''; render();
    try {
      if (await permissionRequest === 'granted') {
        write(DEVICE_KEY, '1'); await worker();
        if (!configuration && context()) { try { configuration = await call('getPushConfiguration'); } catch (_) {} }
        try { await registerPush(); } catch (_) { statusOverride = 'Не удалось подключить доставку при закрытом сайте. Уведомления работают, пока сайт открыт'; }
      }
    } catch (_) { statusOverride = 'Не удалось включить уведомления. Проверьте настройки браузера'; }
    finally { busy = false; render(); }
  }

  async function disableDevice() {
    if (busy) return;
    busy = true; write(DEVICE_KEY, '0'); statusOverride = ''; render();
    try { await detach(); } catch (_) { statusOverride = 'Не удалось отключить подписку. Заблокируйте уведомления в настройках браузера'; }
    finally { busy = false; render(); }
  }

  async function incoming({ key, title, body, kind, threadId = '', push = false }) {
    const deliver = async () => {
      let delivered;
      try { delivered = JSON.parse(read(DELIVERY_KEY) || '{}'); } catch (_) { delivered = {}; }
      if (!delivered || typeof delivered !== 'object' || Array.isArray(delivered)) delivered = {};
      const deliveryId = `${context()}:${key}`;
      if (delivered[deliveryId]) return;
      delivered[deliveryId] = Date.now();
      const entries = Object.entries(delivered).sort((a, b) => b[1] - a[1]).slice(0, 250);
      write(DELIVERY_KEY, JSON.stringify(Object.fromEntries(entries)));
      if (document.visibilityState === 'visible') { await chime(); toast(title); }
      if (!push && deviceEnabled() && supported() && Notification.permission === 'granted' && document.visibilityState !== 'visible' && registeredContext !== context()) {
        try {
          const sw = await worker();
          await sw.showNotification(title, {
            body,
            icon: './sbp-information-icon.svg',
            tag: key,
            silent: false,
            renotify: true,
            vibrate: [110, 70, 110],
            data: { kind, threadId }
          });
        } catch (_) {}
      }
    };
    try {
      if (navigator.locks) await navigator.locks.request('toe-notification-delivery', deliver);
      else await deliver();
    } catch (_) {}
  }

  document.getElementById('notification-sound-toggle')?.addEventListener('change', async event => {
    write(SOUND_KEY, event.target.checked ? '1' : '0');
    if (event.target.checked) { await unlockAudio(true); await chime(); }
    render();
  });
  document.getElementById('notification-sound-test')?.addEventListener('click', async () => {
    if (!soundEnabled()) { toast('Сначала включите звук уведомлений'); return; }
    await unlockAudio(true);
    await chime();
  });
  document.getElementById('notification-device-enable')?.addEventListener('click', enableDevice);
  document.getElementById('notification-device-disable')?.addEventListener('click', disableDevice);
  document.addEventListener('pointerdown', () => { void unlockAudio(true); }, { passive: true, once: true });
  document.addEventListener('keydown', () => { void unlockAudio(true); }, { once: true });
  document.addEventListener('visibilitychange', render);
  window.addEventListener('storage', render);
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', event => {
    if (event.data?.type === 'notification-open') open(event.data);
    if (event.data?.type === 'notification-arrival') incoming({ ...event.data, push: true });
  });
  if (supported()) worker().catch(() => {});
  render();
  return { incoming, refreshAccount, detach, render };
}
