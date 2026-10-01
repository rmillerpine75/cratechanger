
// ════════════════════════════════════════════════════════════════
// SWAP / REORDER
// ════════════════════════════════════════════════════════════════
function swapSlots(a,b){
  if(!Number.isInteger(a)||!Number.isInteger(b)||a===b||a<0||b<0||a>=discs.length||b>=discs.length)return;
  const undoSnap=snapshot();
  [discs[a],discs[b]]=[discs[b],discs[a]];
  [meta[a],meta[b]]=[meta[b],meta[a]];
  if(meta[a]===undefined)delete meta[a];
  if(meta[b]===undefined)delete meta[b];
  if(nowPlaying){
    if(nowPlaying.index===a)nowPlaying.index=b;else if(nowPlaying.index===b)nowPlaying.index=a;
    safeSet(NP_KEY,JSON.stringify(nowPlaying));
  }
  swapCustomArt(a,b);
  saveDiscs();saveMeta();buildGrid();
  toast(`DISC ${a+1} ↔ DISC ${b+1}`);
  offerUndo('SWAPPED DISC '+(a+1)+' ↔ '+(b+1),undoSnap);
}
