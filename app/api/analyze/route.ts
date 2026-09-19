import { z } from "zod";
import { analyzeInputSchema, reportSchema, type AnalyzeInput } from "@/lib/knowboth/schema";
import { validateReportEvidence } from "@/lib/knowboth/evidence";
import { analyzeJob, OpenAIError, researchCompany, type CompanyResearch } from "@/lib/knowboth/openai";
import { normalizeWantedJobUrl } from "@/lib/knowboth/job-research";
import { verifyJobProof } from "@/lib/knowboth/job-proof";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" };
const reply = (value: unknown, status = 200) => Response.json(value, { status, headers });
const MAX_AI_ATTEMPTS = 3;

function retryableAIError(error: unknown) {
  return error instanceof OpenAIError ? error.retryable : error instanceof z.ZodError;
}

async function regenerateUpToThreeTimes<T>(run: () => Promise<T>, signal: AbortSignal) {
  for (let attempt = 1; attempt <= MAX_AI_ATTEMPTS; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (signal.aborted || !retryableAIError(error) || attempt === MAX_AI_ATTEMPTS) throw error;
    }
  }
  throw new Error("AI 결과를 생성하지 못했어요.");
}

export async function GET() {
  return reply({
    available: Boolean(process.env.OPENAI_API_KEY?.trim()),
    modelConfigured: Boolean(process.env.OPENAI_MODEL?.trim()),
  });
}

function normalizedCompanyName(value: string | null) {
  return (value || "").toLocaleLowerCase("ko-KR").replace(/주식회사|\(주\)|㈜|[^a-z0-9가-힣]/gu, "");
}

function selectedCompanyMatches(input: AnalyzeInput, research: CompanyResearch) {
  if (!input.companyHint || research.identity.status !== "matched") return false;
  const expectedName = normalizedCompanyName(input.companyHint.legalName);
  const actualNames = [research.identity.legalName, research.identity.displayName].map(normalizedCompanyName);
  if (expectedName && actualNames.includes(expectedName)) return true;
  if (!input.companyHint.website || !research.identity.website) return false;
  try {
    return new URL(input.companyHint.website).hostname === new URL(research.identity.website).hostname;
  } catch {
    return false;
  }
}

function skippedResearch(input: AnalyzeInput): CompanyResearch {
  return {
    identity: {
      displayName: input.job.companyDisplayName,
      legalName: input.companyHint?.legalName || null,
      website: input.companyHint?.website || null,
      corpCode: null,
      status: "unresolved",
      note: "사용자가 기업 재무 조사를 생략했습니다.",
      sourceIds: [],
      candidates: [],
    },
    sources: [],
    companyClaims: [],
    businessChanges: [],
    revenue: { status: "skipped", selected: null, observations: [], reason: "사용자가 재무 조사를 생략했습니다." },
    warnings: ["기업 외부 자료 조사를 생략해 공고에 적힌 내용만 분석했습니다."],
  };
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return reply({ error: "이 사이트의 분석 화면에서 요청해 주세요." }, 403);
  if (!request.headers.get("content-type")?.includes("application/json")) return reply({ error: "JSON 입력이 필요해요." }, 415);
  if (Number(request.headers.get("content-length") || 0) > 170_000) return reply({ error: "입력이 너무 길어요." }, 413);

  let input: AnalyzeInput;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 170_000) return reply({ error: "입력이 너무 길어요." }, 413);
    input = analyzeInputSchema.parse(JSON.parse(raw));
  } catch (error) {
    return reply({ error: error instanceof z.ZodError ? error.issues[0]?.message || "입력 내용을 확인해 주세요." : "입력 내용을 읽지 못했어요." }, 400);
  }

  const openAIKey = process.env.OPENAI_API_KEY?.trim();
  if (!openAIKey) return reply({ error: "AI 분석 설정이 아직 연결되지 않았어요. Vercel에 OPENAI_API_KEY를 설정해 주세요." }, 503);
  const canonicalJobUrl = input.job.sourceUrl ? normalizeWantedJobUrl(input.job.sourceUrl) : null;
  if (!canonicalJobUrl || canonicalJobUrl !== input.job.sourceUrl || input.job.userEdited) {
    return reply({ error: "공고를 다시 확인한 뒤 분석해 주세요." }, 400);
  }
  if (!verifyJobProof(request.headers.get("x-knowboth-job-proof"), input.job, openAIKey)) {
    return reply({ code: "JOB_PROOF_INVALID", error: "공고 확인 정보가 만료되었거나 일치하지 않아요. 공고를 다시 확인해 주세요." }, 401);
  }

  const deadline = AbortSignal.timeout(110_000);
  let activeSignal = AbortSignal.any([request.signal, deadline, AbortSignal.timeout(55_000)]);
  try {
    const research = input.companyResolution === "skip_financials"
      ? skippedResearch(input)
      : await regenerateUpToThreeTimes(() => researchCompany(input.job, activeSignal, input.companyHint), activeSignal);
    if (input.companyResolution === "auto" && research.identity.status === "ambiguous" && research.identity.candidates.length > 0) {
      return reply({
        type: "needs_company",
        message: "같은 이름의 기업이 있어요. 실제 지원할 법인을 선택해 주세요.",
        candidates: research.identity.candidates.map(candidate => ({
          displayName: candidate.displayName,
          legalName: candidate.legalName,
          website: candidate.website,
        })),
      });
    }
    if (input.companyResolution === "selected" && !selectedCompanyMatches(input, research)) {
      return reply({ error: "선택한 법인과 조사 결과가 일치하지 않아 매출 분석을 중단했어요. 회사명을 확인해 주세요." }, 409);
    }
    activeSignal = AbortSignal.any([request.signal, deadline, AbortSignal.timeout(50_000)]);
    const report = await regenerateUpToThreeTimes(async () => {
      const rawReport = await analyzeJob(input.job, input.profile, research, activeSignal);
      if (!rawReport || typeof rawReport !== "object") throw new OpenAIError("분석 보고서가 비어 있어요.", true);
      const normalized = {
        ...(rawReport as Record<string, unknown>),
        schemaVersion: "1.0",
        analysisId: crypto.randomUUID(),
        generatedAt: new Date().toISOString(),
        job: input.job,
        companyIdentity: {
          displayName: research.identity.displayName,
          legalName: research.identity.legalName,
          website: research.identity.website,
          corpCode: research.identity.corpCode,
          status: research.identity.status,
          evidenceSourceIds: research.identity.sourceIds,
          candidates: research.identity.candidates.map(candidate => ({
            displayName: candidate.displayName,
            legalName: candidate.legalName,
            website: candidate.website,
            evidenceSourceIds: candidate.sourceIds,
          })),
        },
        revenue: research.revenue,
      };
      return validateReportEvidence(reportSchema.parse(normalized), input);
    }, activeSignal);
    return reply({ report });
  } catch (error) {
    if (activeSignal.aborted || deadline.aborted || request.signal.aborted) return reply({ error: "분석 시간이 길어져 중단했어요. 입력은 그대로 두고 다시 시도해 주세요." }, 504);
    if (error instanceof z.ZodError) return reply({ error: "AI 결과의 근거 또는 형식을 검증하지 못했어요. 다시 시도해 주세요." }, 502);
    const message = error instanceof Error ? error.message : "";
    const publicMessage = [
      "OpenAI API 키를 확인해 주세요.",
      "AI 요청 한도에 도달했어요. 잠시 후 다시 시도해 주세요.",
      "설정한 AI 모델이 웹 검색과 구조화 출력을 지원하는지 확인해 주세요.",
      "AI 서비스에 일시적인 문제가 생겼어요. 잠시 후 다시 시도해 주세요.",
      "AI 응답이 완료되지 않았어요.",
      "AI가 이 입력을 분석할 수 없다고 응답했어요.",
      "기업 조사 결과를 읽지 못했어요.",
      "분석 보고서를 읽지 못했어요.",
      "분석 보고서가 비어 있어요.",
    ].find(allowed => message.startsWith(allowed));
    return reply({ error: publicMessage || "분석 중 문제가 생겼어요. 다시 시도해 주세요." }, 502);
  }
}
