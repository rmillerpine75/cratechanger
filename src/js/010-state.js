
// ════════════════════════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════════════════════════
const DISC_KEY    = 'cc_discs_v1';
const CACHE_KEY   = 'cc_cache_v4';
const META_KEY    = 'cc_meta_v1';   // flags, notes, condition, playHistory, loanInfo per slot (custom art lives in IndexedDB since the hardened build)
const NP_KEY      = 'cc_nowplaying';
const BACKUP_KEY  = 'cc_last_backup';
const MIN_SLOTS   = 200;            // slots are dynamic now: use "+ SLOT" in edit mode to add more
const SCHEMA_VERSION = 2;

// NOTE: INITIAL_DATA only seeds a FRESH browser profile. After the first edit the list lives in
// localStorage[DISC_KEY] and changes to INITIAL_DATA are ignored. Use BACKUP > EXPORT / IMPORT to move data.

const $ = id => document.getElementById(id);

// ── safe storage ──────────────────────────────────────────────
function safeGet(key){try{return localStorage.getItem(key)}catch(e){return null}}
function safeSet(key,val){
  try{localStorage.setItem(key,val);return true}
  catch(e){toast('BROWSER STORAGE FULL OR BLOCKED — EXPORT A BACKUP NOW',6000);return false}
}

function normalizeDisc(d){
  if(!Array.isArray(d))return null;
  const a=typeof d[0]==='string'?d[0]:'';
  const b=typeof d[1]==='string'?d[1]:'';
  return (!a&&!b)?null:[a,b];
}
const keyOf=d=>(d?d[0]+'|'+d[1]:null);

function loadDiscs(){
  let list=null;
  const saved=safeGet(DISC_KEY);
  if(saved){
    try{const p=JSON.parse(saved);if(Array.isArray(p))list=p.map(normalizeDisc)}
    catch(e){console.warn('Saved disc list unreadable - keeping a raw copy and starting from defaults',e);safeSet(DISC_KEY+'_corrupt',saved)}
  }
  if(!list)list=INITIAL_DATA.map(normalizeDisc);
  while(list.length<MIN_SLOTS)list.push(null);
  return list;
}
function saveDiscs(){scheduleAutoBackup();return safeSet(DISC_KEY,JSON.stringify(discs))}
function loadMeta(){
  try{const m=JSON.parse(safeGet(META_KEY));if(m&&typeof m==='object'&&!Array.isArray(m))return m}catch(e){}
  return {};
}
function saveMeta(){scheduleAutoBackup();return safeSet(META_KEY,JSON.stringify(meta))}
function loadMbCache(){
  try{const c=JSON.parse(safeGet(CACHE_KEY));if(c&&typeof c==='object'&&!Array.isArray(c))return c}catch(e){}
  return {};
}
let saveTimer=null;
function saveMbCache(){clearTimeout(saveTimer);return safeSet(CACHE_KEY,JSON.stringify(mbCache))}
function saveMbCacheSoon(){clearTimeout(saveTimer);saveTimer=setTimeout(saveMbCache,600)}

let discs   = loadDiscs();
let meta    = loadMeta();   // meta[index] = {flags:[],notes:'',condition:'',playHistory:[],loanedTo:'',loanDate:''}
let mbCache = loadMbCache();

// UI state
let editMode      = false;
let listView      = false;
let multiSelect   = false;
let selectedSlots = new Set();
let editingIndex  = null;
let pendingArtData= null;   // null = untouched | string = new resized data URL | false = remove custom / clear auto
let currentModalIndex = null;
let activeFlags   = {};
let fetchAllRunning = false;
let fetchAllStop    = false;
let nowPlaying      = null;
try{ nowPlaying = JSON.parse(safeGet(NP_KEY)); }catch(e){}
if(nowPlaying && typeof nowPlaying.index!=='number') nowPlaying=null;

// ── helpers ───────────────────────────────────────────────────
function escH(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function msToMin(ms){const s=Math.round(ms/1000);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
function toast(msg,dur=2500){
  const t=document.getElementById('toast');if(!t)return;
  t.textContent=msg;t.classList.add('show');
  clearTimeout(toast._t);toast._t=setTimeout(()=>t.classList.remove('show'),dur);
}
function getMeta(i){
  let m=meta[i];
  if(!m||typeof m!=='object')m=meta[i]={};
  if(!Array.isArray(m.flags))m.flags=[];
  if(!Array.isArray(m.playHistory))m.playHistory=[];
  if(typeof m.notes!=='string')m.notes='';
  if(typeof m.condition!=='string')m.condition='';
  if(typeof m.loanedTo!=='string')m.loanedTo='';
  if(typeof m.loanDate!=='string')m.loanDate='';
  return m;
}
function isSlotEmpty(disc){return !disc||(!disc[0]&&(!disc[1]||disc[1]==='unknown'))}

function triggerDownload(blob,name){
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=name;
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),4000);
}

// A lookup-cache entry is "complete" once MusicBrainz was successfully consulted (even if it found nothing),
// it has tracks, or the title was deliberately skipped. Incomplete entries are retried automatically.
const entryComplete=e=>!!e&&(e.mbTried===true||e.skipped===true||(Array.isArray(e.tracks)&&e.tracks.length>0));

// ── focus helpers ─────────────────────────────────────────────
let lastFocus=null;
function rememberFocus(){lastFocus=document.activeElement}
function restoreFocus(){
  if(lastFocus&&document.contains(lastFocus)&&typeof lastFocus.focus==='function')lastFocus.focus();
  lastFocus=null;
}

// ════════════════════════════════════════════════════════════════
// CUSTOM ART STORE — IndexedDB, keyed by SLOT INDEX (same model as flags/notes/play history,
// so art travels with the disc when slots are swapped). Never touched by lookup-cache clears.
// ════════════════════════════════════════════════════════════════
const customArt=new Map();   // slot index -> resized JPEG data URL
let artDB=null;

function openArtDB(){
  return new Promise(resolve=>{
    try{
      const req=indexedDB.open('cc_custom_art',1);
      req.onupgradeneeded=()=>req.result.createObjectStore('art');
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>resolve(null);
      req.onblocked=()=>resolve(null);
    }catch(e){resolve(null)}
  });
}
function idbReq(mode,fn){
  return new Promise((resolve,reject)=>{
    if(!artDB)return reject(new Error('no-idb'));
    try{
      const tx=artDB.transaction('art',mode);
      const r=fn(tx.objectStore('art'));
      tx.oncomplete=()=>resolve(r&&r.result);
      tx.onerror=tx.onabort=()=>reject(tx.error||new Error('idb'));
    }catch(e){reject(e)}
  });
}
async function loadCustomArt(){
  artDB=await openArtDB();
  if(!artDB){toast('INDEXEDDB UNAVAILABLE — CUSTOM ART WILL NOT PERSIST THIS SESSION',6000);return}
  await new Promise(resolve=>{
    try{
      const tx=artDB.transaction('art','readonly');
      const req=tx.objectStore('art').openCursor();
      req.onsuccess=()=>{const c=req.result;if(c){customArt.set(Number(c.key),c.value);c.continue()}};
      tx.oncomplete=resolve;tx.onerror=tx.onabort=resolve;
    }catch(e){resolve()}
  });
}
async function putCustomArt(i,dataUrl){
  customArt.set(i,dataUrl);
  try{await idbReq('readwrite',s=>s.put(dataUrl,i));bumpArtRev();return true}
  catch(e){toast('COULD NOT SAVE CUSTOM ART (INDEXEDDB) — EXPORT A BACKUP',6000);return false}
}
async function deleteCustomArt(i){
  customArt.delete(i);
  try{await idbReq('readwrite',s=>s.delete(i));bumpArtRev()}catch(e){}
}
async function clearCustomArt(){
  customArt.clear();
  try{await idbReq('readwrite',s=>s.clear());bumpArtRev()}catch(e){}
}
async function swapCustomArt(a,b){
  const va=customArt.get(a),vb=customArt.get(b);
  if(vb!==undefined)customArt.set(a,vb);else customArt.delete(a);
  if(va!==undefined)customArt.set(b,va);else customArt.delete(b);
  try{
    await idbReq('readwrite',s=>{
      if(vb!==undefined)s.put(vb,a);else s.delete(a);
      if(va!==undefined)s.put(va,b);else s.delete(b);
      return null;
    });
    bumpArtRev();
  }catch(e){toast('COULD NOT SAVE SWAPPED CUSTOM ART — EXPORT A BACKUP',6000)}
}

function resizeToDataUrl(src,max=500){
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>{
      const scale=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));
      const w=Math.max(1,Math.round(img.naturalWidth*scale));
      const h=Math.max(1,Math.round(img.naturalHeight*scale));
      const c=document.createElement('canvas');c.width=w;c.height=h;
      const ctx=c.getContext('2d');
      ctx.fillStyle='#111114';ctx.fillRect(0,0,w,h);
      ctx.drawImage(img,0,0,w,h);
      try{resolve(c.toDataURL('image/jpeg',0.85))}catch(e){reject(e)}
    };
    img.onerror=()=>reject(new Error('image decode failed'));
    img.src=src;
  });
}

// v10 stored uploads as raw base64 inside meta[i].customArt (and the whole meta blob lives in localStorage).
// Move them to IndexedDB once, resized. Only strip the legacy copy after the new copy is safely stored.
async function migrateLegacyMetaArt(){
  let moved=0;
  for(const [k,m] of Object.entries(meta)){
    if(!m||typeof m!=='object'||typeof m.customArt!=='string'||!/^\d+$/.test(k))continue;
    const i=Number(k);
    if(!customArt.has(i)){
      let small=m.customArt;
      try{small=await resizeToDataUrl(m.customArt,500)}catch(e){}
      if(await putCustomArt(i,small))moved++;else continue;
    }
    delete m.customArt;
  }
  if(moved){saveMeta();toast('MOVED '+moved+' CUSTOM ART IMAGE(S) TO SAFE STORAGE',5000)}
}

// ── art source helpers ────────────────────────────────────────
function autoSources(entry){
  return (entry&&Array.isArray(entry.artSources))?entry.artSources.filter(s=>typeof s==='string'&&!s.startsWith('data:')):[];
}
function slotArtSources(i){
  const d=discs[i];const out=[];
  if(customArt.has(i))out.push(customArt.get(i));
  if(d)out.push(...autoSources(mbCache[keyOf(d)]));
  return out;
}
// Walk an array of src URLs; on final failure call onFail(); on success call onWin(src).
function loadImgWithFallbacks(img,sources,onFail,onWin){
  const list=[...sources];
  const next=()=>{
    if(!list.length){img.onload=img.onerror=null;if(onFail)onFail();return}
    const s=list.shift();
    img.onload=()=>{img.onload=img.onerror=null;if(onWin)onWin(s)};
    img.onerror=next;
    img.src=s;
  };
  next();
}
// Remember which source actually loaded so later page loads skip the 404 cascade.
function recordWinner(key,src){
  if(!key||typeof src!=='string'||src.startsWith('data:'))return;
  const e=mbCache[key];
  if(!e||!Array.isArray(e.artSources))return;
  const idx=e.artSources.indexOf(src);
  if(idx>0){e.artSources.splice(idx,1);e.artSources.unshift(src);saveMbCacheSoon()}
}
