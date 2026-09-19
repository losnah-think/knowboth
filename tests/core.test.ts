import test from 'node:test';
import assert from 'node:assert/strict';
import {
 analyzeInputSchema,
 reportSchema,
 revenueSchema,
 sourceSchema,
 type AnalyzeInput,
 type Report,
} from '../lib/knowboth/schema';
import {isGroundedQuote,normalizeWhitespace,validateReportEvidence} from '../lib/knowboth/evidence';
import {reportJsonSchema,researchJsonSchema} from '../lib/knowboth/prompts';

const job={
 id:'job-1',
 sourceUrl:'https://www.wanted.co.kr/wd/123',
 inputMethod:'ai_research' as const,
 companyDisplayName:'예시 기업',
 positionTitle:'Product Manager',
 rawText:'주요 업무: 고객 인터뷰로 문제를 정의합니다. 자격 요건: SQL 분석 경험이 필요합니다. 지원 조건: 관련 업무 경력 3년 이상.',
 collectedAt:'2026-09-19T10:00:00+09:00',
 userEdited:true,
};

const profile={
 experienceText:'B2B 서비스를 4년 운영했습니다. 고객 인터뷰를 진행하고 SQL로 전환율을 분석했습니다.',
 desiredWork:'원격 근무를 선호합니다.',
 constraints:null,
 additionalAnswers:[],
};

function input(withProfile=true):AnalyzeInput{
 return analyzeInputSchema.parse({job,profile:withProfile?profile:null,companyHint:null,companyResolution:'auto'});
}

const revenueObservation={
 entityName:'예시기업 주식회사',
 amountDecimal:'12000000000',
 currency:'KRW',
 periodStart:'2025-01-01',
 periodEnd:'2025-12-31',
 periodType:'annual' as const,
 accountingScope:'separate' as const,
 accountLabel:'매출액',
 sourceIds:['source-filing'],
 disclosureId:'202603310001',
};

function baseReport():Report{
 return reportSchema.parse({
  schemaVersion:'1.0',
  analysisId:'analysis-1',
  generatedAt:'2026-09-19T10:01:00+09:00',
  summary:'기업 고객의 문제를 정의하고 데이터를 분석할 Product Manager를 찾는 공고입니다.',
  job,
  companyIdentity:{
   displayName:'예시 기업',legalName:'예시기업 주식회사',website:'https://example.com',corpCode:'00123456',status:'matched',
   evidenceSourceIds:['source-official'],candidates:[],
  },
  sources:[
   {id:'source-job',kind:'job',url:job.sourceUrl,title:'예시 채용 공고',publisher:'원티드',publishedAt:null,retrievedAt:'2026-09-19T10:00:00+09:00',evidenceMode:'user_provided',excerpt:job.rawText},
   {id:'source-official',kind:'official',url:'https://example.com/business',title:'사업 소개',publisher:'예시 기업',publishedAt:null,retrievedAt:'2026-09-19T10:00:00+09:00',evidenceMode:'raw_text',excerpt:'기업 고객의 업무를 돕는 소프트웨어를 제공합니다.'},
   {id:'source-filing',kind:'filing',url:'https://dart.fss.or.kr/example',title:'2025 감사보고서',publisher:'금융감독원',publishedAt:'2026-03-31',retrievedAt:'2026-09-19T10:00:00+09:00',evidenceMode:'raw_text',excerpt:'매출액 12,000,000,000원'},
  ],
  companyClaims:[{id:'claim-product',topic:'product',text:'기업용 소프트웨어를 제공합니다.',kind:'sourced',sourceIds:['source-official'],rationale:null,conflict:false}],
  businessChanges:[],
  roleClaims:[{id:'claim-work',topic:'work',text:'고객 문제를 정의합니다.',kind:'sourced',sourceIds:['source-job'],rationale:null,conflict:false}],
  revenue:{status:'available',selected:revenueObservation,observations:[revenueObservation],reason:null},
  requirements:[
   {id:'requirement-work',label:'고객 문제 정의',category:'work',jobQuote:'고객 인터뷰로 문제를 정의합니다.',expectedLevel:null},
   {id:'requirement-sql',label:'SQL 분석',category:'required',jobQuote:'SQL 분석 경험이 필요합니다.',expectedLevel:null},
   {id:'requirement-years',label:'관련 경력 3년 이상',category:'condition',jobQuote:'관련 업무 경력 3년 이상.',expectedLevel:'3년 이상'},
  ],
  hiringHypotheses:[{id:'hypothesis-1',kind:'inference',claim:'고객 문제 정의를 강화하려는 채용일 수 있습니다.',evidenceSourceIds:['source-official'],requirementIds:['requirement-work'],alternative:'기존 업무의 결원 충원일 수도 있습니다.',question:'입사 후 먼저 해결할 고객 문제는 무엇인가요?'}],
  fitItems:[
   {requirementId:'requirement-work',status:'evidence',profileQuote:'고객 인터뷰를 진행하고 SQL로 전환율을 분석했습니다.',reason:'직접 인터뷰한 경험이 있습니다.',followUpQuestion:null},
   {requirementId:'requirement-sql',status:'evidence',profileQuote:'SQL로 전환율을 분석했습니다.',reason:'SQL 분석 경험이 있습니다.',followUpQuestion:null},
  ],
  conditionChecks:[{requirementId:'requirement-years',status:'met',profileQuote:'B2B 서비스를 4년 운영했습니다.',reason:'입력한 경력 기간이 조건보다 깁니다.'}],
  preferenceQuestions:[{preferenceQuote:'원격 근무를 선호합니다.',relatedClaimIds:[],question:'원격 근무가 가능한가요?'}],
  actions:[
   {kind:'highlight',title:'고객 인터뷰 경험 정리',requirementIds:['requirement-work'],claimIds:['claim-work'],profileQuote:'고객 인터뷰를 진행하고 SQL로 전환율을 분석했습니다.',deliverable:'사례 한 페이지',doneWhen:'문제와 결과를 설명할 수 있음'},
   {kind:'ask',title:'첫 과제 확인',requirementIds:['requirement-work'],claimIds:['claim-work'],profileQuote:null,deliverable:null,doneWhen:null},
  ],
  sectionStates:{
   company:{status:'ready',reason:null},revenue:{status:'ready',reason:null},hiring:{status:'ready',reason:null},
   personalization:{status:'ready',reason:null},preparation:{status:'ready',reason:null},
  },
  warnings:[],
 });
}

test('quotes are grounded only by exact text after fixed whitespace normalization',()=>{
 assert.equal(normalizeWhitespace('  고객\n\t 인터뷰  '),'고객 인터뷰');
 assert.equal(isGroundedQuote('고객   인터뷰로 문제를 정의합니다.',job.rawText),true);
 assert.equal(isGroundedQuote('고객 인터뷰로 문제를 정의했습니다.',job.rawText),false);
 assert.equal(isGroundedQuote('',job.rawText),false);
});

test('source and input URLs allow only credential-free HTTP(S)',()=>{
 const source=baseReport().sources[0];
 for(const url of ['ftp://example.com/file','javascript:alert(1)','https://user:pass@example.com/file']){
  assert.equal(sourceSchema.safeParse({...source,url}).success,false);
 }
 assert.equal(sourceSchema.safeParse({...source,url:'http://example.com/file'}).success,true);
});

test('selected company resolution requires an identity hint',()=>{
 assert.equal(analyzeInputSchema.safeParse({...input(),companyResolution:'selected',companyHint:null}).success,false);
 assert.equal(analyzeInputSchema.safeParse({...input(),companyResolution:'selected',companyHint:{legalName:'예시기업 주식회사',website:'https://example.com'}}).success,true);
});

test('the report always keeps the server-validated job input',()=>{
 const candidate=structuredClone(baseReport()) as unknown as Record<string,unknown>;
 candidate.job={companyDisplayName:'바꾼 회사',positionTitle:'바꾼 직무'};
 assert.deepEqual(validateReportEvidence(candidate,input()).job,input().job);
});

test('no profile means no fit, condition or preference result',()=>{
 const result=validateReportEvidence(baseReport(),input(false));
 assert.equal(result.fitItems,null);
 assert.equal(result.conditionChecks,null);
 assert.deepEqual(result.preferenceQuestions,[]);
 assert.equal(result.actions.some(action=>action.kind==='highlight'),false);
});

test('unknown source references are removed and unsupported claims are downgraded',()=>{
 const report=structuredClone(baseReport());
 report.companyClaims[0].sourceIds=['missing-source'];
 report.companyIdentity.evidenceSourceIds=['source-official','missing-source'];
 report.hiringHypotheses[0].evidenceSourceIds=['missing-source'];
 const result=validateReportEvidence(report,input());
 assert.equal(result.companyClaims[0].kind,'unknown');
 assert.deepEqual(result.companyClaims[0].sourceIds,[]);
 assert.deepEqual(result.companyIdentity.evidenceSourceIds,['source-official']);
 assert.deepEqual(result.hiringHypotheses,[]);
});

test('an ungrounded job quote removes the requirement and dependent references',()=>{
 const report=structuredClone(baseReport());
 report.requirements[0].jobQuote='공고에 없는 업무입니다.';
 const result=validateReportEvidence(report,input());
 assert.equal(result.requirements.some(item=>item.id==='requirement-work'),false);
 assert.equal(result.fitItems?.some(item=>item.requirementId==='requirement-work'),false);
 assert.deepEqual(result.hiringHypotheses,[]);
 assert.deepEqual(result.actions[0].requirementIds,[]);
});

test('ungrounded profile quotes become unknown rather than gaps or evidence',()=>{
 const report=structuredClone(baseReport());
 report.fitItems![0]={...report.fitItems![0],status:'gap',profileQuote:'고객 인터뷰를 해본 적이 없습니다.'};
 report.conditionChecks![0]={...report.conditionChecks![0],status:'not_met',profileQuote:'경력이 1년입니다.'};
 const result=validateReportEvidence(report,input());
 assert.equal(result.fitItems?.[0].status,'unknown');
 assert.equal(result.fitItems?.[0].profileQuote,null);
 assert.equal(result.conditionChecks?.[0].status,'unknown');
 assert.equal(result.conditionChecks?.[0].profileQuote,null);
});

test('additional profile answers can ground fit evidence',()=>{
 const report=structuredClone(baseReport());
 report.fitItems![0]={...report.fitItems![0],profileQuote:'고객 인터뷰를 12회 진행했습니다.'};
 const withAnswer=analyzeInputSchema.parse({
  ...input(),
  profile:{...profile,additionalAnswers:[{question:'인터뷰 경험이 있나요?',answer:'고객 인터뷰를 12회 진행했습니다.'}]},
 });
 const result=validateReportEvidence(report,withAnswer);
 assert.equal(result.fitItems?.[0].status,'evidence');
 assert.equal(result.fitItems?.[0].profileQuote,'고객 인터뷰를 12회 진행했습니다.');
});

test('conflicting or accounting-scope-unknown revenue cannot select a value',()=>{
 assert.equal(revenueSchema.safeParse({...baseReport().revenue,status:'conflicting'}).success,false);
 const unknown={...revenueObservation,accountingScope:'unknown' as const};
 assert.equal(revenueSchema.safeParse({status:'available',selected:unknown,observations:[unknown],reason:null}).success,false);
 assert.equal(revenueSchema.safeParse({status:'not_found',selected:null,observations:[],reason:'확인하지 못함'}).success,true);
});

test('a selected revenue value without a valid source is cleared, not displayed',()=>{
 const report=structuredClone(baseReport());
 report.revenue.selected!.sourceIds=['missing-source'];
 report.revenue.observations[0].sourceIds=['missing-source'];
 const result=validateReportEvidence(report,input());
 assert.equal(result.revenue.status,'conflicting');
 assert.equal(result.revenue.selected,null);
 assert.deepEqual(result.revenue.observations,[]);
});

test('unresolved company identity prevents selecting company revenue',()=>{
 const report=structuredClone(baseReport());
 report.companyIdentity.status='unresolved';
 const result=validateReportEvidence(report,input());
 assert.equal(result.revenue.status,'identity_unresolved');
 assert.equal(result.revenue.selected,null);
});

test('a matched identity without a valid source is downgraded before revenue selection',()=>{
 const report=structuredClone(baseReport());
 report.companyIdentity.evidenceSourceIds=['missing-source'];
 const result=validateReportEvidence(report,input());
 assert.equal(result.companyIdentity.status,'unresolved');
 assert.equal(result.revenue.status,'identity_unresolved');
 assert.equal(result.revenue.selected,null);
 assert.equal(result.revenue.reason,'고용 법인을 확정하지 못해 매출 수치를 표시하지 않습니다.');
});

test('employment conditions stay separate from skill fit',()=>{
 const fit=structuredClone(baseReport());
 fit.fitItems![0].requirementId='requirement-years';
 assert.equal(reportSchema.safeParse(fit).success,false);
 const condition=structuredClone(baseReport());
 condition.conditionChecks![0].requirementId='requirement-sql';
 assert.equal(reportSchema.safeParse(condition).success,false);
});

test('selected revenue must be one of the preserved observations',()=>{
 const report=structuredClone(baseReport());
 report.revenue.selected={...report.revenue.selected!,amountDecimal:'999'};
 assert.equal(reportSchema.safeParse(report).success,false);
});

test('a stated hiring reason without an exact job quote becomes an inference',()=>{
 const report=structuredClone(baseReport());
 report.hiringHypotheses[0].kind='stated';
 const result=validateReportEvidence(report,input());
 assert.equal(result.hiringHypotheses[0].kind,'inference');
});

test('structured output array limits match the server contracts',()=>{
 const research=JSON.parse(JSON.stringify(researchJsonSchema));
 const report=JSON.parse(JSON.stringify(reportJsonSchema));
 assert.equal(research.properties.businessChanges.maxItems,3);
 assert.equal(research.properties.companyClaims.maxItems,12);
 assert.equal(research.properties.revenue.properties.observations.maxItems,8);
 assert.equal(report.properties.businessChanges.maxItems,3);
 assert.equal(report.properties.hiringHypotheses.maxItems,3);
 assert.equal(report.properties.revenue.properties.observations.maxItems,20);
});
