// Meta Pixel base code for MedLadder (Pixel ID 1566830645205626).
// Kept as an external file (not inline) so the site's CSP needs no extra
// sha256 hash: 'self' covers it. Loaded on every page via analytics-loader.js.
// The fbq stub queues events until fbevents.js arrives, so calls made before
// the library loads (e.g. Purchase) are not lost.
(function () {
  'use strict';
  !function (f, b, e, v, n, t, s) {
    if (f.fbq) return;
    n = f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = !0;
    n.version = '2.0';
    n.queue = [];
    t = b.createElement(e);
    t.async = !0;
    t.src = v;
    s = b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t, s);
  }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  fbq('init', '1566830645205626');
  fbq('track', 'PageView');
}());
