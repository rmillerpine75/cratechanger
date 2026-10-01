
// ════════════════════════════════════════════════════════════════
// BACKUP / RESTORE / EXPORT
// ════════════════════════════════════════════════════════════════
function openBackupModal(){
  updateV7Label();
  renderAutoBackupStatus();
  renderStorageMeter();
  const last=localStorage.getItem(BACKUP_KEY);
  document.getElementById('lastBackupLabel').textContent=last?'LAST BACKUP: '+new Date(last).toLocaleString():'NO BACKUP ON RECORD — EXPORT NOW';
  document.getElementById('brModal').classList.add('open');
}
function closeBrModal(){document.getElementById('brModal').classList.remove('open')}

function buildBackupPayload(){
  return {app:'CrateChanger',version:2,exportedAt:new Date().toISOString(),discs,meta,mbCache,artistCache,customArt:Object.fromEntries(customArt)};
}

function exportBackup(){
  triggerDownload(new Blob([JSON.stringify(buildBackupPayload())],{type:'application/json'}),`CrateChanger_backup_${new Date().toISOString().slice(0,10)}.json`);
  safeSet(BACKUP_KEY,new Date().toISOString());
  toast('BACKUP EXPORTED ✓ ('+customArt.size+' CUSTOM ART)');closeBrModal();
}

async function importBackup(ev){
  const file=ev.target.files[0];ev.target.value='';
  if(!file)return;
  try{
    const data=JSON.parse(await file.text());
    if(!data||!Array.isArray(data.discs))throw new Error('Invalid format (no disc list)');
    if(data.app&&data.app!=='CrateChanger')throw new Error('Not a CrateChanger backup');
    const list=data.discs.map(normalizeDisc);
    const newMeta=(data.meta&&typeof data.meta==='object'&&!Array.isArray(data.meta))?data.meta:{};
    const newCache=(data.mbCache&&typeof data.mbCache==='object'&&!Array.isArray(data.mbCache))?data.mbCache:{};
    // custom art: v2 backups carry a slot->image map; v1 backups (original v10) carry it inside meta[i].customArt
    const art=new Map();
    if(data.customArt&&typeof data.customArt==='object')
      for(const [k,v] of Object.entries(data.customArt))
        if(/^\d+$/.test(k)&&typeof v==='string'&&v.startsWith('data:image/'))art.set(Number(k),v);
    for(const [k,m] of Object.entries(newMeta))
      if(m&&typeof m==='object'&&typeof m.customArt==='string'&&m.customArt.startsWith('data:image/')&&/^\d+$/.test(k)&&!art.has(Number(k)))art.set(Number(k),m.customArt);
    const filled=list.filter(d=>!isSlotEmpty(d)).length;

    // Dry run: say exactly what will happen before touching anything
    if(!confirm('DRY RUN — this backup ('+(data.exportedAt||'unknown date')+') contains:\n  '+list.length+' slots ('+filled+' filled)\n  '+
                Object.keys(newMeta).length+' slots of flags/notes/history\n  '+Object.keys(newCache).length+' cached lookups\n  '+art.size+' custom art images\n\n'+
                'Your CURRENT collection ('+discs.filter(d=>!isSlotEmpty(d)).length+' discs, '+customArt.size+' custom art) will be REPLACED.\n'+
                'A safety backup of the current state is downloaded first.\n\nContinue?'))return;

    // Safety net 1: download the current state before replacing it
    triggerDownload(new Blob([JSON.stringify(buildBackupPayload())],{type:'application/json'}),`CrateChanger_pre-import_${new Date().toISOString().replace(/[:.]/g,'-')}.json`);
    // Safety net 2: small in-browser copy of the current lists
    safeSet(DISC_KEY+'_prev',JSON.stringify(discs));safeSet(META_KEY+'_prev',JSON.stringify(meta));

    discs=list;while(discs.length<MIN_SLOTS)discs.push(null);
    meta=newMeta;
    for(const m of Object.values(meta))if(m&&typeof m==='object')delete m.customArt;
    mbCache=newCache;
    if(data.artistCache&&typeof data.artistCache==='object'&&!Array.isArray(data.artistCache)){artistCache=data.artistCache;saveArtistCache()}
    await clearCustomArt();
    for(const [k,v] of art){
      let img=v;   // legacy v10 backups carry raw multi-MB uploads; already-small (resized) art is kept as-is to avoid generation loss
      if(v.length>150000){try{img=await resizeToDataUrl(v,500)}catch(e){}}
      await putCustomArt(k,img);
    }
    if(nowPlaying&&nowPlaying.index>=discs.length){nowPlaying=null;try{localStorage.removeItem(NP_KEY)}catch(e){}}
    saveDiscs();saveMeta();saveMbCache();
    buildGrid();closeBrModal();toast('BACKUP RESTORED ✓');
  }catch(e){alert('Import failed: '+e.message);}
}

function exportCSV(){
  // cells that start with = + - @ are prefixed so spreadsheets never treat them as formulas
  const cell=c=>{let s=String(c);if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'};
  const rows=[['Disc','Artist','Album','Condition','Flags','Notes','Play Count']];
  discs.forEach((d,i)=>{
    const m=getMeta(i);
    rows.push([i+1,d?d[0]||'':'',(d?d[1]||'':''),m.condition||'',(m.flags||[]).join(';'),m.notes||'',(m.playHistory||[]).length]);
  });
  const csv=rows.map(r=>r.map(cell).join(',')).join('\n');
  triggerDownload(new Blob([csv],{type:'text/csv'}),`CrateChanger_${new Date().toISOString().slice(0,10)}.csv`);
  toast('CSV EXPORTED ✓');
}

function printView(){
  const w=window.open('','_blank');
  if(!w){toast('POPUP BLOCKED — ALLOW POPUPS TO PRINT',4000);return}
  const rows=discs.map((d,i)=>`<tr><td>${i+1}</td><td>${d?escH(d[0]||''):'—'}</td><td>${d?escH(d[1]||''):'—'}</td><td>${escH(getMeta(i).condition||'')}</td><td>${escH((getMeta(i).flags||[]).join(', '))}</td></tr>`).join('');
  w.document.write(`<!DOCTYPE html><html><head><title>CrateChanger — Disc List</title><style>body{font-family:monospace;font-size:11px;padding:20px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:3px 6px;text-align:left}th{background:#f0f0f0}tr:nth-child(even){background:#f9f9f9}@media print{body{padding:0}}</style></head><body><h2>CrateChanger — ${discs.length} Disc Reference</h2><p>Printed: ${new Date().toLocaleString()}</p><table><thead><tr><th>#</th><th>Artist</th><th>Album</th><th>Condition</th><th>Flags</th></tr></thead><tbody>${rows}</tbody></table></body></html>`);
  w.document.close();setTimeout(()=>w.print(),500);
}
