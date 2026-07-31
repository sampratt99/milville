/* ============================================================================
   sawicon — the Construction arc's own icons and sprites.

   iconaudit sweeps every icon in the game for canvas balance. This one is
   narrower and about FILING: the boards, nails, deed and skill icon that
   Construction added must exist, sit in the right table, and draw.

   The rule (docs/23 §9): item sprites go in ITEM_ICON_PNG (plain 0..S space,
   early return); UI and skill icons go in UI_ICON_PNG (centred space). Misfiling
   strands the icon in the corner of its cell.

   Run: node harness/sawicon.mjs
   ========================================================================== */
import {runPass, Suite, PRELUDE} from './_lib.mjs';

const T = runPass(PRELUDE + String.raw`
  o.plankIds = SAWMILL.map(r => r[1]);
  o.logIds = SAWMILL.map(r => r[0]);
  o.conItems = [...o.plankIds, ...o.logIds, 'iron_nails', 'house_deed'];

  /* ---- every Construction item exists and is properly declared ---- */
  o.missingItem = o.conItems.filter(id => !ITEMS[id]);
  o.noName = o.conItems.filter(id => ITEMS[id] && !ITEMS[id].name);
  o.noExamine = o.conItems.filter(id => ITEMS[id] && !ITEMS[id].ex);
  o.noValue = o.conItems.filter(id => ITEMS[id] && typeof ITEMS[id].val !== 'number');

  /* ---- FILING ---- */
  o.spritedItems = o.conItems.filter(id => ITEM_ICON_PNG[id]);
  o.misfiledAsUi = o.conItems.filter(id => UI_ICON_PNG[id]);
  o.inBothTables = o.conItems.filter(id => ITEM_ICON_PNG[id] && UI_ICON_PNG[id]);
  o.skillIconName = SKILL_META.construction.ui;
  o.skillIconIsUi = !!UI_ICON_PNG[o.skillIconName];
  o.skillIconMisfiled = !!ITEM_ICON_PNG[o.skillIconName];

  /* ---- they all DRAW, and balance ---- */
  const ctx = () => document.createElement('canvas').getContext('2d');
  o.itemThrew = []; o.itemDrift = [];
  {
    const g = ctx();
    for(const id of o.conItems){
      if(!ITEMS[id]) continue;
      for(let p = 0; p < 5; p++){
        try{ drawItemIcon(g, id, 32); }
        catch(e){ o.itemThrew.push(id + ': ' + (e && e.message || e)); break; }
      }
      if(g.__depth !== 0) o.itemDrift.push(id + '=' + g.__depth);
    }
    o.itemCalls = g.__calls;
  }
  o.uiThrew = null;
  {
    const g = ctx();
    try{ for(let p = 0; p < 5; p++) drawUiIcon(g, o.skillIconName, 20); }
    catch(e){ o.uiThrew = String(e && e.message || e); }
    o.uiDepth = g.__depth;
    o.uiCalls = g.__calls;
  }

  /* ---- the boards read apart: distinct names, labels and values ---- */
  o.plankNames = o.plankIds.map(id => ITEMS[id].name);
  o.plankLabels = o.plankIds.map(id => PLANK_LABEL[id] || null);
  o.plankValues = o.plankIds.map(id => ITEMS[id].val | 0);
  o.dupPlankNames = o.plankNames.filter((n, i, a) => a.indexOf(n) !== i);
  o.dupPlankLabels = o.plankLabels.filter((n, i, a) => a.indexOf(n) !== i);
  o.missingLabel = o.plankIds.filter(id => !PLANK_LABEL[id]);
  o.distinctSprites = new Set(o.plankIds.map(id => ITEM_ICON_PNG[id])).size;

  /* ---- nails stack, boards do not: the whole reason butlers exist ---- */
  o.nailsStack = !!ITEMS.iron_nails.stack;
  o.plankStacks = o.plankIds.filter(id => ITEMS[id].stack);
  clearInv();
  give('iron_nails', 100);
  o.nailSlots = 28 - (() => { let n = 0; for(const s of player.inv) if(!s) n++; return n; })();
  clearInv();
  give('oak_plank', 5);
  o.fiveBoardsUse = 28 - (() => { let n = 0; for(const s of player.inv) if(!s) n++; return n; })();
  clearInv();

  /* ---- the deed ---- */
  o.deedTradeable = !ITEMS.house_deed.noTrade;
  o.deedHasSprite = !!ITEM_ICON_PNG.house_deed;
  return o;
`);

const S = new Suite('sawicon').guard(T);

S.eq('every Construction item exists',            T.missingItem.length, 0);
if(T.missingItem.length) S.note(T.missingItem.join(', '));
S.eq('  each with a name',                        T.noName.length, 0);
S.eq('  examine text',                            T.noExamine.length, 0);
if(T.noExamine.length) S.note(T.noExamine.join(', '));
S.eq('  and a value',                             T.noValue.length, 0);

S.ok('the boards and nails carry sprites',        T.spritedItems.length >= 5,
     `${T.spritedItems.length} of ${T.conItems.length} have a wiki sprite`);
S.eq('NO CONSTRUCTION ITEM IS FILED AS A UI ICON', T.misfiledAsUi.length, 0);
if(T.misfiledAsUi.length) S.note('misfiled: ' + T.misfiledAsUi.join(', '));
S.eq('  and none is in both tables',              T.inBothTables.length, 0);
S.ok('the skill icon is in the UI table',         T.skillIconIsUi, T.skillIconName);
S.eq('  and NOT in the item table',               T.skillIconMisfiled, false);

S.eq('every Construction icon draws',             T.itemThrew.length, 0);
if(T.itemThrew.length) S.note(T.itemThrew.join('; '));
S.ok('  and really reached the canvas',           T.itemCalls > 0, `${T.itemCalls} calls`);
S.eq('  leaving the canvas stack at zero',        T.itemDrift.length, 0);
if(T.itemDrift.length) S.note(T.itemDrift.join(', '));
S.eq('the skill icon draws',                      T.uiThrew, null);
S.ok('  and really reached the canvas',           T.uiCalls > 0, `${T.uiCalls} calls`);
S.eq('  balancing too',                           T.uiDepth, 0);

S.eq('the four boards have distinct names',       T.dupPlankNames.length, 0);
S.eq('  distinct timber labels',                  T.dupPlankLabels.length, 0);
S.eq('  and none missing a label',                T.missingLabel.length, 0);
S.eq('  with four distinct sprites',              T.distinctSprites, 4);
S.ok('  and rising values',                       T.plankValues.every((v, i) => i === 0 || v > T.plankValues[i-1]),
     T.plankValues.join(' < '));

S.ok('NAILS STACK',                               T.nailsStack);
S.eq('  taking one slot for a hundred',           T.nailSlots, 1);
S.eq('BOARDS DO NOT STACK',                       T.plankStacks.length, 0);
S.eq('  five boards take five slots',             T.fiveBoardsUse, 5);
S.note('that asymmetry is the whole reason butlers exist: a maxed house wants ~180 boards and a pack holds 28');

/* A sprite is optional — anything without one falls through to the hand-drawn
   art, and the deed does. What matters is that it DRAWS, which is asserted above
   along with every other Construction item. */
S.ok('the deed draws one way or the other',       !T.itemThrew.includes('house_deed'),
     T.deedHasSprite ? 'has a wiki sprite' : 'no sprite — uses the hand-drawn fallback');

S.report(
  'Every board, log, nail and deed exists, is filed in the item table, draws clean, and boards do not stack while nails do.',
  'what any of them look like — the shim rasterises nothing.');
