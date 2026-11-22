import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {harness} from './helpers.js';

const manifest=JSON.parse(readFileSync(new URL('../manifest.json',import.meta.url)));
// Chrome adds update_url to the manifest of a build installed from the Web Store.
const STORE='https://clients2.google.com/service/update2/crx';
const popup={id:'test',url:'chrome-extension://test/popup.html'};
const made=['removeAll',...Array(7).fill('create')];
// Every way an update could be announced. The extension uses none of them.
function announcements(h){
  const seen=[],note=name=>async(...args)=>{seen.push([name,...args]);};
  h.api.action={setBadgeText:note('action.setBadgeText'),setBadgeBackgroundColor:note('action.setBadgeBackgroundColor'),setTitle:note('action.setTitle'),openPopup:note('action.openPopup')};
  h.api.notifications={create:note('notifications.create')};
  h.api.windows.create=note('windows.create');h.api.runtime.openOptionsPage=note('runtime.openOptionsPage');
  // tabs.create is the simulated one, which records each call.
  return ()=>[...seen,...h.calls.filter(c=>c[0]==='create').map(c=>['tabs.create',c[1]])];
}
// The worker itself (background.js), with its listeners.
function event(){const listeners=[];return {addListener:fn=>listeners.push(fn),emit:(...args)=>listeners.map(fn=>fn(...args))};}
async function worker(h,body){
  for(const [ns,names] of Object.entries({windows:['onFocusChanged','onRemoved','onCreated'],tabs:['onActivated','onRemoved','onCreated','onAttached','onDetached','onMoved','onReplaced','onUpdated'],alarms:['onAlarm'],downloads:['onCreated','onChanged'],runtime:['onStartup','onInstalled','onMessage']}))for(const name of names)h.api[ns][name]=event();
  const old={chrome:globalThis.chrome,now:Date.now,setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout,error:console.error};const errors=[];
  globalThis.chrome=h.api;Date.now=h.clock.now;globalThis.setTimeout=h.clock.setTimeout;globalThis.clearTimeout=h.clock.clearTimeout;console.error=(...a)=>errors.push(a);
  const send=message=>new Promise(resolve=>h.api.runtime.onMessage.emit(message,popup,resolve));
  // Queued work runs in order: a reply means everything before it is done.
  const drain=async()=>{for(let i=0;i<3;i++)assert((await send({type:'settings'})).ok);};
  try{await import(`../background.js?whatsnew=${Math.random()}`);await drain();await body({drain,errors});}
  finally{globalThis.chrome=old.chrome;Date.now=old.now;globalThis.setTimeout=old.setTimeout;globalThis.clearTimeout=old.clearTimeout;console.error=old.error;}
}

test('an update from the Web Store leaves whatsNew, the new version, in local storage; nothing announces it',async()=>{
  const h=harness(2,3),announced=announcements(h);
  await worker(h,async({drain,errors})=>{
    h.api.runtime.getManifest=()=>({...manifest,version:'2.0',update_url:STORE});h.menuCalls.length=0;
    h.api.runtime.onInstalled.emit({reason:'update',previousVersion:'1.5.6.1'});await drain();
    assert.equal(h.local.whatsNew,'2.0');
    assert.equal(h.sync.whatsNew,undefined);assert.equal(h.session.whatsNew,undefined);assert(!h.calls.some(c=>c[0]==='sync'),'never synced');
    assert.deepEqual(h.menuCalls.map(c=>c[0]),made,'the menu is still made afresh');
    assert.deepEqual(announced(),[]);assert.deepEqual(errors,[]);
  });
});

test('a fresh install, an unpacked build, the same version again and Chrome’s own updates leave no whatsNew',async()=>{
  const h=harness(2,3),announced=announcements(h);
  await worker(h,async({drain,errors})=>{
    for(const [what,details,build] of [
      ['installed from the Web Store',{reason:'install'},{update_url:STORE}],
      ['an unpacked build, updated',{reason:'update',previousVersion:'1.5.6'},{}],
      ['an unpacked build, installed',{reason:'install'},{}],
      ['the same version again',{reason:'update',previousVersion:manifest.version},{update_url:STORE}],
      ['Chrome updated',{reason:'chrome_update'},{update_url:STORE}],
      ['a shared module updated',{reason:'shared_module_update'},{update_url:STORE}]]){
      h.api.runtime.getManifest=()=>({...manifest,...build});h.menuCalls.length=0;
      h.api.runtime.onInstalled.emit(details);await drain();
      assert(!('whatsNew' in h.local),what);assert.deepEqual(h.menuCalls.map(c=>c[0]),made,what);
    }
    assert.equal(manifest.update_url,undefined,'this folder is an unpacked build');
    assert.deepEqual(announced(),[]);assert.deepEqual(errors,[]);
  });
});

test('whatsNew that can’t be saved is logged once, and the menu and the parking alarm still follow',async()=>{
  const h=harness(2,3),announced=announcements(h);
  await worker(h,async({drain,errors})=>{
    h.api.runtime.getManifest=()=>({...manifest,version:'2.0',update_url:STORE});
    h.hooks.localSet=values=>{if('whatsNew' in values)throw new Error('Resource::kQuotaBytes quota exceeded');};
    h.alarms.clear();h.menuCalls.length=0;
    h.api.runtime.onInstalled.emit({reason:'update',previousVersion:'1.5.6.1'});await drain();
    assert(!('whatsNew' in h.local));
    assert.equal(errors.length,1);assert.equal(errors[0][0],'[Window Parker] whatsNew');assert.match(String(errors[0][1]),/quota/);
    assert.deepEqual(h.menuCalls.map(c=>c[0]),made);assert(h.alarms.has('parking'),'scheduled as usual');
    assert.deepEqual(announced(),[]);
  });
});

test('Restore defaults leaves whatsNew in local storage',async()=>{
  const h=harness(2,3);h.local.whatsNew='2.0';await h.restart();
  await h.p.message({type:'reset'},{id:'test',url:'chrome-extension://test/options.html'});
  assert.equal(h.local.whatsNew,'2.0','Restore defaults never touches it');
});
