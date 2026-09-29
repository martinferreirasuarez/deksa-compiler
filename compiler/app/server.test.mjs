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
