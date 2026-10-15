
// ════════════════════════════════════════════════════════════════
// KEYBOARD NAVIGATION
// ════════════════════════════════════════════════════════════════
let focusedSlot=null;

// Every overlay, topmost first (matches their z-index order). Escape closes ONE layer at a time.
const MODAL_LAYERS=[
  ['roomModal',()=>closeRoom()],
  ['caseModal',()=>closeCase()],
  ['fullscreenArt',()=>closeFullscreenArt()],
  ['helpModal',()=>closeHelp()],
  ['editModal',()=>closeEditModal()],
  ['editionModal',()=>closeEdition()],
  ['dataCheckModal',()=>closeDataCheck()],
  ['settingsModal',()=>closeSettings()],
  ['shelfModal',()=>closeShelf()],
  ['printModal',()=>closePrintModal()],
  ['brModal',()=>closeBrModal()],
  ['resortModal',()=>closeResort()],
  ['shareModal',()=>closeShare()],
  ['statsModal',()=>closeStats()],
  ['timelineModal',()=>closeTimeline()],
  ['heatmapModal',()=>closeHeatmap()],
  ['infoModal',()=>closeModal()]
];
function openLayer(){return MODAL_LAYERS.find(([id])=>$(id)&&$(id).classList.contains('open'))||null}

function trapFocus(e){
  const layer=openLayer();if(!layer)return;
  const root=$(layer[0]);
  const f=Array.from(root.querySelectorAll('button, [href], input:not([readonly]):not([type=hidden]), select, textarea, [tabindex="0"]'))
    .filter(el=>!el.disabled&&el.offsetParent!==null);
  if(!f.length)return;
  const first=f[0],last=f[f.length-1];
  if(!root.contains(document.activeElement)){e.preventDefault();first.focus()}
  else if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
}

document.addEventListener('keydown',e=>{
  const tag=(document.activeElement&&document.activeElement.tagName)||'';
  const typing=/^(INPUT|TEXTAREA|SELECT)$/.test(tag);

  if(e.key==='Escape'){
    if($('moreMenu').classList.contains('open')){closeMoreMenu();return}
    const layer=openLayer();
    if(layer){layer[1]();return}
    if(document.activeElement===$('searchInput')&&$('searchInput').value)clearSearch();
    return;
  }
  if(e.key==='Tab'){trapFocus(e);return}
  if(e.key==='Enter'&&$('editModal').classList.contains('open')&&e.target.matches&&e.target.matches('#editArtist, #editAlbum')){
    e.preventDefault();saveEdit();return;
  }
  if((e.ctrlKey||e.metaKey)&&!typing&&!$('editModal').classList.contains('open')){
    const k=String(e.key).toLowerCase();
    if(k==='z'&&!e.shiftKey&&undoStack.length){e.preventDefault();performUndo();return}
    if(((k==='z'&&e.shiftKey)||k==='y')&&redoStack.length){e.preventDefault();performRedo();return}
  }
  // Never hijack keys while typing, changing a dropdown, or with any overlay open
  if(typing||openLayer())return;
  if(e.key==='/'){e.preventDefault();$('searchInput').focus();return}
  if(e.key==='?'){e.preventDefault();openHelp();return}

  const slots=Array.from(document.querySelectorAll('.slot:not(.empty-slot):not(.filtered-out)'));
  if(!slots.length)return;
  if(e.key==='ArrowRight'||e.key==='ArrowLeft'||e.key==='ArrowDown'||e.key==='ArrowUp'){
    e.preventDefault();
    const top0=slots[0].offsetTop;let cols=slots.findIndex(s=>s.offsetTop!==top0);if(cols<1)cols=slots.length;   // real columns from the layout (grid, zoom, list view)
    let idx=focusedSlot!==null?focusedSlot:0;
    if(e.key==='ArrowRight')idx++;else if(e.key==='ArrowLeft')idx--;
    else if(e.key==='ArrowDown')idx+=cols;else if(e.key==='ArrowUp')idx-=cols;
    idx=Math.max(0,Math.min(slots.length-1,idx));
    focusedSlot=idx;slots[idx].scrollIntoView({block:'nearest'});
    slots[idx].style.outline='2px solid var(--gold)';
    slots.forEach((s,si)=>{if(si!==idx)s.style.outline='';});
  }
  if(e.key==='Enter'&&focusedSlot!==null){
    const i=parseInt(slots[focusedSlot]&&slots[focusedSlot].dataset.index);
    if(!isNaN(i))openInfoModal(i);
  }
});

// Backup reminder on load
function checkBackupReminder(delay=3000){
  const last=safeGet(BACKUP_KEY);
  let msg=null;
  if(last){
    const days=Math.floor((Date.now()-new Date(last).getTime())/86400000);
    if(days>30)msg='⚠ LAST BACKUP WAS '+days+' DAYS AGO — USE 💾 BACKUP';
  }else if(safeGet(DISC_KEY)||safeGet(META_KEY)){
    // never exported, but there is real data to lose (any edit, flag, note or play has been saved)
    msg='⚠ NO BACKUP YET — USE 💾 BACKUP > EXPORT JSON';
  }
  if(msg)setTimeout(()=>toast(msg,6000),delay);
  return msg;
}
checkBackupReminder();
