/* ============================================================================
   milltest — the sawmill fee, and the faucet it is holding shut.

   THE INVARIANT, and the only reason the fee is not zero:

       fee  >  what an NPC clerk pays for the plank  (40% of its val)

   THE CLERK IS BOTH THE SHOP AND THE BUYER, at two very different prices, and
   the fee has to sit between them:

     * he SELLS planks at full val   -- 180 / 700 / 2,400 / 7,000 (they are in
       GE_STOCK), which is what you pay if you do not mill your own.
     * he BUYS them back at 40% of val -- 72 / 280 / 960 / 2,800, paid OUT OF
       NOWHERE. Infinite gold.

   UPPER EDGE: milling must be much cheaper than buying, or the mill is
   decoration. The old fees were 83-89% of the clerk's asking price -- an
   11-17% saving for chopping the log and walking there, which is why players
   just bought. At 50% of val milling costs HALF his price.

   LOWER EDGE: the fee must exceed 40% of val, or chop -> saw -> VENDOR prints
   gold from a free log (~2,800gp a birch board at Woodcutting 45, against
   runite ore at Mining 85 for 2,700 -- roughly 1.87M gp/hr against 543k).

   Selling boards to PLAYERS on the market tab is meant to pay and needs no
   guard here: that market moves gold between players, it does not create it.

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
            /* what he CHARGES for the same board — 0 if he does not stock it at all */
            clerkSellsAt: GE_STOCK.includes(plank) ? ITEMS[plank].val : 0,
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
  S.ok(`  so chop -> saw -> VENDOR still loses money`,
       t.roundTrip < 0,
       `${t.plank}: ${t.roundTrip}/board to the clerk — selling to PLAYERS is meant to profit`);

/* the same rule stated once more against the raw formula, so a val change is caught
   even if sellId is refactored */
S.ok('every fee exceeds 40% of its plank value',
     T.tiers.every(t => t.fee > Math.floor(t.plankVal * 0.4)),
     T.tiers.map(t => `${t.plank} ${t.fee}>${Math.floor(t.plankVal * 0.4)}`).join('  '));

/* ============ but milling must be much cheaper than buying =============== */
/* the comparison is the price the CLERK CHARGES for the same board, not the
   gePrice() reference — that is a tooltip number and never transacts */
S.ok('the clerk really does sell planks (or the comparison is vacuous)',
     T.tiers.every(t => t.clerkSellsAt > 0),
     T.tiers.map(t => `${t.plank} ${t.clerkSellsAt}`).join('  '));
for(const t of T.tiers)
  S.ok(`${t.plank}: milling undercuts the clerk`,
       t.fee < t.clerkSellsAt,
       `mill ${t.fee} vs his price ${t.clerkSellsAt}`);
S.ok('MILLING COSTS ABOUT HALF THE CLERK\'S PRICE',
     T.tiers.every(t => t.fee / t.clerkSellsAt <= 0.55),
     T.tiers.map(t => `${t.plank} ${(t.fee / t.clerkSellsAt * 100).toFixed(0)}%`).join('  ')
     + '  — the old fees were 83-89%, an 11-17% saving nobody walked to the mill for');
S.ok('  and still undercuts him even if you BUY the log too',
     T.tiers.every(t => (t.fee + t.logVal) < t.clerkSellsAt * 0.6),
     T.tiers.map(t => `${t.plank} ${(((t.fee + t.logVal) / t.clerkSellsAt) * 100).toFixed(0)}%`).join('  '));

/* the band, stated as one thing: what he pays you < fee < what he charges you */
S.ok('every fee sits inside the safe band',
     T.tiers.every(t => t.clerkPays < t.fee && t.fee < t.clerkSellsAt),
     T.tiers.map(t => `${t.clerkPays} < ${t.fee} < ${t.clerkSellsAt}`).join('   |   '));

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
     /why it cannot be FREE/.test(SRC) && /prints money/.test(SRC) &&
     /MILLING COSTS HALF THE CLERK/.test(SRC),   /* the phrase wraps a line, so match its head */
     'the next person to read a complaint about the fee needs to see why it exists');

S.report(
  'Every sawmill fee sits between the two prices the clerk quotes for the same board: above what he '
  + 'PAYS you (40% of val, from infinite gold, so vendoring always loses and the faucet stays shut) '
  + 'and at about half what he CHARGES you (so milling your own is the obvious move). Per tier.',
  'whether the new prices FEEL right over a real Construction grind — that is a playtest, and the '
  + 'Exchange is a player order book, so the real price of a plank is whatever players list it at.');
