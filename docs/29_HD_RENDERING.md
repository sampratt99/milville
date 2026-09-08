# 29 — The HD rendering layer (clone only)

This document exists only in the HD clone. The game script is the original;
the look comes from seven scripts around it. Read `docs-hd/README.md` for how
to run and compare, `docs-hd/LOGIC_TOUCHED.md` for the ten guarded edits in
`index.html`.

## 1. Load order and scope

```
vendor/three/three.min.js            r128, local
vendor/three/**  (14 example modules) UMD builds: composer, passes, shaders, Sky
hd/hd-pre.js                          BEFORE the game: patches THREE classes
<the untouched game script>           sees patched classes; calls HDX.* hooks
hd/hd-post.js                         AFTER the game: sky, day cycle, weather, sun, post, reflection
hd/hd-terrain.js                      AFTER: subdivided terrain, shore-aware water, heightmap
hd/hd-foliage.js                      AFTER: trees, forest chunks, flower beds
hd/hd-chars.js                        AFTER: humanoid limbs, faces, hair
hd/hd-props.js                        AFTER: boulders
hd/hd-fx.js                           AFTER: fire particles, motes, fireflies
hd/hd-icons.js                        AFTER: 3D item icons
hd/hd-ui.css                          injected by hd-pre: the interface skin
```

Classic scripts share one global lexical scope, so `hd-post.js` reads the
game's top-level `const`s (`renderer`, `scene`, `camera`, `sun`, `hemi`,
`terra`, `waterMesh`, `BLOB_MAT`, `worldGroup`, `objects`, `rats`, `npcs`,
`ITEMS`) without the game exporting anything. Top-level `function`
declarations are reassignable, which is how `buildObjModel` and `buildForest`
are wrapped.

`HDX` is `null` in the harness (no `window.HD`) and in a browser without
WebGL2, and every hook is guarded, so the game runs unchanged there.

## 2. hd-pre.js — class swaps

- `THREE.MeshLambertMaterial` and `MeshPhongMaterial` → a subclass of
  `MeshStandardMaterial` (`roughness` 0.82, or derived from Phong `shininess`;
  `envMapIntensity` = `HD.envIntensity`). `MeshBasicMaterial` keeps its class
  but gets the colour-space hook.
- The hook (`installHook`) is an `onBeforeCompile` that: converts `diffuse`,
  `vColor` and `emissive` from sRGB with `pow(2.2)`; and, for Standard
  materials without a `map`, injects the triplanar detail shader. `HD.detail`
  is two `DataTexture2DArray`s (albedo+height, normal), 15 layers of 512² (the last is `rock`: cave and boulder stone).
- The layer id comes from `attribute float mid` (baked geometry; `bake()`
  records `HD.classify(hex)` per vertex) or from the uniform `uHDMid`
  (`HD.classifyMat(material.color)` at compile time). Mode 1 is the terrain.
- `HD.classify(hex)` is an HSL rule table (`docs-hd/VISUAL_CHANGELOG.md` lists
  the surfaces); `HD.classifyMat` first consults `HD.tintClass`, a map from
  every `ITEMS[*].equip.tint/trim` to metal/cloth/wood by model kind.
- Geometry: `CylinderGeometry`/`ConeGeometry` radial segments bumped to ≥14
  (≤4 left alone), `SphereGeometry` to ≥20×14 (≤5 left alone).
- `CanvasTexture` defaults to `sRGBEncoding`; `WebGLRenderer` defaults to sRGB
  output + ACES, so the pet/luxury examine popups match the main view.
- `?hd=off` returns before any patch.

## 3. hd-post.js — scene setup and the frame

Sun: intensity 0.95 × the day cycle, 4K/2K PCF-soft shadow map, box ±42
units, bias -0.00035, normalBias 0.05, shadow maps updated once per frame
(`shadowMap.autoUpdate=false; needsUpdate=true` in `HD.render`). Hemisphere
0.22–0.32. `BLOB_MAT.visible=false`.

Sky: an analytic dome (`ShaderMaterial`, zenith/horizon colours, sun disc and
glow, `gl_Position.xyww` so it sits at the far plane) driven by `dayState(t)`:
the sun crosses east to west over `HD.day.length` seconds, elevation 14°→62°→14°,
never setting. `applyDay` moves the sun, recolours sky/fog/hemisphere/water and
re-bakes the PMREM environment when the sun has moved 1.5% of the cycle.
Weather (`HD.weather`) cross-fades sun / overcast / rain: coverage, sun
intensity, grey sky, fog range, `uHDWet` on the terrain, rain streaks.

Reflection: `renderReflection` mirrors the camera under the nearest water
level, applies an oblique near plane to its projection, and renders the scene
into a 40%-size target every other frame; the water shader samples it through
`HD.refl.matrix` and bends it with the ripple normal.

Post chain (High): `SSAOPass` → `UnrealBloomPass(0.16, 0.6, 0.97)` →
`HD.GradeShader`. Medium: `RenderPass` → bloom → grade. Low: direct render.
Render targets are `WebGLMultisampleRenderTarget` (4×). r128 resolves MSAA at
the end of every `render()` so a pass can read the previous target.

`cheapenSSAO(pass)` replaces the pass's `render` and `setSize`: the beauty
render is untouched; the normal/depth pass runs with `camera.far = HD.aoFar`
(48) and the AO buffers are half resolution; the projection uniforms are set
per frame (stock r128 sets them once at construction). Objects in a cached
hide-list (transparent materials, `userData.hdNoAO`) are hidden for that pass.

`HD.frame(now, px, py, pz, camDist, interior)`: outdoor fog colour/range,
sky/cloud visibility and sun shadow toggles on interior transitions, water
time, `HD.tick` callbacks (wind), `dynamicShadowCasters` (600 ms), the
receive-shadow sweep (2.5 s), and `autoQuality`.

## 4. hd-foliage.js

`dressTree(o)` empties the game's `fol` group and adds one Mesh of leaf cards
(each card is a quad drawn front and back with the same outward normal, so
`FrontSide` lighting reads like a dome). `customDepthMaterial` carries the
`map` + `alphaTest` so shadows are alpha-tested (r128's shared depth material
ignores `alphaTest`). Forest chunks: `InstancedMesh` per 32×32-tile chunk with
a hand-set `geometry.boundingSphere` (three computes it from the base geometry
only, which would cull the whole chunk wrongly). Grass: 16×16-tile chunks.

## 5. Traps found while building this

- **The AO normal pass renders transparent meshes solid.** The override
  material ignores `transparent`/`opacity`, so every invisible building and
  object pick-proxy (opacity 0 boxes) showed as a pale slab. Hide them for the
  pass. Same for alpha-tested foliage cards.
- **Far-plane depth reads as 0.98, not 1.** With a 16-bit depth texture the
  perspective-to-view conversion near 1.0 is unstable, and SSAO counted every
  sky pixel as half occluded (grey sky). Guard `depth >= 0.9999` in the shader
  and use `UnsignedIntType` depth.
- **Full-scene traversals per frame cost more than the AO.** The scene has
  ~16k nodes; four traversals a frame were ~4 ms. Cache lists and refresh
  every 2 s.
- **Draw calls, not pixels, are the frame cost.** Dropping pixel ratio from
  1.5 to 1.0 saved 2 ms; halving shadow-pass draws saved 6. Cull by distance.
- **The light budget must sum to about 1.** Sun + hemisphere + environment
  irradiance on a white wall; with the physical sky's environment unscaled it
  was 2.5 and everything clipped white.
- **A brick is 0.12 units.** Texture repeat is per surface (`hdScaleFor` in the
  shader); one global scale made bricks a tile wide.
- **Colour alone cannot tell a green copper roof from a hedge**, or navy cloth
  from window glass. Item tints are resolved from `ITEMS` instead; roof and
  window colours have narrow HSL windows.
- **Frame timing needs the pane visible**: `requestAnimationFrame` stops in a
  hidden tab. Time frames by calling `render()` with rAF stubbed and
  `gl.finish()`.

## 6. Buildings: the architectural kit and how branches were upgraded

The world bake loop (`for(const b of BUILDINGS)` in the world-geometry IIFE)
now defines a per-building kit right after `P()`:

| helper | what it bakes |
|---|---|
| `hdPlinth(x0,z0,w,h,yb)` | proud granite base + stone lip around a tile rectangle |
| `hdQuoins(x0,z0,w,h,yb,hgt)` | alternating long/short stone blocks up four corners |
| `hdBand(x0,z0,w,h,y,col)` | a string course |
| `hdCornice(x0,z0,w,h,ytop)` | stone band, dentils on every face, white fascia |
| `hdSash(wx,wz,wy,ry,glass,scale)` | six-over-six sash in a white reveal, glass set back, sill, lintel, keystone |
| `hdDoor(wx,wz,yb,ry,nx,nz,col)` | pilasters, entablature, fanlight, six-panel door, three steps, lanterns |
| `hdGable(wx,wz,ybase,width,rise,ry,col,oculus)` | extruded brick triangle with a round attic window |
| `hdChimney(wx,wz,ybase,h,col,ry)` | brick stack, stone cap, two pots |
| `hdDormer(wx,wz,ybase,ry,col,roofCol)` | gabled dormer with a scaled sash |

`ry` is the wall's facing rotation (0 faces +z, `Math.PI/2` faces +x). The
generic hall branch is built entirely from the kit; the bespoke branches keep
their own massing and call the kit for windows, doors, corners, cornices,
chimneys and dormers.

The bespoke branches were rewritten by subagents in parallel without touching
the file: each produced `{kind, old, new}` (byte-exact original branch text and
its replacement), a validator spliced it into a scratch copy, syntax-checked
the game script and ran one full-game harness (the whole world bakes inside
the shim), and only a passing branch was spliced into the real file. Anchoring
on the exact original text means two agents can never clobber each other, and
a branch that fails to bake never reaches the game.

Traps found: `continue;` inside a loop within a branch is not the branch's
end (brace-match); `hdGable` needs `Math.PI` added to `ry` on the far end so
its oculus faces out; the Ruined Cottage (`pohcottage`) is meant to look
derelict, so leave its rafters alone.

## 7. Traps from the second review round

- **A bridge tile is a dam.** The game raises all four corners of a
  `T_BRIDGE` tile to the bank so the walker crosses level, and colours the
  tile as planks; there is no water under it. The HD terrain keeps a private
  copy of `hts` (`hts2`) with those corners dropped to the neighbouring bed
  and lists the tile as water. Never touch the game's `hts`: `groundH` reads
  it for every walk.
- **Screenshot camera convention.** `camera = player + (sin(camYaw),·,
  cos(camYaw))·camDist`, looking at the player. To look from the player at a
  target, put the player at `target + from` and set `camYaw = atan2(from.x,
  from.z)` — no π. Adding π flies the camera past the target. Also offset the
  player sideways (`__look(..., side)`) or the player's own body hides the
  target, which is exactly how the flames were "invisible" for an hour.
- **Additive flames vanish in daylight.** Over a sunlit stone patio an
  additive tongue adds almost nothing; the flame body needs normal blending
  with its own alpha, and only the glow may be additive.
- **One material per foliage mesh.** A willow dome drawn from the same buffer
  as the curtains takes the strand texture and reads as a woven mat; the leaf
  core is a second mesh with its own material.
- **A bake-time hook must live in `hd-pre.js`.** `buildFences`, the ruins and
  the volcano run inside the game script; `HDX.fencePost` defined in
  `hd-props.js` is undefined at that moment and the hook silently falls back.
- **Never hide a baked mesh to lose one kind of primitive.** The wilderness
  detail bake puts clutter, the asylum, the high school and Pat's Peak in one
  geometry; hiding it for the clutter lost the buildings. Skip the bake calls.
- **`tileHash` returns 0..0.5**, so lattice noise built on it runs ~0.05..0.45.
  Thresholds tuned for 0..1 noise select nothing.
- **Wilderness coordinates are not offset.** `WX=112` applies to campus
  source coordinates; the wild (x < 112), Pat's Peak, the asylum and the lava
  pools are already in runtime tiles.
- **A vertex-coloured material reads its detail layer from the `mid`
  attribute.** Foliage buffers had none, so bark rendered as the generic
  layer; `toGeometry(buf, 5)` stamps wood.
- **Bare-branch trees must not share the leaf material.** The alpha-tested
  leaf texture cut the old dead-tree cylinders to nothing; that is how the
  wilderness woods vanished.
- **Materials created during the game script have no HD textures yet.**
  `HD.tex.*` is synthesised after the game runs; a ShaderMaterial made by a
  hook (the Emberdeep melt) samples an unbound sampler and reads white. Bind
  the textures lazily in the tick.
- **The Emberdeep swaps `tiles` to `volcTiles` while inside**, and the game
  autosaves the interior; a test that enters the volcano leaves the save
  there. Call `exitVolcano()` before leaving a session.
- **Rig gear is attached after `makeHumanoid` returns** (`buildGearRig`), so a
  dresser that wraps `makeHumanoid` must scan for gear later (the cape scan
  runs every 1.5 s over the rigs it has seen).

## 8. Traps from the body pass (hd-body.js)

- **NPCs turn to face the player.** Any camera rig that puts the player near an NPC to
  photograph its face will get the back of its head: the NPC has turned toward the player,
  who is behind the camera. Portraits need a free camera (override `camera.lookAt` for the
  shot) with the player placed on the far side so the NPC turns toward the lens.
- **The game camera looks at `pwy+0.9`**, the belly. A close shot of the head at `camDist`
  around 1 frames the chest with the head out of the top. Lift the look target for face shots.
- **`pm.upper` carries every head-slot model** the game has ever built for the player, toggled
  by visibility (the hat pool). A traversal that counts "big spheres under the head" finds
  helmets, hoods and party hats, not the head. Tag your own parts and match on the tag.
- **`tube()` winds for ascending rings.** Rings listed top to bottom produce an inside-out
  surface whose back faces are culled: a skirt rendered as a translucent cone. List rings
  bottom to top and cap accordingly.
- **The skinned meshes bind with an identity bind matrix in rig-root space** and
  `bindMode='attached'`, so `bindMatrixInverse` follows the rig's own matrix; bones under the
  rig's groups pick up the game's animation for free. Do not reparent the meshes elsewhere.
- **NPC extras live on the outer group** (`n._g`), not the rig: the long-hair slab, satchels
  and straps, glasses, the shadow disc and the click cylinder. `n._hm.g` is the rig; the
  world position is `n._g.position` (tile + 0.5).
- **`applyCosmetic` rebuilds hair through `buildHair`**, so a wrapped `buildHair` is the one
  place to rebuild an HD cap on a style or colour change; the game leaves no style tag on the
  meshes it makes, so the style is read from the shapes it made (and for the player from
  `player.cos`).

## 9. Traps from the gear pass (hd-gear.js)

- **Under the HD class swaps a cone reports as a cylinder.** `ConeGeometry` comes back with
  `type==='CylinderGeometry'` and a `radius` parameter (no `radiusTop`). Any test on
  `geometry.type==='ConeGeometry'` silently matches nothing: plumes, horns and spikes stayed
  where the old head was. Test `parameters.radius!==undefined && radiusTop===undefined`.
- **The game re-tints gear every frame by walking `userData.t` tags** (`tint`, `trim`,
  `shade`) and setting `material.color`. Replacing a material is fine as long as the tag stays
  on the mesh and the new map is light and neutral; replacing the mesh is not (the tag is lost
  and the visibility toggles point at the old object).
- **Gear groups are attached after `makeHumanoid` returns** (the player's at script level,
  remote players' in `buildGearRig`, worn-gear icons' in `buildWornGearModel`), and the MP
  module calls its own `buildGearRig`, not `MP.buildGearRig`, so wrapping the export misses
  remote players. Find pieces by shape on a slow tick instead.
- **The trousers tube is the leg grown 6% + 5 mm.** Any piece over it must clear that, or
  the cloth pokes through as flat patches on the thigh. The chaps and cuisses grow 15–17 mm.
- **Per-leg pieces start at the hip joint (root y 0.80)**, so a body piece that stops at the
  waist leaves a band of trousers showing between its hem and the chaps. Jerkin and mail hang
  to y 0.58–0.60 like the plate's faulds.

## 10. Traps from the creature pass (hd-mobs.js)

- **Creature parts fall into the colour classifier.** `mesh()`/`smesh()` use `lam(hex)`,
  a single-sided material cached by colour, so the HD detail layer guesses a layer from the
  colour: a grey wolf skull came out as stone with brick seams, a gold dragon leg as wood.
  Only `lamD` (double-sided, no map) is treated as hide. While a creature is being built,
  `lam`/`lamD` are routed to per-kind hide materials with a map, which switches the detail
  layer off.
- **`lam` is cached by colour across the whole game.** Never set `userData.hdMid` on a
  material it returns: a yellow building trim would turn into dragon scale.
- **Existing creatures are not rebuilt by the game.** `makeRat` runs once per mob at spawn
  and the model is hidden on death, so a wrapped kit only reaches respawns. Rebuilding in
  place works because `makeRat` only pushes into its own local arrays: remove the old group
  from the scene, drop its entries from `proxies`, call `makeRat(r)` again, copy visibility,
  position, rotation and scale from the old group.
- **The sweep's frame can flip between sections** when the tangent crosses the reference
  axis; the HD sweep keeps the binormal on the same side as the previous row, or the tube
  twists and the countershade swaps top for bottom.
- **`mesh()` facets its geometry**: `facet(geo)` returns `toNonIndexed()`, a plain
  `BufferGeometry` with no `parameters`. Any box, foot or brow made with `mesh()` cannot be
  found by `parameters.width` afterwards; find it by its parent group (the ankle's mesh), its
  colour or its position instead. `smesh()` keeps the original geometry and its parameters.
- **Eyeballs with lid caps read as two sets of eyes.** A white sphere standing proud of the
  face plus skin caps over it gives two round silhouettes per eye at any distance. Paint the
  eye as one almond decal recessed into the socket and draw the lids on the face texture.

- **A slice between two function anchors swallowed two builders (stage 25).** The layered-hair
  patch replaced everything from `function hairGeometry(` to `function hairFromGame(` — and
  `beardGeometry` and `dressSatchel` lived between them. `node --check` passed; the game then
  threw `beardGeometry is not defined` at hd-body's kit export, so `HD.bodyKit` never existed and
  hd-gear (which needs it) silently did nothing: no armour dressed, no gear at all, for two
  stages. Only the console showed it. When replacing a block, anchor on the block's own last
  line, and after every patch run the game and read the console for `[Milville error]`.

- **`userData.hdSw` means nothing.** hd-post stamps it on every mesh it converts. A cleanup
  keyed on it (stage 32) emptied the party room's lever, banners and Callahan. Key cleanups on
  the tag the builder you mean actually sets, and never on a rig's parent group.
- **Never add to a rotation the game does not reset.** The game resets the torso's x each frame
  and not y or z; an offset added to y accumulated into a spin. Keep a base and set from it.

