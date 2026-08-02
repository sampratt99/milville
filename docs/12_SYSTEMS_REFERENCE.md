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

## Three rules that came out of a bug hunt (Aug 2026)

**A purchase hands over the goods BEFORE it takes the money.** `addItem` returns `false` when the
item will not fit, and a **stackable only fits when you already hold one or have a free slot** — so
"it stacks" is not a reason to skip the check. Buying a Party token charged 30,000 coins, ignored the
return, and printed *"You buy a Party token"* to a player who received nothing. Both copies of that
purchase now call `addItem` first and only `spendCoins` if it succeeded. Every other
`spendCoins → addItem` path in the file was audited at the same time and is guarded.

**A panel flag must not outlive its world — and death is a world swap.** The cottage paths and
`exitToMainMap` already dismissed the bank and shop panels; `die()`, `enterVolcano`, `enterSos` and
`_raidEnterNow` did not. There is a bank chest at **(215,108), inside the First Rector's arena**, and
another in the delve lobby, so dying at a counter left you in the town square with the bank still
open and usable. `reconcileCounters()` runs every frame but only clears a flag whose panel has
actually closed, so it could not help here.

**A hand-written slot list goes stale.** Two of them enumerate worn equipment for the
*examine another player* window — the modal's `SLOTS` and `MP.examineInfo` — and both predated the
ring and pet slots, so a player wearing a Lightbearer looked barehanded to everyone else. They did
not even agree with each other about ammo. Both now mirror `EQUIP_LAYOUT`, which is the only list the
game actually draws from. `harness/annoy.mjs` asserts all three rules.

## One sell price, quoted everywhere (Aug 2026)

**`sellPrice(id)` is the only function that decides what the clerk pays, and every number the game
shows is that function's output.** The rate depends on whether the item has a *buy side*:

| | pays |
|---|---|
| purchasable for coins anywhere (`COIN_BUYABLE`: `GE_STOCK` + Hirschfeld + the cage quartermaster) | **40% of `val`** |
| drop-only | **100% of `val`** |

**The 40% spread exists solely to stop buy-it-then-sell-it-back arbitrage.** A drop-only item has
nothing to arbitrage against, so docking it just made rares read as worthless — a 90,000 whip paid
36,000. Keying this on `GE_STOCK` alone is *not* enough: the luxury quivers and the Shield of the
Mountain cost 2.8–3.2M coins at Hirschfeld without being GE-stocked, and would have vendored for up
to **800,000 more than they cost**. Hence `COIN_BUYABLE`, not `GE_STOCK`. It was not always so, and the gap was expensive.

There are two live sell paths and they used to disagree:

| how you sell | function | used to pay |
|---|---|---|
| click an item in your pack (shop open), or right-click → Sell-1/5/All | `sellSlot` / `sellId` | 40% of `val` |
| click a row in the GE panel's sell list | `sellItem` → `_doSell` | **60% of `val`** |

So a birch plank was worth **2,800 from your pack and 4,200 from the sell list**, and both the
tooltip (`gePrice`) and the sell list's own label advertised the higher figure.

**The 60% rate was a money printer, not just an inconsistency.** The clerk sells ore at full `val`,
so buying ore and smithing it paid on **39 of 55 recipes with no gathering at all** — +17,350 a rune
platebody, roughly **8.7M gp/hr of pure clicking** before travel, several times any legitimate
method. The whole economy rests on the opposite rule:

> **Buy-and-process must lose. Gather-and-process must pay.**

At 40% it does, on all 55. `gePrice`, `renderSell`'s label and `sellItem`'s unit price now all call
`sellPrice`, so a displayed number is always the number you receive.

`harness/selltest.mjs` drives **every sellable item in the game** down both paths and asserts the two
agree with each other and with the tooltip, that the rate is written in exactly one place, and that
no buy-the-inputs loop turns a profit.

