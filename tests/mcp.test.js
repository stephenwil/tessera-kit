import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { handleToolCall } from '../packages/tessera/src/mcp.js';

test('MCP Tool Handlers: docs, init, check, assemble, pack', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tessera-mcp-test-'));

  // 1. API docs lookup
  const docResult = await handleToolCall('tessera_api_docs', { topic: 'collision' });
  assert.ok(docResult.text.includes('raycast3d'), 'Should contain raycast3d in collision docs');
  assert.ok(docResult.text.includes('check_box'), 'Should contain check_box');

  const camDoc = await handleToolCall('tessera_api_docs', { topic: 'camera' });
  assert.ok(camDoc.text.includes('camera(x, y, z'), 'Camera docs should document real camera() API');
  assert.equal(camDoc.text.includes('camtarget'), false, 'Camera docs must not list nonexistent camtarget');

  // 2. Project init tool
  const gameDir = path.join(tmpDir, 'test-game');
  const initResult = await handleToolCall('tessera_init_cart', {
    directory: gameDir,
    name: 'test-game',
    title: 'Test Game',
    author: 'AI Agent'
  });
  assert.ok(initResult.text.includes('Successfully initialized'), 'Should confirm init');
  assert.ok(fs.existsSync(path.join(gameDir, 'tessera.json')), 'tessera.json should exist');

  // 3. Cart check tool
  const checkResult = await handleToolCall('tessera_check_cart', { path: gameDir });
  assert.ok(checkResult.text.includes('Cart check passed'), 'Cart check should pass');

  // 4. Cart assemble tool
  const assembleResult = await handleToolCall('tessera_assemble_cart', { projectDir: gameDir });
  assert.ok(assembleResult.text.includes('Assembled cart'), 'Cart assemble should succeed');

  // 5. Cart pack tool
  const packResult = await handleToolCall('tessera_pack_cart', { cartPath: gameDir });
  assert.ok(packResult.text.includes('Packed picture cart successfully'), 'Cart pack should succeed');
  assert.ok(fs.existsSync(path.join(gameDir, 'dist', 'test-game.tess.png')), 'dist/test-game.tess.png should exist');

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('MCP Protocol JSON-RPC Stdio Handshake & Tool Calling', async (t) => {
  const mcpBin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../packages/tessera/bin/tessera.mjs');
  const proc = spawn('node', [mcpBin, 'mcp'], {
    stdio: ['pipe', 'pipe', 'inherit']
  });

  const responses = [];
  proc.stdout.on('data', (chunk) => {
    const lines = chunk.toString().split('\n');
    for (const l of lines) {
      if (l.trim()) {
        try {
          responses.push(JSON.parse(l.trim()));
        } catch {}
      }
    }
  });

  function sendReq(obj) {
    proc.stdin.write(JSON.stringify(obj) + '\n');
  }
  async function waitForResponse(id, timeoutMs = 3000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const hit = responses.find((r) => r.id === id);
      if (hit) return hit;
      await new Promise((r) => setTimeout(r, 25));
    }
    return undefined;
  }

  // 1. Send initialize
  sendReq({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      clientInfo: { name: 'test-client', version: '1.0.0' }
    }
  });

  // Wait for init response
  const initResp = await waitForResponse(1);
  assert.ok(initResp, 'Should receive initialize response');
  assert.equal(initResp.result.serverInfo.name, '@stephenwil/tessera-mcp');

  // 2. Send tools/list
  sendReq({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list'
  });

  const listResp = await waitForResponse(2);
  assert.ok(listResp, 'Should receive tools/list response');
  const toolNames = listResp.result.tools.map((x) => x.name);
  assert.ok(toolNames.includes('tessera_init_cart'), 'Should list tessera_init_cart');
  assert.ok(toolNames.includes('tessera_check_cart'), 'Should list tessera_check_cart');
  assert.ok(toolNames.includes('tessera_pack_cart'), 'Should list tessera_pack_cart');
  assert.ok(toolNames.includes('tessera_api_docs'), 'Should list tessera_api_docs');

  // 3. Send tools/call
  sendReq({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'tessera_api_docs',
      arguments: { topic: 'map' }
    }
  });

  const callResp = await waitForResponse(3);
  assert.ok(callResp, 'Should receive tools/call response');
  assert.ok(callResp.result.content[0].text.includes('mset'), 'Should return map API documentation');

  proc.stdin.end();
  proc.kill();
});
