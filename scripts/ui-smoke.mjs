import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { build } from "esbuild";
import { chromium } from "playwright";

// All API responses are fictional and intercepted. This check never uses paid APIs.
await mkdir("work/ui", { recursive: true });
await build({
  stdin: {
    contents: `export { sampleReport } from './lib/knowboth/sample-report';
      export { messages } from './lib/i18n/messages';
      export { recommendationMessages } from './lib/i18n/recommendations';`,
    resolveDir: process.cwd(),
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: "work/ui-fixtures.mjs",
});
const { sampleReport, messages, recommendationMessages } = await import(
  pathToFileURL(resolve("work/ui-fixtures.mjs")).href
);
const port = process.env.UI_SMOKE_PORT || "3100";
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", port], {
  stdio: "inherit",
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
});
let browser;
try {
  let ready = false;
  for (let tries = 0; tries < 60; tries++) {
    try {
      if ((await fetch(origin)).ok) {
        ready = true;
        break;
      }
    } catch {
      /* Wait for startup. */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.ok(ready, "The built production server should start");
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(15_000);
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const calls = [];
  const routes = [];
  const pendingRecommendations = [];
  const pendingAnalyses = [];
  let recommendationMode = "error";
  let analysisMode = "ready";
  let lastProfile = null;
  let analysisNumber = 0;
  const profile = sampleReport("en").sources.find(
    (source) => source.id === "sample-profile",
  ).excerpt;
  const privateMarker = "PRIVATE RESUME INPUT: do not retain the complete original.";
  const experience = `${profile}\n${privateMarker}`;
  const preference = "Fully remote work";
  const jobUrl = "https://www.wanted.co.kr/wd/100";
  const counts = (endpoint) => calls.filter((call) => call.endpoint === endpoint).length;
  const button = (key, locale = "en") =>
    page.getByRole("button", { name: messages[locale][key], exact: true });
  const recommendationButton = (key, locale = "en") =>
    page.getByRole("button", { name: recommendationMessages[locale][key], exact: true });
  const recommendationSection = page.locator('section[aria-labelledby="recommendations-title"]');
  const settle = () =>
    page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
  const noOverflow = async (label) =>
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      `${label} must not overflow horizontally`,
    );
  async function screenshot(path, fullPage = true) {
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      window.scrollTo({ top: 0, behavior: "instant" });
    });
    await settle();
    await page.screenshot({ path, fullPage, animations: "disabled" });
  }
  async function waitForPending(items) {
    const deadline = Date.now() + 5_000;
    while (!items.length && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 20));
    assert.ok(items.length, "The mocked request must be pending before testing cancellation");
  }
  function recordRequest(route, endpoint) {
    const request = route.request();
    const locale = request.headers()["x-knowboth-locale"];
    assert.ok(locale === "en" || locale === "ko", `${endpoint} must send a supported locale`);
    const body = request.postDataJSON();
    calls.push({ endpoint, locale, body });
    return { body, locale };
  }
  function recommendationResult(locale, stale = false) {
    const item = {
      id: "101",
      url: "https://www.wanted.co.kr/wd/101",
      company: stale
        ? "STALE RESPONSE MUST NOT APPEAR"
        : locale === "en"
          ? "Verified Example Company"
          : "검증 예시 회사",
      position: "Product Manager",
      availability: "check_required",
      availabilityEvidence: null,
      deadline: null,
      checkedAt: new Date().toISOString(),
      matches: [
        {
          profileQuote: "I documented problems in the sign-up process and proposed improvements.",
          jobQuote: "Improve customer onboarding.",
          explanation:
            locale === "en"
              ? "Problem definition and improvement proposals connect to the onboarding role."
              : "문제 정의와 개선안 작성 경험이 온보딩 업무와 연결됩니다.",
        },
      ],
      conditions: [
        {
          conditionQuote: preference,
          jobQuote: null,
          status: "unknown",
          explanation:
            locale === "en"
              ? "Remote work could not be verified in the source."
              : "원문에서 원격근무 조건을 확인하지 못했습니다.",
        },
      ],
    };
    return {
      status: "ready",
      checkedAt: item.checkedAt,
      queries: ["Product Manager onboarding"],
      items: [item],
      message:
        locale === "en"
          ? "Fictional test candidate. Check the original posting before applying."
          : "테스트용 후보입니다. 지원 전에 원문을 확인하세요.",
    };
  }

  await page.route("**/api/**", (route) => {
    routes.push(route.request().url());
    throw new Error(`Unmocked API request: ${route.request().url()}`);
  });
  await page.route("**/api/job", async (route) => {
    const { body, locale } = recordRequest(route, "job");
    if (counts("job") === 1) assert.equal(body.url, "https://wntd.co/3ec8da00");
    await route.fulfill({
      json: {
        status: "ready",
        job: { ...sampleReport(locale).job, id: "smoke-job", sourceUrl: jobUrl },
        jobProof: "fixture-proof",
      },
    });
  });
  await page.route("**/api/analyze", async (route) => {
    const { body, locale } = recordRequest(route, "analyze");
    assert.equal(route.request().headers()["x-knowboth-job-proof"], "fixture-proof");
    lastProfile = body.profile;
    const analysisId = `smoke-analysis-${++analysisNumber}`;
    const fixture = sampleReport(locale);
    const report = {
      ...fixture,
      analysisId,
      job: body.job,
      fitItems: body.profile ? fixture.fitItems : null,
      conditionChecks: body.profile ? fixture.conditionChecks : null,
      preferenceQuestions: [],
      sources: body.profile
        ? fixture.sources
        : fixture.sources.filter((source) => source.kind !== "user"),
      actions: body.profile
        ? fixture.actions
        : fixture.actions.filter((action) => action.kind !== "highlight"),
    };
    if (analysisMode === "hold")
      await new Promise((resolve) => pendingAnalyses.push({ release: resolve, analysisId }));
    await route.fulfill({ json: { report } }).catch(() => undefined);
  });
  await page.route("**/api/recommendations", async (route) => {
    const { body, locale } = recordRequest(route, "recommendations");
    assert.equal(body.profile.experienceText, experience);
    assert.equal(route.request().headers()["x-knowboth-job-proof"], "fixture-proof");
    if (recommendationMode === "error") {
      await route.fulfill({
        status: 502,
        json: { error: "Recommendation test error. Existing analysis preserved.", retryable: true },
      });
      return;
    }
    const stale = recommendationMode === "hold";
    if (stale) await new Promise((resolve) => pendingRecommendations.push(resolve));
    await route.fulfill({ json: recommendationResult(locale, stale) }).catch(() => undefined);
  });

  await page.goto(origin);
  assert.equal(await page.locator("html").getAttribute("lang"), "en");
  assert.match(await page.title(), /Know the company/);
  assert.match(
    await page.locator('meta[name="description"]').getAttribute("content"),
    /Wanted job posting/,
  );
  await noOverflow("English desktop home");
  await screenshot("work/ui/home-en-desktop.png");
  await page.getByRole("button", { name: "한국어", exact: true }).click();
  await button("viewSample", "ko").waitFor();
  await page.reload();
  assert.equal(await page.locator("html").getAttribute("lang"), "ko");
  assert.match(await page.title(), /기업을 알고/);
  assert.match(await page.locator('meta[name="description"]').getAttribute("content"), /원티드/);
  await button("viewSample", "ko").click();
  await page.getByText(recommendationMessages.ko.sampleTitle, { exact: true }).waitFor();
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page.getByText(recommendationMessages.en.sampleTitle, { exact: true }).waitFor();
  for (const key of ["companyTab", "hiringTab", "fitTab", "prepareTab"]) {
    const tab = page.getByRole("tab", { name: messages.en[key], exact: true });
    await tab.click();
    assert.equal(await tab.getAttribute("aria-selected"), "true");
    assert.ok(
      !/[가-힣]/.test(await page.locator(".kb-result-column").innerText()),
      "English sample must not contain Korean copy",
    );
  }
  await page.locator("#tab-company").focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(await page.locator("#tab-hiring").getAttribute("aria-selected"), "true");
  assert.ok(
    await page.locator("#tab-hiring").evaluate((element) => element === document.activeElement),
  );
  await page.keyboard.press("End");
  assert.equal(await page.locator("#tab-prepare").getAttribute("aria-selected"), "true");
  await page.keyboard.press("Home");
  assert.equal(await page.locator("#tab-company").getAttribute("aria-selected"), "true");
  await screenshot("work/ui/sample-en-desktop.png", false);
  await screenshot("work/ui/sample-en-desktop-full.png");
  const pdfDownload = page.waitForEvent("download");
  await button("pdfDownload").click();
  const download = await pdfDownload;
  assert.match(download.suggestedFilename(), /^KnowBoth-Noteworks-.*\.pdf$/);
  await download.saveAs("work/ui/sample-en-browser.pdf");
  assert.equal(
    (await readFile("work/ui/sample-en-browser.pdf")).subarray(0, 5).toString(),
    "%PDF-",
  );
  await button("pdfDownload").waitFor();
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const key of ["companyTab", "hiringTab", "fitTab", "prepareTab"]) {
      await page.getByRole("tab", { name: messages.en[key], exact: true }).click();
      await noOverflow(`English sample ${key} at ${width}px`);
    }
    await screenshot(`work/ui/sample-en-${width}.png`);
  }
  await settle();
  assert.equal(
    calls.length,
    0,
    "Browsing samples and switching languages must make zero API calls",
  );

  await page.setViewportSize({ width: 1440, height: 1000 });
  await button("homeLabel").click();
  await page.locator("#job-url").fill("Apply here: http://wntd.co/3ec8da00");
  await button("analyze").click();
  await button("pasteExperience").click();
  await page.locator("#experience").fill(experience);
  await page.locator("#preferences").fill(preference);
  await page.getByRole("button", { name: "한국어", exact: true }).click();
  assert.equal(await page.locator("#experience").inputValue(), experience);
  assert.equal(await page.locator("#preferences").inputValue(), preference);
  await page.getByRole("button", { name: "English", exact: true }).click();
  assert.equal(await page.locator("#experience").inputValue(), experience);
  await button("analyzeWithProfile").click();
  await recommendationButton("search").waitFor();
  assert.equal(lastProfile.experienceText, experience);
  assert.equal(
    counts("recommendations"),
    0,
    "Completing an analysis must not start recommendation search",
  );
  await recommendationButton("search").click();
  await page
    .getByText("Recommendation test error. Existing analysis preserved.", { exact: true })
    .waitFor();
  assert.ok(await page.locator(".kb-report-heading h1").isVisible());
  recommendationMode = "ready";
  await recommendationButton("retry").click();
  await page.getByRole("heading", { name: "Verified Example Company", exact: true }).waitFor();
  const link = recommendationSection.getByRole("link", { name: /View posting on Wanted/ });
  assert.equal(await link.getAttribute("href"), "https://www.wanted.co.kr/wd/101");
  assert.equal(await link.getAttribute("rel"), "noopener noreferrer");
  assert.ok(
    await page.getByText(recommendationMessages.en.checkRequired, { exact: true }).isVisible(),
  );
  for (const key of ["fitTab", "prepareTab", "companyTab"])
    await page.getByRole("tab", { name: messages.en[key], exact: true }).click();
  assert.equal(counts("recommendations"), 2, "Tabs must not repeat paid searches");
  await recommendationSection.screenshot({
    path: "work/ui/recommendations-en-desktop.png",
    animations: "disabled",
  });
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await noOverflow(`English recommendations at ${width}px`);
    await recommendationSection.screenshot({ path: `work/ui/recommendations-en-${width}.png` });
  }
  await page.getByRole("button", { name: "한국어", exact: true }).click();
  await recommendationButton("search", "ko").waitFor();
  assert.equal(counts("recommendations"), 2, "Changing languages must not start a paid search");
  assert.equal(
    await page.getByRole("heading", { name: "Verified Example Company", exact: true }).count(),
    0,
  );
  await recommendationButton("search", "ko").click();
  await page.getByRole("heading", { name: "검증 예시 회사", exact: true }).waitFor();
  assert.equal(calls.at(-1).locale, "ko");
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page.getByRole("heading", { name: "Verified Example Company", exact: true }).waitFor();
  assert.equal(counts("recommendations"), 3, "Each language must retain its own memory cache");

  recommendationMode = "hold";
  await recommendationButton("searchAgain").click();
  await recommendationButton("stop").waitFor();
  await waitForPending(pendingRecommendations);
  await recommendationButton("stop").click();
  await page.getByText(recommendationMessages.en.cancelled, { exact: true }).waitFor();
  pendingRecommendations.shift()?.();
  await settle();
  assert.equal(await page.getByText("STALE RESPONSE MUST NOT APPEAR", { exact: true }).count(), 0);
  await recommendationButton("searchAgain").click();
  await recommendationButton("stop").waitFor();
  await waitForPending(pendingRecommendations);
  await page.getByRole("button", { name: "한국어", exact: true }).click();
  await page.getByRole("heading", { name: "검증 예시 회사", exact: true }).waitFor();
  pendingRecommendations.shift()?.();
  await settle();
  assert.equal(
    await page.getByText("STALE RESPONSE MUST NOT APPEAR", { exact: true }).count(),
    0,
    "A response from the previous locale must not replace the current result",
  );
  await page.getByRole("button", { name: "English", exact: true }).click();

  const recommendationCount = counts("recommendations");
  await button("homeLabel").click();
  await button("previousReport").click();
  await page.getByRole("heading", { name: "Verified Example Company", exact: true }).waitFor();
  assert.equal(
    counts("recommendations"),
    recommendationCount,
    "Reopening a live report reuses the memory cache",
  );
  await button("homeLabel").click();
  await page.locator(".kb-history-open").first().click();
  await page.getByText(recommendationMessages.en.savedTitle, { exact: true }).waitFor();
  assert.equal(
    counts("recommendations"),
    recommendationCount,
    "History cannot reuse a previously supplied CV",
  );
  const saved = await page.evaluate(() => localStorage.getItem("knowboth.analysis-history.v1"));
  assert.ok(
    !saved.includes("fixture-proof") &&
      !saved.includes(privateMarker) &&
      !saved.includes("Verified Example Company"),
    "History must exclude verification tokens, the complete resume and live recommendations",
  );

  await button("homeLabel").click();
  await page.locator("#job-url").fill(jobUrl);
  await button("analyze").click();
  await button("continueWithout").click();
  await page.getByText(recommendationMessages.en.noProfileTitle, { exact: true }).waitFor();
  assert.equal(lastProfile, null);
  assert.equal(counts("recommendations"), recommendationCount);

  await button("homeLabel").click();
  await page.locator("#job-url").fill(jobUrl);
  await button("analyze").click();
  analysisMode = "hold";
  await button("analyzeWithProfile").click();
  await waitForPending(pendingAnalyses);
  await button("stopAndBack").click();
  await button("analyzeWithProfile").waitFor();
  analysisMode = "ready";
  await button("analyzeWithProfile").click();
  await recommendationButton("search").waitFor();
  const newestId = `smoke-analysis-${analysisNumber}`;
  pendingAnalyses.shift()?.release();
  await settle();
  const newestSaved = await page.evaluate(
    () => JSON.parse(localStorage.getItem("knowboth.analysis-history.v1"))[0],
  );
  assert.equal(
    newestSaved.id,
    newestId,
    "A cancelled late analysis must not replace the latest report",
  );
  assert.deepEqual(routes, []);
  assert.deepEqual(pageErrors, []);
  assert.ok(
    calls
      .filter((call) => call.endpoint !== "recommendations")
      .every((call) => call.locale === "en"),
  );
  console.log(
    "UI smoke passed: bilingual sample, language persistence, metadata, keyboard tabs, PDF download, 320/390px layouts, explicit search, locale cache, retry, cancellation, stale-response isolation, history privacy and no-profile flow.",
  );
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
