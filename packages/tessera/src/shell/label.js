// Official Tessera 256x256 picture-cart label generator for Node / CLI:
// deep slate frame with mosaic-tile corners, 240x135 gameplay cover window at (8,8),
// 5x7 pixel-font title (scale 2) & author, bottom mosaic strip, and TESSERA maker's mark.
import { packCart } from '../cart/png.js';
import { encodePng } from '../cart/pngfile.js';

const W = 256;
const H = 256;

const SLATE = [0x1b, 0x23, 0x30];
const SLATE_HI = [0x2c, 0x3a, 0x4f];
const SLATE_LO = [0x12, 0x18, 0x21];
const INK = [0xe8, 0xf6, 0xff];
const INK_DIM = [0x9f, 0xb3, 0xc8];
const TILES = [
  [0x3f, 0xb8, 0xaf],
  [0xe8, 0xa3, 0x3d],
  [0xe5, 0x54, 0x6b],
  [0x5a, 0xa9, 0xe6],
  [0x8f, 0xd1, 0x6a],
];

export const LABEL = {
  shotX: 8,
  shotY: 8,
  shotW: 240,
  shotH: 135,
  titleX: 8,
  titleY: 151,
  authorX: 8,
  authorY: 168,
};

const SRC5 = {
  ' ': '...../...../...../...../...../...../.....', '!': '..#../..#../..#../..#../..#../...../..#..',
  '"': '.#.#./.#.#./.#.#./...../...../...../.....', '#': '.#.#./.#.#./#####/.#.#./#####/.#.#./.#.#.',
  '$': '..#../.####/#.#../.###./..#.#/####./..#..', '%': '##..#/##..#/...#./..#../.#.../#..##/#..##',
  '&': '.##../#..#./#.#../.#.../#.#.#/#..#./.##.#', "'": '..#../..#../.#.../...../...../...../.....',
  '(': '...#./..#../.#.../.#.../.#.../..#../...#.', ')': '.#.../..#../...#./...#./...#./..#../.#...',
  '*': '...../..#../#.#.#/.###./#.#.#/..#../.....', '+': '...../..#../..#../#####/..#../..#../.....',
  ',': '...../...../...../...../..##./..#../.#...', '-': '...../...../...../#####/...../...../.....',
  '.': '...../...../...../...../...../.##../.##..', '/': '....#/....#/...#./..#../.#.../#..../#....',
  '0': '.###./#...#/#..##/#.#.#/##..#/#...#/.###.', '1': '..#../.##../..#../..#../..#../..#../.###.',
  '2': '.###./#...#/....#/...#./..#../.#.../#####', '3': '#####/...#./..#../...#./....#/#...#/.###.',
  '4': '...#./..##./.#.#./#..#./#####/...#./...#.', '5': '#####/#..../####./....#/....#/#...#/.###.',
  '6': '..##./.#.../#..../####./#...#/#...#/.###.', '7': '#####/....#/...#./..#../.#.../.#.../.#...',
  '8': '.###./#...#/#...#/.###./#...#/#...#/.###.', '9': '.###./#...#/#...#/.####/....#/...#./.##..',
  ':': '...../.##../.##../...../.##../.##../.....', ';': '...../.##../.##../...../.##../..#../.#...',
  '<': '...#./..#../.#.../#..../.#.../..#../...#.', '=': '...../...../#####/...../#####/...../.....',
  '>': '.#.../..#../...#./....#/...#./..#../.#...', '?': '.###./#...#/....#/...#./..#../...../..#..',
  '@': '.###./#...#/#.###/#.#.#/#.###/#..../.###.',
  A: '.###./#...#/#...#/#####/#...#/#...#/#...#', B: '####./#...#/#...#/####./#...#/#...#/####.',
  C: '.###./#...#/#..../#..../#..../#...#/.###.', D: '####./#...#/#...#/#...#/#...#/#...#/####.',
  E: '#####/#..../#..../####./#..../#..../#####', F: '#####/#..../#..../####./#..../#..../#....',
  G: '.###./#...#/#..../#.###/#...#/#...#/.####', H: '#...#/#...#/#...#/#####/#...#/#...#/#...#',
  I: '.###./..#../..#../..#../..#../..#../.###.', J: '..###/...#./...#./...#./...#./#..#./.##..',
  K: '#...#/#..#./#.#../##.../#.#../#..#./#...#', L: '#..../#..../#..../#..../#..../#..../#####',
  M: '#...#/##.##/#.#.#/#.#.#/#...#/#...#/#...#', N: '#...#/##..#/#.#.#/#..##/#...#/#...#/#...#',
  O: '.###./#...#/#...#/#...#/#...#/#...#/.###.', P: '####./#...#/#...#/####./#..../#..../#....',
  Q: '.###./#...#/#...#/#...#/#.#.#/#..#./.##.#', R: '####./#...#/#...#/####./#.#../#..#./#...#',
  S: '.####/#..../#..../.###./....#/....#/####.', T: '#####/..#../..#../..#../..#../..#../..#..',
  U: '#...#/#...#/#...#/#...#/#...#/#...#/.###.', V: '#...#/#...#/#...#/#...#/#...#/.#.#./..#..',
  W: '#...#/#...#/#...#/#.#.#/#.#.#/##.##/#...#', X: '#...#/#...#/.#.#./..#../.#.#./#...#/#...#',
  Y: '#...#/#...#/.#.#./..#../..#../..#../..#..', Z: '#####/....#/...#./..#../.#.../#..../#####',
  '[': '.###./.#.../.#.../.#.../.#.../.#.../.###.', '\\': '#..../#..../.#.../..#../...#./....#/....#',
  ']': '.###./...#./...#./...#./...#./...#./.###.', '^': '..#../.#.#./#...#/...../...../...../.....',
  '_': '...../...../...../...../...../...../#####', '`': '.#.../..#../...#./...../...../...../.....',
  a: '...../...../.###./....#/.####/#...#/.####', b: '#..../#..../#.##./##..#/#...#/##..#/#.##.',
  c: '...../...../.###./#...#/#..../#...#/.###.', d: '....#/....#/.##.#/#..##/#...#/#..##/.##.#',
  e: '...../...../.###./#...#/#####/#..../.###.', f: '..##./.#..#/.#.../###../.#.../.#.../.#...',
  g: '...../.####/#...#/#...#/.####/....#/.###.', h: '#..../#..../#.##./##..#/#...#/#...#/#...#',
  i: '..#../...../.##../..#../..#../..#../.###.', j: '...#./...../..##./...#./...#./#..#./.##..',
  k: '#..../#..../#..#./#.#../##.../#.#../#..#.', l: '.##../..#../..#../..#../..#../..#../.###.',
  m: '...../...../##.#./#.#.#/#.#.#/#.#.#/#.#.#', n: '...../...../#.##./##..#/#...#/#...#/#...#',
  o: '...../...../.###./#...#/#...#/#...#/.###.', p: '...../####./#...#/#...#/####./#..../#....',
  q: '...../.####/#...#/#...#/.####/....#/....#', r: '...../...../#.##./##..#/#..../#..../#....',
  s: '...../...../.####/#..../.###./....#/####.', t: '.#.../.#.../###../.#.../.#.../.#..#/..##.',
  u: '...../...../#...#/#...#/#...#/#..##/.##.#', v: '...../...../#...#/#...#/#...#/.#.#./..#..',
  w: '...../...../#...#/#...#/#.#.#/#.#.#/.#.#.', x: '...../...../#...#/.#.#./..#../.#.#./#...#',
  y: '...../#...#/#...#/#...#/.####/....#/.###.', z: '...../...../#####/...#./..#../.#.../#####',
  '{': '..##./.#.../.#.../#..../.#.../.#.../..##.', '|': '..#../..#../..#../..#../..#../..#../..#..',
  '}': '.##../...#./...#./....#/...#./...#./.##..', '~': '...../...../.#.../#.#.#/...#./...../.....',
};

const FONT_5X7 = Array.from({ length: 95 }, (_, i) => {
  const rows = SRC5[String.fromCharCode(32 + i)].split('/');
  return Array.from({ length: 35 }, (_, b) => (rows[Math.floor(b / 5)][b % 5] === '#' ? 1 : 0));
});

function glyphBits(ch) {
  const code = typeof ch === 'number' ? ch : String(ch).charCodeAt(0);
  return FONT_5X7[code >= 32 && code <= 126 ? code - 32 : '?'.charCodeAt(0) - 32];
}

function fill(l, x0, y0, w, h, rgb) {
  for (let y = Math.max(0, y0); y < Math.min(H, y0 + h); y++) {
    for (let x = Math.max(0, x0); x < Math.min(W, x0 + w); x++) {
      const o = (y * W + x) * 4;
      l[o] = rgb[0];
      l[o + 1] = rgb[1];
      l[o + 2] = rgb[2];
      l[o + 3] = 255;
    }
  }
}

function text(l, s, x, y, rgb, scale = 1, maxW = Infinity) {
  s = String(s ?? '');
  const fit = Math.floor((maxW + scale) / (6 * scale));
  if (s.length > fit) s = `${s.slice(0, Math.max(0, fit - 2))}..`;
  for (let i = 0; i < s.length; i++) {
    const bits = glyphBits(s[i]);
    for (let b = 0; b < 35; b++) {
      if (bits[b]) {
        fill(l, x + (i * 6 + (b % 5)) * scale, y + Math.floor(b / 5) * scale, scale, scale, rgb);
      }
    }
  }
}

function corner(l, x, y, k) {
  fill(l, x, y, 7, 7, SLATE_LO);
  for (let t = 0; t < 4; t++) {
    fill(l, x + (t & 1) * 4, y + (t >> 1) * 4, 3, 3, TILES[(k + t) % TILES.length]);
  }
}

function placeholder(l, title = '') {
  let h = 7;
  for (const ch of String(title)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const { shotX, shotY, shotW, shotH } = LABEL;
  for (let y = 0; y < shotH; y++) {
    const t = y / shotH;
    fill(l, shotX, shotY + y, shotW, 1, [
      Math.round(0x5a + (0xc8 - 0x5a) * t),
      Math.round(0x8f + (0xe0 - 0x8f) * t),
      Math.round(0xd6 + (0xf0 - 0xd6) * t),
    ]);
  }
  for (let ty = 0; ty < 4; ty++) {
    for (let tx = 0; tx < 20; tx++) {
      const k = (h >>> ((tx + ty * 3) % 24)) + tx * 7 + ty * 13;
      fill(l, shotX + tx * 12, shotY + 87 + ty * 12, 11, 11, TILES[k % TILES.length]);
    }
  }
}

/**
 * Area-averaged center-crop + downscale of arbitrary source RGBA into the 240x135 cover window.
 */
function blitScreenshot(dst, srcRgba, srcW, srcH) {
  const { shotX, shotY, shotW, shotH } = LABEL;
  const targetAspect = shotW / shotH;
  const srcAspect = srcW / srcH;

  let cropX = 0;
  let cropY = 0;
  let cropW = srcW;
  let cropH = srcH;

  if (Math.abs(srcAspect - targetAspect) > 0.01) {
    if (srcAspect > targetAspect) {
      cropW = Math.round(srcH * targetAspect);
      cropX = Math.floor((srcW - cropW) / 2);
    } else {
      cropH = Math.round(srcW / targetAspect);
      cropY = Math.floor((srcH - cropH) / 2);
    }
  }

  for (let y = 0; y < shotH; y++) {
    const sy0 = cropY + Math.floor((y * cropH) / shotH);
    const sy1 = Math.max(sy0 + 1, Math.min(srcH, cropY + Math.floor(((y + 1) * cropH) / shotH)));
    for (let x = 0; x < shotW; x++) {
      const sx0 = cropX + Math.floor((x * cropW) / shotW);
      const sx1 = Math.max(sx0 + 1, Math.min(srcW, cropX + Math.floor(((x + 1) * cropW) / shotW)));
      let r = 0, g = 0, b = 0, count = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const s = (sy * srcW + sx) * 4;
          r += srcRgba[s];
          g += srcRgba[s + 1];
          b += srcRgba[s + 2];
          count++;
        }
      }
      const d = ((shotY + y) * W + (shotX + x)) * 4;
      dst[d] = Math.round(r / count);
      dst[d + 1] = Math.round(g / count);
      dst[d + 2] = Math.round(b / count);
      dst[d + 3] = 255;
    }
  }
}

/**
 * Generate a 256x256 RGBA Tessera cartridge label.
 * `frameInput` may be null, `{ rgba, width, height }`, or a flat RGBA buffer (768x432 or 256x256).
 */
export function makeLabel(frameInput, meta = {}) {
  const l = new Uint8ClampedArray(W * H * 4);
  fill(l, 0, 0, W, H, SLATE);

  // Frame lines & mosaic corners
  fill(l, 8, 2, 240, 1, SLATE_HI);
  fill(l, 8, 253, 240, 1, SLATE_HI);
  fill(l, 2, 8, 1, 240, SLATE_HI);
  fill(l, 253, 8, 1, 240, SLATE_HI);
  corner(l, 0, 0, 0);
  corner(l, 249, 0, 1);
  corner(l, 0, 249, 2);
  corner(l, 249, 249, 3);

  const { shotX, shotY, shotW, shotH } = LABEL;
  fill(l, shotX - 1, shotY - 1, shotW + 2, shotH + 2, SLATE_LO);

  let srcRgba = null;
  let srcW = 0;
  let srcH = 0;
  if (frameInput && frameInput.rgba && frameInput.width && frameInput.height) {
    srcRgba = frameInput.rgba;
    srcW = frameInput.width;
    srcH = frameInput.height;
  } else if (frameInput && frameInput.length === 768 * 432 * 4) {
    srcRgba = frameInput;
    srcW = 768;
    srcH = 432;
  } else if (frameInput && frameInput.length === W * H * 4) {
    srcRgba = frameInput;
    srcW = W;
    srcH = H;
  }

  if (srcRgba && srcW > 0 && srcH > 0) {
    blitScreenshot(l, srcRgba, srcW, srcH);
  } else {
    placeholder(l, meta.title || meta.id || '');
  }

  const title = (meta.title || meta.id || 'Untitled').trim();
  text(l, title, LABEL.titleX, LABEL.titleY, INK, 2, 240);
  if (meta.author) {
    text(l, `by ${String(meta.author).trim()}`, LABEL.authorX, LABEL.authorY, INK_DIM, 1, 240);
  }

  // Bottom mosaic accent strip & TESSERA maker's mark
  for (let i = 0; i < 12; i++) {
    fill(l, 8 + i * 6, 236, 5, 5, TILES[i % TILES.length]);
  }
  text(l, 'TESSERA', 248 - 41, 234, INK_DIM, 1);
  return l;
}

export async function createPictureCart(cartText, frameInput, meta) {
  const label = makeLabel(frameInput, meta);
  const packed = await packCart(cartText, label);
  return encodePng(packed, W, H);
}
