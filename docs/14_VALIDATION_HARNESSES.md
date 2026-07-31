# 14 — Validation Harnesses (offline testing)

Harnesses live in **`harness/`** and are committed. They are no longer regenerated each session.

```bash
npm test                    # every harness (= harness/run-all.sh)
harness/run-all.sh mp       # only harnesses whose name matches "mp"
node harness/shiptest.mjs   # one, with its full check list
npm run check               # just: does index.html still parse?
```

`harness/_lib.mjs` holds the shared runner (`runPass`, `Suite`, `PRELUDE`, `SRC`); files starting
with `_` are library, not tests, and `run-all.sh` skips them. `harness/shim.txt` is the browser
stand-in, described below. Two patterns:

## Pattern A — extraction (old style, still fine for pure functions)
Brace-match a function out of M.js, stub its deps, assert behavior.

## Pattern B — module-scope injection (the workhorse; USE THIS)

The game is one giant module scope; most state (`ITEMS`, `MOB_KINDS`, `prayers`,
`PRAYER_META`, `SPELLS`, `player`, helpers) is module-internal. `runPass()` appends an IIFE to the
code string so your test runs INSIDE that scope:

```js
// harness/mytest.mjs
import {runPass, Suite, PRELUDE, SRC} from './_lib.mjs';

const T = runPass(PRELUDE + String.raw`
  o.maxPray = maxPray();                     // read module functions/state directly
  prayers.halcyon = true; o.mult = prayerMult('atk');
  clearInv(); give('coins', 5000);           // PRELUDE helpers
  return o;
`);

const S = new Suite('mytest').guard(T);
S.eq('prayer boosts attack', T.mult, 1.15);
S.ok('the drain table is wired', SRC.includes('PRAYER_META'));   // source check: OUT here
S.report('what is now proven', 'what still needs a browser');
```

`PRELUDE` gives the pass an `o` to fill, a `msg()` recorder (`said(/…/)`, `since()`), and
`setLevel` / `clearInv` / `give` / `freeSlots` / `freshHouse`.

Rules of the pattern:
- The injected IIFE can touch anything in module scope; it CANNOT reference harness
  variables — do source-string checks against the exported `SRC` OUTSIDE.
- `runPass` re-extracts from `index.html` on every run. Never cache M.js across an edit.
- A throw inside the pass comes back as `T.__threw`; `Suite.guard(T)` turns that into a failed
  check rather than a stack trace.
- The shim's canvas 2D context supports the icon drawers — loop every icon id and assert no
  throw, and check `ctx.__depth` returns to 0 (that is what `iconaudit` does).
- Balance work ships with **before/after matrices** (DPS parity, drain/regen tables, defence
  profiles per armour family) — house style.
- **A harness that cannot go red is worth nothing.** Sabotage a scratch copy of `index.html`,
  confirm the matching assertion fails, then throw the copy away. Every harness in `harness/`
  has been through this.

## What harnesses can/can't prove
CAN: logic, data tables, formulas, icon/model construction, UI render functions executing,
message-handler wiring (source checks). CAN'T: WebGL appearance, CSS layout, feel, real
multiplayer (2+ browsers), group-boss dynamics (3–4 players). Say so in the summary.

## The Construction suite (~40 harnesses)

`slottest` (placement rules) · `contest` · `sawtest` · `poh15` · `furntest` · `roomtest` · `funcfurn` ·
`bmodetest` · `walktest` · `housepanel` · `wintest` · `floortest` · `containtest` · `roomstest` ·
`visittest` · `housetest` · `butlertest` · `butlerwalk` · `xptest` · `pricetest` · `shiptest` ·
`mphouse` · `spawntest` · `repairflow` · `doortest` · `focustest` · `upgradetest` · `discs` ·
`iconaudit` · `orphantest` · `banktest` · `lobbyvis` · `conunlock` · `skillfix` · `roomui` ·
`sawicon` · `deedtest` · `fivefix` · `newfunc` · `darylitest`

Three are worth running after almost any change:
- **`shiptest`** — walks the whole Construction chain in one pass, saw to butler.
- **`mphouse`** — the seven-case multiplayer visibility matrix.
- **`iconaudit`** — draws every item icon five times and asserts the canvas stack returns to zero.

## What the shim can and cannot do

`harness/shim.txt` replaced the old Proxy-based stub. **Three limits described in earlier versions of
this doc no longer apply** — do not write the old workarounds:

- **`rotation` is a real `Euler`** with readable `.x/.y/.z` and a working `.set()`. Limb angles,
  `rotation.x = π/2` disc checks and facing maths can all be asserted in-process. It is no longer a
  function.
- **`.visible` reads back**, on any `Object3D`. Mesh visibility — hidden interiors, the two cottage
  exterior states, build-mode ghosts — is directly assertable.
- **`classList` persists**, backed by a real Set, and elements are cached per id, so a listener
  attached at load is still there later and `el.__fire('click')` will reach it.

The scene graph is real: `add`/`remove`/`traverse`/`children`/`position`/`scale`/`userData` all
behave. Geometries carry their constructor `parameters` plus a small but structurally valid vertex
buffer (enough for `bake()` to merge them).

What is still genuinely out of reach, and must be said in the summary rather than papered over:

- **No WebGL.** Nothing is rasterised. Appearance, shading, z-fighting and scale-in-the-eye are
  unprovable offline. `Raycaster.intersectObjects` returns `[]` by design — there is no geometry to
  hit — so hover and click cannot be simulated. **Call `optionsAt()` (or the panel's own option
  builder) directly and assert on option ORDER instead**: left-click runs the first option, and that
  ordering has caused real bugs.
- **No layout.** `getBoundingClientRect` is a fixed 800×600; CSS is never parsed. Panel positioning,
  overflow and z-order need a browser.
- **No HTML parsing.** `innerHTML` is stored verbatim, never turned into nodes, so
  `querySelectorAll` returns empty and `querySelector` hands back a stable stub. Assert on the
  `innerHTML` string, not on the elements it would have produced.
- **Nothing fires on its own.** `requestAnimationFrame` is a no-op (the file ends with a top-level
  `requestAnimationFrame(render)`) and `setTimeout` only records. Flush deferred work deliberately
  with `__shim.flushTimers()` — that is how `shiptest` lands the butler's trip without waiting 14s.
- **No real multiplayer.** `mphouse` proves the room-keying and visibility *logic* through
  `MP._test`; whether two browsers actually see each other is a live test, always.

Several false alarms in the Construction arc came from testing the shim rather than the game. The
fix is the same as it ever was: if a check would pass with the game's logic deleted, it is not a
check.
