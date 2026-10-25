// Apply the saved theme before stylesheets paint, without an inline script.
(function () {
  try {
    if (localStorage.getItem('medladder_theme') === 'light') {
      document.documentElement.classList.remove('dark');
    }
  } catch (_) {}

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
