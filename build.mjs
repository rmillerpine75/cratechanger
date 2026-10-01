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
