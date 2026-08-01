# 04 — Skills & XP

## The 16 skills

`SKILL_META`: attack (sword) · strength (fist) · defense (shieldic) · hitpoints (heart) ·
woodcutting (axe) · mining (pick) · smithing (anvil) · fishing (fish) · cooking (pot) ·
firemaking (flame) · prayer (star) · slayer (skull) · **ranged (bow)** · **magic (wizhat)** ·
**agility (agility)**. Hitpoints starts at level 10; others at 1.

## XP curve (unchanged)

`XP_TABLE[L] = round(24·(L−1)^1.78 + (L>50 ? 2·(L−50)^3 : 0))`, cap **99**.
Milestones: L50 ≈ 24.5k, L70 ≈ 61k, L99 ≈ 319k. Master capes: +10 effective levels
(`masterBoost`), one per skill.

## Combat skills

- **Attack/Strength/Defense/Hitpoints/Ranged/Magic** train through combat (style-dependent
  XP: 1.5×dmg to the style stat, 0.85× shares for controlled/longrange/defensive-cast;
  HP 0.85× always). Full math in `05_COMBAT.md`.
- **Ranged** needs a bow + **arrows equipped in the Ammo slot** (or a luxury quiver, which
  conjures them). **Magic** needs runes (elemental staff substitutes its element) + an
  autocast spell — see 21.
- **Prayer**: pool = level (OSRS); bury bones (big_bones 35xp) or offer at the altar; see 21.

## Gathering (Woodcutting/Mining/Fishing) — unchanged core

`chance = clamp(def.base + (lvl−req)*0.012 + toolBonus, 0.05, 0.93)`; tiered axes/picks carry
`{tool, treq, gb}`. Node/fish tables live in `OBJ_DEFS` / the fishing weight table; the deep
wilderness adds **berrite** at the Swenson Granite Quarry (quest `swenson`, mining pouch,
quarry deposit chest at runtime (90,113)).

## Cooking / Firemaking / Smithing — unchanged core

Cook raw fish on fires/ranges (burn chance falls with level); light logs for FM xp; smelt
ores → bars → smith gear on anvils (incl. the Emberdeep's Cinder Forge for ember gear).

## Agility (newer skill)

- Trained at the **ropes course** on the western edge of the wilderness (~runtime x20,
  y66–72): sequential obstacles (`ob_ropeswing`, `ob_balancelog`, `ob_cargonet`, ... each an
  `agiObstacle` with seq/xp/to).
- Benefits: run energy; **level 35 unlocks the volcano descent → the Emberdeep**.
- **The energy ceiling is not 100.** `AGI_ENERGY_TIERS` raises it from 100 at level 1 to **240
  at 120** (`maxStamina()`), and `AGI_REGEN_TIERS` raises the refill rate (`staminaRegenMult()`).

**Trap — never write 100 for run energy.** `maxStamina()` is the only authority; the literal is
correct only at Agility 1, so it fails *silently and invisibly* on any trained account. It cost a
bug once already: `updateRunOrb()` computed its fill as `player.stamina/100` and clamped to 1, so
at Agility 99 the ring read completely full from 210 energy all the way down to 100 — 220 running
tiles of drain with nothing moving — and the colour bands were skewed by the same margin. The one
legitimate literal is the new-player `stamina:100` in the `player` object, which is the level-1
tier value. `harness/runorb.mjs` guards all of it, and greps the source for the literal returning.

## Construction (newest skill)

- Trained by repairing and furnishing the **player-owned house** east of the Bonfire; planks come from
  the **White Farm sawmill**. Full detail in `23_CONSTRUCTION_AND_POH.md`.
- xp per plank rises with timber tier (6 / 15 / 34 / 70) while board price rises faster, so better
  boards are **faster but dearer per xp** — OSRS's own shape.
- Sawing planks awards **no** xp, as in OSRS.
- A maxed house is ~36% of a 99; the rest comes from build/remove cycling.
