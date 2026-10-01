
// ════════════════════════════════════════════════════════════════
// IMPORT FROM v7 — cd_changer_7(.html / _hardened) saved its list under different keys in this same browser
// ════════════════════════════════════════════════════════════════
const V7_DISC_KEY='crate_changer_v1', V7_CACHE_KEY='crate_changer_cache_v4', V7_SEEN_KEY='cc_v7_seen';
function hashStr(s){let h=5381;for(let i=0;i<s.length;i++)h=((h<<5)+h+s.charCodeAt(i))|0;return (h>>>0).toString(36)}
function readV7List(){
  const raw=safeGet(V7_DISC_KEY);if(!raw)return null;
  try{
    const p=JSON.parse(raw);if(!Array.isArray(p))return null;
    const list=p.map(normalizeDisc);while(list.length<MIN_SLOTS)list.push(null);
    return {list,raw};
  }catch(e){return null}
}
function countDiffSlots(a,b){
  let n=0;const len=Math.max(a.length,b.length);
  for(let i=0;i<len;i++)if(keyOf(a[i]||null)!==keyOf(b[i]||null))n++;
  return n;
}
function readV7Cache(){
  try{const c=JSON.parse(safeGet(V7_CACHE_KEY));return (c&&typeof c==='object'&&!Array.isArray(c))?c:{}}catch(e){return {}}
}
// Custom art uploaded in v7: original v7 kept it inside its lookup cache; v7_hardened moved it to IndexedDB "crate_changer_art".
async function readV7Art(){
  const art=new Map();   // "artist|album" -> data URL
  for(const [k,e] of Object.entries(readV7Cache())){
    if(!e||typeof e!=='object')continue;
    const u=e.customArt||(Array.isArray(e.artSources)?e.artSources.find(s=>typeof s==='string'&&s.startsWith('data:image/')):null);
    if(typeof u==='string'&&u.startsWith('data:image/'))art.set(k,u);
  }
  try{
    if(indexedDB.databases&&(await indexedDB.databases()).some(d=>d.name==='crate_changer_art')){   // never create it
      const db=await new Promise((res,rej)=>{const r=indexedDB.open('crate_changer_art');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
      if(db.objectStoreNames.contains('art')){
        await new Promise(res=>{
          const tx=db.transaction('art','readonly');const q=tx.objectStore('art').openCursor();
          q.onsuccess=()=>{const c=q.result;if(c){if(typeof c.value==='string'&&c.value.startsWith('data:image/'))art.set(String(c.key),c.value);c.continue()}};
          tx.oncomplete=res;tx.onerror=tx.onabort=res;
        });
      }
      db.close();
    }
  }catch(e){}
  return art;
}
async function planV7Import(){
  const v7=readV7List();if(!v7)return null;
  const art=await readV7Art();
  const cache=readV7Cache();
  // flags / notes / play history / custom art FOLLOW THEIR DISC to its v7 slot (matched by artist + album)
  const pool=new Map();
  discs.forEach((d,i)=>{const k=keyOf(d);if(!k)return;if(!pool.has(k))pool.set(k,[]);pool.get(k).push(i)});
  const moves=[];
  v7.list.forEach((d,j)=>{const k=keyOf(d);const q=k&&pool.get(k);if(q&&q.length)moves.push([q.shift(),j])});
  const movedFrom=new Set(moves.map(m=>m[0]));
  const hasData=i=>{const m=meta[i];return !!((m&&((m.flags&&m.flags.length)||m.notes||m.condition||(m.playHistory&&m.playHistory.length)||m.loanedTo||m.override))||customArt.has(i))};
  const orphans=[...new Set([...Object.keys(meta).map(Number),...customArt.keys()])].filter(i=>hasData(i)&&!movedFrom.has(i));
  const artForSlots=new Map();
  v7.list.forEach((d,j)=>{const k=keyOf(d);if(k&&art.has(k))artForSlots.set(j,art.get(k))});
  const newCacheKeys=Object.keys(cache).filter(k=>!entryComplete(mbCache[k])&&entryComplete(cache[k]));
  return {v7,diff:countDiffSlots(v7.list,discs),moves,orphans,artForSlots,cache,newCacheKeys,hash:hashStr(v7.raw)};
}
function updateV7Label(){
  const el=$('v7StatusLabel'),btn=$('importV7Btn');if(!el)return;
  const v7=readV7List();
  if(!v7){el.textContent='NO v7 DATA FOUND IN THIS BROWSER';btn.disabled=true;return}
  const n=countDiffSlots(v7.list,discs);
  el.textContent=n?`v7 LIST FOUND — ${n} SLOT(S) DIFFER FROM THIS BUILD`:'v7 LIST FOUND — MATCHES THIS BUILD ✓';
  btn.disabled=false;
}
async function importFromV7(fromPrompt=false){
  const plan=await planV7Import();
  if(!plan){toast('NO v7 DISC LIST FOUND IN THIS BROWSER',4000);return}
  const nothingToDo=!plan.diff&&![...plan.artForSlots.keys()].some(j=>!customArt.has(j))&&!plan.newCacheKeys.length;
  if(nothingToDo){safeSet(V7_SEEN_KEY,plan.hash);if(!fromPrompt)toast('THE v7 LIST ALREADY MATCHES ✓');updateV7Label();return}
  const msg='IMPORT FROM v7 — dry run:\n'+
    `  ${plan.diff} of ${Math.max(plan.v7.list.length,discs.length)} slots change to match your v7 list\n`+
    `  ${plan.v7.list.filter(d=>!isSlotEmpty(d)).length} discs in the v7 list\n`+
    `  ${plan.artForSlots.size} custom art image(s) from v7\n`+
    `  ${plan.newCacheKeys.length} cover-art / tracklist lookups reused from v7 (no re-fetching)\n`+
    (plan.orphans.length?`  ⚠ ${plan.orphans.length} slot(s) here have flags/notes/art for a disc that is NOT in the v7 list — that data is dropped (it stays in the safety backup)\n`:'')+
    '\nFlags, notes, play history and custom art already in this build follow their disc to its v7 slot.\n'+
    'A safety backup of the current state downloads first, and you can UNDO right after.\n\nImport now?'+
    (fromPrompt?'\n\n(Cancel = not now; the BACKUP dialog has an IMPORT FROM v7 button.)':'');
  if(!confirm(msg)){if(fromPrompt)safeSet(V7_SEEN_KEY,plan.hash);return}

  triggerDownload(new Blob([JSON.stringify(buildBackupPayload())],{type:'application/json'}),`CrateChanger_pre-v7-import_${new Date().toISOString().replace(/[:.]/g,'-')}.json`);
  const undoSnap=snapshot();
  const oldMeta=meta,oldArt=new Map(customArt);
  const newMeta={},newArt=new Map();
  plan.moves.forEach(([from,to])=>{if(oldMeta[from])newMeta[to]=oldMeta[from];if(oldArt.has(from))newArt.set(to,oldArt.get(from))});
  for(const [j,u] of plan.artForSlots){
    if(newArt.has(j))continue;   // art you set in this build wins over v7's
    let img=u;if(u.length>150000){try{img=await resizeToDataUrl(u,500)}catch(e){}}
    newArt.set(j,img);
  }
  if(nowPlaying){const mv=plan.moves.find(m=>m[0]===nowPlaying.index);if(mv)nowPlaying.index=mv[1];else nowPlaying=null}
  discs=plan.v7.list.slice();
  meta=newMeta;
  for(const k of plan.newCacheKeys){
    const e=JSON.parse(JSON.stringify(plan.cache[k]));
    delete e.customArt;
    if(Array.isArray(e.artSources))e.artSources=e.artSources.filter(s=>typeof s==='string'&&!s.startsWith('data:'));
    mbCache[k]=e;
  }
  await clearCustomArt();
  for(const [j,u] of newArt)await putCustomArt(j,u);
  if(nowPlaying)safeSet(NP_KEY,JSON.stringify(nowPlaying));else{try{localStorage.removeItem(NP_KEY)}catch(e){}}
  saveDiscs();saveMeta();saveMbCache();safeSet(V7_SEEN_KEY,plan.hash);
  buildGrid();closeBrModal();updateV7Label();
  toast('IMPORTED YOUR v7 LIST ✓',4000);
  offerUndo('IMPORTED v7 LIST',undoSnap);
}
// On open: if v7 has a list that differs (and this exact v7 list hasn't been imported or declined), offer it once.
async function offerV7Import(){
  const v7=readV7List();if(!v7)return;
  if(safeGet(V7_SEEN_KEY)===hashStr(v7.raw))return;
  await importFromV7(true);
}
