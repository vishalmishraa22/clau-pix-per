import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import sharp from 'sharp';
import { capture } from '../bin/capture.mjs';

let server, baseUrl, tmp;

before(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'pp-cap-'));
  const html = `<!doctype html><html><head><style>
    body{margin:0;background:#222;font-family:sans-serif}
    #box{width:200px;height:120px;background:#f00;margin:40px}
    .spin{animation:sp 1s infinite linear}
    @keyframes sp{to{transform:rotate(360deg)}}
  </style></head><body>
    <div id="box" class="spin"></div>
  </body></html>`;
  server = createServer((req, res) => { res.writeHead(200, {'content-type':'text/html'}); res.end(html); });
  await new Promise(r => server.listen(0, r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise(r => server.close(r));
  await rm(tmp, { recursive: true, force: true });
});

test('capture screenshots element at given viewport width', async () => {
  const out = join(tmp, 'impl.png');
  await capture({ url: baseUrl, selector: '#box', viewport: { width: 800, height: 600 }, out });
  const meta = await sharp(out).metadata();
  assert.equal(meta.width, 200);
  assert.equal(meta.height, 120);
});

test('capture produces identical bytes across runs (animation disabled)', async () => {
  const a = join(tmp, 'a.png'), b = join(tmp, 'b.png');
  await capture({ url: baseUrl, selector: '#box', viewport: { width: 800, height: 600 }, out: a });
  await capture({ url: baseUrl, selector: '#box', viewport: { width: 800, height: 600 }, out: b });
  const ba = await readFile(a), bb = await readFile(b);
  assert.ok(Buffer.compare(ba, bb) === 0, 'screenshots should be byte-identical with animation disabled');
});

test('capture falls back to viewport when selector missing', async () => {
  const out = join(tmp, 'vp.png');
  await capture({ url: baseUrl, selector: null, viewport: { width: 640, height: 400 }, out });
  const meta = await sharp(out).metadata();
  assert.equal(meta.width, 640);
  assert.equal(meta.height, 400);
});

test('waitForNetworkIdle:false captures against a server that never goes idle (HMR repro)', async () => {
  // Simulate an HMR dev server: the page opens an EventSource/long-poll that
  // keeps a request open forever, so 'networkidle' would never fire and a
  // networkidle-based goto would time out. waitForNetworkIdle:false must
  // still capture via domcontentloaded + settle.
  const hmrHtml = `<!doctype html><html><head><style>body{margin:0;background:#0a0;}
    #box{width:100px;height:100px;background:#fff;margin:10px}</style></head>
    <body><div id="box"></div>
    <script>new EventSource('/__hmr');</script></body></html>`;
  const hmrServer = createServer((req, res) => {
    if (req.url === '/__hmr') {
      // Never-ending SSE stream → network is never idle.
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
      res.write(': keep-alive\n\n');
      return; // intentionally leave the response open
    }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(hmrHtml);
  });
  await new Promise(r => hmrServer.listen(0, r));
  const hmrUrl = `http://127.0.0.1:${hmrServer.address().port}`;
  try {
    const out = join(tmp, 'hmr.png');
    await capture({
      url: hmrUrl, selector: '#box', viewport: { width: 400, height: 300 },
      out, waitForNetworkIdle: false, settleMs: 200,
    });
    const meta = await sharp(out).metadata();
    assert.equal(meta.width, 100);
    assert.equal(meta.height, 100);
  } finally {
    await new Promise(r => hmrServer.close(r));
  }
});
