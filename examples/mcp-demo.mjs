#!/usr/bin/env node
/**
 * Minimal end-to-end demo of driving @stephenwil/tessera-mcp over stdio JSON-RPC.
 *
 * Run from the repo root:
 *   node examples/mcp-demo.mjs
 *
 * Demonstrates:
 *   1. MCP initialize handshake + tools/list + prompts/list
 *   2. Fetching API docs (tessera_api_docs)
 *   3. Scaffolding a project (tessera_init_cart)
 *   4. Rendering a 4-frame filmstrip preview (tessera_render_preview with filmstrip: true)
 *   5. Packing a collector-grade picture cart with live voxel cover art (tessera_pack_cart with autoLabel: true)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mcpBin = path.resolve(__dirname, '../packages/tessera/bin/tessera.mjs');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tessera-mcp-demo-'));

const proc = spawn('node', [mcpBin, 'mcp'], { stdio: ['pipe', 'pipe', 'inherit'] });

let buffer = '';
let nextId = 1;
const pending = new Map();

proc.stdout.on('data', (chunk) => {
  buffer += chunk.toString();
  let nl;
  while ((nl = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id !== undefined && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    } catch {}
  }
});

function rpc(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout on ${method}`)), 45000);
    pending.set(id, (msg) => {
      clearTimeout(timer);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    });
    proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}

function callTool(name, args = {}) {
  return rpc('tools/call', { name, arguments: args });
}

try {
  const init = await rpc('initialize', {
    protocolVersion: '2024-11-05',
    clientInfo: { name: 'tessera-mcp-demo', version: '1.0.0' },
  });
  console.log(`Connected to ${init.serverInfo.name} v${init.serverInfo.version}`);

  const { tools } = await rpc('tools/list');
  const { prompts } = await rpc('prompts/list');
  console.log(`Available: ${tools.length} tools, ${prompts.length} prompts`);

  const gameDir = path.join(outDir, 'demo-game');
  const scaffold = await callTool('tessera_init_cart', {
    path: gameDir,
    name: 'demo-game',
    title: 'MCP Demo',
    author: 'MCP Example',
  });
  console.log(scaffold.content[0].text);

  const check = await callTool('tessera_check_cart', { path: gameDir, runtime: true });
  console.log(check.content[0].text);

  const filmstripPath = path.join(outDir, 'filmstrip.png');
  const preview = await callTool('tessera_render_preview', {
    path: gameDir,
    frames: 2,
    filmstrip: 4,
    outputPath: filmstripPath,
  });
  console.log(preview.content[0].text);

  const packed = await callTool('tessera_pack_cart', {
    path: gameDir,
    autoLabel: true,
  });
  console.log(packed.content[0].text);
  console.log(`\nDemo artifacts written under: ${outDir}`);
} finally {
  proc.kill();
}
