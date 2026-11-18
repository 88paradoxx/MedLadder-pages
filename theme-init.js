// Apply the saved theme before stylesheets paint, without an inline script.
(function () {
  // The mock-test lobby now lives inside the app (Mock tab). A bare /mock-test
  // visit goes there at once; /mock-test?id=… (taking a test, leaderboard,
  // review) still opens this page. ?m=<id> is a shared-mock link.
  try {
    if (/^\/mock-test(\/|\.html)?$/.test(location.pathname)) {
      var q = location.search || '';
      if (!/[?&](id|attempt)=/.test(q)) {
        var m = /[?&]m=([^&#]+)/.exec(q);
        location.replace('/?go=mock' + (m ? '&mock=' + m[1] : ''));
        return;
      }
    }
  } catch (_) {}

  try {
    // Light by default; dark only for someone who chose it.
    if (localStorage.getItem('medladder_theme') === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  } catch (_) { document.documentElement.classList.remove('dark'); }

  // Browser/status bar colour follows the theme (dark = Clinical teal background).
  var LIGHT_BAR = null;
  function syncThemeColor() {
    var m = document.querySelector('meta[name="theme-color"]');
    if (!m) return;
    if (LIGHT_BAR === null) LIGHT_BAR = m.getAttribute('content') || '#7B2FF7';
    m.setAttribute('content', document.documentElement.classList.contains('dark') ? '#172124' : LIGHT_BAR);
  }
  syncThemeColor();

  window.medladderToggleTheme = function () {
    document.documentElement.classList.add('theme-switching');
    var isDark = document.documentElement.classList.toggle('dark');
    try {
      localStorage.setItem('medladder_theme', isDark ? 'dark' : 'light');
    } catch (_) {}
    var btns = document.querySelectorAll('.theme-toggle, #themeToggle');
    btns.forEach(function (b) {
      b.textContent = isDark ? '🌙' : '☀️';
      b.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
      b.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    });
    syncThemeColor();
    if (typeof window.__onThemeToggle === 'function') {
      try { window.__onThemeToggle(isDark); } catch (_) {}
    }
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        document.documentElement.classList.remove('theme-switching');
      });
    });
    return isDark;
  };

  function initThemeBtn() {
    syncThemeColor();
    var isDark = document.documentElement.classList.contains('dark');
    var btns = document.querySelectorAll('.theme-toggle, #themeToggle');
    btns.forEach(function (b) {
      b.textContent = isDark ? '🌙' : '☀️';
      b.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
      b.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
      if (!b.__themeWired) {
        b.__themeWired = true;
        b.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          window.medladderToggleTheme();
        });
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initThemeBtn);
  } else {
    initThemeBtn();
  }
}());
