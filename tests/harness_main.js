// Regression suite for cd_changer_10_hardened.html  (run: .\run-tests.ps1 -Html ..\cd_changer_10_hardened.html -Harness harness_v10.js)
(async () => {
  const R = [];
  const ok = (name, cond, extra) => R.push((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? '   [' + extra + ']' : ''));
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const confirms = [], alerts = [], opened = [];
  window.confirm = m => { confirms.push(String(m)); return true; };
  window.alert = m => { alerts.push(String(m)); };
  let openRet = null;                     // what window.open returns (null = popup blocked)
  window.open = u => { opened.push(String(u)); return openRet; };
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const realSleep = window.sleep;
  const fastSleep = ms => wait(Math.min(ms, 15));      // shrink MusicBrainz throttle/backoff for speed; restored for the throttle test
  window.sleep = fastSleep;

  // ── network stub ──
  let mbMode = 'ok';
  const calls = [];
  const credit = n => [{ name: n, artist: { name: n } }];
  const rel = (score, who) => ({ releases: [{ id: 'rel-1', score, date: '1995-06-01', country: 'US', 'artist-credit': credit(who) }] });
  const mbDetail = { 'release-group': { id: 'rg-1', 'primary-type': 'Album', 'first-release-date': '1993-02-01' }, 'artist-credit': [{ name: 'Absu', artist: { id: 'art-1', name: 'Absu' } }],
    media: [ { tracks: [{ position: 1, title: "Song 'One'", length: 185000 }, { position: 2, title: 'Two', length: 61000 }] },
             { tracks: [{ position: 1, title: 'Disc Two Track', length: 90000 }] } ] };
  // REAL API SHAPE: the release lookup only contains 'release-group' when inc=release-groups is requested
  const detailFor = u => { if (decodeURIComponent(u).includes('release-groups')) return mbDetail; const c = JSON.parse(JSON.stringify(mbDetail)); delete c['release-group']; return c; };
  const reply = (obj, status = 200) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => obj, blob: async () => new Blob(['x']) });
  const later = (ms, v) => new Promise(r => setTimeout(() => r(v), ms));
  window.fetch = url => {
    const u = String(url); calls.push(u);
    if (u.includes('itunes.apple.com/search')) {
      if (u.includes('entity=song')) return reply({ results: [{ artistName: 'Absu', previewUrl: 'https://audio.example/p.m4a' }] });
      return reply({ results: [{ artistName: 'Absu', collectionName: 'Tara', artworkUrl100: 'https://img.example/a/100x100bb.jpg' }] });
    }
    if (u.includes('musicbrainz.org/ws/2/release/?query=')) {
      if (mbMode === '503') return reply({}, 503);
      if (mbMode === 'split') return reply(decodeURIComponent(u).includes('Some Other') ? { releases: [] } : rel(100, 'Absu'));
      if (mbMode === 'empty') return reply({ releases: [] });
      if (mbMode === 'lowscore') return reply(rel(40, 'Absu'));
      if (mbMode === 'wrongartist') return reply(rel(100, 'Totally Different Band'));
      if (mbMode === 'slow') return later(700, reply(rel(100, 'Absu')));
      return reply(rel(100, 'Absu'));
    }
    if (u.includes('musicbrainz.org/ws/2/release/rel-1')) {
      if (mbMode === '503') return reply({}, 503);
      if (mbMode === 'slow') return later(700, reply(detailFor(u)));
      return reply(detailFor(u));
    }
    if (u.includes('musicbrainz.org/ws/2/artist/art-1')) return reply({ id: 'art-1', name: 'Absu', country: 'US', area: { name: 'United States', 'iso-3166-1-codes': ['US'] }, genres: [{ name: 'black metal', count: 9 }, { name: 'thrash metal', count: 4 }] });
    return reply({}, 404);
  };
  const idxOf = (a, b) => discs.findIndex(d => d && d[0] === a && d[1] === b);
  const visible = () => document.querySelectorAll('#grid .slot:not(.filtered-out)').length;

  try {
    for (let n = 0; n < 80 && !$('grid').children.length; n++) await wait(100);

    // ═══ 1. v10 features still work ═══
    const expectLoaded = discs.filter(d => d && (d[0] || (d[1] && d[1] !== 'unknown'))).length;
    ok('grid renders every slot', $('grid').children.length === discs.length && discs.length === 200, $('grid').children.length);
    ok('LOADED counter correct + total dynamic', $('loadedCount').textContent === String(expectLoaded) && $('slotTotal').textContent === '200', $('loadedCount').textContent + '/' + $('slotTotal').textContent);
    ok('title + logo reflect slot count', document.title.includes('200 Disc') && $('logoSub').textContent === '200-DISC', document.title);
    ok('no inline JS in slot art (data-arts attribute gone)', !document.querySelector('[data-arts]'));

    const a0 = idxOf('Absu', 'The Sun of Tiphareth'), a1 = idxOf('Absu', 'Tara');
    getMeta(a0).flags = ['broken', 'loaned']; getMeta(a0).condition = 'mint';
    getMeta(a1).notes = 'keep me';
    const emptyIdx = discs.findIndex(d => isSlotEmpty(d));
    getMeta(emptyIdx).flags = ['wishlist'];
    buildGrid();
    const el0 = document.querySelector(`.slot[data-index="${a0}"]`);
    ok('flag badges + condition dot render', !!el0.querySelector('.flag-broken') && !!el0.querySelector('.flag-loaned') && !!el0.querySelector('.slot-condition.cond-mint'));
    ok('wishlist slot styled + counted separately (not as loaded)', document.querySelector(`.slot[data-index="${emptyIdx}"]`).classList.contains('wishlist-slot') && $('loadedCount').textContent === String(expectLoaded) && $('wishCount').textContent === '1' && $('wishPill').style.display !== 'none', $('loadedCount').textContent + ' / wish ' + $('wishCount').textContent);

    $('searchInput').value = 'absu'; applyFilters();
    ok('search filters grid but LOADED counter stays global (v10 bug)', visible() === 3 && $('loadedCount').textContent === String(expectLoaded) && $('filterCount').textContent.includes('3'), visible() + ' / ' + $('loadedCount').textContent);
    $('searchInput').value = ''; applyFilters();
    $('flagFilter').value = 'broken'; applyFilters();
    ok('flag filter', visible() === 1);
    $('flagFilter').value = ''; applyFilters();
    $('artistFilter').value = 'Absu'; applyFilters();
    ok('artist filter', visible() === 3);
    $('artistFilter').value = ''; applyFilters();
    $('sortSelect').value = 'artist'; applyFilters();
    ok('sort by artist', $('grid').firstElementChild.querySelector('.slot-artist').textContent.length > 0);
    $('sortSelect').value = 'slot'; applyFilters();

    // sort by year must use the 4-digit year even when tags[0] is a country
    const kA = keyOf(discs[0]), kB = keyOf(discs[1]), kC = keyOf(discs[2]);
    mbCache[kA] = { tags: ['1980'], tracks: [], artSources: [], mbTried: true, v: 2 };
    mbCache[kB] = { tags: ['US', 'Album'], tracks: [], artSources: [], mbTried: true, v: 2 };
    mbCache[kC] = { tags: ['1970', 'US'], tracks: [], artSources: [], mbTried: true, v: 2 };
    $('sortSelect').value = 'year'; applyFilters();
    const order = Array.from($('grid').children).map(e => Number(e.dataset.index));
    ok('sort by year: 1970 < 1980 < (no year)', order.indexOf(2) < order.indexOf(0) && order.indexOf(0) < order.indexOf(1), order.slice(0, 4).join(','));
    $('sortSelect').value = 'slot'; applyFilters();

    // stats modal (was infinite recursion)
    let statsErr = null;
    try { openStats(); } catch (e) { statsErr = e.name; }
    ok('STATS opens (v10 crashed with stack overflow)', statsErr === null && $('statsModal').classList.contains('open') && document.querySelectorAll('#statsContent .stat-card').length >= 6, statsErr);
    closeStats();
    openTimeline(); ok('timeline opens with chips', $('timelineModal').classList.contains('open') && document.querySelectorAll('.timeline-chip').length > 100); closeTimeline();
    openHeatmap(); ok('heatmap opens with one cell per slot', document.querySelectorAll('.hm-cell').length === discs.length); closeHeatmap();
    openBackupModal(); ok('backup modal opens', $('brModal').classList.contains('open')); closeBrModal();
    toggleTheme(); ok('theme toggles', document.body.classList.contains('light-theme')); toggleTheme();
    toggleListView(); ok('list view toggles', document.body.classList.contains('list-view')); toggleListView();
    setZoom(200); ok('zoom variable set', document.documentElement.style.getPropertyValue('--card-size') === '200px');
    ok('FIND DUPES still works', (() => { detectDuplicates(); return alerts.some(a => a.includes('DUPLICATE')); })());

    // now playing + condition + play log
    openInfoModal(a0); await wait(150);
    setNowPlaying();
    ok('NOW PLAYING banner + badge', $('nowPlayingBanner').classList.contains('visible') && $('npText').textContent.includes('Absu') && !!document.querySelector(`.slot[data-index="${a0}"] .flag-nowplaying`));
    setCondition('scratched'); ok('condition saved', getMeta(a0).condition === 'scratched');
    logPlay(); ok('play logged', getMeta(a0).playHistory.length === 1 && $('playHistoryRow').textContent.includes('1'));
    closeModal();

    // ═══ 2. fixed v10 bugs ═══
    // dropping foreign text on a slot (was: disc destroyed)
    const target = 3, before = JSON.stringify(discs[target]);
    const dtFoo = new DataTransfer(); dtFoo.setData('text/plain', 'hello world');
    document.querySelector(`.slot[data-index="${target}"]`).dispatchEvent(new DragEvent('drop', { dataTransfer: dtFoo, bubbles: true, cancelable: true }));
    ok('dropping foreign text on a slot leaves the disc intact (v10 destroyed it)', JSON.stringify(discs[target]) === before);
    // real slot-to-slot drag in edit mode still works and carries meta + custom art + now-playing
    await putCustomArt(a0, await resizeToDataUrl(PNG, 500));
    toggleEditMode();
    const swapTo = 20, discA = JSON.stringify(discs[a0]), discB = JSON.stringify(discs[swapTo]);
    const dt = new DataTransfer();
    document.querySelector(`.slot[data-index="${a0}"]`).dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }));
    document.querySelector(`.slot[data-index="${swapTo}"]`).dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    await wait(100);
    ok('slot-to-slot drag swaps discs', JSON.stringify(discs[swapTo]) === discA && JSON.stringify(discs[a0]) === discB);
    ok('swap carries flags/condition/play history with the disc', getMeta(swapTo).condition === 'scratched' && getMeta(swapTo).flags.includes('broken'));
    ok('swap carries custom art with the disc', customArt.has(swapTo) && !customArt.has(a0));
    ok('swap re-points NOW PLAYING', nowPlaying && nowPlaying.index === swapTo);
    ok('swap leaves no undefined entries in meta (would crash STATS in-session)', !Object.values(meta).some(v => v === undefined));
    ok('swapSlots rejects garbage indices', (() => { const s = JSON.stringify(discs); swapSlots(NaN, 2); swapSlots(-1, 2); swapSlots(2, 99999); swapSlots(5, 5); return JSON.stringify(discs) === s; })());
    swapSlots(swapTo, a0); toggleEditMode();

    // keyboard
    const inp = $('searchInput'); inp.focus();
    const ev = new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true });
    inp.dispatchEvent(ev);
    ok('arrow keys inside the search box are not hijacked (v10 hijacked them)', ev.defaultPrevented === false);
    inp.blur();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '/' }));
    ok('"/" focuses search', document.activeElement === inp);
    inp.value = 'abc'; inp.blur();
    const ar = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
    document.body.dispatchEvent(ar);
    ok('arrow navigation still works outside inputs', ar.defaultPrevented === true);
    inp.value = ''; applyFilters();

    // batch bar + multi-select
    toggleMultiSelect(); selectedSlots.add(1); updateBatchBar();
    ok('batch bar shows with a selection', $('batchBar').classList.contains('visible'));
    toggleMultiSelect();
    ok('batch bar hides when multi-select is switched off (v10 left it up)', !$('batchBar').classList.contains('visible'));
    toggleMultiSelect(); selectedSlots.add(1); selectedSlots.add(2);
    batchFlag('replace'); ok('batch flag works', getMeta(1).flags.includes('replace') && getMeta(2).flags.includes('replace'));
    batchClearFlags(); ok('batch clear flags works', getMeta(1).flags.length === 0);
    toggleMultiSelect();

    // ═══ 3. lookup logic (stubbed MusicBrainz / iTunes) ═══
    let n0 = calls.length;
    const junk = await fetchDiscData('Asphyx', 'DVD (needs replacement)');
    ok('junk title skipped with ZERO network calls', junk.skipped === true && calls.length === n0, calls.length - n0);
    mbMode = 'ok'; calls.length = 0;
    const good = await fetchDiscData('Absu', 'Tara');
    ok('lookup: multi-disc numbers + tag order (year,country,type) preserved', good.tracks.length === 3 && good.tracks[2].num === '2.1' && JSON.stringify(good.tags) === '["1993","US","Album"]', JSON.stringify(good.tags));
    ok('lookup: CAA + iTunes sources', good.artSources.some(s => s.includes('/release/rel-1/')) && good.artSources.some(s => s.includes('600x600bb')));
    ok('lookup: iTunes preview URL captured (fetch-all used to drop it)', good.previewUrl === 'https://audio.example/p.m4a', good.previewUrl);
    const d2 = await fetchDiscData('Absu', 'Tara (Disc 2)');
    ok('(Disc 2) -> only disc 2 tracks', d2.tracks.length === 1 && d2.tracks[0].title === 'Disc Two Track');
    mbMode = 'lowscore'; const low = await fetchDiscData('Absu', 'Tara');
    ok('low MusicBrainz score rejected', low.tracks.length === 0 && !low.mbid && low.mbTried === true);
    mbMode = 'wrongartist'; const wr = await fetchDiscData('Absu', 'Tara');
    ok('mismatched artist credit rejected', wr.tracks.length === 0 && !wr.mbid);
    mbMode = '503'; const f503 = await fetchDiscData('Absu', 'Tara');
    ok('503 -> transient (mbTried=false), not complete', f503.mbTried === false && !entryComplete(f503));
    mbCache['Absu|Tara'] = { mbid: 'x', mbUrl: 'https://musicbrainz.org/release/x', artSources: [], tracks: [{ num: 1, title: 'keep me' }], tags: ['1995'], mbTried: true, v: 2 };
    await ensureData('Absu', 'Tara', true);
    ok('forced refresh during an outage does NOT downgrade existing tracks', mbCache['Absu|Tara'].tracks[0].title === 'keep me');
    mbMode = 'empty'; await ensureData('Nobody', 'Nothing Here');
    ok('genuine "no match" cached as complete (no retry loop)', entryComplete(mbCache['Nobody|Nothing Here']));
    mbMode = 'ok';

    window.sleep = realSleep;
    const t1 = Date.now(); await mbFetchJson('https://musicbrainz.org/ws/2/release/?query=a'); await mbFetchJson('https://musicbrainz.org/ws/2/release/?query=b'); const gap = Date.now() - t1;
    ok('MusicBrainz calls are spaced >= ~1s apart (global queue)', gap >= 1000, gap + 'ms');
    window.sleep = fastSleep;

    // ═══ 4. legacy custom art migration (v10 kept base64 inside meta in localStorage) ═══
    meta[150] = { flags: [], notes: 'n', condition: '', playHistory: [], loanedTo: '', loanDate: '', customArt: PNG };
    saveMeta();
    ok('precondition: legacy base64 sits in the meta blob', localStorage.getItem(META_KEY).includes('data:image'));
    await migrateLegacyMetaArt();
    ok('legacy art moved to IndexedDB as resized JPEG', customArt.has(150) && customArt.get(150).startsWith('data:image/jpeg'));
    ok('meta blob no longer contains image data', !localStorage.getItem(META_KEY).includes('data:image') && meta[150].customArt === undefined && meta[150].notes === 'n');
    const persisted = await new Promise(res => { const r = indexedDB.open('cc_custom_art', 1); r.onsuccess = () => { const q = r.result.transaction('art').objectStore('art').get(150); q.onsuccess = () => res(q.result); q.onerror = () => res(null); }; r.onerror = () => res(null); });
    ok('custom art really persisted in IndexedDB', typeof persisted === 'string' && persisted.startsWith('data:image/jpeg'));

    // ═══ 5. edit flows ═══
    const e0 = idxOf('Absu', 'Third Storm') >= 0 ? 1 : 1;
    openEditModal(null, e0);
    $('editAlbum').value = 'The Third Storm (Remaster)'; $('editNotes').value = 'pressing X';
    toggleFlag('loaned'); $('loanedTo').value = 'Sam'; $('loanDate').value = '2026-01-02';
    pendingArtData = await resizeToDataUrl(PNG, 500);
    await saveEdit();
    ok('edit: fields, flags, loan info saved', discs[e0][1].includes('Remaster') && getMeta(e0).notes === 'pressing X' && getMeta(e0).flags.includes('loaned') && getMeta(e0).loanedTo === 'Sam' && getMeta(e0).loanDate === '2026-01-02');
    ok('edit: persisted to localStorage', JSON.parse(localStorage.getItem(DISC_KEY))[e0][1].includes('Remaster') && JSON.parse(localStorage.getItem(META_KEY))[e0].loanedTo === 'Sam');
    ok('edit: custom art stored in IDB (not in meta), slot shows image', customArt.has(e0) && !('customArt' in getMeta(e0)) && !!document.querySelector(`.slot[data-index="${e0}"] img.slot-art`));
    ok('edit: modal closed, toast shown', !$('editModal').classList.contains('open') && $('toast').textContent === 'SAVED');
    openEditModal(null, e0); clearUploadedArt(); await saveEdit();
    ok('REMOVE CUSTOM ART removes it (v10: only half-worked)', !customArt.has(e0) && !!document.querySelector(`.slot[data-index="${e0}"] .slot-art-placeholder`));
    mbCache[keyOf(discs[e0])] = { artSources: ['https://img.example/x.jpg'], tracks: [], tags: [], mbTried: true, v: 2 };
    openEditModal(null, e0); clearUploadedArt(); await saveEdit();
    ok('CLEAR AUTO ART clears it (v10: no-op)', autoSources(mbCache[keyOf(discs[e0])]).length === 0);
    openEditModal(null, e0);
    $('editAlbum').value = 'Entered via Enter key';
    $('editAlbum').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await wait(100);
    ok('Enter key saves the edit modal', discs[e0][1] === 'Entered via Enter key' && !$('editModal').classList.contains('open'));

    // blank-save = confirm + wipe everything attached to the slot
    const ghost = 7; getMeta(ghost).flags = ['broken']; getMeta(ghost).notes = 'ghost'; await putCustomArt(ghost, PNG); nowPlaying = { index: ghost, artist: 'a', album: 'b' };
    confirms.length = 0;
    openEditModal(null, ghost); $('editArtist').value = ''; $('editAlbum').value = '';
    await saveEdit();
    const gm = meta[ghost];
    ok('blank save asks first, then empties slot AND its ghost data',
       confirms.some(c => c.includes('Clear disc')) && discs[ghost] === null && (!gm || (!gm.notes && !gm.flags.length && !gm.condition && !gm.playHistory.length)) && !customArt.has(ghost) && nowPlaying === null,
       `confirm=${confirms.some(c => c.includes('Clear disc'))} disc=${JSON.stringify(discs[ghost])} meta=${JSON.stringify(gm)} art=${customArt.has(ghost)} np=${JSON.stringify(nowPlaying)}`);

    // ═══ 6. storage failure / corruption ═══
    const origSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function () { throw new DOMException('quota', 'QuotaExceededError'); };
    ok('saveDiscs returns false instead of throwing on quota error', saveDiscs() === false);
    ok('user warned on quota error', $('toast').textContent.toLowerCase().includes('storage full'));
    openEditModal(null, 30); $('editAlbum').value = 'Quota Test';
    let threw = false; try { await saveEdit(); } catch (e) { threw = true; }
    Storage.prototype.setItem = origSet;
    ok('saveEdit survives a full localStorage and closes', !threw && !$('editModal').classList.contains('open'));
    const goodList = localStorage.getItem(DISC_KEY);
    localStorage.setItem(DISC_KEY, '{not json');
    const rec = loadDiscs();
    ok('corrupt saved list -> defaults + raw copy preserved', rec.length >= 200 && localStorage.getItem(DISC_KEY + '_corrupt') === '{not json');
    localStorage.setItem(DISC_KEY, goodList);
    localStorage.setItem(META_KEY, '[1,2,3]');
    ok('malformed meta blob -> safe empty object', Object.keys(loadMeta()).length === 0);
    saveMeta();
    ok('getMeta heals partial records', (() => { meta[3] = { notes: 5 }; const m = getMeta(3); return Array.isArray(m.flags) && Array.isArray(m.playHistory) && m.notes === ''; })());
    localStorage.removeItem('cc_cleanup_declined'); localStorage.setItem('cc_cache_v2', '{"a":1}'); localStorage.setItem('cc_cache_v3', '{"x":"data:image/png;base64,AAAA"}');
    offerOldCacheCleanup();
    ok('old cache cleanup removes plain keys, NEVER keys with image data', localStorage.getItem('cc_cache_v2') === null && localStorage.getItem('cc_cache_v3') !== null);

    // ═══ 7. info modal ═══
    const hostile = "x&#39;);window.__pwn=1;//";
    mbCache[keyOf(discs[3])] = { mbTried: true, v: 2, artSources: [], tags: ['1990'], previewUrl: 'http://insecure.example/p.mp3', tracks: [{ num: 1, title: hostile, length: '1:00' }, { num: 2, title: "Don't Fear", length: '3:00' }] };
    similarCache.set(discs[3][0], ["King's X", 'Old Man\'s Child']);
    openInfoModal(3); await wait(200);
    const rows = document.querySelectorAll('#trackList .track-item');
    ok('track titles stored verbatim as data (no inline JS anywhere)', rows[0].dataset.title === hostile && !document.querySelector('#trackList [onclick]'));
    opened.length = 0;
    rows[0].querySelector('[data-act="lyrics"]').click(); await wait(150);
    ok('hostile title executed nothing; lyrics panel opened', window.__pwn === undefined && $('lyricsPanel').classList.contains('open'));
    rows[1].querySelector('[data-act="yt"]').click();
    ok("YouTube button works for a title with an apostrophe (v10: broken)", opened.length === 1 && opened[0].includes("Don't") , opened[0]);
    ok('insecure http preview URL rejected', !$('previewPlayer').classList.contains('visible'));
    const chips = document.querySelectorAll('#similarList .similar-chip');
    ok('similar-artist chips render with data (no inline JS)', chips.length === 2 && !document.querySelector('#similarList [onclick]'));
    opened.length = 0; chips[0].click();
    ok("similar chip with an apostrophe opens Discogs (v10: broken)", opened.length === 1 && opened[0].includes('discogs.com') && opened[0].includes("King's"), opened[0]);
    ok('DISCOGS button always available (even without a MusicBrainz match)', $('discogsBtn').style.display !== 'none');
    // stale chips must not leak onto the next disc
    const junkIdx = idxOf('Peste Noire', 'unknown');
    openInfoModal(junkIdx); await wait(200);
    ok('similar-artists panel resets when another disc opens (v10 leaked stale chips)', $('similarSection').style.display === 'none' && $('similarList').children.length === 0);
    ok('junk-title modal explains itself', $('trackList').textContent.includes('Placeholder'));
    closeModal();

    // layered Escape
    openInfoModal(3); await wait(100);
    openEditModal(null, 3);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    ok('Esc closes only the TOP layer', !$('editModal').classList.contains('open') && $('infoModal').classList.contains('open'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    ok('second Esc closes the next layer', !$('infoModal').classList.contains('open'));
    openHeatmap(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    ok('Esc now closes the heatmap (v10 forgot it)', !$('heatmapModal').classList.contains('open'));
    openInfoModal(3); await wait(100); document.body.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', cancelable: true }));
    ok('focus trapped inside open modal on Tab', $('infoModal').contains(document.activeElement));
    closeModal();

    // modal race
    mbMode = 'slow';
    const slowIdx = idxOf('Absu', 'The Sun of Tiphareth') >= 0 ? idxOf('Absu', 'The Sun of Tiphareth') : 40, fastIdx = 3;
    delete mbCache[keyOf(discs[slowIdx])];
    openInfoModal(slowIdx); openInfoModal(fastIdx);
    await wait(3500);
    ok('slow lookup for ANOTHER disc does not overwrite the open modal (v10 race)', $('modalAlbum').textContent === discs[fastIdx][1] && $('trackList').textContent.includes('Don'), $('modalAlbum').textContent);
    ok('...but it was still cached for later', entryComplete(mbCache[keyOf(discs[slowIdx])]));
    mbMode = 'ok'; closeModal();

    // QR / popups
    openRet = null; currentMbUrl = null;
    showQR(); ok('QR: popup blocked is reported instead of throwing', $('toast').textContent.includes('POPUP BLOCKED'));
    let written = ''; openRet = { document: { write: s => { written = s; }, close() {} } }; currentMbUrl = 'https://musicbrainz.org/release/abc';
    openInfoModal(3); await wait(50); currentMbUrl = 'https://musicbrainz.org/release/abc'; showQR();
    ok('QR encodes the real MusicBrainz URL (v10 read .href of a <button>)', written.includes(encodeURIComponent('https://musicbrainz.org/release/abc')), written.slice(0, 160));
    closeModal(); openRet = null;
    printView(); ok('print: popup blocked is reported', $('toast').textContent.includes('POPUP BLOCKED'));

    // ═══ 8. fetch-all / batch refetch ═══
    const savedDiscs = discs, savedMeta = meta;
    await putCustomArt(0, await resizeToDataUrl(PNG, 500));
    discs = [['Absu', 'Tara'], ['Absu', 'Tara'], ['Nobody', 'unknown'], null]; meta = {};
    delete mbCache['Absu|Tara']; delete mbCache['Nobody|unknown'];
    buildGrid(); calls.length = 0;
    await fetchAllArt();
    const searches = calls.filter(c => c.includes('/release/?query=')).length;
    ok('fetch-art dedupes identical discs + skips junk (exactly 1 MB search)', searches === 1, searches);
    ok('fetch-art completed the real disc incl. preview URL', entryComplete(mbCache['Absu|Tara']) && mbCache['Absu|Tara'].tracks.length === 3 && !!mbCache['Absu|Tara'].previewUrl);
    ok('junk disc marked skipped (no retry loop)', mbCache['Nobody|unknown'] && mbCache['Nobody|unknown'].skipped === true);
    ok('custom art survives fetch-art', customArt.has(0));
    confirms.length = 0; await fetchAllArt();
    ok('re-check offers a SAFE refresh and keeps custom art', confirms.some(c => c.includes('never touched')) && customArt.has(0));
    // batch refetch with outage keeps old data
    mbMode = '503'; multiSelect = true; selectedSlots = new Set([0, 1]);
    await batchRefetchArt();
    ok('batch REFETCH during an outage keeps existing data (v10 deleted it first)', mbCache['Absu|Tara'].tracks.length === 3);
    mbMode = 'ok';
    selectedSlots = new Set([0]); await batchClear();
    ok('batch CLEAR removes slot + ghost data + custom art', discs[0] === null && !customArt.has(0));
    discs = savedDiscs; meta = savedMeta; multiSelect = false; selectedSlots = new Set(); buildGrid();

    // ═══ 9. + SLOT ═══
    ok('+ SLOT hidden outside edit mode', getComputedStyle($('addSlotBtn')).display === 'none');
    toggleEditMode(); ok('+ SLOT visible in edit mode', getComputedStyle($('addSlotBtn')).display !== 'none'); toggleEditMode();
    const before2 = discs.length; addSlot();
    ok('+ SLOT appends, persists, updates counters/title/jump range', discs.length === before2 + 1 && $('grid').children.length === before2 + 1 && $('slotTotal').textContent === String(before2 + 1) && document.title.includes((before2 + 1) + ' Disc') && JSON.parse(localStorage.getItem(DISC_KEY)).length === before2 + 1);

    // ═══ 10. backup / restore ═══
    const origCreate = URL.createObjectURL, origClick = HTMLAnchorElement.prototype.click;
    const blobs = [], clicked = [];
    URL.createObjectURL = b => { blobs.push(b); return 'blob:fake' + blobs.length; };
    HTMLAnchorElement.prototype.click = function () { clicked.push({ href: this.href, download: this.download }); };
    await putCustomArt(12, await resizeToDataUrl(PNG, 500));
    exportBackup();
    const bk = JSON.parse(await blobs[0].text());
    ok('export v2: discs + meta + cache + customArt map + version', bk.version === 2 && bk.app === 'CrateChanger' && Array.isArray(bk.discs) && typeof bk.meta === 'object' && typeof bk.mbCache === 'object' && !!bk.customArt['12']);
    ok('export: no base64 inside meta', !JSON.stringify(bk.meta).includes('data:image'));
    ok('export: dated filename + backup timestamp recorded', /^CrateChanger_backup_\d{4}-\d{2}-\d{2}\.json$/.test(clicked[0].download) && !!localStorage.getItem(BACKUP_KEY));
    // import a v2 backup
    bk.discs[0] = ['IMPORTED', 'Album X']; bk.customArt = { '4': await resizeToDataUrl(PNG, 500) };
    blobs.length = 0; clicked.length = 0; confirms.length = 0;
    await importBackup({ target: { files: [new File([JSON.stringify(bk)], 'b.json')], value: '' } });
    ok('import: dry-run summary shown first', confirms.some(c => c.startsWith('DRY RUN')));
    ok('import: a pre-import safety backup was downloaded BEFORE replacing', clicked.length === 1 && /^CrateChanger_pre-import_/.test(clicked[0].download));
    ok('import: list replaced, custom art replaced (slot-indexed) and grid rebuilt', discs[0][0] === 'IMPORTED' && customArt.has(4) && !customArt.has(12) && $('grid').children[0].textContent.includes('IMPORTED'));
    ok('import: in-browser safety copy kept', !!localStorage.getItem(DISC_KEY + '_prev'));
    // import an ORIGINAL v10 backup (custom art inside meta, no version/app)
    const legacy = { discs: [['Legacy', 'Backup']], meta: { 0: { flags: ['broken'], notes: 'old', customArt: PNG } }, mbCache: {}, exportedAt: '2026-01-01', version: 1 };
    await importBackup({ target: { files: [new File([JSON.stringify(legacy)], 'old.json')], value: '' } });
    ok('import: original v10 backups still restore (art migrated out of meta)', discs[0][0] === 'Legacy' && getMeta(0).flags.includes('broken') && customArt.has(0) && !('customArt' in meta[0]));
    const snap = JSON.stringify(discs); alerts.length = 0;
    await importBackup({ target: { files: [new File(['{"nope":1}'], 'bad.json')], value: '' } });
    ok('import: invalid file rejected with a message, data untouched', alerts.some(a => a.includes('Import failed')) && JSON.stringify(discs) === snap);
    // CSV
    discs[1] = ['=HYPERLINK("http://evil")', '+cmd|calc']; blobs.length = 0;
    exportCSV();
    const csv = await blobs[0].text();
    ok('CSV: formula-injection guarded', csv.includes('"\'=HYPERLINK') && csv.includes('"\'+cmd'));
    URL.createObjectURL = origCreate; HTMLAnchorElement.prototype.click = origClick;

    // download art for custom (data:) images
    const origClick2 = HTMLAnchorElement.prototype.click; const dl = [];
    HTMLAnchorElement.prototype.click = function () { dl.push(this.download); };
    currentArtUrl = PNG; $('modalArtist').textContent = 'A/B'; $('modalAlbum').textContent = 'C:D';
    await downloadArt();
    HTMLAnchorElement.prototype.click = origClick2;
    ok('download art works for custom images with a sanitized name', dl[0] === 'A_B - C_D.jpg', dl[0]);

    // ═══ 11. misc ═══
    ok('responsive rules present', Array.from(document.styleSheets).some(s => { try { return Array.from(s.cssRules).some(r => r.type === CSSRule.MEDIA_RULE && r.conditionText.includes('max-width')); } catch (e) { return false; } }));

    // ═══ 12. ROUND-3 ENHANCEMENTS ═══
    discs = INITIAL_DATA.map(normalizeDisc); while (discs.length < 200) discs.push(null);
    meta = {}; mbCache = {}; artistCache = {}; await clearCustomArt(); nowPlaying = null; mbMode = 'ok';
    $('searchInput').value = ''; $('artistFilter').value = ''; $('flagFilter').value = ''; $('sortSelect').value = 'slot';
    buildGrid();

    // lookups against the REAL response shape
    calls.length = 0;
    const g3 = await fetchDiscData('Absu', 'Tara');
    const detailCall = calls.find(c => c.includes('/release/rel-1'));
    ok('release lookup requests release-groups (live API omits them otherwise)', !!detailCall && decodeURIComponent(detailCall).includes('release-groups'), detailCall);
    ok('original year from the release-group; pressing year kept separately', g3.year === '1993' && g3.editionYear === '1995' && g3.tags[0] === '1993' && g3.type === 'Album' && g3.rgId === 'rg-1', JSON.stringify({ y: g3.year, e: g3.editionYear, t: g3.tags }));
    ok('release-group cover-art fallback now actually present', g3.artSources.some(s => s.includes('/release-group/rg-1/')));
    ok('artist looked up: genres + band origin cached', !!artistCache['art-1'] && artistCache['art-1'].country === 'US' && artistCache['art-1'].genres[0] === 'black metal' && g3.artistId === 'art-1' && g3.v === CACHE_SCHEMA);
    const nArt = calls.length; await ensureArtist('art-1');
    ok('artist info served from cache afterwards (no extra request)', calls.length === nArt);

    mbMode = 'split'; calls.length = 0;
    const sp = await fetchDiscData('Absu', 'Tara / Some Other Release');
    ok('double release "A / B" falls back to matching "A"', sp.tracks.length === 3 && calls.some(c => decodeURIComponent(c).includes('release:"Tara"')), sp.tracks.length);
    mbMode = 'ok';

    // info modal: tags, notes, loans
    const tIdx = idxOf('Absu', 'Tara');
    mbCache['Absu|Tara'] = g3;
    const tm = getMeta(tIdx); tm.notes = 'Signed copy\nbought 2003'; tm.flags = ['loaned']; tm.loanedTo = 'Sam';
    tm.loanDate = new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 10);
    openInfoModal(tIdx); await wait(250);
    const tagText = $('modalTags').textContent;
    ok('modal tags: original year, edition, pressing country, type, band origin, genres', tagText.includes('1993') && tagText.includes('ED. 1995') && tagText.includes('PRESS US') && tagText.includes('Album') && tagText.includes('ORIGIN United States') && !!document.querySelector('#modalTags .genre-tag'), tagText);
    const notesTxt = $('modalNotes').textContent;
    ok('modal shows notes + who has it on loan + days (overdue highlighted)', $('modalNotes').style.display !== 'none' && notesTxt.includes('Sam') && notesTxt.includes('45 DAYS') && notesTxt.includes('Signed copy') && !!document.querySelector('#modalNotes .loan-line.overdue'), notesTxt);
    ok('"you might also like" relabelled to what it is', document.querySelector('.similar-header').textContent === 'RELATED ARTISTS');
    closeModal();
    openInfoModal(idxOf('Absu', 'The Third Storm of Cythraul')); await wait(150);
    ok('notes panel hidden for a disc without notes / loan', $('modalNotes').style.display === 'none');
    closeModal();

    // older (v1) cache entries: instant render, then upgraded in place; never downgraded
    const sKey = 'Absu|The Sun of Tiphareth', sIdx = idxOf('Absu', 'The Sun of Tiphareth');
    mbCache[sKey] = { mbid: 'old', mbUrl: 'https://musicbrainz.org/release/old', artSources: [], tags: ['2005', 'DE'], tracks: [{ num: 1, title: 'Old Track' }], mbTried: true };
    ok('v1 entry is flagged for upgrade', needsUpgrade(mbCache[sKey]));
    mbMode = 'slow';   // make the background upgrade observable: render first, upgrade ~1.5 s later
    openInfoModal(sIdx); await wait(40);
    ok('v1 entry renders instantly from cache', $('trackList').textContent.includes('Old Track'), $('trackList').textContent.slice(0, 60));
    await wait(2500);
    mbMode = 'ok';
    ok('...then upgrades in place while the modal is open', mbCache[sKey].v === CACHE_SCHEMA && $('modalTags').textContent.includes('1993') && !!document.querySelector('#modalTags .genre-tag'), $('modalTags').textContent);
    closeModal();
    mbMode = 'wrongartist';
    mbCache['Absu|Tara'] = { mbid: 'old', artSources: [], tags: ['2001'], tracks: [{ num: 1, title: 'Keep Me' }], mbTried: true };
    await ensureData('Absu', 'Tara', true, true);
    ok('upgrade with no confident re-match keeps the old tracklist and stops retrying', mbCache['Absu|Tara'].tracks[0].title === 'Keep Me' && !needsUpgrade(mbCache['Absu|Tara']));
    mbMode = '503';
    mbCache['Absu|Tara'] = { mbid: 'old', artSources: [], tags: ['2001'], tracks: [{ num: 1, title: 'Keep Me' }], mbTried: true };
    await ensureData('Absu', 'Tara', true, true);
    ok('upgrade during an outage keeps data AND stays queued for a later retry', mbCache['Absu|Tara'].tracks[0].title === 'Keep Me' && needsUpgrade(mbCache['Absu|Tara']));
    mbMode = 'ok';

    // FETCH ART: upgrades v1 entries, shows an ETA, then fills only missing artist info
    discs = [['Absu', 'A1'], ['Absu', 'A2'], ['Absu', 'A3'], ['Absu', 'A4'], ['Absu', 'A5'], ['Absu', 'A6']];
    while (discs.length < 200) discs.push(null);
    meta = {}; mbCache = { 'Absu|A1': { tracks: [{ num: 1, title: 'x' }], tags: [], artSources: [], mbTried: true } };
    artistCache = {};
    buildGrid();
    const labels = [];
    const mo = new MutationObserver(() => labels.push($('fetchCurrentLabel').textContent));
    mo.observe($('fetchCurrentLabel'), { childList: true, characterData: true, subtree: true });
    confirms.length = 0;
    await fetchAllArt();
    mo.disconnect();
    ok('FETCH ART upgraded the v1 entry and looked up the rest', ['A1', 'A2', 'A3', 'A4', 'A5', 'A6'].every(a => mbCache['Absu|' + a] && mbCache['Absu|' + a].v === CACHE_SCHEMA) && confirms.length === 0);
    ok('FETCH ART shows an ETA', labels.some(l => l.includes('MIN LEFT')), labels.slice(-2).join(' / '));
    artistCache = {}; calls.length = 0; confirms.length = 0;
    await fetchAllArt();
    ok('FETCH ART fills missing artist info without re-searching releases', !!artistCache['art-1'] && calls.filter(c => c.includes('/release/?query=')).length === 0 && confirms.length === 0, calls.length + ' calls');

    // STATS
    discs = INITIAL_DATA.map(normalizeDisc); while (discs.length < 200) discs.push(null);
    meta = {}; mbCache = {};
    artistCache = { 'art-1': { name: 'Absu', country: 'US', genres: ['black metal', 'thrash metal'] }, 'art-2': { name: 'Cradle Of Filth', country: 'GB', genres: ['black metal', 'gothic metal'] } };
    discs.forEach(d => { if (!isSlotEmpty(d)) mbCache[keyOf(d)] = { mbTried: true, v: 2, tracks: [{ num: 1, title: 't' }], tags: ['1999'], artSources: [], artistId: d[0] === 'Absu' ? 'art-1' : d[0] === 'Cradle Of Filth' ? 'art-2' : null }; });
    const typo = idxOf('Malignancy', 'Frality Of The Human Condition');
    mbCache[keyOf(discs[typo])] = { mbTried: true, v: 2, tracks: [], tags: [], artSources: [] };
    const phIdx = idxOf('Peste Noire', 'unknown');
    mbCache[keyOf(discs[phIdx])] = { skipped: true, mbTried: true, v: 2, tracks: [], tags: [], artSources: [] };
    getMeta(5).condition = 'good';
    getMeta(6).flags = ['loaned']; getMeta(6).loanedTo = 'Dee'; getMeta(6).loanDate = new Date(Date.now() - 40 * 86400000).toISOString().slice(0, 10);
    buildGrid();
    openStats();
    const st = $('statsContent').textContent;
    ok('stats: GOOD condition count shown', st.includes('GOOD: 1'));
    const topVal = document.querySelector('#statsContent .stat-card:nth-child(4) .val').textContent;
    ok('stats: TOP ARTIST shows the full name', topVal === 'Cradle Of Filth', topVal);
    ok('stats: genre cloud from MusicBrainz genres', !!document.querySelector('#statsContent .genre-tag-cloud') && st.includes('black metal'));
    ok('stats: BAND ORIGIN (not pressing country)', st.includes('BAND ORIGIN') && st.includes('GB') && !st.includes('COUNTRY OF ORIGIN'));
    ok('stats: NEEDS ATTENTION lists the typo and the placeholder', typo >= 0 && st.includes('Frality') && st.includes('NO CONFIDENT MATCH') && st.includes('PLACEHOLDER TITLE'));
    ok('stats: ON LOAN lists who has what; >30 days highlighted', st.includes('Dee') && st.includes('40 DAYS') && !!document.querySelector('#statsContent .attn-row.overdue'));
    document.querySelector(`#statsContent [data-edit-slot="${typo}"]`).click();
    ok('clicking a NEEDS ATTENTION row opens that disc in the editor', $('editModal').classList.contains('open') && $('editAlbum').value.startsWith('Frality') && !$('statsModal').classList.contains('open'));
    closeEditModal();

    // NOW PLAYING follows edits
    nowPlaying = { index: 0, artist: 'stale', album: 'stale' }; buildGrid();
    discs[0] = ['Absu', 'Renamed Album']; updateNowPlayingBanner();
    ok('NOW PLAYING banner reflects the current disc, not a stale copy', $('npText').textContent.includes('Renamed Album'), $('npText').textContent);
    nowPlaying = null; updateNowPlayingBanner();

    // RANDOM only picks playable discs
    const allowed = new Set([10, 20, 30]);
    discs.forEach((d, i) => {
      if (isSlotEmpty(d)) return;
      const m = getMeta(i); m.flags = []; m.condition = '';
      if (allowed.has(i)) return;
      const r = i % 4;
      if (r === 0) m.flags = ['wishlist']; else if (r === 1) m.flags = ['broken']; else if (r === 2) m.flags = ['loaned']; else m.condition = 'unplayable';
    });
    const origOpen = window.openInfoModal; const picks = [];
    window.openInfoModal = i => picks.push(i);
    for (let k = 0; k < 40; k++) pickRandom();
    await wait(700);
    window.openInfoModal = origOpen;
    ok('RANDOM never picks wishlist / broken / loaned / unplayable discs', picks.length === 40 && picks.every(i => allowed.has(i)), [...new Set(picks)].join(','));
    discs.forEach((d, i) => { if (meta[i]) { meta[i].flags = []; meta[i].condition = ''; } });
    buildGrid();

    // keyboard: real column count (grid + list view)
    const navSlots = () => Array.from(document.querySelectorAll('.slot:not(.empty-slot):not(.filtered-out)'));
    let ns = navSlots(); const expCols = ns.findIndex(s => s.offsetTop !== ns[0].offsetTop);
    focusedSlot = 0; document.activeElement && document.activeElement.blur && document.activeElement.blur();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    ok('grid view: ArrowDown moves exactly one row', focusedSlot === expCols && expCols > 1, focusedSlot + ' vs ' + expCols);
    toggleListView(); focusedSlot = 0;
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    ok('list view: ArrowDown moves exactly one item (v10 jumped several)', focusedSlot === 1, focusedSlot);
    toggleListView();

    // search: no rebuild; notes / loans; #N
    const firstEl = $('grid').firstElementChild;
    $('searchInput').value = 'cradle'; applyFilters();
    ok('typing in search toggles visibility instead of rebuilding (no image reloads)', $('grid').firstElementChild === firstEl && visible() === 9, visible());
    const obiHits = discs.map((d, i) => i).filter(i => discs[i] && (discs[i][0] + ' ' + discs[i][1]).toLowerCase().includes('obi')).map(i => discs[i].join(' - '));
    getMeta(40).notes = 'Japanese pressing with obi strip ZQX7'; $('searchInput').value = 'zqx7'; applyFilters();
    ok('search finds notes', visible() === 1 && !document.querySelector('.slot[data-index="40"]').classList.contains('filtered-out'), visible() + ' visible; titles containing "obi": ' + (obiHits.join(' | ') || 'none'));
    getMeta(41).loanedTo = 'Quentin'; $('searchInput').value = 'quentin'; applyFilters();
    ok('search finds who a disc is loaned to', visible() === 1);
    $('searchInput').value = '#12'; applyFilters();
    ok('"#12" matches exactly slot 12', visible() === 1 && !document.querySelector('.slot[data-index="11"]').classList.contains('filtered-out'));
    $('searchInput').value = '12'; applyFilters();
    ok('plain "12" still substring-matches slot numbers', visible() > 1, visible());
    window.prompt = () => '150'; $('searchInput').value = 'absu'; applyFilters(); jumpToSlot();
    ok('JUMP to a slot hidden by the filter explains why', $('toast').textContent.includes('HIDDEN'));
    $('searchInput').value = ''; applyFilters();

    // artist sort ignores a leading "The"
    $('sortSelect').value = 'artist'; applyFilters();
    const ord = Array.from($('grid').children).map(e => discs[Number(e.dataset.index)]).filter(d => !isSlotEmpty(d)).map(d => d[0]);
    const pChasm = ord.indexOf('The Chasm'), pCentinex = ord.indexOf('Centinex'), pCianide = ord.indexOf('Cianide');
    ok('artist sort ignores a leading "The"', pCentinex >= 0 && pCentinex < pChasm && pChasm < pCianide, `${pCentinex} < ${pChasm} < ${pCianide}`);
    $('sortSelect').value = 'slot'; applyFilters();

    // UNDO
    const d0 = JSON.stringify(discs[0]), d5 = JSON.stringify(discs[5]);
    await putCustomArt(0, await resizeToDataUrl(PNG, 500));
    swapSlots(0, 5); await wait(50);
    ok('swap offers UNDO', $('undoBar').classList.contains('visible') && $('undoText').textContent.includes('SWAPPED'));
    await performUndo();
    ok('UNDO reverts a swap (discs + custom art)', JSON.stringify(discs[0]) === d0 && JSON.stringify(discs[5]) === d5 && customArt.has(0) && !customArt.has(5));
    getMeta(8).notes = 'precious'; saveMeta();
    multiSelect = true; selectedSlots = new Set([8]); confirms.length = 0;
    await batchClear();
    ok('batch clear wiped the slot', discs[8] === null && confirms.some(c => c.includes('UNDO')));
    document.activeElement && document.activeElement.blur && document.activeElement.blur();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
    await wait(250);
    ok('Ctrl+Z undoes a batch clear (disc + notes back)', !isSlotEmpty(discs[8]) && getMeta(8).notes === 'precious');
    multiSelect = false; selectedSlots = new Set();
    const prevName = discs[9][1];
    openEditModal(null, 9); $('editAlbum').value = 'Oops'; await saveEdit();
    ok('edits offer UNDO too', $('undoText').textContent.includes('EDITED DISC 010'));
    await performUndo();
    ok('UNDO reverts an edit (memory + storage)', discs[9][1] === prevName && JSON.parse(localStorage.getItem(DISC_KEY))[9][1] === prevName);
    selectedSlots = new Set([3, 4]); multiSelect = true;
    batchFlag('replace'); ok('batch flag offers UNDO', $('undoText').textContent.includes('FLAGGED'));
    await performUndo(); ok('UNDO reverts a batch flag', !getMeta(3).flags.includes('replace'));
    multiSelect = false; selectedSlots = new Set();

    // MULTI-TAB SYNC
    swapSlots(30, 31); await wait(20);
    const savedList = JSON.parse(localStorage.getItem(DISC_KEY));
    savedList[2] = ['Other Tab', 'Changed This'];
    localStorage.setItem(DISC_KEY, JSON.stringify(savedList));
    window.dispatchEvent(new StorageEvent('storage', { key: DISC_KEY, storageArea: localStorage }));
    await wait(600);
    ok('changes made in another tab are picked up', discs[2][0] === 'Other Tab' && document.querySelector('.slot[data-index="2"]').textContent.includes('Other Tab') && $('toast').textContent.includes('ANOTHER TAB'));
    ok('stale UNDO is dropped after a sync (would revert the other tab)', !$('undoBar').classList.contains('visible'));
    const rev0 = localStorage.getItem('cc_art_rev');
    await putCustomArt(60, await resizeToDataUrl(PNG, 500));
    ok('saving custom art pings other tabs', localStorage.getItem('cc_art_rev') !== rev0);
    await new Promise(res => { const tx = artDB.transaction('art', 'readwrite'); tx.objectStore('art').put(PNG, 77); tx.oncomplete = res; });
    ok('precondition: art written behind this tab\'s back', !customArt.has(77));
    window.dispatchEvent(new StorageEvent('storage', { key: 'cc_art_rev', storageArea: localStorage }));
    await wait(700);
    ok('custom art added in another tab shows up here', customArt.has(77) && !!document.querySelector('.slot[data-index="77"] img.slot-art'));

    // BACKUP nudge + artist cache in backups
    localStorage.removeItem(BACKUP_KEY);
    ok('never-backed-up users get a nudge once they have data', (checkBackupReminder(0) || '').includes('NO BACKUP YET'));
    localStorage.setItem(BACKUP_KEY, new Date(Date.now() - 40 * 86400000).toISOString());
    ok('stale backups (>30 days) get a nudge with the age', (checkBackupReminder(0) || '').includes('40 DAYS'));
    localStorage.setItem(BACKUP_KEY, new Date().toISOString());
    ok('fresh backup -> no nag', checkBackupReminder(0) === null);
    const oc = URL.createObjectURL, ock = HTMLAnchorElement.prototype.click; let lb = null;
    URL.createObjectURL = b => { lb = b; return 'blob:x'; }; HTMLAnchorElement.prototype.click = function () {};
    artistCache = { 'art-1': { name: 'Absu', country: 'US', genres: ['black metal'] } };
    exportBackup(); const pk = JSON.parse(await lb.text());
    URL.createObjectURL = oc; HTMLAnchorElement.prototype.click = ock;
    ok('backup includes the artist cache (genres / origin)', !!pk.artistCache && pk.artistCache['art-1'].country === 'US');

    // LIGHT THEME
    toggleTheme();
    const phEl = document.querySelector('.slot-art-placeholder');
    const phBg = getComputedStyle(phEl).backgroundImage;
    ok('light theme: placeholders follow the theme (no hard-coded dark gradient)', !phBg.includes('rgb(22, 22, 32)'), phBg.slice(0, 90));
    toggleTheme();
    {   // round-4 tests in their own scope (names may repeat earlier sections)

    // ═══ 13. ROUND-4 ═══
    const resetAll = async () => {
      discs = INITIAL_DATA.map(normalizeDisc); while (discs.length < 200) discs.push(null);
      meta = {}; mbCache = {}; artistCache = {}; await clearCustomArt(); nowPlaying = null; mbMode = 'ok';
      $('searchInput').value = ''; ['artistFilter', 'flagFilter', 'genreFilter', 'decadeFilter', 'originFilter'].forEach(id => { $(id).value = ''; });
      $('sortSelect').value = 'slot'; dismissUndo();
      buildGrid();
    };
    await resetAll();
    const origOpenInfo = window.openInfoModal;

    // ── extra MusicBrainz fixtures for the edition picker ──
    const edSearch = { releases: [
      { id: 'rel-2', score: 100, title: 'Tara', date: '2001-05-23', country: 'FR', 'artist-credit': credit('Absu'), media: [{ format: 'CD', 'track-count': 11 }], 'track-count': 11, 'label-info': [{ label: { name: 'Osmose' } }] },
      { id: 'rel-3', score: 95, title: 'Tara', date: '2015-01-01', country: 'US', disambiguation: 'remaster', 'artist-credit': credit('Absu'), media: [{ format: 'CD', 'track-count': 13 }], 'track-count': 13 },
      { id: 'rel-x', score: 99, title: 'Tara', date: '1999-01-01', country: 'DE', 'artist-credit': credit('Someone Else'), media: [] }
    ] };
    const ed3 = { 'release-group': { id: 'rg-2', 'primary-type': 'Album', 'first-release-date': '2001-05-23' }, 'artist-credit': [{ name: 'Absu', artist: { id: 'art-1', name: 'Absu' } }], date: '2015-01-01', country: 'US', media: [{ tracks: [{ position: 1, title: 'Remastered One', length: 100000 }] }] };
    const baseFetch = window.fetch;
    window.fetch = (url, o) => {
      const u = String(url);
      if (mbMode === 'editions' && u.includes('/release/?query=') && u.includes('limit=25')) { calls.push(u); return reply(edSearch); }
      if (u.includes('/release/rel-3')) { calls.push(u); return reply(ed3); }
      if (u.includes('/release/rel-gone')) { calls.push(u); return reply({}, 404); }
      return baseFetch(url, o);
    };

    // ── EDITION PICKER ──
    const tI = idxOf('Absu', 'Tara'), tKey = 'Absu|Tara';
    const auto = await ensureData('Absu', 'Tara', true);
    ok('automatic match first (not pinned)', auto.mbid === 'rel-1' && !auto.pinned);
    openInfoModal(tI); await wait(200);
    ok('⇄ EDITION button shown in the disc view', $('editionBtn').style.display !== 'none');
    mbMode = 'editions';
    await openEditionPicker();
    const edRows = Array.from(document.querySelectorAll('#editionList .edition-row'));
    ok('edition picker lists only this artist\'s releases, oldest first', edRows.length === 2 && edRows[0].dataset.rel === 'rel-2' && edRows[1].dataset.rel === 'rel-3', edRows.map(r => r.dataset.rel).join(','));
    ok('rows show date, country, format, label and track count', /2001-05-23/.test(edRows[0].textContent) && /FR/.test(edRows[0].textContent) && /CD/.test(edRows[0].textContent) && /Osmose/.test(edRows[0].textContent) && /11 TRACKS/.test(edRows[0].textContent), edRows[0].textContent.replace(/\s+/g, ' '));
    edRows[1].click(); await wait(500);
    ok('picking a row pins that exact release', mbCache[tKey].mbid === 'rel-3' && mbCache[tKey].pinned === true && mbCache[tKey].tracks[0].title === 'Remastered One' && !$('editionModal').classList.contains('open'));
    ok('disc view shows the chosen edition', $('trackList').textContent.includes('Remastered One') && $('editionBtn').textContent.includes('PINNED'));
    ok('edition change is undoable', $('undoText').textContent.includes('EDITION'));
    calls.length = 0;
    await refreshCurrentDisc();
    ok('REFRESH keeps the pinned edition (no re-search)', mbCache[tKey].mbid === 'rel-3' && calls.some(c => c.includes('/release/rel-3')) && !calls.some(c => c.includes('/release/?query=')));
    useAutomaticEdition(); await wait(500);
    ok('USE AUTOMATIC MATCH unpins', mbCache[tKey].mbid === 'rel-1' && !mbCache[tKey].pinned);
    await performUndo();
    ok('UNDO restores the pinned edition', mbCache[tKey].mbid === 'rel-3' && mbCache[tKey].pinned === true);
    mbMode = 'ok';
    mbCache[tKey] = Object.assign({}, mbCache[tKey], { mbid: 'rel-gone', pinned: true });
    await ensureData('Absu', 'Tara', true);
    ok('a pinned release that vanished from MusicBrainz falls back to automatic (no data loss)', mbCache[tKey].mbid === 'rel-1' && !mbCache[tKey].pinned && mbCache[tKey].tracks.length > 0);
    mbMode = '503';
    await openEditionPicker();
    ok('edition picker explains when MusicBrainz is down', $('editionList').textContent.includes('unreachable'));
    closeEdition(); mbMode = 'ok'; closeModal();

    // ── MOVE TO SLOT ──
    const mA = 3, mB = 40;
    const dA = discs[mA].slice(), dB = discs[mB].slice();
    getMeta(mA).notes = 'moving note'; saveMeta();
    openEditModal(null, mA); $('editAlbum').value = dA[1] + ' (edited)'; $('moveToSlot').value = String(mB + 1);
    await moveToSlot(); await wait(100);
    ok('MOVE TO SLOT saves what was typed, then swaps', JSON.stringify(discs[mB]) === JSON.stringify([dA[0], dA[1] + ' (edited)']) && JSON.stringify(discs[mA]) === JSON.stringify(dB) && getMeta(mB).notes === 'moving note' && !$('editModal').classList.contains('open'));
    ok('move is undoable', $('undoText').textContent.includes('SWAPPED'));
    const snapM = JSON.stringify(discs);
    for (const v of ['0', '999999', 'abc', '']) { openEditModal(null, mA); $('moveToSlot').value = v; await moveToSlot(); }
    ok('invalid target slots are rejected, nothing changes', JSON.stringify(discs) === snapM && $('toast').textContent.includes('SLOT NUMBER'));
    closeEditModal();
    openEditModal(null, mA); $('moveToSlot').value = String(mA + 1); await moveToSlot();
    ok('moving to its own slot is a no-op', JSON.stringify(discs) === snapM && $('toast').textContent.includes('ALREADY'));
    closeEditModal();

    // ── MANUAL OVERRIDES ──
    const oI = idxOf('Peste Noire', 'unknown');
    openEditModal(null, oI);
    $('ovYear').value = '1999'; $('ovGenres').value = 'Black Metal, raw black metal'; $('ovTracks').value = 'First\n\nSecond\n  Third  ';
    await saveEdit();
    const ovm = getMeta(oI).override;
    ok('overrides saved (year, lower-cased genres, trimmed tracklist)', !!ovm && ovm.year === '1999' && ovm.genres.join('|') === 'black metal|raw black metal' && ovm.tracks.join('|') === 'First|Second|Third', JSON.stringify(ovm));
    mbCache[keyOf(discs[oI])] = { skipped: true, mbTried: true, v: 2, tracks: [], tags: [], artSources: [] };
    openInfoModal(oI); await wait(200);
    ok('manual tracklist shown even for a placeholder title MusicBrainz can\'t match', $('trackList').textContent.includes('MANUAL TRACKLIST') && document.querySelectorAll('#trackList .track-item').length === 3);
    ok('override year + genres shown as tags', $('modalTags').textContent.includes('1999') && $('modalTags').textContent.includes('raw black metal'));
    closeModal();
    buildGrid(); $('decadeFilter').value = '1990s'; applyFilters();
    ok('decade filter uses the override', !document.querySelector(`.slot[data-index="${oI}"]`).classList.contains('filtered-out'));
    clearAllFilters();
    openStats();
    ok('a manual tracklist resolves NEEDS ATTENTION', !$('statsContent').innerHTML.includes(`data-edit-slot="${oI}"`));
    closeStats();
    openEditModal(null, oI);
    ok('edit dialog reopens with overrides filled and expanded', $('ovGenres').value.includes('raw black metal') && $('overrideBox').open === true);
    $('ovYear').value = '19x9'; await saveEdit();
    ok('an invalid year blocks the save and keeps the dialog open', $('editModal').classList.contains('open') && $('toast').textContent.includes('4 DIGITS') && getMeta(oI).override.year === '1999');
    $('ovYear').value = ''; $('ovGenres').value = ''; $('ovTracks').value = ''; await saveEdit();
    ok('clearing all override fields removes the override', !getMeta(oI).override && !$('editModal').classList.contains('open'));

    // ── WISHLIST counted separately ──
    await resetAll();
    getMeta(5).flags = ['wishlist']; buildGrid();
    const ownedN = discs.filter((d, i) => !isSlotEmpty(d) && !isWish(i)).length;
    ok('LOADED counts owned discs; wishlist has its own pill', $('loadedCount').textContent === String(ownedN) && $('wishCount').textContent === '1' && $('wishPill').style.display !== 'none');
    openStats();
    const sCards = Array.from(document.querySelectorAll('#statsContent .stat-card'));
    ok('stats: LOADED = owned, separate ♥ WISHLIST card', sCards[0].querySelector('.val').textContent === String(ownedN) && sCards.some(c => c.textContent.includes('WISHLIST') && c.querySelector('.val').textContent === '1'));
    closeStats();
    openHeatmap();
    ok('heatmap marks wishlist even when the slot has disc data', $('heatmapGrid').children[5].classList.contains('hm-wishlist'));
    closeHeatmap();

    // ── GENRE / DECADE / ORIGIN FILTERS ──
    await resetAll();
    artistCache = { 'art-1': { name: 'Absu', country: 'US', genres: ['black metal', 'thrash metal'] }, 'art-2': { name: 'Cradle Of Filth', country: 'GB', genres: ['gothic metal'] } };
    discs.forEach(d => {
      if (isSlotEmpty(d)) return;
      if (d[0] === 'Absu') mbCache[keyOf(d)] = { mbTried: true, v: 2, tracks: [{ num: 1, title: 't' }], tags: ['1993'], artSources: [], artistId: 'art-1' };
      if (d[0] === 'Cradle Of Filth') mbCache[keyOf(d)] = { mbTried: true, v: 2, tracks: [{ num: 1, title: 't' }], tags: ['1996'], artSources: [], artistId: 'art-2' };
    });
    buildGrid();
    const opts = id => Array.from($(id).options).map(o => o.value + '=' + o.textContent);
    ok('genre / decade / origin dropdowns appear, with counts', $('genreFilter').style.display !== 'none' && opts('genreFilter').some(o => o.startsWith('black metal=') && o.includes('(3)')) && opts('originFilter').some(o => o.startsWith('GB=') && o.includes('UNITED KINGDOM')) && opts('decadeFilter').some(o => o.startsWith('1990s=')), opts('originFilter').join(' | '));
    $('genreFilter').value = 'gothic metal'; applyFilters();
    ok('genre filter', visible() === 9 && $('clearFiltersBtn').style.display !== 'none', visible());
    $('genreFilter').value = ''; $('originFilter').value = 'US'; applyFilters();
    ok('origin filter', visible() === 3, visible());
    $('decadeFilter').value = '1990s'; applyFilters();
    ok('filters combine', visible() === 3);
    clearAllFilters();
    ok('CLEAR FILTERS resets everything', visible() === 200 && $('clearFiltersBtn').style.display === 'none' && !$('originFilter').value);
    $('searchInput').value = 'thrash'; applyFilters();
    ok('search also matches genres', visible() === 3, visible());
    $('searchInput').value = '1996'; applyFilters();
    ok('search also matches years', visible() === 9, visible());
    clearAllFilters();

    // ── RANDOM respects filters ──
    $('genreFilter').value = 'gothic metal'; applyFilters();
    const picks = []; window.openInfoModal = i => picks.push(i);
    for (let k = 0; k < 20; k++) pickRandom();
    await wait(600);
    ok('RANDOM picks only from the filtered set ("random gothic metal disc")', picks.length === 20 && picks.every(i => discs[i][0] === 'Cradle Of Filth'), [...new Set(picks)].join(','));
    $('genreFilter').value = ''; $('searchInput').value = 'zzzz-nothing'; applyFilters(); picks.length = 0;
    pickRandom(); await wait(60);
    ok('RANDOM with no matches explains why', picks.length === 0 && $('toast').textContent.includes('MATCHES THE CURRENT FILTERS'));
    window.openInfoModal = origOpenInfo; clearAllFilters();

    // ── SORT by plays / recent + NEGLECTED ──
    getMeta(10).playHistory = ['2020-01-01T00:00:00Z', '2020-02-01T00:00:00Z', '2021-01-01T00:00:00Z'];
    getMeta(20).playHistory = [new Date().toISOString()];
    getMeta(30).playHistory = Array(5).fill('2019-05-05T00:00:00Z');
    $('sortSelect').value = 'plays'; applyFilters();
    const o1 = Array.from($('grid').children).slice(0, 3).map(e => +e.dataset.index).join();
    ok('sort: most played', o1 === '30,10,20', o1);
    $('sortSelect').value = 'recent'; applyFilters();
    const o2 = Array.from($('grid').children).slice(0, 3).map(e => +e.dataset.index).join();
    ok('sort: recently played', o2 === '20,10,30', o2);
    $('sortSelect').value = 'slot'; applyFilters();
    openStats();
    const negSec = Array.from($('statsContent').querySelectorAll('.stats-section')).find(s => s.textContent.startsWith('NEGLECTED'));
    const negRows = negSec ? Array.from(negSec.querySelectorAll('[data-open-slot]')).map(r => r.dataset.openSlot) : [];
    ok('stats: NEGLECTED lists long-unplayed discs oldest-first, recent plays excluded', !!negSec && negRows[0] === '30' && negRows[1] === '10' && !negRows.includes('20'), negRows.slice(0, 3).join(','));
    ok('stats: band origin shown by country NAME (Windows has no flag emoji)', $('statsContent').textContent.includes('United Kingdom'));
    window.openInfoModal = i => picks.push(i); picks.length = 0;
    for (let k = 0; k < 15; k++) { openStats(); $('statsContent').querySelector('[data-pick-neglected]').click(); }
    await wait(700);
    window.openInfoModal = origOpenInfo;
    ok('PICK A NEGLECTED DISC never picks a recently played one', picks.length === 15 && !picks.includes(20) && picks.every(i => isPlayable(i)), [...new Set(picks)].slice(0, 6).join(','));

    // ── cosmetics: flags vs slot number, art fit, help, theme ──
    getMeta(2).flags = ['loaned', 'broken']; await putCustomArt(1, PNG); buildGrid();
    const sEl = document.querySelector('.slot[data-index="2"]');
    const rng = document.createRange(); rng.selectNodeContents(sEl.querySelector('.slot-num'));
    const numRight = rng.getBoundingClientRect().right, flagsLeft = sEl.querySelector('.slot-flags').getBoundingClientRect().left;
    ok('flag badges no longer cover the slot number', flagsLeft >= numRight, Math.round(flagsLeft) + ' >= ' + Math.round(numRight));
    toggleArtFit();
    const artEl = document.querySelector('.slot[data-index="1"] .slot-art');
    ok('FIT: FULL shows the whole cover (remembered)', document.body.classList.contains('art-contain') && getComputedStyle(artEl).objectFit === 'contain' && localStorage.getItem('cc_artfit') === 'full' && $('artFitBtn').textContent.includes('FULL'));
    toggleArtFit();
    ok('...and back to crop', getComputedStyle(artEl).objectFit === 'cover');
    document.activeElement && document.activeElement.blur && document.activeElement.blur();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true, cancelable: true }));
    ok('"?" opens keyboard help', $('helpModal').classList.contains('open'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    ok('Esc closes it', !$('helpModal').classList.contains('open'));
    $('searchInput').focus(); $('searchInput').dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true, cancelable: true }));
    ok('"?" while typing in search does not open help', !$('helpModal').classList.contains('open'));
    $('searchInput').blur();
    const origMM = window.matchMedia;
    localStorage.removeItem('cc_theme'); window.matchMedia = q => ({ matches: /light/.test(q), addEventListener() {} });
    applyInitialTheme();
    ok('first visit follows a LIGHT system setting', document.body.classList.contains('light-theme') && $('themeBtn').textContent.includes('DARK'));
    localStorage.setItem('cc_theme', 'dark'); applyInitialTheme();
    ok('a saved choice beats the system setting', !document.body.classList.contains('light-theme'));
    window.matchMedia = origMM; localStorage.removeItem('cc_theme'); applyInitialTheme();
    ok('dark system setting -> dark', !document.body.classList.contains('light-theme'));

    // ── FULLSCREEN hi-res ──
    ok('hi-res candidates: Cover Art Archive thumb -> 1200 / 500', JSON.stringify(hiResCandidates('https://coverartarchive.org/release/abc/front-250')) === JSON.stringify(['https://coverartarchive.org/release/abc/front-1200', 'https://coverartarchive.org/release/abc/front-500']));
    ok('hi-res candidates: iTunes 600 -> 1200', (hiResCandidates('https://is1-ssl.mzstatic.com/image/thumb/x/600x600bb.jpg')[0] || '').endsWith('/1200x1200bb.jpg'));
    ok('hi-res candidates: custom art / unknown hosts untouched', hiResCandidates(PNG).length === 0 && hiResCandidates('https://example.com/a.jpg').length === 0);
    const bigImg = (() => { const c = document.createElement('canvas'); c.width = 40; c.height = 40; return c.toDataURL('image/png'); })();
    const origHi = window.hiResCandidates; window.hiResCandidates = () => [bigImg];
    currentArtUrl = PNG; openFullscreenArt();
    ok('fullscreen shows the thumbnail instantly', $('fullscreenArtImg').getAttribute('src') === PNG);
    await wait(300);
    ok('...then swaps in the high-resolution version', $('fullscreenArtImg').getAttribute('src') === bigImg);
    closeFullscreenArt();
    openFullscreenArt(); closeFullscreenArt(); await wait(300);
    ok('closing cancels a pending upgrade', $('fullscreenArtImg').getAttribute('src') === PNG);
    window.hiResCandidates = origHi;

    // ── STORAGE METER ──
    openBackupModal(); await wait(200);
    ok('storage meter shown in the BACKUP dialog', $('storageMeter').textContent.includes('LOCAL STORAGE') && !!$('storageMeter').querySelector('.storage-fill'));
    try { localStorage.setItem('__fill', 'x'.repeat(1600000)); } catch (e) {}
    const pct = await renderStorageMeter();
    ok('storage meter warns when getting full', pct > 60 && /FULL/.test($('storageMeter').textContent), pct + '%');
    localStorage.removeItem('__fill'); closeBrModal();

    // ── AUTO-BACKUP ──
    let abMode = 'fake handle', abFile = null, readBack;
    try {
      const root = await navigator.storage.getDirectory();
      abFile = await root.getFileHandle('cc_autobackup_test.json', { create: true });
      readBack = async () => (await abFile.getFile()).text();
      abMode = 'OPFS (a real FileSystemFileHandle)';
    } catch (e) {
      const writes = [];
      abFile = { name: 'fake.json', queryPermission: async () => 'granted', requestPermission: async () => 'granted', createWritable: async () => ({ write: async s => { writes.push(s); }, close: async () => {} }) };
      readBack = async () => writes[writes.length - 1] || '';
    }
    R.push('INFO auto-backup tests use: ' + abMode);
    const origPicker = window.showSaveFilePicker;
    window.showSaveFilePicker = async () => abFile;
    AB_DELAY = 60;
    await linkBackupFile();
    let firstBk = null; try { firstBk = JSON.parse(await readBack()); } catch (e) {}
    ok('LINK BACKUP FILE writes a full backup right away', !!firstBk && firstBk.app === 'CrateChanger' && Array.isArray(firstBk.discs) && typeof firstBk.meta === 'object' && 'artistCache' in firstBk);
    ok('status shows the linked file', $('abStatus').textContent.includes('LINKED') && $('abUnlinkBtn').style.display !== 'none');
    getMeta(12).notes = 'autosaved note'; saveMeta(); await wait(500);
    ok('every change is written to the file a moment later', (await readBack()).includes('autosaved note'));
    ok('the 30-day backup reminder counts auto-backups', !!localStorage.getItem(BACKUP_KEY) && checkBackupReminder(0) === null);
    if (abMode.startsWith('OPFS')) {
      abHandle = null; abState = 'none'; await abInit();
      ok('the linked file is remembered across visits', abState === 'ready' && !!abHandle, abState);
    }
    const realH = abHandle;
    abHandle = { name: 'x.json', queryPermission: async () => 'prompt', requestPermission: async () => 'granted', createWritable: async () => { throw new DOMException('denied', 'NotAllowedError'); } };
    abState = 'ready'; getMeta(13).notes = 'second note'; saveMeta(); await wait(400);
    ok('lost permission is detected and offered as RE-ENABLE', abState === 'needs-permission' && $('abReenableBtn').style.display !== 'none' && /PERMISSION/.test($('toast').textContent), abState);
    abHandle = { name: (realH && realH.name) || 'x.json', queryPermission: async () => 'granted', requestPermission: async () => 'granted', createWritable: () => realH.createWritable() };
    await reenableAutoBackup();
    ok('RE-ENABLE resumes and catches up on the missed change', abState === 'ready' && (await readBack()).includes('second note'));
    await unlinkBackupFile();
    ok('UNLINK forgets the file', abState === 'none' && (await abLoad()) === null);
    window.showSaveFilePicker = undefined; await abInit();
    ok('browsers without the API get a clear message (button disabled)', abState === 'unsupported' && $('abLinkBtn').disabled === true && /NOT AVAILABLE/.test($('abStatus').textContent));
    window.showSaveFilePicker = origPicker; abState = 'none'; AB_DELAY = 8000;

    // ── RE-SORT PLAN ──
    await resetAll();
    let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = discs.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [discs[i], discs[j]] = [discs[j], discs[i]]; }
    for (const e of [3, 50, 120]) discs[e] = null;
    const wishSlot = 60; getMeta(wishSlot).flags = ['wishlist'];
    const markI = discs.findIndex((d, i) => !isSlotEmpty(d) && i !== wishSlot && i > 100);
    const markKey = keyOf(discs[markI]);
    getMeta(markI).notes = 'follows its disc'; await putCustomArt(markI, PNG); nowPlaying = { index: markI, artist: 'x', album: 'y' };
    saveDiscs(); saveMeta(); buildGrid();
    const plan = computeResortPlan('artist', true);
    const sim = discs.slice(); plan.steps.forEach(s => { [sim[s.a], sim[s.b]] = [sim[s.b], sim[s.a]]; });
    const seqIdx = sim.map((_, i) => i).filter(i => i !== wishSlot);
    const seq = seqIdx.map(i => sim[i]);
    const firstEmpty = seq.findIndex(d => isSlotEmpty(d));
    const head = seq.slice(0, firstEmpty);
    const inOrder = head.every((d, k) => k === 0 || sortName(head[k - 1][0]).localeCompare(sortName(d[0]), undefined, { sensitivity: 'base' }) <= 0);
    ok('re-sort plan reaches artist A–Z order (ignoring "The"), empties last', firstEmpty > 150 && inOrder && seq.slice(firstEmpty).every(d => isSlotEmpty(d)), plan.steps.length + ' swaps');
    ok('wishlist slot never moves', sim[wishSlot] === discs[wishSlot]);
    const ix = discs.map((_, i) => i); plan.steps.forEach(s => { [ix[s.a], ix[s.b]] = [ix[s.b], ix[s.a]]; });
    const seenC = new Set(); let need = 0;
    for (let p = 0; p < ix.length; p++) { if (seenC.has(p) || ix[p] === p) continue; let len = 0, q = p; while (!seenC.has(q)) { seenC.add(q); q = ix[q]; len++; } need += len - 1; }
    ok('plan uses the minimum number of swaps for that order', plan.steps.length === need && need > 0, plan.steps.length + ' vs ' + need);
    const plan2 = computeResortPlan('artist', false);
    const sim2 = discs.slice(); plan2.steps.forEach(s => { [sim2[s.a], sim2[s.b]] = [sim2[s.b], sim2[s.a]]; });
    ok('"keep empty slots where they are" leaves gaps in place', sim2[3] === null && sim2[50] === null && sim2[120] === null);
    openResort();
    ok('plan dialog lists every step', document.querySelectorAll('#resortSteps .rs-step').length === plan.steps.length && $('resortSummary').textContent.includes('SWAP'));
    const cb = document.querySelector('#resortSteps .rs-step input'); cb.click();
    ok('ticking a step marks it done', cb.closest('.rs-step').classList.contains('done'));
    let copied = ''; const origClip = Object.getOwnPropertyDescriptor(Navigator.prototype, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async t => { copied = t; } }, configurable: true });
    await copyResortSteps();
    ok('COPY STEPS gives a readable list', /1\. swap slot \d+ <-> slot \d+:/.test(copied) && copied.split('\n').length === plan.steps.length + 1);
    delete navigator.clipboard;
    const preApply = discs.slice();
    await applyResort();
    ok('APPLY puts the app in that order', discs.every((d, i) => keyOf(d) === keyOf(sim[i])));
    const newMark = discs.findIndex(d => keyOf(d) === markKey);
    ok('notes, custom art and NOW PLAYING travel with their disc', getMeta(newMark).notes === 'follows its disc' && customArt.has(newMark) && customArt.size === 1 && nowPlaying.index === newMark, markI + ' -> ' + newMark);
    const storedArt = await new Promise(res => { const r = indexedDB.open('cc_custom_art', 1); r.onsuccess = () => { const q = r.result.transaction('art').objectStore('art').getAllKeys(); q.onsuccess = () => res(q.result); q.onerror = () => res(null); }; });
    ok('custom-art store saved in the new order', JSON.stringify(storedArt) === JSON.stringify([newMark]), JSON.stringify(storedArt));
    ok('re-sort persisted', keyOf(JSON.parse(localStorage.getItem(DISC_KEY)).map(normalizeDisc)[newMark]) === markKey);
    await performUndo();
    ok('one UNDO restores the whole previous order (and art)', discs.every((d, i) => keyOf(d) === keyOf(preApply[i])) && customArt.has(markI) && customArt.size === 1);
    await applyResort(); await applyResort();
    ok('re-sorting an already-sorted changer is a no-op', $('toast').textContent.includes('ALREADY IN THIS ORDER'));

    // ── SHAREABLE PAGE ──
    await resetAll();
    discs[7] = ['<img src=x onerror="window.__pwn2=1">', '"><script>window.__pwn2=1<\/script>'];
    getMeta(9).notes = 'SECRET-NOTE-123'; getMeta(9).flags = ['loaned']; getMeta(9).loanedTo = 'Secret Borrower';
    getMeta(11).flags = ['wishlist'];
    await putCustomArt(4, PNG);
    const html1 = sharePageHtml({ title: 'Test <Title>', art: true, meta: true, wishlist: false, notes: false });
    ok('share page: notes and loans are NOT included by default', !html1.includes('SECRET-NOTE-123') && !html1.includes('Secret Borrower'));
    const frame = document.createElement('iframe'); frame.style.cssText = 'width:900px;height:600px';
    document.body.appendChild(frame);
    await new Promise(r => { frame.onload = r; frame.srcdoc = html1; });
    await wait(150);
    const fd = frame.contentDocument;
    const ownedShare = discs.filter((d, i) => !isSlotEmpty(d) && !isWish(i)).length;
    ok('share page lists every owned disc (wishlist excluded)', fd.querySelectorAll('#owned .card').length === ownedShare, fd.querySelectorAll('#owned .card').length + ' / ' + ownedShare);
    ok('share page: hostile titles are inert text', frame.contentWindow.__pwn2 === undefined && window.__pwn2 === undefined && fd.body.textContent.includes('<img src=x'));
    ok('share page: title escaped', fd.title === 'Test <Title>');
    ok('share page: custom art embedded (works offline)', html1.includes(PNG.slice(0, 60)));
    const qBox = fd.getElementById('q'); qBox.value = 'cradle'; qBox.dispatchEvent(new frame.contentWindow.Event('input'));
    ok('share page: search works', Array.from(fd.querySelectorAll('#owned .card')).filter(c => c.style.display !== 'none').length === 9 && fd.getElementById('cnt').textContent === '9');
    frame.remove();
    const html2 = sharePageHtml({ title: 'x', art: false, meta: false, wishlist: true, notes: true });
    ok('share page: notes / wishlist only when ticked; no art when unticked', html2.includes('SECRET-NOTE-123') && html2.includes('<h2>WISHLIST</h2>') && !html2.includes('data-srcs="'));
    const oCreate = URL.createObjectURL, oClick = HTMLAnchorElement.prototype.click; const dl2 = [];
    URL.createObjectURL = () => 'blob:x'; HTMLAnchorElement.prototype.click = function () { dl2.push(this.download); };
    openShare(); downloadSharePage();
    URL.createObjectURL = oCreate; HTMLAnchorElement.prototype.click = oClick;
    ok('DOWNLOAD PAGE saves a dated .html file', /^CrateChanger_share_\d{4}-\d{2}-\d{2}\.html$/.test(dl2[0] || ''), dl2[0]);
    window.fetch = baseFetch;

    }
    {   // ═══ 14. ROUND-5 ═══
      const resetAll5 = async () => {
        discs = INITIAL_DATA.map(normalizeDisc); while (discs.length < 200) discs.push(null);
        meta = {}; mbCache = {}; artistCache = {}; valueCache = {}; await clearCustomArt(); nowPlaying = null; mbMode = 'ok';
        $('searchInput').value = ''; ['artistFilter', 'flagFilter', 'genreFilter', 'decadeFilter', 'originFilter'].forEach(id => { $(id).value = ''; });
        $('sortSelect').value = 'slot'; clearUndoHistory(); spellSuggestions = []; dcSkipped = new Set();
        buildGrid();
      };
      await resetAll5();
      const base5 = window.fetch;
      let spellOn = false;
      window.fetch = (url, o) => {
        const u = String(url); const du = decodeURIComponent(u);
        if (du.includes('query=barcode:')) { calls.push(u); return reply(du.includes('barcode:0000000000') ? { releases: [] } : { releases: [{ id: 'rel-bc', score: 100, title: 'Barcode Album', date: '2003-03-03', country: 'NO', 'artist-credit': [{ name: 'Bc Band', joinphrase: '' }], media: [{ format: 'CD' }] }] }); }
        if (u.includes('/release/rel-bc?')) { calls.push(u); return reply({ 'release-group': { id: 'rg-bc', 'primary-type': 'Album', 'first-release-date': '2003-03-03' }, 'artist-credit': [{ name: 'Bc Band', artist: { id: 'art-bc', name: 'Bc Band' } }], date: '2003-03-03', country: 'NO', media: [{ tracks: [{ position: 1, title: 'Scanned Track', length: 60000 }] }] }); }
        if (u.includes('inc=url-rels')) { calls.push(u); return reply(u.includes('/release/rel-9') ? { relations: [] } : { relations: [{ type: 'discogs', url: { resource: 'https://www.discogs.com/release/777' } }] }); }
        if (u.includes('api.discogs.com/marketplace/stats/777')) { calls.push(u); return reply({ num_for_sale: 4, lowest_price: { value: 12.5, currency: 'USD' } }); }
        // REAL SHAPE (verified live): the release is a split CD, listed under the artist, spelt "Fraility"
        if (spellOn && du.includes('query=artist:"Malignancy"')) { calls.push(u); return reply({ releases: [
          { id: 'rel-sp', score: 100, title: 'Unexpected Awakening of Impassive Mass / Fraility of the Human Condition', 'artist-credit': [{ name: 'Malignancy', joinphrase: ' / ', artist: { name: 'Malignancy' } }, { name: 'Intervalle Bizzare', artist: { name: 'Intervalle Bizzare' } }] },
          { id: 'rel-sp2', score: 100, title: 'Intrauterine Cannibalism', 'artist-credit': credit('Malignancy') },
          { id: 'rel-x', score: 90, title: 'Human Condition', 'artist-credit': credit('Someone Else') }] }); }
        return base5(url, o);
      };
      const blurAll = () => { const a = document.activeElement; if (a && a.blur) a.blur(); };
      const key = (k, extra) => document.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, extra || {})));

      // ── multi-level UNDO / REDO ──
      const s0 = JSON.stringify(discs);
      swapSlots(0, 1); const s1 = JSON.stringify(discs);
      openEditModal(null, 2); $('editAlbum').value = 'Undo Test Album'; await saveEdit(); const s2 = JSON.stringify(discs);
      multiSelect = true; selectedSlots = new Set([3]); batchFlag('replace'); multiSelect = false; selectedSlots = new Set();
      ok('undo history keeps several steps', undoStack.length === 3 && $('undoText').textContent.includes('3 STEPS'), $('undoText').textContent);
      await performUndo(); ok('undo #1 reverts only the last action (batch flag)', !getMeta(3).flags.includes('replace') && JSON.stringify(discs) === s2);
      await performUndo(); ok('undo #2 reverts the edit', JSON.stringify(discs) === s1);
      await performUndo(); ok('undo #3 reverts the swap', JSON.stringify(discs) === s0);
      ok('then three steps are available to redo', undoStack.length === 0 && redoStack.length === 3 && $('redoBtn').style.display !== 'none');
      blurAll(); key('z', { ctrlKey: true, shiftKey: true }); await wait(250);
      ok('Ctrl+Shift+Z redoes', JSON.stringify(discs) === s1);
      key('y', { ctrlKey: true }); await wait(250);
      ok('Ctrl+Y redoes too', JSON.stringify(discs) === s2);
      swapSlots(10, 11);
      ok('a new action clears the redo history', redoStack.length === 0 && undoStack.length === 3);
      dismissUndo(); blurAll(); key('z', { ctrlKey: true }); await wait(250);
      ok('Ctrl+Z still works after the bar was dismissed', JSON.stringify(discs) === s2);
      for (let k = 0; k < 30; k++) swapSlots(20, 21);
      ok('history is capped at 25 steps', undoStack.length === 25, undoStack.length);
      clearUndoHistory();

      // ── DATE ADDED ──
      await resetAll5();
      const emptyI = discs.findIndex((d, i) => isSlotEmpty(d) && !isWish(i));
      openEditModal(null, emptyI); $('editArtist').value = 'New Band'; $('editAlbum').value = 'First Album'; await saveEdit();
      const added1 = getMeta(emptyI).addedAt;
      ok('putting a disc into an empty slot records the date added', !!added1 && Date.now() - Date.parse(added1) < 60000);
      openEditModal(null, emptyI); $('editAlbum').value = 'First Album (Remaster)'; await saveEdit();
      ok('renaming keeps the original added date', getMeta(emptyI).addedAt === added1);
      getMeta(5).addedAt = '2025-01-15T10:00:00.000Z'; getMeta(6).addedAt = '2026-03-01T10:00:00.000Z';
      $('sortSelect').value = 'added'; applyFilters();
      const oA = Array.from($('grid').children).slice(0, 3).map(e => +e.dataset.index).join();
      ok('sort: recently added', oA === [emptyI, 6, 5].join(), oA);
      $('sortSelect').value = 'slot'; applyFilters();
      openInfoModal(6); await wait(150);
      ok('disc view shows when it was added', $('playHistoryRow').textContent.includes('ADDED 2026-03-01'), $('playHistoryRow').textContent);
      closeModal();
      openStats();
      ok('stats: 12-month collection growth chart', $('statsContent').textContent.includes('COLLECTION GROWTH') && document.querySelectorAll('#statsContent .gr-col').length === 12 && $('statsContent').textContent.includes('3 OF'));
      closeStats();

      // ── METAL ARCHIVES ──
      opened.length = 0; openInfoModal(idxOf('Absu', 'Tara')); await wait(150); $('maBtn').click();
      ok('M-A opens the Encyclopaedia Metallum band search', opened[0] === 'https://www.metal-archives.com/search?searchString=Absu&type=band_name', opened[0]);
      ok('M-A searches the first artist of a split', metalArchivesUrl("Dimmu Borgir / Old Man's Child").includes('searchString=Dimmu%20Borgir&'));
      closeModal();

      // ── DATA CHECK ──
      await resetAll5();
      discs[12] = [discs[12][0] + '  ', discs[12][1]];
      const cof = discs.map((d, i) => i).filter(i => discs[i] && discs[i][0] === 'Cradle Of Filth');
      discs[cof[1]] = ['Cradle of Filth', discs[cof[1]][1]];
      const cofAlbum = discs[cof[1]][1];
      mbCache['Cradle of Filth|' + cofAlbum] = { mbTried: true, v: 2, tracks: [{ num: 1, title: 'kept' }], tags: [], artSources: [] };
      buildGrid();
      openDataCheck();
      const dcText = () => $('dataCheckList').textContent;
      const fix = async (kind, contains) => {
        const it = Array.from(document.querySelectorAll('#dataCheckList .dc-item')).find(x => x.querySelector('.dc-kind').textContent === kind && (!contains || x.textContent.includes(contains)));
        if (!it) return false; it.querySelector('[data-dc-apply]').click(); await wait(200); return true;
      };
      ok('data check: stray spaces', dcText().includes('EXTRA SPACES'));
      ok('data check: artist spelling variants', dcText().includes('ARTIST SPELT DIFFERENTLY') && dcText().includes('“Cradle of Filth” (1)'));
      ok('data check: the duplicate rows', dcText().includes('DUPLICATE') && dcText().includes('Crucible Of The Infernum') && dcText().includes('Signs Of Life'));
      ok('data check: discs out of A–Z order, and where the second list starts', /\d+ disc\(s\) are out of A–Z artist order — a new A–Z list starts at slot 102\b/.test(dcText()), (dcText().match(/\d+ disc\(s\) are out of A–Z[^.]*/) || [''])[0]);
      await fix('EXTRA SPACES');
      ok('TRIM fixes the spaces and is undoable', discs[12][0] === discs[12][0].trim() && $('undoText').textContent.includes('DATA CHECK'));
      await fix('ARTIST SPELT DIFFERENTLY');
      ok('artist spelling made consistent', discs[cof[1]][0] === 'Cradle Of Filth');
      ok('...and the existing lookup is kept (no re-fetch)', !!mbCache['Cradle Of Filth|' + cofAlbum] && mbCache['Cradle Of Filth|' + cofAlbum].tracks[0].title === 'kept' && !mbCache['Cradle of Filth|' + cofAlbum]);
      await fix('DUPLICATE', 'Crucible');
      const dupSlots = discs.map((d, i) => i).filter(i => discs[i] && discs[i][1] === 'Crucible Of The Infernum');
      ok('FLAG AS DUPLICATE flags only the second copy', dupSlots.length === 2 && !getMeta(dupSlots[0]).flags.includes('duplicate') && getMeta(dupSlots[1]).flags.includes('duplicate'));
      const nItems = document.querySelectorAll('#dataCheckList .dc-item').length;
      document.querySelector('#dataCheckList [data-dc-skip]').click();
      ok('SKIP hides a suggestion', document.querySelectorAll('#dataCheckList .dc-item').length === nItems - 1);
      await performUndo(); renderDataCheck();
      ok('UNDO brings a fixed issue back', discs.some(d => d && d[1] === 'Crucible Of The Infernum') && dupSlots.every(i => !getMeta(i).flags.includes('duplicate')));
      await fix('ORDER');
      ok('ORDER opens the re-sort plan', $('resortModal').classList.contains('open') && !$('dataCheckModal').classList.contains('open'));
      closeResort();
      await resetAll5();
      const mi = idxOf('Malignancy', 'Frality Of The Human Condition');
      mbCache[keyOf(discs[mi])] = { mbTried: true, v: 2, tracks: [], tags: [], artSources: [] };
      spellOn = true; openDataCheck(); await checkSpellingOnline();
      ok('online spelling check finds the real release (half of a split CD)', dcText().includes('POSSIBLE TYPO') && dcText().includes('Unexpected Awakening of Impassive Mass / Fraility of the Human Condition') && $('dcSpellStatus').textContent.includes('1 SUGGESTION'), $('dcSpellStatus').textContent);
      ok('...and ignores other bands with similar titles', !dcText().includes('“Human Condition”'));
      await fix('POSSIBLE TYPO'); await wait(400);
      ok('accepting it renames the disc and looks it up again', discs[mi][1] === 'Unexpected Awakening of Impassive Mass / Fraility of the Human Condition' && !mbCache['Malignancy|Frality Of The Human Condition'] && !!mbCache['Malignancy|Unexpected Awakening of Impassive Mass / Fraility of the Human Condition']);
      spellOn = false; closeDataCheck();
      ok('similarity scoring', similarity('frality of the human condition', 'frailty of the human condition') > 0.9 && similarity('abc', 'xyz') < 0.1);

      // ── COMPACT TOOLBAR ──
      ok('secondary actions moved into ☰ MORE', !!$('moreMenu').querySelector('#themeBtn') && /TIMELINE/.test($('moreMenu').textContent) && /HEATMAP/.test($('moreMenu').textContent) && /DATA CHECK/.test($('moreMenu').textContent) && document.querySelectorAll('.header-right > .btn').length <= 6, document.querySelectorAll('.header-right > .btn').length + ' header buttons');
      ok('MORE starts closed', !$('moreMenu').classList.contains('open'));
      $('moreBtn').click();
      ok('☰ MORE opens the menu', $('moreMenu').classList.contains('open') && $('moreBtn').getAttribute('aria-expanded') === 'true');
      document.body.click();
      ok('clicking elsewhere closes it', !$('moreMenu').classList.contains('open'));
      $('moreBtn').click(); key('Escape');
      ok('Esc closes it', !$('moreMenu').classList.contains('open'));
      $('moreBtn').click();
      Array.from($('moreMenu').querySelectorAll('button')).find(b => /TIMELINE/.test(b.textContent)).click();
      ok('choosing an item runs it and closes the menu', $('timelineModal').classList.contains('open') && !$('moreMenu').classList.contains('open'));
      closeTimeline();
      ok('filters start collapsed', getComputedStyle($('filterPanel')).display === 'none');
      toggleFilterPanel();
      ok('⚲ FILTERS opens the panel', getComputedStyle($('filterPanel')).display !== 'none' && $('filterToggleBtn').getAttribute('aria-expanded') === 'true');
      $('flagFilter').value = 'broken'; applyFilters();
      ok('the FILTERS button shows how many filters are active', $('filterToggleBtn').textContent.includes('(1)') && $('filterToggleBtn').classList.contains('active'));
      clearAllFilters();
      ok('...and resets when cleared', $('filterToggleBtn').textContent.trim() === '⚲ FILTERS' && !$('filterToggleBtn').classList.contains('active'));
      toggleFilterPanel();

      // ── BARCODE ──
      await resetAll5();
      const bI = discs.findIndex((d, i) => isSlotEmpty(d) && !isWish(i));
      openEditModal(null, bI);
      $('editBarcode').value = '12'; await lookupBarcode();
      ok('a too-short barcode is rejected', $('toast').textContent.includes('8 TO 14 DIGITS'));
      $('editBarcode').value = '0000000000000'; await lookupBarcode();
      ok('an unknown barcode is explained', $('barcodeResults').textContent.includes('No release with that barcode'));
      $('editBarcode').value = '3760053840156'; await lookupBarcode();
      const bRows = document.querySelectorAll('#barcodeResults .edition-row');
      ok('barcode lookup lists the release', bRows.length === 1 && bRows[0].textContent.includes('Bc Band — Barcode Album') && bRows[0].textContent.includes('NO'));
      bRows[0].click();
      ok('choosing it fills artist + album', $('editArtist').value === 'Bc Band' && $('editAlbum').value === 'Barcode Album' && pendingPin === 'rel-bc');
      await saveEdit(); await wait(500);
      const bc = mbCache['Bc Band|Barcode Album'];
      ok('saving pins that exact edition and keeps the barcode', getMeta(bI).barcode === '3760053840156' && !!bc && bc.mbid === 'rel-bc' && bc.pinned === true && bc.tracks[0].title === 'Scanned Track');
      ok('camera SCAN button shown wherever a camera API exists (native reader or the ZXing fallback)', (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) ? $('scanBtn').style.display !== 'none' : $('scanBtn').style.display === 'none');
      openEditModal(null, bI);
      ok('the edit dialog shows the stored barcode', $('editBarcode').value === '3760053840156' && pendingPin === null && $('barcodeResults').innerHTML === '');
      closeEditModal();

      // ── DISCOGS CSV IMPORT ──
      await resetAll5();
      const tI5 = idxOf('Absu', 'Tara');
      getMeta(tI5).flags = ['wishlist'];
      const emptyIdx0 = discs.findIndex((d, i) => isSlotEmpty(d) && !isWish(i));
      const csv = 'Catalog#,Artist,Title,Label,Format,Rating,Released,release_id,CollectionFolder,Date Added,Collection Media Condition,Collection Sleeve Condition,Collection Notes\n' +
        'OPCD 100,Absu,Tara,Osmose Productions,CD,,2001,111,Uncategorized,2024-05-06 10:11:12,Near Mint (NM or M-),,\n' +
        'X1,"Brand New (2)",Debut Album,Lbl,CD,,2020,222,Uncategorized,2025-07-08 09:00:00,Very Good Plus (VG+),,"note with, comma\nand newline"\n' +
        'X2,Other Band*,"Second, Album",Lbl,CD,,2021,333,Uncategorized,2025-08-01 09:00:00,Good (G),,\n';
      confirms.length = 0;
      await importDiscogsCsv({ target: { files: [new File([csv], 'collection.csv')], value: '' } });
      const dryD = confirms[0] || '';
      ok('Discogs import: dry run first', dryD.startsWith('DISCOGS IMPORT') && dryD.includes('3 release(s)') && dryD.includes('1 already in your collection') && dryD.includes('1 leave your wishlist') && dryD.includes('2 new → 1 into empty slots, 1 as new slots'), dryD.split('\n').slice(1, 4).join(' | '));
      ok('matched disc: Discogs link + date added; leaves the wishlist (you own it now)', getMeta(tI5).discogsId === 111 && String(getMeta(tI5).addedAt).startsWith('2024-05-06') && !isWish(tI5));
      const nb = idxOf('Brand New', 'Debut Album'), ob = idxOf('Other Band', 'Second, Album');
      ok('Discogs "(2)" and "*" artist suffixes are cleaned', nb >= 0 && ob >= 0, nb + ',' + ob);
      ok('new discs fill the empty slot first, then become a new slot', discs.length === 201 && [nb, ob].includes(emptyIdx0) && [nb, ob].includes(200));
      ok('condition, notes, date and Discogs link come across', getMeta(nb).condition === 'good' && getMeta(nb).notes === 'note with, comma\nand newline' && getMeta(ob).condition === 'scratched' && String(getMeta(nb).addedAt).startsWith('2025-07-08') && getMeta(nb).discogsId === 222);
      ok('Discogs import is undoable', $('undoText').textContent.includes('DISCOGS IMPORT'));
      await performUndo();
      ok('UNDO removes the imported discs and links', discs.length === 200 && idxOf('Brand New', 'Debut Album') < 0 && !getMeta(tI5).discogsId && isWish(tI5));
      alerts.length = 0;
      await importDiscogsCsv({ target: { files: [new File(['foo,bar\n1,2'], 'x.csv')], value: '' } });
      ok('a non-Discogs CSV is rejected with a message', alerts.some(a => a.includes('not a Discogs collection export')));
      ok('CSV parser: quotes, commas, newlines, BOM', JSON.stringify(parseCsv('\uFEFFa,"b,c","d""e"\n1,"x\ny",3')) === JSON.stringify([['a', 'b,c', 'd"e'], ['1', 'x\ny', '3']]));
      ok('Discogs condition grades map to the app\'s', mapDiscogsCondition('Mint (M)') === 'mint' && mapDiscogsCondition('Near Mint (NM or M-)') === 'mint' && mapDiscogsCondition('Very Good Plus (VG+)') === 'good' && mapDiscogsCondition('Good Plus (G+)') === 'scratched' && mapDiscogsCondition('Poor (P)') === 'scratched' && mapDiscogsCondition('') === '');

      // ── DISCOGS VALUES ──
      await resetAll5();
      DG_SPACING = 0;
      const vT = idxOf('Absu', 'Tara'), vS = idxOf('Absu', 'The Sun of Tiphareth');
      discs = discs.map((d, i) => (i === vT || i === vS) ? d : null);
      mbCache['Absu|Tara'] = { mbid: 'rel-1', mbTried: true, v: 2, tracks: [{ num: 1, title: 't' }], tags: [], artSources: [] };
      mbCache['Absu|The Sun of Tiphareth'] = { mbid: 'rel-9', mbTried: true, v: 2, tracks: [{ num: 1, title: 't' }], tags: [], artSources: [] };
      buildGrid(); confirms.length = 0;
      await estimateValues();
      ok('value lookup asks first, with a time estimate', confirms.some(c => c.includes('Discogs prices for 2 disc(s)') && /minute/.test(c)));
      ok('Discogs release found through MusicBrainz, then priced', !!valueCache['Absu|Tara'] && valueCache['Absu|Tara'].discogsId === 777 && valueCache['Absu|Tara'].lowest === 12.5 && valueCache['Absu|Tara'].forSale === 4);
      ok('a disc with no Discogs link is remembered as such', !!valueCache['Absu|The Sun of Tiphareth'] && valueCache['Absu|The Sun of Tiphareth'].discogsId === null);
      const nUrl = calls.filter(c => c.includes('inc=url-rels')).length;
      openStats();
      const stV = $('statsContent').textContent;
      ok('stats: estimated total + most valuable + honest caveats', stV.includes('ESTIMATED VALUE') && /12\.50/.test(stV) && stV.includes('1 WITH NO LISTING') && stV.includes('NOT A GUARANTEED VALUE'), (stV.match(/ESTIMATED VALUE.{0,80}/) || [''])[0]);
      closeStats();
      openInfoModal(vT); await wait(200);
      ok('disc view shows the price', $('modalValue').textContent.includes('12.50') && $('modalValue').textContent.includes('4 FOR SALE'), $('modalValue').textContent);
      opened.length = 0; $('discogsBtn').click();
      ok('DISCOGS opens the exact release once it is known', opened[0] === 'https://www.discogs.com/release/777', opened[0]);
      closeModal();
      confirms.length = 0; await estimateValues();
      ok('prices are reused for 30 days (no repeat lookups)', confirms.length === 0 && $('toast').textContent.includes('LESS THAN 30 DAYS') && calls.filter(c => c.includes('inc=url-rels')).length === nUrl);
      DG_SPACING = 2600;
      window.fetch = base5;
    }
    {   // ═══ 15. ROUND-6 ═══
      const resetAll6 = async () => {
        discs = INITIAL_DATA.map(normalizeDisc); while (discs.length < 200) discs.push(null);
        meta = {}; mbCache = {}; artistCache = {}; valueCache = {}; await clearCustomArt(); nowPlaying = null; mbMode = 'ok';
        shelf = []; await syncShelfArt(new Map()); saveShelf();
        $('searchInput').value = ''; ['artistFilter', 'flagFilter', 'genreFilter', 'decadeFilter', 'originFilter'].forEach(id => { $(id).value = ''; });
        $('sortSelect').value = 'slot'; clearUndoHistory();
        buildGrid();
      };
      await resetAll6();
      const slotEl = i => document.querySelector(`.slot[data-index="${i}"]`);

      // ── MULTI-DISC SETS ──
      const lb1 = idxOf('Cradle Of Filth', 'Live Bait For The Dead (Disc 1)'), lb2 = idxOf('Cradle Of Filth', 'Live Bait For The Dead (Disc 2)');
      openEditModal(null, lb1);
      ok('edit dialog offers "link with the next slot"', $('linkNext').checked === false && !$('linkNext').disabled);
      $('linkNext').checked = true; await saveEdit();
      ok('two neighbouring slots linked into a set', lb2 === lb1 + 1 && linkedWithNext(lb1) && linkedWithPrev(lb2) && setPos(lb2).n === 2 && setPos(lb2).of === 2);
      ok('grid shows the connector and "⛓1/2" badges', slotEl(lb1).classList.contains('set-next') && slotEl(lb2).classList.contains('set-prev') && slotEl(lb1).querySelector('.set-badge').textContent === '⛓1/2');
      openEditModal(null, lb1);
      ok('the edit dialog remembers the link', $('linkNext').checked === true);
      closeEditModal();
      const owned0 = discs.filter((d, i) => !isSlotEmpty(d) && !isWish(i)).length;
      ok('albums count a set once', albumCount() === owned0 - 1, albumCount() + ' vs ' + owned0);
      openStats();
      ok('stats: ALBUMS card and MULTI-DISC SETS section', $('statsContent').textContent.includes('ALBUMS (A SET = 1)') && $('statsContent').textContent.includes('MULTI-DISC SETS (1)'));
      closeStats();
      openHeatmap();
      ok('heatmap shows the set', $('heatmapGrid').children[lb1].classList.contains('hm-set-next') && $('heatmapGrid').children[lb2].classList.contains('hm-set-prev'));
      closeHeatmap();
      linkWithNext(lb2, true);
      ok('linking the next slot extends the set to 3 discs', setPos(lb1).of === 3 && setPos(lb2 + 1).n === 3);
      linkWithNext(lb1, false);
      ok('unlinking splits it; a lone disc is no longer a set', !setPos(lb1) && setPos(lb2).of === 2);
      linkWithNext(lb2, false);
      ok('unlinking the last pair removes the set', !setPos(lb2) && !setPos(lb2 + 1));
      linkWithNext(lb1, true); saveMeta();
      swapSlots(lb2, 150);
      openStats();
      ok('a set split across the changer is flagged "SPLIT UP"', $('statsContent').textContent.includes('SPLIT UP'));
      closeStats();
      const rp = computeResortPlan('artist', true);
      const sim6 = discs.slice(); rp.steps.forEach(s => { [sim6[s.a], sim6[s.b]] = [sim6[s.b], sim6[s.a]]; });
      const p1 = sim6.findIndex(d => d && d[1] === 'Live Bait For The Dead (Disc 1)'), p2 = sim6.findIndex(d => d && d[1] === 'Live Bait For The Dead (Disc 2)');
      ok('the re-sort plan puts the set back together, in order', p2 === p1 + 1, p1 + ',' + p2);

      // ── OVERDUE LOAN BADGE ──
      await resetAll6();
      getMeta(4).flags = ['loaned']; getMeta(4).loanedTo = 'Max'; getMeta(4).loanDate = new Date(Date.now() - 40 * 864e5).toISOString().slice(0, 10);
      getMeta(5).flags = ['loaned']; getMeta(5).loanDate = new Date(Date.now() - 5 * 864e5).toISOString().slice(0, 10);
      buildGrid();
      const lo4 = slotEl(4).querySelector('.flag-loaned'), lo5 = slotEl(5).querySelector('.flag-loaned');
      ok('a loan over 30 days gets a red "L!" badge on its tile', lo4.classList.contains('overdue') && lo4.textContent === 'L!' && /Max for 40 days/.test(lo4.title), lo4.title);
      ok('a recent loan keeps the normal badge', !lo5.classList.contains('overdue') && lo5.textContent === 'L');

      // ── ACTIVE-FILTER PILLS ──
      await resetAll6();
      ok('no pills while nothing is filtered', $('filterPills').style.display === 'none' && !$('filterPills').children.length);
      getMeta(17).flags = ['broken'];
      $('searchInput').value = 'cradle'; $('flagFilter').value = 'broken'; applyFilters();
      const pillText = () => Array.from($('filterPills').querySelectorAll('.filter-pill')).map(b => b.textContent).join('|');
      ok('one pill per active filter, plus RESET ALL', pillText() === 'SEARCH: cradle ✕|FLAG: BROKEN ✕|RESET ALL', pillText());
      $('filterPills').querySelector('[data-clear-filter="flagFilter"]').click();
      ok('✕ removes just that filter', $('flagFilter').value === '' && $('searchInput').value === 'cradle' && pillText() === 'SEARCH: cradle ✕|RESET ALL');
      $('filterPills').querySelector('[data-clear-filter="*"]').click();
      ok('RESET ALL clears everything', $('searchInput').value === '' && $('filterPills').style.display === 'none' && visible() === 200);

      // ── THE SHELF ──
      await resetAll6();
      const sI = 10, sDisc = discs[sI].slice();
      getMeta(sI).notes = 'shelf note'; getMeta(sI).playHistory = ['2025-01-01T00:00:00Z', '2025-02-01T00:00:00Z']; getMeta(sI).condition = 'good';
      await putCustomArt(sI, PNG); saveMeta(); buildGrid();
      openEditModal(null, sI);
      ok('MOVE TO SHELF is offered for a filled slot', $('shelveBtn').style.display !== 'none');
      await shelveCurrent();
      const leftover = meta[sI] || {};
      ok('shelving empties the slot (no notes, plays or condition left behind)', isSlotEmpty(discs[sI]) && !customArt.has(sI) && !leftover.notes && !(leftover.playHistory || []).length && !leftover.condition, JSON.stringify(meta[sI]));
      ok('...keeping the disc with its notes, plays, condition and art', shelf.length === 1 && shelf[0].disc.join('|') === sDisc.join('|') && shelf[0].meta.notes === 'shelf note' && shelf[0].meta.playHistory.length === 2 && shelf[0].meta.condition === 'good' && shelfArt.get(shelf[0].id) === PNG && shelf[0].fromSlot === sI + 1);
      ok('a SHELF pill appears in the header', $('shelfPill').style.display !== 'none' && $('shelfCount').textContent === '1');
      ok('shelving is undoable', $('undoText').textContent.includes('SHELVED'));
      ok('shelf art is stored in its own IndexedDB store', (await shelfArtStore.get(shelf[0].id)) === PNG);
      openShelf();
      ok('the shelf lists it with plays and where it came from', $('shelfList').textContent.includes(sDisc[1]) && $('shelfList').textContent.includes('2 PLAY(S)') && $('shelfList').textContent.includes('FROM SLOT ' + String(sI + 1).padStart(3, '0')));
      $('shelfSearch').value = 'zzzz'; $('shelfSearch').dispatchEvent(new Event('input'));
      ok('shelf search filters', $('shelfList').textContent.includes('NO MATCHES'));
      $('shelfSearch').value = ''; $('shelfSearch').dispatchEvent(new Event('input'));
      window.prompt = () => String(sI + 1);
      $('shelfList').querySelector('[data-shelf-load]').click(); await wait(300);
      ok('LOAD INTO SLOT puts it back with everything', JSON.stringify(discs[sI]) === JSON.stringify(sDisc) && getMeta(sI).notes === 'shelf note' && getMeta(sI).playHistory.length === 2 && customArt.get(sI) === PNG && shelf.length === 0 && shelfArt.size === 0);
      closeShelf();
      openEditModal(null, sI); await shelveCurrent();
      const occ = discs[30].slice(); confirms.length = 0;
      window.prompt = () => '31';
      openShelf(); $('shelfList').querySelector('[data-shelf-load]').click(); await wait(300);
      ok('loading into an occupied slot asks, then shelves the occupant', confirms.some(c => c.includes('goes onto the shelf')) && JSON.stringify(discs[30]) === JSON.stringify(sDisc) && shelf.length === 1 && shelf[0].disc.join('|') === occ.join('|'));
      await performUndo();
      ok('UNDO reverses it (disc, occupant, shelf, art)', JSON.stringify(discs[30]) === JSON.stringify(occ) && shelf.length === 1 && shelf[0].disc.join('|') === sDisc.join('|') && shelfArt.size === 1);
      const oc6 = URL.createObjectURL, ock6 = HTMLAnchorElement.prototype.click; let blob6 = null;
      URL.createObjectURL = b => { blob6 = b; return 'blob:x'; }; HTMLAnchorElement.prototype.click = function () {};
      exportBackup();
      const bk6 = JSON.parse(await blob6.text());
      ok('backups include the shelf and its art', Array.isArray(bk6.shelf) && bk6.shelf.length === 1 && Object.values(bk6.shelfArt || {}).includes(PNG));
      shelf = []; await syncShelfArt(new Map()); saveShelf();
      await importBackup({ target: { files: [new File([JSON.stringify(bk6)], 'b.json')], value: '' } });
      URL.createObjectURL = oc6; HTMLAnchorElement.prototype.click = ock6;
      ok('restoring a backup brings the shelf back', shelf.length === 1 && shelfArt.size === 1);
      confirms.length = 0;
      openShelf(); $('shelfList').querySelector('[data-shelf-del]').click(); await wait(150);
      ok('removing from the shelf asks first', confirms.some(c => c.includes('from the shelf for good')) && shelf.length === 0);
      closeShelf();

      // ── PRINT BOOKLET ──
      await resetAll6();
      discs[3] = ['<b>Evil</b> & Co', 'Album "X"'];
      discs[5] = ['Wish Band', 'Wish Album Only']; getMeta(5).flags = ['wishlist'];
      getMeta(6).notes = 'PRIVATE-NOTE';
      await putCustomArt(1, PNG);
      let written = ''; openRet = { document: { write: s => { written += s; }, close() {} } };
      printBooklet('index');
      const ownedP = discs.filter((d, i) => !isSlotEmpty(d) && !isWish(i)).length;
      ok('compact index: every owned disc with its slot number, in two columns', (written.match(/class="r"/g) || []).length === ownedP && written.includes('column-count:2') && /<span class="s">\d{3}<\/span>/.test(written));
      ok('compact index: A–Z ignoring "The", with letter headings', written.indexOf('Centinex') < written.indexOf('The Chasm') && written.indexOf('The Chasm') < written.indexOf('Cianide') && written.includes('<div class="L">A</div>'));
      ok('compact index: titles escaped; no notes or wishlist', written.includes('&lt;b&gt;Evil&lt;/b&gt; &amp; Co') && !written.includes('PRIVATE-NOTE') && !written.includes('Wish Album Only'));
      written = ''; printBooklet('grid');
      ok('cover grid: 16 per page, slot order, slot numbers, custom art embedded', (written.match(/<section class="page">/g) || []).length === Math.ceil(ownedP / 16) && written.indexOf('>001<') < written.indexOf('>002<') && written.includes(PNG.slice(0, 50)));
      ok('the booklet prints itself once its covers have loaded', written.includes('window.print()') && written.includes('document.images'));
      openRet = null; printBooklet('index');
      ok('a blocked popup is reported', $('toast').textContent.includes('POPUP BLOCKED'));

      // ── PLAY ON CHANGER (webhook) ──
      await resetAll6();
      ok('an http webhook is refused on an https page (browsers block mixed content)', /blocks an http/.test(validWebhookUrl('http://homeassistant.local:8123/api/webhook/x', 'https:')));
      ok('https accepted; http is fine from a local file', validWebhookUrl('https://abc.ui.nabu.casa/api/webhook/x', 'https:') === '' && validWebhookUrl('http://homeassistant.local:8123/api/webhook/x', 'file:') === '');
      ok('a malformed URL is rejected', validWebhookUrl('not a url') !== '');
      const hookCalls = []; let hookMode = 'cors-ok';
      const base6 = window.fetch;
      window.fetch = (url, o) => {
        const u = String(url);
        if (u.startsWith('https://ha.example/')) {
          hookCalls.push({ u, o });
          if (hookMode === 'cors-ok') return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
          if (hookMode === 'cors-blocked') return (o && o.mode === 'no-cors') ? Promise.resolve({ ok: false, status: 0, type: 'opaque' }) : Promise.reject(new TypeError('Failed to fetch'));
          return Promise.reject(new TypeError('Failed to fetch'));
        }
        return base6(url, o);
      };
      const pI = idxOf('Absu', 'Tara');
      openInfoModal(pI); await wait(150);
      ok('no PLAY ON CHANGER button until a webhook is set', $('playChangerBtn').style.display === 'none');
      closeModal();
      openSettings(); $('hookUrl').value = 'https://ha.example/api/webhook/abc'; $('hookMark').checked = true; saveWebhookSettings(); closeSettings();
      openInfoModal(pI); await wait(150);
      ok('▶ PLAY ON CHANGER appears once a webhook is set', $('playChangerBtn').style.display !== 'none');
      await playOnChanger();
      const sent = JSON.parse(hookCalls[0].o.body);
      ok('play sends event, slot, artist and album as JSON', hookCalls[0].o.headers['Content-Type'] === 'application/json' && sent.event === 'play' && sent.slot === pI + 1 && sent.slot_padded === slotNum(pI) && sent.artist === 'Absu' && sent.album === 'Tara');
      ok('a confirmed send also marks NOW PLAYING and logs a play', $('toast').textContent.includes('SENT TO THE CHANGER ✓') && !!nowPlaying && nowPlaying.index === pI && getMeta(pI).playHistory.length === 1);
      hookMode = 'cors-blocked'; hookCalls.length = 0;
      await playOnChanger();
      ok('without CORS it falls back to a plain form post Home Assistant understands', hookCalls.length === 2 && hookCalls[1].o.mode === 'no-cors' && /slot=\d+/.test(hookCalls[1].o.body) && /artist=Absu/.test(hookCalls[1].o.body) && $('toast').textContent.includes('NO CONFIRMATION'));
      hookMode = 'down'; hookCalls.length = 0;
      await playOnChanger();
      ok('an unreachable changer is reported, nothing is marked', $('toast').textContent.includes('COULD NOT REACH') && getMeta(pI).playHistory.length === 2);
      hookMode = 'cors-ok';
      safeSet(HOOK_KEY, JSON.stringify({ url: 'https://ha.example/api/webhook/abc', markPlaying: false }));
      await playOnChanger();
      ok('"also mark now playing" can be switched off', getMeta(pI).playHistory.length === 2);
      hookCalls.length = 0;
      openSettings(); await testWebhook(); closeSettings();
      ok('SEND TEST sends a harmless "test" event', hookCalls.length === 1 && JSON.parse(hookCalls[0].o.body).event === 'test' && JSON.parse(hookCalls[0].o.body).slot === 0);
      closeModal();
      safeSet(HOOK_KEY, JSON.stringify({ url: '', markPlaying: true }));
      window.fetch = base6;

      // ── SYNC (GitHub Gist) ──
      await resetAll6();
      const TOKEN = 'github_pat_TESTTOKEN_abcdefghijklmnopqrstuvwxyz';
      const G = { gists: {}, n: 0, truncate: false };
      const gview = g => ({ id: g.id, description: g.description, updated_at: g.updated_at, history: g.history, files: Object.fromEntries(Object.entries(g.files).map(([f, v]) => [f, G.truncate && v.content.length > 60 ? { filename: f, truncated: true, raw_url: `https://gist.githubusercontent.com/raw/${g.id}/${f}`, content: v.content.slice(0, 60) } : { filename: f, truncated: false, content: v.content }])) });
      const gbump = g => { G.n++; g.updated_at = new Date(Date.UTC(2026, 0, 1) + G.n * 1000).toISOString(); g.history = [{ version: 'v' + G.n }]; };
      const base7 = window.fetch; const ghCalls = [];
      window.fetch = (url, o) => {
        const u = String(url);
        if (u.startsWith('https://api.github.com/')) {
          const m = (o && o.method) || 'GET'; ghCalls.push({ u, m });
          if ((o && o.headers && o.headers.Authorization) !== 'Bearer ' + TOKEN) return reply({ message: 'Bad credentials' }, 401);
          const p = u.slice('https://api.github.com'.length);
          if (p === '/user') return reply({ login: 'tester' });
          if (p.startsWith('/gists?')) return reply(Object.values(G.gists).map(gview));
          if (p === '/gists' && m === 'POST') { const b = JSON.parse(o.body); const g = { id: 'gid' + (G.n + 1), description: b.description, files: {} }; for (const [f, v] of Object.entries(b.files)) g.files[f] = { content: v.content }; gbump(g); G.gists[g.id] = g; G.lastPostPublic = b.public; return reply(gview(g), 201); }
          const mm = /^\/gists\/([^/?]+)$/.exec(p);
          if (mm) { const g = G.gists[mm[1]]; if (!g) return reply({ message: 'Not Found' }, 404); if (m === 'PATCH') { const b = JSON.parse(o.body); for (const [f, v] of Object.entries(b.files)) g.files[f] = { content: v.content }; gbump(g); } return reply(gview(g)); }
          return reply({ message: 'Not Found' }, 404);
        }
        if (u.startsWith('https://gist.githubusercontent.com/raw/')) { const mm = /raw\/([^/]+)\/(.+)$/.exec(u); const c = G.gists[mm[1]].files[mm[2]].content; return Promise.resolve({ ok: true, status: 200, text: async () => c }); }
        return base7(url, o);
      };
      const remoteData = gid => JSON.parse(G.gists[gid].files[GIST_DATA].content);
      const editRemote = (gid, fn) => { const d = remoteData(gid); fn(d); G.gists[gid].files[GIST_DATA].content = JSON.stringify(d); gbump(G.gists[gid]); };
      GIST_DELAY = 50;
      openSettings();
      $('gistToken').value = 'nope'; const al0 = alerts.length; await connectGist();
      ok('a malformed token is refused before anything is sent', alerts.length === al0 + 1 && ghCalls.length === 0);
      $('gistToken').value = 'github_pat_WRONGTOKEN_abcdefghijklmnopqrst'; await connectGist();
      ok('a rejected token is reported and nothing is stored', alerts.some(a => /rejected the token/.test(a)) && !gistCfg());
      getMeta(3).notes = 'synced note'; saveMeta();
      $('gistToken').value = TOKEN; await connectGist();
      const gid = Object.keys(G.gists)[0];
      ok('first connect creates a PRIVATE gist holding the collection', !!gid && G.lastPostPublic === false && G.gists[gid].description === GIST_DESC && remoteData(gid).meta[3].notes === 'synced note');
      ok('cover art goes in its own file; the token is never uploaded', 'customArt' in JSON.parse(G.gists[gid].files[GIST_ART].content) && !G.gists[gid].files[GIST_DATA].content.includes(TOKEN) && !G.gists[gid].files[GIST_ART].content.includes(TOKEN));
      ok('token field cleared; status shows the account', $('gistToken').value === '' && $('syncStatus').textContent.includes('TESTER') && $('syncPill').style.display !== 'none');
      getMeta(4).notes = 'second note'; saveMeta();
      ok('a change marks the sync as pending', syncDirty() && $('syncPillText').textContent === 'PENDING');
      await wait(500);
      ok('...and it is uploaded a moment later', !syncDirty() && remoteData(gid).meta[4].notes === 'second note');
      editRemote(gid, d => { d.discs[0] = ['Other Device', 'New Disc']; });
      await syncNow(true);
      ok('changes from another device are pulled in', discs[0][0] === 'Other Device' && !syncDirty());
      ok('pulling is undoable', $('undoText').textContent.includes('SYNCED FROM GITHUB'));
      GIST_DELAY = 999999;
      editRemote(gid, d => { d.discs[1] = ['Remote', 'Edit']; });
      discs[2] = ['Local', 'Edit']; saveDiscs();
      confirms.length = 0;
      await syncNow(true);
      ok('conflict: asks which version to keep', confirms.some(c => c.startsWith('SYNC CONFLICT')));
      ok('OK keeps this device and uploads it', remoteData(gid).discs[2][0] === 'Local' && remoteData(gid).discs[1][0] !== 'Remote' && discs[1][0] !== 'Remote');
      editRemote(gid, d => { d.discs[1] = ['Remote', 'Edit 2']; });
      discs[2] = ['Local', 'Edit 2']; saveDiscs();
      const keepConfirm = window.confirm; window.confirm = m => { confirms.push(String(m)); return false; };
      await syncNow(true);
      window.confirm = keepConfirm;
      ok('Cancel takes the version from GitHub (undoable)', discs[1][1] === 'Edit 2' && discs[2][1] === 'Edit' && $('undoText').textContent.includes('SYNCED FROM GITHUB'));
      editRemote(gid, d => { d.discs[1] = ['Remote', 'Edit 3']; });
      discs[2] = ['Local', 'Edit 3']; saveDiscs();
      await syncNow(false);
      ok('automatic sync never overwrites either side on a conflict', discs[1][1] === 'Edit 2' && remoteData(gid).discs[2][1] === 'Edit' && $('syncPillText').textContent === 'CONFLICT' && /CONFLICT/.test($('toast').textContent));
      await syncNow(true);
      ok('resolving the conflict clears it', $('syncPillText').textContent === 'SYNCED' && remoteData(gid).discs[2][1] === 'Edit 3');
      G.truncate = true;
      editRemote(gid, d => { d.discs[3] = ['Big', 'File']; });
      await syncNow(true);
      G.truncate = false;
      ok('large gist files (truncated by the API) are fetched in full', discs[3][0] === 'Big');
      disconnectGist();
      ok('DISCONNECT forgets the token', !gistCfg() && $('syncPill').style.display === 'none');
      discs[0] = ['Fresh', 'Device']; saveDiscs();
      confirms.length = 0;
      $('gistToken').value = TOKEN; await connectGist();
      ok('a second device finds the existing gist and offers to load it', confirms.some(c => c.startsWith('Found existing CrateChanger sync data')) && Object.keys(G.gists).length === 1 && gistCfg().gistId === gid && discs[0][0] === 'Other Device');
      closeSettings();
      ok('exported backups never contain the token', !JSON.stringify(buildBackupPayload()).includes(TOKEN));
      setGistCfg(null); try { localStorage.removeItem(GIST_DIRTY_KEY); } catch (e) {}
      GIST_DELAY = 15000; window.fetch = base7; renderSyncStatus();

      // ── BACK BUTTON + #slot links ──
      await resetAll6(); await wait(200);
      openStats(); await wait(80);
      ok('opening a window adds a history entry', !!history.state && history.state.cc === 'layer' && history.state.id === 'statsModal');
      history.back(); await wait(350);
      ok('Back closes the window', !$('statsModal').classList.contains('open'));
      openInfoModal(3); await wait(150);
      ok('the disc view puts #slot-004 in the address', location.hash === '#slot-004');
      openEditModal(null, 3); await wait(80);
      history.back(); await wait(350);
      ok('Back closes only the top window', !$('editModal').classList.contains('open') && $('infoModal').classList.contains('open'));
      closeModal(); await wait(80);
      ok('closing with ✕ clears the address without navigating', location.hash === '' && !!history.state && history.state.cc === 'dead');
      const hl = history.length;
      openHeatmap(); await wait(80);
      ok('the next window reuses that entry (history does not pile up)', history.length === hl && history.state.id === 'heatmapModal');
      closeHeatmap(); await wait(80);
      ok('a #slot-012 link opens that disc', openFromHash('#slot-012') === true && $('infoModal').classList.contains('open') && currentModalIndex === 11);
      closeModal(); await wait(80);
      ok('a #slot link to a slot that does not exist does nothing', openFromHash('#slot-999') === false);

      // ── camera fallback is pinned ──
      ok('ZXing fallback is pinned to a version with an integrity hash', /@zxing\/browser@0\.2\.1\//.test(ZXING_URL) && /^sha384-[A-Za-z0-9+/]{64}$/.test(ZXING_SRI));
      const tl = new URL(document.querySelector('#settingsModal .token-link').href);
      const perms = [...tl.searchParams.keys()].filter(k => !['name', 'description', 'expires_in'].includes(k));
      ok('the CREATE TOKEN link asks for Gists write and nothing else', tl.pathname === '/settings/personal-access-tokens/new' && perms.join(',') === 'gists' && tl.searchParams.get('gists') === 'write' && !tl.searchParams.has('target_name'), perms.join(','));
    }
    {   // ═══ 16. ROUND-7 VISUALS ═══
      const resetAll7 = async () => {
        discs = INITIAL_DATA.map(normalizeDisc); while (discs.length < 200) discs.push(null);
        meta = {}; mbCache = {}; await clearCustomArt(); nowPlaying = null; mbMode = 'ok';
        $('searchInput').value = ''; ['artistFilter', 'flagFilter', 'genreFilter', 'decadeFilter', 'originFilter'].forEach(id => { $(id).value = ''; });
        $('sortSelect').value = 'slot'; clearUndoHistory();
        if (document.body.classList.contains('showroom')) toggleShowroom(false);
        setView('grid'); setZoomUi(158); window.__ccForceVT = false;
        buildGrid();
      };
      await resetAll7();
      const solid = hex => { const c = document.createElement('canvas'); c.width = c.height = 40; const x = c.getContext('2d'); x.fillStyle = hex; x.fillRect(0, 0, 40, 40); return c.toDataURL('image/png'); };
      const px = (cols) => { const a = []; cols.forEach(([n, r, g, b]) => { for (let k = 0; k < n; k++) a.push(r, g, b, 255); }); return new Uint8ClampedArray(a); };

      // ── colour from cover art ──
      const p1 = paletteFromPixels(px([[80, 5, 5, 8], [20, 200, 30, 40]]));
      ok('palette: the vivid colour wins over a mostly-black cover', !!p1 && (p1.h < 15 || p1.h > 345) && p1.grey === false, JSON.stringify(p1));
      const p2 = paletteFromPixels(px([[100, 128, 128, 128]]));
      ok('palette: a grey cover is recognised as grey', !!p2 && p2.grey === true);
      const hues = [0, 45, 60, 120, 200, 240, 280, 330];
      const dark = hues.every(h => contrastRatio(discColors({ h, s: .9, l: .5, dh: h, ds: .5, dl: .3 }).accent, '#111114') >= 4.5);
      document.body.classList.add('light-theme');
      const light = hues.every(h => contrastRatio(discColors({ h, s: .9, l: .5, dh: h, ds: .5, dl: .3 }).accent, '#faf8f5') >= 4.5);
      document.body.classList.remove('light-theme');
      ok('disc colours always meet WCAG AA contrast (dark and light theme, every hue)', dark && light);
      await putCustomArt(4, solid('#1f4fd8'));
      const pb = await paletteFor(4);
      ok('a cover\'s palette is extracted in the browser (blue cover -> blue)', !!pb && pb.h > 215 && pb.h < 240, JSON.stringify(pb));
      ok('...and cached for next time', !!palettes['custom:4:' + customArt.get(4).length]);

      // ── disc view: tint + CD ──
      nowPlaying = { index: 4, artist: discs[4][0], album: discs[4][1] }; updateNowPlayingBanner();
      openInfoModal(4); await wait(300);
      ok('the open disc tints its window with its cover colour', $('infoModal').classList.contains('tinted') && !!$('infoModal').style.getPropertyValue('--disc-accent'));
      ok('the CD carries the cover as its label', /data:image/.test($('modalCd').querySelector('.cd-label').style.backgroundImage));
      ok('the CD spins while that disc is playing', $('modalCd').classList.contains('spinning'));
      ok('the now-playing banner shows a mini CD with the label', /data:image/.test($('npCd').querySelector('.cd-label').style.backgroundImage));
      clearNowPlaying(); await wait(50);
      ok('stopping playback stops the spin', !$('modalCd').classList.contains('spinning'));
      closeModal();
      openInfoModal(10); await wait(200);
      ok('a disc without readable art keeps the neutral window', !$('infoModal').classList.contains('tinted'));
      closeModal();

      // ── morph transitions ──
      const mm0 = window.matchMedia;
      const fakeMM = reduce => q => ({ matches: /reduce/.test(q) ? reduce : false, media: q, addEventListener() {}, removeEventListener() {} });
      window.matchMedia = fakeMM(true);
      ok('"reduce motion" on: no animations', canVT() === false && reducedMotion() === true);
      window.matchMedia = fakeMM(false);
      ok('"reduce motion" off: morph animations on (View Transitions supported here)', canVT() === true);
      window.matchMedia = mm0;
      window.__ccForceVT = true;
      let vtCalls = 0; const svt = document.startViewTransition.bind(document);
      document.startViewTransition = cb => { vtCalls++; return svt(cb); };
      const tile4 = document.querySelector('#grid .slot[data-index="4"]');
      await uiOpenDisc(4, tile4);
      ok('tile -> disc view morph completes with the disc open', $('infoModal').classList.contains('open') && currentModalIndex === 4 && $('modalArtWrap').style.viewTransitionName === '');
      await uiCloseModal();
      ok('...and morphs back closed', !$('infoModal').classList.contains('open') && !tile4.querySelector('.slot-art,.slot-art-placeholder').style.viewTransitionName);
      $('sortSelect').value = 'artist'; lastFilterAnim = 0;
      await uiApplyFilters();
      const firstA = discs[+document.querySelector('#grid .slot').dataset.index][0];
      ok('sorting animates and lands in the new order', /^Abs/i.test(firstA) && ![...document.querySelectorAll('#grid .slot')].some(el => el.style.viewTransitionName), firstA);
      $('sortSelect').value = 'slot'; applyFilters();
      ok('...the animated path really ran (open, close, sort = 3 View Transitions)', vtCalls === 3, vtCalls);
      delete document.startViewTransition; window.__ccForceVT = false;

      // ── carousel ──
      setView('ring');
      ok('carousel view replaces the grid', $('grid').style.display === 'none' && $('ringView').style.display === '' && document.querySelectorAll('#ring .ring-item').length === discs.length);
      ringRotateTo(5, true);
      ok('turning brings a slot to the front, lifted', ring.front === 5 && ring.items[5].classList.contains('front') && /scale\(1\.85/.test(ring.items[5].style.transform) && $('ringReadout').textContent.includes('006'));
      ok('only nearby and every-tenth slot numbers are shown', ring.items[6].classList.contains('num-on') && ring.items[9].classList.contains('num-on') && !ring.items[50].classList.contains('num-on'));
      document.body.focus && document.body.focus();
      document.activeElement && document.activeElement.blur && document.activeElement.blur();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })); await wait(650);
      ok('→ turns the carousel one slot', ring.front === 6, ring.front);
      ring.items[9].click(); await wait(650);
      ok('clicking another disc brings it to the front', ring.front === 9);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await wait(150);
      ok('Enter opens the front disc', $('infoModal').classList.contains('open') && currentModalIndex === 9);
      closeModal();
      getMeta(9).flags = ['broken']; $('flagFilter').value = 'broken'; applyFilters(); await wait(120);
      ok('filters dim non-matching discs on the carousel', !ring.items[9].classList.contains('dim') && ring.items[10].classList.contains('dim'));
      $('flagFilter').value = ''; applyFilters();
      ok('the chosen view is remembered', safeGet('cc_view') === 'ring');

      // ── spines ──
      setView('spines');
      const spines = [...document.querySelectorAll('#spineShelf .spine')];
      ok('spine view: one spine per slot, empty slots as gaps', spines.length === discs.length && spines.filter(s => s.classList.contains('empty')).length === discs.filter((d, i) => isSlotEmpty(d) && !isWish(i)).length);
      const readable = spines.filter(s => !s.classList.contains('empty')).every(s => contrastRatio(s.style.getPropertyValue('--sp-fg'), s.style.getPropertyValue('--sp-bg')) >= 4.5);
      ok('every spine\'s text is readable on its colour (WCAG AA)', readable);
      ok('a spine with known cover colours uses them', spines[4].style.getPropertyValue('--sp-stripe') !== 'transparent');
      ok('spines show artist, album and slot', /Ares Kingdom|ANAL|Absu/i.test(spines[0].textContent) && spines[0].querySelector('.sp-num').textContent === '001');
      spines[2].click(); await wait(150);
      ok('clicking a spine opens the disc', $('infoModal').classList.contains('open') && currentModalIndex === 2);
      closeModal();
      setView('list');
      ok('LIST is part of the view picker', listView === true && document.body.classList.contains('list-view') && $('grid').style.display === '');
      setView('grid');
      ok('...and back to the grid', listView === false && !document.body.classList.contains('list-view'));

      // ── patina ──
      await resetAll7();
      const ago = d => new Date(Date.now() - d * 864e5).toISOString();
      getMeta(1).flags = ['loaned']; getMeta(1).loanedTo = 'Max';
      getMeta(2).playHistory = [ago(3)];
      getMeta(3).playHistory = [ago(400)];
      getMeta(5).addedAt = ago(200);
      getMeta(6).addedAt = ago(20);
      ok('patina rules: loaned / fresh / dusty-by-age / dusty-by-neglect / no evidence', wearClasses(1).includes('wear-out') && wearClasses(2).join() === 'wear-fresh' && wearClasses(3).join() === 'wear-dust' && wearClasses(5).join() === 'wear-dust' && wearClasses(6).length === 0 && wearClasses(0).length === 0);
      buildGrid();
      const t1 = document.querySelector('#grid .slot[data-index="1"]');
      ok('tiles carry their patina, loans show the borrower', t1.classList.contains('wear-out') && t1.querySelector('.wear-loan').textContent.includes('Max') && document.querySelector('#grid .slot[data-index="3"]').classList.contains('wear-dust'));
      ok('patina is invisible outside Showroom', getComputedStyle(t1.querySelector('.wear-loan')).display === 'none');

      // ── showroom ──
      await putCustomArt(4, solid('#1f4fd8')); buildGrid();
      nowPlaying = { index: 4, artist: discs[4][0], album: discs[4][1] };
      toggleShowroom(true); await wait(300);
      ok('Showroom on: remembered, button says so', document.body.classList.contains('showroom') && safeGet('cc_showroom') === '1' && /ON/.test($('showroomBtn').textContent));
      ok('ambient light takes the playing disc\'s colour', !!document.body.style.getPropertyValue('--amb'));
      ok('patina shows in Showroom', getComputedStyle(document.querySelector('#grid .slot[data-index="1"] .wear-loan')).display === 'flex');
      const menuOnTop = () => {
        window.scrollTo(0, 0); closeMoreMenu(); $('moreBtn').click();
        const hits = [...$('moreMenu').querySelectorAll('button')].map(b => { const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })
          .filter(p => p.y > 0 && p.y < innerHeight && p.x > 0 && p.x < innerWidth)
          .map(p => document.elementFromPoint(p.x, p.y));
        closeMoreMenu();
        return hits.length >= 3 && hits.every(el => el && el.closest('#moreMenu'));
      };
      ok('Showroom: the ☰ MORE menu is on top of the grid (clickable)', menuOnTop());
      ok('Showroom: the header still sticks to the top', getComputedStyle(document.querySelector('header')).position === 'sticky');
      toggleShowroom(false);
      ok('Showroom off: ambient cleared', !document.body.classList.contains('showroom') && !document.body.style.getPropertyValue('--amb') && safeGet('cc_showroom') === '0');
      ok('Showroom off: the ☰ MORE menu is on top of the grid too', menuOnTop());

      // ── listening room ──
      mbCache[keyOf(discs[4])] = { mbTried: true, v: 2, tracks: [{ num: 1, title: 'Track A', length: '3:00' }, { num: 2, title: 'Track B', length: '4:00' }], tags: [], artSources: [] };
      openRoom(); await wait(250);
      ok('listening room opens on the disc that is playing', $('roomModal').classList.contains('open') && roomIndex === 4 && $('roomLabel').textContent === 'NOW PLAYING · 005');
      ok('...with its tracklist and big cover', $('roomTracks').textContent.includes('Track A') && $('roomTracks').textContent.includes('4:00') && /data:image/.test($('roomCover').src) && $('roomAlbum').textContent === discs[4][1]);
      ok('...tinted by the cover, CD spinning', $('roomModal').classList.contains('tinted') && $('roomCd').classList.contains('spinning'));
      ok('no PLAY ON CHANGER button without a webhook', $('roomPlayBtn').style.display === 'none');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
      ok('→ moves to the next disc in the changer', roomIndex === 5 && $('roomLabel').textContent === 'DISC · 006');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await wait(50);
      ok('Esc closes the listening room', !$('roomModal').classList.contains('open'));
      nowPlaying = null;
      openRoom(); await wait(100);
      ok('with nothing playing it starts at the first disc', roomIndex === discs.findIndex((d, i) => !isSlotEmpty(d) && !isWish(i)));
      closeRoom();

      // ── semantic zoom ──
      setZoomUi(60);
      ok('zooming far out turns the grid into a colour map', document.body.classList.contains('zoom-map') && $('zoomSlider').value === '60');
      setZoomUi(240);
      const tiles = [...document.querySelectorAll('#grid .slot')];
      ok('zooming far in turns tiles into cards with tracklists', document.body.classList.contains('zoom-cards') && tiles.every(t => t.querySelector('.slot-tracks')) && document.querySelector('#grid .slot[data-index="4"] .slot-tracks').textContent.includes('Track A'));
      const hs = new Set(tiles.slice(0, 20).map(t => Math.round(t.getBoundingClientRect().height)));
      ok('...all cards the same height', hs.size === 1, [...hs].join(','));
      ok('zoom is clamped to its range', setZoomUi(900) === 260 && setZoomUi(1) === 56);
      setZoomUi(150);
      const we = new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, bubbles: true, cancelable: true });
      document.querySelector('.grid-container').dispatchEvent(we);
      ok('Ctrl+wheel (and trackpad pinch) zooms the grid', Number($('zoomSlider').value) > 150 && we.defaultPrevented);
      setZoomUi(158);
      ok('in between, the normal grid', !document.body.classList.contains('zoom-map') && !document.body.classList.contains('zoom-cards'));
      await resetAll7();
    }
    {   // ═══ 17. ROUND-8 VISUALS ═══
      const resetAll8 = async () => {
        discs = INITIAL_DATA.map(normalizeDisc); while (discs.length < 200) discs.push(null);
        meta = {}; mbCache = {}; await clearCustomArt(); nowPlaying = null; mbMode = 'ok';
        $('searchInput').value = ''; ['artistFilter', 'flagFilter', 'genreFilter', 'decadeFilter', 'originFilter'].forEach(id => { $(id).value = ''; });
        $('sortSelect').value = 'slot'; clearUndoHistory(); window.__ccForceVT = false;
        if (listen.on) stopListening();
        setView('grid'); buildGrid();
      };
      await resetAll8();
      const solid8 = hex => { const c = document.createElement('canvas'); c.width = c.height = 48; const x = c.getContext('2d'); x.fillStyle = hex; x.fillRect(0, 0, 48, 48); return c.toDataURL('image/png'); };
      const RED = solid8('#d02020'), BLUE = solid8('#2040d0');
      const owned8 = () => discs.map((d, i) => i).filter(i => !isSlotEmpty(discs[i]) && !isWish(i));
      const tracks8 = n => ({ mbTried: true, v: 2, tracks: Array.from({ length: n }, (_, k) => ({ num: k + 1, title: 'T' + (k + 1), length: (2 + k % 5) + ':' + String(10 + k).padStart(2, '0') })), tags: [], artSources: [] });

      // ── 1. listening (Chrome's fake microphone plays a test tone) ──
      ok('listening is off by default', !listen.on && $('listenPill').style.display === 'none');
      const started = await startListening();
      ok('microphone opens and the analyser runs', started === true && listen.on && !!listen.an && document.body.classList.contains('listening'), String(started));
      ok('a LISTENING pill with a live level meter appears', $('listenPill').style.display !== 'none' && /STOP/.test($('listenMenuBtn').textContent));
      const rot0 = document.documentElement.style.getPropertyValue('--cd-rot');
      await wait(1500);
      ok('the music is analysed continuously (frames, live level, real signal)', listen.frames > 10 && document.documentElement.style.getPropertyValue('--lv') !== '' && listen.peak > .02, `frames ${listen.frames}, peak ${listen.peak.toFixed(3)}, beats ${listen.beats}`);
      ok('the CD turns with the music', document.documentElement.style.getPropertyValue('--cd-rot') !== rot0);
      const av = $('aurora'); const ad = av.getContext('2d').getImageData(0, 0, av.width, av.height).data;
      let lit = 0; for (let k = 3; k < ad.length; k += 4) if (ad[k] > 0) lit++;
      ok('the aurora is drawn from the live spectrum', av.width > 0 && lit > 100, lit + ' lit pixels');
      mbCache[keyOf(discs[2])] = tracks8(8);
      openRoom(2); await wait(2500);
      ok('in the listening room the tracklist highlight steps with the beat', listen.beats === 0 || $('roomTracks').querySelectorAll('li.flow').length === 1, `beats ${listen.beats}`);
      const tracksLive = listen.stream.getTracks();
      stopListening();
      ok('STOP releases the microphone and clears the effects', !listen.on && tracksLive.every(t => t.readyState === 'ended') && !document.body.classList.contains('listening') && document.documentElement.style.getPropertyValue('--lv') === '' && $('listenPill').style.display === 'none');
      closeRoom();

      // ── 2. dissolve + slot machine ──
      const im = document.createElement('img'); im.style.cssText = 'position:fixed;left:10px;top:10px;width:120px;height:120px'; document.body.appendChild(im);
      im.src = RED; await wait(100);
      window.__ccForceVT = true;
      const dc0 = dissolveCount;
      const how = await dissolveImage(im, BLUE);
      ok('covers dissolve into each other as particles', how === 'particles' && im.src === BLUE && dissolveCount === dc0 + 1 && !document.querySelector('.dissolve-canvas') && im.style.visibility === '');
      const how2 = await dissolveImage(im, 'https://unreachable.invalid/cover.jpg');
      ok('covers whose pixels can\'t be read just swap', how2 === 'plain');
      window.__ccForceVT = false;
      const mm8 = window.matchMedia; window.matchMedia = q => ({ matches: /reduce/.test(q), media: q, addEventListener() {}, removeEventListener() {} });
      im.src = RED; await wait(50);
      ok('"reduce motion": instant swap, no particles', (await dissolveImage(im, BLUE)) === 'instant');
      window.matchMedia = mm8; im.remove();
      await putCustomArt(5, RED); await putCustomArt(6, BLUE);
      window.__ccForceVT = true;
      openRoom(5); await wait(300);
      const dc1 = dissolveCount; roomStep(1); await wait(1700);
      ok('stepping discs in the listening room dissolves the covers', roomIndex === 6 && $('roomCover').src === BLUE && dissolveCount === dc1 + 1);
      closeRoom();
      const pool = randomPool();
      const pickP = uiPickRandom(); await wait(200);
      ok('RANDOM spins a reel of covers first', $('reel').classList.contains('open') && $('reelTrack').children.length === 23);
      const pick = await pickP;
      ok('...and lands on a playable, matching disc which opens', pool.includes(pick) && $('infoModal').classList.contains('open') && currentModalIndex === pick && !$('reel').classList.contains('open'));
      closeModal(); window.__ccForceVT = false;

      // ── 3. the 3D changer ──
      await resetAll8();
      getMeta(7).flags = ['loaned'];
      setView('changer');
      ok('3D changer view: one jewel case per slot', ch.items.length === discs.length && $('changerView').style.display === '' && $('grid').style.display === 'none');
      ok('empty slots are empty pockets, loaned discs leave a gap', ch.items.filter(e => e.classList.contains('empty')).length === discs.filter((d, i) => isSlotEmpty(d) && !isWish(i)).length && ch.items[7].classList.contains('loaned') && !ch.items[7].querySelector('img'));
      changerTurnTo(10, true);
      const step = 360 / discs.length;
      ok('turning brings a slot to the front, lifted out', ch.sel === 10 && ch.items[10].classList.contains('sel') && $('c3World').style.transform.includes(`rotateY(${-10 * step}deg)`) && $('c3Readout').textContent.includes('011'));
      ok('cases facing you are lit, the back of the ring is in shadow', parseFloat(ch.items[10].style.getPropertyValue('--shade')) > .95 && parseFloat(ch.items[110].style.getPropertyValue('--shade')) < .35);
      document.activeElement && document.activeElement.blur && document.activeElement.blur();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })); await wait(50);
      ok('→ turns the carousel', ch.sel === 11);
      ch.items[13].click(); await wait(50);
      ok('clicking a case lifts it out', ch.sel === 13);
      ch.items[13].click(); await wait(100);
      ok('clicking the lifted case opens the disc', $('infoModal').classList.contains('open') && currentModalIndex === 13);
      closeModal();

      // ── 4. emblems ──
      await resetAll8();
      mbCache[keyOf(discs[0])] = tracks8(9); mbCache[keyOf(discs[1])] = tracks8(9);
      const e0 = emblemSvg(0), e0b = emblemSvg(0), e1 = emblemSvg(1);
      const doc0 = new DOMParser().parseFromString(e0, 'image/svg+xml');
      ok('an emblem is valid SVG', !doc0.querySelector('parsererror') && doc0.documentElement.nodeName === 'svg');
      ok('the same album always gets the same emblem', e0 === e0b);
      ok('no two albums share one (same track count, different emblem)', e0 !== e1);
      ok('spokes = tracks', doc0.documentElement.getAttribute('data-spokes') === '9' && doc0.querySelectorAll('line').length === 9);
      ok('no tracklist yet: dashed "provisional" spokes', emblemSvg(2).includes('data-provisional="true"') && emblemSvg(2).includes('stroke-dasharray="3 3"'));
      discs[3] = ['<scr' + 'ipt>alert(1)</scr' + 'ipt>', 'x" onload="y'];   // split so the runner's <script> embedding isn't closed early
      const eh = emblemSvg(3); const dh = new DOMParser().parseFromString(eh, 'image/svg+xml');
      ok('hostile titles cannot break or script an emblem', !dh.querySelector('parsererror') && !dh.querySelector('script') && !eh.includes('<scr' + 'ipt>'));
      discs[3] = INITIAL_DATA.map(normalizeDisc)[3];
      setView('emblems');
      ok('emblem wall: one emblem per disc', document.querySelectorAll('#emblemWall .emb-tile').length === discs.filter(d => !isSlotEmpty(d)).length);
      document.querySelector('#emblemWall .emb-tile[data-index="1"]').click(); await wait(100);
      const mes = $('modalEmblem').querySelector('svg');
      ok('clicking an emblem opens the disc, which shows its emblem too', currentModalIndex === 1 && !!mes && mes.getAttribute('data-spokes') === '9' && mes.getAttribute('aria-label').includes(discs[1][1]) && mes.getAttribute('width') === '58');
      const oc8 = URL.createObjectURL, ock8 = HTMLAnchorElement.prototype.click; let blob8 = null, dl8 = '';
      URL.createObjectURL = b => { blob8 = b; return 'blob:x'; }; HTMLAnchorElement.prototype.click = function () { dl8 = this.download; };
      downloadEmblem();
      URL.createObjectURL = oc8; HTMLAnchorElement.prototype.click = ock8;
      ok('the emblem downloads as an SVG file', !!blob8 && blob8.type === 'image/svg+xml' && /^emblem-002-.+\.svg$/.test(dl8), dl8);
      closeModal();
      let w8 = ''; openRet = { document: { write: s => { w8 += s; }, close() {} } };
      printBooklet('emblems');
      ok('print: EMBLEM WALL, 20 per page', (w8.match(/<section class="page">/g) || []).length === Math.ceil(owned8().length / 20) && (w8.match(/<svg /g) || []).length === owned8().length);
      openRet = null; setView('grid');

      // ── 5. the jewel case ──
      mbCache[keyOf(discs[4])] = tracks8(6); await putCustomArt(4, RED); getMeta(4).barcode = '123456789012';
      await openCase(4); await wait(50);
      ok('the jewel case opens with the cover in the lid', $('caseModal').classList.contains('open') && $('jcCover').src === RED);
      ok('back insert = tracklist + barcode, spine = artist · album', $('jcInsert').querySelectorAll('.jci-tracks li').length === 6 && $('jcInsert').textContent.includes('123456789012') && $('jcSpine').textContent.includes(discs[4][1]));
      ok('the inside of the lid carries the album\'s emblem', !!$('jcInside').querySelector('svg'));
      ok('closed: the disc is hidden behind the lid', getComputedStyle(document.querySelector('.jc-tray')).visibility === 'hidden');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })); await wait(60);
      ok('Space opens it: lid swings, disc shows', $('jcase').classList.contains('opened') && getComputedStyle(document.querySelector('.jc-tray')).visibility === 'visible' && $('jcOpenBtn').textContent === 'CLOSE THE CASE');
      const st8 = $('caseStage'); const ry0 = jc.ry;
      st8.dispatchEvent(new PointerEvent('pointerdown', { clientX: 400, clientY: 300, pointerId: 7, bubbles: true }));
      st8.dispatchEvent(new PointerEvent('pointermove', { clientX: 480, clientY: 300, pointerId: 7, bubbles: true }));
      st8.dispatchEvent(new PointerEvent('pointerup', { clientX: 480, clientY: 300, pointerId: 7, bubbles: true }));
      const ryShown = parseFloat((/rotateY\(([-\d.]+)deg\)/.exec($('jcase').style.transform) || [])[1]);
      ok('dragging turns the case', Math.abs(jc.ry - ry0 - 40) < .5 && Math.abs(ryShown - jc.ry) < .1, `ry ${ry0} -> ${jc.ry}, shown ${ryShown}`);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await wait(50);
      ok('Esc puts the case down', !$('caseModal').classList.contains('open'));

      // ── 6. collection city ──
      await resetAll8();
      owned8().forEach((i, k) => { if (k % 4 === 0) getMeta(i).playHistory = Array.from({ length: 1 + k % 7 }, () => new Date().toISOString()); });
      getMeta(owned8()[5]).flags = ['loaned'];
      setView('city');
      ok('city: one lot per disc', city.model.lots.length === owned8().length && $('cityView').style.display === '');
      ok('without genre data the districts are decades (and the key says so)', city.groupBy === 'decade' && /DECADES/.test($('cityKey').textContent));
      owned8().forEach((i, k) => { getMeta(i).override = { genres: [k % 2 ? 'black metal' : 'death metal'] }; });
      renderCity();
      ok('with genres the districts are genres', city.groupBy === 'genre' && city.model.labels.length === 2);
      const busy = owned8()[0], quiet = owned8()[1];
      const lotOf = i => city.model.lots.find(l => l.i === i);
      ok('tower height follows plays', lotOf(busy).h > lotOf(quiet).h);
      ok('a loaned disc is an empty lot', lotOf(owned8()[5]).loaned === true);
      setCityHeight('year');
      ok('height can follow release year instead', city.heightBy === 'year' && /RELEASE YEAR/.test($('cityKey').textContent));
      setCityHeight('plays');
      const cv8 = $('cityCanvas'); const W8 = cv8.clientWidth, H8 = cv8.clientHeight; const L = city.model.lots.filter(l => !l.loaned && getMeta(l.i).playHistory.length).sort((p, q) => q.depth - p.depth)[0]; const front8 = L.i;
      const [px8, py8] = cityProject(L.x + .5, L.y + .5, L.h, W8, H8);
      ok('pointing at a tower\'s roof finds that disc', cityHitTest(px8, py8 + 1) === front8, cityHitTest(px8, py8 + 1) + ' vs ' + front8);
      const rc = cv8.getBoundingClientRect();
      cv8.dispatchEvent(new PointerEvent('pointerdown', { clientX: rc.left + px8, clientY: rc.top + py8 + 1, pointerId: 9, bubbles: true }));
      cv8.dispatchEvent(new PointerEvent('pointerup', { clientX: rc.left + px8, clientY: rc.top + py8 + 1, pointerId: 9, bubbles: true }));
      ok('clicking a tower opens the disc', $('infoModal').classList.contains('open') && currentModalIndex === front8);
      closeModal();
      const rot8 = city.rot;
      cv8.dispatchEvent(new PointerEvent('pointerdown', { clientX: 300, clientY: 300, pointerId: 10, bubbles: true }));
      cv8.dispatchEvent(new PointerEvent('pointermove', { clientX: 400, clientY: 300, pointerId: 10, bubbles: true }));
      cv8.dispatchEvent(new PointerEvent('pointerup', { clientX: 400, clientY: 300, pointerId: 10, bubbles: true }));
      ok('dragging turns the city (and does not open anything)', Math.abs(city.rot - rot8 - .6) < .001 && !$('infoModal').classList.contains('open'));
      await resetAll8();
    }
    {   // ═══ 18. SONG IDENTIFICATION (AudD) ═══
      const resetAll9 = async () => {
        discs = INITIAL_DATA.map(normalizeDisc); while (discs.length < 200) discs.push(null);
        meta = {}; mbCache = {}; await clearCustomArt(); nowPlaying = null; mbMode = 'ok';
        clearUndoHistory(); window.__ccForceVT = false;
        if (ident.auto) await setIdentifyAuto(false);
        if (listen.on) stopListening();
        try { localStorage.removeItem(AUDD_KEY); localStorage.removeItem(AUDD_COUNT_KEY); } catch (e) {}
        setView('grid'); buildGrid();
      };
      await resetAll9();
      ID_CLIP_MS = 900;
      const RED9 = (() => { const c = document.createElement('canvas'); c.width = c.height = 40; const x = c.getContext('2d'); x.fillStyle = '#c02525'; x.fillRect(0, 0, 40, 40); return c.toDataURL('image/png'); })();
      const auddCalls = []; let auddReply = null;
      const base9 = window.fetch;
      window.fetch = (url, o) => {
        const u = String(url); const du = decodeURIComponent(u);
        if (u === 'https://api.audd.io/') { auddCalls.push(o && o.body); return Promise.resolve({ ok: true, status: 200, json: async () => auddReply }); }
        if (u.includes('musicbrainz.org/ws/2/release/?query=') && du.includes('Songs From The Big Chair')) return reply({ releases: [{ id: 'rel-tff', score: 100, title: 'Songs From The Big Chair', date: '1985-02-25', country: 'GB', 'artist-credit': credit('Tears For Fears'), media: [{ format: 'CD' }] }] });
        if (u.includes('/release/rel-tff?')) return reply({ title: 'Songs From The Big Chair', 'release-group': { id: 'rg-tff', 'primary-type': 'Album', 'first-release-date': '1985-02-25' }, 'artist-credit': [{ name: 'Tears For Fears', artist: { id: 'art-tff', name: 'Tears For Fears' } }], date: '1985-02-25', country: 'GB', media: [{ tracks: [{ position: 1, title: 'Shout', length: 393000 }, { position: 2, title: 'The Working Hour', length: 391000 }, { position: 3, title: 'Everybody Wants To Rule The World', length: 251000 }] }] });
        return base9(url, o);
      };
      openRoom(); await wait(100);

      // ── token ──
      const r0 = await identifyNow();
      ok('IDENTIFY without an AudD token explains and opens Settings — nothing is sent', r0 === null && auddCalls.length === 0 && $('settingsModal').classList.contains('open') && /AUDD TOKEN/.test($('toast').textContent));
      ok('Settings says plainly that the clip is sent to AudD', /sends that clip to/.test($('settingsModal').textContent) && /NO TOKEN YET/.test($('auddStatus').textContent));
      const al9 = alerts.length; $('auddToken').value = 'bad token!'; saveAuddToken();
      ok('a malformed token is refused', alerts.length === al9 + 1 && !auddToken());
      $('auddToken').value = 'abcdef0123456789abcdef0123456789'; saveAuddToken();
      ok('a token is saved (field cleared, status confirms)', auddToken() === 'abcdef0123456789abcdef0123456789' && $('auddToken').value === '' && /TOKEN SAVED/.test($('auddStatus').textContent));
      ok('the AudD token never goes into backups or sync', !JSON.stringify(buildBackupPayload()).includes('abcdef0123456789') && !syncPayload().data.includes('abcdef0123456789'));
      closeSettings();

      // ── one of your CDs ──
      const tI9 = idxOf('Absu', 'Tara');
      mbCache[keyOf(discs[tI9])] = { mbTried: true, v: 2, tracks: [{ num: 1, title: 'Tara', length: '5:00' }, { num: 2, title: 'Pillars of Mercury', length: '4:00' }], tags: ['1995'], artSources: [] };
      auddReply = { status: 'success', result: { artist: 'Absu', title: 'Pillars of Mercury', album: 'Tara', timecode: '01:00', spotify: { duration_ms: 240000, external_urls: { spotify: 'https://open.spotify.com/track/abc' } } } };
      const r1 = await identifyNow();
      const fd = auddCalls[0]; const clip = fd && fd.get('file');
      ok('IDENTIFY records a real clip from the microphone and sends it with your token', auddCalls.length === 1 && fd instanceof FormData && fd.get('api_token') === 'abcdef0123456789abcdef0123456789' && clip instanceof Blob && clip.size > 0 && /^audio\//.test(clip.type) && fd.get('return') === 'apple_music,spotify,musicbrainz', clip ? clip.type + ', ' + clip.size + ' bytes' : 'no clip');
      ok('one of your CDs: the room switches to that disc', !!r1 && r1.slot === tI9 && roomIndex === tI9 && $('roomAlbum').textContent === 'Tara' && /IN YOUR CHANGER · SLOT/.test($('roomIdStatus').textContent));
      ok('...marks it NOW PLAYING and logs one play', !!nowPlaying && nowPlaying.index === tI9 && getMeta(tI9).playHistory.length === 1);
      const pl1 = $('roomTracks').querySelector('li.playing');
      ok('...and highlights the song actually playing', !!pl1 && pl1.textContent.includes('Pillars of Mercury') && $('roomSong').textContent === '♪ Pillars of Mercury');
      ok('...with links out (Spotify, Metal Archives), no wishlist button', /SPOTIFY/.test($('roomLinks').textContent) && /M-A/.test($('roomLinks').textContent) && !/WISHLIST/.test($('roomLinks').textContent));
      await identifyNow();
      ok('the next song on the same CD does not log a second play', getMeta(tI9).playHistory.length === 1);
      ok('identifications are counted', auddCountToday() === 2);

      // ── not in the changer ──
      const tff = { status: 'success', result: { artist: 'Tears For Fears', title: 'Everybody Wants To Rule The World', album: 'Songs From The Big Chair', release_date: '2014-11-10', label: 'Mercury', timecode: '00:56', song_link: 'https://lis.tn/abc', apple_music: { url: 'https://music.apple.com/album/1', artwork: { url: RED9 } }, spotify: { duration_ms: 251000, external_urls: { spotify: 'https://open.spotify.com/track/x' } } } };
      auddReply = tff;
      const r2 = await identifyNow(); await wait(400);
      ok('not one of your CDs: shown in the room anyway', !!r2 && r2.slot === -1 && roomIndex === null && /NOT IN YOUR CHANGER/.test($('roomLabel').textContent) && $('roomArtist').textContent === 'Tears For Fears' && $('roomAlbum').textContent === 'Songs From The Big Chair');
      ok('...with Apple\'s artwork as the fallback when MusicBrainz has no cover', $('roomCover').src === RED9 && $('roomCover').style.visibility !== 'hidden' && !$('roomCover').classList.contains('pending'));
      const BLUE9 = URL.createObjectURL(await new Promise(res => { const c = document.createElement('canvas'); c.width = c.height = 40; const x = c.getContext('2d'); x.fillStyle = '#2040d0'; x.fillRect(0, 0, 40, 40); c.toBlob(res, 'image/png'); }));   // a stand-in for a Cover Art Archive image (fetch is stubbed here)
      mbCache['Tears For Fears|The Hurting'] = { mbTried: true, v: 2, mbid: 'rel-hurt', year: '1983', tags: ['1983'], tracks: [{ num: 1, title: 'Mad World', length: '3:35' }], artSources: [BLUE9] };
      auddReply = { status: 'success', result: Object.assign({}, tff.result, { album: 'The Hurting', title: 'Mad World' }) };
      await identifyNow(); await wait(1600);   // a cover is already showing, so the new one arrives via the ~1 s particle dissolve
      ok('...but the album\'s own cover from MusicBrainz wins over Apple\'s (which can be a compilation)', $('roomCover').src === BLUE9 && $('roomAlbum').textContent === 'The Hurting', $('roomCover').src.slice(0, 40));
      auddReply = tff; await identifyNow(); await wait(300);
      ok('...tracklist and ORIGINAL year from MusicBrainz (1985, not the 2014 reissue)', $('roomTracks').textContent.includes('Shout') && $('roomTags').textContent.startsWith('1985') && $('roomTags').textContent.includes('Mercury'), $('roomTags').textContent);
      const pl2 = $('roomTracks').querySelector('li.playing');
      ok('...the playing song highlighted', !!pl2 && pl2.textContent.includes('Everybody Wants'));
      ok('...links: Apple Music, Spotify, all services, ♥ wishlist', ['APPLE MUSIC', 'SPOTIFY', 'ALL SERVICES', 'WISHLIST'].every(k => $('roomLinks').textContent.includes(k)));
      opened.length = 0; $('roomLinks').querySelector('[data-room-link]').click();
      ok('links open in a new tab', opened[0] === 'https://music.apple.com/album/1');
      ok('your own Now Playing and play counts are untouched', nowPlaying.index === tI9 && getMeta(tI9).playHistory.length === 1);
      $('roomLinks').querySelector('[data-room-wish]').click();
      const wi9 = discs.findIndex(d => d && d[1] === 'Songs From The Big Chair');
      ok('♥ adds it to your wishlist (undoable)', wi9 >= 0 && isWish(wi9) && discs[wi9][0] === 'Tears For Fears' && /WISHLISTED/.test($('undoText').textContent));
      $('roomLinks').querySelector('[data-room-wish]').click();
      ok('...only once', discs.filter(d => d && d[1] === 'Songs From The Big Chair').length === 1 && /ALREADY/.test($('toast').textContent));

      // ── no match / errors ──
      auddReply = { status: 'success', result: null };
      ok('no match is reported', (await identifyNow()) === null && /NO MATCH/.test($('roomIdStatus').textContent));
      auddReply = { status: 'error', error: { error_code: 901, error_message: 'Recognition failed: no requests left' } };
      ok('AudD errors are shown plainly', (await identifyNow()) === null && /NO REQUESTS LEFT/.test($('roomIdStatus').textContent) && /#901/.test($('roomIdStatus').textContent));

      // ── AUTO ──
      ok('AUTO schedules the next check for just after the song ends', planNextIdentify({ durationMs: 240000, timecode: 60 }, 0) === 240000 - 60000 - ID_CLIP_MS + 8000 && planNextIdentify(null, 0) === 240000);
      ident.gap = { quietSince: 0, armed: false, loudSince: 0 };
      const seq = [[.2, 0], [.001, 100], [.001, 1500], [.2, 1600], [.2, 4000], [.2, 6700]].map(([lv, t]) => songChangeDetector(lv, t));
      ok('AUTO spots a new song after a silence gap', JSON.stringify(seq) === JSON.stringify([false, false, false, false, false, true]), JSON.stringify(seq));
      auddReply = tff; const before9 = auddCalls.length;
      ok('AUTO turns on (starting the microphone) and identifies right away', (await setIdentifyAuto(true)) === true && ident.auto && listen.on && $('roomAutoBtn').textContent === 'AUTO: ON');
      await wait(ID_CLIP_MS + 800);
      ok('...the first identification is sent', auddCalls.length === before9 + 1);
      closeRoom(); await wait(50);
      ok('closing the room stops AUTO and the microphone it started', !ident.auto && !listen.on && $('roomAutoBtn').textContent === 'AUTO: OFF');
      try { localStorage.removeItem(AUDD_KEY); } catch (e) {}
      openRoom(); await wait(50);
      ok('AUTO refuses without a token', (await setIdentifyAuto(true)) === false && !ident.auto && !listen.on);
      closeSettings(); closeRoom();
      window.fetch = base9; ID_CLIP_MS = 8000;
      await resetAll9();
    }
  } catch (e) {
    R.push('FAIL harness exception: ' + (e && e.stack || e));
  }
  ok('no uncaught runtime errors / unhandled rejections', (window.__errs || []).length === 0, (window.__errs || []).join(' | '));
  const pass = R.filter(r => r.startsWith('PASS')).length, fail = R.filter(r => r.startsWith('FAIL')).length;
  R.push('SUMMARY pass=' + pass + ' fail=' + fail);
  document.body.insertAdjacentHTML('beforeend', '<pre id="__results">' + escH(R.join('\n')) + '</pre>');
})();
