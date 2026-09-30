import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRomData } from './rom-build-data.mjs';

test('una seed completa proyecta exactamente el roster y la fauna Beta 5', async () => {
  const data = await buildRomData('deksa-beta5-integration-01');
  assert.equal(data.records.length, 468);
  assert.equal(new Set(data.records.map((record) => record.trainerId)).size, 452);
  assert.equal(data.tables.length, 315);
  assert.ok(data.records.every((record) => record.members.length === 6));
  assert.ok(data.tables.every((table) => table.slots.length > 0));
  assert.ok(data.records.some((record) => record.constant.includes('CHAMPION_REMATCH')));
});

test('una seed sin pesca inicial compila slots NONE sólo para Caña Vieja', async () => {
  const data = await buildRomData('empty-rod-4');
  const disabled = data.tables.filter((table) => table.slots.some((slot) => slot.species === 'SPECIES_NONE'));
  assert.equal(disabled.length, 3);
  assert.ok(disabled.every((table) => table.method === 'old_rod' && table.slots.length === 2
    && table.slots.every((slot) => slot.species === 'SPECIES_NONE')));
  assert.equal(data.tables.flatMap((table) => table.slots).length, 2065);
});
