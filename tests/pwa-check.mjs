// node tests/pwa-check.mjs
// Serves dist/ the way GitHub Pages does (under /cratechanger/, app as index.html) and checks in headless Chrome:
//   service worker installs and controls the page · manifest is installable · after the SERVER IS SHUT DOWN the app still loads.
// Env: CHROME_PATH, CHROME_FLAGS (same as run.mjs).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DIST = path.join(ROOT, 'dist');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const ok = (name, cond, extra) => { results.push((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? '   [' + extra + ']' : '')); };

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const sockets = new Set();
let swOverride = null;   // set later to simulate a new deploy of the service worker
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (!p.startsWith('/cratechanger/')) { res.writeHead(404); return res.end(); }
  let f = p.slice('/cratechanger/'.length) || 'index.html';
  if (f === 'index.html') f = 'cratechanger.html';
  if (f === 'sw.js' && swOverride) { res.writeHead(200, { 'Content-Type': TYPES['.js'], 'Cache-Control': 'no-cache' }); return res.end(swOverride); }
  const fp = path.join(DIST, f);
  if (!fp.startsWith(DIST) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(fp)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(fp).pipe(res);
});
server.on('connection', s => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/cratechanger/`;

const findChrome = () => [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
  .filter(Boolean).find(p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } });
const exe = findChrome(); if (!exe) throw new Error('Chrome not found - set CHROME_PATH');
const prof = fs.mkdtempSync(path.join(os.tmpdir(), '_cc_pwa_'));
const port = 9400 + Math.floor(Math.random() * 400);
const child = spawn(exe, ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${prof}`, `--remote-debugging-port=${port}`,
  ...(process.env.CHROME_FLAGS || '').split(/\s+/).filter(Boolean), 'about:blank'], { stdio: 'ignore' });

let ws, id = 0; const pend = new Map();
const send = (method, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
try {
  let tgt;
  for (let i = 0; i < 100 && !tgt; i++) { try { tgt = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page'); } catch (e) {} if (!tgt) await sleep(200); }
  ws = new WebSocket(tgt.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: base });
  let state = 'none';
  for (let i = 0; i < 60 && state !== 'activated'; i++) { await sleep(500); state = await ev("navigator.serviceWorker.getRegistration().then(r=>r&&r.active?r.active.state:'none')") || 'none'; }
  ok('service worker installs and activates', state === 'activated', state);
  await send('Page.reload'); await sleep(2500);
  ok('service worker controls the page after a reload', await ev('!!navigator.serviceWorker.controller') === true);
  const swText = fs.readFileSync(path.join(DIST, 'sw.js'), 'utf8');
  const version = (/VERSION='([^']+)'/.exec(swText) || [])[1];
  const pageHash = (await import('node:crypto')).createHash('sha256').update(fs.readFileSync(path.join(DIST, 'cratechanger.html'))).digest('hex').slice(0, 12);
  ok('the worker\'s version is this build\'s page hash (not a placeholder)', version === 'cc-shell-' + pageHash, version + ' vs cc-shell-' + pageHash);
  const keys = await ev('caches.keys()');
  ok('the app shell is cached under that version', Array.isArray(keys) && keys.includes(version), JSON.stringify(keys));
  const man = (await send('Page.getAppManifest')).result || {};
  ok('manifest loads without errors', !!man.url && (man.errors || []).length === 0, (man.errors || []).map(e => e.message).join('; '));
  const inst = (await send('Page.getInstallabilityErrors')).result || {};
  const errs = (inst.installabilityErrors || []).map(e => e.errorId);
  ok('Chrome considers the app installable', errs.length === 0, errs.join(', ') || 'no errors');
  ok('app rendered online', await ev("document.querySelectorAll('#grid .slot').length") >= 200);
  // update flow: publish a "new version" of the worker; the page must offer RELOAD and then switch over cleanly
  swOverride = swText.replace(version, 'cc-shell-update0000000');
  await ev('navigator.serviceWorker.getRegistration().then(r=>r.update()).then(()=>true)');
  let bar = false;
  for (let i = 0; i < 40 && !bar; i++) { await sleep(300); bar = await ev("document.getElementById('updateBar').classList.contains('visible')"); }
  ok('a new deploy shows the "new version ready" bar', bar === true);
  await ev('(applyUpdate(),true)'); await sleep(3500);
  const keys2 = await ev('caches.keys()');
  ok('RELOAD switches to the new version and drops the old cache', Array.isArray(keys2) && keys2.includes('cc-shell-update0000000') && !keys2.includes(version), JSON.stringify(keys2));
  // genuinely offline: stop the web server, then reload
  server.close(); sockets.forEach(s => s.destroy());
  await sleep(300);
  await send('Page.reload'); await sleep(3000);
  const slots = await ev("document.querySelectorAll('#grid .slot').length");
  ok('works OFFLINE (server shut down): the app still loads and renders', slots >= 200, slots + ' slots');
  ok('offline: the grid is interactive (STATS opens)', await ev("(openStats(),document.getElementById('statsModal').classList.contains('open'))") === true);
} catch (e) {
  results.push('FAIL exception: ' + (e && e.stack || e));
} finally {
  try { ws && ws.close(); } catch (e) {}
  child.kill(); server.close(); sockets.forEach(s => s.destroy());
  await sleep(500); try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) {}
}
const fails = results.filter(r => r.startsWith('FAIL')).length;
console.log('== pwa-check'); results.forEach(r => console.log('  ' + r));
console.log(fails ? `  FAILED  ${results.length - fails} passed, ${fails} failed` : `  OK  ${results.length} passed`);
process.exit(fails ? 1 : 0);
