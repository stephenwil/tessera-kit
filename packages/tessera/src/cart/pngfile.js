// Minimal lossless PNG codec for picture carts. A 2D canvas stores premultiplied alpha, which corrupts the low
// bits that carry the payload, so picture carts are encoded and decoded here, byte-exact, without a canvas.
import { crc32 } from './png.js';

const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function isPng(bytes) {
  return bytes && bytes.length >= 8 && SIG.every((b, i) => bytes[i] === b);
}

async function pipe(bytes, stream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

function chunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** RGBA (8-bit, non-premultiplied) → PNG bytes (colour type 6, filter 0 per row). */
export async function encodePng(rgba, width, height) {
  if (rgba.length !== width * height * 4) throw new Error('encodePng: size mismatch');
  const stride = width * 4;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width); dv.setUint32(4, height);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const parts = [new Uint8Array(SIG), chunk('IHDR', ihdr), chunk('IDAT', await pipe(raw, new CompressionStream('deflate'))), chunk('IEND', new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

const paeth = (a, b, c) => {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** PNG bytes → {width, height, rgba}. Supports 8-bit RGB/RGBA, non-interlaced; throws on anything else. */
export async function decodePng(bytes, { checkCrc = true } = {}) {
  if (!isPng(bytes)) throw new Error('not a PNG');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let o = 8, width = 0, height = 0, type = -1;
  const idat = [];
  while (o + 12 <= bytes.length) {
    const len = dv.getUint32(o);
    const name = String.fromCharCode(...bytes.subarray(o + 4, o + 8));
    if (o + 12 + len > bytes.length) throw new Error('truncated PNG');
    const data = bytes.subarray(o + 8, o + 8 + len);
    if (checkCrc && crc32(bytes.subarray(o + 4, o + 8 + len)) !== dv.getUint32(o + 8 + len)) throw new Error('bad PNG chunk CRC');
    if (name === 'IHDR') {
      width = dv.getUint32(o + 8); height = dv.getUint32(o + 12);
      const [depth, ct, , , interlace] = data.subarray(8, 13);
      if (depth !== 8 || (ct !== 6 && ct !== 2) || interlace !== 0) throw new Error('unsupported PNG');
      type = ct;
    } else if (name === 'IDAT') idat.push(data);
    else if (name === 'IEND') break;
    o += 12 + len;
  }
  if (type < 0 || !width || !height || width * height > 1 << 24) throw new Error('bad PNG header');
  const z = new Uint8Array(idat.reduce((n, d) => n + d.length, 0));
  let p = 0;
  for (const d of idat) { z.set(d, p); p += d.length; }
  const raw = await pipe(z, new DecompressionStream('deflate'));
  const bpp = type === 6 ? 4 : 3, stride = width * bpp;
  if (raw.length < (stride + 1) * height) throw new Error('short PNG data');
  const cur = new Uint8Array(stride), prev = new Uint8Array(stride);
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : f === 4 ? paeth(a, b, c) : -1;
      if (pred < 0) throw new Error('bad PNG filter');
      cur[i] = (row[i] + pred) & 255;
    }
    for (let x = 0; x < width; x++) {
      const d = (y * width + x) * 4;
      rgba[d] = cur[x * bpp]; rgba[d + 1] = cur[x * bpp + 1]; rgba[d + 2] = cur[x * bpp + 2];
      rgba[d + 3] = bpp === 4 ? cur[x * bpp + 3] : 255;
    }
    prev.set(cur);
  }
  return { width, height, rgba };
}
