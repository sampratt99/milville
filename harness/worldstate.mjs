/* ============================================================================
   worldstate — mp-server/world_state.js, the shared-world respawn table.

   This file needs NO shim and no game: it is pure functions over an abstract
   async store and an injected clock, exactly as its header advertises. That is
   the whole reason it can be tested here, and it is why this harness exists —
   the two server files with no Cloudflare imports were the most testable code
   in the project and had no coverage at all.

   The store mock has the same shape as Cloudflare's ctx.storage:
   get / put / delete / list({prefix}) -> Map.

   Run: node harness/worldstate.mjs
   ========================================================================== */
import {Suite} from './_lib.mjs';
import {recordMobDead, recordNode, buildSnapshot, clearMob} from '../mp-server/world_state.js';

/* ---- a Map-backed ctx.storage, and a clock we control -------------------- */
function makeStore(){
  const m = new Map();
  const log = {puts: 0, deletes: 0, lists: 0};
  return {
    _m: m, _log: log,
    async get(k){ return m.get(k); },
    async put(k, v){ log.puts++; m.set(k, v); },
    async delete(k){ log.deletes++; return m.delete(k); },
    async list({prefix} = {}){
      log.lists++;
      const out = new Map();
      for(const [k, v] of m) if(!prefix || k.startsWith(prefix)) out.set(k, v);
      return out;
    },
  };
}
let CLOCK = 1000000;
const now = () => CLOCK;

const S = new Suite('worldstate');
const HOUR = 7200000;   /* the clamp in the file, raised for Cinderwing's 2h respawn */

/* ---- recording a dead mob ------------------------------------------------ */
{
  const st = makeStore();
  CLOCK = 1000000;
  const ok = await recordMobDead(st, now, 42, 60000);
  S.eq('recording a dead mob succeeds',           ok, true);
  S.eq('  under a mob: key',                      [...st._m.keys()], ['mob:42']);
  S.eq('  storing an ABSOLUTE respawn time',      st._m.get('mob:42'), 1060000);
  S.ok('  which is now + rs, not rs',             st._m.get('mob:42') === CLOCK + 60000);
}
{
  const st = makeStore();
  S.eq('a negative index is refused',             await recordMobDead(st, now, -1, 1000), false);
  S.eq('a huge index is refused',                 await recordMobDead(st, now, 100000, 1000), false);
  /* `m = m | 0` runs BEFORE validMob, so a fractional index is FLOORED to a valid
     one rather than refused. Harmless — a client sending 1.5 gets mob 1 — but it
     means validMob's Number.isInteger test can never fail, because |0 has already
     made it an integer. The range checks are the ones doing real work. */
  S.eq('a fractional index is floored, not refused', await recordMobDead(st, now, 1.5, 1000), true);
  S.eq('  landing on the floored index',          [...st._m.keys()], ['mob:1']);
  S.eq('  and nothing else was written',          st._m.size, 1);
  st._m.clear();
  S.eq('index 0 is valid',                        await recordMobDead(st, now, 0, 1000), true);
  S.eq('99999 is valid',                          await recordMobDead(st, now, 99999, 1000), true);
}
{
  const st = makeStore();
  CLOCK = 0;
  await recordMobDead(st, now, 1, HOUR * 10);
  S.eq('A RESPAWN IS CLAMPED TO TWO HOURS',       st._m.get('mob:1'), HOUR);
  await recordMobDead(st, now, 2, -5000);
  S.eq('  and a negative one clamps to zero',     st._m.get('mob:2'), 0);
  await recordMobDead(st, now, 3, HOUR);
  S.eq('  exactly two hours is allowed',          st._m.get('mob:3'), HOUR);
}

/* ---- recording a node ---------------------------------------------------- */
{
  const st = makeStore();
  CLOCK = 500;
  S.eq('recording a node succeeds',               await recordNode(st, now, 10, 20, 3000), true);
  S.eq('  under a node:x,y key',                  [...st._m.keys()], ['node:10,20']);
  S.eq('  with an absolute respawn',              st._m.get('node:10,20'), 3500);
  S.eq('a negative tile is refused',              await recordNode(st, now, -1, 5, 100), false);
  S.eq('an off-map tile is refused',              await recordNode(st, now, 4096, 5, 100), false);
  S.eq('  and the y coord is checked too',        await recordNode(st, now, 5, 4096, 100), false);
  S.eq('4095 is the last valid tile',             await recordNode(st, now, 4095, 4095, 100), true);
}

/* ---- THE SNAPSHOT: remaining ms, never absolute -------------------------- */
{
  const st = makeStore();
  CLOCK = 1000;
  await recordMobDead(st, now, 7, 60000);      /* back at 61000 */
  await recordNode(st, now, 3, 4, 30000);      /* back at 31000 */

  CLOCK = 11000;                                /* ten seconds later */
  const snap = await buildSnapshot(st, now);
  S.eq('the snapshot is typed',                   snap.t, 'snapshot');
  S.eq('  listing the dead mob',                  snap.mobs.length, 1);
  S.eq('  by index',                              snap.mobs[0].m, 7);
  S.eq('IT SENDS REMAINING MS, NOT AN ABSOLUTE TIME', snap.mobs[0].rs, 50000);
  S.ok('  which is NOT the stored value',         snap.mobs[0].rs !== st._m.get('mob:7'),
       `sent ${snap.mobs[0].rs}, stored ${st._m.get('mob:7')}`);
  S.eq('  and the node the same way',             snap.nodes[0].rs, 20000);
  S.eq('  with its coordinates parsed back',      [snap.nodes[0].x, snap.nodes[0].y], [3, 4]);

  /* the same snapshot taken later reports LESS time, from the same stored data */
  CLOCK = 31000;
  const later = await buildSnapshot(st, now);
  S.eq('a later joiner is told less time',        later.mobs[0].rs, 30000);
  S.ok('  from the same unchanged key',           st._m.get('mob:7') === 61000);
}

/* ---- lazy GC ------------------------------------------------------------- */
{
  const st = makeStore();
  CLOCK = 0;
  await recordMobDead(st, now, 1, 1000);
  await recordMobDead(st, now, 2, 90000);
  await recordNode(st, now, 5, 5, 1000);
  S.eq('three keys stored',                       st._m.size, 3);

  CLOCK = 50000;                                  /* two have expired */
  const snap = await buildSnapshot(st, now);
  S.eq('an expired mob is omitted',               snap.mobs.map(x => x.m), [2]);
  S.eq('  and an expired node',                   snap.nodes.length, 0);
  S.eq('EXPIRED KEYS ARE SWEPT AWAY',             st._m.size, 1);
  S.eq('  leaving only the live one',             [...st._m.keys()], ['mob:2']);
}
{
  /* a key holding junk is treated as expired rather than crashing the snapshot */
  const st = makeStore();
  st._m.set('mob:9', 'not a number');
  st._m.set('node:1,1', null);
  CLOCK = 0;
  const snap = await buildSnapshot(st, now);
  S.eq('a corrupt mob key does not throw',        snap.mobs.length, 0);
  S.eq('  nor a corrupt node key',                snap.nodes.length, 0);
  S.eq('  and both are swept',                    st._m.size, 0);
}
{
  const st = makeStore();
  const snap = await buildSnapshot(st, now);
  S.eq('an empty world snapshots cleanly',        [snap.mobs.length, snap.nodes.length], [0, 0]);
}
{
  /* a respawn exactly at `now` counts as expired, not as 0ms remaining */
  const st = makeStore();
  CLOCK = 0;
  await recordMobDead(st, now, 4, 5000);
  CLOCK = 5000;
  const snap = await buildSnapshot(st, now);
  S.eq('a respawn due exactly now is expired',    snap.mobs.length, 0);
  S.eq('  and swept',                             st._m.size, 0);
}

/* ---- clearMob ------------------------------------------------------------ */
{
  const st = makeStore();
  CLOCK = 0;
  await recordMobDead(st, now, 11, 60000);
  await clearMob(st, 11);
  S.eq('clearMob drops the key early',            st._m.has('mob:11'), false);
  await recordMobDead(st, now, 12, 60000);
  await clearMob(st, -5);
  S.eq('  and validates its index',               st._m.has('mob:12'), true);
}

/* ---- prefix isolation: the two key spaces never collide ------------------ */
{
  const st = makeStore();
  CLOCK = 0;
  await recordMobDead(st, now, 1, 60000);
  await recordNode(st, now, 1, 1, 60000);
  /* market keys live in the SAME storage on the live-room object's sibling; make
     sure a foreign prefix is never picked up by the snapshot */
  st._m.set('mkt:offer:1', {id: 1});
  st._m.set('mkt:seq', 5);
  const snap = await buildSnapshot(st, now);
  S.eq('the snapshot sees one mob',               snap.mobs.length, 1);
  S.eq('  and one node',                          snap.nodes.length, 1);
  S.ok('FOREIGN KEYS ARE UNTOUCHED',              st._m.has('mkt:offer:1') && st._m.has('mkt:seq'),
       'buildSnapshot GCs by prefix, so it must never reach market storage');
}

S.note('validMob/validTile call Number.isInteger AFTER an |0 coercion, so that half of each ' +
       'guard is dead code — the range checks are what actually reject bad input. Noted, not changed.');

S.report(
  'Respawns are stored absolute, clamped to two hours, validated on both axes, and shipped to joiners as REMAINING ms so no client reconciles clock skew. Expired keys are swept lazily and corrupt ones cannot throw.',
  'that a real Durable Object behaves the same — ctx.storage is mocked here, so coalesced writes and eviction are not modelled.');
