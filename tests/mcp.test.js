import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { handleToolCall } from '../packages/tessera/src/mcp.js';
import { checkCartCli } from '../packages/tessera/src/check.js';
import { unpackCartCli } from '../packages/tessera/src/pack.js';
import { findChromeExecutable } from '../packages/tessera/src/preview.js';
import { composeContactSheet } from '../packages/tessera/src/shell/label.js';

test('MCP Tool Handlers: docs, init, static checks, assemble, pack', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tessera-mcp-test-'));

  try {
    // 1. API docs lookup (including cart_format)
    const docResult = await handleToolCall('tessera_api_docs', { topic: 'collision' });
    assert.ok(docResult.text.includes('raycast3d'), 'Should contain raycast3d in collision docs');
    assert.ok(docResult.text.includes('check_box'), 'Should contain check_box');

    const camDoc = await handleToolCall('tessera_api_docs', { topic: 'camera' });
    assert.ok(camDoc.text.includes('camera(x, y, z'), 'Camera docs should document real camera() API');
    assert.equal(camDoc.text.includes('camtarget'), false, 'Camera docs must not list nonexistent camtarget');

    const inputDoc = await handleToolCall('tessera_api_docs', { topic: 'input' });
    assert.ok(inputDoc.text.includes('axis(1): +1 = Up'), 'Input docs should specify axis(1) polarity');

    const fmtDoc = await handleToolCall('tessera_api_docs', { topic: 'cart_format' });
    assert.ok(fmtDoc.text.includes('tessera.json'), 'cart_format docs should describe tessera.json');
    assert.ok(fmtDoc.text.includes('__music__') || fmtDoc.text.includes('assets/music.txt'), 'cart_format docs should describe music');

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

    // 3. Static cart check catches unbalanced Lua & hallucinated APIs
    const checkResult = await handleToolCall('tessera_check_cart', { path: gameDir });
    assert.ok(checkResult.text.includes('Cart check passed'), 'Cart check should pass');

    const badLuaPath = path.join(tmpDir, 'unbalanced.tess');
    fs.writeFileSync(badLuaPath, 'tessera cart v1\n__meta__\nid=bad\ntitle=Bad\n__pal__\n1 112233\n__lua__\nfunction _draw()\n  cam(1,2,3)\n');
    const badCheck = checkCartCli(badLuaPath);
    assert.equal(badCheck.ok, false, 'Unbalanced Lua should fail static check');
    assert.ok(badCheck.errors.some((e) => e.includes('Unbalanced Lua blocks')), 'Should report unbalanced blocks');
    assert.ok(badCheck.warnings.some((w) => w.includes('camera(')), 'Should warn about hallucinated cam()');

    // 4. Cart assemble tool (testing unified path alias too)
    const assembleResult = await handleToolCall('tessera_assemble_cart', { path: gameDir });
    assert.ok(assembleResult.text.includes('Assembled cart'), 'Cart assemble should succeed');

    // 5. Cart pack tool (testing unified path alias + export alias)
    const packResult = await handleToolCall('tessera_pack_cart', { path: gameDir });
    const exportResult = await handleToolCall('tessera_export_html', { path: gameDir });
    assert.ok(exportResult.text.includes('Exported standalone offline HTML'), 'Export with path alias should succeed');
    assert.ok(packResult.text.includes('Packed picture cart successfully'), 'Cart pack should succeed');
    assert.ok(fs.existsSync(path.join(gameDir, 'dist', 'test-game.tess.png')), 'dist/test-game.tess.png should exist');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('MCP Visual Preview & Headless Runtime Check (when Chromium is available)', async (t) => {
  if (!findChromeExecutable()) {
    t.skip('No Chrome/Chromium executable available in this environment');
    return;
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tessera-mcp-preview-'));
  try {
    const gameDir = path.join(tmpDir, 'preview-game');
    await handleToolCall('tessera_init_cart', {
      directory: gameDir,
      name: 'preview-game',
      title: 'Preview Game',
      author: 'Agent'
    });

    // 1. Render preview returns native PNG image + zero errors
    const outPng = path.join(tmpDir, 'shot.png');
    const previewRes = await handleToolCall('tessera_render_preview', {
      path: gameDir,
      frames: 4,
      keys: 'ArrowRight:3',
      outputPath: outPng,
    });
    assert.equal(Boolean(previewRes.isError), false, `Expected clean render, got: ${previewRes.text}`);
    assert.ok(previewRes.text.includes('Rendered preview'), 'Should confirm preview rendered');
    assert.equal(previewRes.images?.length, 1, 'Should return 1 PNG image block');
    assert.equal(previewRes.images[0].mimeType, 'image/png');
    const pngBuf = Buffer.from(previewRes.images[0].data, 'base64');
    assert.equal(pngBuf.subarray(0, 4).toString('hex'), '89504e47', 'Image payload must be valid PNG');
    assert.ok(fs.existsSync(outPng), 'Should write PNG to outputPath');

    // 1b. Pack cart with framed 768x432 screenshot label AND autoLabel: true
    const framedPack = await handleToolCall('tessera_pack_cart', {
      path: gameDir,
      labelPath: outPng,
      output: path.join(tmpDir, 'framed.tess.png'),
    });
    assert.ok(framedPack.text.includes('framed-screenshot'), 'Should frame 768x432 screenshot into 256x256 label');
    assert.equal(framedPack.images?.length, 1, 'Should return packed cover art image');
    const unpacked = await unpackCartCli(path.join(tmpDir, 'framed.tess.png'), path.join(tmpDir, 'unpacked.tess'));
    assert.ok(unpacked.cartText.includes('title=Preview Game'), 'Unpacked picture cart must preserve full cart payload');

    const autoPack = await handleToolCall('tessera_pack_cart', {
      path: gameDir,
      autoLabel: true,
      frames: 3,
      output: path.join(tmpDir, 'auto.tess.png'),
    });
    assert.ok(autoPack.text.includes('auto-preview'), 'autoLabel should render live headless cover art');
    assert.equal(autoPack.images?.length, 1, 'autoLabel pack should return inline PNG image');

    // 1c. Filmstrip contact sheet & 4-angle model turntable preview
    const filmstripPng = path.join(tmpDir, 'filmstrip.png');
    const filmRes = await handleToolCall('tessera_render_preview', {
      path: gameDir,
      frames: 2,
      keys: 'ArrowRight:4',
      filmstrip: 4,
      outputPath: filmstripPng,
    });
    assert.equal(Boolean(filmRes.isError), false, `Expected clean filmstrip, got: ${filmRes.text}`);
    assert.equal(filmRes.images?.length, 1, 'Filmstrip should return 1 stitched PNG image');
    assert.ok(fs.existsSync(filmstripPng), 'Filmstrip PNG should be saved');

    const sampleModelPath = path.join(gameDir, 'models', 'beacon.txt');
    fs.writeFileSync(sampleModelPath, [
      'beacon 3x3x3',
      'c9 c9 c9',
      'c9 ca c9',
      'c9 c9 c9',
      '',
      '.. c9 ..',
      'c9 cb c9',
      '.. c9 ..',
      '',
      '.. .. ..',
      '.. d1 ..',
      '.. .. ..',
    ].join('\n'));
    const modelPng = path.join(tmpDir, 'model-turntable.png');
    const modelRes = await handleToolCall('tessera_preview_model', {
      path: sampleModelPath,
      outputPath: modelPng,
    });
    assert.equal(Boolean(modelRes.isError), false, `Expected clean model turntable, got: ${modelRes.text}`);
    assert.ok(modelRes.text.includes('4-angle turntable'), 'Should describe 4-angle turntable');
    assert.equal(modelRes.images?.length, 1, 'Model turntable should return 1 PNG image');
    assert.ok(fs.existsSync(modelPng), 'Model turntable PNG should be saved');

    // 2. Runtime check catches a real Lua runtime error
    const brokenCart = path.join(tmpDir, 'broken-runtime.tess');
    fs.writeFileSync(
      brokenCart,
      'tessera cart v1\n__meta__\nid=broken\ntitle=Broken\n__pal__\n1 112233\n__lua__\nfunction _init()\n  boom_missing_api()\nend\nfunction _draw() cls() end\n',
    );
    const rtCheck = await handleToolCall('tessera_check_cart', { path: brokenCart, runtime: true, frames: 3 });
    assert.equal(rtCheck.isError, true, 'Broken runtime cart should fail runtime check');
    assert.ok(rtCheck.text.includes('boom_missing_api'), 'Should report exact Lua runtime error');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('MCP Protocol JSON-RPC Stdio Handshake, Tools, Prompts & Tool Calling', async () => {
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
  async function waitForResponse(id, timeoutMs = 4000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const hit = responses.find((r) => r.id === id);
      if (hit) return hit;
      await new Promise((r) => setTimeout(r, 25));
    }
    return undefined;
  }

  try {
    // 1. initialize
    sendReq({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        clientInfo: { name: 'test-client', version: '1.0.0' }
      }
    });
    const initResp = await waitForResponse(1);
    assert.ok(initResp, 'Should receive initialize response');
    assert.equal(initResp.result.serverInfo.name, '@stephenwil/tessera-mcp');
    assert.ok(initResp.result.capabilities.prompts, 'Should advertise prompts capability');

    // 2. tools/list
    sendReq({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const listResp = await waitForResponse(2);
    assert.ok(listResp, 'Should receive tools/list response');
    const toolNames = listResp.result.tools.map((x) => x.name);
    for (const expected of [
      'tessera_init_cart',
      'tessera_list_samples',
      'tessera_pull_sample',
      'tessera_check_cart',
      'tessera_render_preview',
      'tessera_preview_model',
      'tessera_pack_cart',
      'tessera_export_html',
      'tessera_api_docs',
    ]) {
      assert.ok(toolNames.includes(expected), `Should list ${expected}`);
    }

    // 3. prompts/list & prompts/get
    sendReq({ jsonrpc: '2.0', id: 3, method: 'prompts/list' });
    const promptsResp = await waitForResponse(3);
    assert.ok(promptsResp?.result?.prompts?.some((p) => p.name === 'create-voxel-game'), 'Should list create-voxel-game prompt');

    sendReq({
      jsonrpc: '2.0',
      id: 4,
      method: 'prompts/get',
      params: { name: 'create-voxel-game', arguments: { concept: 'cozy lighthouse delivery' } }
    });
    const promptGetResp = await waitForResponse(4);
    assert.ok(promptGetResp?.result?.messages?.[0]?.content?.text?.includes('cozy lighthouse delivery'));
    assert.ok(promptGetResp?.result?.messages?.[0]?.content?.text?.includes('tessera_render_preview'));

    // 4. tools/call
    sendReq({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'tessera_api_docs', arguments: { topic: 'map' } }
    });
    const callResp = await waitForResponse(5);
    assert.ok(callResp, 'Should receive tools/call response');
    assert.ok(callResp.result.content[0].text.includes('mset'), 'Should return map API documentation');
  } finally {
    proc.stdin.end();
    proc.kill();
  }
});

test('composeContactSheet normalizes Unicode punctuation to ASCII glyphs', async () => {
  const rgba = new Uint8ClampedArray(16 * 16 * 4).fill(64);
  const tile = { rgba, width: 16, height: 16, label: 'F1 -> F2' };
  const tileUni = { rgba, width: 16, height: 16, label: 'F1 → F2' };

  const ascii = await composeContactSheet([tile, tile], {
    title: 'SOLARIS - FILMSTRIP',
    subtitle: '12x12x12 90 DEG',
    tileW: 64,
    tileH: 36,
  });
  const unicode = await composeContactSheet([tileUni, tileUni], {
    title: 'SOLARIS — FILMSTRIP',
    subtitle: '12×12×12 90°',
    tileW: 64,
    tileH: 36,
  });

  assert.equal(
    Buffer.from(unicode.pngBytes).equals(Buffer.from(ascii.pngBytes)),
    true,
    'Unicode dashes, arrows, multiply, and degree symbols should normalize to identical ASCII pixel output'
  );
});
