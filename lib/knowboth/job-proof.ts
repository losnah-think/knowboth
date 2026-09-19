import { createHmac, timingSafeEqual } from "node:crypto";
import type { JobInput } from "./schema";

const KEY_DOMAIN = "knowboth/job-proof/key/v1";
const PAYLOAD_DOMAIN = "knowboth/job-proof/payload/v1";

function signingKey(serverSecret: string) {
  if (!serverSecret) throw new Error("Job proof secret is required.");
  return createHmac("sha256", serverSecret).update(KEY_DOMAIN).digest();
}

function canonicalJob(job: JobInput) {
  return JSON.stringify({
    id: job.id,
    sourceUrl: job.sourceUrl,
    inputMethod: job.inputMethod,
    companyDisplayName: job.companyDisplayName,
    positionTitle: job.positionTitle,
    rawText: job.rawText,
    collectedAt: job.collectedAt,
    userEdited: job.userEdited,
  });
}

function signature(job: JobInput, serverSecret: string) {
  return createHmac("sha256", signingKey(serverSecret))
    .update(PAYLOAD_DOMAIN)
    .update("\0")
    .update(canonicalJob(job))
    .digest();
}

export function createJobProof(job: JobInput, serverSecret: string) {
  return `v1.${signature(job, serverSecret).toString("base64url")}`;
}

export function verifyJobProof(proof: string | null, job: JobInput, serverSecret: string) {
  const match = proof?.match(/^v1\.([A-Za-z0-9_-]{43})$/);
  if (!match || !serverSecret) return false;
  const provided = Buffer.from(match[1], "base64url");
  const expected = signature(job, serverSecret);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
