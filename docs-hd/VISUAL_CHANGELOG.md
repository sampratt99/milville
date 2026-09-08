# Visual changelog

Captures are the raw game canvas (1173 x 802, quality High) from the same
character and camera, taken with `?hd=off` (before) and without (after). All
files are in `docs-hd/shots/`.

## Stage 1 — the rendering pipeline (`hd/hd-pre.js`, `hd/hd-post.js`)

| Before | After |
|---|---|
| ![](shots/H3_before.png) | ![](shots/H3_after.png) |
| ![](shots/A_before.png) | ![](shots/A_after.png) |

- Linear-light rendering with sRGB output and ACES filmic tone mapping; every
  authored colour (material, vertex, emissive) is converted from sRGB in the
  shader so the original palette survives.
- Physically based materials everywhere the game used Lambert/Phong, with a
  triplanar surface-detail shader: brick, stone, slate, wood, foliage, plaster,
  metal, glass, cloth, skin, each with a normal map and a roughness modulation,
  selected per vertex (baked world) or per material (everything else) from the
  colour the game authored.
- The sun is a real shadow caster (4K PCF-soft map, 84-unit box around the
  player); the OSRS blob shadows are hidden. The terrain casts and receives.
- A physical sky (Preetham) scaled to the exposure, feeding a PMREM
  environment map so every surface picks up sky light and reflections; light
  budget sun 0.82 + hemisphere 0.12 + environment 0.5 so a white wall sits at
  1.0 before the tone map.
- Terrain: the painted vertex colours drive a grass/dirt blend, with rock
  creeping onto slopes and snow keeping its flat brightness.
- Distance fog in the horizon colour instead of black at 46 units; camera far
  plane 520; a drifting two-layer cloud deck.
- Post: SSAO (normal/depth pass limited to 48 units and half resolution;
  transparent pick-proxies and foliage excluded), Unreal bloom, a final grade
  (saturation 1.16, contrast 1.06, light vignette, linear-to-sRGB).
- Primitives: cylinders and cones get 14+ radial segments, spheres 20 x 14;
  deliberate 3- and 4-sided shapes are left alone.

## Stage 2 — foliage, water, glass (`hd/hd-foliage.js`)

| Before | After |
|---|---|
| ![](shots/W3_before.png) | ![](shots/W3_after.png) |
| ![](shots/C_before.png) | ![](shots/C_after.png) |

- Campus trees (tree, oak, willow, birch): the 6-7 icosahedron blobs become
  14-26 alpha-tested leaf cards with a procedural leaf-cluster texture, lit by
  a canopy-shaped normal, swaying in a vertex-shader wind, casting alpha-tested
  shadows. Woodcutting still hides the same `fol`/`trunk` groups.
- Forest border: the baked five-sided cones are hidden and rebuilt as 57
  frustum-culled InstancedMesh chunks: conifers (needle fronds), two deciduous
  kinds, snow pines, dead wilderness trees and the twisted asylum wood.
  Autumn recolouring still works through the wrapped `buildForest()`.
- 41,000 instanced grass tufts on grass tiles, two per tile, wind-blown,
  dissolving between 38 and 46 units; sparse yellow tufts in the wilderness.
- Water: deeper colour, two counter-scrolling ripple normal layers, fresnel
  opacity (clear looking down, mirror at grazing angles), sky reflection.
- Window-pane colours classify as glass: smooth, half-metallic, reflecting
  the sky.

## Stage 3 — characters and performance

| ![](shots/G_after.png) | ![](shots/I_chapel.png) |
|---|---|
| bronze set: reflective metal, cloth cape | the chapel interior under the new pipeline |

- Equipment tints are classified by item type from `ITEMS`: plate, helms,
  legs, blades, jewellery render as metal (metalness 0.85, roughness 0.3);
  capes, robes, hide, boots as cloth; bows and staves as wood.
- Skin tones get a soft sheen; saturated dyes get a cloth weave.
- Shadow casting limited to object roots within 36 units of the player; the
  shadow pass fell from ~4,000 draws to under 1,000. Campus trees are one
  draw each instead of ten.
- Frame time on this machine at 1173 x 802: High 18.6 ms (was 35 at the
  first working build), Medium 10.4 ms, Low ~11 ms. Draw calls 2,052 with
  shadows (was 6,140).

## Stage 4 — sky, day cycle, smooth terrain and water, faces (`hd/hd-terrain.js`, `hd/hd-chars.js`)

| ![](shots/H3_after.png) | ![](shots/W3_after.png) |
|---|---|
| the chapel lawn under the new sky | the stream: feathered banks, waves, lapping foam |

- The Preetham sky is replaced by an analytic dome (zenith and horizon colours,
  sun disc and glow); the sun crosses the sky east to west over 25 minutes,
  dawn to dusk, never setting (elevation 14° to 62°). Sun colour, sky, fog,
  hemisphere, water reflection and the environment map all follow. Time of
  day persists across reloads.
- Terrain rebuilt at 3×3 subdivision in 32-tile chunks: the same bilinear
  heights `groundH()` uses (nothing the game seated moves), bicubic shading
  normals so slopes read smooth, and colours gathered with a Gaussian over the
  neighbouring tiles so road edges and shorelines feather over half a tile.
  Lawns pulled toward olive.
- Water rebuilt as a shore-aware surface (per-vertex `shore`): GPU waves with
  analytic normals, two ripple layers, depth colour, fresnel, analytic sky
  reflection, sun specular, foam that breathes in and out along the shore,
  alpha fade at the land edge.
- Grade made neutral, ambient lifted; grass tufts removed.
- Faces: every humanoid rig gets a procedural face texture (eyes with iris and
  highlight, brows in the hair colour, nose shading, lips) and sculpted lathe
  limbs, mitten hands with thumbs, shoes; box hair slabs rounded. The rig
  objects are untouched so animation and costumes still work.
- Willow and birch canopies densified; the Rectory beds planted; hedges along
  every building foundation and loose bushes in the fields.

## Stage 5 — interface (`hd/hd-ui.css`)

- Dark slate glass panels with steel-blue borders and rounded corners, gold
  accents, a clean sans face, the 3D view framed as a viewport. Tabs, slots,
  skills, prayers, spells, buttons, context menu, dialogue box, tooltips,
  modals, scrollbars, inputs and the title screen (typeset wordmark) are all
  restyled. The chat stays a light card because the game colours each chat
  line inline for parchment. Not loaded under `?hd=off`.

## Known limits / next stages

- Characters are the game's rigs with sculpted limbs, faces and PBR
  materials; RS3-grade characters still need modelled, rigged meshes (an art
  task, not a shader). Monsters are the game's lofted tube models with the new
  materials.
- Buildings keep their baked geometry (the game's 19 bespoke styles) under the
  new brick/slate/stone/glass surfaces; deeper window reveals or cornices would
  need each bake branch rewritten.
- Fire and magic effects are the game's own meshes; bloom lifts them but no
  particle systems were added.
- Interiors keep their original lighting design with the new materials; they
  were checked in the chapel only.
- SSAO on High is the single most expensive feature; Medium is the sensible
  default on integrated GPUs, and the auto-tier will pick it.

## Stage 6 — ground, water, weather, rocks (`hd/hd-pre.js`, `hd/hd-terrain.js`, `hd/hd-post.js`, `hd/hd-props.js`)

| ![](shots/A_after.png) | ![](shots/W_after.png) |
|---|---|
| lawn and gravel as real ground layers | the stream: earth banks, depth-faded water |
| ![](shots/RAIN_after.png) | ![](shots/ROCK_after.png) |
| rain: grey sky, streaks, wet ground | mining nodes as displaced boulders |

- Grass and gravel are full-colour albedo layers (blade relief, dry patches,
  embedded stones), each sampled at two scales with a macro variation so no
  tiling shows; a hue-based greenness mask picks the layer per tile and a
  height-aware blend lets grass creep over gravel. The painted map only tints.
  Moderate slopes turn to bare earth, near-vertical ones to rock.
- The flat blade / petal / pebble clutter bake is hidden (one guarded line in
  `index.html`); bushes are off.
- Water fades by true depth (a per-vertex depth attribute), foams only in the
  shallows, and carries a planar reflection: the world is rendered once more
  per frame from a mirror camera under the nearest water level into a half-size
  target with an oblique near plane, and sampled through that camera's own
  projection, so trees and walls reflect at the correct angles, bent by the
  ripples. A slow swell was added; rain adds impact ripples. The bank within
  0.3 of the water level is darker and glossy.
- Weather: sunny / overcast / rain states lasting minutes with ~10 s cross-fades.
  Rain dims the sun, greys the sky and fog, thickens the fog, wets the ground
  and draws 1,400 recycled rain streaks around the player. `HD.weather.force`
  = `'sun' | 'cloud' | 'rain'` pins it for screenshots.
- Rocks: every dodecahedron under a world object (mining nodes, boulders) is a
  displaced icosphere with a flattened base.
- Willows are dense curtains of long hanging leaves; birches fuller.
- Ground-contact grime: walls and props darken in the 1.2 units above the
  terrain, from a baked 8-bit heightmap of the overworld.
- Shadow maps update once per frame and are shared by the reflection, AO and
  beauty passes.
- Interface skin: the RuneScape faces and pixel logo are kept; only the panel
  chrome is the dark RS3 skin.

## Stage 7 — buildings, fire, icons, creatures (`index.html` bake branches, `hd/hd-fx.js`, `hd/hd-icons.js`)

| ![](shots/HALL_after.png) | ![](shots/RECT_b.png) |
|---|---|
| the Music Building on the shared kit | the Rectory rebuilt by a subagent on the same kit |

- An architectural kit shared by every building branch: proud granite plinth,
  alternating stone quoins, string courses, dentilled cornice under a white
  fascia, six-over-six sash windows in white reveals with the glass set back,
  a pedimented six-panel door with fanlight, three steps and lanterns, true
  extruded triangular gables with an oculus, chimneys with caps and pots,
  gabled dormers. The generic hall (seven buildings) is rebuilt on it; every
  one of the 40 bespoke styles was then upgraded with the same kit by five
  subagents working in parallel, each branch validated by baking the whole
  world in the offline shim before it was spliced in.
  **Reverted in stage 8**: the owner's brief is that every bespoke building is
  a model of its real St Paul's counterpart, so added quoins, trim, pediments
  and colour changes were wrong. Every bespoke branch is back to its original
  text (commit `a6fa35f`); only the generic hall keeps the kit (minus quoins),
  and the observatory keeps its small first-pass details. Upgrades to bespoke
  buildings must be cosmetic: surface texture, glass, small details.

| ![](shots/SHELD_a.png) | ![](shots/SCHOOL_a.png) |
|---|---|
| Sheldon | the schoolhouse |
| ![](shots/OLDCH_a.png) | ![](shots/DRURY_a.png) |
| the old chapel | Drury over the pond |
| ![](shots/LIND_a.png) | ![](shots/BARN_a.png) |
| Lindsay, kept modern | the Red Barn |
- Fire: GPU particle emitters (embers, flame licks, smoke) on every lit fire,
  brazier and torch; the cones become additive glow cores.
- 3D item icons: every inventory, bank and equipment icon is the item's own
  3D model rendered once at the RS3 angle in an offscreen renderer and cached.
- Creatures: the creature kit's double-sided materials take a leathery hide
  layer instead of wood grain or cobblestone; goblins and students get faces
  through the humanoid rig dresser.
- Water reflection at 40% size every other frame (was ~8 ms, now ~4).

## Stage 8 — the second review round (`hd/*`, no game-script edits)

| ![](shots/FIRE_q.png) | ![](shots/WILLOW_u2.png) |
|---|---|
| the campfire: a flame body over the stone pit | the willow as a weeping dome of strands |
| ![](shots/BRIDGE_after3.png) | ![](shots/FIRE_s.png) |
| the river running under the plank bridge | the same fire at dusk |

- Buildings reverted to their original bespoke models (see stage 7 note).
- Title and character-select screens restyled as dark oak, parchment and gold
  with the RuneScape faces; the in-game item icons are the OSRS sprites again
  (`HD.icons3d=false`; the 3D icon renderer stays available).
- Fire: three living flame tongues (a lathe profile swayed in the vertex
  shader, a scrolling fire-noise ramp cut into licks in the fragment shader,
  normal blending so the body reads over a sunlit patio) seated at the span of
  the game's own cone, which is hidden. Embers, licks and smoke stay.
- Willows: the trunk stays; seven short boughs inside a shaggy dome of 84
  hanging strand cards placed on the upper hemisphere (short at the crown,
  longest at the rim, never below knee height), a small leaf core at the top,
  bough-tip curtains. The strand texture is drawn as stems hanging from the
  top edge with leaves ticked along them, ragged at the bottom, feathered at
  the sides so no card reads as a slab.
- Bridges: the HD terrain uses its own copy of the height grid with bridge-tile
  corners dropped to the neighbouring bed, and treats a bridge tile that spans
  water as water, so the river runs under the planks the game bakes (whose
  posts already reach the bed). `groundH` and walking read the game's grid.
- Window glass: fresnel reflection of a 96 px world cube map rendered at the
  player one face every three frames; the glass darkens to 35% so the
  reflection reads without becoming a mirror.
- Terrain micro-relief (±7 cm, two octaves) on open lawn only; ground cover as
  crossed clump cards, value-noise clustered, tinted from the tile colour.
- Boulders: coarse flat-shaded icosphere pushed by two octaves of noise, two
  cleavage planes, a flattened bed and a skirt of chips, for every
  dodecahedron rock (mining nodes included).

## Stage 9 — fences, signposts, ruins, the wilderness (`hd/*`, four guarded hooks in `index.html`)

| ![](shots/HD_asylum_fog.png) | ![](shots/LAVA_f.png) |
|---|---|
| the asylum under the deep-wild pall | a lava pool: stylised plates, seams, spurts |
| ![](shots/WILD_shallow4.png) | ![](shots/SNOW_d.png) |
| the shallow wild: dirt with grass drifts | Pat's Peak: powder snow and footprints |

- Fences: `HDX.fencePost(h)` / `HDX.fenceRail(axis,h)` hand the game's fence
  bake an octagonal chamfered post and bowed tapered log rails (defined in
  `hd-pre.js`, because the bake runs inside the game script).
- Ruins: `HDX.ruinBlock(h)` gives the wilderness ruins worn ashlar (rounded
  arrises, chipped tops, six size variants).
- Signposts: turned octagonal post with plinth and finial, bracket with a
  diagonal brace and an iron ring; the banner and its sway are the game's.
- Ore nodes keep the game's octahedral crystals (a shard-cluster vein was
  tried; the owner prefers the crystals).
- Wilderness: a BFS depth-into-the-wild grid and an "eerie" field around the
  asylum and the high-school ruins. Shallow wild is dirt with value-noise
  drifts of coarse grass (the terrain splat then grows grass there, and the
  ground cover follows); deep wild goes to ash and grey, greys the sky, dims
  the sun, and carries a constant haze plus a pall that rolls in and out over
  a couple of minutes (`HD.wildEerie`, `HD.eerieForce` to test).
- Lava: one shared `HD.lavaMaterial()` (crust plates, glowing seams, creeping
  flow, pulse; RS3-stylised, not photoreal) on a mesh over the wilderness
  pools and, through a guarded hook, on the volcano chambers' own lava
  meshes. Spurts: 96 CPU-simulated gobs that arc off the pools and burst.
- Snow: powder from the generic grain at two scales with a fine glint, no
  cobble pattern; footprints as 64 instanced decals laid every 0.42 units of
  travel on snow, alternating feet, fading over thirty seconds.
- Draw distance: fog now ends at `HD.drawFar` (150 units) instead of the
  whole map, thickening with weather and the pall.
- Pilot aid: a click on the expanded world map teleports to that tile.
- Fixed: the wilderness detail bake (asylum, high school, quarry rig, Pat's
  Peak lodge and pines) had been hidden with the flat clutter it shared a
  mesh with; the clutter is now skipped at bake time instead.

## Stage 10 — the RS3 look, and the wilderness as its own place (`hd/*`)

| ![](shots/CAMPUS_amb.png) | ![](shots/WILD_amb.png) |
|---|---|
| the campus after the RS3 grade | the wilderness: dim, cool, close fog, dead woods |

The owner's brief, with an RS3 Lumbridge reference: high definition in a
fantasy sense, hand-painted rather than photographic. What changed:

- Surfaces: normal-map strengths roughly halved across every layer; the dirt
  is broad painted mottling with a few larger soft stones, not gravel.
- Grade: saturation 1.12, contrast 1.02, a warm multiply and a lifted black
  point; vignette down to 0.08. Sun 0.88, hemisphere 0.3–0.4 (softer shade),
  environment share 0.5.
- Window glass: the cube reflection is sampled with a mip bias of 2.5 and
  lifted toward a sky tone, so trees read as tone rather than blobs.
- Wilderness trees: `deadTree()` — a wandering tapered trunk, crooked limbs
  that fork into twigs; the asylum 'twisted' kind is taller, darker and
  writhes. They take a bark material with the wood detail layer (the old
  cylinders wore the alpha-tested leaf material and were invisible).
- Wilderness ground: a `hdWild` terrain attribute (eased over three tiles
  from the boundary) darkens and greys the earth in the splat shader, with a
  large mottle, so the wild is trodden dark earth, not the campus path.
- Wilderness light and air: the sun dims 28% and cools, the hemisphere cools,
  the sky greys, the fog turns blue-grey and closes to ~16/62 units so the
  campus cannot be seen from inside the wild. The deep-wild pall sits on top.

## Stage 11 — second review: fog, Pat's Peak, lava, interiors, pilot doors

- Fog: the haze starts at 70 units and ends at 210 (Pat's Peak 110/290),
  coloured toward a bright sky tone, so the campus is no longer "overcast";
  the wilderness still closes to 16/62 and the pall sits on top. Pat's Peak
  gets no wilderness gloom, no pall and the clearest air (`HD.snowFactor`).
- Snow pines: `snowPine()` — tapering trunk with stub branches, six drooping
  needle skirts, a flat snow cap on every tier, a white spire. Pat's Peak's
  44 baked cone-pines hand their spots to the instanced pines (`HDX.pine`).
  Every forest variant is now two instanced meshes, bark and foliage, so no
  trunk wears the leaf texture.
- Lava: pools and rivers run in a basin carved by a gaussian over the lava
  tiles (0.7 deep, curved walls); the surface sits 0.32 below the bank, swells
  viscously in the vertex shader, and the crust is a height field lit by the
  sun with a glint on the melt; hotter streaks run with the current; every
  4.5–13.5 s a pool near the player erupts (flash sprite + a fountain of
  gobs). Colour is orange-red, yellow only in the hottest streaks.
- Interiors: the HD terrain chunks were direct scene children and showed
  through interiors; they live in `worldGroup` now like everything else.
- Pilot mode (`HD.pilot`): see LOGIC_TOUCHED 15.

## Stage 12 — lava is water

The owner's brief: lava should reuse the water's construction and physics,
coloured a thick deep red, with bubbles and spurts. So:

- `HD.lavaMaterial(flat)` is the pond shader: the same shore/depth
  attributes, swell (at a third of water's pace, larger), ripple normals,
  fresnel, sun glint, shore band and bank dissolve; coloured deep red with
  the melt glowing through the skin along drifting seams and in the troughs,
  and a dark scum of crust at the banks and in rafts. `uFlat=1` stands in for
  the attributes on the volcano's own flat tile meshes (guarded hook).
- The wilderness pools are built exactly like the ponds: a per-tile level
  (the bank's mean height less 0.28) gathered with a gaussian shore mask and
  a true depth to the carved bed, so the melt dissolves at the bank.
- hd-fx: bubbles swell on the surface for a second and burst into droplets;
  spurts and eruptions spawn on the melt's level (`HD.lavaLevelAt`).

## Stage 13 — the Emberdeep moat, cave rock, RS3 ground

| ![](shots/EMB4_0b.png) | ![](shots/GROUND_c.png) |
|---|---|
| the Landing: a raised island in a lava moat, the rickety bridge over it | campus ground: worn patches, hue drift, wildflowers |

- Emberdeep: every lava and pool corner of the cave mesh sinks (0.9, eased by
  how many of its four tiles are liquid), so the melt lies in a carved moat
  and the island stands proud; the melt itself is level at the cave floor
  base less 0.26, so it no longer climbs the walls with the wall rise. The
  combat-room pool and the Heart's lava sea and encroachment bands take the
  melt shader in flat mode; the cold pools take a flat-mode pond shader.
  Materials made during the game script get their textures on the first
  frame. Fog in the Emberdeep is a dark warm haze (18/75) instead of the
  orange wall at eleven units.
- A fifteenth detail layer, `rock`: cracked plates with soft shoulders and a
  grain, for the cave mesh (stamped `mid=14`) and every boulder (the material
  names its layer through `userData.hdMid`).
- Ground: the splat gains worn patches where the large noise runs low (turf
  thins to earth), a clump-scale hue drift in the grass albedo, a sun-bleached
  and a cool blue-green macro drift, a fine mottle, and a worn lighter crown
  on paths. Ground cover: one clump in nine is a wildflower tuft (white,
  yellow, lilac, pink), one in seven stands taller.

## Stage 14 — the Emberdeep rebuilt, cloth capes

- Emberdeep cave: rebuilt at three subdivisions per tile from the game's own
  uncarved corner heights, with a moat depth from a gaussian over the liquid
  tiles evaluated at every sub-vertex (curved shorelines, not four steps), a
  crag noise on the rising walls, corner colours read back from the game's
  mesh; the game's cave mesh hides in place. The chamber liquids are built
  like the ponds outside (shore/depth attributes over the banks) on the melt
  and pond shaders; the game's flat tile quads hide. The Gauntlet's fishing
  rings are kept above the melt. The delve's sconces carry living flames.
- Capes: every cape is a 7x9 verlet cloth pinned at the shoulders, tapered
  (shoulders 0.40, waist 0.33, hem 0.45), heavy-cloth damping, structural,
  shear and bend constraints, kept behind the torso, trailing the wearer;
  painted body with folds, trim border, yoke and hem band from the item's
  tint and trim; the game's emblem plane rides the middle. Ember and
  Forgemaster capes burn along the hem (five living flames); the aurora cape
  sheds frost. The game's flat panels and bespoke decor collapse; the game's
  visibility and recolouring still drive the cloth.

## Stage 15 — bodies and armour

| ![](shots/BODY_bare_f.png) | ![](shots/BODY_plate_f.png) |
|---|---|
| the lofted body: chest, waist, shoulders, nose and ears | the breastplate fitted to it, riveted |

- Bodies: the torso is a loft of elliptical cross-sections (hips, waist,
  ribcage, a chest fuller at the front, broad shoulders, neck) instead of a
  radially symmetric lathe; the hips cylinder becomes a rounded pelvis; the
  shoulder caps become deltoids; a nose and ears join the painted face. Legs,
  arms, mittens and shoes stay the sculpted lathes from stage 4.
- Armour: the breastplate and the mail shirt are shells lofted from the same
  cross-sections (grown 5% / 3% plus a gap), so they hug the body; the
  breastplate carries rivets along the collar and the waist in the trim
  colour, the mail takes the metal grain. Every rig is scanned every 1.5 s
  (gear is attached after the rig is built). Helm, legs, boots and gloves are
  the game's own, still to come.
- NPC builds vary by seed: torso width 0.93–1.09, overall scale ±2% and
  height ±3% (the player stays standard so fitted gear lines up).

## Stage 16 — skinned bodies, sculpted heads, hair on the skull

| ![](shots/S16_face.png) | ![](shots/S16_quarter.png) |
|---|---|
| the player's face: sculpted skull, lidded eyes, brows and lashes, a fringe cut on the skull | three-quarter view, the knit shirt on the shaped torso |
| ![](shots/S16_martha.png) | ![](shots/S16_martha_body.png) |
| Martha: the female head, blush and lips, long hair hanging to the shoulders | the female build in a skirt beside the Rector |

- `hd/hd-body.js` (new): every humanoid rig gets a skinned body. Six bones
  are parented to the rig's own groups (root, upper, arms, legs) so the
  game's walk, attack and turn animations drive the new mesh unchanged; a
  Skeleton with rest-pose inverses binds SkinnedMeshes in root space. The
  body is a set of shaped tubes: rings of elliptical cross-sections with
  per-angle bumps (pectorals, lats, abdomen, deltoid and biceps, quads and
  calves; a bust, waist and hips for women). Skin, shirt, trousers or skirt
  and shoes are separate tubes cut to the game's shirt and trouser styles
  (sleeveless, long sleeve, tunic, shorts, skirt, baggy), and re-cut when the
  game changes them. Painted skin, knit, twill and leather textures.
- The head is a sculpted tube from chin to crown: jaw and jaw angle, chin,
  cheekbones, eye sockets, brow ridge, a rounder cranium; softer and narrower
  on women. A nose tube from between the eyes to a winged tip, upper and
  lower lips, eyeballs with an iris disc and an upper and lower lid of skin
  with a lash line, ears with a hollow. The face texture is painted on the
  head's own height-mapped UVs: socket and lid shadow, brows in the hair
  colour, nostrils, the mouth line, cheeks, temples, the hairline, stubble on
  a third of the men.
- Hair grows on the skull: for every angle a strip runs from the hairline to
  the crown on the head's own surface, fluffed by noise; long styles hang
  below the hairline and flare. Styles map from the game's: short, bald,
  long, pony, bun, bob, spiky, mohawk. Painted strands with a sheen band.
  An NPC's long hair (the slab the game hangs behind the head) becomes the
  long style. The game's hair meshes are emptied; its hair rebuilds (a new
  style or colour in the wardrobe) rebuild the cap.
- The game's old parts (lathes, spheres, the sleeve and thigh cylinders, the
  skirt cylinder, the stage 15 lofts) get empty geometry, so whatever the
  game still does to them (recolouring, scaling for styles) shows nothing.
  NPC colours are read off those parts first.
- Still the game's: beards (the cone), NPC satchels and straps, glasses, hats
  and all worn armour. Next: armour, helmets, gloves, boots and weapons
  refitted to this body.

## Stage 17 — armour fitted to the body

| ![](shots/G3_plate_front.png) | ![](shots/G3_plate_helm.png) |
|---|---|
| rune plate: cuirass with the chest's relief, faulds, layered pauldrons, gorget, belt and rivets, cuisses, knee cops, greaves, arm plates and gauntlets | the full helm: a ridged shell on the skull, brow band, curved dark visor with its slits, a nasal, the plume |
| ![](shots/G3_hide_front.png) | ![](shots/G2_robe_front.png) |
| leather: jerkin over the hips, chaps, coif; the arms bare | the robe: gown, wide sleeves, cowl, trimmed skirt, the hat on the crown |

- `hd/hd-gear.js` (new): every piece of worn armour is rebuilt on the body's
  own cross-sections. The rings hd-body.js shapes the torso, arms, legs, feet
  and head from are sampled at the piece's heights and pushed out by the
  plate's thickness, so a breastplate carries the chest, a cuisse the thigh,
  a helm the skull. Pieces: breastplate, mail shirt (rings painted, short
  mail sleeves, gorget, hem), hide jerkin, robe top with cowl and robe skirt,
  platelegs, chaps, boots, arm plates with cuff and gauntlet, full helm,
  slayer helm, coif, wizard hat. Brushed steel, mail, leather and twill
  textures under the game's tint; steel takes the sky's reflection.
- The game's groups, meshes and per-frame visibility and tinting are
  untouched: each mesh keeps its identity and its tint/trim tag, only the
  geometry and material change; parts with no place in the design get empty
  geometry. Pieces are found by the shapes the game made, so the player,
  remote players and the worn-gear icons all dress alike; new gear groups are
  picked up as the game attaches them.
- The body's sleeves follow the armour shown: bare under a jerkin or a mail
  shirt, as the game draws them. The HD hair follows the game's hair
  visibility, so it hides under a helm or coif. The cape's white collar bar
  is gone (the painted yoke is the collar).
- Weapons in the hand: the sword's blade is a diamond-section blade tapering
  to its tip (flat-shaded bevels), with a swept crossguard, a wrapped grip and
  a pommel; the scimitar keeps its curved blade and takes the same furniture;
  axes get a bearded bit, picks a spindle head, mauls an octagonal head with
  two bands; the kite shield is bevelled with a domed boss. Wood, brushed
  steel and dark wrap under the game's tint.
- Still the game's: the bows, staves, whip, leaf and ember weapons, the
  ember/frost/luxury overlays, hats other than the wizard's, amulets.

## Stage 18 — creatures: the kit rebuilt

| ![](shots/M2_wolf.png) | ![](shots/M2_dragon.png) |
|---|---|
| the wolf: splined, fur-textured body, fangs | the Grounds Dragon in scales, its legs in the same hide |
| ![](shots/M2_skel_face.png) | ![](shots/M2_giant_face.png) |
| the skeleton archer's sculpted skull and jaw | the hill giant's sculpted head |

- `hd/hd-mobs.js` (new): the game's creature kit is rebuilt under the same
  names, so every one of the 50-odd kinds is upgraded at once. `critterSweep`
  runs a Catmull-Rom spline through its cross-sections (three rows per
  section), more sides, a hand-sculpted surface (noise along the body,
  stronger for fur), arc-length UVs, and a hide material chosen by the kind
  being built: fur, scales, skin, bone, chitin, ice, ghost. The countershade
  stays as vertex colours. `smesh` rebuilds coarse spheres, cones and
  cylinders finer (same parameters, so anything keyed on them still
  matches); `mesh` gives round parts smooth shading; `lam`/`lamD` hand
  creature parts their creature's hide in their own colour instead of the
  world's colour-classified layers (a grey skull is not stone, a gold leg is
  not wood). Small round parts (eyes, teeth) stay glossy and plain.
- Sculpted rebuilds after the build, inside the game's own animation groups
  so everything still walks, bites and draws: the wolf's head is one sculpted
  skull-and-muzzle with cupped ears, pupils and fangs, its legs muscled with
  rounded, toed paws, the scruff cones gone; the skeleton archer gets a
  sculpted skull, a shaped jaw with teeth, knobbed bones for every limb,
  vertebrae down the spine and toed feet; dragons a tapered jaw with teeth
  and upper fangs, muscled legs; giants a sculpted head, a rounded brow and
  muscled limbs.
- Creatures already standing when the layer loads are rebuilt in place: the
  old group leaves the scene, its pick proxies are dropped, `makeRat` runs
  again, and the new group takes the old visibility, position, rotation and
  scale (so superior and boss scaling survive).
- Next: sculpted skinned rebuilds for the priority creatures (wolf head and
  paws, skeleton limbs, giants' bodies, dragon heads), then the rest.

## Stage 19 — the face kit, eyes in their sockets

- `buildHead(parent, opts)` in `hd/hd-body.js` is now the one face kit: skull, brow ridge,
  nose, lips, eyes, ears, optional beard, built into a group at any scale. Humans use it at
  1.0; giants use it at 1.62 (hill giants and cyclopes bearded) in place of the game's ball,
  brow plank, eye balls and mouth slab, so a giant has a real face.
- The eyes no longer pop: the eyeball is smaller and set deep in a deeper socket, the upper
  and lower lids cover most of it, and only an almond shows with the iris; the lash line
  follows the lid's rim. The skull is squarer (flatter sides, wider crown), the jaw angle
  and cheekbone edge stronger, the brow ridge heavier on men.
- Wolves' and rats' eyes are slanted almonds with a pupil or a red glint instead of balls.
- Skeleton archer fix: the reshaped shin bone was being taken for a foot, giving two pairs of
  feet and no shins. The foot pass now skips reshaped limbs.
- Second pass on the eyes, after the owner saw two sets of eyes: the ball and its lid caps
  were both reading as round shapes. The eye is now one painted almond (sclera, iris, pupil,
  glint, a lash line heavy on top) recessed into the socket on the skull's own surface, with
  the lid crease and the shadow under the eye painted on the face. Nothing stands proud of the
  face, which is what reads as a face from any distance. Men lost the modelling cheekbones:
  flatter cheeks, a squarer jaw and chin, thinner plainer lips, cheek-plane shading.
- Third pass: the head is 12% narrower side to side with a softer jaw angle; one eyebrow
  stroke (the second shadow stroke and the painted nose bridge and nostrils are gone: they
  read as extra brows and nose holes under the real nose); the nose has a broader tip and
  two small dark nostrils under its wings. The Ember boots and gauntlets overlays are fitted
  to the foot and hand like the other boots, so they no longer draw a second boxy pair over
  the new boots.

## Stage 20 — more creatures, weapons held right

- Rats: shaped legs with a real paw of toes and dark claws instead of a pink ball; eyes as
  slanted almonds with a red glint. Goblins: a hooked nose in place of the cone, teeth, eyes
  as almonds, muscled limbs. Lesser and greater demons: a tapered jaw with a row of teeth,
  a brow ridge, burning slit eyes, muscled limbs.
- Weapons at rest: swords, scimitars and the leaf blades hang down and a little forward along
  the leg; mauls rest up over the shoulder. The game held them all straight back and level.
  The swing poses are untouched; the rest constants are switched under `HDX` only.

## Stage 21 — magic, teleports and endgame gear effects

- `hd/hd-magic.js` (new): a GPU mote system (seed and phase per particle; modes: spiral up,
  burst, orbit, embers, trail) with additive disc and glyph sprites, plus a light column
  shader. Teleports: a column of light rising from the caster, a ring spreading on the
  ground and a spiral of glyph motes climbing the column, at departure and arrival in the
  teleport's colour (hooked on the game's `teleBurst`, which fires at both ends). Spells: a
  glowing orb with a white core flies the projectile's path with a trail of motes and bursts
  on impact in the spell's colour (hooked on `spawnProjectile`). Staves: the orb wears a
  pulsing halo and a ring of orbiting motes in its own colour, on the player's and remote
  players' staves. Cindermaw: living flame on the maw and rising embers; Emberbrand: three
  flame tongues along the blade and embers; Ashfang: flame at the core.
- Delve torches: the flames are parented to their torch and follow the core's visibility,
  so a room's torches light up only when the game reveals that room.

## Stage 22 — hands, proportions

- Hands: a flat palm from the wrist, four fingers that hang and curl a little toward the
  body, and a thumb angled in, all skinned to the arm bone in place of the mitt. The mitt
  rings stay in the kit for the gauntlets, which cover the hand. Women's hands 12% smaller.
- Proportions: waist narrower, shoulders broader, upper arms thicker on men.

## Stage 23 — armour edging, bows, staves, whip, the other creatures

- Plate: engraved steel (faint bands and lines under the brushing), a trim lip along the
  faulds' hem, rims round the pauldrons, lips at the bottom of cuisse and greave, the full
  helm's face opening edged in trim with a crest along the crown.
- Bow: a shaped leather riser with horn nocks; staff: carved rings on the shaft and a pronged
  ferrule under the orb; whip: leather plaits.
- Every remaining creature with a head group (boar, minotaur, kurask, basilisk, gargoyle…):
  ball eyes become slanted almonds with a glow, limbs take the muscle shape. Rats get paws
  with toes and claws; goblins a hooked nose and teeth; demons a tapered jaw with a row of
  teeth and burning slit eyes.

## Stage 24 — RS3 inventory icons

- Inventory, bank and shop icons: for every item with a RuneScape counterpart the RS wiki's
  inventory icon (`hd/icons/<id>.png`, fetched once by `tools/fetch_icons.py`) is drawn in
  place of the hand-drawn sprite. Items with no counterpart (the school capes, house
  furniture, Emberdeep gear, quest items) keep their sprites. `HD.iconsRS3=false` turns it off.
  The icons are Jagex's, used as the wiki uses them; this is a private clone. Shipping them
  is the owner's call.
- The abyssal whip's beads are leather now (the beads stay: the RS3 whip is segmented too).
- Icons everywhere: `hd/icons/index.json` lists the ids that have an icon; all are preloaded at
  start, and when one arrives every open icon view (inventory, bank, equipment, exchange,
  shop, the wiki's item grid and detail) is redrawn once. The wiki's bestiary builds its
  models through `makeRat`/`makeHumanoid`, which the HD dressers wrap, so its 3D previews are
  the HD models (checked: the goblin's hooked nose in the viewer).

## Stage 25 — layered hair

- Hair is layered locks on a tight scalp: clumps of hair (flattened tapered strips) rooted on
  the skull, each flowing over the surface from its root and lifting away toward its tip so
  the rows read as layers: a crown whorl, a middle row, a lower row on the sides and nape, a
  fringe swept to one side, temples. Long and bob styles let the back and side locks leave the
  head and hang with a flare; pony and bun pull the locks back; spiky and mohawk are upward
  locks. Vertex colour darkens roots and lightens tips. About 3,200 triangles a head.
- Sex and skin tone ride in the cosmetic (`cosmetic.sex`, `cosmetic.skin`): `normCos` is
  wrapped to keep them through saves and the fashion shop, the fashion preview passes them to
  its model. Nothing in the game reads them; only the HD body does.

## Stage 26 — lobby, character creation, clothes under armour, wiki UI icons

- The title screen is a lobby: a vista of the grounds (`hd/lobby.jpg`, a capture of the game)
  behind, the logo above, one box holding the saved characters, "Create new character" and
  the save-code loader. `hd/hd-lobby.js`, styled in hd-ui.css.
- Creating a character opens a creator with a live model: name, body (male/female), skin tone,
  hair style and colour, top and legs, "Surprise me". The choices become player.cosmetic and
  the game's own steps run unchanged (newSlot, uid, save, enterGame). Sex and skin are HD-only
  fields on the cosmetic (see stage 25); when the game re-applies a cosmetic whose sex or skin
  differ from the built body (a loaded save, the creator) the rig's HD body is rebuilt in place.
- Clothes under armour: no shirt torso under any body armour (the jerkin no longer shows the
  knit through it), sleeves only where the arms are not bare, no trousers under leg armour, no
  shoes in boots — the player's equipment is mirrored the way the game hides its own meshes.
- UI icons from the RS wiki were fetched (`hd/ui/`, `tools/fetch_ui_icons.py`) and wired to
  the game's icon table, then the owner decided every icon stays OSRS-style: `HD.uiIconsRS3`
  and `HD.iconsRS3` are both false. The files and the loaders stay behind those flags.

## Stage 27 — the map

- `hd/hd-map.js` paints an HD map base at 8 px a tile the way RS3's map reads: a painted
  palette with per-tile variation, water and lava with a pale shore, roads with worn edges,
  woodland as shaded canopies with a shadow, rocks, fishing spots and fires as soft dots,
  buildings as light roofs with a ridge line, an outline and a drop shadow, a blur and a grain
  over all of it, THE WILDERNESS lettered down the waste.
- The world map's `drawImage(miniBase)` and the round minimap's blit are fed this base with
  smoothing on; the game's labels, feature icons, markers and dots draw on top unchanged. The
  minimap leaves the base out of its dynamic layer and draws the HD base underneath at full
  resolution. Interiors keep their own bases.
- Sizing: the world map canvas now gives way to the legend and the window
  (`max-width:calc(96vw - 270px)`, `max-height:calc(100vh - 150px)`), so the frame never
  overflows a laptop screen; `image-rendering` is auto so the HD base is not pixelated.

## Stage 28 — lobby vista, map names and search, more haircuts, leather fixed

- The lobby's backdrop is the grounds themselves: the game's own loop keeps rendering behind
  the title, the camera is overridden to a slow orbit (a turn in about 90 s) at a medium-high
  angle round Hargate, the renderer is sized to the window and each frame is copied onto a
  full-screen canvas behind the box; the player model is hidden, the day pinned to a sunny
  morning. Entering the game restores the camera, the renderer size and the day.
- The world map names the wilderness landmarks (Pat's Peak, Chaos Temple, Concord Asylum,
  Concord High School, Swenson Granite Quarry, Emberdeep Volcano, the Ditch) in the game's
  label style, and has a search box in its title bar: matches are ringed and named, the
  first one heavier. `HD.WILD_SITES` holds the wilderness entries.
- Haircuts: wavy (long with a wave in the hanging locks), braid (pulled back into a plaited
  rope with a tie), curly (short tight curls standing off the scalp), crop (a close cut).
  Women's short cut is longer and softer over the ears. The creator defaults a woman to long
  hair unless a cut was picked by hand. The game's COS_HAIRSTYLES list is extended so the
  fashion shop offers them too (a vanilla client would read them as 'short').
- Leather: the two loft pieces hd-chars had left under the rig (torso and pelvis) showed once
  the shirt went; they are emptied with the rest. The player's body armour is now read from
  the equipment each tick rather than from the gear scan, which lost its handles when the
  body was rebuilt.

## Stage 29 — knees and elbows; entrances on the map

- Joints: four more bones (knees under the leg bones at y -0.36, elbows under the arm bones at
  y -0.30). Shins, feet, forearms and hands are weighted to them. A knee flexes while its leg
  swings forward (from the derivative of the hip angle the game sets), an elbow keeps a slight
  bend that deepens as the arm rises. Anything hung on a hand (the tool rack, shields, NPC
  weapons) is moved into the elbow bone so it rides the forearm; the weapon dresser looks there.
- Gear follows the joints: every dressed arm or leg piece becomes a SkinnedMesh clone bound to
  the body's skeleton (geometry moved to root space at rest, weights by height either side of
  the joint). The original keeps its material — the game tints it — with an empty geometry; the
  clone mirrors its visibility each frame. A rebuilt body (sex or skin change) re-binds the
  clones and puts held things back before the old bones go.
- Map: entrances are a feature category of their own (Emberdeep, the Delve stair and gate,
  the Stronghold's cavern mouth, Matthes Cage, both chapels, the Rectory, the cottage, the
  party trapdoor) with a doorway icon on both maps, names on the world map, a legend row, and
  `player.mmf.entr` to toggle (defaults on).
- Repair: `beardGeometry` and `dressSatchel` had been swallowed by the stage-25 hair patch;
  hd-body aborted at its kit export and hd-gear never loaded. Restored from git; trap recorded
  in docs/29.

## Stage 30 — painted textures, torso life, map categories, pilot mode

- Textures painted, not just noised: steel with panel seams, bevelled edges, scratches and
  dents; leather with creases, stitching and scuffs; wood with grain and knots; cloth and
  knit with soft folds and a darker hem. Value only, so the game's tints still multiply.
- Torso life: breathing on every body; the player's torso twists into each swing, flinches on
  a hit, and looks slowly about when idle. Offsets on top of the game's pose each frame.
- Map: overworld bosses (a skull) and entrances (a doorway) are toggleable feature rows; the
  world map collects every label while the game draws, keeps multi-line names together,
  thins icon clusters, and places labels clear of each other and of icons. Party Room at
  Hargate's east door, a Grand Exchange label at its clerks.
- Pilot mode (HD.pilot, hd-pre): besides the open doors, every level the game derives from xp
  reads 99 and the purse is bottomless. Never ship it on.

## Stage 31 — the statue of St Paul

- Built after the real one outside the chapel: a full HD figure in long hair and beard, robes
  with a mantle thrown over the shoulders and falling in folds, the right hand raised open,
  the left gathering the robe at the chest, the face lifted; cast in dark bronze with a
  verdigris in the folds, every piece its own material on the metal layer so the game's
  costume tinting and the HD cloth detail leave it alone; on a two-tier chamfered granite
  pedestal with a moulded cap and a bronze plaque; facing north whatever the game turned the
  group to. The game's blocks are hidden, not removed.

## Stage 32 — the pilot's notes

- Breathing is a chest rise of a few millimetres, not a rock of the torso (which also left
  the capes behind). Master cape emblems face out along the cloth: the emblem's look-at
  target was in cloth space, not world space, so it stood edge-on.
- Blades rest pointing out and down the way a gripped sword hangs at the side (the game's
  HD rest angle is -0.55 rad; the elbow bend adds the rest).
- Hair: ponytail, bun and braid are combed back — streaks from the hairline all round sweep
  to the gather point at the nape over a fuller scalp — instead of the layered short cut with
  a tail stuck on.
- A tunic hangs outside the trousers on both builds (its torso rings sit proud of the hips).
- The wizard hat sits on the HD head (+0.012, not +0.05). NPC amulets are a small pendant on
  a cord on the chest, not an octahedron standing through it.
- The creator offers a build: slight, average or broad (a scale on the rig, carried as
  `cosmetic.size`, applied whenever the game applies the cosmetic).
- The world map zooms with the wheel round the cursor, up to 5×, and pans by dragging; a drag
  is not a teleport click; closing the map resets the zoom.

## Stage 33 — the pilot's second list

- The swing: the torso wound up and struck as an absolute offset from its rest yaw, never
  added to each frame (adding to rotation.y each frame was the 180° spin). Melee winds up
  away then strikes across with a small forward lean; ranged and magic get a slight turn.
- The party room came back whole: an over-broad cleanup was emptying every mesh hd-post had
  touched on a rig's parent group, and Callahan's parent is the party group, so the lever,
  the banners and he all went. The cleanup now targets only hd-chars' loft pieces (tagged
  hdHair) directly under a rig; the empty geometry carries a zero-length position so the
  game's own attribute reads never throw. Mrs Heitmiller's boa rides her shoulders.
- The quality button sits bottom-right of the view, out of the hover text's way.

## Stage 34 — ranged and magic in motion, the last pilot notes

- Elbows follow the weapon style: a sword arm bends more the higher it swings; a bow arm stays
  straight and the draw hand comes back to the cheek; a staff is held with a light bend.
  Checked against a lesser demon mid-draw and at release.
- Arrows fly in 3D: a shaft, head and fletching turned along the flight path with the game's
  arc; the game's 2D overlay arrow is off under HD (a guarded `!HDX`). Magic bolts unchanged.
- A shirt that is not a tunic is tucked in: it starts at the waist under the trousers, so no
  cloth shows at the hips on either build.
- hd-chars' mitten thumb hangs off the fist it built; the fist was emptied but the thumb
  stayed at the old fist position by the hip. The replaced parts' children are emptied with
  them, and each arm is swept for thumbs every frame.
- The lobby view ends and the player rig shows whenever the splash hides, by any path.
- Interior sweep: every interior group (chapel, party, Mathes, SOS, raid, volcano, house,
  rectory, St Paul's) has no emptied mesh outside a rig.
- Performance: skinned body meshes are frustum-culled with a padded sphere round the figure
  (they were never culled); beyond 22 m a figure drops the head's small parts and the hair
  locks, keeping the scalp. Checked at the exchange crowd: nothing culled wrongly.
- Trap: a `function` written into one closure of hd-magic and exported from another threw at
  load and silently disabled everything after it in that file (the staff halos). Keep each
  export beside its definition, and read the console after every hd-magic change.
- Layout check on a phone (375×812): the lobby stacks vista, logo and box; the creator runs
  as one scrolling column with the preview on top; in game the view, chat, minimap and orbs
  stack with nothing overflowing. The creator preview opens on the figure's face (the rig
  faces -z, so the turn starts at π-0.4).

## Stage 35 — load time (launch work)

Vanilla reaches the title screen in ~3.5 s on the dev Mac; the HD clone took 17–22 s. Now 4.8 s.
- `HD.defer(fn)` in hd-pre: a queue drained in ~10 ms slices (requestIdleCallback, setTimeout
  fallback) once the page is up. `HD.deferPending()` and `HD.deferFlush()` for tests.
- Textures: the two 512² detail arrays and the water-normal and cloud maps start flat (grey
  albedo, flat normal) so the world renders at once; the detail then comes from IndexedDB
  (`milville-hd` / `tex` / key `hdtex-v1-…`) if an earlier visit stored it, else each layer is
  synthesised in a deferred slice and the set is stored for next time. `HD.texReady` flips
  when done. First visit: ~6 s of synthesis behind the lobby; later visits: a read.
- Bodies (nearest the lobby view first) and creatures are dressed in deferred slices.
- The Emberdeep cave is rebuilt on the first `enterVolcano` (or at once if a save restores the
  player inside), not at load: 2 s saved for everyone who never descends that session.
- `performance.mark('hd:<file>[/section]')` at the top of every HD file and section: read
  `performance.getEntriesByType('mark')` to profile a load.
- Checked: world textured after the drain; cave built on descent; harness green.

## Stage 36 — phones (launch work)

- `HD.phone` (coarse pointer or a screen ≤760 px): starts on Low unless a choice is stored,
  pixel ratio capped at 1.25 (1.0 on Low), shadow map 1024 (2048 on High), draw distance
  52/150 instead of 70/210.
- The world map on a phone: the frame takes the width (94vw), the legend drops below; one
  finger pans, two fingers pinch round their midpoint; a drag or pinch is not a teleport tap.
- Checked in a 375×812 touch-emulated viewport: lobby, creator, in-game view/chat/minimap/
  inventory tabs, and the world map all fit; nothing overflows. Real iPhone GPU cost and
  Safari behaviour still need a device: this Mac has no Xcode, so no simulator.

## Stage 37 — sky, weather, seasons, the weakest creatures

- The day is 15 minutes. The sun now goes down to 5° and lingers there (elevation follows
  sin^1.7), so dawn and dusk last: gold on the horizon under the sun, orange then pink
  climbing, violet overhead and on the far side, a coloured sun disc with a wide glow.
  Shadows and lighting follow the sun all day (they already did).
- Clouds: big soft cumulus masses with cauliflower edges from a low-frequency base, lit by the
  sun with violet-shaded bellies at dusk, white at noon, plus a thin fast cirrus veil. Both
  drift with `HD.wind`, which veers slowly. A sunny day keeps a scatter of fair-weather
  cumulus, never an empty blue sheet.
- Weather: sunshine 4–8 minutes, overcast 1.5–3.5, rain 2–4 minutes then it clears; rain is
  never drawn indoors (unchanged).
- Seasons: every standalone tree and the forest take an autumn palette tree by tree (gold,
  orange, red, a yellow-green) on autumn-painted leaf textures; winter crowns are snow-white
  on a snow texture; flowers hide out of summer, grass tufts hide under snow. `HD.reseason()`
  runs after the game's `applyWinter`.
- The pollen motes were reading as daytime stars: they now stay low, near and faint by day;
  the dusk fireflies keep their glow.
- Creatures: the obsidian golem is faceted volcanic glass with its seams glowing between the
  shards; the icefiend a hovering cluster of ice crystals round a cold core; the ember mote a
  fire wisp with a flame plume; the basilisk heavier in the leg; the minotaur has a brow ridge
  and a brass nose ring.

## Stage 38 — windows, weapons in hand, the wraiths

- Three baked discs (the fanlight over a pedimented door, the oculus and its white surround on
  gables) were rotated `rx` then `ry`; a disc is symmetric about its own axis, so the facing
  turn did nothing and they stood perpendicular to every ±x wall. They are stood up before
  the facing turn now (a vanilla bug, fixed in the clone's game script).
- Pale blue-grey window panes (`0xbcd6e0` and kin) are classified as glass, not plaster.
  The glass shader keeps a dark pane under a restrained sky reflection, brighter toward the
  top of each pane, so no window reads as a white slab at a grazing angle.
- The sentinel's halberd stands upright at its side; bandits' drawn swords point forward and
  down instead of level. Every humanoid creature was checked on a hands sheet.
- Banshee, cinder wraith and ghost: a gaunt face in the hood, streaming hair, clawed hands at
  the sleeve ends, long uneven tatters, the shroud flattened front to back so it drapes; the
  wraith carries a flame at its core. The chimera's three heads are tapered snouts with a
  brow and a row of teeth.

## Stage 39 — the tutorial

- Audit: all 40 steps run start to finish. Every act step's event is fired by the game (the
  six open/close steps watch their popup's state instead of an event, by design). Finishing
  or skipping closes 'A Warm Welcome' and the Rector's next line is the Steady Hands opener,
  so the first quest is always available after a skip.
- The creator offers "Rector's tutorial" or "Skip the tutorial"; skipping is the same call the
  Rector's own Skip makes (`tutSkip`): bronze kit granted, quest closed, no panel.
- While the tutorial runs, a "Skip tutorial" button sits in the top-right corner of the view;
  it hides itself when the tutorial is done. A nav-only replay closes cleanly from it too.

## Stage 40 — the building pass (`hd/hd-buildings.js`)

Every bespoke model keeps its silhouette; this file only adds to it. It reads each
building's baked geometry (the bake carries a per-vertex surface id and colour) to find the
eaves, ridge, chimneys, panes and doors, then dresses by class (sacred, civic, dorm, house,
farm, utility, boathouse, observatory, ruin):
- gutters (half-round lead) along the eave sides, only over wall that reaches the eave, with
  downpipes and shoes at the ends; a ridge cap along the main ridge; chimney caps and clay
  pots (not on farm cupolas); the chapel's tower gets a lightning rod and a bell instead;
- a sill and a lintel on every wall pane (dormers and gable lights keep their own frames), in
  a stone tinted to the wall, never white on a coloured building; a rain streak under each
  sill; a warm glow on a third of the panes of dorms, houses and halls as the sun goes down;
- a stone threshold, panel relief and a brass knob on every door found;
- a damp line round the plinth; weeds and fallen leaves at the foot of the walls;
- ivy climbing two corners of the chapel, Coit, Hargate and the library;
- props by class: a bench (dorms, halls), a bike rack (dorms), firewood (houses, farms), a water
  butt under a downpipe (houses, farms), a coiled hose and oars (boathouse), a weather vane
  (observatory, barns).
Everything merges into five meshes for the whole map (detail, brass, decals, glow, ivy).
- Traps: eaves come from the wall top per side (the lowest tops carry the eave; gable ends rise
  higher), not from roof-point percentiles, which porches and dormers drag down. Walls are the
  footprint: colour-matching brick misses the darker courses. `b.base` is a foundation offset,
  not a height; the ground is `groundH`. Vertex colours are linear, so hex colours must be
  converted or every lead and stone reads a stop too light.
- Also this stage: the frame fits a laptop viewport (no page scroll on desktop), the title
  screen hides the old layout until the HD lobby is live, and a fresh character's face was
  verified to carry eyes and lips after creation.
- Cut after the owner's look: gutters, downpipes, water butts, chimney caps and pots (they read
  as clutter on these models). The chapels, the post office, the observatory and the ruin are
  unique shapes and get nothing at all. Every prop and weed sits on the terrain under it,
  not on the building's base; the barn's vane stands on the roof surface itself. A sweep sheet
  of all 51 buildings was checked for floating pieces.
- Trap (lava on the volcano's slopes lost its texture, the cave's kept it): `UniformsUtils.merge`
  clones every texture in the uniforms it is given, so a material made before the deferred
  texture paint holds its own copy of the water-normal and cloud textures. Painting the shared
  canvas and bumping `needsUpdate` on the original never reached the clones, and anything drawn
  before the paint kept the flat placeholder on the GPU. Materials now bind the shared texture
  objects after the merge, and the paint step (`HD.retexture`) bumps every material in the
  scene whose texture shares the painted canvas.

## Stage 40 — the classic world toggle

- The quality button cycles High, Medium, Low, then **Classic world**: the game's own
  vertex-colour terrain (`terra`, kept for the click raycast, now shown with a Lambert
  material), its water plane and its baked forest, and the buildings without the HD props;
  characters, creatures, gear, capes, sky, weather and effects stay HD. `HD.setWorld(mode)`
  toggles by mesh name (`hdTerrain`, `hdWater`, `hdLava`, `hdForest`, `hdGrass`, `hdBush`,
  `hdCover`, the four `hdBuilding*` meshes); a forest rebuild in classic re-applies it; the
  window glow and the water hide respect it. Persisted in `milville-hd-world`.
- Not switched (stays HD in classic): the Emberdeep cave rebuild, the bridge and lava-basin
  height edits, the dressed standalone trees (the game's tree meshes were replaced at load).
- Trap (small woods on the main map vanished, leaving dirt: by Sheldon's pond, by White Farm):
  the game swaps `tiles` to an interior's own grid while you are inside, and the HD forest
  rebuild (fired by `buildForest`/`applyWinter`, e.g. on a season change or on entering the
  game inside Emberdeep) read that grid and planted the surface forest from the wrong map;
  it stayed wrong until the next rebuild on the surface. `buildHDForest` now refuses to run
  while `curInterior()` is set or `tiles !== TILES_MAIN`, marks itself dirty, and a tick
  rebuilds as soon as the player is back on the surface. Diagnosis was by counting HD
  instances per 32-tile chunk against the tile grid: three chunks missing, seven short,
  all restored by one rebuild on the surface.
- The same trap hit the game's own forest mesh (`_treeMesh`), which is what the classic world
  shows: the HD wrapper of `buildForest` now also waits for the surface (`gameForestDirty`)
  and the tick rebuilds both. Pat's Peak's pines are HD-only (the game hands their spots to
  `HDX.pine` instead of baking cones), so the `snow` forest chunks stay visible in classic.

## Launch prep

- `HD.pilot=false`. The map-click teleport is gated on it too (it had only checked indoors).
- Service worker: `milville-v4`; the vendored Three.js files and every `hd/` script, the
  stylesheet and the icon manifest are precached (41 entries); `hd/` and `vendor/` scripts
  are served network-first with a 4 s timeout and the cache as fallback, so a deploy shows
  on the next load without a version bump. Registration is back to the live one-liner.
  The embedded pilot browser refuses to fetch worker scripts, so the worker itself was only
  syntax-checked here; a real browser hard-refresh is the test.
- Multiplayer appearance: the packet already carried sex, skin and build (`selfApp` under
  `HDX`); a remote rig now takes its build at construction, a packet change updates the rig's
  stored packet before the body rebuilds (it had rebuilt from the stale one and kept the old
  sex and skin), and the build size follows any packet change, not only your own rig.
- Trap (an armoured character slid instead of walking, on live): the limb armour clones
  bound to the skeleton shared the game's materials, which have no `skinning` flag, and Three
  r128 renders such a SkinnedMesh in its rest pose. The body underneath animated, the plate
  over it did not. Each clone now has its own material with `skinning=true`; the colour
  follows the source material each tick so tints still apply. The pilot character was
  unarmoured, which is why it was never seen.
- Casting and shooting from range now animate: the game's attack pose only ran for an adjacent
  target (a melee-era rule), so a spell from four tiles showed the bolt and no arm. Under HDX
  the pose condition reaches eight tiles for the ranged and magic styles.
- The staff flipped back over the shoulder during a cast: the game keeps a staff or a bow
  vertical by countering the arm's rotation each frame, but the elbow bone under the hand is
  HD's, and its bend (0.2 rad at rest, 0.6 at full raise) tilted the tool back. The elbow
  tick now counters its own bend on the tools tagged upright (staff, cindermaw staff, bows;
  a remote rig's staff by its orb), so the staff stays vertical and rises with the arm.
- The cast itself: the game swung the staff arm 143°, past vertical, so even a plumb staff
  stood behind the head at the peak. Under HDX the cast raises to just past vertical, slams
  the butt of the staff to the ground ahead and returns, over the same 480 ms; the staff stays
  perpendicular to the ground throughout.
- Trap (the Cindermaw staff spun like a wheel, even idle): the elbow counter was a per-frame
  subtraction, safe for the tools the game resets every frame (staff, bows) and a runaway for
  the one it never resets (the Cindermaw staff). The upright angle is now set absolutely each
  frame from the arm and the elbow.
- Stale layer after a deploy (the owner kept seeing the previous build): GitHub Pages sends
  `max-age=600` on `hd/*.js`, and the worker's network-first fetch honoured the browser's HTTP
  cache, so a plain reload could run a ten-minute-old script. The worker now fetches layer
  files with `cache: 'no-cache'` (a 304 when unchanged). `HD.build` is a per-deploy stamp,
  logged to the console and shown bottom-right of the lobby, so a browser can be checked.

## Stage 41 — map marker, popups, the Ember set, the luxury wares

- A destination marker: click the expanded world map to set it (a yellow flag on the map);
  the round minimap shows a yellow arrow at its rim pointing the way, or the flag itself when
  it is inside the circle; it clears when you arrive, when you click the flag again, or with
  the x at the minimap's corner. Persists in `milville-hd-marker`. Pilot mode's teleport
  click takes precedence when it is on.
- Popups (bank, exchange, wiki, shops…): the HD stylesheet had styled the full-screen modal
  containers with the panel gradient, so the world vanished behind them. Only the panels take
  the chrome now; the backdrop is a 28% dim.
- Plate reads as one metal: `steel` is now metalness 0.60 / roughness 0.30 beside `trim` at
  0.62 / 0.28 (the cuirass had read matte next to its gorget and rims).
- The Ember set (`hd/hd-lux.js`): every worn plate of the set becomes obsidian, black glass
  with lava cracks that pulse; flames lick the pauldron spikes and the helm's crest; embers
  rise from the shoulders, the heart and the knees; the heart core breathes.
- The luxury wares: the Crown of Wizardry gets a gold band, crystal spires, sparkling gems, an
  arcane halo and drifting motes; the Halcyon Grimoire leather boards, gold spine and clasp, a
  breathing rune ring; the Shield of the Mountain dark stone, a gold frame and snowy granite
  peaks; the boots and gloves of speed and haste polished metal with sparks when you run; the
  golden bodkins turn the dagger to gold with a glint.

