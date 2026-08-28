// Divido service worker — makes the app open and work offline while still
// picking up new deploys quickly.
//
// Strategy:
//   * HTML navigations -> network-first (always try the latest deploy; fall
//     back to the cached page only when offline). This is what keeps users
//     from being trapped on a stale version.
//   * Same-origin static assets (Vite emits content-hashed filenames, so a new
//     build = new filename) -> cache-first, filled in on first fetch.
//   * Cross-origin requests (Supabase auth/data/storage) -> never touched, so
//     they always go straight to the network.

const CACHE = 'divido-cache-v54';
const CORE = ['/', '/index.html', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // allSettled: one missing core file must not abort the whole install
      .then((c) => Promise.allSettled(CORE.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Only handle our own origin — Supabase and other APIs must hit the network.
  if (url.origin !== self.location.origin) return;

  // HTML pages: network-first so a fresh deploy is always preferred.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put('/index.html', clone));
          return res;
        })
        .catch(() => caches.match('/index.html').then((r) => r || caches.match('/')))
    );
    return;
  }

  // Static assets: cache-first, populate on first successful fetch.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(req, clone));
          } else if (res && res.status === 404 && url.pathname.endsWith('.js')) {
            caches.open(CACHE).then((c) => c.delete('/index.html'));
          }
          return res;
        })
        .catch(() => cached);
    })
  );
});
