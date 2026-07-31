# 10 — Map & World (READ §1 BEFORE ANY MAP WORK)

## §1. THE COORDINATE SYSTEM — source coords vs. runtime coords

The world began as a `192 × 136` grid. It was later **expanded west by 112 tiles** for the
deep wilderness. The mechanism (in the map-gen code, search `const WX=112`):

```js
let W=192; const H=136; const WX=112;
// ... original map painted at x 0–191 ...
// EXPANSION BLOCK (runs once during load):
W = 304;                                  // new width
for(const o of objects) if(!INT_DEFS.has(o.def)) o.x += WX;   // interiors stay put
for(const b of BUILDINGS) b.x += WX;
for(const n of npcs){ n.x+=WX; ... }  for(const r of rats){ r.x+=WX; ... }
// bgrid (building hit-grid) and wbody (water map) re-embedded at +WX
// THEN the new deep wilderness is painted into runtime x 0–111
```

**The two coordinate spaces:**

| Space | Who uses it | Range |
|---|---|---|
| **SOURCE coords** | The original campus data arrays as written in the file: `BUILDINGS` rows, `SIGNS`, original `addObj(...)` calls, original NPC/mob spawn tables — anything defined **before** the expansion block | x 0–191 |
| **RUNTIME coords** | Everything in a running game: `player.x`, `objAt`, `tiles[y][x]` after load, and **all code that executes after the expansion block** (deep-wild painting, Emberdeep, Matthes Cage pit, later feature additions) | x 0–303 |

**Conversion: runtime = source + 112 (for pre-expansion data). `H` never changed (136).**

Practical rules:
- **Editing an existing campus building/object/NPC:** find its source array entry; its x is
  runtime−112. (Rectory building row says x=86 → in-game x=198.)
- **Adding a new campus building via a `BUILDINGS` row:** write source coords (runtime−112);
  the shift adds 112 at load. This is the normal path — see `18_BUILDINGS.md`.
- **Adding anything in the deep wilderness (runtime x<112)** or in code that runs after the
  expansion: use runtime coords directly.
- When in doubt, grep where your insertion point sits relative to the expansion block
  (search `for(const b of BUILDINGS)b.x+=WX`).
- Interiors are exempt from the shift (their objects are in `INT_DEFS`) — see §7.

## §2. Grid & tiles

- `tiles[y][x]`, row-major (y first). **W=304, H=136** at runtime.
- Tile constants: `T_GRASS=0 T_WATER=1 T_PATH=2 T_WALL=3 T_FOREST=4 T_FLOOR=5 T_BRIDGE=6
  T_FENCE=7 T_DITCH=8 T_LAVA=9 T_LAVAHOT=10`.
- Helpers: `inb(x,y)`, `blocked(x,y)` / `blockedStrict(x,y)`, `objAt(x,y)`, `groundH(x,z)`
  (terrain height; seat all models with it), `tileHash(a,b)` (stable per-tile variation).
- Heightfield `hts[y][x]`; water bodies tracked per-tile in `wbody` (levels via `waterYAt`).
- Save map-version stamp: `mapv:'sps3'`.

## §3. The regions (runtime coords)

| Region | Where | Notes |
|---|---|---|
| **Main campus** | x≈112–303 (the original map, shifted) | Safe. 51 named buildings, all shops/quest hubs. |
| **The Wilderness** | everything past the ditch; `inWild(x,y)` via flood-filled `wildMask` from (1,1) | Danger + best drops; death → `lostStash` (reclaim fee at the Slayer Master). |
| **Deep/western wilderness** | runtime x 0–111 (the expansion) | Mountains, valley, dead groves, lava pools, the volcano, Pat's Peak ski mountain (snow ellipse ~ctr(18,14)), the Asylum, Swenson Granite Quarry area, the agility ropes course (~x20, y66–72). |
| **The Emberdeep** | Interior floors under the volcano | Endgame zone, entered via the lava volcano (**Agility 35**). See `19_EMBERDEEP.md`. |
| **Stronghold of Security** | building at runtime (146,109); `sos` interior floors | Descending mini-dungeon. |
| **Matthes Cage** | building at runtime (174,16) by the AFC; PvP pit interior in the dead zone | See `20_PVP_MATTHES_CAGE.md`. |

## §4. Named buildings (runtime coords, from the live `BUILDINGS` array)

51 buildings. Key ones (full list: print `BUILDINGS` in a harness):

| Runtime (x,y) | Building |
|---|---|
| (198, 80) | **Rectory** — home base, quest hub, Rectory Teleport target (200,86) |
| (196, 97) | Chapel of St. Peter & St. Paul — prayer altar; chapel interior |
| (212, 86) | Chapel of St. Paul (Old Chapel) — St. Paul interior |
| (224, 90) | Ohrstrom Library |
| (216, 39) | Sheldon (old library) |
| (244, 50) | Coit (Upper Dining Hall) — cooking hub |
| (256, 60) | Hockey Center (Gordon & Ingalls) |
| (182, 15) | Athletic & Fitness Center |
| (174, 16) | **Matthes Cage** (PvP) |
| (260, 17) | Crumpacker Boathouse — Turkey Pond fishing |
| (273, 32) | Hawley Observatory |
| (166, 82) | Schoolhouse |
| (147, 80) | Lindsay Center for Math & Science |
| (146, 109) | Stronghold of Security |
| (207, 57) | Hargate (party-room interior) |
| (151, 67) | Memorial Hall |

Dorm/house rows (Drury, Kehaya, Warren, Manville, Brewster, Ford, Simpson, Kittredge, Nash,
Clark House, Conover/Twenty, Scudder, Foster, Middle, Armour, Pratt House, faculty cottages,
etc.) are all in `BUILDINGS` with pick-boxes for hover/examine.

`SIGNS = [[x,y,'label'],...]` (13 signposts) are **source coords** in the array; their placed
objects shift +112 like everything else.

## §5. Teleports (magic-gated — this changed!)

```js
const TELEPORTS = {
  rectory_tele: { name:'Rectory Teleport',    req:25, cost:0, x:200, y:86 },   // runtime target
  wild_tele:    { name:'Wilderness Teleport', req:45, cost:0, x:163, y:31 },
};
```
- Teleports are cast from the **Magic tab** (spellbook cells), gated by **Magic level**
  (25/45), **no runes, no cost**. (They were prayer-based long ago — that's gone.)
- `castTeleport(id)`; blocked shortly after combat. The Hunter's Signet ring still provides
  its own chaos-temple teleport.

## §6. Wilderness mechanics

- Past the `T_DITCH` line; `inWild(x,y)` checks `wildMask` (flood-filled from (1,1), bounded
  by the ditch).
- Wild mobs scale with the player; the deep west adds high-tier mobs (giants, dragons by
  color, kurask, cinderwing, snow king on Pat's Peak, bandit camp, the Asylum's patients...).
- Death in the wild → items to `player.lostStash`, reclaimable for a fee.
- Swenson Granite Quarry (berrite rocks ~ (163,118)/(183,119), deposit chest (90,113)) feeds
  the `swenson` quest & mining pouch; the ropes course (~x20,y66–72) trains Agility (35
  unlocks the volcano descent → Emberdeep).

## §7. Interiors — coordinate exemption

Interior overlays (Chapel, St. Paul, Rectory interior, Hargate Party Room, Matthes Cage pit,
Emberdeep floors...) are built in dead-zone regions of the same grid and their objects are in
`INT_DEFS` — **they do NOT get the +112 shift**. Their coords are whatever the interior
builder used (e.g. the Cage pit region MPIT ≈ x111–129, y11–32). Pattern + recipe:
`17_INTERIORS.md`.

## §8. Map-editing checklist

1. Determine your coordinate space (§1) — source vs runtime — for the insertion point.
2. Paint footprint tiles (`T_WALL` for solid structures) or rely on the `BUILDINGS`
   footprint stamping (buildings auto-stamp their rectangle — `18_BUILDINGS.md`).
3. Interactive objects: `addObj(def,x,y,...)` + an `OBJ_DEFS` entry (+ `optionsAt` action).
4. Decorative-only: bake geometry, no collision (see `11_3D_AND_RENDERING.md`).
5. Validate with a harness scanning `tiles`/`objAt` over the region; then user's eyes.
