/* ============================================================================
   poh15 — the entry arc, end to end: the ruined cottage, Mr. Bohan, the deed,
   and the three repair stages.

   This is the front half of the Construction chain walked as ONE sequence, in
   order, with the gates between steps asserted. deedtest and repairflow prove
   the unit rules of each step; this proves they compose — that a player who
   starts at the cottage door with nothing can actually get inside, and cannot
   skip a rung on the way.

   Run: node harness/poh15.mjs
   ========================================================================== */
import {runPass, Suite, PRELUDE} from './_lib.mjs';

const T = runPass(PRELUDE + String.raw`
  setLevel('construction', 1);

  /* ---------------- THE RUINED COTTAGE ---------------- */
  const b = BUILDINGS.find(q => q.kind === 'pohcottage');
  o.cottage = b ? {x: b.x, y: b.y, w: b.w, h: b.h, ex: !!b[8]} : null;
  o.cottageName = b ? b.name : null;
  o.doorTile = {x: 231, y: 111};
  o.returnTile = {x: HOUSE_RETURN.x, y: HOUSE_RETURN.y};

  /* the exterior has four states, driven by pohStage() */
  const exteriorAt = st => {
    player.house = {owned: true, repair: st, rooms: null, slots: {}, slotsV2: 1};
    pohRefreshExterior();
    return {
      ruin:   pohRuinGroup  ? pohRuinGroup.visible  : null,
      debris: pohRuinDebris ? pohRuinDebris.visible : null,
      fixed:  pohFixGroup   ? pohFixGroup.visible   : null,
      detail: pohFixDetail  ? pohFixDetail.visible  : null,
    };
  };
  o.exterior = [0, 1, 2, 3].map(exteriorAt);

  /* ---------------- MR. BOHAN ---------------- */
  const bohan = npcs.find(n => n && n.id === 'bohan');
  o.bohan = bohan ? {x: bohan.x, y: bohan.y, name: bohan.name, ex: !!bohan.ex} : null;
  o.bohanNearCottage = (bohan && b)
    ? Math.abs(bohan.x - b.x) + Math.abs(bohan.y - b.y) : null;
  o.bohanHasDialogue = !!(typeof DIALOGUES !== 'undefined' && DIALOGUES.bohan);
  o.bohanQuotesPrice = false;
  o.bohanPrice = fmt(POH_DEED_PRICE);
  if(o.bohanHasDialogue){
    player.house = null;
    const tree = DIALOGUES.bohan();
    const text = Object.keys(tree).map(k => tree[k] && tree[k].text || '').join(' ');
    /* He says it in WORDS -- "Fifty thousand coins" -- not as a formatted number,
       so the price cannot be derived from POH_DEED_PRICE and a retune leaves his
       script lying. Check both spellings and report which one carried it. */
    o.priceDigits = text.indexOf(fmt(POH_DEED_PRICE)) >= 0;
    o.priceWords = /fifty thousand/i.test(text);
    o.bohanQuotesPrice = o.priceDigits || o.priceWords;
    o.bohanNodes = Object.keys(tree).length;
    /* no branch may point at a node that does not exist */
    const dangling = [];
    for(const k in tree){
      const n = tree[k], outs = [];
      if(n.next) outs.push(n.next);
      if(n.opts) for(const opt of n.opts) if(opt.next) outs.push(opt.next);
      for(const nx of outs) if(nx !== 'bye' && !tree[nx]) dangling.push(k + ' -> ' + nx);
    }
    o.bohanDangling = dangling;
  }

  /* ---------------- STEP 1: THE DOOR BEFORE THE DEED ---------------- */
  player.house = null;
  clearInv(); give('coins', 100000);
  since();
  o.doorOptionsUndeeded = optionsAt(o.doorTile.x, o.doorTile.y).map(q => q.label || String(q.html || ''));
  enterHouse();
  o.enteredUndeeded = inHouse;
  o.undeededSaid = since().join(' | ');
  if(inHouse) exitHouse();

  /* ---------------- STEP 2: BUYING THE DEED ---------------- */
  clearInv(); give('coins', POH_DEED_PRICE - 1);
  since();
  bohanBuyDeed();
  o.brokeBought = pohOwned();
  o.brokeSaid = since()[0] || null;

  clearInv(); give('coins', POH_DEED_PRICE);
  const beforeCoins = coinsCount();
  since();
  bohanBuyDeed();
  o.bought = pohOwned();
  o.deedInPack = countItem('house_deed');
  o.paid = beforeCoins - coinsCount();
  o.buySaid = since().join(' | ');
  o.repairStartsAtZero = pohStage();

  /* buying twice hands out nothing more */
  give('coins', POH_DEED_PRICE);
  since();
  bohanBuyDeed();
  o.deedAfterSecond = countItem('house_deed');
  o.secondSaid = since()[0] || null;

  /* ---------------- STEP 3: A WRECK IS NOT ENTERABLE ---------------- */
  since();
  enterHouse();
  o.enteredWreck = inHouse;
  o.wreckSaid = since()[0] || null;
  if(inHouse) exitHouse();

  /* ---------------- STEP 4: THE THREE REPAIR STAGES, IN ORDER ---------------- */
  o.steps = POH_REPAIR_STEPS.map(s => ({n: s.n, planks: s.planks, nails: s.nails, coins: s.coins}));
  o.stages = [];
  for(let k = 0; k < POH_REPAIR_STEPS.length; k++){
    const S0 = POH_REPAIR_STEPS[k];
    /* first try it EMPTY-HANDED: every stage must refuse */
    clearInv();
    since();
    pohRepairNext();
    const refusedSaid = since()[0] || null;
    const refused = pohStage() === k;

    /* then with exactly what it asks for */
    clearInv();
    give('coins', S0.coins);
    if(S0.planks) give('oak_plank', S0.planks);
    if(S0.nails) give('iron_nails', S0.nails);
    const c0 = coinsCount();
    since();
    pohRepairNext();
    const log = since();
    o.stages.push({
      k, refused, refusedSaid,
      advanced: pohStage() === k + 1,
      spent: c0 - coinsCount(),
      planksLeft: countItem('oak_plank'),
      nailsLeft: countItem('iron_nails'),
      said: log.join(' | '),
      exterior: (pohRefreshExterior(), {
        ruin: pohRuinGroup ? pohRuinGroup.visible : null,
        fixed: pohFixGroup ? pohFixGroup.visible : null,
        detail: pohFixDetail ? pohFixDetail.visible : null,
      }),
      enterable: (() => { since(); enterHouse(); const inn = inHouse; if(inn) exitHouse(); since(); return inn; })(),
    });
  }
  o.finalStage = pohStage();
  o.repaired = pohRepaired();

  /* ---------------- STEP 5: NOW THE DOOR WORKS ---------------- */
  clearInv(); give('coins', 1000);
  since();
  o.doorOptionsRepaired = optionsAt(o.doorTile.x, o.doorTile.y).map(q => q.label || String(q.html || ''));
  enterHouse();
  o.enteredAtLast = inHouse;
  o.landedAt = {x: player.x, y: player.y};
  o.startingRooms = Object.keys(houseRooms()).length;
  exitHouse();
  o.leftTo = {x: player.x, y: player.y};

  /* a fourth repair does nothing */
  since();
  pohRepairNext();
  o.fourthSaid = since()[0] || null;
  o.stageAfterFourth = pohStage();

  return o;
`);

const S = new Suite('poh15').guard(T);

/* the cottage */
S.ok('the ruined cottage is on the map',          !!T.cottage);
S.eq('  at runtime 230,111',                      [T.cottage.x, T.cottage.y], [230, 111]);
S.eq('  named for what it is',                    T.cottageName, 'The Ruined Cottage');
S.eq('  with its door at 231,111',                [T.doorTile.x, T.doorTile.y], [231, 111]);
S.eq('  and you step back out beside it',         [T.returnTile.x, T.returnTile.y], [231, 110]);

/* the exterior states */
S.eq('stage 0 is a wreck with debris',            [T.exterior[0].ruin, T.exterior[0].debris], [true, true]);
S.eq('stage 1 clears the debris, wreck remains',  [T.exterior[1].ruin, T.exterior[1].debris], [true, false]);
S.eq('stage 2 raises the shell',                  [T.exterior[2].ruin, T.exterior[2].fixed], [false, true]);
S.eq('  but without the finishing detail',        T.exterior[2].detail, false);
S.eq('stage 3 adds glazing and chimney',          [T.exterior[3].fixed, T.exterior[3].detail], [true, true]);

/* Bohan */
S.ok('Mr. Bohan is on the map',                   !!T.bohan);
S.eq('  at runtime 229,110',                      [T.bohan.x, T.bohan.y], [229, 110]);
S.ok('  within sight of the cottage',             T.bohanNearCottage !== null && T.bohanNearCottage <= 4,
     `${T.bohanNearCottage} tiles`);
S.ok('  with examine text',                       T.bohan.ex);
S.ok('  and a dialogue tree',                     T.bohanHasDialogue, `${T.bohanNodes} nodes`);
S.eq('  no branch of it dangles',                 (T.bohanDangling || []).length, 0);
if((T.bohanDangling || []).length) S.note(T.bohanDangling.join(', '));
S.ok('  HE QUOTES THE DEED PRICE',                T.bohanQuotesPrice,
     T.priceDigits ? 'as a formatted number' : 'in words');
S.note(T.priceDigits
  ? 'Bohan quotes the price as a formatted number, so it tracks POH_DEED_PRICE.'
  : 'Bohan says the price in WORDS ("Fifty thousand coins"), so it CANNOT track ' +
    `POH_DEED_PRICE (${T.bohanPrice}). Retuning the deed means editing his script by hand — ` +
    'the same coupling darylitest records for the sawmill fees.');

/* step 1 */
S.eq('AN UNDEEDED COTTAGE CANNOT BE ENTERED',     T.enteredUndeeded, false);
S.ok('  and says Bohan holds the deed',           /padlocked|Bohan/i.test(T.undeededSaid || ''), T.undeededSaid);
/* The door DOES still offer Enter on an undeeded cottage, and that is deliberate:
   docs/23 §9 puts the gate in enterHouse() so EVERY route in is closed, not just
   the door. Clicking it is how a new player is told Bohan holds the deed. */
S.ok('  the door still offers Enter',             (T.doorOptionsUndeeded || []).some(l => /^Enter/.test(l)),
     (T.doorOptionsUndeeded || []).join(' | '));
S.ok('  but the gate is in enterHouse, not the menu', T.enteredUndeeded === false,
     'every route in is gated there, so a teleport or stray action cannot slip past either');

/* step 2 */
S.eq('one coin short buys nothing',               T.brokeBought, false);
S.ok('  and says the price',                      /coins for the deed/i.test(T.brokeSaid || ''), T.brokeSaid);
S.ok('THE DEED CAN BE BOUGHT',                    T.bought);
S.eq('  for exactly the listed price',            T.paid, 50000);
S.eq('  handing over one deed',                   T.deedInPack, 1);
S.ok('  with the seal-and-wax line',              /seal into the wax/i.test(T.buySaid || ''), T.buySaid);
S.eq('  and the repair starting at zero',         T.repairStartsAtZero, 0);
S.eq('BUYING TWICE HANDS OUT NO SECOND DEED',     T.deedAfterSecond, 1);
S.ok('  and says so',                             /already hold/i.test(T.secondSaid || ''), T.secondSaid);

/* step 3 */
S.eq('A WRECK IS NOT ENTERABLE EVEN WHEN OWNED',  T.enteredWreck, false);
S.ok('  and says why',                            /still a wreck/i.test(T.wreckSaid || ''), T.wreckSaid);

/* step 4 */
S.eq('three repair stages',                       T.steps.length, 3);
S.eq('  stage 1 is rubble: coins only',           [T.steps[0].planks, T.steps[0].nails], [0, 0]);
S.eq('  stage 2 wants 14 boards and 6 nails',     [T.steps[1].planks, T.steps[1].nails], [14, 6]);
S.eq('  stage 3 wants 8 and 3',                   [T.steps[2].planks, T.steps[2].nails], [8, 3]);
S.ok('  and no stage wants more boards than a pack holds',
     T.steps.every(s => s.planks <= 28),
     'boards do not stack, and repair happens BEFORE you can build a bell and hire staff');

for(const st of T.stages){
  S.ok(`stage ${st.k + 1} refuses empty-handed`,  st.refused, st.refusedSaid);
  S.ok(`  and lists what is missing`,             /still need/i.test(st.refusedSaid || ''), st.refusedSaid);
  S.ok(`stage ${st.k + 1} completes when paid`,   st.advanced, st.said);
  S.eq(`  charging exactly its coins`,            st.spent, T.steps[st.k].coins);
  S.eq(`  consuming every board`,                 st.planksLeft, 0);
  S.eq(`  and every nail`,                        st.nailsLeft, 0);
}
S.eq('the stages run in order to completion',     T.finalStage, 3);
S.ok('  leaving the cottage repaired',            T.repaired);

/* the gate only lifts at the end */
S.eq('after stage 1 the door is still shut',      T.stages[0].enterable, false);
S.eq('after stage 2 it is still shut',            T.stages[1].enterable, false);
S.ok('AFTER STAGE 3 IT OPENS',                    T.stages[2].enterable,
     'the whole arc exists to reach this');

/* step 5 */
S.ok('the door now offers Enter',                 (T.doorOptionsRepaired || []).some(l => /^Enter/.test(l)),
     (T.doorOptionsRepaired || []).join(' | '));
S.ok('  and Enter is what a left click runs',     /^Enter/.test((T.doorOptionsRepaired || [])[0] || ''),
     (T.doorOptionsRepaired || [])[0]);
S.ok('you get inside',                            T.enteredAtLast);
S.eq('  starting with the parlour',               T.startingRooms, 1);
S.eq('  and leave onto the doorstep',             [T.leftTo.x, T.leftTo.y], [231, 110]);

S.eq('a fourth repair does nothing',              T.stageAfterFourth, 3);
S.ok('  and says the cottage is done',            /fully restored|Nothing left to mend/i.test(T.fourthSaid || ''),
     T.fourthSaid);

S.report(
  'The entry arc composes: a locked wreck, Bohan quoting the real price, a deed that cannot be bought twice, three stages that each refuse empty-handed, and a door that opens only at the end.',
  'the cottage rebuilding in front of you — four exterior states are asserted by visibility flag, never by appearance.');
