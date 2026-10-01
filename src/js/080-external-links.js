
// ════════════════════════════════════════════════════════════════
// EXTERNAL LINKS
// ════════════════════════════════════════════════════════════════
function openWiki(){
  const artist=document.getElementById('modalArtist').textContent;
  window.open('https://en.wikipedia.org/wiki/Special:Search?search='+encodeURIComponent(artist),'_blank');
}
function openYouTube(){
  const artist=document.getElementById('modalArtist').textContent;
  const album=document.getElementById('modalAlbum').textContent;
  window.open('https://www.youtube.com/results?search_query='+encodeURIComponent(artist+' '+album),'_blank');
}
function openSpotify(){
  const artist=document.getElementById('modalArtist').textContent;
  const album=document.getElementById('modalAlbum').textContent;
  window.open('https://open.spotify.com/search/'+encodeURIComponent(artist+' '+album),'_blank');
}

// QR code (using qr-server.com — no auth)
function showQR(){
  const artist=$('modalArtist').textContent;
  const album=$('modalAlbum').textContent;
  const url=currentMbUrl||`https://www.discogs.com/search/?q=${encodeURIComponent(artist+' '+album)}`;
  const qrUrl=`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`;
  const w=window.open('','_blank','width=260,height=300');
  if(!w){toast('POPUP BLOCKED — ALLOW POPUPS FOR THE QR WINDOW',4000);return}
  w.document.write(`<body style="background:#0a0a0c;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;gap:10px;font-family:monospace;color:#e0ddd8"><img src="${qrUrl}" width="200" height="200"><div style="font-size:10px;color:#6a6870">${escH(artist)}<br>${escH(album)}</div></body>`);
  w.document.close();
}
