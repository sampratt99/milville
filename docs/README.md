# Milville — Handoff Kit

Start with **`00_START_HERE.md`**.

`CLAUDE.md` is not part of the kit proper — it belongs at the **repo root**, where Claude Code loads
it automatically at the start of every session.

Suggested repo layout:

```
milville/
  index.html          the game (single file)
  CLAUDE.md           working rules — from this kit
  mp-server/          Cloudflare Worker relay
  docs/               everything else in this kit
  harness/            the ~40 offline Node harnesses + shim.txt
```
