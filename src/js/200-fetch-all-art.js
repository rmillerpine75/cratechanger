
// ════════════════════════════════════════════════════════════════
// FETCH ALL ART
// ════════════════════════════════════════════════════════════════
async function fetchAllArt(){
  if(fetchAllRunning)return;

  // One entry per UNIQUE artist|album:
  //   full    -> never looked up / failed lookup
  //   upgrade -> older entry without original year / type / genres
  //   artist  -> complete, only the artist's genres / origin are missing
  const unique=new Map();
  discs.forEach(d=>{
    if(isSlotEmpty(d))return;
    const k=keyOf(d);if(unique.has(k))return;
    const e=mbCache[k];
    if(!entryComplete(e))unique.set(k,{artist:d[0],album:d[1],key:k,mode:'full'});
    else if(needsUpgrade(e))unique.set(k,{artist:d[0],album:d[1],key:k,mode:'upgrade'});
    else if(e.artistId&&!artistCache[e.artistId])unique.set(k,{artist:d[0],album:d[1],key:k,mode:'artist',artistId:e.artistId});
  });
  const queue=[...unique.values()];
  let force=false;

  if(!queue.length){
    if(!confirm('All discs already have cached data.\n\nOK = re-check everything against MusicBrainz.\n\nSafe: existing data is only replaced per disc when a lookup succeeds, and your uploaded custom art is stored separately and is never touched.'))return;
    force=true;
    const seen=new Set();
    discs.forEach(d=>{
      if(isSlotEmpty(d))return;
      const k=keyOf(d);
      if(!seen.has(k)){seen.add(k);queue.push({artist:d[0],album:d[1],key:k,mode:'full'})}
    });
  }

  fetchAllRunning=true;fetchAllStop=false;
  const btn=$('fetchAllBtn');btn.classList.add('active');btn.textContent='⏳ FETCHING...';btn.disabled=true;
  const total=queue.length;
  $('fetchTotal').textContent=total;
  $('fetchBarWrap').classList.add('visible');

  const t0=Date.now();
  let failed=0,upgraded=0;
  for(let idx=0;idx<queue.length;idx++){
    if(fetchAllStop)break;
    const it=queue[idx];
    $('fetchCurrent').textContent=idx+1;
    let label=(it.artist+' — '+it.album).substring(0,50);
    if(idx>=3){
      const mins=Math.ceil((Date.now()-t0)/idx*(total-idx)/60000);
      label+='  ·  ~'+mins+' MIN LEFT';
    }
    $('fetchCurrentLabel').textContent=label;
    $('fetchBarFill').style.width=`${(idx/total)*100}%`;
    try{
      if(it.mode==='artist'){await ensureArtist(it.artistId)}
      else{
        const data=await ensureData(it.artist,it.album,force||it.mode==='upgrade',it.mode==='upgrade');
        if(data&&data.mbTried===false)failed++;
        else if(it.mode==='upgrade')upgraded++;
      }
    }catch(e){failed++}
    updateSlotArtIfNeeded(it.key);
  }

  $('fetchBarFill').style.width='100%';
  $('fetchCurrentLabel').textContent=fetchAllStop?'STOPPED':(failed?'DONE — '+failed+' NEED RETRY':'COMPLETE ✓');
  if(failed)toast(failed+' LOOKUP(S) HIT MUSICBRAINZ ERRORS — RUN FETCH ART AGAIN TO RETRY ONLY THOSE',6000);
  else if(upgraded)toast(upgraded+' OLDER ENTRIES UPGRADED (ORIGINAL YEAR, TYPE, GENRES)',5000);
  setTimeout(()=>$('fetchBarWrap').classList.remove('visible'),3000);
  populateExtraFilters();
  btn.classList.remove('active');btn.textContent='⬇ FETCH ART';btn.disabled=false;
  fetchAllRunning=false;
}

function stopFetchAll(){fetchAllStop=true}

// Leftover lookup-cache keys from older versions count against the ~5 MB localStorage quota.
// Never deleted silently; keys that contain image data are never offered.
function offerOldCacheCleanup(){
  if(safeGet('cc_cleanup_declined'))return;
  const found=['cc_cache_v1','cc_cache_v2','cc_cache_v3'].map(k=>[k,safeGet(k)]).filter(([,v])=>v);
  const deletable=found.filter(([,v])=>v.indexOf('data:image/')===-1);
  if(!deletable.length)return;
  const kb=Math.round(deletable.reduce((n,[,v])=>n+v.length,0)/1024);
  if(confirm('Found '+deletable.length+' leftover cache key(s) from older CrateChanger versions ('+deletable.map(f=>f[0]).join(', ')+', about '+kb+' KB).\n\nThey are unused and count against the browser storage limit. Delete them?\n\n(Cancel = keep them; you will not be asked again.)')){
    deletable.forEach(([k])=>{try{localStorage.removeItem(k)}catch(e){}});
    toast('FREED ABOUT '+kb+' KB');
  }else safeSet('cc_cleanup_declined','1');
}
