/* ============================================================================
   Milville HD — characters.  Loaded after hd-foliage.js.

   Every humanoid in the game (the player, NPCs, students, zombies, the
   remote-player rig) is a makeHumanoid() rig: cylinder limbs, sphere fists, a
   sphere head with two black bead eyes. This file keeps every object in that
   rig (the game animates and re-costumes them by reference) and swaps the
   GEOMETRY under them for sculpted parts, then paints a face:

     * legs and arms: lathe profiles with a knee/elbow and an ankle/wrist
     * fists: mittens with a thumb; feet: a shoe with a sole
     * head: the same sphere, now carrying a procedural face texture (eyes
       with iris and highlight, brows in the hair colour, nose shading, lips);
       the bead eyes are hidden. A full helm still covers all of it.

   Rigs built before this script ran are found structurally (a 0.15-radius
   head sphere under an `upper` group) and dressed in place; makeHumanoid is
   wrapped so every rig built later is dressed too.

   Gameplay is untouched: nothing here reads or writes game state.
   ========================================================================== */
(function(){
'use strict';
try{performance.mark('hd:hd-chars');}catch(e){}
const HD=window.HD;
if(!HD||!HD.ready)return;
if(typeof makeHumanoid!=='function')return;

const faceCache=new Map();
const capes=[],rigsSeen=[];
HD.capes=capes;   /* cloth capes and the rigs to scan for them (declared first: dressRig runs at load) */
function hsl2(hex){const r=((hex>>16)&255)/255,g=((hex>>8)&255)/255,b=(hex&255)/255;const mx=Math.max(r,g,b),mn=Math.min(r,g,b);return (mx+mn)/2;}
function shade(hex,k){const c=new THREE.Color(hex);c.r=Math.min(1,c.r*k);c.g=Math.min(1,c.g*k);c.b=Math.min(1,c.b*k);return '#'+c.getHexString();}
function faceTexture(skin,hair,seed){
  const key=skin+':'+hair+':'+(seed%7);
  if(faceCache.has(key))return faceCache.get(key);
  const S=256,c=document.createElement('canvas');c.width=S;c.height=S;const g=c.getContext('2d');
  const sk=new THREE.Color(skin);
  g.fillStyle='#'+sk.getHexString();g.fillRect(0,0,S,S);
  /* soft shading: brow ridge and under-jaw, drawn around the sphere's front (u=0.25) */
  const cx=0.25*S;
  const shadow=(x,y,rx,ry,a)=>{const gr=g.createRadialGradient(x,y,0,x,y,rx);gr.addColorStop(0,'rgba(60,30,20,'+a+')');gr.addColorStop(1,'rgba(60,30,20,0)');g.save();g.translate(x,y);g.scale(1,ry/rx);g.translate(-x,-y);g.fillStyle=gr;g.fillRect(x-rx,y-rx,rx*2,rx*2);g.restore();};
  const light=(x,y,rx,ry,a)=>{const gr=g.createRadialGradient(x,y,0,x,y,rx);gr.addColorStop(0,'rgba(255,235,220,'+a+')');gr.addColorStop(1,'rgba(255,235,220,0)');g.save();g.translate(x,y);g.scale(1,ry/rx);g.translate(-x,-y);g.fillStyle=gr;g.fillRect(x-rx,y-rx,rx*2,rx*2);g.restore();};
  const ey=0.47*S,sep=0.056*S;
  shadow(cx,0.40*S,0.16*S,0.05*S,0.12);              /* brow ridge */
  shadow(cx,0.72*S,0.18*S,0.08*S,0.18);              /* under the jaw */
  light(cx-0.09*S,0.55*S,0.06*S,0.05*S,0.18);        /* cheeks */
  light(cx+0.09*S,0.55*S,0.06*S,0.05*S,0.18);
  /* eyes */
  const irisCols=['#4a2f1c','#2e5b8a','#4d7a3a','#6b4a2a','#3a3a3a','#2b4d7a','#5a3a1e'];
  const iris=irisCols[seed%irisCols.length];
  for(const s of [-1,1]){
    const x=cx+s*sep;
    g.fillStyle='#f4f1ec';g.beginPath();g.ellipse(x,ey,0.034*S,0.019*S,0,0,Math.PI*2);g.fill();
    g.fillStyle=iris;g.beginPath();g.arc(x,ey+0.002*S,0.0155*S,0,Math.PI*2);g.fill();
    g.fillStyle='#0d0a08';g.beginPath();g.arc(x,ey+0.002*S,0.008*S,0,Math.PI*2);g.fill();
    g.fillStyle='rgba(255,255,255,0.85)';g.beginPath();g.arc(x-0.005*S,ey-0.004*S,0.0035*S,0,Math.PI*2);g.fill();
    /* lid line */
    g.strokeStyle='rgba(60,35,25,0.55)';g.lineWidth=1.6;g.beginPath();g.ellipse(x,ey,0.035*S,0.02*S,0,Math.PI,Math.PI*2);g.stroke();
    /* brow */
    g.strokeStyle=shade(hair,0.7);g.lineWidth=0.012*S;g.lineCap='round';
    g.beginPath();g.moveTo(x-0.04*S,ey-0.05*S);g.quadraticCurveTo(x,ey-0.068*S,x+0.04*S,ey-0.048*S);g.stroke();
  }
  /* nose: a soft shadow either side and under the tip */
  shadow(cx,0.58*S,0.035*S,0.03*S,0.22);
  light(cx,0.54*S,0.014*S,0.03*S,0.25);
  /* mouth */
  const lip=shade(skin,0.72);
  g.strokeStyle=lip;g.lineWidth=0.014*S;g.lineCap='round';
  g.beginPath();g.moveTo(cx-0.035*S,0.65*S);g.quadraticCurveTo(cx,0.672*S,cx+0.035*S,0.65*S);g.stroke();
  g.strokeStyle='rgba(120,60,50,0.35)';g.lineWidth=0.006*S;
  g.beginPath();g.moveTo(cx-0.03*S,0.641*S);g.quadraticCurveTo(cx,0.652*S,cx+0.03*S,0.641*S);g.stroke();
  /* skin grain */
  const R=(()=>{let s=seed|0;return()=>{s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};})();
  g.fillStyle='rgba(80,40,30,0.05)';
  for(let i=0;i<500;i++){g.fillRect(R()*S,R()*S,1.5,1.5);}
  const t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;t.anisotropy=4;
  faceCache.set(key,t);
  return t;
}

/* ------------------------------ geometry ------------------------------- */
function lathe(pts,seg){return new THREE.LatheGeometry(pts.map(p=>new THREE.Vector2(p[0],p[1])),seg||18);}
/* thigh+shin as one piece, pivot at the hip, y from 0 (hip) to -0.74 (ankle) */
const LEG_GEO=lathe([[0.02,0.02],[0.092,0.0],[0.098,-0.12],[0.088,-0.26],[0.066,-0.38],[0.07,-0.44],[0.072,-0.52],[0.06,-0.62],[0.046,-0.71],[0.03,-0.74]],18);
/* the game's thigh cylinder is centred at y=-0.37 with height 0.74: shift our piece to match */
LEG_GEO.translate(0,0.37,0);
const SLEEVE_GEO=lathe([[0.03,0.14],[0.062,0.13],[0.064,0.04],[0.058,-0.06],[0.05,-0.14]],14);      /* upper arm, centred like the cylinder (h 0.28) */
const FORE_GEO=lathe([[0.02,0.15],[0.05,0.14],[0.052,0.06],[0.044,-0.04],[0.035,-0.12],[0.026,-0.15]],14);
const MITTEN_GEO=(function(){const g=new THREE.SphereGeometry(0.05,14,10);g.scale(0.85,1.05,0.7);return g;})();
const THUMB_GEO=(function(){const g=new THREE.SphereGeometry(0.018,8,6);g.scale(0.9,1.4,0.9);return g;})();
const SHOE_GEO=(function(){
  const g=new THREE.SphereGeometry(0.078,16,10);g.scale(0.92,0.5,1.7);
  /* flatten the sole */
  const p=g.attributes.position;for(let i=0;i<p.count;i++){const y=p.getY(i);if(y<-0.02)p.setY(i,-0.02-(y+0.02)*0.25);}
  g.computeVertexNormals();return g;
})();
/* A lofted body part: elliptical cross-sections stacked up the y axis, each with its own
   half-widths and a forward offset, so a torso can carry a chest, a waist and a back that a
   lathe (radially symmetric) cannot. Closed top and bottom. */
function loft(rings,segs){
  segs=segs||24;
  const pos=[],nor=[],uv=[],idx=[];
  const R=rings.slice();
  for(let j=0;j<R.length;j++){const r=R[j];
    for(let i=0;i<=segs;i++){const a=i/segs*Math.PI*2;const cx=Math.cos(a),sz=Math.sin(a);
      /* the front (+z) may be fuller than the back */
      const rz=sz>0?r.rz*(r.front||1):r.rz*(r.back||1);
      pos.push(cx*r.rx,r.y,sz*rz+(r.dz||0));uv.push(i/segs,j/(R.length-1));nor.push(0,0,0);}}
  const row=segs+1;
  for(let j=0;j<R.length-1;j++)for(let i=0;i<segs;i++){const a=j*row+i,b=a+1,c=a+row,d=c+1;idx.push(a,c,b,b,c,d);}
  /* caps */
  const bot=pos.length/3;pos.push(0,R[0].y,R[0].dz||0);uv.push(0.5,0);nor.push(0,-1,0);
  for(let i=0;i<segs;i++)idx.push(bot,i,i+1);
  const top=pos.length/3;const L=R[R.length-1];pos.push(0,L.y,L.dz||0);uv.push(0.5,1);nor.push(0,1,0);
  const lastRow=(R.length-1)*row;for(let i=0;i<segs;i++)idx.push(top,lastRow+i+1,lastRow+i);
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(idx);g.computeVertexNormals();return g;
}
/* the torso, in the game's torso space (mesh at y 1.1, scale.z 0.82 applied by the game, so the
   z half-widths here are pre-divided): hips, a waist, the ribcage, a chest fuller at the front,
   broad shoulders, then the neck */
const TORSO_GEO=loft([
  {y:-0.30,rx:0.145,rz:0.128},{y:-0.20,rx:0.132,rz:0.118},{y:-0.12,rx:0.128,rz:0.115},
  {y:-0.02,rx:0.150,rz:0.135,front:1.06},{y:0.09,rx:0.178,rz:0.150,front:1.12,dz:0.006},
  {y:0.17,rx:0.200,rz:0.150,front:1.08,dz:0.004},{y:0.23,rx:0.205,rz:0.140},{y:0.27,rx:0.165,rz:0.120},
  {y:0.30,rx:0.095,rz:0.090},{y:0.33,rx:0.072,rz:0.072}
],28);
/* the pelvis (the game's hips cylinder, mesh scale.z 0.82): rounded, a little wider than the waist */
const PELVIS_GEO=loft([
  {y:-0.10,rx:0.135,rz:0.125},{y:-0.05,rx:0.150,rz:0.140},{y:0.03,rx:0.148,rz:0.138},{y:0.09,rx:0.132,rz:0.125}
],20);
/* Armour shells fitted to the lofted torso (they sit in the same torso space; the game scales
   the plate mesh 0.68 and the mail mesh 0.78 in z, so those half-widths are pre-divided):
   a breastplate with a fuller chest and a raised centre line, a mail shirt hugging the body. */
function shell(k,zs,extra){
  const T=[[-0.30,0.145,0.128],[-0.20,0.132,0.118],[-0.12,0.128,0.115],[-0.02,0.150,0.135,1.06],[0.09,0.178,0.150,1.12,0.006],[0.17,0.200,0.150,1.08,0.004],[0.23,0.205,0.140],[0.27,0.165,0.120],[0.30,0.095,0.090]];
  return loft(T.map(r=>({y:r[0],rx:r[1]*k+extra,rz:(r[2]*0.82*k+extra)/zs,front:(r[3]||1)*(k>1?1.04:1),dz:(r[4]||0)})),28);
}
const PLATE_GEO=shell(1.05,0.68,0.018);
const MAIL_GEO=shell(1.03,0.78,0.012);
const RIVET_GEO=new THREE.SphereGeometry(0.011,8,6);
function dressArmour(upper){
  let n=0;
  if(HD.gearOwnsArmour)return 0;   /* hd-gear.js fits every piece to the skinned body */
  upper.traverse(m=>{
    if(!m.isMesh||!m.geometry||m.geometry.type!=='LatheGeometry'||m.userData.hdArmour)return;
    const zs=+m.scale.z.toFixed(2);
    if(m.userData.t!=='tint')return;
    if(zs===0.68&&Math.abs(m.position.y-1.1)<0.01){
      m.geometry=PLATE_GEO;m.userData.hdArmour=1;n++;
      /* rivets along the collar and the waist, in the trim colour */
      const grp=m.parent;if(grp){const rm=new THREE.MeshLambertMaterial({color:0xdba968});
        for(const [yy,rx,rz] of [[1.1+0.29,0.11,0.11*0.82],[1.1-0.19,0.15,0.135*0.82]]){for(let i=0;i<10;i++){const a=i/10*Math.PI*2+0.3;const rv=new THREE.Mesh(RIVET_GEO,rm);rv.userData.t='trim';rv.position.set(Math.cos(a)*(rx+0.02),yy,Math.sin(a)*(rz+0.02));grp.add(rv);}}}
    }else if(zs===0.78&&Math.abs(m.position.y-1.06)<0.01){
      m.geometry=MAIL_GEO;m.userData.hdArmour=1;n++;
      if(m.material&&m.material.userData)m.material.userData.hdMid=9;   /* metal grain for the mail */
    }
  });
  return n;
}
const NOSE_GEO=(function(){const g=new THREE.SphereGeometry(0.026,10,8);g.scale(0.8,1.15,1.0);return g;})();
const EAR_GEO=(function(){const g=new THREE.SphereGeometry(0.03,10,8);g.scale(0.45,1.0,0.75);return g;})();

/* hair: the game's long / bob styles hang box slabs beside the head; round them into
   ellipsoids of the same size, and give every hair mesh a soft sheen */
function roundHair(hairG){
  if(!hairG)return;
  hairG.traverse(m=>{
    if(!m.isMesh||!m.geometry)return;
    const p=m.geometry.parameters;
    if(m.geometry.type==='BoxGeometry'&&p){
      const g=new THREE.SphereGeometry(0.5,16,12);g.scale(p.width,p.height,p.depth);
      m.geometry=g;
    }
    if(m.material&&m.material.roughness!==undefined){m.material.roughness=0.5;}
  });
}

/* ------------------------------ dressing ------------------------------- */
function dressRig(g){
  if(!g||g.isScene||g.userData.hdRig)return false;   /* a head whose parent is a rig root under the scene resolves to the scene: never dress that */
  let upper=null,head=null,chin=null;
  const eyes=[],legs=[];
  for(const ch of g.children){
    if(ch.userData&&ch.userData.thigh)legs.push(ch);
    /* the hips cylinder becomes a pelvis */
    if(ch.isMesh&&ch.geometry&&ch.geometry.parameters&&ch.geometry.parameters.radiusTop===0.13&&ch.geometry.parameters.height===0.18)ch.geometry=PELVIS_GEO;
    if(ch.isGroup&&!upper){ /* the upper group holds the head */
      for(const u of ch.children){if(u.isMesh&&u.geometry&&u.geometry.parameters&&u.geometry.parameters.radius===0.15){upper=ch;break;}}
    }
  }
  if(!upper)return false;
  rigsSeen.push({g,upper});
  const arms=[];
  for(const u of upper.children){
    if(u.isMesh&&u.geometry&&u.geometry.parameters){
      const p=u.geometry.parameters;
      if(p.radius===0.15&&!head)head=u;
      else if(p.radius===0.088)chin=u;
      else if(p.radius===0.03)eyes.push(u);
    }
    if(u.userData&&u.userData.sleeve)arms.push(u);
    if(u.isMesh&&u.geometry&&u.geometry.type==='LatheGeometry'&&u.userData.cos==='shirt'){u.geometry=TORSO_GEO;}
    /* shoulder caps become deltoids */
    if(u.isMesh&&u.geometry&&u.geometry.parameters&&u.geometry.parameters.radius===0.078&&u.userData.cos==='shirt'){u.scale.set(1.18,0.88,1.05);u.geometry=new THREE.SphereGeometry(0.078,16,12);}
  }
  if(!head)return false;
  const skin=head.material&&head.material.color?head.material.color.getHex():0xd9a066;
  let hair=0x6b4a26;
  const hairG=upper.children.find(u=>u.isGroup&&u.position.y>0.7&&u!==upper);
  if(hairG){hairG.traverse(m=>{if(m.isMesh&&m.material&&m.material.color&&hair===0x6b4a26)hair=m.material.color.getHex();});}
  const seed=Math.abs((g.id*7919+skin)|0);
  roundHair(hairG);
  /* face */
  head.material=new HD.Standard({map:faceTexture(skin,hair,seed),roughness:0.6,metalness:0,envMapIntensity:HD.envIntensity});
  HD.installHook(head.material,{detail:false});
  head.geometry=new THREE.SphereGeometry(0.15,28,20);
  for(const e of eyes)e.visible=false;
  /* a nose and ears in the skin, beside the painted face (the head faces +z) */
  {const skinMat=new THREE.MeshLambertMaterial({color:skin});
   const nose=new THREE.Mesh(NOSE_GEO,skinMat);nose.position.set(0,head.position.y-0.02,0.125);nose.castShadow=true;upper.add(nose);
   for(const sx of [-1,1]){const ear=new THREE.Mesh(EAR_GEO,skinMat);ear.position.set(sx*0.138,head.position.y-0.005,-0.01);ear.castShadow=true;upper.add(ear);}}
  if(chin)chin.geometry=new THREE.SphereGeometry(0.088,18,12);
  /* limbs */
  for(const lg of legs){
    const thigh=lg.userData.thigh;if(thigh)thigh.geometry=LEG_GEO;
    for(const f of lg.children){if(f!==thigh&&f.isMesh&&f.geometry&&f.geometry.parameters&&f.geometry.parameters.radius===0.078){f.geometry=SHOE_GEO;f.scale.set(1,1,1);}}
  }
  for(const ag of arms){
    const sl=ag.userData.sleeve;if(sl)sl.geometry=SLEEVE_GEO;
    const others=ag.children.filter(m=>m!==sl&&m.isMesh);
    for(const m of others){
      const p=m.geometry.parameters||{};
      if(p.radiusTop===0.046)m.geometry=FORE_GEO;
      else if(p.radius===0.05){
        m.geometry=MITTEN_GEO;
        const th=new THREE.Mesh(THUMB_GEO,m.material);th.position.set(-0.038*Math.sign(ag.position.x||1),0.012,0.02);th.rotation.z=0.5*Math.sign(ag.position.x||1);th.castShadow=true;th.userData.hdThumb=1;m.add(th);
      }
    }
  }
  /* builds vary: NPCs (not the player, whose gear is fitted to the standard body) are a little
     broader or slighter and a touch taller or shorter, from their own seed */
  if(!g.isScene&&(typeof pm==='undefined'||!pm||pm.g!==g)){const R=(seed%1000)/1000,R2=((seed*7)%1000)/1000;const bx=0.93+R*0.16,by=0.97+R2*0.06;
    for(const u of upper.children){if(u.isMesh&&u.userData.cos==='shirt'&&u.geometry===TORSO_GEO){u.scale.x*=bx;}}
    g.scale.set(g.scale.x*(0.98+R*0.04),g.scale.y*by,g.scale.z*(0.98+R*0.04));}
  g.userData.hdRig=1;
  return true;
}
HD.dressRig=dressRig;

/* existing rigs: find every head sphere in the scene */
let n=0;
scene.traverse(o=>{
  if(o.isMesh&&o.geometry&&o.geometry.parameters&&o.geometry.parameters.radius===0.15&&o.parent&&o.parent.parent){
    if(dressRig(o.parent.parent))n++;
  }
});
if(typeof buildHair==='function'){
  const _bh=buildHair;
  buildHair=function(hairG){const r=_bh.apply(this,arguments);try{roundHair(hairG);}catch(e){}return r;};
}
/* ------------------------------ capes: cloth ------------------------------ */
/* Every cape in the game is two stiff panels on the back. Here a cape is a 7x9 grid of verlet
   particles pinned along the shoulders, tapered like RS3's (shoulders wide, waist narrower,
   hem flared), pulled by gravity, damped like heavy cloth, trailing the wearer's motion, kept
   behind the torso, with structural, shear and bend constraints so it drapes rather than
   flaps. The panels collapse and a textured plane follows the particles: a painted body with
   folds, a trim border, a yoke. The game's emblem plane rides the middle of the cloth. The
   ember capes burn along the hem; the aurora cape sheds frost. Bespoke master capes keep
   their own decor; only the plain panels become cloth, and only while the game shows them. */
const CAPE_W=7,CAPE_H=9,CAPE_LEN=0.8;
const ROW_W=[0.40,0.37,0.34,0.33,0.34,0.36,0.39,0.42,0.45];     /* width per row: taper then flare */
const _cw=new THREE.Vector3(),_cl=new THREE.Vector3(),_inv=new THREE.Matrix4(),_tmpN=new THREE.Vector3();
function findCapePanels(root){
  for(const grp of root.children){
    if(!grp.isGroup||grp.userData.hdCape)continue;
    let big=null,small=null,emblem=null,bar=null;
    for(const c of grp.children){
      if(!c.isMesh||!c.geometry)continue;const p=c.geometry.parameters||{};
      if(c.geometry.type==='BoxGeometry'&&p.depth<=0.045&&p.width>=0.34&&p.width<=0.4&&p.height>=0.48&&p.height<=0.6)big=c;
      else if(c.geometry.type==='BoxGeometry'&&p.depth<=0.045&&p.width>=0.28&&p.width<=0.36&&p.height>=0.15&&p.height<=0.36)small=c;
      else if(c.geometry.type==='PlaneGeometry'&&p.width===0.26)emblem=c;
      else if(c.geometry.type==='BoxGeometry'&&p.width===0.38&&p.height===0.07)bar=c;   /* the game's collar bar */
    }
    if(big)return {grp,big,small,emblem,bar};
  }
  return null;
}
/* the cape's painted cloth: body colour with folds, a trim border and a yoke */
function capeTexture(bodyHex,trimHex){
  const W=256,Hh=512,c=document.createElement('canvas');c.width=W;c.height=Hh;const g=c.getContext('2d');
  const body=new THREE.Color(bodyHex),trim=new THREE.Color(trimHex);
  const hex=(col,k)=>'#'+new THREE.Color(Math.min(1,col.r*k),Math.min(1,col.g*k),Math.min(1,col.b*k)).getHexString();
  g.fillStyle=hex(body,1);g.fillRect(0,0,W,Hh);
  /* folds: soft vertical bands, darker toward the edges and the hem */
  for(let i=0;i<9;i++){const x=(i+0.5)/9*W;const gr=g.createLinearGradient(x-W*0.07,0,x+W*0.07,0);gr.addColorStop(0,'rgba(0,0,0,0)');gr.addColorStop(0.5,'rgba(0,0,0,'+(0.10+0.06*(i%2))+')');gr.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gr;g.fillRect(x-W*0.07,0,W*0.14,Hh);}
  const gv=g.createLinearGradient(0,0,0,Hh);gv.addColorStop(0,'rgba(255,255,255,0.08)');gv.addColorStop(0.6,'rgba(0,0,0,0)');gv.addColorStop(1,'rgba(0,0,0,0.18)');g.fillStyle=gv;g.fillRect(0,0,W,Hh);
  /* trim: a border, an inner line, a yoke at the shoulders, a hem band */
  g.strokeStyle=hex(trim,1);g.lineWidth=W*0.045;g.strokeRect(W*0.04,Hh*0.02,W*0.92,Hh*0.96);
  g.lineWidth=W*0.012;g.strokeStyle=hex(trim,0.75);g.strokeRect(W*0.10,Hh*0.05,W*0.80,Hh*0.90);
  g.fillStyle=hex(trim,1);g.beginPath();g.moveTo(0,0);g.lineTo(W,0);g.lineTo(W*0.5,Hh*0.16);g.closePath();g.fill();
  g.fillStyle=hex(trim,0.85);g.fillRect(0,Hh*0.93,W,Hh*0.07);
  const t=new THREE.CanvasTexture(c);t.anisotropy=4;return t;
}
function makeCape(f){
  const {grp,big,small,emblem,bar}=f;
  grp.userData.hdCape=1;
  if(bar)bar.scale.setScalar(0.0001);   /* the painted yoke is the collar now */
  const geo=new THREE.PlaneGeometry(0.4,CAPE_LEN,CAPE_W-1,CAPE_H-1);
  const mat=new THREE.MeshLambertMaterial({color:0xffffff,side:THREE.DoubleSide,map:capeTexture(big.material.color.getHex(),0xd8b25a)});
  const mesh=new THREE.Mesh(geo,mat);mesh.frustumCulled=false;mesh.castShadow=true;mesh.receiveShadow=true;
  grp.add(mesh);
  big.scale.setScalar(0.0001);if(small)small.scale.setScalar(0.0001);
  const n=CAPE_W*CAPE_H;
  const topY=big.position.y+(big.geometry.parameters.height*0.5),topZ=big.position.z+0.01;
  const pins=[];for(let i=0;i<CAPE_W;i++)pins.push(new THREE.Vector3((i/(CAPE_W-1)-0.5)*ROW_W[0],topY,topZ));
  capes.push({grp,big,mesh,emblem,pins,pos:new Float32Array(n*3),prev:new Float32Array(n*3),init:false,torsoY:[big.position.y-0.3,topY+0.05],backZ:topZ-0.02,bodyHex:big.material.color.getHex(),trimHex:0xd8b25a,fx:null,kind:null});
}
const DY=CAPE_LEN/(CAPE_H-1);
function capeStep(c,dt,now){
  const {grp,pos,prev,pins}=c;const n=CAPE_W*CAPE_H;
  grp.updateWorldMatrix(true,false);
  if(!c.init){
    for(let j=0;j<CAPE_H;j++)for(let i=0;i<CAPE_W;i++){const k=(j*CAPE_W+i)*3;_cl.set((i/(CAPE_W-1)-0.5)*ROW_W[j],pins[i].y-j*DY,pins[i].z-j*0.012);_cw.copy(_cl).applyMatrix4(grp.matrixWorld);pos[k]=prev[k]=_cw.x;pos[k+1]=prev[k+1]=_cw.y;pos[k+2]=prev[k+2]=_cw.z;}
    c.init=true;
  }
  _cw.copy(pins[3]).applyMatrix4(grp.matrixWorld);
  if(Math.hypot(_cw.x-pos[9],_cw.y-pos[10],_cw.z-pos[11])>2){c.init=false;return;}
  /* a light, slow breeze; the wearer's own motion does the rest */
  const wind=0.05+0.03*Math.sin(now*0.0011)+0.02*Math.sin(now*0.0037);
  const wx=Math.sin(now*0.0004)*wind,wz=Math.cos(now*0.00031)*wind;
  const dt2=dt*dt;
  for(let j=1;j<CAPE_H;j++)for(let i=0;i<CAPE_W;i++){
    const k=(j*CAPE_W+i)*3;const f=j/(CAPE_H-1);
    /* heavy cloth: strong drag across, a little less down */
    const vx=(pos[k]-prev[k])*0.78,vy=(pos[k+1]-prev[k+1])*0.86,vz=(pos[k+2]-prev[k+2])*0.78;   /* heavy cloth: it settles fast */
    prev[k]=pos[k];prev[k+1]=pos[k+1];prev[k+2]=pos[k+2];
    pos[k]+=vx+(wx*f+Math.sin(now*0.004+i*1.3+j*0.7)*0.05*f)*dt2;
    pos[k+1]+=vy-14.0*dt2;
    pos[k+2]+=vz+(wz*f)*dt2;
  }
  for(let i=0;i<CAPE_W;i++){const k=i*3;_cw.copy(pins[i]).applyMatrix4(grp.matrixWorld);pos[k]=_cw.x;pos[k+1]=_cw.y;pos[k+2]=_cw.z;prev[k]=pos[k];prev[k+1]=pos[k+1];prev[k+2]=pos[k+2];}
  const relax=(a,b,rest,stiff)=>{const ax=a*3,bx=b*3;let dx=pos[bx]-pos[ax],dy=pos[bx+1]-pos[ax+1],dz=pos[bx+2]-pos[ax+2];const d=Math.hypot(dx,dy,dz)||1e-6;const k=(d-rest)/d*0.5*(stiff||1);const pa=a<CAPE_W,pb=b<CAPE_W;
    if(!pa){pos[ax]+=dx*k*(pb?2:1);pos[ax+1]+=dy*k*(pb?2:1);pos[ax+2]+=dz*k*(pb?2:1);}
    if(!pb){pos[bx]-=dx*k*(pa?2:1);pos[bx+1]-=dy*k*(pa?2:1);pos[bx+2]-=dz*k*(pa?2:1);}};
  _inv.copy(grp.matrixWorld).invert();
  for(let it=0;it<6;it++){
    for(let j=0;j<CAPE_H;j++)for(let i=0;i<CAPE_W;i++){const a=j*CAPE_W+i;const dxr=ROW_W[j]/(CAPE_W-1);
      if(i<CAPE_W-1)relax(a,a+1,dxr);
      if(j<CAPE_H-1)relax(a,a+CAPE_W,DY);
      if(i<CAPE_W-1&&j<CAPE_H-1){const dd=Math.hypot(dxr,DY);relax(a,a+CAPE_W+1,dd);relax(a+1,a+CAPE_W,dd);}
      if(j<CAPE_H-2)relax(a,a+2*CAPE_W,2*DY,0.7);                 /* bend: the cloth resists folding */
    }
    for(let j=1;j<CAPE_H;j++)for(let i=0;i<CAPE_W;i++){const k=(j*CAPE_W+i)*3;_cl.set(pos[k],pos[k+1],pos[k+2]).applyMatrix4(_inv);
      if(_cl.y>c.torsoY[0]&&_cl.y<c.torsoY[1]&&_cl.z>c.backZ){_cl.z=c.backZ;}
      /* and it wants to hang flush: a pull toward its rest place down the back */
      const rx=(i/(CAPE_W-1)-0.5)*ROW_W[j],ry=pins[i].y-j*DY,rz=pins[i].z-j*0.012;
      _cl.x+=(rx-_cl.x)*0.06;_cl.y+=(ry-_cl.y)*0.03;_cl.z+=(rz-_cl.z)*0.06;
      _cw.copy(_cl).applyMatrix4(grp.matrixWorld);pos[k]=_cw.x;pos[k+1]=_cw.y;pos[k+2]=_cw.z;}
  }
  const P=c.mesh.geometry.attributes.position;
  for(let v=0;v<n;v++){const k=v*3;_cl.set(pos[k],pos[k+1],pos[k+2]).applyMatrix4(_inv);P.setXYZ(v,_cl.x,_cl.y,_cl.z);}
  P.needsUpdate=true;c.mesh.geometry.computeVertexNormals();
  if(c.emblem&&c.emblem.visible){const a=3*CAPE_W+3,b=5*CAPE_W+3;const N=c.mesh.geometry.attributes.normal;
    c.emblem.position.set((P.getX(a)+P.getX(b))*0.5,(P.getY(a)+P.getY(b))*0.5,(P.getZ(a)+P.getZ(b))*0.5);
    _tmpN.set(N.getX(a)+N.getX(b),N.getY(a)+N.getY(b),N.getZ(a)+N.getZ(b)).normalize();
    if(_tmpN.z>0)_tmpN.negate();
    c.emblem.position.addScaledVector(_tmpN,0.012);
    _cl.copy(c.emblem.position).add(_tmpN);c.emblem.parent.localToWorld(_cl);c.emblem.lookAt(_cl);}
  /* hem effects ride the bottom row */
  if(c.fx){const j=CAPE_H-1;for(let i=0;i<c.fx.nodes.length;i++){const col=c.fx.cols[i];const v=j*CAPE_W+col;c.fx.nodes[i].position.set(P.getX(v),P.getY(v)+c.fx.lift,P.getZ(v));}
    if(c.fx.frost){const pts=c.fx.frost;const A=pts.geometry.attributes.position;for(let q=0;q<A.count;q++){let y=A.getY(q)-dt*0.25;let x=A.getX(q),z=A.getZ(q);if(y<-0.45||Math.random()<0.01){const v=j*CAPE_W+((Math.random()*CAPE_W)|0);x=P.getX(v)+(Math.random()-0.5)*0.05;y=P.getY(v)+Math.random()*0.05;z=P.getZ(v)+(Math.random()-0.5)*0.05;}else{x+=(Math.random()-0.5)*0.004;z+=(Math.random()-0.5)*0.004;}A.setXYZ(q,x,y,z);}A.needsUpdate=true;}}
}
/* which cape the wearer has on: the player's own from the equipment, else plain */
function capeKind(c){
  try{if(typeof pm!=='undefined'&&pm&&pm.g===c.rigRoot&&typeof player!=='undefined'&&player.equip&&player.equip.cape)return player.equip.cape.id;}catch(e){}
  return null;
}
function capeEffects(c,id){
  if(c.fx){c.grp.remove(c.fx.group);c.fx=null;}
  c.kind=id;
  const it=(id&&typeof ITEMS!=='undefined'&&ITEMS[id])?ITEMS[id]:null;
  const trim=(it&&it.equip&&it.equip.trim)||0xd8b25a;
  /* the cloth is every cape now: the body colour is the item's own tint (or the panel's), and the
     game's flat decor panels for bespoke capes collapse so the tapered cloth carries the look */
  const body=(it&&it.equip&&it.equip.tint!==undefined)?it.equip.tint:c.big.material.color.getHex();
  for(const ch of c.grp.children){if(ch.isGroup&&!(c.fx&&ch===c.fx.group))ch.scale.setScalar(0.0001);}
  if(trim!==c.trimHex||body!==c.bodyHex){c.trimHex=trim;c.bodyHex=body;if(c.mesh.material.map)c.mesh.material.map.dispose();c.mesh.material.map=capeTexture(body,trim);c.mesh.material.needsUpdate=true;}
  if(!id)return;
  const fiery=/ember_cape|forgemaster_cape/.test(id),frosty=/aurora_cape/.test(id);
  if(!fiery&&!frosty)return;
  const group=new THREE.Group();c.grp.add(group);
  const fx={group,nodes:[],cols:[],lift:0,frost:null};
  if(fiery&&HD.makeFlame){for(const col of [0,2,3,4,6]){const fl=HD.makeFlame(0.28,col*1.7,col===3?0.6:0.2);fl.position.set(0,0,0);group.add(fl);fx.nodes.push(fl);fx.cols.push(col);}fx.lift=-0.02;}
  if(frosty&&HD.frostMaterial){const N=40;const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(N*3),3));const pts=new THREE.Points(g,HD.frostMaterial);pts.frustumCulled=false;group.add(pts);fx.frost=pts;}
  c.fx=fx;
}
let _capeLast=0,_capeScan=0;
HD.tick=HD.tick||[];
HD.tick.push(function(now){
  const dt=Math.min(0.033,Math.max(0.001,(now-(_capeLast||now))*0.001));_capeLast=now;
  if(now-_capeScan>1500){_capeScan=now;for(const r of rigsSeen){if(!r.upper||!r.upper.parent)continue;try{dressArmour(r.upper);}catch(e){}const f=findCapePanels(r.upper)||findCapePanels(r.g)||(r.g.parent&&!r.g.parent.isScene?findCapePanels(r.g.parent):null);if(f){makeCape(f);capes[capes.length-1].rigRoot=r.g;}}   /* NPC capes hang off the NPC's own group, beside the rig */
    for(const c of capes){const id=capeKind(c);const it=(id&&typeof ITEMS!=='undefined'&&ITEMS[id]&&ITEMS[id].equip)?ITEMS[id].equip:null;const body=(it&&it.tint!==undefined)?it.tint:c.big.material.color.getHex();if(id!==c.kind||body!==c.bodyHex)capeEffects(c,id);}}
  for(const c of capes){
    const shown=c.grp.visible&&(c.big.visible||!!c.kind);
    c.mesh.visible=shown;if(c.fx)c.fx.group.visible=shown;
    if(!shown){c.init=false;continue;}
    capeStep(c,dt,now);
  }
});
/* rigs built from now on */
const _mh=makeHumanoid;
makeHumanoid=function(c){const r=_mh.apply(this,arguments);try{if(r&&r.g)dressRig(r.g);}catch(e){console.warn('[HD] dressRig',e);}return r;};
console.log('[HD] characters dressed:',n);
})();
