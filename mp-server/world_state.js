// ============================================================================
//  Milville shared-world state — pure logic (no Cloudflare deps, unit-testable).
//
//  The Durable Object remembers two things so the world is genuinely shared and
//  survives hibernation/eviction (stored in ctx.storage, NOT in memory):
//    mob:<index>     -> absolute respawn time (server ms)
//    node:<x>,<y>    -> absolute respawn time (server ms)
//
//  These functions operate on an abstract async store with the same shape as
//  Cloudflare's ctx.storage:  get(k) put(k,v) delete(k) list({prefix}) -> Map,
//  and a now() clock. The DO wires in ctx.storage + Date.now; tests wire a
//  Map-backed mock + a controllable clock.
//
//  The snapshot sends REMAINING ms (not absolute times) so clients never have to
//  reconcile clock skew — a joiner just sets "this mob respawns in N ms".
// ============================================================================

const HOUR = 7200000 /* raised for Cinderwing's 2h respawn; client MAX_RS matches */;
const clampRs = (rs) => Math.max(0, Math.min(rs | 0, HOUR));
const validMob = (m) => Number.isInteger(m) && m >= 0 && m < 100000;
const validTile = (v) => Number.isInteger(v) && v >= 0 && v < 4096;

export async function recordMobDead(store, now, m, rs) {
  m = m | 0;
  if (!validMob(m)) return false;
  await store.put('mob:' + m, now() + clampRs(rs));
  return true;
}

export async function recordNode(store, now, x, y, rs) {
  x = x | 0; y = y | 0;
  if (!validTile(x) || !validTile(y)) return false;
  await store.put('node:' + x + ',' + y, now() + clampRs(rs));
  return true;
}

// Build the join snapshot of everything still pending; lazily GC expired keys.
export async function buildSnapshot(store, now) {
  const t = now();
  const mobs = [], nodes = [], expired = [];

  const mobMap = await store.list({ prefix: 'mob:' });
  for (const [k, respawnAt] of mobMap) {
    if (typeof respawnAt !== 'number') { expired.push(k); continue; }
    const rem = respawnAt - t;
    if (rem <= 0) { expired.push(k); continue; }
    mobs.push({ m: +k.slice(4), rs: rem });
  }

  const nodeMap = await store.list({ prefix: 'node:' });
  for (const [k, respawnAt] of nodeMap) {
    if (typeof respawnAt !== 'number') { expired.push(k); continue; }
    const rem = respawnAt - t;
    if (rem <= 0) { expired.push(k); continue; }
    const parts = k.slice(5).split(',');
    nodes.push({ x: +parts[0], y: +parts[1], rs: rem });
  }

  for (const k of expired) await store.delete(k);
  return { t: 'snapshot', mobs, nodes };
}

// A mob that respawned (someone reported it back alive, or it timed out) can be
// cleared early — keeps the table tight when a mob is re-killed/streamed.
export async function clearMob(store, m) {
  if (!validMob(m | 0)) return;
  await store.delete('mob:' + (m | 0));
}
