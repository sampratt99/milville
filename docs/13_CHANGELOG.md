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
