import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CHANGELOG_URL} from '../support.js';
import {openPopup,flush} from './popup-page.js';
const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');

// The worker's status reply for the popup's own window (7), whose active tab is
// a web page.
const tab=(props={})=>({id:100,title:'Flights to Hobart',url:'https://flights.example/search',protected:false,protectable:true,...props});
const reply=(props={})=>({enabled:true,parkingTabs:0,protectedTabs:0,currentTab:tab(),windows:[{id:7,parked:false,sleeping:0}],...props});

// The popup page (see popup-page.js), with the worker's replies set by each test.
const popup=(t,{status=()=>reply(),answer={},local={},current={id:7,focused:false}}={})=>openPopup(t,{local,
 getCurrent:async()=>{if(current instanceof Error)throw current;return structuredClone(current);},
 send:async msg=>{
  const custom=answer[msg.type];
  try{const data=custom?await custom(msg):msg.type==='status'?await status(msg):{};return {ok:true,data:structuredClone(data)};}
  catch(error){return {ok:false,error:error.message};}
 }});
const shown=p=>({title:p.el('confirmTitle').textContent,text:p.el('confirmText').textContent});
// Long enough for Chrome (and popup-page.js) to drop focus from a disabled button.
const later=()=>new Promise(resolve=>setTimeout(resolve,20));

test('Protect follows the popup’s own window: windowId goes with every status request, and no focused window after an action changes nothing',async t=>{
 // As in Chrome while the popup has focus: no browser window reports focus, so the old focus rule finds no tab.
 let protectedNow=false;
 const p=await popup(t,{status:msg=>reply({currentTab:msg.windowId===7?tab({protected:protectedNow}):null}),
  answer:{settings:async()=>({enabled:true}),configure:async()=>({}),protect:async msg=>{protectedNow=msg.protected;return {protected:msg.protected};}}});
 const protect=p.el('protect');
 assert.equal(protect.disabled,false);assert.equal(p.el('protectLabel').textContent,'Protect this tab');
 assert.equal(p.el('tabTitle').textContent,'Flights to Hobart');assert.equal(p.el('tabTitle').title,'Flights to Hobart','the full title on hover');
 assert.equal(p.el('tabIcon').src,`/_favicon/?pageUrl=${encodeURIComponent('https://flights.example/search')}&size=32`);
 // Pause, then Protect, Unprotect and Protect again, without reopening the popup.
 await p.el('toggle').fire('click');
 assert.equal(protect.disabled,false,'still offered after Pause');
 for(const expected of [true,false,true]){
  await protect.fire('click');
  assert.equal(p.el('protectLabel').textContent,expected?'Unprotect this tab':'Protect this tab');assert.equal(protect.disabled,false);
 }
 await p.tabEvent();
 const statuses=p.sent('status');assert.equal(statuses.length,6,'opening, Pause, three clicks and a tab event');
 assert(statuses.every(m=>m.windowId===7),'every status request names the popup’s window');
 assert.deepEqual(p.sent('protect').map(m=>[m.tabId,m.protected]),[[100,true],[100,false],[100,true]]);
});

test('Protect is offered only for a web page; the note says why, and describes the button only while it shows',async t=>{
 let current=tab({title:'New Tab',url:'chrome://newtab/',protectable:false});
 const p=await popup(t,{status:()=>reply({currentTab:current})});
 const protect=p.el('protect'),note=p.el('protectNote');
 assert(protect.disabled);assert.equal(note.hidden,false);assert.equal(protect.getAttribute('aria-describedby'),'protectNote');
 assert.equal(protect.title,'Only web pages can be protected.');assert(p.el('thisTab').classes.has('unavailable'));
 await protect.fire('click');assert.equal(p.sent('protect').length,0);
 current=tab();await p.tabEvent();
 assert.equal(protect.disabled,false);assert(note.hidden);assert.equal(protect.getAttribute('aria-describedby'),null,'a hidden note is not read out');
 assert.equal(protect.title,'Protection lasts until Chrome closes.');assert(!p.el('thisTab').classes.has('unavailable'));
 // No tab at all (a window with nothing selected): nothing named, nothing offered.
 current=null;await p.tabEvent();assert(protect.disabled);assert.equal(p.el('tabTitle').textContent,'');assert.equal(p.el('tabIcon').src,undefined);
});

test('a status request that fails is reported and Protect isn’t offered; the next good refresh puts it right',async t=>{
 let fail=false;const p=await popup(t,{status:()=>{if(fail)throw new Error('Chrome is busy.');return reply();}});
 const protect=p.el('protect');assert.equal(protect.disabled,false);
 fail=true;await p.el('toggle').fire('click');
 assert(protect.disabled,'a tab that couldn’t be checked isn’t offered');
 assert.equal(p.el('status').textContent,'Chrome is busy.');assert(p.el('status').classes.has('error'));
 assert.equal(p.el('protectNote').hidden,true,'no misleading note');
 fail=false;await p.tabEvent();assert.equal(protect.disabled,false);
 // Without its window, the popup can't name a tab either.
 const q=await popup(t,{current:new Error('No current window')});
 assert(q.el('protect').disabled);assert.equal(q.el('status').textContent,'No current window');assert.equal(q.sent('status').length,0);
});

test('one request per double click, and a slow older status reply never overwrites a newer one',async t=>{
 let release,calls=0;
 const p=await popup(t,{status:async()=>{calls++;if(calls===2){await new Promise(resolve=>{release=resolve;});return reply({enabled:false});}return reply({parkingTabs:calls});},
  answer:{settings:async()=>({enabled:true}),configure:async()=>({})}});
 const first=p.el('toggle').fire('click');await flush();await p.el('toggle').fire('click');
 assert.equal(p.sent('configure').length,1,'the second click is ignored while the first works');
 await p.tabEvent(); // a newer refresh answers first
 release();await first;
 assert.equal(p.el('mode').textContent,'Parking on','the older reply is ignored');
});

test('counts are amber above zero, and a changed number drops in; the first fill doesn’t move',async t=>{
 let windows=[{id:7,parked:false,sleeping:2},{id:8,parked:true,sleeping:3}];
 const p=await popup(t,{status:()=>reply({parkingTabs:1,windows})});
 const parked=p.el('parkedCount'),sleeping=p.el('sleepingCount');
 assert.equal(parked.textContent,'1');assert.equal(sleeping.textContent,'5');
 assert(parked.classes.has('some'));assert.equal(parked.children[0].className,'','no animation when the popup opens');
 windows=[{id:7,parked:false,sleeping:0},{id:8,parked:false,sleeping:0}];await p.tabEvent();
 assert.equal(parked.textContent,'0');assert(!parked.classes.has('some'),'zero is plain ink');assert.equal(parked.children[0].className,'changed');
 const span=sleeping.children[0];await p.tabEvent();assert.equal(sleeping.children[0],span,'an unchanged number stays put');
 assert.match(read('ui.css'),/\.stats dd > \.changed \{ animation: count-in \.18s ease-out; \}/);
 assert.match(read('ui.css'),/@media \(prefers-reduced-motion: reduce\) \{\n  \*, ::before, ::after \{ transition: none !important; animation: none !important; \}/);
});

test('pausing: the mode says so, Resume becomes the default button, and only the pause state changes',async t=>{
 const settings={enabled:true,delayMinutes:15};let enabled=true;
 const p=await popup(t,{status:()=>reply({enabled}),answer:{settings:async()=>({...settings,enabled}),configure:async msg=>{enabled=msg.settings.enabled;return msg.settings;}}});
 assert.equal(p.el('mode').textContent,'Parking on');assert(!p.el('toggle').classes.has('default'));
 await p.el('toggle').fire('click');
 assert.deepEqual(p.sent('configure')[0],{type:'configure',settings:{enabled:false,delayMinutes:15},shown:{enabled:true,delayMinutes:15}});
 assert.equal(p.el('mode').textContent,'Parking paused');assert.equal(p.el('toggleLabel').textContent,'Resume automatic parking');
 assert(p.body.classes.has('paused'));assert(p.el('toggle').classes.has('default'));
});

test('the clearing actions start collapsed; open or closed is kept in storage.local only, and the worker is never told',async t=>{
 const p=await popup(t,{status:()=>reply({parkingTabs:1,windows:[{id:7,parked:true,sleeping:0}]})});
 const clearing=p.el('clearing');assert.equal(clearing.open,false,'collapsed on first run');
 assert.deepEqual(p.keys,[['clearingOpen','skipWarnings','whatsNew','menuNotice']]);
 const before=p.messages.length;
 clearing.open=true;await clearing.fire('toggle');assert.deepEqual(p.writes,[['set',{clearingOpen:true}]]);
 clearing.open=false;await clearing.fire('toggle');assert.deepEqual(p.writes.at(-1),['remove','clearingOpen']);
 assert.equal(p.messages.length,before,'no worker message, no configure');
 // Reopening the popup restores it, without writing it again.
 const q=await popup(t,{local:{clearingOpen:true}});
 assert.equal(q.el('clearing').open,true);await q.el('clearing').fire('toggle');assert.deepEqual(q.writes,[]);
});

test('each clearing button is disabled when it has nothing to clear, and says why',async t=>{
 const p=await popup(t);
 for(const [id,why] of [['closeParked','No windows are parked.'],['clearProtected','No tabs are protected.']]){
  assert(p.el(id).disabled,id);assert.equal(p.el(id).title,why);
  await p.el(id).fire('click');assert.equal(p.el('confirm').hidden,true,`${id}: no confirmation without targets`);
 }
 assert.deepEqual(p.messages.map(m=>m.type),['status']);
});

test('Clear parked tabs asks first, naming what really happens; Cancel and Escape change nothing and save nothing',async t=>{
 const p=await popup(t,{status:()=>reply({parkingTabs:2,windows:[{id:7,parked:true,sleeping:1},{id:8,parked:true,sleeping:4},{id:9,parked:false,sleeping:0}]})});
 p.el('clearing').open=true;await p.el('clearing').fire('toggle');p.writes.length=0;
 const button=p.el('closeParked');button.focus();await button.fire('click');
 assert.deepEqual(shown(p),{title:'Clear parked tabs in 2 windows?',
  text:'Window Parker removes its parking pages, and each window shows its previous tab again. A tab Chrome had unloaded reloads when it’s shown. None of your tabs are closed, and nothing is unloaded.'});
 assert.equal(p.el('confirm').hidden,false);assert.equal(p.el('clearingActions').hidden,true,'in place of the two buttons');
 assert.equal(p.el('confirmGo').textContent,'Clear parked tabs','the confirming button keeps the action’s name');
 assert.equal(p.focused,p.el('confirmCancel'),'Cancel is the default and has focus');assert.equal(p.el('confirmSkip').checked,false);
 // Cancel, with the box ticked: nothing is sent or saved, and focus goes back.
 p.el('confirmSkip').checked=true;await p.el('confirmCancel').fire('click');
 assert.equal(p.el('confirm').hidden,true);assert.equal(p.el('clearingActions').hidden,false);assert.equal(p.focused,button);
 // Escape does the same.
 await button.fire('click');assert.equal(p.el('confirmSkip').checked,false,'the box starts unticked each time');
 p.el('confirmSkip').checked=true;await p.keydown('Escape');
 assert.equal(p.el('confirm').hidden,true);assert.equal(p.focused,button);
 // Closing the expander closes it too, without moving focus.
 await button.fire('click');p.el('clearing').open=false;await p.el('clearing').fire('toggle');assert.equal(p.el('confirm').hidden,true);
 assert.deepEqual(p.writes,[['remove','clearingOpen']],'only the expander’s own state');assert.equal(p.sent('close-parked').length,0);
 assert.equal(p.store.skipWarnings,undefined);
});

test('the count says what will really be cleared, never “in 0 windows”',async t=>{
 const cases=[
  [2,[true],{title:'Clear parked tabs in 1 window?',text:'Window Parker removes its 2 parking pages, and the parked window shows its previous tab again.'}],
  [3,[true,true],{title:'Clear parked tabs in 2 windows?',text:'Window Parker removes its 3 parking pages, and each parked window shows its previous tab again.'}],
  [1,[true],{title:'Clear parked tabs in 1 window?',text:'Window Parker removes its parking page, and the window shows its previous tab again.'}],
  [1,[false],{title:'Clear parked tabs?',text:'No window is parked. Window Parker removes the parking page it left behind.'}],
  [2,[false,false],{title:'Clear parked tabs?',text:'No window is parked. Window Parker removes the 2 parking pages it left behind.'}]];
 for(const [parkingTabs,parked,expected] of cases){
  const p=await popup(t,{status:()=>reply({parkingTabs,windows:parked.map((on,i)=>({id:7+i,parked:on,sleeping:0}))})});
  await p.el('closeParked').fire('click');const {title,text}=shown(p);
  assert.equal(title,expected.title);assert(text.startsWith(expected.text),text);
  assert(text.endsWith('None of your tabs are closed, and nothing is unloaded.'));assert(!/\b0 windows?\b/.test(title+text));
 }
});

test('a ticked box is saved only once the action is confirmed, for that action only; the next time it runs at once and still reports',async t=>{
 let result={closed:2,remaining:0,failed:0},parkingTabs=2;
 const p=await popup(t,{status:()=>reply({parkingTabs,protectedTabs:1,windows:[{id:7,parked:parkingTabs>0,sleeping:0},{id:8,parked:parkingTabs>1,sleeping:0}]}),
  answer:{'close-parked':async()=>{if(result instanceof Error)throw result;parkingTabs=0;return result;}}});
 await p.el('closeParked').fire('click');p.el('confirmSkip').checked=true;
 await p.el('confirmGo').fire('click');
 assert.deepEqual(p.store.skipWarnings,{closeParked:true});assert.equal(p.sent('close-parked').length,1);
 assert.equal(p.el('status').textContent,'Cleared 2 parked tabs.');assert(!p.el('status').classes.has('error'));
 // The button now has nothing to clear: focus moves to the expander instead of being lost.
 assert(p.el('closeParked').disabled);assert.equal(p.focused,p.summary);
 // Clear protected tabs still asks: the two warnings are independent.
 await p.el('clearProtected').fire('click');assert.equal(p.el('confirm').hidden,false);await p.el('confirmCancel').fire('click');
 // With its warning off, Clear parked tabs runs at once, and its result and errors still show.
 parkingTabs=2;await p.tabEvent();
 result={closed:1,remaining:1,failed:1};await p.el('closeParked').fire('click');
 assert.equal(p.el('confirm').hidden,true,'no question');assert.equal(p.sent('close-parked').length,2);
 assert.equal(p.el('status').textContent,'Cleared 1 of 2 parked tabs. Try Clear parked tabs again in a moment.');assert(p.el('status').classes.has('error'));
 parkingTabs=2;await p.tabEvent();result={closed:0,remaining:2,failed:0};await p.el('closeParked').fire('click');
 assert.equal(p.el('status').textContent,'Couldn’t clear 2 parked tabs. Try again in a moment.');
 parkingTabs=2;await p.tabEvent();result=new Error('Chrome couldn’t close a parking page.');
 await p.el('closeParked').fire('click');assert.equal(p.el('status').textContent,'Chrome couldn’t close a parking page.');assert(p.el('status').classes.has('error'));
 parkingTabs=2;await p.tabEvent();result={closed:0,remaining:0,failed:0};
 await p.el('closeParked').fire('click');assert.equal(p.el('status').textContent,'No parked tabs to clear.');
 // A saved choice for one action keeps the other’s.
 const q=await popup(t,{local:{skipWarnings:{clearProtected:true}},status:()=>reply({parkingTabs:1,windows:[{id:7,parked:true,sleeping:0}]})});
 await q.el('closeParked').fire('click');q.el('confirmSkip').checked=true;await q.el('confirmGo').fire('click');
 assert.deepEqual(q.store.skipWarnings,{clearProtected:true,closeParked:true});
});

test('paused with only a leftover parking page, Clear parked tabs stays available, runs once, and the counts refresh afterwards',async t=>{
 let data=reply({enabled:false,parkingTabs:1,windows:[{id:7,parked:false,sleeping:2}]}),finish;
 const p=await popup(t,{status:()=>data,answer:{'close-parked':async()=>{await new Promise(resolve=>{finish=resolve;});data={...data,parkingTabs:0};return {closed:1,remaining:0,failed:0};}}});
 assert.equal(p.el('closeParked').disabled,false);assert.equal(p.el('parkedCount').textContent,'0');
 assert.equal(p.el('toggleLabel').textContent,'Resume automatic parking');
 await p.el('closeParked').fire('click');assert.equal(shown(p).title,'Clear parked tabs?');
 await p.el('confirmGo').fire('click');
 assert(p.el('closeParked').disabled);assert(p.el('toggle').disabled);
 await p.el('closeParked').fire('click');assert.equal(p.sent('close-parked').length,1);
 finish();await flush();await flush();
 assert(p.el('closeParked').disabled);assert.equal(p.el('sleepingCount').textContent,'2');assert.equal(p.el('toggle').disabled,false);
 assert.equal(p.el('mode').textContent,'Parking paused');assert.equal(p.el('status').textContent,'Cleared 1 parked tab.');
 assert.equal(p.sent('configure').length,0);
});

test('one default button at a time: while paused, Resume gives way to Cancel',async t=>{
 const p=await popup(t,{status:()=>reply({enabled:false,parkingTabs:1,protectedTabs:1,windows:[{id:7,parked:true,sleeping:0}]})});
 assert(p.el('toggle').classes.has('default'));
 await p.el('closeParked').fire('click');assert(!p.el('toggle').classes.has('default'));
 await p.keydown('Escape');assert(p.el('toggle').classes.has('default'));
 // While the question is open, the other clearing button does nothing.
 await p.el('closeParked').fire('click');await p.el('clearProtected').fire('click');
 assert.equal(p.el('confirmTitle').textContent,'Clear parked tabs in 1 window?');assert.equal(p.sent('close-parked').length+p.sent('clear-protected').length,0);
 assert.match(read('popup.html'),/<button class="default" id="confirmCancel" type="button">Cancel<\/button><button class="danger" id="confirmGo" type="button"><\/button>/);
});

test('Clear protected tabs asks, clears through the worker, and Protect’s label goes back to “Protect this tab”',async t=>{
 let protectedTabs=3;
 const p=await popup(t,{status:()=>reply({protectedTabs,currentTab:tab({protected:protectedTabs>0})}),
  answer:{'clear-protected':async()=>{const cleared=protectedTabs;protectedTabs=0;return {cleared};}}});
 assert.equal(p.el('protectLabel').textContent,'Unprotect this tab');assert.equal(p.el('clearProtected').disabled,false);
 await p.el('clearProtected').fire('click');
 assert.deepEqual(shown(p),{title:'Clear 3 protected tabs?',text:'These 3 tabs lose their protection and can be parked as usual. No tabs are closed.'});
 assert.equal(p.el('confirmGo').textContent,'Clear protected tabs');
 await p.el('confirmGo').fire('click');
 assert.deepEqual(p.sent('clear-protected'),[{type:'clear-protected'}]);
 assert.equal(p.el('status').textContent,'Cleared 3 protected tabs.');
 assert.equal(p.el('protectLabel').textContent,'Protect this tab','updated at once');
 assert(p.el('clearProtected').disabled);assert.equal(p.el('clearProtected').title,'No tabs are protected.');
 assert.equal(p.store.skipWarnings,undefined,'nothing saved without the tick');
 const one=await popup(t,{status:()=>reply({protectedTabs:1})});await one.el('clearProtected').fire('click');
 assert.deepEqual(shown(one),{title:'Clear 1 protected tab?',text:'This tab loses its protection and can be parked as usual. No tabs are closed.'});
});

test('when Clear protected tabs leaves nothing to clear, keyboard focus moves to the expander, though Chrome drops it from the disabled button late',async t=>{
 for(const local of [{},{skipWarnings:{clearProtected:true}}]){
  let protectedTabs=1;
  const p=await popup(t,{local,status:()=>reply({protectedTabs,currentTab:tab({protected:protectedTabs>0})}),
   answer:{'clear-protected':async()=>{const cleared=protectedTabs;protectedTabs=0;return {cleared};}}});
  p.el('clearProtected').focus();await p.el('clearProtected').fire('click');
  if(!local.skipWarnings){assert.equal(p.focused,p.el('confirmCancel'));p.el('confirmGo').focus();await p.el('confirmGo').fire('click');}
  await later();
  assert.equal(p.el('status').textContent,'Cleared 1 protected tab.');assert(p.el('clearProtected').disabled);
  assert.equal(p.focused,p.summary,local.skipWarnings?'warning off':'after the question');
 }
});

test('focus you move elsewhere while an action runs stays there',async t=>{
 let release;const held=new Promise(resolve=>{release=resolve;});
 const p=await popup(t,{answer:{protect:async()=>{await held;return {};}}});
 p.el('protect').focus();const done=p.el('protect').fire('click');await flush();
 assert(p.el('protect').disabled,'busy');
 p.el('options').focus();
 release();await done;await later();
 assert.equal(p.el('protect').disabled,false);assert.equal(p.focused,p.el('options'),'left where you put it');
});

test('a slow older status request that fails never overrides a newer one that succeeded',async t=>{
 let hold=null;
 const p=await popup(t,{status:async()=>{if(hold){const wait=hold;hold=null;await wait;throw new Error('Chrome is busy.');}return reply();}});
 assert.equal(p.el('protect').disabled,false);
 let release;hold=new Promise(resolve=>{release=resolve;});
 await p.tabEvent();await p.tabEvent();
 release();await flush();await flush();
 assert.equal(p.el('protect').disabled,false,'still offered');assert.equal(p.el('status').textContent,'','no stale error');
});

test('Escape closes an open question and keeps the popup open; with no question, Chrome gets it',async t=>{
 const p=await popup(t,{status:()=>reply({protectedTabs:2})});
 assert.equal(await p.keydown('Escape'),false,'no question: Chrome closes the popup as usual');
 await p.el('clearProtected').fire('click');assert.equal(p.el('confirm').hidden,false);
 assert.equal(await p.keydown('Escape'),true,'the question takes it');assert.equal(p.el('confirm').hidden,true);
});

test('an open question follows the counts, and closes with focus on the expander when nothing is left to clear',async t=>{
 let protectedTabs=3;
 const p=await popup(t,{status:()=>reply({protectedTabs})});
 p.el('clearProtected').focus();await p.el('clearProtected').fire('click');
 assert.equal(shown(p).title,'Clear 3 protected tabs?');assert.equal(p.focused,p.el('confirmCancel'));
 protectedTabs=2;await p.tabEvent();assert.equal(shown(p).title,'Clear 2 protected tabs?','the count follows');
 protectedTabs=0;await p.tabEvent();
 assert.equal(p.el('confirm').hidden,true,'nothing left: the question closes');assert.equal(p.el('clearingActions').hidden,false);
 assert.equal(p.focused,p.summary,'focus goes to the expander');assert.equal(p.sent('clear-protected').length,0);
});

test('a warning preference that can’t be saved never stops the action you confirmed',async t=>{
 let parkingTabs=1;
 const p=await popup(t,{status:()=>reply({parkingTabs,windows:[{id:7,parked:parkingTabs>0,sleeping:0}]}),
  answer:{'close-parked':async()=>{parkingTabs=0;return {closed:1,remaining:0,failed:0};}}});
 globalThis.chrome.storage.local.set=async()=>{throw new Error('Storage is full.');};
 await p.el('closeParked').fire('click');p.el('confirmSkip').checked=true;await p.el('confirmGo').fire('click');
 assert.equal(p.sent('close-parked').length,1,'cleared all the same');assert.equal(p.el('status').textContent,'Cleared 1 parked tab.');
});

test('the Changelog link reads “What’s new in 2.0” after an update until it’s followed; it opens the releases only on a click',async t=>{
 const p=await popup(t,{local:{whatsNew:'2.0'}});const link=p.el('changelog');
 assert.equal(link.textContent,'What’s new in 2.0');assert.equal(link.getAttribute('aria-label'),'What’s new in 2.0 (opens in a new tab)');
 assert.deepEqual(p.opened,[],'nothing opens by itself');assert.deepEqual(p.writes,[]);
 await link.fire('click',{isTrusted:false});assert.deepEqual(p.opened,[]);assert.equal(p.store.whatsNew,'2.0','a scripted click changes nothing');
 await link.fire('click');
 assert.deepEqual(p.opened,[{url:CHANGELOG_URL,active:true}]);assert.equal(CHANGELOG_URL,'https://github.com/montybwolfe/window-parker/releases');
 assert.equal(p.store.whatsNew,undefined);assert.equal(link.textContent,'Changelog');assert.equal(link.getAttribute('aria-label'),'Changelog (opens in a new tab)');
 const q=await popup(t);assert.equal(q.el('changelog').textContent,'Changelog');
 assert(!q.messages.some(m=>m.type!=='status'),'no worker message');
});

test('no badge, notification or new tab outside a click; links are bound with bindLink',()=>{
 for(const file of ['popup.js','options.js','parked.js','ui.js','support.js','theme.js']){
  const source=read(file);
  assert(!/setBadge|notifications|chrome\.action\b|openPopup|window\.open/.test(source),file);
  if(file!=='support.js')assert(!/tabs\.create/.test(source),`${file}: tabs open only through bindLink`);
 }
 // The only tabs.create is inside the click handler.
 const support=read('support.js'),handler=support.indexOf("button.addEventListener('click'");
 assert.equal(support.match(/tabs\.create/g).length,1);assert(handler>=0&&support.indexOf('tabs.create')>handler);
 assert.match(read('popup.js'),/bindLink\(changelog, CHANGELOG_URL,/);assert.match(read('options.js'),/bindLink\(\$\('changelog'\), CHANGELOG_URL,/);
 assert.deepEqual(JSON.parse(read('manifest.json')).permissions,['tabs','storage','alarms','downloads','favicon','contextMenus']);
});

test('a right-click menu that failed says so once, the next time the popup opens',async t=>{
 const p=await popup(t,{local:{menuNotice:{message:'You can exclude up to 200 sites.'}}});
 assert.equal(p.el('status').textContent,'You can exclude up to 200 sites.');assert(p.el('status').classes.has('error'));
 assert.equal(p.store.menuNotice,undefined);assert.deepEqual(p.writes,[['remove','menuNotice']]);
 const q=await popup(t,{local:{menuNotice:{message:''}}});assert.equal(q.el('status').textContent,'');assert.equal(q.store.menuNotice,undefined,'an empty note is dropped too');
});

test('popup Settings icon opens Settings exactly as the old Settings link did',async t=>{
 const p=await popup(t);await p.el('options').fire('click');assert.deepEqual(p.messages.at(-1),{type:'open-options'});
});

test('popup: header, then a main landmark with this tab, the counts, the mode, the clearing actions and the status, then the footer',()=>{
 const html=read('popup.html');
 assert.match(html,/<\/header>\n<main>\n<section class="this-tab" id="thisTab" aria-label="This tab">[\s\S]*<dl class="stats" id="stats">[\s\S]*<div class="mode-row">[\s\S]*<details class="clearing" id="clearing"><summary>Clear and reset tab actions<\/summary>[\s\S]*<p id="status" role="status" aria-live="polite"><\/p>\n<\/main>\n<footer class="popup-footer">/);
 assert.match(html,/<button class="danger" id="closeParked" type="button" disabled>Clear parked tabs<\/button><button class="danger" id="clearProtected" type="button" disabled>Clear protected tabs<\/button>/);
 assert.match(html,/<details class="clearing" id="clearing">/,'collapsed unless the popup opens it');assert(!/<details[^>]*\sopen/.test(html));
 assert.match(html,/<button id="protect" type="button" title="Protection lasts until Chrome closes." disabled>/,'not described by the hidden note');
 assert.match(html,/<img id="tabIcon" width="16" height="16" alt="">/,'the icon address is set by the script, which checks the page');
 assert(!/<dialog|confirm\(/.test(html+read('popup.js')),'never a dialog');
 for(const page of ['options.html','parked.html'])assert.match(read(page),/<main\b/,page);
});
