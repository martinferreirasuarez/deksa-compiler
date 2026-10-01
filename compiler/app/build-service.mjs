import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { cp, mkdtemp, mkdir, readFile, rm, stat, statfs, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSeed } from '../seed-plan.mjs';
import { ensureBaseRom } from './base-rom.mjs';
import { BASE_ROM } from './rom-base.mjs';

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ROM_NAME = 'Pokemon-FireRed-Deksa.gba';
const COPY_EXCLUDE = new Set(['.git', 'pokefirered.gba', 'pokefirered.elf', 'pokefirered.map', 'pokefirered.sym']);

export function command(program, args, cwd, onOutput = () => {}, signal) {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const grouped = process.platform !== 'win32';
    const child = spawn(program, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: process.env, detached: grouped });
    const abort = () => {
      try { if (grouped) process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); }
      catch (error) { if (error.code !== 'ESRCH') console.error('Unable to stop build:', error); }
    };
    signal?.addEventListener('abort', abort, { once: true });
    let recent = '';
    const collect = (chunk) => {
      const value = chunk.toString('utf8');
      recent = (recent + value).slice(-12000);
      onOutput(value);
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('error', error => { signal?.removeEventListener('abort', abort); reject(error); });
    child.on('close', (code) => {
      signal?.removeEventListener('abort', abort);
      if (signal?.aborted) reject(new Error('Build cancelled'));
      else if (code === 0) resolve(recent);
      else reject(new Error(`${program} terminó con código ${code}.\n${recent.slice(-3000)}`));
    });
  });
}

function under(directory, candidate) {
  return candidate === directory || candidate.startsWith(`${directory}${path.sep}`);
}

export async function runSeedBuild(seed, {
  projectRoot = DEFAULT_ROOT,
  outputRoot = path.join(projectRoot, 'compiler/output'),
  onPhase = () => {},
  commands = command,
  signal,
} = {}) {
  const run = (...args) => { signal?.throwIfAborted(); return commands(...args, undefined, signal); };
  const safeSeed = validateSeed(seed);
  const disk = await statfs(projectRoot);
  if (disk.bavail * disk.bsize < 1024 * 1024 * 1024) throw new Error('Not enough free space to build safely');
  const sourceRoot = path.join(projectRoot, 'pokefirered');
  const temporary = await mkdtemp(path.join(tmpdir(), 'deksa-compiler-'));
  const workRoot = path.join(temporary, 'pokefirered');
  try {
    onPhase('Preparando una copia aislada del juego');
    await cp(sourceRoot, workRoot, {
      recursive: true,
      dereference: true,
      filter: (source) => source === sourceRoot || !COPY_EXCLUDE.has(path.basename(source)),
    });
    onPhase('Aplicando la seed a entrenadores y fauna');
    await run('python3', [
      'tools/deksa_rebuild/write_beta5_full.py', '--seed', safeSeed,
      '--project-root', projectRoot, '--write',
    ], workRoot);
    onPhase('Compilando FireRed Déksa');
    const parallel = Math.max(1, Math.min(4, Number(process.env.DEKSA_BUILD_JOBS) || 4));
    await run('make', [`-j${parallel}`], workRoot);
    onPhase('Verificando la ROM compilada');
    await run('python3', [
      'tools/deksa_rebuild/verify_beta5_full_rom.py', '--seed', safeSeed,
      '--project-root', projectRoot,
    ], workRoot);
    const romPath = path.join(workRoot, 'pokefirered.gba');
    const bytes = await readFile(romPath);
    if (bytes.length !== 16 * 1024 * 1024) throw new Error('La ROM no tiene 16 MiB.');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const baseName = `Pokemon-FireRed-Deksa-${safeSeed}-${sha256.slice(0, 12)}`;
    const destination = path.join(outputRoot, `${baseName}.gba`);
    if (!under(path.resolve(outputRoot), path.resolve(destination))) throw new Error('Ruta de salida inválida.');
    await mkdir(outputRoot, { recursive: true });
    await writeFile(destination, bytes, { flag: 'wx' }).catch(async (error) => {
      if (error.code !== 'EEXIST') throw error;
      const existing = await readFile(destination);
      if (!existing.equals(bytes)) throw new Error('La salida existente no coincide con la ROM recién compilada.');
    });
    const manifest = { seed: safeSeed, sha256, bytes: bytes.length, rom: path.basename(destination) };
    await writeFile(path.join(outputRoot, `${baseName}.json`), `${JSON.stringify(manifest, null, 2)}\n`);
    return { ...manifest, path: destination, name: ROM_NAME };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export async function inspectBuildEnvironment(projectRoot = DEFAULT_ROOT) {
  const checks = await Promise.all([
    stat(path.join(projectRoot, 'pokefirered/Makefile')).then(() => true, () => false),
    stat(path.join(projectRoot, 'pokefirered/tools/agbcc/bin/agbcc')).then(() => true, () => false),
    stat(path.join(projectRoot, 'references/deksa-next/b5-05/w12-league-rematch/export.json')).then(() => true, () => false),
  ]);
  return { ready: checks.every(Boolean), source: checks[0], agbcc: checks[1], roster: checks[2] };
}

export async function runSeedPatchBuild(seed, options = {}) {
  const projectRoot = options.projectRoot ?? DEFAULT_ROOT;
  const underlying = options.commands ?? command;
  const commands = (...args) => { options.signal?.throwIfAborted(); return underlying(...args, undefined, options.signal); };
  const onPhase = options.onPhase ?? (() => {});
  const base = await ensureBaseRom(projectRoot, commands, onPhase);
  const result = await runSeedBuild(seed, options);
  const temporary = await mkdtemp(path.join(tmpdir(), 'deksa-patch-'));
  try {
    onPhase('Preparando y comprobando el parche');
    const patch = path.join(temporary, 'game.bps');
    await commands(process.execPath, [
      path.join(projectRoot, 'compiler/app/create-patch.mjs'), base, result.path, patch, result.seed,
    ], projectRoot);
    const bytes = await readFile(patch);
    const destination = result.path.replace(/\.gba$/, '.bps');
    await writeFile(destination, bytes, { flag: 'wx' }).catch(async error => {
      if (error.code !== 'EEXIST') throw error;
      if (!(await readFile(destination)).equals(bytes)) throw new Error('El parche existente no coincide.');
    });
    const manifest = { ...result, path: destination, name: path.basename(destination),
      format: 'bps', patchBytes: bytes.length, patchSha256: createHash('sha256').update(bytes).digest('hex'),
      baseRom: BASE_ROM, romName: path.basename(result.path) };
    await writeFile(destination.replace(/\.bps$/, '.patch.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    return manifest;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export { DEFAULT_ROOT, ROM_NAME };
