import test from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '../app/api/recommendations/route';
import { createJobProof } from '../lib/knowboth/job-proof';
import type { JobInput } from '../lib/knowboth/schema';

const key = 'test-only-server-key';
const job: JobInput = {
  id: 'job-recommendation-test', sourceUrl: 'https://www.wanted.co.kr/wd/100', inputMethod: 'ai_research',
  companyDisplayName: '기존회사', positionTitle: 'Product Manager',
  rawText: '고객의 문제를 정의하고 데이터를 분석해 제품을 개선하는 서비스 기획자를 채용합니다.',
  collectedAt: '2026-09-21T04:00:00Z', userEdited: false,
};
const profile = { experienceText: '고객 인터뷰와 데이터 분석으로 제품 온보딩을 개선했습니다.', desiredWork: '완전 원격 근무', constraints: null, additionalAnswers: [] };
function request(body: unknown = { job, profile }, headers: Record<string, string> = {}) {
  return new Request('https://knowboth.test/api/recommendations', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-KnowBoth-Job-Proof': createJobProof(job, key), ...headers }, body: JSON.stringify(body),
  });
}
function ai(output: unknown) { return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(output) }] }] }); }
async function withEnvironment(run: () => Promise<void>, fetcher: typeof fetch = async () => { throw new Error('Unexpected outbound request'); }) {
  const oldKey = process.env.OPENAI_API_KEY, oldModel = process.env.OPENAI_MODEL, oldFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = key; process.env.OPENAI_MODEL = 'configured-test-model'; globalThis.fetch = fetcher;
  try { await run(); }
  finally {
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey;
    if (oldModel === undefined) delete process.env.OPENAI_MODEL; else process.env.OPENAI_MODEL = oldModel;
    globalThis.fetch = oldFetch;
  }
}

test('recommendation API rejects cross-origin, content type and malformed body before any outbound call', async () => withEnvironment(async () => {
  assert.equal((await POST(request(undefined, { Origin: 'https://other.test' }))).status, 403);
  assert.equal((await POST(request(undefined, { 'Content-Type': 'text/plain' }))).status, 415);
  assert.equal((await POST(request({ job, profile: null }))).status, 400);
  assert.equal((await POST(request({ job, profile, unexpected: true }))).status, 400);
  assert.equal((await POST(new Request('https://knowboth.test/api/recommendations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' }))).status, 400);
}));
test('recommendation API enforces the actual UTF-8 body budget, not just content-length', async () => withEnvironment(async () => {
  const response = await POST(request({ job, profile: { ...profile, experienceText: '한'.repeat(60_000) } }));
  assert.equal(response.status, 413);
  assert.equal((await POST(request(undefined, { 'Content-Length': '170001' }))).status, 413);
}));
test('recommendation API requires an unchanged canonical researched job and a valid proof', async () => withEnvironment(async () => {
  assert.equal((await POST(request(undefined, { 'X-KnowBoth-Job-Proof': '' }))).status, 401);
  const tampered = await POST(request({ job: { ...job, companyDisplayName: '임의회사' }, profile }));
  assert.equal(tampered.status, 401); assert.equal((await tampered.json()).code, 'JOB_PROOF_INVALID');
  assert.equal((await POST(request({ job: { ...job, userEdited: true }, profile }))).status, 400);
  assert.equal((await POST(request({ job: { ...job, sourceUrl: null }, profile }))).status, 400);
  assert.equal((await POST(request({ job: { ...job, sourceUrl: `${job.sourceUrl}?utm_source=test` }, profile }))).status, 400);
}));
test('recommendation API missing configuration does not leak secrets or pretend to search', async () => withEnvironment(async () => {
  delete process.env.OPENAI_API_KEY;
  const response = await POST(request());
  assert.equal(response.status, 503); assert.equal((await response.json()).retryable, false);
}));
test('valid recommendation API returns a noncached empty result without fabricating a company', async () => {
  let calls = 0;
  await withEnvironment(async () => {
    const response = await POST(request(undefined, { Origin: 'https://knowboth.test' }));
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await response.json(); assert.equal(body.status, 'empty'); assert.deepEqual(body.items, []); assert.equal(calls, 2);
  }, async (_url, init) => {
    calls++; const body = JSON.parse(String(init?.body));
    assert.equal(body.model, 'configured-test-model'); assert.equal(body.store, false);
    if (calls === 1) return ai({ queries: ['Product Manager 데이터 분석'] });
    assert.equal(body.tools[0].type, 'web_search'); assert.equal(String(init?.body).includes(profile.experienceText), false);
    return ai({ items: [] });
  });
});
for (const [upstream, expected, retryable] of [[429, 429, true], [401, 503, false], [500, 502, true]] as const) {
  test(`recommendation API maps upstream ${upstream} safely`, async () => withEnvironment(async () => {
    const response = await POST(request()); const body = await response.json();
    assert.equal(response.status, expected); assert.equal(body.retryable, retryable);
    assert.equal(JSON.stringify(body).includes(key), false); assert.equal(JSON.stringify(body).includes('internal'), false);
  }, async () => new Response('internal API detail with test-only-server-key', { status: upstream })));
}
test('recommendation API rejects malformed model JSON without changing the original report', async () => withEnvironment(async () => {
  const response = await POST(request()); assert.equal(response.status, 502);
  const body = await response.json(); assert.equal(body.retryable, true); assert.match(body.error, /기존 분석/);
}, async () => Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'not-json' }] }] })));
