# 09 — Quests (21)

`QUESTS = [[id, name, giver, reward, info, statusFn]]`; progress in `player.quests[id]`
(`s` stage + flags). `questKill(r)` + interaction handlers advance stages.

## The list

| id | name | notes |
|---|---|---|
| tut | A Warm Welcome | Rector Matthews, the Rectory |
| m1–m5 | Steady Hands → The Pale Procession → The Beast of the Cage → The Hollow Dean → **The First Rector** | **The main line** — starts with Rector Matthews in front of the Rectory; m5's boss is `master` (hp130, shallow wilderness). The Wiki tells new players to do these five first. |
| larry, chef1–3 | The Missing Shipment; The Three Tables I–III | Larry/Coit cooking line |
| cq | The Training Table | Coach, boathouse (fishing) |
| dq | Here Be Dragons | Dragon Slayer shield |
| mish | Lost at Practice | Fitness Center |
| bozek | Trick or Treat | Pumpkin helmet |
| sos | Stronghold of Security | the SoS dungeon |
| swenson | Swenson's Standing Order | the granite quarry / mining pouch |
| rxmas, rxmas2 | A Rectory Christmas; Away in a Manger | the Christmas interiors arc |
| ember_skill | The Cinderworks | Emberdeep floor 1 |
| ember_combat | The Molten Gauntlet | Emberdeep floor 2 (gauntlet + wardens) |
| ember_puzzle | The Siphon Vault | Emberdeep floor 3 (vault puzzle) |

The Emberdeep trio gates progress toward the Heart / the Reforged Rector (19). Rewards for
older quests are unchanged from the earlier kit (gear + coins + XP per quest); read a quest's
`info`/`reward` fields for exact current values.
