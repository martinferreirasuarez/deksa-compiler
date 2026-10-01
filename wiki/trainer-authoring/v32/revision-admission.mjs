// The allowance is derived from a verified current presentation, never supplied
// in an actor's proposal. Only exact letter/family/role membership is retained.
export function retainedOwner(evidence,trainerId,lotId,letter,family,role) {
  return evidence?.scope==='VERIFIED_QUALITY_REVISION'&&evidence.trainerId===trainerId&&evidence.lotId===lotId
    &&evidence.retainedOwners?.[letter]?.some(m=>m.family===family&&m.role===role)===true;
}
