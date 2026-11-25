#!/usr/bin/env node
// Writes the live question counts into everything that ships with numbers
// baked in, so the first paint is already right:
//   - syllabus.js        topic + subject counts the app starts from, and
//                        window.SYLLABUS_TOTALS (site total / PYQ / topics)
//   - count-map.json     the baked count per /subjects page (the Worker's
//                        reference for swapping in live numbers) + globals
//   - every static page  topic/subject counts in text, number tiles, FAQ
//                        text, JSON-LD and meta tags, plus the site totals
//
//   node scripts/refresh-counts.mjs                fetch site_counts (public RPC)
//   node scripts/refresh-counts.mjs --data f.json  use a saved site_counts result
//   node scripts/refresh-counts.mjs --check        report only; exit 1 if stale
//
// Runs daily from .github/workflows/refresh-counts.yml. The Worker and the
// app still swap in live numbers between runs.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const dataArg = args[args.indexOf('--data') + 1];
const SKIP = ['dist/', 'node_modules/', 'android/', 'audit-output/', 'www/', '.git/'];

// ---------------------------------------------------------------- live data
async function fetchLive() {
  const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const url = (app.match(/SUPABASE_URL\s*=\s*'([^']+)'/) || [])[1];
  const key = (app.match(/SUPABASE_ANON_KEY\s*=\s*'([^']+)'/) || [])[1];
  const r = await fetch(`${url}/rest/v1/rpc/site_counts`, {
    method: 'POST', body: '{}',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  });
  if (!r.ok) throw new Error(`site_counts HTTP ${r.status}`);
  return r.json();
}
const live = args.includes('--data') ? JSON.parse(fs.readFileSync(dataArg, 'utf8')) : await fetchLive();
if (!live || !live.total || !live.modules || Object.keys(live.modules).length < 100) {
  throw new Error('site_counts looks empty; refusing to write zeros');
}

// ---------------------------------------------------------------- baselines
const cmFile = path.join(ROOT, 'count-map.json');
const cm = JSON.parse(fs.readFileSync(cmFile, 'utf8'));
const oldG = cm.globals || { total: 36219, pyq: 6937, topics: 740 };
const newG = { total: Number(live.total), pyq: Number(live.pyq || oldG.pyq), topics: Number(live.topics || oldG.topics) };
const liveN = (e) => e.m.reduce((s, id) => s + Number(live.modules[id] || 0), 0);
const entries = {};
for (const [p, e] of Object.entries(cm.paths)) entries[p] = { old: e.n, now: liveN(e) };

// ---------------------------------------------------------------- text rules
const fmt = (n) => Number(n).toLocaleString('en-US');
const near = (v, baked) => baked > 0 && Math.abs(v - baked) <= Math.max(2, baked * 0.25);
// Same words the Worker recognises after a count, plus "exam-style"/"curated".
const Q_WORD = '(?:\\s|&nbsp;)*(?:(?:practice|topic-wise|high-yield|exam-style|curated|free)\\s+)?(?:MCQs?|questions|Questions|QUESTIONS|Qs)\\b';
const NUM_Q = new RegExp('\\b(\\d{1,3}(?:,\\d{3})+|\\d+)(?=' + Q_WORD + ')', 'g');
const ONLY_NUM = /^(\s*)(\d{1,3}(?:,\d{3})+|\d+)(\s*)$/;
const num = (s) => parseInt(s.replace(/,/g, ''), 10);

function swapGlobals(t) {
  if (oldG.total !== newG.total) t = t.replaceAll(fmt(oldG.total), fmt(newG.total)).replace(new RegExp(`\\b${oldG.total}\\b`, 'g'), String(newG.total));
  if (oldG.pyq !== newG.pyq) t = t.replaceAll(fmt(oldG.pyq), fmt(newG.pyq));
  if (oldG.topics !== newG.topics) t = t.replace(new RegExp(`\\b${oldG.topics} topics`, 'g'), `${newG.topics} topics`);
  return t;
}
function swapEntry(t, e) {
  if (!e || e.old === e.now) return t;
  return t.replace(NUM_Q, (m) => (near(num(m), e.old) ? fmt(e.now) : m));
}
function swapOnly(t, e, min = 0) {
  if (!e || e.old === e.now) return t;
  const m = t.match(ONLY_NUM);
  if (m && near(num(m[2]), e.old) && num(m[2]) > min) return m[1] + fmt(e.now) + m[3];
  return t;
}

// ---------------------------------------------------------------- pages
const TOKEN = /<!--[\s\S]*?-->|<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>|<[^>]+>|[^<]+/g;
const entryFor = (href) => entries[(href.split(/[?#]/)[0].replace(/\/+$/, '') || '/')] || null;

function rewrite(html, pagePath) {
  const page = entries[pagePath] || null;
  let link = null, row = null, inRow = false, tile = false;
  return html.replace(TOKEN, (tok) => {
    if (tok[0] !== '<') {
      let t = swapGlobals(tok);
      if (link) return swapEntry(t, link);
      if (row) { t = swapEntry(t, row); return swapOnly(t, row, 99); }
      if (tile) return swapOnly(t, page);
      return swapEntry(t, page);
    }
    if (tok.startsWith('<!--')) return tok;
    if (/^<script\b/i.test(tok)) {
      if (!/application\/ld\+json/i.test(tok)) return tok;
      const i = tok.indexOf('>') + 1, j = tok.lastIndexOf('</script>');
      return tok.slice(0, i) + swapEntry(swapGlobals(tok.slice(i, j)), page) + tok.slice(j);
    }
    if (/^<style\b/i.test(tok)) return tok;
    const tag = (tok.match(/^<\/?([a-zA-Z0-9]+)/) || [])[1]?.toLowerCase();
    const closing = tok[1] === '/';
    if (tag === 'a') {
      if (closing) link = null;
      else {
        const href = (tok.match(/\bhref="([^"]*)"/) || [])[1] || '';
        link = href.startsWith('/') ? entryFor(href) : null;
        if (link && inRow && !row) row = link;
      }
    } else if (tag === 'tr') {
      inRow = !closing; row = null;
    } else if (/\bclass="[^"]*\bbento-stat-num\b/.test(tok)) {
      tile = true;
    } else if (closing && tile) {
      tile = false;
    }
    if (tag === 'meta' && /\bcontent="[^"]*\d/.test(tok)) {
      return tok.replace(/(\bcontent=")([^"]*)(")/, (m, a, c, b) => a + swapEntry(swapGlobals(c), page) + b);
    }
    return tok;
  });
}

function htmlFiles(dir = ROOT, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    const rel = path.relative(ROOT, full) + (e.isDirectory() ? '/' : '');
    if (SKIP.some((s) => rel.startsWith(s))) continue;
    if (e.isDirectory()) htmlFiles(full, out);
    else if (e.name.endsWith('.html')) out.push(full);
  }
  return out;
}
const pagePathOf = (file) => {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  if (rel === 'index.html') return '/';
  return '/' + rel.replace(/\/index\.html$/, '').replace(/\.html$/, '');
};

const changed = [];
const write = (file, next) => {
  if (fs.readFileSync(file, 'utf8') === next) return;
  changed.push(path.relative(ROOT, file));
  if (!CHECK) fs.writeFileSync(file, next);
};

for (const f of htmlFiles()) write(f, rewrite(fs.readFileSync(f, 'utf8'), pagePathOf(f)));

// ---------------------------------------------------------------- syllabus.js
const sylFile = path.join(ROOT, 'syllabus.js');
const sylSrc = fs.readFileSync(sylFile, 'utf8');
const sylJson = sylSrc.slice(sylSrc.indexOf('['), sylSrc.lastIndexOf(']') + 1);
const SYL = JSON.parse(sylJson);
for (const s of SYL) {
  let sum = 0;
  for (const m of s.modules) { m.questionCount = Number(live.modules[m.id] || 0); sum += m.questionCount; }
  s.questionCount = sum;
}
write(sylFile, 'window.SYLLABUS_DATA = ' + JSON.stringify(SYL, null, 2) + ';\n' +
  'window.SYLLABUS_TOTALS = ' + JSON.stringify(newG) + ';\n');

// ---------------------------------------------------------------- count-map
for (const [p, e] of Object.entries(cm.paths)) e.n = entries[p].now;
write(cmFile, JSON.stringify({ globals: newG, paths: cm.paths }) + '\n');

const moved = Object.values(entries).filter((e) => e.old !== e.now).length;
console.log(`total ${oldG.total} -> ${newG.total}; ${moved} of ${Object.keys(entries).length} subject/topic counts changed; ${changed.length} files ${CHECK ? 'stale' : 'updated'}`);
if (CHECK && changed.length) process.exit(1);
