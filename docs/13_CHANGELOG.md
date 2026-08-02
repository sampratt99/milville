# 13 — Changelog (major arcs; the fine grain lives in journal.txt)

`?v=N` lives only in the URL — confirm the current N with the user. Early history (≤v19) is
in the previous kit; since then, in order:

1. **Multiplayer suite** — relay server, presence, groups, group combat, trading.
2. **Interiors arc** — Chapel, St. Paul, Rectory interior, Hargate Party Room (+ the
   Christmas quests rxmas/rxmas2).
3. **Wilderness expansion** — the world grew 192→**304 wide** (everything shifted **+112**);
   new deep-west geography (mountains, valley, Pat's Peak snow, the Asylum, bandit camp,
   Swenson quarry + quest, ropes course/Agility, lava fields, the volcano) + ~20 new mobs.
4. **Matthes Cage PvP** — the coliseum, 3-phase duel system (handshake, OSRS rules screen,
   rewards), cage tokens + Quartermaster. (PvP maps designed, unbuilt.)
5. **Emberdeep endgame** — volcano floors + quest trio, wardens/conduits, gauntlet, vault
   puzzle, cinders/warrants, Hirschfeld, Ember set, the **First Rector Reforged** group boss
   (siphons, chain lightning, enrage, signet), 4h respawn, ~100k gold per member per kill.
6. **Luxury shop** — 18 items, rotatable 3D examine popups, remote-player models; ring/crown
   model orientation fixes; melee-tank gear (Warden ring, Mountain shield all-style def).
7. **Combat OSRS rework** — hitFromRolls everywhere, mob defence stats, per-style incoming
   defence, 0.7-magic rule, gear triangle spread (+robe mdef fix), weakness/resist,
   click-to-attack + auto-retaliate, variable attack range, spec accuracy rolls, PvP parity.
8. **Prayer rebuild** — 26-prayer OSRS book, pool=level, OSRS drain rates, protections
   (100% block), overhead icons + MP sync, regen caps, prayer UI grid.
9. **Magic additions** — teleports moved to magic (25/45, free), Low/High Alchemy.
10. **Wiki** — Encyclopedia→Wiki with the 10-page new-player Guide.
11. **MP boss-ownership fix** — deterministic single scheduler for Rector mechanics
    (lowest-uid fallback + self-healing pushbacks). Critical; see 19.
12. **Construction + the player-owned house** — the 16th skill. Mr. Bohan's ruined cottage, a 3-stage
    visible rebuild, a 3×3 room grid with a courtyard garden at its centre, 12 room types, 118
    furniture pieces across 57 named hotspots, 8 bespoke floor styles, the White Farm sawmill (Daryl)
    with 4 plank tiers, smithable nails, 5 St Paul's butlers, house visiting with lock/evict, a house
    HUD, and full interior/multiplayer isolation. See `23_CONSTRUCTION_AND_POH.md`.

## The offline harness suite (July 2026)

Rebuilt the validation harnesses from scratch: 39 harnesses, ~1,120 assertions,
run by `npm test`. `harness/shim.txt` is a browser stand-in wide enough that the
whole 47k-line module scope executes; `harness/_lib.mjs` holds the Pattern-B
runner. Every harness was sabotage-tested — the game was deliberately broken on
a scratch copy and the matching assertion confirmed to go red.

Six real defects found and fixed along the way:

- **`bohanBuyDeed` lost the deed on a full pack.** The guard read
  `invFull() && !findItem('house_deed')`, but `findItem` returns -1 when absent,
  so it only fired when you already held one. Buying with a full pack charged
  50,000 coins and the deed vanished.
- **House furniture stayed in the world after you left.** `exitHouse` hid the
  group but never tore down `_houseObjs`, leaving 48 objects live at HOUSE
  coords — walkable deep wilderness. Invisible collision on the grass, and
  `optionsAt` offering house menus to anyone clicking that patch.
- **An orphaned furniture id killed the tile menu**, in two separate unguarded
  reads of `HOUSE_FURNITURE[cur]`. `houseSlots()` now sweeps dead ids so a save
  heals itself, and both call sites are guarded for guest data off the wire.
- **The torus half of the "born upright" rule was backwards** in CLAUDE.md and
  docs/23. A cylinder needs `rotation.x = PI/2` to stand up; a torus is already
  standing and PI/2 lays it flat. Following the note literally would have laid a
  portal arch on the floor. No shipped model was wrong — the doc was.
- **`houseTrophyReport` is declared twice**; the earlier chat-line version is
  unreachable. Left in place, flagged by `newfunc`.
- **The courtyard inherits a window from the parlour** through the
  `curtainCol[gx,gy-1]` fallback — glass on the courtyard face only. Left alone
  as a visual call, characterised exactly by `wintest`.

`docs/14` now documents what the shim can and cannot do, and corrects three
limits that no longer apply: rotation is a real Euler, `.visible` reads back, and
`classList` persists.

## House visiting, and a house that fits every room (July 2026)

**Multiplayer visiting was broken and is now fixed.** The `ho` (house-open) flag
never reached other clients: `server.js` rebuilds the `state` message it
broadcasts rather than relaying it, so `ho` was stripped in transit — and the
client then wrote `houseOpen = !!m.ho` with no `undefined` guard, setting the
flag FALSE on every state message and wiping what `hello` had just set true. An
owner doing anything at all had their door flapping shut on every neighbour's
screen. Fixed on both sides; the client guard alone is sufficient, the server
half needs a `wrangler deploy`.

**Visiting moved onto the house HUD.** `hhlock` toggles your door (and evicts
guests when you lock), `hhvisit` opens a panel of every door unlocked right now
with a row always offered back to your own cottage. `houseRequestVisit` no longer
refuses while you are inside — it steps you out first, which is what made the HUD
path possible at all.

**The room grid grew from 3×3 to 5×3.** Nine cells for twelve room types meant
three rooms could never be built. All twelve now fit, with three cells spare so
the house can be any connected shape. The region moved west to `x24..84` because
the Rectory starts at `x85` and the delve at `y36`; cell indices are unchanged so
no save migration was needed. The cottage door object, hard-coded to the old
entry doorway, had to be re-seated — it was left standing in solid rock by the
move, which `walktest` caught.

**The garden goes anywhere.** The courtyard rule (garden only in the centre,
centre only a garden) is gone.

**Rooms can be rearranged.** A HUD button opens a grid you drag rooms around in;
it refuses any layout that empties the entrance cell or strands a room with no
way in, and **the furniture moves with its room** — slot keys carry the cell, so
they are re-keyed in one pass on save.

## House fixes and offline visiting (July 2026)

Eight reported bugs, one of which was destroying items:

- **A butler fetch that did not fit DESTROYED the boards.** The bank was
  decremented and `addItem(id, taken)` called once; boards do not stack and
  `addItem` is all-or-nothing for a non-stackable, so with too few free slots it
  added nothing and returned false. The boards had already left the bank. They
  now go in one at a time and the remainder is put back.
- **Clicks landed a tile or three off inside the house.** `castPick` resolves
  clicks against a per-interior floor mesh and the chain ends at `terra`, the
  overworld terrain. The house had no branch — the identical fault the delve
  once had. Added `housePickFloor`.
- **The cottage door floated.** Object models bake their Y from `groundH()` long
  before the house exists, so the door read the original wilderness terrain and
  the flatten left it hanging.
- **The delve lobby was visible from inside the cottage**, its props standing in
  the wilderness just south of the region.
- Staff could be hired with no bell; the chapel pew faced away from the altar and
  every dining chair faced away from its table; the Plain shelf was inspected as
  a "Trophy shelf"; and the HUD carried a four-line readout that made it too tall.

**Visiting now works with the owner offline.** `hreq` → `hdat` needs the owner's
client to answer, so it only ever worked while they were logged in. The cottage
is now published to the server (`mp-server/houses.js`) and listed and fetched
over plain HTTP. A snapshot carries the layout and the furniture and nothing
else. **That half needs a `wrangler deploy`.**

## Save-code audit (August 2026)

The save code and the autosave share one payload (`saveObject()`), so anything it
forgets is lost twice: on every logout, and again when a player pastes their code
into a new browser. Audited it field by field against the whole of `player`.

**The good news, verified offline:** the code already carries the cottage in full
(rooms, furniture, repair stage, butler), both skills added after the codec
existed (Agility, Construction), and every one of the 418 items in the game —
items are just ids, so a new one round-trips the moment it is in `ITEMS`.

**Six things it did not carry, or carried wrongly:**

- **Prayer was clamped to a literal 100 on load.** `maxPray()` is your Prayer
  level plus gear and the level cap has been 120 since the rescale, so a
  high-level character was quietly docked 20+ prayer points on *every single
  login*. Clamps to the real pool now; hp is clamped the same way.
- **The Gauntlet's best wave was never saved.** It was written on every new
  record, fired the title and achievement checks, and was thrown away at logout.
- **The ore-pouch orphan sweep ran one statement too early** — before the pouch
  was loaded — so it only ever scrubbed the empty default. A dead ore id from a
  past update rode straight back in.
- **`resetGame()` had drifted years behind the save.** "Reset progress" left the
  cottage standing, every quest finished, the slayer streak, the achievements,
  the collection log, the pet, the ore pouch and the whole Emberdeep unlocked. It
  now resets nested defaults from `PLAYER_FRESH`, a snapshot taken at
  declaration, so a new quest is reset for free — and it refuses to run indoors,
  which would have left the player inside an interior that no longer exists.
- **The skill set was merged, not built.** `Object.assign(player.skills,
  s.skills)` let a skill the save predates keep whatever was already there. No
  path reaches that today, but a "switch character" button would instantly hand
  character B character A's Agility. Built from `SKILLS` now.
- **The pack is normalised to 28 slots**, since a save code is text a player can
  truncate and everything that draws the pack indexes 0..27 directly.

**`harness/savetest.mjs` (41 assertions) is the point of the exercise.** It
round-trips a character with progress in every system through a real
gzip/base64url code, drives five ways a code gets mangled in transit, and then
reads the source to assert the three lists agree: `saveObject()` writes it,
`loadSlot()` reads it, `resetGame()` clears it. It also asserts that **every**
`player.*` field in `index.html` is either saved or on an explicit transient
allowlist — so adding a persistent field without saving it now fails by name.
New doc: `24_SAVES_AND_SAVE_CODES.md`.

## The Molten Gauntlet minigame removed; reset button removed; mobile save codes (August 2026)

**The wave arena on Emberdeep floor 2 was scrapped, and the code was still there.**
Auditing why a "Gauntlet best wave" record existed turned up the reason nobody
had ever seen it: `gauntlet_brazier`, the object that starts the thing, is
**never placed in the world** — no `addObj` for it anywhere, unlike its
neighbour `cinder_forge` on the same island. It was unreachable, and doubly so:
its arena centre `(137.5, 43.5)` predates the chamber move and now sits outside
Chamber III entirely, so every wave would have stacked all eight mobs on one
fallback tile.

It was not free, either. `buildGauntletPool()` ran at load and pushed **8 mobs
into `rats` with 8 Three.js model groups built and hidden**, every session, for a
feature no player could start. Removed: the object def and the four tables
naming it, the menu branch, the model branch, the walk-to action, the death and
floor-leave hooks, the loot and kill hooks, and the 5 KB minigame itself —
**8.5 KB in all**.

**Chamber III is not going anywhere.** The *floor* is called the Molten Gauntlet
and is fully live: three wardens on conduits, keys, gates, vents, the sealed NW
stair to the Heart, Hirschfeld's dialogue and the `ember_combat` quest. Only the
wave arena is gone. If you find "Gauntlet" in the code now, it means the room.

**"Reset progress" is gone from Options.** A two-click arm-and-fire control that
destroys a character is risk with no upside — a player who wants to start over
deletes the slot on the title screen. `resetGame()` itself stays, unwired, as the
mirror of `saveObject()` and the oracle `savetest` measures the save against.

**Save codes now survive an iPhone.** Three real defects, none visible on a
desktop:

- **Safari drops the user gesture across an `await`.** Building a code is async
  (gzip), so `await encodeSave(...)` then `clipboard.writeText(...)` was refused
  on iOS — "Copy save to clipboard" quietly copied nothing. The clipboard is now
  claimed *synchronously inside the tap* with
  `new ClipboardItem({'text/plain': promise})`, which exists for exactly this,
  with `writeText` and `legacyCopy` behind it.
- **iOS will not copy from a readonly, off-screen textarea.** `legacyCopy` used
  the desktop recipe (`top:-1000px`, readonly, `select()`), which returns false
  on iPhone. It now uses an on-screen invisible 1px field, `contentEditable`, a
  Range *and* `setSelectionRange`, at 16px so iOS does not zoom on focus.
- **A desktop code could out-run an old phone.** `ALDV1:` is gzipped and
  `DecompressionStream` only landed in Safari 16.4, so a laptop code pasted into
  an older iPhone surfaced a raw `DecompressionStream is not defined`. It now
  names the problem and the fix. The reverse direction was already safe: a phone
  without `CompressionStream` exports the plain `ALDV0:` form, which everything
  reads.

`savetest` (51 assertions) proves the interchange by deleting
`CompressionStream`/`DecompressionStream` off `globalThis` and putting them back:
a phone code loads on a desktop, loads on the phone, and lands the same
character as the gzipped one.

## The butler no longer restarts on every click (August 2026)

**Sending the hire to the bank and then touching any button replayed his exit
animation.** Toggling build mode, building a piece, taking one down — each one
put him back in the parlour to walk out through the door again, over and over.

`houseRebuild()` tears down and re-creates every house object, and the servant
was one of them: each rebuild spawned a **brand new butler at the bell** with a
fresh `px/py`, which then interpolated to the door and vanished. The trip timer
was never affected — it lives on `player.house.servant`, not on the object — so
the errand always completed correctly and the fault read as purely cosmetic.

`houseRebuild` now carries the hire's live state across the rebuild (tile,
interpolated position, heading, gait phase, next wander) and seats the rebuilt
model where he actually is, staying hidden if he had already stepped out.
**Changing tier still spawns a fresh one at the bell**, which is why the carried
state is keyed on the hire's tier. `butlerwalk` grew seven assertions covering
both halves, all sabotage-checked.
## The run orb had never heard of Agility (August 2026)

`updateRunOrb()` computed the ring's fill as `clamp(player.stamina/100,0,1)` —
a literal that predated the skill. Agility raises the ceiling: `AGI_ENERGY_TIERS`
runs 100 at level 1 to **240 at 120**, and `maxStamina()` is the authority every
other consumer already asked. `loadSlot()` clamps to it, the regen tick caps at
it, a new character starts at it. Only the orb still divided by 100.

Above Agility 10 the clamp therefore pinned the fill at 1 for everything from the
real maximum down to 100. At Agility 99 (ceiling 210) the ring sat **visually full
for the first 110 energy** — 220 running tiles at `RUN_DRAIN` 0.5 — while the
number beside it ticked down normally, so the first third of the drain looked like
it did nothing. The colour thresholds hang off the same fraction, so green
outstayed its welcome by exactly the same margin.

One character: divide by `maxStamina()`. It was the last hard-coded 100 in the
run-energy path.

**`harness/runorb.mjs` (27 assertions)** is the guard, and it is deliberately not
a single-point check — at full energy the bug passes. It asserts the fill rises
**strictly** across 21 samples of the whole 0..max range, that the very first
running tile moves the ring, and that the colour bands read against the ceiling
rather than 100. It also reads the source for the literal coming back, in the orb,
in the load clamp and in the regen cap, and checks the new-player `stamina:100`
literal still agrees with the level-1 tier. Reverting the one character fails 7 of
the 27. Suite is now 49 harnesses, 1667 assertions.

## The wilderness leak, and a fac brat who looks like one (August 2026)

**The delve lobby really was standing out on the grass, and here is why.**
Reported twice: the exit ladder, the reliquary chest and Mr. Ellison visible in
the wilderness between the Agility course and Pat's Peak. Reproduced offline in
one step — enter the volcano, leave it, and all three lobby props turn on.

Every interior keeps a def-set of its own props, and the enter/exit pair used it
asymmetrically: `enterX` sets `visible = !!MY_SET[def]` (show mine, hide everyone
else's — right), but `exitX` set `visible = !MY_SET[def]`, which hides mine and
**shows every other interior's**. The lobby props sit at (24–30, 50–59), walkable
deep wilderness right beside the course, and are parented to the scene rather
than to a group that gets hidden wholesale — so they simply appeared. Leaving the
Songs of Solomon cave was worse: it lit the entire Emberdeep as well, 131 props.

The earlier fix did not touch this because it hardened `_raidSetLobbyObjVis`, and
none of these paths call it.

- Every exit now hides `interiorPropDefs()`, the **union** of all three sets.
  Re-entry is unaffected, which is what makes it safe: `enterX` re-asserts its own
  set from scratch every time (verified: 7 volcano props inside before and after
  the change, on the first visit and the second).
- **Interior NPCs get the same rule.** Only `exitRaid` hid Ellison; the object
  loops never looked at `npcs` at all.
- The boot sweep now covers every interior's set rather than just the lobby, and
  refuses to run indoors — fired from inside the volcano it would strip the cave.

`lobbyvis` grew 17 assertions covering the round trips, the re-entry guarantee and
the indoor refusal; all sabotage-checked.

**The fac brat hire now uses the fac brat's own model.** The top butler tier was
the schoolboy rig in staff tweed with a lanyard; the mob is a red horned imp with
hooves, bat wings, a spade tail and a dagger. The body moved into
`buildBratRig(g)`, shared with `makeRat`, so the hire and the monster cannot
drift. He is still furniture, not a monster: no hitpoints, not in `rats`, pick
proxy tagged `obj`, and the click menu offers Talk-to and Examine with no Attack.
Two traps in the wiring, both now asserted — `buildObjModel` has a common tail
(seat, tag `userData.o`, scene-add) that a branch must not `return` past, and
`butlerTick` writes absolute limb rotations, so `_hm` carries the demon rest pose
(`armBase`) or the arms snap through the body on the first stride.

## Three small bugs from a sweep of the file (August 2026)

Found by driving the game rather than reading it. None throws; all three look
like they worked.

- **Buying a Party token with a full pack cost 30,000 coins and gave nothing** —
  and printed "You buy a Party token" anyway. `addItem` returns false when the
  item will not fit, and a token is *stackable*, which only helps if you already
  hold one. Arriving with a full pack of loot to drop on the lever is exactly why
  anyone comes to the Party Room. Both copies of the purchase (the function and
  Callahan's dialogue) now hand the token over first and spend only if it landed;
  Callahan has a new line for a full pack. Every other `spendCoins → addItem`
  path in the file was audited and is already guarded.
- **Dying with the bank open left it open.** The cottage paths and
  `exitToMainMap` dismiss the counter panels — death, `enterVolcano`, `enterSos`
  and `_raidEnterNow` did not. There is a bank chest at (215,108), *inside the
  First Rector's arena*, and another in the delve lobby, so you could bank
  mid-fight, die, and wake in the town square with the bank still usable.
- **Examining another player never showed their ring or pet.** Two hand-written
  slot lists — the examine modal's and `MP.examineInfo`'s — both predated those
  slots, and disagreed with each other about ammo. Both now mirror
  `EQUIP_LAYOUT`. Your own panel was always correct.

New harness `annoy.mjs` (29 assertions), five sabotages confirmed red. It also
pins the cases the fixes must NOT break: a full pack is still fine when a token
stack is already there, and a normal purchase still costs 30,000.

**Also checked and clean**, so nobody re-treads it: all 418 item ids against drop
tables/furniture/rare lists, right-click menus for all 280 object defs, tooltips
for all 418 items, skill-gate boundaries at exactly `req` and `req-1` for every
node and every equippable, the two-handed swap with a full pack, the bank
withdraw path, shop-vs-GE pricing (no arbitrage), destructive-first menu options,
`-1` truthiness, and duplicate data-table keys.

## Sawmill fees cut by ~43% (August 2026)

A player pointed out that paying to saw logs pushed everyone toward buying
planks off the Exchange instead. They were right, and the numbers were worse
than "a bit steep": **the fee was about 143% of the plank's own value** in every
tier — 150 against a 108 gp plain plank, 6,200 against a 4,200 gp birch one. So
sawing cost half again what the board was worth. In OSRS the fee is roughly half
a plank's value and making is *cheaper* than buying; here it was strictly worse,
which is exactly what the complaint described.

Fees are now **50% of plank value: 90 / 350 / 1,200 / 3,500** (down from
150 / 600 / 2,100 / 6,200).

**The mill could not simply be made free, and that is worth recording.**
`sellSlot()` lets any NPC clerk buy any valued item at 40% of `val`, paying out
of nowhere, and logs are free off a tree — so a zero fee turns chop → saw → sell
into a pure gold faucet worth 2,800 gp a birch board. Birch is Woodcutting 45
with twenty nodes and an 88.8% roll at 99; runite ore, the nearest-valued gather
at 2,700 gp, is Mining 85 with two nodes and a 26.8% roll. That is roughly
**1.87M gp/hr against 543k, at half the level requirement** — several times the
best current earner. The fee had been holding that shut by accident.

So the fee is now pinned inside a band, and both edges mean something:

    clerk price (40% of val)  <  fee  <  Exchange reference (60% of val)

Below the lower edge it prints gold; above the upper edge nobody uses the mill.
New harness `milltest.mjs` (33 assertions) asserts both edges per tier and drives
a real conversion; three sabotages confirmed red, including setting a fee
*exactly* to the clerk price. **If a plank's `val` ever changes, its fee must
move with it** — the harness names the tier.

Balance note: this is a straight ~43% cut to a coin sink, so slightly less gold
leaves the economy per board. Against that, planks were largely being bought
player-to-player instead, where the only sink is the Exchange's 2% tax — so
routing that demand back through the mill should sink *more* gold overall, not
less.

### Correction to the entry above (same day)

The first two write-ups of this change both got the venue wrong, so the numbers
in them are not to be trusted. The correct picture:

**There is one selling venue, the Grand Exchange clerk, and he quotes two prices
for the same board.** He SELLS planks — they are in `GE_STOCK` — at full `val`
(180 / 700 / 2,400 / 7,000), and BUYS them back at 40% of `val`
(72 / 280 / 960 / 2,800) out of infinite gold. `gePrice()` (60% of `val`) is
**not a venue at all**: it never transacts, and only feeds the tooltip and
examine lines. An earlier draft reasoned about profit from it, which was wrong.

So the real before/after is much better than first reported:

| | clerk charges | mill it yourself | you save | *was* |
|---|---|---|---|---|
| plain | 180 | 90 | 50% | *17%* |
| oak | 700 | 350 | 50% | *14%* |
| willow | 2,400 | 1,200 | 50% | *13%* |
| birch | 7,000 | 3,500 | 50% | *11%* |

Milling used to save 11–17% over just buying the board — not worth chopping a
log and walking there, which is precisely why players bought instead. It now
costs half the clerk's price, or 44–49% even if you buy the log off him too.

**Can you profit by sawing?** Not by vendoring — mill for 90 and he pays 72 back,
and that must stay negative or a free log prints gold. But you profit twice over
elsewhere: you halve the cost of every board you build with, and boards sold to
other players on the Player Market tab fetch anything between the mill cost and
the clerk's asking price, which beats both sides' alternatives.

`milltest` now compares the fee against **the clerk's asking price** rather than
the `gePrice` reference, and asserts he actually stocks planks so the comparison
cannot go vacuous.

## The sawmill is free, and the clerk no longer sells logs (August 2026)

Sam's call, after the fee cut turned out not to go far enough. The complaint was
that milling was never worth it — and the fee cut only made milling *cheaper
than buying a board*, not *profitable*. It should be profitable: the whole
economy is gather → process → vendor.

**Both halves shipped together, and neither is safe alone:**

- **The four logs came out of `GE_STOCK`.** The clerk still *buys* logs, he just
  will not sell them. Chopping is now the only way to get one.
- **Every sawmill fee is 0.**

Chop → saw → vendor now pays **+72 / +280 / +960 / +2,800** a board, which is
exactly the bargain smithing makes: buy the ore and all 55 smithing recipes land
underwater by design, gather it yourself and the vendor price is all profit.
Sawing had been breaking that rule in the wrong direction — even with your own
logs, the old 6,200 fee against a 2,800 birch board lost 3,400 a plank.

**The rate was modelled, not guessed** — real node tables and action timings
(20 birch, cap ~12, 18s respawn, a roll every 1.2s, a board every 1.2s, walking
300ms/tile and running 150ms/tile over actual map distances):

| method | requirement | gp/hr |
|---|---|---|
| birch → planks | Woodcutting 45 | 1.4M *(at unlock)* |
| birch → planks | Woodcutting 99 | **2.9M** |
| runite → rune platebody | Mining 85 + Smithing 87 | **3.1M** |

So it lands at 0.95× the best existing method at max level, 0.46× at unlock —
underneath it, not replacing it.

**The load-bearing constraint is that the clerk sells no logs.** A purchasable
log plus a free mill is ~8M gp/hr of pure clicking at Woodcutting 1, with no
gathering — roughly 2.6× the best legitimate method. A level gate does *not*
substitute: a WC45 player would still buy birch logs and mill them, and buying
beats chopping on speed. `milltest` fails the moment a log returns to
`GE_STOCK`, and both sabotages were confirmed red.

Two older harnesses asserted fee behaviour that is now correctly gone and were
updated rather than deleted: `sawtest` now asserts the mill is free at every
tier, and `shiptest` turns "refuses when the fee is unaffordable" into
**"a penniless player can still mill"** — which is the case that now has to work.

## One sell price, and the money printer it was hiding (August 2026)

Started as "the tooltip shows 4,200 for a plank that sells for 2,800". It was
not a tooltip bug.

**There were two live sell paths paying different amounts for the same item.**
Clicking an item in your pack (or right-click → Sell-1/5/All) went to
`sellSlot`/`sellId` and paid **40%** of value. Clicking a row in the GE panel's
sell list went to `sellItem` → `_doSell` and paid **60%**. A birch plank was
worth 2,800 one way and 4,200 the other, and the tooltip advertised 4,200 for
both.

**The 60% path was a money printer.** The clerk sells ore at full value, so
buying ore and smithing it paid on **39 of 55 recipes with no gathering at all**
— +3,470 a rune full helm, +6,940 a scimitar, **+17,350 a platebody**, about
**8.7M gp/hr of pure clicking** before travel. That is several times any
legitimate method, and it needed no nodes, no respawns and no gathering time.
The economy's whole design is the opposite rule: buy-and-process loses,
gather-and-process pays.

**40% is now canonical and there is exactly one definition of it.** `gePrice`
(tooltip and examine), `renderSell`'s displayed label and `sellItem`'s unit price
all call `sellPrice()`. Buy-and-smith is back to 0 of 55 profitable; gathering
your own still pays.

This also corrects two things said earlier in this changelog: the claim that "no
buy-and-process loop pays" was only ever true of the 40% path, and every gp/hr
figure quoted for the sawmill was computed on that path — which is the one that
survived, so those numbers stand.

New harness `selltest.mjs` (19 assertions) drives **every sellable item in the
game** down both paths and asserts they agree with each other and with the
tooltip, that the rate appears in exactly one place, and that no
buy-the-inputs-and-sell loop profits. Three sabotages confirmed red, one per
surface.

**Player-visible cost, stated plainly:** anyone who had been selling through the
GE list is now paid a third less. That is the correct number, but it is a drop.
