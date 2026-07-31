/* ============================================================================
   focustest — the portal chamber: arches, focuses, and what they reach.

   A focus does not carry you anywhere. It WIDENS what your portal can reach:
   destinations = min(all, arch base + focus bonus). Two separate hotspots, and
   the focus is useless on its own — which the panel has to say rather than
   silently showing an empty list.

   Run: node harness/focustest.mjs
   ========================================================================== */
import {runPass, Suite, PRELUDE} from './_lib.mjs';

const T = runPass(PRELUDE + String.raw`
  setLevel('construction', 99);
  o.dests = HOUSE_PORTAL_DESTS.slice();
  o.base = Object.assign({}, HOUSE_PORTAL_BASE);
  o.bonus = Object.assign({}, HOUSE_FOCUS_BONUS);
  o.destNames = HOUSE_PORTAL_DESTS.map(t => TELEPORTS[t] ? TELEPORTS[t].name : null);
  o.destsAreRealTeleports = HOUSE_PORTAL_DESTS.every(t => !!TELEPORTS[t]);

  /* every arch and focus in the tables is a real piece, and vice versa */
  o.archNotAPiece = Object.keys(HOUSE_PORTAL_BASE).filter(f => !HOUSE_FURNITURE[f]);
  o.focusNotAPiece = Object.keys(HOUSE_FOCUS_BONUS).filter(f => !HOUSE_FURNITURE[f]);
  o.portalCatPieces = Object.keys(HOUSE_FURNITURE).filter(f => HOUSE_FURNITURE[f].cat === 'portal');
  o.focusCatPieces = Object.keys(HOUSE_FURNITURE).filter(f => HOUSE_FURNITURE[f].cat === 'focus');
  o.portalPiecesWithoutBase = o.portalCatPieces.filter(f => !HOUSE_PORTAL_BASE[f]);
  o.focusPiecesWithoutBonus = o.focusCatPieces.filter(f => !HOUSE_FOCUS_BONUS[f]);

  const build = (key, fid) => {
    const F = HOUSE_FURNITURE[fid];
    clearInv(); give('coins', 10000000);
    if(F.planks | 0) give(F.plankId || 'oak_plank', F.planks | 0);
    if(F.nails | 0) give('iron_nails', F.nails | 0);
    houseBuild(key, fid);
    since();
    return houseSlots()[key] === fid;
  };

  clearInv(); give('coins', 20000000);
  freshHouse();
  /* the portal chamber has to reach the parlour: 1,0 -> 1,1 is the courtyard, so
     go round the outside */
  houseBuildRoom(0, 0, 'workshop');
  houseBuildRoom(0, 1, 'portalrm');
  since();
  o.portalRoomBuilt = houseRooms()['0,1'] === 'portalrm';

  const P = HOUSE_ROOMS.portalrm.slots.find(s => s.cat === 'portal');
  const FC = HOUSE_ROOMS.portalrm.slots.find(s => s.cat === 'focus');
  o.portalSlot = P ? P.id : null;
  o.focusSlot = FC ? FC.id : null;
  const pKey = '0,1:' + (P && P.id), fKey = '0,1:' + (FC && FC.id);

  /* ---- nothing built: no focus, no reach ---- */
  o.noFocusYet = houseFocusBuilt();

  /* ---- the LESSER arch alone ---- */
  o.builtLesser = build(pKey, 'hf_portal_lesser');
  o.lesserReach = housePortalDests('hf_portal_lesser').length;
  o.lesserBase = HOUSE_PORTAL_BASE.hf_portal_lesser;

  /* ---- add the plain focus ---- */
  o.builtFocus = build(fKey, 'hf_focus');
  o.focusBuilt = houseFocusBuilt();
  o.lesserPlusFocus = housePortalDests('hf_portal_lesser').length;
  o.focusBonus = HOUSE_FOCUS_BONUS.hf_focus;

  /* ---- upgrade the focus ---- */
  houseRemove(fKey); since();
  o.builtGreater = build(fKey, 'hf_greaterfocus');
  o.lesserPlusGreater = housePortalDests('hf_portal_lesser').length;
  o.greaterBonus = HOUSE_FOCUS_BONUS.hf_greaterfocus;

  /* ---- the full arch with the best focus reaches everything, and no more ---- */
  houseRemove(pKey); since();
  o.builtFull = build(pKey, 'hf_portal');
  o.fullReach = housePortalDests('hf_portal').length;
  o.cappedAtAll = o.fullReach === HOUSE_PORTAL_DESTS.length;

  /* the reach is a PREFIX of the destination list, never a random subset */
  o.reachIsPrefix = JSON.stringify(housePortalDests('hf_portal_lesser')) ===
                    JSON.stringify(HOUSE_PORTAL_DESTS.slice(0, o.lesserPlusGreater));

  /* ---- the tile menu offers exactly the open roads ---- */
  const S0 = houseSlotByKey(pKey);
  o.portalOptions = S0 ? optionsAt(S0.x, S0.y).map(q => q.label || String(q.html || '')) : [];
  o.travelOptions = o.portalOptions.filter(l => /^Travel-to /.test(l)).length;

  /* ---- a focus with NO portal says so instead of showing an empty list ---- */
  houseRemove(pKey); since();
  o.focusWithoutPortal = houseFocusBuilt();
  houseFocusReport();
  const bodyEl = document.getElementById('housebody');
  o.orphanFocusRows = bodyEl.children.length;
  o.orphanFocusEmptyClass = bodyEl.children[0] ? bodyEl.children[0].className : null;
  closeHousePanel();

  /* ---- the focus panel with a portal lists every destination, open or closed -- */
  build(pKey, 'hf_portal_lesser');
  houseRemove(fKey); since();
  houseFocusReport();
  o.panelRowsNoFocus = bodyEl.children.length;
  closeHousePanel();

  if(inHouse) exitHouse();
  return o;
`);

const S = new Suite('focustest').guard(T);

S.ok('there are portal destinations',             T.dests.length > 1, `${T.dests.length}: ${T.destNames.join(', ')}`);
S.ok('EVERY DESTINATION IS A REAL TELEPORT',      T.destsAreRealTeleports,
     'a missing TELEPORTS entry would throw in the menu builder');
S.eq('every arch in the table is a real piece',   T.archNotAPiece.length, 0);
S.eq('every focus in the table is a real piece',  T.focusNotAPiece.length, 0);
S.eq('every portal piece has a base reach',       T.portalPiecesWithoutBase.length, 0);
if(T.portalPiecesWithoutBase.length) S.note(T.portalPiecesWithoutBase.join(', '));
S.eq('every focus piece has a bonus',             T.focusPiecesWithoutBonus.length, 0);
if(T.focusPiecesWithoutBonus.length) S.note(T.focusPiecesWithoutBonus.join(', '));

S.ok('the portal chamber builds',                 T.portalRoomBuilt);
S.ok('  with a portal hotspot',                   !!T.portalSlot);
S.ok('  and a separate focus hotspot',            !!T.focusSlot);
S.ok('  which are not the same slot',             T.portalSlot !== T.focusSlot);

S.eq('no focus built means no focus',             T.noFocusYet, null);
S.ok('the lesser arch builds',                    T.builtLesser);
S.eq('  reaching its base number of roads',       T.lesserReach, T.lesserBase);

S.ok('the focus builds',                          T.builtFocus);
S.eq('  and is found',                            T.focusBuilt, 'hf_focus');
S.eq('A FOCUS WIDENS THE ARCH',                   T.lesserPlusFocus, T.lesserBase + T.focusBonus);
S.ok('the greater focus widens it further',       T.lesserPlusGreater > T.lesserPlusFocus,
     `${T.lesserPlusFocus} -> ${T.lesserPlusGreater} roads`);
S.eq('  by its own bonus',                        T.lesserPlusGreater, T.lesserBase + T.greaterBonus);

S.ok('the full arch builds',                      T.builtFull);
S.ok('REACH IS CAPPED AT THE DESTINATION LIST',   T.cappedAtAll,
     `${T.fullReach} of ${T.dests.length} — a bigger sum must not overrun the array`);
S.note('the Math.min in housePortalDests is belt-and-braces: Array.slice already clamps, so ' +
       'removing it changes nothing observable. The cap is asserted through the returned length, ' +
       'which is the contract that matters.');
S.ok('the roads open in table order, not at random', T.reachIsPrefix);

S.ok('the portal tile offers its open roads',     T.travelOptions > 0,
     T.portalOptions.join(' | '));
S.eq('  one menu entry per open road',            T.travelOptions, T.fullReach);

S.ok('A FOCUS ALONE IS USELESS, AND SAYS SO',     T.orphanFocusRows > 0 && T.orphanFocusEmptyClass === 'hempty',
     `${T.orphanFocusRows} rows, first is "${T.orphanFocusEmptyClass}"`);
S.ok('with a portal the panel lists every road',  T.panelRowsNoFocus >= T.dests.length,
     `${T.panelRowsNoFocus} rows for ${T.dests.length} destinations`);

S.report(
  'Arches and focuses combine as base+bonus, capped at the destination list, opening roads in table order.',
  'the portal model, the arch animation and the teleport itself — all need a browser.');
