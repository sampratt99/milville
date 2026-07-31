# 21 — Prayer & Magic (both systems rebuilt July 2026)

## PRAYER — the full OSRS book (26 prayers)

**Single source of truth: `PRAYER_META`** — `{name, req, cat, mult, drain, fx}` per prayer.
The `prayers` state object, the 4-column icon grid UI, tooltips, skill guide, and the
active-icon HUD all derive from it. Edit `PRAYER_META` to tune anything.

### The ladder (cat → 4 tiers: +5%/+10%/+15%/top)

| cat | 1.05 | 1.10 | 1.15 | top |
|---|---|---|---|---|
| def | Thick Skin (1) | Rock Skin (10) | Steel Skin (28) | Love Divine (70, 1.25) |
| str | Burst of Strength (4) | Superhuman (13) | Ultimate (31) | Gordon Medal (70, 1.23) |
| atk | Clarity (7) | Improved Reflexes (16) | Incredible Reflexes (34) | Halcyon Strike (70, 1.20) |
| rng | Sharp Eye (8) | Hawk Eye (26) | Eagle Eye (44) | Pelican's Eye (74, 1.23) |
| mag | Mystic Will (9) | Mystic Lore (27) | Mystic Might (45) | Sheldon's Insight (77, 1.25) |

**Protections** (cat `protect`): Protect from Magic (37) / Missiles (40) / Melee (43) —
**block 100%** of that style from mobs. **Overheads** (also cat `protect`, `special` field):
Retribution (46, death AoE — wired), Redemption (49, heals at HP≤10%, empties prayer —
wired), Smite (52 — drains your prayer; opponent-drain needs MP sync, flagged inactive).
All cat-`protect` prayers are **mutually exclusive** and show an **overhead icon** (synced to
other players via the MP `'pray'` message). Not implemented: Preserve, Chivalry/Piety
combined prayers (Milville splits stats by design).

### Mechanics

- **Pool**: `maxPray() = lvl('prayer') + eqStat('pray')` — OSRS 1 point/level. (Crown of
  Wizardry +50.)
- **Mutual exclusion per category**; level-gated in `togglePrayer`.
- `prayerMult(cat)` = highest active multiplier — feeds all 12 combat sites.
- **Drain (OSRS rates)**: each prayer has a drain effect/min — 3 (+5%), 6 (+10%), 12 (+15%),
  24 (top tier), **20 (protections)**, 3/6/18 (Retribution/Redemption/Smite). Ticked at
  150ms: `pray -= drainSum/400 * prayerDrainMult()` where
  `prayerDrainMult() = 1/(1+prayerBonus()*0.0333)` — **prayer-bonus GEAR slows drain;
  level does not**. A 99 pool: top-tier ≈4.1 min, protection ≈5 min.
- **Regen items**: `PRAY_REGEN_PER_PT=0.01` (1/min per point), **capped at 8 total** — so
  regen never out-paces protections (12→20) or top boosts (24). Amulet of Rejuv = 5/min.
- Restore at the chapel **altar**; bury bones for XP (altar-offering gives more).
- UI: prayer tab = 4-col grid of circular toggle icons (mirrors the spellbook), hover
  tooltips, tier pips on boost icons; active prayers show top-right of the minimap;
  the active overhead prayer draws above the player's head (and remote players').

## MAGIC — spellbook, runes, alchemy, teleports

- **22 spells**: elemental Strike/Bolt/Blast/Wave/Surge × air/water/earth/fire (magic-level
  gated; Surge pbase 31, Fire Surge 34) + **Low Alchemy** (21: item→40% val coins, 31 xp)
  + **High Alchemy** (55: →60% val, 65 xp). Utility spells sort to the bottom row of the
  spellbook (sort key `(util?1:0)` first).
- **Casting requires runes**: one of each rune the spell lists, equipped; an **elemental
  staff supplies its element's rune**. Staves are **one-handed** (offhand books like the
  Halcyon Grimoire work with them).
- **Alchemy flow**: click the spell → `player._alchMode` set → click an inventory item →
  `alchemiseSlot(i)` converts one unit to coins + magic xp (skips coins/no-val/noAlch).
  ⚠ Economy flag: High Alch at 60% of `val` may out-earn shop selling for some items.
- **Teleports live in the Magic tab**: Rectory (Magic 25) / Wilderness (Magic 45), free, no
  runes, rendered as spellbook cells. `castTeleport(id)`.
- Magic defence: your resistance to enemy magic = `floor(0.7*Magic + 0.3*Def)` + `mdef` gear.
