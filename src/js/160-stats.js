
// ════════════════════════════════════════════════════════════════
// STATS
// ════════════════════════════════════════════════════════════════
function renderBaseStats(){
  const el=document.getElementById('statsContent');
  const filled=discs.filter((d,i)=>!isSlotEmpty(d)&&!isWish(i));     // owned discs only
  const empty=discs.filter((d,i)=>isSlotEmpty(d)&&!isWish(i));
  const wishCount=discs.filter((d,i)=>isWish(i)).length;
  const artists={};
  filled.forEach(d=>{const a=d[0]||'?';artists[a]=(artists[a]||0)+1});
  const topArtists=Object.entries(artists).sort((a,b)=>b[1]-a[1]).slice(0,12);
  const maxCount=topArtists[0]?.[1]||1;

  // Flags
  const flagCounts={broken:0,loaned:0,replace:0,duplicate:0,wishlist:0,condition_mint:0,condition_scratched:0,condition_unplayable:0};
  Object.values(meta).forEach(m=>{
    (m.flags||[]).forEach(f=>{if(flagCounts[f]!==undefined)flagCounts[f]++});
    if(m.condition) flagCounts['condition_'+m.condition]=(flagCounts['condition_'+m.condition]||0)+1;
  });

  // Play stats
  let totalPlays=0;let mostPlayed=null;let mostPlayedCount=0;
  discs.forEach((d,i)=>{
    const ph=getMeta(i).playHistory||[];totalPlays+=ph.length;
    if(ph.length>mostPlayedCount){mostPlayedCount=ph.length;mostPlayed=d;}
  });

  // Dupes
  const seen={};const dupList=[];
  discs.forEach((d,i)=>{if(!d||!d[0])return;const k=(d[0]+'|'+d[1]).toLowerCase();if(seen[k]!==undefined)dupList.push(`DISC ${seen[k]+1} & ${i+1}: ${d[0]} — ${d[1]}`);else seen[k]=i;});

  el.innerHTML=`
    <div class="stats-grid">
      <div class="stat-card"><div class="val">${filled.length}</div><div class="lbl">LOADED</div></div>
      <div class="stat-card"><div class="val">${empty.length}</div><div class="lbl">EMPTY SLOTS</div></div>
      <div class="stat-card"><div class="val">${Object.keys(artists).length}</div><div class="lbl">UNIQUE ARTISTS</div></div>
      <div class="stat-card"><div class="val" style="font-size:1.05rem;line-height:1.25;padding-top:6px;word-break:break-word">${escH(topArtists[0]?.[0]||'—')}</div><div class="lbl">TOP ARTIST</div></div>
      <div class="stat-card"><div class="val">${flagCounts.broken}</div><div class="lbl">BROKEN</div></div>
      <div class="stat-card"><div class="val">${flagCounts.loaned}</div><div class="lbl">LOANED OUT</div></div>
      <div class="stat-card"><div class="val">${flagCounts.replace}</div><div class="lbl">NEED REPLACE</div></div>
      <div class="stat-card"><div class="val">${totalPlays}</div><div class="lbl">TOTAL PLAYS</div></div>
      <div class="stat-card"><div class="val">${albumCount()}</div><div class="lbl">ALBUMS (A SET = 1)</div></div>
      <div class="stat-card"><div class="val">${shelf.length}</div><div class="lbl">📦 ON THE SHELF</div></div>
      <div class="stat-card"><div class="val">${wishCount}</div><div class="lbl">♥ WISHLIST</div></div>
    </div>
    <div class="stats-section">
      <h3>TOP ARTISTS BY DISC COUNT</h3>
      ${topArtists.map(([a,c])=>`<div class="artist-bar-row"><div class="artist-bar-name">${escH(a)}</div><div class="artist-bar-track"><div class="artist-bar-fill" style="width:${Math.round(c/maxCount*100)}%"></div></div><div class="artist-bar-count">${c}</div></div>`).join('')}
    </div>
    <div class="stats-section">
      <h3>FLAGS & CONDITION</h3>
      <div class="flag-summary">
        <div class="flag-summary-item">🔴 BROKEN: ${flagCounts.broken}</div>
        <div class="flag-summary-item">🔵 LOANED: ${flagCounts.loaned}</div>
        <div class="flag-summary-item">🟠 REPLACE: ${flagCounts.replace}</div>
        <div class="flag-summary-item">🟣 DUPLICATE: ${flagCounts.duplicate}</div>
        <div class="flag-summary-item">✅ MINT: ${flagCounts.condition_mint||0}</div>
        <div class="flag-summary-item">🟢 GOOD: ${flagCounts.condition_good||0}</div>
        <div class="flag-summary-item">🟡 SCRATCHED: ${flagCounts.condition_scratched||0}</div>
        <div class="flag-summary-item">🚫 UNPLAYABLE: ${flagCounts.condition_unplayable||0}</div>
      </div>
    </div>
    ${mostPlayed?`<div class="stats-section"><h3>MOST PLAYED</h3><div class="dup-item">${escH(mostPlayed[0])} — ${escH(mostPlayed[1])} (${mostPlayedCount}×)</div></div>`:''}
    ${dupList.length?`<div class="stats-section"><h3>DUPLICATES (${dupList.length})</h3><div class="dup-list">${dupList.map(d=>`<div class="dup-item">${escH(d)}</div>`).join('')}</div></div>`:'<div class="stats-section"><h3>DUPLICATES</h3><div class="no-results">NONE FOUND ✓</div></div>'}
  `;
  document.getElementById('statsModal').classList.add('open');
}
function closeStats(){document.getElementById('statsModal').classList.remove('open')}
