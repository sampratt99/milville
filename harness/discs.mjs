/* ============================================================================
   discs — round faces are turned the right way.

   The documented trap (CLAUDE.md, docs/23 §9) says: "Cylinders and tori are born
   upright. A round face meant to hang on a wall needs rotation.x = PI/2."

   THAT IS RIGHT FOR CYLINDERS AND BACKWARDS FOR TORI, and this harness exists
   partly to pin that down:

     - CylinderGeometry is born with its axis along +Y, so a thin one is a coin
       LYING FLAT. Standing it on a wall needs rotation.x = PI/2. That is what
       CD() does and what C() cannot do.
     - TorusGeometry is born in the XY plane — already STANDING, facing +z, like
       a ring you look through. rotation.x = PI/2 LAYS IT DOWN.

   So the two primitives need opposite treatment for the same visual result, and
   following the doc literally would lay a portal arch flat on the floor.

   Readable at all because the shim's rotation is a real Euler.

   Run: node harness/discs.mjs
   ========================================================================== */
import {runPass, Suite, PRELUDE, SRC} from './_lib.mjs';

/* pieces whose round faces are unambiguously a plate hanging on a wall */
const WALL_PLATES = ['hf_dartboard', 'hf_wallclock', 'hf_clock', 'hf_hangmirror', 'hf_rangetarget'];
/* pieces whose rings stand vertically: you look or walk through them */
const UPRIGHT_RINGS = ['hf_portal', 'hf_portal_lesser', 'hf_greatgate', 'hf_globe',
                       'hf_tableglobe', 'hf_trellis', 'hf_toybox'];
/* pieces whose rings lie horizontally: hoops that hang level, or circles on the floor */
const LEVEL_RINGS = ['hf_potrack', 'hf_candlerack', 'hf_chalksigil', 'hf_sigil', 'hf_greaterfocus'];

const T = runPass(PRELUDE + String.raw`
  const PLATES = ${JSON.stringify(WALL_PLATES)};
  const UPRIGHT = ${JSON.stringify(UPRIGHT_RINGS)};
  const LEVEL = ${JSON.stringify(LEVEL_RINGS)};
  const HALF = Math.PI / 2;
  const near = (v, t) => Math.abs(Math.abs(v) - t) < 1e-6;

  o.pieces = []; o.buildFailures = [];
  for(const fid in HOUSE_FURNITURE){
    const obj = {def: fid, x: 60, y: 5, alive: true};
    try{ buildObjModel(obj); }
    catch(e){ o.buildFailures.push(fid + ': ' + (e && e.message || e)); continue; }
    if(!obj._m || !obj._m.group){ o.buildFailures.push(fid + ': no group'); continue; }

    const discs = [], rings = []; let meshes = 0;
    obj._m.group.traverse(m => {
      if(!m.geometry || !m.geometry.parameters) return;
      meshes++;
      const p = m.geometry.parameters, t = m.geometry.type;
      if(t === 'CylinderGeometry' && p.radiusTop === p.radiusBottom && p.radiusTop > 0
         && p.height > 0 && p.height < p.radiusTop * 0.6)
        discs.push({r: p.radiusTop, h: p.height, rx: m.rotation.x, rz: m.rotation.z});
      if(t === 'TorusGeometry')
        rings.push({r: p.radius, rx: m.rotation.x, rz: m.rotation.z});
    });
    o.pieces.push({fid, cat: HOUSE_FURNITURE[fid].cat, meshes, discs, rings,
                   flatFloor: !!(OBJ_DEFS[fid] && OBJ_DEFS[fid].flatFloor)});
  }
  o.pieceCount = o.pieces.length;
  o.emptyModels = o.pieces.filter(p => p.meshes === 0).map(p => p.fid);

  const byId = {};
  for(const p of o.pieces) byId[p.fid] = p;
  o.missingCurated = [...PLATES, ...UPRIGHT, ...LEVEL].filter(f => !byId[f]);

  /* ---- CYLINDERS: standing = |rx| or |rz| is a quarter turn ---- */
  const discStood = d => near(d.rx, HALF) || near(d.rz, HALF);
  o.flatDiscOnPlate = [];
  o.plateDiscCount = 0;
  for(const fid of PLATES){
    const p = byId[fid]; if(!p) continue;
    o.plateDiscCount += p.discs.length;
    for(const d of p.discs)
      if(!discStood(d)) o.flatDiscOnPlate.push(fid + ' disc r=' + d.r + ' rx=' + d.rx);
  }
  /* a floor piece's discs must NOT be stood up */
  o.stoodDiscOnFloor = [];
  o.floorDiscCount = 0;
  for(const p of o.pieces){
    if(!p.flatFloor) continue;
    o.floorDiscCount += p.discs.length;
    for(const d of p.discs)
      if(discStood(d)) o.stoodDiscOnFloor.push(p.fid + ' disc r=' + d.r + ' rx=' + d.rx);
  }

  /* ---- TORI: upright = rx 0; level = rx a quarter turn ---- */
  o.wrongUpright = [];
  for(const fid of UPRIGHT){
    const p = byId[fid]; if(!p) continue;
    for(const r of p.rings)
      if(!near(r.rx, 0)) o.wrongUpright.push(fid + ' ring r=' + r.r + ' rx=' + r.rx + ' (should stand at 0)');
  }
  o.wrongLevel = [];
  for(const fid of LEVEL){
    const p = byId[fid]; if(!p) continue;
    for(const r of p.rings)
      if(!near(r.rx, HALF)) o.wrongLevel.push(fid + ' ring r=' + r.r + ' rx=' + r.rx + ' (should lie at PI/2)');
  }

  /* ---- no round face sits at a junk angle ---- */
  o.oddAngles = [];
  for(const p of o.pieces){
    for(const d of p.discs)
      if(!near(d.rx, 0) && !near(d.rx, HALF) && !near(d.rx, Math.PI))
        o.oddAngles.push(p.fid + ' disc rx=' + d.rx);
    for(const r of p.rings)
      if(!near(r.rx, 0) && !near(r.rx, HALF) && !near(r.rx, Math.PI))
        o.oddAngles.push(p.fid + ' ring rx=' + r.rx);
  }

  o.totalDiscs = o.pieces.reduce((n, p) => n + p.discs.length, 0);
  o.totalRings = o.pieces.reduce((n, p) => n + p.rings.length, 0);
  o.stoodDiscs = o.pieces.reduce((n, p) => n + p.discs.filter(discStood).length, 0);
  o.uprightRings = o.pieces.reduce((n, p) => n + p.rings.filter(r => near(r.rx, 0)).length, 0);
  o.levelRings = o.pieces.reduce((n, p) => n + p.rings.filter(r => near(r.rx, HALF)).length, 0);
  return o;
`);

const S = new Suite('discs').guard(T);

S.eq('every furniture model builds',              T.buildFailures.length, 0);
if(T.buildFailures.length) S.note(T.buildFailures.slice(0, 6).join('; '));
S.eq('  producing geometry',                      T.emptyModels.length, 0);
S.ok(`walked ${T.pieceCount} models`,             T.pieceCount > 100);
S.eq('every curated piece still exists',          T.missingCurated.length, 0);
if(T.missingCurated.length) S.note('renamed or removed: ' + T.missingCurated.join(', '));

S.ok('there are round faces to check',            T.totalDiscs + T.totalRings > 20,
     `${T.totalDiscs} cylinder discs, ${T.totalRings} tori`);
S.ok('  and both orientations are in use',        T.stoodDiscs > 0 && T.uprightRings > 0 && T.levelRings > 0,
     `${T.stoodDiscs} discs stood up · ${T.uprightRings} rings upright · ${T.levelRings} rings level`);

/* cylinders */
S.ok('the wall plates carry discs',               T.plateDiscCount > 0, `${T.plateDiscCount} discs`);
S.eq('A WALL PLATE STANDS ITS DISCS UP',          T.flatDiscOnPlate.length, 0);
if(T.flatDiscOnPlate.length) S.note(T.flatDiscOnPlate.join('\n        '));
S.ok('floor pieces carry discs too',              T.floorDiscCount > 0, `${T.floorDiscCount} discs`);
S.eq('A FLOOR PIECE LEAVES ITS DISCS FLAT',       T.stoodDiscOnFloor.length, 0);
if(T.stoodDiscOnFloor.length) S.note(T.stoodDiscOnFloor.join('\n        '));

/* tori — the opposite convention */
S.eq('A RING YOU LOOK THROUGH STANDS AT rx=0',    T.wrongUpright.length, 0);
if(T.wrongUpright.length) S.note(T.wrongUpright.join('\n        '));
S.eq('A HOOP THAT HANGS LEVEL LIES AT rx=PI/2',   T.wrongLevel.length, 0);
if(T.wrongLevel.length) S.note(T.wrongLevel.join('\n        '));

S.eq('no round face sits at a junk angle',        T.oddAngles.length, 0);
if(T.oddAngles.length) S.note(T.oddAngles.slice(0, 8).join('; '));

/* the helpers */
S.ok('CD() stands a disc up',                     /const CD=[\s\S]{0,120}?rotation\.x=Math\.PI\/2/.test(SRC));
S.ok('  and C() does NOT',                        !/const C=\(rt,rb,h,c,x,y,z,sg,rz\)=>\{[^}]*rotation\.x/.test(SRC),
     'C only rolls on z; using it for a wall disc is the bug');

S.report(
  'Cylinders stand up on wall plates and lie flat on floor pieces; tori stand at 0 and lie at PI/2 — the opposite convention, and every piece obeys it.',
  'whether a correctly-turned face is on the RIGHT wall at the right height — that is a look, and needs a browser.');
