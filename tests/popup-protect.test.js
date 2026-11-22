import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {harness} from './helpers.js';
import {openPopup,flush} from './popup-page.js';

const settle=async()=>{for(let i=0;i<4;i++)await flush();};
const sender={id:'test',url:'chrome-extension://test/popup.html'};
// Chrome gives an unloaded tab a new ID and reports the change (onReplaced).
const replace=(h,oldId,newId)=>{h.tab(oldId).id=newId;h.p.replaced(newId,oldId);};
const NOTE='Only web pages can be protected.';
assert.match(readFileSync(new URL('../popup.html',import.meta.url),'utf8'),new RegExp(`<p class="note" id="protectNote" hidden>${NOTE}</p>`));

// The popup (see popup-page.js) against the real worker logic in a simulated
// Chrome. `windowId` is the window the popup belongs to. `deliver` can hold or
// fail a reply after the worker has answered, so a reply can arrive late and out of date.
async function withPopup(t,h,{windowId=1,getCurrent=async()=>({id:windowId}),deliver}={},body){
  const send=async msg=>{
    let reply;
    try{reply={ok:true,data:structuredClone(await h.p.message(msg,sender))};}catch(error){reply={ok:false,error:error.message};}
    return await deliver?.(msg,reply)??reply;
  };
  const ui=await openPopup(t,{send,getCurrent});await settle();
  const protect=ui.el('protect'),status=ui.el('status');
  const click=async id=>{await ui.el(id).fire('click');await settle();};
  // Clear parked tabs asks first; the question is answered with its own button.
  const clearParked=async()=>{await click('closeParked');assert.equal(ui.el('confirm').hidden,false,'it asks first');await click('confirmGo');};
  const tabEvent=async()=>{await ui.tabEvent();await settle();};
  await body({...ui,protect,status,click,clearParked,tabEvent,label:()=>ui.el('protectLabel').textContent});
}
// Protect is disabled for a page that can't be protected, and says why: the note shows and describes it.
const unavailable=(ui,when)=>{
  assert.equal(ui.protect.disabled,true,when);assert.equal(ui.el('protectNote').hidden,false,when);
  assert.equal(ui.protect.getAttribute('aria-describedby'),'protectNote',when);assert.equal(ui.protect.title,NOTE,when);
};

test('popup: after Protect, Unprotect, Pause, Resume and Clear parked tabs, Protect stays offered for its window’s page with the right label while Chrome reports no window as focused',async t=>{
  const h=harness(2,3);await h.restart();
  // Window 2 parks while window 1 is in use.
  await h.advance(16*60000);await h.p.sweep();assert(h.p.states[2].parked);assert(!h.p.states[1].parked);
  await withPopup(t,h,{windowId:1},async ui=>{
    const offered=(label,when)=>{
      assert.equal(ui.protect.disabled,false,when);assert.equal(ui.label(),label,when);
      assert.equal(ui.el('protectNote').hidden,true,when);assert.equal(ui.protect.getAttribute('aria-describedby'),null,when);
    };
    offered('Protect this tab','on opening');
    // Once the popup has focus, Chrome reports no window as focused, which used to disable Protect.
    for(const w of h.windows)w.focused=false;
    // Toggled again and again without reopening the popup.
    for(let i=0;i<3;i++){
      await ui.click('protect');offered('Unprotect this tab','after Protect');assert.deepEqual(h.p.protectedIds,[100]);
      await ui.click('protect');offered('Protect this tab','after Unprotect');assert.deepEqual(h.p.protectedIds,[]);
    }
    await ui.click('protect');
    await ui.click('toggle');assert.equal(h.p.settings.enabled,false);assert.equal(ui.el('mode').textContent,'Parking paused');
    offered('Unprotect this tab','after Pause');
    await ui.click('toggle');assert.equal(h.p.settings.enabled,true);assert.equal(ui.el('mode').textContent,'Parking on');
    offered('Unprotect this tab','after Resume');
    assert.equal(ui.el('parkedCount').textContent,'1');
    await ui.clearParked();assert.equal(ui.status.textContent,'Cleared 1 parked tab.');assert.equal(ui.el('parkedCount').textContent,'0');
    offered('Unprotect this tab','after Clear parked tabs');
    await ui.click('protect');offered('Protect this tab','after Clear, Unprotect still works');assert.deepEqual(h.p.protectedIds,[]);
    const statuses=ui.sent('status');
    assert(statuses.length>10);assert(statuses.every(m=>m.windowId===1),'every status request names the popup’s own window');
    assert(ui.sent('protect').every(m=>m.tabId===100));assert.equal(ui.status.classes.has('error'),false);
  });
});

test('popup: Protect isn’t offered while its window shows a page that can’t be protected, says why, and is offered again for a web page',async t=>{
  const h=harness(2,3);await h.restart();
  await h.advance(16*60000);await h.p.sweep();assert(h.p.states[2].parked);
  for(const w of h.windows)w.focused=false;
  // Window 2 shows its parking page.
  await withPopup(t,h,{windowId:2},async ui=>{
    unavailable(ui,'a parking page');
    await ui.click('protect');assert(!ui.sent('protect').length,'nothing is sent for it');
    await ui.clearParked();
    assert.equal(ui.protect.disabled,false,'the page that was parked is selected again');assert.equal(ui.label(),'Protect this tab');
    assert.equal(ui.el('protectNote').hidden,true);assert.equal(ui.protect.title,'Protection lasts until Chrome closes.');
    await ui.click('protect');assert.deepEqual(h.p.protectedIds,[200]);assert.equal(ui.label(),'Unprotect this tab');
  });
  for(const url of ['chrome://settings/','about:blank','chrome-extension://other/page.html']){
    h.tab(100).url=url;
    await withPopup(t,h,{windowId:1},async ui=>{
      unavailable(ui,url);await ui.click('protect');assert(!ui.sent('protect').length,url);
      h.tab(100).url='https://example.com/0/0';await ui.tabEvent();
      assert.equal(ui.protect.disabled,false,`${url}, then a web page`);assert.equal(ui.label(),'Protect this tab');
      assert.equal(ui.el('protectNote').hidden,true,`${url}, then a web page: no note`);
    });
  }
});

test('popup: a failed status is reported and Protect isn’t offered until a refresh succeeds; a failed Protect is reported and the label shows the worker’s state',async t=>{
  const h=harness(2,3);await h.restart();
  let failing=true;const down={ok:false,error:'The extension is unavailable. Reload this page.'};
  const deliver=(msg,reply)=>msg.type==='status'&&failing?down:reply;
  await withPopup(t,h,{deliver},async ui=>{
    assert.equal(ui.protect.disabled,true,'opening');assert.equal(ui.status.textContent,down.error);assert(ui.status.classes.has('error'));
    // The status line says why; the page wasn't checked, so the note doesn't claim anything about it.
    assert.equal(ui.el('protectNote').hidden,true);
    failing=false;await ui.tabEvent();
    assert.equal(ui.protect.disabled,false,'the next refresh succeeds');assert.equal(ui.label(),'Protect this tab');
    // The protection is saved, but the refresh after it fails: the tab can't be checked, so Protect isn't offered.
    failing=true;await ui.click('protect');
    assert.deepEqual(h.p.protectedIds,[100]);assert.equal(ui.protect.disabled,true);assert.equal(ui.status.textContent,down.error);
    failing=false;await ui.click('toggle');
    assert.equal(ui.protect.disabled,false);assert.equal(ui.label(),'Unprotect this tab');assert.equal(ui.status.textContent,'');
    await ui.click('toggle');
    // Chrome unloads the tab and gives it a new ID before the popup hears of it.
    replace(h,100,1100);await ui.click('protect');
    assert.equal(ui.status.textContent,'Choose a regular tab.');assert(ui.status.classes.has('error'));
    assert.deepEqual(h.p.protectedIds,[1100],'still protected');
    assert.equal(ui.protect.disabled,false);assert.equal(ui.label(),'Unprotect this tab','the label shows the worker’s state');
    await ui.click('protect');assert.deepEqual(h.p.protectedIds,[]);assert.equal(ui.label(),'Protect this tab');
  });
  // The popup's window can't be found: reported, nothing offered, and asked again on the next refresh.
  let missing=true;
  await withPopup(t,h,{getCurrent:async()=>{if(missing)throw new Error('No current window');return {id:1};}},async ui=>{
    assert.equal(ui.protect.disabled,true);assert.equal(ui.status.textContent,'No current window');
    assert(!ui.sent('status').length,'no status request without a window');
    missing=false;await ui.tabEvent();
    assert.equal(ui.protect.disabled,false);assert.equal(ui.label(),'Protect this tab');assert.equal(ui.sent('status').at(-1).windowId,1);
  });
});

test('popup: a second click while busy sends nothing, and a slow old status reply never overwrites a newer one',async t=>{
  const h=harness(2,3);await h.restart();
  let held=null;
  const deliver=(msg,reply)=>msg.type==='status'&&held?new Promise(resolve=>{held.push(()=>resolve(reply));}):reply;
  await withPopup(t,h,{deliver},async ui=>{
    await Promise.all([ui.click('protect'),ui.click('protect')]);
    assert.equal(ui.sent('protect').length,1);assert.deepEqual(h.p.protectedIds,[100]);
    assert.equal(ui.label(),'Unprotect this tab');
    // A refresh starts and its reply is held: it says the tab is protected and parking is on.
    held=[];await ui.tabEvent();assert.equal(held.length,1);const old=held.pop();held=null;
    // Then the tab's protection is removed and parking paused elsewhere (in Settings, say), and a newer refresh lands first.
    await h.p.message({type:'protect',tabId:100,protected:false},sender);
    await h.p.message({type:'configure',settings:{...h.p.settings,enabled:false}},sender);
    await ui.tabEvent();assert.equal(ui.label(),'Protect this tab');assert.equal(ui.el('mode').textContent,'Parking paused');
    old();await settle();
    assert.equal(ui.label(),'Protect this tab','the old reply is ignored');assert.equal(ui.el('mode').textContent,'Parking paused');
    assert.equal(ui.protect.disabled,false);
  });
});
