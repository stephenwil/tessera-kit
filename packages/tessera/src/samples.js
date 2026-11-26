import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCart } from './cart/tess.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const DEFAULT_SHOWCASE_URL = 'https://stephenwil.github.io/tessera-showcase';

const SECTION_HEADER = /^__([a-zA-Z0-9_-]+)__$/;
const MODEL_HEADER = /^([a-zA-Z0-9_.-]+)\s+(\d+x\d+x\d+)(?:\s+.*)?$/;

const VSCODE_GLOBALS = [
  '_init', '_update', '_draw',
  'vset', 'vget', 'box', 'sphere', 'line3d', 'cls',
  'mset', 'mget', 'mbox', 'mmodel', 'mheight', 'mclear',
  'model', 'newmodel', 'mpset', 'msize', 'mvox', 'particle',
  'camera', 'sun', 'sky', 'fog', 'pal', 'palt', 'pswap', 'quality',
  'print', 'textw', 'rect', 'rectfill', 'circfill', 'spr2d', 'project',
  'raycast3d', 'check_box', 'sweep_box', 'sweep_down', 'vheight',
  'tone', 'sfx', 'mute', 'music', 'music_stop', 'music_pos', 'music_vol',
  'btn', 'btnp', 'axis',
  't', 'flr', 'mid', 'rnd', 'noise3', 'stat', 'dget', 'dset', 'printh',
];

function getPackageVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'));
    return pkg.version || '0.1.4';
  } catch {
    return '0.1.4';
  }
}

function resolveBaseUrl(options = {}) {
  const raw = options.baseUrl || process.env.TESSERA_SHOWCASE_URL || DEFAULT_SHOWCASE_URL;
  return String(raw).replace(/\/+$/, '');
}

function safeFileBase(name, fallback = 'cart') {
  const cleaned = String(name || '').replace(/[^a-zA-Z0-9._-]/g, '-').replace(/^\.+/, '');
  return cleaned || fallback;
}

export async function fetchSampleCatalog(options = {}) {
  const baseUrl = resolveBaseUrl(options);
  const url = `${baseUrl}/carts.json`;
  let res;
  try {
    res = await fetch(url, { headers: { 'User-Agent': `tessera-cli/${getPackageVersion()}` } });
  } catch (err) {
    throw new Error(`Failed to reach sample catalog at ${url}: ${err.message}`);
  }
  if (!res.ok) {
    throw new Error(`Failed to fetch sample catalog (${res.status} ${res.statusText}) from ${url}`);
  }
  const data = await res.json();
  if (!Array.isArray(data)) {
    throw new Error(`Unexpected catalog format from ${url}`);
  }
  return data.map((entry) => ({
    ...entry,
    cartUrl: `${baseUrl}/${String(entry.cartFile || `carts/${entry.id}.tess`).replace(/^\/+/, '')}`,
    pictureUrl: entry.pictureFile
      ? `${baseUrl}/${String(entry.pictureFile).replace(/^\/+/, '')}`
      : null,
  }));
}

export async function downloadSampleCart(id, options = {}) {
  if (!id || !String(id).trim()) {
    throw new Error('Specify a sample cart ID (run "tessera samples" to list available carts)');
  }
  const catalog = await fetchSampleCatalog(options);
  const needle = String(id).trim().toLowerCase();
  const entry = catalog.find((c) => String(c.id || '').toLowerCase() === needle);
  if (!entry) {
    const available = catalog.map((c) => c.id).join(', ');
    throw new Error(`Sample cart "${id}" not found. Available samples: ${available}`);
  }

  const targetUrl = options.png ? entry.pictureUrl : entry.cartUrl;
  if (!targetUrl) {
    throw new Error(`Sample cart "${entry.id}" does not have a ${options.png ? '.tess.png' : '.tess'} file`);
  }

  let res;
  try {
    res = await fetch(targetUrl, { headers: { 'User-Agent': `tessera-cli/${getPackageVersion()}` } });
  } catch (err) {
    throw new Error(`Failed to download "${entry.id}" from ${targetUrl}: ${err.message}`);
  }
  if (!res.ok) {
    throw new Error(`Failed to download "${entry.id}" (${res.status} ${res.statusText}) from ${targetUrl}`);
  }

  if (options.png) {
    const buffer = Buffer.from(await res.arrayBuffer());
    return { entry, buffer, cartText: null };
  }
  const cartText = await res.text();
  return { entry, cartText, buffer: Buffer.from(cartText, 'utf8') };
}

export function splitCartSections(cartText) {
  const source = String(cartText).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const lines = source.split('\n');
  const sections = Object.create(null);
  let current = null;
  for (const line of lines) {
    const m = SECTION_HEADER.exec(line.trim());
    if (m) {
      current = m[1];
      if (!sections[current]) sections[current] = [];
    } else if (current) {
      sections[current].push(line);
    }
  }
  return sections;
}

export function splitModelBlocks(modelLines) {
  const blocks = [];
  let current = null;
  for (const line of modelLines || []) {
    const m = MODEL_HEADER.exec(line.trim());
    if (m) {
      if (current) blocks.push(current);
      current = { id: m[1], lines: [line] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) blocks.push(current);
  return blocks.map((b) => {
    const trimmed = [...b.lines];
    while (trimmed.length && !trimmed[trimmed.length - 1].trim()) trimmed.pop();
    return { id: b.id, text: trimmed.join('\n') + '\n' };
  });
}

export function unpackCartToProject(cartText, targetDir = '.', options = {}) {
  // Validate cart integrity before writing project files
  const parsed = parseCart(cartText);
  const sections = splitCartSections(cartText);

  const dir = path.resolve(process.cwd(), targetDir);
  const dirSlug = path.basename(dir).toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  const id = options.id || parsed.meta?.id || dirSlug || 'my-tessera-cart';
  const title = options.title || parsed.meta?.title || id.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const author = options.author || parsed.meta?.author || 'Developer';
  const version = parsed.meta?.version || '1.0.0';

  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'models'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.vscode'), { recursive: true });

  const standardKeys = new Set(['id', 'title', 'author', 'version', 'players', 'quality']);
  const extraMeta = {};
  for (const [k, v] of Object.entries(parsed.meta || {})) {
    if (!standardKeys.has(k) && v !== undefined && v !== null && String(v).trim() !== '') {
      extraMeta[k] = v;
    }
  }

  const manifest = {
    id,
    title,
    author,
    version,
  };
  if (parsed.meta?.players !== undefined) {
    const pNum = Number(parsed.meta.players);
    manifest.players = Number.isInteger(pNum) ? pNum : parsed.meta.players;
  }
  if (parsed.meta?.quality) {
    manifest.quality = parsed.meta.quality;
  }
  if (options.description) {
    manifest.description = options.description;
  }
  if (Object.keys(extraMeta).length > 0) {
    manifest.meta = extraMeta;
  }

  manifest.lua = ['src/main.lua'];

  // Lua
  const luaText = (parsed.lua || '').replace(/\n+$/, '') + '\n';
  fs.writeFileSync(path.join(dir, 'src', 'main.lua'), luaText, 'utf8');

  // Palette
  const palLines = (sections.pal || []).map((l) => l.trim()).filter(Boolean);
  if (palLines.length > 0) {
    fs.writeFileSync(
      path.join(dir, 'assets', 'palette.txt'),
      `# Tessera Palette\n${palLines.join('\n')}\n`,
      'utf8',
    );
    manifest.palette = 'assets/palette.txt';
  }

  // Models
  const modelBlocks = splitModelBlocks(sections.models || []);
  manifest.models = {};
  const usedNames = new Set();
  for (const block of modelBlocks) {
    let fname = safeFileBase(block.id, 'model');
    let suffix = 2;
    while (usedNames.has(fname)) {
      fname = `${safeFileBase(block.id, 'model')}_${suffix++}`;
    }
    usedNames.add(fname);
    const relPath = `models/${fname}.txt`;
    fs.writeFileSync(path.join(dir, relPath), block.text, 'utf8');
    manifest.models[block.id] = relPath;
  }

  // SFX
  const sfxLines = (sections.sfx || []).map((l) => l.trim()).filter(Boolean);
  if (sfxLines.length > 0) {
    fs.writeFileSync(
      path.join(dir, 'assets', 'sfx.txt'),
      `# Tessera SFX\n${sfxLines.join('\n')}\n`,
      'utf8',
    );
    manifest.sfx = 'assets/sfx.txt';
  }

  // Music
  const rawMusic = [...(sections.music || [])];
  while (rawMusic.length && !rawMusic[0].trim()) rawMusic.shift();
  while (rawMusic.length && !rawMusic[rawMusic.length - 1].trim()) rawMusic.pop();
  if (rawMusic.length > 0) {
    fs.writeFileSync(
      path.join(dir, 'assets', 'music.txt'),
      `${rawMusic.join('\n')}\n`,
      'utf8',
    );
    manifest.music = 'assets/music.txt';
  }

  fs.writeFileSync(path.join(dir, 'tessera.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  // package.json
  const pkgVersion = getPackageVersion();
  const projectPkg = {
    name: options.packageName || dirSlug || id,
    version: '1.0.0',
    private: true,
    type: 'module',
    scripts: {
      dev: 'tessera dev',
      pack: 'tessera pack',
      build: 'tessera pack && tessera export',
      check: 'tessera check',
    },
    devDependencies: {
      '@stephenwil/tessera': `^${pkgVersion}`,
    },
  };
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(projectPkg, null, 2) + '\n', 'utf8');

  // VS Code LuaLS settings
  const vscodeSettings = {
    'Lua.runtime.version': 'Lua 5.4',
    'Lua.diagnostics.globals': VSCODE_GLOBALS,
  };

  // Copy EmmyLua typings if present in package
  const candidateTypings = [
    path.resolve(__dirname, '../../@types/tessera.d.lua'),
    path.resolve(__dirname, '../types/tessera.d.lua'),
    path.resolve(__dirname, '../../types/tessera.d.lua'),
  ];
  for (const p of candidateTypings) {
    if (fs.existsSync(p)) {
      fs.mkdirSync(path.join(dir, '@types'), { recursive: true });
      fs.writeFileSync(path.join(dir, '@types', 'tessera.d.lua'), fs.readFileSync(p, 'utf8'), 'utf8');
      vscodeSettings['Lua.workspace.library'] = ['${workspaceFolder}/@types'];
      vscodeSettings['Lua.workspace.checkThirdParty'] = false;
      break;
    }
  }

  fs.writeFileSync(path.join(dir, '.vscode', 'settings.json'), JSON.stringify(vscodeSettings, null, 2) + '\n', 'utf8');
  fs.writeFileSync(path.join(dir, '.gitignore'), 'dist/\nnode_modules/\n.DS_Store\n*.tmp\n', 'utf8');

  const readme = `# ${title}

${options.description ? options.description + '\n\n' : ''}A voxel game for the [Tessera High-Res](https://github.com/stephenwil/tessera-kit) fantasy console.

## Development

\`\`\`sh
npm install
npm run dev    # live-reload console at http://localhost:3000
npm run check  # validate cart syntax & manifest
npm run pack   # build .tess and .tess.png cartridge
npm run build  # export standalone offline HTML
\`\`\`
`;
  fs.writeFileSync(path.join(dir, 'README.md'), readme, 'utf8');

  return {
    ok: true,
    dir,
    id,
    title,
    modelsCount: modelBlocks.length,
    hasSfx: sfxLines.length > 0,
    hasMusic: rawMusic.length > 0,
  };
}

export async function pullSampleCli(id, options = {}) {
  const isProject = Boolean(options.project);
  if (isProject && options.png) {
    throw new Error('--project cannot be combined with --png (projects are unpacked from .tess source)');
  }

  const downloaded = await downloadSampleCart(id, {
    baseUrl: options.baseUrl,
    png: Boolean(options.png),
  });

  if (isProject) {
    const projectDir = typeof options.project === 'string' && options.project.trim()
      ? options.project
      : (options.out || safeFileBase(downloaded.entry.id, 'sample-cart'));
    const unpacked = unpackCartToProject(downloaded.cartText, projectDir, {
      description: downloaded.entry.description,
    });
    return {
      ok: true,
      mode: 'project',
      entry: downloaded.entry,
      ...unpacked,
    };
  }

  const ext = options.png ? '.tess.png' : '.tess';
  const defaultName = `${safeFileBase(downloaded.entry.id, 'sample')}${ext}`;
  const outPath = path.resolve(process.cwd(), options.out || defaultName);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, downloaded.buffer);

  return {
    ok: true,
    mode: options.png ? 'png' : 'cart',
    entry: downloaded.entry,
    outputPath: outPath,
    fileSize: downloaded.buffer.length,
  };
}

export function formatCatalogTable(samples) {
  if (!samples.length) return 'No sample carts found.';
  const idWidth = Math.max(2, ...samples.map((s) => String(s.id || '').length));
  const titleWidth = Math.max(5, ...samples.map((s) => String(s.title || '').length));
  const genreWidth = Math.max(5, ...samples.map((s) => String(s.genre || '').length));

  const lines = [
    `${'ID'.padEnd(idWidth)}  ${'TITLE'.padEnd(titleWidth)}  ${'GENRE'.padEnd(genreWidth)}  SIZE`,
    `${'-'.repeat(idWidth)}  ${'-'.repeat(titleWidth)}  ${'-'.repeat(genreWidth)}  ------`,
  ];
  for (const s of samples) {
    const bytes = s.stats?.fileSizeBytes;
    const sizeStr = bytes ? `${Math.max(1, Math.round(bytes / 1024))} KiB` : '-';
    lines.push(
      `${String(s.id || '').padEnd(idWidth)}  ${String(s.title || '').padEnd(titleWidth)}  ${String(s.genre || '-').padEnd(genreWidth)}  ${sizeStr}`,
    );
  }
  return lines.join('\n');
}
