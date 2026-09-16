import { z } from 'zod';
import { fetchPublic, extractJob, searchWanted } from '@/lib/rolebridge/job-source';
const schema = z.discriminatedUnion('mode', [
 z.object({ mode: z.literal('search'), keyword: z.string().trim().min(1).max(80), offset: z.number().int().min(0).max(100000).default(0) }),
 z.object({ mode: z.literal('job'), id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) }),
]);
function reply(value: unknown, status = 200) { return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } }); }
export async function POST(request: Request) {
 const origin = request.headers.get('origin');
 if (!origin || origin !== new URL(request.url).origin) return reply({ error: '이 사이트의 검색 화면에서 요청해 주세요.' }, 403);
 if (Number(request.headers.get('content-length') || 0) > 5000) return reply({ error: '검색 요청이 너무 길어요.' }, 413);
 try {
  const body = await request.text(); if (body.length > 5000) return reply({ error: '검색 요청이 너무 길어요.' }, 413);
  const input = schema.parse(JSON.parse(body));
  if (input.mode === 'search') return reply(await searchWanted(input.keyword, input.offset, request.signal));
  const page = await fetchPublic(`https://www.wanted.co.kr/wd/${input.id}`, request.signal);
  return reply({ job: extractJob(page.html, page.url) });
 } catch (error) {
  return reply({ retryable: error instanceof Error && (['TimeoutError', 'TypeError'].includes(error.name) || /HTTP (429|5\d\d)/.test(error.message)), error: error instanceof z.ZodError ? '검색어 또는 원티드 공고 번호를 확인해 주세요.' : error instanceof Error && error.name === 'TimeoutError' ? '원티드 응답이 늦어요. 잠시 후 다시 검색해 주세요.' : error instanceof Error ? error.message : '원티드 공고를 가져오지 못했어요.' }, 422);
 }
}
