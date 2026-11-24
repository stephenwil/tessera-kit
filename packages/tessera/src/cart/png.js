// .tess.png picture carts: payload hidden in the low 2 bits of R,G,B,A (spec 6.2).
export const CAPACITY = 65536;
const SIZE = 256 * 256 * 4;
const HEADER = 13;
const BAD = "This image isn't a Tessera cart (or it was re-compressed).";

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data) {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export const MAX_UNPACK_BYTES = 2 * 1024 * 1024; // 2 MiB

async function pipe(bytes, stream, maxBytes = Infinity) {
  let streamPipe = new Blob([bytes]).stream().pipeThrough(stream);
  if (Number.isFinite(maxBytes)) {
    let count = 0;
    const limiter = new TransformStream({
      transform(chunk, controller) {
        count += chunk.byteLength;
        if (count > maxBytes) {
          controller.error(new Error(`Payload exceeds maximum decompressed size (${maxBytes} bytes)`));
        } else {
          controller.enqueue(chunk);
        }
      }
    });
    streamPipe = streamPipe.pipeThrough(limiter);
  }
  const out = new Response(streamPipe);
  return new Uint8Array(await out.arrayBuffer());
}

export async function packCart(cartText, labelRGBA) {
  if (!labelRGBA || labelRGBA.length !== SIZE) {
    throw new Error(`packCart: label must be 256*256*4 = ${SIZE} RGBA bytes.`);
  }
  const packed = await pipe(new TextEncoder().encode(cartText), new CompressionStream('deflate-raw'));
  if (packed.length + HEADER > CAPACITY) {
    throw new Error(`Cart is ${Math.ceil(packed.length / 1024)} KiB compressed; a picture cart holds 64 KiB.`);
  }
  const payload = new Uint8Array(HEADER + packed.length);
  payload.set([0x54, 0x45, 0x53, 0x53, 1]);
  const dv = new DataView(payload.buffer);
  dv.setUint32(5, packed.length, true);
  dv.setUint32(9, crc32(packed), true);
  payload.set(packed, HEADER);

  const out = new Uint8ClampedArray(labelRGBA);
  for (let p = 0; p < 65536; p++) {
    const o = p * 4;
    if (out[o + 3] < 252) out[o + 3] = 252;
    if (p < payload.length) {
      const b = payload[p];
      out[o] = (out[o] & 0xfc) | (b >> 6);
      out[o + 1] = (out[o + 1] & 0xfc) | ((b >> 4) & 3);
      out[o + 2] = (out[o + 2] & 0xfc) | ((b >> 2) & 3);
      out[o + 3] = (out[o + 3] & 0xfc) | (b & 3);
    }
  }
  return out;
}

export async function unpackCart(rgba) {
  const fail = () => new Error(BAD);
  if (!rgba || rgba.length !== SIZE) throw fail();
  const byteAt = (p) => {
    const o = p * 4;
    return ((rgba[o] & 3) << 6) | ((rgba[o + 1] & 3) << 4) | ((rgba[o + 2] & 3) << 2) | (rgba[o + 3] & 3);
  };
  if (byteAt(0) !== 0x54 || byteAt(1) !== 0x45 || byteAt(2) !== 0x53 || byteAt(3) !== 0x53) throw fail();
  if (byteAt(4) !== 1) throw fail();
  const len = (byteAt(5) | (byteAt(6) << 8) | (byteAt(7) << 16) | (byteAt(8) << 24)) >>> 0;
  if (len > CAPACITY - HEADER) throw fail();
  const crc = (byteAt(9) | (byteAt(10) << 8) | (byteAt(11) << 16) | (byteAt(12) << 24)) >>> 0;
  const packed = new Uint8Array(len);
  for (let i = 0; i < len; i++) packed[i] = byteAt(HEADER + i);
  if (crc32(packed) !== crc) throw fail();
  try {
    const raw = await pipe(packed, new DecompressionStream('deflate-raw'), MAX_UNPACK_BYTES);
    return new TextDecoder('utf-8', { fatal: true }).decode(raw);
  } catch {
    throw fail();
  }
}
