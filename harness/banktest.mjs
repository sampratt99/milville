/* ============================================================================
   banktest — the house bank chest, and the panel flag that outlived its world.

   THE BUG (docs/23 §9): bankOpen left true after a house bank chest routed EVERY
   inventory click to depositSlot. You would leave the cottage, click a piece of
   food on the lane, and deposit it into a bank that was not open. exitToMainMap
   now dismisses bank and shop, and reconcileCounters() heals a desync every
   frame.

   Run: node harness/banktest.mjs
   ========================================================================== */
import {runPass, Suite, PRELUDE, SRC} from './_lib.mjs';

const T = runPass(PRELUDE + String.raw`
  setLevel('construction', 99);
  clearInv(); give('coins', 20000000);
  freshHouse();

  /* the chest and the wardrobe are the two house bank pieces */
  o.bankPieces = ['hf_chest', 'hf_wardrobe'].filter(f => HOUSE_FURNITURE[f]);
  const slotFor = cat => {
    for(const rk in HOUSE_ROOMS){
      const s = HOUSE_ROOMS[rk].slots.find(q => q.cat === cat);
      if(s) return {room: rk, id: s.id};
    }
    return null;
  };

  /* build the wardrobe (bedroom) and read its menu */
  const F = HOUSE_FURNITURE.hf_wardrobe;
  const w = slotFor(F.cat);
  player.house.rooms = {}; player.house.rooms['1,0'] = w.room;
  player.house.slots = {};
  give(F.plankId || 'oak_plank', F.planks | 0); give('iron_nails', F.nails | 0);
  houseBuild('1,0:' + w.id, 'hf_wardrobe');
  since();
  o.built = houseSlots()['1,0:' + w.id];
  houseRebuild();
  const S0 = houseSlotByKey('1,0:' + w.id);
  o.chestTile = S0 ? {x: S0.x, y: S0.y} : null;
  o.chestMenu = S0 ? optionsAt(S0.x, S0.y).map(q => q.label || String(q.html || '')) : [];
  o.offersSearch = o.chestMenu.some(l => /^Search /.test(l));
  o.searchIsFirst = /^Search /.test(o.chestMenu[0] || '');

  /* ---- the chest opens the SAME bank as the bank chest on campus ---- */
  bank.length = 0;
  bank.push({id: 'oak_plank', qty: 12});
  bank.push({id: 'iron_nails', qty: 30});
  o.bankBefore = bank.length;

  if(typeof openBank === 'function') openBank();
  o.bankOpenInHouse = bankOpen;
  o.bankElOn = bankEl.classList.contains('on');
  o.bankSeesStock = bank.reduce((n, b) => n + ((b && b.id === 'oak_plank') ? b.qty : 0), 0);

  /* ---- THE TRAP: leaving with the bank open ---- */
  o.flagBeforeExit = bankOpen;
  exitHouse();
  o.flagAfterExit = bankOpen;
  o.elAfterExit = bankEl.classList.contains('on');

  /* an inventory click on the lane must NOT deposit */
  clearInv(); give('coins', 100); give('lobster', 1);
  const bankSizeBefore = bank.length;
  const lobsterSlot = player.inv.findIndex(s => s && s.id === 'lobster');
  o.lobsterSlot = lobsterSlot;
  since();
  if(typeof invClick === 'function' && lobsterSlot >= 0) invClick(lobsterSlot);
  o.lobsterStillHeld = countItem('lobster') === 1;
  o.bankDidNotGrow = bank.length === bankSizeBefore;
  since();

  /* ---- reconcileCounters heals a desync ---- */
  bankOpen = true;
  bankEl.classList.remove('on');
  reconcileCounters();
  o.healedOpenFlag = bankOpen;

  /* The reverse desync (panel showing, flag down) is deliberately NOT healed:
     reconcileCounters only ever clears a flag, never opens or closes a panel.
     That is the safe direction — a stale flag routes clicks to depositSlot,
     while a stale panel is merely visible. Recorded so the asymmetry is a
     decision rather than an oversight. */
  bankOpen = false;
  bankEl.classList.add('on');
  reconcileCounters();
  o.panelAfterReverse = bankEl.classList.contains('on');
  o.flagAfterReverse = bankOpen;
  bankEl.classList.remove('on');

  /* the shop flag heals the same way */
  shopOpen = true;
  geEl.classList.remove('on');
  reconcileCounters();
  o.healedShopFlag = shopOpen;

  /* ---- the shop flag gets the same treatment ---- */
  freshHouse();
  shopOpen = true;
  exitHouse();
  o.shopAfterExit = shopOpen;

  /* ---- a GUEST cannot open the owner's chest ---- */
  clearInv(); give('coins', 20000000);
  freshHouse();
  const mine = {rooms: Object.assign({}, houseRooms()), slots: Object.assign({}, houseSlots())};
  houseVisit = {uid: 'bob', name: 'Bob', rooms: mine.rooms, slots: mine.slots};
  houseRebuild();
  const S1 = houseSlotByKey(Object.keys(mine.slots)[0] || '1,0:wardrobe');
  o.guestChestMenu = S1 ? optionsAt(S1.x, S1.y).map(q => q.label || String(q.html || '')) : [];
  houseVisit = null;
  if(inHouse) exitHouse();

  bank.length = 0;
  return o;
`);

const S = new Suite('banktest').guard(T);

S.ok('there are house bank pieces',               T.bankPieces.length >= 1, T.bankPieces.join(', '));
S.eq('the wardrobe builds',                       T.built, 'hf_wardrobe');
S.ok('  offering Search',                         T.offersSearch, T.chestMenu.join(' | '));
S.ok('  as the first option',                     T.searchIsFirst,
     'a bank is not destructive, so it may lead — but nothing costlier may sit ahead of it');

S.ok('opening it sets the bank flag',             T.bankOpenInHouse);
S.ok('  and shows the panel',                     T.bankElOn);
S.eq('  onto the SAME bank you use on campus',    T.bankSeesStock, 12);

/* the trap */
S.ok('the flag was up before leaving',            T.flagBeforeExit,
     'if this were false the next check would pass for the wrong reason');
S.eq('A PANEL FLAG DOES NOT OUTLIVE ITS WORLD',   T.flagAfterExit, false);
S.eq('  and the panel is dismissed with it',      T.elAfterExit, false);
S.ok('an inventory click on the lane does not deposit', T.lobsterStillHeld,
     'this is the exact symptom: every click routed to depositSlot');
S.ok('  and nothing reached the bank',            T.bankDidNotGrow);

S.eq('reconcileCounters heals a stale flag',      T.healedOpenFlag, false);
S.eq('  and the shop flag too',                   T.healedShopFlag, false);
/* it clears flags, it never touches panels — the safe direction */
S.eq('  it does NOT force a panel shut',          T.panelAfterReverse, true);
S.eq('  and leaves a down flag down',             T.flagAfterReverse, false);
S.note('reconcileCounters only ever clears a FLAG, never opens or closes a panel. ' +
       'A stale flag routes every inventory click to depositSlot; a stale panel is just visible. ' +
       'Healing one direction is the deliberate choice.');
S.eq('the shop flag is dismissed too',            T.shopAfterExit, false);

S.ok('A GUEST IS NOT OFFERED THE OWNER’S BANK',
     !(T.guestChestMenu || []).some(l => /^Search /.test(l)),
     (T.guestChestMenu || []).join(' | ') || '(no options)');

/* source: every world swap, not just this one */
S.ok('exitHouse closes the bank',                 /function exitHouse\(\)[\s\S]{0,300}?closeBank\(\)/.test(SRC));
S.ok('exitToMainMap closes the bank',             /function exitToMainMap\(\)[\s\S]{0,600}?closeBank/.test(SRC));
S.ok('closeBank clears BOTH the flag and the class',
     /function closeBank\(\)\{bankOpen=false;bankEl\.classList\.remove\('on'\);\}/.test(SRC));

S.report(
  'The house chest opens the real bank, and no bank or shop flag survives leaving the cottage — an inventory click on the lane stays an inventory click.',
  'the bank panel itself: layout, tabs and drag-to-reorder all need a browser.');
