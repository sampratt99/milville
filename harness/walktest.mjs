/* ============================================================================
   walktest — what you can and cannot walk on inside the house.

   blockedStrict() is the single authority. Inside the house it has to get three
   things right:

     - furniture blocks, so you cannot stand inside the wardrobe
     - flat pieces do NOT block: a rug is floor, and OBJ_DEFS marks those noBlock
     - every doorway stays walkable, and every room stays REACHABLE from the
       front door. A room you paid for and cannot enter is the worst failure
       this system has.

   The reachability flood is the real test here — it is the only check that
   catches a carve that opens a room but leaves it sealed.

   Run: node harness/walktest.mjs
   ========================================================================== */
import {runPass, Suite, PRELUDE} from './_lib.mjs';

const T = runPass(PRELUDE + String.raw`
  setLevel('construction', 99);
  clearInv(); give('coins', 20000000);
  freshHouse();
  const LAYOUT = [[0,0,'kitchen'],[2,0,'bedroom'],[0,1,'workshop'],[1,1,'garden'],
                  [2,1,'study'],[0,2,'games'],[1,2,'chapel'],[2,2,'combat']];
  for(const [gx, gy, t] of LAYOUT) houseBuildRoom(gx, gy, t);
  since();
  o.rooms = Object.keys(houseRooms()).length;

  /* ---- REACHABILITY: flood from just inside the front door ---- */
  const ex = houseExitTile();
  o.exitTile = ex;
  const start = {x: ex.x, y: ex.y + 1};
  const seen = new Set();
  const flood = () => {
    seen.clear();
    const q = [start.x + ',' + start.y];
    seen.add(q[0]);
    while(q.length){
      const [cx, cy] = q.pop().split(',').map(Number);
      for(const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const nx = cx + dx, ny = cy + dy;
        if(nx < HOUSE.x0 || nx > HOUSE.x1 || ny < HOUSE.y0 || ny > HOUSE.y1) continue;
        const k = nx + ',' + ny;
        if(seen.has(k)) continue;
        if(blockedStrict(nx, ny)) continue;
        seen.add(k); q.push(k);
      }
    }
    return seen;
  };
  flood();
  o.reachableCount = seen.size;

  /* every built room must have reachable floor in it */
  o.unreachableRooms = [];
  o.roomReach = {};
  for(let gy = 0; gy < HOUSE_GH; gy++) for(let gx = 0; gx < HOUSE_GW; gx++){
    const t = roomAt(gx, gy); if(!t) continue;
    const org = roomOrigin(gx, gy);
    let inRoom = 0, reach = 0;
    for(let y = org.y + 1; y < org.y + HOUSE_RH; y++)
      for(let x = org.x + 1; x < org.x + HOUSE_RW; x++){
        if(houseTiles[y][x] !== T_FLOOR) continue;
        inRoom++;
        if(seen.has(x + ',' + y)) reach++;
      }
    o.roomReach[t] = {tiles: inRoom, reached: reach};
    if(reach === 0) o.unreachableRooms.push(t);
  }

  /* ---- internal doorways stay walkable ----
     The FRONT DOOR is deliberately not one of these: it carries the house_exit
     object, which blocks, because leaving is a click on the door rather than a
     step through it. Counted separately below. */
  /* A doorway is TWO tiles wide, so neither of its tiles has wall on both sides
     along one axis — testing for that finds nothing. What identifies a doorway is
     that it is a T_FLOOR tile sitting ON a room boundary line. */
  const onWallLine = (x, y) => ((x - HOUSE.x0) % HOUSE_RW === 0) || ((y - HOUSE.y0) % HOUSE_RH === 0);
  o.blockedDoorways = [];
  o.internalDoorways = 0;
  for(let y = HOUSE.y0; y <= HOUSE.y1; y++)
    for(let x = HOUSE.x0; x <= HOUSE.x1; x++){
      if(houseTiles[y][x] !== T_FLOOR) continue;
      if(!onWallLine(x, y)) continue;
      if(x === ex.x && y === ex.y) continue;                 /* the front door */
      o.internalDoorways++;
      if(blockedStrict(x, y)) o.blockedDoorways.push(x + ',' + y);
    }

  /* the front door itself: an object stands on it, and it is the way out */
  const doorObj = objects.find(q => q.def === 'house_exit');
  o.frontDoor = {
    tileIsFloor: houseTiles[ex.y][ex.x] === T_FLOOR,
    hasExitObject: !!(doorObj && doorObj.x === ex.x && doorObj.y === ex.y),
    blocks: blockedStrict(ex.x, ex.y),
    standInFront: !blockedStrict(ex.x, ex.y + 1),
    options: doorObj ? optionsAt(ex.x, ex.y).map(q => q.label || String(q.html || '')) : [],
  };

  /* ---- walls block ---- */
  let wallsChecked = 0, wallsWalkable = 0;
  for(let y = HOUSE.y0; y <= HOUSE.y1; y++)
    for(let x = HOUSE.x0; x <= HOUSE.x1; x++){
      if(houseTiles[y][x] !== T_WALL) continue;
      wallsChecked++;
      if(!blockedStrict(x, y)) wallsWalkable++;
    }
  o.wallsChecked = wallsChecked; o.wallsWalkable = wallsWalkable;

  /* ---- solid furniture blocks, flat furniture does not ---- */
  const slotFor = cat => {
    for(const rk in HOUSE_ROOMS){
      const s = HOUSE_ROOMS[rk].slots.find(q => q.cat === cat);
      if(s) return {room: rk, id: s.id};
    }
    return null;
  };
  const buildAndProbe = fid => {
    const F = HOUSE_FURNITURE[fid];
    const where = slotFor(F.cat); if(!where) return null;
    player.house.rooms = {}; player.house.rooms['1,0'] = where.room;
    player.house.slots = {};
    clearInv(); give('coins', 10000000);
    if(F.planks | 0) give(F.plankId || 'oak_plank', F.planks | 0);
    if(F.nails | 0) give('iron_nails', F.nails | 0);
    since();
    houseBuild('1,0:' + where.id, fid);
    if(houseSlots()['1,0:' + where.id] !== fid) return null;
    const S0 = houseSlotByKey('1,0:' + where.id);
    if(!S0) return null;
    return {blocked: blockedStrict(S0.x, S0.y),
            noBlock: !!(OBJ_DEFS[fid] && OBJ_DEFS[fid].noBlock),
            flatFloor: !!(OBJ_DEFS[fid] && OBJ_DEFS[fid].flatFloor)};
  };

  o.solidWrong = []; o.flatWrong = []; o.probed = 0;
  o.flatCount = 0; o.solidCount = 0;
  for(const fid in HOUSE_FURNITURE){
    const r = buildAndProbe(fid);
    if(!r) continue;
    o.probed++;
    if(r.noBlock){
      o.flatCount++;
      if(r.blocked) o.flatWrong.push(fid + ' is noBlock but blocks');
    }else{
      o.solidCount++;
      if(!r.blocked) o.solidWrong.push(fid + ' is solid but does not block');
    }
    /* anything you can stand on had better be flat-floored too, or you stand in it */
    if(r.noBlock && !r.flatFloor && /rug/i.test(fid)) o.flatWrong.push(fid + ' is walkable but not flatFloor');
  }

  /* the four flatFloor pieces are all walkable */
  o.flatFloorPieces = Object.keys(HOUSE_FURNITURE).filter(f => OBJ_DEFS[f] && OBJ_DEFS[f].flatFloor);
  o.flatFloorBlocking = [];
  for(const fid of o.flatFloorPieces){
    const r = buildAndProbe(fid);
    if(r && r.blocked) o.flatFloorBlocking.push(fid);
  }

  /* ================= THE CARVE AND THE DEAD ZONE =================
     Moved here when poh15 was rescoped to the entry arc. It belongs with the
     walkable geometry: the interior is stamped into REAL walkable deep
     wilderness, so the carve and the terrain swap decide what you can stand on
     both inside the house and out on the grass afterwards. */
  o.HOUSE = {x0: HOUSE.x0, y0: HOUSE.y0, x1: HOUSE.x1, y1: HOUSE.y1};
  o.grid = {GW: HOUSE_GW, GH: HOUSE_GH, RW: HOUSE_RW, RH: HOUSE_RH};
  o.regionIsDeepWilderness = HOUSE.x1 < WX;
  o.regionInsideMap = HOUSE.x0 >= 0 && HOUSE.y0 >= 0 && HOUSE.x1 < W && HOUSE.y1 < H;

  /* pristine heights BEFORE anything enters — reading them back through
     _houseRestore would make the restore check below circular */
  const sample = [];
  for(let y = HOUSE.y0; y <= HOUSE.y1; y += 7)
    for(let x = HOUSE.x0; x <= HOUSE.x1; x += 7) sample.push([x, y]);
  o.sampleCount = sample.length;
  _houseRestore();
  const pristine = sample.map(([x, y]) => hts[y][x]);
  o.wildVaries = new Set(pristine.map(v => Math.round(v * 1000))).size > 1;

  /* one room carved: its interior is floor, an unbuilt cell is solid rock */
  freshHouse();
  const org = roomOrigin(HOUSE_ENTRY.gx, HOUSE_ENTRY.gy);
  let interiorFloor = true;
  for(let y = org.y + 1; y < org.y + HOUSE_RH; y++)
    for(let x = org.x + 1; x < org.x + HOUSE_RW; x++)
      if(houseTiles[y][x] !== T_FLOOR) interiorFloor = false;
  o.parlourInteriorIsFloor = interiorFloor;

  const empty = roomOrigin(0, 2);
  let emptySolid = true;
  for(let y = empty.y + 1; y < empty.y + HOUSE_RH; y++)
    for(let x = empty.x + 1; x < empty.x + HOUSE_RW; x++)
      if(houseTiles[y][x] !== T_WALL) emptySolid = false;
  o.unbuiltCellIsSolid = emptySolid;

  /* a doorway opens between two built neighbours, and closes again */
  const wallX = org.x + HOUSE_RW, wallY = org.y + Math.floor(HOUSE_RH / 2);
  o.wallBefore = houseTiles[wallY][wallX];
  houseRooms()['2,0'] = 'kitchen'; houseCarve();
  o.wallWithNeighbour = houseTiles[wallY][wallX];
  delete houseRooms()['2,0']; houseCarve();
  o.wallAfterRemoval = houseTiles[wallY][wallX];

  /* the terrain is flattened on entry and PUT BACK on exit */
  _houseFlatten();
  const flat = sample.map(([x, y]) => hts[y][x]);
  o.flatIsLevel = new Set(flat.map(v => Math.round(v * 1000))).size === 1;
  o.flatChangedThings = flat.some((v, k) => v !== pristine[k]);
  o.flatValue = flat[0]; o.houseFY = houseFY;
  _houseRestore();
  const back = sample.map(([x, y]) => hts[y][x]);
  o.heightsRestored = pristine.every((v, k) => v === back[k]);
  o.restoreMismatch = pristine.filter((v, k) => v !== back[k]).length;

  /* the world swap flips every flag together */
  freshHouse();
  o.insideFlags = {inHouse, tilesAreHouse: tiles === houseTiles,
                   worldHidden: worldGroup.visible === false, houseShown: houseGroup.visible === true};
  exitHouse();
  o.outsideFlags = {inHouse, tilesAreMain: tiles === TILES_MAIN,
                    worldShown: worldGroup.visible === true, houseHidden: houseGroup.visible === false};

  if(inHouse) exitHouse();
  return o;
`);

const S = new Suite('walktest').guard(T);

S.eq('the whole grid is built',                   T.rooms, 9);
S.ok('the flood reaches a lot of floor',          T.reachableCount > 800,
     `${T.reachableCount} tiles reachable from just inside the front door`);

S.eq('EVERY BUILT ROOM IS REACHABLE',             T.unreachableRooms.length, 0);
if(T.unreachableRooms.length) S.note('sealed: ' + T.unreachableRooms.join(', '));
const partial = Object.entries(T.roomReach || {}).filter(([, r]) => r.reached < r.tiles);
S.eq('  and fully walkable inside',               partial.length, 0);
if(partial.length) S.note(partial.map(([t, r]) => `${t} ${r.reached}/${r.tiles}`).join(', '));

S.ok('there are internal doorways to check',      T.internalDoorways > 0,
     `${T.internalDoorways} doorways between rooms`);
S.eq('EVERY INTERNAL DOORWAY IS WALKABLE',        T.blockedDoorways.length, 0);
if(T.blockedDoorways.length) S.note(T.blockedDoorways.join(', '));

/* the front door is a click, not a step */
S.ok('the front door tile is floor',              T.frontDoor.tileIsFloor);
S.ok('  and carries the exit object',             T.frontDoor.hasExitObject);
S.ok('  which blocks, so you click it rather than walk through', T.frontDoor.blocks);
S.ok('  and you can stand in front of it',        T.frontDoor.standInFront);
S.eq('  its first option is Leave',               (T.frontDoor.options || [])[0], 'Leave your cottage');

S.ok('there are walls to check',                  T.wallsChecked > 100, `${T.wallsChecked} wall tiles`);
S.eq('WALLS BLOCK',                               T.wallsWalkable, 0);

S.ok('most furniture was probed',                 T.probed > 100, `${T.probed} pieces built and probed`);
S.ok('  solid and flat pieces both present',      T.solidCount > 0 && T.flatCount > 0,
     `${T.solidCount} solid, ${T.flatCount} walkable`);
S.eq('SOLID FURNITURE BLOCKS',                    T.solidWrong.length, 0);
if(T.solidWrong.length) S.note(T.solidWrong.slice(0, 8).join('; '));
S.eq('WALKABLE FURNITURE DOES NOT',               T.flatWrong.length, 0);
if(T.flatWrong.length) S.note(T.flatWrong.slice(0, 8).join('; '));

S.ok('there are flat-floor pieces',               T.flatFloorPieces.length > 0, T.flatFloorPieces.join(', '));
S.eq('A RUG IS FLOOR — you can stand on it',      T.flatFloorBlocking.length, 0);
if(T.flatFloorBlocking.length) S.note(T.flatFloorBlocking.join(', '));

/* ---- the carve and the dead zone (moved from poh15) ---------------------- */
S.eq('the house grid is 3x3',                     [T.grid.GW, T.grid.GH], [3, 3]);
S.eq('each room is 12x10',                        [T.grid.RW, T.grid.RH], [12, 10]);
S.ok('the region fits inside the map',            T.regionInsideMap);
S.ok('IT SITS IN WALKABLE DEEP WILDERNESS',       T.regionIsDeepWilderness,
     `house ends at x${T.HOUSE.x1}, campus starts at x112`);
S.ok('the parlour interior is all floor',         T.parlourInteriorIsFloor);
S.ok('AN UNBUILT CELL IS SOLID ROCK',             T.unbuiltCellIsSolid,
     'if this fails you can walk into a room you never built');
S.ok('a shared wall opens for a neighbour',       T.wallBefore !== T.wallWithNeighbour,
     `${T.wallBefore} -> ${T.wallWithNeighbour}`);
S.eq('  and closes again when it is gone',        T.wallAfterRemoval, T.wallBefore);
S.ok('the wilderness under the house is uneven',  T.wildVaries,
     `${T.sampleCount} sample points — if this were flat the restore check proves nothing`);
S.ok('entering levels the ground',                T.flatIsLevel, `all at ${T.flatValue}`);
S.eq('  to houseFY',                              T.flatValue, T.houseFY);
S.ok('  and that really moved the terrain',       T.flatChangedThings);
S.ok('LEAVING PUTS THE HILLS BACK',               T.heightsRestored,
     `${T.restoreMismatch} of ${T.sampleCount} sample points did not come back`);
S.eq('inside: every flag agrees',                 T.insideFlags,
     {inHouse: true, tilesAreHouse: true, worldHidden: true, houseShown: true});
S.eq('outside: every flag agrees',                T.outsideFlags,
     {inHouse: false, tilesAreMain: true, worldShown: true, houseHidden: true});

S.report(
  'Every room in a full house is reachable from the front door, walls block, flat pieces are walkable, and the carve leaves unbuilt cells solid while the terrain is put back on exit.',
  'how walking actually feels — pathing, camera and collision against the models need a browser.');
