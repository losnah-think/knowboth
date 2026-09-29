import test from "node:test";
import assert from "node:assert/strict";
import { messages } from "../lib/i18n/messages";
import { ApiRequestError, requestAnalysis, requestJob } from "../lib/knowboth/client-api";
import { readStoredHistory, storedAnalysis, writeStoredHistory } from "../lib/knowboth/history";
import { extractResumeText } from "../lib/knowboth/resume-file";
import { sampleReport } from "../lib/knowboth/sample-report";
import { reportSchema, type AnalyzeInput } from "../lib/knowboth/schema";

const historyKey = "knowboth.analysis-history.v1";
const jobUrl = "https://www.wanted.co.kr/wd/123";

function report(id = "analysis-1") {
  const value = sampleReport("en");
  return reportSchema.parse({
    ...value,
    analysisId: id,
    job: { ...value.job, sourceUrl: jobUrl },
  });
}

function memoryStorage(initial?: string, maxChars = Infinity): Storage {
  const values = new Map(initial === undefined ? [] : [[historyKey, initial]]);
  return {
    get length() {
      return values.size;
    },
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      if (value.length > maxChars) throw new DOMException("Storage full", "QuotaExceededError");
      values.set(key, value);
    },
    removeItem: (key) => void values.delete(key),
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
  };
}

const input: AnalyzeInput = {
  job: report().job,
  profile: null,
  companyHint: null,
  companyResolution: "auto",
};

test("history preserves report language and reads legacy records as Korean", () => {
  const english = storedAnalysis(report("english"), jobUrl, "en");
  const korean = storedAnalysis(report("korean"), jobUrl, "ko");
  const { locale: _locale, ...legacy } = storedAnalysis(report("legacy"), jobUrl, "en");
  void _locale;
  const storage = memoryStorage(JSON.stringify([english, korean, legacy]));
  const restored = readStoredHistory(storage);
  assert.deepEqual(
    restored.map(({ id, locale }) => [id, locale]),
    [
      ["english", "en"],
      ["korean", "ko"],
      ["legacy", "ko"],
    ],
  );
  assert.equal(writeStoredHistory(restored, storage).persisted, true);
  assert.deepEqual(readStoredHistory(storage), restored);
});

test("history drops malformed and fictional reports and discards non-report private fields", () => {
  const value = report();
  const storage = memoryStorage(
    JSON.stringify([
      null,
      { report: { analysisId: "broken" } },
      storedAnalysis(sampleReport("en"), jobUrl, "en"),
      {
        ...storedAnalysis(value, jobUrl, "en"),
        profile: { experienceText: "PRIVATE-FULL-RESUME" },
        jobProof: "PRIVATE-JOB-PROOF",
        file: "PRIVATE-ORIGINAL-FILE",
      },
    ]),
  );
  const restored = readStoredHistory(storage);
  assert.equal(restored.length, 1);
  assert.deepEqual(restored[0].report, value);
  writeStoredHistory(restored, storage);
  const saved = storage.getItem(historyKey)!;
  assert.doesNotMatch(saved, /PRIVATE-(?:FULL-RESUME|JOB-PROOF|ORIGINAL-FILE)/);
  assert.ok(saved.includes(value.fitItems![0].profileQuote!), "Report evidence remains available");
  assert.deepEqual(readStoredHistory(memoryStorage("{broken")), []);
});

test("history retains newest records within count, serialized-size, and browser quotas", () => {
  const records = Array.from({ length: 12 }, (_, index) =>
    storedAnalysis(report(`analysis-${index}`), jobUrl, "en"),
  );
  const storage = memoryStorage();
  assert.deepEqual(
    writeStoredHistory(records, storage).records.map(({ id }) => id),
    records.slice(0, 10).map(({ id }) => id),
  );

  const largeReport = report();
  largeReport.sources.push(
    ...Array.from({ length: 90 }, (_, index) => ({
      ...largeReport.sources[0],
      id: `large-source-${index}`,
      excerpt: "x".repeat(4_000),
    })),
  );
  reportSchema.parse(largeReport);
  const largeRecords = Array.from({ length: 10 }, (_, index) =>
    storedAnalysis({ ...largeReport, analysisId: `large-${index}` }, jobUrl, "en"),
  );
  assert.ok(JSON.stringify(largeRecords).length > 2_000_000);
  const bounded = writeStoredHistory(largeRecords, storage);
  assert.ok(bounded.persisted && bounded.records.length > 0 && bounded.records.length < 10);
  assert.ok(storage.getItem(historyKey)!.length <= 2_000_000);
  assert.equal(bounded.records[0].id, "large-0");

  const oneRecordSize = JSON.stringify([records[0]]).length;
  const quotaStorage = memoryStorage(undefined, oneRecordSize + 10);
  const reduced = writeStoredHistory(records.slice(0, 2), quotaStorage);
  assert.equal(reduced.persisted, true);
  assert.deepEqual(reduced.records, [records[0]]);
  const blockedStorage = memoryStorage(JSON.stringify([records[1]]), 0);
  const blocked = writeStoredHistory([records[0]], blockedStorage);
  assert.equal(blocked.persisted, false);
  assert.deepEqual(blocked.records, [records[1]], "Failed writes retain the previous saved report");
  assert.equal(writeStoredHistory([], storage).persisted, true);
  assert.equal(storage.getItem(historyKey), null);
});

test("client API forwards the chosen locale, job proof, input, and cancellation signal", async (t) => {
  const controller = new AbortController();
  const complete = report();
  const requestSignals: AbortSignal[] = [];
  const fetch = t.mock.method(
    globalThis,
    "fetch",
    async (path: RequestInfo | URL, options?: RequestInit) => {
      const headers = new Headers(options?.headers);
      assert.equal(options?.method, "POST");
      assert.ok(options?.signal);
      requestSignals.push(options.signal);
      assert.equal(options.signal.aborted, false);
      assert.equal(headers.get("content-type"), "application/json");
      if (path === "/api/job") {
        assert.equal(headers.get("x-knowboth-locale"), "en");
        assert.equal(headers.has("x-knowboth-job-proof"), false);
        assert.deepEqual(JSON.parse(String(options?.body)), { url: jobUrl });
        return Response.json({ status: "ready", job: input.job, jobProof: "fixture-proof" });
      }
      assert.equal(path, "/api/analyze");
      assert.equal(headers.get("x-knowboth-locale"), "ko");
      assert.equal(headers.get("x-knowboth-job-proof"), "fixture-proof");
      assert.deepEqual(JSON.parse(String(options?.body)), input);
      return Response.json({ report: complete });
    },
  );
  assert.equal((await requestJob(jobUrl, "en", controller.signal)).jobProof, "fixture-proof");
  assert.deepEqual(await requestAnalysis(input, "fixture-proof", "ko", controller.signal), {
    report: complete,
  });
  assert.equal(fetch.mock.callCount(), 2);
  controller.abort();
  assert.ok(requestSignals.every((signal) => signal.aborted));
});

test("client API rejects malformed jobs, reports, and company-choice responses", async (t) => {
  let response: unknown;
  t.mock.method(globalThis, "fetch", async () => Response.json(response));
  const signal = new AbortController().signal;
  for (const body of [
    { status: "ready", job: {}, jobProof: "proof" },
    { status: "ready", job: input.job, jobProof: "" },
    { status: "ready", job: { ...input.job, sourceUrl: "javascript:alert(1)" }, jobProof: "proof" },
  ]) {
    response = body;
    await assert.rejects(requestJob(jobUrl, "en", signal), {
      name: "Error",
      message: messages.en.jobIncomplete,
    });
  }
  for (const body of [
    { report: { ...report(), summary: null } },
    { type: "needs_company", candidates: [] },
    { type: "needs_company", candidates: [{ legalName: "Example Ltd" }] },
    { type: "needs_company", candidates: [{ displayName: "Example", website: "not a URL" }] },
  ]) {
    response = body;
    await assert.rejects(requestAnalysis(input, "proof", "en", signal), {
      message: messages.en.reportInvalid,
    });
  }
  response = {
    type: "needs_company",
    candidates: [{ displayName: "Example", legalName: null, website: null }],
  };
  assert.deepEqual(await requestAnalysis(input, "proof", "en", signal), response);
});

test("client API retains the proof error code so the UI can request job verification", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json(
      { error: "Please verify the posting again.", code: "JOB_PROOF_INVALID" },
      { status: 401 },
    ),
  );
  await assert.rejects(
    requestAnalysis(input, "old-proof", "en", new AbortController().signal),
    (error: unknown) => error instanceof ApiRequestError && error.code === "JOB_PROOF_INVALID",
  );
});

test("résumé text extraction stays local and rejects unsupported, oversized, and empty files", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Unexpected outbound request");
  });
  assert.equal(
    await extractResumeText(
      new File(["  Built a prototype.\n사용자 인터뷰  "], "resume.TXT"),
      "en",
    ),
    "Built a prototype.\n사용자 인터뷰",
  );
  assert.equal(
    await extractResumeText(new File(["# Project\nInterviewed users."], "resume.md"), "ko"),
    "# Project\nInterviewed users.",
  );
  await assert.rejects(extractResumeText(new File(["content"], "resume.hwp"), "en"), {
    message: messages.en.fileUnsupported,
  });
  const oversized = new File(["content"], "resume.txt");
  Object.defineProperty(oversized, "size", { value: 8 * 1024 * 1024 + 1 });
  const read = t.mock.method(oversized, "arrayBuffer", async () => {
    throw new Error("Must reject before reading");
  });
  await assert.rejects(extractResumeText(oversized, "ko"), { message: messages.ko.fileTooLarge });
  assert.equal(read.mock.callCount(), 0);
  await assert.rejects(extractResumeText(new File([" \n "], "empty.txt"), "en"), {
    message: messages.en.fileEmpty,
  });
});
