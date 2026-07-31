/* ============================================================================
   funcfurn — furniture that actually DOES something, and its menu order.

   Two things this locks down:

   1. Every functional piece offers its action. A stove that cannot be cooked on
      is just a model.
   2. THE ORDER. optionsAt's FIRST entry is what a left click runs, so on a
      built piece Examine goes ahead of the build options — upgrading spends
      money and Remove tears the thing out, and neither should be what a stray
      click does. Flat pieces (a rug is floor, not furniture) put Walk here
      first so they do not steal the click at all.

   There is no way to simulate a click offline — the shim has no WebGL and
   Raycaster returns nothing — so this calls optionsAt directly on the tile and
   asserts on the labels it hands back, in order.

   Run: node harness/funcfurn.mjs
   ========================================================================== */
import {runPass, Suite, PRELUDE} from './_lib.mjs';

/* piece -> the verb its menu must offer */
const FUNCTIONAL = {
  hf_stove: 'Cook-on', hf_clayoven: 'Cook-on',
  hf_firepit: 'Burn-logs-on', hf_hearth: 'Burn-logs-on',
  hf_altar: 'Pray-at', hf_shrine: 'Pray-at', hf_niche: 'Pray-at',
  hf_chest: 'Search', hf_wardrobe: 'Search',
  hf_dummy: 'Hit', hf_dummy_mail: 'Hit',
  hf_dartboard: 'Throw', hf_cardtable: 'Deal',
  hf_weaponrack: 'Inspect', hf_armourstand: 'Inspect',
  hf_caperack: 'Inspect', hf_pethouse: 'Inspect',
  hf_trophy: 'Inspect', hf_shelf: 'Inspect', hf_case: 'Inspect',
  hf_bell: 'Ring', hf_bellpull: 'Ring',
  hf_spyglass: 'Look-through', hf_telescope: 'Look-through',
  hf_rangetarget: 'Shoot-at', hf_elembalance: 'Read',
  hf_sparmat: 'Take-stock-in', hf_combatring: 'Take-stock-in',
  hf_toybox: 'Open', hf_treasurechest: 'Open',
  hf_focus: 'Read', hf_greaterfocus: 'Read',
  hf_well: 'Drink-from', hf_fountain: 'Drink-from',
  hf_basin: 'Drink-from', hf_sink: 'Drink-from',
  hf_portal: 'Travel-to', hf_portal_lesser: 'Travel-to', hf_greatgate: 'Travel-to',
};

const T = runPass(PRELUDE + String.raw`
  const WANT = ${JSON.stringify(FUNCTIONAL)};
  setLevel('construction', 99);

  const slotFor = cat => {
    for(const rk in HOUSE_ROOMS){
      const s = HOUSE_ROOMS[rk].slots.find(q => q.cat === cat);
      if(s) return {room: rk, id: s.id};
    }
    return null;
  };
  /* build one piece into a one-room house and read its tile menu */
  const menuFor = (fid, buildMode) => {
    const F = HOUSE_FURNITURE[fid];
    const where = slotFor(F.cat);
    if(!where) return {err: 'no hotspot for ' + F.cat};
    houseBuildMode = false;
    player.house.rooms = {}; player.house.rooms['1,0'] = where.room;
    player.house.slots = {};
    clearInv(); give('coins', 10000000);
    if(F.planks | 0) give(F.plankId || 'oak_plank', F.planks | 0);
    if(F.nails | 0) give('iron_nails', F.nails | 0);
    since();
    houseBuild('1,0:' + where.id, fid);
    if(houseSlots()['1,0:' + where.id] !== fid) return {err: 'did not build: ' + (since()[0] || '?')};
    houseBuildMode = !!buildMode;
    houseRebuild();
    const S0 = houseSlotByKey('1,0:' + where.id);
    if(!S0) return {err: 'no slot object'};
    return {labels: optionsAt(S0.x, S0.y).map(q => q.label || String(q.html || '')),
            tile: {x: S0.x, y: S0.y}};
  };

  freshHouse();

  /* ---- 1. every functional piece offers its verb ---- */
  o.missingVerb = [];
  o.examineNotFirstAfterAction = [];
  o.buildOptionFirst = [];
  for(const fid in WANT){
    if(!HOUSE_FURNITURE[fid]){ o.missingVerb.push(fid + ': not in the table'); continue; }
    const m = menuFor(fid, false);
    if(m.err){ o.missingVerb.push(fid + ': ' + m.err); continue; }
    const verb = WANT[fid];
    if(!m.labels.some(l => l.startsWith(verb))) o.missingVerb.push(fid + ': wanted "' + verb + '", got [' + m.labels.join(' | ') + ']');
    /* the action comes first, Examine after it */
    if(m.labels[0] && !m.labels[0].startsWith(verb) && m.labels[0] !== 'Walk here')
      o.examineNotFirstAfterAction.push(fid + ': first is "' + m.labels[0] + '"');
  }

  /* ---- 2. ORDER on a plain built piece (nothing functional about it) ---- */
  o.plainName = HOUSE_FURNITURE.hf_painting.name;
  o.plain = menuFor('hf_painting', false);
  o.plainBuildMode = menuFor('hf_painting', true);

  /* ---- 3. a functional piece in build mode: Remove must never be first ---- */
  o.funcBuildMode = menuFor('hf_hearth', true);

  /* ---- 4. every piece, in build mode: nothing destructive first ---- */
  o.destructiveFirst = [];
  o.noExamine = [];
  for(const fid in HOUSE_FURNITURE){
    const m = menuFor(fid, true);
    if(m.err) continue;
    const first = m.labels[0] || '';
    if(/^Remove\b/.test(first) || /^Replace\b/.test(first)) o.destructiveFirst.push(fid + ': "' + first + '"');
    if(!m.labels.some(l => /^Examine\b/.test(l))) o.noExamine.push(fid);
  }

  /* ---- 5. a rug is FLOOR: Walk here must come first ---- */
  o.flatPieces = Object.keys(HOUSE_FURNITURE).filter(f => OBJ_DEFS[f] && OBJ_DEFS[f].flatFloor);
  o.flatNotWalkFirst = [];
  for(const fid of o.flatPieces){
    const m = menuFor(fid, false);
    if(m.err) continue;
    if((m.labels[0] || '') !== 'Walk here') o.flatNotWalkFirst.push(fid + ': "' + (m.labels[0] || '') + '"');
  }

  /* ---- 6. a guest gets no build options at all ---- */
  const m2 = menuFor('hf_hearth', true);
  houseVisit = {uid: 'bob', name: 'Bob', rooms: Object.assign({}, houseRooms()), slots: Object.assign({}, houseSlots())};
  houseRebuild();
  {
    const S0 = houseSlotByKey(Object.keys(houseSlots())[0]);
    o.guestLabels = S0 ? optionsAt(S0.x, S0.y).map(q => q.label || String(q.html || '')) : [];
  }
  houseVisit = null;

  /* ---- 7. an EMPTY slot outside build mode offers nothing ---- */
  player.house.rooms = {'1,0': 'parlour'}; player.house.slots = {};
  houseBuildMode = false; houseRebuild();
  {
    const S0 = houseSlotByKey('1,0:hearth');
    o.emptyNoBuildMode = S0 ? optionsAt(S0.x, S0.y).map(q => q.label || String(q.html || '')) : null;
    houseBuildMode = true; houseRebuild();
    o.emptyBuildMode = S0 ? optionsAt(S0.x, S0.y).map(q => q.label || String(q.html || '')) : null;
  }
  houseBuildMode = false;

  if(inHouse) exitHouse();
  return o;
`);

const S = new Suite('funcfurn').guard(T);

const wantCount = Object.keys(FUNCTIONAL).length;
S.eq(`all ${wantCount} functional pieces offer their action`, T.missingVerb.length, 0);
if(T.missingVerb.length) S.note(T.missingVerb.slice(0, 8).join('\n        '));
S.eq('  and the action is what a left click runs', T.examineNotFirstAfterAction.length, 0);
if(T.examineNotFirstAfterAction.length) S.note(T.examineNotFirstAfterAction.slice(0, 8).join('; '));

/* a plain piece */
S.eq('a plain built piece leads with Examine',    (T.plain.labels || [])[0], 'Examine ' + T.plainName);
S.eq('  and offers nothing else outside build mode', (T.plain.labels || []).length, 1);
S.eq('IN BUILD MODE EXAMINE IS STILL FIRST',      (T.plainBuildMode.labels || [])[0], 'Examine ' + T.plainName);
S.ok('  with the build options after it',         (T.plainBuildMode.labels || []).length > 1,
     (T.plainBuildMode.labels || []).join(' | '));

/* a functional piece in build mode */
S.eq('a functional piece leads with its action',  (T.funcBuildMode.labels || [])[0], 'Burn-logs-on Stone hearth');
S.ok('  then Examine',                            /^Examine/.test((T.funcBuildMode.labels || [])[1] || ''),
     (T.funcBuildMode.labels || []).join(' | '));
S.ok('  and Remove is LAST',                      /^Remove/.test((T.funcBuildMode.labels || []).slice(-1)[0] || ''),
     (T.funcBuildMode.labels || []).join(' | '));

/* the sweep */
S.eq('NO PIECE PUTS Remove OR Replace FIRST',     T.destructiveFirst.length, 0);
if(T.destructiveFirst.length) S.note(T.destructiveFirst.slice(0, 10).join('\n        '));
S.eq('every built piece can be examined',         T.noExamine.length, 0);
if(T.noExamine.length) S.note(T.noExamine.slice(0, 10).join(', '));

/* flat pieces */
S.ok('there are flat, walkable pieces',           T.flatPieces.length > 0, T.flatPieces.join(', '));
S.eq('A RUG IS FLOOR — Walk here comes first',    T.flatNotWalkFirst.length, 0);
if(T.flatNotWalkFirst.length) S.note(T.flatNotWalkFirst.join('; '));

/* guests */
S.ok('a guest gets no build or remove options',
     !(T.guestLabels || []).some(l => /^(Build|Remove|Replace)\b/.test(l)),
     (T.guestLabels || []).join(' | '));

/* empty slots */
S.eq('AN EMPTY SLOT IS INERT OUTSIDE BUILD MODE', (T.emptyNoBuildMode || []).length, 0);
S.ok('  and offers Build inside it',              (T.emptyBuildMode || []).some(l => /^Build /.test(l)),
     (T.emptyBuildMode || []).join(' | '));
S.ok('  with Examine last, never first',          /^Examine/.test((T.emptyBuildMode || []).slice(-1)[0] || ''),
     (T.emptyBuildMode || []).join(' | '));

S.report(
  'Every functional piece offers its action, and no menu puts a destructive option under a left click.',
  'that clicking actually reaches these menus — Raycaster picks nothing offline, so hover needs a browser.');
