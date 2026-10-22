
// ════════════════════════════════════════════════════════════════
// ROUND-7 VISUALS
// ════════════════════════════════════════════════════════════════
const reducedMotion=()=>!!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const CD_HTML='<div class="cd-face"><div class="cd-shine"></div><div class="cd-label"></div><div class="cd-hole"></div></div>';

// ── colour maths ──
function hexToRgb(h){h=String(h).replace('#','');return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]}
function rgbToHsl(r,g,b){
  r/=255;g/=255;b/=255;const mx=Math.max(r,g,b),mn=Math.min(r,g,b);let h=0,s=0;const l=(mx+mn)/2;
  if(mx!==mn){const d=mx-mn;s=l>.5?d/(2-mx-mn):d/(mx+mn);h=mx===r?((g-b)/d+(g<b?6:0)):mx===g?((b-r)/d+2):((r-g)/d+4);h*=60}
  return [h,s,l];
}
function hslToHex(h,s,l){
  const k=n=>(n+h/30)%12,a=s*Math.min(l,1-l),f=n=>l-a*Math.max(-1,Math.min(k(n)-3,Math.min(9-k(n),1)));
  return '#'+[f(0),f(8),f(4)].map(x=>Math.round(Math.max(0,Math.min(1,x))*255).toString(16).padStart(2,'0')).join('');
}
function luminance(hex){const c=hexToRgb(hex).map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)});return .2126*c[0]+.7152*c[1]+.0722*c[2]}
function contrastRatio(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
// nudge lightness until the colour is readable on the background (WCAG contrast >= min)
function readableHsl(h,s,bg,min,startL){
  const light=luminance(bg)>.5;let l=startL;
  for(let k=0;k<50;k++){const hex=hslToHex(h,s,l);if(contrastRatio(hex,bg)>=min)return hex;l+=light?-.02:.02;if(l<=0||l>=1)break}
  return light?'#000000':'#ffffff';
}

// ── palette from cover art (computed in the browser, cached) ──
const PAL_KEY='cc_palette_v1';
let palettes=(()=>{try{const p=JSON.parse(safeGet(PAL_KEY));return (p&&typeof p==='object'&&!Array.isArray(p))?p:{}}catch(e){return {}}})();
const palMemo=new Map(),palPending=new Map();
let palSaveT=null,palActive=0;const palQueue=[];
function savePalettesSoon(){clearTimeout(palSaveT);palSaveT=setTimeout(()=>safeSet(PAL_KEY,JSON.stringify(palettes)),800)}
function paletteFromPixels(data){
  const buckets=new Map();
  for(let p=0;p<data.length;p+=4){
    if(data[p+3]<128)continue;
    const r=data[p],g=data[p+1],b=data[p+2],key=((r>>4)<<8)|((g>>4)<<4)|(b>>4);
    const e=buckets.get(key)||{n:0,r:0,g:0,b:0};e.n++;e.r+=r;e.g+=g;e.b+=b;buckets.set(key,e);
  }
  const cols=[...buckets.values()].map(e=>{const [h,s,l]=rgbToHsl(e.r/e.n,e.g/e.n,e.b/e.n);return {n:e.n,h,s,l}});
  if(!cols.length)return null;
  const total=cols.reduce((a,c)=>a+c.n,0);
  // accent = frequent AND colourful (ignores near-black / near-white); base = the most common colour
  const vivid=cols.filter(c=>c.l>.12&&c.l<.9&&c.s>.12).map(c=>Object.assign({score:c.n/total*(.25+c.s)*(1-Math.abs(c.l-.5))},c)).sort((a,b)=>b.score-a.score)[0];
  const dom=cols.slice().sort((a,b)=>b.n-a.n)[0];
  const acc=vivid||dom;
  return {h:Math.round(acc.h),s:+acc.s.toFixed(3),l:+acc.l.toFixed(3),dh:Math.round(dom.h),ds:+dom.s.toFixed(3),dl:+dom.l.toFixed(3),grey:!vivid};
}
function paletteFromUrl(src){
  return new Promise(res=>{
    const img=new Image();let done=false;const fin=v=>{if(!done){done=true;res(v)}};
    if(!String(src).startsWith('data:'))img.crossOrigin='anonymous';   // pixels are only readable from CORS-enabled images
    img.onload=()=>{try{const c=document.createElement('canvas');c.width=c.height=24;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(img,0,0,24,24);fin(paletteFromPixels(x.getImageData(0,0,24,24).data))}catch(e){fin(null)}};
    img.onerror=()=>fin(null);
    setTimeout(()=>fin(null),8000);
    img.src=src;
  });
}
function paletteKey(i){const d=discs[i];if(isSlotEmpty(d))return null;return customArt.has(i)?'custom:'+i+':'+customArt.get(i).length:keyOf(d)}
function knownPalette(i){const k=paletteKey(i);if(!k)return null;if(palettes[k])return palettes[k];return palMemo.has(k)?palMemo.get(k):undefined}
function paletteFor(i){
  const k=paletteKey(i);if(!k)return Promise.resolve(null);
  if(palettes[k])return Promise.resolve(palettes[k]);
  if(palMemo.has(k))return Promise.resolve(palMemo.get(k));
  if(palPending.has(k))return palPending.get(k);
  const srcs=slotArtSources(i);
  const p=new Promise(resolve=>{
    const run=async()=>{
      palActive++;
      let pal=null;
      try{for(const s of srcs){pal=await paletteFromUrl(s);if(pal)break}}catch(e){}
      palActive--;
      if(pal){palettes[k]=pal;savePalettesSoon()}else palMemo.set(k,null);   // failures are not persisted: retried next visit
      palPending.delete(k);resolve(pal);
      const next=palQueue.shift();if(next)next();
    };
    if(palActive<4)run();else palQueue.push(run);                          // at most 4 covers analysed at once
  });
  palPending.set(k,p);return p;
}
// theme-aware, contrast-checked colours for one disc
function discColors(p){
  if(!p)return null;
  const light=document.body.classList.contains('light-theme');
  const bg=light?'#faf8f5':'#111114';
  const s=Math.min(.85,Math.max(p.grey?.08:.35,p.s));
  return {accent:readableHsl(p.h,s,bg,4.5,light?.42:.6),glow:hslToHex(p.h,s,light?.6:.45),tint:hslToHex(p.dh,Math.min(.55,p.ds),light?.92:.12)};
}
function setDiscVars(el,c){
  ['--disc-accent','--disc-glow','--disc-tint'].forEach(v=>el.style.removeProperty(v));
  el.classList.toggle('tinted',!!c);
  if(c){el.style.setProperty('--disc-accent',c.accent);el.style.setProperty('--disc-glow',c.glow);el.style.setProperty('--disc-tint',c.tint)}
}

// ── the CD itself: label = cover, rainbow sheen follows the pointer / phone tilt, spins while playing ──
function setCdLabel(el,src){
  const l=el&&el.querySelector('.cd-label');if(!l)return;
  l.style.backgroundImage=src?`url("${String(src).replace(/"/g,'%22')}")`:'none';
  l.classList.toggle('blank',!src);
}
function onDiscOpened(i){
  renderModalEmblem(i);
  const modal=$('infoModal');setDiscVars(modal,null);
  const cd=$('modalCd');setCdLabel(cd,customArt.get(i)||null);
  cd.classList.toggle('spinning',!!(nowPlaying&&nowPlaying.index===i));
  cd.classList.remove('out');void cd.offsetWidth;cd.classList.add('out');   // replay the slide-out
  const token=modalToken;
  paletteFor(i).then(p=>{if(token===modalToken&&currentModalIndex===i){setDiscVars(modal,discColors(p));renderModalEmblem(i)}});
}
function setSheen(deg){document.documentElement.style.setProperty('--sheen',Math.round(deg)+'deg')}
document.addEventListener('pointermove',e=>{if(document.querySelector('.cd:not([hidden])'))setSheen(e.clientX/Math.max(1,innerWidth)*220+e.clientY/Math.max(1,innerHeight)*140)},{passive:true});
let tiltAsked=false;
function enableTilt(){
  if(tiltAsked)return;tiltAsked=true;
  const go=()=>window.addEventListener('deviceorientation',e=>{if(e.gamma!=null)setSheen((e.gamma+90)*2+(e.beta||0))},{passive:true});
  try{if(typeof DeviceOrientationEvent!=='undefined'&&typeof DeviceOrientationEvent.requestPermission==='function')DeviceOrientationEvent.requestPermission().then(r=>{if(r==='granted')go()}).catch(()=>{});else go()}catch(e){}
}
document.addEventListener('pointerdown',e=>{if(e.pointerType==='touch')enableTilt()},{once:true,passive:true});
function refreshNpCd(){
  const cd=$('npCd');if(!cd)return;
  const i=nowPlaying?nowPlaying.index:null;
  setCdLabel(cd,i!==null&&!isSlotEmpty(discs[i])?(slotArtSources(i)[0]||null):null);
  const mc=$('modalCd');if(mc&&currentModalIndex!==null)mc.classList.toggle('spinning',!!(nowPlaying&&nowPlaying.index===currentModalIndex));
  markNpTile();if(listen.on)refreshAuroraColors();
}

// ── morphing transitions (View Transitions API) — user actions only; programmatic calls stay synchronous ──
// Animations follow the system "reduce motion" setting. (Headless test browsers report "reduce", which keeps every
// programmatic path synchronous; tests set __ccForceVT to exercise the animated path on purpose.)
const canVT=()=>!!document.startViewTransition&&(window.__ccForceVT===true||!reducedMotion());
function heroOf(el){return el&&(el.querySelector('.slot-art,.slot-art-placeholder,.ring-cover,.sp-text')||el)}
function uiOpenDisc(i,fromEl){
  if(!canVT()||!fromEl){openInfoModal(i);return Promise.resolve()}
  const src=heroOf(fromEl);src.style.viewTransitionName='cc-hero';
  const t=document.startViewTransition(()=>{src.style.viewTransitionName='';openInfoModal(i);$('modalArtWrap').style.viewTransitionName='cc-hero'});
  t.ready.catch(()=>{});t.updateCallbackDone.catch(()=>{});   // rapid clicks skip a transition: not an error
  return t.finished.catch(()=>{}).finally(()=>{$('modalArtWrap').style.viewTransitionName=''});
}
function uiCloseModal(){
  const i=currentModalIndex;
  const tile=i!==null&&currentView==='grid'?document.querySelector(`#grid .slot[data-index="${i}"]:not(.filtered-out)`):null;
  if(!canVT()||!tile){closeModal();return Promise.resolve()}
  const dst=heroOf(tile);$('modalArtWrap').style.viewTransitionName='cc-hero';
  const t=document.startViewTransition(()=>{$('modalArtWrap').style.viewTransitionName='';closeModal();dst.style.viewTransitionName='cc-hero'});
  t.ready.catch(()=>{});t.updateCallbackDone.catch(()=>{});   // rapid clicks skip a transition: not an error
  return t.finished.catch(()=>{}).finally(()=>{dst.style.viewTransitionName=''});
}
let lastFilterAnim=0;
function uiApplyFilters(){
  if(!canVT()||currentView!=='grid'||Date.now()-lastFilterAnim<350){applyFilters();return Promise.resolve()}
  lastFilterAnim=Date.now();
  const vh=innerHeight;
  const tag=()=>document.querySelectorAll('#grid .slot:not(.filtered-out)').forEach(el=>{const r=el.getBoundingClientRect();if(r.bottom>-200&&r.top<vh+200)el.style.viewTransitionName='s'+el.dataset.index});
  const untag=()=>document.querySelectorAll('#grid .slot').forEach(el=>{el.style.viewTransitionName=''});
  tag();
  const t=document.startViewTransition(()=>{untag();applyFilters();tag()});
  t.ready.catch(()=>{});t.updateCallbackDone.catch(()=>{});   // rapid clicks skip a transition: not an error
  return t.finished.catch(()=>{}).finally(untag);
}

// ── VIEWS: grid · list · carousel (the changer's own ring) · spines ──
let currentView='grid';
const VIEW_PANES={ring:'ringView',spines:'spineView',changer:'changerView',emblems:'emblemView',city:'cityView',wall:'wallView',seek:'seekView'};
function setView(v){
  if(!['grid','list',...Object.keys(VIEW_PANES)].includes(v))v='grid';
  currentView=v;safeSet('cc_view',v);
  const sel=$('viewSelect');if(sel.value!==v)sel.value=v;
  if(listView!==(v==='list'))toggleListView();
  $('grid').style.display=VIEW_PANES[v]?'none':'';
  Object.entries(VIEW_PANES).forEach(([k,id])=>{$(id).style.display=k===v?'':'none'});
  document.body.dataset.view=v;
  if(v==='ring')renderRing();
  if(v==='spines')renderSpines();
  if(v==='changer')renderChanger();
  if(v==='emblems')renderEmblems();
  if(v==='city')renderCity();
  if(v==='wall'&&typeof renderWall==='function')renderWall();
  if(v==='seek'&&typeof renderSeek==='function')renderSeek();
}
let altT=null;
function afterGridRefresh(){
  clearTimeout(altT);
  altT=setTimeout(()=>{if(currentView==='ring')renderRing(true);else if(currentView==='spines')renderSpines();else if(currentView==='changer')renderChanger();else if(currentView==='emblems')renderEmblems();else if(currentView==='city')renderCity()},40);
  markNpTile();
  if(currentView==='wall'&&typeof renderWall==='function')renderWall();
  if(typeof wallInvalidate==='function')wallInvalidate();
  if(document.body.classList.contains('zoom-cards'))fillCardTracks();
  if(document.body.classList.contains('showroom'))observeTileGlows();
}

// carousel
const ring={rot:0,items:[],front:-1,anim:0,drag:null,moved:false};
function renderRing(keep){
  const el=$('ring');const n=discs.length;const f=currentFilters();
  if(!keep||ring.items.length!==n){
    el.innerHTML='';ring.items=[];
    for(let i=0;i<n;i++){
      const it=document.createElement('button');
      it.type='button';it.dataset.index=i;
      const empty=isSlotEmpty(discs[i])&&!isWish(i);
      it.className='ring-item'+(empty?' empty':'')+(isWish(i)?' wish':'');
      it.setAttribute('aria-label','Slot '+slotNum(i)+(empty?' (empty)':': '+discs[i][0]+' — '+discs[i][1]));
      it.innerHTML=`<span class="ring-num">${slotNum(i)}</span>`;
      const srcs=slotArtSources(i);
      if(srcs.length){const img=document.createElement('img');img.alt='';img.className='ring-cover';img.loading='lazy';img.decoding='async';it.prepend(img);loadImgWithFallbacks(img,srcs,()=>img.remove())}
      el.appendChild(it);ring.items.push(it);
    }
    ring.front=-1;
  }
  ring.items.forEach((it,i)=>it.classList.toggle('dim',!matches(i,f)));
  layoutRing();
}
function layoutRing(){
  const stage=$('ringStage');const n=ring.items.length;if(!n)return;
  const w=stage.clientWidth||900,h=stage.clientHeight||520;
  const R=Math.min(w*.44,h*1.15),tilt=.32,cx=w/2,cy=h*.40,step=360/n;
  const front=((Math.round(-ring.rot/step)%n)+n)%n;          // the slot at the read position (front and centre)
  for(let i=0;i<n;i++){
    const a=(i*step+ring.rot)*Math.PI/180,z=Math.cos(a);
    const x=cx+R*Math.sin(a),y=cy+R*tilt*z;
    let s=.38+.5*((z+1)/2),lift=0,zi=Math.round((z+1)*20000);
    if(i===front){s=1.85;lift=-58;zi=100000}                  // lifted out of the ring
    const it=ring.items[i];
    it.style.transform=`translate(${x.toFixed(1)}px,${(y+lift).toFixed(1)}px) translate(-50%,-50%) scale(${s.toFixed(3)})`;
    it.style.zIndex=String(zi);
    it.style.opacity=i===front?'1':(.18+.82*((z+1)/2)).toFixed(3);
  }
  if(front!==ring.front){
    if(ring.items[ring.front])ring.items[ring.front].classList.remove('front');
    ring.items[front].classList.add('front');ring.front=front;
    // slot numbers only near the front and on every tenth slot, so the ring stays readable
    ring.items.forEach((it,i)=>{const d=Math.min((i-front+n)%n,(front-i+n)%n);it.classList.toggle('num-on',d<=3||(i+1)%10===0)});
    renderRingReadout();
  }
}
function ringFrontIndex(){return ring.front}
function ringRotateTo(i,instant){
  const step=360/discs.length;let target=-i*step;
  while(target-ring.rot>180)target-=360;while(target-ring.rot<-180)target+=360;
  cancelAnimationFrame(ring.anim);
  if(instant||reducedMotion()){ring.rot=target;layoutRing();return}
  const from=ring.rot,t0=performance.now(),dur=480;
  const tick=t=>{const k=Math.min(1,(t-t0)/dur),e=1-Math.pow(1-k,3);ring.rot=from+(target-from)*e;layoutRing();if(k<1)ring.anim=requestAnimationFrame(tick)};
  ring.anim=requestAnimationFrame(tick);
}
function ringStepBy(d){const n=discs.length;ringRotateTo(((ring.front<0?0:ring.front)+d+n)%n)}
function renderRingReadout(){
  const i=ring.front;const el=$('ringReadout');if(i<0){el.innerHTML='';return}
  const d=discs[i];const empty=isSlotEmpty(d)&&!isWish(i);const m=getMeta(i);
  const plays=m.playHistory.length;
  el.innerHTML=`<div class="rr-num">${slotNum(i)}</div><div class="rr-text">`+
    (empty?'<div class="rr-album">— EMPTY SLOT —</div>':`<div class="rr-artist">${escH(d[0]||'')}</div><div class="rr-album">${escH(d[1]||'')}</div><div class="rr-meta">${[isWish(i)?'♥ WISHLIST':'',plays?plays+' PLAY(S)':'NEVER PLAYED',m.flags.includes('loaned')?'ON LOAN':'',setPos(i)?'⛓ SET':''].filter(Boolean).join(' · ')}</div>`)+
    `</div>`+(empty?'':'<button class="btn gold-btn" type="button" data-ring-open="1">OPEN</button>');
}
(function wireRing(){
  const stage=$('ringStage');
  stage.addEventListener('pointerdown',e=>{if(e.button!==0)return;cancelAnimationFrame(ring.anim);ring.drag={x:e.clientX,rot:ring.rot,lx:e.clientX,lt:performance.now(),v:0};ring.moved=false;try{stage.setPointerCapture(e.pointerId)}catch(err){}});
  stage.addEventListener('pointermove',e=>{
    const d=ring.drag;if(!d)return;
    const dx=e.clientX-d.x;if(Math.abs(dx)>5)ring.moved=true;
    const now=performance.now();d.v=(e.clientX-d.lx)/Math.max(1,now-d.lt)*.3;d.lx=e.clientX;d.lt=now;
    ring.rot=d.rot+dx*.3;layoutRing();
  });
  const end=()=>{
    const d=ring.drag;ring.drag=null;if(!d||!ring.moved)return;
    let v=d.v*16;   // degrees per frame
    const coast=()=>{v*=.93;ring.rot+=v;layoutRing();if(Math.abs(v)>.15&&!reducedMotion())ring.anim=requestAnimationFrame(coast);else ringRotateTo(ring.front)};
    ring.anim=requestAnimationFrame(coast);
  };
  stage.addEventListener('pointerup',end);stage.addEventListener('pointercancel',end);
  stage.addEventListener('click',e=>{
    if(ring.moved){ring.moved=false;return}
    const it=e.target.closest('.ring-item');if(!it)return;
    const i=Number(it.dataset.index);
    if(i===ring.front){if(!it.classList.contains('empty'))uiOpenDisc(i,it)}else ringRotateTo(i);
  });
  stage.addEventListener('wheel',e=>{if(e.ctrlKey)return;e.preventDefault();ringStepBy(e.deltaY>0||e.deltaX>0?1:-1)},{passive:false});
  $('ringReadout').addEventListener('click',e=>{if(e.target.closest('[data-ring-open]')){const it=ring.items[ring.front];uiOpenDisc(ring.front,it)}});
  window.addEventListener('resize',()=>{if(currentView==='ring')layoutRing()});
})();

// spines
function spineFallback(i){
  const s=((discs[i]&&discs[i][0])||'')+'';let h=0;for(let k=0;k<s.length;k++)h=(h*31+s.charCodeAt(k))>>>0;
  const light=document.body.classList.contains('light-theme');
  return hslToHex(h%360,.3,light?.78:.22);
}
function spineColors(i){
  const p=knownPalette(i);
  const light=document.body.classList.contains('light-theme');
  const bg=p?hslToHex(p.dh,Math.min(.6,Math.max(.15,p.ds)),light?.8:.24):spineFallback(i);
  const fg=contrastRatio('#f4f1ec',bg)>=contrastRatio('#141418',bg)?'#f4f1ec':'#141418';
  const stripe=p?hslToHex(p.h,Math.min(.85,Math.max(.35,p.s)),light?.4:.55):'transparent';
  return {bg,fg,stripe,known:!!p};
}
function paintSpine(sp,i){const c=spineColors(i);sp.style.setProperty('--sp-bg',c.bg);sp.style.setProperty('--sp-fg',c.fg);sp.style.setProperty('--sp-stripe',c.stripe);return c}
const spineObserver=('IntersectionObserver' in window)?new IntersectionObserver(ents=>{
  ents.forEach(en=>{if(!en.isIntersecting)return;spineObserver.unobserve(en.target);const i=Number(en.target.dataset.index);paletteFor(i).then(p=>{if(p&&en.target.isConnected)paintSpine(en.target,i)})});
},{rootMargin:'200px'}):null;
function renderSpines(){
  const el=$('spineShelf');const f=currentFilters();el.innerHTML='';
  discs.forEach((d,i)=>{
    const sp=document.createElement('button');sp.type='button';sp.dataset.index=i;
    if(isSlotEmpty(d)&&!isWish(i)){sp.className='spine empty';sp.disabled=true;sp.setAttribute('aria-label','Slot '+slotNum(i)+' (empty)');sp.innerHTML=`<span class="sp-num">${slotNum(i)}</span>`;el.appendChild(sp);return}
    sp.className='spine'+(matches(i,f)?'':' dim')+(isWish(i)?' wish':'')+(setPos(i)?' in-set':'');
    sp.setAttribute('aria-label','Slot '+slotNum(i)+': '+d[0]+' — '+d[1]);
    sp.innerHTML=`<span class="sp-text"><b>${escH(d[0]||'')}</b>${d[1]?' · '+escH(d[1]):''}</span><span class="sp-num">${slotNum(i)}</span><span class="sp-peek"></span>`;
    const c=paintSpine(sp,i);
    el.appendChild(sp);
    if(!c.known&&spineObserver)spineObserver.observe(sp);
  });
}
$('spineShelf').addEventListener('click',e=>{const sp=e.target.closest('.spine:not(.empty)');if(sp)uiOpenDisc(Number(sp.dataset.index),sp)});
$('spineShelf').addEventListener('pointerover',e=>{
  const sp=e.target.closest('.spine:not(.empty)');if(!sp||sp.dataset.peeked)return;sp.dataset.peeked='1';
  const src=slotArtSources(Number(sp.dataset.index))[0];const pk=sp.querySelector('.sp-peek');
  if(src&&pk)pk.style.backgroundImage=`url("${String(src).replace(/"/g,'%22')}")`;
});

// ── PATINA (showroom): dust on long-unplayed discs, sheen on fresh plays, ghost case while on loan ──
function wearClasses(i){
  const d=discs[i];if(isSlotEmpty(d))return [];
  const m=getMeta(i);const out=[];const now=Date.now();
  if(m.flags.includes('loaned'))out.push('wear-out');
  const ph=m.playHistory;const last=ph.length?Date.parse(ph[ph.length-1]):NaN;
  if(!isNaN(last)&&now-last<=14*864e5)out.push('wear-fresh');
  else{
    const added=m.addedAt?Date.parse(m.addedAt):NaN;
    // dust needs evidence: a last play over a year ago, or never played since being added 6+ months ago
    if((!isNaN(last)&&now-last>365*864e5)||(isNaN(last)&&!isNaN(added)&&now-added>180*864e5))out.push('wear-dust');
  }
  return out;
}

// ── SHOWROOM mode: ambient colour from the disc that's playing, per-tile glow from each cover ──
function toggleShowroom(on){
  const v=on===undefined?!document.body.classList.contains('showroom'):!!on;
  document.body.classList.toggle('showroom',v);safeSet('cc_showroom',v?'1':'0');
  $('showroomBtn').textContent=v?'✨ SHOWROOM: ON':'✨ SHOWROOM: OFF';
  if(v){applyAmbient();observeTileGlows()}else document.body.style.removeProperty('--amb');
}
function applyAmbient(){
  if(!document.body.classList.contains('showroom'))return;
  const i=nowPlaying?nowPlaying.index:null;
  if(i===null||isSlotEmpty(discs[i])){document.body.style.removeProperty('--amb');return}
  paletteFor(i).then(p=>{const c=discColors(p);if(c&&nowPlaying&&nowPlaying.index===i)document.body.style.setProperty('--amb',c.glow)});
}
const glowObserver=('IntersectionObserver' in window)?new IntersectionObserver(ents=>{
  ents.forEach(en=>{if(!en.isIntersecting)return;glowObserver.unobserve(en.target);const i=Number(en.target.dataset.index);paletteFor(i).then(p=>{const c=discColors(p);if(c&&en.target.isConnected)en.target.style.setProperty('--tile-glow',c.glow)})});
},{rootMargin:'300px'}):null;
function observeTileGlows(){if(!glowObserver)return;document.querySelectorAll('#grid .slot:not(.empty-slot)').forEach(el=>{if(!el.style.getPropertyValue('--tile-glow'))glowObserver.observe(el)})}

// ── LISTENING ROOM: fullscreen now-playing for a TV or a tablet by the stereo ──
let roomIndex=null,roomWake=null,roomClockT=null;
const ownedSlots=()=>discs.map((_,i)=>i).filter(i=>!isSlotEmpty(discs[i])&&!isWish(i));
function openRoom(i){
  const owned=ownedSlots();if(!owned.length){toast('NO DISCS TO SHOW');return}
  if(i===undefined||i===null||isSlotEmpty(discs[i]))
    i=(nowPlaying&&!isSlotEmpty(discs[nowPlaying.index]))?nowPlaying.index:(currentModalIndex!==null&&!isSlotEmpty(discs[currentModalIndex])?currentModalIndex:owned[0]);
  renderRoom(i);
  $('roomModal').classList.add('open');
  try{if(navigator.wakeLock)navigator.wakeLock.request('screen').then(l=>{roomWake=l}).catch(()=>{})}catch(e){}   // keep the screen on
  clearInterval(roomClockT);tickRoomClock();roomClockT=setInterval(tickRoomClock,20000);
}
function closeRoom(){
  $('roomModal').classList.remove('open');clearInterval(roomClockT);
  if(ident.auto)setIdentifyAuto(false);ident.external=null;setIdStatus('');
  try{roomWake&&roomWake.release()}catch(e){}roomWake=null;
  if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});
}
function renderRoom(i,animate){
  ident.external=null;$('roomSong').style.display='none';renderRoomLinks(null);$('roomCover').classList.remove('pending');
  roomIndex=i;const d=discs[i];const e=mbCache[keyOf(d)];const m=getMeta(i);
  const playing=!!(nowPlaying&&nowPlaying.index===i);
  $('roomLabel').textContent=(playing?'NOW PLAYING':'DISC')+' · '+slotNum(i);
  $('roomArtist').textContent=d[0]||'';$('roomAlbum').textContent=d[1]||'';
  $('roomTags').textContent=[effectiveYear(i),...effectiveGenres(i).slice(0,3),m.playHistory.length?m.playHistory.length+' PLAYS':''].filter(Boolean).join(' · ');
  const ov=getOverride(i);
  const tracks=(ov&&ov.tracks&&ov.tracks.length)?ov.tracks.map(t=>({title:t})):((e&&Array.isArray(e.tracks))?e.tracks:[]);
  $('roomTracks').innerHTML=tracks.slice(0,24).map(t=>`<li><span class="rt-title">${escH(t.title)}</span>${t.length?`<span class="rt-len">${escH(t.length)}</span>`:''}</li>`).join('')||'<li class="none">No tracklist yet — open the disc once to look it up</li>';
  // stepping between discs dissolves the old cover into the new one (particles); first open is a plain load
  const img=$('roomCover');const srcs=slotArtSources(i);
  const applySrc=src=>{if(roomIndex!==i)return;$('roomBg').style.backgroundImage=src?`url("${String(src).replace(/"/g,'%22')}")`:'none';setCdLabel($('roomCd'),src||null)};
  if(animate&&img.getAttribute('src')&&img.style.visibility!=='hidden'){
    firstWorkingSrc(srcs).then(src=>{if(roomIndex!==i)return;applySrc(src);if(src)dissolveImage(img,src);else{img.style.visibility='hidden';img.removeAttribute('src')}});
  }else{
    img.style.visibility='hidden';img.removeAttribute('src');
    if(srcs.length)loadImgWithFallbacks(img,srcs,()=>{img.style.visibility='hidden';applySrc(null)},src=>{if(roomIndex!==i)return;img.style.visibility='';applySrc(src)});
    else applySrc(null);
  }
  if(listen.on)refreshAuroraColors();
  $('roomCd').classList.toggle('spinning',playing);
  $('roomPlayBtn').style.display=webhookCfg().url?'':'none';
  setDiscVars($('roomModal'),null);
  paletteFor(i).then(p=>{if(roomIndex===i)setDiscVars($('roomModal'),discColors(p))});
}
function roomStep(dir){const owned=ownedSlots();if(!owned.length)return;const k=owned.indexOf(roomIndex);renderRoom(owned[((k<0?0:k)+dir+owned.length)%owned.length],true)}
function tickRoomClock(){$('roomClock').textContent=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
function toggleRoomFullscreen(){const r=$('roomModal');if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});else if(r.requestFullscreen)r.requestFullscreen().catch(()=>{})}
async function roomPlay(){if(roomIndex===null)return;const keep=currentModalIndex;currentModalIndex=roomIndex;try{await playOnChanger()}finally{currentModalIndex=keep}renderRoom(roomIndex)}

// ── SEMANTIC ZOOM: pinch / Ctrl+wheel from a colour map of all 200 slots to full cards with tracklists ──
const ZOOM_MIN=56,ZOOM_MAX=260;
function applyZoomClasses(v){
  document.body.classList.toggle('zoom-map',v<100);
  document.body.classList.toggle('zoom-cards',v>=230);
  if(v>=230)fillCardTracks();
}
const _baseSetZoom=setZoom;
setZoom=function(v){_baseSetZoom(v);applyZoomClasses(Number(v))};
function setZoomUi(v){v=Math.max(ZOOM_MIN,Math.min(ZOOM_MAX,Math.round(v)));$('zoomSlider').value=String(v);setZoom(v);return v}
function fillCardTracks(){
  document.querySelectorAll('#grid .slot').forEach(el=>{
    if(el.querySelector('.slot-tracks'))return;
    const i=Number(el.dataset.index);const d=discs[i];
    const ov=getOverride(i);const e=d&&mbCache[keyOf(d)];
    const tracks=(ov&&ov.tracks&&ov.tracks.length)?ov.tracks:((e&&Array.isArray(e.tracks))?e.tracks.map(t=>t.title):[]);
    const ol=document.createElement('ol');ol.className='slot-tracks';     // every tile gets one (empty or not) so all cards stay the same height
    ol.innerHTML=tracks.slice(0,5).map(t=>`<li>${escH(t)}</li>`).join('')+(tracks.length>5?`<li class="more">+${tracks.length-5} more</li>`:'');
    const info=el.querySelector('.slot-info');(info||el).appendChild(ol);
  });
}
(function wireZoom(){
  const gc=document.querySelector('.grid-container');
  gc.addEventListener('wheel',e=>{if(!e.ctrlKey||currentView==='ring')return;e.preventDefault();setZoomUi(Number($('zoomSlider').value)*(e.deltaY<0?1.08:.926))},{passive:false});
  const pts=new Map();let d0=0,z0=0;
  const dist=()=>{const [a,b]=[...pts.values()];return Math.hypot(a.x-b.x,a.y-b.y)};
  gc.addEventListener('pointerdown',e=>{if(e.pointerType!=='touch')return;pts.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pts.size===2){d0=dist();z0=Number($('zoomSlider').value)}});
  gc.addEventListener('pointermove',e=>{if(!pts.has(e.pointerId))return;pts.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pts.size===2&&d0>0)setZoomUi(z0*dist()/d0)});
  ['pointerup','pointercancel','pointerleave'].forEach(t=>gc.addEventListener(t,e=>{pts.delete(e.pointerId);if(pts.size<2)d0=0}));
})();

// ── keys for the carousel / spines / listening room (captured before the grid's own arrow keys) ──
document.addEventListener('keydown',e=>{
  const typing=/^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement&&document.activeElement.tagName)||'');
  if(typing)return;
  if($('roomModal').classList.contains('open')){
    if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();e.stopImmediatePropagation();roomStep(e.key==='ArrowRight'?1:-1)}
    else if(e.key==='f'||e.key==='F'){e.preventDefault();e.stopImmediatePropagation();toggleRoomFullscreen()}
    return;
  }
  if(openLayer())return;
  if(currentView==='ring'){
    if(e.key==='ArrowRight'||e.key==='ArrowDown'){e.preventDefault();e.stopImmediatePropagation();ringStepBy(1)}
    else if(e.key==='ArrowLeft'||e.key==='ArrowUp'){e.preventDefault();e.stopImmediatePropagation();ringStepBy(-1)}
    else if(e.key==='Enter'&&ring.front>=0&&!isSlotEmpty(discs[ring.front])){e.preventDefault();e.stopImmediatePropagation();uiOpenDisc(ring.front,ring.items[ring.front])}
  }else if(currentView==='spines'&&/^Arrow/.test(e.key)){
    e.stopImmediatePropagation();   // let the browser move focus between spines normally
  }
},true);

function round7Init(){
  if(safeGet('cc_showroom')==='1')toggleShowroom(true);
  const v=safeGet('cc_view');if(v&&v!=='grid')setView(v);
  applyZoomClasses(Number($('zoomSlider').value));
  refreshNpCd();
}

