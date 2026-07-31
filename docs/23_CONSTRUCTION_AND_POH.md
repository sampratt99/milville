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
| Interior region | `HOUSE = {x0:47, y0:1, x1:83, y1:31}` — a dead zone that sits in **walkable deep wilderness** |
| Room grid | `HOUSE_GW × HOUSE_GH = 3×3`; each room `HOUSE_RW × HOUSE_RH = 12×10` (interior 11×9) |
| Entry cell | `HOUSE_ENTRY = {gx:1, gy:0}` — always the parlour |
| Courtyard | `HOUSE_CENTRE = {gx:1, gy:1}` — **garden only, and garden nowhere else** |
| Return coord | `HOUSE_RETURN = {x:231, y:110}` — the doorstep |
| Deed | `POH_DEED_PRICE = 50000`, no skill gate (`pohDeedShortfall()` always returns `[]`) |
| Repair | 3 stages: rubble (2,000 gp) · frame+roof (14 planks, 6 nails, 12,000) · glaze+chimney (8, 3, 20,000) |

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
`houseBuildRoom()` so no route can slip a duplicate through.

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

**Totals:** modest house ~290k · all nine rooms cheaply furnished ~6.5M · **fully maxed ~11.5M**.
Roughly 38 boss runs at ~300k a run. The last three rooms are 5.9M of that.

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
- **The open/locked flag rides both `state` and `hello`.** It must ride `hello`: an idle player sends
  no `state` messages at all, so a neighbour would never learn the door was open.
- Locking **evicts** guests (`hevict`).
- Protocol: `hreq` → `hdat` / `hdeny`, plus `hevict`. Client-only; no server redeploy.

---

## 9. Traps that have already bitten (do not relearn these)

- **A cylinder is born upright.** Any round face meant to hang on a wall — dartboard, target rings,
  clock dials, a mirror, a shield — needs `rotation.x = π/2`. Use the `CD()` disc helper. The `C()`
  helper only rolls on z and **cannot** stand a disc up.
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
- Boards **do not stack** (nails do). Every plank takes a pack slot — that is why butlers exist.

---

## 10. Harnesses

`slottest` `contest` `sawtest` `poh15` `furntest` `roomtest` `funcfurn` `bmodetest` `walktest`
`housepanel` `wintest` `floortest` `containtest` `roomstest` `visittest` `housetest` `butlertest`
`butlerwalk` `xptest` `pricetest` `shiptest` `mphouse` `spawntest` `repairflow` `doortest` `focustest`
`upgradetest` `discs` `iconaudit` `orphantest` `banktest` `lobbyvis` `conunlock` `skillfix` `roomui`
`sawicon` `deedtest` `fivefix` `newfunc` `darylitest`

`shiptest` walks the whole chain in one pass; `mphouse` proves the isolation matrix; `iconaudit` draws
every icon five times and checks the canvas stack returns to zero.
