/* ============================================================================
   xptest — the Construction experience curve (docs/23 §5).

   xp per plank: plank 6 - oak 15 - willow 34 - birch 70.
   Board values:        180 -    700 -   2,400 -   7,000.

   XP rises 12x while price rises 39x, so:
     - xp per GOLD falls with tier  (speed costs money)
     - xp per PACK SLOT rises steeply (better boards are the faster grind)

   That is OSRS's own shape. The spread is kept under 5x so no tier is a trap.
   It cannot simply be flat: board prices span 39x, and against Milville's
   100,000 xp level 99 a 39x xp spread would compress a 99 into minutes.

   Run: node harness/xptest.mjs
   ========================================================================== */
import {runPass, Suite, PRELUDE} from './_lib.mjs';

const WANT_PER_PLANK = {plank: 6, oak_plank: 15, willow_plank: 34, birch_plank: 70};
const TIERS = ['plank', 'oak_plank', 'willow_plank', 'birch_plank'];

const T = runPass(PRELUDE + String.raw`
  o.xpMax = XP_MAX;
  o.level99 = XP_TABLE[99];
  o.level120 = XP_TABLE[120];

  /* per-plank rate for every piece, grouped by board */
  o.byTier = {};
  o.oddities = [];
  for(const fid in HOUSE_FURNITURE){
    const F = HOUSE_FURNITURE[fid];
    const pid = F.plankId || 'oak_plank';
    const planks = F.planks | 0, xp = F.xp | 0;
    if(!planks){ o.oddities.push({fid, why: 'no boards'}); continue; }
    (o.byTier[pid] = o.byTier[pid] || []).push({fid, planks, xp, per: xp / planks, req: F.req | 0});
  }

  o.values = {};
  for(const id of ['plank', 'oak_plank', 'willow_plank', 'birch_plank'])
    o.values[id] = ITEMS[id] ? (ITEMS[id].val | 0) : null;

  /* the shipped award really is F.xp — build one piece and read the meter */
  freshHouse();
  const F = HOUSE_FURNITURE.hf_armchair;
  const SLOT = HOUSE_ENTRY.gx + ',' + HOUSE_ENTRY.gy + ':seat_a';
  clearInv();
  setLevel('construction', F.req);
  give('coins', F.cost); give(F.plankId || 'oak_plank', F.planks); give('iron_nails', F.nails);
  const before = player.skills.construction;
  houseBuild(SLOT, 'hf_armchair');
  o.awarded = player.skills.construction - before;
  o.awardWanted = F.xp;
  since();

  /* a level-up really fires off construction xp */
  clearInv();
  /* one xp short of level 2, then exactly one xp. Early levels are cheap
     (L2 is ~30 xp) so a bigger nudge would skip straight past level 2. */
  player.skills.construction = XP_TABLE[2] - 1;
  const lvlBefore = levelFor(player.skills.construction);
  addXp('construction', 1);
  o.levelUp = {before: lvlBefore, after: levelFor(player.skills.construction)};
  o.saidLevel = said(/Construction level is now/i);
  since();

  if(inHouse) exitHouse();
  return o;
`);

const S = new Suite('xptest').guard(T);

S.eq('level 99 is the 100,000 xp anchor',         T.level99, T.xpMax);
S.ok('  and the curve extends to 120',            T.level120 > T.level99);

/* ---- one rate per board tier, no exceptions ---- */
const rates = {};
for(const tier of TIERS){
  const rows = T.byTier[tier] || [];
  S.ok(`${tier}: pieces exist`,                   rows.length > 0, `${rows.length} pieces`);
  const uniq = [...new Set(rows.map(r => r.per))];
  S.eq(`  every ${tier} piece pays the same per board`, uniq.length, 1);
  if(uniq.length > 1)
    S.note(`${tier} rates: ` + [...new Set(rows.map(r => `${r.fid}=${r.per}`))].slice(0, 6).join(', '));
  rates[tier] = uniq[0];
  S.eq(`  and that rate is ${WANT_PER_PLANK[tier]}`, uniq[0], WANT_PER_PLANK[tier]);
}
S.eq('every piece that costs boards pays xp',     T.oddities.length, 0);

/* ---- the shape ---- */
const vals = T.values;
for(const t of TIERS) S.ok(`${t} has a board value`, vals[t] > 0, String(vals[t]));
S.eq('board values are 180 / 700 / 2,400 / 7,000', TIERS.map(t => vals[t]).join('/'), '180/700/2400/7000');

const xpSpread = rates.birch_plank / rates.plank;
const valSpread = vals.birch_plank / vals.plank;
S.ok('xp rises about 12x across the tiers',       Math.abs(xpSpread - 11.67) < 0.5, `${xpSpread.toFixed(2)}x`);
S.ok('price rises about 39x',                     Math.abs(valSpread - 38.9) < 1, `${valSpread.toFixed(2)}x`);

const perGold = TIERS.map(t => (rates[t] / vals[t]) * 1000);
S.note('xp per 1k gp: ' + TIERS.map((t, k) => `${t}=${perGold[k].toFixed(1)}`).join(', '));
S.ok('XP PER GOLD FALLS WITH TIER — speed costs money',
     perGold.every((p, k) => k === 0 || p < perGold[k - 1]),
     perGold.map(p => p.toFixed(1)).join(' > '));
S.ok('  matching the shipped 33 / 21 / 14 / 10',
     perGold.map(p => Math.round(p)).join('/') === '33/21/14/10',
     perGold.map(p => Math.round(p)).join('/'));

S.ok('XP PER PACK SLOT RISES — better boards are the faster grind',
     TIERS.every((t, k) => k === 0 || rates[t] > rates[TIERS[k - 1]]),
     TIERS.map(t => rates[t]).join(' < '));

const trapSpread = Math.max(...perGold) / Math.min(...perGold);
S.ok('NO TIER IS A TRAP — the xp-per-gold spread stays under 5x',
     trapSpread < 5, `${trapSpread.toFixed(2)}x`);

/* ---- and the award is real, not just tabulated ---- */
S.eq('building really awards the table value',    T.awarded, T.awardWanted);
S.eq('construction levels up',                    T.levelUp.after, T.levelUp.before + 1);
S.ok('  and says so',                             T.saidLevel);

S.report(
  'The board tiers pay a single fixed rate each, xp-per-gold falls and xp-per-slot rises, spread under 5x.',
  'whether the grind FEELS right — that is a playtest, not a table.');
