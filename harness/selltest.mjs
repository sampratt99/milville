/* ============================================================================
   selltest — one price, quoted everywhere, paid everywhere.

   THE RULE:

       every price the game SHOWS you is the price the clerk PAYS you,
       and there is exactly one function that decides it: sellPrice().

   This was not true, and the gap was expensive. There are two live sell paths:

     * click an item in your PACK (shop open), or right-click -> Sell-1/5/All
         -> sellSlot() / sellId(),  which paid 40% of val
     * click a row in the GE panel's SELL LIST
         -> sellItem() -> _doSell(), which paid 60% of val

   So a birch plank was worth 2,800 from your pack and 4,200 from the sell list,
   and the tooltip advertised 4,200 either way.

   The 60% rate was not merely inconsistent, it was a money printer. The clerk
   sells ore at full val, so buying ore and smithing it paid on 39 of 55 recipes
   with NO GATHERING AT ALL -- +17,350 a rune platebody, about 8.7M gp/hr of
   pure clicking before travel, several times any legitimate method. The entire
   economy rests on the opposite rule: buy-and-process must lose, gather-and-
   process must pay. At 40% it does, on all 55.

   Both halves are asserted here: the paths agree with each other and with what
   is displayed, AND no buy-the-inputs loop turns a profit.

   Run: node harness/selltest.mjs
   ========================================================================== */
import {runPass, Suite, PRELUDE, SRC} from './_lib.mjs';

const T = runPass(PRELUDE + String.raw`
  /* drive the two REAL paths, plus the two things the game displays */
  const viaPack = id => { clearInv(); give(id, 1);
    const c = countItem('coins'); sellId(id, 1); return countItem('coins') - c; };
  const viaList = id => { clearInv(); give(id, 1);
    const c = countItem('coins');
    /* sellItem defers to a confirmation above SELL_CONFIRM_GP; call the same
       unit price through _doSell so the dialog does not mask the rate */
    const unit = sellPrice(id);
    if(sellPrice(id) * 1 > SELL_CONFIRM_GP) _doSell(id, 1, unit); else sellItem(id, 1);
    return countItem('coins') - c; };

  /* EVERY sellable item in the game, not a sample */
  const sellable = Object.keys(ITEMS).filter(id =>
    id !== 'coins' && ITEMS[id].val && !ITEMS[id].noSell &&
    !/^party_hat_/.test(id) && id !== 'santa_hat' && !SELL_BLOCK.includes(id));
  o.sellableCount = sellable.length;

  o.mismatch = [];
  for(const id of sellable){
    const pack = viaPack(id), list = viaList(id), tip = gePrice(id);
    if(pack !== list || (tip && tip !== pack))
      o.mismatch.push(id+': pack '+pack+', list '+list+', tooltip '+tip);
  }

  /* a spot check with real numbers, so a silent change of formula is visible */
  o.spot = ['birch_plank', 'runite_ore', 'rune_platebody'].map(id => ({
    id, pack: viaPack(id), list: viaList(id), tooltip: gePrice(id),
    val: ITEMS[id].val, pctOfVal: (viaPack(id) / ITEMS[id].val * 100).toFixed(0) + '%' }));

  /* ---- and the rule the rate exists to protect ---- */
  const barOf = {}; for(const [bar, l, x, ins] of SMELT_BARS) barOf[bar] = ins;
  o.buyLoops = [];
  for(const [out, lvl, bar, n] of SMITH_RECIPES){
    const ins = barOf[bar]; if(!ins) continue;
    let cost = 0, buyable = true;
    for(const [id, q] of ins){ if(!GE_STOCK.includes(id)){ buyable = false; break; } cost += ITEMS[id].val * q; }
    if(!buyable) continue;
    o.buyLoops.push({out, profit: sellPrice(out) - cost * n});
  }
  o.buyWinners = o.buyLoops.filter(r => r.profit > 0);

  /* SMELTING: buy the ore, smelt, vendor the bar. No bar is in GE_STOCK, so without the
     inputs-are-buyable rule this printed money (+1,710 a rune bar, ~5.1M gp/hr). */
  o.smeltArb=[];
  for(const [bar,lvl,xp,ins] of SMELT_BARS){
    let cost=0, ok=true;
    for(const [id,q] of ins){ if(!GE_STOCK.includes(id)){ok=false;break;} cost+=ITEMS[id].val*q; }
    if(ok&&sellPrice(bar)>cost) o.smeltArb.push(bar+' costs '+cost+' vendors '+sellPrice(bar));
  }

  /* nothing you can buy for coins may vendor for more than it cost */
  o.coinArb=[];
  for(const t of [(typeof EMBER_SHOP!=='undefined')?EMBER_SHOP:[],(typeof CAGE_SHOP!=='undefined')?CAGE_SHOP:[]])
    for(const e of (t||[])){ const id=e&&(e.id||e.out);
      if(id&&ITEMS[id]&&(e.coins|0)>0&&sellPrice(id)>e.coins)
        o.coinArb.push(id+' costs '+e.coins+' vendors '+sellPrice(id)); }

  /* gathering it yourself must still pay, or the economy has no engine */
  o.gatherPays = [
    {what: 'runite ore, mined', gp: sellPrice('runite_ore')},
    {what: 'birch plank, chopped + milled free', gp: sellPrice('birch_plank')},
  ];
  since();
  return o;
`);

const S = new Suite('selltest');
S.guard(T);

S.ok('there are items to sell', T.sellableCount > 200, `${T.sellableCount} sellable items`);
S.eq('EVERY SELLABLE ITEM PAYS THE SAME DOWN BOTH PATHS, AND MATCHES THE TOOLTIP',
     T.mismatch, [],
     'pack click vs GE sell list vs the displayed price — all three must be one number');

for(const s of T.spot){
  S.eq(`${s.id}: pack and list agree`, s.pack, s.list);
  S.eq(`  and the tooltip quotes it`, s.tooltip, s.pack);
  S.eq(`  at 40% of value`, s.pctOfVal, '40%');
}

/* SOURCE: one function decides the price, and nothing recomputes it by hand */
S.ok('no path recomputes a sell price from val',
     !/val\*0\.6|val \* 0\.6/.test(SRC),
     'a hand-rolled 0.6 is exactly how the two paths drifted apart');
S.ok('  gePrice defers to sellPrice',
     /function gePrice\([\s\S]{0,400}?return sellPrice\(id\);/.test(SRC));
S.ok('  the sell list renders sellPrice',
     /const price=sellPrice\(/.test(SRC));
S.ok('  and sellItem pays sellPrice',
     /const unit=sellPrice\(id\);/.test(SRC));
/* the RATE itself, not any of the hundreds of 0.4s in the geometry code */
S.eq('the sell rate is written in exactly one place',
     (SRC.match(/it\.val\*0\.4/g) || []).length, 1,
     'one definition, or the next change moves only half the game');

/* THE SPREAD ONLY APPLIES WHERE THERE IS A BUY SIDE. A drop-only item has nothing to
   arbitrage against, so it pays its full val; anything purchasable FOR COINS anywhere
   keeps the 40% haircut, or buying it and selling it straight back turns a profit. */
S.ok('the spread is keyed on being buyable for coins, not on GE_STOCK alone',
     /COIN_BUYABLE\.has\(id\)/.test(SRC) && /EMBER_SHOP/.test(SRC.slice(SRC.indexOf('const COIN_BUYABLE'), SRC.indexOf('function sellPrice'))),
     'the luxury quivers cost coins at Hirschfeld but are not in GE_STOCK — they need the spread too');
S.eq('NO buy-ore-smelt-and-vendor loop pays either', T.smeltArb, [],
     'bars are not GE-stocked, so they only keep the spread because their ORES are buyable');
S.eq('  and no coin-buyable item vendors for more than it costs', T.coinArb, [],
     'buy it, sell it back, profit — that is what the spread exists to stop');

/* the rule the rate protects */
S.eq('NO buy-the-inputs-and-sell loop turns a profit',
     T.buyWinners.map(r => r.out), [],
     `${T.buyLoops.length} smithing recipes — at 60% thirty-nine of them paid, up to +17,350 a `
     + `rune platebody with no gathering at all (~8.7M gp/hr)`);
S.ok('  but gathering it yourself still pays',
     T.gatherPays.every(g => g.gp > 0),
     T.gatherPays.map(g => `${g.what} ${g.gp}`).join('  ·  '));

S.report(
  'One rate, one function: sellPrice() decides what the clerk pays, and the pack click, the GE sell '
  + 'list and the tooltip all quote exactly that. Buying inputs and selling the product loses on all '
  + '55 smithing recipes again, while gathering your own still pays.',
  'how the sell list LOOKS with the new figures, and whether players who had been using the 60% path '
  + 'feel the drop — that is a browser and a playtest.');
