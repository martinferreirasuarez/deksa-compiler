import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BASE_ROM } from './rom-base.mjs';

const VANILLA_COMMIT = 'c75f352304d529f6ba92d4f74b9cf8b5c3810788';

export function validateBaseRom(bytes) {
  if (bytes.length !== BASE_ROM.bytes || createHash('sha1').update(bytes).digest('hex') !== BASE_ROM.sha1) {
    throw new Error(`La ROM base no coincide con ${BASE_ROM.label}.`);
  }
  return bytes;
}

async function readIfPresent(file) {
  try { return await readFile(file); }
  catch (error) { if (error.code !== 'ENOENT') throw error; return null; }
}

// The base stays private. Clean builds also work in the source-sharing bundle.
export async function ensureBaseRom(projectRoot, commands, onPhase = () => {}) {
  const cache = path.join(projectRoot, 'compiler/private/firered-1.0.gba');
  const configured = process.env.DEKSA_BASE_ROM;
  if (configured) { validateBaseRom(await readFile(configured)); return configured; }
  const cached = await readIfPresent(cache);
  if (cached) { validateBaseRom(cached); return cache; }
  const baseline = path.join(projectRoot, 'releases/clean-rebuild-baseline-c75f3523/Pokemon-FireRed-vanilla-baseline-c75f3523.gba');
  let bytes = await readIfPresent(baseline);
  if (!bytes) {
    onPhase('Preparando la base de FireRed');
    const temporary = await mkdtemp(path.join(tmpdir(), 'deksa-vanilla-'));
    try {
      const archive = path.join(temporary, 'base.tar');
      const source = path.join(temporary, 'source');
      await mkdir(source);
      await commands('git', ['archive', '--format=tar', '-o', archive, VANILLA_COMMIT], path.join(projectRoot, 'pokefirered'));
      await commands('tar', ['-xf', archive, '-C', source], temporary);
      await cp(path.join(projectRoot, 'pokefirered/tools/agbcc'), path.join(source, 'tools/agbcc'), { recursive: true, dereference: true });
      await commands('make', ['-j4'], source);
      bytes = await readFile(path.join(source, 'pokefirered.gba'));
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }
  validateBaseRom(bytes);
  await mkdir(path.dirname(cache), { recursive: true });
  await writeFile(cache, bytes, { flag: 'wx' }).catch(async error => {
    if (error.code !== 'EEXIST') throw error;
    validateBaseRom(await readFile(cache));
  });
  return cache;
}
