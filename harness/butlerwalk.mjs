/* ============================================================================
   butlerwalk — the hire actually walks (docs/23 §7).

   butlerTick(dt) runs in the render loop. While idle they stroll between spots
   near the bell; while out on an errand they stand at the front door and vanish
   through it. Interpolated exactly like a friendly NPC.

   The tuning that matters: they STAND ABOUT, MOSTLY. This used to pick a new
   tile every 3.5-8 seconds, which read as pacing. A servant waiting to be sent
   should mostly just stand there.

   The shim's Object3D is real, so group.position and rotation ARE readable —
   this reads the actual transform butlerTick writes, not a proxy for it.

   Run: node harness/butlerwalk.mjs
   ========================================================================== */
import {runPass, Suite, PRELUDE, SRC} from './_lib.mjs';

const T = runPass(PRELUDE + String.raw`
  setLevel('construction', 99);
  clearInv(); give('coins', 20000000);
  freshHouse();

  /* the bell is what a hire stands by */
  const BF = HOUSE_FURNITURE.hf_bell;
  give(BF.plankId || 'oak_plank', BF.planks | 0); give('iron_nails', BF.nails | 0);
  houseBuild('1,0:bell', 'hf_bell');
  butlerHire('third');
  houseRebuild();
  since();

  o.hired = !!butlerState();
  const bo = _butlerObj;
  o.spawned = !!bo;
  o.hasModel = !!(bo && bo._m && bo._m.group);
  if(!bo) return o;

  o.home = {x: bo.home.x, y: bo.home.y};
  o.startAt = {x: bo.x, y: bo.y};
  o.inRegion = bo.x >= HOUSE.x0 && bo.x <= HOUSE.x1 && bo.y >= HOUSE.y0 && bo.y <= HOUSE.y1;
  const bellSlot = houseSlotByKey('1,0:bell');
  o.bellAt = bellSlot ? {x: bellSlot.x, y: bellSlot.y} : null;
  o.nearBell = bellSlot ? (Math.abs(bo.home.x - bellSlot.x) + Math.abs(bo.home.y - bellSlot.y)) : null;

  /* ---- the tick moves the MODEL, and the transform reads back ---- */
  bo.px = bo.x - 3; bo.py = bo.y;             /* displace, then let it interpolate home */
  const p0 = {x: bo._m.group.position.x, y: bo._m.group.position.y, z: bo._m.group.position.z};
  for(let k = 0; k < 40; k++) butlerTick(16);
  const p1 = {x: bo._m.group.position.x, y: bo._m.group.position.y, z: bo._m.group.position.z};
  o.positionMoved = p0.x !== p1.x || p0.z !== p1.z;
  o.convergedToTile = Math.abs(bo.px - bo.x) < 0.4 && Math.abs(bo.py - bo.y) < 0.4;
  o.modelTracksTile = Math.abs(p1.x - (bo.px + 0.5)) < 0.3 && Math.abs(p1.z - (bo.py + 0.5)) < 0.3;
  o.groupY = p1.y;

  /* ---- THEY STAND ABOUT, MOSTLY ----
     butlerTick gates on Date.now(), which the shim leaves real — 4000 loop
     iterations pass in a couple of milliseconds of wall clock, so a long run
     simulates nothing. What CAN be measured is the schedule itself: force a
     wander opportunity, see whether it produced a move, and read back the gap
     the tick just scheduled. Rate = P(move) / mean gap. */
  let moves = 0, last = bo.x + ',' + bo.y;
  const gaps = [];
  const OPPS = 400;
  for(let k = 0; k < OPPS; k++){
    bo.wanderAt = 0;                          /* the opportunity is now */
    butlerTick(16);
    gaps.push(bo.wanderAt - Date.now());      /* what it scheduled next */
    const now = bo.x + ',' + bo.y;
    if(now !== last){ moves++; last = now; }
    /* settle the interpolation so the next opportunity starts from rest */
    for(let j = 0; j < 30; j++) butlerTick(16);
  }
  o.opportunities = OPPS;
  o.wanderMoves = moves;
  o.moveChance = moves / OPPS;
  o.gapMin = Math.min(...gaps) / 1000;
  o.gapMax = Math.max(...gaps) / 1000;
  o.gapMean = gaps.reduce((a, b) => a + b, 0) / gaps.length / 1000;
  o.movesPerMinute = o.moveChance / (o.gapMean / 60);

  /* they never wander outside the house, or into a wall */
  o.strayed = !(bo.x >= HOUSE.x0 && bo.x <= HOUSE.x1 && bo.y >= HOUSE.y0 && bo.y <= HOUSE.y1);
  o.inWall = blockedStrict(bo.x, bo.y);
  /* and never far from where they were put */
  o.maxDrift = Math.abs(bo.x - bo.home.x) + Math.abs(bo.y - bo.home.y);

  /* ---- ON AN ERRAND THEY GO TO THE DOOR ---- */
  if(typeof bank !== 'undefined') bank.length = 0;
  bank.push({id: 'oak_plank', qty: 20});
  butlerFetch('oak_plank');
  o.away = butlerBusy();
  butlerTick(16);
  const ex = houseExitTile();
  o.doorTile = ex;
  o.atDoorWhileAway = bo.x === ex.x && bo.y === ex.y + 1;
  o.awayPosition = {x: bo._m.group.position.x, z: bo._m.group.position.z};

  /* the trip is deferred, not instant */
  o.packBeforeReturn = countItem('oak_plank');
  o.timersPending = __shim.timers.length;
  __shim.flushTimers();
  o.packAfterReturn = countItem('oak_plank');
  o.bankAfterReturn = bank.reduce((n, b) => n + ((b && b.id === 'oak_plank') ? b.qty : 0), 0);
  o.backHome = !butlerBusy();
  o.load = butlerById('third').load;
  /* THE THIRD FORMER IS KEEN RATHER THAN CAREFUL: ~1 in 12 they drop one on the
     step. Asserting a flat 6 made this harness flaky, which is worse than failing
     — so assert the real rule instead, and prove the drop is announced when it
     happens rather than silently swallowing a board. */
  o.dropped = o.load - o.packAfterReturn;
  o.droppedSaid = said(/drops one on the step/);
  since();

  /* Once home they resume wandering rather than standing on the doormat.
     Same wall-clock problem as above: force the opportunity each time rather
     than waiting on Date.now(), and give the 0.55 roll enough tries to land. */
  o.leftTheDoor = false;
  for(let k = 0; k < 60 && !o.leftTheDoor; k++){
    bo.wanderAt = 0;
    butlerTick(16);
    for(let j = 0; j < 20; j++) butlerTick(16);
    o.leftTheDoor = !(bo.x === ex.x && bo.y === ex.y + 1);
  }

  /* ---- dismissing removes them from the world ---- */
  butlerDismiss();
  houseRebuild();
  o.afterDismiss = !!_butlerObj;
  o.butlerObjectsLeft = objects.filter(q => q.def === 'house_butler').length;

  if(inHouse) exitHouse();
  return o;
`);

const S = new Suite('butlerwalk').guard(T);

S.ok('the hire is taken on',                      T.hired);
S.ok('  and spawns in the house',                 T.spawned);
S.ok('  with a model',                            T.hasModel);
S.ok('  inside the house region',                 T.inRegion, JSON.stringify(T.startAt));
S.ok('  standing by the bell',                    T.nearBell !== null && T.nearBell <= 4,
     `${T.nearBell} tiles from the bell at ${JSON.stringify(T.bellAt)}`);

S.ok('THE TICK MOVES THE MODEL',                  T.positionMoved,
     'the shim Object3D is real, so this is the transform butlerTick wrote');
S.ok('  interpolating onto the target tile',      T.convergedToTile);
S.ok('  with the model tracking the tile',        T.modelTracksTile);

/* the pacing fix */
S.ok('they wander at all',                        T.wanderMoves > 0,
     `${T.wanderMoves} moves in ${T.opportunities} opportunities`);
S.ok('  but only about half the time',            T.moveChance > 0.4 && T.moveChance < 0.7,
     `P(move) = ${T.moveChance.toFixed(2)} — the code rolls 0.55`);
S.ok('the gap between opportunities is 9-23s',    T.gapMin >= 8.9 && T.gapMax <= 23.1,
     `${T.gapMin.toFixed(1)}s to ${T.gapMax.toFixed(1)}s, mean ${T.gapMean.toFixed(1)}s`);
S.ok('THEY MOSTLY STAND ABOUT',                   T.movesPerMinute < 4,
     `${T.movesPerMinute.toFixed(1)} moves a minute — the old pacing bug was one every 3.5-8s (8-17/min)`);
S.eq('they never leave the house',                T.strayed, false);
S.eq('  and never stand in a wall',               T.inWall, false);
S.ok('  and stay near where you put them',        T.maxDrift <= 4, `${T.maxDrift} tiles from home`);

/* the errand */
S.ok('sending them starts a trip',                T.away);
S.ok('ON AN ERRAND THEY WAIT AT THE DOOR',        T.atDoorWhileAway,
     `at ${JSON.stringify(T.doorTile)}`);
S.eq('the trip is deferred, not instant',         T.packBeforeReturn, 0);
S.ok('  with a real timer pending',               T.timersPending > 0);
S.ok('  and the boards arrive on return',         T.dropped === 0 || T.dropped === 1,
     `${T.packAfterReturn} of a ${T.load}-board load`);
S.ok('  a dropped board is announced, never silent',
     T.dropped === 0 ? !T.droppedSaid : T.droppedSaid,
     T.dropped ? 'dropped one and said so' : 'dropped none and said nothing');
/* The bank is down by exactly what ARRIVED. butlerReturn decrements n before it
   touches the bank, so a "dropped" board never leaves the bank at all — the
   message says they drop one on the step, but mechanically you are just fetched
   one fewer. Harmless, and in the player's favour; noted so nobody reads the
   line as a lost board. */
S.eq('  and the bank is down by exactly what arrived',
     T.bankAfterReturn, 20 - T.packAfterReturn);
if(T.dropped) S.note('the dropped board stayed in the bank rather than being destroyed');
S.ok('  leaving them free again',                 T.backHome);
S.ok('and they step off the doormat afterwards',  T.leftTheDoor);

/* dismissal */
S.eq('dismissing removes them',                   T.afterDismiss, false);
S.eq('  leaving no butler object behind',         T.butlerObjectsLeft, 0);

/* source: the two rules that have no runtime seam */
S.ok('the gait is the friendly-NPC one',          /butlerTick/.test(SRC) && /bo\.px\+=\(bo\.x-bo\.px\)\*k/.test(SRC));
S.ok('NO BUTLER PATH REACHES houseBuild',
     !/function butler[\s\S]*?houseBuild\(/.test(SRC.slice(SRC.indexOf('function butlerFetch'), SRC.indexOf('function houseEnterVisit'))),
     'they fetch; you build');

S.report(
  'The hire spawns by the bell, walks on a real transform, mostly stands about, waits at the door on an errand, and is removed on dismissal.',
  'how the walk looks — gait, turning and the vanish through the door all need a browser.');
