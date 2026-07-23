/* Milville service worker — makes the game installable + playable offline.
   Bump CACHE_VERSION whenever you deploy a new build (same idea as your ?v= cache-bust);
   the old cache is deleted on activate, so returning players pull the fresh files. */
const CACHE_VERSION = 'milville-v2';   // v2: PURGES v1, which had wrongly cached market API responses

/* The game shell + its one external dependency (Three.js from cdnjs).
   Caching the CDN file is what lets the game run with NO network after the first visit. */
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache =>
      /* addAll fails the whole install if ONE request fails; add resiliently instead so a
         hiccup fetching the CDN file doesn't block the install. */
      Promise.all(PRECACHE.map(url =>
        cache.add(new Request(url, { cache: 'reload' })).catch(() => {})
      ))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  /* ** NEVER TOUCH API CALLS. ** Only same-origin requests (the game shell, icons) and the
     explicitly precached CDN script are served from cache. Everything else -- above all the
     multiplayer/market/leaderboard workers on workers.dev -- goes straight to the network,
     uncached. v1 of this worker cache-first'd those API GETs, which froze the Grand Exchange
     board/slots at a days-old snapshot on every installed device: listings, cancels and
     collects (POSTs) all worked live while every read showed the stale cache. */
  const sameOrigin = new URL(req.url).origin === self.location.origin;
  if (!sameOrigin && !PRECACHE.includes(req.url)) return;   // browser handles it normally

  /* Navigations (loading the page): network-first so a fresh deploy shows immediately when
     online, but fall back to the cached shell when offline. */
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then(c => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  /* Everything else (the CDN script, icons, og image): cache-first for instant, offline loads;
     fill the cache in the background on a miss. */
  event.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE_VERSION).then(c => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => cached))
  );
});
