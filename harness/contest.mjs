/* ============================================================================
   contest — Construction, the 16th skill, wired into everything a skill touches.

   The trap this exists for (docs/23 §9): ADDING A SKILL MEANS ADDING IT TO THE
   player.skills OBJECT, not just to the SKILLS array. Missing it gives undefined
   xp and NaN everywhere it is displayed — and there are two separate literals to
   keep in step, the initial player and the reset-progress path.

   Run: node harness/contest.mjs
   ========================================================================== */
import {runPass, Suite, PRELUDE, SRC} from './_lib.mjs';

const T = runPass(PRELUDE + String.raw`
  o.skills = SKILLS.slice();
  o.inSkillsArray = SKILLS.includes('construction');
  o.inSkillsObject = Object.prototype.hasOwnProperty.call(player.skills, 'construction');
  o.meta = SKILL_META.construction || null;

  /* every skill in the array must have a home in the object and a meta row */
  o.missingFromObject = SKILLS.filter(s => !(s in player.skills));
  o.missingMeta = SKILLS.filter(s => !SKILL_META[s]);
  o.missingUi = SKILLS.filter(s => !SKILL_META[s] || !SKILL_META[s].ui);
  o.missingCol = SKILLS.filter(s => !SKILL_META[s] || !SKILL_META[s].col);
  /* ...and nothing may sit in the object that is not a skill */
  o.strayInObject = Object.keys(player.skills).filter(k => !SKILLS.includes(k));

  /* ---- xp actually moves the level ---- */
  setLevel('construction', 1);
  o.startLevel = lvl('construction');
  o.startXp = player.skills.construction;
  addXp('construction', 500);
  o.afterXp = player.skills.construction;
  o.afterLevel = lvl('construction');
  o.levelUpSaid = said(/Your Construction level is now/);
  since();

  /* NaN check: the thing the trap actually produces */
  o.xpIsNumber = typeof player.skills.construction === 'number' && !isNaN(player.skills.construction);
  o.levelIsNumber = typeof o.afterLevel === 'number' && !isNaN(o.afterLevel);

  /* ---- a save written before the skill existed must not poison the object ----
     levelFor(undefined) quietly returns 1; the NaN comes from the ACCUMULATOR,
     player.skills[skill] += amt on an undefined slot. That is the shape the
     trap actually takes, so that is what this proves. */
  delete player.skills.construction;
  o.missingLevel = levelFor(player.skills.construction);
  try{ addXp('construction', 100); }catch(e){ o.addXpThrew = String(e && e.message || e); }
  o.xpAfterAddToMissing = player.skills.construction;
  o.missingGivesNaN = isNaN(o.xpAfterAddToMissing);
  since();
  player.skills.construction = 0;      /* what the load-time backfill has to do */
  o.healedLevel = lvl('construction');
  o.healedXpIsNumber = !isNaN(player.skills.construction);

  /* ---- the curve ---- */
  o.xpTable = {L2: XP_TABLE[2], L50: XP_TABLE[50], L99: XP_TABLE[99], L120: XP_TABLE[120]};
  o.xpMax = XP_MAX;
  o.maxLevel = MAX_LEVEL;
  o.strictlyIncreasing = XP_TABLE.slice(2).every((v, k) => v > XP_TABLE[k + 1]);
  o.levelForBoundaries = [1, 2, 50, 99, 120].map(L => levelFor(XP_TABLE[L]));

  /* ---- construction counts toward the total level ---- */
  setLevel('construction', 1);
  const t1 = totalLevel();
  setLevel('construction', 50);
  o.totalLevelDelta = totalLevel() - t1;

  /* ---- the skill guide entry ---- */
  o.hasGuide = !!(typeof SKILL_GUIDE !== 'undefined' && SKILL_GUIDE.construction);

  setLevel('construction', 1);
  return o;
`);

const S = new Suite('contest').guard(T);

S.eq('sixteen skills',                            T.skills.length, 16);
S.ok('construction is in the SKILLS array',       T.inSkillsArray);
S.ok('CONSTRUCTION IS IN THE player.skills OBJECT', T.inSkillsObject);
S.eq('every skill has a slot in the object',      T.missingFromObject.length, 0);
if(T.missingFromObject.length) S.note('missing: ' + T.missingFromObject.join(', '));
S.eq('nothing stray sits in the object',          T.strayInObject.length, 0);
if(T.strayInObject.length) S.note('stray: ' + T.strayInObject.join(', '));
S.eq('every skill has a meta row',                T.missingMeta.length, 0);
S.eq('every skill has a UI icon name',            T.missingUi.length, 0);
S.eq('every skill has a colour',                  T.missingCol.length, 0);
S.eq('construction is named for the UI',          T.meta && T.meta.name, 'Construction');

S.eq('a fresh character starts at level 1',       T.startLevel, 1);
S.eq('  with zero xp',                            T.startXp, 0);
S.eq('xp lands in the object',                    T.afterXp, 500);
S.ok('  and moves the level',                     T.afterLevel > 1, `level ${T.afterLevel}`);
S.ok('  and announces the level-up',              T.levelUpSaid);
S.ok('XP IS A NUMBER, NOT undefined',             T.xpIsNumber);
S.ok('  and the level is not NaN',                T.levelIsNumber);

/* the trap, demonstrated rather than assumed */
S.eq('a missing skill reads as level 1, not a throw', T.missingLevel, 1);
S.ok('  BUT XP ACCUMULATION ON IT GIVES NaN',     T.missingGivesNaN,
     `xp became ${T.xpAfterAddToMissing} — if this stops being NaN the trap has changed shape`);
S.eq('  and a backfilled zero heals the level',   T.healedLevel, 1);
S.ok('  and the xp too',                          T.healedXpIsNumber);

S.eq('level 99 is XP_MAX',                        T.xpTable.L99, T.xpMax);
S.eq('  which is 100,000',                        T.xpMax, 100000);
S.eq('the table runs to 120',                     T.maxLevel, 120);
S.ok('  and 120 costs more than 99',              T.xpTable.L120 > T.xpTable.L99,
     `${T.xpTable.L99} -> ${T.xpTable.L120}`);
S.ok('the curve is strictly increasing',          T.strictlyIncreasing);
S.eq('levelFor lands exactly on each boundary',   T.levelForBoundaries, [1, 2, 50, 99, 120]);

S.eq('construction counts toward the total level', T.totalLevelDelta, 49);
S.ok('the skill guide has an entry',              T.hasGuide);

/* source: both skills literals must carry it, or reset-progress reintroduces the bug */
const literals = SRC.match(/skills\s*[:=]\s*\{attack:0/g) || [];
S.ok('every player.skills literal is in step',
     literals.length >= 2 && (SRC.match(/attack:0[^}]*construction:0/g) || []).length === literals.length,
     `${literals.length} literals found, ${(SRC.match(/attack:0[^}]*construction:0/g) || []).length} carry construction`);

S.report(
  'Construction is wired into SKILLS, player.skills, SKILL_META and the xp curve; no NaN path.',
  'the skill panel layout and the level-up chime — those need a browser.');
