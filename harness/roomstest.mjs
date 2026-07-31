/* ============================================================================
   roomstest — the HOUSE_ROOMS table itself (docs/23 §3).

   Twelve rooms, each {name, cost, floor, seam, inlay, rail, panel, slots[]}.
   The colours are what make rooms read apart at a glance; a missing one falls
   back to a default and two rooms start looking the same.

   Costs are flat, as in OSRS — no escalator. pricetest proves what is CHARGED;
   this proves the table those charges come from.

   Run: node harness/roomstest.mjs
   ========================================================================== */
import {runPass, Suite, PRELUDE} from './_lib.mjs';

const T = runPass(PRELUDE + String.raw`
  const keys = Object.keys(HOUSE_ROOMS);
  o.count = keys.length;
  o.order = (typeof HOUSE_ROOM_ORDER !== 'undefined') ? HOUSE_ROOM_ORDER.slice() : null;

  o.rows = keys.map(k => {
    const R = HOUSE_ROOMS[k];
    return {k, name: R.name, cost: R.cost | 0,
            floor: R.floor, seam: R.seam, inlay: R.inlay, rail: R.rail, panel: R.panel,
            slots: R.slots ? R.slots.length : 0,
            slotIds: R.slots ? R.slots.map(s => s.id) : [],
            labels: R.slots ? R.slots.map(s => s.label) : [],
            style: HOUSE_FLOORS[k] || null};
  });

  o.bad = {noName: [], noSlots: [], dupSlotId: [], noLabel: [], missingColour: [], badCost: []};
  const COLOURS = ['floor', 'seam', 'inlay', 'rail', 'panel'];
  for(const r of o.rows){
    if(!r.name) o.bad.noName.push(r.k);
    if(!r.slots) o.bad.noSlots.push(r.k);
    if(new Set(r.slotIds).size !== r.slotIds.length) o.bad.dupSlotId.push(r.k);
    if(r.labels.some(l => !l)) o.bad.noLabel.push(r.k);
    for(const c of COLOURS)
      if(typeof r[c] !== 'number' || r[c] < 0 || r[c] > 0xffffff) o.bad.missingColour.push(r.k + '.' + c);
    if(r.cost < 0) o.bad.badCost.push(r.k);
  }

  /* names are unique, and so are the palettes: two rooms must not look identical */
  o.dupNames = o.rows.map(r => r.name).filter((n, i, a) => a.indexOf(n) !== i);
  const palette = r => [r.floor, r.seam, r.inlay, r.rail, r.panel].join(',');
  const seen = {};
  o.dupPalettes = [];
  for(const r of o.rows){
    const p = palette(r);
    if(seen[p]) o.dupPalettes.push(seen[p] + '/' + r.k);
    else seen[p] = r.k;
  }

  /* the free room is the entry room, and it is the only free one */
  o.freeRooms = o.rows.filter(r => r.cost === 0).map(r => r.k);
  o.entryType = HOUSE_ROOMS[roomAt(HOUSE_ENTRY.gx, HOUSE_ENTRY.gy) || 'parlour'] ? 'parlour' : null;

  /* the shipped price ladder, cheapest first */
  o.ladder = o.rows.slice().sort((a, b) => a.cost - b.cost).map(r => [r.k, r.cost]);
  o.strictlyRising = o.ladder.every((r, i) => i === 0 || r[1] > o.ladder[i-1][1] || r[1] === 0);

  /* the last three rooms carry most of the cost */
  const costs = o.rows.map(r => r.cost).sort((a, b) => b - a);
  o.total = costs.reduce((a, b) => a + b, 0);
  o.topThree = costs.slice(0, 3).reduce((a, b) => a + b, 0);

  /* every room type is reachable through the picker somewhere on the grid */
  o.unofferable = [];
  for(const k of keys){
    let offered = false;
    for(let gy = 0; gy < HOUSE_GH; gy++) for(let gx = 0; gx < HOUSE_GW; gx++){
      player.house = {owned:true, repair:POH_REPAIR_STEPS.length, rooms:{}, slots:{}, slotsV2:1};
      player.house.rooms[HOUSE_ENTRY.gx + ',' + HOUSE_ENTRY.gy] = 'parlour';
      if(houseRoomChoices(gx, gy).includes(k)) offered = true;
    }
    if(!offered) o.unofferable.push(k);
  }
  return o;
`);

const S = new Suite('roomstest').guard(T);
const rows = T.rows || [];

S.eq('twelve room types',                         T.count, 12);
/* The parlour is the free entry room and is always pre-built, so it is correctly
   absent from the picker's order list and never offered as a choice. */
S.ok('HOUSE_ROOM_ORDER lists every BUILDABLE room', T.order && T.order.length === T.count - 1,
     T.order ? `${T.order.length} buildable of ${T.count} types` : 'no HOUSE_ROOM_ORDER');
S.eq('  and the one it omits is the parlour',     (T.order || []).includes('parlour'), false);
S.eq('  naming nothing that does not exist',
     (T.order || []).filter(k => !rows.some(r => r.k === k)).length, 0);

S.eq('every room has a name',                     T.bad.noName.length, 0);
S.eq('every room has hotspots',                   T.bad.noSlots.length, 0);
S.eq('no room repeats a slot id',                 T.bad.dupSlotId.length, 0);
if(T.bad.dupSlotId.length) S.note(T.bad.dupSlotId.join(', '));
S.eq('EVERY HOTSPOT HAS A LABEL',                 T.bad.noLabel.length, 0);
if(T.bad.noLabel.length) S.note('the examine text reads "Bare floorboards — <label>"');
S.eq('every room has all five colours',           T.bad.missingColour.length, 0);
if(T.bad.missingColour.length) S.note(T.bad.missingColour.join(', '));
S.eq('no room costs less than nothing',           T.bad.badCost.length, 0);

S.eq('room names are unique',                     T.dupNames.length, 0);
if(T.dupNames.length) S.note(T.dupNames.join(', '));
S.eq('NO TWO ROOMS SHARE A PALETTE',              T.dupPalettes.length, 0);
if(T.dupPalettes.length) S.note('identical: ' + T.dupPalettes.join(', '));

S.eq('exactly one room is free',                  T.freeRooms.length, 1);
S.eq('  and it is the parlour',                   T.freeRooms[0], 'parlour');
S.ok('every room type has a floor style',         rows.every(r => r.style), 
     rows.filter(r => !r.style).map(r => r.k).join(', '));

S.ok('the price ladder rises without ties',       T.strictlyRising,
     T.ladder.map(([k, c]) => `${k} ${c}`).join(' < '));
S.ok('the last three rooms are most of the cost', T.topThree / T.total > 0.5,
     `${T.topThree.toLocaleString()} of ${T.total.toLocaleString()} (${Math.round(T.topThree / T.total * 100)}%)`);

S.eq('EVERY BUILDABLE ROOM CAN BE OFFERED',       T.unofferable.filter(k => k !== 'parlour').length, 0);
if(T.unofferable.filter(k => k !== 'parlour').length) S.note(T.unofferable.join(', '));
S.ok('  and the parlour is never offered',        T.unofferable.includes('parlour'),
     'it is the free entry room and already stands when the house is deeded');

S.note(`price ladder: ${T.ladder.map(([k, c]) => k + ' ' + c.toLocaleString()).join(' · ')}`);

S.report(
  'All twelve room rows are complete, uniquely named and uniquely coloured, and every one can be built somewhere.',
  'whether the palettes actually read apart on screen — that is a look, and needs a browser.');
