#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initProject } from '../src/init.js';
import { packCartCli, unpackCartCli } from '../src/pack.js';
import { importVoxCli } from '../src/vox.js';
import { exportHtmlCli } from '../src/export.js';
import { checkCartCli, checkCartRuntimeCli } from '../src/check.js';
import { renderCartPreview } from '../src/preview.js';
import { startDevCli } from '../src/dev.js';
import { startMcpServer } from '../src/mcp.js';
import { fetchSampleCatalog, pullSampleCli, formatCatalogTable, DEFAULT_SHOWCASE_URL } from '../src/samples.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getCliVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const HELP = `
Tessera CLI: Developer tools for the Tessera High-Res Voxel Fantasy Console

Usage:
  tessera init <directory>        Scaffold a new Tessera cart project (--template <id>)
  tessera samples                 List playable sample carts from the Tessera Showcase
  tessera pull <id> [target]      Download a showcase sample cart (.tess, --png, or --project)
  tessera dev [path]              Start local development server with hot-reload
  tessera pack <cart> [label]     Pack .tess cart into a .tess.png picture cart (--auto-label)
  tessera unpack <picture-cart>   Extract .tess text from a .tess.png picture cart
  tessera vox <file.vox...>       Convert MagicaVoxel .vox model(s) to Tessera format
  tessera export <cart>           Export offline standalone single-file .html runner
  tessera check [cart]            Validate cart syntax (--runtime boots headless WebGL2)
  tessera preview [cart]          Render a headless 768x432 PNG preview screenshot
  tessera mcp                     Start Model Context Protocol (MCP) server over stdio

Options:
  -o, --out <path>                Specify output file or directory path
  -p, --port <number>             Dev server port (default: 3000)
  -h, --host <address>            Dev server host address (default: 0.0.0.0)
  -t, --template <id>             Start from a showcase sample cart (used with init)
  --project [dir]                 Unpack pulled sample into an editable cart project
  --png                           Download steganographic .tess.png picture cart (with pull)
  --json                          Output sample catalog as JSON (with samples)
  --runtime                       Boot cart in headless Chromium during check
  --frames <number>               Frames to step before preview screenshot (default: 4)
  --keys <spec>                   Scripted inputs for preview/check (e.g. "ArrowRight:8,Space:3")
  --quality <standard|hq>         Override render quality for preview
  --auto-label                    Render headless cover art automatically during pack
  --registry <url>                Override showcase catalog base URL
  --name <name>                   Specify cart / model identifier
  --pivot <x,y,z>                 Specify model pivot point
  --pal <cart.tess>               Conform models to an existing cart palette
  --gen-pal                       Generate __pal__ section with deduplicated colors
  --max-colors <number>           Maximum palette color budget (default: 255)
  --version, -v                   Print CLI version
  --help                          Show this help message
`;

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') {
    console.log(HELP);
    process.exit(0);
  }

  if (cmd === '--version' || cmd === '-v' || cmd === 'version') {
    console.log(`tessera v${getCliVersion()}`);
    process.exit(0);
  }

  const options = {};
  const positional = [];
  const flagsWithValue = new Set([
    '-o', '--out',
    '-p', '--port',
    '-h', '--host',
    '-t', '--template',
    '--project',
    '--registry',
    '--name',
    '--pivot',
    '--label',
    '--pal',
    '--max-colors',
    '--frames',
    '--keys',
    '--quality',
  ]);

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const eqIdx = arg.indexOf('=');
      if (eqIdx !== -1) {
        options[arg.slice(0, eqIdx)] = arg.slice(eqIdx + 1);
      } else if (flagsWithValue.has(arg) && i + 1 < args.length && !args[i + 1].startsWith('-')) {
        options[arg] = args[++i];
      } else {
        options[arg] = true;
      }
    } else if (arg.startsWith('-')) {
      if (flagsWithValue.has(arg) && i + 1 < args.length && !args[i + 1].startsWith('-')) {
        options[arg] = args[++i];
      } else {
        options[arg] = true;
      }
    } else {
      positional.push(arg);
    }
  }

  function getOption(flag, shortFlag) {
    return options[flag] ?? (shortFlag ? options[shortFlag] : null);
  }

  try {
    switch (cmd) {
      case 'init': {
        const template = getOption('--template', '-t');
        const targetDir = positional[0] || (template ? template : '.');
        if (template) {
          const baseUrl = getOption('--registry');
          const res = await pullSampleCli(template, {
            project: targetDir,
            baseUrl,
          });
          console.log(`✓ Scaffolded Tessera project from sample "${res.entry.title}" (${res.entry.id}) in ${res.dir}`);
          console.log(`  Cart ID: ${res.id}${res.modelsCount ? `, Models: ${res.modelsCount}` : ''}${res.hasMusic ? ', Tracker music included' : ''}`);
          console.log('  Next steps:');
          console.log(`    cd ${path.relative(process.cwd(), res.dir) || '.'}`);
          console.log('    npm install');
          console.log('    npm run dev');
          break;
        }
        const name = getOption('--name');
        const res = initProject(targetDir, { name });
        console.log(`✓ Scaffolded Tessera project in ${res.dir}`);
        console.log(`  Cart ID: ${res.id}`);
        console.log('  Next steps:');
        console.log(`    cd ${targetDir}`);
        console.log('    tessera dev');
        break;
      }

      case 'samples': {
        const baseUrl = getOption('--registry');
        const samples = await fetchSampleCatalog({ baseUrl });
        if (getOption('--json')) {
          console.log(JSON.stringify(samples, null, 2));
          break;
        }
        console.log(`\nTessera Showcase Samples (${baseUrl || process.env.TESSERA_SHOWCASE_URL || DEFAULT_SHOWCASE_URL}):\n`);
        console.log(formatCatalogTable(samples));
        console.log('\nDownload a cart:');
        console.log('  tessera pull <id>                  Download <id>.tess');
        console.log('  tessera pull <id> --png            Download <id>.tess.png picture cart');
        console.log('  tessera pull <id> --project [dir]  Unpack into an editable cart project\n');
        break;
      }

      case 'pull': {
        let sampleId = positional[0];
        let projectOpt = getOption('--project');
        let targetOut = getOption('--out', '-o') || positional[1];

        // Handle "tessera pull --project bramblecourt" gracefully
        if (!sampleId && typeof projectOpt === 'string') {
          sampleId = projectOpt;
          projectOpt = true;
        }

        if (!sampleId) {
          console.error('Error: specify a sample cart ID (e.g. tessera pull bramblecourt). Run "tessera samples" to list available carts.');
          process.exit(1);
        }

        const baseUrl = getOption('--registry');
        const png = Boolean(getOption('--png'));
        const res = await pullSampleCli(sampleId, {
          baseUrl,
          png,
          project: projectOpt,
          out: targetOut,
        });

        if (res.mode === 'project') {
          const relDir = path.relative(process.cwd(), res.dir) || '.';
          console.log(`✓ Unpacked "${res.entry.title}" (${res.entry.id}) into project ${res.dir}`);
          console.log(`  Files: tessera.json, src/main.lua${res.modelsCount ? `, ${res.modelsCount} model(s)` : ''}${res.hasSfx ? ', assets/sfx.txt' : ''}${res.hasMusic ? ', assets/music.txt' : ''}`);
          console.log('  Next steps:');
          console.log(`    cd ${relDir}`);
          console.log('    npm install');
          console.log('    npm run dev');
        } else {
          const relOut = path.relative(process.cwd(), res.outputPath) || res.outputPath;
          console.log(`✓ Downloaded "${res.entry.title}" (${Math.max(1, Math.ceil(res.fileSize / 1024))} KiB) -> ${res.outputPath}`);
          if (res.mode === 'cart') {
            console.log(`  Run it locally: tessera dev ${relOut}`);
          }
        }
        break;
      }

      case 'dev': {
        const targetPath = positional[0] || '.';
        const port = parseInt(getOption('--port', '-p') || '3000', 10);
        const host = getOption('--host', '-h') || '0.0.0.0';
        const serverInfo = await startDevCli(targetPath, { port, host });
        console.log(`\n  🎮 Tessera Dev Server running at:`);
        console.log(`  > Local:   http://localhost:${serverInfo.port}/`);
        console.log(`  > Network: http://${serverInfo.host}:${serverInfo.port}/`);
        console.log(`\n  Watching for file changes with live hot-reload... (Press Ctrl+C to stop)`);
        break;
      }

      case 'pack': {
        let cartPath = positional[0];
        if (!cartPath) {
          if (fs.existsSync(path.resolve(process.cwd(), "tessera.json"))) {
            cartPath = ".";
          } else {
            console.error('Error: specify cart path (e.g. tessera pack cart.tess)');
            process.exit(1);
          }
        }
        const labelPath = positional[1] || getOption('--label');
        const outPath = getOption('--out', '-o');
        const autoLabel = Boolean(getOption('--auto-label'));
        const res = await packCartCli(cartPath, labelPath, outPath, {
          autoLabel,
          frames: getOption('--frames') ? Number(getOption('--frames')) : 5,
          keys: getOption('--keys'),
          quality: getOption('--quality'),
        });
        console.log(`✓ Packed picture cart: ${res.outputPath} (label: ${res.labelSource})`);
        console.log(`  File size: ${Math.ceil(res.fileSize / 1024)} KiB (Capacity: ${Math.ceil(res.capacity / 1024)} KiB)`);
        if (res.labelWarning) console.warn(`  ⚠ ${res.labelWarning}`);
        break;
      }

      case 'unpack': {
        const pngPath = positional[0];
        if (!pngPath) {
          console.error('Error: specify picture cart path (e.g. tessera unpack cart.tess.png)');
          process.exit(1);
        }
        const outPath = getOption('--out', '-o');
        const res = await unpackCartCli(pngPath, outPath);
        console.log(`✓ Unpacked cart text: ${res.outputPath}`);
        break;
      }

      case 'vox': {
        const files = positional[0] === 'import' ? positional.slice(1) : positional;
        if (!files.length) {
          console.error('Error: specify .vox path(s) (e.g. tessera vox model1.vox model2.vox)');
          process.exit(1);
        }
        const name = getOption('--name');
        const pivot = getOption('--pivot');
        const pal = getOption('--pal');
        const genPal = !!getOption('--gen-pal');
        const maxColors = getOption('--max-colors');
        const out = getOption('--out', '-o');
        const res = importVoxCli(files, { name, pivot, pal, genPal, maxColors, out });
        if (out) {
          console.log(`✓ Imported ${res.modelCount} model(s) with ${res.paletteCount} palette color(s) (${res.uniqueColors} unique) to ${out}`);
        } else {
          console.log(res.text);
        }
        break;
      }

      case 'export': {
        let cartPath = positional[0];
        if (!cartPath) {
          if (fs.existsSync(path.resolve(process.cwd(), "tessera.json"))) {
            cartPath = ".";
          } else {
            console.error('Error: specify cart path (e.g. tessera export cart.tess)');
            process.exit(1);
          }
        }
        const outPath = getOption('--out', '-o');
        const res = exportHtmlCli(cartPath, outPath);
        console.log(`✓ Exported offline standalone cart: ${res.outputPath}`);
        console.log(`  File size: ${(res.fileSize / (1024 * 1024)).toFixed(2)} MB (self-contained, boots without server)`);
        break;
      }

      case 'check': {
        let cartPath = positional[0];
        if (!cartPath) {
          if (fs.existsSync(path.resolve(process.cwd(), "tessera.json"))) {
            cartPath = ".";
          } else {
            console.error('Error: specify cart path (e.g. tessera check cart.tess)');
            process.exit(1);
          }
        }
        const useRuntime = Boolean(getOption('--runtime'));
        const res = useRuntime
          ? await checkCartRuntimeCli(cartPath, {
              frames: getOption('--frames') ? Number(getOption('--frames')) : 3,
              keys: getOption('--keys'),
              quality: getOption('--quality'),
            })
          : checkCartCli(cartPath);
        if (res.ok) {
          console.log(`✓ Cart check passed: ${res.parsed.meta?.title || cartPath}`);
          console.log(`  Lua lines: ${res.parsed.lua.split('\n').length}, Models: ${res.parsed.models.length}, Palette overrides: ${res.parsed.palette.size}`);
          if (res.runtime) {
            console.log(`  Runtime: ✓ Booted cleanly (${res.runtime.frames} frames in ${res.runtime.elapsedMs} ms)`);
          }
          for (const warn of res.warnings) console.warn(`  ⚠ Warning: ${warn}`);
        } else {
          console.error(`✗ Cart check failed:`);
          for (const err of res.errors) console.error(`  - ${err}`);
          for (const warn of res.warnings) console.warn(`  ⚠ Warning: ${warn}`);
          process.exit(1);
        }
        break;
      }

      case 'preview': {
        let cartPath = positional[0];
        if (!cartPath) {
          if (fs.existsSync(path.resolve(process.cwd(), "tessera.json"))) {
            cartPath = ".";
          } else {
            console.error('Error: specify cart path (e.g. tessera preview cart.tess -o preview.png)');
            process.exit(1);
          }
        }
        const outPath = getOption('--out', '-o') || 'preview.png';
        const res = await renderCartPreview(cartPath, {
          frames: getOption('--frames') ? Number(getOption('--frames')) : 4,
          keys: getOption('--keys'),
          quality: getOption('--quality'),
          out: outPath,
          screenshot: true,
        });
        if (res.ok) {
          console.log(`✓ Rendered preview: ${res.outputPath} (${res.width}x${res.height}, ${res.frames} frames in ${res.elapsedMs} ms)`);
        } else {
          console.error(`✗ Preview hit runtime error (state=${res.state}, saved screenshot to ${res.outputPath}):`);
          if (res.errorText) console.error(String(res.errorText).split('\nR to restart')[0].trim());
          for (const ce of res.consoleErrors || []) console.error(`  - ${ce}`);
          process.exit(1);
        }
        break;
      }

      case 'mcp': {
        startMcpServer();
        break;
      }

      default:
        console.error(`Unknown command: '${cmd}'`);
        console.log(HELP);
        process.exit(1);
    }
  } catch (err) {
    console.error(`✗ Command failed: ${err.message}`);
    process.exit(1);
  }
}

main();
