import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { assembleProject } from '../packages/tessera/src/project.js';
import { packCartCli, unpackCartCli } from '../packages/tessera/src/pack.js';
import { exportHtmlCli } from '../packages/tessera/src/export.js';
import { checkCartCli } from '../packages/tessera/src/check.js';
import { parseCart } from '../packages/tessera/src/cart/tess.js';

test('scaffolder and project assembly round-trip', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tessera-kit-test-'));

  // 1. Run create-tessera logic
  const projectDir = path.join(tmpDir, 'test-game');
  fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(projectDir, 'assets'), { recursive: true });

  const manifest = {
    id: 'test-game',
    title: 'Test Game',
    version: '1.0.0',
    lua: ['src/main.lua'],
    palette: 'assets/palette.txt'
  };
  fs.writeFileSync(path.join(projectDir, 'tessera.json'), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(projectDir, 'src/main.lua'), 'function _init() vset(128,128,1,5) end\nfunction _update() end\nfunction _draw() end');
  fs.writeFileSync(path.join(projectDir, 'assets/palette.txt'), '1: #181a20\n5: #9aa8be\n');

  // 2. Assemble project into .tess text
  const cartText = assembleProject(projectDir);
  assert.ok(cartText.includes('__meta__'), 'Cart should have __meta__ section');
  assert.ok(cartText.includes('id=test-game'), 'Cart metadata should have id');
  assert.ok(cartText.includes('__lua__'), 'Cart should have __lua__ section');
  assert.ok(cartText.includes('vset(128,128,1,5)'), 'Lua code should be present');

  const cartPath = path.join(projectDir, 'test-game.tess');
  fs.writeFileSync(cartPath, cartText, 'utf8');

  // 3. Check cart syntax
  const checkResult = checkCartCli(cartPath);
  assert.equal(checkResult.ok, true, 'Cart should pass check');
  assert.equal(checkResult.errors.length, 0, 'Should have no errors');

  // 4. Pack into .tess.png picture cart
  const pngPath = path.join(projectDir, 'test-game.tess.png');
  const packResult = await packCartCli(cartPath, null, pngPath);
  assert.equal(packResult.ok, true, 'Pack should succeed');
  assert.ok(fs.existsSync(pngPath), 'PNG file should exist');
  assert.ok(packResult.fileSize > 1000, 'PNG file should have content');

  // 5. Unpack .tess.png back into text
  const unpackResult = await unpackCartCli(pngPath);
  assert.equal(unpackResult.ok, true, 'Unpack should succeed');
  assert.equal(unpackResult.cartText.trim(), cartText.trim(), 'Unpacked cart text should match original');

  // 6. Export to offline standalone HTML
  const htmlPath = path.join(projectDir, 'test-game.html');
  const exportResult = exportHtmlCli(cartPath, htmlPath);
  assert.equal(exportResult.ok, true, 'Export should succeed');
  assert.ok(fs.existsSync(htmlPath), 'HTML runner file should exist');

  const htmlContent = fs.readFileSync(htmlPath, 'utf8');
  assert.ok(htmlContent.includes('id="tessera-cart"'), 'HTML should embed cart script');
  assert.ok(htmlContent.includes('test-game'), 'HTML should contain cart content');
  assert.equal(htmlContent.toLowerCase().includes('hatchase'), false, 'HTML template must NEVER contain private Hat Chase content');

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('create-tessera CLI generates valid Tessera API calls', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tessera-create-test-'));
  const projectDir = path.join(tmpDir, 'starter-game');
  const binPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../packages/create-tessera/bin/create-tessera.mjs');

  execFileSync(process.execPath, [binPath, projectDir]);

  const mainLua = fs.readFileSync(path.join(projectDir, 'src/main.lua'), 'utf8');
  assert.ok(mainLua.includes('camera('), 'Starter Lua should use real camera() API');
  assert.equal(/\bcam\s*\(/.test(mainLua), false, 'Starter Lua must not call nonexistent cam()');
  assert.equal(/\bcamtarget\s*\(/.test(mainLua), false, 'Starter Lua must not call nonexistent camtarget()');

  const cartText = assembleProject(projectDir);
  const checkRes = checkCartCli(projectDir);
  assert.equal(checkRes.ok, true, 'Generated starter project must pass tessera check');
  assert.ok(cartText.includes('camera('), 'Assembled cart must include camera() call');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('bundled runner.html contains only the basic hello cart', () => {
  const runnerPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../packages/tessera/template/runner.html');
  const html = fs.readFileSync(runnerPath, 'utf8');
  assert.ok(html.includes('carts/hello.tess'), 'Minimal runner should include basic hello cart');
  for (const excluded of ['hatchase', 'bastionsiege', 'bramblecourt', 'voiddrifter', 'turbocircuit', 'relicshifter', 'moonlitgarden', 'prismrelay', 'bench']) {
    assert.equal(html.toLowerCase().includes(excluded), false, `Minimal runner must not bundle demo cart: ${excluded}`);
  }
});
