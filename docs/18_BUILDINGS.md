# 18 — Campus Buildings: how they're defined, stamped, and rendered

This is the authoritative recipe for **editing or adding named campus buildings** (the next
planned work: rebuilding specific buildings to match real St. Paul's photos). Read
`10_MAP_AND_WORLD.md` §1 (coordinate spaces) first — it is the #1 way to get this wrong.

## 1. The `BUILDINGS` data table

One array of raw rows, mapped inline to objects (search `const BUILDINGS=[`):

```js
const BUILDINGS=[
 ['Chapel of St. Peter & St. Paul', 84,97, 16,6, 4.6, 'chapel', 0x83392b, 0x55606b,
  'The great chapel. Its tower keeps watch over the whole campus.'],
 // ... ~51 rows ...
].map(a=>({name:a[0], x:a[1], y:a[2], w:a[3], h:a[4], hgt:a[5], kind:a[6],
           col:a[7], roof:a[8], ex:a[9]||"One of the school's halls."}));
```

| Field | Meaning |
|---|---|
| `name` | Display name (hover + examine header) |
| `x, y` | **SOURCE coords** of the footprint's NW corner (runtime = +112; see 10 §1) |
| `w, h` | Footprint width (x-extent) and depth (y-extent) in tiles |
| `hgt` | Wall height in world units (roof adds more on top) |
| `kind` | Style id → which bake branch renders it (see §3) |
| `col` | Wall color (hex int) |
| `roof` | Roof color (hex int) |
| `ex` | Examine text |

## 2. What happens automatically to every row

1. **Footprint stamping** (right after the array): every tile in the `w×h` rectangle becomes
   `T_WALL` and is written into `bgrid[y][x] = b` — the building **hit-grid** that powers
   hover highlighting and right-click **Examine** on any of its tiles. You get collision +
   examine for free from the row alone. (A few hand-carved exceptions follow the loop —
   e.g. the Lindsay courtyard is punched back to `T_FLOOR`, the Matthes Cage link corridor is
   sealed — read the ~30 lines after the stamping loop before assuming a clean rectangle.)
2. **Base height** (`b.base`): a later loop averages the heightfield under the footprint so
   the building sits level on terrain.
3. **The +112 shift**: the expansion block does `for(const b of BUILDINGS) b.x += WX` and
   re-embeds `bgrid` at +112. So rows are written in source coords, and everything lines up
   at runtime.
4. **3D geometry**: the big per-building bake loop (search `for(const b of BUILDINGS){` inside
   the world-geometry build, ~line 11085) renders each building **by its `kind`** into the
   baked static mesh. This runs at scene-build time, after the shift, using runtime coords.

## 3. The style `kind`s (each is a branch in the bake loop)

`afc, cage, chapel, crump, hall, hargate, library, lindsay, memorial, observatory, oldchapel,
plant, portico, rectory, rink, round, schoolhouse, sheldon, upper` — plus the **generic
default branch** (no matching kind) which builds a standard gabled brick/clapboard hall from
`col`/`roof`/`hgt`. Unique buildings (Rectory, Chapel, Sheldon, the Observatory dome, the
Cage...) have bespoke branches with foundations, cornices, windows, towers, porches, etc.

Inside a branch you have: `cx, cz` (footprint center), `y0 = b.base`, `hg = b.hgt`,
`alongX`/`RY` (orientation helpers — buildings orient along their longer axis), and a local
`P(lx,lz)` that maps local offsets to world coords respecting orientation.

## 4. The building blocks (see `11_3D_AND_RENDERING.md` for full signatures)

```js
bake(out, geometry, hexColor, x, y, z, ry, sc, rx, rz)  // add one transformed piece
box(w,h,d)                                              // BoxGeometry shorthand
new THREE.CylinderGeometry / SphereGeometry / ConeGeometry   // r128 only — NO CapsuleGeometry
groundH(x,z)                                            // seat pieces on terrain
```
Windows/doors are just thin dark boxes (`WIN`, `DOOR` color constants) baked slightly proud
of the wall. Roofs: boxes rotated in z for gables, cylinders/cones for towers, or
`THREE.Shape`-extruded gable profiles (the `gable()` helper pattern exists in interior code).

## 5. Recipe — restyle an existing building (the photo-matching workflow)

1. Find its row: `grep -n "'Ohrstrom Library'" milville.html` → note source x,y,w,h.
2. Find (or create) its `kind` branch in the bake loop. If it currently uses the generic
   default, add a new kind (e.g. `'ohrstrom'`) to the row and a new
   `if(b.kind==='ohrstrom'){ ... continue; }` branch.
3. Build the shape from the photo with `bake()` calls: foundation slab → wall masses →
   cornice bands → window grids (loops of thin boxes) → roof → chimneys/details. Use
   `cx,cz,y0,hg` and the `P()` helper so orientation stays correct.
4. Footprint changes (bigger/smaller/L-shaped): adjust `w,h` in the row for the main
   rectangle; carve or add extra `T_WALL`/`bgrid` tiles right after the stamping loop for
   non-rectangular shapes (that's the established pattern — see Lindsay/Coit exceptions).
5. Validate: node --check; a harness that constructs the geometry branch with a THREE stub
   (confirm no throw, count bake calls); scan `tiles`/`bgrid` over the region if the
   footprint changed. **Looks need the user's browser.**
6. Remind the user: hard-refresh, fresh `?v=`; check hover/examine still tracks the building.

## 6. Recipe — a brand-new building

1. Pick a clear grass site (scan `tiles` for `T_GRASS`, avoid paths/water/objects).
2. Add a row with **source coords** (runtime−112) — or, if you must place it in the deep
   wilderness (runtime x<112), source coords would be negative, so instead place it with
   post-expansion code using runtime coords (rare; ask the user first).
3. Give it a kind (or take the generic default), colors, `hgt`, and examine text.
4. Everything else (stamping, hit-grid, base, shift) is automatic. Bake a bespoke branch if
   the default silhouette isn't right.
5. Consider a door + interior (see `17_INTERIORS.md`) and an entry in the Wiki map page if
   it's notable.

## 7. Gotchas

- **Coordinate space** (again): rows are source coords. A row with runtime coords lands 112
  tiles east of where you meant — inside campus that's someone else's lawn.
- The footprint stamps **solid `T_WALL`** — players can't walk through any of it. Doors into
  interiors are carved as exceptions (see the Chapel entrance predicate pattern in 17).
- `bgrid` powers hover/examine — if you hand-carve footprint tiles, keep `bgrid` in sync
  (set it to the building object on added tiles, `null` on removed ones).
- The bake loop `continue`s after each bespoke branch — forget it and the generic building
  renders *on top of* your bespoke one.
- Buildings are **baked** (static, non-interactive geometry). Anything clickable inside/near
  them is a separate `addObj` object with an `OBJ_DEFS` entry.
