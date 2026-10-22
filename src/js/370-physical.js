
// ── PHYSICAL VISUALS: the data side of each disc, drawn from the physics of a CD ──
// A CD's spiral starts at 25 mm; the area swept is speed × track pitch × time, so r(t) = sqrt(r0² + v·p·t / π).
// Red Book: 1.6 µm pitch at 1.2 m/s up to 74 min; longer masters squeeze to ~1.5 µm at 1.197 m/s to stay inside 58 mm.
// The rainbow is diffraction off that 1.6 µm grating: first and second order, only where there are pits.
var CDP={
  R0:25,
  vp(total){return total>4440?1.5*1.197:1.6*1.2},          // mm² per second
  rAt(t,total){return Math.sqrt(this.R0*this.R0+this.vp(total)*t/Math.PI)},
  tAt(r,total){return Math.PI*(r*r-this.R0*this.R0)/this.vp(total)},
  rpm(r){return 1200/(2*Math.PI*r)*60}
};
function lenSec(s){
  if(s==null||s==='')return 0;
  let n=0;for(const p of String(s).split(':')){const v=parseInt(p,10);if(isNaN(v))return 0;n=n*60+v}
  return n;
}
// What is physically on the disc in slot i: its tracks and where they sit, or why we can't tell.
function discTiming(i){
  const d=discs[i];
  if(isSlotEmpty(d))return {kind:'empty'};
  if(isWish(i))return {kind:'wish'};
  const e=mbCache[keyOf(d)];
  if(!e)return {kind:'unknown'};
  let tracks=(e.tracks||[]).slice();
  // a multi-disc release lists every disc ("2.3" = disc 2, track 3): keep the disc this slot holds
  const media=new Set(tracks.map(t=>{const m=/^(\d+)\./.exec(String(t.num));return m?m[1]:'1'}));
  if(media.size>1){
    const dn=/\(\s*(?:disc|cd)\s*(\d+)\s*\)/i.exec(d[1]||'');
    if(dn&&media.has(dn[1]))tracks=tracks.filter(t=>String(t.num).startsWith(dn[1]+'.'));
  }
  const lens=tracks.map(t=>lenSec(t.length));
  const titles=tracks.map(t=>t.title||'');
  const total=lens.reduce((a,b)=>a+b,0);
  if(!tracks.length||!total)return {kind:'nolen',lens,titles,total:0};
  const missing=lens.filter(x=>!x).length;
  const kind=total>4800?'over':missing?'partial':'ok';
  const starts=[];let acc=0;lens.forEach(l=>{starts.push(acc);acc+=l});
  const rEnd=kind==='over'?null:CDP.rAt(total,total);
  const rRec=kind==='over'?58:Math.min(58,Math.sqrt(rEnd*rEnd+CDP.vp(total)*90/Math.PI));
  return {kind,lens,titles,total,starts,rEnd,rRec,missing,multi:media.size>1};
}
function trackAtTime(tm,t){let k=0;for(let j=0;j<tm.starts.length;j++)if(t>=tm.starts[j])k=j;return k}
function fmtSec(s){s=Math.max(0,Math.round(s));const h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=s%60;return (h?h+':'+String(m).padStart(2,'0'):m)+':'+String(x).padStart(2,'0')}

// wavelength (nm) → rgb 0..1
function wlRgb(l){
  let r=0,g=0,b=0;
  if(l<440){r=-(l-440)/60;b=1}else if(l<490){g=(l-440)/50;b=1}else if(l<510){g=1;b=-(l-510)/20}
  else if(l<580){r=(l-510)/70;g=1}else if(l<645){r=1;g=-(l-645)/65}else{r=1}
  const f=l<420?.3+.7*(l-380)/40:l>700?.3+.7*(780-l)/80:1;
  return [r*f,g*f,b*f];
}
// conic gradient of the diffracted colour round a disc lit from direction psi; s = sin θi + sin θo
function diffraction(c,x,y,psi,s,N){
  const g=c.createConicGradient(0,x,y),TAU=Math.PI*2;
  for(let n=0;n<=N;n++){
    const gg=Math.abs(s*Math.cos(n/N*TAU-psi));let R=0,G=0,B=0;
    for(let m=1;m<=2;m++){
      const lam=1600*gg/m;
      if(lam>380&&lam<780){const w=wlRgb(lam),lo=380*m/1600,hi=780*m/1600,env=Math.pow(Math.sin(Math.PI*(gg-lo)/(hi-lo)),1.6),a=(m===1?.95:.22)*env;R+=w[0]*a;G+=w[1]*a;B+=w[2]*a}
    }
    g.addColorStop(n/N,`rgba(${Math.min(255,R*235)|0},${Math.min(255,G*235)|0},${Math.min(255,B*235)|0},.8)`);
  }
  return g;
}
// Draw one disc, data side up. k = px per mm (outer edge = 60 mm).
function drawDataSide(c,x,y,k,tm,light,o){
  o=o||{};const TAU=Math.PI*2;
  const ring=(r1,r2)=>{c.beginPath();c.arc(x,y,r2*k,0,TAU);c.arc(x,y,r1*k,0,TAU,true)};
  if(tm.kind==='empty'||tm.kind==='wish'){
    c.setLineDash([3,3]);c.strokeStyle='rgba(200,200,210,.5)';c.lineWidth=1;c.beginPath();c.arc(x,y,60*k,0,TAU);c.stroke();c.setLineDash([]);
    if(tm.kind==='wish'&&k*60>14){c.fillStyle='rgba(200,200,210,.6)';c.font=Math.round(k*22)+'px sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText('♥',x,y)}
    return;
  }
  ring(22,58);
  if(o.detail){const base=c.createRadialGradient(x-k*10,y-k*13,k*3,x,y,58*k);base.addColorStop(0,'#5a5d64');base.addColorStop(.55,'#34363c');base.addColorStop(1,'#1d1e22');c.fillStyle=base}
  else c.fillStyle='#2b2d33';
  c.fill('evenodd');
  if(tm.rRec){
    const psi=Math.atan2(light.y-y,light.x-x),s=light.s!=null?light.s:.3+.32*Math.min(1,Math.hypot(light.x-x,light.y-y)/700);
    const bands=o.detail?24:2,N=o.detail?120:60;
    c.save();c.globalCompositeOperation='lighter';
    for(let j=0;j<bands;j++){
      const r1=23+(tm.rRec-23)*j/bands,r2=23+(tm.rRec-23)*(j+1)/bands,rm=(r1+r2)/2;
      ring(r1,r2);c.fillStyle=diffraction(c,x,y,psi+.22*(rm/58)-.1,s*(.82+.36*rm/58),N);c.fill('evenodd');
    }
    c.restore();
  }
  if(o.detail&&tm.rRec&&tm.rRec<58){   // bare mirror past the lead-out: a specular streak, no colour
    const ux=Math.cos(Math.atan2(light.y-y,light.x-x)+Math.PI/2),uy=Math.sin(Math.atan2(light.y-y,light.x-x)+Math.PI/2),R=58*k;
    const sp=c.createLinearGradient(x-ux*R,y-uy*R,x+ux*R,y+uy*R);
    sp.addColorStop(0,'rgba(255,255,255,.02)');sp.addColorStop(.47,'rgba(255,255,255,.1)');sp.addColorStop(.5,'rgba(255,255,255,.22)');sp.addColorStop(.53,'rgba(255,255,255,.1)');sp.addColorStop(1,'rgba(255,255,255,.02)');
    ring(tm.rRec,58);c.fillStyle=sp;c.fill('evenodd');
  }
  ring(7.5,22);c.fillStyle='rgba(200,212,225,.10)';c.fill('evenodd');
  if(o.detail){ring(16.5,17.5);c.fillStyle='rgba(200,212,225,.13)';c.fill('evenodd')}
  c.strokeStyle='rgba(220,230,240,.24)';c.lineWidth=o.detail?1:.8;c.beginPath();c.arc(x,y,60*k,0,TAU);c.stroke();
  if(o.detail&&tm.starts){
    tm.starts.forEach((st,j)=>{if(!j)return;c.beginPath();c.arc(x,y,CDP.rAt(st,tm.total)*k,0,TAU);c.strokeStyle='rgba(0,0,0,.55)';c.lineWidth=1.2;c.stroke()});
    if(o.track!=null){
      const a1=CDP.rAt(tm.starts[o.track],tm.total),a2=CDP.rAt(o.track+1<tm.starts.length?tm.starts[o.track+1]:tm.total,tm.total);
      c.strokeStyle='rgba(255,90,95,.8)';c.lineWidth=1.5;[a1,a2].forEach(r=>{c.beginPath();c.arc(x,y,r*k,0,TAU);c.stroke()});
    }
    if(o.hoverR){c.setLineDash([4,5]);c.strokeStyle='rgba(255,255,255,.6)';c.lineWidth=1;c.beginPath();c.arc(x,y,o.hoverR*k,0,TAU);c.stroke();c.setLineDash([])}
  }
  if(tm.kind==='over'){c.strokeStyle='#ff4a50';c.lineWidth=o.detail?3:2;c.beginPath();c.arc(x,y,59.5*k,0,TAU);c.stroke()}
  if(tm.kind==='partial'){c.setLineDash([2,2]);c.strokeStyle='#d4a017';c.lineWidth=1.5;c.beginPath();c.arc(x,y,tm.rEnd*k+1,0,TAU);c.stroke();c.setLineDash([])}
  c.fillStyle='#050507';c.beginPath();c.arc(x,y,7.5*k,0,TAU);c.fill();
  if(tm.kind==='nolen'||tm.kind==='unknown'){c.fillStyle='rgba(230,228,224,.85)';c.font=Math.max(10,Math.round(k*20))+'px "Share Tech Mono",monospace';c.textAlign='center';c.textBaseline='middle';c.fillText('?',x,y+.5)}
}
var PH_REDUCE=(()=>{try{return matchMedia('(prefers-reduced-motion: reduce)').matches}catch(e){return false}})();
function timingNote(tm){
  switch(tm.kind){
    case 'ok':return `${fmtSec(tm.total)} across ${tm.lens.length} tracks. The music ends ${tm.rEnd.toFixed(1)} mm from the centre, leaving ${(58-tm.rEnd).toFixed(1)} mm of bare mirror.`+(tm.total>4440?' It runs over 74 minutes, so it was mastered with a tighter 1.5 µm track pitch to fit.':'');
    case 'over':return `The looked-up tracklist adds up to ${fmtSec(tm.total)}, more than one CD can hold (80:00). It probably matched a box set or another edition: ⇄ EDITION picks the right one.`;
    case 'partial':return `${tm.missing} of ${tm.lens.length} tracks have no length, so the recorded area shown is too small.`;
    case 'nolen':return 'The matched release has no track lengths. Another edition (⇄ EDITION) may have them.';
    case 'unknown':return 'Not looked up yet. ⬇ FETCH ART (in TOOLS) looks it up along with the cover.';
    case 'wish':return 'Wishlist: not in the changer.';
    default:return 'Nothing in this slot.';
  }
}

// ── 1. DATA SIDE in the disc drawer: flip the cover over ──
var ds={on:false,ptr:null,raf:0,clock:0,last:0,cacheKey:null,tm:null};
function toggleDataSide(force){
  ds.on=force!==undefined?!!force:!ds.on;
  $('infoModal').classList.toggle('data-side-on',ds.on);
  const b=$('dataSideBtn');if(b){b.setAttribute('aria-pressed',String(ds.on));b.classList.toggle('active',ds.on)}
  safeSet('cc_data_side',ds.on?'1':'0');
  if(ds.on&&!ds.raf)ds.raf=requestAnimationFrame(dsLoop);
}
function dsTiming(){
  const i=currentModalIndex;if(i===null||i===undefined)return null;
  const d=discs[i],e=d&&mbCache[keyOf(d)];
  const key=i+'|'+keyOf(d)+'|'+(e&&e.tracks?e.tracks.length+':'+(e.tracks[0]&&e.tracks[0].length):'');
  if(key!==ds.cacheKey){ds.cacheKey=key;ds.tm=discTiming(i)}
  return ds.tm;
}
function dsLoop(ts){
  ds.raf=0;
  if(!ds.on||!$('infoModal').classList.contains('open'))return;
  const dt=ds.last?Math.min(.1,(ts-ds.last)/1000):0;ds.last=ts;ds.clock+=dt;
  drawDrawerDisc();
  ds.raf=requestAnimationFrame(dsLoop);
}
function drawDrawerDisc(){
  const cv=$('dataSideCanvas'),wrap=$('modalArtWrap');if(!cv||!wrap)return;
  const side=Math.round(Math.min(wrap.offsetWidth,wrap.offsetHeight||wrap.offsetWidth));if(!side)return;
  if(cv.style.width!==side+'px'){cv.style.width=side+'px';cv.style.height=side+'px'}
  const dpr=Math.min(2,devicePixelRatio||1);
  if(cv.width!==Math.round(side*dpr)){cv.width=Math.round(side*dpr);cv.height=Math.round(side*dpr)}
  const c=cv.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,side,side);
  c.fillStyle='#050507';c.fillRect(0,0,side,side);
  const tm=dsTiming();if(!tm)return;
  const cx=side/2,cy=side/2,k=(side/2-6)/60;
  let light;
  if(ds.ptr){const dx=ds.ptr.x-cx,dy=ds.ptr.y-cy;light={x:ds.ptr.x,y:ds.ptr.y,s:.28+.4*Math.min(1,Math.hypot(dx,dy)/(side/2))}}
  else{const a=PH_REDUCE?-.9:ds.clock*.22-.9;light={x:cx+Math.cos(a)*side,y:cy+Math.sin(a)*side,s:.52}}
  let hoverR=null,track=null,read='';
  if(ds.ptr){
    const mm=Math.hypot(ds.ptr.x-cx,ds.ptr.y-cy)/k;
    if(tm.starts&&mm>=CDP.R0&&tm.rEnd&&mm<=tm.rEnd){hoverR=mm;const t=CDP.tAt(mm,tm.total);track=trackAtTime(tm,t);read=`${mm.toFixed(1)} MM → TRACK ${track+1} · ${fmtSec(t-tm.starts[track])}`}
    else if(mm<22)read='CLEAR HUB — NO DATA';
    else if(mm<CDP.R0)read='LEAD-IN — TABLE OF CONTENTS';
    else if(tm.rRec&&mm<=tm.rRec)read=tm.kind==='over'?'NO RELIABLE TIMING FOR THIS DISC':'LEAD-OUT — SILENCE';
    else if(mm<=58)read='UNRECORDED MIRROR';
    else read='CLEAR RIM';
  }
  drawDataSide(c,cx,cy,k,tm,light,{detail:true,hoverR,track});
  const r=$('dataSideRead');
  if(r){
    const top=Math.max(0,side-26)+'px';if(r.style.top!==top)r.style.top=top;
    const foot=tm.kind==='ok'||tm.kind==='partial'?`${fmtSec(tm.total)} · MUSIC ENDS AT ${tm.rEnd.toFixed(1)} MM · ${Math.round(CDP.rpm(CDP.R0))}→${Math.round(CDP.rpm(tm.rEnd))} RPM`:tm.kind.toUpperCase()==='OVER'?'TRACKLIST LONGER THAN A CD':'NO TIMING';
    const txt=read||foot;if(r.textContent!==txt)r.textContent=txt;
  }
}
(function wireDataSide(){
  const cv=$('dataSideCanvas');if(!cv)return;
  const pos=e=>{const r=cv.getBoundingClientRect();return {x:(e.clientX-r.left)*(cv.clientWidth/r.width),y:(e.clientY-r.top)*(cv.clientHeight/r.height)}};
  cv.addEventListener('pointermove',e=>{ds.ptr=pos(e)});
  cv.addEventListener('pointerleave',()=>{ds.ptr=null});
  cv.addEventListener('click',e=>{
    const tm=dsTiming();if(!tm||!tm.starts)return;const p=pos(e),side=cv.clientWidth,k=(side/2-6)/60;
    const mm=Math.hypot(p.x-side/2,p.y-side/2)/k;if(mm<CDP.R0||!tm.rEnd||mm>tm.rEnd)return;
    const j=trackAtTime(tm,CDP.tAt(mm,tm.total));
    const items=document.querySelectorAll('#trackList .track-item');const it=items[j];
    if(it){it.scrollIntoView({block:'nearest',behavior:PH_REDUCE?'auto':'smooth'});it.classList.add('ds-flash');setTimeout(()=>it.classList.remove('ds-flash'),1200)}
  });
  if(safeGet('cc_data_side')==='1')toggleDataSide(true);
  // restart the loop whenever a disc opens with the data side showing
  new MutationObserver(()=>{if(ds.on&&$('infoModal').classList.contains('open')&&!ds.raf){ds.last=0;ds.raf=requestAnimationFrame(dsLoop)}}).observe($('infoModal'),{attributes:true,attributeFilter:['class']});
})();

// ── 2. WALL: every slot, data side up, one light for all of them ──
var wall={order:'slot',filter:null,ptr:null,hover:null,raf:0,clock:0,last:0,lastIdle:0,dirty:true,cells:[],tms:null,cell:52};
function wallTimings(){if(!wall.tms||wall.tms.length!==discs.length)wall.tms=discs.map((_,i)=>discTiming(i));return wall.tms}
function wallInvalidate(){if(!wall)return;wall.tms=null;wall.dirty=true}
var WALL_KINDS=[['ok','MEASURED'],['over','TOO LONG FOR ONE CD'],['partial','MISSING SOME LENGTHS'],['nolen','NO TRACK LENGTHS'],['unknown','NOT LOOKED UP YET'],['empty','EMPTY / WISHLIST']];
function wallKindOf(tm){return tm.kind==='wish'?'empty':tm.kind}
function renderWall(){
  if(!wall)return;
  wallInvalidate();
  const tms=wallTimings(),counts={};tms.forEach(t=>{const k=wallKindOf(t);counts[k]=(counts[k]||0)+1});
  $('wallChips').innerHTML=WALL_KINDS.filter(([k])=>counts[k]).map(([k,l])=>`<button type="button" class="attn-chip wall-chip${wall.filter===k?' on':''}" data-wall-kind="${k}" aria-pressed="${wall.filter===k}"><i class="wk-${k}"></i>${counts[k]} ${l}</button>`).join('');
  $('wallOrder').value=wall.order;
  if(!wall.raf){wall.last=0;wall.raf=requestAnimationFrame(wallLoop)}
}
function wallSetOrder(v){wall.order=v==='len'?'len':'slot';wall.dirty=true}
function wallOrdered(){
  const tms=wallTimings(),idx=discs.map((_,i)=>i);
  if(wall.order==='slot')return idx;
  const rank={ok:0,partial:1,over:2,nolen:3,unknown:4,wish:5,empty:6};
  return idx.sort((a,b)=>rank[tms[a].kind]-rank[tms[b].kind]||(tms[a].total||0)-(tms[b].total||0)||a-b);
}
function wallLoop(ts){
  wall.raf=0;
  if(currentView!=='wall')return;
  const dt=wall.last?Math.min(.1,(ts-wall.last)/1000):0;wall.last=ts;wall.clock+=dt;
  if(!wall.ptr&&!PH_REDUCE&&wall.clock-wall.lastIdle>1/20){wall.dirty=true;wall.lastIdle=wall.clock}
  if(wall.dirty){wall.dirty=false;drawWall()}
  wall.raf=requestAnimationFrame(wallLoop);
}
function drawWall(){
  const cv=$('wallCanvas');if(!cv)return;
  const W=cv.parentElement.clientWidth||1000,n=discs.length;
  const cols=Math.max(4,Math.floor(W/(W<600?44:52))),cell=W/cols,rows=Math.ceil(n/cols),H=Math.round(rows*cell);
  wall.cell=cell;wall.cols=cols;
  const dpr=Math.min(2,devicePixelRatio||1);
  if(cv.style.height!==H+'px')cv.style.height=H+'px';
  if(cv.width!==Math.round(W*dpr)||cv.height!==Math.round(H*dpr)){cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr)}
  const c=cv.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,W,H);
  const tms=wallTimings(),order=wallOrdered(),f=currentFilters(),filtered=anyFilter(f),k=(cell/2-3)/60;
  const light=wall.ptr||{x:W/2+Math.cos(wall.clock*.25)*W*.9,y:H/2+Math.sin(wall.clock*.25)*H*1.2};
  wall.cells=order;
  order.forEach((i,p)=>{
    const x=(p%cols)*cell+cell/2,y=Math.floor(p/cols)*cell+cell/2,tm=tms[i];
    const dim=(wall.filter&&wallKindOf(tm)!==wall.filter)||(filtered&&!matches(i,f));
    c.globalAlpha=dim?.14:1;
    drawDataSide(c,x,y,k,tm,light);
    if(nowPlaying&&nowPlaying.index===i){c.globalAlpha=1;c.strokeStyle='#ff4a50';c.lineWidth=2;c.beginPath();c.arc(x,y,60*k+3,0,Math.PI*2);c.stroke()}
    if(wall.hover===i){c.globalAlpha=1;c.strokeStyle='#ffffff';c.lineWidth=1.5;c.beginPath();c.arc(x,y,60*k+3,0,Math.PI*2);c.stroke()}
  });
  c.globalAlpha=1;
}
function wallHit(e){
  const cv=$('wallCanvas'),r=cv.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
  const col=Math.floor(x/wall.cell),row=Math.floor(y/wall.cell),p=row*wall.cols+col;
  return {x,y,i:col>=0&&col<wall.cols&&p>=0&&p<wall.cells.length?wall.cells[p]:null};
}
(function wireWall(){
  const cv=$('wallCanvas');if(!cv)return;
  cv.addEventListener('pointermove',e=>{
    const h=wallHit(e);wall.ptr={x:h.x,y:h.y};wall.dirty=true;
    const tip=$('wallTip');
    if(h.i!==wall.hover){
      wall.hover=h.i;
      if(h.i==null){tip.style.display='none'}
      else{const d=discs[h.i],tm=wallTimings()[h.i];
        tip.innerHTML=`<b>${slotNum(h.i)}</b><span>${escH(d&&d[0]||'')}</span><strong>${escH(d&&d[1]||'Empty slot')}</strong><em>${escH(timingNote(tm))}</em>`;
        tip.style.display='';}
    }
    if(h.i!=null){const tw=tip.offsetWidth||260,W=cv.clientWidth;tip.style.left=Math.min(W-tw-4,Math.max(4,h.x+16))+'px';tip.style.top=(h.y+18)+'px'}
  });
  cv.addEventListener('pointerleave',()=>{wall.ptr=null;wall.hover=null;wall.dirty=true;$('wallTip').style.display='none'});
  cv.addEventListener('click',e=>{const h=wallHit(e);if(h.i!=null&&!isSlotEmpty(discs[h.i]))openInfoModal(h.i)});
  $('wallChips').addEventListener('click',e=>{const b=e.target.closest('[data-wall-kind]');if(!b)return;wall.filter=wall.filter===b.dataset.wallKind?null:b.dataset.wallKind;renderWall()});
  addEventListener('resize',()=>{wall.dirty=true});
})();

// ── 3. SEEK: the carousel turning to a slot at your changer's own speed ──
var SEEK_KEY='cc_seek';
var sk={pos:0,anim:null,vel:0,dir:'shortest',runs:[],sw:null,swLast:null,raf:0,last:0,lastSeek:null};
(function loadSeek(){
  try{const s=JSON.parse(safeGet(SEEK_KEY)||'{}');if(Array.isArray(s.runs))sk.runs=s.runs.filter(r=>r&&r.d>0&&r.t>0);if(s.dir==='oneway')sk.dir='oneway';if(Number.isFinite(s.pos))sk.pos=s.pos}catch(e){}
  if(!Number.isFinite(sk.pos)||sk.pos<0)sk.pos=0;
})();
function seekSave(){safeSet(SEEK_KEY,JSON.stringify({runs:sk.runs,dir:sk.dir,pos:Math.round(sk.pos)}))}
function seekFit(){
  const R=sk.runs;if(!R.length)return null;
  if(R.length===1||new Set(R.map(r=>r.d)).size===1){return {per:R.reduce((s,r)=>s+r.t/r.d,0)/R.length,over:0}}
  const n=R.length,mx=R.reduce((s,r)=>s+r.d,0)/n,my=R.reduce((s,r)=>s+r.t,0)/n;
  const per=R.reduce((s,r)=>s+(r.d-mx)*(r.t-my),0)/R.reduce((s,r)=>s+(r.d-mx)**2,0);
  if(!(per>0))return {per:R.reduce((s,r)=>s+r.t/r.d,0)/n,over:0};
  return {per,over:Math.max(0,my-per*mx)};
}
function seekN(){return discs.length}
function seekCur(){const n=seekN();return ((Math.round(sk.pos)%n)+n)%n}
function seekDelta(from,to){const n=seekN();return sk.dir==='shortest'?((to-from+n*1.5)%n)-n/2:(to-from+n)%n}
function seekDuration(d){const f=seekFit(),a=Math.abs(d);if(!a)return 0;return f?f.over+f.per*a:.6+2.2*a/100}
function seekTo(i){
  const d=seekDelta(seekCur(),i);
  sk.anim={start:sk.pos,d,T:seekDuration(d),t:0,target:i};sk.lastSeek={d,T:sk.anim.T};
  $('seekSlot').value=i+1;
  if(currentView==='seek'&&!sk.raf){sk.last=0;sk.raf=requestAnimationFrame(seekLoop)}
  if(currentView!=='seek'){sk.pos=i;sk.anim=null}
  seekSave();seekPanel();
}
function renderSeek(){
  if(!sk)return;
  if(nowPlaying&&Number.isInteger(nowPlaying.index)&&!sk.anim&&!safeGet(SEEK_KEY))sk.pos=nowPlaying.index;
  $('seekDirShort').classList.toggle('active',sk.dir==='shortest');$('seekDirOne').classList.toggle('active',sk.dir==='oneway');
  $('seekDirShort').setAttribute('aria-pressed',String(sk.dir==='shortest'));$('seekDirOne').setAttribute('aria-pressed',String(sk.dir==='oneway'));
  seekPanel();
  if(!sk.raf){sk.last=0;sk.raf=requestAnimationFrame(seekLoop)}
}
function seekLoop(ts){
  sk.raf=0;
  if(currentView!=='seek')return;
  const dt=sk.last?Math.min(.1,(ts-sk.last)/1000):0;sk.last=ts;
  if(sk.anim){
    const A=sk.anim;A.t+=dt;const u=A.T?Math.min(1,A.t/A.T):1;
    const e=u*u*u*(10-15*u+6*u*u),de=30*u*u*(1-u)*(1-u);   // minimum-jerk: how a motor eases a carousel
    sk.pos=A.start+A.d*e;sk.vel=A.T?A.d*de/A.T:0;
    if(u>=1){sk.pos=A.target;sk.vel=0;sk.anim=null;seekSave();seekPanel()}
  }
  drawSeek();
  if(sk.anim||sk.sw)seekPanel(true);
  sk.raf=requestAnimationFrame(seekLoop);
}
function drawSeek(){
  const cv=$('seekCanvas');if(!cv)return;
  const S=Math.round(Math.min(cv.parentElement.clientWidth,640));if(!S)return;
  if(cv.style.width!==S+'px'){cv.style.width=S+'px';cv.style.height=S+'px'}
  const dpr=Math.min(2,devicePixelRatio||1);
  if(cv.width!==Math.round(S*dpr)){cv.width=Math.round(S*dpr);cv.height=Math.round(S*dpr)}
  const c=cv.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,S,S);
  const n=seekN(),cx=S/2,cy=S/2,sc=S/700,TAU=Math.PI*2,rIn=200*sc,rOut=318*sc,tms=wallTimings();
  c.fillStyle='#0d0d11';c.beginPath();c.arc(cx,cy,332*sc,0,TAU);c.fill();
  c.strokeStyle='#1e1e26';c.lineWidth=1;[rIn-8*sc,332*sc].forEach(r=>{c.beginPath();c.arc(cx,cy,r,0,TAU);c.stroke()});
  const blur=Math.min(.5,Math.abs(sk.vel)/120),cur=seekCur(),f=currentFilters(),filtered=anyFilter(f);
  c.lineCap='round';
  for(let i=0;i<n;i++){
    const a=((i-sk.pos)/n)*TAU-Math.PI/2,ca=Math.cos(a),sa=Math.sin(a),tm=tms[i];
    c.globalAlpha=filtered&&!matches(i,f)?.25:1;
    if(tm.kind==='empty'||tm.kind==='wish'){c.setLineDash([3,4]);c.strokeStyle='rgba(200,200,210,.35)';c.lineWidth=1;c.beginPath();c.moveTo(cx+ca*rIn,cy+sa*rIn);c.lineTo(cx+ca*rOut,cy+sa*rOut);c.stroke();c.setLineDash([]);continue}
    const col=tm.kind==='over'?'255,74,80':tm.kind==='partial'?'212,160,23':tm.kind==='ok'?'214,220,232':'142,139,147';
    const reach=tm.kind==='over'?1:tm.rEnd?Math.max(0,Math.min(1,(tm.rRec-22)/36)):0;
    c.lineWidth=Math.max(1.5,(3.2+blur*10)*sc*Math.min(1,200/n));
    c.strokeStyle=`rgba(${col},.16)`;c.beginPath();c.moveTo(cx+ca*rIn,cy+sa*rIn);c.lineTo(cx+ca*rOut,cy+sa*rOut);c.stroke();
    if(reach){const rr=rIn+(rOut-rIn)*reach;c.strokeStyle=`rgba(${col},${.75-blur})`;c.beginPath();c.moveTo(cx+ca*rIn,cy+sa*rIn);c.lineTo(cx+ca*rr,cy+sa*rr);c.stroke()}
    if(i%10===9&&S>360){c.fillStyle='rgba(200,198,206,.7)';c.font=Math.round(10*Math.max(.9,sc))+'px "Share Tech Mono",monospace';c.textAlign='center';c.textBaseline='middle';c.fillText(slotNum(i),cx+ca*(rIn-22*sc),cy+sa*(rIn-22*sc))}
  }
  c.globalAlpha=1;
  c.fillStyle=sk.anim?'rgba(255,74,80,.08)':'rgba(255,74,80,.18)';
  c.beginPath();c.moveTo(cx-9*sc,cy-rOut-14*sc);c.lineTo(cx+9*sc,cy-rOut-14*sc);c.lineTo(cx+6*sc,cy-rIn+6*sc);c.lineTo(cx-6*sc,cy-rIn+6*sc);c.closePath();c.fill();
  c.strokeStyle='#ff4a50';c.lineWidth=1.5;c.beginPath();c.moveTo(cx-12*sc,cy-rOut-18*sc);c.lineTo(cx,cy-rOut-6*sc);c.lineTo(cx+12*sc,cy-rOut-18*sc);c.stroke();
  c.textAlign='center';c.textBaseline='alphabetic';
  c.fillStyle='#ff5a5f';c.font=Math.round(96*sc)+'px "Bebas Neue",sans-serif';c.fillText(slotNum(cur),cx,cy+20*sc);
  c.fillStyle='rgba(200,198,206,.8)';c.font=Math.round(12*Math.max(.9,sc))+'px "Share Tech Mono",monospace';c.fillText(sk.anim?'TURNING…':'AT THE LASER',cx,cy+48*sc);
}
function seekPanel(light){
  const cur=seekCur(),d=discs[cur],f=seekFit();
  $('seekStatus').textContent=sk.anim?'TURNING TO SLOT '+slotNum(sk.anim.target):'READY · SLOT '+slotNum(cur);
  $('seekArtist').textContent=d&&d[0]||'—';$('seekAlbum').textContent=isSlotEmpty(d)?'Empty slot':d[1];
  const ls=sk.lastSeek;
  $('seekSlots').textContent=ls?Math.abs(Math.round(ls.d))+' SLOTS'+(ls.d<0?' ↺':ls.d>0?' ↻':''):'—';
  $('seekTime').textContent=ls?(ls.T<10?ls.T.toFixed(1):Math.round(ls.T))+' S'+(f?'':' *'):'—';
  $('seekSpeed').textContent=Math.abs(sk.vel).toFixed(0)+' SLOTS/S';
  const swT=sk.sw?(performance.now()-sk.sw.t0)/1000:sk.swLast;$('seekSwTime').textContent=(swT==null?0:swT).toFixed(1)+' S';
  if(light)return;
  const to=Math.max(1,Math.min(seekN(),parseInt($('seekSlot').value,10)||1));
  $('seekBadge').textContent=f?'MEASURED':'NOT MEASURED';$('seekBadge').classList.toggle('ok',!!f);
  $('seekCalibText').textContent=f
    ?`${f.per.toFixed(3)} s per slot${f.over?` + ${f.over.toFixed(1)} s to start and stop`:''}, from ${sk.runs.length} timed seek${sk.runs.length===1?'':'s'}. Every seek now plays out at your changer's speed.`
    :`* Preview timing, not your changer. Type a slot far from ${slotNum(cur)}, press START at the same moment you tell the changer to play it, then IT STOPPED when it stops turning. Two seeks of different lengths also measure its start-up time.`;
  $('seekSwStart').textContent=sk.sw?'TIMING…':'START (→ SLOT '+String(to).padStart(3,'0')+')';
  $('seekRuns').innerHTML=sk.runs.map(r=>`<span>${r.d} SLOTS → ${r.t.toFixed(1)} S</span>`).join('');
}
function seekTarget(){return Math.max(1,Math.min(seekN(),parseInt($('seekSlot').value,10)||1))-1}
async function seekPlay(){
  const i=seekTarget();
  seekTo(i);
  const d=discs[i];if(isSlotEmpty(d))return;
  const cfg=webhookCfg();
  if(!cfg.url){toast('SHOWING THE SEEK — SET UP ▶ PLAY ON CHANGER IN ⚙ SETTINGS TO MOVE THE REAL ONE',4500);return}
  const err=validWebhookUrl(cfg.url);if(err){toast('WEBHOOK: '+err.toUpperCase(),6000);return}
  const r=await sendWebhook(cfg.url,{event:'play',slot:i+1,slot_padded:slotNum(i),artist:d[0],album:d[1],source:'cratechanger'});
  if(!r.ok){toast('COULD NOT REACH THE CHANGER: '+String(r.error).toUpperCase(),5000);return}
  if(cfg.markPlaying){nowPlaying={index:i,artist:d[0],album:d[1]};safeSet(NP_KEY,JSON.stringify(nowPlaying));const m=getMeta(i);(m.playHistory=m.playHistory||[]).push(new Date().toISOString());saveMeta();buildGrid()}
  toast(r.confirmed?'▶ SENT TO THE CHANGER ✓':'▶ SENT — NO CONFIRMATION',4000);
}
function seekRandom(){
  const cand=discs.map((d,i)=>i).filter(i=>!isSlotEmpty(discs[i])&&!isWish(i)&&i!==seekCur());if(!cand.length)return;
  $('seekSlot').value=cand[Math.floor(Math.random()*cand.length)]+1;seekPanel();
}
function seekSwStart(){const to=seekTarget();sk.sw={t0:performance.now(),from:seekCur(),to};seekTo(to)}
function seekSwStop(){
  if(!sk.sw)return;const t=(performance.now()-sk.sw.t0)/1000,d=Math.abs(Math.round(seekDelta(sk.sw.from,sk.sw.to)));
  sk.swLast=t;if(d&&t>0)sk.runs.push({d,t:Math.round(t*10)/10});sk.sw=null;seekSave();seekPanel();
}
function seekClearRuns(){sk.runs=[];sk.swLast=null;seekSave();seekPanel()}
function seekSetDir(v){sk.dir=v==='oneway'?'oneway':'shortest';seekSave();renderSeek()}
(function wireSeek(){
  const cv=$('seekCanvas');if(!cv)return;
  cv.addEventListener('click',e=>{
    const r=cv.getBoundingClientRect(),S=cv.clientWidth,x=e.clientX-r.left-S/2,y=e.clientY-r.top-S/2,dd=Math.hypot(x,y),sc=S/700;
    if(dd<180*sc||dd>340*sc)return;
    const n=seekN(),frac=(Math.atan2(y,x)+Math.PI/2)/(Math.PI*2);
    const i=((Math.round(sk.pos+frac*n)%n)+n)%n;
    $('seekSlot').value=i+1;seekPanel();seekTo(i);
  });
  $('seekSlot').addEventListener('input',()=>seekPanel());
  addEventListener('resize',()=>{if(currentView==='seek')drawSeek()});
})();
// a disc sent to the changer from the drawer moves the carousel too
var _phPlayOnChanger=playOnChanger;
playOnChanger=async function(){const i=currentModalIndex,hooked=!!webhookCfg().url;await _phPlayOnChanger();if(hooked&&i!==null&&i!==undefined&&!isSlotEmpty(discs[i]))seekTo(i)};
