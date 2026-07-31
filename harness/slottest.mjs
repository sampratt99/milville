/* ============================================================================
   slottest — the hotspot placement rules (docs/23 §4).

   57 hotspot categories across 12 rooms. The headline rule: NO DISTINCTIVE
   CATEGORY MAY APPEAR IN TWO ROOMS. The original design shared generic
   categories — `decor` was in ELEVEN rooms — so every room ended up with the
   same top-tier painting. Only `seat` and `rug` are whitelisted as generic, and
   even those cap at two rooms. This harness is what makes that permanent.

   Run: node harness/slottest.mjs

   A note on honesty: there is no WALL_CATS list in the game — the wall/free
   split is asserted from the table below, written from docs/23 §4 and the
   shipped geometry. That makes this a DRIFT LOCK: it catches a slot that moves
   off its wall, not a slot that was in the wrong place to begin with.
   ========================================================================== */
import {runPass, Suite, PRELUDE} from './_lib.mjs';

/* distance from the nearest wall each category must sit at.
   0 = flush against a wall (mounted); 1 = beside a wall; 2+ = out on the floor */
const FLUSH = [
  'hearth', 'curtain', 'bell', 'range', 'plaque', 'larder', 'sink', 'wardrobe',
  'clock', 'dresser', 'wallchart', 'bookcase', 'telescope', 'altar', 'icon',
  'burner', 'toolrack', 'painting', 'show', 'statue', 'trellis', 'plant',
  'board', 'scoreboard', 'prizechest', 'weaponrack', 'armourstand', 'banner',
  'costume', 'pets', 'mirror', 'armourcase', 'sigil',
];
const FREE = ['worktable', 'gametable', 'bed', 'lectern', 'pew', 'workbench',
              'tree', 'water', 'dummy', 'ring', 'portal', 'effigy', 'balance', 'rug'];
/* seat, lamp, crate, repair, hedge, pedestal, globe, scrying, focus, treasure
   sit one tile off a wall — neither mounted nor out in the middle. */

const T = runPass(PRELUDE + String.raw`
  o.RW = HOUSE_RW; o.RH = HOUSE_RH;
  o.roomCount = Object.keys(HOUSE_ROOMS).length;

  /* every slot, flattened, with its distance to the nearest wall */
  o.slots = [];
  for(const rk in HOUSE_ROOMS){
    for(const s of HOUSE_ROOMS[rk].slots){
      const dN = s.oy - 1, dS = (HOUSE_RH - 1) - s.oy;
      const dW = s.ox - 1, dE = (HOUSE_RW - 1) - s.ox;
      o.slots.push({room: rk, id: s.id, ox: s.ox, oy: s.oy, cat: s.cat,
                    wall: Math.min(dN, dS, dW, dE)});
    }
  }

  /* which rooms claim each category */
  o.catRooms = {};
  for(const s of o.slots) (o.catRooms[s.cat] = o.catRooms[s.cat] || []).push(s.room);

  /* the furniture side */
  o.furnCats = {};
  for(const fid in HOUSE_FURNITURE){
    const F = HOUSE_FURNITURE[fid];
    (o.furnCats[F.cat] = o.furnCats[F.cat] || []).push(fid);
  }

  /* doorway tiles, in room-local coordinates. houseCarve punches a door in the
     middle of any shared wall; a slot next to one would block the walkway. */
  const half = Math.floor(HOUSE_RH / 2), halfW = Math.floor(HOUSE_RW / 2);
  o.doorAdjacent = [
    [1, half], [1, half + 1],                       /* inside the west door  */
    [HOUSE_RW - 1, half], [HOUSE_RW - 1, half + 1], /* inside the east door  */
    [halfW, 1], [halfW + 1, 1],                     /* inside the north door */
    [halfW, HOUSE_RH - 1], [halfW + 1, HOUSE_RH - 1], /* inside the south door */
  ];

  /* facing, per slot, straight from the shipped function */
  o.facing = {};
  freshHouse();
  for(const rk in HOUSE_ROOMS){
    /* stamp the room into a cell so houseSlotByKey can find its slots */
    houseRooms()['0,0'] = rk;
    for(const s of HOUSE_ROOMS[rk].slots){
      const S = houseSlotByKey('0,0:' + s.id);
      if(S) o.facing[rk + ':' + s.id] = houseSlotFacing(S);
    }
    delete houseRooms()['0,0'];
  }
  if(inHouse) exitHouse();
  return o;
`);

const S = new Suite('slottest').guard(T);
const slots = T.slots || [];

S.eq('twelve room types',                         T.roomCount, 12);
S.ok('57 hotspot categories',                     Object.keys(T.catRooms).length === 57,
     `${Object.keys(T.catRooms).length} categories across ${slots.length} slots`);

/* ---- THE HEADLINE RULE -------------------------------------------------- */
const GENERIC = ['seat', 'rug'];
const shared = Object.entries(T.catRooms)
  .map(([cat, rooms]) => [cat, [...new Set(rooms)]])
  .filter(([, rooms]) => rooms.length > 1);
const badShared = shared.filter(([cat]) => !GENERIC.includes(cat));
S.eq('NO DISTINCTIVE CATEGORY APPEARS IN TWO ROOMS', badShared.length, 0);
if(badShared.length) S.note('shared: ' + badShared.map(([c, r]) => `${c}=${r.join('/')}`).join(', '));
for(const [cat, rooms] of shared)
  S.ok(`the generic '${cat}' caps at two rooms`, rooms.length <= 2, rooms.join('/'));
S.eq('  and only seat and rug are generic',       shared.map(([c]) => c).sort().join(','), 'rug,seat');

/* ---- rule 1 & 2: flush vs free-standing --------------------------------- */
const wrongFlush = slots.filter(s => FLUSH.includes(s.cat) && s.wall !== 0);
S.eq('wall categories are FLUSH against a wall',  wrongFlush.length, 0);
if(wrongFlush.length) S.note(wrongFlush.map(s => `${s.room}:${s.id} at d${s.wall}`).join(', '));
const wrongFree = slots.filter(s => FREE.includes(s.cat) && s.wall < 1);
S.eq('free-standing categories are OFF the wall', wrongFree.length, 0);
if(wrongFree.length) S.note(wrongFree.map(s => `${s.room}:${s.id} at d${s.wall}`).join(', '));
S.ok('  and the table covers what it claims to',
     FLUSH.concat(FREE).every(c => c in T.catRooms),
     'unknown: ' + FLUSH.concat(FREE).filter(c => !(c in T.catRooms)).join(', '));

/* ---- rule 3: nothing on a doorway-adjacent tile -------------------------- */
const onDoor = slots.filter(s => T.doorAdjacent.some(([x, y]) => x === s.ox && y === s.oy));
S.eq('NOTHING SITS ON A DOORWAY-ADJACENT TILE',   onDoor.length, 0);
if(onDoor.length) S.note(onDoor.map(s => `${s.room}:${s.id}@${s.ox},${s.oy}`).join(', '));

/* ---- rule 4: no two slots within one tile ------------------------------- */
const tooClose = [];
for(const rk of new Set(slots.map(s => s.room))){
  const rs = slots.filter(s => s.room === rk);
  for(let a = 0; a < rs.length; a++) for(let b = a + 1; b < rs.length; b++){
    const d = Math.max(Math.abs(rs[a].ox - rs[b].ox), Math.abs(rs[a].oy - rs[b].oy));
    if(d <= 1) tooClose.push(`${rk}:${rs[a].id}/${rs[b].id}`);
  }
}
S.eq('NO TWO SLOTS WITHIN ONE TILE',              tooClose.length, 0);
if(tooClose.length) S.note(tooClose.join(', '));

/* ---- every slot is inside its room -------------------------------------- */
const outside = slots.filter(s => s.ox < 1 || s.ox > T.RW - 1 || s.oy < 1 || s.oy > T.RH - 1);
S.eq('every slot is inside the room interior',    outside.length, 0);
if(outside.length) S.note(outside.map(s => `${s.room}:${s.id}@${s.ox},${s.oy}`).join(', '));

/* ---- the two tables agree ------------------------------------------------ */
const emptyCats = Object.keys(T.catRooms).filter(c => !T.furnCats[c]);
S.eq('every hotspot category has furniture',      emptyCats.length, 0);
if(emptyCats.length) S.note('nothing to build: ' + emptyCats.join(', '));
const homeless = Object.keys(T.furnCats).filter(c => !T.catRooms[c]);
S.eq('every furniture category has a hotspot',    homeless.length, 0);
if(homeless.length) S.note('nowhere to put: ' + homeless.join(', '));

/* ---- facing: a piece looks INTO the room from its own wall --------------- */
/* N 0, S PI, W PI/2, E -PI/2 — and free-standing keeps facing north. */
const facingWrong = [];
for(const s of slots){
  const f = T.facing[s.room + ':' + s.id];
  if(f === undefined){ facingWrong.push(`${s.room}:${s.id} (no facing)`); continue; }
  const dN = s.oy - 1, dS = (T.RH - 1) - s.oy, dW = s.ox - 1, dE = (T.RW - 1) - s.ox;
  const m = Math.min(dN, dS, dW, dE);
  let want = 0;
  if(m > 1) want = 0;
  else if(m === dN) want = 0;
  else if(m === dS) want = Math.PI;
  else if(m === dW) want = Math.PI / 2;
  else want = -Math.PI / 2;
  if(f !== want) facingWrong.push(`${s.room}:${s.id} got ${f} want ${want}`);
}
S.eq('every piece faces INTO its room',           facingWrong.length, 0);
if(facingWrong.length) S.note(facingWrong.slice(0, 6).join(', '));
const turned = Object.values(T.facing).filter(f => f !== 0).length;
S.ok('  and some really are turned',              turned > 0,
     `${turned} of ${Object.keys(T.facing).length} slots need a rotation`);

S.report(
  `All ${slots.length} hotspots across 12 rooms obey the placement rules; no distinctive category is shared.`,
  'whether a piece visually fits its tile — that is a look, and needs a browser.');
