// Static checks on dist/cratechanger.html: script syntax, element ids, inline handlers, duplicate declarations.
//   node tests/static-check.mjs [path]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const file = process.argv[2] || path.join(ROOT, 'dist', 'cratechanger.html');
const t = fs.readFileSync(file, 'utf8');
const s = t.indexOf('<script>') + 8, e = t.lastIndexOf('</script>');
const js = t.slice(s, e), html = t.slice(0, s) + t.slice(e);
let bad = 0;
const report = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) bad++; };

const tmp = path.join(os.tmpdir(), `_cc_static_${process.pid}.js`);
fs.writeFileSync(tmp, js);
const r = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
fs.unlinkSync(tmp);
report(r.status === 0, 'script syntax' + (r.status ? '\n' + r.stderr : ''));

// ids that JS looks up must exist in the page (ids that belong to the generated share page are exempt)
const exempt = new Set(['q', 'cnt', 'owned']);
const ids = new Set([...js.matchAll(/\$\('([A-Za-z0-9_]+)'\)/g), ...js.matchAll(/getElementById\('([A-Za-z0-9_]+)'\)/g)].map(m => m[1]));
const missing = [...ids].filter(id => !exempt.has(id) && !html.includes(`id="${id}"`));
report(!missing.length, `${ids.size} element ids referenced from JS` + (missing.length ? ' - missing: ' + missing.join(', ') : ''));

const dupIds = Object.entries([...html.matchAll(/ id="([^"]+)"/g)].reduce((a, m) => (a[m[1]] = (a[m[1]] || 0) + 1, a), {})).filter(([, n]) => n > 1).map(([k]) => k);
report(!dupIds.length, 'no duplicate element ids' + (dupIds.length ? ': ' + dupIds.join(', ') : ''));

const handlers = new Set([...t.matchAll(/on(?:click|change|input)="([A-Za-z_][A-Za-z0-9_]*)\(/g)].map(m => m[1]));
const noFn = [...handlers].filter(h => !new RegExp(`(?:^|\\n)\\s*(?:async\\s+)?function\\s+${h}\\s*\\(`).test(js));
report(!noFn.length, `${handlers.size} inline handlers resolve` + (noFn.length ? ' - no function for: ' + noFn.join(', ') : ''));

const decl = re => Object.entries([...js.matchAll(re)].reduce((a, m) => (a[m[1]] = (a[m[1]] || 0) + 1, a), {})).filter(([, n]) => n > 1).map(([k]) => k);
const dupFn = decl(/(?:^|\n)(?:async\s+)?function\s+([A-Za-z0-9_$]+)/g);
report(!dupFn.length, 'no function declared twice' + (dupFn.length ? ': ' + dupFn.join(', ') : ''));
const dupLet = decl(/(?:^|\n)(?:let|const)\s+([A-Za-z0-9_$]+)/g);
report(!dupLet.length, 'no top-level let/const declared twice' + (dupLet.length ? ': ' + dupLet.join(', ') : ''));
report(!/<\/script/i.test(js), 'no literal </script inside the script');

console.log(bad ? `\n${bad} static check(s) FAILED` : '\nall static checks passed');
process.exit(bad ? 1 : 0);
