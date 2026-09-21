import { z } from 'zod';
import { jobInputSchema, profileInputSchema } from '@/lib/knowboth/schema';
import { verifyJobProof } from '@/lib/knowboth/job-proof';
import { wantedPostingUrl } from '@/lib/knowboth/recommendation-core';
import { boundedText, RecommendationError, recommendWantedJobs } from '@/lib/knowboth/recommendations';

export const runtime = 'nodejs';
export const maxDuration = 120;
export const dynamic = 'force-dynamic';
const inputSchema = z.object({ job: jobInputSchema, profile: profileInputSchema }).strict();
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return reply({ error: '이 사이트의 분석 화면에서 요청해 주세요.' }, 403);
  if (!request.headers.get('content-type')?.includes('application/json')) return reply({ error: 'JSON 입력이 필요해요.' }, 415);
  let input: z.infer<typeof inputSchema>;
  try {
    const raw = await boundedText(new Response(request.body, { headers: request.headers }), request.signal, 170_000);
    if (raw === null) return reply({ error: '입력이 너무 길어요.' }, 413);
    input = inputSchema.parse(JSON.parse(raw));
  } catch { return reply({ error: '추천에 사용할 공고와 이력서를 확인해 주세요.' }, 400); }
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return reply({ error: 'AI 공고 검색 설정이 아직 연결되지 않았어요.', retryable: false }, 503);
  if (!input.job.sourceUrl || input.job.userEdited || wantedPostingUrl(input.job.sourceUrl) !== input.job.sourceUrl) return reply({ error: '공고를 다시 확인해 주세요.' }, 400);
  if (!verifyJobProof(request.headers.get('x-knowboth-job-proof'), input.job, key)) {
    return reply({ code: 'JOB_PROOF_INVALID', error: '공고 확인 정보가 일치하지 않아요. 공고를 다시 분석한 뒤 추천을 실행해 주세요.', retryable: false }, 401);
  }
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(110_000)]);
  try {
    const result = await recommendWantedJobs(input.job, input.profile, signal, {
      apiKey: key, model: process.env.OPENAI_MODEL?.trim() || 'gpt-5.6-luna',
    });
    return reply(result);
  } catch (error) {
    if (signal.aborted || (error instanceof RecommendationError && error.code === 'timeout')) {
      return reply({ error: '다른 공고 검색 시간이 길어져 멈췄어요. 기존 분석은 그대로이며 다시 검색할 수 있어요.', retryable: true }, 504);
    }
    if (error instanceof RecommendationError && error.code === 'configuration') return reply({ error: '공고 추천에 사용할 AI 모델과 API 설정을 확인해 주세요.', retryable: false }, 503);
    if (error instanceof RecommendationError && error.code === 'rate_limit') return reply({ error: 'AI 요청이 많아요. 잠시 후 다시 검색해 주세요.', retryable: true }, 429);
    return reply({ error: '추천 공고의 출처나 내용을 검증하지 못했어요. 기존 분석은 유지되며 다시 검색할 수 있어요.', retryable: true }, 502);
  }
}
