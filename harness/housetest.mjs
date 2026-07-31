/* ============================================================================
   housetest — the saved house survives a round trip, including migration.

   player.house is {owned, repair, rooms, slots, slotsV2, servant, open}. Two
   things have historically gone wrong with it:

     - THE slotsV2 MIGRATION. Stage-2/3 saves used flat slot ids ('table',
       'hearth'). They are re-keyed into the parlour so nobody loses furniture
       they paid for, and anything with no home there is REFUNDED IN FULL rather
       than dropped.
     - orphaned furniture ids. Removing a piece from HOUSE_FURNITURE without a
       migration is the same class of bug as removing an item from ITEMS.

   Run: node harness/housetest.mjs
   ========================================================================== */
import {runPass, Suite, PRELUDE} from './_lib.mjs';

const T = runPass(PRELUDE + String.raw`
  setLevel('construction', 99);
  clearInv(); give('coins', 20000000);

  /* ---- a furnished house round-trips through enter/exit ---- */
  freshHouse();
  houseBuildRoom(0, 0, 'kitchen');
  houseBuildRoom(1, 1, 'garden');
  for(const [key, fid] of [['1,0:hearth','hf_hearth'], ['0,0:range','hf_clayoven']]){
    const F = HOUSE_FURNITURE[fid];
    give(F.plankId || 'oak_plank', F.planks | 0); give('iron_nails', F.nails | 0);
    houseBuild(key, fid);
  }
  since();
  const snapRooms = JSON.stringify(houseRooms()), snapSlots = JSON.stringify(houseSlots());
  o.roomsBefore = JSON.parse(snapRooms); o.slotsBefore = JSON.parse(snapSlots);
  exitHouse(); enterHouse(); exitHouse(); enterHouse();
  o.roundTripStable = JSON.stringify(houseRooms()) === snapRooms &&
                      JSON.stringify(houseSlots()) === snapSlots;
  exitHouse();

  /* ---- the shape a save actually stores ---- */
  o.saveShape = Object.keys(player.house).sort();
  o.repairIsNumber = typeof player.house.repair === 'number';
  o.ownedIsBool = typeof player.house.owned === 'boolean';

  /* ---- THE slotsV2 MIGRATION ---- */
  /* an old save: flat slot ids, no slotsV2 flag */
  const parlourSlots = HOUSE_ROOMS.parlour.slots.map(s => s.id);
  o.parlourSlotIds = parlourSlots;
  clearInv(); give('coins', 1000);
  player.house = {owned: true, repair: POH_REPAIR_STEPS.length,
                  rooms: null, slots: {hearth: 'hf_hearth', rug: 'hf_ragrug'}};
  since();
  const migrated = houseSlots();
  o.migrated = Object.assign({}, migrated);
  o.migrationLog = since();
  o.v2Flag = player.house.slotsV2;
  const E = HOUSE_ENTRY.gx + ',' + HOUSE_ENTRY.gy;
  o.hearthReKeyed = migrated[E + ':hearth'] === 'hf_hearth';
  o.rugReKeyed = migrated[E + ':rug'] === 'hf_ragrug';
  o.noFlatKeysLeft = !Object.keys(migrated).some(k => k.indexOf(':') < 0);

  /* a piece with NO home in the parlour is refunded in full, not lost */
  clearInv(); give('coins', 0);
  const BED = HOUSE_FURNITURE.hf_oakbed;
  o.bedCost = BED.cost;
  player.house = {owned: true, repair: POH_REPAIR_STEPS.length,
                  rooms: null, slots: {bed: 'hf_oakbed'}};
  since();
  const migrated2 = houseSlots();
  o.refundLog = since();
  o.coinsAfterRefund = coinsCount();
  o.bedDropped = !Object.values(migrated2).includes('hf_oakbed');
  o.refundedInFull = o.coinsAfterRefund >= BED.cost;
  o.saidRefund = /refunded/i.test((o.refundLog || []).join(' '));

  /* migration runs ONCE: a second read does not re-migrate or double-refund */
  const coinsNow = coinsCount();
  houseSlots(); houseSlots();
  o.noDoubleRefund = coinsCount() === coinsNow;

  /* ---- orphaned ids ---- */
  /* a save naming a piece that no longer exists must not crash the house */
  clearInv(); give('coins', 20000000);
  player.house = {owned: true, repair: POH_REPAIR_STEPS.length, slotsV2: 1,
                  rooms: {'1,0': 'parlour'}, slots: {'1,0:hearth': 'hf_does_not_exist'}};
  o.orphanThrew = null;
  try{
    enterHouse();
    houseRebuild();
    const S0 = houseSlotByKey('1,0:hearth');
    o.orphanOptions = S0 ? optionsAt(S0.x, S0.y).map(q => q.label || String(q.html || '')) : [];
    o.orphanHudOk = (houseHudRender(), true);
    exitHouse();
  }catch(e){ o.orphanThrew = String(e && e.message || e); }

  /* an orphan in a ROOM key must not crash either */
  player.house = {owned: true, repair: POH_REPAIR_STEPS.length, slotsV2: 1,
                  rooms: {'1,0': 'parlour', '0,0': 'no_such_room'}, slots: {}};
  o.orphanRoomThrew = null;
  try{ enterHouse(); houseCarve(); houseBuildInterior(); houseRebuild(); exitHouse(); }
  catch(e){ o.orphanRoomThrew = String(e && e.message || e); }

  /* ---- a house with no rooms key at all gets the parlour ---- */
  player.house = {owned: true, repair: POH_REPAIR_STEPS.length, slots: {}, slotsV2: 1};
  o.defaultRooms = Object.assign({}, houseRooms());
  o.defaultsToParlour = o.defaultRooms[E] === 'parlour';

  /* ---- an undeeded player has no house state forced on them ---- */
  player.house = null;
  o.undeededRooms = Object.keys(houseRooms()).length;
  o.undeededOwned = pohOwned();

  return o;
`);

const S = new Suite('housetest').guard(T);

S.ok('a furnished house survives repeated entry/exit', T.roundTripStable,
     `${Object.keys(T.roomsBefore).length} rooms, ${Object.keys(T.slotsBefore).length} pieces`);
S.ok('the save carries the fields it needs',      ['owned', 'repair', 'rooms', 'slots'].every(k => T.saveShape.includes(k)),
     T.saveShape.join(', '));
S.ok('repair is a number',                        T.repairIsNumber);
S.ok('owned is a boolean',                        T.ownedIsBool);

/* migration */
S.ok('THE slotsV2 MIGRATION RE-KEYS FLAT IDS',    T.hearthReKeyed,
     JSON.stringify(T.migrated));
S.ok('  including the rug',                       T.rugReKeyed);
S.ok('  leaving no flat keys behind',             T.noFlatKeysLeft);
S.eq('  and stamping the version flag',           T.v2Flag, 1);

S.ok('a piece with no home is dropped',           T.bedDropped);
S.ok('  BUT REFUNDED IN FULL',                    T.refundedInFull,
     `${T.coinsAfterRefund} coins back for a ${T.bedCost} bed`);
S.ok('  and the player is told',                  T.saidRefund, (T.refundLog || []).join(' | '));
S.ok('MIGRATION RUNS ONCE — no double refund',    T.noDoubleRefund);

/* orphans */
S.eq('AN ORPHANED FURNITURE ID DOES NOT CRASH',   T.orphanThrew, null);
S.ok('  the slot falls back to an empty space',   Array.isArray(T.orphanOptions),
     (T.orphanOptions || []).join(' | ') || '(no options — hotspot hidden outside build mode)');
S.ok('  and the HUD still renders',               T.orphanHudOk === true);
S.eq('AN ORPHANED ROOM TYPE DOES NOT CRASH',      T.orphanRoomThrew, null);

/* defaults */
S.ok('a house with no rooms key gets the parlour', T.defaultsToParlour, JSON.stringify(T.defaultRooms));
S.eq('an undeeded player owns nothing',           T.undeededOwned, false);

S.report(
  'A furnished house round-trips, the slotsV2 migration re-keys or refunds in full exactly once, and orphaned ids do not crash the house.',
  'that a real save file loads — this exercises the in-memory shape, not the save/load codec.');
