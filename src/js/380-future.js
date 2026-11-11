
// ── ONE SURFACE: deep zoom, ask the crate, music-driven light, aging, tilt, immersive ──

// ═ 1. DEEP ZOOM — one continuous space: the crate → a disc → its tracks → the spiral → the pits ═
// World units are millimetres. Each slot owns a 130 mm cell; a disc is 120 mm across.
var DEEP_CELL=130,DEEP_MAXK=60000,DEEP_MICRO=90;   // px per mm: past DEEP_MICRO the disc is drawn analytically
var deep={cam:{x:0,y:0,k:1},fly:null,raf:0,dirty:true,ptr:null,drag:null,pts:new Map(),pinch:null,cols:20,rows:10,W:0,H:0,k0:1,clock:0,last:0,focus:null,ready:false,hud:''};
function deepLayout(){
  const cv=$('deepCanvas');deep.W=cv.clientWidth||1000;deep.H=cv.clientHeight||600;
  const n=Math.max(1,discs.length);
  deep.cols=Math.max(1,Math.round(Math.sqrt(n*deep.W/deep.H)));deep.rows=Math.ceil(n/deep.cols);
  deep.k0=Math.min(deep.W/(deep.cols*DEEP_CELL),deep.H/(deep.rows*DEEP_CELL));
}
function deepHomeCam(){return {x:deep.cols*DEEP_CELL/2,y:deep.rows*DEEP_CELL/2,k:deep.k0}}
function deepDiscCenter(i){return {x:(i%deep.cols+.5)*DEEP_CELL,y:(Math.floor(i/deep.cols)+.5)*DEEP_CELL}}
function deepDiscAt(wx,wy){
  const col=Math.floor(wx/DEEP_CELL),row=Math.floor(wy/DEEP_CELL);
  if(col<0||col>=deep.cols||row<0)return null;const i=row*deep.cols+col;return i<discs.length?i:null;
}
function deepClamp(cam){
  cam.k=Math.max(deep.k0*.8,Math.min(DEEP_MAXK,cam.k));
  cam.x=Math.max(0,Math.min(deep.cols*DEEP_CELL,cam.x));cam.y=Math.max(0,Math.min(deep.rows*DEEP_CELL,cam.y));
  return cam;
}
function deepKick(){if(!deep)return;deep.dirty=true;if(!deep.raf&&currentView==='deep'){deep.last=0;deep.raf=requestAnimationFrame(deepLoop)}}
function renderDeep(){
  if(!deep)return;
  deepLayout();
  if(!deep.ready){deep.cam=deepHomeCam();deep.ready=true}
  deepClamp(deep.cam);deepKick();
}
function deepFlyTo(cam,ms){
  deepClamp(cam);
  if(PH_REDUCE||ms===0){deep.cam=cam;deep.fly=null;deepKick();return}
  deep.fly={a:{...deep.cam},b:cam,t:0,T:(ms||900)/1000};deepKick();
}
function deepHome(){deepLayout();deepFlyTo(deepHomeCam())}
function deepFocusDisc(i,ms){
  deepLayout();const p=deepDiscCenter(i);
  deepFlyTo({x:p.x,y:p.y,k:Math.min(deep.W,deep.H)*.44/60},ms);
}
function deepZoomAt(px,py,factor){
  const c=deep.cam,wx=c.x+(px-deep.W/2)/c.k,wy=c.y+(py-deep.H/2)/c.k;
  const k=Math.max(deep.k0*.8,Math.min(DEEP_MAXK,c.k*factor));
  c.k=k;c.x=wx-(px-deep.W/2)/k;c.y=wy-(py-deep.H/2)/k;deepClamp(c);deep.fly=null;deepKick();
}
function deepZoomBy(f){
  const c=deep.cam;deepFlyTo({x:c.x,y:c.y,k:c.k*f},350);
}
function deepOpen(){if(deep.focus!=null&&!isSlotEmpty(discs[deep.focus]))openInfoModal(deep.focus)}
function deepLoop(ts){
  deep.raf=0;
  if(currentView!=='deep')return;
  const dt=deep.last?Math.min(.1,(ts-deep.last)/1000):0;deep.last=ts;deep.clock+=dt;
  if(deep.fly){
    const F=deep.fly;F.t+=dt;const u=Math.min(1,F.t/F.T),e=u*u*(3-2*u);
    const k=Math.exp(Math.log(F.a.k)+(Math.log(F.b.k)-Math.log(F.a.k))*e);
    // move so the destination stays on a straight screen-space path while the scale changes
    const w=Math.abs(F.a.k-F.b.k)<1e-9?e:(1/F.a.k-1/k)/(1/F.a.k-1/F.b.k);
    deep.cam={k,x:F.a.x+(F.b.x-F.a.x)*w,y:F.a.y+(F.b.y-F.a.y)*w};
    if(u>=1){deep.cam={...F.b};deep.fly=null}
    deep.dirty=true;
  }
  if(lightIsLive())deep.dirty=true;
  if(deep.dirty){deep.dirty=false;drawDeep()}
  // idle: stop the loop; any input kicks it again
  if(deep.fly||lightIsLive()||deep.dirty)deep.raf=requestAnimationFrame(deepLoop);else deep.last=0;
}
function deepHash(a,b){let h=(a*374761393+b*668265263)|0;h=(h^(h>>>13))*1274126177|0;return (h^(h>>>16))>>>0}
function drawDeep(){
  const cv=$('deepCanvas');if(!cv)return;
  const W=cv.clientWidth,H=cv.clientHeight;if(!W||!H)return;
  if(W!==deep.W||H!==deep.H){const rel=deep.cam.k/deep.k0;deepLayout();if(rel<1.05)deep.cam=deepHomeCam()}
  const dpr=Math.min(2,devicePixelRatio||1);
  if(cv.width!==Math.round(W*dpr)||cv.height!==Math.round(H*dpr)){cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr)}
  const c=cv.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.fillStyle='#050507';c.fillRect(0,0,W,H);
  const cam=deep.cam,k=cam.k,n=discs.length,R=60*k,TAU=Math.PI*2;
  const f=currentFilters(),filtered=anyFilter(f);
  const light=sceneLight(W,H,deep.drag||deep.pinch?null:deep.ptr,deep.clock);
  const c0=Math.max(0,Math.floor((cam.x-W/2/k)/DEEP_CELL)),c1=Math.min(deep.cols-1,Math.floor((cam.x+W/2/k)/DEEP_CELL));
  const r0=Math.max(0,Math.floor((cam.y-H/2/k)/DEEP_CELL)),r1=Math.min(deep.rows-1,Math.floor((cam.y+H/2/k)/DEEP_CELL));
  for(let row=r0;row<=r1;row++)for(let col=c0;col<=c1;col++){
    const i=row*deep.cols+col;if(i>=n)continue;
    const wc=deepDiscCenter(i),sx=(wc.x-cam.x)*k+W/2,sy=(wc.y-cam.y)*k+H/2,tm=timingFor(i);
    const alpha=filtered&&!matches(i,f)?.14:ageAlpha(i);
    c.globalAlpha=alpha;
    if(k>=DEEP_MICRO){deepMicro(c,W,H,i,tm,light,alpha);continue}
    drawDataSide(c,sx,sy,k,tm,light,R<70?undefined:{detail:true});
    if(nowPlaying&&nowPlaying.index===i){c.globalAlpha=1;c.strokeStyle='#ff4a50';c.lineWidth=2;c.beginPath();c.arc(sx,sy,R+3,0,TAU);c.stroke();c.globalAlpha=alpha}
    if(R>=70)deepLabels(c,i,sx,sy,k,tm);
  }
  c.globalAlpha=1;
  deepHud(W,H);
}
function deepLabels(c,i,sx,sy,k,tm){
  const R=60*k,d=discs[i];
  c.textAlign='center';c.textBaseline='alphabetic';
  c.fillStyle='#ff5a5f';c.font=Math.round(Math.max(11,Math.min(22,R*.09)))+'px "Share Tech Mono",monospace';
  c.fillText(slotNum(i),sx,sy-R-Math.max(22,R*.12));
  if(!isSlotEmpty(d)){
    c.fillStyle='rgba(224,221,216,.92)';c.font=Math.round(Math.max(11,Math.min(26,R*.1)))+'px "Bebas Neue",sans-serif';
    let t=(d[0]+' — '+d[1]).toUpperCase();const max=R*2.1;
    while(t.length>8&&c.measureText(t).width>max)t=t.slice(0,-2);
    if(t.length<(d[0]+' — '+d[1]).length)t=t.replace(/.$/,'…');
    c.fillText(t,sx,sy-R-6);
  }
  if(!tm.starts||R<260)return;
  // track numbers (and titles when there is room) down the six o'clock radius, one per ring
  c.textBaseline='middle';
  for(let j=0;j<tm.starts.length;j++){
    const ra=CDP.rAt(tm.starts[j],tm.total),rb=CDP.rAt(j+1<tm.starts.length?tm.starts[j+1]:tm.total,tm.total),w=(rb-ra)*k;
    if(w<11)continue;
    const y=sy+(ra+rb)/2*k;
    c.font=Math.round(Math.min(15,Math.max(9,w*.6)))+'px "Share Tech Mono",monospace';
    const txt=String(j+1).padStart(2,'0')+(w>=15&&tm.titles[j]?'  '+tm.titles[j].toUpperCase().slice(0,34)+'  '+fmtSec(tm.lens[j]):'');
    c.lineWidth=3;c.strokeStyle='rgba(5,5,7,.8)';c.strokeText(txt,sx,y);c.fillStyle='rgba(255,255,255,.95)';c.fillText(txt,sx,y);
  }
}
// Past ~90 px/mm the disc is far bigger than the screen, so draw only what is under the glass, analytically.
function deepMicro(c,W,H,i,tm,light,alpha){
  const cam=deep.cam,k=cam.k,wc=deepDiscCenter(i),TAU=Math.PI*2;
  const vx=cam.x-wc.x,vy=cam.y-wc.y;            // view centre relative to the disc centre, mm
  const rc=Math.hypot(vx,vy),D=Math.hypot(W,H)/2/k;
  if(rc-D>60)return;
  let th0=Math.atan2(vy,vx);if(th0<0)th0+=TAU;
  const full=rc<=D*1.05,dth=full?Math.PI:Math.min(Math.PI,Math.asin(Math.min(1,D/rc))*1.15+1e-4);
  const P=(r,th)=>[(r*Math.cos(th)-vx)*k+W/2,(r*Math.sin(th)-vy)*k+H/2];
  const segs=r=>Math.max(1,Math.min(256,Math.ceil(2*dth/Math.sqrt(2/Math.max(1,r*k)))));
  const arc=(r,move)=>{const s=segs(r);for(let q=0;q<=s;q++){const p=P(r,th0-dth+2*dth*q/s);if(q===0&&move)c.moveTo(p[0],p[1]);else c.lineTo(p[0],p[1])}};
  const arcBack=r=>{const s=segs(r);for(let q=s;q>=0;q--){const p=P(r,th0-dth+2*dth*q/s);c.lineTo(p[0],p[1])}};
  const band=(ra,rb,fill)=>{if(rb<rc-D||ra>rc+D)return;c.beginPath();arc(rb,true);arcBack(Math.max(0,ra));c.closePath();c.fillStyle=fill;c.fill('evenodd')};
  if(tm.kind==='empty'||tm.kind==='wish'){c.setLineDash([6,6]);c.strokeStyle='rgba(200,200,210,.5)';c.lineWidth=1;c.beginPath();arc(60,true);c.stroke();c.setLineDash([]);return}
  band(7.5,22,'rgba(200,212,225,.10)');band(22,58,'#33353b');band(58,60,'rgba(200,212,225,.10)');
  const rRec=tm.rRec;
  if(rRec){
    // the diffracted colour under the glass: light direction from the pointer (or the music / tilt / orbit)
    const lx=light.x-W/2,ly=light.y-H/2,psi=Math.atan2(ly,lx),s=light.s!=null?light.s:.28+.4*Math.min(1,Math.hypot(lx,ly)/(Math.min(W,H)/2));
    const gg=Math.abs(s*Math.cos(th0-psi));let Rr=0,G=0,B=0;
    for(let m=1;m<=2;m++){const lam=1600*gg/m;if(lam>380&&lam<780){const w=wlRgb(lam),lo=380*m/1600,hi=780*m/1600,env=Math.pow(Math.sin(Math.PI*(gg-lo)/(hi-lo)),1.6),a=(m===1?.95:.22)*env;Rr+=w[0]*a;G+=w[1]*a;B+=w[2]*a}}
    const tint=Math.max(.18,Math.min(1,1-Math.log(Math.max(1,k/1500))/Math.log(40)));
    c.save();c.globalCompositeOperation='lighter';
    band(23,rRec,`rgba(${Math.min(255,Rr*235)|0},${Math.min(255,G*235)|0},${Math.min(255,B*235)|0},${(.8*tint).toFixed(3)})`);
    c.restore();
    const pitch=tm.total>4440?.0015:.0016,px=pitch*k;
    const lo=Math.max(23,rc-D),hi=Math.min(rRec,rc+D);
    if(px>=2.2&&hi>lo){
      const a=Math.min(1,(px-2.2)/4),n0=Math.ceil((lo-23)/pitch-th0/TAU),n1=Math.floor((hi-23)/pitch-th0/TAU);
      const pits=px>=9,L=14*.000278,dv=Math.min(dth,D/Math.max(lo,1)*1.05);
      // the groove: one continuous spiral, a turn every 1.6 µm
      c.beginPath();
      for(let t=n0;t<=n1;t++)arc(23+pitch*(t+th0/TAU),true);
      c.strokeStyle=`rgba(8,8,12,${(pits?.16:.38*a).toFixed(3)})`;c.lineWidth=Math.max(1,px*(pits?.9:.34));c.stroke();
      if(pits&&(n1-n0+1)*(2*dv*hi/L+2)<40000){
        // pits: 0.5 µm wide, 3–9 clock periods long. Illustrative — seeded per turn, not read from the disc.
        c.beginPath();
        for(let t=n0;t<=n1;t++){
          const r=23+pitch*(t+th0/TAU),j0=Math.floor(r*(th0-dv)/L),j1=Math.ceil(r*(th0+dv)/L);
          for(let j=j0;j<=j1;j++){
            const h=deepHash(t+i*7919,j),len=3+h%7,off=(h>>>4)%(12-len);
            const A=P(r,(j*L+off*.000278)/r),Bp=P(r,(j*L+(off+len)*.000278)/r);
            c.moveTo(A[0],A[1]);c.lineTo(Bp[0],Bp[1]);
          }
        }
        c.lineCap='round';c.lineWidth=.0005*k;c.strokeStyle='rgba(6,6,9,.82)';c.stroke();c.lineCap='butt';
      }
    }
    if(tm.starts){
      c.textAlign='left';c.textBaseline='bottom';
      tm.starts.forEach((st,j)=>{
        const r=CDP.rAt(st,tm.total);if(r<rc-D||r>rc+D)return;
        c.beginPath();arc(r,true);c.strokeStyle='rgba(255,90,95,.85)';c.lineWidth=1.5;c.stroke();
        const p=P(r,th0);c.font='11px "Share Tech Mono",monospace';
        const txt='TRACK '+String(j+1).padStart(2,'0')+(tm.titles[j]?' · '+tm.titles[j].toUpperCase().slice(0,40):'')+' STARTS HERE';
        c.lineWidth=3;c.strokeStyle='rgba(5,5,7,.85)';c.strokeText(txt,p[0]+8,p[1]-4);c.fillStyle='#ffd6d7';c.fillText(txt,p[0]+8,p[1]-4);
      });
    }
  }
  c.strokeStyle='rgba(220,230,240,.3)';c.lineWidth=1;[7.5,22,58,60].forEach(r=>{if(r>=rc-D&&r<=rc+D){c.beginPath();arc(r,true);c.stroke()}});
}
function deepScale(k){
  const raw=120/k,p=Math.pow(10,Math.floor(Math.log10(raw))),m=raw/p,nice=(m>=5?5:m>=2?2:1)*p;
  const label=nice>=1?Math.round(nice)+' MM':nice>=.001?+(nice*1000).toPrecision(1)+' µM':+(nice*1e6).toPrecision(1)+' NM';
  return {px:nice*k,label:label.replace('µM','µm')};
}
function deepHud(W,H){
  const cam=deep.cam,k=cam.k,i=60*k>=70?deepDiscAt(cam.x,cam.y):null;
  deep.focus=i;
  let where='THE CRATE · '+discs.length+' SLOTS',what='',note='SCROLL OR PINCH TO ZOOM · DRAG TO MOVE · DOUBLE-CLICK A DISC';
  if(i!=null){
    const d=discs[i],tm=timingFor(i),wc=deepDiscCenter(i),r=Math.hypot(cam.x-wc.x,cam.y-wc.y);
    where='SLOT '+slotNum(i)+(isSlotEmpty(d)?' · EMPTY':' · '+(d[0]+' — '+d[1]).toUpperCase());
    note=timingNote(tm).toUpperCase();
    if(tm.starts&&tm.rEnd){
      what=fmtSec(tm.total)+' · '+tm.lens.length+' TRACKS';
      if(k>=6&&r>=CDP.R0&&r<=tm.rEnd){
        const t=CDP.tAt(r,tm.total),j=trackAtTime(tm,t);
        what='TRACK '+(j+1)+(tm.titles[j]?' · '+tm.titles[j].toUpperCase():'')+' · '+fmtSec(t)+' INTO THE DISC · '+r.toFixed(k>2000?4:2)+' MM FROM THE CENTRE';
      }else if(k>=6){
        what=r<7.5?'CENTRE HOLE':r<22?'CLEAR HUB — NO DATA':r<CDP.R0?'LEAD-IN — TABLE OF CONTENTS':r<=tm.rRec?'LEAD-OUT — SILENCE':r<=58?'UNRECORDED MIRROR':r<=60?'CLEAR RIM':what;
      }
      const px=(tm.total>4440?.0015:.0016)*k;
      if(px>=9)note='PITS: 0.5 µm WIDE, 0.8–3 µm LONG. THE PATTERN SHOWN IS ILLUSTRATIVE — THE APP CANNOT READ YOUR DISC.';
      else if(px>=2.2)note='THE GROOVE: ONE SPIRAL, A TURN EVERY '+(tm.total>4440?'1.5':'1.6')+' µm — ABOUT '+Math.round((tm.rRec-23)/(tm.total>4440?.0015:.0016)/1000)+',000 TURNS ON THIS DISC';
    }
  }
  const sig=where+'|'+what+'|'+note;
  if(sig!==deep.hud){deep.hud=sig;$('deepWhere').textContent=where;$('deepWhat').textContent=what;$('deepNote').textContent=note;
    $('deepOpenBtn').style.display=i!=null&&!isSlotEmpty(discs[i])?'':'none'}
  const sc=deepScale(k);$('deepScaleBar').style.width=sc.px.toFixed(1)+'px';if($('deepScaleLabel').textContent!==sc.label)$('deepScaleLabel').textContent=sc.label;
}
(function wireDeep(){
  const cv=$('deepCanvas');if(!cv)return;
  const pos=e=>{const r=cv.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top}};
  cv.addEventListener('wheel',e=>{
    const out=e.deltaY>0;
    if(out&&deep.cam.k<=deep.k0*1.001)return;            // fully zoomed out: let the page scroll
    e.preventDefault();const p=pos(e);deepZoomAt(p.x,p.y,Math.exp(-e.deltaY*(e.deltaMode?.05:.0016)));
  },{passive:false});
  cv.addEventListener('pointerdown',e=>{
    askTiltPermission();
    try{cv.setPointerCapture(e.pointerId)}catch(_){}
    const p=pos(e);deep.pts.set(e.pointerId,p);deep.fly=null;
    if(deep.pts.size===1)deep.drag={x:p.x,y:p.y,moved:0};
    else if(deep.pts.size===2){const [a,b]=[...deep.pts.values()];deep.pinch={d:Math.hypot(a.x-b.x,a.y-b.y)||1,x:(a.x+b.x)/2,y:(a.y+b.y)/2};deep.drag=null}
  });
  cv.addEventListener('pointermove',e=>{
    const p=pos(e);
    if(deep.pts.has(e.pointerId))deep.pts.set(e.pointerId,p);
    if(deep.pinch&&deep.pts.size>=2){
      const [a,b]=[...deep.pts.values()],d=Math.hypot(a.x-b.x,a.y-b.y)||1,mx=(a.x+b.x)/2,my=(a.y+b.y)/2;
      deep.cam.x-=(mx-deep.pinch.x)/deep.cam.k;deep.cam.y-=(my-deep.pinch.y)/deep.cam.k;
      deepZoomAt(mx,my,d/deep.pinch.d);deep.pinch={d,x:mx,y:my};return;
    }
    if(deep.drag){
      const dx=p.x-deep.drag.x,dy=p.y-deep.drag.y;deep.drag.moved+=Math.abs(dx)+Math.abs(dy);deep.drag.x=p.x;deep.drag.y=p.y;
      deep.cam.x-=dx/deep.cam.k;deep.cam.y-=dy/deep.cam.k;deepClamp(deep.cam);deepKick();return;
    }
    deep.ptr=p;deepKick();
  });
  const up=e=>{
    const tap=deep.drag&&deep.drag.moved<6&&deep.pts.size===1,p=deep.pts.get(e.pointerId);
    deep.pts.delete(e.pointerId);if(deep.pts.size<2)deep.pinch=null;if(!deep.pts.size)deep.drag=null;
    if(tap&&p&&60*deep.cam.k<70){       // from the whole crate, a tap flies to that disc
      const i=deepDiscAt(deep.cam.x+(p.x-deep.W/2)/deep.cam.k,deep.cam.y+(p.y-deep.H/2)/deep.cam.k);
      if(i!=null)deepFocusDisc(i);
    }
  };
  cv.addEventListener('pointerup',up);cv.addEventListener('pointercancel',up);
  cv.addEventListener('pointerleave',()=>{deep.ptr=null;deepKick()});
  cv.addEventListener('dblclick',e=>{const p=pos(e);if(60*deep.cam.k>=70){const c=deep.cam,wx=c.x+(p.x-deep.W/2)/c.k,wy=c.y+(p.y-deep.H/2)/c.k;deepFlyTo({x:wx,y:wy,k:c.k*6},700)}});
  cv.addEventListener('keydown',e=>{
    const c=deep.cam,step=deep.W*.18/c.k;let used=true;
    if(e.key==='+'||e.key==='=')deepZoomBy(2);else if(e.key==='-'||e.key==='_')deepZoomBy(.5);
    else if(e.key==='0'||e.key==='Home')deepHome();
    else if(e.key==='ArrowLeft'){c.x-=step;deepClamp(c);deepKick()}else if(e.key==='ArrowRight'){c.x+=step;deepClamp(c);deepKick()}
    else if(e.key==='ArrowUp'){c.y-=step;deepClamp(c);deepKick()}else if(e.key==='ArrowDown'){c.y+=step;deepClamp(c);deepKick()}
    else if(e.key==='Enter')deepOpen();else used=false;
    if(used){e.preventDefault();e.stopPropagation()}
  });
  addEventListener('resize',()=>{if(currentView==='deep')deepKick()});
  try{document.fonts&&document.fonts.ready.then(deepKick)}catch(e){}
})();

// ═ 2. TILT — on a phone, tilting it moves the light (the data side behaves like a real disc in your hand) ═
var lightTiltAsked=false;
function askTiltPermission(){
  if(lightTiltAsked)return;lightTiltAsked=true;
  try{if(typeof DeviceOrientationEvent!=='undefined'&&typeof DeviceOrientationEvent.requestPermission==='function')DeviceOrientationEvent.requestPermission().catch(()=>{})}catch(e){}
}
addEventListener('deviceorientation',e=>{
  if(e.gamma==null||e.beta==null)return;
  const t={x:Math.max(-1,Math.min(1,e.gamma/40)),y:Math.max(-1,Math.min(1,(e.beta-45)/40))};
  if(scene.tilt&&Math.abs(t.x-scene.tilt.x)<.012&&Math.abs(t.y-scene.tilt.y)<.012)return;   // resting on a table: not live
  scene.tilt=t;scene.tiltAt=performance.now();
  if(currentView==='deep')deepKick();
});
(function(){const w=$('wallCanvas');if(w)w.addEventListener('pointerdown',askTiltPermission)})();

// ═ 3. AGING — neglect made visible ═
function toggleAging(force){
  scene.age=force!==undefined?!!force:!scene.age;
  safeSet('cc_aging',scene.age?'1':'0');
  ['wallAgeBtn','deepAgeBtn'].forEach(id=>{const b=$(id);if(!b)return;b.textContent='◔ AGING: '+(scene.age?'ON':'OFF');b.setAttribute('aria-pressed',String(scene.age));b.classList.toggle('active',scene.age)});
  if(typeof wall!=='undefined'&&wall)wall.dirty=true;deepKick();
}
if(safeGet('cc_aging')==='1')toggleAging(true);

// ═ 4. IMMERSIVE — the page gets out of the way; Esc or the corner button brings it back ═
function toggleImmersive(force){
  const on=force!==undefined?!!force:!document.body.classList.contains('immersive');
  document.body.classList.toggle('immersive',on);
  $('immersiveExit').style.display=on?'':'none';
  closeMoreMenu();if(typeof closeSectionMenus==='function')closeSectionMenus();
  if(on)toast('IMMERSIVE — ESC OR ✕ SHOW CONTROLS TO COME BACK',3500);
  deepKick();if(typeof seekKick==='function')seekKick();if(typeof wall!=='undefined'&&wall)wall.dirty=true;
}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('immersive')&&!openLayer())toggleImmersive(false)});

// ═ 5. ASK THE CRATE — plain words (typed in the search box + Enter, or spoken) become filters and actions ═
var ASK_DEMONYM={norwegian:'NO',swedish:'SE',finnish:'FI',danish:'DK',german:'DE',american:'US',british:'GB',english:'GB',polish:'PL',brazilian:'BR',dutch:'NL',french:'FR',canadian:'CA',australian:'AU',greek:'GR',italian:'IT',japanese:'JP',czech:'CZ',austrian:'AT',swiss:'CH',spanish:'ES',belgian:'BE',russian:'RU',mexican:'MX',chilean:'CL',colombian:'CO',irish:'IE',scottish:'GB',america:'US',usa:'US',states:'US',uk:'GB',england:'GB',britain:'GB',holland:'NL'};
var ASK_DECADE={fifties:'1950s',sixties:'1960s',seventies:'1970s',eighties:'1980s',nineties:'1990s',noughties:'2000s',aughts:'2000s'};
var ASK_STOP=/\b(play|put on|spin|queue|show|find|open|pull up|go to|give|me|some|something|anything|a|an|the|my|i|from|by|of|in|that|is|are|was|were|with|music|albums?|discs?|cds?|stuff|what|which|have|haven't|havent|and|for|to|please|on|all|bands?|records?|ones?|do|did|got|there|any|listen|listened|hear|heard|played|era)\b/g;
function askIsCommand(t){return /^\s*(play|put on|spin|queue|show me|find me|open|pull up|go to|clear|reset|what|which|random|surprise|anything|something|slot\s*#?\d+|disc\s*#?\d+)\b/i.test(t)}
function askCrate(text){
  const q=String(text||'').toLowerCase().replace(/[“”"?.!,;:]/g,' ').replace(/[’']/g,"'").replace(/\s+/g,' ').trim();
  if(!q)return null;
  const done=(say,extra)=>{toast(say,4500);return Object.assign({say},extra||{})};
  const wantsPlay=/^(play|put on|spin|queue)\b/.test(q),wantsOpen=wantsPlay||/^(open|pull up|go to)\b/.test(q);
  const openDisc=i=>{
    openInfoModal(i);const d=discs[i];
    if(wantsPlay&&webhookCfg().url){playOnChanger();return done('▶ SENDING SLOT '+slotNum(i)+' TO THE CHANGER',{opened:i,played:true})}
    return done((wantsPlay?'SLOT '+slotNum(i)+' — PRESS ▶ TO PLAY: ':'OPENED: ')+(d[0]+' — '+d[1]).toUpperCase(),{opened:i});
  };
  if(/^(clear|reset|start over)\b|\b(show|see) (me )?(everything|it all|all of (it|them))\b/.test(q)){
    clearAllFilters();$('sortSelect').value='slot';applyFilters();return done('SHOWING EVERYTHING',{cleared:true});
  }
  const sm=/(?:\bslot|\bdisc|\bnumber|#)\s*#?(\d{1,3})\b/.exec(q);
  if(sm){const i=Number(sm[1])-1;if(i>=0&&i<discs.length&&!isSlotEmpty(discs[i]))return openDisc(i);return done('SLOT '+sm[1]+' IS EMPTY OR DOES NOT EXIST',{})}
  if(/^(play |show me |give me )?(a |something |anything )?(random|surprise me|anything|dealer'?s choice)( disc| album| one)?$/.test(q)){uiPickRandom();return done('🎲 PICKING ONE',{random:true})}
  let rest=' '+q+' ';const set={},parts=[],notes=[];
  const take=re=>{const m=re.exec(rest);if(m)rest=rest.replace(m[0],' ');return m};
  if(take(/\b(haven'?t|have not|not|never) (i )?(been )?(heard|played|listened to)?\b.*\b(this year|in a year|in ages|lately|recently|in a while|for a while)\b|\b(neglected|forgotten|dusty)\b/)){set.flag='_stale';parts.push('NOT PLAYED IN A YEAR')}
  else if(take(/\b(never|haven'?t|have not) (i )?(ever )?(been )?(played|heard|listened to)\b|\bunplayed\b|\bnever played\b/)){set.flag='_unplayed';parts.push('NEVER PLAYED')}
  else if(take(/\b(loaned|lent|on loan)( out)?\b/)){set.flag='loaned';parts.push('LOANED OUT')}
  else if(take(/\bbroken\b/)){set.flag='broken';parts.push('BROKEN')}
  else if(take(/\bwish ?list\b/)){set.flag='wishlist';parts.push('WISHLIST')}
  else if(take(/\bduplicates?\b|\bdupes?\b/)){set.flag='duplicate';parts.push('DUPLICATES')}
  else if(take(/\b(missing|no|without)( a| any)? (art|covers?|artwork)\b/)){set.flag='_noart';parts.push('MISSING ART')}
  else if(take(/\bempty( slots?)?\b/)){set.flag='_empty';parts.push('EMPTY SLOTS')}
  let dec=null,dm=take(/\b(19|20)(\d)0'?s\b/);
  if(dm)dec=dm[1]+dm[2]+'0s';
  else if((dm=take(/\b(\d)0'?s\b/)))dec=(Number(dm[1])<=2?'20':'19')+dm[1]+'0s';
  else for(const w in ASK_DECADE)if(take(new RegExp('\\b'+w+'\\b'))){dec=ASK_DECADE[w];break}
  if(dec){if([...$('decadeFilter').options].some(o=>o.value===dec)){set.decade=dec;parts.push(dec.toUpperCase())}else notes.push('NO DISCS FROM THE '+dec.toUpperCase())}
  const origins=[...$('originFilter').options].map(o=>o.value).filter(Boolean);
  let cc=null;
  for(const w in ASK_DEMONYM)if(new RegExp('\\b'+w+'\\b').test(rest)){cc=ASK_DEMONYM[w];take(new RegExp('\\b'+w+'\\b'));break}
  if(!cc)for(const code of origins){const nm=countryName(code).toLowerCase();if(nm&&rest.includes(' '+nm+' ')){cc=code;rest=rest.replace(' '+nm+' ',' ');break}}
  if(cc){if(origins.includes(cc)){set.country=cc;parts.push(countryName(cc).toUpperCase())}else notes.push('NO DISCS FROM '+countryName(cc).toUpperCase())}
  const genres=[...$('genreFilter').options].map(o=>o.value).filter(Boolean).sort((a,b)=>b.length-a.length);
  for(const g of genres){const gl=' '+g.toLowerCase()+' ';if(rest.includes(gl)){set.genre=g;parts.push(g.toUpperCase());rest=rest.replace(gl,' ');break}}
  let sort=null;
  if(take(/\b(most played|play(ed)? the most|favou?rites?|top)\b/))sort=['plays','MOST PLAYED FIRST'];
  else if(take(/\b(recently|last|just) played\b/))sort=['recent','RECENTLY PLAYED FIRST'];
  else if(take(/\b(newest|recently added|latest additions?|just added)\b/))sort=['added','NEWEST FIRST'];
  else if(take(/\b(oldest|by year|in order of year)\b/))sort=['year','BY YEAR'];
  const mood=take(/\b(slow|fast|heavy|mellow|quiet|loud|chill|upbeat|sad|happy|dark|soft|aggressive|relaxing)\b/);
  if(mood)notes.push('I CAN\'T TELL WHAT IS '+mood[1].toUpperCase()+' — THERE IS NO TEMPO OR MOOD DATA');
  const term=rest.replace(ASK_STOP,' ').replace(/\s+/g,' ').trim();
  const hasFilter=Object.keys(set).length>0;
  if(term&&!hasFilter){
    const hits=[];discs.forEach((d,i)=>{if(!isSlotEmpty(d)&&(d[0]+' '+d[1]).toLowerCase().includes(term))hits.push(i)});
    const exact=hits.filter(i=>discs[i][1].toLowerCase()===term||discs[i][1].toLowerCase().replace(/\s*\(.*\)$/,'')===term);
    if(wantsOpen&&(hits.length===1||exact.length===1))return openDisc(exact.length===1?exact[0]:hits[0]);
    if(!hits.length&&!sort)return done('NOTHING IN THE CRATE MATCHES "'+term.toUpperCase()+'"'+(notes.length?' · '+notes.join(' · '):''),{count:0,term});
  }
  if(!term&&!hasFilter&&!sort)return done(notes.length?notes.join(' · '):'I DIDN\'T CATCH A REQUEST IN THAT. TRY "NORWAY FROM THE 90S" OR "PLAY SLOT 40"',{count:null});
  clearAllFilters();
  if(set.flag)$('flagFilter').value=set.flag;if(set.decade)$('decadeFilter').value=set.decade;if(set.country)$('originFilter').value=set.country;if(set.genre)$('genreFilter').value=set.genre;
  if(term){$('searchInput').value=term;parts.push('"'+term.toUpperCase()+'"')}
  if(sort){$('sortSelect').value=sort[0];parts.push(sort[1])}
  applyFilters();
  const f=currentFilters();let count=0;for(let i=0;i<discs.length;i++)if(matches(i,f)&&!isSlotEmpty(discs[i]))count++;
  return done('SHOWING: '+(parts.join(' · ')||'EVERYTHING')+' — '+count+' DISC'+(count===1?'':'S')+(notes.length?' · '+notes.join(' · '):''),{count,set,term,sort:sort&&sort[0]});
}
var askRec=null;
function askListen(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR)return;
  const btn=$('askMicBtn'),inp=$('searchInput');
  if(askRec){try{askRec.stop()}catch(e){}return}
  const rec=new SR();askRec=rec;rec.lang=navigator.language||'en-US';rec.interimResults=false;rec.maxAlternatives=1;
  const ph=inp.placeholder;
  rec.onstart=()=>{btn.classList.add('on');inp.placeholder='LISTENING… SAY "NORWAY FROM THE 90S" OR "PLAY SLOT 40"'};
  rec.onresult=e=>{const t=e.results[0]&&e.results[0][0]&&e.results[0][0].transcript;if(t){inp.value=t;askCrate(t)}};
  rec.onerror=e=>{toast(e.error==='not-allowed'||e.error==='service-not-allowed'?'MICROPHONE BLOCKED — ALLOW IT FOR THIS SITE TO ASK BY VOICE':e.error==='no-speech'?'I DIDN\'T HEAR ANYTHING':'VOICE DID NOT WORK HERE ('+String(e.error).toUpperCase()+') — TYPE IT AND PRESS ENTER',5000)};
  rec.onend=()=>{btn.classList.remove('on');inp.placeholder=ph;askRec=null};
  try{rec.start()}catch(e){askRec=null}
}
(function wireAsk(){
  const inp=$('searchInput');if(!inp)return;
  inp.addEventListener('keydown',e=>{if(e.key==='Enter'&&askIsCommand(inp.value)){e.preventDefault();askCrate(inp.value);inp.blur()}});
  if(window.SpeechRecognition||window.webkitSpeechRecognition){$('askMicBtn').style.display='';document.body.classList.add('has-voice')}
})();
