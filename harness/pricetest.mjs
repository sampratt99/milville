/* ============================================================================
   pricetest — the Construction economy (docs/23 §5).

   Three costs, three jobs:
     rooms    (coins)     the main gold sink, cheap to start and very dear to finish
     boards   (materials) the real cost of a piece
     fittings (coins)     9 x level^2.4 / 50, rounded to the nearest 50 — small
                          at first, steep at the top

   Rooms are FLAT, as in OSRS: there is no escalator. Stacking 35% per room turned
   eight rooms into nearly a million coins.

   Targets: a modest house, every room cheaply furnished,
   fully maxed ~11.5M, with the last three rooms 5.9M of that.

   Run: node harness/pricetest.mjs
   ========================================================================== */
import {runPass, Suite, PRELUDE} from './_lib.mjs';

const ROOM_COSTS = {
  parlour: 0, garden: 5000, workshop: 15000, kitchen: 40000, bedroom: 90000,
  games: 180000, study: 350000, combat: 650000, chapel: 950000,
  gallery: 1400000, costume: 1900000, portalrm: 2600000,
};

const T = runPass(PRELUDE + String.raw`
  o.rooms = {};
  for(const k in HOUSE_ROOMS) o.rooms[k] = HOUSE_ROOMS[k].cost | 0;
  o.roomOrder = HOUSE_ROOM_ORDER.slice();
  o.cells = HOUSE_GW * HOUSE_GH;
  o.slotCats = {};
  for(const k in HOUSE_ROOMS) o.slotCats[k] = HOUSE_ROOMS[k].slots.map(sl => sl.cat);

  o.furn = [];
  for(const fid in HOUSE_FURNITURE){
    const F = HOUSE_FURNITURE[fid];
    o.furn.push({fid, name: F.name, cat: F.cat, cost: F.cost | 0, req: F.req | 0,
                 planks: F.planks | 0, nails: F.nails | 0,
                 plankId: F.plankId || 'oak_plank', xp: F.xp | 0});
  }

  o.boardVal = {};
  for(const id of ['plank', 'oak_plank', 'willow_plank', 'birch_plank'])
    o.boardVal[id] = ITEMS[id] ? (ITEMS[id].val | 0) : 0;

  /* houseRoomCost is what the build path actually charges */
  o.chargedByFn = {};
  for(const k in HOUSE_ROOMS) o.chargedByFn[k] = houseRoomCost(k);

  /* THE ROOM COST IS FLAT — building the same room as the 1st or the 8th costs
     the same. Prove it against the real path, not just the table. */
  freshHouse();
  clearInv(); give('coins', 20000000);
  const cells = [[0,0],[2,0],[0,1],[2,1],[0,2],[1,2],[2,2]];
  const order = ['workshop','kitchen','bedroom','games','study','combat','chapel'];
  o.charged = [];
  for(let k = 0; k < order.length; k++){
    const before = coinsCount();
    houseBuildRoom(cells[k][0], cells[k][1], order[k]);
    o.charged.push({type: order[k], paid: before - coinsCount(), built: roomAt(cells[k][0], cells[k][1])});
    since();
  }
  if(inHouse) exitHouse();
  return o;
`);

const S = new Suite('pricetest').guard(T);

/* ---- rooms ---- */
S.eq('twelve room types priced',                  Object.keys(T.rooms).length, 12);
for(const [k, want] of Object.entries(ROOM_COSTS))
  S.eq(`${k} costs ${want.toLocaleString('en-US')}`, T.rooms[k], want);
S.eq('the parlour is free',                       T.rooms.parlour, 0);
S.ok('houseRoomCost() agrees with the table',
     Object.keys(T.rooms).every(k => T.chargedByFn[k] === T.rooms[k]));

/* the parlour is the entry room and always exists, so it is never on the menu */
S.eq('the picker offers every room type BUT the parlour, once each',
     T.roomOrder.slice().sort().join(','),
     Object.keys(T.rooms).filter(k => k !== 'parlour').sort().join(','));
S.ok('  and the parlour is not pickable',         !T.roomOrder.includes('parlour'));
/* 3x3 grid, 12 types: three must always be left out. */
S.eq('the house grid holds fifteen cells',        T.cells, 15);
S.ok('  SO EVERY ROOM TYPE FITS',                 T.cells >= Object.keys(T.rooms).length,
     `${Object.keys(T.rooms).length} types in ${T.cells} cells, ${T.cells - Object.keys(T.rooms).length} spare`);

/* the flat-cost rule, against the real build path */
for(const c of T.charged){
  S.eq(`${c.type} was built`,                     c.built, c.type);
  S.eq(`  and charged its flat table cost`,       c.paid, T.rooms[c.type]);
}
S.ok('NO ESCALATOR — the 7th room costs its table price, not a surcharge',
     T.charged.every(c => c.paid === T.rooms[c.type]));

/* ---- fittings: 9 x level^2.4 / 50, to the nearest 50 ----
   Three pieces are deliberately off the curve. The two bells are CHEAPER than
   the formula because the bell is what lets you hire staff at all — pricing it
   on the curve would gate the butlers behind the grind they exist to shorten. */
const fitting = L => Math.round(9 * Math.pow(L, 2.4) / 50) * 50;
const EXCEPT = ['hf_bell', 'hf_bellpull', 'hf_greatgate'];
const offFormula = T.furn.filter(f => f.cost !== fitting(f.req));
const unexpected = offFormula.filter(f => !EXCEPT.includes(f.fid));
S.eq('EVERY FITTINGS COST IS 9 x level^2.4 to the nearest 50, bar three',
     unexpected.length, 0);
if(unexpected.length)
  S.note(unexpected.slice(0, 6).map(f => `${f.fid} req${f.req} cost ${f.cost} want ${fitting(f.req)}`).join('; '));
S.eq('  and the three exceptions are the known ones',
     offFormula.map(f => f.fid).sort().join(','), EXCEPT.slice().sort().join(','));
for(const id of ['hf_bell', 'hf_bellpull']){
  const f = T.furn.find(x => x.fid === id);
  S.ok(`  ${id} is CHEAPER than the curve — the bell gates the butlers`,
       f && f.cost < fitting(f.req), f ? `${f.cost} vs ${fitting(f.req)}` : 'missing');
}
S.ok('fittings rise steeply with level',          fitting(99) > 20 * fitting(20),
     `level 20 = ${fitting(20)}, level 99 = ${fitting(99)}`);
S.ok('  and are trivial at the very bottom',      fitting(1) === 0, `level 1 = ${fitting(1)}`);

/* ---- boards are the real cost of a piece ---- */
const boardCost = f => f.planks * (T.boardVal[f.plankId] || 0);
const materialLed = T.furn.filter(f => f.planks > 0 && boardCost(f) > f.cost);
S.ok('for the dearest pieces the BOARDS outweigh the fittings',
     materialLed.length > 0,
     `${materialLed.length} of ${T.furn.length} pieces cost more in boards than in coins`);

/* ---- the totals ----
   EVERY room now fits — the grid is 15 cells for 12 types — so "maxed" is no
   longer a choice between them: it is all twelve with the best piece in every
   hotspot. Costed as rooms + fittings + boards at board value. */
const best = {}, cheapest = {};
for(const f of T.furn){
  if(!best[f.cat] || f.req > best[f.cat].req) best[f.cat] = f;
  if(!cheapest[f.cat] || f.req < cheapest[f.cat].req) cheapest[f.cat] = f;
}
const ALL = Object.keys(T.rooms);
const total = (rooms, pick) => {
  let n = 0;
  for(const rk of rooms){
    n += T.rooms[rk];
    for(const cat of T.slotCats[rk]){ const f = pick[cat]; if(f) n += f.cost + boardCost(f); }
  }
  return n;
};
const maxed = total(ALL, best);
const cheap = total(ALL, cheapest);
const roomsOnly = ALL.reduce((n, r) => n + T.rooms[r], 0);
const modestRooms = ['parlour', 'garden', 'workshop'];
const modest = total(modestRooms, cheapest);

S.note(`ALL TWELVE rooms, rooms only:       ${(roomsOnly / 1e6).toFixed(2)}M`);
S.note(`  + best of every piece (maxed):     ${(maxed / 1e6).toFixed(2)}M`);
S.note(`  + cheapest of every piece:         ${(cheap / 1e6).toFixed(2)}M`);
S.note(`parlour+garden+workshop, cheap:      ${Math.round(modest / 1000)}k`);
S.note('these are the figures docs/23 §5 quotes; they move whenever a room or a piece is repriced');

S.eq('the room bill for all twelve is 8.18M',     roomsOnly, 8180000);
S.ok('a maxed house is a multi-million-gold project', maxed > 8e6, `${(maxed / 1e6).toFixed(2)}M`);
S.ok('  and furnishing costs more than the rooms do', maxed - roomsOnly > roomsOnly * 0.5,
     `${((maxed - roomsOnly) / 1e6).toFixed(2)}M of furniture vs ${(roomsOnly / 1e6).toFixed(2)}M of rooms`);
S.ok('cheap furnishing is far cheaper than maxing', cheap < maxed * 0.75,
     `${(cheap / 1e6).toFixed(2)}M vs ${(maxed / 1e6).toFixed(2)}M`);
S.ok('a starter house is under 200k',             modest < 200000, `${Math.round(modest / 1000)}k`);

const lastThree = T.rooms.gallery + T.rooms.costume + T.rooms.portalrm;
S.ok('THE LAST THREE ROOMS ARE 5.9M OF IT',       Math.abs(lastThree - 5900000) < 1,
     `${(lastThree / 1e6).toFixed(2)}M`);
const roomTotal = Object.values(T.rooms).reduce((a, b) => a + b, 0);
S.ok('  which is over half of all room cost',     lastThree > roomTotal / 2,
     `${(lastThree / 1e6).toFixed(2)}M of ${(roomTotal / 1e6).toFixed(2)}M`);

S.report(
  'Room costs are flat and charged as tabled; every fittings cost matches 9 x level^2.4 to the nearest 50.',
  'whether the totals feel like the right grind — that is 38 boss runs of playtesting.');
