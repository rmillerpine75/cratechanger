
// ════════════════════════════════════════════════════════════════
// LYRICS
// ════════════════════════════════════════════════════════════════
async function fetchLyrics(artist,track){
  const panel=$('lyricsPanel');
  const lyricsText=$('lyricsText');
  const lyricsTrkTitle=$('lyricsTrkTitle');
  if(openLyricsTrack===track&&panel.classList.contains('open')){panel.classList.remove('open');openLyricsTrack=null;lyricsToken++;return;}
  const token=++lyricsToken;
  openLyricsTrack=track;
  lyricsTrkTitle.textContent='♪ '+track;
  lyricsText.className='lyrics-text';lyricsText.textContent='Loading...';
  panel.classList.add('open');panel.scrollIntoView({behavior:'smooth',block:'nearest'});
  try{
    const first=artist.split('/')[0].trim();
    const r=await fetchTimeout(`https://api.lyrics.ovh/v1/${encodeURIComponent(first)}/${encodeURIComponent(track)}`,{},12000);
    const d=await r.json();
    if(token!==lyricsToken)return;   // user moved on to another track / disc
    if(d&&d.lyrics){lyricsText.textContent=d.lyrics.trim();}
    else{lyricsText.className='lyrics-text error';lyricsText.textContent='Lyrics not found — common for underground/extreme metal.';}
  }catch(e){
    if(token!==lyricsToken)return;
    lyricsText.className='lyrics-text error';
    lyricsText.textContent=(e&&e.name==='AbortError')?'Lyrics request timed out (lyrics.ovh is often slow). Click the track again to retry.':'Could not retrieve lyrics.';
  }
}
