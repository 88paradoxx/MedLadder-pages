(function () {
  'use strict';

  // Meta Pixel base code: analytics-loader.js runs on every page (including
  // the static pages that never load app.js), so it injects the pixel init
  // file eagerly on page load. The fbq stub queues events until the
  // fbevents.js library arrives.
  (function () {
    var pixel = document.createElement('script');
    pixel.async = true;
    pixel.src = '/meta-pixel-init.js';
    document.head.appendChild(pixel);
  }());

  // GA4 is about 190 KB that nothing on screen needs, so it loads after the
  // page has painted: on the first tap, scroll or key press, or 4 s after the
  // page finishes loading, whichever comes first. The gtag() stub in
  // gtag-init.js queues every event until then, so nothing is lost.
  var done = false;
  var EVENTS = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
  function load() {
    if (done) return;
    done = true;
    EVENTS.forEach(function (e) { window.removeEventListener(e, load, true); });
    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=G-P5VJLV9KRH';
    script.referrerPolicy = 'strict-origin-when-cross-origin';
    document.head.appendChild(script);
  }
  EVENTS.forEach(function (e) { window.addEventListener(e, load, { capture: true, passive: true, once: true }); });
  function later() { setTimeout(load, 4000); }
  if (document.readyState === 'complete') later();
  else window.addEventListener('load', later, { once: true });
  // Leaving before then: still send the queued page view.
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') load(); });
}());
