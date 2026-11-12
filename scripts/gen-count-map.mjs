#!/usr/bin/env node
/**
 * Build count-map.json: which question-bank modules each /subjects/... page
 * stands for, and the count baked into the static HTML. worker.js uses it to
 * swap the baked numbers for live ones (see liveCounts in worker.js).
 *
 * Run after adding or renaming subject/topic pages: node scripts/gen-count-map.mjs
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ctx = { window: {} };
vm.runInNewContext(readFileSync(join(ROOT, 'syllabus.js'), 'utf8'), ctx);
const SYL = ctx.window.SYLLABUS_DATA;

const norm = (s) => s.replace(/&amp;/g, '&').replace(/&#39;|&#x27;|&rsquo;|’/g, "'").toLowerCase().replace(/[^a-z0-9]+/g, '');
const paths = {};
const missing = [];

for (const slug of readdirSync(join(ROOT, 'subjects'))) {
  const file = join(ROOT, 'subjects', slug, 'index.html');
  if (!existsSync(file)) continue;
  const html = readFileSync(file, 'utf8');
  const h1 = (html.match(/<h1[^>]*>([^<]+)/) || [])[1] || '';
  const subj = SYL.find((s) => norm(h1).startsWith(norm(s.name))) ||
    SYL.find((s) => norm(s.name) === norm(slug));
  if (!subj) { missing.push('/subjects/' + slug); continue; }
  paths['/subjects/' + slug] = { m: subj.modules.map((m) => m.id), n: subj.questionCount };
  const re = new RegExp('href="/subjects/' + slug + '/([a-z0-9-]+)"[^>]*>\\s*<strong[^>]*>([^<]+)</strong>', 'g');
  let a;
  while ((a = re.exec(html))) {
    const mod = subj.modules.find((m) => norm(m.name) === norm(a[2]));
    if (!mod) { missing.push('/subjects/' + slug + '/' + a[1] + ' (' + a[2] + ')'); continue; }
    paths['/subjects/' + slug + '/' + a[1]] = { m: [mod.id], n: mod.questionCount };
  }
}
writeFileSync(join(ROOT, 'count-map.json'), JSON.stringify({ paths }) + '\n');
console.log(Object.keys(paths).length + ' pages mapped');
if (missing.length) console.log('Unmapped:\n  ' + missing.join('\n  '));
