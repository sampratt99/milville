#!/usr/bin/env python3
"""
edit_template.py — the canonical anchored-replacement edit pattern for milville.html.

USAGE: copy this, fill in the rep(...) calls with EXACT anchor strings you grepped fresh
from the file, run it, and CONFIRM the trailing "applied; delta:" print (that print — NOT a
passing node --check — is the only reliable proof the edit landed; see 03_DEV_WORKFLOW.md).

Then separately run the whole-file syntax check:
    sed -n '/^<script>$/,/^<\\/script>$/p' milville.html | sed '1d;$d' > /home/claude/M.js
    node --check /home/claude/M.js && echo "SYNTAX OK"
"""

p = 'milville.html'                       # run from /mnt/user-data/outputs
s = open(p, encoding='utf-8').read()
orig = len(s)

def rep(old, new, n=1):
    """Replace `old` with `new`, asserting `old` occurs exactly n times first."""
    global s
    c = s.count(old)
    assert c == n, f"expected {n} occurrence(s), found {c} of: {old[:70]!r}"
    s = s.replace(old, new, n)

# ---------------------------------------------------------------------------
# EDITS — anchor on EXACT current bytes. Remember:
#   * offsets shift after every edit; grep fresh.
#   * some strings store LITERAL escape text: match \\u2014 / \\u2019 / \\u00d7
#     (doubled backslash in Python) when the file stores the escape, not the char.
#   * prefer plain ASCII in NEW strings (rephrase to avoid apostrophes in single-quoted JS).
#   * to inject a guard before a single statement, anchor its start and prepend the `if`.
# ---------------------------------------------------------------------------

# Example (delete or replace):
# rep("player.pray-=T.cost;updateOrb();",
#     "player.pray-=T.cost;updatePrayOrb();")

# rep("if(it.heal)row('Heals',it.heal+' hp');\n  det.appendChild(rows);",
#     "if(it.heal)row('Heals',it.heal+' hp');\n  const _eff=itemEffect(id);if(_eff)row('Effect',_eff);\n  det.appendChild(rows);")

# ---------------------------------------------------------------------------
open(p, 'w', encoding='utf-8').write(s)        # SINGLE atomic write, must be last
print("applied; delta:", len(s) - orig)        # <-- confirm this prints with a sane delta
