# Every non-visual line changed in `index.html`

The brief froze gameplay. This is the complete list of edits to the game file,
so the owner can judge that it is still the same game. Everything else lives in
`hd/*.js`, `vendor/`, `tools/` and `docs-hd/`.

| # | Where | Change | Why | Gameplay effect |
|---|---|---|---|---|
| 1 | `<head>`, service worker block | `navigator.serviceWorker.register('sw.js')` replaced by an unregister of any worker a previous visit installed, plus a cache purge | The worker cache-firsts same-origin scripts; with the renderer in flux every edit to `hd/*.js` would be served stale | None. Offline/PWA install is off in the clone |
| 2 | Three.js `<script>` tag | CDN `three.min.js` replaced by `vendor/three/three.min.js` plus 14 vendored r128 example modules and `hd/hd-pre.js` | Offline, and the material/geometry class swaps must be in place before the game script runs | None |
| 3 | first line after `'use strict'` | `const HDX=(window.HD&&window.HD.preReady)?window.HD:null;` | One guarded handle; `null` in the offline harness and in any browser where the layer did not load | None |
| 4 | `bake()` | after the colour push: `if(HDX){... out.mid.push(classify(hex)) ...}` | Records a per-vertex surface id so brick, slate, wood etc. get the right detail texture | None; `out.mid` is a new array the game never reads |
| 5 | `bakeMesh()` | sets a `mid` attribute when present; `if(HDX)m.receiveShadow=true;` | Feeds #4 to the shader; baked world receives shadows | None |
| 6 | `buildTerrain()` | `terra` material is `HDX?HDX.terrainMaterial():<original>` | Splat-mapped terrain shader | None |
| 7 | `render(now)` | `renderer.render(scene,camera)` becomes `HDX&&HDX.ready?HDX.render():<original>` | Post-processing chain | None |
| 8 | `fit()` | `if(HDX&&HDX.ready)HDX.resize(w,h);` after the camera update | Composer render targets follow the view size | None |
| 9 | `render(now)`, after the fog block | `if(HDX&&HDX.ready)HDX.frame(now,pwx,pwy,pwz,camDist,curInterior());` | Per-frame sky/fog/water/wind/shadow-caster updates | None |
| 10 | `buildDetail()` | `if(HDX)dm.visible=false;` after the clutter bake | The flat blade/petal/pebble clutter reads as litter on textured ground | None; the mesh is decoration |
| 11 | building bake loop (`for(const b of BUILDINGS)` in the world bake) | the shared HD architectural kit is defined after `P()`; the generic hall branch and the bespoke style branches are rewritten with more primitives | RS3-level building detail | None: bakes are decoration. Footprints, `bgrid`, `b.base`, `b.hgt`, door tiles, proxies and `addProxy` calls are unchanged |
| 12 | end of file | `hd/hd-post.js`, `hd/hd-terrain.js`, `hd/hd-foliage.js`, `hd/hd-chars.js`, `hd/hd-props.js` after the game script | They need the game's globals in scope | None |

Five game functions are **wrapped, not edited**: `buildObjModel(o)` (trees
re-dressed, dodecahedra swapped for boulders), `buildForest()` (baked cones
hidden, instanced forest rebuilt), `recolorTerrain()` (the HD terrain chunks
recoloured under the same season flags), `makeHumanoid(c)` and `buildHair()`
(rig geometry and faces). Every wrapper runs the original first and returns
exactly what it returned.

Things deliberately **not** changed: `optionsAt` lists and their order, every
proxy and pick mesh (the click chain is untouched, including the house pick
floor), tile data, coordinates, save keys, `ITEMS`, NPC/mob/object tables,
the UI, the minimap and the 2D overlay.

Verification: `npm test` runs the same 52 harnesses (1802 assertions) green.
The harness extracts the inline game script only, so it exercises the game
with `HDX === null`, which is also the path a browser without WebGL2 takes.
| 13 | `buildFences`, the wilderness ruins, `pine()` on Pat's Peak, the volcano lava material | `HDX.fencePost/fenceRail/ruinBlock` substitute geometry; `HDX.pine` takes the pine spots; `HDX.lavaMaterial()` replaces the Phong lava | Designed fence parts, worn ashlar, instanced snow pines, the shared lava shader | None: same positions, same colours, same proxies |
| 14 | `buildDetail()` | hook 10 replaced: the clutter bake calls are skipped under `HDX` (`if(!HDX)bake(...)`), the mesh is no longer hidden | Hiding the mesh also hid the asylum, high school and Pat's Peak that share it | None |
| 15 | **PILOT MODE** — `EMBER_DEV_BYPASS`, the `entersos` seal, the Rectory `Enter` option | `HDX.pilot` (set true in `hd-pre.js`) opens every Emberdeep gate, the stronghold seal and the Rectory door | So the owner can walk every interior while reviewing | **Gameplay-affecting, clone only.** Set `HD.pilot=false` in `hd-pre.js` before anything else is done with this code |
| 16 | `makeHumanoid`, `applyShirtStyle`, `applyPantsStyle`, `_cosFresh`, `buildHair` | wrapped in `hd-body.js`: each runs unchanged, then the skinned body or hair is (re)built; return values untouched | The RS3 body, head and hair replace the game's lathes | None: the game's rig groups, animation, cos tags and recolouring all still drive the new mesh |
| 17 | none | `hd-gear.js` only rebuilds geometry and materials on the game's own gear meshes, found by shape on a 0.6 s tick; `HD.gearOwnsArmour` retires the stage-15 shells in `hd-chars.js` | Armour fitted to the skinned body | None |

| 18 | `critterSweep`, `smesh`, `mesh`, `lam`, `lamD`, `makeRat` | reassigned in `hd-mobs.js`: same signatures and return types; `makeRat` wrapped to know the kind; existing mobs rebuilt once at load (old group out of the scene, its `proxies` entries dropped, `makeRat(r)` again, visibility/position/scale copied) | The RS3 creature kit | None: `r._m` is refreshed by the same builder; the pick proxies are re-added by it |
| 19 | the player rig's rest rotation for sword, scim, leaf blades and maul (`_swRest?-1.5:...`) | `HDX?0.35:-1.5` (blades) and `HDX?-2.4:-1.5` (maul): rest pose only, swings unchanged | Weapons held down along the leg / over the shoulder like RS3 | None: pose constants, harness path unchanged |
| 20 | `teleBurst`, `spawnProjectile` | wrapped in `hd-magic.js`: each runs unchanged, then a 3D effect is added | Teleport columns, spell bolts | None |
| 24 | hd-icons.js | `drawItemIcon` wrapped a second way: draws `hd/icons/<id>.png` when it exists, the sprite otherwise. Falls through to the game's drawer for potion doses. No item logic touched. |
| 26 | hd-lobby.js | `startNew` replaced (the game's button listener removed, the Enter key resolves the new one): opens the creator instead of creating at once. "Begin" runs the same steps as the original in the same order with `player.cosmetic` set between `newSlot` and `saveGame`. `normCos` wrapped to keep `sex`/`skin`. Nothing about a new character's items, stats or position changes. |
| 26 | hd-body.js | `applyCosmetic` wrapped: after the game's, rebuilds the HD body when sex/skin differ. `renderEquip` wrapped to hide trousers/shoes under leg/foot armour. Read-only on game state. |
| 26 | hd-icons.js | `_uiImg[key]` entries replaced with wiki images once loaded; `drawUiIcon` is the game's, unchanged. |
| 27 | hd-map.js | The 2D contexts of `#wmapc`, `miniDyn` and `#minimap` get a wrapped `drawImage` that substitutes the HD base for `miniBase`. Map coordinates, click-to-walk and the pilot teleport are unchanged (same canvas, same pixel scale). |
| 29 | hd-map.js | `MM_CATS`/`MM_GLYPH` extended with 'entr'; `buildIconPts` and `mmIcon` wrapped; `player.mmf.entr` defaulted to 1 when absent (a new key in the saved mmf map; vanilla ignores it). |
| 29 | hd-body.js | The game's `tool` group and other hand-held objects are re-parented into the elbow bone (positions adjusted by the elbow offset). The game keeps its references; nothing reads their parent. |
| 30 | hd-post.js | PILOT ONLY: `levelFor`, `coinCount`, `spendCoins` wrapped when `HD.pilot`. Off with the flag. |
| 30 | hd-map.js | `mmIcon`, `buildIconPts`, `MM_CATS`, `MM_GLYPH` extended for 'boss'; the world-map context's text calls are collected and re-placed. `player.mmf.boss` defaulted to 1 when absent. `ICON_PTS` reset to null once at load so the list rebuilds with the new categories. |
| 32 | index.html | The four HD weapon rest angles (`HDX?0.35:-1.5`) are now `HDX?-0.55:-1.5`; the vanilla branch is untouched. |
| 32 | hd-body.js | `normCos` keeps `size`; `applyCosmetic` on the player rig also applies the size scale. |
| 34 | index.html | The overlay projectile drawer skips arrows under `HDX` (`pr.kind==='arrow'&&!HDX`; the magic branch is `else if(pr.kind!=='arrow')`). Vanilla draws as before. |
| 35 | index.html | Multiplayer `selfApp()` carries `sex`, `skin` and `size` under `HDX` (vanilla payload unchanged); `_isDefaultApp` treats a non-default build as a real look so peers do not get a random shirt instead. The relay passes `app` through untouched. |
| 38 | index.html | Three `bake()` calls for round window discs pre-rotate the geometry (`.rotateX(Math.PI/2)`) and pass only `ry`; previously `ry,1,Math.PI/2,0` left the disc perpendicular on ±x walls. Pure visual fix, no gameplay path. |
| launch | index.html | The service-worker registration is the live one-liner again (the clone had unregistered workers during development). |

