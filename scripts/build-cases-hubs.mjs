#!/usr/bin/env node
// Rebuilds the SEO numbers and lists baked into the Clinical Cases hub pages
// (/clinical-cases and /clinical-cases/<region>) from the live database, so
// search engines see the same counts, topics and free cases as visitors.
//
//   node scripts/build-cases-hubs.mjs              fetch live data (public RPCs)
//   node scripts/build-cases-hubs.mjs --data f.json  use an exported snapshot
//   node scripts/build-cases-hubs.mjs --check      exit 1 if pages are stale
//
// Only content between known markers / ids is touched; the hand-written intro,
// FAQ wording and layout stay as they are. Run by .github/workflows/cases-hubs.yml.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HUBS, INDEX } from './cases-hubs-seo.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://medladder.top';
const HUB_DIR = path.join(ROOT, 'clinical-cases');
const args = process.argv.slice(2);
const argVal = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const CHECK = args.includes('--check');

// Slug order = page order (prev/next links, index grid).
const REGIONS = [
  ['cardiovascular', 'cardio'], ['respiratory', 'resp'], ['neurology', 'neuro'],
  ['gastro-hepatobiliary', 'gi'], ['renal-electrolytes', 'renal'], ['endocrine-metabolic', 'endo'],
  ['haematology-oncology', 'heme'], ['infectious-disease', 'id'], ['musculoskeletal-rheumatology', 'msk'],
  ['obstetrics-gynaecology', 'obgyn'], ['paediatrics-neonatology', 'peds'], ['psychiatry', 'psych'],
  ['emergency-critical-care', 'emerg'],
];

const escHtml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const byName = (a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' });

// ---------------------------------------------------------------- data
async function fetchLive() {
  const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const url = (app.match(/SUPABASE_URL\s*=\s*'([^']+)'/) || [])[1];
  const key = (app.match(/SUPABASE_ANON_KEY\s*=\s*'([^']+)'/) || [])[1];
  if (!url || !key) throw new Error('Supabase URL/key not found in app.js');
  const rpc = async (name, body) => {
    const r = await fetch(`${url}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
    return r.json();
  };
  const ov = await rpc('cases_overview', {});
  const out = {};
  for (const reg of ov.regions || []) {
    const items = [];
    for (let off = 0; off < 2000; off += 50) {
      const page = await rpc('cases_list', { p_region: reg.id, p_topic: null, p_level: null, p_status: 'all', p_exam: null, p_q: null, p_sort: 'recommended', p_offset: off, p_limit: 50 });
      items.push(...(page.items || []));
      if (!page.items || page.items.length < 50) break;
    }
    out[reg.id] = { name: reg.name, items: items.map((c) => ({ title: c.title, level: c.level, topic: c.topic || '', free: !!c.is_free })) };
  }
  return out;
}

// Snapshot format: { "<region id>": { name, items: [{title, level, topic, free}] } }
function summarise(raw) {
  const out = {};
  for (const [slug, id] of REGIONS) {
    const r = raw[id];
    if (!r || !r.items || !r.items.length) throw new Error(`No cases for region ${id}`);
    const topics = new Map();
    for (const c of r.items) { const t = c.topic || 'Miscellaneous'; topics.set(t, (topics.get(t) || 0) + 1); }
    const core = r.items.filter((c) => c.level === 'core').length;
    out[id] = {
      id, slug, name: r.name,
      total: r.items.length, core, advanced: r.items.length - core,
      free: r.items.filter((c) => c.free).length,
      topics: [...topics].sort((a, b) => byName(a[0], b[0])),
      freeCases: r.items.filter((c) => c.free),
    };
  }
  return out;
}

// ---------------------------------------------------------------- page edits
const fill = (tpl, r) => tpl.replace(/\{(total|free|core|advanced|topics)\}/g, (m, k) => String(k === 'topics' ? r.topics.length : r[k]));
const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const warnings = [];
// Same snippet-width estimate SEOmator uses (max ~920px for descriptions).
const px = (t) => Math.round([...t].reduce((w, ch) => w + (ch === ' ' || '.,:;!|il1'.includes(ch) ? 4 : 'mwMW'.includes(ch) ? 11 : ch >= 'A' && ch <= 'Z' ? 9.5 : 7.5), 0));
function lint(label, title, desc) {
  if (title.length > 66) warnings.push(`${label}: title ${title.length} chars`);
  if (px(desc) > 920) warnings.push(`${label}: description ${px(desc)}px (max 920)`);
}
// FAQPage schema mirrors the visible FAQ exactly.
function faqSchemaFromHtml(html) {
  const qs = [...html.matchAll(/<details class="seo-faq-card"><summary>([\s\S]*?)<\/summary><p[^>]*>([\s\S]*?)<\/p><\/details>/g)];
  return { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: qs.map(([, q, a]) => ({ '@type': 'Question', name: unesc(q), acceptedAnswer: { '@type': 'Answer', text: unesc(a.replace(/<[^>]+>/g, '')) } })) };
}
function replaceOnce(html, re, fn, label) {
  let hit = false;
  const next = html.replace(re, (...m) => { hit = true; return typeof fn === 'function' ? fn(...m) : fn; });
  if (!hit) throw new Error(`pattern not found: ${label}`);
  return next;
}
const setById = (html, id, inner) => replaceOnce(html, new RegExp(`(<([a-z0-9]+)[^>]*\\bid="${id}"[^>]*>)[\\s\\S]*?(</\\2>)`), (m, open, tag, close) => open + inner + close, `#${id}`);
const setMeta = (html, attr, name, val) => replaceOnce(html, new RegExp(`(<meta ${attr}="${name}" content=")[^"]*(">)`), (m, a, b) => a + escHtml(val) + b, `meta ${name}`);

function jsonLdBlocks(html) {
  const re = /(<script type="application\/ld\+json">\s*)([\s\S]*?)(\s*<\/script>)/g;
  return [...html.matchAll(re)];
}
function editJsonLd(html, type, fn) {
  let found = false;
  const out = html.replace(/(<script type="application\/ld\+json">\s*)([\s\S]*?)(\s*<\/script>)/g, (m, a, body, c) => {
    let obj; try { obj = JSON.parse(body); } catch { return m; }
    if (obj['@type'] !== type) return m;
    found = true;
    const next = fn(obj);
    return next === null ? '' : a + JSON.stringify(next, null, 2) + c;
  });
  return { html: out, found };
}
function upsertJsonLd(html, type, obj) {
  const r = editJsonLd(html, type, () => obj);
  if (r.found) return r.html;
  return html.replace('</head>', `  <script type="application/ld+json">\n${JSON.stringify(obj, null, 2)}\n  </script>\n</head>`);
}

function regionDescription(r) {
  return `Work through ${r.total} ${r.name} clinical cases on MedLadder — step-by-step bedside vignettes for NEET PG, FMGE & INI-CET. ${r.core} Core, ${r.advanced} Advanced; ${r.free} free.`;
}
function faqCount(r) { return `MedLadder has ${r.total} ${r.name} clinical cases: ${r.core} Core and ${r.advanced} Advanced. ${r.free} of them are free to play, and the remaining ${r.total - r.free} need MedLadder Pro.`; }
function faqFree(r) { return `${r.free} ${r.name} cases are free to play without a subscription. The other ${r.total - r.free} cases, including all Advanced cases beyond the free set, need MedLadder Pro, which also unlocks the full QBank and past papers.`; }

function freeListHtml(r) {
  const lis = r.freeCases.map((c) => `<li><a href="/?openCases=${r.slug}">${escHtml(c.title)}</a><span class="cs-topic-count">${c.level === 'advanced' ? 'Advanced' : 'Core'} · ${escHtml(c.topic || 'Miscellaneous')}</span></li>`).join('\n');
  return `\n${lis}\n`;
}
const FREE_SECTION = (r) => `<!-- cases-hub:free -->
      <div class="seo-divider emerald"></div>
<section aria-labelledby="freeCases" style="margin-top:34px;"><h2 id="freeCases" class="seo-section-title">Free ${escHtml(r.name)} cases to try</h2>
<p style="line-height:1.7;color:var(--ink-soft);font-size:14.5px;">These ${r.free} cases are free for everyone — open one in the app and work through it step by step.</p>
<ul class="cs-topics cs-free" id="hubFreeList">${freeListHtml(r)}</ul></section>
<!-- /cases-hub:free -->`;

function buildRegionPage(html, r, all, today) {
  const url = `${SITE}/clinical-cases/${r.slug}`;
  const seo = HUBS[r.slug];
  if (!seo) throw new Error(`no SEO copy for ${r.slug}`);
  const desc = fill(seo.desc, r);
  const title = fill(seo.title, r);
  lint(r.slug, title, desc);
  for (const [attr, name] of [['name', 'description'], ['property', 'og:description'], ['name', 'twitter:description']]) html = setMeta(html, attr, name, desc);
  for (const [attr, name] of [['property', 'og:title'], ['name', 'twitter:title']]) html = setMeta(html, attr, name, fill(seo.ogTitle, r));
  html = setMeta(html, 'name', 'keywords', `${seo.keywords}, NEET SS ${seo.subject} questions, USMLE Step 2 CK ${seo.subject} cases, MBBS final year ${seo.subject} cases, MBBS university exam clinical cases`);
  // Intro names every exam the cases serve, MBBS included.
  html = html.replace(/(<p class="subtitle"[^>]*>[^<]*?cases for )(?:MBBS finals, )?NEET PG, INI-CET, FMGE, NEET SS and USMLE/, '$1MBBS finals, NEET PG, INI-CET, FMGE, NEET SS and USMLE');
  html = replaceOnce(html, /<title>[^<]*<\/title>/, () => `<title>${escHtml(title)}</title>`, 'title');
  html = replaceOnce(html, /(<h1 class="title">)[\s\S]*?(<span class="brand-gradient">)/, (m, a, b) => `${a}${seo.h1} ${b}`, 'h1');

  // Structured data.
  html = editJsonLd(html, 'BreadcrumbList', () => ({
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: 'Clinical Cases', item: `${SITE}/clinical-cases` },
      { '@type': 'ListItem', position: 3, name: r.name, item: url },
    ],
  })).html;
  html = editJsonLd(html, 'WebPage', (o) => ({ ...o, name: title, description: desc, dateModified: today, isPartOf: { '@type': 'CollectionPage', '@id': `${SITE}/clinical-cases` } })).html;
  // The old ItemList named case titles that are not on the page; list what the page shows: its topics.
  html = upsertJsonLd(html, 'ItemList', {
    '@context': 'https://schema.org', '@type': 'ItemList',
    name: `${r.name} clinical case topics`,
    numberOfItems: r.topics.length,
    itemListElement: r.topics.map(([t, n], i) => ({ '@type': 'ListItem', position: i + 1, name: `${t} (${plural(n, 'case')})` })),
  });

  // Visible numbers.
  html = setById(html, 'hubTotal', String(r.total));
  html = setById(html, 'hubFree', `${r.free} free`);
  html = setById(html, 'hubLevels', `${r.core} Core · ${r.advanced} Advanced`);
  html = setById(html, 'hubFreeInline', String(r.free));
  html = setById(html, 'caseTopics', `What’s inside: ${r.total} cases across ${r.topics.length} topics`);
  html = setById(html, 'hubTopicList', '\n' + r.topics.map(([t, n]) => `<li><span>${escHtml(t)}</span><span class="cs-topic-count">${plural(n, 'case')}</span></li>`).join('\n') + '\n');
  html = setById(html, 'hubFaqCount', escHtml(faqCount(r)));
  html = setById(html, 'hubFaqFree', escHtml(faqFree(r)));

  // Free-case list (visible content + internal links into the app).
  if (!html.includes('.cs-free li')) html = replaceOnce(html, /(\s*)(<\/style>)/, (m, ws, close) => `\n    .cs-free li { flex-direction: column; justify-content: flex-start; gap: 2px; }\n    .cs-free a { color: var(--ink); text-decoration: none; font-weight: 500; }\n    .cs-free .cs-topic-count { white-space: normal; }${ws}${close}`, 'style block');
  const block = FREE_SECTION(r);
  if (html.includes('<!-- cases-hub:free -->')) html = replaceOnce(html, /<!-- cases-hub:free -->[\s\S]*?<!-- \/cases-hub:free -->/, () => block, 'free block');
  else html = replaceOnce(html, /(<\/ul><\/section>)(\s*<div class="seo-divider emerald"><\/div>\s*<section aria-labelledby="more-regions")/, (m, a, b) => `${a}\n${block}${b}`, 'free block anchor');

  // System-specific copy: what these cases test, and system FAQs.
  const focusBlock = `<!-- cases-hub:focus -->
<section aria-labelledby="caseFocus" style="margin-top:34px;"><h2 id="caseFocus" class="seo-section-title">${escHtml(seo.focusTitle)}</h2>
<p style="line-height:1.75;font-size:15px;">${escHtml(seo.focus)}</p></section>
      <div class="seo-divider emerald"></div>
<!-- /cases-hub:focus -->
`;
  if (html.includes('<!-- cases-hub:focus -->')) html = replaceOnce(html, /<!-- cases-hub:focus -->[\s\S]*?<!-- \/cases-hub:focus -->\n/, () => focusBlock, 'focus block');
  else html = replaceOnce(html, /<section aria-labelledby="caseTopics"/, (m) => focusBlock + m, 'focus anchor');
  const examsFaq = [`Are these ${seo.subject} cases useful for MBBS exams, NEET SS and USMLE?`,
    `Yes. MBBS final-year and university exams use the same case-based format, so the Core cases double as viva and long-case practice. For NEET SS (${seo.ssGroup} group, including ${seo.ssCourses}), the Advanced cases go to super-specialty depth. For USMLE Step 2 CK, every case is a next-best-step vignette in the same style. Where Indian guidelines differ from US practice, the explanation says so.`];
  const faqBlock = '<!-- cases-hub:faq -->' + [...seo.faqs, examsFaq].map(([q, a]) => `<details class="seo-faq-card"><summary>${escHtml(q)}</summary><p>${escHtml(a)}</p></details>`).join('') + '<!-- /cases-hub:faq -->';
  if (html.includes('<!-- cases-hub:faq -->')) html = replaceOnce(html, /<!-- cases-hub:faq -->[\s\S]*?<!-- \/cases-hub:faq -->/, () => faqBlock, 'faq block');
  else html = replaceOnce(html, /(<p id="hubFaqFree">[\s\S]*?<\/p><\/details>)/, (m) => m + faqBlock, 'faq anchor');
  html = upsertJsonLd(html, 'FAQPage', faqSchemaFromHtml(html));

  // Other-region cards.
  html = html.replace(/(<a href="\/clinical-cases\/([a-z-]+)" class="seo-card"[^>]*>[\s\S]*?<small[^>]*>)[^<]*(<\/small>)/g, (m, a, slug, c) => {
    const o = Object.values(all).find((x) => x.slug === slug);
    return o ? `${a}${plural(o.total, 'case')}${c}` : m;
  });

  // "Clinical Cases" crumbs and the back button go to the index page.
  html = html.replace(/<a href="\/">Clinical Cases<\/a>/g, '<a href="/clinical-cases">Clinical Cases</a>');
  html = html.replace(/<a href="\/" class="btn secondary"([^>]*)>← Clinical Cases<\/a>/g, '<a href="/clinical-cases" class="btn secondary"$1>← Clinical Cases</a>');
  return html;
}

// ---------------------------------------------------------------- index page
function buildIndex(template, all, today) {
  const regions = REGIONS.map(([, id]) => all[id]);
  const total = regions.reduce((s, r) => s + r.total, 0);
  const free = regions.reduce((s, r) => s + r.free, 0);
  const core = regions.reduce((s, r) => s + r.core, 0);
  const topics = regions.reduce((s, r) => s + r.topics.length, 0);
  const url = `${SITE}/clinical-cases`;
  const agg = { total, free, core, advanced: total - core, topics: [] };
  const title = fill(INDEX.title, agg);
  const desc = fill(INDEX.desc, agg);
  lint('index', title, desc);

  const head = template.slice(0, template.indexOf('<script type="application/ld+json">'));
  const bodyStart = template.indexOf('<body>');
  const masthead = template.slice(bodyStart, template.indexOf('<main'));
  const tail = template.slice(template.indexOf('</main>'));

  let h = head
    .replace(/<title>[^<]*<\/title>/, `<title>${escHtml(title)}</title>`)
    .replace(/(<meta name="keywords" content=")[^"]*/, '$1clinical cases, case-based questions, clinical vignettes, NEET PG clinical cases, INI-CET clinical cases, FMGE clinical cases, NEET SS clinical cases, USMLE Step 2 CK clinical cases, MBBS final year clinical cases, MBBS university exam case questions, MedLadder clinical cases')
    .replace(/(<link rel="canonical" href=")[^"]*/, `$1${url}`)
    .replace(/(<meta property="og:url" content=")[^"]*/, `$1${url}`)
    .replace(/(<meta property="og:title" content=")[^"]*/, () => '<meta property="og:title" content="' + escHtml(INDEX.ogTitle))
    .replace(/(<meta name="twitter:title" content=")[^"]*/, () => '<meta name="twitter:title" content="' + escHtml(INDEX.ogTitle));
  for (const [attr, name] of [['name', 'description'], ['property', 'og:description'], ['name', 'twitter:description']]) h = setMeta(h, attr, name, desc);

  const ld = [
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: 'Clinical Cases', item: url }] },
    { '@context': 'https://schema.org', '@type': 'CollectionPage', '@id': url, url, name: title, description: desc, dateModified: today,
      mainEntity: { '@type': 'ItemList', numberOfItems: regions.length, itemListElement: regions.map((r, i) => ({ '@type': 'ListItem', position: i + 1, name: `${r.name} clinical cases`, url: `${SITE}/clinical-cases/${r.slug}` })) } },
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [
      { '@type': 'Question', name: 'How many clinical cases are there on MedLadder?', acceptedAnswer: { '@type': 'Answer', text: `MedLadder has ${total} clinical cases across ${regions.length} body systems and ${topics} topics: ${core} Core and ${total - core} Advanced. ${free} are free to play.` } },
      { '@type': 'Question', name: 'Are the clinical cases free?', acceptedAnswer: { '@type': 'Answer', text: `Every body system has ${regions[0].free} free cases — ${free} in total — that play without a subscription. The rest need MedLadder Pro, which also unlocks the full QBank and past papers.` } },
      { '@type': 'Question', name: 'What is the difference between Core and Advanced cases?', acceptedAnswer: { '@type': 'Answer', text: 'Core cases cover the presentations every NEET PG and FMGE candidate must manage. Advanced cases are written at INI-CET and NEET SS difficulty, with harder differentials, exceptions and second-line decisions.' } },
      { '@type': 'Question', name: 'Which exams are the clinical cases for?', acceptedAnswer: { '@type': 'Answer', text: 'NEET PG, INI-CET, FMGE and NEET SS, plus MBBS final-year and university exams and USMLE Step 2 CK. Each case is a patient vignette where you choose the next step before the explanation and learning point appear, the format all of these exams now use.' } },
    ] },
  ];
  h += ld.map((o) => `  <script type="application/ld+json">\n${JSON.stringify(o, null, 2)}\n  </script>\n`).join('') + '</head>\n';

  const cards = regions.map((r) => `<a href="/clinical-cases/${r.slug}" class="seo-card" style="display:block;text-decoration:none;"><strong style="font-size:15px;color:var(--ink);">${escHtml(r.name)}</strong><br><small style="color:var(--ink-soft);">${plural(r.total, 'case')}</small><br><span style="font-size:12.5px;color:var(--ink-soft);">${r.core} Core · ${r.advanced} Advanced · ${r.free} free</span></a>`).join('\n');
  const faqHtml = ld[2].mainEntity.map((q, i) => `<details class="seo-faq-card"><summary>${escHtml(q.name)}</summary><p${i === 0 ? ' id="hubFaqCount"' : ''}>${escHtml(q.acceptedAnswer.text)}</p></details>`).join('');

  const main = `<main id="main" class="seo-main" data-hub-index="1">
      <nav aria-label="Breadcrumb" class="seo-breadcrumb">
        <a href="/" id="seoHomeTop">← Home</a>
        <span aria-hidden="true">/</span> <span>Clinical Cases</span>
      </nav>
      <div class="hero-wrap" style="text-align:center;padding:32px 18px 26px;margin-bottom:28px;">
        <div class="hero-eyebrow">Clinical Cases · MedLadder</div>
        <h1 class="title">Clinical Cases <span class="brand-gradient">by Body System</span></h1>
        <p class="subtitle" style="max-width:760px;margin:0 auto 18px;line-height:1.65;">Case-based practice for MBBS finals, NEET PG, INI-CET, FMGE, NEET SS and USMLE. A patient presents, you choose the next step, and the explanation shows why, one case at a time.</p>
        <div class="bento-bar" style="max-width:680px;margin:18px auto 24px;">
          <div class="bento-stat"><div class="bento-stat-num" id="hubTotal">${total}</div><div class="bento-stat-lbl">Cases</div></div>
          <div class="bento-stat"><div class="bento-stat-num" id="hubFree">${free} free</div><div class="bento-stat-lbl">Free to play</div></div>
          <div class="bento-stat"><div class="bento-stat-num" id="hubLevels">${core} Core · ${total - core} Advanced</div><div class="bento-stat-lbl">Levels</div></div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin:22px 0 6px;">
          <a href="/?openCases=all" class="btn" style="font-size:15px;padding:14px 28px;text-decoration:none;">Open Clinical Cases in the app</a>
          <a href="#regions" class="btn secondary" style="font-size:15px;padding:14px 24px;text-decoration:none;">Browse by body system</a>
        </div>
          <p class="ml-reviewed" style="margin:16px auto 0;font-size:13px;line-height:1.5;opacity:.85;">Cases reviewed by <a href="/editorial-team" style="color:inherit;text-decoration:underline;text-underline-offset:3px;">Dr Mirbilal, MBBS, MD (Pediatrics)</a></p>
      </div>
      <div class="seo-divider emerald"></div>
<section aria-labelledby="regions" style="margin-top:34px;">
        <h2 id="regions" class="seo-section-title">${regions.length} body systems, ${topics} topics</h2>
        <p style="line-height:1.7;color:var(--ink-soft);font-size:14.5px;">Pick a system to see its topics and free cases. Every system has ${regions[0].free} cases you can play without signing in.</p>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px;">
${cards}
        </div>
      </section>
      <div class="seo-divider"></div>
<section aria-labelledby="examHubs" style="margin-top:34px;"><h2 id="examHubs" class="seo-section-title">Prepare for your exam</h2><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;"><a href="/neet-pg" class="seo-card"><strong>NEET PG Question Bank</strong><small>Topic-wise MCQs and previous-year questions</small></a><a href="/inicet" class="seo-card"><strong>INI-CET Question Bank</strong><small>Topic-wise MCQs and previous-year questions</small></a><a href="/fmge" class="seo-card"><strong>FMGE Question Bank</strong><small>Topic-wise MCQs and previous-year questions</small></a><a href="/neet-ss" class="seo-card"><strong>NEET SS Question Bank</strong><small>Topic-wise MCQs and previous-year questions</small></a><a href="/mock-test" class="seo-card"><strong>MBBS, NEET PG &amp; FMGE Mock Tests</strong><small>Exam-pattern papers with leaderboards</small></a></div></section>
      <div class="seo-divider"></div>
<section aria-labelledby="seoFaq" style="margin-top:38px;">
        <h2 id="seoFaq" class="seo-section-title">Frequently Asked Questions</h2>
        <div style="display:flex;flex-direction:column;gap:6px;">
          ${faqHtml}
        </div>
      </section>
    `;
  return h + masthead.replace('<body>', '<body>') + main + tail;
}

// ---------------------------------------------------------------- sitemap
function updateSitemap(xml, today) {
  if (!xml.includes(`<loc>${SITE}/clinical-cases</loc>`)) {
    xml = xml.replace(`  <url>\n    <loc>${SITE}/clinical-cases/cardiovascular</loc>`, `  <url>\n    <loc>${SITE}/clinical-cases</loc>\n    <lastmod>${today}</lastmod>\n  </url>\n  <url>\n    <loc>${SITE}/clinical-cases/cardiovascular</loc>`);
    if (!xml.includes(`<loc>${SITE}/clinical-cases</loc>`)) throw new Error('could not add /clinical-cases to sitemap');
  }
  return xml;
}
function bumpLastmod(xml, loc, today) {
  return xml.replace(new RegExp(`(<loc>${loc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</loc>\\s*<lastmod>)[^<]*`), `$1${today}`);
}

// ---------------------------------------------------------------- main
const strip = (s) => s.replace(/"dateModified": "[^"]*"/g, '').replace(/<lastmod>[^<]*<\/lastmod>/g, '');

const dataFile = argVal('--data');
const raw = dataFile ? JSON.parse(fs.readFileSync(dataFile, 'utf8')) : await fetchLive();
const all = summarise(raw);
const today = new Date().toISOString().slice(0, 10);
let changed = [];
const write = (file, next) => {
  const prev = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (strip(prev) === strip(next)) return false;
  changed.push(path.relative(ROOT, file));
  if (!CHECK) fs.writeFileSync(file, next);
  return true;
};

let sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
const origSitemap = sitemap;
sitemap = updateSitemap(sitemap, today);
let anyHub = false;
for (const [slug, id] of REGIONS) {
  const file = path.join(HUB_DIR, slug, 'index.html');
  const html = fs.readFileSync(file, 'utf8');
  if (write(file, buildRegionPage(html, all[id], all, today))) { anyHub = true; sitemap = bumpLastmod(sitemap, `${SITE}/clinical-cases/${slug}`, today); }
}
const template = fs.readFileSync(path.join(HUB_DIR, 'cardiovascular', 'index.html'), 'utf8');
if (write(path.join(HUB_DIR, 'index.html'), buildIndex(template, all, today)) || anyHub) sitemap = bumpLastmod(sitemap, `${SITE}/clinical-cases`, today);
if (sitemap !== origSitemap) write(path.join(ROOT, 'sitemap.xml'), sitemap);

const sum = Object.values(all).reduce((s, r) => s + r.total, 0);
for (const w of warnings) console.warn('warn:', w);
console.log(`${sum} cases across ${Object.keys(all).length} regions; ${changed.length ? 'changed: ' + changed.join(', ') : 'no changes'}`);
if (CHECK && changed.length) process.exit(1);
