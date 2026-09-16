import { env } from 'cloudflare:workers';
import { inputSchema,validateEvidence } from '@/lib/rolebridge/model';
import { SYSTEM_PROMPT } from '@/lib/rolebridge/prompts';
const headers={'Cache-Control':'no-store','Content-Type':'application/json'};
function config(){return env as unknown as {OPENAI_API_KEY?:string;OPENAI_MODEL?:string};}
function reply(value:unknown,status=200){return Response.json(value,{status,headers});}
export async function GET(){return reply({available:!!config().OPENAI_API_KEY});}
export async function POST(request:Request){
 const origin=request.headers.get('origin');
 if(!origin||origin!==new URL(request.url).origin)return reply({error:'이 사이트의 분석 화면에서 요청해 주세요.'},403);
 if(!request.headers.get('content-type')?.includes('application/json'))return reply({error:'JSON 입력이 필요합니다.'},415);
 if(Number(request.headers.get('content-length')||0)>120000)return reply({error:'입력이 너무 길어요.'},413);
 let input;
 try{const raw=await request.text();if(raw.length>50000)return reply({error:'입력이 너무 길어요.'},413);input=inputSchema.parse(JSON.parse(raw));}catch{return reply({error:'공고는 40~16,000자, 경험은 14,000자 이내로 작성해 주세요.'},400);}
 const {OPENAI_API_KEY,OPENAI_MODEL}=config();
 if(!OPENAI_API_KEY)return reply({error:'AI API가 아직 연결되지 않았어요. 기본 분석 또는 분석 프롬프트를 사용해 주세요.'},503);
 try{
  const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:OPENAI_MODEL||'gpt-4.1-mini',instructions:SYSTEM_PROMPT,input:JSON.stringify(input),text:{format:{type:'json_object'}},max_output_tokens:10000,store:false}),signal:AbortSignal.timeout(55000)});
  if(!response.ok)return reply({error:response.status===429?'AI 요청 한도에 도달했어요. 잠시 후 다시 시도해 주세요.':response.status===401?'AI 연결 설정을 확인해야 합니다. 기본 분석을 이용해 주세요.':'AI 서비스 응답에 문제가 있어요. 잠시 후 다시 시도해 주세요.'},502);
  const data=await response.json() as {status?:string;output?:{type:string;content?:{type:string;text?:string}[]}[]};
  if(data.status!=='completed')return reply({error:'AI 응답이 완료되지 않았어요. 공고를 줄여 다시 시도해 주세요.'},502);
  const text=(data.output||[]).flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text||'').join('');
  const report=validateEvidence(JSON.parse(text),input);return reply({report});
 }catch(e){return reply({error:e instanceof Error&&e.name==='TimeoutError'?'분석 시간이 길어지고 있어요. 잠시 후 다시 시도해 주세요.':'AI 응답의 형식이나 원문 근거를 검증하지 못했어요. 다시 시도하거나 기본 분석을 이용해 주세요.'},502);}
}
