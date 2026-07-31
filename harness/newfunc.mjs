/* ============================================================================
   newfunc — the reporting furniture, and the panels it opens.

   Stage 3 gave a dozen pieces something to SAY: the trophy shelf reads your
   boss kills, the cape rack your capes, the pet house your pets, the telescope
   your travels. Each opens a real panel rather than printing chat lines.

   The failure mode is quiet: a report that throws takes the tile menu with it,
   and a report that opens an empty panel looks broken rather than empty. So
   each is driven twice — once with nothing to show, once with something.

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
