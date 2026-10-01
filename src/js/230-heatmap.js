
// ════════════════════════════════════════════════════════════════
// HEATMAP
// ════════════════════════════════════════════════════════════════
const COUNTRY_FLAGS = {US:'🇺🇸',GB:'🇬🇧',DE:'🇩🇪',SE:'🇸🇪',NO:'🇳🇴',FI:'🇫🇮',FR:'🇫🇷',AU:'🇦🇺',CA:'🇨🇦',BR:'🇧🇷',NL:'🇳🇱',PL:'🇵🇱',IT:'🇮🇹',AT:'🇦🇹',CH:'🇨🇭',DK:'🇩🇰',JP:'🇯🇵',MX:'🇲🇽',BE:'🇧🇪',GR:'🇬🇷',RU:'🇷🇺',ZA:'🇿🇦',PT:'🇵🇹',ES:'🇪🇸',CZ:'🇨🇿',XW:'🌍'};

function openHeatmap(){
  const grid = document.getElementById('heatmapGrid');
  grid.innerHTML='';
  discs.forEach((d,i)=>{
    const m = getMeta(i);
    const flags = m.flags||[];
    const cell = document.createElement('div');
    cell.className='hm-cell';
    if(flags.includes('wishlist')) cell.className+=' hm-wishlist';
    else if(!d||isSlotEmpty(d)) cell.className+=' hm-empty';
    else if(flags.includes('broken')) cell.className+=' hm-broken';
    else if(flags.includes('loaned')) cell.className+=' hm-loaned';
    else cell.className+=' hm-filled';

    // Tooltip
    cell.addEventListener('mousemove',ev=>{
      const tip=document.getElementById('hmTooltip');
      tip.style.display='block';
      tip.style.left=(ev.clientX+12)+'px';
      tip.style.top=(ev.clientY+12)+'px';
      const label=d?`DISC ${i+1}\n${d[0]||'?'}\n${d[1]||'?'}${flags.length?'\n['+flags.join(', ')+']':''}`:`DISC ${i+1} — EMPTY`;
      tip.textContent=label;
    });
    cell.addEventListener('mouseleave',()=>{document.getElementById('hmTooltip').style.display='none'});

    if(d&&!isSlotEmpty(d)){
      cell.addEventListener('click',()=>{closeHeatmap();openInfoModal(i);});
    }
    grid.appendChild(cell);
  });
  document.getElementById('heatmapModal').classList.add('open');
}
function closeHeatmap(){document.getElementById('heatmapModal').classList.remove('open');document.getElementById('hmTooltip').style.display='none'}
