
// ════════════════════════════════════════════════════════════════
// ROUND-6 FEATURES
// ════════════════════════════════════════════════════════════════

// ── tiny IndexedDB key-value store (one database per use) ──
function kvStore(dbName){
  let dbp=null;
  const open=()=>dbp||(dbp=new Promise(res=>{
    try{const r=indexedDB.open(dbName,1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>res(r.result);r.onerror=()=>res(null);r.onblocked=()=>res(null)}
    catch(e){res(null)}
  }));
  const tx=async(mode,fn)=>{
    const db=await open();if(!db)throw new Error('IndexedDB unavailable');
    return new Promise((res,rej)=>{const t=db.transaction('kv',mode);const r=fn(t.objectStore('kv'));t.oncomplete=()=>res(r&&r.result);t.onerror=t.onabort=()=>rej(t.error||new Error('idb'))});
  };
  return {
    get:k=>tx('readonly',s=>s.get(k)),
    set:(k,v)=>tx('readwrite',s=>s.put(v,k)),
    del:k=>tx('readwrite',s=>s.delete(k)),
    all:async()=>{
      const db=await open();if(!db)return new Map();
      return new Promise(res=>{const m=new Map();const t=db.transaction('kv','readonly');const q=t.objectStore('kv').openCursor();
        q.onsuccess=()=>{const c=q.result;if(c){m.set(String(c.key),c.value);c.continue()}};t.oncomplete=()=>res(m);t.onerror=t.onabort=()=>res(m)});
    }
  };
}

// ── MULTI-DISC SETS: slots that belong together (double albums, box sets) ──
const setIdOf=i=>{const m=meta[i];return (m&&typeof m.setId==='string'&&m.setId)||null};
function setMembers(id){return id?discs.map((_,i)=>i).filter(i=>setIdOf(i)===id):[]}
function linkedWithNext(i){const a=setIdOf(i);return !!a&&i+1<discs.length&&setIdOf(i+1)===a}
function linkedWithPrev(i){return i>0&&linkedWithNext(i-1)}
function setPos(i){
  const id=setIdOf(i);if(!id)return null;
  const mem=setMembers(id);if(mem.length<2)return null;
  return {n:mem.indexOf(i)+1,of:mem.length,members:mem};
}
const newSetId=()=>'set-'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
// a "set" of one is not a set
function normalizeSets(){
  const count={};
  Object.values(meta).forEach(m=>{if(m&&m.setId)count[m.setId]=(count[m.setId]||0)+1});
  Object.values(meta).forEach(m=>{if(m&&m.setId&&count[m.setId]<2)delete m.setId});
}
function linkWithNext(i,on){
  if(i<0||i+1>=discs.length)return;
  const a=getMeta(i),b=getMeta(i+1);
  if(on){
    const id=a.setId||b.setId||newSetId();
    [a.setId,b.setId].filter(s=>s&&s!==id).forEach(old=>setMembers(old).forEach(j=>{getMeta(j).setId=id}));
    a.setId=id;b.setId=id;
  }else if(a.setId&&a.setId===b.setId){
    const tail=newSetId();
    for(let j=i+1;j<discs.length&&setIdOf(j)===a.setId;j++)getMeta(j).setId=tail;
  }
  normalizeSets();
}
function setBadge(i){const p=setPos(i);return p?`<span class="set-badge" title="Disc ${p.n} of ${p.of} of a multi-disc set">⛓${p.n}/${p.of}</span>`:''}
// albums = owned discs, with each multi-disc set counted once
function albumCount(){
  let n=0;const seen=new Set();
  discs.forEach((d,i)=>{
    if(isSlotEmpty(d)||isWish(i))return;
    const s=setPos(i)?setIdOf(i):null;
    if(s){if(seen.has(s))return;seen.add(s)}
    n++;
  });
  return n;
}
function setsSectionHtml(){
  const sets=new Map();
  discs.forEach((d,i)=>{const p=setPos(i);if(!p||isSlotEmpty(d))return;const id=setIdOf(i);if(!sets.has(id))sets.set(id,p.members)});
  if(!sets.size)return '';
  const rows=[...sets.values()].map(mem=>{
    const d=discs[mem[0]];const together=mem.every((j,k)=>k===0||j===mem[k-1]+1);
    return `<div class="attn-row${together?'':' overdue'}" data-open-slot="${mem[0]}" title="Open disc"><span class="attn-num">${slotNum(mem[0])}</span><span class="attn-title">${escH(d[0])} — ${escH(d[1])}</span><span class="attn-meta">${mem.length} DISCS · SLOTS ${mem.map(slotNum).join(', ')}${together?'':' · SPLIT UP'}</span></div>`;
  }).join('');
  return `<div class="stats-section"><h3>MULTI-DISC SETS (${sets.size})</h3><div class="attn-hint">EACH SET COUNTS AS ONE ALBUM. A SET NO LONGER IN NEIGHBOURING SLOTS SHOWS “SPLIT UP” — THE RE-SORT PLAN PUTS IT BACK TOGETHER.</div>${rows}</div>`;
}

// ── THE SHELF: discs taken out of the changer, kept with their notes / plays / art ──
const SHELF_KEY='cc_shelf_v1';
const shelfArtStore=kvStore('cc_shelf_art');
let shelf=(()=>{try{const s=JSON.parse(safeGet(SHELF_KEY));return Array.isArray(s)?s.filter(x=>x&&Array.isArray(x.disc)):[]}catch(e){return []}})();
let shelfArt=new Map();
function saveShelf(){const ok=safeSet(SHELF_KEY,JSON.stringify(shelf));scheduleAutoBackup();renderShelfPill();return ok}
async function syncShelfArt(target){   // make the stored shelf art equal to `target` (Map id -> data URL)
  for(const k of [...shelfArt.keys()])if(!target.has(k)){shelfArt.delete(k);try{await shelfArtStore.del(k)}catch(e){}}
  for(const [k,v] of target)if(shelfArt.get(k)!==v){shelfArt.set(k,v);try{await shelfArtStore.set(k,v)}catch(e){}}
}
function renderShelfPill(){const p=$('shelfPill');if(!p)return;$('shelfCount').textContent=shelf.length;p.style.display=shelf.length?'':'none'}
async function shelveSlot(i){
  const d=discs[i];if(isSlotEmpty(d))return false;
  const id='sh-'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  const m=meta[i]?JSON.parse(JSON.stringify(meta[i])):{};
  delete m.setId;                                    // a shelved disc leaves its set
  shelf.unshift({id,disc:[d[0],d[1]],meta:m,shelvedAt:new Date().toISOString(),fromSlot:i+1});
  if(customArt.has(i)){const a=customArt.get(i);shelfArt.set(id,a);try{await shelfArtStore.set(id,a)}catch(e){}await deleteCustomArt(i)}
  discs[i]=null;delete meta[i];
  if(nowPlaying&&nowPlaying.index===i){nowPlaying=null;try{localStorage.removeItem(NP_KEY)}catch(e){}}
  normalizeSets();
  return true;
}
async function shelveCurrent(){
  if(editingIndex===null)return;
  const i=editingIndex;
  if(isSlotEmpty(discs[i])){toast('THIS SLOT IS EMPTY');return}
  const snap=snapshot();
  const label=discs[i][0]+' — '+discs[i][1];
  closeEditModal();
  await shelveSlot(i);
  saveDiscs();saveMeta();saveShelf();buildGrid();
  toast('📦 ON THE SHELF: '+label,4000);
  offerUndo('SHELVED DISC '+slotNum(i),snap);
}
const firstFreeSlot=()=>discs.findIndex((d,j)=>isSlotEmpty(d)&&!isWish(j));
async function loadFromShelf(id,target){
  const item=shelf.find(x=>x.id===id);if(!item)return;
  if(!Number.isInteger(target)||target<0||target>=discs.length){toast('ENTER A SLOT NUMBER FROM 1 TO '+discs.length,4000);return}
  if(isWish(target)){toast('SLOT '+slotNum(target)+' HOLDS A WISHLIST ENTRY — PICK ANOTHER SLOT',4000);return}
  const occupied=!isSlotEmpty(discs[target]);
  if(occupied&&!confirm(`Slot ${slotNum(target)} holds ${discs[target][0]} — ${discs[target][1]}.\nIt goes onto the shelf in its place (its notes, plays and art are kept).`))return;
  const snap=snapshot();
  if(occupied)await shelveSlot(target);
  shelf=shelf.filter(x=>x.id!==id);
  discs[target]=[item.disc[0],item.disc[1]];
  meta[target]=(item.meta&&typeof item.meta==='object')?item.meta:{};
  const art=shelfArt.get(id);
  if(art){await putCustomArt(target,art);shelfArt.delete(id);try{await shelfArtStore.del(id)}catch(e){}}
  saveDiscs();saveMeta();saveShelf();buildGrid();
  if($('shelfModal').classList.contains('open'))renderShelf();
  offerUndo('LOADED FROM SHELF INTO '+slotNum(target),snap);
  toast('LOADED INTO SLOT '+slotNum(target)+' ✓',3500);
}
async function deleteFromShelf(id){
  const item=shelf.find(x=>x.id===id);if(!item)return;
  if(!confirm(`Remove “${item.disc[0]} — ${item.disc[1]}” from the shelf for good?\nIts notes and play history go with it. (You can UNDO right after.)`))return;
  const snap=snapshot();
  shelf=shelf.filter(x=>x.id!==id);
  if(shelfArt.has(id)){shelfArt.delete(id);try{await shelfArtStore.del(id)}catch(e){}}
  saveShelf();renderShelf();
  offerUndo('REMOVED FROM SHELF',snap);
}
function openShelf(){$('shelfSearch').value='';renderShelf();$('shelfModal').classList.add('open')}
function closeShelf(){$('shelfModal').classList.remove('open')}
function renderShelf(){
  const q=$('shelfSearch').value.trim().toLowerCase();
  const list=shelf.filter(x=>!q||(x.disc[0]+' '+x.disc[1]+' '+((x.meta&&x.meta.notes)||'')).toLowerCase().includes(q));
  const empties=discs.filter((d,i)=>isSlotEmpty(d)&&!isWish(i)).length;
  $('shelfSummary').textContent=shelf.length
    ?`${shelf.length} DISC(S) ON THE SHELF · ${empties} EMPTY SLOT(S) IN THE CHANGER`
    :'THE SHELF IS EMPTY. IN A DISC’S EDIT DIALOG, “MOVE TO SHELF” TAKES IT OUT OF ITS SLOT WITHOUT LOSING ITS NOTES, PLAYS OR ART.';
  $('shelfList').innerHTML=list.map(x=>{
    const m=x.meta||{};const plays=(m.playHistory||[]).length;
    const art=shelfArt.get(x.id)||autoSources(mbCache[x.disc[0]+'|'+x.disc[1]])[0]||'';
    return `<div class="shelf-item"><div class="shelf-art">${art?`<img alt="" loading="lazy" src="${escH(art)}">`:'💿'}</div>`+
      `<div class="shelf-info"><div class="shelf-artist">${escH(x.disc[0])}</div><div class="shelf-album">${escH(x.disc[1])}</div>`+
      `<div class="shelf-meta">${plays} PLAY(S)${m.condition?' · '+escH(String(m.condition).toUpperCase()):''}${m.notes?' · HAS NOTES':''} · SHELVED ${escH(String(x.shelvedAt||'').slice(0,10))}${x.fromSlot?' FROM SLOT '+String(x.fromSlot).padStart(3,'0'):''}</div></div>`+
      `<div class="shelf-actions"><button class="btn-sm gold" type="button" data-shelf-load="${escH(x.id)}">⇢ LOAD INTO SLOT…</button><button class="btn-sm" type="button" data-shelf-del="${escH(x.id)}" aria-label="Remove from shelf">✕</button></div></div>`;
  }).join('')||(shelf.length?'<div class="no-results">NO MATCHES</div>':'');
  $('shelfList').querySelectorAll('img').forEach(img=>{img.onerror=()=>{img.replaceWith(document.createTextNode('💿'))}});
}
$('shelfList').addEventListener('click',e=>{
  const l=e.target.closest('[data-shelf-load]');
  if(l){
    const free=firstFreeSlot();
    const ans=prompt(`Load into which slot (1–${discs.length})?`+(free>=0?`\nFirst empty slot: ${free+1}`:'\nThe changer is full: the disc in that slot goes onto the shelf.'),free>=0?String(free+1):'');
    if(ans===null)return;
    loadFromShelf(l.dataset.shelfLoad,parseInt(String(ans).replace(/^#/,''),10)-1);
    return;
  }
  const d=e.target.closest('[data-shelf-del]');if(d)deleteFromShelf(d.dataset.shelfDel);
});
$('shelfSearch').addEventListener('input',renderShelf);
window.addEventListener('storage',e=>{
  if(e.key!==SHELF_KEY)return;
  try{const s=JSON.parse(e.newValue);shelf=Array.isArray(s)?s:[]}catch(err){shelf=[]}
  shelfArtStore.all().then(m=>{shelfArt=m;renderShelfPill();if($('shelfModal').classList.contains('open'))renderShelf()});
});

// ── ACTIVE-FILTER PILLS: why only 14 discs are showing, one tap to undo each ──
function renderFilterPills(f){
  const el=$('filterPills');if(!el)return;
  const pills=[];
  if(f.q)pills.push(['search','SEARCH: '+f.q]);
  if(f.artist)pills.push(['artistFilter','ARTIST: '+f.artist]);
  if(f.flag)pills.push(['flagFilter','FLAG: '+f.flag.toUpperCase()]);
  if(f.genre)pills.push(['genreFilter','GENRE: '+f.genre.toUpperCase()]);
  if(f.decade)pills.push(['decadeFilter','DECADE: '+f.decade]);
  if(f.country)pills.push(['originFilter','ORIGIN: '+countryName(f.country).toUpperCase()]);
  el.innerHTML=pills.length
    ?pills.map(([k,label])=>`<button class="filter-pill" type="button" data-clear-filter="${k}" title="Remove this filter">${escH(label)} ✕</button>`).join('')+'<button class="filter-pill reset" type="button" data-clear-filter="*">RESET ALL</button>'
    :'';
  el.style.display=pills.length?'':'none';
}
$('filterPills').addEventListener('click',e=>{
  const b=e.target.closest('[data-clear-filter]');if(!b)return;
  const k=b.dataset.clearFilter;
  if(k==='*'){clearAllFilters();return}
  if(k==='search')$('searchInput').value='';else $(k).value='';
  applyFilters();
});

// ── PRINT BOOKLET: the coffee-table binder (compact A–Z index, or 4×4 cover grid per page) ──
function openPrintModal(){closeBrModal();$('printModal').classList.add('open')}
function closePrintModal(){$('printModal').classList.remove('open')}
function bookletHtml(kind){
  const rows=discs.map((d,i)=>({i,d})).filter(r=>!isSlotEmpty(r.d)&&!isWish(r.i));
  const by=(x,y)=>String(x||'').localeCompare(String(y||''),undefined,{sensitivity:'base'});
  const title=`CrateChanger — ${rows.length} discs — ${new Date().toLocaleDateString()}`;
  let css,body;
  if(kind==='emblems'){
    const cells=rows.map(r=>`<div class="e">${emblemSvg(r.i,170)}<div class="n">${slotNum(r.i)}</div><div class="t">${escH(r.d[0])} — ${escH(r.d[1])}</div></div>`);
    const pages=[];for(let k=0;k<cells.length;k+=20)pages.push(`<section class="page">${cells.slice(k,k+20).join('')}</section>`);
    css='@page{size:letter;margin:9mm}body{font-family:Arial,sans-serif;margin:0;background:#fff}.page{display:grid;grid-template-columns:repeat(4,1fr);gap:3mm;break-after:page;page-break-after:always}.page:last-child{break-after:auto;page-break-after:auto}'+
      '.e{text-align:center;break-inside:avoid}.e svg{width:100%;height:auto;display:block;-webkit-print-color-adjust:exact;print-color-adjust:exact}.n{font:bold 10pt Arial}.t{font-size:6.5pt;line-height:1.2;height:2.4em;overflow:hidden}';
    body=pages.join('');
  }else if(kind==='grid'){
    // slot order: that's how the changer's remote works. 16 per page.
    const cells=rows.map(r=>{
      const src=customArt.get(r.i)||autoSources(mbCache[keyOf(r.d)])[0]||'';
      return `<div class="c"><div class="a">${src?`<img src="${escH(src)}" alt="">`:'<span>💿</span>'}<div class="n">${slotNum(r.i)}</div></div><div class="t"><b>${escH(r.d[0])}</b><br>${escH(r.d[1])}</div></div>`;
    });
    const pages=[];for(let k=0;k<cells.length;k+=16)pages.push(`<section class="page">${cells.slice(k,k+16).join('')}</section>`);
    css='@page{size:letter;margin:10mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;margin:0;color:#000}'+
      '.page{display:grid;grid-template-columns:repeat(4,1fr);gap:4mm;break-after:page;page-break-after:always}.page:last-child{break-after:auto;page-break-after:auto}'+
      '.c{border:1px solid #999;padding:1.5mm;break-inside:avoid}.a{position:relative;aspect-ratio:1/1;background:#e8e8e8;display:flex;align-items:center;justify-content:center;overflow:hidden}'+
      '.a img{width:100%;height:100%;object-fit:cover;display:block}.a span{font-size:26pt;opacity:.3}'+
      '.n{position:absolute;left:0;bottom:0;background:#000;color:#fff;font:bold 15pt/1 Arial,sans-serif;padding:1mm 2mm}'+
      '.t{font-size:7pt;line-height:1.25;margin-top:1mm;height:2.6em;overflow:hidden}';
    body=pages.join('');
  }else{
    rows.sort((a,b)=>by(sortName(a.d[0]),sortName(b.d[0]))||by(a.d[1],b.d[1]));
    let letter='';const out=[];
    rows.forEach(r=>{
      const L=(sortName(r.d[0]).trim()[0]||'#').toUpperCase();const head=/[A-Z]/.test(L)?L:'#';
      if(head!==letter){letter=head;out.push(`<div class="L">${escH(head)}</div>`)}
      out.push(`<div class="r"><span class="ar">${escH(r.d[0])} — ${escH(r.d[1])}</span><span class="dots"></span><span class="s">${slotNum(r.i)}</span></div>`);
    });
    css='@page{size:letter;margin:10mm}body{font-family:Arial,Helvetica,sans-serif;font-size:8pt;margin:0;color:#000}h1{font-size:11pt;margin:0 0 2mm}'+
      '.cols{column-count:2;column-gap:7mm}.r{display:flex;align-items:baseline;gap:1mm;break-inside:avoid;line-height:1.32}'+
      '.ar{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:80mm}.dots{flex:1;border-bottom:1px dotted #777;min-width:3mm}'+
      '.s{font-weight:bold;font-variant-numeric:tabular-nums}.L{font-weight:bold;font-size:9pt;margin:1.6mm 0 .4mm;border-bottom:1px solid #000;break-after:avoid}';
    body=`<h1>${escH(title)}</h1><div class="cols">${out.join('')}</div>`;
  }
  // prints once the covers have loaded (or after 5 s)
  const printer='<script>(function(){var im=[].slice.call(document.images),left=im.length,done=0,fired=false;'+
    'function go(){if(fired)return;fired=true;setTimeout(function(){window.print()},250)}'+
    'if(!left){go();return}setTimeout(go,5000);im.forEach(function(i){function f(){if(++done>=left)go()}if(i.complete)f();else{i.onload=f;i.onerror=function(){i.style.visibility="hidden";f()}}})})();<\/script>';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escH(title)}</title><style>${css}</style></head><body>${body}${printer}</body></html>`;
}
function printBooklet(kind){
  const w=window.open('','_blank');
  if(!w){toast('POPUP BLOCKED — ALLOW POPUPS TO PRINT',4000);return}
  w.document.write(bookletHtml(kind));
  w.document.close();
  closePrintModal();
}

// ── PLAY ON CHANGER: Home Assistant webhook ──
const HOOK_KEY='cc_webhook_v1';
function webhookCfg(){
  try{const c=JSON.parse(safeGet(HOOK_KEY));if(c&&typeof c==='object')return {url:String(c.url||''),markPlaying:c.markPlaying!==false}}catch(e){}
  return {url:'',markPlaying:true};
}
function validWebhookUrl(u,pageProto=location.protocol){
  let x;try{x=new URL(u)}catch(e){return 'not a valid URL'}
  if(x.protocol!=='https:'&&x.protocol!=='http:')return 'it must start with https://';
  if(pageProto==='https:'&&x.protocol==='http:')return 'this page is https, so the browser blocks an http:// webhook — use your https Home Assistant address (e.g. Nabu Casa)';
  return '';
}
async function sendWebhook(url,payload){
  try{
    const r=await fetchTimeout(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)},10000);
    return r.ok?{ok:true,confirmed:true}:{ok:false,error:'HTTP '+r.status};
  }catch(e){
    // usually CORS (Home Assistant hasn't allowed this site): fall back to a plain form post, which browsers send without CORS
    try{
      await fetchTimeout(url,{method:'POST',mode:'no-cors',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(Object.entries(payload).map(([k,v])=>[k,String(v)])).toString()},10000);
      return {ok:true,confirmed:false};
    }catch(e2){return {ok:false,error:(e2&&e2.message)||'network error'}}
  }
}
async function playOnChanger(){
  if(currentModalIndex===null)return;
  const i=currentModalIndex;const d=discs[i];if(isSlotEmpty(d))return;
  const cfg=webhookCfg();
  if(!cfg.url){openSettings();return}
  const err=validWebhookUrl(cfg.url);if(err){toast('WEBHOOK: '+err.toUpperCase(),6000);return}
  const btn=$('playChangerBtn');btn.disabled=true;
  const r=await sendWebhook(cfg.url,{event:'play',slot:i+1,slot_padded:slotNum(i),artist:d[0],album:d[1],source:'cratechanger'});
  btn.disabled=false;
  if(!r.ok){toast('COULD NOT REACH THE CHANGER: '+String(r.error).toUpperCase(),5000);return}
  if(cfg.markPlaying&&currentModalIndex===i){setNowPlaying();logPlay()}
  toast(r.confirmed?'▶ SENT TO THE CHANGER ✓':'▶ SENT — NO CONFIRMATION (SEE ⚙ SETTINGS TO TURN IT ON)',4500);
}
function saveWebhookSettings(){
  const url=$('hookUrl').value.trim();
  if(url){const err=validWebhookUrl(url);if(err){toast('WEBHOOK: '+err.toUpperCase(),6000);return false}}
  safeSet(HOOK_KEY,JSON.stringify({url,markPlaying:$('hookMark').checked}));
  toast(url?'WEBHOOK SAVED ✓':'WEBHOOK REMOVED');
  return true;
}
async function testWebhook(){
  if(!saveWebhookSettings())return;
  const cfg=webhookCfg();if(!cfg.url){toast('ENTER THE WEBHOOK URL FIRST');return}
  const r=await sendWebhook(cfg.url,{event:'test',slot:0,slot_padded:'000',artist:'CrateChanger',album:'Test',source:'cratechanger'});
  toast(!r.ok?'TEST FAILED: '+String(r.error).toUpperCase():r.confirmed?'TEST SENT ✓ — HOME ASSISTANT ANSWERED':'TEST SENT — NO CONFIRMATION (ADD THIS SITE TO cors_allowed_origins TO SEE ONE)',6000);
}

// ── SYNC: private GitHub Gist (token with the Gists permission only) ──
const GIST_KEY='cc_gist_v1',GIST_DIRTY_KEY='cc_gist_dirty',GIST_DESC='CrateChanger sync — do not edit by hand';
const GIST_DATA='cratechanger-data.json',GIST_ART='cratechanger-art.json';
let gistApplying=false,gistTimer=null,gistBusy=false,gistLastPull=0;
let GIST_DELAY=15000;
function gistCfg(){try{const c=JSON.parse(safeGet(GIST_KEY));if(c&&typeof c==='object'&&c.token)return c}catch(e){}return null}
function setGistCfg(c){if(c)safeSet(GIST_KEY,JSON.stringify(c));else{try{localStorage.removeItem(GIST_KEY)}catch(e){}}}
const syncDirty=()=>safeGet(GIST_DIRTY_KEY)==='1';
function markSyncDirty(){
  if(gistApplying)return;
  const c=gistCfg();if(!c||!c.gistId)return;
  safeSet(GIST_DIRTY_KEY,'1');
  if(c.auto!==false){clearTimeout(gistTimer);gistTimer=setTimeout(()=>syncNow(false).catch(()=>{}),GIST_DELAY)}
  renderSyncStatus();
}
async function gh(path,opts={},token){
  const c=gistCfg();const tok=token||(c&&c.token);
  const headers=Object.assign({'Accept':'application/vnd.github+json','Authorization':'Bearer '+tok,'X-GitHub-Api-Version':'2022-11-28'},opts.body?{'Content-Type':'application/json'}:{});
  const r=await fetchTimeout('https://api.github.com'+path,Object.assign({},opts,{headers}),30000);
  if(r.status===401)throw new Error('GitHub rejected the token (expired or mistyped)');
  if(r.status===403||r.status===404){let msg='';try{msg=(await r.json()).message||''}catch(e){}throw new Error(r.status===404?'not found — does the token have the Gists permission?':'GitHub refused: '+msg)}
  if(!r.ok)throw new Error('GitHub HTTP '+r.status);
  return r.status===204?null:r.json();
}
// the token is never part of the payload; cover art goes in its own file so the data file stays small
function syncPayload(){
  const p=buildBackupPayload();
  const art={customArt:p.customArt||{},shelfArt:p.shelfArt||{}};
  delete p.customArt;delete p.shelfArt;
  p.valueCache=valueCache;
  return {data:JSON.stringify(p),art:JSON.stringify(art)};
}
async function gistFileText(f){
  if(!f)return null;
  if(f.truncated&&f.raw_url){const r=await fetchTimeout(f.raw_url,{},30000);if(!r.ok)throw new Error('could not download '+f.filename);return r.text()}
  return f.content;
}
const gistVersion=g=>(g&&g.history&&g.history[0]&&g.history[0].version)||(g&&g.updated_at)||null;
async function readGist(id){
  const g=await gh('/gists/'+id);
  const dataTxt=await gistFileText(g.files&&g.files[GIST_DATA]);
  const artTxt=await gistFileText(g.files&&g.files[GIST_ART]);
  return {g,ver:gistVersion(g),data:dataTxt?JSON.parse(dataTxt):null,art:artTxt?JSON.parse(artTxt):{}};
}
async function pushGist(c){
  const p=syncPayload();
  const g=await gh('/gists/'+c.gistId,{method:'PATCH',body:JSON.stringify({files:{[GIST_DATA]:{content:p.data},[GIST_ART]:{content:p.art}}})});
  c.lastVersion=gistVersion(g);c.lastSync=new Date().toISOString();c.conflict=false;setGistCfg(c);
  try{localStorage.removeItem(GIST_DIRTY_KEY)}catch(e){}
}
async function applyRemote(remote,c){
  const d=remote.data;
  if(!d||!Array.isArray(d.discs))throw new Error('the gist does not contain CrateChanger data');
  const snap=snapshot();
  gistApplying=true;
  try{
    discs=d.discs.map(normalizeDisc);while(discs.length<MIN_SLOTS)discs.push(null);
    meta=(d.meta&&typeof d.meta==='object'&&!Array.isArray(d.meta))?d.meta:{};
    if(d.mbCache&&typeof d.mbCache==='object'&&!Array.isArray(d.mbCache))mbCache=d.mbCache;
    if(d.artistCache&&typeof d.artistCache==='object'){artistCache=d.artistCache;saveArtistCache()}
    if(d.valueCache&&typeof d.valueCache==='object'){valueCache=d.valueCache;saveValues()}
    shelf=Array.isArray(d.shelf)?d.shelf.filter(x=>x&&Array.isArray(x.disc)):[];
    const art=remote.art||{};
    const ca=new Map(Object.entries(art.customArt||{}).filter(([k,v])=>/^\d+$/.test(k)&&typeof v==='string'&&v.startsWith('data:image/')).map(([k,v])=>[Number(k),v]));
    for(const k of [...customArt.keys()])if(!ca.has(k))await deleteCustomArt(k);
    for(const [k,v] of ca)if(customArt.get(k)!==v)await putCustomArt(k,v);
    await syncShelfArt(new Map(Object.entries(art.shelfArt||{}).filter(([,v])=>typeof v==='string'&&v.startsWith('data:image/'))));
    if(nowPlaying&&nowPlaying.index>=discs.length){nowPlaying=null;try{localStorage.removeItem(NP_KEY)}catch(e){}}
    saveDiscs();saveMeta();saveMbCache();saveShelf();
  }finally{gistApplying=false}
  try{localStorage.removeItem(GIST_DIRTY_KEY)}catch(e){}
  c.lastVersion=remote.ver;c.lastSync=new Date().toISOString();c.conflict=false;setGistCfg(c);
  buildGrid();
  offerUndo('SYNCED FROM GITHUB',snap);
}
async function syncNow(interactive=true){
  const c=gistCfg();
  if(!c||!c.gistId){if(interactive)openSettings();return}
  if(gistBusy)return;
  gistBusy=true;clearTimeout(gistTimer);renderSyncStatus('SYNCING…');
  try{
    const remote=await readGist(c.gistId);
    gistLastPull=Date.now();
    const remoteChanged=remote.ver!==c.lastVersion;
    const dirty=syncDirty();
    if(remoteChanged&&dirty){
      if(!interactive){c.conflict=true;setGistCfg(c);toast('☁ SYNC CONFLICT — TAP ☁ IN THE HEADER TO CHOOSE WHICH VERSION TO KEEP',7000);return}
      const keepLocal=confirm('SYNC CONFLICT — this device AND another device changed the collection since the last sync.\n\n'+
        'OK = keep THIS device\'s version (uploaded; GitHub keeps the other one in the gist\'s history)\n'+
        'Cancel = take the version from GitHub (replaces this device\'s; you can UNDO right after)');
      if(keepLocal)await pushGist(c);else await applyRemote(remote,c);
    }else if(remoteChanged){
      await applyRemote(remote,c);
      if(!interactive)toast('☁ UPDATED FROM ANOTHER DEVICE',4000);
    }else if(dirty){
      await pushGist(c);
    }
    if(interactive)toast('☁ SYNCED ✓');
  }catch(e){
    if(interactive)alert('Sync failed: '+e.message);else toast('☁ SYNC FAILED: '+String(e.message).toUpperCase(),5000);
  }finally{gistBusy=false;renderSyncStatus()}
}
async function connectGist(){
  const token=$('gistToken').value.trim();
  if(!/^(ghp_|github_pat_)[A-Za-z0-9_]{20,}$/.test(token)){alert('That doesn\'t look like a GitHub token — they start with github_pat_ (fine-grained) or ghp_ (classic).');return}
  const btn=$('gistConnectBtn');btn.disabled=true;renderSyncStatus('CONNECTING…');
  try{
    const user=await gh('/user',{},token);
    const list=await gh('/gists?per_page=100',{},token);
    const found=(list||[]).find(g=>g&&g.description===GIST_DESC&&g.files&&g.files[GIST_DATA]);
    const c={token,login:user.login,auto:true,gistId:null,lastVersion:null};
    if(found){
      c.gistId=found.id;setGistCfg(c);
      const remote=await readGist(found.id);
      const n=(remote.data&&Array.isArray(remote.data.discs))?remote.data.discs.filter(d=>!isSlotEmpty(normalizeDisc(d))).length:0;
      const load=confirm(`Found existing CrateChanger sync data on GitHub (${n} discs, last changed ${new Date(found.updated_at).toLocaleString()}).\n\n`+
        'OK = load it onto this device (replaces this device\'s collection; you can UNDO)\nCancel = keep this device\'s collection and upload it instead');
      if(load)await applyRemote(remote,c);else{c.lastVersion=remote.ver;await pushGist(c)}
    }else{
      const p=syncPayload();
      const g=await gh('/gists',{method:'POST',body:JSON.stringify({description:GIST_DESC,public:false,files:{[GIST_DATA]:{content:p.data},[GIST_ART]:{content:p.art}}})},token);
      c.gistId=g.id;c.lastVersion=gistVersion(g);c.lastSync=new Date().toISOString();setGistCfg(c);
      try{localStorage.removeItem(GIST_DIRTY_KEY)}catch(e){}
    }
    $('gistToken').value='';
    toast('☁ SYNC CONNECTED AS '+String(user.login).toUpperCase()+' ✓',5000);
  }catch(e){setGistCfg(null);alert('Could not connect: '+e.message)}
  finally{btn.disabled=false;renderSyncStatus()}
}
function disconnectGist(){
  if(!confirm('Stop syncing on this device?\n\nThe token is removed from this browser. Your collection stays here, and the private gist stays on GitHub (delete it there if you want).'))return;
  clearTimeout(gistTimer);setGistCfg(null);try{localStorage.removeItem(GIST_DIRTY_KEY)}catch(e){}
  renderSyncStatus();toast('☁ SYNC DISCONNECTED');
}
function renderSyncStatus(busyText){
  const c=gistCfg();const dirty=syncDirty();
  const pill=$('syncPill');
  if(pill){
    pill.style.display=c&&c.gistId?'':'none';
    $('syncPillText').textContent=busyText?'SYNCING':c&&c.conflict?'CONFLICT':dirty?'PENDING':'SYNCED';
    pill.classList.toggle('warn',!!(c&&c.conflict));
  }
  const st=$('syncStatus');if(!st)return;
  st.textContent=busyText||(c&&c.gistId
    ?`CONNECTED AS ${String(c.login||'?').toUpperCase()} · GIST ${String(c.gistId).slice(0,8)}… · LAST SYNC ${c.lastSync?new Date(c.lastSync).toLocaleString():'—'}${c.conflict?' · CONFLICT — PRESS SYNC NOW':dirty?' · CHANGES WAITING TO UPLOAD':' · UP TO DATE'}`
    :'NOT CONNECTED');
  $('gistConnectRow').style.display=c&&c.gistId?'none':'';
  $('gistLinkedRow').style.display=c&&c.gistId?'':'none';
  if(c&&c.gistId)$('gistAuto').checked=c.auto!==false;
}
function setGistAuto(on){const c=gistCfg();if(!c)return;c.auto=!!on;setGistCfg(c);renderSyncStatus()}
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState!=='visible')return;
  const c=gistCfg();
  if(c&&c.gistId&&c.auto!==false&&Date.now()-gistLastPull>30000)syncNow(false).catch(()=>{});
});

// ── SETTINGS dialog ──
function openSettings(){
  const h=webhookCfg();
  $('hookUrl').value=h.url;$('hookMark').checked=h.markPlaying;
  $('hookOrigin').textContent=location.origin&&location.origin!=='null'?location.origin:'https://rmillerpine75.github.io';
  renderSyncStatus();
  $('settingsModal').classList.add('open');
}
function closeSettings(){$('settingsModal').classList.remove('open')}

// ── CAMERA SCAN FALLBACK (Safari / Firefox / Chrome on Windows have no native barcode reader) ──
const ZXING_URL='https://cdn.jsdelivr.net/npm/@zxing/browser@0.2.1/umd/zxing-browser.min.js';
const ZXING_SRI='sha384-HRtzk9lZgkbSgvUyQrnfC/GxiXZgwaNyD7hC9wcXlsBpDhkS80ISl73juef2FRuf';   // pinned: a tampered copy will not run
let zxingLoading=null;
function loadZXing(){
  if(window.ZXingBrowser)return Promise.resolve(window.ZXingBrowser);
  if(zxingLoading)return zxingLoading;
  zxingLoading=new Promise((res,rej)=>{
    const s=document.createElement('script');
    s.src=ZXING_URL;s.integrity=ZXING_SRI;s.crossOrigin='anonymous';
    s.onload=()=>window.ZXingBrowser?res(window.ZXingBrowser):rej(new Error('the scanner did not initialise'));
    s.onerror=()=>{zxingLoading=null;s.remove();rej(new Error('could not load the scanner (offline?)'))};
    document.head.appendChild(s);
  });
  return zxingLoading;
}

// ── PHONE "BACK" CLOSES THE OPEN WINDOW (and #slot-012 links open a disc) ──
// Opening a window adds a history entry; Back closes the top window. Closing a window from the app NEVER navigates:
// history.back() is asynchronous and races with the next window opening (it can even step off the app), so instead
// the entry is marked "dead" in place (synchronous) and reused by the next window. A real Back over a dead entry
// just skips it.
const closingByPop=new Set();
const isLayerOpen=id=>{const el=$(id);return !!(el&&el.classList.contains('open'))};
const plainUrl=()=>location.pathname+location.search;
const histObserver=new MutationObserver(muts=>{
  muts.forEach(m=>{
    const el=m.target;const id=el.id;
    const open=el.classList.contains('open');
    const was=String(m.oldValue||'').split(/\s+/).includes('open');
    if(open===was)return;
    const st=history.state;
    try{
      if(open){
        const url=id==='infoModal'&&currentModalIndex!==null?'#slot-'+slotNum(currentModalIndex):plainUrl();
        // reuse our entry when it is dead, belongs to a window that is no longer open, or is this window's own
        const reuse=st&&st.cc&&(st.cc==='dead'||st.id===id||!isLayerOpen(st.id));
        if(reuse)history.replaceState({cc:'layer',id},'',url);else history.pushState({cc:'layer',id},'',url);
      }else{
        if(closingByPop.has(id)){closingByPop.delete(id);return}
        if(st&&st.cc==='layer'&&st.id===id)history.replaceState({cc:'dead'},'',plainUrl());
      }
    }catch(e){}
  });
});
MODAL_LAYERS.forEach(([id])=>{const el=$(id);if(el)histObserver.observe(el,{attributes:true,attributeFilter:['class'],attributeOldValue:true})});
window.addEventListener('popstate',e=>{
  const layer=openLayer();
  if(layer){closingByPop.add(layer[0]);layer[1]();return}
  if(e.state&&e.state.cc)history.back();   // landed on a dead/stale entry of ours: keep going (only ever after a real Back)
});
function openFromHash(hash){
  const m=/^#slot-(\d{1,4})$/.exec(hash||'');if(!m)return false;
  const i=Number(m[1])-1;
  try{history.replaceState(null,'',location.pathname+location.search)}catch(e){}
  if(i>=0&&i<discs.length&&!isSlotEmpty(discs[i])){openInfoModal(i);return true}
  return false;
}

// ── INSTALLABLE APP + OFFLINE (service worker; only on https / localhost) ──
function registerServiceWorker(){
  if(!('serviceWorker' in navigator))return;
  const ok=location.protocol==='https:'||location.hostname==='localhost'||location.hostname==='127.0.0.1';
  if(!ok)return;
  const hadController=!!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').then(reg=>{
    const showUpdate=()=>{if(reg.waiting&&navigator.serviceWorker.controller)$('updateBar').classList.add('visible')};
    showUpdate();
    reg.addEventListener('updatefound',()=>{const nw=reg.installing;if(nw)nw.addEventListener('statechange',()=>{if(nw.state==='installed')showUpdate()})});
    setInterval(()=>reg.update().catch(()=>{}),60*60*1000);
  }).catch(e=>console.warn('service worker not registered',e));
  let reloading=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!hadController||reloading)return;reloading=true;location.reload()});
}
function applyUpdate(){
  $('updateBar').classList.remove('visible');
  navigator.serviceWorker.getRegistration().then(reg=>{if(reg&&reg.waiting)reg.waiting.postMessage('SKIP_WAITING');else location.reload()});
}

function round6Init(){
  renderShelfPill();
  shelfArtStore.all().then(m=>{shelfArt=m}).catch(()=>{});
  renderSyncStatus();
  registerServiceWorker();
  openFromHash(location.hash);
  const c=gistCfg();
  if(c&&c.gistId&&c.auto!==false)setTimeout(()=>syncNow(false).catch(()=>{}),1500);
}

