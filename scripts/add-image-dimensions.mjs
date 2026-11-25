#!/usr/bin/env node
// Adds width/height to question images (hosted on R2) in the static pages,
// so browsers reserve their space and the page does not jump (CLS).
//
//   npm i --no-save image-size@1.1.1 && node scripts/add-image-dimensions.mjs
//
// Sizes are cached in scripts/image-dimensions.json, so later runs only fetch
// new images. Safe to re-run; images that already have width are skipped.
// Run by .github/workflows/image-dimensions.yml (needs network access to R2,
// which this repo's build sandbox does not have).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sizeOf from 'image-size';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, 'scripts', 'image-dimensions.json');
const SKIP = ['dist/', 'node_modules/', 'android/', 'audit-output/', 'www/', '.git/'];
const IMG_RE = /<img\b[^>]*>/g;
const HOST = /^https:\/\/pub-[a-z0-9]+\.r2\.dev\//;

function htmlFiles(dir = ROOT, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.relative(ROOT, path.join(dir, e.name)) + (e.isDirectory() ? '/' : '');
    if (SKIP.some((s) => rel.startsWith(s))) continue;
    if (e.isDirectory()) htmlFiles(path.join(dir, e.name), out);
    else if (e.name.endsWith('.html')) out.push(path.join(dir, e.name));
  }
  return out;
}

const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};
const files = htmlFiles();
const wanted = new Set();
for (const f of files) {
  for (const tag of fs.readFileSync(f, 'utf8').match(IMG_RE) || []) {
    const src = (tag.match(/\bsrc="([^"]+)"/) || [])[1];
    if (src && HOST.test(src) && !/\bwidth=/.test(tag) && !cache[src]) wanted.add(src);
  }
}
console.log(`${files.length} pages, ${wanted.size} image sizes to fetch, ${Object.keys(cache).length} cached`);

async function measure(url) {
  for (const range of ['bytes=0-131071', null]) {
    try {
      const r = await fetch(url, range ? { headers: { Range: range } } : {});
      if (!r.ok) return null;
      const buf = Buffer.from(await r.arrayBuffer());
      const d = sizeOf(buf);
      if (d && d.width && d.height) return [d.width, d.height];
    } catch { /* try the whole file next */ }
  }
  return null;
}

const queue = [...wanted];
let failed = 0;
await Promise.all(Array.from({ length: 16 }, async () => {
  while (queue.length) {
    const url = queue.shift();
    const d = await measure(url);
    if (d) cache[url] = d; else failed++;
  }
}));
fs.writeFileSync(CACHE, JSON.stringify(Object.fromEntries(Object.entries(cache).sort()), null, 0) + '\n');

let pages = 0, imgs = 0;
for (const f of files) {
  const h = fs.readFileSync(f, 'utf8');
  const next = h.replace(IMG_RE, (tag) => {
    const src = (tag.match(/\bsrc="([^"]+)"/) || [])[1];
    if (!src || !HOST.test(src) || /\bwidth=/.test(tag) || !cache[src]) return tag;
    imgs++;
    const [w, hh] = cache[src];
    return tag.replace(/^<img\b/, `<img width="${w}" height="${hh}"`);
  });
  if (next !== h) { fs.writeFileSync(f, next); pages++; }
}
console.log(`sized ${imgs} images on ${pages} pages; ${failed} could not be measured`);
