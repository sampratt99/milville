# 12 — Systems Reference

## Grand Exchange
`GE_STOCK` ~201 ids; buy = `val`, quoted `floor(val*0.6)`, `sellPrice` `floor(val*0.4)`;
sell list live-refreshes via the `renderInv()` hook (keep it). SELL_BLOCK items excluded.

## Banks
Main bank + the quarry deposit chest (runtime (90,113)); `depositSlot`, bank search, deposit-
all. Bank before the wilderness/Emberdeep.

## Luxury shop — see `22_LUXURY_SHOP.md` (coins+warrants+cinders pricing, examine popups).

## Clues, run energy, slots
Clue scrolls (dig at hinted locations, multi-reward); run energy drains on run / regens
walking (Agility helps); multi-slot saves + export/import codes (`ALDV*:`).

## The in-game Wiki (new)
Nav button (question-mark icon) → **Wiki** popup with three tabs: **Guide** (default),
Items (encyclopedia), Bestiary. The Guide = left vertical page nav + content pane, driven by
`GUIDE_PAGES` (10 pages: Start Here, Moving & Doing, The World & Map, Combat Basics, Combat
Mechanics, Skills [per-skill toggle via `SKILL_INFO` — all 15], Prayer, Quests, Money &
Trading, New Player Tips) and rendered by `renderGuide()`/`setEncMode('guide')`. **Update the
Wiki when mechanics change** — it documents combat rolls, the triangle, prayer rules, rune
casting, and the main-questline recommendation, and players rely on it.

## HUD notes
Prayer orb bar = `pray/maxPray` (don't regress to /100); active-prayer icons top-RIGHT of the
minimap (compass owns top-left); overhead prayers draw above heads.

## Bank & counter-panel invariants (learned the hard way)

- **A panel flag must never outlive its world.** `bankOpen` left true after using a house bank chest
  routed every inventory left-click to `depositSlot` — logs "vanished", the banker looked dead, and
  sales appeared not to happen. `exitToMainMap` now dismisses bank and shop, and
  `reconcileCounters()` clears any flag whose panel is not on screen, every frame.
- **`openBank` renders BEFORE it commits the flag.** Setting `bankOpen=true` first meant a render
  failure left the flag set with no visible panel — an invisible bank.
- **Removing an item from `ITEMS` is a save migration.** An orphaned id (the removed elixirs) made
  `itemCategory` throw, which took down the bank list, sort-by-category, and deposits. Everything now
  tolerates a dead id, and old saves are swept on load.
- **Non-stackable items take a slot each.** Buying more than one from the GE gives a banknote. Any
  "do I have room" test must run AFTER the consumed item is removed, not before.
