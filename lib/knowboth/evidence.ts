import {
 analyzeInputSchema,
 reportSchema,
 type AnalyzeInput,
 type Claim,
 type Report,
 type RevenueObservation,
} from './schema';

export function normalizeWhitespace(value:string){
 return value.replace(/\s+/gu,' ').trim();
}

export function isGroundedQuote(quote:string|null|undefined,source:string){
 const normalizedQuote=normalizeWhitespace(quote??'');
 return normalizedQuote.length>0&&normalizeWhitespace(source).includes(normalizedQuote);
}

function uniqueKnown(ids:string[],known:Set<string>){
 return [...new Set(ids.filter(id=>known.has(id)))];
}

function sameObservation(left:RevenueObservation,right:RevenueObservation){
 return left.entityName===right.entityName
  &&left.amountDecimal===right.amountDecimal
  &&left.currency===right.currency
  &&left.periodStart===right.periodStart
  &&left.periodEnd===right.periodEnd
  &&left.periodType===right.periodType
  &&left.accountingScope===right.accountingScope
  &&left.accountLabel===right.accountLabel
  &&left.disclosureId===right.disclosureId
  &&left.sourceIds.length===right.sourceIds.length
  &&left.sourceIds.every((id,index)=>id===right.sourceIds[index]);
}

export function validateReportEvidence(candidate:unknown,rawInput:AnalyzeInput):Report{
 const input=analyzeInputSchema.parse(rawInput);
 const parsed=reportSchema.parse(candidate&&typeof candidate==='object'?{...candidate,job:input.job}:candidate);
 const warningSet=new Set(parsed.warnings);
 const warn=(message:string)=>warningSet.add(message);
 const knownSources=new Set(parsed.sources.map(source=>source.id));

 const sanitizeClaim=(claim:Claim):Claim=>{
  const sourceIds=uniqueKnown(claim.sourceIds,knownSources);
  if(sourceIds.length!==claim.sourceIds.length)warn(`주장 ${claim.id}의 확인할 수 없는 출처 참조를 제거했습니다.`);
  if(claim.kind!=='unknown'&&sourceIds.length===0){
   warn(`주장 ${claim.id}을 확인 필요로 낮췄습니다.`);
   return {...claim,kind:'unknown',sourceIds:[],rationale:claim.rationale??'연결된 출처를 확인하지 못했습니다.'};
  }
  return {...claim,sourceIds};
 };

 const requirements=parsed.requirements.filter(requirement=>{
  const grounded=isGroundedQuote(requirement.jobQuote,input.job.rawText);
  if(!grounded)warn(`요구 ${requirement.id}은 공고 원문과 일치하지 않아 제외했습니다.`);
  return grounded;
 });
 const requirementById=new Map(requirements.map(requirement=>[requirement.id,requirement]));

 const companyClaims=parsed.companyClaims.map(sanitizeClaim);
 const roleClaims=parsed.roleClaims.map(sanitizeClaim);
 const businessChanges=parsed.businessChanges.map(change=>({...change,claim:sanitizeClaim(change.claim)}));
 const claimIds=new Set([...companyClaims,...roleClaims,...businessChanges.map(change=>change.claim)].map(claim=>claim.id));

 let companyIdentity:Report['companyIdentity']={
  ...parsed.companyIdentity,
  evidenceSourceIds:uniqueKnown(parsed.companyIdentity.evidenceSourceIds,knownSources),
  candidates:parsed.companyIdentity.candidates.map(candidate=>({
   ...candidate,
   evidenceSourceIds:uniqueKnown(candidate.evidenceSourceIds,knownSources),
  })),
 };
 if(companyIdentity.status==='matched'&&companyIdentity.evidenceSourceIds.length===0){
  warn('회사 식별 근거를 확인하지 못해 법인 연결을 보류했습니다.');
  companyIdentity={...companyIdentity,status:'unresolved'};
 }

 const observations=parsed.revenue.observations.flatMap(observation=>{
  const sourceIds=uniqueKnown(observation.sourceIds,knownSources);
  if(sourceIds.length===0){
   warn(`${observation.entityName} 매출 원자료는 출처를 확인하지 못해 제외했습니다.`);
   return [];
  }
  return [{...observation,sourceIds}];
 });
 let revenue={...parsed.revenue,observations};
 if(companyIdentity.status!=='matched'&&revenue.status!=='skipped'){
  revenue={...revenue,status:'identity_unresolved' as const,selected:null,reason:'고용 법인을 확정하지 못해 매출 수치를 표시하지 않습니다.'};
 }else if(revenue.selected){
  const selectedSourceIds=uniqueKnown(revenue.selected.sourceIds,knownSources);
  const selected={...revenue.selected,sourceIds:selectedSourceIds};
  const found=selectedSourceIds.length>0&&observations.some(observation=>sameObservation(observation,selected));
  if(!found){
   warn('선택한 매출 수치가 검증된 원자료와 일치하지 않아 대표값을 해제했습니다.');
   revenue={...revenue,status:'conflicting' as const,selected:null,reason:'선택한 수치와 검증된 원자료가 일치하지 않습니다.'};
  }else revenue={...revenue,selected};
 }

 const hiringHypotheses=parsed.hiringHypotheses.flatMap(hypothesis=>{
  const evidenceSourceIds=uniqueKnown(hypothesis.evidenceSourceIds,knownSources);
  const requirementIds=uniqueKnown(hypothesis.requirementIds,new Set(requirementById.keys()));
  if(evidenceSourceIds.length===0||requirementIds.length===0){
   warn(`채용 배경 ${hypothesis.id}은 근거 연결을 확인하지 못해 제외했습니다.`);
   return [];
  }
  const kind=hypothesis.kind==='stated'&&!isGroundedQuote(hypothesis.claim,input.job.rawText)
   ? 'inference' as const
   : hypothesis.kind;
  if(kind!==hypothesis.kind)warn(`채용 배경 ${hypothesis.id}은 공고의 직접 표현이 아니어서 해석으로 표시했습니다.`);
  return [{...hypothesis,kind,evidenceSourceIds,requirementIds}];
 });

 const profile=input.profile;
 const profileEvidence=profile
  ? [profile.experienceText,...profile.additionalAnswers.map(item=>item.answer)].join('\n')
  : '';
 const downgradeFit=(reason:string)=>({status:'unknown' as const,profileQuote:null,reason,followUpQuestion:'관련 경험을 구체적으로 확인해 주세요.'});
 const fitItems=profile?parsed.fitItems?.flatMap(item=>{
  const requirement=requirementById.get(item.requirementId);
  if(!requirement||requirement.category==='condition')return [];
  if(item.status==='unknown')return [{...item,profileQuote:null}];
  if(!isGroundedQuote(item.profileQuote,profileEvidence)){
   warn(`역량 대조 ${item.requirementId}의 경험 인용을 확인하지 못해 추가 확인으로 바꿨습니다.`);
   return [{...item,...downgradeFit('경험 원문에서 해당 근거를 확인하지 못했습니다.')}];
  }
  return [item];
 })??[]:null;

 const conditionChecks=profile?parsed.conditionChecks?.flatMap(item=>{
  const requirement=requirementById.get(item.requirementId);
  if(!requirement||requirement.category!=='condition')return [];
  if(item.status==='unknown')return [{...item,profileQuote:null}];
  if(!isGroundedQuote(item.profileQuote,profileEvidence)){
   warn(`지원 조건 ${item.requirementId}의 경험 인용을 확인하지 못해 추가 확인으로 바꿨습니다.`);
   return [{...item,status:'unknown' as const,profileQuote:null,reason:'경험 원문에서 조건 충족 여부를 확인하지 못했습니다.'}];
  }
  return [item];
 })??[]:null;

 const preferenceQuestions=profile?parsed.preferenceQuestions
  .filter(item=>isGroundedQuote(item.preferenceQuote,[profile.desiredWork,profile.constraints].filter(Boolean).join('\n')))
  .map(item=>({...item,relatedClaimIds:uniqueKnown(item.relatedClaimIds,claimIds)})):[];

 const actions=parsed.actions.flatMap(action=>{
  if(!profile&&action.kind==='highlight')return [];
  const requirementIds=uniqueKnown(action.requirementIds,new Set(requirementById.keys()));
  const relatedClaimIds=uniqueKnown(action.claimIds,claimIds);
  const profileQuote=profile&&isGroundedQuote(action.profileQuote,profileEvidence)?action.profileQuote:null;
  return [{...action,requirementIds,claimIds:relatedClaimIds,profileQuote}];
 });

 return reportSchema.parse({
  ...parsed,
  job:input.job,
  companyIdentity,
  companyClaims,
  businessChanges,
  roleClaims,
  revenue,
  requirements,
  hiringHypotheses,
  fitItems,
  conditionChecks,
  preferenceQuestions,
  actions,
  warnings:[...warningSet].slice(0,50),
 });
}
