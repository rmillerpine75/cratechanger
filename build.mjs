// node build.mjs  ->  dist/cratechanger.html  (one self-contained file; open it straight from disk)
// Sources: src/index.template.html + src/styles/*.css + src/js/*.js, concatenated in filename order, byte-exact.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const list = dir => fs.readdirSync(path.join(ROOT, dir)).filter(f => !f.startsWith('.')).sort();

const css = list('src/styles').filter(f => f.endsWith('.css')).map(f => read('src/styles/' + f)).join('');
const js = list('src/js').filter(f => f.endsWith('.js')).map(f => read('src/js/' + f)).join('');
const tpl = read('src/index.template.html');
if (tpl.split('@@STYLES@@').length !== 2 || tpl.split('@@SCRIPT@@').length !== 2) throw new Error('template markers missing');
if (/<\/script/i.test(js)) throw new Error('a JS source contains a literal "</script" - escape it as "<\\/script"');

const html = tpl.replace('@@STYLES@@', () => css).replace('@@SCRIPT@@', () => js);
fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
const out = path.join(ROOT, 'dist', 'cratechanger.html');
fs.writeFileSync(out, html, 'utf8');
const sha = crypto.createHash('sha256').update(html).digest('hex');
console.log(`built dist/cratechanger.html  ${html.split('\n').length} lines  ${Math.round(html.length / 1024)} KB  sha256 ${sha.slice(0, 16)}`);

// PWA files next to the page (manifest, icons, service worker). The Pages deploy publishes them with the page;
// opened straight from disk they're simply unused. The worker's version = this page's hash, so a changed app updates.
const pwaDir = path.join(ROOT, 'src', 'pwa');
const emitted = [];
for (const f of fs.readdirSync(pwaDir).sort()) {
  const from = path.join(pwaDir, f);
  if (f === 'sw.template.js') {
    const sw = read('src/pwa/' + f).replaceAll('@@VERSION@@', sha.slice(0, 12));
    if (sw.includes('@@')) throw new Error('sw.js still contains a placeholder');
    fs.writeFileSync(path.join(ROOT, 'dist', 'sw.js'), sw, 'utf8');
    emitted.push('sw.js');
  } else { fs.copyFileSync(from, path.join(ROOT, 'dist', f)); emitted.push(f); }
}
console.log('pwa files: ' + emitted.join(', '));
