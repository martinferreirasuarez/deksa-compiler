import { readFile, writeFile } from 'node:fs/promises';
import { validateBaseRom } from './base-rom.mjs';
import { createBps } from './bps.mjs';

const [original, modified, output, seed] = process.argv.slice(2);
if (!original || !modified || !output || !seed) throw new Error('Faltan argumentos para crear el parche.');
const base = validateBaseRom(await readFile(original));
const target = await readFile(modified);
if (target.length !== 16 * 1024 * 1024) throw new Error('La ROM compilada no tiene el tamaño esperado.');
await writeFile(output, createBps(base, target, JSON.stringify({ game: 'FireRed Déksa', seed })), { flag: 'wx' });
