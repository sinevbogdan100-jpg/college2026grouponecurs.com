const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const data = fs.readFileSync(path.join(root, 'release-data.js'), 'utf8').replaceAll('export ', '');
const ui = fs.readFileSync(path.join(root, 'release-notes.js'), 'utf8').replace(/^import .*;\n/, '');

function app({ build = 'step18.46-release-history-2026-10-05', seen = false, language = 'ru', denied = false, busy = false } = {}) {
  const storage = new Map([['toe_ui_language', language]]);
  if (seen) storage.set('sbp_release_seen_18.46', '1');
  const timers = [], nodes = new Map(), events = new Map();
  const classList = initial => ({ values: new Set(initial), contains(x) { return this.values.has(x); }, add(x) { this.values.add(x); }, remove(x) { this.values.delete(x); } });
  const document = { visibilityState: 'visible', readyState: 'complete', activeElement: null,
    body: { classList: classList([]) }, documentElement: { classList: classList([]) },
    addEventListener(type, fn) { events.set(type, fn); },
    querySelector(selector) { return selector.includes('meta') ? { content: build } : node('bottom-nav-home'); },
    getElementById: node,
    querySelectorAll() { return [node('release-notes-modal'), { getClientRects: () => busy ? [{}] : [] }]; }
  };
  function node(id) {
    if (!nodes.has(id)) nodes.set(id, { textContent: '', innerHTML: '', scrollTop: 0, hidden: false, disabled: false, isConnected: true,
      classList: classList(id === 'release-notes-modal' ? ['hidden'] : []), handlers: {}, attributes: {},
      setAttribute(name, value) { this.attributes[name] = value; },
      focus() { document.activeElement = this; }, closest() { return null; },
      addEventListener(type, fn) { this.handlers[type] = fn; },
      getClientRects() { return this.classList.contains('hidden') ? [] : [{}]; },
      querySelectorAll() { return [node('release-notes-close'), node('release-notes-history'), node('release-notes-acknowledge')]; }
    });
    return nodes.get(id);
  }
  document.activeElement = node('bottom-nav-home');
  const context = { console, Date, Intl, String, Number, document,
    localStorage: {
      getItem(key) { if (denied) throw new Error('Storage denied'); return storage.get(key) || null; },
      setItem(key, value) { if (denied) throw new Error('Storage denied'); assert.match(key, /^sbp_release_seen_/); storage.set(key, value); }
    },
    setTimeout(fn) { timers.push(fn); return timers.length; }, clearTimeout() {},
    window: { addEventListener(type, fn) { events.set(type, fn); }, closeAppMenu() {} }
  };
  vm.createContext(context); vm.runInContext(data, context); vm.runInContext(ui, context);
  return { context, storage, timers, node, document, events };
}

const first = app();
first.timers.shift()();
assert.equal(first.node('release-notes-modal').classList.contains('hidden'), false, 'new version prompts once');
assert.match(first.node('release-notes-content').innerHTML, /Среднее обновление/);
assert.doesNotMatch(first.node('release-notes-content').innerHTML, /18\.45/, 'initial card shows only installed release');
first.node('release-notes-acknowledge').handlers.click();
assert.equal(first.storage.get('sbp_release_seen_18.46'), '1');
assert.equal(first.node('release-notes-modal').classList.contains('hidden'), true);
assert.equal(first.document.body.classList.contains('release-notes-open'), false);

const seen = app({ seen: true }); seen.timers.shift()();
assert.equal(seen.node('release-notes-modal').classList.contains('hidden'), true, 'acknowledged version stays silent');
seen.context.window.openReleaseHistory();
assert.equal(seen.node('release-notes-modal').classList.contains('hidden'), false, 'history is always available');
assert.match(seen.node('release-notes-content').innerHTML, /18\.46/);
assert.match(seen.node('release-notes-content').innerHTML, /18\.45/);
assert.match(seen.node('release-notes-content').innerHTML, /Исправления/);
assert.equal(seen.node('release-notes-history').hidden, true);

const older = app({ build: 'step18.45-mobile-bells-update-2026-10-05' });
older.context.window.openReleaseHistory();
assert.doesNotMatch(older.node('release-notes-content').innerHTML, /18\.46/, 'older clients do not describe features not installed');
assert.match(older.node('release-notes-content').innerHTML, /Исправления/);

const unknown = app({ build: 'step18.999-not-described-yet' }); unknown.timers.shift()();
assert.equal(unknown.node('release-notes-modal').classList.contains('hidden'), true, 'missing notes never reuse an old release');

const blocked = app({ busy: true }); blocked.timers.shift()();
assert.equal(blocked.node('release-notes-modal').classList.contains('hidden'), true, 'prompt does not interrupt another dialog');
assert.equal(blocked.timers.length, 1);

const privateMode = app({ denied: true }); privateMode.timers.shift()();
privateMode.node('release-notes-acknowledge').handlers.click();
privateMode.events.get('visibilitychange')(); privateMode.timers.shift()();
assert.equal(privateMode.node('release-notes-modal').classList.contains('hidden'), true, 'storage denial remains usable and silent for this session');

const kz = app({ language: 'kz' }); kz.timers.shift()();
assert.equal(kz.node('release-notes-heading').textContent, 'Не жаңалық');
assert.match(kz.node('release-notes-content').innerHTML, /Орташа жаңарту/);
assert.match(kz.node('release-notes-content').innerHTML, /Жаңалықтар мен жаңартулар тарихы/);
assert.equal(kz.node('release-notes-acknowledge').textContent, 'Түсінікті');
kz.context.window.openReleaseHistory();
assert.equal(kz.node('release-notes-heading').textContent, 'Жаңартулар тарихы');
assert.match(kz.node('release-notes-content').innerHTML, /Түзетулер/);
assert.match(kz.node('release-notes-content').innerHTML, /Жаңарту түймесі және қоңырау кестесі/);
assert.match(kz.node('release-notes-content').innerHTML, /Кнопка обновления/);
assert.match(kz.node('release-notes-content').innerHTML, /Среднее обновление/);
for (const [ru, kk] of [
  ['Кнопка обновления и расписание звонков', 'Жаңарту түймесі және қоңырау кестесі'],
  ['В меню вернулась постоянная кнопка', 'Мәзірге тұрақты']
]) {
  const rendered = kz.node('release-notes-content').innerHTML;
  assert.ok(rendered.indexOf(ru) < rendered.indexOf(kk), 'Russian text precedes Kazakh text');
}
vm.runInContext(`for (const release of RELEASES) for (const key of ['fixes', 'updates']) {
  if (!release[key]) continue;
  if (release[key].ru.length !== release[key].kz.length || release[key].kz.some(text => !text)) throw new Error('Missing Kazakh release translation');
}`, kz.context);
kz.storage.set('toe_ui_language', 'ru'); kz.context.window.refreshReleaseNotes();
assert.equal(kz.node('release-notes-heading').textContent, 'История обновлений');
assert.match(kz.node('release-notes-content').innerHTML, /Исправления/);

const crossTab = app(); crossTab.timers.shift()();
crossTab.events.get('storage')({ key: 'sbp_release_seen_18.46', newValue: '1' });
assert.equal(crossTab.node('release-notes-modal').classList.contains('hidden'), true);

const keyboard = app(); keyboard.timers.shift()();
let prevented = false;
keyboard.events.get('keydown')({ key: 'Tab', shiftKey: false, preventDefault() { prevented = true; } });
assert.equal(prevented, true, 'keyboard focus stays in the dialog');
assert.equal(keyboard.document.activeElement, keyboard.node('release-notes-close'));
keyboard.events.get('keydown')({ key: 'Escape', preventDefault() {} });
assert.equal(keyboard.node('release-notes-modal').classList.contains('hidden'), true);
assert.equal(keyboard.storage.get('sbp_release_seen_18.46'), '1');
assert.equal(first.context.releaseTypeLabel({ type:'update', size:'small' }), 'Мини-обновление');
assert.equal(first.context.releaseTypeLabel({ type:'update', size:'major' }), 'Крупное обновление');
console.log('Release notes: once-per-version, history, corrections, installed-version filtering, modal deferral, storage denial, RU/KZ, cross-tab dismissal and keyboard checks passed.');
