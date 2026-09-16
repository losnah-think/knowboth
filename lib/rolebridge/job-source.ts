import { parseHTML } from 'linkedom';
export type JobLink={url:string;title:string;company?:string;summary?:string};
export type ImportedJob=JobLink&{text:string;source:string;fetchedAt:string};
const allowed=['saramin.co.kr','wanted.co.kr','jobkorea.co.kr','jumpit.co.kr'];
export function validateJobUrl(raw:string):URL{
 let url:URL;try{url=new URL(raw);}catch{throw new Error('https://로 시작하는 올바른 링크를 넣어주세요.');}
 if(url.protocol!=='https:'||url.username||url.password||(url.port&&url.port!=='443')||!allowed.some(h=>url.hostname===h||url.hostname.endsWith('.'+h)))throw new Error('사람인·원티드·잡코리아·점핏의 https 채용 링크를 지원해요.');
 if(/\/(login|signin|join|apply|resume|mypage|member)(\/|$)/i.test(url.pathname))throw new Error('로그인이 필요한 개인 페이지는 가져올 수 없어요. 공개 공고 링크를 넣어주세요.');
 url.hash='';return url;
}
export async function fetchPublic(raw:string,signal?:AbortSignal):Promise<{html:string;url:string}>{
 let url=validateJobUrl(raw);const timeout=AbortSignal.timeout(15000);const combined=signal?AbortSignal.any([signal,timeout]):timeout;
 for(let i=0;i<4;i++){
  const r=await fetch(url.toString(),{headers:{'User-Agent':'RoleBridge/1.0 (public job description reader)','Accept':'text/html,application/xhtml+xml'},redirect:'manual',signal:combined});
  if([301,302,303,307,308].includes(r.status)){const location=r.headers.get('location');if(!location)throw new Error('공고 주소 이동을 확인할 수 없어요.');url=validateJobUrl(new URL(location,url).toString());continue;}
  if(!r.ok)throw new Error(`채용 사이트가 요청을 허용하지 않았어요 (HTTP ${r.status}). 본문을 직접 넣어주세요.`);
  if(!/text\/html|xhtml/i.test(r.headers.get('content-type')||''))throw new Error('공개 HTML 채용 페이지가 아니에요.');
  if(Number(r.headers.get('content-length')||0)>2500000)throw new Error('페이지가 너무 커서 가져올 수 없어요. 개별 공고 링크를 사용해 주세요.');
  const reader=r.body?.getReader();if(!reader)throw new Error('페이지 내용을 읽지 못했어요.');let size=0;const chunks:Uint8Array[]=[];
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2500000){await reader.cancel();throw new Error('페이지가 너무 커서 가져올 수 없어요.');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  const charset=/euc-kr|ks_c_5601/i.test(r.headers.get('content-type')||'')?'euc-kr':'utf-8';
  const html=new TextDecoder(charset).decode(bytes);
  if(/captcha|access denied|비정상적인 접근|자동화된 접근|접근이 제한/.test(html.slice(0,16000).toLowerCase())&&html.length<30000)throw new Error('채용 사이트의 접근 제한으로 가져오지 못했어요. 본문을 직접 넣어주세요.');
  return {html,url:url.toString()};
 }
 throw new Error('주소 이동이 너무 많아 공고를 가져오지 못했어요.');
}
function textOf(html:string){const {document}=parseHTML(`<html><body>${html}</body></html>`);document.querySelectorAll('script,style,noscript,nav,footer,header,form').forEach(x=>x.remove());document.querySelectorAll('br').forEach(x=>x.replaceWith('\n'));document.querySelectorAll('p,div,li,h1,h2,h3,h4,tr,section,article').forEach(x=>x.append('\n'));return (document.body.textContent||'').replace(/[ \t]+/g,' ').replace(/\n[ \t]+/g,'\n').replace(/\n{3,}/g,'\n\n').trim();}
function findPosting(value:unknown):Record<string,unknown>|null{
 if(Array.isArray(value)){for(const v of value){const p=findPosting(v);if(p)return p;}}
 if(value&&typeof value==='object'){const v=value as Record<string,unknown>;if(v['@type']==='JobPosting'||Array.isArray(v['@type'])&&v['@type'].includes('JobPosting'))return v;if(v['@graph'])return findPosting(v['@graph']);}return null;
}
export function extractJob(html:string,url:string):ImportedJob{
 const {document}=parseHTML(html);let title=document.querySelector('h1')?.textContent?.trim()||document.querySelector('title')?.textContent?.trim()||'가져온 공고';let text='';
 for(const script of document.querySelectorAll('script[type="application/ld+json"]')){try{const p=findPosting(JSON.parse(script.textContent||''));if(p&&typeof p.description==='string'){title=typeof p.title==='string'?p.title:title;const org=p.hiringOrganization as {name?:string}|undefined;text=[title,org?.name,textOf(p.description),typeof p.qualifications==='string'?textOf(p.qualifications):'',typeof p.responsibilities==='string'?textOf(p.responsibilities):'',typeof p.experienceRequirements==='string'?p.experienceRequirements:''].filter(Boolean).join('\n\n');break;}}catch{}}
 if(!text){const selectors=['.jv_cont .jv_detail','.user_content','.recruit-detail','.recruitment-detail','#jobDescriptionText','.job-description','[class*="JobDescription_JobDescription"]','[class*="JobDetail_JobDetail"]','article'];for(const selector of selectors){const node=document.querySelector(selector);if(node){const t=textOf(node.innerHTML);if(t.length>100){text=title+'\n\n'+t;break;}}}}
 if(text.trim().length<100||!/(자격|업무|모집|경력|담당|우대|requirements|responsibilities|experience)/i.test(text))throw new Error('공고 본문이 이미지·동적 화면이거나 접근이 제한되어 있어요. 본문을 직접 넣어주세요.');
 if(text.length>16000)throw new Error('공고 본문이 16,000자를 넘어요. 주요 업무와 자격 요건을 직접 넣어주세요.');
 return {url,title:title.slice(0,160),text,source:new URL(url).hostname,fetchedAt:new Date().toISOString()};
}
export function extractSearch(html:string,raw:string):{links:JobLink[];nextPage:string|null}{
 const url=validateJobUrl(raw);const {document}=parseHTML(html);const map=new Map<string,JobLink>();
 const list=document.querySelector('#recruit_info_list');
 const anchors=list?list.querySelectorAll('.item_recruit .job_tit a[href]'):document.querySelectorAll('a[href]');
 for(const a of anchors){const href=a.getAttribute('href');if(!href)continue;try{const u=validateJobUrl(new URL(href,url).toString());let key='';if(u.hostname.endsWith('saramin.co.kr')){const id=u.searchParams.get('rec_idx');if(id&&/^\d+$/.test(id)){u.pathname='/zf_user/jobs/relay/view';u.search='?rec_idx='+id;key=u.toString();}}
 else if(u.hostname.endsWith('wanted.co.kr')&&/^\/wd\/\d+/.test(u.pathname)){u.search='';key=u.toString();}
 else if(u.hostname.endsWith('jobkorea.co.kr')&&/\/Recruit\/G(?:I|i)_Read\/\d+/i.test(u.pathname)){u.search='';key=u.toString();}
 else if(/\/position\/\d+/.test(u.pathname)){u.search='';key=u.toString();}
 const title=(a.getAttribute('title')||a.textContent||'채용공고').trim().replace(/\s+/g,' ').slice(0,160);if(key&&!map.has(key))map.set(key,{url:key,title,company:a.closest('.item_recruit')?.querySelector('.corp_name')?.textContent?.trim(),summary:a.closest('.item_recruit')?.querySelector('.job_condition')?.textContent?.trim().replace(/\s+/g,' ')});}catch{}}
 let nextPage:string|null=null;const rel=document.querySelector('a[rel="next"]')?.getAttribute('href');if(rel){try{const n=validateJobUrl(new URL(rel,url).toString());if(n.hostname===url.hostname)nextPage=n.toString();}catch{}}
 if(!nextPage&&url.hostname.endsWith('saramin.co.kr')&&/\/search\b/.test(url.pathname)){
  const current=Number(url.searchParams.get('recruitPage')||1);const pageButton=document.querySelector(`.pagination a.page_move[page="${current+1}"]`);if(pageButton){const n=new URL(url);n.searchParams.set('recruitPage',String(current+1));nextPage=n.toString();}const next=document.querySelectorAll('a[href]');for(const a of next){try{const u=new URL(a.getAttribute('href')||'',url);if(u.searchParams.get('recruitPage')===String(current+1)&&u.hostname===url.hostname){nextPage=validateJobUrl(u.toString()).toString();break;}}catch{}}

 }
 return {links:[...map.values()].slice(0,100),nextPage};
}
