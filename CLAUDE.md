# Milville — working rules

Claude Code reads this file automatically at the start of every session. Everything here is a rule
that has already cost us a bug at least once.

## The shape of the project

- **One file**: `index.html` (~3.5 MB) — all CSS, DOM and game code. No build step, no modules.
  Only external dependency is Three.js **r128** from cdnjs (keep `crossorigin="anonymous"`).
- `mp-server/` — Cloudflare Worker + Durable Object relay. Client-only changes need no redeploy.
- `docs/` — the handoff kit. `docs/23_CONSTRUCTION_AND_POH.md` is the newest and largest system.
- `harness/` — ~40 offline Node test harnesses. These are the safety net; run them constantly.

## You cannot see the game run

No browser, no CDN. Verify logic and data with the harnesses. **Say plainly in every summary what was
verified offline and what needs Sam's eyes.** Visual work, feel, and anything multiplayer needs him.

## Before editing

1. `npm test` (or `harness/run-all.sh`) — know you are starting green.
2. `git status` — start clean.
3. **Re-grep exact bytes immediately before anchoring an edit.** Offsets go stale.

## Editing rules

- Prefer the Edit tool with a **unique** anchor. If an anchor is not unique, widen it.
- For scripted multi-edits, keep the count-assert pattern and the trailing `print("applied; delta: N")`
  — a failed assert means the file was never written, and a chained syntax check will still pass on the
  old file. **The delta print is the only proof an edit landed.**
- **Never slice between two anchors without checking what lives between them.** This has twice deleted
  neighbouring code — once 63 model branches (45 KB). `git diff` before committing catches it; look at
  the diffstat, not just the syntax check.
- Some strings store literal escape text (`\u2014`, `\u2019`) as backslash-u-hex. Do not write new
  blocks with Python raw strings — the escapes survive verbatim into the source and render as
  `Mill\u2019s` in game.

## After every edit

```bash
node -e "const s=require('fs').readFileSync('index.html','utf8');
  const i=s.indexOf(\"<script>\\n'use strict'\"), j=s.indexOf('</script>', i);
  require('fs').writeFileSync('/tmp/M.js', s.slice(i+8, j));"
node --check /tmp/M.js
npm test
git diff --stat        # <-- read this; it is how you catch a slice that ate a neighbour
```

## Commits and deploys

- **One commit per batch**, message describing what changed and why. The commit history replaces the
  old `.bak.<name>` convention — do not create `.bak` files.
- **Do not push without Sam's say-so.** He tests in the browser first. Pushing is the deploy.
- After a push, remind him to hard-refresh with a bumped `?v=` — most "it didn't work" reports are
  stale cache.

## Never

- Rename the save keys: `aldervale-slots-v1`, `aldervale-save-*`, `ALDV0:` / `ALDV1:`. Frozen forever.
- Split the single file.
- Use `THREE.CapsuleGeometry` or `OrbitControls` (r142+; we are on r128).
- Put anything destructive or costly first in an `optionsAt` list — the first option is what a **left
  click** runs.
- Remove an item from `ITEMS` without a save migration. Orphaned ids in an old bank crashed the entire
  banking UI.

## House rules for this codebase

- **Coordinates**: runtime = source + 112 (`WX=112`). Interiors are exempt. Read
  `docs/10_MAP_AND_WORLD.md` §1 before any map work.
- **Cylinders and tori are born upright.** A round face meant to hang on a wall needs
  `rotation.x = π/2` — use the `CD()` disc helper, not `C()`.
- **Item sprites go in `ITEM_ICON_PNG`**, UI/skill icons in `UI_ICON_PNG`. They draw in different
  coordinate spaces; misfiling produces an icon stuck in the corner of the inventory cell.
- **An interior living in a walkable dead zone must start hidden**, not become hidden on first visit.
- **A panel flag must never outlive its world.** Any world swap dismisses bank and shop.

## Tone for summaries

Say what shipped, what was verified, and what needs his eyes. Be specific about root causes rather
than symptoms — he will ask, and he is usually right when he pushes back.
