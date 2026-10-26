// CrateChanger service worker. build.mjs writes dist/sw.js from this file; 1081d3da2be4 = hash of the page it serves,
// so every deploy that changes the app installs a new worker and shows the "new version ready" bar.
const VERSION='cc-shell-1081d3da2be4';
const ART='cc-art-v1';
const ART_MAX=600;
const SHELL=['./','./index.html','./manifest.webmanifest','./icon-192.png','./icon-512.png','./icon-maskable-512.png'];
// cover art + fonts are cached as they are viewed, so the grid still has pictures offline
const RUNTIME_HOSTS=/(^|\.)(coverartarchive\.org|archive\.org|mzstatic\.com|dzcdn\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)$/;

self.addEventListener('install',e=>{e.waitUntil(caches.open(VERSION).then(c=>c.addAll(SHELL)))});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys()
    .then(keys=>Promise.all(keys.filter(k=>k.startsWith('cc-shell-')&&k!==VERSION).map(k=>caches.delete(k))))
    .then(()=>self.clients.claim()));
});
self.addEventListener('message',e=>{if(e.data==='SKIP_WAITING')self.skipWaiting()});

async function trimArt(){
  const c=await caches.open(ART);const keys=await c.keys();
  for(let i=0;i<keys.length-ART_MAX;i++)await c.delete(keys[i]);
}

self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin===self.location.origin){
    // the app itself: served from the cache (works offline); new versions arrive through the update bar
    e.respondWith(caches.open(VERSION)
      .then(c=>c.match(req.mode==='navigate'?'./index.html':req,{ignoreSearch:true}))
      .then(hit=>hit||fetch(req)));
    return;
  }
  if(RUNTIME_HOSTS.test(url.hostname)){
    // cache-first; fetched with CORS so the cache holds real images, not opaque (heavily quota-padded) blobs
    e.respondWith(caches.open(ART).then(async c=>{
      const hit=await c.match(req.url);
      if(hit)return hit;
      try{
        const res=await fetch(req.url,{mode:'cors',credentials:'omit'});
        if(res.ok)c.put(req.url,res.clone()).then(trimArt).catch(()=>{});
        return res;
      }catch(err){
        return fetch(req);
      }
    }));
  }
  // everything else (MusicBrainz, Discogs, GitHub ...) goes straight to the network
});
