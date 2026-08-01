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

  /* ---- A REBUILD MUST NOT RESTART THEM (the click-spam bug) ----------------
     houseRebuild() tears down and re-creates every house object, and the hire was one of them: any
     button that rebuilds -- toggling build mode, putting up a shelf, taking one down -- respawned a
     brand new butler back at the bell, who then walked to the door and vanished AGAIN. Drive them
     out to a known spot, rebuild the way each of those buttons does, and check nothing moved. */
  {
    const b0 = _butlerObj;
    b0.x = b0.home.x + 2; b0.y = b0.home.y;             /* somewhere that is NOT the spawn tile */
    for(let k = 0; k < 40; k++) butlerTick(16);          /* let them walk part of the way */
    const was = {x:b0.x, y:b0.y, px:b0.px, py:b0.py, heading:b0.heading, i:b0.i, wanderAt:b0.wanderAt};
    o.movedBeforeRebuild = Math.hypot(was.px - b0.home.x, was.py - b0.home.y) > 0.3;

    houseToggleBuildMode(); houseToggleBuildMode();      /* two real button presses */
    const b1 = _butlerObj;
    o.sameHireAfterRebuild = !!b1;
    o.keptTile   = !!(b1 && b1.x === was.x && b1.y === was.y);
    o.keptSmooth = !!(b1 && Math.abs(b1.px - was.px) < 1e-9 && Math.abs(b1.py - was.py) < 1e-9);
    o.keptGait   = !!(b1 && b1.heading === was.heading && b1.i === was.i && b1.wanderAt === was.wanderAt);
    o.notBackAtBell = !!(b1 && Math.hypot(b1.px - b1.home.x, b1.py - b1.home.y) > 0.3);
    /* and the model is seated where they ARE, not at the bell */
    const g = b1 && b1._m && b1._m.group;
    o.modelFollowed = !!(g && Math.abs(g.position.x - (b1.px + 0.5)) < 1e-6
                            && Math.abs(g.position.z - (b1.py + 0.5)) < 1e-6);
    /* a CHANGE OF HIRE still gets a fresh one, standing at the bell */
    butlerHire('fourth');   /* a DIFFERENT tier — 'third' is the one hired above */
    const b2 = _butlerObj;
    o.newHireResets = !!(b2 && b2.px === b2.home.x && b2.py === b2.home.y);
    butlerHire('third');
  }

  /* ---- THE FAC BRAT HIRE IS AN ACTUAL FAC BRAT --------------------------
     The top tier was a schoolboy in tweed with a lanyard. He is now the real mob's rig -- horns,
     hooves, bat wings, spade tail, dagger -- shared with makeRat through buildBratRig so the two
     cannot drift. What must NOT come across with the model is the monster: no hitpoints, no place
     in rats, and a pick proxy tagged 'obj' rather than 'rat', so he is Talk-to, never Attack. */
  {
    const shot = id => { butlerHire(id); houseRebuild(); const b = _butlerObj;
      return {tier:b&&b.tier, armBase:(b&&b._hm&&b._hm.armBase)||null,
              limbs:!!(b&&b._hm&&b._hm.lLeg&&b._hm.rLeg&&b._hm.lArm&&b._hm.rArm),
              parented:!!(b&&b._m&&b._m.group&&b._m.group.parent),
              scale:(b&&b._m&&b._m.group&&b._m.group.scale)?b._m.group.scale.x:null,
              parts:(b&&b._m&&b._m.group&&b._m.group.children)?b._m.group.children.length:0}; };
    o.schoolboyRig = shot('third');
    o.bratRig = shot('facbrat');
    const b = _butlerObj;
    /* he is furniture, not a monster */
    o.bratInRats = rats.some(q => q === b);
    o.bratHasHp = !!(b && (b.hp !== undefined || b.maxhp !== undefined));
    o.bratOptions = optionsAt(b.x, b.y).map(q => String(q.label || q.html).replace(/<[^>]*>/g, ''));
    /* THE PICK PROXY decides what a click on the model does. Tagged 'obj' it is furniture you
       Talk-to; tagged 'rat' the very same body becomes something you swing at. */
    const allPx = [].concat(typeof proxies !== 'undefined' ? proxies : [],
                            typeof houseProxies !== 'undefined' ? houseProxies : []);
    const px = allPx.filter(m => m && m.userData && m.userData.o === b);
    o.bratProxyCount = px.length;
    o.bratProxyKinds = [...new Set(px.map(m => m.userData.kind))];

    /* THE COMMON TAIL of buildObjModel tags userData.o and scene-adds the group. Build one straight
       through the function -- not via houseRebuild, which re-parents and re-seats by hand and would
       hide an early return. */
    {
      const probe = {def:'house_butler', x:b.x, y:b.y, alive:true};
      buildObjModel(probe);
      o.bratTailRan = !!(probe._m && probe._m.group && probe._m.group.userData
                         && probe._m.group.userData.o === probe);
      if(probe._m && probe._m.group && probe._m.group.parent) probe._m.group.parent.remove(probe._m.group);
    }

    /* THE REST POSE: swing him and see where the arm actually sits. The demon arm rests at 0.2, so
       a correct gait oscillates AROUND 0.2; the old code wrote the swing straight to rotation.x and
       oscillated around 0, snapping the arm through the body every stride. */
    {
      /* Date.now() barely advances inside a tight loop, so sampling the real gait measures nothing.
         Move the rest pose somewhere unmistakable instead and check the arm follows it: the swing
         is at most 0.35 either way, so an arm near 1.5 proves the base is honoured and an arm near
         0 proves it is being ignored. */
      const realBase = b._hm.armBase;
      b.x = b.home.x + 3; b.y = b.home.y;           /* far enough that the walk stays 'moving' */
      b._hm.armBase = [1.5, 1.5];
      butlerTick(16);
      o.bratArmAtMovedBase = b._hm.lArm.rotation.x;
      b._hm.armBase = [0, 0];
      butlerTick(16);
      o.bratArmAtZeroBase = b._hm.lArm.rotation.x;
      b._hm.armBase = realBase;
    }

    /* ...and still a butler: the bell can send him */
    give('coins', 200000);
    o.bratCanBeSent = (typeof butlerFetch === 'function');
    butlerHire('third'); houseRebuild();
    since();
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

/* a rebuild must not restart them — the click-spam bug */
S.ok('the hire had walked away from the bell',    T.movedBeforeRebuild);
S.ok('A BUTTON PRESS DOES NOT RESPAWN THE HIRE',  T.sameHireAfterRebuild && T.keptTile,
     'toggling build mode used to put a brand-new butler back at the bell');
S.ok('  their exact position is carried, not rounded', T.keptSmooth);
S.ok('  as is the gait phase and the next wander',     T.keptGait);
S.ok('  so they are not back at the bell',             T.notBackAtBell);
S.ok('  and the rebuilt model is seated where they are', T.modelFollowed);
S.ok('but CHANGING HIRE does start a fresh one at the bell', T.newHireResets);

/* the fac brat hire wears the real fac brat */
S.ok('the four forms keep the schoolboy rig',     T.schoolboyRig.armBase === null && T.schoolboyRig.scale === 1,
     JSON.stringify(T.schoolboyRig));
S.ok('THE FAC BRAT HIRE USES THE MOB RIG',        T.bratRig.scale === 0.5 && T.bratRig.parts > T.schoolboyRig.parts,
     `${T.bratRig.parts} parts at ${T.bratRig.scale} scale vs the schoolboy's ${T.schoolboyRig.parts} at ${T.schoolboyRig.scale}`);
S.eq('  with the demon limbs\' rest pose carried', T.bratRig.armBase, [0.2, 0.2]);
S.ok('  and the four limbs the walk tick swings',  T.bratRig.limbs);
S.ok('  parented into the world, not orphaned',    T.bratRig.parented);
S.ok('  and buildObjModel\'s common tail ran',      T.bratTailRan,
     'the tail seats the group, tags userData.o and scene-adds it — an early return skips all three');
S.eq('BUT HE IS NOT ATTACKABLE — not a mob',       T.bratInRats, false);
S.eq('  and carries no hitpoints',                 T.bratHasHp, false);
S.ok('  and the click menu offers no Attack',      !T.bratOptions.some(x => /attack/i.test(x)),
     T.bratOptions.join(' / '));
S.ok('  it offers Talk-to, like any hire',         T.bratOptions.some(x => /talk-to/i.test(x)),
     T.bratOptions.join(' / '));
S.ok('  and his pick proxy is tagged obj, not rat', T.bratProxyCount > 0
     && T.bratProxyKinds.length === 1 && T.bratProxyKinds[0] === 'obj',
     `${T.bratProxyCount} proxies, kinds: ${T.bratProxyKinds.join(',') || 'none'} — 'rat' would make the body attackable`);
S.ok('the gait swings AROUND the rest pose, not through 0',
     Math.abs(T.bratArmAtMovedBase - 1.5) <= 0.35 && Math.abs(T.bratArmAtZeroBase) <= 0.35,
     `base 1.5 put the arm at ${T.bratArmAtMovedBase.toFixed(3)}, base 0 at ${T.bratArmAtZeroBase.toFixed(3)}`);
S.ok('  so the base really moves the arm',         Math.abs(T.bratArmAtMovedBase - T.bratArmAtZeroBase) > 1.0,
     'if the base were ignored both would land in the same place');

/* dismissal */
S.eq('dismissing removes them',                   T.afterDismiss, false);
S.eq('  leaving no butler object behind',         T.butlerObjectsLeft, 0);

/* source: the two rules that have no runtime seam */
S.ok('the gait is the friendly-NPC one',          /butlerTick/.test(SRC) && /bo\.px\+=\(bo\.x-bo\.px\)\*k/.test(SRC));
S.ok('  and swings limbs around their REST pose',
     /m\.legBase\|\|\[0,0\]/.test(SRC) && /m\.armBase\|\|\[0,0\]/.test(SRC),
     'demon arms rest at 0.2; writing the swing straight to rotation.x snaps them through the body');
/* ONE BODY, TWO CALLERS — the whole point of the extraction */
S.ok('the fac brat body is built by a shared rig', /function buildBratRig\(g\)\{/.test(SRC));
S.eq('  and defined exactly once',                (SRC.match(/function buildBratRig\(g\)\{/g) || []).length, 1);
S.eq('  called by the mob and by the hire',       (SRC.match(/buildBratRig\(g\)/g) || []).length, 3);
S.ok('  with the geometry in neither caller',
     (SRC.match(/small pot-bellied imp torso/g) || []).length === 1,
     'a second copy of the torso means the mob and the hire have started to drift');
S.ok('NO BUTLER PATH REACHES houseBuild',
     !/function butler[\s\S]*?houseBuild\(/.test(SRC.slice(SRC.indexOf('function butlerFetch'), SRC.indexOf('function houseEnterVisit'))),
     'they fetch; you build');

S.report(
  'The hire spawns by the bell, walks on a real transform, mostly stands about, waits at the door on an errand, and is removed on dismissal.',
  'how the walk looks — gait, turning and the vanish through the door all need a browser.');
