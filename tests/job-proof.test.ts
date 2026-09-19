import test from "node:test";
import assert from "node:assert/strict";
import { createJobProof, verifyJobProof } from "../lib/knowboth/job-proof";
import type { JobInput } from "../lib/knowboth/schema";
import { POST as researchJob } from "../app/api/job/route";
import { POST as analyzeJob } from "../app/api/analyze/route";

const secret = "test-openai-key";
const job: JobInput = {
  id: "job-proof-test",
  sourceUrl: "https://www.wanted.co.kr/wd/103227",
  inputMethod: "ai_research",
  companyDisplayName: "안티그래비티",
  positionTitle: "백엔드 개발자",
  rawText: "주요 업무:\n- 서비스 백엔드 API를 개발하고 운영합니다.\n\n자격 요건:\n- 백엔드 서비스 개발 경험이 필요합니다.",
  collectedAt: "2026-09-19T10:00:00+09:00",
  userEdited: false,
};

const wantedPageHtml = `<!doctype html><html><body><main>
  <h1>${job.positionTitle}</h1><h2>${job.companyDisplayName}</h2>
  <section><h3>주요업무</h3><p>서비스 백엔드 API를 개발하고 운영합니다.</p></section>
  <section><h3>자격요건</h3><p>백엔드 서비스 개발 경험이 필요합니다.</p></section>
</main></body></html>`;

function isWantedRequest(input: string | URL | Request) {
  return String(input instanceof Request ? input.url : input).startsWith("https://www.wanted.co.kr/wd/");
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test("job proof binds every server-researched job field", () => {
  const proof = createJobProof(job, secret);
  assert.equal(verifyJobProof(proof, job, secret), true);
  assert.equal(verifyJobProof(proof, { ...job, companyDisplayName: "다른 회사" }, secret), false);
  assert.equal(verifyJobProof(proof, { ...job, rawText: `${job.rawText}\n임의 내용` }, secret), false);
  assert.equal(verifyJobProof(proof, job, "different-key"), false);
  assert.equal(verifyJobProof("v1.invalid", job, secret), false);
});

test("job API returns a verifiable proof with the researched job", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  const originalVercel = process.env.VERCEL;
  process.env.OPENAI_API_KEY = secret;
  process.env.VERCEL = "1";
  globalThis.fetch = async input => isWantedRequest(input)
    ? new Response(wantedPageHtml, { status: 200, headers: { "Content-Type": "text/html" } })
    : new Response(JSON.stringify({
      status: "completed",
      output: [
        { type: "web_search_call", status: "completed" },
        { type: "message", content: [{ type: "output_text", text: JSON.stringify({
          postingId: "103227",
          companyDisplayName: job.companyDisplayName,
          positionTitle: job.positionTitle,
          responsibilities: ["서비스 백엔드 API를 개발하고 운영합니다."],
          requirements: ["백엔드 서비스 개발 경험이 필요합니다."],
          preferredQualifications: [],
          otherDetails: [],
        }) }] },
      ],
    }), { status: 200, headers: { "Content-Type": "application/json" } });

  try {
    const response = await researchJob(new Request("http://localhost/api/job", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: job.sourceUrl }),
    }));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(typeof body.jobProof, "string");
    assert.equal(verifyJobProof(body.jobProof, body.job, secret), true);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv("OPENAI_API_KEY", originalKey);
    restoreEnv("VERCEL", originalVercel);
  }
});

test("job API retries one invalid model response before failing the request", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  const originalVercel = process.env.VERCEL;
  process.env.OPENAI_API_KEY = secret;
  process.env.VERCEL = "1";
  let openAICalls = 0;
  let wantedCalls = 0;
  globalThis.fetch = async input => {
    if (isWantedRequest(input)) {
      wantedCalls += 1;
      return new Response(wantedPageHtml, { status: 200, headers: { "Content-Type": "text/html" } });
    }
    openAICalls += 1;
    const valid = openAICalls === 2;
    return new Response(JSON.stringify({
      status: "completed",
      output: [
        { type: "web_search_call", status: "completed" },
        { type: "message", content: [{ type: "output_text", text: JSON.stringify({
          postingId: "103227",
          companyDisplayName: job.companyDisplayName,
          positionTitle: job.positionTitle,
          responsibilities: valid ? ["서비스 백엔드 API를 개발하고 운영합니다."] : [],
          requirements: valid ? ["백엔드 서비스 개발 경험이 필요합니다."] : [],
          preferredQualifications: [],
          otherDetails: [],
        }) }] },
      ],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  try {
    const response = await researchJob(new Request("http://localhost/api/job", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: job.sourceUrl }),
    }));
    assert.equal(response.status, 200);
    assert.equal(openAICalls, 2);
    assert.equal(wantedCalls, 2);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv("OPENAI_API_KEY", originalKey);
    restoreEnv("VERCEL", originalVercel);
  }
});

test("analyze API rejects missing, tampered, and browser-edited jobs before AI calls", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  const originalVercel = process.env.VERCEL;
  process.env.OPENAI_API_KEY = secret;
  process.env.VERCEL = "1";
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return new Response("{}", { status: 429, headers: { "Content-Type": "application/json" } });
  };

  const request = (candidate: JobInput, proof?: string) => analyzeJob(new Request("http://localhost/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(proof ? { "X-KnowBoth-Job-Proof": proof } : {}) },
    body: JSON.stringify({ job: candidate, profile: null, companyHint: null, companyResolution: "skip_financials" }),
  }));

  try {
    const proof = createJobProof(job, secret);
    const missingProof = await request(job);
    assert.equal(missingProof.status, 401);
    assert.equal((await missingProof.json()).code, "JOB_PROOF_INVALID");
    assert.equal((await request({ ...job, positionTitle: "임의 직무" }, proof)).status, 401);
    assert.equal((await request({ ...job, userEdited: true }, createJobProof({ ...job, userEdited: true }, secret))).status, 400);
    assert.equal((await request({ ...job, sourceUrl: null }, createJobProof({ ...job, sourceUrl: null }, secret))).status, 400);
    assert.equal(fetchCalls, 0);

    assert.equal((await request(job, proof)).status, 502);
    assert.equal(fetchCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv("OPENAI_API_KEY", originalKey);
    restoreEnv("VERCEL", originalVercel);
  }
});
