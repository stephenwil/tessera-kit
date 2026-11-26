import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

import { initProject } from './init.js';
import { assembleProject } from './project.js';
import { packCartCli } from './pack.js';
import { exportHtmlCli } from './export.js';
import { checkCartCli, checkCartRuntimeCli } from './check.js';
import { parseVox, convertMultiVox } from './cart/vox.js';
import { fetchSampleCatalog, downloadSampleCart, pullSampleCli, formatCatalogTable } from './samples.js';
import { renderCartPreview, renderModelPreview } from './preview.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getServerVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'));
    return pkg.version || '0.1.6';
  } catch {
    return '0.1.6';
  }
}

const API_DOCS = {
  map: `Map Layer API (persistent 256x256x128 world volume, x=east, y=north, z=up):
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
- model(id, x, y, z, [rot], [flip], [frame]): Draw animated voxel model instance (rot 0..3 = 90deg steps)
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
- sun(dx, dy, dz, [strength]): Set directional sun vector and shadow strength (typical range 0..1.5, default 1)
- sky(top, bottom): Set sky gradient using two palette indices
- fog(c, density): Set distance fog palette index and density (0 disables)
- pal(i, r, g, b): Dynamically modify RGB (0..255) for palette slot i (1..255)
- palt(): Reset runtime palette overrides back to cart palette
- pswap([a], [b]): Remap draw color a -> b (call with no args to reset all remaps)
- quality([preset]): Get or set render quality ("standard" or "hq" for native DPR + soft AO + soft shadows)`,

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
- axis(n, [player]): Analog stick / pad axis in -1..1:
  - axis(0): -1 = Left (btn 0), +1 = Right (btn 1)
  - axis(1): +1 = Up (btn 2), -1 = Down (btn 3)
  - Note: Keyboard Arrows/WASD drive BOTH btn(0..3) and axis(0..1) automatically.`,

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
- printh(str): Log debug string to host console`,

  cart_format: `Tessera Project & Cart Format (tessera.json -> tessera cart v1):
- tessera.json fields:
  id, title, author, version, players (1..4), quality ("standard" | "hq"),
  lua: ["src/main.lua"], palette: "assets/palette.txt",
  models: { "hero": "models/hero.txt" | "models/hero.vox" },
  sfx: "assets/sfx.txt", music: "assets/music.txt"
- Palette file (assets/palette.txt): "<index> <rrggbb>" (indices 1..255; 0 is air)
- Text Model file (models/<id>.txt):
  <id> <w>x<d>x<h> [frames=N] [pivot=px,py,pz]
  Z-slices from z=0..h-1 separated by blank lines; each slice has d rows of w tokens (".." = air, 2-digit hex palette index e.g. "0a"). Multiple frames separated by a line containing "frame".
- SFX file (assets/sfx.txt): "<id> <square|triangle|saw|noise> <f0>><f1> <dur> <vol>"
- Music tracker file (assets/music.txt):
  inst <id> wave=<sq25|sq50|sq12|tri|saw|nse> [adsr=a,d,s,r]
  pat <id> speed=<ticks> rows=<N>
  00 | C-4 0 vA | ... | ... | ...
  song <id> [title="..."] speed=<ticks> [loop=0]
  order 0 1 0 2
- Lifecycle callbacks in Lua 5.4: _init(), _update() (fixed 30 Hz), _draw()`
};

const TOOLS = [
  {
    name: 'tessera_init_cart',
    description: 'Scaffold a new Tessera High-Res cart project with manifest, Lua loop, palette, and VS Code settings. Optionally start from any playable showcase cart via template.',
    inputSchema: {
      type: 'object',
      properties: {
        directory: { type: 'string', description: 'Directory path where the new cart will be created.' },
        name: { type: 'string', description: 'Identifier for the cart (e.g. "space-miner").' },
        title: { type: 'string', description: 'Display title for the game (e.g. "Space Miner").' },
        author: { type: 'string', description: 'Creator / author name.' },
        template: { type: 'string', description: 'Optional showcase sample cart ID (from tessera_list_samples) to unpack as the starting template.' }
      },
      required: ['directory']
    }
  },
  {
    name: 'tessera_list_samples',
    description: 'List all playable sample carts from the live Tessera Showcase catalog (IDs, titles, genres, sizes, descriptions).',
    inputSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'Optional override for the showcase catalog base URL.' }
      }
    }
  },
  {
    name: 'tessera_pull_sample',
    description: 'Download a playable sample cart from the Tessera Showcase, unpack it into an editable project, or inspect its Lua/palette/models as a reference.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Sample cart ID (e.g. "bramblecourt", "moonlitgarden", "prismrelay").' },
        projectDir: { type: 'string', description: 'Directory path to unpack the sample into an editable tessera.json project.' },
        outputPath: { type: 'string', description: 'Optional output file path when downloading raw .tess or .tess.png.' },
        png: { type: 'boolean', description: 'Download the steganographic .tess.png picture cart instead of .tess text.' },
        inspectOnly: { type: 'boolean', description: 'If true, do not write files; return metadata, palette summary, and Lua code snippet for study.' },
        maxChars: { type: 'number', description: 'Max characters to return when inspectOnly is true (default: 6000).' },
        baseUrl: { type: 'string', description: 'Optional override for the showcase catalog base URL.' }
      },
      required: ['id']
    }
  },
  {
    name: 'tessera_check_cart',
    description: 'Validate cart structure, manifest files, balanced Lua blocks, common API typos, and optionally boot the cart in headless WebGL2 Chromium (runtime: true) to catch real Lua 5.4 syntax and runtime errors.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to a .tess file or a project directory containing tessera.json (defaults to ".").' },
        runtime: { type: 'boolean', description: 'If true, boot the cart in headless Chromium for several frames to catch real Lua 5.4 syntax/runtime errors.' },
        frames: { type: 'number', description: 'Number of frames to step when runtime is true (default: 3).' },
        keys: { type: 'string', description: 'Optional scripted key inputs during runtime check, e.g. "ArrowRight:10,Space:2" (omitting ":N" defaults to 10 frames; use ":1" for discrete button taps).' }
      }
    }
  },
  {
    name: 'tessera_render_preview',
    description: 'Boot a Tessera cart in headless WebGL2 Chromium (at speed=4, so each rendered frame advances ~4 simulation ticks / ~0.13s of game time), step initial settle frames followed by optional scripted key inputs, verify zero Lua/console errors, and return a rendered 768x432 PNG screenshot image.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to a .tess file or a project directory containing tessera.json (defaults to ".").' },
        frames: { type: 'number', description: 'Initial settle frames to render before sending keys or capturing screenshot (default: 4; ~0.13s game time per frame at speed=4).' },
        keys: { type: 'string', description: 'Optional comma-separated key inputs run after initial frames, e.g. "Space:2,ArrowRight:6" or "z:1,ArrowRight:1,z:1" (each step holds the key for N rendered frames at ~4 sim ticks/frame, followed by 1 settle frame; omitting ":N" defaults to 10 frames, so use ":1" or ":2" for discrete puzzle/menu taps).' },
        quality: { type: 'string', enum: ['standard', 'hq'], description: 'Optional render quality override ("standard" or "hq").' },
        filmstrip: { type: ['boolean', 'number'], description: 'Set true (4 frames) or a number 2..6 to capture a labeled multi-frame contact sheet showing motion/animation across frames in a single call. When paired with keys, captures frame 1 before keys and one frame after each key step.' },
        filmstripStep: { type: 'number', description: 'Frames between filmstrip captures when keys is not specified (default: 3).' },
        outputPath: { type: 'string', description: 'Optional path to save the rendered PNG screenshot to disk (alias: output).' }
      }
    }
  },
  {
    name: 'tessera_preview_model',
    description: 'Render a 4-angle studio turntable contact sheet (0°, 90°, 180°, 270°) of a standalone .txt voxel model, .vox file, or named model inside a cart/project so you can inspect voxel silhouettes and shading before placing them in a scene.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to a .txt model file, .vox file, .tess cart, or project directory.' },
        palettePath: { type: 'string', description: 'Optional path to assets/palette.txt or .tess cart (auto-detected for .txt models inside a project).' },
        modelId: { type: 'string', description: 'Optional model ID when inspecting a .tess cart or project directory.' },
        frame: { type: 'number', description: 'Animation frame index to render (default: 0).' },
        quality: { type: 'string', enum: ['standard', 'hq'], description: 'Render quality (default: "hq").' },
        outputPath: { type: 'string', description: 'Optional path to save the rendered 4-angle PNG contact sheet (alias: output).' }
      },
      required: ['path']
    }
  },
  {
    name: 'tessera_assemble_cart',
    description: 'Assemble a multi-file Tessera project into the canonical plain text .tess cartridge format.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to project directory containing tessera.json (aliases: projectDir, directory; defaults to ".").' },
        projectDir: { type: 'string', description: 'Alias for path.' }
      }
    }
  },
  {
    name: 'tessera_pack_cart',
    description: 'Pack a cart into a shareable 256x256 steganographic .tess.png picture cart with an official Tessera cartridge label. Pass autoLabel: true to automatically render live voxel cover art, or pass any screenshot PNG (e.g. 768x432) or custom 256x256 PNG via labelPath.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to .tess file or project directory (aliases: cartPath, projectDir, directory; defaults to ".").' },
        cartPath: { type: 'string', description: 'Alias for path.' },
        autoLabel: { type: 'boolean', description: 'If true (and labelPath is omitted), automatically render a headless preview frame and frame it into the official 256x256 Tessera cartridge label.' },
        frames: { type: 'number', description: 'Frames to render before capturing autoLabel cover art (default: 5).' },
        keys: { type: 'string', description: 'Optional scripted key inputs before capturing autoLabel cover art.' },
        quality: { type: 'string', enum: ['standard', 'hq'], description: 'Optional render quality override for autoLabel.' },
        labelPath: { type: 'string', description: 'Optional PNG cover image (256x256 used verbatim; other sizes like 768x432 are framed into the official Tessera label).' },
        outputPath: { type: 'string', description: 'Optional output .tess.png file path (alias: output).' }
      }
    }
  },
  {
    name: 'tessera_export_html',
    description: 'Export an offline, self-contained standalone single-file .html runner playable anywhere without a server.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to .tess file or project directory (aliases: cartPath, projectDir, directory; defaults to ".").' },
        cartPath: { type: 'string', description: 'Alias for path.' },
        outputPath: { type: 'string', description: 'Optional output .html file path (alias: output).' }
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
    description: 'Look up API documentation, signatures, cart format specs, and code examples for Tessera High-Res Lua subsystems.',
    inputSchema: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          enum: ['all', 'map', 'draw', 'collision', 'camera', 'hud', 'input', 'audio', 'math', 'cart_format'],
          description: 'The API subsystem or format reference to query.'
        }
      }
    }
  }
];

const PROMPTS = [
  {
    name: 'create-voxel-game',
    description: 'Guided end-to-end workflow to design, build, visually inspect, and package a new 3D voxel game for Tessera High-Res.',
    arguments: [
      { name: 'concept', description: 'Short game idea (e.g. "cozy lighthouse delivery game" or "isometric lava-floor arena")', required: true },
      { name: 'directory', description: 'Target project directory (default: "./my-tessera-game")', required: false }
    ]
  },
  {
    name: 'remix-showcase-cart',
    description: 'Pull a playable Tessera Showcase cart, study how it works, apply a creative remix, verify visually, and package.',
    arguments: [
      { name: 'sample_id', description: 'Showcase cart ID (e.g. "bramblecourt", "moonlitgarden", "prismrelay")', required: true },
      { name: 'twist', description: 'How to remix or transform the game', required: true },
      { name: 'directory', description: 'Target directory for the remixed project', required: false }
    ]
  },
  {
    name: 'visual-polish-pass',
    description: 'Render an existing Tessera cart, critique its camera framing, lighting, palette contrast, voxel depth, and HUD, then improve and re-verify.',
    arguments: [
      { name: 'path', description: 'Path to the .tess cart or project directory', required: true }
    ]
  }
];

export function getPromptResult(name, args = {}) {
  switch (name) {
    case 'create-voxel-game': {
      const concept = args.concept || 'an atmospheric isometric voxel arcade game';
      const dir = args.directory || './my-tessera-game';
      return {
        description: `Create a new Tessera High-Res voxel game: ${concept}`,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: [
                `Build a complete, polished, playable 3D voxel game for Tessera High-Res in "${dir}" based on this concept: ${concept}.`,
                '',
                'Follow this MCP workflow:',
                '1. Call `tessera_api_docs` (topic: "all") so you use exact Tessera Lua 5.4 APIs (camera, sun, sky, fog, quality("hq"), mbox, sphere, model, collision, audio/music, HUD).',
                '2. Optionally call `tessera_list_samples` and `tessera_pull_sample` (inspectOnly: true) on a small sample to reference idioms.',
                `3. Call \`tessera_init_cart\` in "${dir}" to scaffold the project.`,
                '4. Author a rich cohesive palette (`assets/palette.txt`), persistent 3D voxel environment (`_init`), responsive gameplay loop (`_update` at 30Hz), dynamic voxels + crisp HUD (`_draw`), and optional SFX/music (`assets/sfx.txt`, `assets/music.txt`). Enable `quality("hq")` for soft shadows & AO when appropriate.',
                '5. Call `tessera_preview_model` to inspect custom `.txt`/`.vox` models from 4 studio angles, then call `tessera_render_preview` (with `keys` and/or `filmstrip: true`) to verify motion, gameplay inputs, and visual framing.',
                '6. Critique your own screenshot (camera framing, silhouette readability, lighting contrast, HUD layout), refine the code, and re-run `tessera_render_preview` until it looks great with zero errors.',
                '7. Finish by calling `tessera_pack_cart` with `autoLabel: true` (emits `.tess` + collector-grade `.tess.png` with live voxel cover art) and `tessera_export_html` (emits standalone playable `.html`).'
              ].join('\n')
            }
          }
        ]
      };
    }

    case 'remix-showcase-cart': {
      const sampleId = args.sample_id || 'bramblecourt';
      const twist = args.twist || 're-theme the biome, palette, and gameplay mechanics';
      const dir = args.directory || `./${sampleId}-remix`;
      return {
        description: `Remix showcase cart "${sampleId}"`,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: [
                `Remix the Tessera Showcase cart "${sampleId}" in "${dir}" with this twist: ${twist}.`,
                '',
                'Workflow:',
                `1. Call \`tessera_pull_sample\` with id="${sampleId}" and projectDir="${dir}".`,
                '2. Call `tessera_render_preview` on the pulled project to see the baseline game.',
                '3. Read `src/main.lua`, `assets/palette.txt`, and `tessera.json`, then implement the remix (update title/id/palette/mechanics/visuals).',
                '4. Call `tessera_preview_model` on any new custom voxel models and `tessera_render_preview` (with gameplay `keys` and `filmstrip: true`) to visually verify motion, zero runtime errors, and crisp framing.',
                '5. Package with `tessera_pack_cart` (`autoLabel: true`) and `tessera_export_html`.'
              ].join('\n')
            }
          }
        ]
      };
    }

    case 'visual-polish-pass': {
      const target = args.path || '.';
      return {
        description: `Visual polish pass for ${target}`,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: [
                `Perform a visual polish pass on the Tessera cart at "${target}":`,
                '1. Call `tessera_render_preview` to capture the current look.',
                '2. Critique camera zoom/yaw, sun direction, sky/fog palette cohesion, ground/architecture layering, focal contrast, and HUD legibility.',
                '3. Apply focused visual upgrades (e.g. `quality("hq")`, richer palette shading, height variation, particles, cleaner HUD).',
                '4. Call `tessera_render_preview` again to confirm the improvement and zero errors.'
              ].join('\n')
            }
          }
        ]
      };
    }

    default:
      throw new Error(`Unknown prompt: ${name}`);
  }
}

function resolvePathArg(args, fallback = '.') {
  return args.path || args.directory || args.dir || args.projectDir || args.cartPath || args.input || fallback;
}

export async function handleToolCall(name, args = {}) {
  switch (name) {
    case 'tessera_init_cart': {
      const targetDir = resolvePathArg(args, '.');
      if (args.template) {
        const res = await pullSampleCli(args.template, {
          project: targetDir,
        });
        return {
          text: `Successfully initialized Tessera cart project from showcase template "${res.entry.title}" (${res.entry.id}) in ${res.dir}\n- ID: ${res.id}\n- Title: ${res.title}\n- Models: ${res.modelsCount}\n- SFX: ${res.hasSfx ? 'yes' : 'no'}\n- Music: ${res.hasMusic ? 'yes' : 'no'}`
        };
      }
      const res = initProject(targetDir, {
        name: args.name || args.id,
        title: args.title,
        author: args.author
      });
      return {
        text: `Successfully initialized Tessera cart project in ${res.dir}\n- ID: ${res.id}\n- Title: ${res.title}\n- Manifest: tessera.json\n- Entrypoint: src/main.lua`
      };
    }

    case 'tessera_list_samples': {
      const samples = await fetchSampleCatalog({ baseUrl: args.baseUrl });
      const table = formatCatalogTable(samples);
      const descs = samples.map((s) => `- ${s.id} (${s.title}): ${s.description || s.genre || ''}`).join('\n');
      return {
        text: `Tessera Showcase Samples (${samples.length} carts):\n\n${table}\n\nDescriptions:\n${descs}`
      };
    }

    case 'tessera_pull_sample': {
      if (args.inspectOnly) {
        const { entry, cartText } = await downloadSampleCart(args.id, { baseUrl: args.baseUrl, png: false });
        const limit = Math.max(500, Number(args.maxChars) || 6000);
        const body = cartText.length > limit
          ? `${cartText.slice(0, limit)}\n\n... [Truncated ${cartText.length - limit} chars; pass projectDir to unpack full source]`
          : cartText;
        return {
          text: `Showcase Sample "${entry.title}" (${entry.id}) — ${entry.genre || 'Cart'}\n${entry.description || ''}\n\n${body}`
        };
      }
      const res = await pullSampleCli(args.id, {
        baseUrl: args.baseUrl,
        png: Boolean(args.png),
        project: args.projectDir || args.directory || args.dir || args.path || false,
        out: args.outputPath || args.output || null,
      });
      if (res.mode === 'project') {
        return {
          text: `✓ Unpacked showcase cart "${res.entry.title}" (${res.entry.id}) into ${res.dir}\n- Manifest: tessera.json\n- Entrypoint: src/main.lua\n- Models: ${res.modelsCount}\n- SFX: ${res.hasSfx ? 'assets/sfx.txt' : 'none'}\n- Music: ${res.hasMusic ? 'assets/music.txt' : 'none'}`
        };
      }
      return {
        text: `✓ Downloaded "${res.entry.title}" (${Math.max(1, Math.ceil(res.fileSize / 1024))} KiB) to ${res.outputPath}`
      };
    }

    case 'tessera_check_cart': {
      const target = resolvePathArg(args, '.');
      const res = args.runtime
        ? await checkCartRuntimeCli(target, { frames: args.frames, keys: args.keys })
        : checkCartCli(target);
      if (res.ok) {
        const runtimeLine = res.runtime
          ? `\n- Runtime: ✓ Booted cleanly (${res.runtime.frames} frames in ${res.runtime.elapsedMs} ms, state=${res.runtime.state})`
          : '';
        return {
          text: `✓ Cart check passed!\n- ID: ${res.parsed?.meta?.id || 'unknown'}\n- Title: ${res.parsed?.meta?.title || 'untitled'}\n- Lua lines: ${res.parsed?.lua?.split('\n').length || 0}\n- Models: ${res.parsed?.models?.length || 0}\n- Palette overrides: ${res.parsed?.palette?.size || 0}${runtimeLine}\n- Warnings: ${res.warnings?.length ? res.warnings.join('; ') : 'none'}`
        };
      } else {
        return {
          text: `✗ Cart check failed:\n${res.errors.map(e => `  - ${e}`).join('\n')}${res.warnings?.length ? `\nWarnings:\n${res.warnings.map(w => `  - ${w}`).join('\n')}` : ''}`,
          isError: true
        };
      }
    }

    case 'tessera_render_preview': {
      const target = resolvePathArg(args, '.');
      const res = await renderCartPreview(target, {
        frames: args.frames ?? 4,
        keys: args.keys,
        quality: args.quality,
        filmstrip: args.filmstrip ?? false,
        filmstripStep: args.filmstripStep,
        out: args.outputPath || args.output || null,
        screenshot: true,
      });
      const summary = [
        res.ok
          ? `✓ Rendered preview for "${res.meta?.title || target}" (${res.width}x${res.height}, ${res.frames} frames in ${res.elapsedMs} ms)`
          : `✗ Cart runtime error while rendering "${res.meta?.title || target}" (state=${res.state})`,
        `- State: ${res.state}`,
        `- Frames rendered: ${res.frames} (hash: 0x${(res.frameHash >>> 0).toString(16)})`,
      ];
      if (res.outputPath) summary.push(`- Saved PNG: ${res.outputPath}`);
      if (res.errorText) {
        const cleanErr = String(res.errorText).split('\nR to restart')[0].trim();
        summary.push(`- Lua Error:\n${cleanErr.split('\n').map((l) => `  ${l}`).join('\n')}`);
      }
      if (res.consoleErrors?.length) {
        summary.push(`- Console Errors:\n${res.consoleErrors.map((e) => `  - ${e}`).join('\n')}`);
      }
      if (res.consoleLogs?.length) {
        summary.push(`- Console Logs (printh):\n${res.consoleLogs.slice(-10).map((l) => `  - ${l}`).join('\n')}`);
      }
      return {
        text: summary.join('\n'),
        images: res.pngBase64 ? [{ data: res.pngBase64, mimeType: 'image/png' }] : [],
        isError: !res.ok,
      };
    }

    case 'tessera_preview_model': {
      const target = resolvePathArg(args, '.');
      const res = await renderModelPreview(target, {
        palettePath: args.palettePath || args.palette || null,
        modelId: args.modelId || args.id || null,
        frame: args.frame ?? 0,
        quality: args.quality || 'hq',
        out: args.outputPath || args.output || null,
      });
      const summary = [
        `✓ Rendered 4-angle turntable for model "${res.model.id}" (${res.model.w}x${res.model.d}x${res.model.h}, ${res.model.voxels} voxels, frame ${res.model.renderedFrame + 1}/${res.model.frames})`,
        `- Sheet: ${res.width}x${res.height} in ${res.elapsedMs} ms`,
      ];
      if (res.outputPath) summary.push(`- Saved PNG: ${res.outputPath}`);
      return {
        text: summary.join('\n'),
        images: res.pngBase64 ? [{ data: res.pngBase64, mimeType: 'image/png' }] : [],
        isError: !res.ok,
      };
    }

    case 'tessera_assemble_cart': {
      const dir = path.resolve(process.cwd(), resolvePathArg(args, '.'));
      const text = assembleProject(dir);
      return {
        text: `Assembled cart (${text.length} characters):\n\n${text.slice(0, 500)}...\n[Truncated ${Math.max(0, text.length - 500)} characters]`
      };
    }

    case 'tessera_pack_cart': {
      const target = resolvePathArg(args, '.');
      const label = args.labelPath || args.label || null;
      const out = args.outputPath || args.output || null;
      const res = await packCartCli(target, label, out, {
        autoLabel: Boolean(args.autoLabel),
        frames: args.frames,
        keys: args.keys,
        quality: args.quality,
      });
      const lines = [
        '✓ Packed picture cart successfully:',
        `- Output: ${res.outputPath}`,
        `- Label: ${res.labelSource}`,
        `- File size: ${Math.ceil(res.fileSize / 1024)} KiB`,
        `- Capacity: ${Math.ceil(res.capacity / 1024)} KiB`,
      ];
      if (res.labelWarning) lines.push(`- Warning: ${res.labelWarning}`);
      return {
        text: lines.join('\n'),
        images: (args.autoLabel || label) && res.pngBase64 ? [{ data: res.pngBase64, mimeType: 'image/png' }] : [],
      };
    }

    case 'tessera_export_html': {
      const target = resolvePathArg(args, '.');
      const out = args.outputPath || args.output || null;
      const res = exportHtmlCli(target, out);
      return {
        text: `✓ Exported standalone offline HTML runner:\n- Output: ${res.outputPath}\n- File size: ${(res.fileSize / (1024 * 1024)).toFixed(2)} MB`
      };
    }

    case 'tessera_inspect_vox': {
      const voxArg = args.voxPath || args.path;
      const fullPath = path.resolve(process.cwd(), voxArg);
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
      const dir = path.resolve(process.cwd(), resolvePathArg(args, '.'));
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
          } else if (spec && spec.file && String(spec.file).endsWith('.vox')) {
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
          capabilities: { tools: {}, prompts: {} },
          serverInfo: {
            name: '@stephenwil/tessera-mcp',
            version: getServerVersion()
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

    if (method === 'prompts/list') {
      send({
        jsonrpc: '2.0',
        id,
        result: {
          prompts: PROMPTS
        }
      });
      return;
    }

    if (method === 'prompts/get') {
      try {
        const promptResult = getPromptResult(params?.name, params?.arguments || {});
        send({
          jsonrpc: '2.0',
          id,
          result: promptResult
        });
      } catch (err) {
        send({
          jsonrpc: '2.0',
          id,
          error: {
            code: -32602,
            message: err.message
          }
        });
      }
      return;
    }

    if (method === 'tools/call') {
      const toolName = params?.name;
      const toolArgs = params?.arguments || {};
      try {
        const result = await handleToolCall(toolName, toolArgs);
        const content = [{ type: 'text', text: result.text }];
        if (Array.isArray(result.images)) {
          for (const img of result.images) {
            content.push({
              type: 'image',
              data: img.data,
              mimeType: img.mimeType || 'image/png',
            });
          }
        }
        send({
          jsonrpc: '2.0',
          id,
          result: {
            content,
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
