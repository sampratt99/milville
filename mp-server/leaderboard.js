/* ============================================================================
   MILVILLE LEADERBOARD -- Cloudflare Worker (HTTP, KV-backed)
   ============================================================================

   The game (milville.html) talks to this over plain HTTPS:
       POST  /lb/submit   body {world,uid,name,cmb,total,maxhit,kills,gold,pvp_wins,boss_kills,deaths,magic_hit,range_hit,shrimp_burned,delves,title}
       GET   /lb/top?world=milville&cat=cmb&n=50   ->  {cat, rows:[{uid,name,title,v}]}

   The client points at MP.CFG.url (your relay) + "/lb/...", so the simplest
   setup is to serve these two routes from the SAME worker as your relay -- then
   you do not have to change any URL in the game.

   ---------------------------------------------------------------------------
   SETUP (one time)
   ---------------------------------------------------------------------------
   1. Create a KV namespace and bind it as  LB :
        npx wrangler kv namespace create LB
      then in wrangler.toml:
        [[kv_namespaces]]
        binding = "LB"
        id = "<the id wrangler printed>"

   2a. MERGE INTO YOUR RELAY WORKER (recommended -- no URL change in the game):
       At the very top of your relay's  fetch(request, env, ...)  handler, BEFORE
       the WebSocket-upgrade handling, add:

           const _u = new URL(request.url);
           if (_u.pathname.startsWith("/lb/")) return handleLeaderboard(request, env);

       Then paste the four consts (CORS, CATS, MAX_ENTRIES) and the two
       functions (j, handleLeaderboard) from below into that worker.
       (Make sure the relay's env has the LB binding too.)

   2b. OR DEPLOY THIS FILE STANDALONE as its own worker. If you do that, the
       worker will live at a DIFFERENT url than your relay, so in milville.html
       give the LB module its own base url instead of MP.CFG.url. (Easiest is
       2a; only use 2b if you would rather keep them separate.)

   ---------------------------------------------------------------------------
   NOTE ON CHEATING: scores are submitted by the client, so a determined player
   could POST fake numbers (within the clamps below). For a friends server that
   is usually fine. If you want light protection, add a shared secret: have the
   game send a header like  x-lb-key: <secret>  and check it here. For real
   anti-cheat you would compute scores server-side, which this game is not set
   up for.
   ============================================================================ */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};
const CATS = ["cmb", "total", "maxhit", "kills", "gold", "pvp_wins", "boss_kills", "brat_kills", "slayer_tasks", "deaths", "magic_hit", "range_hit", "hours", "shrimp_burned", "delves"];
const MAX_ENTRIES = 500;   // cap stored players so the KV value stays small

function j(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "Content-Type": "application/json", ...CORS }
  });
}

export async function handleLeaderboard(request, env) {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
  const kv = env.LB;
  if (!kv) return j({ error: "KV namespace LB not bound" }, 500);

  // ---- submit a score ----
  if (url.pathname === "/lb/submit" && request.method === "POST") {
    let b;
    try { b = await request.json(); } catch (e) { return j({ error: "bad json" }, 400); }
    const uid = String(b.uid || "").slice(0, 64);
    if (!uid) return j({ error: "no uid" }, 400);
    const clamp = (v, hi) => Math.max(0, Math.min(hi, (v | 0)));
    const rec = {
      uid,
      name: String(b.name || "Adventurer").slice(0, 24),
      cmb: clamp(b.cmb, 9999),
      total: clamp(b.total, 99999),
      maxhit: clamp(b.maxhit, 9999),
      kills: clamp(b.kills, 99999999),
      gold: clamp(b.gold, 2000000000),
      pvp_wins: clamp(b.pvp_wins, 9999999),
      boss_kills: clamp(b.boss_kills, 9999999),
      brat_kills: clamp(b.brat_kills, 9999999),
      slayer_tasks: clamp(b.slayer_tasks, 9999999),
      deaths: clamp(b.deaths, 9999999),
      magic_hit: clamp(b.magic_hit, 9999),
      range_hit: clamp(b.range_hit, 9999),
      hours: clamp(b.hours, 99999999),
      shrimp_burned: clamp(b.shrimp_burned, 99999999),
      delves: clamp(b.delves, 9999999),          // Delves Completed -- counted when you claim your chest
      title: b.title ? String(b.title).slice(0, 32) : null,
      ts: Date.now()
    };
    const world = String(b.world || "milville").slice(0, 32);
    const key = "board:" + world;
    const cur = (await kv.get(key, "json")) || {};
    // Monotonic counters can never go backwards (protects against a stale or
    // reset client resubmitting lower values and wiping real progress).
    const prev = cur[uid];
    if (prev) {
      for (const f of ["cmb","total","maxhit","kills","pvp_wins","boss_kills","brat_kills","slayer_tasks","deaths","magic_hit","range_hit","hours","shrimp_burned","delves"])
        rec[f] = Math.max(rec[f] | 0, prev[f] | 0);
    }
    cur[uid] = rec;
    let entries = Object.keys(cur).map(k => cur[k]);
    if (entries.length > MAX_ENTRIES) {
      // drop the stalest records to stay under the cap
      entries.sort((a, c) => c.ts - a.ts);
      entries = entries.slice(0, MAX_ENTRIES);
      const trimmed = {};
      for (const e of entries) trimmed[e.uid] = e;
      await kv.put(key, JSON.stringify(trimmed));
    } else {
      await kv.put(key, JSON.stringify(cur));
    }
    return j({ ok: true });
  }

  // ---- read the top of a category ----
  if (url.pathname === "/lb/top" && request.method === "GET") {
    const world = String(url.searchParams.get("world") || "milville").slice(0, 32);
    let cat = String(url.searchParams.get("cat") || "cmb");
    if (CATS.indexOf(cat) < 0) cat = "cmb";
    let n = parseInt(url.searchParams.get("n") || "50", 10);
    if (!(n > 0)) n = 50;
    if (n > 100) n = 100;
    const cur = (await kv.get("board:" + world, "json")) || {};
    const rows = Object.keys(cur).map(k => cur[k])
      .map(e => ({ uid: e.uid, name: e.name, title: e.title || null, v: (e[cat] | 0) }))
      .sort((a, c) => c.v - a.v)
      .slice(0, n);
    return j({ cat, rows });
  }

  return j({ error: "not found" }, 404);
}

/* Standalone entrypoint (option 2b). If you merged into your relay (2a), you do
   not need this default export -- your relay's own export already calls
   handleLeaderboard for /lb/ paths. */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/lb/")) return handleLeaderboard(request, env);
    return new Response("Milville leaderboard worker. Try /lb/top?world=milville&cat=cmb", { status: 200 });
  }
};
