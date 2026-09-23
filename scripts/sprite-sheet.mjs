// Contact sheet for sprite review: node scripts/sprite-sheet.mjs <module.ts> [out.png] [scale=4]
// Renders every sprite and frame of the module's exported SpriteDef records on a dark backdrop.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { PAL } from '../render/palette.ts';

const [, , modPath, outArg, scaleArg] = process.argv;
if (!modPath) {
  console.error('usage: node scripts/sprite-sheet.mjs render/art/<file>.ts [out.png] [scale]');
  process.exit(1);
}
const scale = Number(scaleArg ?? 4);
const mod = await import(pathToFileURL(resolve(modPath)).href);
const sprites = {};
for (const v of Object.values(mod)) {
  if (v && typeof v === 'object' && !Array.isArray(v))
    for (const [id, def] of Object.entries(v)) if (def && def.frames && def.legend) sprites[id] = def;
}
const hexToRgb = (h) => {
  const s = (PAL[h] ?? h).replace('#', '');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
};

const rows = Object.entries(sprites).map(([id, def]) => ({ id, def, frames: Object.entries(def.frames) }));
const gap = 3;
const rowH = rows.map((r) => r.def.h + 2);
const rowW = rows.map((r) => r.frames.length * (r.def.w + 2 + gap));
const W = Math.max(64, ...rowW) + gap * 2;
const H = rowH.reduce((a, b) => a + b + gap, gap);
const px = new Uint8Array(W * H * 4);
// Backdrop: two-tone cold checker so both dark outlines and light pixels read.
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const p = (y * W + x) * 4;
    const c = ((x >> 3) + (y >> 3)) & 1 ? [34, 41, 73] : [23, 27, 53];
    px[p] = c[0];
    px[p + 1] = c[1];
    px[p + 2] = c[2];
    px[p + 3] = 255;
  }
let oy = gap;
const index = [];
rows.forEach((r, k) => {
  let ox = gap;
  const colors = {};
  for (const [ch, name] of Object.entries(r.def.legend)) if (name) colors[ch] = hexToRgb(name);
  for (const [fname, lines] of r.frames) {
    index.push(`${r.id}.${fname} @ ${ox},${oy} (${r.def.w}x${r.def.h})`);
    for (let y = 0; y < r.def.h; y++) {
      const line = lines[y] ?? '';
      if (line.length !== r.def.w) console.warn(`! ${r.id}.${fname} row ${y}: length ${line.length} != ${r.def.w}`);
      for (let x = 0; x < r.def.w; x++) {
        const ch = line[x];
        if (!ch || ch === '.' || ch === ' ') continue;
        const c = colors[ch];
        if (!c) {
          console.warn(`! ${r.id}.${fname}: unknown char '${ch}'`);
          continue;
        }
        const p = ((oy + 1 + y) * W + (ox + 1 + x)) * 4;
        px[p] = c[0];
        px[p + 1] = c[1];
        px[p + 2] = c[2];
      }
    }
    if (lines.length !== r.def.h) console.warn(`! ${r.id}.${fname}: ${lines.length} rows != ${r.def.h}`);
    ox += r.def.w + 2 + gap;
  }
  oy += rowH[k] + gap;
});

// Upscale.
const SW = W * scale;
const SH = H * scale;
const raw = Buffer.alloc((SW * 4 + 1) * SH);
for (let y = 0; y < SH; y++) {
  raw[y * (SW * 4 + 1)] = 0;
  for (let x = 0; x < SW; x++) {
    const s = ((Math.floor(y / scale) * W + Math.floor(x / scale)) * 4);
    const d = y * (SW * 4 + 1) + 1 + x * 4;
    raw[d] = px[s];
    raw[d + 1] = px[s + 1];
    raw[d + 2] = px[s + 2];
    raw[d + 3] = 255;
  }
}
const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SW, 0);
ihdr.writeUInt32BE(SH, 4);
ihdr[8] = 8;
ihdr[9] = 6;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]);
const out = outArg ?? modPath.replace(/\.ts$/, '.png').replace('render/art/', 'output/sprites/');
writeFileSync(out, png);
console.log(`wrote ${out} (${SW}x${SH}); ${rows.length} sprites`);
for (const line of index) console.log('  ' + line);
