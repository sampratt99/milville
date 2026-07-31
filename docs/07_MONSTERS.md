# 07 — Monsters (54 kinds)

`MOB_KINDS[kind] = {name, ex, hp, acc, maxhit, cmb, resp, bones|bigbones, coinP, coins,
aggro, wild?, slayer?, weak?, resist?, ...}`. Drops in `MOB_DROPS` + universal rare rolls +
`mobBoneDrop`. Bestiary pages render live from these tables.

## Roster by region

- **Campus/early**: rat, zombie, spider, redspider, minotaur, brat, priest, dean, guard,
  ghost, goblin, biggoblin, wolf, boar, student...
- **Classic wilderness**: banshee, gargoyle, basilisk, wyvern, lesser, greater, hdean,
  sentinel, dragon (Grounds Dragon), **master** (questline First Rector — hp130/cmb27).
- **Deep-west expansion**: hillgiant, mossgiant, firegiant, cyclops, darkwizard, skelearcher,
  kurask, green/blue/red/blackdragon, snowking (Pat's Peak), cinderwing, icefiend, icegolem,
  bandit, banditleader, patient (Asylum), bigspider.
- **Emberdeep**: ember_imp, magma_salamander, obsidian_golem, slag_warden, ember_choir,
  forge_tyrant, ember_mote, cinder_wraith, committee_guard, **master_reforged**
  (hp720/cmb360 — the group boss; see 19). ⚠ `master` ≠ `master_reforged`.

## Combat math on the mob side (the rework)

- **Mob defence**: `MOB_DEF_OVERRIDES` (bosses) else `mobDefStats(r)` from cmb
  (`dl=round(cmb*0.42)`, `db=cmb≥60?round((cmb−60)*0.15):0`; superior ×1.4+10);
  `mobDefRoll=(dl+9)*(db+64)`.
- **Mob attacks** roll vs your per-style defence; magic mobs have `MOB_MLVL` levels and use
  the 0.7-magic rule against you.
- `weak`/`resist` style multipliers (~+25%/−28%).
- Wild mobs still scale hp via `mobMaxHp(r)`; superiors scale size + stats.

## Special-mechanic mobs (unchanged)

Gargoyle (rock hammer finisher), banshee (earmuffs/proctor helm), basilisk (mirror shield),
wyvern (elemental/dragon-slayer shield), plus Emberdeep wardens with conduits and the
Reforged Rector's siphons/chain (19).
