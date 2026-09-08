/* ============================================================================
   Milville HD — worn gear.  Loaded after hd-body.js.

   Every piece of armour the game hangs on a rig (breastplate, mail shirt,
   hide jerkin, robe and robe skirt, platelegs, chaps, boots, arm plates and
   gauntlets, full helm, slayer helm, coif, wizard hat) is rebuilt on the
   skinned body's own cross-sections, so it hugs the body it is worn on: the
   rings hd-body.js shapes the torso, arms, legs, feet and head from are
   sampled at the piece's heights and pushed out by the plate's thickness.

   The game's groups, meshes and visibility logic are untouched. Each mesh
   keeps its identity and its tint/trim tag; only its geometry and material
   change, and parts with no place in the new design get empty geometry.
   Pieces are found by the shapes the game made, so the player, remote
   players and the worn-gear icons all dress alike. The old stage-15 shells
   in hd-chars.js stand down (HD.gearOwnsArmour).

   Gameplay is untouched: nothing here reads or writes game state.
   ========================================================================== */
(function(){
'use strict';
try{performance.mark('hd:hd-gear');}catch(e){}
const HD=window.HD;
if(!HD||!HD.ready||!HD.bodyKit)return;
const K=HD.bodyKit;
const {Buf,toGeo,torsoRings,armRings,legRings,footRings,headRings,headPoint,REST,tex,noiseCanvas,fbm,vn,HEAD_Y,EMPTY}=K;
const {LARM,RARM,LLEG,RLEG}=K.bones;
const {kneeOf,elbowOf,KNEE_Y,ELB_Y}=K;
HD.gearOwnsArmour=true;

/* ----------------------------- textures -------------------------------- */
/* all light and neutral: the game's tint colour multiplies them every frame */
/* painted, the way RS3's armour textures are: value structure a tint multiplies — panel seams,
   bevelled edges, scratches and wear on steel; stitching, creases and scuffs on leather; grain
   and knots on wood; weave and soft folds on cloth. All light and neutral. */
function painted(key,S,fn){return tex(key,()=>{const c=document.createElement('canvas');c.width=c.height=S;const g=c.getContext('2d');fn(g,S);return c;});}
const grey=(v,a)=>'rgba('+(v*255|0)+','+(v*255|0)+','+(v*255|0)+','+(a===undefined?1:a)+')';
function seeded(seed){let s=seed|0;return()=>{s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const steelTex=()=>painted('gear:steel',256,(g,S)=>{
  g.drawImage(noiseCanvas(256,(u,v)=>0.86+0.08*(vn(u*3,v*140)-0.5)+0.06*(fbm(u*5,v*5,3)-0.5)),0,0);
  const R=seeded(41);
  /* panel seams: two vertical, three horizontal, each a dark line with a light bevel beside it */
  const seam=(x0,y0,x1,y1)=>{g.strokeStyle=grey(0.30,0.9);g.lineWidth=2.2;g.beginPath();g.moveTo(x0,y0);g.lineTo(x1,y1);g.stroke();g.strokeStyle=grey(1,0.55);g.lineWidth=1;g.beginPath();g.moveTo(x0+1.5,y0+1.5);g.lineTo(x1+1.5,y1+1.5);g.stroke();};
  seam(S*0.33,0,S*0.33,S);seam(S*0.67,0,S*0.67,S);for(const v of [0.22,0.5,0.78])seam(0,S*v,S,S*v);
  /* scratches */
  for(let i=0;i<70;i++){const x=R()*S,y=R()*S,l=4+R()*26,a=(R()-0.5)*0.9;g.strokeStyle=grey(R()<0.5?0.98:0.55,0.35+R()*0.3);g.lineWidth=0.6+R()*0.8;g.beginPath();g.moveTo(x,y);g.lineTo(x+Math.cos(a)*l,y+Math.sin(a)*l);g.stroke();}
  /* worn edges: darker along the bottom band, a highlight along the top */
  let gr=g.createLinearGradient(0,S*0.86,0,S);gr.addColorStop(0,grey(0,0));gr.addColorStop(1,grey(0,0.35));g.fillStyle=gr;g.fillRect(0,0,S,S);
  gr=g.createLinearGradient(0,0,0,S*0.08);gr.addColorStop(0,grey(1,0.35));gr.addColorStop(1,grey(1,0));g.fillStyle=gr;g.fillRect(0,0,S,S);
  /* dents */
  for(let i=0;i<14;i++){const x=R()*S,y=R()*S,r=3+R()*6;const d=g.createRadialGradient(x,y,0,x,y,r);d.addColorStop(0,grey(0.45,0.5));d.addColorStop(0.6,grey(0.7,0.2));d.addColorStop(1,grey(1,0));g.fillStyle=d;g.fillRect(x-r,y-r,r*2,r*2);}
});
const leatherTex=()=>painted('gear:leather',256,(g,S)=>{
  g.drawImage(noiseCanvas(256,(u,v)=>0.80+0.20*(fbm(u*7,v*7,4)-0.5)+0.06*(vn(u*50,v*50)-0.5)),0,0);
  const R=seeded(7);
  /* creases across the piece where it folds */
  for(let i=0;i<9;i++){const y=R()*S;g.strokeStyle=grey(0.4,0.22);g.lineWidth=1.5+R()*2;g.beginPath();g.moveTo(0,y);for(let x=0;x<=S;x+=16)g.lineTo(x,y+(R()-0.5)*6);g.stroke();}
  /* stitching: a light dashed line inside each edge and one down the middle */
  g.setLineDash([4,3]);g.lineWidth=1.4;
  for(const [x0,y0,x1,y1] of [[S*0.06,0,S*0.06,S],[S*0.94,0,S*0.94,S],[0,S*0.07,S,S*0.07],[0,S*0.93,S,S*0.93],[S*0.5,0,S*0.5,S]]){g.strokeStyle=grey(0.25,0.7);g.beginPath();g.moveTo(x0,y0);g.lineTo(x1,y1);g.stroke();g.strokeStyle=grey(1,0.55);g.beginPath();g.moveTo(x0+1,y0+1);g.lineTo(x1+1,y1+1);g.stroke();}
  g.setLineDash([]);
  /* scuffs */
  for(let i=0;i<40;i++){const x=R()*S,y=R()*S,r=2+R()*7;g.fillStyle=grey(0.95,0.12+R()*0.15);g.beginPath();g.ellipse(x,y,r,r*0.5,R()*3,0,7);g.fill();}
  const gr=g.createLinearGradient(0,S*0.85,0,S);gr.addColorStop(0,grey(0,0));gr.addColorStop(1,grey(0,0.3));g.fillStyle=gr;g.fillRect(0,0,S,S);
});
const woodTex=()=>painted('gear:wood',256,(g,S)=>{
  g.drawImage(noiseCanvas(256,(u,v)=>0.78+0.14*(vn(u*40,v*3)-0.5)+0.10*(fbm(u*6,v*2,3)-0.5)),0,0);
  const R=seeded(19);
  for(let i=0;i<36;i++){const x=R()*S;g.strokeStyle=grey(R()<0.5?0.5:0.95,0.25);g.lineWidth=0.8+R()*1.4;g.beginPath();g.moveTo(x,0);for(let y=0;y<=S;y+=12)g.lineTo(x+Math.sin(y*0.05+i)*2.5,y);g.stroke();}
  for(let i=0;i<3;i++){const x=R()*S,y=R()*S;for(let k=5;k>0;k--){g.strokeStyle=grey(0.45,0.3);g.lineWidth=1;g.beginPath();g.ellipse(x,y,k*3.2,k*2.1,0.3,0,7);g.stroke();}}
});
const clothTex=()=>painted('gear:cloth',256,(g,S)=>{
  g.drawImage(noiseCanvas(256,(u,v)=>{const tw=0.5+0.5*Math.sin((u+v)*Math.PI*2*48);return 0.82+0.08*tw+0.10*(fbm(u*4,v*4,3)-0.5);}),0,0);
  const R=seeded(23);
  /* soft vertical folds */
  for(let i=0;i<10;i++){const x=R()*S,w=10+R()*22;const gr=g.createLinearGradient(x-w,0,x+w,0);gr.addColorStop(0,grey(0.5,0));gr.addColorStop(0.5,grey(R()<0.5?0.55:1,0.22));gr.addColorStop(1,grey(0.5,0));g.fillStyle=gr;g.fillRect(x-w,0,w*2,S);}
  const gr=g.createLinearGradient(0,S*0.9,0,S);gr.addColorStop(0,grey(0,0));gr.addColorStop(1,grey(0,0.28));g.fillStyle=gr;g.fillRect(0,0,S,S);
});

/* a fresh material in the mesh's own colour; the tint/trim tag stays on the mesh */
function remat(m,kind){
  const col=m.material&&m.material.color?m.material.color.getHex():0xffffff;
  const P={color:col};
  if(kind==='steel'){P.map=steelTex();P.roughness=0.30;P.metalness=0.60;}   /* the plates reflect like the trim does (the cuirass had read matte beside its gorget and rims) */
  else if(kind==='trim'){P.map=steelTex();P.roughness=0.28;P.metalness=0.62;}
  else if(kind==='mail'){P.map=mailTex();P.roughness=0.5;P.metalness=0.35;}
  else if(kind==='leather'){P.map=leatherTex();P.roughness=0.8;P.metalness=0;}
  else if(kind==='wood'){P.map=woodTex();P.roughness=0.75;P.metalness=0;}
  else if(kind==='dark'){P.roughness=0.6;P.metalness=0.2;}
  else {P.map=clothTex();P.roughness=0.9;P.metalness=0;}
  const mat=new THREE.MeshLambertMaterial(P);
  if(m.material&&m.material.dispose)m.material.dispose();
  m.material=mat;m.castShadow=true;
}

/* ----------------------------- geometry -------------------------------- */
const _p=new THREE.Vector3();
const ascending=rings=>rings.slice().sort((a,b)=>a.y-b.y);
/* rows of the body's own cross-section at the given heights, pushed out by grow (a number or a
   function of y), in the rings' own space, optionally carried into another frame */
function sampled(B,rings,ys,grow,segs,frame,capA,capB,arc){
  rings=ascending(rings);const base=B.pos.length/3;const y0=ys[0],y1=ys[ys.length-1];
  const a0=arc?arc[0]:0,a1=arc?arc[1]:Math.PI*2;
  for(let j=0;j<ys.length;j++){const y=ys[j];const gr=(typeof grow==='function')?grow(y,j):grow;
    for(let i=0;i<=segs;i++){const th=a0+(a1-a0)*i/segs;headPoint(rings,y,th,_p);_p.x+=Math.cos(th)*gr;_p.z+=Math.sin(th)*gr;if(frame)_p.applyMatrix4(frame);
      B.pos.push(_p.x,_p.y,_p.z);B.uv.push(i/segs,(y-y0)/((y1-y0)||1));B.si.push(0,0,0,0);B.sw.push(1,0,0,0);}}
  const row=segs+1;
  for(let j=0;j<ys.length-1;j++)for(let i=0;i<segs;i++){const a=base+j*row+i,b=a+1,c=a+row,d=c+1;B.idx.push(a,c,b,b,c,d);}
  const cap=(y,top)=>{const ci=B.pos.length/3;headPoint(rings,y,0,_p);const cx=_p.x-(_p.x),cz=0;_p.set(cx,y,cz);if(frame)_p.applyMatrix4(frame);
    B.pos.push(_p.x,_p.y,_p.z);B.uv.push(0.5,top?1:0);B.si.push(0,0,0,0);B.sw.push(1,0,0,0);
    const r0=top?base+(ys.length-1)*row:base;for(let i=0;i<segs;i++){if(top)B.idx.push(ci,r0+i+1,r0+i);else B.idx.push(ci,r0+i,r0+i+1);}};
  if(capA)cap(ys[0],false);if(capB)cap(ys[ys.length-1],true);
}
function G(B){const g=toGeo(B);g.deleteAttribute('skinIndex');g.deleteAttribute('skinWeight');return g;}
function setGeo(m,geo){if(m.geometry&&m.geometry!==EMPTY&&m.geometry.dispose)m.geometry.dispose();m.geometry=geo;m.position.set(0,0,0);m.rotation.set(0,0,0);m.scale.set(1,1,1);}
const RIVET=new THREE.SphereGeometry(0.009,8,6);
function rivets(grp,rings,y,grow,n,mat,frame){const R=ascending(rings);
  for(let i=0;i<n;i++){const th=(i+0.5)/n*Math.PI*2;headPoint(R,y,th,_p);_p.x+=Math.cos(th)*grow;_p.z+=Math.sin(th)*grow;if(frame)_p.applyMatrix4(frame);
    const rv=new THREE.Mesh(RIVET,mat);rv.userData.t='trim';rv.userData.hdGear=1;rv.castShadow=true;rv.position.copy(_p);grp.add(rv);}}
const par=m=>(m.geometry&&m.geometry.parameters)||{};
const gtype=m=>{const t=(m.geometry&&m.geometry.type)||'';return (t==='CylinderGeometry'&&par(m).radius!==undefined&&par(m).radiusTop===undefined)?'ConeGeometry':t;};
const front=(rings,y)=>{headPoint(ascending(rings),y,Math.PI/2,_p);return _p.z;};
const HF=new THREE.Matrix4().makeTranslation(0,0.78,0);   /* head rings (upper space) into root space */
const smooth=rings=>rings.map(r=>Object.assign({},r,{f:null}));

/* ------------------------------ the body -------------------------------- */
/* the breastplate: a cuirass with the chest's own relief, faulds over the hips, two lames
   on each shoulder, a gorget, a belt with a buckle, rivets along collar and waist */
function dressPlate(grp,fem){
  const T=torsoRings(fem);
  for(const m of grp.children.slice()){const p=par(m),ty=gtype(m);
    if(ty==='LatheGeometry'){
      const B=new Buf();
      sampled(B,T,[0.86,0.92,1.00,1.08,1.16,1.24,1.30,1.35,1.385],y=>0.020+0.012*Math.max(0,Math.min(1,(y-1.0)/0.3)),28,null,false,true);
      sampled(B,T,[0.60,0.68,0.76,0.84,0.875],y=>0.026+0.05*Math.max(0,(0.84-y)/0.24),28,null,true,false);
      setGeo(m,G(B));remat(m,'steel');}
    else if(ty==='SphereGeometry'){const sx=Math.sign(m.position.x)||1;
      setGeo(m,new THREE.SphereGeometry(0.092,16,10,0,Math.PI*2,0,Math.PI*0.5));m.position.set(sx*0.23,1.33,0);m.rotation.z=-sx*0.4;m.scale.set(1.05,0.62,1.0);remat(m,'steel');}
    else if(ty==='TorusGeometry'){const sx=Math.sign(m.position.x)||1;
      setGeo(m,new THREE.SphereGeometry(0.092,16,8,-Math.PI*0.4,Math.PI*0.8,Math.PI*0.28,Math.PI*0.3));m.position.set(sx*0.245,1.30,0);m.rotation.set(0,sx>0?Math.PI:0,0.45);m.scale.set(1.0,0.9,0.95);remat(m,'trim');}
    else if(ty==='CylinderGeometry'&&p.radiusTop===0.11){const B=new Buf();sampled(B,T,[1.35,1.39,1.43],y=>0.020+0.010*(1.43-y)/0.08,24,null,false,false);setGeo(m,G(B));remat(m,'trim');}
    else if(ty==='CylinderGeometry'&&p.radiusTop===0.155){const B=new Buf();sampled(B,T,[0.855,0.90],0.030,24,null,false,false);setGeo(m,G(B));remat(m,'trim');
      const bk=new THREE.Mesh(new THREE.BoxGeometry(0.06,0.05,0.02),m.material);bk.userData.t='trim';bk.userData.hdGear=1;bk.position.set(0,0.877,front(T,0.875)+0.036);grp.add(bk);
      rivets(grp,T,1.355,0.028,12,m.material);rivets(grp,T,0.905,0.036,14,m.material);
      /* the edging: a trim lip along the faulds' hem and round each pauldron's rim */
      {const B=new Buf();sampled(B,T,[0.585,0.605,0.625],y=>0.078-0.006*Math.abs(y-0.605)/0.02,28,null,false,false);const lip=new THREE.Mesh(G(B),m.material);lip.userData.t='trim';lip.userData.hdGear=1;lip.castShadow=true;grp.add(lip);}
      for(const sx of [-1,1]){const rim=new THREE.Mesh(new THREE.TorusGeometry(0.088,0.007,6,20),m.material);rim.userData.t='trim';rim.userData.hdGear=1;rim.position.set(sx*0.23,1.30,0);rim.rotation.set(Math.PI/2,0,-sx*0.4);rim.scale.set(1.05,1.0,0.75);grp.add(rim);}}
  }
}
/* the mail shirt: rings painted on a shirt that follows the body, short mail sleeves, a gorget, a hem */
function dressChain(grp,fem){const T=torsoRings(fem);
  for(const m of grp.children.slice()){const p=par(m),ty=gtype(m);
    if(ty==='LatheGeometry'){const B=new Buf();sampled(B,T,[0.60,0.66,0.72,0.78,0.86,0.94,1.02,1.10,1.18,1.26,1.32,1.37],y=>0.013+0.012*Math.max(0,(0.8-y)/0.2),28,null,true,true);setGeo(m,G(B));remat(m,'mail');}
    else if(ty==='CylinderGeometry'&&p.radiusTop===0.115){const B=new Buf();sampled(B,T,[1.35,1.39,1.43],y=>0.018+0.010*(1.43-y)/0.08,24,null,false,false);setGeo(m,G(B));remat(m,'trim');}
    else if(ty==='CylinderGeometry'&&p.radiusTop===0.094){const sx=Math.sign(m.position.x)||1;const bone=sx<0?LARM:RARM;const B=new Buf();sampled(B,armRings(bone,sx,fem),[-0.16,-0.10,-0.04,0.02],0.014,14,REST[bone],false,false);setGeo(m,G(B));remat(m,'mail');}
    else if(ty==='TorusGeometry'&&p.radius===0.175){const B=new Buf();sampled(B,T,[0.59,0.62],0.03,24,null,false,false);setGeo(m,G(B));remat(m,'trim');}
    else if(ty==='TorusGeometry'){m.geometry=EMPTY;}
  }}
/* the hide jerkin: sleeveless, laced, a collar band and a belt with its buckle */
function dressHide(grp,fem){const T=torsoRings(fem);
  for(const m of grp.children.slice()){const p=par(m),ty=gtype(m);
    if(ty==='LatheGeometry'){const B=new Buf();sampled(B,T,[0.58,0.64,0.70,0.78,0.86,0.94,1.02,1.10,1.18,1.26,1.31,1.35],y=>0.012+0.014*Math.max(0,(0.9-y)/0.3),28,null,false,true);setGeo(m,G(B));remat(m,'leather');}
    else if(ty==='SphereGeometry'){m.geometry=EMPTY;}
    else if(ty==='CylinderGeometry'&&p.radiusTop===0.1){const B=new Buf();sampled(B,T,[1.34,1.375,1.41],0.016,24,null,false,false);setGeo(m,G(B));remat(m,'leather');}
    else if(ty==='CylinderGeometry'&&p.radiusTop===0.2){const B=new Buf();sampled(B,T,[0.84,0.885],0.022,24,null,false,false);setGeo(m,G(B));remat(m,'leather');}
    else if(ty==='BoxGeometry'){m.position.set(0,0.862,front(T,0.86)+0.03);}
  }}
/* the robe: a gown over the body, wide sleeves, the cowl at the back, a trimmed collar and placket */
function dressRobe(grp,fem){const T=torsoRings(fem);
  for(const m of grp.children.slice()){const p=par(m),ty=gtype(m);
    if(ty==='LatheGeometry'){const B=new Buf();sampled(B,T,[0.62,0.70,0.78,0.86,0.94,1.02,1.10,1.18,1.26,1.32,1.37],y=>0.018+0.02*Math.max(0,(0.86-y)/0.24),28,null,true,true);setGeo(m,G(B));remat(m,'cloth');}
    else if(ty==='SphereGeometry'){const B=new Buf();sampled(B,T,[1.28,1.34,1.40,1.45,1.48],y=>0.045+0.035*Math.max(0,(y-1.28)/0.2),16,null,false,false,[Math.PI+0.3,Math.PI*2-0.3]);sampled(B,T,[1.48,1.45,1.40,1.34,1.28].slice().reverse(),y=>0.025+0.02*Math.max(0,(y-1.28)/0.2),16,null,false,false,[Math.PI+0.3,Math.PI*2-0.3]);setGeo(m,G(B));m.material.side=THREE.DoubleSide;remat(m,'cloth');m.material.side=THREE.DoubleSide;}
    else if(ty==='CylinderGeometry'&&p.radiusTop===0.1){const sx=Math.sign(m.position.x)||1;const bone=sx<0?LARM:RARM;const B=new Buf();sampled(B,armRings(bone,sx,fem),[-0.52,-0.40,-0.28,-0.16,-0.06,0.02],y=>0.016+0.045*Math.max(0,(-0.2-y)/0.32),14,REST[bone],false,false);setGeo(m,G(B));remat(m,'cloth');}
    else if(ty==='CylinderGeometry'&&p.radiusTop===0.12){const B=new Buf();sampled(B,T,[1.34,1.39,1.44],y=>0.02+0.012*(1.44-y)/0.1,24,null,false,false);setGeo(m,G(B));remat(m,'trim');}
    else if(ty==='BoxGeometry'){m.position.set(0,1.06,front(T,1.06)+0.024);m.scale.set(1,1,1);}
  }}
/* the robe's skirt: from the hips to the ankles, flaring, a trimmed hem */
function dressRobeSkirt(grp){
  const R=[{y:0.14,rx:0.36,rz:0.31,b:[0,1]},{y:0.30,rx:0.31,rz:0.265,b:[0,1]},{y:0.48,rx:0.245,rz:0.205,b:[0,1]},{y:0.64,rx:0.195,rz:0.16,b:[0,1]},{y:0.78,rx:0.17,rz:0.14,b:[0,1]},{y:0.86,rx:0.16,rz:0.13,b:[0,1]}];
  for(const m of grp.children.slice()){const ty=gtype(m);
    if(ty==='LatheGeometry'){const B=new Buf();K.tube(B,R,28,null,false,true);setGeo(m,G(B));remat(m,'cloth');}
    else if(ty==='TorusGeometry'){const B=new Buf();K.tube(B,[{y:0.13,rx:0.37,rz:0.32,b:[0,1]},{y:0.17,rx:0.355,rz:0.305,b:[0,1]}],28,null,false,false);setGeo(m,G(B));remat(m,'trim');}
  }}

/* ------------------------------ the limbs ------------------------------- */
/* platelegs: cuisse, a knee cop with its spike, a greave, each on the leg's own section */
function dressPlateLeg(grp,fem,bone){const L=legRings(bone,fem);
  for(const m of grp.children.slice()){const p=par(m),ty=gtype(m);
    if(ty==='CylinderGeometry'&&p.radiusTop===0.098){const B=new Buf();sampled(B,L,[-0.31,-0.24,-0.16,-0.08,0.0],y=>0.017+0.006*Math.max(0,(y+0.31)/0.31),16,null,false,false);setGeo(m,G(B));remat(m,'steel');
      const tm=grp.children.find(c=>c.userData.t==='trim'&&c.material);if(tm){const E=new Buf();sampled(E,L,[-0.315,-0.30],0.022,16,null,false,false);const lip=new THREE.Mesh(G(E),tm.material);lip.userData.t='trim';lip.userData.hdGear=1;grp.add(lip);}}
    else if(ty==='CylinderGeometry'&&p.radiusTop===0.078){const B=new Buf();sampled(B,L,[-0.64,-0.56,-0.48,-0.40],y=>0.014+0.006*Math.max(0,(y+0.64)/0.24),16,null,false,false);setGeo(m,G(B));remat(m,'steel');
      const tm=grp.children.find(c=>c.userData.t==='trim'&&c.material);if(tm){const E=new Buf();sampled(E,L,[-0.645,-0.625],0.019,16,null,false,false);const lip=new THREE.Mesh(G(E),tm.material);lip.userData.t='trim';lip.userData.hdGear=1;grp.add(lip);}}
    else if(ty==='SphereGeometry'&&m.userData.t==='trim'){setGeo(m,new THREE.SphereGeometry(0.068,14,10,0,Math.PI*2,0,Math.PI*0.6));m.position.set(0,-0.335,0.028);m.rotation.x=Math.PI/2-0.2;m.scale.set(1.05,1.0,0.9);remat(m,'trim');}
    else if(ty==='SphereGeometry'){m.geometry=EMPTY;}
    else if(ty==='ConeGeometry'){m.position.set(0,-0.34,0.095);m.scale.setScalar(0.8);remat(m,'trim');}
  }}
/* leather chaps */
function dressHideLeg(grp,fem,bone){const L=legRings(bone,fem);
  for(const m of grp.children.slice()){const p=par(m),ty=gtype(m);
    if(ty==='CylinderGeometry'&&p.radiusTop===0.1){const B=new Buf();sampled(B,L,[-0.36,-0.28,-0.20,-0.12,-0.04,0.02],0.015,16,null,false,false);setGeo(m,G(B));remat(m,'leather');}
    else if(ty==='CylinderGeometry'&&p.radiusTop===0.07){const B=new Buf();sampled(B,L,[-0.63,-0.55,-0.47,-0.40,-0.34],0.012,16,null,false,false);setGeo(m,G(B));remat(m,'leather');}
    else if(ty==='SphereGeometry'){setGeo(m,new THREE.SphereGeometry(0.062,12,9,0,Math.PI*2,0,Math.PI*0.6));m.position.set(0,-0.34,0.03);m.rotation.x=Math.PI/2-0.2;m.scale.set(1.05,1.0,0.85);remat(m,'leather');}
    else if(ty==='TorusGeometry'){const B=new Buf();sampled(B,L,[-0.615,-0.585],0.012,16,null,false,false);setGeo(m,G(B));remat(m,'trim');}
  }}
/* boots: one boot from the toe to the shin, a cuff at the top */
function dressBoot(grp,bone){
  const rings=ascending(footRings(bone).concat([{y:-0.62,rx:0.044,rz:0.046,b:[bone,1]},{y:-0.58,rx:0.046,rz:0.048,b:[bone,1]}]));
  let first=true;
  for(const m of grp.children.slice()){const p=par(m),ty=gtype(m);
    if(ty==='BoxGeometry'&&m.userData.t==='tint'){
      if(first){first=false;const B=new Buf();sampled(B,rings,[-0.785,-0.77,-0.75,-0.72,-0.69,-0.66,-0.63,-0.60,-0.575],y=>0.007+0.004*Math.max(0,(y+0.66)/0.09),16,null,true,true);setGeo(m,G(B));remat(m,'leather');}
      else m.geometry=EMPTY;}
    else if(ty==='BoxGeometry'){const B=new Buf();sampled(B,rings,[-0.60,-0.565],0.014,16,null,false,false);setGeo(m,G(B));remat(m,'trim');}
  }}
/* the ember boots: the volcanic-glass boot on the foot, the glowing seam a band round it */
function dressEmberBoot(grp,bone){
  const rings=ascending(footRings(bone).concat([{y:-0.62,rx:0.044,rz:0.046,b:[bone,1]},{y:-0.58,rx:0.046,rz:0.048,b:[bone,1]}]));
  for(const m of grp.children.slice()){const p=par(m),ty=gtype(m);
    if(ty==='BoxGeometry'&&p.width===0.16){const B=new Buf();sampled(B,rings,[-0.785,-0.77,-0.75,-0.72,-0.69,-0.66,-0.63,-0.60,-0.575],y=>0.012+0.005*Math.max(0,(y+0.66)/0.09),16,null,true,true);setGeo(m,G(B));remat(m,'steel');m.material.roughness=0.3;m.material.metalness=0.2;}
    else if(ty==='BoxGeometry'){const B=new Buf();sampled(B,rings,[-0.70,-0.68],0.018,16,null,false,false);setGeo(m,G(B));}
  }
}
/* the ember gauntlets: a glass gauntlet over the hand, the knuckle embers kept */
function dressEmberGaunt(grp,fem,bone,side){const A=armRings(bone,side,fem);
  for(const m of grp.children.slice()){const p=par(m),ty=gtype(m);
    if(ty==='CylinderGeometry'&&p.radiusTop===0.06){const B=new Buf();sampled(B,A,[-0.55,-0.50,-0.45,-0.40],y=>0.012+0.008*Math.max(0,(-0.45-y)/0.1),14,null,false,false);setGeo(m,G(B));remat(m,'steel');m.material.roughness=0.3;}
    else if(ty==='SphereGeometry'&&p.radius===0.06){const B=new Buf();sampled(B,A,[-0.69,-0.66,-0.62,-0.58,-0.55],0.010,14,null,true,false);setGeo(m,G(B));remat(m,'steel');m.material.roughness=0.3;}
  }
}
/* plate arms: rerebrace, vambrace flaring at the elbow, a cuff, a gauntlet over the hand */
function dressPlateArm(grp,fem,bone,side){const A=armRings(bone,side,fem);
  for(const m of grp.children.slice()){const p=par(m),ty=gtype(m);
    if(ty==='CylinderGeometry'&&p.radiusTop===0.076){const B=new Buf();sampled(B,A,[-0.30,-0.22,-0.14,-0.06,0.0],y=>0.012+0.004*Math.max(0,(y+0.1)/0.1),14,null,false,false);setGeo(m,G(B));remat(m,'steel');}
    else if(ty==='CylinderGeometry'&&p.radiusTop===0.06){const B=new Buf();sampled(B,A,[-0.545,-0.48,-0.40,-0.32],y=>0.010+0.010*Math.max(0,(-0.40-y)/0.145),14,null,false,false);setGeo(m,G(B));remat(m,'steel');}
    else if(ty==='TorusGeometry'){const B=new Buf();sampled(B,A,[-0.565,-0.535],0.016,14,null,false,false);setGeo(m,G(B));remat(m,'trim');}
    else if(ty==='SphereGeometry'){const B=new Buf();sampled(B,A,[-0.69,-0.66,-0.62,-0.58,-0.55],0.008,14,null,true,false);setGeo(m,G(B));remat(m,'steel');}
  }}

/* ------------------------------ the head -------------------------------- */
/* the full helm: a shell over the whole head, a brow band, the visor and its slits, the plume */
function dressHelm(grp,fem){const H=smooth(headRings(fem));
  for(const m of grp.children.slice()){const p=par(m),ty=gtype(m);
    if(ty==='LatheGeometry'){const B=new Buf();const ys=[-0.12,-0.08,-0.04,0.0,0.04,0.08,0.12,0.15,0.17,0.185,0.195].map(y=>HEAD_Y+y);
      const ridge=H.map(r=>Object.assign({},r,{f:th=>1+0.09*(K.bump(th,Math.PI/2,0.2)+K.bump(th,Math.PI*1.5,0.2))*Math.max(0,Math.min(1,(r.y-HEAD_Y-0.02)/0.1))}));
      sampled(B,ridge,ys,y=>0.020+0.004*Math.max(0,(y-HEAD_Y-0.12)/0.08),32,HF,false,true);setGeo(m,G(B));remat(m,'steel');}
    else if(ty==='CylinderGeometry'&&p.radiusTop===0.216){const B=new Buf();sampled(B,H,[HEAD_Y+0.078,HEAD_Y+0.098,HEAD_Y+0.118],0.028,32,HF,false,false);setGeo(m,G(B));remat(m,'trim');}
    else if(ty==='BoxGeometry'&&p.width===0.22){const B=new Buf();sampled(B,H,[HEAD_Y-0.035,HEAD_Y+0.0,HEAD_Y+0.035,HEAD_Y+0.07],0.029,14,HF,false,false,[Math.PI/2-1.15,Math.PI/2+1.15]);setGeo(m,G(B));m.material.color.setHex(0x1a1d22);remat(m,'steel');m.material.roughness=0.7;
      const trimMat=grp.children.find(c=>c.userData.t==='trim'&&gtype(c)!=='ConeGeometry').material;
      const nasal=new THREE.Mesh(new THREE.BoxGeometry(0.028,0.11,0.02),trimMat);nasal.userData.t='trim';nasal.userData.hdGear=1;nasal.position.set(0,1.515,front(H,HEAD_Y+0.02)+0.036);grp.add(nasal);
      /* the lip round the face opening and a crest along the crown */
      {const E=new Buf();sampled(E,H,[HEAD_Y-0.045,HEAD_Y-0.035],0.032,14,HF,false,false,[Math.PI/2-1.2,Math.PI/2+1.2]);const lip=new THREE.Mesh(G(E),trimMat);lip.userData.t='trim';lip.userData.hdGear=1;grp.add(lip);}
      {const E=new Buf();const cr=smooth(headRings(fem)).map(r=>Object.assign({},r,{f:th=>1+0.16*K.bump(th,Math.PI/2,0.12)+0.16*K.bump(th,Math.PI*1.5,0.12)}));sampled(E,cr,[HEAD_Y+0.06,HEAD_Y+0.10,HEAD_Y+0.14,HEAD_Y+0.17,HEAD_Y+0.19],0.022,32,HF,false,true,[Math.PI/2-0.16,Math.PI/2+0.16]);const crest=new THREE.Mesh(G(E),trimMat);crest.userData.t='trim';crest.userData.hdGear=1;grp.add(crest);}}
    else if(ty==='BoxGeometry'){m.position.set(m.position.x*0.85,1.52,0.158);m.scale.set(0.8,0.6,0.5);}
    else if(ty==='CylinderGeometry'){m.position.set(0,1.70,-0.03);m.scale.setScalar(0.9);remat(m,'trim');}
    else if(ty==='ConeGeometry'){m.position.y-=0.12;m.position.z+=0.02;}
  }}
/* the slayer helm: dome and jaw on the head, the face plate and cheeks closer in, the horns,
   crest and rivets drawn in to the smaller skull */
function dressSlayer(grp,fem){const H=smooth(headRings(fem));
  for(const m of grp.children.slice()){const p=par(m),ty=gtype(m);
    if(ty==='SphereGeometry'&&p.radius===0.223){const B=new Buf();sampled(B,H,[0.0,0.04,0.08,0.12,0.15,0.17,0.185,0.20].map(y=>HEAD_Y+y),0.024,28,HF,false,true);setGeo(m,G(B));remat(m,'steel');}
    else if(ty==='CylinderGeometry'&&p.radiusTop===0.213){const B=new Buf();sampled(B,H,[-0.13,-0.09,-0.05,-0.01,0.01].map(y=>HEAD_Y+y),0.024,28,HF,false,false);setGeo(m,G(B));remat(m,'steel');}
    else if(ty==='BoxGeometry'&&p.width===0.275){const B=new Buf();sampled(B,H,[HEAD_Y-0.10,HEAD_Y-0.05,HEAD_Y+0.0,HEAD_Y+0.05,HEAD_Y+0.09],0.03,14,HF,false,false,[Math.PI/2-1.2,Math.PI/2+1.2]);setGeo(m,G(B));remat(m,'steel');}
    else if(ty==='BoxGeometry'&&p.width===0.06){m.geometry=EMPTY;}
    else if(ty==='BoxGeometry'&&p.width===0.032){m.position.y=1.69;m.scale.set(1,0.8,0.8);remat(m,'trim');}
    else if(ty==='BoxGeometry'){m.position.z=0.165;m.position.y-=0.01;m.scale.set(0.8,0.8,0.5);}
    else if(ty==='CylinderGeometry'&&p.radiusTop===0.241){const B=new Buf();sampled(B,H,[HEAD_Y+0.095,HEAD_Y+0.115,HEAD_Y+0.135],0.032,28,HF,false,false);setGeo(m,G(B));remat(m,'trim');}
    else if(ty==='ConeGeometry'&&p.radius===0.058){const sx=Math.sign(m.position.x)||1;m.position.set(sx*0.15,1.63,0.0);remat(m,'trim');}
    else if(ty==='ConeGeometry'&&p.height===0.18){const sx=Math.sign(m.position.x)||1;m.position.set(sx*0.235,1.75,-0.04);remat(m,'trim');}
    else if(ty==='ConeGeometry'&&p.height===0.14){m.position.set(0,1.72,0.13);remat(m,'trim');}
    else if(ty==='SphereGeometry'&&p.radius===0.024){const sx=Math.sign(m.position.x)||1;m.position.set(sx*0.145,1.53,0.095);remat(m,'trim');}
  }}
/* the leather coif */
function dressCoif(grp,fem){const H=smooth(headRings(fem));
  for(const m of grp.children.slice()){const p=par(m),ty=gtype(m);
    if(ty==='SphereGeometry'&&p.radius===0.18){const B=new Buf();sampled(B,H,[-0.02,0.02,0.06,0.10,0.13,0.155,0.17,0.185,0.195].map(y=>HEAD_Y+y),0.012,28,HF,false,true);setGeo(m,G(B));remat(m,'leather');}
    else if(ty==='SphereGeometry'&&p.radius===0.09){const sx=Math.sign(m.position.x)||1;m.position.set(sx*0.128,1.45,0.0);m.scale.set(0.5,1.0,0.8);remat(m,'leather');}
    else if(ty==='SphereGeometry'){m.position.set(0,1.42,-0.085);m.scale.set(0.95,0.8,0.6);remat(m,'leather');}
  }}
/* the wizard hat sits on the new crown */
function dressWizHat(grp){for(const m of grp.children){if(!m.isMesh)continue;m.position.y+=0.012;if(m.userData.t)remat(m,m.userData.t==='trim'?'trim':'cloth');}}


/* ------------------------------ weapons --------------------------------- */
/* a blade: rows down its length, each a diamond section (thin edges, a thick spine), tapering
   to the tip; flat-shaded so the bevels catch the light. y runs from the guard (0) down to
   the tip (-len). */
function bladeGeo(len,width,thick,tipLen,curve){
  const pos=[];const rows=[];const N=9;
  for(let i=0;i<=N;i++){const t=i/N;const y=-len*t;const inTip=len*t>len-tipLen;const k=inTip?Math.max(0,(len-len*t)/tipLen):1;
    const w=width*(1-0.25*t)*k,d=thick*(1-0.3*t)*Math.max(0.15,k);const cx=curve?curve(t):0;
    rows.push([[cx+w,y,0],[cx,y,d],[cx-w,y,0],[cx,y,-d]]);}
  const tri=(a,b,c)=>{pos.push(a[0],a[1],a[2],b[0],b[1],b[2],c[0],c[1],c[2]);};
  for(let i=0;i<N;i++){const A=rows[i],B=rows[i+1];for(let k=0;k<4;k++){const k2=(k+1)%4;tri(A[k],B[k],A[k2]);tri(A[k2],B[k],B[k2]);}}
  const top=rows[0];tri(top[0],top[1],top[2]);tri(top[0],top[2],top[3]);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  const uv=[];for(let i=0;i<pos.length/3;i++)uv.push(pos[i*3]*4,pos[i*3+1]*2);g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.computeVertexNormals();return g;
}
/* a crossguard: a bar with swept ends and a central block */
function guardParts(grp,mat,y,halfW,depth){
  const bar=new THREE.Mesh(new THREE.CylinderGeometry(0.016,0.016,halfW*2,8),mat);bar.rotation.z=Math.PI/2;bar.position.y=y;bar.scale.z=depth/0.032;bar.userData.t='trim';bar.userData.hdGear=1;grp.add(bar);
  for(const sx of [-1,1]){const tip=new THREE.Mesh(new THREE.SphereGeometry(0.022,10,8),mat);tip.position.set(sx*halfW,y-0.008,0);tip.scale.set(1,0.8,depth/0.032*0.9);tip.userData.t='trim';tip.userData.hdGear=1;grp.add(tip);}
  const blk=new THREE.Mesh(new THREE.OctahedronGeometry(0.03,0),mat);blk.position.y=y;blk.scale.set(1,1.3,depth/0.032*0.8);blk.userData.t='trim';blk.userData.hdGear=1;grp.add(blk);
}
function gripWrap(grp,y0,y1){
  const dark=new THREE.MeshLambertMaterial({color:0x2a1c12,roughness:0.85});
  const n=5;for(let i=0;i<n;i++){const y=y0+(y1-y0)*(i+0.5)/n;const r=new THREE.Mesh(new THREE.TorusGeometry(0.019,0.004,5,10),dark);r.rotation.x=Math.PI/2;r.position.y=y;r.userData.hdGear=1;grp.add(r);}
}
function dressSword(grp){
  let guard=null,pom=null;
  for(const m of grp.children.slice()){const p=par(m),ty=gtype(m);
    if(ty==='BoxGeometry'&&p.width===0.018){setGeo(m,bladeGeo(0.62,0.028,0.009,0.12));m.position.y=-0.08;remat(m,'steel');m.material.roughness=0.3;m.material.metalness=0.5;}
    else if(ty==='BoxGeometry'&&p.width===0.024){m.geometry=EMPTY;}
    else if(ty==='ConeGeometry'){m.geometry=EMPTY;}
    else if(ty==='BoxGeometry'&&p.width===0.20){guard=m;m.geometry=EMPTY;}
    else if(ty==='BoxGeometry'&&p.width===0.04){setGeo(m,new THREE.CylinderGeometry(0.017,0.019,0.13,10));m.position.y=0.0;remat(m,'wood');gripWrap(grp,-0.055,0.055);}
    else if(ty==='SphereGeometry'){pom=m;setGeo(m,new THREE.SphereGeometry(0.03,10,8));m.position.y=0.075;m.scale.set(1,0.8,1);remat(m,'trim');}
  }
  if(guard){remat(guard,'trim');guardParts(grp,guard.material,-0.075,0.10,0.04);}
}
function dressScim(grp){
  let guard=null;
  for(const m of grp.children.slice()){const p=par(m),ty=gtype(m);
    if(ty==='ExtrudeGeometry'){remat(m,'steel');m.material.roughness=0.3;m.material.metalness=0.5;m.material.side=THREE.DoubleSide;}
    else if(ty==='BoxGeometry'&&p.width===0.19){guard=m;m.geometry=EMPTY;}
    else if(ty==='BoxGeometry'&&p.width===0.04){setGeo(m,new THREE.CylinderGeometry(0.017,0.019,0.13,10));m.position.y=0.0;remat(m,'wood');gripWrap(grp,-0.055,0.055);}
    else if(ty==='SphereGeometry'){setGeo(m,new THREE.SphereGeometry(0.03,10,8));m.position.y=0.075;m.scale.set(1,0.8,1);remat(m,'trim');}
  }
  if(guard){remat(guard,'trim');guardParts(grp,guard.material,-0.075,0.09,0.05);}
}
/* an axe head: a bearded bit swept from the haft, with a poll behind */
function axeHeadGeo(){
  const sh=new THREE.Shape();
  sh.moveTo(0,0.06);sh.lineTo(0.05,0.075);sh.quadraticCurveTo(0.16,0.09,0.2,0.12);sh.quadraticCurveTo(0.235,0.02,0.2,-0.12);sh.quadraticCurveTo(0.13,-0.08,0.05,-0.075);sh.lineTo(0,-0.06);sh.lineTo(-0.045,-0.04);sh.lineTo(-0.045,0.04);sh.closePath();
  const g=new THREE.ExtrudeGeometry(sh,{depth:0.028,bevelEnabled:true,bevelThickness:0.008,bevelSize:0.008,bevelSegments:2});g.translate(0,0,-0.014);return g;
}
function dressAxe(grp){
  for(const m of grp.children.slice()){const p=par(m),ty=gtype(m);
    if(ty==='BoxGeometry'&&p.width===0.045&&p.height===0.5){setGeo(m,new THREE.CylinderGeometry(0.02,0.024,0.56,9));m.position.y=-0.22;remat(m,'wood');}
    else if(ty==='BoxGeometry'&&p.height===0.17){setGeo(m,axeHeadGeo());m.rotation.y=-Math.PI/2;m.position.set(0,-0.44,0.0);remat(m,'steel');m.material.roughness=0.35;m.material.metalness=0.45;}
  }
}
function dressPick(grp){
  for(const m of grp.children.slice()){const p=par(m),ty=gtype(m);
    if(ty==='BoxGeometry'&&p.width===0.05&&p.height===0.6){setGeo(m,new THREE.CylinderGeometry(0.02,0.025,0.64,9));m.position.y=-0.16;remat(m,'wood');}
    else if(ty==='BoxGeometry'&&p.depth===0.44){
      const B=new Buf();
      K.tube(B,[{y:-0.24,rx:0.008,rz:0.008,b:[0,1]},{y:-0.12,rx:0.022,rz:0.028,b:[0,1]},{y:0,rx:0.03,rz:0.034,b:[0,1]},{y:0.12,rx:0.022,rz:0.028,b:[0,1]},{y:0.24,rx:0.008,rz:0.008,b:[0,1]}],10,new THREE.Matrix4().makeRotationX(Math.PI/2),true,true);
      setGeo(m,G(B));m.position.set(0,-0.40,0);remat(m,'steel');m.material.roughness=0.4;m.material.metalness=0.4;}
  }
}
function dressMaul(grp){
  for(const m of grp.children.slice()){const p=par(m),ty=gtype(m);
    if(ty==='CylinderGeometry'&&p.height===0.6){remat(m,'wood');}
    else if(ty==='BoxGeometry'&&p.width===0.19){setGeo(m,new THREE.CylinderGeometry(0.1,0.1,0.2,8));m.rotation.z=Math.PI/2;m.position.y=-0.6;m.scale.set(1,1.1,0.85);remat(m,'steel');m.material.roughness=0.5;m.material.metalness=0.35;}
    else if(ty==='BoxGeometry'&&p.width===0.21){setGeo(m,new THREE.TorusGeometry(0.1,0.014,6,8));m.rotation.y=Math.PI/2;m.position.y=-0.6;m.scale.set(1.1,0.9,1);remat(m,'trim');
      const b2=new THREE.Mesh(m.geometry,m.material);b2.rotation.y=Math.PI/2;b2.position.set(-0.07,-0.6,0);b2.scale.copy(m.scale);b2.userData.hdGear=1;grp.add(b2);m.position.x=0.07;}
    else if(ty==='BoxGeometry'&&p.width===0.038){setGeo(m,new THREE.CylinderGeometry(0.02,0.022,0.14,9));m.position.y=-0.06;remat(m,'wood');gripWrap(grp,-0.12,0.0);}
  }
}
/* the kite shield: the game's kite outline, bevelled, a domed boss, a rim */
function kiteShape(w,top,bot){const k=new THREE.Shape();const mid=top-(top-bot)*0.46;k.moveTo(-w,top);k.lineTo(w,top);k.lineTo(w,mid);k.lineTo(0,bot);k.lineTo(-w,mid);k.closePath();return k;}
function dressKite(grp){
  for(const m of grp.children.slice()){const p=par(m),ty=gtype(m);
    if(ty==='ExtrudeGeometry'&&m.userData.t==='trim'){setGeo(m,new THREE.ExtrudeGeometry(kiteShape(0.2,0.3,-0.47),{depth:0.02,bevelEnabled:true,bevelThickness:0.01,bevelSize:0.012,bevelSegments:2}));m.position.set(0,0.05,-0.03);remat(m,'trim');}
    else if(ty==='ExtrudeGeometry'){setGeo(m,new THREE.ExtrudeGeometry(kiteShape(0.176,0.28,-0.44),{depth:0.03,bevelEnabled:true,bevelThickness:0.014,bevelSize:0.012,bevelSegments:3}));m.position.set(0,0.05,-0.005);remat(m,'steel');m.material.roughness=0.4;m.material.metalness=0.4;}
    else if(ty==='BoxGeometry'){remat(m,'trim');m.position.z=0.052;}
    else if(ty==='SphereGeometry'){setGeo(m,new THREE.SphereGeometry(0.04,12,9,0,Math.PI*2,0,Math.PI*0.5));m.rotation.x=Math.PI/2;m.position.set(0,0.09,0.05);remat(m,'trim');}
  }
}
function dressBow(grp){
  for(const m of grp.children.slice()){const p=par(m),ty=gtype(m);
    if(ty==='CylinderGeometry'&&p.radiusTop===0.023){setGeo(m,new THREE.CylinderGeometry(0.028,0.028,0.19,10));m.position.set(0,0,0.004);m.scale.set(1,1,1.35);remat(m,'leather');
      const riser=new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.034,0.09,10),m.material);riser.position.set(0,0.13,0.004);riser.userData.t='trim';riser.userData.hdGear=1;grp.add(riser);
      const riser2=new THREE.Mesh(new THREE.CylinderGeometry(0.034,0.02,0.09,10),m.material);riser2.position.set(0,-0.13,0.004);riser2.userData.t='trim';riser2.userData.hdGear=1;grp.add(riser2);}
    else if(ty==='SphereGeometry'&&p.radius===0.019){setGeo(m,new THREE.ConeGeometry(0.014,0.05,8));m.position.copy(m.position);m.rotation.z=m.position.y>0?0:Math.PI;remat(m,'trim');}
  }
  grp.traverse(c=>{if(c.isMesh&&gtype(c)==='TorusGeometry')remat(c,'wood');});
}
function dressStaff(grp){
  for(const m of grp.children.slice()){const p=par(m),ty=gtype(m);
    if(ty==='CylinderGeometry'&&p.height===1.18){remat(m,'wood');const mat=partTrim(grp);for(const y of [-0.2,0.05,0.35,0.62]){const r=new THREE.Mesh(new THREE.TorusGeometry(0.024,0.006,6,12),mat);r.rotation.x=Math.PI/2;r.position.y=y;r.userData.hdGear=1;grp.add(r);}}
    else if(ty==='CylinderGeometry'&&p.radiusTop===0.052){setGeo(m,new THREE.CylinderGeometry(0.056,0.03,0.11,6));m.position.y=0.85;remat(m,'trim');
      for(let i=0;i<4;i++){const a=i/4*Math.PI*2;const prong=new THREE.Mesh(new THREE.ConeGeometry(0.012,0.12,5),m.material);prong.position.set(Math.cos(a)*0.06,0.98,Math.sin(a)*0.06);prong.rotation.set(Math.sin(a)*0.35,0,-Math.cos(a)*0.35);prong.userData.t='trim';prong.userData.hdGear=1;grp.add(prong);}}
  }
}
function partTrim(grp){const t=grp.children.find(c=>c.userData.t==='trim'&&c.material);return t?t.material:new THREE.MeshLambertMaterial({color:0x8a6a2a,roughness:0.4,metalness:0.4});}
function dressWhip(grp){
  /* the tendril keeps the game's overlapping beads (the abyssal whip is segmented in RS3 too);
     leather over all of it */
  grp.traverse(c=>{if(!c.isMesh||!c.material||!c.material.color)return;const t=gtype(c),p=par(c);
    if(t==='SphereGeometry'||t==='CylinderGeometry'){c.material=new THREE.MeshLambertMaterial({color:c.material.color.getHex(),map:leatherTex(),roughness:0.75});}});
}
function dressWeapons(ag,side){
  let n=0;
  const once=(grp,fn)=>{grp.userData.hdGear=1;try{fn();n++;}catch(e){console.warn('[HD] weapon',e);}};
  /* held things live in the elbow bone once hd-body has moved them */
  let hosts=ag.children.slice();for(const c of ag.children)if(c.isBone)for(const e of c.children)if(e.isBone)hosts=hosts.concat(e.children);
  for(const tool of hosts){
    if(!tool.isGroup||tool.userData.hdGear||tool.userData.gaunt)continue;
    const kids=tool.children;
    if(kids.length&&kids.every(c=>c.isGroup)){   /* the hand's tool rack */
      for(const grp of kids){if(!grp.isGroup||grp.userData.hdGear)continue;const k=grp.children;
        if(k.some(m=>m.isMesh&&gtype(m)==='BoxGeometry'&&par(m).width===0.018&&par(m).height===0.46))once(grp,()=>dressSword(grp));
        else if(k.some(m=>m.isMesh&&gtype(m)==='ExtrudeGeometry')&&k.some(m=>m.isMesh&&par(m).width===0.19))once(grp,()=>dressScim(grp));
        else if(k.some(m=>m.isMesh&&gtype(m)==='BoxGeometry'&&par(m).height===0.17&&par(m).depth===0.24))once(grp,()=>dressAxe(grp));
        else if(k.some(m=>m.isMesh&&gtype(m)==='BoxGeometry'&&par(m).depth===0.44))once(grp,()=>dressPick(grp));
        else if(k.some(m=>m.isMesh&&gtype(m)==='BoxGeometry'&&par(m).width===0.19&&par(m).height===0.22))once(grp,()=>dressMaul(grp));
        else if(k.some(m=>m.isMesh&&gtype(m)==='CylinderGeometry'&&par(m).radiusTop===0.023&&par(m).height===0.17))once(grp,()=>dressBow(grp));
        else if(grp.userData.orb&&k.some(m=>m.isMesh&&par(m).height===1.18))once(grp,()=>dressStaff(grp));
        else if(grp._segs)once(grp,()=>dressWhip(grp));
      }
    }
    else if(side<0&&kids.filter(m=>m.isMesh&&gtype(m)==='ExtrudeGeometry').length===2&&kids.some(m=>m.isMesh&&gtype(m)==='SphereGeometry'))once(tool,()=>dressKite(tool));
  }
  return n;
}

/* ------------------------------ joints ---------------------------------- */
/* A dressed arm or leg group is rigid, hung on the game's whole-limb group; with knees and
   elbows underneath it would stay straight while the shin bends away. So every piece in such
   a group becomes a SkinnedMesh bound to the body's skeleton: geometry moved into root space
   at the rest pose, weights by height (above the joint the limb bone, below it the joint's).
   The original mesh keeps its material (the game tints it) and an empty geometry; the clone
   follows the original's visibility each frame (hd-body's tick). */
function skinGroup(body,grp,bone){
  if(!body||!body.skeleton||!body.gearClones)return;
  const isArm=(bone===LARM||bone===RARM);const B2=isArm?elbowOf(bone):kneeOf(bone);const split=isArm?ELB_Y:KNEE_Y;
  const frame=REST[bone];const limb=grp.parent;
  grp.traverse(m=>{if(!m.isMesh||m.userData.hdSkinned)return;const src=m.geometry;if(!src||src===EMPTY||!src.attributes.position||!src.attributes.position.count)return;
    m.userData.hdSkinned=1;
    const geo=src.clone();
    const M=new THREE.Matrix4();const chain=[];let o=m;while(o&&o!==limb){chain.unshift(o);o=o.parent;}for(const c of chain){c.updateMatrix();M.multiply(c.matrix);}
    geo.applyMatrix4(M);
    const pos=geo.attributes.position,n=pos.count;const si=new Uint16Array(n*4),sw=new Float32Array(n*4);
    for(let i=0;i<n;i++){const y=pos.getY(i);let w2=(split+0.03-y)/0.06;w2=Math.max(0,Math.min(1,w2));si[i*4]=bone;si[i*4+1]=B2;sw[i*4]=1-w2;sw[i*4+1]=w2;}
    geo.setAttribute('skinIndex',new THREE.BufferAttribute(si,4));geo.setAttribute('skinWeight',new THREE.BufferAttribute(sw,4));
    geo.applyMatrix4(frame);
    /* its own material with skinning on: r128 renders a SkinnedMesh whose material lacks the flag
       in the rest pose, so armour stood still while the body walked. The colour follows the source each tick. */
    const mat=m.material.clone();mat.skinning=true;mat.needsUpdate=true;
    const sm=new THREE.SkinnedMesh(geo,mat);sm.castShadow=true;sm.receiveShadow=true;sm.frustumCulled=false;sm.userData.hdGear=1;sm.userData.hdBodyPart=1;sm.userData.hdSkinOf=1;
    body.g.add(sm);sm.bind(body.skeleton,new THREE.Matrix4());
    body.gearClones.push({clone:sm,src:m});
    m.geometry=EMPTY;
  });
}
/* ------------------------------ finding pieces -------------------------- */
function dressRig(body){
  const {g,upper,female}=body;
  const arms=upper.children.filter(c=>c.isGroup&&c.userData.sleeve);
  const legs=g.children.filter(c=>c.isGroup&&c.userData.thigh);
  let n=0;
  const once=(grp,fn)=>{grp.userData.hdGear=1;try{fn();n++;}catch(e){console.warn('[HD] gear',e);}};
  for(const grp of upper.children){
    if(!grp.isGroup||grp.userData.hdGear||grp.userData.sleeve||grp===body.hairG)continue;
    const kids=grp.children;const lathe=kids.find(m=>m.isMesh&&gtype(m)==='LatheGeometry');
    if(lathe&&Math.abs(lathe.scale.z-0.68)<0.005&&Math.abs(lathe.position.y-1.1)<0.01)once(grp,()=>{dressPlate(grp,female);body.gearPlate=grp;});
    else if(lathe&&Math.abs(lathe.scale.z-0.78)<0.005&&Math.abs(lathe.position.y-1.06)<0.01)once(grp,()=>{dressChain(grp,female);body.gearChain=grp;});
    else if(lathe&&Math.abs(lathe.scale.z-0.72)<0.005&&Math.abs(lathe.position.y-1.08)<0.01)once(grp,()=>{dressHide(grp,female);body.gearHide=grp;});
    else if(lathe&&Math.abs(lathe.scale.z-0.8)<0.005&&Math.abs(lathe.position.y-1.04)<0.01)once(grp,()=>dressRobe(grp,female));
    else if(lathe&&Math.abs(lathe.scale.z-1.06)<0.005&&Math.abs(lathe.position.y-1.52)<0.01)once(grp,()=>dressHelm(grp,female));
    else if(kids.some(m=>m.isMesh&&par(m).radius===0.223))once(grp,()=>dressSlayer(grp,female));
    else if(kids.some(m=>m.isMesh&&par(m).radius===0.18&&par(m).thetaLength<4))once(grp,()=>dressCoif(grp,female));
    else if(kids.some(m=>m.isMesh&&gtype(m)==='ConeGeometry'&&par(m).radius===0.18&&par(m).height===0.5))once(grp,()=>dressWizHat(grp));
  }
  for(const grp of g.children){
    if(!grp.isGroup||grp.userData.hdGear||grp.userData.thigh)continue;
    const lathe=grp.children.find(m=>m.isMesh&&gtype(m)==='LatheGeometry');
    if(lathe&&Math.abs(lathe.scale.z-0.9)<0.005&&Math.abs(lathe.position.y-0.5)<0.01)once(grp,()=>dressRobeSkirt(grp));
  }
  for(const ag of arms){const side=ag.position.x<0?-1:1,bone=side<0?LARM:RARM;
    for(const grp of ag.children){if(!grp.isGroup||grp.userData.hdGear)continue;
      if(grp.userData.gaunt)once(grp,()=>{dressPlateArm(grp,female,bone,side);skinGroup(body,grp,bone);});
      else if(grp.children.some(m=>m.isMesh&&par(m).radiusTop===0.06&&par(m).height===0.16)&&grp.children.some(m=>m.isMesh&&par(m).radius===0.06))once(grp,()=>{dressEmberGaunt(grp,female,bone,side);skinGroup(body,grp,bone);});}
    n+=dressWeapons(ag,side);}
  for(const lg of legs){const bone=lg.position.x<0?LLEG:RLEG;
    for(const grp of lg.children){if(!grp.isGroup||grp.userData.hdGear)continue;const kids=grp.children;
      if(kids.some(m=>m.isMesh&&par(m).radiusTop===0.098))once(grp,()=>{dressPlateLeg(grp,female,bone);skinGroup(body,grp,bone);});
      else if(kids.some(m=>m.isMesh&&par(m).radiusTop===0.1&&par(m).height===0.36))once(grp,()=>{dressHideLeg(grp,female,bone);skinGroup(body,grp,bone);});
      else if(kids.filter(m=>m.isMesh&&gtype(m)==='BoxGeometry'&&par(m).width===0.16&&par(m).height===0.052).length===3)once(grp,()=>{dressBoot(grp,bone);skinGroup(body,grp,bone);});
      else if(kids.some(m=>m.isMesh&&gtype(m)==='BoxGeometry'&&par(m).width===0.16&&par(m).height===0.1&&par(m).depth===0.28))once(grp,()=>{dressEmberBoot(grp,bone);skinGroup(body,grp,bone);});}}
  return n;
}
HD.dressGear=dressRig;

/* every body: new gear groups get dressed as they appear (the game attaches them after the rig
   is built), the HD hair follows the game's hair visibility (hidden under a helm), and the
   sleeves follow the armour shown (bare under a jerkin or mail) */
let _last=0,_n=0;
HD.tick=HD.tick||[];
HD.tick.push(function(now){
  if(now-_last<600)return;_last=now;
  for(const b of HD.bodies){
    if(!b.g.parent)continue;
    try{_n+=dressRig(b);}catch(e){}
    if(b.hairG&&b.hair)for(const m of b.hair)m.visible=b.hairG.visible;
    if(typeof pm!=='undefined'&&pm&&b.g===pm.g)continue;   /* the player's armour is read from the equipment in hd-body */
    try{K.setArmour(b.g,(b.gearHide&&b.gearHide.visible)?'hide':(b.gearChain&&b.gearChain.visible)?'chain':(b.gearPlate&&b.gearPlate.visible)?'plate':null);}catch(e){}
  }
});
let n0=0;for(const b of HD.bodies){try{n0+=dressRig(b);}catch(e){console.warn('[HD] gear',e);}}
console.log('[HD] gear pieces fitted:',n0);
/* shared with hd-lux.js */
HD.gearKit={steelTex,leatherTex,woodTex,remat,par,gtype,setGeo,sampled,ascending,G,Buf,footRings,armRings,REST,LARM,RARM,LLEG,RLEG};
})();
