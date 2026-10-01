
// ════════════════════════════════════════════════════════════════
// JUMP / RANDOM
// ════════════════════════════════════════════════════════════════
function jumpToSlot(){
  const n=parseInt(prompt(`Jump to disc number (1–${discs.length}):`));
  if(!n||n<1||n>discs.length)return;
  const slot=document.querySelector(`.slot[data-index="${n-1}"]`);
  if(slot&&!slot.classList.contains('filtered-out')){slot.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>slot.style.outline='2px solid var(--gold)',300);setTimeout(()=>slot.style.outline='',1500);}
  else toast(`DISC ${n} IS HIDDEN BY THE CURRENT SEARCH / FILTER`);
}
// RANDOM only picks discs you can actually put on: not wishlist, broken, loaned out, or marked unplayable.
function isPlayable(i){
  if(isSlotEmpty(discs[i]))return false;
  const m=getMeta(i);
  return !m.flags.some(f=>f==='wishlist'||f==='broken'||f==='loaned')&&m.condition!=='unplayable';
}
// Respects the active search / filters (so "random black metal disc" works); `subset` narrows further.
function pickRandom(subset,ignoreFilters){
  const f=currentFilters();
  const pool=discs.map((_,i)=>i).filter(i=>isPlayable(i)&&(ignoreFilters||matches(i,f))&&(typeof subset==='function'?subset(i):true));
  if(!pool.length){
    toast(!ignoreFilters&&anyFilter(f)?'NO PLAYABLE DISC MATCHES THE CURRENT FILTERS':'NO PLAYABLE DISCS (WISHLIST / BROKEN / LOANED / UNPLAYABLE ARE SKIPPED)',4000);
    return;
  }
  const i=pool[Math.floor(Math.random()*pool.length)];
  const slot=document.querySelector(`.slot[data-index="${i}"]`);
  const visibleSlot=slot&&!slot.classList.contains('filtered-out');
  if(visibleSlot)slot.scrollIntoView({behavior:'smooth',block:'center'});
  setTimeout(()=>openInfoModal(i),visibleSlot?400:0);
}
