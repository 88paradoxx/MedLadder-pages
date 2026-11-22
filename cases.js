/* MedLadder Clinical Cases: long, unfolding vignettes organised by body region,
   with Core and Advanced levels. A separate section from the question bank.
   Loaded on demand by app.js (mlCases), which hands over helpers via window.MLBridge.
   The server (RPCs cases_catalog, case_open, case_check, case_finish) owns content,
   answers and Pro access; answers arrive one step at a time. */
(function () {
  'use strict';
  var B = window.MLBridge;
  if (!B) return;

  var S = { cat: null, level: 'all', region: null, play: null };
  var LEVELS = [['all', 'All levels'], ['core', 'Core'], ['advanced', 'Advanced']];

  function el(id) { return document.getElementById(id); }
  function esc(s) { return B.esc(s == null ? '' : String(s)); }
  function rpc(name, args) {
    return B.sb().rpc(name, args || {}).then(function (r) { if (r.error) throw r.error; return r.data; });
  }
  function errKey(e) {
    var m = String((e && (e.message || e)) || '');
    var keys = ['pro_required', 'not_found', 'no_steps'];
    for (var i = 0; i < keys.length; i++) if (m.indexOf(keys[i]) !== -1) return keys[i];
    return 'network';
  }
  function view(path, title) { try { B.casesView(path, title); } catch (e) { } }
  function ev(name, p) { try { B.event(name, p || {}); } catch (e) { } }
  function html(s) { try { return B.fmt(s || ''); } catch (e) { return esc(s); } }
  function expHtml(s) { try { return B.fmtExp(s || ''); } catch (e) { return html(s); } }
  function regionById(id) { return ((S.cat && S.cat.regions) || []).filter(function (r) { return r.id === id; })[0]; }
  function casesIn(regionId) {
    return ((S.cat && S.cat.cases) || []).filter(function (c) {
      return (!regionId || c.region_id === regionId) && (S.level === 'all' || c.level === S.level);
    });
  }
  function levelBadge(l) { return '<span class="cs-lvl cs-lvl-' + esc(l) + '">' + (l === 'advanced' ? 'Advanced' : 'Core') + '</span>'; }
  function lockSvg() {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>';
  }
  function chev() { return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>'; }

  function paint(screen, body, back) {
    B.paintShell(screen, '<div class="cs">' + body + '</div>', back);
  }
  function levelFilter() {
    return '<div class="v3-filters cs-levels" role="group" aria-label="Level">' + LEVELS.map(function (l) {
      return '<button class="v3-filter" data-lvl="' + l[0] + '" aria-pressed="' + (S.level === l[0]) + '">' + l[1] + '</button>';
    }).join('') + '</div>';
  }
  function wireLevels(again) {
    document.querySelectorAll('.cs [data-lvl]').forEach(function (b) {
      b.onclick = function () { S.level = b.getAttribute('data-lvl'); again(); };
    });
  }
  function loading(title, back) {
    paint('cases', '<section class="cs-head"><h1>' + esc(title) + '</h1></section><p class="cs-muted">Loading…</p>', back);
  }
  function loadCatalog() {
    return rpc('cases_catalog').then(function (d) { S.cat = d || { regions: [], cases: [] }; return S.cat; });
  }

  // ---------- hub: regions ----------
  function openHub() {
    S.region = null;
    B.route('cases');
    if (!S.cat) loading('Clinical cases', B.home);
    loadCatalog().then(drawHub).catch(function () {
      paint('cases', '<section class="cs-head"><h1>Clinical cases</h1></section><p class="cs-muted">Could not load cases. Check your connection.</p><button class="cs-btn" id="csRetry">Try again</button>', B.home);
      var r = el('csRetry'); if (r) r.onclick = openHub;
    });
  }
  function drawHub() {
    view('/cases', 'Clinical cases');
    var all = casesIn(null), done = all.filter(function (c) { return c.tries; }).length;
    var tiles = (S.cat.regions || []).map(function (r) {
      var list = casesIn(r.id), n = list.length, d = list.filter(function (c) { return c.tries; }).length;
      var free = list.filter(function (c) { return !c.locked; }).length;
      var meta = n ? n + ' case' + (n === 1 ? '' : 's') + (d ? ' · ' + d + ' done' : '') + (!S.cat.is_pro && free && free < n ? ' · ' + free + ' free' : '') : 'Coming soon';
      return '<button class="v3-card cs-region' + (n ? '' : ' empty') + '" data-region="' + esc(r.id) + '"' + (n ? '' : ' aria-disabled="true"') + '>' +
        '<span class="cs-region-ic" aria-hidden="true">' + esc(r.icon) + '</span>' +
        '<span class="cs-region-tx"><b>' + esc(r.name) + '</b><small>' + esc(r.blurb) + '</small><em>' + meta + '</em></span>' +
        (n ? '<span class="cs-region-go">' + chev() + '</span>' : '') + '</button>';
    }).join('');
    var body =
      '<section class="cs-head"><span class="v3-chip">Clinical cases</span>' +
      '<h1>Think like the exam, one case at a time</h1>' +
      '<p>Long vignettes that unfold step by step, in the style of NEET SS, INI-CET and USMLE. New findings appear as you answer. <b>Core</b> builds the essentials; <b>Advanced</b> is for super-speciality level.</p>' +
      (all.length ? '<div class="cs-stat"><b>' + done + '</b> of <b>' + all.length + '</b> cases attempted</div>' : '') +
      '</section>' + levelFilter() +
      '<div class="cs-regions">' + tiles + '</div>' +
      (all.length ? '' : '<p class="cs-muted cs-center">New cases are being written and reviewed. Check back soon.</p>');
    paint('cases', body, B.home);
    wireLevels(drawHub);
    document.querySelectorAll('.cs [data-region]').forEach(function (b) {
      if (b.getAttribute('aria-disabled')) return;
      b.onclick = function () { openRegion(b.getAttribute('data-region')); };
    });
  }

  // ---------- region: case list ----------
  function openRegion(id) {
    S.region = id;
    B.route('cases/' + id);
    if (!S.cat) { loading('Clinical cases', openHub); loadCatalog().then(function () { drawRegion(); }).catch(openHub); return; }
    drawRegion();
  }
  function drawRegion() {
    var r = regionById(S.region);
    if (!r) { openHub(); return; }
    view('/cases/' + r.id, 'Cases – ' + r.name);
    var list = casesIn(r.id);
    var cards = list.map(function (c) {
      var tags = (c.exam_tags || []).map(function (t) { return '<span class="cs-tag">' + esc(t) + '</span>'; }).join('');
      var best = c.tries ? '<span class="cs-best">Best ' + c.best + '/' + c.steps + '</span>' : '';
      return '<button class="v3-card cs-case' + (c.locked ? ' locked' : '') + '" data-case="' + esc(c.id) + '"' + (c.locked ? ' data-locked="1"' : '') + '>' +
        '<span class="cs-case-top">' + levelBadge(c.level) + (c.draft ? '<span class="cs-draft">Draft</span>' : '') +
        (c.locked ? '<span class="cs-pro">' + lockSvg() + 'Pro</span>' : (c.is_free && !S.cat.is_pro ? '<span class="cs-free">Free</span>' : '')) + best + '</span>' +
        '<b class="cs-case-t">' + esc(c.title) + '</b>' +
        '<span class="cs-case-s">' + esc(c.summary) + '</span>' +
        '<span class="cs-case-m">' + c.steps + ' steps · ~' + c.est_minutes + ' min' + (tags ? '<span class="cs-tags">' + tags + '</span>' : '') + '</span>' +
        '</button>';
    }).join('');
    var body = '<section class="cs-head cs-head-sm"><span class="cs-region-ic big" aria-hidden="true">' + esc(r.icon) + '</span><div><h1>' + esc(r.name) + '</h1><p>' + esc(r.blurb) + '</p></div></section>' +
      levelFilter() +
      (cards ? '<div class="cs-cases">' + cards + '</div>' : '<p class="cs-muted cs-center">No ' + (S.level === 'all' ? '' : S.level + ' ') + 'cases here yet.</p>');
    paint('cases', body, openHub);
    wireLevels(drawRegion);
    document.querySelectorAll('.cs [data-case]').forEach(function (b) {
      b.onclick = function () {
        if (b.getAttribute('data-locked')) { ev('cases_locked_tap', { region: S.region }); B.openPro('cases'); return; }
        openCase(b.getAttribute('data-case'));
      };
    });
  }

  // ---------- player ----------
  function openCase(id) {
    paint('cases-play', '<p class="cs-muted cs-pad">Opening case…</p>', function () { openRegion(S.region); });
    rpc('case_open', { p_case: id }).then(function (c) {
      S.region = c.region_id;
      B.route('cases/' + c.region_id);
      S.play = { c: c, step: c.step, answers: [], score: 0, timeline: [], picked: null, result: null, finished: false };
      ev('case_start', { case_id: id, level: c.level, region: c.region_id });
      view('/cases/' + c.region_id + '/case', 'Case – ' + c.title);
      drawPlay();
    }).catch(function (e) {
      var k = errKey(e);
      if (k === 'pro_required') { B.openPro('cases'); openRegion(S.region); return; }
      B.toast(k === 'not_found' ? 'This case is not available.' : 'Could not open the case. Check your connection.', 'error');
      if (S.region) openRegion(S.region); else openHub();
    });
  }
  function backFromPlay() {
    var P = S.play;
    if (P && !P.finished && P.answers.length && !window.confirm('Leave this case? Your progress in it will be lost.')) return;
    S.play = null;
    // Refresh scores on the list.
    loadCatalog().then(function () { if (S.region) drawRegion(); else drawHub(); }, function () { if (S.region) drawRegion(); else drawHub(); });
  }
  function stepBlock(st, idx, P, current) {
    var ans = P.answers[idx];
    var opts = (st.options || []).map(function (o) {
      var cls = 'cs-opt';
      if (ans) {
        if (o.key === ans.correct_key) cls += ' ok';
        else if (o.key === ans.picked) cls += ' bad';
        else cls += ' dim';
      } else if (current && P.picked === o.key) cls += ' sel';
      return '<button class="' + cls + '" data-key="' + esc(o.key) + '"' + (ans ? ' disabled' : '') + '><span class="cs-opt-k">' + esc(o.key) + '</span><span class="cs-opt-t">' + esc(o.text) + '</span></button>';
    }).join('');
    var out = '';
    if (st.reveal) out += '<div class="cs-reveal"><span class="cs-reveal-k">New findings</span>' + html(st.reveal) + '</div>';
    out += '<section class="cs-q' + (ans ? ' answered' : '') + '" id="csStep' + idx + '"><div class="cs-q-n">Step ' + (idx + 1) + ' of ' + P.c.total + '</div>' +
      '<div class="cs-q-stem">' + html(st.stem) + '</div><div class="cs-opts">' + opts + '</div>';
    if (ans) {
      out += '<div class="cs-verdict ' + (ans.correct ? 'ok' : 'bad') + '">' + (ans.correct ? 'Correct' : 'Not quite — the answer is ' + esc(ans.correct_key)) + '</div>' +
        '<div class="cs-exp">' + expHtml(ans.explanation) + '</div>' +
        (ans.learning_point ? '<div class="cs-lp"><span>Key point</span>' + esc(ans.learning_point) + '</div>' : '');
    } else if (current) {
      out += '<button class="cs-btn" id="csCheck"' + (P.picked ? '' : ' disabled') + '>Check answer</button>';
    }
    out += '</section>';
    return out;
  }
  function drawPlay(scrollTo) {
    var P = S.play, c = P.c;
    var tags = (c.exam_tags || []).map(function (t) { return '<span class="cs-tag">' + esc(t) + '</span>'; }).join('');
    var pct = Math.round(P.answers.length * 100 / (c.total || 1));
    var body = '<section class="cs-case-head"><div class="cs-case-top">' + levelBadge(c.level) + (c.draft ? '<span class="cs-draft">Draft</span>' : '') + '<span class="cs-tags">' + tags + '</span></div>' +
      '<h1>' + esc(c.title) + '</h1><div class="cs-prog" aria-hidden="true"><span style="width:' + pct + '%"></span></div></section>' +
      '<article class="cs-vignette"><span class="cs-reveal-k">Case</span>' + html(c.vignette) + '</article>';
    P.timeline.forEach(function (st, i) { body += stepBlock(st, i, P, false); });
    if (P.step) body += stepBlock(P.step, P.timeline.length, P, true);
    if (P.finished) body += summaryHtml();
    if (P.result && !P.finished) body += '<button class="cs-btn cs-next" id="csNext">' + (P.result.next ? 'Continue the case' : 'See summary') + '</button>';
    paint('cases-play', body, backFromPlay);
    wirePlay();
    if (scrollTo) { var t = el(scrollTo); if (t) try { t.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { t.scrollIntoView(); } }
  }
  function wirePlay() {
    var P = S.play;
    document.querySelectorAll('.cs-q:not(.answered) .cs-opt').forEach(function (b) {
      b.onclick = function () {
        P.picked = b.getAttribute('data-key');
        document.querySelectorAll('.cs-q:not(.answered) .cs-opt').forEach(function (o) { o.classList.toggle('sel', o === b); });
        var ck = el('csCheck'); if (ck) ck.disabled = false;
      };
    });
    var ck = el('csCheck');
    if (ck) ck.onclick = function () {
      if (!P.picked || ck.disabled) return;
      ck.disabled = true; ck.textContent = 'Checking…';
      var st = P.step;
      rpc('case_check', { p_case: P.c.id, p_step: st.step_no, p_key: P.picked }).then(function (r) {
        P.answers.push({ picked: P.picked, correct: !!r.correct, correct_key: r.correct_key, explanation: r.explanation, learning_point: r.learning_point });
        if (r.correct) P.score++;
        P.timeline.push(st);
        P.step = null; P.picked = null; P.result = r;
        drawPlay('csStep' + (P.timeline.length - 1));
      }).catch(function (e) {
        ck.disabled = false; ck.textContent = 'Check answer';
        if (errKey(e) === 'pro_required') { B.openPro('cases'); return; }
        B.toast('Could not check the answer. Try again.', 'error');
      });
    };
    var nx = el('csNext');
    if (nx) nx.onclick = function () {
      var r = P.result; P.result = null;
      if (r && r.next) { P.step = r.next; drawPlay('csStep' + P.timeline.length); }
      else finish();
    };
    var again = el('csAgain'); if (again) again.onclick = function () { openCase(P.c.id); };
    var more = el('csMore'); if (more) more.onclick = backFromPlay;
    var nextCase = el('csNextCase'); if (nextCase) nextCase.onclick = function () { openCase(nextCase.getAttribute('data-id')); };
    var sign = el('csSign'); if (sign) sign.onclick = function () { B.openAuth('signup', { reason: 'Create a free account to save your case scores.' }); };
  }
  function finish() {
    var P = S.play;
    P.finished = true;
    ev('case_finish', { case_id: P.c.id, score: P.score, total: P.c.total });
    drawPlay('csSummary');
    if (B.user()) rpc('case_finish', { p_case: P.c.id, p_score: P.score }).then(function (r) {
      if (!r) return;
      var b = el('csBestLine'); if (b) b.textContent = 'Best ' + r.best + '/' + P.c.total + ' · attempt ' + r.tries;
    }).catch(function () { });
  }
  function nextCaseFor(P) {
    var list = ((S.cat && S.cat.cases) || []).filter(function (c) { return c.region_id === P.c.region_id && !c.locked; });
    var i = list.map(function (c) { return c.id; }).indexOf(P.c.id);
    for (var j = 1; j <= list.length; j++) { var c = list[(i + j) % list.length]; if (c && c.id !== P.c.id) return c; }
    return null;
  }
  function summaryHtml() {
    var P = S.play, n = P.c.total, sc = P.score, pct = Math.round(sc * 100 / (n || 1));
    var msg = pct === 100 ? 'Every step right.' : pct >= 75 ? 'Strong clinical reasoning.' : pct >= 50 ? 'Good, with a few gaps to revise.' : 'Worth going through the key points again.';
    var points = P.answers.map(function (a, i) {
      return a.learning_point ? '<li class="' + (a.correct ? 'ok' : 'bad') + '"><span class="cs-sum-n">' + (i + 1) + '</span>' + esc(a.learning_point) + '</li>' : '';
    }).join('');
    var nc = nextCaseFor(P);
    return '<section class="v3-card cs-summary" id="csSummary"><div class="cs-score"><b>' + sc + '</b><span>/ ' + n + '</span></div>' +
      '<h2>' + msg + '</h2><p class="cs-muted" id="csBestLine">' + (B.user() ? '' : 'Sign in to keep a record of your case scores.') + '</p>' +
      (points ? '<h3>Key points from this case</h3><ol class="cs-sum">' + points + '</ol>' : '') +
      '<div class="cs-sum-btns">' + (nc ? '<button class="cs-btn" id="csNextCase" data-id="' + esc(nc.id) + '">Next case</button>' : '') +
      '<button class="cs-btn ghost" id="csAgain">Try again</button><button class="cs-btn ghost" id="csMore">All cases in this region</button>' +
      (B.user() ? '' : '<button class="cs-btn ghost" id="csSign">Create free account</button>') + '</div></section>';
  }

  // Reopen after a reload (app.js keeps the last screen as "cases" or "cases/<region>").
  function openRoute(r) {
    if (r && /^[a-z]+$/.test(r)) openRegion(r); else openHub();
  }
  function refresh() {
    loadCatalog().then(function () { if (S.region && el('mainContent') && document.querySelector('.cs-cases')) drawRegion(); else drawHub(); }).catch(function () { });
  }

  // Images use the app-wide lightbox (qtext-img), the same as quiz questions.
  window.MLCases = { openHub: openHub, openRegion: openRegion, openCase: openCase, openRoute: openRoute, refresh: refresh };
})();
