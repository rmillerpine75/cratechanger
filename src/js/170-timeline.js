
// ════════════════════════════════════════════════════════════════
// TIMELINE
// ════════════════════════════════════════════════════════════════
function openTimeline(){
  const byYear={};
  discs.forEach((d,i)=>{
    if(!d)return;
    const year=effectiveYear(i)||'Unknown';   // original year; your override wins
    if(!byYear[year])byYear[year]=[];
    byYear[year].push({index:i,artist:d[0],album:d[1]});
  });
  const sorted=Object.keys(byYear).sort();
  const inner=document.getElementById('timelineInner');
  inner.innerHTML=sorted.map(y=>`
    <div class="decade-label">${y}</div>
    <div class="timeline-row">
      ${byYear[y].map(e=>`<div class="timeline-chip" onclick="closeTimeline();openInfoModal(${e.index})">${escH(e.artist||'?')} — ${escH(e.album)}</div>`).join('')}
    </div>
  `).join('');
  document.getElementById('timelineModal').classList.add('open');
}
function closeTimeline(){document.getElementById('timelineModal').classList.remove('open')}
