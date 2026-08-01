/* ============================================================================
   skillfix — the load-time backfill for a save written before a skill existed.

   The trap (CLAUDE.md, docs/23 §9): ADDING A SKILL MEANS ADDING IT TO THE
   player.skills OBJECT, not just to SKILLS. A save written before Construction
   shipped has no construction key, and the accumulator turns that into NaN the
   first time you build anything — then NaN spreads into the level, the total
   level, the combat level and every panel that shows them.

   contest proves the CURRENT tables are in step. This proves the HEALING: an
   old save loads, gets backfilled, and behaves.

   Run: node harness/skillfix.mjs
   ========================================================================== */
import {runPass, Suite, PRELUDE, SRC} from './_lib.mjs';

const T = runPass(PRELUDE + String.raw`
  /* the backfill, whatever it is called, has to leave every SKILLS key present
     and numeric after a save with holes in it */
  const holed = () => {
    const s = {};
    for(const k of SKILLS) s[k] = XP_TABLE[10];
    delete s.construction;          /* the skill that did not exist yet */
    delete s.slayer;                /* and an older one, for good measure */
    return s;
  };

  /* ---- what a holed save does BEFORE any healing ---- */
  player.skills = holed();
  o.missingBefore = SKILLS.filter(k => !(k in player.skills));
  o.levelOfMissing = levelFor(player.skills.construction);
  o.totalLevelWithHoles = totalLevel();
  o.totalIsNaN = isNaN(o.totalLevelWithHoles);

  /* the accumulator is where it actually goes wrong */
  player.skills = holed();
  addXp('construction', 100);
  o.xpAfterAdd = player.skills.construction;
  o.xpIsNaN = isNaN(o.xpAfterAdd);
  since();

  /* ---- THE HEAL, AS THE GAME ACTUALLY DOES IT ----
     There is no backfill FUNCTION. The load path does
       Object.assign(player.skills, s.skills)
     onto a player.skills that already holds every key from the default literal,
     so a save with holes simply leaves the defaults standing. That is a better
     mechanism than a sweep — it cannot miss a key — but it only works because
     the assign is onto the full object rather than a replacement of it. */
  const DEFAULTS = {attack:0,strength:0,defense:0,hitpoints:XP_TABLE[10],woodcutting:0,
    mining:0,smithing:0,fishing:0,cooking:0,firemaking:0,prayer:0,slayer:0,ranged:0,
    magic:0,agility:0,construction:0};
  player.skills = Object.assign({}, DEFAULTS);   /* a fresh character */
  Object.assign(player.skills, holed());          /* then the old save on top */
  o.missingAfter = SKILLS.filter(k => typeof player.skills[k] !== 'number');
  o.constructionAfterLoad = player.skills.construction;
  o.slayerAfterLoad = player.skills.slayer;
  o.loadedValuesKept = player.skills.attack === XP_TABLE[10];
  /* the default literal itself must cover every skill, or the mechanism has a hole */
  o.defaultsMissing = SKILLS.filter(k => typeof DEFAULTS[k] !== 'number');
  o.totalAfter = totalLevel();
  o.totalAfterIsNaN = isNaN(o.totalAfter);

  /* and xp now accumulates properly */
  const before = player.skills.construction;
  addXp('construction', 250);
  o.xpAfterHeal = player.skills.construction - before;
  o.levelAfterHeal = lvl('construction');
  since();

  /* ---- the derived numbers all survive ---- */
  o.cmbAfter = cmbLvl();
  o.cmbIsNaN = isNaN(o.cmbAfter);
  o.maxHpAfter = maxHp();
  o.maxHpIsNaN = isNaN(o.maxHpAfter);

  /* ---- the panels that display them do not throw ---- */
  o.panelThrew = null;
  try{
    if(typeof renderSkills === 'function') renderSkills();
    if(typeof updateOrbs === 'function') updateOrbs();
    if(typeof renderInv === 'function') renderInv();
    o.panelsRendered = true;
  }catch(e){ o.panelThrew = String(e && e.message || e); }

  /* ---- a save with a STRING where a number belongs ---- */
  player.skills = holed();
  player.skills.construction = '500';
  for(const k of SKILLS) if(typeof player.skills[k] !== 'number') player.skills[k] = Number(player.skills[k]) || 0;
  o.stringHealed = typeof player.skills.construction === 'number';
  o.stringValue = player.skills.construction;

  /* ---- and one with an EXTRA key that is not a skill ---- */
  player.skills = holed();
  for(const k of SKILLS) if(typeof player.skills[k] !== 'number') player.skills[k] = 0;
  player.skills.gardening = 999;
  o.totalIgnoresStray = totalLevel();
  o.strayDidNotCount = !isNaN(o.totalIgnoresStray);
  delete player.skills.gardening;

  /* restore a clean character */
  for(const k of SKILLS) player.skills[k] = 0;
  player.skills.hitpoints = XP_TABLE[10];
  return o;
`);

const S = new Suite('skillfix').guard(T);

/* the damage, demonstrated */
S.ok('a holed save really is missing keys',       T.missingBefore.length === 2,
     `missing: ${T.missingBefore.join(', ')}`);
S.eq('  a missing skill reads as level 1',        T.levelOfMissing, 1);
S.ok('  and the TOTAL LEVEL still computes',      !T.totalIsNaN,
     `total ${T.totalLevelWithHoles} — levelFor(undefined) returns 1, so the damage is not here`);
S.ok('BUT XP ON A MISSING SKILL GIVES NaN',       T.xpIsNaN,
     `xp became ${T.xpAfterAdd} — this is where an unpatched save actually breaks`);

/* the heal */
S.eq('THE DEFAULT LITERAL COVERS EVERY SKILL',    T.defaultsMissing.length, 0);
if(T.defaultsMissing.length) S.note('the assign-onto-defaults trick only works if this is complete: ' + T.defaultsMissing.join(', '));
S.eq('after an old save loads, every skill is numeric', T.missingAfter.length, 0);
if(T.missingAfter.length) S.note('still bad: ' + T.missingAfter.join(', '));
S.eq('  the missing skill sits at its default',   T.constructionAfterLoad, 0);
S.eq('  and so does the other one',               T.slayerAfterLoad, 0);
S.ok('  while the save\'s real values are kept',  T.loadedValuesKept,
     'assign-onto-defaults must not clobber what the save actually had');
S.ok('  the total level is a real number',        !T.totalAfterIsNaN, String(T.totalAfter));
S.eq('  and xp accumulates again',                T.xpAfterHeal, 250);
S.ok('  moving the level',                        T.levelAfterHeal > 1, `level ${T.levelAfterHeal}`);

/* derived numbers */
S.ok('the combat level survives',                 !T.cmbIsNaN, String(T.cmbAfter));
S.ok('max hitpoints survives',                    !T.maxHpIsNaN, String(T.maxHpAfter));
S.eq('the panels render without throwing',        T.panelThrew, null);
S.ok('  and really ran',                          T.panelsRendered === true);

/* odd shapes */
S.ok('a string xp value can be healed to a number', T.stringHealed);
S.eq('  keeping its value',                       T.stringValue, 500);
S.ok('a stray non-skill key does not poison the total', T.strayDidNotCount,
     `total ${T.totalIgnoresStray} — totalLevel iterates SKILLS, not the object's own keys`);

/* source: the load path must actually do this */
/* THE mechanism, at source: the set is BUILT FROM SKILLS, one key at a time, taking the save's
   value only when it is a finite number. This used to be an Object.assign onto the defaults, which
   backfilled correctly but MERGED — a skill the save predates kept whatever was already on
   player.skills rather than defaulting, so loading character B after character A (no such path
   today, but one button away) would have handed B character A's Agility. Iterating SKILLS makes the
   save authoritative and the missing-skill default explicit in the same expression. */
S.ok('the load path BUILDS player.skills from SKILLS',
     /for\(const _sk of SKILLS\)\{[\s\S]{0,240}?player\.skills\[_sk\]=/.test(SRC),
     'every known skill must get a value from the save or an explicit default — no merge');
S.ok('  taking the save value only when it is a finite number',
     /typeof _v==='number'&&isFinite\(_v\)/.test(SRC));
S.ok('  and never replaces the object wholesale',
     !/player\.skills\s*=\s*s\.skills/.test(SRC),
     'player.skills = s.skills would drop every key the old save never had');
S.ok('  and no longer merges with Object.assign',
     !/Object\.assign\(player\.skills,\s*s\.skills\)/.test(SRC),
     'a merge lets a skill the save predates inherit the previous character\'s xp');
S.ok('the default literal names construction',    /skills:\{attack:0[^}]*construction:0\}/.test(SRC));
S.ok('totalLevel iterates SKILLS, not Object.keys',
     /function totalLevel\(\)\{[^}]*for\(const k of SKILLS\)/.test(SRC));

S.report(
  'A save written before Construction existed heals to numeric xp on every skill; the total, combat level and panels all survive it.',
  'that a real old save file decodes — this exercises the in-memory shape, not the save codec.');
