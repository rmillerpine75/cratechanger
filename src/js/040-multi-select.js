
// ════════════════════════════════════════════════════════════════
// MULTI-SELECT
// ════════════════════════════════════════════════════════════════
function toggleMultiSelect(){
  multiSelect=!multiSelect;
  selectedSlots.clear();
  document.getElementById('multiSelectBtn').classList.toggle('active',multiSelect);
  buildGrid();
}
function toggleSelect(i,slot){
  if(selectedSlots.has(i)){selectedSlots.delete(i);slot.classList.remove('selected')}
  else{selectedSlots.add(i);slot.classList.add('selected')}
  toast(`${selectedSlots.size} SELECTED`);
}
