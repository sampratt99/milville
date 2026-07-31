/* ============================================================================
   sawtest — the White Farm mill (docs/23 §5).

   The mill is a GOLD SINK and a supply step. It pays no experience, deliberately
   — OSRS pays nothing for making planks either, and the xp is in what you build.
   It also converts ONE BOARD AT A TIME through the action system: it used to
   convert your whole pack the instant you clicked, which read as a vending
   machine rather than a skilling action.

   Run: node harness/sawtest.mjs
   ========================================================================== */
import {runPass, Suite, PRELUDE, SRC} from './_lib.mjs';

const T = runPass(PRELUDE + String.raw`
  o.rows = SAWMILL.map(([log, plank, fee]) => ({
    log, plank, fee,
    logName:   ITEMS[log]  ? ITEMS[log].name  : null,
    plankName: ITEMS[plank]? ITEMS[plank].name: null,
    plankValue: ITEMS[plank] ? (ITEMS[plank].val | 0) : null,
    plankStacks: !!(ITEMS[plank] && ITEMS[plank].stack),
    label: PLANK_LABEL[plank] || null,
  }));

  o.rowsFromUi = sawmillRows().map(r => ({log: r.log, pl: r.pl, fee: r.fee}));

  /* xp per plank, for the curve check in xptest — recorded here for the table */
  o.xpPerPlank = {};
  for(const fid in HOUSE_FURNITURE){
    const F = HOUSE_FURNITURE[fid];
    const pid = F.plankId || 'oak_plank';
    if(!(F.planks | 0)) continue;
    const per = (F.xp | 0) / (F.planks | 0);
    (o.xpPerPlank[pid] = o.xpPerPlank[pid] || []).push(per);
  }

  /* ---- one board at a time ---- */
  clearInv();
  give('coins', 100000); give('oak_logs', 6);
  const xp0 = player.skills.construction;
  const c0 = coinsCount();
  o.oneBoard = sawOneBoard('oak_logs');
  o.afterOne = {logs: countItem('oak_logs'), planks: countItem('oak_plank'),
                spent: c0 - coinsCount(), xp: player.skills.construction - xp0};
  since();

  /* ---- a pack FULL of logs still saws: the log is taken first, freeing the
     slot the plank goes into. Testing for a free slot beforehand refused the
     commonest case there is. ---- */
  clearInv();
  give('coins', 100000);
  let n = 0; while(freeSlots() > 0 && n < 40){ if(!give('oak_logs', 1)) break; n++; }
  o.fullPackLogs = countItem('oak_logs');
  o.fullPackFree = freeSlots();
  o.fullPackSawed = sawOneBoard('oak_logs');
  o.fullPackAfter = {logs: countItem('oak_logs'), planks: countItem('oak_plank')};
  since();

  /* ---- sawing the whole load pays nothing ---- */
  clearInv();
  give('coins', 100000); give('logs', 10);
  const xp1 = player.skills.construction;
  let made = 0; while(sawOneBoard('logs')) made++;
  o.wholeLoad = {made, xp: player.skills.construction - xp1, left: countItem('logs')};
  since();

  /* ---- sawLogs() starts an ACTION, it does not convert on the spot ----
     setAction walks to the mill first and clears the action if the walk fails,
     so stand at the mill: this is testing the saw, not the pathfinder. */
  clearInv();
  give('coins', 100000); give('oak_logs', 5);
  cancelAction();
  {
    const mill = objects.find(q => q.def === 'sawmill');
    o.millAt = mill ? {x: mill.x, y: mill.y} : null;
    if(mill){ player.x = mill.x; player.y = mill.y + 1; player.px = player.x; player.py = player.y; }
  }
  const before = countItem('oak_plank');
  sawLogs('oak_logs');
  o.sawLogsMadeInstantly = countItem('oak_plank') - before;
  o.sawLogsSetAction = !!(player.action && player.action.type === 'saw');
  o.sawLogsActionLog = player.action ? player.action.log : null;
  since();

  /* an unknown log is a no-op, not a crash */
  o.unknownLog = sawOneBoard('bronze_bar');
  return o;
`);

const S = new Suite('sawtest').guard(T);
const rows = T.rows || [];

S.eq('four board tiers',                          rows.length, 4);
S.eq('  and the UI lists the same four',          T.rowsFromUi.length, 4);
for(const r of rows){
  S.ok(`${r.log} -> ${r.plank} exists in ITEMS`,  !!r.logName && !!r.plankName,
       `${r.logName} / ${r.plankName}`);
  S.ok(`  ${r.plank} has a timber label`,         !!r.label, String(r.label));
  S.eq(`  ${r.plank} does NOT stack`,             r.plankStacks, false);
}
S.ok('fees rise with tier',
     rows.every((r, k) => k === 0 || r.fee > rows[k - 1].fee),
     rows.map(r => r.fee).join(' < '));
S.ok('board values rise with tier',
     rows.every((r, k) => k === 0 || r.plankValue > rows[k - 1].plankValue),
     rows.map(r => r.plankValue).join(' < '));
S.ok('THE MILL ADDS VALUE — every fee is under the board it makes',
     rows.every(r => r.fee < r.plankValue),
     rows.map(r => `${r.plank}: ${r.fee} < ${r.plankValue}`).join(', '));

/* the headline rule */
S.eq('SAWING ONE BOARD PAYS NO EXPERIENCE',       T.afterOne.xp, 0);
S.eq('sawing a whole load pays no experience',    T.wholeLoad.xp, 0);
S.eq('  and really did convert the load',         T.wholeLoad.made, 10);
S.eq('  leaving no logs',                         T.wholeLoad.left, 0);

S.eq('one board consumes one log',                T.afterOne.logs, 5);
S.eq('  and produces one board',                  T.afterOne.planks, 1);
S.eq('  charging exactly one fee',                T.afterOne.spent, rows[1].fee);

S.ok('A PACK FULL OF LOGS STILL SAWS',            T.fullPackSawed === true,
     `${T.fullPackLogs} logs, ${T.fullPackFree} free slots before the cut`);
S.eq('  the log went out',                        T.fullPackAfter.logs, T.fullPackLogs - 1);
S.eq('  and the board came back',                 T.fullPackAfter.planks, 1);

S.ok('the mill exists in the world',              !!T.millAt,
     T.millAt ? `at ${T.millAt.x},${T.millAt.y}` : 'no sawmill object found');
S.eq('sawLogs() CONVERTS NOTHING ON THE SPOT',    T.sawLogsMadeInstantly, 0);
S.ok('  it starts a repeating action instead',    T.sawLogsSetAction);
S.eq('  on the log you asked for',                T.sawLogsActionLog, 'oak_logs');
S.eq('an unknown log is a no-op',                 T.unknownLog, false);

/* source: the action tick is what repeats it */
S.ok("the action tick drives sawOneBoard",        /a\.type\s*===\s*'saw'/.test(SRC) && SRC.includes('sawOneBoard'));

S.report(
  'The mill converts one board at a time, charges a fee under the board value, and pays no xp.',
  'the mill building, the sawing animation and the sound — those need a browser.');
