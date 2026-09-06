// Divido service worker — makes the app open and work offline while still
// picking up new deploys quickly.
//
// Strategy:
//   * On install, PRECACHE the app shell: the index page AND the main JS/CSS it
//     references (parsed out of index.html), cached together as one coherent
//     set. This is what lets the app open on a cold offline start instead of
//     falling into a reload loop when a needed chunk isn't cached.
//   * HTML navigations -> network-first (always try the latest deploy; fall
//     back to the cached index only when offline).
//   * Same-origin static assets (Vite emits content-hashed filenames) ->
//     cache-first, filled in on first fetch. Lazy-loaded route chunks are
//     cached the first time they're visited online.
//   * Cross-origin requests (Supabase auth/data/storage) -> never touched.

// BUILD_ID is replaced with a unique value at build time (scripts/stamp-sw.mjs),
// so sw.js changes on EVERY deploy — that's what makes the browser detect a new
// service worker and surface the "New version available" banner even for a
// code-only deploy. In dev (unstamped) it stays the literal placeholder.
const BUILD_ID = '__BUILD_ID__';
const CACHE = 'divido-cache-' + BUILD_ID;
const CORE = ['/index.html', '/manifest.json'];

// Precache the shell: core files plus every hashed /assets/*.js and *.css that
// index.html references, so the entry bundle is guaranteed present offline.
async function precacheShell(cache) {
  await Promise.allSettled(CORE.map((u) => cache.add(u)));
  try {
    const res = await fetch('/index.html', { cache: 'no-cache' });
    if (res && res.ok) {
      await cache.put('/index.html', res.clone());
      const html = await res.text();
      const urls = new Set();
      const re = /(?:href|src)=["']([^"']+)["']/g;
      let m;
      while ((m = re.exec(html))) {
        const u = m[1];
        if (u.startsWith('/assets/') && (u.endsWith('.js') || u.endsWith('.css'))) {
          urls.add(u);
        }
      }
      await Promise.allSettled([...urls].map((u) => cache.add(u)));
    }
  } catch (e) {
    // Offline during install (rare) — the core files are enough to boot.
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then(precacheShell).then(() => self.skipWaiting())
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

  // HTML pages: network-first so a fresh deploy is always preferred; fall back
  // to the cached index (kept fresh by every online navigation + install) when
  // offline. No stale '/' fallback — that was what served an old page pointing
  // at chunks that were no longer cached, causing the offline reload loop.
  if (req.mode === 'navigate') {
    event.respondWith(
      // `cache: 'no-store'` bypasses the browser's OWN HTTP cache so a reload
      // always pulls the truly-latest index (with the newest asset hashes),
      // instead of a stale browser-cached copy that points at chunks a new
      // deploy already replaced — the root of "I reloaded but still see the old
      // build". Falls back to the SW-cached index only when offline.
      fetch(req.url, { cache: 'no-store', credentials: 'same-origin' })
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put('/index.html', clone));
          return res;
        })
        .catch(() => caches.match('/index.html'))
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
          }
          return res;
        })
        .catch(() => cached);
    })
  );
});
