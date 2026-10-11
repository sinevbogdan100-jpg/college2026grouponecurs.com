import { COLLEGE, COLLEGE_SOURCES } from './college-data.js?v=20261011-interface-fixes-v1';
const labels={
 ru:{college:'О колледже',theme:'Тема оформления',themeHint:'Выберите удобный внешний вид',light:'Светлая',dark:'Тёмная',system:'Как на устройстве',language:'Язык',menu:'Меню',group:'Группа',home:'Главная',settings:'Настройки',notifications:'Уведомления'},
 kz:{college:'Колледж туралы',theme:'Безендіру тақырыбы',themeHint:'Ыңғайлы көріністі таңдаңыз',light:'Ашық',dark:'Қараңғы',system:'Құрылғыдағыдай',language:'Тіл',menu:'Мәзір',group:'Топ',home:'Басты бет',settings:'Баптаулар',notifications:'Хабарландырулар'}
};
export function resolvedTheme(value,systemDark=false){return value==='dark'||(value==='system'&&systemDark)?'dark':'light';}
export function redesignLabels(lang='ru'){return labels[lang==='kz'?'kz':'ru'];}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const link=(url,label)=>`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} <span aria-hidden="true">↗</span></a>`;
export function collegeMarkup(lang='ru'){
 const w=COLLEGE[lang==='kz'?'kz':'ru'];
 const head=(icon,title)=>`<div class="college-card-head"><span class="college-icon"><i class="fa-solid ${icon}" aria-hidden="true"></i></span><h2>${esc(title)}</h2></div>`;
 return `<header class="college-hero"><div><p class="sbp-eyebrow">${esc(w.eyebrow)}</p><h1>${esc(w.title)}</h1><p class="college-intro">${esc(w.intro)}</p><span class="college-city"><i class="fa-solid fa-location-dot" aria-hidden="true"></i>${esc(w.city)}</span></div><img src="college-illustration.svg" alt="" width="320" height="240"></header>
 <nav class="college-quick" aria-label="${esc(w.eyebrow)}">${w.quick.map((name,i)=>`<a href="#college-${['history','programs','team','life','admission','contacts'][i]}">${esc(name)}</a>`).join('')}</nav>
 <div class="college-grid">
 <section class="college-card" id="college-history">${head('fa-book-open',w.history)}<p>${esc(w.historyIntro)}</p><ol class="college-timeline">${w.milestones.map(([year,text])=>`<li><strong>${esc(year)}</strong><span>${esc(text)}</span></li>`).join('')}</ol><p>${esc(w.mission)}</p><div class="college-links">${link(COLLEGE_SOURCES.history,w.source)}${link(COLLEGE_SOURCES.mission,w.history)}</div></section>
 <section class="college-card" id="college-programs">${head('fa-compass-drafting',w.programs)}<p>${esc(w.programsIntro)}</p><div class="college-specialties">${w.specialties.map(([title,text],i)=>`<details><summary><span class="college-count">${i+1}</span><strong>${esc(title)}</strong><span class="college-expand" aria-hidden="true">+</span></summary><p>${esc(text)}</p></details>`).join('')}</div><div class="college-links">${link(COLLEGE_SOURCES.programs,w.programLink)}</div></section>
 <section class="college-card" id="college-team">${head('fa-user-group',w.team)}<p>${esc(w.teamIntro)}</p><div class="college-leaders">${w.leaders.map(([name,role])=>`<div><span class="college-avatar" aria-hidden="true">${esc(name[0])}</span><div><small>${esc(role)}</small><strong>${esc(name)}</strong></div></div>`).join('')}</div><div class="college-links">${link(COLLEGE_SOURCES.team,w.teamLink)}</div></section>
 <section class="college-card" id="college-life">${head('fa-graduation-cap',w.life)}<p>${esc(w.lifeIntro)}</p><div class="college-life">${w.lifeItems.map(([title,text])=>`<div><h3>${esc(title)}</h3><p>${esc(text)}</p></div>`).join('')}</div><div class="college-links">${link(COLLEGE_SOURCES.life,w.lifeLink)}${link(COLLEGE_SOURCES.sport,w.sportLink)}</div></section>
 <section class="college-card college-wide" id="college-admission">${head('fa-door-open',w.admission)}<p>${esc(w.admissionIntro)}</p><p>${esc(w.documents)}</p><p>${esc(w.admissionPeople)}</p><div class="college-links">${link(COLLEGE_SOURCES.admission,w.admissionLink)}</div></section>
 <section class="college-card college-wide" id="college-contacts">${head('fa-phone',w.contacts)}<div class="college-contact-grid"><div><small>${esc(w.addressLabel)}</small><strong>${esc(w.address)}</strong>${link('https://www.google.com/maps/search/?api=1&query='+encodeURIComponent('Павлодар Олжабай Батыра 43А'),w.map)}</div><div><small>${esc(w.phoneLabel)}</small><a href="tel:+77182554572">+7 (7182) 55-45-72</a><small>${esc(w.services)}</small><a href="tel:+77182554690">+7 (7182) 55-46-90</a></div><div><small>${esc(w.emailLabel)}</small><a href="mailto:pmk-kolledg.kz@yandex.kz">pmk-kolledg.kz@yandex.kz</a>${link(COLLEGE_SOURCES.home,w.official)}</div></div></section>
 </div><footer class="college-footnote"><p>${esc(w.checked)}</p><p>${esc(w.note)}</p></footer>`;
}
export function initRedesign(){
 const read=(key,fallback)=>{try{return window.localStorage.getItem(key)||fallback;}catch(_){return fallback;}};
 const lang=()=>read('toe_ui_language','ru')==='kz'?'kz':'ru';
 const query=window.matchMedia?.('(prefers-color-scheme: dark)');
 let selected=read('sbp_design_theme','light');
 if(!['light','dark','system'].includes(selected))selected='light';
 const choice=()=>selected;
 function applyTheme(){
  const theme=resolvedTheme(choice(),query?.matches);document.documentElement.dataset.sbpTheme=theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='dark'?'#13151e':'#fafafe');
  document.querySelectorAll('button[data-sbp-theme]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.sbpTheme===choice())));
 }
 function refresh(){
  const w=redesignLabels(lang());document.querySelectorAll('[data-sbp-text]').forEach(n=>{if(w[n.dataset.sbpText])n.textContent=w[n.dataset.sbpText];});
  document.querySelectorAll('[data-sbp-aria]').forEach(n=>{if(w[n.dataset.sbpAria])n.setAttribute('aria-label',w[n.dataset.sbpAria]);});
  document.querySelectorAll('[data-sbp-lang]').forEach(n=>{n.setAttribute('aria-pressed',String(n.dataset.sbpLang===lang()));});
  document.querySelectorAll('.sbp-language').forEach(n=>n.setAttribute('aria-label',w.language));
  const host=document.getElementById('college-content');
  if(host){const opened=[...host.querySelectorAll('details')].map((n,i)=>n.open?i:-1).filter(i=>i>=0);host.innerHTML=collegeMarkup(lang());opened.forEach(i=>{const n=host.querySelectorAll('details')[i];if(n)n.open=true;});}
  applyTheme();
 }
 window.setSBPTheme=value=>{if(!['light','dark','system'].includes(value))return;selected=value;try{window.localStorage.setItem('sbp_design_theme',value);}catch(_){}applyTheme();};
 window.refreshRedesign=refresh;
 document.querySelectorAll('button[data-sbp-theme]').forEach(b=>b.addEventListener('click',()=>window.setSBPTheme(b.dataset.sbpTheme)));
 document.querySelectorAll('[data-sbp-lang]').forEach(b=>b.addEventListener('click',()=>window.setInterfaceLanguage(b.dataset.sbpLang)));
 if(query?.addEventListener)query.addEventListener('change',applyTheme);else query?.addListener?.(applyTheme);
 window.addEventListener?.('storage',event=>{if(event.key!=='sbp_design_theme'&&event.key!==null)return;selected=read('sbp_design_theme','light');if(!['light','dark','system'].includes(selected))selected='light';applyTheme();});refresh();
}
