
// ── FOLLOW YOUR PLAYER — ListenBrainz "playing now" (free, no microphone, nothing added to the collection) ──
// The listening room asks ListenBrainz what the account is playing and shows that album exactly like an
// AudD identification: one of your CDs opens as that disc; anything else is shown as "not in your changer".
const LB_KEY='cc_lb_v1',LB_POLL_MS=15000,LB_RECENT_MS=12*60000;
var lbState={on:false,timer:0,busy:false,lastKey:'',lastAlbum:'',fails:0};
function lbCfg(){try{const c=JSON.parse(safeGet(LB_KEY));return c&&typeof c.user==='string'?{user:c.user,follow:!!c.follow}:{user:'',follow:false}}catch(e){return {user:'',follow:false}}}
function lbUser(){return lbCfg().user}
function lbSave(c){if(c.user)safeSet(LB_KEY,JSON.stringify(c));else{try{localStorage.removeItem(LB_KEY)}catch(e){}}}
function saveLbUser(){
  const u=$('lbUser').value.trim();
  if(u&&(u.length>64||/[\u0000-\u001f\/\\?#]/.test(u))){alert('That doesn\'t look like a ListenBrainz username.');return false}
  lbSave({user:u,follow:u?lbCfg().follow:false});
  $('lbUser').value='';renderLbStatus();
  if(!u&&lbState.on)setPlayerFollow(false);
  toast(u?'♫ LISTENBRAINZ USERNAME SAVED ✓':'♫ LISTENBRAINZ USERNAME REMOVED');
  return true;
}
function renderLbStatus(){
  const el=$('lbStatus');if(!el)return;const u=lbUser();
  el.textContent=u?`FOLLOWING ${u.toUpperCase()} (KEPT IN THIS BROWSER ONLY) — TURN IT ON WITH ♫ PLAYER IN THE LISTENING ROOM`:'NO USERNAME YET — ♫ PLAYER IS OFF';
}
// replaceable in tests
var lbGet=async function(url){
  const r=await fetch(url,{headers:{Accept:'application/json'}});
  if(r.status===404)throw new Error('no such ListenBrainz user');
  if(r.status===401||r.status===403)throw new Error('that ListenBrainz profile is private');
  if(r.status===429)throw new Error('ListenBrainz is rate-limiting — it will retry');
  if(!r.ok)throw new Error('ListenBrainz answered '+r.status);
  return r.json();
};
// the parts of a ListenBrainz listen we use, in the same shape as an AudD answer
function lbInfo(l){
  const tm=(l&&l.track_metadata)||{},ai=tm.additional_info||{},mm=tm.mbid_mapping||{};
  const credit=Array.isArray(mm.artists)?mm.artists.map(a=>String(a.artist_credit_name||'')+String(a.join_phrase||'')).join('').trim():'';
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const art=uuid.test(mm.caa_release_mbid||'')&&/^\d+$/.test(String(mm.caa_id||''))?`https://coverartarchive.org/release/${mm.caa_release_mbid}/${mm.caa_id}-500.jpg`:'';
  const sp=String(ai.spotify_id||ai.origin_url||'');
  return {artist:String(tm.artist_name||credit||''),title:String(tm.track_name||mm.recording_name||''),album:String(tm.release_name||mm.release_name||''),
    released:'',label:'',art,timecode:0,durationMs:Number(ai.duration_ms||(ai.duration?ai.duration*1000:0)||0),
    links:{apple:'',spotify:/^https:\/\/open\.spotify\.com\//.test(sp)?sp:'',songlink:''},
    player:String(ai.media_player||ai.submission_client||'').slice(0,40)};
}
async function lbFetchNow(user){
  const base='https://api.listenbrainz.org/1/user/'+encodeURIComponent(user);
  const now=await lbGet(base+'/playing-now');
  const a=now&&now.payload&&now.payload.listens&&now.payload.listens[0];
  if(a)return {listen:a,live:true};
  // players that only report a song once it has (half) played: use the last one if it is recent
  const rec=await lbGet(base+'/listens?count=1');
  const b=rec&&rec.payload&&rec.payload.listens&&rec.payload.listens[0];
  if(b&&b.listened_at&&Date.now()-b.listened_at*1000<LB_RECENT_MS)return {listen:b,live:false};
  return null;
}
async function lbTick(){
  if(!lbState.on||lbState.busy)return null;
  if(!$('roomModal').classList.contains('open')){setPlayerFollow(false,true);return null}
  if(ident.busy)return null;
  const user=lbUser();if(!user){setPlayerFollow(false);return null}
  lbState.busy=true;
  try{
    const r=await lbFetchNow(user);lbState.fails=0;
    if(!lbState.on)return null;
    if(!r){if(lbState.lastKey!=='-'){lbState.lastKey='-';setIdStatus('♫ PLAYER: NOTHING PLAYING ON '+user.toUpperCase()+'\'S LISTENBRAINZ RIGHT NOW')}return null}
    const info=lbInfo(r.listen);
    if(!info.artist||!info.title&&!info.album)return null;
    const key=normT(info.artist)+'|'+normT(info.album)+'|'+normT(info.title);
    if(key===lbState.lastKey)return null;
    lbState.lastKey=key;
    const albumKey=normT(info.artist)+'|'+normT(info.album);
    const tag='♫ '+(info.player?info.player.toUpperCase():'YOUR PLAYER')+(r.live?'':' (LAST PLAYED)');
    if(info.album&&albumKey===lbState.lastAlbum){     // same album, next song: just move the highlight
      ident.last=info;$('roomSong').textContent='♪ '+info.title;$('roomSong').style.display=info.title?'':'none';highlightPlayingTrack(info.title);
      return {same:true,info};
    }
    lbState.lastAlbum=albumKey;
    const out=await showIdentifiedInfo(info,tag);
    return out;
  }catch(e){
    lbState.fails++;setIdStatus('♫ PLAYER: '+String((e&&e.message)||e).toUpperCase());
    if(/no such|private/i.test(String(e&&e.message))||lbState.fails>=8)setPlayerFollow(false,true);
    return null;
  }finally{lbState.busy=false}
}
function updateLbUi(){const b=$('roomLbBtn');if(!b)return;b.classList.toggle('on',lbState.on);b.textContent=lbState.on?'♫ PLAYER: ON':'♫ PLAYER: OFF';b.setAttribute('aria-pressed',String(lbState.on))}
// keepPref: stopping because the room closed (or an error) must not forget that the user wants it on
function setPlayerFollow(on,keepPref){
  clearInterval(lbState.timer);lbState.timer=0;
  if(!on){lbState.on=false;if(!keepPref){const c=lbCfg();if(c.user)lbSave({user:c.user,follow:false})}updateLbUi();return false}
  const c=lbCfg();
  if(!c.user){lbState.on=false;updateLbUi();toast('♫ PLAYER NEEDS YOUR LISTENBRAINZ USERNAME — ⚙ SETTINGS',5000);openSettings();return false}
  if(ident.auto)setIdentifyAuto(false);            // one source at a time, so they don't fight over the screen
  lbState.on=true;lbState.lastKey='';lbState.lastAlbum='';lbState.fails=0;lbSave({user:c.user,follow:true});updateLbUi();
  setIdStatus('♫ PLAYER: ASKING LISTENBRAINZ WHAT '+c.user.toUpperCase()+' IS PLAYING…');
  lbState.timer=setInterval(lbTick,LB_POLL_MS);
  lbTick();
  return true;
}
// the room remembers: if ♫ PLAYER was on last time, it comes back on when the room opens
var _lbOpenRoom=openRoom;
openRoom=function(i){_lbOpenRoom(i);if($('roomModal').classList.contains('open')&&!lbState.on&&lbCfg().follow&&lbCfg().user)setPlayerFollow(true)};
var _lbCloseRoom=closeRoom;
closeRoom=function(){if(lbState.on)setPlayerFollow(false,true);_lbCloseRoom()};
var _lbSetAuto=setIdentifyAuto;
setIdentifyAuto=async function(on){if(on&&lbState.on)setPlayerFollow(false);return _lbSetAuto(on)};
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&lbState.on)lbTick()});
// LISTEN ▸ WHAT'S PLAYING? — one step: open the room and follow whichever source is set up
function whatsPlaying(){
  openRoom();
  if(!$('roomModal').classList.contains('open'))return;
  if(lbUser()){if(!lbState.on)setPlayerFollow(true);return}
  if(auddToken()){if(!ident.auto)setIdentifyAuto(true);return}
  toast('SET UP ♫ FOLLOW YOUR PLAYER (FREE) OR 🔎 AUDD IN ⚙ SETTINGS',6000);openSettings();
}
updateLbUi();
