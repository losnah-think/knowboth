import { z } from "zod";
import {
  httpUrlSchema,
  jobInputSchema,
  reportSchema,
  type AnalyzeInput,
  type JobInput,
} from "./schema";
import { messages } from "../i18n/messages";
import type { RecommendationProfile } from "./recommendation-core";
import type { Locale } from "../i18n/locale";

const jobResponseSchema = z.object({
  status: z.literal("ready"),
  job: jobInputSchema,
  jobProof: z.string().min(1),
});
const companyChoiceSchema = z.object({
  legalName: z.string().min(1).max(200).nullable().optional(),
  displayName: z.string().min(1).max(200),
  website: httpUrlSchema.nullable().optional(),
});
const analysisResponseSchema = z.union([
  z.object({ report: reportSchema }),
  z.object({
    type: z.literal("needs_company"),
    candidates: z.array(companyChoiceSchema).min(1).max(10),
    message: z.string().optional(),
  }),
]);
export type CompanyCandidate = z.infer<typeof companyChoiceSchema>;

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message);
  }
}

async function requestJson(
  path: string,
  body: unknown,
  locale: Locale,
  signal: AbortSignal,
  fallback: string,
  proof?: string,
): Promise<unknown> {
  const response = await fetch(path, {
    method: "POST",
    signal: AbortSignal.any([signal, AbortSignal.timeout(path === "/api/job" ? 60_000 : 120_000)]),
    headers: {
      "Content-Type": "application/json",
      "X-KnowBoth-Locale": locale,
      ...(proof ? { "X-KnowBoth-Job-Proof": proof } : {}),
    },
    body: JSON.stringify(body),
  });
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = z.object({ error: z.string(), code: z.string().optional() }).safeParse(result);
    throw new ApiRequestError(
      parsed.success ? parsed.data.error : fallback,
      parsed.success ? parsed.data.code : undefined,
    );
  }
  return result;
}

export async function requestJob(url: string, locale: Locale, signal: AbortSignal) {
  const result = await requestJson("/api/job", { url }, locale, signal, messages[locale].jobFailed);
  const parsed = jobResponseSchema.safeParse(result);
  if (!parsed.success) throw new ApiRequestError(messages[locale].jobIncomplete);
  return parsed.data;
}

export async function requestAnalysis(
  input: AnalyzeInput,
  proof: string,
  locale: Locale,
  signal: AbortSignal,
) {
  const result = await requestJson(
    "/api/analyze",
    input,
    locale,
    signal,
    messages[locale].analysisFailed,
    proof,
  );
  const parsed = analysisResponseSchema.safeParse(result);
  if (!parsed.success) throw new ApiRequestError(messages[locale].reportInvalid);
  return parsed.data;
}

export type RecommendationContext = {
  analysisId: string;
  job: JobInput;
  profile: RecommendationProfile | null;
  jobProof: string;
};
