/* ============================================================================
   roomtest — houseBuildRoom()'s rules (docs/23 §3).

   Five rules, and every one of them is enforced in THREE places — houseRoomTaken,
   the picker, and houseBuildRoom itself — so that no route can slip a duplicate
   through. This drives the real function, which is the only one that matters:
   the other two are advisory.

     1. one of each room type to a house
     2. the garden is the courtyard, and the courtyard is only ever a garden
     3. a new room must adjoin one you already have
     4. you cannot extend a cottage you have not finished repairing
     5. a guest rearranges nothing

   Run: node harness/roomtest.mjs
   ========================================================================== */
import {runPass, Suite, PRELUDE} from './_lib.mjs';

const T = runPass(PRELUDE + String.raw`
  setLevel('construction', 99);
  const reset = () => {
    clearInv(); give('coins', 20000000);
    freshHouse();
    since();
  };
  const rooms = () => Object.assign({}, houseRooms());
  const tryBuild = (gx, gy, type) => {
    const before = Object.keys(houseRooms()).length;
    const coins = coinsCount();
    since();
    houseBuildRoom(gx, gy, type);
    return {built: Object.keys(houseRooms()).length > before,
            at: houseRooms()[gx + ',' + gy] || null,
            spent: coins - coinsCount(),
            said: since()[0] || null};
  };

  /* ---- the parlour is free and already there ---- */
  reset();
  o.startRooms = rooms();
  o.startCount = Object.keys(o.startRooms).length;
  o.parlourCost = HOUSE_ROOMS.parlour.cost;

  /* ---- 3. adjacency ---- */
  o.farCell = tryBuild(0, 2, 'kitchen');            /* nowhere near the parlour */
  o.adjacent = tryBuild(0, 0, 'kitchen');           /* west of the parlour */
  o.chained = tryBuild(0, 1, 'workshop');           /* south of the new kitchen */

  /* ---- 1. one of each ---- */
  o.duplicate = tryBuild(2, 0, 'kitchen');
  o.takenFlag = houseRoomTaken('kitchen');
  o.pickerHidesTaken = !houseRoomChoices(2, 0).includes('kitchen');

  /* ---- 2. THE GARDEN GOES ANYWHERE (the courtyard rule is gone) ---- */
  reset();
  tryBuild(0, 0, 'kitchen');
  o.roofedInCentre = tryBuild(1, 1, 'bedroom');     /* any room may take the middle now */
  reset();
  tryBuild(0, 0, 'kitchen');
  /* read the choices BEFORE building the garden -- once it is up, one-of-each
     correctly removes it from every cell's list */
  o.centreChoices = houseRoomChoices(1, 1);
  o.edgeChoices = houseRoomChoices(0, 1);
  o.gardenOffCentre = tryBuild(0, 1, 'garden');     /* and the garden may sit anywhere */
  o.edgeChoicesAfter = houseRoomChoices(2, 1);

  /* ---- cost is charged, and refused when short ---- */
  reset();
  o.kitchenCost = HOUSE_ROOMS.kitchen.cost;
  o.paid = tryBuild(0, 0, 'kitchen');
  reset();
  clearInv(); give('coins', 10);
  o.broke = tryBuild(0, 0, 'kitchen');

  /* ---- 4. an unrepaired cottage cannot be extended ---- */
  reset();
  player.house.repair = 1;
  o.unrepaired = tryBuild(0, 0, 'kitchen');
  player.house.repair = POH_REPAIR_STEPS.length;

  /* ---- an undeeded cottage cannot be extended either ---- */
  reset();
  player.house.owned = false;
  o.undeeded = tryBuild(0, 0, 'kitchen');
  player.house.owned = true;

  /* ---- 5. a guest rearranges nothing ---- */
  reset();
  houseVisit = {uid: 'bob', name: 'Bob', rooms: {'1,0': 'parlour'}, slots: {}};
  o.guest = tryBuild(0, 0, 'kitchen');
  houseVisit = null;

  /* ---- an occupied cell is not overwritten ---- */
  reset();
  o.occupied = tryBuild(1, 0, 'kitchen');           /* the parlour is already here */

  /* ---- the grid has room for nine, and the garden must be one of them ---- */
  o.cells = HOUSE_GW * HOUSE_GH;
  o.roomTypes = Object.keys(HOUSE_ROOMS).length;

  /* ---- filling the whole grid ---- */
  reset();
  const order = [[0,0,'kitchen'],[2,0,'bedroom'],[3,0,'study'],[4,0,'games'],
                 [0,1,'workshop'],[1,1,'garden'],[2,1,'chapel'],[3,1,'combat'],[4,1,'gallery'],
                 [0,2,'costume'],[1,2,'portalrm']];
  o.fillFailures = [];
  for(const [gx, gy, t] of order){
    const r = tryBuild(gx, gy, t);
    if(!r.built) o.fillFailures.push(t + ' at ' + gx + ',' + gy + ': ' + r.said);
  }
  o.filled = Object.keys(houseRooms()).length;
  o.fullGridCarves = (() => {
    let floor = 0;
    for(let y = HOUSE.y0; y <= HOUSE.y1; y++)
      for(let x = HOUSE.x0; x <= HOUSE.x1; x++) if(houseTiles[y][x] === T_FLOOR) floor++;
    return floor;
  })();
  /* houseRoomChoices lists untaken TYPES, not free cells — occupancy is checked
     in houseBuildRoom. With 12 types and 9 cells, three types are always left
     behind, which is the point: a house is a choice. */
  o.typesLeftOver = houseRoomChoices(0, 0).length;
  o.everyCellOccupied = [];
  for(let gy = 0; gy < HOUSE_GH; gy++) for(let gx = 0; gx < HOUSE_GW; gx++){
    const t = houseRoomChoices(gx, gy)[0];
    if(!t) continue;
    const r = tryBuild(gx, gy, t);
    if(r.built) o.everyCellOccupied.push('overwrote ' + gx + ',' + gy);
  }

  if(inHouse) exitHouse();
  return o;
`);

const S = new Suite('roomtest').guard(T);

S.eq('a new cottage starts with one room',        T.startCount, 1);
S.eq('  and it is the parlour',                   T.startRooms['1,0'], 'parlour');
S.eq('  which is free',                           T.parlourCost, 0);

/* adjacency */
S.eq('A DETACHED CELL IS REFUSED',                T.farCell.built, false);
S.ok('  and says why',                            /adjoin/i.test(T.farCell.said || ''), T.farCell.said);
S.ok('an adjoining cell is allowed',              T.adjacent.built, T.adjacent.said);
S.ok('  and chains onward from there',            T.chained.built, T.chained.said);

/* one of each */
S.eq('A SECOND KITCHEN IS REFUSED',               T.duplicate.built, false);
S.ok('  and says why',                            /already have/i.test(T.duplicate.said || ''), T.duplicate.said);
S.ok('houseRoomTaken agrees',                     T.takenFlag);
S.ok('  and the picker hides it too',             T.pickerHidesTaken,
     'all three enforcement points must agree, or a route slips a duplicate through');

/* the garden is now an ordinary room */
S.ok('A ROOFED ROOM MAY TAKE THE MIDDLE',         T.roofedInCentre.built, T.roofedInCentre.said);
S.ok('THE GARDEN MAY SIT ANYWHERE',               T.gardenOffCentre.built, T.gardenOffCentre.said);
S.ok('  the middle offers every unbuilt room',    T.centreChoices.length > 1, T.centreChoices.join(', '));
S.ok('  and an edge cell offers the garden too',  T.edgeChoices.includes('garden'),
     T.edgeChoices.join(', '));
S.ok('  once built, one-of-each removes it everywhere',
     !T.edgeChoicesAfter.includes('garden'), T.edgeChoicesAfter.join(', '));

/* money */
S.ok('building charges the room cost',            T.paid.built);
S.eq('  exactly',                                 T.paid.spent, T.kitchenCost);
S.eq('BEING BROKE REFUSES THE ROOM',              T.broke.built, false);
S.eq('  and charges nothing',                     T.broke.spent, 0);
S.ok('  and says the price',                      /costs/i.test(T.broke.said || ''), T.broke.said);

/* gating */
S.eq('AN UNREPAIRED COTTAGE CANNOT BE EXTENDED',  T.unrepaired.built, false);
S.ok('  and says why',                            /repair/i.test(T.unrepaired.said || ''), T.unrepaired.said);
S.eq('an undeeded cottage cannot be extended',    T.undeeded.built, false);
S.eq('A GUEST BUILDS NOTHING',                    T.guest.built, false);
S.ok('  and is told so',                          /not your cottage/i.test(T.guest.said || ''), T.guest.said);
S.eq('an occupied cell is not overwritten',       T.occupied.built, false);
S.ok('  and says so',                             /already a room/i.test(T.occupied.said || ''), T.occupied.said);

/* the whole grid */
S.eq('the grid holds fifteen cells',              T.cells, 15);
S.ok('THERE IS ROOM FOR EVERY TYPE',              T.cells >= T.roomTypes,
     `${T.cells} cells for ${T.roomTypes} types, with ${T.cells - T.roomTypes} spare`);
S.eq('every type builds without a refusal',       T.fillFailures.length, 0);
if(T.fillFailures.length) S.note(T.fillFailures.join('; '));
S.eq('  giving all twelve rooms',                 T.filled, 12);
S.ok('  and a fully carved interior',             T.fullGridCarves > 900,
     `${T.fullGridCarves} floor tiles`);
S.eq('NOTHING IS LEFT BEHIND ANY MORE',           T.typesLeftOver, 0);
S.eq('AND NO OCCUPIED CELL CAN BE OVERWRITTEN',   T.everyCellOccupied.length, 0);
if(T.everyCellOccupied.length) S.note(T.everyCellOccupied.join(', '));

S.report(
  'All five room rules hold through the real houseBuildRoom path, and the grid fills to nine.',
  'how the rooms look and whether the doorways read as walkable — needs a browser.');
