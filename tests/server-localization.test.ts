import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { POST as analyze } from "../app/api/analyze/route";
import { POST as job } from "../app/api/job/route";
import { POST as recommendations } from "../app/api/recommendations/route";
import { analyzeJob, researchCompany } from "../lib/knowboth/openai";
import { createJobProof } from "../lib/knowboth/job-proof";
import { researchWantedJob } from "../lib/knowboth/job-research";
import type { JobInput } from "../lib/knowboth/schema";
import { readJson } from "../lib/server/http";

function interruptedJson(signal: AbortSignal) {
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"status":'));
        signal.addEventListener("abort", () => controller.error(signal.reason), { once: true });
      },
    }),
    { headers: { "Content-Type": "application/json" } },
  );
}

for (const stage of [55_000, 50_000]) {
  test(`analysis preserves the ${stage}ms stage timeout during response body parsing`, async (t) => {
    const oldKey = process.env.OPENAI_API_KEY;
    const secret = "mock-only-key";
    process.env.OPENAI_API_KEY = secret;
    t.after(() => {
      if (oldKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = oldKey;
    });
    const originalTimeout = AbortSignal.timeout;
    t.mock.method(AbortSignal, "timeout", (ms: number) => {
      if (ms !== stage) return originalTimeout(ms);
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(new DOMException("Stage deadline", "TimeoutError")),
        5,
      );
      t.after(() => clearTimeout(timer));
      return controller.signal;
    });
    let calls = 0;
    t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
      calls += 1;
      return interruptedJson(init.signal!);
    });
    const inputJob: JobInput = {
      id: "timeout-review",
      sourceUrl: "https://www.wanted.co.kr/wd/123",
      inputMethod: "ai_research",
      companyDisplayName: "검증회사",
      positionTitle: "개발자",
      rawText: "주요 업무: 서비스 개발과 운영. 자격 요건: 서비스 개발 경험.",
      collectedAt: "2026-09-29T00:00:00Z",
      userEdited: false,
    };
    const response = await analyze(
      new Request("https://knowboth.test/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-KnowBoth-Locale": "en",
          "X-KnowBoth-Job-Proof": createJobProof(inputJob, secret),
        },
        body: JSON.stringify({
          job: inputJob,
          profile: null,
          companyHint: null,
          companyResolution: stage === 55_000 ? "auto" : "skip_financials",
        }),
      }),
    );
    assert.equal(response.status, 504);
    assert.match((await response.json()).error, /timed out/);
    assert.equal(calls, 1);
  });
}

test("job research preserves cancellation during response body parsing", async (t) => {
  const oldKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "mock-only-key";
  const controller = new AbortController();
  const reason = new DOMException("Cancelled", "AbortError");
  let timer: ReturnType<typeof setTimeout>;
  t.after(() => {
    clearTimeout(timer);
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldKey;
  });
  t.mock.method(globalThis, "fetch", async (url: unknown, init: RequestInit) => {
    if (String(url).startsWith("https://www.wanted.co.kr/"))
      return new Response(null, { status: 404 });
    timer = setTimeout(() => controller.abort(reason), 5);
    return interruptedJson(init.signal!);
  });
  await assert.rejects(
    researchWantedJob("https://www.wanted.co.kr/wd/123", controller.signal),
    (error) => error === reason,
  );
});

for (const [name, handler, limit] of [
  ["job", job, 2_000],
  ["analyze", analyze, 170_000],
  ["recommendations", recommendations, 170_000],
] as const) {
  test(`${name} API localizes boundary errors and keeps the Korean fallback`, async () => {
    for (const locale of ["en", "ko", "unsupported", ""]) {
      const response = await handler(
        new Request(`https://knowboth.test/api/${name}`, {
          method: "POST",
          headers: { "Content-Type": "text/plain", "X-KnowBoth-Locale": locale },
          body: "{}",
        }),
      );
      assert.equal(response.status, 415);
      const body = await response.json();
      assert.equal(response.headers.get("content-language"), locale === "en" ? "en" : "ko");
      assert.equal(
        body.error,
        locale === "en" ? "The request must contain JSON." : "JSON 입력이 필요해요.",
      );
      assert.equal(response.headers.get("cache-control"), "no-store");
    }
  });

  test(`${name} API cancels an oversized streaming request without content-length`, async () => {
    let cancelled = false;
    let chunks = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        chunks += 1;
        controller.enqueue(new Uint8Array(limit + 1));
      },
      cancel() {
        cancelled = true;
      },
    });
    const request = new Request(`https://knowboth.test/api/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-KnowBoth-Locale": "en" },
      body: stream,
      duplex: "half",
    } as RequestInit);
    const response = await handler(request);
    assert.equal(response.status, 413);
    assert.equal((await response.json()).error, "The input is too long.");
    assert.equal(cancelled, true);
    assert.ok(chunks <= 2);
  });
}

test("HTTP body parsing honors the application deadline while waiting for input", async () => {
  const controller = new AbortController();
  let cancelled = false;
  const request = new Request("https://knowboth.test/api/job", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: new ReadableStream({
      start() {},
      cancel() {
        cancelled = true;
      },
    }),
    duplex: "half",
  } as RequestInit);
  const reading = readJson(request, z.object({}), 2_000, "invalid", controller.signal);
  controller.abort(new DOMException("Deadline exceeded", "TimeoutError"));
  await assert.rejects(
    reading,
    (error) => error instanceof DOMException && error.name === "TimeoutError",
  );
  assert.equal(cancelled, true);
});

test("company research and report generation request English while keeping evidence verbatim", async () => {
  const oldFetch = globalThis.fetch;
  const oldKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "mock-only-key";
  const bodies: Record<string, unknown>[] = [];
  const research = {
    identity: {
      displayName: "원문 회사",
      legalName: null,
      website: null,
      corpCode: null,
      status: "unresolved",
      note: "Unresolved.",
      sourceIds: [],
      candidates: [],
    },
    sources: [],
    companyClaims: [],
    businessChanges: [],
    revenue: { status: "not_found", selected: null, observations: [], reason: null },
    warnings: [],
  };
  const inputJob = {
    companyDisplayName: "원문 회사",
    positionTitle: "개발자",
    sourceUrl: "https://www.wanted.co.kr/wd/123",
    inputMethod: "ai_research" as const,
    rawText: "원문의 근거를 그대로 보존합니다.",
  };
  globalThis.fetch = async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return Response.json({
      status: "completed",
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: JSON.stringify(
                bodies.length === 1 ? research : { summary: "English summary." },
              ),
            },
          ],
        },
      ],
    });
  };
  try {
    const verified = await researchCompany(inputJob, new AbortController().signal, null, "en");
    assert.equal(verified.revenue.reason, "No verifiable revenue source was found.");
    await analyzeJob(inputJob, null, verified, new AbortController().signal, "en");
    for (const body of bodies) {
      assert.match(String(body.instructions), /in English/);
      assert.match(String(body.instructions), /Never translate or paraphrase quotations/);
      assert.ok(String(body.input).includes(inputJob.rawText));
      assert.equal(body.store, false);
    }
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldKey;
  }
});
