/* ============================================================================
   annoy — the small bugs a player actually walks into.

   Three unrelated systems, one shared shape: something that LOOKS like it worked.
   None of them throws, none shows up in a stack trace, and all three were found
   by driving the game rather than by reading it.

     1. Pay 30,000 coins for a Party token, receive nothing, and be congratulated.
     2. Die at a bank chest, wake in the town square with the bank still open.
     3. Wear a Lightbearer; everyone else sees an empty hand.

   The generalisable rules, and what this file is really guarding:

     - A PURCHASE HANDS OVER THE GOODS BEFORE IT TAKES THE MONEY. addItem returns
       false when it will not fit, and a stackable only fits when you already hold
       one or have a free slot -- so "it stacks" is not a reason to skip the check.
     - A PANEL FLAG MUST NOT OUTLIVE ITS WORLD. Every path that moves you between
       worlds dismisses the counter panels; death is such a path.
     - A SLOT LIST WRITTEN BY HAND GOES STALE. Anything enumerating equipment must
       agree with EQUIP_LAYOUT.

   Run: node harness/annoy.mjs
   ========================================================================== */
import {runPass, Suite, PRELUDE, SRC} from './_lib.mjs';

const T = runPass(PRELUDE + String.raw`
  /* ================= 1. THE PARTY TOKEN ================= */
  const buyWith = (freeSlots, existingTokens) => {
    clearInv();
    give('coins', 100000);
    if(existingTokens) give('party_token', existingTokens);
    let used = player.inv.filter(s => s).length;
    for(let k = used; k < 28 - freeSlots; k++) give('bronze_sword', 1);
    const before = countItem('coins'), tokBefore = countItem('party_token');
    since();
    buyPartyToken();
    const said = since().join(' ');
    return {spent: before - countItem('coins'), gained: countItem('party_token') - tokBefore,
            said, free: freeSlots};
  };
  o.buyFullPack   = buyWith(0, 0);   /* no room, no stack to merge into: must refuse */
  o.buyWithRoom   = buyWith(3, 0);   /* ordinary case */
  o.buyOntoStack  = buyWith(0, 1);   /* full pack BUT an existing stack: must still work */
  o.buyTooPoor    = (()=>{ clearInv(); give('coins', 100); since(); buyPartyToken();
                           return {said: since().join(' '), spent: 100 - countItem('coins')}; })();

  /* The dialogue option is a second, independent copy of the same purchase. Callahan only offers
     the shop tree above PARTY_MIN_TOTAL (120) AND after the newcomer quiz -- below either he sends
     you away instead of selling. */
  for(const sk of SKILLS) setLevel(sk, 12);
  player.partyQuiz = true;
  o.callahanTotal = totalLevel();
  o.dialogueHasFullBranch = (()=>{ try{ const t = DIALOGUES.mr_callahan(); return !!(t && t.full); }
                                   catch(e){ return 'threw: ' + String(e.message || e).slice(0,60); } })();

  /* ================= 2. PANEL FLAGS ACROSS A WORLD SWAP ================= */
  setLevel('construction', 99); clearInv(); give('coins', 20000000);
  const swap = (name, go, back) => {
    bankOpen = true; shopOpen = true;
    try{ go(); }catch(e){ return name + ' threw: ' + String(e.message || e).slice(0,60); }
    const r = {bank: bankOpen, shop: shopOpen};
    try{ back(); }catch(e){}
    bankOpen = false; shopOpen = false;
    return r;
  };
  o.swapVolcano = swap('volcano', () => enterVolcano(), () => exitVolcano());
  o.swapSos     = swap('sos',     () => enterSos(),     () => exitSos());
  o.swapHouse   = swap('house',   () => freshHouse(),   () => exitHouse());

  /* death is a world swap too, and the one that was missed */
  bankOpen = true; shopOpen = true;
  player.hp = 0;
  try{ die(); o.dieRan = true; }catch(e){ o.dieRan = 'threw: ' + String(e.message || e).slice(0,70); }
  o.afterDeath = {bank: bankOpen, shop: shopOpen};
  bankOpen = false; shopOpen = false;
  since();

  /* ================= 3. WHAT OTHER PLAYERS SEE ================= */
  /* every slot a player can fill, straight from the panel the game draws for you */
  o.realSlots = [];
  for(const row of EQUIP_LAYOUT) for(const sl of row) if(sl && EQUIP_ACTIVE[sl]) o.realSlots.push(sl);
  o.ringItems = Object.keys(ITEMS).filter(id => ITEMS[id].equip && ITEMS[id].equip.slot === 'ring');
  o.petItems  = Object.keys(ITEMS).filter(id => ITEMS[id].equip && ITEMS[id].equip.slot === 'pet');
  /* a ring really does equip and really does pay out its bonuses */
  clearInv(); player.equip = {weapon:null, shield:null, cape:null, ammo:null};
  give('ring_suffering', 1);
  const _bd = eqStat('def'), _bp = eqStat('pray');
  equipFromInv(player.inv.findIndex(s => s && s.id === 'ring_suffering'));
  o.ringWorn = player.equip.ring ? player.equip.ring.id : null;
  o.ringAddsDef = eqStat('def') - _bd;
  o.ringAddsPray = eqStat('pray') - _bp;
  since();
  return o;
`);

const S = new Suite('annoy');
S.guard(T);

/* ======================== 1. the Party token ============================= */
S.eq('A FULL PACK COSTS YOU NOTHING',              T.buyFullPack.spent, 0);
S.eq('  and hands over no token either',           T.buyFullPack.gained, 0);
S.ok('  and says why, in Callahan\'s voice',       /nowhere to put it/i.test(T.buyFullPack.said),
     T.buyFullPack.said);
S.eq('a normal purchase still costs 30,000',       T.buyWithRoom.spent, 30000);
S.eq('  and hands over the token',                 T.buyWithRoom.gained, 1);
S.eq('A FULL PACK IS FINE IF A TOKEN IS ALREADY IN IT', T.buyOntoStack.spent, 30000,
     'a stackable merges into the stack it already has — refusing here would be the opposite bug');
S.eq('  and the stack grows',                      T.buyOntoStack.gained, 1);
S.eq('too poor still costs nothing',               T.buyTooPoor.spent, 0);
S.ok('  and says so',                              /30,000 coins for a token/.test(T.buyTooPoor.said),
     T.buyTooPoor.said);
S.ok('  the harness is past the Party Room gate',  T.callahanTotal >= 120, `total level ${T.callahanTotal}`);
S.eq('the dialogue copy has a full-pack answer',   T.dialogueHasFullBranch, true);
/* SOURCE: neither copy may take the money first */
S.ok('no purchase path spends before it delivers',
     !/spendCoins\(30000\);addItem\('party_token'/.test(SRC),
     'spendCoins then an unchecked addItem is the bug — hand the item over first');
S.eq('  both copies check the insert',
     (SRC.match(/if\(!addItem\('party_token',1\)\)/g) || []).length, 2);

/* ==================== 2. panel flags and world swaps ===================== */
S.eq('entering the volcano dismisses the counters', T.swapVolcano, {bank:false, shop:false});
S.eq('entering the SoS cave dismisses them',        T.swapSos,     {bank:false, shop:false});
S.eq('entering the cottage dismisses them',         T.swapHouse,   {bank:false, shop:false});
S.eq('DEATH DISMISSES THEM TOO',                    T.afterDeath,  {bank:false, shop:false},
     'there is a bank chest inside the First Rector\'s arena — dying at it left the bank open in town');
S.ok('  and death itself still runs',               T.dieRan === true, String(T.dieRan));
/* SOURCE: every world-entering path must carry the pair */
for(const fn of ['die', 'enterVolcano', 'enterSos', '_raidEnterNow', 'exitHouse'])
  S.ok(`${fn}() closes the counter panels`,
       new RegExp(`function ${fn}\\(\\)\\{[\\s\\S]{0,700}?closeBank`).test(SRC));

/* ======================= 3. what other players see ======================= */
S.ok('there are rings to wear',                    T.ringItems.length > 0, T.ringItems.join(', '));
S.eq('a ring really equips',                       T.ringWorn, 'ring_suffering');
S.ok('  and really pays its bonuses',              T.ringAddsDef === 6 && T.ringAddsPray === 4,
     `+${T.ringAddsDef} def, +${T.ringAddsPray} prayer`);
/* SOURCE: the two hand-written examine lists must cover every slot you can fill */
const listOf = re => { const m = re.exec(SRC); return m ? (m[1].match(/'([a-z]+)'/g) || []).map(x => x.replace(/'/g, '')) : null; };
const modalSlots = listOf(/const SLOTS=\[(\[.*?\])\];/s);
const infoSlots  = listOf(/for \(const sl of \[([^\]]*)\]\) \{/);
const missingFrom = list => T.realSlots.filter(sl => !list || list.indexOf(sl) < 0);
S.eq('the examine MODAL shows every slot you can fill',  missingFrom(modalSlots), []);
S.eq('  and examineInfo lists them too',                 missingFrom(infoSlots), []);
S.ok('  and the two agree with each other',
     modalSlots && infoSlots && modalSlots.slice().sort().join() === infoSlots.slice().sort().join(),
     `modal: ${modalSlots} / info: ${infoSlots}`);

S.report(
  'A purchase cannot take your coins without handing over the goods; every world swap including death '
  + 'dismisses the bank and shop panels; and the two examine lists cover every slot the equipment panel '
  + 'itself offers, ring and pet included.',
  'that the Party Room lever, the respawn screen and another player\'s examine window LOOK right — '
  + 'all three are DOM and need a browser.');
