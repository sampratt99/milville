/* ============================================================================
   Milville HD — magic and endgame gear effects.  Loaded after hd-mobs.js.

   The game draws teleports as a screen flash and eight click rings, spells as
   a 2D dot with a 2D burst, and endgame weapons as static cones. This adds:

     * teleports: a column of light rising from the caster, a ring spreading
       on the ground, and a spiral of motes climbing the column — at the
       departure and at the arrival, in the teleport's own colour (hooked on
       the game's teleBurst, which fires at both ends);
     * spells: a glowing orb that flies the projectile's path with a trail of
       motes and bursts on impact, in the spell's colour (hooked on
       spawnProjectile);
     * staves: the orb pulses and sheds a ring of orbiting motes in its colour;
     * Cindermaw, Emberbrand and Ashfang: living flame tongues and rising
       embers on the maw, along the blade and at the bow's core.

   Every mote is GPU-driven from a seed and a phase; the CPU only sets the
   effect's age and colour each frame.

   Gameplay is untouched: nothing here reads or writes game state.
   ========================================================================== */
(function(){
'use strict';
try{performance.mark('hd:hd-magic');}catch(e){}
const HD=window.HD;
if(!HD||!HD.ready)return;
if(typeof scene==='undefined'||typeof player==='undefined')return;

/* ----------------------------- sprites ---------------------------------- */
const disc=(function(){const S=64,c=document.createElement('canvas');c.width=c.height=S;const g=c.getContext('2d');
  const gr=g.createRadialGradient(S/2,S/2,0,S/2,S/2,S/2);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(0.3,'rgba(255,255,255,0.8)');gr.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle=gr;g.fillRect(0,0,S,S);const t=new THREE.CanvasTexture(c);t.encoding=THREE.LinearEncoding;return t;})();
const glyph=(function(){const S=64,c=document.createElement('canvas');c.width=c.height=S;const g=c.getContext('2d');
  g.strokeStyle='rgba(255,255,255,1)';g.lineWidth=5;g.lineCap='round';
  g.beginPath();g.arc(S/2,S/2,S*0.3,0,Math.PI*2);g.stroke();g.beginPath();g.moveTo(S*0.2,S*0.5);g.lineTo(S*0.8,S*0.5);g.moveTo(S*0.5,S*0.2);g.lineTo(S*0.5,S*0.8);g.stroke();
  const t=new THREE.CanvasTexture(c);t.encoding=THREE.LinearEncoding;return t;})();

/* ------------------------------ motes ----------------------------------- */
/* modes: 0 spiral up (teleport), 1 burst (impact), 2 orbit (a staff orb), 3 embers rising
   (a weapon), 4 trail (behind a bolt: the particle spreads from where it was born) */
const VERT=`
attribute float aSeed;attribute float aPhase;
uniform float uT;uniform float uLife;uniform float uMode;uniform float uSize;
varying float vA;
float h(float s){return fract(sin(s*127.1)*43758.5453);}
void main(){
  float s1=h(aSeed),s2=h(aSeed+3.1),s3=h(aSeed+7.7);
  vec3 p=position;float size=uSize;vA=1.0;
  if(uMode<0.5){
    float t=clamp((uT-aPhase*0.35)/(uLife*0.65),0.0,1.0);
    float a=s1*6.283+t*8.0;float r=0.62*(1.0-t*0.55)+0.08*s2;
    p+=vec3(cos(a)*r,t*2.8+s3*0.2,sin(a)*r);
    vA=sin(3.1416*t)*step(0.001,t);size*=1.0+0.6*s2;
  }else if(uMode<1.5){
    float t=clamp(uT/uLife,0.0,1.0);
    float th=s1*6.283,ph=acos(2.0*s2-1.0);vec3 d=vec3(sin(ph)*cos(th),cos(ph),sin(ph)*sin(th));
    float sp=1.2+s3*2.2;p+=d*sp*t*(1.0-0.35*t);p.y-=2.5*t*t;
    vA=(1.0-t)*(1.0-t);size*=0.7+0.8*s3;
  }else if(uMode<2.5){
    float a=s1*6.283+uT*(0.9+0.5*s2);float r=0.17+0.03*sin(uT*2.0+s3*6.0);
    p+=vec3(cos(a)*r,sin(uT*1.7+s1*6.283)*0.06,sin(a)*r);
    vA=0.55+0.45*sin(uT*3.0+s2*6.283);size*=0.6+0.6*s3;
  }else if(uMode<3.5){
    float t=fract(uT*(0.5+s1*0.5)+aPhase);
    float a=t*5.0*(s2-0.5)+s3*6.283;float r=0.03+t*0.12;
    p+=vec3(cos(a)*r,t*(0.5+s1*0.4),sin(a)*r);
    vA=(1.0-t)*(1.0-t)*smoothstep(0.0,0.08,t);size*=0.6+0.5*s2;
  }else{
    float t=clamp((uT-aPhase*uLife)/(uLife*0.5),0.0,1.0);
    p+=vec3((s1-0.5)*0.3,(s2-0.5)*0.3,(s3-0.5)*0.3)*t;
    vA=(1.0-t)*step(0.0,uT-aPhase*uLife);size*=0.5+0.6*s2;
  }
  vec4 mv=modelViewMatrix*vec4(p,1.0);
  gl_PointSize=size*(320.0/-mv.z);
  gl_Position=projectionMatrix*mv;
}`;
const FRAG=`uniform sampler2D tMap;uniform vec3 uColor;uniform float uGain;varying float vA;
void main(){vec4 t=texture2D(tMap,gl_PointCoord);gl_FragColor=vec4(uColor*uGain,t.a*vA);}`;
function motes(n,mode,color,size,life,map,spread){
  const g=new THREE.BufferGeometry();
  const pos=new Float32Array(n*3),seed=new Float32Array(n),ph=new Float32Array(n);
  for(let i=0;i<n;i++){const sp=spread||0;pos[i*3]=(Math.random()-0.5)*sp;pos[i*3+1]=(Math.random()-0.5)*sp;pos[i*3+2]=(Math.random()-0.5)*sp;seed[i]=Math.random()*1000;ph[i]=Math.random();}
  g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('aSeed',new THREE.BufferAttribute(seed,1));g.setAttribute('aPhase',new THREE.BufferAttribute(ph,1));
  g.boundingSphere=new THREE.Sphere(new THREE.Vector3(0,1,0),6);
  const m=new THREE.ShaderMaterial({uniforms:{uT:{value:0},uLife:{value:life||1},uMode:{value:mode},uSize:{value:size},uColor:{value:new THREE.Color(color)},uGain:{value:1.6},tMap:{value:map||disc}},
    vertexShader:VERT,fragmentShader:FRAG,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
  const pts=new THREE.Points(g,m);pts.frustumCulled=false;pts.userData.hdNoAO=1;return pts;
}

/* --------------------------- the light column ---------------------------- */
const colMat=new THREE.ShaderMaterial({
  uniforms:{uT:{value:0},uLife:{value:1},uColor:{value:new THREE.Color(0x8ab8ff)},tNoise:{value:HD.tex&&HD.tex.cloud||null}},
  vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader:`uniform float uT;uniform float uLife;uniform vec3 uColor;uniform sampler2D tNoise;varying vec2 vUv;
    void main(){float f=uT/uLife;float env=smoothstep(0.0,0.15,f)*(1.0-smoothstep(0.55,1.0,f));
      float n=texture2D(tNoise,vec2(vUv.x*2.0,vUv.y*1.5-uT*1.4)).r;float n2=texture2D(tNoise,vec2(vUv.x*3.0+0.3,vUv.y*2.0-uT*2.3)).r;
      float band=smoothstep(0.35,0.85,n*0.6+n2*0.4);
      float vert=(1.0-smoothstep(0.55,1.0,vUv.y))*smoothstep(0.0,0.08,vUv.y);
      gl_FragColor=vec4(uColor*1.8,(0.18+0.55*band)*vert*env);}`,
  transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide});
const colGeo=new THREE.CylinderGeometry(0.42,0.5,3.4,28,1,true);colGeo.translate(0,1.7,0);
const ringGeo=new THREE.RingGeometry(0.72,0.9,40);ringGeo.rotateX(-Math.PI/2);
const ringMat=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0.8,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide});

/* ------------------------------ effects --------------------------------- */
const live=[];
function cssHex(col){try{return new THREE.Color(col).getHex();}catch(e){return 0x8ab8ff;}}
function teleportFx(wx,wz,col){
  const g=new THREE.Group();g.position.set(wx,groundH(wx,wz)+0.02,wz);scene.add(g);
  const cm=colMat.clone();cm.uniforms.uColor.value=new THREE.Color(col);cm.uniforms.tNoise.value=HD.tex&&HD.tex.cloud||null;cm.uniforms.uLife.value=0.9;
  const column=new THREE.Mesh(colGeo,cm);column.userData.hdNoAO=1;g.add(column);
  const rm=ringMat.clone();rm.color.set(col);const ring=new THREE.Mesh(ringGeo,rm);ring.position.y=0.03;g.add(ring);
  const m1=motes(90,0,col,0.16,0.9);g.add(m1);const m2=motes(30,0,col,0.22,0.9,glyph);g.add(m2);
  live.push({g,t0:performance.now(),life:900,tick:(t)=>{cm.uniforms.uT.value=t;m1.material.uniforms.uT.value=t;m2.material.uniforms.uT.value=t;const f=t/0.9;ring.scale.setScalar(0.4+f*1.4);rm.opacity=0.85*(1-f);}});
}
function burst(wx,wy,wz,col,n){
  const g=new THREE.Group();g.position.set(wx,wy,wz);scene.add(g);
  const m=motes(n||40,1,col,0.14,0.6);g.add(m);
  const fl=new THREE.Sprite(new THREE.SpriteMaterial({map:disc,color:col,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));fl.scale.setScalar(0.9);g.add(fl);
  live.push({g,t0:performance.now(),life:600,tick:(t)=>{m.material.uniforms.uT.value=t;const f=t/0.6;fl.scale.setScalar(0.9+f*1.2);fl.material.opacity=1-f;}});
}
/* a bolt flies the projectile's own path: the game keeps {x0,z0,y0,ex,ez,t0,dur} */
function boltFx(pr){
  const col=cssHex(pr.col);const g=new THREE.Group();scene.add(g);
  const orb=new THREE.Sprite(new THREE.SpriteMaterial({map:disc,color:col,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));orb.scale.setScalar(0.5);g.add(orb);
  const core=new THREE.Sprite(new THREE.SpriteMaterial({map:disc,color:0xffffff,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));core.scale.setScalar(0.22);g.add(core);
  const trail=motes(40,4,col,0.12,pr.dur/1000);trail.position.set(0,0,0);scene.add(trail);
  const tp=trail.geometry.attributes.position;let k=0;
  const life=pr.dur+80;let done=false;
  live.push({g,t0:pr.t0,life,extra:[trail],tick:(t,now)=>{
    const f=Math.min(1,(now-pr.t0)/pr.dur);
    const x=pr.x0+(pr.ex-pr.x0)*f,z=pr.z0+(pr.ez-pr.z0)*f,y=pr.y0+Math.sin(f*Math.PI)*0.45;
    g.position.set(x,y,z);orb.scale.setScalar(0.45+0.1*Math.sin(now*0.03));
    /* lay motes along the flight */
    const want=Math.floor(f*40);while(k<want&&k<40){tp.setXYZ(k,x,y,z);k++;}tp.needsUpdate=true;
    trail.material.uniforms.uT.value=t;
    if(f>=1&&!done){done=true;g.visible=false;burst(x,y,z,col,28);}
  }});
}

/* an arrow flies the projectile's path in 3D: a shaft, a head and fletching, turned along its
   own velocity; the game's 2D overlay arrow is off under HD */
let arrowGeo=null,arrowMats=null;
function arrowMesh(){
  if(!arrowGeo){
    const shaft=new THREE.CylinderGeometry(0.006,0.006,0.5,5);shaft.rotateZ(Math.PI/2);
    const head=new THREE.ConeGeometry(0.016,0.06,5);head.rotateZ(-Math.PI/2);head.translate(0.27,0,0);
    const f1=new THREE.PlaneGeometry(0.07,0.03);f1.translate(-0.21,0.012,0);const f2=f1.clone();f2.rotateX(Math.PI/2);
    arrowGeo=[shaft,head,f1,f2];
    arrowMats=[new THREE.MeshLambertMaterial({color:0x8a6a44}),new THREE.MeshStandardMaterial({color:0xc8ccd2,metalness:0.6,roughness:0.35}),new THREE.MeshLambertMaterial({color:0xe6e0cf,side:THREE.DoubleSide}),new THREE.MeshLambertMaterial({color:0xe6e0cf,side:THREE.DoubleSide})];
  }
  const g=new THREE.Group();for(let i=0;i<4;i++){const m=new THREE.Mesh(arrowGeo[i],arrowMats[i]);m.castShadow=true;g.add(m);}return g;
}
const _av=new THREE.Vector3(),_ap=new THREE.Vector3();
function arrowFx(pr){
  const g=arrowMesh();scene.add(g);
  const th=(typeof groundH==='function'?groundH(pr.ex,pr.ez):pr.y0-1)+0.5;
  const path=(f)=>[pr.x0+(pr.ex-pr.x0)*f,pr.y0+(th-pr.y0)*f+Math.sin(f*Math.PI)*0.45,pr.z0+(pr.ez-pr.z0)*f];
  live.push({g,t0:pr.t0,life:pr.dur+40,tick:(t,now)=>{
    const f=Math.min(1,(now-pr.t0)/pr.dur);const p=path(f),q=path(Math.min(1,f+0.04));
    g.position.set(p[0],p[1],p[2]);_av.set(q[0]-p[0],q[1]-p[1],q[2]-p[2]);
    if(_av.lengthSq()>1e-8){_ap.copy(g.position).add(_av);g.lookAt(_ap);g.rotateY(-Math.PI/2);}   /* the shaft runs along +x */
    if(f>=1)g.visible=false;
  }});
}
/* ------------------------------- hooks ---------------------------------- */
if(typeof teleBurst==='function'){const _tb=teleBurst;teleBurst=function(col){const r=_tb.apply(this,arguments);try{teleportFx(player.x+0.5,player.y+0.5,cssHex(col));}catch(e){}return r;};}
if(typeof spawnProjectile==='function'&&typeof projectiles!=='undefined'){const _sp=spawnProjectile;spawnProjectile=function(){const r=_sp.apply(this,arguments);try{const pr=projectiles[projectiles.length-1];if(pr&&pr.kind==='arrow'){if(HD.arrowFx)HD.arrowFx(pr);}else if(pr)boltFx(pr);}catch(e){console.warn('[HD] projectile fx',e);}return r;};}
HD.arrowFx=arrowFx;

/* ------------------------------ weapons --------------------------------- */
const dressed=new Set();
function dressStaff(st){
  const orb=st.userData&&st.userData.orb;if(!orb||dressed.has(st))return;dressed.add(st);
  const col=orb.material&&orb.material.color?orb.material.color.getHex():0xb98fd0;
  const halo=new THREE.Sprite(new THREE.SpriteMaterial({map:disc,color:col,transparent:true,opacity:0.7,blending:THREE.AdditiveBlending,depthWrite:false}));halo.position.copy(orb.position);halo.scale.setScalar(0.62);st.add(halo);
  const ring=motes(18,2,col,0.07,1);ring.position.copy(orb.position);st.add(ring);
  if(st.userData.orbGlow)st.userData.orbGlow.visible=false;
  st.userData.hdMagic={halo,ring,orb};
}
function tickStaff(st,now){const d=st.userData.hdMagic;if(!d)return;
  const c=d.orb.material&&d.orb.material.color;if(c){d.halo.material.color.copy(c);d.ring.material.uniforms.uColor.value.copy(c);}
  d.halo.scale.setScalar(0.55+0.1*Math.sin(now*0.004));d.ring.material.uniforms.uT.value=now*0.001;}
function emberise(grp,spots,emberSpots){
  if(dressed.has(grp))return;dressed.add(grp);
  const fl=[];
  if(HD.makeFlame)for(const [x,y,z,s,rot] of spots){const f=HD.makeFlame(s,Math.random()*6,0.4);f.position.set(x,y,z);if(rot)f.rotation.set(rot[0],rot[1],rot[2]);grp.add(f);fl.push(f);}
  const em=[];for(const [x,y,z,n] of emberSpots){const m=motes(n,3,0xff8a3a,0.06,1,disc,0.08);m.position.set(x,y,z);grp.add(m);em.push(m);}
  grp.userData.hdMagic={fl,em};
}
function tickEmber(grp,now){const d=grp.userData.hdMagic;if(!d||!d.em)return;for(const m of d.em)m.material.uniforms.uT.value=now*0.001;}
const staves=new Set(),embers=new Set();
function scan(){
  /* the player's own */
  try{if(typeof staffM!=='undefined'){dressStaff(staffM);staves.add(staffM);}}catch(e){}
  try{if(typeof cinStaffM!=='undefined'&&!dressed.has(cinStaffM)){emberise(cinStaffM,[[0,1.0,0,0.5]],[[0,1.02,0,26]]);cinStaffM.traverse(o=>{if(o.isMesh&&o.material&&o.material.transparent&&o.material.opacity<0.9&&o.geometry.type==='ConeGeometry')o.visible=false;});embers.add(cinStaffM);}}catch(e){}
  try{if(typeof emberSwM!=='undefined'&&!dressed.has(emberSwM)){emberise(emberSwM,[[0,-0.45,0,0.3,[Math.PI,0,0]],[0,-0.75,0,0.34,[Math.PI,0,0]],[0,-1.05,0,0.3,[Math.PI,0,0]]],[[0,-0.7,0,30]]);embers.add(emberSwM);}}catch(e){}
  try{if(typeof ashBowM!=='undefined'&&!dressed.has(ashBowM)){emberise(ashBowM,[[0,0,0.05,0.28]],[[0,0,0.05,22]]);embers.add(ashBowM);}}catch(e){}
  /* remote players' staves */
  if(HD.bodies)for(const b of HD.bodies){for(const ag of b.upper.children){if(!ag.isGroup||!ag.userData.sleeve)continue;for(const tool of ag.children){if(!tool.isGroup)continue;for(const st of tool.children){if(st.isGroup&&st.userData&&st.userData.orb){dressStaff(st);staves.add(st);}}}}}
}
let _scan=0;
HD.tick=HD.tick||[];
HD.tick.push(function(now){
  if(now-_scan>1500){_scan=now;try{scan();}catch(e){}}
  for(const st of staves)if(st.visible)tickStaff(st,now);
  for(const g of embers)if(g.visible)tickEmber(g,now);
  for(let i=live.length-1;i>=0;i--){const e=live[i];const t=(now-e.t0)*0.001;
    if(now-e.t0>e.life){scene.remove(e.g);if(e.extra)for(const x of e.extra)scene.remove(x);e.g.traverse(o=>{if(o.material&&o.material.dispose&&!(o.material===ringMat||o.material===colMat))o.material.dispose();});live.splice(i,1);continue;}
    try{e.tick(t,now);}catch(err){}
  }
});
HD.teleportFx=teleportFx;HD.burstFx=burst;
console.log('[HD] magic effects ready');
})();
