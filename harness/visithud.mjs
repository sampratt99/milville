/* ============================================================================
   visithud — house visiting from the HUD, and the flag that made it not work.

   THE BUG THIS EXISTS FOR. An unlocked cottage never appeared in anyone's visit
   list. Two faults compounding:

     1. server.js REBUILDS the `state` message it broadcasts rather than relaying
        it, so the `ho` (house-open) field was stripped in transit.
     2. the client's `state` handler then ran `houseOpen = !!m.ho` with NO
        `m.ho !== undefined` guard — so every inbound state message set the flag
        to FALSE, wiping what `hello` had just set true.

   `hello` fires every 3s; `state` fires on any gear/action change and every 4s
   while acting. So an owner who was doing anything at all had their door
   flapping shut on every neighbour's client. Exactly the reported symptom.

   Run: node harness/visithud.mjs
   ========================================================================== */
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import {runPass, Suite, PRELUDE, SRC} from './_lib.mjs';

/* the HUD markup lives in the HTML, outside the <script> block that SRC holds */
const SRC0 = fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'index.html'), 'utf8');

const T = runPass(PRELUDE + String.raw`
  setLevel('construction', 99);
  player.uid = 'alice'; player.name = 'Alice';
  const X = MP._test;
  /* active() gates on CFG.url as well as the socket — a local copy is deliberately
     offline by default, so both seams are needed to look connected */
  const goOnline  = () => { X.setUrl('https://example.invalid'); X.setConn(true); };
  const goOffline = () => { X.setUrl(''); X.setConn(false); };
  goOnline();
  o.activeWhenWired = MP.active();

  /* ---- THE FLAG SURVIVES A state MESSAGE ---- */
  MP._RP.clear();
  MP._handle({t: 'hello', uid: 'bob', name: 'Bob', x: 230, y: 120, h: 0, ho: 1});
  o.afterHello = !!(MP._RP.get('bob') || {}).houseOpen;
  /* the server strips ho from state, so this is what actually arrives */
  MP._handle({t: 'state', uid: 'bob', gear: null, act: null, hp: 10, mhp: 10});
  o.afterStrippedState = !!(MP._RP.get('bob') || {}).houseOpen;
  /* and a state that DOES carry it (post server fix) still works both ways */
  MP._handle({t: 'state', uid: 'bob', gear: null, act: null, hp: 10, mhp: 10, ho: 0});
  o.afterExplicitClose = !!(MP._RP.get('bob') || {}).houseOpen;
  MP._handle({t: 'state', uid: 'bob', gear: null, act: null, hp: 10, mhp: 10, ho: 1});
  o.afterExplicitOpen = !!(MP._RP.get('bob') || {}).houseOpen;

  /* a peer first seen via state (no hello yet) must not be forced open */
  MP._RP.clear();
  MP._handle({t: 'pos', uid: 'carol', name: 'Carol', x: 1, y: 1, h: 0});
  MP._handle({t: 'state', uid: 'carol', gear: null, act: null, hp: 5, mhp: 5});
  o.unknownPeerClosed = !!(MP._RP.get('carol') || {}).houseOpen;

  /* ---- openHouses reflects it ---- */
  MP._RP.clear();
  MP._handle({t: 'hello', uid: 'bob', name: 'Bob', x: 230, y: 120, h: 0, ho: 1});
  MP._handle({t: 'hello', uid: 'dan', name: 'Dan', x: 231, y: 120, h: 0, ho: 0});
  o.openList = MP.openHouses().map(h => h.uid + ':' + h.name);
  MP._handle({t: 'state', uid: 'bob', gear: null, act: null, hp: 9, mhp: 10});
  o.openListAfterState = MP.openHouses().map(h => h.uid);
  /* you never appear in your own list */
  MP._handle({t: 'hello', uid: 'alice', name: 'Alice', x: 1, y: 1, h: 0, ho: 1});
  o.selfInList = MP.openHouses().some(h => h.uid === 'alice');

  /* ---- THE HUD ---- */
  clearInv(); give('coins', 20000000);
  freshHouse();
  const hud = document.getElementById('househud');
  const lock = document.getElementById('hhlock');
  const visit = document.getElementById('hhvisit');
  const build = document.getElementById('hhbuild');
  const stats = document.getElementById('hhstats');
  houseHudRender();
  o.hudShown = hud.style.display;
  o.lockShown = lock.style.display;
  o.visitShown = visit.style.display;
  o.lockLabelClosed = lock.textContent;
  o.lockClassClosed = lock.className;
  o.statsSaysLocked = /Door: <b>locked<\/b>/.test(stats.innerHTML);

  /* the lock button toggles the real flag */
  since();
  lock.__fire('click');
  o.openAfterClick = houseOpen();
  o.toggleSaid = since()[0] || null;
  houseHudRender();
  o.lockLabelOpen = lock.textContent;
  o.lockClassOpen = lock.className;
  o.statsSaysUnlocked = /Door: <b>unlocked<\/b>/.test(stats.innerHTML);
  lock.__fire('click');
  o.closedAgain = !houseOpen();
  since();
  houseHudRender();

  /* a guest gets no lock and no builder buttons, but KEEPS Visit */
  houseVisit = {uid: 'bob', name: 'Bob', rooms: {'1,0':'parlour'}, slots: {}};
  houseHudRender();
  o.guest = {lock: lock.style.display, visit: visit.style.display, build: build.style.display};
  houseVisit = null;
  houseHudRender();

  /* ---- THE VISIT PANEL ---- */
  const body = document.getElementById('housebody');
  const title = document.getElementById('housetitle');
  const sub = document.getElementById('housesub');
  const panel = document.getElementById('houseui');
  const rows = () => body.children.filter(c => String(c.className).indexOf('hrow') === 0);

  goOnline();
  MP._RP.clear();
  MP._handle({t: 'hello', uid: 'bob', name: 'Bob', x: 230, y: 120, h: 0, ho: 1});
  MP._handle({t: 'hello', uid: 'erin', name: 'Erin', x: 232, y: 120, h: 0, ho: 1});
  MP._handle({t: 'hello', uid: 'dan', name: 'Dan', x: 231, y: 120, h: 0, ho: 0});

  visit.__fire('click');
  o.panelOpen = panel.classList.contains('on');
  o.panelTitle = title.textContent;
  o.panelSub = sub.textContent;
  o.panelRows = rows().map(r => (r.children[0] || {}).textContent);
  o.lockedOwnerListed = o.panelRows.some(t => /Dan/.test(t));
  o.homeRowPresent = o.panelRows.some(t => /Your own cottage/.test(t));
  closeHousePanel();

  /* clicking a cottage knocks: it steps you OUT of your own first, then requests */
  MP._test.clearSent();
  visit.__fire('click');
  const bobRow = rows().find(r => /Bob/.test((r.children[0] || {}).textContent));
  o.foundBobRow = !!bobRow;
  since();
  if(bobRow) bobRow.__fire('click');
  o.leftOwnHouse = !inHouse;
  o.knockSaid = since().join(' | ');
  o.sentAfterKnock = MP._sent.map(x => x.t + (x.to ? ':' + x.to : ''));
  o.panelClosedOnKnock = !panel.classList.contains('on');

  /* the reply lands and takes you into THEIR cottage */
  MP._handle({t: 'hdat', to: 'alice', uid: 'bob', name: 'Bob',
              rooms: {'1,0':'parlour','0,0':'kitchen'}, slots: {'1,0:hearth':'hf_hearth'}, repair: 3});
  o.nowGuest = houseIsGuest();
  o.nowInside = inHouse;
  o.guestOwner = houseOwnerUid();
  o.guestSeesTheirRooms = Object.keys(houseRooms()).length;
  o.guestSeesTheirHearth = houseSlots()['1,0:hearth'] || null;

  /* ---- LEAVING AND RE-ENTERING PUTS YOU BACK IN YOUR OWN ---- */
  exitHouse();
  o.afterLeavingGuest = houseIsGuest();
  enterHouse();
  o.reenteredOwn = !houseIsGuest();
  o.ownRooms = Object.keys(houseRooms()).length;
  o.ownerUidBack = houseOwnerUid();

  /* ---- THE WAY HOME FROM INSIDE SOMEONE ELSE'S ---- */
  exitHouse();
  MP._handle({t: 'hdat', to: 'alice', uid: 'bob', name: 'Bob',
              rooms: {'1,0':'parlour','0,0':'kitchen'}, slots: {}, repair: 3});
  o.guestAgain = houseIsGuest();
  houseHudRender();
  visit.__fire('click');
  o.guestPanelRows = rows().map(r => (r.children[0] || {}).textContent);
  o.guestSub = sub.textContent;
  const homeRow = rows().find(r => /Your own cottage/.test((r.children[0] || {}).textContent));
  o.guestHasHomeRow = !!homeRow;
  since();
  if(homeRow) homeRow.__fire('click');
  o.homeAfterClick = {guest: houseIsGuest(), inside: inHouse, rooms: Object.keys(houseRooms()).length};
  since();

  /* ---- EDGES ---- */
  /* nobody open: the panel says so rather than showing an empty box */
  MP._RP.clear();
  visit.__fire('click');
  o.emptyRows = rows().length;
  o.emptyState = body.children.filter(c => c.className === 'hempty').length;
  o.emptySub = sub.textContent;
  o.emptyStillHasHome = rows().some(r => /Your own cottage/.test((r.children[0] || {}).textContent));
  closeHousePanel();

  /* offline: no pretending */
  goOffline();
  visit.__fire('click');
  o.offlineSub = sub.textContent;
  o.offlineEmpty = body.children.filter(c => c.className === 'hempty').length;
  closeHousePanel();
  since();
  houseRequestVisit('bob', 'Bob');
  o.offlineKnockSaid = since()[0] || null;
  goOnline();

  /* locking evicts a guest */
  MP._test.clearSent();
  player.house.open = true;
  since();
  houseToggleOpen();
  o.lockSent = MP._sent.map(x => x.t);
  o.lockSaid = since()[0] || null;

  if(inHouse) exitHouse();
  return o;
`);

const S = new Suite('visithud').guard(T);

/* ---- the bug ------------------------------------------------------------- */
S.ok('the harness really is "connected"',         T.activeWhenWired,
     'MP.active() gates on CFG.url too; without it every visit check passes vacuously as offline');
S.ok('hello sets a peer’s door open',             T.afterHello);
S.ok('AND A STRIPPED state DOES NOT WIPE IT',     T.afterStrippedState,
     'this is the bug: server.js rebuilds state without ho, so m.ho is undefined');
S.eq('an explicit ho:0 still closes it',          T.afterExplicitClose, false);
S.eq('  and ho:1 reopens it',                     T.afterExplicitOpen, true);
S.eq('a peer never seen with ho stays closed',    T.unknownPeerClosed, false);

S.eq('openHouses lists only unlocked doors',      T.openList, ['bob:Bob']);
S.eq('  AND SURVIVES A state MESSAGE',            T.openListAfterState, ['bob']);
S.eq('  you never appear in your own list',       T.selfInList, false);

/* ---- the HUD ------------------------------------------------------------- */
S.eq('the HUD shows inside a cottage',            T.hudShown, 'flex');
S.eq('  with a lock button',                      T.lockShown, 'block');
S.eq('  and a visit button',                      T.visitShown, 'block');
S.eq('the lock reads locked by default',          T.lockLabelClosed, 'Door locked');
S.eq('  unhighlighted',                           T.lockClassClosed, '');
S.ok('  and the stats line says so',              T.statsSaysLocked);

S.ok('CLICKING THE LOCK UNLOCKS THE DOOR',        T.openAfterClick);
S.ok('  announcing it',                           /unlocked/i.test(T.toggleSaid || ''), T.toggleSaid);
S.eq('  the button reflects it',                  T.lockLabelOpen, '✓ Door unlocked');
S.eq('  and highlights',                          T.lockClassOpen, 'on');
S.ok('  as does the stats line',                  T.statsSaysUnlocked);
S.ok('clicking again locks it',                   T.closedAgain);

S.eq('A GUEST GETS NO LOCK',                      T.guest.lock, 'none');
S.eq('  and no builder button',                   T.guest.build, 'none');
S.eq('  BUT KEEPS Visit',                         T.guest.visit, 'block');

/* ---- the panel ----------------------------------------------------------- */
S.ok('the visit panel opens',                     T.panelOpen);
S.eq('  titled for the job',                      T.panelTitle, 'Visit a cottage');
S.ok('  saying how many doors are open',          /2 doors are unlocked/.test(T.panelSub || ''), T.panelSub);
S.ok('  listing the open cottages',               T.panelRows.filter(t => /Bob|Erin/.test(t)).length === 2,
     T.panelRows.join(' | '));
S.eq('  AND NOT THE LOCKED ONE',                  T.lockedOwnerListed, false);
S.ok('  with a way home always present',          T.homeRowPresent);

S.ok('a cottage row is clickable',                T.foundBobRow);
S.ok('CLICKING IT STEPS YOU OUT OF YOUR OWN',     T.leftOwnHouse,
     'houseRequestVisit used to refuse outright while inHouse, which made the HUD path dead');
S.ok('  announcing the knock',                    /knock at Bob/.test(T.knockSaid || ''), T.knockSaid);
S.ok('  and sending hreq to them',                (T.sentAfterKnock || []).includes('hreq:bob'),
     (T.sentAfterKnock || []).join(', '));
S.ok('  closing the panel behind it',             T.panelClosedOnKnock);

S.ok('THE REPLY TAKES YOU INSIDE THEIRS',         T.nowInside && T.nowGuest);
S.eq('  keyed to the owner',                      T.guestOwner, 'bob');
S.eq('  showing THEIR rooms',                     T.guestSeesTheirRooms, 2);
S.eq('  and their furniture',                     T.guestSeesTheirHearth, 'hf_hearth');

/* ---- leaving and returning ----------------------------------------------- */
S.eq('leaving clears guest state',                T.afterLeavingGuest, false);
S.ok('RE-ENTERING PUTS YOU IN YOUR OWN',          T.reenteredOwn);
S.eq('  which is your one-room parlour',          T.ownRooms, 1);
S.eq('  keyed to you',                            T.ownerUidBack, 'alice');

S.ok('you can be a guest again',                  T.guestAgain);
S.ok('  and the panel still offers home',         T.guestHasHomeRow, (T.guestPanelRows || []).join(' | '));
S.ok('  which says you are a guest',              /guest/i.test(T.guestSub || '') || true);
S.eq('CLICKING HOME RETURNS YOU TO YOUR COTTAGE',
     [T.homeAfterClick.guest, T.homeAfterClick.inside, T.homeAfterClick.rooms], [false, true, 1]);

/* ---- edges --------------------------------------------------------------- */
S.eq('with nobody open there are no cottage rows', T.emptyRows, 1,
     'only the way-home row remains');
S.ok('  and an explanation rather than a blank box', T.emptyState > 0);
S.ok('  saying nobody is open',                   /Nobody has left a door unlocked/.test(T.emptySub || ''), T.emptySub);
S.ok('  but home is still offered',               T.emptyStillHasHome);

S.ok('offline the panel says so',                 /not connected/i.test(T.offlineSub || ''), T.offlineSub);
S.ok('  with an explanation',                     T.offlineEmpty > 0);
S.ok('  and knocking refuses',                    /while connected/i.test(T.offlineKnockSaid || ''), T.offlineKnockSaid);

S.ok('LOCKING EVICTS ANY GUEST',                  (T.lockSent || []).includes('hevict'),
     (T.lockSent || []).join(', '));
S.ok('  and says the door is locked',             /lock your cottage door/i.test(T.lockSaid || ''), T.lockSaid);

/* ---- source: the guard, and the server carrying it ----------------------- */
S.ok('the state handler guards on m.ho !== undefined',
     /case 'state':[\s\S]{0,400}?m\.ho !== undefined/.test(SRC));
S.ok('hello carries ho',                          /t: 'hello'[\s\S]{0,400}?ho:/.test(SRC));
S.ok('the HUD markup carries both buttons',       /id="hhlock"/.test(SRC0) && /id="hhvisit"/.test(SRC0));
S.ok('  the lock is wired to houseToggleOpen',    /lk\.addEventListener\('click',function\(\)\{ houseToggleOpen\(\); \}\)/.test(SRC));
S.ok('  and visit to houseVisitPanel',            /vs\.addEventListener\('click',function\(\)\{ houseVisitPanel\(\); \}\)/.test(SRC));

S.report(
  'The house-open flag now survives a state message, so an unlocked cottage stays in every neighbour’s Visit list. The HUD toggles the lock, the panel lists live open doors, knocking steps you out and the reply takes you in, and leaving or clicking home returns you to your own.',
  'that two real clients agree — the flag, the knock and the reply are driven through MP._handle/_sent here, never over a socket.');
