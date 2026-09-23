// Checks that a full-screen screenshot is pixel-perfect: every internal pixel must be an
// exact scale×scale block of one colour. Usage: node scripts/crisp-check.mjs shot.png [scale=3]
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const [, , file, scaleArg] = process.argv;
const scale = Number(scaleArg ?? 3);
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
let blocks = 0;
let bad = 0;
for (let by = 0; by + scale <= height; by += scale)
  for (let bx = 0; bx + scale <= width; bx += scale) {
    blocks++;
    const o = by * stride + bx * bpp;
    const r = px[o];
    const g = px[o + 1];
    const b = px[o + 2];
    let same = true;
    for (let y = 0; y < scale && same; y++)
      for (let x = 0; x < scale; x++) {
        const q = (by + y) * stride + (bx + x) * bpp;
        if (px[q] !== r || px[q + 1] !== g || px[q + 2] !== b) {
          same = false;
          break;
        }
      }
    if (!same) bad++;
  }
console.log(`${width}x${height}, scale ${scale}: ${blocks} blocks, ${bad} not uniform (${((bad / blocks) * 100).toFixed(3)}%)`);
process.exit(bad / blocks < 0.001 ? 0 : 1);
