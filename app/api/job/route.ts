import { z } from "zod";
import { JobResearchError, researchWantedJobWithRetries } from "@/lib/knowboth/job-research";
import { createJobProof } from "@/lib/knowboth/job-proof";
import { extractWantedJobUrl } from "@/lib/knowboth/wanted-url";
import { resolveWantedJobUrl } from "@/lib/server/wanted-url";
import { errorReply, HttpError, jsonReply, readJson, requestLocale } from "@/lib/server/http";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const inputSchema = z.object({ url: z.string().trim().min(1).max(500) }).strict();

export async function POST(request: Request) {
  const locale = requestLocale(request);
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(50_000)]);
  try {
    const input = await readJson(request, inputSchema, 2_000, "jobUrl", signal);
    const inputUrl = extractWantedJobUrl(input.url);
    if (!inputUrl) return errorReply("jobUrl", locale, 400);
    const key = process.env.OPENAI_API_KEY?.trim();
    if (!key) return errorReply("configuration", locale, 503);
    const canonicalUrl = await resolveWantedJobUrl(inputUrl, signal);
    if (!canonicalUrl) return errorReply("shareLink", locale, 400, { retryable: false });
    const job = await researchWantedJobWithRetries(canonicalUrl, signal, locale);
    return jsonReply(
      { status: "ready", job, jobProof: createJobProof(job, key), message: null },
      locale,
    );
  } catch (error) {
    if (error instanceof HttpError) return errorReply(error.key, locale, error.status);
    if (
      signal.aborted ||
      (error instanceof DOMException && ["TimeoutError", "AbortError"].includes(error.name))
    )
      return errorReply("jobTimeout", locale, 504, { retryable: true });
    if (error instanceof JobResearchError) {
      if (error.code === "configuration")
        return errorReply("jobConfiguration", locale, 503, { retryable: false });
      if (error.code === "refusal")
        return errorReply("jobRefusal", locale, 502, { retryable: false });
      if (error.code === "rate_limit")
        return errorReply("rateLimit", locale, 429, { retryable: true });
      if (error.code === "not_found")
        return errorReply("jobNotFound", locale, 502, { retryable: true });
      if (error.code === "invalid_response")
        return errorReply("jobInvalid", locale, 502, { retryable: true });
    }
    return errorReply("jobUpstream", locale, 502, { retryable: true });
  }
}
