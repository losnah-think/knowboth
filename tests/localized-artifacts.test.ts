import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { reportSchema } from "../lib/knowboth/schema";
import { isGroundedQuote } from "../lib/knowboth/evidence";
import { buildReportPdf } from "../lib/knowboth/pdf";
import { sampleReport, SAMPLE_PROFILE } from "../lib/knowboth/sample-report";

for (const locale of ["ko", "en"] as const) {
  test(`${locale} sample is valid and every evidence quote matches its fictional source`, () => {
    const report = reportSchema.parse(sampleReport(locale));
    const profile = report.sources.find((source) => source.id === "sample-profile")!.excerpt!;
    for (const requirement of report.requirements) {
      assert.ok(isGroundedQuote(requirement.jobQuote, report.job.rawText));
    }
    for (const item of [...(report.fitItems ?? []), ...report.actions]) {
      if (item.profileQuote) assert.ok(isGroundedQuote(item.profileQuote, profile));
    }
    if (locale === "en") assert.equal(/[가-힣]/.test(JSON.stringify(report)), false);
    else assert.equal(profile, SAMPLE_PROFILE);
  });

  test(`${locale} PDF contains localized headings, real text, and page numbers`, async () => {
    const [regular, bold] = await Promise.all([
      readFile("public/fonts/NanumGothic-Regular.ttf"),
      readFile("public/fonts/NanumGothic-Bold.ttf"),
    ]);
    const report = sampleReport(locale);
    report.generatedAt = "2026-09-29T12:00:00+09:00";
    const observation = {
      entityName: report.job.companyDisplayName,
      amountDecimal: "12000000000",
      currency: "KRW",
      periodStart: "2025-01-01",
      periodEnd: "2025-12-31",
      periodType: "annual" as const,
      accountingScope: "separate" as const,
      accountLabel: locale === "en" ? "Revenue" : "매출액",
      sourceIds: ["sample-job"],
      disclosureId: null,
    };
    report.revenue = {
      status: "available",
      selected: observation,
      observations: [observation],
      reason: null,
    };
    const bytes = await buildReportPdf(report, { regular, bold }, locale);
    assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
    const loading = getDocument({ data: bytes, useSystemFonts: true });
    const document = await loading.promise;
    try {
      const pages: string[] = [];
      for (let number = 1; number <= document.numPages; number++) {
        const page = await document.getPage(number);
        const content = await page.getTextContent();
        const text = content.items.flatMap((item) => ("str" in item ? [item.str] : [])).join(" ");
        assert.ok(text.includes(`${number} / ${document.numPages}`));
        pages.push(text);
      }
      const content = pages.join("\n");
      for (const heading of locale === "en"
        ? [
            "The company",
            "Why this role exists",
            "Your experience",
            "Application preparation",
            "Sources",
            "Fictional example",
          ]
        : ["기업 이해", "채용 배경", "나와 비교", "지원 준비", "출처", "가상 예시"]) {
        assert.ok(content.includes(heading), `Missing PDF heading: ${heading}`);
      }
      assert.ok(content.includes(locale === "en" ? "KRW 12,000,000,000" : "120억 원"));
      assert.ok(content.includes(locale === "en" ? "September 29, 2026" : "2026년 9월 29일"));
      if (locale === "en") assert.equal(/[가-힣]/.test(content), false);
    } finally {
      await loading.destroy();
    }
  });
}
