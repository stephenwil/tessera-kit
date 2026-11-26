import { assembleProject } from './project.js';
import fs from 'node:fs';
import path from 'node:path';
import { parseCart } from './cart/tess.js';
import { packCart, unpackCart, CAPACITY } from './cart/png.js';
import { decodePng, encodePng } from './cart/pngfile.js';
import { makeLabel } from './shell/label.js';
import { renderCartPreview } from './preview.js';

export async function packCartCli(cartPath, labelPath = null, outputPath = null, options = {}) {
  let fullCartPath = path.resolve(process.cwd(), cartPath || '.');
  let cartText = null;
  let sourceTarget = cartPath || '.';

  // Check if target is a project directory or tessera.json
  const isDir = fs.existsSync(fullCartPath) && fs.statSync(fullCartPath).isDirectory();
  const manifestInDir = isDir && fs.existsSync(path.join(fullCartPath, 'tessera.json'));
  const isManifest = !isDir && fullCartPath.endsWith('tessera.json') && fs.existsSync(fullCartPath);

  if (manifestInDir || isManifest) {
    const projectDir = isManifest ? path.dirname(fullCartPath) : fullCartPath;
    sourceTarget = projectDir;
    cartText = assembleProject(projectDir);
    const parsed = parseCart(cartText);
    const id = parsed.meta?.id || 'cart';
    fullCartPath = path.join(projectDir, 'dist', id + '.tess');
    fs.mkdirSync(path.dirname(fullCartPath), { recursive: true });
    fs.writeFileSync(fullCartPath, cartText, 'utf8');
  } else if (fs.existsSync(fullCartPath) && fs.statSync(fullCartPath).isFile()) {
    sourceTarget = fullCartPath;
    cartText = fs.readFileSync(fullCartPath, 'utf8');
  } else if (fs.existsSync(path.resolve(process.cwd(), 'tessera.json'))) {
    // Current directory is a project
    sourceTarget = process.cwd();
    cartText = assembleProject(process.cwd());
    const parsed = parseCart(cartText);
    const id = parsed.meta?.id || 'cart';
    const projectDir = process.cwd();
    fullCartPath = path.join(projectDir, 'dist', id + '.tess');
    fs.mkdirSync(path.dirname(fullCartPath), { recursive: true });
    fs.writeFileSync(fullCartPath, cartText, 'utf8');
  } else {
    throw new Error(`Cart file or tessera.json not found: ${cartPath}`);
  }

  let meta = {};
  try {
    const parsed = parseCart(cartText);
    meta = parsed.meta || {};
  } catch {}

  let labelRgba = null;
  let labelSource = 'placeholder';
  let labelWarning = null;

  if (labelPath) {
    const fullLabelPath = path.resolve(process.cwd(), labelPath);
    if (!fs.existsSync(fullLabelPath)) {
      throw new Error(`Label file not found: ${labelPath}`);
    }
    const labelBytes = fs.readFileSync(fullLabelPath);
    const decoded = await decodePng(labelBytes);
    if (decoded.width === 256 && decoded.height === 256) {
      // Exact 256x256 custom label used verbatim
      labelRgba = decoded.rgba;
      labelSource = 'custom-256';
    } else {
      // Any other PNG resolution (e.g. 768x432 preview screenshot) is framed into the official Tessera label
      labelRgba = makeLabel(decoded, meta);
      labelSource = 'framed-screenshot';
    }
  } else if (options.autoLabel) {
    try {
      const preview = await renderCartPreview(sourceTarget, {
        frames: options.frames ?? 5,
        keys: options.keys,
        quality: options.quality,
        chromePath: options.chromePath,
        screenshot: true,
      });
      if (preview.pngBase64) {
        const decoded = await decodePng(Buffer.from(preview.pngBase64, 'base64'));
        labelRgba = makeLabel(decoded, meta);
        labelSource = 'auto-preview';
      } else {
        labelWarning = 'Headless preview did not return a PNG buffer; fell back to placeholder label.';
        labelRgba = makeLabel(null, meta);
      }
    } catch (err) {
      labelWarning = `Auto-label preview unavailable (${err.message}); fell back to placeholder label.`;
      labelRgba = makeLabel(null, meta);
    }
  } else {
    labelRgba = makeLabel(null, meta);
  }

  const packedRgba = await packCart(cartText, labelRgba);
  const pngBytes = await encodePng(packedRgba, 256, 256);

  const out = outputPath
    ? path.resolve(process.cwd(), outputPath)
    : fullCartPath.replace(/\.tess$/, '') + '.tess.png';

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, pngBytes);

  return {
    ok: true,
    outputPath: out,
    fileSize: pngBytes.length,
    cartLength: cartText.length,
    capacity: CAPACITY,
    labelSource,
    labelWarning,
    pngBase64: Buffer.from(pngBytes).toString('base64'),
  };
}

export async function unpackCartCli(pngPath, outputPath = null) {
  const fullPngPath = path.resolve(process.cwd(), pngPath);
  if (!fs.existsSync(fullPngPath)) {
    throw new Error(`Picture cart not found: ${pngPath}`);
  }

  const bytes = fs.readFileSync(fullPngPath);
  const decoded = await decodePng(bytes);
  if (decoded.width !== 256 || decoded.height !== 256) {
    throw new Error(`Invalid picture cart dimensions: ${decoded.width}x${decoded.height} (expected 256x256)`);
  }

  const cartText = await unpackCart(decoded.rgba);
  const out = outputPath
    ? path.resolve(process.cwd(), outputPath)
    : fullPngPath.replace(/\.tess\.png$|\.png$/, '.tess');

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, cartText);

  return {
    ok: true,
    outputPath: out,
    cartText,
  };
}
