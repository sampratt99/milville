# 01 — Game Overview

## Concept

Milville ("Milville — Old School Adventure") is a browser homage to **Old School RuneScape**:
click-to-move tile world, low-poly 3D from an angled overhead camera, skill grinding, OSRS
combat math (real attack/defence rolls, the combat triangle, prayers, special attacks),
quests, a Grand Exchange, Slayer, clue scrolls, magic + teleports — in one self-contained
HTML file with an original map and lore.

## Setting

A lightly fictionalized **St. Paul's School** (Concord, NH). ~51 real campus buildings are
in-game: the **Rectory** (home base), **Coit Dining Hall** (cooking), **Ohrstrom Library**,
**Sheldon**, the **Chapel of St. Peter & St. Paul** (prayer altar), **Turkey Pond +
Crumpacker Boathouse** (fishing), the **Athletic & Fitness Center**, dorm rows, and more.
Tone is wry and collegiate: Fac Brats, the Discipline Committee, Deans, and the First Rector.

## The world's four tiers (progression geography)

1. **Main campus** (safe) — gathering, shops, the GE, banks, quest hubs.
2. **The Wilderness** (past the ditch) — risk/reward: Slayer mobs, better drops, item loss on
   death (lostStash reclaim). The **western deep wilderness** adds mountains, Pat's Peak (snow),
   a valley, the Asylum, a bandit camp, the Swenson quarry, the agility ropes course, dragons,
   giants — and the **lava volcano**.
3. **The Emberdeep** (under the volcano, Agility 35) — endgame: quest floors (skilling /
   gauntlet / puzzle), fire mobs, **cinders + warrants** currencies, Hirschfeld's **luxury
   shop**, the **Ember all-style tank set**, and the **First Rector, Reforged** group boss.
4. **The Matthes Cage** — consensual PvP duels with an OSRS-style rules screen and cage-token
   cosmetics.

## The loop

Gather → train → quest (m1–m5 main line from Rector Matthews) → Slayer + wilderness grinding
→ dragons/demons → Emberdeep quests → gear via GE/luxury shop → the Reforged Rector with a
group → collection/mastery (level 99s, master capes, luxury flex items).

## Design philosophy

- **OSRS-faithful mechanics, original content.** Combat/prayer/magic now use OSRS-exact
  formulas; new mechanics should feel OSRS-plausible. Deliberate deviations exist and are
  documented (Ember set + Warden ring/Mountain shield = all-style tank gear for melee tanks).
- **Everything has an in-world source** (only `cape_black` is intentionally sourceless).
- **The wilderness (and now the Emberdeep) is the risk/reward engine.**
- **Legible gating**: quest/skill/gear requirements form a readable ladder.
- **Low-poly charm**: models are boxes/cylinders with tint+trim palettes.

## What "good" looks like for a change

Mechanically consistent (reuse `addItem`, `dropGround`, `addXp`, `lvl`, `inWild`, `eqStat`);
validated by an offline harness; honest about what needs eyes in a browser; journaled,
backed up (`.bak.<name>`), presented, with a cache-bust reminder.
