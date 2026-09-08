/* ============================================================================
   Milville HD — pre-game layer.  Loaded AFTER three.js and BEFORE the game.

   The game builds its whole world from flat-coloured Lambert primitives. Rather
   than touch the ~130 material sites and ~2,800 primitive calls, this file
   swaps the CLASSES the game constructs:

     THREE.MeshLambertMaterial / MeshPhongMaterial  ->  physically based
        MeshStandardMaterial with a triplanar surface-detail shader hook
        (brick, stone, wood, slate, foliage, plaster ... chosen from the
        colour the game asked for, or from a per-vertex material id that the
        game's bake() pipeline records).
     THREE.MeshBasicMaterial  -> same class, but with the colour treated as
        sRGB so unlit glows keep their authored hue under the new pipeline.
     Cylinder / Cone / Sphere geometry  ->  higher segment counts, so the
        silhouettes read as round rather than pentagonal.
     CanvasTexture -> sRGB encoded, so the game's painted banners/shields
        decode correctly.

   Everything the game authored is an sRGB colour (it was tuned by eye on a
   linear-output renderer). We render in linear light with sRGB output, so
   every authored colour is converted with pow(2.2) in the shader: material
   colour, vertex colour, emissive. That keeps the palette the artist chose.

   Gameplay is untouched: nothing here reads or writes game state.
   ========================================================================== */
(function(){
'use strict';
try{performance.mark('hd:hd-pre');}catch(e){}
if(typeof THREE==='undefined')return;
/* ?hd=off loads the original renderer for side-by-side comparison */
if(/[?&]hd=off\b/.test(location.search))return;
const HD=window.HD={ready:false,tex:{},detail:null,quality:'high',version:'hd-1',build:'2026-09-08d'};   /* build: bump with every deploy; shown in the lobby and the console */
console.log('[HD] build',HD.build);
/* the interface theme: appended after the game's own <style>, so it wins the cascade;
   never added under ?hd=off, so the original look stays intact for comparison */
{const l=document.createElement('link');l.rel='stylesheet';l.href='hd/hd-ui.css';document.head.appendChild(l);}
/* the pixel logo canvas stays: the owner wants the RuneScape faces kept */
/* a phone (coarse pointer or a narrow screen) starts on Low with a short draw distance; the
   player can still pick a higher setting, which is remembered */
HD.phone=false;try{HD.phone=(window.matchMedia&&matchMedia('(pointer:coarse)').matches)||Math.min(screen.width,screen.height)<=760;}catch(e){}
try{ HD.quality=localStorage.getItem('milville-hd-quality')||(HD.phone?'low':'high'); }catch(e){HD.quality=HD.phone?'low':'high';}
if(HD.phone){HD.drawNear=52;HD.drawFar=150;}

/* ----------------------------- noise kit ------------------------------- */
function mulberry(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
/* tileable value noise: N x N lattice, sample in [0,1) wraps seamlessly */
function makeNoise(seed,N){
  const R=mulberry(seed),g=new Float32Array(N*N);for(let i=0;i<N*N;i++)g[i]=R();
  const sm=t=>t*t*(3-2*t);
  return function(u,v){
    const x=u*N,y=v*N,xi=Math.floor(x),yi=Math.floor(y),fx=sm(x-xi),fy=sm(y-yi);
    const x0=((xi%N)+N)%N,y0=((yi%N)+N)%N,x1=(x0+1)%N,y1=(y0+1)%N;
    const a=g[y0*N+x0],b=g[y0*N+x1],c=g[y1*N+x0],d=g[y1*N+x1];
    return (a+(b-a)*fx)*(1-fy)+(c+(d-c)*fx)*fy;
  };
}
function fbm(seed,u,v,oct,gain){
  let a=0,amp=0.5,sum=0;
  for(let i=0;i<oct;i++){const n=fbm._n[seed+'_'+i]||(fbm._n[seed+'_'+i]=makeNoise(seed*31+i*7,8<<i));a+=n(u,v)*amp;sum+=amp;amp*=gain;}
  return a/sum;
}
fbm._n={};
/* tileable Worley (cellular) distance, F1 and F2 */
function makeWorley(seed,N){
  const R=mulberry(seed),pts=[];
  for(let y=0;y<N;y++)for(let x=0;x<N;x++)pts.push([(x+R())/N,(y+R())/N]);
  return function(u,v){
    let f1=9,f2=9;const cx=Math.floor(u*N),cy=Math.floor(v*N);
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      const px=((cx+dx)%N+N)%N,py=((cy+dy)%N+N)%N,p=pts[py*N+px];
      let ox=p[0]-u,oy=p[1]-v; if(ox>0.5)ox-=1;if(ox<-0.5)ox+=1;if(oy>0.5)oy-=1;if(oy<-0.5)oy+=1;
      const d=Math.sqrt(ox*ox+oy*oy);
      if(d<f1){f2=f1;f1=d;}else if(d<f2)f2=d;
    }
    return [f1,f2];
  };
}

/* ------------------------- texture synthesis --------------------------- */
const TS=512;
/* returns {rgb:Float32Array(TS*TS*3) in 0..1 (mid-grey ~0.5 detail), h:Float32Array height 0..1} */
function synth(kind){
  const rgb=new Float32Array(TS*TS*3),h=new Float32Array(TS*TS);
  const set=(i,r,g,b,hh)=>{rgb[i*3]=r;rgb[i*3+1]=g;rgb[i*3+2]=b;h[i]=hh;};
  const wor=makeWorley(kind.length*13+7,10),wor2=makeWorley(kind.length*17+3,22);
  const R=mulberry(kind.length*101);
  /* pre-scatter pebbles for dirt */
  /* a few larger, softer stones in broad painted mottling, not photographic gravel */
  const peb=[];if(kind==='dirt')for(let i=0;i<220;i++)peb.push([R(),R(),0.004+R()*0.011,0.45+R()*0.4]);
  /* grass blades: a pre-rendered field of short bright strokes, so the lawn has relief */
  let blades=null;
  if(kind==='grass'){
    const c=document.createElement('canvas');c.width=c.height=TS;const g=c.getContext('2d');
    g.fillStyle='#808080';g.fillRect(0,0,TS,TS);
    for(let i=0;i<14000;i++){const x=R()*TS,y=R()*TS,len=7+R()*12,a=(R()-0.5)*1.2-Math.PI/2,l=(R()*110)|0;
      g.strokeStyle='rgb('+(80+l)+','+(80+l)+','+(80+l)+')';g.lineWidth=0.8+R()*0.9;g.beginPath();g.moveTo(x,y);g.lineTo(x+Math.cos(a)*len,y+Math.sin(a)*len);g.stroke();
      /* wrap the ones that run off the edge */
      if(x+Math.cos(a)*len<0||y+Math.sin(a)*len<0){g.beginPath();g.moveTo(x+TS,y+TS);g.lineTo(x+TS+Math.cos(a)*len,y+TS+Math.sin(a)*len);g.stroke();}
    }
    const d=g.getImageData(0,0,TS,TS).data;blades=new Float32Array(TS*TS);for(let i=0;i<TS*TS;i++)blades[i]=d[i*4]/255;
  }
  for(let y=0;y<TS;y++)for(let x=0;x<TS;x++){
    const u=x/TS,v=y/TS,i=y*TS+x;
    let r,g,b,hh;
    if(kind==='grass'){
      /* linear-light albedo of a lawn: clumps, dry patches, blade relief */
      const n1=fbm(1,u*2,v*2,5,0.55),n2=fbm(2,u*6,v*6,4,0.5),dry=fbm(24,u*0.7,v*0.7,3,0.5);
      const bl=blades?blades[i]:0.5;
      const hue=fbm(29,u*3.3,v*3.3,3,0.5);                     /* clump-scale drift: yellow-green .. blue-green */
      hh=n1*0.6+n2*0.25+bl*0.15;
      const k=0.92+(n1-0.5)*0.5+(n2-0.5)*0.3+(bl-0.5)*0.18;
      const dryk=Math.max(0,dry-0.58)*2.4;
      /* lawn green in linear light (~sRGB 90,140,50), straw-yellow in the dry patches, and every
         clump leaning a little warmer or cooler than its neighbour */
      const yw=(hue-0.5)*0.9;
      r=(0.10+dryk*0.12+Math.max(0,yw)*0.06)*k;g=(0.25-dryk*0.02+yw*0.02)*k;b=(0.035+dryk*0.01+Math.max(0,-yw)*0.035)*k;
    }else if(kind==='dirt'){
      /* packed gravel path: sandy fines with embedded stones */
      const n1=fbm(4,u,v,6,0.55),n2=fbm(5,u*4,v*4,4,0.5);
      hh=n1*0.6+n2*0.25;
      let stone=0,sk=0;
      for(const p of peb){let dx=u-p[0],dy=v-p[1];if(dx>0.5)dx-=1;if(dx<-0.5)dx+=1;if(dy>0.5)dy-=1;if(dy<-0.5)dy+=1;const d=Math.sqrt(dx*dx+dy*dy);if(d<p[2]){const k2=1-d/p[2];hh=Math.max(hh,0.55+k2*k2*0.45);stone=Math.max(stone,Math.min(1,k2*3.0));sk=p[3];}}
      const k=0.88+(n1-0.5)*0.42+(n2-0.5)*0.16;
      /* packed sandy fines (~sRGB 158,145,122) with grey stones */
      const sr=0.2+sk*0.18,sg=0.2+sk*0.17,sb=0.19+sk*0.16;
      r=(0.34*k)*(1-stone)+sr*stone;g=(0.285*k)*(1-stone)+sg*stone;b=(0.20*k)*(1-stone)+sb*stone;
    }else if(kind==='stone'){
      const w=wor(u,v),edge=Math.min(1,(w[1]-w[0])*9),n=fbm(6,u*3,v*3,4,0.5);
      hh=edge*0.7+n*0.3;
      const l=0.40+(hh-0.5)*0.55;
      r=l*1.0;g=l*1.0;b=l*1.0;
    }else if(kind==='brick'){
      const rows=10,row=Math.floor(v*rows),off=(row%2)*0.5,bu=((u+off)%1),bv=v*rows-row;
      const bw=1/4.2,col=Math.floor(bu/bw);
      const mx=(bu%bw)/bw,my=bv;
      const mortarX=0.055/bw*0.25,mortarY=0.09;
      const inB=(mx>mortarX&&mx<1-mortarX&&my>mortarY&&my<1-mortarY);
      const bn=fbm(7,u*3,v*3,3,0.5),grain=fbm(8,u*12,v*12,3,0.5);
      const tint=mulberry(row*97+col*13+Math.floor(u*4.2+off))()*0.18;
      if(inB){hh=0.62+grain*0.12;const l=0.48+(bn-0.5)*0.22+tint-0.08;r=l*1.08;g=l*0.94;b=l*0.9;}
      else{hh=0.32+grain*0.1;const l=0.52;r=l*0.98;g=l*0.98;b=l*0.96;}
    }else if(kind==='wood'){
      const wob=fbm(9,u*1.5,v*0.25,3,0.5);
      const ring=Math.sin((u*9+wob*2.2)*Math.PI*2)*0.5+0.5;
      const fine=fbm(10,u*40,v*1.5,3,0.5);
      hh=ring*0.55+fine*0.45;
      const l=0.42+(ring-0.5)*0.22+(fine-0.5)*0.16;
      r=l*1.06;g=l*0.96;b=l*0.86;
    }else if(kind==='slate'){
      const rows=8,row=Math.floor(v*rows),off=(row%2)*0.5,tu=((u+off)%1),tv=v*rows-row;
      const cols=6,c=Math.floor(tu*cols),mx=tu*cols-c;
      const n=fbm(11,u*5,v*5,3,0.5);
      const edge=(mx<0.04||tv<0.06)?0:1;
      const tint=mulberry(row*57+c*11)()*0.16;
      hh=edge*(0.45+tv*0.25)+n*0.2;
      const l=(edge?0.46:0.28)+tint-0.08+(n-0.5)*0.15;
      r=l*0.98;g=l*1.0;b=l*1.04;
    }else if(kind==='foliage'){
      const w=wor2(u,v),clump=1-Math.min(1,w[0]*5),n=fbm(12,u*3,v*3,4,0.5);
      hh=clump*0.6+n*0.4;
      const l=0.42+(hh-0.5)*0.5;
      r=l*0.9;g=l*1.05;b=l*0.85;
    }else if(kind==='rock'){
      /* cave and boulder rock: big irregular plates with soft shoulders, hairline cracks between
         them, a grain over everything; grey with a warm cast */
      const w=wor(u,v),n=fbm(27,u*2.5,v*2.5,4,0.55),g2=fbm(28,u*9,v*9,3,0.5);
      const shoulder=Math.min(1,(w[1]-w[0])*3.2);              /* 0 at a crack, 1 mid-plate */
      const crack=1-Math.min(1,(w[1]-w[0])*14);
      hh=shoulder*0.45+n*0.4+g2*0.15;
      const l=0.36+(shoulder-0.5)*0.14+(n-0.5)*0.3+(g2-0.5)*0.1-crack*0.18;
      r=l*1.04;g=l*0.98;b=l*0.92;
    }else if(kind==='plaster'){
      const n=fbm(13,u*2,v*2,5,0.55);
      hh=n;const l=0.48+(n-0.5)*0.14;r=l;g=l;b=l;
    }else if(kind==='cloth'){
      /* a weave: two crossed sine ridges plus fibre noise */
      const wv=(Math.sin(u*Math.PI*2*48)*0.5+0.5)*(Math.sin(v*Math.PI*2*48)*0.5+0.5);
      const n=fbm(21,u*6,v*6,3,0.5);hh=wv*0.6+n*0.4;const l=0.5+(hh-0.5)*0.1;r=l;g=l;b=l;
    }else if(kind==='skin'){
      const n=fbm(22,u*10,v*10,3,0.5),n2=fbm(23,u*2,v*2,3,0.5);hh=n*0.6+n2*0.4;const l=0.5+(hh-0.5)*0.05;r=l*1.01;g=l;b=l*0.99;
    }else if(kind==='hide'){
      /* creature hide: overlapping scales / leathery pebbling, fur-like streaks at the small scale */
      const w=wor2(u,v),sc=1-Math.min(1,w[0]*7),n=fbm(25,u*3,v*3,3,0.5),fur=fbm(26,u*30,v*4,2,0.5);
      hh=sc*0.62+n*0.3+fur*0.08;const l=0.5+(hh-0.5)*0.12;r=l;g=l;b=l;
    }else if(kind==='glass'){
      const n=fbm(20,u*1.5,v*1.5,3,0.5);hh=0.5+(n-0.5)*0.2;const l=0.5+(n-0.5)*0.04;r=l;g=l;b=l;
    }else if(kind==='metal'){
      const n=fbm(14,u*6,v*1,4,0.5),sc=fbm(15,u*1,v*8,3,0.5);
      hh=n*0.6+sc*0.4;const l=0.5+(hh-0.5)*0.12;r=l;g=l;b=l;
    }else if(kind==='waterN'){
      const a=fbm(16,u*2,v*2,5,0.55),b2=fbm(17,u*5+0.3,v*5,4,0.5);
      hh=a*0.65+b2*0.35;r=g=b=hh;
    }else if(kind==='cloud'){
      const n=fbm(18,u,v,6,0.6);hh=n;r=g=b=n;
    }else{ /* generic fine noise */
      const n=fbm(19,u*4,v*4,4,0.5);hh=n;const l=0.5+(n-0.5)*0.12;r=l;g=l;b=l;
    }
    set(i,Math.min(1,r),Math.min(1,g),Math.min(1,b),hh);
  }
  return {rgb,h};
}
function heightToNormal(h,strength){
  const out=new Uint8Array(TS*TS*4);
  for(let y=0;y<TS;y++)for(let x=0;x<TS;x++){
    const xl=h[y*TS+((x-1+TS)%TS)],xr=h[y*TS+((x+1)%TS)],yu=h[((y-1+TS)%TS)*TS+x],yd=h[((y+1)%TS)*TS+x];
    let nx=(xl-xr)*strength,ny=(yu-yd)*strength,nz=1;
    const l=Math.sqrt(nx*nx+ny*ny+nz*nz);nx/=l;ny/=l;nz/=l;
    const i=(y*TS+x)*4;out[i]=(nx*0.5+0.5)*255;out[i+1]=(ny*0.5+0.5)*255;out[i+2]=(nz*0.5+0.5)*255;out[i+3]=255;
  }
  return out;
}
/* layer order is the material id the shader receives */
HD.LAYERS=['generic','grass','dirt','stone','brick','wood','slate','foliage','plaster','metal','glass','cloth','skin','hide','rock'];
/* RS3's surfaces read as hand-painted: relief is suggested, not photographed, so the normal
   maps are kept soft */
const NSTR={generic:1.2,grass:1.3,dirt:3,stone:4,brick:5,wood:3,slate:4.5,foliage:3.5,plaster:1.5,metal:1.5,glass:0.6,cloth:1.8,skin:0.8,hide:2.5,rock:4.5};

HD.buildTextures=function(){
  if(HD.detail)return HD.detail;
  const L=HD.LAYERS.length,N=TS*TS*4;
  /* the arrays start flat (mid-grey albedo, a flat normal) so the world renders at once; the
     real detail arrives from the browser's own cache of an earlier visit, or is synthesised a
     layer at a time in deferred slices behind the lobby, then cached for next time */
  const alb=new Uint8Array(N*L).fill(128),nrm=new Uint8Array(N*L);
  for(let i=0;i<N*L;i+=4){nrm[i]=128;nrm[i+1]=128;nrm[i+2]=255;nrm[i+3]=255;}
  const mk=(data)=>{const t=new THREE.DataTexture2DArray(data,TS,TS,L);t.format=THREE.RGBAFormat;t.type=THREE.UnsignedByteType;
    t.wrapS=t.wrapT=THREE.RepeatWrapping;t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;t.generateMipmaps=true;t.anisotropy=8;t.needsUpdate=true;return t;};
  HD.detail={albedo:mk(alb),normal:mk(nrm)};
  /* stand-alone maps, flat for now */
  const flatCanvas=(normal)=>{const c=document.createElement('canvas');c.width=c.height=TS;const g=c.getContext('2d');g.fillStyle=normal?'#8080ff':'#808080';g.fillRect(0,0,TS,TS);
    const t=new THREE.CanvasTexture(c);t.encoding=THREE.LinearEncoding;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;return t;};
  HD.tex.waterN=flatCanvas(true);HD.tex.cloud=flatCanvas(false);
  const paintCanvas=(t,bytes)=>{const g=t.image.getContext('2d');const id=g.createImageData(TS,TS);id.data.set(bytes);g.putImageData(id,0,0);t.needsUpdate=true;retexture(t.image);};
  /* a material made before the paint may hold a clone of the texture (UniformsUtils.merge clones
     textures); the clone shares the canvas but has its own version, so it is bumped here */
  function retexture(img){if(typeof scene==='undefined')return;const seen=new Set();scene.traverse(o=>{const ms=o.material?(Array.isArray(o.material)?o.material:[o.material]):[];for(const m of ms){if(!m||seen.has(m))continue;seen.add(m);
    if(m.uniforms)for(const k in m.uniforms){const v=m.uniforms[k]&&m.uniforms[k].value;if(v&&v.isTexture&&v.image===img)v.needsUpdate=true;}
    for(const k of ['map','normalMap','roughnessMap','emissiveMap','alphaMap']){const v=m[k];if(v&&v.isTexture&&v.image===img)v.needsUpdate=true;}}});}
  HD.retexture=retexture;
  const layerBytes=(kind,normal)=>{const s=synth(kind);if(normal)return heightToNormal(s.h,normal);const b=new Uint8Array(N);for(let i=0;i<TS*TS;i++){b[i*4]=s.rgb[i*3]*255;b[i*4+1]=s.rgb[i*3+1]*255;b[i*4+2]=s.rgb[i*3+2]*255;b[i*4+3]=255;}return b;};
  const KEY='hdtex-v1-'+TS+'-'+HD.LAYERS.join(',');
  const idb=(mode,fn)=>new Promise((res,rej)=>{try{const r=indexedDB.open('milville-hd',1);r.onupgradeneeded=()=>{r.result.createObjectStore('tex');};r.onerror=()=>rej(r.error);
    r.onsuccess=()=>{const db=r.result;const tx=db.transaction('tex',mode);const st=tx.objectStore('tex');const q=fn(st);tx.oncomplete=()=>{db.close();res(q&&q.result);};tx.onerror=()=>rej(tx.error);};}catch(e){rej(e);}});
  const apply=(d)=>{alb.set(d.alb);nrm.set(d.nrm);HD.detail.albedo.needsUpdate=true;HD.detail.normal.needsUpdate=true;paintCanvas(HD.tex.waterN,d.waterN);paintCanvas(HD.tex.cloud,d.cloud);HD.texReady=true;};
  const synthesise=()=>{const t0=performance.now();let waterN=null,cloud=null;
    for(let k=0;k<L;k++)HD.defer(()=>{const s=synth(HD.LAYERS[k]);const n=heightToNormal(s.h,NSTR[HD.LAYERS[k]]||4);const o=k*N;
      for(let i=0;i<TS*TS;i++){alb[o+i*4]=s.rgb[i*3]*255;alb[o+i*4+1]=s.rgb[i*3+1]*255;alb[o+i*4+2]=s.rgb[i*3+2]*255;alb[o+i*4+3]=s.h[i]*255;}
      nrm.set(n,o);HD.detail.albedo.needsUpdate=true;HD.detail.normal.needsUpdate=true;});
    HD.defer(()=>{waterN=layerBytes('waterN',6);paintCanvas(HD.tex.waterN,waterN);});
    HD.defer(()=>{cloud=layerBytes('cloud',0);paintCanvas(HD.tex.cloud,cloud);HD.texReady=true;console.log('[HD] textures synthesised in',Math.round(performance.now()-t0),'ms (deferred)');
      idb('readwrite',st=>st.put({alb,nrm,waterN,cloud},KEY)).catch(()=>{});});};
  idb('readonly',st=>st.get(KEY)).then(d=>{if(d&&d.alb&&d.alb.length===N*L){apply(d);console.log('[HD] textures from cache');}else synthesise();}).catch(()=>synthesise());
  return HD.detail;
};

/* --------------------- colour -> surface classifier -------------------- */
function hsl(hex){
  const r=((hex>>16)&255)/255,g=((hex>>8)&255)/255,b=(hex&255)/255;
  const mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2;let h=0,s=0;
  if(mx!==mn){const d=mx-mn;s=l>0.5?d/(2-mx-mn):d/(mx+mn);
    if(mx===r)h=((g-b)/d+(g<b?6:0));else if(mx===g)h=(b-r)/d+2;else h=(r-g)/d+4;h*=60;}
  return [h,s,l];
}
HD.classify=function(hex){
  if(typeof hex!=='number')return 0;
  const [h,s,l]=hsl(hex);
  if(l>0.86&&s<0.35)return 8;                        /* plaster / trim / snow */
  if(s<0.14){ return l>0.66?8:(l<0.45?6:3); }         /* greys: clapboard/plaster when light, slate when dark, stone between */
  if(h>=62&&h<=170&&s>0.18&&l<0.62)return 7;          /* greens: foliage */
  if(h>=345||h<24){ if(s>0.28&&s<=0.62&&l>0.16&&l<0.5)return 4; }  /* brick reds (dyed cloth is more saturated) */
  if(h>=18&&h<=48&&s>0.18&&s<0.75&&l>0.12&&l<0.5)return 5; /* browns: wood */
  if(h>=195&&h<=235&&s>=0.2&&s<=0.42&&l>=0.15&&l<=0.34)return 10;   /* the dark slate-blue of every window pane: glass (navy cloth is more saturated) */
  if(h>=165&&h<=215&&s>=0.2&&s<=0.5&&l>=0.66&&l<=0.88)return 10;   /* the pale blue-grey panes of the newer buildings are glass too, not plaster */
  if(h>=14&&h<=42&&s>=0.25&&s<=0.75&&l>=0.55&&l<=0.86)return 12;     /* skin tones */
  if(s>=0.35&&l>=0.18&&l<=0.72)return 11;                            /* any other saturated colour is dyed cloth */
  if(h>=195&&h<=250&&s>0.1&&l>0.3&&l<0.7)return 9;    /* steel blues: metal */
  return 0;
};
/* A material colour that is a known equipment tint is classified by what the item IS
   (steel plate is metal even when its grey reads as stone; a cape is cloth even when its
   red reads as brick). hd-post fills HD.tintClass from ITEMS. */
HD.tintClass=null;
HD.classifyMat=function(hex){const t=HD.tintClass&&HD.tintClass.get(hex);return t!==undefined?t:HD.classify(hex);};
/* ids the shader treats as strongly textured; others get only micro-detail */
HD.classifyMaterial=function(m){
  if(m.map||m.vertexColors)return -1;                 /* per-vertex id or a real texture */
  return HD.classify(m.color?m.color.getHex():0xffffff);
};

/* --------------------------- shader hook --------------------------------- */
const VERT_DECL=`
varying vec3 vHDPos; varying vec3 vHDNorm; varying float vHDMid;
attribute float mid;`;
const VERT_BODY=`
#include <worldpos_vertex>
vHDPos=(modelMatrix*vec4(transformed,1.0)).xyz;
vHDNorm=normalize(mat3(modelMatrix)*objectNormal);
vHDMid=mid;`;
const FRAG_DECL=`
varying vec3 vHDPos; varying vec3 vHDNorm; varying float vHDMid;
uniform highp sampler2DArray tHDAlbedo; uniform highp sampler2DArray tHDNormal;
uniform float uHDMid; uniform float uHDMode; uniform float uHDAlb; uniform float uHDNrm; uniform float uHDScale;
uniform sampler2D tHDGround; uniform vec4 uHDGround;   /* xy: 1/W,1/H  z: min height  w: height range */
uniform samplerCube tHDCube; uniform float uHDCubeOn;
vec3 hdW(vec3 n){vec3 w=abs(n);w=w*w*w*w;return w/(w.x+w.y+w.z+1e-5);}
/* world units per texture repeat differ per surface: a brick is 0.12 units, a grass tuft 0.3 */
float hdScaleFor(float id){
  if(id<0.5)return 2.0; if(id<1.5)return 0.55; if(id<2.5)return 0.5; if(id<3.5)return 1.1;
  if(id<4.5)return 2.3; if(id<5.5)return 1.6; if(id<6.5)return 1.7; if(id<7.5)return 1.4;
  if(id<8.5)return 1.2; if(id<9.5)return 2.0; if(id<10.5)return 0.7; if(id<11.5)return 4.0; if(id<12.5)return 3.0; if(id<13.5)return 3.2; return 0.45; }
vec4 hdAlb(float id,vec3 p,vec3 w,float s){
  return texture(tHDAlbedo,vec3(p.zy*s,id))*w.x+texture(tHDAlbedo,vec3(p.xz*s,id))*w.y+texture(tHDAlbedo,vec3(p.xy*s,id))*w.z;
}
vec3 hdNrm(float id,vec3 p,vec3 n,vec3 w,float s){
  vec3 tx=texture(tHDNormal,vec3(p.zy*s,id)).xyz*2.0-1.0;
  vec3 ty=texture(tHDNormal,vec3(p.xz*s,id)).xyz*2.0-1.0;
  vec3 tz=texture(tHDNormal,vec3(p.xy*s,id)).xyz*2.0-1.0;
  tx=vec3(tx.xy+n.zy,abs(tx.z)*n.x);
  ty=vec3(ty.xy+n.xz,abs(ty.z)*n.y);
  tz=vec3(tz.xy+n.xy,abs(tz.z)*n.z);
  return normalize(tx.zyx*w.x+ty.xzy*w.y+tz.xyz*w.z);
}`;
/* mode 0: a single layer, from the uniform when >=0 else from the vertex id.
   mode 1: terrain — grass / dirt chosen by how green the painted vertex colour is,
           rock creeping in on steep slopes. */
const FRAG_BODY=`
vec3 hdN=normalize(vHDNorm); vec3 hdWt=hdW(hdN);
float hdId=uHDMid>=0.0?uHDMid:vHDMid;
vec4 hdA; vec3 hdDN;
if(uHDMode>0.5){
  vec3 hdC=vColorLin;
  /* how green the painted tile is, on a hue basis: the campus lawn is a yellowish green
     that a plain g-max(r,b) test calls half gravel */
  float grn=clamp((hdC.g-0.72*hdC.r-0.4*hdC.b)*6.0,0.0,1.0);
  float lum=dot(hdC,vec3(0.33));
  float snow=smoothstep(0.55,0.8,lum);
  /* banks: bare earth on a moderate slope, exposed rock only where it is near-vertical */
  float slopeMild=1.0-smoothstep(0.72,0.92,hdN.y);
  float slope=1.0-smoothstep(0.3,0.55,hdN.y);
  /* two scales of each ground texture, so neither tiling nor blur shows at any camera distance */
  vec4 aG=mix(hdAlb(1.0,vHDPos,hdWt,uHDScale*1.3),hdAlb(1.0,vHDPos+vec3(3.7,0.0,5.1),hdWt,uHDScale*0.4),0.35);
  vec4 aD=mix(hdAlb(2.0,vHDPos,hdWt,uHDScale*1.4),hdAlb(2.0,vHDPos+vec3(1.3,0.0,2.9),hdWt,uHDScale*0.5),0.4);
  vec4 aS=hdAlb(3.0,vHDPos,hdWt,uHDScale*1.3);
  vec3 nG=hdNrm(1.0,vHDPos,hdN,hdWt,uHDScale*1.3), nD=hdNrm(2.0,vHDPos,hdN,hdWt,uHDScale*1.4), nS=hdNrm(3.0,vHDPos,hdN,hdWt,uHDScale*1.3);
  /* height-aware blend: grass creeps over the gravel where its blades stand higher */
  float m=smoothstep(0.32,0.68,grn+(aG.a-aD.a)*0.35);
  hdA=mix(aD,aG,m); hdDN=normalize(mix(nD,nG,m));
  /* large-scale variation breaks the repeat: dry and lush patches across the lawn */
  float macro=hdAlb(0.0,vHDPos*0.045,hdWt,1.0).r;
  float macro2=hdAlb(0.0,vHDPos*0.021+vec3(9.0,0.0,4.0),hdWt,1.0).r;
  float macro3=hdAlb(0.0,vHDPos*0.09+vec3(21.0,0.0,13.0),hdWt,1.0).r;
  float mottle=hdAlb(0.0,vHDPos*0.6+vec3(3.0,0.0,8.0),hdWt,1.0).r;
  /* worn ground: where the large noise runs low the turf thins and the earth shows through */
  float worn=clamp((0.38-macro2)*4.0,0.0,1.0)*m;
  hdA=mix(hdA,aD,worn*0.85); hdDN=normalize(mix(hdDN,nD,worn*0.7));
  hdA.rgb*=0.84+0.34*macro;
  hdA.rgb*=0.9+0.2*mottle;
  /* the lawn is never one green: sun-bleached yellow-green here, cool blue-green there */
  hdA.rgb=mix(hdA.rgb,hdA.rgb*vec3(1.18,1.06,0.72),clamp((macro2-0.45)*3.0,0.0,1.0)*m);
  hdA.rgb=mix(hdA.rgb,hdA.rgb*vec3(0.86,1.0,0.98),clamp((macro3-0.55)*3.5,0.0,1.0)*m);
  hdA.rgb=mix(hdA.rgb,hdA.rgb*vec3(1.1,1.02,0.8),clamp((0.42-macro3)*3.5,0.0,1.0)*m);
  /* paths: a worn, lighter crown with darker, damper edges */
  hdA.rgb=mix(hdA.rgb,hdA.rgb*(0.9+0.25*macro3),1.0-m);
  vec3 earth=vec3(0.22,0.16,0.10)*(0.7+0.6*aD.a);
  hdA.rgb=mix(hdA.rgb,earth,slopeMild*0.85); hdDN=normalize(mix(hdDN,nD,slopeMild*0.6));
  vec3 rock=aS.rgb*0.62;
  hdA.rgb=mix(hdA.rgb,rock,slope*0.8); hdDN=normalize(mix(hdDN,nS,slope));
  /* snow: a soft powder from the generic grain at two scales, a fine glint, no cobbles */
  float pw=hdAlb(0.0,vHDPos*0.35,hdWt,1.0).r*0.6+hdAlb(0.0,vHDPos*1.6+vec3(4.0,0.0,7.0),hdWt,1.0).r*0.4;
  float glint=step(0.975,hdAlb(0.0,vHDPos*6.0,hdWt,1.0).r)*0.5;
  hdA.rgb=mix(hdA.rgb,vec3(0.84,0.87,0.93)*(0.86+0.28*pw)+glint,snow); hdDN=normalize(mix(hdDN,hdN,snow*0.9));
  /* the painted map now only TINTS: campus lawn is the reference, wilderness scrub darkens,
     lava fields redden, paths stay gravel-coloured */
  vec3 ref=mix(vec3(0.34,0.285,0.20),vec3(0.10,0.25,0.035),m);
  ref=mix(ref,vec3(0.72,0.72,0.72),snow);
  vec3 tint=clamp(hdC/max(ref,vec3(0.01)),vec3(0.4),vec3(1.6));
  tint=mix(vec3(1.0),tint,0.35);
  diffuseColor.rgb=hdA.rgb*tint;
  #ifdef HD_WET
  /* the wilderness: darker, greyer, trodden earth, its own ground and not the campus path */
  float wk=vHDWild*(1.0-m*0.55)*(1.0-snow);
  float wmot=hdAlb(0.0,vHDPos*0.07+vec3(2.0,0.0,5.0),hdWt,1.0).r;
  vec3 wildE=diffuseColor.rgb*vec3(0.5,0.45,0.42)*(0.75+0.5*wmot)+vec3(0.015,0.012,0.01);
  diffuseColor.rgb=mix(diffuseColor.rgb,wildE,wk);
  #endif
  #ifdef HD_WET
    float wetk=max(vHDWet,uHDWet*0.7);
    diffuseColor.rgb*=1.0-0.4*wetk;
  #endif
}else{
  float hdS=hdScaleFor(hdId)*uHDScale;
  hdA=hdAlb(hdId,vHDPos,hdWt,hdS);
  hdDN=hdNrm(hdId,vHDPos,hdN,hdWt,hdS);
  /* where a wall, post or boulder meets the ground it collects a band of grime and a
     contact shadow; the terrain height comes from a baked heightmap of the overworld */
  /* window glass: a real reflection of the surroundings (a live cube map taken at the
     player), fresnel-weighted, over a dark tinted pane */
  if(hdId>9.5&&hdId<10.5){
    vec3 gV=normalize(cameraPosition-vHDPos);
    vec3 gN=normalize(hdDN);
    float gfr=0.10+0.70*pow(1.0-max(dot(gV,gN),0.0),3.0);
    vec3 gR=reflect(-gV,gN);
    /* a soft reflection (mip-biased so trees read as tone, not blobs), kept under the dark pane
       so a window never washes out to a white slab; brighter toward the top of each pane where
       the sky is what it reflects */
    vec3 gref=uHDCubeOn>0.5?textureCube(tHDCube,gR,2.5).rgb:vec3(0.5,0.6,0.7);
    gref=mix(vec3(0.42,0.5,0.62),gref,0.6);
    float gband=0.75+0.25*clamp((fract(vHDPos.y*0.9)-0.3)*1.6,0.0,1.0);
    totalEmissiveRadiance+=gref*gfr*0.62*gband;
    diffuseColor.rgb*=0.32;
  }
  if(uHDGround.w>0.0){
    float gh=uHDGround.z+texture2D(tHDGround,vHDPos.xz*uHDGround.xy).r*uHDGround.w;
    float above=vHDPos.y-gh;
    if(above>-0.3&&above<1.4){
      float grime=(1.0-smoothstep(0.0,1.2,above))*(1.0-abs(hdN.y))*0.9;
      diffuseColor.rgb*=1.0-0.32*grime;
    }
  }
}
diffuseColor.rgb*=mix(vec3(1.0),hdA.rgb*2.0,uHDAlb);`;
const FRAG_ROUGH=`
roughnessFactor=clamp(roughnessFactor+(0.5-hdA.a)*0.35*uHDAlb,0.04,1.0);
#ifdef HD_WET
  roughnessFactor=mix(roughnessFactor,0.42,max(vHDWet,uHDWet*0.7)*0.8);
#endif
if(hdId>9.5&&hdId<10.5&&uHDMode<0.5)roughnessFactor=0.12;   /* glass */
if(hdId>11.5&&hdId<12.5&&uHDMode<0.5)roughnessFactor=0.55;  /* skin: a soft sheen */
if(hdId>12.5&&uHDMode<0.5)roughnessFactor=0.72;             /* hide */
if(hdId>8.5&&hdId<9.5&&uHDMid>=0.0)roughnessFactor=0.3;     /* worn metal: armour, blades, jewellery */`;
const FRAG_METAL=`
if(hdId>9.5&&hdId<10.5&&uHDMode<0.5)metalnessFactor=0.25;
if(hdId>8.5&&hdId<9.5&&uHDMid>=0.0)metalnessFactor=0.85;`;
const FRAG_NORMAL=`
{ vec3 hdVN=normalize((viewMatrix*vec4(hdDN,0.0)).xyz);
  normal=normalize(mix(normal,hdVN,uHDNrm)); }`;

/* colour-space conversions: authored sRGB -> linear light */
const COLOR_FRAG=`
#if defined( USE_COLOR_ALPHA )
  vec3 vColorLin=pow(vColor.rgb,vec3(2.2)); diffuseColor.rgb*=vColorLin;
#elif defined( USE_COLOR )
  vec3 vColorLin=pow(vColor,vec3(2.2)); diffuseColor.rgb*=vColorLin;
#else
  vec3 vColorLin=vec3(1.0);
#endif`;

HD.detailScale=1.0;
HD.envIntensity=0.5;   /* sky IBL share of the light budget; sun + hemi + this ~= 1 on a white wall */
function installHook(mat,opts){
  opts=opts||{};
  mat.onBeforeCompile=function(shader){
    const isStd=shader.fragmentShader.indexOf('roughnessmap_fragment')>=0;
    shader.fragmentShader=shader.fragmentShader
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );','vec4 diffuseColor = vec4( pow(diffuse,vec3(2.2)), opacity );')
      .replace('vec3 totalEmissiveRadiance = emissive;','vec3 totalEmissiveRadiance = pow(emissive,vec3(2.2));')
      .replace('#include <color_fragment>',COLOR_FRAG);
    const detail=opts.detail&&HD.detail&&isStd;
    if(!detail)return;
    let id=(opts.mode===1)?0:(mat.vertexColors?-1:HD.classifyMat(mat.color?mat.color.getHex():0xffffff));
    if(opts.mode!==1&&!mat.vertexColors&&mat.side===THREE.DoubleSide&&!mat.map)id=13;   /* the creature kit's lamD(): hide, not wood or stone */
    if(mat.userData&&mat.userData.hdMid!==undefined)id=mat.userData.hdMid;   /* a material may name its layer (boulders: rock) */
    const strong=(opts.mode===1)||mat.vertexColors||id>0;
    shader.uniforms.tHDAlbedo={value:HD.detail.albedo};
    shader.uniforms.tHDNormal={value:HD.detail.normal};
    shader.uniforms.uHDMid={value:mat.vertexColors?-1:id};
    shader.uniforms.uHDMode={value:opts.mode||0};
    shader.uniforms.uHDAlb={value:opts.alb!==undefined?opts.alb:(strong?0.85:0.35)};
    shader.uniforms.uHDNrm={value:opts.nrm!==undefined?opts.nrm:(strong?0.75:0.3)};
    shader.uniforms.uHDScale={value:opts.scale||HD.detailScale};
    shader.uniforms.uHDWet={value:0};
    shader.uniforms.tHDGround={value:HD.groundTex||null};
    shader.uniforms.tHDCube={value:HD.worldCube||null};
    shader.uniforms.uHDCubeOn={value:HD.worldCube?1:0};
    shader.uniforms.uHDGround={value:HD.groundInfo||new THREE.Vector4(0,0,0,0)};
    mat.userData.hd=shader.uniforms;
    shader.vertexShader=shader.vertexShader
      .replace('#include <common>','#include <common>'+VERT_DECL)
      .replace('#include <worldpos_vertex>',VERT_BODY);
    shader.fragmentShader=shader.fragmentShader
      .replace('#include <common>','#include <common>'+FRAG_DECL)
      .replace('#include <alphamap_fragment>','#include <alphamap_fragment>'+FRAG_BODY)
      .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>'+FRAG_ROUGH)
      .replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>'+FRAG_METAL)
      .replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>'+FRAG_NORMAL);
    if(opts.wet){
      /* after the declarations above exist: the wet band attribute and the weather uniform */
      shader.defines=shader.defines||{};shader.defines.HD_WET=1;
      shader.vertexShader=shader.vertexShader.replace('attribute float mid;','attribute float mid; attribute float wet; attribute float hdWild; varying float vHDWet; varying float vHDWild;').replace('vHDMid=mid;','vHDMid=mid; vHDWet=wet; vHDWild=hdWild;');
      shader.fragmentShader=shader.fragmentShader.replace('uniform float uHDMid;','uniform float uHDMid; uniform float uHDWet; varying float vHDWet; varying float vHDWild;');
    }
  };
  mat.customProgramCacheKey=function(){return 'hd'+(opts.detail?1:0)+(opts.mode||0)+(mat.vertexColors?'v':'')+(opts.wet?'w':'')+'|'+(mat.map?'m':'');};
}
HD.installHook=installHook;

/* --------------------------- class swaps --------------------------------- */
const Std=THREE.MeshStandardMaterial;
class HDStandard extends Std{
  constructor(p){
    p=Object.assign({},p||{});
    const shin=p.shininess;delete p.shininess;delete p.specular;
    if(p.roughness===undefined)p.roughness=(shin!==undefined)?Math.max(0.08,1-Math.min(1,shin/110)):0.82;
    if(p.metalness===undefined)p.metalness=0;
    if(p.envMapIntensity===undefined)p.envMapIntensity=HD.envIntensity;
    super(p);
    installHook(this,{detail:!p.map});
  }
}
THREE.MeshLambertMaterial=HDStandard;
THREE.MeshPhongMaterial=HDStandard;
const Basic=THREE.MeshBasicMaterial;
class HDBasic extends Basic{
  constructor(p){super(p);installHook(this,{detail:false});}
}
THREE.MeshBasicMaterial=HDBasic;
HD.Standard=Std;

/* game factories for the HD-specific surfaces */
HD.terrainMaterial=function(){
  const m=new Std({vertexColors:true,roughness:0.95,metalness:0,envMapIntensity:HD.envIntensity});
  installHook(m,{detail:true,mode:1,alb:0.9,nrm:0.85,scale:0.5,wet:true});
  return m;
};
HD.bakeMaterial=function(){ return new THREE.MeshLambertMaterial({vertexColors:true}); };

/* geometry: rounder primitives. Very low counts (3, 4) are deliberate square
   posts and prisms and are left alone. */
const Cyl=THREE.CylinderGeometry;
const bump=(n,lo,hi)=>{n=(n===undefined)?8:n;return n<=4?n:Math.min(hi,Math.max(n,lo));};
class HDCylinder extends Cyl{constructor(rt,rb,h,rs,hs,op,ts,tl){super(rt,rb,h,bump(rs,14,32),hs,op,ts,tl);}}
HDCylinder.prototype.type='CylinderGeometry';
THREE.CylinderGeometry=HDCylinder;
class HDCone extends HDCylinder{constructor(r,h,rs,hs,op,ts,tl){super(0,r,h,rs,hs,op,ts,tl);this.parameters={radius:r,height:h,radialSegments:rs,heightSegments:hs,openEnded:op,thetaStart:ts,thetaLength:tl};}}
HDCone.prototype.type='ConeGeometry';
THREE.ConeGeometry=HDCone;
const Sph=THREE.SphereGeometry;
class HDSphere extends Sph{constructor(r,ws,hs,ps,pl,ts,tl){ws=(ws===undefined)?8:ws;hs=(hs===undefined)?6:hs;
  super(r,ws<6?ws:Math.min(40,Math.max(ws,20)),hs<5?hs:Math.min(28,Math.max(hs,14)),ps,pl,ts,tl);}}
HDSphere.prototype.type='SphereGeometry';
THREE.SphereGeometry=HDSphere;

/* every renderer the game makes (the main view, the pet and luxury examine
   popups) outputs sRGB with filmic tone mapping, so the pow(2.2) the material
   hook applies is undone consistently everywhere */
const WR=THREE.WebGLRenderer;
function HDRenderer(p){const r=new WR(p);r.outputEncoding=THREE.sRGBEncoding;r.toneMapping=THREE.ACESFilmicToneMapping;r.toneMappingExposure=0.95;return r;}
HDRenderer.prototype=WR.prototype;
THREE.WebGLRenderer=HDRenderer;

/* painted canvases are authored in sRGB */
const CT=THREE.CanvasTexture;
class HDCanvasTexture extends CT{constructor(c,a,b,d,e,f,g,h,i){super(c,a,b,d,e,f,g,h,i);this.encoding=THREE.sRGBEncoding;this.anisotropy=4;}}
THREE.CanvasTexture=HDCanvasTexture;

/* ------------------------------ fences ---------------------------------- */
/* A split-rail fence the way RS3 builds one: an octagonal post with a chamfered top, rails
   that are tapered logs with a slight bow, not four planks. bake() clones and transforms the
   geometry it is handed, so each maker returns a cached, centred piece. */
/* These run during the game's world bake (buildFences, the wilderness ruins), so they live here,
   before the game script; hd-props.js is too late for a bake-time hook. */
function mergeNI(list){
  const pos=[],nor=[];
  for(const g0 of list){const g=g0.index?g0.toNonIndexed():g0;const p=g.attributes.position.array,n=g.attributes.normal.array;for(let i=0;i<p.length;i++){pos.push(p[i]);nor.push(n[i]);}}
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));
  return g;
}
function hn(x,y,z){const s=Math.sin(x*12.9898+y*78.233+z*37.719)*43758.5453;return s-Math.floor(s);}
function vn3(x,y,z){const xi=Math.floor(x),yi=Math.floor(y),zi=Math.floor(z),fx=x-xi,fy=y-yi,fz=z-zi,sm=t=>t*t*(3-2*t),ux=sm(fx),uy=sm(fy),uz=sm(fz);
  const L=(a,b,c)=>hn(a,b,c);const c00=L(xi,yi,zi)*(1-ux)+L(xi+1,yi,zi)*ux,c10=L(xi,yi+1,zi)*(1-ux)+L(xi+1,yi+1,zi)*ux,c01=L(xi,yi,zi+1)*(1-ux)+L(xi+1,yi,zi+1)*ux,c11=L(xi,yi+1,zi+1)*(1-ux)+L(xi+1,yi+1,zi+1)*ux;
  return (c00*(1-uy)+c10*uy)*(1-uz)+(c01*(1-uy)+c11*uy)*uz;}
function fbm3(x,y,z){return vn3(x,y,z)*0.55+vn3(x*2.1,y*2.1,z*2.1)*0.28+vn3(x*4.3,y*4.3,z*4.3)*0.17;}
const fenceCache=new Map();
HD.fencePost=function(h){
  const v=Math.floor(h*3)%3;const key='post'+v;
  if(fenceCache.has(key))return fenceCache.get(key);
  const shaft=new THREE.CylinderGeometry(0.062,0.075,0.7,8);shaft.translate(0,-0.05,0);
  const cap=new THREE.ConeGeometry(0.07,0.09,8);cap.translate(0,0.345,0);
  const g=mergeNI([shaft,cap]);
  /* a little lean and a worn top */
  g.rotateZ((v-1)*0.02);
  const p=g.attributes.position;for(let i=0;i<p.count;i++){const y=p.getY(i);if(y>0.3)p.setX(i,p.getX(i)*0.92);}
  g.computeVertexNormals();fenceCache.set(key,g);return g;
};
HD.fenceRail=function(axis,h){
  const v=Math.floor(h*4)%4;const key='rail'+axis+v;
  if(fenceCache.has(key))return fenceCache.get(key);
  const g=new THREE.CylinderGeometry(0.038,0.048,1.02,7,4).toNonIndexed();
  const p=g.attributes.position;
  for(let i=0;i<p.count;i++){
    const y=p.getY(i);const t=y/0.51;                       /* -1..1 along the rail */
    /* bow and a knot */
    p.setX(i,p.getX(i)+(1-t*t)*0.012*(v-1.5));
    p.setZ(i,p.getZ(i)*(1+0.25*Math.exp(-((t-0.3*(v-1.5))*(t-0.3*(v-1.5)))*18)));
  }
  g.computeVertexNormals();
  if(axis==='x')g.rotateZ(Math.PI/2);else g.rotateX(Math.PI/2);
  fenceCache.set(key,g);return g;
};
/* ------------------------------ ruin blocks ------------------------------ */
/* Weathered ashlar: a box whose edges and top are chipped by noise, the bed left flat so
   courses still stack. Six variants keyed off the game's own per-block hash. */
const ruinCache=new Map();
HD.ruinBlock=function(h){
  const v=Math.floor(h*6)%6;
  if(ruinCache.has(v))return ruinCache.get(v);
  const g=new THREE.BoxGeometry(0.5,0.34,0.5,4,3,4).toNonIndexed();
  const p=g.attributes.position;const o=v*1.7;
  const sx=0.9+hn(v,1,2)*0.16,sz=0.9+hn(v,3,4)*0.16,sy=0.92+hn(v,5,6)*0.12;
  for(let i=0;i<p.count;i++){
    let x=p.getX(i)*sx,y=p.getY(i)*sy,z=p.getZ(i)*sz;
    const bottom=y<-0.15;
    /* rounded arrises: pull every vertex toward the block's centre line by how far it sits
       into a corner, so the edges read worn rather than sawn */
    const ex=Math.abs(x)/(0.25*sx),ez=Math.abs(z)/(0.25*sz),ey=Math.abs(y)/(0.17*sy);
    const corner=Math.max(0,ex+ez+ey-2.0);           /* >0 only near edges and corners */
    const n=fbm3(x*7+o,y*7,z*7+o*2)-0.5;
    if(!bottom){
      x*=1+n*0.2-corner*0.12;z*=1+n*0.2-corner*0.12;y+=n*0.06-corner*0.05;
      if(y>0.1)y-=Math.max(0,fbm3(x*4+o*3,0,z*4)-0.55)*0.5;   /* a chipped, uneven top */
    }
    p.setXYZ(i,x,y,z);
  }
  g.rotateY((hn(v,7,8)-0.5)*0.16);
  g.computeVertexNormals();ruinCache.set(v,g);return g;
};

/* ------------------------------ lava ------------------------------------ */
/* Molten rock the way RS3's lava reads: a dark crust of plates riding on the melt, glowing
   cracks between them, the whole field creeping along a flow direction, pulsing. One shared
   ShaderMaterial for the wilderness pools (hd-terrain builds those) and the volcano chambers
   (the game's own meshes take it through a guarded hook). Vertex colours are the game's tile
   tint; an optional 'hdEdge' attribute (1 at a pool's rim) cools the edges. */
/* the Emberdeep's moat: how deep a corner sinks, 0..1, from a gaussian over the liquid tiles
   within two of it (corner (cx,cy) touches tiles cx-1..cx, cy-1..cy) */
HD.volcSink=function(cx,cy,tiles,TL,TW){
  let m=0,ws=0;
  for(let dy=-2;dy<=1;dy++)for(let dx=-2;dx<=1;dx++){const tx=cx+dx,ty=cy+dy;const ddx=(tx+0.5)-cx,ddy=(ty+0.5)-cy;const w=Math.exp(-(ddx*ddx+ddy*ddy)/(2*0.9*0.9));ws+=w;const t=tiles[ty]&&tiles[ty][tx];if(t===TL||t===TW)m+=w;}
  m=ws>0?m/ws:0;const k=Math.min(1,Math.max(0,(m-0.06)/0.6));return k*k*(3-2*k);
};
/* Pat's Peak's baked pines hand their spots to hd-foliage (instanced snow pines) */
HD.pineList=[];HD.pine=function(x,z,sc){HD.pineList.push([x,z,sc]);};
/* Lava is water: the same swell, ripple normals, fresnel, sun glint, shore foam and bank
   dissolve as the pond shader, slowed to a viscous crawl and coloured a thick deep red, with
   glowing seams in the troughs and a dark scum of crust at the banks. The wilderness pools
   are built like the ponds (shore/depth attributes); the volcano's own flat tile meshes take
   the same material with uFlat=1, which stands in for those attributes. */
HD.lavaMats=[];
HD.lavaMaterial=function(flat){
  const m=new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,fog:true,
    uniforms:THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{
      uTime:{value:0},tRipple:{value:HD.tex.waterN},tFoam:{value:HD.tex.cloud},uFlat:{value:flat?1:0},
      uZen:{value:new THREE.Color(0.2,0.3,0.5)},uHor:{value:new THREE.Color(0.5,0.6,0.7)},uSunDir:{value:new THREE.Vector3(0.3,0.8,0.5)},uSunCol:{value:new THREE.Color(1,0.95,0.85)},
      uDeep:{value:new THREE.Color(0.22,0.02,0.005)},uShallow:{value:new THREE.Color(0.45,0.06,0.012)},uHot:{value:new THREE.Color(1.0,0.42,0.06)}
    }]),
    vertexShader:`
      attribute float shore;attribute float depth;
      varying float vShore;varying float vDepth;varying vec3 vWorld;varying vec3 vN;
      uniform float uTime;uniform float uFlat;
      #include <fog_pars_vertex>
      void main(){
        vec3 p=position;float t=uTime*0.32;   /* a viscous crawl: a third of water's pace */
        float sh=max(shore,uFlat),dp=max(depth,uFlat);
        float amp=0.07*smoothstep(0.0,0.5,sh)*smoothstep(0.0,0.3,dp);
        float a1=p.x*1.1+t*1.15, a2=p.z*0.9-t*0.95, a3=(p.x+p.z)*2.1+t*1.9, a4=(p.x*0.7-p.z*1.1)*1.4+t*0.7, a5=(p.x*0.3+p.z*0.2)+t*0.45;
        p.y+=amp*(sin(a1)*0.5+sin(a2)*0.5+sin(a3)*0.25+sin(a4)*0.35)+amp*1.4*sin(a5);
        float dx=amp*(cos(a1)*0.55+cos(a3)*0.53+cos(a4)*0.34+cos(a5)*0.42);
        float dz=amp*(cos(a2)*0.45+cos(a3)*0.53-cos(a4)*0.54+cos(a5)*0.28);
        vN=normalize(vec3(-dx,1.0,-dz));
        vShore=sh;vDepth=dp;
        vec4 wp=modelMatrix*vec4(p,1.0);vWorld=wp.xyz;
        vec4 mvPosition=viewMatrix*wp;
        gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader:`
      varying float vShore;varying float vDepth;varying vec3 vWorld;varying vec3 vN;
      uniform float uTime;uniform sampler2D tRipple;uniform sampler2D tFoam;uniform float uFlat;
      uniform vec3 uZen,uHor,uSunDir,uSunCol,uDeep,uShallow,uHot;
      #include <common>
      #include <fog_pars_fragment>
      void main(){
        float t=uTime;
        vec2 uv=vWorld.xz;
        /* the surface skin: two slow ripple layers, coarser than water */
        vec3 r1=texture2D(tRipple,uv*0.3+vec2(t*0.006,t*0.004)).xyz*2.0-1.0;
        vec3 r2=texture2D(tRipple,uv*0.8+vec2(-t*0.005,t*0.008)).xyz*2.0-1.0;
        vec3 n=normalize(vN+vec3(r1.x+r2.x*0.6,0.0,r1.y+r2.y*0.6)*0.3);
        vec3 V=normalize(cameraPosition-vWorld);
        float ndv=max(dot(n,V),0.0);
        float fres=mix(0.03,0.6,pow(1.0-ndv,4.0));
        vec3 R=reflect(-V,n);
        vec3 sky=mix(uHor,uZen,clamp(R.y*2.2+0.15,0.0,1.0));
        /* underground (uFlat: the Emberdeep's tile meshes) there is no sky and no sun: a dark cave
           ceiling in the reflection and only the melt's own glow for highlights */
        sky=mix(sky,vec3(0.06,0.02,0.01),uFlat);
        float spec=(pow(max(dot(reflect(-uSunDir,n),V),0.0),160.0)*1.6+pow(max(dot(reflect(-uSunDir,n),V),0.0),18.0)*0.2)*(1.0-0.9*uFlat);
        float depth=smoothstep(0.05,0.9,vDepth*1.4);
        vec3 col=mix(uShallow,uDeep,depth);
        /* the melt glows through the skin: brightest in the troughs and along drifting seams */
        float f=texture2D(tFoam,uv*0.16+vec2(t*0.006,-t*0.004)).r;
        float f2=texture2D(tFoam,uv*0.55+vec2(-t*0.011,t*0.008)).r;
        float seam=smoothstep(0.52,0.72,f*0.6+f2*0.4);
        float trough=clamp(0.5-vN.y*0.5+0.5-r1.z*0.5,0.0,1.0);
        vec3 glow=uHot*(seam*0.9+trough*0.35+0.14);
        col+=glow*(0.55+0.45*sin(t*0.9+f*9.0));
        col=mix(col,sky*vec3(1.0,0.6,0.45),fres*0.5);
        col+=uSunCol*spec*vec3(1.0,0.8,0.6);
        /* scum: a dark crust that gathers at the banks and drifts in rafts on open melt */
        float lap=0.5+0.5*sin(t*0.5-vShore*10.0+f*4.0);
        float band=(1.0-smoothstep(0.02,0.25,vDepth))*smoothstep(0.0,0.02,vDepth);
        float scum=smoothstep(0.6,0.8,f*0.7+f2*0.3+band*0.3*lap)*max(band,0.45);
        col=mix(col,vec3(0.12,0.06,0.04)*(0.8+0.4*f2),scum*0.85);
        col+=uHot*0.35*smoothstep(0.55,0.62,f*0.7+f2*0.3)*(1.0-smoothstep(0.62,0.7,f*0.7+f2*0.3));   /* the seams between rafts */
        float alpha=smoothstep(0.0,0.3,vDepth)*0.98;
        gl_FragColor=vec4(col,alpha);
        #include <tonemapping_fragment>
        #include <encodings_fragment>
        #include <fog_fragment>
      }`
  });
  m.userData.hdLava=1;
  m.uniforms.tRipple.value=HD.tex.waterN||null;m.uniforms.tFoam.value=HD.tex.cloud||null;   /* the shared objects: UniformsUtils.merge clones textures, and a clone never sees a later paint */
  HD.lavaMats.push(m);
  if(!HD.lavaMat)HD.lavaMat=m;
  return m;
};

/* PILOT MODE (the clone only): the game script opens every level- and quest-gated door when this
   is set, so the owner can walk every interior while reviewing the look. Never ship this on. */
HD.pilot=false;   /* LAUNCH: off. true opens every gated door, lifts level gates, makes coins free and lets the map click teleport. Never ship it on. */
/* deferred work: heavy per-object dressing is queued here and run in short slices after the
   page is up, so the lobby appears in seconds and the rest finishes while the player reads it */
{const q=[];let pumping=false;
 function pump(){pumping=true;const t0=performance.now();while(q.length&&performance.now()-t0<10){const t=q.shift();try{t();}catch(e){console.warn('[HD] deferred',e);}}
   if(q.length){if(window.requestIdleCallback)requestIdleCallback(pump,{timeout:50});else setTimeout(pump,0);}else pumping=false;}
 HD.defer=function(fn){q.push(fn);if(!pumping){pumping=true;setTimeout(pump,0);}};
 HD.deferFlush=function(){while(q.length){const t=q.shift();try{t();}catch(e){}}};
 HD.deferPending=()=>q.length;}
HD.preReady=true;
})();
