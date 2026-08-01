# 19 — The Emberdeep (the volcano endgame zone)

## Overview

The **Emberdeep** is the endgame: a multi-floor volcanic interior beneath the deep-wilderness
lava volcano. Entered by descending the volcano (**Agility 35** required). It has its own mob
roster, three quests, two currencies, a luxury shop, an armour set, and the game's hardest
boss: **The First Rector, Reforged** (a group encounter).

State: `inVolcano` + `_lastVolcFloor` (1–4). Floor transitions via `ember_descent` /
`volcano_exit` objects. Floors are interior overlays on the shared grid (see 17).

## The floors (Chambers I → V/The Heart)

- **Floor 1 — the Cinderworks**: skilling floor (mining/smithing-flavoured; the Cinder Forge
  anvil lives on the hub island). Quest: `ember_skill` "The Cinderworks".
- **Floor 2 — the Molten Gauntlet**: combat floor. Slag Warden / Ember Choir / Forge Tyrant
  wardens, each chained to a **conduit** (`emberConduitOf`/`drainConduit`): fish out its key, heave
  its gate, douse its four cinder vents, cut it down. Draining all three opens the sealed NW stair
  (`gauntletStair`) to the Heart. Quest: `ember_combat` "The Molten Gauntlet".

  > **There was going to be a wave arena on this floor and there is not.** A `gauntlet_brazier`
  > object, a `gauntlet` wave state, an 8-mob spawn pool and a bank-or-cash-out feather pot were all
  > written, and the brazier was **never placed in the world** — no `addObj` for it anywhere — so
  > none of it was ever reachable. It was scrapped and removed (Aug 2026). The *floor* keeps the
  > name; if you find "Gauntlet" in the code it means Chamber III, not a minigame.
- **Floor 3 — the Siphon Vault**: puzzle floor (vault barrier, pressure/cell mechanics —
  `vaultBarrierBlocks`, `_cellBlocks`, `onEnterPuzzleTile`). Quest: `ember_puzzle`
  "The Siphon Vault".
- **Floor 4 — The Heart**: the Rector arena — throne dais + **4 siphon pillars** at
  (213,93) (225,93) (213,103) (225,103), encroaching lava (Ember set walks it unharmed),
  corridor + dais safe zones (region ~x206–232).

**Hirschfeld** is the voice/quartermaster of the zone (radio commentary as you clear layers;
logs **warrants**) and runs the luxury shop (see 22).

## Currencies

- **Cinders** — stackable zone currency from Emberdeep activity + boss kills.
- **Warrants** — logged per achievement/boss kill (EMBER_RECTOR_WARRANTS=25/kill).
- Both are spent (with coins) in the luxury shop; see `22_LUXURY_SHOP.md`.

## Mobs (the Emberdeep roster)

`ember_imp, magma_salamander, obsidian_golem, slag_warden, ember_choir, forge_tyrant,
ember_mote, cinder_wraith` + the boss `master_reforged`. Fire-themed; tuned high.

## The First Rector, Reforged (`master_reforged`) — the group boss

**hp 720, cmb 360**, dormant until his Discipline Committee guards (`committee_guard`) are
cleared. **Do not confuse him with the questline boss `master`** ("The First Rector",
hp 130/cmb 27, shallow wilderness, m5 quest) — completely separate mob + drop table.

### Mechanics
- **Siphon pillars**: he lights 1 (2 enraged) — while any is lit he heals 1.2%/0.9s. Batter
  a lit pillar dark (75 damage; hits can be forwarded to the owner in groups via `rpdmg`).
  First light at +8s; relight cooldown 30s (20s enraged); pillars auto-dark at `hotUntil`.
- **Chain lightning**: warn ("SCATTER") → 2.1s (1.5s enraged) → floods a chain through every
  arena player within 4 tiles of another hit player. One player is always hit; bunching kills
  groups. Damage 18–28 (26–38 enraged); Ember set takes ×0.75. First at 14s, then every 25s
  (17s enraged).
- **Chaos Nova / fire ring** (`_rectorFireRing`), **enrage at 25% HP**, encroaching lava.
- **4-hour respawn** per player (`player.rectorKilledAt`; `rectorResetEncounter`).

### Multiplayer ownership (CRITICAL — this was a hard-won bugfix)
Boss mechanics are **owner-scheduled**: exactly ONE client runs the siphon + chain clocks.
`iOwnRector()` = the boss claim's owner; **with no claim, the deterministic fallback is the
lowest uid among self + `rectorArenaPlayers()`** (string compare — consistent on all
clients). Never revert this to "no claim → everyone owns" — with 4 players that caused
constant chain lightning (4 schedulers) and never-dark pillars (parallel siphon clocks).
Self-healing: receiving another's `rchainwarn` pushes your `_chainCd` past their cadence;
receiving `rpil` pushes `_siphonCd` +12s. Messages: `rchainwarn, rchain, rpil, rpdmg,
rsignet`.

### Rewards (per kill)
- Every group member: **25 warrants + cinders (EMBER_RECTOR_CINDERS) + 90,000–110,000
  coins** (both reward paths: `rectorRewards` for the killer/solo, the `master_reforged`
  branch of `groupCoLoot` for co-attackers — keep them in sync).
- **Exactly one Rector's Signet per kill** (solo: yours; group: random member via
  `MP.groupRectorSignet`).

## The Ember armour set

5 pieces (helm/body/legs/boots/gauntlets, req 60, `emberset:1` flag): **def=rdef=mdef equal
per piece** (62/132/84/22/20 → 320 in EVERY style for the set) — the deliberate all-style
tank set with no triangle weakness. Full-set bonus (`hasEmberSet`): **+6 str, +6 rstr**
(EMBER_SET_BONUS), **lava immunity** in the Emberdeep, **25% chain-lightning reduction**.
The Ember cape is separate (ranged-offensive: def6/rstr4/ratk6).
