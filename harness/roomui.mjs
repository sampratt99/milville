/* ============================================================================
   roomui — the room picker screen.

   ONE MENU ENTRY. Picking a room is a decision worth a proper screen, not a
   right-click list where whichever room happened to be first became the
   left-click default. houseRoomOptions therefore returns exactly one option —
   "Build room" — which opens the picker.

   The picker itself has to be honest: list what you can build here, price it,
   mark what you cannot afford, and never offer a room that is already yours.

   Run: node harness/roomui.mjs
   ========================================================================== */
import {runPass, Suite, PRELUDE} from './_lib.mjs';

const T = runPass(PRELUDE + String.raw`
  setLevel('construction', 99);
  clearInv(); give('coins', 20000000);
  freshHouse();
  houseBuildMode = true; houseRebuild();

  const body = document.getElementById('housebody');
  const title = document.getElementById('housetitle');
  const sub = document.getElementById('housesub');
  const el = document.getElementById('houseui');
  const rows = () => body.children.filter(c => String(c.className).indexOf('hrow') === 0);

  /* ---- ONE MENU ENTRY ---- */
  const marker = objects.find(q => q.def === 'hf_expand');
  o.markerFound = !!marker;
  o.markerOptions = marker ? optionsAt(marker.x, marker.y).map(q => q.label || String(q.html || '')) : [];
  o.buildRoomEntries = o.markerOptions.filter(l => /Build room/i.test(l)).length;
  o.namesARoomInTheMenu = o.markerOptions.some(l =>
    Object.keys(HOUSE_ROOMS).some(k => l.indexOf(HOUSE_ROOMS[k].name) >= 0));
  o.roomOptionsRaw = marker ? houseRoomOptions(marker.expandTo[0], marker.expandTo[1]).length : null;

  /* ---- THE PICKER ---- */
  openRoomPicker(0, 0);
  o.open = el.classList.contains('on');
  o.title = title.textContent;
  o.sub = sub.textContent;
  o.rowCount = rows().length;
  o.choices = houseRoomChoices(0, 0);
  o.rowLabels = rows().map(r => (r.children[0] || {}).textContent);
  o.rowPrices = rows().map(r => (r.children[1] || {}).textContent);
  /* every listed room is a real, untaken, legal choice */
  o.listedNotChoosable = o.rowLabels.filter(n =>
    !o.choices.some(k => HOUSE_ROOMS[k].name === n));
  o.choicesNotListed = o.choices.filter(k => !o.rowLabels.includes(HOUSE_ROOMS[k].name));
  /* prices match the table */
  o.priceMismatch = [];
  for(let i = 0; i < o.rowLabels.length; i++){
    const k = Object.keys(HOUSE_ROOMS).find(q => HOUSE_ROOMS[q].name === o.rowLabels[i]);
    if(!k) continue;
    if(o.rowPrices[i] !== fmt(HOUSE_ROOMS[k].cost) + ' gp')
      o.priceMismatch.push(o.rowLabels[i] + ': ' + o.rowPrices[i] + ' vs ' + fmt(HOUSE_ROOMS[k].cost));
  }
  /* a footnote explains the omissions */
  o.footnote = body.children.filter(c => c.className === 'housesub').map(c => c.textContent)[0] || null;
  o.affordableFlags = rows().map(r => String(r.className).indexOf('on') >= 0);
  closeHousePanel();

  /* ---- THE CENTRE OFFERS ONLY THE GARDEN ---- */
  openRoomPicker(HOUSE_CENTRE.gx, HOUSE_CENTRE.gy);
  o.centreRows = rows().map(r => (r.children[0] || {}).textContent);
  o.gardenName = HOUSE_ROOMS.garden.name;
  closeHousePanel();

  /* ---- AFFORDABILITY ---- */
  clearInv(); give('coins', HOUSE_ROOMS.workshop.cost);
  openRoomPicker(0, 0);
  o.pooredRows = rows().length;
  o.pooredAffordable = rows().filter(r => String(r.className).indexOf('on') >= 0)
    .map(r => (r.children[0] || {}).textContent);
  const roomsBefore = Object.keys(houseRooms()).length;
  const unaffordable = rows().find(r => String(r.className).indexOf('on') < 0);
  if(unaffordable) unaffordable.__fire('click');
  o.unaffordableBuilt = Object.keys(houseRooms()).length > roomsBefore;
  o.panelStillOpenAfterDudClick = el.classList.contains('on');
  closeHousePanel();

  /* the affordable one DOES build, and closes the panel */
  clearInv(); give('coins', 20000000);
  openRoomPicker(0, 0);
  const good = rows().find(r => String(r.className).indexOf('on') >= 0);
  o.goodLabel = good ? (good.children[0] || {}).textContent : null;
  since();
  if(good) good.__fire('click');
  o.builtByClick = Object.keys(houseRooms()).length > roomsBefore;
  o.closedAfterBuild = !el.classList.contains('on');
  o.buildSaid = since()[0] || null;

  /* ---- A FULL GRID ---- */
  for(const [gx, gy, t] of [[2,0,'bedroom'],[0,1,'workshop'],[1,1,'garden'],
                            [2,1,'study'],[0,2,'games'],[1,2,'chapel'],[2,2,'combat']])
    houseBuildRoom(gx, gy, t);
  since();
  o.filled = Object.keys(houseRooms()).length;
  /* no cell is free, so no expansion marker offers a picker */
  houseRebuild();
  o.markersWhenFull = objects.filter(q => q.def === 'hf_expand').length;

  /* opening the picker on an occupied cell lists nothing buildable there */
  openRoomPicker(1, 0);
  o.occupiedRows = rows().length;
  o.occupiedEmpty = body.children.filter(c => c.className === 'hempty').length;
  o.occupiedSub = sub.textContent;
  closeHousePanel();

  houseBuildMode = false;
  if(inHouse) exitHouse();
  return o;
`);

const S = new Suite('roomui').guard(T);

/* one menu entry */
S.ok('a bare wall carries an expansion marker',   T.markerFound);
S.eq('IT OFFERS EXACTLY ONE BUILD ENTRY',         T.buildRoomEntries, 1);
S.eq('  and never names a room in the menu',      T.namesARoomInTheMenu, false,
     'a right-click list made whichever room came first the left-click default');
S.eq('  houseRoomOptions returns one option',     T.roomOptionsRaw, 1);

/* the picker */
S.ok('the picker opens',                          T.open);
S.eq('  titled Build a room',                     T.title, 'Build a room');
S.ok('  explaining one of each',                  /One of each to a house/i.test(T.sub || ''), T.sub);
S.ok('  with a row per choice',                   T.rowCount === T.choices.length,
     `${T.rowCount} rows for ${T.choices.length} choices`);
S.eq('  listing nothing you cannot build there',  T.listedNotChoosable.length, 0);
if(T.listedNotChoosable.length) S.note(T.listedNotChoosable.join(', '));
S.eq('  and omitting nothing you can',            T.choicesNotListed.length, 0);
if(T.choicesNotListed.length) S.note(T.choicesNotListed.join(', '));
S.eq('  priced from the table',                   T.priceMismatch.length, 0);
if(T.priceMismatch.length) S.note(T.priceMismatch.join('; '));
S.ok('  with a footnote about what is missing',   /already built/i.test(T.footnote || ''), T.footnote);

S.eq('THE CENTRE OFFERS ONLY THE GARDEN',         T.centreRows.length, 1);
S.eq('  and it is the garden',                    T.centreRows[0], T.gardenName);

/* affordability */
S.ok('a thin purse still lists every room',       T.pooredRows > 1, `${T.pooredRows} rows`);
S.ok('  marking only what you can afford',        T.pooredAffordable.length >= 1 && T.pooredAffordable.length < T.pooredRows,
     `affordable: ${T.pooredAffordable.join(', ')}`);
S.eq('CLICKING AN UNAFFORDABLE ROW BUILDS NOTHING', T.unaffordableBuilt, false);
S.ok('  and leaves the picker open',              T.panelStillOpenAfterDudClick,
     'a dud click must not feel like a successful one');

S.ok('clicking an affordable row builds it',      T.builtByClick, String(T.goodLabel));
S.ok('  and closes the picker',                   T.closedAfterBuild);
S.ok('  announcing the build',                    /You build a/.test(T.buildSaid || ''), T.buildSaid);

/* full grid */
S.eq('a full grid has nine rooms',                T.filled, 9);
S.eq('  and no expansion markers left',           T.markersWhenFull, 0);
S.ok('the picker on a taken cell says so',        T.occupiedEmpty > 0 || T.occupiedRows > 0,
     `${T.occupiedRows} rows, ${T.occupiedEmpty} empty-state rows, sub: "${T.occupiedSub}"`);

S.report(
  'A bare wall offers one entry, the picker lists exactly the legal choices at table prices, an unaffordable row builds nothing, and a full grid offers no markers.',
  'the picker’s layout and how it reads on screen — the shim never parses innerHTML or does layout.');
