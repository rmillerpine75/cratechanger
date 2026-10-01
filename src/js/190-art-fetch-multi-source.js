
// ════════════════════════════════════════════════════════════════
// ART FETCH — MULTI-SOURCE
// ════════════════════════════════════════════════════════════════
async function fetchTimeout(url,opts={},ms=10000){
  const ctl=new AbortController();
  const t=setTimeout(()=>ctl.abort(),ms);
  try{return await fetch(url,Object.assign({},opts,{signal:ctl.signal}))}
  finally{clearTimeout(t)}
}
async function fetchJsonSafe(url,ms=9000){
  try{const r=await fetchTimeout(url,{},ms);if(!r.ok)return null;return await r.json()}
  catch(e){return null}
}

const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'');
function nameMatch(a,b){const x=norm(a),y=norm(b);return !!x&&!!y&&(x.includes(y)||y.includes(x))}
const artistOk=(wanted,candidate)=>!norm(wanted)||nameMatch(wanted,candidate);
function luceneEscape(s){return String(s).replace(/([+\-!(){}\[\]^"~*?:\\\/&|])/g,'\\$1')}

function parseAlbum(album){
  const clean=album.replace(/\s*\((disc \d+|bonus disc|broken)[^)]*\)/i,'').trim();
  const dm=album.match(/\(disc\s*(\d+)/i);
  return {clean,disc:dm?parseInt(dm[1],10):null,bonus:/\(bonus disc/i.test(album)};
}
// Titles that can't be looked up meaningfully (they would just cache a random wrong match).
function isJunkAlbum(album){
  return /^\s*(unknown|split)?\s*$/i.test(album)||/\bDVD\b/i.test(album)||/compilation/i.test(album)||/needs replacement/i.test(album);
}

// MusicBrainz asks for max ~1 request/second. ONE global queue serves every MusicBrainz call in the app
// (lookups AND the similar-artists panel), retrying 429/5xx. Browsers won't let us set User-Agent anyway,
// and a custom header would force a CORS preflight, so none is sent.
let mbChain=Promise.resolve();
let mbLast=0;
function mbFetchJson(url,tries=3){
  const run=async()=>{
    let lastErr=null;
    for(let a=0;a<tries;a++){
      const wait=Math.max(0,mbLast+1100-Date.now());
      if(wait)await sleep(wait);
      mbLast=Date.now();
      try{
        const resp=await fetchTimeout(url,{},12000);
        if(resp.ok)return await resp.json();
        if(resp.status>=400&&resp.status<500&&resp.status!==429)return null;   // definitive "no"
        lastErr=new Error('HTTP '+resp.status);
      }catch(e){lastErr=e}
      await sleep(1500*(a+1));
    }
    throw lastErr||new Error('MusicBrainz request failed');
  };
  const p=mbChain.then(run);
  mbChain=p.catch(()=>{});
  return p;
}

async function fetchItunesArt(artist,album){
  const d=await fetchJsonSafe('https://itunes.apple.com/search?term='+encodeURIComponent(artist+' '+album)+'&media=music&entity=album&limit=5');
  const list=(d&&d.results)||[];
  const ok=list.filter(r=>artistOk(artist,r.artistName));
  const pick=ok.find(r=>nameMatch(album,r.collectionName))||ok[0];
  const url=pick&&pick.artworkUrl100;
  return url?url.replace('100x100bb','600x600bb'):null;
}
async function fetchItunesPreview(artist,album){
  const d=await fetchJsonSafe('https://itunes.apple.com/search?term='+encodeURIComponent(artist+' '+album)+'&media=music&entity=song&limit=1');
  const r=d&&d.results&&d.results[0];
  return (r&&artistOk(artist,r.artistName)&&typeof r.previewUrl==='string')?r.previewUrl:null;
}

// Deezer may be CORS-blocked from file://; if so we stop trying for the session (it used to fail silently 2x per disc).
let deezerDead=false;
async function deezerJson(url){const r=await fetchTimeout(url,{},9000);if(!r.ok)return null;return await r.json()}
async function fetchDeezerArt(artist,album){
  if(deezerDead)return null;
  try{
    let d=await deezerJson('https://api.deezer.com/search/album?q='+encodeURIComponent('artist:"'+artist+'" album:"'+album+'"')+'&limit=5');
    let list=(d&&d.data)||[];
    if(!list.length){
      d=await deezerJson('https://api.deezer.com/search/album?q='+encodeURIComponent(artist+' '+album)+'&limit=5');
      list=(d&&d.data)||[];
    }
    const ok=list.filter(r=>artistOk(artist,r.artist&&r.artist.name));
    const pick=ok.find(r=>nameMatch(album,r.title))||ok[0];
    return pick?(pick.cover_xl||pick.cover_big||null):null;
  }catch(e){
    if(e&&e.name==='TypeError'){deezerDead=true;console.info('Deezer unreachable (likely CORS) - skipping it for this session')}
    return null;
  }
}

function caaSources(mbids,rgId){
  const urls=mbids.map(id=>`https://coverartarchive.org/release/${id}/front-250`);
  if(rgId)urls.push(`https://coverartarchive.org/release-group/${rgId}/front-250`);
  return urls;
}

// ── CORE LOOKUP ─────────────────────────────────────────────────
// Never throws. mbTried=false means MusicBrainz errored out: the entry stays "incomplete" and is retried later
// instead of being cached as a permanent empty result.
async function fetchDiscData(artist,album,pinnedId=null){
  const {clean:cleanAlbum,disc:discNo,bonus}=parseAlbum(album);
  const cleanArtist=artist.split('/')[0].trim();

  if(!pinnedId&&(isJunkAlbum(album)||isJunkAlbum(cleanAlbum))){
    return {skipped:true,mbid:null,mbUrl:null,artSources:[],tracks:[],tags:[],previewUrl:null,mbTried:true,fetchedAt:Date.now(),v:CACHE_SCHEMA};
  }

  const itunesP=fetchItunesArt(cleanArtist,cleanAlbum);
  const deezerP=fetchDeezerArt(cleanArtist,cleanAlbum);

  // Candidate titles: the full title, then the first half of "A / B" double releases.
  const titles=[cleanAlbum];
  if(cleanAlbum.includes(' / '))titles.push(cleanAlbum.split(' / ')[0].trim());

  let releases=[],detail=null,mbFailed=false;
  try{
    const creditOk=r=>artistOk(cleanArtist,(r['artist-credit']||[]).map(c=>(c.name||'')+' '+((c.artist&&c.artist.name)||'')).join(' '));
    if(pinnedId){
      // the edition YOU picked: no searching, fetch exactly that release
      detail=await mbFetchJson('https://musicbrainz.org/ws/2/release/'+encodeURIComponent(pinnedId)+'?inc=recordings+release-groups+artist-credits&fmt=json');
      if(detail)releases=[{id:pinnedId,date:detail.date,country:detail.country,'artist-credit':detail['artist-credit']}];
    }else{
      for(const title of titles){
        const q1='release:"'+luceneEscape(title)+'"'+(cleanArtist?' AND artist:"'+luceneEscape(cleanArtist)+'"':'');
        const d1=await mbFetchJson('https://musicbrainz.org/ws/2/release/?query='+encodeURIComponent(q1)+'&fmt=json&limit=5');
        releases=((d1&&d1.releases)||[]).filter(r=>(r.score==null||r.score>=85)&&creditOk(r));
        if(!releases.length){
          const d2=await mbFetchJson('https://musicbrainz.org/ws/2/release/?query='+encodeURIComponent((title+' '+cleanArtist).trim())+'&fmt=json&limit=5');
          releases=((d2&&d2.releases)||[]).filter(r=>(r.score==null||r.score>=80)&&creditOk(r));
        }
        if(releases.length)break;
      }
      // release-groups -> original year, type and the release-group cover; artist-credits -> artist id (genres / origin).
      // Without inc=release-groups the live API omits the release-group entirely (verified).
      if(releases.length)detail=await mbFetchJson('https://musicbrainz.org/ws/2/release/'+releases[0].id+'?inc=recordings+release-groups+artist-credits&fmt=json');
    }
  }catch(e){mbFailed=true}

  const [itunesArt,deezerArt]=await Promise.all([itunesP,deezerP]);
  const previewUrl=(releases.length||itunesArt)?await fetchItunesPreview(cleanArtist,cleanAlbum):null;

  const rel=releases[0];
  const rg=(detail&&detail['release-group'])||null;
  const rgId=(rg&&rg.id)||null;
  const artSources=Array.from(new Set([
    ...caaSources(releases.map(r=>r.id),rgId),
    ...(itunesArt?[itunesArt]:[]),
    ...(deezerArt?[deezerArt]:[])
  ]));

  // Tracks: respect "(Disc N)" / "(bonus disc)" so multi-disc sets don't show one merged list.
  const tracks=[];
  const media=(detail&&detail.media)||[];
  let chosen=media.map((m,mi)=>({m,mi}));
  if(discNo&&media.length>=discNo)chosen=[{m:media[discNo-1],mi:discNo-1}];
  else if(bonus&&media.length>=2)chosen=[{m:media[media.length-1],mi:media.length-1}];
  chosen.forEach(({m,mi})=>(m.tracks||[]).forEach(t=>{
    const pos=t.position||t.number;
    tracks.push({num:chosen.length>1?(mi+1)+'.'+pos:pos,title:t.title,length:t.length?msToMin(t.length):null});
  }));

  // Year = ORIGINAL release (release-group first-release-date); the matched pressing's own year is kept as editionYear.
  const editionYear=(rel&&rel.date)?rel.date.substring(0,4):null;
  const firstYear=(rg&&rg['first-release-date'])?rg['first-release-date'].substring(0,4):null;
  const year=firstYear||editionYear;
  const type=(rg&&rg['primary-type'])||null;
  const tags=[];
  if(year)tags.push(year);
  if(rel&&rel.country)tags.push(rel.country);
  if(type)tags.push(type);

  const credit=(detail&&detail['artist-credit'])||(rel&&rel['artist-credit'])||[];
  const artistId=(credit[0]&&credit[0].artist&&credit[0].artist.id)||null;
  if(artistId&&!mbFailed){try{await ensureArtist(artistId)}catch(e){}}

  return {
    mbid:rel?rel.id:null,
    mbUrl:rel?'https://musicbrainz.org/release/'+rel.id:null,
    artSources,tracks,tags,previewUrl,
    year,editionYear,type,rgId,artistId,
    mbTried:!mbFailed,
    fetchedAt:Date.now(),
    v:CACHE_SCHEMA
  };
}

// De-duplicated, cache-aware lookup used by the modal, FETCH ART and the batch REFETCH.
const inflight=new Map();
// force   = look up again even if cached
// upgrade = re-look-up an older (v1) entry to add original year / type / genres; never throws away a tracklist we already have
// pinId   = undefined: keep whatever edition is pinned · string: pin that MusicBrainz release · null: unpin (automatic match)
function ensureData(artist,album,force=false,upgrade=false,pinId=undefined){
  const key=artist+'|'+album;
  const cached=mbCache[key];
  if(!force&&pinId===undefined&&entryComplete(cached))return Promise.resolve(cached);
  if(inflight.has(key))return inflight.get(key);
  const p=(async()=>{
    const prev0=mbCache[key];
    const pin=pinId===undefined?((prev0&&prev0.pinned&&prev0.mbid)||null):pinId;
    let payload=await fetchDiscData(artist,album,pin);
    // a pinned release that no longer exists on MusicBrainz: fall back to the automatic match rather than losing data
    if(pin&&!payload.mbid&&payload.mbTried!==false)payload=await fetchDiscData(artist,album,null);
    payload.pinned=!!(pin&&payload.mbid===pin);
    const prev=mbCache[key];
    if(prev){
      if((!force||upgrade)&&prev.artCleared){payload.artSources=[];payload.artCleared=true}
      else if(!payload.artSources.length&&autoSources(prev).length)payload.artSources=autoSources(prev);
      const transient=payload.mbTried===false;
      const hadTracks=Array.isArray(prev.tracks)&&prev.tracks.length>0;
      if(hadTracks&&(transient||(upgrade&&!payload.tracks.length))){
        // keep what we had: an outage must not downgrade, and a stricter re-match must not erase a tracklist
        for(const f of ['tracks','tags','mbid','mbUrl','year','editionYear','type','rgId','artistId','pinned'])if(prev[f]!==undefined)payload[f]=prev[f];
        payload.previewUrl=payload.previewUrl||prev.previewUrl||null;
        payload.mbTried=true;
        payload.v=transient?(prev.v||1):CACHE_SCHEMA;   // outage: retry later; no confident re-match: stop retrying
        if(!transient)payload.upgradeNoMatch=true;
      }
    }
    mbCache[key]=payload;
    saveMbCache();
    return payload;
  })();
  inflight.set(key,p);
  p.then(()=>inflight.delete(key),()=>inflight.delete(key));
  return p;
}
