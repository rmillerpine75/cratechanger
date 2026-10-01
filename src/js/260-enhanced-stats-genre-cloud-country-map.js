
// ════════════════════════════════════════════════════════════════
// ENHANCED STATS — genre cloud + country map
// ════════════════════════════════════════════════════════════════
function openStats(){
  renderBaseStats();
  const el=$('statsContent');

  // One pass: genres + band origin (owned discs only), lookup health, neglected discs.
  const genreCounts={},originCounts={};let withInfo=0;
  const noMatch=[],skipped=[],pending=[];
  discs.forEach((d,i)=>{
    if(isSlotEmpty(d))return;
    const e=mbCache[keyOf(d)];
    const ov=getOverride(i);const hasOvTracks=!!(ov&&Array.isArray(ov.tracks)&&ov.tracks.length);
    if(!entryComplete(e)){if(!hasOvTracks)pending.push(i)}
    else if(e.skipped){if(!hasOvTracks)skipped.push(i)}
    else if(!(Array.isArray(e.tracks)&&e.tracks.length)&&!hasOvTracks)noMatch.push(i);
    if(isWish(i))return;                       // wishlist items are not part of the collection
    const gs=effectiveGenres(i);const c=effectiveCountry(i);
    if(gs.length||c)withInfo++;
    gs.forEach(g=>{genreCounts[g]=(genreCounts[g]||0)+1});
    if(c)originCounts[c]=(originCounts[c]||0)+1;
  });

  const html=[];
  const genres=Object.entries(genreCounts).sort((a,b)=>b[1]-a[1]).slice(0,40);
  if(genres.length){
    const maxG=genres[0][1];
    const cloud=genres.map(([g,c])=>{
      const size=Math.max(0.55,Math.min(1.1,0.55+(c/maxG)*0.55));
      const op=Math.max(0.5,c/maxG);
      return `<span class="genre-tag-cloud" title="${c} disc(s)" style="font-size:${size}rem;opacity:${op};border-color:rgba(200,41,46,${(op*0.6).toFixed(2)})">${escH(g)}</span>`;
    }).join('');
    html.push(`<div class="stats-section"><h3>GENRES</h3><div class="genre-cloud">${cloud}</div></div>`);
  }
  const countries=Object.entries(originCounts).sort((a,b)=>b[1]-a[1]);
  if(countries.length){
    const maxC=countries[0][1];
    // country NAMES: Windows cannot draw flag emoji, it showed "GB GB"
    const rows=countries.map(([cc,count])=>`<div class="country-bar-row"><div class="country-flag">${escH(cc)}</div><div class="country-name" title="${escH(cc)}">${escH(countryName(cc))}</div><div class="country-bar-track"><div class="country-bar-fill" style="width:${Math.round(count/maxC*100)}%"></div></div><div class="country-count">${count}</div></div>`).join('');
    html.push(`<div class="stats-section"><h3>BAND ORIGIN</h3>${rows}</div>`);
  }
  if(!withInfo)html.push(`<div class="stats-section"><h3>GENRES &amp; BAND ORIGIN</h3><div class="no-results">These appear once ⬇ FETCH ART has looked your discs up.</div></div>`);

  // Loans: who has what, longest first; > 30 days highlighted
  const loans=[];
  discs.forEach((d,i)=>{
    if(isSlotEmpty(d))return;
    const m=getMeta(i);
    if(!m.flags.includes('loaned'))return;
    loans.push({i,d,m,days:loanDays(m)});
  });
  loans.sort((a,b)=>(b.days===null?-1:b.days)-(a.days===null?-1:a.days));
  if(loans.length){
    html.push(`<div class="stats-section"><h3>ON LOAN (${loans.length})</h3>${loans.map(l=>
      `<div class="attn-row${l.days!==null&&l.days>30?' overdue':''}" data-open-slot="${l.i}" title="Open disc"><span class="attn-num">${String(l.i+1).padStart(3,'0')}</span><span class="attn-title">${escH(l.d[0])} — ${escH(l.d[1])}</span><span class="attn-meta">${escH(l.m.loanedTo||'?')}${l.days!==null?' · '+l.days+' DAYS':''}</span></div>`).join('')}</div>`);
  }

  // Neglected: playable discs not played for a year (oldest first), then never played
  const now=Date.now();const neglected=[];
  discs.forEach((d,i)=>{
    if(!isPlayable(i))return;
    const ph=getMeta(i).playHistory;
    const t=ph.length?new Date(ph[ph.length-1]).getTime():null;
    const last=(t===null||isNaN(t))?null:t;
    if(last===null||now-last>365*864e5)neglected.push({i,last});
  });
  neglected.sort((a,b)=>((a.last===null)-(b.last===null))||((a.last||0)-(b.last||0)));
  window._neglectedSet=new Set(neglected.map(n=>n.i));
  if(neglected.length){
    const never=neglected.filter(n=>n.last===null).length;
    const rows=neglected.slice(0,12).map(n=>`<div class="attn-row" data-open-slot="${n.i}" title="Open disc"><span class="attn-num">${String(n.i+1).padStart(3,'0')}</span><span class="attn-title">${escH(discs[n.i][0]||'?')} — ${escH(discs[n.i][1]||'?')}</span><span class="attn-meta">${n.last===null?'NEVER PLAYED':'LAST PLAYED '+new Date(n.last).toISOString().slice(0,10)}</span></div>`).join('');
    html.push(`<div class="stats-section"><h3>NEGLECTED (${neglected.length})</h3><div class="attn-hint">${neglected.length-never} NOT PLAYED IN OVER A YEAR · ${never} NEVER PLAYED · OLDEST FIRST</div>${rows}${neglected.length>12?`<div class="attn-hint">…and ${neglected.length-12} more</div>`:''}<button class="btn" style="margin-top:8px" type="button" data-pick-neglected="1">🎲 PICK A NEGLECTED DISC</button></div>`);
  }

  // Lookup health: titles that need a human
  const row=(i,why)=>`<div class="attn-row" data-edit-slot="${i}" title="Click to edit the title"><span class="attn-num">${String(i+1).padStart(3,'0')}</span><span class="attn-title">${escH(discs[i][0]||'?')} — ${escH(discs[i][1]||'?')}</span><span class="attn-meta">${why}</span></div>`;
  const attn=[...noMatch.map(i=>row(i,'NO CONFIDENT MATCH')),...skipped.map(i=>row(i,'PLACEHOLDER TITLE'))];
  html.push(`<div class="stats-section"><h3>NEEDS ATTENTION (${attn.length})</h3>`+
    (attn.length?`<div class="attn-hint">Usually a typo or a non-standard title. Click a row to edit it (or add a manual tracklist), then use REFRESH in the disc view.</div>${attn.join('')}`:'<div class="no-results">NOTHING FLAGGED ✓</div>')+
    (pending.length?`<div class="attn-hint">${pending.length} disc(s) not looked up yet — run ⬇ FETCH ART.</div>`:'')+
    `</div>`);

  el.insertAdjacentHTML('beforeend',html.join(''));
}

// Patch toggleSelect in buildGrid to use batch-aware version
// (buildGrid uses toggleSelect inline — we override it here)
window.toggleSelect = function(i, slot){
  if(selectedSlots.has(i)){selectedSlots.delete(i);slot.classList.remove('selected')}
  else{selectedSlots.add(i);slot.classList.add('selected')}
  updateBatchBar();
  const n=selectedSlots.size;
  if(n) toast(`${n} SELECTED`);
};
