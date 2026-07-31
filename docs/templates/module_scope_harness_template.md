# Module-scope injection harness (Pattern B — the workhorse)

```bash
cd /mnt/user-data/outputs
sed -n '/^<script>$/,/^<\/script>$/p' milville.html | sed '1d;$d' > /home/claude/M.js
node --check /home/claude/M.js
```

Build /home/claude/shim.txt ONCE per session: a Proxy-based stub of document/window/canvas-2d
(getContext returns an object whose every method is a no-op fn and every prop settable) plus a
minimal THREE stub (constructors return objects with position/rotation/scale vectors, .add(),
traverse()). Then:

```bash
printf "import fs from 'fs';\n" > h.mjs
cat /home/claude/shim.txt >> h.mjs
cat >> h.mjs << 'JS'
let code=fs.readFileSync('/home/claude/M.js','utf8');
code+=`
;globalThis.__T=(function(){
  const o={};
  // read/exercise ANY module-scope state or function here:
  o.itemCount=Object.keys(ITEMS).length;
  return o;
})();`;
new Function(code)();
console.log(JSON.stringify(globalThis.__T,null,1));
JS
node h.mjs 2>&1 | grep -vE "musicMaster|exponentialRamp|startMusic|updateMusic|Timeout|listOnTimeout|processTimers|Node.js|setInterval|^    at " | tr -cd '[:print:]\n' | tail -30
```

Rules: the IIFE sees module scope but NOT harness vars; do source-text checks on a separate
SRC string outside. Re-extract M.js after every edit.
