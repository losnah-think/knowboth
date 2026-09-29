import test from "node:test";
import assert from "node:assert/strict";
import { analyze } from "../lib/knowboth/analyze";
import { AnalysisServiceError, type AnalysisServices } from "../lib/knowboth/analysis-contract";
import { sampleReport } from "../lib/knowboth/sample-report";
import type { AnalyzeInput } from "../lib/knowboth/schema";

test("analysis runs with injected functions, retries recoverable failures and verifies their output", async () => {
  const fixture = sampleReport("en");
  const input: AnalyzeInput = {
    job: fixture.job,
    profile: null,
    companyHint: null,
    companyResolution: "skip_financials",
  };
  let calls = 0;
  const services: AnalysisServices = {
    researchCompany: async () => {
      throw new Error("Research must be skipped");
    },
    analyzeJob: async (job, profile, research, signal, locale) => {
      assert.equal(job, input.job);
      assert.equal(profile, null);
      assert.equal(research.revenue.status, "skipped");
      assert.equal(locale, "en");
      assert.equal(signal.aborted, false);
      if (++calls === 1) throw new AnalysisServiceError("upstream", true);
      return {
        ...fixture,
        job: { ...fixture.job, companyDisplayName: "Incorrect model value" },
        requirements: [{ ...fixture.requirements[0], jobQuote: "An invented requirement" }],
      };
    },
  };
  const result = await analyze(input, new AbortController().signal, "en", services);
  assert.ok(result.report);
  assert.equal(calls, 2);
  assert.deepEqual(result.report.job, input.job);
  assert.equal(result.report.requirements.length, 0);
  assert.equal(result.report.revenue.status, "skipped");
  assert.equal(result.report.fitItems, null);
  assert.ok(result.report.warnings.some((warning) => warning.includes("quotation does not match")));
});
