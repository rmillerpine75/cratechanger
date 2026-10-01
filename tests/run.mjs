// Test runner (Windows / macOS / Linux CI).
//   node tests/run.mjs                 -> all offline suites against dist/cratechanger.html
//   node tests/run.mjs --live          -> real-network smoke test (MusicBrainz / iTunes / Discogs)
//   node tests/run.mjs --html X --harness Y [--verbose]
// Each suite runs a COPY of the page in a throwaway headless Chrome profile: your real browser data is never touched.
// Env: CHROME_PATH (browser binary), CHROME_FLAGS (extra flags, e.g. "--no-sandbox" on Linux CI).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(HERE);
const argv = process.argv.slice(2);
const opt = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };

function findChrome() {
  const c = [process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
  const hit = c.find(p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } });
  if (!hit) throw new Error('Chrome/Edge not found - set CHROME_PATH');
  return hit;
}

const ERRS = '<script>window.__errs=[];addEventListener("error",function(e){__errs.push(e.message+" @"+e.lineno)});addEventListener("unhandledrejection",function(e){__errs.push("unhandled: "+(e.reason&&e.reason.message||e.reason))});</script>';
function runSuite(htmlPath, harnessFile, chrome) {
  const page = fs.readFileSync(htmlPath, 'utf8');
  const harness = fs.readFileSync(path.join(HERE, harnessFile), 'utf8');
  const i = page.indexOf('<head>');
  if (i < 0 || page.lastIndexOf('</body>') < 0) throw new Error('page has no <head>/<body>');
  const withErr = page.slice(0, i + 6) + '\n' + ERRS + page.slice(i + 6);
  const k = withErr.lastIndexOf('</body>');
  const test = withErr.slice(0, k) + '<script>\n' + harness + '\n</script>\n' + withErr.slice(k);
  const tmp = path.join(os.tmpdir(), `_cratechanger_${process.pid}_${harnessFile}.html`);
  fs.writeFileSync(tmp, test, 'utf8');
  const r = spawnSync(process.execPath, [path.join(HERE, 'cdp.mjs'), chrome, 'test', pathToFileURL(tmp).href, os.tmpdir()], { encoding: 'utf8', timeout: 15 * 60 * 1000 });
  try { fs.unlinkSync(tmp); } catch (e) {}
  const out = (r.stdout || '') + (r.stderr || '');
  const m = /SUMMARY pass=(\d+) fail=(\d+)/.exec(out);
  return { out, pass: m ? +m[1] : 0, fail: m ? +m[2] : 1, ok: !!m && +m[2] === 0 };
}

const chrome = findChrome();
const html = path.resolve(opt('--html') || path.join(ROOT, 'dist', 'cratechanger.html'));
const suites = opt('--harness') ? [opt('--harness')] : argv.includes('--live') ? ['live_smoke.js'] : ['harness_main.js', 'harness_v7import.js', 'harness_layout.js'];
let allOk = true;
for (const s of suites) {
  const t0 = Date.now();
  const r = runSuite(html, s, chrome);
  const lines = r.out.split('\n');
  const show = (argv.includes('--verbose') || s === 'live_smoke.js') ? lines.filter(l => /^(PASS|FAIL|INFO)/.test(l)) : lines.filter(l => /^(FAIL|INFO)/.test(l));
  console.log(`\n== ${s}  (${Math.round((Date.now() - t0) / 1000)} s)`);
  show.forEach(l => console.log('  ' + l));
  console.log(r.ok ? `  OK  ${r.pass} passed` : `  FAILED  ${r.pass} passed, ${r.fail} failed`);
  if (!/SUMMARY/.test(r.out)) console.log(r.out.slice(-1500));
  allOk = allOk && r.ok;
}
process.exit(allOk ? 0 : 1);
