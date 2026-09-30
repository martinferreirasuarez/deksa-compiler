import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCompilationInputs } from './compilation-inputs.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assignmentPath = 'wiki/trainer-authoring/profile-assignments/beta4-v1/assignment.generated.json';
const trainersPath = 'pokefirered/src/data/trainers.h';
const opponentsPath = 'pokefirered/include/constants/opponents.h';
const starters = { CHARMANDER: 'bulbasaur', BULBASAUR: 'squirtle', SQUIRTLE: 'charmander' };

export async function buildRomData(seed, root = projectRoot) {
  const [inputs, assignmentRaw, trainersSource, opponentsSource] = await Promise.all([
    buildCompilationInputs(seed, { projectRoot: root }),
    readFile(path.join(root, assignmentPath), 'utf8'),
    readFile(path.join(root, trainersPath), 'utf8'),
    readFile(path.join(root, opponentsPath), 'utf8'),
  ]);
  const assignments = new Map(JSON.parse(assignmentRaw).records.map((record) => [record.id, record]));
  const opponentIds = new Map([...opponentsSource.matchAll(/^#define\s+(TRAINER_\w+)\s+(\d+)\b/gm)]
    .map((match) => [match[1], Number(match[2])]));
  const records = [];
  const constants = new Set();
  const symbols = new Set();

  for (const trainer of inputs.trainers.trainers) {
    const assignment = assignments.get(trainer.trainerId);
    assert.ok(assignment, `${trainer.trainerId}: falta asignación física`);
    assert.equal(assignment.lotId, trainer.lotId);
    for (const constant of assignment.physicalBaseRecords) {
      assert.ok(!constants.has(constant), `${constant}: registro duplicado`);
      constants.add(constant);
      const id = opponentIds.get(constant);
      assert.ok(Number.isInteger(id), `${constant}: no existe en opponents.h`);
      const block = trainersSource.match(new RegExp(`^    \\[${constant}\\] = \\{([\\s\\S]*?)^    \\},`, 'm'))?.[1];
      assert.ok(block, `${constant}: no existe en trainers.h`);
      const symbol = block.match(/\.party = \w+\((\w+)\)/)?.[1];
      assert.ok(symbol && !symbols.has(symbol), `${constant}: party inexistente o compartida`);
      symbols.add(symbol);
      const rivalStarter = constant.match(/_(CHARMANDER|BULBASAUR|SQUIRTLE)$/)?.[1];
      const playerStarter = rivalStarter ? starters[rivalStarter] : null;
      assert.equal(Boolean(trainer.party.branches), Boolean(playerStarter), `${constant}: rama de rival no coincide`);
      const members = playerStarter ? trainer.party.branches[playerStarter]?.members : trainer.party.members;
      assert.equal(members?.length, 6, `${constant}: no tiene seis Pokémon`);
      records.push({
        trainerId: trainer.trainerId,
        constant,
        id,
        symbol,
        profile: trainer.profile,
        members: members.map((member) => ({
          species: member.species,
          level: member.level,
          moves: member.moves,
          nature: member.nature,
          ability: member.ability,
          item: member.item,
          iv: member.iv,
          evs: member.evs,
        })),
      });
    }
  }

  records.sort((left, right) => left.id - right.id);
  assert.equal(records.length, 468, 'W01–W12 deben ocupar 468 registros físicos');
  assert.equal(new Set(records.map((record) => record.trainerId)).size, 452);
  const tables = inputs.fauna.tables.map((table) => ({
    surfaceId: table.surfaceId,
    mapId: table.mapId,
    method: table.method,
    encounterRate: table.encounterRate,
    slots: (table.slots.length === 0 ? [
      { speciesId: 'SPECIES_NONE', minLevel: 1, maxLevel: 1 },
      { speciesId: 'SPECIES_NONE', minLevel: 1, maxLevel: 1 },
    ] : table.slots).map((slot) => ({
      species: slot.speciesId,
      minLevel: slot.minLevel,
      maxLevel: slot.maxLevel,
    })),
  }));
  assert.equal(tables.length, 315);
  return {
    schemaVersion: 1,
    seed,
    fingerprint: inputs.seedPlan.fingerprint,
    trainerDigest: inputs.trainers.trainerDigest,
    faunaDigest: inputs.fauna.contentDigest,
    records,
    tables,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.ok(process.argv.length === 4 || process.argv.length === 6,
    'Uso: node compiler/rom-build-data.mjs --seed MI_SEED [--project-root RUTA]');
  assert.equal(process.argv[2], '--seed');
  if (process.argv.length === 6) assert.equal(process.argv[4], '--project-root');
  process.stdout.write(`${JSON.stringify(await buildRomData(process.argv[3],
    process.argv.length === 6 ? path.resolve(process.argv[5]) : projectRoot))}\n`);
}
