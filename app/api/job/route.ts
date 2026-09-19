import { z } from "zod";
import { JobResearchError, normalizeWantedJobUrl, researchWantedJob } from "@/lib/knowboth/job-research";
import { createJobProof } from "@/lib/knowboth/job-proof";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const inputSchema = z.object({ url: z.string().trim().min(1).max(500) }).strict();
const headers = { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" };
const reply = (value: unknown, status = 200) => Response.json(value, { status, headers });

async function researchWithOneRetry(url: string, signal: AbortSignal) {
  try {
    return await researchWantedJob(url, signal);
  } catch (error) {
    const retryable = error instanceof JobResearchError
      && ["invalid_response", "not_found", "upstream"].includes(error.code);
    if (!retryable || signal.aborted) throw error;
    return researchWantedJob(url, signal);
  }
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return reply({ error: "이 사이트의 공고 입력 화면에서 요청해 주세요." }, 403);
  if (!request.headers.get("content-type")?.includes("application/json")) return reply({ error: "JSON 입력이 필요해요." }, 415);
  if (Number(request.headers.get("content-length") || 0) > 2_000) return reply({ error: "입력이 너무 길어요." }, 413);

  let canonicalUrl: string;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 2_000) return reply({ error: "입력이 너무 길어요." }, 413);
    const input = inputSchema.parse(JSON.parse(raw));
    const normalized = normalizeWantedJobUrl(input.url);
    if (!normalized) return reply({ error: "https://www.wanted.co.kr/wd/숫자 형식의 공고 주소를 입력해 주세요." }, 400);
    canonicalUrl = normalized;
  } catch (error) {
    return reply({ error: error instanceof z.ZodError ? "공고 주소를 확인해 주세요." : "공고 요청을 읽지 못했어요." }, 400);
  }

  const openAIKey = process.env.OPENAI_API_KEY?.trim();
  if (!openAIKey) return reply({ error: "AI 공고 조사 설정이 아직 연결되지 않았어요." }, 503);
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(50_000)]);
  try {
    const job = await researchWithOneRetry(canonicalUrl, signal);
    return reply({ status: "ready", job, jobProof: createJobProof(job, openAIKey), message: null });
  } catch (error) {
    if (signal.aborted) return reply({ error: "공고 확인 시간이 길어져 중단했어요. 잠시 후 다시 시도해 주세요.", retryable: true }, 504);
    if (error instanceof JobResearchError) {
      if (error.code === "configuration") return reply({ error: "AI 공고 조사 설정을 확인해 주세요.", retryable: false }, 503);
      if (error.code === "rate_limit") return reply({ error: "AI 요청이 많아요. 잠시 후 다시 시도해 주세요.", retryable: true }, 429);
      if (error.code === "not_found") return reply({ error: "해당 원티드 공고의 공개 내용을 확인하지 못했어요. 공고가 열려 있는지 확인한 뒤 다시 시도해 주세요.", retryable: true }, 502);
      if (error.code === "invalid_response") return reply({ error: "공고 내용을 충분히 확인하지 못했어요. 잠시 후 다시 시도해 주세요.", retryable: true }, 502);
    }
    return reply({ error: "공고 조사 중 일시적인 문제가 생겼어요. 잠시 후 다시 시도해 주세요.", retryable: true }, 502);
  }
}
