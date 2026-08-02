/* ============================================================================
   milltest — the sawmill fee, and the faucet it is holding shut.

   THE INVARIANT, and the only reason the fee is not zero:

       fee  >  what an NPC clerk pays for the plank  (40% of its val)

   sellSlot() buys any valued item at 40% of val and pays out of NOWHERE, and a
   log costs nothing but a tree. So the moment a board's fee drops to or below
   its clerk price, chop -> saw -> sell becomes a pure gold faucet. Birch is the
   dangerous one: Woodcutting 45, twenty nodes, an 88.8% roll at 99, against
   runite ore (the nearest-valued gather) at Mining 85 with two nodes and 26.8%
   -- roughly 1.87M gp/hr against 543k, at half the level requirement.

   THE OTHER HALF, which is what players actually complained about: the fee used
   to be ~143% of a plank's own value, so sawing cost more than the board was
   worth and everybody bought planks off the Exchange instead. Making has to be
   cheaper than buying or the mill is decoration.

   Both directions are asserted per tier, so the fee is pinned inside a band:
   above the clerk price, below the Exchange reference. Change a plank's val and
   this file tells you exactly which fee to move.

   Run: node harness/milltest.mjs
   ========================================================================== */
import {runPass, Suite, PRELUDE, SRC} from './_lib.mjs';

const T = runPass(PRELUDE + String.raw`
  o.tiers = SAWMILL.map(([log, plank, fee]) => {
    /* what the clerk really pays, driven rather than read off the table */
    clearInv(); give(plank, 1);
    const c0 = countItem('coins'); sellId(plank, 1);
    const clerkPays = countItem('coins') - c0;
    /* and what he pays for the raw log, for the "was this worth sawing" comparison */
    clearInv(); give(log, 1);
    const l0 = countItem('coins'); sellId(log, 1);
    const clerkPaysLog = countItem('coins') - l0;
    return {log, plank, fee, clerkPays, clerkPaysLog,
            plankVal: ITEMS[plank].val, logVal: ITEMS[log].val, geRef: gePrice(plank),
            roundTrip: clerkPays - fee};
  });
  since();

  /* the mill really does charge what the table says, and really does convert */
  setLevel('woodcutting', 99); setLevel('construction', 99);
  o.live = [];
  for(const [log, plank, fee] of SAWMILL){
    clearInv(); give(log, 4); give('coins', 1000000);
    const c0 = countItem('coins'), p0 = countItem(plank);
    since();
    let ran = false;
    try{ ran = sawOneBoard(log); }catch(e){ ran = 'threw: ' + String(e.message||e).slice(0,60); }
    o.live.push({plank, ran, spent: c0 - countItem('coins'), made: countItem(plank) - p0,
                 logsLeft: countItem(log), said: since().join(' ').slice(0, 90)});
  }
  since();
  return o;
`);

const S = new Suite('milltest');
S.guard(T);

/* ===================== the faucet must stay shut ========================= */
for(const t of T.tiers)
  S.ok(`${t.plank}: the fee beats the clerk's price`,
       t.fee > t.clerkPays,
       `fee ${t.fee} vs clerk ${t.clerkPays} — round trip ${t.roundTrip > 0 ? '+' : ''}${t.roundTrip}/board`);
for(const t of T.tiers)
  S.ok(`  so chop -> saw -> sell still LOSES money`,
       t.roundTrip < 0,
       `${t.plank}: ${t.roundTrip}/board`);

/* the same rule stated once more against the raw formula, so a val change is caught
   even if sellId is refactored */
S.ok('every fee exceeds 40% of its plank value',
     T.tiers.every(t => t.fee > Math.floor(t.plankVal * 0.4)),
     T.tiers.map(t => `${t.plank} ${t.fee}>${Math.floor(t.plankVal * 0.4)}`).join('  '));

/* ================== but making must beat buying ========================== */
for(const t of T.tiers)
  S.ok(`${t.plank}: making is cheaper than buying`,
       t.fee < t.geRef,
       `fee ${t.fee} vs Exchange reference ${t.geRef}`);
S.ok('NO FEE EXCEEDS ITS OWN PLANK\'S VALUE',
     T.tiers.every(t => t.fee < t.plankVal),
     'the old fees were ~143% of value, which is why everyone bought planks instead');
S.ok('  and every fee sits near half of value',
     T.tiers.every(t => { const r = t.fee / t.plankVal; return r > 0.42 && r < 0.58; }),
     T.tiers.map(t => `${t.plank} ${(t.fee / t.plankVal * 100).toFixed(0)}%`).join('  '));

/* the band, stated as one thing: clerk price < fee < Exchange reference */
S.ok('every fee sits inside the safe band',
     T.tiers.every(t => t.clerkPays < t.fee && t.fee < t.geRef),
     T.tiers.map(t => `${t.clerkPays} < ${t.fee} < ${t.geRef}`).join('   |   '));

/* ================== better trees are still worth felling ================= */
S.ok('the tiers are ordered by fee',
     T.tiers.every((t, i) => i === 0 || t.fee > T.tiers[i - 1].fee),
     T.tiers.map(t => t.fee).join(' < '));
S.ok('  and a plank is always worth more than its log',
     T.tiers.every(t => t.plankVal > t.logVal),
     T.tiers.map(t => `${t.log} ${t.logVal} -> ${t.plank} ${t.plankVal}`).join('  '));

/* ========================= the mill still works ==========================
   Asserted for EVERY tier, not "if it ran" — an earlier draft guarded this on a
   function name that did not exist, so the whole block skipped in silence and
   the suite still reported green. */
S.eq('every tier actually sawed', T.live.filter(l => l.ran === true).length, T.tiers.length,
     T.live.map(l => `${l.plank}:${l.ran}`).join('  '));
for(const l of T.live){
  S.eq(`sawing a ${l.plank} charges the table fee`, l.spent,
       T.tiers.find(t => t.plank === l.plank).fee);
  S.eq(`  and yields one board`, l.made, 1);
  S.eq(`  consuming exactly one log`, l.logsLeft, 3);
}
S.ok('the sawmill converts one board at a time, not the whole pack',
     /ONE BOARD AT A TIME/.test(SRC),
     'it used to convert everything on one click, which read as a vending machine');

/* source: the reason the fee is not zero must stay written down next to it */
S.ok('the anti-faucet reason is recorded at the table',
     /cannot be made FREE/.test(SRC) && /40% of the plank/.test(SRC),
     'the next person to read a complaint about the fee needs to see why it exists');

S.report(
  'Every sawmill fee sits inside a band: above what an NPC clerk pays for the board (so chop -> saw '
  + '-> sell always loses money and the gold faucet stays shut) and below the Exchange reference (so '
  + 'making a plank is cheaper than buying one). Both edges are asserted per tier.',
  'whether the new prices FEEL right over a real Construction grind — that is a playtest, and the '
  + 'Exchange is a player order book, so the real price of a plank is whatever players list it at.');
