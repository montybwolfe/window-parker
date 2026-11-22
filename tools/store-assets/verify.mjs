// Checks the Store artwork: exact sizes, no alpha except the icon, outputs that
// match their records, sources that haven't changed since rendering, and (for
// releases) screenshots that still match the current extension UI.
import {existsSync, readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {info} from './png.mjs';

const path = file => fileURLToPath(new URL(`../../${file}`, import.meta.url));
export const sha = file => createHash('sha256').update(readFileSync(path(file))).digest('hex');
// Files that change how the captured extension pages look.
export const UI = ['options.html', 'options.js', 'popup.html', 'popup.js', 'parked.html', 'parked.js', 'ui.css', 'ui.js',
  'theme.js', 'settings.js', 'icons/window-parker.svg', 'icons/window-parker-32.png'];
// The screenshots are real Chrome windows (capture.mjs); the rest are rendered from compositions (compose.mjs).
const shot = (n, name) => ({file: `store-listing/screenshot-${n}-${name}-1280x800.png`, width: 1280, height: 800, captured: true});
export const ASSETS = [shot(1, 'parked'), shot(2, 'popup'), shot(3, 'settings'), shot(4, 'sync'), shot(5, 'dark'),
  {file: 'store-listing/small-promo-440x280.png', page: 'promo-small.html', width: 440, height: 280, uses: []},
  {file: 'store-listing/marquee-promo-1400x560.png', page: 'promo-marquee.html', width: 1400, height: 560, uses: ['store-listing/screenshot-2-popup-1280x800.png']},
  {file: 'store-listing/store-icon-128.png', page: 'icon.html', width: 128, height: 128, alpha: true, uses: []},
  {file: 'docs/assets/buy-me-a-coffee-cover-1600x400.png', page: 'cover.html', width: 1600, height: 400, uses: []}];
export const inputsOf = asset => asset.captured ? ['tools/store-assets/capture.mjs', 'tools/store-assets/png.mjs', ...UI] :
  [`tools/store-assets/compositions/${asset.page}`, 'tools/store-assets/compositions/style.css',
    'icons/window-parker.svg', 'tools/store-assets/compose.mjs', 'tools/store-assets/png.mjs', ...asset.uses];
const RECORDS = {captured: 'store-listing/sources/capture.json', composed: 'store-listing/sources/assets.json'};

export function verifyAssets({ui = true} = {}) {
  const problems = [], byFile = new Map();
  for (const [kind, file] of Object.entries(RECORDS)) {
    const record = JSON.parse(readFileSync(path(file)));
    // The artwork shows the system font, so it's made where that's the font people see: macOS, or Windows for the compositions.
    const platforms = kind === 'captured' ? ['darwin'] : ['darwin', 'win32'];
    if (!platforms.includes(record.platform))
      problems.push(`${file}: made on ${record.platform || 'an unrecorded platform'}; run ${kind === 'captured' ? 'capture.mjs on macOS' : 'compose.mjs on macOS or Windows'}`);
    for (const a of record[kind === 'captured' ? 'screenshots' : 'assets']) byFile.set(a.file, a);
  }
  for (const asset of ASSETS) {
    const r = byFile.get(asset.file);
    if (!r || !existsSync(path(asset.file))) { problems.push(`${asset.file}: missing output or record`); continue; }
    const png = info(readFileSync(path(asset.file)));
    if (png.width !== asset.width || png.height !== asset.height) problems.push(`${asset.file}: ${png.width}×${png.height}`);
    if (png.alpha !== !!asset.alpha) problems.push(`${asset.file}: ${png.alpha ? 'has' : 'lacks'} an alpha channel`);
    const tool = asset.captured ? 'capture.mjs and compose.mjs' : 'compose.mjs';
    if (sha(asset.file) !== r.sha256) problems.push(`${asset.file}: differs from its record; re-run ${tool}`);
    // A screenshot shows the extension's pages, so a change to them makes it stale. That's checked for
    // releases rather than in npm test, because only a Mac can capture them again.
    if (asset.captured && !ui) continue;
    for (const input of inputsOf(asset)) if (!existsSync(path(input)) || sha(input) !== r.inputs[input])
      problems.push(`${asset.file}: ${input} changed since ${asset.captured ? 'it was captured' : 'rendering'}; re-run ${tool}`);
  }
  const fields = JSON.parse(readFileSync(path('store-listing/fields.json')));
  for (const file of [...fields.screenshots, fields.small_promo_tile, fields.marquee_promo_tile, fields.store_icon])
    if (!byFile.has(`store-listing/${file}`)) problems.push(`fields.json lists ${file}, which has no record`);
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problems = verifyAssets();
  for (const problem of problems) console.error(problem);
  console.log(problems.length ? `${problems.length} problem(s)` : `All ${ASSETS.length} images verified against their sources and the current UI.`);
  process.exitCode = problems.length ? 1 : 0;
}
