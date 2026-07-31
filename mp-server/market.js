// ============================================================================
//  Milville player market — pure order-book logic (no Cloudflare deps, testable)
//
//  A cross-server Grand Exchange for player-to-player trades of ANY item,
//  including boss drops the NPC exchange does not stock. Offers persist in the
//  Durable Object's ctx.storage so they survive hibernation AND let a buyer
//  match a seller who is offline.
//
//  ESCROW MODEL (dupe-safe, OSRS-style):
//    * Listing a SELL removes the item from the seller's pack (client side) and
//      the server holds the listing. When it matches, the seller is owed coins.
//    * Listing a BUY removes coins from the buyer's pack (client side) and the
//      server holds the listing. When it matches, the buyer is owed the item.
//    * Everything owed lands in the player's COLLECT box (server-side), claimed
//      later from the market tab. Nothing is created or destroyed by matching —
//      one side's escrow becomes the other side's payout.
//
//  Storage keys (all in ctx.storage, same store shape as world_state.js):
//    mkt:offer:<id>        -> offer object (see makeOffer)
//    mkt:collect:<uid>     -> array of pending payouts for that player
//    mkt:seq               -> monotonic offer-id counter
//
//  The store is an abstract async map: get(k) put(k,v) delete(k)
//  list({prefix}) -> Map, plus a now() clock. The DO wires ctx.storage +
//  Date.now; tests wire a Map-backed mock + a controllable clock.
//
//  A 2% sell tax (OSRS-style coin sink) is applied to the SELLER's proceeds at
//  match time. Buyers always pay their full listed price; sellers receive
//  price*(1 - TAX). The tax simply vanishes (a sink), which is the point.
// ============================================================================

const TAX = 0.02;                 // seller-side sell tax (coin sink)
const MAX_QTY = 2000000000;       // 2^31-ish clamp
const MAX_PRICE = 2000000000;
const MAX_OFFERS_PER_UID = 8;     // OSRS gives 8 GE slots; mirror that
const MAX_COLLECT = 400;          // cap on DISTINCT lines in a collect box (coins + identical
                                  // items merge, so a real player never approaches this)
const OFFER_TTL = 1209600000;     // 14 days; stale offers get GC'd on sweep

const clampInt = (v, hi) => Math.max(0, Math.min(hi | 0, v | 0));
const validSide = (s) => s === 'buy' || s === 'sell';
const validId = (s) => typeof s === 'string' && /^[a-z0-9_]{1,40}$/.test(s);
const validUid = (s) => typeof s === 'string' && s.length > 0 && s.length <= 64;

function makeOffer(seq, uid, name, side, item, qty, price, now) {
  return {
    id: seq,
    uid, name: String(name || '?').slice(0, 24),
    side,                 // 'buy' | 'sell'
    item,                 // item id string
    qty: clampInt(qty, MAX_QTY),        // remaining quantity
    orig: clampInt(qty, MAX_QTY),       // original quantity (for progress display)
    price: clampInt(price, MAX_PRICE),  // price PER ITEM, in coins
    made: now,
    t: now                // last-touched (for GC/sort)
  };
}

// ---- collect box helpers ---------------------------------------------------
async function _pushCollect(store, uid, payout) {
  const key = 'mkt:collect:' + uid;
  const box = (await store.get(key)) || [];
  // merge coin payouts and identical-item payouts so the box stays tidy
  _mergePayout(box, payout);
  await store.put(key, box);
}

// merge one payout into a payout list IN PLACE. Coins always merge into a single
// line; identical items merge; a brand-new distinct line past MAX_COLLECT is the
// only refusal (never TRUNCATE the array -- truncation silently destroyed real
// payouts). With the cap at 400 distinct lines this is effectively unreachable.
function _mergePayout(list, payout) {
  if (payout.coins) {
    const ex = list.find(p => p.coins !== undefined);
    if (ex) ex.coins += payout.coins; else list.push({ coins: payout.coins });
  }
  if (payout.item) {
    const ex = list.find(p => p.item === payout.item);
    if (ex) ex.qty += payout.qty;
    else if (list.length < MAX_COLLECT) list.push({ item: payout.item, qty: payout.qty });
  }
  return list;
}

// ============================================================================
//  LIST — create a new offer, immediately matching against the opposite book.
//  Returns { ok, id, matched, remaining, error }. The CALLER (client) has
//  already escrowed: for a sell the item left the pack; for a buy the coins did.
//  Matching moves escrow between the two parties' collect boxes.
// ============================================================================
export async function listOffer(store, now, { uid, name, side, item, qty, price }) {
  if (!validUid(uid)) return { ok: false, error: 'bad uid' };
  if (!validSide(side)) return { ok: false, error: 'bad side' };
  if (!validId(item)) return { ok: false, error: 'bad item' };
  qty = clampInt(qty, MAX_QTY); price = clampInt(price, MAX_PRICE);
  if (qty <= 0 || price <= 0) return { ok: false, error: 'bad qty/price' };

  // Reap expired offers FIRST, inside this serialized mutation (board() used to do
  // this on un-serialized GETs, which let two concurrent reads double-refund an
  // expiring offer; board is now a pure read and THIS is the only reaper).
  await _gcSweep(store, now);

  // ONE storage scan powers the slot cap, the id allocation and the matching.
  const all = await store.list({ prefix: 'mkt:offer:' });

  // per-uid slot cap
  let mineCount = 0, maxId = 0;
  for (const [, o] of all) {
    if (!o) continue;
    if (o.uid === uid) mineCount++;
    if ((o.id | 0) > maxId) maxId = o.id | 0;
  }
  if (mineCount >= MAX_OFFERS_PER_UID) return { ok: false, error: 'no free slots' };

  // ** COLLISION-PROOF id allocation. ** The old code trusted mkt:seq alone:
  //     seq = (get('mkt:seq')|0) + 1
  // If that key ever reads stale (lost write, storage migration, manual clear),
  // every new listing computes the SAME id and put() silently OVERWRITES another
  // player's resting offer -- their escrowed item is annihilated with no refund,
  // no board entry and no collect. That is the production bug that ate a player's
  // emberbrand. The id is now anchored to the offers that actually exist: even a
  // fully broken counter can never collide with a resting offer.
  let seq = Math.max((await store.get('mkt:seq')) | 0, maxId) + 1;
  await store.put('mkt:seq', seq);

  let offer = makeOffer(seq, uid, name, side, item, qty, price, now());
  let matched = 0;

  // match against the opposite side of the SAME item.
  // sell offer matches buys priced >= our ask, best (highest) buy first.
  // buy  offer matches sells priced <= our bid, best (lowest) sell first.
  const opp = [];
  for (const [, o] of all) {
    if (!o || o.item !== item || o.uid === uid) continue;
    if (side === 'sell' && o.side === 'buy' && o.price >= offer.price) opp.push(o);
    if (side === 'buy' && o.side === 'sell' && o.price <= offer.price) opp.push(o);
  }
  // best price for the incoming offer first; tie-break oldest (fairness/FIFO)
  opp.sort((a, b) => side === 'sell'
    ? (b.price - a.price) || (a.made - b.made)
    : (a.price - b.price) || (a.made - b.made));

  for (const o of opp) {
    if (offer.qty <= 0) break;
    const take = Math.min(offer.qty, o.qty);
    // trade executes at the RESTING order's price (standard order-book rule):
    // the party who was waiting gets their posted price; the taker gets price improvement.
    const execPrice = o.price;
    const buyerUid = side === 'buy' ? uid : o.uid;
    const sellerUid = side === 'sell' ? uid : o.uid;

    // seller is paid execPrice*take minus tax; buyer receives the item.
    const gross = execPrice * take;
    const net = Math.floor(gross * (1 - TAX));
    await _pushCollect(store, sellerUid, { coins: net });
    await _pushCollect(store, buyerUid, { item, qty: take });

    // buyer overpay refund: if the taker was a BUYER who bid above the exec price,
    // refund the difference (they escrowed at their bid; they only owe execPrice).
    if (side === 'buy' && offer.price > execPrice) {
      await _pushCollect(store, buyerUid, { coins: (offer.price - execPrice) * take });
    }

    offer.qty -= take; o.qty -= take; matched += take;
    if (o.qty <= 0) await store.delete('mkt:offer:' + o.id);
    else { o.t = now(); await store.put('mkt:offer:' + o.id, o); }
  }

  // whatever is left rests on the book. Belt-and-braces: if some fault still put a
  // DIFFERENT live offer at our id, step past it rather than destroy it.
  if (offer.qty > 0) {
    let key = 'mkt:offer:' + offer.id;
    let clash = await store.get(key);
    while (clash && clash.uid !== undefined && !(clash.uid === offer.uid && clash.made === offer.made)) {
      offer.id += 1; key = 'mkt:offer:' + offer.id;
      clash = await store.get(key);
    }
    if (offer.id >= seq) { seq = offer.id; await store.put('mkt:seq', seq); }
    offer.t = now(); await store.put(key, offer);
  }

  return { ok: true, id: offer.id, matched, remaining: offer.qty };
}

// ============================================================================
//  CANCEL — pull a resting offer. Returns what must be refunded to the owner's
//  collect box: unsold SELL items go back as items; unspent BUY coins go back.
// ============================================================================
export async function cancelOffer(store, now, { uid, id }) {
  const key = 'mkt:offer:' + (id | 0);
  const o = await store.get(key);
  if (!o) return { ok: false, error: 'no such offer' };
  if (o.uid !== uid) return { ok: false, error: 'not yours' };
  await store.delete(key);
  if (o.side === 'sell') await _pushCollect(store, uid, { item: o.item, qty: o.qty });
  else await _pushCollect(store, uid, { coins: o.qty * o.price });
  return { ok: true, refunded: o.side === 'sell' ? { item: o.item, qty: o.qty } : { coins: o.qty * o.price } };
}

// ============================================================================
//  COLLECT — hand the player everything owed and empty their box. The CLIENT
//  credits the returned payouts into the pack (items + coins). Returns the
//  list; server clears it so it cannot be double-claimed.
// ============================================================================
// TWO-PHASE delivery. The old collect() deleted the box and THEN returned it, so
// any lost/failed response burned every pending payout forever. Now: the box is
// MOVED to a pending-delivery record (with a nonce) and returned; the client
// credits the items and acks the nonce, which deletes the record. If the response
// is lost, the next collect RE-DELIVERS the same pending payouts -- nothing can be
// destroyed by a network failure.
export async function collect(store, { uid, twophase }) {
  const key = 'mkt:collect:' + uid, pkey = 'mkt:pending:' + uid;
  const box = (await store.get(key)) || [];
  if (!twophase) {
    // LEGACY one-shot path for old cached clients that will never send an ack:
    // re-delivering to them would double-credit on every click, which is worse
    // than the (pre-existing) lost-response window they already lived with.
    // Any pending record a NEW client left behind is included and cleared too.
    const prevL = await store.get(pkey);
    const out = (prevL && prevL.payouts) ? prevL.payouts : [];
    for (const p of box) _mergePayout(out, p);
    if (box.length) await store.delete(key);
    await store.delete(pkey);
    return { ok: true, payouts: out, nonce: '' };
  }
  const prev = await store.get(pkey);                 // an unacked earlier delivery, if any
  const payouts = (prev && prev.payouts) ? prev.payouts : [];
  for (const p of box) _mergePayout(payouts, p);      // fold the new box into the re-delivery
  if (box.length) await store.delete(key);
  if (!payouts.length) { await store.delete(pkey); return { ok: true, payouts: [], nonce: '' }; }
  const nonce = 'n' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  await store.put(pkey, { nonce, payouts });
  return { ok: true, payouts, nonce };
}

// The client credited everything from a delivery: clear it. Wrong/stale nonces
// are ignored (the pending record simply re-delivers next time).
export async function ackCollect(store, { uid, nonce }) {
  const pkey = 'mkt:pending:' + uid;
  const cur = await store.get(pkey);
  if (cur && cur.nonce === nonce) await store.delete(pkey);
  return { ok: true };
}

// ============================================================================
//  QUERY helpers for the client UI.
// ============================================================================
async function _offersByUid(store, uid) {
  const all = await store.list({ prefix: 'mkt:offer:' });
  const out = [];
  for (const [, o] of all) if (o && o.uid === uid) out.push(o);
  return out;
}

// Reap offers past OFFER_TTL, refunding each to its owner's collect box.
// ONLY ever called from inside the serialized mutation chain (listOffer): the old
// design ran this inside board() -- a plain GET outside the chain -- so two
// concurrent board reads could BOTH refund the same expiring offer (a dupe), or
// interleave with a listOffer that was mid-match against the offer being reaped.
async function _gcSweep(store, now) {
  const t = now();
  const all = await store.list({ prefix: 'mkt:offer:' });
  for (const [k, o] of all) {
    if (!o) { await store.delete(k); continue; }
    if (t - o.made > OFFER_TTL) {
      await store.delete(k);
      if (o.side === 'sell') await _pushCollect(store, o.uid, { item: o.item, qty: o.qty });
      else await _pushCollect(store, o.uid, { coins: o.qty * o.price });
    }
  }
}

// The public board: all resting offers, newest-touched first, optionally
// filtered to one item. A PURE READ: expired offers are skipped here and
// reclaimed by _gcSweep on the next serialized mutation.
export async function board(store, now, { item } = {}) {
  const t = now();
  const all = await store.list({ prefix: 'mkt:offer:' });
  const rows = [];
  for (const [, o] of all) {
    if (!o) continue;
    if (t - o.made > OFFER_TTL) continue;   // expired; the serialized sweep reclaims it
    if (item && o.item !== item) continue;
    rows.push({ id: o.id, uid: o.uid, name: o.name, side: o.side, item: o.item, qty: o.qty, price: o.price, made: o.made });
  }
  rows.sort((a, b) => b.made - a.made);
  return { ok: true, rows };
}

// A player's own state: their live offers + their collect box.
export async function mine(store, { uid }) {
  const offers = (await _offersByUid(store, uid)).map(o => ({
    id: o.id, side: o.side, item: o.item, qty: o.qty, orig: (o.orig!==undefined?o.orig:o.qty), price: o.price, made: o.made
  }));
  const box = ((await store.get('mkt:collect:' + uid)) || []).slice();
  const pend = await store.get('mkt:pending:' + uid);   // an unacked delivery still belongs to the player
  if (pend && pend.payouts) for (const p of pend.payouts) _mergePayout(box, p);
  return { ok: true, offers, collect: box };
}

export const _internals = { TAX, MAX_OFFERS_PER_UID, makeOffer };
