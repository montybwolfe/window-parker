import {Parker} from '../engine.js';
export const copy = value => structuredClone(value);
// This folder's manifest: an unpacked build, which has no update_url. `npm run
// preview` also runs this file in a browser worker, which can't load node:fs and
// never reads the manifest, so it gets a stand-in there.
const manifest = globalThis.process?.versions?.node ?
  JSON.parse((await import('node:fs')).readFileSync(new URL('../manifest.json', import.meta.url))) : {manifest_version: 3, version: '0'};
export function harness(count = 2, tabsPerWindow = 3) {
  let now = 1_000_000, nextId = 10000;
  const timers = new Map(), alarms = new Map(), local = {}, session = {}, sync = {}, calls = [];
  const windows = Array.from({length: count}, (_,i) => ({id:i+1, type:'normal', incognito:false, focused:i===0,
    left:100*i, top:40, width:900, height:700, state:'normal',
    tabs:Array.from({length:tabsPerWindow},(_,j) => ({id:(i+1)*100+j, windowId:i+1, index:j, active:j===0,
      url:`https://example.com/${i}/${j}`, title:`Tab ${i}/${j}`, status:'complete', autoDiscardable:true,
      audible:false, pinned:false, discarded:false, groupId:j>0?10+i:-1}))}));
  const tab = id => windows.flatMap(w=>w.tabs).find(t=>t.id===id);
  const hooks = {};
  const store = (data, area) => ({get:async keys => {await hooks[area+'Get']?.(keys);
      return Object.fromEntries((Array.isArray(keys)?keys:[keys]).filter(k=>k in data).map(k=>[k,copy(data[k])]));},
    set:async values => {await hooks[area+'Set']?.(values);if(area==='sync')calls.push(['sync',copy(values)]);Object.assign(data,copy(values));}});
  const onChanged = (() => {const listeners=[];return {addListener:f=>listeners.push(f),removeListener:f=>listeners.splice(listeners.indexOf(f)>>>0,1),emit:(...a)=>listeners.forEach(f=>f(...a))};})();
  // The right-click menu: Chrome keeps its items between worker starts, calls back later and reports
  // an error only through runtime.lastError, during the callback. hooks.menu can return an error.
  const menus = new Map(), menuCalls = [], onClicked = (() => {const listeners=[];return {addListener:f=>listeners.push(f),emit:(...a)=>listeners.forEach(f=>f(...a))};})();
  const settle = (done, error) => queueMicrotask(() => {api.runtime.lastError = error ? {message: error} : undefined; try { done?.(); } finally { delete api.runtime.lastError; }});
  const api = {
    runtime:{id:'test',getURL:path=>`chrome-extension://test/${path}`,getManifest:()=>copy(manifest)},
    storage:{local:store(local,'local'),session:store(session,'session'),sync:store(sync,'sync'),onChanged},
    windows:{getAll:async()=>copy(windows),get:async id=>{await hooks.getWindow?.(id); const w=windows.find(w=>w.id===id); if(!w)throw Error('No window with id: '+id); return copy(w);},
      // Chrome remembers the last focused window, also while none is focused.
      getLastFocused:async()=>{const w=windows.find(w=>w.id===lastFocused)||windows.find(w=>w.focused)||windows[0];if(!w)throw Error('No last-focused window');return copy(w);}},
    tabs:{get:async id=>{await hooks.getTab?.(id); if(!tab(id))throw Error('No tab with id: '+id); return copy(tab(id));},
      create:async props=>{calls.push(['create',copy(props)]); const w=windows.find(w=>w.id===props.windowId); const t={id:nextId++,windowId:w.id,index:w.tabs.length,...props,autoDiscardable:true,status:'complete'};w.tabs.push(t);await hooks.create?.(t);return copy(t);},
      update:async(id,props)=>{calls.push(['update',id,copy(props)]); const t=tab(id);if(!t)throw Error('No tab with id: '+id);
        if(props.active)for(const candidate of windows.find(w=>w.id===t.windowId).tabs)candidate.active=candidate.id===id;
        Object.assign(t,props);if(props.active)t.discarded=false;await hooks.update?.(t);return copy(t);},
      discard:async id=>{calls.push(['discard',id]);const t=tab(id);if(!t||t.active)throw Error('not eligible');await hooks.discard?.(t);t.discarded=true;return copy(t);},
      remove:async id=>{await hooks.remove?.(id);const t=tab(id);if(!t)throw Error('No tab with id: '+id);calls.push(['remove',id]);
        const w=windows.find(w=>w.id===t.windowId);w.tabs=w.tabs.filter(t=>t.id!==id);w.tabs.forEach((t,i)=>{t.index=i;});
        if(!w.tabs.length)windows.splice(windows.indexOf(w),1);
        else if(t.active){w.tabs[0].active=true;w.tabs[0].discarded=false;}}},
    downloads:{search:async()=>{await hooks.downloads?.();return hooks.downloading?[{id:1}]:[];}},
    alarms:{get:async name=>{const alarm=alarms.get(name);return alarm?{name,scheduledTime:alarm.when}:undefined;},create:async(name,props)=>{alarms.set(name,copy(props));},clear:async name=>alarms.delete(name)},
    contextMenus:{onClicked,
      create:(props,done)=>{menuCalls.push(['create',copy(props)]);const error=hooks.menu?.('create',props)||(menus.has(props.id)?`Cannot create item with duplicate id ${props.id}`:undefined);
        if(!error)menus.set(props.id,copy(props));settle(done,error);return props.id;},
      update:(id,props,done)=>{menuCalls.push(['update',id,copy(props)]);const error=hooks.menu?.('update',id,props)||(menus.has(id)?undefined:`Cannot find menu item with id ${id}.`);
        if(!error)Object.assign(menus.get(id),copy(props));settle(done,error);},
      removeAll:done=>{menuCalls.push(['removeAll']);const error=hooks.menu?.('removeAll');if(!error)menus.clear();settle(done,error);}}
  };
  let p,lastFocused=null;
  const clock = {now:()=>now,setTimeout:(fn,ms)=>{const id=nextId++;timers.set(id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id)};
  const restart = async (newSession=false)=>{timers.clear(); if(newSession)delete session.runtimeState; p=new Parker(api,clock,f=>f());await p.init();return p;};
  const advance=async ms=>{const end=now+ms;while(true){const due=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;now=due[1].at;timers.delete(due[0]);await due[1].fn();}now=end;};
  const focus=async id=>{for(const w of windows)w.focused=w.id===id;if(id>=0)lastFocused=id;const epoch=p.signalFocus(id);await p.focusChanged(id,now,epoch);};
  const parkAll=async()=>{await focus(-1);await advance(16*60000);await p.sweep();};
  return {api,windows,tab,hooks,calls,menus,menuCalls,local,session,sync,alarms,timers,clock,restart,advance,focus,parkAll,get p(){return p;},jump:ms=>{now+=ms;}};
}
