/* ============================================================================
   iconaudit — every icon drawn five times, canvas stack back to zero.

   The bug this exists for: drawItemIcon balances its own canvas with
   save()/try/finally restore(). Branches historically forgot the restore, and
   because each inventory slot keeps its OWN canvas the stray translate
   accumulated on every re-render — icons marched into the bottom-right corner
   and shrank. Five passes is what makes drift visible; one pass would not.

   Run: node harness/iconaudit.mjs   (run it after adding ANY icon)

   The shim's 2d context is a no-op drawer that keeps a real save/restore depth
   counter, so this proves BALANCE. It cannot prove the icon looks like anything.
   ========================================================================== */
import {runPass, Suite, PRELUDE} from './_lib.mjs';

const PASSES = 5;

const T = runPass(PRELUDE + String.raw`
  const ctx = () => document.createElement('canvas').getContext('2d');

  /* ---- item icons: 5 passes on ONE shared context, as the inventory does ---- */
  const ids = Object.keys(ITEMS);
  o.itemCount = ids.length;
  o.itemThrew = [];
  o.itemDrift = [];      /* anything whose depth did not return to 0 */
  o.itemMaxDepth = 0;
  {
    const g = ctx();
    for(const id of ids){
      for(let p = 0; p < ${PASSES}; p++){
        try{ drawItemIcon(g, id, 32); }
        catch(e){ o.itemThrew.push(id + ': ' + (e && e.message || e)); break; }
      }
      if(g.__depth !== 0) o.itemDrift.push({id, depth: g.__depth});
      if(g.__maxDepth > o.itemMaxDepth) o.itemMaxDepth = g.__maxDepth;
    }
    o.itemFinalDepth = g.__depth;
    o.itemDrew = g.__calls > 0;
  }

  /* a dosed potion takes a different branch and must balance too */
  o.doseThrew = [];
  {
    const g = ctx();
    for(const id of ids){
      if(!(ITEMS[id].potion && ITEMS[id].doses)) continue;
      for(let d = 1; d <= ITEMS[id].doses; d++){
        try{ drawItemIcon(g, id, 32, d); }
        catch(e){ o.doseThrew.push(id + '@' + d + ': ' + (e && e.message || e)); }
      }
    }
    o.doseFinalDepth = g.__depth;
  }

  /* icons are drawn at every size the UI asks for */
  o.sizeThrew = [];
  {
    const g = ctx();
    for(const S of [14, 15, 16, 18, 20, 22, 26, 34, 44]){
      for(const id of ids){
        try{ drawItemIcon(g, id, S); }
        catch(e){ o.sizeThrew.push(id + '@' + S + ': ' + (e && e.message || e)); }
      }
    }
    o.sizeFinalDepth = g.__depth;
  }

  /* ---- UI / skill icons draw in a DIFFERENT (centred) coordinate space ---- */
  const uiNames = Object.keys(UI_ICON_PNG);
  const skillUi = SKILLS.map(s => SKILL_META[s] && SKILL_META[s].ui).filter(Boolean);
  o.uiCount = uiNames.length;
  o.skillUiCount = skillUi.length;
  o.uiThrew = [];
  o.uiDrift = [];
  {
    const g = ctx();
    for(const n of [...new Set([...uiNames, ...skillUi])]){
      for(let p = 0; p < ${PASSES}; p++){
        try{ drawUiIcon(g, n, 20); }
        catch(e){ o.uiThrew.push(n + ': ' + (e && e.message || e)); break; }
      }
      if(g.__depth !== 0) o.uiDrift.push({name: n, depth: g.__depth});
    }
    o.uiFinalDepth = g.__depth;
  }

  /* ---- THE FILING RULE ---- */
  /* Item sprites go in ITEM_ICON_PNG (plain 0..S space, early return); UI and
     skill icons go in UI_ICON_PNG (centred space). Misfiling produces the
     corner-icon bug. An id must never be in both, and no ITEMS id may live in
     the UI table. */
  o.inBothTables = Object.keys(ITEM_ICON_PNG).filter(k => k in UI_ICON_PNG);
  o.itemsFiledAsUi = Object.keys(UI_ICON_PNG).filter(k => k in ITEMS);
  o.itemSpriteCount = Object.keys(ITEM_ICON_PNG).length;

  /* every skill needs a UI icon or the skill panel draws a blank */
  o.skillsMissingUi = SKILLS.filter(s => !SKILL_META[s] || !SKILL_META[s].ui);

  return o;
`);

const S = new Suite('iconaudit').guard(T);

S.ok(`drew all ${T.itemCount} item icons`,        T.itemCount > 300, `${T.itemCount} items`);
S.ok('  without throwing',                        T.itemThrew.length === 0, T.itemThrew.slice(0, 5).join('; '));
S.ok('  and something actually reached the canvas', T.itemDrew);
S.eq(`THE CANVAS STACK RETURNS TO ZERO (${PASSES} passes)`, T.itemDrift.length, 0);
if(T.itemDrift.length) S.note('drifting: ' + T.itemDrift.slice(0, 8).map(d => `${d.id}=${d.depth}`).join(', '));
S.eq('  final depth is 0',                        T.itemFinalDepth, 0);
S.ok('  and icons really do nest saves',          T.itemMaxDepth >= 2,
     `max nesting ${T.itemMaxDepth} — if this were 0 the drawers never ran`);

S.ok('dosed potions draw clean',                  T.doseThrew.length === 0, T.doseThrew.slice(0, 5).join('; '));
S.eq('  and balance',                             T.doseFinalDepth, 0);

S.ok('every icon draws at every UI size',         T.sizeThrew.length === 0, T.sizeThrew.slice(0, 5).join('; '));
S.eq('  and balances',                            T.sizeFinalDepth, 0);

S.ok(`drew all ${T.uiCount} UI icons`,            T.uiThrew.length === 0, T.uiThrew.slice(0, 5).join('; '));
S.eq('UI icons balance too',                      T.uiDrift.length, 0);
S.eq('  final depth is 0',                        T.uiFinalDepth, 0);

S.eq('no id is filed in BOTH icon tables',        T.inBothTables.length, 0);
if(T.inBothTables.length) S.note('in both: ' + T.inBothTables.join(', '));
S.eq('NO ITEM SPRITE IS FILED AS A UI ICON',      T.itemsFiledAsUi.length, 0);
if(T.itemsFiledAsUi.length) S.note('misfiled: ' + T.itemsFiledAsUi.join(', '));
S.eq('every skill has a UI icon',                 T.skillsMissingUi.length, 0);
S.note(`${T.itemSpriteCount} item sprites, ${T.uiCount} UI sprites, ${T.skillUiCount} skill icons`);

S.report(
  `All ${T.itemCount} item icons and ${T.uiCount} UI icons draw clean and leave the canvas stack at zero.`,
  'what any icon looks like — the shim rasterises nothing.');
