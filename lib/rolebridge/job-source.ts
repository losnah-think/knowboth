import { parseHTML } from 'linkedom';
import { z } from 'zod';

export type JobLink = { id: number; url: string; title: string; company?: string; summary?: string };
export type ImportedJob = JobLink & { text: string; source: string; fetchedAt: string };
const origin = 'https://www.wanted.co.kr';
const searchPath = '/api/chaos/search/v1/position';
const pageSize = 12;

export function validateJobUrl(raw: string): URL {
 let url: URL;
 try { url = new URL(raw); } catch { throw new Error('올바른 원티드 공고 주소가 아니에요.'); }
 if (url.protocol !== 'https:' || url.hostname !== 'www.wanted.co.kr' || url.username || url.password || (url.port && url.port !== '443') || !/^\/wd\/[1-9]\d*$/.test(url.pathname)) {
  throw new Error('원티드의 공개 채용공고만 가져올 수 있어요.');
 }
 url.search = ''; url.hash = ''; return url;
}

async function readPublic(url: string, format: 'html' | 'json', signal?: AbortSignal): Promise<string> {
 const timeout = AbortSignal.timeout(15000);
 const response = await fetch(url, { headers: { 'User-Agent': 'RoleBridge/1.0 (public job description reader)', Accept: format === 'json' ? 'application/json' : 'text/html,application/xhtml+xml' }, redirect: 'manual', signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
 if (!response.ok) throw new Error(`원티드에서 정보를 가져오지 못했어요 (HTTP ${response.status}). 잠시 후 다시 검색해 주세요.`);
 const contentType = response.headers.get('content-type') || '';
 if (!(format === 'json' ? /application\/json/i : /text\/html|xhtml/i).test(contentType)) throw new Error('원티드 응답 형식을 확인할 수 없어요. 잠시 후 다시 검색해 주세요.');
 if (Number(response.headers.get('content-length') || 0) > 2500000) throw new Error('원티드 응답이 너무 커서 가져오지 못했어요.');
 const reader = response.body?.getReader();
 if (!reader) throw new Error('원티드 응답을 읽지 못했어요.');
 let size = 0; const chunks: Uint8Array[] = [];
 while (true) {
  const { done, value } = await reader.read(); if (done) break;
  size += value.length;
  if (size > 2500000) { await reader.cancel(); throw new Error('원티드 응답이 너무 커서 가져오지 못했어요.'); }
  chunks.push(value);
 }
 const bytes = new Uint8Array(size); let offset = 0;
 for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
 return new TextDecoder().decode(bytes);
}
export async function fetchPublic(raw: string, signal?: AbortSignal): Promise<{ html: string; url: string }> {
 const url = validateJobUrl(raw).toString(); return { html: await readPublic(url, 'html', signal), url };
}
function careerLabel(from?: number | null, to?: number | null, newbie?: boolean) {
 if (newbie && (to == null || to === 0)) return '신입';
 if (newbie) return '신입·경력';
 if (from === 0 && (to == null || to >= 100)) return '경력 무관';
 if (from === 0) return `신입·경력${to ? ` ${to}년 이하` : ''}`;
 if (from != null) return to != null && to < 100 ? `경력 ${from}~${to}년` : `경력 ${from}년 이상`;
 return '경력 표기 확인 필요';
}
const searchSchema = z.object({
 total_count: z.number().int().nonnegative(),
 data: z.array(z.object({ id: z.number().int().positive(), position: z.string().min(1), company: z.object({ name: z.string() }), annual_from: z.number().nullable().optional(), annual_to: z.number().nullable().optional() })),
 links: z.object({ next: z.string().nullable() }),
});
export function extractSearch(value: unknown, keyword: string, offset: number) {
 const parsed = searchSchema.safeParse(value);
 if (!parsed.success) throw new Error('원티드 검색결과 형식이 달라져 읽지 못했어요.');
 const data = parsed.data; let nextOffset: number | null = null;
 if (data.links.next) {
  const next = new URL(data.links.next, origin); const nextValue = next.searchParams.get('offset');
  const nextNumber = Number(nextValue);
  if (next.origin !== origin || next.username || next.password || next.pathname !== searchPath || next.searchParams.getAll('query').length !== 1 || next.searchParams.get('query') !== keyword || next.searchParams.get('limit') !== String(pageSize) || !nextValue || !/^\d+$/.test(nextValue) || nextNumber !== offset + pageSize) throw new Error('원티드의 다음 검색결과를 확인하지 못했어요.');
  if (data.data.length) nextOffset = nextNumber;
 }
 const links = [...new Map(data.data.map(job => [job.id, { id: job.id, url: `${origin}/wd/${job.id}`, title: job.position, company: job.company.name, summary: careerLabel(job.annual_from, job.annual_to) }])).values()];
 return { links, nextOffset, total: data.total_count, source: `${origin}/search?query=${encodeURIComponent(keyword)}&tab=position` };
}
export async function searchWanted(keyword: string, offset = 0, signal?: AbortSignal) {
 const url = new URL(searchPath, origin); url.searchParams.set('query', keyword); url.searchParams.set('limit', String(pageSize)); url.searchParams.set('offset', String(offset));
 const body = await readPublic(url.toString(), 'json', signal);
 let value: unknown; try { value = JSON.parse(body); } catch { throw new Error('원티드 검색결과를 읽지 못했어요.'); }
 return extractSearch(value, keyword, offset);
}
function textOf(html: string) {
 const { document } = parseHTML(`<html><body>${html}</body></html>`);
 document.querySelectorAll('script,style,noscript,nav,footer,header,form').forEach(x => x.remove());
 document.querySelectorAll('br').forEach(x => x.replaceWith('\n'));
 document.querySelectorAll('p,div,li,h1,h2,h3,h4,tr,section,article').forEach(x => x.append('\n'));
 return (document.body.textContent || '').replace(/\\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
const wantedJobSchema = z.object({ id: z.number().int().positive(), position: z.string(), company: z.object({ company_name: z.string() }), status: z.string(), hidden: z.boolean().optional(), is_private: z.boolean().optional(), main_tasks: z.string(), requirements: z.string(), intro: z.string().nullish(), preferred_points: z.string().nullish(), career: z.object({ annual_from: z.number().nullable().optional(), annual_to: z.number().nullable().optional(), is_newbie: z.boolean().optional() }).optional() });
export function extractJob(html: string, raw: string): ImportedJob {
 const url = validateJobUrl(raw); const id = Number(url.pathname.split('/').pop());
 const { document } = parseHTML(html);
 // Wanted's JSON-LD contains main_tasks only. Use the page's public initialData
 // so requirements and preferred_points cannot silently disappear from scoring.
 let initial: unknown;
 try { initial = JSON.parse(document.querySelector('#__NEXT_DATA__')?.textContent || '{}')?.props?.pageProps?.initialData; } catch { throw new Error('원티드 공고 본문을 읽지 못했어요.'); }
 const parsed = wantedJobSchema.safeParse(initial);
 if (!parsed.success) throw new Error('원티드 공고의 주요 업무와 자격 요건을 확인하지 못했어요.');
 const job = parsed.data;
 if (job.id !== id) throw new Error('검색한 공고와 상세 정보가 일치하지 않아요.');
 if (job.status !== 'active' || job.hidden || job.is_private) throw new Error('마감되었거나 공개 중이 아닌 공고라 비교에서 제외했어요.');
 const mainTasks = textOf(job.main_tasks), requirements = textOf(job.requirements), preferred = textOf(job.preferred_points || ''), intro = textOf(job.intro || '');
 if (!mainTasks || !requirements) throw new Error('주요 업무 또는 자격 요건이 비어 있어 비교에서 제외했어요.');
 const summary = job.career ? careerLabel(job.career.annual_from, job.career.annual_to, job.career.is_newbie) : undefined;
 // Career metadata is display-only: it can conflict with the stated requirements.
 const text = [job.position, job.company.company_name, '주요 업무', mainTasks, '자격 요건', requirements, ...(preferred ? ['우대 사항', preferred] : []), ...(intro ? ['회사·직무 소개', intro] : [])].join('\n\n');
 if (text.length < 100) throw new Error('공고 본문이 너무 짧아 비교에서 제외했어요.');
 if (text.length > 16000) throw new Error('공고 본문이 16,000자를 넘어 자동 비교에서 제외했어요.');
 return { id, url: url.toString(), title: job.position.slice(0, 160), company: job.company.company_name, summary, text, source: '원티드', fetchedAt: new Date().toISOString() };
}
