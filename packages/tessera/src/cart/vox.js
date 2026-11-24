// MagicaVoxel .vox file parser and palette quantization for Tessera.
// Specification: https://github.com/ephtracy/voxel-model/blob/master/MagicaVoxel-file-format_v105.txt

// Default MagicaVoxel palette (0x00000000 plus 255 RGBA entries), used when RGBA chunk is absent.
// Encoded as 256 uint32s or standard palette.
export function defaultVoxPalette() {
  const pal = new Uint32Array(256);
  // Default fallback gradient if RGBA chunk is missing in old .vox files
  for (let i = 1; i < 256; i++) {
    const c = i & 0xff;
    pal[i] = (255 << 24) | (c << 16) | (c << 8) | c;
  }
  return pal;
}

function readString(view, offset, len) {
  let s = '';
  for (let i = 0; i < len; i++) {
    s += String.fromCharCode(view.getUint8(offset + i));
  }
  return s;
}

/**
 * Parses a binary MagicaVoxel .vox ArrayBuffer or Uint8Array.
 * Returns { models: [{ w, d, h, voxels: [{x, y, z, colorIndex, r, g, b}] }], palette: [[r, g, b], ...] }
 */
export function parseVox(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (bytes.byteLength < 8) {
    throw new Error('File too short to be a valid VOX file');
  }

  const magic = readString(view, 0, 4);
  if (magic !== 'VOX ') {
    throw new Error(`Invalid VOX magic '${magic}' (expected 'VOX ')`);
  }

  const version = view.getUint32(4, true);

  // Main chunk
  if (readString(view, 8, 4) !== 'MAIN') {
    throw new Error('Missing MAIN chunk in VOX file');
  }

  const mainContentSize = view.getUint32(12, true);
  const mainChildrenSize = view.getUint32(16, true);

  let offset = 20 + mainContentSize;
  const end = offset + mainChildrenSize;

  const sizes = []; // [{ w, d, h }]
  const xyziList = []; // [ Uint8Array of [x, y, z, i] ]
  let palette = null; // Array of [r, g, b] (indices 1..255)

  while (offset + 12 <= end && offset + 12 <= bytes.byteLength) {
    const chunkId = readString(view, offset, 4);
    const contentSize = view.getUint32(offset + 4, true);
    const childrenSize = view.getUint32(offset + 8, true);
    const chunkDataOffset = offset + 12;

    if (chunkId === 'SIZE') {
      const x = view.getUint32(chunkDataOffset, true);
      const y = view.getUint32(chunkDataOffset + 4, true);
      const z = view.getUint32(chunkDataOffset + 8, true);
      // MagicaVoxel X=w, Y=d, Z=h in Tessera convention
      sizes.push({ w: x, d: y, h: z });
    } else if (chunkId === 'XYZI') {
      const numVoxels = view.getUint32(chunkDataOffset, true);
      const voxels = [];
      let p = chunkDataOffset + 4;
      for (let v = 0; v < numVoxels; v++) {
        const vx = view.getUint8(p);
        const vy = view.getUint8(p + 1);
        const vz = view.getUint8(p + 2);
        const colorIdx = view.getUint8(p + 3); // 1-based palette index
        voxels.push({ x: vx, y: vy, z: vz, colorIdx });
        p += 4;
      }
      xyziList.push(voxels);
    } else if (chunkId === 'RGBA') {
      // 256 RGBA colors
      palette = [];
      let p = chunkDataOffset;
      for (let i = 0; i < 256; i++) {
        const r = view.getUint8(p);
        const g = view.getUint8(p + 1);
        const b = view.getUint8(p + 2);
        const a = view.getUint8(p + 3);
        palette.push([r, g, b, a]);
        p += 4;
      }
    }

    offset += 12 + contentSize + childrenSize;
  }

  // Combine sizes and xyzi into model objects
  const models = [];
  const count = Math.min(sizes.length, xyziList.length);
  for (let m = 0; m < count; m++) {
    const { w, d, h } = sizes[m];
    models.push({
      w, d, h,
      voxels: xyziList[m],
    });
  }

  return {
    version,
    models,
    palette,
  };
}

/**
 * Finds the closest color index in the target palette using Euclidean distance.
 * targetPalette is a Map<number, [r, g, b]> or Array of [r, g, b].
 */
export function matchPaletteColor(rgb, targetPalette) {
  let bestIdx = 1;
  let bestDist = Infinity;
  const [r1, g1, b1] = rgb;

  const entries = targetPalette instanceof Map
    ? targetPalette.entries()
    : targetPalette.map((col, idx) => [idx, col]).filter(([, col]) => col && col.length >= 3);

  for (const [idx, col] of entries) {
    if (idx === 0) continue; // 0 is transparent/empty
    const dr = r1 - col[0];
    const dg = g1 - col[1];
    const db = b1 - col[2];
    const dist = dr * dr + dg * dg + db * db;
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = idx;
      if (dist === 0) break;
    }
  }

  return bestIdx;
}

export function packRgb(r, g, b) {
  return (((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff)) >>> 0;
}

export function unpackRgb(packed) {
  return [(packed >>> 16) & 0xff, (packed >>> 8) & 0xff, packed & 0xff];
}

/**
 * Quantizes an array or Map of RGB colors with frequencies down to at most maxColors (1..255).
 * Uses the Median Cut algorithm with voxel frequency weighting.
 * Returns { palette: Map<number, [r, g, b]>, mapping: Map<number, number> }
 */
export function quantizePalette(colorCounts, maxColors = 255) {
  const cap = Math.max(1, Math.min(255, Math.floor(maxColors)));
  const entries = [];
  if (colorCounts instanceof Map) {
    for (const [packed, count] of colorCounts.entries()) {
      const [r, g, b] = unpackRgb(packed);
      entries.push({ r, g, b, count, packed });
    }
  } else if (Array.isArray(colorCounts)) {
    for (const item of colorCounts) {
      if (Array.isArray(item)) {
        const [r, g, b] = item;
        entries.push({ r, g, b, count: 1, packed: packRgb(r, g, b) });
      } else if (item && typeof item === 'object') {
        const { r, g, b, count = 1 } = item;
        entries.push({ r, g, b, count, packed: packRgb(r, g, b) });
      }
    }
  }

  const palette = new Map();
  const mapping = new Map();

  if (entries.length === 0) {
    return { palette, mapping };
  }

  // If unique colors already fit within budget, no quantization is needed.
  if (entries.length <= cap) {
    entries.forEach((e, i) => {
      const idx = i + 1;
      palette.set(idx, [e.r, e.g, e.b]);
      mapping.set(e.packed, idx);
    });
    return { palette, mapping };
  }

  function getBoxRange(box) {
    let minR = 255, maxR = 0, minG = 255, maxG = 0, minB = 255, maxB = 0;
    for (const e of box) {
      if (e.r < minR) minR = e.r;
      if (e.r > maxR) maxR = e.r;
      if (e.g < minG) minG = e.g;
      if (e.g > maxG) maxG = e.g;
      if (e.b < minB) minB = e.b;
      if (e.b > maxB) maxB = e.b;
    }
    const rRange = maxR - minR;
    const gRange = maxG - minG;
    const bRange = maxB - minB;
    const maxRange = Math.max(rRange, gRange, bRange);
    let channel = 'r';
    if (gRange === maxRange) channel = 'g';
    else if (bRange === maxRange) channel = 'b';
    return { rRange, gRange, bRange, maxRange, channel };
  }

  const boxes = [entries];
  while (boxes.length < cap) {
    let bestIdx = -1;
    let bestRange = -1;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].length > 1) {
        const info = getBoxRange(boxes[i]);
        if (info.maxRange > bestRange) {
          bestRange = info.maxRange;
          bestIdx = i;
        }
      }
    }
    if (bestIdx === -1 || bestRange === 0) break;

    const boxToSplit = boxes.splice(bestIdx, 1)[0];
    const { channel } = getBoxRange(boxToSplit);

    boxToSplit.sort((a, b) => a[channel] - b[channel]);

    let totalCount = 0;
    for (const e of boxToSplit) totalCount += e.count;
    const halfCount = totalCount / 2;
    let runningCount = 0;
    let splitIdx = 1;
    for (let i = 0; i < boxToSplit.length - 1; i++) {
      runningCount += boxToSplit[i].count;
      if (runningCount >= halfCount) {
        splitIdx = i + 1;
        break;
      }
    }
    splitIdx = Math.max(1, Math.min(boxToSplit.length - 1, splitIdx));

    boxes.push(boxToSplit.slice(0, splitIdx));
    boxes.push(boxToSplit.slice(splitIdx));
  }

  boxes.forEach((box, i) => {
    const palIdx = i + 1;
    let sumR = 0, sumG = 0, sumB = 0, count = 0;
    for (const e of box) {
      sumR += e.r * e.count;
      sumG += e.g * e.count;
      sumB += e.b * e.count;
      count += e.count;
    }
    const repR = Math.round(sumR / count);
    const repG = Math.round(sumG / count);
    const repB = Math.round(sumB / count);
    palette.set(palIdx, [repR, repG, repB]);

    for (const e of box) {
      mapping.set(e.packed, palIdx);
    }
  });

  return { palette, mapping };
}

/**
 * Builds a unified shared palette across multiple parsed VOX files/models.
 * Guarantees total palette size <= maxColors (strict <= 255).
 */
export function buildMultiModelPalette(parsedList, options = {}) {
  const maxColors = Math.max(1, Math.min(255, Math.floor(options.maxColors ?? 255)));
  const existingPalette = options.existingPalette || null;
  const extendPalette = !!options.extendPalette;

  const colorCounts = new Map();
  for (const item of parsedList) {
    const pal = item.palette;
    for (const model of item.models) {
      for (const v of model.voxels) {
        if (!v || v.colorIdx === 0) continue;
        let r, g, b;
        if (pal && pal[v.colorIdx - 1]) {
          [r, g, b] = pal[v.colorIdx - 1];
        } else {
          r = g = b = v.colorIdx & 0xff;
        }
        const packed = packRgb(r, g, b);
        colorCounts.set(packed, (colorCounts.get(packed) || 0) + 1);
      }
    }
  }

  const uniqueColors = colorCounts.size;

  if (existingPalette && !extendPalette) {
    const colorRemap = new Map();
    for (const packed of colorCounts.keys()) {
      const rgb = unpackRgb(packed);
      const matched = matchPaletteColor(rgb, existingPalette);
      colorRemap.set(packed, matched);
    }
    return { palette: existingPalette, colorRemap, uniqueColors };
  }

  if (existingPalette && extendPalette) {
    const palette = new Map(existingPalette);
    const colorRemap = new Map();
    const unmatched = new Map();

    const existingRgbMap = new Map();
    for (const [idx, col] of existingPalette.entries()) {
      if (idx > 0 && col) {
        existingRgbMap.set(packRgb(col[0], col[1], col[2]), idx);
      }
    }

    for (const [packed, count] of colorCounts.entries()) {
      if (existingRgbMap.has(packed)) {
        colorRemap.set(packed, existingRgbMap.get(packed));
      } else {
        unmatched.set(packed, count);
      }
    }

    const freeSlots = [];
    for (let i = 1; i <= maxColors; i++) {
      if (!palette.has(i)) freeSlots.push(i);
    }

    if (unmatched.size <= freeSlots.length) {
      let slotIdx = 0;
      for (const packed of unmatched.keys()) {
        const slot = freeSlots[slotIdx++];
        const rgb = unpackRgb(packed);
        palette.set(slot, rgb);
        colorRemap.set(packed, slot);
      }
    } else if (freeSlots.length > 0) {
      const q = quantizePalette(unmatched, freeSlots.length);
      const subSlotMap = new Map();
      let slotIdx = 0;
      for (const [subIdx, col] of q.palette.entries()) {
        const slot = freeSlots[slotIdx++];
        palette.set(slot, col);
        subSlotMap.set(subIdx, slot);
      }
      for (const [packed, subIdx] of q.mapping.entries()) {
        colorRemap.set(packed, subSlotMap.get(subIdx));
      }
    } else {
      for (const packed of unmatched.keys()) {
        const rgb = unpackRgb(packed);
        const matched = matchPaletteColor(rgb, palette);
        colorRemap.set(packed, matched);
      }
    }

    return { palette, colorRemap, uniqueColors };
  }

  const { palette, mapping } = quantizePalette(colorCounts, maxColors);
  return { palette, colorRemap: mapping, uniqueColors };
}

/**
 * Converts multiple parsed VOX files/models to Tessera format sharing a unified palette budget.
 */
export function convertMultiVox(parsedList, options = {}) {
  const { palette, colorRemap, uniqueColors } = buildMultiModelPalette(parsedList, options);
  const models = [];

  for (const item of parsedList) {
    const baseId = item.id || 'model';
    const pal = item.palette;
    item.models.forEach((m, idx) => {
      const modelId = item.models.length > 1 ? `${baseId}_${idx}` : baseId;
      const modelObj = voxModelToTessera(m, modelId, palette, pal, colorRemap);
      if (item.pivot) modelObj.pivot = item.pivot;
      models.push(modelObj);
    });
  }

  return {
    models,
    palette,
    colorRemap,
    uniqueColors,
  };
}

/**
 * Formats a palette Map into a valid __pal__ cart text section.
 */
export function formatPaletteSection(palette) {
  const entries = palette instanceof Map ? Array.from(palette.entries()) : Object.entries(palette);
  entries.sort((a, b) => Number(a[0]) - Number(b[0]));
  const lines = ['__pal__'];
  for (const [idx, col] of entries) {
    const numIdx = Number(idx);
    if (!Number.isInteger(numIdx) || numIdx < 1 || numIdx > 255 || !col) continue;
    const hex = col.slice(0, 3).map(c => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('');
    lines.push(`${numIdx} ${hex}`);
  }
  return lines.join('\n');
}

/**
 * Converts a parsed VOX model into a Tessera cart model definition:
 * { id, w, d, h, frames: 1, pivot: [floor(w/2), floor(d/2), 0], data: [ Uint8Array(w * d * h) ] }
 */
export function voxModelToTessera(voxModel, id = 'model', targetPalette = new Map(), voxPalette = null, colorRemap = null) {
  const { w, d, h, voxels } = voxModel;
  const data = new Uint8Array(w * d * h);

  for (const v of voxels) {
    let color = 1;
    if (voxPalette && voxPalette[v.colorIdx - 1]) {
      const rgb = voxPalette[v.colorIdx - 1];
      const packed = packRgb(rgb[0], rgb[1], rgb[2]);
      if (colorRemap && colorRemap.has(packed)) {
        color = colorRemap.get(packed);
      } else {
        color = matchPaletteColor(rgb, targetPalette);
      }
    } else {
      color = Math.max(1, Math.min(255, v.colorIdx));
    }

    if (v.x >= 0 && v.x < w && v.y >= 0 && v.y < d && v.z >= 0 && v.z < h) {
      data[v.x + w * v.y + w * d * v.z] = color;
    }
  }

  return {
    id,
    w,
    d,
    h,
    frames: 1,
    pivot: [Math.floor(w / 2), Math.floor(d / 2), 0],
    data: [data],
  };
}

