// usage: node _cc_cdp.mjs <chrome.exe> <mode: test|shot> <fileUrl> <outDir>
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [, , exe, mode, url, outDir] = process.argv;
const port = mode === 'test' ? 9333 : 9334;
const prof = fs.mkdtempSync(path.join(os.tmpdir(), '_cc_prof_'));
const child = spawn(exe, ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--user-data-dir=${prof}`, `--remote-debugging-port=${port}`, ...(process.env.CHROME_FLAGS || '').split(/\s+/).filter(Boolean), 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getTarget() {
  for (let i = 0; i < 100; i++) {
    try {
      const l = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const pg = l.find(t => t.type === 'page');
      if (pg) return pg;
    } catch (e) {}
    await sleep(200);
  }
  throw new Error('no debuggable target');
}

let ws, id = 0;
const pending = new Map();
const logs = [];
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;

try {
  const tgt = await getTarget();
  ws = new WebSocket(tgt.webSocketDebuggerUrl);
  await new Promise(r => (ws.onopen = r));
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    else if (m.method === 'Runtime.consoleAPICalled') logs.push(m.params.type + ': ' + m.params.args.map(a => a.value ?? a.description).join(' '));
    else if (m.method === 'Runtime.exceptionThrown') logs.push('EXCEPTION: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  };
  await send('Runtime.enable');
  await send('Page.enable');
  // deterministic theme: headless Chrome reports a LIGHT system theme by default; the app now follows the system setting
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  await send('Page.navigate', { url });

  if (mode === 'test') {
    let result = null;
    for (let i = 0; i < 200; i++) {
      await sleep(2000);
      const v = await evalJs("(document.getElementById('__results')||{}).textContent||''");
      if (v) { result = v; break; }
    }
    console.log(result ?? 'TIMEOUT: harness never finished');
    console.log('--- page console (first 30) ---');
    console.log(logs.filter(l => !/Failed to load resource|net::ERR/.test(l)).slice(0, 30).join('\n') || '(none)');
  } else {
    await sleep(3000);
    const shot = async (name, w, h, mobile) => {
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
      await sleep(600);
      const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(outDir, name), Buffer.from(r.result.data, 'base64'));
      console.log('saved ' + name);
    };
    await shot('_cc_desktop.png', 1400, 900, false);
    await evalJs("toggleEditMode(); openEditModal(null, 0); 1");
    await shot('_cc_mobile_edit.png', 390, 844, true);
    await evalJs("closeEditModal(); toggleEditMode(); 1");
    await shot('_cc_mobile.png', 390, 844, true);
    console.log('--- page console ---');
    console.log(logs.filter(l => !/Failed to load resource|net::ERR/.test(l)).slice(0, 20).join('\n') || '(none)');
  }
} catch (e) {
  console.log('DRIVER ERROR: ' + (e && e.stack || e));
} finally {
  try { ws && ws.close(); } catch (e) {}
  child.kill();
  await sleep(500);
  try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) {}
  process.exit(0);
}
