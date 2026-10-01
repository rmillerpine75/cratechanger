// Layout regression: non-square covers must not change card size.  run: .\run-tests.ps1 -Harness harness_layout.js
(async () => {
  const R = [];
  const ok = (n, c, x) => R.push((c ? 'PASS ' : 'FAIL ') + n + (x !== undefined ? '   [' + x + ']' : ''));
  const wait = ms => new Promise(r => setTimeout(r, ms));
  window.fetch = () => Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
  window.confirm = () => false;
  const img = (w, h, color) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = color; x.fillRect(0, 0, w, h); return c.toDataURL('image/png'); };
  try {
    for (let n = 0; n < 60 && !$('grid').children.length; n++) await wait(100);
    // Set raw (un-resized) art straight into the in-memory map so the test does not depend on the upload path
    customArt.set(0, img(300, 600, '#a33'));   // tall booklet-style scan
    customArt.set(3, img(600, 300, '#33a'));   // wide scan
    customArt.set(1, img(400, 400, '#3a3'));   // normal square cover
    buildGrid();
    await wait(800);
    const slots = Array.from(document.querySelectorAll('#grid .slot'));
    const top0 = slots[0].offsetTop;
    const row = slots.filter(s => s.offsetTop === top0);
    const heights = row.map(s => s.offsetHeight);
    ok('every card in a row has the same height (tall + wide covers present)', new Set(heights).size === 1, heights.join(','));
    const art = i => document.querySelector(`.slot[data-index="${i}"] .slot-art`);
    const sq = el => el && Math.abs(el.offsetHeight - el.offsetWidth) <= 1;
    ok('tall cover is shown square (cropped to fit)', sq(art(0)), art(0) && art(0).offsetWidth + 'x' + art(0).offsetHeight);
    ok('wide cover is shown square (cropped to fit)', sq(art(3)), art(3) && art(3).offsetWidth + 'x' + art(3).offsetHeight);
    const ph = document.querySelector('.slot .slot-art-placeholder');
    ok('empty / art-less placeholders are square too', sq(ph), ph && ph.offsetWidth + 'x' + ph.offsetHeight);
    const allH = new Set(slots.slice(0, 40).map(s => s.offsetHeight));
    ok('first 40 cards all identical height', allH.size === 1, [...allH].join(','));
    setZoom(230); await wait(300);
    ok('still square after zooming the cards', sq(art(0)) && new Set(Array.from(document.querySelectorAll('#grid .slot')).slice(0, 20).map(s => s.offsetHeight)).size === 1, art(0) && art(0).offsetWidth + 'x' + art(0).offsetHeight);
    setZoom(158);
    toggleListView(); await wait(300);
    const a0 = art(0);
    ok('list view: thumbnails stay 44x44 and rows 44px', a0 && a0.offsetWidth === 44 && a0.offsetHeight === 44 && document.querySelector('#grid .slot').offsetHeight === 44, a0 && a0.offsetWidth + 'x' + a0.offsetHeight);
    toggleListView();
  } catch (e) { R.push('FAIL harness exception: ' + (e && e.stack || e)); }
  ok('no uncaught runtime errors', (window.__errs || []).length === 0, (window.__errs || []).join(' | '));
  R.push('SUMMARY pass=' + R.filter(r => r.startsWith('PASS')).length + ' fail=' + R.filter(r => r.startsWith('FAIL')).length);
  document.body.insertAdjacentHTML('beforeend', '<pre id="__results">' + escH(R.join('\n')) + '</pre>');
})();
