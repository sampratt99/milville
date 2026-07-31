/* ============================================================================
   poh15 — the house region, its coordinates, and the carve.

   The house interior is a dead zone stamped into WALKABLE DEEP WILDERNESS
   (docs/23 §2). Two things have to hold or the world breaks around it: the
   region has to be carved solid before anything is built in it, and the heights
   under it have to be flattened on entry and RESTORED on exit — the wilderness
   is still out there under the floorboards.

   Coordinates: runtime = source + 112 (WX). Interiors are exempt.

   Run: node harness/poh15.mjs
   ========================================================================== */
import {runPass, Suite, PRELUDE} from './_lib.mjs';

const T = runPass(PRELUDE + String.raw`
  o.WX = WX;
  o.HOUSE = {x0: HOUSE.x0, y0: HOUSE.y0, x1: HOUSE.x1, y1: HOUSE.y1};
  o.grid = {GW: HOUSE_GW, GH: HOUSE_GH, RW: HOUSE_RW, RH: HOUSE_RH};
  o.entry = {gx: HOUSE_ENTRY.gx, gy: HOUSE_ENTRY.gy};
  o.centre = {gx: HOUSE_CENTRE.gx, gy: HOUSE_CENTRE.gy};
  o.ret = {x: HOUSE_RETURN.x, y: HOUSE_RETURN.y};

  /* the cottage on the world map, in RUNTIME coordinates */
  const b = BUILDINGS.find(q => q.kind === 'pohcottage');
  o.cottage = b ? {x: b.x, y: b.y, w: b.w, h: b.h} : null;
  /* npcs (lower case) is the RUNTIME array — it carries the +WX shift.
     NPCS (upper case) is the source table and is still on pre-shift coords. */
  const bohan = npcs.find(n => n && n.id === 'bohan');
  const bohanSrc = NPCS.find(n => n && n.id === 'bohan');
  o.bohan = bohan ? {x: bohan.x, y: bohan.y} : null;
  o.bohanSrc = bohanSrc ? {x: bohanSrc.x, y: bohanSrc.y} : null;

  /* ---- PRISTINE heights, captured before anything enters the house.
     Sampling these via _houseRestore() would make the restore check circular:
     a broken restore would corrupt the baseline and the comparison would still
     pass. Nothing has flattened the ground yet at this point in the pass. ---- */
  const sample = [];
  for(let y = HOUSE.y0; y <= HOUSE.y1; y += 7)
    for(let x = HOUSE.x0; x <= HOUSE.x1; x += 7) sample.push([x, y]);
  o.sampleCount = sample.length;
  const pristine = sample.map(([x, y]) => hts[y][x]);
  o.wildVaries = new Set(pristine.map(v => Math.round(v * 1000))).size > 1;

  /* ---- the region is inside the map, and west of the campus ---- */
  o.mapW = W; o.mapH = H;
  o.regionInsideMap = HOUSE.x0 >= 0 && HOUSE.y0 >= 0 && HOUSE.x1 < W && HOUSE.y1 < H;
  o.regionIsDeepWilderness = HOUSE.x1 < WX;   /* runtime campus starts at WX */

  /* ---- the carve ---- */
  freshHouse();                 /* parlour only */
  const tileAt = (x, y) => houseTiles[y][x];
  const countIn = want => {
    let n = 0;
    for(let y = HOUSE.y0; y <= HOUSE.y1; y++)
      for(let x = HOUSE.x0; x <= HOUSE.x1; x++)
        if(tileAt(x, y) === want) n++;
    return n;
  };
  o.oneRoom = {floor: countIn(T_FLOOR), wall: countIn(T_WALL)};

  /* the parlour's own interior is floor... */
  const org = roomOrigin(HOUSE_ENTRY.gx, HOUSE_ENTRY.gy);
  o.parlourOrigin = org;
  let interiorFloor = true;
  for(let y = org.y + 1; y < org.y + HOUSE_RH; y++)
    for(let x = org.x + 1; x < org.x + HOUSE_RW; x++)
      if(tileAt(x, y) !== T_FLOOR) interiorFloor = false;
  o.parlourInteriorIsFloor = interiorFloor;

  /* ...and an unbuilt cell is solid rock, not open floor */
  const empty = roomOrigin(0, 2);
  let emptySolid = true;
  for(let y = empty.y + 1; y < empty.y + HOUSE_RH; y++)
    for(let x = empty.x + 1; x < empty.x + HOUSE_RW; x++)
      if(tileAt(x, y) !== T_WALL) emptySolid = false;
  o.unbuiltCellIsSolid = emptySolid;

  /* the front door is punched in the entry room's north wall */
  const ex = houseExitTile();
  o.exitTile = ex;
  o.frontDoorIsFloor = tileAt(ex.x, ex.y) === T_FLOOR;

  /* ---- a doorway appears between two built neighbours, and only then ---- */
  const wallX = org.x + HOUSE_RW, wallY = org.y + Math.floor(HOUSE_RH / 2);
  o.beforeNeighbour = tileAt(wallX, wallY);
  houseRooms()['2,0'] = 'kitchen';
  houseCarve();
  o.afterNeighbour = tileAt(wallX, wallY);
  delete houseRooms()['2,0'];
  houseCarve();
  o.afterRemoval = tileAt(wallX, wallY);

  /* ---- heights: flattened on entry, RESTORED on exit ----
     compared against the PRISTINE baseline taken at the top of this pass. */
  _houseFlatten();
  const flat = sample.map(([x, y]) => hts[y][x]);
  o.flatIsLevel = new Set(flat.map(v => Math.round(v * 1000))).size === 1;
  o.flatValue = flat[0];
  o.houseFY = houseFY;
  o.flatReallyChangedThings = flat.some((v, k) => v !== pristine[k]);
  _houseRestore();
  const back = sample.map(([x, y]) => hts[y][x]);
  o.heightsRestored = pristine.every((v, k) => v === back[k]);
  o.restoreMismatch = pristine.map((v, k) => v === back[k] ? null : k).filter(k => k !== null).length;

  /* ---- entering and leaving swaps the world cleanly ---- */
  freshHouse();
  o.insideFlags = {inHouse: inHouse, tilesAreHouse: tiles === houseTiles,
                   worldHidden: worldGroup.visible === false, houseShown: houseGroup.visible === true};
  o.insideAt = {x: player.x, y: player.y};
  exitHouse();
  o.outsideFlags = {inHouse: inHouse, tilesAreMain: tiles === TILES_MAIN,
                    worldShown: worldGroup.visible === true, houseHidden: houseGroup.visible === false};
  o.outsideAt = {x: player.x, y: player.y};
  return o;
`);

const S = new Suite('poh15').guard(T);

/* ---- constants ---------------------------------------------------------- */
S.eq('the runtime shift is +112',                 T.WX, 112);
S.eq('the house grid is 3x3',                     [T.grid.GW, T.grid.GH], [3, 3]);
S.eq('each room is 12x10',                        [T.grid.RW, T.grid.RH], [12, 10]);
S.eq('the region matches the grid',
     [T.HOUSE.x1 - T.HOUSE.x0, T.HOUSE.y1 - T.HOUSE.y0],
     [T.grid.RW * T.grid.GW, T.grid.RH * T.grid.GH]);
S.eq('the region starts at 47,1',                 [T.HOUSE.x0, T.HOUSE.y0], [47, 1]);
S.eq('the entry cell is the middle of the top row', [T.entry.gx, T.entry.gy], [1, 0]);
S.eq('the courtyard is the centre cell',          [T.centre.gx, T.centre.gy], [1, 1]);
S.ok('the region fits inside the map',            T.regionInsideMap,
     `${T.HOUSE.x1},${T.HOUSE.y1} in a ${T.mapW}x${T.mapH} map`);
S.ok('IT SITS IN WALKABLE DEEP WILDERNESS',       T.regionIsDeepWilderness,
     `house ends at x${T.HOUSE.x1}, campus starts at x${T.WX}`);

/* ---- the cottage outside ------------------------------------------------ */
S.eq('the cottage is at runtime 230,111',         [T.cottage.x, T.cottage.y], [230, 111]);
S.eq('Mr. Bohan stands at 229,110',               [T.bohan.x, T.bohan.y], [229, 110]);
S.eq('  and his source row is pre-shift',         [T.bohanSrc.x, T.bohanSrc.y], [229 - T.WX, 110]);
S.eq('you come back out onto the doorstep',       [T.ret.x, T.ret.y], [231, 110]);
S.ok('  which is beside the cottage door at 231,111',
     Math.abs(T.ret.x - 231) + Math.abs(T.ret.y - 111) === 1,
     `return ${T.ret.x},${T.ret.y}`);

/* ---- the carve ---------------------------------------------------------- */
S.ok('one room carves one room of floor',
     T.oneRoom.floor >= (T.grid.RW - 1) * (T.grid.RH - 1) &&
     T.oneRoom.floor <= (T.grid.RW - 1) * (T.grid.RH - 1) + 2,
     `${T.oneRoom.floor} floor tiles, ${T.oneRoom.wall} wall`);
S.ok('the parlour interior is all floor',         T.parlourInteriorIsFloor);
S.ok('AN UNBUILT CELL IS SOLID ROCK',             T.unbuiltCellIsSolid,
     'if this fails you can walk into a room you never built');
S.ok('the front door is punched through',         T.frontDoorIsFloor,
     `exit tile ${T.exitTile.x},${T.exitTile.y}`);

S.ok('a shared wall is SOLID with no neighbour',  T.beforeNeighbour !== T.afterNeighbour,
     `${T.beforeNeighbour} -> ${T.afterNeighbour}`);
S.ok('  and opens when the neighbour is built',   T.afterNeighbour !== T.beforeNeighbour);
S.eq('  and closes again when it is gone',        T.afterRemoval, T.beforeNeighbour);

/* ---- heights ------------------------------------------------------------ */
S.ok('the wilderness under the house is uneven',  T.wildVaries,
     `${T.sampleCount} sample points — if this were flat the restore check proves nothing`);
S.ok('entering levels the ground',                T.flatIsLevel, `all at ${T.flatValue}`);
S.eq('  to houseFY',                              T.flatValue, T.houseFY);
S.ok('  and that really moved the terrain',       T.flatReallyChangedThings,
     'if flattening changes nothing the restore check below proves nothing');
S.ok('LEAVING PUTS THE HILLS BACK',               T.heightsRestored,
     `${T.restoreMismatch} of ${T.sampleCount} sample points did not come back`);

/* ---- the world swap ----------------------------------------------------- */
S.eq('inside: every flag agrees',                 T.insideFlags,
     {inHouse: true, tilesAreHouse: true, worldHidden: true, houseShown: true});
S.eq('outside: every flag agrees',                T.outsideFlags,
     {inHouse: false, tilesAreMain: true, worldShown: true, houseHidden: true});
S.eq('you leave onto the doorstep',               [T.outsideAt.x, T.outsideAt.y], [T.ret.x, T.ret.y]);
S.ok('and you enter just inside the door',        T.insideAt.y === T.exitTile.y + 1,
     `entered at ${T.insideAt.x},${T.insideAt.y}, door at ${T.exitTile.x},${T.exitTile.y}`);

S.report(
  'The house region carves correctly, sits in deep wilderness, and puts the terrain back on exit.',
  'how the interior looks and whether the walk through the door reads right — needs a browser.');
