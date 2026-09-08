/* ============================================================================
   Milville HD — 3D item icons.  Loaded after hd-fx.js.

   RuneScape 3 draws every inventory icon from the item's 3D model. The game
   already has a 3D model for every item (makeGroundItem builds what you see
   on the floor), so each icon is that model rendered once, at RS3's front-
   right-above angle, in an offscreen renderer, and cached. drawItemIcon() is
   wrapped: the render is used when one exists, the hand-drawn sprite when the
   model is the generic fallback lump or when a potion dose is being shown.

   Gameplay is untouched: nothing here reads or writes game state.
   ========================================================================== */
(function(){
'use strict';
try{performance.mark('hd:hd-icons');}catch(e){}
const HD=window.HD;
if(!HD||!HD.ready)return;
if(typeof makeGroundItem!=='function'||typeof drawItemIcon!=='function')return;

const SZ=112;
const cv=document.createElement('canvas');cv.width=cv.height=SZ;
let ren=null;
function getRen(){
  if(ren)return ren;
  ren=new THREE.WebGLRenderer({canvas:cv,alpha:true,antialias:true,preserveDrawingBuffer:true});
  ren.setPixelRatio(1);ren.setSize(SZ,SZ,false);ren.setClearColor(0x000000,0);
  ren.shadowMap.enabled=false;
  return ren;
}
const scene=new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xdfe8ff,0x6a5a44,0.55));
const key=new THREE.DirectionalLight(0xfff2e0,1.15);key.position.set(1.2,2.2,1.6);scene.add(key);
const fill=new THREE.DirectionalLight(0xbfd0ff,0.4);fill.position.set(-1.6,0.6,-0.8);scene.add(fill);
const rim=new THREE.DirectionalLight(0xffffff,0.5);rim.position.set(-0.4,1.2,-2.2);scene.add(rim);
const cam=new THREE.PerspectiveCamera(28,1,0.05,50);
const DIR=new THREE.Vector3(0.6,0.55,0.85).normalize();

const cache=new Map(),bad=new Set();
/* the generic lump makeGroundItem returns for an item it has no model for: two dodecahedra in
   exactly these two tans (ores are two dodecahedra too, but coloured) */
function isFallback(g){
  if(g.children.length!==2)return false;
  const hex=g.children.map(m=>m.material&&m.material.color?m.material.color.getHex():-1);
  return hex.includes(0xb89a5a)&&hex.includes(0x9a7a3a);
}
HD.iconFor=function(id){
  if(cache.has(id))return cache.get(id);
  if(bad.has(id))return null;
  let g=null;
  try{g=makeGroundItem(id);}catch(e){g=null;}
  if(!g||!g.children.length||isFallback(g)){bad.add(id);return null;}
  const box=new THREE.Box3().setFromObject(g);
  const size=new THREE.Vector3(),ctr=new THREE.Vector3();box.getSize(size);box.getCenter(ctr);
  const r=Math.max(size.x,size.y,size.z)*0.6+0.01;
  const dist=r/Math.tan(cam.fov*Math.PI/360)*1.02;
  cam.position.copy(ctr).addScaledVector(DIR,dist);cam.lookAt(ctr);
  cam.near=Math.max(0.01,dist*0.1);cam.far=dist*4;cam.updateProjectionMatrix();
  scene.add(g);
  try{getRen().render(scene,cam);}catch(e){scene.remove(g);bad.add(id);return null;}
  scene.remove(g);
  const c=document.createElement('canvas');c.width=c.height=SZ;
  c.getContext('2d').drawImage(cv,0,0);
  g.traverse(o=>{if(o.geometry&&o.geometry.dispose)o.geometry.dispose();});
  cache.set(id,c);
  return c;
};
HD.icons3d=false;   /* the owner prefers the OSRS sprites; HD.iconFor() stays available */
/* RS3 inventory icons: hd/icons/<id>.png where one exists (fetched from the wiki for the items
   that have a RuneScape counterpart); the sprite is drawn until the image arrives, and for
   every item without one */
HD.iconsRS3=false;   /* the owner keeps every icon OSRS-style; the wiki icons stay in hd/icons behind this flag */
const rs3=new Map();
let rs3Have=null;   /* hd/icons/index.json: the ids that have an icon, so nothing is requested twice or in vain */
function rs3Icon(id){
  if(rs3.has(id))return rs3.get(id);
  if(rs3Have&&!rs3Have.has(id)){rs3.set(id,false);return false;}
  const img=new Image();rs3.set(id,null);
  img.onload=()=>{rs3.set(id,img);redraw();};
  img.onerror=()=>{rs3.set(id,false);};
  img.src='hd/icons/'+id+'.png';
  return null;
}
/* every view that draws icons is redrawn (coalesced) when one arrives: the inventory, the bank,
   the equipment tab, the wiki's item grid and detail, shops and the exchange */
let redrawT=0;
function redraw(){
  if(redrawT)return;
  redrawT=setTimeout(()=>{redrawT=0;
    const vis=id=>{const el=document.getElementById(id);return el&&el.offsetParent!==null;};
    for(const [fn,el] of [['renderInv',null],['renderBank','bankui'],['renderEquip',null],['renderGE','geui'],['renderShop','shopui'],['renderEncy','encui']]){
      if(el&&!vis(el))continue;
      if(typeof window[fn]==='function'){try{window[fn]();}catch(e){}}
    }
  },40);
}
/* preload from the manifest, so the wiki and the bank open with the icons already there */
fetch('hd/icons/index.json').then(r=>r.ok?r.json():null).then(list=>{
  if(!Array.isArray(list))return;rs3Have=new Set(list);
  for(const id of list)if(!rs3.has(id))rs3Icon(id);
}).catch(()=>{});
const _di=drawItemIcon;
drawItemIcon=function(g,id,S,dose){
  if(HD.iconsRS3&&dose===undefined){
    const img=rs3Icon(id);
    if(img){
      g.save();
      try{g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';const w=img.naturalWidth,h=img.naturalHeight,k=Math.min(S*0.92/w,S*0.92/h);const dw=w*k,dh=h*k;g.drawImage(img,(S-dw)/2,(S-dh)/2,dw,dh);}
      finally{g.restore();}
      return;
    }
  }
  if(HD.icons3d&&dose===undefined){
    const c=HD.iconFor(id);
    if(c){
      g.save();
      /* inside whatever transform the caller set (banknotes scale and offset the icon) */
      try{g.drawImage(c,S*0.03,S*0.03,S*0.94,S*0.94);}
      finally{g.restore();}
      return;
    }
  }
  return _di.apply(this,arguments);
};
/* UI icons from the RS wiki: skills, the side tabs, prayers, potion doses. hd/ui/index.json lists
   what is there; each replaces the game's sprite in _uiImg, which drawUiIcon reads, and the
   persistent icons are repainted once they have all arrived. */
HD.uiIconsRS3=false;   /* the owner keeps the OSRS-style skill and tab icons; the files stay in hd/ui */
(function(){
  if(!HD.uiIconsRS3||typeof _uiImg==='undefined')return;
  fetch('hd/ui/index.json').then(r=>r.ok?r.json():null).then(list=>{
    if(!Array.isArray(list))return;let left=list.length;
    const done=()=>{if(--left<=0){try{if(typeof _uiIconsRepaint==='function')_uiIconsRepaint();}catch(e){}try{if(typeof renderSkills==='function')renderSkills();}catch(e){}try{if(typeof renderTabs==='function')renderTabs();}catch(e){}}};
    for(const k of list){const im=new Image();im.onload=()=>{_uiImg[k]=im;im._hd=1;done();};im.onerror=done;im.src='hd/ui/'+k+'.png';}
  }).catch(()=>{});
})();
console.log('[HD] 3D item icons ready');
})();
