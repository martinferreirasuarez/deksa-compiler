import { readFile } from 'node:fs/promises';
import path from 'node:path';

const EXPORT_ROOT = 'references/deksa-next/b5-05';

export function exportPathForWindow(windowNumber) {
  if (!Number.isInteger(windowNumber) || windowNumber < 1 || windowNumber > 12) {
    throw new RangeError('La ventana debe estar entre W01 y W12.');
  }
  const label = `w${String(windowNumber).padStart(2, '0')}`;
  const directory = windowNumber === 1 ? `${label}-repair`
    : windowNumber === 12 ? `${label}-league-rematch`
      : `${label}-complete`;
  return `${EXPORT_ROOT}/${directory}/export.json`;
}

export async function inspectTrainerRoster(projectRoot) {
  const windows = [];
  for (let number = 1; number <= 12; number += 1) {
    const relativePath = exportPathForWindow(number);
    let exportData;
    try {
      exportData = JSON.parse(await readFile(path.join(projectRoot, relativePath), 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      windows.push({ number, state: 'missing', path: relativePath });
      continue;
    }
    const valid = exportData.reviewed === true && Array.isArray(exportData.materializedTeams);
    windows.push({
      number,
      state: valid ? 'reviewed' : 'incomplete',
      path: relativePath,
      trainers: Array.isArray(exportData.materializedTeams) ? exportData.materializedTeams.length : 0,
    });
  }
  return {
    ready: windows.every(({ state }) => state === 'reviewed'),
    windows,
  };
}

export async function requireTrainerRoster(projectRoot) {
  const result = await inspectTrainerRoster(projectRoot);
  if (!result.ready) {
    const pending = result.windows.filter(({ state }) => state !== 'reviewed')
      .map(({ number }) => `W${String(number).padStart(2, '0')}`);
    throw new Error(`No se puede compilar una ROM completa: faltan ${pending.join(', ')}.`);
  }
  return result;
}
