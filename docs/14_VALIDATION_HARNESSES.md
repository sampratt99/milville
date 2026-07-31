# 14 — Validation Harnesses (offline testing)

Harnesses live in `/home/claude/` (ephemeral — regenerate each session). Two patterns:

## Pattern A — extraction (old style, still fine for pure functions)
Brace-match a function out of M.js, stub its deps, assert behavior.

## Pattern B — module-scope injection (the workhorse; USE THIS)

The game is one giant module scope; most state (`ITEMS`, `MOB_KINDS`, `prayers`,
`PRAYER_META`, `SPELLS`, `player`, helpers) is module-internal. Append an IIFE to the code
string so your test runs INSIDE that scope:

```js
// harness.mjs
import fs from 'fs';
// 1) a persistent DOM/THREE shim (Proxy-based document/canvas 2D/THREE stubs) — keep one
//    at /home/claude/shim.txt and cat it in front of this file when building the harness.
let code = fs.readFileSync('/home/claude/M.js','utf8');
code += `
;globalThis.__T=(function(){
  const o={};
  o.maxPray = maxPray();                     // read module functions/state directly
  prayers.halcyon = true; o.mult = prayerMult('atk');
  o.reach = (player.equip.weapon={id:'ashfang_kindled'}, player.style='longrange', playerReach());
  return o;
})();`;
new Function(code)();
console.log(JSON.stringify(globalThis.__T));
```

Rules of the pattern:
- The injected IIFE can touch anything in module scope; it CANNOT reference harness
  variables (like the outer `code`) — do source-string checks (`SRC.includes(...)`) OUTSIDE.
- Extract fresh every time:
  `sed -n '/^<script>$/,/^<\/script>$/p' milville.html | sed '1d;$d' > /home/claude/M.js`
- Filter runtime noise:
  `| grep -vE "musicMaster|exponentialRamp|startMusic|updateMusic|Timeout|listOnTimeout|processTimers|Node.js|setInterval|^    at " | tr -cd '[:print:]\n'`
- The shim's canvas 2D context supports the icon drawers — loop every icon id and assert no
  throw (the standard "all N icons draw clean" check).
- Balance work ships with **before/after matrices** (DPS parity, drain/regen tables, defence
  profiles per armour family) — house style.

## What harnesses can/can't prove
CAN: logic, data tables, formulas, icon/model construction, UI render functions executing,
message-handler wiring (source checks). CAN'T: WebGL appearance, CSS layout, feel, real
multiplayer (2+ browsers), group-boss dynamics (3–4 players). Say so in the summary.

## The Construction suite (~40 harnesses)

`slottest` (placement rules) · `contest` · `sawtest` · `poh15` · `furntest` · `roomtest` · `funcfurn` ·
`bmodetest` · `walktest` · `housepanel` · `wintest` · `floortest` · `containtest` · `roomstest` ·
`visittest` · `housetest` · `butlertest` · `butlerwalk` · `xptest` · `pricetest` · `shiptest` ·
`mphouse` · `spawntest` · `repairflow` · `doortest` · `focustest` · `upgradetest` · `discs` ·
`iconaudit` · `orphantest` · `banktest` · `lobbyvis` · `conunlock` · `skillfix` · `roomui` ·
`sawicon` · `deedtest` · `fivefix` · `newfunc` · `darylitest`

Three are worth running after almost any change:
- **`shiptest`** — walks the whole Construction chain in one pass, saw to butler.
- **`mphouse`** — the seven-case multiplayer visibility matrix.
- **`iconaudit`** — draws every item icon five times and asserts the canvas stack returns to zero.

**A note on shim limits.** The Proxy DOM cannot persist `classList` or read back `.visible`, and the
THREE stub makes `rotation` a function rather than an object — so limb angles and mesh visibility are
not readable in-process. When a check needs those, assert the behaviour at **source** instead, and say
so in the test name. Several false alarms this arc came from testing the shim rather than the game.
