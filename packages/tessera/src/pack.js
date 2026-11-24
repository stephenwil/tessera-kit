import { assembleProject } from "./project.js";
import fs from 'node:fs';
import path from 'node:path';
import { parseCart } from './cart/tess.js';
import { packCart, unpackCart, CAPACITY } from './cart/png.js';
import { decodePng, encodePng } from './cart/pngfile.js';
import { makeLabel } from './shell/label.js';

export async function packCartCli(cartPath, labelPath = null, outputPath = null) {
  let fullCartPath = path.resolve(process.cwd(), cartPath || ".");
  let cartText = null;

  // Check if target is a project directory or tessera.json
  const isDir = fs.existsSync(fullCartPath) && fs.statSync(fullCartPath).isDirectory();
  const manifestInDir = isDir && fs.existsSync(path.join(fullCartPath, "tessera.json"));
  const isManifest = !isDir && fullCartPath.endsWith("tessera.json") && fs.existsSync(fullCartPath);

  if (manifestInDir || isManifest) {
    const projectDir = isManifest ? path.dirname(fullCartPath) : fullCartPath;
    cartText = assembleProject(projectDir);
    const parsed = parseCart(cartText);
    const id = parsed.meta?.id || "cart";
    fullCartPath = path.join(projectDir, "dist", id + ".tess");
    fs.mkdirSync(path.dirname(fullCartPath), { recursive: true });
    fs.writeFileSync(fullCartPath, cartText, "utf8");
  } else if (fs.existsSync(fullCartPath) && fs.statSync(fullCartPath).isFile()) {
    cartText = fs.readFileSync(fullCartPath, "utf8");
  } else if (fs.existsSync(path.resolve(process.cwd(), "tessera.json"))) {
    // Current directory is a project
    cartText = assembleProject(process.cwd());
    const parsed = parseCart(cartText);
    const id = parsed.meta?.id || "cart";
    const projectDir = process.cwd();
    fullCartPath = path.join(projectDir, "dist", id + ".tess");
    fs.mkdirSync(path.dirname(fullCartPath), { recursive: true });
    fs.writeFileSync(fullCartPath, cartText, "utf8");
  } else {
    throw new Error(`Cart file or tessera.json not found: ${cartPath}`);
  }
  let labelRgba = null;

  if (labelPath) {
    const fullLabelPath = path.resolve(process.cwd(), labelPath);
    if (!fs.existsSync(fullLabelPath)) {
      throw new Error(`Label file not found: ${labelPath}`);
    }
    const labelBytes = fs.readFileSync(fullLabelPath);
    const decoded = await decodePng(labelBytes);
    if (decoded.width !== 256 || decoded.height !== 256) {
      throw new Error(`Label image must be exactly 256x256 pixels, got ${decoded.width}x${decoded.height}`);
    }
    labelRgba = decoded.rgba;
  } else {
    // Generate standard stylized cartridge label
    let meta = {};
    try {
      const parsed = parseCart(cartText);
      meta = parsed.meta || {};
    } catch {}
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
