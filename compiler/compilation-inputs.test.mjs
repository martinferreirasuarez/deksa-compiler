import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCompilationInputs } from './compilation-inputs.mjs';

test('una seed controla juntos fauna Beta 5 y paquetes de entrenadores', async () => {
  const result = await buildCompilationInputs('compiler-integration-01', {
    throughWindow: 8,
    preview: true,
  });
  assert.equal(result.status, 'preview-only');
  assert.equal(result.throughWindow, 8);
  assert.equal(result.trainers.trainers.length, 358);
  assert.equal(result.fauna.tables.length, 315);
  assert.equal(result.fauna.metrics.coverage.slots, 2065);
  assert.equal(result.fauna.seed, result.seedPlan.faunaSeed);
  assert.deepEqual(result.fauna.metrics.coverage.unassignedWildFamilies, []);
});

test('cambiar de seed cambia fauna y selección de entrenadores sin cambiar el tamaño del mundo', async () => {
  const first = await buildCompilationInputs('compiler-integration-01', {
    throughWindow: 8,
    preview: true,
  });
  const second = await buildCompilationInputs('compiler-integration-02', {
    throughWindow: 8,
    preview: true,
  });
  assert.notEqual(first.trainers.trainerDigest, second.trainers.trainerDigest);
  assert.notEqual(first.fauna.contentDigest, second.fauna.contentDigest);
  assert.equal(first.trainers.trainers.length, second.trainers.trainers.length);
  assert.equal(first.fauna.tables.length, second.fauna.tables.length);
});

test('una vista parcial nunca se declara compilación final', async () => {
  await assert.rejects(buildCompilationInputs('compiler-integration-01', { throughWindow: 8 }),
    /Una compilación final requiere W01–W12/);
});
