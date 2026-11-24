import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCart } from './cart/tess.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function exportHtmlCli(cartPath, outputPath = null, options = {}) {
  const fullCartPath = path.resolve(process.cwd(), cartPath);
  if (!fs.existsSync(fullCartPath)) {
    throw new Error(`Cart file not found: ${cartPath}`);
  }

  const cartText = fs.readFileSync(fullCartPath, 'utf8');

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
