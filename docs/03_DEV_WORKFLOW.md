# 03 — Development Workflow (READ CAREFULLY)

## The environment

- Game file: **`/mnt/user-data/outputs/milville.html`** (the user-visible location).
- Scratch: `/home/claude/` (harnesses/scripts; resets between sessions).
- No browser, no CDN. Verify logic with Node.

## Session conventions (the user expects these)

- **Backup before each batch**: `cp milville.html milville.html.bak.<name>`.
- **journal.txt** (in outputs): append a dated entry per shipped batch — what/why/verified/
  caveats. **Plan docs** (e.g. `combat-osrs-plan.md`) hold compaction-proof state for
  multi-stage efforts; keep them current.
- `present_files` the html (and any updated plan doc) at the end of each batch.
- Summaries: what shipped, what was verified, what needs the user's eyes/playtest
  (visuals; multiplayer needs 2+ browsers, group-boss needs 3–4), remind hard-refresh + `?v=`.

## Making an edit: anchored replacement

```python
p='milville.html'
s=open(p,encoding='utf-8').read(); orig=len(s)
def rep(old,new,n=1):
    global s
    c=s.count(old); assert c==n, f"expected {n} got {c}: {old[:60]!r}"
    s=s.replace(old,new,n)
rep("EXACT_OLD_STRING","NEW_STRING")
open(p,'w',encoding='utf-8').write(s)      # single atomic write, LAST line
print("applied; delta:", len(s)-orig)      # <-- the ONLY reliable success signal
```

### The gotchas (hard-won — do not relearn these)

1. **Silent-failure trap**: a failed assert means the file was NEVER written — but a chained
   `node --check` still passes (it checks the old file). Only the trailing delta print proves
   the edit landed.
2. **Offsets shift after every edit** — re-grep exact bytes immediately before anchoring.
3. **Literal escape text**: many strings store `\u2014`/`\u2019` as literal
   backslash-u-hex bytes. Match `\\u2019` in Python; prefer writing plain ASCII or literal
   escapes in new strings.
4. **Anchors must be unique** (assert the count; widen the anchor if not).
5. **Overwriting whole files**: `create_file` fails on existing paths — use
   `cat > path << 'EOF'` heredocs or read-modify-write.
6. **After every edit**: re-extract M.js and `node --check` (as a separate observable step).
7. **Check the byte delta, not just the syntax.** A slice between two anchors can silently eat the code
   between them — this has twice deleted neighbouring branches, once 63 model branches (45 KB), while
   `node --check` still passed. If the delta is not roughly what you expected, stop and diff.
8. **Never write a new block with a Python raw string.** Escapes like `\u2019` survive verbatim into
   the source and render as literal `Mill\u2019s` in game.
9. **Replace a branch by brace-matching its own end**, not by finding the next `}else if(` you assume
   follows it.

## Validating

Every logic/data change gets a Node harness (see 14 — including the **module-scope
injection** pattern that lets tests read module-internal state). Assert new behavior + a
couple of old behaviors (regression). Before/after matrices for balance changes (combat DPS,
drain rates, defence profiles) are the house style.
