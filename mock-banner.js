/* MedLadder small site enhancements (standalone, so app.js stays untouched).
 * 1. Home-page mock-test banner. Turns RED with a pulsing LIVE badge while a
 *    test is live (via the public mock_banner_state RPC); purple otherwise.
 * 2. "Mock Test Admin" shortcut button inside the Admin Control Center modal.
 * Both re-inject after SPA re-renders via MutationObserver. */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://groeibwykzrliphzzruk.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_tXvgKaWrUfWlpy8SB3c1mQ_ZMrHxzVY';
  var BANNER_ID = 'mockTestBanner';
  var ADMIN_LINK_ID = 'mockAdminLink';
  var STYLE_ID = 'mockBannerStyle';
  var isHome = window.location.pathname === '/' || window.location.pathname === '/index.html' || window.location.pathname === '';
  var lastMode = '';
  var lastState = null;

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent =
      '@keyframes mockPulse { 0%,100% { opacity:1; transform:scale(1); }' +
      ' 50% { opacity:.45; transform:scale(.8); } }' +
      '.mock-live-dot { display:inline-block; width:10px; height:10px; border-radius:50%;' +
      ' background:#22c55e; animation:mockPulse 1.4s ease-in-out infinite;box-shadow:0 0 12px #22c55e; }';
    document.head.appendChild(st);
  }

  function fmtDate(iso) {
    try {
      return new Date(iso).toLocaleString(undefined,
        { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
    } catch (_) { return ''; }
  }

  function bannerHtml(mode, state) {
    if (mode === 'live') {
      var t = state.live;
      return '<span class="mock-live-dot"></span>' +
        '<span style="flex:1;min-width:0;"><strong style="display:block;font-size:17px;">' +
        '<span style="color:#22c55e;">LIVE NOW</span> &middot; ' + escapeHtml(t.title) + '</strong>' +
        '<span style="opacity:.75;font-size:13px;">Ends ' + fmtDate(t.ends_at) +
        ' &middot; join before time runs out</span></span>' +
        '<span style="font-weight:800;font-size:14px;color:#22c55e;">Join &rsaquo;</span>';
    }
    var sub;
    if (mode === 'next' && state.next) {
      sub = 'Next: ' + escapeHtml(state.next.title) + ' &middot; ' + fmtDate(state.next.starts_at);
    } else {
      sub = 'Free All-India mocks &middot; real-time leaderboard';
    }
    return '<span style="font-size:28px;line-height:1;">&#127942;</span>' +
      '<span style="flex:1;min-width:0;"><strong style="display:block;font-size:17px;">Live Mock Tests</strong>' +
      '<span style="opacity:.72;font-size:13px;">' + sub + '</span></span>' +
      '<span style="font-size:22px;opacity:.7;">&rsaquo;</span>';
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function renderBanner(state) {
    if (!isHome) return;
    ensureStyle();
    var mode = state && state.live ? 'live' : (state && state.next ? 'next' : 'idle');
    var anchor = document.querySelector('.pyq-section-wrap, #pyqBankToggle');
    if (!anchor || !anchor.parentNode) return;
    var section = (anchor.closest && anchor.closest('.pyq-section-wrap')) || anchor;
    var el = document.getElementById(BANNER_ID);
    if (!el) {
      el = document.createElement('a');
      el.id = BANNER_ID;
      el.href = '/mock-test.html';
      el.onclick = function (e) {
        e.preventDefault();
        window.location.href = '/mock-test.html';
      };
      section.parentNode.insertBefore(el, section);
    }
    if (mode !== lastMode || !el.innerHTML) {
      lastMode = mode;
      var live = mode === 'live';
      el.setAttribute('style',
        'display:flex;align-items:center;gap:14px;margin:18px 0;padding:18px 20px;' +
        'border-radius:14px;text-decoration:none;color:inherit;cursor:pointer;' +
        (live
          ? 'background:linear-gradient(135deg,rgba(34,197,94,.22),rgba(34,197,94,.06));border:1px solid #22c55e;box-shadow:0 0 24px rgba(34,197,94,.25);'
          : 'background:linear-gradient(135deg,rgba(123,47,247,.20),rgba(123,47,247,.05));border:1px solid #7b2ff7;'));
      el.innerHTML = bannerHtml(mode, state);
    }
  }

  function refreshState() {
    if (!isHome) return;
    fetch(SUPABASE_URL + '/rest/v1/rpc/mock_banner_state', {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + SUPABASE_ANON_KEY
      }
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (state) { lastState = state; renderBanner(state); })
      .catch(function () { renderBanner(lastState); });
  }

  function injectAdminLink() {
    if (document.getElementById(ADMIN_LINK_ID)) return;
    var body = document.getElementById('adminModalBody');
    if (!body) return;
    var a = document.createElement('a');
    a.id = ADMIN_LINK_ID;
    a.href = '/admin-mock.html';
    a.setAttribute('style', 'display:flex;align-items:center;gap:10px;margin:0 0 14px;padding:12px 16px;border-radius:10px;background:rgba(123,47,247,.12);border:1px solid #7b2ff7;text-decoration:none;color:inherit;font-weight:700;font-size:14px;');
    a.innerHTML =
      '<span style="font-size:18px;">&#127942;</span>' +
      '<span style="flex:1;">Mock Test Admin</span>' +
      '<span style="opacity:.7;">&rsaquo;</span>';
    body.insertBefore(a, body.firstChild);
  }

  function init() {
    renderBanner(null);
    refreshState();
    setInterval(refreshState, 60000);
    injectAdminLink();
    var target = document.body || document.documentElement;
    if (window.MutationObserver) {
      new MutationObserver(function () {
        renderBanner(lastState);
        injectAdminLink();
      }).observe(target, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
