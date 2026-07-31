# 02 — Architecture

## The single file

Everything is in **`milville.html`** (~2 MB): `<style>` (all CSS), the DOM skeleton, and one
giant `<script>` with the entire game. No build step, no modules. External deps: **Three.js
r128** from cdnjs — the tag carries **`crossorigin="anonymous"`** (KEEP IT: without it any
error touching the CDN script is masked as useless "Script error."). A `window 'error'`
listener logs message/file/line/stack to the console as a dev aid.

### Whole-file syntax check (use constantly)

```bash
cd /mnt/user-data/outputs
sed -n '/^<script>$/,/^<\/script>$/p' milville.html | sed '1d;$d' > /home/claude/M.js
node --check /home/claude/M.js && echo "SYNTAX OK"
```

## Tech constraints

- Three.js **r128**: no `OrbitControls`, no `CapsuleGeometry` (r142+) — use
  Cylinder/Sphere/Cone/composites.
- **No browser / no CDN in the sandbox** — logic-only verification via Node harnesses.

## World & load order (know this!)

1. Tile grid painted at original size (192×136), source coords.
2. Original campus data (BUILDINGS/SIGNS/objects/NPCs/mobs) defined in source coords.
3. **Expansion block**: `W→304`, everything (except `INT_DEFS` interior objects) shifted
   **x+=112**; `bgrid`/`wbody` re-embedded.
4. Deep wilderness painted at runtime x0–111 (mountains, snow, lava, volcano...).
5. Interiors built in dead zones; scene geometry baked; game starts.
Tiles: `T_GRASS..T_DITCH=8, T_LAVA=9, T_LAVAHOT=10`. Full details: `10_MAP_AND_WORLD.md`.

## Key derived helpers

```js
const lvl   = s => levelFor(player.skills[s]) + masterBoost(s);   // master cape +10
const maxHp = () => lvl('hitpoints') + eqStat('hp');              // gear hp (Mountain shield)
const maxPray = () => lvl('prayer') + eqStat('pray');             // OSRS pool = level (+gear)
function levelFor(xp){ /* XP_TABLE walk, cap 99 */ }
const fmt = n => Math.floor(n).toLocaleString('en-US');
function eqStat(k){ /* sums equip[*].equip[k] across worn slots (+EMBER_SET_BONUS if set) */ }
```

## Game state & saves

Global `player` (skills/inv/equip/quests/slayer/pray/...), `bank`, `ground`, `prayers`,
scene globals. Saves: `STORE` wraps localStorage; multi-slot (`'aldervale-slots-v1'` index +
`'aldervale-save-<id>'` — **names frozen**, see 00). `saveGame(silent)` writes a JSON payload
(skills, inv, hp, x/y, equip, kit, bank, pray, style, quests, slayer, lostStash, clues,
`mapv:'sps3'`, plus newer fields — read `saveGame` for the live list); export/import codes
prefixed `ALDV0:`/`ALDV1:`. `dirty` tracks unsaved changes.

## Multiplayer layer

An injected `MP` IIFE, no-op when unconfigured; Cloudflare Worker + Durable Object dumb
relay (client-authoritative). Presence, chat/emotes, mob streaming + claims, groups, group
combat, trading, **duels**, **overhead-prayer sync**, **group-boss ownership**. See 16.

## Deployment

GitHub Pages as `index.html`; cache-bust `?v=N` in the URL (not in the file).
