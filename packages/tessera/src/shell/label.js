// Standalone cart label generator for Node / CLI
import { packCart } from '../cart/png.js';
import { encodePng } from '../cart/pngfile.js';

const W = 256;
const H = 256;

function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function makeLabel(frameRgba, meta = {}) {
  const out = new Uint8ClampedArray(W * H * 4);
  const title = (meta.title || meta.id || 'Tessera Cart').trim();
  const seed = hashString(title);

  // Generate background gradient based on title hash
  const rBase = (seed & 0x7f) + 30;
  const gBase = ((seed >> 8) & 0x7f) + 30;
  const bBase = ((seed >> 16) & 0x7f) + 40;

  for (let y = 0; y < H; y++) {
    const t = y / H;
    const r = Math.min(255, Math.floor(rBase * (1 - t * 0.5)));
    const g = Math.min(255, Math.floor(gBase * (1 - t * 0.4)));
    const b = Math.min(255, Math.floor(bBase * (1 - t * 0.2) + 40 * t));

    for (let x = 0; x < W; x++) {
      const idx = (y * W + x) * 4;

      // Outer bezel border (4px)
      if (x < 6 || x >= W - 6 || y < 6 || y >= H - 6) {
        out[idx + 0] = 24;
        out[idx + 1] = 26;
        out[idx + 2] = 32;
        out[idx + 3] = 255;
      } else if (y >= 190) {
        // Lower metadata ribbon
        out[idx + 0] = 18;
        out[idx + 1] = 20;
        out[idx + 2] = 24;
        out[idx + 3] = 255;
      } else {
        // Background with subtle checker texture
        const check = ((x >> 4) ^ (y >> 4)) & 1 ? 8 : 0;
        out[idx + 0] = Math.min(255, r + check);
        out[idx + 1] = Math.min(255, g + check);
        out[idx + 2] = Math.min(255, b + check);
        out[idx + 3] = 255;
      }
    }
  }

  // If a screenshot frame was supplied and is 256x256, blend center
  if (frameRgba && frameRgba.length === W * H * 4) {
    for (let y = 20; y < 180; y++) {
      for (let x = 20; x < W - 20; x++) {
        const idx = (y * W + x) * 4;
        out[idx + 0] = frameRgba[idx + 0];
        out[idx + 1] = frameRgba[idx + 1];
        out[idx + 2] = frameRgba[idx + 2];
        out[idx + 3] = 255;
      }
    }
  }

  return out;
}

export async function createPictureCart(cartText, frameRgba, meta) {
  const label = makeLabel(frameRgba, meta);
  const packed = await packCart(cartText, label);
  return encodePng(packed, W, H);
}
