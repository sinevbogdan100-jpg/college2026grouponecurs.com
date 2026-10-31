'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const files=['tailwind-local.css','style.css','desktop.css','gradients.css',
 'responsive-fit.css','soft-frames.css','home-overview.css','group-banners.css',
 'redesign.css','site-improvements.css','dark-mode.css','compact-layout.css'];
const styles=files.map(f=>'<style'+(f==='desktop.css'?' media="(min-width: 768px)"':'')+'>'+read(f)+'</style>').join('');
const names={
 home:['home-ref-topbar','home-ref-topbtn','home-ref-page-title','Главная'],
 tracker:['journal-ref-topbar','journal-ref-topbtn','journal-ref-title','Журнал'],
 schedule:['schedule-ref-topbar','schedule-ref-topbtn','schedule-ref-title','Расписание'],
 roster:['roster-ref-topbar','roster-ref-topbtn','roster-ref-title','Группа'],
 college:['college-topbar','','','О колледже']
};
const cover=(where)=>where==='home'
  ? '<main class="home-ref-shell"><section id="sbp-home-banner" class="sbp-cover-banner"><img hidden alt=""><button class="sbp-banner-edit" type="button">Редактировать</button></section><section class="home-ref-group-card" id="first-content"><strong>ТОЭ-26-9-1</strong></section></main>'
  : where==='roster'
    ? '<section id="sbp-group-banner" class="sbp-cover-banner sbp-roster-cover"><img hidden alt=""><button class="sbp-banner-edit" type="button">Редактировать</button></section><button class="sbp-roster-icon" id="group-icon-roster" type="button">Г</button><section class="roster-person-card" id="first-content">Участники</section>'
    : '<section id="first-content">Проверка первого блока</section>';
function fixture(where,theme){
 const [bar,btn,title,label]=names[where];
 const menu='<button class="'+btn+'" type="button" aria-label="Меню">☰</button>';
 const bell='<button class="'+btn+' notification-bell" type="button" aria-label="Уведомления">♧</button>';
 const center=where==='home'?'<div class="'+title+'">'+label+'</div>'
   :where==='college'?'<h1>'+label+'</h1>'
   :'<div class="'+title+'"><h1>'+label+'</h1></div>';
 const header=where==='college'?'<div class="'+bar+'"><button type="button">☰</button>'+center+'<button type="button">♧</button></div>'
   :'<div class="'+bar+'">'+menu+center+bell+'</div>';
 return '<!doctype html><html lang="ru" data-sbp-theme="'+theme+'"><head><meta name="viewport" content="width=device-width,initial-scale=1">'+
 styles+'</head><body class="sbp-redesign"><header class="sbp-brandbar" data-i18n-skip><div class="sbp-language" aria-label="Язык">'+
 '<button data-sbp-lang="ru" aria-pressed="true">РУ</button><button data-sbp-lang="kz" aria-pressed="false">КЗ</button></div></header>'+
 '<div id="view-'+where+'" class="'+(where==='roster'?'roster-reference-page flex flex-col':'')+'">'+header+cover(where)+'</div>'+
 '<nav id="bottom-nav"></nav></body></html>';
}
const box=locator=>locator.boundingBox();
(async()=>{
 const executable=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(fs.existsSync);
 if(!executable)throw new Error('Headless Chrome is required');
 const browser=await chromium.launch({headless:true,executablePath:executable,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  for(const width of [320,390,1280]){
   for(const where of Object.keys(names)){
    for(const theme of width===390&&['home','roster'].includes(where)?['light','dark']:['light']){
     const page=await browser.newPage({viewport:{width,height:840}});
     try{
      await page.setContent(fixture(where,theme),{waitUntil:'domcontentloaded',timeout:20000});
      const menu=await box(page.locator('.'+names[where][0]+' > :first-child'));
      const title=await box(page.locator('.'+names[where][0]+' > :nth-child(2)'));
      const bell=await box(page.locator('.'+names[where][0]+' > :nth-child(3)'));
      const language=await box(page.locator('.sbp-language'));
      const first=await box(page.locator('#first-content'));
      assert.ok(menu&&title&&bell&&language&&first,'visible section controls '+where);
      assert.ok(menu.y<45,'menu should be high in viewport '+where+'/'+width);
      assert.ok(language.y<45,'language should be high in viewport '+where+'/'+width);
      assert.ok(menu.x+menu.width<=title.x+2,'menu does not overlap title '+where+'/'+width);
      assert.ok(title.x+title.width<=bell.x+2,'title does not overlap bell '+where+'/'+width);
      assert.ok(bell.x+bell.width<=language.x+4,'bell does not overlap language '+where+'/'+width);
      assert.ok(first.y < 180,'first content is pulled up '+where+'/'+width);
      const scrollWidth=await page.evaluate(()=>document.documentElement.scrollWidth);
      assert.ok(scrollWidth<=width+2,'no horizontal overflow '+where+'/'+width+' '+scrollWidth);
      if(where==='home'||where==='roster'){
       const banner=await box(page.locator(where==='home'?'#sbp-home-banner':'#sbp-group-banner'));
       assert.ok(banner&&first.y<banner.y+banner.height,'banner behind content without an extra row');
       const state=await page.locator('.sbp-banner-edit').evaluate(el=>getComputedStyle(el).pointerEvents);
       assert.equal(state,'auto','editor is interactive');
      }
      console.log('PASS compact layout',where,theme,width);
     } finally { await page.close(); }
    }
   }
  }
 }finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
