export class CartError extends Error {
  constructor(message, section = null, line = 1) {
    super(message);
    this.name = 'CartError';
    this.section = section;
    this.line = line;
  }
}

const HEADER = /^__([a-zA-Z0-9_-]+)__$/;
const KNOWN = new Set(['meta', 'pal', 'models', 'sfx', 'music', 'lua']);
const fail = (message, section, line) => { throw new CartError(message, section, line); };

export function parseCart(text) {
  const source = String(text).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const lines = source.split('\n');
  let magic = -1;
  for (let i = 0; i < lines.length; i++) if (lines[i].trim()) { magic = i; break; }
  if (magic < 0 || lines[magic].trim() !== 'tessera cart v1') {
    throw new CartError("Not a Tessera cart (first line must be 'tessera cart v1')", null, Math.max(1, magic + 1));
  }
  const sections = [];
  let current = null;
  for (let i = magic + 1; i < lines.length; i++) {
    const match = HEADER.exec(lines[i].trim());
    if (match) {
      if (match[1] === 'lua' && sections.some(section => section.name === 'lua')) {
        fail('Repeated __lua__ section', 'lua', i + 1);
      }
      current = { name: match[1], start: i + 2, lines: [] };
      sections.push(current);
    } else if (current) current.lines.push({ text: lines[i], line: i + 1 });
    else if (lines[i].trim()) fail('Content before first section', null, i + 1);
  }
  const cart = { meta: Object.create(null), palette: new Map(), models: [], sfx: new Map(), music: { instruments: new Map(), patterns: new Map(), songs: new Map() }, lua: '', luaLine: 1, extra: [] };
  for (const section of sections) {
    const { name } = section;
    if (!KNOWN.has(name)) {
      cart.extra.push({ name, text: trimTerminalNewlines(section.lines.map(x => x.text).join('\n')) });
      continue;
    }
    if (name === 'lua') {
      cart.luaLine = section.start;
      const luaLines = section.lines.map(x => x.text);
      while (luaLines.length && !luaLines[luaLines.length - 1].trim()) luaLines.pop();
      cart.lua = luaLines.join('\n');
    } else if (name === 'meta') parseMeta(section, cart);
    else if (name === 'pal') parsePalette(section, cart);
    else if (name === 'models') parseModels(section, cart);
    else if (name === 'sfx') parseSfx(section, cart);
    else if (name === 'music') parseMusic(section, cart);
  }
  if (!sections.some(s => s.name === 'lua')) fail('Missing __lua__ section', null, lines.length);
  return cart;
}

function trimTerminalNewlines(value) { return value.replace(/\n+$/, ''); }
function contentLines(section) { return section.lines.filter(x => x.text.trim()); }

function parseMeta(section, cart) {
  for (const row of contentLines(section)) {
    const at = row.text.indexOf('=');
    if (at < 1) fail('Invalid meta entry', 'meta', row.line);
    const key = row.text.slice(0, at).trim();
    const val = row.text.slice(at + 1).trim();
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    cart.meta[key] = val;
  }
}

function parsePalette(section, cart) {
  for (const row of contentLines(section)) {
    const tokens = row.text.trim().split(/\s+/);
    const index = Number(tokens[0]);
    if (!Number.isInteger(index) || index < 1 || index > 255) fail(`Invalid palette index '${tokens[0]}' (must be 1–255)`, 'pal', row.line);
    if (tokens.length !== 2 || !/^[\da-fA-F]{6}$/.test(tokens[1])) fail('Invalid palette colour; expected six hex digits', 'pal', row.line);
    const hex = tokens[1];
    cart.palette.set(index, [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16)));
  }
}

function parseModels(section, cart) {
  const input = section.lines;
  let i = 0;
  while (i < input.length) {
    if (!input[i].text.trim()) { i++; continue; }
    const header = input[i++];
    const fields = header.text.trim().split(/\s+/);
    const dims = /^(\d+)x(\d+)x(\d+)$/.exec(fields[1] ?? '');
    if (!fields[0] || !dims) fail('Invalid model header', 'models', header.line);
    const [, ws, ds, hs] = dims;
    const id = fields[0], w = Number(ws), d = Number(ds), h = Number(hs);
    if (cart.models.some(model => model.id === id)) fail(`Duplicate model id '${id}'`, 'models', header.line);
    if (![w, d, h].every(n => Number.isSafeInteger(n) && n >= 1 && n <= 256) || h > 128) {
      fail(`Invalid dimensions for model '${id}' (w and d must be 1–256; h must be 1–128)`, 'models', header.line);
    }
    let frames = 1, pivot = [Math.floor(w / 2), Math.floor(d / 2), 0];
    for (const opt of fields.slice(2)) {
      let m;
      if ((m = /^frames=(\d+)$/.exec(opt))) frames = Number(m[1]);
      else if ((m = /^pivot=(-?\d+),(-?\d+),(-?\d+)$/.exec(opt))) pivot = m.slice(1).map(Number);
      else fail(`Invalid model option '${opt}' for '${id}'`, 'models', header.line);
    }
    if (!Number.isSafeInteger(frames) || frames < 1 || frames > 64) {
      fail(`Invalid frame count for model '${id}' (must be 1–64)`, 'models', header.line);
    }
    const data = [];
    for (let f = 0; f < frames; f++) {
      const voxels = new Uint8Array(w * d * h);
      for (let z = 0; z < h; z++) {
        for (let y = 0; y < d; y++) {
          while (i < input.length && !input[i].text.trim()) i++;
          const row = input[i++];
          if (!row || row.text.trim() === 'frame') fail(`Missing row in model '${id}'`, 'models', row?.line ?? input.at(-1)?.line ?? header.line);
          const tokens = row.text.trim().split(/\s+/);
          if (tokens.length !== w) fail(`Model '${id}' row must contain ${w} tokens`, 'models', row.line);
          tokens.forEach((token, x) => {
            if (token === '..') return;
            if (!/^[\da-fA-F]{2}$/.test(token)) fail(`Invalid voxel token '${token}' in model '${id}'`, 'models', row.line);
            voxels[x + w * y + w * d * z] = parseInt(token, 16);
          });
        }
        if (z < h - 1) {
          while (i < input.length && !input[i].text.trim()) i++;
        }
      }
      data.push(voxels);
      while (i < input.length && !input[i].text.trim()) i++;
      if (f < frames - 1) {
        if (input[i]?.text.trim() !== 'frame') fail(`Expected frame separator in model '${id}'`, 'models', input[i]?.line ?? header.line);
        i++;
      }
    }
    cart.models.push({ id, w, d, h, frames, pivot, data });
  }
}

function parseSfx(section, cart) {
  for (const row of contentLines(section)) {
    const t = row.text.trim().split(/\s+/);
    const n = Number(t[0]), slide = /^(\S+)>(\S+)$/.exec(t[2] ?? '');
    const wave = t[1], f0 = Number(slide?.[1]), f1 = Number(slide?.[2]), dur = Number(t[3]), vol = Number(t[4]);
    if (!Number.isInteger(n) || n < 0 || t.length !== 5 || !['square', 'triangle', 'saw', 'noise'].includes(wave) || !slide || ![f0, f1, dur, vol].every(Number.isFinite)) fail('Invalid sfx entry', 'sfx', row.line);
    const steps = cart.sfx.get(n) ?? [];
    steps.push({ wave, f0, f1, dur, vol });
    cart.sfx.set(n, steps);
  }
}

function parseMusic(section, cart) {
  let currentPat = null;
  let currentSong = null;

  for (const row of contentLines(section)) {
    const text = row.text.trim();
    if (!text || text.startsWith('#') || text.startsWith('--')) continue;

    const parts = text.split(/\s+/);
    const head = parts[0];

    if (head === 'inst') {
      currentPat = null;
      currentSong = null;
      const id = Number(parts[1]);
      if (!Number.isInteger(id) || id < 0 || id > 15) fail('Invalid instrument ID', 'music', row.line);
      let wave = 'square';
      let adsr = null;
      for (let i = 2; i < parts.length; i++) {
        const [k, v] = parts[i].split('=');
        if (k === 'wave') {
          if (!['sq12', 'sq25', 'sq50', 'square', 'tri', 'triangle', 'saw', 'sawtooth', 'nse', 'noise', 'pns', 'pnoise'].includes(v)) {
            fail(`Invalid wave type: ${v}`, 'music', row.line);
          }
          wave = v;
        } else if (k === 'adsr') {
          const vals = (v || '').split(',').map(Number);
          if (vals.length !== 4 || !vals.every(Number.isFinite)) {
            fail('Invalid adsr specification (must be 4 numbers: attack,decay,sustain,release)', 'music', row.line);
          }
          adsr = vals;
        }
      }
      cart.music.instruments.set(id, { id, wave, adsr });
    } else if (head === 'pat') {
      currentSong = null;
      const id = Number(parts[1]);
      if (!Number.isInteger(id) || id < 0 || id > 63) fail('Invalid pattern ID', 'music', row.line);
      let speed = 6;
      let rowsCount = 32;
      for (let i = 2; i < parts.length; i++) {
        const [k, v] = parts[i].split('=');
        if (k === 'speed') speed = Math.max(1, Math.min(32, Number(v) || 6));
        else if (k === 'rows') rowsCount = Math.max(1, Math.min(64, Number(v) || 32));
      }
      currentPat = { id, speed, rows: [] };
      cart.music.patterns.set(id, currentPat);
    } else if (head === 'song') {
      currentPat = null;
      const id = Number(parts[1]);
      if (!Number.isInteger(id) || id < 0 || id > 15) fail('Invalid song ID', 'music', row.line);
      let title = '';
      let speed = 6;
      let loop = 0;
      const titleMatch = /title="([^"]*)"/.exec(text);
      if (titleMatch) title = titleMatch[1];
      for (let i = 2; i < parts.length; i++) {
        const [k, v] = parts[i].split('=');
        if (k === 'speed') speed = Math.max(1, Math.min(32, Number(v) || 6));
        else if (k === 'loop') loop = Number(v);
      }
      currentSong = { id, title, speed, loop, order: [] };
      cart.music.songs.set(id, currentSong);
    } else if (head === 'order') {
      if (!currentSong) fail('order without preceding song', 'music', row.line);
      for (let i = 1; i < parts.length; i++) {
        const pId = Number(parts[i]);
        if (!Number.isInteger(pId) || pId < 0) fail(`Invalid pattern ID in order: ${parts[i]}`, 'music', row.line);
        currentSong.order.push(pId);
      }
    } else if (currentPat) {
      if (text.includes('|')) {
        const cells = text.split('|').map(s => s.trim());
        let channelCells = cells.slice(1);
        if (channelCells.length > 4) channelCells = channelCells.slice(0, 4);
        while (channelCells.length < 4) channelCells.push('...');
        currentPat.rows.push(channelCells);
      } else {
        const channelCells = parts.slice(1, 5);
        while (channelCells.length < 4) channelCells.push('...');
        currentPat.rows.push(channelCells);
      }
    }
  }
}

export function serialiseCart(cart) {
  const out = ['tessera cart v1', '__meta__'];
  for (const [key, value] of Object.entries(cart.meta ?? {})) out.push(`${key}=${value}`);
  out.push('__pal__');
  for (const [n, rgb] of cart.palette ?? []) out.push(`${n} ${rgb.map(c => Number(c).toString(16).padStart(2, '0')).join('')}`);
  out.push('__models__');
  for (const m of cart.models ?? []) {
    const opts = [];
    if (m.frames !== 1) opts.push(`frames=${m.frames}`);
    const defaultPivot = [Math.floor(m.w / 2), Math.floor(m.d / 2), 0];
    if (m.pivot.some((v, i) => v !== defaultPivot[i])) opts.push(`pivot=${m.pivot.join(',')}`);
    out.push(`${m.id} ${m.w}x${m.d}x${m.h}${opts.length ? ` ${opts.join(' ')}` : ''}`);
    for (let f = 0; f < m.frames; f++) {
      if (f) out.push('frame');
      const data = m.data[f];
      for (let z = 0; z < m.h; z++) {
        if (z) out.push('');
        for (let y = 0; y < m.d; y++) {
          const row = [];
          for (let x = 0; x < m.w; x++) {
            const c = data[x + m.w * y + m.w * m.d * z];
            row.push(c ? c.toString(16).padStart(2, '0') : '..');
          }
          out.push(row.join(' '));
        }
      }
    }
  }
  out.push('__sfx__');
  for (const [n, steps] of cart.sfx ?? []) for (const s of steps) out.push(`${n} ${s.wave} ${s.f0}>${s.f1} ${s.dur} ${s.vol}`);
  if (cart.music && (cart.music.instruments?.size || cart.music.patterns?.size || cart.music.songs?.size)) {
    out.push('__music__');
    for (const [id, inst] of cart.music.instruments ?? []) {
      const adsrStr = inst.adsr ? ` adsr=${inst.adsr.join(',')}` : '';
      out.push(`inst ${id} wave=${inst.wave}${adsrStr}`);
    }
    for (const [id, pat] of cart.music.patterns ?? []) {
      out.push(`pat ${id} speed=${pat.speed} rows=${pat.rows.length}`);
      for (let r = 0; r < pat.rows.length; r++) {
        const row = pat.rows[r];
        const rowStr = r.toString(16).padStart(2, '0');
        out.push(`${rowStr} | ${row.join(' | ')}`);
      }
    }
    for (const [id, song] of cart.music.songs ?? []) {
      const titleStr = song.title ? ` title="${song.title}"` : '';
      const loopStr = song.loop !== undefined ? ` loop=${song.loop}` : '';
      out.push(`song ${id}${titleStr} speed=${song.speed}${loopStr}`);
      out.push(`order ${song.order.join(' ')}`);
    }
  }
  out.push('__lua__');
  out.push(...String(cart.lua ?? '').split('\n'));
  for (const extra of cart.extra ?? []) { out.push(`__${extra.name}__`); out.push(...String(extra.text).split('\n')); }
  return `${out.join('\n').replace(/\n+$/, '')}\n`;
}

/**
 * Replaces only the __lua__ section of a cart text string, preserving all other sections
 * (__meta__, __pal__, __models__, __sfx__, __music__, and custom __extra__ sections).
 */
export function updateCartLua(cartText, newLua) {
  const cart = parseCart(cartText);
  cart.lua = String(newLua ?? '');
  return serialiseCart(cart);
}

/**
 * Replaces only the __models__ section of a cart text string, preserving all other sections
 * (__meta__, __pal__, __sfx__, __music__, __lua__, and custom __extra__ sections).
 */
export function updateCartModels(cartText, newModels) {
  const cart = parseCart(cartText);
  cart.models = newModels ?? [];
  return serialiseCart(cart);
}

/**
 * Replaces only the __music__ section of a cart text string, preserving all other sections
 * (__meta__, __pal__, __models__, __sfx__, __lua__, and custom __extra__ sections).
 */
export function updateCartMusic(cartText, newMusic) {
  const cart = parseCart(cartText);
  cart.music = newMusic ?? { instruments: new Map(), patterns: new Map(), songs: new Map() };
  return serialiseCart(cart);
}


