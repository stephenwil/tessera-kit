import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

import { initProject } from './init.js';
import { assembleProject } from './project.js';
import { packCartCli, unpackCartCli } from './pack.js';
import { exportHtmlCli } from './export.js';
import { checkCartCli } from './check.js';
import { parseVox, convertMultiVox } from './cart/vox.js';

const API_DOCS = {
  map: `Map Layer API (persistent world volume):
- mset(x, y, z, c): Set persistent voxel at (x, y, z) with color index c (1..255, 0=empty)
- mget(x, y, z): Get persistent voxel color index at (x, y, z)
- mbox(x0, y0, z0, x1, y1, z1, c, [hollow]): Draw filled or hollow box in persistent volume
- mmodel(id, x, y, z, [rot], [flip], [frame]): Stamp a 3D model into persistent volume
- mheight(x, y): Returns highest non-empty voxel z-coordinate at (x, y)
- mclear(): Reset entire persistent map layer to air`,

  draw: `Draw Layer API (transient dynamic volume, wiped every frame by cls()):
- vset(x, y, z, c): Set dynamic voxel at (x, y, z)
- vget(x, y, z): Read dynamic voxel, falls back to map layer if empty
- box(x0, y0, z0, x1, y1, z1, c, [hollow]): Draw dynamic filled or hollow 3D box
- sphere(x, y, z, r, c): Draw solid voxel sphere (radius r)
- line3d(x0, y0, z0, x1, y1, z1, c): Draw 3D Bresenham line
- model(id, x, y, z, [rot], [flip], [frame]): Draw animated model instance
- particle(x, y, z, c, [life]): Spawn transient voxel particle
- cls([c]): Clear dynamic layer (optional fill color c, default 0)`,

  collision: `Host-Side Voxel Collision Probes (ultra-fast zero-bridge queries):
- raycast3d(x0, y0, z0, dx, dy, dz, max_dist): Cast 3D ray through volume. Returns hit (bool), hit_x, hit_y, hit_z, normal_x, normal_y, normal_z, color
- check_box(x0, y0, z0, x1, y1, z1): Check if any solid voxel exists in bounding box. Returns bool
- sweep_box(x0, y0, z0, x1, y1, z1, dx, dy, dz): Sweep 3D AABB along direction. Returns fraction (0..1), hit (bool), nx, ny, nz
- sweep_down(x, y, z, max_drop): Fast downward ray test for gravity. Returns ground_z, hit (bool)
- vheight(x, y): Returns highest voxel across both draw and map layers at (x, y)`,

  camera: `Camera & Rendering API:
- cam(x, y, z, [zoom], [pitch], [yaw]): Position camera in world coordinates
- camtarget(tx, ty, tz): Set camera look-at target point
- camfov(degrees): Set camera field-of-view angle (default 60)
- fog(color, density): Set distance fog color and density (0..1)
- pal(idx, r, g, b): Dynamically modify color in the 256-color palette
- palt(): Reset palette overrides back to cart palette
- pswap(from_c, to_c): Remap color index dynamically during drawing`,

  hud: `2D HUD Overlay Canvas (768x432 screen resolution):
- print(str, x, y, [c], [outline_c], [scale]): Draw 5x7 bitmap text (6px char advance)
- textw(str): Measure pixel width of text string (6 * string.len)
- rect(x0, y0, x1, y1, [c]): Draw outline rectangle
- rectfill(x0, y0, x1, y1, [c]): Draw solid filled rectangle
- circfill(x, y, r, [c]): Draw solid circle
- spr2d(n, x, y, [scale]): Stamp built-in 8x8 HUD icon
- project(x, y, z): Project 3D world voxel coordinate to 2D screen coordinate (sx, sy, visible)`,

  input: `Input API (Keyboard & Multi-player Gamepad):
- btn(i, [player]): Is button currently held down? (0=Left, 1=Right, 2=Up, 3=Down, 4=A/Z, 5=B/X, 6=Start/Enter)
- btnp(i, [player]): Was button pressed this tick? (Edge-triggered with repeat delay)`,

  audio: `Audio Synthesizer (4-channel chip synth):
- sfx(id, [channel], [offset]): Play sound effect id (0..63)
- music(id, [fade_ms]): Play music track / tracker sequence`,

  math: `Math Utilities:
- t(): Seconds elapsed since boot (advances 1/30s per tick)
- flr(x): Floor number to integer
- mid(min, val, max): Clamp value between min and max
- rnd(n): Random float 0 <= r < n (or random int if n is integer)
- noise3(x, y, z): 3D Perlin noise generator (-1.0 to 1.0)`
};

const TOOLS = [
  {
    name: 'tessera_init_cart',
    description: 'Scaffold a new Tessera High-Res cart project with manifest, Lua loop, palette, and VS Code settings.',
    inputSchema: {
      type: 'object',
      properties: {
        directory: { type: 'string', description: 'Directory path where the new cart will be created.' },
        name: { type: 'string', description: 'Identifier for the cart (e.g. "space-miner").' },
        title: { type: 'string', description: 'Display title for the game (e.g. "Space Miner").' },
        author: { type: 'string', description: 'Creator / author name.' }
      },
      required: ['directory']
    }
  },
  {
    name: 'tessera_check_cart',
    description: 'Validate cart syntax, balanced Lua blocks, manifest configuration, and integrity.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to a .tess file or a project directory containing tessera.json (defaults to ".").' }
      }
    }
  },
  {
    name: 'tessera_assemble_cart',
    description: 'Assemble a multi-file Tessera project into the canonical plain text .tess cartridge format.',
    inputSchema: {
      type: 'object',
      properties: {
        projectDir: { type: 'string', description: 'Path to project directory containing tessera.json (defaults to ".").' }
      }
    }
  },
  {
    name: 'tessera_pack_cart',
    description: 'Pack a cart into a shareable steganographic .tess.png picture cart with an embedded label.',
    inputSchema: {
      type: 'object',
      properties: {
        cartPath: { type: 'string', description: 'Path to .tess file or project directory (defaults to ".").' },
        labelPath: { type: 'string', description: 'Optional 256x256 custom PNG label image.' },
        outputPath: { type: 'string', description: 'Optional output .tess.png file path.' }
      }
    }
  },
  {
    name: 'tessera_export_html',
    description: 'Export an offline, self-contained standalone single-file .html runner playable anywhere without a server.',
    inputSchema: {
      type: 'object',
      properties: {
        cartPath: { type: 'string', description: 'Path to .tess file or project directory (defaults to ".").' },
        outputPath: { type: 'string', description: 'Optional output .html file path.' }
      }
    }
  },
  {
    name: 'tessera_inspect_vox',
    description: 'Parse a MagicaVoxel .vox file and return dimensions, model count, frame count, and color palette data.',
    inputSchema: {
      type: 'object',
      properties: {
        voxPath: { type: 'string', description: 'Path to the MagicaVoxel .vox file to inspect.' }
      },
      required: ['voxPath']
    }
  },
  {
    name: 'tessera_check_palette_budget',
    description: 'Scan all .vox models in a project, deduplicate identical colors, and verify compliance with the <= 255 palette limit.',
    inputSchema: {
      type: 'object',
      properties: {
        projectDir: { type: 'string', description: 'Project directory containing tessera.json and models (defaults to ".").' },
        maxColors: { type: 'number', description: 'Maximum allowed colors (default: 255).' }
      }
    }
  },
  {
    name: 'tessera_api_docs',
    description: 'Look up API documentation, signatures, and code examples for Tessera High-Res Lua subsystems.',
    inputSchema: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          enum: ['all', 'map', 'draw', 'collision', 'camera', 'hud', 'input', 'audio', 'math'],
          description: 'The API subsystem to query.'
        }
      }
    }
  }
];

export async function handleToolCall(name, args = {}) {
  switch (name) {
    case 'tessera_init_cart': {
      const res = initProject(args.directory, {
        name: args.name,
        title: args.title,
        author: args.author
      });
      return {
        text: `Successfully initialized Tessera cart project in ${res.dir}\n- ID: ${res.id}\n- Title: ${res.title}\n- Manifest: tessera.json\n- Entrypoint: src/main.lua`
      };
    }

    case 'tessera_check_cart': {
      const target = args.path || '.';
      const res = checkCartCli(target);
      if (res.ok) {
        return {
          text: `✓ Cart check passed!\n- ID: ${res.parsed?.meta?.id || 'unknown'}\n- Title: ${res.parsed?.meta?.title || 'untitled'}\n- Lua lines: ${res.parsed?.lua?.split('\n').length || 0}\n- Warnings: ${res.warnings?.length ? res.warnings.join(', ') : 'none'}`
        };
      } else {
        return {
          text: `✗ Cart check failed:\n${res.errors.map(e => `  - ${e}`).join('\n')}`,
          isError: true
        };
      }
    }

    case 'tessera_assemble_cart': {
      const dir = path.resolve(process.cwd(), args.projectDir || '.');
      const text = assembleProject(dir);
      return {
        text: `Assembled cart (${text.length} characters):\n\n${text.slice(0, 500)}...\n[Truncated ${Math.max(0, text.length - 500)} characters]`
      };
    }

    case 'tessera_pack_cart': {
      const res = await packCartCli(args.cartPath || '.', args.labelPath || null, args.outputPath || null);
      return {
        text: `✓ Packed picture cart successfully:\n- Output: ${res.outputPath}\n- File size: ${Math.ceil(res.fileSize / 1024)} KiB\n- Capacity: ${Math.ceil(res.capacity / 1024)} KiB`
      };
    }

    case 'tessera_export_html': {
      const res = exportHtmlCli(args.cartPath || '.', args.outputPath || null);
      return {
        text: `✓ Exported standalone offline HTML runner:\n- Output: ${res.outputPath}\n- File size: ${(res.fileSize / (1024 * 1024)).toFixed(2)} MB`
      };
    }

    case 'tessera_inspect_vox': {
      const fullPath = path.resolve(process.cwd(), args.voxPath);
      if (!fs.existsSync(fullPath)) {
        throw new Error(`File not found: ${args.voxPath}`);
      }
      const parsed = parseVox(fs.readFileSync(fullPath));
      const modelSummaries = parsed.models.map((m, idx) => `  Model ${idx}: ${m.size.x}x${m.size.y}x${m.size.z} (${m.voxels.length} voxels)`);
      return {
        text: `MagicaVoxel Model Analysis for ${args.voxPath}:\n- Version: ${parsed.version}\n- Model Count: ${parsed.models.length}\n- Palette Colors: ${parsed.palette?.filter(c => c && (c[0] || c[1] || c[2])).length || 0}\n${modelSummaries.join('\n')}`
      };
    }

    case 'tessera_check_palette_budget': {
      const dir = path.resolve(process.cwd(), args.projectDir || '.');
      const manifestPath = path.join(dir, 'tessera.json');
      if (!fs.existsSync(manifestPath)) {
        throw new Error(`tessera.json not found in ${dir}`);
      }
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const voxFiles = [];
      if (manifest.models && typeof manifest.models === 'object') {
        for (const spec of Object.values(manifest.models)) {
          if (typeof spec === 'string' && spec.endsWith('.vox')) {
            voxFiles.push(path.resolve(dir, spec));
          } else if (spec && spec.file) {
            voxFiles.push(path.resolve(dir, spec.file));
          }
        }
      }

      if (voxFiles.length === 0) {
        return { text: `Project contains no .vox models in tessera.json. Palette budget: 0 / 255 colors used.` };
      }

      const res = convertMultiVox(voxFiles, { maxColors: args.maxColors || 255 });
      return {
        text: `Palette Budget Analysis:\n- Scanned .vox files: ${voxFiles.length}\n- Deduplicated Colors: ${res.palette.length} / ${args.maxColors || 255}\n- Budget Status: ${res.palette.length <= 255 ? '✓ WITHIN BUDGET' : '✗ OVER BUDGET'}\n- Generated Models: ${res.models.length}`
      };
    }

    case 'tessera_api_docs': {
      const topic = args.topic || 'all';
      if (topic === 'all') {
        const fullDocs = Object.entries(API_DOCS).map(([k, v]) => `=== ${k.toUpperCase()} ===\n${v}`).join('\n\n');
        return { text: fullDocs };
      }
      const doc = API_DOCS[topic];
      if (!doc) {
        return { text: `Unknown topic '${topic}'. Available topics: ${Object.keys(API_DOCS).join(', ')}`, isError: true };
      }
      return { text: doc };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export function startMcpServer() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });

  function send(msg) {
    process.stdout.write(JSON.stringify(msg) + '\n');
  }

  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let req;
    try {
      req = JSON.parse(trimmed);
    } catch {
      return;
    }

    const { id, method, params } = req;

    if (method === 'initialize') {
      send({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: {
            name: '@stephenwil/tessera-mcp',
            version: '0.1.0'
          }
        }
      });
      return;
    }

    if (method === 'notifications/initialized') {
      return;
    }

    if (method === 'ping') {
      send({ jsonrpc: '2.0', id, result: {} });
      return;
    }

    if (method === 'tools/list') {
      send({
        jsonrpc: '2.0',
        id,
        result: {
          tools: TOOLS
        }
      });
      return;
    }

    if (method === 'tools/call') {
      const toolName = params?.name;
      const toolArgs = params?.arguments || {};
      try {
        const result = await handleToolCall(toolName, toolArgs);
        send({
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: result.text
              }
            ],
            isError: !!result.isError
          }
        });
      } catch (err) {
        send({
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: `Tool execution failed: ${err.message}`
              }
            ],
            isError: true
          }
        });
      }
      return;
    }

    if (id !== undefined) {
      send({
        jsonrpc: '2.0',
        id,
        error: {
          code: -32601,
          message: `Method not found: ${method}`
        }
      });
    }
  });
}
