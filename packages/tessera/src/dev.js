import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { assembleProject } from './project.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function startDevCli(targetPath = '.', options = {}) {
  const fullTarget = path.resolve(process.cwd(), targetPath);
  const isFile = fs.existsSync(fullTarget) && fs.statSync(fullTarget).isFile();
  const projectDir = isFile ? path.dirname(fullTarget) : fullTarget;
  const isTesseraJson = !isFile && fs.existsSync(path.join(fullTarget, 'tessera.json'));

  function getCartText() {
    try {
      if (isTesseraJson) {
        return assembleProject(fullTarget);
      }
      if (isFile) {
        return fs.readFileSync(fullTarget, 'utf8');
      }
      // Check if there is a single .tess file in the directory
      const files = fs.readdirSync(fullTarget);
      const tessFile = files.find(f => f.endsWith('.tess'));
      if (tessFile) {
        return fs.readFileSync(path.join(fullTarget, tessFile), 'utf8');
      }
      throw new Error(`No tessera.json or .tess file found in ${fullTarget}`);
    } catch (e) {
      console.error(`[tessera dev] Failed to assemble cart: ${e.message}`);
      return null;
    }
  }

  // Find base runner html
  const runnerCandidates = [
    path.resolve(__dirname, "../template/runner.html"),
    path.resolve(__dirname, "../../template/runner.html"),
    path.resolve(process.cwd(), "dist/tessera.html"),
  ];
  let runnerHtml = null;
  for (const c of runnerCandidates) {
    if (fs.existsSync(c)) {
      runnerHtml = fs.readFileSync(c, 'utf8');
      break;
    }
  }

  if (!runnerHtml) {
    runnerHtml = '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>Tessera Dev</title>\n</head>\n<body>\n</body>\n</html>';
  }

  const sseClients = new Set();

  function broadcastCart() {
    const text = getCartText();
    if (!text) return;
    const payload = JSON.stringify({ type: 'cart', text });
    const msg = `data: ${payload}\n\n`;
    for (const res of sseClients) {
      try {
        res.write(msg);
      } catch {}
    }
  }

  // File watcher with debounce
  let debounceTimer = null;
  let watcher = null;
  const watchDir = isFile ? fullTarget : projectDir;
  try {
    watcher = fs.watch(watchDir, { recursive: true }, (_event, filename) => {
      if (filename && (filename.startsWith('.') || filename.includes('node_modules') || filename.includes('dist'))) {
        return;
      }
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        broadcastCart();
      }, 100);
    });
  } catch {}

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (url.pathname === '/live-reload') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });
      res.write('data: {"type":"connected"}\n\n');
      sseClients.add(res);
      req.on('close', () => sseClients.delete(res));
      return;
    }

    if (url.pathname === '/cart.tess') {
      const text = getCartText();
      if (!text) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Failed to load cart');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(text);
      return;
    }

    // Root path: serve runner html with ?cart=/cart.tess&dev=1 embedded
    if (url.pathname === '/' || url.pathname === '/index.html') {
      const cartText = getCartText() || '';
      const scriptTag = `\n<script id="tessera-cart" type="text/plain">\n${cartText}\n</script>\n<script>{ const q = new URLSearchParams(location.search); q.set('dev', '1'); window.history.replaceState({}, '', '/?' + q); }</script>\n`;
      let injected = runnerHtml;
      if (injected.includes('</body>')) {
        injected = injected.replace('</body>', `${scriptTag}</body>`);
      } else {
        injected += scriptTag;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(injected);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });

  const port = options.port ?? 3000;
  const host = options.host || '0.0.0.0';

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, host, () => {
      resolve({
        server,
        port,
        host,
        close: () => { clearTimeout(debounceTimer); try { watcher?.close(); } catch {} server.close(); },
      });
    });
  });
}
