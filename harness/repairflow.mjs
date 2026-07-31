/* ============================================================================
   repairflow — the three-stage cottage rebuild (docs/23 §2).

   Repair sizing is deliberate: boards do not stack, and repair happens BEFORE
   you can build a bell and hire staff, so no stage may want more planks than fit
   comfortably in an unaided pack.

   The exterior is two hidden groups plus two detail groups; pohRefreshExterior()
   shows whichever matches the stage, so a repair is instant and needs no
   re-bake. That is asserted here directly — `.visible` reads back on the current
   shim (docs/14 used to say it did not; it does now).

   Run: node harness/repairflow.mjs
   ========================================================================== */
import {runPass, Suite, PRELUDE} from './_lib.mjs';

const T = runPass(PRELUDE + String.raw`
  o.steps = POH_REPAIR_STEPS.map(s => ({n: s.n, planks: s.planks|0, nails: s.nails|0, coins: s.coins|0}));
  o.packSize = player.inv.length;

  /* ---- gating: no deed, no repair ---- */
  clearInv();
  player.house = null;
  give('coins', 100000); give('oak_plank', 20); give('iron_nails', 20);
  pohRepairNext();
  o.repairWithoutDeed = pohStage();
  o.saidNotYours = said(/not yours/i);
  since();

  /* ---- the exterior states, stage by stage ---- */
  /* stage 0 the wreck with rubble - 1 rubble cleared - 2 framed and roofed - 3 glazed */
  player.house = {owned: true, repair: 0, rooms: null, slots: {}, slotsV2: 1};
  o.exterior = [];
  o.stageRuns = [];
  for(let st = 0; st <= POH_REPAIR_STEPS.length; st++){
    player.house.repair = st;
    pohRefreshExterior();
    o.exterior.push({
      stage: st,
      ruin:   pohRuinGroup  ? pohRuinGroup.visible  : null,
      debris: pohRuinDebris ? pohRuinDebris.visible : null,
      fixed:  pohFixGroup   ? pohFixGroup.visible   : null,
      detail: pohFixDetail  ? pohFixDetail.visible  : null,
      repaired: pohRepaired(),
    });
  }
  o.exteriorGroupsExist = !!(pohRuinGroup && pohRuinDebris && pohFixGroup && pohFixDetail);

  /* ---- walk the three stages for real, checking each refusal ----
     Each sub-case rewinds player.house.repair to the stage under test, so a
     refusal that wrongly succeeds cannot contaminate the next case. Stage 1
     wants no materials at all, so the board-short case does not apply to it. */
  player.house = {owned: true, repair: 0, rooms: null, slots: {}, slotsV2: 1};
  const rewind = st => { player.house.repair = st; };
  for(let st = 0; st < POH_REPAIR_STEPS.length; st++){
    const S = POH_REPAIR_STEPS[st];
    const rec = {step: st, wantsBoards: S.planks > 0};

    /* one plank short: refused, and NOTHING is charged */
    if(rec.wantsBoards){
      rewind(st);
      clearInv();
      give('coins', S.coins);
      give('oak_plank', S.planks - 1);
      if(S.nails) give('iron_nails', S.nails);
      const c0 = coinsCount();
      pohRepairNext();
      rec.shortStage = pohStage();
      rec.shortCharged = c0 - coinsCount();
      rec.shortPlanksKept = countItem('oak_plank');
      rec.saidShort = said(/more oak planks/i);
      since();
    }

    /* a coin short: same */
    rewind(st);
    clearInv();
    give('coins', Math.max(0, S.coins - 1));
    if(S.planks) give('oak_plank', S.planks);
    if(S.nails)  give('iron_nails', S.nails);
    const cb = coinsCount();
    pohRepairNext();
    rec.brokeStage = pohStage();
    rec.brokeCharged = cb - coinsCount();
    rec.brokePlanksKept = countItem('oak_plank');
    rec.saidBroke = said(/more coins/i);
    since();

    /* exact materials: it goes through */
    rewind(st);
    clearInv();
    give('coins', S.coins);
    if(S.planks) give('oak_plank', S.planks);
    if(S.nails)  give('iron_nails', S.nails);
    rec.slotsUsed = player.inv.length - freeSlots();
    const xp0 = player.skills.construction;
    pohRepairNext();
    rec.stage = pohStage();
    rec.planksLeft = countItem('oak_plank');
    rec.nailsLeft = countItem('iron_nails');
    rec.coinsLeft = coinsCount();
    rec.xp = player.skills.construction - xp0;   /* repair pays NO construction xp */
    rec.saidDone = said(new RegExp(S.done.slice(0, 24).replace(/[.*+?^\${}()|[\]\\]/g, '\\$&'), 'i'));
    rec.exteriorAfter = pohFixGroup ? pohFixGroup.visible : null;
    since();

    o.stageRuns.push(rec);
  }
  o.finalStage = pohStage();
  o.finalRepaired = pohRepaired();

  /* ---- and the door opens only now ---- */
  o.enterAfterRepair = (enterHouse(), inHouse);
  if(inHouse) exitHouse();

  /* a fourth repair is a no-op */
  clearInv(); give('coins', 100000); give('oak_plank', 20); give('iron_nails', 20);
  const c9 = coinsCount();
  pohRepairNext();
  o.fourthCharged = c9 - coinsCount();
  o.fourthStage = pohStage();
  since();
  return o;
`);

const S = new Suite('repairflow').guard(T);

S.eq('three stages',                              T.steps.length, 3);
S.eq('stage 1 clears rubble for coins only',      JSON.stringify(T.steps[0]),
     JSON.stringify({n: 'Clear the rubble', planks: 0, nails: 0, coins: 2000}));
S.eq('stage 2 frames and roofs it',               T.steps[1].planks, 14);
S.eq('stage 3 glazes and rebuilds the chimney',   T.steps[2].planks, 8);
S.ok('coins rise each stage',
     T.steps.every((s, k) => k === 0 || s.coins > T.steps[k - 1].coins),
     T.steps.map(s => s.coins).join(' < '));

/* the sizing rule, which is the whole reason the stages are shaped this way */
const worst = Math.max(...T.steps.map(s => s.planks));
S.ok('NO STAGE WANTS MORE BOARDS THAN AN UNAIDED PACK HOLDS',
     worst <= T.packSize - 2,
     `worst stage wants ${worst} boards; the pack is ${T.packSize} slots and also carries nails and coins`);
for(const r of T.stageRuns)
  S.ok(`  stage ${r.step + 1} fits with room to spare`, r.slotsUsed <= T.packSize,
       `${r.slotsUsed} of ${T.packSize} slots`);

/* gating */
S.eq('no deed, no repair',                        T.repairWithoutDeed, 0);
S.ok('  and says the cottage is not yours',       T.saidNotYours);

/* per-stage refusals: nothing part-charged, nothing part-consumed */
for(const r of T.stageRuns){
  const k = r.step + 1;
  if(r.wantsBoards){
    S.eq(`stage ${k}: one board short is refused`, r.shortStage, r.step);
    S.eq(`  charging nothing`,                     r.shortCharged, 0);
    S.eq(`  and keeping the boards`,               r.shortPlanksKept, T.steps[r.step].planks - 1);
    S.ok(`  and saying what is missing`,           r.saidShort);
  }
  S.eq(`stage ${k}: a coin short is refused`,     r.brokeStage, r.step);
  S.eq(`  charging nothing`,                      r.brokeCharged, 0);
  S.eq(`  keeping the boards too`,                r.brokePlanksKept, T.steps[r.step].planks);
  S.ok(`  and saying so`,                         r.saidBroke);
  S.eq(`stage ${k} completes on exact materials`, r.stage, k);
  S.eq(`  consuming the boards`,                  r.planksLeft, 0);
  S.eq(`  consuming the nails`,                   r.nailsLeft, 0);
  S.eq(`  consuming the coins`,                   r.coinsLeft, 0);
  S.eq(`  and paying NO construction xp`,         r.xp, 0);
  S.ok(`  and telling you what changed`,          r.saidDone);
}

/* the exterior swaps without a re-bake */
S.ok('all four exterior groups were built',       T.exteriorGroupsExist);
const ext = T.exterior;
S.eq('stage 0: the wreck stands, with rubble',    JSON.stringify([ext[0].ruin, ext[0].debris, ext[0].fixed, ext[0].detail]),
     JSON.stringify([true, true, false, false]));
S.eq('stage 1: rubble cleared, wreck still there', JSON.stringify([ext[1].ruin, ext[1].debris, ext[1].fixed, ext[1].detail]),
     JSON.stringify([true, false, false, false]));
S.eq('stage 2: framed and roofed, not yet glazed', JSON.stringify([ext[2].ruin, ext[2].debris, ext[2].fixed, ext[2].detail]),
     JSON.stringify([false, false, true, false]));
S.eq('stage 3: glazed, chimney, the lot',         JSON.stringify([ext[3].ruin, ext[3].debris, ext[3].fixed, ext[3].detail]),
     JSON.stringify([false, false, true, true]));
S.ok('the ruin and the repaired cottage are never both shown',
     ext.every(e => !(e.ruin && e.fixed)));
S.eq('pohRepaired() only at the last stage',      ext.map(e => e.repaired).join(','), 'false,false,false,true');

S.eq('the cottage ends repaired',                 T.finalRepaired, true);
S.ok('AND ONLY NOW DOES THE DOOR OPEN',           T.enterAfterRepair);
S.eq('a fourth repair charges nothing',           T.fourthCharged, 0);
S.eq('  and changes nothing',                     T.fourthStage, 3);

S.report(
  'Three repair stages gate correctly, consume exactly their materials, and swap the exterior in place.',
  'how the cottage looks at each stage — four hidden groups is the mechanism, not the appearance.');
