import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const hash = value => createHash('sha256').update(value).digest('hex');
const ignored = new Set(['.cache', 'node_modules', '__pycache__', 'operations']);

// Filesystem identity includes ctime: replacing a file or restoring its mtime
// cannot accidentally reuse the old verified result. Directory membership is
// checked on every read, including previously missing sources.
export async function sourceFingerprint(root, roots) {
  const rows = [];
  async function visit(relative) {
    if (relative.split('/').some(part => ignored.has(part))) return;
    const file = path.join(root, relative);
    let stat;
    try { stat = await fs.lstat(file, { bigint: true }); }
    catch (error) { if (error.code === 'ENOENT') { rows.push([relative, 'missing']); return; } throw error; }
    if (stat.isSymbolicLink()) throw new Error(`VIEW_CACHE_SYMLINK: ${relative}`);
    if (stat.isDirectory()) {
      rows.push([relative, 'directory']);
      await Promise.all((await fs.readdir(file)).sort().map(name => visit(`${relative}/${name}`)));
    } else if (stat.isFile()) {
      rows.push([relative, `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`]);
    }
  }
  // Bound traversal concurrency across roots; each directory only stats its children.
  for (const relative of roots) await visit(relative);
  rows.sort(([a], [b]) => a.localeCompare(b));
  return hash(JSON.stringify(rows));
}

export function createVerifiedViewCache({ fingerprint, file, build, staleWhileRevalidate = false, retryMs = 5000 }) {
  let memory;
  let pending;
  let rebuilding;
  let retryAt = 0;
  let status = 'ready';
  async function rebuild(source) {
    const value = await build();
    if (await fingerprint() !== source) throw new Error('VIEW_SOURCES_CHANGED_DURING_VALIDATION');
    const saved = { schema: 1, source, digest: hash(JSON.stringify(value)), value };
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporary, JSON.stringify(saved), { flag: 'wx' });
      await fs.rename(temporary, file);
    } finally { await fs.rm(temporary, { force: true }); }
    memory = saved;
    status = 'ready';
    return structuredClone(value);
  }
  async function read() {
    const source = await fingerprint();
    if (memory?.source === source) { status = 'ready'; return structuredClone(memory.value); }
    try {
      const saved = JSON.parse(await fs.readFile(file, 'utf8'));
      if (saved?.schema === 1 && saved.digest === hash(JSON.stringify(saved.value))) {
        if (saved.source === source || (!memory && staleWhileRevalidate)) memory = saved;
        if (saved.source === source) { status = 'ready'; return structuredClone(saved.value); }
      }
    } catch (error) {
      if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
    }
    if (staleWhileRevalidate && memory) {
      if (!rebuilding && Date.now() >= retryAt) {
        status = 'refreshing';
        rebuilding = rebuild(source).catch(error => {
          status = 'error';
          retryAt = Date.now() + retryMs;
          console.error('[wiki] Could not refresh verified trainer view:', error.message);
        }).finally(() => { rebuilding = undefined; });
      }
      return structuredClone(memory.value);
    }
    return rebuild(source);
  }
  const get = () => {
    pending ??= read().finally(() => { pending = undefined; });
    return pending.then(value => structuredClone(value));
  };
  get.status = () => status;
  return get;
}
