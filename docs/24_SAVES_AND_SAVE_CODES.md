# 24 — Saves & Save Codes

**A save code IS the character.** Everything a player has done lives in one JSON blob, and the same
blob is both the autosave and the exportable `ALDV1:` code they paste into a new browser. Anything
missing from it is lost twice: on every logout, and again when someone tries to move devices.

Read this before adding any field that a player would expect to still be there tomorrow.

---

## 1. The three-place rule

A persistent field has to appear in **three** places, and they must agree:

```
saveObject()  writes it   ->   loadSlot()  reads it   ->   resetGame()  clears it
```

Forgetting the first loses it. Forgetting the second saves a field nobody reads. Forgetting the
third leaves it behind when a player asks for a fresh start — which is how "Reset progress" came to
leave the cottage standing, every quest finished and the whole Emberdeep unlocked.

**`harness/savetest.mjs` asserts all three agree, by name.** It also asserts that *every*
`player.*` field anywhere in `index.html` is either saved or on an explicit transient allowlist at
the top of that file. Add a persistent field without saving it and the harness fails with the field
name and the fix. If a field is genuinely session-only, put it on the allowlist **with the reason** —
that is the decision the harness is forcing you to make out loud.

---

## 2. The pieces

| Function | Job |
|---|---|
| `saveObject()` | Builds the payload. Shared by autosave and export — there is only one. |
| `encodeSave(str)` | `ALDV1:` + base64url(gzip) via `CompressionStream`; falls back to `ALDV0:` + base64url(plain) where it is unavailable. |
| `decodeSave(code)` | Reads either prefix. Deliberately forgiving — see §4. |
| `validSave(o)` | Minimum shape gate: skills object, inv array, numeric x/y. |
| `loadSlot(id, preObj)` | Applies a payload to the live `player`. `preObj` is the import path; without it, reads `STORE`. |
| `importSaveFromString(str)` | decode → parse → validate → `newSlot()` → `loadSlot()` → persist. |
| `resetGame()` | The mirror of `saveObject()`. |

Storage keys — **frozen forever**, see `00_START_HERE.md`:
`aldervale-slots-v1` (the slot index) and `aldervale-save-<id>` (one per character).
Code prefixes `ALDV0:` / `ALDV1:` are equally frozen: codes already exist in the wild.

### Version fields

- `mapv:'sps4'` — the coordinate generation. `'sps3'` saves get `+WX` applied on load; anything
  older (or a position now blocked) drops the player at the town square rather than inside a wall.
- `xpv:2` — the OSRS-scaled XP curve. A save with no `xpv` is re-levelled through `_oldLevelFor()`
  so each skill keeps its **level**, not its raw xp.
- `mhr:1` — max-hit records are trustworthy. Absent, `maxHit` is zeroed.

---

## 3. What a save carries

Roughly, in the order `saveObject()` writes it: position and interior return, the delve session,
all 16 skills, inventory, equipment, bank, hp/prayer/run/stamina, combat style and autocast,
quests, slayer, titles and emotes, achievements and the collection log, clue data, kill counts and
records, the ore pouch, cosmetics, the pet, the tutorial, the whole Emberdeep/vault state, the PvP
cage maps, friends, uid, and **`house`** — the entire cottage.

Two things worth knowing:

- **The cottage is one field.** `player.house` holds `{owned, repair, rooms, slots, slotsV2,
  servant, open}` and nothing about the house lives outside it. Functional furniture (trophy shelf,
  cape rack, pet house) *reads* other state and stores none of its own, so a save code carries a
  fully built house for free. See `23_CONSTRUCTION_AND_POH.md`.
- **Items are just ids.** A newly added item needs nothing here; it round-trips the moment it is in
  `ITEMS`. What it must not do is *leave* `ITEMS` — see §5.

`saveObject()` returns **live references** (`bank`, `player.inv`, `player.house` are the objects
themselves, not copies). That is fine for its two callers, both of which stringify it immediately.
Anything else that holds the result must deep-copy first.

---

## 4. `decodeSave` is deliberately forgiving

A save code travels through chat windows, phone keyboards and copy boxes. `decodeSave` therefore
strips all whitespace, matches the prefix case-insensitively, tolerates a smart-punctuated colon
(`ALDV1∶`, which iOS produces), skips leading prose, and drops any character outside the base64url
alphabet. `savetest` drives all five of those manglings. It still refuses rubbish rather than
half-applying it — a bad code returns an error string to the paste box and nothing is touched.

---

## 5. Traps that have already cost a bug

- **Removing an item from `ITEMS` is a save migration.** An orphaned id in an old save once took
  the whole banking UI down. `loadSlot` now sweeps dead ids out of the bank, the inventory *and*
  the ore pouch, and tells the player how many went. Same rule for house furniture ids
  (`houseSlots()`).
- **The pouch sweep ran one statement too early**, so it scrubbed the *default* pouch — always
  empty — and never looked at the loaded one. A dead ore id rode straight back in. Sweep **after**
  the assignment, always.
- **Prayer was clamped to 100 on load.** `maxPray()` is your Prayer *level* plus gear and the level
  cap has been 120 since the rescale, so a high-level character was quietly docked 20+ points on
  every single login. Clamp to the real pool, never to a literal. The same applies to stamina,
  whose ceiling rises to 240 with Agility (`AGI_ENERGY_TIERS`).
- **A record written but never saved is not a record.** The Gauntlet's best wave was set on every
  new high, fired `checkTitleUnlocks()`, and was thrown away at logout because nothing saved it.
- **Don't merge the save over the live object.** `Object.assign(player.skills, s.skills)` backfilled
  correctly but *merged*: a skill the save predates kept whatever was already there. No path
  reaches that today (`loadSlot` runs once, off the title screen, against a pristine player) but a
  "switch character" button would instantly hand character B character A's Agility. `loadSlot` now
  builds the skill set from `SKILLS`, taking the save's value only when it is a finite number.
- **`resetGame()` re-typed the skills literal by hand**, so every new skill had to be remembered in
  two places. It now resets nested defaults from `PLAYER_FRESH`, a JSON snapshot of `player` taken
  at declaration, before play begins. A new quest is reset for free.
- **Reset refuses to run indoors.** Clearing `player.house` while `inHouse` is true would leave the
  player standing in an interior that no longer exists.
- **The pack is always 28 slots.** A save code is text a player pastes; a truncated one can carry a
  short array, and everything that draws the pack indexes 0..27 directly. `loadSlot` normalises.

---

## 6. Adding a persistent field — the checklist

1. Put it on `player` (or, if it must be a global, in the `saveObject()` literal explicitly, as
   `_vaultSolved` and `musicSel` are).
2. Write it in `saveObject()`.
3. Read it in `loadSlot()`, defensively — old saves will not have it, so give it a default rather
   than letting `undefined` propagate into arithmetic.
4. Clear it in `resetGame()`.
5. Run `node harness/savetest.mjs`. If it is genuinely session-only, add it to `TRANSIENT` with the
   reason instead.
