// ============================================================================
//  Milville house directory — pure logic (no Cloudflare deps, testable)
//
//  THE POINT: visiting used to require the owner to be ONLINE. A guest sent
//  `hreq` over the socket and the owner's own client answered with `hdat`. No
//  client, no answer — so a cottage was only ever visitable while its owner
//  happened to be logged in, which is not what "leave the door unlocked" means.
//
//  So the house itself is published to the server. The owner pushes a snapshot
//  whenever something changes (the door, a room, a piece, a rearrange); anyone
//  can list the open ones and fetch a snapshot over plain HTTP, with the owner
//  asleep. The socket handshake stays for online owners because it is instant
//  and always current — this is the fallback that makes offline visiting work.
//
//  Storage keys (ctx.storage, same store shape as market.js / world_state.js):
//    house:<uid>  -> { uid, name, open, repair, rooms, slots, t }
//
//  A snapshot is PUBLIC READ-ONLY DATA. It carries the layout and the furniture
//  and nothing else: no inventory, no bank, no coins, no level. A visitor's
//  client already refuses to mutate a house it is a guest in, but the server
//  should not be handing out anything it does not have to either.
// ============================================================================

const MAX_NAME = 24;
const MAX_UID = 64;
const MAX_ROOMS = 64;          // the grid is 15 cells; this is slack, not a target
const MAX_SLOTS = 400;         // 12 rooms x ~6 hotspots is ~70
const STALE = 2592000000;      // 30 days — a house nobody has opened in a month drops off the list

const validUid = (s) => typeof s === 'string' && s.length > 0 && s.length <= MAX_UID;
const validKey = (s) => typeof s === 'string' && /^\d{1,2},\d{1,2}$/.test(s);
const validSlotKey = (s) => typeof s === 'string' && /^\d{1,2},\d{1,2}:[a-z0-9_]{1,24}$/.test(s);
const validId = (s) => typeof s === 'string' && /^[a-z0-9_]{1,40}$/.test(s);

// Copy only what a visitor needs, and only in shapes we recognise. A client is
// not trusted to send a sane object — this is the one place a hostile payload
// could otherwise be stored and then handed to every other player.
function sanitise(rooms, slots) {
  const r = {}, s = {};
  let nr = 0, ns = 0;
  for (const k in (rooms || {})) {
    if (nr >= MAX_ROOMS) break;
    if (!validKey(k) || !validId(rooms[k])) continue;
    r[k] = rooms[k]; nr++;
  }
  for (const k in (slots || {})) {
    if (ns >= MAX_SLOTS) break;
    if (!validSlotKey(k) || !validId(slots[k])) continue;
    s[k] = slots[k]; ns++;
  }
  return { rooms: r, slots: s };
}

// ============================================================================
//  PUBLISH — the owner pushes a snapshot. Called on any change worth sharing.
//  Publishing with open:false keeps the record (so re-opening is one call) but
//  drops it out of every listing immediately.
// ============================================================================
export async function publishHouse(store, now, { uid, name, open, rooms, slots, repair }) {
  if (!validUid(uid)) return { ok: false, error: 'bad uid' };
  // Reap stale records here, inside the write — never from a listing. market.js
  // learned that with board(): a sweep on an un-serialised GET let two concurrent
  // reads both act on the same expiring record.
  await sweepHouses(store, now);
  const clean = sanitise(rooms, slots);
  const rec = {
    uid,
    name: String(name || '?').slice(0, MAX_NAME),
    open: !!open,
    repair: Math.max(0, Math.min(9, repair | 0)),
    rooms: clean.rooms,
    slots: clean.slots,
    t: now(),
  };
  await store.put('house:' + uid, rec);
  return { ok: true, rooms: Object.keys(rec.rooms).length, slots: Object.keys(rec.slots).length };
}

// The owner locked up. Kept as a separate call so a client that only wants to
// shut the door does not have to re-send its whole layout.
export async function closeHouse(store, now, { uid }) {
  if (!validUid(uid)) return { ok: false, error: 'bad uid' };
  const rec = await store.get('house:' + uid);
  if (!rec) return { ok: true, missing: true };
  rec.open = false; rec.t = now();
  await store.put('house:' + uid, rec);
  return { ok: true };
}

// ============================================================================
//  LIST — every door standing open. A pure read: stale records are skipped
//  here and reclaimed by the sweep inside publish, never by a GET. (market.js
//  learned that the hard way — two concurrent reads both refunding an offer.)
// ============================================================================
export async function listHouses(store, now, { self } = {}) {
  const t = now();
  const all = await store.list({ prefix: 'house:' });
  const rows = [];
  for (const [, h] of all) {
    if (!h || !h.open) continue;
    if (t - (h.t || 0) > STALE) continue;
    if (self && h.uid === self) continue;         // you are never your own guest
    if (!(h.repair >= 3)) continue;               // a wreck has nothing to step into
    rows.push({ uid: h.uid, name: h.name, rooms: Object.keys(h.rooms || {}).length, t: h.t });
  }
  rows.sort((a, b) => b.t - a.t);
  return { ok: true, rows };
}

// ============================================================================
//  GET — one house's layout, for a visitor about to walk in.
// ============================================================================
export async function getHouse(store, now, { uid }) {
  if (!validUid(uid)) return { ok: false, error: 'bad uid' };
  const h = await store.get('house:' + uid);
  if (!h) return { ok: false, error: 'no such house' };
  if (!h.open) return { ok: false, error: 'locked' };
  if (!(h.repair >= 3)) return { ok: false, error: 'unfinished' };
  return { ok: true, uid: h.uid, name: h.name, rooms: h.rooms || {}, slots: h.slots || {}, repair: h.repair };
}

// Drop records nobody has touched in a month. Only ever called from inside a
// write, never from a listing.
export async function sweepHouses(store, now) {
  const t = now();
  const all = await store.list({ prefix: 'house:' });
  let dropped = 0;
  for (const [k, h] of all) {
    if (!h || t - (h.t || 0) > STALE) { await store.delete(k); dropped++; }
  }
  return dropped;
}

export const _internals = { STALE, MAX_ROOMS, MAX_SLOTS, sanitise };
