(function () {
  'use strict';

  var loaded = false;
  function loadAnalytics() {
    if (loaded) return;
    loaded = true;

    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=G-P5VJLV9KRH';
    script.referrerPolicy = 'strict-origin-when-cross-origin';
    document.head.appendChild(script);
  }

  // Start analytics after the initial page work has settled. User events and
  // the page_view queued by gtag-init.js are sent when the library arrives.
  window.addEventListener('load', function () {
    window.setTimeout(function () {
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(loadAnalytics, { timeout: 2500 });
      } else {
        loadAnalytics();
      }
    }, 4000);
  }, { once: true });

  ['pointerdown', 'keydown', 'touchstart'].forEach(function (eventName) {
    window.addEventListener(eventName, loadAnalytics, { once: true, passive: true });
  });
}());
