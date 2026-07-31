# 05 — Combat (the OSRS engine — fully reworked July 2026)

Combat was rebuilt to be **OSRS-identical**: real attack/defence rolls, per-style defence,
the combat triangle, the magic-defence rule, prayers, protections, special-attack accuracy,
and variable attack range. The old "base 0.60 + level×0.011" accuracy is GONE.

## 1. The core roll — `hitFromRolls`

Every attack (player→mob, mob→player, PvP) resolves accuracy the OSRS way:

```js
function hitFromRolls(A,D){            // A = attack roll, D = defence roll
  const p = A > D ? 1 - (D+2)/(2*(A+1)) : A/(2*(D+1));
  return clamp(p, 0.02, 0.99);
}
```

## 2. Player attack roll (outgoing)

```js
effLvl = floor( lvl(style skill) * prayerMult(cat) ) + styleBonus + 8
A      = effLvl * (gearAtkBonus + 64) * (1 + onTaskBonus)     // slayer helm on task
hitChance = hitFromRolls(A, mobDefRoll(r))
```
- `styleBonus`: melee accurate(+3 — NOTE the style id is `'stab'`), controlled(+1);
  ranged accurate(+3); magic has autocast/defensive.
- `prayerMult(cat)` = highest active prayer multiplier in that category (see 21).
- Gear bonuses come from `eqStat('atk'|'ratk'|'matk')`.

## 3. Max hit

Max-hit formulas are OSRS-exact (they were already right and were NOT changed in the rework):
effective strength/ranged/magic level (with prayer & style) into the OSRS max-hit formula
with the gear `str`/`rstr`/`mdmg` bonuses. Weapons carry literal OSRS bonuses (whip 82/82).
Damage rolled `rndi(0, max)` on a successful accuracy roll... i.e. accuracy decides IF,
strength decides HOW HARD.

## 4. Mob defence (player attacking a mob)

```js
// hand-tuned bosses in MOB_DEF_OVERRIDES; everyone else derived from combat level:
mobDefStats(r): dl = round(cmb*0.42); db = cmb>=60 ? round((cmb-60)*0.15) : 0;
                superior monsters: ×1.4 +10
mobDefRoll(r) = (dl+9) * (db+64)
```

## 5. Incoming hits (mob attacking the player) — per-style OSRS rolls

- Mob attack roll vs **your style-appropriate defence roll**:
  - vs melee: `def` gear + Defence level
  - vs ranged: `rdef` gear + Defence level
  - vs **magic**: the OSRS rule — `effDef = floor(0.7*Magic + 0.3*Defence)` + `mdef` gear.
    (Train Magic to resist magic; plate won't save you.)
- NPC magic attackers have magic levels (`MOB_MLVL` + `mobMagicRoll`); magic mob attack
  scale constant = 150 (the tuning knob).
- **Protection prayers block 100%** of the matching style from mobs (see 21).

## 6. The gear triangle (per-style defence on armour)

A runtime "gear spread" loop plus explicit stats give every armour family its OSRS profile
(verified values @req40 body): metal `def80/rdef76/mdef0` (weak to magic) · d'hide
`27/35/26` (balanced, weaker melee) · robes `1/0/42` (tanks magic, weak to physical).
Special cases: **Emberdeep armour** has def=rdef=mdef equal per piece (deliberate all-style
tank, 320 each style for the 5-piece set); **Ring of the Warden** 16/16/16 and **Shield of
the Mountain** 100/100/95 are deliberate melee-tank enablers.

## 7. Weakness & resistance

Mobs can be `weak` to a style (~+25% damage taken) or `resist` one (~−28%). Listed on each
Bestiary page. Layered on top of the rolls.

## 8. Attack styles

`player.style`:
- **Melee**: `'stab'`(=Accurate, +3 atk) / `'slash'`(Aggressive, str xp) /
  `'block'`(Defensive) / `'controlled'`(+1 all, shared xp).
- **Ranged**: accurate(+3) / **rapid** (faster attack interval, 2200ms) / **longrange**
  (+3 def, shared xp, **+2 tiles range**).
- **Magic**: autocast spell; defensive autocast (+def xp share).
XP: style stat 1.5×dmg (0.85× each for shared styles), hitpoints 0.85×dmg always.

## 9. Attack range — `playerReach()`

Melee 1 · Ranged = weapon `range||7` (+2 longrange = 9) · Magic = `range||10`.
Combat reach = `max(mobReach(r), playerReach())` — big mobs still melee you from their
footprint; you kite from a distance with bow/staff.

## 10. Special attacks

Weapon specs (e.g. **Volcanic Rend** on the Emberbrand) roll accuracy per hit through
`hitFromRolls` with a **+25% spec accuracy** multiplier (DDS-style); a miss deals 0.
No guaranteed hits.

## 11. Prayers in combat

Full book in `21_PRAYER_AND_MAGIC.md`. In short: 4-tier boost ladders per stat
(1.05/1.10/1.15/top) feeding `prayerMult(cat)` into every roll; protection prayers = 100%
block vs the matching mob style, mutually exclusive, heavy drain; overhead prayers render
above your head and sync in multiplayer.

## 12. Food, death, misc

- Food heals on Eat; combat locks some actions briefly (`player.combatT`).
- Death: `die()` — respawn; wilderness death routes items to `lostStash` (reclaim fee).
  Retribution prayer detonates on death. Gauntlet/duel contexts have their own death hooks.
- Special-gear mechanics still apply: Rock Hammer vs gargoyle (finisher at 1hp), banshee
  (earmuffs/proctor helm), basilisk (mirror shield), wyvern (elemental/dragon-slayer shield).
- Auto-retaliate is on by default; click-to-attack (`datk` action) pathfinds into reach.

## 13. Where the code lives (search anchors)

`hitFromRolls` · `mobDefStats` / `MOB_DEF_OVERRIDES` / `mobDefRoll` · `incomingMobHit`
(per-style incoming + protection block) · `playerReach` · `prayerMult` · `rndi(0,` max-hit
sites · `_duelAcc` (PvP uses the identical ratio) · `MOB_MLVL`.
