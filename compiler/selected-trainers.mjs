import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { exportPathForWindow } from './build-gate.mjs';

function canonicalJson(value) {
  return JSON.stringify(value, (_key, item) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return Object.fromEntries(Object.entries(item).sort(([left], [right]) =>
        left < right ? -1 : left > right ? 1 : 0));
    }
    return item;
  });
}

function checkParty(party, trainerId, variant) {
  if (Array.isArray(party.members)) {
    assert.equal(party.members.length, 6, `${trainerId} ${variant}: equipo incompleto`);
    return;
  }
  assert.ok(party.branches && typeof party.branches === 'object', `${trainerId} ${variant}: sin equipo ni ramas`);
  const branches = Object.values(party.branches);
  assert.ok(branches.length > 0, `${trainerId} ${variant}: ramas vacías`);
  for (const branch of branches) {
    assert.equal(branch.members?.length, 6, `${trainerId} ${variant}: rama incompleta`);
  }
}

export function selectReviewedTrainers(seedPlan, windowExports) {
  const variants = new Map(seedPlan.lots.map(({ lotId, variant }) => [lotId, variant]));
  assert.equal(variants.size, seedPlan.lots.length, 'El plan repite lotes');
  const seen = new Set();
  const trainers = [];

  for (const source of windowExports) {
    assert.equal(source.reviewed, true, 'No se puede seleccionar de una ventana sin revisar');
    assert.ok(Array.isArray(source.materializedTeams), 'Export sin materializedTeams');
    for (const trainer of source.materializedTeams) {
      assert.equal(typeof trainer.trainerId, 'string');
      assert.ok(!seen.has(trainer.trainerId), `Entrenador duplicado: ${trainer.trainerId}`);
      seen.add(trainer.trainerId);
      const variant = variants.get(trainer.lotId);
      assert.ok(variant, `${trainer.trainerId}: lote ${trainer.lotId} desconocido`);
      assert.deepEqual(Object.keys(trainer.variants).sort(), ['A', 'B', 'C']);
      const party = trainer.variants[variant];
      checkParty(party, trainer.trainerId, variant);
      trainers.push({
        trainerId: trainer.trainerId,
        lotId: trainer.lotId,
        variant,
        profile: trainer.profile,
        cap: trainer.cap,
        party,
      });
    }
  }

  return {
    schemaVersion: 1,
    masterSeed: seedPlan.masterSeed,
    fingerprint: seedPlan.fingerprint,
    trainerDigest: createHash('sha256').update(canonicalJson(trainers)).digest('hex'),
    trainers,
  };
}

export async function readReviewedTrainerExports(projectRoot, throughWindow = 12) {
  assert.ok(Number.isInteger(throughWindow) && throughWindow >= 1 && throughWindow <= 12);
  const exports = [];
  for (let number = 1; number <= throughWindow; number += 1) {
    const relative = exportPathForWindow(number);
    const value = JSON.parse(await readFile(path.join(projectRoot, relative), 'utf8'));
    assert.equal(value.reviewed, true, `W${String(number).padStart(2, '0')} aún no está revisada`);
    exports.push(value);
  }
  return exports;
}
