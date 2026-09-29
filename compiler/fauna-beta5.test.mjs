import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildBeta5Fauna, prepareBeta5FaunaInputs } from './fauna-beta5.mjs';

test('la adaptación usa doce ventanas y conserva la política familiar', async () => {
  const inputs = await prepareBeta5FaunaInputs('fauna-control-01');
  assert.equal(inputs.sources.surfaces.length, 315);
  assert.equal(inputs.policy.families.length, 202);
  assert.equal(inputs.policy.windowOrder.length, 12);
  assert.equal(inputs.decisions.length, 157);
  assert.equal(inputs.decisions.filter(({ basis }) => basis === 'certified-campaign-fauna-minimum').length, 144);
  assert.equal(inputs.decisions.filter(({ basis }) => basis === 'editorial-postgame-projection').length, 11);
  assert.equal(inputs.decisions.filter(({ basis }) => basis === 'preserved-editorial-exception-no-native-wild-witness').length, 2);
  assert.equal(inputs.decisions.find(({ familyKey }) => familyKey === 'sneasel').window, 12);
  assert.equal(inputs.decisions.find(({ familyKey }) => familyKey === 'delibird').window, 11);
  assert.equal(inputs.config.windowByBatch['05G'], '06');
  assert.equal(inputs.sources.method_access.find(({ method }) => method === 'surf').available_from_batch, '05G');
  assert.equal(Object.keys(inputs.config.tableMinimumBySurface).length, 3);
});

test('las ventanas de elegibilidad son independientes de la seed', async () => {
  const first = await prepareBeta5FaunaInputs('fauna-control-01');
  const second = await prepareBeta5FaunaInputs('fauna-control-02');
  assert.deepEqual(first.decisions, second.decisions);
  assert.notEqual(first.seedPlan.faunaSeed, second.seedPlan.faunaSeed);
});

test('la misma seed produce idéntica fauna, niveles y formas', async () => {
  const first = (await buildBeta5Fauna('fauna-control-01')).distribution;
  const again = (await buildBeta5Fauna('fauna-control-01')).distribution;
  const other = (await buildBeta5Fauna('fauna-control-02')).distribution;
  assert.equal(first.contentDigest, again.contentDigest);
  assert.notEqual(first.contentDigest, other.contentDigest);
  assert.equal(first.tables.length, 315);
  assert.equal(first.metrics.coverage.slots, 2065);
  assert.deepEqual(first.metrics.coverage.unassignedWildFamilies, []);
  assert.equal(first.metrics.levelMaterialization.capViolations, 0);
  assert.equal(first.status, 'proposal');
  assert.equal(first.romPromotionStatus, 'not-promoted');
});

test('varias seeds no dejan familias habilitadas sin debut ni exceden caps', async () => {
  for (let index = 0; index < 8; index += 1) {
    const seed = `fauna-corpus-${String(index).padStart(2, '0')}`;
    const { distribution } = await buildBeta5Fauna(seed);
    assert.deepEqual(distribution.metrics.coverage.unassignedWildFamilies, [], seed);
    assert.equal(distribution.metrics.levelMaterialization.capViolations, 0, seed);
  }
});
