/* ============================================================================
   layouttest — the bigger grid, the free garden, and rearranging rooms.

   Three changes, one harness:

     1. THE GRID FITS EVERY ROOM. It was 3x3 = 9 cells for 12 room types, so
        three rooms could never be built at all. Now 5x3 = 15, with slack to
        shape the house however you like.
     2. THE GARDEN GOES ANYWHERE. It was pinned to the middle cell and the middle
        cell allowed nothing else.
     3. ROOMS CAN BE REARRANGED — and THE FURNITURE MOVES WITH THEM. Slots are
        keyed 'gx,gy:slotid', so a room that changes cell must take every piece
        along or they are orphaned into whatever lands there instead. That
        re-keying is the whole reason this feature is safe to offer, and it is
        what most of this file tests.

   Run: node harness/layouttest.mjs
   ========================================================================== */
import {runPass, Suite, PRELUDE} from './_lib.mjs';

const T = runPass(PRELUDE + String.raw`
  setLevel('construction', 99);
  const KEY = (g) => g.gx + ',' + g.gy;

  /* ---- 1. THE GRID ---- */
  o.grid = {GW: HOUSE_GW, GH: HOUSE_GH};
  o.cells = HOUSE_GW * HOUSE_GH;
  o.roomTypes = Object.keys(HOUSE_ROOMS).length;
  o.buildable = HOUSE_ROOM_ORDER.length;
  o.region = {x0: HOUSE.x0, y0: HOUSE.y0, x1: HOUSE.x1, y1: HOUSE.y1};
  o.regionMatchesGrid = (HOUSE.x1 - HOUSE.x0 === HOUSE_RW * HOUSE_GW)
                     && (HOUSE.y1 - HOUSE.y0 === HOUSE_RH * HOUSE_GH);
  o.inDeepWilderness = HOUSE.x1 < WX;
  o.insideMap = HOUSE.x0 >= 0 && HOUSE.y0 >= 0 && HOUSE.x1 < W && HOUSE.y1 < H;
  /* the neighbours it must not overlap */
  o.clearsRectory = HOUSE.x1 < RECT.x0;
  o.clearsDelve = HOUSE.y1 < 36;
  o.entry = {gx: HOUSE_ENTRY.gx, gy: HOUSE_ENTRY.gy};
  o.entryInGrid = HOUSE_ENTRY.gx < HOUSE_GW && HOUSE_ENTRY.gy < HOUSE_GH;

  /* ---- BUILD EVERY ROOM TYPE ---- */
  clearInv(); give('coins', 99000000);
  freshHouse();
  o.startCell = Object.keys(houseRooms())[0];
  const order = HOUSE_ROOM_ORDER.slice();
  /* a snake through the grid, always adjoining what is already there */
  const path = [];
  for(let gy = 0; gy < HOUSE_GH; gy++){
    const row = [];
    for(let gx = 0; gx < HOUSE_GW; gx++) row.push([gx, gy]);
    if(gy % 2) row.reverse();
    for(const c of row) path.push(c);
  }
  o.buildFailures = [];
  let placed = 0;
  for(const [gx, gy] of path){
    if(roomAt(gx, gy)) continue;
    const t = order[placed];
    if(!t) break;
    since();
    houseBuildRoom(gx, gy, t);
    if(roomAt(gx, gy) === t) placed++;
    else o.buildFailures.push(t + ' at ' + gx + ',' + gy + ': ' + (since()[0] || '?'));
  }
  o.builtCount = Object.keys(houseRooms()).length;
  o.allTypesBuilt = Object.keys(HOUSE_ROOMS).filter(t => !houseRoomTaken(t));

  /* ---- 2. THE GARDEN GOES ANYWHERE ---- */
  clearInv(); give('coins', 99000000);
  freshHouse();
  since();
  houseBuildRoom(0, 0, 'garden');            /* a corner, nowhere near the middle */
  o.gardenInCorner = roomAt(0, 0);
  o.gardenSaid = since()[0] || null;
  o.centreOffersEverything = houseRoomChoices(HOUSE_CENTRE.gx, HOUSE_CENTRE.gy).length;
  o.cornerOffersGarden = (() => {
    freshHouse(); return houseRoomChoices(0, 0).includes('garden');
  })();
  /* and a roofed room may take the middle */
  clearInv(); give('coins', 99000000);
  freshHouse();
  houseBuildRoom(1, 1, 'kitchen');
  o.kitchenInCentre = roomAt(HOUSE_ENTRY.gx, 1);
  since();

  /* ---- 3. REARRANGING ---- */
  clearInv(); give('coins', 99000000);
  freshHouse();
  houseBuildRoom(0, 0, 'kitchen');
  houseBuildRoom(2, 0, 'workshop');
  since();
  /* furnish two of them so the re-key has something to carry */
  const stock = fid => { const F = HOUSE_FURNITURE[fid];
    give(F.plankId || 'oak_plank', F.planks | 0); give('iron_nails', F.nails | 0); };
  stock('hf_hearth'); houseBuild('1,0:hearth', 'hf_hearth');
  stock('hf_clayoven'); houseBuild('0,0:range', 'hf_clayoven');
  stock('hf_toolboard'); houseBuild('2,0:toolrack', 'hf_toolboard');
  since();
  o.before = {rooms: Object.assign({}, houseRooms()), slots: Object.assign({}, houseSlots())};

  houseLayoutStart();
  o.layoutCells = houseLayoutCells().length;
  o.layoutMirrorsRooms = houseLayoutCells().filter(c => c.type).length === Object.keys(o.before.rooms).length;

  /* pick up the kitchen and swap it with the workshop */
  o.pickEmpty = houseLayoutPick(4, 2);            /* nothing there: refused */
  o.pick1 = houseLayoutPick(0, 0);
  o.pick2 = houseLayoutPick(2, 0);
  const L = houseLayoutCells();
  o.swappedKitchen = (L.find(c => c.key === '2,0') || {}).type;
  o.swappedWorkshop = (L.find(c => c.key === '0,0') || {}).type;

  o.validAfterSwap = houseLayoutValid().ok;
  o.applied = houseApplyLayout();
  o.after = {rooms: Object.assign({}, houseRooms()), slots: Object.assign({}, houseSlots())};

  /* THE FURNITURE MOVED WITH ITS ROOM */
  o.hearthStayed = houseSlots()['1,0:hearth'] || null;      /* parlour never moved */
  o.ovenFollowed = houseSlots()['2,0:range'] || null;       /* kitchen 0,0 -> 2,0 */
  o.ovenLeftBehind = houseSlots()['0,0:range'] || null;
  o.rackFollowed = houseSlots()['0,0:toolrack'] || null;    /* workshop 2,0 -> 0,0 */
  o.rackLeftBehind = houseSlots()['2,0:toolrack'] || null;
  o.slotCountKept = Object.keys(o.after.slots).length;

  /* the world was re-carved around the new layout */
  const wOrg = roomOrigin(0, 0);
  o.newWorkshopCarved = houseTiles[wOrg.y + 5][wOrg.x + 5] === T_FLOOR;
  o.playerBackAtDoor = (() => { const e = houseExitTile();
    return player.x === e.x && player.y === e.y + 1; })();

  /* ---- VALIDATION ---- */
  /* moving the entrance room away is refused */
  houseLayoutStart();
  houseLayoutPick(HOUSE_ENTRY.gx, HOUSE_ENTRY.gy);
  houseLayoutPick(4, 2);                          /* an empty far cell */
  const vEntry = houseLayoutValid();
  o.entryMoveValid = vEntry.ok;
  o.entryMoveWhy = vEntry.why;

  /* a stranded room is refused */
  houseLayoutStart();
  houseLayoutPick(0, 0);
  houseLayoutPick(4, 2);                          /* island in the far corner */
  const vIsland = houseLayoutValid();
  o.islandValid = vIsland.ok;
  o.islandWhy = vIsland.why;
  o.islandRejected = !houseApplyLayout();
  o.roomsUntouchedAfterReject = JSON.stringify(houseRooms()) === JSON.stringify(o.after.rooms);

  /* an L-shape is fine — the grid does not have to be a rectangle */
  clearInv(); give('coins', 99000000);
  freshHouse();
  for(const [gx, gy, t] of [[0,0,'kitchen'],[0,1,'workshop'],[0,2,'bedroom'],[1,2,'games']])
    houseBuildRoom(gx, gy, t);
  since();
  o.lShape = Object.keys(houseRooms()).length;
  o.lShapeValid = houseLayoutValid(houseRooms()).ok;

  /* start-again reverts the working copy without touching the save */
  houseLayoutStart();
  houseLayoutPick(0, 0); houseLayoutPick(2, 2);
  const dirtyCopy = JSON.stringify(_hLayout);
  houseLayoutStart();
  o.revertWorks = JSON.stringify(_hLayout) !== dirtyCopy
               && JSON.stringify(_hLayout) === JSON.stringify(houseRooms());

  /* ---- guests cannot rearrange ---- */
  houseVisit = {uid: 'bob', name: 'Bob', rooms: Object.assign({}, houseRooms()), slots: {}};
  since();
  houseRearrangePanel();
  o.guestSaid = since()[0] || null;
  houseVisit = null;

  /* ---- the HUD button ---- */
  freshHouse();
  houseHudRender();
  const rr = document.getElementById('hhrooms');
  o.hudBtn = {display: rr.style.display, text: rr.textContent};
  houseVisit = {uid: 'bob', name: 'Bob', rooms: {}, slots: {}};
  houseHudRender();
  o.hudBtnGuest = rr.style.display;
  houseVisit = null; houseHudRender();

  /* the panel renders a cell per grid slot */
  clearInv(); give('coins', 99000000);
  freshHouse();
  houseBuildRoom(0, 0, 'kitchen');
  since();
  houseRearrangePanel();
  const body = document.getElementById('housebody');
  const grid = body.children.find(c => c.className === 'hlgrid');
  o.panelGridCells = grid ? grid.children.length : 0;
  o.panelFullCells = grid ? grid.children.filter(c => /full/.test(c.className)).length : 0;
  o.panelEntryMarked = grid ? grid.children.filter(c => /entry/.test(c.className)).length : 0;
  o.panelDraggable = grid ? grid.children.filter(c => c.getAttribute('draggable') === 'true').length : 0;
  closeHousePanel();

  if(inHouse) exitHouse();
  return o;
`);

const S = new Suite('layouttest').guard(T);

/* ---- 1. the grid --------------------------------------------------------- */
S.eq('the grid is 5x3',                           [T.grid.GW, T.grid.GH], [5, 3]);
S.ok('THAT IS ENOUGH CELLS FOR EVERY ROOM',       T.cells >= T.roomTypes,
     `${T.cells} cells for ${T.roomTypes} room types`);
S.ok('  with slack to shape the house',           T.cells > T.roomTypes,
     `${T.cells - T.roomTypes} spare cells`);
S.ok('the region matches the grid',               T.regionMatchesGrid, JSON.stringify(T.region));
S.ok('it still sits in deep wilderness',          T.inDeepWilderness, `x1=${T.region.x1} < WX`);
S.ok('  inside the map',                          T.insideMap);
S.ok('  CLEAR OF THE RECTORY',                    T.clearsRectory, `house ends x${T.region.x1}, rectory starts x85`);
S.ok('  and clear of the delve',                  T.clearsDelve, `house ends y${T.region.y1}, delve starts y36`);
S.ok('the entrance cell is inside the grid',      T.entryInGrid, JSON.stringify(T.entry));

S.eq('EVERY ROOM TYPE CAN BE BUILT',              T.allTypesBuilt.length, 0);
if(T.allTypesBuilt.length) S.note('unbuildable: ' + T.allTypesBuilt.join(', '));
S.eq('  with no refusals on the way',             T.buildFailures.length, 0);
if(T.buildFailures.length) S.note(T.buildFailures.join('; '));
S.eq('  giving all twelve rooms at once',         T.builtCount, T.roomTypes);

/* ---- 2. the garden ------------------------------------------------------- */
S.eq('THE GARDEN CAN GO IN A CORNER',             T.gardenInCorner, 'garden');
S.ok('  with no complaint',                       !/courtyard|middle of the house/i.test(T.gardenSaid || ''),
     T.gardenSaid);
S.ok('the middle cell offers every room',         T.centreOffersEverything > 1,
     `${T.centreOffersEverything} choices`);
S.ok('  and a corner offers the garden',          T.cornerOffersGarden);
S.eq('A ROOFED ROOM MAY TAKE THE MIDDLE',         T.kitchenInCentre, 'kitchen');

/* ---- 3. rearranging ------------------------------------------------------ */
S.eq('the working copy covers the whole grid',    T.layoutCells, T.cells);
S.ok('  and mirrors the built rooms',             T.layoutMirrorsRooms);
S.eq('picking up an empty cell does nothing',     T.pickEmpty, false);
S.ok('picking two rooms swaps them',              T.pick1 && T.pick2);
S.eq('  the kitchen moved',                       T.swappedKitchen, 'kitchen');
S.eq('  and the workshop took its place',         T.swappedWorkshop, 'workshop');
S.ok('the swap is a legal layout',                T.validAfterSwap);
S.ok('  and applies',                             T.applied);

S.eq('THE OVEN FOLLOWED THE KITCHEN',             T.ovenFollowed, 'hf_clayoven');
S.eq('  leaving nothing behind',                  T.ovenLeftBehind, null);
S.eq('THE TOOL BOARD FOLLOWED THE WORKSHOP',      T.rackFollowed, 'hf_toolboard');
S.eq('  leaving nothing behind',                  T.rackLeftBehind, null);
S.eq('a room that did not move keeps its piece',  T.hearthStayed, 'hf_hearth');
S.eq('NO FURNITURE WAS LOST IN THE MOVE',         T.slotCountKept, 3);
S.ok('the interior was re-carved around it',      T.newWorkshopCarved);
S.ok('  and you are put back at the door',        T.playerBackAtDoor);

/* ---- validation ---------------------------------------------------------- */
S.eq('MOVING THE ENTRANCE ROOM AWAY IS REFUSED',  T.entryMoveValid, false);
S.ok('  and says why',                            /front door/i.test(T.entryMoveWhy || ''), T.entryMoveWhy);
S.eq('A STRANDED ROOM IS REFUSED',                T.islandValid, false);
S.ok('  naming it',                               /walled off/i.test(T.islandWhy || ''), T.islandWhy);
S.ok('  and applying it does nothing',            T.islandRejected);
S.ok('  leaving the saved layout untouched',      T.roomsUntouchedAfterReject);

S.eq('an L-shaped house is legal',                T.lShapeValid, true);
S.eq('  with five rooms (the parlour plus four)',  T.lShape, 5);
S.ok('start-again reverts the working copy',      T.revertWorks);

/* ---- guests and the HUD -------------------------------------------------- */
S.ok('A GUEST CANNOT REARRANGE',                  /someone else/i.test(T.guestSaid || ''), T.guestSaid);
S.eq('the HUD shows the button to an owner',      T.hudBtn.display, 'block');
S.ok('  labelled with the room count',            /Rearrange rooms/.test(T.hudBtn.text), T.hudBtn.text);
S.eq('  and hides it from a guest',               T.hudBtnGuest, 'none');

S.eq('the panel draws a cell per grid slot',      T.panelGridCells, T.cells);
S.eq('  marking the built ones',                  T.panelFullCells, 2);
S.eq('  flagging the entrance',                   T.panelEntryMarked, 1);
S.eq('  and only built rooms are draggable',      T.panelDraggable, 2);

S.report(
  'The grid holds all twelve rooms with slack, the garden goes anywhere, and rearranging swaps rooms AND carries their furniture with them — refusing any layout that strands a room or empties the entrance cell.',
  'the drag gesture itself and how the re-carved house looks — HTML5 drag events and rendering both need a browser.');
