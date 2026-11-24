#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const target = args.find(a => !a.startsWith('-')) || '.';
const targetDir = path.resolve(process.cwd(), target);

const HELP = `
Usage:
  npm create @stephenwil/tessera <directory>
  npx create-tessera <directory>

Options:
  --help, -h          Show help message
  --version, -v       Show version
`;

if (args.includes('--help') || args.includes('-h')) {
  console.log(HELP.trim());
  process.exit(0);
}

if (args.includes('--version') || args.includes('-v')) {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
  console.log(`create-tessera v${pkg.version}`);
  process.exit(0);
}

console.log(`\nCreating a new Tessera cart project in ${targetDir}...\n`);

const projectName = path.basename(targetDir) === '.' ? 'my-cart' : path.basename(targetDir);

// 1. Create directory structure
fs.mkdirSync(path.join(targetDir, 'src'), { recursive: true });
fs.mkdirSync(path.join(targetDir, 'models'), { recursive: true });
fs.mkdirSync(path.join(targetDir, 'assets'), { recursive: true });
fs.mkdirSync(path.join(targetDir, '.vscode'), { recursive: true });

// 2. tessera.json manifest
const manifest = {
  id: projectName.toLowerCase().replace(/[^a-z0-9_-]/g, '-'),
  title: projectName.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
  author: 'Developer',
  version: '1.0.0',
  description: 'A new game made for the Tessera High-Res voxel fantasy console.',
  lua: [
    'src/main.lua'
  ],
  models: {},
  palette: 'assets/palette.txt'
};
fs.writeFileSync(path.join(targetDir, 'tessera.json'), JSON.stringify(manifest, null, 2) + '\n');

// 3. src/main.lua starter code
const starterLua = `-- ${manifest.title}
-- Built for Tessera High-Res Voxel Console (256x256x128 volume, 768x432 HUD)

local px, py, pz = 128, 128, 2
local angle = 0

function _init()
  -- Set camera position & look target
  cam(128, 64, 48, 1.2, 0, 30)
  camtarget(128, 128, 10)
  fog(1, 0.002)

  -- Draw a stone platform on the persistent map layer
  mbox(100, 100, 0, 156, 156, 1, 4)
  mbox(112, 112, 0, 144, 144, 1, 5)
end

function _update()
  -- Input handling: Arrow keys / Gamepad D-pad
  local speed = 1.0
  if btn(0) then px = px - speed end
  if btn(1) then px = px + speed end
  if btn(2) then py = py - speed end
  if btn(3) then py = py + speed end

  -- Clamp inside platform boundary
  px = mid(105, px, 151)
  py = mid(105, py, 151)

  angle = angle + 0.04
end

function _draw()
  -- Dynamic drawing layer: cls() clears previous frame voxels
  cls(0)

  -- Draw player avatar sphere
  sphere(px, py, pz + 4, 3, 9)

  -- Draw rotating orbital particle
  local ox = px + math.cos(angle) * 8
  local oy = py + math.sin(angle) * 8
  vset(ox, oy, pz + 4, 11)

  -- HUD Canvas Overlay (768x432 resolution)
  rectfill(20, 20, 260, 60, 1)
  rect(20, 20, 260, 60, 7)
  print("${manifest.title}", 32, 28, 7)
  print("Use Arrows / Gamepad to move", 32, 42, 6)
end
`;
fs.writeFileSync(path.join(targetDir, 'src/main.lua'), starterLua);

// 4. assets/palette.txt default palette
const defaultPal = `# Tessera Custom Palette
# Index: #RRGGBB
1: #181a20
2: #282c37
3: #3f4756
4: #68748a
5: #9aa8be
6: #cad6e2
7: #f0f4f8
8: #e64553
9: #fe640b
10: #df8e1d
11: #40a02b
12: #209fb5
13: #1e66f5
14: #8839ef
15: #ea76cb
`;
fs.writeFileSync(path.join(targetDir, 'assets/palette.txt'), defaultPal);

// 5. package.json for project scripts
const projectPkg = {
  name: manifest.id,
  version: '1.0.0',
  private: true,
  type: 'module',
  scripts: {
    dev: 'tessera dev',
    pack: 'tessera pack',
    build: 'tessera pack && tessera export',
    check: 'tessera check'
  },
  devDependencies: {
    '@stephenwil/tessera': '^0.1.0'
  }
};
fs.writeFileSync(path.join(targetDir, 'package.json'), JSON.stringify(projectPkg, null, 2) + '\n');

// 6. VS Code LuaLS settings
const vscodeSettings = {
  "Lua.runtime.version": "Lua 5.4",
  "Lua.diagnostics.globals": [
    "_init",
    "_update",
    "_draw",
    "vset",
    "vget",
    "box",
    "sphere",
    "line3d",
    "model",
    "particle",
    "mset",
    "mget",
    "mbox",
    "mmodel",
    "mheight",
    "mclear",
    "cam",
    "camtarget",
    "camfov",
    "fog",
    "pal",
    "palt",
    "pswap",
    "cls",
    "rect",
    "rectfill",
    "circfill",
    "spr2d",
    "print",
    "textw",
    "project",
    "raycast3d",
    "check_box",
    "sweep_box",
    "sweep_down",
    "vheight",
    "sfx",
    "music",
    "btn",
    "btnp",
    "t",
    "flr",
    "mid",
    "rnd",
    "noise3",
    "stat",
    "dget",
    "dset"
  ]
};
fs.writeFileSync(path.join(targetDir, '.vscode/settings.json'), JSON.stringify(vscodeSettings, null, 2) + '\n');

// 7. README.md
const readme = `# ${manifest.title}

A game for the [Tessera High-Res](https://github.com/stephenwil/tessera-kit) voxel fantasy console.

## Development

\`\`\`sh
# Start live development server
npm run dev

# Build .tess and .tess.png cartridge
npm run pack

# Export offline standalone single-file HTML
npm run build
\`\`\`
`;
fs.writeFileSync(path.join(targetDir, 'README.md'), readme);

console.log(`Success! Project initialized.\n`);
console.log(`Next steps:\n  cd ${path.relative(process.cwd(), targetDir) || '.'}\n  npm install\n  npm run dev\n`);
