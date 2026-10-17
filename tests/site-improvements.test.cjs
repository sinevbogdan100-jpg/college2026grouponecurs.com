const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const moduleFrom = source => import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

// A small DOM fixture for event, portal and focus behavior. Layout is not mocked
// as a browser result: real-device rendering remains a separate verification.
function domFixture() {
    let document;
    const camel = text => text.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    class Element {
        constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.attributes = new Map(); this.dataset = {}; this.events = new Map(); this._text = ''; this.open = false; }
        get id() { return this.attributes.get('id') || ''; }
        set id(value) { this.setAttribute('id', value); }
        get hidden() { return this.attributes.has('hidden'); }
        set hidden(value) { value ? this.attributes.set('hidden', '') : this.attributes.delete('hidden'); }
        get disabled() { return this.attributes.has('disabled'); }
        set disabled(value) { value ? this.attributes.set('disabled', '') : this.attributes.delete('disabled'); }
        get classList() {
            const values = () => new Set((this.attributes.get('class') || '').split(/\s+/).filter(Boolean));
            const set = data => this.attributes.set('class', [...data].join(' '));
            return {contains:name => values().has(name), add:(...names) => { const v=values();names.forEach(n=>v.add(n));set(v); }, remove:(...names) => {const v=values();names.forEach(n=>v.delete(n));set(v);}, toggle:(name, force) => {const v=values();const yes=force===undefined?!v.has(name):force;yes?v.add(name):v.delete(name);set(v);return yes;}};
        }
        setAttribute(name, value) { this.attributes.set(name, String(value)); if (name.startsWith('data-')) this.dataset[camel(name.slice(5))] = String(value); }
        getAttribute(name) { return this.attributes.get(name) ?? null; }
        get isConnected() { return document.body === this || !!this.parentNode?.isConnected; }
        get parentElement() { return this.parentNode; }
        appendChild(node) { node.remove(); this.children.push(node); node.parentNode = this; return node; }
        before(node) { const p=this.parentNode;node.remove();p.children.splice(p.children.indexOf(this),0,node);node.parentNode=p; }
        after(node) { const p=this.parentNode;node.remove();p.children.splice(p.children.indexOf(this)+1,0,node);node.parentNode=p; }
        remove() { if(this.parentNode){const p=this.parentNode;p.children.splice(p.children.indexOf(this),1);this.parentNode=null;} }
        replaceChildren(...nodes) { this.children.forEach(node=>{node.parentNode=null;});this.children=[];this._text='';nodes.forEach(node=>this.appendChild(node)); }
        contains(node) { return this===node || this.children.some(child=>child.contains(node)); }
        matches(selector) {
            let s=selector.trim(); if(!s)return false;
            const not=s.match(/:not\(([^)]+)\)/);if(not){if(this.matches(not[1]))return false;s=s.replace(not[0],'');}
            const tag=s.match(/^[a-zA-Z][\w-]*/);if(tag&&this.tagName!==tag[0].toUpperCase())return false;
            const id=s.match(/#([\w-]+)/);if(id&&this.id!==id[1])return false;
            for(const [,name] of s.matchAll(/\.([\w-]+)/g))if(!this.classList.contains(name))return false;
            for(const [,name,value] of s.matchAll(/\[([^=\]]+)(?:="([^"]*)")?\]/g))if(!this.attributes.has(name)||(value!==undefined&&this.attributes.get(name)!==value))return false;
            return true;
        }
        querySelectorAll(selector) { const selectors=selector.split(',');const list=[];const walk=node=>node.children.forEach(child=>{if(selectors.some(s=>child.matches(s)))list.push(child);walk(child);});walk(this);return list; }
        querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
        closest(selector) { for(let n=this;n;n=n.parentNode)if(selector.split(',').some(s=>n.matches(s)))return n;return null; }
        set innerHTML(html) {
            this.replaceChildren();this._html=html;const stack=[this];
            for(const token of html.match(/<[^>]*>|[^<]+/g)||[]) {
                if(token.startsWith('</')){stack.pop();continue;}
                if(token.startsWith('<')) {
                    const match=token.match(/^<([\w-]+)/);if(!match)continue;const node=new Element(match[1]);
                    for(const [,name,value] of token.slice(match[0].length,-1).matchAll(/([\w-]+)(?:="([^"]*)")?/g))node.setAttribute(name,value??'');
                    stack.at(-1).appendChild(node);
                    if(!['INPUT','IMG','BR','HR','META','LINK'].includes(node.tagName)&&!token.endsWith('/>'))stack.push(node);
                } else stack.at(-1)._text += token;
            }
        }
        get innerHTML() { return this._html || ''; }
        get textContent() { return this._text + this.children.map(node=>node.textContent).join(''); }
        set textContent(text) { this.replaceChildren();this._text=String(text); }
        addEventListener(type, callback, capture=false) {const list=this.events.get(type)||[];list.push({callback,capture});this.events.set(type,list);}
        fire(type, props={}) {
            const event={target:this,key:'',button:0,isPrimary:true,clientX:100,clientY:100,pointerId:1,preventDefault(){this.defaultPrevented=true;},stopImmediatePropagation(){this.stopped=true;},...props};
            const ancestors=[];for(let n=this;n;n=n.parentNode)ancestors.push(n);
            for(const node of [...ancestors].reverse())for(const listener of node.events.get(type)||[])if(listener.capture&&!event.stopped)listener.callback(event);
            for(const node of ancestors)for(const listener of node.events.get(type)||[])if(!listener.capture&&!event.stopped)listener.callback(event);
            return event;
        }
        focus() { document.activeElement=this; }
        getClientRects() { return this.closest('[hidden],.hidden') ? [] : [{}]; }
        setPointerCapture() {}
        scrollIntoView() {}
    }
    const body=new Element('body');
    const events=new Map();document={body,activeElement:body,visibilityState:'visible',createElement:tag=>new Element(tag),createComment:()=>new Element('comment'),getElementById:id=>body.querySelector('#'+id),addEventListener(type,cb){const arr=events.get(type)||[];arr.push(cb);events.set(type,arr);},fire(type,props){for(const cb of events.get(type)||[])cb(props);}};
    const parent=document.createElement('main');body.appendChild(parent);
    for(const id of ['settings-admins-section','schedule-edit-scope-box','schedule-pause-manage-btn','schedule-add-btn','schedule-bell-btn','journal-edit-tools','roster-admin-tools','settings-group-section','admin-panel','settings-backups-section','settings-logout']){
        const node=document.createElement(id.startsWith('settings-')?'details':'div');node.id=id;parent.appendChild(node);
    }
    const menu=document.createElement('div');menu.id='app-menu-drawer';body.appendChild(menu);
    const support=document.createElement('button');support.id='menu-support-button';menu.appendChild(support);
    return {document,Element,parent};
}

async function main() {
    const summary=await moduleFrom(read('schedule-summary.js'));
    const base=[
        {time:'08:00 - 09:30',subject:'Физика',room:'Каб. 301',teacher:'Урунбаева Б.Т.'},
        {time:'09:40 - 11:10',subject:'Математика',room:'Каб. 505',teacher:'Жанкаринова Г.Т.'},
        {time:'11:30 - 13:00',subject:'История Казахстана',room:'Каб. 503',teacher:'Негманова Г.Б.'}
    ];
    assert.equal(summary.nextCalendarDay(new Date(2026,11,31,23,59)).getFullYear(),2027);
    assert.equal(summary.nextCalendarDay(new Date(2026,9,16,23)).getDay(),6,'tomorrow stays Saturday rather than skipping to Monday');
    assert.deepEqual(summary.summarizeScheduleChanges(base,structuredClone(base)),[]);
    const actual=structuredClone(base);actual[1]={...actual[1],subject:'Русский язык',room:'Каб. 508',teacher:'Магауина А.Т.',changeType:'subject',originalSubject:'Математика'};actual[2].cancelled=true;
    const saved=JSON.stringify({base,actual}),changes=summary.summarizeScheduleChanges(base,actual);
    assert.equal(JSON.stringify({base,actual}),saved,'rendering cannot rewrite schedule or people');
    assert.deepEqual(changes.map(x=>[x.number,x.kind]),[[2,'changed'],[3,'cancel']]);
    assert.deepEqual(changes[0].fields,['subject','room','teacher']);
    for(const lang of ['ru','kz']){
        const markup=summary.scheduleSummaryMarkup(changes,'15 октября',lang);
        assert.ok(markup.includes(lang==='ru'?'Изменения на завтра':'Ертеңгі өзгерістер'));
        assert.ok(markup.includes('508'));assert.ok(markup.includes('Магауина А.Т.'));
        assert.ok(markup.includes(lang==='ru'?'отменена':'болмайды'));
    }
    assert.equal(summary.scheduleSummaryMarkup([], '', 'ru'),'');
    const removed=summary.summarizeScheduleChanges(base,[base[0],base[2]]);assert.equal(removed.length,1);assert.equal(removed[0].number,2);assert.equal(removed[0].kind,'cancel');
    const room=structuredClone(base);room[0].room='Зал';assert.deepEqual(summary.summarizeScheduleChanges(base,room)[0].fields,['room']);
    const bells=structuredClone(base);bells.forEach(item=>{item.originalTime=item.time;item.time='10:00 - 11:00';});assert.equal(summary.summarizeScheduleChanges(base,bells).length,3);
    const unsafe=structuredClone(actual);unsafe[1].subject='<img src=x onerror=alert(1)>';
    assert.ok(!summary.scheduleSummaryMarkup(summary.summarizeScheduleChanges(base,unsafe),'', 'ru').includes('<img'));

    // Check the real stateful schedule module, including exact-date and pause selection.
    const pure=await moduleFrom(read('schedule-dates.js'));
    const noNodeDoc={getElementById:()=>null,addEventListener(){},querySelectorAll:()=>[],body:{classList:{add(){},remove(){}}}};
    const scheduleContext={...pure,Date,console,Math,JSON,Object,Array,String,Number,Set,Map,Promise,document:noNodeDoc,navigator:{onLine:true},localStorage:{getItem:()=>null,setItem(){}},sessionStorage:{getItem:()=>null},window:{addEventListener(){},dispatchEvent(){},setInterval(){return 1;}},setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},interfaceLocale:()=> 'ru-RU',translateUI:v=>v,getWeekTypeForDate:()=> 'numerator'};
    vm.createContext(scheduleContext);
    vm.runInContext(read('schedule.js').replace(/^import .*;\n/gm,'').replaceAll('export ','')+'\nglobalThis.api={installSchedulePayload,getScheduleChangeSource,getScheduleAdminSnapshot};',scheduleContext);
    const api=scheduleContext.api;
    const payload={scheduleSchemaVersion:2,numerator:{thu:base},denominator:{thu:base},dateOverrides:{'2026-10-15':{weekType:'numerator',lessons:actual}}};
    api.installSchedulePayload(payload);
    assert.ok(api.getScheduleChangeSource(new Date(2026,9,15),'numerator'));
    assert.equal(api.getScheduleChangeSource(new Date(2026,9,15),'denominator'),null);
    assert.equal(api.getScheduleChangeSource(new Date(2026,9,22),'numerator'),null);
    assert.equal(api.getScheduleChangeSource(new Date(2026,9,17),'numerator'),null);
    api.installSchedulePayload({...payload,pause:{enabled:true,type:'vacation',startDate:'2026-10-15',endDate:'2026-10-16'}});
    assert.equal(api.getScheduleChangeSource(new Date(2026,9,15),'numerator'),null,'vacation hides tomorrow changes without deleting them');

    const fixture=domFixture();const {document}=fixture;
    const context={document,window:{addEventListener(){}},console,Set,Map,Array,Object,Number,String,JSON,Math};
    vm.createContext(context);vm.runInContext(read('admin-drawer.js').replaceAll('export ','')+'\nglobalThis.init=initAdminDrawer;',context);
    let state={role:'viewer',schedule:true,journal:true,students:true,groupInfo:true,backups:true,notifications:true},lang='ru',edited=-1,opened=0;
    const drawer=context.init({access:()=>state,language:()=>lang,snapshot:()=>({date:new Date(2026,9,15),weekType:'numerator',scope:'date',lessons:base}),formatDate:()=> '15.10.2026',actions:{editLesson:index=>{edited=index;},openSchedule:()=>{opened++;}}});
    assert.equal(document.getElementById('sbp-admin-edge'),null,'a viewer has no sidebar target even with forged permission flags');
    assert.equal(document.getElementById('menu-admin-drawer-button'),null,'a viewer has no alternative entry');
    assert.equal(drawer.open(),false);
    state={...state,role:'admin',journal:false,backups:false};drawer.refresh();
    const trigger=document.getElementById('sbp-admin-edge'),overlay=document.getElementById('sbp-admin-drawer');
    const menuButton=document.getElementById('menu-admin-drawer-button');
    assert.ok(menuButton,'an authenticated admin has an alternative entry in the menu');
    assert.ok(trigger);assert.ok(document.getElementById('sbp-admin-journal').hidden);
    assert.equal(document.getElementById('schedule-add-btn').parentNode.id,'sbp-admin-schedule-tools','existing controls are moved, not duplicated');
    assert.equal(trigger.tagName,'BUTTON','native button supports keyboard activation');
    assert.equal(trigger.type,'button');
    assert.equal(trigger.getAttribute('aria-label'),'Открыть панель администратора');
    trigger.focus();trigger.fire('click',{detail:1,pointerType:'mouse'});
    assert.equal(overlay.hidden,false,'one mouse click opens immediately without a timer');
    document.fire('keydown',{key:'Escape',preventDefault(){}});assert.equal(overlay.hidden,true);assert.equal(document.activeElement,trigger);
    trigger.fire('pointerdown',{pointerType:'touch'});trigger.fire('pointerup',{pointerType:'touch'});
    trigger.fire('click',{detail:1,pointerType:'touch'});assert.equal(overlay.hidden,false,'one touch activation opens immediately');drawer.close();
    trigger.fire('click',{detail:0});assert.equal(overlay.hidden,false,'keyboard and assistive button activation remain available');
    lang='kz';drawer.refresh();assert.equal(document.getElementById('sbp-admin-title').textContent,'Әкімші панелі');
    assert.equal(trigger.getAttribute('aria-label'),'Әкімші панелін ашу');
    assert.equal(trigger.getAttribute('title'),'Әкімші панелін ашу');
    assert.equal(menuButton.querySelector('span').textContent,'Әкімші панелі','open interface changes language together with the menu entry');
    const edit=overlay.querySelector('[data-lesson-action="edit"]');edit.fire('click');assert.equal(edited,0);assert.equal(overlay.hidden,true);
    drawer.open();const action=overlay.querySelector('[data-admin-action="openSchedule"]');
    state.schedule=false;action.fire('click');assert.equal(opened,0,'click rechecks permissions after a revocation');
    state.role='viewer';drawer.refresh();assert.equal(overlay.hidden,true);assert.equal(document.getElementById('sbp-admin-edge'),null);
    assert.equal(document.getElementById('schedule-add-btn').parentNode,fixture.parent,'logout restores the original DOM');
    assert.ok(!document.getElementById('settings-admins-section').classList.contains('hidden'),'login remains reachable');
    assert.equal(document.getElementById('menu-admin-drawer-button'),null,'logout removes the menu entry');
    menuButton.fire('click');assert.equal(overlay.hidden,true,'a stale menu button cannot grant access after logout');
    state={...state,role:'owner',schedule:true,journal:true,backups:true};drawer.refresh();assert.equal(document.getElementById('sbp-admin-role').textContent,'Иесі');
    const ownerMenuButton=document.getElementById('menu-admin-drawer-button');ownerMenuButton.fire('click');assert.equal(overlay.hidden,false,'the owner can open the drawer from the menu');drawer.close();
    const lastTrigger=document.getElementById('sbp-admin-edge');lastTrigger.fire('click',{detail:1});assert.equal(overlay.hidden,false,'one click also opens for the owner');drawer.close();
    state.role='viewer';lastTrigger.fire('click',{detail:1});assert.equal(overlay.hidden,true,'a stale edge button cannot grant access after role revocation');
    assert.deepEqual(Object.keys(summary.summaryLabels('ru')).sort(),Object.keys(summary.summaryLabels('kz')).sort());
    console.log('Site improvements passed: real-date summaries, RU/KZ, authenticated roles, owner/admin menu access, immediate mouse/touch activation, native button semantics, assistive/keyboard activation, permission revocation and logout restoration.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
