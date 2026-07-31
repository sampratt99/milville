/* ============================================================================
   upgradetest — replacing a built piece with a better one.

   THE BUG THIS EXISTS FOR: an occupied space used to list every other rung of
   its ladder, and since a left click runs the FIRST option, one click swapped a
   built piece for a different one — paying for it and refunding the old one
   without asking. An occupied space now offers Replace and Remove only, behind
   Examine.

   Run: node harness/upgradetest.mjs
   ========================================================================== */
import {runPass, Suite, PRELUDE} from './_lib.mjs';

const T = runPass(PRELUDE + String.raw`
  setLevel('construction', 99);
  clearInv(); give('coins', 20000000);
  freshHouse();

  const slotFor = cat => {
    for(const rk in HOUSE_ROOMS){
      const s = HOUSE_ROOMS[rk].slots.find(q => q.cat === cat);
      if(s) return {room: rk, id: s.id};
    }
    return null;
  };
  const stock = fid => {
    const F = HOUSE_FURNITURE[fid];
    give(F.plankId || 'oak_plank', F.planks | 0); give('iron_nails', F.nails | 0);
  };
  const setup = (cat, fid) => {
    const w = slotFor(cat);
    player.house.rooms = {}; player.house.rooms['1,0'] = w.room;
    player.house.slots = {};
    clearInv(); give('coins', 20000000); stock(fid);
    houseBuild('1,0:' + w.id, fid);
    since();
    return '1,0:' + w.id;
  };

  /* ---- the hearth ladder: firepit (req 1) -> hearth (req 28) ---- */
  const key = setup('hearth', 'hf_firepit');
  o.startPiece = houseSlots()[key];
  houseBuildMode = true; houseRebuild();
  const S0 = houseSlotByKey(key);
  o.menu = optionsAt(S0.x, S0.y).map(q => q.label || String(q.html || ''));
  o.firstOption = o.menu[0];
  o.buildEntries = o.menu.filter(l => /^Build /.test(l)).length;
  /* the label is "Upgrade to" when the replacement needs a higher level, and
     "Replace with" otherwise — both are the same menu entry */
  o.replaceEntries = o.menu.filter(l => /^(Replace with|Upgrade to) /.test(l)).length;
  o.removeEntries = o.menu.filter(l => /^Remove /.test(l)).length;
  o.removeIsLast = /^Remove /.test(o.menu[o.menu.length - 1] || '');
  o.examineIdx = o.menu.findIndex(l => /^Examine/.test(l));
  o.firstReplaceIdx = o.menu.findIndex(l => /^(Replace with|Upgrade to|Remove) /.test(l));
  o.nothingDestructiveFirst = !/^(Replace with|Upgrade to|Remove|Build) /.test(o.menu[0] || '');

  /* ---- REMOVING refunds half the coins and half the boards ----
     Done on a piece with a REAL cost: the firepit is free, and addItem('coins', 0)
     hits qty=qty||1 and hands back 1 coin, which would make the arithmetic here
     look wrong for a reason that has nothing to do with the refund rule. */
  const NEW = HOUSE_FURNITURE.hf_hearth;
  o.newCost = NEW.cost; o.newPlanks = NEW.planks | 0; o.newPlankId = NEW.plankId || 'oak_plank';
  const rKey = setup('hearth', 'hf_hearth');
  o.refundStart = houseSlots()[rKey];
  clearInv(); give('coins', 0);
  const coins0 = coinsCount(), planks0 = countItem(o.newPlankId);
  since();
  houseRemove(rKey);
  o.afterRemoveSlot = houseSlots()[rKey] || null;
  o.refundCoins = coinsCount() - coins0;
  o.refundPlanks = countItem(o.newPlankId) - planks0;
  o.removeSaid = since()[0] || null;

  /* the free-piece quirk, recorded rather than asserted away */
  const fKey = setup('hearth', 'hf_firepit');
  clearInv();
  houseRemove(fKey);
  o.freePieceRefund = coinsCount();
  o.freePieceCost = HOUSE_FURNITURE.hf_firepit.cost;
  since();

  /* then the better piece builds into the cleared slot */
  const uKey = setup('hearth', 'hf_firepit');
  houseRemove(uKey); since();
  clearInv(); give('coins', 1000000); stock('hf_hearth');
  houseBuild(uKey, 'hf_hearth');
  o.upgraded = houseSlots()[uKey];
  since();

  /* ---- you cannot replace with something you have not the level for ---- */
  setLevel('construction', 1);
  const key2 = setup('hearth', 'hf_firepit');
  clearInv(); give('coins', 20000000); stock('hf_hearth');
  since();
  houseBuild(key2, 'hf_hearth');
  o.lowLevelBlocked = houseSlots()[key2] === 'hf_firepit';
  o.lowLevelSaid = since()[0] || null;
  setLevel('construction', 99);

  /* ---- BUILDING OVER AN OCCUPIED SLOT ---- */
  /* houseBuild on an occupied slot overwrites without refunding: the menu never
     offers it, so this documents what the function itself does. */
  const key3 = setup('hearth', 'hf_firepit');
  clearInv(); give('coins', 20000000); stock('hf_hearth');
  const c3 = coinsCount();
  houseBuild(key3, 'hf_hearth');
  o.directOverwrite = houseSlots()[key3];
  o.directCharged = c3 - coinsCount();
  since();

  /* ---- the ladder offered is only the SAME category ---- */
  const key4 = setup('hearth', 'hf_firepit');
  houseBuildMode = true; houseRebuild();
  const S4 = houseSlotByKey(key4);
  const menu4 = optionsAt(S4.x, S4.y).map(q => q.label || String(q.html || ''));
  const hearthNames = Object.keys(HOUSE_FURNITURE)
    .filter(f => HOUSE_FURNITURE[f].cat === 'hearth')
    .map(f => HOUSE_FURNITURE[f].name);
  o.replaceNames = menu4.filter(l => /^Replace with /.test(l)).map(l => l.replace('Replace with ', ''));
  o.allReplacementsSameCat = o.replaceNames.every(n => hearthNames.includes(n));
  o.doesNotOfferItself = !o.replaceNames.includes(HOUSE_FURNITURE.hf_firepit.name);

  /* ---- an EMPTY slot offers Build, and the best affordable piece is the ghost -- */
  houseRemove(key4); since();
  houseRebuild();
  const S5 = houseSlotByKey(key4);
  o.emptyMenu = optionsAt(S5.x, S5.y).map(q => q.label || String(q.html || ''));
  o.emptyOffersBuild = o.emptyMenu.some(l => /^Build /.test(l));
  o.ghost = houseGhostFor('hearth');
  clearInv(); give('coins', 20000000); stock('hf_hearth');
  o.ghostWithMaterials = houseGhostFor('hearth');
  clearInv();
  o.ghostWithNothing = houseGhostFor('hearth');

  houseBuildMode = false;
  if(inHouse) exitHouse();
  return o;
`);

const S = new Suite('upgradetest').guard(T);

S.eq('a piece is built to upgrade from',          T.startPiece, 'hf_firepit');

/* the menu-order bug */
/* the firepit is functional, so its action leads; what matters is that nothing
   that spends money or tears the piece out is first */
S.ok('NOTHING DESTRUCTIVE LEADS THE MENU',        T.nothingDestructiveFirst, T.menu.join(' | '));
S.ok('  Examine comes before the build options',  T.examineIdx >= 0 && T.examineIdx < T.firstReplaceIdx,
     `Examine at ${T.examineIdx}, first build option at ${T.firstReplaceIdx}`);
S.eq('AN OCCUPIED SPACE OFFERS NO Build ENTRIES', T.buildEntries, 0);
S.ok('  it offers Replace/Upgrade instead',       T.replaceEntries > 0, `${T.replaceEntries} replacements`);
S.eq('  and exactly one Remove',                  T.removeEntries, 1);
S.ok('  with Remove LAST',                        T.removeIsLast, T.menu.join(' | '));

/* removal economics */
S.eq('a piece with a real cost is built',         T.refundStart, 'hf_hearth');
S.eq('removing clears the slot',                  T.afterRemoveSlot, null);
S.eq('  refunding half the coins',                T.refundCoins, Math.floor(T.newCost / 2));
S.eq('  and half the boards',                     T.refundPlanks, Math.floor(T.newPlanks / 2));
S.ok('  and saying so',                           /recovering/i.test(T.removeSaid || ''), T.removeSaid);
S.eq('then the better piece builds',              T.upgraded, 'hf_hearth');

/* gating */
S.ok('A LOW LEVEL CANNOT UPGRADE',                T.lowLevelBlocked);
S.ok('  and is told the level it needs',          /Construction level 28/.test(T.lowLevelSaid || ''), T.lowLevelSaid);

/* the direct path */
S.eq('houseBuild over an occupied slot replaces it', T.directOverwrite, 'hf_hearth');
S.eq('  charging the new piece',                  T.directCharged, T.newCost);

/* the ladder */
S.ok('every replacement is the same category',    T.allReplacementsSameCat,
     T.replaceNames.join(', '));
S.ok('  and it never offers what is already there', T.doesNotOfferItself);

/* empty slots */
S.ok('an emptied slot offers Build again',        T.emptyOffersBuild, T.emptyMenu.join(' | '));
S.eq('a FREE piece refunds a token coin',         T.freePieceRefund, 1);
S.note(`removing the free firepit (cost ${T.freePieceCost}) hands back ${T.freePieceRefund} coin: ` +
       `addItem('coins', Math.floor(0/2)) hits qty=qty||1. Harmless — rebuilding it costs 2 boards ` +
       `worth far more than 1gp, so it is not farmable.`);
S.ok('the ghost is the best piece you can afford', !!T.ghostWithMaterials, String(T.ghostWithMaterials));
S.eq('  and nothing when you have nothing',       T.ghostWithNothing, null);

S.report(
  'An occupied space offers Replace and Remove behind Examine, never a bare Build, and removal refunds half of both coins and boards.',
  'the swap animation and how the new piece looks in the room — needs a browser.');
