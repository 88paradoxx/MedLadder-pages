#!/usr/bin/env node
// Copies published topic notes (public.topic_notes) into the static topic
// pages at /subjects/<subject>/<topic>/, just above the "About" section, so
// search engines see the same revision notes students read in the app.
// Unpublished or deleted notes are removed from the page. Idempotent.
//
//   node scripts/build-topic-notes.mjs              fetch live (anon key)
//   node scripts/build-topic-notes.mjs --data f.json  use a saved snapshot
//   node scripts/build-topic-notes.mjs --check      report only, write nothing
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const args = process.argv.slice(2);
const check = args.includes('--check');
const dataArg = args.includes('--data') ? args[args.indexOf('--data') + 1] : null;

const START = '<!--topic-notes:start-->';
const END = '<!--topic-notes:end-->';
const ANCHOR = '<section aria-labelledby="seoAbout"';

const slug = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const escAttr = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

async function fetchLive() {
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const url = (app.match(/SUPABASE_URL\s*=\s*'([^']+)'/) || [])[1];
  const key = (app.match(/SUPABASE_ANON_KEY\s*=\s*'([^']+)'/) || [])[1];
  if (!url || !key) throw new Error('Supabase URL/key not found in app.js');
  const get = async (q) => {
    const r = await fetch(`${url}/rest/v1/${q}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!r.ok) throw new Error(`${q}: HTTP ${r.status} ${await r.text()}`);
    return r.json();
  };
  const notes = await get('topic_notes?select=module_id,html,updated_at,pdf_url,pdf_name&published=eq.true');
  if (!notes.length) return { notes, modules: [], subjects: [] };
  const modules = await get(`modules?select=id,name,subject_id&id=in.(${notes.map((n) => n.module_id).join(',')})`);
  const subjects = await get(`subjects?select=id,name&id=in.(${[...new Set(modules.map((m) => m.subject_id))].join(',')})`);
  return { notes, modules, subjects };
}

// Allow-list sanitiser (the notes are admin-written, but the page is public).
const KEEP = new Set(['h2', 'h3', 'h4', 'p', 'br', 'b', 'strong', 'i', 'em', 'u', 'sub', 'sup', 'small', 'span', 'div',
  'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'blockquote', 'hr', 'figure', 'figcaption', 'img']);
function sanitize(html) {
  let s = String(html || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|iframe|object|embed|svg|math|form|textarea|select)\b[\s\S]*?<\/\1\s*>/gi, '');
  return s.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (tag, name, attrs) => {
    const n = name.toLowerCase();
    if (!KEEP.has(n)) return '';
    if (tag.startsWith('</')) return `</${n}>`;
    if (n === 'img') {
      const src = (attrs.match(/\ssrc\s*=\s*"([^"]*)"/i) || attrs.match(/\ssrc\s*=\s*'([^']*)'/i) || [])[1] || '';
      const alt = (attrs.match(/\salt\s*=\s*"([^"]*)"/i) || [])[1] || '';
      if (!/^https:\/\//i.test(src)) return '';
      return `<img src="${escAttr(src)}" alt="${escAttr(alt)}" loading="lazy" decoding="async">`;
    }
    if (n === 'td' || n === 'th') {
      const cs = (attrs.match(/\scolspan\s*=\s*"?(\d{1,2})/i) || [])[1];
      const rs = (attrs.match(/\srowspan\s*=\s*"?(\d{1,2})/i) || [])[1];
      return `<${n}${cs ? ` colspan="${cs}"` : ''}${rs ? ` rowspan="${rs}"` : ''}>`;
    }
    return `<${n}>`;
  }).trim();
}

function block(note, topicName) {
    const d = new Date(note.updated_at);
  const updated = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
  return `${START}<section aria-labelledby="topicNotesTitle" class="seo-notes" style="margin-top:30px;">` +
    `<h2 id="topicNotesTitle" class="seo-section-title">${escAttr(topicName)}: topic overview</h2>` +
    `<p style="font-size:13px;color:var(--ink-soft);margin:0 0 10px;">Updated ${updated}</p>` +
    (note.pdf_url && /^https:\/\/medladder\.top\/notes-files\//.test(note.pdf_url)
      ? `<p><a class="tn-pdf" href="${escAttr(note.pdf_url)}" target="_blank" rel="noopener"><span class="tn-pdf-icon">PDF</span><span class="tn-pdf-text"><span class="tn-pdf-name">${escAttr(note.pdf_name || topicName + ' overview')}</span><span class="tn-pdf-sub">Open the PDF</span></span></a></p>`
      : '') +
    (String(note.html || '').replace(/<[^>]+>/g, '').trim() ? `<div class="tn-body">${sanitize(note.html)}</div>` : '') +
    `</section>${END}\n`;
}

const data = dataArg ? JSON.parse(fs.readFileSync(dataArg, 'utf8')) : await fetchLive();
const subjName = new Map(data.subjects.map((s) => [s.id, s.name]));
const want = new Map(); // relative page path -> html block
for (const n of data.notes) {
  const m = data.modules.find((x) => x.id === n.module_id);
  if (!m || !subjName.has(m.subject_id)) continue;
  const rel = path.join('subjects', slug(subjName.get(m.subject_id)), slug(m.name), 'index.html');
  want.set(rel, block(n, m.name));
}

let changed = 0, missing = [];
for (const rel of want.keys()) if (!fs.existsSync(path.join(root, rel))) missing.push(rel);
const subjectsDir = path.join(root, 'subjects');
for (const subj of fs.readdirSync(subjectsDir)) {
  const sd = path.join(subjectsDir, subj);
  if (!fs.statSync(sd).isDirectory()) continue;
  for (const topic of fs.readdirSync(sd)) {
    const rel = path.join('subjects', subj, topic, 'index.html');
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) continue;
    const html = fs.readFileSync(file, 'utf8');
    const re = new RegExp(`${START}[\\s\\S]*?${END}\\n?`);
    let next = html.replace(re, '');
    if (want.has(rel)) {
      if (!next.includes(ANCHOR)) { missing.push(`${rel} (no About section)`); continue; }
      next = next.replace(ANCHOR, want.get(rel) + ANCHOR);
    }
    if (next !== html) {
      changed++;
      if (!check) fs.writeFileSync(file, next);
      console.log(`${check ? 'would update' : 'updated'}: ${rel}`);
    }
  }
}
if (missing.length) console.warn('No page found for:\n  ' + missing.join('\n  '));
console.log(`${want.size} published note(s); ${changed} page(s) ${check ? 'need updating' : 'updated'}.`);
