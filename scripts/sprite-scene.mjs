// Puts sprite frames into a real room screenshot to judge size and readability in context.
// usage: node scripts/sprite-scene.mjs <bg.png> <out.png> [--scale 3] <module.ts>:<id>:<frame>@<x>,<y> ...
// The background may be 640×360 or an integer multiple (a 1080p screenshot); it is sampled down to
// the internal 640×360 grid. x,y is the sprite anchor (feet) in internal pixels: the floor line is
// y=292, the hero stands at x=176, enemies at x=458/528/598, a boss at x=528.
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { PAL } from '../render/palette.ts';

const args = process.argv.slice(2);
let scale = 3;
const si = args.indexOf('--scale');
if (si >= 0) {
  scale = Number(args[si + 1]);
  args.splice(si, 2);
}
const [bgPath, outPath, ...specs] = args;
if (!bgPath || !outPath || !specs.length) {
  console.error('usage: node scripts/sprite-scene.mjs <bg.png> <out.png> [--scale 3] <module.ts>:<id>:<frame>@<x>,<y> ...');
  process.exit(1);
}

function decodePng(file) {
  const buf = readFileSync(file);
  let pos = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9];
    }
    if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  const bpp = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const px = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0;
      const b = y > 0 ? px[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? px[(y - 1) * stride + x - bpp] : 0;
      let v = line[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[y * stride + x] = v & 255;
    }
  }
  return { width, height, bpp, px };
}

function encodePng(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const table = new Uint32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b) => {
    let c = 0xffffffff;
    for (const x of b) c = table[(c ^ x) & 0xff] ^ (c >>> 8);
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
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const VW = 640;
const VH = 360;
const bg = decodePng(bgPath);
const k = Math.max(1, Math.round(bg.width / VW));
const canvas = Buffer.alloc(VW * VH * 4);
for (let y = 0; y < VH; y++)
  for (let x = 0; x < VW; x++) {
    const s = (y * k * bg.width + x * k) * bg.bpp;
    const d = (y * VW + x) * 4;
    canvas[d] = bg.px[s];
    canvas[d + 1] = bg.px[s + 1];
    canvas[d + 2] = bg.px[s + 2];
    canvas[d + 3] = 255;
  }

const rgbOf = (name) => {
  const s = (PAL[name] ?? name).replace('#', '');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
};
const modules = new Map();
for (const spec of specs) {
  const m = spec.match(/^(.+?):([^:]+):([^@]+)@(-?\d+),(-?\d+)$/);
  if (!m) {
    console.error(`bad spec: ${spec}`);
    process.exit(1);
  }
  const [, modPath, id, frame, xs, ys] = m;
  if (!modules.has(modPath)) modules.set(modPath, await import(pathToFileURL(resolve(modPath)).href));
  let def;
  for (const v of Object.values(modules.get(modPath))) if (v && typeof v === 'object' && v[id]?.frames) def = v[id];
  if (!def) {
    console.error(`no sprite ${id} in ${modPath}`);
    process.exit(1);
  }
  const rows = def.frames[frame];
  if (!rows) {
    console.error(`no frame ${frame} in ${id}; frames: ${Object.keys(def.frames).join(', ')}`);
    process.exit(1);
  }
  const ox = def.ox ?? Math.floor(def.w / 2);
  const oy = def.oy ?? def.h - 1;
  const x0 = Number(xs) - ox;
  const y0 = Number(ys) - oy;
  const colors = {};
  for (const [ch, name] of Object.entries(def.legend)) if (name) colors[ch] = rgbOf(name);
  const put = (x, y, c) => {
    if (x < 0 || y < 0 || x >= VW || y >= VH) return;
    const d = (y * VW + x) * 4;
    canvas[d] = c[0];
    canvas[d + 1] = c[1];
    canvas[d + 2] = c[2];
  };
  const opaque = (x, y) => {
    const ch = rows[y]?.[x];
    return !!ch && ch !== '.' && ch !== ' ';
  };
  if (def.outline) {
    const oc = rgbOf(def.outline);
    for (let y = -1; y <= def.h; y++)
      for (let x = -1; x <= def.w; x++)
        if (!opaque(x, y) && (opaque(x - 1, y) || opaque(x + 1, y) || opaque(x, y - 1) || opaque(x, y + 1))) put(x0 + x, y0 + y, oc);
  }
  for (let y = 0; y < def.h; y++)
    for (let x = 0; x < def.w; x++) {
      const ch = rows[y]?.[x];
      if (!ch || ch === '.' || ch === ' ' || !colors[ch]) continue;
      put(x0 + x, y0 + y, colors[ch]);
    }
}

const out = Buffer.alloc(VW * scale * VH * scale * 4);
for (let y = 0; y < VH * scale; y++)
  for (let x = 0; x < VW * scale; x++) {
    const s = (Math.floor(y / scale) * VW + Math.floor(x / scale)) * 4;
    const d = (y * VW * scale + x) * 4;
    canvas.copy(out, d, s, s + 4);
  }
writeFileSync(outPath, encodePng(VW * scale, VH * scale, out));
console.log(`wrote ${outPath} (${VW * scale}x${VH * scale})`);
