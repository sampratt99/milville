/* ============================================================================
   Milville service worker — makes the game installable + playable offline.

   ----------------------------------------------------------------------------
   CACHE_VERSION MUST BE BUMPED BY HAND. READ THIS BEFORE YOU DEPLOY.
   ----------------------------------------------------------------------------
   There is no way to derive it automatically. GitHub Pages serves this file
   verbatim: there is no build step, no template, no environment variable, and
   nothing in the repo that changes per deploy for the worker to read. The `?v=`
   you bump when hard-refreshing lives in the URL you type, not in any file here,
   so the worker cannot see it either.

   (The one trick that WOULD work — registering `sw.js?v=N` from index.html and
   reading `self.location.search` — just moves the same manual bump into
   index.html. It is not an automation, so it is not worth the extra coupling.)

   The good news: since v3 you rarely need to bump it. Every successful online
   navigation now OVERWRITES the cached shell under a query-stripped key, so the
   offline copy heals itself to the newest build you shipped. Bump CACHE_VERSION
   only when you need a hard purge:

     * you changed what PRECACHE contains
     * you fixed a caching bug and want every installed device to drop the lot
     * you shipped something where an old cached shell would be actively wrong

   Bumping it deletes every other cache on activate and re-precaches from the
   network, so it is always safe — just heavier than letting the shell heal.
   ----------------------------------------------------------------------------

   v3: res.ok guard before every cache write; navigations keyed without their
       query string; a timeout on the network-first fetch. Purges v2, whose
       entries were keyed WITH the query and so accumulated one shell per ?v=.
   v2: purged v1, which had wrongly cached market API responses.
   ============================================================================ */
const CACHE_VERSION = 'milville-v3';

/* The game shell + its one external dependency (Three.js from cdnjs).
   Caching the CDN file is what lets the game run with NO network after the first visit. */
const SHELL = './index.html';
const PRECACHE = [
  './',
  SHELL,
  './manifest.webmanifest',
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'
];

/* How long a navigation waits for the network before falling back to the cached
   shell. Only ever reached on a HANGING connection: a fetch that fails outright
   rejects immediately and falls back without waiting. If there is no cached
   shell to fall back to we keep waiting for the network regardless, so this can
   never turn a slow first visit into a failed one. */
const NAV_TIMEOUT_MS = 5000;

/* ** ONLY EVER CACHE A GOOD RESPONSE. **
   Without this, a 404 or an error page served during a deploy window is written
   into the cache and served to that device from then on — indefinitely, because
   nothing re-fetches a shell the worker believes it already has.

   `res.ok` is also false for an OPAQUE response (status 0), which is what a
   no-cors cross-origin fetch returns. That is deliberate: an opaque response is
   indistinguishable from an error, so it must not be cached either. It is safe
   for the CDN copy of Three.js ONLY because index.html loads it with
   crossorigin="anonymous" — a real CORS response with a readable status. If that
   attribute is ever dropped, this worker silently stops caching Three.js and the
   game stops working offline. (CLAUDE.md already says to keep it; this is the
   other reason why.) */
const cacheable = res => !!res && res.ok;

/* The cache key for a navigation: the URL with its query and hash stripped.
   Bumping ?v= must not mint a NEW cache entry — that accumulated one full copy
   of a 3.7 MB shell per version shipped, and left the offline fallback pointing
   at the ORIGINAL precached copy rather than the newest one. Stripping the query
   makes every fresh load overwrite the same entry in place. */
function shellKey(req) {
  const u = new URL(req.url);
  u.search = '';
  u.hash = '';
  return u.href;
}

function putIfGood(key, res) {
  if (!cacheable(res)) return;
  const copy = res.clone();
  caches.open(CACHE_VERSION).then(c => c.put(key, copy)).catch(() => {});
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache =>
      /* addAll fails the whole install if ONE request fails; add resiliently instead so a
         hiccup fetching the CDN file doesn't block the install.
         cache.add() already rejects on a non-ok response, so the res.ok rule holds here too. */
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
     online, but fall back to the cached shell when offline OR when the network hangs. */
  if (req.mode === 'navigate') {
    const key = shellKey(req);

    /* The live fetch. It NEVER rejects — a failure resolves to null instead — because
       the cache can win the race below and leave this promise unawaited, and an
       unawaited rejection is an unhandled error in the worker. It also keeps running
       after the timeout, so a slow connection still refreshes the cache for next time. */
    const net = fetch(req)
      .then(res => { putIfGood(key, res); return res; })
      .catch(() => null);

    /* newest shell first, then the precached forms */
    const cached = () => caches.match(key)
      .then(r => r || caches.match(SHELL))
      .then(r => r || caches.match('./'));

    const timeout = new Promise(resolve => setTimeout(() => resolve(null), NAV_TIMEOUT_MS));

    event.respondWith(
      Promise.race([net, timeout]).then(first => {
        if (first) return first;              /* the network won, whatever its status */
        /* it hung or it failed: serve the newest shell we have. With no cached shell
           at all, go back to waiting on the network rather than failing early — this
           is what stops the timeout turning a slow FIRST visit into a broken one. */
        return cached()
          .then(hit => hit || net)
          .then(r => r || new Response(
            'Milville is offline and no cached copy is available yet.',
            { status: 503, headers: { 'Content-Type': 'text/plain' } }));
      })
    );
    return;
  }

  /* Everything else (the CDN script, icons, og image): cache-first for instant, offline loads;
     fill the cache in the background on a miss. */
  event.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(res => {
      putIfGood(req, res);
      return res;
    }).catch(err => {
      /* returning `cached` here when it is undefined would resolve respondWith with
         undefined, which is a TypeError rather than a clean network error. Rethrow so
         the browser reports the failure it actually had. */
      if (cached) return cached;
      throw err;
    }))
  );
});
