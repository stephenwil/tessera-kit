import fs from 'node:fs';
import path from 'node:path';
import { parseVox, voxModelToTessera } from './cart/vox.js';
import { formatModelText } from './vox.js';

export function assembleProject(projectDir = '.') {
  const baseDir = path.resolve(process.cwd(), projectDir);
  const manifestPath = path.join(baseDir, 'tessera.json');

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`tessera.json not found in ${baseDir}`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const lines = ['tessera cart v1', '__meta__'];

  lines.push(`title=${manifest.title || manifest.id || 'Untitled'}`);
  lines.push(`author=${manifest.author || 'Unknown'}`);
  lines.push(`version=${manifest.version || '1.0.0'}`);
  if (manifest.id) lines.push(`id=${manifest.id}`);
  if (manifest.players) lines.push(`players=${manifest.players}`);

  // Palette
  lines.push('__pal__');
  if (manifest.palette) {
    const palPath = path.resolve(baseDir, manifest.palette);
    if (fs.existsSync(palPath)) {
      const palContent = fs.readFileSync(palPath, 'utf8');
      for (const line of palContent.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          // Normalize "1: #181a20" or "1: 181a20" -> "1 181a20"
          const m = trimmed.match(/^(\d+):?\s+#?([0-9a-fA-F]{6})$/);
          if (m) {
            lines.push(`${m[1]} ${m[2].toLowerCase()}`);
          } else {
            lines.push(trimmed);
          }
        }
      }
    }
  }

  // Models
  lines.push('__models__');
  if (manifest.models && typeof manifest.models === 'object') {
    for (const [modelId, spec] of Object.entries(manifest.models)) {
      if (typeof spec === 'string' && spec.endsWith('.vox')) {
        const voxFile = path.resolve(baseDir, spec);
        if (fs.existsSync(voxFile)) {
          const parsed = parseVox(fs.readFileSync(voxFile));
          for (let i = 0; i < parsed.models.length; i++) {
            const id = parsed.models.length > 1 ? `${modelId}_${i}` : modelId;
            const modelObj = voxModelToTessera(parsed.models[i], id, new Map(), parsed.palette);
            lines.push(formatModelText(modelObj));
          }
        }
      } else if (typeof spec === 'object' && spec.file) {
        const voxFile = path.resolve(baseDir, spec.file);
        if (fs.existsSync(voxFile)) {
          const parsed = parseVox(fs.readFileSync(voxFile));
          const pivot = Array.isArray(spec.pivot) ? spec.pivot : null;
          for (let i = 0; i < parsed.models.length; i++) {
            const id = parsed.models.length > 1 ? `${modelId}_${i}` : modelId;
            const modelObj = voxModelToTessera(parsed.models[i], id, new Map(), parsed.palette);
            if (pivot) modelObj.pivot = pivot;
            lines.push(formatModelText(modelObj));
          }
        }
      }
    }
  }

  // SFX
  lines.push('__sfx__');
  if (manifest.sfx) {
    const sfxPath = path.resolve(baseDir, manifest.sfx);
    if (fs.existsSync(sfxPath)) {
      const sfxContent = fs.readFileSync(sfxPath, 'utf8');
      for (const line of sfxContent.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          lines.push(trimmed);
        }
      }
    }
  }

  // Lua
  lines.push('__lua__');
  const luaFiles = Array.isArray(manifest.lua) ? manifest.lua : ['src/main.lua'];
  for (const lf of luaFiles) {
    const fullLuaPath = path.resolve(baseDir, lf);
    if (fs.existsSync(fullLuaPath)) {
      lines.push(fs.readFileSync(fullLuaPath, 'utf8'));
    } else {
      console.warn(`[assembleProject] Lua file not found: ${fullLuaPath}`);
    }
  }

  return lines.join('\n') + '\n';
}
