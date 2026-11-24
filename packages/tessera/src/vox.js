import fs from 'node:fs';
import path from 'node:path';
import { parseVox, convertMultiVox, formatPaletteSection } from './cart/vox.js';
import { parseCart } from './cart/tess.js';

export function formatModelText(m) {
  const opts = [];
  if (m.frames && m.frames !== 1) opts.push(`frames=${m.frames}`);
  const defaultPivot = [Math.floor(m.w / 2), Math.floor(m.d / 2), 0];
  if (m.pivot && m.pivot.some((v, i) => v !== defaultPivot[i])) opts.push(`pivot=${m.pivot.join(',')}`);
  const lines = [`${m.id} ${m.w}x${m.d}x${m.h}${opts.length ? ` ${opts.join(' ')}` : ''}`];
  for (let f = 0; f < (m.frames || 1); f++) {
    if (f) lines.push('frame');
    const data = m.data[f];
    for (let z = 0; z < m.h; z++) {
      if (z) lines.push('');
      for (let y = 0; y < m.d; y++) {
        const row = [];
        for (let x = 0; x < m.w; x++) {
          const c = data[x + m.w * y + m.w * m.d * z];
          row.push(c ? c.toString(16).padStart(2, '0') : '..');
        }
        lines.push(row.join(' '));
      }
    }
  }
  return lines.join('\n');
}

export function importVoxCli(voxInput, options = {}) {
  const paths = Array.isArray(voxInput) ? voxInput : [voxInput];
  if (!paths.length) {
    throw new Error('No .vox files specified');
  }

  let pivot = null;
  if (options.pivot) {
    pivot = String(options.pivot).split(',').map(n => parseInt(n.trim(), 10));
    if (pivot.length !== 3 || pivot.some(n => Number.isNaN(n))) {
      throw new Error(`Invalid pivot: expected 'x,y,z', got '${options.pivot}'`);
    }
  }

  const parsedList = [];
  for (let i = 0; i < paths.length; i++) {
    const voxPath = paths[i];
    const fullPath = path.resolve(process.cwd(), voxPath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found: ${voxPath}`);
    }
    const buf = fs.readFileSync(fullPath);
    const parsed = parseVox(buf);
    const modelName = (paths.length === 1 && options.name)
      ? options.name
      : path.basename(voxPath, path.extname(voxPath)).replace(/[^a-zA-Z0-9_]/g, '_');

    parsedList.push({
      id: modelName,
      models: parsed.models,
      palette: parsed.palette,
      pivot,
    });
  }

  let existingPalette = null;
  if (options.pal) {
    const palPath = path.resolve(process.cwd(), options.pal);
    if (!fs.existsSync(palPath)) {
      throw new Error(`Palette cart file not found: ${options.pal}`);
    }
    const cartText = fs.readFileSync(palPath, 'utf8');
    const cart = parseCart(cartText);
    existingPalette = cart.palette;
  }

  const maxColors = options.maxColors ? parseInt(options.maxColors, 10) : 255;
  const extendPalette = options.extendPalette !== undefined ? !!options.extendPalette : (options.pal ? false : true);

  const result = convertMultiVox(parsedList, {
    maxColors,
    existingPalette,
    extendPalette,
  });

  const modelChunks = result.models.map(m => formatModelText(m));
  const modelsText = modelChunks.join('\n\n');
  const palText = formatPaletteSection(result.palette);

  let outputText = modelsText;
  if (options.genPal) {
    outputText = `${palText}\n\n__models__\n${modelsText}`;
  }

  if (options.out) {
    const outPath = path.resolve(process.cwd(), options.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, outputText + '\n');
  }

  return {
    ok: true,
    text: outputText,
    modelsText,
    palText,
    modelCount: result.models.length,
    paletteCount: result.palette.size,
    uniqueColors: result.uniqueColors,
    models: result.models.map(m => ({
      id: m.id,
      size: [m.w, m.d, m.h],
    })),
  };
}

