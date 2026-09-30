import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from './server.mjs';

test('la app valida seed, protege el acceso y entrega únicamente una ROM terminada', async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'deksa-app-test-'));
  const romPath = path.join(temporary, 'test.gba');
  await writeFile(romPath, 'rom-test');
  let finish;
  const gate = new Promise((resolve) => { finish = resolve; });
  const { server } = createApp({
    accessKey: 'secreto',
    build: async (seed, { onPhase }) => {
      onPhase('Compilando');
      await gate;
      return { path: romPath, seed, sha256: 'abc123' };
    },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = `http://127.0.0.1:${server.address().port}`;
  const authorization = `Basic ${Buffer.from('deksa:secreto').toString('base64')}`;
  const headers = { Authorization: authorization, 'Content-Type': 'application/json' };
  try {
    assert.equal((await fetch(`${address}/api/status`)).status, 401);
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
    })).status, 409);
    finish();
    let status;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      status = await (await fetch(`${address}/api/build/${id}`, { headers })).json();
      if (status.state === 'complete') break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(status.state, 'complete');
    assert.equal(status.sha256, 'abc123');
    const downloaded = await fetch(`${address}${status.download}`, { headers });
    assert.equal(downloaded.status, 200);
    assert.equal(await downloaded.text(), 'rom-test');
  } finally {
    server.close();
    await rm(temporary, { recursive: true, force: true });
  }
});

test('el inicio de sesión recuerda el dispositivo sin pedir Basic Auth en cada página', async () => {
  const { server } = createApp({ accessKey: 'secreto' });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const entry = await fetch(base, { redirect: 'manual' });
    assert.equal(entry.status, 303);
    assert.equal(entry.headers.get('location'), '/login?next=%2F');
    assert.equal(entry.headers.get('www-authenticate'), null);
    const login = await fetch(`${base}/login?next=%2Fwiki%2F`);
    assert.equal(login.status, 200);
    assert.match(await login.text(), /La sesión dura 30 días/);
    const wrong = await fetch(`${base}/login`, {
      method: 'POST', body: new URLSearchParams({ username: 'deksa', password: 'mal', next: '/' }),
    });
    assert.equal(wrong.status, 401);
    const submitted = await fetch(`${base}/login`, {
      method: 'POST', redirect: 'manual',
      body: new URLSearchParams({ username: 'deksa', password: 'secreto', next: '/' }),
    });
    assert.equal(submitted.status, 303);
    assert.equal(submitted.headers.get('location'), '/');
    const setCookie = submitted.headers.get('set-cookie');
    assert.match(setCookie, /Max-Age=2592000; HttpOnly; Secure; SameSite=Lax/);
    assert.doesNotMatch(setCookie, /secreto/);
    const cookie = setCookie.split(';')[0];
    assert.equal((await fetch(base, { headers: { Cookie: cookie } })).status, 200);
    assert.equal((await fetch(`${base}/api/status`, { headers: { Cookie: cookie } })).status, 200);
    assert.equal((await fetch(`${base}/api/status`)).status, 401);
    assert.equal((await fetch(base, { headers: { Cookie: `${cookie}corrupto` }, redirect: 'manual' })).status, 303);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
