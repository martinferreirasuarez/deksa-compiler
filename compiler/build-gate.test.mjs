import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { exportPathForWindow, inspectTrainerRoster, requireTrainerRoster } from './build-gate.mjs';

test('el gate exige exactamente las doce ventanas revisadas', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'deksa-compiler-gate-'));
  try {
    const empty = await inspectTrainerRoster(root);
    assert.equal(empty.ready, false);
    assert.equal(empty.windows.length, 12);
    assert.deepEqual(empty.windows.map(({ state }) => state), Array(12).fill('missing'));

    for (let number = 1; number <= 12; number += 1) {
      const filename = path.join(root, exportPathForWindow(number));
      await mkdir(path.dirname(filename), { recursive: true });
      await writeFile(filename, JSON.stringify({ reviewed: true, materializedTeams: [{}] }));
    }
    assert.equal((await requireTrainerRoster(root)).ready, true);

    const last = path.join(root, exportPathForWindow(12));
    await writeFile(last, JSON.stringify({ reviewed: false, materializedTeams: [{}] }));
    await assert.rejects(requireTrainerRoster(root), /W12/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('W01 usa su export especial sin inventar un archivo complete', () => {
  assert.match(exportPathForWindow(1), /w01-repair\/export\.json$/u);
  assert.match(exportPathForWindow(12), /w12-league-rematch\/export\.json$/u);
});
