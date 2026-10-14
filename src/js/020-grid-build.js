
// ════════════════════════════════════════════════════════════════
// GRID BUILD
// ════════════════════════════════════════════════════════════════
function wireSlotImg(img,i){
  const d=discs[i];const key=keyOf(d);
  const isWish=getMeta(i).flags.includes('wishlist');
  loadImgWithFallbacks(img,slotArtSources(i),
    ()=>{const ph=document.createElement('div');ph.className='slot-art-placeholder';ph.textContent=isWish?'♥':'💿';img.replaceWith(ph)},
    src=>recordWinner(key,src));
}
// Upgrade slots that are still showing the placeholder (used after background lookups; no full rebuild).
function updateSlotArtIfNeeded(key){
  discs.forEach((d,i)=>{
    if(keyOf(d)!==key)return;
    const el=document.querySelector(`.slot[data-index="${i}"]`);
    const ph=el&&el.querySelector('.slot-art-placeholder');
    if(!ph||!slotArtSources(i).length)return;
    const img=document.createElement('img');img.className='slot-art';img.alt='';img.loading='lazy';
    ph.replaceWith(img);wireSlotImg(img,i);
  });
}

// ── filtering: the DOM is rebuilt only when the SORT or the data changes; search / artist / flag
//    filters just toggle visibility (no flicker, no image reloads on every keystroke) ──
// ── shared "effective" facts: manual overrides win over looked-up data ──
const isWish=i=>getMeta(i).flags.includes('wishlist');
let _regionNames=null;
function countryName(code){
  if(!code)return '';
  try{if(!_regionNames)_regionNames=new Intl.DisplayNames(['en'],{type:'region'});return _regionNames.of(code)||code}
  catch(e){return code}
}
function getOverride(i){const o=meta[i]&&meta[i].override;return (o&&typeof o==='object')?o:null}
function effectiveYear(i){
  const o=getOverride(i);
  if(o&&/^\d{4}$/.test(o.year||''))return o.year;
  const d=discs[i];const e=d&&mbCache[keyOf(d)];const t=e&&e.tags;
  return (t&&t.find(x=>/^\d{4}$/.test(x)))||null;
}
function effectiveGenres(i){
  const o=getOverride(i);const out=[];
  const add=g=>{g=String(g||'').trim().toLowerCase();if(g&&!out.includes(g))out.push(g)};
  if(o&&Array.isArray(o.genres))o.genres.forEach(add);
  const d=discs[i];const e=d&&mbCache[keyOf(d)];const a=e&&e.artistId&&artistCache[e.artistId];
  if(a&&Array.isArray(a.genres))a.genres.forEach(add);
  return out;
}
function effectiveCountry(i){
  const d=discs[i];const e=d&&mbCache[keyOf(d)];const a=e&&e.artistId&&artistCache[e.artistId];
  return (a&&a.country)||null;
}
const decadeOf=y=>y?(Math.floor(Number(y)/10)*10)+'s':null;

// ── filtering: the DOM is rebuilt only when the SORT or the data changes; search / artist / flag / genre / decade /
//    origin filters just toggle visibility (no flicker, no image reloads on every keystroke) ──
let builtSort=null;
function currentFilters(){
  return {q:$('searchInput').value.trim().toLowerCase(),artist:$('artistFilter').value,flag:$('flagFilter').value,
          genre:$('genreFilter').value,decade:$('decadeFilter').value,country:$('originFilter').value};
}
function anyFilter(f){return !!(f.q||f.artist||f.flag||f.genre||f.decade||f.country)}
function matches(i,f){
  const d=discs[i];
  if(f.q){
    const exact=/^#\s*(\d+)$/.exec(f.q);           // "#12" = exactly slot 12 (works for empty slots too)
    if(exact){if(i+1!==Number(exact[1]))return false}
    else{
      if(!d)return false;
      const m=getMeta(i);
      const hay=(d[0]+' '+d[1]+' '+m.notes+' '+m.loanedTo+' '+effectiveGenres(i).join(' ')+' '+(effectiveYear(i)||'')).toLowerCase();
      if(!hay.includes(f.q)&&!String(i+1).includes(f.q))return false;
    }
  }
  if(f.artist&&!(d&&d[0]===f.artist))return false;
  if(f.flag&&!getMeta(i).flags.includes(f.flag))return false;
  if(f.genre&&!effectiveGenres(i).includes(f.genre))return false;
  if(f.decade&&decadeOf(effectiveYear(i))!==f.decade)return false;
  if(f.country&&effectiveCountry(i)!==f.country)return false;
  return true;
}
function updateFilterUi(f,shown){
  $('searchClear').style.display=f.q?'block':'none';
  $('filterCount').textContent=anyFilter(f)?`SHOWING ${shown} RESULTS`:'';
  const b=$('clearFiltersBtn');if(b)b.style.display=anyFilter(f)?'':'none';
  updateFilterToggleLabel(f);
  renderFilterPills(f);
}
function clearAllFilters(){
  $('searchInput').value='';
  ['artistFilter','flagFilter','genreFilter','decadeFilter','originFilter'].forEach(id=>{$(id).value=''});
  applyFilters();
}
// Genre / decade / origin dropdowns are built from what the collection actually contains (counts included).
function populateExtraFilters(){
  const g={},dec={},co={};
  discs.forEach((d,i)=>{
    if(isSlotEmpty(d)||isWish(i))return;
    effectiveGenres(i).forEach(x=>{g[x]=(g[x]||0)+1});
    const dk=decadeOf(effectiveYear(i));if(dk)dec[dk]=(dec[dk]||0)+1;
    const c=effectiveCountry(i);if(c)co[c]=(co[c]||0)+1;
  });
  const fill=(id,label,entries,fmt)=>{
    const sel=$(id);const cur=sel.value;
    sel.innerHTML=`<option value="">${label}</option>`+entries.map(([k,n])=>`<option value="${escH(k)}"${k===cur?' selected':''}>${escH(fmt(k))} (${n})</option>`).join('');
    if(cur&&!entries.some(([k])=>k===cur))sel.value='';
    sel.style.display=entries.length?'':'none';
  };
  fill('genreFilter','ALL GENRES',Object.entries(g).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,80),k=>k.toUpperCase());
  fill('decadeFilter','ALL DECADES',Object.entries(dec).sort((a,b)=>a[0].localeCompare(b[0])),k=>k);
  fill('originFilter','ALL ORIGINS',Object.entries(co).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])),k=>countryName(k).toUpperCase());
}

const sortName=s=>String(s||'').replace(/^the\s+/i,'');
function sortedIndices(sortVal){
  const idx=discs.map((_,i)=>i);
  const emptyLast=(a,b,cmp)=>{
    const ea=isSlotEmpty(discs[a]),eb=isSlotEmpty(discs[b]);
    if(ea||eb)return ea===eb?a-b:(ea?1:-1);
    return cmp()||a-b;
  };
  const lastPlayed=i=>{const ph=getMeta(i).playHistory;return ph.length?new Date(ph[ph.length-1]).getTime():0};
  if(sortVal==='artist')idx.sort((a,b)=>emptyLast(a,b,()=>sortName(discs[a][0]).localeCompare(sortName(discs[b][0]),undefined,{sensitivity:'base'})));
  else if(sortVal==='album')idx.sort((a,b)=>emptyLast(a,b,()=>(discs[a][1]||'').localeCompare(discs[b][1]||'',undefined,{sensitivity:'base'})));
  else if(sortVal==='year')idx.sort((a,b)=>(effectiveYear(a)||'9999').localeCompare(effectiveYear(b)||'9999')||a-b);
  else if(sortVal==='plays')idx.sort((a,b)=>emptyLast(a,b,()=>getMeta(b).playHistory.length-getMeta(a).playHistory.length));
  else if(sortVal==='recent')idx.sort((a,b)=>emptyLast(a,b,()=>lastPlayed(b)-lastPlayed(a)));
  else if(sortVal==='added')idx.sort((a,b)=>emptyLast(a,b,()=>addedTs(b)-addedTs(a)));
  return idx;
}

function buildGrid(){
  const grid = $('grid');
  populateExtraFilters();          // before reading the filters, so a vanished option resets cleanly
  const f = currentFilters();
  builtSort = $('sortSelect').value;
  const indices = sortedIndices(builtSort);

  grid.innerHTML='';
  const np = nowPlaying;
  let shown=0;

  indices.forEach(i=>{
    const disc = discs[i];
    const m    = getMeta(i);
    const isEmpty = isSlotEmpty(disc);
    const isWish  = m.flags.includes('wishlist');
    const n = i+1;
    const numPad = String(n).padStart(3,'0');

    const slot = document.createElement('div');
    slot.className = 'slot'+(isEmpty&&!isWish?' empty-slot':isWish?' wishlist-slot':'');
    slot.dataset.index = i;
    if(setPos(i)){slot.classList.add('in-set');if(builtSort==='slot'){if(linkedWithNext(i))slot.classList.add('set-next');if(linkedWithPrev(i))slot.classList.add('set-prev')}}

    // Art (sources are wired after insertion; nothing is serialised into HTML attributes)
    const hasArt = slotArtSources(i).length>0;
    const artHtml = hasArt
      ? `<img class="slot-art" data-art-slot="${i}" alt="" loading="lazy">`
      : `<div class="slot-art-placeholder">${isWish?'♥':'💿'}</div>`;

    // Flags
    const flags = m.flags||[];
    const isNP  = np&&np.index===i;
    let flagHtml='';
    if(isNP) flagHtml+=`<span class="flag flag-nowplaying">▶</span>`;
    if(flags.includes('broken'))    flagHtml+=`<span class="flag flag-broken">B</span>`;
    if(flags.includes('loaned')){const ld=loanDays(m);flagHtml+=ld!==null&&ld>30?`<span class="flag flag-loaned overdue" title="On loan to ${escH(m.loanedTo||'?')} for ${ld} days">L!</span>`:`<span class="flag flag-loaned">L</span>`}
    if(flags.includes('replace'))   flagHtml+=`<span class="flag flag-replace">R</span>`;
    if(flags.includes('duplicate')) flagHtml+=`<span class="flag flag-duplicate">D</span>`;

    // Condition dot
    const condClass = m.condition?`slot-condition cond-${escH(m.condition)}`:'';
    const condDot   = m.condition?`<div class="${condClass}"></div>`:'';

    const artist = disc?(disc[0]||'???'):'';
    const album  = disc?(disc[1]||'???'):'';

    slot.innerHTML=`
      <div class="slot-num">${numPad}${setBadge(i)}</div>
      ${flagHtml?`<div class="slot-flags">${flagHtml}</div>`:''}
      ${artHtml}
      ${condDot}
      ${disc||isWish?`<div class="slot-info">
        <div class="slot-artist">${escH(artist||'WISHLIST')}</div>
        <div class="slot-album">${escH(album)}</div>
      </div>`:`<div class="slot-info"><div class="slot-album" style="color:var(--muted)">— EMPTY —</div></div>`}
      <button class="slot-edit-btn" type="button" aria-label="Edit slot ${numPad}" onclick="openEditModal(event,${i})">✏</button>
    `;

    // Events
    if(!isEmpty||isWish){
      slot.addEventListener('click',e=>{
        if(e.target.classList.contains('slot-edit-btn')) return;
        if(document.body.classList.contains('edit-mode')) return;
        if(multiSelect){toggleSelect(i,slot);return;}
        openInfoModal(i);
      });
    }

    // Drag & drop for reorder (only real slot-to-slot drags in edit mode are honoured)
    slot.draggable = editMode;
    slot.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain','cc-slot:'+i);slot.classList.add('dragging')});
    slot.addEventListener('dragend',()=>slot.classList.remove('dragging'));
    slot.addEventListener('dragover',e=>{e.preventDefault();slot.classList.add('drag-over')});
    slot.addEventListener('dragleave',()=>slot.classList.remove('drag-over'));
    slot.addEventListener('drop',e=>{
      e.preventDefault();slot.classList.remove('drag-over');
      const raw=e.dataTransfer.getData('text/plain')||'';
      const mm=/^cc-slot:(\d+)$/.exec(raw);
      if(!mm||!editMode)return;
      const fromIdx=Number(mm[1]);
      const toIdx=Number(slot.dataset.index);
      if(fromIdx!==toIdx&&fromIdx<discs.length&&toIdx<discs.length) swapSlots(fromIdx,toIdx);
    });

    if(selectedSlots.has(i)) slot.classList.add('selected');
    if(matches(i,f))shown++;else slot.classList.add('filtered-out');
    grid.appendChild(slot);
  });

  // Wire art cascade (hidden slots stay lazy until they become visible)
  grid.querySelectorAll('.slot-art[data-art-slot]').forEach(img=>wireSlotImg(img,Number(img.dataset.artSlot)));

  // Counters are computed over ALL discs, independent of the active filter
  // LOADED = discs you own; wishlist items are counted separately
  let loaded=0,wished=0;
  discs.forEach((d,i)=>{if(getMeta(i).flags.includes('wishlist'))wished++;else if(!isSlotEmpty(d))loaded++});
  $('loadedCount').textContent=loaded;
  $('wishCount').textContent=wished;
  $('wishPill').style.display=wished?'':'none';
  $('slotTotal').textContent=discs.length;
  $('logoSub').textContent=discs.length+'-DISC';
  document.title='CrateChanger \u2014 '+discs.length+' Disc';
  updateFilterUi(f,shown);
  populateArtistFilter();
  updateNowPlayingBanner();
  updateBatchBar();
}

function addSlot(){
  discs.push(null);
  saveDiscs();
  buildGrid();
  const el=document.querySelector(`.slot[data-index="${discs.length-1}"]`);
  if(el)el.scrollIntoView({behavior:'smooth',block:'center'});
  toast('ADDED SLOT '+String(discs.length).padStart(3,'0')+' — CLICK ITS PENCIL TO FILL IT');
}

function populateArtistFilter(){
  const sel = document.getElementById('artistFilter');
  const cur = sel.value;
  const artists = [...new Set(discs.filter(d=>d&&d[0]).map(d=>d[0]))].sort();
  sel.innerHTML='<option value="">ALL ARTISTS</option>'+artists.map(a=>`<option value="${escH(a)}"${a===cur?' selected':''}>${escH(a)}</option>`).join('');
}

function applyFilters(){
  if($('sortSelect').value!==builtSort){buildGrid();return}   // only a SORT change needs a rebuild
  const f=currentFilters();let shown=0;
  document.querySelectorAll('#grid .slot').forEach(el=>{const ok=matches(Number(el.dataset.index),f);el.classList.toggle('filtered-out',!ok);if(ok)shown++});
  updateFilterUi(f,shown);
  focusedSlot=null;
}
function clearSearch(){document.getElementById('searchInput').value='';applyFilters()}
function setZoom(v){document.documentElement.style.setProperty('--card-size',v+'px')}
