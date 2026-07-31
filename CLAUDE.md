# Milville

A single-file, OSRS-style 3D browser RPG set at St Paul's School. Sam is the solo developer; you are
the implementer. He is an OSRS expert, tests every change in the live game, and reports precise
symptoms — take his bug reports seriously and find root causes rather than patching what he described.

## The codebase

- **`index.html`** (~3.6 MB) — the entire game. All CSS, DOM and JS in one file. No build step, no
  modules, no bundler. Three.js **r128** from cdnjs is the only dependency.
- **`mp-server/`** — Cloudflare Worker relay (`server.js`, `market.js`, `world_state.js`,
  `leaderboard.js`). Deployed separately with `wrangler deploy`. Most changes are client-only.
- **`docs/`** — 27-doc handoff kit. The map of every system.
- **`harness/`** — offline Node test harnesses. Your only way to verify anything.

Deployed to GitHub Pages from `main`. **Pushing is deploying to live players.**

## You cannot see the game run

There is no browser and no CDN available to you. Three.js is not loaded, so nothing renders and no
visual claim can be verified. Verify logic and data with the harnesses; everything visual needs Sam.

End every summary by separating **what was verified offline** from **what needs his eyes**. Do not
describe an unrendered model as though you have seen it.

## The working loop

```bash
npm test                      # start green, or you cannot tell what you broke
git status                    # start clean
# ...edit...
node --check /tmp/M.js        # extract the <script> block and syntax-check it
npm test                      # behaviour
git diff --stat               # size of the change — read this every time
git commit -m "..."           # one commit per batch
```

**Never `git push` without being asked.** Sam pilots in the live game and decides when to ship. The
one exception: text-only changes — examine text, dialogue wording, chat lines, docs — may be pushed
directly, and say so plainly when you do.

After any push, remind him to hard-refresh with a bumped `?v=`. Stale cache is the most common cause
of "the update isn't there".

## Editing rules

- **Re-grep exact bytes immediately before anchoring an edit.** Offsets go stale between reads.
- Anchor on **unique** strings. If an anchor is not unique, widen it until it is.
- For scripted multi-edits keep the count-assert pattern and print the byte delta. A failed assert
  means the file was never written — and a later `node --check` will happily pass on the unchanged
  file. **The delta is the only proof an edit landed.**
- **`git diff --stat` after every edit.** A slice between two anchors can silently swallow everything
  between them. This has twice deleted neighbouring code, once 63 model branches and 45 KB, while the
  syntax check still passed. If the delta is not roughly what you expected, stop and diff.
- **Replace a code branch by brace-matching its own end**, never by finding the next `}else if(` and
  assuming it belongs to the same chain.
- **Do not write new blocks with Python raw strings.** Escapes survive verbatim into the source and
  render as literal backslash-u text in game.

## Never

- Rename the save keys: `aldervale-slots-v1`, `aldervale-save-*`, `ALDV0:` / `ALDV1:`. Frozen forever.
- Split the single file.
- Use `THREE.CapsuleGeometry` or `OrbitControls` — r142+, and this is r128.
- Put anything destructive or costly first in an `optionsAt` list. **The first option is what a left
  click runs.**
- Remove an item from `ITEMS` without a save migration. An orphaned id in an old save crashed the
  entire banking UI.

## Traps that have already cost a bug

- **Coordinates**: runtime = source + 112 (`WX=112`). Interiors are exempt. Read
  `docs/10_MAP_AND_WORLD.md` §1 before any map work.
- **Cylinders and tori are born upright.** A round face meant to hang on a wall — a dial, a mirror, a
  target, a shield — needs `rotation.x = PI/2`. In house code use `CD()`; `C()` only rolls on z.
- **Models are built facing +z.** Wall-mounted pieces need the room's facing rotation or they face
  into the plaster.
- **Item sprites go in `ITEM_ICON_PNG`; nav and skill icons in `UI_ICON_PNG`.** They draw in different
  coordinate spaces. Misfiling an item sprite strands the icon in the corner of its cell.
- **An interior in a walkable dead zone must start hidden**, not become hidden on first entry.
- **A panel flag must never outlive its world.** `bankOpen` surviving a world swap routed every
  inventory click to `depositSlot`.
- **Adding a skill means adding it to the `player.skills` object**, not just `SKILLS`. Missing it gives
  `undefined` xp and NaN wherever it is displayed.
- **The harness shim has limits**: it cannot persist `classList` or read back `.visible`, and its
  THREE stub makes `rotation` a function. When a check needs those, assert at source and say so in the
  test name. Several false alarms have come from testing the shim rather than the game.

## Where to look

Read the doc for the system you are touching **before** editing it.

| Working on | Read |
|---|---|
| anything, first time in a while | `docs/00_START_HERE.md` |
| the map, buildings, coordinates | `docs/10_MAP_AND_WORLD.md` section 1, `docs/18_BUILDINGS.md` |
| the house, Construction, butlers, the sawmill | `docs/23_CONSTRUCTION_AND_POH.md` |
| combat maths, prayers, spells | `docs/05_COMBAT.md`, `docs/21_PRAYER_AND_MAGIC.md` |
| items, icons, sprites | `docs/06_ITEMS.md`, `docs/11_3D_AND_RENDERING.md` |
| 3D models, geometry, orientation | `docs/11_3D_AND_RENDERING.md` |
| multiplayer, presence, rooms | `docs/16_MULTIPLAYER.md` |
| interiors and dead zones | `docs/17_INTERIORS.md` |
| banks, shops, the GE, panels | `docs/12_SYSTEMS_REFERENCE.md` |
| writing or fixing a harness | `docs/14_VALIDATION_HARNESSES.md` |
| quests, monsters, slayer | `docs/09_QUESTS.md`, `docs/07_MONSTERS.md`, `docs/08_SLAYER.md` |

`git log --oneline | head -20` shows what the last session did.

## Finish every batch by writing it down

Nothing carries between sessions except what is committed. Without being asked:

1. **Commit** with a message saying what changed and why.
2. **Append to `docs/13_CHANGELOG.md`** — one entry per shipped feature or notable fix.
3. **Record any root cause worth not rediscovering** in the relevant doc's traps section.
   `docs/23_CONSTRUCTION_AND_POH.md` section 9 is the model.
4. **Update a system's doc in the same commit as the code.** A doc that lies is worse than none.

## Design

Milville mirrors OSRS mechanics unless a deviation is documented. When adding features, make them
OSRS-plausible, and check the real OSRS numbers rather than assuming — that has repeatedly turned up
the opposite of what seemed obvious.

For balance work produce before/after figures and audit for exploits before shipping. Flag decisions
that are Sam's to make — pricing, gating, tradeoffs — rather than deciding silently.
