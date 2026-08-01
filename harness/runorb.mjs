/* ============================================================================
   runorb — the run-energy orb reads against maxStamina(), not a literal 100.

   Agility raises the energy ceiling: AGI_ENERGY_TIERS walks 100 at level 1 up
   to 240 at 120, and maxStamina() is the single authority on it. Every other
   consumer already asked it — loadSlot clamps to it, the regen tick caps at it,
   a new character starts at it — but updateRunOrb() divided by a hard-coded
   100, which predated the skill.

   The consequence was silent and exactly wrong-looking: above Agility 10 the
   clamp pinned the fill at 1 for everything from the real maximum down to 100,
   so at Agility 99 (ceiling 210) the ring sat visually FULL for the first 110
   energy — 220 running tiles at RUN_DRAIN 0.5 — while the number beside it
   ticked down normally. The colour thresholds hung off the same fraction, so
   green also outstayed its welcome by the same margin.

   The regression check that matters is MONOTONICITY: the fill must move for
   every step of the drain, not just the last 100. A single-point check at full
   energy passes under the bug.

   Run: node harness/runorb.mjs
   ========================================================================== */
import {runPass, Suite, PRELUDE, SRC} from './_lib.mjs';

const T = runPass(PRELUDE + String.raw`
  /* ---- the ceiling itself ---- */
  const maxAt = L => { setLevel('agility', L); return maxStamina(); };
  o.max1   = maxAt(1);
  o.max10  = maxAt(10);
  o.max50  = maxAt(50);
  o.max99  = maxAt(99);
  o.max120 = maxAt(120);

  /* the table must never step backwards, and must stay inside the level cap */
  o.tiersMonotonic = AGI_ENERGY_TIERS.every((t, i) =>
    i === 0 || (t[0] > AGI_ENERGY_TIERS[i-1][0] && t[1] >= AGI_ENERGY_TIERS[i-1][1]));
  o.tiersWithinCap = AGI_ENERGY_TIERS.every(t => t[0] <= MAX_LEVEL);

  /* ---- read the orb the way the page does ---- */
  player.run = false;
  const fill = st => {
    player.stamina = st;
    updateRunOrb();
    const d = document.getElementById('runorbdisc');
    return parseFloat(d.style.getPropertyValue('--orbp'));   /* '47.6%' -> 47.6 */
  };
  const num = () => document.getElementById('runorb').textContent;
  const col = () => document.getElementById('runorb').style.color;

  /* ---- Agility 1: ceiling 100, so nothing changes for a fresh account ---- */
  setLevel('agility', 1);
  o.lvl1Full = fill(100);
  o.lvl1Half = fill(50);
  o.lvl1Zero = fill(0);

  /* ---- Agility 99: ceiling 210. THIS is where the literal 100 showed ---- */
  setLevel('agility', 99);
  o.lvl99Full  = fill(210);
  o.lvl99Half  = fill(105);
  o.lvl99At100 = fill(100);        /* was 100.0 under the bug */
  o.lvl99Zero  = fill(0);

  /* the drain must move the ring on the very first tile, at full energy */
  const top = fill(210), oneTile = fill(210 - RUN_DRAIN);
  o.firstTileMoves = oneTile < top;

  /* and keep moving all the way down — 20 samples across the whole range */
  const seen = [];
  for(let i = 0; i <= 20; i++) seen.push(fill(210 * i / 20));
  o.strictlyIncreasing = seen.every((v, i) => i === 0 || v > seen[i-1]);
  o.samples = seen.length;

  /* the fraction is what colours the number, so it drifted too */
  setLevel('agility', 99);
  fill(100); o.colAt100 = col();      /* 47.6% of 210 is NOT the green band */
  fill(200); o.colAt200 = col();
  fill(20);  o.colAt20  = col();

  /* the number beside the ring was always right — it never divided by anything */
  fill(137.2); o.numAt137 = num();

  /* ---- the other consumers, still asking maxStamina() ---- */
  setLevel('agility', 120);
  player.stamina = clamp(99999, 0, maxStamina());
  o.clampedTo = player.stamina;

  since();
  return o;
`);

/* the new-player literal lives in an object literal, so it is a source read */
const DEFAULT_STAMINA = Number((/run:false,stamina:(\d+)/.exec(SRC) || [])[1]);

const S = new Suite('runorb').guard(T);

/* ---- the ceiling ---- */
S.eq('Agility 1 caps energy at 100',    T.max1,   100);
S.eq('Agility 10 caps at 115',          T.max10,  115);
S.eq('Agility 50 caps at 170',          T.max50,  170);
S.eq('Agility 99 caps at 210',          T.max99,  210);
S.eq('Agility 120 caps at 240',         T.max120, 240);
S.ok('AGI_ENERGY_TIERS never steps backwards', T.tiersMonotonic);
S.ok('  and never names a level above MAX_LEVEL', T.tiersWithinCap);

/* ---- the orb fill ---- */
S.eq('a fresh account at 100 energy reads a full ring', T.lvl1Full, 100);
S.eq('  half energy reads half',                        T.lvl1Half, 50);
S.eq('  empty reads empty',                             T.lvl1Zero, 0);

S.eq('at Agility 99 the ring is full only at the REAL maximum', T.lvl99Full, 100);
S.eq('  half of 210 reads half',                                T.lvl99Half, 50);
S.eq('  and 100 energy is under half, not full',                T.lvl99At100, 47.6);
S.eq('  empty still reads empty',                               T.lvl99Zero, 0);

S.ok('the first running tile moves the ring at full energy', T.firstTileMoves,
     'the bug: 220 tiles of running before the ring left 100%');
S.ok('the fill rises strictly across the whole 0..max range', T.strictlyIncreasing,
     `${T.samples} samples — a flat stretch anywhere means a literal ceiling is back`);

/* ---- the colour hangs off the same fraction ---- */
S.ok('100 energy at Agility 99 is not in the green band', T.colAt100 !== '#00FF00',
     `got ${T.colAt100} — 47.6% of the ceiling`);
S.eq('  most of the way up is green',  T.colAt200, '#00FF00');
S.eq('  nearly empty is red',          T.colAt20,  '#FF3030');

/* ---- the number was never the broken half ---- */
S.eq('the number beside the ring ceils the raw energy', T.numAt137, 138);

/* ---- the neighbours ---- */
S.eq('loading clamps a silly saved value to the ceiling', T.clampedTo, 240);
S.eq('the new-player literal matches the Agility 1 tier', DEFAULT_STAMINA, T.max1);

/* ---- source: the literal must not come back ---- */
S.ok('updateRunOrb divides by maxStamina()',
     /_rf=clamp\(player\.stamina\/maxStamina\(\),0,1\)/.test(SRC),
     'the orb fraction is the one place this was still hard-coded');
S.ok('  and nothing divides run energy by a literal 100',
     !/player\.stamina\s*\/\s*100/.test(SRC));
S.ok('  and nothing clamps run energy to a literal 100',
     !/clamp\(\s*(?:s\.)?stamina\s*,\s*0\s*,\s*100\s*\)/.test(SRC));
S.ok('the load path clamps to maxStamina()',
     /player\.stamina=clamp\(s\.stamina,0,maxStamina\(\)\)/.test(SRC));
S.ok('the regen tick caps at maxStamina()',
     /player\.stamina=Math\.min\(maxStamina\(\),player\.stamina\+/.test(SRC));

S.report(
  'The run orb reads as a fraction of the player\'s real energy ceiling, so the fill and the colour track the drain from the first tile at every Agility level.',
  'that the ring LOOKS right — the conic-gradient sweep, its start angle and its direction are CSS, and only Sam can see those.');
