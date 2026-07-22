import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from './serve.mjs';

let parent;
let root;
let server;
let base;

before(async () => {
  // `dist/` fixture lives under a parent dir that also holds a secret file
  // OUTSIDE the served root — the target a traversal attack would try to reach.
  parent = await mkdtemp(path.join(tmpdir(), 'auth-page-serve-'));
  await writeFile(path.join(parent, 'secret.txt'), 'TOP_SECRET');

  root = path.join(parent, 'dist');
  await mkdir(path.join(root, 'assets'), { recursive: true });
  await writeFile(path.join(root, 'index.html'), '<!doctype html><title>ROOT_INDEX</title>');
  await writeFile(path.join(root, 'assets', 'app.js'), 'console.log("ASSET_JS")');

  server = createServer(root);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(parent, { recursive: true, force: true });
});

test('GET / serves index.html', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /text\/html/);
  assert.match(await res.text(), /ROOT_INDEX/);
});

test('GET /oauth/authorize falls back to index.html (SPA route)', async () => {
  const res = await fetch(`${base}/oauth/authorize`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /text\/html/);
  assert.match(await res.text(), /ROOT_INDEX/);
});

test('GET a real asset serves it with the right content-type', async () => {
  const res = await fetch(`${base}/assets/app.js`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /javascript/);
  assert.match(await res.text(), /ASSET_JS/);
});

test('GET a missing asset (has an extension) is 404, not a fallback', async () => {
  const res = await fetch(`${base}/assets/missing.js`);
  assert.equal(res.status, 404);
});

test('path traversal cannot escape the root', async () => {
  // Reach for a file that exists one level up from dist via an encoded traversal.
  const res = await fetch(`${base}/%2e%2e/serve.mjs`);
  assert.notEqual(res.status, 200);
  assert.doesNotMatch(await res.text(), /createServer/);
});

test('an encoded traversal cannot read a file outside the root', async () => {
  // Encode the slash too (%2f) so the client does not normalize `..` away
  // before it reaches the server — this is what exercises the guard.
  const res = await fetch(`${base}/%2e%2e%2fsecret.txt`);
  assert.equal(res.status, 403);
  assert.doesNotMatch(await res.text(), /TOP_SECRET/);
});

test('non-GET methods are rejected', async () => {
  const res = await fetch(`${base}/`, { method: 'POST' });
  assert.equal(res.status, 405);
});

test('basePath is stripped when present, and tolerated when absent', async () => {
  const mounted = createServer(root, { basePath: '/oauth' });
  await new Promise((resolve) => mounted.listen(0, '127.0.0.1', resolve));
  const mountedBase = `http://127.0.0.1:${mounted.address().port}`;
  try {
    // Prefixed asset (Funnel did NOT strip) → found in dist/assets.
    const withPrefix = await fetch(`${mountedBase}/oauth/assets/app.js`);
    assert.equal(withPrefix.status, 200);
    assert.match(await withPrefix.text(), /ASSET_JS/);

    // Same asset already stripped by Funnel → still found.
    const noPrefix = await fetch(`${mountedBase}/assets/app.js`);
    assert.equal(noPrefix.status, 200);
    assert.match(await noPrefix.text(), /ASSET_JS/);

    // Prefixed SPA route → index.html fallback.
    const route = await fetch(`${mountedBase}/oauth/authorize`);
    assert.equal(route.status, 200);
    assert.match(await route.text(), /ROOT_INDEX/);
  } finally {
    await new Promise((resolve) => mounted.close(resolve));
  }
});
