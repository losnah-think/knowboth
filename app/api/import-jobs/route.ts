import { z } from 'zod';
import { fetchPublic,extractJob,extractSearch,validateJobUrl } from '@/lib/rolebridge/job-source';
const schema=z.object({url:z.string().max(3000),mode:z.enum(['job','search'])});
function reply(value:unknown,status=200){return Response.json(value,{status,headers:{'Cache-Control':'no-store'}});}
export async function POST(request:Request){
 const origin=request.headers.get('origin');if(!origin||origin!==new URL(request.url).origin)return reply({error:'이 사이트의 가져오기 화면에서 요청해 주세요.'},403);
 if(Number(request.headers.get('content-length')||0)>5000)return reply({error:'링크가 너무 길어요.'},413);
 try{const body=await request.text();if(body.length>5000)return reply({error:'링크가 너무 길어요.'},413);const input=schema.parse(JSON.parse(body));validateJobUrl(input.url);const page=await fetchPublic(input.url,request.signal);
 if(input.mode==='search'){const data=extractSearch(page.html,page.url);if(!data.links.length)return reply({error:'공개 페이지에서 공고 링크를 찾지 못했어요. 로그인·동적 검색 또는 접근 제한이 있을 수 있어요. 개별 공고 링크를 넣어주세요.'},422);return reply({...data,source:page.url});}
 try{return reply({job:extractJob(page.html,page.url)});}catch(error){
 // Only follow a public Saramin job-description iframe; never arbitrary embedded URLs.
 if(new URL(page.url).hostname.endsWith('saramin.co.kr')){const match=page.html.match(/(?:src|data-src)=["']([^"']*\/zf_user\/jobs\/relay\/view-detail[^"']*)["']/i);if(match){const u=new URL(match[1].replace(/&amp;/g,'&'),page.url);const detail=await fetchPublic(u.toString(),request.signal);const job=extractJob(detail.html,page.url);return reply({job});}}
 throw error;
 }
 }catch(e){return reply({error:e instanceof z.ZodError?'올바른 채용 링크를 넣어주세요.':e instanceof Error&&e.name==='TimeoutError'?'채용 사이트의 응답이 늦어요. 잠시 후 다시 시도해 주세요.':e instanceof Error?e.message:'공고를 가져오지 못했어요.'},422);}
}
