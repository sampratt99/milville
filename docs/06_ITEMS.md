# 06 — Items (~384; treat exact counts as live data)

`ITEMS[id] = {name, ex, val, prim?, heal?, stack?, cat?, equip:{...}}`. Find any item by
grepping `ITEMS.<id>` and the generator loops. `GE_STOCK` (~201 ids) lists GE-buyable items.

## equip shape

`{slot, model, verb, req, tint, trim, ...stats}` — slots: weapon, shield, head, body, legs,
neck, cape, ring, feet, hands, **ammo**. Stats: `atk/str/def` (melee), `ratk/rstr/rdef`
(ranged), `matk/mdmg/mdef` (magic), plus `pray, prayerbonus, prayregen, hpregen, hp, range,
armStyle, emberset, capeSkill, tool/treq/gb, spec, quiver, maxArrow, slow`.

## Gear families

- **Metal melee tiers** (bronze→rune→beyond): weapons + plate armour (high def/rdef, mdef 0).
- **Ranged**: bows (tiered; `range`, rapid/longrange behavior), 7 ammo items (arrows;
  consumed unless a luxury quiver is worn), **d'hide/leather armour** (`armStyle:'ranged'`,
  green→blue→red→black by Ranged req 40–70).
- **Magic**: **one-handed elemental staves** (substitute their rune; offhand books work),
  **robes** (`armStyle:'magic'`: wizard 1 / mystic 20 / enchanted 40 — high mdef, weak
  physical), runes.
- **Ember set** (req 60, `emberset:1`): all-style equal defence + set bonus (see 19).
- **Luxury** (cat `'Luxury'`, 18 items): see 22.
- **Capes**: colored, quest (Pelican), master capes (capeSkill emblem), cage-token capes.
- **Slayer gear**: Proctor helm line (+dyes), earmuffs, mirror shield, rock hammer, signet.

## Currencies

`coins` (universal) · `cinders` + `warrant` (Emberdeep; luxury-shop pricing uses all three) ·
`cage_token` (PvP quartermaster).

## Adding an item — checklist

1. `ITEMS.x = {...}` with a **source** (drop/shop/quest/craft), val, examine.
2. Icon: `drawItemIcon` dispatches by item id or `equip.model` — new models need a case.
3. World model: `makeGroundItem` (dropped form) + worn model (`equip.model` builder) +
   **remote-player mirror** in `buildGearRig`/`applyRemoteGear` if visually distinctive.
4. If GE-buyable, push to `GE_STOCK`; luxury goods go in `EMBER_SHOP` instead.
5. Balance: respect BIS DPS parity (~8.2 across styles) and the defensive triangle profiles
   (05 §6) unless deliberately deviating (document it!).

Prices: GE buy = `val`; GE quoted `floor(val*0.6)`; `sellPrice` `floor(val*0.4)`;
High Alch = `floor(val*0.6)` — keep val economy-aware.
