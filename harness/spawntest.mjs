/* ============================================================================
   spawntest — what houseRebuild puts in the room, and where.

   Every visible thing inside the cottage is spawned by houseRebuild: the
   furniture, the empty-hotspot markers, the expansion markers on bare walls,
   and the hire. The rules:

     - hotspots are HIDDEN outside build mode, so an unfurnished room reads as a
       room rather than a showroom of pegs
     - a guest never sees another player's hotspots or expansion markers
     - the expansion marker only appears on a wall that could actually open
     - the hire appears only when hired, near the bell

   Run: node harness/spawntest.mjs
   ========================================================================== */
import {runPass, Suite, PRELUDE} from './_lib.mjs';

const T = runPass(PRELUDE + String.raw`
  setLevel('construction', 99);
  clearInv(); give('coins', 20000000);
  freshHouse();

  const count = def => objects.filter(q => q.def === def).length;
  const houseFurn = () => objects.filter(q => q.def && String(q.def).slice(0, 3) === 'hf_'
                                              && q.def !== 'hf_slot' && q.def !== 'hf_expand').length;

  /* ---- an empty parlour, build mode OFF ---- */
  houseBuildMode = false; houseRebuild();
  o.offMode = {slots: count('hf_slot'), expand: count('hf_expand'), furniture: houseFurn()};

  /* ---- build mode ON ---- */
  houseBuildMode = true; houseRebuild();
  o.onMode = {slots: count('hf_slot'), expand: count('hf_expand'), furniture: houseFurn()};
  o.parlourSlotCount = HOUSE_ROOMS.parlour.slots.length;

  /* every hotspot marker sits on its own slot tile */
  o.slotMisplaced = [];
  for(const q of objects.filter(z => z.def === 'hf_slot')){
    const S0 = houseSlotByKey(q.houseSlot);
    if(!S0 || S0.x !== q.x || S0.y !== q.y) o.slotMisplaced.push(q.houseSlot);
  }
  /* and carries a ghost of what could go there — which needs MATERIALS, not just
     coins: houseGhostFor checks level, boards, nails and coins together */
  for(const pid of SAWMILL.map(r => r[1])) give(pid, 25);
  give('iron_nails', 25);
  houseRebuild();
  o.slotsWithGhost = objects.filter(z => z.def === 'hf_slot' && z.ghost).length;
  clearInv();
  houseRebuild();
  o.slotsWithGhostBroke = objects.filter(z => z.def === 'hf_slot' && z.ghost).length;
  clearInv(); give('coins', 20000000);

  /* ---- expansion markers only where a room could go ---- */
  houseRebuild();
  o.expandTargets = objects.filter(q => q.def === 'hf_expand')
    .map(q => q.expandTo.join(',')).sort();
  o.expandOnBuiltCell = objects.filter(q => q.def === 'hf_expand' && roomAt(q.expandTo[0], q.expandTo[1])).length;
  o.expandOffGrid = objects.filter(q => q.def === 'hf_expand' &&
    (q.expandTo[0] < 0 || q.expandTo[1] < 0 || q.expandTo[0] >= HOUSE_GW || q.expandTo[1] >= HOUSE_GH)).length;
  /* each marker stands on a floor tile inside the room it belongs to */
  o.expandOnWall = objects.filter(q => q.def === 'hf_expand' && houseTiles[q.y][q.x] !== T_FLOOR).length;
  /* and offers the room picker */
  const em = objects.find(q => q.def === 'hf_expand');
  o.expandOptions = em ? optionsAt(em.x, em.y).map(z => z.label || String(z.html || '')) : [];

  /* filling the grid leaves nothing to expand into */
  for(const [gx, gy, t] of [[0,0,'kitchen'],[2,0,'bedroom'],[0,1,'workshop'],[1,1,'garden'],
                            [2,1,'study'],[0,2,'games'],[1,2,'chapel'],[2,2,'combat']])
    houseBuildRoom(gx, gy, t);
  since();
  houseBuildMode = true; houseRebuild();
  o.expandWhenFull = count('hf_expand');
  o.slotsWhenFullBuildMode = count('hf_slot');
  houseBuildMode = false; houseRebuild();
  o.slotsWhenFullOffMode = count('hf_slot');
  o.allSlotCount = houseAllSlots().length;

  /* ---- furniture spawns on its slot, facing into the room ---- */
  for(const [key, fid] of [['1,0:hearth','hf_hearth'], ['0,0:range','hf_clayoven'], ['2,0:bed','hf_oakbed']]){
    const F = HOUSE_FURNITURE[fid];
    give(F.plankId || 'oak_plank', F.planks | 0); give('iron_nails', F.nails | 0);
    houseBuild(key, fid);
  }
  since();
  houseBuildMode = false; houseRebuild();
  o.furnitureSpawned = houseFurn();
  o.furnMisplaced = [];
  o.furnFacings = [];
  for(const q of objects.filter(z => z.def && String(z.def).slice(0,3) === 'hf_' && z.houseSlot)){
    const S0 = houseSlotByKey(q.houseSlot);
    if(!S0 || S0.x !== q.x || S0.y !== q.y){ o.furnMisplaced.push(q.houseSlot); continue; }
    if(q._m && q._m.group) o.furnFacings.push({slot: q.houseSlot, ry: q._m.group.rotation.y,
                                               want: houseSlotFacing(S0)});
  }
  o.facingWrong = o.furnFacings.filter(f => Math.abs(f.ry - f.want) > 1e-6).map(f => f.slot);
  o.slotsHiddenWithFurniture = objects.filter(z => z.def === 'hf_slot' && houseSlots()[z.houseSlot]).length;

  /* ---- A GUEST SEES NO HOTSPOTS AND NO EXPANSION MARKERS ---- */
  const mine = {rooms: Object.assign({}, houseRooms()), slots: Object.assign({}, houseSlots())};
  houseVisit = {uid: 'bob', name: 'Bob', rooms: mine.rooms, slots: mine.slots};
  houseBuildMode = true;          /* even with the flag stuck on */
  houseRebuild();
  o.guest = {slots: count('hf_slot'), expand: count('hf_expand'), furniture: houseFurn()};
  houseVisit = null; houseBuildMode = false; houseRebuild();

  /* ---- the hire ---- */
  o.butlerBeforeHire = count('house_butler');
  const BF = HOUSE_FURNITURE.hf_bell;
  give(BF.plankId || 'oak_plank', BF.planks | 0); give('iron_nails', BF.nails | 0);
  houseBuild('1,0:bell', 'hf_bell');
  butlerHire('third');
  houseRebuild();
  since();
  o.butlerAfterHire = count('house_butler');
  butlerDismiss(); houseRebuild();
  o.butlerAfterDismiss = count('house_butler');

  if(inHouse) exitHouse();
  return o;
`);

const S = new Suite('spawntest').guard(T);

S.eq('HOTSPOTS ARE HIDDEN OUTSIDE BUILD MODE',    T.offMode.slots, 0);
S.eq('  and so are the expansion markers',        T.offMode.expand, 0);
S.eq('build mode shows one marker per hotspot',   T.onMode.slots, T.parlourSlotCount);
S.ok('  and expansion markers appear',            T.onMode.expand > 0, `${T.onMode.expand} bare walls`);
S.eq('every hotspot marker sits on its slot tile', T.slotMisplaced.length, 0);
if(T.slotMisplaced.length) S.note(T.slotMisplaced.join(', '));
S.ok('a marker carries a ghost of what could go there', T.slotsWithGhost > 0,
     `${T.slotsWithGhost} of ${T.onMode.slots}`);
S.eq('  and none when you cannot afford anything', T.slotsWithGhostBroke, 0);

S.eq('no expansion marker points at a built cell', T.expandOnBuiltCell, 0);
S.eq('  or off the grid',                         T.expandOffGrid, 0);
S.eq('  and every one stands on floor',           T.expandOnWall, 0);
S.ok('  offering the room picker',                (T.expandOptions || []).some(l => /Build room/i.test(l)),
     (T.expandOptions || []).join(' | '));
S.eq('A FULL GRID HAS NOTHING TO EXPAND INTO',    T.expandWhenFull, 0);
S.eq('  but every hotspot in the house shows in build mode',
     T.slotsWhenFullBuildMode, T.allSlotCount);
S.eq('  and none of them outside it',             T.slotsWhenFullOffMode, 0);

S.ok('furniture spawns',                          T.furnitureSpawned >= 3, `${T.furnitureSpawned} pieces`);
S.eq('  on its own slot tile',                    T.furnMisplaced.length, 0);
if(T.furnMisplaced.length) S.note(T.furnMisplaced.join(', '));
S.eq('  FACING INTO THE ROOM',                    T.facingWrong.length, 0);
if(T.facingWrong.length) S.note('models are built facing +z; without this they face the plaster: ' + T.facingWrong.join(', '));
S.eq('  and a filled slot shows no peg',          T.slotsHiddenWithFurniture, 0);

S.eq('A GUEST SEES NO HOTSPOTS',                  T.guest.slots, 0);
S.eq('  AND NO EXPANSION MARKERS',                T.guest.expand, 0);
S.ok('  but does see the furniture',              T.guest.furniture >= 3, `${T.guest.furniture} pieces`);

S.eq('no hire before you hire one',               T.butlerBeforeHire, 0);
S.eq('  one after',                               T.butlerAfterHire, 1);
S.eq('  and none after dismissal',                T.butlerAfterDismiss, 0);

S.report(
  'houseRebuild hides hotspots outside build mode, shows nothing buildable to a guest, places furniture on its slot facing into the room, and spawns the hire only when hired.',
  'how any of it looks in the room — models, scale and facing on screen need a browser.');
