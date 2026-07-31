/* ============================================================================
   housepanel — the house UI: the room picker, the staff panel, the HUD.

   The trap this exists for (docs/23 §9): A PANEL FLAG MUST NEVER OUTLIVE ITS
   WORLD. `bankOpen` left true after a house bank chest routed every inventory
   click to depositSlot. exitToMainMap now dismisses bank and shop, and
   reconcileCounters() heals a desync every frame.

   The shim keeps classList and caches elements by id, so `.on` really does
   persist and a listener attached at load is still there to fire. What it
   cannot do is parse innerHTML into nodes — so rows are counted through the
   builder callback, and assertions about markup are made against the string.

   Run: node harness/housepanel.mjs
   ========================================================================== */
import {runPass, Suite, PRELUDE, SRC} from './_lib.mjs';

const T = runPass(PRELUDE + String.raw`
  setLevel('construction', 99);
  clearInv(); give('coins', 20000000);
  freshHouse();

  const el = document.getElementById('houseui');
  const title = document.getElementById('housetitle');
  const sub = document.getElementById('housesub');
  const body = document.getElementById('housebody');
  const isOpen = () => el.classList.contains('on');

  /* ---- open / close ---- */
  o.closedAtStart = !isOpen();
  openHousePanel('A title', 'a subtitle', bd => { bd.innerHTML = '<i>x</i>'; });
  o.openAfterOpen = isOpen();
  o.title = title.textContent;
  o.sub = sub.textContent;
  closeHousePanel();
  o.closedAfterClose = !isOpen();

  /* ---- THE ROOM PICKER ---- */
  openRoomPicker(0, 0);
  o.pickerOpen = isOpen();
  o.pickerTitle = title.textContent;
  o.pickerRows = body.children.length;
  o.pickerChoices = houseRoomChoices(0, 0).length;
  /* every listed room is one you have not built, and the garden is not offered off-centre */
  o.pickerOffersGarden = houseRoomChoices(0, 0).includes('garden');
  o.centrePickerOffersOnlyGarden = houseRoomChoices(1, 1).join(',');

  /* clicking a row builds that room and CLOSES the panel */
  const roomsBefore = Object.keys(houseRooms()).length;
  const firstRow = body.children.find ? body.children.find(c => c.className.indexOf('hrow') === 0)
                                      : body.children[0];
  since();
  if(firstRow) firstRow.__fire('click');
  o.roomsAfterClick = Object.keys(houseRooms()).length;
  o.builtByClick = o.roomsAfterClick > roomsBefore;
  o.panelClosedAfterBuild = !isOpen();
  o.clickSaid = since()[0] || null;
  closeHousePanel();

  /* a broke player sees the rooms but cannot click them */
  clearInv(); give('coins', 5);
  openRoomPicker(2, 0);
  o.brokeRows = body.children.length;
  const brokeRow = body.children[0];
  o.brokeRowDisabled = brokeRow ? brokeRow.className.indexOf('on') < 0 : null;
  const roomsBeforeBroke = Object.keys(houseRooms()).length;
  if(brokeRow) brokeRow.__fire('click');
  o.brokeBuiltAnyway = Object.keys(houseRooms()).length > roomsBeforeBroke;
  closeHousePanel();
  clearInv(); give('coins', 20000000);

  /* ---- THE STAFF PANEL ---- */
  butlerPanel();
  o.staffOpen = isOpen();
  o.staffTitle = title.textContent;
  o.staffRows = body.children.length;
  o.butlerCount = BUTLERS.length;
  closeHousePanel();

  /* ---- THE HUD ---- */
  const hud = document.getElementById('househud');
  const hudTitle = document.getElementById('hhtitle');
  const hudStats = document.getElementById('hhstats');
  const hudBuild = document.getElementById('hhbuild');
  const hudStaff = document.getElementById('hhstaff');
  houseHudRender();
  o.hudShownInside = hud.style.display;
  o.hudTitleInside = hudTitle.textContent;
  o.hudStatsMentionsLevel = /Construction/.test(hudStats.innerHTML);
  o.hudBuildShown = hudBuild.style.display;
  o.hudStaffShown = hudStaff.style.display;

  /* a guest gets no builder buttons */
  houseVisit = {uid: 'bob', name: 'Bob', rooms: Object.assign({}, houseRooms()), slots: {}};
  houseHudRender();
  o.hudTitleGuest = hudTitle.textContent;
  o.hudBuildHiddenForGuest = hudBuild.style.display === 'none';
  o.hudStaffHiddenForGuest = hudStaff.style.display === 'none';
  houseVisit = null;
  houseHudRender();

  /* outside the house the HUD hides itself */
  exitHouse();
  houseHudRender();
  o.hudHiddenOutside = hud.style.display;

  /* ---- THE PANEL-FLAG TRAP ---- */
  freshHouse();
  bankOpen = true;
  if(typeof bankEl !== 'undefined' && bankEl) bankEl.classList.add('on');
  o.bankOpenBeforeExit = bankOpen;
  exitHouse();
  o.bankOpenAfterExit = bankOpen;

  /* build mode must not survive the world swap either */
  freshHouse();
  houseToggleBuildMode();
  o.buildModeOn = houseBuildMode;
  since();
  exitHouse();
  o.buildModeAfterExit = houseBuildMode;

  /* reconcileCounters heals a flag whose panel is not actually showing */
  bankOpen = true;
  if(typeof bankEl !== 'undefined' && bankEl) bankEl.classList.remove('on');
  reconcileCounters();
  o.bankOpenAfterReconcile = bankOpen;

  /* ---- build mode is refused to guests ---- */
  freshHouse();
  houseBuildMode = false;
  houseVisit = {uid: 'bob', name: 'Bob', rooms: {}, slots: {}};
  since();
  houseToggleBuildMode();
  o.guestBuildMode = houseBuildMode;
  o.guestSaid = since()[0] || null;
  houseVisit = null;

  if(inHouse) exitHouse();
  return o;
`);

const S = new Suite('housepanel').guard(T);

/* open / close */
S.ok('the panel starts closed',                   T.closedAtStart);
S.ok('openHousePanel opens it',                   T.openAfterOpen);
S.eq('  with the title it was given',             T.title, 'A title');
S.eq('  and the subtitle',                        T.sub, 'a subtitle');
S.ok('closeHousePanel closes it',                 T.closedAfterClose);

/* the room picker */
S.ok('the room picker opens',                     T.pickerOpen);
S.eq('  titled for the job',                      T.pickerTitle, 'Build a room');
S.ok('  listing one row per available room',      T.pickerRows >= T.pickerChoices,
     `${T.pickerRows} rows for ${T.pickerChoices} choices`);
S.eq('  and no garden off-centre',                T.pickerOffersGarden, false);
S.eq('  while the centre offers only the garden', T.centrePickerOffersOnlyGarden, 'garden');

S.ok('CLICKING A ROW BUILDS THE ROOM',            T.builtByClick,
     'the listener attached at build time is still live');
S.ok('  and closes the panel behind it',          T.panelClosedAfterBuild);
S.ok('  announcing the build',                    /You build a/.test(T.clickSaid || ''), T.clickSaid);

S.ok('a broke player still sees the rooms',       T.brokeRows > 0, `${T.brokeRows} rows`);
S.ok('  but the row is not marked affordable',    T.brokeRowDisabled);
S.eq('  AND CLICKING IT BUILDS NOTHING',          T.brokeBuiltAnyway, false);

/* the staff panel */
S.ok('the staff panel opens',                     T.staffOpen);
S.ok('  listing the hires',                       T.staffRows >= T.butlerCount,
     `${T.staffRows} rows for ${T.butlerCount} hires`);

/* the HUD */
S.eq('the HUD shows inside the house',            T.hudShownInside, 'flex');
S.eq('  named for the owner',                     T.hudTitleInside, 'Your cottage');
S.ok('  showing the Construction level',          T.hudStatsMentionsLevel);
S.ok('  with both builder buttons',               T.hudBuildShown !== 'none' && T.hudStaffShown !== 'none');
S.eq('a guest sees whose cottage it is',          T.hudTitleGuest, 'Bob’s cottage');
S.ok('  and NO builder buttons',                  T.hudBuildHiddenForGuest && T.hudStaffHiddenForGuest);
S.eq('the HUD hides outside the house',           T.hudHiddenOutside, 'none');

/* the trap */
S.ok('bankOpen was set before the swap',          T.bankOpenBeforeExit,
     'if this were false the next check would pass for the wrong reason');
S.eq('A PANEL FLAG DOES NOT OUTLIVE ITS WORLD',   T.bankOpenAfterExit, false);
S.ok('build mode was on before the swap',         T.buildModeOn);
S.eq('  and build mode does not either',          T.buildModeAfterExit, false);
S.eq('reconcileCounters heals a stale flag',      T.bankOpenAfterReconcile, false);

/* guests */
S.eq('A GUEST CANNOT ENTER BUILD MODE',           T.guestBuildMode, false);
S.ok('  and is told whose cottage it is',         /someone else|not your/i.test(T.guestSaid || ''), T.guestSaid);

/* source: the swap has to dismiss counters from every exit, not just this one */
S.ok('exitHouse dismisses bank and shop',         /function exitHouse\(\)[\s\S]{0,400}?closeBank\(\)[\s\S]{0,200}?closeShop\(\)/.test(SRC));
S.ok('exitToMainMap does too',                    /function exitToMainMap\(\)[\s\S]{0,600}?closeBank/.test(SRC));

S.report(
  'The picker and staff panels open, their rows are live, the HUD tracks owner vs guest, and no panel flag survives a world swap.',
  'panel layout, CSS and how any of it looks — the shim never parses innerHTML or does layout.');
