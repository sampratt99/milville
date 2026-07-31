/* ============================================================================
   darylitest — Daryl, the sawyer at White Farm, and what he tells you.

   Daryl runs the blade. His dialogue is the ONLY in-game explanation of the
   whole Construction entry path — what planks are for, where logs come from,
   what the mill charges, and that Mr. Bohan holds the deed. If a branch of it
   goes stale or unreachable, a new player has nowhere to learn any of it.

   The tree is built fresh on every open from live state (what you are carrying,
   whether you own the cottage), so it can drift from SAWMILL and POH_DEED_PRICE
   without anyone noticing. This walks every node and checks the numbers.

   Run: node harness/darylitest.mjs
   ========================================================================== */
import {runPass, Suite, PRELUDE, SRC} from './_lib.mjs';

const T = runPass(PRELUDE + String.raw`
  /* ---- the NPC himself ---- */
  const daryl = npcs.find(n => n && n.id === 'sawyer');
  o.exists = !!daryl;
  if(!daryl) return o;
  o.name = daryl.name;
  o.at = {x: daryl.x, y: daryl.y};
  o.hasExamine = !!daryl.ex;
  o.hasDialogue = !!DIALOGUES[daryl.id];

  /* he stands at the mill */
  const mill = objects.find(q => q.def === 'sawmill');
  o.millAt = mill ? {x: mill.x, y: mill.y} : null;
  o.distanceToMill = mill ? (Math.abs(daryl.x - mill.x) + Math.abs(daryl.y - mill.y)) : null;

  /* ---- walk the whole tree, in both states ---- */
  const walk = () => {
    const tree = DIALOGUES.sawyer();
    const nodes = Object.keys(tree);
    const seen = new Set(['start']);
    const queue = ['start'];
    const dangling = [];
    const texts = [];
    while(queue.length){
      const key = queue.pop();
      const node = tree[key];
      if(!node){ dangling.push(key); continue; }
      if(node.text) texts.push(node.text);
      const outs = [];
      if(node.next) outs.push(node.next);
      if(node.opts) for(const opt of node.opts){ if(opt.next) outs.push(opt.next); }
      for(const nx of outs){
        if(nx === 'bye' || nx === null) continue;
        if(!tree[nx]){ dangling.push(key + ' -> ' + nx); continue; }
        if(!seen.has(nx)){ seen.add(nx); queue.push(nx); }
      }
    }
    return {nodes, reached: [...seen], unreachable: nodes.filter(k => !seen.has(k)),
            dangling, texts: texts.join(' ')};
  };

  clearInv(); give('coins', 1000);
  player.house = null;
  o.noLogsNoHouse = walk();

  give('oak_logs', 5);
  o.withLogs = walk();

  player.house = {owned: true, repair: POH_REPAIR_STEPS.length, rooms: null, slots: {}, slotsV2: 1};
  o.withHouse = walk();

  clearInv(); give('coins', 1000);
  o.ownerNoLogs = walk();

  /* ---- the numbers he quotes ---- */
  o.fees = SAWMILL.map(r => r[2]);
  o.allText = [o.noLogsNoHouse.texts, o.withLogs.texts, o.withHouse.texts, o.ownerNoLogs.texts].join(' ');
  /* he reads the fees out in words, so check the words */
  o.quotesWords = {
    plain: /hundred and fifty/i.test(o.allText),
    oak: /six hundred/i.test(o.allText),
    willow: /two thousand one hundred/i.test(o.allText),
    birch: /six thousand two hundred/i.test(o.allText),
  };
  o.mentionsBohan = /Bohan/.test(o.allText);
  o.mentionsConstruction = /Construction/.test(o.allText);
  o.mentionsNails = /nail/i.test(o.allText);
  o.mentionsOnePerLog = /one plank per log|One log, one plank/i.test(o.allText);

  /* the "I have logs" branch only offers what you are carrying */
  clearInv(); give('coins', 1000); give('willow_logs', 3);
  const t = DIALOGUES.sawyer();
  o.gotNode = t.got ? JSON.stringify(t.got).slice(0, 400) : null;
  o.rowsWithLogs = sawmillRows().filter(r => r.have > 0).map(r => r.log);

  /* ---- opening the dialogue for real ---- */
  o.openThrew = null;
  try{
    openDialogue(daryl);
    o.dlgOpen = !!(typeof dlg !== 'undefined' && dlg);
    if(typeof closeDialogue === 'function') closeDialogue();
  }catch(e){ o.openThrew = String(e && e.message || e); }

  clearInv();
  player.house = null;
  return o;
`);

const S = new Suite('darylitest').guard(T);

S.ok('Daryl exists',                              T.exists);
S.eq('  named Daryl',                             T.name, 'Daryl');
S.ok('  with examine text',                       T.hasExamine);
S.ok('  and a dialogue tree',                     T.hasDialogue);
S.ok('  standing at the mill',                    T.distanceToMill !== null && T.distanceToMill <= 12,
     `${T.distanceToMill} tiles from the mill at ${JSON.stringify(T.millAt)}`);

/* the tree, in every state */
const STATES = [['carrying nothing, no cottage', T.noLogsNoHouse],
                ['carrying logs', T.withLogs],
                ['carrying logs, owns the cottage', T.withHouse],
                ['owns the cottage, no logs', T.ownerNoLogs]];
for(const [label, w] of STATES){
  S.eq(`${label}: NO DANGLING BRANCH`,            w.dangling.length, 0);
  if(w.dangling.length) S.note(w.dangling.join(', '));
}
/* A node unreached in ONE state is fine and expected: `got` and `logs` are
   alternatives chosen by what you carry, and `house` is skipped once you own the
   cottage. What must not exist is a node no state can ever reach. */
const everReached = new Set();
for(const [, w] of STATES) for(const k of w.reached) everReached.add(k);
const neverReached = (T.noLogsNoHouse.nodes || []).filter(k => !everReached.has(k));
S.eq('EVERY NODE IS REACHABLE IN SOME STATE',     neverReached.length, 0);
if(neverReached.length) S.note('dead prose: ' + neverReached.join(', '));
S.ok('  and the state-only nodes really do vary', STATES.some(([, w]) => w.unreachable.length > 0),
     'if no node were ever state-gated, the four walks would be identical and this check idle');
S.note('state-gated nodes: ' + [...new Set(STATES.flatMap(([, w]) => w.unreachable))].join(', '));
S.ok('the tree has real depth',                   T.noLogsNoHouse.nodes.length >= 8,
     `${T.noLogsNoHouse.nodes.length} nodes`);
S.ok('  and carrying logs changes it',            T.withLogs.texts !== T.noLogsNoHouse.texts,
     'the "I have logs with me" branch is state-driven');
S.ok('  as does owning the cottage',              T.withHouse.texts !== T.withLogs.texts,
     'he stops telling an owner to go and see Mr. Bohan');

/* the numbers */
S.ok('HE QUOTES THE PLAIN BOARD FEE',             T.quotesWords.plain, `fees are ${T.fees.join(', ')}`);
S.ok('  the oak fee',                             T.quotesWords.oak);
S.ok('  the willow fee',                          T.quotesWords.willow);
S.ok('  and the birch fee',                       T.quotesWords.birch);
S.note(`the fees are read out in words, so they cannot be derived from SAWMILL — if you retune ${T.fees.join('/')} his script needs editing by hand`);

S.ok('he explains one plank per log',             T.mentionsOnePerLog);
S.ok('  names the Construction skill',            T.mentionsConstruction);
S.ok('  mentions nails',                          T.mentionsNails);
S.ok('  and sends a new player to Mr. Bohan',     T.mentionsBohan,
     'his tree is the only in-game explanation of the entry path');

S.ok('the "I have logs" branch exists',           !!T.gotNode);
S.ok('  and the mill lists what you carry',       T.rowsWithLogs.length === 1 && T.rowsWithLogs[0] === 'willow_logs',
     T.rowsWithLogs.join(', '));

S.eq('opening his dialogue does not throw',       T.openThrew, null);

/* source: he is wired to the mill, not floating loose */
S.ok('the sawmill object exists in the world',    !!T.millAt);
S.ok('DIALOGUES.sawyer is built per-open',        /sawyer:\s*\(\)\s*=>/.test(SRC) || /sawyer\s*:\s*function/.test(SRC),
     'a static tree could not react to what you are carrying');

S.report(
  'Daryl exists at the mill, his tree has no dangling or unreachable branch in any state, and he quotes every board fee and the whole entry path.',
  'how the conversation reads in play, and whether the fees he speaks still match a retuned SAWMILL — the numbers are prose, not derived.');
