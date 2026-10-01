import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest } from './workflow.mjs';
import { effectiveStats } from './engine.mjs';

// Read-only slices of a sealed context. This module never proposes or ranks teams.
export function queryContext(context, { mode, species, level, nature }) {
  if (mode === 'window-recurrence') {
    if (!context.windowRecurrence) throw new Error('WINDOW_CONTEXT_REQUIRED');
    return context.windowRecurrence;
  }
  if (mode === 'summary') {
    const { legalMenu, sourceHashes, sourceDigests, ...summary } = context;
    return { ...summary, menuCounts: { families: legalMenu.families.length, species: legalMenu.species.length } };
  }
  if (mode === 'list') return context.legalMenu.species.map(({ slug, familyKey, types, baseStats, effortValues, abilities, levels, availabilityWindow }) => ({
    slug, family: familyKey, window: availabilityWindow?.ordinal ?? null,
    types, baseStats, effortValues, abilities, levels: Object.keys(levels),
  }));
  if (mode === 'resources') return {
    natures: context.legalMenu.natures, heldItems: context.legalMenu.heldItems,
    movePolicy: context.legalMenu.movePolicy, effortValuePolicy: context.legalMenu.effortValuePolicy,
  };
  if (mode === 'identity') {
    if (!context.identity || !context.canon) throw new Error('TRAINER_IDENTITY_CONTEXT_REQUIRED');
    return { identity: context.identity, canon: context.canon, composition: context.composition ?? context.contract?.composition ?? null,
      bossIdentity: context.bossIdentity ?? null, starterPolicy: context.starterPolicy ?? null };
  }
  if (mode === 'review-context') {
    return { reviewContext: context.reviewContext ?? null, bossReviewContext: context.bossReviewContext ?? null,
      construction: context.construction ?? null, dataRequirements: context.dataRequirements ?? [],
      windowConstructionOrder:context.windowConstructionOrder??[],
      currentLotTeams: context.currentLotTeams ?? { A: [], B: [], C: [] },
      lotFamilyUsage: context.lotFamilyUsage ?? null,
      windowRecurrence: context.windowRecurrence ?? null,
      starterPolicy: context.starterPolicy ?? null };
  }
  if (mode === 'gym-evidence') {
    if (!Array.isArray(context.gymEvidence) || !context.gymDistanceConstraints) throw new Error('GYM_EVIDENCE_NOT_AVAILABLE');
    return { gymEvidence: context.gymEvidence, gymDistanceConstraints: context.gymDistanceConstraints };
  }
  if (mode === 'starter-policy') {
    if (!context.starterPolicy) throw new Error('STARTER_POLICY_NOT_AVAILABLE');
    return context.starterPolicy;
  }
  if (mode === 'species') return species.map(slug => {
    const entry = context.legalMenu.species.find(candidate => candidate.slug === slug);
    if (!entry) throw new Error(`SPECIES_NOT_IN_MENU: ${slug}`);
    if (level !== undefined && !Object.hasOwn(entry.levels, level)) throw new Error(`LEVEL_NOT_IN_MENU: ${slug}/${level}`);
    if (level === undefined) return entry;
    const selected = { ...entry, levels: { [level]: entry.levels[level] } };
    if (nature === undefined) return selected;
    const natureEffect = context.legalMenu.natures.find(row => row.name === nature);
    if (!natureEffect) throw new Error(`NATURE_UNKNOWN: ${nature}`);
    selected.levels[level] = { ...selected.levels[level], nature: natureEffect,
      effectiveStats: effectiveStats({ baseStats: entry.baseStats, level: Number(level), iv: context.contract.iv,
        effortValues: entry.effortValues, nature: natureEffect }) };
    return selected;
  });
  throw new Error('QUERY_MODE_REQUIRED');
}

async function main() {
  const args = process.argv.slice(2);
  const options = {};
  const booleanFlags = ['--summary', '--list', '--resources', '--identity', '--review-context', '--gym-evidence', '--starter-policy', '--window-recurrence'];
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (![...booleanFlags, '--run', '--species', '--level', '--nature'].includes(key) || key in options) throw new Error(`INVALID_ARGUMENT: ${key}`);
    options[key] = booleanFlags.includes(key) ? true : args[++index];
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/.test(options['--run'] ?? '')) throw new Error('RUN_ID_REQUIRED');
  const modes = [...booleanFlags, '--species'].filter(key => options[key]);
  if (modes.length !== 1) throw new Error('ONE_QUERY_MODE_REQUIRED');
  if (options['--level'] !== undefined && (!/^[1-9][0-9]*$/.test(options['--level']) || modes[0] !== '--species')) throw new Error('INVALID_LEVEL_FILTER');
  if (options['--nature'] !== undefined && (options['--level'] === undefined || modes[0] !== '--species')) throw new Error('NATURE_REQUIRES_SPECIES_AND_LEVEL');
  const directory = path.dirname(fileURLToPath(import.meta.url));
  const sealed = JSON.parse(await readFile(path.join(directory, 'runs', options['--run'], 'context.json'), 'utf8'));
  if (digest(sealed.payload) !== sealed.digest) throw new Error('CONTEXT_TAMPERED');
  const output = queryContext(sealed.payload, { mode: modes[0].slice(2), species: options['--species']?.split(','),
    level: options['--level'], nature: options['--nature'] });
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
