/* ============================================================================
   Milville HD — terrain and water.  Loaded after hd-post.js.

   The game's terrain is one vertex per tile corner, coloured per tile, so
   roads, shorelines and banks are tile-square and every slope is two flat
   triangles. This file hides that mesh (it still serves the click raycast,
   which needs nothing finer) and builds:

     * a 3x3-subdivided terrain in 32x32-tile chunks. Heights are the SAME
       bilinear surface groundH() uses, so nothing the game seated moves; the
       shading normal comes from a bicubic (Catmull-Rom) pass over the height
       grid, so slopes read smooth. Colours are gathered from a Gaussian over
       the neighbouring tiles' painted colours, so a road edge or a shoreline
       feathers over about half a tile instead of snapping at the grid.
     * a water surface over every water tile plus a one-tile margin, with a
       per-vertex `shore` (0 on land .. 1 in open water) that drives depth
       colour, foam that laps in and out, and the alpha fade that gives a soft
       shoreline. Waves are vertex-displaced on the GPU with analytic normals;
       reflection is an analytic sky (zenith/horizon from the day cycle), plus
       the sun's specular and two scrolling ripple layers.

   recolorTerrain() (winter / autumn) is wrapped so the chunk colours follow.
   Gameplay is untouched: nothing here reads or writes game state.
   ========================================================================== */
(function(){
'use strict';
try{performance.mark('hd:hd-terrain');}catch(e){}
const HD=window.HD;
if(!HD||!HD.ready)return;
if(typeof terra==='undefined'||!terra||typeof hts==='undefined')return;

const N=3, CH=32;
const WN=W*N, HN=H*N;

try{performance.mark('hd:hd-terrain/heights');}catch(e){}
/* ------------------------------ heights -------------------------------- */
/* The game raises the four corners of every bridge tile to the bank so the walker crosses
   level, which makes the tile itself a dam. The picture uses its own copy of the grid with
   those corners dropped back to the neighbouring river bed, and treats the tile as water,
   so the river runs under the planks (which the game bakes at its own raised height, on
   posts that already reach the bed). groundH() and every walk reads the game's grid. */
const hts2=hts.map(r=>Float64Array.from(r));
const isBridgeTile=[];
for(let y=0;y<H;y++){const row=new Uint8Array(W);for(let x=0;x<W;x++)row[x]=tiles[y][x]===T_BRIDGE?1:0;isBridgeTile.push(row);}
{
  const bed=(cx,cz)=>{  /* lowest bed corner among water tiles touching this corner */
    let m=Infinity;
    for(let dy=-1;dy<=0;dy++)for(let dx=-1;dx<=0;dx++){const tx=cx+dx,ty=cz+dy;if(tx<0||ty<0||tx>=W||ty>=H)continue;if(tiles[ty][tx]!==T_WATER)continue;
      for(const [ox,oy] of [[0,0],[1,0],[0,1],[1,1]])m=Math.min(m,hts[ty+oy][tx+ox]);}
    return m;
  };
  for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(isBridgeTile[y][x]){
    /* only a bridge that actually spans water; a dock end on land stays as it is */
    let touches=false;for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const tx=x+dx,ty=y+dy;if(tx>=0&&ty>=0&&tx<W&&ty<H&&tiles[ty][tx]===T_WATER)touches=true;}
    if(!touches)continue;
    for(const [ox,oy] of [[0,0],[1,0],[0,1],[1,1]]){const b=bed(x+ox,y+oy);if(b<Infinity)hts2[y+oy][x+ox]=Math.min(hts2[y+oy][x+ox],b);}
  }
}
/* lava runs in a carved channel: every corner of a lava tile drops half a unit, so the banks
   slope down to the melt and the surface sits below the ground it crosses */
/* the basin is carved by a gaussian over the lava tiles, so its walls curve around the pool
   instead of stepping tile by tile; corners well inside drop 0.7, the rim eases out over ~a tile */
function lavaGather(x,z){let m=0,ws=0;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const ix=Math.round(x-0.5)+dx,iy=Math.round(z-0.5)+dy;if(ix<0||iy<0||ix>=W||iy>=H)continue;const ddx=(ix+0.5)-x,ddy=(iy+0.5)-z;const w=Math.exp(-(ddx*ddx+ddy*ddy)/(2*1.0*1.0));ws+=w;if(tiles[iy][ix]===T_LAVA)m+=w;}return ws>0?m/ws:0;}
for(let y=0;y<=H;y++)for(let x=0;x<=W;x++){const m=lavaGather(x,y);if(m<=0.08)continue;const k=Math.min(1,(m-0.08)/0.5);hts2[y][x]-=0.7*k*k*(3-2*k);}
/* the game's own (uncarved) ground, for surfaces that sit at bank level */
function hGame(x,z){
  const cx=Math.max(0,Math.min(W-1,Math.floor(x))),cz=Math.max(0,Math.min(H-1,Math.floor(z)));
  const fx=Math.max(0,Math.min(1,x-cx)),fz=Math.max(0,Math.min(1,z-cz));
  return (hts[cz][cx]*(1-fx)+hts[cz][cx+1]*fx)*(1-fz)+(hts[cz+1][cx]*(1-fx)+hts[cz+1][cx+1]*fx)*fz;
}
function hCorner(cx,cz){cx=cx<0?0:cx>W?W:cx;cz=cz<0?0:cz>H?H:cz;return hts2[cz][cx];}
function hBilinear(x,z){
  const cx=Math.max(0,Math.min(W-1,Math.floor(x))),cz=Math.max(0,Math.min(H-1,Math.floor(z)));
  const fx=Math.max(0,Math.min(1,x-cx)),fz=Math.max(0,Math.min(1,z-cz));
  const h00=hts2[cz][cx],h10=hts2[cz][cx+1],h01=hts2[cz+1][cx],h11=hts2[cz+1][cx+1];
  return (h00*(1-fx)+h10*fx)*(1-fz)+(h01*(1-fx)+h11*fx)*fz;
}
function cr(p0,p1,p2,p3,t){return 0.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t*t*t);}
function hSmooth(x,z){
  const cx=Math.floor(x),cz=Math.floor(z),fx=x-cx,fz=z-cz;
  const rows=[];
  for(let j=-1;j<=2;j++)rows.push(cr(hCorner(cx-1,cz+j),hCorner(cx,cz+j),hCorner(cx+1,cz+j),hCorner(cx+2,cz+j),fx));
  return cr(rows[0],rows[1],rows[2],rows[3],fz);
}

try{performance.mark('hd:hd-terrain/tile-fields');}catch(e){}
/* ------------------------------ tile fields ---------------------------- */
let tileCol=null;          /* Float32 rgb per tile, sRGB 0..1 (the game's painted colours) */
const isWater=[];          /* per tile */
let waterLevel=[];         /* per tile: WLV or NaN */
const G=[];                /* gaussian kernel offsets */
{const S=0.48;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)G.push([dx,dy,Math.exp(-(dx*dx+dy*dy)/(2*S*S))]);}
try{performance.mark('hd:hd-terrain/the-wilderness');}catch(e){}
/* ------------------------------ the wilderness --------------------------- */
/* Depth into the wild (tiles from the nearest campus tile) and an 'eerie' field peaking
   around the asylum and the high-school ruins. The shallow wild is dirt with drifts of
   patchy grass; the deep wild goes to ash and grey, and hd-post reads HD.wildEerie for its
   fog. Nothing here touches the game's tiles or masks. */
const wildD=new Float32Array(W*H).fill(-1);
{
  const q=[];
  for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(!inWild(x,y)){wildD[y*W+x]=0;q.push(x,y);}
  let head=0;
  while(head<q.length){const x=q[head++],y=q[head++];const d=wildD[y*W+x];
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=W||ny>=H)continue;if(wildD[ny*W+nx]>=0)continue;wildD[ny*W+nx]=d+1;q.push(nx,ny);}}
}
const EERIE=[[86,42,26],[60,80,22]];      /* asylum, high-school ruins: centre and radius */
const eerieGrid=new Float32Array(W*H);
/* 1 on Pat's Peak, easing out over the ellipse's rim (inSnow is a hard ellipse) */
HD.snowFactor=function(x,z){if(typeof inSnow!=='function')return 0;const a=(x-18)/38,b=(z-14)/32;const r=Math.sqrt(a*a+b*b);return 1-Math.min(1,Math.max(0,(r-0.92)/0.25));};
for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  if(!inWild(x,y)||(typeof inSnow==='function'&&inSnow(x,y)))continue;
  let e=0;for(const [cx,cy,r] of EERIE){const d=Math.hypot(x-cx,y-cy);const s=1-Math.min(1,Math.max(0,(d-r*0.45)/(r*1.05)));e=Math.max(e,s*s*(3-2*s));}
  const dd=Math.min(1,Math.max(0,(wildD[y*W+x]-22)/40));
  eerieGrid[y*W+x]=Math.max(e,dd*0.55);
}
HD.tileColour=function(x,y){if(!tileCol)return null;const i=(y*W+x)*3;return [tileCol[i],tileCol[i+1],tileCol[i+2]];};
HD.wildEerie=function(x,z){const ix=Math.max(0,Math.min(W-1,Math.floor(x))),iz=Math.max(0,Math.min(H-1,Math.floor(z)));return eerieGrid[iz*W+ix];};
HD.wildDepth=function(x,z){const ix=Math.max(0,Math.min(W-1,Math.floor(x))),iz=Math.max(0,Math.min(H-1,Math.floor(z)));return wildD[iz*W+ix];};
/* 0 on campus, 1 a few tiles into the wild, eased over the boundary */
function wildBlend(x,z){const d=HD.wildDepth(x,z);return d<=0?0:Math.min(1,d/3);}
function patchGrass(x,y){return vnoise(x/4.5,y/4.5,7)*0.6+vnoise(x/1.7,y/1.7,8)*0.4;}
const snowAt=(typeof inSnow==='function')?inSnow:()=>false;
function rebuildTileColours(){
  tileCol=new Float32Array(W*H*3);
  const c=new THREE.Color();
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const t=tiles[y][x];
    let hex=tileColor(x,y);
    if(t===T_WATER||(t===T_BRIDGE&&spansWater(x,y)))hex=0x5b5240;   /* the bed: silt, seen through the water */
    if(t===T_LAVA)hex=0x1c1512;                                        /* scorched basalt under the lava mesh */
    c.setHex(hex);
    if(inWild(x,y)&&!snowAt(x,y)&&(t===T_GRASS||t===T_FENCE)){
      const e=eerieGrid[y*W+x];
      const pg=patchGrass(x,y);
      const g=Math.max(0,Math.min(1,(pg-0.215)/0.07))*(1-e);         /* tileHash is 0..0.5, so the noise runs ~0.05..0.45 */
      /* drifts of coarse grass over the dirt, then ash and grey toward the eerie ground */
      c.r+=(0.36-c.r)*g;c.g+=(0.45-c.g)*g;c.b+=(0.19-c.b)*g;
      c.r+=(0.24-c.r)*e*0.8;c.g+=(0.235-c.g)*e*0.8;c.b+=(0.225-c.b)*e*0.8;
      const k=1-e*0.3;c.r*=k;c.g*=k;c.b*=k;
    }
    const i=(y*W+x)*3;tileCol[i]=c.r;tileCol[i+1]=c.g;tileCol[i+2]=c.b;
  }
}
function spansWater(x,y){if(!isBridgeTile[y][x])return false;for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const tx=x+dx,ty=y+dy;if(tx>=0&&ty>=0&&tx<W&&ty<H&&tiles[ty][tx]===T_WATER)return true;}return false;}
function bridgeLevel(x,y){let s=0,n=0;for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const tx=x+dx,ty=y+dy;if(tx>=0&&ty>=0&&tx<W&&ty<H&&tiles[ty][tx]===T_WATER){s+=waterYAt(tx,ty);n++;}}return n?s/n:NaN;}
for(let y=0;y<H;y++){const row=[];for(let x=0;x<W;x++)row.push(tiles[y][x]===T_WATER||spansWater(x,y)?1:0);isWater.push(row);}
for(let y=0;y<H;y++){const row=[];for(let x=0;x<W;x++)row.push(tiles[y][x]===T_WATER?waterYAt(x,y):spansWater(x,y)?bridgeLevel(x,y):NaN);waterLevel.push(row);}

/* gaussian gather of a per-tile field at a world position (tile centres at +0.5) */
function gatherColour(x,z,out){
  const tx=Math.floor(x-0.5),tz=Math.floor(z-0.5);
  let r=0,g=0,b=0,ws=0;
  for(const [dx,dy,w0] of G){
    const ix=Math.round(x-0.5)+dx,iy=Math.round(z-0.5)+dy;
    if(ix<0||iy<0||ix>=W||iy>=H)continue;
    const ddx=(ix+0.5)-x,ddy=(iy+0.5)-z;
    const w=Math.exp(-(ddx*ddx+ddy*ddy)/(2*0.42*0.42));
    const i=(iy*W+ix)*3;
    r+=tileCol[i]*w;g+=tileCol[i+1]*w;b+=tileCol[i+2]*w;ws+=w;
  }
  if(ws<=0){out[0]=out[1]=out[2]=0.5;return;}
  out[0]=r/ws;out[1]=g/ws;out[2]=b/ws;
}
function gatherWater(x,z){
  let m=0,ws=0,lv=0,lw=0;
  for(const [dx,dy] of G){
    const ix=Math.round(x-0.5)+dx,iy=Math.round(z-0.5)+dy;
    if(ix<0||iy<0||ix>=W||iy>=H)continue;
    const ddx=(ix+0.5)-x,ddy=(iy+0.5)-z;
    const w=Math.exp(-(ddx*ddx+ddy*ddy)/(2*0.5*0.5));
    ws+=w;
    if(isWater[iy][ix]){m+=w;lv+=waterLevel[iy][ix]*w;lw+=w;}
  }
  return [ws>0?m/ws:0, lw>0?lv/lw:NaN];
}

try{performance.mark('hd:hd-terrain/micro-relief');}catch(e){}
/* ---------------------------- micro relief ------------------------------ */
/* Real ground is never a sheet. Two octaves of value noise (about a 3-tile swell and a 1-tile
   ripple, +-7 cm) go onto open lawn only: a per-tile mask keeps paths, floors, walls, bridges
   and the shore easing flat, feathered over a tile, so nothing the game seated visibly floats. */
function vnoise(x,z,sd){const xi=Math.floor(x),zi=Math.floor(z),fx=x-xi,fz=z-zi,u=fx*fx*(3-2*fx),v=fz*fz*(3-2*fz);const h=(a,b)=>tileHash(a*7+sd,b*13+sd*3);return (h(xi,zi)*(1-u)+h(xi+1,zi)*u)*(1-v)+(h(xi,zi+1)*(1-u)+h(xi+1,zi+1)*u)*v;}
const reliefOk=[];
for(let y=0;y<H;y++){const row=new Float32Array(W);for(let x=0;x<W;x++){const t=tiles[y][x];row[x]=(t===T_GRASS||t===T_FOREST)?1:0;}reliefOk.push(row);}
function reliefMask(x,z){
  let m=0,ws=0;
  for(const [dx,dy] of G){const ix=Math.round(x-0.5)+dx,iy=Math.round(z-0.5)+dy;if(ix<0||iy<0||ix>=W||iy>=H)continue;const ddx=(ix+0.5)-x,ddy=(iy+0.5)-z;const w=Math.exp(-(ddx*ddx+ddy*ddy)/(2*0.5*0.5));ws+=w;m+=reliefOk[iy][ix]*w;}
  m=ws>0?m/ws:0;return m*m;
}
function relief(x,z){return (vnoise(x/3.2,z/3.2,1)-0.5)*0.11+(vnoise(x/1.15,z/1.15,2)-0.5)*0.045;}

try{performance.mark('hd:hd-terrain/terrain');}catch(e){}
/* ------------------------------ terrain --------------------------------- */
const terrainChunks=[];
let terrainMat=null;
function buildTerrain(){
  rebuildTileColours();
  terrainMat=HD.terrainMaterial();
  const tmp=[0,0,0];
  for(let cz0=0;cz0<H;cz0+=CH)for(let cx0=0;cx0<W;cx0+=CH){
    const cw=Math.min(CH,W-cx0),chh=Math.min(CH,H-cz0);
    const nx=cw*N+1,nz=chh*N+1;
    const pos=new Float32Array(nx*nz*3),nor=new Float32Array(nx*nz*3),col=new Float32Array(nx*nz*3),wet=new Float32Array(nx*nz),wild=new Float32Array(nx*nz);
    let k=0;
    for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){
      const x=cx0+i/N,z=cz0+j/N;
      let y=hBilinear(x,z);
      /* the bed carve leaves a sheer turf step at every shoreline; ease the bank over ~a tile,
         moving no vertex more than 0.12 so nothing the game seated visibly floats */
      const gw0=gatherWater(x,z);
      let rm=reliefMask(x,z);
      if(gw0[0]>0.001&&gw0[1]===gw0[1]&&y>gw0[1]-0.05){
        let sm=0;for(let a=0;a<8;a++){const an=a*Math.PI/4;sm+=hBilinear(x+Math.cos(an)*0.6,z+Math.sin(an)*0.6);}
        sm=(sm/8+y)*0.5;
        y=Math.max(y-0.12,Math.min(y+0.12,sm));
        rm*=1-Math.min(1,gw0[0]*4);
      }
      const rl=relief(x,z)*rm;
      y+=rl;
      pos[k*3]=x;pos[k*3+1]=y;pos[k*3+2]=z;
      const e=0.3;
      const dx=(hSmooth(x+e,z)-hSmooth(x-e,z)+(relief(x+e,z)-relief(x-e,z))*rm)/(2*e),dz=(hSmooth(x,z+e)-hSmooth(x,z-e)+(relief(x,z+e)-relief(x,z-e))*rm)/(2*e);
      let nl=Math.sqrt(dx*dx+1+dz*dz);
      nor[k*3]=-dx/nl;nor[k*3+1]=1/nl;nor[k*3+2]=-dz/nl;
      gatherColour(x,z,tmp);
      col[k*3]=tmp[0];col[k*3+1]=tmp[1];col[k*3+2]=tmp[2];
      /* the wet band: ground within ~0.3 above the nearest water level, darker and glossy */
      const gw=gatherWater(x,z);
      wet[k]=(gw[0]>0.001&&gw[1]===gw[1])?Math.max(0,Math.min(1,(gw[1]+0.3-y)/0.4))*Math.min(1,gw[0]*6.0+0.35):0;
      wild[k]=wildBlend(x,z);
      k++;
    }
    const idx=[];
    for(let j=0;j<nz-1;j++)for(let i=0;i<nx-1;i++){
      const a=j*nx+i,b=a+1,c=a+nx,d=c+1;
      idx.push(a,c,b,b,c,d);
    }
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.BufferAttribute(pos,3));
    g.setAttribute('normal',new THREE.BufferAttribute(nor,3));
    g.setAttribute('color',new THREE.BufferAttribute(col,3));
    g.setAttribute('wet',new THREE.BufferAttribute(wet,1));
    g.setAttribute('hdWild',new THREE.BufferAttribute(wild,1));
    g.setIndex(idx);
    g.computeBoundingSphere();
    const m=new THREE.Mesh(g,terrainMat);
    m.castShadow=true;m.receiveShadow=true;m.name='hdTerrain';
    m.userData.chunk={cx0,cz0,nx,nz};
    worldGroup.add(m);terrainChunks.push(m);   /* in worldGroup: interiors hide the outside world with it */
  }
  terra.visible=false;            /* keeps serving the click raycast */
  terra.castShadow=false;
}
function recolourTerrain(){
  rebuildTileColours();
  const tmp=[0,0,0];
  for(const m of terrainChunks){
    const {cx0,cz0,nx,nz}=m.userData.chunk,col=m.geometry.attributes.color.array;
    let k=0;
    for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){gatherColour(cx0+i/N,cz0+j/N,tmp);col[k*3]=tmp[0];col[k*3+1]=tmp[1];col[k*3+2]=tmp[2];k++;}
    m.geometry.attributes.color.needsUpdate=true;
  }
}
buildTerrain();
/* heightmap for the ground-contact grime in the surface shader: one texel per tile corner */
(function bakeHeightmap(){
  let mn=1e9,mx=-1e9;
  for(let y=0;y<=H;y++)for(let x=0;x<=W;x++){const v=hts[y][x];if(v<mn)mn=v;if(v>mx)mx=v;}
  const range=Math.max(0.001,mx-mn);
  /* 8-bit is plenty: the band is 1.2 units tall and the map spans a few dozen */
  const data=new Uint8Array((W+1)*(H+1));
  for(let y=0;y<=H;y++)for(let x=0;x<=W;x++)data[y*(W+1)+x]=Math.round((hts[y][x]-mn)/range*255);
  const t=new THREE.DataTexture(data,W+1,H+1,THREE.RedFormat,THREE.UnsignedByteType);
  t.minFilter=THREE.LinearFilter;t.magFilter=THREE.LinearFilter;t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping;t.needsUpdate=true;
  HD.groundTex=t;HD.groundInfo=new THREE.Vector4(1/(W+1),1/(H+1),mn,range);
  /* materials compiled before now (none should be: the first frame has not rendered) get the uniforms lazily */
  scene.traverse(o=>{if(o.isMesh&&o.material&&o.material.userData&&o.material.userData.hd){const u=o.material.userData.hd;if(u.tHDGround){u.tHDGround.value=t;u.uHDGround.value=HD.groundInfo;}}});
})();
HD.terrainWet=function(v){if(terrainMat&&terrainMat.userData.hd&&terrainMat.userData.hd.uHDWet)terrainMat.userData.hd.uHDWet.value=v;};
if(typeof recolorTerrain==='function'){
  const _rt=recolorTerrain;
  recolorTerrain=function(){
    const r=_rt.apply(this,arguments);
    /* the original ran with the season flags set; run ours under the same flags */
    const on=!!(player&&player.winter),fon=!!(player&&player.fall);
    const pt=tiles,pw=_terraWinter,pf=_terraFall;
    tiles=TILES_MAIN;_terraWinter=on;_terraFall=fon;
    try{recolourTerrain();}catch(e){console.warn('[HD] recolour',e);}finally{tiles=pt;_terraWinter=pw;_terraFall=pf;}
    return r;
  };
}

try{performance.mark('hd:hd-terrain/water');}catch(e){}
/* -------------------------------- water --------------------------------- */
HD.water={zen:new THREE.Color(0x3d78c0),hor:new THREE.Color(0xc9dcee),sunDir:new THREE.Vector3(0.5,0.7,0.3),sunCol:new THREE.Color(1,0.95,0.85)};
const waterMat=new THREE.ShaderMaterial({
  transparent:true,depthWrite:false,fog:true,
  uniforms:THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{
    uTime:{value:0},tRipple:{value:HD.tex.waterN},tFoam:{value:HD.tex.cloud},
    uZen:{value:HD.water.zen},uHor:{value:HD.water.hor},uSunDir:{value:HD.water.sunDir},uSunCol:{value:HD.water.sunCol},
    uDeep:{value:new THREE.Color(0.015,0.06,0.11)},uShallow:{value:new THREE.Color(0.05,0.17,0.23)},   /* RS3 water: deeper blue-green, the reflection carries the brightness */
    tRefl:{value:null},uReflMat:{value:new THREE.Matrix4()},uReflY:{value:0},uReflOn:{value:0},uRain:{value:0},uFlat:{value:0}
  }]),
  vertexShader:`
    attribute float shore;attribute float depth;
    varying float vShore;varying float vDepth;varying vec3 vWorld;varying vec3 vN;varying vec4 vRefl;varying float vLevel;
    uniform float uTime;uniform mat4 uReflMat;uniform float uRain;uniform float uFlat;
    #include <fog_pars_vertex>
    void main(){
      vec3 p=position;float t=uTime;
      float shore_=max(shore,uFlat),depth_=max(depth,uFlat);
      float amp=(0.05+0.03*uRain)*smoothstep(0.0,0.5,shore_)*smoothstep(0.0,0.3,depth_);
      float a1=p.x*1.9+t*1.15, a2=p.z*1.5-t*0.95, a3=(p.x+p.z)*3.3+t*1.9, a4=(p.x*0.7-p.z*1.1)*2.2+t*0.7, a5=(p.x*0.35+p.z*0.25)+t*0.45;
      p.y+=amp*(sin(a1)*0.5+sin(a2)*0.5+sin(a3)*0.25+sin(a4)*0.35)+amp*1.2*sin(a5);
      float dx=amp*(cos(a1)*0.95+cos(a3)*0.83+cos(a4)*0.54+cos(a5)*0.42);
      float dz=amp*(cos(a2)*0.75+cos(a3)*0.83-cos(a4)*0.85+cos(a5)*0.3);
      vN=normalize(vec3(-dx,1.0,-dz));
      vShore=shore_;vDepth=depth_;vLevel=position.y;
      vec4 wp=modelMatrix*vec4(p,1.0);vWorld=wp.xyz;
      vRefl=uReflMat*wp;
      vec4 mvPosition=viewMatrix*wp;
      gl_Position=projectionMatrix*mvPosition;
      #include <fog_vertex>
    }`,
  fragmentShader:`
    varying float vShore;varying float vDepth;varying vec3 vWorld;varying vec3 vN;varying vec4 vRefl;varying float vLevel;
    uniform float uTime;uniform sampler2D tRipple;uniform sampler2D tFoam;uniform sampler2D tRefl;
    uniform vec3 uZen,uHor,uSunDir,uSunCol,uDeep,uShallow;uniform float uReflY,uReflOn,uRain;
    #include <common>
    #include <fog_pars_fragment>
    void main(){
      float t=uTime;
      vec2 uv=vWorld.xz;
      vec3 r1=texture2D(tRipple,uv*0.45+vec2(t*0.018,t*0.011)).xyz*2.0-1.0;
      vec3 r2=texture2D(tRipple,uv*1.1+vec2(-t*0.014,t*0.023)).xyz*2.0-1.0;
      vec3 n=normalize(vN+vec3(r1.x+r2.x*0.6,0.0,r1.y+r2.y*0.6)*(0.22+0.25*uRain));
      /* rain: rings of tiny impact ripples */
      if(uRain>0.01){vec3 r3=texture2D(tRipple,uv*3.7+vec2(fract(t*0.9)*0.3,fract(t*0.7)*0.2)).xyz*2.0-1.0;n=normalize(n+vec3(r3.x,0.0,r3.y)*0.35*uRain);}
      vec3 V=normalize(cameraPosition-vWorld);
      float ndv=max(dot(n,V),0.0);
      float fres=mix(0.025,1.0,pow(1.0-ndv,5.0));
      vec3 R=reflect(-V,n);
      vec3 sky=mix(uHor,uZen,clamp(R.y*2.2+0.15,0.0,1.0));
      /* the planar reflection: what actually stands over this water, bent by the ripples */
      float reflW=uReflOn*(1.0-smoothstep(0.25,0.6,abs(vLevel-uReflY)));
      if(reflW>0.0){
        vec2 ruv=(vRefl.xy/vRefl.w)+n.xz*0.06;
        vec4 rc=texture2D(tRefl,clamp(ruv,0.001,0.999));
        sky=mix(sky,rc.rgb,reflW*rc.a);
      }
      float spec=pow(max(dot(reflect(-uSunDir,n),V),0.0),220.0)*2.2+pow(max(dot(reflect(-uSunDir,n),V),0.0),24.0)*0.12;
      float depth=smoothstep(0.05,0.9,vDepth*1.4);
      vec3 col=mix(uShallow,uDeep,depth);
      col=mix(col,sky,fres);
      col+=uSunCol*spec;
      /* foam: a band at the shore that breathes in and out, plus wind streaks in open water */
      float f=texture2D(tFoam,uv*0.22+vec2(t*0.015,-t*0.01)).r;
      float f2=texture2D(tFoam,uv*0.9+vec2(-t*0.03,t*0.02)).r;
      float lap=0.5+0.5*sin(t*1.3-vShore*14.0+f*4.0);
      /* foam lives where the water is shallow: the last quarter-unit before the bank */
      float band=(1.0-smoothstep(0.02,0.2,vDepth))*smoothstep(0.0,0.02,vDepth);
      float foam=smoothstep(0.64,0.82,f*0.7+f2*0.3+band*0.25*lap)*band;
      col=mix(col,vec3(0.86,0.9,0.92),foam*0.5);
      /* transparency follows real depth, so the water dissolves exactly where it meets the bank */
      float alpha=smoothstep(0.0,0.32,vDepth)*mix(0.6,0.97,fres);
      alpha=max(alpha,foam*0.85);
      gl_FragColor=vec4(col,alpha);
      #include <tonemapping_fragment>
      #include <encodings_fragment>
      #include <fog_fragment>
    }`
});
const waterChunks=[];
function buildWater(){
  for(let cz0=0;cz0<H;cz0+=CH)for(let cx0=0;cx0<W;cx0+=CH){
    const cw=Math.min(CH,W-cx0),chh=Math.min(CH,H-cz0);
    /* any water in or beside this chunk? */
    let any=false;
    for(let y=Math.max(0,cz0-1);y<Math.min(H,cz0+chh+1)&&!any;y++)for(let x=Math.max(0,cx0-1);x<Math.min(W,cx0+cw+1);x++)if(isWater[y][x]){any=true;break;}
    if(!any)continue;
    const nx=cw*N+1,nz=chh*N+1;
    const pos=[],sh=[],dep=[],map=new Int32Array(nx*nz).fill(-1);
    let vcount=0;
    for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){
      const x=cx0+i/N,z=cz0+j/N;
      const [m,lv]=gatherWater(x,z);
      if(m<=0.002||lv!==lv)continue;
      map[j*nx+i]=vcount++;
      pos.push(x,lv,z);sh.push(m);dep.push(Math.max(0,lv-hBilinear(x,z)));
    }
    if(!vcount)continue;
    const idx=[];
    for(let j=0;j<nz-1;j++)for(let i=0;i<nx-1;i++){
      const a=map[j*nx+i],b=map[j*nx+i+1],c=map[(j+1)*nx+i],d=map[(j+1)*nx+i+1];
      if(a<0||b<0||c<0||d<0)continue;
      idx.push(a,c,b,b,c,d);
    }
    if(!idx.length)continue;
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    g.setAttribute('shore',new THREE.Float32BufferAttribute(sh,1));
    g.setAttribute('depth',new THREE.Float32BufferAttribute(dep,1));
    g.setIndex(idx);
    g.computeBoundingSphere();
    const m=new THREE.Mesh(g,waterMat);
    m.renderOrder=3;m.name='hdWater';m.userData.hdNoAO=1;
    worldGroup.add(m);waterChunks.push(m);
  }
  if(typeof waterMesh!=='undefined'&&waterMesh){waterMesh.visible=false;waterMesh.userData.hdHidden=1;}
}
buildWater();
/* the game shows/hides its own water on interior transitions; ours lives in worldGroup, which
   it hides too. Keep the original hidden whatever the game sets. */
HD.tick=HD.tick||[];
HD.waterMat=waterMat;
try{performance.mark('hd:hd-terrain/the-emberdeep-cave');}catch(e){}
/* ------------------------------ the Emberdeep cave ------------------------------ */
/* The game's cave mesh is one quad per tile, with liquid corners sunk in four steps. The HD
   cave is rebuilt from it at three subdivisions per tile: heights are the game's own uncarved
   corner heights (_volcCornerH with noSink) bilinearly interpolated, minus a moat depth from a
   gaussian over the liquid tiles evaluated at every sub-vertex, so a shoreline is a curve; the
   rising walls take a crag noise. Corner colours are read back from the game's mesh. The
   original is hidden in place, so chamber visibility still works. */
HD.flatWaterMats=HD.flatWaterMats||[];
let caveBuilt=false;
function rebuildCave(){
  if(caveBuilt)return;caveBuilt=true;
  HD.flatWaterMats=HD.flatWaterMats||[];
  if(typeof volcChamberGroups==='undefined'||typeof _volcCornerH!=='function'||typeof volcTiles==='undefined')return;
  const NS=3,DROP=(typeof _VOLC_LAVADROP!=='undefined')?_VOLC_LAVADROP:0.9,FY=(typeof _volcFY!=='undefined')?_volcFY:-0.3;
  const liquid=(t)=>t===T_LAVA||t===T_WATER;
  function sinkAt(x,z){let m=0,ws=0;const cx=Math.floor(x),cz=Math.floor(z);for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){const tx=cx+dx,ty=cz+dy;const ddx=(tx+0.5)-x,ddy=(ty+0.5)-z;const w=Math.exp(-(ddx*ddx+ddy*ddy)/(2*0.9*0.9));ws+=w;const row=volcTiles[ty];if(row&&liquid(row[tx]))m+=w;}m=ws>0?m/ws:0;const k=Math.min(1,Math.max(0,(m-0.06)/0.6));return k*k*(3-2*k);}
  let built=0;
  for(const gr of volcChamberGroups){
    if(!gr)continue;
    /* the cave mesh alone: every vertex of it sits on an integer tile corner (the bridge, the
       vault walls and every other baked prop in the chamber group do not) */
    const isCaveMesh=(o)=>{const P=o.geometry.attributes.position;if(P.count<60||P.count%6!==0)return false;const step=Math.max(1,Math.floor(P.count/40));for(let v=0;v<P.count;v+=step){const x=P.getX(v),z=P.getZ(v);if(Math.abs(x-Math.round(x))>1e-3||Math.abs(z-Math.round(z))>1e-3)return false;}return true;};
    const src=[];gr.traverse(o=>{if(o.isMesh&&o.geometry&&o.geometry.attributes.color&&!o.geometry.index&&!(o.material&&(o.material.userData.hdLava||o.material.userData.hdFlatWater))&&isCaveMesh(o))src.push(o);});
    for(const o of src){
      const P=o.geometry.attributes.position,C=o.geometry.attributes.color;
      const ccol=new Map(),tilesSet=new Set();
      const key=(x,z)=>Math.round(x)+','+Math.round(z);
      for(let v=0;v<P.count;v++){ccol.set(key(P.getX(v),P.getZ(v)),[C.getX(v),C.getY(v),C.getZ(v)]);}
      for(let v=0;v<P.count;v+=6){const tx=Math.round(Math.min(P.getX(v),P.getX(v+1),P.getX(v+2))),tz=Math.round(Math.min(P.getZ(v),P.getZ(v+1),P.getZ(v+2)));tilesSet.add(tx+','+tz);}
      const pos=[],col=[],nor=[];
      const hUn=(cx,cz)=>_volcCornerH(cx,cz,true);
      const vert=(x,z,tx,tz)=>{
        const fx=x-tx,fz=z-tz;
        const h=(hUn(tx,tz)*(1-fx)+hUn(tx+1,tz)*fx)*(1-fz)+(hUn(tx,tz+1)*(1-fx)+hUn(tx+1,tz+1)*fx)*fz;
        let y=h-DROP*sinkAt(x,z);
        const rise=h-FY;if(rise>0.35){const nz=Math.sin(x*3.1)*Math.cos(z*2.7)*0.5+Math.sin(x*7.3+z*5.1)*0.3+Math.sin(x*1.3-z*1.9)*0.2;y+=nz*0.18*Math.min(1,(rise-0.35)/1.2);}
        const c00=ccol.get(key(tx,tz))||[0.3,0.25,0.2],c10=ccol.get(key(tx+1,tz))||c00,c01=ccol.get(key(tx,tz+1))||c00,c11=ccol.get(key(tx+1,tz+1))||c00;
        const c=[0,1,2].map(i=>(c00[i]*(1-fx)+c10[i]*fx)*(1-fz)+(c01[i]*(1-fx)+c11[i]*fx)*fz);
        return [x,y,z,c];
      };
      for(const t of tilesSet){
        const [tx,tz]=t.split(',').map(Number);
        for(let j=0;j<NS;j++)for(let i=0;i<NS;i++){
          const x0=tx+i/NS,x1=tx+(i+1)/NS,z0=tz+j/NS,z1=tz+(j+1)/NS;
          const a=vert(x0,z0,tx,tz),b=vert(x0,z1,tx,tz),c=vert(x1,z0,tx,tz),d=vert(x1,z1,tx,tz);
          for(const q of [a,b,c, c,b,d]){pos.push(q[0],q[1],q[2]);col.push(q[3][0],q[3][1],q[3][2]);}
        }
      }
      const g=new THREE.BufferGeometry();
      g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
      g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
      g.setAttribute('mid',new THREE.Float32BufferAttribute(new Float32Array(pos.length/3).fill(14),1));
      g.computeVertexNormals();
      const m=new THREE.Mesh(g,o.material);m.receiveShadow=true;m.castShadow=o.castShadow;m.name='hdCave';
      o.visible=false;o.userData.hdHidden=1;gr.add(m);built++;
      /* the liquids of this chamber, built like the ponds outside: a surface over the liquid
         tiles and their banks with shore and depth attributes, so the melt dissolves along the
         curved bank instead of stopping at the tile grid; the game's own tile quads hide */
      const ci=volcChamberGroups.indexOf(gr);const ch=(typeof EMBER_CHAMBERS!=='undefined')?EMBER_CHAMBERS[ci]:null;
      if(ch&&!ch.arena){
        const L=FY-0.26+0.02;
        const hAt=(x,z)=>{const tx=Math.max(ch.x0,Math.min(ch.x1,Math.floor(x))),tz=Math.max(ch.y0,Math.min(ch.y1,Math.floor(z)));return vert(x,z,tx,tz)[1];};
        for(const [T,isLavaKind] of [[T_LAVA,true],[T_WATER,false]]){
          const has=[];for(let y=ch.y0;y<=ch.y1;y++)for(let x=ch.x0;x<=ch.x1;x++)if(volcTiles[y][x]===T)has.push([x,y]);
          if(!has.length)continue;
          const gather=(x,z)=>{let mm=0,ws=0;const cx=Math.floor(x),cz=Math.floor(z);for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const tx=cx+dx,ty=cz+dy;const ddx=(tx+0.5)-x,ddy=(ty+0.5)-z;const w=Math.exp(-(ddx*ddx+ddy*ddy)/(2*0.8*0.8));ws+=w;const row=volcTiles[ty];if(row&&row[tx]===T)mm+=w;}return ws>0?mm/ws:0;};
          const nx=(ch.x1-ch.x0+1)*NS+1,nz=(ch.y1-ch.y0+1)*NS+1;
          const lp=[],ls=[],ld=[],map=new Int32Array(nx*nz).fill(-1);let vc=0;
          for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){const x=ch.x0+i/NS,z=ch.y0+j/NS;const mm=gather(x,z);if(mm<=0.002)continue;map[j*nx+i]=vc++;lp.push(x,L,z);ls.push(mm);ld.push(Math.max(0,L-hAt(x,z)));}
          if(!vc)continue;
          const idx=[];for(let j=0;j<nz-1;j++)for(let i=0;i<nx-1;i++){const a=map[j*nx+i],b=map[j*nx+i+1],c2=map[(j+1)*nx+i],d=map[(j+1)*nx+i+1];if(a<0||b<0||c2<0||d<0)continue;idx.push(a,c2,b,b,c2,d);}
          if(!idx.length)continue;
          const lg=new THREE.BufferGeometry();
          lg.setAttribute('position',new THREE.Float32BufferAttribute(lp,3));lg.setAttribute('shore',new THREE.Float32BufferAttribute(ls,1));lg.setAttribute('depth',new THREE.Float32BufferAttribute(ld,1));
          lg.setIndex(idx);lg.computeBoundingSphere();
          let lm;
          if(isLavaKind){lm=HD.lavaMaterial(false);lm.uniforms.uFlat.value=0;lm.userData.cave=1;}
          else{lm=waterMat.clone();lm.uniforms.uFlat.value=0;lm.uniforms.uReflOn.value=0;lm.userData.hdFlatWater=1;HD.flatWaterMats.push(lm);}
          const liq=new THREE.Mesh(lg,lm);liq.renderOrder=3;liq.name=isLavaKind?'hdLava':'hdCaveWater';liq.userData.hdNoAO=1;gr.add(liq);
        }
        /* the game's flat tile quads for this chamber's liquids go away */
        gr.traverse(o2=>{if(o2.isMesh&&o2.material&&(o2.material.userData.hdLava||o2.material.userData.hdFlatWater)&&o2.name!=='hdLava'&&o2.name!=='hdCaveWater')o2.visible=false;});
      }
    }
  }
  console.log('[HD] cave meshes rebuilt:',built);
}
HD.rebuildCave=rebuildCave;
/* built on the first descent (or at once if a save restores the player inside) */
if(typeof enterVolcano==='function'){const _ev=enterVolcano;enterVolcano=function(){try{rebuildCave();}catch(e){console.warn('[HD] cave',e);}return _ev.apply(this,arguments);};}
setTimeout(()=>{try{if(typeof curInterior==='function'&&curInterior()==='volcano')rebuildCave();}catch(e){}},0);
/* the Heart of the Emberdeep: the lava sea plane and the encroachment bands are the game's flat
   orange planes; they take the melt in flat mode (the game still drives their visibility) */
if(typeof _rectorLavaSea!=='undefined'&&_rectorLavaSea){_rectorLavaSea.material=HD.lavaMaterial(true);_rectorLavaSea.position.y+=0.02;}
if(typeof _rectorLavaBands!=='undefined'&&_rectorLavaBands)for(const bg of _rectorLavaBands){bg.traverse(o=>{if(o.isMesh&&o.material&&o.material.color&&o.material.color.getHex()===0xff5a1e)o.material=HD.lavaMaterial(true);});}
/* the Gauntlet's fishing spots (ember_keyspot rings) were seated on the sunk bed, under the melt;
   keep their rings just above the surface, every frame, since the game reseats them per floor */
if(typeof objects!=='undefined'&&typeof _volcFY!=='undefined'){const ks=objects.filter(o=>o.def==='ember_keyspot'&&o._m&&o._m.group);const yTop=_volcFY-0.26+0.02+0.04-0.5;HD.tick=HD.tick||[];HD.tick.push(function(){for(const o of ks){const g=o._m.group;if(g&&g.position.y<yTop-0.01)g.position.y=yTop;}});}
/* the Emberdeep's cold pools (the game's flat tile quads) take a flat-mode copy of the pond shader */
HD.flatWaterMats=HD.flatWaterMats||[];
if(typeof volcPoolMeshes!=='undefined')for(const p of volcPoolMeshes){const mm=p.mesh;if(!mm||!mm.material||mm.material.userData.hdLava)continue;const wm=waterMat.clone();wm.uniforms.uFlat.value=1;wm.uniforms.uReflOn.value=0;wm.userData.hdFlatWater=1;mm.material=wm;HD.flatWaterMats.push(wm);}
HD.tick.push(function(now){
  waterMat.uniforms.uTime.value=now*0.001;
  for(const wm of HD.flatWaterMats){wm.uniforms.uTime.value=now*0.001;if(HD.water){wm.uniforms.uZen.value=HD.water.zen;wm.uniforms.uHor.value=HD.water.hor;wm.uniforms.uSunDir.value=HD.water.sunDir;wm.uniforms.uSunCol.value=HD.water.sunCol;}}
  if(HD.refl){waterMat.uniforms.tRefl.value=HD.refl.rt.texture;waterMat.uniforms.uReflMat.value.copy(HD.refl.matrix);waterMat.uniforms.uReflY.value=HD.refl.y;waterMat.uniforms.uReflOn.value=HD.refl.active?1:0;}
  if(HD.weather)waterMat.uniforms.uRain.value=HD.weather.w.rain;
  if(typeof waterMesh!=='undefined'&&waterMesh&&waterMesh.visible&&HD.world!=='classic')waterMesh.visible=false;
});
/* the picture's own ground height (bilinear + shore easing + relief), for decals */
HD.terrainY=function(x,z){
  let y=hBilinear(x,z);
  const gw0=gatherWater(x,z);let rm=reliefMask(x,z);
  if(gw0[0]>0.001&&gw0[1]===gw0[1]&&y>gw0[1]-0.05){let sm=0;for(let a=0;a<8;a++){const an=a*Math.PI/4;sm+=hBilinear(x+Math.cos(an)*0.6,z+Math.sin(an)*0.6);}sm=(sm/8+y)*0.5;y=Math.max(y-0.12,Math.min(y+0.12,sm));rm*=1-Math.min(1,gw0[0]*4);}
  return y+relief(x,z)*rm;
};

try{performance.mark('hd:hd-terrain/lava-pools');}catch(e){}
/* ------------------------------ lava pools ------------------------------- */
/* The wilderness lava is built the way the ponds are: a per-tile level (the bank's own
   height less 0.28, so the melt sits in the carved basin), a gaussian 'shore' mask that
   dissolves it at the banks, and the true depth to the carved bed. hd-fx spawns bubbles,
   spurts and eruptions from HD.lavaTiles. */
const lavaChunks=[];HD.lavaTiles=[];
(function buildLava(){
  const isLava=[],lavaLevel=[];
  for(let y=0;y<H;y++){const row=new Uint8Array(W),lv=new Float32Array(W);for(let x=0;x<W;x++){row[x]=tiles[y][x]===T_LAVA?1:0;if(row[x]){HD.lavaTiles.push([x,y]);lv[x]=(hts[y][x]+hts[y][x+1]+hts[y+1][x]+hts[y+1][x+1])*0.25-0.28;   /* the bank's mean, so a river on a slope keeps its depth */}}isLava.push(row);lavaLevel.push(lv);}
  if(!HD.lavaTiles.length)return;
  const mat=HD.lavaMaterial(false);
  function gatherLava(x,z){let m=0,ws=0,lv=0,lw=0;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const ix=Math.round(x-0.5)+dx,iy=Math.round(z-0.5)+dy;if(ix<0||iy<0||ix>=W||iy>=H)continue;const ddx=(ix+0.5)-x,ddy=(iy+0.5)-z;const w=Math.exp(-(ddx*ddx+ddy*ddy)/(2*0.8*0.8));ws+=w;if(isLava[iy][ix]){m+=w;lv+=lavaLevel[iy][ix]*w;lw+=w;}}return [ws>0?m/ws:0,lw>0?lv/lw:NaN];}
  HD.lavaLevelAt=function(x,z){const g=gatherLava(x,z);return g[1]===g[1]?g[1]:NaN;};
  for(let cz0=0;cz0<H;cz0+=CH)for(let cx0=0;cx0<W;cx0+=CH){
    const cw=Math.min(CH,W-cx0),chh=Math.min(CH,H-cz0);
    let any=false;for(let y=Math.max(0,cz0-2);y<Math.min(H,cz0+chh+2)&&!any;y++)for(let x=Math.max(0,cx0-2);x<Math.min(W,cx0+cw+2);x++)if(isLava[y][x]){any=true;break;}
    if(!any)continue;
    const nx=cw*N+1,nz=chh*N+1;
    const pos=[],sh=[],dep=[],map=new Int32Array(nx*nz).fill(-1);let vcount=0;
    for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){
      const x=cx0+i/N,z=cz0+j/N;
      const [m,lv]=gatherLava(x,z);
      if(m<=0.002||lv!==lv)continue;
      map[j*nx+i]=vcount++;
      pos.push(x,lv,z);sh.push(m);dep.push(Math.max(0,lv-hBilinear(x,z)));
    }
    if(!vcount)continue;
    const idx=[];
    for(let j=0;j<nz-1;j++)for(let i=0;i<nx-1;i++){const a=map[j*nx+i],b=map[j*nx+i+1],c=map[(j+1)*nx+i],d=map[(j+1)*nx+i+1];if(a<0||b<0||c<0||d<0)continue;idx.push(a,c,b,b,c,d);}
    if(!idx.length)continue;
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    g.setAttribute('shore',new THREE.Float32BufferAttribute(sh,1));
    g.setAttribute('depth',new THREE.Float32BufferAttribute(dep,1));
    g.setIndex(idx);g.computeBoundingSphere();
    const m=new THREE.Mesh(g,mat);m.renderOrder=3;m.name='hdLava';m.userData.hdNoAO=1;
    worldGroup.add(m);lavaChunks.push(m);
  }
})();
console.log('[HD] terrain:',terrainChunks.length,'chunks, water:',waterChunks.length,'chunks, lava:',lavaChunks.length);
})();
