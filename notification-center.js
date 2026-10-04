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

  // Remote Web Push backend is intentionally not contacted from the page until the
  // Firebase callable functions are deployed. This keeps the production site free
  // from failed CORS/preflight requests. Foreground event notifications still work.
  async function refreshAccount() {
    registeredContext = '';
    configuration = null;
    if (deviceEnabled() && Notification.permission === 'granted') {
      statusOverride = 'Включены, пока сайт открыт. Доставка при закрытом сайте ещё не подключена';
    } else {
      statusOverride = '';
    }
    render();
  }

  async function detach() {
    registeredContext = '';
    configuration = null;
    if (!supported()) return;
    try {
      const sw = await worker();
      const subscription = await sw.pushManager?.getSubscription();
      if (subscription) await subscription.unsubscribe();
    } catch (_) {}
    render();
  }

  async function enableDevice() {
    if (busy || !supported()) return;
    if (ios() && !installed()) { render(); return; }
    busy = true; statusOverride = ''; render();
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        write(DEVICE_KEY, '1');
        await worker();
        statusOverride = 'Включены, пока сайт открыт. Доставка при закрытом сайте ещё не подключена';
      }
    } catch (_) {
      statusOverride = 'Не удалось включить уведомления. Проверьте настройки браузера';
    } finally {
      busy = false;
      render();
    }
  }

  async function disableDevice() {
    if (busy) return;
    busy = true;
    write(DEVICE_KEY, '0');
    statusOverride = '';
    try { await detach(); }
    catch (_) { statusOverride = 'Не удалось отключить подписку. Заблокируйте уведомления в настройках браузера'; }
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
