/* MedLadder Quiz Battles: create, lobby, timed quiz, live spectating, podium and review.
   Loaded on demand by app.js, which hands over helpers through window.MLBridge.
   The server (Supabase RPCs battle_*) owns questions, time, correctness and score. */
(function () {
  'use strict';
  var B = window.MLBridge;
  if (!B) return;

  var ADJ = ['Swift', 'Calm', 'Brave', 'Sharp', 'Lucky', 'Bold', 'Keen', 'Quick', 'Steady', 'Witty', 'Bright', 'Cool', 'Mighty', 'Sleepy', 'Jolly', 'Clever'];
  var NOUN = ['Neutrophil', 'Purkinje', 'Osler', 'Nephron', 'Alveolus', 'Ventricle', 'Hepatocyte', 'Macrophage', 'Cortex', 'Synapse', 'Thalamus', 'Platelet', 'Axon', 'Villus', 'Fleming', 'Hippocampus'];
  var TILE = { A: 't-a', B: 't-b', C: 't-c', D: 't-d', E: 't-e' };
  var S = {};
  var timers = [];

  function el(id) { return document.getElementById(id); }
  function esc(s) { return B.esc(s); }
  function rpc(name, args) {
    return B.sb().rpc(name, args || {}).then(function (r) { if (r.error) throw r.error; return r.data; });
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

  function stopAll() { timers.forEach(function (t) { clearInterval(t); clearTimeout(t); }); timers = []; closeSheet(); }
  function every(fn, ms) { var t = setInterval(fn, ms); timers.push(t); return t; }
  function later(fn, ms) { var t = setTimeout(fn, ms); timers.push(t); return t; }

  function srvNow() { return Date.now() + (S.offset || 0); }
  function syncClock(serverNow) { if (serverNow) S.offset = Date.parse(serverNow) - Date.now(); }

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
  }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
  function tokenFor(code) {
    var k = 'mlbt_' + code, t = lsGet(k);
    if (t) return t;
    t = S['tok_' + code] || uuid(); S['tok_' + code] = t; lsSet(k, t); return t;
  }
  function setToken(code, t) { S['tok_' + code] = t; lsSet('mlbt_' + code, t); }
  function randNick() { return ADJ[Math.random() * ADJ.length | 0] + ' ' + NOUN[Math.random() * NOUN.length | 0]; }
  function savedNick() { return lsGet('mlbt_nick') || randNick(); }
  function rememberNick(n) { lsSet('mlbt_nick', n); }

  // Battles this device has played: feeds the "Return to battle" button and My battles.
  function history() { try { return JSON.parse(lsGet('mlbt_hist') || '[]') || []; } catch (e) { return []; } }
  function remember(st) {
    if (!st || !st.code) return;
    var h = history().filter(function (x) { return x.code !== st.code; });
    h.unshift({ code: st.code, title: st.title, status: st.status, ends_at: st.ends_at, ts: Date.now() });
    lsSet('mlbt_hist', JSON.stringify(h.slice(0, 15)));
    lsSet('mlbt_active', JSON.stringify({ code: st.code, title: st.title, status: st.status, ends_at: st.ends_at, ts: Date.now() }));
  }

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
  function pct(a, b) { return b ? Math.round(a * 100 / b) : 0; }
  function reduced() { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
  function ago(ts) { var m = Math.round((Date.now() - ts) / 60000); if (m < 1) return 'just now'; if (m < 60) return m + ' min ago'; var h = Math.round(m / 60); if (h < 24) return h + ' h ago'; return Math.round(h / 24) + ' d ago'; }

  // ---------- sound: synthesised, no files. Modes: all (music + effects), fx, off ----------
  var SND = (function () {
    var ctx = null, master, fxBus, musicBus, verbIn, delay, noiseBuf, musicTimer = null, nextT = 0, step = 0, soft = false;
    var mode = lsGet('mlbt_sound2') || 'all';
    function m2f(m) { return 440 * Math.pow(2, (m - 69) / 12); }
    function ac() {
      if (!ctx) {
        var C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
        try { ctx = new C(); } catch (e) { return null; }
        var comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3; comp.connect(ctx.destination);
        master = ctx.createGain(); master.gain.value = .85; master.connect(comp);
        // Room reverb from a generated impulse: gives every sound a soft, polished tail.
        var verb = ctx.createConvolver(), len = ctx.sampleRate * 2.4, ir = ctx.createBuffer(2, len, ctx.sampleRate);
        for (var ch = 0; ch < 2; ch++) { var d = ir.getChannelData(ch); for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
        verb.buffer = ir; verbIn = ctx.createGain(); verbIn.gain.value = .32; verbIn.connect(verb); verb.connect(master);
        fxBus = ctx.createGain(); fxBus.gain.value = 1; fxBus.connect(master); fxBus.connect(verbIn);
        musicBus = ctx.createGain(); musicBus.gain.value = .5; musicBus.connect(master);
        var mv = ctx.createGain(); mv.gain.value = .5; musicBus.connect(mv); mv.connect(verbIn);
        delay = ctx.createDelay(1); delay.delayTime.value = 60 / 96 * .75; var fb = ctx.createGain(); fb.gain.value = .28;
        var dl = ctx.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 2400;
        delay.connect(dl); dl.connect(fb); fb.connect(delay); dl.connect(musicBus);
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); var nd = noiseBuf.getChannelData(0); for (var k = 0; k < nd.length; k++) nd[k] = Math.random() * 2 - 1;
      }
      if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) { } }
      return ctx;
    }
    // One enveloped oscillator, optionally filtered.
    function osc(f, o) {
      var c = ac(); if (!c) return;
      o = o || {};
      var t = (o.at != null ? o.at : c.currentTime) + (o.when || 0), dur = o.dur || .3;
      var v = c.createOscillator(), g = c.createGain(), out = g;
      v.type = o.type || 'sine'; v.frequency.setValueAtTime(f, t);
      if (o.detune) v.detune.value = o.detune;
      if (o.glide) v.frequency.exponentialRampToValueAtTime(o.glide, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(o.vol || .2, t + (o.att || .006));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      v.connect(g);
      if (o.lp) { var fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(o.lp, t); if (o.lpTo) fl.frequency.exponentialRampToValueAtTime(o.lpTo, t + dur); fl.Q.value = o.q || .7; g.connect(fl); out = fl; }
      out.connect(o.bus || fxBus);
      if (o.send) out.connect(o.send);
      v.start(t); v.stop(t + dur + .05);
    }
    // A bell: inharmonic partials that fade at different speeds.
    function bell(f, when, vol, bus, at) {
      [[1, 1, 1.4], [2.756, .38, .7], [5.404, .16, .35], [2, .22, .9]].forEach(function (p) {
        osc(f * p[0], { when: when, dur: p[2], vol: (vol || .2) * p[1], att: .004, bus: bus, at: at });
      });
    }
    function noise(o) {
      var c = ac(); if (!c) return;
      var t = (o.at != null ? o.at : c.currentTime) + (o.when || 0), s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      s.buffer = noiseBuf; f.type = o.type || 'bandpass'; f.frequency.setValueAtTime(o.f || 1000, t); if (o.fTo) f.frequency.exponentialRampToValueAtTime(o.fTo, t + o.dur); f.Q.value = o.q || 1;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.vol || .1, t + (o.att || .005)); g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
      s.connect(f); f.connect(g); g.connect(o.bus || fxBus); s.start(t); s.stop(t + o.dur + .05);
    }
    var FX = {
      tap: function () { noise({ type: 'highpass', f: 2500, dur: .04, vol: .09 }); osc(1400, { dur: .05, vol: .05 }); },
      correct: function () { bell(m2f(84), 0, .2); bell(m2f(91), .09, .17); },
      wrong: function () { osc(196, { dur: .32, vol: .22, glide: 140, type: 'sine' }); osc(98, { dur: .4, vol: .16, type: 'triangle', lp: 600 }); noise({ type: 'lowpass', f: 400, dur: .12, vol: .06 }); },
      streak: function () { noise({ f: 300, fTo: 5000, dur: .45, vol: .1, q: 2, att: .2 }); [84, 88, 91, 96].forEach(function (m, i) { bell(m2f(m), .25 + i * .07, .13); }); },
      tick: function () { osc(1750, { dur: .045, vol: .09, type: 'sine' }); osc(880, { dur: .03, vol: .05, type: 'triangle' }); },
      count: function () { osc(m2f(72), { dur: .5, vol: .2, type: 'sine' }); osc(m2f(72) * 4, { dur: .12, vol: .05 }); },
      go: function () { noise({ f: 500, fTo: 6000, dur: .5, vol: .1, q: 1.5, att: .05 }); [72, 76, 79, 84].forEach(function (m) { bell(m2f(m), 0, .12); }); },
      join: function () { bell(m2f(88), 0, .1); },
      lead: function () { [79, 84, 88].forEach(function (m, i) { bell(m2f(m), i * .08, .15); }); },
      done: function () { [84, 91, 96].forEach(function (m, i) { bell(m2f(m), i * .1, .14); }); },
      fanfare: function () {
        [60, 64, 67, 72].forEach(function (m) { osc(m2f(m), { dur: 2.4, vol: .06, type: 'sawtooth', att: .3, lp: 900, lpTo: 2400 }); osc(m2f(m), { dur: 2.4, vol: .06, type: 'sawtooth', att: .3, detune: 9, lp: 900, lpTo: 2400 }); });
        [72, 76, 79, 84, 88].forEach(function (m, i) { bell(m2f(m), i * .11, .14); });
        bell(m2f(96), .65, .16);
      }
    };
    // Background: a calm ambient-electronic loop, 96 bpm. Am9, Fmaj7, Cmaj7, G6.
    var BARS = [{ b: 45, p: [60, 64, 67, 71] }, { b: 41, p: [57, 60, 64, 67] }, { b: 48, p: [55, 59, 64, 67] }, { b: 43, p: [59, 62, 64, 67] }];
    var ARP = [0, 1, 2, 3, 2, 1, 3, 2];
    var E8 = 60 / 96 / 2;
    function schedule() {
      var c = ac(); if (!c) return;
      while (nextT < c.currentTime + .25) {
        var bar = BARS[Math.floor(step / 8) % 4], s8 = step % 8, t = nextT;
        if (s8 === 0) bar.p.forEach(function (m) {
          osc(m2f(m), { at: t, dur: E8 * 8 + .4, vol: soft ? .035 : .045, type: 'sawtooth', att: .45, lp: 700, lpTo: 1300, bus: musicBus });
          osc(m2f(m), { at: t, dur: E8 * 8 + .4, vol: soft ? .035 : .045, type: 'sawtooth', att: .45, detune: 11, lp: 700, lpTo: 1300, bus: musicBus });
        });
        if (!soft && (s8 === 0 || s8 === 4)) { osc(m2f(bar.b), { at: t, dur: E8 * 3.5, vol: .16, type: 'triangle', lp: 420, bus: musicBus }); osc(110, { at: t, dur: .28, vol: .32, glide: 42, bus: musicBus }); }
        if (!soft && (s8 === 2 || s8 === 6)) noise({ at: t, type: 'highpass', f: 7000, dur: .05, vol: .03, bus: musicBus });
        var m = bar.p[ARP[s8]] + 12;
        osc(m2f(m), { at: t, dur: .32, vol: soft ? .05 : .07, type: 'triangle', lp: 3200, lpTo: 900, bus: musicBus, send: delay });
        nextT += E8; step++;
      }
    }
    function music(on, isSoft) {
      soft = !!isSoft;
      if (!on || mode !== 'all') { if (musicTimer) { clearInterval(musicTimer); musicTimer = null; } return; }
      var c = ac(); if (!c) return;
      if (!musicTimer) { step = 0; nextT = c.currentTime + .1; musicTimer = setInterval(schedule, 60); }
    }
    return {
      play: function (n) { if (mode === 'off') return; try { if (FX[n]) FX[n](); } catch (e) { } },
      music: music,
      unlock: function () { if (mode !== 'off') { ac(); if (S.wantMusic && !musicTimer) music(true, S.musicSoft); } },
      mode: function () { return mode; },
      set: function (m) {
        mode = m; lsSet('mlbt_sound2', mode);
        if (mode !== 'all') music(false); else if (S.wantMusic) music(true, S.musicSoft);
        if (mode !== 'off') FX.tap();
      },
      cycle: function () {
        mode = mode === 'all' ? 'fx' : mode === 'fx' ? 'off' : 'all';
        lsSet('mlbt_sound2', mode);
        if (mode !== 'all') music(false); else if (S.wantMusic) music(true, S.musicSoft);
        if (mode !== 'off') FX.tap();
        return mode;
      }
    };
  })();
  var THEME = lsGet('mlbt_theme') || 'night';
  function applyTheme() {
    var day = THEME === 'day';
    document.body.classList.toggle('bt-day', day);
    document.documentElement.classList.toggle('bt-day', day);
    var root = document.querySelector('#app > .bt'); if (root) root.classList.toggle('day', day);
  }
  function setBtn() {
    return '<button class="bt-set" data-theme-t="1" aria-label="Switch to ' + (THEME === 'day' ? 'night' : 'day') + ' look" title="Night / Day">' + (THEME === 'day' ? '☀️' : '🌙') + '</button>' + soundBtn();
  }
  function toggleTheme() {
    THEME = THEME === 'day' ? 'night' : 'day'; lsSet('mlbt_theme', THEME); applyTheme();
    document.querySelectorAll('[data-theme-t]').forEach(function (x) { x.textContent = THEME === 'day' ? '☀️' : '🌙'; x.setAttribute('aria-label', 'Switch to ' + (THEME === 'day' ? 'night' : 'day') + ' look'); });
    B.toast(THEME === 'day' ? 'Day look' : 'Night look');
  }
  function openSettings() {
    closeSheet();
    var m = SND.mode();
    var sh = document.createElement('div'); sh.className = 'bt-sheet' + (THEME === 'day' ? ' day' : ''); sh.id = 'btSheet';
    function opt(group, v, label, on) { return '<button class="bt-opt-p' + (on ? ' on' : '') + '" data-g="' + group + '" data-v="' + v + '">' + label + '</button>'; }
    sh.innerHTML = '<div class="bt-sheet-bg"></div><div class="bt-sheet-card"><div class="bt-sheet-h">Battle settings<button class="bt-sheet-x" aria-label="Close">✕</button></div>' +
      '<div class="bt-label">Look</div><div class="bt-opt-row">' + opt('theme', 'night', '🌙 Night', THEME === 'night') + opt('theme', 'day', '☀️ Day', THEME === 'day') + '</div>' +
      '<div class="bt-label" style="margin-top:16px">Sound</div><div class="bt-opt-row">' + opt('snd', 'all', '🎵 Music + effects', m === 'all') + opt('snd', 'fx', '🔊 Effects only', m === 'fx') + opt('snd', 'off', '🔇 Off', m === 'off') + '</div></div>';
    document.body.appendChild(sh);
    sh.querySelector('.bt-sheet-bg').onclick = closeSheet; sh.querySelector('.bt-sheet-x').onclick = closeSheet;
    sh.addEventListener('click', function (e) {
      var b = e.target.closest('.bt-opt-p'); if (!b) return;
      var g = b.getAttribute('data-g'), v = b.getAttribute('data-v');
      if (g === 'theme') { THEME = v; lsSet('mlbt_theme', v); applyTheme(); document.querySelectorAll('[data-set]').forEach(function (x) { x.textContent = v === 'day' ? '☀️' : '🌙'; }); sh.classList.toggle('day', v === 'day'); }
      else SND.set(v);
      sh.querySelectorAll('.bt-opt-p[data-g="' + g + '"]').forEach(function (x) { x.classList.toggle('on', x === b); });
    });
  }
  function soundIcon() { var m = SND.mode(); return m === 'all' ? '🎵' : m === 'fx' ? '🔊' : '🔇'; }
  function soundBtn() { return '<button class="bt-snd" data-snd="1" aria-label="Sound: ' + SND.mode() + '" title="Sound">' + soundIcon() + '</button>'; }
  document.addEventListener('pointerdown', function (e) {
    if (!e.target.closest || !e.target.closest('.bt, .bt-sheet')) return;
    SND.unlock();
    if (e.target.closest('[data-theme-t]')) { toggleTheme(); return; }
    var b = e.target.closest('[data-snd]');
    if (b) {
      var m = SND.cycle();
      document.querySelectorAll('[data-snd]').forEach(function (x) { x.textContent = soundIcon(); x.setAttribute('aria-label', 'Sound: ' + m); });
      B.toast(m === 'all' ? 'Music and sound effects on' : m === 'fx' ? 'Sound effects on, music off' : 'Sound off');
    }
  }, true);
  function wantMusic(on, soft) { S.wantMusic = on; S.musicSoft = soft; SND.music(on, soft); }

  // Google Analytics: each battle screen is a page view, key moments are events.
  function track(screen, title) { try { if (B.pageView) B.pageView('/battle/' + screen, 'Quiz Battle – ' + title); } catch (e) { } }
  function ev(name, params) { try { if (B.event) B.event(name, params); } catch (e) { } }

  // ---------- screen frame ----------
  function mount(html, cls) {
    var app = B.app();
    B.setScreen('battle');
    document.body.classList.add('ml-battle-on'); document.documentElement.classList.add('ml-battle-on');
    app.className = (app.className || '').replace(/\bscreen-[a-z]+\b/g, '').trim() + ' screen-battle';
    app.innerHTML = '<div class="bt ' + (cls || '') + (THEME === 'day' ? ' day' : '') + '">' + html + '</div><div class="bt-fx" id="btFx" aria-live="polite"></div>';
    applyTheme();
    try { window.scrollTo(0, 0); } catch (e) { }
  }
  // Drop the arena background as soon as another app screen replaces ours.
  setInterval(function () { if (document.body.classList.contains('ml-battle-on') && !document.querySelector('#app > .bt')) { document.body.classList.remove('ml-battle-on', 'bt-day'); document.documentElement.classList.remove('ml-battle-on', 'bt-day'); } }, 400);

  function topBar(title, backLabel) {
    return '<header class="bt-top"><button class="bt-back" id="btBack" aria-label="' + esc(backLabel || 'Back') + '">' +
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<div class="bt-top-title">' + esc(title || 'Quiz Battle') + '</div><span class="bt-logo">⚔️ Quiz Battles</span>' + setBtn() + '</header>';
  }
  function wireBack(fn) { var b = el('btBack'); if (b) b.onclick = function () { stopAll(); fn(); }; }
  function home() { stopAll(); wantMusic(false); B.home(); }
  function avatar(name, big) {
    var h = hash(name) % 360;
    return '<span class="bt-av' + (big ? ' big' : '') + '" style="background:linear-gradient(135deg,hsl(' + h + ',75%,58%),hsl(' + ((h + 40) % 360) + ',70%,42%))">' + esc(String(name).charAt(0).toUpperCase()) + '</span>';
  }

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
    var capP = pro ? 50 : 5, capQ = pro ? 100 : 20;
    var avail = Math.max(opts.maxQ || 0, 0);
    var c = { players: Math.min(10, capP), n: 20, minutes: 20, neg: false, title: (opts.title || 'Quiz') + ' Showdown', nick: B.userFirstName() || savedNick() };
    if (avail && c.n > avail) c.n = avail;
    function pills(id, vals, cur, cap, fmt) {
      return '<div class="bt-pills" id="' + id + '">' + vals.map(function (v) {
        var num = typeof v === 'number' ? v : (v === 'all' ? avail : 0);
        var lock = cap && num > cap;
        var label = v === 'all' ? 'All' + (avail ? ' (' + avail + ')' : '') : v === 'custom' ? 'Custom' : (fmt ? fmt(v) : v);
        return '<button class="bt-pill' + (v === cur ? ' on' : '') + (lock ? ' lock' : '') + '" data-v="' + v + '">' + label + (lock ? ' <span class="bt-pro">PRO</span>' : '') + '</button>';
      }).join('') + '</div>';
    }
    var qVals = [10, 20, 30, 50].filter(function (v) { return !avail || v < avail; });
    if (avail) qVals.push('all');
    qVals.push('custom');
    mount(topBar('New battle', 'Back') +
      '<main class="bt-main"><div class="bt-hero"><div class="bt-hero-ic">⚔️</div><h1 class="bt-h1">Battle with friends</h1>' +
      '<p class="bt-sub">' + esc(opts.title || 'Topic') + ' · same questions, one clock, live ranking</p></div>' +
      '<section class="bt-card"><div class="bt-label">Players</div>' + pills('btP', [2, 5, 10, 20, 30, 50], c.players, capP) + '</section>' +
      '<section class="bt-card"><div class="bt-label">Questions' + (avail ? ' <small>this topic has ' + avail + '</small>' : '') + '</div>' + pills('btQ', qVals, c.n, capQ) +
      '<div class="bt-custom" id="btQC" hidden><input class="bt-input" id="btQIn" type="number" inputmode="numeric" min="3" max="' + Math.min(capQ, avail || capQ) + '" placeholder="3 to ' + Math.min(capQ, avail || capQ) + '"><span>questions</span></div>' +
      '<p class="bt-hint" id="btQHint" hidden>' + (pro ? 'Up to ' + Math.min(capQ, avail || capQ) + ' questions' + (avail && avail < capQ ? ' (all this topic has)' : '') + '.' : 'Free hosts: up to ' + Math.min(20, avail || 20) + ' questions. <button class="bt-link" data-pro="1">Pro allows up to 100</button>') + '</p></section>' +
      '<section class="bt-card"><div class="bt-label">Time</div>' + pills('btT', [5, 10, 20, 30, 45, 'custom'], c.minutes, 0, function (v) { return v + ' min'; }) +
      '<div class="bt-custom" id="btTC" hidden><input class="bt-input" id="btTIn" type="number" inputmode="numeric" min="3" max="120" placeholder="3 to 120"><span>minutes</span></div></section>' +
      '<section class="bt-card"><label class="bt-switch"><input type="checkbox" id="btNeg"><span><b>Negative marking</b><small>A wrong answer costs 25 points</small></span></label></section>' +
      '<section class="bt-card"><label class="bt-label" for="btTitle">Room name</label><input class="bt-input" id="btTitle" maxlength="60" value="' + esc(c.title) + '">' +
      '<label class="bt-label" for="btNick" style="margin-top:14px">Your battle name</label><input class="bt-input" id="btNick" maxlength="20" value="' + esc(c.nick) + '"></section>' +
      (pro ? '' : '<p class="bt-note">Free hosts: up to 5 players, 20 questions, 3 battles a day. <button class="bt-link" id="btUp">Get Pro for 50 players</button></p>') +
      '<button class="bt-cta" id="btCreate">Create battle</button></main>');
    track('create', 'Create');
    wireBack(opts.back || home);
    function bind(id, key, customBox) {
      var host = el(id);
      host.addEventListener('click', function (e) {
        var b = e.target.closest('.bt-pill'); if (!b) return;
        if (b.classList.contains('lock')) { B.openPro('battle'); return; }
        var v = b.getAttribute('data-v');
        c[key] = v === 'custom' ? 'custom' : v === 'all' ? 'all' : parseInt(v, 10);
        host.querySelectorAll('.bt-pill').forEach(function (x) { x.classList.toggle('on', x === b); });
        if (customBox) { el(customBox).hidden = v !== 'custom'; if (v === 'custom') el(customBox).querySelector('input').focus(); }
      });
    }
    bind('btP', 'players'); bind('btQ', 'n', 'btQC'); bind('btT', 'minutes', 'btTC');
    // Custom boxes stop at the host's limit as they type, instead of failing on Create.
    function clampBox(input, max, onOver) {
      input.addEventListener('input', function () {
        var v = parseInt(input.value, 10);
        if (v > max) { input.value = max; input.classList.remove('over'); void input.offsetWidth; input.classList.add('over'); if (onOver) onOver(); }
      });
      input.addEventListener('blur', function () { var v = parseInt(input.value, 10); if (input.value !== '' && (!v || v < 3)) input.value = 3; });
    }
    var maxQ = Math.min(capQ, avail || capQ);
    clampBox(el('btQIn'), maxQ, function () { if (!pro && (!avail || avail > 20)) B.toast('Free hosts can set up to 20 questions. Pro allows up to 100.', 'error'); else B.toast('This topic has ' + maxQ + ' questions.', 'error'); });
    clampBox(el('btTIn'), 120);
    el('btQ').addEventListener('click', function () { el('btQHint').hidden = c.n !== 'custom'; });
    el('btQHint').addEventListener('click', function (e) { if (e.target.closest('[data-pro]')) B.openPro('battle'); });
    var up = el('btUp'); if (up) up.onclick = function () { B.openPro('battle'); };
    el('btCreate').onclick = function () {
      var btn = el('btCreate');
      var n = c.n === 'all' ? Math.min(avail, capQ) : c.n === 'custom' ? parseInt(el('btQIn').value, 10) : c.n;
      var mins = c.minutes === 'custom' ? parseInt(el('btTIn').value, 10) : c.minutes;
      var maxN = Math.min(capQ, avail || capQ);
      if (!n || n < 3 || n > maxN) { B.toast('Questions: pick 3 to ' + maxN + '.' + (!pro && n > 20 ? ' Pro allows up to 100.' : ''), 'error'); return; }
      if (!mins || mins < 3 || mins > 120) { B.toast('Time: pick 3 to 120 minutes.', 'error'); return; }
      var title = el('btTitle').value.trim() || 'Quiz Battle';
      var nick = el('btNick').value.trim() || randNick();
      rememberNick(nick);
      btn.disabled = true; btn.textContent = 'Creating…';
      var tok = uuid();
      rpc('battle_create', {
        p_token: tok, p_nick: nick,
        p_source: { module_ids: opts.moduleIds, title: opts.title || '' },
        p_settings: { max_players: c.players, n: n, minutes: mins, neg: el('btNeg').checked, title: title }
      }).then(function (r) { ev('battle_create', { players: c.players, questions: n, minutes: mins, pro: pro }); setToken(r.code, tok); openBattle(r.code); })
        .catch(function (e) { fail(e); btn.disabled = false; btn.textContent = 'Create battle'; });
    };
  }

  // ---------- entry: join link, code or resume ----------
  function openBattle(code) {
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    stopAll();
    S = { code: code, offset: S.offset };
    S.token = tokenFor(code);
    mount('<main class="bt-main bt-center bt-pad"><div class="bt-spin"></div><p class="bt-sub">Opening battle…</p></main>');
    rpc('battle_state', { p_code: code, p_token: S.token }).then(function (st) {
      S.st = st; syncClock(st.now);
      if (!st.me && B.user()) {
        // Signed in on another phone or browser: take back your own seat.
        return rpc('battle_reclaim', { p_code: code, p_token: S.token }).then(function (j) {
          if (j && j.rejoined) return openBattle(code);
          route(st);
        }).catch(function () { route(st); });
      }
      route(st);
    }).catch(function (e) {
      var k = fail(e);
      mount(topBar('Quiz Battle') + '<main class="bt-main bt-center bt-pad"><div class="bt-hero-ic">🤔</div><h1 class="bt-h1">' + esc(ERR[k] || ERR.network) + '</h1><button class="bt-cta" id="btHome">Go to MedLadder</button></main>');
      wireBack(home); el('btHome').onclick = home;
    });
  }

  function route(st) {
    if (st.me) remember(st);
    if (!st.me) return joinScreen(st);
    if (st.status === 'ended') return loadResults();
    if (st.status === 'live') return st.me.finished ? spectate() : beginLive();
    lobbyScreen(st);
  }

  function joinScreen(st) {
    var ended = st.status === 'ended';
    mount(topBar('Battle invite') + '<main class="bt-main bt-center bt-pad">' +
      '<div class="bt-hero-ic">⚔️</div><div class="bt-badge">You’re invited</div><h1 class="bt-h1">' + esc(st.title) + '</h1>' +
      '<p class="bt-sub">' + st.n + ' questions · ' + st.minutes + ' min · ' + st.players.length + ' of ' + st.max_players + ' joined' + (st.status === 'live' ? ' · <b class="bt-live-dot">LIVE</b>' : '') + '</p>' +
      '<div class="bt-avrow">' + st.players.slice(0, 8).map(function (p) { return avatar(p.nickname); }).join('') + '</div>' +
      (ended ? '<p class="bt-sub">This battle has finished.</p><button class="bt-cta" id="btHome">Go to MedLadder</button>' :
        '<section class="bt-card bt-join"><label class="bt-label" for="btNick">Your battle name</label>' +
        '<div class="bt-row"><input class="bt-input" id="btNick" maxlength="20" value="' + esc(savedNick()) + '"><button class="bt-dice" id="btDice" title="New name" aria-label="New random name">🎲</button></div>' +
        '<button class="bt-cta" id="btJoin">Join battle</button><p class="bt-note">No account needed.</p></section>') +
      '</main>');
    wireBack(home);
    track('join', 'Join');
    if (ended) { el('btHome').onclick = home; return; }
    el('btDice').onclick = function () { el('btNick').value = randNick(); };
    el('btJoin').onclick = function () {
      var btn = el('btJoin'); btn.disabled = true;
      var n = el('btNick').value.trim() || randNick(); rememberNick(n);
      rpc('battle_join', { p_code: S.code, p_token: S.token, p_nick: n }).then(function () { ev('battle_join', { signed_in: !!B.user() }); openBattle(S.code); })
        .catch(function (e) { fail(e); btn.disabled = false; });
    };
  }

  // ---------- lobby ----------
  function lobbyScreen(st) {
    var code = st.code, url = shareUrl(code);
    var msg = 'Join my MedLadder battle on ' + st.title.replace(/ Showdown$/, '') + ': ' + st.n + ' Qs, ' + st.minutes + ' min. ' + url;
    mount(topBar('Lobby', 'Leave') + '<main class="bt-main">' +
      '<div class="bt-center"><div class="bt-badge">Battle code</div><div class="bt-code" id="btCode">' + code.split('').map(function (ch) { return '<span>' + esc(ch) + '</span>'; }).join('') + '</div>' +
      '<h1 class="bt-h1 sm">' + esc(st.title) + '</h1><p class="bt-sub">' + st.n + ' questions · ' + st.minutes + ' min' + (st.neg ? ' · negative marking' : '') + '</p></div>' +
      '<div class="bt-share">' +
      '<button class="bt-chip" id="btCopy">🔗 Copy link</button>' +
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
    S.seen = {};
    track('lobby', 'Lobby');
    drawLobby(st);
    wantMusic(true, true);
    every(poll, 1500);
    function poll() {
      rpc('battle_state', { p_code: code, p_token: S.token }).then(function (s) {
        S.st = s; syncClock(s.now);
        if (!s.me) { stopAll(); mount(topBar('Quiz Battle') + '<main class="bt-main bt-center bt-pad"><h1 class="bt-h1">You were removed from this battle</h1><button class="bt-cta" id="btHome">Go to MedLadder</button></main>'); wireBack(home); el('btHome').onclick = home; return; }
        if (s.status === 'live') { stopAll(); remember(s); countdown(); return; }
        if (s.status === 'ended') { stopAll(); loadResults(); return; }
        drawLobby(s);
      }).catch(function () { });
    }
  }
  function drawLobby(st) {
    var list = el('btPlayers'); if (!list) return;
    var host = st.me && st.me.is_host;
    el('btCount').textContent = st.players.length + ' / ' + st.max_players + ' players ready';
    list.innerHTML = st.players.map(function (p) {
      var isNew = !S.seen[p.id]; S.seen[p.id] = 1;
      if (isNew && S.lobbyDrawn) SND.play('join');
      return '<li class="bt-pl' + (isNew ? ' new' : '') + '">' + avatar(p.nickname) + '<span class="bt-pn">' + esc(p.nickname) + badge(p) + (p.id === st.me.id ? ' <em>(you)</em>' : '') + '</span>' +
        (p.is_host ? '<span class="bt-tag">Host</span>' : (host ? '<button class="bt-x" data-id="' + p.id + '" aria-label="Remove ' + esc(p.nickname) + '">✕</button>' : '')) + '</li>';
    }).join('');
    S.lobbyDrawn = true;
    list.querySelectorAll('.bt-x').forEach(function (b) {
      b.onclick = function () { rpc('battle_kick', { p_code: st.code, p_token: S.token, p_player: b.getAttribute('data-id') }).catch(fail); };
    });
    var act = el('btAction');
    if (host) {
      var ok = st.players.length >= 2;
      if (!el('btStart') || el('btStart').disabled === ok) {
        act.innerHTML = '<button class="bt-cta big" id="btStart"' + (ok ? '' : ' disabled') + '>' + (ok ? '▶ Start battle' : 'Waiting for a friend to join…') + '</button>';
        var sb = el('btStart');
        if (sb) sb.onclick = function () {
          sb.disabled = true;
          rpc('battle_start', { p_code: st.code, p_token: S.token }).then(function () { ev('battle_start', { players: st.players.length, questions: st.n }); stopAll(); countdown(); }).catch(function (e) { fail(e); sb.disabled = false; });
        };
      }
    } else act.innerHTML = '<p class="bt-wait"><span class="bt-dots"><i></i><i></i><i></i></span> Waiting for the host to start</p>';
  }

  // ---------- countdown ----------
  function countdown() {
    rpc('battle_state', { p_code: S.code, p_token: S.token }).then(function (st) {
      S.st = st; syncClock(st.now);
      if (st.status === 'ended') return loadResults();
      var startsAt = Date.parse(st.starts_at);
      if (srvNow() > startsAt + 3000) return beginLive(); // joined mid-battle
      mount('<main class="bt-main bt-center bt-count"><div class="bt-badge">' + esc(st.title) + '</div><div class="bt-big" id="btBig">3</div><p class="bt-sub">Get ready. Everyone starts together.</p></main>');
      var last = null;
      var t = every(function () {
        var left = Math.ceil((startsAt - srvNow()) / 1000);
        var big = el('btBig'); if (!big) return;
        if (left > 0) { if (left !== last) { big.textContent = left; big.classList.remove('pop'); void big.offsetWidth; big.classList.add('pop'); last = left; if (left <= 3) SND.play('count'); } }
        else { clearInterval(t); SND.play('go'); big.textContent = 'GO!'; big.classList.remove('pop'); void big.offsetWidth; big.classList.add('pop', 'go'); later(beginLive, 450); }
      }, 100);
    }).catch(function (e) { fail(e); });
  }

  // ---------- the live battle ----------
  function beginLive() {
    stopAll();
    rpc('battle_questions', { p_code: S.code, p_token: S.token }).then(function (d) {
      syncClock(d.now);
      S.qs = d.questions; S.mine = d.mine || {}; S.res = d.revealed || {}; S.ends = Date.parse(d.ends_at); S.starts = Date.parse(d.starts_at);
      S.order = seededOrder(S.qs.length, S.token + S.code);
      S.pos = 0;
      for (var i = 0; i < S.order.length; i++) if (!S.mine[S.qs[S.order[i]].id]) { S.pos = i; break; }
      var me = (S.st && S.st.me) || {};
      S.score = me.score || 0; S.streak = me.streak || 0; S.rank = 0; S.of = 0;
      liveShell();
      track('play', 'Playing');
      drawQuiz();
      wantMusic(true, false);
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
    var R = 22, C = 2 * Math.PI * R;
    mount('<div class="bt-lv">' +
      '<header class="bt-hud">' +
      '<button class="bt-hud-x" id="btLeave" aria-label="Leave battle">✕</button>' +
      '<div class="bt-ring" title="Time left"><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="' + R + '" class="bg"/><circle cx="26" cy="26" r="' + R + '" class="fg" id="btRing" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="0"/></svg><b id="btTime">0:00</b></div>' +
      '<div class="bt-scorebox"><span class="bt-score" id="btScore">' + S.score + '</span><small>points</small><span class="bt-plus" id="btPlus"></span></div>' +
      '<div class="bt-combo' + (S.streak >= 2 ? ' on' : '') + '" id="btCombo"><span>🔥</span><b id="btStreak">' + S.streak + '</b></div>' +
      setBtn() +
      '<button class="bt-rank" id="btRank" aria-label="Live leaderboard"><small>RANK</small><b id="btRankN">–</b></button>' +
      '</header>' +
      '<div class="bt-segs" id="btSegs"></div>' +
      '<div class="bt-live-grid"><main class="bt-stage" id="btQ"></main>' +
      '<aside class="bt-side" id="btSide"><div class="bt-side-h"><span class="bt-live-dot">LIVE</span> Leaderboard</div><ol class="bt-lb" id="btLB"></ol></aside></div>' +
      '</div>', 'bt-live');
    S.ringC = C;
    el('btRank').onclick = openBoardSheet;
    el('btLeave').onclick = confirmLeave;
    el('btSegs').onclick = function (e) { var d = e.target.closest('[data-p]'); if (!d) return; S.pos = parseInt(d.getAttribute('data-p'), 10); drawQuiz(); };
    if (!window.__btFit) { window.__btFit = true; window.addEventListener('resize', function () { if (el('btQA')) fitQuiz(); }); }
  }
  function tick() {
    var left = (S.ends - srvNow()) / 1000;
    var t = el('btTime');
    if (t) t.textContent = mmss(left);
    var ring = el('btRing');
    if (ring && S.starts) {
      var tot = (S.ends - S.starts) / 1000, frac = Math.max(0, Math.min(1, left / tot));
      ring.style.strokeDashoffset = (S.ringC * (1 - frac)).toFixed(1);
      ring.classList.toggle('low', left <= 60);
    }
    if (left <= 10 && left > 0 && t) { t.parentNode.classList.add('panic'); var sec = Math.ceil(left); if (sec !== S.lastTick) { S.lastTick = sec; SND.play('tick'); } }
    if (left <= 0) { stopAll(); finishNow(); }
  }
  function livePoll() {
    rpc('battle_state', { p_code: S.code, p_token: S.token }).then(function (st) {
      syncClock(st.now); S.st = st;
      if (st.status === 'ended') { stopAll(); return loadResults(); }
      var rk = ranks(st);
      var mine = rk.find(function (p) { return st.me && p.id === st.me.id; });
      if (mine) setRank(mine.place, rk.length);
      drawBoard(st, el('btLB'));
      if (S.sheetOpen) drawBoard(st, el('btSheetLB'));
    }).catch(function () { });
  }
  // Equal scores share a place.
  function ranks(st) {
    var ps = st.players.slice().sort(function (a, b) { return b.score - a.score || (b.correct || 0) - (a.correct || 0); });
    ps.forEach(function (p) { p.place = 1 + ps.filter(function (x) { return x.score > p.score; }).length; });
    return ps;
  }
  function setRank(r, of) {
    var box = el('btRank'), n = el('btRankN'); if (!box || !n) return;
    n.innerHTML = r + '<small>/' + of + '</small>';
    if (S.rank && r !== S.rank) {
      box.classList.remove('up', 'down'); void box.offsetWidth; box.classList.add(r < S.rank ? 'up' : 'down');
      if (r === 1 && S.rank > 1) { callout('Top of the room!', 'gold'); SND.play('lead'); }
    }
    S.rank = r; S.of = of;
  }
  function drawBoard(st, list) {
    if (!list) return;
    var n = st.n || (S.qs ? S.qs.length : 0);
    var before = {};
    list.querySelectorAll('li[data-id]').forEach(function (li) { before[li.getAttribute('data-id')] = li.getBoundingClientRect().top; });
    list.innerHTML = ranks(st).map(function (p) {
      var mine = st.me && p.id === st.me.id;
      var medal = p.score > 0 && p.place <= 3 ? ['🥇', '🥈', '🥉'][p.place - 1] : p.place;
      return '<li data-id="' + p.id + '" class="' + (mine ? 'me' : '') + (p.finished ? ' fin' : '') + '"><span class="bt-lb-r">' + medal + '</span>' + avatar(p.nickname) +
        '<span class="bt-lb-n"><b>' + esc(p.nickname) + badge(p) + (mine ? ' (you)' : '') + '</b><span class="bt-lb-p"><i style="width:' + (n ? Math.round(p.answered * 100 / n) : 0) + '%"></i></span><small>' + p.answered + '/' + n + (p.finished ? ' · done' : '') + '</small></span>' +
        (p.streak >= 3 ? '<span class="bt-lb-s">🔥' + p.streak + '</span>' : '') +
        '<span class="bt-lb-pts">' + p.score + '</span></li>';
    }).join('');
    if (reduced()) return;
    list.querySelectorAll('li[data-id]').forEach(function (li) {
      var id = li.getAttribute('data-id'); if (before[id] === undefined) return;
      var dy = before[id] - li.getBoundingClientRect().top;
      if (Math.abs(dy) > 2) { li.style.transform = 'translateY(' + dy + 'px)'; li.style.transition = 'none'; requestAnimationFrame(function () { li.style.transition = 'transform .6s cubic-bezier(.2,.8,.2,1)'; li.style.transform = ''; }); }
    });
  }

  function badge(p) { return p.member ? '<span class="bt-ver" title="MedLadder member">✓</span>' : '<span class="bt-gst">Guest</span>'; }

  // Leaderboard as a sheet over the quiz on phones, so the question never moves.
  function openBoardSheet() {
    closeSheet();
    var sh = document.createElement('div'); sh.className = 'bt-sheet' + (THEME === 'day' ? ' day' : ''); sh.id = 'btSheet';
    sh.innerHTML = '<div class="bt-sheet-bg"></div><div class="bt-sheet-card"><div class="bt-sheet-h"><span class="bt-live-dot">LIVE</span> Leaderboard<button class="bt-sheet-x" aria-label="Close">✕</button></div><ol class="bt-lb" id="btSheetLB"></ol></div>';
    document.body.appendChild(sh);
    S.sheetOpen = true;
    sh.querySelector('.bt-sheet-bg').onclick = closeSheet; sh.querySelector('.bt-sheet-x').onclick = closeSheet;
    if (S.st) drawBoard(S.st, el('btSheetLB'));
  }
  function closeSheet() { var sh = el('btSheet'); if (sh) sh.remove(); S.sheetOpen = false; }
  function confirmLeave() {
    closeSheet();
    var sh = document.createElement('div'); sh.className = 'bt-sheet' + (THEME === 'day' ? ' day' : ''); sh.id = 'btSheet';
    sh.innerHTML = '<div class="bt-sheet-bg"></div><div class="bt-sheet-card bt-center"><div class="bt-hero-ic">🚪</div><h2 class="bt-h2">Leave the battle?</h2>' +
      '<p class="bt-sub">Your answers are saved and the clock keeps running. Come back any time before it ends with the <b>Return to battle</b> button, the link, or code <b>' + esc(S.code) + '</b>.</p>' +
      '<button class="bt-cta" id="btStay">Keep playing</button><button class="bt-ghost wide" id="btGo">Leave for now</button></div>';
    document.body.appendChild(sh);
    sh.querySelector('.bt-sheet-bg').onclick = closeSheet;
    el('btStay').onclick = closeSheet;
    el('btGo').onclick = function () { closeSheet(); home(); };
  }

  function drawQuiz() {
    var host = el('btQ'); if (!host) return;
    var n = S.qs.length, q = S.qs[S.order[S.pos]];
    var chosen = S.mine[q.id], res = S.res[q.id];
    var five = q.letters.length > 4;
    var opts = q.options.map(function (t, i) {
      var L = q.letters[i], cls = '';
      if (chosen) cls = chosen === L ? (res ? (res.correct ? ' right' : ' wrong') : ' picked') : (res && res.answer === L ? ' answer' : ' dim');
      return '<button class="bt-tile' + cls + '" data-l="' + L + '"' + (chosen ? ' disabled' : '') + '><span class="bt-tl">' + L + '</span><span class="bt-tt"><span class="bt-ti">' + B.fmt(t) + '</span></span><span class="bt-mark"></span></button>';
    }).join('');
    var left = n - answeredCount();
    // Pictures inside the question text move into one large picture area under it.
    var tmp = document.createElement('div'); tmp.innerHTML = B.fmt(q.text);
    var pics = []; if (q.image) pics.push(q.image);
    tmp.querySelectorAll('img').forEach(function (im) { var src = im.getAttribute('src'); if (src) pics.push(src); im.remove(); });
    var stem = tmp.innerHTML.replace(/(\s*<br\s*\/?>\s*)+$/i, '');
    S.hasPic = pics.length > 0;
    host.innerHTML =
      '<section class="bt-qa' + (pics.length ? ' has-pic' : '') + '" id="btQA">' +
        '<div class="bt-qno"><span>Question ' + (S.pos + 1) + ' / ' + n + '</span>' + (chosen ? '<span class="bt-lock">🔒 Locked in</span>' : '') + '</div>' +
        '<div class="bt-qt" id="btQT">' + stem + '</div>' +
        (pics.length ? '<div class="bt-qimg' + (pics.length > 1 ? ' multi' : '') + '">' + pics.slice(0, 3).map(function (src) { return '<img alt="Question image, tap to zoom" src="' + esc(src) + '">'; }).join('') + '<span>Tap to enlarge</span></div>' : '') +
      '</section>' +
      '<section class="bt-tray' + (five ? ' five' : '') + '">' +
        '<div class="bt-tiles">' + opts + '</div>' +
        '<div class="bt-nav"><button class="bt-btn" id="btPrev" aria-label="Previous question"' + (S.pos === 0 ? ' disabled' : '') + '>‹</button>' +
        '<button class="bt-btn submit" id="btFin">' + (left ? 'Submit · ' + left + ' left' : 'Submit') + '</button>' +
        '<button class="bt-btn" id="btNext" aria-label="Next question"' + (S.pos === n - 1 ? ' disabled' : '') + '>›</button></div>' +
      '</section>';
    drawSegs();
    el('btPrev').onclick = function () { S.pos--; drawQuiz(); };
    el('btNext').onclick = function () { S.pos++; drawQuiz(); };
    el('btFin').onclick = confirmSubmit;
    host.querySelector('.bt-tiles').onclick = function (e) {
      var b = e.target.closest('.bt-tile'); if (!b || b.disabled || S.mine[q.id]) return;
      SND.play('tap');
      answer(q, b.getAttribute('data-l'), S.pos);
    };
    fitQuiz();
    host.querySelectorAll('.bt-qa img').forEach(function (img) { if (!img.complete) img.onload = fitQuiz; });
  }
  // One segment per question: green right, red wrong, violet answered, ring = current.
  function drawSegs() {
    var box = el('btSegs'); if (!box || !S.qs) return;
    var n = S.order.length;
    box.style.gridTemplateColumns = 'repeat(' + n + ', minmax(0, 1fr))';
    box.classList.toggle('many', n > 40);
    box.innerHTML = S.order.map(function (qi, p) {
      var id = S.qs[qi].id, r = S.res[id];
      var c = S.mine[id] ? (r ? (r.correct ? 'ok' : 'no') : 'done') : '';
      return '<button class="' + c + (p === S.pos ? ' cur' : '') + '" data-p="' + p + '" aria-label="Question ' + (p + 1) + '"></button>';
    }).join('');
  }
  // Long questions and answers shrink to fit their fixed space instead of pushing the layout.
  function fitQuiz() {
    var qa = el('btQA'), qt = el('btQT');
    if (qa && qt) {
      var size = window.innerWidth >= 960 ? (S.hasPic ? 20 : 22) : (S.hasPic ? 17.5 : 20);
      qt.style.fontSize = size + 'px';
      while (qa.scrollHeight > qa.clientHeight + 1 && size > 12.5) { size -= 0.5; qt.style.fontSize = size + 'px'; }
      qa.classList.toggle('scroll', qa.scrollHeight > qa.clientHeight + 1);
    }
    B.app().querySelectorAll('.bt-tile .bt-tt').forEach(function (box) {
      var t = box.firstChild, f = 15.5; t.style.fontSize = f + 'px';
      var room = box.clientHeight - 14;
      while (t.scrollHeight > room + 1 && f > 11) { f -= 0.5; t.style.fontSize = f + 'px'; }
    });
  }
  function confirmSubmit() {
    var left = S.qs.length - answeredCount();
    if (!left) return finishNow();
    closeSheet();
    var sh = document.createElement('div'); sh.className = 'bt-sheet' + (THEME === 'day' ? ' day' : ''); sh.id = 'btSheet';
    sh.innerHTML = '<div class="bt-sheet-bg"></div><div class="bt-sheet-card bt-center"><div class="bt-hero-ic">🏁</div><h2 class="bt-h2">Submit now?</h2>' +
      '<p class="bt-sub">' + left + ' question' + (left > 1 ? 's are' : ' is') + ' unanswered and will score 0. You can then watch the others live.</p>' +
      '<button class="bt-cta" id="btStay">Keep answering</button><button class="bt-ghost wide" id="btGo">Submit and watch</button></div>';
    document.body.appendChild(sh);
    sh.querySelector('.bt-sheet-bg').onclick = closeSheet;
    el('btStay').onclick = closeSheet;
    el('btGo').onclick = function () { closeSheet(); finishNow(); };
  }

  function answer(q, L, pos) {
    var host = el('btQ'), n = S.qs.length;
    S.mine[q.id] = L;
    host.querySelectorAll('.bt-tile').forEach(function (x) { x.disabled = true; x.classList.add(x.getAttribute('data-l') === L ? 'picked' : 'dim'); });
    var prevStreak = S.streak;
    rpc('battle_answer', { p_code: S.code, p_token: S.token, p_qid: q.id, p_choice: L }).then(function (r) {
      if (r.dup) return;
      S.res[q.id] = { correct: r.correct, points: r.points, answer: r.answer };
      var t = S.pos === pos ? host.querySelector('.bt-tile[data-l="' + L + '"]') : null;
      if (t) { t.classList.remove('picked'); t.classList.add(r.correct ? 'right' : 'wrong'); }
      // Missed it: light up the right answer so the player learns it on the spot.
      if (!r.correct && r.answer && S.pos === pos) { var ok = host.querySelector('.bt-tile[data-l="' + r.answer + '"]'); if (ok) { ok.classList.remove('dim'); ok.classList.add('answer'); } }
      if (r.correct) {
        callout(word(r), r.streak >= 3 ? 'fire' : 'good', (r.speed ? '⚡ +' + r.speed + ' speed' : '') + (r.streak_bonus ? '  🔥 +' + r.streak_bonus + ' streak' : ''));
        sparkle(el('btScore'), r.streak >= 3 ? 14 : 8);
        SND.play(r.streak === 3 || (r.streak > 3 && r.streak % 2 === 1) ? 'streak' : 'correct');
        buzz(15);
      } else {
        callout(prevStreak >= 3 ? 'Streak broken' : 'Missed', 'bad', r.points < 0 ? r.points + ' points' : '');
        SND.play('wrong');
        buzz([25, 40, 25]);
      }
      plus(r.points);
      countUp(el('btScore'), S.score, r.score); S.score = r.score;
      setStreak(r.streak);
      drawSegs();
      if (answeredCount() >= n) { later(function () { callout('All done!', 'gold', 'Watching the others now'); SND.play('done'); }, 700); later(finishNow, 1600); return; }
      if (S.pos === pos) later(function () { if (S.pos === pos) { S.pos = nextOpen(pos); drawQuiz(); fadeIn(); } }, r.correct ? 900 : 1700);
      else drawQuiz();
    }).catch(function (err) {
      var k = errKey(err);
      if (k === 'closed') { stopAll(); return loadResults(); }
      delete S.mine[q.id]; fail(err); if (S.pos === pos) drawQuiz();
    });
  }
  function word(r) {
    var s = r.streak;
    if (s >= 10) return 'GODLIKE!';
    if (s >= 7) return 'Legendary!';
    if (s === 6) return 'On fire!';
    if (s === 5) return 'Unstoppable!';
    if (s === 4) return 'Excellent!';
    if (s === 3) return 'On a roll!';
    if (r.speed >= 45) return 'Lightning fast!';
    if (s === 2) return 'Great!';
    return 'Correct!';
  }
  function nextOpen(pos) {
    var n = S.order.length;
    for (var k = 1; k <= n; k++) { var p = (pos + k) % n; if (!S.mine[S.qs[S.order[p]].id]) return p; }
    return Math.min(pos + 1, n - 1);
  }
  function fadeIn() { var q = el('btQ'); if (!q || reduced()) return; q.classList.remove('fade'); void q.offsetWidth; q.classList.add('fade'); }

  // ---------- effects ----------
  function fx() { return el('btFx'); }
  function callout(text, kind, sub) {
    var f = fx(); if (!f) return;
    f.querySelectorAll('.bt-call').forEach(function (x) { x.remove(); });
    var c = document.createElement('div'); c.className = 'bt-call ' + (kind || '');
    c.innerHTML = '<b>' + esc(text) + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '');
    f.appendChild(c); setTimeout(function () { c.remove(); }, 1250);
  }
  function plus(p) {
    var e = el('btPlus'); if (!e) return;
    e.textContent = p > 0 ? '+' + p : p < 0 ? String(p) : '+0';
    e.className = 'bt-plus ' + (p > 0 ? 'good' : 'bad'); void e.offsetWidth; e.classList.add('go');
  }
  function sparkle(node, n) {
    var f = fx(); if (!f || !node || reduced()) return;
    var r = node.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    for (var i = 0; i < n; i++) {
      var s = document.createElement('span'); s.className = 'bt-star'; s.textContent = ['★', '✦', '✧', '★'][i % 4];
      var a = Math.random() * Math.PI * 2, d = 30 + Math.random() * 50;
      s.style.left = cx + 'px'; s.style.top = cy + 'px';
      s.style.setProperty('--dx', Math.cos(a) * d + 'px'); s.style.setProperty('--dy', Math.sin(a) * d + 'px');
      s.style.color = ['#FFD54A', '#C4B5FD', '#6EE7B7', '#F9A8D4'][i % 4];
      f.appendChild(s); (function (x) { setTimeout(function () { x.remove(); }, 800); })(s);
    }
  }
  function buzz(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { } }
  function countUp(node, from, to) {
    if (!node) return;
    var t0 = performance.now(), dur = 550;
    (function step(t) { var k = Math.min(1, (t - t0) / dur); node.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); })(t0);
  }
  function setStreak(n) {
    S.streak = n;
    var f = el('btCombo'), b = el('btStreak'); if (!f || !b) return;
    b.textContent = n; f.classList.toggle('on', n >= 2); f.classList.toggle('hot', n >= 5);
    if (n >= 2) { f.classList.remove('bump'); void f.offsetWidth; f.classList.add('bump'); }
  }
  function confetti(big) {
    if (reduced()) return;
    var c = document.createElement('canvas'); c.className = 'bt-confetti';
    var w = c.width = window.innerWidth, h = c.height = window.innerHeight;
    document.body.appendChild(c);
    var ctx = c.getContext('2d'), cols = ['#FFD54A', '#A78BFA', '#34D399', '#F472B6', '#60A5FA', '#FB923C'];
    var parts = [];
    for (var i = 0; i < (big ? 240 : 130); i++) parts.push({ x: w / 2 + (Math.random() - .5) * w * .4, y: h * .3, vx: (Math.random() - .5) * 15, vy: -Math.random() * 15 - 4, s: 6 + Math.random() * 6, r: Math.random() * 6, vr: (Math.random() - .5) * .3, c: cols[i % cols.length] });
    var t0 = performance.now();
    (function frame(t) {
      ctx.clearRect(0, 0, w, h);
      parts.forEach(function (p) { p.vy += .32; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore(); });
      if (t - t0 < 3400) requestAnimationFrame(frame); else c.remove();
    })(t0);
  }

  // ---------- finished early: live spectator view ----------
  function finishNow() {
    stopAll();
    ev('battle_finish', { answered: S.mine ? Object.keys(S.mine).length : 0, total: S.qs ? S.qs.length : 0, score: S.score || 0 });
    rpc('battle_finish', { p_code: S.code, p_token: S.token }).catch(function () { }).then(spectate);
  }
  function spectate() {
    stopAll();
    S.prev = null; S.feed = [];
    track('watch', 'Watching');
    wantMusic(true, true);
    mount(topBar('Live arena', 'Leave') + '<main class="bt-main">' +
      '<div class="bt-spec-hero"><div><div class="bt-badge">✓ You submitted</div><div class="bt-spec-place" id="btPlace">–</div><div class="bt-sub" id="btPlaceSub">Your place so far</div></div>' +
      '<div class="bt-spec-time"><small>Ends in</small><b id="btTime">0:00</b><small id="btLeft"></small></div></div>' +
      '<div class="bt-livepod" id="btPod"></div>' +
      '<div class="bt-spec-grid"><section class="bt-card"><div class="bt-label"><span class="bt-live-dot">LIVE</span> Leaderboard</div><ol class="bt-lb" id="btLB"></ol></section>' +
      '<section class="bt-card"><div class="bt-label">What’s happening</div><ul class="bt-feed" id="btFeed"><li class="muted">Watching for moves…</li></ul></section></div>' +
      '<p class="bt-note bt-center">Results open for everyone when the last player submits or the clock runs out. You can leave and come back any time with <b>Return to battle</b> or code <b>' + esc(S.code) + '</b>.</p>' +
      '<section class="bt-card" id="btMyRev"><div class="bt-label">Review your answers</div><p class="bt-sub" style="margin:0">Loading…</p></section>' +
      '<button class="bt-ghost wide" id="btOut">Leave and come back later</button></main>', 'bt-specscr');
    wireBack(home);
    el('btOut').onclick = home;
    function poll() {
      rpc('battle_state', { p_code: S.code, p_token: S.token }).then(function (st) {
        syncClock(st.now); S.st = st; remember(st);
        if (st.status === 'ended') { stopAll(); loadResults(); return; }
        S.ends = Date.parse(st.ends_at);
        var rk = ranks(st), mine = rk.find(function (p) { return st.me && p.id === st.me.id; });
        if (mine) {
          var pl = el('btPlace');
          if (pl) { if (S.myPlace && mine.place !== S.myPlace) { pl.classList.remove('up', 'down'); void pl.offsetWidth; pl.classList.add(mine.place < S.myPlace ? 'up' : 'down'); } pl.innerHTML = ordinal(mine.place) + '<small> of ' + rk.length + '</small>'; }
          var ps = el('btPlaceSub'); if (ps) ps.textContent = mine.score + ' points · place can still change';
          S.myPlace = mine.place;
        }
        var still = st.players.filter(function (p) { return !p.finished; }).length;
        var lf = el('btLeft'); if (lf) lf.textContent = still + ' still playing';
        drawPod(rk);
        drawBoard(st, el('btLB'));
        feed(st, rk);
      }).catch(function () { });
    }
    poll(); every(poll, 1500);
    rpc('battle_my_review', { p_code: S.code, p_token: S.token }).then(drawMyReview).catch(function () { var b = el('btMyRev'); if (b) b.remove(); });
    every(function () { var t = el('btTime'); if (t && S.ends) t.textContent = mmss((S.ends - srvNow()) / 1000); }, 500);
  }
  // While waiting: your own answers with the right ones, explanations for Pro (or free topics).
  function drawMyReview(d) {
    var box = el('btMyRev'); if (!box || !d) return;
    var qs = d.questions || [];
    var right = qs.filter(function (q) { return q.mine && q.mine === q.answer; }).length;
    box.innerHTML = '<div class="bt-label">Review your answers <small>' + right + ' of ' + qs.length + ' right</small></div>' + qs.map(function (q, i) {
      var opts = q.options.map(function (t, k) {
        var L = q.letters[k], cls = L === q.answer ? ' ok' : (L === q.mine ? ' bad' : '');
        return '<div class="bt-ro' + cls + '"><span class="bt-ol">' + L + '</span><span class="bt-ot">' + B.fmt(t) + (L === q.mine ? ' <em>your answer</em>' : '') + '</span></div>';
      }).join('');
      var verdict = !q.mine ? 'Not answered' : (q.mine === q.answer ? 'Correct' : 'Wrong');
      return '<div class="bt-rev open ' + (q.mine === q.answer ? 'good' : 'miss') + '"><div class="bt-rev-h"><b>Q' + (i + 1) + '</b> <span>' + verdict + '</span></div><div class="bt-rev-body"><div class="bt-stem">' + B.fmt(q.text) + '</div>' +
        (q.image ? '<img class="bt-img" alt="Question image" loading="lazy" src="' + esc(q.image) + '">' : '') + opts +
        expBlock(q, d.explanations_locked) + '</div></div>';
    }).join('');
    box.querySelectorAll('[data-pro]').forEach(function (b) { b.onclick = function () { if (B.user()) B.openPro('battle'); else signUpThen(function () { B.openPro('battle'); }); }; });
  }
  // Explanations stay folded until the player asks for one.
  function expBlock(q, locked) {
    var body = locked
      ? '<div class="bt-exp bt-exp-lock"><b>🔒 Explanation is in Pro</b><span>Battle explanations are a Pro feature. Pro also unlocks all 740 topics and PYQs.</span><button class="bt-cta inline" data-pro="1">Get Pro</button></div>'
      : '<div class="bt-exp">' + (q.explanation ? B.fmtExp(q.explanation) : '<em>No explanation for this item.</em>') + '</div>';
    return '<button class="bt-expbtn" data-exp="1">💡 Show explanation</button><div class="bt-expbox" hidden>' + body + '</div>';
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-exp]'); if (!b) return;
    var box = b.nextElementSibling; if (!box) return;
    box.hidden = !box.hidden;
    b.textContent = box.hidden ? '💡 Show explanation' : 'Hide explanation';
  });
  function drawPod(rk) {
    var box = el('btPod'); if (!box) return;
    var top = rk.slice(0, 3);
    if (top.length < 2) { box.innerHTML = ''; return; }
    var order = [top[1], top[0], top[2]].filter(Boolean);
    box.innerHTML = order.map(function (p) {
      var i = rk.indexOf(p);
      return '<div class="bt-lp p' + (i + 1) + '">' + (i === 0 ? '<span class="bt-crown">👑</span>' : '') + avatar(p.nickname, true) + '<b>' + esc(p.nickname) + '</b><span>' + p.score + '</span></div>';
    }).join('');
  }
  // A running commentary built from what changed since the last look.
  function feed(st, rk) {
    var prev = S.prev; S.prev = {};
    st.players.forEach(function (p) { S.prev[p.id] = { answered: p.answered, correct: p.correct || 0, score: p.score, streak: p.streak, finished: p.finished }; });
    S.prev._leader = rk[0] && rk[0].score > 0 ? rk[0].id : null;
    if (!prev) return;
    var items = [];
    st.players.forEach(function (p) {
      var o = prev[p.id]; var who = esc(p.nickname) + (st.me && p.id === st.me.id ? ' (you)' : '');
      if (!o) { items.push('👋 <b>' + who + '</b> joined'); return; }
      var gained = p.score - o.score, rightNow = (p.correct || 0) - o.correct, did = p.answered - o.answered;
      if (did > 0) {
        if (rightNow > 0 && gained > 0) items.push('✅ <b>' + who + '</b> +' + gained + (did > 1 ? ' (' + rightNow + '/' + did + ' right)' : ''));
        else items.push('❌ <b>' + who + '</b> missed ' + (did > 1 ? did : 'one'));
      }
      if (p.streak >= 3 && p.streak > (o.streak || 0)) items.push('🔥 <b>' + who + '</b> is on a ' + p.streak + '-streak');
      if (p.finished && !o.finished) items.push('🏁 <b>' + who + '</b> finished with ' + p.score);
    });
    if (S.prev._leader && prev._leader && S.prev._leader !== prev._leader) {
      var L = st.players.find(function (p) { return p.id === S.prev._leader; });
      if (L) items.unshift('👑 <b>' + esc(L.nickname) + '</b> takes the lead!');
    }
    if (!items.length) return;
    S.feed = items.map(function (h) { return { h: h, t: Date.now() }; }).concat(S.feed || []).slice(0, 14);
    var ul = el('btFeed'); if (!ul) return;
    ul.innerHTML = S.feed.map(function (x, i) { return '<li class="' + (i < items.length ? 'new' : '') + '">' + x.h + '</li>'; }).join('');
  }

  // ---------- results ----------
  function loadResults() {
    stopAll();
    wantMusic(false);
    mount('<main class="bt-main bt-center bt-pad"><div class="bt-spin"></div><p class="bt-sub">Counting the scores…</p></main>');
    rpc('battle_results', { p_code: S.code, p_token: S.token }).then(drawResults).catch(function (e) { var k = fail(e); if (k === 'not_ended') later(loadResults, 1500); });
  }
  function drawResults(r) {
    S.result = r;
    track('results', 'Results');
    if (S.st) { S.st.status = 'ended'; remember(S.st); }
    var rk = r.ranking, me = rk.find(function (p) { return p.is_me; });
    var n = r.n;
    var podium = '';
    if (rk.length >= 2) {
      var order = [rk[1], rk[0], rk[2]].filter(Boolean);
      podium = '<div class="bt-podium">' + order.map(function (p) {
        return '<div class="bt-pod p' + p.rank + '"><div class="bt-pod-n">' + (p.rank === 1 ? '<span class="bt-crown">👑</span>' : '') + avatar(p.nickname, true) + '<b>' + esc(p.nickname) + '</b><span>' + p.score + ' pts · ' + pct(p.correct, n) + '%</span></div><div class="bt-pod-b">' + p.rank + '</div></div>';
      }).join('') + '</div>';
    }
    var avgAcc = rk.length ? Math.round(rk.reduce(function (s, p) { return s + p.correct / n; }, 0) * 100 / rk.length) : 0;
    var title = !me ? '' : me.rank === 1 ? 'Victory!' : me.rank <= 3 ? 'On the podium!' : 'Good fight!';
    var card = me ? '<section class="bt-card bt-me"><div class="bt-me-top"><div class="bt-me-rank">' + ordinal(me.rank) + '<small> of ' + rk.length + '</small></div><div class="bt-me-title">' + title + '</div></div><div class="bt-stats">' +
      stat(me.score, 'points') + stat(pct(me.correct, n) + '%', 'accuracy · room ' + avgAcc + '%') + stat(r.avg_secs != null ? r.avg_secs + 's' : '–', 'per question') + stat('🔥' + me.best_streak, 'best streak') + '</div></section>' : '';
    var table = '<section class="bt-card"><div class="bt-label">Final ranking</div><table class="bt-tbl"><thead><tr><th>#</th><th>Name</th><th>Score</th><th>Right</th><th>Time</th></tr></thead><tbody>' +
      rk.map(function (p) { return '<tr' + (p.is_me ? ' class="me"' : '') + '><td>' + p.rank + '</td><td>' + esc(p.nickname) + '</td><td>' + p.score + '</td><td>' + p.correct + '/' + n + '</td><td>' + mmss(p.time_used) + '</td></tr>'; }).join('') + '</tbody></table></section>';
    var qs = r.questions || [];
    var stats = qs.map(function (q, i) { return { i: i, p: pct(q.right, q.answered), a: q.answered }; }).filter(function (x) { return x.a > 0; });
    var hardest = stats.slice().sort(function (a, b) { return a.p - b.p; }).slice(0, 3);
    var easiest = stats.slice().sort(function (a, b) { return b.p - a.p; }).slice(0, 3);
    function insRow(x) { return '<li><b>Q' + (x.i + 1) + '</b> <span>' + x.p + '% got it right</span></li>'; }
    var insights = stats.length > 1 ? '<section class="bt-card"><div class="bt-label">Room insights</div><div class="bt-ins"><div><h3>😰 Hardest</h3><ul>' + hardest.map(insRow).join('') + '</ul></div><div><h3>😎 Easiest</h3><ul>' + easiest.map(insRow).join('') + '</ul></div></div></section>' : '';
    var review = qs.length ? '<section class="bt-card"><div class="bt-label">Review answers</div>' + qs.map(function (q, i) {
      var tot = q.answered || 1;
      var opts = q.options.map(function (t, k) {
        var L = q.letters[k], cls = L === q.answer ? ' ok' : (L === q.mine ? ' bad' : '');
        var cnt = (q.dist && q.dist[L]) || 0;
        return '<div class="bt-ro' + cls + '"><span class="bt-ol">' + L + '</span><span class="bt-ot">' + B.fmt(t) + (L === q.mine ? ' <em>your answer</em>' : '') + '</span><span class="bt-split">' + pct(cnt, tot) + '%</span></div>';
      }).join('');
      var verdict = !q.mine ? 'Not answered' : (q.mine === q.answer ? 'Correct' : 'Wrong');
      return '<div class="bt-rev open ' + (q.mine === q.answer ? 'good' : 'miss') + '"><div class="bt-rev-h"><b>Q' + (i + 1) + '</b> <span>' + verdict + '</span><small>' + pct(q.right, q.answered) + '% of the room</small></div><div class="bt-rev-body"><div class="bt-stem">' + B.fmt(q.text) + '</div>' + (q.image ? '<img class="bt-img" alt="Question image" loading="lazy" src="' + esc(q.image) + '">' : '') + opts +
        (q.fastest ? '<p class="bt-fast">⚡ Fastest correct: ' + esc(q.fastest.nickname) + ' in ' + q.fastest.secs + 's</p>' : '') +
        expBlock(q, r.explanations_locked) + '</div></div>';
    }).join('') + '</section>' : '';
    var missed = qs.filter(function (q) { return q.mine !== q.answer; }).map(function (q) { return q.id; });
    S.missed = missed;
    var guest = !B.user() && me ? '<section class="bt-card bt-save"><div class="bt-save-ic">💾</div><div><b>Save this ' + (me.rank === 1 ? 'win' : 'result') + (me.best_streak >= 3 ? ' and your 🔥' + me.best_streak + ' streak' : '') + '</b><p>Guest results stay on this phone only. Sign up free to keep your battles, appear on the weekly board and practise what you missed.</p><button class="bt-cta" id="btSign">Sign up free · 10 seconds</button></div></section>' : '';
    var grow = '<section class="bt-card bt-grow">' +
      (missed.length ? '<button class="bt-growbtn" id="btMissed"><span>🎯</span><b>Practise the ' + missed.length + ' you missed</b><small>' + (B.user() ? 'With full explanations, right now' : 'Free account needed') + '</small></button>' : '') +
      (!r.is_host ? '<button class="bt-growbtn" id="btHostOwn"><span>⚔️</span><b>Host your own battle</b><small>Same topic, your rules, your friends</small></button>' : '') +
      '</section>';
    var week = '<section class="bt-card" id="btWeek"><div class="bt-label">🏆 This week’s top battlers</div><p class="bt-sub" style="margin:0">Loading…</p></section>';
    mount(topBar('Results', 'Home') + '<main class="bt-main"><div class="bt-center"><div class="bt-badge">🏆 Battle over</div><h1 class="bt-h1">' + esc(r.title) + '</h1><p class="bt-sub">' + n + ' questions · ' + r.minutes + ' min · ' + r.players + ' players</p></div>' +
      podium + card + guest + '<div class="bt-actions" id="btAct"></div>' + grow + table + week + insights + review + '</main>', 'bt-res');
    wireBack(home);
    var sgn = el('btSign'); if (sgn) sgn.onclick = function () { ev('battle_signup_click', { from: 'save_result' }); signUpThen(function () { loadResults(); B.toast('Result saved to your account'); }); };
    var mb = el('btMissed'); if (mb) mb.onclick = function () {
      ev('battle_practise_missed', { count: S.missed.length, signed_in: !!B.user() });
      var go = function () { stopAll(); B.practise(S.missed, 'Missed in ' + String(r.title).replace(/ Showdown$/, ''), function () { openBattle(S.code); }); };
      if (B.user()) go(); else signUpThen(go);
    };
    var ho = el('btHostOwn'); if (ho) ho.onclick = function () {
      ev('battle_host_own_click', {});
      stopAll();
      openCreate({ moduleIds: r.module_ids || [], title: String(r.title).replace(/ Showdown$/, ''), back: function () { openBattle(S.code); } });
    };
    B.app().querySelectorAll('[data-pro]').forEach(function (b) { b.onclick = function () { if (B.user()) B.openPro('battle'); else signUpThen(function () { B.openPro('battle'); }); }; });
    drawActions(r, me);
    if (me) ev('battle_result', { rank: me.rank, players: rk.length, score: me.score, accuracy: pct(me.correct, n), signed_in: !!B.user() });
    if (!r.next_code) every(watchRematch, 3000);
    if (rk.length >= 2) later(function () { confetti(me && me.rank === 1); }, 500);
    later(function () { SND.play(me && me.rank <= 3 ? 'fanfare' : 'done'); }, 450);
    rpc('battle_weekly', { p_score: me ? me.score : null }).then(function (w) { drawWeekly(w, me, el('btWeek')); }).catch(function () { });
  }
  function stat(v, l) { return '<div class="bt-stat"><b>' + esc(String(v)) + '</b><span>' + esc(l) + '</span></div>'; }
  function drawActions(r, me) {
    var a = el('btAct'); if (!a) return;
    var h = '';
    if (r.next_code) h += '<button class="bt-cta big" id="btJoinNext">⚔️ Join the rematch</button>';
    else if (r.is_host) h += '<button class="bt-cta big" id="btRematch">⚔️ Rematch with new questions</button>';
    var txt = me ? 'I finished ' + ordinal(me.rank) + ' of ' + r.ranking.length + ' in a MedLadder battle on ' + String(r.title).replace(/ Showdown$/, '') + ' (' + pct(me.correct, r.n) + '%). Try it: https://medladder.top' : '';
    if (txt) h += '<button class="bt-ghost wide" id="btShareRes">Share my result</button>';
    h += '<button class="bt-ghost wide" id="btHome2">Back to home</button>';
    a.innerHTML = h;
    var rm = el('btRematch'); if (rm) rm.onclick = function () {
      rm.disabled = true;
      rpc('battle_rematch', { p_code: S.code, p_token: S.token }).then(function (d) { stopAll(); setToken(d.code, S.token); joinNext(d.code); }).catch(function (e) { fail(e); rm.disabled = false; });
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
      if (st.next_code && S.result && !S.result.next_code) { S.result.next_code = st.next_code; drawActions(S.result, S.result.ranking.find(function (p) { return p.is_me; })); stopAll(); }
    }).catch(function () { });
  }
  function joinNext(code) {
    var nick = (S.result && S.result.ranking.find(function (p) { return p.is_me; }) || {}).nickname || savedNick();
    var tok = tokenFor(code);
    rpc('battle_join', { p_code: code, p_token: tok, p_nick: nick }).then(function () { openBattle(code); }).catch(function (e) { fail(e); openBattle(code); });
  }

  function allTokens() {
    var t = [];
    try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (/^mlbt_[A-Z0-9]{6}$/.test(k)) t.push(localStorage.getItem(k)); } } catch (e) { }
    return t.slice(-50);
  }
  // Open sign-up; once in, attach this device's guest battles to the account, then continue.
  function signUpThen(next) {
    B.openAuth('signup', { onSuccess: function () {
      var done = function () { if (next) next(); };
      var tries = 0;
      (function wait() { if (B.user() || tries++ > 30) rpc('battle_claim', { p_tokens: allTokens() }).then(done, done); else setTimeout(wait, 200); })();
    } });
  }
  function drawWeekly(w, me, box) {
    if (!box || !w) return;
    var rows = (w.top || []).slice(0, 5).map(function (x) {
      return '<li class="' + (x.is_me ? 'me' : '') + '"><span class="bt-lb-r">' + (x.rank <= 3 ? ['🥇', '🥈', '🥉'][x.rank - 1] : x.rank) + '</span>' + avatar(x.nickname) + '<span class="bt-lb-n"><b>' + esc(x.nickname) + '</b><small>' + x.battles + ' battle' + (x.battles > 1 ? 's' : '') + '</small></span><span class="bt-lb-pts">' + x.total + '</span></li>';
    }).join('');
    var foot = '';
    if (!B.user() && me && w.would_rank) foot = '<div class="bt-week-cta"><b>Your ' + me.score + ' points would put you #' + w.would_rank + ' this week.</b><span>Only members appear on the board.</span><button class="bt-cta inline" id="btWeekSign">Sign up to appear</button></div>';
    else if (w.me) foot = '<p class="bt-note">You’re <b>#' + w.me.rank + '</b> this week with ' + w.me.total + ' points from ' + w.me.battles + ' battle' + (w.me.battles > 1 ? 's' : '') + '.</p>';
    box.innerHTML = '<div class="bt-label">🏆 This week’s top battlers</div>' + (rows ? '<ol class="bt-lb">' + rows + '</ol>' : '<p class="bt-sub" style="margin:0">No finished battles this week yet. Be the first on the board.</p>') + foot;
    var ws = el('btWeekSign'); if (ws) ws.onclick = function () { signUpThen(function () { loadResults(); B.toast('Result saved. You’re on the weekly board.'); }); };
  }

  // ---------- hub: join with a code, your battles, or host ----------
  function openHub() {
    stopAll();
    mount(topBar('Quiz Battles', 'Back') + '<main class="bt-main"><div class="bt-hero"><div class="bt-hero-ic">⚔️</div><h1 class="bt-h1">Quiz Battles</h1>' +
      '<p class="bt-sub">Race your friends on the same questions with one shared clock. Climb the live leaderboard and take the podium.</p></div>' +
      '<section class="bt-card"><label class="bt-label" for="btCodeIn">Join with a code</label><div class="bt-row"><input class="bt-input bt-codein" id="btCodeIn" maxlength="6" autocapitalize="characters" autocomplete="off" placeholder="GX7K2P"><button class="bt-cta inline" id="btGo">Join</button></div></section>' +
      '<section class="bt-card"><div class="bt-label">Host a battle</div><p class="bt-sub" style="margin-bottom:10px">Open any topic and tap <b>Battle with friends</b>. Pick players, questions and time, then share the code.</p><button class="bt-cta" id="btPick" style="margin-top:0">Choose a topic</button></section>' +
      '<section class="bt-card"><div class="bt-label">Your battles</div><ul class="bt-mine" id="btMine"><li class="muted">Loading…</li></ul></section>' +
      '<section class="bt-card" id="btWeek"><div class="bt-label">🏆 This week’s top battlers</div><p class="bt-sub" style="margin:0">Loading…</p></section></main>');
    rpc('battle_weekly', { p_score: null }).then(function (w) { drawWeekly(w, null, el('btWeek')); }).catch(function () { });
    wireBack(home);
    track('hub', 'Quiz Battles');
    el('btGo').onclick = function () { var c = el('btCodeIn').value.trim(); if (c.length < 4) { B.toast('Enter the 6-letter code.', 'error'); return; } openBattle(c); };
    el('btCodeIn').addEventListener('keydown', function (e) { if (e.key === 'Enter') el('btGo').click(); });
    el('btPick').onclick = function () { stopAll(); B.goTopics(); };
    var local = history();
    var draw = function (server) {
      var byCode = {};
      local.forEach(function (x) { byCode[x.code] = { code: x.code, title: x.title, status: x.status, ends_at: x.ends_at, ts: x.ts }; });
      (server || []).forEach(function (x) { var o = byCode[x.code] || {}; byCode[x.code] = { code: x.code, title: x.title, status: x.status, ends_at: x.ends_at, ts: Date.parse(x.created_at) || o.ts, rank: x.rank, players: x.players }; });
      var list = Object.keys(byCode).map(function (k) { return byCode[k]; }).sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
      var ul = el('btMine'); if (!ul) return;
      if (!list.length) { ul.innerHTML = '<li class="muted">No battles yet. Host one or join with a code.</li>'; return; }
      ul.innerHTML = list.slice(0, 12).map(function (x) {
        var live = x.status !== 'ended' && (!x.ends_at || Date.parse(x.ends_at) > Date.now());
        var tag = live ? '<span class="bt-live-dot">' + (x.status === 'lobby' ? 'LOBBY' : 'LIVE') + '</span>' : (x.rank ? '<span class="bt-rk">' + ordinal(x.rank) + (x.players ? ' of ' + x.players : '') + '</span>' : '<span class="bt-rk">Ended</span>');
        return '<li><button data-code="' + esc(x.code) + '"><span class="bt-mine-t"><b>' + esc(x.title || x.code) + '</b><small>' + esc(x.code) + (x.ts ? ' · ' + ago(x.ts) : '') + '</small></span>' + tag + '<span class="bt-go">' + (live ? 'Return' : 'Results') + ' ›</span></button></li>';
      }).join('');
      ul.querySelectorAll('button[data-code]').forEach(function (b) { b.onclick = function () { openBattle(b.getAttribute('data-code')); }; });
    };
    draw(null);
    if (B.user()) rpc('battle_my_battles').then(draw).catch(function () { });
  }

  // Tap a question or explanation image to see it full screen. A tap on an image inside
  // an answer tile only zooms; it does not pick that answer.
  document.addEventListener('click', function (e) {
    var img = e.target.closest && e.target.closest('.bt img');
    if (!img || !img.src) return;
    e.preventDefault(); e.stopPropagation();
    var z = document.createElement('div'); z.className = 'bt-zoom';
    z.innerHTML = '<img alt="Enlarged image"><button aria-label="Close">\u2715</button>';
    z.querySelector('img').src = img.currentSrc || img.src;
    z.onclick = function () { z.remove(); };
    document.body.appendChild(z);
  }, true);

  window.MLBattle = { openCreate: openCreate, openBattle: openBattle, openHub: openHub, stop: stopAll };
  if (window.__mlBattleQueue) { var q = window.__mlBattleQueue; window.__mlBattleQueue = null; q(); }
})();
