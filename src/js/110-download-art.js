
// ════════════════════════════════════════════════════════════════
// DOWNLOAD ART
// ════════════════════════════════════════════════════════════════
async function downloadArt(){
  if(!currentArtUrl)return;
  const base=(`${$('modalArtist').textContent} - ${$('modalAlbum').textContent}`).replace(/[<>:"\/\\|?*]/g,'_');
  if(currentArtUrl.startsWith('data:')){
    const a=document.createElement('a');a.href=currentArtUrl;a.download=base+'.jpg';
    document.body.appendChild(a);a.click();a.remove();return;
  }
  try{
    const r=await fetchTimeout(currentArtUrl,{mode:'cors'},12000);
    if(r.ok){
      const blob=await r.blob();
      const ext=((blob.type||'image/jpeg').split('/')[1]||'jpg').replace('jpeg','jpg');
      triggerDownload(blob,base+'.'+ext);return;
    }
  }catch(e){}
  window.open(currentArtUrl,'_blank','noopener');
  toast('DIRECT DOWNLOAD BLOCKED BY CORS — OPENED IN A NEW TAB (RIGHT-CLICK, SAVE IMAGE)',5000);
}
