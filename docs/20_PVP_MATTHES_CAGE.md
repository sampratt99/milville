# 20 — PvP: the Matthes Cage duel system

## The place

**Matthes Cage** — a PvP coliseum building at runtime (174,16) beside the Athletic & Fitness
Center (43×43 footprint, "PVP ARENA" banners, climbing walls, an east podium with examinable
figures: Mr. Pratt, Mr. Hebra, Dr. Bassi, Mr. Chase; the Rector is overhead-dialogue-only).
The fight itself happens in a **sunken turf pit** built in the interior dead zone
(**MPIT ≈ x111–129, y11–32; floor `MPITY` ~3.2 below the rim**). Duels swap players onto the
pit floor via the proven `_duelPitOpen`/`_duelPitSeal` pattern.

Internal code uses one-t **`mathes`** identifiers; user-facing strings are two-t
**"Matthes Cage"**. Keep that convention.

## The duel flow (3 shipped phases)

1. **Challenge handshake** — request/accept (`dreq`/`gaccept`-style duel messages: `dreq,
   ddecline, dhp, dlv, dend, phit, pend...`), countdown, pit entry, combat, death/forfeit
   (`dend`), exit + pit reseal.
2. **OSRS-style duel setup screen** — toggleable conditions before the fight (rules object
   synced to both clients; `duelSetupSnapshot`).
3. **Rewards** — the **Quartermaster** NPC by the cage sells for **cage tokens**
   (`cage_token` currency earned from duels): cosmetic capes (`brawlers_cape` 10 tokens,
   `champions_cape` 30 tokens, etc.).

## PvP combat math

PvP accuracy uses the **identical `hitFromRolls` ratio** as PvE (`_duelAcc`) — attacker's
style roll vs defender's per-style defence (including the 0.7-magic rule). Overhead
protection prayers show above heads in duels (synced via `'pray'`).

## PvP Maps (designed, NOT yet built — next planned Cage work)

Design draft: `milville-pvp-maps-draft.md`. 3 maps locked: **Turf** (default/free), **Snow**
and **Lava** (purchasable with cage tokens; lava = visual/obstacle only, no damage tiles v1).
Maps render inside MPIT on duel start into a `mathesDuelGroup` via the pit open/seal pattern.
Build order: A registry+synced selector → B render/teardown+mirrored spawns → C special
features → D polish. Open decisions (ask the user): walls break line-of-sight vs movement
only; hazard damage; free vs token-unlocked; v1 map count.
