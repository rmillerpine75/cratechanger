async function init(){
  await loadCustomArt();
  await migrateLegacyMetaArt();
  buildGrid();
  setTimeout(offerOldCacheCleanup,400);
  setTimeout(()=>{offerV7Import().catch(()=>{})},900);
  abInit().catch(()=>{});
  round6Init();
  round7Init();
}
init().catch(e=>{console.error('init failed',e);if(!$('grid').children.length)buildGrid();toast('STARTED WITH ERRORS - SEE CONSOLE',6000)});
