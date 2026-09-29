import { z } from "zod";
import type { Locale } from "../i18n/locale";
import { retry } from "../server/retry";
import { validateReportEvidence } from "./evidence";
import {
  AnalysisServiceError,
  type AnalysisServices,
  type CompanyResearch,
} from "./analysis-contract";
import { reportSchema, type AnalyzeInput } from "./schema";

export class CompanyMismatchError extends Error {
  constructor() {
    super("company_mismatch");
    this.name = "CompanyMismatchError";
  }
}

function normalizedCompanyName(value: string | null) {
  return (value || "")
    .toLocaleLowerCase("ko-KR")
    .replace(/주식회사|\(주\)|㈜|[^a-z0-9가-힣]/gu, "");
}

function selectedCompanyMatches(input: AnalyzeInput, research: CompanyResearch) {
  if (!input.companyHint || research.identity.status !== "matched") return false;
  const expected = normalizedCompanyName(input.companyHint.legalName);
  if (
    expected &&
    [research.identity.legalName, research.identity.displayName]
      .map(normalizedCompanyName)
      .includes(expected)
  )
    return true;
  if (!input.companyHint.website || !research.identity.website) return false;
  try {
    return (
      new URL(input.companyHint.website).hostname === new URL(research.identity.website).hostname
    );
  } catch {
    return false;
  }
}

function skippedResearch(input: AnalyzeInput, locale: Locale): CompanyResearch {
  const reason =
    locale === "en"
      ? "Company financial research was skipped at your request."
      : "사용자가 기업 재무 조사를 생략했습니다.";
  return {
    identity: {
      displayName: input.job.companyDisplayName,
      legalName: input.companyHint?.legalName || null,
      website: input.companyHint?.website || null,
      corpCode: null,
      status: "unresolved",
      note: reason,
      sourceIds: [],
      candidates: [],
    },
    sources: [],
    companyClaims: [],
    businessChanges: [],
    revenue: { status: "skipped", selected: null, observations: [], reason },
    warnings: [
      locale === "en"
        ? "Only the job posting was analyzed; external company research was skipped."
        : "기업 외부 자료 조사를 생략해 공고에 적힌 내용만 분석했습니다.",
    ],
  };
}

const retryable = (error: unknown) =>
  error instanceof AnalysisServiceError ? error.retryable : error instanceof z.ZodError;

/** Application workflow: research, resolve identity, generate and verify evidence. */
export async function analyze(
  input: AnalyzeInput,
  signal: AbortSignal,
  locale: Locale,
  services: AnalysisServices,
) {
  const researchSignal = AbortSignal.any([signal, AbortSignal.timeout(55_000)]);
  const research =
    input.companyResolution === "skip_financials"
      ? skippedResearch(input, locale)
      : await retry(
          () => services.researchCompany(input.job, researchSignal, input.companyHint, locale),
          retryable,
          researchSignal,
        );
  if (
    input.companyResolution === "auto" &&
    research.identity.status === "ambiguous" &&
    research.identity.candidates.length > 0
  ) {
    return {
      type: "needs_company" as const,
      message:
        locale === "en"
          ? "Several companies share this name. Select the legal entity you are applying to."
          : "같은 이름의 기업이 있어요. 실제 지원할 법인을 선택해 주세요.",
      candidates: research.identity.candidates.map(({ displayName, legalName, website }) => ({
        displayName,
        legalName,
        website,
      })),
    };
  }
  if (input.companyResolution === "selected" && !selectedCompanyMatches(input, research))
    throw new CompanyMismatchError();
  const analysisSignal = AbortSignal.any([signal, AbortSignal.timeout(50_000)]);
  const report = await retry(
    async () => {
      const rawReport = await services.analyzeJob(
        input.job,
        input.profile,
        research,
        analysisSignal,
        locale,
      );
      if (!rawReport || typeof rawReport !== "object")
        throw new AnalysisServiceError("invalid_report", true);
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
          candidates: research.identity.candidates.map((candidate) => ({
            displayName: candidate.displayName,
            legalName: candidate.legalName,
            website: candidate.website,
            evidenceSourceIds: candidate.sourceIds,
          })),
        },
        revenue: research.revenue,
      };
      return validateReportEvidence(reportSchema.parse(normalized), input, locale);
    },
    retryable,
    analysisSignal,
  );
  return { report };
}
