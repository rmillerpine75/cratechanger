
// ════════════════════════════════════════════════════════════════
// INFO MODAL
// ════════════════════════════════════════════════════════════════
let currentArtUrl=null;let openLyricsTrack=null;
let modalToken=0;      // guards against slow lookups landing in a different disc's modal
let lyricsToken=0;
let currentMbUrl=null;

function openInfoModal(i){
  const disc=discs[i];if(!disc)return;
  const token=++modalToken;
  currentModalIndex=i;
  rememberFocus();
  const [artist,album]=disc;const m=getMeta(i);

  $('modalDiscNum').textContent='DISC '+String(i+1).padStart(3,'0');
  $('modalArtist').textContent=artist||'—';
  $('modalAlbum').textContent=album||'—';
  $('modalTags').innerHTML='';
  $('trackList').innerHTML='<div class="no-results">Loading...</div>';
  $('lyricsPanel').classList.remove('open');
  $('lyricsText').textContent='';
  $('previewPlayer').classList.remove('visible');
  const audio=$('previewAudio');audio.pause();audio.removeAttribute('src');
  $('similarSection').style.display='none';$('similarList').innerHTML='';
  openLyricsTrack=null;lyricsToken++;

  // Art
  $('modalArtWrap').innerHTML='<div class="modal-art-placeholder">💿</div>';
  currentArtUrl=null;currentMbUrl=null;
  $('downloadArtBtn').style.display='none';
  $('mbLinkBtn').style.display='none';
  $('discogsBtn').style.display='none';
  $('refreshBtn').style.display='none';
  $('editionBtn').style.display='none';

  // Condition buttons
  document.querySelectorAll('.cond-btn').forEach(b=>{b.classList.toggle('active-cond',b.dataset.c===m.condition)});

  // Play history
  const ph=m.playHistory||[];
  const pRow=$('playHistoryRow');
  if(ph.length){
    const last=new Date(ph[ph.length-1]).toLocaleDateString();
    pRow.innerHTML=`PLAYED <span>${ph.length}×</span> — LAST <span>${last}</span>`;
  } else pRow.innerHTML='NEVER PLAYED';
  renderNotesFor(i);
  renderValueFor(i);
  $('playChangerBtn').style.display=webhookCfg().url?'':'none';
  onDiscOpened(i);
  if(m.addedAt)pRow.insertAdjacentHTML('beforeend',' · ADDED <span>'+escH(String(m.addedAt).slice(0,10))+'</span>');

  $('loadingPulse').style.display='';
  $('infoModal').classList.add('open');
  $('infoModal').querySelector('.modal-close').focus();

  // custom art needs no network
  if(customArt.has(i))renderArt([customArt.get(i)],keyOf(disc));

  ensureData(artist,album).then(data=>{
    if(token!==modalToken)return;
    renderModalData(data,artist,album,i);
    updateSlotArtIfNeeded(keyOf(disc));
    followUpLookups(data,artist,album,i,token);
  }).catch(()=>{if(token===modalToken)renderModalData(null,artist,album,i)});
}

async function refreshCurrentDisc(){
  if(currentModalIndex===null)return;
  const i=currentModalIndex;const disc=discs[i];if(!disc)return;
  const [artist,album]=disc;
  const token=++modalToken;
  $('trackList').innerHTML='<div class="no-results">Refreshing...</div>';
  $('loadingPulse').style.display='';
  $('refreshBtn').style.display='none';
  try{
    const data=await ensureData(artist,album,true);
    if(token!==modalToken)return;
    renderModalData(data,artist,album,i);
    updateSlotArtIfNeeded(keyOf(disc));
  }catch(e){if(token===modalToken)renderModalData(null,artist,album,i)}
}

function renderArt(sources,key){
  if(!sources.length)return;
  const artWrap=$('modalArtWrap');
  const img=document.createElement('img');img.className='modal-art';img.alt='album art';
  artWrap.innerHTML='';artWrap.appendChild(img);
  currentArtUrl=sources[0];
  $('downloadArtBtn').style.display='';
  loadImgWithFallbacks(img,sources,
    ()=>{artWrap.innerHTML='<div class="modal-art-placeholder">💿</div>';currentArtUrl=null;$('downloadArtBtn').style.display='none'},
    src=>{currentArtUrl=src;recordWinner(key,src);setCdLabel($('modalCd'),src)});
}

function renderModalData(data,artist,album,idx){
  $('loadingPulse').style.display='none';
  const slot=idx!==undefined?idx:currentModalIndex;
  const key=artist+'|'+album;
  const ov=(slot!==null&&slot!==undefined)?getOverride(slot):null;

  // Art — custom takes priority
  const sources=[];
  if(slot!==null&&customArt.has(slot))sources.push(customArt.get(slot));
  sources.push(...autoSources(data));
  renderArt(sources,key);

  // Links: MusicBrainz only when it came back as a real MusicBrainz URL; Discogs search always available
  if(data&&data.mbUrl&&/^https:\/\/musicbrainz\.org\//.test(data.mbUrl)){
    currentMbUrl=data.mbUrl;
    const b=$('mbLinkBtn');b.style.display='';b.onclick=()=>window.open(data.mbUrl,'_blank','noopener');
  }
  // exact Discogs release when known (Discogs import, or found during a value lookup); otherwise a search
  const dId=(slot!==null&&slot!==undefined&&getMeta(slot).discogsId)||(valueCache[key]&&valueCache[key].discogsId)||null;
  const dUrl=dId?'https://www.discogs.com/release/'+dId:`https://www.discogs.com/search/?q=${encodeURIComponent(artist+' '+album)}&type=release`;
  const db=$('discogsBtn');db.style.display='';db.onclick=()=>window.open(dUrl,'_blank','noopener');
  $('refreshBtn').style.display=(data&&data.skipped)?'none':'';
  const eb=$('editionBtn');
  eb.style.display=(data&&data.skipped)?'none':'';
  eb.textContent=(data&&data.pinned)?'⇄ EDITION (PINNED)':'⇄ EDITION';

  // Tags (original year, pressing, type, band origin, genres — your overrides win)
  renderTagsFor(data,slot);

  // iTunes preview (https only)
  if(data&&typeof data.previewUrl==='string'&&/^https:\/\//.test(data.previewUrl)){
    $('previewAudio').src=data.previewUrl;
    $('previewPlayer').classList.add('visible');
  }

  // Tracks: a manual tracklist (edit dialog) wins over MusicBrainz. No inline JS is ever built from titles.
  const ovTracks=(ov&&Array.isArray(ov.tracks)&&ov.tracks.length)?ov.tracks.map((t,n)=>({num:n+1,title:t,length:null})):null;
  const tracks=ovTracks||(data&&Array.isArray(data.tracks)?data.tracks:[]);
  const trackList=$('trackList');
  if(!ovTracks&&data&&data.skipped){
    trackList.innerHTML=`<div class="no-results">Placeholder title — lookup skipped. Edit the slot with a real album name, add a manual tracklist, or use DISCOGS to search manually.</div>`;
  }else if(!tracks.length){
    const why=(!data||data.mbTried===false)
      ?'MusicBrainz was unreachable or rate-limited. Hit REFRESH to retry.'
      :'No confident MusicBrainz match for this title. Try ⇄ EDITION, edit the album name, or add a manual tracklist in the edit dialog.';
    trackList.innerHTML=`<div class="no-results">${why}</div>`;
  }else{
    trackList.innerHTML=(ovTracks?'<div class="manual-note">MANUAL TRACKLIST (FROM THE EDIT DIALOG)</div>':'')+tracks.map((t,ti)=>`
    <div class="track-item" data-title="${escH(t.title)}">
      <span class="track-num">${escH(t.num||ti+1)}</span>
      <span class="track-name">${escH(t.title)}</span>
      ${t.length?`<span class="track-duration">${escH(t.length)}</span>`:''}
      <div class="track-icons">
        <button class="track-icon-btn" type="button" title="Lyrics" aria-label="Lyrics" data-act="lyrics">♪</button>
        <button class="track-icon-btn" type="button" title="YouTube" aria-label="YouTube" data-act="yt">▶</button>
      </div>
    </div>`).join('');
  }
  // Related artists
  if(artist&&artist!=='—')fetchSimilarArtists(artist);
}

// Track buttons are delegated: titles from MusicBrainz are only ever read back as plain data.
$('trackList').addEventListener('click',e=>{
  const btn=e.target.closest('.track-icon-btn');if(!btn)return;
  const row=btn.closest('.track-item');if(!row||currentModalIndex===null)return;
  const disc=discs[currentModalIndex];if(!disc)return;
  const title=row.dataset.title;
  if(btn.dataset.act==='lyrics')fetchLyrics(disc[0],title);
  else if(btn.dataset.act==='yt')window.open('https://www.youtube.com/results?search_query='+encodeURIComponent(disc[0]+' '+title),'_blank','noopener');
});
