import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
export const flush=async()=>{for(let i=0;i<4;i++)await new Promise(resolve=>setImmediate(resolve));};
const original={document:globalThis.document,chrome:globalThis.chrome};

// A small stand-in for the popup page and the parts of Chrome it uses, for
// popup.test.js (set worker replies) and popup-protect.test.js (the real worker
// logic). `send` answers each worker message as runtime.sendMessage would, and
// `getCurrent` is chrome.windows.getCurrent. Elements are created on first use.
// A hidden button loses focus at once and a disabled one 5 ms later, as in
// Chrome, which moves focus off a disabled control only at its next update.
export async function openPopup(t,{send,getCurrent,local={}}){
 const elements=new Map(),messages=[],opened=[],writes=[],keys=[];let focused=null;const docListeners={};
 const inside={confirm:['confirmTitle','confirmText','confirmSkip','confirmCancel','confirmGo'],clearing:['summary','clearingActions','closeParked','clearProtected','confirm','confirmTitle','confirmText','confirmSkip','confirmCancel','confirmGo']};
 const node=(id,tagName='DIV')=>{
  let disabled=false,hidden=false;
  const n={id,tagName,textContent:'',title:'',className:'',checked:false,open:false,dataset:{},attributes:{},children:[],listeners:{},classes:new Set(),
   get disabled(){return disabled;},set disabled(v){disabled=!!v;if(disabled&&focused===n)setTimeout(()=>{if(disabled&&focused===n)focused=null;},5);},
   get hidden(){return hidden;},set hidden(v){hidden=!!v;if(hidden&&focused&&(focused===n||inside[id]?.includes(focused.id)))focused=null;},
   addEventListener(type,fn){(this.listeners[type]||=[]).push(fn);},
   async fire(type,event={}){for(const fn of this.listeners[type]||[])await fn({isTrusted:true,detail:1,preventDefault(){},...event});await flush();},
   setAttribute(name,value){this.attributes[name]=String(value);if(name==='src')this.src=String(value);},
   getAttribute(name){return this.attributes[name]??null;},
   removeAttribute(name){delete this.attributes[name];if(name==='src')delete this.src;},
   focus(){if(!disabled)focused=n;},
   contains(other){return !!other&&(other===n||!!inside[id]?.includes(other.id));},
   replaceChildren(...kids){this.children=kids;this.textContent=kids.map(k=>k.textContent).join('');}};
  n.classList={add:c=>n.classes.add(c),remove:c=>n.classes.delete(c),contains:c=>n.classes.has(c),toggle:(c,on=!n.classes.has(c))=>{on?n.classes.add(c):n.classes.delete(c);return on;}};
  return n;
 };
 const el=id=>{if(!elements.has(id))elements.set(id,node(id));return elements.get(id);};
 // The page as popup.html leaves it before any script runs.
 for(const [,id,text] of read('popup.html').matchAll(/<button[^>]* id="(\w+)"[^>]*>([^<]*)<\/button>/g))el(id).textContent=text;
 for(const id of ['protect','toggle','closeParked','clearProtected'])el(id).disabled=true;
 for(const id of ['protectNote','confirm'])el(id).hidden=true;
 const body=node('body'),summary=node('summary','SUMMARY');
 globalThis.document={body,getElementById:el,createElement:tag=>node(undefined,tag.toUpperCase()),
  querySelector:selector=>{assert.equal(selector,'#clearing > summary');return summary;},
  get activeElement(){return focused||body;},addEventListener:(type,fn)=>{(docListeners[type]||=[]).push(fn);}};
 const store={...structuredClone(local)};
 const never=name=>async()=>{throw new Error(`${name} must not be used`);};
 globalThis.chrome={
  tabs:{...Object.fromEntries(['onUpdated','onCreated','onRemoved','onActivated','onAttached','onDetached'].map(k=>[k,{addListener:fn=>{(chrome.tabs.events[k]||=[]).push(fn);}}])),events:{},
   create:async props=>{opened.push(props);return {id:1};}},
  windows:{getCurrent},
  storage:{local:{get:async list=>{keys.push(list);return Object.fromEntries([].concat(list).filter(k=>k in store).map(k=>[k,structuredClone(store[k])]));},
    set:async values=>{writes.push(['set',structuredClone(values)]);Object.assign(store,structuredClone(values));},
    remove:async list=>{writes.push(['remove',list]);for(const k of [].concat(list))delete store[k];}},
   sync:{get:never('storage.sync'),set:never('storage.sync'),remove:never('storage.sync')},session:{get:never('storage.session'),set:never('storage.session')}},
  runtime:{openOptionsPage:async()=>{messages.push({type:'open-options'});},async sendMessage(msg){
   messages.push(structuredClone(msg));return send(msg);
  }}};
 t.after(()=>Object.assign(globalThis,original));
 await import(`../popup.js?${Math.random()}`);await flush();
 // A key press; the result says whether the page kept it from Chrome (preventDefault).
 const keydown=async key=>{let prevented=false;for(const fn of docListeners.keydown||[])fn({key,preventDefault(){prevented=true;}});await flush();return prevented;};
 const sent=type=>messages.filter(m=>m.type===type);
 // A tab event, as Chrome reports it; the popup refreshes after a short pause.
 const tabEvent=async()=>{t.mock.timers.enable({apis:['setTimeout']});chrome.tabs.events.onActivated[0]({tabId:1,windowId:1});t.mock.timers.tick(100);t.mock.timers.reset();await flush();};
 return {el,body,summary,messages,sent,opened,writes,keys,store,keydown,tabEvent,get focused(){return focused;}};
}
