'use strict';
const {readFileSync,existsSync}=require('node:fs');
const {join}=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
const root=join(__dirname,'..');
const load=name=>readFileSync(join(root,name),'utf8');
function styleTag(name,media=''){
 return '<style '+(media?'media="'+media+'"':'')+' data-css="'+name+'">'+load(name)+'</style>';
}
const styles=['tailwind-local.css','style.css','desktop.css','gradients.css','responsive-fit.css',
'soft-frames.css','home-overview.css','group-banners.css','redesign.css','site-improvements.css','dark-mode.css']
.map(x=>styleTag(x,x==='desktop.css'?'(min-width: 768px)':'')).join('');
const fixture='<!doctype html><html lang="ru" data-sbp-theme="dark"><head><meta charset="utf-8">'+styles+'</head>'+
'<body class="sbp-redesign">'+
'<div id="view-home"><main class="home-ref-shell">'+
'<section id="check-home" class="home-ref-group-card"><h2>Группа</h2><span class="home-ref-student-line">19 студентов</span></section>'+
'<section id="check-current" class="home-ref-lesson-card current"><div class="home-ref-lesson-main"><strong>Физика</strong></div></section>'+
'</main></div>'+
'<div id="view-tracker"><div id="check-journal" class="journal-ref-panel"><h2>Журнал</h2>'+
'<input id="check-input" placeholder="Имя"><div class="journal-ref-row">Запись</div></div></div>'+
'<div id="view-schedule"><section class="schedule-ref-row"><div id="check-schedule" class="schedule-ref-card"><h2>Расписание</h2></div></section></div>'+
'<div id="view-roster"><section id="check-roster" class="roster-person-card"><h2>Состав</h2></section></div>'+
'<div id="view-college"><div id="check-college" class="college-card"><h2>Колледж</h2></div></div>'+
'<div class="app-overlay"><section id="check-drawer" class="app-drawer"><h2>Меню</h2></section></div>'+
'<div id="admin-settings-modal"><div id="check-settings" class="settings-reference-card"><h2>Настройки</h2>'+
'<button type="button" id="check-secondary" class="secondary">Сохранить</button></div></div>'+
'<div id="check-notification" class="notification-item"><h2>Уведомление</h2></div>'+
'<div id="check-support" class="support-msg"><span>Ответ поддержки</span></div>'+
'<div id="check-calendar" class="mini-calendar"><span>Календарь</span></div>'+
'<div class="release-notes-overlay"><div class="release-notes-sheet"><section id="check-release" class="release-card"><h2>Обновление</h2></section></div></div>'+
'<div class="sbp-banner-modal"><div id="check-banner" class="sbp-banner-dialog"><h2>Баннер</h2></div></div>'+
'<button id="check-primary" class="primary">Сохранить</button></body></html>';
function rgb(value){
 const m=String(value).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
 if(!m)throw new Error('Invalid RGB '+value);
 return [+m[1],+m[2],+m[3]];
}
function lum(rgb){
 return rgb.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4)
 .reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
}
function contrast(a,b){const [x,y]=[lum(a),lum(b)].sort((a,b)=>b-a);return (x+.05)/(y+.05);}
(async()=>{
 const executable=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium']
   .find(existsSync);
 if(!executable)throw new Error('Headless Chrome/Chromium required for theme checks');
 const browser=await chromium.launch({headless:true,executablePath:executable,
  args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  for(const width of [390,1280]){
   const page=await browser.newPage({viewport:{width,height:850}});
   await page.setContent(fixture,{waitUntil:'domcontentloaded',timeout:20000});
   const selectors=['#check-home','#check-journal','#check-schedule','#check-roster','#check-college',
    '#check-drawer','#check-settings','#check-notification','#check-support',
    '#check-calendar','#check-release','#check-banner'];
   const observed=await page.evaluate(items=>{
    const get=id=>{const el=document.querySelector(id);const style=getComputedStyle(el);
      const h=getComputedStyle(el.querySelector('h2')||el.querySelector('span')||el);
      return {background:style.backgroundColor,foreground:style.color,
        heading:h.color,headingText:(el.querySelector('h2')||el.querySelector('span'))?.textContent};};
    return Object.fromEntries(items.map(id=>[id,get(id)]));
   },selectors);
   for(const [id,x] of Object.entries(observed)){
    const bg=rgb(x.background),fg=rgb(x.heading);
    assert.ok(Math.max(...bg)<=105,'Dark '+width+' '+id+' has light background '+x.background);
    assert.ok(contrast(bg,fg)>=4.5,
     'Dark '+width+' '+id+' contrast '+contrast(bg,fg).toFixed(2)+' with '+x.heading+' / '+x.background);
   }
   const primary=await page.locator('#check-primary').evaluate(el=>{
    const css=getComputedStyle(el);return {bg:css.backgroundColor,fg:css.color};
   });
   assert.ok(contrast(rgb(primary.bg),rgb(primary.fg))>=4.5,'Primary button contrast');
   const input=await page.locator('#check-input').evaluate(el=>{
    const css=getComputedStyle(el);return {bg:css.backgroundColor,fg:css.color};
   });
   assert.ok(contrast(rgb(input.bg),rgb(input.fg))>=4.5,'Input contrast');
   await page.evaluate(()=>{document.documentElement.dataset.sbpTheme='light'});
   const lightBg=await page.locator('#check-home').evaluate(el=>getComputedStyle(el).backgroundColor);
   assert.notDeepEqual(rgb(lightBg),rgb(observed['#check-home'].background),
    'Light mode must not inherit the dark surface');
   const lightPage=await page.evaluate(()=>getComputedStyle(document.body).backgroundColor);
   assert.ok(Math.min(...rgb(lightPage))>190,'Light mode page remains light');
   console.log('PASS dark theme browser smoke, '+width+'px; '+selectors.length+' surfaces, text, button, form, light mode');
   await page.close();
  }
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
