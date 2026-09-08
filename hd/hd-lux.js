/* ============================================================================
   Milville HD — the Ember set and the luxury wares.  Loaded after hd-magic.js.

   The Ember set is the best armour in the game and reads like it: every worn
   plate turns to obsidian (black glass with lava cracks that pulse), embers
   rise from the shoulders, the helm's crest and the knees, flames lick the
   pauldron spikes, and the heart core breathes. The luxury pieces from
   Hirschfeld's shop (the crown, the grimoire, the mountain shield, the boots
   and gloves of speed and haste, the golden bodkins) leave their OSRS look:
   real gold and crystal, gem sparkle, an arcane halo, sparks when you run.

   Gameplay is untouched: nothing here reads or writes game state beyond
   looking at what is equipped.
   ========================================================================== */
(function(){
'use strict';
try{performance.mark('hd:hd-lux');}catch(e){}
const HD=window.HD;
if(!HD||!HD.ready)return;
if(typeof pm==='undefined'||typeof ITEMS==='undefined')return;
const K=HD.gearKit||{};const disc=HD.discTex;

/* ------------------------------ textures -------------------------------- */
const texCache=new Map();
function tex(key,make){if(texCache.has(key))return texCache.get(key);const c=make();const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=4;texCache.set(key,t);return t;}
/* lava cracks: a black field with branching orange fissures, the emissive map of obsidian */
const crackTex=()=>tex('lux:cracks',()=>{const S=256,c=document.createElement('canvas');c.width=c.height=S;const g=c.getContext('2d');
  g.fillStyle='#000';g.fillRect(0,0,S,S);let sd=7;const R=()=>{sd=sd+0x6D2B79F5|0;let t=Math.imul(sd^sd>>>15,1|sd);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
  const branch=(x,y,a,len,w,depth)=>{g.strokeStyle='rgba(255,'+(120+depth*30|0)+',40,'+(0.9-depth*0.15)+')';g.lineWidth=w;g.beginPath();g.moveTo(x,y);let cx=x,cy=y;const n=4+R()*4|0;for(let i=0;i<n;i++){a+=(R()-0.5)*0.9;cx+=Math.cos(a)*len/n;cy+=Math.sin(a)*len/n;g.lineTo(cx,cy);}g.stroke();
    if(depth<3&&R()<0.8)branch(cx,cy,a+(R()-0.5)*1.6,len*0.6,w*0.6,depth+1);if(depth<2&&R()<0.5)branch(x+(cx-x)*0.5,y+(cy-y)*0.5,a+(R()>0.5?1.2:-1.2),len*0.5,w*0.55,depth+1);};
  for(let i=0;i<9;i++)branch(R()*S,R()*S,R()*6.28,50+R()*70,2.6,0);
  /* a soft glow round every crack */
  const glow=document.createElement('canvas');glow.width=glow.height=S;const gg=glow.getContext('2d');gg.filter='blur(6px)';gg.drawImage(c,0,0);g.globalCompositeOperation='lighter';g.globalAlpha=0.7;g.drawImage(glow,0,0);
  return c;});
/* obsidian: black glass, cracks glowing through */
function obsidian(){const m=new THREE.MeshStandardMaterial({color:0x0c0705,roughness:0.34,metalness:0.25,emissive:0xff6a2a,emissiveMap:crackTex(),emissiveIntensity:1.1});m.userData.hdObsidian=1;m.userData.hdMid=0;return m;}
function gold(hex){const m=new THREE.MeshStandardMaterial({color:hex||0xc9932a,roughness:0.28,metalness:0.78,emissive:0x3a2405,emissiveIntensity:0.25,map:K.steelTex?K.steelTex():null});m.userData.hdMid=0;return m;}
function silver(hex){const m=new THREE.MeshStandardMaterial({color:hex||0xb9c2cc,roughness:0.24,metalness:0.8,map:K.steelTex?K.steelTex():null});m.userData.hdMid=0;return m;}
function crystal(hex){const m=new THREE.MeshPhysicalMaterial({color:hex,roughness:0.08,metalness:0.0,transmission:0.55,thickness:0.25,emissive:hex,emissiveIntensity:0.35,clearcoat:1,clearcoatRoughness:0.1});m.userData.hdMid=0;return m;}
function sprite(col,size,op){const s=new THREE.Sprite(new THREE.SpriteMaterial({map:disc,color:col,transparent:true,opacity:op===undefined?0.6:op,blending:THREE.AdditiveBlending,depthWrite:false}));s.scale.set(size,size,1);s.userData.hdNoAO=1;return s;}

/* ------------------------------ the Ember set ---------------------------- */
const emberWorn=slot=>{const it=player.equip[slot];return !!(it&&ITEMS[it.id]&&ITEMS[it.id].equip&&ITEMS[it.id].equip.emberset);};
/* the plates: every tint/shade mesh in a worn gear group becomes obsidian while an Ember piece is on that slot */
const obsSets={body:null,legs:null,head:null,hands:null,feet:null};
function gearGroupsFor(slot){
  /* the worn model groups the game shows for this slot: visible gear groups under the right rig part */
  const roots=slot==='legs'?[pm.lLeg,pm.rLeg]:slot==='feet'?[pm.lLeg,pm.rLeg]:slot==='hands'?[pm.lArm,pm.rArm]:[pm.upper];
  const out=[];for(const r of roots)r.traverse(o=>{if(o.isGroup&&o.visible&&o.userData&&o.userData.hdGear&&o!==r)out.push(o);});return out;
}
function applyObsidian(grp){grp.traverse(m=>{if(!m.isMesh||!m.material||m.userData.hdObsPrev)return;const t=m.userData.t;if(t!=='tint'&&t!=='shade')return;if(!m.geometry.attributes.uv)return;m.userData.hdObsPrev=m.material;m.material=obsidian();});}
function restoreObsidian(grp){grp.traverse(m=>{if(m.isMesh&&m.userData.hdObsPrev){m.material=m.userData.hdObsPrev;delete m.userData.hdObsPrev;}});}
let lastEq='';
function syncEmber(){
  const sig=['body','legs','head','hands','feet'].map(s=>{const it=player.equip[s];return it?it.id:'-';}).join(',');
  if(sig===lastEq)return;lastEq=sig;
  for(const slot of Object.keys(obsSets)){
    const on=emberWorn(slot);
    if(obsSets[slot]){for(const g of obsSets[slot])restoreObsidian(g);obsSets[slot]=null;}
    if(on){const gs=gearGroupsFor(slot);for(const g of gs)applyObsidian(g);obsSets[slot]=gs;}
  }
}
/* the overlays the game already shows for the set get flames and embers once */
let overlaysDone=false,heart=null,heartHalo=null,helmWisp=null;
function dressOverlays(){
  if(overlaysDone||!HD.emberise)return;overlaysDone=true;
  try{if(typeof emberBodyG!=='undefined'){HD.emberise(emberBodyG,[[-0.3,1.5,0,0.22],[0.3,1.5,0,0.22]],[[-0.25,1.42,0,14],[0.25,1.42,0,14],[0,1.16,0.22,10]]);
    emberBodyG.traverse(o=>{if(o.isMesh&&o.geometry.type==='OctahedronGeometry')heart=o;if(o.isMesh&&o.geometry.type==='SphereGeometry'&&o.material.transparent&&o.material.opacity<0.5)heartHalo=o;});
    if(heart){heart.material=new THREE.MeshBasicMaterial({color:0xffe6a0});const s=sprite(0xff7a2a,0.55,0.5);s.position.copy(heart.position);emberBodyG.add(s);heart.userData.hdSprite=s;}}}catch(e){}
  try{if(typeof emberHelmG!=='undefined'){HD.emberise(emberHelmG,[[0,1.92,-0.10,0.3]],[[0,2.0,-0.06,14]]);emberHelmG.traverse(o=>{if(o.isMesh&&o.geometry.type==='ConeGeometry'&&o.material.transparent)helmWisp=o;});}}catch(e){}
  try{if(typeof emberLegL!=='undefined'){HD.emberise(emberLegL,[],[[0,-0.29,0.08,8]]);HD.emberise(emberLegR,[],[[0,-0.29,0.08,8]]);}}catch(e){}
}
/* ------------------------------ the luxury wares ------------------------- */
let luxDone=false;const luxTick=[];
function dressLux(){
  if(luxDone)return;luxDone=true;
  /* the crown: a gold band, crystal spires, gems that sparkle, an arcane halo and drifting motes */
  try{if(typeof crownM!=='undefined'){let n=0;crownM.traverse(o=>{if(!o.isMesh)return;const ty=o.geometry.type;
      if(ty==='TorusGeometry'){o.material=gold(o.material.color.getHex());o.geometry=new THREE.TorusGeometry(0.185,0.034,10,28);}
      else if(ty==='ConeGeometry'){const h=o.geometry.parameters.height;const col=o.material.color.getHex();o.geometry=new THREE.OctahedronGeometry(0.045,0);o.scale.set(1,h/0.09,0.7);o.material=crystal(col);o.userData.hdLuxCrystal=1;}
      else if(ty==='SphereGeometry'){const col=o.material.color.getHex();o.material=new THREE.MeshStandardMaterial({color:col,emissive:col,emissiveIntensity:0.9,roughness:0.1,metalness:0.2});const s=sprite(0x9fd0ff,0.09,0.7);s.position.copy(o.position);crownM.add(s);o.userData.hdSpark=s;n++;}});
    const halo=sprite(0x6fb0ff,0.9,0.35);halo.position.set(0,1.78,0);crownM.add(halo);
    const mot=HD.motes?HD.motes(16,3,0x8fc8ff,0.05,1.2,disc,0.35):null;if(mot){mot.position.set(0,1.72,0);crownM.add(mot);}
    luxTick.push(now=>{halo.material.opacity=0.28+0.12*Math.sin(now*0.0025);crownM.traverse(o=>{if(o.userData.hdSpark)o.userData.hdSpark.material.opacity=0.45+0.45*Math.max(0,Math.sin(now*0.004+o.position.x*9));if(o.userData.hdLuxCrystal)o.material.emissiveIntensity=0.3+0.2*Math.sin(now*0.003+o.position.z*7);});if(mot)mot.material.uniforms.uT.value=now*0.001;});}}catch(e){console.warn('[HD] lux crown',e);}
  /* the grimoire: leather boards, gold spine and clasp, a rune ring that breathes, pages that shed light */
  try{if(typeof grimoireM!=='undefined'){let ring=null;grimoireM.traverse(o=>{if(!o.isMesh)return;const t=o.userData.t;const col=o.material.color?o.material.color.getHex():0xffffff;
      if(t==='tint'&&K.remat){K.remat(o,'leather');}
      else if(t==='trim'){o.material=gold(col);}
      else if(o.geometry.type==='TorusGeometry'){ring=o;o.material=new THREE.MeshBasicMaterial({color:col});}
      else if(o.geometry.type==='BoxGeometry'){o.material=new THREE.MeshStandardMaterial({color:col,roughness:0.9,emissive:0x8a6a2a,emissiveIntensity:0.15});}});
    const glow=sprite(0xffd36a,0.4,0.4);if(ring)glow.position.copy(ring.position);grimoireM.add(glow);
    luxTick.push(now=>{glow.material.opacity=0.3+0.2*Math.sin(now*0.003);if(ring)ring.scale.setScalar(1+0.06*Math.sin(now*0.003));});}}catch(e){console.warn('[HD] lux grimoire',e);}
  /* the mountain shield: dark stone face, gold frame, granite peaks with real snow */
  try{if(typeof mountainShieldM!=='undefined'){mountainShieldM.traverse(o=>{if(!o.isMesh)return;const t=o.userData.t;const col=o.material.color?o.material.color.getHex():0xffffff;
      if(t==='tint'){o.material=new THREE.MeshStandardMaterial({color:col,roughness:0.55,metalness:0.35,map:K.steelTex?K.steelTex():null});}
      else if(t==='trim'){o.material=gold(col);}
      else if(o.geometry.type==='ConeGeometry'&&o.material.type==='MeshBasicMaterial'){o.material=new THREE.MeshStandardMaterial({color:0xffffff,roughness:0.9,emissive:0xdff2ff,emissiveIntensity:0.25});}
      else if(o.geometry.type==='ConeGeometry'){o.material=new THREE.MeshStandardMaterial({color:col,roughness:0.95,metalness:0.05});}});}}catch(e){console.warn('[HD] lux shield',e);}
  /* the boots and gloves of speed and haste: a sabaton and a gauntlet in place of the boxes, polished
     gold or silver by the item (the game re-tints them white each frame, so the colour is set after it),
     the glow bands kept, and sparks when you run */
  try{const parts=[];for(const n of ['luxGloveL','luxGloveR','luxBootL','luxBootR']){try{const g=eval(n);if(g)parts.push([n,g]);}catch(e){}}
    for(const [n,g] of parts){const isBoot=/Boot/.test(n),left=/L$/.test(n);
      if(K.sampled&&K.footRings&&K.armRings){
        if(isBoot){const bone=left?K.LLEG:K.RLEG;const rings=K.ascending(K.footRings(bone).concat([{y:-0.62,rx:0.044,rz:0.046,b:[bone,1]},{y:-0.56,rx:0.046,rz:0.048,b:[bone,1]},{y:-0.50,rx:0.048,rz:0.050,b:[bone,1]}]));
          g.traverse(o=>{if(!o.isMesh||o.geometry.type!=='BoxGeometry')return;const p=o.geometry.parameters;
            if(p.width===0.14&&p.height===0.12){const B=new K.Buf();K.sampled(B,rings,[-0.785,-0.77,-0.75,-0.72,-0.69,-0.66,-0.62,-0.58,-0.54,-0.50],y=>0.012+0.006*Math.max(0,(y+0.66)/0.16),16,null,true,true);K.setGeo(o,K.G(B));o.position.set(0,0,0);}
            else{o.geometry=new THREE.BufferGeometry();}});}
        else{const bone=left?K.LARM:K.RARM;const side=left?-1:1;const A=K.armRings(bone,side,false);
          g.traverse(o=>{if(!o.isMesh)return;const ty=o.geometry.type,p=o.geometry.parameters;
            if(ty==='CylinderGeometry'&&p.radiusTop===0.072){const B=new K.Buf();K.sampled(B,A,[-0.56,-0.50,-0.44,-0.38,-0.32],y=>0.012+0.009*Math.max(0,(-0.44-y)/0.12),14,null,false,false);K.setGeo(o,K.G(B));o.position.set(0,0,0);}
            else if(ty==='BoxGeometry'&&p.width===0.125&&p.height===0.075){const B=new K.Buf();K.sampled(B,A,[-0.70,-0.67,-0.63,-0.59,-0.56],0.011,14,null,true,false);K.setGeo(o,K.G(B));o.position.set(0,0,0);}
            else if(ty==='BoxGeometry'){o.geometry=new THREE.BufferGeometry();}});}}
      g.traverse(o=>{if(!o.isMesh)return;const t=o.userData.t;if(t==='tint'||t==='shade'){o.material=silver();o.userData.hdLuxMetal=1;}else if(t==='trim'&&o.material.type!=='MeshBasicMaterial'){o.material=gold();o.userData.hdLuxTrim=1;}});
      const sp=HD.motes?HD.motes(14,3,0xbfe9ff,0.045,0.7,disc,0.12):null;if(sp){sp.position.set(0,isBoot?-0.62:-0.62,-0.06);g.add(sp);g.userData.hdSparks=sp;}}
    const metalFor=(id)=>/gold/.test(id||'')?[0xc9932a,0xf0d070]:[0xb9c2cc,0xe8eef5];
    luxTick.push(now=>{const moving=typeof walkBlend!=='undefined'&&walkBlend>0.2;
      const bootId=player.equip.feet&&player.equip.feet.id,gloveId=player.equip.hands&&player.equip.hands.id;
      for(const [n,g] of parts){const isBoot=/Boot/.test(n);const [base,trim]=metalFor(isBoot?bootId:gloveId);
        g.traverse(o=>{if(o.userData.hdLuxMetal){o.material.color.setHex(base);}else if(o.userData.hdLuxTrim){o.material.color.setHex(trim);}});
        const sp=g.userData.hdSparks;if(!sp)continue;sp.visible=moving&&g.visible;sp.material.uniforms.uT.value=now*0.001;}});}catch(e){console.warn('[HD] lux speed',e);}
  /* the golden bodkins: the leaf dagger's parts go to gold and a soft glint while a bodkin is held */
  try{if(typeof leafDagM!=='undefined'){const glint=sprite(0xffe6a0,0.22,0.0);glint.position.set(0,-0.3,0);leafDagM.add(glint);
    luxTick.push(now=>{const id=player.equip.shield&&player.equip.shield.id;const bod=!!id&&id.indexOf('bodkin_')===0;if(leafDagM.userData.hdBod!==bod){leafDagM.userData.hdBod=bod;leafDagM.traverse(o=>{if(!o.isMesh||o===glint)return;if(bod){if(!o.userData.hdPrev){o.userData.hdPrev=o.material;o.material=gold(0xe8c65a);}}else if(o.userData.hdPrev){o.material=o.userData.hdPrev;delete o.userData.hdPrev;}});}
      glint.material.opacity=bod?0.25+0.25*Math.max(0,Math.sin(now*0.005)):0;});}}catch(e){console.warn('[HD] lux bodkin',e);}
}
/* ------------------------------- the tick -------------------------------- */
HD.tick=HD.tick||[];
let lastSync=0;
HD.tick.push(function(now){
  if(now-lastSync>300){lastSync=now;try{syncEmber();}catch(e){}}
  if(!overlaysDone)dressOverlays();
  if(!luxDone)dressLux();
  /* the set breathes */
  const p=0.5+0.5*Math.sin(now*0.0035);
  if(heart){heart.scale.setScalar(0.9+0.25*p);if(heart.userData.hdSprite)heart.userData.hdSprite.material.opacity=0.3+0.4*p;}
  if(heartHalo)heartHalo.material.opacity=0.2+0.2*p;
  if(helmWisp)helmWisp.material.opacity=0.15+0.15*p;
  /* the game re-tints every 'tint' mesh each frame; obsidian keeps its black after it */
  for(const slot of Object.keys(obsSets)){const gs=obsSets[slot];if(!gs)continue;for(const g of gs)g.traverse(m=>{if(m.isMesh&&m.material&&m.material.userData.hdObsidian){m.material.emissiveIntensity=0.8+0.7*p;m.material.color.setHex(0x0c0705);}});}
  for(const f of luxTick)try{f(now);}catch(e){}
});
console.log('[HD] ember set and luxury wares ready');
})();
