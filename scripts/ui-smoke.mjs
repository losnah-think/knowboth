import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { transform } from 'esbuild';
import { chromium } from 'playwright';

// Reuse the repository's explicit fictional sample; no production CVs or API keys.
const source = await readFile('components/knowboth-app.tsx', 'utf8');
const start = source.indexOf('const SAMPLE_JOB = '), end = source.indexOf('\nconst FIT_LABEL = ', start);
assert.ok(start >= 0 && end > start);
await mkdir('work/ui', { recursive: true });
const fixture = await transform(`${source.slice(start, end)}\nexport {sampleReport, SAMPLE_PROFILE};`, { loader: 'ts', format: 'esm' });
await writeFile('work/ui-fixtures.mjs', fixture.code);
const { sampleReport, SAMPLE_PROFILE } = await import(pathToFileURL(resolve('work/ui-fixtures.mjs')).href);
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', '3100'], { stdio: 'inherit', env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } });
let browser;
try {
  let ready = false;
  for (let tries = 0; tries < 60; tries++) {
    try { const response = await fetch('http://127.0.0.1:3100'); if (response.ok) { ready = true; break; } } catch { /* Server starts asynchronously. */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(ready, 'Next production server should start');
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(15_000);
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  const job = { ...sampleReport().job, id: 'smoke-job', sourceUrl: 'https://www.wanted.co.kr/wd/100' };
  let analyses = 0, recommendations = 0, jobRequests = 0;
  let lastProfile = null;
  let releasePending;
  const item = {
    id: '101', url: 'https://www.wanted.co.kr/wd/101', company: '검증 예시 회사', position: 'Product Manager',
    availability: 'check_required', availabilityEvidence: null, deadline: null, checkedAt: new Date().toISOString(),
    matches: [{ profileQuote: '가입 과정의 문제를 정리하고 개선안을 작성했습니다.', jobQuote: '고객의 온보딩을 개선합니다.', explanation: '문제 정의와 개선안 작성 경험이 온보딩 업무와 연결됩니다.' }],
    conditions: [{ conditionQuote: '완전 원격 근무', jobQuote: null, status: 'unknown', explanation: '원문에서 원격근무 조건을 확인하지 못했습니다.' }],
  };
  const result = { status: 'ready', checkedAt: item.checkedAt, queries: ['Product Manager 온보딩'], items: [item], message: '테스트용 후보입니다. 지원 전에 원문을 확인하세요.' };
  await page.route('**/api/job', async route => {
    const body = route.request().postDataJSON(); jobRequests++;
    if (jobRequests === 1) assert.equal(body.url, 'https://wntd.co/3ec8da00');
    await route.fulfill({ json: { status: 'ready', job, jobProof: 'fixture-proof' } });
  });
  await page.route('**/api/analyze', async route => {
    const body = route.request().postDataJSON(); lastProfile = body.profile; analyses++;
    const report = { ...sampleReport(), analysisId: `smoke-analysis-${analyses}`, job, fitItems: body.profile ? sampleReport().fitItems : null };
    await route.fulfill({ json: { report } });
  });
  await page.route('**/api/recommendations', async route => {
    recommendations++;
    const body = route.request().postDataJSON();
    assert.equal(body.profile.experienceText, SAMPLE_PROFILE);
    assert.equal(route.request().headers()['x-knowboth-job-proof'], 'fixture-proof');
    if (recommendations === 1) { await route.fulfill({ status: 502, json: { error: '추천 검색 테스트 오류 · 기존 분석 유지', retryable: true } }); return; }
    if (recommendations === 3) await new Promise(resolve => { releasePending = resolve; });
    await route.fulfill({ json: result }).catch(() => undefined);
  });

  await page.goto('http://127.0.0.1:3100');
  await page.getByRole('button', { name: '예시 보고서 보기' }).click();
  await page.getByText('가상 예시에서는 실제 회사에 대한 추천을 만들지 않아요.').waitFor();
  assert.equal(recommendations, 0);
  await page.getByRole('button', { name: '홈으로 이동', exact: true }).click();
  await page.locator('#job-url').fill('마인드허브에서 채용 중인 서비스 기획(PM/PO)에 한번 지원해 보세요. http://wntd.co/3ec8da00');
  await page.getByRole('button', { name: '분석하기', exact: true }).click();
  await page.getByRole('button', { name: '파일 없이 경험 직접 입력하기' }).click();
  await page.locator('#experience').fill(SAMPLE_PROFILE);
  await page.locator('#preferences').fill('완전 원격 근무');
  await page.getByRole('button', { name: '기업과 나 분석하기' }).click();
  await page.getByText('추천 검색 테스트 오류 · 기존 분석 유지', { exact: true }).waitFor();
  assert.ok(await page.locator('.kb-report-heading h2').isVisible(), 'Recommendation failure must preserve report');
  assert.equal(lastProfile.experienceText, SAMPLE_PROFILE);
  await page.getByRole('button', { name: '추천 공고만 다시 검색', exact: true }).click();
  await page.getByRole('heading', { name: '검증 예시 회사', exact: true }).waitFor();
  const link = page.getByRole('link', { name: /원티드 공고 보기/ });
  assert.equal(await link.getAttribute('href'), item.url);
  assert.equal(await link.getAttribute('rel'), 'noopener noreferrer');
  assert.ok(await page.getByText('공고 원문 확인 · 채용 상태 확인 필요').isVisible());
  for (const label of ['나와 비교', '지원 준비', '기업 이해']) await page.getByRole('tab', { name: label }).click();
  assert.equal(recommendations, 2, 'Tab switches must not repeat paid calls');
  await page.locator('section[aria-labelledby="recommendations-title"]').screenshot({ path: 'work/ui/recommendations-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Mobile page should not overflow horizontally');
  await page.locator('section[aria-labelledby="recommendations-title"]').screenshot({ path: 'work/ui/recommendations-mobile.png' });

  await page.getByRole('button', { name: '홈으로 이동', exact: true }).click();
  await page.getByRole('button', { name: '이전 보고서 보기', exact: true }).click();
  await page.getByRole('heading', { name: '검증 예시 회사', exact: true }).waitFor();
  assert.equal(recommendations, 2, 'Reopening the same report should reuse memory cache');
  await page.getByRole('button', { name: '홈으로 이동', exact: true }).click();
  await page.locator('.kb-history-open').first().click();
  await page.getByText('저장된 보고서에는 당시의 이력서 원문과 확인 서명이 보관되지 않아요.').waitFor();
  assert.equal(recommendations, 2, 'History must not reuse an unrelated CV');

  await page.getByRole('button', { name: '홈으로 이동', exact: true }).click();
  await page.locator('#job-url').fill(job.sourceUrl);
  await page.getByRole('button', { name: '분석하기', exact: true }).click();
  await page.getByRole('button', { name: '이력서 없이 계속' }).click();
  await page.getByText('이력서나 경험을 추가하면 다른 회사도 찾아드려요.').waitFor();
  assert.equal(lastProfile, null); assert.equal(recommendations, 2);

  await page.getByRole('button', { name: '홈으로 이동', exact: true }).click();
  await page.locator('#job-url').fill(job.sourceUrl);
  await page.getByRole('button', { name: '분석하기', exact: true }).click();
  await page.getByRole('button', { name: '기업과 나 분석하기' }).click();
  await page.getByRole('button', { name: '검색 멈추기', exact: true }).click();
  await page.getByText('검색을 멈췄어요. 기존 보고서와 이력서는 그대로예요.').waitFor();
  releasePending?.();
  assert.ok(await page.locator('.kb-report-heading h2').isVisible());
  assert.deepEqual(pageErrors, []);
  console.log('UI smoke passed: shared paste, sample, report preservation, retry, links, tabs, mobile, cache, history isolation, no-profile and cancellation.');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
