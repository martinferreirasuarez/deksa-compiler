import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const BinFile = require('./vendor/rom-patcher-js/BinFile.js');
globalThis.BinFile = BinFile; // Upstream BPS uses this global in both runtimes.
const BPS = require('./vendor/rom-patcher-js/RomPatcher.format.bps.js');
const file = bytes => new BinFile(Uint8Array.from(bytes).buffer);

export function applyBps(source, patch) {
  const parsed = BPS.fromFile(file(patch));
  if (parsed.sourceSize !== source.length) throw new Error('El tamaño de la ROM base no coincide.');
  return Buffer.from(parsed.apply(file(source), true)._u8array);
}

export function createBps(source, target, metadata = '') {
  // Linear encoding keeps 16 MiB builds fast; no quadratic delta search.
  const patch = BPS.buildFromRoms(file(source), file(target), false);
  patch.metaData = metadata;
  patch.patchChecksum = patch.calculateFileChecksum();
  const bytes = Buffer.from(patch.export()._u8array);
  if (!applyBps(source, bytes).equals(Buffer.from(target))) throw new Error('El parche no reconstruye la ROM compilada.');
  return bytes;
}
