#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_SHOWCASE_URL,
  fetchShowcaseCatalog,
  fetchShowcaseCart,
  extractTemplateProject,
  formatTemplateTable,
} from '../src/showcase.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));

const HELP = `
Usage:
  npm create @stephenwil/tessera@latest <directory>
  npm create @stephenwil/tessera@latest <directory> -- --template <sample-id>
  npm create @stephenwil/tessera@latest -- --list
  npx @stephenwil/create-tessera@latest <directory> [--template <sample-id>]

Options:
  -t, --template <id>     Start from any playable Tessera Showcase cart
  --list, --list-templates List available showcase templates
  --registry <url>        Override showcase catalog base URL
  --help, -h              Show help message
  --version, -v           Show version
`;

const VSCODE_GLOBALS = [
  '_init', '_update', '_draw',
  'vset', 'vget', 'box', 'sphere', 'line3d',
  'model', 'newmodel', 'mpset', 'msize', 'mvox', 'particle',
  'mset', 'mget', 'mbox', 'mmodel', 'mheight', 'mclear',
  'camera', 'sun', 'sky', 'fog', 'pal', 'palt', 'pswap', 'quality',
  'cls', 'rect', 'rectfill', 'circfill', 'spr2d', 'print', 'textw', 'project',
  'raycast3d', 'check_box', 'sweep_box', 'sweep_down', 'vheight',
  'tone', 'sfx', 'mute', 'music', 'music_stop', 'music_pos', 'music_vol',
  'btn', 'btnp', 'axis',
  't', 'flr', 'mid', 'rnd', 'noise3', 'stat', 'dget', 'dset', 'printh',
];

function parseArgs(argv) {
  const options = {};
  const positional = [];
  const flagsWithValue = new Set(['-t', '--template', '--registry']);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') continue;
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq !== -1) {
        options[arg.slice(0, eq)] = arg.slice(eq + 1);
      } else if (flagsWithValue.has(arg) && i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        options[arg] = argv[++i];
      } else {
        options[arg] = true;
      }
    } else if (arg.startsWith('-')) {
      if (flagsWithValue.has(arg) && i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        options[arg] = argv[++i];
      } else {
        options[arg] = true;
      }
    } else {
      positional.push(arg);
    }
  }
  return { options, positional };
}

function writeCommonProjectFiles(targetDir, manifest, packageName, description) {
  const projectPkg = {
    name: packageName,
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
      '@stephenwil/tessera': `^${pkg.version}`,
    },
  };
  fs.writeFileSync(path.join(targetDir, 'package.json'), JSON.stringify(projectPkg, null, 2) + '\n');

  const vscodeSettings = {
    'Lua.runtime.version': 'Lua 5.4',
    'Lua.diagnostics.globals': VSCODE_GLOBALS,
  };
  fs.writeFileSync(path.join(targetDir, '.vscode/settings.json'), JSON.stringify(vscodeSettings, null, 2) + '\n');
  fs.writeFileSync(path.join(targetDir, '.gitignore'), 'dist/\nnode_modules/\n.DS_Store\n*.tmp\n');

  const readme = `# ${manifest.title}

${description ? description + '\n\n' : ''}A game for the [Tessera High-Res](https://github.com/stephenwil/tessera-kit) voxel fantasy console.

## Development

\`\`\`sh
# Start live development server
npm run dev

# Validate cart syntax & manifest
npm run check

# Build .tess and .tess.png cartridge
npm run pack

# Export offline standalone single-file HTML
npm run build
\`\`\`
`;
  fs.writeFileSync(path.join(targetDir, 'README.md'), readme);
}

async function main() {
  const { options, positional } = parseArgs(process.argv.slice(2));

  if (options['--help'] || options['-h']) {
    console.log(HELP.trim());
    process.exit(0);
  }

  if (options['--version'] || options['-v']) {
    console.log(`create-tessera v${pkg.version}`);
    process.exit(0);
  }

  const baseUrl = options['--registry'] || undefined;

  if (options['--list'] || options['--list-templates']) {
    const catalog = await fetchShowcaseCatalog({ baseUrl });
    console.log(`\nTessera Showcase Templates (${baseUrl || process.env.TESSERA_SHOWCASE_URL || DEFAULT_SHOWCASE_URL}):\n`);
    console.log(formatTemplateTable(catalog));
    console.log('\nScaffold a project from any sample:');
    console.log('  npm create @stephenwil/tessera@latest my-game -- --template <id>\n');
    process.exit(0);
  }

  const template = options['--template'] || options['-t'];
  if (template === true) {
    console.error('Error: --template requires a sample ID (run with --list to see available samples).');
    process.exit(1);
  }

  const target = positional[0] || (template ? template : '.');
  const targetDir = path.resolve(process.cwd(), target);
  const relDir = path.relative(process.cwd(), targetDir) || '.';
  const dirSlug = path.basename(targetDir).toLowerCase().replace(/[^a-z0-9_-]/g, '-') || 'my-cart';

  if (template) {
    console.log(`\nFetching showcase template "${template}"...\n`);
    const { entry, cartText } = await fetchShowcaseCart(template, { baseUrl });
    const extracted = extractTemplateProject(cartText, targetDir, {
      id: positional[0] && positional[0] !== '.' ? dirSlug : entry.id,
      description: entry.description,
    });
    writeCommonProjectFiles(targetDir, extracted.manifest, dirSlug, entry.description);

    console.log(`Success! Created "${entry.title}" (${entry.id}) in ${targetDir}`);
    const extras = [];
    if (extracted.modelsCount) extras.push(`${extracted.modelsCount} model(s)`);
    if (extracted.hasSfx) extras.push('assets/sfx.txt');
    if (extracted.hasMusic) extras.push('assets/music.txt');
    if (extras.length) {
      console.log(`  Included: tessera.json, src/main.lua, ${extras.join(', ')}`);
    }
    console.log(`\nNext steps:\n  cd ${relDir}\n  npm install\n  npm run dev\n`);
    return;
  }

  console.log(`\nCreating a new Tessera cart project in ${targetDir}...\n`);

  const projectName = path.basename(targetDir) === '.' ? 'my-cart' : path.basename(targetDir);

  fs.mkdirSync(path.join(targetDir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(targetDir, 'models'), { recursive: true });
  fs.mkdirSync(path.join(targetDir, 'assets'), { recursive: true });
  fs.mkdirSync(path.join(targetDir, '.vscode'), { recursive: true });

  const manifest = {
    id: projectName.toLowerCase().replace(/[^a-z0-9_-]/g, '-'),
    title: projectName.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    author: 'Developer',
    version: '1.0.0',
    description: 'A new game made for the Tessera High-Res voxel fantasy console.',
    lua: ['src/main.lua'],
    models: {},
    palette: 'assets/palette.txt',
  };
  fs.writeFileSync(path.join(targetDir, 'tessera.json'), JSON.stringify(manifest, null, 2) + '\n');

  const starterLua = `-- ${manifest.title}
-- Built for Tessera High-Res Voxel Console (256x256x128 volume, 768x432 HUD)

local px, py, pz = 128, 128, 2
local angle = 0

function _init()
  -- Orthographic camera target (x, y, z, zoom, yaw) + lighting
  camera(128, 128, 6, 1.4, 0)
  sun(-0.4, -0.6, 0.7, 1)
  sky(1, 2)
  fog(1, 0.002)

  -- Draw a stone platform on the persistent map layer
  mbox(100, 100, 0, 156, 156, 1, 4)
  mbox(112, 112, 0, 144, 144, 1, 5)
end

function _update()
  -- Input handling: Arrow keys / WASD / Gamepad D-pad (up = +y north)
  local speed = 1.0
  if btn(0) then px = px - speed end
  if btn(1) then px = px + speed end
  if btn(2) then py = py + speed end
  if btn(3) then py = py - speed end

  -- Clamp inside platform boundary
  px = mid(105, px, 151)
  py = mid(105, py, 151)

  angle = angle + 0.04
end

function _draw()
  -- Dynamic drawing layer: cls() clears previous frame voxels
  cls()

  -- Follow the player smoothly
  camera(px, py, 6, 1.4, 0)

  -- Draw player avatar sphere
  sphere(px, py, pz + 4, 3, 9)

  -- Draw rotating orbital voxel
  local ox = px + math.cos(angle) * 8
  local oy = py + math.sin(angle) * 8
  vset(ox, oy, pz + 4, 11)

  -- HUD Canvas Overlay (768x432 resolution)
  rectfill(20, 20, 290, 62, 1)
  rect(20, 20, 290, 62, 7)
  print("${manifest.title}", 32, 28, 7)
  print("Arrows / WASD / Gamepad to move", 32, 44, 6)
end
`;
  fs.writeFileSync(path.join(targetDir, 'src/main.lua'), starterLua);

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

  writeCommonProjectFiles(targetDir, manifest, manifest.id, manifest.description);

  console.log(`Success! Project initialized.\n`);
  console.log(`Next steps:\n  cd ${relDir}\n  npm install\n  npm run dev\n`);
  console.log(`Want to start from a full playable showcase cart instead?`);
  console.log(`  npx @stephenwil/tessera@latest samples`);
  console.log(`  npm create @stephenwil/tessera@latest my-sample -- --template <id>`);
  console.log(`  Browse online: ${DEFAULT_SHOWCASE_URL}/\n`);
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
