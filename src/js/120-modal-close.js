
// ════════════════════════════════════════════════════════════════
// MODAL CLOSE
// ════════════════════════════════════════════════════════════════
function closeModal(){
  $('infoModal').classList.remove('open');
  const audio=$('previewAudio');audio.pause();audio.removeAttribute('src');
  openLyricsTrack=null;currentModalIndex=null;
  modalToken++;lyricsToken++;
  restoreFocus();
}
function handleBackdropClick(e){if(e.target===$('infoModal'))uiCloseModal()}
