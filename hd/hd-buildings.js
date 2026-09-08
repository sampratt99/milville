/* ============================================================================
   Milville HD — the building pass.  Loaded after hd-props.js.

   Every building keeps its bespoke model. This file reads each one's baked
   geometry (the bake carries a per-vertex surface id and colour) to find its
   eaves, ridge, chimneys, panes and doors, and dresses it with the small
   three-dimensional and weathering detail RS3 buildings carry: gutters and
   downpipes, ridge caps, chimney pots, sills and lintels, door furniture, a
   damp line at the plinth, rain streaks under sills, weeds and leaves at the
   base, ivy on the old brick, and a few props chosen by what kind of building
   it is. Nothing here moves a wall, a roof or a window.

   Gameplay is untouched: nothing here reads or writes game state.
   ========================================================================== */
(function(){
'use strict';
try{performance.mark('hd:hd-buildings');}catch(e){}
const HD=window.HD;
if(!HD||!HD.ready)return;
if(typeof BUILDINGS==='undefined'||typeof worldGroup==='undefined')return;

/* ------------------------------ classes ---------------------------------- */
const CLASS={
  chapel:'sacred',oldchapel:'sacred',
  library:'civic',upper:'civic',afc:'civic',portico:'civic',lindsay:'civic',hall:'civic',schoolhouse:'civic',stronghold:'civic',armour:'civic',
  drury:'dorm',kehaya:'dorm',sheldon:'dorm',warren:'dorm',manville:'dorm',brewster:'dorm',ford:'dorm',simpson:'dorm',kittredge:'dorm',nash:'dorm',hargate:'dorm',clark:'dorm',foster:'dorm',scudder:'dorm',middle:'dorm',pratt:'dorm',
  rectory:'house',cottage:'house',clc:'house',round:'house',hockey31:'house',pohcottage:'ruin',
  whitefarm:'farm',barn:'farm',
  rink:'utility',cage:'utility',mclane:'utility',plant:'utility',crump:'boathouse',observatory:'observatory'
};
const IVY=new Set(['chapel','upper','hargate','library']);
const MID={stone:3,brick:4,wood:5,slate:6,foliage:7,plaster:8,metal:9,glass:10};

/* ------------------------------ buffers ---------------------------------- */
function Buf(){this.pos=[];this.nor=[];this.uv=[];this.col=[];}
const _m4=new THREE.Matrix4(),_nm=new THREE.Matrix3(),_v=new THREE.Vector3(),_n=new THREE.Vector3(),_c=new THREE.Color();
/* append a geometry under a matrix with one colour */
function put(B,geo,m4,hex,uvScale){
  const g=geo.index?geo.toNonIndexed():geo;
  const p=g.attributes.position,n=g.attributes.normal,u=g.attributes.uv;
  _nm.getNormalMatrix(m4);_c.setHex(hex).convertSRGBToLinear();
  for(let i=0;i<p.count;i++){
    _v.fromBufferAttribute(p,i).applyMatrix4(m4);B.pos.push(_v.x,_v.y,_v.z);
    if(n){_n.fromBufferAttribute(n,i).applyMatrix3(_nm).normalize();B.nor.push(_n.x,_n.y,_n.z);}else B.nor.push(0,1,0);
    if(u){B.uv.push(u.getX(i)*(uvScale||1),u.getY(i)*(uvScale||1));}else B.uv.push(0,0);
    B.col.push(_c.r,_c.g,_c.b);
  }
  if(g!==geo)g.dispose();
}
function box(w,h,d){return new THREE.BoxGeometry(w,h,d);}
function T(x,y,z,ry,rx,rz,s){_m4.makeRotationFromEuler(new THREE.Euler(rx||0,ry||0,rz||0));if(s)_m4.scale(new THREE.Vector3(s,s,s));_m4.setPosition(x,y,z);return _m4;}
function toGeo(B){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(B.pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(B.nor,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(B.uv,2));g.setAttribute('color',new THREE.Float32BufferAttribute(B.col,3));return g;}
function shade(hex,k){const c=new THREE.Color(hex);c.multiplyScalar(k);return c.getHex();}
function mixHex(a,b,t){const c=new THREE.Color(a);c.lerp(new THREE.Color(b),t);return c.getHex();}
function isLight(hex){const c=new THREE.Color(hex);return (c.r*0.3+c.g*0.59+c.b*0.11)>0.62;}

/* ------------------------------ textures --------------------------------- */
function gradTex(){const c=document.createElement('canvas');c.width=8;c.height=64;const g=c.getContext('2d');const gr=g.createLinearGradient(0,0,0,64);gr.addColorStop(0,'rgba(0,0,0,0)');gr.addColorStop(1,'rgba(0,0,0,1)');g.fillStyle=gr;g.fillRect(0,0,8,64);const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping;return t;}
function streakTex(){const S=128;const c=document.createElement('canvas');c.width=c.height=S;const g=c.getContext('2d');g.clearRect(0,0,S,S);let s=7;const R=()=>{s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
  for(let i=0;i<26;i++){const x=R()*S,w=1+R()*4,l=S*(0.3+R()*0.7);const gr=g.createLinearGradient(0,0,0,l);gr.addColorStop(0,'rgba(20,14,10,'+(0.35+R()*0.3)+')');gr.addColorStop(1,'rgba(20,14,10,0)');g.fillStyle=gr;g.fillRect(x,0,w,l);}
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping;return t;}
function glowTex(){const S=64;const c=document.createElement('canvas');c.width=c.height=S;const g=c.getContext('2d');const gr=g.createRadialGradient(S/2,S/2,2,S/2,S/2,S/2);gr.addColorStop(0,'rgba(255,220,150,1)');gr.addColorStop(0.6,'rgba(255,196,110,0.75)');gr.addColorStop(1,'rgba(255,170,90,0.15)');g.fillStyle=gr;g.fillRect(0,0,S,S);return new THREE.CanvasTexture(c);}

/* ----------------------------- the survey -------------------------------- */
/* every baked vertex, bucketed by the building whose (padded) footprint holds it */
function survey(){
  const list=BUILDINGS.map(b=>({b,x0:b.x-0.7,x1:b.x+b.w+0.7,z0:b.y-0.7,z1:b.y+b.h+0.7,pts:[]}));
  const cell=8,grid=new Map();
  for(const e of list){for(let gx=Math.floor(e.x0/cell);gx<=Math.floor(e.x1/cell);gx++)for(let gz=Math.floor(e.z0/cell);gz<=Math.floor(e.z1/cell);gz++){const k=gx+','+gz;if(!grid.has(k))grid.set(k,[]);grid.get(k).push(e);}}
  const bakes=[];worldGroup.traverse(o=>{if(o.isMesh&&o.geometry&&o.geometry.attributes.mid&&o.geometry.attributes.color&&!o.isInstancedMesh)bakes.push(o);});
  for(const m of bakes){
    const p=m.geometry.attributes.position,mid=m.geometry.attributes.mid,col=m.geometry.attributes.color;const off=m.position;
    for(let i=0;i<p.count;i++){const x=p.getX(i)+off.x,y=p.getY(i)+off.y,z=p.getZ(i)+off.z;const lst=grid.get(Math.floor(x/cell)+','+Math.floor(z/cell));if(!lst)continue;
      for(const e of lst){if(x>=e.x0&&x<=e.x1&&z>=e.z0&&z<=e.z1){e.pts.push(x,y,z,mid.getX(i),col.getX(i),col.getY(i),col.getZ(i));}}}
  }
  return list;
}
function near(r,g,b,hex,tol){_c.setHex(hex);return Math.abs(r-_c.r)+Math.abs(g-_c.g)+Math.abs(b-_c.b)<tol;}
function pct(arr,q){if(!arr.length)return 0;const a=arr.slice().sort((x,y)=>x-y);return a[Math.min(a.length-1,Math.floor(q*a.length))];}
/* group points into clusters on a grid of `cell`, joining neighbouring cells */
function clusters(pts,cell){
  const cells=new Map();
  for(const q of pts){const k=Math.floor(q[0]/cell)+','+Math.floor(q[1]/cell)+','+Math.floor(q[2]/cell);let c=cells.get(k);if(!c){c={pts:[],key:k};cells.set(k,c);}c.pts.push(q);}
  const keys=[...cells.keys()];const parent=new Map(keys.map(k=>[k,k]));const find=k=>{while(parent.get(k)!==k){parent.set(k,parent.get(parent.get(k)));k=parent.get(k);}return k;};
  for(const k of keys){const [a,b,c]=k.split(',').map(Number);for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++){const nk=(a+dx)+','+(b+dy)+','+(c+dz);if(nk!==k&&cells.has(nk)){const ra=find(k),rb=find(nk);if(ra!==rb)parent.set(ra,rb);}}}
  const out=new Map();for(const k of keys){const r=find(k);if(!out.has(r))out.set(r,[]);out.get(r).push(...cells.get(k).pts);}
  return [...out.values()].map(pts=>{let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9,z0=1e9,z1=-1e9;for(const q of pts){if(q[0]<x0)x0=q[0];if(q[0]>x1)x1=q[0];if(q[1]<y0)y0=q[1];if(q[1]>y1)y1=q[1];if(q[2]<z0)z0=q[2];if(q[2]>z1)z1=q[2];}return {pts,x0,x1,y0,y1,z0,z1,cx:(x0+x1)/2,cy:(y0+y1)/2,cz:(z0+z1)/2,w:x1-x0,h:y1-y0,d:z1-z0};});
}

/* ------------------------------ dressing --------------------------------- */
const OPQ=new Buf(),DECAL=new Buf(),GLOW=new Buf(),IVYB=new Buf(),BRASS=new Buf();
let litPanes=0;
function dress(e){
  const b=e.b,cls=CLASS[b.kind]||'civic';const P=e.pts;if(P.length<60)return;
  if(cls==='sacred'||cls==='observatory'||cls==='ruin'||b.kind==='round')return;   /* unique shapes: the chapels, the post office, the observatory, the ruin */
  /* the ground under the building (b.base is a foundation offset, not a height) */
  let base=0;try{base=groundH(b.x+b.w/2,b.y+b.h/2);}catch(err){}
  {const ys=[];for(let i=0;i<P.length;i+=7)ys.push(P[i+1]);if(ys.length)base=Math.max(base,pct(ys,0.02));}
  const roofPts=[],wallPts=[],panes=[],woods=[],bricksHigh=[];
  const wallHex=b.col,roofHex=b.roof;
  let wx0=1e9,wx1=-1e9,wz0=1e9,wz1=-1e9;
  for(let i=0;i<P.length;i+=7){const x=P[i],y=P[i+1],z=P[i+2],mid=P[i+3],r=P[i+4],g=P[i+5],bl=P[i+6];
    const q=[x,y,z];
    if((mid===MID.slate||mid===MID.metal||near(r,g,bl,roofHex,0.07))&&!near(r,g,bl,wallHex,0.10)&&y>base+1.2)roofPts.push(q);
    else if(near(r,g,bl,wallHex,0.16)||mid===MID.brick||mid===MID.plaster||mid===MID.stone){wallPts.push(q);if(y>base+0.4&&y<base+1.6){if(x<wx0)wx0=x;if(x>wx1)wx1=x;if(z<wz0)wz0=z;if(z>wz1)wz1=z;}}
    if(mid===MID.glass)panes.push(q);
    if(mid===MID.wood)woods.push(q);
  }
  wx0=b.x;wx1=b.x+b.w;wz0=b.y;wz1=b.y+b.h;   /* every bespoke model fills its footprint */
  const cx=(wx0+wx1)/2,cz=(wz0+wz1)/2;
  /* the roof: eave height, ridge, which sides carry an eave */
  const ry=roofPts.map(q=>q[1]);const ridgeY=pct(ry,0.995);
  /* the wall top on each side: the eave sides are the lowest tops (gable ends rise higher);
     wall points are anything wall-coloured or brick/plaster/stone below the ridge */
  const wallAll=[];for(let i=0;i<P.length;i+=7){const y=P[i+1];if(y>base+0.3&&y<ridgeY+0.5&&(near(P[i+4],P[i+5],P[i+6],wallHex,0.2)||P[i+3]===MID.brick||P[i+3]===MID.plaster||P[i+3]===MID.stone))wallAll.push([P[i],y,P[i+2]]);}
  const sideTop=(sel)=>{const ys=wallAll.filter(sel).map(q=>q[1]);return ys.length>=12?pct(ys,0.93):null;};
  const tops={z0:sideTop(q=>Math.abs(q[2]-wz0)<0.45),z1:sideTop(q=>Math.abs(q[2]-wz1)<0.45),x0:sideTop(q=>Math.abs(q[0]-wx0)<0.45),x1:sideTop(q=>Math.abs(q[0]-wx1)<0.45)};
  const topVals=Object.values(tops).filter(v=>v!==null);
  let eaveY=topVals.length?Math.min(...topVals):pct(ry,0.06);
  const pitched=roofPts.length>40&&(ridgeY-eaveY)>0.4;
  const eaveSides=[];   /* [axis,'x'|'z', coordinate of the side, direction sign, from, to] */
  if(pitched){
    if(tops.z0!==null&&tops.z0<eaveY+0.45)eaveSides.push(['z',wz0,-1,wx0,wx1]);if(tops.z1!==null&&tops.z1<eaveY+0.45)eaveSides.push(['z',wz1,1,wx0,wx1]);
    if(tops.x0!==null&&tops.x0<eaveY+0.45)eaveSides.push(['x',wx0,-1,wz0,wz1]);if(tops.x1!==null&&tops.x1<eaveY+0.45)eaveSides.push(['x',wx1,1,wz0,wz1]);
  }
  e.tops=tops;
  e.info={tops:JSON.stringify(e.tops),roofN:roofPts.length,wallN:wallPts.length,paneN:panes.length,woodN:woods.length,eaveY:+(eaveY-base).toFixed(2),ridgeY:+(ridgeY-base).toFixed(2),pitched,eaveSides:eaveSides.map(s=>s[0]+(s[2]>0?'+':'-')),wall:[+wx0.toFixed(1),+wx1.toFixed(1),+wz0.toFixed(1),+wz1.toFixed(1)]};
  const lead=0x33363b;
  const stone=isLight(wallHex)?mixHex(wallHex,0xb8b2a4,0.5):0xb9ad98;
  const dark=isLight(wallHex)?0x8a857a:shade(wallHex,0.6);
  /* (gutters, downpipes and water butts were tried and cut: they read as clutter on these models) */
  /* the ridge cap */
  if(pitched){const top=roofPts.filter(q=>q[1]>ridgeY-0.14);let tx0=1e9,tx1=-1e9,tz0=1e9,tz1=-1e9;for(const q of top){if(q[0]<tx0)tx0=q[0];if(q[0]>tx1)tx1=q[0];if(q[2]<tz0)tz0=q[2];if(q[2]>tz1)tz1=q[2];}
    const lx=tx1-tx0,lz=tz1-tz0;const cap=shade(roofHex,0.72);
    if(lx>lz+0.8&&lz<1.2)put(OPQ,new THREE.CylinderGeometry(0.075,0.075,lx+0.12,8),T((tx0+tx1)/2,ridgeY+0.01,(tz0+tz1)/2,0,0,Math.PI/2),cap);
    else if(lz>lx+0.8&&lx<1.2)put(OPQ,new THREE.CylinderGeometry(0.075,0.075,lz+0.12,8),T((tx0+tx1)/2,ridgeY+0.01,(tz0+tz1)/2,0,Math.PI/2,0),cap);}
  /* (chimney caps and pots were tried and cut) */
  /* panes: a sill and a lintel each, a rain streak under the sill, a warm glow on some at dusk */
  const paneCl=clusters(panes,0.3).filter(c=>c.h>0.25&&c.h<3.2&&Math.max(c.w,c.d)>0.2&&Math.max(c.w,c.d)<3.4&&Math.min(c.w,c.d)<0.9);e.info.panes=paneCl.length;
  let pi=0;
  for(const c of paneCl){
    if(pitched&&c.y0>eaveY-0.2)continue;   /* dormers and gable lights keep their own frames */
    const ax=c.w<c.d?'x':'z';   /* thin axis = the wall's normal */
    const sg=ax==='x'?(c.cx>cx?1:-1):(c.cz>cz?1:-1);
    const width=ax==='x'?c.d:c.w;let face=ax==='x'?(sg>0?c.x1:c.x0):(sg>0?c.z1:c.z0);
    const edge=ax==='x'?(sg>0?wx1:wx0):(sg>0?wz1:wz0);
    if(Math.abs(edge-face)<0.6)face=edge+sg*0.08;   /* on the wall: clear of the frame */
    const ox=ax==='x'?face+sg*0.06:c.cx,oz=ax==='x'?c.cz:face+sg*0.06;const ry=ax==='x'?Math.PI/2:0;
    put(OPQ,box(width+0.16,0.06,0.14),T(ox,c.y0-0.035,oz,ry),stone);
    put(OPQ,box(width+0.10,0.05,0.10),T(ox-(ax==='x'?sg*0.02:0),c.y1+0.03,oz-(ax==='x'?0:sg*0.02),ry),stone);
    /* the streak: a quad on the wall under the sill */
    const sx=ax==='x'?face+sg*0.012:c.cx,sz=ax==='x'?c.cz:face+sg*0.012;
    put(DECAL,new THREE.PlaneGeometry(width*0.9,0.55),T(sx,c.y0-0.36,sz,ax==='x'?(sg>0?Math.PI/2:-Math.PI/2):(sg>0?0:Math.PI)),0xffffff);
    /* a warm glow on a third of the panes of anywhere people live or work */
    if((cls==='dorm'||cls==='house'||cls==='civic')&&(pi%3===0)){put(GLOW,new THREE.PlaneGeometry(width*0.9,c.h*0.9),T(sx,c.cy,sz,ax==='x'?(sg>0?Math.PI/2:-Math.PI/2):(sg>0?0:Math.PI)),0xffffff);litPanes++;}
    pi++;
  }
  /* doors: wood at ground level on the perimeter */
  const doorCl=clusters(woods,0.3).filter(c=>c.y0<base+0.6&&c.h>0.85&&c.h<2.8&&Math.max(c.w,c.d)>0.5&&Math.max(c.w,c.d)<1.8&&Math.min(c.w,c.d)<0.5);
  let door=null;e.info.doors=doorCl.length;
  for(const c of doorCl){
    const ax=c.w<c.d?'x':'z';const sg=ax==='x'?(c.cx>cx?1:-1):(c.cz>cz?1:-1);const width=ax==='x'?c.d:c.w;
    let face=ax==='x'?(sg>0?c.x1:c.x0):(sg>0?c.z1:c.z0);const edge=ax==='x'?(sg>0?wx1:wx0):(sg>0?wz1:wz0);if(Math.abs(edge-face)<0.6)face=edge+sg*0.02;const ry=ax==='x'?Math.PI/2:0;
    const ox=ax==='x'?face+sg*0.22:c.cx,oz=ax==='x'?c.cz:face+sg*0.22;
    put(OPQ,box(width+0.36,0.07,0.5),T(ox,base+0.035,oz,ry),0x8f877a);   /* the threshold */
    /* panels in relief and a brass knob */
    const fx=ax==='x'?face+sg*0.014:c.cx,fz=ax==='x'?c.cz:face+sg*0.014;
    for(const [u,v] of [[-0.25,0.28],[0.25,0.28],[-0.25,-0.22],[0.25,-0.22]]){const px=ax==='x'?fx:fx+u*width,pz=ax==='x'?fz+u*width:fz;put(OPQ,box(width*0.34,c.h*0.3,0.02),T(px,c.cy+v*c.h,pz,ry),shade(0x3a2c1e,0.8));}
    const kx=ax==='x'?fx+sg*0.03:fx+0.32*width,kz=ax==='x'?fz+0.32*width:fz+sg*0.03;put(BRASS,new THREE.SphereGeometry(0.032,8,6),T(kx,base+1.0,kz),0xc9a23d);
    if(!door)door={ax,sg,face,cx:c.cx,cz:c.cz,width};
  }
  /* the damp line round the plinth */
  for(const s of [['z',wz0,-1,wx0,wx1],['z',wz1,1,wx0,wx1],['x',wx0,-1,wz0,wz1],['x',wx1,1,wz0,wz1]]){const [ax,c,sg,f0,f1]=s;
    const g=new THREE.PlaneGeometry(f1-f0,0.38);const px=ax==='z'?(f0+f1)/2:c+sg*0.015,pz=ax==='z'?c+sg*0.015:(f0+f1)/2;
    put(DECAL,g,T(px,base+0.19,pz,ax==='z'?(sg>0?0:Math.PI):(sg>0?Math.PI/2:-Math.PI/2)),0xffffff);}
  /* weeds and leaves at the foot of the walls */
  let sd=(b.x*31+b.y*7)|0;const R=()=>{sd=sd+0x6D2B79F5|0;let t=Math.imul(sd^sd>>>15,1|sd);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
  const gAt=(x,z)=>{try{return groundH(x,z);}catch(err){return base;}};
  const nW=cls==='civic'?6:10;
  for(let i=0;i<nW;i++){const side=Math.floor(R()*4);const t=R();const px=side<2?wx0+t*(wx1-wx0):(side===2?wx0-0.25:wx1+0.25),pz=side<2?(side===0?wz0-0.25:wz1+0.25):wz0+t*(wz1-wz0);
    const gy=gAt(px,pz);put(OPQ,new THREE.ConeGeometry(0.08+R()*0.05,0.07+R()*0.06,5),T(px,gy+0.035,pz,R()*6.28,(R()-0.5)*0.9,(R()-0.5)*0.9),mixHex(0x1c2e16,0x2e4a1c,R()));
    if(R()<0.6){const lx=px+(R()-0.5)*0.4,lz=pz+(R()-0.5)*0.4;put(OPQ,new THREE.PlaneGeometry(0.11,0.08),T(lx,gAt(lx,lz)+0.012,lz,R()*6.28,-Math.PI/2),mixHex(0x7a4a22,0xa87a3a,R()));}}
  /* ivy on the old brick: a strip of leaves climbing a corner */
  if(IVY.has(b.kind)){const corners=[[wx0,wz0,1,1],[wx1,wz1,-1,-1]];
    for(const [kx,kz,dx,dz] of corners){const top=Math.max(base+1.5,eaveY-0.5);let y=base+0.15;
      while(y<top){for(const along of [0,1]){const off=R()*1.1;const px=along?kx+dx*0.03:kx+dx*off,pz=along?kz+dz*off:kz+dz*0.03;const ry=along?(dx>0?-Math.PI/2:Math.PI/2):(dz>0?Math.PI:0);
        const g=new THREE.PlaneGeometry(0.34,0.34);put(IVYB,g,T(px,y+R()*0.2,pz,ry+(R()-0.5)*0.6,(R()-0.5)*0.5,(R()-0.5)*0.8),mixHex(0x2a5a22,0x4a7a2a,R()));}
        y+=0.26;}}}
  /* props by class */
  if(door){const {ax,sg,face,cx:dx,cz:dz,width}=door;
    const along=(t)=>ax==='x'?[face+sg*0.9,dz+t]:[dx+t,face+sg*0.9];const ry=ax==='x'?Math.PI/2:0;
    if(cls==='dorm'||cls==='civic'){const [px,pz]=along(-(width/2+1.4));const g0=gAt(px,pz);   /* a bench left of the door */
      put(OPQ,box(1.3,0.06,0.4),T(px,g0+0.46,pz,ry),0x5a4030);put(OPQ,box(1.3,0.3,0.05),T(px+(ax==='x'?sg*0.2:0),g0+0.68,pz+(ax==='x'?0:sg*0.2),ry),0x5a4030);
      for(const u of [-0.55,0.55]){const [lx,lz]=along(-(width/2+1.4)+u);put(OPQ,box(0.06,0.44,0.36),T(lx,g0+0.22,lz,ry),0x3a3a3e);}}
    if(cls==='dorm'&&b.kind!=='pratt'){const [px,pz]=along(width/2+1.6);const g0=gAt(px,pz);   /* a bike rack right of the door */
      put(OPQ,box(1.4,0.05,0.12),T(px,g0+0.05,pz,ry),0x5a5e63);for(let k=0;k<4;k++){const [hx,hz]=along(width/2+1.6+(k-1.5)*0.35);put(OPQ,new THREE.TorusGeometry(0.22,0.018,6,16,Math.PI),T(hx,g0+0.06,hz,ry,0,0),0x7a7e83);}}
    if(cls==='house'||cls==='farm'){const [px,pz]=along(width/2+1.5);const g0=gAt(px,pz);   /* firewood stacked by the wall */
      for(let r=0;r<3;r++)for(let k=0;k<4;k++){const [lx,lz]=along(width/2+1.5+(k-1.5)*0.16);put(OPQ,new THREE.CylinderGeometry(0.07,0.07,0.5,7),T(lx,g0+0.08+r*0.14,lz,0,ax==='x'?0:Math.PI/2,ax==='x'?Math.PI/2:0),mixHex(0x6a4a2a,0x8a6a3a,R()));}}
  }
  if(cls==='boathouse'){const px=wx0-0.6,pz=(wz0+wz1)/2;const g0=gAt(px,pz);put(OPQ,new THREE.TorusGeometry(0.3,0.05,8,20),T(px,g0+0.05,pz,0,Math.PI/2),0x3a6a3a);for(let k=0;k<2;k++)put(OPQ,box(0.06,2.2,0.12),T(wx0-0.1,g0+1.1,pz+0.4+k*0.25,0,0,0.12),0x8a6a3a);}
  if(b.kind==='barn'||b.kind==='whitefarm'){
    /* the vane stands on the roof surface itself: the highest roof point near the centre line */
    let top=-1e9,vx=cx,vz=cz;for(const q of roofPts){if(Math.abs(q[0]-cx)<0.5&&Math.abs(q[2]-cz)<0.5&&q[1]>top){top=q[1];}}if(top<-1e8){top=ridgeY;}
    put(OPQ,new THREE.CylinderGeometry(0.02,0.02,0.9,6),T(vx,top+0.45,vz),0x3a3a3e);put(OPQ,box(0.5,0.02,0.02),T(vx,top+0.55,vz),0x3a3a3e);put(OPQ,box(0.02,0.02,0.5),T(vx,top+0.55,vz),0x3a3a3e);
    put(OPQ,new THREE.ConeGeometry(0.05,0.32,4),T(vx+0.2,top+0.8,vz,0,0,-Math.PI/2),0x3a3a3e);put(OPQ,box(0.22,0.14,0.02),T(vx-0.15,top+0.8,vz),0x3a3a3e);}
}

/* ------------------------------ assembly --------------------------------- */
function finish(){
  const mk=(B,mat,name)=>{if(!B.pos.length)return null;const g=toGeo(B);const m=new THREE.Mesh(g,mat);m.name=name;if(HD.world==='classic')m.visible=false;m.castShadow=mat.transparent?false:true;m.receiveShadow=!mat.transparent;m.frustumCulled=false;m.userData.hdNoAO=!!mat.transparent;worldGroup.add(m);return m;};
  const opq=new THREE.MeshStandardMaterial({vertexColors:true,roughness:0.72,metalness:0.06});opq.userData.hdMid=0;
  mk(OPQ,opq,'hdBuildingDetail');
  mk(BRASS,new THREE.MeshStandardMaterial({vertexColors:true,roughness:0.28,metalness:0.85}),'hdBuildingBrass');
  const dec=new THREE.MeshBasicMaterial({map:streakTex(),transparent:true,depthWrite:false,opacity:0.85,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
  mk(DECAL,dec,'hdBuildingDecal');
  const glowMat=new THREE.MeshBasicMaterial({map:glowTex(),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,opacity:0});
  const glow=mk(GLOW,glowMat,'hdBuildingGlow');
  const ivyMat=HD.foliageMat?HD.foliageMat('leaf'):new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide});
  const ivy=mk(IVYB,ivyMat,'hdBuildingIvy');if(ivy&&HD.foliageDepth)ivy.customDepthMaterial=HD.foliageDepth('leaf');
  /* the windows light as the sun goes down */
  HD.tick=HD.tick||[];
  HD.tick.push(function(now){if(!glow)return;const y=HD.sunDir?HD.sunDir.y:1;const lit=Math.min(1,Math.max(0,(0.32-y)/0.22));glowMat.opacity=0.85*lit;glow.visible=HD.world!=='classic'&&lit>0.01;});
  console.log('[HD] buildings dressed:',BUILDINGS.length,'lit panes',litPanes);
}
const list=survey();
for(const e of list)HD.defer(()=>{try{dress(e);}catch(err){console.warn('[HD] building',e.b.name,err);}});
HD.defer(finish);HD.buildingInfo=()=>list.map(e=>[e.b.name,e.b.kind,e.pts.length/7|0,e.info||null]);
})();
