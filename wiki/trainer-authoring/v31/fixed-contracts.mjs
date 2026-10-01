import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const FILES = Object.freeze({
  decisions: 'DECISIONS.md',
  parties: 'pokefirered/src/data/trainer_parties.h',
  trainers: 'pokefirered/src/data/trainers.h',
  rewards: 'pokefirered/src/deksa_r4_trainers.c',
  lab: 'pokefirered/data/maps/PalletTown_ProfessorOaksLab/scripts.inc',
  recovery: 'pokefirered/src/script_pokemon_util.c',
});

const BRANCHES = Object.freeze([
  Object.freeze({ playerStarterValue: 0, rivalSpecies: 'charmander', partySymbol: 'sParty_RivalOaksLabCharmander', trainerConstant: 'TRAINER_RIVAL_OAKS_LAB_CHARMANDER' }),
  Object.freeze({ playerStarterValue: 1, rivalSpecies: 'bulbasaur', partySymbol: 'sParty_RivalOaksLabBulbasaur', trainerConstant: 'TRAINER_RIVAL_OAKS_LAB_BULBASAUR' }),
  Object.freeze({ playerStarterValue: 2, rivalSpecies: 'squirtle', partySymbol: 'sParty_RivalOaksLabSquirtle', trainerConstant: 'TRAINER_RIVAL_OAKS_LAB_SQUIRTLE' }),
]);

const AI = 'AI_SCRIPT_CHECK_BAD_MOVE | AI_SCRIPT_TRY_TO_FAINT | AI_SCRIPT_CHECK_VIABILITY | AI_SCRIPT_HP_AWARE';
const digest = value => createHash('sha256').update(value).digest('hex');
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const requireContract = (condition, code) => { if (!condition) throw new Error(`FIXED_CONTRACT_DRIFT: rival-oak/${code}`); };

function section(text, heading, nextHeading) {
  const start = text.indexOf(heading);
  const end = text.indexOf(nextHeading, start + heading.length);
  requireContract(start >= 0 && end > start, `DECISION_SECTION_${heading.slice(3, 8)}`);
  return text.slice(start, end);
}

function cBlock(text, start, end) {
  const first = text.indexOf(start);
  const last = text.indexOf(end, first + start.length);
  requireContract(first >= 0 && last > first, `SOURCE_BLOCK_${start}`);
  return text.slice(first, last);
}

export async function verifyFixedContractReferences({ projectRoot }) {
  const root = path.resolve(projectRoot);
  const contents = {};
  for (const [key, relative] of Object.entries(FILES)) {
    let value;
    try { value = await fs.readFile(path.join(root, relative), 'utf8'); }
    catch (error) { throw new Error(`FIXED_CONTRACT_SOURCE_REQUIRED: rival-oak/${relative}`, { cause: error }); }
    contents[key] = value;
  }

  const d255 = section(contents.decisions, '## D-255', '## D-254').replace(/\s+/g, ' ');
  const d254 = section(contents.decisions, '## D-254', '## D-253').replace(/\s+/g, ' ');
  const d257 = section(contents.decisions, '## D-257', '## D-256').replace(/\s+/g, ' ');
  requireContract(d255.includes('party especial R8') && d255.includes('starter Kanto nivel14, IV25, IA0x107, premio0')
    && d255.includes('tres ramas de ventaja de tipo') && d255.includes('No autorar Oak como party6'), 'D255_CONTRACT');
  requireContract(d254.includes('Dékslock exceptúa totalmente el primer rival de Oak')
    && d254.includes('recuperación gratuita') && d254.includes('Oak es la única excepción'), 'D254_EXCEPTION');
  requireContract(d257.includes('Oak conserva contrato R10') && d257.includes('deuda del preflight creativo de Oak'), 'D257_PRESERVATION');

  for (const branch of BRANCHES) {
    const partyPattern = new RegExp(`static const struct TrainerMonNoItemDefaultMoves ${escape(branch.partySymbol)}\\[\\] = \\{\\s*\\{\\s*\\.iv = 206,\\s*\\.lvl = 14,\\s*\\.species = SPECIES_${branch.rivalSpecies.toUpperCase()},\\s*\\},\\s*\\};`);
    requireContract(partyPattern.test(contents.parties), `${branch.trainerConstant}_PARTY`);
    const trainer = cBlock(contents.trainers, `[${branch.trainerConstant}] = {`, '\n    [');
    requireContract(trainer.includes('.items = {},') && trainer.includes('.doubleBattle = FALSE,')
      && trainer.includes(`.aiFlags = ${AI},`)
      && trainer.includes(`.party = NO_ITEM_DEFAULT_MOVES(${branch.partySymbol}),`), `${branch.trainerConstant}_BINDING`);
    const suffix = branch.rivalSpecies[0].toUpperCase() + branch.rivalSpecies.slice(1);
    requireContract(contents.lab.includes(`goto_if_eq VAR_STARTER_MON, ${branch.playerStarterValue}, PalletTown_ProfessorOaksLab_EventScript_RivalApproachForBattle${suffix}`)
      && contents.lab.includes(`trainerbattle_earlyrival ${branch.trainerConstant}, RIVAL_BATTLE_CONTINUE_AFTER_LOSS,`), `${branch.trainerConstant}_SCRIPT_BRANCH`);
  }

  const reward = cBlock(contents.rewards, 'bool8 DeksaR4_GetTrainerReward(u16 trainerId, u32 *reward)', '\nu32 DeksaR4_AdjustTrainerPersonality');
  requireContract(BRANCHES.every(branch => reward.includes(branch.trainerConstant))
    && reward.includes('*reward = 0;') && reward.includes('return TRUE;'), 'REWARD_ZERO');
  const lost = cBlock(contents.lab, 'PalletTown_ProfessorOaksLab_EventScript_LostRivalBattle::', '\nPalletTown_ProfessorOaksLab_EventScript_RivalExitAfterBattleLeft::');
  requireContract(lost.includes('special DeksaTryOakRivalLossRevive')
    && lost.includes('setrespawn HEAL_LOCATION_VIRIDIAN_CITY') && lost.includes('goto EventScript_FieldWhiteOutFade'), 'LOSS_FLOW');
  const recovery = cBlock(contents.recovery, 'u16 DeksaTryOakRivalLossRevive(void)', '\nu8 ScriptGiveMon');
  requireContract(recovery.includes('Deksa_GetDifficulty() != DEKSA_DIFFICULTY_DEKSLOCK')
    && recovery.includes('return FALSE;') && recovery.includes('HealMonFully(&gPlayerParty[i]);')
    && recovery.includes('return TRUE;'), 'DEKSLOCK_EXCEPTION');

  const sourceDigests = Object.fromEntries(Object.entries(FILES).map(([key, relative]) => [relative, digest(contents[key])]));
  const contract = {
    decisionIds: ['D-254', 'D-255', 'D-257'], partySize: 1, level: 14, effectiveIv: 25,
    rawIv: 206, aiFlags: ['CHECK_BAD_MOVE', 'TRY_TO_FAINT', 'CHECK_VIABILITY', 'HP_AWARE'],
    reward: 0, heldItems: 0, physicalBranches: BRANCHES.map(branch => ({ ...branch })),
    lossFlow: 'CONTINUE_TO_VIRIDIAN_CENTER', dekslockRecovery: 'FREE_OAK_ONLY',
  };
  return [Object.freeze({
    kind: 'FIXED_CONTRACT_VERIFIED', trainerId: 'rival-oak', lotId: '01A',
    contractId: 'D254-D255-D257-OAK-R10', contractDigest: digest(JSON.stringify({ contract, sourceDigests })),
    contract: Object.freeze(contract), sourceDigests: Object.freeze(sourceDigests),
    creativeInput: false, trainerAcceptance: false, lotAcceptance: false,
  })];
}
