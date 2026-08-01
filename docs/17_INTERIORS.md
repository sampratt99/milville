# 17 — Building Interiors (the dead-zone overlay pattern)

One scene, one grid — interiors are built in **dead zones of the same map**, hidden in a
`THREE.Group`, and swapped in by toggling visibility + the active `tiles` grid on entry.
**Interior objects are listed in `INT_DEFS` and are EXEMPT from the +112 world shift** — an
interior's coords are wherever its builder put them (usually the old northern dead zone
x100–140, y1–15, which is now under the deep-wilderness strip — harmless, since entering an
interior hides the outdoor world entirely).

## Current interiors
The great **Chapel**, **St. Paul's** (old chapel), the **Rectory interior** (Christmas arc),
the **Hargate Party Room**, the **Matthes Cage pit** (MPIT x111–129, y11–32 — duels), and the
**Emberdeep floors** (Chambers I–IV + The Heart, via `inVolcano`/`_lastVolcFloor` with their
own barriers/cell logic rather than the simple flag pattern).

## The seven ingredients (recipe — unchanged and proven)
1. **A cloned tile grid** with the room stamped in (`T_WALL` border, `T_FLOOR` inside; carve
   doors; stamp furniture collision).
2. **Flatten the heightmap** under the footprint.
3. **A hidden `THREE.Group`** for all interior geometry.
4. **A state flag + return coordinate** (`inChapel`, `CHAPEL_RETURN`).
5. **enter/exit functions**: swap `tiles` (keep a `TILES_MAIN` reference!), toggle
   world/interior group visibility, teleport the player, adjust fog/ambience.
6. **Entry/leave triggers**: an entrance predicate over the outdoor building tiles feeding an
   `optionsAt()` option + action; leave via a door tile check or a Leave option.
7. **`partitionScene()`**: tags every scene child into worldGroup vs the interior group by
   its object `def` — add your new defs to the partition AND to `INT_DEFS` (or the shift
   will displace them by 112!).

Interiors are **local-only** in multiplayer (not instanced) — except the Cage pit, which the
duel system deliberately synchronizes (20).

## The start-hidden rule

Several interiors live in dead zones that sit on **walkable ground** — the house region and the delve
lobby are both in the deep wilderness. Their geometry must be **hidden at boot**, not hidden on first
entry: the delve lobby's ladder, sign, chest and Mr. Ellison stood in the open wilderness until a
player had entered the delve once. Hide at world build, and re-hide in `exitToMainMap`.

The house also needs its own minimap (`miniBaseHouse`) and its own pick list (`houseProxies`), because
its layout changes at runtime and nothing outdoors should be able to hover its furniture.

---

## The enter/exit asymmetry that leaked interiors into the wilderness

Each interior that overlays the shared grid (`sos`, `raid`, `volcano`) keeps a def-set of its own
props and toggles per-object visibility on the way in and out. The two halves were **not**
symmetrical:

```js
enterX():  o._m.group.visible =  !!X_SET[def]   // show mine, hide everyone else's   RIGHT
exitX():   o._m.group.visible =   !X_SET[def]   // hide mine, SHOW everyone else's   WRONG
```

So a trip into the volcano and back **turned the delve lobby on**. Its ladder, notice board and
reliquary chest stand at roughly **(24–30, 50–59)** — walkable deep wilderness, right beside the
Agility course — and unlike the volcano's props they are parented to the scene rather than to a
group that gets hidden wholesale, so they simply appeared out on the grass between the course and
Pat's Peak. Leaving the Songs of Solomon cave was worse: it lit the whole Emberdeep as well.

**This survived an earlier fix** because that fix hardened `_raidSetLobbyObjVis`, and none of these
paths call it. The lesson generalises: hardening the function that *should* own a piece of state does
nothing about the code that writes it behind that function's back.

Every exit now hides `interiorPropDefs()` — the union of all three sets, built lazily because the
parts are declared in three different systems hundreds of lines apart. **Re-entry is unaffected,
which is what makes this safe**: `enterX()` re-asserts its own set from scratch every time.

Two rules fall out of it:

- **Interior NPCs need the same treatment.** Only `exitRaid` hid Ellison; the object loops never
  touch `npcs` at all. Every exit now hides any NPC carrying an `interior` tag.
- **A hide-only sweep must refuse to run indoors.** `hideInteriorPropsTopside()` returns immediately
  if `curInterior()` is truthy — fired from inside the volcano it would strip the cave bare.
  `harness/lobbyvis.mjs` asserts that, and that each interior still furnishes itself on entry and on
  a second visit.

