/* ============================================================================
   Milville HD — foliage.  Loaded after hd-post.js.

   The game draws every campus tree as a trunk with 6-7 faceted icosahedron
   blobs, and the forest border as thousands of five-sided cones baked into one
   mesh. This file replaces both with leaf-card foliage: alpha-tested cards
   carrying a procedural leaf-cluster texture, lit with a canopy-shaped normal
   so the tree reads as one soft volume, swaying in a vertex-shader wind.

     * campus trees (tree / oak / willow / birch): the game's `fol` group is
       emptied and refilled, so woodcutting (which hides `fol` and `trunk` and
       shows `stump`) and the existing sway still work untouched.
     * the forest border: the baked cone mesh is hidden and rebuilt as chunked
       InstancedMeshes (conifers, deciduous, snow pines, dead wilderness trees),
       one draw call per 32x32-tile chunk so frustum culling still applies.
       recolorTrees() (autumn) is wrapped so the rebuild follows it.
     * grass: instanced tufts on every grass tile, dissolving past 45 units.

   Gameplay is untouched: nothing here reads or writes game state.
   ========================================================================== */
(function(){
'use strict';
try{performance.mark('hd:hd-foliage');}catch(e){}
const HD=window.HD;
if(!HD||!HD.ready)return;
if(typeof objects==='undefined'||typeof worldGroup==='undefined')return;

const TREE_DEFS={tree:1,oak:1,willow:1,birch:1};
HD.tick=HD.tick||[];
const windUniforms=[];

/* ------------------------------ textures ------------------------------- */
function rnd(seed){let s=seed|0;return function(){s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function leafTexture(kind,opt){
  const S=256,c=document.createElement('canvas');c.width=c.height=S;const g=c.getContext('2d');
  const R=rnd(kind.length*977+5);
  g.clearRect(0,0,S,S);
  if(kind==='needle'){
    /* a frond: fine needles fanning off a spine, dark to light front-to-back */
    g.translate(S/2,S*0.96);
    for(let i=0;i<170;i++){
      const t=R(),len=26+R()*34,ang=(R()-0.5)*1.9,y=-t*S*0.9;
      const l=34+R()*30;
      g.strokeStyle='hsl('+(108+R()*18)+','+(40+R()*20)+'%,'+l+'%)';
      g.lineWidth=1.4+R()*1.6;
      g.beginPath();g.moveTo((R()-0.5)*18*(1-t),y);g.lineTo(Math.sin(ang)*len*(1-t*0.55),y-Math.cos(ang)*len*0.5);g.stroke();
    }
  }else if(kind==='flower'){
    /* a wildflower tuft: a few slim stems from a small clump, each ending in a bloom of five
       petals around a heart; white, yellow, lilac */
    g.translate(S/2,S);
    for(let i=0;i<14;i++){const h=S*(0.25+R()*0.3),w=5+R()*4,lean=(R()-0.5)*S*0.6;const grad=g.createLinearGradient(0,0,0,-h);grad.addColorStop(0,'hsla(100,34%,34%,0.85)');grad.addColorStop(1,'hsla(92,40%,50%,0.0)');g.fillStyle=grad;g.beginPath();g.moveTo(-w/2,0);g.quadraticCurveTo(lean*0.5,-h*0.5,lean,-h);g.quadraticCurveTo(lean*0.5+w*0.4,-h*0.5,w/2,0);g.closePath();g.fill();}
    const cols=[['#f4f1e6','#e9c94a'],['#f0d64a','#c98a2a'],['#c9a6e8','#8b5fc4'],['#f4f1e6','#e9c94a'],['#f2b8c8','#c2607c']];
    for(let i=0;i<7;i++){const x=(R()-0.5)*S*0.7,y=-S*(0.42+R()*0.45),rr=S*0.035+R()*S*0.02;const c=cols[(R()*cols.length)|0];
      g.strokeStyle='hsla(100,30%,32%,0.9)';g.lineWidth=1.6;g.beginPath();g.moveTo(x*0.4,0);g.quadraticCurveTo(x*0.7,y*0.55,x,y);g.stroke();
      g.fillStyle=c[0];for(let p=0;p<5;p++){const a=p/5*Math.PI*2+R()*0.4;g.beginPath();g.ellipse(x+Math.cos(a)*rr*0.8,y+Math.sin(a)*rr*0.8,rr*0.55,rr*0.4,a,0,Math.PI*2);g.fill();}
      g.fillStyle=c[1];g.beginPath();g.arc(x,y,rr*0.32,0,Math.PI*2);g.fill();}
  }else if(kind==='grass'){
    /* a soft clump: many fine blades from a dark root, lighter and thinner toward the tips */
    g.translate(S/2,S);
    /* RS3's tufts are soft: fewer, broader blades, low contrast, tips that fade out */
    for(let i=0;i<30;i++){
      const h=S*(0.35+R()*0.5),w=7+R()*7,lean=(R()-0.5)*S*0.8,bend=(R()-0.5)*40;
      const l=40+R()*12;
      const grad=g.createLinearGradient(0,0,0,-h);grad.addColorStop(0,'hsla('+(96+R()*14)+',36%,'+(l-6)+'%,0.85)');grad.addColorStop(0.7,'hsla('+(90+R()*16)+',42%,'+(l+4)+'%,0.8)');grad.addColorStop(1,'hsla('+(84+R()*20)+',46%,'+(l+12)+'%,0.0)');
      g.fillStyle=grad;
      g.beginPath();g.moveTo(-w/2,0);g.quadraticCurveTo(bend,-h*0.5,lean,-h);g.quadraticCurveTo(bend+w*0.4,-h*0.5,w/2,0);g.closePath();g.fill();
    }
  }else{
    if(kind==='willow'){
      /* a curtain of strands hanging from the top edge (v=1 is the top of a card), each a
         thin drooping stem with willow leaves ticked along it, ending at its own height so the
         bottom of the curtain is ragged; the sides feather out so cards do not read as slabs */
      for(let i=0;i<110;i++){
        const x=R()*S,len=S*(0.45+R()*0.55),sway=(R()-0.5)*S*0.12;
        const l=30+R()*22,hue=72+R()*20,sat=38+R()*20;
        g.strokeStyle='hsl('+hue+','+(sat-10)+'%,'+(l-10)+'%)';g.lineWidth=1.4+R()*0.8;
        g.beginPath();g.moveTo(x,0);g.quadraticCurveTo(x+sway,len*0.5,x+sway*1.6,len);g.stroke();
        const nl=Math.floor(len/7);
        for(let k=1;k<nl;k++){
          const tt=k/nl;const px=x+sway*(2*tt-tt*tt)*0.8+(k%2?4:-4),py=tt*len;
          g.save();g.translate(px,py);g.rotate((k%2?-1:1)*0.55+(R()-0.5)*0.4);
          g.fillStyle='hsl('+(hue+R()*10-5)+','+sat+'%,'+(l+tt*6+R()*4)+'%)';
          g.beginPath();g.ellipse(0,0,1.2+R()*0.6,4.5+R()*3,0,0,Math.PI*2);g.fill();g.restore();
        }
      }
      /* feather the sides and the very bottom */
      g.globalCompositeOperation='destination-in';
      const gx=g.createLinearGradient(0,0,S,0);gx.addColorStop(0,'rgba(0,0,0,0)');gx.addColorStop(0.18,'rgba(0,0,0,1)');gx.addColorStop(0.82,'rgba(0,0,0,1)');gx.addColorStop(1,'rgba(0,0,0,0)');
      g.fillStyle=gx;g.fillRect(0,0,S,S);
      const gy=g.createLinearGradient(0,0,0,S);gy.addColorStop(0,'rgba(0,0,0,1)');gy.addColorStop(0.85,'rgba(0,0,0,1)');gy.addColorStop(1,'rgba(0,0,0,0)');
      g.fillStyle=gy;g.fillRect(0,0,S,S);
      g.globalCompositeOperation='source-over';
      const t=new THREE.CanvasTexture(c);t.anisotropy=8;t.encoding=THREE.sRGBEncoding;return t;
    }
    /* leaf cluster: dozens of rotated ellipses with a vein, denser at the middle */
    const n=kind==='birch'?95:80;
    let hue=kind==='birch'?92:kind==='willow'?86:kind==='oak'?104:100;const satK=(opt&&opt.sat)||1,litK=(opt&&opt.light)||1;if(opt&&opt.hue!==undefined)hue=opt.hue;
    for(let i=0;i<n;i++){
      const a=R()*Math.PI*2,r=Math.sqrt(R())*S*0.42;
      const x=S/2+Math.cos(a)*r,y=S/2+Math.sin(a)*r;
      const sz=kind==='birch'?7+R()*8:kind==='willow'?6+R()*6:9+R()*11;
      const rot=R()*Math.PI*2,depth=i/n;
      const l=Math.min(96,(26+depth*22+R()*10)*litK),s=Math.min(100,(42+R()*20)*satK);
      g.save();g.translate(x,y);g.rotate(rot);
      g.fillStyle='hsl('+(hue+R()*16-8)+','+s+'%,'+l+'%)';
      g.beginPath();g.ellipse(0,0,sz*(kind==='willow'?0.35:0.55),sz,0,0,Math.PI*2);g.fill();
      g.strokeStyle='hsla('+hue+',40%,'+(l-14)+'%,0.55)';g.lineWidth=1;
      g.beginPath();g.moveTo(0,-sz);g.lineTo(0,sz);g.stroke();
      g.restore();
    }
  }
  const t=new THREE.CanvasTexture(c);t.anisotropy=8;t.encoding=THREE.sRGBEncoding;
  return t;
}
const TEX={leaf:leafTexture('leaf'),oak:leafTexture('oak'),birch:leafTexture('birch'),willow:leafTexture('willow'),needle:leafTexture('needle'),grass:leafTexture('grass'),flower:leafTexture('flower')};
/* the same leaf shapes painted for autumn (a warm orange base the tint turns gold, orange or red) and winter (snow) */
for(const k of ['leaf','oak','birch','willow']){TEX[k+'_fall']=leafTexture(k,{hue:30,sat:1.35,light:1.25});TEX[k+'_winter']=leafTexture(k,{hue:212,sat:0.14,light:1.9});}

/* ------------------------------ materials ------------------------------ */
const WIND_VERT=`
#include <begin_vertex>
{
  vec4 hdWp=modelMatrix*vec4(transformed,1.0);
  #ifdef USE_INSTANCING
    hdWp=modelMatrix*instanceMatrix*vec4(transformed,1.0);
  #endif
  vHDDist=distance(hdWp.xyz,cameraPosition);
  float ph=hdWp.x*0.35+hdWp.z*0.27;
  float sw=sin(uTime*1.3+ph)*0.6+sin(uTime*2.9+ph*1.7)*0.4;
  float k=uv.y*uWind;
  transformed.x+=sw*k;
  transformed.z+=cos(uTime*1.1+ph)*k*0.5;
}`;
function foliageMaterial(tex,o){
  o=o||{};
  const m=new HD.Standard({map:tex,alphaTest:0.42,side:THREE.FrontSide,roughness:0.92,metalness:0,vertexColors:true,envMapIntensity:HD.envIntensity});
  m.onBeforeCompile=function(sh){
    sh.uniforms.uTime={value:0};sh.uniforms.uWind={value:o.wind||0.08};sh.uniforms.uFade={value:o.fade||0};
    windUniforms.push(sh.uniforms);
    sh.vertexShader=sh.vertexShader
      .replace('#include <common>','#include <common>\nuniform float uTime;uniform float uWind;varying float vHDDist;')
      .replace('#include <begin_vertex>',WIND_VERT);
    sh.fragmentShader=sh.fragmentShader
      .replace('#include <common>','#include <common>\nuniform float uFade;varying float vHDDist;')
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );','vec4 diffuseColor = vec4( pow(diffuse,vec3(2.2)), opacity );')
      .replace('#include <color_fragment>',`
#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
  diffuseColor.rgb*=pow(vColor.rgb,vec3(2.2));
#endif
if(uFade>0.0)diffuseColor.a*=1.0-smoothstep(uFade*0.82,uFade,vHDDist);`);
  };
  m.customProgramCacheKey=function(){return 'hdfol'+(o.fade?'f':'');};
  return m;
}
function depthMaterial(tex){
  return new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,map:tex,alphaTest:0.42,side:THREE.FrontSide});
}
const MAT={
  leaf:foliageMaterial(TEX.leaf,{wind:0.07}),oak:foliageMaterial(TEX.oak,{wind:0.06}),birch:foliageMaterial(TEX.birch,{wind:0.09}),willow:foliageMaterial(TEX.willow,{wind:0.12}),
  needle:foliageMaterial(TEX.needle,{wind:0.04}),grass:foliageMaterial(TEX.grass,{wind:0.1,fade:40}),flower:foliageMaterial(TEX.flower,{wind:0.08,fade:40})
};
MAT.bark=new THREE.MeshLambertMaterial({color:0xffffff,vertexColors:true});
HD.foliageMat=(k)=>MAT[k]||MAT.leaf;HD.foliageDepth=(k)=>DEPTH[k]||DEPTH.leaf;
for(const k of ['leaf','oak','birch','willow']){const w={leaf:0.07,oak:0.06,birch:0.09,willow:0.12}[k];MAT[k+'_fall']=foliageMaterial(TEX[k+'_fall'],{wind:w});MAT[k+'_winter']=foliageMaterial(TEX[k+'_winter'],{wind:w*0.5});}
function seasonMat(k){const sn=seasonOf();return (sn==='summer')?MAT[k]:(MAT[k+'_'+sn]||MAT[k]);}
const DEPTH={leaf:depthMaterial(TEX.leaf),oak:depthMaterial(TEX.oak),birch:depthMaterial(TEX.birch),willow:depthMaterial(TEX.willow),needle:depthMaterial(TEX.needle)};
/* the bark colours the game uses are brownish; the classifier reads them as wood, which is right */

/* --------------------------- geometry builders -------------------------- */
const _v=new THREE.Vector3(),_n=new THREE.Vector3(),_c=new THREE.Color();
/* Append one two-sided card (a quad drawn front and back with the SAME outward
   normal) to the buffers. centre c, half-extents (w,h), orientation from
   basis vectors u (across) and v (up). */
function card(buf,cx,cy,cz,ux,uy,uz,vx,vy,vz,w,h,nx,ny,nz,r,g,b,flipU){
  const p=buf.pos,n=buf.nor,t=buf.uv,c=buf.col;
  const corners=[[-1,-1],[1,-1],[1,1],[-1,1]];
  const base=p.length/3;
  for(const [s,q] of corners){
    p.push(cx+ux*w*s+vx*h*q,cy+uy*w*s+vy*h*q,cz+uz*w*s+vz*h*q);
    n.push(nx,ny,nz);
    t.push(flipU?(1-(s+1)/2):(s+1)/2,(q+1)/2);
    c.push(r,g,b);
  }
  buf.idx.push(base,base+1,base+2,base,base+2,base+3, base,base+2,base+1,base,base+3,base+2);
}
function toGeometry(buf,mid){
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(buf.pos,3));
  g.setAttribute('normal',new THREE.Float32BufferAttribute(buf.nor,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(buf.uv,2));
  g.setAttribute('color',new THREE.Float32BufferAttribute(buf.col,3));
  /* a vertex-coloured material reads its detail layer from 'mid'; bark wants wood (5) */
  if(mid!==undefined)g.setAttribute('mid',new THREE.Float32BufferAttribute(new Float32Array(buf.pos.length/3).fill(mid),1));
  g.setIndex(buf.idx);
  g.computeBoundingSphere();
  return g;
}
function newBuf(){return {pos:[],nor:[],uv:[],col:[],idx:[]};}

/* deciduous canopy: cards scattered through an ellipsoid, facing outward with
   jitter; normal = outward blended with up so the crown lights like a dome */
function canopy(buf,kind,seed,cx,cy,cz,rad,ry,tint){
  const R=rnd(seed);
  const n=kind==='oak'?26:kind==='birch'?32:kind==='willow'?40:20;
  const cw=rad*(kind==='birch'?0.62:0.78);
  for(let i=0;i<n;i++){
    const th=R()*Math.PI*2,ph=Math.acos(1-2*R()),rr=rad*(0.25+0.75*Math.cbrt(R()));
    const ox=Math.cos(th)*Math.sin(ph)*rr,oy=Math.cos(ph)*rr*ry,oz=Math.sin(th)*Math.sin(ph)*rr;
    _n.set(ox,oy*0.8+rad*0.35,oz).normalize();
    /* card basis: face outward-ish, random roll */
    const fx=_n.x+(R()-0.5)*0.9,fy=_n.y+(R()-0.5)*0.9,fz=_n.z+(R()-0.5)*0.9;
    _v.set(fx,fy,fz).normalize();
    const up=Math.abs(_v.y)>0.9?new THREE.Vector3(1,0,0):new THREE.Vector3(0,1,0);
    const u=new THREE.Vector3().crossVectors(up,_v).normalize();
    const v=new THREE.Vector3().crossVectors(_v,u).normalize();
    const roll=R()*Math.PI*2,cr=Math.cos(roll),sr=Math.sin(roll);
    const ux=u.x*cr+v.x*sr,uy=u.y*cr+v.y*sr,uz=u.z*cr+v.z*sr;
    const vx=v.x*cr-u.x*sr,vy=v.y*cr-u.y*sr,vz=v.z*cr-u.z*sr;
    const depth=(oy/(rad*ry))*0.5+0.5;                 /* 0 bottom .. 1 top */
    const k=0.62+0.38*depth+(R()-0.5)*0.12;
    card(buf,cx+ox,cy+oy,cz+oz,ux,uy,uz,vx,vy,vz,cw,cw*0.95,_n.x,_n.y,_n.z,tint[0]*k,tint[1]*k,tint[2]*k,R()<0.5);
  }
}
/* willow, designed like a real weeping willow: the game's trunk stays in view, seven boughs
   rise and arch out of the crown, and the leaf curtains hang from the bough tips and along
   them, with daylight between the curtains. Returns the bough geometry buffer separately so it
   can take a bark material. */
function willowTree(buf,barkBuf,seed,cx,cy,cz,rad,tint,crownBuf){
  const R=rnd(seed);
  const boughs=[];
  for(let i=0;i<7;i++){
    const a=i/7*Math.PI*2+R()*0.5,el=0.55+R()*0.5,len=rad*(0.85+R()*0.35);
    const dx=Math.cos(a)*Math.cos(el),dy=Math.sin(el),dz=Math.sin(a)*Math.cos(el);
    /* two segments: rises, then arches over */
    const mx=cx+dx*len*0.55,my=cy+dy*len*0.55,mz=cz+dz*len*0.55;
    const ex=mx+Math.cos(a)*len*0.5,ey=my+dy*len*0.1-0.1,ez=mz+Math.sin(a)*len*0.5;
    const tilt1=Math.atan2(Math.hypot(dx,dz),dy);
    cylTo(barkBuf,cx,cy,cz,mx,my,mz,0.085,0.05,[0.33,0.26,0.17]);
    cylTo(barkBuf,mx,my,mz,ex,ey,ez,0.05,0.025,[0.35,0.28,0.18]);
    boughs.push([mx,my,mz,ex,ey,ez,a]);
  }
  for(const [mx,my,mz,ex,ey,ez,a] of boughs){
    /* curtains hang from four stations along the arch of every bough, each a crossed pair
       of wide cards, so the foliage is a continuous drape with the bough showing through
       only near the trunk */
    for(const t of [1.0]){
      const px=mx+(ex-mx)*t,py=my+(ey-my)*t,pz=mz+(ez-mz)*t;
      /* longer toward the tip; never lower than knee height so the trunk stays in view */
      const len=Math.min(py-0.45,rad*(0.7+R()*0.6)*(0.5+0.5*t));
      const wid=rad*(0.24+R()*0.12);
      for(let k=0;k<2;k++){
        const aa=a+(k?Math.PI/2:0)+(R()-0.5)*0.5;
        _n.set(Math.cos(a),0.35,Math.sin(a)).normalize();
        const ux=-Math.sin(aa),uz=Math.cos(aa);
        const k2=0.65+R()*0.35;
        card(buf,px+(R()-0.5)*0.1,py-len*0.5+0.06,pz+(R()-0.5)*0.1,ux,0,uz,Math.cos(a)*0.1,1,Math.sin(a)*0.1,wid,len*0.5,_n.x,_n.y,_n.z,tint[0]*k2,tint[1]*k2,tint[2]*k2,R()<0.5);
      }
    }
  }
  /* the crown the way a weeping willow actually carries it: a shaggy dome of strands
     hanging from every point of the upper hemisphere, short at the top and longest at the
     rim, over a small core of leaves that fills the gaps at the very top */
  canopy(crownBuf||buf,'birch',seed+21,cx,cy+rad*0.55,cz,rad*0.42,0.7,tint);
  const RC=rnd(seed+9);
  const NS=84,ga=Math.PI*(3-Math.sqrt(5));
  const domeR=rad*0.95,domeY=cy+rad*0.35;
  for(let i=0;i<NS;i++){
    const el=0.12+0.88*(i+0.5)/NS;              /* 0 rim .. 1 crown, weighted to the sides */
    const th=i*ga+RC()*0.3;
    const ph=Math.acos(el);                        /* polar angle from the zenith */
    const rr=domeR*Math.sin(ph),h=domeY+domeR*Math.cos(ph);
    const x=cx+Math.cos(th)*rr,z=cz+Math.sin(th)*rr;
    const len=Math.min(h-0.4,rad*(0.35+RC()*0.15)+rad*(1.0+RC()*0.3)*(1-el));
    /* face outward from the axis, with a random roll so the pairs cross */
    const ca=th+(RC()-0.5)*1.2;const ux=-Math.sin(ca),uz=Math.cos(ca);
    _n.set(Math.cos(th)*Math.sin(ph),Math.cos(ph)*0.8+0.3,Math.sin(th)*Math.sin(ph)).normalize();
    const k2=0.72+0.28*el+(RC()-0.5)*0.1;
    card(buf,x,h-len*0.5,z,ux,0,uz,Math.cos(th)*0.08,1,Math.sin(th)*0.08,rad*(0.2+RC()*0.08),len*0.5,_n.x,_n.y,_n.z,tint[0]*k2,tint[1]*k2,tint[2]*k2,RC()<0.5);
  }
}
/* a tapered cylinder between two points, appended with vertex colour (for bark meshes) */
function cylTo(buf,ax,ay,az,bx,by,bz,r0,r1,col){
  const dx=bx-ax,dy=by-ay,dz=bz-az,len=Math.hypot(dx,dy,dz);
  const geo=new THREE.CylinderGeometry(r1,r0,len,7,1);
  const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(dx,dy,dz).normalize());
  const m4=new THREE.Matrix4().compose(new THREE.Vector3((ax+bx)/2,(ay+by)/2,(az+bz)/2),q,new THREE.Vector3(1,1,1));
  geo.applyMatrix4(m4);
  const p=geo.attributes.position,n=geo.attributes.normal,uv=geo.attributes.uv,idx=geo.index;
  const base=buf.pos.length/3;
  for(let i=0;i<p.count;i++){buf.pos.push(p.getX(i),p.getY(i),p.getZ(i));buf.nor.push(n.getX(i),n.getY(i),n.getZ(i));buf.uv.push(uv.getX(i),uv.getY(i));buf.col.push(col[0],col[1],col[2]);}
  for(let i=0;i<idx.count;i++)buf.idx.push(base+idx.getX(i));
  geo.dispose();
}
/* (the old dense willow, kept for the forest 'leafy' variants) */
function willowCanopy(buf,seed,cx,cy,cz,rad,tint){
  canopy(buf,'willow',seed,cx,cy+rad*0.3,cz,rad*1.1,0.7,tint);
  canopy(buf,'willow',seed+3,cx,cy+rad*0.05,cz,rad*0.95,0.55,tint);
  canopy(buf,'willow',seed+9,cx,cy-rad*0.15,cz,rad*0.8,0.5,tint);
  const R=rnd(seed+77);
  for(let i=0;i<44;i++){
    const a=i/44*Math.PI*2+R()*0.3,rr=rad*(0.55+R()*0.6);
    const x=cx+Math.cos(a)*rr,z=cz+Math.sin(a)*rr;
    const len=rad*(1.3+R()*0.9);
    _n.set(Math.cos(a),0.35,Math.sin(a)).normalize();
    const ux=-Math.sin(a),uz=Math.cos(a);
    const k=0.55+R()*0.3;
    card(buf,x,cy-len*0.5+rad*0.1,z,ux,0,uz,0,1,0,rad*0.5,len*0.5,_n.x,_n.y,_n.z,tint[0]*k,tint[1]*k,tint[2]*k,R()<0.5);
  }
}
/* conifer: tiers of needle cards leaning outward, narrowing to the tip */
function conifer(buf,seed,cx,cy,cz,h,r,tint,snow){
  const R=rnd(seed);
  const tiers=4;
  for(let t=0;t<tiers;t++){
    const y0=cy+h*(0.22+t*0.19),tr=r*(1-t*0.2),count=t===tiers-1?5:7;
    for(let i=0;i<count;i++){
      const a=i/count*Math.PI*2+t*0.45+R()*0.5;
      const ox=Math.cos(a)*tr*0.5,oz=Math.sin(a)*tr*0.5;
      _n.set(Math.cos(a),0.55,Math.sin(a)).normalize();
      /* card leans out and down: v axis tilted from vertical */
      const lean=0.55;
      const vx=Math.cos(a)*lean,vy=1,vz=Math.sin(a)*lean;const vl=Math.hypot(vx,vy,vz);
      const ux=-Math.sin(a),uz=Math.cos(a);
      const ch=h*0.26,cw=tr*0.7;
      const k=(0.7+0.3*(t/tiers))*(0.85+R()*0.3);
      let cr=tint[0]*k,cg=tint[1]*k,cb=tint[2]*k;
      if(snow){const s=0.45+0.4*(t/tiers);cr=cr*(1-s)+0.93*s;cg=cg*(1-s)+0.95*s;cb=cb*(1-s)+0.98*s;}
      card(buf,cx+ox,y0,cz+oz,ux,0,uz,vx/vl,vy/vl,vz/vl,cw,ch,_n.x,_n.y,_n.z,cr,cg,cb,R()<0.5);
    }
  }
  /* tip */
  _n.set(0,1,0);
  const k=0.95;
  card(buf,cx,cy+h*0.98,cz,1,0,0,0,1,0,r*0.3,h*0.14,0,1,0,tint[0]*k,tint[1]*k,tint[2]*k,false);
  card(buf,cx,cy+h*0.98,cz,0,0,1,0,1,0,r*0.3,h*0.14,0,1,0,tint[0]*k,tint[1]*k,tint[2]*k,true);
}
/* A snow pine the way RS3 dresses Pat's Peak: a visible tapering trunk with stub branches
   (bark buffer), six drooping tiers of dark blue-green needle skirts, and on every tier a
   cap of snow cards lying almost flat, thickest at the top; the tip is a white spire. */
function snowPine(buf,barkBuf,seed,cx,cy,cz,h,r){
  const R=rnd(seed);
  const needle=[0.11,0.24,0.15],snow=[0.9,0.94,1.0];
  cylTo(barkBuf,cx,cy,cz,cx,cy+h*0.96,cz,r*0.12,r*0.03,[0.22,0.17,0.13]);
  const tiers=6;
  for(let t=0;t<tiers;t++){
    const f=t/(tiers-1);                          /* 0 bottom .. 1 top */
    const y0=cy+h*(0.2+f*0.7),tr=r*(1.05-f*0.75);
    const count=t<tiers-1?8:5;
    for(let i=0;i<count;i++){
      const a=i/count*Math.PI*2+t*0.5+R()*0.4;
      const ox=Math.cos(a)*tr*0.3,oz=Math.sin(a)*tr*0.3;
      /* a stub branch under the skirt */
      if(i%2===0)cylTo(barkBuf,cx,y0+h*0.02,cz,cx+Math.cos(a)*tr*0.7,y0-h*0.04,cz+Math.sin(a)*tr*0.7,r*0.03,r*0.008,[0.24,0.19,0.14]);
      /* needle skirt: card leaning well outward and down */
      _n.set(Math.cos(a),0.5,Math.sin(a)).normalize();
      const lean=1.1;const vx=Math.cos(a)*lean,vy=-1,vz=Math.sin(a)*lean;const vl=Math.hypot(vx,vy,vz);
      const ux=-Math.sin(a),uz=Math.cos(a);
      const cw=tr*0.62,ch=h*0.16;
      const k=0.8+R()*0.3;
      card(buf,cx+ox,y0,cz+oz,ux,0,uz,-vx/vl,-vy/vl,-vz/vl,cw,ch,_n.x,_n.y,_n.z,needle[0]*k,needle[1]*k,needle[2]*k,R()<0.5);
      /* the snow on top of it: nearly flat, a little smaller, sitting on the skirt */
      const sx=Math.cos(a)*0.92,sy=0.28+f*0.12,sz=Math.sin(a)*0.92;const sl=Math.hypot(sx,sy,sz);
      _n.set(Math.cos(a)*0.25,1,Math.sin(a)*0.25).normalize();
      const ks=0.9+R()*0.12;
      card(buf,cx+ox*1.1,y0+h*0.035,cz+oz*1.1,ux,0,uz,sx/sl,sy/sl,sz/sl,cw*0.9,ch*0.75,_n.x,_n.y,_n.z,snow[0]*ks,snow[1]*ks,snow[2]*ks,R()<0.5);
    }
  }
  /* the spire, snowed */
  _n.set(0,1,0);
  card(buf,cx,cy+h*0.94,cz,1,0,0,0,1,0,r*0.22,h*0.1,0,1,0,snow[0],snow[1],snow[2],false);
  card(buf,cx,cy+h*0.94,cz,0,0,1,0,1,0,r*0.22,h*0.1,0,1,0,snow[0],snow[1],snow[2],true);
}
/* solid trunk / branch cylinders appended as ordinary geometry (vertex coloured) */
function cyl(buf,rt,rb,h,x,y,z,tiltX,tiltZ,r,g,b,seg){
  const geo=new THREE.CylinderGeometry(rt,rb,h,seg||7,1);
  const e=new THREE.Euler(tiltX||0,0,tiltZ||0);
  const m4=new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromEuler(e),new THREE.Vector3(1,1,1));
  geo.applyMatrix4(m4);
  const p=geo.attributes.position,n=geo.attributes.normal,uv=geo.attributes.uv,idx=geo.index;
  const base=buf.pos.length/3;
  for(let i=0;i<p.count;i++){buf.pos.push(p.getX(i),p.getY(i),p.getZ(i));buf.nor.push(n.getX(i),n.getY(i),n.getZ(i));buf.uv.push(uv.getX(i)*0.02,uv.getY(i)*0.02);buf.col.push(r,g,b);}
  for(let i=0;i<idx.count;i++)buf.idx.push(base+idx.getX(i));
  geo.dispose();
}

/* ------------------------------ campus trees ---------------------------- */
const TINT={tree:[0.30,0.52,0.20],oak:[0.26,0.46,0.17],birch:[0.55,0.72,0.34],willow:[0.42,0.62,0.26]};
/* the season: summer green, an autumn of golds, oranges and reds mixed tree by tree, a
   winter of snow-dusted crowns. Read from the game's own flags. */
function seasonOf(){try{if(typeof player!=='undefined'&&player){if(player.winter)return 'winter';if(player.fall)return 'fall';}}catch(e){}return 'summer';}
const FALL_PAL=[[1.0,0.88,0.45],[1.0,0.72,0.38],[0.95,0.46,0.32],[0.88,0.92,0.50],[1.0,0.60,0.30],[0.98,0.80,0.40]];
const SNOW_TINT=[0.97,0.98,1.0];
function seasonTint(seed,base){const sn=seasonOf();if(sn==='summer')return base;if(sn==='winter')return SNOW_TINT;const r=((Math.abs(seed|0)*9301+49297)%233280)/233280;return FALL_PAL[Math.floor(r*FALL_PAL.length)];}
function dressTree(o){
  const m=o._m;if(!m||!m.fol||!TREE_DEFS[o.def])return;
  if(m.fol.userData.hd)return;
  const fol=m.fol;
  while(fol.children.length){const c=fol.children.pop();if(c.geometry&&c.geometry.dispose)c.geometry.dispose();}
  const def=o.def,seed=(o.x*131+o.y*17)|0;
  let trunkH=0.95;if(def==='oak')trunkH=1.1;if(def==='willow')trunkH=0.95;if(def==='birch')trunkH=1.5;
  const buf=newBuf();
  const tint=seasonTint(seed,TINT[def]||TINT.tree);
  if(def==='willow'){
    const bark=newBuf(),crown=newBuf();
    willowTree(buf,bark,seed,0,trunkH-0.05,0,1.05,tint,crown);
    const bm=new THREE.Mesh(toGeometry(bark,5),new THREE.MeshLambertMaterial({color:0x8a7250,vertexColors:true}));
    bm.castShadow=true;bm.receiveShadow=true;fol.add(bm);
    /* the dome takes the rounded-leaf texture; only the curtains use the strands */
    const cm=new THREE.Mesh(toGeometry(crown),seasonMat('leaf'));cm.castShadow=true;cm.receiveShadow=true;cm.customDepthMaterial=DEPTH.leaf;cm.userData.hdNoAO=1;fol.add(cm);
  }
  else if(def==='birch')canopy(buf,'birch',seed,0,trunkH+0.55,0,0.72,1.15,tint);
  else if(def==='oak')canopy(buf,'oak',seed,0,trunkH+0.75,0,1.05,0.85,tint);
  else canopy(buf,'tree',seed,0,trunkH+0.65,0,0.9,0.95,tint);
  const mesh=new THREE.Mesh(toGeometry(buf),seasonMat(def==='tree'?'leaf':def)||MAT.leaf);
  mesh.castShadow=true;mesh.receiveShadow=true;
  mesh.customDepthMaterial=DEPTH[def]||DEPTH.leaf;
  mesh.userData.hdNoAO=1;   /* alpha-tested cards would read as solid slabs in the AO depth pass */
  fol.add(mesh);
  fol.userData.hd=1;
}
HD.dressTree=dressTree;
for(const o of objects)dressTree(o);
/* a season change re-dresses every tree, rebuilds the forest, and hides the flowers under snow */
function reseason(){
  const sn=seasonOf();
  for(const o of objects){if(o._m&&o._m.fol&&TREE_DEFS[o.def]){o._m.fol.userData.hd=0;try{dressTree(o);}catch(e){}}}
  try{buildHDForest();}catch(e){console.warn('[HD] forest season',e);}
  if(MAT.flower)MAT.flower.visible=(sn==='summer');
  if(MAT.grass)MAT.grass.visible=(sn!=='winter');
}
HD.reseason=reseason;
if(typeof applyWinter==='function'){const _aw=applyWinter;applyWinter=function(){const r=_aw.apply(this,arguments);try{reseason();}catch(e){console.warn('[HD] season',e);}return r;};}
setTimeout(()=>{try{if(seasonOf()!=='summer')reseason();}catch(e){}},0);
if(typeof buildObjModel==='function'){
  const _b=buildObjModel;
  buildObjModel=function(o){const r=_b.apply(this,arguments);try{dressTree(o);}catch(e){console.warn('[HD] dressTree',e);}return r;};
}

/* ------------------------------ forest border --------------------------- */
const CH=32;
let forestMeshes=[];
function clearForest(){for(const m of forestMeshes){if(m.parent)m.parent.remove(m);m.geometry.dispose();}forestMeshes=[];}
/* A dead wilderness tree the way RS3 draws one: a leaning, tapering trunk built from short
   segments that wander, a handful of crooked limbs that fork into twigs and end in nothing.
   The asylum's 'twisted' kind is taller, darker and more contorted. Bark-coloured vertices;
   no leaf cards, so it takes the bark material, not the alpha-tested leaf one. */
function deadTree(buf,twisted){
  const R=rnd(twisted?911:433);
  const col=twisted?[0.17,0.145,0.13]:[0.25,0.21,0.17];
  const H0=twisted?3.3:2.3,segs=5;
  let x=0,y=0,z=0,dx=(R()-0.5)*0.12,dz=(R()-0.5)*0.12;
  let r=twisted?0.15:0.14;
  const limbs=[];
  for(let i=0;i<segs;i++){
    const t=(i+1)/segs;const r2=r*(1-t*0.75);
    const nx=x+dx*H0/segs+(R()-0.5)*0.12*(twisted?1.8:1),nz=z+dz*H0/segs+(R()-0.5)*0.12*(twisted?1.8:1),ny=y+H0/segs;
    cylTo(buf,x,y,z,nx,ny,nz,r,r2,col);
    if(i>=1)limbs.push([nx,ny,nz,r2]);
    x=nx;y=ny;z=nz;r=r2;dx+=(R()-0.5)*0.1;dz+=(R()-0.5)*0.1;
  }
  const nl=twisted?6:4;
  for(let k=0;k<nl;k++){
    const [bx,by,bz,br]=limbs[Math.min(limbs.length-1,Math.floor(R()*limbs.length))];
    const a=k/nl*Math.PI*2+R()*0.9,el=0.25+R()*0.6,len=(twisted?0.9:0.7)+R()*0.5;
    let px=bx,py=by,pz=bz,pr=br*0.7;
    let ux=Math.cos(a)*Math.cos(el),uy=Math.sin(el),uz=Math.sin(a)*Math.cos(el);
    for(let s=0;s<3;s++){
      const L=len/3;const qx=px+ux*L,qy=py+uy*L,qz=pz+uz*L;
      cylTo(buf,px,py,pz,qx,qy,qz,pr,pr*0.6,col);
      /* a twig off each joint */
      if(s>0){const ta=a+(R()-0.5)*2.2,te=el+(R()-0.5)*1.2,tl=0.25+R()*0.3;cylTo(buf,px,py,pz,px+Math.cos(ta)*Math.cos(te)*tl,py+Math.sin(te)*tl,pz+Math.sin(ta)*Math.cos(te)*tl,pr*0.55,0.008,col);}
      px=qx;py=qy;pz=qz;pr*=0.6;
      /* the limb bends: droops when dead, writhes when twisted */
      ux+=(R()-0.5)*0.5;uy+=twisted?(R()-0.5)*0.9:-0.35;uz+=(R()-0.5)*0.5;const l=Math.hypot(ux,uy,uz)||1;ux/=l;uy/=l;uz/=l;
    }
  }
}
/* one geometry per variant, instanced per chunk */
/* every variant is two geometries: bark (wood layer, opaque) and foliage (alpha cards), so
   trunks never wear the leaf texture */
function variantGeometry(kind,fall,tintOverride){
  const buf=newBuf(),bark=newBuf();
  if(kind==='conifer'){
    cylTo(bark,0,0,0,0,1.3,0,0.13,0.06,[0.30,0.22,0.15]);
    conifer(buf,7,0,0.55,0,2.4,0.95,[0.20,0.36,0.17],false);
  }else if(kind==='snow'){
    snowPine(buf,bark,11,0,0,0,3.1,1.05);
  }else if(kind==='leafy'){
    cylTo(bark,0,0,0,0,1.4,0,0.15,0.08,[0.31,0.22,0.14]);
    canopy(buf,'tree',31,0,1.85,0,0.95,0.9,tintOverride||(fall?[0.80,0.42,0.14]:[0.28,0.50,0.19]));
  }else if(kind==='leafy2'){
    cylTo(bark,0,0,0,0,1.7,0,0.14,0.07,[0.33,0.24,0.16]);
    canopy(buf,'oak',57,0,2.15,0,1.0,0.8,tintOverride||(fall?[0.72,0.28,0.12]:[0.25,0.44,0.16]));
  }else if(kind==='dead'||kind==='twisted'){
    deadTree(bark,kind==='twisted');
  }
  return {fol:buf.pos.length?toGeometry(buf):null,bark:bark.pos.length?toGeometry(bark,5):null};
}
let forestDirty=false,gameForestDirty=false;
function swappedGrid(){return (typeof curInterior==='function'&&!!curInterior())||(typeof TILES_MAIN!=='undefined'&&tiles!==TILES_MAIN);}
function buildHDForest(){
  /* the game swaps `tiles` to an interior's grid while you are inside (the volcano's grid has a
     forest ring of its own); a rebuild there would plant the surface forest from the wrong map
     and it would stay wrong until the next rebuild. Indoors, the rebuild waits for the surface. */
  if(typeof curInterior==='function'&&curInterior()){forestDirty=true;return;}
  if(typeof TILES_MAIN!=='undefined'&&tiles!==TILES_MAIN){forestDirty=true;return;}
  forestDirty=false;
  clearForest();
  const fall=(typeof _treeFall!=='undefined')&&_treeFall;
  /* out of summer the leafy crowns are built neutral and each tree takes its own colour: a
     mix of golds, oranges and reds in autumn, snow in winter */
  const sn=seasonOf(),neutral=sn!=='summer';const NT=[0.92,0.92,0.92];
  const geos={conifer:variantGeometry('conifer'),snow:variantGeometry('snow'),leafy:variantGeometry('leafy',fall,neutral?NT:null),leafy2:variantGeometry('leafy2',fall,neutral?NT:null),dead:variantGeometry('dead'),twisted:variantGeometry('twisted')};
  const mats={conifer:MAT.needle,snow:MAT.needle,leafy:seasonMat('leaf'),leafy2:seasonMat('oak')};
  const deps={conifer:DEPTH.needle,snow:DEPTH.needle,leafy:DEPTH.leaf,leafy2:DEPTH.oak};
  /* gather instances per chunk per variant */
  const chunks=new Map();
  const asylum=(typeof _asylumWoodTiles!=='undefined')?_asylumWoodTiles:null;
  const snowFn=(typeof inSnow==='function')?inSnow:null;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    if(tiles[y][x]!==T_FOREST)continue;
    const h1=tileHash(x*3+1,y*7+2),h2=tileHash(x*5+4,y*11+9),h3=tileHash(x*13+5,y*3+8);
    const wx=x+0.2+h2*0.6,wz=y+0.2+h3*0.6,gy=groundH(wx,wz);
    let kind,s=0.85+h3*0.55;
    if(asylum&&asylum.has(x+','+y)){kind='twisted';s=0.9+h1*0.5;}
    else if(snowFn&&snowFn(x,y))kind='snow';
    else if(inWild(x,y)){kind='dead';s=0.8+h1*0.6;}
    else kind=h1<0.62?'conifer':(h1<0.84?'leafy':'leafy2');
    const key=kind+':'+((x/CH)|0)+','+((y/CH)|0);
    let e=chunks.get(key);if(!e){e={kind,list:[],cx:((x/CH)|0)*CH+CH/2,cz:((y/CH)|0)*CH+CH/2};chunks.set(key,e);}
    e.list.push([wx,gy-0.05,wz,h2*6.28,s,h1]);
  }
  /* Pat's Peak's own pines (the game hands their spots over instead of baking cones) */
  if(HD.pineList)for(const [wx,wz,sc] of HD.pineList){
    const x=Math.floor(wx),y=Math.floor(wz);const key='snow:'+((x/CH)|0)+','+((y/CH)|0);
    let e=chunks.get(key);if(!e){e={kind:'snow',list:[],cx:((x/CH)|0)*CH+CH/2,cz:((y/CH)|0)*CH+CH/2};chunks.set(key,e);}
    e.list.push([wx,groundH(wx,wz)-0.05,wz,tileHash(x*5+4,y*11+9)*6.28,sc*1.05,tileHash(x*3+1,y*7+2)]);
  }
  const m4=new THREE.Matrix4(),q=new THREE.Quaternion(),p=new THREE.Vector3(),sc=new THREE.Vector3(),ax=new THREE.Vector3(0,1,0);
  for(const e of chunks.values()){
    const parts=geos[e.kind];
    for(const part of ['fol','bark']){
      if(!parts[part])continue;
      const geo=parts[part].clone();
      const im=new THREE.InstancedMesh(geo,part==='fol'?mats[e.kind]:MAT.bark,e.list.length);
      let maxR=0;
      for(let i=0;i<e.list.length;i++){
        const [x,y,z,ry,s,hh]=e.list[i];
        q.setFromAxisAngle(ax,ry);p.set(x,y,z);sc.set(s,s*(0.95+hh*0.2),s);
        m4.compose(p,q,sc);im.setMatrixAt(i,m4);
        const v=0.86+hh*0.28;
        if(neutral&&part==='fol'&&(e.kind==='leafy'||e.kind==='leafy2')){const t=sn==='winter'?SNOW_TINT:FALL_PAL[Math.floor(hh*FALL_PAL.length)%FALL_PAL.length];im.setColorAt(i,_c.setRGB(t[0]*v,t[1]*v,t[2]*v));}
        else im.setColorAt(i,_c.setRGB(v,v,v));
        maxR=Math.max(maxR,Math.hypot(x-e.cx,z-e.cz));
      }
      geo.boundingSphere=new THREE.Sphere(new THREE.Vector3(e.cx,4,e.cz),maxR+6);
      im.instanceMatrix.needsUpdate=true;if(im.instanceColor)im.instanceColor.needsUpdate=true;
      im.castShadow=true;im.receiveShadow=true;if(part==='fol'&&deps[e.kind])im.customDepthMaterial=deps[e.kind];im.userData.hdNoAO=1;
      im.frustumCulled=true;
      im.name='hdForest';im.userData.forestKind=e.kind;
      worldGroup.add(im);forestMeshes.push(im);
    }
  }
  if(typeof _treeMesh!=='undefined'&&_treeMesh)_treeMesh.visible=false;
  if(HD.world==='classic'&&HD.setWorld)HD.setWorld('classic');   /* a rebuild in the classic world keeps the game's trees showing */
  console.log('[HD] forest:',chunks.size,'instanced chunks');
}
HD.tick=HD.tick||[];
HD.tick.push(function(){if((forestDirty||gameForestDirty)&&!swappedGrid()){try{if(gameForestDirty)buildForest();else buildHDForest();}catch(e){console.warn('[HD] forest',e);}}});
buildHDForest();
if(typeof buildForest==='function'){
  const _bf=buildForest;
  buildForest=function(){if(swappedGrid()){gameForestDirty=true;forestDirty=true;return;}gameForestDirty=false;const r=_bf.apply(this,arguments);try{buildHDForest();}catch(e){console.warn('[HD] forest',e);}return r;};
}

/* --------------------------------- grass -------------------------------- */
/* off by default: the tufts read as spiky neon specks; the terrain texture carries the lawn */
HD.grassTufts=true;
const GCH=16;
if(HD.grassTufts)(function buildGrass(){
  /* crossed pair of quads, 0.55 wide, 0.45 tall, pivot at the ground */
  const buf=newBuf();
  for(const a of [0,Math.PI/3,2*Math.PI/3]){
    const ux=Math.cos(a),uz=Math.sin(a);
    card(buf,0,0.21,0,ux,0,uz,0,1,0,0.5,0.21,0,1,0,1,1,1,false);
  }
  const base=toGeometry(buf);
  /* cluster field: value noise over tiles, so cover comes in drifts with bare lawn between */
  const vn=(x,z,sd)=>{const xi=Math.floor(x),zi=Math.floor(z),fx=x-xi,fz=z-zi,u=fx*fx*(3-2*fx),v=fz*fz*(3-2*fz);const h=(a,b)=>tileHash(a*7+sd,b*13+sd*3);return (h(xi,zi)*(1-u)+h(xi+1,zi)*u)*(1-v)+(h(xi,zi+1)*(1-u)+h(xi+1,zi+1)*u)*v;};
  const tc=new THREE.Color();
  const snowFn=(typeof inSnow==='function')?inSnow:null;
  const m4=new THREE.Matrix4(),q=new THREE.Quaternion(),p=new THREE.Vector3(),sc=new THREE.Vector3(),ax=new THREE.Vector3(0,1,0);
  let total=0,chunksN=0;
  for(let cy=0;cy<H;cy+=GCH)for(let cx=0;cx<W;cx+=GCH){
    const list=[],flowers=[];
    for(let y=cy;y<Math.min(H,cy+GCH);y++)for(let x=cx;x<Math.min(W,cx+GCH);x++){
      if(tiles[y][x]!==T_GRASS||objAt(x,y))continue;
      if(snowFn&&snowFn(x,y))continue;
      /* only in the middle of lawns: every neighbour must be grass too, so the clumps never
         straddle a path edge or a foundation */
      let open=true;for(const d of [[1,0],[-1,0],[0,1],[0,-1]]){const t=inb(x+d[0],y+d[1])?tiles[y+d[1]][x+d[0]]:0;if(t!==T_GRASS&&t!==T_FOREST){open=false;break;}}
      if(!open)continue;
      const wild=inWild(x,y);
      const dens=vn(x/4.5,y/4.5,5)*0.7+vn(x/1.7,y/1.7,9)*0.3;
      /* the lattice noise here runs 0.1..0.45; drifts start at 0.24 and thicken to 3 clumps */
      let n=Math.min(3,Math.round(Math.max(0,(dens-0.24))*14));
      if(wild){
        /* only on the grassy drifts the terrain painted, never on eerie ground */
        const tcw=HD.tileColour?HD.tileColour(x,y):null;
        const grn=tcw?(tcw[1]-0.72*tcw[0]-0.4*tcw[2])*6:0;
        const e=HD.wildEerie?HD.wildEerie(x+0.5,y+0.5):0;
        n=(grn>0.45&&e<0.5)?Math.min(2,n):0;
      }
      if(!n)continue;
      tc.setHex(tileColor(x,y));
      if(wild&&HD.tileColour){const w=HD.tileColour(x,y);tc.setRGB(w[0]*0.8,w[1]*0.78,w[2]*0.75);}   /* coarse, duller than lawn */
      for(let k=0;k<n;k++){
        const h1=tileHash(x*7+k*3+1,y*5+k*11+2),h2=tileHash(x*3+k*13+4,y*17+k*7+9),h3=tileHash(x*11+k*5,y*13+k*3+5);
        const wx=x+0.08+h2*0.84,wz=y+0.08+h3*0.84;
        const k2=0.8+h1*0.3;
        /* one clump in nine is a wildflower tuft (never in the wild); one in seven stands taller */
        const fl=!wild&&h3<0.11;
        (fl?flowers:list).push([wx,groundH(wx,wz)-0.03,wz,h1*6.28,(0.85+h2*0.75)*(h1<0.14?1.35:1.0),fl?[1,1,1]:[Math.min(1,tc.r*1.15*k2),Math.min(1,tc.g*1.2*k2),Math.min(1,tc.b*1.0*k2)]]);
      }
    }
    for(const [lst,mat] of [[list,MAT.grass],[flowers,MAT.flower]]){
      if(!lst.length)continue;
      const geo=base.clone();
      const im=new THREE.InstancedMesh(geo,mat,lst.length);
      for(let i=0;i<lst.length;i++){
        const [x,y,z,ry,s,col]=lst[i];
        q.setFromAxisAngle(ax,ry);p.set(x,y,z);sc.set(s,s,s);m4.compose(p,q,sc);im.setMatrixAt(i,m4);
        im.setColorAt(i,_c.setRGB(col[0],col[1],col[2]));
      }
      geo.boundingSphere=new THREE.Sphere(new THREE.Vector3(cx+GCH/2,2,cy+GCH/2),GCH*0.75+2);
      im.instanceMatrix.needsUpdate=true;if(im.instanceColor)im.instanceColor.needsUpdate=true;
      im.castShadow=false;im.receiveShadow=true;im.frustumCulled=true;im.name='hdGrass';im.userData.hdNoAO=1;
      worldGroup.add(im);total+=lst.length;
    }
    chunksN++;
  }
  console.log('[HD] grass:',total,'tufts in',chunksN,'chunks');
})();

/* -------------------------------- bushes -------------------------------- */
/* Shrubbery where RS3 puts it: hugging building foundations and fence lines, a few loose in
   the fields. Leaf-card clumps, instanced per 32-tile chunk. */
HD.bushes=false;   /* the owner's call: no shrubbery on the lawns */
if(HD.bushes)(function plantBushes(){
  const variants=[];
  for(let v=0;v<3;v++){const buf=newBuf();canopy(buf,'tree',900+v*17,0,0.42+v*0.05,0,0.55+v*0.12,0.7,[0.24+v*0.03,0.42+v*0.02,0.16]);variants.push(toGeometry(buf));}
  const list=new Map();
  const put=(x,y,kind)=>{const k=((x/CH)|0)+','+((y/CH)|0)+':'+kind;let e=list.get(k);if(!e){e={kind,items:[],cx:((x/CH)|0)*CH+CH/2,cz:((y/CH)|0)*CH+CH/2};list.set(k,e);}e.items.push([x,y]);};
  /* around every building footprint */
  if(typeof BUILDINGS!=='undefined')for(const b of BUILDINGS){
    for(let y=b.y-1;y<=b.y+b.h;y++)for(let x=b.x-1;x<=b.x+b.w;x++){
      const edge=(x===b.x-1||x===b.x+b.w||y===b.y-1||y===b.y+b.h);
      if(!edge||!inb(x,y)||tiles[y][x]!==T_GRASS||objAt(x,y))continue;
      const h=tileHash(x*31+7,y*17+3);
      if(h<0.42)put(x,y,(h*100|0)%3);
    }
  }
  /* loose bushes in the campus fields (never on paths, never in the wild or snow) */
  const snowFn=(typeof inSnow==='function')?inSnow:null;
  for(let y=2;y<H-2;y++)for(let x=2;x<W-2;x++){
    if(tiles[y][x]!==T_GRASS||objAt(x,y)||inWild(x,y)||(snowFn&&snowFn(x,y)))continue;
    if(tileHash(x*13+5,y*29+11)>0.012)continue;
    put(x,y,(x+y)%3);
  }
  const m4=new THREE.Matrix4(),q=new THREE.Quaternion(),p=new THREE.Vector3(),sc=new THREE.Vector3(),ax=new THREE.Vector3(0,1,0);
  let total=0;
  for(const e of list.values()){
    const geo=variants[e.kind].clone();
    const im=new THREE.InstancedMesh(geo,MAT.leaf,e.items.length);
    let maxR=0;
    e.items.forEach(([x,y],i)=>{
      const h1=tileHash(x*7+1,y*3+2),h2=tileHash(x*5+4,y*11+9);
      const wx=x+0.25+h1*0.5,wz=y+0.25+h2*0.5;
      q.setFromAxisAngle(ax,h1*6.28);p.set(wx,groundH(wx,wz),wz);const s=0.8+h2*0.5;sc.set(s,s*(0.85+h1*0.3),s);
      m4.compose(p,q,sc);im.setMatrixAt(i,m4);im.setColorAt(i,_c.setRGB(0.9+h2*0.2,0.9+h1*0.2,0.9));
      maxR=Math.max(maxR,Math.hypot(wx-e.cx,wz-e.cz));
    });
    geo.boundingSphere=new THREE.Sphere(new THREE.Vector3(e.cx,1,e.cz),maxR+3);
    im.instanceMatrix.needsUpdate=true;if(im.instanceColor)im.instanceColor.needsUpdate=true;
    im.castShadow=true;im.receiveShadow=true;im.customDepthMaterial=DEPTH.leaf;im.userData.hdNoAO=1;im.name='hdBush';
    worldGroup.add(im);total+=e.items.length;
  }
  console.log('[HD] bushes:',total);
})();

/* ------------------------------ flower beds ----------------------------- */
/* The Rectory's kitchen garden is two baked green boxes with four coloured cubes on top.
   Plant them: a dense low canopy of leaf cards with blossom cards scattered through it. */
(function plantBeds(){
  if(typeof BUILDINGS==='undefined')return;
  const rec=BUILDINGS.find(b=>b.kind==='rectory');if(!rec)return;
  const x0=rec.x,z0=rec.y,y0=rec.base;
  const beds=[[x0+6.6,z0+1.6],[x0+6.6,z0+3.0]];
  const buf=newBuf();
  const R=rnd(4242);
  for(const [bx,bz] of beds){
    for(let i=0;i<34;i++){
      const x=bx+(R()-0.5)*1.0,z=bz+(R()-0.5)*0.6,y=y0+0.36+R()*0.12;
      _n.set((R()-0.5),1,(R()-0.5)).normalize();
      const a=R()*Math.PI*2,ux=Math.cos(a),uz=Math.sin(a);
      const k=0.7+R()*0.4;
      card(buf,x,y,z,ux,0,uz,-uz*0.4,0.9,ux*0.4,0.13,0.11,_n.x,_n.y,_n.z,0.28*k,0.48*k,0.2*k,R()<0.5);
    }
  }
  const leaves=new THREE.Mesh(toGeometry(buf),MAT.leaf);leaves.castShadow=true;leaves.receiveShadow=true;leaves.customDepthMaterial=DEPTH.leaf;leaves.userData.hdNoAO=1;
  worldGroup.add(leaves);
  /* blossoms: small bright discs facing up, unlit-ish so they pop */
  const cols=[0xe0507a,0xf2c53d,0xf4f1ea,0xd85a8a,0xf7e37a];
  const bg=new THREE.CircleGeometry(0.045,8);bg.rotateX(-Math.PI/2);
  const im=new THREE.InstancedMesh(bg,new THREE.MeshLambertMaterial({color:0xffffff,side:THREE.DoubleSide}),2*26);
  const m4=new THREE.Matrix4(),q=new THREE.Quaternion(),p=new THREE.Vector3(),sc=new THREE.Vector3();let i=0;
  for(const [bx,bz] of beds)for(let k=0;k<26;k++){
    p.set(bx+(R()-0.5)*1.0,y0+0.44+R()*0.1,bz+(R()-0.5)*0.6);q.setFromEuler(new THREE.Euler((R()-0.5)*0.6,R()*6.28,(R()-0.5)*0.6));sc.setScalar(0.8+R()*0.6);
    m4.compose(p,q,sc);im.setMatrixAt(i,m4);im.setColorAt(i,_c.setHex(cols[k%cols.length]));i++;
  }
  im.instanceMatrix.needsUpdate=true;if(im.instanceColor)im.instanceColor.needsUpdate=true;
  im.userData.hdNoAO=1;im.name='hdCover';worldGroup.add(im);
})();

/* --------------------------------- wind --------------------------------- */
HD.tick.push(function(now){const t=now*0.001;for(const u of windUniforms)u.uTime.value=t;});
})();
