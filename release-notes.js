import { releaseForBuild, releasesForBuild, releaseTypeLabel } from './release-data.js?v=20261010-date-overrides-v1';

const build = document.querySelector('meta[name="app-build"]')?.content;
const currentRelease = releaseForBuild(build);
const modal = document.getElementById('release-notes-modal');
const content = document.getElementById('release-notes-content');
const heading = document.getElementById('release-notes-heading');
const acknowledge = document.getElementById('release-notes-acknowledge');
const historyButton = document.getElementById('release-notes-history');
const closeButton = document.getElementById('release-notes-close');
const menuLabel = document.getElementById('menu-release-history-label');
let historyMode = false;
let returnFocus = null;
let acknowledged = false;
let pendingTimer = null;
const lang = () => { try { return localStorage.getItem('toe_ui_language') === 'kz' ? 'kz' : 'ru'; } catch (_) { return 'ru'; } };
const t = (ru, kz) => lang() === 'kz' ? kz : ru;
const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]));
const seenKey = () => 'sbp_release_seen_' + currentRelease?.version;
function wasSeen() {
  if (acknowledged || !currentRelease) return true;
  try { return localStorage.getItem(seenKey()) === '1'; } catch (_) { return false; }
}

function releaseCard(release) {
  const language = lang();
  const date = new Intl.DateTimeFormat(language === 'kz' ? 'kk-KZ' : 'ru-RU', { day:'numeric', month:'long', year:'numeric' }).format(new Date(release.date + 'T12:00:00'));
  const groups = [
    ['updates', 'Обновления', 'Жаңартулар'],
    ['fixes', 'Исправления', 'Түзетулер']
  ].filter(([key]) => release[key]?.ru?.length).map(([key, ruLabel, kzLabel]) => {
    const items = release[key].ru.map((change, index) => `<li><span lang="ru">${escape(change)}</span><span class="release-translation" lang="kk">${escape(release[key].kz[index])}</span></li>`).join('');
    return `<section class="release-change-group"><h4><span lang="ru">${ruLabel}</span><span class="release-translation" lang="kk">${kzLabel}</span></h4><ul>${items}</ul></section>`;
  }).join('');
  return `<article class="release-card"><div class="release-card-meta"><span class="release-version">Версия / Нұсқа ${escape(release.version)}</span><time datetime="${escape(release.date)}">${escape(date)}</time></div><span class="release-type ${release.type === 'fix' ? 'is-fix' : 'is-update'}"><span lang="ru">${escape(releaseTypeLabel(release, 'ru'))}</span><span lang="kk">${escape(releaseTypeLabel(release, 'kz'))}</span></span><h3><span lang="ru">${escape(release.title.ru)}</span><span class="release-translation" lang="kk">${escape(release.title.kz)}</span></h3>${groups}</article>`;
}

window.refreshReleaseNotes = function() {
  if (!modal || !content) return;
  if (menuLabel) menuLabel.textContent = t('История обновлений', 'Жаңартулар тарихы');
  heading.textContent = historyMode ? t('История обновлений', 'Жаңартулар тарихы') : t('Что нового', 'Не жаңалық');
  closeButton.setAttribute('aria-label', t('Закрыть', 'Жабу'));
  acknowledge.textContent = t('Понятно', 'Түсінікті');
  historyButton.textContent = t('История обновлений', 'Жаңартулар тарихы');
  historyButton.hidden = historyMode;
  const releases = historyMode ? releasesForBuild(build) : (currentRelease ? [currentRelease] : []);
  content.innerHTML = releases.length ? releases.map(releaseCard).join('') : `<p class="release-empty">${t('Описание этой версии скоро появится.', 'Бұл нұсқаның сипаттамасы жақында пайда болады.')}</p>`;
};

function open(history) {
  if (!modal) return;
  const alreadyOpen = !modal.classList.contains('hidden');
  if (!alreadyOpen) returnFocus = document.activeElement;
  historyMode = history;
  window.refreshReleaseNotes();
  modal.classList.remove('hidden');
  document.body.classList.add('release-notes-open');
  content.scrollTop = 0;
  acknowledge.focus({ preventScroll: true });
}
function close() {
  if (!modal || modal.classList.contains('hidden')) return;
  acknowledged = true;
  if (currentRelease) { try { localStorage.setItem(seenKey(), '1'); } catch (_) {} }
  modal.classList.add('hidden');
  document.body.classList.remove('release-notes-open');
  if (returnFocus?.isConnected && !returnFocus.closest('.hidden')) returnFocus.focus({ preventScroll:true });
  else document.querySelector('#bottom-nav button')?.focus({ preventScroll:true });
}
window.openReleaseHistory = () => { window.closeAppMenu?.(); open(true); };
acknowledge?.addEventListener('click', close);
closeButton?.addEventListener('click', close);
historyButton?.addEventListener('click', () => open(true));
modal?.addEventListener('click', event => { if (event.target === modal) close(); });
document.addEventListener('keydown', event => {
  if (!modal || modal.classList.contains('hidden')) return;
  if (event.key === 'Escape') { event.preventDefault(); close(); }
  if (event.key === 'Tab') {
    const controls = [...modal.querySelectorAll('button')].filter(button => !button.hidden && !button.disabled);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
});

function showUnreadRelease() {
  pendingTimer = null;
  if (!modal || wasSeen() || !modal.classList.contains('hidden')) return;
  if (document.visibilityState !== 'visible') return;
  const busy = document.documentElement.classList.contains('sbp-app-launch') || [...document.querySelectorAll('.app-overlay,.bell-editor-overlay,[id$="-modal"]')].some(node => node !== modal && node.getClientRects().length);
  if (busy) { pendingTimer = setTimeout(showUnreadRelease, 1000); return; }
  open(false);
}
function schedulePrompt() {
  if (pendingTimer !== null) clearTimeout(pendingTimer);
  pendingTimer = setTimeout(showUnreadRelease, 1200);
}
window.addEventListener('storage', event => {
  if (event.key === seenKey() && event.newValue === '1') {
    acknowledged = true;
    if (!historyMode) close();
  }
  if (event.key === 'toe_ui_language') window.refreshReleaseNotes();
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') schedulePrompt(); });
window.refreshReleaseNotes();
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedulePrompt, { once:true });
else schedulePrompt();


