import test from 'node:test';
import assert from 'node:assert/strict';
import {harness, copy} from './helpers.js';

const popup={id:'test',url:'chrome-extension://test/popup.html'};
const status=(h,extra={})=>h.p.message({type:'status',...extra},popup);
const clear=h=>h.p.message({type:'clear-protected'},popup);
// Chrome gives an unloaded tab a new ID and reports the change (onReplaced).
const replace=(h,oldId,newId)=>{h.tab(oldId).id=newId;h.p.replaced(newId,oldId);};

test('status describes the popup window’s selected tab even while Chrome reports no window as focused',async()=>{
  const h=harness(2,3);await h.restart();
  // While the popup has focus, Chrome reports every window as not focused (seen 21 Nov 2026, Chrome 158 on macOS).
  for(const w of h.windows)w.focused=false;
  assert.equal((await status(h)).currentTab,null,'going by focus finds nothing');
  assert.deepEqual((await status(h,{windowId:2})).currentTab,{id:200,title:'Tab 1/0',url:'https://example.com/1/0',protected:false,protectable:true});
  await h.p.message({type:'protect',tabId:200,protected:true},popup);
  assert.equal((await status(h,{windowId:2})).currentTab.protected,true);
  // Which window has focus never matters once the window is named.
  h.windows[0].focused=true;assert.equal((await status(h,{windowId:2})).currentTab.id,200);
  assert.equal((await status(h)).currentTab.id,100,'without a window, the focused window’s web page, as before');
  h.tab(100).title='';assert.equal((await status(h,{windowId:1})).currentTab.title,'https://example.com/0/0','no title: its address');
});

test('status: tabs that can’t be protected are described but not offered; private, other and closed windows have no current tab',async()=>{
  const h=harness(5,2);
  Object.assign(h.tab(100),{url:'chrome://settings/',title:'Settings'});Object.assign(h.tab(200),{url:'about:blank',title:''});
  Object.assign(h.tab(300),{url:'chrome-extension://other/page.html',title:'Other extension'});
  h.windows[3].incognito=true;h.windows[4].type='popup';
  await h.restart();
  assert.deepEqual((await status(h,{windowId:1})).currentTab,{id:100,title:'Settings',url:'chrome://settings/',protected:false,protectable:false});
  assert.deepEqual((await status(h,{windowId:2})).currentTab,{id:200,title:'about:blank',url:'about:blank',protected:false,protectable:false});
  assert.equal((await status(h,{windowId:3})).currentTab.protectable,false,'another extension’s page');
  for(const id of [4,5,99,-1])assert.equal((await status(h,{windowId:id})).currentTab,null,`window ${id}`);
  // The parking page: its own title and address, never offered.
  h.tab(300).url='https://example.com/2/0';await h.parkAll();const parking=h.tab(h.p.states[3].parkingId);
  assert.deepEqual((await status(h,{windowId:3})).currentTab,{id:parking.id,title:parking.url,url:parking.url,protected:false,protectable:false});
  // The 1.x rule without a window: only a web page in the focused window.
  h.windows[0].focused=true;assert.equal((await status(h)).currentTab,null);
});

test('status rejects a window that isn’t a whole number, rather than guessing from focus',async()=>{
  const h=harness();await h.restart();
  for(const windowId of [null,'1',1.5,true,{},[1]])await assert.rejects(()=>status(h,{windowId}),/^Error: Invalid window\.$/,JSON.stringify(windowId));
  assert.equal((await status(h,{windowId:undefined})).currentTab.id,100,'left out: the focused window, as before');
});

test('status counts protected tabs that are still open, once each; IDs left by closed tabs don’t count',async()=>{
  const h=harness(2,3);
  // Protection isn't pruned when the worker starts, so IDs of tabs closed meanwhile can linger.
  h.session.runtimeState={states:{},protectedIds:[100,201,999,201]};await h.restart();
  assert.deepEqual(h.p.protectedIds,[100,201,999,201]);assert.equal((await status(h)).protectedTabs,2);
  replace(h,201,9201);assert.equal((await status(h)).protectedTabs,2,'a replaced tab still counts, once');
  h.windows[0].tabs=h.windows[0].tabs.filter(t=>t.id!==100);await h.p.removed(100,{windowId:1});
  assert.equal((await status(h)).protectedTabs,1,'a closed tab no longer counts');
  assert.equal((await status(h,{includeTabs:true})).protectedTabs,1);
});

test('Clear protected tabs removes all protection and says how many open tabs lost it: stale IDs don’t count, a replaced tab counts once',async()=>{
  const h=harness(2,3);h.session.runtimeState={states:{},protectedIds:[999]};await h.restart();
  for(const tabId of [100,201,202])await h.p.message({type:'protect',tabId,protected:true},popup);
  replace(h,201,9201);
  h.windows[1].tabs=h.windows[1].tabs.filter(t=>t.id!==202);await h.p.removed(202,{windowId:2});
  assert.deepEqual(h.p.protectedIds,[999,100,9201]);
  assert.deepEqual(await clear(h),{cleared:2});
  assert.deepEqual(h.p.protectedIds,[]);assert.deepEqual(h.session.runtimeState.protectedIds,[]);
  assert.equal((await status(h)).protectedTabs,0);assert.equal((await status(h,{windowId:1})).currentTab.protected,false);
  assert.deepEqual(await clear(h),{cleared:0},'nothing to clear: a harmless no-op that says so');
  // A tab Chrome replaces while the tabs are being counted counts once, before or after its new ID.
  let id=100;
  for(const order of ['before','after']){
    await h.p.message({type:'protect',tabId:id,protected:true},popup);
    const getAll=h.api.windows.getAll,oldId=id;id+=7;
    h.api.windows.getAll=async(...args)=>{
      if(order==='before'){replace(h,oldId,id);return getAll(...args);}
      const windows=await getAll(...args);replace(h,oldId,id);return windows;
    };
    assert.deepEqual(await clear(h),{cleared:1},order);h.api.windows.getAll=getAll;
    assert.deepEqual(h.p.protectedIds,[],order);
  }
});

test('Clear protected tabs works while paused and changes nothing else: no tab is closed, moved, reloaded, selected or unloaded, and no parking starts',async()=>{
  const h=harness(2,3);h.local.settings={enabled:false,sleepingMode:'immediate'};h.sync.delayMinutes=30;await h.restart();
  await h.p.message({type:'protect',tabId:200,protected:true},popup);
  const before=copy({windows:h.windows,local:h.local,sync:h.sync,alarms:[...h.alarms]}),calls=h.calls.length;
  assert.deepEqual(await clear(h),{cleared:1});
  assert.deepEqual(copy({windows:h.windows,local:h.local,sync:h.sync,alarms:[...h.alarms]}),before);
  assert.equal(h.calls.length,calls,'no tab or sync calls');assert.equal(h.p.settings.enabled,false,'still paused');
  // Running: an overdue window kept awake by its protected tab parks on the next check, not at once.
  const r=harness(2,3);r.local.settings={sleepingMode:'immediate'};await r.restart();
  await r.p.message({type:'protect',tabId:200,protected:true},popup);
  await r.advance(16*60000);await r.p.sweep();assert(!r.p.states[2].parked,'protected: stays awake');
  // The one-minute retry is due but its alarm hasn't fired, so a sweep started by clearing would park the window now.
  r.jump(61000);const before2=r.calls.length;assert.deepEqual(await clear(r),{cleared:1});
  assert.equal(r.calls.length,before2);assert(!r.p.states[2].parked,'clearing parks nothing by itself');assert(r.alarms.has('parking'),'the usual check is still due');
  await r.p.sweep();assert(r.p.states[2].parked,'parks on the next check, with the usual timing');
});
