// Renders the icons in headless Chrome, each at its real size from the SVG drawn
// for it (no enlarging or shrinking of another PNG). Development only.
//   node tools/store-assets/icons.mjs 16 32 48 128     writes icons/window-parker-<size>.png
//   node tools/store-assets/icons.mjs 256 512 1024     writes docs/assets/window-parker-<size>.png
// The toolbar sizes have their own sources, with the tile on whole pixels inside
// a 1/16 margin: 16 px from window-parker-16.svg and 32 px from window-parker-32.svg.
// Every other size renders the master, window-parker.svg, whose tile fills the canvas.
import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {launch, attach, sleep} from './cdp.mjs';
import {decode, encode} from './png.mjs';

const path = file => fileURLToPath(new URL(`../../${file}`, import.meta.url));
const source = size => `icons/window-parker${[16, 32].includes(size) ? `-${size}` : ''}.svg`;
const output = size => `${size > 128 ? 'docs/assets' : 'icons'}/window-parker-${size}.png`;

const sizes = process.argv.slice(2).map(Number);
if (!sizes.length || !sizes.every(size => [16, 32, 48, 128, 256, 512, 1024].includes(size))) throw new Error('Give sizes from 16, 32, 48, 128, 256, 512 and 1024');
const cdp = await launch();
try {
  for (const size of sizes) {
    const svg = readFileSync(path(source(size)), 'utf8').replace(/width="\d+" height="\d+"/, `width="${size}" height="${size}" style="display:block"`);
    const {targetId} = await cdp.send('Target.createTarget', {url: 'about:blank'});
    const session = await attach(cdp, targetId);
    await cdp.send('Emulation.setDeviceMetricsOverride', {width: Math.max(size, 200), height: Math.max(size, 200), deviceScaleFactor: 1, mobile: false}, session);
    await cdp.send('Emulation.setDefaultBackgroundColorOverride', {color: {r: 0, g: 0, b: 0, a: 0}}, session);
    await cdp.send('Page.navigate', {url: 'data:text/html,' + encodeURIComponent(`<body style="margin:0">${svg}`)}, session);
    await sleep(500);
    const {data} = await cdp.send('Page.captureScreenshot', {format: 'png', clip: {x: 0, y: 0, width: size, height: size, scale: 1}}, session);
    await cdp.send('Target.closeTarget', {targetId});
    const image = decode(Buffer.from(data, 'base64'));
    if (image.width !== size || image.height !== size) throw new Error(`Rendered ${image.width}×${image.height}, not ${size}`);
    writeFileSync(path(output(size)), encode(image, {alpha: true}));
    console.log(`icons: ${output(size)} from ${source(size)}`);
  }
} finally { await cdp.close(); }
