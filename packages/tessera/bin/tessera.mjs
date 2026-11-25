#!/usr/bin/env node

import fs from 'node:fs';

import path from 'node:path';
import { initProject } from '../src/init.js';
import { packCartCli, unpackCartCli } from '../src/pack.js';
import { importVoxCli } from '../src/vox.js';
import { exportHtmlCli } from '../src/export.js';
import { checkCartCli } from '../src/check.js';
import { startDevCli } from '../src/dev.js';
import { startMcpServer } from '../src/mcp.js';

const HELP = `
Tessera CLI: Developer tools for the Tessera High-Res Voxel Fantasy Console

Usage:
  tessera init <directory>        Scaffold a new Tessera cart project
  tessera dev [path]              Start local development server with hot-reload
  tessera pack <cart> [label]     Pack .tess cart into a .tess.png picture cart
  tessera unpack <picture-cart>   Extract .tess text from a .tess.png picture cart
  tessera vox <file.vox...>       Convert MagicaVoxel .vox model(s) to Tessera format
  tessera export <cart>           Export offline standalone single-file .html runner
  tessera check <cart>            Validate cart syntax and run headless frame tests
  tessera mcp                     Start Model Context Protocol (MCP) server over stdio

Options:
  -o, --out <path>                Specify output file path
  -p, --port <number>             Dev server port (default: 3000)
  -h, --host <address>            Dev server host address (default: 0.0.0.0)
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
    console.log('tessera 1.0.0');
    process.exit(0);
  }

  const options = {};
  const positional = [];
  const flagsWithValue = new Set(['-o', '--out', '-p', '--port', '-h', '--host', '--name', '--pivot', '--label', '--template', '--pal', '--max-colors']);

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
        const targetDir = positional[0] || '.';
        const name = getOption('--name');
        const res = initProject(targetDir, { name });
        console.log(`✓ Scaffolded Tessera project in ${res.dir}`);
        console.log(`  Cart ID: ${res.id}`);
        console.log('  Next steps:');
        console.log(`    cd ${targetDir}`);
        console.log('    tessera dev');
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
        const res = await packCartCli(cartPath, labelPath, outPath);
        console.log(`✓ Packed picture cart: ${res.outputPath}`);
        console.log(`  File size: ${Math.ceil(res.fileSize / 1024)} KiB (Capacity: ${Math.ceil(res.capacity / 1024)} KiB)`);
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

      case 'check':
      case 'validate': {
        let cartPath = positional[0];
        if (!cartPath) {
          if (fs.existsSync(path.resolve(process.cwd(), "tessera.json"))) {
            cartPath = ".";
          } else {
            console.error('Error: specify cart path (e.g. tessera check cart.tess)');
            process.exit(1);
          }
        }
        console.log(`Checking ${cartPath}...`);
        const res = await checkCartCli(cartPath);
        if (res.ok) {
          console.log(`✓ Cart check passed: id="${res.parsed?.meta?.id || "unknown"}", title="${res.parsed?.meta?.title || "untitled"}"`);
        } else {
          console.error(`✗ Cart check failed:`);
          for (const err of res.errors) console.error(`  - ${err}`);
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
