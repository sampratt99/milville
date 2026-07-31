/* ============================================================================
   housedir — mp-server/houses.js, the directory that makes OFFLINE visiting work.

   Visiting used to require the owner online: a guest sent `hreq` over the socket
   and the OWNER'S OWN CLIENT answered with `hdat`. No client, no answer — so a
   cottage was only visitable while its owner happened to be logged in, which is
   not what "leave the door unlocked" means.

   The house is now published to the server, so anyone can list open doors and
   fetch a layout with the owner asleep. Like market.js and world_state.js this
   file takes no Cloudflare imports, so it drives directly here.

   Run: node harness/housedir.mjs
   ========================================================================== */
import {Suite} from './_lib.mjs';
import {publishHouse, closeHouse, listHouses, getHouse, sweepHouses, _internals}
  from '../mp-server/houses.js';

function makeStore(){
  const m = new Map();
  return {
    _m: m,
    async get(k){ return m.get(k); },
    async put(k, v){ m.set(k, v); },
    async delete(k){ return m.delete(k); },
    async list({prefix} = {}){
      const out = new Map();
      for(const [k, v] of m) if(!prefix || k.startsWith(prefix)) out.set(k, v);
      return out;
    },
  };
}
let CLOCK = 1000000;
const now = () => CLOCK;
const S = new Suite('housedir');
const STALE = _internals.STALE;

const HOUSE = {
  uid: 'alice', name: 'Alice', open: true, repair: 3,
  rooms: {'1,0': 'parlour', '0,0': 'kitchen', '2,1': 'chapel'},
  slots: {'1,0:hearth': 'hf_hearth', '0,0:range': 'hf_clayoven'},
};

/* ---- publishing ---------------------------------------------------------- */
{
  const st = makeStore();
  const r = await publishHouse(st, now, HOUSE);
  S.ok('a house publishes',                       r.ok);
  S.eq('  keeping its rooms',                     r.rooms, 3);
  S.eq('  and its furniture',                     r.slots, 2);
  S.eq('  under a house: key',                    [...st._m.keys()], ['house:alice']);
  const rec = st._m.get('house:alice');
  S.eq('  stamped with the time',                 rec.t, CLOCK);
  S.eq('  and the door state',                    rec.open, true);
  S.eq('a bad uid is refused',                    (await publishHouse(st, now, {uid: ''})).ok, false);
}

/* ---- THE POINT: an OFFLINE owner is still listed ------------------------- */
{
  const st = makeStore();
  await publishHouse(st, now, HOUSE);
  const list = await listHouses(st, now, {self: 'bob'});
  S.eq('AN OFFLINE OWNER IS STILL LISTED',        list.rows.length, 1,
       'no socket, no client, no knock — the whole point');
  S.eq('  by name',                               list.rows[0].name, 'Alice');
  S.eq('  with a room count',                     list.rows[0].rooms, 3);

  const got = await getHouse(st, now, {uid: 'alice'});
  S.ok('AND THEIR LAYOUT CAN BE FETCHED',         got.ok);
  S.eq('  the rooms',                             Object.keys(got.rooms).length, 3);
  S.eq('  the furniture',                         got.slots['1,0:hearth'], 'hf_hearth');
  S.eq('  and the repair stage',                  got.repair, 3);
}

/* ---- the door actually gates it ------------------------------------------ */
{
  const st = makeStore();
  await publishHouse(st, now, HOUSE);
  await closeHouse(st, now, {uid: 'alice'});
  S.eq('A LOCKED DOOR DROPS OUT OF THE LIST',     (await listHouses(st, now, {})).rows.length, 0);
  const got = await getHouse(st, now, {uid: 'alice'});
  S.eq('  and cannot be fetched',                 got.ok, false);
  S.eq('  saying why',                            got.error, 'locked');
  S.ok('  but the record survives for re-opening', !!st._m.get('house:alice'));
  await publishHouse(st, now, HOUSE);
  S.eq('re-opening lists it again',               (await listHouses(st, now, {})).rows.length, 1);
  /* publishing with open:false is the same as closing */
  await publishHouse(st, now, Object.assign({}, HOUSE, {open: false}));
  S.eq('publishing a locked door delists it too', (await listHouses(st, now, {})).rows.length, 0);
}

/* ---- a wreck is not visitable -------------------------------------------- */
{
  const st = makeStore();
  await publishHouse(st, now, Object.assign({}, HOUSE, {repair: 1}));
  S.eq('AN UNFINISHED COTTAGE IS NOT LISTED',     (await listHouses(st, now, {})).rows.length, 0,
       'there is nothing inside to step into');
  const got = await getHouse(st, now, {uid: 'alice'});
  S.eq('  nor fetchable',                         got.ok, false);
  S.eq('  saying why',                            got.error, 'unfinished');
}

/* ---- you are never your own guest ---------------------------------------- */
{
  const st = makeStore();
  await publishHouse(st, now, HOUSE);
  await publishHouse(st, now, Object.assign({}, HOUSE, {uid: 'bob', name: 'Bob'}));
  S.eq('the list excludes yourself',              (await listHouses(st, now, {self: 'alice'})).rows.map(r => r.uid), ['bob']);
  S.eq('  and includes both for a third party',   (await listHouses(st, now, {self: 'carol'})).rows.length, 2);
}

/* ---- newest first -------------------------------------------------------- */
{
  const st = makeStore();
  CLOCK = 1000; await publishHouse(st, now, Object.assign({}, HOUSE, {uid: 'old', name: 'Old'}));
  CLOCK = 9000; await publishHouse(st, now, Object.assign({}, HOUSE, {uid: 'new', name: 'New'}));
  S.eq('the most recently touched is first',      (await listHouses(st, now, {})).rows.map(r => r.uid), ['new', 'old']);
}

/* ---- A HOSTILE PAYLOAD CANNOT BE STORED AND RESERVED ---------------------- */
{
  const st = makeStore();
  CLOCK = 1000;
  await publishHouse(st, now, {
    uid: 'evil', name: 'x'.repeat(200), open: true, repair: 99,
    rooms: {'1,0': 'parlour', 'not a cell': 'kitchen', '9,9': '<script>', '2,2': 'study'},
    slots: {'1,0:hearth': 'hf_hearth', 'junk': 'hf_rug', '0,0:bad key!': 'hf_rug'},
  });
  const rec = st._m.get('house:evil');
  S.ok('the name is clamped',                     rec.name.length <= 24, `${rec.name.length} chars`);
  S.ok('the repair stage is clamped',             rec.repair <= 9, String(rec.repair));
  S.eq('MALFORMED CELL KEYS ARE DROPPED',         Object.keys(rec.rooms).sort(), ['1,0', '2,2']);
  S.eq('  as are malformed room ids',             rec.rooms['9,9'], undefined);
  S.eq('MALFORMED SLOT KEYS ARE DROPPED',         Object.keys(rec.slots), ['1,0:hearth']);
  S.ok('  and the good data survives',            rec.rooms['1,0'] === 'parlour' && rec.slots['1,0:hearth'] === 'hf_hearth');
}
{
  /* the caps hold */
  const st = makeStore();
  const rooms = {}, slots = {};
  for(let i = 0; i < 200; i++) rooms[i % 100 + ',' + Math.floor(i / 100)] = 'parlour';
  for(let i = 0; i < 900; i++) slots['1,0:s' + i] = 'hf_rug';
  await publishHouse(st, now, {uid: 'big', name: 'B', open: true, repair: 3, rooms, slots});
  const rec = st._m.get('house:big');
  S.ok('the room count is capped',                Object.keys(rec.rooms).length <= _internals.MAX_ROOMS,
       `${Object.keys(rec.rooms).length} of ${_internals.MAX_ROOMS}`);
  S.ok('the slot count is capped',                Object.keys(rec.slots).length <= _internals.MAX_SLOTS,
       `${Object.keys(rec.slots).length} of ${_internals.MAX_SLOTS}`);
}
{
  /* nothing private is ever stored, whatever the client sends */
  const st = makeStore();
  await publishHouse(st, now, Object.assign({}, HOUSE, {
    inv: [{id: 'coins', qty: 999}], bank: [{id: 'emberbrand', qty: 1}], skills: {attack: 99}, coins: 1e9}));
  const rec = st._m.get('house:alice');
  S.eq('A SNAPSHOT CARRIES ONLY THE HOUSE',       Object.keys(rec).sort(),
       ['name', 'open', 'repair', 'rooms', 'slots', 't', 'uid']);
  S.ok('  no inventory, bank, skills or coins',
       !('inv' in rec) && !('bank' in rec) && !('skills' in rec) && !('coins' in rec));
}

/* ---- stale records ------------------------------------------------------- */
{
  const st = makeStore();
  CLOCK = 1000;
  await publishHouse(st, now, HOUSE);
  CLOCK = 1000 + STALE + 1;
  S.eq('a month-old house drops off the list',    (await listHouses(st, now, {})).rows.length, 0);
  S.ok('  but a LISTING does not delete it',      !!st._m.get('house:alice'),
       'a pure read must never mutate — market.js learned that with double-refunded offers');
  await publishHouse(st, now, Object.assign({}, HOUSE, {uid: 'someone-else'}));
  S.eq('  the next publish sweeps it',            st._m.get('house:alice'), undefined);
  S.eq('  leaving the fresh one',                 (await listHouses(st, now, {})).rows.length, 1);
}

/* ---- missing houses ------------------------------------------------------ */
{
  const st = makeStore();
  const got = await getHouse(st, now, {uid: 'nobody'});
  S.eq('an unknown house is refused',             got.ok, false);
  S.eq('  saying so',                             got.error, 'no such house');
  S.eq('a bad uid is refused',                    (await getHouse(st, now, {uid: ''})).ok, false);
  S.eq('closing an unknown house is harmless',    (await closeHouse(st, now, {uid: 'nobody'})).ok, true);
  S.eq('an empty world lists nothing',            (await listHouses(st, now, {})).rows.length, 0);
}

S.note(`records go stale after ${Math.round(STALE / 86400000)} days`);

S.report(
  'A published cottage is listed and fetchable with its owner offline, gated on the door and on being finished, sanitised against a hostile payload, and carrying nothing but the layout.',
  'that the client publishes at the right moments and the round trip works over a real socket-less HTTP call — that needs a deployed worker and two browsers.');
