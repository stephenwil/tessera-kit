import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const runNode = async (args) => (await promisify(execFile)(process.execPath, args)).stdout;
import { fileURLToPath } from 'node:url';

import {
  fetchSampleCatalog,
  pullSampleCli,
  assembleProject,
  checkCartCli,
  parseCart,
} from '../packages/tessera/src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TESSERA_BIN = path.resolve(__dirname, '../packages/tessera/bin/tessera.mjs');
const CREATE_BIN = path.resolve(__dirname, '../packages/create-tessera/bin/create-tessera.mjs');

const SAMPLE_CART = `tessera cart v1
__meta__
title=Crystal Arena
author=SampleDev
version=1.2
id=crystalarena
players=1
quality=hq
tags=arena,demo
__pal__
1 181a20
2 4f98d4
3 e64553
__models__
knight 2x2x2 frames=2 pivot=1,1,0
02 02
02 02

03 03
03 03
frame
03 03
03 03

02 02
02 02

gem 1x1x1
02
__sfx__
0 square 440>880 0.12 0.7
__music__
inst 0 wave=sq25 adsr=0.01,0.1,0.5,0.1

pat 0 speed=4 rows=4
00 | C-4 0 vA | ... | ... | ...
01 | ...      | ... | ... | ...
02 | E-4 0 vA | ... | ... | ...
03 | G-4 0 vA | ... | ... | ...

song 0 title="Main Theme" speed=4 loop=0
order 0
__lua__
function _init()
  camera(128, 128, 8, 1.2, 0)
  music(0)
end
function _update()
end
function _draw()
  cls()
  model("knight", 128, 128, 1)
  print("CRYSTAL ARENA", 20, 20, 2)
end
`;

const MOCK_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

const MOCK_CATALOG = [
  {
    id: 'crystalarena',
    title: 'Crystal Arena',
    author: 'SampleDev',
    version: '1.2',
    genre: 'Arcade & Action',
    description: 'Arena sample with models, sfx, music, and HQ lighting.',
    cartFile: 'carts/crystalarena.tess',
    pictureFile: 'carts/crystalarena.tess.png',
    stats: {
      codeLines: 11,
      fileSizeBytes: Buffer.byteLength(SAMPLE_CART, 'utf8'),
      modelsCount: 2,
    },
  },
];

function startMockShowcase() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.url === '/carts.json') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(MOCK_CATALOG));
      } else if (req.url === '/carts/crystalarena.tess') {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(SAMPLE_CART);
      } else if (req.url === '/carts/crystalarena.tess.png') {
        res.writeHead(200, { 'Content-Type': 'image/png' });
        res.end(MOCK_PNG);
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(r); }),
      });
    });
  });
}

test('samples catalog, pull (raw, png, project), and full round-trip assembly', async (t) => {
  const mock = await startMockShowcase();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tessera-samples-test-'));

  t.after(async () => {
    await mock.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // 1. Catalog API
  const catalog = await fetchSampleCatalog({ baseUrl: mock.baseUrl });
  assert.equal(catalog.length, 1);
  assert.equal(catalog[0].id, 'crystalarena');

  // 2. CLI: tessera samples
  const listOut = await runNode([TESSERA_BIN, 'samples', '--registry', mock.baseUrl]);
  assert.ok(listOut.includes('crystalarena'));
  assert.ok(listOut.includes('Crystal Arena'));

  // 3. CLI: tessera pull <id> (raw .tess)
  const rawPath = path.join(tmpDir, 'crystalarena.tess');
  await runNode([TESSERA_BIN, 'pull', 'crystalarena', '-o', rawPath, '--registry', mock.baseUrl]);
  assert.equal(fs.readFileSync(rawPath, 'utf8'), SAMPLE_CART);

  // 4. CLI: tessera pull <id> --png
  const pngPath = path.join(tmpDir, 'crystalarena.tess.png');
  await runNode([TESSERA_BIN, 'pull', 'crystalarena', '--png', '-o', pngPath, '--registry', mock.baseUrl]);
  assert.deepEqual(fs.readFileSync(pngPath), MOCK_PNG);

  // 5. CLI: tessera pull <id> --project <dir>
  const projDir = path.join(tmpDir, 'pulled-arena');
  await runNode([TESSERA_BIN, 'pull', 'crystalarena', '--project', projDir, '--registry', mock.baseUrl]);
  assert.ok(fs.existsSync(path.join(projDir, 'tessera.json')));
  assert.ok(fs.existsSync(path.join(projDir, 'src/main.lua')));
  assert.ok(fs.existsSync(path.join(projDir, 'assets/palette.txt')));
  assert.ok(fs.existsSync(path.join(projDir, 'models/knight.txt')));
  assert.ok(fs.existsSync(path.join(projDir, 'models/gem.txt')));
  assert.ok(fs.existsSync(path.join(projDir, 'assets/sfx.txt')));
  assert.ok(fs.existsSync(path.join(projDir, 'assets/music.txt')));

  // Reassemble and validate every section round-tripped faithfully
  const assembled = assembleProject(projDir);
  const parsed = parseCart(assembled);
  assert.equal(parsed.meta.quality, 'hq');
  assert.equal(parsed.meta.tags, 'arena,demo');
  assert.equal(parsed.palette.size, 3);
  assert.equal(parsed.models.length, 2);
  assert.equal(parsed.models[0].id, 'knight');
  assert.equal(parsed.models[0].frames, 2);
  assert.deepEqual(parsed.models[0].pivot, [1, 1, 0]);
  assert.equal(parsed.models[1].id, 'gem');
  assert.equal(parsed.sfx.size, 1);
  assert.equal(parsed.music.instruments.size, 1);
  assert.equal(parsed.music.patterns.size, 1);
  assert.equal(parsed.music.songs.size, 1);
  assert.ok(parsed.lua.includes('CRYSTAL ARENA'));

  const checkRes = checkCartCli(projDir);
  assert.equal(checkRes.ok, true);

  // 6. CLI: tessera init <dir> --template <id>
  const initDir = path.join(tmpDir, 'init-arena');
  await runNode([TESSERA_BIN, 'init', initDir, '--template', 'crystalarena', '--registry', mock.baseUrl]);
  assert.equal(checkCartCli(initDir).ok, true);

  // 7. Unknown sample throws helpful error
  await assert.rejects(
    () => pullSampleCli('nonexistent', { baseUrl: mock.baseUrl }),
    /not found.*crystalarena/i,
  );
});

test('create-tessera --list and --template work end-to-end', async (t) => {
  const mock = await startMockShowcase();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tessera-create-template-'));

  t.after(async () => {
    await mock.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // 1. --list
  const listOut = await runNode([CREATE_BIN, '--list', '--registry', mock.baseUrl]);
  assert.ok(listOut.includes('crystalarena'));
  assert.ok(listOut.includes('Crystal Arena'));

  // 2. --template <id>
  const gameDir = path.join(tmpDir, 'my-crystal-mod');
  await runNode([CREATE_BIN, gameDir, '--template', 'crystalarena', '--registry', mock.baseUrl]);

  const manifest = JSON.parse(fs.readFileSync(path.join(gameDir, 'tessera.json'), 'utf8'));
  assert.equal(manifest.id, 'my-crystal-mod');
  assert.equal(manifest.quality, 'hq');
  assert.equal(manifest.music, 'assets/music.txt');
  assert.equal(manifest.sfx, 'assets/sfx.txt');
  assert.equal(Object.keys(manifest.models).length, 2);

  const assembled = assembleProject(gameDir);
  const parsed = parseCart(assembled);
  assert.equal(parsed.models.length, 2);
  assert.equal(parsed.music.songs.size, 1);
  assert.equal(parsed.meta.quality, 'hq');
  assert.equal(checkCartCli(gameDir).ok, true);
});
