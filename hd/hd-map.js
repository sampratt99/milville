/* ============================================================================
   Milville HD — the map.  Loaded after hd-lobby.js.

   The game paints its minimap base (miniBase, 4 px a tile, hard pixels) and
   draws it on the round minimap and the world map. This paints an HD base the
   way RS3's map reads: soft-edged terrain in a painted palette, water with a
   pale shore, roads with worn edges, woodland as shaded canopies, buildings as
   roofs with an outline and a drop shadow, grain over all of it — at 8 px a
   tile. The game's own drawing calls are then fed this base instead: the world
   map's drawImage of miniBase, and the minimap's, both with smoothing on. The
   game's labels, feature icons, markers and dots draw on top as before.

   Gameplay is untouched: nothing here reads or writes game state.
   ========================================================================== */
(function(){
'use strict';
try{performance.mark('hd:hd-map');}catch(e){}
const HD=window.HD;
if(!HD||!HD.ready)return;
if(typeof miniBase==='undefined'||typeof tiles==='undefined'||typeof BUILDINGS==='undefined')return;

const S=8;                          /* px a tile */
const MW=W*S,MH=H*S;
const hash=(x,y)=>tileHash(x,y);
const snow=(x,y)=>typeof inSnow==='function'&&inSnow(x,y);
const wild=(x,y)=>typeof inWild==='function'&&inWild(x,y);
const T=(x,y)=>(tiles[y]&&tiles[y][x]!==undefined)?tiles[y][x]:T_GRASS;

function shade(hex,k){const c=new THREE.Color(hex);c.multiplyScalar(k);return '#'+c.getHexString();}
function tileColour(x,y){
  const t=T(x,y),h=hash(x,y),v=0.96+0.08*h;
  if(snow(x,y)&&(t===T_GRASS||t===T_PATH||t===T_FOREST))return shade(0xe8eef4,v);
  if(t===T_WATER)return shade(0x4f7fb0,0.98+0.06*h);
  if(t===T_LAVA||(typeof T_LAVAHOT!=='undefined'&&t===T_LAVAHOT))return shade(h<0.5?0xe5562a:0xcf4420,1);
  if(t===T_DITCH)return shade(0x3a3128,v);
  if(t===T_PATH)return shade(wild(x,y)?0x9a8664:0xc8b48c,v);
  if(t===T_WALL)return shade(0xd9d6cc,1);
  if(t===T_FLOOR)return shade(0xa0674a,v);
  if(t===T_BRIDGE)return shade(0x8a6a40,v);
  if(t===T_FOREST)return shade(wild(x,y)?0x5e5340:0x4f7a33,v);
  if(wild(x,y))return shade(0x7c6c4e,v);
  return shade(h<0.5?0x7ea24c:0x76994a,v);
}

/* ---- the base ---- */
const base=document.createElement('canvas');base.width=MW;base.height=MH;
const map=document.createElement('canvas');map.width=MW;map.height=MH;
function paint(){
  const b=base.getContext('2d');
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){b.fillStyle=tileColour(x,y);b.fillRect(x*S,y*S,S,S);}
  /* a pale shore round the water and the lava */
  b.lineWidth=2.2;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const t=T(x,y);if(t!==T_WATER&&t!==T_LAVA)continue;
    const n=[[0,-1],[1,0],[0,1],[-1,0]];
    for(const [dx,dy] of n){const u=T(x+dx,y+dy);if(u===t||u===T_BRIDGE)continue;
      b.strokeStyle=t===T_WATER?'rgba(200,225,240,0.55)':'rgba(255,200,120,0.55)';
      b.beginPath();
      if(dy===-1){b.moveTo(x*S,y*S+1);b.lineTo(x*S+S,y*S+1);}else if(dy===1){b.moveTo(x*S,y*S+S-1);b.lineTo(x*S+S,y*S+S-1);}
      else if(dx===-1){b.moveTo(x*S+1,y*S);b.lineTo(x*S+1,y*S+S);}else{b.moveTo(x*S+S-1,y*S);b.lineTo(x*S+S-1,y*S+S);}
      b.stroke();}}
  /* worn road edges */
  b.lineWidth=1.2;b.strokeStyle='rgba(120,95,55,0.35)';
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){if(T(x,y)!==T_PATH)continue;
    for(const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]]){const u=T(x+dx,y+dy);if(u===T_PATH||u===T_BRIDGE||u===T_WALL||u===T_FLOOR)continue;
      b.beginPath();
      if(dy===-1){b.moveTo(x*S,y*S+0.5);b.lineTo(x*S+S,y*S+0.5);}else if(dy===1){b.moveTo(x*S,y*S+S-0.5);b.lineTo(x*S+S,y*S+S-0.5);}
      else if(dx===-1){b.moveTo(x*S+0.5,y*S);b.lineTo(x*S+0.5,y*S+S);}else{b.moveTo(x*S+S-0.5,y*S);b.lineTo(x*S+S-0.5,y*S+S);}
      b.stroke();}}
  /* soften, then grain */
  const g=map.getContext('2d');
  g.clearRect(0,0,MW,MH);
  try{g.filter='blur(1.1px)';g.drawImage(base,0,0);g.filter='none';}catch(e){g.drawImage(base,0,0);}
  const grain=document.createElement('canvas');grain.width=grain.height=128;const gg=grain.getContext('2d');const im=gg.createImageData(128,128);
  for(let i=0;i<im.data.length;i+=4){const v=200+Math.random()*55|0;im.data[i]=im.data[i+1]=im.data[i+2]=v;im.data[i+3]=255;}
  gg.putImageData(im,0,0);
  g.save();g.globalCompositeOperation='multiply';g.globalAlpha=0.35;g.fillStyle=g.createPattern(grain,'repeat');g.fillRect(0,0,MW,MH);g.restore();
  /* fences as stitches */
  g.fillStyle='#5a3f24';
  for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(T(x,y)===T_FENCE)g.fillRect(x*S+2,y*S+2,S-4,S-4);
  /* woodland: shaded canopies */
  const canopy=(cx,cy,r,dead)=>{
    g.fillStyle=dead?'rgba(40,30,18,0.35)':'rgba(20,40,12,0.35)';g.beginPath();g.arc(cx+1.2,cy+1.4,r,0,7);g.fill();
    g.fillStyle=dead?'#5a4a30':'#2f5a24';g.beginPath();g.arc(cx,cy,r,0,7);g.fill();
    g.fillStyle=dead?'#6e5c3c':'#3f7030';g.beginPath();g.arc(cx-r*0.25,cy-r*0.3,r*0.55,0,7);g.fill();
  };
  for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(T(x,y)===T_FOREST){
    canopy(x*S+S/2+(hash(x*5,y*7)-0.5)*5,y*S+S/2+(hash(x,y*3)-0.5)*5,4.6,wild(x,y));}
  for(const o of objects){
    if(o.def==='tree'||o.def==='oak'||o.def==='willow'||o.def==='birch')canopy(o.x*S+S/2,o.y*S+S/2,5.4,false);
    else if(o.def==='deadtree')canopy(o.x*S+S/2,o.y*S+S/2,5,true);
    else if(/^(copper|tin|iron|mithril|adamant|rune|berrite)$/.test(o.def)){g.fillStyle='#6e7076';g.beginPath();g.arc(o.x*S+S/2+1,o.y*S+S/2+1,4,0,7);g.fill();g.fillStyle='#a4a8b0';g.beginPath();g.arc(o.x*S+S/2,o.y*S+S/2,3.6,0,7);g.fill();}
    else if(o.def==='spot'){g.fillStyle='#8ae6ff';g.beginPath();g.arc(o.x*S+S/2,o.y*S+S/2,3.4,0,7);g.fill();}
    else if(o.def==='fire'){g.fillStyle='#ff8c2a';g.beginPath();g.arc(o.x*S+S/2,o.y*S+S/2,3.4,0,7);g.fill();}
  }
  /* buildings: a shadow, the roof, an outline */
  for(const b2 of BUILDINGS){
    if(b2.kind==='round'){
      const rcx=(b2.x+b2.w/2)*S,rcy=(b2.y+b2.h/2)*S,rr=Math.min(b2.w,b2.h)*S/2-1;
      g.fillStyle='rgba(0,0,0,0.35)';g.beginPath();g.arc(rcx+2.5,rcy+3,rr,0,7);g.fill();
      g.fillStyle='#d9d6cc';g.beginPath();g.arc(rcx,rcy,rr,0,7);g.fill();
      g.strokeStyle='#3a3a36';g.lineWidth=1.6;g.beginPath();g.arc(rcx,rcy,rr,0,7);g.stroke();
      continue;
    }
    const rs=b2.kind==='lindsay'?[[b2.x,b2.y,4,b2.h],[b2.x+4,b2.y,b2.w-4,3],[b2.x+4,b2.y+b2.h-3,b2.w-4,3]]
      :b2.kind==='crump'?[[b2.x,b2.y,3,b2.h],[b2.x+3,b2.y,1,b2.h],[b2.x+5,b2.y,2,b2.h],[b2.x+7,b2.y,3,b2.h]]
      :b2.kind==='schoolhouse'?[[b2.x,b2.y+3,b2.w,3],[b2.x+b2.w-3,b2.y,3,3]]
      :[[b2.x,b2.y,b2.w,b2.h]];
    g.fillStyle='rgba(0,0,0,0.35)';for(const[rx,ry,rw,rh]of rs)g.fillRect(rx*S+2.5,ry*S+3,rw*S,rh*S);
    g.fillStyle='#d9d6cc';for(const[rx,ry,rw,rh]of rs)g.fillRect(rx*S,ry*S,rw*S,rh*S);
    /* a ridge line down the roof */
    g.strokeStyle='rgba(0,0,0,0.18)';g.lineWidth=1;
    for(const[rx,ry,rw,rh]of rs){if(rw>=rh){g.beginPath();g.moveTo(rx*S+2,(ry+rh/2)*S);g.lineTo((rx+rw)*S-2,(ry+rh/2)*S);g.stroke();}else{g.beginPath();g.moveTo((rx+rw/2)*S,ry*S+2);g.lineTo((rx+rw/2)*S,(ry+rh)*S-2);g.stroke();}}
    g.strokeStyle='#3a3a36';g.lineWidth=1.6;for(const[rx,ry,rw,rh]of rs)g.strokeRect(rx*S+0.8,ry*S+0.8,rw*S-1.6,rh*S-1.6);
  }
  /* THE WILDERNESS, lettered down the waste, as the game does */
  g.save();g.translate(25*S,64*S);g.rotate(-Math.PI/2);
  g.textAlign='center';g.font='bold '+(21*S/4)+'px RSFont,Georgia,serif';
  g.lineWidth=8;g.strokeStyle='rgba(18,12,6,0.8)';g.strokeText('T H E   W I L D E R N E S S',0,0);
  g.fillStyle='#cf9d62';g.fillText('T H E   W I L D E R N E S S',0,0);g.restore();
}
paint();
HD.mapHD=map;HD.repaintMap=paint;

/* ---- the world map draws this base with smoothing; its labels and icons go on top ---- */
let labels=null,iconBoxes=null;
(function(){
  const c=document.getElementById('wmapc');if(!c)return;
  const g=c.getContext('2d');const _di=g.drawImage.bind(g);
  g.drawImage=function(src){
    if(src===miniBase){const a=Array.prototype.slice.call(arguments,1);const sm=this.imageSmoothingEnabled;this.imageSmoothingEnabled=true;this.imageSmoothingQuality='high';const r=_di.apply(null,[map].concat(a));this.imageSmoothingEnabled=sm;return r;}
    return _di.apply(null,arguments);
  };
  /* while the map is being drawn, text is collected instead of painted; each stroke+fill pair
     becomes one label (the stroke carries the outline, the fill the colour) */
  const _ft=g.fillText.bind(g),_st=g.strokeText.bind(g);
  const push=(L)=>{const P=labels[labels.length-1];if(P&&P.x===L.x&&P.font===L.font&&L.y-P.y>0&&L.y-P.y<=14&&!P.fill===!L.fill){P.lines=P.lines||[{t:P.t,dy:0}];P.lines.push({t:L.t,dy:L.y-P.y});return;}labels.push(L);};
  g.strokeText=function(t,x,y){if(!labels||HD._inIcon)return _st(t,x,y);push({t,x,y,font:this.font,align:this.textAlign,stroke:this.strokeStyle,lw:this.lineWidth,fill:null});};
  g.fillText=function(t,x,y){if(!labels||HD._inIcon)return _ft(t,x,y);const L=labels[labels.length-1];
    if(L){const last=L.lines?L.lines[L.lines.length-1]:null;const lt=last?last.t:L.t,ly=last?L.y+last.dy:L.y;if(lt===t&&L.x===x&&ly===y&&(last?!last.fill:L.fill===null)){if(last)last.fill=this.fillStyle;else L.fill=this.fillStyle;return;}}
    push({t,x,y,font:this.font,align:this.textAlign,stroke:null,lw:0,fill:this.fillStyle});};
  HD._wmapCtx=g;HD._wmapText={ft:_ft,st:_st};
})();
/* icons on the world map: one per spot — a second of the same kind within 14 px is skipped */
if(typeof mmIcon==='function'){const _mi0=mmIcon;mmIcon=function(g,x,y,cat,col,r){
  if(g===HD._wmapCtx&&iconBoxes){for(const b of iconBoxes)if(b.cat===cat&&Math.abs(b.x-x)<14&&Math.abs(b.y-y)<14)return;iconBoxes.push({x,y,cat,r:(r||4.6)+2});}
  HD._inIcon=true;try{return _mi0.apply(this,arguments);}finally{HD._inIcon=false;}};}
function placeLabels(){
  const g=HD._wmapCtx;if(!g||!labels)return;const list=labels;labels=null;
  const c=document.getElementById('wmapc');const Wc=c.width,Hc=c.height;
  const boxes=(iconBoxes||[]).map(b=>({x0:b.x-b.r,y0:b.y-b.r,x1:b.x+b.r,y1:b.y+b.r}));
  const hit=(b)=>{for(const o of boxes)if(b.x0<o.x1&&b.x1>o.x0&&b.y0<o.y1&&b.y1>o.y0)return true;return false;};
  /* big labels first (the wilderness lettering), then the rest in the game's order */
  list.sort((a,b)=>(parseInt(b.font)||9)-(parseInt(a.font)||9));
  for(const L of list){
    g.font=L.font;g.textAlign=L.align||'center';
    const lines=L.lines||[{t:L.t,dy:0,fill:L.fill}];const lh=(parseInt(L.font)||9)+3;
    let w=0;for(const ln of lines)w=Math.max(w,g.measureText(ln.t).width+4);const h=lh+(lines.length-1)*(lines[lines.length-1].dy||lh);
    const box=(x,y)=>{const x0=L.align==='left'?x-2:L.align==='right'?x-w+2:x-w/2;return {x0,y0:y-lh+2,x1:x0+w,y1:y-lh+2+h+1};};
    let bx=null;const tries=[[0,0],[0,-h],[0,h],[w*0.6,0],[-w*0.6,0],[0,-2*h],[0,2*h],[w*0.6,-h],[-w*0.6,-h],[w*0.6,h],[-w*0.6,h],[0,-3*h],[0,3*h],[w,0],[-w,0]];
    for(const [dx,dy] of tries){const b=box(L.x+dx,L.y+dy);if(b.x0<0||b.y0<0||b.x1>Wc||b.y1>Hc)continue;if(!hit(b)){bx=b;L.x+=dx;L.y+=dy;break;}}
    if(!bx)bx=box(L.x,L.y);
    boxes.push(bx);
    for(const ln of lines){const fill=L.lines?ln.fill:L.fill;
      if(L.stroke){g.strokeStyle=L.stroke;g.lineWidth=L.lw;HD._wmapText.st(ln.t,L.x,L.y+ln.dy);}
      if(fill){g.fillStyle=fill;HD._wmapText.ft(ln.t,L.x,L.y+ln.dy);}}
  }
}
/* ---- the minimap: the base is left out of miniDyn (which keeps the dots and markers), and the
   HD base goes underneath on the round map at full resolution ---- */
(function(){
  if(typeof miniDyn==='undefined')return;
  const dg=miniDyn.getContext('2d');const _dd=dg.drawImage.bind(dg);
  dg.drawImage=function(src){if(src===miniBase)return;return _dd.apply(null,arguments);};
  const mm=document.getElementById('minimap');if(!mm)return;
  const mg=mm.getContext('2d');const _md=mg.drawImage.bind(mg);
  mg.drawImage=function(src){
    if(src===miniDyn&&typeof curMiniBase==='function'&&curMiniBase()===miniBase){
      const sm=this.imageSmoothingEnabled;this.imageSmoothingEnabled=true;this.imageSmoothingQuality='high';
      _md(map,0,0,MW,MH,0,0,W*4,H*4);   /* the HD base at the minimap's 4 px a tile, under the same transform */
      this.imageSmoothingEnabled=sm;
    }
    return _md.apply(null,arguments);
  };
})();
/* ---- wilderness place names, and a search box ---- */
/* the game labels its BUILDINGS; the wilderness landmarks are carved terrain and clutter with no
   entry there, so they get names here (map tiles, the same space as BUILDINGS) */
/* campus places the game does not label: the Grand Exchange stands where its clerks are */
HD.CAMPUS_SITES=[{name:'Grand Exchange',x:185.5,y:47}];
HD.WILD_SITES=[
  {name:"Pat's Peak",x:17,y:14},
  {name:'Chaos Temple',x:138,y:36},
  {name:'Concord Asylum',x:86,y:42},
  {name:'Concord High School',x:46.5,y:86},
  {name:'Swenson Granite Quarry',x:84,y:119},
  {name:'Emberdeep Volcano',x:19,y:121},
  {name:'The Wilderness Ditch',x:118,y:70}
];
function allSites(){
  const out=[];
  for(const b of BUILDINGS)if(b.name)out.push({name:b.name,x:b.x+b.w/2,y:b.y+b.h/2,w:b.w,h:b.h});
  for(const s of HD.WILD_SITES)out.push({name:s.name,x:s.x,y:s.y,w:6,h:6,wild:true});
  for(const s of HD.CAMPUS_SITES)out.push({name:s.name,x:s.x,y:s.y,w:5,h:5});
  return out;
}
let query='';
function drawExtras(){
  const c=document.getElementById('wmapc');if(!c)return;const g=c.getContext('2d');
  g.save();g.textAlign='center';
  /* wilderness names in the game's label style */
  g.font='bold 9px RSFont,Verdana,sans-serif';
  for(const s of HD.WILD_SITES.concat(HD.CAMPUS_SITES)){const px=s.x*6,py=s.y*6;
    g.lineWidth=3;g.strokeStyle='rgba(0,0,0,0.85)';g.strokeText(s.name,px,py);g.fillStyle='#ffd98c';g.fillText(s.name,px,py);}
  /* the search: matches ringed and named, the first one pulsing */
  if(query){const q=query.toLowerCase();let first=true;
    for(const s of allSites()){if(s.name.toLowerCase().indexOf(q)<0)continue;const px=s.x*6,py=s.y*6;
      g.beginPath();g.arc(px,py,Math.max(s.w,s.h)*3+8,0,7);g.lineWidth=first?4:2.5;g.strokeStyle=first?'#ffe14a':'rgba(255,225,74,0.7)';g.stroke();
      g.lineWidth=3;g.strokeStyle='rgba(0,0,0,0.9)';g.font='bold 11px RSFont,Verdana,sans-serif';g.strokeText(s.name,px,py-Math.max(s.w,s.h)*3-12);g.fillStyle='#fff3c0';g.fillText(s.name,px,py-Math.max(s.w,s.h)*3-12);
      first=false;}}
  g.restore();
}
if(typeof openWorldMap==='function'){const _ow=openWorldMap;openWorldMap=function(){labels=[];iconBoxes=[];let r;try{r=_ow.apply(this,arguments);try{drawExtras();}catch(e){}}finally{try{placeLabels();}catch(e){console.warn('[HD] map labels',e);}labels=null;}return r;};}
(function(){
  const bar=document.getElementById('wmapbar');if(!bar)return;
  const wrap=document.createElement('div');wrap.id='hdmapsearch';
  wrap.innerHTML='<input id="hdmapq" placeholder="Search places…" autocomplete="off" spellcheck="false"><span id="hdmapn"></span>';
  bar.insertBefore(wrap,bar.lastElementChild);
  const inp=wrap.querySelector('input'),n=wrap.querySelector('span');
  const update=()=>{query=(inp.value||'').trim();try{openWorldMap();}catch(e){}
    if(query){const q=query.toLowerCase();const m=allSites().filter(s=>s.name.toLowerCase().indexOf(q)>=0);n.textContent=m.length?(m.length+' found'):'no match';}else n.textContent='';};
  inp.addEventListener('input',update);
  inp.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){inp.value='';update();}});
  inp.addEventListener('mousedown',e=>e.stopPropagation());inp.addEventListener('click',e=>e.stopPropagation());
  /* the map's own keydown handlers (Esc closes) must not eat typing; opening the map clears the box */
  const mm=document.getElementById('wmapclose');if(mm)mm.addEventListener('click',()=>{inp.value='';query='';n.textContent='';});
})();
/* ---- entrances: a toggleable feature category on both maps ---- */
/* the outside doors of every interior and the ways down: pushed into the game's own feature
   list (ICON_PTS) under a new category, so its minimap and world map loops draw them, filtered
   by player.mmf.entr like the rest; the legend gets a matching row */
const ENTRANCES=[['volcano_door','Emberdeep'],['raid_portal','The Delve'],['sos_hole','Stronghold of Security'],['mathesdoor','Matthes Cage'],
  ['chapeldoor','Chapel of St. Paul'],['stpauldoor','Old Chapel'],['rectorydoor','The Rectory'],['house_door','Cottage'],['raid_lobbygate','Delve gate']];
/* doors the game keeps as coordinates rather than objects: the Party Room is Hargate's east door */
const ENTRANCE_PTS=[{name:'Party Room',x:100+WX,y:60}];
if(typeof MM_CATS!=='undefined'&&!MM_CATS.some(c=>c[0]==='entr')){
  MM_CATS.push(['entr','#d07a2a','Entrances']);
  if(typeof MM_GLYPH!=='undefined')MM_GLYPH.entr='';
  const entrOn=()=>{try{if(player&&player.mmf&&player.mmf.entr===undefined)player.mmf.entr=1;}catch(e){}};
  entrOn();HD.tick=HD.tick||[];HD.tick.push(entrOn);
  /* the icon: the game's disc, then a doorway on it */
  if(typeof mmIcon==='function'){const _mi=mmIcon;mmIcon=function(g,x,y,cat,col,r){const rr=_mi.apply(this,arguments);if(cat==='entr'){const s=(r||4.6)/4.6;g.fillStyle='#fff';g.beginPath();g.moveTo(x-2.2*s,y+2.6*s);g.lineTo(x-2.2*s,y-0.4*s);g.arc(x,y-0.4*s,2.2*s,Math.PI,0);g.lineTo(x+2.2*s,y+2.6*s);g.closePath();g.fill();g.fillStyle=col;g.fillRect(x-0.9*s,y-0.2*s,1.8*s,2.8*s);}return rr;};}
  if(typeof buildIconPts==='function'){const _bp=buildIconPts;buildIconPts=function(){const r=_bp.apply(this,arguments);try{
    for(const [def,name] of ENTRANCES)for(const o of objects){if(o.def!==def)continue;if(o.interior)continue;ICON_PTS.push({x:o.x,y:o.y,c:'entr',name});}
    for(const p of ENTRANCE_PTS)ICON_PTS.push({x:p.x,y:p.y,c:'entr',name:p.name});
  }catch(e){}return r;};}
  /* the legend row, in the game's own style */
  const box=document.getElementById('wmlrows');
  if(box){const r=document.createElement('div');r.className='wmlrow';if(!(player&&player.mmf&&player.mmf.entr))r.classList.add('off');
    const cv=document.createElement('canvas');cv.width=24;cv.height=24;mmIcon(cv.getContext('2d'),12,12,'entr','#d07a2a',9);
    const t=document.createElement('span');t.textContent='Entrances';r.appendChild(cv);r.appendChild(t);
    r.addEventListener('click',()=>{player.mmf.entr=player.mmf.entr?0:1;r.classList.toggle('off',!player.mmf.entr);try{dirty=true;}catch(e){}openWorldMap();});
    box.appendChild(r);}
}
/* the overworld bosses: a skull category, toggleable like the rest */
if(typeof MM_CATS!=='undefined'&&!MM_CATS.some(c=>c[0]==='boss')){
  MM_CATS.push(['boss','#c0302a','Bosses']);if(typeof MM_GLYPH!=='undefined')MM_GLYPH.boss='';
  const bossOn=()=>{try{if(player&&player.mmf&&player.mmf.boss===undefined)player.mmf.boss=1;}catch(e){}};bossOn();HD.tick.push(bossOn);
  const _mi2=mmIcon;mmIcon=function(g,x,y,cat,col,r){const rr=_mi2.apply(this,arguments);if(cat==='boss'){const s=(r||4.6)/4.6;
    g.fillStyle='#fff';g.beginPath();g.arc(x,y-0.6*s,2.4*s,Math.PI,0);g.lineTo(x+2.4*s,y+1.2*s);g.lineTo(x-2.4*s,y+1.2*s);g.closePath();g.fill();g.fillRect(x-1.6*s,y+1.2*s,3.2*s,1.3*s);
    g.fillStyle=col;g.beginPath();g.arc(x-1*s,y-0.4*s,0.75*s,0,7);g.arc(x+1*s,y-0.4*s,0.75*s,0,7);g.fill();g.fillRect(x-0.35*s,y+0.3*s,0.7*s,0.9*s);}return rr;};
  const _bp2=buildIconPts;buildIconPts=function(){const r=_bp2.apply(this,arguments);try{
    for(const q of rats){const mk=MOB_KINDS[q.kind];if(!mk||!mk.boss||q.interior)continue;if(ICON_PTS.some(i=>i.c==='boss'&&i.kind===q.kind))continue;ICON_PTS.push({x:q.sx,y:q.sy,c:'boss',name:mk.name,kind:q.kind});}
  }catch(e){}return r;};
  const box=document.getElementById('wmlrows');
  if(box){const r=document.createElement('div');r.className='wmlrow';if(!(player&&player.mmf&&player.mmf.boss))r.classList.add('off');
    const cv=document.createElement('canvas');cv.width=24;cv.height=24;mmIcon(cv.getContext('2d'),12,12,'boss','#c0302a',9);
    const t=document.createElement('span');t.textContent='Bosses';r.appendChild(cv);r.appendChild(t);
    r.addEventListener('click',()=>{player.mmf.boss=player.mmf.boss?0:1;r.classList.toggle('off',!player.mmf.boss);try{dirty=true;}catch(e){}openWorldMap();});
    box.appendChild(r);}
}
/* the world map names each entrance beside its icon */
const _de=drawExtras;
drawExtras=function(){_de();try{
  if(!ICON_PTS)return;
  const c=document.getElementById('wmapc');const g=c.getContext('2d');g.save();g.textAlign='left';g.font='bold 8px RSFont,Verdana,sans-serif';
  for(const ic of ICON_PTS){if(!ic.name)continue;if(ic.c==='entr'&&!player.mmf.entr)continue;if(ic.c==='boss'&&!player.mmf.boss)continue;if(ic.c!=='entr'&&ic.c!=='boss')continue;const px=ic.x*6+9,py=ic.y*6+3;g.lineWidth=3;g.strokeStyle='rgba(0,0,0,0.85)';g.strokeText(ic.name,px,py);g.fillStyle=ic.c==='boss'?'#ff9a90':'#ffc98a';g.fillText(ic.name,px,py);}
  g.restore();}catch(e){}};
/* ---- zoom and pan: the wheel zooms round the cursor, a drag pans; a drag is not a click ---- */
(function(){
  const c=document.getElementById('wmapc'),row=document.getElementById('wmaprow');if(!c||!row)return;
  const wrap=document.createElement('div');wrap.id='hdmapwrap';c.parentNode.insertBefore(wrap,c);wrap.appendChild(c);
  let z=1,tx=0,ty=0,drag=null,moved=false;
  const apply=()=>{const W=wrap.clientWidth,H=wrap.clientHeight;const cw=c.clientWidth*z,ch=c.clientHeight*z;
    tx=Math.min(0,Math.max(W-cw,tx));ty=Math.min(0,Math.max(H-ch,ty));if(cw<=W)tx=0;if(ch<=H)ty=0;
    c.style.transformOrigin='0 0';c.style.transform='translate('+tx+'px,'+ty+'px) scale('+z+')';};
  wrap.addEventListener('wheel',e=>{e.preventDefault();e.stopPropagation();const r=wrap.getBoundingClientRect();const mx=e.clientX-r.left,my=e.clientY-r.top;
    const z0=z;z=Math.min(5,Math.max(1,z*(e.deltaY<0?1.18:1/1.18)));const k=z/z0;tx=mx-(mx-tx)*k;ty=my-(my-ty)*k;apply();},{passive:false});
  wrap.addEventListener('mousedown',e=>{if(e.button!==0)return;drag={x:e.clientX,y:e.clientY,tx,ty};moved=false;},true);
  window.addEventListener('mousemove',e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.abs(dx)+Math.abs(dy)>4)moved=true;if(z>1){tx=drag.tx+dx;ty=drag.ty+dy;apply();}});
  window.addEventListener('mouseup',()=>{drag=null;});
  /* touch: one finger pans, two fingers pinch round their midpoint */
  let pinch=null;
  wrap.addEventListener('touchstart',e=>{if(e.touches.length===1){drag={x:e.touches[0].clientX,y:e.touches[0].clientY,tx,ty};moved=false;}
    else if(e.touches.length===2){const r=wrap.getBoundingClientRect();const a=e.touches[0],b=e.touches[1];pinch={d:Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY),z,mx:(a.clientX+b.clientX)/2-r.left,my:(a.clientY+b.clientY)/2-r.top,tx,ty};drag=null;}},{passive:true});
  wrap.addEventListener('touchmove',e=>{if(pinch&&e.touches.length===2){const a=e.touches[0],b=e.touches[1];const d=Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);const z0=z;z=Math.min(5,Math.max(1,pinch.z*d/pinch.d));const k=z/z0;tx=pinch.mx-(pinch.mx-tx)*k;ty=pinch.my-(pinch.my-ty)*k;moved=true;apply();if(e.cancelable)e.preventDefault();}
    else if(drag&&e.touches.length===1){const dx=e.touches[0].clientX-drag.x,dy=e.touches[0].clientY-drag.y;if(Math.abs(dx)+Math.abs(dy)>6)moved=true;if(z>1){tx=drag.tx+dx;ty=drag.ty+dy;apply();if(e.cancelable)e.preventDefault();}}},{passive:false});
  wrap.addEventListener('touchend',e=>{if(e.touches.length<2)pinch=null;if(!e.touches.length)drag=null;},{passive:true});
  row.addEventListener('click',e=>{if(moved){moved=false;e.stopPropagation();e.preventDefault();}},true);
  const cl=document.getElementById('wmapclose');if(cl)cl.addEventListener('click',()=>{z=1;tx=ty=0;apply();});
  HD.mapZoom=()=>z;
})();
/* the game may have built its feature list before this loaded: make it build again */
try{ICON_PTS=null;}catch(e){}
console.log('[HD] map painted',MW+'x'+MH);
})();

/* ---- a destination marker: click the world map to set it, a yellow arrow on the round minimap
   points the way (or the flag itself when it is inside the circle), and it clears itself when
   you arrive. Cancel: click the flag on the world map again, or the x by the minimap. ---- */
(function(){
  const c=document.getElementById('wmapc');if(!c||typeof player==='undefined')return;
  const KEY='milville-hd-marker';
  HD.marker=null;try{const s=localStorage.getItem(KEY);if(s)HD.marker=JSON.parse(s);}catch(e){}
  const save=()=>{try{if(HD.marker)localStorage.setItem(KEY,JSON.stringify(HD.marker));else localStorage.removeItem(KEY);}catch(e){}};
  const btn=document.createElement('button');btn.id='hdmarkx';btn.textContent='✕';btn.title='Clear the map marker';btn.hidden=true;
  btn.addEventListener('mousedown',e=>e.stopPropagation());btn.addEventListener('click',e=>{e.stopPropagation();HD.clearMarker();});
  const wrap=document.getElementById('minimapwrap');if(wrap)wrap.appendChild(btn);
  const flagOnMap=()=>{if(!HD.marker)return;const g=c.getContext('2d');const x=(HD.marker.x+0.5)*6,y=(HD.marker.y+0.5)*6;
    g.save();g.lineWidth=3;g.strokeStyle='#1a1206';g.beginPath();g.arc(x,y,7.5,0,7);g.stroke();g.strokeStyle='#ffd23d';g.lineWidth=1.8;g.beginPath();g.arc(x,y,7.5,0,7);g.stroke();
    g.strokeStyle='#1a1206';g.lineWidth=3;g.beginPath();g.moveTo(x,y);g.lineTo(x,y-20);g.stroke();g.strokeStyle='#ffd23d';g.lineWidth=1.6;g.beginPath();g.moveTo(x,y);g.lineTo(x,y-20);g.stroke();
    g.fillStyle='#ffd23d';g.strokeStyle='#1a1206';g.lineWidth=1.2;g.beginPath();g.moveTo(x,y-20);g.lineTo(x+13,y-15.5);g.lineTo(x,y-11);g.closePath();g.fill();g.stroke();g.restore();};
  const refresh=()=>{btn.hidden=!HD.marker;const wm=document.getElementById('wmap');if(wm&&wm.classList.contains('on')&&typeof openWorldMap==='function')openWorldMap();};
  HD.setMarker=function(x,y){HD.marker={x,y};save();refresh();if(typeof msg==='function')msg('Marker set. The yellow arrow on the minimap points the way.','#4d432f');};
  HD.clearMarker=function(quiet){HD.marker=null;save();refresh();if(!quiet&&typeof msg==='function')msg('Marker cleared.','#4d432f');};
  c.addEventListener('click',function(e){
    if(HD.pilot||HD._indoors)return;
    const r=c.getBoundingClientRect();const tx=Math.floor((e.clientX-r.left)*(c.width/r.width)/6),ty=Math.floor((e.clientY-r.top)*(c.height/r.height)/6);
    if(typeof inb==='function'&&!inb(tx,ty))return;
    if(HD.marker&&Math.abs(HD.marker.x-tx)<=1&&Math.abs(HD.marker.y-ty)<=1){HD.clearMarker();return;}
    HD.setMarker(tx,ty);
  });
  if(typeof openWorldMap==='function'){const _o=openWorldMap;openWorldMap=function(){const r=_o.apply(this,arguments);try{flagOnMap();}catch(e){}return r;};}
  /* the round minimap: the marker in map space is rotated by camYaw round the player */
  if(typeof drawMini==='function'&&typeof mctx!=='undefined'){const _dm=drawMini;drawMini=function(){const r=_dm.apply(this,arguments);try{
    if(!HD.marker||(typeof curInterior==='function'&&curInterior()))return r;
    const dx=(HD.marker.x+0.5)-(player.px+0.5),dy=(HD.marker.y+0.5)-(player.py+0.5);
    if(Math.max(Math.abs(HD.marker.x-player.x),Math.abs(HD.marker.y-player.y))<=1){HD.clearMarker(true);if(typeof msg==='function')msg('You have reached your marker.','#4d432f');return r;}
    const z=(typeof MM_Z!=='undefined')?MM_Z:1;const cy=typeof camYaw!=='undefined'?camYaw:0;
    const sx=(dx*Math.cos(cy)-dy*Math.sin(cy))*4*z,sy=(dx*Math.sin(cy)+dy*Math.cos(cy))*4*z;
    const d=Math.hypot(sx,sy);const R=72;
    mctx.save();mctx.translate(84,84);
    if(d<R){/* inside the circle: the flag itself */
      mctx.translate(sx,sy);mctx.lineWidth=2.5;mctx.strokeStyle='#1a1206';mctx.beginPath();mctx.moveTo(0,0);mctx.lineTo(0,-11);mctx.stroke();mctx.strokeStyle='#ffd23d';mctx.lineWidth=1.4;mctx.beginPath();mctx.moveTo(0,0);mctx.lineTo(0,-11);mctx.stroke();
      mctx.fillStyle='#ffd23d';mctx.strokeStyle='#1a1206';mctx.lineWidth=1;mctx.beginPath();mctx.moveTo(0,-11);mctx.lineTo(8,-8);mctx.lineTo(0,-5);mctx.closePath();mctx.fill();mctx.stroke();
    }else{/* at the rim: an arrow pointing the way */
      const a=Math.atan2(sy,sx);mctx.rotate(a);mctx.translate(R,0);
      mctx.fillStyle='#ffd23d';mctx.strokeStyle='#1a1206';mctx.lineWidth=1.6;mctx.beginPath();mctx.moveTo(9,0);mctx.lineTo(-5,-6.5);mctx.lineTo(-2,0);mctx.lineTo(-5,6.5);mctx.closePath();mctx.fill();mctx.stroke();
    }
    mctx.restore();
  }catch(e){}return r;};}
  refresh();
})();
