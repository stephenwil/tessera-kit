import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { assembleProject } from './project.js';
import { parseCart } from './cart/tess.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Auto-detect a Chromium/Chrome/Edge binary on Linux, macOS, Windows, or Playwright's cache.
 */
export function findChromeExecutable(explicitPath = null) {
  const direct = [
    explicitPath,
    process.env.TESSERA_CHROME_PATH,
    process.env.CHROME_PATH,
    process.env.CHROMIUM_PATH,
  ].filter(Boolean);

  for (const p of direct) {
    if (fs.existsSync(p)) return p;
  }

  // 1. Check Playwright browser caches (prefer highest revision)
  const pwCacheDirs = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    path.join(os.homedir(), '.cache', 'ms-playwright'),
    path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright'),
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'ms-playwright') : null,
  ].filter(Boolean);

  for (const cacheDir of pwCacheDirs) {
    if (!fs.existsSync(cacheDir)) continue;
    let entries = [];
    try {
      entries = fs.readdirSync(cacheDir);
    } catch {
      continue;
    }
    const chromiumDirs = entries
      .filter((e) => /^chromium-\d+$/.test(e))
      .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));

    for (const dir of chromiumDirs) {
      const base = path.join(cacheDir, dir);
      const candidates = [
        path.join(base, 'chrome-linux64', 'chrome'),
        path.join(base, 'chrome-linux', 'chrome'),
        path.join(base, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
        path.join(base, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
        path.join(base, 'chrome-win64', 'chrome.exe'),
        path.join(base, 'chrome-win', 'chrome.exe'),
      ];
      for (const c of candidates) {
        if (fs.existsSync(c)) return c;
      }
    }
  }

  // 2. Check standard OS browser paths
  const systemPaths = [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  for (const p of systemPaths) {
    if (fs.existsSync(p)) return p;
  }

  return null;
}

/**
 * Minimal zero-dependency RFC 6455 WebSocket client over node:net for local Chrome DevTools Protocol.
 */
function connectCdp(wsUrl) {
  return new Promise((resolve, reject) => {
    const u = new URL(wsUrl);
    const host = u.hostname || '127.0.0.1';
    const port = Number(u.port || 80);
    const reqPath = `${u.pathname}${u.search}`;
    const wsKey = crypto.randomBytes(16).toString('base64');

    const socket = net.connect({ host, port });
    let upgraded = false;
    let buf = Buffer.alloc(0);
    let nextId = 1;
    const pending = new Map();
    const listeners = new Map();
    let fragChunks = [];

    const onError = (err) => {
      for (const p of pending.values()) p.reject(err);
      pending.clear();
      if (!upgraded) reject(err);
    };
    socket.on('error', onError);
    socket.on('close', () => {
      for (const p of pending.values()) p.reject(new Error('CDP WebSocket closed'));
      pending.clear();
    });

    function writeFrame(opcode, payloadBuf) {
      const mask = crypto.randomBytes(4);
      const len = payloadBuf.length;
      let header;
      if (len < 126) {
        header = Buffer.alloc(2 + 4);
        header[0] = 0x80 | opcode;
        header[1] = 0x80 | len;
        mask.copy(header, 2);
      } else if (len < 65536) {
        header = Buffer.alloc(4 + 4);
        header[0] = 0x80 | opcode;
        header[1] = 0x80 | 126;
        header.writeUInt16BE(len, 2);
        mask.copy(header, 4);
      } else {
        header = Buffer.alloc(10 + 4);
        header[0] = 0x80 | opcode;
        header[1] = 0x80 | 127;
        header.writeBigUInt64BE(BigInt(len), 2);
        mask.copy(header, 10);
      }
      const masked = Buffer.allocUnsafe(len);
      for (let i = 0; i < len; i++) {
        masked[i] = payloadBuf[i] ^ mask[i & 3];
      }
      socket.write(Buffer.concat([header, masked]));
    }

    function dispatchMessage(text) {
      let msg;
      try {
        msg = JSON.parse(text);
      } catch {
        return;
      }
      if (msg.id && pending.has(msg.id)) {
        const entry = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) {
          entry.reject(new Error(`CDP ${entry.method}: ${msg.error.message || JSON.stringify(msg.error)}`));
        } else {
          entry.resolve(msg.result);
        }
      } else if (msg.method) {
        const handlers = listeners.get(msg.method);
        if (handlers) {
          for (const fn of handlers) {
            try { fn(msg.params); } catch {}
          }
        }
      }
    }

    function consumeFrames() {
      while (buf.length >= 2) {
        const b0 = buf[0];
        const b1 = buf[1];
        const fin = (b0 & 0x80) !== 0;
        const opcode = b0 & 0x0f;
        const masked = (b1 & 0x80) !== 0;
        let payloadLen = b1 & 0x7f;
        let offset = 2;

        if (payloadLen === 126) {
          if (buf.length < 4) return;
          payloadLen = buf.readUInt16BE(2);
          offset = 4;
        } else if (payloadLen === 127) {
          if (buf.length < 10) return;
          payloadLen = Number(buf.readBigUInt64BE(2));
          offset = 10;
        }
        const maskOffset = offset;
        if (masked) offset += 4;
        if (buf.length < offset + payloadLen) return;

        let payload = buf.subarray(offset, offset + payloadLen);
        if (masked) {
          const out = Buffer.allocUnsafe(payloadLen);
          for (let i = 0; i < payloadLen; i++) {
            out[i] = payload[i] ^ buf[maskOffset + (i & 3)];
          }
          payload = out;
        } else {
          payload = Buffer.from(payload);
        }
        buf = buf.subarray(offset + payloadLen);

        if (opcode === 0x08) {
          socket.end();
          return;
        }
        if (opcode === 0x09) {
          writeFrame(0x0a, payload);
          continue;
        }
        if (opcode === 0x0a) continue;

        if (opcode === 0x01 || opcode === 0x02) {
          fragChunks = [payload];
          if (fin) {
            dispatchMessage(Buffer.concat(fragChunks).toString('utf8'));
            fragChunks = [];
          }
        } else if (opcode === 0x00) {
          fragChunks.push(payload);
          if (fin) {
            dispatchMessage(Buffer.concat(fragChunks).toString('utf8'));
            fragChunks = [];
          }
        }
      }
    }

    socket.on('connect', () => {
      const req = [
        `GET ${reqPath} HTTP/1.1`,
        `Host: ${host}:${port}`,
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Key: ${wsKey}`,
        'Sec-WebSocket-Version: 13',
        '',
        '',
      ].join('\r\n');
      socket.write(req);
    });

    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (!upgraded) {
        const headerEnd = buf.indexOf('\r\n\r\n');
        if (headerEnd === -1) return;
        const headerText = buf.subarray(0, headerEnd).toString('utf8');
        if (!/^HTTP\/1\.1 101\b/.test(headerText)) {
          reject(new Error(`CDP WebSocket upgrade failed: ${headerText.split('\r\n')[0]}`));
          socket.destroy();
          return;
        }
        buf = buf.subarray(headerEnd + 4);
        upgraded = true;
        resolve({
          send(method, params = {}) {
            return new Promise((res, rej) => {
              const id = nextId++;
              pending.set(id, { resolve: res, reject: rej, method });
              writeFrame(0x01, Buffer.from(JSON.stringify({ id, method, params }), 'utf8'));
            });
          },
          on(method, fn) {
            if (!listeners.has(method)) listeners.set(method, []);
            listeners.get(method).push(fn);
          },
          close() {
            try { socket.end(); } catch {}
          },
        });
      }
      if (buf.length > 0) consumeFrames();
    });
  });
}

function resolveCartSource(cartPath) {
  let fullPath = path.resolve(process.cwd(), cartPath || '.');
  const isDir = fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory();
  const hasManifest = isDir && fs.existsSync(path.join(fullPath, 'tessera.json'));
  const isManifest = !isDir && fullPath.endsWith('tessera.json') && fs.existsSync(fullPath);

  if (hasManifest || isManifest) {
    const projectDir = isManifest ? path.dirname(fullPath) : fullPath;
    return { cartText: assembleProject(projectDir), projectDir };
  }
  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
    return { cartText: fs.readFileSync(fullPath, 'utf8'), projectDir: path.dirname(fullPath) };
  }
  if (fs.existsSync(path.resolve(process.cwd(), 'tessera.json'))) {
    return { cartText: assembleProject(process.cwd()), projectDir: process.cwd() };
  }
  throw new Error(`Cart file or tessera.json not found: ${cartPath}`);
}

function loadRunnerHtml(templatePath = null) {
  const candidates = [
    templatePath,
    path.resolve(__dirname, '../template/runner.html'),
    path.resolve(__dirname, '../../template/runner.html'),
    path.resolve(process.cwd(), 'dist/tessera.html'),
  ].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(c)) return fs.readFileSync(c, 'utf8');
  }
  throw new Error('Bundled Tessera runner.html template not found.');
}

const KEY_CODES = {
  ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
  ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
  ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
  ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
  Space: { key: ' ', code: 'Space', keyCode: 32 },
  ' ': { key: ' ', code: 'Space', keyCode: 32 },
  Enter: { key: 'Enter', code: 'Enter', keyCode: 13 },
  Escape: { key: 'Escape', code: 'Escape', keyCode: 27 },
  z: { key: 'z', code: 'KeyZ', keyCode: 90 },
  x: { key: 'x', code: 'KeyX', keyCode: 88 },
  w: { key: 'w', code: 'KeyW', keyCode: 87 },
  a: { key: 'a', code: 'KeyA', keyCode: 65 },
  s: { key: 's', code: 'KeyS', keyCode: 83 },
  d: { key: 'd', code: 'KeyD', keyCode: 68 },
  e: { key: 'e', code: 'KeyE', keyCode: 69 },
  m: { key: 'm', code: 'KeyM', keyCode: 77 },
};

function normalizeKeySpec(keyName) {
  const raw = String(keyName || '').trim();
  if (KEY_CODES[raw]) return KEY_CODES[raw];
  const lower = raw.toLowerCase();
  if (KEY_CODES[lower]) return KEY_CODES[lower];
  if (raw.length === 1) {
    const ch = raw.toUpperCase();
    return { key: raw, code: `Key${ch}`, keyCode: ch.charCodeAt(0) };
  }
  return { key: raw, code: raw, keyCode: 0 };
}

/**
 * Parse compact CLI key string like "ArrowRight:12,Space:4" into [{ key, frames }].
 */
export function parseKeysSpec(spec) {
  if (!spec) return [];
  if (Array.isArray(spec)) {
    return spec.map((item) => {
      if (typeof item === 'string') {
        const [k, f] = item.split(':');
        return { key: k.trim(), frames: Math.max(1, Number(f) || 10) };
      }
      return { key: String(item.key || '').trim(), frames: Math.max(1, Number(item.frames) || 10) };
    }).filter((x) => x.key);
  }
  return String(spec)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [k, f] = part.split(':');
      return { key: k.trim(), frames: Math.max(1, Number(f) || 10) };
    })
    .filter((x) => x.key);
}

async function waitForDevToolsPort(proc, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    let stderr = '';
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for headless Chromium DevTools endpoint.\nStderr: ${stderr.slice(-500)}`));
    }, timeoutMs);

    const onData = (chunk) => {
      const text = chunk.toString('utf8');
      stderr += text;
      const m = stderr.match(/DevTools listening on (ws:\/\/[^\s:]+:(\d+)\/[^\s]+)/);
      if (m) {
        clearTimeout(timer);
        proc.stderr.off('data', onData);
        resolve({ browserWs: m[1], port: Number(m[2]) });
      }
    };
    proc.stderr.on('data', onData);
    proc.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Headless Chromium exited early (code ${code}).\nStderr: ${stderr.slice(-500)}`));
    });
  });
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Boot a Tessera cart in headless Chromium (WebGL2 SwiftShader), verify it executes without Lua/JS errors,
 * optionally send keyboard inputs, and capture a 768x432 PNG screenshot.
 */
export async function renderCartPreview(cartPath = '.', options = {}) {
  const { cartText } = resolveCartSource(cartPath);
  const parsed = parseCart(cartText);

  const chromePath = findChromeExecutable(options.chromePath);
  if (!chromePath) {
    throw new Error(
      'No Chrome or Chromium executable found for headless preview. ' +
      'Install Chrome/Chromium or set TESSERA_CHROME_PATH to the browser binary.',
    );
  }

  const runnerHtml = loadRunnerHtml(options.template);
  const safeCart = cartText.replace(/<\/script/gi, '<\\/script');
  const scriptTag = `\n<script id="tessera-cart" type="text/plain">\n${safeCart}\n</script>\n`;
  const pageHtml = runnerHtml.includes('</body>')
    ? runnerHtml.replace('</body>', `${scriptTag}</body>`)
    : runnerHtml + scriptTag;

  const width = Number(options.width) || 768;
  const height = Number(options.height) || 432;
  const targetFrames = Math.max(1, Number(options.frames) || 4);
  const timeoutMs = Math.max(3000, Number(options.timeoutMs) || 35000);
  const keySteps = parseKeysSpec(options.keys);
  const captureScreenshot = options.screenshot !== false;

  // Ephemeral local HTTP server
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
    if (pathname === '/' || pathname === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(pageHtml);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const httpPort = server.address().port;

  const baseTmp = (process.platform !== 'win32' && fs.existsSync('/tmp') && os.tmpdir().length > 40) ? '/tmp' : os.tmpdir();
  const userDataDir = fs.mkdtempSync(path.join(baseTmp, 'tessera-chrome-'));
  let proc = null;
  let cdp = null;

  try {
    const chromeArgs = [
      '--headless',
      '--remote-debugging-port=0',
      `--user-data-dir=${userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-extensions',
      '--disable-component-extensions-with-background-pages',
      '--disable-background-networking',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-sync',
      '--password-store=basic',
      '--use-mock-keychain',
      '--disable-features=HttpsUpgrades,HttpsFirstBalancedModeAutoEnable,PaintHolding',
      '--enable-features=CDPScreenshotNewSurface',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--hide-scrollbars',
      '--mute-audio',
      `--window-size=${width},${height}`,
      'about:blank',
    ];

    proc = spawn(chromePath, chromeArgs, {
      stdio: ['ignore', 'ignore', 'pipe'],
      env: { ...process.env, TMPDIR: '/tmp' },
    });

    const { port: debugPort } = await waitForDevToolsPort(proc, Math.min(timeoutMs, 15000));

    // Fetch initial page target WS URL
    let pageTarget = null;
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      try {
        const resp = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
        const targets = await resp.json();
        pageTarget = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
        if (pageTarget) break;
      } catch {}
      await sleep(50);
    }
    if (!pageTarget) {
      throw new Error('Could not find an open Chrome page target via DevTools.');
    }

    cdp = await connectCdp(pageTarget.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });

    const consoleLogs = [];
    const consoleErrors = [];
    cdp.on('Runtime.consoleAPICalled', (params) => {
      const text = (params.args || [])
        .map((a) => (a.value !== undefined ? String(a.value) : (a.description || a.type || '')))
        .join(' ');
      if (params.type === 'error') {
        consoleErrors.push(text);
      } else if (text) {
        consoleLogs.push(text);
      }
    });
    cdp.on('Runtime.exceptionThrown', (params) => {
      const desc = params?.exceptionDetails?.exception?.description
        || params?.exceptionDetails?.text
        || 'Uncaught exception';
      consoleErrors.push(desc);
    });

    const query = new URLSearchParams({ test: '1', speed: '4' });
    if (options.quality === 'hq') query.set('hq', '1');
    else if (options.quality === 'standard') query.set('hq', '0');

    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${httpPort}/?${query.toString()}` });

    async function evalState() {
      const res = await cdp.send('Runtime.evaluate', {
        expression: `(() => {
          const t = window.__tessera;
          if (!t) return null;
          return {
            state: t.state,
            frames: t.frames || 0,
            loops: t.loops || 0,
            errorText: t.errorText || '',
            errorSource: Array.isArray(t.errorSource) ? t.errorSource : [],
            message: t.message || '',
            frameHash: typeof t.frameHash === 'function' ? t.frameHash() : 0,
            stats: t.rendererStats || null
          };
        })()`,
        returnByValue: true,
      });
      return res?.result?.value || null;
    }

    const startTime = Date.now();
    let snap = null;

    // Wait for cart to boot into 'run' (or 'error') and render targetFrames
    while (Date.now() - startTime < timeoutMs) {
      snap = await evalState();
      if (snap) {
        if (snap.state === 'error') break;
        if (snap.state === 'run' && snap.frames >= targetFrames) break;
      }
      await sleep(60);
    }

    if (!snap) {
      throw new Error('Timed out waiting for Tessera runtime (window.__tessera) to initialize.');
    }

    // Optional scripted key input steps (e.g. test player movement / actions)
    if (snap.state === 'run' && keySteps.length > 0) {
      for (const step of keySteps) {
        const k = normalizeKeySpec(step.key);
        const startF = snap.frames;
        await cdp.send('Input.dispatchKeyEvent', {
          type: 'keyDown',
          key: k.key,
          code: k.code,
          windowsVirtualKeyCode: k.keyCode,
          nativeVirtualKeyCode: k.keyCode,
        });
        while (Date.now() - startTime < timeoutMs) {
          snap = await evalState();
          if (!snap || snap.state === 'error' || snap.frames >= startF + step.frames) break;
          await sleep(40);
        }
        await cdp.send('Input.dispatchKeyEvent', {
          type: 'keyUp',
          key: k.key,
          code: k.code,
          windowsVirtualKeyCode: k.keyCode,
          nativeVirtualKeyCode: k.keyCode,
        });
        if (!snap || snap.state === 'error') break;
      }
    }

    let pngBase64 = null;
    let outputPath = null;
    if (captureScreenshot) {
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      pngBase64 = shot.data;
      if (options.out) {
        outputPath = path.resolve(process.cwd(), options.out);
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, Buffer.from(pngBase64, 'base64'));
      }
    }

    const ok = snap.state === 'run' && !snap.errorText && consoleErrors.length === 0;

    return {
      ok,
      state: snap.state,
      frames: snap.frames,
      frameHash: snap.frameHash,
      errorText: snap.errorText,
      errorSource: snap.errorSource,
      message: snap.message,
      stats: snap.stats,
      consoleErrors,
      consoleLogs,
      meta: parsed.meta,
      pngBase64,
      outputPath,
      width,
      height,
      elapsedMs: Date.now() - startTime,
    };
  } finally {
    try { cdp?.close(); } catch {}
    if (proc && proc.exitCode === null) {
      const exited = new Promise((r) => proc.once('exit', r));
      try { proc.kill('SIGKILL'); } catch {}
      await Promise.race([exited, sleep(500)]);
    }
    try { server.closeAllConnections?.(); server.close(); } catch {}
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
  }
}
