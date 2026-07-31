# 13 — Changelog (major arcs; the fine grain lives in journal.txt)

`?v=N` lives only in the URL — confirm the current N with the user. Early history (≤v19) is
in the previous kit; since then, in order:

1. **Multiplayer suite** — relay server, presence, groups, group combat, trading.
2. **Interiors arc** — Chapel, St. Paul, Rectory interior, Hargate Party Room (+ the
   Christmas quests rxmas/rxmas2).
3. **Wilderness expansion** — the world grew 192→**304 wide** (everything shifted **+112**);
   new deep-west geography (mountains, valley, Pat's Peak snow, the Asylum, bandit camp,
   Swenson quarry + quest, ropes course/Agility, lava fields, the volcano) + ~20 new mobs.
4. **Matthes Cage PvP** — the coliseum, 3-phase duel system (handshake, OSRS rules screen,
   rewards), cage tokens + Quartermaster. (PvP maps designed, unbuilt.)
5. **Emberdeep endgame** — volcano floors + quest trio, wardens/conduits, gauntlet, vault
   puzzle, cinders/warrants, Hirschfeld, Ember set, the **First Rector Reforged** group boss
   (siphons, chain lightning, enrage, signet), 4h respawn, ~100k gold per member per kill.
6. **Luxury shop** — 18 items, rotatable 3D examine popups, remote-player models; ring/crown
   model orientation fixes; melee-tank gear (Warden ring, Mountain shield all-style def).
7. **Combat OSRS rework** — hitFromRolls everywhere, mob defence stats, per-style incoming
   defence, 0.7-magic rule, gear triangle spread (+robe mdef fix), weakness/resist,
   click-to-attack + auto-retaliate, variable attack range, spec accuracy rolls, PvP parity.
8. **Prayer rebuild** — 26-prayer OSRS book, pool=level, OSRS drain rates, protections
   (100% block), overhead icons + MP sync, regen caps, prayer UI grid.
9. **Magic additions** — teleports moved to magic (25/45, free), Low/High Alchemy.
10. **Wiki** — Encyclopedia→Wiki with the 10-page new-player Guide.
11. **MP boss-ownership fix** — deterministic single scheduler for Rector mechanics
    (lowest-uid fallback + self-healing pushbacks). Critical; see 19.
12. **Construction + the player-owned house** — the 16th skill. Mr. Bohan's ruined cottage, a 3-stage
    visible rebuild, a 3×3 room grid with a courtyard garden at its centre, 12 room types, 118
    furniture pieces across 57 named hotspots, 8 bespoke floor styles, the White Farm sawmill (Daryl)
    with 4 plank tiers, smithable nails, 5 St Paul's butlers, house visiting with lock/evict, a house
    HUD, and full interior/multiplayer isolation. See `23_CONSTRUCTION_AND_POH.md`.

## The offline harness suite (July 2026)

Rebuilt the validation harnesses from scratch: 39 harnesses, ~1,120 assertions,
run by `npm test`. `harness/shim.txt` is a browser stand-in wide enough that the
whole 47k-line module scope executes; `harness/_lib.mjs` holds the Pattern-B
runner. Every harness was sabotage-tested — the game was deliberately broken on
a scratch copy and the matching assertion confirmed to go red.

Six real defects found and fixed along the way:

- **`bohanBuyDeed` lost the deed on a full pack.** The guard read
  `invFull() && !findItem('house_deed')`, but `findItem` returns -1 when absent,
  so it only fired when you already held one. Buying with a full pack charged
  50,000 coins and the deed vanished.
- **House furniture stayed in the world after you left.** `exitHouse` hid the
  group but never tore down `_houseObjs`, leaving 48 objects live at HOUSE
  coords — walkable deep wilderness. Invisible collision on the grass, and
  `optionsAt` offering house menus to anyone clicking that patch.
- **An orphaned furniture id killed the tile menu**, in two separate unguarded
  reads of `HOUSE_FURNITURE[cur]`. `houseSlots()` now sweeps dead ids so a save
  heals itself, and both call sites are guarded for guest data off the wire.
- **The torus half of the "born upright" rule was backwards** in CLAUDE.md and
  docs/23. A cylinder needs `rotation.x = PI/2` to stand up; a torus is already
  standing and PI/2 lays it flat. Following the note literally would have laid a
  portal arch on the floor. No shipped model was wrong — the doc was.
- **`houseTrophyReport` is declared twice**; the earlier chat-line version is
  unreachable. Left in place, flagged by `newfunc`.
- **The courtyard inherits a window from the parlour** through the
  `curtainCol[gx,gy-1]` fallback — glass on the courtyard face only. Left alone
  as a visual call, characterised exactly by `wintest`.

`docs/14` now documents what the shim can and cannot do, and corrects three
limits that no longer apply: rotation is a real Euler, `.visible` reads back, and
`classList` persists.
