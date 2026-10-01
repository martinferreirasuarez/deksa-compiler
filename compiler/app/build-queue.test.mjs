import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createBuildQueue } from './build-queue.mjs';
import { command } from './build-service.mjs';
import { createApp } from './server.mjs';
import http from 'node:http';

async function until(predicate) {
  for (let i = 0; i < 100; i++) { if (await predicate()) return; await new Promise(r => setTimeout(r, 10)); }
  throw new Error('Condition did not become true');
}

test('FIFO queue serializes builds, shares duplicate seeds, and reuses finished patches', async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'deksa-queue-test-'));
  const patch = path.join(temporary, 'game.bps');
  await writeFile(patch, 'BPS1');
  const order = []; let finish;
  const gate = new Promise(r => { finish = r; });
  const queue = createBuildQueue({ version: 'test', build: async seed => {
    order.push(seed); if (seed === 'first') await gate;
    return { format: 'bps', path: patch };
  } });
  try {
    const first = await queue.submit('first');
    const second = await queue.submit('second');
    assert.equal(second.state, 'queued'); assert.equal(queue.position(second.id), 1);
    assert.equal((await queue.submit('first')).id, first.id);
    assert.equal((await queue.submit('second')).id, second.id);
    assert.deepEqual(order, ['first']);
    finish();
    await until(() => second.state === 'complete');
    assert.deepEqual(order, ['first', 'second']);
    assert.equal((await queue.submit('first')).id, first.id);
    assert.equal(order.length, 2);
  } finally { finish(); await rm(temporary, { recursive: true, force: true }); }
});

test('jobs and the cache survive restart; interrupted jobs are requeued', async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'deksa-queue-persist-'));
  const patch = path.join(temporary, 'game.bps');
  await writeFile(patch, 'BPS1');
  const directory = path.join(temporary, 'jobs'); let calls = 0;
  const build = async () => { calls++; return { path: patch, format: 'bps' }; };
  try {
    const first = createBuildQueue({ directory, version: 'test', build });
    const job = await first.submit('same');
    await until(async () => job.state === 'complete' && JSON.parse(await readFile(path.join(directory, 'jobs.json')))[0]?.state === 'complete');
    const second = createBuildQueue({ directory, version: 'test', build });
    assert.equal((await second.submit('same')).id, job.id);
    assert.equal(calls, 1);
    const saved = JSON.parse(await readFile(path.join(directory, 'jobs.json')));
    saved.push({ id: 'interrupted', seed: 'other', version: 'test', state: 'running', updated: Date.now() });
    await writeFile(path.join(directory, 'jobs.json'), JSON.stringify(saved));
    const third = createBuildQueue({ directory, version: 'test', build });
    await until(() => third.jobs.get('interrupted')?.state === 'complete');
    assert.equal(calls, 2);
    const newer = createBuildQueue({ directory: null, version: 'new', build });
    assert.equal(await newer.find('same'), null);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

test('timeout aborts a stuck build and allows the next job to finish', async () => {
  let signal;
  const queue = createBuildQueue({ version: 'test', timeoutMs: 30, build: async (seed, options) => {
    if (seed === 'stuck') { signal = options.signal; return new Promise(() => {}); }
    return { path: '/tmp/queue-test.bps', format: 'bps' };
  } });
  const first = await queue.submit('stuck');
  const second = await queue.submit('next');
  await until(() => second.state === 'complete');
  assert.equal(first.state, 'failed'); assert.equal(signal.aborted, true);
  assert.match(first.error, /too long/); assert.equal(queue.busy(), false);
});

test('command abort terminates the process and rejects rather than hanging', async () => {
  const controller = new AbortController();
  const running = command(process.execPath, ['-e', 'setInterval(()=>{},1000)'], process.cwd(), undefined, controller.signal);
  setTimeout(() => controller.abort(), 30);
  await assert.rejects(running, /cancelled/);
});

test('waiting list is bounded and finished job history is bounded', async () => {
  let finish; const gate = new Promise(r => { finish = r; });
  const queue = createBuildQueue({ version: 'test', maxWaiting: 1, maxFinished: 1,
    build: async () => { await gate; return { path: '/tmp/queue-test.bps', format: 'bps' }; } });
  try {
    await queue.submit('one'); const second = await queue.submit('two');
    await assert.rejects(queue.submit('three'), /waiting list is full/);
    finish(); await until(() => second.state === 'complete');
    assert.equal(queue.jobs.size, 1);
  } finally { finish(); }
});

test('public HTTP and www redirect to canonical HTTPS without touching local URLs', async () => {
  const { server } = createApp({ build: async () => {} });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const host of ['pokemondeksa.com', 'www.pokemondeksa.com']) {
      const response = await new Promise(resolve => http.get({ host: '127.0.0.1', port: server.address().port,
        path: '/build?seed=test', headers: { Host: host, 'X-Forwarded-Proto': 'http' } }, r => {
        r.resume(); r.on('end', () => resolve({ status: r.statusCode, location: r.headers.location }));
      }));
      assert.equal(response.status, 308); assert.equal(response.location, 'https://pokemondeksa.com/build?seed=test');
    }
    assert.equal((await fetch(`${base}/build`)).status, 200);
    assert.equal((await fetch(`${base}/play`)).status, 200);
    assert.equal((await fetch(`${base}/sitemap.xml`)).status, 200);
  } finally { await new Promise(r => server.close(r)); }
});

test('concurrent distinct seeds still enforce the per-visitor allowance', async () => {
  let finish; const gate = new Promise(r => { finish = r; });
  const { server } = createApp({ build: async () => { await gate; return { path: '/tmp/test.bps', format: 'bps' }; } });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const replies = await Promise.all(Array.from({ length: 6 }, (_, i) => fetch(base + '/api/build', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seed: 'concurrent-' + i }),
    })));
    assert.deepEqual(replies.map(r => r.status).sort(), [202, 202, 202, 429, 429, 429]);
  } finally { finish(); await new Promise(r => server.close(r)); }
});
