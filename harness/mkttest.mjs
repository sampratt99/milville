/* ============================================================================
   mkttest — mp-server/market.js, the player order book.

   THIS IS THE ONE PLACE THE SERVER HOLDS SOMETHING A PLAYER CAN LOSE. The client
   escrows the item out of the pack before the server replies, so a fault here is
   not a wrong number on a screen — it is a boss drop that no longer exists.

   Like world_state.js this file takes no Cloudflare imports: pure functions over
   an abstract store and an injected clock. No shim, no game.

   The four safety properties from docs/16 §13 each get a section:
     1. collision-proof offer ids (the bug that ate a player's emberbrand)
     2. the GC sweep runs only inside the serialized mutation
     3. two-phase collect, with its legacy path
     4. (the write-confirm guard lives in server.js, not here)

   Run: node harness/mkttest.mjs
   ========================================================================== */
import {Suite} from './_lib.mjs';
import {listOffer, cancelOffer, collect, ackCollect, board, mine, _internals}
  from '../mp-server/market.js';

function makeStore(){
  const m = new Map();
  return {
    _m: m,
    async get(k){ return m.get(k); },
    async put(k, v){ m.set(k, v); },
    async delete(k){ return m.delete(k); },
    async list({prefix} = {}){
      const out = new Map();
      for(const [k, v] of m) if(!prefix || k.startsWith(prefix)) out.set(k, v);
      return out;
    },
  };
}
let CLOCK = 1000000;
const now = () => CLOCK;
const S = new Suite('mkttest');

const TAX = _internals.TAX;
const SLOTS = _internals.MAX_OFFERS_PER_UID;
const coinsIn = box => (box.find(p => p.coins !== undefined) || {}).coins || 0;
const itemsIn = (box, id) => (box.find(p => p.item === id) || {}).qty || 0;
const boxOf = async (st, uid) => (await st.get('mkt:collect:' + uid)) || [];

/* ---- validation ---------------------------------------------------------- */
{
  const st = makeStore();
  const bad = [
    ['bad uid',       {uid: '',    side: 'sell', item: 'logs', qty: 1, price: 1}],
    ['bad side',      {uid: 'a',   side: 'nope', item: 'logs', qty: 1, price: 1}],
    ['bad item',      {uid: 'a',   side: 'sell', item: 'Logs!', qty: 1, price: 1}],
    ['zero qty',      {uid: 'a',   side: 'sell', item: 'logs', qty: 0, price: 1}],
    ['zero price',    {uid: 'a',   side: 'sell', item: 'logs', qty: 1, price: 0}],
    ['negative qty',  {uid: 'a',   side: 'sell', item: 'logs', qty: -5, price: 1}],
  ];
  let allRefused = true;
  for(const [, o] of bad){ const r = await listOffer(st, now, o); if(r.ok) allRefused = false; }
  S.ok('every malformed listing is refused',      allRefused);
  S.eq('  and nothing rests on the book',         st._m.size, 0);
}

/* ---- a resting offer ----------------------------------------------------- */
{
  const st = makeStore();
  CLOCK = 1000;
  const r = await listOffer(st, now, {uid: 'alice', name: 'Alice', side: 'sell', item: 'emberbrand', qty: 1, price: 500000});
  S.ok('a sell with no counterparty rests',       r.ok);
  S.eq('  matching nothing',                      r.matched, 0);
  S.eq('  with its full quantity remaining',      r.remaining, 1);
  const b = await board(st, now, {});
  S.eq('  and appears on the board',              b.rows.length, 1);
  S.eq('  with the seller named',                 b.rows[0].name, 'Alice');
  const m = await mine(st, {uid: 'alice'});
  S.eq('  and in the seller’s own list',     m.offers.length, 1);
  S.eq('  whose collect box is still empty',      m.collect.length, 0);
}

/* ---- MATCHING and the tax ------------------------------------------------ */
{
  const st = makeStore();
  CLOCK = 1000;
  await listOffer(st, now, {uid: 'seller', name: 'S', side: 'sell', item: 'logs', qty: 10, price: 100});
  const r = await listOffer(st, now, {uid: 'buyer', name: 'B', side: 'buy', item: 'logs', qty: 10, price: 100});
  S.eq('a matching buy fills completely',         r.matched, 10);
  S.eq('  leaving nothing to rest',               r.remaining, 0);

  const sBox = await boxOf(st, 'seller'), bBox = await boxOf(st, 'buyer');
  const gross = 10 * 100;
  S.eq('THE BUYER IS OWED THE ITEMS',             itemsIn(bBox, 'logs'), 10);
  S.eq('THE SELLER IS OWED COINS MINUS TAX',      coinsIn(sBox), Math.floor(gross * (1 - TAX)));
  S.eq('  which is 2% off',                       coinsIn(sBox), 980);
  S.eq('  and the buyer is charged nothing extra', coinsIn(bBox), 0);
  S.eq('the book is empty afterwards',            (await board(st, now, {})).rows.length, 0);

  /* CONSERVATION: the only value that leaves the system is the tax */
  const taxTaken = gross - coinsIn(sBox);
  S.eq('THE TAX IS THE ONLY LEAK',                taxTaken, 20);
  S.ok('  and it vanishes rather than going to anyone',
       coinsIn(sBox) + coinsIn(bBox) + taxTaken === gross,
       `${coinsIn(sBox)} + ${coinsIn(bBox)} + ${taxTaken} = ${gross}`);
}

/* ---- price/time priority and the resting price --------------------------- */
{
  const st = makeStore();
  CLOCK = 1000;
  await listOffer(st, now, {uid: 'b1', name: 'B1', side: 'buy', item: 'logs', qty: 5, price: 100});
  CLOCK = 2000;
  await listOffer(st, now, {uid: 'b2', name: 'B2', side: 'buy', item: 'logs', qty: 5, price: 120});
  CLOCK = 3000;
  await listOffer(st, now, {uid: 'b3', name: 'B3', side: 'buy', item: 'logs', qty: 5, price: 120});
  CLOCK = 4000;
  const r = await listOffer(st, now, {uid: 's', name: 'S', side: 'sell', item: 'logs', qty: 5, price: 90});
  S.eq('a seller fills against the BEST buy',     r.matched, 5);
  S.eq('  b2 got filled (best price, oldest of the tie)', itemsIn(await boxOf(st, 'b2'), 'logs'), 5);
  S.eq('  b3 did not',                            itemsIn(await boxOf(st, 'b3'), 'logs'), 0);
  S.eq('  nor the cheaper b1',                    itemsIn(await boxOf(st, 'b1'), 'logs'), 0);
  S.eq('THE TRADE EXECUTES AT THE RESTING PRICE', coinsIn(await boxOf(st, 's')),
       Math.floor(5 * 120 * (1 - TAX)));
  S.ok('  so the taker gets the price improvement, not the resting order',
       coinsIn(await boxOf(st, 's')) > Math.floor(5 * 90 * (1 - TAX)));
}
{
  /* a BUYER who bids above the resting ask is refunded the difference */
  const st = makeStore();
  CLOCK = 1000;
  await listOffer(st, now, {uid: 's', name: 'S', side: 'sell', item: 'logs', qty: 4, price: 50});
  const r = await listOffer(st, now, {uid: 'b', name: 'B', side: 'buy', item: 'logs', qty: 4, price: 80});
  S.eq('an overbidding buyer fills',              r.matched, 4);
  const bBox = await boxOf(st, 'b');
  S.eq('  receives the items',                    itemsIn(bBox, 'logs'), 4);
  S.eq('  AND IS REFUNDED THE OVERPAY',           coinsIn(bBox), (80 - 50) * 4);
  S.eq('  while the seller gets their own ask minus tax', coinsIn(await boxOf(st, 's')),
       Math.floor(4 * 50 * (1 - TAX)));
}
{
  /* partial fills leave the remainder resting */
  const st = makeStore();
  CLOCK = 1000;
  await listOffer(st, now, {uid: 's', name: 'S', side: 'sell', item: 'logs', qty: 3, price: 10});
  const r = await listOffer(st, now, {uid: 'b', name: 'B', side: 'buy', item: 'logs', qty: 10, price: 10});
  S.eq('a partial fill matches what it can',      r.matched, 3);
  S.eq('  and rests the remainder',               r.remaining, 7);
  const rows = (await board(st, now, {})).rows;
  S.eq('  which is on the book',                  rows.length, 1);
  S.eq('  at the reduced quantity',               rows[0].qty, 7);
}
{
  /* you never match your own offer */
  const st = makeStore();
  CLOCK = 1000;
  await listOffer(st, now, {uid: 'me', name: 'M', side: 'sell', item: 'logs', qty: 5, price: 10});
  const r = await listOffer(st, now, {uid: 'me', name: 'M', side: 'buy', item: 'logs', qty: 5, price: 99});
  S.eq('YOU CANNOT TRADE WITH YOURSELF',          r.matched, 0);
  S.eq('  both offers rest',                      (await board(st, now, {})).rows.length, 2);
}
{
  /* the price gate: a sell above every bid rests */
  const st = makeStore();
  CLOCK = 1000;
  await listOffer(st, now, {uid: 'b', name: 'B', side: 'buy', item: 'logs', qty: 5, price: 10});
  const r = await listOffer(st, now, {uid: 's', name: 'S', side: 'sell', item: 'logs', qty: 5, price: 11});
  S.eq('a sell above the best bid does not match', r.matched, 0);
  S.eq('  and a different item never matches',
       (await listOffer(st, now, {uid: 's2', name: 'S', side: 'sell', item: 'coal', qty: 5, price: 1})).matched, 0);
}

/* ---- 1. COLLISION-PROOF IDS (the emberbrand bug) ------------------------- */
{
  const st = makeStore();
  CLOCK = 1000;
  const a = await listOffer(st, now, {uid: 'alice', name: 'A', side: 'sell', item: 'emberbrand', qty: 1, price: 500000});
  S.ok('alice has a resting offer',               a.ok && a.remaining === 1);
  const aliceKey = 'mkt:offer:' + a.id;
  S.ok('  stored under her id',                   !!st._m.get(aliceKey));

  /* THE FAULT: the sequence counter reads stale — a lost write, a migration, a
     manual clear. The old code computed seq = (mkt:seq|0)+1 and put() straight
     over whatever was there. */
  await st.put('mkt:seq', 0);

  const b = await listOffer(st, now, {uid: 'bob', name: 'B', side: 'sell', item: 'logs', qty: 5, price: 10});
  S.ok('bob can still list with a broken counter', b.ok);
  S.ok('  AND IS GIVEN A DIFFERENT ID',           b.id !== a.id, `alice ${a.id}, bob ${b.id}`);
  const aliceStill = await st.get(aliceKey);
  S.ok('ALICE’S OFFER IS NOT OVERWRITTEN',   !!aliceStill,
       'this is the production bug that annihilated a player’s escrowed emberbrand');
  S.eq('  and is still hers',                     aliceStill && aliceStill.uid, 'alice');
  S.eq('  still the emberbrand',                  aliceStill && aliceStill.item, 'emberbrand');
  S.eq('  both offers on the board',              (await board(st, now, {})).rows.length, 2);
}
S.note('the id is protected TWICE over — anchoring seq to max(seq, maxExistingId) AND a clash loop ' +
       'that steps past any live offer at the target key. Removing either alone still holds; only ' +
       'removing BOTH lets alice\'s emberbrand become bob\'s logs. Defence in depth, verified by ' +
       'sabotaging both.');
{
  /* even with a live offer already squatting the target id, listing steps past it */
  const st = makeStore();
  CLOCK = 1000;
  await st.put('mkt:offer:1', {id: 1, uid: 'victim', name: 'V', side: 'sell',
                               item: 'emberbrand', qty: 1, price: 999, made: 1, t: 1, orig: 1});
  await st.put('mkt:seq', 0);
  const r = await listOffer(st, now, {uid: 'newcomer', name: 'N', side: 'sell', item: 'logs', qty: 1, price: 5});
  S.ok('a squatted id is stepped past',           r.ok && r.id !== 1, `got id ${r.id}`);
  const victim = await st.get('mkt:offer:1');
  S.ok('  and the squatter survives intact',      victim && victim.uid === 'victim');
  S.eq('  with its item',                         victim && victim.item, 'emberbrand');
}

/* ---- the per-uid slot cap ------------------------------------------------ */
{
  const st = makeStore();
  CLOCK = 1000;
  for(let k = 0; k < SLOTS; k++)
    await listOffer(st, now, {uid: 'a', name: 'A', side: 'sell', item: 'logs', qty: 1, price: 10 + k});
  const over = await listOffer(st, now, {uid: 'a', name: 'A', side: 'sell', item: 'logs', qty: 1, price: 99});
  S.eq(`a player gets ${SLOTS} slots, like OSRS`,  (await mine(st, {uid: 'a'})).offers.length, SLOTS);
  S.eq('  and the ninth is refused',              over.ok, false);
  S.eq('  with a reason',                         over.error, 'no free slots');
  const other = await listOffer(st, now, {uid: 'b', name: 'B', side: 'sell', item: 'logs', qty: 1, price: 99});
  S.ok('  while another player is unaffected',    other.ok);
}

/* ---- CANCEL: escrow comes back ------------------------------------------- */
{
  const st = makeStore();
  CLOCK = 1000;
  const sell = await listOffer(st, now, {uid: 'a', name: 'A', side: 'sell', item: 'logs', qty: 7, price: 10});
  const c = await cancelOffer(st, now, {uid: 'a', id: sell.id});
  S.ok('cancelling a sell succeeds',              c.ok);
  S.eq('  returning the unsold ITEMS',            itemsIn(await boxOf(st, 'a'), 'logs'), 7);
  S.eq('  and clearing the book',                 (await board(st, now, {})).rows.length, 0);

  const buy = await listOffer(st, now, {uid: 'b', name: 'B', side: 'buy', item: 'logs', qty: 4, price: 25});
  await cancelOffer(st, now, {uid: 'b', id: buy.id});
  S.eq('cancelling a buy returns the COINS',      coinsIn(await boxOf(st, 'b')), 4 * 25);

  const other = await listOffer(st, now, {uid: 'c', name: 'C', side: 'sell', item: 'logs', qty: 1, price: 5});
  const theft = await cancelOffer(st, now, {uid: 'thief', id: other.id});
  S.eq('YOU CANNOT CANCEL SOMEONE ELSE’S OFFER', theft.ok, false);
  S.eq('  with a reason',                         theft.error, 'not yours');
  S.ok('  and it still rests',                    !!(await st.get('mkt:offer:' + other.id)));
  S.eq('cancelling a missing offer is refused',   (await cancelOffer(st, now, {uid: 'a', id: 9999})).ok, false);
}

/* ---- 2. THE GC SWEEP RUNS ONLY IN THE SERIALIZED MUTATION ---------------- */
{
  const st = makeStore();
  CLOCK = 1000;
  const old = await listOffer(st, now, {uid: 'a', name: 'A', side: 'sell', item: 'logs', qty: 3, price: 10});
  CLOCK = 1000 + 1209600000 + 1;                 /* one ms past the 14-day TTL */

  const b1 = await board(st, now, {});
  S.eq('an expired offer is hidden from the board', b1.rows.length, 0);
  S.ok('  BUT board() DOES NOT REFUND IT',        !!(await st.get('mkt:offer:' + old.id)),
       'board is a pure read; two concurrent reads used to BOTH refund an expiring offer');
  S.eq('  so no payout has appeared',             (await boxOf(st, 'a')).length, 0);

  const b2 = await board(st, now, {});
  S.eq('  and reading twice still refunds nothing', (await boxOf(st, 'a')).length, 0);
  S.eq('  still hidden',                          b2.rows.length, 0);

  /* the sweep happens on the next serialized mutation */
  await listOffer(st, now, {uid: 'z', name: 'Z', side: 'sell', item: 'coal', qty: 1, price: 1});
  S.eq('THE NEXT LISTING SWEEPS AND REFUNDS ONCE', itemsIn(await boxOf(st, 'a'), 'logs'), 3);
  S.eq('  removing the dead key',                 st._m.has('mkt:offer:' + old.id), false);

  /* and it does not refund a second time */
  await listOffer(st, now, {uid: 'z', name: 'Z', side: 'sell', item: 'coal', qty: 1, price: 2});
  S.eq('  a later sweep does not double-refund',  itemsIn(await boxOf(st, 'a'), 'logs'), 3);
}
{
  /* an expired BUY refunds coins, not items */
  const st = makeStore();
  CLOCK = 1000;
  await listOffer(st, now, {uid: 'a', name: 'A', side: 'buy', item: 'logs', qty: 6, price: 20});
  CLOCK = 1000 + 1209600000 + 1;
  await listOffer(st, now, {uid: 'z', name: 'Z', side: 'sell', item: 'coal', qty: 1, price: 1});
  S.eq('an expired buy refunds coins',            coinsIn(await boxOf(st, 'a')), 6 * 20);
}

/* ---- 3. TWO-PHASE COLLECT ------------------------------------------------ */
{
  const st = makeStore();
  CLOCK = 1000;
  await listOffer(st, now, {uid: 's', name: 'S', side: 'sell', item: 'logs', qty: 5, price: 100});
  await listOffer(st, now, {uid: 'b', name: 'B', side: 'buy', item: 'logs', qty: 5, price: 100});

  const d1 = await collect(st, {uid: 'b', twophase: true});
  S.eq('a two-phase collect returns the payouts', itemsIn(d1.payouts, 'logs'), 5);
  S.ok('  with a nonce',                          !!d1.nonce);
  S.eq('  and empties the box',                   (await boxOf(st, 'b')).length, 0);
  S.ok('  but keeps a pending record',            !!(await st.get('mkt:pending:b')));

  /* THE LOST RESPONSE: the client never acked, so the same payout re-delivers */
  const d2 = await collect(st, {uid: 'b', twophase: true});
  S.eq('A LOST RESPONSE RE-DELIVERS, NEVER DESTROYS', itemsIn(d2.payouts, 'logs'), 5);
  S.ok('  under a fresh nonce',                   d2.nonce !== d1.nonce);

  /* an old nonce must not clear the current delivery */
  await ackCollect(st, {uid: 'b', nonce: d1.nonce});
  S.ok('a STALE nonce does not clear the record', !!(await st.get('mkt:pending:b')),
       'acking with the old nonce would otherwise drop a payout the client never received');
  await ackCollect(st, {uid: 'b', nonce: d2.nonce});
  S.eq('  the current nonce does',                await st.get('mkt:pending:b'), undefined);
  const d3 = await collect(st, {uid: 'b', twophase: true});
  S.eq('  and nothing is left to collect',        d3.payouts.length, 0);
}
{
  /* mine() shows an unacked delivery: it still belongs to the player */
  const st = makeStore();
  CLOCK = 1000;
  await listOffer(st, now, {uid: 's', name: 'S', side: 'sell', item: 'logs', qty: 2, price: 50});
  await listOffer(st, now, {uid: 'b', name: 'B', side: 'buy', item: 'logs', qty: 2, price: 50});
  await collect(st, {uid: 'b', twophase: true});
  const m = await mine(st, {uid: 'b'});
  S.eq('an undelivered payout still shows in mine()', itemsIn(m.collect, 'logs'), 2,
       'otherwise the player sees an empty box holding their items');
}
{
  /* the LEGACY one-shot path, for old cached clients that never ack */
  const st = makeStore();
  CLOCK = 1000;
  await listOffer(st, now, {uid: 's', name: 'S', side: 'sell', item: 'logs', qty: 3, price: 10});
  await listOffer(st, now, {uid: 'b', name: 'B', side: 'buy', item: 'logs', qty: 3, price: 10});
  const one = await collect(st, {uid: 'b', twophase: false});
  S.eq('the legacy path delivers',                itemsIn(one.payouts, 'logs'), 3);
  S.eq('  with no nonce',                         one.nonce, '');
  const again = await collect(st, {uid: 'b', twophase: false});
  S.eq('  AND DOES NOT RE-DELIVER',               again.payouts.length, 0,
       're-delivering to a client that never acks would double-credit on every click');
}
{
  /* a new client's pending record is swept up by a legacy collect too */
  const st = makeStore();
  CLOCK = 1000;
  await listOffer(st, now, {uid: 's', name: 'S', side: 'sell', item: 'logs', qty: 4, price: 10});
  await listOffer(st, now, {uid: 'b', name: 'B', side: 'buy', item: 'logs', qty: 4, price: 10});
  await collect(st, {uid: 'b', twophase: true});      /* unacked */
  const legacy = await collect(st, {uid: 'b', twophase: false});
  S.eq('a legacy collect picks up an unacked delivery', itemsIn(legacy.payouts, 'logs'), 4);
  S.eq('  and clears it',                         await st.get('mkt:pending:b'), undefined);
}

/* ---- payouts merge rather than pile up ----------------------------------- */
{
  const st = makeStore();
  CLOCK = 1000;
  for(let k = 0; k < 5; k++){
    await listOffer(st, now, {uid: 's' + k, name: 'S', side: 'sell', item: 'logs', qty: 2, price: 10});
    await listOffer(st, now, {uid: 'b', name: 'B', side: 'buy', item: 'logs', qty: 2, price: 10});
  }
  const box = await boxOf(st, 'b');
  S.eq('five separate fills merge into one line', box.length, 1);
  S.eq('  totalling every fill',                  itemsIn(box, 'logs'), 10);

  const sboxes = [];
  for(let k = 0; k < 5; k++) sboxes.push(coinsIn(await boxOf(st, 's' + k)));
  S.ok('  and each seller is paid separately',    sboxes.every(v => v === Math.floor(20 * (1 - TAX))),
       sboxes.join(', '));
}

/* ---- board filtering ----------------------------------------------------- */
{
  const st = makeStore();
  CLOCK = 1000;
  await listOffer(st, now, {uid: 'a', name: 'A', side: 'sell', item: 'logs', qty: 1, price: 10});
  await listOffer(st, now, {uid: 'a', name: 'A', side: 'sell', item: 'coal', qty: 1, price: 10});
  S.eq('the board lists everything by default',   (await board(st, now, {})).rows.length, 2);
  S.eq('  and filters to one item',               (await board(st, now, {item: 'logs'})).rows.length, 1);
  S.eq('mine() is scoped to one player',          (await mine(st, {uid: 'nobody'})).offers.length, 0);
}

S.note(`tax ${TAX * 100}% seller-side, ${SLOTS} slots per player, 14-day offer TTL`);

S.report(
  'Escrow is conserved: matching moves value between collect boxes and the only leak is the 2% seller tax. Offer ids cannot collide even with a broken counter, board() never refunds, and a lost collect response re-delivers instead of destroying.',
  'that a real Durable Object serializes the way server.js assumes — ctx.storage is mocked, so coalesced writes, the write-confirm guard and the promise chain are not exercised here.');
