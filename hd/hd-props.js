/* ============================================================================
   Milville HD — props.  Loaded after hd-chars.js.

   Rocks. The game's mining nodes and boulders are dodecahedra: twelve flat
   pentagons. Every DodecahedronGeometry under a world object becomes a
   boulder: an icosphere displaced by layered 3D noise, flattened where it
   meets the ground, with its normals recomputed so the stone texture the
   material classifier already gives it has real relief to sit on. The mesh
   objects and their materials (which the game recolours when a node is mined
   out) are untouched.

   Gameplay is untouched: nothing here reads or writes game state.
   ========================================================================== */
(function(){
'use strict';
try{performance.mark('hd:hd-props');}catch(e){}
const HD=window.HD;
if(!HD||!HD.ready)return;
if(typeof objects==='undefined')return;

/* 3D value noise on a wrapped lattice */
const NL=16,lat=new Float32Array(NL*NL*NL);
{let s=1337;for(let i=0;i<lat.length;i++){s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;lat[i]=((t^t>>>14)>>>0)/4294967296;}}
function n3(x,y,z){
  const xi=Math.floor(x),yi=Math.floor(y),zi=Math.floor(z);
  const fx=x-xi,fy=y-yi,fz=z-zi,sm=t=>t*t*(3-2*t),ux=sm(fx),uy=sm(fy),uz=sm(fz);
  const L=(a,b,c)=>lat[((((c%NL)+NL)%NL)*NL+(((b%NL)+NL)%NL))*NL+(((a%NL)+NL)%NL)];
  const c00=L(xi,yi,zi)*(1-ux)+L(xi+1,yi,zi)*ux,c10=L(xi,yi+1,zi)*(1-ux)+L(xi+1,yi+1,zi)*ux;
  const c01=L(xi,yi,zi+1)*(1-ux)+L(xi+1,yi,zi+1)*ux,c11=L(xi,yi+1,zi+1)*(1-ux)+L(xi+1,yi+1,zi+1)*ux;
  return (c00*(1-uy)+c10*uy)*(1-uz)+(c01*(1-uy)+c11*uy)*uz;
}
function fbm3(x,y,z){return n3(x,y,z)*0.55+n3(x*2.1,y*2.1,z*2.1)*0.28+n3(x*4.3,y*4.3,z*4.3)*0.17;}

const cache=new Map();
/* (an ore-vein shard cluster was tried in place of the game's octahedral crystals; the owner
   prefers the crystals, so shardCluster() is kept but unused) */
const shardCache=new Map();
function shardCluster(seed){
  const v=seed%5;if(shardCache.has(v))return shardCache.get(v);
  const R=(function(s){return function(){s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};})(seed|0);
  const parts=[];
  for(let k=0;k<4;k++){
    const h=0.1+R()*0.12,r=0.035+R()*0.03;
    const s=new THREE.CylinderGeometry(r*0.35,r,h,6,1).toNonIndexed();
    const tip=new THREE.ConeGeometry(r*0.35,h*0.35,6).toNonIndexed();tip.translate(0,h*0.5+h*0.175,0);
    for(const gg of [s,tip]){gg.translate(0,h*0.4,0);gg.rotateX((R()-0.5)*0.9);gg.rotateZ((R()-0.5)*0.9);gg.rotateY(R()*6.28);gg.translate((R()-0.5)*0.08,-0.06,(R()-0.5)*0.08);parts.push(gg);}
  }
  const g=mergeGeoms(parts);shardCache.set(v,g);return g;
}
/* A boulder the way RS3 models one: a handful of big, deliberate planes meeting at hard
   edges (flat-shaded facets on a coarse icosphere pushed by two octaves of large noise), a
   flattened bed where it meets the ground, one or two cleaved faces, and a broken skirt of
   small chips around the base. The stone texture then only adds grain to real shapes. */
function boulder(radius,seed){
  const key=radius.toFixed(3)+':'+(seed%7);
  if(cache.has(key))return cache.get(key);
  const R=(function(s){return function(){s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};})(seed|0);
  const g=new THREE.IcosahedronGeometry(radius,1).toNonIndexed();   /* 80 facets, flat shaded */
  const p=g.attributes.position;const o=seed*0.37;
  /* two cleavage planes: everything beyond them is pushed onto the plane */
  const planes=[];for(let k=0;k<2;k++){const a=R()*6.28,e=0.1+R()*0.5;planes.push([Math.cos(a)*Math.cos(e),Math.sin(e),Math.sin(a)*Math.cos(e),radius*(0.55+R()*0.25)]);}
  const sx=0.85+R()*0.5,sz=0.85+R()*0.5;
  for(let i=0;i<p.count;i++){
    let x=p.getX(i),y=p.getY(i),z=p.getZ(i);
    const l=Math.sqrt(x*x+y*y+z*z)||1;const nx=x/l,ny=y/l,nz=z/l;
    const big=n3(nx*0.9+o,ny*0.9+o*2,nz*0.9+o*3)-0.5,mid=n3(nx*2.2+o*3,ny*2.2,nz*2.2+o)-0.5;
    let r=radius*(1.0+0.42*big+0.16*mid);
    x=nx*r*sx;y=ny*r;z=nz*r*sz;
    for(const pl of planes){const d=x*pl[0]+y*pl[1]+z*pl[2]-pl[3];if(d>0){x-=pl[0]*d;y-=pl[1]*d;z-=pl[2]*d;}}
    if(y<-radius*0.35)y=-radius*0.35+(y+radius*0.35)*0.12;      /* the bed */
    p.setXYZ(i,x,y,z);
  }
  g.computeVertexNormals();
  /* chips around the base */
  const parts=[g];
  for(let k=0;k<5;k++){
    const c=new THREE.IcosahedronGeometry(radius*(0.1+R()*0.14),0).toNonIndexed();
    const a=R()*6.28,d=radius*(0.85+R()*0.35);
    c.rotateY(R()*6.28);c.rotateX(R()*0.6);c.translate(Math.cos(a)*d,-radius*0.32+radius*0.06,Math.sin(a)*d);
    c.computeVertexNormals();parts.push(c);
  }
  const merged=mergeGeoms(parts);
  cache.set(key,merged);
  return merged;
}
function mergeGeoms(list){
  const pos=[],nor=[];
  for(const g of list){const p=g.attributes.position.array,n=g.attributes.normal.array;for(let i=0;i<p.length;i++){pos.push(p[i]);nor.push(n[i]);}}
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));
  return g;
}
/* ------------------------------ signposts -------------------------------- */
/* The game's signpost is a square post, a stick arm, a small cone cap and the banner. It
   becomes a turned octagonal post with a plinth and a finial, a bracket with a diagonal
   brace and a ring, the banner untouched (the game sways it). */
function dressSign(g){
  if(g.userData.hdSign)return;g.userData.hdSign=1;
  const kids=g.children.slice();
  const post=kids.find(c=>c.geometry&&c.geometry.type==='BoxGeometry'&&c.geometry.parameters.height===1.7);
  const arm=kids.find(c=>c.geometry&&c.geometry.type==='BoxGeometry'&&c.geometry.parameters.width===0.74);
  const cap=kids.find(c=>c.geometry&&c.geometry.type==='ConeGeometry');
  if(!post||!arm)return;
  const pts=[];
  const prof=[[0.09,0],[0.09,0.08],[0.065,0.1],[0.065,0.95],[0.075,0.98],[0.075,1.05],[0.06,1.08],[0.06,1.62],[0.08,1.66],[0.08,1.72],[0.05,1.76],[0.05,1.8],[0.02,1.86],[0,1.9]];
  for(const [r,y] of prof)pts.push(new THREE.Vector2(r,y));
  post.geometry.dispose();post.geometry=new THREE.LatheGeometry(pts,8);post.position.y=0;
  /* arm: a chamfered bar with a brace and a hanging ring */
  arm.geometry.dispose();arm.geometry=new THREE.BoxGeometry(0.78,0.06,0.06);
  const brace=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.05,0.42),arm.material);brace.position.set(0.16,1.42,0);brace.rotation.z=Math.PI/4;brace.rotation.y=Math.PI/2;
  brace.castShadow=true;g.add(brace);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(0.035,0.008,6,12),new THREE.MeshStandardMaterial({color:0x3a3a3e,roughness:0.5,metalness:0.7}));
  ring.position.set(0.58,1.56,0);ring.rotation.x=0;g.add(ring);   /* a torus is born upright */
  if(cap)cap.visible=false;
}
/* ------------------------------ the statue -------------------------------- */
/* The statue of St Paul outside the chapel: the game's stacked blocks become a bronze figure
   on a granite pedestal. The figure is a full HD humanoid (the same body, hair and beard the
   NPCs get) posed with the sword raised and the epistles held to the chest, every surface cast
   in bronze with a patina in the folds; the pedestal is a two-tier chamfered plinth with a
   moulded cap and a bronze plaque. */
let bronzeMat=null,graniteMat=null,plaqueMat=null;
function statueMats(){
  if(bronzeMat)return;
  const S=256,c=document.createElement('canvas');c.width=c.height=S;const g=c.getContext('2d');
  const R=(function(s){return function(){s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};})(77);
  /* dark bronze, smooth, a little warmer where it catches the light, a faint verdigris in the folds */
  g.fillStyle='#6a4a28';g.fillRect(0,0,S,S);
  for(let i=0;i<900;i++){const x=R()*S,y=R()*S,r=3+R()*9;const gr=g.createRadialGradient(x,y,0,x,y,r);const warm=R()<0.5;gr.addColorStop(0,warm?'rgba(120,86,48,0.16)':'rgba(30,20,10,0.18)');gr.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gr;g.fillRect(x-r,y-r,r*2,r*2);}
  for(let i=0;i<30;i++){const x=R()*S,l=14+R()*50;const gr=g.createLinearGradient(0,0,0,l);gr.addColorStop(0,'rgba(80,130,110,0)');gr.addColorStop(0.5,'rgba(80,130,110,'+(0.10+R()*0.14)+')');gr.addColorStop(1,'rgba(80,130,110,0)');g.fillStyle=gr;g.save();g.translate(x,R()*S);g.fillRect(-1.5-R()*2,0,3+R()*3,l);g.restore();}
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;
  bronzeMat=new THREE.MeshStandardMaterial({color:0xffffff,map:t,metalness:0.3,roughness:0.5});bronzeMat.userData.hdMid=3;   /* the stone layer's fine grain suits a casting; cloth, skin and brushed metal do not */
  const c2=document.createElement('canvas');c2.width=c2.height=S;const g2=c2.getContext('2d');g2.fillStyle='#8d8a82';g2.fillRect(0,0,S,S);
  for(let i=0;i<9000;i++){const x=R()*S,y=R()*S;g2.fillStyle=R()<0.5?'rgba(40,40,44,0.5)':(R()<0.5?'rgba(230,228,222,0.5)':'rgba(150,120,110,0.4)');g2.fillRect(x,y,1+R()*1.5,1+R()*1.5);}
  const t2=new THREE.CanvasTexture(c2);t2.wrapS=t2.wrapT=THREE.RepeatWrapping;t2.repeat.set(2,2);
  graniteMat=new THREE.MeshStandardMaterial({color:0xffffff,map:t2,metalness:0.05,roughness:0.9});graniteMat.userData.hdMid=3;
  plaqueMat=new THREE.MeshStandardMaterial({color:0x5a3e1e,metalness:0.9,roughness:0.35});plaqueMat.userData.hdMid=9;
}
/* the mantle: a robe thrown over the shoulders, hanging in folds to the hem, open at the front */
function mantleGeometry(){
  const pts=[];const prof=[[0.06,1.50],[0.16,1.42],[0.24,1.30],[0.25,1.15],[0.23,1.00],[0.24,0.85],[0.27,0.70],[0.31,0.55],[0.35,0.42]];
  for(const [r,y] of prof)pts.push(new THREE.Vector2(r,y));
  const g=new THREE.LatheGeometry(pts,26,Math.PI*0.62,Math.PI*1.76);   /* open across the front */
  /* folds: the radius swells and hollows round the body, deeper toward the hem */
  const p=g.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i);const a=Math.atan2(z,x);const k=Math.max(0,(1.45-y))*0.045;const f=1+k*Math.sin(a*9+y*4)+k*0.5*Math.sin(a*17-y*7);p.setXYZ(i,x*f,y,z*f);}
  g.computeVertexNormals();return g;
}
function dressStatue(g){
  if(g.userData.hdStatue||typeof makeHumanoid!=='function')return;g.userData.hdStatue=1;
  statueMats();
  for(const m of g.children.slice())if(m.isMesh){m.visible=false;}
  const M=(geo,mat,x,y,z)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;g.add(m);return m;};
  /* the pedestal: base slab, chamfer, die, moulded cap */
  M(new THREE.BoxGeometry(1.14,0.16,1.14),graniteMat,0,0.08,0);
  M(new THREE.CylinderGeometry(0.62,0.80,0.10,4),graniteMat,0,0.21,0).rotation.y=Math.PI/4;
  M(new THREE.BoxGeometry(0.66,0.62,0.66),graniteMat,0,0.57,0);
  M(new THREE.CylinderGeometry(0.60,0.50,0.07,4),graniteMat,0,0.915,0).rotation.y=Math.PI/4;
  M(new THREE.BoxGeometry(0.80,0.06,0.80),graniteMat,0,0.98,0);
  /* the figure faces north (-z in the world) whatever the game turned the group to */
  const fig0=new THREE.Group();fig0.rotation.y=-g.rotation.y;g.add(fig0);
  const pl=M(new THREE.BoxGeometry(0.34,0.2,0.02),plaqueMat,0,0.6,0);pl.receiveShadow=false;g.remove(pl);fig0.add(pl);pl.position.set(0,0.6,-0.34);pl.rotation.y=Math.PI;
  /* the figure: long hair and beard, in robes; the right hand raised open, the left holding the
     mantle at the chest, the face lifted */
  const hm=makeHumanoid({skin:0x7a5a32,shirt:0x7a5a32,pants:0x7a5a32,hair:0x7a5a32,hairstyle:'longback',beard:0x7a5a32,skirt:0x7a5a32,boots:0x7a5a32,belt:0x7a5a32,shirtStyle:'longsleeve',pantsStyle:'skirt'});
  const fig=hm.g;fig.position.y=1.01;fig.scale.setScalar(1.12);fig.rotation.y=Math.PI;fig0.add(fig);fig.userData.hdStatueRig=1;   /* a rig's face is its +z (the nose sits at +z); turned about, with the group's own turn undone, it faces north */
  hm.rArm.rotation.x=-1.55;hm.rArm.rotation.z=-0.25;
  hm.lArm.rotation.x=-1.25;hm.lArm.rotation.z=0.75;
  const mantle=new THREE.Mesh(mantleGeometry(),bronzeMat);mantle.castShadow=true;mantle.rotation.y=-Math.PI/2;fig.add(mantle);   /* the lathe's gap sits at +x; a quarter turn puts it at the face (+z in the rig) */
  /* the fold of robe gathered in the left hand */
  /* every piece gets its own bronze (the game recolours costume-tagged materials by tag, so the
     tags go too), skinned pieces a skinning bronze */
  const castMat=(skinned)=>{const m=bronzeMat.clone();m.userData.hdMid=3;if(skinned)m.skinning=true;return m;};
  const cast=()=>{fig.traverse(o=>{if(!o.isMesh||o.userData.hdBronze)return;o.material=castMat(!!o.isSkinnedMesh);o.userData.hdBronze=1;delete o.userData.cos;o.castShadow=true;});
    try{const b=HD.bodies&&HD.bodies.find(b=>b.g===fig);if(b){b.castMat=castMat;if(b.headG){b.headG.rotation.x=-0.28;b.headG.rotation.y=-0.15;}b.statue=true;}}catch(e){}};
  cast();setTimeout(cast,50);setTimeout(cast,1500);setTimeout(cast,4000);
  g.userData.hdStatueCast=cast;
}
function dressRocks(root,seed){
  let n=0;
  root.traverse(m=>{
    if(!m.isMesh||!m.geometry)return;
    if(m.geometry.type!=='DodecahedronGeometry')return;
    const r=(m.geometry.parameters&&m.geometry.parameters.radius)||0.4;
    m.geometry=boulder(r,seed+n*7);
    if(m.material&&m.material.userData)m.material.userData.hdMid=14;   /* rock, not cobbles */
    n++;
  });
  return n;
}
let total=0;
for(const o of objects){if(o._m&&o._m.group)total+=dressRocks(o._m.group,(o.x*31+o.y*7)|0);}
if(typeof buildObjModel==='function'){
  const _b=buildObjModel;
  buildObjModel=function(o){const r=_b.apply(this,arguments);try{if(o&&o._m&&o._m.group){dressRocks(o._m.group,(o.x*31+o.y*7)|0);if(o.def==='sign')dressSign(o._m.group);if(o.def==='statue')dressStatue(o._m.group);}}catch(e){}return r;};
}
let ns=0;for(const o of objects){if(o.def==='sign'&&o._m&&o._m.group){dressSign(o._m.group);ns++;}if(o.def==='statue'&&o._m&&o._m.group){try{dressStatue(o._m.group);}catch(e){console.warn('[HD] statue',e);}}}
console.log('[HD] signposts:',ns);
{
}
console.log('[HD] boulders:',total);
})();
