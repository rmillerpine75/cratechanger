
// ════════════════════════════════════════════════════════════════
// FULLSCREEN ART
// ════════════════════════════════════════════════════════════════
// Fullscreen used to just enlarge the 250px thumbnail. Show it instantly, then swap in a high-resolution version
// (Cover Art Archive 1200/500, iTunes 1200) as soon as one loads; closing cancels the upgrade.
let fsToken=0;
function hiResCandidates(url){
  if(!url||url.startsWith('data:'))return [];
  const out=[];
  const caa=/^(https:\/\/coverartarchive\.org\/(?:release|release-group)\/[^/]+)\/front-\d+$/.exec(url);
  if(caa)out.push(caa[1]+'/front-1200',caa[1]+'/front-500');
  if(/\/\d+x\d+bb\.(jpg|jpeg|png|webp)$/i.test(url))out.push(url.replace(/\/\d+x\d+bb\./i,'/1200x1200bb.'));
  return out.filter(u=>u!==url);
}
function openFullscreenArt(){
  if(!currentArtUrl)return;
  const img=document.getElementById('fullscreenArtImg');
  img.src=currentArtUrl;
  document.getElementById('fullscreenArt').classList.add('open');
  const tok=++fsToken;
  const cands=hiResCandidates(currentArtUrl);
  const tryNext=()=>{
    if(tok!==fsToken||!cands.length)return;
    const u=cands.shift();
    const probe=new Image();
    probe.onload=()=>{if(tok===fsToken)img.src=u};
    probe.onerror=tryNext;
    probe.src=u;
  };
  tryNext();
}
function closeFullscreenArt(){fsToken++;document.getElementById('fullscreenArt').classList.remove('open')}
