/* ============================================================================
   containtest — interior containment (docs/23 §8, docs/17).

   THE RECURRING BUG: somebody standing on the lawn could hover and click
   furniture inside the cottage, and vice versa. House objects therefore go to
   houseProxies, a pick list only the raycast uses while inHouse; everything
   else goes to proxies.

   Two more containment rules ride along:
     - interior objects are EXEMPT from the +WX world shift. Shifting them puts
       your furniture 112 tiles east of the room it belongs to.
     - an interior in a walkable dead zone must START hidden, not become hidden
       on first entry.

   Run: node harness/containtest.mjs
   ========================================================================== */
import {runPass, Suite, PRELUDE, SRC} from './_lib.mjs';

const T = runPass(PRELUDE + String.raw`
  setLevel('construction', 99);
  clearInv(); give('coins', 20000000);

  /* how the two pick lists stand before we ever go inside */
  o.outdoorProxies0 = proxies.length;
  o.houseProxies0 = houseProxies.length;

  freshHouse();
  const LAYOUT = [[0,0,'kitchen'],[2,0,'bedroom'],[0,1,'workshop'],[1,1,'garden']];
  for(const [gx, gy, t] of LAYOUT) houseBuildRoom(gx, gy, t);
  /* build a few pieces so there is real furniture to contain */
  for(const [key, fid] of [['1,0:hearth','hf_hearth'], ['0,0:range','hf_clayoven'], ['2,0:bed','hf_oakbed']]){
    const F = HOUSE_FURNITURE[fid];
    give(F.plankId || 'oak_plank', F.planks | 0); give('iron_nails', F.nails | 0);
    houseBuild(key, fid);
  }
  since();
  o.builtSlots = Object.keys(houseSlots()).length;

  o.outdoorProxies1 = proxies.length;
  o.houseProxies1 = houseProxies.length;
  o.houseProxiesGrew = o.houseProxies1 > o.houseProxies0;
  o.outdoorProxiesFlat = o.outdoorProxies1 === o.outdoorProxies0;

  /* ---- the raycast picks from the RIGHT list ----
     There is no WebGL offline, so intersectObjects always returns []. What can be
     proved is which list the raycast is handed — that is the containment rule. */
  o.pickListInside = (typeof inHouse !== 'undefined' && inHouse) ? 'houseProxies' : 'proxies';

  /* ---- interior objects are exempt from the +WX shift ---- */
  /* every house object must sit inside the HOUSE region, not 112 tiles east */
  o.houseObjs = objects.filter(q => q.def && (String(q.def).slice(0,3) === 'hf_' || q.def === 'house_exit' || q.def === 'house_butler'));
  o.strayHouseObjs = o.houseObjs.filter(q =>
    q.x < HOUSE.x0 || q.x > HOUSE.x1 || q.y < HOUSE.y0 || q.y > HOUSE.y1)
    .map(q => q.def + '@' + q.x + ',' + q.y);
  o.houseObjCount = o.houseObjs.length;

  /* and no OUTDOOR object has wandered into the house footprint */
  o.outdoorInHouse = objects.filter(q => {
    const d = q.def || '';
    if(String(d).slice(0,3) === 'hf_' || d === 'house_exit' || d === 'house_butler') return false;
    return q.x >= HOUSE.x0 && q.x <= HOUSE.x1 && q.y >= HOUSE.y0 && q.y <= HOUSE.y1;
  }).map(q => q.def + '@' + q.x + ',' + q.y);

  /* ---- leaving hides the house group and shows the world ---- */
  exitHouse();
  o.outside = {houseGroupVisible: houseGroup.visible, worldGroupVisible: worldGroup.visible,
               inHouse: inHouse, tilesAreMain: tiles === TILES_MAIN};
  /* the house objects are gone from the live object list, not merely invisible */
  o.houseObjsAfterExit = objects.filter(q => q.def && String(q.def).slice(0,3) === 'hf_').length;
  o.houseProxiesAfterExit = houseProxies.length;

  /* THE SYMPTOM, not just the bookkeeping: from the deep wilderness, does that
     patch of grass offer you house furniture, and does it block? */
  o.exposedOutdoors = [];
  o.invisibleWalls = 0;
  for(let y = HOUSE.y0; y <= HOUSE.y1; y++)
    for(let x = HOUSE.x0; x <= HOUSE.x1; x++){
      const opts = optionsAt(x, y).map(q => q.label || String(q.html || ''));
      const houseOpt = opts.find(l => /Cook-on|Burn-logs-on|Pray-at|Search |Hit |Ring |Inspect |Open |Read |Drink-from|Travel-to|Take-stock-in|Look-through|Shoot-at|Throw |Deal /.test(l));
      if(houseOpt) o.exposedOutdoors.push(x + ',' + y + ': ' + houseOpt);
      const ob = (typeof objAt === 'function') ? objAt(x, y) : null;
      if(ob && ob.def && String(ob.def).slice(0, 3) === 'hf_') o.invisibleWalls++;
    }

  enterHouse();
  o.inside = {houseGroupVisible: houseGroup.visible, worldGroupVisible: worldGroup.visible};
  o.houseObjsBackOnEntry = objects.filter(q => q.def && String(q.def).slice(0,3) === 'hf_').length;
  exitHouse();

  /* ---- rebuilding does not leak proxies ----
     houseRebuild marks houseProxies' length and truncates back to it, so repeated
     rebuilds must not grow the list without bound. */
  enterHouse();
  const p0 = houseProxies.length;
  for(let k = 0; k < 5; k++) houseRebuild();
  o.proxiesAfterRebuilds = houseProxies.length;
  o.proxyLeak = houseProxies.length - p0;
  const obj0 = objects.length;
  for(let k = 0; k < 5; k++) houseRebuild();
  o.objectLeak = objects.length - obj0;
  exitHouse();

  return o;
`);

const S = new Suite('containtest').guard(T);

S.ok('the house builds some furniture to contain', T.builtSlots >= 3, `${T.builtSlots} pieces`);
S.ok('house objects exist inside',                T.houseObjCount > 0, `${T.houseObjCount} objects`);

S.ok('HOUSE OBJECTS GO TO houseProxies',          T.houseProxiesGrew,
     `${T.houseProxies0} -> ${T.houseProxies1}`);
S.ok('  AND NOT TO THE OUTDOOR PICK LIST',        T.outdoorProxiesFlat,
     `outdoor proxies ${T.outdoorProxies0} -> ${T.outdoorProxies1}`);
S.eq('  the raycast uses houseProxies inside',    T.pickListInside, 'houseProxies');

S.eq('NO HOUSE OBJECT ESCAPES THE REGION',        T.strayHouseObjs.length, 0);
if(T.strayHouseObjs.length) S.note('the +WX shift caught them: ' + T.strayHouseObjs.slice(0, 8).join(', '));
S.eq('no outdoor object sits inside the house',   T.outdoorInHouse.length, 0);
if(T.outdoorInHouse.length) S.note(T.outdoorInHouse.slice(0, 8).join(', '));

S.eq('leaving hides the house group',             T.outside.houseGroupVisible, false);
S.eq('  and shows the world',                     T.outside.worldGroupVisible, true);
S.eq('  swapping the tile map back',              T.outside.tilesAreMain, true);
S.eq('LEAVING CLEARS THE HOUSE OBJECTS',          T.houseObjsAfterExit, 0);
S.ok('  and truncates the interior pick list',    T.houseProxiesAfterExit <= 1,
     `${T.houseProxiesAfterExit} left (the cottage door is a permanent fixture and stays)`);
/* the symptom the teardown exists to prevent */
S.eq('NO HOUSE FURNITURE IS CLICKABLE FROM THE WILDERNESS', T.exposedOutdoors.length, 0);
if(T.exposedOutdoors.length) S.note(T.exposedOutdoors.slice(0, 6).join('; '));
S.eq('  AND NO INVISIBLE WALLS ARE LEFT ON THE GRASS', T.invisibleWalls, 0);
S.ok('entering brings them back',                 T.houseObjsBackOnEntry > 0,
     `${T.houseObjsBackOnEntry} objects`);
S.eq('  and shows the house group',               T.inside.houseGroupVisible, true);
S.eq('  hiding the world',                        T.inside.worldGroupVisible, false);

S.eq('REPEATED REBUILDS LEAK NO PROXIES',         T.proxyLeak, 0);
S.eq('  and no objects',                          T.objectLeak, 0);

/* source: the routing rule and the dead-zone rule */
S.ok('addProxy routes hf_ objects to houseProxies',
     /houseProxies\.push/.test(SRC) && /_d\.slice\(0,3\)==='hf_'/.test(SRC));
S.ok('  and everything else to proxies',          /else proxies\.push\(m\)/.test(SRC));
S.ok('the raycast switches list on inHouse',      /inHouse\)\?houseProxies:/.test(SRC.replace(/\s/g, '')));
S.ok('exitHouse tears the furniture down',        /function exitHouse\(\)[\s\S]{0,1800}?_houseObjs\.length=0/.test(SRC));
S.ok('interior objects are exempt from +WX',      /INT_DEFS\.has\(o\.def\)\)o\.x\+=WX/.test(SRC.replace(/\s/g, '')));
S.ok('house defs are listed in INT_DEFS',         /INT_DEFS[\s\S]{0,200}hf_slot/.test(SRC));

S.report(
  'House furniture lives only in the interior pick list, stays inside the region, and is cleared on exit without leaking.',
  'that hover and click actually respect it — Raycaster returns nothing offline, so picking needs a browser.');
