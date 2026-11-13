// MedLadder service worker.
// Strategy: NETWORK-FIRST for everything on our own origin, falling back to the
// cache only when offline. That way a deploy (including security fixes) reaches
// users on their next load — nothing is ever served stale while online.
// Cross-origin traffic (Supabase, Razorpay, Google, CDN) is never intercepted.
//
// Bump CACHE_NAME if you ever need to force-drop old caches.
const CACHE_NAME = 'medladder-4bc18720f32f';
const APP_SHELL = ['/', '/app.css', '/quiz-pro.css', '/app.js', '/syllabus.js', '/gtag-init.js', '/theme-init.js', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // add() one by one so a single missing file can't fail the whole install
      Promise.all(APP_SHELL.map((url) => cache.add(url).catch(() => null)))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match('/') : Response.error()))
      )
  );
});
