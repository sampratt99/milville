/* ============================================================================
   fivefix — the five-bug batch.

   Five unrelated faults fixed in one pass. They have nothing in common except
   that each was invisible until someone stood in the right place and looked:

     1. the window box FLOATED — a planter with nothing under it
     2. expansion markers were NOT FLUSH — the bare-wall marker stood proud at
        the tile centre instead of sitting on the wall plane
     3. an occupied slot allowed a SILENT SWAP — the menu listed every other rung,
        and a left click runs the first option, so one click replaced a built
        piece, paid for it and refunded the old one without asking
     4. the trim INWARD SIGN was inverted — skirting, rail, panel, sill and window
        landed on the far side of the wall, i.e. out in the rock
     5. you could build from the DOORWAY — no walk, so the whole room could be
        furnished without moving

   Run: node harness/fivefix.mjs
   ========================================================================== */
import {runPass, Suite, PRELUDE, SRC} from './_lib.mjs';

const T = runPass(PRELUDE + String.raw`
  setLevel('construction', 99);
  clearInv(); give('coins', 20000000);

  /* ================= 1. THE WINDOW BOX DOES NOT FLOAT ================= */
  {
    const obj = {def: 'hf_windowbox', x: 60, y: 5, alive: true};
    buildObjModel(obj);
    const parts = [];
    obj._m.group.traverse(m => {
      if(!m.geometry || !m.geometry.parameters) return;
      const p = m.geometry.parameters;
      if(p.width === undefined) return;
      parts.push({w: p.width, h: p.height, d: p.depth,
                  x: m.position.x, y: m.position.y, z: m.position.z});
    });
    o.wbParts = parts.length;
    const body = parts.slice().sort((a, b) => (b.w * b.d) - (a.w * a.d))
                      .find(p => p.h > 0.1) || null;
    o.wbBody = body;
    if(body){
      const bodyBottom = body.y - body.h / 2;
      const support = parts.filter(p => p !== body
        && p.w >= body.w
        && (p.y + p.h / 2) >= bodyBottom - 0.02
        && p.y < body.y);
      o.wbSupports = support.length;
      o.wbSupportGap = support.length
        ? Math.min(...support.map(p => bodyBottom - (p.y + p.h / 2))) : null;
      o.wbLowest = Math.min(...parts.map(p => p.y - p.h / 2));
      o.wbBodyBottom = bodyBottom;
    }
    o.wbMaxZ = Math.max(...parts.map(p => p.z));
    o.wbAllBehindCentre = parts.every(p => p.z < 0);
  }

  /* ============ 2. EXPANSION MARKERS SIT ON THE WALL PLANE ============ */
  {
    const obj = {def: 'hf_expand', x: 60, y: 5, alive: true, expandTo: [0, 0]};
    buildObjModel(obj);
    const zs = [];
    obj._m.group.traverse(m => {
      if(!m.geometry || !m.geometry.parameters) return;
      if(m.geometry.parameters.width === undefined) return;
      zs.push(m.position.z);
    });
    o.emParts = zs.length;
    o.emMaxZ = zs.length ? Math.max(...zs) : null;
    o.emMinZ = zs.length ? Math.min(...zs) : null;
    o.emProud = zs.filter(z => z > -0.3).length;
  }

  freshHouse();
  houseBuildMode = true; houseRebuild();
  {
    const markers = objects.filter(q => q.def === 'hf_expand');
    o.markerCount = markers.length;
    o.markerFacingApplied = markers.filter(m => m._m && m._m.group
                                            && Math.abs(m._m.group.rotation.y - m.faceY) < 1e-9).length;
    o.markerOffFloor = markers.filter(m => houseTiles[m.y][m.x] !== T_FLOOR).length;
  }
  houseBuildMode = false;

  /* ============ 3. AN OCCUPIED SLOT CANNOT BE SILENTLY SWAPPED ============ */
  {
    const F = HOUSE_FURNITURE.hf_firepit;
    clearInv(); give('coins', 20000000);
    give(F.plankId || 'oak_plank', F.planks | 0); give('iron_nails', F.nails | 0);
    houseBuild('1,0:hearth', 'hf_firepit');
    since();
    o.occupiedBuilt = houseSlots()['1,0:hearth'];
    houseBuildMode = true; houseRebuild();
    const S0 = houseSlotByKey('1,0:hearth');
    o.occupiedMenu = optionsAt(S0.x, S0.y).map(q => q.label || String(q.html || ''));
    o.occupiedFirst = o.occupiedMenu[0];
    o.bareBuildEntries = o.occupiedMenu.filter(l => /^Build /.test(l)).length;
    o.firstIsDestructive = /^(Build|Replace|Upgrade|Remove) /.test(o.occupiedFirst || '');
    o.namedSwaps = o.occupiedMenu.filter(l => /^(Replace with|Upgrade to) /.test(l)).length;
    o.removeIsLast = /^Remove /.test(o.occupiedMenu[o.occupiedMenu.length - 1] || '');
    houseBuildMode = false;
  }

  /* ============ 4. TRIM FACES INTO THE ROOM ============ */
  {
    clearInv(); give('coins', 20000000);
    freshHouse();
    for(const [gx, gy, t] of [[0,0,'kitchen'],[2,0,'bedroom'],[0,1,'workshop'],[1,1,'garden']])
      houseBuildRoom(gx, gy, t);
    since();

    const _bake = bake;
    let boxes = [];
    bake = function(out, geo, hex, px, py, pz, ry, sc, rx, rz){
      const p = geo.parameters || {};
      boxes.push({w: p.width, h: p.height, d: p.depth, x: px, y: py, z: pz});
      return _bake.apply(null, arguments);
    };
    boxes = [];
    houseBuildInterior();
    bake = _bake;

    const isFloor = (x, y) => (x >= HOUSE.x0 && x <= HOUSE.x1 && y >= HOUSE.y0 && y <= HOUSE.y1
                               && houseTiles[y][x] === T_FLOOR);
    const onFloorTile = b => isFloor(Math.floor(b.x), Math.floor(b.z));

    const skirt = boxes.filter(b => Math.abs(b.h - 0.26) < 1e-9);
    o.skirtCount = skirt.length; o.skirtOnWall = skirt.filter(b => !onFloorTile(b)).length;
    const rail = boxes.filter(b => Math.abs(b.h - 0.08) < 1e-9);
    o.railCount = rail.length; o.railOnWall = rail.filter(b => !onFloorTile(b)).length;
    const panel = boxes.filter(b => Math.abs(b.h - 0.5) < 1e-9);
    o.panelCount = panel.length; o.panelOnWall = panel.filter(b => !onFloorTile(b)).length;
    const glass = boxes.filter(b => Math.abs(b.h - 0.72) < 1e-9);
    o.glassCount = glass.length; o.glassOnWall = glass.filter(b => !onFloorTile(b)).length;

    const slab = boxes.filter(b => Math.abs(b.h - 2.2) < 1e-9);
    o.slabCount = slab.length; o.slabOnFloorTile = slab.filter(onFloorTile).length;
  }

  /* ============ 5. YOU WALK TO THE SPACE BEFORE BUILDING ============ */
  {
    /* the LAMP hotspot, in the far corner of the parlour — the hearth sits beside
       the door and is only three tiles away, which is too close to prove anything */
    clearInv(); give('coins', 20000000);
    freshHouse();
    for(const pid of SAWMILL.map(r => r[1])) give(pid, 4);
    give('iron_nails', 20);
    houseBuildMode = true; houseRebuild();
    const S0 = houseSlotByKey('1,0:lamp');
    o.buildTile = {x: S0.x, y: S0.y};
    const ex = houseExitTile();
    player.x = ex.x; player.y = ex.y + 1; player.px = player.x; player.py = player.y;
    o.standingAt = {x: player.x, y: player.y};
    o.distance = Math.abs(player.x - S0.x) + Math.abs(player.y - S0.y);
    cancelAction();
    const opts = optionsAt(S0.x, S0.y);
    const buildOpt = opts.find(q => /^Build /.test(q.label || ''));
    o.foundBuildOption = !!buildOpt;
    since();
    if(buildOpt) buildOpt.fn();
    o.builtFromDoorway = !!houseSlots()['1,0:lamp'];
    o.actionSet = player.action ? player.action.type : null;
    o.actionSlot = player.action ? player.action.slot : null;
    o.actionFid = player.action ? player.action.fid : null;
    o.actionFidCat = (o.actionFid && HOUSE_FURNITURE[o.actionFid]) ? HOUSE_FURNITURE[o.actionFid].cat : null;
    since();

    cancelAction();
    houseBuildWalk('9,9:nope', 'hf_firepit');
    o.unknownSlotAction = player.action ? player.action.type : null;
    houseBuildMode = false;
  }

  if(inHouse) exitHouse();
  return o;
`);

const S = new Suite('fivefix').guard(T);

/* ---- 1. the window box ---------------------------------------------------- */
S.ok('the window box builds geometry',            T.wbParts > 3, `${T.wbParts} pieces`);
S.ok('  with a planter body',                     !!T.wbBody,
     T.wbBody ? `${T.wbBody.w}x${T.wbBody.h}x${T.wbBody.d} at y${T.wbBody.y}` : 'none found');
S.ok('THE WINDOW BOX IS NOT FLOATING',            T.wbSupports > 0,
     `${T.wbSupports} pieces sit under the planter and are at least as wide`);
S.ok('  the support meets the box, not hovers below it',
     T.wbSupportGap !== null && T.wbSupportGap <= 0.02, `gap ${T.wbSupportGap}`);
S.ok('  and it is the lowest thing in the model',  T.wbLowest < T.wbBodyBottom,
     `lowest ${T.wbLowest} vs planter bottom ${T.wbBodyBottom}`);
S.ok('the whole box is pushed back toward the wall', T.wbAllBehindCentre,
     `furthest forward piece at z=${T.wbMaxZ}`);

/* ---- 2. expansion markers ------------------------------------------------- */
S.ok('the marker builds geometry at all',         T.emParts > 0,
     `${T.emParts} pieces — this branch was once sliced out entirely and rendered nothing`);
S.eq('EVERY MARKER PIECE IS FLUSH ON THE WALL',   T.emProud, 0);
S.ok('  pushed about half a tile back',           T.emMaxZ <= -0.3 && T.emMinZ >= -0.6,
     `z from ${T.emMinZ} to ${T.emMaxZ}`);
S.ok('markers appear on bare walls',              T.markerCount > 0, `${T.markerCount} markers`);
S.eq('  each standing on floor, not in the wall', T.markerOffFloor, 0);
S.eq('  with its facing actually applied',        T.markerFacingApplied, T.markerCount);

/* ---- 3. the silent swap --------------------------------------------------- */
S.eq('a piece is built to swap',                  T.occupiedBuilt, 'hf_firepit');
S.eq('AN OCCUPIED SLOT OFFERS NO BARE Build',     T.bareBuildEntries, 0);
S.eq('  and nothing destructive is first',        T.firstIsDestructive, false);
S.ok('  the first option is safe',                /^(Burn-logs-on|Examine|Walk here)/.test(T.occupiedFirst || ''),
     T.occupiedFirst);
S.ok('  swaps exist but are NAMED',               T.namedSwaps > 0,
     `${T.namedSwaps} Replace/Upgrade entries — explicit, never a bare Build`);
S.ok('  and Remove is last',                      T.removeIsLast, T.occupiedMenu.join(' | '));

/* ---- 4. the trim sign ----------------------------------------------------- */
S.ok('there is skirting to check',                T.skirtCount > 50, `${T.skirtCount} runs`);
S.eq('SKIRTING FACES INTO THE ROOM',              T.skirtOnWall, 0);
S.ok('there is chair rail to check',              T.railCount > 50, `${T.railCount} runs`);
S.eq('  the chair rail too',                      T.railOnWall, 0);
S.ok('there is wainscot to check',                T.panelCount > 50, `${T.panelCount} panels`);
S.eq('  and the wainscot',                        T.panelOnWall, 0);
S.ok('there is a window to check',                T.glassCount > 0, `${T.glassCount} panes`);
S.eq('  the glass rides the same sign',           T.glassOnWall, 0);
S.ok('the wall slab stays on the wall line',      T.slabCount > 50 && T.slabOnFloorTile === 0,
     `${T.slabCount} slabs, ${T.slabOnFloorTile} of them on a floor tile`);

/* ---- 5. walk before build ------------------------------------------------- */
S.ok('the hotspot is across the room',            T.distance > 3,
     `standing at ${JSON.stringify(T.standingAt)}, hotspot at ${JSON.stringify(T.buildTile)}, ${T.distance} tiles`);
S.ok('the Build option is offered',               T.foundBuildOption);
S.eq('YOU CANNOT BUILD FROM THE DOORWAY',         T.builtFromDoorway, false);
S.eq('  it sets a walk-and-build action instead', T.actionSet, 'housebuild');
S.eq('  carrying the slot',                       T.actionSlot, '1,0:lamp');
S.eq('  and a piece for that hotspot',            T.actionFidCat, 'lamp');
S.eq('an unknown slot builds immediately rather than walking nowhere',
     T.unknownSlotAction, null);

S.ok('the source records the silent-swap fix',    /AN OCCUPIED SPACE OFFERS ONLY REMOVE/.test(SRC));
S.ok('the source records the walk-first fix',     /walk to the space before building it/.test(SRC));

S.report(
  'All five hold: the window box is supported, markers sit flush on the wall plane, an occupied slot cannot be swapped by a stray click, every trim run faces into the room, and building walks you to the space first.',
  'that any of it LOOKS right — a supported planter and a flush marker are still visual claims and need a browser.');
