/* MedLadder Quiz Battles: create, lobby, timed quiz, podium and review.
   Loaded on demand by app.js, which hands over helpers through window.MLBridge.
   The server (Supabase RPCs battle_*) owns questions, time, correctness and score. */
(function () {
  'use strict';
  var B = window.MLBridge;
  if (!B) return;

  var ADJ = ['Swift', 'Calm', 'Brave', 'Sharp', 'Lucky', 'Bold', 'Keen', 'Quick', 'Steady', 'Witty', 'Bright', 'Cool', 'Mighty', 'Sleepy', 'Jolly', 'Clever'];
  var NOUN = ['Neutrophil', 'Purkinje', 'Osler', 'Nephron', 'Alveolus', 'Ventricle', 'Hepatocyte', 'Macrophage', 'Cortex', 'Synapse', 'Thalamus', 'Platelet', 'Axon', 'Villus', 'Fleming', 'Hippocampus'];
  var S = {};
  var timers = [];

  function el(id) { return document.getElementById(id); }
  function esc(s) { return B.esc(s); }
  function rpc(name, args) {
    return B.sb().rpc(name, args).then(function (r) { if (r.error) throw r.error; return r.data; });
  }
  function errKey(e) {
    var m = String((e && (e.message || e)) || '');
    var keys = ['sign_in_required', 'daily_limit', 'pro_required', 'no_questions', 'not_found', 'ended', 'too_late', 'full', 'not_host', 'need_players', 'already_started', 'closed', 'not_ended', 'not_started', 'bad_source'];
    for (var i = 0; i < keys.length; i++) if (m.indexOf(keys[i]) !== -1) return keys[i];
    return 'network';
  }
  var ERR = {
    sign_in_required: 'Sign in to host a battle.',
    daily_limit: 'Free accounts can host 3 battles a day. Pro hosts unlimited.',
    pro_required: 'That topic is part of Pro. Pick a free topic or upgrade.',
    no_questions: 'This topic has too few questions for a battle.',
    not_found: 'No battle with that code. Check the link and try again.',
    ended: 'This battle has already finished.',
    too_late: 'This battle is too far along to join.',
    full: 'This battle is full.',
    not_host: 'Only the host can do that.',
    need_players: 'You need at least 2 players to start.',
    already_started: 'The battle has already started.',
    closed: 'Time is up.',
    not_ended: 'The battle is still running.',
    not_started: 'The battle has not started yet.',
    bad_source: 'Could not set up that topic.',
    network: 'Connection problem. Please try again.'
  };
  function fail(e) { var k = errKey(e); B.toast(ERR[k] || ERR.network, 'error'); return k; }

  function stopAll() { timers.forEach(function (t) { clearInterval(t); clearTimeout(t); }); timers = []; }
  function every(fn, ms) { var t = setInterval(fn, ms); timers.push(t); return t; }
  function later(fn, ms) { var t = setTimeout(fn, ms); timers.push(t); return t; }

  function srvNow() { return Date.now() + (S.offset || 0); }
  function syncClock(serverNow) { if (serverNow) S.offset = Date.parse(serverNow) - Date.now(); }

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
  }
  function tokenFor(code) {
    var k = 'mlbt_' + code;
    try { var t = localStorage.getItem(k); if (t) return t; t = uuid(); localStorage.setItem(k, t); return t; } catch (e) { return S['tok_' + code] || (S['tok_' + code] = uuid()); }
  }
  function randNick() { return ADJ[Math.random() * ADJ.length | 0] + ' ' + NOUN[Math.random() * NOUN.length | 0]; }
  function savedNick() {
    try {
      var n = localStorage.getItem('mlbt_nick');
      if (n) return n;
    } catch (e) { }
    return randNick();
  }
  function rememberNick(n) { try { localStorage.setItem('mlbt_nick', n); } catch (e) { } }

  function ordinal(n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  function mmss(sec) { sec = Math.max(0, Math.ceil(sec)); var m = Math.floor(sec / 60), s = sec % 60; return m + ':' + (s < 10 ? '0' : '') + s; }
  function shareUrl(code) { return 'https://medladder.top/battle/' + code; }
  function hash(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function seededOrder(n, seed) {
    var a = []; for (var i = 0; i < n; i++) a.push(i);
    var x = hash(seed) || 1;
    for (var j = n - 1; j > 0; j--) { x = Math.imul(x ^ (x >>> 15), 2246822519) >>> 0; var k = x % (j + 1); var t = a[j]; a[j] = a[k]; a[k] = t; }
    return a;
  }

  function mount(html, cls) {
    var app = B.app();
    stopAllIfLeaving();
    B.setScreen('battle');
    app.className = (app.className || '').replace(/\bscreen-[a-z]+\b/g, '').trim() + ' screen-battle';
    app.innerHTML = '<div class="bt ' + (cls || '') + '">' + html + '</div>';
    try { window.scrollTo(0, 0); } catch (e) { }
  }
  function stopAllIfLeaving() { /* timers are stopped explicitly by each screen */ }

  function topBar(title, backLabel) {
    return '<header class="bt-top"><button class="bt-back" id="btBack" aria-label="' + esc(backLabel || 'Back') + '">' +
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<div class="bt-top-title">' + esc(title || 'Quiz Battle') + '</div></header>';
  }
  function wireBack(fn) { var b = el('btBack'); if (b) b.onclick = function () { stopAll(); fn(); }; }
  function home() { stopAll(); S = {}; B.home(); }

  // ---------- create ----------
  function openCreate(opts) {
    opts = opts || {};
    if (!B.user()) {
      B.openAuth('signin', { onSuccess: function () { openCreate(opts); } });
      B.toast('Sign in to host a battle. Joining a friend’s battle needs no account.');
      return;
    }
    stopAll();
    var pro = B.isPro();
    var capP = pro ? 50 : 5, capQ = pro ? 50 : 20;
    var avail = Math.max(opts.maxQ || 0, 0);
    var c = S.create = { players: 10 > capP ? capP : 10, n: 20, minutes: 20, neg: false, title: (opts.title || 'Quiz') + ' Showdown', nick: B.userFirstName() || savedNick() };
    if (avail && c.n > avail) c.n = Math.max(5, avail);
    function pills(id, vals, cur, cap, fmt) {
      return '<div class="bt-pills" id="' + id + '">' + vals.map(function (v) {
        var lock = cap && v > cap;
        return '<button class="bt-pill' + (v === cur ? ' on' : '') + (lock ? ' lock' : '') + '" data-v="' + v + '">' + (fmt ? fmt(v) : v) + (lock ? ' <span class="bt-pro">PRO</span>' : '') + '</button>';
      }).join('') + '</div>';
    }
    mount(topBar('Battle with friends', 'Back') +
      '<main class="bt-main"><h1 class="bt-h1">Battle with friends</h1>' +
      '<p class="bt-sub">' + esc(opts.title || 'Topic') + '. Everyone gets the same questions and one shared clock.</p>' +
      '<section class="bt-card"><div class="bt-label">Players</div>' + pills('btP', [2, 5, 10, 20, 30, 50], c.players, capP) + '</section>' +
      '<section class="bt-card"><div class="bt-label">Questions' + (avail ? ' <small>(topic has ' + avail + ')</small>' : '') + '</div>' + pills('btQ', [10, 20, 30, 50], c.n, capQ) + '</section>' +
      '<section class="bt-card"><div class="bt-label">Time</div>' + pills('btT', [10, 20, 30, 45], c.minutes, 0, function (v) { return v + ' min'; }) + '</section>' +
      '<section class="bt-card"><label class="bt-switch"><input type="checkbox" id="btNeg"><span><b>Negative marking</b><small>A wrong answer costs 25 points</small></span></label></section>' +
      '<section class="bt-card"><label class="bt-label" for="btTitle">Room name</label><input class="bt-input" id="btTitle" maxlength="60" value="' + esc(c.title) + '">' +
      '<label class="bt-label" for="btNick" style="margin-top:12px">Your name in the battle</label><input class="bt-input" id="btNick" maxlength="20" value="' + esc(c.nick) + '"></section>' +
      (pro ? '' : '<p class="bt-note">Free hosts: up to 5 players, 20 questions, 3 battles a day. <button class="bt-link" id="btUp">Upgrade for 50 players</button></p>') +
      '<button class="bt-cta" id="btCreate">Create battle</button></main>');
    wireBack(opts.back || home);
    function bind(id, key) {
      var host = el(id);
      host.addEventListener('click', function (e) {
        var b = e.target.closest('.bt-pill'); if (!b) return;
        if (b.classList.contains('lock')) { B.openPro('battle'); return; }
        c[key] = parseInt(b.getAttribute('data-v'), 10);
        host.querySelectorAll('.bt-pill').forEach(function (x) { x.classList.toggle('on', x === b); });
      });
    }
    bind('btP', 'players'); bind('btQ', 'n'); bind('btT', 'minutes');
    var up = el('btUp'); if (up) up.onclick = function () { B.openPro('battle'); };
    el('btCreate').onclick = function () {
      var btn = el('btCreate');
      c.title = el('btTitle').value.trim() || 'Quiz Battle';
      c.nick = el('btNick').value.trim() || randNick();
      rememberNick(c.nick);
      btn.disabled = true; btn.textContent = 'Creating…';
      var tmpTok = uuid();
      rpc('battle_create', {
        p_token: tmpTok, p_nick: c.nick,
        p_source: { module_ids: opts.moduleIds, title: opts.title || '' },
        p_settings: { max_players: c.players, n: c.n, minutes: c.minutes, neg: el('btNeg').checked, title: c.title }
      }).then(function (r) {
        try { localStorage.setItem('mlbt_' + r.code, tmpTok); } catch (e) { S['tok_' + r.code] = tmpTok; }
        openBattle(r.code);
      }).catch(function (e) { fail(e); btn.disabled = false; btn.textContent = 'Create battle'; });
    };
  }

  // ---------- entry: join link or resume ----------
  function openBattle(code) {
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    stopAll();
    S.code = code; S.token = tokenFor(code);
    mount('<main class="bt-main bt-center"><div class="bt-spin"></div><p class="bt-sub">Opening battle…</p></main>');
    rpc('battle_state', { p_code: code, p_token: S.token }).then(function (st) {
      S.st = st; syncClock(st.now);
      route(st);
    }).catch(function (e) { var k = fail(e); mount(topBar('Quiz Battle') + '<main class="bt-main bt-center"><h1 class="bt-h1">' + esc(ERR[k] || ERR.network) + '</h1><button class="bt-cta" id="btHome">Go to MedLadder</button></main>'); wireBack(home); el('btHome').onclick = home; });
  }

  function route(st) {
    if (!st.me) {
      if (st.status === 'ended') return joinScreen(st); // shows the ended message on join
      return joinScreen(st);
    }
    if (st.status === 'ended') return loadResults();
    if (st.status === 'live') {
      if (st.me.finished) return waitingScreen();
      return beginLive();
    }
    lobbyScreen(st);
  }

  function joinScreen(st) {
    var nick = savedNick();
    var ended = st.status === 'ended';
    mount(topBar('Quiz Battle') + '<main class="bt-main bt-center">' +
      '<div class="bt-badge">Battle invite</div><h1 class="bt-h1">' + esc(st.title) + '</h1>' +
      '<p class="bt-sub">' + st.n + ' questions · ' + st.minutes + ' min · ' + st.players.length + ' of ' + st.max_players + ' joined</p>' +
      (ended ? '<p class="bt-sub">This battle has finished.</p>' :
        '<section class="bt-card bt-join"><label class="bt-label" for="btNick">Your name</label>' +
        '<div class="bt-row"><input class="bt-input" id="btNick" maxlength="20" value="' + esc(nick) + '"><button class="bt-ghost" id="btDice" title="New name">🎲</button></div>' +
        '<button class="bt-cta" id="btJoin">Join battle</button><p class="bt-note">No account needed.</p></section>') +
      '</main>');
    wireBack(home);
    if (ended) return;
    el('btDice').onclick = function () { el('btNick').value = randNick(); };
    el('btJoin').onclick = function () {
      var btn = el('btJoin'); btn.disabled = true;
      var n = el('btNick').value.trim() || randNick(); rememberNick(n);
      rpc('battle_join', { p_code: S.code, p_token: S.token, p_nick: n }).then(function () { openBattle(S.code); })
        .catch(function (e) { var k = fail(e); btn.disabled = false; if (k === 'full') showFull(); });
    };
  }
  function showFull() { /* the toast already said it; offer own battle via home */ }

  // ---------- lobby ----------
  function avatar(name) {
    var h = hash(name) % 360;
    return '<span class="bt-av" style="background:hsl(' + h + ',62%,46%)">' + esc(name.charAt(0).toUpperCase()) + '</span>';
  }
  function lobbyScreen(st) {
    var code = st.code, host = st.me.is_host, url = shareUrl(code);
    var msg = 'Join my MedLadder battle on ' + st.title.replace(/ Showdown$/, '') + ': ' + st.n + ' Qs, ' + st.minutes + ' min. ' + url;
    mount(topBar('Lobby', 'Leave') + '<main class="bt-main">' +
      '<div class="bt-center"><div class="bt-badge">Share this code</div><div class="bt-code" id="btCode">' + esc(code) + '</div>' +
      '<h1 class="bt-h1 sm">' + esc(st.title) + '</h1><p class="bt-sub">' + st.n + ' questions · ' + st.minutes + ' min' + (st.neg ? ' · negative marking' : '') + '</p></div>' +
      '<div class="bt-share">' +
      '<button class="bt-chip" id="btCopy">Copy link</button>' +
      '<a class="bt-chip wa" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent(msg) + '">WhatsApp</a>' +
      '<a class="bt-chip tg" target="_blank" rel="noopener" href="https://t.me/share/url?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent('Join my MedLadder battle: ' + st.title) + '">Telegram</a>' +
      (navigator.share ? '<button class="bt-chip" id="btShare">Share…</button>' : '') + '</div>' +
      '<section class="bt-card"><div class="bt-label"><span id="btCount"></span></div><ul class="bt-players" id="btPlayers"></ul></section>' +
      '<div id="btAction"></div></main>');
    wireBack(home);
    el('btCopy').onclick = function () {
      var done = function () { B.toast('Link copied'); };
      if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, function () { B.toast(url); }); else B.toast(url);
    };
    var sh = el('btShare'); if (sh) sh.onclick = function () { navigator.share({ title: st.title, text: msg, url: url }).catch(function () { }); };
    drawLobby(st);
    every(poll, 1500);
    function poll() {
      rpc('battle_state', { p_code: code, p_token: S.token }).then(function (s) {
        S.st = s; syncClock(s.now);
        if (!s.me) { stopAll(); mount(topBar('Quiz Battle') + '<main class="bt-main bt-center"><h1 class="bt-h1">You were removed from this battle</h1><button class="bt-cta" id="btHome">Go to MedLadder</button></main>'); wireBack(home); el('btHome').onclick = home; return; }
        if (s.status === 'live') { stopAll(); countdown(); return; }
        if (s.status === 'ended') { stopAll(); loadResults(); return; }
        drawLobby(s);
      }).catch(function () { });
    }
  }
  function drawLobby(st) {
    var list = el('btPlayers'); if (!list) return;
    var host = st.me && st.me.is_host;
    el('btCount').textContent = st.players.length + ' of ' + st.max_players + ' joined';
    list.innerHTML = st.players.map(function (p) {
      return '<li class="bt-pl">' + avatar(p.nickname) + '<span class="bt-pn">' + esc(p.nickname) + (p.id === st.me.id ? ' <em>(you)</em>' : '') + '</span>' +
        (p.is_host ? '<span class="bt-tag">Host</span>' : (host ? '<button class="bt-x" data-id="' + p.id + '" aria-label="Remove ' + esc(p.nickname) + '">✕</button>' : '')) + '</li>';
    }).join('');
    list.querySelectorAll('.bt-x').forEach(function (b) {
      b.onclick = function () { rpc('battle_kick', { p_code: st.code, p_token: S.token, p_player: b.getAttribute('data-id') }).catch(fail); };
    });
    var act = el('btAction');
    if (host) {
      var ok = st.players.length >= 2;
      act.innerHTML = '<button class="bt-cta" id="btStart"' + (ok ? '' : ' disabled') + '>' + (ok ? 'Start battle' : 'Waiting for a friend to join…') + '</button>';
      var sb = el('btStart');
      if (sb) sb.onclick = function () {
        sb.disabled = true;
        rpc('battle_start', { p_code: st.code, p_token: S.token }).then(function () { stopAll(); countdown(); }).catch(function (e) { fail(e); sb.disabled = false; });
      };
    } else act.innerHTML = '<p class="bt-wait">Waiting for the host to start…</p>';
  }

  // ---------- countdown and live ----------
  function countdown() {
    rpc('battle_state', { p_code: S.code, p_token: S.token }).then(function (st) {
      S.st = st; syncClock(st.now);
      if (st.status === 'ended') return loadResults();
      var startsAt = Date.parse(st.starts_at);
      if (srvNow() > startsAt + 3000) return beginLive(); // joined mid-battle
      mount('<main class="bt-main bt-center bt-count"><div class="bt-badge">' + esc(st.title) + '</div><div class="bt-big" id="btBig">…</div><p class="bt-sub">Get ready. Everyone starts together.</p></main>');
      var last = null;
      var t = every(function () {
        var left = Math.ceil((startsAt - srvNow()) / 1000);
        var big = el('btBig'); if (!big) return;
        if (left > 0) { if (left !== last) { big.textContent = left; big.classList.remove('pop'); void big.offsetWidth; big.classList.add('pop'); last = left; } }
        else { clearInterval(t); big.textContent = 'Go!'; later(beginLive, 350); }
      }, 100);
    }).catch(function (e) { fail(e); });
  }

  function beginLive() {
    stopAll();
    rpc('battle_questions', { p_code: S.code, p_token: S.token }).then(function (d) {
      syncClock(d.now);
      S.qs = d.questions; S.mine = d.mine || {}; S.res = {}; S.ends = Date.parse(d.ends_at); S.starts = Date.parse(d.starts_at);
      S.order = seededOrder(S.qs.length, S.token + S.code);
      var firstOpen = 0;
      for (var i = 0; i < S.order.length; i++) if (!S.mine[S.qs[S.order[i]].id]) { firstOpen = i; break; }
      S.pos = firstOpen; S.confirmFinish = false;
      S.score = (S.st && S.st.me && S.st.me.score) || 0; S.streak = (S.st && S.st.me && S.st.me.streak) || 0;
      S.lastRank = 0; S.lbOpen = false;
      liveShell();
      drawQuiz();
      every(tick, 250);
      every(livePoll, 2500);
      livePoll();
    }).catch(function (e) {
      var k = errKey(e);
      if (k === 'ended') return loadResults();
      if (k === 'not_started') return later(beginLive, 800);
      fail(e);
    });
  }

  function answeredCount() { return Object.keys(S.mine).length; }
  function liveShell() {
    mount('<header class="bt-live-top"><div class="bt-time" id="btTime">0:00</div>' +
      '<div class="bt-hud"><span class="bt-score" id="btScore">' + S.score + '</span><small>points</small></div>' +
      '<div class="bt-flame' + (S.streak >= 2 ? ' on' : '') + '" id="btFlame" title="Streak"><span>🔥</span><b id="btStreak">' + S.streak + '</b></div>' +
      '<button class="bt-finish" id="btFin">Finish</button>' +
      '<div class="bt-tbar"><i id="btBar"></i></div></header>' +
      '<div class="bt-live-grid"><main class="bt-qwrap" id="btQ"></main>' +
      '<aside class="bt-lb" id="btLBWrap"><button class="bt-lb-head" id="btLBHead"><span>Live leaderboard</span><b id="btMyRank"></b><i class="bt-lb-chev">▾</i></button><ol class="bt-lb-list" id="btLB"></ol></aside></div>' +
      '<div class="bt-fx" id="btFx" aria-live="polite"></div>', 'bt-live');
    el('btFin').onclick = function () {
      var left = S.qs.length - answeredCount();
      if (left === 0 || S.confirmFinish) return finishNow();
      S.confirmFinish = true;
      var f = el('btFin'); f.classList.add('sure'); f.textContent = 'Submit? ' + left + ' left';
      later(function () { var f2 = el('btFin'); if (f2) { S.confirmFinish = false; f2.classList.remove('sure'); f2.textContent = 'Finish'; } }, 3500);
    };
    el('btLBHead').onclick = function () { S.lbOpen = !S.lbOpen; el('btLBWrap').classList.toggle('open', S.lbOpen); };
  }
  function tick() {
    var left = (S.ends - srvNow()) / 1000;
    var t = el('btTime');
    if (t) { t.textContent = mmss(left); t.classList.toggle('low', left <= 60); }
    var bar = el('btBar');
    if (bar && S.starts) { var tot = (S.ends - S.starts) / 1000; bar.style.width = Math.max(0, Math.min(100, left * 100 / tot)) + '%'; bar.classList.toggle('low', left <= 60); }
    if (left <= 0) { stopAll(); finishNow(); }
  }
  function livePoll() {
    rpc('battle_state', { p_code: S.code, p_token: S.token }).then(function (st) {
      syncClock(st.now); S.st = st;
      if (st.status === 'ended') { stopAll(); return loadResults(); }
      drawLB(st, el('btLB'));
    }).catch(function () { });
  }

  // Leaderboard rows slide to their new place (FLIP) when the order changes.
  function drawLB(st, list) {
    if (!list) return;
    var n = st.n || (S.qs ? S.qs.length : 0);
    var before = {};
    list.querySelectorAll('li[data-id]').forEach(function (li) { before[li.getAttribute('data-id')] = li.getBoundingClientRect().top; });
    var players = st.players.slice().sort(function (a, b) { return b.score - a.score || b.correct - a.correct; });
    var myRank = 0;
    list.innerHTML = players.map(function (p) {
      // Equal scores share a place, so a tie never reads as being overtaken.
      var rk = 1 + players.filter(function (x) { return x.score > p.score; }).length;
      var mine = st.me && p.id === st.me.id; if (mine) myRank = rk;
      var medal = p.score <= 0 && st.status !== 'ended' ? rk : rk === 1 ? '🥇' : rk === 2 ? '🥈' : rk === 3 ? '🥉' : rk;
      return '<li data-id="' + p.id + '" class="' + (mine ? 'me' : '') + (p.finished ? ' fin' : '') + '"><span class="bt-lb-r">' + medal + '</span>' + avatar(p.nickname) +
        '<span class="bt-lb-n"><b>' + esc(p.nickname) + (mine ? ' (you)' : '') + '</b><span class="bt-lb-p"><i style="width:' + (n ? Math.round(p.answered * 100 / n) : 0) + '%"></i></span></span>' +
        (p.streak >= 3 ? '<span class="bt-lb-s" title="' + p.streak + ' in a row">🔥' + p.streak + '</span>' : '') +
        (p.finished ? '<span class="bt-lb-done" title="Finished">✓</span>' : '') +
        '<span class="bt-lb-pts">' + p.score + '</span></li>';
    }).join('');
    list.querySelectorAll('li[data-id]').forEach(function (li) {
      var id = li.getAttribute('data-id'); if (before[id] === undefined) return;
      var dy = before[id] - li.getBoundingClientRect().top;
      if (Math.abs(dy) > 2) { li.style.transform = 'translateY(' + dy + 'px)'; li.style.transition = 'none'; requestAnimationFrame(function () { li.style.transition = 'transform .5s cubic-bezier(.2,.8,.2,1)'; li.style.transform = ''; }); }
    });
    var mr = el('btMyRank'); if (mr && myRank) mr.textContent = ordinal(myRank) + ' of ' + players.length;
    if (S.lastRank && myRank && myRank < S.lastRank) banner(myRank === 1 ? '👑 You took the lead!' : '⬆ Up to ' + ordinal(myRank) + '!', 'up');
    else if (S.lastRank && myRank > S.lastRank) banner(S.lastRank === 1 ? 'You lost the lead. Fight back!' : 'Down to ' + ordinal(myRank) + '. Keep going!', 'down');
    S.lastRank = myRank;
  }

  function banner(text, kind) {
    var fx = el('btFx'); if (!fx) return;
    var b = document.createElement('div'); b.className = 'bt-banner ' + (kind || ''); b.textContent = text;
    fx.appendChild(b); setTimeout(function () { b.remove(); }, 2200);
  }
  function floatAt(node, html, cls) {
    var fx = el('btFx'); if (!fx || !node) return;
    var r = node.getBoundingClientRect();
    var f = document.createElement('div'); f.className = 'bt-float ' + (cls || ''); f.innerHTML = html;
    f.style.left = (r.left + r.width / 2) + 'px'; f.style.top = (r.top + r.height / 2) + 'px';
    fx.appendChild(f); setTimeout(function () { f.remove(); }, 1300);
  }
  function burst(node, n, chars) {
    var fx = el('btFx'); if (!fx || !node || reduced()) return;
    var r = node.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    for (var i = 0; i < n; i++) {
      var s = document.createElement('span'); s.className = 'bt-star';
      s.textContent = chars[i % chars.length];
      var a = Math.random() * Math.PI * 2, d = 60 + Math.random() * 90;
      s.style.left = cx + 'px'; s.style.top = cy + 'px';
      s.style.setProperty('--dx', Math.cos(a) * d + 'px'); s.style.setProperty('--dy', Math.sin(a) * d - 30 + 'px');
      s.style.setProperty('--rot', (Math.random() * 360 | 0) + 'deg');
      s.style.color = ['#F5B301', '#A78BFA', '#34D399', '#F472B6', '#60A5FA'][i % 5];
      fx.appendChild(s); (function (x) { setTimeout(function () { x.remove(); }, 900); })(s);
    }
  }
  function reduced() { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
  function countUp(node, from, to) {
    if (!node) return;
    var t0 = performance.now(), dur = 600;
    (function step(t) { var k = Math.min(1, (t - t0) / dur); node.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); })(t0);
    node.classList.remove('bump'); void node.offsetWidth; node.classList.add('bump');
  }
  function setStreak(n) {
    S.streak = n;
    var f = el('btFlame'), b = el('btStreak'); if (!f || !b) return;
    b.textContent = n; f.classList.toggle('on', n >= 2); f.classList.toggle('hot', n >= 5);
    f.classList.remove('bump'); void f.offsetWidth; if (n >= 2) f.classList.add('bump');
  }

  function drawQuiz() {
    var host = el('btQ'); if (!host) return;
    var n = S.qs.length, q = S.qs[S.order[S.pos]];
    var chosen = S.mine[q.id], res = S.res[q.id];
    var opts = q.options.map(function (t, i) {
      var L = q.letters[i], cls = '';
      if (chosen === L) cls = res ? (res.correct ? ' right' : ' wrong') : ' picked';
      return '<button class="bt-opt' + cls + '" data-l="' + L + '"' + (chosen ? ' disabled' : '') + '><span class="bt-ol">' + L + '</span><span class="bt-ot">' + B.fmt(t) + '</span></button>';
    }).join('');
    var dots = S.order.map(function (qi, p) {
      var id = S.qs[qi].id, r = S.res[id];
      var c = S.mine[id] ? (r ? (r.correct ? ' ok' : ' no') : ' done') : '';
      return '<button class="bt-dot' + c + (p === S.pos ? ' cur' : '') + '" data-p="' + p + '" aria-label="Question ' + (p + 1) + (S.mine[id] ? ', answered' : '') + '">' + (p + 1) + '</button>';
    }).join('');
    host.innerHTML = '<div class="bt-qno">Question ' + (S.pos + 1) + ' of ' + n + '<span class="bt-qprog">' + answeredCount() + ' answered</span></div>' +
      '<div class="bt-qcard"><div class="bt-stem">' + B.fmt(q.text) + '</div>' +
      (q.image ? '<img class="bt-img" alt="Question image" src="' + esc(q.image) + '">' : '') +
      '<div class="bt-opts">' + opts + '</div></div>' +
      '<div class="bt-nav"><button class="bt-ghost" id="btPrev"' + (S.pos === 0 ? ' disabled' : '') + '>Previous</button><button class="bt-ghost" id="btNext"' + (S.pos === n - 1 ? ' disabled' : '') + '>Next</button></div>' +
      '<div class="bt-pal">' + dots + '</div>';
    el('btPrev').onclick = function () { S.pos--; drawQuiz(); };
    el('btNext').onclick = function () { S.pos++; drawQuiz(); };
    host.querySelector('.bt-pal').onclick = function (e) { var d = e.target.closest('.bt-dot'); if (!d) return; S.pos = parseInt(d.getAttribute('data-p'), 10); drawQuiz(); };
    host.querySelector('.bt-opts').onclick = function (e) {
      var b = e.target.closest('.bt-opt'); if (!b || b.disabled || S.mine[q.id]) return;
      var L = b.getAttribute('data-l'), pos = S.pos;
      S.mine[q.id] = L;
      host.querySelectorAll('.bt-opt').forEach(function (x) { x.disabled = true; });
      b.classList.add('picked');
      rpc('battle_answer', { p_code: S.code, p_token: S.token, p_qid: q.id, p_choice: L }).then(function (r) {
        if (r.dup) return;
        S.res[q.id] = { correct: r.correct, points: r.points };
        var optEl = S.pos === pos ? host.querySelector('.bt-opt[data-l="' + L + '"]') : null;
        if (optEl) { optEl.classList.remove('picked'); optEl.classList.add(r.correct ? 'right' : 'wrong'); }
        if (r.correct) {
          var parts = '<b>+' + r.points + '</b>' + (r.speed ? '<small>⚡ speed +' + r.speed + '</small>' : '') + (r.streak_bonus ? '<small>🔥 streak +' + r.streak_bonus + '</small>' : '');
          floatAt(optEl || el('btScore'), parts, 'good');
          burst(optEl || el('btScore'), r.streak >= 3 ? 16 : 10, r.streak >= 3 ? ['★', '🔥', '✦'] : ['★', '✦', '✧']);
          try { if (navigator.vibrate) navigator.vibrate(18); } catch (x) { }
          if (r.streak === 3) banner('🔥 3 in a row! Streak bonus on', 'up');
          else if (r.streak > 3 && r.streak % 5 === 0) banner('🔥 ' + r.streak + ' in a row! Unstoppable', 'up');
        } else {
          floatAt(optEl || el('btScore'), '<b>' + (r.points < 0 ? r.points : '✗') + '</b>' + (S.streak >= 3 ? '<small>streak lost</small>' : ''), 'bad');
          try { if (navigator.vibrate) navigator.vibrate([30, 40, 30]); } catch (x) { }
          var qc = host.querySelector('.bt-qcard'); if (qc && S.pos === pos) { qc.classList.remove('shake'); void qc.offsetWidth; qc.classList.add('shake'); }
        }
        countUp(el('btScore'), S.score, r.score); S.score = r.score;
        setStreak(r.streak);
        var dot = host.querySelector('.bt-dot[data-p="' + pos + '"]'); if (dot) { dot.classList.remove('done'); dot.classList.add(r.correct ? 'ok' : 'no'); }
        if (answeredCount() >= n) { later(finishNow, 900); return; }
        if (S.pos === pos) later(function () { if (S.pos === pos) { S.pos = nextOpen(pos); drawQuiz(); } }, 750);
      }).catch(function (err) {
        var k = errKey(err);
        if (k === 'closed') { stopAll(); return loadResults(); }
        delete S.mine[q.id]; fail(err); if (S.pos === pos) drawQuiz();
      });
    };
  }
  function nextOpen(pos) {
    var n = S.order.length;
    for (var k = 1; k <= n; k++) { var p = (pos + k) % n; if (!S.mine[S.qs[S.order[p]].id]) return p; }
    return Math.min(pos + 1, n - 1);
  }
  function app_query(sel) { return B.app().querySelector(sel); }

  function finishNow() {
    stopAll();
    rpc('battle_finish', { p_code: S.code, p_token: S.token }).catch(function () { }).then(waitingScreen);
  }
  // Finished players watch the race until the clock runs out or everyone is done.
  function waitingScreen() {
    stopAll();
    mount('<main class="bt-main"><div class="bt-center"><div class="bt-badge">Submitted</div><h1 class="bt-h1">You scored <span id="btMyScore">' + (S.score || 0) + '</span></h1>' +
      '<p class="bt-sub" id="btW">Watching the others finish…</p><div class="bt-time big" id="btTime">0:00</div></div>' +
      '<section class="bt-card bt-lb open wide"><div class="bt-label">Live leaderboard <b id="btMyRank" style="float:right;text-transform:none"></b></div><ol class="bt-lb-list" id="btLB"></ol></section>' +
      '<p class="bt-note bt-center">Results open for everyone together when the last player submits or time runs out.</p></main><div class="bt-fx" id="btFx"></div>', 'bt-wait-scr');
    function poll() {
      rpc('battle_state', { p_code: S.code, p_token: S.token }).then(function (st) {
        syncClock(st.now); S.st = st;
        if (st.status === 'ended') { stopAll(); loadResults(); return; }
        var f = st.players.filter(function (p) { return p.finished; }).length;
        var w = el('btW'); if (w) w.textContent = f + ' of ' + st.players.length + ' finished. Still racing: ' + (st.players.length - f) + '.';
        var ms = el('btMyScore'); if (ms && st.me) ms.textContent = st.me.score;
        S.ends = Date.parse(st.ends_at);
        drawLB(st, el('btLB'));
      }).catch(function () { });
    }
    poll(); every(poll, 2000);
    every(function () { if (S.ends) { var t = el('btTime'); if (t) t.textContent = mmss((S.ends - srvNow()) / 1000); } }, 500);
  }

  // Confetti for the podium: a short canvas shower, skipped for reduced motion.
  function confetti(big) {
    if (reduced()) return;
    var c = document.createElement('canvas'); c.className = 'bt-confetti';
    var w = c.width = window.innerWidth, h = c.height = window.innerHeight;
    document.body.appendChild(c);
    var ctx = c.getContext('2d'), cols = ['#F5B301', '#A78BFA', '#34D399', '#F472B6', '#60A5FA', '#FB923C'];
    var parts = [];
    for (var i = 0; i < (big ? 220 : 120); i++) parts.push({ x: w / 2 + (Math.random() - .5) * w * .3, y: h * .35, vx: (Math.random() - .5) * 14, vy: -Math.random() * 14 - 4, s: 5 + Math.random() * 6, r: Math.random() * 6, vr: (Math.random() - .5) * .3, c: cols[i % cols.length] });
    var t0 = performance.now();
    (function frame(t) {
      ctx.clearRect(0, 0, w, h);
      parts.forEach(function (p) { p.vy += .32; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore(); });
      if (t - t0 < 3200) requestAnimationFrame(frame); else c.remove();
    })(t0);
  }

  // ---------- results ----------
  function loadResults() {
    stopAll();
    mount('<main class="bt-main bt-center"><div class="bt-spin"></div><p class="bt-sub">Counting the scores…</p></main>');
    rpc('battle_results', { p_code: S.code, p_token: S.token }).then(drawResults).catch(function (e) { var k = fail(e); if (k === 'not_ended') later(loadResults, 1500); });
  }
  function pct(a, b) { return b ? Math.round(a * 100 / b) : 0; }
  function drawResults(r) {
    S.res = r;
    var rk = r.ranking, me = rk.find(function (p) { return p.is_me; });
    var n = r.n;
    var podium = '';
    if (rk.length >= 2) {
      var order = [rk[1], rk[0], rk[2]].filter(Boolean);
      podium = '<div class="bt-podium">' + order.map(function (p) {
        return '<div class="bt-pod p' + p.rank + '"><div class="bt-pod-n">' + avatar(p.nickname) + '<b>' + esc(p.nickname) + '</b><span>' + p.score + ' pts · ' + pct(p.correct, n) + '%</span></div><div class="bt-pod-b">' + p.rank + '</div></div>';
      }).join('') + '</div>';
    }
    var avgAcc = rk.length ? Math.round(rk.reduce(function (s, p) { return s + p.correct / n; }, 0) * 100 / rk.length) : 0;
    var card = me ? '<section class="bt-card bt-me"><div class="bt-me-rank">' + ordinal(me.rank) + '<small> of ' + rk.length + '</small></div><div class="bt-stats">' +
      stat(me.score, 'points') + stat(pct(me.correct, n) + '%', 'accuracy · room ' + avgAcc + '%') + stat(r.avg_secs != null ? r.avg_secs + 's' : '–', 'avg per question') + stat(me.best_streak, 'best streak') + '</div></section>' : '';
    var table = '<section class="bt-card"><div class="bt-label">Ranking</div><table class="bt-tbl"><thead><tr><th>#</th><th>Name</th><th>Score</th><th>Correct</th><th>Time</th></tr></thead><tbody>' +
      rk.map(function (p) { return '<tr' + (p.is_me ? ' class="me"' : '') + '><td>' + p.rank + '</td><td>' + esc(p.nickname) + '</td><td>' + p.score + '</td><td>' + p.correct + '/' + n + '</td><td>' + mmss(p.time_used) + '</td></tr>'; }).join('') + '</tbody></table></section>';
    var qs = r.questions || [];
    var stats = qs.map(function (q, i) { return { i: i, q: q, p: pct(q.right, q.answered), a: q.answered }; }).filter(function (x) { return x.a > 0; });
    var hardest = stats.slice().sort(function (a, b) { return a.p - b.p; }).slice(0, 3);
    var easiest = stats.slice().sort(function (a, b) { return b.p - a.p; }).slice(0, 3);
    function insRow(x) { return '<li><b>Q' + (x.i + 1) + '</b> <span>' + x.p + '% got it right</span></li>'; }
    var insights = stats.length > 1 ? '<section class="bt-card"><div class="bt-label">Room insights</div><div class="bt-ins"><div><h3>Hardest</h3><ul>' + hardest.map(insRow).join('') + '</ul></div><div><h3>Easiest</h3><ul>' + easiest.map(insRow).join('') + '</ul></div></div></section>' : '';
    var review = qs.length ? '<section class="bt-card"><div class="bt-label">Review answers</div>' + qs.map(function (q, i) {
      var tot = q.answered || 1;
      var opts = q.options.map(function (t, k) {
        var L = q.letters[k], cls = L === q.answer ? ' ok' : (L === q.mine ? ' bad' : '');
        var cnt = (q.dist && q.dist[L]) || 0;
        return '<div class="bt-ro' + cls + '"><span class="bt-ol">' + L + '</span><span class="bt-ot">' + B.fmt(t) + (L === q.mine ? ' <em>your answer</em>' : '') + '</span><span class="bt-split">' + pct(cnt, tot) + '%</span></div>';
      }).join('');
      var verdict = !q.mine ? 'Not answered' : (q.mine === q.answer ? 'Correct' : 'Wrong');
      return '<details class="bt-rev ' + (q.mine === q.answer ? 'good' : 'miss') + '"><summary><b>Q' + (i + 1) + '</b> <span>' + verdict + '</span><small>' + pct(q.right, q.answered) + '% of the room</small></summary><div class="bt-rev-body"><div class="bt-stem">' + B.fmt(q.text) + '</div>' + (q.image ? '<img class="bt-img" alt="Question image" loading="lazy" src="' + esc(q.image) + '">' : '') + opts +
        (q.fastest ? '<p class="bt-fast">Fastest correct: ' + esc(q.fastest.nickname) + ' in ' + q.fastest.secs + 's</p>' : '') +
        '<div class="bt-exp">' + (q.explanation ? B.fmtExp(q.explanation) : '<em>No explanation for this item.</em>') + '</div></div></details>';
    }).join('') + '</section>' : '';
    var guest = !B.user() ? '<section class="bt-card bt-guest"><b>Save your result</b><p>Create a free MedLadder account to keep your battle history and practise the questions you missed.</p><button class="bt-cta" id="btSign">Sign up free</button></section>' : '';
    mount(topBar('Results', 'Home') + '<main class="bt-main"><div class="bt-center"><div class="bt-badge">Battle finished</div><h1 class="bt-h1">' + esc(r.title) + '</h1><p class="bt-sub">' + n + ' questions · ' + r.minutes + ' min · ' + r.players + ' players</p></div>' +
      podium + card + '<div class="bt-actions" id="btAct"></div>' + table + insights + review + guest + '</main>', 'bt-res');
    wireBack(home);
    var sgn = el('btSign'); if (sgn) sgn.onclick = function () { B.openAuth('signup'); };
    drawActions(r, me);
    if (!r.next_code) every(watchRematch, 3000);
    if (rk.length >= 2) later(function () { confetti(me && me.rank === 1); }, 450);
  }
  function stat(v, l) { return '<div class="bt-stat"><b>' + esc(String(v)) + '</b><span>' + esc(l) + '</span></div>'; }
  function drawActions(r, me) {
    var a = el('btAct'); if (!a) return;
    var h = '';
    if (r.next_code) h += '<button class="bt-cta" id="btJoinNext">Join the rematch</button>';
    else if (r.is_host) h += '<button class="bt-cta" id="btRematch">Rematch with new questions</button>';
    var txt = me ? 'I finished ' + ordinal(me.rank) + ' of ' + r.ranking.length + ' in a MedLadder battle on ' + String(r.title).replace(/ Showdown$/, '') + ' (' + pct(me.correct, r.n) + '%). Try it: https://medladder.top' : '';
    if (txt) h += '<button class="bt-ghost wide" id="btShareRes">Share my result</button>';
    h += '<button class="bt-ghost wide" id="btHome2">Back to home</button>';
    a.innerHTML = h;
    var rm = el('btRematch'); if (rm) rm.onclick = function () {
      rm.disabled = true;
      rpc('battle_rematch', { p_code: S.code, p_token: S.token }).then(function (d) { stopAll(); try { localStorage.setItem('mlbt_' + d.code, S.token); } catch (e) { S['tok_' + d.code] = S.token; } joinNext(d.code); }).catch(function (e) { fail(e); rm.disabled = false; });
    };
    var jn = el('btJoinNext'); if (jn) jn.onclick = function () { joinNext(r.next_code); };
    var sr = el('btShareRes'); if (sr) sr.onclick = function () {
      if (navigator.share) navigator.share({ text: txt }).catch(function () { });
      else window.open('https://wa.me/?text=' + encodeURIComponent(txt), '_blank', 'noopener');
    };
    el('btHome2').onclick = home;
  }
  function watchRematch() {
    rpc('battle_state', { p_code: S.code, p_token: S.token }).then(function (st) {
      if (st.next_code && S.res && !S.res.next_code) { S.res.next_code = st.next_code; drawActions(S.res, S.res.ranking.find(function (p) { return p.is_me; })); stopAll(); }
    }).catch(function () { });
  }
  function joinNext(code) {
    var nick = (S.res && S.res.ranking.find(function (p) { return p.is_me; }) || {}).nickname || savedNick();
    var tok = tokenFor(code);
    rpc('battle_join', { p_code: code, p_token: tok, p_nick: nick }).then(function () { openBattle(code); }).catch(function (e) { fail(e); openBattle(code); });
  }


  // ---------- hub: join with a code, or go pick a topic to host ----------
  function openHub() {
    stopAll();
    mount(topBar('Battle with friends', 'Back') + '<main class="bt-main"><h1 class="bt-h1">Quiz Battles</h1>' +
      '<p class="bt-sub">Race your friends on the same questions with one shared clock, then see who tops the podium.</p>' +
      '<section class="bt-card"><label class="bt-label" for="btCodeIn">Have a code?</label><div class="bt-row"><input class="bt-input" id="btCodeIn" maxlength="6" autocapitalize="characters" autocomplete="off" placeholder="e.g. GX7K2P" style="text-transform:uppercase;letter-spacing:.2em;font-weight:700"><button class="bt-ghost" id="btGo">Join</button></div></section>' +
      '<section class="bt-card"><div class="bt-label">Host a battle</div><p class="bt-sub" style="margin-bottom:8px">Open any topic and tap <b>Battle with friends</b>. Choose players, questions and minutes, then share the code.</p><button class="bt-cta" id="btPick" style="margin-top:0">Choose a topic</button></section></main>');
    wireBack(home);
    el('btGo').onclick = function () { var c = el('btCodeIn').value.trim(); if (c.length < 4) { B.toast('Enter the 6-letter code.', 'error'); return; } openBattle(c); };
    el('btCodeIn').addEventListener('keydown', function (e) { if (e.key === 'Enter') el('btGo').click(); });
    el('btPick').onclick = function () { stopAll(); B.goTopics(); };
  }

  window.MLBattle = { openCreate: openCreate, openBattle: openBattle, openHub: openHub, stop: stopAll };
  if (window.__mlBattleQueue) { var q = window.__mlBattleQueue; window.__mlBattleQueue = null; q(); }
})();
