import test from "node:test";
import assert from "node:assert/strict";
import {
  hasRequestedPostingSource,
  JobResearchError,
  normalizeWantedJobUrl,
  researchWantedJob,
  visibleWantedPageText,
} from "../lib/knowboth/job-research";

const wantedUrl = "https://www.wanted.co.kr/wd/103227";
const company = "안티그래비티";
const position = "백엔드 개발자";
const responsibility = "서비스 백엔드 API를 개발하고 운영합니다.";
const requirement = "백엔드 서비스 개발 경험이 필요합니다.";

function pageHtml(extra = "") {
  return `<!doctype html><html><head><script>숨겨진 가짜 회사</script></head><body>
    <main><h1>${position}</h1><h2>${company}</h2>
    <section><h3>주요업무</h3><p>${responsibility}</p></section>
    <section><h3>자격요건</h3><p>${requirement}</p></section>${extra}</main>
  </body></html>`;
}

function openAIResponse(options: { sourceUrl?: string; overrides?: Record<string, unknown> } = {}) {
  return new Response(JSON.stringify({
    status: "completed",
    output: [
      {
        type: "web_search_call",
        status: "completed",
        action: options.sourceUrl ? { sources: [{ url: options.sourceUrl }] } : undefined,
      },
      {
        type: "message",
        content: [{
          type: "output_text",
          text: JSON.stringify({
            postingId: "103227",
            companyDisplayName: company,
            positionTitle: position,
            responsibilities: [responsibility],
            requirements: [requirement],
            preferredQualifications: [],
            otherDetails: [],
            ...options.overrides,
          }),
        }],
      },
    ],
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

function isWantedRequest(input: string | URL | Request) {
  return String(input instanceof Request ? input.url : input).startsWith("https://www.wanted.co.kr/wd/");
}

function restoreKey(value: string | undefined) {
  if (value === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = value;
}

test("normalizes only credential-free Wanted job URLs", () => {
  assert.equal(normalizeWantedJobUrl("https://www.wanted.co.kr/wd/123?utm_source=test#top"), "https://www.wanted.co.kr/wd/123");
  assert.equal(normalizeWantedJobUrl("https://www.wanted.co.kr/wd/123/"), "https://www.wanted.co.kr/wd/123");
  assert.equal(normalizeWantedJobUrl("https://wanted.co.kr/wd/123"), null);
  assert.equal(normalizeWantedJobUrl("https://www.wanted.co.kr/wd/0"), null);
  assert.equal(normalizeWantedJobUrl("https://user:pass@www.wanted.co.kr/wd/123"), null);
});

test("rejects a noncanonical URL before making an outbound request", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("unexpected fetch");
  };
  try {
    await assert.rejects(
      researchWantedJob("https://www.wanted.co.kr/wd/103227?next=https://attacker.example", AbortSignal.timeout(1_000)),
      error => error instanceof JobResearchError && error.code === "not_found",
    );
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    restoreKey(originalKey);
  }
});

test("requires a consulted source for the exact requested posting", () => {
  const requested = "https://www.wanted.co.kr/wd/123";
  assert.equal(hasRequestedPostingSource(requested, ["https://wanted.co.kr/wd/123?source=search"]), true);
  assert.equal(hasRequestedPostingSource(requested, ["https://www.wanted.co.kr/wd/124"]), false);
  assert.equal(hasRequestedPostingSource(requested, ["https://attacker.example/wd/123"]), false);
});

test("normalizes only visible Wanted page text", () => {
  const text = visibleWantedPageText("<script>가짜 회사</script><h1>백엔드&nbsp;개발자</h1><p>R&amp;D &#xAC1C;&#48156;</p>");
  assert.equal(text, "백엔드 개발자 R&D 개발");
});

test("accepts exact fields supported by the first-party Wanted page", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  globalThis.fetch = async input => isWantedRequest(input)
    ? new Response(pageHtml(), { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } })
    : openAIResponse();
  try {
    const job = await researchWantedJob(wantedUrl, AbortSignal.timeout(1_000));
    assert.equal(job.inputMethod, "ai_research");
    assert.equal(job.companyDisplayName, company);
  } finally {
    globalThis.fetch = originalFetch;
    restoreKey(originalKey);
  }
});

test("filters unsupported AI bullets when direct Wanted HTML is available", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  globalThis.fetch = async input => isWantedRequest(input)
    ? new Response(pageHtml(), { status: 200, headers: { "Content-Type": "text/html" } })
    : openAIResponse({
      overrides: {
        responsibilities: [responsibility, "실제로 없는 업무를 수행합니다."],
        requirements: [requirement, "실제로 없는 자격이 필요합니다."],
      },
    });
  try {
    const job = await researchWantedJob(wantedUrl, AbortSignal.timeout(1_000));
    assert.match(job.rawText, new RegExp(responsibility.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(job.rawText, /실제로 없는/);
  } finally {
    globalThis.fetch = originalFetch;
    restoreKey(originalKey);
  }
});

test("accepts an exact provider citation when the direct page is unavailable", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  globalThis.fetch = async input => isWantedRequest(input)
    ? new Response("blocked", { status: 403, headers: { "Content-Type": "text/plain" } })
    : openAIResponse({ sourceUrl: `${wantedUrl}?source=search` });
  try {
    const job = await researchWantedJob(wantedUrl, AbortSignal.timeout(1_000));
    assert.equal(job.companyDisplayName, company);
  } finally {
    globalThis.fetch = originalFetch;
    restoreKey(originalKey);
  }
});

test("rejects completed searches without an exact citation or direct verification", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  globalThis.fetch = async input => isWantedRequest(input)
    ? new Response("blocked", { status: 403, headers: { "Content-Type": "text/plain" } })
    : openAIResponse();
  try {
    await assert.rejects(
      researchWantedJob(wantedUrl, AbortSignal.timeout(1_000)),
      error => error instanceof JobResearchError && error.code === "not_found",
    );
  } finally {
    globalThis.fetch = originalFetch;
    restoreKey(originalKey);
  }
});

test("rejects inaccessible postings expressed as non-empty placeholders", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  globalThis.fetch = async input => isWantedRequest(input)
    ? new Response("blocked", { status: 403, headers: { "Content-Type": "text/plain" } })
    : openAIResponse({
      sourceUrl: wantedUrl,
      overrides: {
        companyDisplayName: "알 수 없음",
        positionTitle: "알 수 없음",
        responsibilities: ["주요 업무를 확인할 수 없습니다."],
        requirements: ["자격요건을 확인할 수 없습니다."],
        otherDetails: ["공고 페이지에 접근할 수 없습니다."],
      },
    });
  try {
    await assert.rejects(
      researchWantedJob(wantedUrl, AbortSignal.timeout(1_000)),
      error => error instanceof JobResearchError && error.code === "not_found",
    );
  } finally {
    globalThis.fetch = originalFetch;
    restoreKey(originalKey);
  }
});

test("rejects natural-language unavailable sections even with an exact provider citation", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  globalThis.fetch = async input => isWantedRequest(input)
    ? new Response("blocked", { status: 403, headers: { "Content-Type": "text/plain" } })
    : openAIResponse({
      sourceUrl: wantedUrl,
      overrides: {
        responsibilities: ["주요 업무를 확인하지 못했습니다."],
        requirements: ["자격요건을 찾지 못했습니다."],
      },
    });
  try {
    await assert.rejects(
      researchWantedJob(wantedUrl, AbortSignal.timeout(1_000)),
      error => error instanceof JobResearchError && error.code === "not_found",
    );
  } finally {
    globalThis.fetch = originalFetch;
    restoreKey(originalKey);
  }
});
