/* ============================================================================
   visittest — being a guest in somebody else's cottage (docs/23 §8).

   A guest sees the OWNER's rooms and furniture, touches nothing, and leaves
   cleanly. The state that makes that work is houseVisit: while it is set,
   houseRooms()/houseSlots() read from it instead of from player.house, and
   every mutator refuses.

   The failure this guards against is a guest's visit leaking into their own
   save — walking out of someone's mansion and finding it is now your cottage.

   Run: node harness/visittest.mjs
   ========================================================================== */
import {runPass, Suite, PRELUDE} from './_lib.mjs';

const T = runPass(PRELUDE + String.raw`
  setLevel('construction', 99);
  clearInv(); give('coins', 20000000);

  /* ---- my own modest cottage: parlour + kitchen, one hearth ---- */
  freshHouse();
  houseBuildRoom(0, 0, 'kitchen');
  const HF = HOUSE_FURNITURE.hf_hearth;
  give(HF.plankId || 'oak_plank', HF.planks | 0); give('iron_nails', HF.nails | 0);
  houseBuild('1,0:hearth', 'hf_hearth');
  since();
  o.mine = {rooms: Object.assign({}, houseRooms()), slots: Object.assign({}, houseSlots())};
  o.mineRoomCount = Object.keys(o.mine.rooms).length;
  exitHouse();

  /* ---- Bob's grander place, handed over the wire ---- */
  const BOB = {
    rooms: {'1,0':'parlour', '0,0':'study', '2,0':'chapel', '1,1':'garden'},
    slots: {'1,0:hearth':'hf_firepit', '0,0:bookcase':'hf_bookcase', '2,0:altar':'hf_altar'},
    repair: 3,
  };
  houseEnterVisit('bob-uid', 'Bob', BOB);
  since();

  o.isGuest = houseIsGuest();
  o.ownerUid = houseOwnerUid();
  o.ownerName = houseOwnerName();
  o.inHouse = inHouse;
  /* the guest reads the OWNER's house, not their own */
  o.seenRooms = Object.assign({}, houseRooms());
  o.seenSlots = Object.assign({}, houseSlots());
  o.seesBobsRooms = Object.keys(o.seenRooms).length === Object.keys(BOB.rooms).length;
  o.seesBobsStudy = o.seenRooms['0,0'] === 'study';
  o.seesBobsAltar = o.seenSlots['2,0:altar'] === 'hf_altar';
  o.doesNotSeeMyKitchen = o.seenRooms['0,0'] !== 'kitchen';

  /* the carve followed the owner's layout */
  const studyOrg = roomOrigin(0, 0);
  o.bobStudyCarved = houseTiles[studyOrg.y + 5][studyOrg.x + 5] === T_FLOOR;
  const emptyOrg = roomOrigin(2, 2);
  o.bobEmptySolid = houseTiles[emptyOrg.y + 5][emptyOrg.x + 5] === T_WALL;

  /* ---- A GUEST CHANGES NOTHING ---- */
  const coinsBefore = coinsCount();
  since();
  houseBuildRoom(2, 1, 'games');
  o.guestBuiltRoom = !!houseRooms()['2,1'];
  o.guestRoomSaid = since()[0] || null;

  give('oak_plank', 20); give('iron_nails', 20);
  since();
  houseBuild('0,0:lectern', 'hf_readingstand');
  o.guestBuiltFurniture = !!houseSlots()['0,0:lectern'];
  o.guestBuildSaid = since()[0] || null;

  since();
  houseRemove('2,0:altar');
  o.guestRemoved = !houseSlots()['2,0:altar'];
  o.guestRemoveSaid = since()[0] || null;

  since();
  houseToggleBuildMode();
  o.guestBuildMode = houseBuildMode;

  since();
  butlerHire('third');
  o.guestHired = !!butlerState();
  o.guestHireSaid = since()[0] || null;

  o.guestSpent = coinsBefore - coinsCount();

  /* the owner's data itself is untouched by any of that */
  o.bobRoomsStill = Object.keys(BOB.rooms).length;
  o.bobSlotsStill = Object.keys(BOB.slots).length;

  /* ---- LEAVING: my own house must be exactly as I left it ---- */
  exitHouse();
  o.guestAfterLeaving = houseIsGuest();
  o.atDoorstep = {x: player.x, y: player.y};
  o.myRoomsAfter = Object.assign({}, player.house.rooms);
  o.mySlotsAfter = Object.assign({}, player.house.slots);
  o.myHouseIntact = JSON.stringify(o.myRoomsAfter) === JSON.stringify(o.mine.rooms) &&
                    JSON.stringify(o.mySlotsAfter) === JSON.stringify(o.mine.slots);
  o.bobsRoomsDidNotLeak = !Object.values(o.myRoomsAfter).includes('chapel');

  /* and going home shows my house, not his */
  enterHouse();
  o.homeRooms = Object.assign({}, houseRooms());
  o.homeIsMine = JSON.stringify(o.homeRooms) === JSON.stringify(o.mine.rooms);
  o.homeOwnerUid = houseOwnerUid();
  exitHouse();

  /* ---- KNOCKING FROM INSIDE IS NOW ALLOWED ----
     It used to refuse with "Leave your own cottage first", which made the whole
     feature unreachable from the house HUD — the only place it is now offered.
     Knocking steps you out of whichever cottage you are standing in first. */
  MP._test.setUrl('https://example.invalid'); MP._test.setConn(true);
  MP._test.clearSent();
  enterHouse();
  o.insideBeforeKnock = inHouse;
  since();
  houseRequestVisit('carol-uid', 'Carol');
  o.knockWhileInside = since().join(' | ');
  o.leftOnKnock = !inHouse;
  o.knockSent = MP._sent.map(x => x.t + (x.to ? ':' + x.to : ''));
  MP._test.setUrl(''); MP._test.setConn(false);
  if(inHouse) exitHouse();

  /* offline it still refuses, and says why */
  since();
  houseRequestVisit('carol-uid', 'Carol');
  o.offlineKnock = since()[0] || null;

  /* ---- an eviction drops you out ---- */
  houseEnterVisit('bob-uid', 'Bob', BOB);
  o.evictStartsInside = inHouse && houseIsGuest();
  exitHouse();
  o.afterEvictGuest = houseIsGuest();
  o.afterEvictInside = inHouse;

  return o;
`);

const S = new Suite('visittest').guard(T);

/* arriving */
S.ok('entering a visit makes you a guest',        T.isGuest);
S.eq('  keyed to the owner',                      T.ownerUid, 'bob-uid');
S.eq('  named for the owner',                     T.ownerName, 'Bob');
S.ok('  and you are inside',                      T.inHouse);

S.ok('A GUEST SEES THE OWNER’S ROOMS',            T.seesBobsRooms,
     `${Object.keys(T.seenRooms).length} rooms`);
S.ok('  including rooms you do not own',          T.seesBobsStudy);
S.ok('  and the owner’s furniture',               T.seesBobsAltar);
S.ok('  not your own layout',                     T.doesNotSeeMyKitchen);
S.ok('the carve follows the owner’s grid',        T.bobStudyCarved);
S.ok('  and their unbuilt cells stay solid',      T.bobEmptySolid);

/* touching nothing */
S.eq('A GUEST BUILDS NO ROOM',                    T.guestBuiltRoom, false);
S.ok('  and is told whose cottage it is',         /not your cottage/i.test(T.guestRoomSaid || ''), T.guestRoomSaid);
S.eq('A GUEST BUILDS NO FURNITURE',               T.guestBuiltFurniture, false);
S.ok('  and is told',                             /not your cottage/i.test(T.guestBuildSaid || ''), T.guestBuildSaid);
S.eq('A GUEST REMOVES NOTHING',                   T.guestRemoved, false);
S.eq('A GUEST CANNOT ENTER BUILD MODE',           T.guestBuildMode, false);
S.eq('A GUEST HIRES NO STAFF',                    T.guestHired, false);
S.ok('  and is told',                             /not your cottage|not your staff/i.test(T.guestHireSaid || ''), T.guestHireSaid);
S.eq('  and none of it cost a coin',              T.guestSpent, 0);
S.eq('the owner’s rooms are untouched',           T.bobRoomsStill, 4);
S.eq('the owner’s furniture is untouched',        T.bobSlotsStill, 3);

/* leaving */
S.eq('leaving clears guest state',                T.guestAfterLeaving, false);
S.eq('  and puts you on your own doorstep',       [T.atDoorstep.x, T.atDoorstep.y], [231, 110]);
S.ok('YOUR OWN HOUSE IS EXACTLY AS YOU LEFT IT',  T.myHouseIntact,
     `rooms ${JSON.stringify(T.myRoomsAfter)}`);
S.ok('  and none of the owner’s rooms leaked in', T.bobsRoomsDidNotLeak);
S.ok('going home shows YOUR house',               T.homeIsMine, JSON.stringify(T.homeRooms));
S.ok('  keyed to you, not the owner',             T.homeOwnerUid !== 'bob-uid', T.homeOwnerUid);

/* edges */
S.ok('you were inside before knocking',           T.insideBeforeKnock);
S.ok('KNOCKING FROM INSIDE STEPS YOU OUT',        T.leftOnKnock,
     'it used to refuse outright, which made the house HUD path dead');
S.ok('  announcing the knock',                    /knock at Carol/i.test(T.knockWhileInside || ''), T.knockWhileInside);
S.ok('  and sending the request',                 (T.knockSent || []).includes('hreq:carol-uid'),
     (T.knockSent || []).join(', '));
S.ok('offline it still refuses',                  /while connected/i.test(T.offlineKnock || ''), T.offlineKnock);
S.ok('a visit can be left at any time',           T.evictStartsInside);
S.eq('  clearing guest state',                    T.afterEvictGuest, false);
S.eq('  and putting you outside',                 T.afterEvictInside, false);

S.report(
  'A guest sees the owner’s house, cannot change anything in it, and leaves with their own cottage untouched.',
  'the knock/accept handshake between two real clients — that needs 2+ browsers.');
