(function () {
  'use strict';

  // Load GA4 as Google recommends: async and non-blocking, immediately.
  // No post-load delay: the gtag stub in gtag-init.js queues events until
  // the library arrives, so early visits are counted instead of lost.
  var script = document.createElement('script');
  script.async = true;
  script.src = 'https://www.googletagmanager.com/gtag/js?id=G-P5VJLV9KRH';
  script.referrerPolicy = 'strict-origin-when-cross-origin';
  document.head.appendChild(script);
}());
