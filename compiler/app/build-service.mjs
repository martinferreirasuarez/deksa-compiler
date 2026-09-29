import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { cp, mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSeed } from '../seed-plan.mjs';

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ROM_NAME = 'Pokemon-FireRed-Deksa.gba';
const COPY_EXCLUDE = new Set(['.git', 'pokefirered.gba', 'pokefirered.elf', 'pokefirered.map', 'pokefirered.sym']);

function command(program, args, cwd, onOutput = () => {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
    let recent = '';
    const collect = (chunk) => {
      const value = chunk.toString('utf8');
      recent = (recent + value).slice(-12000);
      onOutput(value);
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve(recent) : reject(new Error(
      `${program} terminó con código ${code}.\n${recent.slice(-3000)}`)));
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
} = {}) {
  const safeSeed = validateSeed(seed);
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
    await commands('python3', [
      'tools/deksa_rebuild/write_beta5_full.py', '--seed', safeSeed,
      '--project-root', projectRoot, '--write',
    ], workRoot);
    onPhase('Compilando FireRed Déksa');
    const parallel = Math.max(1, Math.min(4, Number(process.env.DEKSA_BUILD_JOBS) || 4));
    await commands('make', [`-j${parallel}`], workRoot);
    onPhase('Verificando la ROM compilada');
    await commands('python3', [
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

export { DEFAULT_ROOT, ROM_NAME };
