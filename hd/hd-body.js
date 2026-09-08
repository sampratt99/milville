/* ============================================================================
   Milville HD — bodies.  Loaded after hd-chars.js.

   RS3 draws a player as one continuous skinned body: a couple of thousand
   triangles shaped with muscle, a sculpted face, painted skin and cloth. The
   game's humanoid is a stack of cylinders and spheres rotated by five groups
   (upper body, two arms, two legs). This file keeps that rig — the game
   animates and costumes it by reference — and hangs a skinned body on it:

     * six Bones, one per rig group, so the game's own rotations drive the
       skin; bind matrices come from the rig's designed rest pose, so nothing
       depends on the pose at the moment the body is built
     * tubes of shaped cross-sections (pecs, lats, deltoids, biceps, quads,
       calves; a bust and hips for women) merged into skinned meshes: skin,
       shirt, trousers, shoes — one draw call each, fewer than the old parts
     * a sculpted head under the upper body: brow, sockets, cheekbones, jaw,
       chin, a nose, lips, eyeballs with an iris; brows, lashes and lip colour
       painted on the head's own skin texture
     * the game's clothing styles (sleeveless, long sleeve, tunic, shorts,
       skirt) are honoured by re-cutting the tubes; the game's colour
       recolouring still works through the cos tags; the game's own parts get
       empty geometry so nothing it does to them shows

   Gameplay is untouched: nothing here reads or writes game state.
   ========================================================================== */
(function(){
'use strict';
try{performance.mark('hd:hd-body');}catch(e){}
const HD=window.HD;
if(!HD||!HD.ready)return;
if(typeof makeHumanoid!=='function')return;

try{performance.mark('hd:hd-body/textures');}catch(e){}
/* ----------------------------- textures -------------------------------- */
const texCache=new Map();
function noiseCanvas(S,fn){const c=document.createElement('canvas');c.width=c.height=S;const g=c.getContext('2d');const img=g.createImageData(S,S);const d=img.data;for(let y=0;y<S;y++)for(let x=0;x<S;x++){const i=(y*S+x)*4;const v=fn(x/S,y/S);d[i]=d[i+1]=d[i+2]=Math.max(0,Math.min(255,v*255))|0;d[i+3]=255;}g.putImageData(img,0,0);return c;}
function h2(x,y){const s=Math.sin(x*127.1+y*311.7)*43758.5453;return s-Math.floor(s);}
function vn(x,y){const xi=Math.floor(x),yi=Math.floor(y),fx=x-xi,fy=y-yi,u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy);return (h2(xi,yi)*(1-u)+h2(xi+1,yi)*u)*(1-v)+(h2(xi,yi+1)*(1-u)+h2(xi+1,yi+1)*u)*v;}
function fbm(x,y,o){let a=0,w=0.5,s=1;for(let i=0;i<o;i++){a+=vn(x*s,y*s)*w;w*=0.5;s*=2;}return a/(1-Math.pow(0.5,o));}
function tex(key,make){if(texCache.has(key))return texCache.get(key);const c=make();const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=4;texCache.set(key,t);return t;}
/* skin: a light grain and pores; the colour comes from the material */
const skinTex=()=>tex('skin',()=>noiseCanvas(256,(u,v)=>0.86+0.16*fbm(u*6,v*6,3)+0.05*(vn(u*60,v*60)-0.5)));
/* knit: the vertical ribs of RS3's jumper */
/* painted cloth: knit ribs with cable shading; twill with soft folds; leather with creases and
   stitching. Value only; the material colour tints them. */
const _paint=(key,S,fn)=>tex(key,()=>{const c=document.createElement('canvas');c.width=c.height=S;const g=c.getContext('2d');fn(g,S);return c;});
const _grey=(v,a)=>'rgba('+(v*255|0)+','+(v*255|0)+','+(v*255|0)+','+(a===undefined?1:a)+')';
const _seed=seed=>{let s=seed|0;return()=>{s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};};
const knitTex=()=>_paint('knit',256,(g,S)=>{
  g.drawImage(noiseCanvas(256,(u,v)=>{const rib=0.5+0.5*Math.sin(u*Math.PI*2*36);const row=0.5+0.5*Math.sin(v*Math.PI*2*72+Math.sin(u*Math.PI*2*36)*1.5);return 0.74+0.16*rib*0.7+0.07*row+0.06*(fbm(u*8,v*8,3)-0.5);}),0,0);
  /* a cable down the front and soft shading across the chest */
  const R=_seed(5);for(let i=0;i<6;i++){const x=R()*S,w=14+R()*26;const gr=g.createLinearGradient(x-w,0,x+w,0);gr.addColorStop(0,_grey(0.5,0));gr.addColorStop(0.5,_grey(R()<0.5?0.5:1,0.16));gr.addColorStop(1,_grey(0.5,0));g.fillStyle=gr;g.fillRect(x-w,0,w*2,S);}
  const gr=g.createLinearGradient(0,S*0.9,0,S);gr.addColorStop(0,_grey(0,0));gr.addColorStop(1,_grey(0,0.25));g.fillStyle=gr;g.fillRect(0,0,S,S);
});
const clothTex=()=>_paint('cloth',256,(g,S)=>{
  g.drawImage(noiseCanvas(256,(u,v)=>{const tw=0.5+0.5*Math.sin((u+v)*Math.PI*2*40);return 0.8+0.1*tw+0.10*(fbm(u*5,v*5,3)-0.5);}),0,0);
  const R=_seed(9);for(let i=0;i<10;i++){const x=R()*S,w=10+R()*22;const gr=g.createLinearGradient(x-w,0,x+w,0);gr.addColorStop(0,_grey(0.5,0));gr.addColorStop(0.5,_grey(R()<0.5?0.55:1,0.2));gr.addColorStop(1,_grey(0.5,0));g.fillStyle=gr;g.fillRect(x-w,0,w*2,S);}
  const gr=g.createLinearGradient(0,S*0.88,0,S);gr.addColorStop(0,_grey(0,0));gr.addColorStop(1,_grey(0,0.3));g.fillStyle=gr;g.fillRect(0,0,S,S);
});
const leatherTex=()=>_paint('leather',128,(g,S)=>{
  g.drawImage(noiseCanvas(128,(u,v)=>0.82+0.2*(fbm(u*9,v*9,3)-0.5)+0.06*(vn(u*40,v*40)-0.5)),0,0);
  const R=_seed(3);for(let i=0;i<5;i++){const y=R()*S;g.strokeStyle=_grey(0.4,0.25);g.lineWidth=1+R()*1.5;g.beginPath();g.moveTo(0,y);for(let x=0;x<=S;x+=12)g.lineTo(x,y+(R()-0.5)*4);g.stroke();}
  g.setLineDash([3,2]);g.lineWidth=1;g.strokeStyle=_grey(0.25,0.7);g.beginPath();g.moveTo(0,S*0.1);g.lineTo(S,S*0.1);g.moveTo(0,S*0.9);g.lineTo(S,S*0.9);g.stroke();g.setLineDash([]);
});
/* the head's skin, painted: brows, socket and lid shadow, the mouth line, nostrils, cheeks,
   a shadow under the jaw, stubble on some men. The head tube's UV: u = angle (front of the
   face at u 0.25), v = height, chin (y -0.15) 0 .. crown (y +0.18) 1. */
const HV=y=>(y+0.15)/0.33;
function faceTex(hairHex,seed,female){
  const key='face:'+hairHex+':'+(seed%5)+':'+(female?1:0);
  return tex(key,()=>{
    const S=512,c=document.createElement('canvas');c.width=c.height=S;const g=c.getContext('2d');
    const base=noiseCanvas(256,(u,v)=>0.9+0.12*fbm(u*5,v*5,3));g.drawImage(base,0,0,S,S);
    const hair='#'+new THREE.Color(hairHex).getHexString();
    const Y=v=>(1-v)*S,X=u=>u*S,YY=y=>Y(HV(y));
    const rad=(x,y,r,rgba)=>{const gr=g.createRadialGradient(x,y,0,x,y,r);gr.addColorStop(0,rgba(1));gr.addColorStop(1,rgba(0));g.fillStyle=gr;g.fillRect(0,0,S,S);};
    /* sockets: a soft shadow round the eyes, deeper under the brow */
    for(const sx of [-1,1]){rad(X(0.25+sx*0.057),YY(0.032),S*0.050,a=>'rgba(95,55,45,'+(0.28*a)+')');rad(X(0.25+sx*0.057),YY(0.050),S*0.038,a=>'rgba(70,40,35,'+(0.22*a)+')');}
    /* brows: an arch just above the socket, thicker on men */
    g.strokeStyle=hair;g.lineCap='round';g.lineWidth=female?S*0.007:S*0.012;
    for(const sx of [-1,1]){g.beginPath();g.moveTo(X(0.25+sx*0.024),YY(0.064));g.quadraticCurveTo(X(0.25+sx*0.062),YY(0.080+(seed%3)*0.003),X(0.25+sx*0.105),YY(0.066));g.stroke();}
    /* the lid crease over the almond and the shadow under it */
    g.strokeStyle='rgba(70,40,32,0.22)';g.lineWidth=S*0.003;
    for(const sx of [-1,1]){g.beginPath();g.moveTo(X(0.25+sx*0.03),YY(0.050));g.quadraticCurveTo(X(0.25+sx*0.058),YY(0.061),X(0.25+sx*0.086),YY(0.048));g.stroke();}
    for(const sx of [-1,1])rad(X(0.25+sx*0.057),YY(0.016),S*0.03,a=>'rgba(80,45,35,'+(0.18*a)+')');
    /* the planes of a man's face: shadow under the cheekbone toward the jaw */
    if(!female)for(const sx of [-1,1]){const gr=g.createLinearGradient(X(0.25+sx*0.09),YY(-0.02),X(0.25+sx*0.09),YY(-0.09));gr.addColorStop(0,'rgba(80,45,35,0)');gr.addColorStop(0.5,'rgba(80,45,35,0.16)');gr.addColorStop(1,'rgba(80,45,35,0)');g.fillStyle=gr;g.fillRect(X(0.25+sx*0.06)-(sx<0?S*0.06:0),YY(-0.02),S*0.06,YY(-0.09)-YY(-0.02));}
    /* the mouth line and the shadow under the lower lip */
    g.strokeStyle='rgba(90,40,40,0.75)';g.lineWidth=S*0.0035;g.beginPath();g.moveTo(X(0.205),YY(-0.076));g.quadraticCurveTo(X(0.25),YY(-0.079),X(0.295),YY(-0.076));g.stroke();
    rad(X(0.25),YY(-0.100),S*0.035,a=>'rgba(80,40,35,'+(0.18*a)+')');
    /* cheeks */
    for(const sx of [-1,1])rad(X(0.25+sx*0.08),YY(-0.03),S*0.06,a=>'rgba(220,110,100,'+((female?0.22:0.10)*a)+')');
    /* temples and under the cheekbones: a little structure */
    for(const sx of [-1,1]){rad(X(0.25+sx*0.13),YY(0.06),S*0.05,a=>'rgba(90,50,40,'+(0.10*a)+')');rad(X(0.25+sx*0.105),YY(-0.055),S*0.05,a=>'rgba(90,50,40,'+(0.12*a)+')');}
    /* stubble on a third of the men */
    if(!female&&seed%3===0){g.fillStyle='rgba(50,35,30,0.5)';for(let i=0;i<1400;i++){const u=0.25+(Math.sin(i*12.9898)*43758.5453%1)*0.26-0.13;const v=HV(-0.15+(Math.sin(i*78.233)*43758.5453%1)*0.11);const d=Math.abs(u-0.25);if(d<0.04&&v>HV(-0.09))continue;g.fillRect(X(u),Y(v),2,2);}}
    /* a shadow under the jaw and at the hairline */
    const gj=g.createLinearGradient(0,YY(-0.115),0,YY(-0.15));gj.addColorStop(0,'rgba(60,30,25,0)');gj.addColorStop(1,'rgba(60,30,25,0.35)');g.fillStyle=gj;g.fillRect(0,YY(-0.115),S,S);
    const gh=g.createLinearGradient(0,YY(0.095),0,YY(0.13));gh.addColorStop(0,'rgba(60,40,30,0)');gh.addColorStop(1,'rgba(60,40,30,0.25)');g.fillStyle=gh;g.fillRect(0,0,S,YY(0.095));
    return c;
  });
}
/* hair: painted strands running down the cap, a sheen band across the top */
function hairTex(hex){
  return tex('hair:'+hex,()=>{const S=256,c=document.createElement('canvas');c.width=c.height=S;const g=c.getContext('2d');
    const hsl={};new THREE.Color(hex).getHSL(hsl);
    const css=(l,a)=>'hsla('+(hsl.h*360).toFixed(1)+','+(Math.min(1,hsl.s*1.1)*100).toFixed(1)+'%,'+(Math.max(0.04,Math.min(0.95,l))*100).toFixed(1)+'%,'+a+')';
    g.fillStyle=css(hsl.l*0.9,1);g.fillRect(0,0,S,S);
    let sd=(hex|1)>>>0;const R=()=>{sd=sd+0x6D2B79F5|0;let t=Math.imul(sd^sd>>>15,1|sd);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
    for(let i=0;i<1100;i++){const x=R()*S,w=0.5+R()*1.8,l=hsl.l*(0.55+R()*0.95)+0.02;g.strokeStyle=css(l,0.6);g.lineWidth=w;const wob=(R()-0.5)*14;g.beginPath();g.moveTo(x,-4);g.bezierCurveTo(x+wob,S*0.33,x-wob,S*0.66,x+(R()-0.5)*8,S+4);g.stroke();}
    const gr=g.createLinearGradient(0,0,0,S);gr.addColorStop(0,'rgba(255,245,230,0)');gr.addColorStop(0.3,'rgba(255,245,230,0.16)');gr.addColorStop(0.45,'rgba(255,255,255,0)');gr.addColorStop(1,'rgba(0,0,0,0.25)');g.fillStyle=gr;g.fillRect(0,0,S,S);
    return c;});
}
/* the whole eye as one painted almond: sclera, iris, pupil, glint, the lash line heavy on top */
function eyeAlmondTex(hex,female){
  return tex('almond:'+hex+(female?'f':'m'),()=>{const W=128,H=72,c=document.createElement('canvas');c.width=W;c.height=H;const g=c.getContext('2d');
    g.clearRect(0,0,W,H);
    const almond=(k)=>{g.beginPath();g.moveTo(W*0.06,H*0.52);g.quadraticCurveTo(W*0.5,H*(0.52-0.62*k),W*0.94,H*0.52);g.quadraticCurveTo(W*0.5,H*(0.52+0.5*k),W*0.06,H*0.52);g.closePath();};
    almond(1);g.fillStyle='#ece7de';g.fill();
    /* the sclera shades under the upper lid */
    const sh=g.createLinearGradient(0,H*0.1,0,H*0.6);sh.addColorStop(0,'rgba(70,40,30,0.55)');sh.addColorStop(1,'rgba(70,40,30,0)');almond(1);g.fillStyle=sh;g.fill();
    g.save();almond(1);g.clip();
    const col='#'+new THREE.Color(hex).getHexString();const cx=W*0.5,cy=H*0.55,r=H*0.30;
    const ir=g.createRadialGradient(cx,cy,r*0.2,cx,cy,r);ir.addColorStop(0,col);ir.addColorStop(0.85,col);ir.addColorStop(1,'#1a1410');g.fillStyle=ir;g.beginPath();g.arc(cx,cy,r,0,Math.PI*2);g.fill();
    g.fillStyle='#120c0a';g.beginPath();g.arc(cx,cy,r*0.42,0,Math.PI*2);g.fill();
    g.fillStyle='rgba(255,255,255,0.9)';g.beginPath();g.arc(cx-r*0.35,cy-r*0.4,r*0.2,0,Math.PI*2);g.fill();
    g.restore();
    /* the lash line: thick along the upper lid, thin below */
    almond(1);g.strokeStyle='#2a1a14';g.lineWidth=female?4.5:3.5;g.stroke();
    g.beginPath();g.moveTo(W*0.06,H*0.52);g.quadraticCurveTo(W*0.5,H*(0.52-0.62),W*0.94,H*0.52);g.lineWidth=female?7:5;g.stroke();
    return c;});
}
/* iris: a coloured ring, a dark pupil, a highlight */
function eyeTex(hex){
  return tex('eye:'+hex,()=>{const S=64,c=document.createElement('canvas');c.width=c.height=S;const g=c.getContext('2d');
    g.fillStyle='#f4f1ec';g.fillRect(0,0,S,S);
    const col='#'+new THREE.Color(hex).getHexString();
    g.fillStyle=col;g.beginPath();g.arc(S/2,S/2,S*0.3,0,Math.PI*2);g.fill();
    g.strokeStyle='rgba(0,0,0,0.5)';g.lineWidth=2;g.stroke();
    g.fillStyle='#120c0a';g.beginPath();g.arc(S/2,S/2,S*0.13,0,Math.PI*2);g.fill();
    g.fillStyle='rgba(255,255,255,0.85)';g.beginPath();g.arc(S*0.42,S*0.4,S*0.06,0,Math.PI*2);g.fill();
    return c;});
}

try{performance.mark('hd:hd-body/geometry');}catch(e){}
/* ----------------------------- geometry -------------------------------- */
/* A skinned tube: rings of shaped cross-sections. Each ring: {y, rx, rz, cx, cz, f(theta),
   b:[bone,w,bone2,w2]}. theta 0 is +x (the body's right), PI/2 is +z (the front). `frame`
   maps ring space to rig-root space (the rest pose of the bone the tube hangs from). */
function Buf(){this.pos=[];this.uv=[];this.si=[];this.sw=[];this.idx=[];}
const _v=new THREE.Vector3();
function bump(t,t0,w){let d=t-t0;d=Math.atan2(Math.sin(d),Math.cos(d));return Math.exp(-(d*d)/(w*w));}
function tube(B,rings,segs,frame,capA,capB){
  const base=B.pos.length/3;
  let y0=Infinity,y1=-Infinity;for(const r of rings){if(r.y<y0)y0=r.y;if(r.y>y1)y1=r.y;}const ys=(y1-y0)||1;
  for(let j=0;j<rings.length;j++){const r=rings[j];
    for(let i=0;i<=segs;i++){const th=i/segs*Math.PI*2;const c=Math.cos(th),s=Math.sin(th);
      const m=r.f?r.f(th):1;
      _v.set((r.cx||0)+c*r.rx*m,r.y,(r.cz||0)+s*r.rz*m);if(frame)_v.applyMatrix4(frame);
      B.pos.push(_v.x,_v.y,_v.z);B.uv.push(i/segs,(r.y-y0)/ys);
      const b=r.b;B.si.push(b[0],b[2]!==undefined?b[2]:b[0],0,0);B.sw.push(b[1],b[3]||0,0,0);
    }}
  const row=segs+1;
  for(let j=0;j<rings.length-1;j++)for(let i=0;i<segs;i++){const a=base+j*row+i,b=a+1,c=a+row,d=c+1;B.idx.push(a,c,b,b,c,d);}
  if(capA){const r=rings[0];const ci=B.pos.length/3;_v.set(r.cx||0,r.y,r.cz||0);if(frame)_v.applyMatrix4(frame);B.pos.push(_v.x,_v.y,_v.z);B.uv.push(0.5,0);B.si.push(r.b[0],r.b[2]!==undefined?r.b[2]:r.b[0],0,0);B.sw.push(r.b[1],r.b[3]||0,0,0);for(let i=0;i<segs;i++)B.idx.push(ci,base+i,base+i+1);}
  if(capB){const r=rings[rings.length-1];const ci=B.pos.length/3;_v.set(r.cx||0,r.y,r.cz||0);if(frame)_v.applyMatrix4(frame);B.pos.push(_v.x,_v.y,_v.z);B.uv.push(0.5,1);B.si.push(r.b[0],r.b[2]!==undefined?r.b[2]:r.b[0],0,0);B.sw.push(r.b[1],r.b[3]||0,0,0);const last=base+(rings.length-1)*row;for(let i=0;i<segs;i++)B.idx.push(ci,last+i+1,last+i);}
}
function toGeo(B){
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(B.pos,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(B.uv,2));
  g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(B.si,4));
  g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(B.sw,4));
  g.setIndex(B.idx);g.computeVertexNormals();return g;
}
/* bones: 0 root, 1 spine (upper), 2 left arm, 3 right arm, 4 left leg, 5 right leg — their
   rest transforms in rig-root space, exactly as makeHumanoid places the groups */
const REST=[
  new THREE.Matrix4(),
  new THREE.Matrix4().makeTranslation(0,0.78,0),
  new THREE.Matrix4().makeTranslation(-0.26,1.3,0).multiply(new THREE.Matrix4().makeRotationZ(0.09)),
  new THREE.Matrix4().makeTranslation(0.26,1.3,0).multiply(new THREE.Matrix4().makeRotationZ(-0.09)),
  new THREE.Matrix4().makeTranslation(-0.1,0.78,0),
  new THREE.Matrix4().makeTranslation(0.1,0.78,0)
];
const ROOT=0,SPINE=1,LARM=2,RARM=3,LLEG=4,RLEG=5,LKNEE=6,RKNEE=7,LELB=8,RELB=9;
const KNEE_Y=-0.36,ELB_Y=-0.30;
/* knees hang from the leg bones, elbows from the arm bones */
REST[LKNEE]=new THREE.Matrix4().copy(REST[LLEG]).multiply(new THREE.Matrix4().makeTranslation(0,KNEE_Y,0));
REST[RKNEE]=new THREE.Matrix4().copy(REST[RLEG]).multiply(new THREE.Matrix4().makeTranslation(0,KNEE_Y,0));
REST[LELB]=new THREE.Matrix4().copy(REST[LARM]).multiply(new THREE.Matrix4().makeTranslation(0,ELB_Y,0));
REST[RELB]=new THREE.Matrix4().copy(REST[RARM]).multiply(new THREE.Matrix4().makeTranslation(0,ELB_Y,0));
const kneeOf=b=>b+2,elbowOf=b=>b+6;

/* the body's rings: the torso in root space, arms and legs in their bones' frames */
function torsoRings(fem){
  const pec=(k)=>th=>1+k*(bump(th,Math.PI/2-0.5,0.5)+bump(th,Math.PI/2+0.5,0.5));
  const lat=(k)=>th=>1+k*(bump(th,3*Math.PI/2-0.7,0.5)+bump(th,3*Math.PI/2+0.7,0.5));
  const both=(a,b)=>th=>a(th)*b(th);
  const abs=k=>th=>1+k*Math.max(0,Math.sin(th))*(0.6+0.4*Math.cos(th*6));
  if(fem)return [
    {y:0.62,rx:0.150,rz:0.115,b:[ROOT,1]},{y:0.72,rx:0.168,rz:0.128,b:[ROOT,1]},{y:0.80,rx:0.160,rz:0.122,b:[ROOT,0.7,SPINE,0.3]},
    {y:0.90,rx:0.114,rz:0.102,b:[SPINE,1]},{y:1.00,rx:0.142,rz:0.117,b:[SPINE,1],f:abs(0.02)},
    {y:1.09,rx:0.165,rz:0.128,b:[SPINE,1],f:pec(0.16)},{y:1.16,rx:0.172,rz:0.128,b:[SPINE,1],f:pec(0.10)},
    {y:1.24,rx:0.180,rz:0.120,b:[SPINE,1]},{y:1.31,rx:0.160,rz:0.105,b:[SPINE,1]},{y:1.36,rx:0.085,rz:0.078,b:[SPINE,1]},
    {y:1.44,rx:0.058,rz:0.058,b:[SPINE,1]},{y:1.48,rx:0.064,rz:0.064,b:[SPINE,1]}];
  return [
    {y:0.62,rx:0.142,rz:0.112,b:[ROOT,1]},{y:0.72,rx:0.156,rz:0.122,b:[ROOT,1]},{y:0.80,rx:0.152,rz:0.120,b:[ROOT,0.7,SPINE,0.3]},
    {y:0.90,rx:0.128,rz:0.108,b:[SPINE,1],f:abs(0.03)},{y:1.00,rx:0.156,rz:0.124,b:[SPINE,1],f:both(abs(0.03),lat(0.03))},
    {y:1.10,rx:0.184,rz:0.135,b:[SPINE,1],f:both(pec(0.09),lat(0.04))},{y:1.18,rx:0.194,rz:0.135,b:[SPINE,1],f:pec(0.06)},
    {y:1.26,rx:0.212,rz:0.130,b:[SPINE,1]},{y:1.32,rx:0.190,rz:0.116,b:[SPINE,1],f:th=>1+0.05*bump(th,3*Math.PI/2,0.9)},
    {y:1.37,rx:0.092,rz:0.084,b:[SPINE,1]},{y:1.44,rx:0.066,rz:0.066,b:[SPINE,1]},{y:1.48,rx:0.072,rz:0.072,b:[SPINE,1]}];
}
function armRings(bone,side,fem){
  const k=fem?0.88:1,E=elbowOf(bone);
  /* the arm hangs down its bone's -y; the front of the arm is +z, the inside faces the body */
  const bic=th=>1+0.07*bump(th,Math.PI/2,0.7);
  return [
    {y:0.02,rx:0.074*k,rz:0.070*k,b:[SPINE,0.45,bone,0.55]},{y:-0.07,rx:0.069*k,rz:0.066*k,b:[bone,1]},
    {y:-0.16,rx:0.060*k,rz:0.060*k,b:[bone,1],f:bic},{y:-0.26,rx:0.050*k,rz:0.052*k,b:[bone,0.6,E,0.4]},
    {y:-0.33,rx:0.052*k,rz:0.052*k,b:[E,1],f:bic},{y:-0.45,rx:0.042*k,rz:0.040*k,b:[E,1]},
    {y:-0.53,rx:0.034*k,rz:0.030*k,b:[E,1]},
    /* the hand: flat, a little wider than the wrist, fingers tapering */
    {y:-0.56,rx:0.040*k,rz:0.022*k,b:[E,1]},{y:-0.63,rx:0.042*k,rz:0.019*k,b:[E,1]},{y:-0.68,rx:0.030*k,rz:0.014*k,b:[E,1]}];
}
/* the hand in the arm's frame: a flat palm from the wrist, four fingers hanging on, a thumb
   angled in toward the body; the fingers curl a little. The mitt rings in armRings stay for
   the gauntlets, which cover all of this. */
function handBuf(B,bone0,side,fem){
  const k=fem?0.88:1,fr=REST[bone0],bone=elbowOf(bone0);
  tube(B,[{y:-0.53,rx:0.034*k,rz:0.030*k,b:[bone,1]},{y:-0.565,rx:0.040*k,rz:0.024*k,b:[bone,1]},{y:-0.605,rx:0.043*k,rz:0.021*k,b:[bone,1]},{y:-0.63,rx:0.041*k,rz:0.020*k,b:[bone,1]}],12,fr,false,true);
  const fx=[-0.03,-0.01,0.01,0.03];const len=[0.062,0.072,0.068,0.056];
  for(let i=0;i<4;i++){const x=fx[i]*k,L=len[i]*k,curl=-side*0.006;
    tube(B,[{y:-0.615,rx:0.0092*k,rz:0.0105*k,cx:x,cz:0.003,b:[bone,1]},{y:-0.615-L*0.5,rx:0.0088*k,rz:0.0100*k,cx:x+curl*0.5,cz:0.005,b:[bone,1]},{y:-0.615-L,rx:0.0075*k,rz:0.0085*k,cx:x+curl,cz:0.007,b:[bone,1]}],8,fr,false,true);}
  /* the thumb: from the palm's inner edge, pointing down and in */
  const tf=new THREE.Matrix4().copy(fr).multiply(new THREE.Matrix4().makeTranslation(-side*0.036*k,-0.565,0.012)).multiply(new THREE.Matrix4().makeRotationZ(side*0.55));
  tube(B,[{y:0,rx:0.011*k,rz:0.011*k,b:[bone,1]},{y:-0.028,rx:0.0095*k,rz:0.0095*k,b:[bone,1]},{y:-0.052,rx:0.0075*k,rz:0.008*k,b:[bone,1]}],8,tf,false,true);
}
function legRings(bone,fem){
  const k=fem?0.96:1,K=kneeOf(bone);
  const quad=th=>1+0.06*bump(th,Math.PI/2,0.8);
  const calf=th=>1+0.10*bump(th,3*Math.PI/2,0.7);
  return [
    {y:0.02,rx:0.092*k,rz:0.096*k,b:[ROOT,0.35,bone,0.65]},{y:-0.10,rx:0.088*k,rz:0.092*k,b:[bone,1],f:quad},
    {y:-0.24,rx:0.076*k,rz:0.080*k,b:[bone,1],f:quad},{y:-0.36,rx:0.060*k,rz:0.064*k,b:[bone,0.5,K,0.5]},
    {y:-0.44,rx:0.060*k,rz:0.066*k,b:[K,1],f:calf},{y:-0.56,rx:0.048*k,rz:0.050*k,b:[K,1],f:calf},
    {y:-0.66,rx:0.038*k,rz:0.040*k,b:[K,1]}];
}
function footRings(bone0){const bone=kneeOf(bone0);
  return [
    {y:-0.66,rx:0.042,rz:0.046,b:[bone,1]},{y:-0.71,rx:0.048,rz:0.070,cz:0.03,b:[bone,1]},
    {y:-0.76,rx:0.054,rz:0.105,cz:0.055,b:[bone,1]},{y:-0.78,rx:0.050,rz:0.100,cz:0.06,b:[bone,1]}];
}
/* the head: horizontal rings from the chin to the crown, shaped per angle. In upper-body space
   (the head centre sits at y 0.72 there). theta PI/2 is the face. */
const HEAD_Y=0.72,CROWN=0.18;
function headRings(fem){
  const F=Math.PI/2,BK=3*Math.PI/2;
  const k=fem?0.95:1;
  const R=(y,rx,rz,f,cz)=>{const q=(fem&&y<-0.04)?1-0.5*Math.min(1,(-0.04-y)/0.11):1;return {y:HEAD_Y+y,rx:rx*k*0.88*(1-0.12*(1-q)),rz:rz*k*(1-0.06*(1-q)),cz:cz||0,f,b:[SPINE,1]};};
  const cheek=a=>th=>1+a*(bump(th,F-0.95,0.32)+bump(th,F+0.95,0.32));
  const socket=a=>th=>1-a*(bump(th,F-0.36,0.3)+bump(th,F+0.36,0.3));
  const brow=a=>th=>1+a*bump(th,F,0.9);
  const jaw=a=>th=>1+a*bump(th,F,0.7);
  const jawAngle=a=>th=>1+a*(bump(th,F-1.25,0.35)+bump(th,F+1.25,0.35));
  const mul=(...fs)=>th=>{let m=1;for(const f of fs)m*=f(th);return m;};
  const J=fem?0.7:1;
  return [
    R(-0.150,0.026,0.030,null,0.026),
    R(-0.138,fem?0.050:0.060,0.054,jaw(0.18*J),0.022),  /* chin */
    R(-0.118,0.084,0.080,mul(jaw(0.12*J),jawAngle(0.08*J)),0.014),
    R(-0.095,0.101,0.096,mul(jaw(0.05*J),jawAngle(0.07*J)),0.007),
    R(-0.075,0.110,0.106,jawAngle(0.04*J),0.003),      /* mouth */
    R(-0.050,0.119,0.114,mul(cheek(fem?0.04:0.02),jawAngle(0.03*J)),0.0),
    R(-0.025,0.128,0.121,cheek(fem?0.07:0.035),0.0),   /* cheekbones */
    R( 0.000,0.132,0.125,mul(cheek(fem?0.05:0.03),socket(0.07)),0.0),
    R( 0.032,0.133,0.127,socket(0.11),0.0),            /* eyes, set deep */
    R( 0.058,0.134,0.128,mul(socket(0.04),brow(fem?0.04:0.07)),0.0),  /* brow ridge */
    R( 0.082,0.133,0.129,brow(0.035),0.0),
    R( 0.120,0.127,0.126,null,-0.004),
    R( 0.145,0.117,0.116,null,-0.010),
    R( 0.165,0.092,0.090,null,-0.015),
    R( 0.180,0.040,0.040,null,-0.020)];
}
/* the head's surface at height y (upper space) and angle th, for hair to sit on */
function headPoint(rings,y,th,out){
  let j=0;while(j<rings.length-2&&rings[j+1].y<y)j++;
  const a=rings[j],b=rings[j+1];const t=Math.max(0,Math.min(1,(y-a.y)/((b.y-a.y)||1)));
  const c=Math.cos(th),sn=Math.sin(th);
  const ma=a.f?a.f(th):1,mb=b.f?b.f(th):1;
  const rx=(a.rx*ma)*(1-t)+(b.rx*mb)*t,rz=(a.rz*ma)*(1-t)+(b.rz*mb)*t;
  const cx=(a.cx||0)*(1-t)+(b.cx||0)*t,cz=(a.cz||0)*(1-t)+(b.cz||0)*t;
  out.set(cx+c*rx,y,cz+sn*rz);return out;
}

try{performance.mark('hd:hd-body/hair');}catch(e){}
/* ------------------------------- hair ----------------------------------- */
/* A cap grown on the head's own surface: for every angle a strip runs from the hairline (or,
   for long styles, from below it) up to the crown. hairline(th) is the lowest point of hair
   on the skull; bottom(th) is where the strip starts; below the hairline the strip hangs
   straight down and flares out. The game's hair meshes get empty geometry. */
const HAIR_STYLES={
  short:{},
  bald:{none:true},
  long:{fringe:true,hang:-0.22,flare:0.22},
  pony:{tail:true,pull:1},
  bun:{bun:true,pull:1},
  bob:{fringe:true,hang:-0.115,flare:0.25},
  spiky:{spikes:true},
  mohawk:{strip:true},
  /* HD-only cuts: the game's list is extended so the shop and the creator offer them */
  wavy:{fringe:true,hang:-0.24,flare:0.3,wave:1},
  longback:{hang:-0.24,flare:0.35,pull:1,noFringe:true},   /* long, swept back off the face (statues, some NPCs) */
  braid:{pull:1,braid:true},
  curly:{curly:true},
  crop:{crop:true}
};
if(typeof COS_HAIRSTYLES!=='undefined')for(const k of ['wavy','braid','curly','crop'])if(COS_HAIRSTYLES.indexOf(k)<0)COS_HAIRSTYLES.push(k);
function hairGeometry(rings,style,seed,tight){
  const F=Math.PI/2,BK=3*Math.PI/2;
  const st=HAIR_STYLES[style]||HAIR_STYLES.short;
  const front=st.fringe?0.076:0.096;
  let hairline=th=>0.028+(front-0.028)*bump(th,F,0.8)-0.07*bump(th,BK,0.75)+0.006*(vn(th*4+seed*0.1,0.5)-0.5)*bump(th,F,1.2);
  if(st.strip)hairline=th=>0.165-0.145*(bump(th,F,0.28)+bump(th,BK,0.28));
  const bottom=th=>{const h=hairline(th);if(tight||st.hang===undefined)return h;const face=bump(th,F,1.05);return h*face+st.hang*(1-face);};
  const segs=36,rows=14,top=CROWN+(tight?0.008:0.022);
  const pos=[],uv=[],idx=[];const v=new THREE.Vector3();
  for(let i=0;i<=segs;i++){const th=i/segs*Math.PI*2;const b=bottom(th),h=hairline(th);
    for(let j=0;j<=rows;j++){const t=j/rows;const y=b+(top-b)*t;
      let x,z;
      if(y<h){headPoint(rings,HEAD_Y+h,th,v);const dx=v.x,dz=v.z;const L=Math.hypot(dx,dz)||1;const out=0.014+(st.flare||0)*(h-y);x=dx+dx/L*out;z=dz+dz/L*out;
        if(t===0){x*=0.985;z*=0.985;}}
      else{headPoint(rings,HEAD_Y+Math.min(y,CROWN-0.001),th,v);const L=Math.hypot(v.x,v.z)||1;const fl=tight?(st.pull?0.013:0.005):(0.019+0.010*(vn(th*2.2+seed,y*20)-0.5)+0.006*Math.max(0,1-Math.abs(y-h)/0.03));const rise=Math.max(0,y-(CROWN-0.001));x=v.x+v.x/L*fl;z=v.z+v.z/L*fl;
        if(rise>0){const q=Math.sqrt(Math.max(0,1-Math.pow(rise/(tight?0.009:0.024),2)));x*=q;z*=q;}}
      pos.push(x,HEAD_Y+y,z);uv.push(i/segs*3,t);
    }}
  const row=rows+1;
  for(let i=0;i<segs;i++)for(let j=0;j<rows;j++){const a=i*row+j,b=a+row,c=a+1,d=b+1;idx.push(a,c,b,c,d,b);}
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  const cols=new Float32Array(pos.length);cols.fill(0.72);g.setAttribute('color',new THREE.BufferAttribute(cols,3));
  g.setIndex(idx);g.computeVertexNormals();
  return g;
}
/* ---- layered locks, the way RS3 models hair: a tight scalp under it all, then clumps of hair
   (flattened, tapered strips) rooted on the skull. Each flows over the surface from its root,
   lifting away toward its tip so the rows read as layers: a crown whorl, a middle row, a lower
   row on the sides and back, and a fringe swept to one side. Long styles let the back and side
   locks leave the head and hang. Vertex colour darkens the roots and lightens the tips. ---- */
function lockStrip(L,pts,widths,thick,shade){
  const base=L.pos.length/3,n=pts.length,S=6;
  const tan=new THREE.Vector3(),nor=new THREE.Vector3(),bin=new THREE.Vector3(),q=new THREE.Vector3();
  for(let i=0;i<n;i++){const p=pts[i];
    if(i<n-1)tan.subVectors(pts[i+1],p);else tan.subVectors(p,pts[i-1]);if(tan.lengthSq()<1e-9)tan.set(0,-1,0);tan.normalize();
    nor.set(p.x,(p.y-HEAD_Y-0.03)*0.5,p.z+0.01);nor.addScaledVector(tan,-nor.dot(tan));if(nor.lengthSq()<1e-6)nor.set(0,1,0);nor.normalize();
    bin.crossVectors(tan,nor).normalize();
    const w=widths[i],t=thick*(i===n-1?0.25:1);
    for(let s=0;s<=S;s++){const a=s/S*Math.PI*2;q.copy(p).addScaledVector(bin,Math.cos(a)*w).addScaledVector(nor,Math.sin(a)*t);L.pos.push(q.x,q.y,q.z);L.uv.push(s/S,i/(n-1)*0.8);L.col.push(shade[i],shade[i],shade[i]);}
  }
  const row=S+1;
  for(let i=0;i<n-1;i++)for(let s=0;s<S;s++){const a=base+i*row+s,b=a+1,c=a+row,d=c+1;L.idx.push(a,c,b,b,c,d);}
}
/* one lock: root at (th0, y0) on the skull, flowing along the surface: y falls by `len` while the
   angle drifts by `drift`; `lift` is how far the tip stands off the skull; below `hangY` the lock
   leaves the head and hangs straight down, flaring by `flare` */
function lock(L,rings,o){
  const N=o.n||5,pts=[],widths=[],shade=[];const v=new THREE.Vector3();
  let th=o.th,y=o.y;const len=o.len;const up=o.up||0;
  let lastX=0,lastZ=0,lastR=1,off=null;
  for(let k=0;k<=N;k++){const t=k/N;
    const yy=o.y-len*t*(1-up)+len*t*up*1.0;     /* up: the lock climbs instead of falling (spikes) */
    const tth=o.th+(o.drift||0)*t;
    const stand=0.006+(o.lift||0.02)*t*t+(o.base||0);
    if(o.hangY!==undefined&&yy<o.hangY){
      if(!off){headPoint(rings,HEAD_Y+o.hangY,tth,v);const R=Math.hypot(v.x,v.z)||1;off={x:v.x/R,z:v.z/R,R};}
      const drop=o.hangY-yy;const R=off.R+stand+(o.flare||0.2)*drop+(o.wave?0.012*Math.sin(drop*38+o.th*3):0);
      pts.push(new THREE.Vector3(off.x*R,HEAD_Y+yy,off.z*R));
    }else if(up){
      headPoint(rings,HEAD_Y+Math.min(o.y,CROWN-0.002),tth,v);const R=Math.hypot(v.x,v.z)||1;
      const dx=v.x/R,dz=v.z/R;const rise=len*t;
      pts.push(new THREE.Vector3(v.x+dx*(stand+rise*o.out),HEAD_Y+o.y+rise,v.z+dz*(stand+rise*o.out)));
    }else{
      headPoint(rings,HEAD_Y+Math.min(yy,CROWN-0.002),tth,v);const R=Math.hypot(v.x,v.z)||1;
      const crownTuck=Math.max(0,(yy-(CROWN-0.03))/0.03);
      pts.push(new THREE.Vector3(v.x+v.x/R*stand*(1-crownTuck*0.5),HEAD_Y+yy,v.z+v.z/R*stand*(1-crownTuck*0.5)));
    }
    const w0=o.w||0.022;widths.push(k===0?w0*0.8:(k===N?w0*0.18:w0*(1-0.35*t)));
    shade.push(0.72+0.42*t);
  }
  lockStrip(L,pts,widths,o.thick||0.007,shade);
}
function hairLocks(rings,style,seed,female){
  const F=Math.PI/2,BK=3*Math.PI/2;
  const st=HAIR_STYLES[style]||HAIR_STYLES.short;
  const L={pos:[],uv:[],col:[],idx:[]};
  const rnd=(i)=>{const x=Math.sin(i*12.9898+seed*0.37)*43758.5453;return x-Math.floor(x);};
  const side=(seed%2?1:-1);                   /* which way the fringe sweeps */
  const backness=th=>bump(th,BK,1.1);         /* 1 at the back, 0 at the face */
  const ring=(y,count,fn)=>{for(let i=0;i<count;i++){const th=i/count*Math.PI*2+rnd(i+y*100)*0.25;fn(th,i);}};
  if(st.none)return null;
  if(st.spikes){
    ring(0.13,9,(th,i)=>lock(L,rings,{th,y:0.13,len:0.12+rnd(i)*0.04,up:1,out:0.9,w:0.02,thick:0.012,lift:0,n:4}));
    lock(L,rings,{th:F,y:0.16,len:0.15,up:1,out:0.3,w:0.022,thick:0.013,lift:0,n:4});
    ring(0.07,14,(th,i)=>{if(bump(th,F,0.5)>0.5)return;lock(L,rings,{th,y:0.07,len:0.05,drift:0,lift:0.006,w:0.02,n:3});});
    return L;
  }
  if(st.strip){
    for(let i=0;i<7;i++){const th=i<4?F:BK;const y=0.17-Math.abs(i-3)*0.02;lock(L,rings,{th:i===3?F:th,y:Math.min(y,CROWN-0.01),len:0.16+rnd(i)*0.03,up:1,out:i<3?0.35:(i>3?-0.35:0),w:0.03,thick:0.02,lift:0,n:4});}
    return L;
  }
  if(st.crop){
    ring(0.15,10,(th,i)=>lock(L,rings,{th,y:0.15,len:0.03,lift:0.003,w:0.02,thick:0.004,n:2}));
    ring(0.10,16,(th,i)=>lock(L,rings,{th,y:0.10,len:0.03,lift:0.003,w:0.02,thick:0.004,n:2}));
    ring(0.05,14,(th,i)=>{if(bump(th,F,0.9)>0.35)return;lock(L,rings,{th,y:0.05,len:0.03,lift:0.003,w:0.02,thick:0.004,n:2});});
    return L;
  }
  if(st.curly){
    for(const [y,cnt] of [[0.155,10],[0.115,16],[0.075,16],[0.04,14]])ring(y,cnt,(th,i)=>{if(y<0.06&&bump(th,F,0.9)>0.35)return;
      lock(L,rings,{th,y,len:0.045+rnd(i+y)*0.02,drift:(rnd(i*3+y)-0.5)*1.4,lift:0.028+rnd(i+7)*0.01,w:0.02,thick:0.013,n:3});});
    for(let i=0;i<6;i++){const th=F-((i+0.5)/6-0.5)*1.2;lock(L,rings,{th,y:0.10,len:0.045,drift:(rnd(i)-0.5)*1.2,lift:0.03,w:0.02,thick:0.013,n:3});}
    return L;
  }
  const hang=st.hang,flare=st.flare||0.25;
  const fem=!!female;
  if(st.pull){
    /* combed back: locks from the hairline all round sweep to the gather point at the nape */
    const gather=(th)=>{const d=Math.atan2(Math.sin(BK-th),Math.cos(BK-th));return d;};
    for(let i=0;i<26;i++){const th=i/26*Math.PI*2+rnd(i)*0.12;const face=bump(th,F,1.0);const y0=0.028+0.075*face-0.03*backness(th);const d=gather(th);
      if(Math.abs(d)<0.15)continue;
      lock(L,rings,{th,y:y0,len:0.05+0.06*face,drift:Math.sign(d)*Math.min(Math.abs(d),1.4),lift:0.006,w:0.022,thick:0.006,n:5});}
    for(let i=0;i<10;i++){const th=i/10*Math.PI*2+0.3;const d=gather(th);if(Math.abs(d)<0.2)continue;
      lock(L,rings,{th,y:0.15,len:0.10,drift:Math.sign(d)*Math.min(Math.abs(d),1.2),lift:0.006,w:0.024,thick:0.006,n:5});}
    return L;
  }
  /* the crown whorl: short locks radiating from the crown */
  ring(0.155,10,(th,i)=>lock(L,rings,{th,y:0.155,len:0.075+rnd(i)*0.02,drift:(rnd(i+7)-0.5)*0.3,lift:0.012,w:0.024,n:4}));
  /* the middle row: from the upper skull down over the sides and back; long styles hang */
  ring(0.105,16,(th,i)=>{const bk=backness(th);const isFace=bump(th,F,0.65)>0.45;
    const o={th,y:0.105,len:(isFace?0.06:0.095+rnd(i)*0.02)*(fem&&style==='short'?1.35:1),drift:isFace?side*(fem?0.35:0.5):(st.pull||0)*(th<F||th>F+Math.PI?1:-1)*0.6,lift:isFace?0.014:(fem?0.012:0.018),w:0.026,n:isFace?4:5};
    if(hang!==undefined&&!isFace){o.len=0.105-hang+0.02;o.hangY=0.02;o.flare=flare*(0.6+bk*0.6);o.lift=0.01;o.n=7;}
    lock(L,rings,o);});
  /* the lower row on the sides and the nape */
  ring(0.045,14,(th,i)=>{if(bump(th,F,0.9)>0.35)return;const bk=backness(th);
    const o={th,y:0.045,len:0.07+rnd(i)*0.02,drift:(st.pull||0)*(th<F||th>F+Math.PI?1:-1)*0.5,lift:0.014,w:0.024,n:4};
    if(hang!==undefined){o.len=0.045-hang+0.02;o.hangY=0.0;o.flare=flare*(0.5+bk*0.5);o.lift=0.008;o.n=7;}
    lock(L,rings,o);});
  /* the fringe: from the hairline, swept to one side over the brow */
  const fringeN=st.noFringe?0:(st.fringe?7:5);
  for(let i=0;i<fringeN;i++){const u=(i+0.5)/fringeN-0.5;const th=F-u*1.1*(-1);
    lock(L,rings,{th,y:0.098,len:st.fringe?0.06:0.045,drift:side*(st.fringe?0.25:0.55),lift:st.fringe?0.006:0.016,w:0.024,n:4});}
  /* the temples */
  for(const sx of [-1,1])lock(L,rings,{th:F-sx*1.0,y:0.075,len:0.05,drift:-sx*0.15,lift:0.012,w:0.02,n:3});
  return L;
}
function locksGeometry(L){
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(L.pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(L.uv,2));
  g.setAttribute('color',new THREE.Float32BufferAttribute(L.col,3));g.setIndex(L.idx);g.computeVertexNormals();return g;
}
function buildHDHair(body,style,hex){
  const {upper,female}=body;
  if(body.hair){for(const m of body.hair){upper.remove(m);if(m.geometry)m.geometry.dispose();}}
  body.hair=[];body.hairStyle=style;body.hairHex=hex;
  const st=HAIR_STYLES[style]||HAIR_STYLES.short;
  if(st.none)return;
  const rings=headRings(female);
  const hm=body.castMat?body.castMat(false):new THREE.MeshLambertMaterial({color:0xffffff,map:hairTex(hex),vertexColors:true,side:THREE.DoubleSide});
  const put=(geo,x,y,z)=>{const m=new THREE.Mesh(geo,hm);m.castShadow=true;m.userData.hdHair=1;m.position.set(x||0,y||0,z||0);upper.add(m);body.hair.push(m);return m;};
  const seed=Math.abs(body.g.id|0);
  if(!st.spikes&&!st.strip)put(hairGeometry(rings,style,seed,true));      /* the scalp under the locks */
  const L=hairLocks(rings,style,seed,female);if(L)put(locksGeometry(L));
  const solid=(geo,x,y,z)=>{const g=geo;const n=g.attributes.position.count;const c=new Float32Array(n*3);c.fill(0.9);g.setAttribute('color',new THREE.BufferAttribute(c,3));return put(g,x,y,z);};
  if(st.tail){const B=new Buf();const fr=new THREE.Matrix4().makeTranslation(0,HEAD_Y+0.06,-0.125).multiply(new THREE.Matrix4().makeRotationX(0.35));
    tube(B,[{y:0,rx:0.05,rz:0.045,b:[SPINE,1]},{y:-0.05,rx:0.038,rz:0.034,b:[SPINE,1]},{y:-0.14,rx:0.034,rz:0.030,b:[SPINE,1]},{y:-0.24,rx:0.028,rz:0.024,b:[SPINE,1]},{y:-0.31,rx:0.012,rz:0.010,b:[SPINE,1]}],10,fr,false,true);
    const g=toGeo(B);g.deleteAttribute('skinIndex');g.deleteAttribute('skinWeight');solid(g);
    const tie=put(new THREE.TorusGeometry(0.036,0.009,6,12),0,HEAD_Y+0.05,-0.13);tie.material=new THREE.MeshLambertMaterial({color:0x4a2a1a});tie.rotation.x=Math.PI/2-0.35;}
  if(st.bun){const b=solid(new THREE.SphereGeometry(0.058,14,10),0,HEAD_Y+0.15,-0.085);b.scale.set(1,0.85,0.9);}
  if(st.braid){const B=new Buf();const fr=new THREE.Matrix4().makeTranslation(0,HEAD_Y+0.04,-0.12).multiply(new THREE.Matrix4().makeRotationX(0.18));
    const rr=[];for(let k=0;k<=12;k++){const y=-k*0.032;const bul=(k%2?1.0:0.72);rr.push({y,rx:0.028*bul*(1-k/16),rz:0.024*bul*(1-k/16),b:[SPINE,1],f:th=>1+0.18*Math.cos(th*3+k*1.05)});}
    rr.push({y:-0.42,rx:0.006,rz:0.006,b:[SPINE,1]});
    tube(B,rr,10,fr,true,true);const g=toGeo(B);g.deleteAttribute('skinIndex');g.deleteAttribute('skinWeight');solid(g);
    const tie=put(new THREE.TorusGeometry(0.02,0.006,6,12),0,HEAD_Y+0.04-0.36,-0.12-0.06);tie.material=new THREE.MeshLambertMaterial({color:0x7a2a2a});tie.rotation.x=Math.PI/2-0.18;}
}
function beardGeometry(rings,seed){
  const F=Math.PI/2;const segs=20,rows=8;const pos=[],uv=[],idx=[];const v=new THREE.Vector3();
  for(let i=0;i<=segs;i++){const th=F-1.35+2.7*i/segs;const side=Math.abs(th-F)/1.35;   /* 0 at the chin, 1 at the ears */
    for(let j=0;j<=rows;j++){const t=j/rows;
      const yTop=-0.06-0.05*side;                       /* starts below the mouth, up along the jaw toward the ears */
      const len=0.16*(1-0.75*side)+0.02*(vn(th*3+seed,0.3)-0.5);
      const y=yTop-len*t;
      headPoint(rings,HEAD_Y+Math.max(-0.149,y),th,v);const L=Math.hypot(v.x,v.z)||1;
      const out=0.016+0.02*Math.min(1,t*1.5)*(1-side);   /* fuller at the chin */
      const below=Math.max(0,-0.149-y);                   /* past the chin: hang down, curl inward */
      const k=1-Math.min(0.85,below*4);
      pos.push(v.x*k+v.x/L*out*k,HEAD_Y+y,v.z*k+v.z/L*out*k);uv.push(i/segs*2,t);}}
  const row=rows+1;
  for(let i=0;i<segs;i++)for(let j=0;j<rows;j++){const a=i*row+j,b=a+row,c=a+1,d=b+1;idx.push(a,c,b,c,d,b);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;
}
/* the pupil's satchel: a rounded bag with a flap and a buckle, in the game's colour */
function dressSatchel(box,parent){
  if(box.userData.hdSatchel)return;box.userData.hdSatchel=1;
  const col=box.material&&box.material.color?box.material.color.getHex():0xb0822a;
  const rr=(w,h,r)=>{const sh=new THREE.Shape();sh.moveTo(-w/2+r,-h/2);sh.lineTo(w/2-r,-h/2);sh.quadraticCurveTo(w/2,-h/2,w/2,-h/2+r);sh.lineTo(w/2,h/2-r);sh.quadraticCurveTo(w/2,h/2,w/2-r,h/2);sh.lineTo(-w/2+r,h/2);sh.quadraticCurveTo(-w/2,h/2,-w/2,h/2-r);sh.lineTo(-w/2,-h/2+r);sh.quadraticCurveTo(-w/2,-h/2,-w/2+r,-h/2);return sh;};
  const bag=new THREE.ExtrudeGeometry(rr(0.24,0.32,0.05),{depth:0.10,bevelEnabled:true,bevelThickness:0.012,bevelSize:0.012,bevelSegments:2});bag.translate(0,0,-0.05);
  box.geometry=bag;box.material=new THREE.MeshLambertMaterial({color:col,map:leatherTex(),roughness:0.85});
  const flap=new THREE.Mesh(new THREE.ExtrudeGeometry(rr(0.25,0.16,0.04),{depth:0.02,bevelEnabled:true,bevelThickness:0.006,bevelSize:0.006,bevelSegments:1}),new THREE.MeshLambertMaterial({color:new THREE.Color(col).multiplyScalar(0.8).getHex(),map:leatherTex(),roughness:0.85}));
  flap.position.set(box.position.x,box.position.y+0.09,box.position.z-0.07);flap.castShadow=true;parent.add(flap);
  const buckle=new THREE.Mesh(new THREE.TorusGeometry(0.018,0.005,6,10),new THREE.MeshLambertMaterial({color:0xc9a23a,roughness:0.4,metalness:0.5}));buckle.position.set(box.position.x,box.position.y+0.02,box.position.z-0.085);parent.add(buckle);
  for(const c of parent.children){const q=c.isMesh&&c.geometry&&c.geometry.parameters;if(q&&q.width===0.045&&q.height===0.3&&q.depth===0.03){c.geometry=new THREE.BoxGeometry(0.04,0.3,0.018);c.material=new THREE.MeshLambertMaterial({color:c.material.color.getHex(),map:leatherTex(),roughness:0.85});}}
}
function hairFromGame(hairG){
  let style='short',hex=0x6b4a26;
  if(hairG){const ms=hairG.children.filter(m=>m.isMesh);if(ms.length&&ms[0].material&&ms[0].material.color)hex=ms[0].material.color.getHex();
    /* the game's builder leaves no style tag; read the shapes it made */
    const ts=ms.map(m=>m.geometry&&m.geometry.type),ps=ms.map(m=>m.geometry&&m.geometry.parameters||{});
    if(ms.length===1&&ps[0].radius===0.155)style='bald';
    else if(ts.filter(t=>t==='ConeGeometry').length===4&&ps.some(p=>p.height===0.16))style='spiky';
    else if(ts.filter(t=>t==='ConeGeometry').length===4)style='mohawk';
    else if(ps.some(p=>p.radius===0.078))style='pony';
    else if(ps.some(p=>p.radius===0.09))style='bun';
    else if(ts.filter(t=>t==='BoxGeometry').length===3)style='bob';
    else if(ts.filter(t=>t==='BoxGeometry').length===1)style='long';}
  return {style,hex};
}

/* The face kit. Builds a whole head into a group at `parent` (centre at (0,y,0), scaled by
   `scale`): sculpted skull, nose, lips, eyes set deep in their sockets under real lids, ears,
   and optionally a beard. Humans, giants and every humanoid creature share it. */
function buildHead(parent,o){
  const skin=o.skin!==undefined?o.skin:0xd9a066,hair=o.hair!==undefined?o.hair:0x6b4a26,seed=o.seed||0,female=!!o.female,sc=o.scale||1;
  const hg=new THREE.Group();hg.position.y=o.y||0;hg.scale.setScalar(sc);hg.userData.hdHeadGroup=1;parent.add(hg);
  const rings=headRings(female).map(r=>Object.assign({},r,{y:r.y-HEAD_Y}));
  const hb=new Buf();tube(hb,rings,28,null,true,true);
  const headGeo=toGeo(hb);headGeo.deleteAttribute('skinIndex');headGeo.deleteAttribute('skinWeight');
  const headMat=new THREE.MeshLambertMaterial({color:skin,map:faceTex(hair,seed,female)});
  const head=new THREE.Mesh(headGeo,headMat);head.castShadow=true;head.receiveShadow=true;head.userData.hdHead=1;hg.add(head);
  const skinM=new THREE.MeshLambertMaterial({color:skin,map:skinTex()});
  /* nose: a small tube standing off the face, bridge to tip, wider at the wings */
  const nb=new Buf();const nf=new THREE.Matrix4().makeTranslation(0,0.030,0.100).multiply(new THREE.Matrix4().makeRotationX(Math.PI/2+0.62));
  const ns=(female?0.9:1)*(o.nose||1);
  tube(nb,[{y:-0.01,rx:0.011*ns,rz:0.016,b:[SPINE,1]},{y:0.015,rx:0.012*ns,rz:0.015,b:[SPINE,1]},{y:0.035,rx:0.017*ns,rz:0.016,b:[SPINE,1]},{y:0.050,rx:0.024*ns,rz:0.019,b:[SPINE,1],f:th=>1+0.30*(bump(th,0,0.6)+bump(th,Math.PI,0.6))},{y:0.061,rx:0.017*ns,rz:0.015,b:[SPINE,1]},{y:0.068,rx:0.006,rz:0.006,b:[SPINE,1]}],12,nf,false,true);
  const noseGeo=toGeo(nb);noseGeo.deleteAttribute('skinIndex');noseGeo.deleteAttribute('skinWeight');
  const nose=new THREE.Mesh(noseGeo,skinM);nose.castShadow=true;hg.add(nose);
  const nostM=new THREE.MeshLambertMaterial({color:new THREE.Color(skin).multiplyScalar(0.45).getHex()});
  for(const sx of [-1,1]){const no=new THREE.Mesh(new THREE.SphereGeometry(0.006,8,6),nostM);no.position.set(sx*0.013*ns,-0.006,0.132);no.scale.set(1,0.7,0.8);hg.add(no);}
  /* lips: an upper and a fuller lower lip */
  const lipM=new THREE.MeshLambertMaterial({color:new THREE.Color(skin).lerp(new THREE.Color(female?0xb84c5a:0x9a5a4a),female?0.55:0.2).getHex()});
  {const up=new THREE.Mesh(new THREE.SphereGeometry(1,14,8),lipM);up.scale.set(female?0.031:0.033,female?0.0065:0.005,0.010);up.position.set(0,-0.070,0.108);hg.add(up);
   const lo=new THREE.Mesh(new THREE.SphereGeometry(1,14,8),lipM);lo.scale.set(female?0.026:0.028,female?0.0085:0.007,0.011);lo.position.set(0,-0.082,0.107);hg.add(lo);}
  /* eyes: one almond each, recessed into the socket on the skull's own surface; no ball
     stands proud of the face, which is what reads as a face from any distance */
  const irisHex=o.iris!==undefined?o.iris:[0x4a6a3a,0x3b5aa0,0x5a3a22,0x6b6a5a,0x2f7a6a][seed%5];
  const eyes=[];const F=Math.PI/2;const _q=new THREE.Vector3();
  for(const sx of [-1,1]){
    const th=F-sx*0.36;headPoint(rings,0.032,th,_q);
    const em=new THREE.MeshLambertMaterial({map:eyeAlmondTex(irisHex,female),transparent:true,alphaTest:0.5,roughness:0.35,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
    const eye=new THREE.Mesh(new THREE.PlaneGeometry(0.05,0.028),em);
    const nx=Math.cos(th),nz=Math.sin(th);eye.position.set(_q.x+nx*0.0015,_q.y,_q.z+nz*0.0015);eye.rotation.y=Math.atan2(nx,nz);eye.rotation.z=-sx*0.05;
    hg.add(eye);eyes.push(eye);
  }
  /* ears: an outer shell and a darker hollow */
  const earM=new THREE.MeshLambertMaterial({color:new THREE.Color(skin).multiplyScalar(0.72).getHex()});
  for(const sx of [-1,1]){const ear=new THREE.Mesh(new THREE.SphereGeometry(0.030,12,9),skinM);ear.scale.set(0.38,1.0,0.72);ear.position.set(sx*0.134,0.004,-0.012);ear.rotation.y=sx*0.25;hg.add(ear);
    const hol=new THREE.Mesh(new THREE.SphereGeometry(0.020,10,8),earM);hol.scale.set(0.3,0.85,0.6);hol.position.set(sx*0.139,0.000,-0.012);hol.rotation.y=sx*0.25;hg.add(hol);}
  if(o.beard){const bg=beardGeometry(headRings(female),seed);bg.translate(0,-HEAD_Y,0);const bd=new THREE.Mesh(bg,new THREE.MeshLambertMaterial({color:0xffffff,map:hairTex(o.beard===true?hair:o.beard),side:THREE.DoubleSide}));hg.add(bd);}
  return {group:hg,head,eyes,skinM};
}

try{performance.mark('hd:hd-body/materials');}catch(e){}
/* ----------------------------- materials ------------------------------- */
function mat(hex,map,extra){const m=new THREE.MeshLambertMaterial(Object.assign({color:hex,map:map,skinning:true},extra||{}));return m;}

try{performance.mark('hd:hd-body/the-body');}catch(e){}
/* ----------------------------- the body -------------------------------- */
const EMPTY=new THREE.BufferGeometry();EMPTY.setAttribute('position',new THREE.Float32BufferAttribute([],3));EMPTY.setAttribute('uv',new THREE.Float32BufferAttribute([],2));
function findParts(g,upper){
  const P={old:[],hips:null,belt:null,head:null,hair:null,eyes:[],arms:[],legs:[],torso:null,skinHex:null,shirtHex:null,pantsHex:null,bootsHex:null,skirtHex:null};
  const hexOf=m=>(m.material&&m.material.color)?m.material.color.getHex():null;
  for(const ch of g.children){
    if(ch.userData&&ch.userData.thigh){P.legs.push(ch);for(const m of ch.children)if(m.isMesh&&!m.userData.cosExtra){if(m===ch.userData.thigh&&P.pantsHex===null)P.pantsHex=hexOf(m);else if(m!==ch.userData.thigh&&P.bootsHex===null)P.bootsHex=hexOf(m);P.old.push(m);}}
    if(ch.isMesh&&ch.geometry&&ch.geometry.parameters&&ch.geometry.parameters.radiusTop===0.135&&ch.geometry.parameters.height===0.05)P.belt=ch;
    else if(ch.isMesh&&ch.geometry&&ch.geometry.parameters&&ch.geometry.parameters.radiusTop===0.15&&ch.geometry.parameters.height===0.52){P.skirtHex=hexOf(ch);P.old.push(ch);}
    else if(ch.isMesh&&ch.geometry&&(ch.geometry.parameters&&ch.geometry.parameters.radiusTop===0.13||ch.geometry.attributes&&ch.userData.cos==='pants'&&!ch.userData.thigh&&ch!==P.belt)){if(!ch.userData.cosExtra)P.old.push(ch);}
  }
  for(const u of upper.children){
    if(u.userData&&u.userData.sleeve){P.arms.push(u);if(P.shirtHex===null&&u.userData.sleeve.material)P.shirtHex=hexOf(u.userData.sleeve);for(const m of u.children)if(m.isMesh&&!m.userData.hdThumb)P.old.push(m);continue;}
    if(u.isGroup&&u.position.y>0.7){P.hair=u;continue;}
    if(u.isMesh){
      const p=u.geometry&&u.geometry.parameters||{};
      if(p.radius===0.15||u.userData.hdOldHead){P.head=u;u.userData.hdOldHead=1;P.old.push(u);}
      else if(u.userData.cos==='shirt'||p.radius===0.088||p.radius===0.03||(p.radiusTop===0.058)||u.geometry===undefined){if(p.radiusTop===0.058&&u.material&&u.material.color)P.skinHex=u.material.color.getHex();P.old.push(u);}
      else if(u.geometry&&(u.geometry.type==='SphereGeometry'&&p.radius<=0.03))P.old.push(u);   /* nose, ears from hd-chars */
    }
  }
  return P;
}
const bodies=[];
function buildBody(g,upper,cos,female){
  if(g.userData.hdBody)return;
  const P=findParts(g,upper);
  if(!P.head||P.arms.length<2||P.legs.length<2)return;
  g.userData.hdBody=1;
  /* the old parts: empty geometry, so whatever the game does to them later shows nothing */
  for(const m of P.old){m.geometry=EMPTY;m.traverse(c=>{if(c!==m&&c.isMesh){c.geometry=EMPTY;c.visible=false;}});}
  /* and the earlier HD loft pieces (hd-chars' torso, pelvis, deltoids), which the new body replaces */
  /* (hd-chars tags them hdHair; hd-post's hdSw is on every mesh it touched, so it says nothing) */
  for(const host of [g,upper])for(const m of host.children)if(m.isMesh&&m.userData&&m.userData.hdHair&&!m.userData.hdBodyPart){m.geometry=EMPTY;m.visible=false;}
  /* an NPC's shoulder piece (a wide flat sphere the game hangs on the outer group at chest height,
     the atelier's boa) rides the shoulders of the real torso instead of standing through it */
  if(g.parent&&!g.parent.isScene)for(const m of g.parent.children){const q=m.isMesh&&m.geometry&&m.geometry.parameters;if(q&&q.radius===0.12&&m.scale.x>1.5&&Math.abs(m.position.y-1.18)<0.05){m.position.y=1.31;m.scale.set(1.95,0.38,1.3);}}
  for(const ag of P.arms)for(const m of ag.children)if(m.userData.hdThumb)m.geometry=EMPTY;
  /* colours */
  const skin=(cos&&typeof cos.skin==='number')?cos.skin:(P.skinHex!==null?P.skinHex:0xd9a066);
  const shirt=(cos&&typeof cos.shirt==='number')?cos.shirt:(P.shirtHex!==null?P.shirtHex:0x8a8148);
  const pants=(cos&&typeof cos.pants==='number')?cos.pants:(P.pantsHex!==null?P.pantsHex:0x2f5d33);
  const boots=(cos&&typeof cos.boots==='number')?cos.boots:(P.bootsHex!==null?P.bootsHex:0x4a3424);
  let hair=0x6b4a26;if(P.hair)P.hair.traverse(m=>{if(m.isMesh&&m.material&&m.material.color&&hair===0x6b4a26)hair=m.material.color.getHex();});
  const seed=Math.abs((g.id*7919+skin)|0);
  /* bones under the rig's own groups */
  const groups=[g,upper,P.arms.find(a=>a.position.x<0)||P.arms[0],P.arms.find(a=>a.position.x>0)||P.arms[1],P.legs.find(l=>l.position.x<0)||P.legs[0],P.legs.find(l=>l.position.x>0)||P.legs[1]];
  const bones=groups.map(gr=>{const b=new THREE.Bone();gr.add(b);return b;});
  for(const [parent,y] of [[LLEG,KNEE_Y],[RLEG,KNEE_Y],[LARM,ELB_Y],[RARM,ELB_Y]]){const b=new THREE.Bone();b.position.y=y;bones[parent].add(b);bones.push(b);}
  const inverses=REST.map(m=>new THREE.Matrix4().copy(m).invert());
  const skeleton=new THREE.Skeleton(bones,inverses);
  const body={g,upper,skeleton,meshes:[],female,skin,shirt,pants:(P.skirtHex!==null?P.skirtHex:pants),boots,shirtStyle:'tee',pantsStyle:P.skirtHex!==null?'skirt':'trousers',groups,prev:[0,0],prevT:0,gearClones:[]};
  const add=(geo,material,cosTag)=>{if(body.castMat)material=body.castMat(true);const m=new THREE.SkinnedMesh(geo,material);m.castShadow=true;m.receiveShadow=true;geo.boundingSphere=new THREE.Sphere(new THREE.Vector3(0,0.95,0),1.35);m.frustumCulled=true;if(cosTag)m.userData.cos=cosTag;m.userData.hdBodyPart=1;g.add(m);m.bind(skeleton,new THREE.Matrix4());body.meshes.push(m);return m;};
  body.add=add;
  buildClothing(body);
  /* the head: a sculpted skull, a nose, lips, eyes with lids, ears — the shared face kit */
  const HK=buildHead(upper,{skin,hair,seed,female,y:HEAD_Y});const head=HK.head;body.headG=head.parent;
  /* hair on the skull; the game's hair meshes show nothing. An NPC's long hair is a slab the
     game hangs on its outer group behind the head: that means the long style here. */
  const hg=hairFromGame(P.hair);
  if(P.hair){P.hair.traverse(m=>{if(m.isMesh)m.geometry=EMPTY;});body.hairG=P.hair;}
  if(g.parent&&!g.parent.isScene){for(const c of g.parent.children){const q=c.isMesh&&c.geometry&&c.geometry.parameters;if(q&&q.width===0.22&&q.height===0.3&&q.depth===0.08&&Math.abs(c.position.y-1.38)<0.01){hg.style='long';if(c.material&&c.material.color)hg.hex=c.material.color.getHex();c.geometry=EMPTY;}
    else if(q&&q.width===0.26&&q.height===0.36&&q.depth===0.13){dressSatchel(c,g.parent);}}}
  /* the game's beard is a cone hung under the chin: a beard grown on the jaw instead */
  for(const c of upper.children){const q=c.isMesh&&c.geometry&&c.geometry.parameters;if(q&&q.radius===0.082&&q.height===0.32&&q.radiusTop===undefined){const col=c.material&&c.material.color?c.material.color.getHex():0x6b4a26;c.geometry=beardGeometry(headRings(female),seed);c.position.set(0,0,0);c.rotation.set(0,0,0);c.material=new THREE.MeshLambertMaterial({color:0xffffff,map:hairTex(col),side:THREE.DoubleSide});c.userData.hdBeard=1;}}
  buildHDHair(body,(cos&&cos.hairstyle)||hg.style,(cos&&typeof cos.hair==='number')?cos.hair:hg.hex);
  /* the game's amulet (an octahedron at the chest) sits on the new chest rather than through it */
  /* the game's amulet: a flattened octahedron at the chest that stands out through a real torso; a small pendant on a cord instead */
  for(const u of upper.children){const q=u.isMesh&&u.geometry&&u.geometry.parameters;if(q&&q.radius===0.045&&u.geometry.type==='OctahedronGeometry'){u.geometry=new THREE.SphereGeometry(0.022,10,8);u.scale.set(1,1.15,0.5);u.position.set(0,0.47,female?0.118:0.126);
    const cord=new THREE.Mesh(new THREE.TorusGeometry(0.075,0.004,5,20,Math.PI),new THREE.MeshLambertMaterial({color:0x3a2a1a}));cord.position.set(0,0.545,0.03);cord.rotation.set(-0.35,0,Math.PI);u.parent.add(cord);}}
  /* the belt sits over the new hips */
  if(P.belt)P.belt.scale.set(1.2,1,0.95);
  bodies.push(body);
}
/* clothing and skin tubes, cut to the current styles */
function buildClothing(body){
  const {g,skeleton,female,skin,shirt,pants,boots}=body;
  for(const m of body.meshes){g.remove(m);m.geometry.dispose();}
  body.meshes.length=0;
  const add=body.add;
  /* under a jerkin or a mail shirt the arms are bare, as the game shows them */
  const bare=body.armour==='hide'||body.armour==='chain';
  const sleeveTo=(bare||body.shirtStyle==='sleeveless')?0.02:body.shirtStyle==='longsleeve'?-0.53:-0.16;
  const legTo=body.pantsStyle==='shorts'?-0.36:body.pantsStyle==='skirt'?-0.30:-0.66;
  const skirt=body.pantsStyle==='skirt';
  /* skin: neck (part of the torso tube's top), arms below the sleeve, legs below the trousers */
  const S=new Buf();
  for(const [bone,side] of [[LARM,-1],[RARM,1]]){const rings=armRings(bone,side,female).filter(r=>r.y<=sleeveTo+0.001&&r.y>-0.54);if(rings.length>1)tube(S,rings,12,REST[bone],true,false);handBuf(S,bone,side,female);}
  for(const bone of [LLEG,RLEG]){const rings=legRings(bone,female).filter(r=>r.y<=legTo+0.001);if(rings.length>1)tube(S,rings,14,REST[bone],true,false);}
  /* the neck as skin */
  tube(S,torsoRings(female).slice(-3),16,null,false,true);
  add(toGeo(S),mat(skin,skinTex()),null);
  /* shirt: torso and the sleeves; under body armour the torso is the armour's (nothing pokes
     through a jerkin), and the sleeves stay only where the arms are not bare */
  const T=new Buf();
  const tr=body.armour?[]:torsoRings(female).filter(r=>r.y<=1.37&&(body.shirtStyle==='tunic'||r.y>=0.80));   /* tucked in below the waist; a tunic hangs over */
  if(body.shirtStyle==='tunic'){for(const r of tr)if(r.y<=0.87){r.rx=Math.max(r.rx,0.176);r.rz=Math.max(r.rz,0.140);}tr.unshift({y:0.42,rx:0.215,rz:0.170,b:[ROOT,1]},{y:0.52,rx:0.196,rz:0.152,b:[ROOT,1]});}
  if(tr.length>1)tube(T,tr,20,null,true,true);
  if(sleeveTo<0)for(const [bone,side] of [[LARM,-1],[RARM,1]]){const rings=armRings(bone,side,female).filter(r=>r.y>=sleeveTo-0.001).map(r=>Object.assign({},r,{rx:r.rx*1.03+0.003,rz:r.rz*1.03+0.003}));tube(T,rings,12,REST[bone],false,true);}
  if(T.pos.length)add(toGeo(T),mat(shirt,knitTex()),'shirt');
  /* trousers (or a skirt) and the legs' cloth */
  const Q=new Buf();
  if(skirt){tube(Q,[{y:0.40,rx:0.27,rz:0.23,b:[ROOT,1]},{y:0.55,rx:0.235,rz:0.195,b:[ROOT,1]},{y:0.72,rx:0.19,rz:0.155,b:[ROOT,1]},{y:0.86,rx:0.155,rz:0.125,b:[ROOT,0.8,SPINE,0.2]}],20,null,true,true);}
  else{
    tube(Q,[{y:0.60,rx:0.150,rz:0.118,b:[ROOT,1]},{y:0.74,rx:0.164,rz:0.128,b:[ROOT,1]},{y:0.86,rx:0.150,rz:0.120,b:[ROOT,0.8,SPINE,0.2]}],20,null,true,true);
    for(const bone of [LLEG,RLEG]){const rings=legRings(bone,female).filter(r=>r.y>=legTo-0.001).map(r=>Object.assign({},r,{rx:r.rx*1.06+0.005,rz:r.rz*1.06+0.005}));tube(Q,rings,14,REST[bone],false,true);}
  }
  body.pantsMesh=add(toGeo(Q),mat(pants,clothTex()),'pants');
  /* shoes */
  const F=new Buf();for(const bone of [LLEG,RLEG])tube(F,footRings(bone),14,REST[bone],true,true);
  body.shoeMesh=add(toGeo(F),mat(boots,leatherTex()),null);
  if(body.hideLegs)body.pantsMesh.visible=false;if(body.hideFeet)body.shoeMesh.visible=false;
}
/* the player's trousers and shoes follow the equipment the way the game's own meshes do: none
   under leg armour, none in boots (the body slot is handled by HD.setArmour from the gear scan) */
function syncPlayerGear(){
  try{
    if(typeof pm==='undefined'||!pm||!pm.g||typeof player==='undefined'||!player.equip)return;
    const b=bodies.find(b=>b.g===pm.g);if(!b)return;
    b.hideLegs=!!player.equip.legs;b.hideFeet=!!player.equip.feet;
    let model=null;if(player.equip.body){const it=ITEMS[player.equip.body.id];model=(it&&it.equip&&it.equip.model)||'plate';}
    if(b.armour!==model){b.armour=model;buildClothing(b);}
    if(b.pantsMesh)b.pantsMesh.visible=!b.hideLegs;if(b.shoeMesh)b.shoeMesh.visible=!b.hideFeet;
  }catch(e){}
}
if(typeof renderEquip==='function'){const _re=renderEquip;renderEquip=function(){const r=_re.apply(this,arguments);syncPlayerGear();return r;};}
setInterval(syncPlayerGear,400);
/* a body built again from scratch: when the player's sex or skin tone changes (character
   creation, a loaded save) the rig's HD body, head and hair are torn down and rebuilt */
function destroyBody(b){
  const {g,upper}=b;
  for(const m of b.meshes){g.remove(m);if(m.geometry&&m.geometry!==EMPTY)m.geometry.dispose();}
  if(b.hair)for(const m of b.hair)upper.remove(m);
  g.traverse(o=>{if(o.userData&&o.userData.hdHeadGroup&&o.parent)o.parent.remove(o);});
  /* hand-held things go back to their arm groups before the elbow bones go */
  for(let i=0;i<2;i++){const e=b.skeleton.bones[LELB+i],grp=b.groups&&b.groups[LARM+i];if(!e||!grp)continue;for(const c of e.children.slice()){if(c.isBone)continue;c.position.y+=ELB_Y;delete c.userData.hdElbowed;grp.add(c);}}
  if(b.gearClones)for(const gc of b.gearClones)g.remove(gc.clone);
  for(const bone of b.skeleton.bones)if(bone.parent)bone.parent.remove(bone);
  const i=bodies.indexOf(b);if(i>=0)bodies.splice(i,1);
  delete g.userData.hdBody;
}
function rebuildBody(g){
  const b=bodies.find(b=>b.g===g);const clones=b?b.gearClones:null;const armour=b?b.armour:null;
  if(b)destroyBody(b);
  const ok=tryBuild(g);
  const nb=bodies.find(b=>b.g===g);
  if(nb&&clones){nb.gearClones=clones;for(const gc of clones){g.add(gc.clone);gc.clone.bind(nb.skeleton,new THREE.Matrix4());}}
  if(nb&&armour){nb.armour=armour;buildClothing(nb);}
  return ok;
}
HD.rebuildBody=rebuildBody;
/* joints: the game swings whole legs and arms as rigid groups; the knees and elbows underneath
   bend on their own. A knee flexes while its leg swings forward (the derivative of the hip
   angle), an elbow keeps a slight bend that deepens as the arm rises. Anything hung on a hand
   (the tool, a shield, an NPC's weapon) is moved into the elbow bone so it rides the forearm. */
const _vis=o=>{while(o){if(!o.visible)return false;o=o.parent;if(o&&o.isScene)break;}return true;};
const _lodV=new THREE.Vector3();
function animBodies(now){
  for(const b of bodies){
    if(!b.g.parent||!b.groups)continue;
    const sk=b.skeleton.bones;const dt=b.prevT?Math.max(8,Math.min(60,now-b.prevT)):16;b.prevT=now;
    for(let i=0;i<2;i++){const grp=b.groups[LLEG+i];if(!grp)continue;const rot=grp.rotation.x;const v=(rot-b.prev[i])/dt;b.prev[i]=rot;
      const target=Math.min(1,Math.max(0,-v/0.0075))*0.85+0.05;const k=sk[LKNEE+i];k.rotation.x+=(target-k.rotation.x)*0.35;}
    const isPl=(typeof pm!=='undefined'&&pm&&b.g===pm.g);
    const wstyle=isPl&&typeof currentWeaponStyle==='function'?currentWeaponStyle():'melee';
    for(let i=0;i<2;i++){const grp=b.groups[LARM+i];if(!grp)continue;const rot=grp.rotation.x;const raise=Math.max(0,-rot);
      /* a sword arm bends more the higher it goes; a bow arm stays straight and the draw hand comes
         back to the cheek; a staff is held with a little bend */
      let target;
      if(wstyle==='ranged')target=(i===1)?-(0.05+0.05*raise):-(0.35+0.75*raise);
      else if(wstyle==='magic')target=-(0.2+0.16*raise);
      else target=-(0.28+0.38*raise);
      const e=sk[LELB+i];e.rotation.x+=(target-e.rotation.x)*0.4;
      /* hand-held things ride the forearm */
      /* hd-chars' mitten thumb, added after the build (on the arm or already moved to the elbow), shows nothing */
      grp.traverse(c=>{if(c.isMesh&&c.userData&&c.userData.hdThumb&&c.geometry!==EMPTY){c.geometry=EMPTY;c.visible=false;}});
      for(const c of grp.children.slice()){if(c.userData&&c.userData.hdThumb)continue;
        if(c.isBone||c.userData.hdElbowed||c.userData.hdGear||c.userData.gaunt||c.userData.hdBodyPart)continue;if(c.position.y>-0.3)continue;if(c.isMesh&&(!c.geometry||!c.geometry.attributes.position||!c.geometry.attributes.position.count))continue;
        c.userData.hdElbowed=1;c.position.y-=ELB_Y;e.add(c);}}
    for(const gc of b.gearClones)gc.clone.visible=_vis(gc.src);
    /* distance detail: far figures drop the head's small parts and the hair locks */
    if(typeof camera!=='undefined'&&b.headG){if(!b._lodT||now-b._lodT>250){b._lodT=now;b.headG.getWorldPosition(_lodV);let inScene=false;{let p=b.g;while(p){if(p===scene){inScene=true;break;}p=p.parent;}}const far=inScene&&_lodV.distanceTo(camera.position)>22;   /* a preview rig in its own scene is never far */if(far!==b._far){b._far=far;for(const c of b.headG.children){if(c.userData&&c.userData.hdHead)continue;c.visible=!far;}if(b.hair)for(let i=1;i<b.hair.length;i++)b.hair[i].visible=!far;}}}
    /* life in the torso: breathing, a slow look about when idle, a twist into each swing, a
       flinch on a hit. Offsets only — the game sets the base pose every frame before this */
    const up=b.groups[SPINE];if(!up||b.statue)continue;   /* a statue does not breathe */
    const isPlayer=(typeof pm!=='undefined'&&pm&&b.g===pm.g);
    /* breathing: the chest rises a few millimetres; no rocking */
    if(b.upperY===undefined)b.upperY=up.position.y;up.position.y=b.upperY+0.004*(0.5+0.5*Math.sin(now*0.0021+b.g.id));
    if(isPlayer&&typeof player!=='undefined'){
      /* the game resets the torso's x each frame but not y or z: those are set from a base, never added to */
      if(b.upRotY0===undefined){b.upRotY0=up.rotation.y;b.upRotZ0=up.rotation.z;}
      const act=player.action;let twist=0,lean=0;
      const style=(typeof currentWeaponStyle==='function')?currentWeaponStyle():'melee';
      if(act&&(act.type==='attack'||act.type==='datk')&&player.swingT){const t=(now-player.swingT)/480;
        if(t>=0&&t<1){const s=Math.sin(Math.PI*t);if(style==='ranged'){twist=0.10*s;}else if(style==='magic'){twist=-0.12*s;lean=-0.06*s;}else{twist=(t<0.35?0.22*Math.sin(Math.PI*t/0.35):-0.30*Math.sin(Math.PI*(t-0.35)/0.65));lean=0.10*s;}}}
      up.rotation.y=b.upRotY0+twist;up.rotation.x+=lean;
      if(b.hpSeen!==undefined&&player.hp<b.hpSeen)b.flinch=1;b.hpSeen=player.hp;
      up.rotation.z=b.upRotZ0;
      if(b.flinch>0.01){up.rotation.x+=0.22*b.flinch;up.rotation.z=b.upRotZ0+0.05*b.flinch*Math.sin(now*0.05);b.flinch*=0.86;}
      const moving=typeof walkBlend!=='undefined'&&walkBlend>0.1;
      if(b.headG){const look=(act||moving)?0:0.22*Math.sin(now*0.0007+1.3)*Math.max(0,Math.sin(now*0.00023));b.headG.rotation.y+=(look-b.headG.rotation.y)*0.05;}
    }
  }
}
HD.tick=HD.tick||[];HD.tick.push(animBodies);

try{performance.mark('hd:hd-body/who-is-who');}catch(e){}
/* ----------------------------- who is who ------------------------------ */
function femaleFor(g){
  const c=g.userData.hdCos;if(c&&(c.sex==='f'||c.sex==='m'))return c.sex==='f';
  try{if(typeof pm!=='undefined'&&pm&&pm.g===g&&typeof player!=='undefined'&&player.cosmetic)return player.cosmetic.sex==='f';}catch(e){}
  try{if(typeof npcs!=='undefined')for(const n of npcs){if(n._hm&&n._hm.g===g)return n.sex==='f';}}catch(e){}
  return false;
}
function cosFor(g){
  try{if(typeof pm!=='undefined'&&pm&&pm.g===g&&typeof player!=='undefined'&&player.cosmetic)return Object.assign({skin:0xd9a066},g.userData.hdCos||{},player.cosmetic);}catch(e){}
  if(g.userData.hdCos)return g.userData.hdCos;
  return null;
}
/* the game re-applies the cosmetic on load and after the fashion shop; sex or skin changed
   means a new body */
if(typeof applyCosmetic==='function'){const _ac=applyCosmetic;applyCosmetic=function(rig,cos){const r=_ac.apply(this,arguments);try{if(rig&&rig.g&&cos){rig.g.userData.hdCos=Object.assign({},rig.g.userData.hdCos||{},cos);   /* a rebuild reads the rig's own packet: keep it current */
    const b=bodies.find(b=>b.g===rig.g);const fem=cos.sex==='f';const skin=(typeof cos.skin==='number')?cos.skin:0xd9a066;if(b&&(b.female!==fem||b.skin!==skin))rebuildBody(rig.g);if(cos.size||(typeof pm!=='undefined'&&pm&&rig.g===pm.g))HD.applySize(rig.g,cos.size);}}catch(e){console.warn('[HD] body rebuild',e);}return r;};}
/* sex and skin tone are the HD body's, not the game's: normCos keeps them through saves and
   the fashion shop, the fashion preview passes them to its model */
const SIZES={slight:0.94,average:1.0,broad:1.06};
if(typeof normCos==='function'){const _nc=normCos;normCos=function(c){const r=_nc.apply(this,arguments);if(c&&(c.sex==='f'||c.sex==='m'))r.sex=c.sex;if(c&&typeof c.skin==='number')r.skin=c.skin;if(c&&SIZES[c.size])r.size=c.size;return r;};}
HD.SIZES=SIZES;
HD.applySize=function(g,size){const k=SIZES[size]||1;g.scale.setScalar(k);};
if(typeof _fashCosToApp==='function'){const _fc=_fashCosToApp;_fashCosToApp=function(cos){const a=_fc.apply(this,arguments);if(cos&&cos.sex)a.sex=cos.sex;if(cos&&typeof cos.skin==='number')a.skin=cos.skin;return a;};}
function tryBuild(g){
  if(!g||g.userData.hdBody)return false;
  let upper=null;
  for(const ch of g.children){if(ch.isGroup){for(const u of ch.children){if(u.isMesh&&((u.geometry&&u.geometry.parameters&&u.geometry.parameters.radius===0.15)||(u.userData&&u.userData.hdOldHead))){upper=ch;break;}}if(upper)break;}}
  if(!upper)return false;
  const cos=cosFor(g);
  buildBody(g,upper,cos,femaleFor(g));
  if(cos){const b=bodies[bodies.length-1];if(b&&b.g===g){b.shirtStyle=cos.shirtStyle||'tee';b.pantsStyle=cos.pantsStyle||'trousers';buildClothing(b);}}
  return !!g.userData.hdBody;
}
/* rigs built from now on: capture the costume, then build */
const _mh=makeHumanoid;
makeHumanoid=function(c){const r=_mh.apply(this,arguments);try{if(r&&r.g){r.g.userData.hdCos=c||null;tryBuild(r.g);if(c&&c.size&&HD.applySize)HD.applySize(r.g,c.size);}}catch(e){console.warn('[HD] body',e);}return r;};
/* the game's style changes re-cut the cloth */
if(typeof applyShirtStyle==='function'){const _s=applyShirtStyle;applyShirtStyle=function(rig,style,col){const r=_s.apply(this,arguments);try{const b=bodies.find(b=>rig&&b.g===rig.g);if(b){b.shirtStyle=style||'tee';if(typeof col==='number')b.shirt=col;buildClothing(b);}}catch(e){}return r;};}
if(typeof applyPantsStyle==='function'){const _p=applyPantsStyle;applyPantsStyle=function(rig,style,col){const r=_p.apply(this,arguments);try{const b=bodies.find(b=>rig&&b.g===rig.g);if(b){b.pantsStyle=style||'trousers';if(typeof col==='number')b.pants=col;buildClothing(b);}}catch(e){}return r;};}
/* the game's hair rebuilds (a new style or colour) are ours too */
if(typeof buildHair==='function'){const _bh=buildHair;buildHair=function(hairG,style,col){const r=_bh.apply(this,arguments);try{const b=bodies.find(b=>b.hairG===hairG);if(b){hairG.traverse(m=>{if(m.isMesh)m.geometry=EMPTY;});buildHDHair(b,style||'short',(typeof col==='number')?col:0x6b4a26);}}catch(e){}return r;};}
/* the game's extras for tunic, skirt and shorts are ours now */
if(typeof _cosFresh==='function'){const _cf=_cosFresh;_cosFresh=function(geo,col){const m=_cf.apply(this,arguments);try{m.geometry=EMPTY;}catch(e){}return m;};}
/* existing rigs */
let n=0;
const roots=new Set();
scene.traverse(o=>{if(o.isMesh&&o.geometry&&o.geometry.parameters&&o.geometry.parameters.radius===0.15&&o.parent&&o.parent.parent&&o.parent.parent.userData.hdRig)roots.add(o.parent.parent);});
const CXL=209.5,CZL=61;const _wp=new THREE.Vector3();
const ordered=[...roots].map(g=>{g.getWorldPosition(_wp);return [g,(_wp.x-CXL)**2+(_wp.z-CZL)**2];}).sort((a,b)=>a[1]-b[1]);
for(const [g] of ordered){HD.defer(()=>{try{if(tryBuild(g))n++;}catch(e){console.warn('[HD] body',e);}});}
HD.bodies=bodies;
/* the kit hd-gear.js builds armour from: the same rings, the same tube builder */
HD.bodyKit={tube,Buf,toGeo,torsoRings,armRings,legRings,footRings,headRings,headPoint,beardGeometry,hairTex,buildHead,REST,bones:{ROOT,SPINE,LARM,RARM,LLEG,RLEG,LKNEE,RKNEE,LELB,RELB},KNEE_Y,ELB_Y,kneeOf,elbowOf,bump,tex,noiseCanvas,fbm,vn,HEAD_Y,CROWN,EMPTY,
  bodyFor:g=>bodies.find(b=>b.g===g),
  setArmour:(g,model)=>{const b=bodies.find(b=>b.g===g);if(!b||b.armour===(model||null))return;b.armour=model||null;buildClothing(b);}};
console.log('[HD] bodies built:',n);
})();
