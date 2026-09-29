import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSeedPlan, randomSeed, validateSeed } from './seed-plan.mjs';

test('la seed conocida conserva la selección de lotes ya compilada', async () => {
  const plan = await createSeedPlan('deksa-beta4-wiki-20260910-d5e1cc77');
  assert.deepEqual(plan.lots.slice(0, 5).map(({ lotId, variant }) => [lotId, variant]), [
    ['01A', 'C'], ['02A', 'A'], ['02B', 'C'], ['02C', 'C'], ['02D', 'C'],
  ]);
  assert.equal(plan.lots.length, 45);
  assert.equal(plan.emptyTrainerLots.length, 2);
});

test('la misma seed da un plan idéntico y otra seed cambia la selección', async () => {
  const first = await createSeedPlan('prueba-reproducible-01');
  const again = await createSeedPlan('prueba-reproducible-01');
  const other = await createSeedPlan('prueba-reproducible-02');
  assert.deepEqual(first, again);
  assert.notEqual(first.fingerprint, other.fingerprint);
  assert.notEqual(first.faunaSeed, other.faunaSeed);
  assert.notDeepEqual(first.lots.map(({ variant }) => variant), other.lots.map(({ variant }) => variant));
});

test('los lotes conectados comparten variante', async () => {
  const plan = await createSeedPlan('continuidad-01');
  const groups = new Map();
  for (const lot of plan.lots.filter(({ selectionScope }) => selectionScope === 'continuity')) {
    if (groups.has(lot.selectionId)) assert.equal(groups.get(lot.selectionId), lot.variant);
    groups.set(lot.selectionId, lot.variant);
  }
  assert.ok(groups.size > 0);
});

test('se rechazan seeds ambiguas o peligrosas para nombres de archivo', () => {
  for (const seed of ['', ' con-espacio', '../escape', 'a/b', 'ñ', 'x'.repeat(65)]) {
    assert.throws(() => validateSeed(seed), TypeError);
  }
  assert.match(randomSeed(), /^[0-9a-f]{24}$/u);
});
