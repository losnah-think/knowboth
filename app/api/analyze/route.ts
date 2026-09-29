import { z } from "zod";
import { analyze, CompanyMismatchError } from "@/lib/knowboth/analyze";
import { analyzeInputSchema } from "@/lib/knowboth/schema";
import { verifyJobProof } from "@/lib/knowboth/job-proof";
import { normalizeWantedJobUrl } from "@/lib/knowboth/wanted-url";
import { analyzeJob, researchCompany } from "@/lib/knowboth/openai";
import { AnalysisServiceError } from "@/lib/knowboth/analysis-contract";
import { errorReply, HttpError, jsonReply, readJson, requestLocale } from "@/lib/server/http";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return jsonReply(
    {
      available: Boolean(process.env.OPENAI_API_KEY?.trim()),
      modelConfigured: Boolean(process.env.OPENAI_MODEL?.trim()),
    },
    requestLocale(request),
  );
}

export async function POST(request: Request) {
  const locale = requestLocale(request);
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(110_000)]);
  try {
    const input = await readJson(request, analyzeInputSchema, 170_000, "invalid", signal);
    const key = process.env.OPENAI_API_KEY?.trim();
    if (!key) return errorReply("configuration", locale, 503);
    if (
      !input.job.sourceUrl ||
      normalizeWantedJobUrl(input.job.sourceUrl) !== input.job.sourceUrl ||
      input.job.userEdited
    ) {
      return errorReply("jobRequired", locale, 400);
    }
    if (!verifyJobProof(request.headers.get("x-knowboth-job-proof"), input.job, key)) {
      return errorReply("jobProof", locale, 401, { code: "JOB_PROOF_INVALID" });
    }
    return jsonReply(await analyze(input, signal, locale, { researchCompany, analyzeJob }), locale);
  } catch (error) {
    if (error instanceof HttpError) return errorReply(error.key, locale, error.status);
    if (
      signal.aborted ||
      (error instanceof DOMException && ["TimeoutError", "AbortError"].includes(error.name))
    )
      return errorReply("analysisTimeout", locale, 504);
    if (error instanceof CompanyMismatchError) return errorReply("companyMismatch", locale, 409);
    if (error instanceof z.ZodError) return errorReply("analysisInvalid", locale, 502);
    if (error instanceof AnalysisServiceError) {
      if (error.code === "rate_limit") return errorReply("rateLimit", locale, 502);
      if (["configuration", "credentials", "model"].includes(error.code))
        return errorReply("configuration", locale, 502);
      if (["invalid_research", "invalid_report", "incomplete"].includes(error.code))
        return errorReply("analysisInvalid", locale, 502);
    }
    return errorReply("analysisFailed", locale, 502);
  }
}
