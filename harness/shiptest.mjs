/* ============================================================================
   shiptest — walks the whole Construction chain in one pass.

     saw logs -> buy the deed -> repair x3 -> enter the house -> build a room
       -> build furniture -> gain xp -> hire a butler -> fetch boards from the bank

   This is the one to run after almost any change (docs/14_VALIDATION_HARNESSES.md).
   It is Pattern B: the game's own functions are called inside its module scope,
   so it proves the shipped code path, not a reimplementation of it.

     node harness/shiptest.mjs

   What it CANNOT prove, and nobody should read into it: how any of this looks.
   No WebGL, no layout. Room geometry, furniture models, the cottage exterior and
   the butler's walk all need Sam's eyes in a browser.
   ========================================================================== */
import {runPass, Suite, PRELUDE} from './_lib.mjs';

/* ==========================================================================
   The injected pass. It may touch anything in module scope but CANNOT see a
   variable from this file — every observation comes back through the return.
   ========================================================================== */
const T = runPass(PRELUDE + String.raw`
  clearInv();
  bank.length = 0;
  player.house = null;
  houseVisit = null;
  if(inHouse) try{ exitHouse(); }catch(e){}
  setLevel('construction', 1);
  setLevel('woodcutting', 50);

  /* =====================================================================
     1. THE SAWMILL — logs become boards, for a fee, for no experience
     ===================================================================== */
  give('coins', 5000);
  give('oak_logs', 5);
  const sawXpBefore = player.skills.construction;
  const sawCoinsBefore = coinsCount();
  o.sawFee = SAWMILL.find(r => r[0] === 'oak_logs')[2];

  let boards = 0;
  for(let k = 0; k < 5; k++) if(sawOneBoard('oak_logs')) boards++;
  o.sawBoardsMade = boards;
  o.sawLogsLeft = countItem('oak_logs');
  o.sawPlanks = countItem('oak_plank');
  o.sawCoinsSpent = sawCoinsBefore - coinsCount();
  o.sawXpGained = player.skills.construction - sawXpBefore;   /* MUST be 0, as in OSRS */
  since();

  /* it stops rather than going negative when the logs run out */
  o.sawOnEmpty = sawOneBoard('oak_logs');
  o.sawSaidEmpty = said(/sawn every/i);
  since();

  /* THE MILL IS FREE, so being broke is no longer a reason to refuse — it is a case
     that must WORK. A player who has spent everything on a deed can still make boards. */
  clearInv(); give('oak_logs', 1);
  o.sawOnBroke = sawOneBoard('oak_logs');
  o.sawBrokeMade = countItem('oak_plank');
  o.sawBrokeCoins = countItem('coins');
  since();

  /* =====================================================================
     2. THE DEED — 50,000 coins and no skill gate at all
     ===================================================================== */
  clearInv();
  o.deedShortfall = pohDeedShortfall().length;      /* the gate is gone: must be 0 */

  give('coins', 40000);
  bohanBuyDeed();
  o.deedOwnedWhenBroke = pohOwned();                /* must stay false */
  o.deedSaidBroke = said(/need .* coins for the deed/i);
  since();

  give('coins', 20000);                             /* 60,000 total */
  const beforeDeed = coinsCount();
  bohanBuyDeed();
  o.deedOwned = pohOwned();
  o.deedPaid = beforeDeed - coinsCount();
  o.deedInPack = countItem('house_deed');
  o.deedRepairStage = pohStage();
  since();

  /* =====================================================================
     3. A RUIN IS NOT ENTERABLE — the gate lives in enterHouse(), not the door
     ===================================================================== */
  enterHouse();
  o.enteredWhileRuined = inHouse;                   /* must stay false */
  o.ruinSaidWreck = said(/still a wreck/i);
  since();

  /* =====================================================================
     4. REPAIR — three stages, and no stage may want more boards than a pack holds
     ===================================================================== */
  o.repairSteps = POH_REPAIR_STEPS.length;
  o.repairWorstPlanks = Math.max(...POH_REPAIR_STEPS.map(s => s.planks|0));
  o.repairStages = [];

  for(let st = 0; st < POH_REPAIR_STEPS.length; st++){
    const S = POH_REPAIR_STEPS[st];
    clearInv();
    give('coins', S.coins);
    if(S.planks) give('oak_plank', S.planks);
    if(S.nails)  give('iron_nails', S.nails);
    const room = freeSlots();
    pohRepairNext();
    o.repairStages.push({
      step: st,
      reached: pohStage(),
      planksLeft: countItem('oak_plank'),
      nailsLeft: countItem('iron_nails'),
      coinsLeft: coinsCount(),
      slotsToSpare: room,                            /* the unaided-pack rule */
    });
    since();
  }
  o.repaired = pohRepaired();

  /* one stage short of the materials is refused, not part-charged */
  const beforeShort = coinsCount();
  pohRepairNext();
  o.repairPastEndCharged = beforeShort - coinsCount();
  o.repairSaidDone = said(/fully restored|Nothing left to mend/i);
  since();

  /* =====================================================================
     5. ENTER — and the parlour is there waiting
     ===================================================================== */
  enterHouse();
  o.inHouse = inHouse;
  o.rooms = Object.assign({}, houseRooms());
  o.entryRoom = roomAt(HOUSE_ENTRY.gx, HOUSE_ENTRY.gy);
  o.playerAtDoor = {x: player.x, y: player.y};
  const ex = houseExitTile();
  o.doorTile = {x: ex.x, y: ex.y};
  o.doorIsFloor = houseTiles[ex.y][ex.x] === T_FLOOR;
  since();

  /* =====================================================================
     6. BUILD A ROOM
     ===================================================================== */
  clearInv();
  give('coins', 15000);                              /* a workshop, exactly */
  const beforeRoom = coinsCount();
  houseBuildRoom(0, 0, 'workshop');
  o.workshopBuilt = roomAt(0, 0);
  o.roomPaid = beforeRoom - coinsCount();
  o.roomCost = HOUSE_ROOMS.workshop.cost;
  since();

  /* the three rules that keep the house a house */
  give('coins', 3000000);
  houseBuildRoom(2, 0, 'parlour');
  o.dupRoomBlocked = roomAt(2, 0) === null;
  o.dupSaidOneEach = said(/One of each/i);
  since();

  /* the courtyard rule is gone: any room may take the middle, and the garden may
     sit anywhere. What still holds is one-of-each and adjacency. */
  houseBuildRoom(1, 1, 'kitchen');
  o.centreTakesAnyRoom = roomAt(1, 1);
  o.noCourtyardComplaint = !said(/courtyard/i);
  since();

  houseBuildRoom(0, 2, 'kitchen');                   /* touches nothing built */
  o.orphanRoomBlocked = roomAt(0, 2) === null;
  o.orphanSaidAdjoin = said(/adjoin/i);
  since();

  /* the garden is an ordinary room now: put it in a corner, nowhere near the middle */
  houseBuildRoom(0, 1, 'garden');
  o.gardenAnywhere = roomAt(0, 1);
  since();

  /* a doorway got punched through between the parlour and the workshop */
  o.workshopFloorCarved = (() => {
    const org = roomOrigin(0, 0);
    return houseTiles[org.y + 5][org.x + 5] === T_FLOOR;
  })();

  /* =====================================================================
     7. BUILD FURNITURE — materials out, experience in
     ===================================================================== */
  const F = HOUSE_FURNITURE.hf_armchair;
  const SLOT = HOUSE_ENTRY.gx + ',' + HOUSE_ENTRY.gy + ':seat_a';
  o.slotExists = !!houseSlotByKey(SLOT);
  o.furnCat = F.cat;
  o.slotCat = (houseSlotByKey(SLOT) || {}).cat;

  /* under-level is refused outright */
  clearInv();
  setLevel('construction', F.req - 1);
  give('coins', F.cost); give('plank', F.planks); give('iron_nails', F.nails);
  houseBuild(SLOT, 'hf_armchair');
  o.buildUnderLevelBlocked = !houseSlots()[SLOT];
  o.buildSaidLevel = said(new RegExp('need Construction level ' + F.req, 'i'));
  since();

  /* short of boards is refused, and nothing is charged for the attempt */
  clearInv();
  setLevel('construction', F.req);
  give('coins', F.cost); give('plank', F.planks - 1); give('iron_nails', F.nails);
  const beforeShortBuild = coinsCount();
  houseBuild(SLOT, 'hf_armchair');
  o.buildShortBlocked = !houseSlots()[SLOT];
  o.buildShortCharged = beforeShortBuild - coinsCount();
  since();

  /* and the real thing */
  clearInv();
  setLevel('construction', F.req);
  give('coins', F.cost); give('plank', F.planks); give('iron_nails', F.nails);
  const xpBefore = player.skills.construction;
  const coinsBefore = coinsCount();
  houseBuild(SLOT, 'hf_armchair');
  o.built = houseSlots()[SLOT];
  o.buildXp = player.skills.construction - xpBefore;
  o.buildXpWanted = F.xp;
  o.buildPaid = coinsBefore - coinsCount();
  o.buildPlanksLeft = countItem('plank');
  o.buildNailsLeft = countItem('iron_nails');
  o.conLevelAfter = lvl('construction');
  since();

  /* Every model is built facing +z, so a piece against any wall but the north
     one needs turning or it faces into the plaster. Check all four readings. */
  const face = id => houseSlotFacing(houseSlotByKey(HOUSE_ENTRY.gx + ',' + HOUSE_ENTRY.gy + ':' + id));
  o.facing = {
    west:  face('seat_a'),    /* ox 2  -> against the west wall  */
    east:  face('seat_b'),    /* ox 10 -> against the east wall  */
    north: face('hearth'),    /* oy 1  -> against the north wall */
    free:  face('rug'),       /* middle of the floor             */
  };

  /* =====================================================================
     8. HIRE A BUTLER, AND SEND THEM TO THE BANK
     ===================================================================== */
  const B = BUTLERS[0];
  o.butlerTier = B.id;
  o.butlerReq = B.req;
  o.butlerFee = B.fee;
  o.butlerLoad = B.load;

  clearInv();
  setLevel('construction', 1);
  give('coins', 100);
  /* a hire needs a bell to be summoned by */
  houseSlots()[HOUSE_ENTRY.gx + ',' + HOUSE_ENTRY.gy + ':bell'] = 'hf_bell';
  o.bellUp = !!houseHasBell();
  butlerHire(B.id);
  o.hireWhenBrokeBlocked = !butlerHired();
  since();

  give('coins', 50000);
  butlerHire(B.id);
  o.hired = butlerHired() ? butlerHired().id : null;
  since();

  /* an empty bank sends nobody anywhere */
  bank.length = 0;
  const beforeEmptyFetch = coinsCount();
  butlerFetch('oak_plank');
  o.fetchEmptyBankCharged = beforeEmptyFetch - coinsCount();
  o.fetchSaidEmpty = said(/no .*plank.*in your bank/i);
  since();

  /* stock the bank and send them properly */
  bank.push({id:'oak_plank', qty:20});
  const feePaidFrom = coinsCount();
  __shim.timers.length = 0;
  butlerFetch('oak_plank');
  o.fetchFee = feePaidFrom - coinsCount();
  o.fetchBusy = butlerBusy();
  o.fetchPending = Object.assign({}, butlerState().pending);
  o.fetchTimersQueued = __shim.timers.length;          /* the trip is deferred, not instant */

  /* the third former drops one about 1 in 12, so pin the roll rather than
     let the suite flake. High roll first: a clean delivery. */
  const _rand = Math.random;
  Math.random = () => 0.99;
  __shim.flushTimers();
  Math.random = _rand;

  o.fetchDelivered = countItem('oak_plank');
  o.fetchBankLeft = bank.filter(b => b.id === 'oak_plank').reduce((n, b) => n + b.qty, 0);
  o.fetchBusyAfter = butlerBusy();
  since();

  /* low roll: the keen-but-careless branch loses exactly one */
  clearInv();
  give('coins', 50000);
  __shim.timers.length = 0;
  butlerFetch('oak_plank');
  Math.random = () => 0.0;
  __shim.flushTimers();
  Math.random = _rand;
  o.fetchDroppedDelivered = countItem('oak_plank');
  o.fetchSaidDropped = said(/drops one on the step/i);
  since();

  /* they fetch; they never build. */
  o.butlerNeverBuilds = !/houseBuild\s*\(/.test(butlerFetch.toString() + butlerReturn.toString());

  /* =====================================================================
     9. OUT AGAIN — a panel flag must never outlive its world
     ===================================================================== */
  bankOpen = true; shopOpen = true;
  exitHouse();
  o.leftHouse = !inHouse;
  o.bankDismissed = bankOpen === false;
  o.shopDismissed = shopOpen === false;
  o.backOnDoorstep = {x: player.x, y: player.y};
  o.returnWanted = {x: HOUSE_RETURN.x, y: HOUSE_RETURN.y};
  since();

  return o;
`);

/* ==========================================================================
   Assertions live out here, where they can see this file's variables.
   ========================================================================== */
const S = new Suite('shiptest').guard(T);
const ok = (n, c, d) => S.ok(n, c, d);
const eq = (n, g, w) => S.eq(n, g, w);

/* 1. sawmill */
eq('saws every log in the pack',                  T.sawBoardsMade, 5);
eq('  logs consumed',                             T.sawLogsLeft, 0);
eq('  boards produced',                           T.sawPlanks, 5);
eq('  charged nothing, 5 times over',             T.sawCoinsSpent, T.sawFee * 5);   /* sawFee is 0 */
eq('SAWING AWARDS NO EXPERIENCE (as in OSRS)',    T.sawXpGained, 0);
eq('stops when the logs run out',                 T.sawOnEmpty, false);
ok('  and says so',                               T.sawSaidEmpty);
eq('A PENNILESS PLAYER CAN STILL MILL',           T.sawOnBroke, true);
eq('  and gets the board',                        T.sawBrokeMade, 1);
eq('  having spent nothing',                      T.sawBrokeCoins, 0);

/* 2. the deed */
eq('the deed has NO skill gate',                  T.deedShortfall, 0);
eq('40k does not buy a 50k deed',                 T.deedOwnedWhenBroke, false);
ok('  and says so',                               T.deedSaidBroke);
eq('the deed is bought',                          T.deedOwned, true);
eq('  at exactly POH_DEED_PRICE',                 T.deedPaid, 50000);
eq('  and lands in the pack',                     T.deedInPack, 1);
eq('  leaving the cottage unrepaired',            T.deedRepairStage, 0);

/* 3. the ruin gate */
eq('a RUIN IS NOT ENTERABLE',                     T.enteredWhileRuined, false);
ok('  and says so',                               T.ruinSaidWreck);

/* 4. repair */
eq('three repair stages',                         T.repairSteps, 3);
T.repairStages.forEach((s, k) => {
  eq(`repair stage ${k + 1} completes`,           s.reached, k + 1);
  eq(`  stage ${k + 1} consumes its boards`,      s.planksLeft, 0);
  eq(`  stage ${k + 1} consumes its nails`,       s.nailsLeft, 0);
  eq(`  stage ${k + 1} consumes its coins`,       s.coinsLeft, 0);
  ok(`  stage ${k + 1} fits an unaided pack`,     s.slotsToSpare >= 0,
     `${28 - s.slotsToSpare} of 28 slots used`);
});
ok('no stage wants more boards than a pack holds', T.repairWorstPlanks <= 26,
   `worst stage wants ${T.repairWorstPlanks} boards`);
eq('the cottage ends up repaired',                T.repaired, true);
eq('a fourth repair charges nothing',             T.repairPastEndCharged, 0);
ok('  and says it is done',                       T.repairSaidDone);

/* 5. entering */
eq('a repaired cottage lets you in',              T.inHouse, true);
eq('the entry cell is the parlour',               T.entryRoom, 'parlour');
eq('you arrive just inside the door',             T.playerAtDoor.y, T.doorTile.y + 1);
ok('the front door is walkable floor',            T.doorIsFloor);

/* 6. rooms */
eq('a workshop goes up next to the parlour',      T.workshopBuilt, 'workshop');
eq('  charged the flat room cost',                T.roomPaid, T.roomCost);
eq('  and that cost is the shipped 15,000',       T.roomCost, 15000);
ok('its floor is carved out',                     T.workshopFloorCarved);
ok('ONE OF EACH ROOM TYPE — a second parlour is refused', T.dupRoomBlocked);
ok('  and says so',                               T.dupSaidOneEach);
ok('ANY ROOM MAY TAKE THE MIDDLE CELL',           T.centreTakesAnyRoom === 'kitchen');
ok('  with no courtyard complaint',               T.noCourtyardComplaint);
ok('a room must adjoin one you already have',     T.orphanRoomBlocked);
ok('  and says so',                               T.orphanSaidAdjoin);
eq('THE GARDEN GOES ANYWHERE, even a corner',     T.gardenAnywhere, 'garden');

/* 7. furniture */
ok('the target hotspot exists',                   T.slotExists);
eq('  and matches the piece category',            T.slotCat, T.furnCat);
ok('under-level building is refused',             T.buildUnderLevelBlocked);
ok('  and says so',                               T.buildSaidLevel);
ok('short of boards is refused',                  T.buildShortBlocked);
eq('  and charges nothing for the attempt',       T.buildShortCharged, 0);
eq('the armchair is built',                       T.built, 'hf_armchair');
eq('  awarding its experience',                   T.buildXp, T.buildXpWanted);
eq('  taking its boards',                         T.buildPlanksLeft, 0);
eq('  taking its nails',                          T.buildNailsLeft, 0);
eq('  and its fittings charge',                   T.buildPaid, 11950);
/* N 0, S PI, W PI/2, E -PI/2 — a piece looks INTO the room from its own wall */
eq('a west-wall piece turns east, into the room', T.facing.west, Math.PI / 2);
eq('an east-wall piece turns west, into the room', T.facing.east, -Math.PI / 2);
eq('a north-wall piece is already right',         T.facing.north, 0);
eq('a free-standing piece keeps facing north',    T.facing.free, 0);

/* 8. butlers */
eq('the first hire is the third former',          T.butlerTier, 'third');
eq('  at Construction 1',                         T.butlerReq, 1);
ok('a hire you cannot pay for is refused',        T.hireWhenBrokeBlocked);
eq('the third former takes the job',              T.hired, 'third');
eq('an empty bank charges no fee',                T.fetchEmptyBankCharged, 0);
ok('  and says so',                               T.fetchSaidEmpty);
eq('sending them charges the fee up front',       T.fetchFee, T.butlerFee);
ok('  and they are out',                          T.fetchBusy);
eq('  carrying a full load',                      T.fetchPending.n, T.butlerLoad);
ok('THE TRIP IS DEFERRED, not instant',           T.fetchTimersQueued === 1,
   `${T.fetchTimersQueued} timer(s) queued`);
eq('they come back with the boards',              T.fetchDelivered, T.butlerLoad);
eq('  taken out of the BANK, not the pack',       T.fetchBankLeft, 20 - T.butlerLoad);
eq('  and they are free again',                   T.fetchBusyAfter, false);
eq('the third former drops exactly one',          T.fetchDroppedDelivered, T.butlerLoad - 1);
ok('  and owns up to it',                         T.fetchSaidDropped);
ok('NO BUTLER PATH REACHES houseBuild',           T.butlerNeverBuilds);

/* 9. leaving */
ok('you can leave again',                         T.leftHouse);
ok('A PANEL FLAG MUST NOT OUTLIVE ITS WORLD — bank dismissed', T.bankDismissed);
ok('  — shop dismissed',                          T.shopDismissed);
eq('you land back on the doorstep',               JSON.stringify(T.backOnDoorstep), JSON.stringify(T.returnWanted));

/* ---- report -------------------------------------------------------------- */
if(T.__unstubbedThree && T.__unstubbedThree.length)
  S.note(`THREE APIs not stubbed, generic fallback used: ${T.__unstubbedThree.join(', ')}`);

S.report(
  'Construction chain intact: saw -> deed -> repair -> enter -> room -> furniture -> xp -> butler -> bank.',
  'how any of it looks (no WebGL, no layout). Needs a browser.');
