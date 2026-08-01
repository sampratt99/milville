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
third leaves it behind when a character is reset — which is how "Reset progress" came to leave the
cottage standing, every quest finished and the whole Emberdeep unlocked.

**`resetGame()` is no longer wired to any button** (that control was removed in Aug 2026: a
two-click arm-and-fire that destroys a character is risk with no upside — a player who wants to
start over deletes the slot on the title screen). The function stays as the save's mirror and as the
oracle `savetest` measures against, so the third leg of the rule still holds.

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
| `resetGame()` | The mirror of `saveObject()`. Not reachable from the UI — see §1. |

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
  `ITEMS`. What it must not do is *leave* `ITEMS` — see §6.

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

## 5. Mobile, desktop, and moving between them

The whole point of a code is that it crosses devices, so both halves must survive the weaker
platform:

- **`CompressionStream` is not universal.** It landed in Safari 16.4. An older phone therefore
  exports the plain `ALDV0:` form — longer, but readable everywhere. A desktop always gzips to
  `ALDV1:`. Phone→desktop is fine; **desktop→old phone needs a decompressor**, so `decodeSave`
  checks for `DecompressionStream` and says *"this browser is too old to unpack it"* rather than
  letting a raw `DecompressionStream is not defined` reach the paste box.
- **Safari drops the user gesture across an `await`.** Building a code is async, so
  `await encodeSave(...)` then `navigator.clipboard.writeText(...)` is refused on iOS — "Copy save
  to clipboard" quietly copied nothing. `exportSaveToClipboard` now claims the clipboard
  *synchronously inside the tap* with `new ClipboardItem({'text/plain': promise})`, which exists for
  precisely this case, and keeps `writeText` and `legacyCopy` behind it.
- **iOS will not copy from a readonly, off-screen textarea.** The desktop recipe returns false on
  iPhone. `legacyCopy` puts an invisible 1px field *in* the viewport, makes it `contentEditable` and
  not readonly, and selects it with a Range as well as `setSelectionRange`. Its font is 16px, below
  which iOS zooms the page on focus.
- **The paste box must not autocorrect.** base64url is case-sensitive; `#importfield` carries
  `autocapitalize="none" autocorrect="off" spellcheck="false" autocomplete="off"`.
- **Importing works with no storage at all.** iOS private browsing makes `localStorage` throw, so
  `STORE` is null and autosave is off — but `loadSlot(id, preObj)` takes the decoded object
  directly, so a player can still paste a code in and play the session.
- **This is also why codes matter on iOS at all**: Safari evicts localStorage for sites that are not
  installed to the home screen after about a week of no visits. The autosave is not a backup; the
  code is.

`savetest` drives all of this by deleting `CompressionStream`/`DecompressionStream` off `globalThis`
and putting them back, and asserts the clipboard and paste-box shapes at source — the buttons
themselves still need a real phone.

## 6. Traps that have already cost a bug

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
- **A record written but never saved is not a record.** The Molten Gauntlet's best wave was set on
  every new high, fired `checkTitleUnlocks()` and was thrown away at logout. Auditing *that* is what
  turned up the bigger fact: the whole wave minigame had been scrapped and its trigger object was
  never placed in the world. Both the field and the feature are gone — check a record is reachable
  before you plumb it into the save.
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

## 7. Adding a persistent field — the checklist

1. Put it on `player` (or, if it must be a global, in the `saveObject()` literal explicitly, as
   `_vaultSolved` and `musicSel` are).
2. Write it in `saveObject()`.
3. Read it in `loadSlot()`, defensively — old saves will not have it, so give it a default rather
   than letting `undefined` propagate into arithmetic.
4. Clear it in `resetGame()`.
5. Run `node harness/savetest.mjs`. If it is genuinely session-only, add it to `TRANSIENT` with the
   reason instead.
