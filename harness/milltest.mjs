/* ============================================================================
   milltest — the free sawmill, and the one thing holding it up.

   THE INVARIANT, and it is not about the fee any more:

       THE CLERK MUST NOT SELL LOGS.

   The mill is free, so a purchasable log is a money printer that needs no
   gathering and no levels: buy a birch log for 90, saw it, sell the board for
   2,800, about 8M gp/hr of pure clicking. The four logs were removed from
   GE_STOCK for exactly this reason. Put them back and this file goes red.

   WHY FREE IS FAIR. The game already runs one rule everywhere: buy the raw
   material and process it and you LOSE (all 55 smithing recipes land a few
   coins underwater, because the clerk sells ore at full val and buys the
   finished item at 40%); gather it yourself and the whole vendor price is
   profit. Sawing used to break that rule in the WRONG direction -- chopping
   your own birch and milling it still lost 3,400 a board -- which is why
   players bought planks instead of making them. It now behaves like smithing.

   AND THE RATE IS IN LINE. Against the real node tables and action timings
   (20 birch, cap ~12, 18s respawn, 1.2s an attempt, 1.2s a board) chopping and
   milling birch is ~2.9M gp/hr at Woodcutting 99, against ~3.1M for the runite
   -> rune platebody chain at Mining 85 + Smithing 87. Just under the best
   existing method, and 1.4M (0.46x) at Woodcutting 45 where it unlocks.

   Run: node harness/milltest.mjs
   ========================================================================== */
import {runPass, Suite, PRELUDE, SRC} from './_lib.mjs';

const T = runPass(PRELUDE + String.raw`
  const LOGS = SAWMILL.map(r => r[0]);
  o.stockedLogs = LOGS.filter(id => GE_STOCK.includes(id));      /* must be empty */

  o.tiers = SAWMILL.map(([log, plank, fee]) => {
    clearInv(); give(plank, 1);
    const c0 = countItem('coins'); sellId(plank, 1);
    const clerkPaysPlank = countItem('coins') - c0;
    clearInv(); give(log, 1);
    const l0 = countItem('coins'); sellId(log, 1);
    const clerkPaysLog = countItem('coins') - l0;
    return {log, plank, fee,
            clerkPaysPlank, clerkPaysLog,
            clerkSellsLogAt:   GE_STOCK.includes(log)   ? ITEMS[log].val   : 0,
            clerkSellsPlankAt: GE_STOCK.includes(plank) ? ITEMS[plank].val : 0,
            chopSawVendor: clerkPaysPlank - fee,                 /* free log: must PROFIT */
            plankVal: ITEMS[plank].val, logVal: ITEMS[log].val};
  });

  /* THE GAME'S RULE, checked across every smithing recipe: buying the inputs off
     the clerk and vendoring the output must never pay. Sawing is exempt only
     because its input cannot be bought at all -- which is the whole design. */
  const barOf = {}; for(const [bar, lvl, xp, ins] of SMELT_BARS) barOf[bar] = ins;
  o.buyAndProcess = [];
  for(const [out, lvl, bar, n] of SMITH_RECIPES){
    const ins = barOf[bar]; if(!ins) continue;
    let cost = 0, buyable = true;
    for(const [id, q] of ins){ if(!GE_STOCK.includes(id)){ buyable = false; break; } cost += ITEMS[id].val * q; }
    if(!buyable) continue;
    o.buyAndProcess.push({out, profit: sellPrice(out) - cost * n});
  }
  o.buyAndProcessWinners = o.buyAndProcess.filter(r => r.profit > 0);

  /* the mill really converts, and really charges nothing */
  setLevel('woodcutting', 99); setLevel('construction', 99);
  o.live = [];
  for(const [log, plank] of SAWMILL.map(r => [r[0], r[1]])){
    clearInv(); give(log, 4); give('coins', 1000);
    const c0 = countItem('coins'), p0 = countItem(plank);
    let ran = false;
    try{ ran = sawOneBoard(log); }catch(e){ ran = 'threw: ' + String(e.message||e).slice(0,60); }
    o.live.push({plank, ran, spent: c0 - countItem('coins'),
                 made: countItem(plank) - p0, logsLeft: countItem(log)});
  }
  /* and with ZERO coins, since it is free now */
  clearInv(); give('birch_logs', 1);
  o.brokeRan = sawOneBoard('birch_logs');
  o.brokeMade = countItem('birch_plank');
  since();
  return o;
`);

const S = new Suite('milltest');
S.guard(T);

/* ============ THE INVARIANT: he must not sell the input ================== */
S.eq('THE CLERK SELLS NO LOGS', T.stockedLogs, [],
     'a purchasable log + a free mill = ~8M gp/hr of pure clicking, no gathering, no levels');
for(const t of T.tiers)
  S.eq(`  ${t.log} is not in GE_STOCK`, t.clerkSellsLogAt, 0);
S.ok('  but he still BUYS logs, so nothing you chop is stranded',
     T.tiers.every(t => t.clerkPaysLog > 0),
     T.tiers.map(t => `${t.log} ${t.clerkPaysLog}`).join('  '));

/* ================= chopping your own must now PAY ======================== */
S.ok('the mill is free',
     T.tiers.every(t => t.fee === 0), T.tiers.map(t => `${t.plank} ${t.fee}`).join('  '));
for(const t of T.tiers)
  S.ok(`${t.plank}: chop -> saw -> vendor PROFITS`,
       t.chopSawVendor > 0, `+${t.chopSawVendor} a board`);
S.eq('  and the profit is the board\'s full vendor price',
     T.tiers.map(t => t.chopSawVendor), T.tiers.map(t => t.clerkPaysPlank));

/* ========= the game's rule elsewhere, which sawing now matches =========== */
S.eq('NO buy-the-inputs-and-vendor loop pays, anywhere in smithing',
     T.buyAndProcessWinners.map(r => r.out), [],
     `${T.buyAndProcess.length} recipes checked — the clerk sells ore at val and buys the item at 40%`);
S.ok('  which is why sawing is only safe with logs unbuyable',
     T.stockedLogs.length === 0);

/* ========================= the mill still works ========================== */
S.eq('every tier actually sawed', T.live.filter(l => l.ran === true).length, T.tiers.length,
     T.live.map(l => `${l.plank}:${l.ran}`).join('  '));
for(const l of T.live){
  S.eq(`sawing a ${l.plank} costs nothing`, l.spent, 0);
  S.eq(`  and yields one board`, l.made, 1);
  S.eq(`  consuming exactly one log`, l.logsLeft, 3);
}
S.ok('a player with ZERO coins can still mill', T.brokeRan === true && T.brokeMade === 1,
     `ran=${T.brokeRan} made=${T.brokeMade}`);
S.ok('the sawmill converts one board at a time, not the whole pack',
     /ONE BOARD AT A TIME/.test(SRC));
S.ok('the reason logs are unbuyable is recorded where they were removed',
     /THE CLERK DOES NOT SELL LOGS/.test(SRC) && /money printer/.test(SRC));
S.ok('  and the rate comparison is recorded at the table',
     /2\.9M gp\/hr/.test(SRC) && /3\.1M/.test(SRC));

S.report(
  'The mill is free and chopping your own logs pays: +72 / +280 / +960 / +2,800 a board, which is the '
  + 'same bargain smithing makes (gather it yourself and the vendor price is profit; buy the inputs '
  + 'and every one of 55 recipes loses). The clerk sells no logs, which is the only thing making that '
  + 'safe — with one purchasable it would be ~8M gp/hr of clicking.',
  'the gp/hr model itself — node contention with other players, real walking lines and how much of an '
  + 'hour a person actually spends banking are a playtest, not a table.');
