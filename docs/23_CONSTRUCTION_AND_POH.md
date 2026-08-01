# 23 — Construction & the Player-Owned House

Milville's **16th skill**, and the largest single feature arc in the game. Read this before touching
anything in the house, the sawmill, or the cottage exterior.

---

## 1. The player loop, end to end

```
chop trees → saw logs into planks (White Farm mill) → smith iron nails
   → buy the deed from Mr. Bohan (50,000 gp, NO skill requirement)
   → repair the ruined cottage in 3 stages
   → build rooms → build furniture into hotspots → Construction xp
```

**Entry point:** the ruined cottage at runtime **(230,111)**, kind `pohcottage`, door at **(231,111)**
(north face). Mr. Bohan stands at **(229,110)**.

---

## 2. Key constants

| Thing | Value |
|---|---|
| Interior region | `HOUSE = {x0:24, y0:1, x1:84, y1:31}` — a dead zone that sits in **walkable deep wilderness** |
| Room grid | `HOUSE_GW × HOUSE_GH = 5×3` = **15 cells for 12 room types**; each room `HOUSE_RW × HOUSE_RH = 12×10` (interior 11×9) |
| Entry cell | `HOUSE_ENTRY = {gx:1, gy:0}` — holds the front door; starts as the parlour |
| `HOUSE_CENTRE` | `{gx:2, gy:1}` — **a camera focus only now.** The garden goes anywhere |
| Return coord | `HOUSE_RETURN = {x:231, y:110}` — the doorstep |
| Deed | `POH_DEED_PRICE = 50000`, no skill gate (`pohDeedShortfall()` always returns `[]`) |
| Repair | 3 stages: rubble (2,000 gp) · frame+roof (14 planks, 6 nails, 12,000) · glaze+chimney (8, 3, 20,000) |

**The grid was 3×3 and could not hold the game.** Nine cells for twelve room types meant three rooms
could never be built at all, and "a full house" meant choosing which three to give up. It is now
**5×3 = 15**, which fits every type with three cells spare, so the house can be any connected shape
you like — a 4×3 block, a 5×2 bar, an L.

**The region had to move WEST, not grow east.** The Rectory dead zone starts at `x85` and the delve
at `y36`, so `x24..84 × y1..31` is the largest box available. **Cell indices are unchanged by the
move**, so every saved room and every slot key still points at the same cell — only the world tiles
under them shifted, and nobody ever sees those coordinates. No save migration was needed.

> **The cottage door is hard-coded to the entry doorway.** `addObj('house_exit',42,1,true)` runs far
> earlier in the file than the HOUSE constants, and its model is baked before them, so it cannot be
> computed there. Moving the grid or the region origin moves `houseExitTile()` out from under it and
> strands the door in solid rock — which is exactly what the 3×3 → 5×3 change did.
> `harness/walktest.mjs` asserts the two agree.

**Repair sizing is deliberate.** Boards do not stack, and repair happens *before* you can build a bell
and hire staff — so no stage may want more planks than fit comfortably in an unaided pack.

---

## 3. Data tables

- **`HOUSE_ROOMS`** — 12 room types. Each has `{name, cost, floor, seam, inlay, rail, panel, slots[]}`.
  Each slot is `{id, ox, oy, cat, label}` in **room-local** offsets.
- **`HOUSE_FURNITURE`** — 118 pieces. Each is `{name, cat, cost, req, planks, nails, xp, plankId}`.
- **`HOUSE_FLOORS`** — room type → floor style (see §6).
- **`BUTLERS`** — 5 hires (see §7).
- **`SAWMILL`** — `[logId, plankId, feePerBoard]` × 4.
- **`PLANK_LABEL`** — timber names for UI ("plain plank", not just "plank").

### Room costs (flat — no escalator, as in OSRS)

parlour free · garden 5k · workshop 15k · kitchen 40k · bedroom 90k · games 180k · study 350k ·
combat 650k · chapel 950k · gallery 1.4M · costume 1.9M · portal chamber 2.6M

**One of each room type per house** — enforced in `houseRoomTaken()`, in the picker, *and* in
`houseBuildRoom()` so no route can slip a duplicate through. With 15 cells for 12 types that is now
the *only* placement rule besides adjacency: **the garden may sit anywhere, and any room may take
the middle.** The old courtyard rule (garden only in the centre, centre only a garden) is gone — it
forced the house into a ring and, once every room fitted, removed choices for nothing.

---

## 4. Hotspots — the rule that keeps rooms bespoke

57 hotspot categories across 12 rooms. **No distinctive category may appear in two rooms.** Only
`seat` and `rug` are whitelisted as generic, and even those cap at two rooms.

This exists because the original design used generic categories (`decor` was shared by *eleven*
rooms), so every room got the same top-tier painting. `slottest` enforces it permanently.

### The five placement rules (all asserted in `slottest`)

1. **Wall categories must be flush** (distance 0 from a wall): decor, store, show, costume, rack,
   hearth, altar, board…
2. **Free-standing categories must be off the wall**: table, tree, water, dummy, portal…
3. **Nothing on a doorway-adjacent tile.**
4. **No two slots within one tile** (large pieces would overlap).
5. **No category may mix wall-mounted and free-standing pieces.** This is the one that catches design
   faults — the old `game` category held a wall dartboard *and* a floor card table, so no placement
   rule could ever be right for it.

### Facing

`houseSlotFacing(S)` returns the rotation that turns a piece to look **into** the room from whichever
wall it stands against (N 0, S π, W π/2, E −π/2). Free-standing pieces keep facing north. Every model
is built facing **+z**, so without this, west-wall pieces face into the plaster.

---

## 5. The economy

**Three costs, three jobs:**

| Cost | Purpose |
|---|---|
| **Rooms** (coins) | the main gold sink — cheap to start, very dear to finish |
| **Boards** (materials) | the real cost of a piece |
| **Fittings** (coins) | `9 × level^2.4 / 50`, a small charge that rises steeply with level |

### Totals

Since the grid grew to 15 cells, **every room type fits**, so "a full house" is one number again
rather than a choice of which three to give up. All figures count room coins plus furniture — the
fittings charge, plus boards at `ITEMS[plankId].val` and nails at their own value:

| | Cost |
|---|---|
| All twelve rooms, **rooms only** | **8,180,000** |
| + the cheapest piece in every hotspot | ~8.97M |
| + the **best** piece in every hotspot (fully maxed) | **~15.71M** |
| A starter house — parlour, garden, workshop, cheaply fitted | ~102k |

The last three rooms (gallery 1.4M, costume 1.9M, portal chamber 2.6M) are **5.9M of the room bill,
72% of it** — the reason the tail is so long. Furnishing costs roughly as much again as the rooms do.

> **Two earlier versions of this section were wrong.** The original quoted ~6.5M / ~11.5M with no
> layout stated at all. The rewrite that replaced it quoted a "dearest nine" and a "cheapest nine",
> which was correct for a 3×3 grid and became obsolete the moment the grid grew. `pricetest` prints
> the live figures on every run and asserts the STRUCTURE — flat room costs charged through the real
> build path, and the fittings curve — rather than these totals, which move whenever anything is
> repriced.

### The XP curve — read this before retuning it

xp per plank: **plank 6 · oak 15 · willow 34 · birch 70**. Board values: 180 / 700 / 2,400 / 7,000.

XP rises **12×** while price rises **39×**, so:
- **xp per gold FALLS** with tier (33 / 21 / 14 / 10 per 1k gp) — speed costs money
- **xp per pack slot RISES** steeply — better boards are the faster grind

**This is OSRS's own shape** (mahogany is worse per coin than teak). The spread is kept under 5× so no
tier is a trap.

**Why it cannot simply be flat:** board prices span 39×. Making xp-per-gold flat forces a 39× xp
spread, and against Milville's **100,000 xp** level 99 (OSRS's is 13.03M — ours is ~130× flatter) that
compresses a 99 into minutes. Trip times carry the pacing instead.

**Sawing awards NO experience**, as in OSRS. The mill is a gold sink and a supply step; the xp is in
what you build.

---

## 6. Interior geometry — `houseBuildInterior()`

**Everything is painted PER TILE.** Floors, skirting, rails, panels, coping and windows are all
emitted tile by tile. This is what makes doorways work: a doorway is a `T_FLOOR` tile sitting in the
wall line, so it receives floor and **no trim** automatically — a clean walkway with nothing across it
and no hole in the ground.

- **The floor's top surface is at exactly `FY`** (slab centre `FY - FT/2`). Anything standing on it
  (rugs, sigils, hearths) must assume that. Getting this wrong buries flat pieces.
- **Trim faces INTO the room.** Face `'S'` means the room is *south*, so trim moves **+z**. Inverting
  this puts every window, sill, rail and skirting board on the exterior face.
- **Walls:** `WALLH = 2.2`, `WT = 0.12` — OSRS dollhouse proportions. Do not raise them.
- **Windows** are placed on the tile the room's `curtain` slot occupies, on that slot's own wall.
  Furniture must not draw its own window or you get an offset double.

### Floor styles (8)

plank (parlour/bedroom/games) · parquet (study/gallery/costume) · quarry (kitchen) · flag (chapel) ·
board (workshop) · dungeon (combat) · arcane (portal chamber) · **grass (courtyard)**.

Each is painted per tile with a stable hash so no two tiles are identical. The courtyard uses the
**same six-tone ramp the outdoor world uses for campus grass**, and lies flat — raised tufts read as
spikes at house scale.

---

## 7. Butlers

Five St Paul's hires on `player.house.servant`, one at a time.

| Hire | Con | Fee | Boards | Trip |
|---|---|---|---|---|
| Third former | 1 | 500 | 6 | 14s (drops one ~1 in 12) |
| Fourth former | 20 | 1,500 | 10 | 13s |
| Fifth former | 40 | 4,000 | 16 | 12s (un-notes) |
| Sixth former | 60 | 9,000 | 20 | 10s (un-notes, GE collect) |
| Fac brat | 80 | 25,000 | 24 | 8s |

**Trip times are benchmarked against walking.** The nearest bank chest is ~50 tiles from the cottage
door — about **33 seconds** round trip on foot for up to 28 boards (~51 boards/min). The hires give
26 / 46 / 80 / 120 / 180 boards a minute, so the cheap ones roughly match walking (their value is that
your hands stay free) and the top three are a real upgrade. **Never set a trip longer than the walk it
replaces.**

- They fetch from the **bank**, never the pack. That is the entire point: a maxed house wants ~180
  boards and an inventory holds 28.
- **No butler code path may reach `houseBuild`.** They fetch; you build. Asserted.
- Models reuse the **existing student rig** (`makeHumanoid` + tie + lapels) recoloured per form.
- `butlerTick(dt)` runs in the render loop and animates them with the same gait as any friendly NPC.

---

## 8. Multiplayer — the isolation model

`_mpRoom()` returns `'house:' + houseOwnerUid()` inside a house, `null` outdoors. A **guest takes the
owner's key**, so they share a room; two owners each at home are in different rooms.

**The visibility matrix (all seven cases asserted in `mphouse`):**

| Situation | Result |
|---|---|
| Outdoors, they're in their house | hidden |
| Outdoors, they're outdoors | visible |
| At home, they're in **their** home | hidden |
| At home, they're outdoors | hidden |
| At home, they're visiting me | visible |
| Visiting, owner is home | visible |
| Visiting, third party in a third house | hidden |

- **House objects use their own pick list** (`houseProxies`); `addProxy` routes them there so nobody
  outside can hover your furniture, and vice versa.
- **The house has its own minimap** (`miniBaseHouse`), repainted by `houseRepaintMinimap()` on entry,
  room build and furniture rebuild — the layout changes, so it cannot be baked once at load.
- **The open/locked flag rides both `state` and `hello`** — and BOTH halves were broken until the
  visit HUD shipped. It must ride `hello`, because an idle player sends no `state` at all and a
  neighbour would never learn the door was open. But `state` was worse than useless: `server.js`
  **rebuilds** the state message it broadcasts, so `ho` was stripped in transit, and the client's
  handler then ran `houseOpen = !!m.ho` with no `m.ho !== undefined` guard — setting the flag FALSE
  on every state message and wiping what `hello` had just set true. An unlocked cottage therefore
  vanished from every neighbour's visit list the moment its owner did anything at all. Fixed on both
  sides: the client guards, and the server carries `ho` through the rebuild (and keeps it on the
  socket attachment so it rides the 4s keepalive too). **The client guard alone is sufficient; the
  server half needs a `wrangler deploy`.** Same bug class as the pets-on-`pos` one — never trust a
  field to survive a server rebuild.

### Visiting an OFFLINE owner

`hreq` → `hdat` needs the owner's own client to answer, so it only ever worked while they were
logged in — which is not what "leave the door unlocked" means. The house is therefore also
**published to the server** (`mp-server/houses.js`, `house:<uid>` in the same DO as the market):

| Route | Does |
|---|---|
| `POST /house/publish` | the owner pushes `{uid,name,open,repair,rooms,slots}` |
| `POST /house/close` | shut the door without re-sending the layout |
| `GET /house/list?self=` | every open, finished cottage, newest first |
| `GET /house/get?uid=` | one layout, for a visitor walking in |

`housePublish()` fires on the door toggle, a room build, a furniture build or removal, a rearrange
and the final repair. The Visit panel merges both sources: a peer you can see is listed **"knock"**
(instant, always current), anyone else **"walk in"** (fetched from the directory).

**A snapshot is public read-only data** — layout and furniture, nothing else. The server sanitises
what it stores: cell and slot keys must match their patterns, ids must be plain identifiers, counts
are capped, and no field the client sends beyond the known seven is kept. `harness/housedir.mjs`
sabotage-tests that a payload carrying `inv`/`bank`/`skills`/`coins` stores none of it.

> **This half needs a `wrangler deploy`.** Until the worker ships, the directory calls fail
> harmlessly and the Visit panel falls back to online-only peers.

### Visiting, from the house HUD

The visit flow lives on the **house HUD** (top right, inside a cottage), not just the cottage door:

| Button | Who sees it | Does |
|---|---|---|
| `hhlock` | owner only | toggles `player.house.open`, evicts guests on lock, and `pingPresence()`s at once so neighbours learn immediately |
| `hhvisit` | owner **and guest** | opens `houseVisitPanel()` |

`houseVisitPanel()` lists every door `MP.openHouses()` reports unlocked right now, and **always
offers a row back to your own cottage** — otherwise a guest whose host locked up mid-visit would be
stranded in a parlour with nothing to click.

**`houseRequestVisit` no longer refuses while you are inside.** It used to, which made the whole
feature unreachable from the HUD; it now steps you out of whichever cottage you are standing in and
then knocks. Leaving a cottage clears `houseVisit`, so exiting and re-entering always puts you back
in your own.
- Locking **evicts** guests (`hevict`).
- Protocol: `hreq` → `hdat` / `hdeny`, plus `hevict`. Client-only; no server redeploy.

---

## 8b. Rearranging the house

`hhrooms` on the HUD opens `houseRearrangePanel()`: a grid of your rooms that you drag (or click)
one onto another to swap. Nothing touches the save until you press Save.

| Function | Does |
|---|---|
| `houseLayoutStart()` | copies `houseRooms()` into the working object `_hLayout` |
| `houseLayoutCells()` | the whole grid as `{gx,gy,key,type}`, for drawing |
| `houseLayoutPick(gx,gy)` | pick a room up, or drop the held one — **onto an occupied cell it SWAPS** |
| `houseLayoutValid(L)` | `{ok, why}` — see the two rules below |
| `houseApplyLayout(L)` | validates, re-keys the furniture, writes the save, re-carves and re-renders |

**Two rules, both enforced in `houseLayoutValid`:**

1. **The entrance cell must stay filled.** The front door is at `houseExitTile()`, which is derived
   from `HOUSE_ENTRY` — empty that cell and the door opens into rock.
2. **Every room must be reachable from the entrance.** Doorways are only punched between
   orthogonally adjacent built cells, so an island is a room you paid for and cannot enter. The
   check is a flood fill from the entry cell.

### THE FURNITURE MOVES WITH THE ROOM

This is the whole reason the feature is safe to offer. Slots are keyed `'gx,gy:slotid'`, so a room
that changes cell **must** take every piece in it along or the pieces are orphaned into whatever
room lands there instead — a chapel altar reappearing in a kitchen. `houseApplyLayout` builds the
new slot table in **one pass into a fresh object**:

```js
for(const sk in oldSlots){                    /* 'gx,gy:slotid' */
  const cell = sk.slice(0, i), slotId = sk.slice(i+1);
  const dest = newCellOf[ oldRooms[cell] ];   /* where did that ROOM TYPE end up? */
  if(!dest) continue;                          /* the room is gone: its pieces go with it */
  moved[dest + ':' + slotId] = oldSlots[sk];
}
```

**Rewriting in place would clobber** a slot whose destination key is another room's source key —
which is exactly what a swap always produces. `harness/layouttest.mjs` asserts a two-room swap
carries both rooms' furniture and loses none.

---

## 9. Traps that have already bitten (do not relearn these)

- **A CYLINDER is born axis-up, so a thin one lies FLAT like a coin on a table.**
  `CylinderGeometry`'s axis runs along +Y. Any round face meant to hang on a wall — dartboard,
  target rings, clock dials, a mirror, a shield — needs `rotation.x = π/2` to stand up. Use the
  `CD()` disc helper; `C()` only rolls on z and **cannot** stand a disc up.

  | | `rotation.x = 0` | `rotation.x = π/2` |
  |---|---|---|
  | cylinder disc | lies flat (a coin) | **stands up** (a dial on a wall) |

- **A TORUS is born in the XY plane, already UPRIGHT and facing +z.** It needs nothing done to it
  to stand. A ring you look or walk through — a portal arch, a globe meridian, the trellis hoop —
  wants `rotation.x = 0`. `π/2` makes it lie **flat**, which is what a level hoop wants: the pot
  rack, the candle rack, and the chalk and marble floor sigils.

  | | `rotation.x = 0` | `rotation.x = π/2` |
  |---|---|---|
  | torus ring | **stands up** (a portal arch) | lies flat (a pot rack) |

- **The same π/2 therefore does OPPOSITE things to the two primitives**, which is the whole trap.
  Earlier versions of this doc and of CLAUDE.md gave one combined rule — "cylinders and tori are
  born upright… needs π/2" — which is right for cylinders and would lay a portal arch flat on the
  floor. No shipped model was ever wrong; the doc was. `harness/discs.mjs` asserts each primitive
  separately, and checks floor pieces keep their discs flat as well as wall plates standing theirs
  up.
- **`drawItemIcon` balances its own canvas** via `save()` / `try` / `finally restore()`. Branches
  historically forgot `restore()`, and since each inventory slot keeps its own canvas, the stray
  translate accumulated every re-render — icons marched into the bottom-right corner and shrank.
  Run `iconaudit` after adding any icon.
- **Item sprites go in `ITEM_ICON_PNG`, not `UI_ICON_PNG`.** The item table draws in plain 0..S space
  with an early return; the UI table draws in centred space. Misfiling produces the corner-icon bug.
- **Removing an item from `ITEMS` is a save migration.** Orphaned ids crashed `itemCategory` and took
  the whole bank down. There is now a sweep on load; keep it.
- **A panel flag must never outlive its world.** `bankOpen` left true after a house bank chest routed
  every inventory click to `depositSlot`. `exitToMainMap` now dismisses bank and shop, and
  `reconcileCounters()` heals a desync every frame.
- **An interior in a walkable dead zone must START hidden.** The delve lobby was visible until you had
  entered it once.
- **Adding a skill means adding it to the skills OBJECT**, not just `SKILLS`. Missing it gives
  `undefined` xp and NaN everywhere. There is now a backfill on load.
- **Left-click runs `optionsAt`'s FIRST option.** Never put anything destructive or costly first.
- **AN INTERIOR NEEDS ITS OWN PICK FLOOR.** Clicks resolve by raycasting a per-interior floor mesh,
  and the chain in `castPick` ends at `terra` — the *overworld* terrain. The house had no branch, so
  every click fell through to the wilderness surface under the dead zone and the walk marker landed
  a tile or three from the cursor. The delve had the identical fault (see `_raidBuildFloorPick`).
  `housePickFloor` is a flat plane at `houseFY`; add any new interior to that chain or it inherits
  this bug.
- **Object models bake their Y from `groundH()` BEFORE the house exists.** `objects.forEach(buildObjModel)`
  runs thousands of lines earlier than the HOUSE constants, so it reads the original wilderness
  terrain. `_houseFlatten()` then moves the ground to `houseFY` and leaves those models hanging —
  which is how the cottage door ended up floating above the floor. `_houseReseatObjects()` re-seats
  them on every flatten and restore.
- **`addItem(id, n)` is ALL-OR-NOTHING for a non-stackable.** With too few free slots it adds nothing
  and returns false. `butlerReturn` decremented the bank first and called it once, so a fetch that
  did not fit **destroyed the boards** — they left the bank and arrived nowhere. Add one at a time
  and put the remainder back.
- **A hire needs a bell.** `butlerHire` checks `houseHasBell()`; the HUD's Staff button reached
  `butlerPanel()` directly and let you hire out of thin air.
- **A slot may set `face:'N'|'S'|'E'|'W'`** to override the wall rule, for furniture that should look
  at something in particular rather than into the room — the chapel pew faces the altar.
- **Slot keys carry the CELL, so anything that moves a room must re-key its furniture.** See §8b.
- **The cottage door object is hard-coded to the entry doorway** and cannot see the HOUSE constants.
  Move the grid or the region and it is left standing in rock. `walktest` asserts it.
- **An expansion marker with nothing to build is a dead end.** The grid now has more cells than room
  types, so `houseRebuild` skips a marker whose target cell has no remaining choices.
- Boards **do not stack** (nails do). Every plank takes a pack slot — that is why butlers exist.

- **The fac brat hire is an actual fac brat.** The top tier used to be the schoolboy rig in staff
  tweed with a lanyard, which fooled nobody — the mob is a red horned imp with hooves, bat wings, a
  spade tail and a dagger. The body now comes from **`buildBratRig(g)`, shared with `makeRat`**, so
  the hire and the monster cannot drift apart. What must NOT come across with the model is the
  monster: he is an object, not a `rats` entry, has no hitpoints, and his pick proxy is tagged
  `{kind:'obj'}` — tag it `'rat'` and the same body becomes something you swing at. Two traps in the
  wiring: **`buildObjModel` has a common tail** that seats the group, tags `userData.o` and
  scene-adds it, so a branch must never `return` early; and **`butlerTick` swings limbs by name**,
  writing absolute rotations — the demon arms rest at `0.2`, not `0`, so `_hm` carries
  `armBase`/`legBase` (defaulting to `[0,0]`, exactly the old behaviour for the four schoolboy
  forms) and the swing is applied around it.

- **`houseRebuild()` tears down and re-creates EVERY house object — including the hire.** So any
  button that rebuilds (toggling build mode, building a piece, taking one down) spawned a brand new
  butler back at the bell. Mid-errand that replayed the whole leave-the-house animation on every
  click: the servant popped into the parlour and walked out again, over and over. The trip timer was
  never affected — that lives on `player.house.servant`, not on the object — which is exactly why it
  looked cosmetic and went unreported for so long. `houseRebuild` now carries the hire's live state
  (tile, interpolated position, heading, gait phase, next wander) across the rebuild and seats the
  new model where they actually are. **Only a change of tier gets a fresh one**, which is why the
  carried state is keyed on `bo.tier`. `butlerwalk` asserts both halves.

---

## 10. Harnesses

`slottest` `contest` `sawtest` `poh15` `furntest` `roomtest` `funcfurn` `bmodetest` `walktest`
`housepanel` `wintest` `floortest` `containtest` `roomstest` `visittest` `housetest` `butlertest`
`butlerwalk` `xptest` `pricetest` `shiptest` `mphouse` `spawntest` `repairflow` `doortest` `focustest`
`upgradetest` `discs` `iconaudit` `orphantest` `banktest` `lobbyvis` `conunlock` `skillfix` `roomui`
`sawicon` `deedtest` `fivefix` `newfunc` `darylitest` `savetest`

All 49 live in `harness/` and run with `npm test` (see `docs/14`). `shiptest` walks the whole chain in
one pass; `mphouse` proves the isolation matrix; `iconaudit` draws every icon five times and checks the
canvas stack returns to zero; `orphantest` proves a dead id degrades instead of taking a panel down.
