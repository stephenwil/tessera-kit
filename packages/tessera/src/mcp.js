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
  map: `Map Layer API (persistent 256x256x128 world volume):
- mset(x, y, z, c): Set persistent voxel at (x, y, z) with palette index c (1..255, 0=empty)
- mget(x, y, z): Get persistent voxel palette index at (x, y, z) (0 outside bounds)
- mbox(x0, y0, z0, x1, y1, z1, c): Draw solid filled box in persistent map volume
- mmodel(id, x, y, z, [rot], [flip]): Stamp a 3D model into persistent map volume
- mheight(x, y): Returns highest non-empty map voxel z-coordinate at (x, y) (or -1)
- mclear([c]): Clear/fill entire persistent map layer (default 0 = air)`,

  draw: `Draw Layer API (transient per-frame volume, cleared by cls()):
- cls(): Clear all voxels written to the draw layer since previous frame
- vset(x, y, z, c): Set dynamic voxel at (x, y, z) (honors pswap remap)
- vget(x, y, z): Read dynamic voxel, falling back to map layer if empty
- box(x0, y0, z0, x1, y1, z1, c, [hollow]): Draw dynamic filled or hollow 3D box
- sphere(x, y, z, r, c): Draw solid voxel sphere of radius r
- line3d(x0, y0, z0, x1, y1, z1, c): Draw 3D Bresenham voxel line
- model(id, x, y, z, [rot], [flip], [frame]): Draw animated voxel model instance
- particle(x, y, z, c, [life]): Spawn transient voxel particle (default life 1.0)
- newmodel(id, w, d, h, [frames]): Define a runtime procedural model (w,d <= 256; h <= 128)
- mpset(id, x, y, z, c, [frame]): Set a voxel inside a model
- msize(id): Returns model dimensions (w, d, h)
- mvox(id, [frame]): Returns array of {x, y, z, c} voxels in model`,

  collision: `Host-Side Voxel Collision Probes (layer: 0=both [default], 1=map, 2=draw):
- raycast3d(x0, y0, z0, dx, dy, dz, [max_dist], [layer]): 3D DDA raycast. Returns hit, x, y, z, nx, ny, nz, c, dist
- check_box(x0, y0, z0, x1, y1, z1, [layer]): AABB solid voxel test. Returns collides, x, y, z, c
- sweep_box(x0, y0, z0, x1, y1, z1, dx, dy, dz, [max_dist], [layer]): Continuous AABB sweep. Returns hit, dist, x, y, z, nx, ny, nz, c
- sweep_down(x, y, z, [w], [d], [max_drop], [layer]): Footprint downward sweep. Returns hit, ground_z, dist, x, y, z, c
- vheight(x, y, [w], [d], [layer]): Highest solid voxel z across footprint (or -1)`,

  camera: `Camera, Lighting, Palette & Quality API:
- camera(x, y, z, [zoom], [yaw]): Set orthographic camera target (x, y, z), zoom (>0, default 1), and yaw in radians (default 0)
- sun(dx, dy, dz, [strength]): Set directional sun vector and shadow strength (default 1)
- sky(top, bottom): Set sky gradient using two palette indices
- fog(c, density): Set distance fog palette index and density (0 disables)
- pal(i, r, g, b): Dynamically modify RGB (0..255) for palette slot i (0..255)
- palt(): Reset runtime palette overrides back to cart palette
- pswap([a], [b]): Remap draw color a -> b (call with no args to reset all remaps)
- quality([preset]): Get or set render quality ("standard" or "hq")`,

  hud: `2D HUD Overlay Canvas (768x432 screen resolution, cleared every frame):
- print(str, x, y, [c], [outline], [scale]): Draw 5x7 bitmap text (6px advance, outline defaults true)
- textw(str): Measure pixel width of text string (6 * len)
- rect(x0, y0, x1, y1, [c]): Draw outline rectangle
- rectfill(x0, y0, x1, y1, [c]): Draw solid filled rectangle
- circfill(x, y, r, [c]): Draw solid circle
- spr2d(n, x, y, [scale]): Stamp built-in 8x8 HUD icon
- project(x, y, z): Project 3D voxel coordinate to 2D screen (sx, sy, visible)`,

  input: `Input API (Keyboard, 4-Player Gamepad & Touch):
- btn(b, [player]): Is button held? (0=Left, 1=Right, 2=Up/+y, 3=Down/-y, 4=A/Z/Space, 5=B/X/E, 6=M sound key)
- btnp(b, [player]): Was button pressed this tick? (Edge-triggered)
- axis(n, [player]): Analog stick / pad axis in -1..1 (0=x, 1=y)`,

  audio: `Audio Synthesizer & Music Tracker (4 concurrent channels 0..3):
- tone(wave, f0, [f1], dur, [vol], [ch]): Synthesize tone (wave: "square", "triangle", "saw", "noise"; f1 slides pitch)
- sfx(n, [ch]): Trigger sound effect n from cart __sfx__ section
- mute(): Toggle console sound mute; returns current muted state
- music(id, [fade_ms], [ch_mask]): Start music track from cart __music__ section
- music_stop([fade_ms]): Stop active music track
- music_pos(): Returns current (pattern, row) or (-1, -1) if stopped
- music_vol([v]): Get or set music volume (0..1)`,

  math: `Math, Time, Persistence & Diagnostics API:
- t(): Seconds elapsed since boot (advances 1/30s per fixed update tick)
- flr(x): Floor number to integer
- mid(a, b, c): Returns middle (clamped) value of three numbers
- rnd([n]): Random float 0 <= r < n (default n=1)
- noise3(x, y, z): 3D value noise (-1.0 to 1.0)
- stat(n): Diagnostics (0=fps, 1=updateMs, 2=drawMs, 3=compositeMs, 4=lastInputSource)
- dset(key, val): Save numeric value to cart storage
- dget(key): Read numeric value from cart storage (0 if unset)
- printh(str): Log debug string to host console`
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
            version: '0.1.4'
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
