/* ============================================================================
   wintest — windows land on the curtain slot's tile, on that slot's own wall.

   The rule (docs/23 §6): a window is placed on the tile the room's `curtain`
   slot occupies, on that slot's wall. Furniture must not draw its own window or
   you get an offset double — two panes a few centimetres apart, which reads as a
   rendering fault rather than a design one.

   The window is baked, not an object, so this wraps module-scope bake() and
   finds the panes by their glass colour. That is the only way to see them
   offline.

   Run: node harness/wintest.mjs
   ========================================================================== */
import {runPass, Suite, PRELUDE, SRC} from './_lib.mjs';

const T = runPass(PRELUDE + String.raw`
  setLevel('construction', 99);
  clearInv(); give('coins', 20000000);
  freshHouse();
  const LAYOUT = [[0,0,'kitchen'],[2,0,'bedroom'],[0,1,'workshop'],[1,1,'garden'],
                  [2,1,'study'],[0,2,'games'],[1,2,'chapel'],[2,2,'combat']];
  for(const [gx, gy, t] of LAYOUT) houseBuildRoom(gx, gy, t);
  since();

  /* which rooms even have a curtain slot */
  o.curtainSlots = {};
  for(const rk in HOUSE_ROOMS){
    const c = HOUSE_ROOMS[rk].slots.filter(s => s.cat === 'curtain');
    o.curtainSlots[rk] = c.map(s => ({id: s.id, ox: s.ox, oy: s.oy, label: s.label}));
  }
  o.roomsWithCurtain = Object.keys(o.curtainSlots).filter(r => o.curtainSlots[r].length > 0);
  o.roomsWithTwoCurtains = Object.keys(o.curtainSlots).filter(r => o.curtainSlots[r].length > 1);

  /* ---- capture the bake ---- */
  const _bake = bake;
  let boxes = [];
  bake = function(out, geo, hex, px, py, pz, ry, sc, rx, rz){
    boxes.push({hex, x: px, y: py, z: pz,
                w: geo.parameters ? geo.parameters.width : null,
                h: geo.parameters ? geo.parameters.height : null,
                d: geo.parameters ? geo.parameters.depth : null});
    return _bake.apply(null, arguments);
  };
  boxes = [];
  houseBuildInterior();
  bake = _bake;

  /* the pane: GLASS 0xbcd6dd, 0.84 x 0.72 */
  const GLASS = 0xbcd6dd;
  o.GLASS = GLASS;
  const panes = boxes.filter(b => b.hex === GLASS);
  o.paneCount = panes.length;
  o.panes = panes.map(b => ({x: b.x, y: b.y, z: b.z, w: b.w, h: b.h, d: b.d}));

  /* glass is used for the window and nothing else in the interior */
  o.glassSizes = [...new Set(panes.map(b => [b.w, b.h, b.d].map(v => Math.round(v * 100) / 100).join('x')))];

  /* ---- one pane per room that has a curtain slot, at that slot's tile ---- */
  o.perRoom = [];
  for(let gy = 0; gy < HOUSE_GH; gy++) for(let gx = 0; gx < HOUSE_GW; gx++){
    const t = roomAt(gx, gy); if(!t) continue;
    const org = roomOrigin(gx, gy);
    const cur = HOUSE_ROOMS[t].slots.find(s => s.cat === 'curtain');
    /* panes belonging to this room: within its footprint, walls included */
    const mine = panes.filter(b =>
      b.x > org.x - 0.2 && b.x < org.x + HOUSE_RW + 0.2 &&
      b.z > org.y - 0.2 && b.z < org.y + HOUSE_RH + 0.2);
    const row = {room: t, gx, gy, hasCurtainSlot: !!cur, panes: mine.length};
    if(cur){
      const sx = org.x + cur.ox, sy = org.y + cur.oy;
      row.slotTile = {x: sx, y: sy};
      /* which wall the slot stands against, exactly as the painter derives it */
      const dN = cur.oy - 1, dS = (HOUSE_RH - 1) - cur.oy;
      const dW = cur.ox - 1, dE = (HOUSE_RW - 1) - cur.ox;
      const m = Math.min(dN, dS, dW, dE);
      row.wall = (m === dN) ? 'N' : (m === dS) ? 'S' : (m === dW) ? 'W' : 'E';
      row.slotIsFlush = m === 0;
      /* the pane must line up with the slot on the axis that runs along the wall */
      row.aligned = mine.some(b => (row.wall === 'N' || row.wall === 'S')
        ? Math.abs(b.x - (sx + 0.5)) < 0.2
        : Math.abs(b.z - (sy + 0.5)) < 0.2);
      /* ...and sit on the correct side of the room */
      row.onRightWall = mine.some(b => {
        if(row.wall === 'N') return b.z < sy + 0.5;
        if(row.wall === 'S') return b.z > sy + 0.5;
        if(row.wall === 'W') return b.x < sx + 0.5;
        return b.x > sx + 0.5;
      });
    }
    /* does the cell ABOVE this one have a curtain? The painter falls back to
       curtainCol[gx,gy-1] for wall tiles that resolve to this cell, so a shared
       wall can inherit the upper room's window. */
    const above = roomAt(gx, gy - 1);
    row.inheritsFrom = (!cur && above && HOUSE_ROOMS[above].slots.some(s => s.cat === 'curtain'))
      ? above : null;
    o.perRoom.push(row);
  }

  /* ---- no furniture draws its own window ---- */
  /* build the curtains into their slot and re-bake: the pane count must not move */
  const before = o.paneCount;
  const parlourCurtain = HOUSE_ROOMS.parlour.slots.find(s => s.cat === 'curtain');
  clearInv(); give('coins', 10000000);
  const CF = HOUSE_FURNITURE.hf_curtain;
  give(CF.plankId || 'oak_plank', CF.planks | 0); give('iron_nails', CF.nails | 0);
  houseBuild(HOUSE_ENTRY.gx + ',' + HOUSE_ENTRY.gy + ':' + parlourCurtain.id, 'hf_curtain');
  o.curtainBuilt = houseSlots()[HOUSE_ENTRY.gx + ',' + HOUSE_ENTRY.gy + ':' + parlourCurtain.id] === 'hf_curtain';
  since();
  boxes = [];
  bake = function(out, geo, hex, px, py, pz, ry, sc, rx, rz){
    boxes.push({hex, x: px, y: py, z: pz}); return _bake.apply(null, arguments);
  };
  houseBuildInterior();
  bake = _bake;
  o.paneCountWithCurtains = boxes.filter(b => b.hex === GLASS).length;
  o.paneCountUnchanged = o.paneCountWithCurtains === before;

  if(inHouse) exitHouse();
  return o;
`);

const S = new Suite('wintest').guard(T);

const withCurtain = (T.perRoom || []).filter(r => r.hasCurtainSlot);
const without = (T.perRoom || []).filter(r => !r.hasCurtainSlot);

S.ok('some rooms have a curtain slot',            T.roomsWithCurtain.length > 0,
     T.roomsWithCurtain.join(', '));
S.eq('NO ROOM HAS TWO CURTAIN SLOTS',             T.roomsWithTwoCurtains.length, 0);
if(T.roomsWithTwoCurtains.length) S.note(T.roomsWithTwoCurtains.join(', '));

S.ok('the interior bakes windows at all',         T.paneCount > 0, `${T.paneCount} panes`);
S.eq('every pane is the same size',               T.glassSizes.length, 1);
S.eq('  0.84 x 0.72',                             (T.glassSizes[0] || '').includes('0.84') && (T.glassSizes[0] || '').includes('0.72'), true);

S.ok('there are rooms with a curtain slot to check', withCurtain.length > 0,
     `${withCurtain.length} of ${(T.perRoom || []).length} built rooms`);
for(const r of withCurtain){
  S.eq(`the ${r.room} gets exactly one window`,   r.panes, 1);
  S.ok(`  its curtain slot is flush on the ${r.wall} wall`, r.slotIsFlush,
       `slot at ${r.slotTile.x},${r.slotTile.y}`);
  S.ok(`  and the pane LINES UP with the slot`,   r.aligned);
  S.ok(`  on the slot's own wall`,                r.onRightWall);
}
/* A room with no curtain slot of its own gets no window — UNLESS it sits directly
   below one that has. houseBuildInterior resolves a shared wall tile to the LOWER
   cell (cellOf floors the division), finds no curtain there, and falls back to
   curtainCol[gx, gy-1]. So the shared wall inherits the upper room's window and
   draws it facing INTO the lower room. Characterised exactly here rather than
   waved through: see the note printed below. */
const stray = without.filter(r => r.panes > 0);
const inherited = stray.filter(r => r.inheritsFrom);
const unexplained = stray.filter(r => !r.inheritsFrom);
S.eq('NO ROOM GETS AN UNEXPLAINED WINDOW',        unexplained.length, 0);
if(unexplained.length) S.note(unexplained.map(r => `${r.room}=${r.panes}`).join(', '));
S.ok('  and any extra pane is an inherited one',  stray.length === inherited.length,
     stray.map(r => `${r.room}<-${r.inheritsFrom || '?'}`).join(', '));
S.eq('  exactly one pane each, never doubled',    inherited.filter(r => r.panes !== 1).length, 0);
if(inherited.length)
  S.note('FOR SAM: ' + inherited.map(r => `the ${r.room} inherits a window from the ${r.inheritsFrom} above it`).join('; ')
    + '. The shared wall gets glass on the LOWER room\'s face only — from the courtyard you see a '
    + 'window into the parlour, from the parlour that wall is blank plaster. Comes from the '
    + 'curtainCol[gx,gy-1] fallback in houseBuildInterior. Harmless today (the parlour is always '
    + 'directly above the courtyard, so it is always this one wall) but any future room type with a '
    + 'curtain slot would give the room below it a phantom window too. Visual call, so left alone.');

/* the double-pane bug */
S.ok('the curtains build',                        T.curtainBuilt);
S.eq('BUILDING CURTAINS ADDS NO SECOND PANE',     T.paneCountUnchanged, true);
S.eq('  pane count is unchanged',                 T.paneCountWithCurtains, T.paneCount);

/* source: the invariant, written down where the next edit will see it */
S.ok('the source ties the window to the curtain slot',
     /window, exactly on the tile the curtains hang on/i.test(SRC));

S.report(
  'Every room with a curtain slot gets exactly one window, on that slot’s tile and wall, and the curtains add no second pane.',
  'how the window looks from inside or out — glass, light and framing all need a browser.');
