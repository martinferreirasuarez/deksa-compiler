import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { applyPackagePermutation, PACKAGE_PERMUTATION } from './package-permutation.mjs';
import { projectTrainerItems } from '../item-clause.mjs';
import { applyItemRevision } from '../item-revisions/v1/reader.mjs';
import { applyFamilyRevision } from '../family-revisions/v1/reader.mjs';
import { applyWindowRevision } from '../window-revisions/v1/reader.mjs';
import { loadWindowSnapshot, windowContext, windowFindings } from './window-recurrence.mjs';
import { V29_REFERENCES } from './inherited-references.mjs';
import { verifyFixedContractReferences } from './fixed-contracts.mjs';
import {operation,memo,invalidateOperation,observeFile,assertObservedFiles,forgetObservedFile} from './operation-cache.mjs';

export const LABEL = 'EN REVISIÓN · NO ACEPTADO';
export const GENERATOR_ID = 'beta4-v31';
export const ACTOR_REQUIREMENT = Object.freeze({ model: 'gpt-6-astra', effort: 'low', contextMode: 'fresh' });
export const NOB_POLICY_TRANSITION=Object.freeze({decisionId:'D-259',trainerId:'hiker-nob',
  previousRunId:'b4-v30-nob-001',runId:'b4-v31-nob-policy22-001',
  reason:'USER_APPROVED_FORWARD_ANCHOR_ADMISSION_PRESERVE_ALL_PUBLISHED_NO_REROLL',
  openingDigest:'9a82f1d7553d79f62ed1bbd3b2f3a6a929c551812544ed505e9e4decb42c0fc1',
  contextDigest:'0cea8b854c73431ce7168d952a0557d8da103d6416b049b979af6fe32c0c1549',
  envelopeDigest:'72a4fd287f37654aa40efecb96e8de7b0ef1598065a4179e2416945f189cf362',
  draftDigest:'33735827d414979670337250cb777df319b9610cdc4b146b4539efe02f1d785c',
  submissionDigest:'045ddca0d0d8e86adc3c92200744b01aec97cc1ed331b1ec78c26a1a019abb6f',
  actorId:'/root/v30_nob_author',executionRef:'/root/v30_nob_author'});
export const AUTHORIZED_REVISIONS = Object.freeze({
  'bug-catcher-sammy': Object.freeze({
    decisionId: 'D-251', authorization: 'USER_REQUEST_REGENERATE_SAMMY_WITH_ONE_IK_STARTER_OCCURRENCE_ACROSS_ABC',
    previousGeneratorId: 'beta4-v24', previousRunId: 'b4-d249-sammy-001',
    publicationPath: 'wiki/trainer-authoring/v24/published/b4-d249-sammy-001.json',
    publicationDigest: '0d11f8fb837b09b1e310e3b905ed512f7220285f3715ae4606ef2cfd33434a8e',
    previousStatus: 'TRAINER_REVIEW', creativeInput: false,
  }),
});
export const AUDITED_REFERENCES = Object.freeze([
  ...V29_REFERENCES,
  { trainerId: 'picnicker-kelsey', lotId: '02D', generatorId: 'beta4-v28', artifactPath: 'wiki/trainer-authoring/v28/accepted/trainers/picnicker-kelsey.json', publicationPath: 'wiki/trainer-authoring/v28/published/b4-v28-kelsey-001.json', publicationDigest: 'b08d65d82a494e7c87170a401e3a895fd0e95dfe2a1e799d21d9efb109e3c307', acceptanceDigest: 'a782d56d28c134841c9b388e7388575e7994ebcc24bf683430c56f8db504e1c2' },
  { trainerId: 'rocket-cerulean', lotId: '02D', generatorId: 'beta4-v28', artifactPath: 'wiki/trainer-authoring/v28/accepted/trainers/rocket-cerulean.json', publicationPath: 'wiki/trainer-authoring/v28/published/b4-v28-rocket-cerulean-001.json', publicationDigest: '8fa07c4fcee1dcf2ad573155d3bb67fb8dba45909051bf96d9e0d6cc26a2bb1c', acceptanceDigest: '5ac363e03981f5675ddcd1a155e8c681c3316290392a79a124d64fb6c00c5efd' },
  { trainerId: 'picnicker-diana', lotId: '02D', generatorId: 'beta4-v28', artifactPath: 'wiki/trainer-authoring/v28/accepted/trainers/picnicker-diana.json', publicationPath: 'wiki/trainer-authoring/v28/published/b4-v28-diana-001.json', publicationDigest: '4d06faa85c4b9c5a8e8922fc2673cd87c5626176c5c4acaebc92bc49db3855cf', acceptanceDigest: '3b3cb7053a2fb8659cf2262009e2e45b44dcda9b2d7b3d74587a811d22d81d86' },
Object.freeze({
  trainerId: 'leader-misty', lotId: '02D', generatorId: 'beta4-v26',
  artifactPath: 'wiki/trainer-authoring/v26/accepted/trainers/leader-misty.json',
  publicationPath: 'wiki/trainer-authoring/v26/published/b4-v26-misty-001.json',
  publicationDigest: '7bcc61fca63c3b71400292522a013ceb856605254e4bbe5bd5b82b2d12392b1a',
  acceptanceDigest: 'bb153761a6768ba2e5a4ee2b9d593e348b97fa1ef6a075f0139d01969b3b6c3c',
}), Object.freeze({
  ...{"trainerId":"bug-catcher-anthony","lotId":"01A","generatorId":"beta4-v25","artifactPath":"wiki/trainer-authoring/v25/accepted/trainers/bug-catcher-anthony.json","publicationPath":"wiki/trainer-authoring/v25/published/b4-v25-anthony-001.json","publicationDigest":"f10e64a76e5f8291970b447471ed642d05dba32f21066da4d95e377217d548d2","acceptanceDigest":"3651c080e09fabbc3efb6d20745b54af01dd6ffac5c87aaf41d6820e9bd1b258"},
}), ...[{"trainerId":"bug-catcher-doug","lotId":"01A","generatorId":"beta4-v25","artifactPath":"wiki/trainer-authoring/v25/accepted/trainers/bug-catcher-doug.json","publicationPath":"wiki/trainer-authoring/v25/published/b4-v25-doug-001.json","publicationDigest":"2e4fd726ca180df9fc6b4b4f6c77701e97ed0a97321c9a993467561cd94cf74b","acceptanceDigest":"a58f53d9b590868b406c938d38f4854eb14345cbcbe73cedea26534e3018e684"},{"trainerId":"bug-catcher-rick","lotId":"01A","generatorId":"beta4-v25","artifactPath":"wiki/trainer-authoring/v25/accepted/trainers/bug-catcher-rick.json","publicationPath":"wiki/trainer-authoring/v25/published/b4-v25-rick-001.json","publicationDigest":"ac095e79ccf25853c48ef987b6a051c2fe364222357074241875006d7a3e712f","acceptanceDigest":"83ddafaf31425846bb8fdd61a62bc8de501bb8687d2cf91b7b0a71af1daaebdd"},{"trainerId":"bug-catcher-sammy","lotId":"01A","generatorId":"beta4-v25","artifactPath":"wiki/trainer-authoring/v25/accepted/trainers/bug-catcher-sammy.json","publicationPath":"wiki/trainer-authoring/v25/published/b4-d251-sammy-001.json","publicationDigest":"623e3f945874a7de0c3047193b2ce08d15a266ab7bda9a978ef70e60732540f5","acceptanceDigest":"da6fb61c89b8a911ee1926e01e64453ffc03707bdfd5dc360f402432c5304845"},{"trainerId":"camper-liam","lotId":"01A","generatorId":"beta4-v25","artifactPath":"wiki/trainer-authoring/v25/accepted/trainers/camper-liam.json","publicationPath":"wiki/trainer-authoring/v25/published/b4-v25-liam-001.json","publicationDigest":"39d7df9c8bb1aaca54525f011daa67ecf6193aaf5db2a2798d460d727771bff1","acceptanceDigest":"b4979c66d78de7898d753d75c51eb5f9c1857dc6e73f982f9baa97734bd14b5f"}], Object.freeze({
  trainerId: 'leader-brock',
  lotId: '01A',
  artifactPath: 'wiki/trainer-authoring/v20/accepted/trainers/leader-brock.json',
  publicationPath: 'wiki/trainer-authoring/v20/published/b4-d242-brock-001.json',
  publicationDigest: '31dc287d4f2d0fe637f2cd61e42a202807f305ab5e23ba5e170b6bbe5b9e9c67',
  acceptanceDigest: '6db8dde71003f27c3322e22d9432f0f0ae3b7453db4612c1d43ea2b1a172f063',
}), Object.freeze({
  trainerId: 'bug-catcher-charlie', lotId: '01A', generatorId: 'beta4-v23',
  artifactPath: 'wiki/trainer-authoring/v23/accepted/trainers/bug-catcher-charlie.json',
  publicationPath: 'wiki/trainer-authoring/v23/published/b4-d248-charlie-001.json',
  publicationDigest: 'a3533f19e20b77aedb04110bf2ec28734d06e64436f5630068657fad60d86b4b',
  acceptanceDigest: '6f3443ed083209e7ad53fd27147af7a661f046b8c314a9a01daf2d06f1eb671a',
})]);
export const EXTERNAL_REVIEW_REFERENCES = Object.freeze([Object.freeze({
  trainerId: 'rival-route-22', lotId: '01A', generatorId: 'beta4-v21',
  publicationPath: 'wiki/trainer-authoring/v21/published/b4-d243-rival-route22-001.json',
  publicationDigest: '068704bcfe6ad6414720021c269d19e858f75b5a9c2f3f1f5c79c43574309944',
})]);

const BASE = 'wiki/trainer-authoring/v31';
const ROLES = ['author', 'corrector'];
const BRANCHES = ['A', 'B', 'C'];
const PROFILE_ORDER = ['JEFE', 'ESPECIALISTA', 'AVANZADO', 'COMÚN'];
export const PRODUCTION_SCOPE = Object.freeze({
  id: 'w02-advanced-common', lotOrder: ['02D', '02C', '02B', '02A'], profiles: ['AVANZADO','COMÚN'],
  authorization: 'USER_2026_09_08_CONTINUA_CON_LOS_AVANZADOS_Y_COMUNES_DE_LA_VENTANA_DE_MISTY_USANDO_ESTE_GENERADOR_HACEMOS_TODOS_MANANA_LO_AUDITO',
  acceptanceMode: 'OPERATIONAL_NOT_VISUAL_AUDIT', lotAccepted: false, romPromotion: false,
});
const SOURCE_FILES = ['engine.mjs', 'fossil-availability.mjs', 'move-mechanics.mjs', 'starter-policy.mjs', 'specialist-evidence.mjs',
  'policy.json', 'workflow.mjs', 'query.mjs', 'package-permutation.mjs', 'fixed-contracts.mjs', 'window-recurrence.mjs', 'inherited-references.mjs', 'audit.mjs',
  'skills/deksa-trainer-generator/SKILL.md', 'skills/deksa-trainer-generator/references/quality.md',
  'skills/deksa-trainer-generator/references/commands.md', 'skills/deksa-trainer-generator/references/author.md',
  'skills/deksa-trainer-generator/references/corrector.md', 'skills/deksa-trainer-generator/references/engine-capabilities.md',
  'skills/deksa-trainer-generator/references/special-cases.md'];
const LIMITS = [
  'Beta4.1: at most one copy of each nonempty held item per party, including all berries. Empty slots allowed; A/B/C independent. Historical accepted teams are retained as provenance, but duplicate items must not be copied.',
  'Trainer selection comes from the factual D-212 assignment; no trainer allowlist or fixed gym sequence.',
  'Construction follows JEFE > ESPECIALISTA > AVANZADO > COMÚN across the entire current window, important lots first within each profile; unsupported special contracts fail closed.',
  'Window recurrence uses all incorporated publications, independent A/B/C per lot, current N plus target only, and 15%/5% ceilings with the exact previous-window 20% trigger. Anchors count and remain.',
  'Only editorially accepted trainer digests feed the separate A/B/C ledgers; review publication alone does not.',
  'Accepted current-lot teams are exposed branch-to-branch only for tactical pyramid comparison; they do not alter the legal menu or provide a template.',
  'Brock v20 is inherited only through pinned publication and acceptance hashes; its original version and audit remain unchanged.',
  'The rival v21 acceptance is inherited only when its pinned publication and acceptance remain fully verified; review-only teams never feed ledgers or currentLotTeams.',
  'Exactly two independent gpt-6-astra/low/fresh creative actors are required per trainer.',
  'Trainer review, trainer acceptance, lot acceptance and ROM promotion are distinct states.',
];

const clone = value => JSON.parse(JSON.stringify(value));
const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : item);
export const digest = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : canonical(value)).digest('hex');
const fail = message => { throw new Error(message); };
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const safeId = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/.test(value);
const serial = value => `${JSON.stringify(value, null, 2)}\n`;
const profileRank = profile => {
  const rank = PROFILE_ORDER.indexOf(profile);
  return rank === -1 ? Number.POSITIVE_INFINITY : rank;
};

export async function createWorkflow({ projectRoot, engine: injectedEngine, auditedReferences = AUDITED_REFERENCES,
  externalReviewReferences = EXTERNAL_REVIEW_REFERENCES, productionScope = null, referenceVersion = null, onMetrics } = {}) {
  if(referenceVersion!==null&&referenceVersion!=='v30')fail('REFERENCE_VERSION_NOT_SUPPORTED');
  // Private read-only predecessor instance runs the same full verification
  // algorithm against its own frozen engine and source manifest.
  const BASE=`wiki/trainer-authoring/${referenceVersion??'v31'}`;
  const GENERATOR_ID=`beta4-${referenceVersion??'v31'}`;
  if (productionScope !== null && productionScope !== PRODUCTION_SCOPE.id) fail('UNKNOWN_PRODUCTION_SCOPE');
  const scope = productionScope ? PRODUCTION_SCOPE : null;
  const inScope = row => !scope || scope.lotOrder.includes(row.lotId) && scope.profiles.includes(row.profile);
  const root = await fs.realpath(projectRoot ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..'));
  const base = path.join(root, BASE);
  const rawEngine = injectedEngine ?? await import(pathToFileURL(path.join(base, 'engine.mjs')));
  const engine={...rawEngine,loadCatalogs:projectRoot=>memo(`${BASE}:catalogs:${projectRoot}`,async()=>{
    const catalogs=await rawEngine.loadCatalogs(projectRoot);
    for(const source of Object.keys(catalogs.sourceHashes??{}))if(!source.includes(':'))await observeFile(path.join(root,source));
    return catalogs;
  })};
  if (engine.BASELINE_PUBLICATION !== null) fail('GENERAL_WORKFLOW_MUST_NOT_IMPORT_BASELINE');

  async function checked(relative, { missing = false } = {}) {
    if (path.isAbsolute(relative) || relative.split(/[\\/]/).some(part => part === '..' || part === '.')) fail('UNSAFE_PATH');
    const target = path.resolve(root, relative);
    if (!target.startsWith(`${root}${path.sep}`)) fail('UNSAFE_PATH');
    let cursor = root;
    for (const part of path.relative(root, target).split(path.sep)) {
      cursor = path.join(cursor, part);
      try {
        if ((await fs.lstat(cursor)).isSymbolicLink()) fail(`SYMLINK_FORBIDDEN: ${relative}`);
      } catch (error) {
        if (error.code === 'ENOENT' && missing) return target;
        throw error;
      }
    }
    return target;
  }
  async function exists(relative) {
    try { await checked(relative); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  }
  async function read(relative) {
    const target = await checked(relative);
    if (!(await fs.stat(target)).isFile()) fail(`REGULAR_FILE_REQUIRED: ${relative}`);
    await observeFile(target);
    return JSON.parse(await fs.readFile(target, 'utf8'));
  }
  async function writeOnce(relative, value) {
    await assertObservedFiles();
    const target = await checked(relative, { missing: true });
    await fs.writeFile(target, serial(value), { flag: 'wx', mode: 0o444 });
    invalidateOperation();
  }
  async function seal(relative, payload) {
    const sealed = { digest: digest(payload), payload };
    await writeOnce(relative, sealed);
    return sealed.digest;
  }
  async function unseal(relative) {
    const sealed = await read(relative);
    if (!sealed.payload || sealed.digest !== digest(sealed.payload)) fail(`ARTIFACT_TAMPERED: ${relative}`);
    return sealed;
  }
  async function mkdir(relative) { await fs.mkdir(await checked(relative, { missing: true }), { recursive: true }); }
  async function locked(operation) {
    await mkdir(BASE);
    const lockPath = await checked(`${BASE}/.workflow.lock`, { missing: true });
    let handle;
    try { handle = await fs.open(lockPath, 'wx', 0o600); } catch (error) {
      if (error.code === 'EEXIST') fail('WORKFLOW_BUSY: another mutation or interrupted operation requires inspection');
      throw error;
    }
    try { return await operation(); } finally { await handle.close(); await fs.unlink(lockPath); }
  }
  const runPath = runId => {
    if (!safeId(runId)) fail('INVALID_RUN_ID');
    return `${BASE}/runs/${runId}`;
  };

  async function sourceDigestsUncached() {
    const hashes = {};
    for (const source of SOURCE_FILES) {
      const file=await checked(`${BASE}/${source}`);await observeFile(file);hashes[source]=digest(await fs.readFile(file));
    }
    if(!referenceVersion)hashes['operation-cache.mjs']=digest(await fs.readFile(await checked(`${BASE}/operation-cache.mjs`)));
    if(!referenceVersion)hashes['D259:TRAINER_FORWARD_RECURRENCE.md']=digest(await fs.readFile(await checked('TRAINER_FORWARD_RECURRENCE.md')));
    hashes['../item-clause.mjs'] = digest(await fs.readFile(await checked('wiki/trainer-authoring/item-clause.mjs')));
    hashes['../item-revisions/v1/reader.mjs'] = digest(await fs.readFile(await checked('wiki/trainer-authoring/item-revisions/v1/reader.mjs')));
    hashes['../family-revisions/v1/reader.mjs'] = digest(await fs.readFile(await checked('wiki/trainer-authoring/family-revisions/v1/reader.mjs')));
    for (const source of ['window-revisions/v1/reader.mjs','window-revisions/v1/runner.mjs','window-recurrence/v1/audit.mjs']) {
      hashes[`../${source}`]=digest(await fs.readFile(await checked(`wiki/trainer-authoring/${source}`)));
    }
    for (const reference of await verifyFixedContractReferences({ projectRoot: root })) {
      for (const [source, sourceDigest] of Object.entries(reference.sourceDigests)) hashes[`fixed-contract:${source}`] = sourceDigest;
    }
    return hashes;
  }
  function assignmentRecords(catalogs) {
    const records = catalogs?.profileAssignments?.records;
    if (!Array.isArray(records) || !records.length) fail('PROFILE_ASSIGNMENTS_REQUIRED');
    if (new Set(records.map(row => row?.id)).size !== records.length || records.some(row => !safeId(row?.id) || !safeId(row?.lotId))) {
      fail('PROFILE_ASSIGNMENTS_INVALID');
    }
    return records;
  }
  function isSpecialAssignment(row, catalogs) {
    return row.profile === 'PRÓLOGO'
      || (nonempty(row.bossIdentityId)
        && row.bossIdentityId === catalogs.policy?.localStarterReservation?.allowedTrainerIdentity);
  }
  function lotAssignments(catalogs, lotId) {
    if (!safeId(lotId)) fail('INVALID_LOT_ID');
    const records = assignmentRecords(catalogs).map((row, assignmentIndex) => ({ ...row, assignmentIndex }))
      .filter(row => row.lotId === lotId);
    if (!records.length) fail(`LOT_NOT_FOUND: ${lotId}`);
    const ordinary = records.filter(row => PROFILE_ORDER.includes(row.profile))
      .sort((left, right) => profileRank(left.profile) - profileRank(right.profile)
        || Number(isSpecialAssignment(left, catalogs)) - Number(isSpecialAssignment(right, catalogs))
        || left.assignmentIndex - right.assignmentIndex);
    const special = records.filter(row => isSpecialAssignment(row, catalogs));
    const unranked = records.filter(row => !PROFILE_ORDER.includes(row.profile));
    return { records, ordinary, special, unranked };
  }
  function findAssignment(catalogs, trainerId) {
    if (!safeId(trainerId)) fail('INVALID_TRAINER_ID');
    const row = assignmentRecords(catalogs).find(record => record.id === trainerId);
    if (!row) fail(`TRAINER_NOT_FOUND: ${trainerId}`);
    return row;
  }
  function campaignLotOrder(catalogs) {
    const assigned = new Set(assignmentRecords(catalogs).map(row => row.lotId));
    const records = assignmentRecords(catalogs);
    const identities = new Map((catalogs.identity?.trainers ?? []).map(row => [row.logicalId, row]));
    const encounterNodes = new Map((catalogs.graphs?.encounterGraph?.nodes ?? []).map(row => [row.id, row]));
    const playableIndex = new Map((catalogs.graphs?.playableGraph?.nodes ?? []).map((row, index) => [row.id, row.editorialIndex ?? index]));
    const weight = profile => PROFILE_ORDER.length - profileRank(profile);
    const lotPriority = lotId => {
      const rows = records.filter(row => row.lotId === lotId);
      const profiles = rows.map(row => weight(row.profile)).filter(Number.isFinite);
      return {
        gym: rows.some(row => identities.get(row.id)?.wikiTrainerClass === 'Líder de Gimnasio'),
        rival: rows.some(row => row.bossIdentityId === catalogs.policy?.localStarterReservation?.allowedTrainerIdentity),
        highestProfile: Math.max(0, ...profiles), aggregateProfile: profiles.reduce((sum, value) => sum + value, 0),
        majorCount: rows.filter(row => encounterNodes.get(row.id)?.battleRole === 'major').length,
        trainerCount: rows.length, playableIndex: playableIndex.get(lotId) ?? Number.POSITIVE_INFINITY,
      };
    };
    const compareLots = (leftId, rightId) => {
      const left = lotPriority(leftId); const right = lotPriority(rightId);
      return Number(right.gym) - Number(left.gym) || Number(right.rival) - Number(left.rival)
        || right.highestProfile - left.highestProfile || right.aggregateProfile - left.aggregateProfile
        || right.majorCount - left.majorCount || right.trainerCount - left.trainerCount
        || left.playableIndex - right.playableIndex || leftId.localeCompare(rightId);
    };
    const planned = (catalogs.plan?.windows ?? []).flatMap(window => (window.trainerBatches ?? window.batches ?? [])
      .filter(lotId => assigned.has(lotId)).sort(compareLots));
    const remainder = assignmentRecords(catalogs).map(row => row.lotId).filter(lotId => !planned.includes(lotId));
    return [...new Set([...planned, ...remainder])];
  }

  async function verifyAuditedReferencesUncached() {
    const verified = [];
    for (const reference of auditedReferences) {
      const referenceGenerator = reference.generatorId ?? 'beta4-v20';
      if (!['beta4-v20', 'beta4-v23', 'beta4-v25', 'beta4-v26', 'beta4-v28', 'beta4-v29'].includes(referenceGenerator)) fail('AUDITED_REFERENCE_GENERATOR_INVALID');
      if (!safeId(reference.trainerId) || !safeId(reference.lotId) || !/^[a-f0-9]{64}$/.test(reference.publicationDigest)) fail('AUDITED_REFERENCE_INVALID');
      if (!/^[a-f0-9]{64}$/.test(reference.acceptanceDigest)) fail('AUDITED_REFERENCE_INVALID');
      const acceptance = await unseal(reference.artifactPath);
      if (acceptance.digest !== reference.acceptanceDigest) fail(`AUDITED_ACCEPTANCE_DIGEST_MISMATCH: ${reference.trainerId}`);
      const audit = acceptance.payload;
      if (audit.schemaVersion !== 1 || audit.generatorId !== referenceGenerator || audit.status !== 'TRAINER_ACCEPTED'
        || audit.trainerId !== reference.trainerId || audit.lotId !== reference.lotId
        || audit.publicationPath !== reference.publicationPath || audit.publicationDigest !== reference.publicationDigest
        || !nonempty(audit.acceptedBy) || !nonempty(audit.acceptedAt) || audit.lotAccepted !== false || audit.romPromotion !== false) {
        fail(`AUDITED_ACCEPTANCE_CONTENT_MISMATCH: ${reference.trainerId}`);
      }
      const sealed = await unseal(reference.publicationPath);
      const payload = sealed.payload;
      if (sealed.digest !== reference.publicationDigest) fail(`AUDITED_REFERENCE_DIGEST_MISMATCH: ${reference.trainerId}`);
      if (payload.schemaVersion !== 1 || payload.generatorId !== referenceGenerator || payload.trainerId !== reference.trainerId
        || payload.lotId !== reference.lotId || payload.lotAccepted !== false
        || payload.trainer?.trainerId !== reference.trainerId || payload.trainer?.lotId !== reference.lotId
        || payload.status !== 'TRAINER_REVIEW' || payload.accepted !== false || payload.romPromotion !== false) {
        fail(`AUDITED_REFERENCE_CONTENT_MISMATCH: ${reference.trainerId}`);
      }
      for (const branch of BRANCHES) physicalParties(payload.trainer, branch);
      verified.push({ kind: 'AUDITED_EXTERNAL_REFERENCE', ...clone(reference), digest: acceptance.digest,
        acceptedBy: audit.acceptedBy, trainer: projectTrainerItems(payload.trainer), mechanicalProjection: 'BETA4.1' });
    }
    return verified;
  }
  async function verifyExternalReviewReferencesUncached() {
    const verified = [];
    for (const reference of externalReviewReferences) {
      const externalBase = 'wiki/trainer-authoring/v21';
      if (!safeId(reference.trainerId) || !safeId(reference.lotId) || reference.generatorId !== 'beta4-v21'
        || !/^[a-f0-9]{64}$/.test(reference.publicationDigest)
        || !reference.publicationPath?.startsWith(`${externalBase}/published/`)) fail('EXTERNAL_REVIEW_REFERENCE_INVALID');
      const sealed = await unseal(reference.publicationPath);
      if (sealed.digest !== reference.publicationDigest) fail('EXTERNAL_REVIEW_DIGEST_MISMATCH');
      const payload = sealed.payload;
      if (payload.schemaVersion !== 1 || payload.generatorId !== reference.generatorId
        || !safeId(payload.runId) || reference.publicationPath !== `${externalBase}/published/${payload.runId}.json`
        || payload.trainerId !== reference.trainerId || payload.lotId !== reference.lotId
        || payload.status !== 'TRAINER_REVIEW' || payload.label !== LABEL || payload.accepted !== false
        || payload.lotAccepted !== false || payload.romPromotion !== false
        || payload.trainer?.generatorId !== 'DEKSA-TRAINER-GENERATOR-V21'
        || payload.trainer?.trainerId !== reference.trainerId || payload.trainer?.lotId !== reference.lotId
        || !nonempty(payload.profile) || payload.trainer?.profile !== payload.profile) fail('EXTERNAL_REVIEW_CONTENT_MISMATCH');
      for (const branch of BRANCHES) physicalParties(payload.trainer, branch);
      const publication = { runId: payload.runId, trainerId: payload.trainerId, lotId: payload.lotId,
        profile: payload.profile, status: 'TRAINER_REVIEW', label: LABEL, artifactPath: reference.publicationPath,
        sha256: sealed.digest, trainer: clone(payload.trainer) };
      const index = await read(`${externalBase}/published/index.json`);
      if (index.schemaVersion !== 1 || index.generatorId !== reference.generatorId || index.label !== LABEL
        || !Array.isArray(index.entries) || index.entries.filter(row => row.trainerId === reference.trainerId).length !== 1
        || digest(index.entries.find(row => row.trainerId === reference.trainerId)) !== digest(publication)) fail('EXTERNAL_REVIEW_INDEX_MISMATCH');
      const artifactPath = `${externalBase}/accepted/trainers/${reference.trainerId}.json`;
      const acceptanceIndexPath = `${externalBase}/accepted/trainers/index.json`;
      if (!(await exists(artifactPath))) {
        if (await exists(acceptanceIndexPath)) {
          const acceptanceIndex = await read(acceptanceIndexPath);
          if (!Array.isArray(acceptanceIndex.entries) || acceptanceIndex.entries.some(row => row.trainerId === reference.trainerId)) fail('EXTERNAL_ACCEPTANCE_INDEX_MISMATCH');
        }
        verified.push({ ...publication, kind: 'EXTERNAL_TRAINER_REVIEW', publicationDigest: sealed.digest });
        continue;
      }
      const acceptance = await unseal(artifactPath);
      const audit = acceptance.payload;
      if (audit.schemaVersion !== 1 || audit.generatorId !== reference.generatorId || audit.status !== 'TRAINER_ACCEPTED'
        || audit.trainerId !== reference.trainerId || audit.lotId !== reference.lotId
        || audit.publicationPath !== reference.publicationPath || audit.publicationDigest !== sealed.digest
        || !nonempty(audit.acceptedBy) || !nonempty(audit.acceptedAt) || !Number.isFinite(Date.parse(audit.acceptedAt))
        || audit.lotAccepted !== false || audit.romPromotion !== false) fail('EXTERNAL_ACCEPTANCE_CONTENT_MISMATCH');
      const requirements = payload.validations?.corrector?.evidence?.publicationRequirements;
      if (!Array.isArray(requirements) || requirements.length) fail('EXTERNAL_ACCEPTANCE_GATE_BLOCKED');
      const accepted = { kind: 'V21_TRAINER_ACCEPTANCE', trainerId: reference.trainerId, lotId: reference.lotId,
        artifactPath, digest: acceptance.digest, acceptanceDigest: acceptance.digest,
        publicationDigest: sealed.digest, publicationPath: reference.publicationPath,
        acceptedBy: audit.acceptedBy, trainer: clone(payload.trainer) };
      const acceptanceIndex = await read(acceptanceIndexPath);
      if (acceptanceIndex.schemaVersion !== 1 || acceptanceIndex.generatorId !== reference.generatorId
        || acceptanceIndex.status !== 'TRAINER_ACCEPTANCES' || !Array.isArray(acceptanceIndex.entries)
        || acceptanceIndex.entries.filter(row => row.trainerId === reference.trainerId).length !== 1
        || digest(acceptanceIndex.entries.find(row => row.trainerId === reference.trainerId)) !== digest(accepted)) fail('EXTERNAL_ACCEPTANCE_INDEX_MISMATCH');
      const derived = accepted.trainerId === PACKAGE_PERMUTATION.trainerId
        && accepted.publicationDigest === PACKAGE_PERMUTATION.publicationDigest
        ? applyPackagePermutation(accepted) : null;
      verified.push({ ...accepted, kind: 'AUDITED_EXTERNAL_REFERENCE',
        ...(derived ? { trainer: projectTrainerItems(derived.trainer), packagePermutation: derived.evidence, mechanicalProjection: 'BETA4.1' } : {}) });
    }
    if (new Set(verified.map(row => row.trainerId)).size !== verified.length) fail('DUPLICATE_EXTERNAL_REVIEW_REFERENCE');
    return verified;
  }
  async function acceptedExternalReferencesUncached() {
    const entries = [...await verifyAuditedReferences(), ...(await verifyExternalReviewReferences()).filter(row => row.kind === 'AUDITED_EXTERNAL_REFERENCE')];
    const inherited=referenceVersion?[]:(await predecessorEvidence()).accepted;
    return [...await Promise.all(entries.map(async entry => {
      const revision = await applyItemRevision({ projectRoot: root, originalTrainer: entry.trainer, basePublicationDigest: entry.publicationDigest });
      const current = revision ? { ...entry, trainer: revision.updatedTrainer, itemRevisionDigest: revision.revisionDigest } : entry;
      const familyRevision = await applyFamilyRevision({ projectRoot: root, originalTrainer: current.trainer,
        baseItemRevisionDigest: current.itemRevisionDigest });
      const familyCurrent = familyRevision ? { ...current, trainer: familyRevision.updatedTrainer, familyRevisionDigest: familyRevision.revisionDigest } : current;
      const windowRevision = await applyWindowRevision({projectRoot:root,originalTrainer:familyCurrent.trainer,basePublicationDigest:entry.publicationDigest});
      return windowRevision ? {...familyCurrent,trainer:windowRevision.updatedTrainer,windowRevisionDigest:windowRevision.revisionDigest} : familyCurrent;
    })),...inherited.map(entry=>({...entry,kind:'AUDITED_EXTERNAL_REFERENCE',generatorId:'beta4-v30'}))];
  }
  async function verifyPinnedDescriptors(descriptors, kind) {
    for (const descriptor of descriptors) {
      const sealed = await unseal(descriptor.artifactPath);
      if (sealed.digest !== descriptor.digest) fail(`${kind}_CHANGED: ${descriptor.artifactPath}`);
    }
  }

  async function inspectUncached(runId, { current = true } = {}) {
    const directory = runPath(runId);
    const opening = await unseal(`${directory}/opening.json`);
    if (opening.payload.schemaVersion !== 1 || opening.payload.generatorId !== GENERATOR_ID) fail('WORKFLOW_VERSION_MISMATCH');
    if (opening.payload.runId !== runId || !safeId(opening.payload.trainerId)) fail('RUN_IDENTITY_MISMATCH');
    if(!referenceVersion&&digest(opening.payload.policyTransition??null)!==digest(await policyTransition(opening.payload.trainerId)))fail('POLICY_TRANSITION_CHANGED');
    if (digest(opening.payload.authorizedRevision ?? null) !== digest(await authorizedRevision(opening.payload.trainerId))) fail('REVISION_PROVENANCE_CHANGED');
    const context = await unseal(`${directory}/context.json`);
    const publications = await unseal(`${directory}/publications.json`);
    const acceptedReferences = await unseal(`${directory}/accepted-references.json`);
    const authorEnvelope = await unseal(`${directory}/author-envelope.json`);
    if (context.digest !== opening.payload.contextDigest || publications.digest !== opening.payload.publicationsDigest
      || acceptedReferences.digest !== opening.payload.acceptedReferencesDigest
      || authorEnvelope.digest !== opening.payload.authorEnvelopeDigest) fail('OPENING_BINDING_MISMATCH');
    await verifyPinnedDescriptors(publications.payload, 'PINNED_PUBLICATION');
    await verifyPinnedDescriptors(acceptedReferences.payload.filter(row => row.artifactPath.startsWith(`${BASE}/`)), 'PINNED_ACCEPTANCE');
    const liveExternalReferences=await acceptedExternalReferences();
    for (const external of acceptedReferences.payload.filter(row => !row.artifactPath.startsWith(`${BASE}/`))) {
      const match = liveExternalReferences.find(row => row.trainerId === external.trainerId);
      if (!match || match.publicationDigest !== external.publicationDigest || match.acceptanceDigest !== external.acceptanceDigest) fail('PINNED_AUDITED_REFERENCE_CHANGED');
    }
    let catalogs;
    if (current) {
      if (digest(await sourceDigests()) !== digest(opening.payload.sources)) fail('SOURCE_CHANGED: workflow, engine, policy or skill');
      const pinnedAccepted = await acceptedEntriesFromDescriptors(acceptedReferences.payload);
      catalogs = bindCatalogs(await engine.loadCatalogs(root), pinnedAccepted);
      if (catalogs.windowSnapshot && context.payload.windowRecurrence) {
        const pinned=context.payload.windowRecurrence;
        for (const source of pinned.sources) {
          if (digest(catalogs.windowSnapshot.sources.find(s=>s.trainerId===source.trainerId))!==digest(source)) fail('PINNED_WINDOW_SOURCE_CHANGED');
        }
        const ids=new Set(pinned.sources.map(s=>s.trainerId));
        catalogs={...catalogs,windowSnapshot:{...catalogs.windowSnapshot,
          sources:catalogs.windowSnapshot.sources.filter(s=>ids.has(s.trainerId)),
          presentations:catalogs.windowSnapshot.presentations.filter(t=>ids.has(t.trainerId)),
          trainers:catalogs.windowSnapshot.trainers.filter(t=>ids.has(t.trainerId))}};
      }
      const assignment = findAssignment(catalogs, opening.payload.trainerId);
      if (assignment.lotId !== opening.payload.lotId || assignment.profile !== opening.payload.profile) fail('ASSIGNMENT_CHANGED');
      const live = await buildBoundContext({ projectRoot: root, trainerId: opening.payload.trainerId,
        ledgers: clone(opening.payload.ledgers), currentLotTeams: clone(opening.payload.currentLotTeams) }, catalogs, pinnedAccepted);
      if (digest(live) !== context.digest) fail('SOURCE_CHANGED: catalogs or trainer context');
    }
    let state = 'AUTHORING';
    const records = {};
    let previous = opening.digest;
    for (const role of ROLES) {
      const recordPath = `${directory}/${role}-record.json`;
      if (!(await exists(recordPath))) {
        if (await exists(`${directory}/${role}-submission.json`) || await exists(`${directory}/${role}-validation.json`)
          || (role === 'author' && await exists(`${directory}/corrector-envelope.json`))) fail('INCOMPLETE_TRANSITION: inspect preserved artifacts; do not reroll');
        if (role === 'author' && await exists(`${directory}/corrector-record.json`)) fail('INVALID_STATE_SEQUENCE');
        break;
      }
      const record = await unseal(recordPath);
      if (record.payload.previous !== previous || record.payload.role !== role) fail('RECORD_CHAIN_MISMATCH');
      const input = await unseal(`${directory}/${role}-submission.json`);
      const report = await unseal(`${directory}/${role}-validation.json`);
      if (input.digest !== record.payload.inputDigest || report.digest !== record.payload.validationDigest) fail('RECORD_BINDING_MISMATCH');
      records[role] = { ...record, input: input.payload, validation: report.payload };
      previous = record.digest;
      state = report.payload.ok ? (role === 'author' ? 'CORRECTING' : 'TRAINER_REVIEW') : 'REJECTED';
      if (state === 'REJECTED') break;
    }
    if (records.author?.validation.ok) {
      const envelope = await unseal(`${directory}/corrector-envelope.json`);
      if (envelope.payload.authorRecordDigest !== records.author.digest || envelope.payload.contextDigest !== context.digest
        || digest(envelope.payload.authorSubmission) !== digest(records.author.input.submission)) fail('CORRECTOR_ENVELOPE_MISMATCH');
    }
    return { directory, opening, context, publications, acceptedReferences, catalogs, records, state, previous };
  }

  function publicationBundle(run, trainer) {
    return {
      schemaVersion: 1, generatorId: GENERATOR_ID, runId: run.opening.payload.runId,
      productionScope: run.opening.payload.productionScope ?? null,
      trainerId: run.opening.payload.trainerId, lotId: run.opening.payload.lotId, profile: run.opening.payload.profile,
      status: 'TRAINER_REVIEW', label: LABEL, accepted: false, lotAccepted: false, romPromotion: false,
      contextDigest: run.context.digest, sourceDigests: run.context.payload.sourceDigests,
      publicationsDigest: run.publications.digest, acceptedReferencesDigest: run.acceptedReferences.digest,
      correctorRecordDigest: run.records.corrector.digest,
      provenance: { organizer: run.opening.payload.organizer, author: run.records.author.input.provenance, corrector: run.records.corrector.input.provenance },
      author: run.records.author.input, corrector: run.records.corrector.input,
      validations: { author: run.records.author.validation, corrector: run.records.corrector.validation }, trainer,
      limits: [...LIMITS, 'Review publication does not accept this trainer, its lot, or ROM.'],
    };
  }
  async function revalidateRecords(run) {
    for (const role of ROLES) {
      const validation = await checkInput({ ...run, state: role === 'author' ? 'AUTHORING' : 'CORRECTING' }, role, run.records[role].input);
      if (!validation.ok || digest(validation) !== digest(run.records[role].validation)) fail('SEALED_VALIDATION_MISMATCH');
    }
  }
  const publicationIndex = entries => ({ schemaVersion: 1, generatorId: GENERATOR_ID, label: LABEL, entries });
  async function publicationEntriesUncached({ verifyIndex = true } = {}) {
    if (!(await exists(`${BASE}/published`))) return [];
    const entries = [];
    for (const file of (await fs.readdir(await checked(`${BASE}/published`))).sort()) {
      if (file === 'index.json') continue;
      if (!file.endsWith('.json') || !safeId(file.slice(0, -5))) fail('UNEXPECTED_PUBLICATION_ENTRY');
      const artifactPath = `${BASE}/published/${file}`;
      const sealed = await unseal(artifactPath);
      const bundle = sealed.payload;
      if (file !== `${bundle.runId}.json` || bundle.generatorId !== GENERATOR_ID) fail('PUBLICATION_FILENAME_MISMATCH');
      const run = await inspect(bundle.runId);
      if (run.state !== 'TRAINER_REVIEW' || bundle.correctorRecordDigest !== run.records.corrector.digest || bundle.contextDigest !== run.context.digest) fail('PUBLICATION_BINDING_MISMATCH');
      await revalidateRecords(run);
      const trainer = await engine.materialize(clone(run.context.payload), clone(run.records.corrector.input.submission), run.catalogs);
      if (digest(trainer) !== digest(bundle.trainer) || digest(bundle) !== digest(publicationBundle(run, trainer))) fail('PUBLICATION_EVIDENCE_MISMATCH');
      entries.push({ runId: bundle.runId, trainerId: bundle.trainerId, lotId: bundle.lotId, profile: bundle.profile,
        status: bundle.status, label: LABEL, artifactPath, sha256: sealed.digest, trainer: bundle.trainer });
    }
    entries.sort((left, right) => left.lotId.localeCompare(right.lotId) || left.trainerId.localeCompare(right.trainerId));
    if (new Set(entries.map(row => row.trainerId)).size !== entries.length) fail('DUPLICATE_TRAINER_PUBLICATION');
    if (verifyIndex && (entries.length || await exists(`${BASE}/published/index.json`))) {
      if (!(await exists(`${BASE}/published/index.json`))) fail('PUBLICATION_INDEX_INCOMPLETE');
      if (digest(await read(`${BASE}/published/index.json`)) !== digest(publicationIndex(entries))) fail('PUBLICATION_INDEX_MISMATCH');
    }
    return entries;
  }

  const acceptanceIndex = entries => ({ schemaVersion: 1, generatorId: GENERATOR_ID, status: 'TRAINER_ACCEPTANCES', entries });
  async function localAcceptanceEntriesUncached({ verifyIndex = true } = {}) {
    if (!(await exists(`${BASE}/accepted/trainers`))) return [];
    const publications = await publicationEntries();
    const byTrainer = new Map(publications.map(row => [row.trainerId, row]));
    const entries = [];
    for (const file of (await fs.readdir(await checked(`${BASE}/accepted/trainers`))).sort()) {
      if (file === 'index.json') continue;
      if (!file.endsWith('.json') || !safeId(file.slice(0, -5))) fail('UNEXPECTED_ACCEPTANCE_ENTRY');
      const artifactPath = `${BASE}/accepted/trainers/${file}`;
      const sealed = await unseal(artifactPath);
      const value = sealed.payload;
      const publication = byTrainer.get(value.trainerId);
      if (file !== `${value.trainerId}.json` || value.generatorId !== GENERATOR_ID || value.status !== 'TRAINER_ACCEPTED'
        || !publication || publication.sha256 !== value.publicationDigest || publication.artifactPath !== value.publicationPath) {
        fail('TRAINER_ACCEPTANCE_BINDING_MISMATCH');
      }
      entries.push({ kind: `${(referenceVersion??'v31').toUpperCase()}_TRAINER_ACCEPTANCE`, trainerId: value.trainerId, lotId: value.lotId,
        artifactPath, digest: sealed.digest, acceptanceDigest: sealed.digest, publicationDigest: value.publicationDigest,
        publicationPath: value.publicationPath, acceptedBy: value.acceptedBy, trainer: publication.trainer });
    }
    entries.sort((left, right) => left.lotId.localeCompare(right.lotId) || left.trainerId.localeCompare(right.trainerId));
    if (verifyIndex && (entries.length || await exists(`${BASE}/accepted/trainers/index.json`))) {
      if (!(await exists(`${BASE}/accepted/trainers/index.json`))) fail('ACCEPTANCE_INDEX_INCOMPLETE');
      if (digest(await read(`${BASE}/accepted/trainers/index.json`)) !== digest(acceptanceIndex(entries))) fail('ACCEPTANCE_INDEX_MISMATCH');
    }
    return entries;
  }
  async function acceptedReferencesUncached() {
    const entries = [...await acceptedExternalReferences(), ...await localAcceptanceEntries()];
    if (new Set(entries.map(row => row.trainerId)).size !== entries.length) fail('DUPLICATE_TRAINER_ACCEPTANCE');
    return entries;
  }
  async function acceptedEntriesFromDescriptorsUncached(descriptors) {
    const external = await acceptedExternalReferences();
    const result = [];
    for (const descriptor of descriptors) {
      const audited = external.find(row => row.trainerId === descriptor.trainerId
        && row.publicationDigest === descriptor.publicationDigest && row.acceptanceDigest === descriptor.acceptanceDigest);
      if (audited) { result.push(audited); continue; }
      const acceptance = await unseal(descriptor.artifactPath);
      if (acceptance.digest !== descriptor.digest || acceptance.payload.trainerId !== descriptor.trainerId
        || acceptance.payload.publicationDigest !== descriptor.publicationDigest) fail('PINNED_ACCEPTANCE_CHANGED');
      const publicationPath = descriptor.publicationPath ?? acceptance.payload.publicationPath;
      const publication = await unseal(publicationPath);
      if (publication.digest !== descriptor.publicationDigest || publication.payload.trainerId !== descriptor.trainerId) fail('PINNED_ACCEPTANCE_PUBLICATION_CHANGED');
      result.push({ ...descriptor, publicationPath, trainer: clone(publication.payload.trainer) });
    }
    return result;
  }
  function bindCatalogs(baseCatalogs, accepted) {
    let catalogs = baseCatalogs;
    if (typeof engine.withGymEvidence === 'function') {
      const gymEvidence = accepted.map(entry => {
        const payload={scope:'DERIVED_PRESENTATION_NOT_ORIGINAL_ACCEPTANCE',trainerId:entry.trainerId,trainer:clone(entry.trainer),
          sourcePins:{publicationDigest:entry.publicationDigest,acceptanceDigest:entry.acceptanceDigest,
            itemRevisionDigest:entry.itemRevisionDigest??null,familyRevisionDigest:entry.familyRevisionDigest??null,
            windowRevisionDigest:entry.windowRevisionDigest??null}};
        return {artifactPath:`derived:${referenceVersion??'v31'}/${entry.trainerId}`,sealed:{digest:digest(payload),payload}};
      });
      catalogs = engine.withGymEvidence(catalogs, gymEvidence);
    }
    if (typeof engine.withSpecialistEvidence === 'function') {
      catalogs = engine.withSpecialistEvidence(catalogs, accepted.map(entry => ({ trainerId: entry.trainerId,
        publicationDigest: entry.publicationDigest, acceptanceDigest: entry.acceptanceDigest, trainer: clone(entry.trainer) })));
    }
    return catalogs;
  }
  async function buildBoundContext(options, catalogs, accepted) {
    const context = await engine.buildContext(options, catalogs);
    const packagePermutations = accepted.filter(row => row.packagePermutation).map(row => clone(row.packagePermutation));
    const lots=campaignLotOrder(catalogs);
    const window=catalogs.plan.windows.find(w=>w.id===context.windowId);
    const windowConstructionOrder=assignmentRecords(catalogs).filter(row=>(window?.trainerBatches??window?.batches??[]).includes(row.lotId))
      .sort((a,b)=>profileRank(a.profile)-profileRank(b.profile)||lots.indexOf(a.lotId)-lots.indexOf(b.lotId))
      .map(row=>({trainerId:row.id,lotId:row.lotId,profile:row.profile,
        incorporated:accepted.some(e=>e.trainerId===row.id),acceptanceDigest:accepted.find(e=>e.trainerId===row.id)?.acceptanceDigest??null}));
    const { contextId, ...payload } = context;
    const policyTransitionEvidence=referenceVersion?null:await policyTransition(options.trainerId);
    const derived = { ...payload, packagePermutations,windowConstructionOrder,
      ...(policyTransitionEvidence?{policyTransition:policyTransitionEvidence}:{}) };
    return { ...derived, ...(contextId ? { contextId: `sha256:${digest(derived)}` } : {}) };
  }
  function physicalParties(trainer, branch) {
    const variant = trainer?.variants?.[branch];
    const parties = variant?.branches ? Object.entries(variant.branches).map(([choice, party]) => {
      if (!['bulbasaur', 'charmander', 'squirtle'].includes(choice) || party.playerStarterFamily !== choice) fail('ACCEPTED_REFERENCE_BRANCH_INVALID');
      return party;
    }) : [{ members: variant?.members }];
    if (variant?.branches && parties.length !== 3) fail('ACCEPTED_REFERENCE_BRANCHES_REQUIRED');
    if (parties.some(party => !Array.isArray(party.members) || party.members.length !== 6
      || party.members.some(member => !nonempty(member?.family) || member.family === '$starter'))) {
      fail(`ACCEPTED_REFERENCE_FAMILIES_REQUIRED: ${trainer?.trainerId}/${branch}`);
    }
    return parties;
  }
  function ledgersForLot(entries, lotId, excludedTrainerId = null) {
    const ledgers = { A: [], B: [], C: [] };
    for (const entry of entries.filter(row => row.lotId === lotId && row.trainerId !== excludedTrainerId)) {
      for (const branch of BRANCHES) {
        const members = physicalParties(entry.trainer, branch).flatMap(party => party.members);
        ledgers[branch].push({ trainerId: entry.trainerId, families: [...new Set(members.map(member => member.family))] });
      }
    }
    return ledgers;
  }
  function currentLotTeams(entries, lotId, excludedTrainerId = null) {
    const teams = { A: [], B: [], C: [] };
    for (const entry of entries.filter(row => row.lotId === lotId && row.trainerId !== excludedTrainerId)) {
      for (const branch of BRANCHES) {
        for (const party of physicalParties(entry.trainer, branch)) {
        teams[branch].push({ trainerId: entry.trainerId, profile: entry.trainer.profile,
          publicationDigest: entry.publicationDigest, acceptanceDigest: entry.acceptanceDigest,
          ...(party.playerStarterFamily ? { playerStarterFamily: party.playerStarterFamily, rivalStarterFamily: party.rivalStarterFamily } : {}),
          members: clone(party.members) });
        }
      }
    }
    return teams;
  }
  async function runEntriesUncached() {
    if (!(await exists(`${BASE}/runs`))) return [];
    const rows = [];
    for (const entry of await fs.readdir(await checked(`${BASE}/runs`), { withFileTypes: true })) {
      if (!entry.isDirectory() || !safeId(entry.name)) fail('UNEXPECTED_RUN_ENTRY');
      const run = await inspect(entry.name);
      rows.push({ runId: entry.name, trainerId: run.opening.payload.trainerId, lotId: run.opening.payload.lotId, state: run.state });
    }
    if (new Set(rows.map(row => row.trainerId)).size !== rows.length) fail('TRAINER_ALREADY_STARTED: sealed trainer has no reroll');
    return rows;
  }

  function trainerState(row, acceptedById, fixedById, publicationById, runById, historicalById, specialContract = false) {
    if (acceptedById.has(row.id)) return acceptedById.get(row.id).kind === 'AUDITED_EXTERNAL_REFERENCE' ? 'AUDITED_REFERENCE' : 'TRAINER_ACCEPTED';
    if (fixedById.has(row.id)) return 'FIXED_CONTRACT_VERIFIED';
    const run = runById.get(row.id);
    if (run) {
      if (run.state === 'TRAINER_REVIEW' && publicationById.has(row.id)) return 'TRAINER_REVIEW';
      return run.state;
    }
    if (publicationById.has(row.id)) return 'TRAINER_REVIEW';
    if (historicalById.has(row.id)) return 'REQUIRES_REGENERATION';
    return specialContract ? 'SPECIAL_CONTRACT_REQUIRED' : 'PENDING';
  }
  function lotGateFindings(inventory) {
    const missing = inventory.filter(row => !['AUDITED_REFERENCE', 'TRAINER_ACCEPTED', 'FIXED_CONTRACT_VERIFIED'].includes(row.state)).map(row => row.trainerId);
    const findings = [];
    if (missing.length) findings.push({ code: 'TRAINER_ACCEPTANCES_MISSING', trainerIds: missing,
      message: `Faltan aceptaciones editoriales individuales: ${missing.join(', ')}.` });
    const fixed = inventory.filter(row => row.state === 'FIXED_CONTRACT_VERIFIED').map(row => row.trainerId);
    if (fixed.length) findings.push({ code: 'FIXED_CONTRACT_LOT_GATE_UNCERTIFIED', trainerIds: fixed,
      message: `Los contratos fijos verificados (${fixed.join(', ')}) completan la secuencia de construcción, pero no equivalen a aceptación de entrenador ni certifican el lote.` });
    findings.push(
      { code: 'PYRAMID_GATE_MISSING', message: 'No existe todavía un certificado verificable de pirámide para este lote.' },
      { code: 'FRONTIER_GATE_MISSING', message: 'No existe todavía un certificado verificable de fronteras para este lote.' },
      { code: 'RECURRENCE_GATE_MISSING', message: 'No existe todavía un certificado verificable de recurrencia para este lote.' },
    );
    return findings;
  }
  async function roster({ lotId } = {}) {
    const catalogs = await engine.loadCatalogs(root);
    const external = await verifyExternalReviewReferences();
    const predecessor=referenceVersion?{publications:[],runs:[]} : await predecessorEvidence();
    const publications = [...await publicationEntries(), ...predecessor.publications,...external.filter(row => row.kind === 'EXTERNAL_TRAINER_REVIEW')];
    if (new Set(publications.map(row => row.trainerId)).size !== publications.length) fail('DUPLICATE_TRAINER_PUBLICATION');
    for (const reference of external) {
      const assignment = findAssignment(catalogs, reference.trainerId);
      if (assignment.lotId !== reference.lotId || assignment.profile !== reference.trainer.profile) fail('EXTERNAL_REVIEW_ASSIGNMENT_MISMATCH');
    }
    const accepted = await acceptedReferences();
    const fixed = await verifyFixedContractReferences({ projectRoot: root });
    const historical = await verifyAuditedReferences();
    const superseded=referenceVersion?null:predecessor.runs.find(r=>r.trainerId===NOB_POLICY_TRANSITION.trainerId);
    if(superseded) {
      await policyTransition(superseded.trainerId);
      if(superseded.runId!==NOB_POLICY_TRANSITION.previousRunId||superseded.state!=='AUTHORING')fail('NOB_TRANSITION_SOURCE_STATE_CHANGED');
    }
    const runs = [...await runEntries(),...predecessor.runs.filter(r=>r!==superseded)];
    if(new Set(runs.map(r=>r.trainerId)).size!==runs.length)fail('DUPLICATE_TRAINER_RUN_ACROSS_VERSIONS');
    const acceptedById = new Map(accepted.map(row => [row.trainerId, row]));
    const fixedById = new Map(fixed.map(row => [row.trainerId, row]));
    if (fixedById.size !== fixed.length || fixed.some(row => {
      const assignment = findAssignment(catalogs, row.trainerId);
      return assignment.lotId !== row.lotId || assignment.profile !== 'PRÓLOGO'
        || !isSpecialAssignment(assignment, catalogs) || acceptedById.has(row.trainerId);
    })) fail('FIXED_CONTRACT_REFERENCE_INVALID');
    const publicationById = new Map(publications.map(row => [row.trainerId, row]));
    const runById = new Map(runs.map(row => [row.trainerId, row]));
    const historicalById = new Map(historical.map(row => [row.trainerId, row]));
    const campaignOrder = campaignLotOrder(catalogs);
    const constructionComplete = id => lotAssignments(catalogs, id).records
      .every(row => acceptedById.has(row.id) || fixedById.has(row.id));
    const windowRank = row => catalogs.plan.windows.findIndex(w=>(w.trainerBatches??w.batches).includes(row.lotId));
    const globalPending=assignmentRecords(catalogs).filter(row=>inScope(row)&&!acceptedById.has(row.id)&&!fixedById.has(row.id))
      .sort((a,b)=>windowRank(a)-windowRank(b)||profileRank(a.profile)-profileRank(b.profile)
        ||campaignOrder.indexOf(a.lotId)-campaignOrder.indexOf(b.lotId));
    const activeLotId=globalPending[0]?.lotId??null;
    const lotIds = lotId ? [lotId] : campaignOrder;
    const lots = lotIds.map(id => {
      const assignment = lotAssignments(catalogs, id);
      const ordered = [...assignment.ordinary, ...assignment.unranked];
      const specialIds = new Set(assignment.special.map(row => row.id));
      const inventory = ordered.map(row => ({ trainerId: row.id, lotId: row.lotId, profile: row.profile,
        constructionRank: PROFILE_ORDER.includes(row.profile) ? profileRank(row.profile) : null,
        specialContract: specialIds.has(row.id),
        state: trainerState(row, acceptedById, fixedById, publicationById, runById, historicalById, specialIds.has(row.id)),
        acceptanceDigest: acceptedById.get(row.id)?.acceptanceDigest ?? null,
        fixedContractDigest: fixedById.get(row.id)?.contractDigest ?? null,
        publicationDigest: publicationById.get(row.id)?.sha256 ?? acceptedById.get(row.id)?.publicationDigest
          ?? historicalById.get(row.id)?.publicationDigest ?? null,
        runId: runById.get(row.id)?.runId ?? null }));
      const nextId=globalPending.find(row=>row.lotId===id)?.id;
      const next=inventory.find(row=>row.trainerId===nextId)??null;
      const complete = inventory.every(row => ['TRAINER_ACCEPTED', 'AUDITED_REFERENCE', 'FIXED_CONTRACT_VERIFIED'].includes(row.state));
      const leagueSpecial = ['08C', '09I'].includes(id);
      return { lotId: id, constructionOrder: assignment.ordinary.map(row => row.id), specialTrainerIds: assignment.special.map(row => row.id),
        specialContract: leagueSpecial ? 'LEAGUE_D221' : null,
        nextTrainerId: next?.trainerId ?? null, inventory,
        ...(scope ? { scopeStatus: !scope.lotOrder.includes(id) ? 'DEFERRED_OUTSIDE_SCOPE' : next ? 'PENDING' : 'SCOPE_COMPLETE',
          deferredTrainerIds: inventory.filter(row => !inScope(row)).map(row => row.trainerId) } : {}),
        constructionStatus: complete ? 'CONSTRUCTION_COMPLETE' : id === activeLotId ? 'ACTIVE' : 'WAITING_FOR_CONSTRUCTION_ORDER',
        lotAcceptance: { status: complete ? 'WAITING_NEIGHBORS' : 'WAITING_TRAINERS',
          findings: [...lotGateFindings(inventory), ...(leagueSpecial ? [{ code: 'LEAGUE_D221_GATE_MISSING',
            message: '08C/09I requieren exclusividad D-221 por personaje y no se certifican con la pirámide ordinaria.' }] : [])] } };
    });
    return { generatorId: GENERATOR_ID, profileOrder: PROFILE_ORDER, constructionLotOrder: campaignOrder,
      activeLotId,policyTransitions:superseded?[await policyTransition(superseded.trainerId)]:[],globalConstructionOrder:globalPending.map(row=>({trainerId:row.id,lotId:row.lotId,profile:row.profile})), productionScope: scope, fixedContractReferences: fixed.map(row => ({ kind: row.kind, trainerId: row.trainerId, lotId: row.lotId,
        contractId: row.contractId, contractDigest: row.contractDigest, creativeInput: false, trainerAcceptance: false, lotAcceptance: false })), lots };
  }

  async function preflight({ trainerId, lotId } = {}) {
    if ((trainerId ? 1 : 0) + (lotId ? 1 : 0) !== 1) fail('PREFLIGHT_REQUIRES_EXACTLY_ONE_OF_TRAINER_OR_LOT');
    const sources = await sourceDigests();
    const catalogs = await engine.loadCatalogs(root);
    if (catalogs.speciesAvailability && catalogs.speciesAvailability.audit?.status !== 'ready') fail('SPECIES_CATALOG_NOT_READY');
    const selected = trainerId ? findAssignment(catalogs, trainerId) : null;
    const targetLotId = selected?.lotId ?? lotId;
    const rosterReport = await roster({ lotId: targetLotId });
    const lot = rosterReport.lots[0];
    const targetId = trainerId ?? lot.nextTrainerId;
    const errors = [];
    if (scope && (selected ? !inScope(selected) : !scope.lotOrder.includes(targetLotId))) errors.push({ code: 'TRAINER_OUTSIDE_PRODUCTION_SCOPE', trainerId, lotId: targetLotId });
    const activeLotId = rosterReport.activeLotId;
    if (targetLotId !== activeLotId) errors.push({ code: 'LOT_SEQUENCE_REQUIRED', lotId: targetLotId, expectedLotId: activeLotId,
      message: `${targetLotId} no es el lote activo; se esperaba ${activeLotId}.` });
    if (trainerId && trainerId !== lot.nextTrainerId) {
      errors.push({ code: 'PYRAMID_ORDER_REQUIRED', trainerId, expectedTrainerId: lot.nextTrainerId,
        message: lot.nextTrainerId ? `${trainerId} no es el próximo ID según la pirámide; se esperaba ${lot.nextTrainerId}.` : `${trainerId} ya no está pendiente en ${targetLotId}.` });
    }
    const targetInventory = lot.inventory.find(row => row.trainerId === targetId);
    if (!targetId) errors.push({ code: 'NO_PENDING_TRAINER', lotId: targetLotId, message: 'No quedan entrenadores ordinarios pendientes; revisar contratos especiales y gates de lote.' });
    else if (!['PENDING', 'SPECIAL_CONTRACT_REQUIRED', 'REQUIRES_REGENERATION'].includes(targetInventory?.state)) errors.push({ code: `TRAINER_STATE_${targetInventory?.state ?? 'UNKNOWN'}`, trainerId: targetId,
      message: `${targetId} no puede iniciarse desde estado ${targetInventory?.state ?? 'UNKNOWN'}.` });
    const authoringAllowed = catalogs.policy?.authoring?.status === 'READY'
      && catalogs.policy?.authoring?.requiredReadyStatus === 'READY';
    if (!authoringAllowed) errors.push({ code: 'AUTHORING_NOT_READY', trainerId: targetId, message: 'policy.authoring requiere READY explícito.' });
    let contextDigest = null;
    let contextSourceDigests = null;
    let readiness = null;
    let ledgers = null;
    let lotTeams = null;
    let dataRequirements = null;
    let construction = null;
    let packagePermutations = [];
    let windowRecurrence = null;
    let windowConstructionOrder = [];
    const targetMayBuild = targetId && ['PENDING', 'SPECIAL_CONTRACT_REQUIRED', 'REQUIRES_REGENERATION'].includes(targetInventory?.state);
    if (targetMayBuild) {
      const accepted = await acceptedReferences();
      const target = findAssignment(catalogs, targetId);
      ledgers = ledgersForLot(accepted, target.lotId, targetId);
      lotTeams = currentLotTeams(accepted, target.lotId, targetId);
      const boundCatalogs = bindCatalogs(catalogs, accepted);
      const context = await buildBoundContext({ projectRoot: root, trainerId: targetId,
        ledgers: clone(ledgers), currentLotTeams: clone(lotTeams) }, boundCatalogs, accepted);
      if (!context || !context.sourceDigests || !Object.keys(context.sourceDigests).length) fail('SOURCE_DIGESTS_REQUIRED');
      readiness = await engine.contextReadiness(context);
      if (!['BLOCKED', 'NO_PROVEN_CONFLICT'].includes(readiness?.status) || !Array.isArray(readiness.errors)) fail('INVALID_ENGINE_READINESS');
      errors.push(...readiness.errors.map(error => ({ ...error, trainerId: targetId })));
      contextDigest = digest(context);
      contextSourceDigests = context.sourceDigests;
      dataRequirements = clone(context.dataRequirements ?? []);
      construction = clone(context.construction ?? null);
      packagePermutations = clone(context.packagePermutations ?? []);
      windowRecurrence = clone(context.windowRecurrence ?? null);
      windowConstructionOrder = clone(context.windowConstructionOrder ?? []);
    }
    const publications = await publicationEntries();
    const accepted = await acceptedReferences();
    const externalReviews = (await verifyExternalReviewReferences()).filter(row => row.kind === 'EXTERNAL_TRAINER_REVIEW');
    const ok = errors.length === 0 && targetId !== null;
    return { ok, status: ok ? 'NO_PROVEN_CONFLICT' : 'BLOCKED', errors,
      mechanicalReady: readiness?.status === 'NO_PROVEN_CONFLICT', authoringAllowed,
      trainerId: targetId, requestedTrainerId: trainerId ?? null, lotId: targetLotId,
      nextTrainerId: lot.nextTrainerId, constructionOrder: lot.constructionOrder, specialTrainerIds: lot.specialTrainerIds,
      context: contextDigest ? { trainerId: targetId, contextDigest, sourceDigests: contextSourceDigests,
        readiness, dataRequirements, construction, ledgers, currentLotTeams: lotTeams, packagePermutations, windowRecurrence, windowConstructionOrder } : null,
      publicationDigests: publications.map(row => ({ artifactPath: row.artifactPath, digest: row.sha256 })),
      historicalReferenceDigests: [],
      externalReviewReferenceDigests: externalReviews.map(row => ({ trainerId: row.trainerId, lotId: row.lotId,
        artifactPath: row.artifactPath, digest: row.publicationDigest, status: 'TRAINER_REVIEW', generatorId: 'beta4-v21' })),
      acceptedReferenceDigests: accepted.map(row => ({ trainerId: row.trainerId, lotId: row.lotId,
        artifactPath: row.artifactPath, digest: row.digest ?? row.publicationDigest,
        publicationPath: row.publicationPath ?? row.artifactPath,
        publicationDigest: row.publicationDigest, acceptanceDigest: row.acceptanceDigest })),
      fixedContractReferences: clone(rosterReport.fixedContractReferences),
      generatorId: GENERATOR_ID, sources, publicationLabel: LABEL,
      requiredModel: ACTOR_REQUIREMENT.model, requiredEffort: ACTOR_REQUIREMENT.effort, limits: LIMITS };
  }

  async function authorizedRevision(trainerId) {
    const reference = AUTHORIZED_REVISIONS[trainerId];
    if (!reference) return null;
    const previous = await unseal(reference.publicationPath);
    if (previous.digest !== reference.publicationDigest || previous.payload.trainerId !== trainerId
      || previous.payload.status !== reference.previousStatus) fail('REVISION_SOURCE_CHANGED');
    return clone(reference);
  }

  async function policyTransition(trainerId) {
    if(referenceVersion||trainerId!==NOB_POLICY_TRANSITION.trainerId)return null;
    const t=NOB_POLICY_TRANSITION,priorBase=`wiki/trainer-authoring/v30/runs/${t.previousRunId}`;
    const opening=await unseal(`${priorBase}/opening.json`),context=await unseal(`${priorBase}/context.json`),envelope=await unseal(`${priorBase}/author-envelope.json`);
    const priorDraftPath=`${priorBase}/drafts/author.json`,draft=await read(priorDraftPath);
    if(opening.digest!==t.openingDigest||context.digest!==t.contextDigest||envelope.digest!==t.envelopeDigest
      ||digest(draft)!==t.draftDigest||digest(draft.submission)!==t.submissionDigest)fail('POLICY_TRANSITION_SOURCE_CHANGED');
    if(draft.provenance.actorId!==t.actorId||draft.provenance.executionRef!==t.executionRef
      ||draft.provenance.inputDigest!==t.envelopeDigest||draft.provenance.model!==ACTOR_REQUIREMENT.model
      ||draft.provenance.effort!==ACTOR_REQUIREMENT.effort||draft.provenance.role!=='author')fail('POLICY_TRANSITION_PROVENANCE_CHANGED');
    for(const file of ['author-record.json','corrector-record.json','corrector-envelope.json'])if(await exists(`${priorBase}/${file}`))fail('POLICY_TRANSITION_ALREADY_SUBMITTED');
    if(await exists(`wiki/trainer-authoring/v30/published/${t.previousRunId}.json`))fail('POLICY_TRANSITION_ALREADY_PUBLISHED');
    return {...t,priorDraftPath,originalProvenance:clone(draft.provenance),newContextMode:'policy-transition',
      sourceState:'AUTHORING_UNSUBMITTED',previousRunPreserved:true,publishedTeamsChanged:false};
  }
  async function transition({trainerId}) {
    const evidence=await policyTransition(trainerId);if(!evidence)fail('NOMINAL_POLICY_TRANSITION_REQUIRED');
    return {...evidence,commands:{start:['node',path.join(base,'workflow.mjs'),'start','--project-root',root,
      '--trainer',trainerId,'--run',evidence.runId,'--organizer','/root','--production-scope','w02-advanced-common']},
      instruction:'Abrir únicamente el run nominal. El Autor original lee nuevo handoff y draft previo pinneado, conserva submission y actualiza sólo provenance para repreview. No modificar V30.'};
  }

  async function start({ runId, trainerId, organizer }) {
    if (!nonempty(organizer)) fail('ORGANIZER_ID_REQUIRED');
    const directory = runPath(runId);
    return locked(async () => {
      const transitionEvidence=await policyTransition(trainerId);
      if(transitionEvidence&&runId!==transitionEvidence.runId)fail('NOMINAL_POLICY_TRANSITION_RUN_REQUIRED');
      const report = await preflight({ trainerId });
      const revision = await authorizedRevision(trainerId);
      if (!report.ok) fail(`PREFLIGHT_BLOCKED: ${report.errors.map(error => `${error.trainerId ?? report.lotId}/${error.code}`).join(', ')}`);
      if (await exists(directory)) fail('RUN_ALREADY_EXISTS');
      const existingRuns = await runEntries();
      if (existingRuns.some(row => row.trainerId === trainerId)) fail('TRAINER_ALREADY_STARTED: sealed trainer has no reroll');
      const baseCatalogs = await engine.loadCatalogs(root);
      const assignment = findAssignment(baseCatalogs, trainerId);
      const publications = await publicationEntries();
      const accepted = await acceptedReferences();
      const publicationDescriptors = publications.map(row => ({ artifactPath: row.artifactPath, digest: row.sha256 }));
      const acceptedDescriptors = accepted.map(row => ({ trainerId: row.trainerId, lotId: row.lotId,
        artifactPath: row.artifactPath, digest: row.digest ?? row.publicationDigest,
        publicationPath: row.publicationPath ?? row.artifactPath,
        publicationDigest: row.publicationDigest, acceptanceDigest: row.acceptanceDigest }));
      if (digest(publicationDescriptors) !== digest(report.publicationDigests)
        || digest(acceptedDescriptors) !== digest(report.acceptedReferenceDigests)) fail('REFERENCES_CHANGED_DURING_START');
      const ledgers = ledgersForLot(accepted, assignment.lotId, trainerId);
      const lotTeams = currentLotTeams(accepted, assignment.lotId, trainerId);
      const catalogs = bindCatalogs(baseCatalogs, accepted);
      const context = await buildBoundContext({ projectRoot: root, trainerId,
        ledgers: clone(ledgers), currentLotTeams: clone(lotTeams) }, catalogs, accepted);
      if (digest(context) !== report.context.contextDigest) fail('SOURCE_CHANGED_DURING_START');
      await mkdir(`${BASE}/runs`);
      await fs.mkdir(await checked(directory, { missing: true }));
      const contextDigest = await seal(`${directory}/context.json`, context);
      const publicationsDigest = await seal(`${directory}/publications.json`, publicationDescriptors);
      const acceptedReferencesDigest = await seal(`${directory}/accepted-references.json`, acceptedDescriptors);
      const authorEnvelopeDigest = await seal(`${directory}/author-envelope.json`, {
        schemaVersion: 1, generatorId: GENERATOR_ID, role: 'author', runId, trainerId, contextDigest, contextFile: 'context.json',
        ...(transitionEvidence?{policyTransition:transitionEvidence,allowedNominalPriorDraft:transitionEvidence.priorDraftPath}:{}),
        requiredModel: ACTOR_REQUIREMENT.model, requiredEffort: ACTOR_REQUIREMENT.effort, requiredContext: transitionEvidence?'policy-transition':ACTOR_REQUIREMENT.contextMode,
        forbiddenInputs: ['previous trainer movesets or drafts outside sealed currentLotTeams/windowRecurrence.presentations or the explicitly pinned policyTransition.priorDraftPath', 'conversation history except the nominal author continuation explicitly recorded by policyTransition', 'seed fauna', 'unsealed trainer reviews'],
        allowedPriorEvidence: 'Factual context, branch ledgers, accepted currentLotTeams and the complete sealed current/previous window presentations with original publication, acceptance and overlay pins. Presentations are comparison evidence, never a creative template; a publication is not an acceptance.',
      });
      await seal(`${directory}/opening.json`, { schemaVersion: 1, generatorId: GENERATOR_ID, runId, trainerId, organizer,
        ...(transitionEvidence?{policyTransition:transitionEvidence}:{}),
        authorizedRevision: revision, productionScope: scope,
        lotId: assignment.lotId, profile: assignment.profile, createdAt: new Date().toISOString(), sources: report.sources,
        fixedContractReferences: clone(report.fixedContractReferences),
        ledgers, currentLotTeams: lotTeams, contextDigest, publicationsDigest, acceptedReferencesDigest, authorEnvelopeDigest });
      return { runId, trainerId, lotId: assignment.lotId, profile: assignment.profile, state: 'AUTHORING',
        directory: path.join(root, directory), authorInputDigest: authorEnvelopeDigest };
    });
  }

  async function checkInput(run, role, input) {
    if (!ROLES.includes(role)) fail('INVALID_ROLE');
    const expected = role === 'author' ? 'AUTHORING' : 'CORRECTING';
    if (run.state !== expected) fail(`INVALID_STATE: ${run.state}, expected ${expected}`);
    const errors = [];
    const error = (code, field, message = code) => errors.push({ code, path: field, message });
    if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, errors: [{ code: 'INPUT_OBJECT_REQUIRED', path: '' }], warnings: [] };
    for (const key of Object.keys(input)) if (!['provenance', 'submission', 'review'].includes(key)) error('UNKNOWN_INPUT_FIELD', key);
    const provenance = input.provenance ?? {};
    for (const key of Object.keys(provenance)) if (!['actorId', 'model', 'executionRef', 'inputDigest', 'effort', 'role', 'contextMode'].includes(key)) error('UNKNOWN_PROVENANCE_FIELD', `provenance.${key}`);
    for (const field of ['actorId', 'model', 'executionRef', 'inputDigest']) if (!nonempty(provenance[field])) error('PROVENANCE_REQUIRED', `provenance.${field}`);
    if (provenance.model !== ACTOR_REQUIREMENT.model) error('REQUIRED_ACTOR_MODEL', 'provenance.model');
    if (provenance.effort !== ACTOR_REQUIREMENT.effort) error('REQUIRED_ACTOR_EFFORT', 'provenance.effort');
    const transitionEvidence=run.opening.payload.policyTransition;
    const expectedContext=transitionEvidence&&role==='author'?'policy-transition':ACTOR_REQUIREMENT.contextMode;
    if (provenance.role !== role || provenance.contextMode !== expectedContext) error('INDEPENDENT_FRESH_CONTEXT_REQUIRED', 'provenance');
    if(transitionEvidence&&role==='author') {
      if(provenance.actorId!==transitionEvidence.actorId||provenance.executionRef!==transitionEvidence.executionRef)error('POLICY_TRANSITION_ORIGINAL_AUTHOR_REQUIRED','provenance');
      if(digest(input.submission)!==transitionEvidence.submissionDigest)error('POLICY_TRANSITION_SUBMISSION_CHANGED','submission');
    }
    if (provenance.actorId === run.opening.payload.organizer || (role === 'corrector' && provenance.actorId === run.records.author?.input.provenance.actorId)) error('ACTOR_NOT_INDEPENDENT', 'provenance.actorId');
    if (role === 'corrector' && provenance.executionRef === run.records.author.input.provenance.executionRef) error('EXECUTION_NOT_INDEPENDENT', 'provenance.executionRef');
    const envelope = await unseal(`${run.directory}/${role}-envelope.json`);
    if (provenance.inputDigest !== envelope.digest) error('INPUT_DIGEST_MISMATCH', 'provenance.inputDigest');
    if (role === 'author' && input.review !== undefined) error('AUTHOR_CANNOT_REVIEW', 'review');
    if (role === 'corrector') {
      const review = input.review ?? {};
      for (const key of Object.keys(review)) if (!['authorDigest', 'variants', 'crossVariantEquivalence', 'factualCheck', 'warningResponses', 'bossIdentityReview'].includes(key)) error('UNKNOWN_REVIEW_FIELD', `review.${key}`);
      for (const branch of BRANCHES) {
        for (const field of ['mainPlan', 'threats', 'changes', 'alternatives', 'tradeoffs', 'order']) {
          if (!nonempty(review.variants?.[branch]?.[field])) error('TACTICAL_REVIEW_REQUIRED', `review.variants.${branch}.${field}`);
        }
      }
      if (!nonempty(review.crossVariantEquivalence)) error('TACTICAL_REVIEW_REQUIRED', 'review.crossVariantEquivalence');
      if (!nonempty(review.factualCheck)) error('FACTUAL_CHECK_REQUIRED', 'review.factualCheck');
      if (review.authorDigest !== run.records.author.payload.inputDigest) error('AUTHOR_DIGEST_MISMATCH', 'review.authorDigest');
      if (!Array.isArray(review.warningResponses)) error('WARNING_RESPONSES_REQUIRED', 'review.warningResponses');
      if (run.context.payload.bossReviewContext) {
        for (const field of ['globalSignatures', 'neighbors', 'pendingComparisons']) {
          if (!nonempty(review.bossIdentityReview?.[field])) error('BOSS_IDENTITY_REVIEW_REQUIRED', `review.bossIdentityReview.${field}`);
        }
      }
    }
    const catalogs = run.catalogs ?? await engine.loadCatalogs(root);
    const before = digest(input.submission ?? null);
    const validation = await engine.validateSubmission(clone(run.context.payload), clone(input.submission ?? null), catalogs);
    if (before !== digest(input.submission ?? null)) fail('ENGINE_MUTATED_INPUT');
    if (typeof validation?.ok !== 'boolean' || !Array.isArray(validation.errors) || !Array.isArray(validation.warnings)) fail('INVALID_ENGINE_VALIDATION');
    if (validation.ok && !validation.normalized?.variants) fail('NORMALIZED_VARIANTS_REQUIRED_FOR_WINDOW_GATE');
    errors.push(...validation.errors);
    if (validation.ok && validation.normalized?.variants) {
      const snapshot=await loadWindowSnapshot(root);
      // Already published runs are revalidated against their original sealed
      // admission context. The snapshot separately proves every later admission.
      // Re-admitting an old I/K against a later A would violate D259.
      if(!snapshot.sources.some(s=>s.trainerId===run.context.payload.trainerId)) {
        const live=windowContext(snapshot,run.context.payload.trainerId,run.context.payload.windowId);
        const window=windowFindings({...live,lotId:run.context.payload.lotId},validation.normalized.variants);
        errors.push(...window.errors);
      }
    }
    if (!validation.ok && !validation.errors.length) error('ENGINE_REJECTED', 'submission');
    if (role === 'corrector') {
      for (const warning of validation.warnings) {
        const id = typeof warning === 'string' ? warning : `${warning.code}:${warning.path ?? ''}`;
        if (!input.review?.warningResponses?.some(response => response?.warning === id && nonempty(response.reason))) error('UNREVIEWED_WARNING', 'review.warningResponses', id);
      }
    }
    return { ok: !errors.length, errors, warnings: validation.warnings,
      evidence: clone(validation.evidence ?? {}) };
  }
  async function preview({ runId, role, input }) { return checkInput(await inspect(runId), role, input); }
  async function submit({ runId, role, input }) {
    return locked(async () => {
      const run = await inspect(runId);
      const frozenInput = clone(input);
      const validation = await checkInput(run, role, frozenInput);
      await inspect(runId);
      const inputDigest = await seal(`${run.directory}/${role}-submission.json`, frozenInput);
      const validationDigest = await seal(`${run.directory}/${role}-validation.json`, validation);
      const recordPayload = { role, previous: run.previous, inputDigest, validationDigest, submittedAt: new Date().toISOString() };
      const recordDigest = digest(recordPayload);
      if (role === 'author' && validation.ok) {
        await seal(`${run.directory}/corrector-envelope.json`, {
          schemaVersion: 1, generatorId: GENERATOR_ID, role: 'corrector', runId, trainerId: run.opening.payload.trainerId,
          contextDigest: run.context.digest, contextFile: 'context.json', authorRecordDigest: recordDigest,
          authorDigest: inputDigest, authorSubmission: frozenInput.submission, authorValidation: validation,
          requiredModel: ACTOR_REQUIREMENT.model, requiredEffort: ACTOR_REQUIREMENT.effort, requiredContext: ACTOR_REQUIREMENT.contextMode,
        });
      }
      await seal(`${run.directory}/${role}-record.json`, recordPayload);
      const state = validation.ok ? (role === 'author' ? 'CORRECTING' : 'TRAINER_REVIEW') : 'REJECTED';
      return { runId, state, validation, submissionDigest: inputDigest };
    });
  }
  async function publish({ runId }) {
    return locked(async () => {
      const run = await inspect(runId);
      if (run.state !== 'TRAINER_REVIEW') fail('TRAINER_REVIEW_REQUIRED');
      await revalidateRecords(run);
      const trainer = await engine.materialize(clone(run.context.payload), clone(run.records.corrector.input.submission), run.catalogs);
      const bundle = publicationBundle(run, trainer);
      const artifact = `${BASE}/published/${runId}.json`;
      if (await exists(artifact)) {
        if ((await unseal(artifact)).digest !== digest(bundle)) fail('IMMUTABLE_PUBLICATION_EXISTS');
      } else {
        await mkdir(`${BASE}/published`);
        await seal(artifact, bundle);
      }
      const entries = await publicationEntries({ verifyIndex: false });
      const index = publicationIndex(entries);
      const indexPath = await checked(`${BASE}/published/index.json`, { missing: true });
      const temporary = `${BASE}/published-index-${process.pid}-${randomUUID()}.tmp`;
      await writeOnce(temporary, index);
      await fs.rename(await checked(temporary), indexPath);
      forgetObservedFile(indexPath);forgetObservedFile(path.join(root,temporary));
      invalidateOperation();
      return { runId, trainerId: bundle.trainerId, lotId: bundle.lotId, state: 'TRAINER_REVIEW', label: LABEL,
        publicationDigest: digest(bundle), artifactPath: path.join(root, artifact), indexPath };
    });
  }
  async function acceptTrainer({ trainerId, publicationDigest, acceptedBy }) {
    if (!safeId(trainerId) || !/^[a-f0-9]{64}$/.test(publicationDigest ?? '') || !nonempty(acceptedBy)) fail('TRAINER_ACCEPTANCE_ARGUMENTS_REQUIRED');
    return locked(async () => {
      const publication = (await publicationEntries()).find(row => row.trainerId === trainerId);
      if (!publication) fail(`TRAINER_PUBLICATION_NOT_FOUND: ${trainerId}`);
      if (scope && !inScope(publication.trainer)) fail('TRAINER_OUTSIDE_PRODUCTION_SCOPE');
      if (publication.sha256 !== publicationDigest) fail('PUBLICATION_DIGEST_MISMATCH');
      const publicationArtifact = await unseal(publication.artifactPath);
      const acceptanceScope = publicationArtifact.payload.productionScope ?? scope;
      const publicationRequirements = publicationArtifact.payload.validations?.corrector?.evidence?.publicationRequirements ?? [];
      if (publicationRequirements.length) {
        fail(`TRAINER_ACCEPTANCE_GATE_BLOCKED: ${publicationRequirements.map(requirement => requirement.code ?? requirement).join(', ')}`);
      }
      const artifactPath = `${BASE}/accepted/trainers/${trainerId}.json`;
      if (await exists(artifactPath)) {
        const existing = await unseal(artifactPath);
        if (existing.payload.publicationDigest !== publicationDigest) fail('IMMUTABLE_TRAINER_ACCEPTANCE_EXISTS');
        return { trainerId, lotId: existing.payload.lotId, state: 'TRAINER_ACCEPTED', acceptanceDigest: existing.digest, artifactPath: path.join(root, artifactPath) };
      }
      const payload = { schemaVersion: 1, generatorId: GENERATOR_ID, status: 'TRAINER_ACCEPTED', trainerId,
        ...(acceptanceScope ? { acceptanceMode: acceptanceScope.acceptanceMode, visualAudit: false,
          authorization: acceptanceScope.authorization, productionScope: acceptanceScope.id } : {}),
        lotId: publication.lotId, publicationPath: publication.artifactPath, publicationDigest, acceptedBy, acceptedAt: new Date().toISOString(),
        lotAccepted: false, romPromotion: false };
      await mkdir(`${BASE}/accepted/trainers`);
      const acceptanceDigest = await seal(artifactPath, payload);
      const entries = await localAcceptanceEntries({ verifyIndex: false });
      const index = acceptanceIndex(entries);
      const indexPath = await checked(`${BASE}/accepted/trainers/index.json`, { missing: true });
      const temporary = `${BASE}/acceptance-index-${process.pid}-${randomUUID()}.tmp`;
      await writeOnce(temporary, index);
      await fs.rename(await checked(temporary), indexPath);
      forgetObservedFile(indexPath);forgetObservedFile(path.join(root,temporary));
      invalidateOperation();
      return { trainerId, lotId: publication.lotId, state: 'TRAINER_ACCEPTED', acceptanceDigest,
        artifactPath: path.join(root, artifactPath), indexPath };
    });
  }
  async function acceptLot({ lotId, acceptanceDigests = [], acceptedBy }) {
    if (!safeId(lotId) || !nonempty(acceptedBy) || !Array.isArray(acceptanceDigests)) fail('LOT_ACCEPTANCE_ARGUMENTS_REQUIRED');
    const report = await roster({ lotId });
    const lot = report.lots[0];
    const actual = lot.inventory.map(row => row.acceptanceDigest).filter(Boolean).sort();
    const supplied = [...acceptanceDigests].sort();
    const errors = [...lot.lotAcceptance.findings];
    const accepted = await acceptedReferences();
    let numericalRecurrence=[];
    if (typeof engine.lotFamilyGlobalFindings === 'function') {
      numericalRecurrence=engine.lotFamilyGlobalFindings(currentLotTeams(accepted, lotId));
      if(referenceVersion)errors.push(...numericalRecurrence);
      else await loadWindowSnapshot(root); // verifies every forward local/window admission
    }
    if (digest(actual) !== digest(supplied)) errors.unshift({ code: 'TRAINER_ACCEPTANCE_DIGEST_SET_MISMATCH', expected: actual, supplied,
      message: 'Los digests explícitos no coinciden exactamente con las aceptaciones individuales del lote.' });
    return { ok: false, status: 'LOT_ACCEPTANCE_BLOCKED', lotId, acceptedBy, errors,numericalRecurrence,
      message: 'El lote no se acepta hasta que existan y se verifiquen todos los gates reales.' };
  }
  async function status({ runId }) {
    const run = await inspect(runId);
    const publication = (await publicationEntries()).find(entry => entry.runId === runId);
    const acceptance = (await acceptedReferences()).find(entry => entry.trainerId === run.opening.payload.trainerId);
    return { runId, trainerId: run.opening.payload.trainerId, lotId: run.opening.payload.lotId, state: run.state,
      published: Boolean(publication), publicationDigest: publication?.sha256 ?? null,
      trainerAccepted: Boolean(acceptance), acceptanceDigest: acceptance?.acceptanceDigest ?? null };
  }
  async function handoff({ runId, role, actorId, executionRef }) {
    if (!ROLES.includes(role)) fail('INVALID_ROLE');
    if (!nonempty(actorId) || !nonempty(executionRef)) fail('PROVENANCE_REQUIRED');
    const run = await inspect(runId);
    if (run.state !== (role === 'author' ? 'AUTHORING' : 'CORRECTING')) fail('HANDOFF_STATE_MISMATCH');
    if (actorId === run.opening.payload.organizer || (role === 'corrector' && actorId === run.records.author.input.provenance.actorId)) fail('ACTOR_NOT_INDEPENDENT');
    if (role === 'corrector' && executionRef === run.records.author.input.provenance.executionRef) fail('EXECUTION_NOT_INDEPENDENT');
    const transitionEvidence=run.opening.payload.policyTransition;
    if(transitionEvidence&&role==='author'&&(actorId!==transitionEvidence.actorId||executionRef!==transitionEvidence.executionRef))fail('POLICY_TRANSITION_ORIGINAL_AUTHOR_REQUIRED');
    const envelope = await unseal(`${run.directory}/${role}-envelope.json`);
    const references = `${BASE}/skills/deksa-trainer-generator/references`;
    const query = await checked(`${BASE}/query.mjs`);
    const workflow = await checked(`${BASE}/workflow.mjs`);
    const outputPath = await checked(`${run.directory}/drafts/${role}.json`, { missing: true });
    const modes = ['summary', 'list', 'resources', 'identity', 'review-context', 'window-recurrence'];
    if (Array.isArray(run.context.payload.gymEvidence) && run.context.payload.gymDistanceConstraints) modes.push('gym-evidence');
    if (run.context.payload.starterPolicy) modes.push('starter-policy');
    const queries = Object.fromEntries(modes.map(mode => [mode, ['node', query, '--run', runId, `--${mode}`]]));
    return { role, runId, trainerId: run.opening.payload.trainerId,
      assignment: `Leé instructions y referencias completas. Trabajá sólo como ${role} de esta tripleta; consultá el contexto sellado, escribí tu borrador y ejecutá preview. No submit ni publish.`,
      instructions: await checked(`${references}/${role}.md`),
      references: await Promise.all(['quality.md', 'commands.md', 'engine-capabilities.md', 'special-cases.md']
        .map(file => checked(`${references}/${file}`))),
      envelope: await checked(`${run.directory}/${role}-envelope.json`), context: await checked(`${run.directory}/context.json`),
      contextDigest: run.context.digest,
      provenance: { actorId, model: ACTOR_REQUIREMENT.model, effort: ACTOR_REQUIREMENT.effort, role,
        contextMode:transitionEvidence&&role==='author'?'policy-transition':ACTOR_REQUIREMENT.contextMode, executionRef, inputDigest: envelope.digest },
      ...(transitionEvidence?{policyTransition:transitionEvidence,priorDraft:await checked(transitionEvidence.priorDraftPath),oldDraftPath:await checked(transitionEvidence.priorDraftPath),
        transitionInstructions:'D259, transición nominal sin reroll: releer contexto nuevo y borrador previo propio; conservar submission exacta. Sólo cambiar provenance/inputDigest/contextMode en el nuevo borrador V31 y ejecutar preview. La autoría original fresh permanece en originalProvenance; esta continuación no se presenta como otro actor fresh.'}:{}),
      ...(role === 'corrector' ? { reviewAuthorDigest: envelope.payload.authorDigest } : {}), outputPath,
      commands: { queries, speciesQueryPrefix: ['node', query, '--run', runId, '--species'],
        preview: ['node', workflow, 'preview', '--project-root', root, '--run', runId, '--role', role, '--input', outputPath] },
      commandFormat: 'Vectores argv. Añadir slugs a speciesQueryPrefix; --level NIVEL y --nature NATURALEZA son opcionales y nature requiere level. Query no acepta --project-root.',
      forbiddenInputs: ['conversation history', 'other runs', 'publications.json', 'accepted-references.json',
        'previous trainer movesets outside sealed currentLotTeams/windowRecurrence.presentations', 'seed fauna'],
      limits: ['Sólo escribir el borrador propio.', 'No delegar ni reemplazar actores.', 'El organizador contrasta procedencia real.'] };
  }

  const cached=(name,fn)=>(...args)=>memo(`${root}:${BASE}:${name}:${digest(args)}`,()=>fn(...args));
  const sourceDigests=cached('sources',sourceDigestsUncached);
  const verifyAuditedReferences=cached('audited',verifyAuditedReferencesUncached);
  const verifyExternalReviewReferences=cached('externalReviews',verifyExternalReviewReferencesUncached);
  const acceptedExternalReferences=cached('acceptedExternal',acceptedExternalReferencesUncached);
  const inspect=cached('inspect',inspectUncached);
  const publicationEntries=cached('publications',publicationEntriesUncached);
  const localAcceptanceEntries=cached('localAcceptances',localAcceptanceEntriesUncached);
  const acceptedReferences=cached('accepted',acceptedReferencesUncached);
  const acceptedEntriesFromDescriptors=cached('descriptors',acceptedEntriesFromDescriptorsUncached);
  const runEntries=cached('runs',runEntriesUncached);
  let predecessorWorkflow;
  const predecessorEvidence=cached('predecessor',async()=>{
    predecessorWorkflow??=await createWorkflow({projectRoot:root,referenceVersion:'v30'});
    return predecessorWorkflow.verifiedEvidence();
  });
  const verifiedEvidence=async()=>{
    if(!referenceVersion)await acceptedExternalReferences();
    return {publications:await publicationEntries(),accepted:await localAcceptanceEntries(),runs:await runEntries()};
  };
  const api=referenceVersion?{verifiedEvidence}:{preflight,start,handoff,preview,submit,publish,acceptTrainer,acceptLot,roster,status,transition,verifiedEvidence};
  return Object.fromEntries(Object.entries(api).map(([name,fn])=>[name,(...args)=>operation(()=>fn(...args),{onMetrics})]));
}

export async function main(args = process.argv.slice(2)) {
  const command = args.shift();
  const options = {};
  const flags = new Set(['--project-root', '--trainer', '--lot', '--run', '--organizer', '--role', '--input', '--actor', '--execution-ref',
    '--publication-digest', '--accepted-by', '--acceptance-digests', '--production-scope']);
  while (args.length) {
    const key = args.shift();
    if (!flags.has(key) || !args.length || args[0].startsWith('--') || options[key]) fail(`INVALID_ARGUMENT: ${key}`);
    options[key] = args.shift();
  }
  const allowed = {
    transition: {required:['--trainer'],optional:[]},
    preflight: { required: [], optional: ['--trainer', '--lot'] },
    start: { required: ['--trainer', '--run', '--organizer'], optional: [] },
    handoff: { required: ['--run', '--role', '--actor', '--execution-ref'], optional: [] },
    preview: { required: ['--run', '--role', '--input'], optional: [] },
    submit: { required: ['--run', '--role', '--input'], optional: [] },
    publish: { required: ['--run'], optional: [] },
    'accept-trainer': { required: ['--trainer', '--publication-digest', '--accepted-by'], optional: [] },
    'accept-lot': { required: ['--lot', '--acceptance-digests', '--accepted-by'], optional: [] },
    roster: { required: [], optional: ['--lot'] },
    status: { required: ['--run'], optional: [] },
  };
  if (!allowed[command]) fail('COMMAND_REQUIRED: preflight | start | handoff | preview | submit | publish | accept-trainer | accept-lot | roster | status');
  const permitted = new Set([...allowed[command].required, ...allowed[command].optional, '--project-root', '--production-scope']);
  for (const key of Object.keys(options)) if (!permitted.has(key)) fail(`ARGUMENT_NOT_ALLOWED: ${key}`);
  for (const key of allowed[command].required) if (!options[key]) fail(`ARGUMENT_REQUIRED: ${key}`);
  if (command === 'preflight' && Boolean(options['--trainer']) === Boolean(options['--lot'])) fail('PREFLIGHT_REQUIRES_EXACTLY_ONE_OF_TRAINER_OR_LOT');
  const workflow = await createWorkflow({ projectRoot: options['--project-root'], productionScope: options['--production-scope'] ?? null });
  let input;
  if (options['--input']) {
    const file = path.resolve(options['--input']);
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) fail('INPUT_REGULAR_FILE_REQUIRED');
    input = JSON.parse(await fs.readFile(file, 'utf8'));
  }
  const method = { 'accept-trainer': 'acceptTrainer', 'accept-lot': 'acceptLot' }[command] ?? command;
  const result = await workflow[method]({ trainerId: options['--trainer'], lotId: options['--lot'], runId: options['--run'],
    organizer: options['--organizer'], role: options['--role'], actorId: options['--actor'], executionRef: options['--execution-ref'], input,
    publicationDigest: options['--publication-digest'], acceptedBy: options['--accepted-by'],
    acceptanceDigests: options['--acceptance-digests']?.split(',').filter(Boolean) });
  process.stdout.write(serial(result));
  if (result.ok === false || result.state === 'REJECTED') process.exitCode = 1;
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
