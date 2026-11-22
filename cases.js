/* MedLadder Clinical Cases: long, unfolding vignettes organised by body region,
   with Core and Advanced levels. A separate section from the question bank.
   Loaded on demand by app.js (mlCases), which hands over helpers via window.MLBridge.
   Browsing (cases_overview, cases_list) is paged, searched and filtered on the server.
   The server (case_open, case_check, case_finish) owns content, answers and Pro
   access; answers arrive one step at a time. */
(function () {
  'use strict';
  var B = window.MLBridge;
  if (!B) return;

  var S = {
    ov: null,                     // cases_overview(): regions, counts, exam tags
    f: { region: null, topic: '', level: '', status: 'all', exam: '', q: '', sort: 'recommended' },
    list: { items: [], total: 0, topics: [], seq: 0, loading: false },
    from: 'hub',                  // where a case was opened from: hub (search) or region
    showFilters: false, scrollY: 0, play: null
  };
  var PAGE = 20;
  var LEVELS = [['', 'All levels'], ['core', 'Core'], ['advanced', 'Advanced']];
  var STATUSES = [['all', 'All cases'], ['new', 'Not attempted'], ['done', 'Completed']];
  var SORTS = [['recommended', 'Recommended order'], ['newest', 'Recently added'], ['lowest', 'Lowest score first'], ['az', 'A–Z']];

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
  function regionById(id) { return ((S.ov && S.ov.regions) || []).filter(function (r) { return r.id === id; })[0]; }
  function levelBadge(l) { return '<span class="cs-lvl cs-lvl-' + esc(l) + '">' + (l === 'advanced' ? 'Advanced' : 'Core') + '</span>'; }
  function lockSvg() {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>';
  }
  function chev() { return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>'; }
  function searchSvg() { return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>'; }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }

  function paint(screen, body, back) {
    B.paintShell(screen, '<div class="cs">' + body + '</div>', back);
  }
  function loadOverview() {
    return rpc('cases_overview').then(function (d) { S.ov = d || { regions: [], exams: [] }; return S.ov; });
  }
  function failPage(again) {
    paint('cases', '<section class="cs-head"><h1>Clinical cases</h1></section><p class="cs-muted">Could not load cases. Check your connection.</p><button class="cs-btn" id="csRetry">Try again</button>', B.home);
    var r = el('csRetry'); if (r) r.onclick = again;
  }

  // ---------- shared browse pieces: search, filters, list ----------
  function searchBox(ph) {
    return '<div class="cs-search"><span class="cs-search-ic">' + searchSvg() + '</span>' +
      '<label class="v2-sr" for="csQ">' + esc(ph) + '</label>' +
      '<input id="csQ" type="search" autocomplete="off" enterkeyhint="search" placeholder="' + esc(ph) + '" value="' + esc(S.f.q) + '">' +
      '<button class="cs-search-x" id="csQx" type="button" aria-label="Clear search"' + (S.f.q ? '' : ' hidden') + '>✕</button></div>';
  }
  function extraFilterCount() { return (S.f.status !== 'all' ? 1 : 0) + (S.f.exam ? 1 : 0) + (S.f.sort !== 'recommended' ? 1 : 0); }
  function filterBar() {
    var exams = (S.ov && S.ov.exams) || [];
    var n = extraFilterCount();
    var pills = function (name, list, cur) {
      return list.map(function (o) { return '<button class="cs-pill" data-' + name + '="' + esc(o[0]) + '" aria-pressed="' + (cur === o[0]) + '">' + esc(o[1]) + '</button>'; }).join('');
    };
    return '<div class="cs-fbar"><div class="cs-pills" role="group" aria-label="Level">' + pills('lvl', LEVELS, S.f.level) + '</div>' +
      '<button class="cs-fbtn" id="csFbtn" aria-expanded="' + S.showFilters + '">Filters' + (n ? ' <b>' + n + '</b>' : '') + '</button></div>' +
      '<div class="cs-fpanel" id="csFpanel"' + (S.showFilters ? '' : ' hidden') + '>' +
      (B.user() ? '<div class="cs-frow"><span>Status</span><div class="cs-pills">' + pills('st', STATUSES, S.f.status) + '</div></div>' : '') +
      (exams.length ? '<div class="cs-frow"><span>Exam</span><div class="cs-pills">' + pills('ex', [['', 'Any exam']].concat(exams.map(function (e) { return [e.tag, e.tag]; })), S.f.exam) + '</div></div>' : '') +
      '<div class="cs-frow"><span>Sort</span><select id="csSort" class="cs-select">' + SORTS.filter(function (o) { return o[0] !== 'lowest' || B.user(); }).map(function (o) {
        return '<option value="' + o[0] + '"' + (S.f.sort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
      }).join('') + '</select></div>' +
      (n ? '<button class="cs-link" id="csFreset" type="button">Clear filters</button>' : '') + '</div>';
  }
  function caseCard(c, showWhere) {
    var tags = (c.exam_tags || []).map(function (t) { return '<span class="cs-tag">' + esc(t) + '</span>'; }).join('');
    var status = c.tries ? '<span class="cs-done">✓ Done · best ' + c.best + '/' + c.steps + '</span>' : '';
    var where = showWhere ? esc(c.region_icon + ' ' + c.region_name) + (c.topic ? ' · ' + esc(c.topic) : '') : esc(c.topic || '');
    return '<button class="v3-card cs-case' + (c.locked ? ' locked' : '') + '" data-case="' + esc(c.id) + '"' + (c.locked ? ' data-locked="1"' : '') + '>' +
      '<span class="cs-case-top">' + levelBadge(c.level) + (c.draft ? '<span class="cs-draft">Draft</span>' : '') +
      (c.locked ? '<span class="cs-pro">' + lockSvg() + 'Pro</span>' : (c.is_free && !(S.ov && S.ov.is_pro) ? '<span class="cs-free">Free</span>' : '')) + status + '</span>' +
      (where ? '<span class="cs-where">' + where + '</span>' : '') +
      '<b class="cs-case-t">' + esc(c.title) + '</b>' +
      (c.summary ? '<span class="cs-case-s">' + esc(c.summary) + '</span>' : '') +
      '<span class="cs-case-m">' + plural(c.steps, 'step') + ' · ~' + c.est_minutes + ' min' + (tags ? '<span class="cs-tags">' + tags + '</span>' : '') + '</span>' +
      '</button>';
  }
  function drawResults() {
    var L = S.list, box = el('csResults');
    if (!box) return;
    var global = !S.f.region;
    var head = '<p class="cs-count">' + (L.loading && !L.items.length ? 'Searching…' : plural(L.total, 'case')) +
      (S.f.q ? ' for “' + esc(S.f.q) + '”' : '') + '</p>';
    var cards = L.items.map(function (c) { return caseCard(c, global); }).join('');
    var left = L.total - L.items.length;
    var more = left > 0 ? '<button class="cs-btn ghost cs-more" id="csMoreBtn"' + (L.loading ? ' disabled' : '') + '>' + (L.loading ? 'Loading…' : 'Show ' + Math.min(left, PAGE) + ' more (' + left + ' left)') + '</button>' : '';
    var empty = !L.loading && !L.items.length
      ? '<p class="cs-muted cs-center">' + (S.f.q || extraFilterCount() || S.f.level || S.f.topic ? 'No cases match. Try fewer words or clear the filters.' : 'No cases here yet. New cases are being written and reviewed.') + '</p>' : '';
    box.innerHTML = head + (cards ? '<div class="cs-cases">' + cards + '</div>' : '') + empty + more;
    box.querySelectorAll('[data-case]').forEach(function (b) {
      b.onclick = function () {
        if (b.getAttribute('data-locked')) { ev('cases_locked_tap', { region: S.f.region || '' }); B.openPro('cases'); return; }
        S.scrollY = window.scrollY || 0;
        openCase(b.getAttribute('data-case'));
      };
    });
    var mb = el('csMoreBtn'); if (mb) mb.onclick = function () { fetchList(false); };
  }
  function drawTopics() {
    var box = el('csTopics');
    if (!box) return;
    var L = S.list, sum = 0;
    (L.topics || []).forEach(function (t) { sum += t.n; });
    var chips = [['', 'All', sum]].concat((L.topics || []).map(function (t) { return [t.topic || '-', t.topic || 'Other', t.n]; }));
    if (S.f.topic && !chips.some(function (c) { return c[0] === S.f.topic; })) chips.push([S.f.topic, S.f.topic === '-' ? 'Other' : S.f.topic, 0]);
    box.innerHTML = chips.length > 2 || S.f.topic ? '<div class="cs-chips" role="group" aria-label="Topics">' + chips.map(function (c) {
      return '<button class="cs-chip" data-topic="' + esc(c[0]) + '" aria-pressed="' + (S.f.topic === c[0]) + '">' + esc(c[1]) + ' <small>' + c[2] + '</small></button>';
    }).join('') + '</div>' : '';
    box.querySelectorAll('[data-topic]').forEach(function (b) {
      b.onclick = function () { S.f.topic = b.getAttribute('data-topic'); fetchList(true); };
    });
  }
  // reset: start from the first page; otherwise load the next 20.
  // keep: reload as many as were showing (returning from a case), then restore the scroll position.
  function fetchList(reset, keep) {
    var L = S.list, seq = ++L.seq;
    var want = keep ? Math.max(PAGE, L.items.length) : PAGE;
    var offset = reset || keep ? 0 : L.items.length;
    L.loading = true;
    if (reset && !keep) { L.items = []; }
    drawResults();
    var got = [], total = 0, topics = [];
    function page(off) {
      return rpc('cases_list', {
        p_region: S.f.region || null, p_topic: S.f.topic || null, p_level: S.f.level || null, p_status: S.f.status,
        p_exam: S.f.exam || null, p_q: S.f.q || null, p_sort: S.f.sort, p_offset: off, p_limit: Math.min(50, want - got.length)
      }).then(function (d) {
        got = got.concat(d.items || []); total = d.total || 0; topics = d.topics || [];
        if (d.is_pro != null && S.ov) S.ov.is_pro = d.is_pro;
        if (got.length < want && got.length + offset < total && (d.items || []).length) return page(off + (d.items || []).length);
      });
    }
    return page(offset).then(function () {
      if (seq !== L.seq) return;
      L.loading = false;
      L.items = reset || keep ? got : L.items.concat(got);
      L.total = total; L.topics = topics;
      drawTopics(); drawResults();
      if (keep) try { window.scrollTo(0, S.scrollY || 0); } catch (e) { }
    }).catch(function () {
      if (seq !== L.seq) return;
      L.loading = false; drawResults();
      B.toast('Could not load cases. Check your connection.', 'error');
    });
  }
  function wireBrowse(onSearchChange) {
    var q = el('csQ'), x = el('csQx'), timer = null;
    if (q) {
      q.addEventListener('input', function () {
        clearTimeout(timer);
        x.hidden = !q.value;
        timer = setTimeout(function () {
          var v = q.value.trim();
          if (v === S.f.q) return;
          S.f.q = v;
          if (onSearchChange) onSearchChange(); else fetchList(true);
          if (v.length >= 2) ev('cases_search', { q: v.slice(0, 40), region: S.f.region || '' });
        }, 300);
      });
      q.addEventListener('keydown', function (e) { if (e.key === 'Enter') { q.blur(); } });
      x.onclick = function () { q.value = ''; x.hidden = true; S.f.q = ''; if (onSearchChange) onSearchChange(); else fetchList(true); q.focus(); };
    }
    wireFilters();
  }
  function wireFilters() {
    var fb = el('csFbtn');
    if (fb) fb.onclick = function () { S.showFilters = !S.showFilters; el('csFpanel').hidden = !S.showFilters; fb.setAttribute('aria-expanded', String(S.showFilters)); };
    var redraw = function () {
      var bar = el('csFilters'); if (bar) { bar.innerHTML = filterBar(); wireFilters(); }
      fetchList(true);
    };
    document.querySelectorAll('.cs [data-lvl]').forEach(function (b) { b.onclick = function () { S.f.level = b.getAttribute('data-lvl'); redraw(); }; });
    document.querySelectorAll('.cs [data-st]').forEach(function (b) { b.onclick = function () { S.f.status = b.getAttribute('data-st'); redraw(); }; });
    document.querySelectorAll('.cs [data-ex]').forEach(function (b) { b.onclick = function () { S.f.exam = b.getAttribute('data-ex'); redraw(); }; });
    var so = el('csSort'); if (so) so.onchange = function () { S.f.sort = so.value; redraw(); };
    var rs = el('csFreset'); if (rs) rs.onclick = function () { S.f.status = 'all'; S.f.exam = ''; S.f.sort = 'recommended'; redraw(); };
  }

  // ---------- hub: search + regions ----------
  function openHub() {
    S.from = 'hub';
    S.f.region = null; S.f.topic = '';
    B.route('cases');
    if (!S.ov) paint('cases', '<section class="cs-head"><h1>Clinical cases</h1></section><p class="cs-muted">Loading…</p>', B.home);
    loadOverview().then(function () { drawHub(); }).catch(function () { failPage(openHub); });
  }
  function drawHub(keep) {
    view('/cases', 'Clinical cases');
    var O = S.ov;
    var tiles = (O.regions || []).map(function (r) {
      var meta = r.total ? plural(r.total, 'case') + (r.done ? ' · ' + r.done + ' done' : '') + (!O.is_pro && r.free && r.free < r.total ? ' · ' + r.free + ' free' : '') : 'Coming soon';
      return '<button class="v3-card cs-region' + (r.total ? '' : ' empty') + '" data-region="' + esc(r.id) + '"' + (r.total ? '' : ' aria-disabled="true"') + '>' +
        '<span class="cs-region-ic" aria-hidden="true">' + esc(r.icon) + '</span>' +
        '<span class="cs-region-tx"><b>' + esc(r.name) + '</b><small>' + esc(r.blurb) + '</small><em>' + meta + '</em></span>' +
        (r.total ? '<span class="cs-region-go">' + chev() + '</span>' : '') + '</button>';
    }).join('');
    var body =
      '<section class="cs-head"><span class="v3-chip">Clinical cases</span>' +
      '<h1>Think like the exam, one case at a time</h1>' +
      '<p>Long vignettes that unfold step by step, in the style of NEET SS, INI-CET and USMLE. <b>Core</b> builds the essentials; <b>Advanced</b> is for super-speciality level.</p>' +
      (O.total ? '<div class="cs-stat"><b>' + O.done + '</b> of <b>' + O.total + '</b> cases attempted</div>' : '') +
      '</section>' + searchBox('Search symptoms, diagnoses…') +
      '<div id="csSearchArea"' + (S.f.q ? '' : ' hidden') + '><div id="csFilters">' + filterBar() + '</div><div id="csResults"></div></div>' +
      '<div id="csGrid"' + (S.f.q ? ' hidden' : '') + '><div class="cs-regions">' + tiles + '</div>' +
      (O.total ? '' : '<p class="cs-muted cs-center">New cases are being written and reviewed. Check back soon.</p>') + '</div>';
    paint('cases', body, B.home);
    var sync = function () {
      var searching = S.f.q.length > 0;
      el('csSearchArea').hidden = !searching; el('csGrid').hidden = searching;
      if (searching) fetchList(true);
    };
    wireBrowse(sync);
    if (S.f.q) fetchList(!keep, keep);
    document.querySelectorAll('.cs [data-region]').forEach(function (b) {
      if (b.getAttribute('aria-disabled')) return;
      b.onclick = function () { openRegion(b.getAttribute('data-region')); };
    });
  }

  // ---------- region: topic chips + list ----------
  function openRegion(id) {
    if (S.f.region !== id) { S.f.topic = ''; }
    S.f.region = id; S.f.q = '';
    S.from = 'region';
    B.route('cases/' + id);
    var go = function () { drawRegion(); };
    if (!S.ov) { paint('cases', '<section class="cs-head"><h1>Clinical cases</h1></section><p class="cs-muted">Loading…</p>', openHub); loadOverview().then(go).catch(function () { failPage(function () { openRegion(id); }); }); return; }
    go();
  }
  function drawRegion(keep) {
    var r = regionById(S.f.region);
    if (!r) { openHub(); return; }
    view('/cases/' + r.id, 'Cases – ' + r.name);
    var body = '<section class="cs-head cs-head-sm"><span class="cs-region-ic big" aria-hidden="true">' + esc(r.icon) + '</span><div><h1>' + esc(r.name) + '</h1><p>' + esc(r.blurb) + '</p>' +
      (r.total ? '<p class="cs-sub">' + plural(r.total, 'case') + (r.done ? ' · ' + r.done + ' done' : '') + '</p>' : '') + '</div></section>' +
      searchBox('Search in ' + r.name + '…') +
      '<div id="csTopics"></div><div id="csFilters">' + filterBar() + '</div><div id="csResults"></div>';
    paint('cases', body, function () { S.f.q = ''; openHub(); });
    wireBrowse(null);
    fetchList(!keep, keep);
  }

  // ---------- player ----------
  function openCase(id) {
    paint('cases-play', '<p class="cs-muted cs-pad">Opening case…</p>', backToList);
    rpc('case_open', { p_case: id }).then(function (c) {
      B.route(S.from === 'region' && S.f.region ? 'cases/' + S.f.region : 'cases');
      S.play = { c: c, step: c.step, answers: [], score: 0, timeline: [], picked: null, result: null, finished: false };
      ev('case_start', { case_id: id, level: c.level, region: c.region_id });
      view('/cases/' + c.region_id + '/case', 'Case – ' + c.title);
      drawPlay();
    }).catch(function (e) {
      var k = errKey(e);
      if (k === 'pro_required') { B.openPro('cases'); backToList(); return; }
      B.toast(k === 'not_found' ? 'This case is not available.' : 'Could not open the case. Check your connection.', 'error');
      backToList();
    });
  }
  function backFromPlay() {
    var P = S.play;
    if (P && !P.finished && P.answers.length && !window.confirm('Leave this case? Your progress in it will be lost.')) return;
    S.play = null;
    backToList();
  }
  // Back to the list the case was opened from, with the same search, filters,
  // number of loaded cards and scroll position; scores are refreshed.
  function backToList() {
    var done = function () { if (S.from === 'region' && S.f.region) drawRegion(true); else drawHub(true); };
    loadOverview().then(done, done);
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
  // Next case: the following open case in the list it was opened from.
  function nextCaseFor(P) {
    var list = (S.list.items || []).filter(function (c) { return !c.locked; });
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
      '<button class="cs-btn ghost" id="csAgain">Try again</button><button class="cs-btn ghost" id="csMore">' + (S.from === 'region' ? 'Back to the list' : 'Back to search') + '</button>' +
      (B.user() ? '' : '<button class="cs-btn ghost" id="csSign">Create free account</button>') + '</div></section>';
  }

  // Reopen after a reload (app.js keeps the last screen as "cases" or "cases/<region>").
  function openRoute(r) {
    if (r && /^[a-z]+$/.test(r)) openRegion(r); else openHub();
  }
  // Signed in or out: counts, locks and status filters change.
  function refresh() {
    if (!B.user()) S.f.status = 'all';
    if (S.f.sort === 'lowest' && !B.user()) S.f.sort = 'recommended';
    loadOverview().then(function () { if (S.from === 'region' && S.f.region) drawRegion(); else drawHub(); }).catch(function () { });
  }

  // Images use the app-wide lightbox (qtext-img), the same as quiz questions.
  window.MLCases = { openHub: openHub, openRegion: openRegion, openCase: openCase, openRoute: openRoute, refresh: refresh };
})();
