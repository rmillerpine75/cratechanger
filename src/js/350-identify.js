
// ════════════════════════════════════════════════════════════════
// SONG IDENTIFICATION (AudD) — in the listening room
// ════════════════════════════════════════════════════════════════
// A few seconds of microphone audio go to AudD (your own token). AudD names the song; the album's art, tracklist,
// original year and genres then come from MusicBrainz exactly like your CDs. Albums you own open as that disc.
const AUDD_KEY='cc_audd_v1',AUDD_COUNT_KEY='cc_audd_count';
let ID_CLIP_MS=8000;                         // length of the recording sent for recognition
const ID_MIN_GAP_MS=90000,ID_FALLBACK_MS=240000,ID_QUIET_LV=.012;
const ident={busy:false,auto:false,startedListening:false,timer:0,lastAt:0,nextAt:0,external:null,last:null,gap:{quietSince:0,armed:false,loudSince:0}};

function auddToken(){try{const c=JSON.parse(safeGet(AUDD_KEY));return c&&typeof c.token==='string'?c.token:''}catch(e){return ''}}
function saveAuddToken(){
  const t=$('auddToken').value.trim();
  if(t&&!/^[A-Za-z0-9_-]{10,128}$/.test(t)){alert('That doesn\'t look like an AudD API token (copy it from dashboard.audd.io).');return false}
  if(t)safeSet(AUDD_KEY,JSON.stringify({token:t}));else{try{localStorage.removeItem(AUDD_KEY)}catch(e){}}
  $('auddToken').value='';renderAuddStatus();
  toast(t?'🔎 AUDD TOKEN SAVED ✓':'🔎 AUDD TOKEN REMOVED');
  return true;
}
function auddCountToday(){try{const c=JSON.parse(safeGet(AUDD_COUNT_KEY));return c&&c.day===new Date().toISOString().slice(0,10)?c.n:0}catch(e){return 0}}
function bumpAuddCount(){safeSet(AUDD_COUNT_KEY,JSON.stringify({day:new Date().toISOString().slice(0,10),n:auddCountToday()+1}))}
function renderAuddStatus(){
  const el=$('auddStatus');if(!el)return;
  el.textContent=auddToken()?`TOKEN SAVED (KEPT IN THIS BROWSER ONLY) · ${auddCountToday()} IDENTIFICATION(S) TODAY`:'NO TOKEN YET — IDENTIFY IS OFF';
}

// ── record a short clip from the microphone (reusing the 🎤 LISTEN stream when it's running) ──
async function recordClip(ms){
  if(!window.MediaRecorder)throw new Error('this browser cannot record audio');
  let stream=listen.on&&listen.stream?listen.stream:null,own=false;
  if(!stream){stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});own=true}
  try{
    const types=['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg;codecs=opus'];
    const type=types.find(t=>MediaRecorder.isTypeSupported(t))||'';
    const rec=new MediaRecorder(stream,type?{mimeType:type,audioBitsPerSecond:64000}:undefined);
    const chunks=[];rec.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data)};
    const stopped=new Promise(r=>{rec.onstop=r});
    rec.start(500);
    const t0=Date.now();
    while(Date.now()-t0<ms){setIdStatus(`🔎 LISTENING… ${Math.ceil((ms-(Date.now()-t0))/1000)} S (THIS CLIP GOES TO AUDD)`);await new Promise(r=>setTimeout(r,Math.min(500,ms)))}
    rec.stop();await stopped;
    return new Blob(chunks,{type:rec.mimeType||type||'audio/webm'});
  }finally{if(own)stream.getTracks().forEach(t=>t.stop())}
}
async function auddRecognize(blob){
  const fd=new FormData();
  fd.append('api_token',auddToken());
  fd.append('return','apple_music,spotify,musicbrainz');
  fd.append('file',blob,'clip.'+(/mp4/.test(blob.type)?'m4a':/ogg/.test(blob.type)?'ogg':'webm'));
  const r=await fetchTimeout('https://api.audd.io/',{method:'POST',body:fd},30000);
  let j;try{j=await r.json()}catch(e){throw new Error('AudD answered HTTP '+r.status)}
  bumpAuddCount();
  if(!j||j.status!=='success'){const er=j&&j.error;throw new Error(er?`${er.error_message||'error'} (#${er.error_code})`:'AudD error')}
  return j.result||null;
}
// the parts of AudD's answer we use
function auddInfo(res){
  const am=res.apple_music||{},sp=res.spotify||{};
  const tc=String(res.timecode||'').split(':').map(Number);
  const art=(am.artwork&&am.artwork.url?String(am.artwork.url).replace('{w}x{h}','600x600'):'')||(sp.album&&sp.album.images&&sp.album.images[0]&&sp.album.images[0].url)||'';
  const httpsOnly=u=>/^https:\/\//.test(String(u||''))?String(u):'';
  return {artist:String(res.artist||''),title:String(res.title||''),album:String(res.album||''),
    released:String(res.release_date||''),label:String(res.label||''),art:/^(https:|data:image\/)/.test(art)?art:'',
    timecode:tc.length===2?tc[0]*60+tc[1]:tc.length===3?tc[0]*3600+tc[1]*60+tc[2]:0,
    durationMs:Number(sp.duration_ms||am.durationInMillis||0),
    links:{apple:httpsOnly(am.url),spotify:httpsOnly(sp.external_urls&&sp.external_urls.spotify),songlink:httpsOnly(res.song_link)}};
}
// is it one of your CDs? (same artist, album title at least 85% alike)
function findOwnedMatch(info){
  const a=normT(info.artist),al=normT(parseAlbum(info.album||'').clean||info.album);
  if(!a||!al)return -1;
  let best=-1,bestSim=0;
  discs.forEach((d,i)=>{
    if(isSlotEmpty(d)||isWish(i))return;
    const da=normT(d[0]);if(da!==a&&similarity(da,a)<.9)return;
    const s=similarity(normT(parseAlbum(d[1]).clean||d[1]),al);if(s>bestSim){bestSim=s;best=i}
  });
  return bestSim>=.85?best:-1;
}
function setIdStatus(t){const el=$('roomIdStatus');if(el)el.textContent=t||''}
function highlightPlayingTrack(title){
  const t=normT(title);let hit=false;
  $('roomTracks').querySelectorAll('li').forEach(li=>{
    const s=li.querySelector('.rt-title');const on=!!(t&&s&&(normT(s.textContent)===t||similarity(normT(s.textContent),t)>=.85));
    li.classList.toggle('playing',on&&!hit);if(on)hit=true;
  });
  return hit;
}
function renderRoomLinks(info){
  const el=$('roomLinks');if(!el)return;
  if(!info){el.innerHTML='';return}
  const b=[];
  if(info.links.apple)b.push(`<button class="btn" type="button" data-room-link="${escH(info.links.apple)}">APPLE MUSIC ↗</button>`);
  if(info.links.spotify)b.push(`<button class="btn" type="button" data-room-link="${escH(info.links.spotify)}">SPOTIFY ↗</button>`);
  if(info.links.songlink)b.push(`<button class="btn" type="button" data-room-link="${escH(info.links.songlink)}">ALL SERVICES ↗</button>`);
  if(info.artist)b.push(`<button class="btn" type="button" data-room-link="${escH(metalArchivesUrl(info.artist))}">M-A ↗</button>`);
  if(ident.external===info&&info.album)b.push('<button class="btn" type="button" data-room-wish="1">♥ ADD TO WISHLIST</button>');
  el.innerHTML=b.join('');
}
$('roomLinks').addEventListener('click',e=>{
  const l=e.target.closest('[data-room-link]');if(l){const u=l.dataset.roomLink;if(/^https:\/\//.test(u))window.open(u,'_blank','noopener');return}
  if(e.target.closest('[data-room-wish]'))addIdentifiedToWishlist();
});
function addIdentifiedToWishlist(){
  const info=ident.external;if(!info||!info.album)return;
  const dupe=discs.findIndex(d=>d&&normT(d[0])===normT(info.artist)&&normT(d[1])===normT(info.album));
  if(dupe>=0){toast('ALREADY IN YOUR LIST · SLOT '+slotNum(dupe),3500);return}
  const snap=snapshot();
  let i=discs.findIndex((d,j)=>isSlotEmpty(d)&&!isWish(j));
  if(i<0){discs.push(null);i=discs.length-1}
  discs[i]=[info.artist,info.album];delete meta[i];getMeta(i).flags=['wishlist'];
  saveDiscs();saveMeta();buildGrid();
  offerUndo('WISHLISTED '+info.album,snap);
  toast('♥ ON YOUR WISHLIST · SLOT '+slotNum(i),4000);
}
function showRoomArt(src){
  const img=$('roomCover');img.classList.remove('pending');
  $('roomBg').style.backgroundImage=src?`url("${String(src).replace(/"/g,'%22')}")`:'none';
  setCdLabel($('roomCd'),src||null);
  if(!src){img.style.visibility='hidden';img.removeAttribute('src');return}
  if(img.getAttribute('src')&&img.style.visibility!=='hidden')dissolveImage(img,src);else{img.src=src;img.style.visibility=''}
  paletteFromUrl(src).then(p=>{if(ident.external&&$('roomBg').style.backgroundImage.includes(String(src).slice(0,40)))setDiscVars($('roomModal'),discColors(p))});
}
async function renderRoomExternal(info){
  roomIndex=null;ident.external=info;
  $('roomLabel').textContent='IDENTIFIED · NOT IN YOUR CHANGER';
  $('roomArtist').textContent=info.artist;$('roomAlbum').textContent=info.album||info.title;
  $('roomSong').textContent='♪ '+info.title;$('roomSong').style.display=info.title?'':'none';
  $('roomTags').textContent=[info.released.slice(0,4),info.label].filter(Boolean).join(' · ');
  $('roomTracks').innerHTML='<li class="none">Looking up the album…</li>';
  $('roomCover').classList.add('pending');   // dim the previous cover until this album's art is chosen
  $('roomCd').classList.add('spinning');setDiscVars($('roomModal'),null);
  renderRoomLinks(info);
  // Cover: the ALBUM's own art from MusicBrainz / Cover Art Archive. AudD's Apple Music artwork belongs to whatever
  // release Apple matched the song to (often a compilation), so it is only the fallback.
  if(!info.artist||!info.album){$('roomTracks').innerHTML='<li class="none">No album information</li>';showRoomArt(info.art);return}
  try{
    await ensureData(info.artist,info.album);
    if(ident.external!==info)return;
    const e=mbCache[info.artist+'|'+info.album]||{};
    const tracks=Array.isArray(e.tracks)?e.tracks:[];
    $('roomTracks').innerHTML=tracks.slice(0,24).map(t=>`<li><span class="rt-title">${escH(t.title)}</span>${t.length?`<span class="rt-len">${escH(t.length)}</span>`:''}</li>`).join('')||'<li class="none">No tracklist found for this album</li>';
    const yr=String(e.year||e.date||info.released||'').slice(0,4);
    const genres=(e.artistId&&artistCache[e.artistId]&&artistCache[e.artistId].genres)||[];
    $('roomTags').textContent=[yr,info.label,...genres.slice(0,3)].filter(Boolean).join(' · ');
    highlightPlayingTrack(info.title);
    const albumArt=await firstWorkingSrc(autoSources(e));
    if(ident.external!==info)return;
    showRoomArt(albumArt||info.art);
  }catch(err){
    if(ident.external!==info)return;
    $('roomTracks').innerHTML='<li class="none">Album lookup failed — check your connection</li>';
    showRoomArt(info.art);
  }
}
async function showIdentified(res){
  const info=auddInfo(res);ident.last=info;
  const slot=findOwnedMatch(info);
  if(slot>=0){
    ident.external=null;
    const keep=currentModalIndex;currentModalIndex=slot;
    try{
      if(!(nowPlaying&&nowPlaying.index===slot))setNowPlaying();
      const ph=getMeta(slot).playHistory;const last=ph.length?Date.parse(ph[ph.length-1]):0;
      if(Date.now()-last>30*60000)logPlay();                       // one play per listen, not one per song
    }finally{currentModalIndex=keep}
    renderRoom(slot,true);
    $('roomSong').textContent='♪ '+info.title;$('roomSong').style.display=info.title?'':'none';
    renderRoomLinks(info);
    highlightPlayingTrack(info.title);
    setIdStatus(`🔎 IDENTIFIED · IN YOUR CHANGER · SLOT ${slotNum(slot)} — MARKED NOW PLAYING`);
    return {slot,info};
  }
  await renderRoomExternal(info);
  setIdStatus('🔎 IDENTIFIED · NOT IN YOUR CHANGER');
  return {slot:-1,info};
}
async function identifyNow(fromAuto){
  if(ident.busy)return null;
  if(!auddToken()){toast('SONG IDENTIFICATION NEEDS YOUR AUDD TOKEN — ⚙ SETTINGS',5000);if(!fromAuto)openSettings();return null}
  ident.busy=true;ident.lastAt=Date.now();updateIdUi();
  try{
    const blob=await recordClip(ID_CLIP_MS);
    setIdStatus('🔎 IDENTIFYING…');
    const res=await auddRecognize(blob);
    if(!res){setIdStatus('🔎 NO MATCH — TRY AGAIN WHEN THE MUSIC IS LOUDER OR CLEARER');planNextIdentify(null);return null}
    const out=await showIdentified(res);
    planNextIdentify(out.info);
    return out;
  }catch(e){setIdStatus('🔎 IDENTIFY FAILED: '+String((e&&e.message)||e).toUpperCase());planNextIdentify(null);return null}
  finally{ident.busy=false;updateIdUi();renderAuddStatus()}
}
// AUTO: check again just after this song should end (AudD tells us where in the song the clip was), or after a silence gap
function planNextIdentify(info,now=Date.now()){
  let wait=ID_FALLBACK_MS;
  if(info&&info.durationMs>0){const remain=info.durationMs-info.timecode*1000-ID_CLIP_MS;wait=Math.max(20000,remain+8000)}
  ident.nextAt=now+wait;return wait;
}
function songChangeDetector(lv,now){
  const g=ident.gap;
  if(lv<ID_QUIET_LV){if(!g.quietSince)g.quietSince=now;if(now-g.quietSince>1200)g.armed=true;g.loudSince=0;return false}
  g.quietSince=0;
  if(g.armed){if(!g.loudSince)g.loudSince=now;if(now-g.loudSince>5000){g.armed=false;g.loudSince=0;return true}}
  return false;
}
function autoTick(){
  if(!ident.auto)return;
  if(!$('roomModal').classList.contains('open')){setIdentifyAuto(false);return}
  const now=Date.now();
  const changed=songChangeDetector(listen.on?listen.lv:0,now);
  if(ident.busy||now-ident.lastAt<ID_MIN_GAP_MS)return;
  if(!listen.on||listen.lv<ID_QUIET_LV)return;                 // nothing playing: don't spend a request
  if(changed||(ident.nextAt&&now>=ident.nextAt))identifyNow(true);
}
async function setIdentifyAuto(on){
  clearInterval(ident.timer);ident.timer=0;
  if(!on){
    ident.auto=false;
    if(ident.startedListening&&listen.on)stopListening();
    ident.startedListening=false;updateIdUi();return false;
  }
  if(!auddToken()){ident.auto=false;updateIdUi();toast('AUTO IDENTIFY NEEDS YOUR AUDD TOKEN — ⚙ SETTINGS',5000);openSettings();return false}
  if(!listen.on){const ok=await startListening();if(!ok){ident.auto=false;updateIdUi();return false}ident.startedListening=true}
  ident.auto=true;ident.gap={quietSince:0,armed:false,loudSince:0};updateIdUi();
  ident.timer=setInterval(autoTick,500);
  identifyNow(true);
  return true;
}
function updateIdUi(){
  const b=$('roomIdBtn'),a=$('roomAutoBtn');if(!b||!a)return;
  b.classList.toggle('busy',ident.busy);b.textContent=ident.busy?'🔎 IDENTIFYING…':'🔎 IDENTIFY';b.disabled=ident.busy;
  a.classList.toggle('on',ident.auto);a.textContent=ident.auto?'AUTO: ON':'AUTO: OFF';
}

