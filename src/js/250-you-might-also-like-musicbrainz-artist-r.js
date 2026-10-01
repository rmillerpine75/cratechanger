
// ════════════════════════════════════════════════════════════════
// "YOU MIGHT ALSO LIKE" — MusicBrainz artist relationships
// ════════════════════════════════════════════════════════════════
const similarCache=new Map();   // artist -> [names]; MusicBrainz is only asked once per artist per session
async function fetchSimilarArtists(artistName){
  const tok=modalToken;          // abandon the result if the user has moved to another disc meanwhile
  const sec=$('similarSection');
  const list=$('similarList');
  sec.style.display='none';list.innerHTML='';
  try{
    let unique=similarCache.get(artistName);
    if(!unique){
      const d=await mbFetchJson('https://musicbrainz.org/ws/2/artist/?query='+encodeURIComponent('artist:"'+luceneEscape(artistName)+'"')+'&fmt=json&limit=1');
      if(tok!==modalToken)return;
      if(!d||!d.artists||!d.artists.length){similarCache.set(artistName,[]);return}
      const d2=await mbFetchJson('https://musicbrainz.org/ws/2/artist/'+d.artists[0].id+'?inc=artist-rels&fmt=json');
      if(tok!==modalToken)return;
      const rels=(d2&&d2.relations)||[];
      unique=[...new Set(rels.filter(r=>r['target-type']==='artist').map(r=>r.artist&&r.artist.name).filter(Boolean))].filter(a=>a!==artistName).slice(0,16);
      similarCache.set(artistName,unique);
    }
    if(tok!==modalToken||!unique.length)return;

    // Check which are already in collection
    const inCollection=new Set(discs.filter(d=>d&&d[0]).map(d=>d[0].toLowerCase()));
    list.innerHTML=unique.map(a=>{
      const has=inCollection.has(a.toLowerCase());
      return `<span class="similar-chip${has?' in-collection':''}" role="link" tabindex="0" data-artist="${escH(a)}" title="${has?'IN YOUR COLLECTION':'Click to search'}">${escH(a)}${has?' ✓':''}</span>`;
    }).join('');
    sec.style.display='';
  }catch(e){}
}
function openSimilarChip(chip){
  window.open('https://www.discogs.com/search/?q='+encodeURIComponent(chip.dataset.artist)+'&type=artist','_blank','noopener');
}
$('similarList').addEventListener('click',e=>{const c=e.target.closest('.similar-chip');if(c)openSimilarChip(c)});
$('similarList').addEventListener('keydown',e=>{
  if(e.key!=='Enter'&&e.key!==' ')return;
  const c=e.target.closest('.similar-chip');if(c){e.preventDefault();openSimilarChip(c)}
});
