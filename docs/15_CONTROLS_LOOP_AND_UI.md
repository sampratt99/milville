# 15 — Controls, Loop & UI (delta over the stable core)

The input→action pipeline, two-clock loop, `optionsAt()` context menus, movement/pathing,
dialogue, mob AI, and audio are unchanged in shape — read the code for specifics. What's new:

- **Click-to-attack** (`datk`): clicking a mob pathfinds into reach and engages;
  auto-retaliate on by default. Reach is variable (05 §9) — ranged/magic attack from
  distance.
- **Combat tab**: style buttons per weapon class (melee stab/slash/block/controlled; ranged
  accurate/rapid/longrange; magic autocast/defensive) + auto-retaliate toggle + spec button.
- **Prayer tab**: a 4-column grid of circular toggle icons (mirrors the spellbook) with hover
  tooltips (`showPrayerTip`), lock states, tier pips. Active prayers = small icons
  **top-RIGHT of the minimap** (compass owns top-left). Overhead prayers draw above heads.
- **Magic tab**: elemental grid + **teleport cells** (Rectory/Wilderness) + **alchemy cells**
  at the bottom (click spell → click inventory item).
- **Wiki**: nav question-mark → Guide/Items/Bestiary (12).
- **Prayer orb**: bar fills `pray/maxPray`.
- **Luxury examine modal** (`openLuxExamine`): rotatable 3D preview, drag to spin (22).
- Esc closes topmost modals (incl. lux examine).
