#!/usr/bin/env python3
"""
model_harness_template.py — offline harness for 3D MODEL / ICON construction changes.

You cannot render WebGL offline. The most you can verify is that model/icon-building code
runs without throwing for every relevant id, and that it makes the expected primitive/canvas
calls. Stub THREE.js (r128-shaped), the bake helpers, and the canvas ctx.

Adapt the function under test (buildObjModel / makeGroundItem / drawItemIcon) and the ids list.
"""
import re, subprocess

GAME = '/mnt/user-data/outputs/milville.html'
src = open(GAME, encoding='utf-8').read()
i = src.index("const objAt="); e = src.index(";", i) + 1
prefix = src[src.index("'use strict';"):e]

def fn(name):
    i = src.index('function ' + name + '(')
    j = src.index('{', i); d = 0; k = j
    while k < len(src):
        if src[k] == '{': d += 1
        elif src[k] == '}':
            d -= 1
            if d == 0: return src[i:k+1]
        k += 1

target = fn('drawItemIcon')     # <-- EDIT: e.g. makeGroundItem, buildObjModel

harness = r"""
'use strict';
__PREFIX__

// ---- THREE r128-shaped stub ----
const THREE={
  Group:class{constructor(){this.children=[];this.position={set(){},x:0,y:0,z:0};this.scale={x:1,y:1,z:1,setScalar(){}};this.rotation={set(){},x:0,y:0,z:0};}add(){}},
  Mesh:class{constructor(){this.position={set(){},x:0,y:0,z:0};this.scale={setScalar(){}};this.rotation={set(){}};}},
  BoxGeometry:class{}, CylinderGeometry:class{}, SphereGeometry:class{}, ConeGeometry:class{},
  PlaneGeometry:class{}, BufferGeometry:class{setAttribute(){}toNonIndexed(){return this;}clone(){return this;}get index(){return null;}},
  Float32BufferAttribute:class{}, Vector3:class{set(){return this;}}, Color:class{},
  Quaternion:class{setFromEuler(){return this;}}, Euler:class{set(){return this;}},
  MeshStandardMaterial:class{}, MeshBasicMaterial:class{}, CanvasTexture:class{},
};
function bake(){} function bakeMesh(){return new THREE.Mesh();}
function tileHash(){return 0.5;} function groundH(){return 0;}
function addProxy(){} const scene={add(){}}; const sway=[]; const PROXY_MAT={};
function capeIconTexFor(){return {};}

// ---- canvas ctx mock that records what was drawn ----
function mockCtx(){
  const log={fills:[],strokes:[]};
  return new Proxy(log,{get:(t,k)=>{
    if(k==='__log')return t;
    if(k==='canvas')return {width:32,height:32};
    if(typeof k==='string' && /Style$/.test(k)) return undefined;
    if(k==='createLinearGradient'||k==='createRadialGradient')
      return ()=>({addColorStop(){}});
    return ()=>{};
  }, set:(t,k,v)=>{ if(k==='fillStyle')t.fills.push(v); if(k==='strokeStyle')t.strokes.push(v); return true; }});
}

__TARGET__

// ---- assertions: every id constructs without throwing ----
let P=0,F=0; function ok(c,m){ if(c)P++; else { F++; console.log('FAIL:', m); } }
for(const id in ITEMS){
  try { drawItemIcon(mockCtx(), id, 32); P++; }      // <-- EDIT to your target fn
  catch(e){ F++; console.log('THREW for', id, '->', e.message); }
}
console.log('\nRESULT', F? ('FAILED '+F) : ('all '+P+' ids construct OK'));
"""

harness = harness.replace("__PREFIX__", prefix).replace("__TARGET__", target)
open('mharness.js', 'w').write(harness)
r = subprocess.run(['node', 'mharness.js'], capture_output=True, text=True)
print(r.stdout)
print("ERR", r.stderr[:600])
