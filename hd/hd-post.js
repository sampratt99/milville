/* ============================================================================
   Milville HD — post-game layer.  Loaded AFTER the game script, so every game
   global (renderer, scene, camera, sun, hemi, terra, waterMesh, BLOB_MAT ...)
   is in scope. Classic scripts share one global lexical scope, which is what
   lets this file reach the game's top-level consts without the game knowing.

   Sets up: the physical sky + environment lighting, the sun as a real shadow
   caster, the terrain and water materials, clouds, atmospheric fog, and the
   post-processing chain (ambient occlusion, bloom, gamma). The game calls
   HD.render() / HD.resize() / HD.frame() from three guarded hooks.
   ========================================================================== */
(function(){
'use strict';
try{performance.mark('hd:hd-post');}catch(e){}
const HD=window.HD;
if(!HD||!HD.preReady)return;
if(typeof renderer==='undefined'||!renderer||typeof scene==='undefined')return;
const gl2=!!renderer.capabilities.isWebGL2;
if(!gl2){console.warn('[HD] WebGL2 unavailable; HD layer disabled');return;}

const t0=performance.now();
HD.buildTextures();
console.log('[HD] textures synthesised in',Math.round(performance.now()-t0),'ms');

try{performance.mark('hd:hd-post/renderer');}catch(e){}
/* ------------------------------ renderer ------------------------------- */
const PR={high:1.5,medium:1.25,low:1.0};
function applyRendererQuality(){
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,HD.phone?Math.min(PR[HD.quality]||1,1.25):(PR[HD.quality]||1.5)));   /* a phone never renders above 1.25× */
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  const sm=HD.phone?(HD.quality==='high'?2048:1024):(HD.quality==='high'?4096:2048);sun.shadow.mapSize.set(sm,sm);
  if(sun.shadow.map){sun.shadow.map.dispose();sun.shadow.map=null;}
}
renderer.outputEncoding=THREE.sRGBEncoding;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=0.95;

try{performance.mark('hd:hd-post/day-cycle');}catch(e){}
/* ------------------------------ day cycle ------------------------------ */
/* The sun crosses the sky once per HD.day.length seconds, east to west, dawn to dusk, and
   never sets: elevation runs 14 -> 62 -> 14 degrees, so shadows are always readable. Sun
   colour, sky, fog, hemisphere and the environment map all follow. The game writes
   sun.position every frame (a fixed offset from the player); HD.frame overwrites it after. */
HD.day={t:0.38,length:900,paused:false};   /* a 15-minute day */
try{const s=localStorage.getItem('milville-hd-day');if(s)HD.day.t=parseFloat(s)||HD.day.t;}catch(e){}
const _dc=new THREE.Color(),_dc2=new THREE.Color();
function dayState(t){
  const elDeg=5+57*Math.pow(Math.sin(Math.PI*t),1.7);    /* 5° at dawn and dusk, and the sun lingers low: a golden hour that lasts */
  const el=elDeg*Math.PI/180;
  const az=(75+210*t)*Math.PI/180;                        /* azimuth, east to west */
  const dir=new THREE.Vector3(Math.cos(el)*Math.cos(az),Math.sin(el),Math.cos(el)*Math.sin(az));
  const up=Math.min(1,Math.max(0,(elDeg-6)/26));          /* 0 at dawn/dusk, 1 by mid-morning */
  const dusk=Math.min(1,Math.max(0,1-(elDeg-5)/24));      /* 1 with the sun on the horizon, 0 above 29° */
  const sunCol=_dc.setHex(0xff9a58).lerp(_dc2.setHex(0xfff5e8),up).clone();
  const zen=_dc.setHex(0x5c4d94).lerp(_dc2.setHex(0x2458b8),up).clone();   /* violet zenith at the ends of the day */
  const hor=_dc.setHex(0xf6b47e).lerp(_dc2.setHex(0xa8c8e8),up).clone();
  return {el,az,dir,up,dusk,sunCol,zen,hor,sunI:0.55+0.45*up};
}

try{performance.mark('hd:hd-post/sun');}catch(e){}
/* -------------------------------- sun ---------------------------------- */
const SUN_DIR=dayState(HD.day.t).dir.clone();
sun.color.copy(dayState(HD.day.t).sunCol);
sun.intensity=0.95;
sun.castShadow=true;
const sc=sun.shadow.camera;
sc.left=-42;sc.right=42;sc.top=42;sc.bottom=-42;sc.near=1;sc.far=110;   /* 84 units around the player: every draw inside this box is a shadow draw */
sun.shadow.bias=-0.00035;
sun.shadow.normalBias=0.05;
sun.shadow.radius=2;
hemi.color.setHex(0xa4c4e8);hemi.groundColor.setHex(0x6a6f55);hemi.intensity=0.3;
if(typeof BLOB_MAT!=='undefined')BLOB_MAT.visible=false;   /* real shadows replace the OSRS blobs */
if(typeof terra!=='undefined'&&terra){terra.castShadow=true;terra.receiveShadow=true;}

try{performance.mark('hd:hd-post/sky');}catch(e){}
/* -------------------------------- sky ---------------------------------- */
/* An analytic sky dome: zenith and horizon colours from the day cycle, a sun disc with a
   glow, haze toward the horizon. The Preetham model (THREE.Sky) is physically motivated but
   at this exposure it is a white sheet near the horizon; RS3 skies are a saturated blue. */
const sky=new THREE.Mesh(new THREE.SphereGeometry(1,48,24),new THREE.ShaderMaterial({
  side:THREE.BackSide,depthWrite:false,fog:false,
  uniforms:{uZen:{value:new THREE.Color(0x2b62c4).convertSRGBToLinear()},uHor:{value:new THREE.Color(0xbcd6ef).convertSRGBToLinear()},uSunDir:{value:SUN_DIR.clone()},uSunCol:{value:new THREE.Color(1,0.96,0.9)},uGain:{value:1.0},
    uDusk:{value:0},uWarm:{value:new THREE.Color(0xff7a3a).convertSRGBToLinear()},uPink:{value:new THREE.Color(0xe08aa0).convertSRGBToLinear()},uPurple:{value:new THREE.Color(0x4a3580).convertSRGBToLinear()}},
  vertexShader:'varying vec3 vDir;void main(){vDir=position;vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.0);gl_Position=p.xyww;}',
  fragmentShader:`varying vec3 vDir;uniform vec3 uZen,uHor,uSunDir,uSunCol,uWarm,uPink,uPurple;uniform float uGain,uDusk;
    void main(){
      vec3 d=normalize(vDir);
      float h=clamp(d.y,0.0,1.0);
      vec3 col=mix(uHor,uZen,pow(h,0.55));
      /* dusk and dawn: gold on the horizon under the sun, orange then pink climbing, violet overhead and behind */
      vec2 dx=normalize(d.xz+vec2(1e-4));vec2 sx=normalize(uSunDir.xz+vec2(1e-4));float side=max(dot(dx,sx),0.0);
      float band=pow(1.0-h,1.6)*(0.22+0.78*pow(side,1.4));
      vec3 warm=mix(uPink,uWarm,pow(1.0-h,3.0));
      col=mix(col,warm,band*uDusk);
      col=mix(col,uPurple,uDusk*(1.0-band)*(0.3+0.5*pow(h,0.6)));
      if(d.y<0.0)col=mix(uHor,uHor*0.55,clamp(-d.y*2.5,0.0,1.0));
      float sd=max(dot(d,uSunDir),0.0);
      col+=uSunCol*(pow(sd,3000.0)*mix(6.0,2.2,uDusk)+pow(sd,300.0)*1.2*uDusk+pow(sd,60.0)*0.3+pow(sd,5.0)*(0.07+0.35*uDusk)+pow(sd,2.0)*0.16*uDusk);
      gl_FragColor=vec4(col*uGain,1.0);
      #include <tonemapping_fragment>
      #include <encodings_fragment>
    }`
}));
sky.name='hdSky';
sky.scale.setScalar(900);
sky.frustumCulled=false;
scene.add(sky);
camera.far=520;camera.updateProjectionMatrix();
const pmrem=new THREE.PMREMGenerator(renderer);
let envRT=pmrem.fromScene(sky);
HD.env=envRT.texture;
scene.environment=HD.env;
let _envT=HD.day.t;
const FOGC=new THREE.Color(0xc6d6e6).convertSRGBToLinear();
function applyDay(t){
  const d=dayState(t);
  const Wc=HD.weather?HD.weather.w.cloud:0,Wr=HD.weather?HD.weather.w.rain:0;
  if(Wc>0.001||(HD._eerie||0)>0.001||(HD._wild||0)>0.001){
    const grey=Math.min(1,Wc*0.8+(HD._eerie||0)*0.5+(HD._wild||0)*0.3);   /* the wilderness greys the sky, the deep wild more */
    d.zen.lerp(_dc.setHex(0x7d8894),grey);d.hor.lerp(_dc.setHex(0xa9b1ba),grey*0.9);
    d.sunCol.lerp(_dc.setHex(0xd6dbe2),grey*0.7);
    d.sunI*=1-0.55*Wc-0.2*Wr;d.up*=1-0.4*Wc;
  }
  sky.material.uniforms.uSunDir.value.copy(d.dir);
  sky.material.uniforms.uZen.value.copy(d.zen).convertSRGBToLinear();
  sky.material.uniforms.uHor.value.copy(d.hor).convertSRGBToLinear();
  sky.material.uniforms.uSunCol.value.copy(d.sunCol).convertSRGBToLinear();
  sky.material.uniforms.uDusk.value=d.dusk*(1-0.8*Wc);
  sky.position.copy(camera.position);
  sun.color.copy(d.sunCol);sun.intensity=0.88*d.sunI;
  HD.sunDir=d.dir;HD.dayUp=d.up;HD.dayDusk=d.dusk;
  hemi.color.copy(d.zen).lerp(d.hor,0.5);hemi.intensity=0.3+0.1*d.up;   /* softer shade, the RS3 way */
  FOGC.copy(d.hor).convertSRGBToLinear();
  if(HD.water){HD.water.zen.copy(d.zen).convertSRGBToLinear();HD.water.hor.copy(d.hor).convertSRGBToLinear();HD.water.sunDir.copy(d.dir);HD.water.sunCol.copy(d.sunCol).convertSRGBToLinear();}
  if(clouds){clouds.material.uniforms.uSun.value.copy(d.sunCol).lerp(_dc2.setHex(0xffffff),0.6*d.up).convertSRGBToLinear().multiplyScalar(0.8+0.2*d.up);clouds.material.uniforms.uShade.value.setRGB(0.58,0.62,0.70).lerp(_dc.setHex(0x5a4a86).convertSRGBToLinear(),d.dusk*0.8);}
  /* the environment map is a snapshot of the sky; refresh it as the sun moves */
  const wsig=t+(HD.weather?HD.weather.w.cloud*0.3:0);
  if(Math.abs(wsig-_envT)>0.015){
    _envT=wsig;const old=envRT;envRT=pmrem.fromScene(sky);HD.env=envRT.texture;scene.environment=HD.env;
    scene.traverse(o=>{if(o.isMesh&&o.material&&o.material.envMap)o.material.envMap=HD.env;});
    if(old)old.dispose();
  }
}

try{performance.mark('hd:hd-post/clouds');}catch(e){}
/* ------------------------------- clouds -------------------------------- */
const clouds=(function(){
  const g=new THREE.PlaneGeometry(1400,1400,1,1);
  const m=new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,fog:false,side:THREE.DoubleSide,
    uniforms:{tNoise:{value:HD.tex.cloud},uTime:{value:0},uCover:{value:0.5},uSun:{value:new THREE.Color(1,1,1)},uShade:{value:new THREE.Color(0.58,0.62,0.70)},uWind:{value:new THREE.Vector2(1,0.5)},uScale:{value:5.0},uSoft:{value:0.09},uAlpha:{value:0.97}},
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:`uniform sampler2D tNoise;uniform float uTime,uCover,uScale,uSoft,uAlpha;uniform vec3 uSun,uShade;uniform vec2 uWind;varying vec2 vUv;
      void main(){
        vec2 uv=vUv*uScale;
        vec2 w=uWind*uTime*0.0018;
        /* big soft masses from the low frequency, cauliflower edges from the higher ones */
        float n1=texture2D(tNoise,uv*0.28+w*0.6).r;
        float n2=texture2D(tNoise,uv*0.9+w+vec2(0.31,0.17)).r;
        float n3=texture2D(tNoise,uv*2.6+w*1.7+vec2(0.71,0.43)).r;
        float n=n1*0.62+n2*0.26+n3*0.12;
        float th=0.78-0.42*uCover;
        float a=smoothstep(th,th+uSoft,n);
        float d=length(vUv-0.5)*1400.0;
        a*=1.0-smoothstep(260.0,520.0,d);
        /* lit tops, shaded bellies: brighter where the cloud is dense; the shade takes the dusk's violet */
        float dens=pow(smoothstep(th,th+0.30,n),0.6);
        vec3 col=mix(uShade,vec3(1.0,0.99,0.97),dens)*uSun;
        gl_FragColor=vec4(col,a*uAlpha);
      }`
  });
  const mesh=new THREE.Mesh(g,m);
  mesh.rotation.x=-Math.PI/2;
  mesh.renderOrder=-5;
  mesh.name='hdClouds';
  mesh.frustumCulled=false;
  scene.add(mesh);
  /* a thin, fast cirrus veil above the cumulus */
  const m2=m.clone();m2.uniforms=THREE.UniformsUtils.clone(m.uniforms);m2.uniforms.tNoise.value=HD.tex.cloud;m2.uniforms.uScale.value=9.0;m2.uniforms.uSoft.value=0.5;m2.uniforms.uAlpha.value=0.26;
  const hi=new THREE.Mesh(g,m2);hi.rotation.x=-Math.PI/2;hi.renderOrder=-6;hi.name='hdCirrus';hi.frustumCulled=false;scene.add(hi);
  mesh.userData.cirrus=hi;
  return mesh;
})();
HD.wind={x:1,z:0.5,t:0};

try{performance.mark('hd:hd-post/equipment-tint-classes');}catch(e){}
/* ------------------------- equipment tint classes ----------------------- */
(function(){
  if(typeof ITEMS==='undefined')return;
  const MET=new Set(['sword','scim','plate','legs','helm','gauntlets','towershield','chain','slayerhelm','maul','pick','axe','crown','moltcrown','ring','amulet','leafsw','leafdag','leafax']);
  const CLO=new Set(['cape','robe','sweater','santahat','partyhat','chefhat','earmuffs','hide','boots','quiver','book','charm','whip']);
  const WOO=new Set(['bow','staff','arrow']);
  const map=new Map();
  for(const id in ITEMS){
    const e=ITEMS[id]&&ITEMS[id].equip;if(!e||!e.model)continue;
    const cls=MET.has(e.model)?9:CLO.has(e.model)?11:WOO.has(e.model)?5:-1;
    if(cls<0)continue;
    for(const k of ['tint','trim']){const v=e[k];if(typeof v!=='number')continue;const cur=map.get(v);if(cur===undefined||cls===9)map.set(v,cls);}
  }
  HD.tintClass=map;
})();

try{performance.mark('hd:hd-post/water');}catch(e){}
/* -------------------------------- water -------------------------------- */
let waterMat=null;
function dressWater(){
  if(typeof waterMesh==='undefined'||!waterMesh)return;
  const g=waterMesh.geometry,pa=g.attributes.position;
  if(!g.attributes.uv){
    const uv=new Float32Array(pa.count*2);
    for(let i=0;i<pa.count;i++){uv[i*2]=pa.getX(i)*0.33;uv[i*2+1]=pa.getZ(i)*0.33;}
    g.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  }
  waterMat=new HD.Standard({color:0x16405e,transparent:true,opacity:0.9,roughness:0.09,metalness:0.0,
    normalMap:HD.tex.waterN,normalScale:new THREE.Vector2(0.28,0.28),envMapIntensity:1.5,depthWrite:false});
  /* two counter-scrolling normal layers, and a fresnel-driven opacity: clear looking down,
     mirror-like at a grazing angle. Authored colour is sRGB like everything else. */
  waterMat.onBeforeCompile=function(sh){
    sh.uniforms.uWTime={value:0};waterMat.userData.sh=sh;
    sh.fragmentShader=sh.fragmentShader
      .replace('#include <common>','#include <common>\nuniform float uWTime;')
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );','vec4 diffuseColor = vec4( pow(diffuse,vec3(2.2)), opacity );')
      .replace('#include <normal_fragment_maps>',`
      #ifdef USE_NORMALMAP
        vec3 wn1=texture2D(normalMap,vUv*1.0+vec2(uWTime*0.021,uWTime*0.013)).xyz*2.0-1.0;
        vec3 wn2=texture2D(normalMap,vUv*2.3+vec2(-uWTime*0.017,uWTime*0.027)).xyz*2.0-1.0;
        vec3 wn=normalize(vec3((wn1.xy+wn2.xy*0.6)*normalScale.x,1.0));
        normal=perturbNormal2Arb(-vViewPosition,normal,wn,faceDirection);
      #endif
      { float fr=pow(1.0-clamp(dot(normalize(vViewPosition),normal),0.0,1.0),3.0);
        diffuseColor.a=mix(0.62,0.97,fr); }`);
  };
  waterMat.customProgramCacheKey=function(){return 'hdwater';};
  waterMesh.material=waterMat;
  waterMesh.receiveShadow=true;
  waterMesh.renderOrder=2;
}
dressWater();

try{performance.mark('hd:hd-post/receive-shadows');}catch(e){}
/* --------------------------- receive shadows --------------------------- */
function sweepShadows(){
  scene.traverse(o=>{
    if(!o.isMesh||o.userData.hdSw)return;
    o.userData.hdSw=1;
    if(o===sky||o===clouds)return;
    if(o.material&&o.material.isMeshBasicMaterial)return;   /* glows, blobs, unlit */
    o.receiveShadow=true;
  });
}
sweepShadows();

try{performance.mark('hd:hd-post/post-processing');}catch(e){}
/* --------------------------- post-processing --------------------------- */
let composer=null,ssao=null,bloom=null;
function targetSize(){
  const s=renderer.getSize(new THREE.Vector2()),pr=renderer.getPixelRatio();
  return [Math.max(2,Math.floor(s.x*pr)),Math.max(2,Math.floor(s.y*pr))];
}
function msaaTarget(w,h){
  const rt=new THREE.WebGLMultisampleRenderTarget(w,h,{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,format:THREE.RGBAFormat});
  rt.samples=4;
  return rt;
}
/* The stock SSAOPass re-renders the whole scene for normals+depth at full resolution out to
   the far plane. Occlusion is only visible near the camera, so: the normal pass runs with a
   70-unit far plane (culls most of the ~2,000 draws), and the AO buffers are half resolution
   (the blur upsamples them; softer AO is what we want anyway). The beauty pass is untouched. */
HD.aoFar=48;
/* Empty pixels (sky, anything past aoFar) read back a depth a hair under 1.0, which the
   perspective-to-view conversion turns into a false 0.98 -- every sample then counts as
   occluded and the whole sky goes grey. Treat the far plane as open air. */
if(THREE.SSAOShader&&THREE.SSAOShader.fragmentShader.indexOf('depth >= 0.9999')<0){
  THREE.SSAOShader.fragmentShader=THREE.SSAOShader.fragmentShader.replace('float depth = getDepth( vUv );','float depth = getDepth( vUv ); if ( depth >= 0.9999 ) { gl_FragColor = vec4( 1.0 ); return; }');
}
function cheapenSSAO(p){
  p.setSize=function(w,h){
    this.width=w;this.height=h;
    this.beautyRenderTarget.setSize(w,h);
    const hw=Math.max(1,w>>1),hh=Math.max(1,h>>1);
    this.ssaoRenderTarget.setSize(hw,hh);this.normalRenderTarget.setSize(hw,hh);this.blurRenderTarget.setSize(hw,hh);
    this.ssaoMaterial.uniforms.resolution.value.set(hw,hh);
    this.blurMaterial.uniforms.resolution.value.set(hw,hh);
  };
  p.render=function(renderer,writeBuffer){
    renderer.setRenderTarget(this.beautyRenderTarget);renderer.clear();renderer.render(this.scene,this.camera);
    const cam=this.camera,far0=cam.far;
    cam.far=HD.aoFar;cam.updateProjectionMatrix();
    const u=this.ssaoMaterial.uniforms;
    u.cameraNear.value=cam.near;u.cameraFar.value=cam.far;
    u.cameraProjectionMatrix.value.copy(cam.projectionMatrix);
    u.cameraInverseProjectionMatrix.value.copy(cam.projectionMatrixInverse);
    u.kernelRadius.value=this.kernelRadius;
    /* the shader measures depth as a fraction of (far - near) */
    u.minDistance.value=0.02/cam.far;u.maxDistance.value=2.5/cam.far;
    /* transparent meshes (the invisible hover proxies over every building and object, the water)
       must not write the AO depth: the override material would draw them solid */
    /* the set of objects to hide from the AO depth pass is cached: four full-scene
       traversals per frame over ~16k nodes cost more than the AO itself */
    const tnow=performance.now();
    if(!this._hdHideList||tnow-this._hdHideT>2000){
      this._hdHideT=tnow;const list=[];
      this.scene.traverse(o=>{
        if(o.isMesh){if(o.material&&(o.material.transparent||o.userData.hdNoAO))list.push(o);}
        else if(o.isPoints||o.isLine||o.isSprite)list.push(o);
      });
      this._hdHideList=list;
    }
    const hid=[];for(const o of this._hdHideList){if(o.visible){o.visible=false;hid.push(o);}}
    this.renderOverride(renderer,this.normalMaterial,this.normalRenderTarget,0x7777ff,1.0);
    for(const o of hid)o.visible=true;
    this.renderPass(renderer,this.ssaoMaterial,this.ssaoRenderTarget);
    cam.far=far0;cam.updateProjectionMatrix();
    this.renderPass(renderer,this.blurMaterial,this.blurRenderTarget);
    const out=this.renderToScreen?null:writeBuffer;
    if(HD.aoDebug){this.copyMaterial.uniforms.tDiffuse.value=this.blurRenderTarget.texture;this.copyMaterial.blending=THREE.NoBlending;this.renderPass(renderer,this.copyMaterial,out);return;}
    this.copyMaterial.uniforms.tDiffuse.value=this.beautyRenderTarget.texture;this.copyMaterial.blending=THREE.NoBlending;this.renderPass(renderer,this.copyMaterial,out);
    this.copyMaterial.uniforms.tDiffuse.value=this.blurRenderTarget.texture;this.copyMaterial.blending=THREE.CustomBlending;this.renderPass(renderer,this.copyMaterial,out);
  };
}
/* final pass: linear -> sRGB plus a light grade (a touch of saturation and contrast that the
   filmic tone map takes away, and a faint vignette). Replaces GammaCorrectionShader. */
HD.GradeShader={
  /* RS3's grade: a touch more saturation and warmth, lifted shadows, no crushed blacks */
  uniforms:{tDiffuse:{value:null},uSat:{value:1.12},uCon:{value:1.02},uVig:{value:0.08}},
  vertexShader:"varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
  fragmentShader:"uniform sampler2D tDiffuse;uniform float uSat,uCon,uVig;varying vec2 vUv;"+
    "void main(){vec4 c=texture2D(tDiffuse,vUv);vec3 rgb=c.rgb;float l=dot(rgb,vec3(0.2126,0.7152,0.0722));rgb=mix(vec3(l),rgb,uSat);rgb=(rgb-0.5)*uCon+0.5;rgb=rgb*vec3(1.03,1.0,0.965)+vec3(0.012,0.01,0.014);"+
    "float d=distance(vUv,vec2(0.5));rgb*=1.0-uVig*smoothstep(0.45,0.95,d);rgb=clamp(rgb,0.0,1.0);gl_FragColor=LinearTosRGB(vec4(rgb,c.a));}"
};
function buildComposer(){
  if(composer){composer.renderTarget1.dispose();composer.renderTarget2.dispose();composer=null;ssao=null;bloom=null;}
  if(HD.quality==='low')return;
  const [w,h]=targetSize();
  composer=new THREE.EffectComposer(renderer,msaaTarget(w,h));
  if(HD.quality==='high'){
    ssao=new THREE.SSAOPass(scene,camera,w,h);
    ssao.beautyRenderTarget.dispose();
    ssao.beautyRenderTarget=msaaTarget(w,h);
    ssao.ssaoMaterial.uniforms.tDiffuse.value=ssao.beautyRenderTarget.texture;
    ssao.kernelRadius=0.55;
    ssao.normalRenderTarget.depthTexture.type=THREE.UnsignedIntType;   /* 24-bit depth: 16 bits smear thin limbs at 20+ units */
    cheapenSSAO(ssao);
    ssao.setSize(w,h);
    composer.addPass(ssao);
  }else{
    composer.addPass(new THREE.RenderPass(scene,camera));
  }
  bloom=new THREE.UnrealBloomPass(new THREE.Vector2(w,h),0.16,0.6,0.97);
  composer.addPass(bloom);
  composer.addPass(new THREE.ShaderPass(HD.GradeShader));
}
HD.setQuality=function(q,auto){
  HD.quality=q;
  try{localStorage.setItem('milville-hd-quality',q);if(!auto)localStorage.setItem('milville-hd-quality-manual','1');}catch(e){}
  applyRendererQuality();
  buildComposer();
  const s=renderer.getSize(new THREE.Vector2());
  HD.resize(s.x,s.y);
  HD.qualityLabel();
};
HD.qualityLabel=function(){const b=document.getElementById('hdq');if(!b)return;b.textContent=HD.world==='classic'?'Classic world':('HD: '+HD.quality[0].toUpperCase()+HD.quality.slice(1));};
/* ---- the classic world: the game's own terrain, water and forest and bare buildings, under HD
   characters, sky and effects. The HD terrain chunks, liquids, forest, ground cover and building
   props hide; the game's terra (kept for the click raycast), waterMesh and _treeMesh show. ---- */
HD.world='hd';
const CLASSIC_HIDE=new Set(['hdTerrain','hdWater','hdLava','hdForest','hdGrass','hdBush','hdCover','hdBuildingDetail','hdBuildingBrass','hdBuildingDecal','hdBuildingGlow']);
HD.classicHides=function(name){return CLASSIC_HIDE.has(name);};
HD.setWorld=function(mode){
  const classic=mode==='classic';HD.world=classic?'classic':'hd';
  try{localStorage.setItem('milville-hd-world',HD.world);}catch(e){}
  scene.traverse(o=>{if(o.name&&CLASSIC_HIDE.has(o.name))o.visible=!classic;
    /* Pat's Peak's pines exist only in the HD forest (the game hands their spots over instead of baking cones): they stay */
    if(o.name==='hdForest'&&o.userData.forestKind==='snow')o.visible=true;});
  if(typeof terra!=='undefined'&&terra){
    if(!HD._terraHD)HD._terraHD=terra.material;
    if(classic){if(!HD._terraClassic)HD._terraClassic=new THREE.MeshLambertMaterial({vertexColors:true});terra.material=HD._terraClassic;terra.visible=true;}
    else{terra.material=HD._terraHD;terra.visible=false;}
  }
  if(typeof waterMesh!=='undefined'&&waterMesh)waterMesh.visible=classic;
  if(typeof _treeMesh!=='undefined'&&_treeMesh)_treeMesh.visible=classic;
  HD.qualityLabel();
};
setTimeout(()=>{try{if(localStorage.getItem('milville-hd-world')==='classic')HD.setWorld('classic');}catch(e){}},0);
HD.render=function(){
  /* shadow maps once per frame; the reflection, AO and beauty passes all reuse them */
  renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
  if(HD._frameArgs){renderReflection(HD._frameArgs[0],HD._frameArgs[1],HD._frameArgs[2]);updateWorldCube(HD._frameArgs[0],HD._frameArgs[1],HD._frameArgs[2]);}
  if(composer)composer.render();else renderer.render(scene,camera);
};
HD.resize=function(w,h){
  if(!composer)return;
  const pr=renderer.getPixelRatio();
  composer.setSize(Math.floor(w*pr),Math.floor(h*pr));
};

try{performance.mark('hd:hd-post/shadow-casters-by-distance');}catch(e){}
/* ------------------------- shadow casters by distance ------------------ */
/* The shadow pass was ~4,000 draws: every mob rig and object within the 84-unit shadow box.
   Anything further than shadowRange from the player casts nothing; roots are re-checked every
   600 ms, and a mesh the game deliberately made shadowless stays that way. */
HD.shadowRange=36;
let _scT=0;
function dynamicShadowCasters(now,px,pz){
  if(now-_scT<600)return;_scT=now;
  const r2=HD.shadowRange*HD.shadowRange;
  const roots=[];
  for(const o of objects)if(o._m&&o._m.group)roots.push([o._m.group,o.x,o.y]);
  if(typeof rats!=='undefined')for(const r of rats)if(r._m&&r._m.group)roots.push([r._m.group,r.x,r.y]);
  if(typeof npcs!=='undefined')for(const n of npcs)if(n._m&&n._m.group)roots.push([n._m.group,n.x,n.y]);
  for(const [g,x,y] of roots){
    const near=((x-px)*(x-px)+(y-pz)*(y-pz))<=r2;
    if(g.userData.hdNear===near)continue;
    g.userData.hdNear=near;
    g.traverse(m=>{if(!m.isMesh)return;if(m.userData.hdCast===undefined)m.userData.hdCast=m.castShadow;m.castShadow=near&&m.userData.hdCast;});
  }
}

try{performance.mark('hd:hd-post/weather');}catch(e){}
/* ------------------------------- weather -------------------------------- */
/* sunny / overcast / rain, each lasting a few minutes, cross-fading over ~10 s. Weather
   dims the sun, greys the sky, thickens the fog, wets the ground and roughens the water. */
HD.weather={state:'sun',w:{cloud:0,rain:0},target:{cloud:0,rain:0},next:0,force:null};
function weatherTick(now,dt){
  const W=HD.weather;
  if(W.force){W.target=W.force==='rain'?{cloud:1,rain:1}:W.force==='cloud'?{cloud:1,rain:0}:{cloud:0,rain:0};}
  else if(now>W.next){
    const r=Math.random();
    W.state=r<0.58?'sun':(r<0.82?'cloud':'rain');
    W.target=W.state==='rain'?{cloud:1,rain:1}:W.state==='cloud'?{cloud:1,rain:0}:{cloud:0,rain:0};
    W.next=now+(W.state==='sun'?240000+Math.random()*240000:W.state==='cloud'?90000+Math.random()*120000:120000+Math.random()*120000);   /* rain: two to four minutes, then it clears */
  }
  const k=Math.min(1,dt/9000);
  W.w.cloud+=(W.target.cloud-W.w.cloud)*k;W.w.rain+=(W.target.rain-W.w.rain)*k;
}
/* rain: a field of falling streaks around the player, recycled as they land */
const RAIN_N=1400;
const rain=(function(){
  const g=new THREE.BufferGeometry();
  const p=new Float32Array(RAIN_N*6);
  g.setAttribute('position',new THREE.BufferAttribute(p,3));
  const m=new THREE.LineBasicMaterial({color:0xc5d0dc,transparent:true,opacity:0,depthWrite:false});
  const l=new THREE.LineSegments(g,m);l.frustumCulled=false;l.visible=false;l.name='hdRain';l.userData.hdNoAO=1;
  l.userData.drops=new Float32Array(RAIN_N*4);
  for(let i=0;i<RAIN_N;i++){l.userData.drops[i*4]=(Math.random()-0.5)*34;l.userData.drops[i*4+1]=Math.random()*18;l.userData.drops[i*4+2]=(Math.random()-0.5)*34;l.userData.drops[i*4+3]=14+Math.random()*8;}
  scene.add(l);
  return l;
})();
function rainTick(dt,px,py,pz,amount){
  const on=amount>0.02&&!HD._indoors;
  rain.visible=on;if(!on)return;
  rain.material.opacity=0.38*amount;
  const d=rain.userData.drops,p=rain.geometry.attributes.position.array,s=dt*0.001;
  for(let i=0;i<RAIN_N;i++){
    d[i*4+1]-=d[i*4+3]*s;
    if(d[i*4+1]<0){d[i*4+1]=18;d[i*4]=(Math.random()-0.5)*34;d[i*4+2]=(Math.random()-0.5)*34;}
    const x=px+d[i*4],y=py+d[i*4+1],z=pz+d[i*4+2],len=0.35+d[i*4+3]*0.012;
    p[i*6]=x;p[i*6+1]=y;p[i*6+2]=z;p[i*6+3]=x+0.02;p[i*6+4]=y+len;p[i*6+5]=z;
  }
  rain.geometry.attributes.position.needsUpdate=true;
}

try{performance.mark('hd:hd-post/world-cube-map-glass');}catch(e){}
/* ------------------------- world cube map (glass) ------------------------ */
/* A small cube map of the surroundings taken at the player, one face every few frames, so
   window glass reflects the buildings and trees actually around it (approximately: the map is
   position-invariant, which is what RS3's environment probes do too). */
const worldCubeRT=new THREE.WebGLCubeRenderTarget(96,{format:THREE.RGBAFormat,generateMipmaps:true,minFilter:THREE.LinearMipmapLinearFilter});
const worldCubeCam=new THREE.CubeCamera(0.4,220,worldCubeRT);
scene.add(worldCubeCam);
HD.worldCube=worldCubeRT.texture;
let _cubeFace=0,_cubeTick=0;
function updateWorldCube(px,py,pz){
  if(HD._indoors||HD.quality==='low')return;
  if((++_cubeTick)%3!==0)return;
  worldCubeCam.position.set(px,py+1.4,pz);worldCubeCam.updateMatrixWorld();
  const cam=worldCubeCam.children[_cubeFace];
  const oldRT=renderer.getRenderTarget();
  const hidden=[];scene.traverse(o=>{if(o.isMesh&&(o.name==='hdWater'||o.name==='hdRain')&&o.visible){o.visible=false;hidden.push(o);}});
  renderer.setRenderTarget(worldCubeRT,_cubeFace);renderer.clear();renderer.render(scene,cam);
  renderer.setRenderTarget(oldRT);
  for(const o of hidden)o.visible=true;
  _cubeFace=(_cubeFace+1)%6;
  if(_cubeFace===0)worldCubeRT.texture.needsUpdate=false;
}

try{performance.mark('hd:hd-post/planar-reflection');}catch(e){}
/* ----------------------------- planar reflection ------------------------ */
/* The world rendered from under the water plane into a half-size target, sampled by the
   water shader through the mirror camera's own projection, so every tree and wall above a
   pond reflects at the angle it should. One plane per frame: the water level nearest the
   player; other bodies fall back to the analytic sky. */
const reflRT=new THREE.WebGLRenderTarget(512,512,{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,format:THREE.RGBAFormat});
const mirrorCam=new THREE.PerspectiveCamera();
const clipPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
HD.refl={rt:reflRT,matrix:new THREE.Matrix4(),y:0,active:false,on:true};
const _bias=new THREE.Matrix4().set(0.5,0,0,0.5,0,0.5,0,0.5,0,0,0.5,0.5,0,0,0,1);
function nearestWaterLevel(px,pz){
  let best=null,bd=1e9;const cx=px|0,cz=pz|0;
  for(let y=cz-14;y<=cz+14;y++)for(let x=cx-14;x<=cx+14;x++){
    if(x<0||y<0||x>=W||y>=H||tiles[y][x]!==T_WATER)continue;
    const d=(x-px)*(x-px)+(y-pz)*(y-pz);if(d<bd){bd=d;best=waterYAt(x,y);}
  }
  return best;
}
function renderReflection(px,py,pz){
  const R=HD.refl;
  R.active=false;
  if(!R.on||HD._indoors||HD.quality==='low')return;
  const lv=nearestWaterLevel(px,pz);
  if(lv===null)return;
  R.y=lv;
  const s=renderer.getSize(new THREE.Vector2()),pr=renderer.getPixelRatio();
  /* 40% size and every other frame: the ripples hide both, and it halves the ~8 ms the pass costs */
  R.frame=(R.frame|0)+1;if(R.frame%2===0&&R.had){R.active=true;return;}
  const w=Math.max(64,Math.floor(s.x*pr*0.4)),h=Math.max(64,Math.floor(s.y*pr*0.4));
  if(reflRT.width!==w||reflRT.height!==h)reflRT.setSize(w,h);
  mirrorCam.fov=camera.fov;mirrorCam.aspect=camera.aspect;mirrorCam.near=camera.near;mirrorCam.far=camera.far;mirrorCam.updateProjectionMatrix();
  mirrorCam.position.set(camera.position.x,2*lv-camera.position.y,camera.position.z);
  const tgt=new THREE.Vector3(px,2*lv-(py+0.9),pz);
  mirrorCam.up.set(0,1,0);mirrorCam.lookAt(tgt);mirrorCam.updateMatrixWorld();
  R.matrix.copy(_bias).multiply(mirrorCam.projectionMatrix).multiply(mirrorCam.matrixWorldInverse);
  /* hide the water itself, keep everything above the plane */
  const hidden=[];scene.traverse(o=>{if(o.isMesh&&o.name==='hdWater'&&o.visible){o.visible=false;hidden.push(o);}});
  const skyPos=sky.position.clone();sky.position.copy(mirrorCam.position);clouds.position.y=py+150;
  /* oblique near plane at the water surface (Lengyel), as THREE.Reflector does: nothing under
     the water leaks into the reflection, and no material needs a clipping variant */
  clipPlane.set(new THREE.Vector3(0,1,0),-(lv-0.02));
  clipPlane.applyMatrix4(mirrorCam.matrixWorldInverse);
  {const pe=mirrorCam.projectionMatrix.elements,c=new THREE.Vector4(clipPlane.normal.x,clipPlane.normal.y,clipPlane.normal.z,clipPlane.constant);
   const q=new THREE.Vector4((Math.sign(c.x)+pe[8])/pe[0],(Math.sign(c.y)+pe[9])/pe[5],-1,(1+pe[10])/pe[14]);
   c.multiplyScalar(2/c.dot(q));
   pe[2]=c.x;pe[6]=c.y;pe[10]=c.z+1;pe[14]=c.w;}
  const oldRT=renderer.getRenderTarget();
  renderer.setRenderTarget(reflRT);renderer.setClearColor(0x000000,0);renderer.clear();
  renderer.render(scene,mirrorCam);
  renderer.setRenderTarget(oldRT);
  sky.position.copy(skyPos);
  for(const o of hidden)o.visible=true;
  R.active=true;R.had=true;
}

try{performance.mark('hd:hd-post/frame');}catch(e){}
/* --------------------------------- frame ------------------------------- */
HD._indoors=null;HD._lastSweep=0;
const _eerieCol=new THREE.Color(0x5c625c);
const _wildFogCol=new THREE.Color(0x7c8288).convertSRGBToLinear();
const _coolCol=new THREE.Color(0x9fb0c4);
const _hazeCol=new THREE.Color(0xd8e6f4).convertSRGBToLinear();
const _emberFog=new THREE.Color(0x2a1408).convertSRGBToLinear();
const _delveFog=new THREE.Color(0x07070c).convertSRGBToLinear();
/* auto quality: the first 240 frames are timed; a tier that cannot hold ~45 fps drops one
   step, unless the player picked a tier with the button (then it is theirs to keep) */
HD._ft={n:0,sum:0,last:0,done:false};
try{HD._ft.done=!!localStorage.getItem('milville-hd-quality-manual');}catch(e){}
function autoQuality(now){
  const f=HD._ft;if(f.done)return;
  if(f.last){const dt=now-f.last;if(dt<200){f.n++;f.sum+=dt;}}
  f.last=now;
  if(f.n>=240){
    const avg=f.sum/f.n;f.n=0;f.sum=0;
    if(avg>22&&HD.quality==='high'){HD.setQuality('medium',true);console.log('[HD] auto: high ran at',avg.toFixed(1),'ms, dropping to medium');}
    else if(avg>30&&HD.quality==='medium'){HD.setQuality('low',true);console.log('[HD] auto: medium ran at',avg.toFixed(1),'ms, dropping to low');}
    else f.done=true;
  }
}
HD.frame=function(now,px,py,pz,camDist,interior){
  HD._frameArgs=[px,py,pz];
  const indoors=!!interior;
  if(indoors!==HD._indoors){
    HD._indoors=indoors;
    sky.visible=!indoors;clouds.visible=!indoors;
    /* the sky environment stays on indoors: worn metal needs something to reflect */
    sun.castShadow=!indoors;     /* interiors were lit through their ceilings by design; keep that */
  }
  const dtms=Math.min(200,now-(HD._lastNow||now));
  if(!HD.day.paused){HD.day.t+=dtms*0.001/HD.day.length;if(HD.day.t>=1)HD.day.t-=1;}
  HD._lastNow=now;
  weatherTick(now,dtms);
  /* the deep wilderness: a grey pall that comes and goes over a couple of minutes */
  const eer=((!indoors&&HD.wildEerie)?HD.wildEerie(px,pz):0)*(1-((!indoors&&HD.snowFactor)?HD.snowFactor(px,pz):0));
  HD._eerie=eer;
  const occ=Math.max(HD.eerieForce||0,eer*Math.max(0,Math.min(1,0.15+0.75*Math.sin(now*0.00009)+0.45*Math.sin(now*0.00023+1.3))));
  HD._eerieFog=occ;
  const wdep=(!indoors&&HD.wildDepth)?HD.wildDepth(px,pz):0;let wf=wdep<=0?0:Math.min(1,wdep/8);
  /* Pat's Peak is mountain air: no wilderness gloom, no pall, the longest view of all */
  const sf=(!indoors&&HD.snowFactor)?HD.snowFactor(px,pz):0;
  wf*=1-sf;
  HD._wild=wf;HD._snow=sf;
  applyDay(HD.day.t);
  /* the wilderness is lit dimmer and cooler; the deep wild dimmer still */
  if(wf>0){sun.intensity*=1-wf*0.28;sun.color.lerp(_coolCol,wf*0.35);if(typeof hemi!=='undefined'&&hemi){hemi.intensity*=1-wf*0.1;hemi.color.lerp(_coolCol,wf*0.4);}}
  if(eer>0){sun.intensity*=1-eer*0.3;if(typeof hemi!=='undefined'&&hemi)hemi.intensity*=1-eer*0.15;}
  if(HD.lavaMats)for(const lm of HD.lavaMats){const u=lm.uniforms;u.uTime.value=now*0.001;if(!u.tRipple.value&&HD.tex&&HD.tex.waterN){u.tRipple.value=HD.tex.waterN;u.tFoam.value=HD.tex.cloud;lm.needsUpdate=true;}if(HD.sunDir)u.uSunDir.value.copy(HD.sunDir);if(HD.water){u.uZen.value.copy(HD.water.zen);u.uHor.value.copy(HD.water.hor);u.uSunCol.value.copy(HD.water.sunCol);}}
  rainTick(dtms,px,py,pz,HD.weather.w.rain);
  if(HD.terrainWet)HD.terrainWet(HD.weather.w.rain);
  if(!indoors){
    /* override the game's fixed sun offset with the day cycle direction */
    sun.position.set(px+HD.sunDir.x*26,py+HD.sunDir.y*26,pz+HD.sunDir.z*26);
    sun.target.position.set(px,py,pz);
    if((now|0)%4000<20)try{localStorage.setItem('milville-hd-day',HD.day.t.toFixed(4));}catch(e){}
    /* the haze is bright sky air, not an overcast: the horizon colour lifted toward the sky,
       starting well beyond the play space so the middle distance stays crisp */
    scene.fog.color.copy(FOGC).lerp(_hazeCol,0.35);
    if(eer>0)scene.fog.color.lerp(_eerieCol,Math.max(eer*0.5,occ));
    const thick=HD.weather.w.cloud*0.35+HD.weather.w.rain*0.35;
    /* the deep wild is always hazy; the pall on top of that comes and goes */
    const haze=Math.max(occ*0.9,eer*0.45);
    /* the wilderness closes in: a shorter view everywhere in the wild, on top of the pall */
    if(wf>0)scene.fog.color.lerp(_wildFogCol,wf*0.6);
    const nearBase=(HD.drawNear||70)+sf*40,farBase=(HD.drawFar||210)+sf*80;
    scene.fog.near=camDist+(nearBase-wf*54)*(1-thick*0.7)*(1-haze);
    scene.fog.far=camDist+(farBase-wf*148)*(1-thick*0.55)*(1-Math.max(occ*0.8,eer*0.5));
  }
  if(indoors&&interior==='volcano'){scene.fog.color.copy(_emberFog);scene.fog.near=camDist+18;scene.fog.far=camDist+75;}
  if(indoors&&interior==='raid'){scene.fog.color.copy(_delveFog);scene.fog.near=camDist+12;scene.fog.far=camDist+58;}
  if(waterMat&&waterMat.userData.sh)waterMat.userData.sh.uniforms.uWTime.value=now*0.001;
  clouds.material.uniforms.uTime.value=now*0.001;
  {const W=HD.weather.w.cloud;const cov=Math.min(0.97,0.46+0.08*Math.sin(now*0.00004)+0.5*W);   /* sunny: a scatter of fair-weather cumulus, never an empty blue sheet */
    clouds.material.uniforms.uCover.value=cov;
    /* the wind veers slowly; capes and leaves can read HD.wind */
    HD.wind.t=now;const wa=0.4*Math.sin(now*0.00003)+0.15*Math.sin(now*0.00011);HD.wind.x=Math.cos(wa);HD.wind.z=Math.sin(wa)*0.6;
    clouds.material.uniforms.uWind.value.set(HD.wind.x,HD.wind.z);
    const ci=clouds.userData.cirrus;if(ci){ci.position.copy(clouds.position);ci.position.y+=40;ci.material.uniforms.uTime.value=clouds.material.uniforms.uTime.value;ci.material.uniforms.uCover.value=Math.min(0.9,0.42+0.5*W);ci.material.uniforms.uWind.value.set(HD.wind.x*1.7,HD.wind.z*1.7);ci.material.uniforms.uSun.value.copy(clouds.material.uniforms.uSun.value);ci.material.uniforms.uShade.value.copy(clouds.material.uniforms.uShade.value);}}
  clouds.position.set(px,py+150,pz);
  if(now-HD._lastSweep>2500){HD._lastSweep=now;sweepShadows();}
  if(HD.tick)for(const f of HD.tick)f(now,px,py,pz);
  if(!indoors)dynamicShadowCasters(now,px,pz);
  autoQuality(now);
};

try{performance.mark('hd:hd-post/pilot-teleport');}catch(e){}
/* ----------------------------- pilot teleport ---------------------------- */
/* The clone is for piloting: a click anywhere on the expanded world map puts the player on
   that tile (walkable tiles only, outdoors only). Six map pixels per tile, see openWorldMap. */
(function(){
  const c=document.getElementById('wmapc');if(!c||typeof player==='undefined')return;
  c.addEventListener('click',function(e){
    if(!HD.pilot)return;   /* piloting only */
    if(HD._indoors)return;
    const r=c.getBoundingClientRect();
    const tx=Math.floor((e.clientX-r.left)*(c.width/r.width)/6),ty=Math.floor((e.clientY-r.top)*(c.height/r.height)/6);
    if(typeof inb==='function'&&!inb(tx,ty))return;
    if(typeof blocked==='function'&&blocked(tx,ty))return;
    player.x=tx;player.y=ty;player.tx=tx;player.ty=ty;if('px' in player){player.px=tx;player.py=ty;}
    if(player.path)player.path.length=0;
    try{if(typeof cancelAction==='function')cancelAction();}catch(err){}
    const cl=document.getElementById('wmapclose');if(cl)cl.click();
    e.stopPropagation();
  },true);
})();

try{performance.mark('hd:hd-post/pilot-mode');}catch(e){}
/* ----------------------------- pilot mode -------------------------------- */
/* HD.pilot (set in hd-pre) already opens the gated doors. Here it also lifts every level gate
   (every level the game derives from xp reads 99) and makes the purse bottomless (coins are
   counted as a billion and never spent). Off when HD.pilot is false; never ship it on. */
if(HD.pilot){
  if(typeof levelFor==='function'){const _lf=levelFor;levelFor=function(xp){return HD.pilot?99:_lf.apply(this,arguments);};}
  if(typeof coinCount==='function'){const _cc=coinCount;coinCount=function(){return HD.pilot?1e9:_cc.apply(this,arguments);};}
  if(typeof spendCoins==='function'){const _sc=spendCoins;spendCoins=function(n){if(HD.pilot){try{renderInv();}catch(e){}return;}return _sc.apply(this,arguments);};}
  console.log('[HD] PILOT MODE: doors open, levels read 99, purse bottomless');
}
try{performance.mark('hd:hd-post/quality-button');}catch(e){}
/* ----------------------------- quality button --------------------------- */
(function(){
  const vw=document.getElementById('viewwrap');if(!vw)return;
  const b=document.createElement('button');b.id='hdq';
  b.style.cssText='position:absolute;right:6px;bottom:6px;z-index:30;opacity:.75;font:600 11px/1 system-ui,sans-serif;padding:4px 7px;border-radius:4px;border:1px solid rgba(255,255,255,.35);background:rgba(0,0,0,.42);color:#fff;cursor:pointer;opacity:.75';
  b.title='Render quality: High = ambient occlusion + bloom + 4K shadows; Medium = bloom; Low = direct; Classic world = the original terrain, water and buildings under HD characters';
  b.addEventListener('click',ev=>{ev.stopPropagation();const order=['high','medium','low','classic'];const cur=HD.world==='classic'?'classic':HD.quality;const next=order[(order.indexOf(cur)+1)%4];if(next==='classic'){HD.setWorld('classic');HD.setQuality('low');}else{HD.setWorld('hd');HD.setQuality(next);}});
  b.addEventListener('mousedown',ev=>ev.stopPropagation());
  vw.appendChild(b);
})();

applyRendererQuality();
buildComposer();
HD.setQuality(HD.quality,true);
HD.ready=true;
console.log('[HD] ready, quality',HD.quality,'in',Math.round(performance.now()-t0),'ms');
})();
