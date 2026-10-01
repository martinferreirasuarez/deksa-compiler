import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { createBps, applyBps } from './bps.mjs';
import { validateBaseRom } from './base-rom.mjs';

test('BPS reconstruye exactamente archivos con cambios, relleno y tamaños distintos', () => {
  for (const [source, target] of [
    [Buffer.from('abc123'), Buffer.from('aBx123456')],
    [Buffer.alloc(16384), Buffer.alloc(32768, 7)],
    [Buffer.from('repeat-repeat-repeat'), Buffer.from('repeat')],
  ]) {
    const patch = createBps(source, target, '{"seed":"test"}');
    assert.equal(patch.subarray(0, 4).toString(), 'BPS1');
    assert.deepEqual(applyBps(source, patch), target);
    assert.deepEqual(createBps(source, target, '{"seed":"test"}'), patch);
  }
});

test('BPS rechaza base distinta y parches dañados', () => {
  const source = Buffer.from('original'), target = Buffer.from('modified');
  const patch = createBps(source, target);
  assert.throws(() => applyBps(Buffer.from('not-base'), patch), /checksum/i);
  assert.throws(() => applyBps(Buffer.from('short'), patch), /tamaño/i);
  patch[patch.length - 1] ^= 1;
  assert.throws(() => applyBps(source, patch), /checksum/i);
});

test('la base se valida por tamaño y contenido, nunca por nombre', () => {
  assert.throws(() => validateBaseRom(Buffer.alloc(5)), /ROM base/);
  assert.throws(() => validateBaseRom(Buffer.alloc(16 * 1024 * 1024)), /ROM base/);
});

test('un cambio binario de 16 MiB produce la misma ROM después de parchear', () => {
  const source = Buffer.alloc(16 * 1024 * 1024, 255);
  const target = Buffer.from(source);
  for (let i = 0; i < target.length; i += 1024) target[i] = i % 251;
  const patch = createBps(source, target, 'test-large');
  assert.equal(createHash('sha256').update(applyBps(source, patch)).digest('hex'),
    createHash('sha256').update(target).digest('hex'));
});
