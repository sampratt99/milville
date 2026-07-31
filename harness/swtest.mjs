/* ============================================================================
   swtest — the service worker's caching rules.

   sw.js never runs in this repo's test environment: it needs `self`, `caches`
   and a Fetch API. So this harness builds a miniature one, loads sw.js into it,
   captures the handlers it registers, and drives them.

   It exists because all four rules it checks are the kind that fail SILENTLY on
   a real device — a bad response cached during a deploy window, a cache entry
   per ?v=, a hang with no fallback — and none of them would ever show up in a
   normal online session.

   Run: node harness/swtest.mjs
   ========================================================================== */
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import {Suite} from './_lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const ORIGIN = 'https://sampratt99.github.io';
const BASE = ORIGIN + '/milville-repo/';

/* ---- a miniature service-worker environment ------------------------------ */
function makeEnv({netMode = 'ok', seeded = {}} = {}){
  const stores = new Map();                 // cacheName -> Map(url -> response)
  const log = {puts: [], fetches: [], timeouts: []};

  const res = (status, tag) => ({
    ok: status >= 200 && status < 300,
    status,
    tag,
    clone(){ return this; },
  });

  const cacheFor = name => {
    if(!stores.has(name)) stores.set(name, new Map());
    return stores.get(name);
  };
  /* A real Cache resolves a relative key against the worker's scope, so
     caches.match('./index.html') finds the absolutely-keyed entry. Comparing the
     raw string would make every relative lookup miss and quietly turn the
     fallback chain into a no-op. */
  const asUrl = k => new URL(typeof k === 'string' ? k : k.url, BASE).href;

  const caches = {
    open: name => Promise.resolve({
      put(key, value){ log.puts.push({key: asUrl(key), tag: value.tag, status: value.status});
                       cacheFor(name).set(asUrl(key), value); return Promise.resolve(); },
      match(key){ return Promise.resolve(cacheFor(name).get(asUrl(key))); },
    }),
    match(key){
      for(const [, m] of stores){ const hit = m.get(asUrl(key)); if(hit) return Promise.resolve(hit); }
      return Promise.resolve(undefined);
    },
    keys(){ return Promise.resolve([...stores.keys()]); },
    delete(name){ stores.delete(name); return Promise.resolve(true); },
  };

  /* seed a cache as if a previous version had installed */
  for(const [name, entries] of Object.entries(seeded)){
    const m = cacheFor(name);
    for(const [url, tag] of Object.entries(entries)) m.set(url, res(200, tag));
  }

  const fetchStub = req => {
    const url = typeof req === 'string' ? req : req.url;
    log.fetches.push(url);
    if(netMode === 'ok')      return Promise.resolve(res(200, 'network-fresh'));
    if(netMode === '404')     return Promise.resolve(res(404, 'deploy-window-404'));
    if(netMode === '500')     return Promise.resolve(res(500, 'server-error'));
    if(netMode === 'fail')    return Promise.reject(new Error('offline'));
    if(netMode === 'hang')    return new Promise(() => {});          // never settles
    if(netMode === 'slow')    return new Promise(r => setTimeout(() => r(res(200, 'network-slow')), 50));
    return Promise.resolve(res(200, 'network-fresh'));
  };

  const handlers = {};
  const self_ = {
    addEventListener: (t, fn) => { handlers[t] = fn; },
    skipWaiting: () => Promise.resolve(),
    clients: {claim: () => Promise.resolve()},
    location: new URL(BASE + 'sw.js'),
    registration: {scope: BASE},
  };

  /* A setTimeout scaled 1000x down (5000ms -> 5ms) rather than fired immediately.
     Firing immediately made the timeout test VACUOUS: the fallback happened on the
     next tick no matter how large the constant was, so removing the timeout
     entirely would still have passed. Scaling keeps the ORDERING real — the 5s
     navigation timeout still beats a 50ms 'slow' network — while keeping the run
     fast. */
  const fakeSetTimeout = (fn, ms) => {
    log.timeouts.push(ms);
    return setTimeout(fn, Math.min(Math.max((ms || 0) / 1000, 0), 100));
  };

  const load = new Function('self', 'caches', 'fetch', 'Request', 'Response', 'URL', 'setTimeout', SW_SRC);
  load(self_, caches, fetchStub, Request, Response, URL, fakeSetTimeout);

  return {handlers, caches, log, stores, res, self: self_};
}

/* Drive one request through the fetch handler. Everything is raced against a test
   deadline so a worker that never answers FAILS rather than hanging the suite —
   that is what makes the timeout check real. */
const TEST_DEADLINE_MS = 400;
function go(env, url, mode){
  const req = {url, method: 'GET', mode: mode || 'no-cors'};
  let answered = null;
  const ev = {request: req, respondWith(p){ answered = p; }};
  env.handlers.fetch(ev);
  if(answered === null) return Promise.resolve('passthrough');
  return Promise.race([
    Promise.resolve(answered),
    new Promise(r => setTimeout(() => r('NEVER-ANSWERED'), TEST_DEADLINE_MS)),
  ]);
}

const S = new Suite('swtest');
const VER = (SW_SRC.match(/CACHE_VERSION\s*=\s*'([^']+)'/) || [])[1];
const NAV = 'navigate';

/* ---- 1. res.ok guard ------------------------------------------------------ */
{
  const env = makeEnv({netMode: '404'});
  const out = await go(env, BASE + 'index.html?v=7', NAV);
  S.eq('a 404 during a deploy window is SERVED to the player', out.status, 404);
  S.eq('  but NEVER written to the cache',
       env.log.puts.filter(p => p.status === 404).length, 0);
}
{
  const env = makeEnv({netMode: '500'});
  await go(env, BASE + 'index.html', NAV);
  S.eq('a 500 is not cached either',   env.log.puts.length, 0);
}
{
  const env = makeEnv({netMode: 'ok'});
  await go(env, BASE + 'index.html', NAV);
  S.eq('a 200 IS cached',              env.log.puts.length, 1);
  S.eq('  under the shell key',        env.log.puts[0].key, BASE + 'index.html');
}
{
  /* the same rule on the cache-first branch */
  const env = makeEnv({netMode: '404'});
  await go(env, BASE + 'icon-192.png');
  S.eq('a bad subresource is not cached', env.log.puts.length, 0);
  const env2 = makeEnv({netMode: 'ok'});
  await go(env2, BASE + 'icon-192.png');
  S.eq('  a good one is',                 env2.log.puts.length, 1);
}

/* ---- 2. query-stripped navigation keys ------------------------------------ */
{
  const env = makeEnv({netMode: 'ok'});
  await go(env, BASE + 'index.html?v=5', NAV);
  await go(env, BASE + 'index.html?v=6', NAV);
  await go(env, BASE + 'index.html?v=7#frag', NAV);
  const keys = env.log.puts.map(p => p.key);
  S.eq('three ?v= loads write three times',   keys.length, 3);
  S.eq('  ALL TO ONE KEY',                    new Set(keys).size, 1);
  S.eq('  with the query stripped',           keys[0], BASE + 'index.html');
  const shelf = env.stores.get(VER);
  S.eq('  so the cache holds ONE shell, not three', shelf.size, 1);
}
{
  /* the root form keeps its own key, also query-stripped */
  const env = makeEnv({netMode: 'ok'});
  await go(env, BASE + '?v=9', NAV);
  S.eq('the bare root is keyed without its query', env.log.puts[0].key, BASE);
}

/* ---- 3. the offline fallback is the NEWEST shell, not the precached one ---- */
{
  const env = makeEnv({netMode: 'ok', seeded: {[VER]: {[BASE + 'index.html']: 'ORIGINAL-precached'}}});
  await go(env, BASE + 'index.html?v=6', NAV);          // a fresh online load overwrites it
  const offline = makeEnv({netMode: 'fail'});
  /* replay the updated cache into an offline env */
  const updated = env.stores.get(VER).get(BASE + 'index.html');
  const env2 = makeEnv({netMode: 'fail', seeded: {[VER]: {}}});
  (await env2.caches.open(VER)).put(BASE + 'index.html', updated);
  const out = await go(env2, BASE + 'index.html?v=6', NAV);
  S.eq('an online load REPLACES the precached shell in place',
       env.stores.get(VER).get(BASE + 'index.html').tag, 'network-fresh');
  S.eq('  so the offline fallback is the newest copy', out.tag, 'network-fresh');
  S.ok('  and it was found despite the ?v= on the request', !!out);
}
{
  /* falling back when the newest key misses: shell, then root */
  const env = makeEnv({netMode: 'fail', seeded: {[VER]: {[BASE + 'index.html']: 'precached-shell'}}});
  const out = await go(env, BASE + 'deep/link', NAV);
  S.eq('an unknown navigation falls back to the shell', out.tag, 'precached-shell');
}

/* ---- 4. the navigation timeout -------------------------------------------- */
{
  const env = makeEnv({netMode: 'hang', seeded: {[VER]: {[BASE + 'index.html']: 'cached-shell'}}});
  const out = await go(env, BASE + 'index.html?v=6', NAV);
  S.ok('A HANGING CONNECTION IS ANSWERED AT ALL',   out !== 'NEVER-ANSWERED',
       'without the timeout the worker waits on a fetch that never settles');
  S.eq('  falling back to the cached shell',        out.tag, 'cached-shell');
  S.eq('  after the documented timeout',            env.log.timeouts[0], 5000);
}
{
  const env = makeEnv({netMode: 'fail', seeded: {[VER]: {[BASE + 'index.html']: 'cached-shell'}}});
  const out = await go(env, BASE + 'index.html', NAV);
  S.eq('an outright failure falls back too',        out.tag, 'cached-shell');
}
{
  /* NO cached shell + a hang: must keep waiting on the network, never fail */
  const env = makeEnv({netMode: 'slow'});
  const out = await go(env, BASE + 'index.html', NAV);
  S.ok('with NO cache, a slow first visit is not abandoned', out !== 'NEVER-ANSWERED');
  S.eq('  it still gets the real page',                     out.tag, 'network-slow');
  S.ok('  rather than being turned into a failure',         out.ok);
}
{
  /* the network winning the race is what a normal online load does */
  const env = makeEnv({netMode: 'ok', seeded: {[VER]: {[BASE + 'index.html']: 'stale-cache'}}});
  const out = await go(env, BASE + 'index.html', NAV);
  S.eq('ONLINE, THE NETWORK STILL WINS',            out.tag, 'network-fresh');
  S.ok('  so a deploy is picked up without a ?v= bump', out.tag !== 'stale-cache');
}

/* ---- API calls stay untouched (the v1 regression) ------------------------- */
{
  const env = makeEnv({netMode: 'ok'});
  const out = await go(env, 'https://milville-mp.sampratt99.workers.dev/mkt/board');
  S.eq('a market GET is passed straight through',   out, 'passthrough');
  S.eq('  and never cached',                        env.log.puts.length, 0);
  const out2 = await go(env, 'https://milville-mp.sampratt99.workers.dev/lb/top?cat=cmb');
  S.eq('a leaderboard GET is passed through too',   out2, 'passthrough');
}
{
  const env = makeEnv({netMode: 'ok'});
  const out = await go(env, 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js');
  S.ok('the precached CDN script IS handled',       out !== 'passthrough');
  S.eq('  and cached for offline play',             env.log.puts.length, 1);
}
{
  const env = makeEnv({netMode: 'ok'});
  const req = {url: BASE + 'index.html', method: 'POST', mode: NAV};
  let answered = null;
  env.handlers.fetch({request: req, respondWith(p){ answered = p; }});
  S.eq('a POST is never intercepted',               answered, null);
}

/* ---- version + housekeeping ---------------------------------------------- */
S.ok('CACHE_VERSION was bumped for this change',    VER === 'milville-v3', VER);
S.ok('the file documents that it must be bumped by hand',
     /MUST BE BUMPED BY HAND/.test(SW_SRC));
S.ok('  and says why it cannot be derived',
     /no build step|no template|no environment variable/.test(SW_SRC));
{
  const env = makeEnv({netMode: 'ok', seeded: {'milville-v2': {[BASE + 'index.html']: 'old'}}});
  await env.handlers.activate({waitUntil: p => p});
  await new Promise(r => setTimeout(r, 10));
  S.ok('activate purges every other cache version', !env.stores.has('milville-v2'),
       [...env.stores.keys()].join(', ') || '(empty)');
}

S.report(
  'The worker caches only good responses, keys navigations without their query so the shell heals in place, and falls back to cache on a hang instead of waiting.',
  'how a real browser schedules the SW update, and whether an installed PWA on a bad connection behaves as modelled — needs a device.');
