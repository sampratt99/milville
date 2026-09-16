# Milville HD

A clone of Milville with the renderer overhauled toward a RuneScape 3 look.
Gameplay is the original game, byte for byte in its logic; only how it is drawn
has changed. The original renderer is one query string away for comparison.

## Run it

The clone loads textures, shaders and Three.js modules from files next to
`index.html`, which browsers refuse to fetch from a `file://` URL, so serve the
folder with any static server:

```bash
cd ~/milville-hd && node tools/devserver.js 8787
```

(`python3 -m http.server 8787` works too, but it lets the browser cache `hd/*.js`
between edits; the node server sends `Cache-Control: no-store`.)

then open <http://localhost:8787/>. No backend, no internet: Three.js r128 and
its example modules are vendored under `vendor/three/`, and every texture is
synthesised at load (about one second, once per page load).

- **Two graphics modes**, remembered as `localStorage['milville-hd-mode']`:
  **Old School** (`off`) returns from the top of `hd-pre.js` before THREE is
  touched, so the game is byte-for-byte its pre-HD self: own materials, lobby,
  sky, trees, blob shadows; every other `hd-*.js` sees no `HD.preReady` and
  returns. **HD** (`hd`) is the layer. A phone starts Old School, a desktop HD;
  a browser without WebGL2 is Old School regardless (the HD shaders need
  `sampler2DArray`). `?hd=on` / `?hd=off` set the mode. Switching saves the
  game and reloads.
- **Crash marker**: `milville-hd-boot` is written when the HD layer starts and
  cleared after thirty seconds in the world or a normal page close. A load that
  finds it set knows the last HD session died (tab killed for memory, a hang)
  and comes back Old School with a notice. A lost WebGL context shows a notice
  offering the Old School reload; three HD hook exceptions inside two seconds
  switch the hooks off for the session and offer the same.
- The **Graphics** button (bottom-right of the view, and under the character
  list in the lobby) opens the panel: Mode, Preset (Low / Medium / High),
  Draw distance (the camera's far plane: 150 / 300 / 520 units, fog to match),
  Shadows (off / 1K / 2K / 4K), Resolution (75-150%), Ambient occlusion, Bloom,
  Reflections (planar water + the glass cube map), Ground cover (grass, bushes,
  clutter), Auto-adjust. Settings are JSON in `milville-hd-gfx`; a preset sets
  every field, a hand change makes it Custom. Auto-adjust steps the preset down
  after two 240-frame windows over 30 ms, then shortens the draw distance and
  drops the cover, then offers Old School. A phone is capped at 125% and a 2K map.
- The sun crosses the sky over 15 minutes; `HD.day.t` (0 dawn .. 1 dusk) and
  `HD.day.paused` are exposed on the console for screenshots.
- Your real character: saves live in the browser's storage per origin, so the
  live game's character is not visible on localhost. Use **Save code** in the
  live game and **Load from save code** on the clone's title screen. The save
  keys and format are untouched, so the code loads as-is.

Multiplayer, the market, the leaderboard and the house directory all point at
the live Worker and fail closed if it is unreachable; the clone never deploys
anything and does not touch `mp-server/`.

## What changed, in one paragraph

Two scripts wrap the untouched game script. `hd/hd-pre.js` runs before it and
swaps the Three.js classes the game constructs: every Lambert/Phong material
becomes a physically based material with a triplanar surface-detail shader
(brick, stone, slate, wood, foliage, plaster, glass, cloth, skin, metal, chosen
from the colour the game asked for or from a per-vertex id the bake pipeline
records), cylinders/cones/spheres get enough segments to read as round, and
painted canvases decode as sRGB. `hd/hd-post.js` runs after the game and sets
up the physical sky and its environment map, the sun as a shadow caster,
terrain and water shaders, clouds, atmospheric fog, and the post chain (near-
only half-resolution SSAO, bloom, a filmic grade). `hd/hd-foliage.js` replaces
the icosahedron tree canopies and the five-sided forest cones with leaf-card
trees, instanced forest chunks and wind-blown grass. See `VISUAL_CHANGELOG.md`
for the stages with before/after captures, `LOGIC_TOUCHED.md` for every line of
the game file that changed, and `docs/29_HD_RENDERING.md` for how the layer is
built and its traps.

## Performance

On the development Mac at 1173 x 802 canvas pixels, frame time by tier:

| tier | ms/frame | what it adds |
|---|---|---|
| High | 22 | ambient occlusion, 4K shadows, half-size water reflection every other frame, bloom |
| Medium | 16 | 2K shadows, reflection, bloom |
| Low | 11 | direct render, shadows, no reflection |

The auto-tier drops one step when the first seconds cannot hold ~45 fps.

## Verify

```bash
npm test          # the 52 offline harnesses, unchanged, still 1802/1802
npm run check     # index.html parses
```
