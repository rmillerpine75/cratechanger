
// ════════════════════════════════════════════════════════════════
// ROUND-5 FEATURES
// ════════════════════════════════════════════════════════════════
const slotNum=i=>String(i+1).padStart(3,'0');
const normT=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
function fmtMoney(v,cur){try{return new Intl.NumberFormat(undefined,{style:'currency',currency:cur||'USD'}).format(v)}catch(e){return (cur||'$')+' '+Number(v).toFixed(2)}}

// ── METAL ARCHIVES (Encyclopaedia Metallum): band search in one click ──
function metalArchivesUrl(artist){
  const band=String(artist||'').split('/')[0].trim();
  return 'https://www.metal-archives.com/search?searchString='+encodeURIComponent(band)+'&type=band_name';
}
function openMetalArchives(){
  if(currentModalIndex===null)return;
  const d=discs[currentModalIndex];if(!d||!d[0])return;
  window.open(metalArchivesUrl(d[0]),'_blank','noopener');
}

// ── DATE ADDED (recorded from now on: new discs, Discogs imports) ──
const addedTs=i=>{const a=getMeta(i).addedAt;const t=a?Date.parse(a):NaN;return isNaN(t)?0:t};
function growthSectionHtml(){
  const owned=discs.map((d,i)=>i).filter(i=>!isSlotEmpty(discs[i])&&!isWish(i));
  const dated=owned.filter(i=>addedTs(i)>0);
  if(!dated.length)return `<div class="stats-section"><h3>COLLECTION GROWTH</h3><div class="no-results">The date a disc is added is recorded from now on (new discs and Discogs imports). Your ${owned.length} existing discs have no date.</div></div>`;
  const months=[];const now=new Date();
  for(let k=11;k>=0;k--){const d=new Date(now.getFullYear(),now.getMonth()-k,1);months.push({key:d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'),n:0})}
  dated.forEach(i=>{const d=new Date(addedTs(i));const k=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');const m=months.find(x=>x.key===k);if(m)m.n++});
  const max=Math.max(1,...months.map(m=>m.n));
  const bars=months.map(m=>`<div class="gr-col" title="${m.key}: ${m.n} added"><div class="gr-n">${m.n||''}</div><div class="gr-bar" style="height:${Math.round(m.n/max*85)}%"></div><div class="gr-lbl">${m.key.slice(2).replace('-','/')}</div></div>`).join('');
  const recent=dated.slice().sort((a,b)=>addedTs(b)-addedTs(a)).slice(0,5).map(i=>`<div class="attn-row" data-open-slot="${i}" title="Open disc"><span class="attn-num">${slotNum(i)}</span><span class="attn-title">${escH(discs[i][0])} — ${escH(discs[i][1])}</span><span class="attn-meta">ADDED ${escH(getMeta(i).addedAt.slice(0,10))}</span></div>`).join('');
  return `<div class="stats-section"><h3>COLLECTION GROWTH (LAST 12 MONTHS)</h3><div class="growth">${bars}</div><div class="attn-hint">${dated.length} OF ${owned.length} DISCS HAVE AN ADDED DATE · ${owned.length-dated.length} PREDATE DATE TRACKING · MOST RECENT:</div>${recent}</div>`;
}

// ── DATA CHECK: suggested clean-ups you approve one by one (each undoable) ──
function similarity(a,b){
  if(a===b)return 1;if(!a||!b)return 0;
  let prev=Array.from({length:b.length+1},(_,j)=>j);
  for(let i=1;i<=a.length;i++){
    const cur=[i];
    for(let j=1;j<=b.length;j++)cur[j]=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));
    prev=cur;
  }
  return 1-prev[b.length]/Math.max(a.length,b.length);
}
// keepLookup: true for pure spelling-consistency fixes (same release), false when the title itself was wrong
function renameSlot(i,artist,album,keepLookup){
  const oldK=keyOf(discs[i]);discs[i]=[artist,album];const newK=keyOf(discs[i]);
  if(oldK===newK)return;
  if(keepLookup&&mbCache[oldK]&&!mbCache[newK])mbCache[newK]=mbCache[oldK];
  if(!discs.some(d=>keyOf(d)===oldK))delete mbCache[oldK];
}
let dcSkipped=new Set(),spellSuggestions=[],spellRunning=false;
function collectDataIssues(){
  const issues=[];
  const owned=discs.map((d,i)=>i).filter(i=>!isSlotEmpty(discs[i]));
  // 1. stray spaces
  owned.forEach(i=>{
    const d=discs[i];const fix=[d[0],d[1]].map(s=>s.replace(/\s+/g,' ').trim());
    if(fix[0]!==d[0]||fix[1]!==d[1])issues.push({id:'space:'+i,title:'EXTRA SPACES',text:`${slotNum(i)}  “${d[0]} — ${d[1]}”`,label:'TRIM',apply:()=>{renameSlot(i,fix[0],fix[1],true);return []}});
  });
  // 2. one artist, several spellings
  const byArtist=new Map();
  owned.forEach(i=>{const a=discs[i][0];const k=normT(a);if(!k)return;if(!byArtist.has(k))byArtist.set(k,new Map());const m=byArtist.get(k);m.set(a,(m.get(a)||[]).concat(i))});
  byArtist.forEach(variants=>{
    if(variants.size<2)return;
    const sorted=[...variants.entries()].sort((a,b)=>b[1].length-a[1].length||a[0].localeCompare(b[0]));
    const best=sorted[0][0];const others=sorted.slice(1);const slots=others.flatMap(o=>o[1]);
    issues.push({id:'artist:'+normT(best),title:'ARTIST SPELT DIFFERENTLY',text:`${others.map(o=>`“${o[0]}” (${o[1].length})`).join(', ')}  →  “${best}” (${sorted[0][1].length})`,label:'USE “'+best+'”',apply:()=>{slots.forEach(i=>renameSlot(i,best,discs[i][1],true));return []}});
  });
  // 3. same album twice (exact or differently spelt)
  const byKey=new Map();
  owned.forEach(i=>{const k=normT(discs[i][0])+'|'+normT(discs[i][1]);if(!byKey.has(k))byKey.set(k,[]);byKey.get(k).push(i)});
  byKey.forEach(list=>{
    if(list.length<2)return;
    const first=discs[list[0]];
    const respell=list.slice(1).filter(i=>discs[i][1]!==first[1]&&normT(discs[i][0])===normT(first[0]));
    if(respell.length)issues.push({id:'album:'+list.join(','),title:'ALBUM SPELT DIFFERENTLY',text:`${respell.map(i=>`${slotNum(i)} “${discs[i][1]}”`).join(', ')}  →  “${first[1]}” (as in ${slotNum(list[0])})`,label:'MAKE CONSISTENT',apply:()=>{respell.forEach(i=>renameSlot(i,discs[i][0],first[1],true));return []}});
    const unflagged=list.slice(1).filter(i=>!getMeta(i).flags.includes('duplicate'));
    if(unflagged.length)issues.push({id:'dupe:'+list.join(','),title:'DUPLICATE',text:`${list.map(slotNum).join(' & ')}:  ${first[0]} — ${first[1]}  (if you really own ${list.length} copies, just SKIP)`,label:'FLAG AS DUPLICATE',apply:()=>{unflagged.forEach(i=>{const m=getMeta(i);if(!m.flags.includes('duplicate'))m.flags.push('duplicate')});return []}});
  });
  // 4. spelling suggestions from the online check
  spellSuggestions.forEach(s=>{
    const d=discs[s.slot];if(!d||d[0]!==s.artist||d[1]!==s.from)return;
    issues.push({id:'spell:'+s.slot+':'+s.to,title:'POSSIBLE TYPO',text:`${slotNum(s.slot)}  “${s.from}”  →  “${s.to}”  (closest MusicBrainz title, ${Math.round(s.sim*100)}% similar)`,label:'RENAME',apply:()=>{renameSlot(s.slot,d[0],s.to,false);spellSuggestions=spellSuggestions.filter(x=>x!==s);return [s.slot]}});
  });
  // 5. order: how many discs sit out of A–Z artist order (= discs NOT in the longest already-sorted sequence),
  //    and where a second A–Z list restarts (e.g. one list appended after another)
  const seq=owned.filter(i=>!isWish(i));
  if(seq.length>2){
    const cmpA=(a,b)=>sortName(discs[a][0]).localeCompare(sortName(discs[b][0]),undefined,{sensitivity:'base'});
    const ranked=seq.slice().sort(cmpA);
    const rank=new Map();let r=0;
    ranked.forEach((i,k)=>{if(k&&cmpA(ranked[k-1],i)!==0)r++;rank.set(i,r)});
    const tails=[];
    seq.forEach(i=>{const v=rank.get(i);let lo=0,hi=tails.length;while(lo<hi){const mid=(lo+hi)>>1;if(tails[mid]<=v)lo=mid+1;else hi=mid}tails[lo]=v});
    const outOfOrder=seq.length-tails.length;
    const restarts=[];
    for(let k=1;k<seq.length;k++){
      const p=sortName(discs[seq[k-1]][0]).toUpperCase().charCodeAt(0),q=sortName(discs[seq[k]][0]).toUpperCase().charCodeAt(0);
      if(p-q>=15)restarts.push(seq[k]);
    }
    if(outOfOrder>0)issues.push({id:'order:'+outOfOrder,title:'ORDER',text:`${outOfOrder} disc(s) are out of A–Z artist order${restarts.length?` — a new A–Z list starts at slot ${restarts.slice(0,2).map(slotNum).join(' and ')}`:''}.`,label:'OPEN RE-SORT PLAN',navigate:true,apply:()=>{closeDataCheck();openResort()}});
  }
  return issues;
}
function openDataCheck(){closeBrModal();$('dataCheckModal').classList.add('open');renderDataCheck()}
function closeDataCheck(){$('dataCheckModal').classList.remove('open')}
function renderDataCheck(){
  const issues=collectDataIssues().filter(x=>!dcSkipped.has(x.id));
  window._dcIssues=issues;
  $('dataCheckList').innerHTML=issues.length
    ?issues.map((x,n)=>`<div class="dc-item"><div class="dc-kind">${escH(x.title)}</div><div class="dc-text">${escH(x.text)}</div><div class="dc-actions"><button class="btn-sm gold" type="button" data-dc-apply="${n}">${escH(x.label)}</button><button class="btn-sm" type="button" data-dc-skip="${n}">SKIP</button></div></div>`).join('')
    :'<div class="no-results">NOTHING TO FIX ✓</div>';
}
async function applyDataIssue(n){
  const x=(window._dcIssues||[])[n];if(!x)return;
  if(x.navigate){x.apply();return}
  const snap=snapshot();
  const refetch=x.apply()||[];
  saveDiscs();saveMeta();saveMbCache();buildGrid();
  offerUndo('DATA CHECK: '+x.title,snap);
  renderDataCheck();
  for(const i of refetch){
    const d=discs[i];if(!d)continue;
    ensureData(d[0],d[1]).then(()=>{updateSlotArtIfNeeded(keyOf(d));populateExtraFilters();renderDataCheck()}).catch(()=>{});
  }
}
$('dataCheckList').addEventListener('click',e=>{
  const a=e.target.closest('[data-dc-apply]');if(a){applyDataIssue(Number(a.dataset.dcApply));return}
  const s=e.target.closest('[data-dc-skip]');if(s){const x=(window._dcIssues||[])[Number(s.dataset.dcSkip)];if(x)dcSkipped.add(x.id);renderDataCheck()}
});
// For titles with no confident match: list everything MusicBrainz has BY THIS ARTIST and compare titles locally
// (a plain title search drowns in other bands' albums). Split releases ("A / B") are compared part by part.
async function checkSpellingOnline(){
  if(spellRunning)return;spellRunning=true;
  const btn=$('dcSpellBtn'),st=$('dcSpellStatus');btn.disabled=true;
  const seen=new Set();
  const cands=discs.map((d,i)=>i).filter(i=>{
    const d=discs[i];if(isSlotEmpty(d))return false;
    const k=keyOf(d);if(seen.has(k))return false;seen.add(k);
    const e=mbCache[k];const ov=getOverride(i);
    return entryComplete(e)&&!e.skipped&&!(e.tracks&&e.tracks.length)&&!(ov&&ov.tracks&&ov.tracks.length);
  });
  const byArtist=new Map();   // one MusicBrainz request per artist
  let found=0,failed=0;
  try{
    for(let n=0;n<cands.length;n++){
      const i=cands[n];const [artist,album]=discs[i];
      st.textContent=`CHECKING ${n+1} OF ${cands.length}…`;
      const {clean}=parseAlbum(album);const a=artist.split('/')[0].trim();
      try{
        if(!byArtist.has(a)){
          const r=await mbFetchJson('https://musicbrainz.org/ws/2/release/?query='+encodeURIComponent('artist:"'+luceneEscape(a)+'"')+'&fmt=json&limit=100');
          byArtist.set(a,((r&&r.releases)||[]).filter(x=>x&&x.title&&artistOk(a,(x['artist-credit']||[]).map(c=>(c.name||'')+' '+((c.artist&&c.artist.name)||'')).join(' '))).map(x=>x.title));
        }
        const target=normT(clean);
        const titles=[...new Set(byArtist.get(a))];
        const best=titles.map(t=>({title:t,sim:Math.max(similarity(target,normT(t)),...t.split(' / ').map(p=>similarity(target,normT(p))))}))
          .filter(x=>x.sim>=0.7&&normT(x.title)!==target)
          .sort((p,q)=>q.sim-p.sim||p.title.length-q.title.length)[0];
        if(best){
          const suffix=album.startsWith(clean)?album.slice(clean.length):'';
          spellSuggestions=spellSuggestions.filter(s=>s.slot!==i);
          spellSuggestions.push({slot:i,artist,from:album,to:best.title+suffix,sim:best.sim});found++;
        }
      }catch(e){failed++}
    }
    st.textContent=cands.length?`CHECKED ${cands.length} UNMATCHED TITLE(S) · ${found} SUGGESTION(S)${failed?' · '+failed+' FAILED (MUSICBRAINZ BUSY)':''}`:'NO UNMATCHED TITLES TO CHECK (RUN ⬇ FETCH ART FIRST)';
  }finally{spellRunning=false;btn.disabled=false;renderDataCheck()}
}

// ── BARCODE → exact edition (typed; camera scanning where the browser supports it) ──
let pendingPin=null;
function barcodeRow(x){
  const artist=(x['artist-credit']||[]).map(c=>(c.name||'')+(c.joinphrase||'')).join('')||'?';
  const media=Array.isArray(x.media)?x.media:[];
  const fmt=[...new Set(media.map(m=>m&&m.format).filter(Boolean))].join(' + ');
  const meta=[(x.date||'').slice(0,10),x.country,fmt].filter(Boolean).join(' · ');
  return `<button class="edition-row" type="button" data-bc-id="${escH(x.id)}" data-bc-artist="${escH(artist)}" data-bc-title="${escH(x.title||'')}"><span class="ed-main">${escH(artist)} — ${escH(x.title||'')}</span><span class="ed-meta">${escH(meta)}</span></button>`;
}
async function lookupBarcode(){
  const code=String($('editBarcode').value||'').replace(/\D/g,'');
  const box=$('barcodeResults');
  if(code.length<8||code.length>14){toast('A BARCODE IS 8 TO 14 DIGITS',3500);return}
  box.innerHTML='<div class="no-results">Looking up '+code+'…</div>';
  try{
    const r=await mbFetchJson('https://musicbrainz.org/ws/2/release/?query='+encodeURIComponent('barcode:'+code)+'&fmt=json&limit=10');
    const list=((r&&r.releases)||[]).filter(x=>x&&x.id);
    box.innerHTML=list.length?list.map(barcodeRow).join(''):'<div class="no-results">No release with that barcode on MusicBrainz.</div>';
  }catch(e){box.innerHTML='<div class="no-results">MusicBrainz is unreachable right now.</div>'}
}
$('barcodeResults').addEventListener('click',e=>{
  const b=e.target.closest('[data-bc-id]');if(!b)return;
  $('editArtist').value=b.dataset.bcArtist;$('editAlbum').value=b.dataset.bcTitle;
  pendingPin=/^[\w-]{1,64}$/.test(b.dataset.bcId)?b.dataset.bcId:null;
  $('barcodeResults').querySelectorAll('.edition-row').forEach(r=>r.classList.toggle('current',r===b));
  toast('FILLED FROM THE BARCODE — SAVE TO KEEP (THAT EDITION WILL BE PINNED)',4000);
});
if('BarcodeDetector' in window&&navigator.mediaDevices&&navigator.mediaDevices.getUserMedia){const sb=$('scanBtn');if(sb)sb.style.display=''}
async function scanBarcode(){
  let stream=null,overlay=null,stop=false;
  const finish=()=>{stop=true;if(stream)stream.getTracks().forEach(t=>t.stop());if(overlay)overlay.remove()};
  try{
    const det=new BarcodeDetector({formats:['ean_13','ean_8','upc_a','upc_e']});
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
    overlay=document.createElement('div');overlay.className='scan-overlay';
    overlay.innerHTML='<video playsinline muted></video><div class="br-last-backup">POINT THE CAMERA AT THE BARCODE</div><button class="btn" type="button">CANCEL</button>';
    document.body.appendChild(overlay);
    overlay.querySelector('button').onclick=finish;
    const video=overlay.querySelector('video');video.srcObject=stream;await video.play();
    const t0=Date.now();
    while(!stop&&Date.now()-t0<30000){
      const codes=await det.detect(video).catch(()=>[]);
      if(codes&&codes.length){$('editBarcode').value=codes[0].rawValue;finish();lookupBarcode();return}
      await new Promise(r=>setTimeout(r,250));
    }
    if(!stop)toast('NO BARCODE FOUND — TYPE IT IN INSTEAD',4000);
  }catch(e){toast('CAMERA NOT AVAILABLE: '+((e&&e.message)||e),4000)}
  finally{finish()}
}

// ── DISCOGS: collection CSV import ──
function parseCsv(text){
  const rows=[];let row=[],f='',q=false;
  text=String(text).replace(/^\uFEFF/,'');
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(q){if(c==='"'){if(text[i+1]==='"'){f+='"';i++}else q=false}else f+=c}
    else if(c==='"')q=true;
    else if(c===','){row.push(f);f=''}
    else if(c==='\n'){row.push(f);rows.push(row);row=[];f=''}
    else if(c!=='\r')f+=c;
  }
  if(f!==''||row.length){row.push(f);rows.push(row)}
  return rows.filter(r=>r.some(x=>x.trim()!==''));
}
const cleanDiscogsArtist=a=>String(a||'').split(/\s*,\s*(?![^(]*\))/).map(x=>x.replace(/\s+\(\d+\)$/,'').replace(/\*$/,'').trim()).join(', ');
function mapDiscogsCondition(s){
  s=String(s||'').toLowerCase();
  if(!s)return '';
  if(/mint/.test(s))return 'mint';
  if(/very good|\bvg/.test(s))return 'good';
  if(/good|fair|poor/.test(s))return 'scratched';
  return '';
}
async function importDiscogsCsv(ev){
  const file=ev.target.files[0];ev.target.value='';
  if(!file)return;
  try{
    const rows=parseCsv(await file.text());
    if(rows.length<2)throw new Error('the file has no rows');
    const head=rows[0].map(h=>h.trim().toLowerCase());
    const col=name=>head.indexOf(name);
    const cA=col('artist'),cT=col('title');
    if(cA<0||cT<0)throw new Error('not a Discogs collection export (needs Artist and Title columns)');
    const cId=col('release_id'),cAdded=col('date added'),cCond=col('collection media condition'),cNotes=col('collection notes');
    const items=rows.slice(1).map(r=>({artist:cleanDiscogsArtist(r[cA]),title:String(r[cT]||'').trim(),id:cId>=0?Number(r[cId])||null:null,
      added:cAdded>=0&&r[cAdded]?r[cAdded].trim():'',cond:cCond>=0?mapDiscogsCondition(r[cCond]):'',notes:cNotes>=0?String(r[cNotes]||'').trim():''})).filter(x=>x.artist&&x.title);
    const byKey=new Map();
    discs.forEach((d,i)=>{if(!isSlotEmpty(d)){const k=normT(d[0])+'|'+normT(d[1]);if(!byKey.has(k))byKey.set(k,i)}});
    const matched=[],fresh=[];
    items.forEach(x=>{const i=byKey.get(normT(x.artist)+'|'+normT(x.title));if(i!==undefined)matched.push({x,i});else fresh.push(x)});
    const unwish=matched.filter(m=>isWish(m.i)).length;
    const empties=discs.map((d,i)=>i).filter(i=>isSlotEmpty(discs[i])&&!isWish(i));
    const intoEmpty=Math.min(empties.length,fresh.length),appended=fresh.length-intoEmpty;
    if(!confirm(`DISCOGS IMPORT — dry run:\n  ${items.length} release(s) in the file\n  ${matched.length} already in your collection (Discogs links + dates added${unwish?`; ${unwish} leave your wishlist — you own them now`:''})\n  ${fresh.length} new → ${intoEmpty} into empty slots${appended?`, ${appended} as new slots at the end`:''}\n\nNotes and condition come across for new discs. You can UNDO right after.\n\nImport now?`))return;
    const snap=snapshot();
    const toIso=s=>{const t=Date.parse(String(s).replace(' ','T'));return isNaN(t)?null:new Date(t).toISOString()};
    matched.forEach(({x,i})=>{
      const m=getMeta(i);
      if(x.id)m.discogsId=x.id;
      if(!m.addedAt&&x.added)m.addedAt=toIso(x.added)||undefined;
      if(m.flags.includes('wishlist'))m.flags=m.flags.filter(f=>f!=='wishlist');
    });
    let e=0;
    fresh.forEach(x=>{
      let i;
      if(e<empties.length)i=empties[e++];else{discs.push(null);i=discs.length-1}
      discs[i]=[x.artist,x.title];
      delete meta[i];
      const m=getMeta(i);
      m.addedAt=(x.added&&toIso(x.added))||new Date().toISOString();
      if(x.id)m.discogsId=x.id;
      if(x.cond)m.condition=x.cond;
      if(x.notes)m.notes=x.notes;
    });
    saveDiscs();saveMeta();buildGrid();closeBrModal();
    offerUndo('DISCOGS IMPORT ('+fresh.length+' NEW)',snap);
    toast(`DISCOGS IMPORT ✓ ${fresh.length} NEW · ${matched.length} LINKED${fresh.length?' — RUN ⬇ FETCH ART FOR COVERS':''}`,6000);
  }catch(err){alert('Discogs import failed: '+err.message)}
}

// ── DISCOGS: estimated values (lowest current marketplace listing) ──
const VALUES_KEY='cc_values_v1';
function loadValues(){try{const v=JSON.parse(safeGet(VALUES_KEY));if(v&&typeof v==='object'&&!Array.isArray(v))return v}catch(e){}return {}}
let valueCache=loadValues();
function saveValues(){return safeSet(VALUES_KEY,JSON.stringify(valueCache))}
window.addEventListener('storage',e=>{if(e.key===VALUES_KEY)valueCache=loadValues()});
// Discogs allows ~25 unauthenticated requests per minute: one global queue, spaced 2.6 s, backing off on 429.
let dgChain=Promise.resolve(),dgLast=0;
let DG_SPACING=2600;
function discogsFetchJson(url,tries=3){
  const run=async()=>{
    let lastErr=null;
    for(let a=0;a<tries;a++){
      const wait=Math.max(0,dgLast+DG_SPACING-Date.now());if(wait)await sleep(wait);
      dgLast=Date.now();
      try{
        const r=await fetchTimeout(url,{},12000);
        if(r.ok)return await r.json();
        if(r.status!==429&&r.status<500)return null;
        lastErr=new Error('HTTP '+r.status);
      }catch(e){lastErr=e}
      await sleep(5000*(a+1));
    }
    throw lastErr||new Error('Discogs request failed');
  };
  const p=dgChain.then(run);dgChain=p.catch(()=>{});return p;
}
async function discogsIdFor(i){
  const m=getMeta(i);if(m.discogsId)return m.discogsId;
  const d=discs[i];const e=d&&mbCache[keyOf(d)];
  if(!e||!e.mbid)return null;
  if(e.discogsId!==undefined&&e.discogsIdFor===e.mbid)return e.discogsId||null;
  const r=await mbFetchJson('https://musicbrainz.org/ws/2/release/'+encodeURIComponent(e.mbid)+'?inc=url-rels&fmt=json');
  const rel=((r&&r.relations)||[]).find(x=>x&&x.type==='discogs'&&x.url&&/discogs\.com\/release\/\d+/.test(x.url.resource||''));
  e.discogsId=rel?Number(/release\/(\d+)/.exec(rel.url.resource)[1]):0;
  e.discogsIdFor=e.mbid;
  saveMbCacheSoon();
  return e.discogsId||null;
}
async function estimateValueFor(i,force){
  const d=discs[i];if(isSlotEmpty(d))return null;
  const k=keyOf(d);const cur=valueCache[k];
  if(!force&&cur&&Date.now()-Date.parse(cur.at)<30*864e5)return cur;
  const id=await discogsIdFor(i);
  if(!id){valueCache[k]={discogsId:null,lowest:null,currency:null,forSale:0,at:new Date().toISOString()};saveValues();return valueCache[k]}
  const s=await discogsFetchJson('https://api.discogs.com/marketplace/stats/'+id+'?curr_abbr=USD');
  const lp=s&&s.lowest_price;
  valueCache[k]={discogsId:id,lowest:lp&&lp.value!=null?Number(lp.value):null,currency:(lp&&lp.currency)||'USD',forSale:(s&&s.num_for_sale)||0,at:new Date().toISOString()};
  saveValues();
  return valueCache[k];
}
async function estimateValues(){
  if(fetchAllRunning){toast('ANOTHER LOOKUP IS RUNNING — TRY AGAIN WHEN IT FINISHES',4000);return}
  const seen=new Set();const all=[];
  discs.forEach((d,i)=>{if(isSlotEmpty(d)||isWish(i))return;const k=keyOf(d);if(seen.has(k))return;seen.add(k);all.push(i)});
  const todo=all.filter(i=>{const v=valueCache[keyOf(discs[i])];return !v||Date.now()-Date.parse(v.at)>30*864e5});
  if(!todo.length){toast('ALL VALUES ARE LESS THAN 30 DAYS OLD ✓');return}
  const mins=Math.max(1,Math.ceil(todo.length*DG_SPACING/60000));
  if(!confirm(`Look up current Discogs prices for ${todo.length} disc(s)?\n\nUses each disc's matched edition (pin the right one with ⇄ EDITION for accuracy). Takes about ${mins} minute(s): Discogs allows ~25 requests a minute without an account.\nYou can STOP at any time; finished discs are kept.`))return;
  fetchAllRunning=true;fetchAllStop=false;
  const btn=$('fetchAllBtn');btn.disabled=true;
  $('fetchTotal').textContent=todo.length;$('fetchBarWrap').classList.add('visible');
  const t0=Date.now();let failed=0;
  for(let n=0;n<todo.length;n++){
    if(fetchAllStop)break;
    const i=todo[n];
    $('fetchCurrent').textContent=n+1;
    let label='VALUE: '+(discs[i][0]+' — '+discs[i][1]).substring(0,44);
    if(n>=3)label+='  ·  ~'+Math.ceil((Date.now()-t0)/n*(todo.length-n)/60000)+' MIN LEFT';
    $('fetchCurrentLabel').textContent=label;
    $('fetchBarFill').style.width=`${(n/todo.length)*100}%`;
    try{await estimateValueFor(i,true)}catch(e){failed++}
  }
  $('fetchBarFill').style.width='100%';
  $('fetchCurrentLabel').textContent=fetchAllStop?'STOPPED':(failed?'DONE — '+failed+' FAILED (TRY AGAIN LATER)':'VALUES UPDATED ✓');
  setTimeout(()=>$('fetchBarWrap').classList.remove('visible'),3000);
  btn.disabled=false;fetchAllRunning=false;
  toast(failed?failed+' PRICE LOOKUP(S) FAILED — RUN IT AGAIN LATER':'VALUES UPDATED ✓ — SEE 📊 STATS',5000);
}
function valueSectionHtml(){
  const seen=new Set();const rows=[];let unknown=0,noListing=0;
  discs.forEach((d,i)=>{
    if(isSlotEmpty(d)||isWish(i))return;const k=keyOf(d);if(seen.has(k))return;seen.add(k);
    const v=valueCache[k];
    if(!v)unknown++;else if(v.lowest==null)noListing++;else rows.push({i,v});
  });
  const btn=`<button class="btn" type="button" style="margin-top:8px" data-estimate-values="1">💲 ${rows.length?'UPDATE':'ESTIMATE'} VALUES (DISCOGS)</button>`;
  if(!rows.length)return `<div class="stats-section"><h3>ESTIMATED VALUE</h3><div class="no-results">No prices yet. Looks up the lowest current Discogs listing for each disc's matched edition.</div>${btn}</div>`;
  const total=rows.reduce((s,r)=>s+r.v.lowest,0);
  const top=rows.slice().sort((a,b)=>b.v.lowest-a.v.lowest).slice(0,10).map(r=>`<div class="attn-row" data-open-slot="${r.i}" title="Open disc"><span class="attn-num">${slotNum(r.i)}</span><span class="attn-title">${escH(discs[r.i][0])} — ${escH(discs[r.i][1])}</span><span class="attn-meta">${escH(fmtMoney(r.v.lowest,r.v.currency))} · ${r.v.forSale} FOR SALE</span></div>`).join('');
  return `<div class="stats-section"><h3>ESTIMATED VALUE</h3><div class="value-total">${escH(fmtMoney(total,'USD'))}</div><div class="attn-hint">SUM OF THE LOWEST CURRENT DISCOGS LISTING FOR ${rows.length} DISC(S) · ${noListing} WITH NO LISTING · ${unknown} NOT CHECKED YET. A LISTING PRICE IS NOT A GUARANTEED VALUE. MOST VALUABLE:</div>${top}${btn}</div>`;
}
function renderValueFor(i){
  const el=$('modalValue');if(!el)return;
  const d=discs[i];const v=d&&valueCache[keyOf(d)];
  if(!v){el.style.display='none';el.innerHTML='';return}
  el.style.display='';
  el.innerHTML=v.lowest!=null
    ?`DISCOGS: FROM <span>${escH(fmtMoney(v.lowest,v.currency))}</span> · ${v.forSale} FOR SALE · CHECKED ${escH(String(v.at).slice(0,10))}`
    :`DISCOGS: NO CURRENT LISTING${v.discogsId?'':' (NO DISCOGS LINK FOUND FOR THIS EDITION)'} · CHECKED ${escH(String(v.at).slice(0,10))}`;
}
$('statsContent').addEventListener('click',e=>{if(e.target.closest('[data-estimate-values]')){closeStats();estimateValues()}});

// ── COMPACT TOOLBAR: ☰ MORE menu + collapsible FILTERS panel ──
function toggleMoreMenu(e){
  if(e)e.stopPropagation();
  const m=$('moreMenu');const open=!m.classList.contains('open');
  m.classList.toggle('open',open);$('moreBtn').setAttribute('aria-expanded',String(open));
}
function closeMoreMenu(){const m=$('moreMenu');if(m&&m.classList.contains('open')){m.classList.remove('open');$('moreBtn').setAttribute('aria-expanded','false')}}
document.addEventListener('click',e=>{if(!e.target.closest('.more-wrap'))closeMoreMenu()});
$('moreMenu').addEventListener('click',e=>{if(e.target.closest('button'))closeMoreMenu()});
function toggleFilterPanel(){
  const p=$('filterPanel');const open=!p.classList.contains('open');
  p.classList.toggle('open',open);$('filterToggleBtn').setAttribute('aria-expanded',String(open));
}
function updateFilterToggleLabel(f){
  const n=['artist','flag','genre','decade','country'].filter(k=>f[k]).length;
  const b=$('filterToggleBtn');if(!b)return;
  b.textContent='⚲ FILTERS'+(n?' ('+n+')':'');
  b.classList.toggle('active',n>0);
}

