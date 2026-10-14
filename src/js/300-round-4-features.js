
// ════════════════════════════════════════════════════════════════
// ROUND-4 FEATURES
// ════════════════════════════════════════════════════════════════

// ── MOVE TO SLOT: works on touch screens (no drag & drop there) and across a long grid ──
async function moveToSlot(){
  if(editingIndex===null)return;
  const from=editingIndex;
  const raw=String($('moveToSlot').value||'').trim().replace(/^#/,'');
  const target=Number(raw);
  if(!/^\d+$/.test(raw)||target<1||target>discs.length){toast('ENTER A SLOT NUMBER FROM 1 TO '+discs.length,4000);return}
  if(target-1===from){toast('THAT IS ALREADY THIS SLOT');return}
  await saveEdit();                      // keep anything typed in the dialog
  if(editingIndex!==null)return;         // save was cancelled
  swapSlots(from,target-1);
  const el=document.querySelector(`.slot[data-index="${target-1}"]`);
  if(el&&!el.classList.contains('filtered-out')){
    el.scrollIntoView({behavior:'smooth',block:'center'});
    el.style.outline='2px solid var(--gold)';setTimeout(()=>{el.style.outline=''},1600);
  }
}

// Re-draw the cover of every slot holding this disc (after its art sources changed)
function rewireSlotsForKey(key){
  discs.forEach((dd,j)=>{
    if(keyOf(dd)!==key)return;
    const el=document.querySelector(`.slot[data-index="${j}"]`);if(!el)return;
    const old=el.querySelector('.slot-art, .slot-art-placeholder');if(!old||!slotArtSources(j).length)return;
    const img=document.createElement('img');img.className='slot-art';img.alt='';img.loading='lazy';
    old.replaceWith(img);wireSlotImg(img,j);
  });
}

// ── EDITION PICKER: choose the exact MusicBrainz release (pressing) you own; remembered per disc ──
let editionToken=0;
function editionRow(r,curId){
  const media=Array.isArray(r.media)?r.media:[];
  const fmt=[...new Set(media.map(m=>m&&m.format).filter(Boolean))].join(' + ');
  const trk=r['track-count']||media.reduce((n,m)=>n+((m&&m['track-count'])||0),0);
  const li=Array.isArray(r['label-info'])?r['label-info'].find(x=>x&&x.label&&x.label.name):null;
  const metaTxt=[r.country,fmt,li?li.label.name:'',trk?trk+' TRACKS':''].filter(Boolean).join(' · ');
  const isCur=r.id===curId;
  return `<button class="edition-row${isCur?' current':''}" type="button" data-rel="${escH(r.id)}"><span class="ed-year">${escH((r.date||'????').slice(0,10))}</span><span class="ed-main">${escH(r.title||'')}${r.disambiguation?` <i>(${escH(r.disambiguation)})</i>`:''}</span><span class="ed-meta">${escH(metaTxt)}</span>${isCur?'<span class="ed-cur">CURRENT</span>':''}</button>`;
}
async function openEditionPicker(){
  if(currentModalIndex===null)return;
  const i=currentModalIndex;const d=discs[i];if(!d)return;
  const tok=++editionToken;
  const cur=mbCache[keyOf(d)];
  $('editionIntro').textContent=`${d[0]} — ${d[1]}: pick the pressing you actually own. Your choice is remembered, and REFRESH keeps it.`;
  $('editionList').innerHTML='<div class="no-results">Searching MusicBrainz…</div>';
  $('editionModal').classList.add('open');
  try{
    const {clean}=parseAlbum(d[1]);const artist=d[0].split('/')[0].trim();
    const titles=[clean];if(clean.includes(' / '))titles.push(clean.split(' / ')[0].trim());
    let list=[];
    for(const title of titles){
      const q='release:"'+luceneEscape(title)+'"'+(artist?' AND artist:"'+luceneEscape(artist)+'"':'');
      const r=await mbFetchJson('https://musicbrainz.org/ws/2/release/?query='+encodeURIComponent(q)+'&fmt=json&limit=25');
      if(tok!==editionToken)return;
      list=((r&&r.releases)||[]).filter(x=>x&&x.id&&(x.score==null||x.score>=60)&&artistOk(artist,(x['artist-credit']||[]).map(c=>(c.name||'')+' '+((c.artist&&c.artist.name)||'')).join(' ')));
      if(list.length)break;
    }
    if(!list.length){$('editionList').innerHTML='<div class="no-results">No editions found on MusicBrainz for this title. Check the spelling, or add a manual tracklist in the edit dialog.</div>';return}
    list.sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999'));
    $('editionList').innerHTML=list.map(r=>editionRow(r,cur&&cur.mbid)).join('');
  }catch(e){
    if(tok===editionToken)$('editionList').innerHTML='<div class="no-results">MusicBrainz is unreachable right now. Try again in a minute.</div>';
  }
}
function closeEdition(){$('editionModal').classList.remove('open');editionToken++}
async function applyEdition(pin){
  if(currentModalIndex===null)return;
  const i=currentModalIndex;const d=discs[i];if(!d)return;
  closeEdition();
  const undoSnap=snapshot();
  const token=++modalToken;
  $('trackList').innerHTML='<div class="no-results">Loading that edition…</div>';
  $('loadingPulse').style.display='';
  try{
    const data=await ensureData(d[0],d[1],true,false,pin);
    populateExtraFilters();
    rewireSlotsForKey(keyOf(d));
    if(token===modalToken)renderModalData(data,d[0],d[1],i);
    toast(pin?(data.pinned?'EDITION PINNED ✓':'THAT EDITION COULD NOT BE LOADED — KEPT THE AUTOMATIC MATCH'):'BACK TO AUTOMATIC MATCHING ✓',4000);
    offerUndo(pin?'CHANGED EDITION':'UNPINNED EDITION',undoSnap);
  }catch(e){
    if(token===modalToken)renderModalData(mbCache[keyOf(d)]||null,d[0],d[1],i);
  }
}
function useAutomaticEdition(){applyEdition(null)}
$('editionList').addEventListener('click',e=>{
  const b=e.target.closest('[data-rel]');if(!b)return;
  const id=b.dataset.rel;if(/^[\w-]{1,64}$/.test(id))applyEdition(id);
});

// ── STORAGE METER ──
function fmtBytes(n){return n<1024?n+' B':n<1048576?(n/1024).toFixed(1)+' KB':(n/1048576).toFixed(2)+' MB'}
async function renderStorageMeter(){
  const el=$('storageMeter');if(!el)return;
  let total=0;const parts=[];
  try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);const v=localStorage.getItem(k)||'';const b=(k.length+v.length)*2;total+=b;parts.push([k,b])}}catch(e){}
  parts.sort((a,b)=>b[1]-a[1]);
  const LIMIT=5*1024*1024;             // typical browser limit for this kind of storage; the real value varies by browser
  const pct=Math.min(100,Math.round(total/LIMIT*100));
  let site='';
  try{if(navigator.storage&&navigator.storage.estimate){const e=await navigator.storage.estimate();if(e&&e.usage!=null)site=`ALL PAGE DATA INCL. CUSTOM ART DATABASE: ${fmtBytes(e.usage)}`}}catch(e){}
  const warn=pct>85?'NEARLY FULL — EXPORT A BACKUP; SAVES MAY START FAILING':pct>60?'GETTING FULL':'';
  el.innerHTML=`<div class="storage-track"><div class="storage-fill${pct>85?' bad':pct>60?' warn':''}" style="width:${pct}%"></div></div>`+
    `<div class="br-last-backup">LOCAL STORAGE ${fmtBytes(total)} OF ABOUT 5 MB (${pct}%)${warn?' — '+warn:''}</div>`+
    (site?`<div class="br-last-backup">${site}</div>`:'')+
    `<div class="br-last-backup">LARGEST: ${parts.slice(0,3).map(([k,b])=>escH(k)+' '+fmtBytes(b)).join(' · ')||'—'}</div>`;
  return pct;
}

// ── AUTO-BACKUP to a file you pick (File System Access API: Chrome / Edge) ──
let abHandle=null,abState='none',abTimer=null,abBusy=false,abDirty=false,abLast=safeGet('cc_ab_last');
let AB_DELAY=8000;   // write a few seconds after the last change
function abSupported(){return typeof window.showSaveFilePicker==='function'}
function abDb(){
  return new Promise(res=>{try{const r=indexedDB.open('cc_handles',1);r.onupgradeneeded=()=>r.result.createObjectStore('h');r.onsuccess=()=>res(r.result);r.onerror=()=>res(null);r.onblocked=()=>res(null)}catch(e){res(null)}});
}
async function abStore(handle){
  const db=await abDb();if(!db)return false;
  return new Promise(res=>{try{const tx=db.transaction('h','readwrite');tx.objectStore('h').put(handle,'autobackup');tx.oncomplete=()=>{db.close();res(true)};tx.onerror=tx.onabort=()=>{db.close();res(false)}}catch(e){try{db.close()}catch(_){}res(false)}});
}
async function abLoad(){
  const db=await abDb();if(!db)return null;
  return new Promise(res=>{try{const tx=db.transaction('h','readonly');const q=tx.objectStore('h').get('autobackup');q.onsuccess=()=>{db.close();res(q.result||null)};q.onerror=()=>{db.close();res(null)}}catch(e){try{db.close()}catch(_){}res(null)}});
}
async function abForget(){
  const db=await abDb();if(!db)return;
  await new Promise(res=>{try{const tx=db.transaction('h','readwrite');tx.objectStore('h').delete('autobackup');tx.oncomplete=tx.onerror=tx.onabort=()=>{db.close();res()}}catch(e){res()}});
}
async function abInit(){
  if(!abSupported()){abState='unsupported';renderAutoBackupStatus();return}
  const h=await abLoad();
  if(!h){abState='none';renderAutoBackupStatus();return}
  abHandle=h;
  try{abState=(await h.queryPermission({mode:'readwrite'}))==='granted'?'ready':'needs-permission'}catch(e){abState='needs-permission'}
  if(abState==='needs-permission')toast('AUTO-BACKUP NEEDS YOUR OK AGAIN — OPEN 💾 BACKUP AND CLICK RE-ENABLE',6000);
  renderAutoBackupStatus();
}
async function linkBackupFile(){
  if(!abSupported()){toast('THIS BROWSER CANNOT LINK A BACKUP FILE — USE EXPORT JSON',5000);return}
  let h;
  try{
    h=await window.showSaveFilePicker({suggestedName:'CrateChanger_autobackup.json',types:[{description:'CrateChanger backup',accept:{'application/json':['.json']}}]});
  }catch(e){if(e&&e.name!=='AbortError')toast('COULD NOT LINK THE FILE: '+(e.message||e),5000);return}
  abHandle=h;abState='ready';
  const remembered=await abStore(h);
  const ok=await abWrite(true);
  renderAutoBackupStatus();
  if(ok)toast(remembered?'AUTO-BACKUP LINKED ✓ — WRITTEN NOW AND AFTER EVERY CHANGE':'AUTO-BACKUP LINKED FOR THIS SESSION ONLY (THE BROWSER WOULD NOT REMEMBER THE FILE)',5000);
}
async function reenableAutoBackup(){
  if(!abHandle)return;
  try{abState=(await abHandle.requestPermission({mode:'readwrite'}))==='granted'?'ready':'needs-permission'}catch(e){abState='needs-permission'}
  if(abState==='ready')await abWrite(true);
  renderAutoBackupStatus();
}
async function unlinkBackupFile(){
  clearTimeout(abTimer);abHandle=null;abState=abSupported()?'none':'unsupported';abDirty=false;
  await abForget();renderAutoBackupStatus();
  toast('AUTO-BACKUP UNLINKED (THE FILE ITSELF IS LEFT AS IT IS)');
}
function scheduleAutoBackup(){
  markSyncDirty();
  if(abState!=='ready')return;
  abDirty=true;clearTimeout(abTimer);abTimer=setTimeout(()=>abWrite(false),AB_DELAY);
}
async function abWrite(force){
  if(abState!=='ready'||!abHandle)return false;
  if(abBusy){abDirty=true;return false}
  if(!force&&!abDirty)return false;
  abBusy=true;abDirty=false;
  try{
    const w=await abHandle.createWritable();
    await w.write(JSON.stringify(buildBackupPayload()));
    await w.close();
    abLast=new Date().toISOString();safeSet('cc_ab_last',abLast);safeSet(BACKUP_KEY,abLast);
    return true;
  }catch(e){
    abDirty=true;
    if(e&&(e.name==='NotAllowedError'||e.name==='SecurityError')){abState='needs-permission';toast('AUTO-BACKUP LOST PERMISSION — RE-ENABLE IT IN 💾 BACKUP',6000)}
    else toast('AUTO-BACKUP WRITE FAILED: '+((e&&e.message)||e),5000);
    return false;
  }finally{
    abBusy=false;renderAutoBackupStatus();
  }
}
function flushAutoBackup(){clearTimeout(abTimer);if(abDirty)return abWrite(false)}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flushAutoBackup()});
function renderAutoBackupStatus(){
  const el=$('abStatus');if(!el)return;
  const name=(abHandle&&abHandle.name)||'';
  const when=abLast?new Date(abLast).toLocaleString():'not yet';
  el.textContent={
    unsupported:'NOT AVAILABLE IN THIS BROWSER (NEEDS CHROME OR EDGE) — USE EXPORT JSON',
    none:'NOT LINKED',
    ready:`LINKED → ${name} · LAST WRITTEN ${when}`,
    'needs-permission':`LINKED → ${name} — THE BROWSER NEEDS YOUR OK AGAIN`
  }[abState]||'';
  const link=$('abLinkBtn');
  link.disabled=abState==='unsupported';
  link.textContent=abState==='ready'?'⇄ CHANGE FILE':'🔗 LINK BACKUP FILE';
  link.style.display=abState==='needs-permission'?'none':'';
  $('abReenableBtn').style.display=abState==='needs-permission'?'':'none';
  $('abUnlinkBtn').style.display=(abState==='ready'||abState==='needs-permission')?'':'none';
}

// ── RE-SORT PLAN: the fewest swaps to put the PHYSICAL changer in order ──
function swapCore(a,b){
  [discs[a],discs[b]]=[discs[b],discs[a]];
  [meta[a],meta[b]]=[meta[b],meta[a]];
  if(meta[a]===undefined)delete meta[a];
  if(meta[b]===undefined)delete meta[b];
  if(nowPlaying){if(nowPlaying.index===a)nowPlaying.index=b;else if(nowPlaying.index===b)nowPlaying.index=a}
  const va=customArt.get(a),vb=customArt.get(b);
  if(vb!==undefined)customArt.set(a,vb);else customArt.delete(a);
  if(va!==undefined)customArt.set(b,va);else customArt.delete(b);
}
async function rewriteArtStore(){
  try{await idbReq('readwrite',s=>{s.clear();for(const [k,v] of customArt)s.put(v,k);return null})}
  catch(e){toast('COULD NOT SAVE THE NEW CUSTOM-ART ORDER — EXPORT A BACKUP',6000)}
  bumpArtRev();
}
// key: artist | album | year · compact: empty slots go to the end · wishlist slots never move (not physical discs)
function computeResortPlan(key,compact){
  const n=discs.length;
  const movable=[];let fixed=0;
  for(let i=0;i<n;i++){if(isWish(i))fixed++;else movable.push(i)}
  const nonEmpty=movable.filter(i=>!isSlotEmpty(discs[i]));
  const empties=movable.filter(i=>isSlotEmpty(discs[i]));
  const by=(x,y)=>String(x||'').localeCompare(String(y||''),undefined,{sensitivity:'base'});
  const cmp=(a,b)=>{
    const da=discs[a],db=discs[b];
    const art=by(sortName(da[0]),sortName(db[0])),alb=by(da[1],db[1]);
    let r;
    if(key==='album')r=alb||art;
    else if(key==='year')r=(effectiveYear(a)||'9999').localeCompare(effectiveYear(b)||'9999')||art||alb;
    else r=art||alb;
    return r||a-b;
  };
  // multi-disc sets travel as one block, keeping their current order
  const units=[];const bySet=new Map();
  nonEmpty.forEach(i=>{const s=setPos(i)?setIdOf(i):null;if(s){if(bySet.has(s)){bySet.get(s).push(i);return}const u=[i];bySet.set(s,u);units.push(u)}else units.push([i])});
  const sorted=units.slice().sort((u,v)=>cmp(u[0],v[0])).flat();
  const slots=compact?movable.slice():nonEmpty.slice();
  const want=compact?sorted.concat(empties):sorted;          // want[k] = the disc (original slot) that must end at slots[k]
  const content={},where={};
  slots.forEach(i=>{content[i]=i;where[i]=i});
  const steps=[];
  for(let k=0;k<slots.length;k++){
    const s=slots[k],w=want[k];
    if(content[s]===w)continue;
    const p=where[w],cs=content[s];
    steps.push({a:s,b:p,x:cs,y:w});                              // swap slot s (holds x) with slot p (holds y)
    content[s]=w;content[p]=cs;where[w]=s;where[cs]=p;
  }
  const moved=nonEmpty.filter(o=>where[o]!==o).length;
  return {steps,moved,fixed};
}
let resortPlan=null;
const discLabel=o=>{const d=discs[o];return isSlotEmpty(d)?'(empty)':(d[0]||'?')+' — '+(d[1]||'?')};
function openResort(){closeBrModal();$('resortModal').classList.add('open');renderResortPlan()}
function closeResort(){$('resortModal').classList.remove('open')}
function renderResortPlan(){
  resortPlan=computeResortPlan($('resortKey').value,$('resortCompact').checked);
  const p=resortPlan;
  $('resortSummary').textContent=p.steps.length
    ?`${p.steps.length} SWAP(S) · ${p.moved} DISC(S) CHANGE SLOT · ${p.fixed} WISHLIST SLOT(S) STAY PUT`
    :'ALREADY IN THIS ORDER ✓';
  $('resortSteps').innerHTML=p.steps.map((s,k)=>`<label class="rs-step"><input type="checkbox"><span class="rs-n">${k+1}.</span><span class="rs-slots">${String(s.a+1).padStart(3,'0')} ⇄ ${String(s.b+1).padStart(3,'0')}</span><span class="rs-names">${escH(discLabel(s.x))}  ⇄  ${escH(discLabel(s.y))}</span></label>`).join('');
}
$('resortSteps').addEventListener('change',e=>{const r=e.target.closest('.rs-step');if(r)r.classList.toggle('done',e.target.checked)});
function resortStepsText(){
  const p=resortPlan||computeResortPlan($('resortKey').value,$('resortCompact').checked);
  return 'CrateChanger re-sort plan ('+$('resortKey').value+')\n'+p.steps.map((s,k)=>`${k+1}. swap slot ${s.a+1} <-> slot ${s.b+1}:  ${discLabel(s.x)}  <->  ${discLabel(s.y)}`).join('\n');
}
async function copyResortSteps(){
  const txt=resortStepsText();
  try{await navigator.clipboard.writeText(txt);toast('STEPS COPIED ✓')}
  catch(e){triggerDownload(new Blob([txt],{type:'text/plain'}),'CrateChanger_resort_steps.txt');toast('CLIPBOARD BLOCKED — STEPS DOWNLOADED AS A TEXT FILE',4000)}
}
async function applyResort(){
  const p=computeResortPlan($('resortKey').value,$('resortCompact').checked);
  if(!p.steps.length){toast('ALREADY IN THIS ORDER ✓');return}
  if(!confirm(`Apply ${p.steps.length} swap(s) to the app now?\n\nDo this after you have re-ordered the physical changer (or simply to re-order the list).\nFlags, notes, play history and custom art move with each disc. You can UNDO right after.`))return;
  const undoSnap=snapshot();
  p.steps.forEach(s=>swapCore(s.a,s.b));
  await rewriteArtStore();
  if(nowPlaying)safeSet(NP_KEY,JSON.stringify(nowPlaying));
  saveDiscs();saveMeta();buildGrid();closeResort();
  toast(`RE-SORTED WITH ${p.steps.length} SWAP(S) ✓`,4000);
  offerUndo('RE-SORT ('+p.steps.length+' SWAPS)',undoSnap);
}

// ── SHAREABLE READ-ONLY PAGE: one standalone HTML file; private data only if you tick it ──
function openShare(){closeBrModal();$('shareModal').classList.add('open')}
function closeShare(){$('shareModal').classList.remove('open')}
function sharePageHtml(opts){
  const rows=[];
  discs.forEach((d,i)=>{
    if(isSlotEmpty(d))return;
    const wish=isWish(i);
    if(wish&&!opts.wishlist)return;
    const srcs=[];
    if(opts.art){if(customArt.has(i))srcs.push(customArt.get(i));srcs.push(...autoSources(mbCache[keyOf(d)]).slice(0,4))}
    rows.push({artist:d[0]||'',album:d[1]||'',year:opts.meta?(effectiveYear(i)||''):'',genres:opts.meta?effectiveGenres(i).slice(0,3):[],note:opts.notes?(getMeta(i).notes||''):'',wish,srcs});
  });
  const by=(x,y)=>x.localeCompare(y,undefined,{sensitivity:'base'});
  rows.sort((a,b)=>by(sortName(a.artist),sortName(b.artist))||by(a.album,b.album));
  const card=r=>`<div class="card" data-s="${escH((r.artist+' '+r.album+' '+r.genres.join(' ')+' '+r.year).toLowerCase())}"><div class="art">${r.srcs.length?`<img alt="" loading="lazy" data-srcs="${escH(JSON.stringify(r.srcs))}">`:'<span class="ph">💿</span>'}</div><div class="info"><div class="a">${escH(r.artist)}</div><div class="t">${escH(r.album)}</div>${(r.year||r.genres.length)?`<div class="m">${escH([r.year,...r.genres].filter(Boolean).join(' · '))}</div>`:''}${r.note?`<div class="n">${escH(r.note)}</div>`:''}</div></div>`;
  const owned=rows.filter(r=>!r.wish),wished=rows.filter(r=>r.wish);
  const title=escH(opts.title||'My CD Collection');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}body{background:#0a0a0c;color:#e0ddd8;font-family:system-ui,-apple-system,Segoe UI,sans-serif;padding:24px}
h1{font-size:1.6rem;letter-spacing:2px}h2{font-size:1rem;letter-spacing:3px;color:#b77ce8;margin:28px 0 12px}.sub{color:#6a6870;font-size:.8rem;margin:4px 0 16px}
#q{width:100%;max-width:420px;padding:9px 12px;background:#18181e;border:1px solid #2a2a35;color:#e0ddd8;font-size:.9rem;margin-bottom:18px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}.card{background:#111114;border:1px solid #2a2a35}
.art{aspect-ratio:1/1;background:#18181e;display:flex;align-items:center;justify-content:center}.art img{width:100%;height:100%;object-fit:cover;display:block}.ph{font-size:2rem;opacity:.3}
.info{padding:7px 8px}.a{color:#ff4a50;font-size:.68rem;text-transform:uppercase;letter-spacing:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.t{font-size:.82rem;font-weight:600;margin-top:2px}
.m{font-size:.68rem;color:#8a8890;margin-top:3px}.n{font-size:.68rem;color:#8a8890;font-style:italic;margin-top:4px;white-space:pre-wrap}
@media (prefers-color-scheme:light){body{background:#f0ede8;color:#1a1814}.card{background:#faf8f5;border-color:#c4bfb8}.art{background:#e8e4df}#q{background:#faf8f5;color:#1a1814;border-color:#c4bfb8}.a{color:#c8292e}}
</style></head><body>
<h1>${title}</h1><div class="sub"><span id="cnt">${owned.length}</span> of ${owned.length} discs · made with CrateChanger · ${escH(new Date().toLocaleDateString())}</div>
<input id="q" type="search" placeholder="Search artist, album, genre, year…" aria-label="Search">
<div class="grid" id="owned">${owned.map(card).join('')}</div>
${wished.length?`<h2>WISHLIST</h2><div class="grid">${wished.map(card).join('')}</div>`:''}
<script>
document.querySelectorAll('img[data-srcs]').forEach(function(img){var l;try{l=JSON.parse(img.getAttribute('data-srcs'))}catch(e){l=[]}var n=function(){if(!l.length){var s=document.createElement('span');s.className='ph';s.textContent='\\u{1F4BF}';img.replaceWith(s);return}img.src=l.shift()};img.onerror=n;n()});
var q=document.getElementById('q'),cards=[].slice.call(document.querySelectorAll('#owned .card'));
q.addEventListener('input',function(){var t=q.value.toLowerCase().trim().split(/\\s+/).filter(Boolean),n=0;cards.forEach(function(c){var s=c.getAttribute('data-s'),ok=t.every(function(x){return s.indexOf(x)>-1});c.style.display=ok?'':'none';if(ok)n++});document.getElementById('cnt').textContent=n});
<\/script></body></html>`;
}
function downloadSharePage(){
  const html=sharePageHtml({title:$('shareTitle').value.trim()||'My CD Collection',art:$('shareArt').checked,meta:$('shareMeta').checked,wishlist:$('shareWish').checked,notes:$('shareNotes').checked});
  triggerDownload(new Blob([html],{type:'text/html'}),`CrateChanger_share_${new Date().toISOString().slice(0,10)}.html`);
  closeShare();toast('SHAREABLE PAGE DOWNLOADED ✓',4000);
}

// ── HELP (keyboard shortcuts) ──
function openHelp(){$('helpModal').classList.add('open')}
function closeHelp(){$('helpModal').classList.remove('open')}

// ── ART FIT: crop covers to a square, or show the whole image ──
function toggleArtFit(){
  const full=document.body.classList.toggle('art-contain');
  $('artFitBtn').textContent=full?'▣ FIT: FULL':'▣ FIT: CROP';
  safeSet('cc_artfit',full?'full':'crop');
}
if(safeGet('cc_artfit')==='full'){document.body.classList.add('art-contain');$('artFitBtn').textContent='▣ FIT: FULL'}

// ── STATS: "pick a neglected disc" ──
$('statsContent').addEventListener('click',e=>{
  if(!e.target.closest('[data-pick-neglected]'))return;
  closeStats();
  pickRandom(i=>!!(window._neglectedSet&&window._neglectedSet.has(i)),true);
});

