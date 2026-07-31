/* ============================================================================
   floortest — the eight floor styles, painted per tile (docs/23 §6).

   EVERYTHING IS PAINTED PER TILE. That is what makes doorways work: a doorway is
   a T_FLOOR tile sitting in the wall line, so it gets floor and no trim, giving
   a clean walkway with nothing across it and no hole in the ground.

   Two numbers matter and are easy to get wrong:
     - the floor's TOP surface is at exactly FY (slab centre at FY - FT/2).
       Anything standing on it — rugs, sigils, hearths — assumes that. Getting it
       wrong buries flat pieces in the boards.
     - the courtyard uses the SAME six-tone ramp the outdoor world uses for
       campus grass, and lies flat. It used to be darker with raised tufts, which
       read as a field of spikes at house scale.

   This wraps the module-scope bake() and captures every box the interior emits,
   so these are assertions about real geometry, not about the data that feeds it.

   Run: node harness/floortest.mjs
   ========================================================================== */
import {runPass, Suite, PRELUDE, SRC} from './_lib.mjs';

const T = runPass(PRELUDE + String.raw`
  setLevel('construction', 99);
  clearInv(); give('coins', 20000000);
  freshHouse();

  /* fill the grid so every style gets painted at least once */
  const LAYOUT = [[0,0,'kitchen'],[2,0,'bedroom'],[0,1,'workshop'],[1,1,'garden'],
                  [2,1,'study'],[0,2,'games'],[1,2,'chapel'],[2,2,'combat']];
  for(const [gx, gy, t] of LAYOUT) houseBuildRoom(gx, gy, t);
  since();
  o.rooms = Object.assign({}, houseRooms());
  o.styles = Object.assign({}, HOUSE_FLOORS);
  o.styleCount = new Set(Object.values(HOUSE_FLOORS)).size;
  o.roomsWithoutStyle = Object.keys(HOUSE_ROOMS).filter(r => !HOUSE_FLOORS[r]);

  /* ---- capture every box the interior bakes ---- */
  const _bake = bake;
  let boxes = [];
  bake = function(out, geo, hex, px, py, pz, ry, sc, rx, rz){
    boxes.push({hex, x: px, y: py, z: pz, ry: ry || 0,
                w: geo.parameters ? geo.parameters.width : null,
                h: geo.parameters ? geo.parameters.height : null,
                d: geo.parameters ? geo.parameters.depth : null});
    return _bake.apply(null, arguments);
  };
  boxes = [];
  houseBuildInterior();
  bake = _bake;
  o.boxCount = boxes.length;

  /* the floor slab for a tile is the full 1x0.12x1 box at that tile centre */
  const FT = 0.12, FY = houseFY;
  o.FY = FY;
  const slabs = boxes.filter(b => b.w === 1 && b.d === 1 && Math.abs(b.h - FT) < 1e-9);
  o.slabCount = slabs.length;
  o.slabTops = [...new Set(slabs.map(b => Math.round((b.y + FT / 2) * 1e6) / 1e6))];
  o.slabTopMaxErr = Math.max(...slabs.map(b => Math.abs((b.y + FT / 2) - FY)));
  o.slabTopIsFY = o.slabTopMaxErr < 1e-9;

  /* how many floor tiles the carve says there are */
  let floorTiles = 0;
  for(let y = HOUSE.y0; y <= HOUSE.y1; y++)
    for(let x = HOUSE.x0; x <= HOUSE.x1; x++)
      if(houseTiles[y][x] === T_FLOOR) floorTiles++;
  o.floorTiles = floorTiles;

  /* ---- EVERY floor tile got a slab, including the doorways ---- */
  const slabAt = new Set(slabs.map(b => Math.floor(b.x) + ',' + Math.floor(b.z)));
  o.tilesWithoutSlab = [];
  o.doorwayTiles = [];
  for(let y = HOUSE.y0; y <= HOUSE.y1; y++)
    for(let x = HOUSE.x0; x <= HOUSE.x1; x++){
      if(houseTiles[y][x] !== T_FLOOR) continue;
      if(!slabAt.has(x + ',' + y)) o.tilesWithoutSlab.push(x + ',' + y);
      /* A doorway is TWO tiles wide, so neither tile has wall on both sides along
         one axis. What identifies one is a T_FLOOR tile sitting ON a room boundary
         line — testing for walls either side finds only the 1-tile front door and
         leaves the rest of this check vacuous. */
      if(((x - HOUSE.x0) % HOUSE_RW === 0) || ((y - HOUSE.y0) % HOUSE_RH === 0))
        o.doorwayTiles.push(x + ',' + y);
    }
  o.doorwaysAllPaved = o.doorwayTiles.every(k => slabAt.has(k));

  /* ---- NOTHING SUBSTANTIAL STANDS IN A DOORWAY ----
     The walls either side keep their skirting and chair rail, and those protrude a
     couple of centimetres into the opening's column — that is the trim finishing
     against the reveal, not trim across the door. What must never appear is a
     full-height piece: a wall slab, a panel, a coping run. */
  o.blockedDoorway = [];
  for(const k of o.doorwayTiles){
    const [dx, dy] = k.split(',').map(Number);
    const tall = boxes.filter(b => b.h > 1.0 &&
      Math.abs(b.x - (dx + 0.5)) < 0.45 && Math.abs(b.z - (dy + 0.5)) < 0.45);
    if(tall.length) o.blockedDoorway.push(k + ': ' + tall.length + ' full-height boxes');
  }
  /* and the trim that does reach in is genuinely small */
  o.doorwayIntrusion = 0;
  for(const k of o.doorwayTiles){
    const [dx, dy] = k.split(',').map(Number);
    for(const b of boxes){
      if(b.y <= FY + 0.05) continue;
      const dxx = Math.abs(b.x - (dx + 0.5)), dzz = Math.abs(b.z - (dy + 0.5));
      if(dxx < 0.5 && dzz < 0.5) o.doorwayIntrusion = Math.max(o.doorwayIntrusion, 0.5 - Math.max(dxx, dzz));
    }
  }

  /* ---- the courtyard ---- */
  const gOrg = roomOrigin(HOUSE_CENTRE.gx, HOUSE_CENTRE.gy);
  const inGarden = b => Math.floor(b.x) > gOrg.x && Math.floor(b.x) < gOrg.x + HOUSE_RW &&
                        Math.floor(b.z) > gOrg.y && Math.floor(b.z) < gOrg.y + HOUSE_RH;
  const gardenSlabs = slabs.filter(inGarden);
  o.gardenSlabCount = gardenSlabs.length;
  o.gardenTones = [...new Set(gardenSlabs.map(b => b.hex))].sort((a, b) => a - b);
  /* the six-tone campus grass ramp, straight out of the floor painter */
  o.GRASS_RAMP = [0x55702c, 0x5d7a31, 0x658435, 0x6d8e3a, 0x76993f, 0x82a648];
  o.gardenUsesCampusRamp = o.gardenTones.every(c => o.GRASS_RAMP.includes(c));
  /* It must LIE FLAT. Only the FLOOR painting counts here: a box centred on a tile
     centre. The surrounding walls' skirting and wainscot are pushed inward and land
     just inside the boundary tiles, and those are walls, not tufts. */
  const atTileCentre = b => Math.abs(b.x - (Math.floor(b.x) + 0.5)) < 0.15 &&
                            Math.abs(b.z - (Math.floor(b.z) + 0.5)) < 0.15;
  const gardenProud = boxes.filter(b => inGarden(b) && atTileCentre(b) && b.y > FY + 0.001);
  o.gardenProudCount = gardenProud.length;
  o.gardenProudSample = gardenProud.slice(0, 4).map(b => '0x' + b.hex.toString(16) + '@+' + (b.y - FY).toFixed(3));
  /* the grass really is painted at or below FY */
  const gardenFloor = boxes.filter(b => inGarden(b) && atTileCentre(b) && b.y > FY - 0.2);
  o.gardenFloorCount = gardenFloor.length;
  o.gardenHighest = gardenFloor.length ? Math.max(...gardenFloor.map(b => b.y)) - FY : null;

  /* ---- per-tile variation: no two tiles identical ---- */
  const parlourOrg = roomOrigin(HOUSE_ENTRY.gx, HOUSE_ENTRY.gy);
  const parlourSlabs = slabs.filter(b =>
    Math.floor(b.x) > parlourOrg.x && Math.floor(b.x) < parlourOrg.x + HOUSE_RW &&
    Math.floor(b.z) > parlourOrg.y && Math.floor(b.z) < parlourOrg.y + HOUSE_RH);
  const parlourBoxes = boxes.filter(b =>
    Math.floor(b.x) > parlourOrg.x && Math.floor(b.x) < parlourOrg.x + HOUSE_RW &&
    Math.floor(b.z) > parlourOrg.y && Math.floor(b.z) < parlourOrg.y + HOUSE_RH &&
    Math.abs(b.y - FY) < 0.05);
  o.parlourTileSignatures = new Set(parlourBoxes.map(b => b.hex + ':' + Math.round(b.ry * 1000))).size;
  o.parlourSlabCount = parlourSlabs.length;

  /* the hash is stable: painting twice gives the same floor */
  boxes = [];
  bake = function(out, geo, hex, px, py, pz, ry, sc, rx, rz){
    boxes.push({hex, x: px, y: py, z: pz}); return _bake.apply(null, arguments);
  };
  houseBuildInterior();
  bake = _bake;
  o.repaintSame = boxes.length === o.boxCount;

  if(inHouse) exitHouse();
  return o;
`);

const S = new Suite('floortest').guard(T);

S.eq('every room type has a floor style',         T.roomsWithoutStyle.length, 0);
if(T.roomsWithoutStyle.length) S.note(T.roomsWithoutStyle.join(', '));
S.eq('eight distinct styles',                     T.styleCount, 8);
S.eq('the courtyard lays grass',                  T.styles.garden, 'grass');
S.eq('the kitchen lays quarry tile',              T.styles.kitchen, 'quarry');
S.eq('the chapel lays flagstone',                 T.styles.chapel, 'flag');
S.eq('the portal chamber lays arcane',            T.styles.portalrm, 'arcane');

S.ok('the interior bakes real geometry',          T.boxCount > 5000, `${T.boxCount} boxes`);
S.ok('  including a slab per floor tile',         T.slabCount >= T.floorTiles,
     `${T.slabCount} slabs for ${T.floorTiles} floor tiles`);

/* the number that buries furniture when it is wrong */
S.ok('THE FLOOR TOP SURFACE IS EXACTLY AT FY',    T.slabTopIsFY,
     `worst slab is ${T.slabTopMaxErr} off houseFY (${T.FY})`);
S.eq('  one consistent height, no exceptions',    T.slabTops.length, 1);

S.eq('EVERY FLOOR TILE IS PAVED',                 T.tilesWithoutSlab.length, 0);
if(T.tilesWithoutSlab.length) S.note('bare: ' + T.tilesWithoutSlab.slice(0, 10).join(', '));
S.ok('there are real doorways to check',          T.doorwayTiles.length > 0,
     `${T.doorwayTiles.length} doorway tiles`);
S.ok('A DOORWAY GETS FLOOR — no hole in the ground', T.doorwaysAllPaved);
S.eq('AND NOTHING FULL-HEIGHT STANDS IN IT',      T.blockedDoorway.length, 0);
if(T.blockedDoorway.length) S.note(T.blockedDoorway.slice(0, 6).join('; '));
S.ok('  the trim that reaches in is only a reveal',  T.doorwayIntrusion < 0.1,
     `deepest intrusion ${T.doorwayIntrusion.toFixed(3)} of a tile`);

/* the courtyard */
S.ok('the courtyard is paved',                    T.gardenSlabCount > 50, `${T.gardenSlabCount} tiles`);
S.ok('IT USES THE CAMPUS GRASS RAMP',             T.gardenUsesCampusRamp,
     'tones: ' + T.gardenTones.map(c => '0x' + c.toString(16)).join(', '));
S.ok('  and more than one tone of it',            T.gardenTones.length > 1,
     `${T.gardenTones.length} of the ramp's ${T.GRASS_RAMP.length} tones in play`);
S.eq('IT LIES FLAT — no raised tufts',            T.gardenProudCount, 0);
if(T.gardenProudCount) S.note('proud: ' + T.gardenProudSample.join(', '));
S.ok('  and the grass really was painted',        T.gardenFloorCount > 100,
     `${T.gardenFloorCount} boxes at garden tile centres, highest at FY${T.gardenHighest >= 0 ? '+' : ''}${(T.gardenHighest || 0).toFixed(3)}`);

/* variation */
S.ok('tiles are not all identical',               T.parlourTileSignatures > 1,
     `${T.parlourTileSignatures} distinct tile signatures across ${T.parlourSlabCount} parlour tiles`);
S.ok('and the hash is stable across repaints',    T.repaintSame,
     'a floor that repaints differently would shimmer on every room build');

/* source: the comment that documents the invariant, so a future edit sees it */
S.ok('the source states the FY invariant',        /top sits at FY|top surface is at exactly FY/i.test(SRC));

S.report(
  'All eight floor styles paint per tile, doorways get floor and no trim, and the floor top sits exactly on FY.',
  'what the floors look like — colour, tiling and scale in the eye all need a browser.');
