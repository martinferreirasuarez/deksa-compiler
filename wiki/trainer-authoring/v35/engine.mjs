import fs from 'node:fs/promises';
import {deriveEngine as derivePreviousEngine,FROZEN_ENGINE} from '../v34/engine.mjs';
export {FROZEN_ENGINE};
export const FROZEN_PREVIOUS_ENGINE='815b341fec43a8cf469ffeb43e0c4c1153f17e56ea2127d583648a8ae6d28b05';
export function deriveEngine(source){
  let result=derivePreviousEngine(source).replaceAll('wiki/trainer-authoring/v34','wiki/trainer-authoring/v35').replaceAll('DEKSA-TRAINER-GENERATOR-V34','DEKSA-TRAINER-GENERATOR-V35');
  const once=(from,to)=>{if(result.split(from).length!==2)throw new Error('NOTE_ENGINE_ANCHOR_CHANGED');result=result.replace(from,to);};
  once('if (member.intent !== undefined && (!Array.isArray(member.intent) || member.intent.length === 0\n        || !member.intent.every((entry) => typeof entry === "string" && entry.trim().length > 0)))','if (member.intent !== undefined && !(typeof member.intent === "string" ? member.intent.trim().length > 0 : Array.isArray(member.intent) && member.intent.length > 0 && member.intent.every(entry => typeof entry === "string" && entry.trim().length > 0)))');
  once('intent:structuredClone(member.intent)','intent:typeof member.intent==="string"?[member.intent]:structuredClone(member.intent)');
  return result;
}
const runtime=await import(`data:text/javascript;base64,${Buffer.from(deriveEngine(await fs.readFile(new URL('../v33/engine.mjs',import.meta.url),'utf8'))).toString('base64')}`);
export const {ENGINE_ID,POLICY_ID,BASELINE_PUBLICATION,effortValuesForEncounter,effectiveStats,loadCatalogs,buildProfileContract,isLegalLevelVector,factualAnchorWindowException,isLegalAceFloor,classifyDamage,lotFamilyUsage,lotFamilyRecurrenceFindings,lotFamilyGlobalFindings,withGymEvidence,withSpecialistEvidence,gymDistanceFindings,contextReadiness,buildContext,diagnosticsForMembers,validateSubmission,materialize}=runtime;
