#!/usr/bin/env bash
# ============================================================================
# Run every harness. This is the safety net — run it before and after any edit.
#
#   harness/run-all.sh          all of them
#   harness/run-all.sh sh mp    only harnesses whose name matches sh or mp
#
# Exit code is the number of failing harnesses, so `npm test` fails the way a
# test runner should. Files starting with `_` are library, not tests.
# ============================================================================
set -uo pipefail

cd "$(dirname "$0")/.." || exit 2

shopt -s nullglob
ALL=(harness/*.mjs)
TESTS=()
for f in "${ALL[@]}"; do
  base="$(basename "$f")"
  [[ "$base" == _* ]] && continue
  if [ "$#" -gt 0 ]; then
    keep=0
    for pat in "$@"; do [[ "$base" == *"$pat"* ]] && keep=1; done
    [ "$keep" -eq 1 ] || continue
  fi
  TESTS+=("$f")
done

if [ "${#TESTS[@]}" -eq 0 ]; then
  echo "no harnesses matched${*:+ ($*)}"
  exit 2
fi

# node --check the game once up front: every harness would fail the same way,
# and one clear syntax error beats forty confusing ones.
M_JS="${TMPDIR:-/tmp}/M.js"
node > "$M_JS" << 'EXTRACT' || exit 2
const fs = require('fs');
const s = fs.readFileSync('index.html', 'utf8');
const open = "<script>\n'use strict'";
const i = s.indexOf(open), j = s.indexOf('</script>', i);
if(i < 0 || j < 0){ console.error('run-all: no main <script> block in index.html'); process.exit(2); }
process.stdout.write(s.slice(i + 8, j));
EXTRACT
node --check "$M_JS" || { echo "run-all: index.html does not parse — fix that first"; exit 2; }

PASSED=(); FAILED=(); TOTAL_OK=0; TOTAL_N=0
W=0
for f in "${TESTS[@]}"; do n=${#f}; [ "$n" -gt "$W" ] && W=$n; done

for f in "${TESTS[@]}"; do
  out="$(node "$f" 2>&1)"
  rc=$?
  # every suite ends with "<name>: N/M passed"
  line="$(printf '%s\n' "$out" | grep -E '^[a-z0-9_]+: [0-9]+/[0-9]+ passed$' | tail -1)"
  nums="${line##*: }"; nums="${nums%% passed}"
  ok="${nums%%/*}"; n="${nums##*/}"
  if [[ "$ok" =~ ^[0-9]+$ ]]; then TOTAL_OK=$((TOTAL_OK+ok)); TOTAL_N=$((TOTAL_N+n)); fi

  if [ "$rc" -eq 0 ]; then
    PASSED+=("$f")
    printf '  %-*s  %s\n' "$W" "$f" "${nums:-ok}"
  else
    FAILED+=("$f")
    printf '  %-*s  FAILED\n' "$W" "$f"
    printf '%s\n' "$out" | sed -n '/^[0-9]* FAILED:/,$p' | sed 's/^/      /'
    # a crash prints no summary line at all — show the tail so it is diagnosable
    if [ -z "$line" ]; then printf '%s\n' "$out" | tail -12 | sed 's/^/      /'; fi
  fi
done

echo
echo "harnesses: ${#PASSED[@]}/${#TESTS[@]} green   assertions: ${TOTAL_OK}/${TOTAL_N}"
if [ "${#FAILED[@]}" -ne 0 ]; then
  echo "failing: ${FAILED[*]}"
  exit "${#FAILED[@]}"
fi
echo "all green. Offline logic and data only — visuals, feel and real multiplayer still need a browser."
