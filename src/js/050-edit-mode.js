
// ════════════════════════════════════════════════════════════════
// EDIT MODE
// ════════════════════════════════════════════════════════════════
function toggleEditMode(){
  editMode=!editMode;
  document.body.classList.toggle('edit-mode',editMode);
  const btn=document.getElementById('editToggle');
  btn.textContent=editMode?'✕ DONE':'✏ EDIT';
  btn.classList.toggle('active',editMode);
  buildGrid();
}

let editPendingFlags = {};
function openEditModal(e,i){
  if(e&&e.stopPropagation)e.stopPropagation();
  editingIndex=i;pendingArtData=null;editPendingFlags={};
  rememberFocus();
  const disc=discs[i];const m=getMeta(i);
  $('editSlotNum').value='DISC '+String(i+1).padStart(3,'0');
  $('editArtist').value=disc?(disc[0]||''):'';
  $('editAlbum').value=disc?(disc[1]||''):'';
  $('editNotes').value=m.notes||'';
  $('loanedTo').value=m.loanedTo||'';
  $('loanDate').value=m.loanDate||'';
  $('moveToSlot').value='';
  const ov=m.override||{};
  $('ovYear').value=ov.year||'';
  $('ovGenres').value=(ov.genres||[]).join(', ');
  $('ovTracks').value=(ov.tracks||[]).join('\n');
  $('overrideBox').open=!!(ov.year||(ov.genres&&ov.genres.length)||(ov.tracks&&ov.tracks.length));

  // Flags
  editPendingFlags={};
  (m.flags||[]).forEach(f=>editPendingFlags[f]=true);
  renderFlagToggles();
  $('loanFields').classList.toggle('visible',!!editPendingFlags.loaned);

  // Art preview: custom art first, otherwise walk the auto sources (the first one is often a 404)
  const custom=customArt.get(i);
  const auto=disc?autoSources(mbCache[keyOf(disc)]):[];
  const previewImg=$('artUploadImg');
  const previewPh=$('artUploadPlaceholder');
  const clearBtn=$('clearArtBtn');
  $('artFileInput').value='';
  previewImg.onload=previewImg.onerror=null;
  const showPh=()=>{previewImg.style.display='none';previewImg.removeAttribute('src');previewPh.style.display=''};
  const showImg=()=>{previewImg.style.display='';previewPh.style.display='none'};
  if(custom){
    previewImg.src=custom;showImg();
    clearBtn.style.display='';clearBtn.textContent='✕ REMOVE CUSTOM ART';
  }else if(auto.length){
    showImg();loadImgWithFallbacks(previewImg,auto,showPh);
    clearBtn.style.display='';clearBtn.textContent='✕ CLEAR AUTO ART';
  }else{
    showPh();clearBtn.style.display='none';
  }

  $('editModal').classList.add('open');
  $('editArtist').focus();
}

function renderFlagToggles(){
  document.querySelectorAll('.flag-toggle').forEach(btn=>{
    const f=btn.dataset.flag;
    btn.className='flag-toggle'+(editPendingFlags[f]?' on-'+f:'');
  });
}

function toggleFlag(f){
  editPendingFlags[f]=!editPendingFlags[f];
  if(!editPendingFlags[f]) delete editPendingFlags[f];
  renderFlagToggles();
  $('loanFields').classList.toggle('visible',!!editPendingFlags.loaned);
}

function handleArtUpload(ev){
  const file=ev.target.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=async()=>{
    try{
      pendingArtData=await resizeToDataUrl(reader.result,500);   // 500px JPEG instead of a raw multi-MB base64 blob
      const img=$('artUploadImg');
      img.onload=img.onerror=null;
      img.src=pendingArtData;img.style.display='';
      $('artUploadPlaceholder').style.display='none';
      $('clearArtBtn').style.display='';$('clearArtBtn').textContent='✕ REMOVE CUSTOM ART';
    }catch(err){toast('COULD NOT READ THAT IMAGE')}
  };
  reader.onerror=()=>toast('COULD NOT READ THAT FILE');
  reader.readAsDataURL(file);
}

function clearUploadedArt(){
  pendingArtData=false;
  $('artFileInput').value='';
  const img=$('artUploadImg');
  img.style.display='none';img.removeAttribute('src');
  $('artUploadPlaceholder').style.display='';
  $('clearArtBtn').style.display='none';
}

function closeEditModal(){$('editModal').classList.remove('open');editingIndex=null;pendingArtData=null;restoreFocus()}

async function saveEdit(){
  if(editingIndex===null)return;
  const i=editingIndex;
  const _ovY=$('ovYear').value.trim();
  if(_ovY&&!/^\d{4}$/.test(_ovY)){toast('YEAR MUST BE 4 DIGITS (E.G. 1993) — NOT SAVED YET',4000);$('overrideBox').open=true;$('ovYear').focus();return}
  const undoSnap=snapshot();
  try{
    const artist=$('editArtist').value.trim();
    const album=$('editAlbum').value.trim();
    const oldDisc=discs[i];
    const oldKey=keyOf(oldDisc);

    if(!artist&&!album){
      // Emptying a slot also drops everything attached to that position, so it can't haunt the next disc placed there.
      if(oldDisc&&!confirm('Clear disc '+String(i+1).padStart(3,'0')+' ('+oldDisc[0]+' - '+oldDisc[1]+')?\nThis empties the slot and also removes its flags, notes, condition, play history and custom art.'))return;
      discs[i]=null;
      delete meta[i];
      await deleteCustomArt(i);
      if(nowPlaying&&nowPlaying.index===i){nowPlaying=null;try{localStorage.removeItem(NP_KEY)}catch(e){}}
    }else{
      discs[i]=[artist,album];
      const m=getMeta(i);
      m.notes=$('editNotes').value.trim();
      m.flags=Object.keys(editPendingFlags).filter(f=>editPendingFlags[f]);
      m.loanedTo=$('loanedTo').value.trim();
      m.loanDate=$('loanDate').value;
      // manual overrides (year / genres / tracklist)
      const ovYear=$('ovYear').value.trim();
      const ovGenres=$('ovGenres').value.split(',').map(s=>s.trim().toLowerCase()).filter(Boolean).slice(0,12);
      const ovTracks=$('ovTracks').value.split('\n').map(s=>s.trim()).filter(Boolean).slice(0,200);
      const ov={};
      if(/^\d{4}$/.test(ovYear))ov.year=ovYear;
      if(ovGenres.length)ov.genres=ovGenres;
      if(ovTracks.length)ov.tracks=ovTracks;
      if(Object.keys(ov).length)m.override=ov;else delete m.override;

      // Art
      if(typeof pendingArtData==='string'){
        await putCustomArt(i,pendingArtData);
      }else if(pendingArtData===false){
        if(customArt.has(i))await deleteCustomArt(i);
        else{const e=mbCache[keyOf(discs[i])];if(e){e.artSources=[];e.artCleared=true}}
      }
    }

    // prune the lookup-cache entry of the old title if nothing else uses it
    const newKey=keyOf(discs[i]);
    if(oldKey&&oldKey!==newKey&&!discs.some((d,j)=>j!==i&&keyOf(d)===oldKey))delete mbCache[oldKey];

    saveDiscs();saveMeta();saveMbCache();
    closeEditModal();buildGrid();
    toast('SAVED');
    offerUndo((discs[i]?'EDITED':'CLEARED')+' DISC '+String(i+1).padStart(3,'0'),undoSnap);
  }catch(err){
    console.error(err);
    toast('SAVE FAILED — SEE CONSOLE',6000);
  }
}
