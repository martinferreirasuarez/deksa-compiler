import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from './server.mjs';

test('la app es pública, valida seed y entrega únicamente un parche BPS', async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'deksa-app-test-'));
  const romPath = path.join(temporary, 'test.bps');
  await writeFile(romPath, 'BPS1patch-test');
  let finish;
  const gate = new Promise((resolve) => { finish = resolve; });
  const { server } = createApp({
    build: async (seed, { onPhase }) => {
      onPhase('Compilando');
      await gate;
      return { path: romPath, seed, sha256: 'abc123', format: 'bps', patchSha256: 'def456', romName: 'test.gba' };
    },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = `http://127.0.0.1:${server.address().port}`;
  const headers = { 'Content-Type': 'application/json' };
  try {
    assert.equal((await fetch(`${address}/api/status`)).status, 200);
    const invalid = await fetch(`${address}/api/build`, {
      method: 'POST', headers, body: JSON.stringify({ seed: '../escape' }),
    });
    assert.equal(invalid.status, 400);
    const started = await fetch(`${address}/api/build`, {
      method: 'POST', headers, body: JSON.stringify({ seed: 'prueba-01' }),
    });
    assert.equal(started.status, 202);
    const { id } = await started.json();
    assert.equal((await fetch(`${address}/download/${id}`, { headers })).status, 404);
    assert.equal((await fetch(`${address}/api/build`, {
      method: 'POST', headers, body: JSON.stringify({ seed: 'otra' }),
    })).status, 202);
    finish();
    let status;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      status = await (await fetch(`${address}/api/build/${id}`, { headers })).json();
      if (status.state === 'complete') break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(status.state, 'complete');
    assert.equal(status.sha256, 'abc123');
    assert.equal(status.patchSha256, 'def456');
    assert.equal(status.romName, 'test.gba');
    const downloaded = await fetch(`${address}${status.download}`, { headers });
    assert.equal(downloaded.status, 200);
    assert.match(downloaded.headers.get('content-disposition'), /test\.bps/);
    assert.equal(await downloaded.text(), 'BPS1patch-test');
    assert.equal((await fetch(`${address}/api/build`, {
      method: 'POST', headers, body: JSON.stringify({ seed: 'prueba-02', rom: 'do-not-upload' }),
    })).status, 400);
    assert.equal((await fetch(`${address}/compiler/private/firered-1.0.gba`, { headers })).status, 404);
    assert.equal((await fetch(`${address}/vendor/rom-patcher-js/BinFile.js`, { headers })).status, 200);
    const brand = await fetch(`${address}/brand-mark.svg`);
    assert.equal(brand.status, 200);
    assert.equal(brand.headers.get('content-type'), 'image/svg+xml');
    assert.equal(await brand.text(), await readFile(new URL('../../wiki/public/brand-mark.svg', import.meta.url), 'utf8'));
  } finally {
    server.close();
    await rm(temporary, { recursive: true, force: true });
  }
});

test('el servidor nunca publica una ROM si el constructor devuelve el formato viejo', async () => {
  const { server } = createApp({ build: async () => ({ path: '/tmp/no-publicar.gba', sha256: 'test' }) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const { id } = await (await fetch(`${base}/api/build`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seed: 'test' }),
    })).json();
    await new Promise(resolve => setTimeout(resolve, 10));
    const job = await (await fetch(`${base}/api/build/${id}`)).json();
    assert.equal(job.state, 'failed');
    assert.equal(job.download, null);
    assert.equal((await fetch(`${base}/download/${id}`)).status, 404);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('no hay login ni cookies; los enlaces antiguos llevan a una página local', async () => {
  const { server } = createApp();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const entry = await fetch(base, { redirect: 'manual' });
    assert.equal(entry.status, 200);
    assert.equal(entry.headers.get('location'), null);
    assert.equal(entry.headers.get('www-authenticate'), null);
    assert.equal(entry.headers.get('set-cookie'), null);
    assert.doesNotMatch(await entry.text(), /type="password"|Sign in|\/login/);
    for (const [next, expected] of [['/wiki/', '/wiki/'], ['//example.com', '/'], ['/\\example.com', '/'], ['/\r\nheader', '/']]) {
      const response = await fetch(`${base}/login?next=${encodeURIComponent(next)}`, { redirect: 'manual' });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), expected);
      assert.equal(response.headers.get('set-cookie'), null);
    }
    assert.equal((await fetch(`${base}/api/status`)).status, 200);
    assert.equal((await fetch(base, { headers: { Cookie: 'deksa_session=old-invalid-cookie', Authorization: 'Basic invalid' }, redirect: 'manual' })).status, 200);
    assert.equal((await fetch(`${base}/login`, { method: 'POST' })).status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('las compilaciones públicas tienen límite por visitante, vencimiento y bloqueo simultáneo', async () => {
  let clock = 1000;
  let started = 0;
  let finish;
  let gate = Promise.resolve();
  const { server } = createApp({ now: () => clock, build: async () => {
    started++;
    await gate;
    return { format: 'bps', path: '/tmp/test.bps' };
  } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (ip = '192.0.2.1', seed = 'test', extra = {}) => fetch(`${base}/api/build`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip, ...extra }, body: JSON.stringify({ seed }),
  });
  const waitComplete = async response => {
    const { id } = await response.json();
    for (let i = 0; i < 30; i++) {
      if ((await (await fetch(`${base}/api/build/${id}`)).json()).state === 'complete') return;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.fail('Build did not finish');
  };
  try {
    assert.equal((await post('192.0.2.1', 'test', { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await post('192.0.2.1', '../invalid')).status, 400);
    for (let i = 0; i < 3; i++) {
      const response = await post();
      assert.equal(response.status, 202);
      await waitComplete(response);
    }
    const limited = await post();
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get('retry-after'), '600');
    assert.match((await limited.json()).error, /wait/i);
    assert.equal(started, 3);
    const other = await post('192.0.2.2');
    assert.equal(other.status, 202);
    await waitComplete(other);
    clock += 600000;
    const reset = await post();
    assert.equal(reset.status, 202);
    await waitComplete(reset);
    gate = new Promise(resolve => { finish = resolve; });
    const pair = await Promise.all([post('192.0.2.3'), post('192.0.2.4')]);
    assert.deepEqual(pair.map(response => response.status).sort(), [202, 202]);
    finish();
    await waitComplete(pair.find(response => response.status === 202));
  } finally {
    finish?.();
    await new Promise(resolve => server.close(resolve));
  }
});

test('los errores internos del constructor no se publican y un fallo síncrono libera el servidor', async () => {
  const { server } = createApp({ build: () => { throw new Error('/private/project/secret-file'); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (let i = 0; i < 2; i++) {
      const response = await fetch(`${base}/api/build`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"seed":"test"}' });
      assert.equal(response.status, 202);
      const { id } = await response.json();
      const job = await (await fetch(`${base}/api/build/${id}`)).json();
      assert.equal(job.state, 'failed');
      assert.doesNotMatch(job.error, /private|secret/);
      assert.equal((await (await fetch(`${base}/api/status`)).json()).busy, false);
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
});
