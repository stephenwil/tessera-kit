import { assembleProject } from "./project.js";
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCart } from './cart/tess.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function exportHtmlCli(cartPath, outputPath = null, options = {}) {
  let fullCartPath = path.resolve(process.cwd(), cartPath || ".");
  let cartText = null;

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

  // Verify cart is valid
  parseCart(cartText);

  // Locate the single-file offline player HTML template
  const candidates = [
    options.template,
    path.resolve(__dirname, "../template/runner.html"),
    path.resolve(__dirname, "../../template/runner.html"),
    path.resolve(process.cwd(), "dist/tessera.html"),
  ].filter(Boolean);

  let templateHtml = null;
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      templateHtml = fs.readFileSync(c, 'utf8');
      break;
    }
  }

  if (!templateHtml) {
    templateHtml = '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>Tessera</title>\n</head>\n<body>\n</body>\n</html>';
  }

  // Inject the embedded cart script
  const scriptTag = `\n<script id="tessera-cart" type="text/plain">\n${cartText}\n</script>\n`;
  let finalHtml;
  if (templateHtml.includes('</body>')) {
    finalHtml = templateHtml.replace('</body>', `${scriptTag}</body>`);
  } else {
    finalHtml = templateHtml + scriptTag;
  }

  const out = outputPath
    ? path.resolve(process.cwd(), outputPath)
    : fullCartPath.replace(/\.tess$/, '') + '.html';

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, finalHtml, 'utf8');

  return {
    ok: true,
    outputPath: out,
    fileSize: Buffer.byteLength(finalHtml, 'utf8'),
  };
}
