import fs from 'node:fs';
import path from 'node:path';
import { assembleProject } from './project.js';
import { parseCart } from './cart/tess.js';
import { renderCartPreview } from './preview.js';

const HALLUCINATED_APIS = [
  { re: /\bcam\s*\(/, msg: "Unknown API 'cam()' — use 'camera(x, y, z, [zoom], [yaw])' instead" },
  { re: /\bcamtarget\s*\(/, msg: "Unknown API 'camtarget()' — use 'camera(x, y, z, [zoom], [yaw])' instead" },
  { re: /\brect_fill\s*\(/, msg: "Unknown API 'rect_fill()' — use 'rectfill(x0, y0, x1, y1, c)' instead" },
  { re: /\bcirc\s*\(/, msg: "Unknown API 'circ()' — use 'circfill(x, y, r, c)' instead" },
  { re: /\bspr\s*\(/, msg: "Unknown API 'spr()' — use 'model(id, x, y, z)' for 3D voxels or 'spr2d(n, x, y)' for HUD icons" },
  { re: /\bpset\s*\(/, msg: "Unknown API 'pset()' — use 'vset(x, y, z, c)' for dynamic voxels or 'mset(x, y, z, c)' for persistent map voxels" },
];

/**
 * Strip Lua comments (--... and --[[...]]) and string literals ("...", '...', [[...]])
 * while preserving newlines so line counts stay accurate.
 */
function stripLuaStringsAndComments(source) {
  let out = '';
  let i = 0;
  const n = source.length;

  while (i < n) {
    const ch = source[i];
    const next = source[i + 1];

    // Long comment --[=[ ... ]=]
    if (ch === '-' && next === '-') {
      if (source[i + 2] === '[') {
        let eq = 0;
        let j = i + 3;
        while (source[j] === '=') { eq++; j++; }
        if (source[j] === '[') {
          const close = ']' + '='.repeat(eq) + ']';
          const endIdx = source.indexOf(close, j + 1);
          const stop = endIdx === -1 ? n : endIdx + close.length;
          out += source.slice(i, stop).replace(/[^\n]/g, ' ');
          i = stop;
          continue;
        }
      }
      // Single-line comment
      const nl = source.indexOf('\n', i);
      if (nl === -1) break;
      out += '\n';
      i = nl + 1;
      continue;
    }

    // Long string [=[ ... ]=]
    if (ch === '[' && (next === '[' || next === '=')) {
      let eq = 0;
      let j = i + 1;
      while (source[j] === '=') { eq++; j++; }
      if (source[j] === '[') {
        const close = ']' + '='.repeat(eq) + ']';
        const endIdx = source.indexOf(close, j + 1);
        const stop = endIdx === -1 ? n : endIdx + close.length;
        out += source.slice(i, stop).replace(/[^\n]/g, ' ');
        i = stop;
        continue;
      }
    }

    // Quoted string
    if (ch === '"' || ch === "'") {
      const quote = ch;
      out += ' ';
      i++;
      while (i < n) {
        if (source[i] === '\\') {
          if (source[i + 1] === '\n') out += '\n';
          i += 2;
          continue;
        }
        if (source[i] === quote) {
          i++;
          break;
        }
        if (source[i] === '\n') out += '\n';
        i++;
      }
      continue;
    }

    out += ch;
    i++;
  }
  return out;
}

function checkManifestFiles(projectDir, errors) {
  const manifestPath = path.join(projectDir, 'tessera.json');
  if (!fs.existsSync(manifestPath)) return;
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    errors.push(`Invalid tessera.json: ${err.message}`);
    return;
  }
  const luaFiles = Array.isArray(manifest.lua) ? manifest.lua : ['src/main.lua'];
  for (const lf of luaFiles) {
    if (!fs.existsSync(path.resolve(projectDir, lf))) {
      errors.push(`Missing Lua file referenced in tessera.json: ${lf}`);
    }
  }
  for (const key of ['palette', 'sfx', 'music']) {
    if (manifest[key] && !fs.existsSync(path.resolve(projectDir, manifest[key]))) {
      errors.push(`Missing ${key} file referenced in tessera.json: ${manifest[key]}`);
    }
  }
  if (manifest.models && typeof manifest.models === 'object') {
    for (const [id, spec] of Object.entries(manifest.models)) {
      const rel = typeof spec === 'string' ? spec : spec?.file;
      if (rel && !fs.existsSync(path.resolve(projectDir, rel))) {
        errors.push(`Missing model file for '${id}' referenced in tessera.json: ${rel}`);
      }
    }
  }
}

export function checkCartCli(cartPath) {
  let fullCartPath = path.resolve(process.cwd(), cartPath || '.');
  let cartText = null;
  const errors = [];
  const warnings = [];

  const isDir = fs.existsSync(fullCartPath) && fs.statSync(fullCartPath).isDirectory();
  const manifestInDir = isDir && fs.existsSync(path.join(fullCartPath, 'tessera.json'));
  const isManifest = !isDir && fullCartPath.endsWith('tessera.json') && fs.existsSync(fullCartPath);

  if (manifestInDir || isManifest) {
    const projectDir = isManifest ? path.dirname(fullCartPath) : fullCartPath;
    checkManifestFiles(projectDir, errors);
    cartText = assembleProject(projectDir);
  } else if (fs.existsSync(fullCartPath) && fs.statSync(fullCartPath).isFile()) {
    cartText = fs.readFileSync(fullCartPath, 'utf8');
  } else if (fs.existsSync(path.resolve(process.cwd(), 'tessera.json'))) {
    checkManifestFiles(process.cwd(), errors);
    cartText = assembleProject(process.cwd());
  } else {
    throw new Error(`Cart file or tessera.json not found: ${cartPath}`);
  }

  const parsed = parseCart(cartText);

  if (!parsed.meta?.id) {
    warnings.push('Missing id in __meta__ section');
  }
  if (!parsed.meta?.title) {
    warnings.push('Missing title in __meta__ section');
  }

  if (!parsed.lua || parsed.lua.trim().length === 0) {
    errors.push('Cart contains no Lua code');
  } else {
    const cleaned = stripLuaStringsAndComments(parsed.lua);

    // Check block balance (function/then/do/repeat vs end/until).
    // Note: "elseif ... then" continues an existing "if" block and does not add an extra "end".
    const normalized = cleaned.replace(/\belseif\b[^\n]*?\bthen\b/g, ' ');
    const tokens = normalized.match(/\b(function|then|do|repeat|end|until)\b/g) || [];
    let openBlocks = 0;
    for (const tok of tokens) {
      if (tok === 'end' || tok === 'until') openBlocks--;
      else openBlocks++;
    }
    if (openBlocks > 0) {
      errors.push(`Unbalanced Lua blocks: missing ${openBlocks} 'end' (or 'until') keyword(s)`);
    } else if (openBlocks < 0) {
      errors.push(`Unbalanced Lua blocks: ${Math.abs(openBlocks)} unexpected extra 'end' (or 'until') keyword(s)`);
    }

    if (!/\bfunction\s+_draw\s*\(/.test(cleaned) && !/\b_draw\s*=\s*function\b/.test(cleaned)) {
      warnings.push('Cart does not define _draw() — screen will only show static map voxels or remain blank');
    }

    for (const rule of HALLUCINATED_APIS) {
      if (rule.re.test(cleaned)) {
        warnings.push(rule.msg);
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    parsed,
  };
}

/**
 * Run static checks AND boot the cart in headless Chromium for a few ticks to catch real Lua 5.4 syntax/runtime errors.
 */
export async function checkCartRuntimeCli(cartPath, options = {}) {
  const staticRes = checkCartCli(cartPath);
  if (!staticRes.ok) {
    return { ...staticRes, runtime: null };
  }

  const runtime = await renderCartPreview(cartPath, {
    frames: options.frames ?? 3,
    keys: options.keys,
    quality: options.quality,
    chromePath: options.chromePath,
    screenshot: false,
  });

  const errors = [...staticRes.errors];
  const warnings = [...staticRes.warnings];
  if (!runtime.ok) {
    if (runtime.errorText) {
      const cleanErr = String(runtime.errorText).split('\nR to restart')[0].trim();
      errors.push(`Lua runtime error: ${cleanErr}`);
      
    }
    for (const ce of runtime.consoleErrors || []) {
      errors.push(`Browser console error: ${ce}`);
    }
    if (errors.length === 0) {
      errors.push(`Cart failed to boot cleanly (state: ${runtime.state})`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    parsed: staticRes.parsed,
    runtime,
  };
}
