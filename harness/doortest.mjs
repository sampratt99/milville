/* ============================================================================
   doortest — the cottage door menu, and the ORDER of its options.

   LEFT-CLICK RUNS optionsAt's FIRST OPTION. That single fact is why this
   harness exists and why it asserts order rather than membership:

     - a wreck: Repair must be first, because mending is the only thing you can
       actually do with it
     - a finished cottage: Enter must be first, and Lock/Unlock must NOT be —
       locking evicts every guest in your house, and nobody means to do that by
       clicking their own front door
     - Examine is always last

   There is no way to simulate a click offline (Raycaster returns nothing, by
   design), so this calls optionsAt(x, y) directly. That is the seam.

   Run: node harness/doortest.mjs
   ========================================================================== */
import {runPass, Suite, PRELUDE} from './_lib.mjs';

const T = runPass(PRELUDE + String.raw`
  /* the door object: source (119,111) -> runtime (231,111), the cottage north wall */
  const door = objects.find(q => q.def === 'house_door');
  o.door = door ? {x: door.x, y: door.y} : null;
  o.WX = WX;

  /* Stand on the DOORSTEP, which is north: the door tile itself is blocked and
     so is everything south of it (that is the cottage footprint). This is
     HOUSE_RETURN, the tile exitHouse() puts you back on. */
  if(inHouse) exitHouse();
  houseVisit = null;
  const step = () => { player.x = door.x; player.y = door.y - 1; player.px = player.x; player.py = player.y; };
  if(door) step();
  o.doorTileBlocked = door ? blockedStrict(door.x, door.y) : null;
  o.doorstepWalkable = door ? !blockedStrict(door.x, door.y - 1) : null;
  o.doorstepIsReturn = door ? (door.x === HOUSE_RETURN.x && door.y - 1 === HOUSE_RETURN.y) : null;

  const menu = () => optionsAt(o.door.x, o.door.y).map(op => op.label || _strip(op.html));
  /* labels are optional on Examine rows; fall back to the html text */
  function _strip(h){ return String(h || '').replace(/<[^>]*>/g, '').trim(); }

  o.menus = {};

  /* --- 1. no deed --- */
  player.house = null;
  o.menus.unowned = menu();

  /* --- 2. deeded but still a wreck, at each repair stage --- */
  o.menus.wreck = [];
  for(let st = 0; st < POH_REPAIR_STEPS.length; st++){
    player.house = {owned: true, repair: st, rooms: null, slots: {}, slotsV2: 1};
    o.menus.wreck.push({stage: st, opts: menu(), step: POH_REPAIR_STEPS[st].n});
  }

  /* --- 3. repaired, door locked --- */
  player.house = {owned: true, repair: POH_REPAIR_STEPS.length, open: false, rooms: null, slots: {}, slotsV2: 1};
  o.menus.repairedLocked = menu();

  /* --- 4. repaired, door open --- */
  player.house.open = true;
  o.menus.repairedOpen = menu();

  /* --- the first option on a wreck really does repair, and does not enter --- */
  player.house = {owned: true, repair: 0, rooms: null, slots: {}, slotsV2: 1};
  clearInv(); give('coins', POH_REPAIR_STEPS[0].coins);
  step();
  const first = optionsAt(o.door.x, o.door.y)[0];
  o.wreckFirstLabel = first.label;
  first.fn();
  o.wreckFirstAdvancedRepair = pohStage();
  o.wreckFirstEnteredHouse = inHouse;
  since();

  /* --- the second option on a wreck refuses to enter rather than entering a shell --- */
  player.house.repair = 0;
  step();
  const second = optionsAt(o.door.x, o.door.y)[1];
  o.wreckSecondLabel = second.label;
  second.fn();
  o.wreckSecondEntered = inHouse;
  o.wreckSecondSaid = said(/no floor to stand on/i);
  since();

  /* --- on a finished cottage the FIRST option must not toggle the lock --- */
  player.house = {owned: true, repair: POH_REPAIR_STEPS.length, open: true, rooms: null, slots: {}, slotsV2: 1};
  step();
  cancelAction();
  const f2 = optionsAt(o.door.x, o.door.y)[0];
  o.doneFirstLabel = f2.label;
  const openBefore = houseOpen();
  f2.fn();                       /* sets an action to enter; must not touch the lock */
  o.lockUnchangedByFirstOption = houseOpen() === openBefore;
  o.firstOptionAction = player.action ? player.action.type : null;
  cancelAction();
  since();

  if(inHouse) exitHouse();
  return o;
`);

const S = new Suite('doortest').guard(T);

S.ok('the cottage door object exists',            !!T.door,
     T.door ? `at ${T.door.x},${T.door.y}` : 'not found');
S.eq('  at runtime (231,111)',                    JSON.stringify(T.door), JSON.stringify({x: 231, y: 111}));
S.eq('  which is source 119 + WX',                T.door.x, 119 + T.WX);

S.ok('the door tile itself is blocked',           T.doorTileBlocked);
S.ok('  and you stand on the doorstep, north of it', T.doorstepWalkable);
S.ok('  which is exactly HOUSE_RETURN',           T.doorstepIsReturn);

/* The tile carries the door's options AND the building's own (Walk-to /
   Examine The Ruined Cottage). Only the leading options are the door's. */
const DOOR_TAIL = ['Walk-to The Ruined Cottage', 'Examine The Ruined Cottage'];
const doorOpts = m => m.slice(0, m.length - DOOR_TAIL.length);

/* ---- no deed ---- */
S.eq('unowned: FIRST option is Enter (which refuses)', T.menus.unowned[0], 'Enter Cottage');
S.eq('  the door contributes Enter then Examine',  JSON.stringify(doorOpts(T.menus.unowned)),
     JSON.stringify(['Enter Cottage', 'Examine Cottage door']));
S.eq('  and the building keeps its own tail',      JSON.stringify(T.menus.unowned.slice(-2)),
     JSON.stringify(DOOR_TAIL));

/* ---- a wreck: REPAIR IS FIRST ---- */
for(const w of T.menus.wreck){
  S.eq(`wreck stage ${w.stage}: FIRST option is Repair`, w.opts[0], `Repair ${w.step}`);
  S.eq(`  second is Enter (which refuses)`,       w.opts[1], 'Enter your cottage');
  S.eq(`  and the door's Examine comes last of its own`,
       doorOpts(w.opts)[doorOpts(w.opts).length - 1], 'Examine Cottage door');
}

/* ---- repaired: ENTER IS FIRST, LOCK IS NOT ---- */
S.eq('repaired + locked: FIRST option is Enter',  T.menus.repairedLocked[0], 'Enter your cottage');
S.eq('  and Unlock is second, never first',       T.menus.repairedLocked[1], 'Unlock your door');
S.eq('repaired + open: FIRST option is Enter',    T.menus.repairedOpen[0], 'Enter your cottage');
S.eq('  and Lock is second, never first',         T.menus.repairedOpen[1], 'Lock your door');
S.ok('LOCKING IS NEVER THE LEFT-CLICK — it evicts guests',
     T.menus.repairedLocked[0] !== 'Unlock your door' && T.menus.repairedOpen[0] !== 'Lock your door');
S.eq("repaired: the door's Examine is still last of its own",
     doorOpts(T.menus.repairedOpen)[doorOpts(T.menus.repairedOpen).length - 1], 'Examine Cottage door');
S.ok('NOTHING DESTRUCTIVE IS EVER FIRST at this tile',
     [T.menus.unowned, ...T.menus.wreck.map(w => w.opts), T.menus.repairedLocked, T.menus.repairedOpen]
       .every(m => !/^(Lock|Unlock)/.test(m[0])));

/* ---- and the first option does what its label says ---- */
S.eq('the wreck first option is labelled Repair', T.wreckFirstLabel, 'Repair Clear the rubble');
S.eq('  and running it advances the repair',      T.wreckFirstAdvancedRepair, 1);
S.eq('  without walking you into a shell',        T.wreckFirstEnteredHouse, false);
S.eq('the wreck second option is Enter',          T.wreckSecondLabel, 'Enter your cottage');
S.eq('  and it refuses',                          T.wreckSecondEntered, false);
S.ok('  saying there is no floor yet',            T.wreckSecondSaid);
S.eq('the finished-cottage first option is Enter', T.doneFirstLabel, 'Enter your cottage');
S.ok('  and it leaves the lock alone',            T.lockUnchangedByFirstOption);
S.eq('  setting an enterhouse action',            T.firstOptionAction, 'enterhouse');

S.report(
  'The cottage door menu is ordered so a left-click never locks your door or walks you into a shell.',
  'that a real click lands on this tile — picking is a Raycaster job and there is no geometry offline.');
