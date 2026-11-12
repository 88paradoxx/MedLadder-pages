/* medladder-pages Worker: static assets, live question counts on pages,
 * and POST /api/upload-image.
 *
 * Only the paths in assets.run_worker_first (wrangler.jsonc) reach this code;
 * everything else (scripts, styles, images) is served straight from dist/.
 *
 * Live counts: the HTML pages carry question counts baked in when they were
 * written. For HTML responses the Worker swaps those for the numbers from
 * the site_counts() RPC. The counts are fetched once per day (the cache key
 * is the date in India, so the first request after midnight IST refreshes
 * them) and kept in the Cloudflare cache until the next midnight. If the
 * RPC fails the page is served unchanged.
 *
 * Upload route: verifies the caller is a MedLadder admin via their
 * Supabase session token (mock_is_admin RPC), then stores the image in the
 * medladder-images R2 bucket and returns its public URL.
 *
 * Books: POST /api/upload-book (admin) streams a PDF or Word file into the
 * same bucket under books/; POST /api/delete-book-file removes one. The
 * /books page gets the published list from the `books` table written into
 * its HTML (cached for a minute), so a book goes live within a minute of
 * being published and search engines see the list without running scripts.
 */

import COUNT_MAP from './count-map.json';
// Written by build.mjs on every build (a placeholder is committed): lets the
// deployed bundle show whether that build minified the site's files.
import BUILD_STAMP from './build-stamp.json';
var BUILD = BUILD_STAMP;

var SUPABASE_URL = 'https://groeibwykzrliphzzruk.supabase.co';
/* Publishable key — already shipped in app.js / admin-mock.js. */
var SUPABASE_ANON_KEY = 'sb_publishable_tXvgKaWrUfWlpy8SB3c1mQ_ZMrHxzVY';
var R2_PUBLIC_BASE = 'https://pub-5e62ac2b4d1c43fcb7fb6b025a52e189.r2.dev';
var MAX_BYTES = 8 * 1024 * 1024;

var EXT_BY_TYPE = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif'
};

/* Admin check shared by the upload routes: the caller's Supabase session
   token must belong to an admin (mock_is_admin RPC). Returns null when the
   caller is an admin, otherwise the error response to send. */
async function requireAdmin(request) {
  var auth = request.headers.get('authorization') || '';
  var token = auth.replace(/^Bearer\s+/i, '');
  if (!token) return json(401, { ok: false, error: 'unauthorized' });
  try {
    var rpc = await fetch(SUPABASE_URL + '/rest/v1/rpc/mock_is_admin', {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: '{}'
    });
    if (!rpc.ok) return json(401, { ok: false, error: 'unauthorized' });
    if ((await rpc.json()) !== true) return json(403, { ok: false, error: 'forbidden' });
  } catch (e) {
    return json(502, { ok: false, error: 'auth_check_failed' });
  }
  return null;
}

function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status: status,
    headers: { 'content-type': 'application/json' }
  });
}


/* ---------- live counts ---------- */

/* Numbers baked into the static pages when they were generated. */
var BAKED = { total: 36219, pyq: 6937, topics: 740 };
var IST_OFFSET_MS = 330 * 60 * 1000;
var memCounts = null;

function istDay(now) {
  return new Date(now + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function secondsToIstMidnight(now) {
  var d = new Date(now + IST_OFFSET_MS);
  var next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - IST_OFFSET_MS;
  return Math.max(60, Math.round((next - now) / 1000));
}

async function getCounts(ctx) {
  var now = Date.now();
  var day = istDay(now);
  if (memCounts && memCounts.day === day) return memCounts.data;
  var cache = caches.default;
  var key = new Request('https://medladder.top/__site_counts/' + day);
  var hit = await cache.match(key);
  if (hit) {
    var data = await hit.json();
    memCounts = { day: day, data: data };
    return data;
  }
  var r = await fetch(SUPABASE_URL + '/rest/v1/rpc/site_counts', {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: '{}'
  });
  if (!r.ok) throw new Error('site_counts ' + r.status);
  var fresh = await r.json();
  if (!fresh || !fresh.total || !fresh.modules) throw new Error('site_counts empty');
  memCounts = { day: day, data: fresh };
  ctx.waitUntil(cache.put(key, new Response(JSON.stringify(fresh), {
    headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=' + secondsToIstMidnight(now) }
  })));
  return fresh;
}

/* Today's question of the day, fetched once per India day like the counts
   and written into the home page (see servePage), so the app can draw it
   on its first render instead of after app.js + supabase-js + an RPC.
   That card is the page's largest text, so this is what sets LCP. */
var memQotd = null;
async function getQotd(ctx) {
  var now = Date.now();
  var day = istDay(now);
  if (memQotd && memQotd.day === day) return memQotd.data;
  var cache = caches.default;
  var key = new Request('https://medladder.top/__qotd/' + day);
  var hit = await cache.match(key);
  if (hit) {
    var cached = await hit.json();
    memQotd = { day: day, data: cached };
    return cached;
  }
  var r = await fetch(SUPABASE_URL + '/rest/v1/rpc/question_of_the_day', {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_day: day })
  });
  if (!r.ok) throw new Error('question_of_the_day ' + r.status);
  var rows = await r.json();
  var data = { date: day, q: Array.isArray(rows) && rows[0] ? rows[0] : null };
  memQotd = { day: day, data: data };
  ctx.waitUntil(cache.put(key, new Response(JSON.stringify(data), {
    headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=' + secondsToIstMidnight(now) }
  })));
  return data;
}

function fmt(n) { return Number(n).toLocaleString('en-US'); }

function liveFor(entry, counts) {
  if (!entry) return null;
  var n = 0;
  for (var i = 0; i < entry.m.length; i++) n += counts.modules[entry.m[i]] || 0;
  return n;
}

function entryFor(path) {
  path = path.replace(/\/+$/, '') || '/';
  return COUNT_MAP.paths[path] || null;
}

/* A number counts as "this page's/link's count" when it is within 25% of the
   baked value; this tolerates pages that were written at slightly different
   times without touching unrelated numbers such as years or page numbers. */
function near(num, baked) {
  return baked > 0 && Math.abs(num - baked) <= Math.max(2, baked * 0.25);
}

var Q_WORD = '(?:\\s|&nbsp;)*(?:practice |topic-wise |high-yield )?(?:MCQs?|questions|Questions|QUESTIONS|Qs)\\b';
var NUM_Q = new RegExp('\\b(\\d{1,3}(?:,\\d{3})+|\\d+)(?=' + Q_WORD + ')', 'g');
var ONLY_NUM = /^(\s*)(\d{1,3}(?:,\d{3})+|\d+)(\s*)$/;

function swapNear(text, re, baked, live) {
  return text.replace(re, function (m) {
    var v = parseInt(m.replace(/,/g, ''), 10);
    return near(v, baked) ? fmt(live) : m;
  });
}

function swapGlobals(text, counts) {
  if (text.indexOf('36,219') !== -1 || text.indexOf('36219') !== -1) {
    text = text.replace(/36,219/g, fmt(counts.total)).replace(/\b36219\b/g, String(counts.total));
  }
  if (counts.pyq && text.indexOf('6,937') !== -1) text = text.replace(/6,937/g, fmt(counts.pyq));
  if (counts.topics && text.indexOf('740 topics') !== -1) text = text.replace(/\b740 topics/g, counts.topics + ' topics');
  return text;
}

function qotdHandler(qotd) {
  return {
    element: function (el) {
      if (!qotd) return;
      // Non-executable JSON: needs no CSP hash. "<" escaped so no text in a
      // question can close the script element.
      el.append('<script type="application/json" id="ml-qotd">' +
        JSON.stringify(qotd).replace(/</g, '\\u003c') + '</script>', { html: true });
    }
  };
}

function rewriteCounts(response, path, counts, qotd) {
  if (!counts) return new HTMLRewriter().on('body', qotdHandler(qotd)).transform(response);
  var page = entryFor(path);
  var pageLive = liveFor(page, counts);
  var link = null, linkLive = null, rowLink = null, rowLive = null, inRow = false;
  var buf = '';
  /* Inline scripts are allow-listed by hash in the CSP, so their text must
     not change; JSON-LD is data and is rewritten like the rest of the page. */
  var raw = false;

  function transform(text) {
    text = swapGlobals(text, counts);
    var ctxEntry = link || rowLink;
    var ctxLive = link ? linkLive : rowLive;
    if (ctxEntry) {
      text = swapNear(text, NUM_Q, ctxEntry.n, ctxLive);
      if (!link && rowLink) {
        var m = text.match(ONLY_NUM);
        if (m && near(parseInt(m[2].replace(/,/g, ''), 10), rowLink.n) && parseInt(m[2].replace(/,/g, ''), 10) > 99) {
          text = m[1] + fmt(rowLive) + m[3];
        }
      }
    } else if (page) {
      text = swapNear(text, NUM_Q, page.n, pageLive);
    }
    return text;
  }

  var textHandler = {
    text: function (t) {
      if (raw) return;
      buf += t.text;
      if (!t.lastInTextNode) { t.remove(); return; }
      var out = transform(buf);
      buf = '';
      t.replace(out, { html: true });
    }
  };

  return new HTMLRewriter()
    .on('body', qotdHandler(qotd))
    .on('script, style', {
      element: function (el) {
        var type = el.getAttribute('type') || '';
        if (el.tagName === 'script' && type.indexOf('ld+json') !== -1) return;
        raw = true;
        el.onEndTag(function () { raw = false; });
      }
    })
    .on('tr', {
      element: function (el) {
        inRow = true; rowLink = null; rowLive = null;
        el.onEndTag(function () { inRow = false; rowLink = null; rowLive = null; });
      }
    })
    .on('a[href]', {
      element: function (el) {
        var href = el.getAttribute('href') || '';
        var e = href.charAt(0) === '/' ? entryFor(href.split(/[?#]/)[0]) : null;
        if (!e) return;
        link = e; linkLive = liveFor(e, counts);
        if (inRow && !rowLink) { rowLink = e; rowLive = linkLive; }
        el.onEndTag(function () { link = null; linkLive = null; });
      }
    })
    .on('meta[content]', {
      element: function (el) {
        var c = el.getAttribute('content');
        if (!c || !/\d/.test(c)) return;
        var out = swapGlobals(c, counts);
        if (page) out = swapNear(out, NUM_Q, page.n, pageLive);
        if (out !== c) el.setAttribute('content', out);
      }
    })
    .on('*', textHandler)
    .transform(response);
}

async function servePage(request, env, ctx) {
  var res = await env.ASSETS.fetch(request);
  var type = res.headers.get('content-type') || '';
  if (request.method !== 'GET' || res.status !== 200 || type.indexOf('text/html') === -1) return res;
  var path = new URL(request.url).pathname;
  var isHome = path === '/' || path === '/index.html';
  var results = await Promise.allSettled([getCounts(ctx), isHome ? getQotd(ctx) : Promise.resolve(null)]);
  var counts = results[0].status === 'fulfilled' ? results[0].value : null;
  var qotd = results[1].status === 'fulfilled' ? results[1].value : null;
  if (!counts && !qotd) return res;
  var out = rewriteCounts(res, path, counts, qotd);
  var h = new Headers(out.headers);
  h.delete('etag');
  h.delete('content-length');
  h.set('x-ml-build', 'minified=' + BUILD.minified + (BUILD.built ? '; built=' + BUILD.built : ''));
  return new Response(out.body, { status: out.status, statusText: out.statusText, headers: h });
}

async function uploadImage(request, env) {
    /* Admin check: the caller's Supabase session token must belong to an
       admin. mock_is_admin() is granted to `authenticated` only, so an
       invalid token fails here (401) and a non-admin gets false (403). */
    var auth = request.headers.get('authorization') || '';
    var token = auth.replace(/^Bearer\s+/i, '');
    if (!token) return json(401, { ok: false, error: 'unauthorized' });
    try {
      var rpc = await fetch(SUPABASE_URL + '/rest/v1/rpc/mock_is_admin', {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        body: '{}'
      });
      if (!rpc.ok) return json(401, { ok: false, error: 'unauthorized' });
      var isAdmin = await rpc.json();
      if (isAdmin !== true) return json(403, { ok: false, error: 'forbidden' });
    } catch (e) {
      return json(502, { ok: false, error: 'auth_check_failed' });
    }

    /* Parse the uploaded file. */
    var form;
    try {
      form = await request.formData();
    } catch (e) {
      return json(400, { ok: false, error: 'bad_form' });
    }
    var file = form.get('image');
    if (!file || typeof file.arrayBuffer !== 'function') {
      return json(400, { ok: false, error: 'no_image' });
    }
    var ext = EXT_BY_TYPE[file.type];
    if (!ext) return json(400, { ok: false, error: 'not_an_image' });
    if (file.size > MAX_BYTES) return json(400, { ok: false, error: 'too_large' });

    var key = 'generated/admin-q-' + Date.now().toString(36) + '-' +
      crypto.randomUUID().slice(0, 8) + '.' + ext;
    try {
      await env.IMAGES_BUCKET.put(key, await file.arrayBuffer(), {
        httpMetadata: { contentType: file.type }
      });
    } catch (e) {
      return json(502, { ok: false, error: 'r2_put_failed' });
    }
    return json(200, { ok: true, key: key, url: R2_PUBLIC_BASE + '/' + key });
}

/* ---------- books ---------- */

var BOOK_MAX_BYTES = 95 * 1024 * 1024;
var BOOK_TYPES = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx'
};

function slugify(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'book';
}

/* The file is sent as the raw request body (not a form) so the Worker can
   stream it into R2 without holding a large PDF in memory. */
async function uploadBook(request, env) {
  var denied = await requireAdmin(request);
  if (denied) return denied;
  var type = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  var ext = BOOK_TYPES[type];
  if (!ext) return json(400, { ok: false, error: 'not_pdf_or_word' });
  var len = Number(request.headers.get('content-length') || 0);
  if (!len) return json(411, { ok: false, error: 'length_required' });
  if (len > BOOK_MAX_BYTES) return json(413, { ok: false, error: 'too_large' });
  var name = decodeURIComponent(request.headers.get('x-file-name') || 'book');
  var key = 'books/' + slugify(name.replace(/\.(pdf|docx?)$/i, '')) + '-' + Date.now().toString(36) + '.' + ext;
  try {
    await env.IMAGES_BUCKET.put(key, request.body, {
      httpMetadata: { contentType: type, contentDisposition: 'inline; filename="' + slugify(name.replace(/\.(pdf|docx?)$/i, '')) + '.' + ext + '"' }
    });
  } catch (e) {
    return json(502, { ok: false, error: 'r2_put_failed' });
  }
  return json(200, { ok: true, key: key, url: R2_PUBLIC_BASE + '/' + key, size: len, type: ext });
}

async function deleteBookFile(request, env) {
  var denied = await requireAdmin(request);
  if (denied) return denied;
  var body = {};
  try { body = await request.json(); } catch (e) {}
  var key = String(body.key || '');
  // Only files this route manages; never images or anything outside books/.
  if (!/^books\/[a-z0-9-]+\.(pdf|docx?)$/.test(key)) return json(400, { ok: false, error: 'bad_key' });
  try { await env.IMAGES_BUCKET.delete(key); } catch (e) { return json(502, { ok: false, error: 'r2_delete_failed' }); }
  return json(200, { ok: true });
}

var EXAM_NAMES = { 'neet-pg': 'NEET PG', fmge: 'FMGE', 'ini-cet': 'INI-CET', 'neet-ss': 'NEET SS' };
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function bookExam(b) { return b.exam === 'custom' ? (b.exam_label || 'Other') : (EXAM_NAMES[b.exam] || b.exam); }
function fmtSize(n) {
  if (!n) return '';
  return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
}
/* Same markup as renderBook() in books.js. */
function bookCard(b) {
  var t = (b.file_type || 'pdf').toUpperCase();
  return '<article class="bk-card" data-exam="' + esc(b.exam === 'custom' ? 'custom:' + (b.exam_label || '') : b.exam) + '" data-subject="' + esc(b.subject || 'All subjects') + '">' +
    '<div class="bk-cover bk-t-' + esc(b.file_type || 'pdf') + '" aria-hidden="true"><span>' + esc(t) + '</span></div>' +
    '<div class="bk-body"><div class="bk-tags"><span class="bk-tag">' + esc(bookExam(b)) + '</span><span class="bk-tag bk-tag-s">' + esc(b.subject || 'All subjects') + '</span></div>' +
    '<h2 class="bk-title">' + esc(b.title) + '</h2>' +
    (b.description ? '<p class="bk-desc">' + esc(b.description) + '</p>' : '') +
    '<p class="bk-meta">' + esc(t) + (b.file_size ? ' · ' + fmtSize(b.file_size) : '') + (b.pages ? ' · ' + b.pages + ' pages' : '') + '</p>' +
    '<a class="bk-dl" href="' + esc(b.file_url) + '" target="_blank" rel="noopener" download>Download ' + esc(t) + ' — free</a></div></article>';
}

var memBooks = null;
async function getBooks(ctx) {
  var now = Date.now();
  if (memBooks && now - memBooks.at < 60000) return memBooks.data;
  var cache = caches.default;
  var key = new Request('https://medladder.top/__books/' + Math.floor(now / 60000));
  var hit = await cache.match(key);
  if (hit) { var d = await hit.json(); memBooks = { at: now, data: d }; return d; }
  var ctl = new AbortController();
  var timer = setTimeout(function () { ctl.abort(); }, 2500);
  try {
    var r = await fetch(SUPABASE_URL + '/rest/v1/books?published=eq.true&select=id,title,description,exam,exam_label,subject,file_url,file_type,file_size,pages,created_at&order=sort.asc,created_at.desc', {
      headers: { apikey: SUPABASE_ANON_KEY }, signal: ctl.signal
    });
    if (!r.ok) throw new Error('books ' + r.status);
    var rows = await r.json();
    memBooks = { at: now, data: rows };
    ctx.waitUntil(cache.put(key, new Response(JSON.stringify(rows), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=60' } })));
    return rows;
  } finally { clearTimeout(timer); }
}

async function serveBooks(request, env, ctx) {
  var res = await env.ASSETS.fetch(request);
  if (request.method !== 'GET' || res.status !== 200) return res;
  var rows;
  try { rows = await getBooks(ctx); } catch (e) { return res; }
  var data = JSON.stringify(rows).replace(/</g, '\\u003c');
  var out = new HTMLRewriter()
    .on('#bookList', { element: function (el) { el.setInnerContent(rows.length ? rows.map(bookCard).join('') : '<p class="bk-empty">No books yet — check back soon.</p>', { html: true }); } })
    .on('#bookCount', { element: function (el) { el.setInnerContent(String(rows.length)); } })
    .on('body', { element: function (el) { el.append('<script type="application/json" id="ml-books">' + data + '</script>', { html: true }); } })
    .transform(res);
  var h = new Headers(out.headers);
  h.delete('etag'); h.delete('content-length');
  h.set('cache-control', 'public, max-age=0, must-revalidate');
  return new Response(out.body, { status: out.status, headers: h });
}

export default {
  async fetch(request, env, ctx) {
    var url = new URL(request.url);
    if (url.pathname === '/api/upload-image') {
      if (request.method !== 'POST') return json(404, { ok: false, error: 'not_found' });
      return uploadImage(request, env);
    }
    if (url.pathname === '/api/upload-book' || url.pathname === '/api/delete-book-file') {
      if (request.method !== 'POST') return json(404, { ok: false, error: 'not_found' });
      return url.pathname === '/api/upload-book' ? uploadBook(request, env) : deleteBookFile(request, env);
    }
    if (url.pathname === '/books') return serveBooks(request, env, ctx);
    return servePage(request, env, ctx);
  }
};
