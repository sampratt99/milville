/* ============================================================================
   lobbyvis — the delve lobby set shows only while you stand in it.

   The trap (docs/23 §9, docs/17): AN INTERIOR IN A WALKABLE DEAD ZONE MUST
   START HIDDEN, not become hidden on first entry. The delve lobby was visible
   until you had entered it once.

   The second half is the room-0 rule. Rooms reveal fog-of-war style and STAY
   revealed, which is right for real chambers but wrong for the lobby: Ellison,
   the signpost, the collect chest and the exit ladder are tall and near the
   gate, so once you cross into room 1 they poke through into the room you are
   actually standing in.

   The shim's Object3D.visible reads back, so this asserts the flag the game
   sets rather than the source that sets it.

   Run: node harness/lobbyvis.mjs
   ========================================================================== */
import {runPass, Suite, PRELUDE, SRC} from './_lib.mjs';

const T = runPass(PRELUDE + String.raw`
  o.lobbyDefs = Object.keys(_RAID_LOBBY_DEFS);

  const lobbyObjs = () => objects.filter(q => q && _RAID_LOBBY_DEFS[q.def]
                                         && q.raidRoom === 0 && q.raidFloor === 1);
  const visibleCount = () => lobbyObjs().filter(q => q._m && q._m.group && q._m.group.visible).length;
  const withModels = () => lobbyObjs().filter(q => q._m && q._m.group).length;

  o.lobbyObjectCount = lobbyObjs().length;
  o.lobbyWithModels = withModels();

  /* ---- AT LOAD, BEFORE ANY DELVE: hidden ---- */
  o.visibleAtLoad = visibleCount();
  o.inRaidAtLoad = (typeof inRaid !== 'undefined') ? inRaid : null;

  /* Ellison is an NPC, not an object */
  const lobbyNpcs = () => npcs.filter(n => n && n.interior === 'raid' && n._g);
  o.lobbyNpcCount = lobbyNpcs().length;
  o.npcVisibleAtLoad = lobbyNpcs().filter(n => n._g.visible).length;

  /* ---- entering room 0 shows the set ---- */
  /* _raidSetLobbyObjVis gates on raid.floor === 1, so stand up a minimal raid */
  const _raid = (typeof raid !== 'undefined') ? raid : null;
  raid = {floor: 1, rooms: [{}, {}], roomIdx: 0, started: true, rid: 'test'};
  _raidSetLobbyObjVis(true);
  o.visibleInLobby = visibleCount();
  o.npcVisibleInLobby = lobbyNpcs().filter(n => n._g.visible).length;

  /* ---- stepping into room 1 hides it again ---- */
  _raidSetLobbyObjVis(false);
  o.visibleInRoom1 = visibleCount();
  o.npcVisibleInRoom1 = lobbyNpcs().filter(n => n._g.visible).length;

  /* ---- coming back re-shows it ---- */
  _raidSetLobbyObjVis(true);
  o.visibleBackInLobby = visibleCount();

  /* ---- ON ANOTHER FLOOR, ROOM 0 IS NOT THE LOBBY ---- */
  /* room 0 exists on every floor at the same tiles; the props are floor 1 only */
  raid.floor = 2;
  _raidSetLobbyObjVis(true);
  o.visibleOnFloor2 = visibleCount();
  raid.floor = 1;

  /* ---- a dead object stays hidden even in the lobby ---- */
  const first = lobbyObjs()[0];
  if(first){
    first.alive = false;
    _raidSetLobbyObjVis(true);
    o.deadObjectVisible = !!(first._m && first._m.group && first._m.group.visible);
    first.alive = true;
  }
  _raidSetLobbyObjVis(true);
  o.revivedVisible = !!(first && first._m && first._m.group && first._m.group.visible);

  /* leave everything hidden, as it was */
  _raidSetLobbyObjVis(false);
  raid = _raid;
  o.visibleAtEnd = visibleCount();
  return o;
`);

const S = new Suite('lobbyvis').guard(T);

S.ok('the lobby set is defined',                  T.lobbyDefs.length >= 5, T.lobbyDefs.join(', '));
S.ok('  and its objects exist in the world',      T.lobbyObjectCount > 0, `${T.lobbyObjectCount} objects`);
S.ok('  with models built',                       T.lobbyWithModels > 0,
     `${T.lobbyWithModels} of ${T.lobbyObjectCount} have a group — if this were 0 every visibility check below would pass vacuously`);

/* the trap */
S.eq('THE LOBBY STARTS HIDDEN, BEFORE ANY DELVE', T.visibleAtLoad, 0);
S.eq('  and so does its keeper',                  T.npcVisibleAtLoad, 0);
S.ok('there is a keeper to check',                T.lobbyNpcCount > 0, `${T.lobbyNpcCount} raid NPCs`);

/* room 0 only */
S.eq('entering the lobby shows the whole set',    T.visibleInLobby, T.lobbyWithModels);
S.ok('  including the keeper',                    T.npcVisibleInLobby === T.lobbyNpcCount,
     `${T.npcVisibleInLobby} of ${T.lobbyNpcCount}`);
S.eq('STEPPING INTO ROOM 1 HIDES IT AGAIN',       T.visibleInRoom1, 0);
S.eq('  keeper included',                         T.npcVisibleInRoom1, 0);
S.eq('coming back re-shows it',                   T.visibleBackInLobby, T.lobbyWithModels);

/* floors */
S.eq('ROOM 0 ON ANOTHER FLOOR IS NOT THE LOBBY',  T.visibleOnFloor2, 0);

/* dead objects */
S.eq('a dead lobby object stays hidden',          T.deadObjectVisible, false);
S.ok('  and a live one comes back',               T.revivedVisible);

S.eq('the pass leaves it hidden again',           T.visibleAtEnd, 0);

/* source: the call site, which has no runtime seam here */
S.ok('raidEnterRoom drives it with show=(idx===0)',
     /_raidSetLobbyObjVis\(idx===0\)/.test(SRC));
S.ok('  and it only ever shows on floor 1',       /raid\.floor===1/.test(SRC));
S.ok('the guardians appear WITH the room',        /_raidSyncMobVisibility/.test(SRC));

S.report(
  'The delve lobby set starts hidden, shows only in room 0 of floor 1, hides on stepping out, and comes back on return.',
  'that it looks right on screen, and that nothing else pokes through between rooms — needs a browser.');
