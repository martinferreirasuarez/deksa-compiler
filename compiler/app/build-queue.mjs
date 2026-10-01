import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

// One worker, a bounded waiting list, and resumable jobs. Only patches are served.
export function createBuildQueue({ build, projectRoot, directory = null, version,
  now = Date.now, timeoutMs = 10 * 60 * 1000, maxWaiting = 20,
  retentionMs = 7 * 24 * 60 * 60 * 1000, maxFinished = 200 }) {
  const jobs = new Map();
  let active = null;
  let draining = false;
  let writes = Promise.resolve();
  let submissions = Promise.resolve();
  const file = directory && path.join(directory, 'jobs.json');
  function prune() {
    const finished = [...jobs.values()].filter(j => ['complete', 'failed'].includes(j.state));
    for (const [index, job] of finished.entries()) {
      if (now() - job.updated > retentionMs || index < finished.length - maxFinished) jobs.delete(job.id);
    }
  }
  function persist() {
    if (!file) return Promise.resolve();
    // Serialize atomic snapshots so late writes cannot overwrite newer state.
    writes = writes.catch(() => {}).then(async () => {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const temporary = file + '.tmp';
      await writeFile(temporary, JSON.stringify([...jobs.values()]), { mode: 0o600 });
      await rename(temporary, file);
    });
    return writes;
  }
  const ready = (async () => {
    if (file) {
      let saved;
      try { saved = JSON.parse(await readFile(file, 'utf8')); }
      catch (error) { if (error.code !== 'ENOENT') throw error; saved = []; }
      for (const job of saved) {
        if (job.version !== version) continue;
        if (job.state === 'running') { job.state = 'queued'; job.phase = 'Waiting'; }
        jobs.set(job.id, job);
      }
      prune();
    }
  })();
  async function drain() {
    await ready;
    if (draining) return;
    draining = true;
    try {
      for (;;) {
        const job = [...jobs.values()].find(j => j.state === 'queued');
        if (!job) break;
        active = job.id;
        job.state = 'running'; job.phase = 'Building'; job.updated = now();
        const controller = new AbortController();
        let timer;
        try {
          await persist();
          const deadline = new Promise((_, reject) => {
            timer = setTimeout(() => {
              controller.abort();
              reject(new Error('Build timed out'));
            }, timeoutMs);
          });
          const result = await Promise.race([deadline, Promise.resolve().then(() => build(job.seed, {
            projectRoot, signal: controller.signal,
            onPhase: phase => { job.phase = phase; },
          }))]);
          if (result.format !== 'bps' || path.extname(result.path) !== '.bps') throw new Error('Expected a BPS patch');
          job.result = result; job.state = 'complete'; job.phase = 'Ready';
        } catch (error) {
          console.error('Déksa build failed:', error);
          job.state = 'failed'; job.phase = 'Failed';
          job.error = controller.signal.aborted
            ? 'The build took too long. Please try again.'
            : 'The build failed. Please try again later.';
        } finally {
          clearTimeout(timer); active = null; job.updated = now();
          prune();
          await persist();
        }
      }
    } finally { draining = false; }
  }
  async function find(seed) {
    await ready;
    prune();
    const existing = [...jobs.values()].reverse().find(j => j.seed === seed && j.version === version
      && ['queued', 'running', 'complete'].includes(j.state));
    if (existing?.state === 'complete') {
      try { await stat(existing.result.path); }
      catch { jobs.delete(existing.id); return null; }
    }
    return existing || null;
  }
  function submit(seed) {
    const next = submissions.catch(() => {}).then(async () => {
      const existing = await find(seed);
      if (existing) return existing;
      if ([...jobs.values()].filter(j => j.state === 'queued').length >= maxWaiting) {
        throw Object.assign(new Error('The waiting list is full. Please try again in a few minutes.'), { status: 503 });
      }
      const id = randomUUID();
      const job = { id, seed, version, state: 'queued', phase: 'Waiting', result: null, error: null, updated: now() };
      jobs.set(id, job);
      try { await persist(); }
      catch (error) { jobs.delete(id); throw error; }
      void drain().catch(error => console.error('Déksa queue failed:', error));
      return job;
    });
    submissions = next;
    return next;
  }
  function position(id) {
    const waiting = [...jobs.values()].filter(j => j.state === 'queued');
    const index = waiting.findIndex(j => j.id === id);
    return index < 0 ? 0 : index + 1;
  }
  // Resume work interrupted by a service restart.
  void ready.then(drain).catch(error => console.error('Déksa queue recovery failed:', error));
  return { jobs, ready, find, submit, position, busy: () => active !== null,
    waiting: () => [...jobs.values()].filter(j => j.state === 'queued').length };
}
