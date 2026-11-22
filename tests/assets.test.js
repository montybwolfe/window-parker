import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);
const text=name=>readFileSync(new URL(name,root),'utf8');

test('all shipped surfaces use the moon icon; raster dimensions match declarations',()=>{
 const manifest=JSON.parse(text('manifest.json'));
 assert.deepEqual(Object.keys(manifest.icons),['16','32','48','128']);
 for(const [size,name] of Object.entries(manifest.icons)){
  assert.equal(name,`icons/window-parker-${size}.png`);
  const png=readFileSync(new URL(name,root));assert.equal(png.readUInt32BE(16),Number(size));assert.equal(png.readUInt32BE(20),Number(size));
 }
 // Toolbar icons at 1× and 2× (Retina), each a real render at that size. Chrome draws one of these two at
 // every screen scale (at 1.5× it shrinks the 32 px icon), so a 24 px icon would never be used.
 assert.deepEqual(manifest.action.default_icon,{'16':'icons/window-parker-16.png','32':'icons/window-parker-32.png'});
 for(const [size,name] of Object.entries(manifest.action.default_icon)){
  const png=readFileSync(new URL(name,root));assert.equal(png.readUInt32BE(16),Number(size));assert.equal(png.readUInt32BE(20),Number(size));
  assert.equal(png[25],6,`${name}: RGBA, so the corners stay transparent`);
 }
 // The pages' brand mark is the master SVG, so it stays sharp at any zoom.
 assert(text('scripts/package.py').includes("'icons/window-parker.svg'"),'the master SVG ships');
 for(const page of ['options.html','popup.html','parked.html']){
  assert(text(page).includes('rel="icon" href="icons/window-parker-32.png"'));
  assert(text(page).includes('src="icons/window-parker.svg"'));
 }
 assert(text('README.md').includes('src="icons/window-parker-128.png"'));
 for(const name of readdirSync(root).filter(n=>/\.(html|css|js|json)$/.test(n)))assert(!/icons\/(?:\d+\.png|icon\.svg)|parker-timer/.test(text(name)),name);
 assert.deepEqual(readdirSync(new URL('icons/',root)).sort(),['window-parker-128.png','window-parker-16.png','window-parker-16.svg','window-parker-32.png','window-parker-32.svg','window-parker-48.png','window-parker.svg']);
 // Plain vectors: no embedded images, text or fonts, metadata, scripts, filters or outside references.
 for(const svg of ['window-parker.svg','window-parker-32.svg','window-parker-16.svg'])assert(!/<image|<text|<metadata|<script|filter|data:|https?:\/\/(?!www.w3.org)/.test(text(`icons/${svg}`)),svg);
 for(const size of [256,512,1024]){const p=readFileSync(new URL(`docs/assets/window-parker-${size}.png`,root));assert.equal(p.readUInt32BE(16),size);assert.equal(p.readUInt32BE(20),size);}
});

test('no image under public/ carries Content Credentials: no caBX chunk in a PNG, no c2pa in an SVG',()=>{
 // C2PA Content Credentials record which tool wrote a file. Everything here is published, so none may carry them.
 const base=fileURLToPath(root),images=[];
 const walk=dir=>{for(const entry of readdirSync(dir,{withFileTypes:true})){const file=join(dir,entry.name);if(entry.isDirectory())walk(file);else if(/\.(png|svg)$/i.test(entry.name))images.push(file);}};
 walk(base);
 assert(images.length>=20,`only ${images.length} images found`);
 for(const file of images){
  const data=readFileSync(file),name=relative(base,file);
  if(/\.svg$/i.test(name)){assert(!/c2pa/i.test(data.toString('utf8')),`${name} mentions c2pa`);continue;}
  assert.equal(data.toString('latin1',1,4),'PNG',name);
  for(let at=8;at+8<=data.length;at+=data.readUInt32BE(at)+12)assert.notEqual(data.toString('latin1',at+4,at+8),'caBX',`${name} has a caBX chunk`);
 }
});

test('README: Google\'s Chrome Web Store badge, unmodified, and every Store link goes to the listing',()=>{
 const {store_url}=JSON.parse(text('store-listing/fields.json')),readme=text('README.md');
 // Without its border on GitHub's light theme (the white background it's made for); the bordered badge otherwise.
 assert(readme.includes(`<a href="${store_url}"><picture><source media="(prefers-color-scheme: light)" srcset="docs/assets/chrome-web-store-badge-no-border.png"><img src="docs/assets/chrome-web-store-badge.png" alt="Available in the Chrome Web Store" width="206"></picture></a>`));
 assert.deepEqual([...new Set(readme.match(/https:\/\/chromewebstore\.google\.com\/[^\s)"<>]+/g))],[store_url]);
 // Google's guidelines allow resizing only: these are its 340×96 badges, byte for byte.
 for(const [file,sha] of [['chrome-web-store-badge.png','fbf289fca885e58a1507cc8c69a9df68f35e83e683825b3ad6cd617b0a17d79c'],['chrome-web-store-badge-no-border.png','f49e4bff319083c20b3386f23547315773631e155e389ed42550295e4913e12d']])
  assert.equal(createHash('sha256').update(readFileSync(new URL(`docs/assets/${file}`,root))).digest('hex'),sha,file);
});

test('Store reviewer instructions fit the 500-character Test instructions field',()=>{
 // Plain ASCII, and still within the limit if every line break is submitted as CRLF.
 const t=text('store-listing/test-instructions.txt').replace(/\n$/,'');
 assert(/^[\x20-\x7e\n]*$/.test(t),'plain ASCII');assert(t.length+(t.match(/\n/g)||[]).length<=500,`${t.length} characters`);
});

test('Store artwork: exact sizes, no alpha outside the icon, and outputs that match their recorded sources',async()=>{
 const {verifyAssets}=await import('../tools/store-assets/verify.mjs');
 assert.deepEqual(verifyAssets({ui:false}),[]);
});

test('Halving the artwork weights colour by alpha, so transparent pixels never darken an edge',async()=>{
 const {halve}=await import('../tools/store-assets/png.mjs');
 const block=pixels=>[...halve({width:2,height:2,pixels:Uint8Array.from(pixels.flat())}).pixels];
 const clear=[0,0,0,0],white=[255,255,255,255];
 assert.deepEqual(block([clear,clear,clear,clear]),[0,0,0,0]);
 assert.deepEqual(block([white,clear,clear,clear]),[255,255,255,64]);
 // Opaque pixels come out as the plain 2×2 box filter made them, rounding a quarter down and a half or more up.
 const opaque=[[10,1,200,255],[11,1,201,255],[12,1,0,255],[0,0,1,255]];
 const box=k=>(opaque.reduce((sum,p)=>sum+p[k],0)+2)>>2;
 assert.deepEqual(block(opaque),[box(0),box(1),box(2),255]);
 assert.deepEqual(block(opaque),[8,1,101,255]);
});
