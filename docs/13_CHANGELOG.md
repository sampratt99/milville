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
