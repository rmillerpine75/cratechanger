// IMPORT FROM v7 tests (throwaway profile).  run: .\run-tests.ps1 -Harness harness_v7import.js
(async () => {
  const R = [];
  const ok = (n, c, x) => R.push((c ? 'PASS ' : 'FAIL ') + n + (x !== undefined ? '   [' + x + ']' : ''));
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const confirms = []; let answer = false;
  window.confirm = m => { confirms.push(String(m)); return answer; };
  window.fetch = () => Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
  const clicked = [];
  URL.createObjectURL = () => 'blob:x';
  HTMLAnchorElement.prototype.click = function () { clicked.push(this.download); };

  // ── seed "v7" data synchronously, BEFORE init's on-open offer (~0.9 s after start) ──
  const v7list = INITIAL_DATA.map(d => d ? [...d] : null);
  const removed0 = keyOf(v7list[0]), removed150 = keyOf(v7list[150]);
  v7list[0] = ['NEW', 'DISC'];
  [v7list[5], v7list[6]] = [v7list[6], v7list[5]];
  v7list[150] = ['Added', 'In V7'];
  localStorage.setItem('crate_changer_v1', JSON.stringify(v7list));
  localStorage.setItem('crate_changer_cache_v4', JSON.stringify({
    'Added|In V7': { tracks: [{ num: 1, title: 'v7 track' }], tags: ['1999'], artSources: ['https://img.example/a.jpg', PNG], customArt: PNG },
    'Absu|Tara': { tracks: [{ num: 1, title: 'from v7 cache' }], tags: ['2001'], artSources: ['https://img.example/t.jpg'] },
    'Junk|Poisoned': { tracks: [], tags: [], artSources: [] }
  }));
  // data that already exists in this build (same browser) and must follow its disc
  const k5 = keyOf(discs[5]);
  meta[5] = { flags: ['broken'], notes: 'follow me', condition: 'mint', playHistory: ['2026-01-01T00:00:00Z'], loanedTo: '', loanDate: '' };
  meta[150] = { flags: [], notes: 'orphan note', condition: '', playHistory: [], loanedTo: '', loanDate: '' };
  saveMeta();

  try {
    // v7_hardened art store must never be CREATED by probing
    const before = (await indexedDB.databases()).some(d => d.name === 'crate_changer_art');
    await readV7Art();
    const after = (await indexedDB.databases()).some(d => d.name === 'crate_changer_art');
    ok('probing for v7_hardened art never creates its database', before === false && after === false);
    // now simulate a v7_hardened art store
    await new Promise(res => { const r = indexedDB.open('crate_changer_art', 1); r.onupgradeneeded = () => r.result.createObjectStore('art'); r.onsuccess = () => { const tx = r.result.transaction('art', 'readwrite'); tx.objectStore('art').put(PNG, 'Absu|The Third Storm of Cythraul'); tx.oncomplete = () => { r.result.close(); res(); }; }; });
    for (let n = 0; n < 40 && !$('grid').children.length; n++) await wait(100);
    await putCustomArt(5, PNG);              // custom art on the disc that moves 5 -> 6
    await putCustomArt(0, PNG);              // custom art on a disc that is NOT in the v7 list (orphan)

    // ── 1. offered automatically on open ──
    for (let n = 0; n < 50 && !confirms.length; n++) await wait(100);
    const m0 = confirms[0] || '';
    ok('v11 offers the v7 list automatically on open', m0.startsWith('IMPORT FROM v7'), m0.split('\n')[0]);
    ok('dry run: exact number of slots that change', m0.includes('  4 of 200 slots change'), (m0.split('\n')[1] || '').trim());
    ok('dry run: v7 custom art + reusable lookups counted', m0.includes('2 custom art image(s)') && m0.includes('2 cover-art / tracklist lookups reused'), m0.split('\n').slice(3, 5).join(' / '));
    ok('dry run: warns about data on discs that are not in the v7 list', m0.includes('2 slot(s) here have flags/notes/art'));
    ok('declining changes nothing', keyOf(discs[0]) === removed0 && !safeGet(DISC_KEY));
    confirms.length = 0;
    await offerV7Import();
    ok('declined -> not asked again for the same v7 list', confirms.length === 0);
    $('brModal').classList.add('open'); updateV7Label();
    ok('BACKUP dialog shows the v7 status', $('v7StatusLabel').textContent.includes('4 SLOT(S) DIFFER'), $('v7StatusLabel').textContent);
    $('brModal').classList.remove('open');

    // ── 2. manual import ──
    answer = true; clicked.length = 0;
    await importFromV7();
    ok('safety backup downloaded BEFORE importing', clicked.length === 1 && /^CrateChanger_pre-v7-import_/.test(clicked[0]), clicked[0]);
    ok('disc list now matches v7 exactly (all slots)', countDiffSlots(v7list.map(normalizeDisc), discs) === 0);
    ok('grid shows the v7 list', document.querySelector('.slot[data-index="0"]').textContent.includes('NEW') && document.querySelector('.slot[data-index="150"]').textContent.includes('Added'));
    ok('persisted to this build\'s storage', countDiffSlots(JSON.parse(localStorage.getItem(DISC_KEY)).map(normalizeDisc), v7list.map(normalizeDisc)) === 0);
    ok('flags/notes/play history FOLLOWED the disc to its v7 slot (5 -> 6)', keyOf(discs[6]) === k5 && getMeta(6).notes === 'follow me' && getMeta(6).flags.includes('broken') && getMeta(6).playHistory.length === 1);
    ok('custom art followed the disc too', customArt.has(6) && !customArt.has(5));
    ok('data for discs not in the v7 list was dropped (as warned)', !getMeta(150).notes && !customArt.has(0));
    ok('v7 custom art (from its cache) landed on the right slot', customArt.has(150));
    ok('v7_hardened custom art (IndexedDB) landed on the right slot', customArt.has(1));
    ok('v7 lookups reused (no re-fetch), cleaned of embedded images', mbCache['Absu|Tara'] && mbCache['Absu|Tara'].tracks[0].title === 'from v7 cache' && mbCache['Added|In V7'] && !mbCache['Added|In V7'].customArt && !mbCache['Added|In V7'].artSources.some(s => s.startsWith('data:')));
    ok('poisoned (empty) v7 lookups are NOT copied', !mbCache['Junk|Poisoned']);
    ok('imported old-format lookups will be upgraded later', needsUpgrade(mbCache['Absu|Tara']));
    ok('UNDO offered', $('undoBar').classList.contains('visible') && $('undoText').textContent.includes('v7'));
    $('brModal').classList.add('open'); updateV7Label();
    ok('BACKUP dialog now says it matches', $('v7StatusLabel').textContent.includes('MATCHES'), $('v7StatusLabel').textContent);
    $('brModal').classList.remove('open');

    // ── 3. undo + idempotence ──
    await performUndo();
    ok('UNDO restores the previous list, meta and custom art', keyOf(discs[0]) === removed0 && getMeta(5).notes === 'follow me' && customArt.has(5) && customArt.has(0) && !customArt.has(150));
    confirms.length = 0;
    await importFromV7();
    confirms.length = 0;
    await importFromV7();
    ok('importing again when already identical is a no-op (no prompt)', confirms.length === 0 && $('toast').textContent.includes('ALREADY MATCHES'));

    // ── 4. v7 changes later -> offered again ──
    v7list[10] = ['Later', 'Edit In V7'];
    localStorage.setItem('crate_changer_v1', JSON.stringify(v7list));
    answer = false; confirms.length = 0;
    await offerV7Import();
    ok('a later change in v7 is offered again', confirms.length === 1 && confirms[0].includes('  1 of 200 slots change'), (confirms[0] || '').split('\n')[1]);

    // ── 5. no v7 data -> nothing happens ──
    localStorage.removeItem('crate_changer_v1'); confirms.length = 0;
    await offerV7Import();
    $('brModal').classList.add('open'); updateV7Label();
    ok('without v7 data: no prompt, button disabled', confirms.length === 0 && $('importV7Btn').disabled === true);
    $('brModal').classList.remove('open');
  } catch (e) { R.push('FAIL harness exception: ' + (e && e.stack || e)); }
  ok('no uncaught runtime errors / unhandled rejections', (window.__errs || []).length === 0, (window.__errs || []).join(' | '));
  R.push('SUMMARY pass=' + R.filter(r => r.startsWith('PASS')).length + ' fail=' + R.filter(r => r.startsWith('FAIL')).length);
  document.body.insertAdjacentHTML('beforeend', '<pre id="__results">' + escH(R.join('\n')) + '</pre>');
})();
