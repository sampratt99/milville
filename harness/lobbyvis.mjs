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
  /* the props are now gated on inRaid too, so they can never render from another
     world -- the house sits directly north of them in the wilderness */
  const _raid = (typeof raid !== 'undefined') ? raid : null;
  const _inRaid = inRaid;
  inRaid = true;
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
  /* OUTSIDE the delve they cannot be shown at all, whatever the caller asks for */
  _raidSetLobbyObjVis(true);
  o.visibleWhileInRaid = visibleCount();
  inRaid = false;
  _raidSetLobbyObjVis(true);
  o.visibleOutsideRaid = visibleCount();
  inRaid = _inRaid;
  raid = _raid;
  o.visibleAtEnd = visibleCount();

  /* ---- THE LEAK: ANOTHER INTERIOR'S EXIT USED TO TURN THIS SET ON --------
     Every enterX() sets  visible = !!MY_SET[def]  (show mine, hide everyone else's) but every
     exitX() used to set  visible = !MY_SET[def]  -- hide mine, SHOW EVERYONE ELSE'S. So a trip into
     the volcano and back lit up the delve lobby, whose ladder, notice board and reliquary chest
     stand in walkable wilderness beside the Agility course. Reported as "I can see the ladder, the
     treasure chest and Mr. Ellison out on the grass between the course and Pat's Peak". */
  _raidSetLobbyObjVis(false);
  inRaid = _inRaid; raid = _raid;

  const anyInterior = () => { const A = interiorPropDefs();
    return objects.filter(q => q && A[q.def] && q._m && q._m.group && q._m.group.visible).length; };
  const ellisonOut = () => lobbyNpcs().filter(n => n._g.visible).length;

  o.leakBefore = visibleCount();
  enterVolcano(); exitVolcano();
  o.lobbyAfterVolcanoTrip = visibleCount();
  o.anyInteriorAfterVolcanoTrip = anyInterior();
  enterSos(); exitSos();
  o.lobbyAfterSosTrip = visibleCount();
  o.anyInteriorAfterSosTrip = anyInterior();

  /* Ellison is an NPC, so the object loops never touched him at all */
  inRaid = true; raid = {floor:1, rooms:[{},{}], roomIdx:0, started:true, rid:'t'};
  _raidSetLobbyObjVis(true);
  o.ellisonInLobby = ellisonOut();
  exitRaid();
  o.ellisonAfterExitRaid = ellisonOut();
  enterVolcano(); exitVolcano();
  o.ellisonAfterVolcanoTrip = ellisonOut();

  /* ---- and the cure must not be worse: each interior still furnishes itself -------- */
  const nVis = SET => objects.filter(q => q && SET[q.def] && q._m && q._m.group && q._m.group.visible).length;
  enterVolcano();  o.volcPropsInside = nVis(VOLC_CAVE_OBJS);
                   o.raidPropsInVolcano = nVis(RAID_CAVE_OBJS);
  exitVolcano();
  enterVolcano();  o.volcPropsSecondVisit = nVis(VOLC_CAVE_OBJS);   /* twice, not just once */
  exitVolcano();
  enterSos();      o.sosPropsInside = nVis(SOS_CAVE_OBJS);
  exitSos();
  /* an ordinary overworld object is untouched */
  o.overworldVisible = objects.filter(q => q && q.def === 'tree' && q._m && q._m.group && q._m.group.visible).length;

  /* the boot sweep hides EVERY interior's set, not just the lobby */
  /* ** THE SWEEP MUST REFUSE TO RUN INDOORS. ** It is hide-only, so from the overworld it cannot
     fight anything -- but fired from INSIDE the volcano it would strip the cave bare. */
  enterVolcano();
  hideInteriorPropsTopside();
  o.volcSurvivesSweepIndoors = nVis(VOLC_CAVE_OBJS);
  exitVolcano();

  /* light every interior prop by hand, so the sweep has something to prove */
  {const A = interiorPropDefs();
   for(const q of objects) if(q && A[q.def] && q._m && q._m.group) q._m.group.visible = true;
   for(const n of npcs) if(n && n.interior && n._g) n._g.visible = true;}
  o.beforeBootSweep = anyInterior();
  hideInteriorPropsTopside();
  o.ellisonAfterBootSweep = ellisonOut();
  o.afterBootSweep = anyInterior();

  inRaid = _inRaid; raid = _raid;

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

S.ok('inside the delve they can be shown',        T.visibleWhileInRaid > 0, `${T.visibleWhileInRaid}`);
S.eq('OUTSIDE THE DELVE THEY CANNOT BE SHOWN AT ALL', T.visibleOutsideRaid, 0,
     'a stale true used to render them across the void from inside the cottage');
S.eq('the pass leaves it hidden again',           T.visibleAtEnd, 0);

/* source: the call site, which has no runtime seam here */
S.ok('raidEnterRoom drives it with show=(idx===0)',
     /_raidSetLobbyObjVis\(idx===0\)/.test(SRC));
S.ok('  and it only ever shows on floor 1',       /raid\.floor===1/.test(SRC));
S.ok('the guardians appear WITH the room',        /_raidSyncMobVisibility/.test(SRC));

/* ===== the leak between interiors — the bug Sam kept seeing on the grass ===== */
S.eq('a volcano round trip leaves the lobby hidden',   T.lobbyAfterVolcanoTrip, 0);
S.eq('  and every other interior with it',             T.anyInteriorAfterVolcanoTrip, 0);
S.eq('an SoS round trip leaves the lobby hidden',      T.lobbyAfterSosTrip, 0);
S.eq('  and every other interior with it',             T.anyInteriorAfterSosTrip, 0);
S.eq('Ellison shows in the lobby',                     T.ellisonInLobby, 1);
S.eq('  and is gone the moment you climb out',         T.ellisonAfterExitRaid, 0);
S.eq('  and a volcano trip does not summon him to the grass', T.ellisonAfterVolcanoTrip, 0);

/* the cure must not be worse than the disease */
S.ok('the volcano still furnishes itself on entry',    T.volcPropsInside > 0, `${T.volcPropsInside} props`);
S.eq('  and again on the second visit',                T.volcPropsSecondVisit, T.volcPropsInside);
S.eq('  with no delve props inside it',                T.raidPropsInVolcano, 0);
S.ok('the SoS cave still furnishes itself',            T.sosPropsInside > 0, `${T.sosPropsInside} props`);
S.ok('ordinary overworld objects are untouched',       T.overworldVisible > 0, `${T.overworldVisible} trees`);
S.ok('the boot sweep hides every interior set',
     T.beforeBootSweep > 0 && T.afterBootSweep === 0,
     `${T.beforeBootSweep} visible before the sweep, ${T.afterBootSweep} after`);
S.eq('  Ellison included',                             T.ellisonAfterBootSweep, 0);
S.eq('  but it refuses to run indoors and strip the cave',
     T.volcSurvivesSweepIndoors, T.volcPropsInside);

/* source: one union, and no exit may go back to its own private set */
S.ok('the exits hide the UNION of every interior set', /interiorPropDefs\(\)/.test(SRC));
S.ok('  and none of them hides only its own',
     !/visible=!SOS_CAVE_OBJS\[/.test(SRC) && !/visible=!RAID_CAVE_OBJS\[/.test(SRC)
     && !/visible=!VOLC_CAVE_OBJS\[/.test(SRC),
     'exitX must not use its own set — that is the whole bug');

S.report(
  'The delve lobby set starts hidden, shows only in room 0 of floor 1, hides on stepping out, and comes back on return.',
  'that it looks right on screen, and that nothing else pokes through between rooms — needs a browser.');
