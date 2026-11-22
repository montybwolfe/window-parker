// Checks the extension's pages against the 2.0 design language in Chrome. Development only;
// never packaged, and no npm dependencies. Run from this folder's parent:
//
//   CHROME=/path/to/chrome node tools/ui-audit.mjs [--no-sandbox]
//
// 1. The colour pairs from ui.css's tokens, in light and dark (WCAG AA).
// 2. Settings at 320 px and 420 px wide, at desktop width and at 200% zoom:
//    sideways overflow, and whether the version stamp overlaps anything.
//    The parking page at 320 px and at desktop width.
// 3. The popup's height in each state, against Chrome's 600 px limit.
// 4. On every page and popup state, in both themes: each text element against
//    the colour behind it, each control's edge, focus rings along the Tab order,
//    and target sizes (24 px, or WCAG 2.2's spacing exception).
// 5. The confirmation from the keyboard: Enter opens it with Cancel focused,
//    and Escape closes it and returns focus to its button.
//
// The extension is installed in a throwaway headless profile (see
// store-assets/cdp.mjs). The popup is shown with made-up status replies, so its
// height doesn't depend on the tabs that happen to be open; nothing is sent to
// the worker except what the page itself asks for. Exits non-zero on a problem.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {launch, evaluate, attach, sleep} from './store-assets/cdp.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const POPUP_LIMIT = 600;

// ---- Tokens ------------------------------------------------------------------

export function tokens(css = readFileSync(root + 'ui.css', 'utf8')) {
  const block = selector => {
    const start = css.indexOf(`${selector} {`);
    return Object.fromEntries([...css.slice(start, css.indexOf('}', start)).matchAll(/--([\w-]+): (#[0-9A-Fa-f]{6})\b/g)].map(m => [m[1], m[2].toUpperCase()]));
  };
  const light = block(':root');
  return {light, dark: {...light, ...block(':root[data-theme="dark"]')}};
}
const linear = c => (c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const luminance = hex => { const [r, g, b] = [1, 3, 5].map(i => linear(parseInt(hex.slice(i, i + 2), 16))); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
// [what, foreground, background, minimum]; 0 means decorative, reported only.
export function pairs(t, theme) {
  const checked = theme === 'dark' ? t.link : t.press; // accent-color
  return [
    ['Ink on page (text)', t.ink, t.page, 4.5],
    ['Ink on field (typed text, tab list)', t.ink, t.field, 4.5],
    ['Ink on button face', t.ink, t.button, 4.5],
    ['Ink on button face, hover', t.ink, t['button-hover'], 4.5],
    ['Ink on button face, pressed', t.ink, t['button-down'], 4.5],
    ['Muted on page (help, mode line, version stamp)', t.muted, t.page, 4.5],
    ['Muted on field ("Window 2", the sync choice box)', t.muted, t.field, 4.5],
    ['Link on page (Changelog, Support links)', t.link, t.page, 4.5],
    ['White on default button', t['on-press'], t.press, 4.5],
    ['White on default button, hover', t['on-press'], t['press-hover'], 4.5],
    ['White on default button, pressed', t['on-press'], t['press-down'], 4.5],
    ['Amber on page (counts, "This window is parked.")', t.amber, t.page, 4.5],
    ['Danger on page (clearing buttons, errors)', t.danger, t.page, 4.5],
    ['Danger on danger wash (clearing button, hover)', t.danger, t['danger-wash'], 4.5],
    ['Control edge against page', t.edge, t.page, 3],
    ['Control edge against field', t.edge, t.field, 3],
    ['Control edge against button face', t.edge, t.button, 3],
    ['Control edge, hover, against page', t['edge-hover'], t.page, 3],
    ['Default button fill against page', t.press, t.page, 3],
    ['Danger edge against page', t['danger-edge'], t.page, 3],
    ['Focus ring against page', t.focus, t.page, 3],
    ['Focus ring against field', t.focus, t.field, 3],
    ['Checked box or radio against page', checked, t.page, 3],
    ['Checked box against field (tab list)', checked, t.field, 3],
    ['Icon buttons (muted) against page', t.muted, t.page, 3],
    ['Hairline against page (decorative)', t.line, t.page, 0],
  ];
}

// ---- In the page -------------------------------------------------------------

// Runs in each page; defines window.__audit.
function install() {
  const parse = c => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return {r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1}; };
  const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const lum = c => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return Math.round((x + 0.05) / (y + 0.05) * 100) / 100; };
  const blend = (top, under) => ({r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1});
  const opacityOf = el => { let o = 1; for (let n = el; n; n = n.parentElement) o *= Number(getComputedStyle(n).opacity); return o; };
  // What is behind an element: its own and its ancestors' backgrounds, down to the page.
  const bgOf = el => {
    const stack = [];
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c && c.a > 0) { stack.push(c); if (c.a === 1) break; } }
    let base = parse(getComputedStyle(document.documentElement).backgroundColor) || {r: 255, g: 255, b: 255, a: 1};
    for (const c of stack.reverse()) base = blend(c, base);
    return base;
  };
  const colourOn = (value, el, under) => { const c = parse(value); return c ? blend({...c, a: c.a * opacityOf(el)}, under) : under; };
  const hex = c => '#' + [c.r, c.g, c.b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
  const shown = el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[hidden], .visually-hidden') && !el.closest('details:not([open]) > :not(summary)');
  const name = el => (el.getAttribute('aria-label') || (el.labels?.length ? el.labels[0].textContent : '') || (el.matches('select, textarea, input') ? el.id : el.textContent) || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 32);
  function text() {
    const out = [], seen = new Set(), walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let t; (t = walker.nextNode());) {
      const el = t.parentElement;
      if (!t.textContent.trim() || seen.has(el)) continue;
      seen.add(el);
      // Disabled controls are exempt from contrast requirements.
      if (!shown(el) || el.closest('button:disabled, fieldset:disabled')) continue;
      const cs = getComputedStyle(el), bg = bgOf(el), fg = colourOn(cs.color, el, bg);
      const size = parseFloat(cs.fontSize), weight = Number(cs.fontWeight);
      out.push({text: t.textContent.trim().slice(0, 40), fg: hex(fg), bg: hex(bg), ratio: ratio(fg, bg), need: size >= 24 || (size >= 18.66 && weight >= 700) ? 3 : 4.5});
    }
    return out;
  }
  function edges() {
    const out = [];
    for (const el of document.querySelectorAll('button, select, input[type=number], textarea')) {
      if (!shown(el) || el.disabled || el.matches('.link')) continue;
      const cs = getComputedStyle(el), behind = bgOf(el.parentElement);
      if (el.matches('.icon-button')) {
        // An icon button has no edge at rest: its icon is what has to stand out.
        const icon = colourOn(cs.color, el, behind);
        out.push({el: name(el), ratio: ratio(icon, behind), detail: `icon ${hex(icon)} on ${hex(behind)}`});
        continue;
      }
      const edge = colourOn(cs.borderTopColor, el, behind), fill = colourOn(cs.backgroundColor, el, behind);
      out.push({el: name(el), ratio: Math.max(ratio(edge, behind), ratio(fill, behind)), detail: `edge ${hex(edge)}, fill ${hex(fill)} on ${hex(behind)}`});
    }
    return out;
  }
  function focusRing() {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const cs = getComputedStyle(el), width = cs.outlineStyle === 'none' ? 0 : parseFloat(cs.outlineWidth);
    // With a negative offset the ring is drawn over the element's own background.
    const behind = parseFloat(cs.outlineOffset) < 0 ? bgOf(el) : bgOf(el.parentElement);
    return {name: name(el), id: el.id, width, ratio: width ? ratio(colourOn(cs.outlineColor, el, behind), behind) : 0, visible: el.matches(':focus-visible')};
  }
  function targets() {
    const list = [...document.querySelectorAll('button, a[href], select, input, textarea, summary')].filter(el => shown(el) && !el.matches('[tabindex="-1"][aria-hidden="true"]'))
      .map(el => { const label = el.matches('input[type=checkbox], input[type=radio]') && el.closest('label'); return {el: name(label || el), box: (label || el).getBoundingClientRect()}; });
    const small = list.filter(t => t.box.width < 24 || t.box.height < 24);
    const centre = b => [b.x + b.width / 2, b.y + b.height / 2];
    const distance = ([x, y], b) => Math.hypot(Math.max(b.left - x, 0, x - b.right), Math.max(b.top - y, 0, y - b.bottom));
    return small.map(t => {
      const c = centre(t.box);
      // Spacing exception: a 24 px circle on the target touches no other target or undersized circle.
      const clear = list.every(o => o === t || (small.includes(o) ? Math.hypot(c[0] - centre(o.box)[0], c[1] - centre(o.box)[1]) >= 24 : distance(c, o.box) >= 12));
      return {el: t.el, w: Math.round(t.box.width), h: Math.round(t.box.height), clear};
    });
  }
  // Sideways overflow, and the elements sticking out furthest.
  function overflow() {
    const width = document.documentElement.clientWidth, extra = document.documentElement.scrollWidth - width;
    const out = [...document.querySelectorAll('body *')].filter(el => el.getClientRects().length && el.getBoundingClientRect().right > width + 0.5)
      .filter(el => ![...el.children].some(c => c.getBoundingClientRect().right > width + 0.5)).slice(0, 5)
      .map(el => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : el.className ? '.' + String(el.className).split(' ')[0] : ''} (right ${Math.round(el.getBoundingClientRect().right)})`);
    return {width, scrollWidth: document.documentElement.scrollWidth, extra, out};
  }
  // What the version stamp touches, if anything, and how far it is from the nearest content.
  function stamp() {
    const tag = document.getElementById('version').getBoundingClientRect(), width = document.documentElement.clientWidth;
    const hits = [...document.querySelectorAll('main *')].filter(el => shown(el) && (el.children.length === 0 || el.matches('img, input, button, select, textarea, legend, h1, p')))
      .filter(el => { const r = el.getBoundingClientRect(); return r.width && r.height && r.left < tag.right && r.right > tag.left && r.top < tag.bottom && r.bottom > tag.top; })
      .map(el => el.id || el.tagName.toLowerCase());
    const below = Math.min(...[...document.querySelectorAll('main *')].filter(shown).map(el => el.getBoundingClientRect().top).filter(top => top >= tag.top));
    return {text: document.getElementById('version').textContent, left: Math.round(tag.left), top: Math.round(tag.top), right: Math.round(tag.right), bottom: Math.round(tag.bottom),
      inside: tag.left >= 0 && tag.right <= width && tag.top >= 0, hits, gap: Math.round(below - tag.bottom)};
  }
  window.__audit = {text, edges, focusRing, targets, overflow, stamp};
}

// ---- The popup's made-up status replies ------------------------------------

const TAB = {id: 1, title: 'Flights to Hobart: compare fares and dates for March', url: 'https://flights.example/hobart', protected: false, protectable: true};
const STATUS = {enabled: true, parkingTabs: 3, protectedTabs: 2, currentTab: TAB,
  windows: [{id: 1, parked: false, sleeping: 3}, {id: 2, parked: true, sleeping: 4}, {id: 3, parked: true, sleeping: 1}]};
const STATES = {
  normal: {status: STATUS},
  'Protect unavailable': {status: {...STATUS, currentTab: {...TAB, title: 'Extensions', url: 'chrome://extensions/', protectable: false}}},
  'clearing open': {status: STATUS, open: true},
  'confirmation open': {status: STATUS, open: true, confirm: true},
  paused: {status: {...STATUS, enabled: false}},
};
// Installed before popup.js runs: answers status with the state's reply.
const fixture = status => `(() => { const reply = ${JSON.stringify(status)}, send = chrome.runtime.sendMessage.bind(chrome.runtime);
  chrome.runtime.sendMessage = message => message?.type === 'status' ? Promise.resolve({ok: true, data: structuredClone(reply)}) : send(message); })();`;

// ---- Running it ----------------------------------------------------------------

export async function audit({extraArgs = []} = {}) {
  let problems = 0;
  const fail = (ok, line) => { if (!ok) problems++; console.log(`${ok ? '  ok  ' : '  FAIL'} ${line}`); };

  console.log('Token pairs (ui.css)');
  for (const [theme, t] of Object.entries(tokens())) for (const [label, a, b, min] of pairs(t, theme)) {
    const r = contrast(a, b);
    if (min) fail(r >= min, `${theme}: ${r.toFixed(2)}:1 ${label} (${a} on ${b}, needs ${min})`);
    else console.log(`   --  ${theme}: ${r.toFixed(2)}:1 ${label}`);
  }

  const cdp = await launch({extraArgs});
  try {
    const {id} = await cdp.send('Extensions.loadUnpacked', {path: root});
    const version = await cdp.send('Browser.getVersion');
    console.log(`\n${version.product}`);
    const open = async (path, {width, height, scale = 1, theme = 'light', script}) => {
      const {targetId} = await cdp.send('Target.createTarget', {url: 'about:blank'});
      const session = await attach(cdp, targetId);
      await cdp.send('Page.enable', {}, session);
      if (script) await cdp.send('Page.addScriptToEvaluateOnNewDocument', {source: script}, session);
      await cdp.send('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: scale, mobile: false}, session);
      await cdp.send('Emulation.setEmulatedMedia', {features: [{name: 'prefers-color-scheme', value: theme}, {name: 'prefers-reduced-motion', value: 'reduce'}]}, session);
      await cdp.send('Emulation.setFocusEmulationEnabled', {enabled: true}, session);
      await cdp.send('Page.navigate', {url: `chrome-extension://${id}/${path}`}, session);
      await sleep(1200);
      await evaluate(cdp, session, `(${install})(), 1`);
      const js = expression => evaluate(cdp, session, expression);
      const close = () => cdp.send('Target.closeTarget', {targetId});
      return {session, js, close};
    };
    const key = async (session, name) => {
      const codes = {Tab: 9, Enter: 13, Escape: 27};
      await cdp.send('Input.dispatchKeyEvent', {type: 'keyDown', key: name, code: name, windowsVirtualKeyCode: codes[name], ...(name === 'Enter' ? {text: '\r'} : {})}, session);
      await cdp.send('Input.dispatchKeyEvent', {type: 'keyUp', key: name, code: name, windowsVirtualKeyCode: codes[name]}, session);
      await sleep(60);
    };
    // Text, edges, targets and the focus ring at every Tab stop.
    const checks = async (page, label, {tab = true} = {}) => {
      const text = await page.js('__audit.text()'), edges = await page.js('__audit.edges()'), targets = await page.js('__audit.targets()');
      const low = [...text].sort((a, b) => a.ratio - b.ratio)[0], weak = text.filter(r => r.ratio < r.need);
      fail(!weak.length, `${label}: text, ${text.length} elements; lowest ${low.ratio}:1 "${low.text}" (${low.fg} on ${low.bg})${weak.map(w => `; ${w.ratio}:1 "${w.text}"`).join('')}`);
      const edge = [...edges].sort((a, b) => a.ratio - b.ratio)[0], thin = edges.filter(e => e.ratio < 3);
      fail(!thin.length, `${label}: control edges, ${edges.length} controls; lowest ${edge ? `${edge.ratio}:1 ${edge.el} (${edge.detail})` : 'none'}${thin.map(e => `; ${e.ratio}:1 ${e.el}`).join('')}`);
      const small = targets.filter(t => !t.clear);
      fail(!small.length, `${label}: targets under 24 px: ${targets.length ? targets.map(t => `${t.el} ${t.w}×${t.h}${t.clear ? '' : ' (too close)'}`).join(', ') : 'none'}`);
      if (!tab) return;
      await page.js('document.activeElement?.blur(), 1');
      const order = [];
      for (let i = 0; i < 80; i++) {
        await key(page.session, 'Tab');
        const ring = await page.js('__audit.focusRing()');
        if (!ring || (order.length && order[0].name === ring.name && order[0].id === ring.id)) break;
        order.push(ring);
      }
      const poor = order.filter(o => !o.visible || o.width < 2 || o.ratio < 3);
      fail(order.length && !poor.length, `${label}: ${order.length} Tab stops, focus rings ${poor.length ? `weak on ${poor.map(o => `${o.name} (${o.width}px, ${o.ratio}:1)`).join(', ')}` : `all 2 px, lowest ${Math.min(...order.map(o => o.ratio))}:1`}`);
      console.log(`         ${order.map(o => o.name).join(' > ')}`);
    };

    console.log('\nSettings: sideways overflow and the version stamp');
    for (const theme of ['light', 'dark']) for (const [label, width, scale] of [['320 px', 320, 1], ['420 px', 420, 1], ['1280 px', 1280, 1], ['200% zoom of 1280 px', 640, 2]]) {
      const page = await open('options.html', {width, height: 900, scale, theme});
      const o = await page.js('__audit.overflow()'), s = await page.js('__audit.stamp()');
      fail(o.extra <= 0, `${theme}, ${label}: page ${o.scrollWidth} px in a ${o.width} px viewport${o.extra > 0 ? `, overflow ${o.extra} px: ${o.out.join(', ')}` : ', no overflow'}`);
      fail(s.inside && !s.hits.length && s.gap >= 0, `${theme}, ${label}: version stamp "${s.text}" at ${s.left},${s.top}–${s.right},${s.bottom}; overlaps ${s.hits.length ? s.hits.join(', ') : 'nothing'}; ${s.gap} px above the content`);
      if (width === 1280) await checks(page, `Settings, ${theme}`);
      await page.close();
    }

    console.log('\nParking page');
    for (const theme of ['light', 'dark']) for (const width of [320, 1280]) {
      const page = await open('parked.html', {width, height: 800, theme});
      // A long title and the text a parked window shows; this tab itself isn't parked.
      await page.js(`document.getElementById('previous').textContent = 'Pull request 482: Fix the restore timer firing early after the computer wakes from sleep';
        document.getElementById('previousHost').textContent = 'github.example.com';
        document.getElementById('detailTabs').textContent = 'Your tabs are all still in this window, and 3 of them are asleep.';
        document.getElementById('detailReturn').textContent = 'Stay\\u00a02\\u00a0seconds and your tab comes back.'; 1`);
      const o = await page.js('__audit.overflow()');
      fail(o.extra <= 0, `${theme}, ${width} px: page ${o.scrollWidth} px in a ${o.width} px viewport${o.extra > 0 ? `, overflow ${o.extra} px: ${o.out.join(', ')}` : ', no overflow'}`);
      if (width === 1280) await checks(page, `Parking page, ${theme}`);
      await page.close();
    }

    console.log(`\nPopup: height in each state (Chrome's limit is ${POPUP_LIMIT} px)`);
    for (const theme of ['light', 'dark']) for (const [state, {status, open: expand, confirm}] of Object.entries(STATES)) {
      const page = await open('popup.html', {width: 340, height: 600, theme, script: fixture(status)});
      // Whether the expander is open is remembered between openings; set it for each state.
      await page.js(`document.getElementById('clearing').open = ${!!expand}, 1`); await sleep(100);
      if (confirm) { await page.js(`document.getElementById('closeParked').focus(), 1`); await key(page.session, 'Enter'); }
      const height = await page.js('Math.ceil(document.body.getBoundingClientRect().height)'), o = await page.js('__audit.overflow()');
      fail(height < POPUP_LIMIT && o.extra <= 0, `${theme}, ${state}: ${height} px tall${o.extra > 0 ? `, overflows ${o.extra} px sideways` : ''}`);
      if (confirm) {
        const opened = await page.js('document.activeElement.id');
        await key(page.session, 'Escape');
        const [hidden, back] = await page.js(`[document.getElementById('confirm').hidden, document.activeElement.id]`);
        fail(opened === 'confirmCancel' && hidden && back === 'closeParked', `${theme}, confirmation by keyboard: Enter focuses ${opened}; Escape ${hidden ? 'closes it' : 'leaves it open'} and focus returns to ${back}`);
        await page.js(`document.getElementById('closeParked').focus(), 1`); await key(page.session, 'Enter');
      }
      await checks(page, `Popup ${state}, ${theme}`, {tab: !confirm});
      await page.js(`document.getElementById('clearing').open = false, 1`); await sleep(100);
      await page.close();
    }
  } finally {
    // Chrome can still be writing to its throwaway profile as it exits; that's not a page problem.
    try { await cdp.close(); } catch (error) { console.log(`\n(The throwaway profile wasn't fully removed: ${error.message})`); }
  }
  console.log(`\n${problems ? `${problems} problem(s)` : 'No problems found.'}`);
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problems = await audit({extraArgs: process.argv.slice(2).filter(arg => arg === '--no-sandbox')});
  process.exitCode = problems ? 1 : 0;
}
