/* ============================================================================
   bmodetest — building mode, and the ghost it shows you.

   Building mode is the only way to see an empty hotspot. While it is on, every
   unfilled space shows a marker carrying a GHOST: the best piece you could
   build there RIGHT NOW — level, boards, nails and coins all satisfied. That
   last part is what makes it useful rather than a wish list.

   spawntest covers what houseRebuild puts in the room. This covers the MODE:
   the toggle, the ghost choice, and the fact that a mode flag must not outlive
   its world.

   Run: node harness/bmodetest.mjs
   ========================================================================== */
import {runPass, Suite, PRELUDE, SRC} from './_lib.mjs';

const T = runPass(PRELUDE + String.raw`
  setLevel('construction', 99);
  clearInv(); give('coins', 20000000);
  freshHouse();
  houseBuildMode = false;

  /* ---- the toggle ---- */
  o.startsOff = houseBuildMode;
  since();
  houseToggleBuildMode();
  o.afterFirst = houseBuildMode;
  o.onSaid = since()[0] || null;
  houseToggleBuildMode();
  o.afterSecond = houseBuildMode;
  o.offSaid = since()[0] || null;

  /* ---- THE GHOST: the best piece you can build right now ---- */
  const ladder = Object.keys(HOUSE_FURNITURE)
    .filter(f => HOUSE_FURNITURE[f].cat === 'hearth')
    .sort((a, b) => (HOUSE_FURNITURE[a].req | 0) - (HOUSE_FURNITURE[b].req | 0));
  o.hearthLadder = ladder.map(f => ({fid: f, req: HOUSE_FURNITURE[f].req | 0,
                                     cost: HOUSE_FURNITURE[f].cost | 0,
                                     planks: HOUSE_FURNITURE[f].planks | 0,
                                     pid: HOUSE_FURNITURE[f].plankId || 'oak_plank'}));
  const top = o.hearthLadder[o.hearthLadder.length - 1];
  const bottom = o.hearthLadder[0];
  o.top = top; o.bottom = bottom;

  const stockFor = row => {
    clearInv();
    give('coins', 20000000);
    give(row.pid, row.planks);
    give('iron_nails', 40);
  };

  /* Everything available -> the ghost is the TOP of the ladder.
     Boards do NOT stack and addItem is all-or-nothing, so stocking 40 of every
     board silently adds none: a 28-slot pack cannot hold them. Stock exactly
     what the top rung wants. */
  clearInv(); give('coins', 20000000);
  give(top.pid, top.planks); give('iron_nails', 20);
  o.richPlanks = countItem(top.pid);
  o.ghostRich = houseGhostFor('hearth');

  /* level capped -> the ghost drops to what the level allows */
  setLevel('construction', bottom.req);
  o.ghostLowLevel = houseGhostFor('hearth');
  setLevel('construction', 99);

  /* materials for the bottom rung only -> the ghost is the bottom rung */
  stockFor(bottom);
  o.ghostPoorMaterials = houseGhostFor('hearth');

  /* No coins -> the ghost falls to the best piece that costs nothing. The bottom
     rung of this ladder is FREE, so an empty purse still ghosts it — which is
     right: it really is buildable. */
  clearInv();
  give(top.pid, top.planks); give('iron_nails', 20);
  o.ghostNoCoins = houseGhostFor('hearth');
  o.bottomIsFree = bottom.cost === 0;

  /* nothing at all */
  clearInv();
  o.ghostNothing = houseGhostFor('hearth');

  /* whatever the ghost is, it must be genuinely buildable */
  clearInv(); give('coins', 20000000);
  give(top.pid, top.planks); give('iron_nails', 20);
  o.ghostIsBuildable = (() => {
    const fid = houseGhostFor('hearth');
    if(!fid) return null;
    const F = HOUSE_FURNITURE[fid];
    return lvl('construction') >= (F.req | 0)
        && countItem(F.plankId || 'oak_plank') >= (F.planks | 0)
        && countItem('iron_nails') >= (F.nails | 0)
        && coinsCount() >= F.cost;
  })();

  /* ---- the markers carry that ghost ----
     stock a couple of the cheapest board so several categories can ghost */
  clearInv(); give('coins', 20000000);
  give('plank', 10); give('iron_nails', 20);
  houseBuildMode = true; houseRebuild();
  const markers = objects.filter(q => q.def === 'hf_slot');
  o.markerCount = markers.length;
  o.markersWithGhost = markers.filter(m => m.ghost).length;
  o.ghostsAreRealPieces = markers.filter(m => m.ghost && !HOUSE_FURNITURE[m.ghost]).length;
  o.ghostMatchesCategory = markers.filter(m => {
    if(!m.ghost) return false;
    const S0 = houseSlotByKey(m.houseSlot);
    return S0 && HOUSE_FURNITURE[m.ghost].cat !== S0.cat;
  }).length;

  /* a filled space has no marker and no ghost */
  const F = HOUSE_FURNITURE.hf_hearth;
  clearInv(); give('coins', 20000000);
  give(F.plankId || 'oak_plank', F.planks | 0); give('iron_nails', F.nails | 0);
  houseBuild('1,0:hearth', 'hf_hearth');
  since();
  houseRebuild();
  o.markerOnFilledSlot = objects.filter(q => q.def === 'hf_slot' && q.houseSlot === '1,0:hearth').length;

  /* ---- A GUEST CANNOT TURN IT ON ---- */
  houseBuildMode = false;
  houseVisit = {uid: 'bob', name: 'Bob', rooms: Object.assign({}, houseRooms()), slots: Object.assign({}, houseSlots())};
  since();
  houseToggleBuildMode();
  o.guestMode = houseBuildMode;
  o.guestSaid = since()[0] || null;
  houseVisit = null;

  /* ---- IT MUST NOT OUTLIVE ITS WORLD ---- */
  houseBuildMode = true;
  o.onBeforeExit = houseBuildMode;
  exitHouse();
  o.afterExit = houseBuildMode;
  /* ...and re-entering does not silently restore it */
  enterHouse();
  o.afterReEnter = houseBuildMode;

  /* ---- the HUD reflects the mode ---- */
  const b = document.getElementById('hhbuild');
  houseBuildMode = false; houseHudRender();
  o.hudOff = {text: b.textContent, cls: b.className};
  houseBuildMode = true; houseHudRender();
  o.hudOn = {text: b.textContent, cls: b.className};
  houseBuildMode = false; houseHudRender();

  if(inHouse) exitHouse();
  return o;
`);

const S = new Suite('bmodetest').guard(T);

/* the toggle */
S.eq('building mode starts off',                  T.startsOff, false);
S.eq('  toggling turns it on',                    T.afterFirst, true);
S.ok('  and says what it does',                   /Building mode on/i.test(T.onSaid || ''), T.onSaid);
S.eq('  toggling again turns it off',             T.afterSecond, false);
S.ok('  and says so',                             /Building mode off/i.test(T.offSaid || ''), T.offSaid);

/* the ghost */
S.ok('the hearth ladder has rungs to choose between', T.hearthLadder.length > 1,
     T.hearthLadder.map(r => `${r.fid}@${r.req}`).join(' < '));
S.ok('the top rung is really stocked',             T.richPlanks >= T.top.planks,
     `${T.richPlanks} of the ${T.top.planks} boards it wants`);
S.eq('WITH EVERYTHING, THE GHOST IS THE TOP RUNG', T.ghostRich, T.top.fid);
S.eq('  a low level drops it to the bottom rung',  T.ghostLowLevel, T.bottom.fid);
S.eq('  thin materials drop it too',               T.ghostPoorMaterials, T.bottom.fid);
S.ok('the bottom rung costs nothing',              T.bottomIsFree, `${T.bottom.fid} at ${T.bottom.cost} gp`);
S.eq('  so an empty purse still ghosts it',        T.ghostNoCoins, T.bottom.fid);
S.eq('NOTHING AT ALL MEANS NO GHOST',              T.ghostNothing, null);
S.ok('THE GHOST IS ALWAYS ACTUALLY BUILDABLE',     T.ghostIsBuildable === true,
     'level, boards, nails and coins all satisfied — a wish list would be useless');

/* the markers */
S.ok('build mode shows markers',                   T.markerCount > 0, `${T.markerCount} markers`);
S.ok('  most carrying a ghost',                    T.markersWithGhost > 0,
     `${T.markersWithGhost} of ${T.markerCount}`);
S.eq('  every ghost is a real piece',              T.ghostsAreRealPieces, 0);
S.eq('  matching its hotspot category',            T.ghostMatchesCategory, 0);
S.eq('A FILLED SPACE SHOWS NO MARKER',             T.markerOnFilledSlot, 0);

/* guests */
S.eq('A GUEST CANNOT ENTER BUILDING MODE',         T.guestMode, false);
S.ok('  and is told whose cottage it is',          /someone else|not your/i.test(T.guestSaid || ''), T.guestSaid);

/* the world swap */
S.ok('the mode was on before leaving',             T.onBeforeExit,
     'if this were false the next check would pass for the wrong reason');
S.eq('BUILDING MODE DOES NOT OUTLIVE ITS WORLD',   T.afterExit, false);
S.eq('  and is not silently restored on re-entry', T.afterReEnter, false);

/* the HUD */
S.ok('the HUD button reads plainly when off',      /Building mode/.test(T.hudOff.text) && !/✓/.test(T.hudOff.text),
     T.hudOff.text);
S.ok('  and shows a tick when on',                 /✓/.test(T.hudOn.text), T.hudOn.text);
S.eq('  with the on class',                        T.hudOn.cls, 'on');
S.eq('  and none when off',                        T.hudOff.cls, '');

/* source: the flag is cleared by the swap, not merely by the toggle */
S.ok('exitHouse clears the mode',                  /function exitHouse\(\)[\s\S]{0,400}?houseBuildMode=false/.test(SRC));

S.report(
  'Building mode toggles cleanly, shows only ghosts you can actually afford to build, is refused to guests, and does not survive leaving the cottage.',
  'what a ghost looks like in the room — a translucent preview is a rendering question and needs a browser.');
