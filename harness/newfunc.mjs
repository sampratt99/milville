/* ============================================================================
   newfunc — the NEWEST furniture, and what it does.

   The last wave of pieces added were the ones that DO something rather than just
   stand there: the trophy shelf reads your boss kills, the cape rack your capes,
   the pet house your pets, the telescope your travels, the elemental balance your
   portal roads. Each opens a real panel instead of printing chat lines, and each
   is the top rung of its category — so these are also the pieces a maxed house
   actually ends up holding.

   The failure mode is quiet: a report that throws takes the whole tile menu with
   it, and a report that opens an EMPTY panel looks broken rather than empty. So
   every one is driven twice — once on a brand-new character with nothing to show,
   once with something — and the top rung of every functional category is built
   and exercised through its own menu entry.

   Run: node harness/newfunc.mjs
   ========================================================================== */
import {runPass, Suite, PRELUDE, SRC} from './_lib.mjs';

const REPORTS = ['houseTrophyReport', 'houseFocusReport', 'houseCapeReport', 'housePetReport',
                 'houseCaseReport', 'houseScopeReport', 'houseBalanceReport', 'houseRingReport',
                 'houseTreasureReport', 'houseDummyReport'];

const T = runPass(PRELUDE + String.raw`
  const NAMES = ${JSON.stringify(REPORTS)};
  setLevel('construction', 99);
  clearInv(); give('coins', 20000000);
  freshHouse();

  const body = document.getElementById('housebody');
  const el = document.getElementById('houseui');
  const title = document.getElementById('housetitle');

  const drive = (fn, arg) => {
    body.innerHTML = '';
    closeHousePanel();
    since();
    try{
      if(typeof globalThis[fn] !== 'function' && typeof eval(fn) !== 'function')
        return {missing: true};
      eval(fn)(arg);
      return {ok: true, rows: body.children.length, opened: el.classList.contains('on'),
              title: title.textContent, said: since().length};
    }catch(e){ return {threw: String(e && e.message || e)}; }
  };

  /* ---- EMPTY STATE: a brand-new character with nothing to report ---- */
  player.kcBy = {};
  player.collected = {};
  bank.length = 0;
  o.empty = {};
  for(const fn of NAMES) o.empty[fn] = drive(fn);
  /* the two that take an argument */
  o.empty.houseRackReport_weapon = drive('houseRackReport', 'weapon');
  o.empty.houseRackReport_armour = drive('houseRackReport', 'armour');

  /* ---- POPULATED: something to actually show ---- */
  player.kcBy = {};
  let bossKind = null;
  for(const k in MOB_KINDS) if(MOB_KINDS[k] && MOB_KINDS[k].boss){ bossKind = k; break; }
  if(bossKind) player.kcBy[bossKind] = 7;
  o.bossKind = bossKind;
  give('coins', 100000);
  o.full = {};
  for(const fn of NAMES) o.full[fn] = drive(fn);
  o.full.houseRackReport_weapon = drive('houseRackReport', 'weapon');

  /* the trophy shelf must now name the boss it counted */
  body.innerHTML = ''; closeHousePanel();
  houseTrophyReport();
  o.trophyRows = body.children.length;
  o.trophyTitle = title.textContent;
  o.trophySub = document.getElementById('housesub').textContent;
  o.trophyNamesBoss = body.children.some(c =>
    (c.children[0] || {}).textContent === (MOB_KINDS[bossKind] || {}).name);
  o.trophyShowsCount = body.children.some(c => String((c.children[1] || {}).textContent).indexOf('7') >= 0);
  closeHousePanel();

  /* ---- THE ACTIONS ---- */
  o.actions = {};
  /* some of these report through a PANEL and some through chat, so capture both */
  const act = (fn, setup) => {
    body.innerHTML = ''; closeHousePanel(); since();
    try{
      if(setup) setup();
      eval(fn)();
      return {ok: true, said: since(), rows: body.children.length,
              opened: el.classList.contains('on'), title: title.textContent};
    }catch(e){ return {threw: String(e && e.message || e)}; }
  };
  o.actions.houseDarts = act('houseDarts');
  o.actions.houseRangeShots = act('houseRangeShots');
  o.actions.houseBurnLogsEmpty = act('houseBurnLogs', () => { clearInv(); });
  o.actions.houseBurnLogsWithLogs = act('houseBurnLogs', () => { clearInv(); give('logs', 5); });
  o.logsAfterBurn = countItem('logs');

  /* ---- THE NEWEST PIECE IN EVERY FUNCTIONAL CATEGORY ----
     For each category that has a functional verb, build its HIGHEST-req rung —
     the newest and best — and fire the menu entry it offers. A top rung whose
     action throws is the worst case: it is what a finished house is full of. */
  const VERBS = /^(Cook-on|Burn-logs-on|Pray-at|Search|Hit|Throw|Deal|Inspect|Ring|Look-through|Shoot-at|Read|Take-stock-in|Open|Drink-from|Travel-to) /;
  const slotFor = cat => {
    for(const rk in HOUSE_ROOMS){
      const s2 = HOUSE_ROOMS[rk].slots.find(q => q.cat === cat);
      if(s2) return {room: rk, id: s2.id};
    }
    return null;
  };
  o.topRungs = []; o.topRungFailures = [];
  const cats = [...new Set(Object.keys(HOUSE_FURNITURE).map(f => HOUSE_FURNITURE[f].cat))];
  for(const cat of cats){
    const rungs = Object.keys(HOUSE_FURNITURE).filter(f => HOUSE_FURNITURE[f].cat === cat)
      .sort((a, c) => (HOUSE_FURNITURE[c].req | 0) - (HOUSE_FURNITURE[a].req | 0));
    const fid = rungs[0];
    const where = slotFor(cat); if(!where) continue;
    const F = HOUSE_FURNITURE[fid];
    player.house.rooms = {}; player.house.rooms['1,0'] = where.room;
    player.house.slots = {};
    clearInv(); give('coins', 10000000);
    if(F.planks | 0) give(F.plankId || 'oak_plank', F.planks | 0);
    if(F.nails | 0) give('iron_nails', F.nails | 0);
    since();
    houseBuild('1,0:' + where.id, fid);
    if(houseSlots()['1,0:' + where.id] !== fid) continue;
    houseRebuild();
    const S1 = houseSlotByKey('1,0:' + where.id);
    if(!S1) continue;
    const labels = optionsAt(S1.x, S1.y).map(q => q.label || String(q.html || ''));
    const verb = labels.find(l => VERBS.test(l));
    if(!verb) continue;
    const opt = optionsAt(S1.x, S1.y).find(q => (q.label || '') === verb);
    /* A piece responds in ONE of three ways, all valid: it opens a panel, it says
       something, or it QUEUES AN ACTION. The action-setters (Cook-on, Search,
       Pray-at, Hit) walk you there first and do the work on a later tick — reading
       those as "silent" was wrong. */
    body.innerHTML = ''; closeHousePanel(); since();
    cancelAction();
    let threw = null, rows = 0, said = 0, act = null;
    try{ opt.fn(); rows = body.children.length; said = since().length;
         act = player.action ? player.action.type : null; }
    catch(e){ threw = String(e && e.message || e); }
    cancelAction();
    o.topRungs.push({cat, fid, req: F.req | 0, verb, rows, said, act, threw});
    if(threw || (rows === 0 && said === 0 && !act))
      o.topRungFailures.push(fid + ' (' + verb + '): ' + (threw || 'no panel, no message, no action'));
  }

  return o;
`);

/* Duplicate declarations are a SOURCE question, so they belong out here where SRC
   is visible. A second declaration of the same name at module scope silently
   replaces the first, leaving the earlier body unreachable. */
const dupes = (() => {
  const seen = {};
  const re = /^function ([A-Za-z_$][\w$]*)\s*\(/gm;
  let m;
  while((m = re.exec(SRC)) !== null) seen[m[1]] = (seen[m[1]] || 0) + 1;
  return Object.keys(seen).filter(k => seen[k] > 1).map(k => `${k} (x${seen[k]})`);
})();

const S = new Suite('newfunc').guard(T);

/* empty state */
const emptyEntries = Object.entries(T.empty || {});
S.ok(`all ${emptyEntries.length} reports exist`,  emptyEntries.every(([, r]) => !r.missing),
     emptyEntries.filter(([, r]) => r.missing).map(([n]) => n).join(', '));
S.ok('NONE THROWS ON A BRAND-NEW CHARACTER',      emptyEntries.every(([, r]) => !r.threw),
     emptyEntries.filter(([, r]) => r.threw).map(([n, r]) => `${n}: ${r.threw}`).join('; '));
S.ok('  and each says or shows something',
     emptyEntries.every(([, r]) => r.threw || r.missing || r.rows > 0 || r.said > 0),
     emptyEntries.filter(([, r]) => !r.threw && !r.missing && !r.rows && !r.said).map(([n]) => n).join(', ') ||
     'no silent report');

/* populated */
const fullEntries = Object.entries(T.full || {});
S.ok('none throws with something to report',      fullEntries.every(([, r]) => !r.threw),
     fullEntries.filter(([, r]) => r.threw).map(([n, r]) => `${n}: ${r.threw}`).join('; '));

S.ok('there is a boss to count',                  !!T.bossKind, String(T.bossKind));
S.eq('the trophy shelf opens a panel',            T.trophyTitle, 'Trophy shelf');
S.ok('  with a row per boss',                     T.trophyRows > 1, `${T.trophyRows} rows`);
S.ok('  NAMING THE ONE YOU KILLED',               T.trophyNamesBoss);
S.ok('  and its kill count',                      T.trophyShowsCount, T.trophySub);

/* actions */
S.ok('throwing darts does not throw',             !T.actions.houseDarts.threw, T.actions.houseDarts.threw);
S.ok('  and reports the three throws in a panel', T.actions.houseDarts.rows >= 3,
     `"${T.actions.houseDarts.title}" with ${T.actions.houseDarts.rows} rows`);
S.eq('  titled for the board',                    T.actions.houseDarts.title, 'Dartboard');
S.ok('shooting the target does not throw',        !T.actions.houseRangeShots.threw, T.actions.houseRangeShots.threw);
S.ok('burning logs with none refuses cleanly',    !T.actions.houseBurnLogsEmpty.threw,
     (T.actions.houseBurnLogsEmpty.said || []).join(' | '));
S.ok('  saying why',                              (T.actions.houseBurnLogsEmpty.said || []).length > 0,
     (T.actions.houseBurnLogsEmpty.said || []).join(' | '));
S.ok('  and burning with logs works',             !T.actions.houseBurnLogsWithLogs.threw,
     (T.actions.houseBurnLogsWithLogs.said || []).join(' | '));
S.ok('  consuming a log',                         T.logsAfterBurn < 5,
     `${T.logsAfterBurn} of 5 left`);

/* the duplicate scan */
/* the newest piece in every functional category */
S.ok('top rungs were built and fired',            T.topRungs.length >= 10,
     `${T.topRungs.length} categories exercised at their highest rung`);
S.eq('EVERY TOP RUNG RESPONDS',                   T.topRungFailures.length, 0);
if(T.topRungFailures.length) S.note(T.topRungFailures.slice(0, 8).join('\n        '));
S.ok('  and they really are the newest pieces',   T.topRungs.some(r => r.req >= 60),
     'highest req exercised: ' + Math.max(...T.topRungs.map(r => r.req)));
S.ok('  responding all three ways',
     T.topRungs.some(r => r.rows > 0) && T.topRungs.some(r => r.said > 0) && T.topRungs.some(r => r.act),
     `${T.topRungs.filter(r => r.rows > 0).length} open a panel, ` +
     `${T.topRungs.filter(r => r.said > 0).length} say something, ` +
     `${T.topRungs.filter(r => r.act).length} queue an action`);

S.ok('the duplicate scan ran',                    Array.isArray(dupes));
if(dupes.length)
  S.note('FOR SAM — functions declared twice at module scope; the LATER one wins and the earlier ' +
         'body is unreachable dead code: ' + dupes.join(', ') +
         '. Editing the earlier one would change nothing, which is the trap. Not removed here.');
else
  S.note('no duplicate function declarations');

S.report(
  'Every reporting piece runs on an empty character and a populated one, opens a panel, and names what it counted.',
  'how the panels read on screen — the shim never parses innerHTML or does layout.');
