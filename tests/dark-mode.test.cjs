'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const dark=read('dark-mode.css'), html=read('index.html');
const sw=read('notifications-sw.js'), app=read('app.js');
const redesign=read('redesign.js'), release=read('release-data.js');
const getToken=name=>dark.match(new RegExp('--sbp-'+name+':(#[0-9a-f]{6});','i'))?.[1];
function luminance(hex){
 const values=[1,3,5].map(n=>parseInt(hex.slice(n,n+2),16)/255)
 .map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4);
 return values[0]*.2126+values[1]*.7152+values[2]*.0722;
}
function contrast(a,b){const [x,y]=[luminance(a),luminance(b)].sort((x,y)=>y-x);return (x+.05)/(y+.05);}
test('new dark theme is only enabled by resolved dark setting',()=>{
 assert.match(dark,/:root\[data-sbp-theme="dark"\]/);
 assert.doesNotMatch(dark,/html:not\(\[data-sbp-theme="dark"\]\)/);
 assert.ok((dark.match(/:root:root\[data-sbp-theme="dark"\]/g)||[]).length>30);
 assert.match(html,/dark-mode\.css\?v=20261031-dark-mode-v1/);
 assert.match(sw,/dark-mode\.css\?v=20261031-dark-mode-v1/);
 assert.match(html,/step19\.09-unified-dark-mode-2026-10-31-v1/);
 assert.match(sw,/sbp-shell-20261031-dark-mode-v1/);
 assert.match(html,/redesign\.css\?v=20261031-dark-mode-v1/);
 assert.match(sw,/redesign\.css\?v=20261031-dark-mode-v1/);
 assert.match(app,/redesign\.js\?v=20261031-dark-mode-v1/);
 assert.match(sw,/redesign\.js\?v=20261031-dark-mode-v1/);
 assert.match(release,/version:'19\.09'/);
});
test('all core text colors pass WCAG AA contrast on relevant surfaces',()=>{
 const pairs=[['ink','surface'],['ink','soft'],['muted','surface'],['muted','soft'],
  ['accent','surface'],['accent','tint'],['green','green-soft'],
  ['danger','surface'],['warning','warning-soft']];
 for(const [fg,bg] of pairs){
  const a=getToken(fg), b=getToken(bg);
  assert.ok(a&&b, 'missing color '+fg+' or '+bg);
  assert.ok(contrast(a,b)>=4.5,fg+' on '+bg+' contrast '+contrast(a,b).toFixed(2));
 }
 assert.ok(contrast(getToken('accent-ink'),getToken('accent'))>=4.5);
});
test('semantic lesson colors, modal surfaces, sections and form controls are present',()=>{
 for(const x of ['#view-home','#view-tracker','#view-schedule','#view-roster','#view-college',
  '.app-drawer','.sbp-banner-dialog','.settings-reference-card','.mini-calendar',
  '.notification-item','.support-msg','.release-card','.journal-ref-panel',
  '.schedule-ref-card','.roster-person-card','.home-ref-lesson-card.current',
  '.system-status-banner[data-kind="warning"]','.system-status-banner[data-kind="error"]',
  'input:not([type="checkbox"])','input[type="checkbox"]','.sbp-theme-options button[aria-pressed="true"]'])
 assert.ok(dark.includes(x),'missing dark style for '+x);
 assert.equal((dark.match(/\{/g)||[]).length,(dark.match(/\}/g)||[]).length);
});
test('switching light, dark and system theme persists and updates accessibility state',()=>{
 const storage=new Map([['sbp_design_theme','light'],['toe_ui_language','ru']]);
 const events={},mediaEvents={};
 const mq={matches:false,addEventListener(event,fn){mediaEvents[event]=fn;}};
 const makeButton=value=>({dataset:{sbpTheme:value},attributes:{},
  getAttribute(key){return this.attributes[key]},setAttribute(key,value){this.attributes[key]=value;}});
 const buttons=['light','dark','system'].map(makeButton);
 const meta={attributes:{content:'#fafafe'},getAttribute(k){return this.attributes[k]},
  setAttribute(k,v){this.attributes[k]=v;}};
 const document={
  documentElement:{dataset:{},style:{}},
  querySelector(sel){return sel==='meta[name="theme-color"]'?meta:null},
  querySelectorAll(sel){return sel==='button[data-sbp-theme]'?buttons:[]},
  getElementById(){return null}
 };
 const window={localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
  matchMedia:()=>mq,addEventListener:(key,fn)=>events[key]=fn};
 const src=redesign.replace(/^import .*;\s*/,'').replaceAll('export ','');
 const ctx={window,document,console,encodeURIComponent};
 vm.runInNewContext(src+'\ninitRedesign();',ctx);
 assert.equal(document.documentElement.dataset.sbpTheme,'light');
 window.setSBPTheme('dark');
 assert.equal(storage.get('sbp_design_theme'),'dark');
 assert.equal(document.documentElement.dataset.sbpTheme,'dark');
 assert.equal(document.documentElement.style.colorScheme,'dark');
 assert.equal(meta.getAttribute('content'),'#0b0f18');
 assert.equal(buttons[1].getAttribute('aria-pressed'),'true');
 window.setSBPTheme('light');
 assert.equal(document.documentElement.dataset.sbpTheme,'light');
 assert.equal(buttons[0].getAttribute('aria-pressed'),'true');
 window.setSBPTheme('system');
 assert.equal(document.documentElement.dataset.sbpTheme,'light');
 mq.matches=true;mediaEvents.change();
 assert.equal(document.documentElement.dataset.sbpTheme,'dark');
 mq.matches=false;mediaEvents.change();
 assert.equal(document.documentElement.dataset.sbpTheme,'light');
 storage.set('sbp_design_theme','dark');
 events.storage({key:'sbp_design_theme'});
 assert.equal(document.documentElement.dataset.sbpTheme,'dark');
 assert.equal(buttons[1].getAttribute('aria-pressed'),'true');
});
