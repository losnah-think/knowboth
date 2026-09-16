import { z } from 'zod';
export const inputSchema = z.object({job:z.string().trim().min(40,'주요 업무와 자격 요건을 포함해 40자 이상 입력해 주세요.').max(16000),experience:z.string().max(14000),career:z.enum(['entry','experienced']),years:z.number().min(0).max(60).nullable(),role:z.string().max(80)});
export type AnalysisInput=z.infer<typeof inputSchema>;
const text=z.string().max(2400);
export const reportSchema=z.object({
 title:z.string().max(160),summary:text,seniority:z.enum(['entry','experienced','mixed','unknown']),
 requirements:z.array(z.object({id:z.string().max(40),skill:z.string().max(160),importance:z.enum(['required','core_work','preferred']),jobQuote:text,status:z.enum(['met','partial','gap','unknown']),evidenceQuote:text,reason:text,question:text,task:text,deliverable:text})).max(32),
 conditions:z.array(z.object({label:text,jobQuote:text,status:z.enum(['pass','fail','unknown']),reason:text})).max(12),
 domains:z.array(z.object({domain:z.string().max(120),evidenceQuote:text,reason:text,caveat:text,experiment:text})).max(4),
 resume:z.array(z.object({before:text,after:text,question:text})).max(5),
 limitations:z.array(text).max(8)
});
export type Report=z.infer<typeof reportSchema>;
export type Requirement=Report['requirements'][number];
export type Analysis={report:Report;input:AnalysisInput;engine:'local'|'ai';createdAt:string};
export const weights={required:3,core_work:2,preferred:1};
export const statusLabels={met:'근거 확인',partial:'일부 확인',gap:'보완 필요',unknown:'미확인'};
export const importanceLabels={required:'필수',core_work:'주요 업무',preferred:'우대'};
export function metrics(requirements:Requirement[]){
 const total=requirements.reduce((a,r)=>a+weights[r.importance],0);
 const known=requirements.filter(r=>r.status!=='unknown').reduce((a,r)=>a+weights[r.importance],0);
 const earned=requirements.reduce((a,r)=>a+weights[r.importance]*(r.status==='met'?1:r.status==='partial'?.5:0),0);
 return {match:known?Math.round(earned/known*100):null,coverage:total?Math.round(known/total*100):0,lower:total?Math.round(earned/total*100):0,upper:total?Math.round((earned+total-known)/total*100):0,total,known};
}
export function validateEvidence(value:unknown,input:AnalysisInput):Report{
 const r=reportSchema.parse(value);
 if(!r.requirements.length)throw new Error('공고에서 평가할 요구 사항을 찾지 못했습니다. 주요 업무와 자격 요건을 추가해 주세요.');
 const seen=new Set<string>();
 r.requirements=r.requirements.filter(x=>{const key=x.skill.toLowerCase().replace(/\s/g,'');if(seen.has(key))return false;seen.add(key);return true;});
 const warn=new Set(r.limitations);
 r.requirements=r.requirements.map((x,i)=>{
  if(!x.jobQuote.trim()||!input.job.includes(x.jobQuote))throw new Error('공고 인용을 검증하지 못했습니다. 다시 분석해 주세요.');
  const valid=!!x.evidenceQuote.trim()&&input.experience.includes(x.evidenceQuote);
  if(x.status!=='unknown'&&!valid){warn.add('원문에서 확인되지 않는 경험은 미확인으로 처리했습니다.');return {...x,id:`r${i+1}`,status:'unknown',evidenceQuote:'',reason:'판정에 필요한 경험의 원문 근거를 확인하지 못했습니다.'};}
  return {...x,id:`r${i+1}`,evidenceQuote:valid?x.evidenceQuote:''};
 });
 r.conditions=r.conditions.filter(x=>x.jobQuote.trim()&&input.job.includes(x.jobQuote));
 r.domains=r.domains.filter(x=>x.evidenceQuote.trim()&&input.experience.includes(x.evidenceQuote));
 r.resume=r.resume.filter(x=>{
  if(!x.before.trim()||!input.experience.includes(x.before))return false;
  const numbers=x.after.match(/\d+(?:\.\d+)?/g)||[];
  const sourceNumbers=new Set(x.before.match(/\d+(?:\.\d+)?/g)||[]);
  const claimMarkers=/Python|React|SQL|TypeScript|JavaScript|Figma|LLM|RAG|주도|리드|책임|운영|출시|매출|전환율|절감/gi;
  const claims=x.after.match(claimMarkers)||[];
  if(claims.some(c=>!x.before.toLowerCase().includes(c.toLowerCase()))){warn.add('원문에 없는 도구·역할·성과 표현이 포함된 이력서 제안은 제외했습니다.');return false;}
  if(numbers.some(n=>!sourceNumbers.has(n))){warn.add('입력에 없는 수치가 포함된 이력서 제안은 제외했습니다.');return false;}return true;
 });
 warn.add('이력서 제안은 초안입니다. 인용·수치 검사는 문장 전체의 사실성을 보장하지 않으므로 실제 경험과 대조해 주세요.');
 r.limitations=[...warn].slice(0,8);return r;
}
