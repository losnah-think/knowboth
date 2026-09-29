import { z } from "zod";
import { jobInputSchema, profileInputSchema } from "@/lib/knowboth/schema";
import { verifyJobProof } from "@/lib/knowboth/job-proof";
import { wantedPostingUrl } from "@/lib/knowboth/recommendation-core";
import { RecommendationError, recommendWantedJobs } from "@/lib/knowboth/recommendations";
import { errorReply, HttpError, jsonReply, readJson, requestLocale } from "@/lib/server/http";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";
const inputSchema = z.object({ job: jobInputSchema, profile: profileInputSchema }).strict();

export async function POST(request: Request) {
  const locale = requestLocale(request);
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(110_000)]);
  try {
    const input = await readJson(request, inputSchema, 170_000, "recommendationsInvalid", signal);
    const key = process.env.OPENAI_API_KEY?.trim();
    if (!key) return errorReply("configuration", locale, 503, { retryable: false });
    if (
      !input.job.sourceUrl ||
      input.job.userEdited ||
      wantedPostingUrl(input.job.sourceUrl) !== input.job.sourceUrl
    )
      return errorReply("jobRequired", locale, 400);
    if (!verifyJobProof(request.headers.get("x-knowboth-job-proof"), input.job, key)) {
      return errorReply("jobProof", locale, 401, { code: "JOB_PROOF_INVALID", retryable: false });
    }
    const result = await recommendWantedJobs(input.job, input.profile, signal, {
      apiKey: key,
      model: process.env.OPENAI_MODEL?.trim() || "gpt-5.6-luna",
      locale,
    });
    return jsonReply(result, locale);
  } catch (error) {
    if (error instanceof HttpError) return errorReply(error.key, locale, error.status);
    if (signal.aborted || (error instanceof RecommendationError && error.code === "timeout"))
      return errorReply("recommendationsTimeout", locale, 504, { retryable: true });
    if (error instanceof RecommendationError && error.code === "configuration")
      return errorReply("recommendationsConfiguration", locale, 503, { retryable: false });
    if (error instanceof RecommendationError && error.code === "rate_limit")
      return errorReply("rateLimit", locale, 429, { retryable: true });
    return errorReply("recommendationsFailed", locale, 502, { retryable: true });
  }
}
