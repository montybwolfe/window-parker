// Stage 1: the five Store screenshots, each a real Google Chrome window on macOS.
// A copy of the repository is installed in a throwaway, visible Chrome profile with
// real public web pages open, windows park for real, and each window is captured with macOS's screencapture at 2× and halved. Writes the
// screenshots and store-listing/sources/capture.json.
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {launch, evaluate, attach, sleep} from './cdp.mjs';
import {decode, halve, encode} from './png.mjs';
import {ASSETS, inputsOf, sha} from './verify.mjs';

if (process.platform !== 'darwin') throw new Error('capture.mjs captures real Chrome windows with macOS screencapture; run it on a Mac.');
const root = fileURLToPath(new URL('../../', import.meta.url));
const path = file => join(root, file);
const SHOTS = ASSETS.filter(asset => asset.captured);
const log = message => console.log(`capture: ${message}`);
const work = mkdtempSync(join(tmpdir(), 'wp-capture-'));
// Chrome names an unpacked extension after its folder's real path, so install a copy from the temporary
// folder: the ID in the screenshots' address bar then says nothing about where the repository lives.
const extension = join(realpathSync(work), 'extension');
cpSync(root, extension, {recursive: true});

// Real public pages, in the kind of mix anyone might have open: reference, documentation, code and a map.
// No news, shopping, social media, video or email, nothing with ads, cookie notices or sign-in prompts,
// nothing of Google's, and nothing personal. The first page of each window is the one its parking page shows.
const WINDOWS = [
  ['https://en.wikipedia.org/wiki/Bicycle', 'https://docs.python.org/3/library/datetime.html', 'https://github.com/montybwolfe/window-parker/issues',
    'https://www.openstreetmap.org/', 'https://en.wikipedia.org/wiki/Sourdough'],
  ['https://docs.python.org/3/tutorial/index.html', 'https://en.wikipedia.org/wiki/Bread', 'https://www.openstreetmap.org/', 'https://github.com/python/cpython'],
  ['https://en.wikipedia.org/wiki/Chess', 'https://docs.python.org/3/howto/index.html']];
// The window the popup opens over: the page it describes is the first. (GitHub, the
// other choice, shows Chrome's Install button in the address bar.)
const CURRENT = ['https://en.wikipedia.org/wiki/Fountain_pen', 'https://docs.python.org/3/library/pathlib.html'];
// The tab beside Settings.
const BESIDE_SETTINGS = 'https://github.com/montybwolfe/window-parker';

// Each captured window is placed here, exactly the screenshots' size in points.
const BOUNDS = {left: 160, top: 80, width: 1280, height: 800};
// The frontmost app and every on-screen window, front to back.
const screen = () => JSON.parse(execFileSync('osascript', ['-l', 'JavaScript', '-e', `ObjC.import('CoreGraphics'); ObjC.import('AppKit');
function run() {
  const list = ObjC.castRefToObject($.CGWindowListCopyWindowInfo($.kCGWindowListOptionOnScreenOnly, 0)), out = [];
  for (let i = 0; i < list.count; i++) {
    const d = list.objectAtIndex(i), b = d.objectForKey('kCGWindowBounds'), name = d.objectForKey('kCGWindowName');
    out.push({pid: d.objectForKey('kCGWindowOwnerPID').js, id: d.objectForKey('kCGWindowNumber').js, layer: d.objectForKey('kCGWindowLayer').js,
      name: name ? name.js : '', x: b.objectForKey('X').js, y: b.objectForKey('Y').js, w: b.objectForKey('Width').js, h: b.objectForKey('Height').js});
  }
  return JSON.stringify({front: $.NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier, windows: out});
}`], {encoding: 'utf8'}));
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// A capture as sRGB pixels: screencapture writes the display's colour space.
function read(file) {
  execFileSync('sips', ['-m', '/System/Library/ColorSync/Profiles/sRGB Profile.icc', file, '--out', file], {stdio: 'ignore'});
  return decode(readFileSync(file));
}
// A window capture at 2×: the window alone, its corners transparent.
const grab = (target, name) => {
  const file = join(work, `${name}.png`);
  execFileSync('screencapture', ['-x', '-o', '-l', String(target.id), file]);
  return read(file);
};
// The window's rounded corners, flattened onto white. fill, if given, supplies
// what's inside the corners: a capture of the screen over the window, popup and all.
function flatten(win, fill = win) {
  const {width, height, pixels} = win, out = new Uint8Array(pixels.length);
  if (fill.width !== width || fill.height !== height) throw new Error('Captures differ in size');
  for (let i = 0; i < pixels.length; i += 4) {
    const a = pixels[i + 3];
    for (let k = 0; k < 3; k++) out[i + k] = a === 255 ? fill.pixels[i + k] : Math.round((pixels[i + k] * a + 255 * (255 - a)) / 255);
    out[i + 3] = 255;
  }
  return {width, height, pixels: out};
}
const write = (n, image) => { writeFileSync(path(SHOTS[n].file), encode(halve(image))); log(SHOTS[n].file); };

async function session({dark = false} = {}) {
  // An unpacked extension's ID comes from its folder, so its toolbar button can be pinned before Chrome starts.
  const id = [...createHash('sha256').update(extension).digest('hex').slice(0, 32)]
    .map(c => String.fromCharCode(97 + parseInt(c, 16))).join('');
  const cdp = await launch({headless: false, prepare: profile => {
    mkdirSync(join(profile, 'Default'));
    writeFileSync(join(profile, 'Default', 'Preferences'), JSON.stringify({extensions: {pinned_extensions: [id]}}));
  }, extraArgs: ['--disable-search-engine-choice-screen', '--disable-features=Translate', ...(dark ? ['--force-dark-mode'] : [])]});
  try {
    const loaded = (await cdp.send('Extensions.loadUnpacked', {path: extension})).id;
    if (loaded !== id) throw new Error(`Extension ID ${loaded}, expected ${id}`);
  } catch (error) { await cdp.close(); throw error; }
  const url = file => `chrome-extension://${id}/${file}`;
  const S = await attach(cdp, (await cdp.send('Target.createTarget', {url: url('options.html'), newWindow: true})).targetId);
  await sleep(1500);
  const js = expression => evaluate(cdp, S, expression);
  const send = message => js(`chrome.runtime.sendMessage(${JSON.stringify(message)}).then(r => { if (!r.ok) throw new Error(r.error); return r.data; })`);
  const call = expression => js(`Promise.resolve(${expression}).then(r => r === undefined ? null : r)`);
  const worker = async () => attach(cdp, (await cdp.send('Target.getTargets')).targetInfos
    .find(t => t.type === 'service_worker' && t.url === url('background.js')).targetId);
  // Bring a window to the front at the screenshot's size, let it paint, and find it on screen.
  const front = async w => {
    await call(`chrome.windows.update(${w}, {state: 'normal', ...${JSON.stringify(BOUNDS)}, focused: true})`);
    await sleep(900);
    const {front, windows} = screen();
    if (front !== cdp.pid) throw new Error('The test Chrome is not the frontmost app; another app took focus. Run capture.mjs again.');
    const target = windows.find(v => v.pid === cdp.pid && v.layer === 0 && v.x === BOUNDS.left && v.y === BOUNDS.top);
    if (!target || target.w !== BOUNDS.width || target.h !== BOUNDS.height) throw new Error(`Window not at its bounds: ${JSON.stringify(target)}`);
    return target;
  };
  // Every page in a window has finished loading, icon and all, so the parking page and the tab strip show it.
  const loaded = async w => {
    for (const end = Date.now() + 60000; !(await call(`chrome.tabs.query({windowId: ${w}}).then(ts => ts.every(t => t.status === 'complete' && t.favIconUrl))`)); await sleep(500))
      if (Date.now() > end) throw new Error(`Pages in window ${w} did not finish loading`);
  };
  const parkingTab = w => call(`chrome.windows.get(${w}, {populate: true}).then(w => w.tabs.find(t => t.active && t.url.startsWith(${JSON.stringify(url('parked.html#'))}))?.url || '')`);
  // Park windows of real pages for real, with a 1-minute delay, then go back to the defaults.
  const park = async (groups, keep) => {
    const defaults = await send({type: 'settings'});
    await send({type: 'configure', settings: {...defaults, delayMinutes: 1, sleepingMode: 'immediate'}});
    const ids = [];
    for (const urls of groups) ids.push(await call(`chrome.windows.create({url: ${JSON.stringify(urls)}}).then(w => w.id)`));
    // Focus goes back to the window kept in use, so the new windows go unused and park.
    await call(`chrome.windows.update(${keep}, {focused: true})`);
    for (const w of ids) await loaded(w);
    for (const end = Date.now() + 240000; !(await Promise.all(ids.map(parkingTab))).every(Boolean); await sleep(1000))
      if (Date.now() > end) throw new Error('Timed out waiting for windows to park');
    await sleep(5000); log('parked');
    await send({type: 'configure', settings: defaults});
    return ids;
  };
  // A parked window, captured as soon as it's in front: being there starts the
  // 2-second restore delay, so the parking page must still be selected afterwards.
  const parked = async (w, n) => {
    const before = await parkingTab(w), target = await front(w), image = grab(target, `shot-${n}`);
    if (!before || await parkingTab(w) !== before) throw new Error('The window was restored before its capture; run capture.mjs again.');
    write(n, flatten(image));
  };
  return {cdp, url, js, send, call, worker, front, park, parked, loaded, settingsWindow: await call('chrome.windows.getCurrent().then(w => w.id)')};
}

let chrome;
try {
  const s = await session();
  try {
    chrome = (await s.cdp.send('Browser.getVersion')).product;
    // The window the popup opens over, as the window you're using would be.
    const current = await s.call(`chrome.windows.create({url: ${JSON.stringify(CURRENT)}}).then(w => w.id)`);
    await s.loaded(current);
    const ids = await s.park(WINDOWS, current);
    await s.parked(ids[0], 0);

    // The real popup, opened from its toolbar button over the current window. It's a
    // window of its own, so the screen over the browser window is captured with it.
    await sleep(3000);
    const target = await s.front(current);
    await evaluate(s.cdp, await s.worker(), `chrome.action.openPopup({windowId: ${current}}).then(() => 1)`);
    let popup;
    for (const end = Date.now() + 10000; !(popup = (await s.cdp.send('Target.getTargets')).targetInfos.find(t => t.url === s.url('popup.html'))); await sleep(250))
      if (Date.now() > end) throw new Error('The popup did not open');
    const P = await attach(s.cdp, popup.targetId);
    for (const end = Date.now() + 10000; !(await evaluate(s.cdp, P, `!document.getElementById('protect').disabled`)); await sleep(250))
      if (Date.now() > end) throw new Error('The popup did not describe its tab');
    await sleep(1200);
    const {front, windows} = screen(), at = windows.findIndex(v => v.id === target.id), box = {x: target.x, y: target.y, w: target.w, h: target.h};
    if (front !== s.cdp.pid || at < 0) throw new Error('The test Chrome lost focus before the popup capture; run capture.mjs again.');
    // Nothing but the test Chrome's own popup may be over the window.
    const above = windows.slice(0, at).filter(v => overlaps(v, box));
    const others = above.filter(v => v.pid !== s.cdp.pid);
    if (others.length) throw new Error(`Other windows cover the capture: ${others.map(v => v.name || v.id).join(', ')}`);
    if (!above.some(v => v.x >= box.x && v.y >= box.y && v.x + v.w <= box.x + box.w && v.y + v.h <= box.y + box.h)) throw new Error('The popup is not over its window');
    const over = join(work, 'shot-2-screen.png');
    execFileSync('screencapture', ['-x', '-R', `${box.x},${box.y},${box.w},${box.h}`, over]);
    write(1, flatten(grab(target, 'shot-2'), read(over)));
    await s.cdp.send('Target.closeTarget', {targetId: popup.targetId});

    // Settings, in a window with one real page before it. The Parking group and
    // Theme sync; Tab protection stays on this computer.
    await s.send({type: 'sync-enable', keys: ['sleepingMode', 'delayMinutes', 'dwellSeconds', 'appearance']});
    await s.call(`chrome.tabs.create({windowId: ${s.settingsWindow}, url: ${JSON.stringify(BESIDE_SETTINGS)}, index: 0, active: false})`);
    await s.loaded(s.settingsWindow);
    await s.js(`setTimeout(() => location.reload(), 0), 1`); await sleep(2000);
    write(2, flatten(grab(await s.front(s.settingsWindow), 'shot-3')));
    // A little above the Sync section.
    await s.js(`scrollTo(0, Math.round(document.querySelector('[aria-labelledby=sync-heading]').getBoundingClientRect().top + scrollY) - 24), 1`);
    await sleep(1500);
    write(3, flatten(grab(await s.front(s.settingsWindow), 'shot-4')));
  } finally { await s.cdp.close(); }

  // Dark: Chrome's own dark mode, which the extension's Auto theme follows.
  const dark = await session({dark: true});
  try {
    const [w] = await dark.park([WINDOWS[1]], dark.settingsWindow);
    await sleep(3000);
    await dark.parked(w, 4);
  } finally { await dark.cdp.close(); }
} finally { rmSync(work, {recursive: true, force: true}); }

const macOS = execFileSync('sw_vers', ['-productVersion'], {encoding: 'utf8'}).trim();
writeFileSync(path('store-listing/sources/capture.json'), JSON.stringify({capturedWith: chrome, platform: process.platform, macOS,
  screenshots: SHOTS.map(asset => ({file: asset.file, width: asset.width, height: asset.height, alpha: false, sha256: sha(asset.file),
    inputs: Object.fromEntries(inputsOf(asset).map(file => [file, sha(file)]))}))}, null, 2) + '\n');
log('store-listing/sources/capture.json');
