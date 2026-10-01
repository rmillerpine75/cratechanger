
// ════════════════════════════════════════════════════════════════
// DETECT DUPLICATES
// ════════════════════════════════════════════════════════════════
function detectDuplicates(){
  const seen={};const dups=[];
  discs.forEach((d,i)=>{
    if(!d||!d[0])return;
    const key=(d[0]+'|'+d[1]).toLowerCase();
    if(seen[key])dups.push({key:d[0]+' — '+d[1],slots:[seen[key]+1,i+1]});
    else seen[key]=i;
  });
  if(!dups.length){toast('NO DUPLICATES FOUND ✓');return;}
  const msg=dups.map(d=>`${d.key}\nDiscs: ${d.slots.join(', ')}`).join('\n\n');
  alert(`FOUND ${dups.length} DUPLICATE(S):\n\n${msg}`);
}
