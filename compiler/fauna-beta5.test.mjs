import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildBeta5Fauna, prepareBeta5FaunaInputs, EGG_ONLY_FAMILIES } from './fauna-beta5.mjs';
import { possibleWildForms } from '../wiki/generators/fauna/cap-level-policy.mjs';

test('la adaptación usa doce ventanas y conserva la política familiar', async () => {
  const inputs = await prepareBeta5FaunaInputs('fauna-control-01');
  assert.equal(inputs.sources.surfaces.length, 315);
  assert.equal(inputs.policy.families.length, 202);
  assert.equal(inputs.policy.windowOrder.length, 12);
  assert.equal(inputs.decisions.length, 147);
  assert.equal(inputs.policy.summary.wildEligibleFamilyCount, 147);
  assert.equal(inputs.policy.summary.excludedFamilyCount, 55);
  assert.equal(inputs.decisions.filter(({ basis }) => basis === 'certified-campaign-fauna-minimum').length, 136);
  assert.equal(inputs.decisions.filter(({ basis }) => basis === 'editorial-postgame-projection').length, 11);
  assert.ok(EGG_ONLY_FAMILIES.every((key) => !inputs.decisions.some(({ familyKey }) => familyKey === key)));
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
    for (const table of distribution.tables) {
      assert.ok(table.familyDetails.every(({ familyKey }) => !EGG_ONLY_FAMILIES.includes(familyKey)), seed);
      assert.ok(table.slots.every((slot) => slot.possibleSpeciesIds.includes(slot.speciesId)), seed);
    }
  }
});

test('las formas básicas siguen siendo posibles incluso por encima del nivel evolutivo', () => {
  const speciesByKey = new Map([
    ['MAGNEMITE', { evolution: { outgoing: [{ method: 'EVO_LEVEL', parameter: '30', to: 'MAGNETON' }] } }],
    ['MAGNETON', { evolution: { outgoing: [] } }],
  ]);
  const policy = { automaticEvolutionMethods: ['EVO_LEVEL'], evolutionExceptions: [] };
  assert.deepEqual(possibleWildForms({ entrySpecies: 'MAGNEMITE', familyKey: 'magnemite', level: 60, speciesByKey, policy }),
    ['MAGNEMITE', 'MAGNETON']);
  assert.deepEqual(possibleWildForms({ entrySpecies: 'MAGNEMITE', familyKey: 'magnemite', level: 20, speciesByKey, policy }),
    ['MAGNEMITE']);
});

test('sin familias legales la Caña Vieja queda sin picada, sin violar el no-spawn', async () => {
  let empty = null;
  for (let index = 0; index < 40 && !empty; index++) {
    const { distribution } = await buildBeta5Fauna(`empty-rod-${index}`);
    if (distribution.tables.some((table) => table.slots.length === 0)) empty = distribution;
  }
  assert.ok(empty, 'El corpus debe cubrir el descarte de la única familia de pesca inicial');
  const disabled = empty.tables.filter((table) => table.slots.length === 0);
  assert.equal(disabled.length, 3);
  assert.equal(empty.metrics.coverage.slots, 2059);
  assert.ok(disabled.every((table) => table.method === 'old_rod' && table.effectiveAccessBatch === '01A'));
  assert.equal(empty.metrics.coverage.excludedFamiliesInWild, 0);
});
