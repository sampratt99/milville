# 16 — Multiplayer (the entire networked system)

Milville is single-player at its core, with a **multiplayer layer bolted on top** that is
**inert until configured**. Everything in this doc is additive: with no server URL set, the
game is byte-for-byte the original single-player experience. This doc is the complete map of
the networked system — architecture, the wire protocol, presence/streaming, the three social
phases (groups, group combat, trading), the test harnesses, and how to ship changes.

> **Golden rule, with two exceptions.** The MP layer is **client-authoritative** and the relay is a
> **dumb pipe**: presence, combat, groups, trading and PvP are all decided on the clients, which
> trust each other ("trusted-friends" model). That keeps the server free-tier-cheap and the game
> logic in one place.
>
> **Two subsystems break that rule deliberately, and you must not assume the old "the server stores
> nothing" line:**
>
> 1. **Shared-world state** (`world_state.js`) — the DO persists which mobs are dead and which
>    resource nodes are depleted, with respawn times, so a late joiner sees the same world (§12).
> 2. **The player market** (`market.js`) — a real order book with **server-held escrow**, matching,
>    a sell tax and a collect box. It is the one place in Milville where the server owns something
>    a player can lose (§13).
>
> Everything else is still relay-only. Anti-cheat and authoritative PvP would still mean moving
> logic server-side.

---

## 1. The big picture

```
  ┌────────────┐   WebSocket   ┌──────────────────────────┐   WebSocket   ┌────────────┐
  │  Client A  │ ◀───────────▶ │  Cloudflare Worker + DO   │ ◀───────────▶ │  Client B  │
  │ milville   │   JSON msgs   │  one Durable Object       │   JSON msgs   │ milville   │
  │  .html     │               │  == one "room" (world)    │               │  .html     │
  │  (MP IIFE) │               │  relays live play;        │               │  (MP IIFE) │
  └────────────┘               │  PERSISTS world state     │               └────────────┘
                               │  + the market order book  │
                               └──────────────────────────┘
                                     │            │
                                ctx.storage    KV (LB)
                             mob:/node:/mkt:*   board:<world>
```

The same Worker also answers two **plain-HTTP** APIs on the side, which is what lets them work for
players who are not connected — or not even online:

| Path | Handled by | Backing store |
|---|---|---|
| `/room/<world>` | `server.js` `Room` (WebSocket) | socket attachments (hibernation-safe) |
| `/mkt/*` | `market.js`, via `Room._market` | DO `ctx.storage` (`mkt:*`) |
| `/lb/*` | `leaderboard.js` | Workers KV, binding `LB` |
| `/` or `/health` | `server.js` | — (returns a version string) |

- The **client** is `milville.html` — the same single file. Inside it lives an injected
  **`MP` module** (an IIFE). When its config URL is empty, every method is a no-op and the
  game runs exactly as offline single-player.
- The **server** is a tiny Cloudflare Worker exporting one Durable Object class, `Room`. One
  Durable Object instance == one shared world. It relays messages between connected sockets
  and remembers only transient per-connection presence (which survives hibernation via socket
  *attachments*). It runs **no** game rules.

### Files & where they live

| Thing | Location | Notes |
|---|---|---|
| Client MP module | inside `index.html` (the `MP` IIFE) | ground truth; between the `>>> MULTIPLAYER MODULE` markers |
| Worker entry + relay | `mp-server/server.js` | the `Room` Durable Object; routes `/mkt/`, `/lb/`, `/room/` |
| Shared-world state | `mp-server/world_state.js` | **pure logic, no Cloudflare deps** — §12 |
| Player market | `mp-server/market.js` | **pure logic, no Cloudflare deps** — §13 |
| Leaderboard | `mp-server/leaderboard.js` | KV-backed HTTP API; also exports a standalone entrypoint |
| Server config | `mp-server/wrangler.toml` | DO binding `ROOM` (SQLite class), KV binding `LB` |
| Worker URL | `https://milville-mp.sampratt99.workers.dev` | health check returns a version string |
| Room id | `milville-mp-4` (current) via `MP_VERSION='mp-4'` | bumping the version forks a fresh world |

**`world_state.js` and `market.js` take no Cloudflare imports on purpose.** Both operate on an
abstract async store — `get(k)`, `put(k,v)`, `delete(k)`, `list({prefix}) -> Map` — plus an injected
`now()` clock. The DO wires in `ctx.storage` and `Date.now`; a test wires a Map-backed mock and a
clock it controls. That is the only reason either is testable offline at all.

> The server is deployed with `wrangler deploy` from the `mp-server/` folder (the user/Sam runs
> this; the sandbox can't deploy). **Client-only features need NO server redeploy** — they ride
> the generic relay (see §4).

---

## 2. The MP module (client side)

The module is a single IIFE assigned to a `const MP`, injected into the `<script>` just before
the game kicks off:

```js
const MP = (function () {
  const CFG = { url: '', room: '', ... };   // url==='' => fully inert
  // ...state, send(), handle(), frame(), API...
  return { connect, frame, onMobKilled, /* group/combat/trade API */, _handle, _sent, _test };
})();
```

**Inertness contract.** When `CFG.url === ''`:
- `connect()` does nothing, `active()` is false, `send()` is a no-op.
- `frame()` returns immediately.
- Every group/combat/trade entry point is gated on `active() && conn` (and most also on
  `groupInGroup()`), so single-player never touches a network path. This is what makes the
  single-player build **byte-identical**.

**Connection lifecycle.** `connect(url, room, identity)` opens the WebSocket, sends `join`,
and on `welcome` adopts the existing roster. A heartbeat `ping`/`pong` keeps the socket warm.
`disconnect` / socket close clears all remote state (players, claims, group, aggro, trade).

**The two seams that make it testable** (see §8): `MP._handle(msg)` feeds a message in as if it
arrived from the server; `MP._sent` is the array of messages the module tried to send;
`MP._test` exposes internal state getters/resetters.

---

## 3. Presence & streaming (the always-on layer)

This is the layer that exists whenever you're connected, group or no group.

- **Remote players (RP).** Each other player is an entry in a remote-player map, with a Three.js
  avatar group (body + gear + nameplate + chat bubble). Built lazily on first sighting.
- **Position** — `pos {x,y,h,run}` is streamed as you move (throttled). Peers interpolate.
- **Gear / action / hp** — `state {gear,act,hp,mhp}` is streamed when your equipment or action
  changes, so remote avatars show your armor/weapon and current action (woodcutting, fighting…).
- **Chat & emotes** — `chat {text}` (overhead bubble + chat log) and `emote {e}` (the emote
  animations from doc 15).
- **Mob streaming + claims.** Mobs are *not* server-owned. Instead, **the player fighting a mob
  "owns" and streams it**: `claim {m}` / `release {m}` mark ownership, and a throttled `mob {...}`
  message streams that mob's position/hp/fighting-state. Peers apply it via a **`mobOverride`**:
  for a mob a remote owns, the local AI is skipped and the streamed transform/hp is pinned. This
  keeps a fought mob consistent across screens. `isClaimedByOther()` stops two strangers from
  fighting the same mob (group members are exempt — see §6).

> **Why streaming exists:** without it, each client would simulate its own copy of every mob and
> they'd desync the instant someone hit one. Owner-streaming makes the *engaged* mob authoritative
> on one screen and mirrored on the others.

---

## 4. The wire protocol

All messages are JSON objects with a `t` (type) field. The server handles a fixed set and
**relays everything else generically**.

### Server-handled types (in `server.js`)

| `t` | direction | server does |
|---|---|---|
| `join` | C→S | stores presence; replies `welcome {you, roster}` to sender; broadcasts `join {p}` to others |
| `pos` | C→S | updates stored pos; broadcasts `pos {uid,...}` |
| `state` | C→S | updates gear/act/hp; broadcasts `state {uid,...}` |
| `chat` | C→S | broadcasts `chat {uid,name,text}` (clamped to 120 chars) |
| `emote` | C→S | broadcasts `emote {uid,e}` |
| `claim` / `release` | C→S | broadcasts mob ownership |
| `ping` | C→S | replies `pong` — but see the auto-response note below |
| `mobdead` | C→S | **persists** `mob:<i> -> respawnAt` in DO storage, then broadcasts |
| `node` | C→S | **persists** `node:<x>,<y> -> respawnAt`, then broadcasts |
| (socket close) | — | broadcasts `leave {uid}` |

Two server-side details that are easy to miss:

- **`join` may reply with a `snapshot`.** If the client's `join` carries `snap:1`, the server also
  sends `buildSnapshot()` — the shared-world state (§12). Clients that do not advertise `snap` never
  receive it, so older builds are completely unaffected.
- **`ping` is answered without waking the object.** The constructor calls
  `ctx.setWebSocketAutoResponse()` with the exact pair `{"t":"ping"}` → `{"t":"pong"}`, so the
  runtime replies itself and no wall-clock duration is billed. Idle players used to be charged for
  their own keepalives. **The request string must match the client's byte-for-byte** — the `case
  "ping"` handler survives only as a fallback.

### The generic relay (the important part)

```js
// server.js, default case:
default: {
  if (a.joined && typeof m.t === "string") {
    m.uid = a.uid;            // stamp the sender (clients can't spoof who)
    this._broadcast(m, a.uid);// fan out to everyone else, verbatim
  }
}
```

**Any new typed message a client invents is automatically relayed**, with the sender's `uid`
stamped on. This is why **groups, group combat, and trading required zero server changes** — they
are pure client features that pigg-back on this relay. The trade-off: the server can't enforce
anything about these messages.

### Client-only message types (ride the generic relay)

These are filtered **client-side**. Targeted messages carry a `to` field and each client ignores
those not addressed to it.

| Feature | types | notes |
|---|---|---|
| **Groups** (§6) | `ginvite`, `gaccept`, `gdecline`, `gsync`, `gleave` | `to`-filtered; `gsync` is a full last-write-wins roster snapshot |
| **Group combat** (§7) | `ghit {m,d}`, `mobatk {m,to}` | `ghit` = forwarded damage to the mob's owner; `mobatk` = owner tells a groupmate the mob hit them |
| **Trading** (§7→§8 below) | `treq {to}`, `toffer {to,items}`, `taccept {to,stage}`, `tdecline {to}` | `to`-filtered two-party handshake |

> **Pattern for a new client-only feature:** invent `t` values, send them with `send({t,...})`,
> handle them in the module's `handle()` switch, and (if point-to-point) include a `to:uid` and
> drop messages where `to !== player.uid`. No server work needed.

---

## 5. Groups, combat, trade — phase history

The social layer shipped in four phases. Phase 1 was the presence/streaming layer above. Phases
2–4 are below. **All are client-only.** Every group path is gated on `groupInGroup()` so solo play
is untouched.

---

## 6. Phase 2 — Group membership

- **State:** `group = { roster:[{uid,name}], invitesIn:Map, invitesOut:Map }`. `GROUP_MAX = 4`.
- **Invite flow:** right-click a player → "Invite to group" → `ginvite{to}`. The recipient sees an
  Accept/Decline row. On Accept, the **accepter** broadcasts a complete `gsync` roster snapshot;
  everyone adopts it (**last-write-wins** — whoever's accept lands last defines the roster).
- **Key functions:** `groupInGroup`, `isGroupmate(uid)`, `isGroupmateName(name)`, `groupCanInvite`,
  `groupInviteByUid/ByName`, `groupAccept/Decline`, `groupOnAccept` (broadcast gsync),
  `groupOnSync` (adopt if I'm in it, else clear), `groupLeave`, `groupOnPeerLeft` (collapse to solo
  if ≤1 left), `groupSnapshot`.
- **UI:** `renderFriends` grows a Group section + Invites section (Accept/Decline rows, member rows
  with a "Leave group" button, per-member Invite buttons). CSS lives in the `<style>` block.
- **Logout/disconnect:** a leaving player's `leave` also drops them from groupmates' rosters;
  disconnect clears the whole group.

---

## 7. Phase 3 — Group combat

The hard one. Design: **single-owner authority + damage forwarding + owner-side aggro + instanced
loot.** Solo play is byte-identical (the only non-group code touched was a behaviour-preserving
extraction of mob death/loot into `mobDie()` / `dropMobLoot()`).

**Ownership (one owner per mob).** Among group members fighting a mob, the **smallest-uid** member
owns it. `manageClaims()` and the `claim` handler use a uid tiebreak so two members never both
own/stream the same mob (no deadlock, no double-stream). `isClaimedByOther()` exempts groupmate
claims so members may co-fight. A co-attacker **never streams** the shared mob — a `frame()` guard
nulls `myMob` when a groupmate owns it; only the owner streams its authoritative position/hp.

**Shared HP via damage forwarding.** A co-attacker shows their own hitsplat + earns their own XP
locally, then `groupForwardHit()` sends `ghit {m,d}` to the owner and returns early (skipping the
local hp/death path). The owner's `ghit` handler applies `d` to the shared hp, records aggro, and
on a lethal hit calls `mobDie(r, true)`. The owner records their *own* hits via `groupAggroSelf()`.
Net effect: one HP bar that everyone depletes together.

**Owner-side aggro → who the mob hits.** The owner runs a decaying per-attacker damage accumulator
(`mobAggro: Map(mi → {acc, target, t})`, `GROUP_HALF_LIFE = 8000ms`, `GROUP_SWITCH_MARGIN = 1.20`
for hysteresis so it doesn't thrash on near-ties). Each owner swing consults
`groupMobSwingTarget(mi) = aggroPick`. If the leader is a groupmate, the owner sends `mobatk {m,to}`
and **skips local owner-damage**; the victim's `incomingMobHit()` rolls the mob vs **their own**
defence, splats, auto-retaliates, and dies if 0. If the leader is the owner (or solo), the existing
local path runs unchanged. The mob stays in the melee at the owner; the group clusters and the mob
distributes swings by accumulated damage — i.e. **tank-swapping**.

**Instanced loot (no `rollRareDrop` refactor).** Each participant rolls their **own** drops on
death. A co-attacker tracks mobs it forwarded hits to in `_coAttacked: Map(mi → t)`; when such a
mob dies (detected on `mobdead` / mob-gone-dead, deduped, 12s recency) it calls `groupCoLoot(r)` →
`dropMobLoot(r)` locally. The owner rolls theirs in `mobDie()`. `addItem`/`dropGround` land in each
roller's own inventory/ground, so loot is private and fair.

**Known v1 limitations (documented, acceptable):**
- Co-attackers get XP + instanced loot but **not** kill-count / questKill / Slayer credit (owner-only).
- The gargoyle rock-hammer "stone-hide" rule is bypassed for forwarded group damage (rare endgame).
- A redirected mob's projectile (ranged/magic mobs) still visually launches toward the owner (cosmetic;
  early group mobs are melee).
- Ownership transfer mid-fight (owner stops, a smaller-uid mate takes over) can briefly flicker the stream.

### Trading (the fourth phase)

**OSRS two-stage commit, client-only, two-party `to`-filtered.** A mutual `treq{to}` opens the
window. **Stage 1 (offer):** either side edits; **any change resets BOTH accepts** (the anti-scam
protection). **Stage 2 (confirm):** read-only; both Accept again; then the inventory swap runs on
**both** clients off the synced offers.

- **Messages:** `treq{to}`, `toffer{to,items:[{id,qty}]}` (resets both accepts), `taccept{to,stage}`,
  `tdecline{to}`.
- **Module owns the state machine** (`trade = {active,withUid,withName,stage,myOffer,theirOffer,
  myAccept,theirAccept}`, plus `tradeReqIn/Out`); **game owns inventory logic + modal UI**
  (`tradeOffer/tradeUnoffer`, `tradeExecute(give,receive)`, `tradeCanReceive(receive,give)` which
  simulates on an inventory clone to block a swap that wouldn't fit, `renderTrade`).
- **Untradeables** blocked by `isTradeable(id)` (noTrade/noSell/Read-primary/quest items). Noted
  items (banknotes) are excluded from the offer grid in v1.
- **Known v1 limits:** no timed lock after a change (the accept-reset is the protection); no movement
  lock (only partner logout cancels); identical non-stackables show aggregated as one counted cell.

---

## 8. Testing the MP layer (offline)

You **cannot** run the live socket offline. Instead, the extracted module is loaded into Node with
mocked globals and driven directly. This catches all the *logic* (protocol handling, state machines,
ownership math, aggro) — never the *networking/feel*, which needs two live browsers.

### The harness pattern

1. Re-extract the shipped module every session:
   ```bash
   sed -n '/^<script>$/,/^<\/script>$/p' /mnt/user-data/outputs/milville.html | sed '1d;$d' > /home/claude/M.js
   awk '/MULTIPLAYER MODULE \(injected\)/{f=1;next} /<<< MULTIPLAYER MODULE <<</{f=0} f' /home/claude/M.js > /home/claude/mp/shipped_mp.js
   ```
2. The harness loads `shipped_mp.js` via `new Function(...)` with **mocked globals**: a fake
   `player {uid,name}`, `rats` array, `splats`, `renderFriends`, `logSay`, a `chatEl`, `THREE`
   stubs, `MOB_KINDS`, a deterministic `CLOCK` so module `now()` is controllable, etc.
3. Drive it with `MP._handle(msg)` (inbound) and inspect `MP._sent` (outbound) + `MP._test` getters.

### Two gotchas that will bite you

- **`logSystem` is shadowed.** The module defines its *own* local `function logSystem(text)` that
  writes to the mocked `chatEl`. A `globalThis.logSystem` mock is **useless** (shadowed). Assert
  system-chat by reading `chatEl.children[last].textContent`.
- **Game-side functions are free vars → `globalThis`.** Functions the module calls but does NOT
  define (`mobDie`, `incomingMobHit`, `groupCoLoot`, `tradeExecute`, `tradeCanReceive`, `renderTrade`)
  resolve to `globalThis` when mocked — so you **can** mock them to verify dispatch. They're called
  behind `typeof X === 'function'` guards, so when unmocked they're simply skipped (the real game
  defines them as hoisted declarations, so they resolve there).

### What is actually committed today

**None of the MP harnesses listed in earlier versions of this doc exist in the repo.** `mptest`,
`grouptest`, `tradetest`, `worldstate_test` and the rest were session-scratch files under
`/home/claude/` and did not survive. The committed suite is `harness/` (see `docs/14`), and its only
MP coverage is:

| Harness | Covers |
|---|---|
| `mphouse` | the seven-case house visibility matrix, through the `MP._test` seam |

`MP._test` exposes `{room, remoteHere, setPeerRoom, setConn, ...}`, which is the seam any future MP
harness should drive. **`world_state.js` and `market.js` have no harness at all** — they are the
most testable code in the project (pure functions over an injectable store and clock, exactly as
their headers advertise) and the most consequential, since the market is the one place the server
holds something a player can lose. That gap is worth closing before the next market change.

---

## 9. Deploying multiplayer changes

- **Client-only change** (groups/combat/trade/presence tweaks): just ship `index.html` like any
  other patch — bump `?v`, hard-refresh. **No server redeploy.**
- **Server change** (new server-handled type, world-state storage, market logic): edit the file in
  `mp-server/`, then `wrangler deploy` from that folder (Sam does this; the sandbox can't reach
  Cloudflare). Bump `MP_VERSION` if you need a clean room, and **bump `MKT_BUILD` for any market
  change** so you can tell from `x-mkt-build` which build a client is talking to.
- **A market deploy is the one that can cost a player something.** The escrow lives in DO storage
  and the client has already removed the item from the pack by the time the server replies. Read §13
  before changing anything in `market.js`, and keep all four safety properties.
- **Live verification is mandatory for MP** — two browser tabs/devices joined to the same room.
  The offline harnesses prove logic, never live networking or feel.

---

## 10. Interaction with interiors (heads-up)

Interiors (doc 17) are a **local, non-instanced overlay** that physically lives in the deep-north
"dead zone" (x100–140, y1–15). Because `pos` streams raw `x,y`, a remote player who steps into the
Chapel/Party Room will, on your screen, appear teleported to that dead-north footprint rather than
truly "inside with you." MP does not currently instance interiors. If shared interiors matter later,
the move is to tag presence with a current-interior id and only render/peer players who share it.

---

## 11. Systems added since the original MP docs (July 2026 additions)

Everything above remains accurate. The following ride the generic relay (client-only; no
server redeploy was needed):

### PvP duels (the Matthes Cage) — see `20_PVP_MATTHES_CAGE.md`
Challenge handshake → OSRS-style rules screen (`duelSetupSnapshot` synced) → countdown → the
synchronized pit fight → death/forfeit → rewards. Message types: `dreq, ddecline, dbs, dhp,
dlv, dend, phit, pend`. PvP accuracy = the same `hitFromRolls` ratio as PvE (`_duelAcc`,
`duelSwing`).

### Overhead prayer sync
`MP.sendOverheadPrayer(id)` sends `{t:'pray', o:id|null}` on toggle/deactivate; receive sets
`r.ohPray`; remote draw happens beside the remote chat-bubble draw. Only cat-`protect`
prayers (protections + Retribution/Redemption/Smite) show overhead — OSRS-correct.

### Remote worn models for distinctive gear
`buildGearRig` builds crownM/grimoireM/mountainShieldM (identical geometry to the local
models); `applyRemoteGear` toggles them by the remote player's gear models
('crown'/'book'/'towershield') and tints via the MP module's own `tintG`. New flashy gear
must be mirrored here or other players won't see it. (Known gap: quivers.)

### Group boss: the Reforged Rector (CRITICAL ownership model)
- Rewards: killer path `rectorRewards` + co-attacker path `groupCoLoot`'s
  `master_reforged` branch — each member gets warrants + cinders + ~100k coins; **exactly one
  signet** per kill distributed via `MP.groupRectorSignet` (`rsignet`).
- **Mechanics are owner-scheduled** (siphon + chain clocks run on ONE client):
  `iOwnRector()` = claim owner; **no-claim fallback = lowest uid among self +
  `rectorArenaPlayers()`** (deterministic on every client). Never restore the old
  "no claim ⇒ everyone owns" — with 4 players it caused constant chain lightning and
  never-dark siphons. Self-healing pushbacks: receiving `rchainwarn` bumps your `_chainCd`;
  receiving `rpil` bumps `_siphonCd`. Types: `rchainwarn, rchain, rpil, rpdmg, rsignet`.
- Pillar-damage forwarding (`forwardPillarHit` → `rpdmg`) routes siphon hits to the owner.

### Current client message-type inventory (grep `t: '` for the live list)
`bdb brz chat claim cwsp dbs ddecline dend dhp dlv dmg dreq ebsy emote fire friended frz
gaccept gdecline ghit ginvite gleave gsync hello ifgn ifsp iroom join mob mobatk mobdead mtsp
node obj pend phit ping player pos ppop pray pset rchain rchainwarn release rp rpdmg rpil
rsignet sksp state sw taccept tdecline toffer treq wdln wdsp`

### House visiting (Construction arc — see `23_CONSTRUCTION_AND_POH.md` §8)

`_mpRoom()` returns `'house:'+houseOwnerUid()` inside a house and `null` outdoors, so two owners each
at home never share a room while a guest takes the owner's key. Types: `hreq` → `hdat` / `hdeny`,
plus `hevict` when the owner locks up. Client-only; no server redeploy.

**The open/locked flag rides `hello` as well as `state`.** It must: an idle player sends no `state`
messages at all (the keepalive is gated on having an action), so a neighbour would never learn the
door was open. The `mphouse` harness asserts a seven-case visibility matrix.

---

## 12. `world_state.js` — the shared world

**68 lines, no Cloudflare imports.** It answers one question: when a player joins mid-session, what
does the world already look like?

### What is stored

Two key spaces in the DO's `ctx.storage`, both holding an **absolute** server timestamp:

| Key | Value | Written by |
|---|---|---|
| `mob:<index>` | respawn-at, in server ms | the `mobdead` handler |
| `node:<x>,<y>` | respawn-at, in server ms | the `node` handler |

### The one design decision that matters

**The snapshot sends REMAINING milliseconds, never absolute times.** `buildSnapshot()` computes
`respawnAt - now()` per entry and ships that. A joining client never has to reconcile clock skew
against the server or against other players — it just learns "this mob is back in N ms". If you ever
change the wire shape here, keep that property; absolute times would desync every client whose clock
drifts.

### The API

| Function | Does |
|---|---|
| `recordMobDead(store, now, m, rs)` | validates and stores `mob:<m>` = `now() + clamp(rs)`; returns false on a bad index |
| `recordNode(store, now, x, y, rs)` | same for a tile; both coords must be integers in 0..4095 |
| `buildSnapshot(store, now)` | returns `{t:'snapshot', mobs:[{m,rs}], nodes:[{x,y,rs}]}` and **lazily GCs** anything already expired |
| `clearMob(store, m)` | drops a `mob:` key early, for a mob reported back alive |

### Clamps and why they are where they are

- `HOUR = 7200000` (two hours) is the ceiling on any respawn, **raised from one hour for
  Cinderwing's 2h respawn**. The client's own `MAX_RS` must match; if you lengthen a boss respawn
  past this, a joiner will see it come back early.
- `validMob` accepts 0..99999; `validTile` accepts 0..4095. Both are cheap guards against a malformed
  or hostile client filling storage with junk keys — the relay trusts clients everywhere else, so
  this is the one place where a bad message would otherwise cost money rather than just look wrong.
- Expired keys are only ever collected **inside `buildSnapshot`**, which is a write-and-read. There
  is no timer and no alarm; a world nobody joins keeps its dead keys until someone does.

---

## 13. `market.js` — the player market (the one authoritative system)

**301 lines, no Cloudflare imports.** A cross-server order book for player-to-player trades of *any*
item, including boss drops the NPC Grand Exchange does not stock. It runs over **plain HTTP, not the
WebSocket**, precisely so a buyer can match a seller who is offline — or asleep.

Routed at `/mkt/*` to a **separate DO instance** from the live room: `env.ROOM.idFromName(world +
"-mkt")`. The order book therefore lives beside that world's state but not inside the socket room.

### The escrow model

This is the part to understand before touching anything:

- Listing a **sell** removes the item from the seller's pack **client-side**; the server holds the
  listing.
- Listing a **buy** removes the coins client-side; the server holds the listing.
- When two offers match, neither side is paid directly. Everything owed lands in the counterparty's
  **collect box** (`mkt:collect:<uid>`), claimed later from the market tab.

**Nothing is created or destroyed by matching — one side's escrow becomes the other's payout.** A
2% sell tax (`TAX`) is taken from the *seller's* proceeds and simply vanishes; that is the coin
sink, and it is the only value that leaves the system.

### Storage keys

| Key | Holds |
|---|---|
| `mkt:offer:<id>` | a resting offer |
| `mkt:collect:<uid>` | that player's pending payouts |
| `mkt:pending:<uid>` | a delivered-but-unacked payout batch (see two-phase collect) |
| `mkt:seq` | monotonic offer-id counter |

### Matching rules

- A **sell** matches buys priced **≥** its ask, best (highest) buy first.
- A **buy** matches sells priced **≤** its bid, best (lowest) sell first.
- Ties break **oldest-first** (FIFO fairness).
- Trades execute at the **resting order's** price — the party who waited gets their posted price and
  the taker gets the price improvement. A taker who bid above the exec price is refunded the
  difference into their own collect box.
- `MAX_OFFERS_PER_UID = 8`, mirroring OSRS's eight GE slots. `OFFER_TTL` is 14 days.

### Four hard-won safety properties — do not remove any of them

1. **Collision-proof offer ids.** The id was once `(mkt:seq | 0) + 1`. If that key ever read stale,
   every new listing computed the *same* id and `put()` silently overwrote another player's resting
   offer — their escrowed item annihilated, with no refund, no board entry and no collect. **That is
   the production bug that ate a player's emberbrand.** The id is now anchored to the offers that
   actually exist (`max(seq, maxExistingId) + 1`), and there is a further belt-and-braces loop that
   steps past any live offer already sitting at the target id rather than clobbering it.
2. **The GC sweep is serialized.** `_gcSweep` reaps expired offers and refunds them. It used to run
   inside `board()` — a plain un-serialized GET — so two concurrent board reads could **both** refund
   the same expiring offer (a dupe), or interleave with a `listOffer` mid-match against it. `board()`
   is now a **pure read** that merely skips expired rows, and the sweep runs only inside the
   serialized mutation chain.
3. **Two-phase collect.** `collect()` used to delete the box and *then* return it, so a lost response
   burned every pending payout forever. Now the box is **moved** to `mkt:pending:<uid>` with a nonce
   and returned; the client credits the items and calls `/mkt/ack`, which deletes the record. A lost
   response simply re-delivers next time. Old cached clients that will never send an ack are served
   by a **legacy one-shot path** (`twophase` falsy) — re-delivering to them would double-credit on
   every click, which is worse than the lost-response window they already lived with.
4. **The write-confirm guard** (in `server.js`, not `market.js`). The client escrows the item
   *before* the server replies and only keeps it removed on `ok:true`. DO storage writes are
   coalesced and can, rarely, not land even though the in-memory logic succeeded. So before
   confirming a list, the handler calls `store.sync()` and **reads the offer back**; if it is not
   there it downgrades to `ok:false` so the client refunds. This converts silent item loss into
   "the offer didn't place, here's your item".

`_mergePayout` never truncates: a payout past `MAX_COLLECT` (400 *distinct* lines) is refused rather
than silently dropped, because truncation destroyed real payouts. Coins and identical items merge,
so a real player never approaches the cap.

### Concurrency

All mutations go through one in-flight promise chain in `Room._market`:

```js
this._mktChain = Promise.resolve(this._mktChain).catch(() => {}).then(run);
```

`/mkt/board` and `/mkt/mine` are reads and deliberately bypass it. **Anything that mutates escrow
must go through the chain** — that is what stops two concurrent listings double-spending.

### Versioning

`MKT_BUILD` in `server.js` (currently `mkt5`) is returned on every market response as both the
`x-mkt-build` header and a `v` field. **Bump it with any market change**; it is how you tell whether
a client is talking to the build you think it is.

---

## 14. `leaderboard.js` — the scoreboard

KV-backed, plain HTTP, no DO. `POST /lb/submit` and `GET /lb/top?world=&cat=&n=`. Fifteen
categories, capped at `MAX_ENTRIES = 500` stored players (stalest records dropped first by
timestamp).

Two properties worth knowing:

- **Counters are monotonic.** On submit, every numeric field is `max(incoming, stored)`, so a stale
  or freshly-reset client resubmitting lower numbers cannot wipe real progress.
- **Scores are client-submitted and therefore forgeable**, within the clamps. The file says so
  itself. For a friends' server that is accepted; real anti-cheat would mean computing scores
  server-side, which this game is not built for.

It exports both `handleLeaderboard(request, env)` (merged into the relay, which is what we do) and a
standalone `default` entrypoint that is currently unused.
