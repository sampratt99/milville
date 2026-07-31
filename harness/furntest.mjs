/* ============================================================================
   furntest — the HOUSE_FURNITURE table (docs/23 §3).

   Every piece is {name, cat, cost, req, planks, nails, xp, plankId}. A bad row
   here does not crash — it quietly makes a piece unbuildable, unexaminable, or
   free. This walks the whole table and then BUILDS every single piece through
   the real houseBuild() path, which is the only way to know each row is
   actually reachable.

   Run: node harness/furntest.mjs
   ========================================================================== */
import {runPass, Suite, PRELUDE} from './_lib.mjs';

const T = runPass(PRELUDE + String.raw`
  const ids = Object.keys(HOUSE_FURNITURE);
  o.count = ids.length;
  o.plankIds = SAWMILL.map(r => r[1]);

  o.bad = {noName: [], noCat: [], badReq: [], badPlanks: [], badNails: [], noXp: [],
           badPlankId: [], negCost: [], noObjDef: [], noExamine: []};
  o.byCat = {};
  for(const fid of ids){
    const F = HOUSE_FURNITURE[fid];
    if(!F.name) o.bad.noName.push(fid);
    if(!F.cat) o.bad.noCat.push(fid);
    const req = F.req | 0;
    if(req < 1 || req > 99) o.bad.badReq.push(fid + '=' + F.req);
    if((F.planks | 0) < 0) o.bad.badPlanks.push(fid);
    if((F.nails | 0) < 0) o.bad.badNails.push(fid);
    /* a piece that costs boards must pay xp, or it is a pure sink */
    if((F.planks | 0) > 0 && !(F.xp > 0)) o.bad.noXp.push(fid);
    const pid = F.plankId || 'oak_plank';
    if(!ITEMS[pid] || !o.plankIds.includes(pid)) o.bad.badPlankId.push(fid + '=' + pid);
    if((F.cost | 0) < 0) o.bad.negCost.push(fid);
    if(!OBJ_DEFS[fid]) o.bad.noObjDef.push(fid);
    else if(!OBJ_DEFS[fid].ex) o.bad.noExamine.push(fid);
    (o.byCat[F.cat] = o.byCat[F.cat] || []).push({fid, req, xp: F.xp | 0,
      planks: F.planks | 0, cost: F.cost | 0, pid});
  }

  /* within a category, a higher level must not buy you a WORSE piece */
  o.regressions = [];
  for(const cat in o.byCat){
    const rows = o.byCat[cat].slice().sort((a, b) => a.req - b.req);
    for(let k = 1; k < rows.length; k++){
      if(rows[k].req === rows[k - 1].req) o.regressions.push(cat + ': ' + rows[k].fid + ' ties ' + rows[k - 1].fid);
      else if(rows[k].xp < rows[k - 1].xp) o.regressions.push(cat + ': ' + rows[k].fid + ' pays less xp than ' + rows[k - 1].fid);
    }
  }

  /* Categories are SUPPOSED to gate — that is the skill. What must not happen is
     a dead start: a brand-new owner at Construction 1, in the free parlour, with
     nothing at all they can build. */
  o.catEntryReq = {};
  for(const cat in o.byCat) o.catEntryReq[cat] = Math.min(...o.byCat[cat].map(r => r.req));
  o.parlourEntry = HOUSE_ROOMS.parlour.slots.map(s => ({id: s.id, cat: s.cat, req: o.catEntryReq[s.cat]}));
  o.level1Cats = Object.entries(o.catEntryReq).filter(([, r]) => r <= 1).map(([c]) => c);
  o.reqSpread = {min: Math.min(...Object.values(o.catEntryReq)),
                 max: Math.max(...Object.values(o.catEntryReq))};

  /* what a level-1 owner with a full purse can actually put in the parlour */
  setLevel('construction', 1);
  clearInv(); give('coins', 10000000);
  for(const p of SAWMILL.map(r => r[1])) give(p, 2);
  give('iron_nails', 20);
  o.ghostAtLevel1 = HOUSE_ROOMS.parlour.slots.map(s => houseGhostFor(s.cat)).filter(Boolean);

  /* ---- BUILD EVERY PIECE through the real path ---- */
  setLevel('construction', 99);
  o.built = []; o.failed = [];
  freshHouse();
  /* one of every room, so every category has a hotspot to sit in */
  for(const rk in HOUSE_ROOMS) houseRooms()['0,0'] = rk;   /* placeholder, replaced per piece below */
  delete houseRooms()['0,0'];

  const slotFor = cat => {
    for(const rk in HOUSE_ROOMS){
      const s = HOUSE_ROOMS[rk].slots.find(q => q.cat === cat);
      if(s) return {room: rk, id: s.id};
    }
    return null;
  };
  for(const fid of ids){
    const F = HOUSE_FURNITURE[fid];
    const where = slotFor(F.cat);
    if(!where){ o.failed.push(fid + ': no hotspot for ' + F.cat); continue; }
    /* put that room in a cell, stock the pack, build, then tear it all down */
    /* One malformed row must not take the whole report down with it — the
       table checks above have already recorded WHAT is wrong, and that is more
       useful than a stack trace. */
    try{
      player.house.rooms = {}; player.house.rooms['1,0'] = where.room;
      player.house.slots = {};
      clearInv();
      give('coins', 10000000);
      const pid = F.plankId || 'oak_plank';
      if(F.planks | 0) give(pid, F.planks | 0);
      if(F.nails | 0) give('iron_nails', F.nails | 0);
      const key = '1,0:' + where.id;
      since();
      houseBuild(key, fid);
      if(houseSlots()[key] === fid) o.built.push(fid);
      else o.failed.push(fid + ': ' + (since()[0] || 'silently refused'));
    }catch(e){
      o.failed.push(fid + ': THREW ' + (e && e.message || e));
    }
  }
  if(inHouse) exitHouse();
  return o;
`);

const S = new Suite('furntest').guard(T);

S.ok('the table has over a hundred pieces',        T.count > 100, `${T.count} pieces`);
S.eq('every piece has a name',                     T.bad.noName.length, 0);
S.eq('every piece has a category',                 T.bad.noCat.length, 0);
S.eq('every requirement is a real level (1-99)',   T.bad.badReq.length, 0);
if(T.bad.badReq.length) S.note(T.bad.badReq.join(', '));
S.eq('no piece wants negative boards',             T.bad.badPlanks.length, 0);
S.eq('no piece wants negative nails',              T.bad.badNails.length, 0);
S.eq('EVERY PIECE THAT COSTS BOARDS PAYS XP',      T.bad.noXp.length, 0);
if(T.bad.noXp.length) S.note('no xp: ' + T.bad.noXp.join(', '));
S.eq('every plankId is a real sawmill board',      T.bad.badPlankId.length, 0);
if(T.bad.badPlankId.length) S.note(T.bad.badPlankId.join(', '));
S.eq('no piece costs negative coins',              T.bad.negCost.length, 0);
S.eq('EVERY PIECE HAS AN OBJ_DEFS ENTRY',          T.bad.noObjDef.length, 0);
if(T.bad.noObjDef.length) S.note('missing: ' + T.bad.noObjDef.join(', '));
S.eq('  with examine text',                        T.bad.noExamine.length, 0);
if(T.bad.noExamine.length) S.note('no examine: ' + T.bad.noExamine.join(', '));

S.eq('a higher level never buys a worse piece',    T.regressions.length, 0);
if(T.regressions.length) S.note(T.regressions.slice(0, 8).join('; '));

/* gating is the skill; a DEAD START is the bug */
S.ok('some categories open at level 1',            T.level1Cats.length > 0,
     'level 1: ' + T.level1Cats.join(', '));
S.ok('  and at least one of them is in the parlour',
     T.parlourEntry.some(p => p.req <= 1),
     T.parlourEntry.map(p => `${p.cat}@${p.req}`).join(', '));
S.ok('A LEVEL-1 OWNER HAS SOMETHING TO BUILD',     T.ghostAtLevel1.length > 0,
     T.ghostAtLevel1.length ? 'can build: ' + T.ghostAtLevel1.join(', ') : 'nothing at all — dead start');
S.ok('requirements spread across the skill',       T.reqSpread.max >= 50,
     `category entry levels run ${T.reqSpread.min} to ${T.reqSpread.max}`);

/* the real test: does each row actually build? */
S.eq('EVERY PIECE BUILDS THROUGH houseBuild()',    T.failed.length, 0);
if(T.failed.length) S.note(T.failed.slice(0, 10).join('\n        '));
S.eq('  all of them',                              T.built.length, T.count);
S.note(`${T.built.length} pieces built across ${Object.keys(T.byCat).length} categories`);

S.report(
  `All ${T.count} furniture rows are well formed and every one builds through the real path.`,
  'what any piece looks like once built — that is a model, and needs a browser.');
