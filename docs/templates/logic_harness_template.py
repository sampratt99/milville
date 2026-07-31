#!/usr/bin/env python3
"""
logic_harness_template.py — build & run an offline Node harness for a LOGIC/DATA change.

Pattern: extract the function(s) under test from milville.html, prepend the "prefix"
(ITEMS + early data/helpers) and any stubs, append assertions, run with node.

Adapt GAME path, the function names in `need`, the stubs, and the test body.
See 14_VALIDATION_HARNESSES.md for the full stub library.
"""
import re, subprocess

GAME = '/mnt/user-data/outputs/milville.html'
src = open(GAME, encoding='utf-8').read()

# ---- prefix: 'use strict' .. objAt (ITEMS, OBJ_DEFS, tiles, map helpers, fmt, XP_TABLE, ...)
i = src.index("const objAt="); e = src.index(";", i) + 1
prefix = src[src.index("'use strict';"):e]

def fn(name):
    """Brace-matched extraction of `function name(...) {...}`."""
    i = src.index('function ' + name + '(')
    j = src.index('{', i); d = 0; k = j
    while k < len(src):
        if src[k] == '{': d += 1
        elif src[k] == '}':
            d -= 1
            if d == 0: return src[i:k+1]
        k += 1

def const_arrow(name):
    """Extract `const name = (...) => {...};` (brace match + trailing semicolon)."""
    i = src.index('const ' + name + '='); j = src.index('{', i); d = 0; k = j
    while k < len(src):
        if src[k] == '{': d += 1
        elif src[k] == '}':
            d -= 1
            if d == 0: break
        k += 1
    return src[i:src.index(';', k)+1]

# ---- functions this test needs (these are AFTER objAt, so not in prefix) ----
need = ['addItem', 'coinsCount', 'sellItem', 'renderSell', 'renderShopCoins']   # <-- EDIT
parts = []
for nm in need:
    code = fn(nm)
    if ('function ' + nm + '(') not in prefix:     # avoid double-declaration
        parts.append(code)

harness = r"""
'use strict';
__PREFIX__

// ---- stubs ----
let LOG=[]; function msg(t){LOG.push(t);}
const sfx=new Proxy({},{get:()=>()=>{}});
function audio(){}
let _inv=0; function renderInv(){_inv++;}        // stub if not extracted
function drawItemIcon(){}
function dropGround(){}
let dirty=false; let player; let shopOpen=false;
const performance={now:()=>0};
function showMenu(){}
// Some functions reference data defined AFTER objAt (so not in the prefix). Stub or extract
// as needed. e.g. renderSell references SELL_BLOCK — stub it, or extract the real array:
//   m=re.search(r"const SELL_BLOCK=\[[^\]]*\];",src); inject m.group(0) if not in prefix.
const SELL_BLOCK=[];

// DOM mock
function mkEl(){return {_html:'',children:[],style:{},
  classList:{add(){},remove(){},toggle(){}},
  set innerHTML(v){this._html=v; if(v==='') this.children=[];},
  get innerHTML(){return this._html;},
  appendChild(c){this.children.push(c); return c;},
  addEventListener(){}, getContext(){return new Proxy({},{get:()=>()=>{}});},
  setAttribute(){}, textContent:'', className:'', width:0,height:0,
  closest(){return null;}, dataset:{}};}
const ELS={}; function getEl(id){ if(!ELS[id]) ELS[id]=mkEl(); return ELS[id]; }
const document={ getElementById:getEl, createElement:()=>mkEl() };

__PARTS__

// ---- assertions ----
let P=0,F=0; function ok(c,m){ if(c)P++; else { F++; console.log('FAIL:', m); } }

// EXAMPLE test (edit):
player={inv:[{id:'coins',qty:100},{id:'iron_ore',qty:3}],equip:{},skills:{}};
renderSell();
function rowCount(){ return getEl('gesell').children.filter(c=>c.className==='gerow').length; }
ok(rowCount()===1, 'one sellable row before');
sellItem('iron_ore',3);
ok(player.inv.every(s=>!s||s.id!=='iron_ore'), 'iron_ore removed');
ok(rowCount()===0, 'sell list refreshed live');

console.log('\nRESULT', F? ('FAILED '+F+'/'+(P+F)) : ('ALL PASS ('+P+')'));
"""

harness = harness.replace("__PREFIX__", prefix).replace("__PARTS__", "\n".join(parts))
open('harness.js', 'w').write(harness)
r = subprocess.run(['node', 'harness.js'], capture_output=True, text=True)
print(r.stdout)
print("ERR", r.stderr[:600])
