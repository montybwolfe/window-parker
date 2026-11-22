import {bindIssues, bindLink, bindSupport, CHANGELOG_URL} from './support.js';
import {request, report, watchTabState} from './ui.js';
const $ = id => document.getElementById(id);
const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const summary = () => document.querySelector('#clearing > summary');
// The worker's latest answer and the tab Protect acts on. `failed` means that
// answer couldn't be checked; `filled` that the counts have been shown once.
let data, current, failed = false, filled = false, busy = false, revision = 0, ownWindow;
// The clearing button whose confirmation is open, the warnings turned off on
// this computer, and whether the clearing actions were last left open.
let confirming = null, skipWarnings = {}, clearingOpen = false;

// The popup's own window. Chrome can report no window as focused while the
// popup has focus, so Protect follows this window's tab, not the focused one.
const popupWindow = async () => ownWindow ??= (await chrome.windows.getCurrent()).id;

function status(text, error = false) { $('status').textContent = text; $('status').classList.toggle('error', error); }
function controls() {
  $('protect').disabled = busy || failed || !current?.protectable;
  $('toggle').disabled = busy || !data;
  // Resume is the default button while paused, except while a confirmation's
  // Cancel is: only one default button shows at a time.
  $('toggle').classList.toggle('default', data?.enabled === false && !confirming);
  $('closeParked').disabled = busy || !data?.parkingTabs;
  $('clearProtected').disabled = busy || !data?.protectedTabs;
  $('closeParked').title = data && !data.parkingTabs ? 'No windows are parked.' : '';
  $('clearProtected').title = data && !data.protectedTabs ? 'No tabs are protected.' : '';
  $('confirmGo').disabled = busy;
}
// A changed number drops into place (see ui.css); the first fill doesn't move.
function setCount(id, n) {
  const dd = $(id), text = String(n);
  if (dd.textContent === text) return;
  const span = document.createElement('span');
  span.textContent = text;
  if (filled) span.className = 'changed';
  dd.replaceChildren(span);
  dd.classList.toggle('some', n > 0);
}
const icon = $('tabIcon');
function showTab() {
  const usable = !failed && !!current?.protectable, unavailable = !failed && !usable;
  $('tabTitle').textContent = $('tabTitle').title = current?.title || '';
  // The page's icon, from Chrome's own local copy (the favicon permission).
  if (!current?.url) { icon.removeAttribute('src'); delete icon.dataset.page; }
  else if (icon.dataset.page !== current.url) {
    icon.dataset.page = current.url;
    icon.src = `/_favicon/?${new URLSearchParams({pageUrl: current.url, size: '32'})}`;
  }
  $('thisTab').classList.toggle('unavailable', !usable);
  $('protectLabel').textContent = current?.protected ? 'Unprotect this tab' : 'Protect this tab';
  // The note describes the button only while it shows: a hidden description is still read out.
  $('protectNote').hidden = !unavailable;
  if (unavailable) $('protect').setAttribute('aria-describedby', 'protectNote');
  else $('protect').removeAttribute('aria-describedby');
  $('protect').title = usable ? 'Protection lasts until Chrome closes.' : unavailable ? 'Only web pages can be protected.' : '';
}
function render() {
  const paused = !data.enabled;
  document.body.classList.toggle('paused', paused);
  $('mode').textContent = paused ? 'Parking paused' : 'Parking on';
  $('toggleLabel').textContent = paused ? 'Resume automatic parking' : 'Pause automatic parking';
  setCount('parkedCount', data.windows.filter(w => w.parked).length);
  setCount('sleepingCount', data.windows.reduce((n, w) => n + w.sleeping, 0));
  filled = true;
  // An open confirmation keeps naming what would really be cleared.
  if (confirming && clearing[confirming.id].targets()) showWarning();
  else if (confirming) closeConfirm($('confirm').contains(document.activeElement));
}
async function refresh() {
  const own = ++revision;
  let next;
  try { next = await request('status', {windowId: await popupWindow()}); }
  catch (error) {
    // A slower, older request never overrides a newer one. A tab that couldn't
    // be checked isn't offered for protection until a refresh succeeds.
    if (own !== revision) return;
    failed = true; showTab(); controls();
    throw error;
  }
  if (own !== revision) return;
  failed = false; data = next; current = data.currentTab;
  render(); showTab(); controls();
}
// A button disabled while it works loses keyboard focus: give it back, or, if
// nothing is left for it to do, move to the expander it sits in.
function refocus(element) {
  // Chrome moves focus off a disabled button only at its next update, so the
  // button may still hold it here. Focus you moved elsewhere stays where it is.
  if (!element || element === document.body || ![element, document.body, null].includes(document.activeElement)) return;
  if (!element.disabled) element.focus();
  else if (element === $('closeParked') || element === $('clearProtected')) summary().focus();
}
async function act(operation) {
  if (busy) return;
  const focused = document.activeElement;
  busy = true; controls(); status('');
  try { await operation(); }
  catch (error) { report(error); }
  finally {
    try { await refresh(); } catch (error) { report(error); }
    busy = false; controls(); refocus(focused);
  }
}

// Clearing actions. Each asks first, in place of the two buttons, unless its
// warning was turned off; the result and any error always show.
const clearing = {
  closeParked: {
    targets: () => data?.parkingTabs || 0,
    warning() {
      const windows = data.windows.filter(w => w.parked).length, pages = data.parkingTabs;
      const outcome = ' None of your tabs are closed, and nothing is unloaded.';
      if (!windows) return ['Clear parked tabs?',
        `No window is parked. Window Parker removes the ${pages === 1 ? 'parking page' : `${pages} parking pages`} it left behind.${outcome}`];
      const extra = pages > windows, which = extra ? `its ${pages} parking pages` : `its parking page${pages === 1 ? '' : 's'}`;
      const where = windows === 1 ? `the${extra ? ' parked' : ''} window` : `each${extra ? ' parked' : ''} window`;
      return [`Clear parked tabs in ${count(windows, 'window')}?`,
        `Window Parker removes ${which}, and ${where} shows its previous tab again. A tab Chrome had unloaded reloads when it’s shown.${outcome}`];
    },
    async run() {
      const {closed, remaining, failed} = await request('close-parked');
      status(remaining ? (closed ? `Cleared ${closed} of ${closed + remaining} parked tabs. Try Clear parked tabs again in a moment.` :
        `Couldn’t clear ${count(remaining, 'parked tab')}. Try again in a moment.`) :
        closed ? `Cleared ${count(closed, 'parked tab')}.` : 'No parked tabs to clear.', failed > 0);
    }
  },
  clearProtected: {
    targets: () => data?.protectedTabs || 0,
    warning() {
      const n = data.protectedTabs;
      return [`Clear ${count(n, 'protected tab')}?`,
        `${n === 1 ? 'This tab loses its' : `These ${n} tabs lose their`} protection and can be parked as usual. No tabs are closed.`];
    },
    async run() {
      const {cleared} = await request('clear-protected');
      status(cleared ? `Cleared ${count(cleared, 'protected tab')}.` : 'No protected tabs to clear.');
    }
  }
};
function showWarning() {
  const [title, text] = clearing[confirming.id].warning();
  $('confirmTitle').textContent = title; $('confirmText').textContent = text;
}
function openConfirm(button) {
  confirming = button;
  $('confirmSkip').checked = false;
  $('confirmGo').textContent = button.textContent;
  showWarning();
  $('clearingActions').hidden = true; $('confirm').hidden = false;
  controls();
  $('confirmCancel').focus(); // Cancel is the default.
}
// Closing saves nothing. `restore` puts focus back on the button that opened it.
function closeConfirm(restore) {
  const origin = confirming;
  confirming = null;
  $('confirm').hidden = true; $('clearingActions').hidden = false;
  controls();
  if (restore) (origin.disabled ? summary() : origin).focus();
}
// "Don't show this warning again" is kept on this computer only, once the action is confirmed.
async function rememberSkip(id) {
  const {skipWarnings: saved} = await chrome.storage.local.get('skipWarnings');
  const next = {...(saved && typeof saved === 'object' ? saved : {}), [id]: true};
  await chrome.storage.local.set({skipWarnings: next});
  skipWarnings = next;
}
for (const button of [$('closeParked'), $('clearProtected')]) button.addEventListener('click', () => {
  if (busy || confirming || !clearing[button.id].targets()) return;
  status('');
  if (skipWarnings[button.id] === true) act(clearing[button.id].run);
  else openConfirm(button);
});
$('confirmGo').addEventListener('click', () => {
  const button = confirming;
  if (!button || busy) return;
  const remember = $('confirmSkip').checked;
  closeConfirm(true);
  act(async () => {
    // A preference that can't be saved never stops the action you confirmed.
    if (remember) await rememberSkip(button.id).catch(() => {});
    await clearing[button.id].run();
  });
});
$('confirmCancel').addEventListener('click', () => closeConfirm(true));
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || !confirming) return;
  event.preventDefault(); closeConfirm(true);
});
// Whether the clearing actions are open is remembered on this computer. It
// changes nothing else, so the worker isn't told.
$('clearing').addEventListener('toggle', () => {
  const open = $('clearing').open;
  if (!open && confirming) closeConfirm(false);
  if (open === clearingOpen) return;
  clearingOpen = open;
  (open ? chrome.storage.local.set({clearingOpen: true}) : chrome.storage.local.remove('clearingOpen')).catch(() => {});
});

$('protect').addEventListener('click', () => act(async () => {
  if (current?.protectable && !failed) await request('protect', {tabId: current.id, protected: !current.protected});
}));
$('toggle').addEventListener('click', () => act(async () => {
  // Only the pause state changes; `shown` stops this copy undoing a synced change.
  const settings = await request('settings');
  await request('configure', {settings: {...settings, enabled: !settings.enabled}, shown: settings});
}));
$('options').addEventListener('click', () => chrome.runtime.openOptionsPage().catch(report));

// The Changelog link reads "What's new in 2.0" after an update until it's followed once.
const changelog = $('changelog');
function showChangelog(latest) {
  const label = typeof latest === 'string' && latest ? `What’s new in ${latest}` : 'Changelog';
  changelog.textContent = label;
  changelog.setAttribute('aria-label', `${label} (opens in a new tab)`);
}
bindLink(changelog, CHANGELOG_URL, error => report(error));
changelog.addEventListener('click', event => {
  if (!event.isTrusted) return;
  showChangelog();
  chrome.storage.local.remove('whatsNew').catch(() => {});
});

chrome.storage.local.get(['clearingOpen', 'skipWarnings', 'whatsNew', 'menuNotice']).then(local => {
  if (local.clearingOpen === true) { clearingOpen = true; $('clearing').open = true; }
  if (local.skipWarnings && typeof local.skipWarnings === 'object') skipWarnings = local.skipWarnings;
  showChangelog(local.whatsNew);
  // A right-click menu action that failed says so here once, then the note is gone.
  if (local.menuNotice !== undefined) {
    const notice = local.menuNotice?.message;
    if (typeof notice === 'string' && notice) status(notice, true);
    chrome.storage.local.remove('menuNotice').catch(() => {});
  }
}).catch(() => {});
refresh().catch(report);
watchTabState(refresh);

bindSupport(document.getElementById('support'), error => report(error));
bindIssues($('reportBug'), error => report(error));
