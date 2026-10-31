'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const root = join(__dirname, '..');
const file = name => readFileSync(join(root, name), 'utf8');
const app = file('app.js');
const html = file('index.html');
const sw = file('notifications-sw.js');
const notes = file('release-notes.js');
const releases = file('release-data.js');
const css = file('group-banners.css');

test('banner controls, styles, release metadata and PWA cache are aligned', () => {
  assert.match(html, /id="sbp-home-banner"/);
  assert.match(html, /id="sbp-group-banner"/);
  assert.match(html, /id="group-icon-roster"/);
  assert.match(html, /openBannerEditor\('home'\)/);
  assert.match(html, /openBannerEditor\('group'\)/);
  assert.match(html, /step19\.07-group-banners-2026-10-31-v1/);
  assert.match(html, /app\.js\?v=20261031-group-banners-v1/);
  assert.match(sw, /app\.js\?v=20261031-group-banners-v1/);
  assert.match(html, /group-banners\.css\?v=20261031-group-banners-v1/);
  assert.match(sw, /group-banners\.css\?v=20261031-group-banners-v1/);
  assert.match(sw, /sbp-shell-20261031-group-banners-v1/);
  assert.match(html, /release-notes\.js\?v=20261031-group-banners-v1/);
  assert.match(sw, /release-notes\.js\?v=20261031-group-banners-v1/);
  assert.match(notes, /release-data\.js\?v=20261031-group-banners-v1/);
  assert.match(sw, /release-data\.js\?v=20261031-group-banners-v1/);
  assert.match(releases, /version:'19\.07'/);
  assert.match(releases, /kz:\[/);
  assert.match(releases, /ru:\[/);
  assert.match(css, /grid-column:1 \/ -1/);
});

test('application module parses after stripping import declarations', () => {
  const source = app.replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?\s*/gm, '');
  assert.doesNotThrow(() => new Function(source));
});

test('editor respects permissions, languages and independent banner settings', async () => {
  const from = app.indexOf('        function normalizeGroupBanner(value) {');
  const to = app.indexOf('        function readLocalGroupInfo() {');
  assert.ok(from !== -1 && to > from, 'editor implementation must be present');
  const body = app.slice(from, to);
  const node = () => ({
    hidden:false, disabled:false, value:'', textContent:'', innerHTML:'', style:{},
    attrs:{}, setAttribute(key,value){ this.attrs[key]=value; },
    getAttribute(key){ return this.attrs[key]; },
    removeAttribute(key){ delete this.attrs[key]; },
    classList:{toggle(){}}
  });
  const els = {};
  for (const section of ['home','group']) {
    const image = node(), edit = node();
    els['sbp-' + section + '-banner'] = { image, edit, classList:{toggle(){}},
      querySelector(selector){ return selector === 'img' ? image : edit; } };
  }
  for (const id of ['group-icon-roster','sbp-banner-editor','sbp-banner-editor-title',
    'sbp-banner-file','sbp-banner-editor-preview','sbp-banner-position','sbp-banner-save']) els[id] = node();
  els['sbp-banner-editor-preview'].querySelector = () => node();
  let info = { homeBanner:'', groupBanner:'', homeBannerPosition:50, groupBannerPosition:50,
    groupIcon:'user-group', groupAvatar:'' };
  let allowed = true, lang = 'ru', cloud = null;
  const win = {};
  const BlobStub = class { constructor(parts){ this.size=parts.join('').length; } };
  const factory = new Function('document','window','currentLang','getGroupInfo','canEditGroupInfo',
    'normalizeLeaderAvatar','normalizeGroupIcon','saveGroupInfoLocally',
    'persistGroupInfoToCloud','showToast','Blob', body +
    '\nreturn { normalizeGroupBanner, normalizeBannerPosition, renderGroupBanners };');
  const editor = factory({getElementById: id=>els[id] || null}, win, ()=>lang, ()=>info,
    ()=>allowed, value=>value || '', value=>value || 'user-group',
    next=>{info=next;},async next=>{cloud=next;return true;},()=>{},BlobStub);
  assert.equal(editor.normalizeGroupBanner('data:image/png;base64,AAAA').length > 0, true);
  assert.equal(editor.normalizeGroupBanner('data:image/svg+xml;base64,AAAA'), '');
  assert.equal(editor.normalizeBannerPosition(150), 100);
  assert.equal(editor.normalizeBannerPosition(-50), 0);
  editor.renderGroupBanners();
  assert.equal(els['sbp-home-banner'].edit.hidden, false);
  assert.equal(els['sbp-group-banner'].edit.hidden, false);
  allowed = false;
  editor.renderGroupBanners();
  assert.equal(els['sbp-home-banner'].edit.hidden, true);
  assert.equal(els['sbp-group-banner'].edit.hidden, true);
  allowed = true;
  win.openBannerEditor('home');
  assert.equal(els['sbp-banner-editor-title'].textContent, 'Баннер главной');
  win.setBannerPosition(77);
  await win.saveBannerImage();
  assert.equal(cloud.homeBannerPosition, 77);
  assert.equal(cloud.groupBannerPosition, 50);
  lang = 'kz';
  win.openBannerEditor('group');
  assert.equal(els['sbp-banner-editor-title'].textContent, 'Топ баннері');
  win.setBannerPosition(23);
  await win.saveBannerImage();
  assert.equal(cloud.groupBannerPosition, 23);
  assert.equal(cloud.homeBannerPosition, 77);
  win.openBannerEditor('home');
  assert.equal(els['sbp-banner-editor-title'].textContent, 'Басты беттің баннері');
});
