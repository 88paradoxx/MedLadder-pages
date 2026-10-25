/* MedLadder NEET SS Books pill (standalone, so app.js stays untouched).
 * Injects a single "NEET SS Books" pill directly beneath the mock-test banner
 * (#mockTestBanner) on the home page. Tapping it opens /neet-ss-books.html,
 * which lists every book with download links.
 * Re-injects after SPA re-renders via MutationObserver, same as mock-banner.js. */
(function () {
  'use strict';

  var PILL_ID = 'neetSsBooksPill';
  var BOOKS_URL = '/neet-ss-books.html';

  var isHome = window.location.pathname === '/' ||
               window.location.pathname === '/index.html' ||
               window.location.pathname === '';

  function render() {
    if (!isHome) return;
    var banner = document.getElementById('mockTestBanner');
    if (!banner || !banner.parentNode) return; // banner not injected yet; observer will retry
    var el = document.getElementById(PILL_ID);
    if (!el) {
      el = document.createElement('a');
      el.id = PILL_ID;
      el.href = BOOKS_URL;
      banner.parentNode.insertBefore(el, banner.nextSibling);
    }
    if (!el.innerHTML) {
      el.setAttribute('style',
        'display:flex;align-items:center;gap:14px;margin:0 0 18px;padding:18px 20px;' +
        'border-radius:14px;text-decoration:none;color:inherit;cursor:pointer;' +
        'background:linear-gradient(135deg,rgba(123,47,247,.20),rgba(123,47,247,.05));' +
        'border:1px solid #7b2ff7;');
      el.innerHTML =
        '<span style="font-size:28px;line-height:1;">\uD83D\uDCDA</span>' +
        '<span style="flex:1;min-width:0;"><strong style="display:block;font-size:17px;">NEET SS Books</strong>' +
        '<span style="opacity:.72;font-size:13px;">Free super-speciality review books</span></span>' +
        '<span style="font-size:22px;opacity:.7;">&rsaquo;</span>';
    }
  }

  function init() {
    render();
    if (window.MutationObserver) {
      new MutationObserver(function () { render(); })
        .observe(document.body || document.documentElement, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
