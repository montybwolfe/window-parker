import test from 'node:test';
import assert from 'node:assert/strict';
import {harness, copy} from './helpers.js';
import {DEFAULTS} from '../settings.js';

const popup={id:'test',url:'chrome-extension://test/popup.html'};
const web=['http://*/*','https://*/*'];
// The items Chrome would show now.
const shown=h=>[...h.menus.values()].filter(m=>m.visible).map(m=>m.id);
// A click on an item, in a tab, on the page that was right-clicked.
const click=(h,menuItemId,tabId=100,pageUrl=h.tab(tabId)?.url)=>h.p.menuClicked({menuItemId,pageUrl},{id:tabId});
// Chrome gives an unloaded tab a new ID and reports the change (onReplaced).
const replace=(h,oldId,newId)=>{h.tab(oldId).id=newId;h.p.replaced(newId,oldId);};
// Tab and window changes: the menu never parks, restores or discards anything.
const tabCalls=h=>h.calls.filter(c=>c[0]!=='sync');
const settingsWith=(h,changes)=>h.p.configure({...h.p.settings,...changes},h.p.settings);

test('the menu: exactly these items, one per intent, and never Clear parked tabs or Clear protected tabs',async()=>{
  const h=harness();await h.restart();h.menuCalls.length=0;
  await h.p.createMenus();
  assert.deepEqual(h.menuCalls.map(c=>c[0]),['removeAll',...Array(7).fill('create')],'made afresh');
  assert.deepEqual([...h.menus.values()],[
    {id:'protect',title:'Protect this tab',contexts:['page'],documentUrlPatterns:web,visible:true},
    {id:'unprotect',title:'Unprotect this tab',contexts:['page'],documentUrlPatterns:web,visible:false},
    {id:'exclude',title:'Exclude this site',contexts:['page'],documentUrlPatterns:web,visible:true},
    {id:'stop-excluding',title:'Stop excluding this site',contexts:['page'],documentUrlPatterns:web,visible:false},
    {id:'covered',title:'A rule in Settings covers this site',enabled:false,contexts:['page'],documentUrlPatterns:web,visible:false},
    {id:'pause',title:'Pause automatic parking',contexts:['page','action'],visible:true},
    {id:'resume',title:'Resume automatic parking',contexts:['page','action'],visible:false}]);
  assert(![...h.menus.values()].some(m=>/clear/i.test(m.id+m.title)));
  assert(h.menuCalls.every(c=>!JSON.stringify(c).includes('example.com')),'no site in any title');
  assert(tabCalls(h).length===0);
});

test('items follow the selected tab: protection, exact, broader and pattern rules, pausing, and pages that are not web pages',async()=>{
  const h=harness(2,3);h.local.syncPolicy={exclusions:true};await h.restart();
  assert.deepEqual(shown(h),['protect','exclude','pause']);
  await h.p.message({type:'protect',tabId:100,protected:true},popup);assert.deepEqual(shown(h),['unprotect','exclude','pause']);
  await h.p.message({type:'clear-protected'},popup);assert.deepEqual(shown(h),['protect','exclude','pause'],'Clear protected tabs');
  await h.p.message({type:'protect',tabId:100,protected:true},popup);
  // A site list synced from another computer.
  await h.p.syncChanged({exclusions:{newValue:['example.com']}});assert.deepEqual(shown(h),['unprotect','stop-excluding','pause'],'synced');
  // An exact plain rule, ignoring case and a leading *.: Stop excluding.
  for(const rule of ['EXAMPLE.com','*.example.com']){
    await settingsWith(h,{exclusions:[...DEFAULTS.exclusions,rule]});assert.deepEqual(shown(h),['unprotect','stop-excluding','pause'],rule);
  }
  // A broader or pattern rule covers the page: only Settings changes it, even beside an exact rule.
  h.tab(100).url='https://docs.example.com/a';
  for(const exclusions of [['example.com'],['https://docs.example.com/*'],['docs.example.com','example.com'],['*://docs.example.com/a']]){
    await settingsWith(h,{exclusions});assert.deepEqual(shown(h),['unprotect','covered','pause'],JSON.stringify(exclusions));
  }
  // A rule for a subdomain or a path elsewhere doesn't cover the page.
  await settingsWith(h,{exclusions:['x.docs.example.com','https://docs.example.com/b*','docs.example.com:8080']});
  assert.deepEqual(shown(h),['unprotect','exclude','pause']);
  await settingsWith(h,{enabled:false});assert.deepEqual(shown(h),['unprotect','exclude','resume']);
  // Other pages: only pause and resume (the toolbar icon's menu has them too).
  for(const url of ['chrome://settings/','about:blank','chrome-extension://other/page.html','file:///notes.txt']){
    h.tab(100).url=url;await h.p.refreshMenus();assert.deepEqual(shown(h),['resume'],url);
  }
  h.tab(100).url='https://example.com/0/0';await settingsWith(h,{enabled:true});
  await h.parkAll();h.windows[1].focused=true;await h.p.focusChanged(2,0,h.p.signalFocus(2));await h.p.refreshMenus();
  assert(h.tab(h.p.states[2].parkingId).active);assert.deepEqual(shown(h),['pause'],'a parking page');
  // While the popup has focus, no window has: items follow the window that last had it.
  h.windows[1].focused=false;h.windows[0].focused=true;await h.p.focusChanged(1,0,h.p.signalFocus(1));await h.p.refreshMenus();
  assert.deepEqual(shown(h),['unprotect','exclude','pause']);
  h.windows[0].focused=false;h.p.signalFocus(-1);await h.p.message({type:'protect',tabId:100,protected:false},popup);
  assert.deepEqual(shown(h),['protect','exclude','pause'],'protection changed in the popup');
  // If that window has closed too, items follow the one Chrome says was focused before it (here, parked).
  h.windows.splice(0,1);await settingsWith(h,{enabled:false});assert.deepEqual(shown(h),['resume']);
  // With no window at all, the tab and site items stay as they are.
  h.windows.splice(0);await settingsWith(h,{enabled:true});assert.deepEqual(shown(h),['pause']);
});

test('Protect and Unprotect change only that tab’s protection; stale, closed and replaced tabs are handled',async()=>{
  const h=harness(2,3);await h.restart();let saves=0;h.hooks.sessionSet=()=>{saves++;};
  await click(h,'protect');assert.deepEqual(h.p.protectedIds,[100]);assert.deepEqual(h.session.runtimeState.protectedIds,[100]);
  assert.deepEqual(shown(h),['unprotect','exclude','pause']);assert.equal(saves,1);
  // A label shown a moment too long: Protect on a protected tab, Unprotect on one that isn't, do nothing.
  await click(h,'protect');assert.deepEqual(h.p.protectedIds,[100]);assert.equal(saves,1);
  await click(h,'unprotect');assert.deepEqual(h.p.protectedIds,[]);
  await click(h,'unprotect');assert.deepEqual(h.p.protectedIds,[]);assert.equal(saves,2);
  // Another tab, right-clicked in a window that isn't the one in use.
  await click(h,'protect',201);assert.deepEqual(h.p.protectedIds,[201]);
  // A tab that is no longer a web page, or has closed: nothing happens.
  h.tab(101).url='chrome://settings/';await click(h,'protect',101,'https://example.com/0/1');
  h.windows[0].tabs=h.windows[0].tabs.filter(t=>t.id!==102);await click(h,'protect',102,'https://example.com/0/2');
  assert.deepEqual(h.p.protectedIds,[201]);
  // Chrome replaced the tab before the click was handled: the click follows it.
  replace(h,100,1100);await click(h,'protect',100,'https://example.com/0/0');assert.deepEqual(h.p.protectedIds,[201,1100]);
  replace(h,1100,2100);await click(h,'unprotect',100,'https://example.com/0/0');assert.deepEqual(h.p.protectedIds,[201]);
  assert.equal(h.local.menuNotice,undefined);assert.deepEqual(tabCalls(h),[]);
});

test('Exclude this site adds the plain host, lowercase, with its port only if unusual, through Settings’ path',async()=>{
  const h=harness(2,3);h.local.syncPolicy={exclusions:true};await h.restart();
  for(const [url,host] of [['https://Docs.Example.com:443/a?b#c','docs.example.com'],['http://localhost:3000/x','localhost:3000'],
    ['http://example.org:80/','example.org'],['https://bücher.example/','xn--bcher-kva.example'],['http://127.0.0.1:8080/','127.0.0.1:8080']]){
    h.tab(100).url=url;const before=h.p.settings;
    await click(h,'exclude');
    assert.deepEqual(h.p.settings,{...before,exclusions:[...before.exclusions,host]},url);
    assert.deepEqual(h.local.settings,h.p.settings);assert.deepEqual(h.sync.exclusions,h.p.settings.exclusions,'synced, like an edit in Settings');
    assert.equal(h.p.customized.exclusions,true,'chosen on this computer');
    assert.deepEqual(shown(h),['protect','stop-excluding','pause'],url);
  }
  // Already excluded, by an exact or a broader rule: nothing happens.
  const writes=h.calls.length;
  h.tab(100).url='https://docs.example.com/b';await click(h,'exclude');
  h.tab(100).url='https://meet.google.com/x';await click(h,'exclude');
  await settingsWith(h,{exclusions:[...h.p.settings.exclusions,'https://work.example/*']});const covered=copy(h.p.settings);
  h.tab(100).url='https://work.example/a';await click(h,'exclude');assert.deepEqual(h.p.settings,covered);
  assert.equal(h.calls.length,writes+1,'only the Settings edit synced');
  // Only the site that was right-clicked: a tab that has moved on to another site meanwhile is left alone.
  h.tab(100).url='https://elsewhere.example/';await click(h,'exclude',100,'https://first.example/');
  assert(!h.p.settings.exclusions.includes('elsewhere.example'));assert(!h.p.settings.exclusions.includes('first.example'));
  await click(h,'exclude',100,'https://elsewhere.example/other');assert.equal(h.p.settings.exclusions.at(-1),'elsewhere.example');
  assert.equal(h.local.menuNotice,undefined);assert.deepEqual(tabCalls(h),[]);
});

test('Stop excluding removes only exact plain rules for the host, never a broader or pattern rule',async()=>{
  const h=harness(2,3);await h.restart();
  await settingsWith(h,{exclusions:['zoom.us','Example.com','*.EXAMPLE.com','docs.example.com','https://example.com/work/*','example.com:8080']});
  h.tab(100).url='https://example.com/';await h.p.refreshMenus();assert.deepEqual(shown(h),['protect','stop-excluding','pause']);
  await click(h,'stop-excluding');
  assert.deepEqual(h.p.settings.exclusions,['zoom.us','docs.example.com','https://example.com/work/*','example.com:8080']);
  assert.deepEqual(shown(h),['protect','exclude','pause']);
  // A label shown a moment too long: no exact rule now, or a broader rule covers the page. Nothing happens.
  let before=copy(h.p.settings);await click(h,'stop-excluding');assert.deepEqual(h.p.settings,before);
  await settingsWith(h,{exclusions:['example.com','docs.example.com']});before=copy(h.p.settings);
  h.tab(100).url='https://docs.example.com/';await click(h,'stop-excluding');assert.deepEqual(h.p.settings,before);
  assert.deepEqual(shown(h),['protect','covered','pause']);
  h.tab(100).url='https://example.com/work/1';await settingsWith(h,{exclusions:['https://example.com/work/*']});before=copy(h.p.settings);
  await click(h,'stop-excluding');assert.deepEqual(h.p.settings,before);
  // A disabled item can't be clicked; if Chrome ever reported it, nothing would happen.
  await click(h,'covered');assert.deepEqual(h.p.settings,before);assert.equal(h.local.menuNotice,undefined);
});

test('Pause and Resume change only the pause state, through the popup’s path; it never syncs',async()=>{
  const h=harness(2,3);h.local.syncPolicy=Object.fromEntries(Object.keys(DEFAULTS).map(k=>[k,true]));await h.restart();
  const synced=h.calls.length,before=copy(h.p.settings),customized=copy(h.p.customized);
  await click(h,'pause');assert.deepEqual(h.p.settings,{...before,enabled:false});assert.equal(h.local.settings.enabled,false);
  assert.deepEqual(shown(h),['protect','exclude','resume']);assert(!h.alarms.has('parking'));
  let writes=0;h.hooks.localSet=values=>{if(values.settings)writes++;};
  await click(h,'pause');assert.equal(h.p.settings.enabled,false);assert.equal(writes,0,'already paused: nothing happens');
  await click(h,'resume');assert.deepEqual(h.p.settings,before);assert.deepEqual(shown(h),['protect','exclude','pause']);assert.equal(writes,1);
  await click(h,'resume');assert.deepEqual(h.p.settings,before);assert.equal(writes,1,'already running: nothing happens');
  assert.equal(h.calls.length,synced,'nothing synced');assert.deepEqual(h.p.customized,customized);assert.deepEqual(tabCalls(h),[]);
});

test('a failure changes nothing and leaves a note for the popup: the 200-site limit, a host that can’t be a rule, storage and sync errors',async()=>{
  const h=harness(2,3);await h.restart();
  const full=Array.from({length:200},(_,i)=>`site${i}.example`);await settingsWith(h,{exclusions:full});
  const unchanged=()=>{assert.deepEqual(h.p.settings.exclusions,full);assert.deepEqual(h.local.settings.exclusions,full);};
  // Exclude stays offered while the list is full; the click explains why nothing changed.
  assert.deepEqual(shown(h),['protect','exclude','pause']);
  await click(h,'exclude');unchanged();
  assert.deepEqual(h.local.menuNotice,{message:'Couldn’t exclude example.com. You can exclude up to 200 sites.'});
  await settingsWith(h,{exclusions:DEFAULTS.exclusions});delete h.local.menuNotice;
  h.tab(100).url='http://[::1]:8080/';await h.p.refreshMenus();assert.deepEqual(shown(h),['protect','exclude','pause']);
  await click(h,'exclude');assert.deepEqual(h.p.settings.exclusions,DEFAULTS.exclusions);
  assert.deepEqual(h.local.menuNotice,{message:'Couldn’t exclude [::1]:8080. “[::1]:8080” isn’t a website. Enter one such as example.com, or a full address such as https://example.com/work/*.'});
  // Chrome can't save the change: settings, pausing and protection stay as they were.
  h.tab(100).url='https://example.com/0/0';
  h.hooks.localSet=values=>{if(values.settings)throw new Error('Resource::kQuotaBytes quota exceeded');};
  await click(h,'exclude');assert.deepEqual(h.p.settings.exclusions,DEFAULTS.exclusions);
  assert.deepEqual(h.local.menuNotice,{message:'Couldn’t exclude example.com. Resource::kQuotaBytes quota exceeded'});
  await click(h,'pause');assert.equal(h.p.settings.enabled,true);
  assert.deepEqual(h.local.menuNotice,{message:'Couldn’t pause automatic parking. Resource::kQuotaBytes quota exceeded'});
  h.hooks.localSet=null;h.hooks.sessionSet=()=>{throw new Error('Session storage is unavailable.');};
  await click(h,'protect');assert.deepEqual(h.p.protectedIds,[]);
  assert.deepEqual(h.local.menuNotice,{message:'Couldn’t protect this tab. Session storage is unavailable.'});
  h.hooks.sessionSet=null;assert.deepEqual(shown(h),['protect','exclude','pause']);
  // Chrome sync refuses the longer list: as after an edit in Settings, the site is excluded here and the list stops syncing.
  await h.p.syncEnable(['exclusions']);assert.equal(h.p.policy.exclusions,true);
  h.hooks.syncSet=()=>{throw new Error('QUOTA_BYTES_PER_ITEM quota exceeded');};
  await click(h,'exclude');assert.deepEqual(h.p.settings.exclusions,[...DEFAULTS.exclusions,'example.com']);assert.equal(h.p.policy.exclusions,false);
  assert.deepEqual(h.local.menuNotice,{message:'Sites to exclude is too long to sync, so it stays on this computer.'});
  // Nothing else writes a note.
  delete h.local.menuNotice;await click(h,'stop-excluding');assert.equal(h.local.menuNotice,undefined);
});

test('items stay right across worker restarts and browser restarts, and are made afresh if any is missing',async()=>{
  const h=harness(2,3);await h.restart();await click(h,'protect');await settingsWith(h,{enabled:false});
  assert.deepEqual(shown(h),['unprotect','exclude','resume']);
  const errors=[],error=console.error;console.error=(...a)=>errors.push(a);
  try{
    // The worker stops and starts again: Chrome kept the items, and they still match.
    await h.restart();assert.deepEqual(shown(h),['unprotect','exclude','resume']);assert(!h.menuCalls.slice(-7).some(c=>c[0]!=='update'));
    // Chrome restarts: protection doesn't survive it, and the items follow.
    await h.restart(true);assert.deepEqual(shown(h),['protect','exclude','resume']);
    // Items made by a version before them, or lost: the menu is made afresh.
    h.menus.clear();h.menuCalls.length=0;await h.restart();
    assert.deepEqual(h.menuCalls.map(c=>c[0]),['update','removeAll',...Array(7).fill('create')]);
    assert.deepEqual(shown(h),['protect','exclude','resume']);
    // A menu that can't be made never stops the worker.
    h.hooks.menu=()=>'Menus are unavailable.';await h.restart();assert.equal(h.p.loaded,true);
    assert.equal(errors.length,1);assert.match(String(errors[0][1]),/Menus are unavailable/);
  }finally{console.error=error;}
});

// The worker itself (background.js), with its listeners.
function event(){const listeners=[];return {addListener:fn=>listeners.push(fn),emit:(...args)=>listeners.map(fn=>fn(...args))};}
async function worker(h,body){
  for(const [ns,names] of Object.entries({windows:['onFocusChanged','onRemoved','onCreated'],tabs:['onActivated','onRemoved','onCreated','onAttached','onDetached','onMoved','onReplaced','onUpdated'],alarms:['onAlarm'],downloads:['onCreated','onChanged'],runtime:['onStartup','onInstalled','onMessage']}))for(const name of names)h.api[ns][name]=event();
  const old={chrome:globalThis.chrome,now:Date.now,setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout,error:console.error};const errors=[];
  globalThis.chrome=h.api;Date.now=h.clock.now;globalThis.setTimeout=h.clock.setTimeout;globalThis.clearTimeout=h.clock.clearTimeout;console.error=(...a)=>errors.push(a);
  const send=(message,from=popup)=>new Promise(resolve=>h.api.runtime.onMessage.emit(message,from,resolve));
  // Queued work runs in order: a reply means everything before it is done.
  const drain=async()=>{for(let i=0;i<3;i++)assert((await send({type:'settings'})).ok);};
  try{await body({send,drain,errors,start:()=>import(`../background.js?menu=${Math.random()}`)});assert.deepEqual(errors,[]);}
  finally{globalThis.chrome=old.chrome;Date.now=old.now;globalThis.setTimeout=old.setTimeout;globalThis.clearTimeout=old.clearTimeout;console.error=old.error;}
}

test('the worker makes the menu afresh on install and update: everything removed, then created',async()=>{
  const h=harness(2,3);
  await worker(h,async({drain,start})=>{
    await start();await drain();
    for(const details of [{reason:'install'},{reason:'update',previousVersion:'1.5.6.1'}]){
      h.menuCalls.length=0;h.api.runtime.onInstalled.emit(details);await drain();
      assert.deepEqual(h.menuCalls.map(c=>c[0]),['removeAll',...Array(7).fill('create')],details.reason);
      assert.deepEqual(h.menuCalls.slice(1).map(c=>c[1].id),['protect','unprotect','exclude','stop-excluding','covered','pause','resume']);
      assert.deepEqual(shown(h),['protect','exclude','pause']);
    }
  });
});

test('the worker: a click that wakes it is handled once it has started, and items follow tab activation, focus, address changes and replacements',async()=>{
  const h=harness(2,3);
  await worker(h,async({send,drain,start})=>{
    // A stopped worker is started by the click itself.
    await start();h.api.contextMenus.onClicked.emit({menuItemId:'protect',pageUrl:h.tab(100).url},copy(h.tab(100)));await drain();
    assert.deepEqual(h.session.runtimeState.protectedIds,[100]);assert.deepEqual(shown(h),['unprotect','exclude','pause']);
    const select=(windowId,tabId)=>{for(const t of h.windows[windowId-1].tabs)t.active=t.id===tabId;h.api.tabs.onActivated.emit({windowId,tabId});};
    h.tab(101).url='chrome://settings/';select(1,101);await drain();assert.deepEqual(shown(h),['pause'],'selected: not a web page');
    for(const w of h.windows)w.focused=w.id===2;h.api.windows.onFocusChanged.emit(2);await drain();
    assert.deepEqual(shown(h),['protect','exclude','pause'],'focus: window 2');
    h.tab(200).url='https://zoom.us/j/1';h.api.tabs.onUpdated.emit(200,{url:h.tab(200).url},copy(h.tab(200)));await drain();
    assert.deepEqual(shown(h),['protect','stop-excluding','pause'],'the address changed');
    assert((await send({type:'protect',tabId:200,protected:true})).ok);assert.deepEqual(shown(h),['unprotect','stop-excluding','pause']);
    // Chrome replaced the tab, here with a page it had loaded ahead (another site): protection follows the tab.
    Object.assign(h.tab(200),{id:1200,url:'https://example.net/'});h.api.tabs.onReplaced.emit(1200,200);await drain();
    assert.deepEqual(shown(h),['unprotect','exclude','pause'],'replaced');
    h.api.contextMenus.onClicked.emit({menuItemId:'unprotect',pageUrl:'https://zoom.us/j/1'},{id:200});await drain();
    assert.deepEqual(h.session.runtimeState.protectedIds,[100]);assert.deepEqual(shown(h),['protect','exclude','pause']);
    assert((await send({type:'clear-protected'})).ok);h.api.contextMenus.onClicked.emit({menuItemId:'pause'},copy(h.tab(1200)));await drain();
    assert.deepEqual(shown(h),['protect','exclude','resume']);
    assert.deepEqual(tabCalls(h),[],'nothing parked, restored, discarded or closed');
  });
});

test('a worker that starts while no window has focus, or an update applied then, keeps the items for the window last used',async()=>{
  const h=harness(2,3);await h.restart();
  assert.deepEqual(shown(h),['protect','exclude','pause']);
  // You switch to another app: Chrome reports no focused window.
  for(const w of h.windows)w.focused=false;
  await h.focus(-1);await h.p.refreshMenus();
  assert.deepEqual(shown(h),['protect','exclude','pause'],'same worker');
  // The worker stops when idle; the parking alarm (or any event) starts it again.
  await h.restart();assert.deepEqual(shown(h),['protect','exclude','pause'],'a new worker');
  // Chrome updates the extension in the background: a new worker, then the menu is made afresh.
  await h.restart();await h.p.createMenus();assert.deepEqual(shown(h),['protect','exclude','pause'],'an update');
});

test('the worker: a click that wakes it runs in the queue, after the previous worker’s protection is loaded',async()=>{
  const h=harness(2,3);
  // The previous worker had protected tab 101 before it stopped.
  h.session.runtimeState={states:{},protectedIds:[101],pendingDwell:null,detachedTabs:[],owners:{}};
  // Session storage is slow to answer, as it can be while Chrome starts the worker.
  let release;const gate=new Promise(r=>{release=r;});h.hooks.sessionGet=()=>gate;
  await worker(h,async({drain,start})=>{
    await start();
    h.api.contextMenus.onClicked.emit({menuItemId:'protect',pageUrl:h.tab(100).url},copy(h.tab(100)));
    await new Promise(r=>setImmediate(r));release();h.hooks.sessionGet=null;await drain();
    assert.deepEqual(h.session.runtimeState.protectedIds.toSorted(),[100,101]);
  });
});
