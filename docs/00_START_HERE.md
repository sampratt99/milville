# Milville — Handoff Kit (START HERE)

This folder is a complete, zero-context briefing for continuing development on
**Milville — Old School Adventure**, a single-file browser RPG. A new AI chat (or human
collaborator) can read these docs and pick up exactly where the previous session left off.

**Docs last overhauled: July 2026** (post: wilderness expansion, Emberdeep endgame, OSRS
combat rework, full prayer book, luxury shop, Matthes Cage PvP, in-game Wiki).
**Construction + the player-owned house added July 2026 — see `23_CONSTRUCTION_AND_POH.md`.**

## What Milville is, in one paragraph

Milville is a fully-playable, OSRS-style (Old School RuneScape) 3D browser RPG built as **one
self-contained `milville.html` file (~2 MB)**. Three.js r128, entirely client-side. It has
**16 skills, ~400 items, 54 monster kinds, 21 quests**, full melee/ranged/magic combat with
OSRS-exact accuracy math, a complete OSRS-style prayer book (26 prayers), a spellbook with
elemental spells + alchemy, Slayer, Construction with a fully buildable player-owned house,
a Grand Exchange, clue scrolls, a bank, multi-slot saves,
an in-game Wiki, and an optional multiplayer layer (relay-server presence, groups, group
combat, trading, and PvP duels). The world is a thinly-fictionalized **St. Paul's School**
(Concord, NH) with ~51 named campus buildings, plus a huge western **Wilderness**, the
**Stronghold of Security** dungeon, and the volcanic **Emberdeep** endgame zone with the
First Rector group boss. Deployed as `index.html` on GitHub Pages; developed solo.

## How to read this kit

| File | What it covers |
|---|---|
| `00_START_HERE.md` | This file — orientation + the rules that matter most |
| `01_GAME_OVERVIEW.md` | Theme, zones, gameplay loop, design philosophy |
| `02_ARCHITECTURE.md` | Single-file structure, stack, save system, load order |
| `03_DEV_WORKFLOW.md` | **CRITICAL.** How edits are made, validated; the gotchas |
| `04_SKILLS_AND_XP.md` | The 15 skills, XP curve, gathering, agility |
| `05_COMBAT.md` | **The OSRS combat engine** — rolls, styles, triangle, prayers, spec |
| `06_ITEMS.md` | Item catalog architecture, gear families, currencies |
| `07_MONSTERS.md` | The 54-mob bestiary, mob defence math, drops |
| `08_SLAYER.md` | Slayer master, contracts, helms |
| `09_QUESTS.md` | All 21 quests; the m1–m5 main line; Emberdeep quest trio |
| `10_MAP_AND_WORLD.md` | **The coordinate system (READ before map work)**, regions, teleports |
| `11_3D_AND_RENDERING.md` | Three.js helpers, baking, models, icons |
| `12_SYSTEMS_REFERENCE.md` | GE, bank, clues, run energy, save slots, Wiki |
| `13_CHANGELOG.md` | High-level history of shipped arcs |
| `14_VALIDATION_HARNESSES.md` | The offline test system (incl. the module-scope shim) |
| `15_CONTROLS_LOOP_AND_UI.md` | Input, the game loop, panels |
| `16_MULTIPLAYER.md` | Relay server, wire protocol, groups, duels, boss ownership |
| `17_INTERIORS.md` | The dead-zone overlay pattern for interiors |
| `18_BUILDINGS.md` | **How campus buildings are built** (the next session's focus) |
| `19_EMBERDEEP.md` | The volcano endgame: floors, quests, the First Rector boss |
| `20_PVP_MATTHES_CAGE.md` | The PvP arena, duel system, cage tokens |
| `21_PRAYER_AND_MAGIC.md` | The 26-prayer book + drain math; spellbook, runes, alchemy |
| `22_LUXURY_SHOP.md` | Hirschfeld's luxury shop, examine popups, the 18 luxury items |
| `23_CONSTRUCTION_AND_POH.md` | **The 16th skill + the player-owned house** — rooms, hotspots, butlers, the sawmill, the economy, MP isolation |
| `templates/` | Copy-paste harness + edit-script templates |

## The six rules that matter most

1. **It is ONE file.** Everything lives in `milville.html`. No build step, no modules. The
   only external dependency is Three.js r128 from cdnjs (the `<script>` tag carries
   `crossorigin="anonymous"` — keep it; it unmasks real error messages instead of
   "Script error"). Optional multiplayer relay is separate infra (`mp-server/`).

2. **You cannot see it run.** No browser, no CDN access in the sandbox. Verify *logic and
   data* with offline Node harnesses (`14_VALIDATION_HARNESSES.md`). Visual changes need the
   user's eyes; always say so and remind them to hard-refresh with a fresh `?v=`.

3. **Edit with anchored string replacement + a trailing success print.** A failed assert
   leaves the file untouched while a chained syntax check still passes — the ONLY reliable
   "it applied" signal is the final `print("applied; delta: N")`. See `03_DEV_WORKFLOW.md`.

4. **Re-read exact bytes before every edit.** Offsets go stale; some strings store literal
   escape text (`\u2014`, `\u2019`) — the bytes are backslash-u-hex, not the character.

5. **Know the coordinate system before touching the map.** The world was expanded west:
   original source arrays use pre-shift coords and get **+112 added at load**. Runtime
   campus = x112–303; deep wilderness = x0–111. Full rules in `10_MAP_AND_WORLD.md` §1.
   Getting this wrong puts your new building in the middle of the wilderness.

6. **Never rename the save keys.** `'aldervale-slots-v1'` / `'aldervale-save-*'` and save-code
   prefixes `ALDV0:`/`ALDV1:` are frozen (the game was renamed Aldervale→Milville; keys were
   deliberately kept so existing characters work). The file is never called "Aldervale"
   user-facing.

## Working conventions (the user expects these)

- **Backup per batch**: `cp milville.html milville.html.bak.<name>` before edits.
- **journal.txt** in outputs logs every shipped batch; a compaction-proof plan doc
  (e.g. `combat-osrs-plan.md`) tracks any multi-stage effort. Keep both current.
- Verify headlessly, present the file (`present_files`) each batch, summarize honestly —
  including what could NOT be verified offline (visuals, multiplayer feel).
- Multiplayer live-testing needs 2+ browsers; group-boss behavior needs 3–4. Flag it.

## First steps in a brand-new chat

1. Uploaded files land in **`/mnt/user-data/uploads/`**. Copy the game to outputs:
   `cp /mnt/user-data/uploads/milville.html /mnt/user-data/outputs/milville.html`
   (If the user uploads a newer html than this kit's snapshot, **theirs is ground truth**.)
2. Confirm it parses:
   `sed -n '/^<script>$/,/^<\/script>$/p' milville.html | sed '1d;$d' > /home/claude/M.js && node --check /home/claude/M.js`
3. Skim `03_DEV_WORKFLOW.md` + `14_VALIDATION_HARNESSES.md` before any edit.
4. For map/building work, read `10_MAP_AND_WORLD.md` §1 and `18_BUILDINGS.md` first.
5. Treat the **code as ground truth** and these docs as the map — re-grep before editing.

## Deployment & cache-busting

Hosted as `index.html` on GitHub Pages. After shipping, tell the user to bump `?v=N` and
hard-refresh. The version number lives only in the URL, tracked in conversation/journal.
