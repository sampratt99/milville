/* ============================================================================
   housebugs — five faults reported from a live cottage.

     1. the delve lobby ladder and chest were visible from inside the house
     2. staff could be hired from the HUD with no servant's bell built
     3. the pew faced away from the altar; dining chairs faced away from the table
     4. the Plain shelf's menu called it a Trophy shelf
     5. a fetch that did not fit DESTROYED the boards — worse than reported

   (5) is the serious one. The bank was decremented and then addItem(id, taken)
   was called ONCE; boards do not stack and addItem is all-or-nothing for a
   non-stackable, so with too few free slots it added NOTHING and returned false.
   The boards had already left the bank. They existed nowhere afterwards.

   Run: node harness/housebugs.mjs
   ========================================================================== */
import {runPass, Suite, PRELUDE, SRC} from './_lib.mjs';

const T = runPass(PRELUDE + String.raw`
  setLevel('construction', 99);

  /* ---------- 1. THE DELVE LOBBY STAYS OUT OF THE HOUSE ---------- */
  const LOB = Object.keys(_RAID_LOBBY_DEFS);
  const lobbyObjs = () => objects.filter(q => q && LOB[0] !== undefined && LOB.indexOf(q.def) >= 0
                                          && q.raidRoom === 0 && q.raidFloor === 1);
  const lobbyVisible = () => lobbyObjs().filter(q => q._m && q._m.group && q._m.group.visible).length;
  o.lobbyCount = lobbyObjs().length;

  /* stand them up as if you had just been in the delve, then walk into the house */
  const _raid = raid, _inRaid = inRaid;
  inRaid = true; raid = {floor: 1, rooms: [{}, {}], roomIdx: 0, started: true, rid: 't'};
  _raidSetLobbyObjVis(true);
  o.lobbyShownInDelve = lobbyVisible();
  inRaid = false; raid = _raid;

  clearInv(); give('coins', 99000000);
  freshHouse();
  o.lobbyVisibleFromHouse = lobbyVisible();

  /* and it cannot be turned back on from outside the delve */
  _raidSetLobbyObjVis(true);
  o.lobbyForcedOnFromHouse = lobbyVisible();
  inRaid = _inRaid;

  /* the lobby really is near the house, which is why this showed at all */
  const lob = lobbyObjs()[0];
  o.lobbyAt = lob ? {x: lob.x, y: lob.y} : null;
  o.houseBox = {x0: HOUSE.x0, y0: HOUSE.y0, x1: HOUSE.x1, y1: HOUSE.y1};

  /* ---------- 2. NO STAFF WITHOUT A BELL ---------- */
  clearInv(); give('coins', 99000000);
  freshHouse();
  player.house.servant = null;
  const bellKey = HOUSE_ENTRY.gx + ',' + HOUSE_ENTRY.gy + ':bell';
  delete houseSlots()[bellKey];
  o.bellBefore = houseHasBell();
  since();
  butlerHire('third');
  o.hiredWithoutBell = !!butlerHired();
  o.noBellSaid = since()[0] || null;
  /* the HUD's Staff button is the route that bypassed it */
  houseHudRender();
  const staffBtn = document.getElementById('hhstaff');
  since();
  staffBtn.__fire('click');
  butlerHire('third');
  o.hiredViaHudWithoutBell = !!butlerHired();
  since();
  closeHousePanel();

  /* build a bell and it works */
  const BF = HOUSE_FURNITURE.hf_bell;
  give(BF.plankId || 'oak_plank', BF.planks | 0); give('iron_nails', BF.nails | 0);
  houseBuild(bellKey, 'hf_bell');
  since();
  o.bellAfter = houseHasBell();
  butlerHire('third');
  o.hiredWithBell = !!butlerHired();
  since();
  /* the bell PULL counts too — it is the same category */
  o.bellPullCat = HOUSE_FURNITURE.hf_bellpull.cat;
  o.bellCat = HOUSE_FURNITURE.hf_bell.cat;

  /* ---------- 3. FACING ---------- */
  const chapelPew = HOUSE_ROOMS.chapel.slots.find(s => s.cat === 'pew');
  const chapelAltar = HOUSE_ROOMS.chapel.slots.find(s => s.cat === 'altar');
  o.pewSlot = chapelPew ? {ox: chapelPew.ox, oy: chapelPew.oy, face: chapelPew.face || null} : null;
  o.altarSlot = chapelAltar ? {ox: chapelAltar.ox, oy: chapelAltar.oy} : null;
  o.altarIsNorthOfPew = !!(chapelPew && chapelAltar && chapelAltar.oy < chapelPew.oy);
  clearInv(); give('coins', 99000000);
  freshHouse();
  houseRooms()['0,0'] = 'chapel';
  {
    const S0 = houseSlotByKey('0,0:' + chapelPew.id);
    o.pewFacing = S0 ? houseSlotFacing(S0) : null;
    const A = houseSlotByKey('0,0:' + chapelAltar.id);
    o.altarFacing = A ? houseSlotFacing(A) : null;
  }
  delete houseRooms()['0,0'];

  /* the dining table's chairs: each BACK must be on the far side of its seat
     from the table centre, or the chair reads as facing away from it */
  {
    const obj = {def: 'hf_dining', x: 60, y: 5, alive: true};
    buildObjModel(obj);
    const parts = [];
    obj._m.group.traverse(m => {
      if(!m.geometry || !m.geometry.parameters) return;
      const p = m.geometry.parameters;
      if(p.width === undefined) return;
      parts.push({w: p.width, h: p.height, d: p.depth, x: m.position.x, y: m.position.y, z: m.position.z});
    });
    /* the backs are the tall thin panels: 0.5 x 0.7 x 0.07 */
    const backs = parts.filter(p => Math.abs(p.w - 0.5) < 1e-9 && Math.abs(p.h - 0.7) < 1e-9);
    const seats = parts.filter(p => Math.abs(p.w - 0.5) < 1e-9 && Math.abs(p.h - 0.08) < 1e-9);
    o.chairBacks = backs.length; o.chairSeats = seats.length;
    /* pair each back with the nearest seat on the same x, and check the back is
       FURTHER from the table centre (z=0) than the seat is */
    o.chairsFacingAway = 0;
    for(const b of backs){
      const seat = seats.filter(sp => Math.abs(sp.x - b.x) < 0.01)
                        .sort((p, q) => Math.abs(p.z - b.z) - Math.abs(q.z - b.z))[0];
      if(!seat) continue;
      if(Math.abs(b.z) <= Math.abs(seat.z)) o.chairsFacingAway++;
    }
  }

  /* ---------- 4. THE SHELF IS CALLED WHAT IT IS ---------- */
  clearInv(); give('coins', 99000000);
  freshHouse();
  const slotFor = cat => {
    for(const rk in HOUSE_ROOMS){
      const s2 = HOUSE_ROOMS[rk].slots.find(q => q.cat === cat);
      if(s2) return {room: rk, id: s2.id};
    }
    return null;
  };
  const menuFor = fid => {
    const F = HOUSE_FURNITURE[fid], w = slotFor(F.cat);
    player.house.rooms = {}; player.house.rooms['1,0'] = w.room;
    player.house.slots = {};
    clearInv(); give('coins', 10000000);
    if(F.planks | 0) give(F.plankId || 'oak_plank', F.planks | 0);
    if(F.nails | 0) give('iron_nails', F.nails | 0);
    houseBuild('1,0:' + w.id, fid); since();
    houseRebuild();
    const S0 = houseSlotByKey('1,0:' + w.id);
    return {name: F.name, labels: S0 ? optionsAt(S0.x, S0.y).map(q => q.label || '') : []};
  };
  o.named = {};
  for(const fid of ['hf_shelf', 'hf_trophy', 'hf_case', 'hf_weaponrack', 'hf_armourstand',
                    'hf_caperack', 'hf_pethouse']){
    const m = menuFor(fid);
    const wrong = m.labels.filter(l => /^Inspect /.test(l) && l !== 'Inspect ' + m.name);
    o.named[fid] = {name: m.name, inspect: m.labels.filter(l => /^Inspect /.test(l)), wrong: wrong.length};
  }
  o.misnamed = Object.entries(o.named).filter(([, v]) => v.wrong > 0).map(([k, v]) => k + ': ' + v.inspect.join('/'));

  /* ---------- 5. A FETCH THAT DOES NOT FIT MUST NOT DESTROY BOARDS ---------- */
  clearInv(); give('coins', 99000000);
  freshHouse();
  houseSlots()[bellKey] = 'hf_bell';
  player.house.servant = null;
  butlerHire('facbrat');            /* load 24 */
  since();
  const LOAD = butlerById('facbrat').load;
  o.load = LOAD;

  bank.length = 0;
  bank.push({id: 'oak_plank', qty: 100});
  o.bankBefore = 100;
  /* leave room for only FIVE boards: coins take one slot, junk fills the rest */
  clearInv(); give('coins', 99000000);
  while(freeSlots() > 5) if(!give('bones', 1)) break;
  o.freeBefore = freeSlots();

  butlerFetch('oak_plank');
  since();
  __shim.flushTimers();
  o.fetchLog = since();
  o.inPack = countItem('oak_plank');
  o.freeAfter = freeSlots();
  o.inBank = bank.reduce((n, b) => n + ((b && b.id === 'oak_plank') ? b.qty : 0), 0);
  o.conserved = o.inPack + o.inBank;
  o.saidPutBack = o.fetchLog.some(l => /went back in the bank/i.test(l));

  /* a completely full pack loses nothing either */
  clearInv(); give('coins', 99000000);
  while(freeSlots() > 0) if(!give('bones', 1)) break;
  o.freeWhenFull = freeSlots();
  const bankBefore2 = bank.reduce((n, b) => n + ((b && b.id === 'oak_plank') ? b.qty : 0), 0);
  player.house.servant.tripEndsAt = 0; player.house.servant.pending = null;
  give('coins', 99000000);          /* the fee needs a slot; drop one bone for it */
  butlerFetch('oak_plank');
  since();
  __shim.flushTimers();
  o.fullPackLog = since();
  o.fullPackInPack = countItem('oak_plank');
  o.fullPackBank = bank.reduce((n, b) => n + ((b && b.id === 'oak_plank') ? b.qty : 0), 0);
  o.fullPackConserved = o.fullPackInPack + o.fullPackBank === bankBefore2;

  /* ---------- 6. THE DOOR SITS ON THE FLOOR ---------- */
  clearInv(); give('coins', 99000000);
  if(inHouse) exitHouse();
  const door = objects.find(q => q.def === 'house_exit');
  o.doorTile = door ? {x: door.x, y: door.y} : null;
  o.doorOutsideY = (door && door._m && door._m.group) ? door._m.group.position.y : null;
  o.terrainAtDoor = door ? groundH(door.x + 0.5, door.y + 0.5) : null;
  freshHouse();
  o.houseFY = houseFY;
  o.doorInsideY = (door && door._m && door._m.group) ? door._m.group.position.y : null;
  o.doorOnFloor = o.doorInsideY !== null && Math.abs(o.doorInsideY - houseFY) < 1e-9;
  o.floorMovedUnderIt = o.doorOutsideY !== null && Math.abs(o.doorOutsideY - houseFY) > 1e-9;
  exitHouse();
  o.doorRestoredOutside = (door && door._m && door._m.group)
    ? Math.abs(door._m.group.position.y - groundH(door.x + 0.5, door.y + 0.5)) < 1e-9 : null;

  /* ---------- 7. CLICKS RESOLVE ON A HOUSE FLOOR, NOT THE OVERWORLD ---------- */
  freshHouse();
  o.pickFloorExists = !!housePickFloor;
  o.pickFloorY = housePickFloor ? housePickFloor.position.y : null;
  o.pickFloorAtFY = housePickFloor && Math.abs(housePickFloor.position.y - houseFY) < 1e-9;
  o.pickFloorInHouseGroup = !!(housePickFloor && housePickFloor.parent === houseGroup);
  /* it spans the whole region */
  if(housePickFloor && housePickFloor.geometry && housePickFloor.geometry.parameters){
    const p = housePickFloor.geometry.parameters;
    o.pickFloorSpan = {w: p.width, h: p.height};
    o.pickFloorCoversRegion = p.width >= (HOUSE.x1 - HOUSE.x0) && p.height >= (HOUSE.y1 - HOUSE.y0);
    o.pickFloorCentre = {x: housePickFloor.position.x, z: housePickFloor.position.z};
    o.pickFloorCentred = Math.abs(housePickFloor.position.x - (HOUSE.x0 + p.width / 2)) < 1e-9
                      && Math.abs(housePickFloor.position.z - (HOUSE.y0 + p.height / 2)) < 1e-9;
  }
  o.pickFloorLaidFlat = housePickFloor && Math.abs(Math.abs(housePickFloor.rotation.x) - Math.PI / 2) < 1e-9;
  /* rebuilding the interior does not leave a second one behind */
  const before = houseGroup.children.length;
  houseBuildInterior();
  o.pickFloorNoDuplicate = houseGroup.children.filter(c => c === housePickFloor).length === 1;
  o.groupGrowth = houseGroup.children.length - before;

  bank.length = 0;
  if(inHouse) exitHouse();
  return o;
`);

const S = new Suite('housebugs').guard(T);
const HOUSE_W = 60, HOUSE_H = 30;   /* 5x12 by 3x10 */

/* ---- 1. the delve lobby -------------------------------------------------- */
S.ok('there are lobby props to check',            T.lobbyCount > 0, `${T.lobbyCount} objects`);
S.ok('  they really are near the cottage',        !!T.lobbyAt,
     `lobby at ${JSON.stringify(T.lobbyAt)}, house ${JSON.stringify(T.houseBox)}`);
S.ok('inside the delve they show',                T.lobbyShownInDelve > 0,
     `${T.lobbyShownInDelve} — if this were 0 the checks below would pass vacuously`);
S.eq('THEY ARE NOT VISIBLE FROM INSIDE THE HOUSE', T.lobbyVisibleFromHouse, 0);
S.eq('  and cannot be forced on from outside the delve', T.lobbyForcedOnFromHouse, 0);

/* ---- 2. the bell --------------------------------------------------------- */
S.eq('with no bell built there is no bell',       T.bellBefore, null);
S.eq('NO BELL MEANS NO STAFF',                    T.hiredWithoutBell, false);
S.ok('  and says to build one',                   /bell/i.test(T.noBellSaid || ''), T.noBellSaid);
S.eq('  the HUD Staff button cannot bypass it',   T.hiredViaHudWithoutBell, false);
S.eq('building a bell is found',                  T.bellAfter, 'hf_bell');
S.ok('  and then the hire takes',                 T.hiredWithBell);
S.eq('the bell pull is the same category',        T.bellPullCat, T.bellCat);

/* ---- 3. facing ----------------------------------------------------------- */
S.ok('the altar is north of the pew',             T.altarIsNorthOfPew,
     `pew ${JSON.stringify(T.pewSlot)}, altar ${JSON.stringify(T.altarSlot)}`);
S.eq('  so the pew declares it looks north',      T.pewSlot.face, 'N');
S.eq('THE PEW FACES THE ALTAR',                   T.pewFacing, Math.PI);
S.eq('  and the altar still faces into the room', T.altarFacing, 0);
S.ok('the dining table has four chairs',          T.chairBacks === 4 && T.chairSeats === 4,
     `${T.chairSeats} seats, ${T.chairBacks} backs`);
S.eq('EVERY DINING CHAIR FACES THE TABLE',        T.chairsFacingAway, 0,
     'a back nearer the table centre than its own seat means the chair faces outward');

/* ---- 4. the shelf -------------------------------------------------------- */
S.eq('NO PIECE IS INSPECTED UNDER ANOTHER’S NAME', T.misnamed.length, 0);
if(T.misnamed.length) S.note(T.misnamed.join('; '));
S.eq('  the Plain shelf is inspected as itself',  (T.named.hf_shelf.inspect || [])[0], 'Inspect Plain shelf');
S.eq('  and the Trophy shelf as itself',          (T.named.hf_trophy.inspect || [])[0], 'Inspect Trophy shelf');

/* ---- 5. the fetch -------------------------------------------------------- */
S.ok('the hire carries more than the pack can take', T.load > T.freeBefore,
     `load ${T.load}, ${T.freeBefore} free slots`);
S.ok('SOME BOARDS ARRIVE',                        T.inPack > 0,
     `${T.inPack} in the pack — it used to be none at all`);
S.eq('  exactly as many as fit',                  T.inPack, T.freeBefore);
S.eq('  leaving no free slots',                   T.freeAfter, 0);
S.ok('NOTHING IS DESTROYED — the rest goes back', T.conserved === T.bankBefore,
     `${T.inPack} in pack + ${T.inBank} in bank = ${T.conserved}, started with ${T.bankBefore}`);
S.ok('  and the player is told',                  T.saidPutBack, T.fetchLog.join(' | '));

S.ok('a completely full pack loses nothing',      T.fullPackConserved,
     `${T.fullPackInPack} in pack, ${T.fullPackBank} in bank`);

/* ---- 6. the elevated door ------------------------------------------------ */
S.ok('the door is inside the house region',       !!T.doorTile,
     JSON.stringify(T.doorTile));
S.ok('THE FLATTEN REALLY MOVES THE GROUND UNDER IT', T.floorMovedUnderIt,
     `wilderness terrain there is ${T.doorOutsideY}, houseFY is ${T.houseFY} — if these matched, the check below would pass for free`);
S.ok('THE DOOR SITS ON THE HOUSE FLOOR',          T.doorOnFloor,
     `door at y=${T.doorInsideY}, floor at ${T.houseFY}`);
S.ok('  and goes back to the terrain on the way out', T.doorRestoredOutside);

/* ---- 7. the pick floor --------------------------------------------------- */
S.ok('THE HOUSE HAS A PICK FLOOR',                T.pickFloorExists,
     'without one every click fell through to the overworld terrain under the dead zone');
S.ok('  at the floor height',                     T.pickFloorAtFY,
     `plane at ${T.pickFloorY}, floor at ${T.houseFY}`);
S.ok('  laid flat',                               T.pickFloorLaidFlat);
S.ok('  covering the whole region',               T.pickFloorCoversRegion,
     `${JSON.stringify(T.pickFloorSpan)} over ${HOUSE_W}x${HOUSE_H}`);
S.ok('  and centred on it',                       T.pickFloorCentred, JSON.stringify(T.pickFloorCentre));
S.ok('  living in houseGroup, so it hides with the house', T.pickFloorInHouseGroup);
/* existing but unused would be worse than missing: castPick has to reach for it FIRST,
   ahead of the terra fallback that was catching every click */
S.ok('  AND castPick ACTUALLY USES IT',
     /_rc\.intersectObject\(\(typeof inHouse[^)]*inHouse&&housePickFloor\)\?housePickFloor:/.test(SRC),
     'the plane can exist and still be bypassed — this is the wiring');
S.ok('  ahead of the overworld terrain fallback',
     SRC.indexOf('housePickFloor:') < SRC.indexOf(':terra)'),
     'terra is the fallback that produced the drifting walk marker');
S.ok('rebuilding the interior does not stack copies', T.pickFloorNoDuplicate);
S.eq('  and does not grow the group',             T.groupGrowth, 0);

S.report(
  'The delve lobby cannot render outside the delve, staff need a bell, the pew faces the altar and dining chairs face the table, every piece is inspected under its own name, and a fetch that will not fit puts the remainder back in the bank instead of destroying it.',
  'how any of it looks — chair and pew orientation on screen still needs a browser.');
