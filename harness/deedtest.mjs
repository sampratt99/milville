/* ============================================================================
   deedtest — the cottage deed (docs/23 §2).

   The deed used to want Woodcutting, Mining, Fishing and Firemaking at 30. It is
   now simply a PRICE: the grind lives in the house itself, not in the ticket to
   it. pohDeedShortfall() returning anything at all would be a regression.

   Run: node harness/deedtest.mjs
   ========================================================================== */
import {runPass, Suite, PRELUDE} from './_lib.mjs';

const T = runPass(PRELUDE + String.raw`
  o.price = POH_DEED_PRICE;
  o.item = ITEMS.house_deed ? {
    name: ITEMS.house_deed.name, cat: ITEMS.house_deed.cat,
    noTrade: !!ITEMS.house_deed.noTrade, noSell: !!ITEMS.house_deed.noSell,
    noAlch: !!ITEMS.house_deed.noAlch, val: ITEMS.house_deed.val | 0,
  } : null;

  const bohan = NPCS.find(n => n.id === 'bohan');
  o.bohan = bohan ? {x: bohan.x, y: bohan.y, name: bohan.name} : null;
  o.WX = WX;

  /* THE GATE IS GONE — at every level, including a brand-new character */
  o.shortfallAtLevel1 = pohDeedShortfall();
  for(const sk of SKILLS) setLevel(sk, 1);
  o.shortfallFresh = pohDeedShortfall();

  /* --- broke --- */
  clearInv(); player.house = null;
  give('coins', POH_DEED_PRICE - 1);
  bohanBuyDeed();
  o.brokeOwned = pohOwned();
  o.brokeDeed = countItem('house_deed');
  o.brokeCoins = coinsCount();
  o.saidBroke = said(/coins for the deed/i);
  since();

  /* --- a full pack has nowhere to put it --- */
  clearInv();
  give('coins', POH_DEED_PRICE * 2);
  while(freeSlots() > 0) if(!give('oak_plank', 1)) break;
  o.packFull = freeSlots() === 0;
  const cFull = coinsCount();
  bohanBuyDeed();
  o.fullOwned = pohOwned();
  o.fullCharged = cFull - coinsCount();
  o.saidFull = said(/pack is full/i);
  since();

  /* --- exact money, empty pack --- */
  clearInv(); player.house = null;
  give('coins', POH_DEED_PRICE);
  bohanBuyDeed();
  o.bought = pohOwned();
  o.deedInPack = countItem('house_deed');
  o.coinsAfter = coinsCount();
  o.repairAfter = pohStage();
  o.saidSealed = said(/seal into the wax|hands you the deed/i);
  since();

  /* --- buying twice --- */
  give('coins', POH_DEED_PRICE);
  const c2 = coinsCount();
  bohanBuyDeed();
  o.secondCharged = c2 - coinsCount();
  o.secondDeeds = countItem('house_deed');
  o.saidAlready = said(/already hold that deed/i);
  since();

  /* --- the dialogue really does route to the purchase --- */
  o.hasBohanDialogue = typeof DIALOGUES.bohan === 'function';
  o.dlgSrc = o.hasBohanDialogue ? String(DIALOGUES.bohan) : '';

  return o;
`);

const S = new Suite('deedtest').guard(T);

S.eq('the deed costs 50,000',                     T.price, 50000);
S.ok('the deed item exists',                      !!T.item);
S.eq('  it is a Quest item',                      T.item.cat, 'Quest');
S.ok('  untradeable, unsellable, unalchable',     T.item.noTrade && T.item.noSell && T.item.noAlch);
S.eq('  and worth nothing to a shop',             T.item.val, 0);

S.ok('Mr. Bohan is standing there',               !!T.bohan, T.bohan ? `${T.bohan.name} at ${T.bohan.x},${T.bohan.y}` : '');
S.eq('  at runtime (229,110)',                    JSON.stringify({x: T.bohan.x + T.WX, y: T.bohan.y}),
     JSON.stringify({x: 229, y: 110}));

S.eq('THE DEED HAS NO SKILL GATE',                T.shortfallAtLevel1.length, 0);
S.eq('  not even for a level-1 character',        T.shortfallFresh.length, 0);

S.eq('one coin short buys nothing',               T.brokeOwned, false);
S.eq('  no deed',                                 T.brokeDeed, 0);
S.eq('  and no coins taken',                      T.brokeCoins, T.price - 1);
S.ok('  and says so',                             T.saidBroke);

S.ok('the full-pack case really had a full pack', T.packFull);
S.eq('a full pack buys nothing',                  T.fullOwned, false);
S.eq('  AND IS NOT CHARGED',                      T.fullCharged, 0);
S.ok('  and says so',                             T.saidFull);

S.eq('exact money buys the deed',                 T.bought, true);
S.eq('  one deed in the pack',                    T.deedInPack, 1);
S.eq('  paying the whole price',                  T.coinsAfter, 0);
S.eq('  and the cottage starts unrepaired',       T.repairAfter, 0);
S.ok('  and Bohan says his line',                 T.saidSealed);

S.eq('buying twice charges nothing',              T.secondCharged, 0);
S.eq('  and hands out no second deed',            T.secondDeeds, 1);
S.ok('  saying you already hold it',              T.saidAlready);

S.ok('Bohan has a dialogue tree',                 T.hasBohanDialogue);
S.ok('  which routes to bohanBuyDeed()',          T.dlgSrc.includes('bohanBuyDeed'));
S.ok('  quoting POH_DEED_PRICE rather than a hard-coded number',
     T.dlgSrc.includes('POH_DEED_PRICE'),
     'the price in the dialogue could drift from the price actually charged');

S.report(
  'The deed is a pure 50,000 coin purchase with no skill gate, and refuses cleanly when broke or full.',
  'Bohan standing in the right spot on screen, and his dialogue reading well.');
