
// ════════════════════════════════════════════════════════════════
// ROUND-8 VISUALS
// ════════════════════════════════════════════════════════════════
const hexA=(hex,a)=>{const [r,g,b]=hexToRgb(hex);return `rgba(${r},${g},${b},${Math.max(0,Math.min(1,a)).toFixed(3)})`};
const motionOK=()=>window.__ccForceVT===true||!reducedMotion();
function firstWorkingSrc(srcs){
  return new Promise(res=>{if(!srcs||!srcs.length)return res(null);const probe=new Image();loadImgWithFallbacks(probe,srcs,()=>res(null),src=>res(src))});
}

// ══ 1. THE ROOM DRIVES THE PAGE — microphone → Web Audio analyser, all on this device, nothing recorded or sent ══
const listen={on:false,ctx:null,an:null,stream:null,freq:null,wave:null,raf:0,lv:0,bass:0,mid:0,high:0,beat:0,avgBass:0,lastBeat:0,cdRot:0,flow:0,beats:0,frames:0};
async function startListening(){
  if(listen.on)return true;
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){toast('THIS BROWSER CANNOT USE A MICROPHONE',4000);return false}
  try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
    const AC=window.AudioContext||window.webkitAudioContext;const ctx=new AC();
    if(ctx.state==='suspended')await ctx.resume().catch(()=>{});
    const src=ctx.createMediaStreamSource(stream);const an=ctx.createAnalyser();an.fftSize=2048;an.smoothingTimeConstant=.72;src.connect(an);
    Object.assign(listen,{on:true,ctx,an,stream,freq:new Uint8Array(an.frequencyBinCount),wave:new Uint8Array(an.fftSize),frames:0,beats:0,peak:0});
    document.body.classList.add('listening');updateListenUi();refreshAuroraColors();
    listen.raf=requestAnimationFrame(listenLoop);
    toast('🎤 LISTENING — ANALYSED ON THIS DEVICE, NOTHING IS RECORDED OR SENT',4500);
    return true;
  }catch(e){toast('MICROPHONE NOT AVAILABLE: '+String((e&&e.message)||e).toUpperCase(),5000);return false}
}
function stopListening(){
  if(!listen.on)return;
  cancelAnimationFrame(listen.raf);
  try{listen.stream.getTracks().forEach(t=>t.stop())}catch(e){}
  try{listen.ctx.close()}catch(e){}
  Object.assign(listen,{on:false,ctx:null,an:null,stream:null});
  document.body.classList.remove('listening');
  ['--lv','--bass','--beat','--cd-rot'].forEach(k=>document.documentElement.style.removeProperty(k));
  ['aurora','roomAurora'].forEach(id=>{const c=$(id);if(c&&c.width)c.getContext('2d').clearRect(0,0,c.width,c.height)});
  document.querySelectorAll('.room-tracks li.flow').forEach(li=>li.classList.remove('flow'));
  updateListenUi();
}
function toggleListening(){if(listen.on){stopListening();return Promise.resolve(false)}return startListening()}
// the now-playing tile in the grid pulses with the beat while listening
function markNpTile(){
  document.querySelectorAll('#grid .slot.np-tile').forEach(s=>s.classList.remove('np-tile'));
  const i=nowPlaying?nowPlaying.index:null;
  if(i!==null){const t=document.querySelector(`#grid .slot[data-index="${i}"]`);if(t)t.classList.add('np-tile')}
}
function updateListenUi(){
  const on=listen.on;
  $('listenPill').style.display=on?'':'none';
  $('roomListenBtn').textContent=on?'🎤 LISTENING':'🎤 LISTEN';
  $('roomListenBtn').classList.toggle('active',on);
  $('listenMenuBtn').textContent=on?'🎤 STOP LISTENING':'🎤 REACT TO THE MUSIC';
}
function bandEnergy(lo,hi){
  const hz=listen.ctx.sampleRate/listen.an.fftSize;let s=0,n=0;
  for(let k=Math.max(1,Math.floor(lo/hz));k<=Math.min(listen.freq.length-1,Math.ceil(hi/hz));k++){s+=listen.freq[k];n++}
  return n?s/n/255:0;
}
function analyseFrame(){
  listen.an.getByteFrequencyData(listen.freq);listen.an.getByteTimeDomainData(listen.wave);
  let sum=0;for(let k=0;k<listen.wave.length;k++){const v=(listen.wave[k]-128)/128;sum+=v*v}
  listen.lv=listen.lv*.8+Math.min(1,Math.sqrt(sum/listen.wave.length)*3.2)*.2;
  listen.bass=bandEnergy(30,160);listen.mid=bandEnergy(400,2000);listen.high=bandEnergy(4000,12000);
  listen.avgBass=listen.avgBass*.95+listen.bass*.05;
  listen.peak=Math.max(listen.peak||0,listen.bass,listen.mid,listen.high,listen.lv);   // strongest signal heard so far (diagnostics/tests)
  const now=performance.now();
  if(listen.bass>listen.avgBass*1.3+.04&&now-listen.lastBeat>240){listen.beat=1;listen.lastBeat=now;listen.beats++;onBeat()}else listen.beat*=.9;
  listen.frames++;
}
function onBeat(){
  // the room's tracklist highlight steps along with the beat (the page doesn't know the exact track — this is a visual pulse)
  const lis=$('roomModal').classList.contains('open')?$('roomTracks').querySelectorAll('li:not(.none)'):[];
  if(!lis.length)return;
  lis.forEach(li=>li.classList.remove('flow'));
  listen.flow=(listen.flow+1)%lis.length;lis[listen.flow].classList.add('flow');
}
function listenLoop(){
  if(!listen.on)return;
  analyseFrame();
  const r=document.documentElement.style;
  r.setProperty('--lv',listen.lv.toFixed(3));r.setProperty('--bass',listen.bass.toFixed(3));r.setProperty('--beat',listen.beat.toFixed(3));
  listen.cdRot=(listen.cdRot+1.2+listen.lv*9+listen.beat*6)%360;r.setProperty('--cd-rot',listen.cdRot.toFixed(1)+'deg');
  setSheen(40+listen.mid*260+listen.beat*60);
  drawAurora();
  listen.raf=requestAnimationFrame(listenLoop);
}
// aurora: ribbons in the playing disc's own colours, each driven by a slice of the live spectrum
let auroraT=0,auroraCols=['#c8292e','#d4a017','#7a5cff'],auroraFor=null;
function refreshAuroraColors(){
  const i=$('roomModal').classList.contains('open')&&roomIndex!==null?roomIndex:(nowPlaying?nowPlaying.index:null);
  auroraFor=i;
  if(i===null||isSlotEmpty(discs[i])){auroraCols=['#c8292e','#d4a017','#7a5cff'];return}
  paletteFor(i).then(p=>{if(auroraFor!==i||!p)return;const c=discColors(p);auroraCols=[c.glow,c.accent,hslToHex((p.h+50)%360,Math.max(.4,p.s),.5)]});
}
function drawAurora(){
  const inRoom=$('roomModal').classList.contains('open');
  const cv=$(inRoom?'roomAurora':'aurora');if(!cv)return;
  const w=Math.max(80,Math.round((cv.clientWidth||innerWidth)/2)),h=Math.max(60,Math.round((cv.clientHeight||innerHeight)/2));
  if(cv.width!==w||cv.height!==h){cv.width=w;cv.height=h}
  const x=cv.getContext('2d');x.clearRect(0,0,w,h);x.globalCompositeOperation='lighter';
  auroraT+=.006+listen.lv*.03;
  const N=listen.freq.length,bands=5;
  for(let b=0;b<bands;b++){
    const lo=Math.max(1,Math.floor(Math.pow(N,b/bands))),hi=Math.max(lo+1,Math.floor(Math.pow(N,(b+1)/bands)));
    let e=0;for(let k=lo;k<hi;k++)e+=listen.freq[k];e=e/(hi-lo)/255;
    const col=auroraCols[b%auroraCols.length],base=h*(.22+b*.13),amp=h*(.05+e*.38);
    x.beginPath();x.moveTo(0,h);
    for(let px=0;px<=w;px+=6){const y=base+Math.sin(px/w*Math.PI*(2+b)+auroraT*(1+b*.3))*amp+Math.sin(px/w*9+auroraT*2.3)*amp*.25;x.lineTo(px,y)}
    x.lineTo(w,h);x.closePath();
    const g=x.createLinearGradient(0,base-amp,0,h);g.addColorStop(0,hexA(col,0));g.addColorStop(.25,hexA(col,.3+e*.45));g.addColorStop(1,hexA(col,0));
    x.fillStyle=g;x.fill();
  }
  x.globalCompositeOperation='source-over';
}

// ══ 2. COVERS THAT DISSOLVE INTO EACH OTHER — and RANDOM as a slot machine ══
function readPixels(src,G){
  return new Promise(res=>{
    if(!src)return res(null);
    const img=new Image();let done=false;const fin=v=>{if(!done){done=true;res(v)}};
    if(!String(src).startsWith('data:'))img.crossOrigin='anonymous';
    img.onload=()=>{try{const c=document.createElement('canvas');c.width=c.height=G;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(img,0,0,G,G);fin(x.getImageData(0,0,G,G).data)}catch(e){fin(null)}};
    img.onerror=()=>fin(null);setTimeout(()=>fin(null),6000);img.src=src;
  });
}
const easeOut=t=>1-Math.pow(1-t,3),easeInOut=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
let dissolveCount=0;
async function dissolveImage(img,newSrc){
  const oldSrc=img.getAttribute('src')&&img.style.visibility!=='hidden'?img.src:null;
  if(!motionOK()||!oldSrc||oldSrc===newSrc){img.src=newSrc;img.style.visibility='';return 'instant'}
  const G=48;   // 48 x 48 = 2,304 particles
  const [a,b]=await Promise.all([readPixels(oldSrc,G),readPixels(newSrc,G)]);
  const r=img.getBoundingClientRect();
  if(!b||r.width<8){img.src=newSrc;img.style.visibility='';return 'plain'}   // cover art without CORS: plain swap
  const cv=document.createElement('canvas');cv.className='dissolve-canvas';
  const dpr=Math.min(2,devicePixelRatio||1);cv.width=Math.round(r.width*dpr);cv.height=Math.round(r.height*dpr);
  cv.style.cssText=`position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;z-index:9790;pointer-events:none`;
  document.body.appendChild(cv);img.style.visibility='hidden';
  const x=cv.getContext('2d'),cell=cv.width/G,cellY=cv.height/G,parts=[];
  for(let k=0;k<G*G;k++){
    const gx=k%G,gy=(k/G)|0,ang=Math.random()*Math.PI*2,dist=(.25+Math.random()*.75)*cv.width*.55;
    parts.push({sx:gx*cell,sy:gy*cellY,mx:cv.width/2+Math.cos(ang)*dist,my:cv.height/2+Math.sin(ang)*dist,c0:a?[a[k*4],a[k*4+1],a[k*4+2]]:[b[k*4]*.2,b[k*4+1]*.2,b[k*4+2]*.2],c1:[b[k*4],b[k*4+1],b[k*4+2]],d:Math.random()*.25});
  }
  dissolveCount++;
  const dur=1050,t0=performance.now();
  await new Promise(done=>{
    const frame=t=>{
      const p=Math.min(1,(t-t0)/dur);x.clearRect(0,0,cv.width,cv.height);
      for(const q of parts){
        const k=Math.min(1,Math.max(0,(p-q.d)/(1-q.d)));let X,Y,c;
        if(k<.5){const e=easeOut(k*2);X=q.sx+(q.mx-q.sx)*e;Y=q.sy+(q.my-q.sy)*e;const m=k*2;c=[q.c0[0]+(q.c1[0]-q.c0[0])*m,q.c0[1]+(q.c1[1]-q.c0[1])*m,q.c0[2]+(q.c1[2]-q.c0[2])*m]}
        else{const e=easeInOut((k-.5)*2);X=q.mx+(q.sx-q.mx)*e;Y=q.my+(q.sy-q.my)*e;c=q.c1}
        const s=1-.45*Math.sin(k*Math.PI);
        x.fillStyle=`rgb(${c[0]|0},${c[1]|0},${c[2]|0})`;x.fillRect(X,Y,cell*s+.7,cellY*s+.7);
      }
      if(p<1)requestAnimationFrame(frame);else done();
    };
    requestAnimationFrame(frame);
  });
  img.src=newSrc;
  await new Promise(rs=>{if(img.complete)rs();else{img.onload=rs;img.onerror=rs;setTimeout(rs,800)}});
  img.style.visibility='';cv.remove();
  return 'particles';
}
function randomPool(){const f=currentFilters();return discs.map((_,i)=>i).filter(i=>isPlayable(i)&&matches(i,f))}
let reelBusy=false;
async function uiPickRandom(){
  const pool=randomPool();
  if(!pool.length||!motionOK()){pickRandom();return}
  if(reelBusy)return;reelBusy=true;
  const pick=pool[Math.floor(Math.random()*pool.length)];
  const strip=[];for(let k=0;k<22;k++)strip.push(pool[Math.floor(Math.random()*pool.length)]);strip.push(pick);
  const reel=$('reel'),track=$('reelTrack');
  track.innerHTML=strip.map(i=>{const s=customArt.get(i)||slotArtSources(i)[0];return `<div class="reel-cell">${s?`<img src="${escH(s)}" alt="">`:''}<span>${slotNum(i)}</span></div>`}).join('');
  track.querySelectorAll('img').forEach(im=>{im.onerror=()=>im.remove()});
  track.style.transition='none';track.style.transform='translateY(0)';
  reel.classList.add('open');void track.offsetHeight;
  const cellH=track.firstElementChild.getBoundingClientRect().height||220;
  track.style.transition='transform 1.7s cubic-bezier(.12,.75,.15,1)';
  track.style.transform=`translateY(${-(strip.length-1)*cellH}px)`;
  reel.classList.add('spinning');
  await new Promise(r=>setTimeout(r,1750));
  reel.classList.remove('spinning');reel.classList.add('landed');
  await new Promise(r=>setTimeout(r,450));
  reel.classList.remove('open','landed');reelBusy=false;
  const slot=document.querySelector(`#grid .slot[data-index="${pick}"]`);
  if(slot&&!slot.classList.contains('filtered-out')&&currentView!=='ring')slot.scrollIntoView({block:'center'});
  openInfoModal(pick);
  return pick;
}

// ══ 3. INSIDE THE CHANGER — CSS 3D carousel: jewel cases standing in their slots, chosen one rises out ══
const ch={yaw:0,sel:0,items:[],anim:0,drag:null,moved:false,R:520};
function renderChanger(){
  const world=$('c3World');const n=discs.length;world.innerHTML='';ch.items=[];
  ch.R=Math.max(420,Math.round(n*16.5/(2*Math.PI)));   // ~16 px per slot around the spindle, like the real thing
  for(let i=0;i<n;i++){
    const el=document.createElement('div');el.className='c3-case';el.dataset.index=i;
    const empty=isSlotEmpty(discs[i])&&!isWish(i);const m=getMeta(i);const loaned=!empty&&m.flags.includes('loaned');
    if(empty)el.classList.add('empty');if(loaned)el.classList.add('loaned');if(isWish(i))el.classList.add('wish');
    const label=empty?'':((discs[i][0]||'')+' — '+(discs[i][1]||''));
    el.innerHTML=`<div class="c3-front"></div><div class="c3-back"></div><div class="c3-spine"><span>${escH(label)}</span><b>${slotNum(i)}</b></div>`;
    if(!empty&&!loaned){const srcs=slotArtSources(i);if(srcs.length){const img=document.createElement('img');img.alt='';img.loading='lazy';img.decoding='async';el.querySelector('.c3-front').appendChild(img);loadImgWithFallbacks(img,srcs,()=>img.remove())}}
    world.appendChild(el);ch.items.push(el);
  }
  // the shelf, as a pile of cases beside the changer
  const pile=document.createElement('div');pile.className='c3-pile';
  pile.innerHTML=shelf.slice(0,14).map((s,k)=>`<div class="c3-flat" style="--k:${k}" title="${escH(s.disc[0]+' — '+s.disc[1])}"><i style="${shelfArt.get(s.id)?`background-image:url('${String(shelfArt.get(s.id)).replace(/'/g,'%27')}')`:''}"></i></div>`).join('')+(shelf.length?`<span class="c3-pile-label">📦 SHELF · ${shelf.length}</span>`:'');
  world.appendChild(pile);
  if(ch.sel<0||ch.sel>=n)ch.sel=0;
  layoutChanger();
}
function layoutChanger(){
  const n=ch.items.length;if(!n)return;
  const step=360/n,f=currentFilters();
  ch.items.forEach((el,i)=>{
    const a=i*step;
    const rel=((a-ch.yaw)%360+540)%360-180;                     // angle from the front, -180..180
    const shade=.28+.72*Math.max(0,Math.cos(rel*Math.PI/180));
    el.style.setProperty('--shade',shade.toFixed(3));
    const lifted=i===ch.sel;
    el.style.transform=`rotateY(${a}deg) translateZ(${ch.R}px) `+(lifted?'translateY(-150px) translateZ(90px) scale(1.4)':'rotateY(90deg)');
    el.classList.toggle('sel',lifted);
    el.classList.toggle('dim',!matches(i,f));
  });
  $('c3World').style.transform=`translateZ(${-ch.R}px) rotateX(-12deg) rotateY(${-ch.yaw}deg)`;
  renderC3Readout();
}
function changerTurnTo(i,instant){
  const n=ch.items.length||discs.length;const step=360/n;
  ch.sel=i;let target=i*step;
  while(target-ch.yaw>180)target-=360;while(target-ch.yaw<-180)target+=360;
  cancelAnimationFrame(ch.anim);
  if(instant||!motionOK()){ch.yaw=target;layoutChanger();return}
  const from=ch.yaw,t0=performance.now(),dur=650;
  const tick=t=>{const k=Math.min(1,(t-t0)/dur);ch.yaw=from+(target-from)*easeInOut(k);layoutChanger();if(k<1)ch.anim=requestAnimationFrame(tick)};
  ch.anim=requestAnimationFrame(tick);
}
function changerStep(d){const n=ch.items.length;changerTurnTo((ch.sel+d+n)%n)}
function renderC3Readout(){
  const i=ch.sel;const el=$('c3Readout');if(i<0||!discs.length){el.innerHTML='';return}
  const d=discs[i];const empty=isSlotEmpty(d)&&!isWish(i);const m=getMeta(i);
  el.innerHTML=`<div class="rr-num">${slotNum(i)}</div><div class="rr-text">`+(empty?'<div class="rr-album">— EMPTY SLOT —</div>':
    `<div class="rr-artist">${escH(d[0]||'')}</div><div class="rr-album">${escH(d[1]||'')}</div><div class="rr-meta">${[m.flags.includes('loaned')?'OUT ON LOAN'+(m.loanedTo?' · '+escH(m.loanedTo):''):'',m.playHistory.length?m.playHistory.length+' PLAY(S)':'NEVER PLAYED'].filter(Boolean).join(' · ')}</div>`)+
    '</div>'+(empty?'':'<button class="btn gold-btn" type="button" data-c3-open="1">OPEN</button>');
}
(function wireChanger(){
  const stage=$('c3Stage');
  stage.addEventListener('pointerdown',e=>{if(e.button!==0)return;cancelAnimationFrame(ch.anim);ch.drag={x:e.clientX,yaw:ch.yaw};ch.moved=false;try{stage.setPointerCapture(e.pointerId)}catch(err){}});
  stage.addEventListener('pointermove',e=>{if(!ch.drag)return;const dx=e.clientX-ch.drag.x;if(Math.abs(dx)>5)ch.moved=true;ch.yaw=ch.drag.yaw-dx*.25;
    const n=ch.items.length;ch.sel=((Math.round(ch.yaw/(360/n))%n)+n)%n;layoutChanger()});
  const end=()=>{if(!ch.drag)return;ch.drag=null;if(ch.moved)changerTurnTo(ch.sel)};
  stage.addEventListener('pointerup',end);stage.addEventListener('pointercancel',end);
  stage.addEventListener('click',e=>{
    if(ch.moved){ch.moved=false;return}
    const it=e.target.closest('.c3-case');if(!it)return;const i=Number(it.dataset.index);
    if(i===ch.sel){if(!it.classList.contains('empty'))uiOpenDisc(i,it)}else changerTurnTo(i);
  });
  stage.addEventListener('wheel',e=>{if(e.ctrlKey)return;e.preventDefault();changerStep(e.deltaY>0||e.deltaX>0?1:-1)},{passive:false});
  $('c3Readout').addEventListener('click',e=>{if(e.target.closest('[data-c3-open]'))uiOpenDisc(ch.sel,ch.items[ch.sel])});
})();

// ══ 4. EMBLEMS — a unique sigil per album, generated from its real data ══
function emblemHash(s){let h=2166136261>>>0;s=String(s||'');for(let k=0;k<s.length;k++){h^=s.charCodeAt(k);h=Math.imul(h,16777619)>>>0}return h>>>0}
function rngFrom(seed){let s=(seed>>>0)||1;return()=>{s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;return s/4294967296}}
const parseLen=t=>{const m=/^(\d+):(\d{2})$/.exec(String(t||''));return m?Number(m[1])*60+Number(m[2]):0};
function emblemData(i){
  const d=discs[i];const e=mbCache[keyOf(d)];const ov=getOverride(i);
  const tracks=(ov&&ov.tracks&&ov.tracks.length)?ov.tracks.map(t=>({title:t,len:0})):((e&&Array.isArray(e.tracks))?e.tracks.map(t=>({title:t.title,len:parseLen(t.length)})):[]);
  return {key:keyOf(d),tracks,year:String(effectiveYear(i)||''),genres:effectiveGenres(i)};
}
// Shape = the music (spokes = tracks, spoke length = track length, rings = genres, dashes = year); colours = the cover.
function emblemSvg(i,size){
  const d=discs[i];if(isSlotEmpty(d))return '';
  const {key,tracks,year,genres}=emblemData(i);
  const R=rngFrom(emblemHash(key));const p=knownPalette(i);
  const hue=p&&!p.grey?p.h:emblemHash(d[0])%360,sat=p&&!p.grey?Math.max(.45,Math.min(.85,p.s)):.55;
  const A=hslToHex(hue,sat,.62),B=hslToHex((hue+35+R()*50)%360,sat*.85,.52),C=hslToHex((hue+180)%360,.3,.58);
  const provisional=!tracks.length;
  const lens=provisional?Array.from({length:5+Math.floor(R()*7)},()=>120+R()*300):tracks.slice(0,32).map(t=>t.len||240);
  const maxL=Math.max(1,...lens),r0=24,r1=84,rot=R()*360,n=lens.length;
  const tips=[];let spokes='';
  lens.forEach((L,k)=>{
    const ang=(rot+k*360/n)*Math.PI/180,len=r0+(r1-r0)*(.25+.75*L/maxL);
    const x1=100+Math.cos(ang)*r0,y1=100+Math.sin(ang)*r0,x2=100+Math.cos(ang)*len,y2=100+Math.sin(ang)*len;tips.push(x2.toFixed(1)+','+y2.toFixed(1));
    spokes+=`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${k%2?B:A}" stroke-width="${(1.1+1.9*L/maxL).toFixed(2)}" stroke-linecap="round"${provisional?' stroke-dasharray="3 3"':''}/><circle cx="${x2.toFixed(1)}" cy="${y2.toFixed(1)}" r="${(1.4+2.6*L/maxL).toFixed(2)}" fill="${A}"/>`;
  });
  const yd=year.replace(/\D/g,'').padStart(4,'0').split('').map(Number);
  let rings='';genres.slice(0,3).forEach((g,k)=>{const gh=emblemHash(g);rings+=`<circle cx="100" cy="100" r="${r0-7+k*4}" fill="none" stroke="${k?B:A}" stroke-width="${1+gh%3}" stroke-dasharray="${2+gh%7} ${1+(gh>>3)%5}" opacity=".85"/>`});
  const s=size||200;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="${s}" height="${s}" role="img" aria-label="Emblem of ${escH(d[0])} — ${escH(d[1])}${provisional?' (provisional: no tracklist yet)':''}" data-spokes="${n}" data-provisional="${provisional}">`+
    `<rect width="200" height="200" fill="#0b0b0e"/>`+
    `<circle cx="100" cy="100" r="93" fill="none" stroke="${C}" stroke-width="1.3" stroke-dasharray="${yd.map(v=>((v+1)*1.7).toFixed(1)).join(' ')}" opacity=".75"/>`+
    `<polygon points="${tips.join(' ')}" fill="${A}" fill-opacity=".09" stroke="${A}" stroke-opacity=".35" stroke-width=".8"/>`+
    spokes+rings+`<circle cx="100" cy="100" r="${r0-12}" fill="${A}" fill-opacity=".92"/><circle cx="100" cy="100" r="4" fill="#0b0b0e"/></svg>`;
}
function renderEmblems(){
  const el=$('emblemWall');const f=currentFilters();
  el.innerHTML=discs.map((d,i)=>{
    if(isSlotEmpty(d))return '';
    return `<button class="emb-tile${matches(i,f)?'':' dim'}${isWish(i)?' wish':''}" type="button" data-index="${i}" title="${escH(d[0]+' — '+d[1])}">${emblemSvg(i,160)}<span class="emb-num">${slotNum(i)}</span><span class="emb-title">${escH(d[1]||'')}</span></button>`;
  }).join('');
}
$('emblemWall').addEventListener('click',e=>{const t=e.target.closest('.emb-tile');if(t)uiOpenDisc(Number(t.dataset.index),t)});
function renderModalEmblem(i){const el=$('modalEmblem');if(el)el.innerHTML=isSlotEmpty(discs[i])?'':emblemSvg(i,58)}
function downloadEmblem(){
  if(currentModalIndex===null)return;const i=currentModalIndex;const svg=emblemSvg(i,1200);if(!svg)return;
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));
  a.download=`emblem-${slotNum(i)}-${String(discs[i][1]||'disc').replace(/[^\w\- ]+/g,'').trim().replace(/\s+/g,'-').slice(0,40)}.svg`;
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000);
}

// ══ 5. THE JEWEL CASE IN YOUR HANDS — CSS 3D, drag / tilt to turn, it opens ══
const jc={rx:-12,ry:-28,drag:null,open:false,i:null};
async function openCase(i){
  if(i===undefined||i===null)i=currentModalIndex;if(i===null||isSlotEmpty(discs[i]))return;
  jc.i=i;jc.open=false;jc.rx=-12;jc.ry=-28;
  const d=discs[i];const e=mbCache[keyOf(d)];const ov=getOverride(i);const m=getMeta(i);
  const tracks=(ov&&ov.tracks&&ov.tracks.length)?ov.tracks.map(t=>({title:t})):((e&&Array.isArray(e.tracks))?e.tracks:[]);
  $('jcSpine').textContent=(d[0]||'')+'  ·  '+(d[1]||'');
  $('jcInsert').innerHTML=`<div class="jci-head"><b>${escH(d[0]||'')}</b><span>${escH(d[1]||'')}</span></div>`+
    `<ol class="jci-tracks">${tracks.slice(0,22).map(t=>`<li>${escH(t.title)}${t.length?` <em>${escH(t.length)}</em>`:''}</li>`).join('')||'<li class="none">tracklist not fetched yet</li>'}</ol>`+
    `<div class="jci-foot"><span>CRATECHANGER · SLOT ${slotNum(i)}</span>${m.barcode?`<span class="jci-bar">${escH(m.barcode)}</span>`:''}</div>`;
  $('jcInside').innerHTML=`<div class="jci-inside"><div class="jci-emblem">${emblemSvg(i,120)}</div><div>${escH(d[1]||'')}</div><small>${escH([effectiveYear(i),...effectiveGenres(i).slice(0,2)].filter(Boolean).join(' · '))}</small></div>`;
  const cover=$('jcCover');cover.removeAttribute('src');cover.style.visibility='hidden';
  const src=customArt.get(i)||await firstWorkingSrc(slotArtSources(i));
  if(src&&jc.i===i){cover.src=src;cover.style.visibility=''}
  setCdLabel($('jcCd'),src||null);
  $('jcCd').classList.toggle('spinning',!!(nowPlaying&&nowPlaying.index===i));
  $('caseModal').classList.add('open');
  layoutCase();
}
function closeCase(){$('caseModal').classList.remove('open');jc.i=null}
function toggleCaseOpen(){jc.open=!jc.open;layoutCase()}
function layoutCase(){
  const c=$('jcase');
  c.style.transform=`rotateX(${jc.rx.toFixed(1)}deg) rotateY(${jc.ry.toFixed(1)}deg)`;
  c.classList.toggle('opened',jc.open);
  $('jcOpenBtn').textContent=jc.open?'CLOSE THE CASE':'OPEN THE CASE';
  const g=((jc.ry%360)+360)%360;c.style.setProperty('--gloss',(g/360*200-50).toFixed(1)+'%');
}
(function wireCase(){
  const st=$('caseStage');
  st.addEventListener('pointerdown',e=>{jc.drag={x:e.clientX,y:e.clientY,rx:jc.rx,ry:jc.ry,moved:false};try{st.setPointerCapture(e.pointerId)}catch(err){}});
  st.addEventListener('pointermove',e=>{if(!jc.drag)return;const dx=e.clientX-jc.drag.x,dy=e.clientY-jc.drag.y;if(Math.abs(dx)+Math.abs(dy)>4)jc.drag.moved=true;jc.ry=jc.drag.ry+dx*.5;jc.rx=Math.max(-70,Math.min(70,jc.drag.rx-dy*.4));layoutCase()});
  const end=()=>{jc.drag=null};st.addEventListener('pointerup',end);st.addEventListener('pointercancel',end);
  st.addEventListener('dblclick',toggleCaseOpen);
  window.addEventListener('deviceorientation',e=>{if(!$('caseModal').classList.contains('open')||jc.drag||e.gamma==null)return;jc.ry=-28+e.gamma*1.2;jc.rx=Math.max(-60,Math.min(60,-12+((e.beta||45)-45)*.8));layoutCase()},{passive:true});
})();

// ══ 6. COLLECTION CITY — isometric skyline: districts = genres, towers = discs ══
const city={rot:-.62,zoom:1,heightBy:'plays',model:null,hover:-1,drag:null,hits:[]};
function cityHeight(i){
  const m=getMeta(i);
  if(city.heightBy==='year'){const y=Number(effectiveYear(i))||0;return y?Math.max(.4,(y-1955)/7):.4}
  if(city.heightBy==='tracks'){const e=mbCache[keyOf(discs[i])];const n=(getOverride(i)&&getOverride(i).tracks&&getOverride(i).tracks.length)||((e&&e.tracks)||[]).length;return Math.max(.4,n/2.2)}
  return .5+Math.log2(1+m.playHistory.length)*2.2;
}
function cityColor(i){const p=knownPalette(i);if(p&&!p.grey)return hslToHex(p.h,Math.max(.4,Math.min(.8,p.s)),.5);const h=emblemHash(discs[i][0])%360;return hslToHex(h,.35,.42)}
function buildCityModel(){
  const owned=discs.map((d,i)=>i).filter(i=>!isSlotEmpty(discs[i])&&!isWish(i));
  // districts = genres; while most discs have no genre yet (artists not looked up), districts = decades instead
  const genreOf=i=>String(effectiveGenres(i)[0]||'').toLowerCase();
  const known=owned.filter(i=>genreOf(i)).length;
  city.groupBy=known>=owned.length*.5?'genre':'decade';
  const groupOf=i=>{if(city.groupBy==='genre')return genreOf(i)||'unsorted';const y=Number(effectiveYear(i))||0;return y?Math.floor(y/10)*10+'s':'year unknown'};
  const byG=new Map();
  owned.forEach(i=>{const g=groupOf(i);if(!byG.has(g))byG.set(g,[]);byG.get(g).push(i)});
  const districts=[...byG.entries()].sort((a,b)=>city.groupBy==='decade'?a[0].localeCompare(b[0]):(b[1].length-a[1].length||a[0].localeCompare(b[0])));
  const maxW=Math.max(12,Math.ceil(Math.sqrt(owned.length)*1.6));
  const lots=[],labels=[];let ox=0,oy=0,rowH=0;
  districts.forEach(([g,list])=>{
    list.sort((a,b)=>(Number(effectiveYear(a))||9999)-(Number(effectiveYear(b))||9999)||a-b);   // old town -> new
    const side=Math.max(1,Math.ceil(Math.sqrt(list.length)));const rows=Math.ceil(list.length/side);
    if(ox>0&&ox+side>maxW){ox=0;oy+=rowH+1.6;rowH=0}
    list.forEach((i,k)=>{const m=getMeta(i);lots.push({i,g,x:ox+(k%side),y:oy+Math.floor(k/side),h:cityHeight(i),color:cityColor(i),loaned:m.flags.includes('loaned'),fog:wearClasses(i).includes('wear-dust')})});
    labels.push({g,x:ox+side/2-.5,y:oy+rows+.25,n:list.length});
    ox+=side+1.6;rowH=Math.max(rowH,rows);
  });
  const xs=lots.map(l=>l.x),ys=lots.map(l=>l.y);
  const cx=(Math.min(...xs,0)+Math.max(...xs,0))/2,cy=(Math.min(...ys,0)+Math.max(...ys,0))/2;
  lots.forEach(l=>{l.x-=cx;l.y-=cy});labels.forEach(l=>{l.x-=cx;l.y-=cy});
  city.model={lots,labels,span:Math.max(...xs,1)-Math.min(...xs,0)+Math.max(...ys,1)-Math.min(...ys,0)+2};
  return city.model;
}
function cityProject(x,y,z,W,H){
  const s=Math.min(W,H*1.6)/(city.model.span*.95)*city.zoom,c=Math.cos(city.rot),n=Math.sin(city.rot);
  const rx=x*c-y*n,ry=x*n+y*c;
  return [W/2+rx*s,H*.56+ry*s*.5-z*s*.62,ry];
}
function shade(hex,f){const [r,g,b]=hexToRgb(hex);return `rgb(${Math.round(r*f)},${Math.round(g*f)},${Math.round(b*f)})`}
function renderCity(rebuild){
  if(rebuild!==false||!city.model)buildCityModel();
  const cv=$('cityCanvas');const dpr=Math.min(2,devicePixelRatio||1);
  const W=cv.clientWidth||1000,H=cv.clientHeight||600;
  if(cv.width!==Math.round(W*dpr)||cv.height!==Math.round(H*dpr)){cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr)}
  const x=cv.getContext('2d');x.setTransform(dpr,0,0,dpr,0,0);x.clearRect(0,0,W,H);
  const light=document.body.classList.contains('light-theme');
  const f=currentFilters();const P=(a,b,z)=>cityProject(a,b,z,W,H);
  const lots=city.model.lots.map(l=>{const c=P(l.x+.5,l.y+.5,0);return Object.assign(l,{depth:c[2]})}).sort((a,b)=>a.depth-b.depth);
  city.hits=[];
  // ground + district names
  city.model.labels.forEach(lb=>{const p=P(lb.x+.5,lb.y+.4,0);x.font='600 10px "Share Tech Mono",monospace';x.fillStyle=light?'rgba(0,0,0,.55)':'rgba(255,255,255,.45)';x.textAlign='center';x.fillText(lb.g.toUpperCase()+' · '+lb.n,p[0],p[1]+10)});
  lots.forEach(l=>{
    const pad=.12,x0=l.x+pad,x1=l.x+1-pad,y0=l.y+pad,y1=l.y+1-pad;
    const base=[P(x0,y0,0),P(x1,y0,0),P(x1,y1,0),P(x0,y1,0)];
    x.beginPath();base.forEach((p,k)=>k?x.lineTo(p[0],p[1]):x.moveTo(p[0],p[1]));x.closePath();
    x.fillStyle=light?'rgba(0,0,0,.06)':'rgba(255,255,255,.04)';x.fill();
    if(l.loaned){x.setLineDash([3,3]);x.strokeStyle='#c8292e';x.lineWidth=1.2;x.stroke();x.setLineDash([]);city.hits.push({i:l.i,poly:base});return}   // empty lot: out on loan
    const h=l.h,top=[P(x0,y0,h),P(x1,y0,h),P(x1,y1,h),P(x0,y1,h)];
    const dim=matches(l.i,f)?1:.35;
    // the 4 walls, farthest first, then the roof
    const walls=[[0,1],[1,2],[2,3],[3,0]].map(([a,b])=>({a,b,d:(base[a][2]+base[b][2])/2})).sort((p,q)=>p.d-q.d);
    walls.forEach(w=>{
      const poly=[base[w.a],base[w.b],top[w.b],top[w.a]];
      x.beginPath();poly.forEach((p,k)=>k?x.lineTo(p[0],p[1]):x.moveTo(p[0],p[1]));x.closePath();
      x.fillStyle=shade(l.color,(.42+.25*((w.a+1)%2))*dim);x.fill();
      city.hits.push({i:l.i,poly});
    });
    x.beginPath();top.forEach((p,k)=>k?x.lineTo(p[0],p[1]):x.moveTo(p[0],p[1]));x.closePath();
    x.fillStyle=shade(l.color,(l.i===city.hover?1.25:.95)*dim);x.fill();
    if(l.i===city.hover){x.strokeStyle='#d4a017';x.lineWidth=2;x.stroke()}
    city.hits.push({i:l.i,poly:top});
    if(l.fog){const c=P(l.x+.5,l.y+.5,h*.5);const g=x.createRadialGradient(c[0],c[1],2,c[0],c[1],28);g.addColorStop(0,'rgba(190,190,200,.45)');g.addColorStop(1,'rgba(190,190,200,0)');x.fillStyle=g;x.fillRect(c[0]-30,c[1]-30,60,60)}
  });
  const key=$('cityKey');if(key)key.textContent=`${city.model.lots.length} DISCS · ${city.model.labels.length} DISTRICTS (${city.groupBy==='genre'?'GENRES':'DECADES — GENRES ONCE MOST ARTISTS ARE LOOKED UP'}) · HEIGHT = ${({plays:'PLAYS',year:'RELEASE YEAR',tracks:'TRACK COUNT'})[city.heightBy]} · FOG = LONG UNPLAYED · DASHED LOT = OUT ON LOAN`;
}
function pointInPoly(px,py,poly){let inside=false;for(let a=0,b=poly.length-1;a<poly.length;b=a++){const [xa,ya]=poly[a],[xb,yb]=poly[b];if(((ya>py)!==(yb>py))&&(px<(xb-xa)*(py-ya)/(yb-ya)+xa))inside=!inside}return inside}
function cityHitTest(px,py){for(let k=city.hits.length-1;k>=0;k--)if(pointInPoly(px,py,city.hits[k].poly))return city.hits[k].i;return -1}
function setCityHeight(v){city.heightBy=v;renderCity()}
(function wireCity(){
  const cv=$('cityCanvas'),tip=$('cityTip');
  const local=e=>{const r=cv.getBoundingClientRect();return [e.clientX-r.left,e.clientY-r.top]};
  cv.addEventListener('pointerdown',e=>{city.drag={x:e.clientX,rot:city.rot,moved:false};try{cv.setPointerCapture(e.pointerId)}catch(err){}});
  cv.addEventListener('pointermove',e=>{
    if(city.drag){const dx=e.clientX-city.drag.x;if(Math.abs(dx)>4)city.drag.moved=true;city.rot=city.drag.rot+dx*.006;renderCity(false);return}
    const [px,py]=local(e);const i=cityHitTest(px,py);
    if(i!==city.hover){city.hover=i;renderCity(false)}
    if(i>=0){const d=discs[i],m=getMeta(i);tip.style.display='';tip.style.left=(px+14)+'px';tip.style.top=(py+10)+'px';
      tip.innerHTML=`<b>${slotNum(i)}</b> ${escH(d[0])} — ${escH(d[1])}<br><span>${m.flags.includes('loaned')?'OUT ON LOAN · ':''}${m.playHistory.length} PLAY(S)${effectiveYear(i)?' · '+escH(effectiveYear(i)):''}</span>`}
    else tip.style.display='none';
  });
  cv.addEventListener('pointerleave',()=>{tip.style.display='none';if(city.hover!==-1){city.hover=-1;renderCity(false)}});
  const end=e=>{const d=city.drag;city.drag=null;if(d&&!d.moved){const [px,py]=local(e);const i=cityHitTest(px,py);if(i>=0)openInfoModal(i)}};
  cv.addEventListener('pointerup',end);
  cv.addEventListener('wheel',e=>{e.preventDefault();city.zoom=Math.max(.5,Math.min(4,city.zoom*(e.deltaY<0?1.12:.89)));renderCity(false)},{passive:false});
  window.addEventListener('resize',()=>{if(currentView==='city')renderCity(false)});
})();

// ══ keys for the 3D changer (captured before the grid's own arrow keys) ══
document.addEventListener('keydown',e=>{
  if(/^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement&&document.activeElement.tagName)||''))return;
  if($('caseModal').classList.contains('open')){
    if(e.key===' '||e.key==='Enter'){e.preventDefault();e.stopImmediatePropagation();toggleCaseOpen()}
    else if(/^Arrow/.test(e.key)){e.preventDefault();e.stopImmediatePropagation();if(e.key==='ArrowLeft')jc.ry-=12;if(e.key==='ArrowRight')jc.ry+=12;if(e.key==='ArrowUp')jc.rx=Math.min(70,jc.rx+10);if(e.key==='ArrowDown')jc.rx=Math.max(-70,jc.rx-10);layoutCase()}
    return;
  }
  if(openLayer())return;
  if(currentView==='changer'){
    if(e.key==='ArrowRight'||e.key==='ArrowDown'){e.preventDefault();e.stopImmediatePropagation();changerStep(1)}
    else if(e.key==='ArrowLeft'||e.key==='ArrowUp'){e.preventDefault();e.stopImmediatePropagation();changerStep(-1)}
    else if(e.key==='Enter'&&!isSlotEmpty(discs[ch.sel])){e.preventDefault();e.stopImmediatePropagation();uiOpenDisc(ch.sel,ch.items[ch.sel])}
  }else if((currentView==='emblems'||currentView==='city')&&/^Arrow/.test(e.key)){e.stopImmediatePropagation()}
},true);

