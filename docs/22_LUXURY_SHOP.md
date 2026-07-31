# 22 — Hirschfeld's Luxury Shop & the luxury items

## The shop

`EMBER_SHOP` (20 entries; category `'Luxury'` for the luxury goods) — Hirschfeld's store in
the Emberdeep. Every entry prices in **coins + warrants + cinders together** (all three
required). Rows are clickable → **`openLuxExamine(id)`**: a modal with a **rotatable 3D
model** (`buildLuxuryModel(id)`, drag to spin), stats, price, and a Buy button. Worn luxury
items can also be examined from the equipment panel.

## The 18 luxury items (val ≈ coin price; warrants/cinders scale with it)

| Tier | Items |
|---|---|
| 900k / 11k cinders | ring_embers (+8 str/rstr) · ring_warden (**16/16/16 all-style def — tank ring**) · ring_rector (+8 matk/+4 mdmg) |
| 1.1–1.4M | bodkin_health · bodkin_piety · amulet_health · amulet_piety · boots_speed_silver/gold · gloves_haste_silver |
| 2.2–2.8M | gloves_haste_gold · **shield_mountain** (tower shield: **100/100/95 def, str4, hp50** — the melee-tank wall) |
| 3.0–3.4M | crown_wizardry (magic head: matk20/mdmg13/mdef6/def2/**pray+50**) · amulet_regen (prayregen 5) · quiver_rejuv (rstr24/ratk12/prayregen4/hpregen4) · halcyon_grimoire (offhand book: matk25/mdmg13/mdef8/prayregen4) · quiver_farsight (rstr44/ratk20) · bodkin_rejuv (3.4M ceiling) |

**Quivers** (ammo slot): auto-conjure the best arrow for your Ranged level (no arrows
consumed), own rstr stacks. **Prayer-regen** items: 1/min per point, hard-capped 8/min total
(never sustains protections/top prayers — see 21). Balance rails: melee/ranged/magic BIS DPS
parity ≈ 8.2.

## Models & icons (all verified)

- `buildLuxuryModel(id)`: standalone models for boots/gauntlets/amulets/swords/**rings**
  (upright band, gem seated on top — the flat-band bug is fixed; don't reintroduce
  `band.rotation.x=PI/2`) and the **crown** (standalone circlet); grimoire/quivers/tower
  shield render worn-on-mannequin (`buildWornGearModel` → MP rig).
- Inventory icons dispatch by `equip.model` in `drawItemIcon` (book/crown/quiver/towershield
  cases); `makeGroundItem` models exist for all.
- **Remote players** see the crown/grimoire/tower shield (mirrored in `buildGearRig` +
  `applyRemoteGear`). Known gap: quivers have no distinct remote worn model.
