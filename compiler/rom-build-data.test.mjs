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
