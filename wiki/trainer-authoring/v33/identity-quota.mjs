export const IDENTITY_QUOTA_POLICY = Object.freeze({decisionId:'D-261',eligibleRole:'I',scopes:['D-258','D-260'],alternativesFirst:true,minimumNecessary:true,editorialReviewRequired:true});
const nonempty=value=>typeof value==='string'&&value.trim().length>0;
export function identityQuotaCertificate(variant,branch) {
  const certificate=variant?.identityQuotaException;
  if(certificate===undefined)return {families:[],errors:[]};
  const error=message=>({code:'IDENTITY_QUOTA_CERTIFICATE_INVALID',path:`variants.${branch}.identityQuotaException`,message});
  if(!certificate||typeof certificate!=='object'||Array.isArray(certificate)
    ||Object.keys(certificate).sort().join(',')!=='alternatives,families,reason'
    ||!Array.isArray(certificate.families)||!certificate.families.length
    ||certificate.families.some(f=>!nonempty(f)||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(f))
    ||new Set(certificate.families).size!==certificate.families.length
    ||!nonempty(certificate.reason)||!nonempty(certificate.alternatives))return {families:[],errors:[error('D261 requiere familias únicas, motivo y alternativas con cupo evaluadas.')]};
  const members=Array.isArray(variant)?variant:variant.members??[];
  const invalid=certificate.families.filter(f=>!members.some(m=>m.family===f&&(m.akiRole??m.role)==='I')
    ||members.some(m=>m.family===f&&(m.akiRole??m.role)!=='I'));
  return {families:invalid.length?[]:certificate.families,errors:invalid.length?[error(`Sólo familias presentes como I: ${invalid.join(', ')}.`)]:[]};
}
export function applyIdentityQuotaException(variant,branch,findings,{requireExcess=true}={}) {
  const checked=identityQuotaCertificate(variant,branch),errors=[...checked.errors],warnings=[];
  const eligible=e=>['LOT_FAMILY_TRAINER_LIMIT','WINDOW_FAMILY_QUOTA_EXCEEDED'].includes(e.code);
  for(const family of checked.families) {
    const actual=findings.filter(e=>e.family===family&&eligible(e));
    if(!actual.length&&requireExcess)errors.push({code:'IDENTITY_QUOTA_EXCEPTION_NOT_NEEDED',path:`variants.${branch}.identityQuotaException`,family,message:'La familia declarada no excede cupo local ni de ventana.'});
    for(const finding of actual)warnings.push({...finding,code:'IDENTITY_QUOTA_EXCEPTION_ADMITTED',decisionId:'D-261',originalCode:finding.code,
      path:`variants.${branch}.identityQuotaException.${family}.${finding.code}`,message:`Excepción I documentada para ${family}; requiere juicio independiente sobre identidad, alternativas con cupo y mínimo necesario.`});
  }
  errors.push(...findings.filter(e=>!eligible(e)||!checked.families.includes(e.family)));
  return {errors,warnings};
}
