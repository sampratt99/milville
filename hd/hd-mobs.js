/* ============================================================================
   Milville HD — creatures.  Loaded after hd-gear.js.

   The game builds every creature from its creature kit: critterSweep (one
   continuous tube through elliptical cross-sections, countershaded with
   vertex colours), smesh (smooth primitives) and jointed legs. This module
   rebuilds the kit under the same names:

     * critterSweep runs a Catmull-Rom spline through the sections (three
       rows per section), more sides, a hand-sculpted surface (low noise
       along the body, stronger for fur), arc-length UVs, and a material for
       the creature's hide: fur, scales, skin, bone, chitin, ice — chosen by
       the kind being built — with the countershading kept as vertex colours.
     * smesh rebuilds coarse spheres, cones and cylinders at a higher
       resolution (same parameters, so anything keyed on them still matches).
     * makeRat is wrapped so the kind is known while its parts are built, and
       a few kinds get bespoke touches after: wolves grow fangs,
       skeletons a sculpted skull and jaw, giants a sculpted head.

   Creatures already standing when this loads are rebuilt in place: the old
   group leaves the scene, its pick proxies are dropped, makeRat runs again,
   and the new group takes the old visibility, position and scale.

   Gameplay is untouched: nothing here reads or writes game state.
   ========================================================================== */
(function(){
'use strict';
try{performance.mark('hd:hd-mobs');}catch(e){}
const HD=window.HD;
if(!HD||!HD.ready||!HD.bodyKit)return;
if(typeof critterSweep!=='function'||typeof makeRat!=='function'||typeof smesh!=='function'||typeof mesh!=='function'||typeof lam!=='function')return;
const K=HD.bodyKit;
const {tex,noiseCanvas,fbm,vn}=K;

try{performance.mark('hd:hd-mobs/hides');}catch(e){}
/* ------------------------------ hides ----------------------------------- */
const CLASS={wolf:'fur',rat:'fur',boar:'fur',minotaur:'fur',bear:'fur',
  dragon:'scale',greendragon:'scale',bluedragon:'scale',reddragon:'scale',blackdragon:'scale',wyvern:'scale',basilisk:'scale',kurask:'scale',magma_salamander:'scale',cinderwing:'scale',
  hillgiant:'skin',mossgiant:'skin',firegiant:'skin',cyclops:'skin',goblin:'skin',biggoblin:'skin',gorp:'skin',zombie:'skin',lesser:'skin',greater:'skin',ember_imp:'skin',
  icegolem:'ice',icefiend:'ice',snowking:'ice',
  spider:'chitin',redspider:'chitin',bigspider:'chitin',crabs:'chitin',
  skelearcher:'bone',ghost:'ghost',banshee:'ghost',cinder_wraith:'ghost'};
const furTex=()=>{const t=tex('mob:fur',()=>{const S=256,c=document.createElement('canvas');c.width=c.height=S;const g=c.getContext('2d');
  const base=noiseCanvas(128,(u,v)=>0.86+0.14*(fbm(u*5,v*5,3)-0.5));g.drawImage(base,0,0,S,S);
  let s=7;const R=()=>{s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
  for(let i=0;i<2600;i++){const x=R()*S,y=R()*S,len=5+R()*11,gg=(150+R()*105)|0;g.strokeStyle='rgba('+gg+','+gg+','+gg+',0.55)';g.lineWidth=0.8+R()*1.2;g.beginPath();g.moveTo(x,y);g.quadraticCurveTo(x+(R()-0.5)*4,y+len*0.5,x+(R()-0.5)*6,y+len);g.stroke();}
  return c;});t.repeat.set(4,3);return t;};
const scaleTex=()=>{const t=tex('mob:scale',()=>{const S=256,c=document.createElement('canvas');c.width=c.height=S;const g=c.getContext('2d');
  g.fillStyle='#b8b8b8';g.fillRect(0,0,S,S);const r=S/10;
  for(let j=-1;j<13;j++)for(let i=-1;i<12;i++){const x=i*r+(j%2?r/2:0),y=j*r*0.8;
    const gr=g.createRadialGradient(x,y-r*0.2,r*0.1,x,y,r*0.62);gr.addColorStop(0,'#e0e0e0');gr.addColorStop(0.8,'#aaaaaa');gr.addColorStop(1,'#5a5a5a');
    g.fillStyle=gr;g.beginPath();g.arc(x,y,r*0.62,0,Math.PI*2);g.fill();}
  return c;});t.repeat.set(6,4);return t;};
const skinTex=()=>tex('mob:skin',()=>noiseCanvas(256,(u,v)=>0.84+0.18*(fbm(u*6,v*6,4)-0.5)+0.05*(vn(u*70,v*70)-0.5)));
const boneTex=()=>tex('mob:bone',()=>noiseCanvas(256,(u,v)=>0.88+0.14*(fbm(u*3,v*12,3)-0.5)+0.04*(vn(u*50,v*50)-0.5)));
const chitinTex=()=>tex('mob:chitin',()=>noiseCanvas(256,(u,v)=>{const band=0.5+0.5*Math.sin(v*Math.PI*2*9);return 0.78+0.16*band+0.08*(fbm(u*8,v*8,3)-0.5);}));
const iceTex=()=>tex('mob:ice',()=>noiseCanvas(256,(u,v)=>0.9+0.16*(fbm(u*4,v*4,4)-0.5)+0.06*(vn(u*30,v*30)-0.5)));
const mats={};
function hideMat(cls){
  if(mats[cls])return mats[cls];
  const P={color:0xffffff,vertexColors:true,side:THREE.DoubleSide};
  if(cls==='fur'){P.map=furTex();P.roughness=0.95;}
  else if(cls==='scale'){P.map=scaleTex();P.roughness=0.45;P.metalness=0.08;}
  else if(cls==='bone'){P.map=boneTex();P.roughness=0.7;}
  else if(cls==='chitin'){P.map=chitinTex();P.roughness=0.3;P.metalness=0.1;}
  else if(cls==='ice'){P.map=iceTex();P.roughness=0.25;P.metalness=0.1;}
  else if(cls==='ghost'){P.roughness=0.6;}
  else {P.map=skinTex();P.roughness=0.8;}
  return mats[cls]=new THREE.MeshLambertMaterial(P);
}
const NOISE={fur:0.07,scale:0.035,skin:0.03,bone:0.02,chitin:0.02,ice:0.05,ghost:0.0};
let curKind=null;
const clsOf=()=>CLASS[curKind]||'skin';

try{performance.mark('hd:hd-mobs/the-sweep');}catch(e){}
/* ---------------------------- the sweep --------------------------------- */
const _game_sweep=critterSweep;
function cr(a,b,c,d,t){const t2=t*t,t3=t2*t;return 0.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t2+(-a+3*b-3*c+d)*t3);}
function hdSweep(sections,color,R,capStart,capEnd,shade){
  const n0=sections.length;
  if(n0<2)return _game_sweep.apply(this,arguments);
  R=Math.max(R||14,20);
  const S=3;                                   /* rows per section */
  /* the spline through the centres and the radii */
  const P=[],RX=[],RY=[];
  const at=i=>sections[Math.max(0,Math.min(n0-1,i))];
  for(let i=0;i<n0-1;i++){for(let k=0;k<S;k++){const t=k/S;
    const a=at(i-1),b=at(i),c=at(i+1),d=at(i+2);
    P.push(new THREE.Vector3(cr(a.p[0],b.p[0],c.p[0],d.p[0],t),cr(a.p[1],b.p[1],c.p[1],d.p[1],t),cr(a.p[2],b.p[2],c.p[2],d.p[2],t)));
    RX.push(Math.max(0.002,cr(a.rx,b.rx,c.rx,d.rx,t)));RY.push(Math.max(0.002,cr(a.ry,b.ry,c.ry,d.ry,t)));}}
  {const e=at(n0-1);P.push(new THREE.Vector3(e.p[0],e.p[1],e.p[2]));RX.push(e.rx);RY.push(e.ry);}
  const n=P.length;
  /* arc length for v */
  const L=[0];for(let i=1;i<n;i++)L.push(L[i-1]+P[i].distanceTo(P[i-1]));const tot=L[n-1]||1;
  const cls=clsOf();const amp=NOISE[cls]!==undefined?NOISE[cls]:0.03;
  const up=new THREE.Vector3(0,1,0),alt=new THREE.Vector3(0,0,1);
  const pos=[],uv=[],idx=[],col=[];
  let cTop,cBot,tmp;
  if(shade){cTop=new THREE.Color(shade.top);cBot=new THREE.Color(shade.bottom);tmp=new THREE.Color();}
  const seed=(color|0)%97;
  let bbPrev=null;
  for(let i=0;i<n;i++){
    const t=new THREE.Vector3();
    if(i===0)t.subVectors(P[1],P[0]);else if(i===n-1)t.subVectors(P[n-1],P[n-2]);else t.subVectors(P[i+1],P[i-1]);
    t.normalize();
    const ref=(Math.abs(t.dot(up))>0.94)?alt:up;
    const bb=new THREE.Vector3().crossVectors(t,ref).normalize();
    if(bbPrev&&bb.dot(bbPrev)<0)bb.negate();bbPrev=bb;
    const nn=new THREE.Vector3().crossVectors(bb,t).normalize();
    const rx=RX[i],ry=RY[i],v=L[i]/tot;
    const endFade=Math.min(1,Math.min(i,n-1-i)/2);        /* no bumps at the caps */
    for(let j=0;j<R;j++){
      const a2=j/R*Math.PI*2,ca=Math.cos(a2),sa=Math.sin(a2);
      const k=1+amp*endFade*(fbm(j/R*5+seed,v*6*(tot/0.8),3)-0.5)*2;
      pos.push(P[i].x+(ca*rx*bb.x+sa*ry*nn.x)*k, P[i].y+(ca*rx*bb.y+sa*ry*nn.y)*k, P[i].z+(ca*rx*bb.z+sa*ry*nn.z)*k);
      uv.push(j/R,v*Math.max(1,tot/0.6));
      if(shade){tmp.copy(cBot).lerp(cTop,(sa+1)/2);col.push(tmp.r,tmp.g,tmp.b);}
    }
  }
  for(let i=0;i<n-1;i++){const a0=i*R,a1=(i+1)*R;for(let j=0;j<R;j++){const jn=(j+1)%R;idx.push(a0+j,a1+j,a0+jn);idx.push(a0+jn,a1+j,a1+jn);}}
  if(capStart){const c=pos.length/3;pos.push(P[0].x,P[0].y,P[0].z);uv.push(0.5,0);if(shade){tmp.copy(cBot).lerp(cTop,0.5);col.push(tmp.r,tmp.g,tmp.b);}for(let j=0;j<R;j++){const jn=(j+1)%R;idx.push(c,j,jn);}}
  if(capEnd){const c=pos.length/3,b2=(n-1)*R;pos.push(P[n-1].x,P[n-1].y,P[n-1].z);uv.push(0.5,1);if(shade){tmp.copy(cBot).lerp(cTop,0.5);col.push(tmp.r,tmp.g,tmp.b);}for(let j=0;j<R;j++){const jn=(j+1)%R;idx.push(c,b2+jn,b2+j);}}
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  if(shade)geo.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
  geo.setIndex(idx);geo.computeVertexNormals();
  let mat;
  if(shade)mat=hideMat(cls);
  else{const base=new THREE.Color(color);mat=new THREE.MeshLambertMaterial({color:base,side:THREE.DoubleSide,map:hideMat(cls).map||null,roughness:hideMat(cls).roughness});}
  const m=new THREE.Mesh(geo,mat);m.castShadow=true;m.receiveShadow=true;m.userData.hdSweep=1;return m;
}
critterSweep=hdSweep;

try{performance.mark('hd:hd-mobs/smooth-primitives');}catch(e){}
/* --------------------------- smooth primitives -------------------------- */
const _game_smesh=smesh;
function finer(geo){
  const p=geo.parameters;if(!p)return geo;
  const t=geo.type;
  if(t==='SphereGeometry'&&(p.widthSegments<18||p.heightSegments<14)&&p.phiLength>6&&p.thetaLength>3)return new THREE.SphereGeometry(p.radius,20,15);
  if(t==='CylinderGeometry'&&p.radiusTop!==undefined&&p.radialSegments<14&&!p.openEnded&&p.thetaLength>6)return new THREE.CylinderGeometry(p.radiusTop,p.radiusBottom,p.height,16,1);
  if(t==='CylinderGeometry'&&p.radius!==undefined&&p.radialSegments<14&&p.thetaLength>6)return new THREE.ConeGeometry(p.radius,p.height,16,1);
  return geo;
}
/* while a creature is being built, its parts take the creature's hide (fur, scales, skin...)
   in their own colour instead of the world's colour-classified layers (a grey skull is not
   stone, a gold leg is not wood); small round parts (eyes, teeth) stay glossy and plain */
const _game_lam=lam,_game_lamD=(typeof lamD==='function')?lamD:null,_game_mesh=mesh;
const partMats={};
function partMat(hex,dbl,plain,flat){
  const cls=clsOf();const key=cls+':'+hex+(dbl?'d':'')+(plain?'p':'')+(flat?'f':'');if(partMats[key])return partMats[key];
  const hm=hideMat(cls);const P={color:hex,roughness:plain?0.3:hm.roughness,metalness:plain?0.05:(hm.metalness||0)};
  if(hm.map&&!plain)P.map=hm.map;if(dbl)P.side=THREE.DoubleSide;if(flat)P.flatShading=true;
  return partMats[key]=new THREE.MeshLambertMaterial(P);
}
lam=function(hex){return curKind?partMat(hex,false,false):_game_lam.apply(this,arguments);};
if(_game_lamD)lamD=function(hex){return curKind?partMat(hex,true,false):_game_lamD.apply(this,arguments);};
const small=geo=>{const p=geo.parameters;return !!p&&((p.radius!==undefined&&p.radius<=0.036&&geo.type==='SphereGeometry'));};
smesh=function(geo,hex,shadow){
  if(curKind){try{geo=finer(geo);}catch(e){}if(small(geo)){const m=new THREE.Mesh(geo,partMat(hex,false,true));m.castShadow=shadow!==false;return m;}}
  return _game_smesh.call(this,geo,hex,shadow);
};
mesh=function(geo,hex,shadow){
  if(curKind){const t=geo.type;if(t==='SphereGeometry'||t==='CylinderGeometry'||t==='ConeGeometry')return smesh(geo,hex,shadow);}
  return _game_mesh.call(this,geo,hex,shadow);
};

try{performance.mark('hd:hd-mobs/bespoke');}catch(e){}
/* ------------------------------ bespoke --------------------------------- */
const {headRings,headPoint,Buf,toGeo}=K;
function skullGeo(scale){
  const rings=headRings(false).map(r=>Object.assign({},r,{f:null,y:(r.y-K.HEAD_Y)*scale,rx:r.rx*scale,rz:r.rz*scale,cz:(r.cz||0)*scale}));
  const B=new Buf();K.tube(B,rings,22,null,true,true);const g=toGeo(B);g.deleteAttribute('skinIndex');g.deleteAttribute('skinWeight');return g;
}
/* a limb in place of a cylinder: the same height, centred like the cylinder, but shaped —
   'muscle' swells below the joint and tapers, 'bone' has knobbed ends and a slim shaft */
function limbGeo(h,rTop,rBot,style){
  const R=[];const add=(t,k)=>{const r=rTop+(rBot-rTop)*t;R.push({y:-h/2+h*(1-t),rx:r*k,rz:r*k,b:[0,1]});};
  if(style==='bone'){add(0,1.25);add(0.08,1.18);add(0.2,0.8);add(0.5,0.72);add(0.8,0.8);add(0.92,1.15);add(1,1.22);}
  else{add(0,0.98);add(0.12,1.08);add(0.3,1.14);add(0.5,1.06);add(0.72,0.98);add(0.9,0.96);add(1,1.0);}
  R.sort((a,b)=>a.y-b.y);const B=new Buf();K.tube(B,R,14,null,true,true);const g=toGeo(B);g.deleteAttribute('skinIndex');g.deleteAttribute('skinWeight');return g;
}
const isCyl=c=>c.isMesh&&c.geometry&&c.geometry.type==='CylinderGeometry'&&c.geometry.parameters&&c.geometry.parameters.radiusTop!==undefined;
function reshapeLimbs(root,style){
  root.traverse(c=>{if(!isCyl(c)||c.userData.hdLimb)return;const p=c.geometry.parameters;if(p.height<0.1)return;c.userData.hdLimb=1;c.geometry=limbGeo(p.height,p.radiusTop,p.radiusBottom,style);});
}
/* a paw for a box foot: a rounded pad and toes */
function pawify(leg){
  const ank=leg.userData&&leg.userData.ankle;if(!ank)return;
  for(const c of ank.children.slice()){if(!c.isMesh||c.userData.hdPaw)continue;c.userData.hdPaw=1;
    const box=new THREE.Box3().setFromObject(c);const w=box.max.x-box.min.x||0.085,h=box.max.y-box.min.y||0.05,d=box.max.z-box.min.z||0.15;
    c.geometry=new THREE.SphereGeometry(0.5,14,10);c.scale.set(w*1.05,h*1.3,d*0.8);c.position.z-=d*0.08;
    const mat=c.material;for(let i=-1;i<=1;i++){const toe=new THREE.Mesh(new THREE.SphereGeometry(0.5,8,6),mat);toe.scale.set(w*0.3,h*1.0,d*0.4);toe.position.set(c.position.x+i*w*0.32,c.position.y-h*0.05,c.position.z+d*0.42);toe.castShadow=true;ank.add(toe);}}
}
/* claws on every toe of a paw */
function claws(leg,hex){
  const ank=leg.userData&&leg.userData.ankle;if(!ank)return;const mat=partMat(hex,false,true,true);
  for(const t of ank.children.slice()){if(!t.isMesh||t.userData.hdPaw||t.userData.hdClaw)continue;   /* the toes are the unmarked spheres */
    const cl=new THREE.Mesh(new THREE.ConeGeometry(0.012,0.04,5),mat);cl.rotation.x=Math.PI/2;cl.position.set(t.position.x,t.position.y-0.01,t.position.z+t.scale.z*0.5+0.015);cl.userData.hdClaw=1;ank.add(cl);}
}
/* a head laid along +z: rings from the back of the skull to the nose, in the head group's space */
function headAlongZ(rings,segs){
  const fr=new THREE.Matrix4().makeRotationX(Math.PI/2);   /* the tube's y becomes +z, its z becomes -y */
  const B=new Buf();K.tube(B,rings.map(r=>({y:r.z,rx:r.rx,rz:r.rz,cz:-(r.y||0),b:[0,1]})),segs||20,fr,true,true);
  const g=toGeo(B);g.deleteAttribute('skinIndex');g.deleteAttribute('skinWeight');return g;
}
function bespoke(r){
  const m=r._m,g=m&&m.group;if(!g)return;
  const kind=r.kind;
  if(kind==='wolf'&&m.head){
    const H=m.head;
    /* the head: one sculpted skull-and-muzzle in place of the sphere and the muzzle sweep */
    let skullCol=0x7a7066;
    for(const c of H.children.slice()){const p=c.geometry&&c.geometry.parameters;
      if(c.isMesh&&c.geometry.type==='SphereGeometry'&&p&&p.radius===0.135){skullCol=c.material.color.getHex();H.remove(c);}
      else if(c.isMesh&&c.userData.hdSweep){H.remove(c);}}
    const skull=new THREE.Mesh(headAlongZ([
      {z:-0.05,y:0.05,rx:0.05,rz:0.05},{z:0.0,y:0.06,rx:0.115,rz:0.11},{z:0.08,y:0.065,rx:0.14,rz:0.135},{z:0.16,y:0.06,rx:0.13,rz:0.125},
      {z:0.22,y:0.035,rx:0.095,rz:0.09},{z:0.28,y:0.015,rx:0.07,rz:0.068},{z:0.36,y:0.0,rx:0.056,rz:0.05},{z:0.42,y:-0.01,rx:0.045,rz:0.04},{z:0.45,y:-0.012,rx:0.03,rz:0.026}],22),partMat(skullCol,false,false));
    skull.castShadow=true;H.add(skull);
    /* ears: thin, cupped; pupils in the eyes; fangs */
    for(const c of H.children.slice()){const p=c.geometry&&c.geometry.parameters;
      if(c.isMesh&&p&&p.radius===0.062&&p.height===0.18){c.scale.set(0.8,1.1,0.35);const inner=new THREE.Mesh(new THREE.ConeGeometry(0.04,0.13,8),partMat(0xa88a80,false,true));inner.position.copy(c.position);inner.position.y-=0.01;inner.position.z+=0.012;inner.rotation.copy(c.rotation);inner.scale.set(0.7,1,0.3);H.add(inner);}
      else if(c.isMesh&&p&&p.radius===0.024){c.scale.set(1.25,0.5,0.55);c.position.z-=0.006;c.rotation.z=(c.position.x<0?1:-1)*0.3;const pup=new THREE.Mesh(new THREE.SphereGeometry(0.008,8,6),partMat(0x101010,false,true));pup.scale.set(0.6,1.2,0.6);pup.position.copy(c.position);pup.position.z+=0.011;H.add(pup);}}
    const white=partMat(0xf2eee0,false,true);
    for(const sx of [-1,1]){for(const [z,len] of [[0.30,0.06],[0.36,0.045]]){const f=new THREE.Mesh(new THREE.ConeGeometry(0.012,len,6),white);f.position.set(sx*0.04,-0.045,z);f.rotation.x=Math.PI;H.add(f);}}
    /* legs: muscled thighs and shins, real paws */
    if(m.legs)for(const lg of m.legs){reshapeLimbs(lg,'muscle');pawify(lg);claws(lg,0x2a2620);}
    /* the mane: RS3's wolf wears a ruff of faceted fur wedges round the neck and shoulders */
    const mane=partMat(0x6a6259,false,false,true);const UP=new THREE.Vector3(0,1,0),dir=new THREE.Vector3();
    for(const [z,rad,cy,n,len] of [[0.50,0.19,0.62,18,0.20],[0.36,0.22,0.58,20,0.16],[0.22,0.22,0.56,16,0.12]]){
      for(let i=0;i<n;i++){const a=i/n*Math.PI*2+z*3;const up=(Math.sin(a)+1)/2;const L=len*(0.5+0.7*up);
        const w=new THREE.Mesh(new THREE.ConeGeometry(0.03+0.015*up,L,4),mane);w.position.set(Math.cos(a)*rad*0.92,cy+Math.sin(a)*rad*0.85,z);
        dir.set(Math.cos(a)*0.45,Math.sin(a)*0.45+0.15,-1).normalize();w.quaternion.setFromUnitVectors(UP,dir);w.position.addScaledVector(dir,L*0.3);w.castShadow=true;g.add(w);}}
    /* the dark eye mask */
    for(const sx of [-1,1]){const mk=new THREE.Mesh(new THREE.SphereGeometry(0.05,10,8),partMat(0x55504a,false,false));mk.scale.set(1.15,0.7,0.12);mk.position.set(sx*0.078,0.085,0.222);mk.rotation.y=sx*0.55;H.add(mk);}
    /* the three scruff cones go: the mane replaces them */
    for(const c of g.children.slice()){const p=c.geometry&&c.geometry.parameters;if(c.isMesh&&p&&p.radius===0.06&&p.height===0.16)g.remove(c);}
  }
  else if(kind==='skelearcher'){
    /* the skull: sculpted, with a hinged-looking jaw */
    for(const c of g.children.slice()){const p=c.geometry&&c.geometry.parameters;if(!c.isMesh||!p)continue;
      if(c.geometry.type==='SphereGeometry'&&p.radius===0.135){c.geometry=skullGeo(0.98);c.position.set(0,1.6,0);c.scale.set(1,1,1);c.material=new THREE.MeshLambertMaterial({color:c.material.color.getHex(),map:boneTex(),roughness:0.7});}
      else if(c.geometry.type==='BoxGeometry'&&p.width===0.13){const B=new Buf();K.tube(B,[{y:-0.03,rx:0.05,rz:0.055,cz:0.02,b:[0,1]},{y:0.0,rx:0.07,rz:0.075,cz:0.015,b:[0,1]},{y:0.035,rx:0.075,rz:0.08,cz:0.01,b:[0,1]}],14,null,true,true);const gg=toGeo(B);gg.deleteAttribute('skinIndex');gg.deleteAttribute('skinWeight');c.geometry=gg;c.position.set(0,1.50,0.03);c.material=new THREE.MeshLambertMaterial({color:c.material.color.getHex(),map:boneTex(),roughness:0.7});}
      else if(c.geometry.type==='SphereGeometry'&&p.radius===0.034){c.scale.set(1.2,1.1,0.6);c.position.z=0.108;}
    }
    /* teeth along the jaw; knobbed bones for the limbs; toes on the feet */
    const white=new THREE.MeshLambertMaterial({color:0xe8e2cf,roughness:0.6});
    for(let i=-3;i<=3;i++){const t=new THREE.Mesh(new THREE.BoxGeometry(0.012,0.02,0.01),white);t.position.set(i*0.017,1.535,0.115-Math.abs(i)*0.006);g.add(t);}
    for(const part of [m.legs,[m.lSh,m.rSh]])if(part)for(const q of part)if(q)reshapeLimbs(q,'bone');
    g.traverse(c=>{if(c.isMesh&&c.material&&c.material.color&&!c.material.flatShading){const h=c.material.color.getHex();if(h===0xe8e2cf||h===0xc8c2ad){c.material.flatShading=true;c.material.needsUpdate=true;}}});
    if(m.knees)for(const kn of m.knees)for(const c of kn.children.slice()){if(!c.isMesh||isCyl(c)||c.userData.hdLimb||c.userData.hdPaw||(c.geometry.parameters&&c.geometry.parameters.radiusTop!==undefined))continue;c.userData.hdPaw=1;
      c.geometry=new THREE.BoxGeometry(0.07,0.04,0.12);c.position.z-=0.02;for(let i=-1;i<=1;i++){const toe=new THREE.Mesh(new THREE.CylinderGeometry(0.008,0.006,0.07,6),c.material);toe.rotation.x=Math.PI/2;toe.position.set(c.position.x+i*0.025,c.position.y,c.position.z+0.09);kn.add(toe);}}
    /* vertebrae down the spine */
    for(const c of g.children.slice()){const p=c.geometry&&c.geometry.parameters;if(c.isMesh&&p&&p.radiusTop===0.03&&p.height===0.52){for(let i=0;i<7;i++){const v=new THREE.Mesh(new THREE.TorusGeometry(0.03,0.012,6,10),c.material);v.rotation.x=Math.PI/2;v.position.set(0,c.position.y-0.22+i*0.075,0);g.add(v);}}}
  }
  else if(m.grat&&m.rhead){
    /* the rat's eyes: slanted almonds with a red glint, not balls; the snout gets teeth */
    for(const c of m.rhead.children.slice()){const p=c.geometry&&c.geometry.parameters;if(c.isMesh&&p&&p.radius===0.028){c.scale.set(1.2,0.55,0.5);c.rotation.z=(c.position.x<0?1:-1)*0.35;c.material=partMat(0x7a1a14,false,true);}}
    /* legs: shaped, with a real paw of toes and claws instead of a pink ball */
    if(m.legs)for(const lg of m.legs){reshapeLimbs(lg,'muscle');
      for(const c of lg.children.slice()){const p=c.geometry&&c.geometry.parameters;if(!c.isMesh||!p||p.radius!==0.045)continue;
        c.geometry=new THREE.SphereGeometry(0.5,10,8);c.scale.set(0.07,0.035,0.09);c.position.z+=0.02;
        for(let i=-1;i<=1;i++){const toe=new THREE.Mesh(new THREE.SphereGeometry(0.5,6,5),c.material);toe.scale.set(0.02,0.018,0.04);toe.position.set(c.position.x+i*0.022,c.position.y-0.006,c.position.z+0.05);lg.add(toe);
          const cl=new THREE.Mesh(new THREE.ConeGeometry(0.006,0.025,5),partMat(0x2a2620,false,true,true));cl.rotation.x=Math.PI/2;cl.position.set(toe.position.x,toe.position.y-0.004,toe.position.z+0.03);lg.add(cl);}}}
  }
  else if(m.goblin&&m.ghead){
    /* the goblin: a hooked nose in place of the cone, a mouth with teeth, eyes as almonds */
    const H=m.ghead;
    for(const c of H.children.slice()){const p=c.geometry&&c.geometry.parameters;if(!c.isMesh||!p)continue;
      if(p.radius===0.04&&p.height===0.17){const col=c.material.color.getHex();H.remove(c);
        const nose=new THREE.Mesh(headAlongZ([{z:0.0,y:0.02,rx:0.028,rz:0.026},{z:0.06,y:0.0,rx:0.03,rz:0.028},{z:0.12,y:-0.03,rx:0.026,rz:0.024},{z:0.16,y:-0.065,rx:0.018,rz:0.016},{z:0.18,y:-0.085,rx:0.008,rz:0.008}],12),partMat(col,false,false));nose.position.set(0,0.0,0.1);nose.castShadow=true;H.add(nose);}
      else if(p.radius===0.038){c.scale.set(1.5,0.5,0.35);c.position.z+=0.01;}
      else if(!p.radius&&!p.radiusTop&&p.width===undefined&&c.position.y<-0.08){ }   /* the mouth box is facetted; left as the mouth line */
    }
    const white=partMat(0xe8e2cf,false,true);
    for(const sx of [-1,1]){for(const [x,l] of [[0.03,0.03],[0.014,0.02]]){const t=new THREE.Mesh(new THREE.ConeGeometry(0.007,l,5),white);t.position.set(sx*x,-0.083,0.12);t.rotation.x=Math.PI;H.add(t);}}
    for(const part of [m.legs,m.arms])if(part)for(const q of part)if(q)reshapeLimbs(q,'muscle');
  }
  else if(m.demon&&m.dhead){
    /* the demon: a tapered jaw with a row of teeth, brow ridge, eyes as burning slits */
    const H=m.dhead;
    for(const c of H.children.slice()){const p=c.geometry&&c.geometry.parameters;if(!c.isMesh||!p)continue;
      if(p.width===0.21){const col=c.material.color.getHex();H.remove(c);
        const jaw=new THREE.Mesh(headAlongZ([{z:0.0,y:-0.05,rx:0.11,rz:0.05},{z:0.1,y:-0.05,rx:0.1,rz:0.046},{z:0.22,y:-0.045,rx:0.08,rz:0.04},{z:0.3,y:-0.04,rx:0.05,rz:0.03}],14),partMat(col,false,false));jaw.position.set(0,0,0.06);jaw.castShadow=true;H.add(jaw);
        const white=partMat(0xe8e0d0,false,true);for(const sx of [-1,1])for(const z of [0.14,0.2,0.26,0.31]){const t=new THREE.Mesh(new THREE.ConeGeometry(0.012,0.04,5),white);t.position.set(sx*0.06,-0.005,z);H.add(t);}}
      else if(p.width===0.3){c.geometry=new THREE.SphereGeometry(0.5,12,8);c.scale.set(0.3,0.05,0.12);c.position.set(0,0.13,0.2);}
      else if(p.radius===0.032){c.scale.set(1.4,0.55,0.5);c.rotation.z=(c.position.x<0?1:-1)*0.4;c.material=new THREE.MeshBasicMaterial({color:c.material.color.getHex()});}
    }
    for(const part of [m.legs,m.arms])if(part)for(const q of part)if(q)reshapeLimbs(q,'muscle');
  }
  else if(m.dragon&&m.dhead){
    /* the jaw: a tapered tube with teeth, upper fangs at the muzzle */
    const J=m.djaw;
    for(const c of J.children.slice()){const p=c.geometry&&c.geometry.parameters;if(c.isMesh&&p&&p.width===0.15){const col=c.material.color.getHex();J.remove(c);
      const jaw=new THREE.Mesh(headAlongZ([{z:0.0,y:-0.03,rx:0.075,rz:0.035},{z:0.14,y:-0.03,rx:0.068,rz:0.03},{z:0.28,y:-0.028,rx:0.05,rz:0.024},{z:0.36,y:-0.025,rx:0.03,rz:0.016}],14),partMat(col,false,false));jaw.castShadow=true;J.add(jaw);
      const white=partMat(0xe8e2d2,false,true);
      for(const sx of [-1,1])for(const z of [0.08,0.16,0.24,0.31]){const t=new THREE.Mesh(new THREE.ConeGeometry(0.012,0.05,6),white);t.position.set(sx*0.05,-0.005,z);J.add(t);}}}
    const white=partMat(0xe8e2d2,false,true);
    for(const sx of [-1,1])for(const [z,len] of [[0.62,0.07],[0.72,0.05],[0.8,0.045]]){const t=new THREE.Mesh(new THREE.ConeGeometry(0.014,len,6),white);t.position.set(sx*0.06,0.53,z);t.rotation.x=Math.PI;m.dhead.add(t);}
    if(m.legs)for(const lg of m.legs)reshapeLimbs(lg,'muscle');
  }
  else if(m.giant&&m.ghead){
    /* the giant's head is the human face kit at giant scale: skull, brow, nose, lips, deep
       eyes, ears, a beard. The game's ball, plank, eye balls and mouth slab go; tusks stay. */
    const H=m.ghead;let skinHex=0xb39068,browHex=0x8f6f4c;
    for(const c of H.children.slice()){if(!c.isMesh||!c.geometry)continue;const p=c.geometry.parameters||{};const col=c.material&&c.material.color?c.material.color.getHex():0;
      if(p.radius===0.23){skinHex=col;H.remove(c);}
      else if(p.radius===0.15&&c.geometry.type==='SphereGeometry'){H.remove(c);}
      else if(p.radius!==undefined&&p.radius<=0.05&&c.geometry.type==='SphereGeometry'){H.remove(c);}   /* the eye balls */
      else if(!p.radius&&!p.radiusTop&&Math.abs(c.position.y-0.08)<0.01){browHex=col;H.remove(c);}
      else if(!p.radius&&!p.radiusTop&&Math.abs(c.position.y+0.17)<0.01){H.remove(c);}}
    const seed=(r.i|0)*13+7;
    const hk=K.buildHead(H,{skin:skinHex,hair:browHex,seed,scale:1.62,beard:(m.kind==='hillgiant'||m.kind==='cyclops')?0x3a2a1c:false,nose:1.25,iris:m.kind==='firegiant'?0xffe24a:0x3a2a1c});
    hk.group.rotation.x=0.0;
    for(const part of [m.legs,m.arms])if(part)for(const q of part)if(q)reshapeLimbs(q,'muscle');
    if(m.kind==='hillgiant'||m.kind==='cyclops'){
      /* a rope belt, a ragged loincloth, toes */
      const rope=new THREE.Mesh(new THREE.TorusGeometry(0.245,0.028,8,24),partMat(0x8a7048,false,false));rope.rotation.x=Math.PI/2;rope.position.set(0,0.95,0.01);g.add(rope);
      for(const c of g.children.slice()){const p=c.geometry&&c.geometry.parameters;if(c.isMesh&&p&&p.radius===0.3&&p.height===0.4){const B=new Buf();K.tube(B,[{y:0.60,rx:0.30,rz:0.27,b:[0,1],f:th=>1+0.08*Math.sin(th*7)},{y:0.74,rx:0.265,rz:0.24,b:[0,1]},{y:0.88,rx:0.24,rz:0.22,b:[0,1]},{y:0.97,rx:0.235,rz:0.215,b:[0,1]}],28,null,false,false);const gg=toGeo(B);gg.deleteAttribute('skinIndex');gg.deleteAttribute('skinWeight');c.geometry=gg;c.position.set(0,0,0);c.rotation.set(0,0,0);c.material=new THREE.MeshLambertMaterial({color:c.material.color.getHex(),map:skinTex(),roughness:0.9,side:THREE.DoubleSide});}}
      if(m.knees)for(const kn of m.knees)for(const c of kn.children.slice()){if(!c.isMesh||isCyl(c)||c.userData.hdLimb||c.userData.hdPaw)continue;c.userData.hdPaw=1;
        for(let i=-1;i<=1;i++){const toe=new THREE.Mesh(new THREE.SphereGeometry(0.5,8,6),c.material);toe.scale.set(0.06,0.06,0.09);toe.position.set(c.position.x+i*0.07,c.position.y-0.03,c.position.z+0.2);kn.add(toe);}}
    }
  }
}

/* every other creature with a head group: its ball eyes become slanted almonds, its limbs
   take the muscle shape (the boar, minotaur, kurask, basilisk, gargoyle, bandits' beasts) */
function beastEyes(head){
  if(!head)return;
  for(const c of head.children.slice()){const p=c.geometry&&c.geometry.parameters;if(!c.isMesh||!p||c.geometry.type!=='SphereGeometry'||c.userData.hdEye)continue;
    const r=p.radius;if(r<0.018||r>0.046)continue;const col=c.material&&c.material.color?c.material.color:null;if(!col)continue;
    const hsl={};col.getHSL(hsl);if(hsl.s<0.25&&hsl.l>0.2)continue;   /* saturated or very dark: an eye, not a nose or a cheek */
    if(Math.abs(c.position.x)<0.02)continue;
    c.userData.hdEye=1;c.scale.set(c.scale.x*1.3,c.scale.y*0.55,c.scale.z*0.55);c.rotation.z=(c.position.x<0?1:-1)*0.3;
    c.material=new THREE.MeshLambertMaterial({color:col.getHex(),roughness:0.3,emissive:col.getHex(),emissiveIntensity:0.25});}
}
function generic(r){
  const m=r._m;if(!m)return;
  const head=m.head||m.mhead||m.dhead||m.cwHead||m.rhead;
  if(head&&!m.wolf&&!m.dragon&&!m.demon&&!m.goblin&&!m.grat)beastEyes(head);
  if(!m.giant&&!m.skel&&!m.wolf&&!m.dragon&&!m.demon&&!m.goblin&&!m.grat){for(const part of [m.legs,m.arms])if(part)for(const q of part)if(q&&q.isObject3D)reshapeLimbs(q,'muscle');}
}
try{performance.mark('hd:hd-mobs/building');}catch(e){}
/* ------------------------- the weakest of the sheet ------------------------ */
/* faceted rock in a box's proportions: an icosphere pushed by continuous noise, flat shaded */
function rockBlock(w,h,d,seed){
  const g=new THREE.IcosahedronGeometry(0.5,1).toNonIndexed();const p=g.attributes.position;const o=seed*1.37;
  for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i);const l=Math.hypot(x,y,z)||1;const nx=x/l,ny=y/l,nz=z/l;
    const n=0.84+0.28*(0.5+0.5*Math.sin(nx*5.1+o)*Math.cos(ny*4.3+o*2.0)+0.25*Math.sin(nz*7.7+o*3.0));
    p.setXYZ(i,nx*0.5*n*w,ny*0.5*n*h,nz*0.5*n*d);}
  g.computeVertexNormals();return g;
}
const glassMat=new THREE.MeshStandardMaterial({color:0x1c1524,roughness:0.3,metalness:0.15,flatShading:true,emissive:0x3a0c04,emissiveIntensity:0.18});
const iceMat=new THREE.MeshStandardMaterial({color:0xc4e6ff,roughness:0.12,metalness:0.05,flatShading:true,transparent:true,opacity:0.9,emissive:0x2a6aa8,emissiveIntensity:0.3});
function bespoke2(r){
  const m=r._m;if(!m)return;const g=m.group;if(!g)return;
  if(r.kind==='obsidian_golem'){
    /* every slab becomes a shard of volcanic glass; the seams and eyes keep glowing between them */
    let k=0;g.traverse(o=>{if(!o.isMesh||!o.geometry||o.geometry.type!=='BoxGeometry')return;const c=o.material&&o.material.color?o.material.color.getHex():0;if(c!==0x1a1420&&c!==0x2a2036)return;
      const p=o.geometry.parameters;o.geometry=rockBlock(p.width*1.08,p.height*1.05,p.depth*1.08,k++);o.material=glassMat;});
  }
  else if(r.kind==='icefiend'){
    /* a hovering cluster of ice crystals round a cold core, two crystal arms, glowing eyes */
    for(const c of g.children.slice()){const p=c.geometry&&c.geometry.parameters;if(!c.isMesh)continue;if(c.geometry.type==='OctahedronGeometry'||(c.geometry.type==='ConeGeometry'&&p.height===0.2))g.remove(c);}
    const R=(i)=>{const x=Math.sin(i*12.9898)*43758.5453;return x-Math.floor(x);};
    for(let i=0;i<9;i++){const a=i/9*Math.PI*2+R(i)*0.5;const rr=0.06+R(i+3)*0.05,h=0.45+R(i+7)*0.5;const sh=new THREE.Mesh(new THREE.ConeGeometry(rr,h,5),iceMat);
      sh.position.set(Math.sin(a)*0.12,0.5+R(i+11)*0.25,Math.cos(a)*0.12);sh.rotation.set(Math.cos(a)*0.35,a,-Math.sin(a)*0.35);sh.castShadow=true;g.add(sh);
      const dn=new THREE.Mesh(new THREE.ConeGeometry(rr*0.8,h*0.55,5),iceMat);dn.position.set(Math.sin(a)*0.12,0.42,Math.cos(a)*0.12);dn.rotation.set(Math.PI+Math.cos(a)*0.3,a,Math.sin(a)*0.3);g.add(dn);}
    const core=new THREE.Mesh(new THREE.IcosahedronGeometry(0.16,1),new THREE.MeshBasicMaterial({color:0xdff6ff,transparent:true,opacity:0.55,blending:THREE.AdditiveBlending,depthWrite:false}));core.position.y=0.62;g.add(core);
    g.traverse(o=>{if(o.isMesh&&o.geometry.type==='ConeGeometry'&&o.geometry.parameters.height===0.24){o.material=iceMat;o.scale.set(1.6,1.6,1.6);}});
    g.traverse(o=>{if(o.isMesh&&o.geometry.type==='SphereGeometry'&&o.geometry.parameters.radius===0.05){o.material=new THREE.MeshBasicMaterial({color:0xcffcff});o.position.z=0.24;}});
  }
  else if(r.kind==='ember_mote'){
    /* a wisp of fire: an emissive core, a flame plume, a tapering ember tail */
    for(const c of g.children.slice()){if(c.isMesh&&c.geometry.type==='SphereGeometry'&&c.geometry.parameters.radius===0.28)c.visible=false;if(c.isMesh&&c.geometry.type==='ConeGeometry'){c.material=new THREE.MeshBasicMaterial({color:0xff7a2e,transparent:true,opacity:0.45,blending:THREE.AdditiveBlending,depthWrite:false});c.scale.set(0.8,1.4,0.8);}}
    if(HD.makeFlame){try{const f=HD.makeFlame(0.55);if(f){f.position.y=0.02;g.add(f);}}catch(e){}}
    const halo=new THREE.Mesh(new THREE.SphereGeometry(0.3,12,10),new THREE.MeshBasicMaterial({color:0xff6a1e,transparent:true,opacity:0.22,blending:THREE.AdditiveBlending,depthWrite:false}));g.add(halo);
  }
  else if(r.kind==='basilisk'){
    /* a heavier lizard: thicker legs, a scaled hide */
    for(const c of g.children){if(Math.abs(c.position.x-0.22)<0.01||Math.abs(c.position.x+0.22)<0.01){if(Math.abs(c.position.y-0.30)<0.01)c.scale.set(1.7,1.5,1.7);}}
  }
  else if(r.kind==='sentinel'&&m.hm&&m.hm.rArm){
    /* the halberd stands upright at the guard's side, not level across the hips */
    for(const c of m.hm.rArm.children){if(c.isGroup&&c.children.some(q=>q.isMesh&&q.geometry.type==='CylinderGeometry'&&q.geometry.parameters.height===1.9)){c.rotation.x=0.12;c.position.set(0.02,-0.42,0.08);}}
  }
  else if((r.kind==='bandit'||r.kind==='banditleader')&&m.hm&&m.hm.rArm){
    /* a drawn sword points forward and down, not level */
    for(const c of m.hm.rArm.children){if(c.isGroup&&c.children.some(q=>q.isMesh&&q.geometry.type==='BoxGeometry'&&q.geometry.parameters.height>=0.5))c.rotation.x=Math.PI/2-0.8;}
  }
  else if(r.kind==='banshee'||r.kind==='cinder_wraith'||r.kind==='ghost'){
    /* the wraiths: a gaunt face in the hood, streaming hair, clawed hands at the sleeves, a
       hem of long uneven tatters, the whole shroud flattened front to back so it drapes */
    const isB=r.kind==='banshee',isC=r.kind==='cinder_wraith';
    const pale=isC?0x3a2a24:(isB?0xb9c8cc:0xd6dce6),dark=isC?0x120a08:0x101418;
    const sm=(hex,op)=>{const mm=new THREE.MeshLambertMaterial({color:hex,transparent:true,opacity:op||0.85,depthWrite:false});return mm;};
    for(const c of g.children){if(c.isMesh&&c.geometry.type!=='ConeGeometry'&&c.geometry.type!=='SphereGeometry'&&c.position.y===0)c.scale.z=0.72;}   /* the robe sweep */
    const hy=isC?1.7:(isB?1.62:1.71);
    if(!(r.kind==='ghost')){
      const face=new THREE.Mesh(new THREE.SphereGeometry(0.15,12,10),sm(pale,0.95));face.scale.set(0.8,1.15,0.7);face.position.set(0,hy,0.09);g.add(face);
      for(const sx of [-1,1]){const so=new THREE.Mesh(new THREE.SphereGeometry(0.045,8,6),sm(dark,1));so.scale.set(1,1.2,0.6);so.position.set(sx*0.055,hy+0.02,0.17);g.add(so);}
      const mo=new THREE.Mesh(new THREE.SphereGeometry(0.04,8,6),sm(dark,1));mo.scale.set(0.8,1.6,0.5);mo.position.set(0,hy-0.11,0.16);g.add(mo);
    }
    /* hair: long strands streaming back and down from the hood */
    const hairM=sm(isC?0x1a100c:(isB?0xdfe8ea:0xc8ced8),0.8);
    for(let i=0;i<7;i++){const a=(i/6-0.5)*1.6;const L=0.55+((i*37)%5)*0.06;const st=new THREE.Mesh(new THREE.ConeGeometry(0.035,L,5),hairM);st.position.set(Math.sin(a)*0.18,hy-0.05-L*0.3,-0.12-Math.abs(Math.cos(a))*0.08);st.rotation.set(Math.PI-0.35-Math.abs(a)*0.2,0,-a*0.35);g.add(st);}
    /* hands: a palm and three claws at the end of each sleeve */
    if(m.arms)for(const ag of m.arms){const palm=new THREE.Mesh(new THREE.SphereGeometry(0.05,8,6),sm(pale,0.95));palm.scale.set(1,0.7,1.2);palm.position.set(0,-0.55,0.12);ag.add(palm);
      for(const cx of [-1,0,1]){const cl=new THREE.Mesh(new THREE.ConeGeometry(0.014,0.12,4),sm(isC?0xff7a2e:pale,1));cl.position.set(cx*0.03,-0.62,0.17);cl.rotation.x=1.2;ag.add(cl);}}
    /* the hem: longer, thinner, uneven tatters replace the even ring */
    let k=0;for(const c of g.children.slice()){if(c.isMesh&&c.geometry.type==='ConeGeometry'&&c.geometry.parameters.height>=0.4&&c.geometry.parameters.height<=0.42&&c.rotation.x===Math.PI){const L=0.35+((k*53)%7)*0.07;c.geometry=new THREE.ConeGeometry(0.05,L,4);c.position.y-=(L-0.4)*0.5;c.rotation.z=((k*29)%5-2)*0.08;k++;}}
    if(isC&&HD.makeFlame){try{const f=HD.makeFlame(0.5);f.position.set(0,hy-0.1,0.05);g.add(f);}catch(e){}}
  }
  else if(r.kind==='raid_chimera'&&m.necks){
    /* three real heads: a tapered snout with a brow, a row of teeth, the eye in a socket */
    for(const neck of m.necks){for(const c of neck.children.slice()){if(c.isMesh&&c.geometry.type==='SphereGeometry'&&c.geometry.parameters.radius===0.13){const col=c.material.color.getHex();neck.remove(c);
        const hd=new THREE.Mesh(headAlongZ([{z:0,y:0.30,rx:0.13,rz:0.12},{z:0.1,y:0.31,rx:0.13,rz:0.12},{z:0.22,y:0.30,rx:0.10,rz:0.09},{z:0.34,y:0.27,rx:0.075,rz:0.065},{z:0.42,y:0.25,rx:0.05,rz:0.04}],12),partMat(col,false,false));hd.position.set(0,0,0.28);hd.castShadow=true;neck.add(hd);
        const white=partMat(0xe7dcc0,false,true);for(const sx of [-1,1])for(const z of [0.5,0.58,0.66]){const t=new THREE.Mesh(new THREE.ConeGeometry(0.012,0.04,4),white);t.position.set(sx*0.05,0.235,z);t.rotation.x=Math.PI;neck.add(t);}}}}
  }
  else if(r.kind==='minotaur'&&m.mhead){
    /* a brow ridge instead of a box, a brass nose ring */
    for(const c of m.mhead.children){if(c.isMesh&&c.geometry.type==='BoxGeometry'&&c.geometry.parameters.width===0.26){c.geometry=new THREE.SphereGeometry(0.5,12,8);c.scale.set(0.28,0.06,0.13);}}
    const ring=new THREE.Mesh(new THREE.TorusGeometry(0.04,0.008,6,14),new THREE.MeshStandardMaterial({color:0xc9a23d,metalness:0.8,roughness:0.3}));ring.position.set(0,-0.14,0.42);ring.rotation.x=Math.PI/2*0.2;m.mhead.add(ring);
  }
}
/* ----------------------------- building --------------------------------- */
const _game_makeRat=makeRat;
makeRat=function(r){
  curKind=r&&r.kind||null;
  try{return _game_makeRat.apply(this,arguments);}
  finally{try{bespoke(r);bespoke2(r);generic(r);}catch(e){console.warn('[HD] mob',e);}curKind=null;}
};
/* creatures already standing: rebuilt in place */
function rebuild(r){
  const old=r._m&&r._m.group;if(!old||typeof scene==='undefined')return false;
  const vis=old.visible,pos=old.position.clone(),rot=old.rotation.clone(),scl=old.scale.clone();
  scene.remove(old);
  if(typeof proxies!=='undefined'){for(let i=proxies.length-1;i>=0;i--){let q=proxies[i],inside=false;while(q){if(q===old){inside=true;break;}q=q.parent;}if(inside)proxies.splice(i,1);}}
  makeRat(r);
  const g=r._m&&r._m.group;
  if(g){g.visible=vis;g.position.copy(pos);g.rotation.copy(rot);g.scale.copy(scl);}
  return true;
}
let n=0;
if(typeof rats!=='undefined'){for(const r of rats){HD.defer(()=>{try{if(rebuild(r))n++;}catch(e){console.warn('[HD] mob rebuild',r&&r.kind,e);}});}}
HD.rebuildMob=rebuild;
console.log('[HD] creatures rebuilt:',n);
})();
