/* ============================================================================
   conunlock — what a Construction level-up tells you it unlocked.

   _conUnlockAt(level) builds the "You can now build..." line from
   HOUSE_FURNITURE itself, so it can never drift from the table. What it must
   not do is claim an unlock on a level where nothing opens, or read as a wall
   of names on a busy level.

   Run: node harness/conunlock.mjs
   ========================================================================== */
import {runPass, Suite, PRELUDE} from './_lib.mjs';

const T = runPass(PRELUDE + String.raw`
  o.byLevel = {};
  for(const fid in HOUSE_FURNITURE){
    const r = HOUSE_FURNITURE[fid].req | 0;
    (o.byLevel[r] = o.byLevel[r] || []).push(HOUSE_FURNITURE[fid].name);
  }
  o.levelsWithUnlocks = Object.keys(o.byLevel).map(Number).sort((a, b) => a - b);
  o.maxReq = Math.max(...o.levelsWithUnlocks);

  /* the line at every level from 1 to 99 */
  o.lines = {};
  for(let L = 1; L <= 99; L++) o.lines[L] = _conUnlockAt(L);

  /* levels where nothing opens must produce nothing */
  o.noisyEmptyLevels = [];
  for(let L = 1; L <= 99; L++){
    if(o.byLevel[L]) continue;
    const line = o.lines[L];
    if(line && String(line).trim().length) o.noisyEmptyLevels.push(L + ': ' + line);
  }

  /* levels where something opens must say so, and name it */
  o.silentUnlockLevels = [];
  o.wrongCountLevels = [];
  for(const L of o.levelsWithUnlocks){
    const line = String(o.lines[L] || '');
    if(!line.trim()){ o.silentUnlockLevels.push(L); continue; }
    const names = o.byLevel[L];
    if(names.length === 1 && line.toLowerCase().indexOf(names[0].toLowerCase()) < 0)
      o.wrongCountLevels.push(L + ' (1 piece, line does not name it): ' + line);
    /* a busy level must not read out every name */
    if(names.length > 3 && !/more/.test(line))
      o.wrongCountLevels.push(L + ' (' + names.length + ' pieces, no "and N more"): ' + line);
  }

  /* the line is driven by the TABLE, not a hard-coded list */
  o.sampleLevel = o.levelsWithUnlocks.find(L => o.byLevel[L].length === 1);
  o.sampleLine = o.lines[o.sampleLevel];
  o.sampleName = o.byLevel[o.sampleLevel][0];

  /* ---- levelling up: the level goes to the chat, the unlock goes to the POPUP ---- */
  setLevel('construction', 1);
  clearInv();
  const target = o.levelsWithUnlocks.find(L => L > 1 && L < 20);
  o.targetLevel = target;
  player.skills.construction = XP_TABLE[target] - 1;
  since();
  addXp('construction', 2);
  o.levelUpLog = since();
  o.saidLevelUp = o.levelUpLog.some(l => /Construction level is now/.test(l));
  o.reachedLevel = lvl('construction');

  /* the popup is two pages: the congratulation, then the unlock */
  const tx = document.getElementById('lutext');
  const cont = document.getElementById('lucont');
  o.popupPage0 = tx.innerHTML;
  o.contPage0 = cont.textContent;
  _luClick();                       /* turn to the unlock page */
  o.popupPage1 = tx.innerHTML;
  o.contPage1 = cont.textContent;
  _luClick();                       /* close */

  /* a level with NOTHING to unlock closes on the first page */
  const quiet = [];
  for(let L = 2; L <= 99; L++) if(!o.byLevel[L]) quiet.push(L);
  o.quietLevel = quiet[0];
  setLevel('construction', 1);
  player.skills.construction = XP_TABLE[o.quietLevel] - 1;
  since();
  addXp('construction', 2);
  o.quietCont = cont.textContent;
  _luClick();
  since();

  /* ---- skillUnlockAt routes construction to _conUnlockAt ---- */
  o.routed = skillUnlockAt('construction', o.sampleLevel);
  o.routedMatches = o.routed === o.sampleLine;

  /* another skill must not get construction's line */
  o.otherSkillLine = skillUnlockAt('cooking', o.sampleLevel);
  o.otherSkillDiffers = o.otherSkillLine !== o.sampleLine;

  setLevel('construction', 1);
  return o;
`);

const S = new Suite('conunlock').guard(T);

S.ok('pieces open across many levels',            T.levelsWithUnlocks.length > 10,
     `${T.levelsWithUnlocks.length} distinct requirement levels, up to ${T.maxReq}`);

S.eq('A LEVEL THAT UNLOCKS NOTHING SAYS NOTHING', T.noisyEmptyLevels.length, 0);
if(T.noisyEmptyLevels.length) S.note(T.noisyEmptyLevels.slice(0, 6).join('; '));
S.eq('a level that unlocks something says so',    T.silentUnlockLevels.length, 0);
if(T.silentUnlockLevels.length) S.note('silent at: ' + T.silentUnlockLevels.join(', '));
S.eq('  naming it correctly',                     T.wrongCountLevels.length, 0);
if(T.wrongCountLevels.length) S.note(T.wrongCountLevels.slice(0, 6).join('; '));

S.ok('THE LINE COMES FROM THE TABLE',             String(T.sampleLine).toLowerCase().includes(String(T.sampleName).toLowerCase()),
     `level ${T.sampleLevel}: "${T.sampleLine}" for "${T.sampleName}"`);

S.ok('levelling up announces the level in chat',  T.saidLevelUp, T.levelUpLog.join(' | '));
S.eq('  and the level really moved',              T.reachedLevel, T.targetLevel);
S.ok('the popup congratulates first',             /Congratulations/.test(T.popupPage0 || ''), T.popupPage0);
S.eq('  offering a second page',                  T.contPage0, 'Click here to continue');
S.ok('  WHICH NAMES WHAT OPENED',                 /You can now build/.test(T.popupPage1 || ''),
     `at Construction ${T.targetLevel}: ${T.popupPage1}`);
S.eq('  then closes',                             T.contPage1, 'Click here to close');
S.eq('A LEVEL THAT OPENS NOTHING HAS NO SECOND PAGE',
     T.quietCont, 'Click here to close');

S.ok('skillUnlockAt routes construction here',    T.routedMatches,
     `skillUnlockAt gave "${T.routed}", _conUnlockAt gave "${T.sampleLine}"`);
S.ok('  and does not give it to other skills',    T.otherSkillDiffers,
     `cooking got "${T.otherSkillLine}"`);

S.report(
  'Every Construction level-up line is generated from HOUSE_FURNITURE, names what opened, stays quiet when nothing did, and summarises a busy level.',
  'how the level-up popup looks and reads in play — needs a browser.');
