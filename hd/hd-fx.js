/* ============================================================================
   Milville HD — effects.  Loaded after hd-props.js.

   Fire. Every lit fire, brazier and torch in the game is two cones and a
   flickering point light. This adds GPU particle emitters to each: embers
   that spiral up and wink out, licks of flame that flutter over the cones,
   and a plume of soft smoke that drifts and thins. The particles never touch
   the CPU after creation: each carries a seed and a phase, and the vertex
   shader derives its position, size and fade from time alone.

   Gameplay is untouched: nothing here reads or writes game state.
   ========================================================================== */
(function(){
'use strict';
try{performance.mark('hd:hd-fx');}catch(e){}
const HD=window.HD;
if(!HD||!HD.ready)return;
if(typeof objects==='undefined')return;

/* soft disc sprite */
const discTex=(function(){
  const S=64,c=document.createElement('canvas');c.width=c.height=S;const g=c.getContext('2d');
  const gr=g.createRadialGradient(S/2,S/2,0,S/2,S/2,S/2);
  gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(0.35,'rgba(255,255,255,0.75)');gr.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle=gr;g.fillRect(0,0,S,S);
  const t=new THREE.CanvasTexture(c);t.encoding=THREE.LinearEncoding;return t;
})();
/* flame lick sprite: a teardrop, brighter at the base */
const flameTex=(function(){
  const S=64,c=document.createElement('canvas');c.width=c.height=S;const g=c.getContext('2d');
  const gr=g.createRadialGradient(S/2,S*0.68,0,S/2,S*0.6,S*0.5);
  gr.addColorStop(0,'rgba(255,240,200,1)');gr.addColorStop(0.3,'rgba(255,170,60,0.9)');gr.addColorStop(0.7,'rgba(255,80,20,0.35)');gr.addColorStop(1,'rgba(255,40,10,0)');
  g.fillStyle=gr;g.beginPath();g.moveTo(S/2,2);g.quadraticCurveTo(S*0.95,S*0.55,S/2,S-2);g.quadraticCurveTo(S*0.05,S*0.55,S/2,2);g.closePath();g.fill();
  const t=new THREE.CanvasTexture(c);t.encoding=THREE.LinearEncoding;return t;
})();

const VERT=`
attribute float aSeed;attribute float aPhase;attribute float aType;
uniform float uTime;uniform float uScale;
varying float vAlpha;varying vec3 vCol;varying float vType;
#include <fog_pars_vertex>
float h1(float s){return fract(sin(s*127.1)*43758.5453);}
void main(){
  float s1=h1(aSeed),s2=h1(aSeed+3.1),s3=h1(aSeed+7.7);
  vec3 p=position;float t,size;vAlpha=1.0;vType=aType;
  if(aType<0.5){                       /* ember */
    t=fract(uTime*(0.35+s1*0.35)+aPhase);
    float r=0.05+t*0.25;float a=t*6.0*(s2-0.5)+s3*6.28;
    p+=vec3(cos(a)*r,t*(1.4+s1*1.2),sin(a)*r);
    size=0.05+0.03*s2;vAlpha=(1.0-t)*(1.0-t)*smoothstep(0.0,0.08,t);
    vCol=mix(vec3(1.0,0.75,0.25),vec3(1.0,0.25,0.05),t);
  }else if(aType<1.5){                 /* smoke */
    t=fract(uTime*(0.12+s1*0.08)+aPhase);
    float sway=sin(uTime*1.1+s2*6.28+t*4.0)*0.12;
    p+=vec3(sway+(s2-0.5)*0.2*t,0.5+t*(2.6+s1*1.0),(s3-0.5)*0.2*t+cos(uTime*0.9+s1*6.28)*0.1);
    size=0.35+t*0.9;vAlpha=(1.0-t)*smoothstep(0.0,0.15,t)*0.28;
    vCol=vec3(0.32,0.3,0.28);
  }else{                               /* flame lick */
    t=fract(uTime*(1.6+s1*0.8)+aPhase);
    p+=vec3((s2-0.5)*0.22*(1.0-t),t*0.55,(s3-0.5)*0.22*(1.0-t));
    size=0.22+0.18*(1.0-t)+0.08*s2;vAlpha=(1.0-t)*smoothstep(0.0,0.1,t);
    vCol=vec3(1.0);
  }
  vec4 mvPosition=modelViewMatrix*vec4(p,1.0);
  gl_PointSize=size*uScale*(300.0/-mvPosition.z);
  gl_Position=projectionMatrix*mvPosition;
  #include <fog_vertex>
}`;
const FRAG=`
uniform sampler2D tDisc;uniform sampler2D tFlame;
varying float vAlpha;varying vec3 vCol;varying float vType;
#include <fog_pars_fragment>
void main(){
  vec4 tx=(vType>1.5)?texture2D(tFlame,gl_PointCoord):texture2D(tDisc,gl_PointCoord);
  vec3 col=(vType>1.5)?tx.rgb*2.2:vCol*(vType<0.5?2.5:1.0);
  gl_FragColor=vec4(col,tx.a*vAlpha);
  #include <fog_fragment>
}`;
function mat(additive){
  return new THREE.ShaderMaterial({
    uniforms:THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{uTime:{value:0},uScale:{value:1},tDisc:{value:discTex},tFlame:{value:flameTex}}]),
    vertexShader:VERT,fragmentShader:FRAG,transparent:true,depthWrite:false,fog:true,
    blending:additive?THREE.AdditiveBlending:THREE.NormalBlending
  });
}
const MAT_FIRE=mat(true),MAT_SMOKE=mat(false);
const mats=[MAT_FIRE,MAT_SMOKE];

function emitter(n,type,seedBase,size){
  const g=new THREE.BufferGeometry();
  const pos=new Float32Array(n*3),seed=new Float32Array(n),ph=new Float32Array(n),ty=new Float32Array(n);
  for(let i=0;i<n;i++){pos[i*3]=(Math.random()-0.5)*size;pos[i*3+2]=(Math.random()-0.5)*size;seed[i]=seedBase+i*1.37;ph[i]=Math.random();ty[i]=type;}
  g.setAttribute('position',new THREE.BufferAttribute(pos,3));
  g.setAttribute('aSeed',new THREE.BufferAttribute(seed,1));
  g.setAttribute('aPhase',new THREE.BufferAttribute(ph,1));
  g.setAttribute('aType',new THREE.BufferAttribute(ty,1));
  g.boundingSphere=new THREE.Sphere(new THREE.Vector3(0,1.5,0),3);
  return g;
}
/* the flame itself: a tapered tongue whose vertices sway and stretch with time, and whose
   surface is a scrolling fire-noise ramp (yellow core, orange body, red licks) cut by the noise
   so the edges tear and flicker. Three tongues nest at different sizes and phases. */
const flameGeo=(function(){
  const pts=[];for(let i=0;i<=12;i++){const t=i/12;const r=0.24*Math.sin(Math.PI*Math.min(1,t*1.15))*(1-t*0.25);pts.push(new THREE.Vector2(Math.max(0.005,r),t*0.9));}
  const g=new THREE.LatheGeometry(pts,20);g.translate(0,0,0);return g;
})();
const flameMat=new THREE.ShaderMaterial({
  uniforms:{uTime:{value:0},tNoise:{value:HD.tex.cloud},uPhase:{value:0},uInner:{value:0}},
  vertexShader:`uniform float uTime;uniform float uPhase;varying vec2 vUv;varying float vH;
    void main(){
      vUv=uv;vH=position.y/0.9;
      vec3 p=position;
      float t=uTime*2.2+uPhase;
      /* sway grows with height; the tip whips faster */
      float s=vH*vH;
      p.x+=sin(t*1.7+vH*6.0)*0.09*s+sin(t*3.9+vH*11.0)*0.03*s;
      p.z+=cos(t*1.3+vH*5.0)*0.09*s+cos(t*4.3+vH*9.0)*0.03*s;
      p.y*=0.9+0.22*sin(t*2.6+uPhase)+0.08*sin(t*7.1);
      gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
    }`,
  fragmentShader:`uniform float uTime;uniform float uPhase;uniform float uInner;uniform sampler2D tNoise;varying vec2 vUv;varying float vH;
    void main(){
      float t=uTime;
      float n1=texture2D(tNoise,vec2(vUv.x*2.0+uPhase,vUv.y*1.6-t*0.9)).r;
      float n2=texture2D(tNoise,vec2(vUv.x*3.7-t*0.2,vUv.y*2.9-t*1.7)).r;
      float n=n1*0.6+n2*0.4;
      /* the tongue thins upward: cut where the noise falls below a rising threshold */
      /* solid over the lower half, torn into licks above it */
      float cut=smoothstep(vH*1.25-0.62,vH*1.25-0.22,n);
      float core=smoothstep(0.3,0.85,n)*(1.0-vH*0.6);
      /* red licks at the edges, an orange body, a yellow-white heart low down */
      vec3 col=mix(vec3(0.85,0.12,0.02),vec3(1.0,0.45,0.06),core);
      col=mix(col,vec3(1.0,0.9,0.55),core*core*(1.0-vH)*(0.7+0.5*uInner));
      float edge=smoothstep(0.0,0.35,n-(vH*1.25-0.62));
      col=mix(vec3(0.6,0.05,0.0),col,edge);
      float a=cut*(1.0-smoothstep(0.8,1.0,vH))*(0.92+0.08*uInner);
      gl_FragColor=vec4(col*(1.35+uInner*0.6),a);
    }`,
  transparent:true,depthWrite:false,blending:THREE.NormalBlending,side:THREE.DoubleSide
});
const flameMats=[];
function flame(scale,phase,inner){
  const m=flameMat.clone();m.uniforms.uPhase.value=phase;m.uniforms.uInner.value=inner;m.uniforms.tNoise.value=HD.tex.cloud;flameMats.push(m);
  const mesh=new THREE.Mesh(flameGeo,m);mesh.scale.setScalar(scale);mesh.userData.hdNoAO=1;mesh.frustumCulled=true;return mesh;
}
function attach(o){
  const m=o._m;if(!m||!m.flames||!m.group||m.group.userData.hdFx)return;
  m.group.userData.hdFx=1;
  /* living flames replace the cones (which stay as invisible anchors the game still scales) */
  {
    /* the cone's own span (centre +- half height) is where the flame belongs */
    const fp=m.flames[0].geometry.parameters||{};
    const base=m.flames[0].position.clone();base.y-=(fp.height||0.72)*0.5-0.02;
    const sc=Math.max(0.5,Math.min(1.4,fp.radius?fp.radius/0.24:1));
    const seed=(o.x*13+o.y*7)%1000;
    for(const [s,ph,inn,dx,dz] of [[1.35*sc,seed*0.1,0,0,0],[1.0*sc,seed*0.1+2.1,0.5,0.07,-0.06],[0.7*sc,seed*0.1+4.2,1.0,-0.06,0.06]]){
      const f=flame(s,ph,inn);f.position.set(base.x+dx,base.y,base.z+dz);f.rotation.y=ph;m.group.add(f);
    }
    for(const f of m.flames){f.visible=false;}
  }
  const base=m.flames[0].position.clone();base.y-=0.3;
  const sc=Math.max(0.5,Math.min(1.4,m.flames[0].geometry.parameters?m.flames[0].geometry.parameters.radius/0.24:1));
  const seed=(o.x*13+o.y*7)%1000;
  const fire=new THREE.Points(emitter(26,2,seed,0.15*sc),MAT_FIRE);fire.position.copy(base);fire.scale.setScalar(sc);
  const emb=new THREE.Points(emitter(22,0,seed+500,0.2*sc),MAT_FIRE);emb.position.copy(base);emb.position.y+=0.3;emb.scale.setScalar(sc);
  const smk=new THREE.Points(emitter(18,1,seed+900,0.2*sc),MAT_SMOKE);smk.position.copy(base);smk.scale.setScalar(sc);
  for(const p of[fire,emb,smk]){p.userData.hdNoAO=1;p.frustumCulled=true;m.group.add(p);}
  if(m.light){m.light.distance*=1.3;m.light.color.setHex(0xff9a40);}
}
let n=0;for(const o of objects){if(o._m&&o._m.flames){attach(o);n++;}}
if(typeof buildObjModel==='function'){
  const _b=buildObjModel;
  buildObjModel=function(o){const r=_b.apply(this,arguments);try{if(o&&o._m&&o._m.flames)attach(o);}catch(e){}return r;};
}
/* ambient motes: pollen and dust drifting through the air around the player by day, a
   scatter of fireflies at dawn and dusk. One Points object that follows the player. */
const MOTES=260;
const moteMat=new THREE.ShaderMaterial({
  uniforms:THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{uTime:{value:0},uFire:{value:0},uSun:{value:new THREE.Color(1,1,1)},tDisc:{value:discTex}}]),
  vertexShader:`attribute float aSeed;uniform float uTime;uniform float uFire;varying float vA;varying float vFire;
    #include <fog_pars_vertex>
    float h1(float s){return fract(sin(s*127.1)*43758.5453);}
    void main(){
      float s1=h1(aSeed),s2=h1(aSeed+1.3),s3=h1(aSeed+2.9),s4=h1(aSeed+4.1);
      /* a slow loop through a 28x9x28 box; every mote has its own phase, height and sway */
      float t=fract(uTime*(0.012+s1*0.02)+s2);
      vec3 p=vec3((s1-0.5)*22.0+sin(uTime*0.35+s3*6.28)*1.6,0.3+s3*mix(2.6,4.5,uFire)+sin(uTime*0.5+s4*6.28)*0.4,(s2-0.5)*22.0+cos(uTime*0.3+s1*6.28)*1.6);
      p.x+=sin(t*6.28)*3.0;p.z+=cos(t*6.28)*3.0;
      float blink=0.55+0.45*sin(uTime*(2.0+s4*3.0)+s1*20.0);
      vA=mix(0.16,blink,uFire)*smoothstep(0.0,0.5,s4+0.2);
      vFire=uFire;
      vec4 mvPosition=modelViewMatrix*vec4(p,1.0);
      float d=-mvPosition.z;
      vA*=smoothstep(1.5,4.0,d)*(1.0-smoothstep(mix(9.0,20.0,uFire),mix(14.0,30.0,uFire),d));
      gl_PointSize=(mix(0.022,0.07,uFire)+0.012*s3)*(300.0/d);
      gl_Position=projectionMatrix*mvPosition;
      #include <fog_vertex>
    }`,
  fragmentShader:`uniform sampler2D tDisc;uniform vec3 uSun;varying float vA;varying float vFire;
    #include <fog_pars_fragment>
    void main(){vec4 tx=texture2D(tDisc,gl_PointCoord);vec3 col=mix(uSun*1.6,vec3(0.75,1.0,0.35)*3.0,vFire);gl_FragColor=vec4(col,tx.a*vA);
    #include <fog_fragment>
    }`,
  transparent:true,depthWrite:false,fog:true,blending:THREE.AdditiveBlending
});
const motes=(function(){
  const g=new THREE.BufferGeometry();
  const pos=new Float32Array(MOTES*3),seed=new Float32Array(MOTES);
  for(let i=0;i<MOTES;i++)seed[i]=i*1.71+0.5;
  g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('aSeed',new THREE.BufferAttribute(seed,1));
  const p=new THREE.Points(g,moteMat);p.frustumCulled=false;p.userData.hdNoAO=1;p.name='hdMotes';scene.add(p);return p;
})();

HD.tick=HD.tick||[];
HD.tick.push(function(now,px,py,pz){
  const t=now*0.001;for(const m of mats)m.uniforms.uTime.value=t;
  for(const m of flameMats)m.uniforms.uTime.value=t;
  moteMat.uniforms.uTime.value=t;
  motes.position.set(px,py,pz);
  const dayT=HD.day?HD.day.t:0.5;
  const dusk=1.0-Math.min(1,Math.abs(dayT-0.5)/0.4);           /* 1 at noon, 0 at the ends */
  const fire=1.0-Math.min(1,dusk*4.0);                         /* fireflies only in the last tenth */
  const rain=HD.weather?HD.weather.w.rain:0;
  moteMat.uniforms.uFire.value=fire;
  /* outdoors: pollen by day and fireflies at dusk; indoors: dust hanging in the torchlight */
  motes.visible=rain<0.5||!!HD._indoors;
  if(HD._indoors)moteMat.uniforms.uFire.value=0;
  if(HD.sunDir&&sun)moteMat.uniforms.uSun.value.copy(sun.color);
});
/* ------------------------------ lava spurts ------------------------------ */
/* Gobs of melt popping off the wilderness pools: a small CPU-simulated Points cloud. Each
   particle is launched from a random lava tile, flies a parabola, and lands with a burst of
   three droplets. Only pools within 70 units of the player spawn. */
const SPURTS=96;
const spurtMat=new THREE.ShaderMaterial({
  uniforms:THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{tDisc:{value:discTex}}]),
  vertexShader:`attribute float aSize;attribute float aHeat;varying float vHeat;
    #include <fog_pars_vertex>
    void main(){vHeat=aHeat;vec4 mvPosition=modelViewMatrix*vec4(position,1.0);gl_PointSize=aSize*(640.0/max(1.0,-mvPosition.z));gl_Position=projectionMatrix*mvPosition;
      #include <fog_vertex>
    }`,
  fragmentShader:`uniform sampler2D tDisc;varying float vHeat;
    #include <fog_pars_fragment>
    void main(){float a=texture2D(tDisc,gl_PointCoord).a;if(a<0.05)discard;
      vec3 col=mix(vec3(1.0,0.28,0.04),vec3(1.0,0.85,0.35),vHeat);
      gl_FragColor=vec4(col*1.8,a*(0.6+0.4*vHeat));
      #include <tonemapping_fragment>
      #include <encodings_fragment>
      #include <fog_fragment>
    }`,
  transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,fog:true
});
const spurts=(function(){
  if(!HD.lavaTiles||!HD.lavaTiles.length)return null;
  const g=new THREE.BufferGeometry();
  const pos=new Float32Array(SPURTS*3),size=new Float32Array(SPURTS),heat=new Float32Array(SPURTS);
  g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('aSize',new THREE.BufferAttribute(size,1));g.setAttribute('aHeat',new THREE.BufferAttribute(heat,1));
  const p=new THREE.Points(g,spurtMat);p.frustumCulled=false;p.userData.hdNoAO=1;p.name='hdSpurts';worldGroup.add(p);
  const st=[];for(let i=0;i<SPURTS;i++)st.push({alive:false,x:0,y:0,z:0,vx:0,vy:0,vz:0,born:0,gy:0,drop:false});
  return {points:p,st,pos,size,heat};
})();
const _tmpPos=new THREE.Vector3();
/* an eruption: a flash on the surface, a fountain of gobs, a lingering glow */
const flashMat=new THREE.SpriteMaterial({map:discTex,color:0xffb060,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,opacity:0});
const flash=new THREE.Sprite(flashMat);flash.scale.set(3,3,1);flash.visible=false;flash.userData.hdNoAO=1;worldGroup.add(flash);
let flashT0=-1e9;
function erupt(S,now,t){
  const x=t[0]+Math.random(),z=t[1]+Math.random();
  const lvl=HD.lavaLevelAt?HD.lavaLevelAt(x,z):NaN;const gy=(lvl===lvl?lvl:(HD.terrainY?HD.terrainY(x,z):groundH(x,z)))+0.04;
  let made=0;
  for(let k=0;k<SPURTS&&made<26;k++){const s=S.st[k];if(s.alive)continue;const a=Math.random()*6.28,sp=0.6+Math.random()*1.6;
    s.alive=true;s.drop=false;s.big=true;s.bubble=false;s.x=x;s.z=z;s.y=gy;s.gy=gy;s.vx=Math.cos(a)*sp;s.vz=Math.sin(a)*sp;s.vy=3.5+Math.random()*4.5;s.born=now;made++;}
  flash.position.set(x,gy+0.4,z);flash.visible=true;flashT0=now;
}
function spurtTick(now,dt,px,pz){
  if(!spurts)return;
  const S=spurts,vis=!HD._indoors;S.points.visible=vis;if(!vis){flash.visible=false;return;}
  /* the flash swells and dies in half a second */
  if(flash.visible){const k=(now-flashT0)/550;if(k>=1)flash.visible=false;else{flashMat.opacity=(1-k)*0.9;const sc=2.0+k*3.5;flash.scale.set(sc,sc,1);}}
  /* pools near the player */
  let near=null;
  if(!S.near||now-S.nearAt>1500){near=HD.lavaTiles.filter(t=>Math.hypot(t[0]+0.5-px,t[1]+0.5-pz)<70);S.near=near;S.nearAt=now;}else near=S.near;
  const dts=dt*0.001;
  if(near.length&&now>(S.nextBurst||0)){erupt(S,now,near[(Math.random()*near.length)|0]);S.nextBurst=now+4500+Math.random()*9000;}
  for(let i=0;i<SPURTS;i++){
    const s=S.st[i];
    if(s.alive&&s.bubble){
      if(now-s.born>s.life){
        /* burst: three droplets */
        s.alive=false;s.bubble=false;let made=0;for(let k=0;k<SPURTS&&made<3;k++){const d=S.st[k];if(d.alive)continue;const a=Math.random()*6.28;d.alive=true;d.drop=true;d.bubble=false;d.x=s.x;d.z=s.z;d.y=s.gy+0.02;d.gy=s.gy;d.vx=Math.cos(a)*0.6;d.vz=Math.sin(a)*0.6;d.vy=1.0+Math.random()*1.0;d.born=now;made++;}
      }
    }else if(s.alive){
      s.vy-=9.0*dts;s.x+=s.vx*dts;s.y+=s.vy*dts;s.z+=s.vz*dts;
      if(s.y<s.gy){
        s.alive=false;
        if(!s.drop){/* landing burst: three droplets */let made=0;for(let k=0;k<SPURTS&&made<3;k++){const d=S.st[k];if(d.alive)continue;const a=Math.random()*6.28;d.alive=true;d.drop=true;d.x=s.x;d.z=s.z;d.y=s.gy+0.02;d.gy=s.gy;d.vx=Math.cos(a)*0.8;d.vz=Math.sin(a)*0.8;d.vy=1.2+Math.random()*1.2;d.born=now;made++;}}
      }
    }else if(near.length&&Math.random()<0.02){
      /* a bubble: sits on the surface, swells, bursts */
      const t=near[(Math.random()*near.length)|0];
      s.alive=true;s.drop=false;s.big=false;s.bubble=true;s.x=t[0]+Math.random();s.z=t[1]+Math.random();
      {const lvl=HD.lavaLevelAt?HD.lavaLevelAt(s.x,s.z):NaN;s.gy=(lvl===lvl?lvl:(HD.terrainY?HD.terrainY(s.x,s.z):groundH(s.x,s.z)))+0.03;}s.y=s.gy;
      s.vx=0;s.vz=0;s.vy=0;s.born=now;s.life=900+Math.random()*900;
    }else if(near.length&&Math.random()<0.012){
      const t=near[(Math.random()*near.length)|0];
      s.alive=true;s.drop=false;s.big=false;s.bubble=false;s.x=t[0]+Math.random();s.z=t[1]+Math.random();
      {const lvl=HD.lavaLevelAt?HD.lavaLevelAt(s.x,s.z):NaN;s.gy=(lvl===lvl?lvl:(HD.terrainY?HD.terrainY(s.x,s.z):groundH(s.x,s.z)))+0.04;}s.y=s.gy;
      s.vx=(Math.random()-0.5)*0.9;s.vz=(Math.random()-0.5)*0.9;s.vy=2.4+Math.random()*2.6;s.born=now;
    }
    const k=i*3;
    if(s.alive&&s.bubble){const k2=Math.min(1,(now-s.born)/s.life);S.pos[k]=s.x;S.pos[k+1]=s.y+k2*0.06;S.pos[k+2]=s.z;S.size[i]=0.08+0.3*Math.sin(k2*Math.PI*0.5);S.heat[i]=0.1;}
    else if(s.alive){S.pos[k]=s.x;S.pos[k+1]=s.y;S.pos[k+2]=s.z;S.size[i]=s.drop?0.07:(s.big?0.24:0.15)+0.05*Math.sin(now*0.01+i);S.heat[i]=Math.max(0,1-(now-s.born)/1400);}
    else{S.pos[k]=0;S.pos[k+1]=-100;S.pos[k+2]=0;S.size[i]=0;}
  }
  S.points.geometry.attributes.position.needsUpdate=true;S.points.geometry.attributes.aSize.needsUpdate=true;S.points.geometry.attributes.aHeat.needsUpdate=true;
}

/* ------------------------------ footprints in snow ------------------------ */
/* Pat's Peak keeps the last 64 of the player's steps: a flat decal per step, alternating
   feet, pressed into the snow along the direction of travel, fading over thirty seconds. */
const PRINTS=64;
const printMat=new THREE.ShaderMaterial({
  uniforms:{uTime:{value:0}},
  vertexShader:`attribute float aBorn;varying vec2 vUv;varying float vAge;uniform float uTime;
    void main(){vUv=uv;vAge=uTime-aBorn;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0);}`,
  fragmentShader:`varying vec2 vUv;varying float vAge;
    void main(){
      vec2 d=(vUv-0.5)*vec2(2.2,1.6);
      /* a sole and a heel */
      float sole=length(vec2(d.x,(d.y-0.18)*1.35));float heel=length(vec2(d.x*1.25,(d.y+0.38)*1.6));
      float m=1.0-smoothstep(0.55,0.75,min(sole,heel));
      float fade=1.0-clamp(vAge/30.0,0.0,1.0);
      if(m*fade<0.02)discard;
      gl_FragColor=vec4(vec3(0.42,0.5,0.66),m*fade*0.8);
    }`,
  transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2
});
const prints=(function(){
  if(typeof inSnow!=='function')return null;
  const geo=new THREE.PlaneGeometry(0.3,0.44);geo.rotateX(-Math.PI/2);
  const born=new Float32Array(PRINTS).fill(-1e9);
  geo.setAttribute('aBorn',new THREE.InstancedBufferAttribute(born,1));
  const im=new THREE.InstancedMesh(geo,printMat,PRINTS);im.frustumCulled=false;im.userData.hdNoAO=1;im.name='hdPrints';im.renderOrder=1;
  const m4=new THREE.Matrix4();m4.makeTranslation(0,-100,0);for(let i=0;i<PRINTS;i++)im.setMatrixAt(i,m4);
  worldGroup.add(im);
  return {mesh:im,born,next:0,lx:NaN,lz:NaN,side:1,heading:0};
})();
const _pm=new THREE.Matrix4(),_pq=new THREE.Quaternion(),_pp=new THREE.Vector3(),_ps=new THREE.Vector3(1,1,1),_py=new THREE.Vector3(0,1,0);
function printTick(now,px,pz){
  if(!prints)return;
  printMat.uniforms.uTime.value=now*0.001;
  if(HD._indoors)return;
  const P=prints;
  if(P.lx!==P.lx){P.lx=px;P.lz=pz;return;}
  const dx=px-P.lx,dz=pz-P.lz,d=Math.hypot(dx,dz);
  if(d<0.42)return;
  if(d>3){P.lx=px;P.lz=pz;return;}                 /* a teleport, not a step */
  P.heading=Math.atan2(dx,dz);P.lx=px;P.lz=pz;
  const ix=Math.floor(px),iz=Math.floor(pz);
  if(!inSnow(px,pz))return;
  const t=(tiles[iz]||[])[ix];if(t!==T_GRASS&&t!==T_PATH&&t!==T_FOREST)return;
  /* alternate feet, offset across the line of travel */
  P.side=-P.side;const ox=Math.cos(P.heading)*0.14*P.side,oz=-Math.sin(P.heading)*0.14*P.side;
  const x=px+ox,z=pz+oz,y=(HD.terrainY?HD.terrainY(x,z):groundH(x,z))+0.012;
  _pq.setFromAxisAngle(_py,P.heading);_pp.set(x,y,z);_pm.compose(_pp,_pq,_ps);
  P.mesh.setMatrixAt(P.next,_pm);P.born[P.next]=now*0.001;
  P.mesh.instanceMatrix.needsUpdate=true;P.mesh.geometry.attributes.aBorn.needsUpdate=true;
  P.next=(P.next+1)%PRINTS;
}
HD.tick=HD.tick||[];
let _fxLast=0;
HD.tick.push(function(now,px,py,pz){const dt=Math.min(100,now-(_fxLast||now));_fxLast=now;spurtTick(now,dt,px,pz);printTick(now,px,pz);});
/* ------------------------------ the delve's torches ----------------------- */
/* Every sconce in the raid is a bracket plus two glow spheres. The spheres hide and a living
   flame with embers takes their place; the game's own point lights stay. The raid rebuilds per
   seed, so raidBuildInterior is wrapped and the sconces are dressed after every build. */
const torchGroups=[];
function dressRaidTorches(){
  if(typeof raidGroup==='undefined'||!raidGroup)return 0;
  const cores=[],halos=[];
  raidGroup.traverse(o=>{if(!o.isMesh||!o.geometry||o.geometry.type!=='SphereGeometry'||!o.material||!o.material.transparent)return;const r=o.geometry.parameters.radius;if(Math.abs(r-0.15)<0.01&&Math.abs(o.material.opacity-0.95)<0.02)cores.push(o);else if(Math.abs(r-0.30)<0.01)halos.push(o);});
  let n=0;
  for(const c of cores){
    if(c.userData.hdTorch)continue;c.userData.hdTorch=1;c.scale.setScalar(0.0001);   /* the core keeps its visible flag: the game shows a room's torches as it unlocks */
    for(const h of halos)if(h.position.distanceTo(c.position)<0.1)h.scale.setScalar(0.0001);
    const g=new THREE.Group();g.position.copy(c.position);g.position.y-=0.2;g.userData.hdTorchOf=c;torchGroups.push(g);
    const seed=(c.position.x*13+c.position.z*7)|0;
    for(const [s,ph,inn,dx,dz] of [[0.42,seed*0.1,0,0,0],[0.3,seed*0.1+2.1,0.6,0.02,-0.02]]){const f=flame(s,ph,inn);f.position.set(dx,0,dz);g.add(f);}
    const emb=new THREE.Points(emitter(8,0,seed+500,0.07),MAT_FIRE);emb.position.y=0.1;emb.userData.hdNoAO=1;g.add(emb);
    g.userData.hdNoAO=1;(c.parent||raidGroup).add(g);n++;
  }
  return n;
}
/* a torch's flame shows only while the game shows its core (rooms light up as they unlock) */
HD.tick=HD.tick||[];HD.tick.push(function(){for(const g of torchGroups){const c=g.userData.hdTorchOf;if(!c)continue;let v=c.visible,q=c.parent;while(q&&v){if(!q.visible)v=false;q=q.parent;}g.visible=v;}});
if(typeof raidBuildInterior==='function'){
  const _rb=raidBuildInterior;
  raidBuildInterior=function(){const r=_rb.apply(this,arguments);try{dressRaidTorches();}catch(e){console.warn('[HD] raid torches',e);}return r;};
}
const nt=dressRaidTorches();
/* for the capes (hd-chars runs earlier and looks these up lazily) */
HD.makeFlame=flame;
HD.frostMaterial=new THREE.ShaderMaterial({
  uniforms:{tDisc:{value:discTex}},
  vertexShader:`void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);gl_PointSize=0.06*(640.0/max(1.0,-mv.z));gl_Position=projectionMatrix*mv;}`,
  fragmentShader:`uniform sampler2D tDisc;void main(){float a=texture2D(tDisc,gl_PointCoord).a;if(a<0.05)discard;gl_FragColor=vec4(vec3(0.75,0.95,1.0)*1.6,a*0.8);}`,
  transparent:true,depthWrite:false,blending:THREE.AdditiveBlending
});
console.log('[HD] fire emitters:',n,'lava spurts:',spurts?SPURTS:0,'footprints:',prints?PRINTS:0,'delve torches:',nt);
})();
