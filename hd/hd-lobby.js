/* ============================================================================
   Milville HD — character creation.  Loaded after hd-body.js.

   The title screen is the game's own. "Create new character" opens a creator with a live
   model: name, body (male / female), skin tone, hair style and colour, top and
   legs. The choices go into player.cosmetic exactly as the fashion shop would
   set them (sex and skin ride along; only the HD body reads those), then the
   game's own new-character steps run unchanged: newSlot, uid, save, enter.

   Gameplay is untouched: nothing here changes what a new character owns or can do.
   ========================================================================== */
(function(){
'use strict';
try{performance.mark('hd:hd-lobby');}catch(e){}
const HD=window.HD;
if(!HD||!HD.ready)return;
if(typeof startNew!=='function'||typeof makeHumanoid!=='function'||typeof newSlot!=='function')return;
const splash=document.getElementById('splash'),cs=document.getElementById('charselect');
if(!splash||!cs)return;

const SKINS=[0xf1d0b0,0xd9a066,0xc98a5a,0xa96a3e,0x7d4a2a,0x4e2f1c];
const hx=n=>'#'+((n>>>0)&0xffffff).toString(16).padStart(6,'0');
const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);
const NAMES={tee:'T-shirt',sleeveless:'Sleeveless',longsleeve:'Long sleeve',tunic:'Tunic',trousers:'Trousers',shorts:'Shorts',skirt:'Skirt',
  short:'Short',long:'Long',pony:'Ponytail',bun:'Bun',bob:'Bob',spiky:'Spiky',mohawk:'Mohawk',bald:'Bald',wavy:'Wavy',braid:'Braid',curly:'Curly',crop:'Crop'};

/* ------------------------------ the old lobby, plus the creator ------------------------------
   The title screen is the game's own again. The HD vista lobby was cut: it rendered the whole
   campus full-screen behind the box every frame, with the composer on and a second WebGL
   context for the creator, the heaviest scene in the game and the first one every player saw.
   Only 'Create new character' changes: it opens the creator in place of the character list. */
const imp=document.getElementById('importsave');
/* the game's own button listener holds the original startNew, so it is intercepted a level up
   in the capture phase; the Enter key in the name field reaches the reassigned startNew */
{const nc=document.getElementById('newchar');if(nc)nc.addEventListener('click',e=>{if(e.target&&e.target.id==='newbtn'){e.stopPropagation();e.preventDefault();openCreate();}},true);}
startNew=function(){openCreate();};

/* ------------------------------- the creator ------------------------------- */
const cr=document.createElement('div');cr.id='hdcr';cr.style.display='none';
cr.innerHTML=
 '<div id="hdcr-stage"><canvas id="hdcr-cv"></canvas><div class="hdcr-hint">drag to turn</div></div>'+
 '<div id="hdcr-ctl">'+
  '<div class="hdcr-row"><label>Name</label><input id="hdcr-name" maxlength="14" placeholder="Name your character" autocomplete="off" spellcheck="false"></div>'+
  '<div class="hdcr-row"><label>Body</label><div class="hdcr-opts" id="hdcr-sex"></div><div class="hdcr-opts" id="hdcr-size"></div></div>'+
  '<div class="hdcr-row"><label>Start</label><div class="hdcr-opts" id="hdcr-tut"></div></div>'+
  '<div class="hdcr-row"><label>Skin</label><div class="hdcr-opts" id="hdcr-skin"></div></div>'+
  '<div class="hdcr-row"><label>Hair</label><div class="hdcr-opts" id="hdcr-hairstyle"></div><div class="hdcr-opts" id="hdcr-hair"></div></div>'+
  '<div class="hdcr-row"><label>Top</label><div class="hdcr-opts" id="hdcr-shirtStyle"></div><div class="hdcr-opts" id="hdcr-shirt"></div></div>'+
  '<div class="hdcr-row"><label>Legs</label><div class="hdcr-opts" id="hdcr-pantsStyle"></div><div class="hdcr-opts" id="hdcr-pants"></div></div>'+
  '<div class="hdcr-foot"><button id="hdcr-rand" class="hdlink">Surprise me</button><span class="hdcr-sp"></span><button id="hdcr-back">Back</button><button id="hdcr-go">Begin</button></div>'+
  '<div id="hdcr-msg"></div>'+
 '</div>';
cs.parentNode.insertBefore(cr,cs.nextSibling);

let work=null,open=false,ren=null,scene=null,cam=null,holder=null,rig=null,raf=0,rotY=Math.PI-0.4,auto=true,drag=null;   /* the rig faces -z: start on its face */
function fresh(){return {start:'tutorial',sex:'m',size:'average',skin:0xd9a066,hairstyle:'short',hair:0x6b4423,shirt:0x8a8148,pants:0x2f5d33,shirtStyle:'tee',pantsStyle:'trousers'};}
function app(){return {skin:work.skin,shirt:work.shirt,pants:work.pants,hair:work.hair,hairstyle:work.hairstyle,shirtStyle:work.shirtStyle,pantsStyle:work.pantsStyle,boots:0x5a3a26,belt:0x6e2419,sex:work.sex};}
function opts(){
  const chips=(host,list,key,label)=>{const h=document.getElementById(host);if(!h)return;h.innerHTML='';for(const v of list){const b=document.createElement('div');b.className='hdcr-chip'+(work[key]===v?' sel':'');b.textContent=label?label(v):v;b.addEventListener('click',()=>{work[key]=v;if(key==='sex'&&!work.touchedHair)work.hairstyle=v==='f'?'long':'short';opts();build();});h.appendChild(b);}};
  /* a hand-picked hair keeps through a sex change */
  const hh=document.getElementById('hdcr-hairstyle');if(hh)hh.addEventListener('click',()=>{work.touchedHair=true;},true);
  const sw=(host,list,key)=>{const h=document.getElementById(host);if(!h)return;h.innerHTML='';for(const v of list){const b=document.createElement('div');b.className='hdcr-sw'+(work[key]===v?' sel':'');b.style.background=hx(v);b.addEventListener('click',()=>{work[key]=v;opts();build();});h.appendChild(b);}};
  chips('hdcr-sex',['m','f'],'sex',v=>v==='m'?'Male':'Female');chips('hdcr-size',['slight','average','broad'],'size',v=>cap(v));
  chips('hdcr-tut',['tutorial','skip'],'start',v=>v==='tutorial'?'Rector\u2019s tutorial':'Skip the tutorial');
  sw('hdcr-skin',SKINS,'skin');
  chips('hdcr-hairstyle',COS_HAIRSTYLES,'hairstyle',v=>NAMES[v]||cap(v));sw('hdcr-hair',COS_HAIRCOLS,'hair');
  chips('hdcr-shirtStyle',COS_SHIRTSTYLES,'shirtStyle',v=>NAMES[v]||cap(v));sw('hdcr-shirt',COS_SHIRTCOLS,'shirt');
  chips('hdcr-pantsStyle',COS_PANTSSTYLES,'pantsStyle',v=>NAMES[v]||cap(v));sw('hdcr-pants',COS_PANTSCOLS,'pants');
}
function init3D(){
  if(ren)return;
  const cv=document.getElementById('hdcr-cv');const w=cv.clientWidth||340,h=cv.clientHeight||440;
  try{ren=new THREE.WebGLRenderer({canvas:cv,antialias:true,alpha:true});}catch(e){ren=null;return;}
  ren.setPixelRatio(Math.min(window.devicePixelRatio||1,2));ren.setSize(w,h,false);
  ren.shadowMap.enabled=true;ren.shadowMap.type=THREE.PCFSoftShadowMap;
  scene=new THREE.Scene();
  cam=new THREE.PerspectiveCamera(26,w/h,0.1,50);cam.position.set(0,1.02,3.9);cam.lookAt(0,0.92,0);
  scene.add(new THREE.HemisphereLight(0xfff3df,0x3a3026,0.9));
  const key=new THREE.DirectionalLight(0xffffff,1.15);key.position.set(2.4,4.2,3.2);key.castShadow=true;key.shadow.mapSize.set(1024,1024);
  key.shadow.camera.near=0.5;key.shadow.camera.far=14;key.shadow.camera.left=-2;key.shadow.camera.right=2;key.shadow.camera.top=3;key.shadow.camera.bottom=-1.2;key.shadow.bias=-0.0013;scene.add(key);
  const fill=new THREE.DirectionalLight(0xbcd0ff,0.45);fill.position.set(-3.2,2,1.6);scene.add(fill);
  const rim=new THREE.DirectionalLight(0xffe0a8,0.6);rim.position.set(-1.4,2.7,-3.4);scene.add(rim);
  const ped=new THREE.Mesh(new THREE.CylinderGeometry(0.62,0.74,0.12,48),new THREE.MeshLambertMaterial({color:0x2e261d}));ped.position.y=-0.04;ped.receiveShadow=true;scene.add(ped);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(0.6,0.02,12,56),new THREE.MeshLambertMaterial({color:0xc9a23d,emissive:0x4a3608}));ring.rotation.x=Math.PI/2;ring.position.y=0.035;scene.add(ring);
  holder=new THREE.Group();scene.add(holder);
  const gx=e=>e.touches&&e.touches[0]?e.touches[0].clientX:e.clientX;
  cv.addEventListener('mousedown',e=>{drag={x:gx(e)};auto=false;});
  window.addEventListener('mousemove',e=>{if(!drag)return;const x=gx(e);rotY+=(x-drag.x)*0.011;drag={x};});
  window.addEventListener('mouseup',()=>{drag=null;});
  cv.addEventListener('touchstart',e=>{drag={x:gx(e)};auto=false;},{passive:true});
  cv.addEventListener('touchmove',e=>{if(!drag)return;const x=gx(e);rotY+=(x-drag.x)*0.011;drag={x};if(e.cancelable)e.preventDefault();},{passive:false});
  cv.addEventListener('touchend',()=>{drag=null;});
}
function build(){
  if(!holder)return;
  if(rig&&rig.g){holder.remove(rig.g);}
  rig=makeHumanoid(app());
  rig.g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.frustumCulled=false;}});
  if(HD.applySize)HD.applySize(rig.g,work.size);
  holder.add(rig.g);
}
function tick(){
  if(!open){raf=0;return;}
  if(auto)rotY+=0.005;
  if(holder)holder.rotation.y=rotY;
  if(ren&&scene&&cam)ren.render(scene,cam);
  raf=requestAnimationFrame(tick);
}
function openCreate(){
  work=fresh();
  const nf=document.getElementById('namefield');const nm=document.getElementById('hdcr-name');
  if(nf&&nf.value)nm.value=nf.value;
  cs.style.display='none';cr.style.display='';
  init3D();opts();build();
  open=true;auto=true;if(!raf)raf=requestAnimationFrame(tick);
  setTimeout(()=>{try{nm.focus();}catch(e){}},50);
}
function closeCreate(){
  open=false;
  cs.style.display='';cr.style.display='none';
}
function begin(){
  const nm=document.getElementById('hdcr-name');const msg=document.getElementById('hdcr-msg');
  let name=(nm.value||'').trim().replace(/\s+/g,' ').slice(0,14);
  if(!name){msg.textContent='Give your character a name first.';nm.focus();nm.classList.add('bad');setTimeout(()=>nm.classList.remove('bad'),1200);return;}
  /* the game's own steps, with the chosen look set between naming and saving */
  newSlot(name);
  player.cosmetic=normCos(Object.assign({},work));
  player.uid=genUid();
  isNewGame=true;
  try{if(typeof pm!=='undefined'&&typeof applyCosmetic==='function')applyCosmetic(pm,player.cosmetic);}catch(e){}
  const skipTut=work.start==='skip';
  saveGame(true);
  open=false;
  enterGame();
  /* the tutorial starts inside enterGame for a new character; skipping it here is the same call the
     Rector's own Skip button makes: kit granted, 'A Warm Welcome' closed, the main quest open */
  if(skipTut){try{if(typeof tutSkip==='function')tutSkip();}catch(e){}}
}
document.getElementById('hdcr-go').addEventListener('click',begin);
document.getElementById('hdcr-back').addEventListener('click',closeCreate);
document.getElementById('hdcr-name').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();begin();}});
document.getElementById('hdcr-rand').addEventListener('click',()=>{
  const pick=a=>a[Math.random()*a.length|0];
  work=Object.assign(work,{sex:pick(['m','f']),size:pick(['slight','average','broad']),skin:pick(SKINS),hairstyle:pick(COS_HAIRSTYLES),hair:pick(COS_HAIRCOLS),shirtStyle:pick(COS_SHIRTSTYLES),shirt:pick(COS_SHIRTCOLS),pantsStyle:pick(COS_PANTSSTYLES),pants:pick(COS_PANTSCOLS)});
  opts();build();
});
HD.lobby={openCreate,closeCreate,work:()=>work};
console.log('[HD] lobby ready');
})();

/* ---- skip the tutorial from the corner of the view at any point ---- */
(function(){
  if(typeof TUT==='undefined'||typeof tutSkip!=='function')return;
  const vw=document.getElementById('viewwrap');if(!vw)return;
  const b=document.createElement('button');b.id='hdtutskip';b.textContent='Skip tutorial';b.title='Skip the rest of the tutorial: you keep the bronze kit and the main quest opens with the Rector';
  b.addEventListener('mousedown',e=>e.stopPropagation());
  b.addEventListener('click',e=>{e.stopPropagation();try{if(TUT._navOnly){TUT.active=false;TUT._navOnly=false;TUT._redo=false;if(typeof tutClearMarkers==='function')tutClearMarkers();if(typeof tutRender==='function')tutRender();}else tutSkip();}catch(err){console.warn('[HD] skip',err);}b.hidden=true;});
  b.hidden=true;vw.appendChild(b);
  setInterval(()=>{const on=!!(TUT&&TUT.active&&!TUT.done);if(b.hidden===on)b.hidden=!on;},300);
})();

