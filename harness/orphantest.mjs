/* ============================================================================
   orphantest — an id that no longer exists must not take a panel down.

   THE ORIGINAL (CLAUDE.md, docs/23 §9): removing an item from ITEMS without a
   save migration left orphaned ids in old banks. itemCategory threw on them and
   THE ENTIRE BANKING UI died — not the row, the whole panel.

   Construction added two more id spaces with the same shape: HOUSE_FURNITURE
   slot values and HOUSE_ROOMS grid values. This sweeps all three.

   Run: node harness/orphantest.mjs
   ========================================================================== */
import {runPass, Suite, PRELUDE} from './_lib.mjs';

const T = runPass(PRELUDE + String.raw`
  setLevel('construction', 99);
  const GHOST = 'this_item_was_deleted';

  /* ---- 1. ITEMS: the original bank crash ---- */
  clearInv(); give('coins', 100000);
  bank.length = 0;
  bank.push({id: 'oak_plank', qty: 5});
  bank.push({id: GHOST, qty: 3});          /* an id no longer in ITEMS */
  bank.push({id: 'iron_nails', qty: 10});

  o.itemCategoryThrew = null;
  try{ o.ghostCategory = itemCategory(GHOST); }
  catch(e){ o.itemCategoryThrew = String(e && e.message || e); }

  o.bankRenderThrew = null;
  try{ if(typeof renderBank === 'function') renderBank(); o.bankRendered = true; }
  catch(e){ o.bankRenderThrew = String(e && e.message || e); }

  /* a known-good id still resolves, so the sweep did not just blank everything */
  o.realCategory = itemCategory('oak_plank');
  o.bankStillHasReal = bank.some(b => b && b.id === 'oak_plank');

  /* an orphan in the INVENTORY */
  o.invThrew = null;
  try{
    player.inv[0] = {id: GHOST, qty: 1};
    if(typeof renderInv === 'function') renderInv();
    o.invRendered = true;
    player.inv[0] = null;
  }catch(e){ o.invThrew = String(e && e.message || e); player.inv[0] = null; }

  /* an orphan EQUIPPED */
  o.equipThrew = null;
  try{
    const keep = player.equip.weapon;
    player.equip.weapon = {id: GHOST};
    if(typeof updateEquipPanel === 'function') updateEquipPanel();
    if(typeof renderEquip === 'function') renderEquip();
    player.equip.weapon = keep;
    o.equipRendered = true;
  }catch(e){ o.equipThrew = String(e && e.message || e); }

  bank.length = 0;

  /* ---- 2. HOUSE_FURNITURE: an orphaned slot value ---- */
  clearInv(); give('coins', 20000000);
  player.house = {owned: true, repair: POH_REPAIR_STEPS.length, slotsV2: 1,
                  rooms: {'1,0': 'parlour'},
                  slots: {'1,0:hearth': 'hf_deleted_piece', '1,0:lamp': 'hf_lamp'}};
  o.furnThrew = null;
  try{
    enterHouse();
    houseBuildMode = true; houseRebuild();
    const S0 = houseSlotByKey('1,0:hearth');
    o.orphanSlotMenu = S0 ? optionsAt(S0.x, S0.y).map(q => q.label || String(q.html || '')) : [];
    houseHudRender();
    /* the panel that lists a whole room must survive one bad row */
    if(typeof houseFocusReport === 'function') houseFocusReport();
    closeHousePanel();
    houseBuildMode = false;
    o.furnRendered = true;
  }catch(e){ o.furnThrew = String(e && e.message || e); }
  o.orphanSwept = !Object.values(houseSlots()).includes('hf_deleted_piece');
  o.goodPieceKept = houseSlots()['1,0:lamp'] === 'hf_lamp';
  if(inHouse) exitHouse();

  /* ---- 3. HOUSE_ROOMS: an orphaned grid value ---- */
  player.house = {owned: true, repair: POH_REPAIR_STEPS.length, slotsV2: 1,
                  rooms: {'1,0': 'parlour', '0,0': 'no_such_room_type'}, slots: {}};
  o.roomThrew = null;
  try{
    enterHouse();
    houseCarve(); houseBuildInterior(); houseRebuild(); houseRepaintMinimap();
    houseBuildMode = true; houseRebuild();
    o.roomRendered = true;
    houseBuildMode = false;
  }catch(e){ o.roomThrew = String(e && e.message || e); }
  o.parlourSurvived = houseRooms()['1,0'] === 'parlour';
  if(inHouse) exitHouse();

  /* ---- 4. a GUEST's data is never swept, so every reader must guard ---- */
  o.guestThrew = null;
  try{
    houseEnterVisit('bob', 'Bob', {
      rooms: {'1,0': 'parlour', '2,0': 'phantom_room'},
      slots: {'1,0:hearth': 'hf_phantom', '1,0:rug': 'hf_ragrug'}, repair: 3});
    const S1 = houseSlotByKey('1,0:hearth');
    o.guestOrphanMenu = S1 ? optionsAt(S1.x, S1.y).map(q => q.label || String(q.html || '')) : [];
    houseHudRender();
    houseRebuild();
    o.guestRendered = true;
    exitHouse();
  }catch(e){ o.guestThrew = String(e && e.message || e); try{ exitHouse(); }catch(_e){} }

  /* ---- 5. the sweep must not eat a legitimate piece ---- */
  clearInv(); give('coins', 20000000);
  freshHouse();
  const F = HOUSE_FURNITURE.hf_hearth;
  give(F.plankId || 'oak_plank', F.planks | 0); give('iron_nails', F.nails | 0);
  houseBuild('1,0:hearth', 'hf_hearth');
  since();
  houseSlots(); houseSlots(); houseSlots();
  o.legitSurvivesSweep = houseSlots()['1,0:hearth'] === 'hf_hearth';
  if(inHouse) exitHouse();

  return o;
`);

const S = new Suite('orphantest').guard(T);

/* the original */
S.eq('itemCategory survives an orphaned id',      T.itemCategoryThrew, null);
S.ok('  returning something usable',              typeof T.ghostCategory === 'string',
     String(T.ghostCategory));
S.eq('THE BANK UI SURVIVES AN ORPHANED ROW',      T.bankRenderThrew, null);
S.ok('  and still renders',                       T.bankRendered === true);
S.ok('  with real items untouched',               T.bankStillHasReal);
S.ok('  and real categories still resolving',     typeof T.realCategory === 'string' && T.realCategory.length > 0,
     T.realCategory);
S.eq('the inventory survives one too',            T.invThrew, null);
S.ok('  and renders',                             T.invRendered === true);
S.eq('an orphan in a gear slot does not throw',   T.equipThrew, null);

/* furniture */
S.eq('AN ORPHANED FURNITURE ID DOES NOT THROW',   T.furnThrew, null);
S.ok('  the house still renders',                 T.furnRendered === true);
S.ok('  the dead id is swept out',                T.orphanSwept);
S.ok('  and the good piece beside it is kept',    T.goodPieceKept);
S.ok('  the slot falls back to a buildable space',
     (T.orphanSlotMenu || []).some(l => /^Build /.test(l)),
     (T.orphanSlotMenu || []).join(' | '));

/* rooms */
S.eq('AN ORPHANED ROOM TYPE DOES NOT THROW',      T.roomThrew, null);
S.ok('  the interior still bakes',                T.roomRendered === true);
S.ok('  and the real room survives',              T.parlourSurvived);

/* guests */
S.eq('A GUEST’S ORPHANS DO NOT THROW EITHER',     T.guestThrew, null,
     'guest data comes off the wire and no sweep has ever touched it');
S.ok('  their house still renders',               T.guestRendered === true);
S.ok('  and the bad slot offers no crash-y menu', Array.isArray(T.guestOrphanMenu),
     (T.guestOrphanMenu || []).join(' | ') || '(no options)');

/* the sweep is not overzealous */
S.ok('THE SWEEP KEEPS LEGITIMATE FURNITURE',      T.legitSurvivesSweep,
     'a sweep that eats real pieces is worse than the crash it prevents');

S.report(
  'Orphaned ids in ITEMS, HOUSE_FURNITURE and HOUSE_ROOMS all degrade to an empty space instead of taking a panel down, and the sweep leaves real data alone.',
  'that a real old save loads — this exercises the in-memory shape, not the save codec.');
