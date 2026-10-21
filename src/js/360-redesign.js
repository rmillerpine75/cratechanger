
// ── FLOW REDESIGN: sections (CRATE / LISTEN / INSIGHTS / TOOLS), ADD DISC, attention chips, disc drawer ──
// Section menus reuse the ☰ MORE menu styling; one menu open at a time.
function closeSectionMenus(except){
  document.querySelectorAll('.sec-menu.open').forEach(m=>{
    if(m.id===except)return;
    m.classList.remove('open');
    const b=document.querySelector(`[data-menu="${m.id}"]`);if(b)b.setAttribute('aria-expanded','false');
  });
}
function toggleSectionMenu(id){
  const m=$(id);if(!m)return;
  const open=!m.classList.contains('open');
  closeMoreMenu();closeSectionMenus(id);
  m.classList.toggle('open',open);
  const b=document.querySelector(`[data-menu="${id}"]`);if(b)b.setAttribute('aria-expanded',String(open));
  if(open){const first=m.querySelector('button');if(first)first.focus({preventScroll:true})}
}
document.querySelectorAll('[data-menu]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();toggleSectionMenu(b.dataset.menu)}));
document.querySelectorAll('.sec-menu').forEach(m=>m.addEventListener('click',e=>{if(e.target.closest('button'))closeSectionMenus()}));
document.addEventListener('click',e=>{if(!e.target.closest('.sec-wrap'))closeSectionMenus()});
$('moreBtn').addEventListener('click',()=>closeSectionMenus());
document.addEventListener('keydown',e=>{
  if(e.key!=='Escape')return;
  const open=document.querySelector('.sec-menu.open');if(!open)return;
  const b=document.querySelector(`[data-menu="${open.id}"]`);
  closeSectionMenus();if(b)b.focus({preventScroll:true});
});
function goCrate(){
  closeSectionMenus();closeMoreMenu();
  window.scrollTo({top:0,behavior:'smooth'});
  $('searchInput').focus({preventScroll:true});
}

// ADD DISC: open the first empty slot in the editor; if the changer is full, append a slot first.
function firstEmptySlot(){
  for(let i=0;i<discs.length;i++)if(isSlotEmpty(discs[i])&&!isWish(i))return i;
  return -1;
}
function addDisc(){
  closeSectionMenus();closeMoreMenu();
  let i=firstEmptySlot();
  if(i<0){addSlot();i=discs.length-1}
  openEditModal(null,i);
}
function editFromInfo(){
  const i=currentModalIndex;if(i===null||i===undefined)return;
  closeModal();openEditModal(null,i);
}

// ATTENTION CHIPS: what needs doing, one click to see it (sets the flag filter; click again to clear).
var ATTN=[
  ['_empty','EMPTY SLOT','EMPTY SLOTS',i=>isSlotEmpty(discs[i])&&!isWish(i)],
  ['loaned','LOANED OUT','LOANED OUT',i=>!isSlotEmpty(discs[i])&&getMeta(i).flags.includes('loaned')],
  ['broken','BROKEN','BROKEN',i=>!isSlotEmpty(discs[i])&&getMeta(i).flags.includes('broken')],
  ['replace','NEEDS REPLACING','NEED REPLACING',i=>!isSlotEmpty(discs[i])&&getMeta(i).flags.includes('replace')],
  ['_noart','MISSING ART','MISSING ART',i=>!isSlotEmpty(discs[i])&&!isWish(i)&&!slotArtSources(i).length]
];
function renderAttention(){
  const el=$('attnChips');if(!el||!ATTN)return;
  const cur=$('flagFilter').value;
  const html=ATTN.map(([k,one,many,test])=>{
    let n=0;for(let i=0;i<discs.length;i++)if(test(i))n++;
    if(!n&&cur!==k)return '';
    const on=cur===k;
    return `<button type="button" class="attn-chip${on?' on':''}" data-attn="${k}" aria-pressed="${on}">${n} ${n===1?one:many}${on?' ✕':''}</button>`;
  }).join('');
  el.innerHTML=html;
  el.style.display=html?'':'none';
}
$('attnChips').addEventListener('click',e=>{
  const b=e.target.closest('[data-attn]');if(!b)return;
  const k=b.dataset.attn;const sel=$('flagFilter');
  sel.value=sel.value===k?'':k;
  uiApplyFilters();
});
renderAttention();
