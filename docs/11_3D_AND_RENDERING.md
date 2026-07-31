# 11 — 3D & Rendering

Low-poly Three.js **r128**. Most of the world is **baked** into merged static meshes; the
player, mobs, NPCs, drops, and interactive objects are dynamic groups.

## r128 constraints
No `OrbitControls`; no `CapsuleGeometry` (r142+) — Cylinder/Sphere/Cone/composites only.
Nothing renders offline; harnesses only prove models construct without throwing.

## Core helpers

```js
box(w,h,d)                                   // BoxGeometry shorthand
bake(out, geo, hex, px,py,pz, ry, sc, rx,rz) // add transformed colored geometry to a buffer
bakeMesh(out, shadow)                        // buffer -> one merged Mesh
groundH(x,z)                                 // terrain height (seat everything with it)
addProxy(parent, r, h, yoff, data)           // invisible pick cylinder for hover/click
tileHash(a,b)                                // stable per-tile variation
makeGroundItem(id)                           // dropped-item world model
buildObjModel(o)                             // interactive-object models (o._m.group)
```

Pattern: accumulate `bake(...)` calls into `out`, finalize with `bakeMesh` → few draw calls.
Decorative scenery = baked, non-collidable. Interactive things = `addObj` + `OBJ_DEFS` entry
+ proxy. Campus buildings have their own pipeline — see `18_BUILDINGS.md`.

## Gear/item visuals

- Worn models dispatch on `equip.model` (sword, scim, helm, plate, legs, cape, bow, staff,
  hide, robe, boots, gauntlets, ring, amulet, book, crown, quiver, towershield, ...); colors
  from `tint`/`trim`. New distinctive gear should also be mirrored to the **remote-player
  rig** (`buildGearRig` + `applyRemoteGear` in the MP module) or other players won't see it.
- **Icons**: `drawItemIcon(g,id,S)` (2D canvas) — every item needs a case (by id or model);
  icon color code is hardened with `??`-fallbacks (don't remove them — missing tint used to
  crash with masked "Script error"). Related: `drawUiIcon` (nav/skill/guide icons incl.
  coin/map/question), `drawPrayerIcon` (26 prayers: category glyph + tier pips),
  `drawSpellIcon` (element/tier + alch coins).
- `buildLuxuryModel(id)` powers the rotatable luxury examine popup (22): rings are upright
  bands with seated gems; the crown is a standalone circlet — don't regress the orientation.

## Worked examples in the codebase
The cemetery gravestones (baked decoration), the Matthes Cage podium figures, the Emberdeep
props, and every `b.kind` building branch are good reference implementations.

## Orientation & icon traps (hard-won)

- **Cylinders and tori are born UPRIGHT (Y axis).** A round face meant to hang on a wall — dartboard,
  target rings, a clock dial, a mirror, a shield — needs `rotation.x = Math.PI/2`. In house code use
  the `CD()` disc helper; the `C()` helper only rolls on **z** and cannot stand a disc up.
  A torus laid flat needs the same rotation; an upright arch is correct as born.
- **`drawItemIcon` balances the canvas itself** — `save()` / `try` / `finally restore()`. Branches
  historically forgot `restore()`, and since every inventory slot keeps its own canvas the stray
  translate accumulated on each re-render: the icon marched into the bottom-right corner and shrank.
  Run the `iconaudit` harness after adding any icon; it draws all ~418 five times and asserts the
  canvas stack returns to zero.
- **Item sprites belong in `ITEM_ICON_PNG`; nav/skill icons in `UI_ICON_PNG`.** The item table draws
  early in plain 0..S space with an early return; the UI table draws in centred space. Misfiling an
  item sprite into the UI table produces the corner-icon bug.
- **Models are built facing +z.** Anything mounted on a wall needs the room's facing rotation applied
  (`houseSlotFacing` in house code) or it faces into the plaster.
