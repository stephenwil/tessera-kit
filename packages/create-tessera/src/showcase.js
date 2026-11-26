import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_SHOWCASE_URL = 'https://stephenwil.github.io/tessera-showcase';

const SECTION_HEADER = /^__([a-zA-Z0-9_-]+)__$/;
const MODEL_HEADER = /^([a-zA-Z0-9_.-]+)\s+(\d+x\d+x\d+)(?:\s+.*)?$/;

function resolveBaseUrl(options = {}) {
  const raw = options.baseUrl || process.env.TESSERA_SHOWCASE_URL || DEFAULT_SHOWCASE_URL;
  return String(raw).replace(/\/+$/, '');
}

function safeFileBase(name, fallback = 'model') {
  const cleaned = String(name || '').replace(/[^a-zA-Z0-9._-]/g, '-').replace(/^\.+/, '');
  return cleaned || fallback;
}

export async function fetchShowcaseCatalog(options = {}) {
  const baseUrl = resolveBaseUrl(options);
  const url = `${baseUrl}/carts.json`;
  let res;
  try {
    res = await fetch(url, { headers: { 'User-Agent': 'create-tessera' } });
  } catch (err) {
    throw new Error(`Failed to reach showcase catalog at ${url}: ${err.message}`);
  }
  if (!res.ok) {
    throw new Error(`Failed to fetch showcase catalog (${res.status} ${res.statusText}) from ${url}`);
  }
  const data = await res.json();
  if (!Array.isArray(data)) {
    throw new Error(`Unexpected catalog format from ${url}`);
  }
  return data.map((entry) => ({
    ...entry,
    cartUrl: `${baseUrl}/${String(entry.cartFile || `carts/${entry.id}.tess`).replace(/^\/+/, '')}`,
  }));
}

export async function fetchShowcaseCart(templateId, options = {}) {
  const catalog = await fetchShowcaseCatalog(options);
  const needle = String(templateId || '').trim().toLowerCase();
  const entry = catalog.find((c) => String(c.id || '').toLowerCase() === needle);
  if (!entry) {
    const available = catalog.map((c) => c.id).join(', ');
    throw new Error(`Template "${templateId}" not found. Available showcase templates: ${available}`);
  }
  let res;
  try {
    res = await fetch(entry.cartUrl, { headers: { 'User-Agent': 'create-tessera' } });
  } catch (err) {
    throw new Error(`Failed to download template "${entry.id}" from ${entry.cartUrl}: ${err.message}`);
  }
  if (!res.ok) {
    throw new Error(`Failed to download template "${entry.id}" (${res.status} ${res.statusText}) from ${entry.cartUrl}`);
  }
  const cartText = await res.text();
  return { entry, cartText };
}

export function parseTessSections(cartText) {
  const source = String(cartText).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const lines = source.split('\n');
  let magic = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim()) {
      magic = i;
      break;
    }
  }
  if (magic < 0 || lines[magic].trim() !== 'tessera cart v1') {
    throw new Error("Downloaded file is not a valid Tessera cart (missing 'tessera cart v1' header)");
  }
  const sections = Object.create(null);
  let current = null;
  for (let i = magic + 1; i < lines.length; i++) {
    const m = SECTION_HEADER.exec(lines[i].trim());
    if (m) {
      current = m[1];
      if (!sections[current]) sections[current] = [];
    } else if (current) {
      sections[current].push(lines[i]);
    }
  }
  if (!sections.lua) {
    throw new Error('Downloaded cart is missing a __lua__ section');
  }
  return sections;
}

export function extractTemplateProject(cartText, targetDir, options = {}) {
  const sections = parseTessSections(cartText);
  const meta = Object.create(null);
  for (const row of sections.meta || []) {
    const trimmed = row.trim();
    if (!trimmed) continue;
    const at = trimmed.indexOf('=');
    if (at < 1) continue;
    const k = trimmed.slice(0, at).trim();
    const v = trimmed.slice(at + 1).trim();
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    meta[k] = v;
  }

  const dirSlug = path.basename(targetDir).toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  const id = options.id || meta.id || dirSlug || 'my-cart';
  const title = meta.title || id.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const author = meta.author || 'Developer';
  const version = meta.version || '1.0.0';

  fs.mkdirSync(path.join(targetDir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(targetDir, 'models'), { recursive: true });
  fs.mkdirSync(path.join(targetDir, 'assets'), { recursive: true });
  fs.mkdirSync(path.join(targetDir, '.vscode'), { recursive: true });

  const standardKeys = new Set(['id', 'title', 'author', 'version', 'players', 'quality']);
  const extraMeta = {};
  for (const [k, v] of Object.entries(meta)) {
    if (!standardKeys.has(k) && v !== '') {
      extraMeta[k] = v;
    }
  }

  const manifest = { id, title, author, version };
  if (meta.players !== undefined) {
    const pNum = Number(meta.players);
    manifest.players = Number.isInteger(pNum) ? pNum : meta.players;
  }
  if (meta.quality) manifest.quality = meta.quality;
  if (options.description) manifest.description = options.description;
  if (Object.keys(extraMeta).length > 0) manifest.meta = extraMeta;

  manifest.lua = ['src/main.lua'];

  // Lua
  const luaLines = [...(sections.lua || [])];
  while (luaLines.length && !luaLines[luaLines.length - 1].trim()) luaLines.pop();
  fs.writeFileSync(path.join(targetDir, 'src', 'main.lua'), luaLines.join('\n') + '\n', 'utf8');

  // Palette
  const palLines = (sections.pal || []).map((l) => l.trim()).filter(Boolean);
  if (palLines.length > 0) {
    fs.writeFileSync(
      path.join(targetDir, 'assets', 'palette.txt'),
      `# Tessera Palette\n${palLines.join('\n')}\n`,
      'utf8',
    );
    manifest.palette = 'assets/palette.txt';
  }

  // Models
  const modelBlocks = [];
  let currentModel = null;
  for (const line of sections.models || []) {
    const m = MODEL_HEADER.exec(line.trim());
    if (m) {
      if (currentModel) modelBlocks.push(currentModel);
      currentModel = { id: m[1], lines: [line] };
    } else if (currentModel) {
      currentModel.lines.push(line);
    }
  }
  if (currentModel) modelBlocks.push(currentModel);

  manifest.models = {};
  const usedNames = new Set();
  for (const block of modelBlocks) {
    const lines = [...block.lines];
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    let fname = safeFileBase(block.id, 'model');
    let suffix = 2;
    while (usedNames.has(fname)) fname = `${safeFileBase(block.id, 'model')}_${suffix++}`;
    usedNames.add(fname);
    const rel = `models/${fname}.txt`;
    fs.writeFileSync(path.join(targetDir, rel), lines.join('\n') + '\n', 'utf8');
    manifest.models[block.id] = rel;
  }

  // SFX
  const sfxLines = (sections.sfx || []).map((l) => l.trim()).filter(Boolean);
  if (sfxLines.length > 0) {
    fs.writeFileSync(
      path.join(targetDir, 'assets', 'sfx.txt'),
      `# Tessera SFX\n${sfxLines.join('\n')}\n`,
      'utf8',
    );
    manifest.sfx = 'assets/sfx.txt';
  }

  // Music
  const musicLines = [...(sections.music || [])];
  while (musicLines.length && !musicLines[0].trim()) musicLines.shift();
  while (musicLines.length && !musicLines[musicLines.length - 1].trim()) musicLines.pop();
  if (musicLines.length > 0) {
    fs.writeFileSync(
      path.join(targetDir, 'assets', 'music.txt'),
      musicLines.join('\n') + '\n',
      'utf8',
    );
    manifest.music = 'assets/music.txt';
  }

  fs.writeFileSync(path.join(targetDir, 'tessera.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  return {
    manifest,
    modelsCount: modelBlocks.length,
    hasSfx: sfxLines.length > 0,
    hasMusic: musicLines.length > 0,
  };
}

export function formatTemplateTable(catalog) {
  if (!catalog.length) return 'No showcase templates found.';
  const idW = Math.max(2, ...catalog.map((c) => String(c.id || '').length));
  const titleW = Math.max(5, ...catalog.map((c) => String(c.title || '').length));
  const genreW = Math.max(5, ...catalog.map((c) => String(c.genre || '').length));
  const lines = [
    `${'ID'.padEnd(idW)}  ${'TITLE'.padEnd(titleW)}  ${'GENRE'.padEnd(genreW)}  SIZE`,
    `${'-'.repeat(idW)}  ${'-'.repeat(titleW)}  ${'-'.repeat(genreW)}  ------`,
  ];
  for (const c of catalog) {
    const bytes = c.stats?.fileSizeBytes;
    const size = bytes ? `${Math.max(1, Math.round(bytes / 1024))} KiB` : '-';
    lines.push(
      `${String(c.id || '').padEnd(idW)}  ${String(c.title || '').padEnd(titleW)}  ${String(c.genre || '-').padEnd(genreW)}  ${size}`,
    );
  }
  return lines.join('\n');
}
