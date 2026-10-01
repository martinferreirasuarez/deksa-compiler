import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
export const FROZEN_ENGINE='8f935e8b33f2b3af4663e6dc8e16ee3b33cdb6a5c5f47a6ec8c15991bb61490a';
export function deriveEngine(source) {
  if(createHash('sha256').update(source).digest('hex')!==FROZEN_ENGINE)throw new Error('SIMPLE_FROZEN_ENGINE_CHANGED');
  let result=source;
  const once=(from,to)=>{if(result.split(from).length!==2)throw new Error(`SIMPLE_ENGINE_ANCHOR_CHANGED: ${from.slice(0,60)}`);result=result.replace(from,to);};
  const originalURL=new URL('../v33/engine.mjs',import.meta.url);
  result=result.replace(/from (['"])(\.\.?\/[^'"]+)\1/g,(_,q,s)=>`from ${q}${new URL(s,originalURL).href}${q}`);
  result=result.replaceAll(new URL('../v33/window-recurrence.mjs',import.meta.url).href,new URL('./window-recurrence.mjs',import.meta.url).href);
  result=`import {EXCEPTION_MEMORY_POLICY} from '${new URL('./exception-memory.mjs',import.meta.url).href}';\n`+result;
  once('function assertCatalogShape(values) {','function assertCatalogShape(values) {\n  invariant(digest(values.policy.identityExceptionMemory)===digest(EXCEPTION_MEMORY_POLICY),"EXCEPTION_MEMORY_POLICY_MISMATCH");');
  result=result.replaceAll('DEKSA-TRAINER-GENERATOR-V33','DEKSA-TRAINER-GENERATOR-V34').replaceAll('wiki/trainer-authoring/v33/policy.json','wiki/trainer-authoring/v34/policy.json');
  once('values.policy.review?.factualCheck?.required === true\n    && values.policy.review?.factualCheck?.type === "NONEMPTY_STRING"','values.policy.review?.authorDigestRequired === true\n    && values.policy.review?.routineProseRequired === false');
  result=result.replaceAll('["members", "strategy", "orderRationale",...(Object.hasOwn(variant??{},\'identityQuotaException\')?[\'identityQuotaException\']:[])]','["members",...(["strategy","orderRationale","identityQuotaException"].filter(key=>Object.hasOwn(variant??{},key)))]');
  once('if (!exactKeys(member, memberKeys))','if (!exactKeys(member, memberKeys.filter(key=>key!=="intent"||Object.hasOwn(member??{},key))))');
  once('if (!exactKeys(set, setKeys))','if (!exactKeys(set, setKeys.filter(key=>key!=="intent"||Object.hasOwn(set??{},key))))');
  once('if (typeof variant.strategy !== "string" || variant.strategy.trim().length === 0)','if (variant.strategy !== undefined && (typeof variant.strategy !== "string" || variant.strategy.trim().length === 0))');
  once('if (typeof variant.orderRationale !== "string" || variant.orderRationale.trim().length === 0)','if (variant.orderRationale !== undefined && (typeof variant.orderRationale !== "string" || variant.orderRationale.trim().length === 0))');
  once('if (!Array.isArray(member.intent) || member.intent.length === 0\n        || !member.intent.every((entry) => typeof entry === "string" && entry.trim().length > 0))','if (member.intent !== undefined && (!Array.isArray(member.intent) || member.intent.length === 0\n        || !member.intent.every((entry) => typeof entry === "string" && entry.trim().length > 0)))');
  once('intent: structuredClone(member.intent),','...(member.intent===undefined?{}:{intent:structuredClone(member.intent)}),');
  result=result.replaceAll('strategy: variant.strategy,','...(variant.strategy===undefined?{}:{strategy:variant.strategy}),').replaceAll('orderRationale: variant.orderRationale,','...(variant.orderRationale===undefined?{}:{orderRationale:variant.orderRationale}),');
  once('strategy: template.strategy, orderRationale: template.orderRationale,','...(template.strategy===undefined?{}:{strategy:template.strategy}), ...(template.orderRationale===undefined?{}:{orderRationale:template.orderRationale}),');
  once('strategy: validation.normalized.variants[branch].strategy,\n    orderRationale: validation.normalized.variants[branch].orderRationale,','...Object.fromEntries(["strategy","orderRationale"].filter(key=>validation.normalized.variants[branch][key]!==undefined).map(key=>[key,validation.normalized.variants[branch][key]])),');
  return result;
}
const runtime=await import(`data:text/javascript;base64,${Buffer.from(deriveEngine(await fs.readFile(new URL('../v33/engine.mjs',import.meta.url),'utf8'))).toString('base64')}`);
export const {ENGINE_ID,POLICY_ID,BASELINE_PUBLICATION,effortValuesForEncounter,effectiveStats,loadCatalogs,buildProfileContract,isLegalLevelVector,factualAnchorWindowException,isLegalAceFloor,classifyDamage,lotFamilyUsage,lotFamilyRecurrenceFindings,lotFamilyGlobalFindings,withGymEvidence,withSpecialistEvidence,gymDistanceFindings,contextReadiness,buildContext,diagnosticsForMembers,validateSubmission,materialize}=runtime;
