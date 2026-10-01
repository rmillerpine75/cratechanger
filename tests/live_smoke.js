// LIVE smoke test: real network, real MusicBrainz / iTunes / Deezer, throwaway profile.
// run: .\run-tests.ps1 -Html ..\cd_changer_11.html -Harness live_smoke.js
(async () => {
  const R = [];
  const ok = (n, c, x) => R.push((c ? 'PASS ' : 'FAIL ') + n + (x !== undefined ? '   [' + x + ']' : ''));
  const info = (n, x) => R.push('INFO ' + n + '   [' + x + ']');
  const wait = ms => new Promise(r => setTimeout(r, ms));
  window.confirm = () => true;
  try {
    for (let n = 0; n < 80 && !$('grid').children.length; n++) await wait(100);
    const i = discs.findIndex(d => d && d[0] === 'Absu' && d[1] === 'Tara');
    const data = await ensureData('Absu', 'Tara');
    ok('live: MusicBrainz match with tracklist', data.tracks.length > 0, data.tracks.length + ' tracks, mbid ' + data.mbid);
    ok('live: release-group fields present (type + rgId)', !!data.rgId && !!data.type, data.type + ' / ' + data.rgId);
    ok('live: original year', /^\d{4}$/.test(data.year || ''), data.year + ' (this pressing: ' + data.editionYear + ')');
    ok('live: release-group cover in the art cascade', data.artSources.some(s => s.includes('/release-group/')));
    const a = artistCache[data.artistId];
    ok('live: artist genres + band origin', !!a && a.genres.length > 0 && !!a.country, a && (a.country + ' / ' + a.genres.join(', ')));
    info('live: 30s preview', data.previewUrl ? 'yes' : 'none');
    info('live: Deezer reachable from file://', deezerDead ? 'NO (CORS-blocked, auto-skipped)' : 'yes / not needed');
    openInfoModal(i); await wait(2500);
    ok('live: modal tags render', $('modalTags').textContent.length > 0, $('modalTags').textContent.replace(/\s+/g, ' ').trim());
    closeModal();
    const c2 = await ensureData('Cradle Of Filth', 'Live Bait For The Dead (Disc 2)');
    info('live: disc 2 of a 2-CD set', c2.tracks.length + ' tracks; first: ' + (c2.tracks[0] && c2.tracks[0].title));
    const dbl = await ensureData('Agnostic Front', 'Cause For Alarm / Victim In Pain');
    info('live: double release "A / B"', dbl.tracks.length + ' tracks' + (dbl.mbid ? ' (matched)' : ' (no confident match)'));
    const typo = await ensureData('Malignancy', 'Frality Of The Human Condition');
    info('live: suspected typo title', typo.tracks.length ? 'matched anyway' : 'no confident match -> shows in NEEDS ATTENTION');
    if (typeof openEditionPicker === 'function') {
      currentModalIndex = i;
      await openEditionPicker();
      const eds = Array.from(document.querySelectorAll('#editionList .edition-row'));
      ok('live: edition picker lists real pressings with details', eds.length > 1 && /\d{4}/.test(eds[0].textContent), eds.length + ' editions; first: ' + (eds[0] ? eds[0].textContent.replace(/\s+/g, ' ').trim() : '-'));
      closeEdition(); currentModalIndex = null;
      info('live: auto-backup API on file://', 'isSecureContext=' + window.isSecureContext + ', showSaveFilePicker=' + typeof window.showSaveFilePicker);
    }
    if (typeof checkSpellingOnline === 'function') {
      // barcode -> exact edition, using the real barcode of the matched release
      const relJson = await mbFetchJson('https://musicbrainz.org/ws/2/release/' + data.mbid + '?fmt=json');
      const code = relJson && relJson.barcode;
      if (code) {
        openEditModal(null, discs.findIndex(d => isSlotEmpty(d)));
        $('editBarcode').value = code; await lookupBarcode();
        const rows = Array.from(document.querySelectorAll('#barcodeResults .edition-row'));
        ok('live: barcode lookup finds the exact release', rows.some(r => r.dataset.bcId === data.mbid), code + ' -> ' + rows.length + ' result(s)');
        closeEditModal();
      } else info('live: barcode', 'the matched release has no barcode on MusicBrainz');
      // the suspected typo
      const mi = discs.findIndex(d => d && d[1] === 'Frality Of The Human Condition');
      if (mi >= 0) {
        await ensureData(discs[mi][0], discs[mi][1]);
        spellSuggestions = [];
        await checkSpellingOnline();
        const s = spellSuggestions.find(x => x.slot === mi);
        ok('live: spelling check suggests the real title for the typo', !!s, s ? '"' + s.from + '" -> "' + s.to + '" (' + Math.round(s.sim * 100) + '%)' : $('dcSpellStatus').textContent);
      }
      // a real Discogs price (via the MusicBrainz -> Discogs link)
      const v = await estimateValueFor(i, true);
      ok('live: Discogs price lookup completes', !!v);
      info('live: Discogs price for Absu - Tara', v && v.discogsId ? (v.lowest != null ? fmtMoney(v.lowest, v.currency) + ' lowest listing, ' + v.forSale + ' for sale (Discogs release ' + v.discogsId + ')' : 'no current listing (Discogs release ' + v.discogsId + ')') : 'no Discogs link for this edition on MusicBrainz');
    }
  } catch (e) { R.push('FAIL exception: ' + (e.stack || e)); }
  R.push('SUMMARY pass=' + R.filter(r => r.startsWith('PASS')).length + ' fail=' + R.filter(r => r.startsWith('FAIL')).length);
  document.body.insertAdjacentHTML('beforeend', '<pre id="__results">' + escH(R.join('\n')) + '</pre>');
})();
