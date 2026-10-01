
// ════════════════════════════════════════════════════════════════
// CONDITION / PLAY HISTORY / NOW PLAYING
// ════════════════════════════════════════════════════════════════
function setCondition(c){
  if(currentModalIndex===null)return;
  const m=getMeta(currentModalIndex);
  m.condition=(m.condition===c)?'':c;
  saveMeta();
  document.querySelectorAll('.cond-btn').forEach(b=>b.classList.toggle('active-cond',b.dataset.c===m.condition));
  buildGrid();toast('CONDITION SAVED');
}

function logPlay(){
  if(currentModalIndex===null)return;
  const m=getMeta(currentModalIndex);
  if(!m.playHistory)m.playHistory=[];
  m.playHistory.push(new Date().toISOString());
  saveMeta();
  const ph=m.playHistory;
  const last=new Date(ph[ph.length-1]).toLocaleDateString();
  document.getElementById('playHistoryRow').innerHTML=`PLAYED <span>${ph.length}×</span> — LAST <span>${last}</span>`;
  toast('PLAY LOGGED');
}

function setNowPlaying(){
  if(currentModalIndex===null)return;
  const disc=discs[currentModalIndex];
  nowPlaying={index:currentModalIndex,artist:disc[0],album:disc[1]};
  localStorage.setItem(NP_KEY,JSON.stringify(nowPlaying));
  buildGrid();toast('▶ NOW PLAYING SET');
}

function clearNowPlaying(){
  nowPlaying=null;localStorage.removeItem(NP_KEY);
  document.getElementById('nowPlayingBanner').classList.remove('visible');
  buildGrid();
}

// Always derived from the CURRENT disc in that slot, so edits show up immediately (it used to show a stored copy).
function updateNowPlayingBanner(){
  const b=$('nowPlayingBanner');
  const d=nowPlaying?discs[nowPlaying.index]:null;
  if(!nowPlaying||isSlotEmpty(d)){b.classList.remove('visible');return;}
  b.classList.add('visible');
  $('npDisc').textContent='▶ DISC '+String(nowPlaying.index+1).padStart(3,'0');
  $('npText').textContent=(d[0]||'?')+' — '+(d[1]||'?');
}
