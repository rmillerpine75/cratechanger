
// ════════════════════════════════════════════════════════════════
// MULTI-SELECT BATCH ACTIONS
// ════════════════════════════════════════════════════════════════
function updateBatchBar(){
  const bar=document.getElementById('batchBar');
  const count=document.getElementById('batchCount');
  if(multiSelect&&selectedSlots.size>0){
    bar.classList.add('visible');
    count.textContent=selectedSlots.size+' SELECTED';
  } else {
    bar.classList.remove('visible');
  }
}

function clearMultiSelect(){selectedSlots.clear();updateBatchBar();buildGrid();}

function batchFlag(flag){
  const undoSnap=snapshot();
  selectedSlots.forEach(i=>{
    const m=getMeta(i);
    if(!m.flags.includes(flag)) m.flags.push(flag);
  });
  saveMeta();buildGrid();updateBatchBar();toast(`FLAGGED ${selectedSlots.size} DISCS AS ${flag.toUpperCase()}`);
  offerUndo(`FLAGGED ${selectedSlots.size} AS ${flag.toUpperCase()}`,undoSnap);
}

function batchClearFlags(){
  const undoSnap=snapshot();
  selectedSlots.forEach(i=>{getMeta(i).flags=[];});
  saveMeta();buildGrid();updateBatchBar();toast(`FLAGS CLEARED ON ${selectedSlots.size} DISCS`);
  offerUndo(`CLEARED FLAGS ON ${selectedSlots.size}`,undoSnap);
}

async function batchClear(){
  if(!selectedSlots.size)return;
  if(!confirm(`Clear ${selectedSlots.size} disc slot(s)? This empties them and also removes their flags, notes, condition, play history and custom art.\n\n(You can UNDO this for a few seconds afterwards.)`)) return;
  const undoSnap=snapshot();
  const n=selectedSlots.size;
  for(const i of selectedSlots){
    discs[i]=null;
    delete meta[i];
    await deleteCustomArt(i);
    if(nowPlaying&&nowPlaying.index===i){nowPlaying=null;try{localStorage.removeItem(NP_KEY)}catch(e){}}
  }
  saveDiscs();saveMeta();selectedSlots.clear();multiSelect=false;
  $('multiSelectBtn').classList.remove('active');
  updateBatchBar();buildGrid();toast('SLOTS CLEARED');
  offerUndo(`CLEARED ${n} SLOT(S)`,undoSnap);
}

// Re-checks the selected discs WITHOUT deleting their cache first: a failed lookup keeps the old data.
async function batchRefetchArt(){
  const items=new Map();
  [...selectedSlots].forEach(i=>{
    const d=discs[i];if(!d||isSlotEmpty(d))return;
    const k=keyOf(d);if(!items.has(k))items.set(k,{artist:d[0],album:d[1],key:k});
  });
  const list=[...items.values()];
  if(!list.length){toast('NOTHING TO REFETCH');return}
  toast(`REFETCHING ${list.length} DISC(S)...`,5000);
  let failed=0;
  for(const it of list){
    try{const data=await ensureData(it.artist,it.album,true);if(data&&data.mbTried===false)failed++}
    catch(e){failed++}
    updateSlotArtIfNeeded(it.key);
  }
  buildGrid();
  toast(failed?`REFETCH DONE — ${failed} NEED RETRY`:'REFETCH COMPLETE ✓');
}

// Patch toggleSelect to also update batch bar
const _origToggleSelect = toggleSelect;
// redefine to also call updateBatchBar
function toggleSelectAndBatch(i,slot){
  if(selectedSlots.has(i)){selectedSlots.delete(i);slot.classList.remove('selected')}
  else{selectedSlots.add(i);slot.classList.add('selected')}
  updateBatchBar();
  toast(`${selectedSlots.size} SELECTED`);
}
