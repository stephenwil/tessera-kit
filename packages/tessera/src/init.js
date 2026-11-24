import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const STARTER_LUA = `-- Tessera Starter Cart
-- 256x256x128 voxel volume, 768x432 screen, fixed 30 Hz update

function _init()
  -- Set up isometric camera and directional sun
  camera(128, 128, 16, 1, 0.785)
  sun(1, 1, 1, 15)
  sky(1, 2)
  t_prev = 0
end

function _update()
  -- Input and game simulation (runs 30 ticks per second)
  if btn(0) then -- Left
  elseif btn(1) then -- Right
  end
end

function _draw()
  cls()
  -- Draw a starter platform and beacon
  box(64, 64, 0, 192, 192, 2, 201)
  box(68, 68, 2, 188, 188, 3, 204)
  box(124, 124, 3, 132, 132, 18, 203)

  -- 2D screen HUD overlay (768x432)
  print("WELCOME TO TESSERA", 24, 24, 203)
  print("Press F4 for in-game code editor, F3 for stats", 24, 36, 214)
end
`;

const STARTER_PALETTE = `# Tessera Palette Overrides
# Format: <index> <hex_rrggbb>
200 1c202a
201 2b3140
202 d8343c
203 f0f4f8
204 449e48
205 2e7d32
206 1b5e20
207 1976d2
208 00e5ff
209 fbc02d
210 ff6d00
211 9c27b0
212 607d8b
213 37474f
214 90a4ae
215 12151c
`;

const VSCODE_SETTINGS = `{
  "Lua.runtime.version": "Lua 5.4",
  "Lua.diagnostics.globals": [
    "tessera", "vset", "vget", "box", "sphere", "line3d", "cls",
    "mset", "mget", "mbox", "mmodel", "mheight", "mclear",
    "model", "newmodel", "mpset", "msize", "mvox", "particle",
    "camera", "sun", "sky", "fog", "pal", "palt", "pswap",
    "print", "textw", "rect", "rectfill", "circfill", "spr2d", "project",
    "btn", "btnp", "axis", "tone", "sfx", "mute",
    "t", "flr", "mid", "rnd", "noise3", "stat", "dset", "dget", "printh", "quality",
    "raycast3d", "check_box", "sweep_box", "sweep_down", "vheight"
  ],
  "Lua.workspace.library": [
    "\${workspaceFolder}/@types"
  ],
  "Lua.workspace.checkThirdParty": false
}
`;

const GITIGNORE = `dist/
node_modules/
.DS_Store
*.tmp
`;

export function initProject(targetDir = '.', options = {}) {
  const dir = path.resolve(process.cwd(), targetDir);
  const name = options.name || path.basename(dir).toLowerCase().replace(/[^a-z0-9_-]/g, '-') || 'my-tessera-cart';
  const title = options.title || name.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const author = options.author || 'Author';

  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'models'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.vscode'), { recursive: true });
  fs.mkdirSync(path.join(dir, '@types'), { recursive: true });

  const manifest = {
    id: name,
    title,
    author,
    version: '1.0.0',
    lua: ['src/main.lua'],
    palette: 'assets/palette.txt',
    models: {}
  };

  fs.writeFileSync(path.join(dir, 'tessera.json'), JSON.stringify(manifest, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, 'src', 'main.lua'), STARTER_LUA);
  fs.writeFileSync(path.join(dir, 'assets', 'palette.txt'), STARTER_PALETTE);
  fs.writeFileSync(path.join(dir, '.vscode', 'settings.json'), VSCODE_SETTINGS);
  fs.writeFileSync(path.join(dir, '.gitignore'), GITIGNORE);

  // Copy or write EmmyLua types
  const candidateTypings = [
    path.resolve(__dirname, '../../@types/tessera.d.lua'),
    path.resolve(__dirname, '../types/tessera.d.lua'),
    path.resolve(__dirname, '../../types/tessera.d.lua'),
  ];
  let typingsContent = null;
  for (const p of candidateTypings) {
    if (fs.existsSync(p)) {
      typingsContent = fs.readFileSync(p, 'utf8');
      break;
    }
  }
  if (typingsContent) {
    fs.writeFileSync(path.join(dir, '@types', 'tessera.d.lua'), typingsContent);
  }

  const readme = `# ${title}

A 3D voxel game for the Tessera High-Res fantasy console.

## Development

- Start local dev server:
  \`\`\`sh
  tessera dev
  \`\`\`
- Pack into a steganographic picture cart (\`.tess.png\`):
  \`\`\`sh
  tessera pack
  \`\`\`
- Export single-file offline HTML runner:
  \`\`\`sh
  tessera export
  \`\`\`
- Check / validate cart syntax and headless simulation:
  \`\`\`sh
  tessera check
  \`\`\`
`;
  fs.writeFileSync(path.join(dir, 'README.md'), readme);

  return { ok: true, dir, id: name, title, author };
}
