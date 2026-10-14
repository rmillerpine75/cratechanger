// node tools/make-icons.mjs -> src/pwa/icon-192.png, icon-512.png, icon-maskable-512.png
// Draws the app icon (a CD on the app's dark background) with 4x4 supersampling and encodes PNG with Node's zlib only.
// Run once; the PNGs are committed so builds stay byte-for-byte reproducible.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const OUT = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'src', 'pwa');
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const BG = hex('#0a0a0c'), DISC = hex('#2a2a35'), SHEEN = hex('#3a3a48'), RED = hex('#c8292e'), HOLE = BG;

function render(size, scale) {       // scale: disc radius as a fraction of half the icon (smaller for the maskable safe zone)
  const px = new Uint8Array(size * size * 4);
  const SS = 4, c = size / 2, R = c * scale;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let r = 0, g = 0, b = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const dx = x + (sx + .5) / SS - c, dy = y + (sy + .5) / SS - c, d = Math.hypot(dx, dy) / R;
      let col = BG;
      if (d <= 1) {
        col = DISC;
        if (d > 0.62 && d < 0.95 && Math.abs(Math.atan2(dy, dx) + 2.2) < 0.45) col = SHEEN;   // light reflection
        if (d <= 0.42) col = RED;                                                               // label
        if (d <= 0.11) col = HOLE;                                                              // centre hole
      }
      r += col[0]; g += col[1]; b += col[2];
    }
    const n = SS * SS, o = (y * size + x) * 4;
    px[o] = Math.round(r / n); px[o + 1] = Math.round(g / n); px[o + 2] = Math.round(b / n); px[o + 3] = 255;
  }
  return png(size, size, px);
}

const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = buf => { let c = 0xffffffff; for (const v of buf) c = CRC[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii'), len = Buffer.alloc(4), crc = Buffer.alloc(4);
  len.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

fs.mkdirSync(OUT, { recursive: true });
for (const [name, size, scale] of [['icon-192.png', 192, 0.86], ['icon-512.png', 512, 0.86], ['icon-maskable-512.png', 512, 0.62]]) {
  const buf = render(size, scale);
  fs.writeFileSync(path.join(OUT, name), buf);
  console.log(`${name}  ${size}x${size}  ${buf.length} bytes`);
}
