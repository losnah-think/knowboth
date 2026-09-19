import {z} from 'zod';

const idSchema=z.string().trim().min(1).max(120);
const nullableText=(max:number)=>z.string().trim().min(1).max(max).nullable();
const isoDateSchema=z.string().regex(/^\d{4}-\d{2}-\d{2}$/,'YYYY-MM-DD 형식이어야 합니다.');
const isoDateTimeSchema=z.string().datetime({offset:true});

export const httpUrlSchema=z.string().url().refine(value=>{
 try{const url=new URL(value);return (url.protocol==='http:'||url.protocol==='https:')&&!url.username&&!url.password;}
 catch{return false;}
},'HTTP(S) URL이어야 합니다.');

export function isWantedJobUrl(value:string){
 try{
  const url=new URL(value);
  return url.protocol==='https:'&&url.hostname==='www.wanted.co.kr'&&!url.username&&!url.password&&/^\/wd\/[1-9]\d*\/?$/.test(url.pathname);
 }catch{return false;}
}

export const jobInputSchema=z.object({
 id:idSchema,
 sourceUrl:httpUrlSchema.refine(isWantedJobUrl,'원티드 채용공고 URL이어야 합니다.').nullable(),
 inputMethod:z.literal('ai_research'),
 companyDisplayName:z.string().trim().min(1).max(200),
 positionTitle:z.string().trim().min(1).max(200),
 rawText:z.string().trim().min(20).max(20_000),
 collectedAt:isoDateTimeSchema,
 userEdited:z.boolean(),
}).strict();

export const profileInputSchema=z.object({
 experienceText:z.string().trim().min(1).max(20_000),
 desiredWork:nullableText(2_000).default(null),
 constraints:nullableText(2_000).default(null),
 additionalAnswers:z.array(z.object({
  question:z.string().trim().min(1).max(500),
  answer:z.string().trim().min(1).max(2_000),
 }).strict()).max(20).default([]),
}).strict();

export const companyHintSchema=z.object({
 legalName:z.string().trim().min(1).max(200),
 website:httpUrlSchema.nullable(),
}).strict();

export const analyzeInputSchema=z.object({
 job:jobInputSchema,
 profile:profileInputSchema.nullable(),
 companyHint:companyHintSchema.nullable(),
 companyResolution:z.enum(['auto','selected','skip_financials']).default('auto'),
}).strict().superRefine((value,ctx)=>{
 if(value.companyResolution==='selected'&&!value.companyHint){
  ctx.addIssue({code:z.ZodIssueCode.custom,path:['companyHint'],message:'선택한 회사 정보가 필요합니다.'});
 }
 if(new TextEncoder().encode(JSON.stringify(value)).byteLength>160*1024){
  ctx.addIssue({code:z.ZodIssueCode.custom,message:'입력은 UTF-8 기준 160KB 이하여야 합니다.'});
 }
});

export const sourceSchema=z.object({
 id:idSchema,
 kind:z.enum(['job','official','filing','news','user']),
 url:httpUrlSchema.nullable(),
 title:z.string().trim().min(1).max(500),
 publisher:nullableText(200),
 publishedAt:isoDateSchema.nullable(),
 retrievedAt:isoDateTimeSchema,
 evidenceMode:z.enum(['raw_text','provider_citation','user_provided']),
 excerpt:nullableText(4_000),
}).strict();

export const companyCandidateSchema=z.object({
 displayName:z.string().trim().min(1).max(200),
 legalName:nullableText(200),
 website:httpUrlSchema.nullable(),
 evidenceSourceIds:z.array(idSchema).max(20),
}).strict();

export const companyIdentitySchema=z.object({
 displayName:z.string().trim().min(1).max(200),
 legalName:nullableText(200),
 website:httpUrlSchema.nullable(),
 corpCode:nullableText(40),
 status:z.enum(['matched','ambiguous','unresolved']),
 evidenceSourceIds:z.array(idSchema).max(20),
 candidates:z.array(companyCandidateSchema).max(10),
}).strict();

export const claimSchema=z.object({
 id:idSchema,
 topic:z.enum(['customer','problem','product','revenue_model','role_contribution','work','output','collaboration','success_metric','other']),
 text:z.string().trim().min(1).max(2_000),
 kind:z.enum(['sourced','inference','unknown']),
 sourceIds:z.array(idSchema).max(20),
 rationale:nullableText(2_000),
 conflict:z.boolean(),
}).strict();

export const businessChangeSchema=z.object({
 claim:claimSchema,
 eventDate:isoDateSchema.nullable(),
 publishedAt:isoDateSchema.nullable(),
}).strict();

export const revenueObservationSchema=z.object({
 entityName:z.string().trim().min(1).max(200),
 amountDecimal:z.string().regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/,'정규화된 십진 문자열이어야 합니다.'),
 currency:z.string().regex(/^[A-Z]{3}$/,'ISO 4217 통화 코드가 필요합니다.'),
 periodStart:isoDateSchema,
 periodEnd:isoDateSchema,
 periodType:z.enum(['annual','quarter','ytd']),
 accountingScope:z.enum(['consolidated','separate','unknown']),
 accountLabel:z.string().trim().min(1).max(200),
 sourceIds:z.array(idSchema).min(1).max(20),
 disclosureId:nullableText(120),
}).strict().superRefine((value,ctx)=>{
 if(value.periodStart>value.periodEnd){
  ctx.addIssue({code:z.ZodIssueCode.custom,path:['periodEnd'],message:'회계기간 종료일은 시작일보다 빠를 수 없습니다.'});
 }
});

export const revenueSchema=z.object({
 status:z.enum(['available','not_found','access_failed','identity_unresolved','conflicting','skipped']),
 selected:revenueObservationSchema.nullable(),
 observations:z.array(revenueObservationSchema).max(20),
 reason:nullableText(2_000),
}).strict().superRefine((value,ctx)=>{
 if(value.status==='available'&&!value.selected){
  ctx.addIssue({code:z.ZodIssueCode.custom,path:['selected'],message:'확인된 매출에는 선택한 원자료가 필요합니다.'});
 }
 if(value.status!=='available'&&value.selected){
  ctx.addIssue({code:z.ZodIssueCode.custom,path:['selected'],message:'미확정 매출은 대표 수치를 선택할 수 없습니다.'});
 }
 if(value.selected?.accountingScope==='unknown'){
  ctx.addIssue({code:z.ZodIssueCode.custom,path:['selected','accountingScope'],message:'회계 범위가 불명인 수치는 선택할 수 없습니다.'});
 }
});

export const requirementSchema=z.object({
 id:idSchema,
 label:z.string().trim().min(1).max(500),
 category:z.enum(['required','preferred','work','condition']),
 jobQuote:z.string().trim().min(1).max(2_400),
 expectedLevel:nullableText(1_000),
}).strict();

export const hiringHypothesisSchema=z.object({
 id:idSchema,
 kind:z.enum(['stated','inference']),
 claim:z.string().trim().min(1).max(2_000),
 evidenceSourceIds:z.array(idSchema).max(20),
 requirementIds:z.array(idSchema).max(20),
 alternative:nullableText(2_000),
 question:z.string().trim().min(1).max(1_000),
}).strict();

export const fitItemSchema=z.object({
 requirementId:idSchema,
 status:z.enum(['evidence','partial','gap','unknown']),
 profileQuote:nullableText(2_400),
 reason:z.string().trim().min(1).max(2_000),
 followUpQuestion:nullableText(1_000),
}).strict();

export const conditionCheckSchema=z.object({
 requirementId:idSchema,
 status:z.enum(['met','not_met','unknown']),
 profileQuote:nullableText(2_400),
 reason:z.string().trim().min(1).max(2_000),
}).strict();

export const preferenceQuestionSchema=z.object({
 preferenceQuote:z.string().trim().min(1).max(2_400),
 relatedClaimIds:z.array(idSchema).max(20),
 question:z.string().trim().min(1).max(1_000),
}).strict();

export const actionItemSchema=z.object({
 kind:z.enum(['highlight','prepare','ask']),
 title:z.string().trim().min(1).max(500),
 requirementIds:z.array(idSchema).max(20),
 claimIds:z.array(idSchema).max(20),
 profileQuote:nullableText(2_400),
 deliverable:nullableText(1_000),
 doneWhen:nullableText(1_000),
}).strict();

export const sectionStateSchema=z.object({
 status:z.enum(['pending','ready','unavailable','failed','skipped']),
 reason:nullableText(1_000),
}).strict();

const sectionStatesSchema=z.object({
 company:sectionStateSchema,
 revenue:sectionStateSchema,
 hiring:sectionStateSchema,
 personalization:sectionStateSchema,
 preparation:sectionStateSchema,
}).strict();

function duplicate(values:string[]){return values.find((value,index)=>values.indexOf(value)!==index);}

export const reportSchema=z.object({
 schemaVersion:z.string().trim().min(1).max(20),
 analysisId:idSchema,
 generatedAt:isoDateTimeSchema,
 summary:z.string().trim().min(1).max(1_200),
 job:jobInputSchema,
 companyIdentity:companyIdentitySchema,
 sources:z.array(sourceSchema).max(100),
 companyClaims:z.array(claimSchema).max(50),
 businessChanges:z.array(businessChangeSchema).max(3),
 roleClaims:z.array(claimSchema).max(50),
 revenue:revenueSchema,
 requirements:z.array(requirementSchema).max(100),
 hiringHypotheses:z.array(hiringHypothesisSchema).max(3),
 fitItems:z.array(fitItemSchema).max(100).nullable(),
 conditionChecks:z.array(conditionCheckSchema).max(100).nullable(),
 preferenceQuestions:z.array(preferenceQuestionSchema).max(20),
 actions:z.array(actionItemSchema).max(20),
 sectionStates:sectionStatesSchema,
 warnings:z.array(z.string().trim().min(1).max(1_000)).max(50),
}).strict().superRefine((value,ctx)=>{
 const ids=[
  ['sources',value.sources.map(item=>item.id)],
  ['requirements',value.requirements.map(item=>item.id)],
  ['claims',[...value.companyClaims,...value.roleClaims,...value.businessChanges.map(item=>item.claim)].map(item=>item.id)],
  ['hiringHypotheses',value.hiringHypotheses.map(item=>item.id)],
 ] as const;
 for(const [path,values] of ids){
  const repeated=duplicate(values);
  if(repeated)ctx.addIssue({code:z.ZodIssueCode.custom,path:[path],message:`중복 ID가 있습니다: ${repeated}`});
 }
 const requirements=new Map(value.requirements.map(item=>[item.id,item]));
 value.fitItems?.forEach((item,index)=>{
  if(requirements.get(item.requirementId)?.category==='condition'){
   ctx.addIssue({code:z.ZodIssueCode.custom,path:['fitItems',index,'requirementId'],message:'지원 조건은 역량 대조에 포함할 수 없습니다.'});
  }
 });
 value.conditionChecks?.forEach((item,index)=>{
  const requirement=requirements.get(item.requirementId);
  if(requirement&&requirement.category!=='condition'){
   ctx.addIssue({code:z.ZodIssueCode.custom,path:['conditionChecks',index,'requirementId'],message:'지원 조건만 조건 검사에서 참조할 수 있습니다.'});
  }
 });
 const selected=value.revenue.selected;
 if(selected&&!value.revenue.observations.some(item=>JSON.stringify(item)===JSON.stringify(selected))){
  ctx.addIssue({code:z.ZodIssueCode.custom,path:['revenue','selected'],message:'선택한 매출은 원자료 목록에 있어야 합니다.'});
 }
 for(const [kind,max] of [['highlight',3],['prepare',3],['ask',5]] as const){
  if(value.actions.filter(item=>item.kind===kind).length>max){
   ctx.addIssue({code:z.ZodIssueCode.custom,path:['actions'],message:`${kind} 행동은 최대 ${max}개입니다.`});
  }
 }
});

export type JobInput=z.infer<typeof jobInputSchema>;
export type ProfileInput=z.infer<typeof profileInputSchema>;
export type CompanyHint=z.infer<typeof companyHintSchema>;
export type AnalyzeInput=z.infer<typeof analyzeInputSchema>;
export type Source=z.infer<typeof sourceSchema>;
export type CompanyIdentity=z.infer<typeof companyIdentitySchema>;
export type Claim=z.infer<typeof claimSchema>;
export type BusinessChange=z.infer<typeof businessChangeSchema>;
export type RevenueObservation=z.infer<typeof revenueObservationSchema>;
export type Revenue=z.infer<typeof revenueSchema>;
export type Requirement=z.infer<typeof requirementSchema>;
export type HiringHypothesis=z.infer<typeof hiringHypothesisSchema>;
export type FitItem=z.infer<typeof fitItemSchema>;
export type ConditionCheck=z.infer<typeof conditionCheckSchema>;
export type PreferenceQuestion=z.infer<typeof preferenceQuestionSchema>;
export type ActionItem=z.infer<typeof actionItemSchema>;
export type SectionState=z.infer<typeof sectionStateSchema>;
export type Report=z.infer<typeof reportSchema>;
