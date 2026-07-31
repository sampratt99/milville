/* ============================================================================
   mphouse — the seven-case house visibility matrix (docs/23 §8).

   Every cottage is stamped into the SAME dead-zone footprint, so without an
   owner tag two people standing in their own houses would read as being in one
   room. _mpRoom() keys by owner; a guest borrows the owner's key.

   Run: node harness/mphouse.mjs

   This proves the room-keying LOGIC. Whether two browsers actually see each
   other is a live test and always will be.
   ========================================================================== */
import {runPass, Suite, PRELUDE, SRC} from './_lib.mjs';

const T = runPass(PRELUDE + String.raw`
  /* MP keeps _mpRoom/_remoteHere in its closure and exposes them as a test seam */
  const X = MP._test;
  player.uid = 'me';

  /* put the player in one of the three places that matter, and read the beacon */
  const beacon = where => {
    inHouse = false; houseVisit = null;
    if(where === 'home'){ inHouse = true; }
    if(where === 'visiting'){ inHouse = true; houseVisit = {uid:'bob', name:'Bob', rooms:{}, slots:{}}; }
    return X.room();
  };

  /* can I see a peer whose own beacon says 'peerRoom'? */
  const sees = (where, peerRoom) => {
    const mine = beacon(where);
    X.setPeerRoom('them', peerRoom);
    return {mine, visible: X.remoteHere({uid:'them', x:230, y:111})};
  };

  o.roomOutdoors = beacon('outdoors');
  o.roomHome     = beacon('home');
  o.roomVisiting = beacon('visiting');

  /* two owners each at home are in DIFFERENT rooms */
  inHouse = true; houseVisit = null; player.uid = 'alice';
  o.aliceHome = X.room();
  player.uid = 'bob';
  o.bobHome = X.room();
  player.uid = 'me';

  /* a guest takes the OWNER's key */
  inHouse = true; houseVisit = {uid:'bob', name:'Bob'};
  o.guestKey = X.room();
  houseVisit = null;

  /* ---- the matrix ---- */
  o.m = {};
  o.m.outdoors_theyHome  = sees('outdoors', 'house:bob');   /* hidden  */
  o.m.outdoors_theyOut   = sees('outdoors', null);          /* visible */
  o.m.home_theyOwnHome   = sees('home',     'house:bob');   /* hidden  */
  o.m.home_theyOut       = sees('home',     null);          /* hidden  */
  o.m.home_theyVisitMe   = sees('home',     'house:me');    /* visible */
  o.m.visiting_ownerHome = sees('visiting', 'house:bob');   /* visible */
  o.m.visiting_thirdHouse= sees('visiting', 'house:carol'); /* hidden  */

  /* the open/locked flag */
  player.house = {owned:true, repair:3, open:false, rooms:null, slots:{}, slotsV2:1};
  o.lockedByDefault = houseOpen();
  player.house.open = true;
  o.openReads = houseOpen();

  inHouse = false; houseVisit = null;
  return o;
`);

const S = new Suite('mphouse').guard(T);

/* room keying */
S.eq('outdoors beacons no room',                  T.roomOutdoors, null);
S.eq('at home the beacon is keyed by owner',      T.roomHome, 'house:me');
S.eq('visiting beacons the OWNER, not you',       T.roomVisiting, 'house:bob');
S.ok('two owners at home are in DIFFERENT rooms', T.aliceHome !== T.bobHome,
     `${T.aliceHome} vs ${T.bobHome}`);
S.eq('a guest takes the owner key',               T.guestKey, 'house:bob');

/* the seven cases, in the order docs/23 §8 lists them */
const m = T.m;
S.eq('outdoors, they are in their house -> hidden',   m.outdoors_theyHome.visible, false);
S.eq('outdoors, they are outdoors -> visible',        m.outdoors_theyOut.visible, true);
S.eq('at home, they are in THEIR home -> hidden',     m.home_theyOwnHome.visible, false);
S.eq('at home, they are outdoors -> hidden',          m.home_theyOut.visible, false);
S.eq('at home, they are visiting me -> visible',      m.home_theyVisitMe.visible, true);
S.eq('visiting, the owner is home -> visible',        m.visiting_ownerHome.visible, true);
S.eq('visiting, a third party in a third house -> hidden', m.visiting_thirdHouse.visible, false);

/* the door flag */
S.eq('a new cottage is locked',                   T.lockedByDefault, false);
S.eq('opening the door reads back',               T.openReads, true);

/* ---- source checks: wiring that has no runtime seam ---------------------- */
/* An idle player sends no `state` at all, so the open flag MUST also ride `hello`
   or a neighbour never learns the door was opened. */
const helloLines = SRC.split('\n').filter(l => /t:\s*'hello'/.test(l));
S.ok('the open flag rides `hello`, not just `state`',
     helloLines.length > 0 && helloLines.every(l => /ho:/.test(l)),
     `${helloLines.filter(l => /ho:/.test(l)).length} of ${helloLines.length} hello sends carry ho:`);
S.ok('`state` carries it too',                    /case 'state':[\s\S]{0,400}?houseOpen\s*=\s*!!m\.ho/.test(SRC));
S.ok('the visit protocol is hreq -> hdat',        SRC.includes("case 'hreq'") && SRC.includes("case 'hdat'"));
S.ok('  with a hdeny path',                       SRC.includes("t: 'hdeny'"));
S.ok('a locked door denies with why:locked',      /hdeny'[^}]*why:\s*'locked'/.test(SRC));
S.ok('a houseless owner denies with why:nohouse', /hdeny'[^}]*why:\s*'nohouse'/.test(SRC));
S.ok('locking EVICTS guests',                     SRC.includes("'hevict'"));
S.ok('house objects use their own pick list',     SRC.includes('houseProxies'));
S.ok('the house has its own minimap',             SRC.includes('miniBaseHouse') && SRC.includes('houseRepaintMinimap'));

S.report(
  'House rooms are keyed by owner and all seven visibility cases hold.',
  'whether two real browsers see each other — that needs 2+ clients, always.');
