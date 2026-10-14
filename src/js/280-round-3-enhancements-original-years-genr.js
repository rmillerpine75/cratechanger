
// ════════════════════════════════════════════════════════════════
// ROUND-3 ENHANCEMENTS — original years, genres, band origin, notes/loans, undo, multi-tab sync
// ════════════════════════════════════════════════════════════════
const CACHE_SCHEMA=2;   // v2 lookup entries carry year (original), editionYear, type, rgId, artistId
const ARTIST_KEY='cc_artist_cache_v1';
// Older (v1) entries still work, but get re-looked-up once to add original year / type / genres.
function needsUpgrade(e){
  return !!e&&!e.skipped&&(e.mbTried===true||(Array.isArray(e.tracks)&&e.tracks.length>0))&&(e.v||1)<CACHE_SCHEMA;
}

// ── artist cache: genres + band origin, one MusicBrainz request per ARTIST (not per disc) ──
function loadArtistCache(){
  try{const c=JSON.parse(safeGet(ARTIST_KEY));if(c&&typeof c==='object'&&!Array.isArray(c))return c}catch(e){}
  return {};
}
function saveArtistCache(){return safeSet(ARTIST_KEY,JSON.stringify(artistCache))}
let artistCache=loadArtistCache();
const artistInflight=new Map();
function ensureArtist(id){
  if(!id||!/^[\w-]{1,64}$/.test(id))return Promise.resolve(null);
  if(artistCache[id])return Promise.resolve(artistCache[id]);
  if(artistInflight.has(id))return artistInflight.get(id);
  const p=(async()=>{
    const d=await mbFetchJson('https://musicbrainz.org/ws/2/artist/'+encodeURIComponent(id)+'?inc=genres&fmt=json');
    if(!d){artistCache[id]={missing:true,genres:[],country:null,fetchedAt:Date.now()};saveArtistCache();return artistCache[id]}
    const genres=(Array.isArray(d.genres)?d.genres:[]).slice().sort((a,b)=>(b.count||0)-(a.count||0)).map(g=>g.name).filter(Boolean).slice(0,6);
    const codes=d.area&&d.area['iso-3166-1-codes'];
    const info={name:d.name||'',country:d.country||(Array.isArray(codes)&&codes[0])||null,area:(d.area&&d.area.name)||null,genres,fetchedAt:Date.now()};
    artistCache[id]=info;saveArtistCache();
    return info;
  })();
  artistInflight.set(id,p);
  p.then(()=>artistInflight.delete(id),()=>artistInflight.delete(id));
  return p;
}

// ── info-modal helpers ──
function loanDays(m){
  if(!m.loanDate)return null;
  const t=new Date(m.loanDate).getTime();
  return isNaN(t)?null:Math.max(0,Math.floor((Date.now()-t)/86400000));
}
function renderTagsFor(data,slot){
  const el=$('modalTags');
  const ov=(slot!==null&&slot!==undefined)?getOverride(slot):null;
  if(!data&&!ov){el.innerHTML='';return}
  const ovYear=(ov&&/^\d{4}$/.test(ov.year||''))?ov.year:null;
  const parts=[];
  let yearShown=false;
  ((data&&data.tags)||[]).forEach(t=>{
    if(/^\d{4}$/.test(t)){parts.push(`<span class="tag"${ovYear?' title="Year entered by you"':''}>${escH(ovYear||t)}</span>`);yearShown=true}
    else if(/^[A-Z]{2}$/.test(t))parts.push(`<span class="tag" title="Country of this pressing">PRESS ${escH(t)}</span>`);
    else parts.push(`<span class="tag">${escH(t)}</span>`);
  });
  if(ovYear&&!yearShown)parts.unshift(`<span class="tag" title="Year entered by you">${escH(ovYear)}</span>`);
  if(!ovYear&&data&&data.editionYear&&data.year&&data.editionYear!==data.year)parts.push(`<span class="tag" title="Year of this specific pressing">ED. ${escH(data.editionYear)}</span>`);
  const a=data&&data.artistId&&artistCache[data.artistId];
  if(a&&a.country)parts.push(`<span class="tag" title="Where the band is from (${escH(a.country)})">ORIGIN ${escH(countryName(a.country))}</span>`);
  const genres=(slot!==null&&slot!==undefined)?effectiveGenres(slot):((a&&a.genres)||[]);
  genres.slice(0,6).forEach(g=>parts.push(`<span class="tag genre-tag">${escH(g)}</span>`));
  el.innerHTML=parts.join('');
}
function renderNotesFor(i){
  const el=$('modalNotes');const m=getMeta(i);const bits=[];
  if(m.flags.includes('loaned')||m.loanedTo){
    const days=loanDays(m);
    bits.push(`<div class="loan-line${days!==null&&days>30?' overdue':''}">LOANED TO <span>${escH(m.loanedTo||'?')}</span>${m.loanDate?` SINCE <span>${escH(m.loanDate)}</span> (${days} DAYS)`:''}</div>`);
  }
  if(m.notes)bits.push(`<div class="notes-text">${escH(m.notes)}</div>`);
  el.innerHTML=bits.join('');
  el.style.display=bits.length?'':'none';
}
// After a cached render: quietly upgrade old entries / fetch missing artist info, re-render if still on this disc.
function followUpLookups(data,artist,album,i,token){
  if(!data||data.skipped)return;
  if(needsUpgrade(data)){
    ensureData(artist,album,true,true).then(d=>{
      populateExtraFilters();
      if(token!==modalToken)return;
      renderModalData(d,artist,album,i);
      updateSlotArtIfNeeded(artist+'|'+album);
    }).catch(()=>{});
  }else if(data.artistId&&!artistCache[data.artistId]){
    ensureArtist(data.artistId).then(()=>{populateExtraFilters();if(token===modalToken)renderTagsFor(data,i)}).catch(()=>{});
  }
}

// ── UNDO / REDO HISTORY (last 25 actions): edits, clears, swaps, batch flags, editions, imports, re-sorts, data-check fixes ──
const UNDO_MAX=25;
let undoStack=[],redoStack=[],undoTimer=null;
function snapshot(){
  return {discs:JSON.stringify(discs),meta:JSON.stringify(meta),np:JSON.stringify(nowPlaying),cache:JSON.stringify(mbCache),art:new Map(customArt),shelf:JSON.stringify(shelf),shelfArt:new Map(shelfArt)};
}
function showUndoBar(){
  const top=undoStack[undoStack.length-1];
  if(!top&&!redoStack.length){dismissUndo();return}
  $('undoText').textContent=top?top.label+(undoStack.length>1?`  ·  ${undoStack.length} STEPS`:''):'';
  $('undoBtn').style.display=top?'':'none';
  $('redoBtn').style.display=redoStack.length?'':'none';
  $('undoBar').classList.add('visible');
  clearTimeout(undoTimer);
  undoTimer=setTimeout(dismissUndo,10000);
}
function offerUndo(label,snap){
  undoStack.push({label,snap});
  if(undoStack.length>UNDO_MAX)undoStack.shift();
  redoStack=[];
  showUndoBar();
}
// hides the bar only; Ctrl+Z / Ctrl+Shift+Z keep working through the history
function dismissUndo(){
  clearTimeout(undoTimer);
  const b=$('undoBar');if(b)b.classList.remove('visible');
}
function clearUndoHistory(){undoStack=[];redoStack=[];dismissUndo()}
async function restoreSnapshot(snap){
  discs=JSON.parse(snap.discs);meta=JSON.parse(snap.meta);mbCache=JSON.parse(snap.cache);
  try{nowPlaying=JSON.parse(snap.np)}catch(e){nowPlaying=null}
  for(const k of [...customArt.keys()])if(!snap.art.has(k))await deleteCustomArt(k);
  for(const [k,v] of snap.art)if(customArt.get(k)!==v)await putCustomArt(k,v);
  if(snap.shelf!==undefined){shelf=JSON.parse(snap.shelf);await syncShelfArt(snap.shelfArt||new Map());saveShelf()}
  if(nowPlaying)safeSet(NP_KEY,JSON.stringify(nowPlaying));else{try{localStorage.removeItem(NP_KEY)}catch(e){}}
  saveDiscs();saveMeta();saveMbCache();
  selectedSlots.clear();
  buildGrid();
}
async function performUndo(){
  const step=undoStack.pop();if(!step)return;
  redoStack.push({label:step.label,snap:snapshot()});
  await restoreSnapshot(step.snap);
  toast('UNDONE: '+step.label);
  showUndoBar();
}
async function performRedo(){
  const step=redoStack.pop();if(!step)return;
  undoStack.push({label:step.label,snap:snapshot()});
  await restoreSnapshot(step.snap);
  toast('REDONE: '+step.label);
  showUndoBar();
}

// ── MULTI-TAB SYNC: another tab (or another copy of this file) changed the shared storage ──
let syncTimer=null,cacheSyncTimer=null,artSyncTimer=null;
function bumpArtRev(){scheduleAutoBackup();safeSet('cc_art_rev',Date.now()+':'+Math.random().toString(36).slice(2,8))}
async function reloadCustomArt(){
  if(!artDB)return;
  const fresh=new Map();
  await new Promise(resolve=>{
    try{
      const tx=artDB.transaction('art','readonly');
      const req=tx.objectStore('art').openCursor();
      req.onsuccess=()=>{const c=req.result;if(c){fresh.set(Number(c.key),c.value);c.continue()}};
      tx.oncomplete=resolve;tx.onerror=tx.onabort=resolve;
    }catch(e){resolve()}
  });
  customArt.clear();
  for(const [k,v] of fresh)customArt.set(k,v);
}
function syncFromStorage(){
  discs=loadDiscs();meta=loadMeta();
  try{nowPlaying=JSON.parse(safeGet(NP_KEY))}catch(e){nowPlaying=null}
  if(nowPlaying&&typeof nowPlaying.index!=='number')nowPlaying=null;
  clearUndoHistory();   // undo snapshots from before the other tab's change would silently revert it
  buildGrid();
  toast($('editModal').classList.contains('open')
    ?'⚠ ANOTHER TAB CHANGED THE COLLECTION — SAVING THIS EDIT WILL OVERWRITE THAT SLOT'
    :'SYNCED CHANGES FROM ANOTHER TAB',5000);
}
window.addEventListener('storage',e=>{
  if(e.storageArea&&e.storageArea!==localStorage)return;
  if(e.key===DISC_KEY||e.key===META_KEY||e.key===NP_KEY){
    clearTimeout(syncTimer);syncTimer=setTimeout(syncFromStorage,300);
  }else if(e.key===CACHE_KEY||e.key===ARTIST_KEY){
    // lookups finished in another tab: pick them up quietly (no toast spam during a FETCH ART run there)
    clearTimeout(cacheSyncTimer);
    cacheSyncTimer=setTimeout(()=>{
      mbCache=loadMbCache();artistCache=loadArtistCache();
      new Set(discs.filter(d=>!isSlotEmpty(d)).map(keyOf)).forEach(updateSlotArtIfNeeded);
    },400);
  }else if(e.key==='cc_art_rev'){
    clearTimeout(artSyncTimer);artSyncTimer=setTimeout(()=>reloadCustomArt().then(buildGrid),300);
  }
});

// Stats rows are delegated (no inline JS built from disc titles)
$('statsContent').addEventListener('click',e=>{
  const ed=e.target.closest('[data-edit-slot]');
  if(ed){closeStats();openEditModal(null,Number(ed.dataset.editSlot));return}
  const op=e.target.closest('[data-open-slot]');
  if(op){closeStats();openInfoModal(Number(op.dataset.openSlot))}
});
