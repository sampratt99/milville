/* ============================================================================
   butlertest — the five hires (docs/23 §7).

   The problem they solve is concrete: a maxed house wants ~180 boards and your
   pack holds 28. So they fetch FROM THE BANK, never from the pack — and they
   NEVER build, which is the OSRS line and what keeps Construction a skill.

   Trip times are benchmarked against walking. The nearest bank chest is ~50
   tiles from the cottage door, about 33 seconds round trip for up to 28 boards
   (~51 boards/min). NEVER SET A TRIP LONGER THAN THE WALK IT REPLACES.

   Run: node harness/butlertest.mjs
   ========================================================================== */
import {runPass, Suite, PRELUDE, SRC} from './_lib.mjs';

const WALK_SECONDS = 33;      /* the benchmark the table is tuned against */
const WALK_BOARDS  = 28;      /* one pack */

const T = runPass(PRELUDE + String.raw`
  o.tiers = BUTLERS.map(B => ({
    id: B.id, name: B.name, req: B.req, fee: B.fee, load: B.load,
    tripMs: B.trip, unnote: !!B.unnote, ge: !!B.ge, hasExamine: !!B.ex,
    perMin: +( (B.load / (B.trip / 1000)) * 60 ).toFixed(1),
  }));

  freshHouse();

  /* --- hiring is gated on level and on the fee --- */
  o.hire = [];
  for(const B of BUTLERS){
    /* the third former wants Construction 1, so there is no under-level case */
    const rec = {id: B.id, levelGated: B.req > 1};

    if(rec.levelGated){
      clearInv(); player.house.servant = null;
      setLevel('construction', B.req - 1);
      give('coins', B.fee * 10);
      butlerHire(B.id);
      rec.underLevel = !!butlerHired();
      rec.saidLevel = said(new RegExp('need Construction ' + B.req, 'i'));
      since();
    }

    clearInv(); player.house.servant = null;
    setLevel('construction', B.req);
    give('coins', Math.max(0, B.fee - 1));
    butlerHire(B.id);
    rec.cannotPay = !!butlerHired();
    since();

    clearInv(); player.house.servant = null;
    setLevel('construction', B.req);
    give('coins', B.fee * 10);
    butlerHire(B.id);
    rec.hired = butlerHired() ? butlerHired().id : null;
    rec.hireCharged = false;   /* hiring is free; the FEE is per trip */
    since();

    o.hire.push(rec);
  }

  /* --- a guest cannot hire your staff --- */
  houseVisit = {uid: 'bob', name: 'Bob', rooms: {}, slots: {}};
  player.house.servant = null;
  setLevel('construction', 99); clearInv(); give('coins', 100000);
  butlerHire('third');
  o.guestHired = !!(player.house && player.house.servant);
  o.saidNotYours = said(/not your cottage/i);
  since();
  houseVisit = null;

  /* --- the errand: coins from the pack, boards from the BANK --- */
  o.fetch = [];
  for(const B of BUTLERS){
    setLevel('construction', B.req);
    clearInv(); give('coins', B.fee * 4);
    player.house.servant = {tier: B.id, hiredAt: 0, tripEndsAt: 0, pending: null};

    bank.length = 0;
    bank.push({id: 'oak_plank', qty: 200});
    const packBefore = countItem('oak_plank');
    const coinsBefore = coinsCount();
    __shim.timers.length = 0;
    butlerFetch('oak_plank');

    const rec = {id: B.id,
      fee: coinsBefore - coinsCount(),
      busy: butlerBusy(),
      pending: player.house.servant.pending ? player.house.servant.pending.n : null,
      timers: __shim.timers.length,
      packUntouchedDuringTrip: countItem('oak_plank') === packBefore};

    /* pin the third former's 1-in-12 fumble so the suite cannot flake */
    const _r = Math.random; Math.random = () => 0.99;
    __shim.flushTimers();
    Math.random = _r;

    rec.delivered = countItem('oak_plank');
    rec.bankLeft = bank.filter(b => b.id === 'oak_plank').reduce((n, b) => n + (b.qty || 0), 0);
    rec.freeAfter = !butlerBusy();
    o.fetch.push(rec);
    since();
  }

  /* --- the bank runs dry: they bring what is there, not what was asked --- */
  setLevel('construction', 80);
  clearInv(); give('coins', 100000);
  player.house.servant = {tier: 'facbrat', hiredAt: 0, tripEndsAt: 0, pending: null};
  bank.length = 0; bank.push({id: 'oak_plank', qty: 5});
  __shim.timers.length = 0;
  butlerFetch('oak_plank');
  o.partialAsked = player.house.servant.pending.n;
  __shim.flushTimers();
  o.partialGot = countItem('oak_plank');
  o.partialBankLeft = bank.filter(b => b.id === 'oak_plank').length;
  since();

  /* --- sending them out twice --- */
  bank.length = 0; bank.push({id: 'oak_plank', qty: 100});
  clearInv(); give('coins', 100000);
  player.house.servant.tripEndsAt = 0; player.house.servant.pending = null;
  __shim.timers.length = 0;
  butlerFetch('oak_plank');
  const midCoins = coinsCount();
  butlerFetch('oak_plank');            /* they are already out */
  o.doubleSendCharged = midCoins - coinsCount();
  o.saidAlreadyOut = said(/already out/i);
  __shim.flushTimers();
  since();

  /* --- dismissing --- */
  butlerDismiss();
  o.afterDismiss = butlerHired();
  o.fetchWithNobody = (butlerFetch('oak_plank'), said(/nobody to send/i));
  since();

  /* --- un-noting is a perk of the upper tiers only --- */
  clearInv(); give('coins', 100000);
  setLevel('construction', 1);
  player.house.servant = {tier: 'third', hiredAt: 0, tripEndsAt: 0, pending: null};
  butlerUnnote();
  o.lowTierUnnote = said(/would not know where to start/i);
  since();

  if(inHouse) exitHouse();
  /* ---- un-noting in depth (moved from fivefix) ---- */
  const _note = (id, qty) => {   /* never clobber the coins slot */
    const i = player.inv.findIndex(s => !s);
    if(i < 0) return -1;
    player.inv[i] = {id, qty, noted: true};
    return i;
  };
  const _hire = id => {
    setLevel('construction', 99);          /* every tier is level-gated; hire() silently refuses without this */
    houseVisit = null;
    player.house = player.house || {}; player.house.servant = null;
    clearInv(); give('coins', 20000000);
    butlerHire(id); since();
    return !!butlerState();
  };

  o.hiredOk = _hire('fifth');
  clearInv(); give('coins', 20000000); _note('oak_plank', 20);
  {
    const c0 = coinsCount();
    since(); butlerUnnote();
    o.unnoteGot = countItem('oak_plank');
    o.unnoteSpent = c0 - coinsCount();
    o.unnoteFee = butlerById('fifth').fee;
    o.unnoteLoad = butlerById('fifth').load;
    since();
  }

  _hire('facbrat');
  clearInv(); give('coins', 20000000); _note('oak_plank', 200);
  for(let i = 2; i < player.inv.length; i++) if(!player.inv[i]) player.inv[i] = {id: 'bones', qty: 1};
  o.overflowFreeBefore = player.inv.filter(s => !s).length;
  since(); butlerUnnote();
  o.overflowPlanks = countItem('oak_plank');
  o.noOverflow = o.overflowPlanks <= o.overflowFreeBefore + 1;
  since();

  _hire('fifth');
  clearInv(); give('coins', 20000000);
  since(); butlerUnnote(); o.noNotesSaid = since()[0] || null;

  _hire('fifth');
  clearInv(); give('coins', 10); _note('oak_plank', 5);
  since(); butlerUnnote(); o.brokeSaid = since()[0] || null;

  _hire('facbrat');
  clearInv(); give('coins', 20000000);
  bank.length = 0; bank.push({id: 'oak_plank', qty: 50});
  butlerFetch('oak_plank');
  _note('oak_plank', 5);
  since(); butlerUnnote(); o.busyUnnoteSaid = since()[0] || null;
  __shim.flushTimers(); since();

  o.geRefusedFor = [];
  for(const B of BUTLERS){
    _hire(B.id);
    since();
    if(typeof butlerCollect === 'function') butlerCollect();
    if(since().some(l => /not trusted with the market/.test(l))) o.geRefusedFor.push(B.id);
  }
  player.house.servant = null; bank.length = 0;

  return o;
`);

const S = new Suite('butlertest').guard(T);
const tiers = T.tiers;

S.eq('five hires',                                tiers.length, 5);
S.eq('  at Construction 1 / 20 / 40 / 60 / 80',   tiers.map(t => t.req).join('/'), '1/20/40/60/80');
S.eq('  fees 500 / 1,500 / 4,000 / 9,000 / 25,000', tiers.map(t => t.fee).join('/'), '500/1500/4000/9000/25000');
S.eq('  loads 6 / 10 / 16 / 20 / 24',             tiers.map(t => t.load).join('/'), '6/10/16/20/24');
S.ok('every hire has an examine line',            tiers.every(t => t.hasExamine));
S.ok('level requirements rise',                   tiers.every((t, k) => k === 0 || t.req > tiers[k - 1].req));
S.ok('fees rise',                                 tiers.every((t, k) => k === 0 || t.fee > tiers[k - 1].fee));
S.ok('loads rise',                                tiers.every((t, k) => k === 0 || t.load > tiers[k - 1].load));
S.ok('trips get shorter',                         tiers.every((t, k) => k === 0 || t.tripMs < tiers[k - 1].tripMs));
S.eq('only the top three un-note',                tiers.filter(t => t.unnote).map(t => t.id).join(','), 'fifth,sixth,facbrat');
S.eq('only the top two run to the Collect box',   tiers.filter(t => t.ge).map(t => t.id).join(','), 'sixth,facbrat');

/* the benchmark that stops a hire being worse than your own legs */
const walkRate = +((WALK_BOARDS / WALK_SECONDS) * 60).toFixed(1);
S.note(`walking is ~${walkRate} boards/min (${WALK_BOARDS} boards per ${WALK_SECONDS}s round trip)`);
for(const t of tiers)
  S.ok(`${t.name}: trip is shorter than the walk it replaces`,
       t.tripMs / 1000 < WALK_SECONDS, `${t.tripMs / 1000}s vs ${WALK_SECONDS}s`);
S.ok('the two cheap hires roughly match walking',
     tiers.slice(0, 2).every(t => t.perMin >= walkRate * 0.45),
     tiers.slice(0, 2).map(t => `${t.id}=${t.perMin}/min`).join(', '));
S.ok('THE TOP THREE ARE A REAL UPGRADE ON WALKING',
     tiers.slice(2).every(t => t.perMin > walkRate),
     tiers.slice(2).map(t => `${t.id}=${t.perMin}/min vs ${walkRate}`).join(', '));
S.ok('throughput rises monotonically',            tiers.every((t, k) => k === 0 || t.perMin > tiers[k - 1].perMin),
     tiers.map(t => t.perMin).join(' < '));

/* hiring */
for(const h of T.hire){
  if(h.levelGated){
    S.eq(`${h.id}: under-level cannot be hired`,  h.underLevel, false);
    S.ok(`  and is told the level`,               h.saidLevel);
  }
  S.eq(`${h.id}: cannot be hired without the fee`, h.cannotPay, false);
  S.eq(`  hires when both are met`,               h.hired, h.id);
}
S.eq('A GUEST CANNOT HIRE YOUR STAFF',            T.guestHired, false);
S.ok('  and is told whose cottage it is',         T.saidNotYours);

/* the errand */
for(const f of T.fetch){
  const t = tiers.find(x => x.id === f.id);
  S.eq(`${f.id}: charged the fee up front`,       f.fee, t.fee);
  S.ok(`  and is out`,                            f.busy);
  S.eq(`  carrying a full load`,                  f.pending, t.load);
  S.eq(`  THE TRIP IS DEFERRED, not instant`,     f.timers, 1);
  S.ok(`  nothing appears mid-trip`,              f.packUntouchedDuringTrip);
  S.eq(`  returns with the load`,                 f.delivered, t.load);
  S.eq(`  TAKEN FROM THE BANK`,                   f.bankLeft, 200 - t.load);
  S.ok(`  and is free again`,                     f.freeAfter);
}

S.eq('a thin bank sends them for what is there', T.partialAsked, 5);
S.eq('  and they bring all of it',               T.partialGot, 5);
S.eq('  emptying the bank entry',                T.partialBankLeft, 0);
S.eq('sending them out twice charges once',      T.doubleSendCharged, 0);
S.ok('  saying they are already out',            T.saidAlreadyOut);
S.eq('dismissing lets them go',                  T.afterDismiss, null);
S.ok('  and then there is nobody to send',       T.fetchWithNobody);
S.ok('a low tier will not do paperwork',         T.lowTierUnnote);

/* ---- un-noting in depth (moved here when fivefix was rescoped to the five-bug
   batch; these were its only assertions not already covered above) ---- */
S.ok('the hire actually took the job',            T.hiredOk,
     'without this every check below would pass on "You have nobody to send"');
S.ok('the fifth former actually delivers boards', T.unnoteGot > 0, `${T.unnoteGot} boards`);
S.eq('  charging one fee',                        T.unnoteSpent, T.unnoteFee);
S.ok('  capped by their load',                    T.unnoteGot <= T.unnoteLoad,
     `${T.unnoteGot} of a ${T.unnoteLoad} load`);
S.ok('A FULL PACK DOES NOT OVERFLOW',             T.noOverflow,
     `${T.overflowFreeBefore} free before, ${T.overflowPlanks} boards after`);
S.ok('carrying no notes says so',                 /carrying no banknotes/.test(T.noNotesSaid || ''), T.noNotesSaid);
S.ok('being broke refuses',                       /cannot cover/.test(T.brokeSaid || ''), T.brokeSaid);
S.ok('being out on an errand blocks paperwork',   /already out/.test(T.busyUnnoteSaid || ''), T.busyUnnoteSaid);
/* ge:true is the sixth former and the fac brat — so the lower THREE are refused,
   and un-noting (fifth up) opens one tier earlier than the market run */
S.eq('the lower three are refused the market run',
     T.geRefusedFor.join(','), 'third,fourth,fifth');
S.ok('  so the market run opens one tier ABOVE un-noting',
     T.tiers.filter(t => t.ge).length === 2 && T.tiers.filter(t => t.unnote).length === 3,
     `${T.tiers.filter(t => t.unnote).length} un-note, ${T.tiers.filter(t => t.ge).length} run the market`);

/* the line that keeps Construction a skill */
S.ok('NO BUTLER PATH REACHES houseBuild',
     !/function butler[\s\S]*?houseBuild\s*\(/.test(
       SRC.slice(SRC.indexOf('function butlerById'), SRC.indexOf('function houseEnterVisit'))),
     'a butler function references houseBuild — they fetch, you build');

S.report(
  'Five hires, gated on level and fee, fetching from the bank only, every trip faster than walking.',
  "the butler models, their walk to the door, and how the staff panel reads — those need a browser.");
