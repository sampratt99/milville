/* ============================================================================
   _lib.mjs — the bit every harness would otherwise repeat.

   Extracts the game out of index.html, installs shim.txt, runs an injected
   Pattern-B pass inside the module scope, and reports.

   Files starting with `_` are library, not tests: run-all.sh skips them.

     import {runPass, Suite, SRC} from './_lib.mjs';

   The pass body you hand to runPass() executes INSIDE the game's module scope.
   It can touch anything the game declares and nothing this file declares — the
   only way back out is the object it returns. Source-text checks belong out
   here against SRC.
   ========================================================================== */
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..');

/* ---- extract fresh every run; offsets go stale, so never trust a cache ----- */
function extract(){
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const i = html.indexOf("<script>\n'use strict'");
  const j = html.indexOf('</script>', i);
  if(i < 0 || j < 0) throw new Error('could not find the main <script> block in index.html');
  return html.slice(i + 8, j);
}

/** The game's JS, for source-text assertions that cannot be made at runtime. */
export const SRC = extract();

let shimInstalled = false;
function installShim(){
  if(shimInstalled) return;
  new Function(fs.readFileSync(path.join(HERE, 'shim.txt'), 'utf8'))();
  shimInstalled = true;
}

/**
 * Run `body` inside the game's module scope and return whatever it returns.
 * `body` is JS source: statements ending in a `return`.
 *
 * The pass is wrapped so a throw comes back as {__threw} rather than killing
 * the process — a harness reports that as a failed check like any other.
 */
export function runPass(body){
  installShim();
  const wrapped = `
;globalThis.__T=(function(){
  try{
${body}
  }catch(e){ return {__threw: String(e && e.stack || e)}; }
})();`;
  try{
    new Function(SRC + wrapped)();
  }catch(e){
    return {__threw: 'the game did not load under the shim\n' + (e && e.stack || e)};
  }
  const T = globalThis.__T;
  T.__unstubbedThree = [...(globalThis.__shim.missingThree || [])];
  return T;
}

/**
 * Helpers a pass almost always wants, as a source string to paste at the top of
 * a pass body. Kept as text because the pass cannot see this file's scope.
 */
export const PRELUDE = String.raw`
  const o = {};
  /* capture every player-facing line so refusals can be asserted, not guessed */
  const _msg = msg;
  let LOG = [];
  msg = function(t, c){ LOG.push(String(t)); try{ _msg(t, c); }catch(e){} };
  const said = re => LOG.some(l => re.test(l));
  const since = () => { const l = LOG.slice(); LOG = []; return l; };
  const setLevel = (sk, L) => { player.skills[sk] = XP_TABLE[L]; };
  const clearInv = () => { for(let k = 0; k < player.inv.length; k++) player.inv[k] = null; };
  const give = (id, n) => addItem(id, n);
  const freeSlots = () => { let n = 0; for(const s of player.inv) if(!s) n++; return n; };
  /* a deeded, fully repaired, empty cottage with the player standing in it */
  const freshHouse = () => {
    if(inHouse) try{ exitHouse(); }catch(e){}
    houseVisit = null;
    player.house = {owned:true, repair:POH_REPAIR_STEPS.length, rooms:null, slots:{}, slotsV2:1};
    houseRooms();
    enterHouse();
  };
`;

/* ==========================================================================
   Assertions
   ========================================================================== */
export class Suite {
  constructor(name){
    this.name = name;
    this.checks = [];
    this.notes = [];
  }
  ok(name, cond, detail){ this.checks.push({name, pass: !!cond, detail}); return this; }
  eq(name, got, want){
    const pass = Object.is(got, want) ||
      (typeof got === 'object' && typeof want === 'object' &&
       JSON.stringify(got) === JSON.stringify(want));
    this.checks.push({name, pass, detail: `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`});
    return this;
  }
  note(s){ this.notes.push(s); return this; }

  /** Fail the whole suite if the injected pass threw. */
  guard(T){
    if(T && T.__threw) this.ok('the pass ran without throwing', false, T.__threw);
    return this;
  }

  /**
   * @param {string} ok      one line on what is now proven
   * @param {string} needsEyes  what this CANNOT prove — always say it
   */
  report(ok, needsEyes){
    const failed = this.checks.filter(c => !c.pass);
    for(const c of this.checks){
      if(c.pass) console.log(`  ok   ${c.name}`);
      else       console.log(`  FAIL ${c.name}${c.detail ? '\n         ' + c.detail : ''}`);
    }
    for(const n of this.notes) console.log(`  note: ${n}`);
    console.log(`\n${this.name}: ${this.checks.length - failed.length}/${this.checks.length} passed`);
    if(failed.length){
      console.log(`\n${failed.length} FAILED:`);
      for(const c of failed) console.log('  - ' + c.name + (c.detail ? ` (${c.detail})` : ''));
      process.exit(1);
    }
    if(ok) console.log(ok);
    if(needsEyes) console.log('NOT proven here: ' + needsEyes);
  }
}
