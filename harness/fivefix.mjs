/* ============================================================================
   fivefix — what the upper hires earn their fee with.

   The five hires are not just faster. From the FIFTH FORMER up they un-note;
   from the SIXTH up they also run to the Collect box. Those are the two things
   that make the top tiers worth 4,000 and 9,000 coins a trip rather than 500.

   The rules that have to hold:
     - a hire without the skill says so and charges nothing
     - un-noting costs the same fee as a fetch, and cannot overflow the pack
     - no butler path reaches houseBuild: they fetch, you build

   Run: node harness/fivefix.mjs
   ========================================================================== */
import {runPass, Suite, PRELUDE, SRC} from './_lib.mjs';

const T = runPass(PRELUDE + String.raw`
  setLevel('construction', 99);
  o.tiers = BUTLERS.map(b => ({id: b.id, name: b.name, req: b.req, fee: b.fee,
                               load: b.load, trip: b.trip, unnote: !!b.unnote, ge: !!b.ge}));

  /* put a noted stack somewhere that is NOT the coins slot: give('coins') takes
     the first free slot, and overwriting it leaves the hire unpayable */
  const note = (id, qty) => {
    const i = player.inv.findIndex(s => !s);
    if(i < 0) return -1;
    player.inv[i] = {id, qty, noted: true};
    return i;
  };
  const hire = id => {
    player.house = player.house || {};
    player.house.servant = null;
    clearInv(); give('coins', 20000000);
    freshHouse();
    butlerHire(id);
    since();
    return !!butlerState();
  };

  /* ---- who can un-note ---- */
  o.unnoteResults = {};
  for(const B of BUTLERS){
    hire(B.id);
    clearInv(); give('coins', 20000000);
    note('oak_plank', 20);
    since();
    butlerUnnote();
    const log = since();
    o.unnoteResults[B.id] = {
      allowed: B.unnote,
      refused: log.some(l => /would not know where to start/.test(l)),
      delivered: countItem('oak_plank'),
      said: log[0] || null,
    };
  }

  /* ---- the fifth former: the first tier that CAN ---- */
  hire('fifth');
  clearInv(); give('coins', 20000000);
  note('oak_plank', 20);
  const coins0 = coinsCount();
  since();
  butlerUnnote();
  o.fifth = {
    got: countItem('oak_plank'),
    spent: coins0 - coinsCount(),
    fee: butlerById('fifth').fee,
    load: butlerById('fifth').load,
    said: since()[0] || null,
  };
  o.fifthCappedByLoad = o.fifth.got <= o.fifth.load;

  /* ---- it cannot overflow the pack ---- */
  hire('facbrat');
  clearInv(); give('coins', 20000000);
  note('oak_plank', 200);
  /* fill every other slot */
  for(let i = 2; i < player.inv.length; i++) if(!player.inv[i]) player.inv[i] = {id: 'bones', qty: 1};
  const freeBefore = player.inv.filter(s => !s).length;
  since();
  butlerUnnote();
  o.overflow = {freeBefore, planks: countItem('oak_plank'),
                free: player.inv.filter(s => !s).length, said: since()[0] || null};
  o.noOverflow = o.overflow.free >= 0 && o.overflow.planks <= freeBefore + 1;

  /* ---- no notes at all ---- */
  hire('fifth');
  clearInv(); give('coins', 20000000);
  since();
  butlerUnnote();
  o.noNotesSaid = since()[0] || null;

  /* ---- broke ---- */
  hire('fifth');
  clearInv(); give('coins', 10);
  note('oak_plank', 5);
  since();
  butlerUnnote();
  o.brokeSaid = since()[0] || null;
  o.brokeDelivered = countItem('oak_plank');

  /* ---- the GE run: sixth and up ---- */
  o.collectResults = {};
  for(const B of BUTLERS){
    hire(B.id);
    clearInv(); give('coins', 20000000);
    since();
    if(typeof butlerCollect === 'function') butlerCollect();
    const log = since();
    o.collectResults[B.id] = {allowed: B.ge,
      refused: log.some(l => /not trusted with the market/.test(l)), said: log[0] || null};
  }

  /* ---- level gating on the hire itself ---- */
  o.gateResults = {};
  for(const B of BUTLERS){
    setLevel('construction', Math.max(1, B.req - 1));
    player.house.servant = null;
    clearInv(); give('coins', 20000000);
    since();
    butlerHire(B.id);
    o.gateResults[B.id] = {hired: !!butlerState(), said: since()[0] || null};
  }
  setLevel('construction', 99);

  /* ---- being busy blocks both errands ---- */
  hire('facbrat');
  clearInv(); give('coins', 20000000);
  bank.length = 0; bank.push({id: 'oak_plank', qty: 50});
  butlerFetch('oak_plank');
  o.busy = butlerBusy();
  note('oak_plank', 5);
  since();
  butlerUnnote();
  o.busyUnnoteSaid = since()[0] || null;
  __shim.flushTimers();
  since();

  player.house.servant = null;
  bank.length = 0;
  if(inHouse) exitHouse();
  return o;
`);

const S = new Suite('fivefix').guard(T);
const tiers = T.tiers || [];

S.eq('five hires',                                tiers.length, 5);
S.ok('fees rise with tier',                       tiers.every((b, i) => i === 0 || b.fee > tiers[i-1].fee),
     tiers.map(b => b.fee).join(' < '));
S.ok('loads rise with tier',                      tiers.every((b, i) => i === 0 || b.load > tiers[i-1].load),
     tiers.map(b => b.load).join(' < '));
S.ok('trips get shorter with tier',               tiers.every((b, i) => i === 0 || b.trip < tiers[i-1].trip),
     tiers.map(b => b.trip).join(' > '));

/* the two perks */
const unnoters = tiers.filter(b => b.unnote).map(b => b.id);
const collectors = tiers.filter(b => b.ge).map(b => b.id);
S.eq('UN-NOTING STARTS AT THE FIFTH FORMER',      unnoters, ['fifth', 'sixth', 'facbrat']);
S.eq('THE GE RUN STARTS AT THE SIXTH',            collectors, ['sixth', 'facbrat']);
S.ok('  so the perks nest, never leapfrog',       collectors.every(id => unnoters.includes(id)),
     'a hire trusted with the market must also be trusted with paperwork');

for(const B of tiers){
  const r = T.unnoteResults[B.id];
  if(B.unnote) S.ok(`the ${B.name.toLowerCase()} un-notes`, r.delivered > 0, `${r.delivered} boards: ${r.said}`);
  else S.ok(`the ${B.name.toLowerCase()} refuses paperwork`, r.refused && r.delivered === 0, r.said);
}
for(const B of tiers){
  const r = T.collectResults[B.id];
  if(!B.ge) S.ok(`the ${B.name.toLowerCase()} is not trusted with the market`, r.refused, r.said);
}

/* the fifth former in detail */
S.ok('the fifth former delivers boards',          T.fifth.got > 0, `${T.fifth.got} boards`);
S.eq('  charging one fee',                        T.fifth.spent, T.fifth.fee);
S.ok('  capped by their load',                    T.fifthCappedByLoad,
     `${T.fifth.got} of a ${T.fifth.load} load`);
S.ok('  and saying what came back',               /returns your notes/.test(T.fifth.said || ''), T.fifth.said);

/* edges */
S.ok('A FULL PACK DOES NOT OVERFLOW',             T.noOverflow,
     `${T.overflow.freeBefore} free before, ${T.overflow.planks} boards after, ${T.overflow.free} free now`);
S.ok('no notes says so',                          /carrying no banknotes/.test(T.noNotesSaid || ''), T.noNotesSaid);
S.ok('being broke refuses',                       /cannot cover/.test(T.brokeSaid || ''), T.brokeSaid);
S.eq('  and delivers nothing',                    T.brokeDelivered, 0);
S.ok('being out on an errand blocks paperwork',   T.busy && /already out/.test(T.busyUnnoteSaid || ''),
     T.busyUnnoteSaid);

/* level gating */
for(const B of tiers){
  if(B.req <= 1) continue;
  const g = T.gateResults[B.id];
  S.eq(`Construction ${B.req - 1} cannot hire a ${B.name.toLowerCase()}`, g.hired, false);
  S.ok(`  and is told the level`, new RegExp('Construction ' + B.req).test(g.said || ''), g.said);
}

/* the OSRS line */
S.ok('NO BUTLER PATH REACHES houseBuild',
     !/houseBuild\(/.test(SRC.slice(SRC.indexOf('function butlerHire'), SRC.indexOf('function houseEnterVisit'))),
     'they fetch; you build — that is what keeps Construction a skill');

S.report(
  'The five hires nest their perks: un-noting from the fifth, the market run from the sixth, each gated by level and fee, and none of them can build.',
  'the walk to the door and back, and how a trip feels in play — needs a browser.');
