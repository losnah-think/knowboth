import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import {
  consultedPostingUrls, containsQuote, mapConcurrent, parseRecommendationResult,
  safeSearchQueries, validateMatches, verifyPostingPage, wantedPostingUrl,
  type RecommendationProfile, type VerifiedPosting,
} from '../lib/knowboth/recommendation-core';
import { boundedText, RecommendationError, recommendWantedJobs } from '../lib/knowboth/recommendations';

const now = new Date('2026-09-21T04:00:00Z');
const experience = '고객 인터뷰를 진행하고 데이터를 분석해 제품 온보딩을 개선했습니다. AI 도구를 활용했지만 자율 에이전트를 구축한 경험은 없습니다.';
const duty = '고객 인터뷰와 데이터 분석을 통해 제품 온보딩을 개선합니다.';
const details = `${duty} 개발자 및 디자이너와 함께 문제를 정의하고 요구사항을 작성합니다. 주요업무는 제품 전략 수립과 출시이며, 자격요건은 데이터에 근거한 문제 정의 경험입니다. 사용자에게 가치를 제공할 수 있는 동료를 찾습니다.`;
const profile: RecommendationProfile = { experienceText: experience, desiredWork: '완전 원격 근무', constraints: null, additionalAnswers: [] };
const originalJob = { sourceUrl: 'https://www.wanted.co.kr/wd/100', companyDisplayName: '기존회사', positionTitle: 'Product Manager' };
const url = 'https://www.wanted.co.kr/wd/101';

function html(options: { id?: string; company?: string; position?: string; deadline?: string; button?: string; extra?: string; json?: boolean } = {}) {
  const { id = '101', company = '새회사', position = 'Product Manager', deadline = '2026-10-01', button = '<button>지원하기</button>', extra = '', json = true } = options;
  const metadata = { '@type': 'JobPosting', url: `https://www.wanted.co.kr/wd/${id}`, title: position, hiringOrganization: { name: company }, description: `<p>${details}</p>`, validThrough: deadline };
  return `<html><head>${json ? `<script type="application/ld+json">${JSON.stringify(metadata)}</script>` : ''}</head><body><main><h1>${position}</h1><h2>${company}</h2><p>주요업무 ${details}</p><p>자격요건 제품 개선 경험</p>${button}${extra}</main></body></html>`;
}
function posting(options: Parameters<typeof html>[0] = {}): VerifiedPosting {
  const data = verifyPostingPage({ url: `https://www.wanted.co.kr/wd/${options.id || '101'}`, html: html(options), company: options.company || '새회사', position: options.position || 'Product Manager', now });
  assert.ok(data); return data;
}
function match(id = '101', overrides: Record<string, unknown> = {}) {
  return { postingId: id, matches: [{ profileQuote: '고객 인터뷰를 진행하고 데이터를 분석해 제품 온보딩을 개선했습니다.', jobQuote: duty, explanation: '인터뷰와 분석 경험이 공고의 온보딩 개선 업무와 연결됩니다.' }], conditions: [], ...overrides };
}
function ai(output: unknown, sources: string[] = []) {
  return Response.json({ status: 'completed', output: [
    ...(sources.length ? [{ type: 'web_search_call', status: 'completed', action: { sources: sources.map(url => ({ url })) } }] : []),
    { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(output) }] },
  ] });
}
function mockedSearch(options: {
  candidates?: Array<{ url: string; company: string; position: string }>;
  sources?: string[];
  matches?: unknown;
  page?: (url: string) => Response | Promise<Response>;
  plan?: unknown;
} = {}) {
  const bodies: Array<Record<string, unknown>> = [];
  const visited: string[] = [];
  const candidates = options.candidates || [{ url, company: '새회사', position: 'Product Manager' }];
  const fetcher: typeof fetch = async (input, init) => {
    const href = String(input instanceof Request ? input.url : input);
    if (href === 'https://api.openai.com/v1/responses') {
      const body = JSON.parse(String(init?.body)); bodies.push(body);
      const name = body.text.format.name;
      if (name === 'knowboth_recommendation_queries') return ai(options.plan || { queries: ['Product Manager 데이터 분석'] });
      if (name === 'knowboth_recommendation_discovery') return ai({ items: candidates }, options.sources || candidates.map(item => item.url));
      if (name === 'knowboth_recommendation_matches') return ai(options.matches || { items: [match()] });
      throw new Error('Unexpected model call');
    }
    visited.push(href);
    return options.page ? options.page(href) : new Response(html(), { headers: { 'Content-Type': 'text/html' } });
  };
  return { bodies, visited, fetcher };
}
const options = (fetcher: typeof fetch) => ({ apiKey: 'test-key', model: 'configured-model', fetch: fetcher, now: () => now });

for (const bad of ['https://www.wanted.co.kr.evil.test/wd/101', 'https://evil.test/?url=https://www.wanted.co.kr/wd/101', 'https://user@www.wanted.co.kr/wd/101', 'https://www.wanted.co.kr:8443/wd/101', 'http://127.0.0.1/wd/101', 'javascript:alert(1)', 'https://wntd.co/abc', 'https://www.wanted.co.kr/wd/0']) {
  test(`rejects unsafe/non-posting URL: ${bad}`, () => assert.equal(wantedPostingUrl(bad), null));
}
test('canonicalizes Wanted posting aliases and strips tracking parameters', () => {
  assert.equal(wantedPostingUrl('http://recruit.wanted.co.kr/wd/101/?utm_source=x#top'), url);
});
test('only source metadata establishes a consulted posting', () => {
  assert.equal(consultedPostingUrls({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ url }) }] }] }).size, 0);
  assert.ok(consultedPostingUrls({ output: [{ type: 'web_search_call', action: { sources: [{ url: `${url}?utm_source=x` }] } }] }).has(url));
});
test('query validation rejects contacts, URLs and search instructions', () => {
  assert.deepEqual(safeSearchQueries(['Product Manager', 'user@example.com', '01012341234', 'site:evil.test', '<script>', 'Product Manager']), ['Product Manager']);
});
test('marks an enabled application control as observed, not a guarantee', () => {
  const data = posting(); assert.equal(data.availability, 'accepting'); assert.equal(data.availabilityEvidence, '지원하기');
});
test('HTTP 200 with no enabled application control remains unconfirmed', () => {
  assert.equal(posting({ button: '<button disabled>지원하기</button>' }).availability, 'check_required');
});
test('explicitly closed postings are rejected even with a future deadline', () => {
  assert.equal(verifyPostingPage({ url, html: html({ extra: '<p>마감된 공고입니다.</p>' }), company: '새회사', position: 'Product Manager', now }), null);
});
test('expired structured deadlines are rejected', () => {
  assert.equal(verifyPostingPage({ url, html: html({ deadline: '2026-09-20' }), company: '새회사', position: 'Product Manager', now }), null);
});
test('Korean date-only deadlines include the entire day in KST', () => {
  assert.ok(verifyPostingPage({ url, html: html({ deadline: '2026-09-21' }), company: '새회사', position: 'Product Manager', now: new Date('2026-09-21T14:59:59Z') }));
  assert.equal(verifyPostingPage({ url, html: html({ deadline: '2026-09-21' }), company: '새회사', position: 'Product Manager', now: new Date('2026-09-21T15:00:00Z') }), null);
});
test('generic HTML, search snippets and identity mismatches do not become postings', () => {
  assert.equal(verifyPostingPage({ url, html: '<main>잠시 후 다시 시도하세요.</main>', company: '새회사', position: 'Product Manager', now }), null);
  assert.equal(verifyPostingPage({ url, html: html({ company: '다른회사' }), company: '새회사', position: 'Product Manager', now }), null);
});
test('visible job content can be verified without JSON-LD', () => assert.ok(posting({ json: false })));
test('quotes are checked against the CV and the exact candidate page independently', () => {
  assert.equal(containsQuote('고객\n 인터뷰', '고객 인터뷰'), true);
  assert.equal(validateMatches({ items: [match('101', { matches: [{ profileQuote: '자율 에이전트를 구축했습니다.', jobQuote: duty, explanation: '과장된 경험' }] })] }, [posting()], profile, '기존회사').length, 0);
  assert.equal(validateMatches({ items: [match('101', { matches: [{ profileQuote: '완전 원격 근무', jobQuote: duty, explanation: '희망을 경력으로 오인' }] })] }, [posting()], profile, '기존회사').length, 0);
});
test('unknown posting IDs and missing job quotes are rejected', () => {
  assert.equal(validateMatches({ items: [match('999')] }, [posting()], profile, '기존회사').length, 0);
  assert.equal(validateMatches({ items: [match('101', { matches: [{ profileQuote: experience, jobQuote: '이 공고에는 없는 직무', explanation: 'unsupported' }] })] }, [posting()], profile, '기존회사').length, 0);
});
test('missing condition evidence is downgraded without retaining a made-up explanation', () => {
  const result = validateMatches({ items: [match('101', { conditions: [{ conditionQuote: '완전 원격 근무', jobQuote: '100% 재택', status: 'supported', explanation: '원격 가능 확정' }] })] }, [posting()], profile, '기존회사');
  assert.equal(result[0].conditions[0].status, 'unknown');
  assert.equal(result[0].conditions[0].jobQuote, null);
  assert.doesNotMatch(result[0].conditions[0].explanation, /확정/);
});
test('explicit condition conflicts with grounded quotes exclude the candidate', () => {
  const page = { ...posting(), text: `${details}\n주 5일 서울 사무실 출근` };
  assert.deepEqual(validateMatches({ items: [match('101', { conditions: [{ conditionQuote: '완전 원격 근무', jobQuote: '주 5일 서울 사무실 출근', status: 'conflict', explanation: '명시 조건 충돌' }] })] }, [page], profile, '기존회사'), []);
});
test('the model cannot silently omit the complete set of requested conditions', () => {
  const multi = { ...profile, desiredWork: '완전 원격 근무, 연봉 1억원 이상' };
  const [result] = validateMatches({ items: [match()] }, [posting()], multi, '기존회사');
  assert.equal(result.conditions[0].conditionQuote, multi.desiredWork);
  assert.equal(result.conditions[0].status, 'unknown');
});
test('same company and duplicate companies are excluded without inventing scores', () => {
  const other = posting({ id: '102', company: '새회사' });
  const results = validateMatches({ items: [match(), match('102')] }, [posting(), other], profile, '기존회사');
  assert.equal(results.length, 1); assert.equal('score' in results[0], false);
  assert.deepEqual(validateMatches({ items: [match()] }, [posting()], profile, '주식회사 새회사'), []);
});
test('bounded parallel work preserves page order', async () => {
  let active = 0, peak = 0;
  const results = await mapConcurrent([1, 2, 3, 4, 5], 2, async value => { active++; peak = Math.max(peak, active); await delay(6 - value); active--; return value; });
  assert.deepEqual(results, [1, 2, 3, 4, 5]); assert.equal(peak, 2);
});
test('parallel work stops scheduling and drains in-flight work after an error', async () => {
  let settled = false;
  await assert.rejects(mapConcurrent([0, 1, 2], 2, async value => { if (value === 0) { await delay(1); throw new Error('bad page'); } await delay(5); settled = true; return value; }));
  assert.equal(settled, true);
});
test('parallel work honors cancellation and validates concurrency', async () => {
  await assert.rejects(mapConcurrent([1], 0, async value => value), RangeError);
  const signal = AbortSignal.abort(new Error('cancelled'));
  await assert.rejects(mapConcurrent([1], 2, async value => value, signal), /cancelled/);
});
test('bounded response bodies reject declared and streamed oversize pages', async () => {
  assert.equal(await boundedText(new Response('body', { headers: { 'Content-Length': '50' } }), new AbortController().signal, 10), null);
  assert.equal(await boundedText(new Response('12345678901'), new AbortController().signal, 10), null);
});
test('bounded reads cancel a hanging stream when aborted', async () => {
  const controller = new AbortController();
  const reading = boundedText(new Response(new ReadableStream({ start() {} })), controller.signal);
  controller.abort(new Error('cancelled'));
  await assert.rejects(reading, /cancelled/);
});
test('full workflow uses configured model, store:false and no CV in the web-search request', async () => {
  const mocked = mockedSearch();
  const result = await recommendWantedJobs(originalJob, profile, new AbortController().signal, options(mocked.fetcher));
  assert.equal(result.status, 'ready'); assert.equal(result.items.length, 1); assert.ok(parseRecommendationResult(result));
  assert.equal(mocked.bodies.length, 3);
  for (const body of mocked.bodies) { assert.equal(body.model, 'configured-model'); assert.equal(body.store, false); }
  const search = mocked.bodies[1];
  assert.equal(search.tool_choice, 'required'); assert.doesNotMatch(String(search.input), /experienceText|고객 인터뷰를 진행|에이전트를 구축한 경험/);
  assert.deepEqual((search.tools as Array<{ filters: unknown }>)[0].filters, { allowed_domains: ['wanted.co.kr'] });
});
test('a URL invented in output but absent from search sources is never fetched', async () => {
  const mocked = mockedSearch({ sources: ['https://www.wanted.co.kr/wd/999'] });
  const result = await recommendWantedJobs(originalJob, profile, new AbortController().signal, options(mocked.fetcher));
  assert.equal(result.status, 'empty'); assert.equal(mocked.visited.length, 0); assert.equal(mocked.bodies.length, 2);
});
test('failed candidate pages do not prevent independently verified candidates', async () => {
  const mocked = mockedSearch({ candidates: [{ url, company: '새회사', position: 'Product Manager' }, { url: 'https://www.wanted.co.kr/wd/102', company: '두번째회사', position: 'Product Manager' }], page: async href => href === url ? new Response('not found', { status: 404 }) : new Response(html({ id: '102', company: '두번째회사' }), { headers: { 'Content-Type': 'text/html' } }), matches: { items: [match('102')] } });
  const result = await recommendWantedJobs(originalJob, profile, new AbortController().signal, options(mocked.fetcher));
  assert.deepEqual(result.items.map(item => item.company), ['두번째회사']);
});
test('cross-host redirects are rejected before sending a request to the destination', async () => {
  const mocked = mockedSearch({ page: () => new Response(null, { status: 302, headers: { Location: 'http://127.0.0.1/private' } }) });
  const result = await recommendWantedJobs(originalJob, profile, new AbortController().signal, options(mocked.fetcher));
  assert.equal(result.status, 'empty'); assert.deepEqual(mocked.visited, [url]);
});
test('missing credentials and pre-aborted requests cause no outbound calls', async () => {
  const mocked = mockedSearch();
  await assert.rejects(recommendWantedJobs(originalJob, profile, new AbortController().signal, { ...options(mocked.fetcher), apiKey: '' }), error => error instanceof RecommendationError && error.code === 'configuration');
  await assert.rejects(recommendWantedJobs(originalJob, profile, AbortSignal.abort(new Error('cancelled')), options(mocked.fetcher)), /cancelled/);
  assert.equal(mocked.bodies.length, 0);
});
test('rate limits and incomplete output fail explicitly rather than fabricating candidates', async () => {
  await assert.rejects(recommendWantedJobs(originalJob, profile, new AbortController().signal, options(async () => new Response('rate limited', { status: 429 }))), error => error instanceof RecommendationError && error.code === 'rate_limit');
  await assert.rejects(recommendWantedJobs(originalJob, profile, new AbortController().signal, options(async () => Response.json({ status: 'incomplete' }))), error => error instanceof RecommendationError && error.code === 'invalid_response');
});
test('malformed recommendation responses cannot inject external links into the UI', async () => {
  const mocked = mockedSearch();
  const result = await recommendWantedJobs(originalJob, profile, new AbortController().signal, options(mocked.fetcher));
  assert.equal(parseRecommendationResult({ ...result, items: [{ ...result.items[0], url: 'javascript:alert(1)' }] }), null);
  assert.equal(parseRecommendationResult({ ...result, checkedAt: 'invalid-date' }), null);
  assert.equal(parseRecommendationResult({ ...result, status: 'empty' }), null);
});


test('explicitly different structured posting IDs cannot fall back to visible text', () => {
  assert.equal(verifyPostingPage({ url, html: html({ id: '999' }), company: '새회사', position: 'Product Manager', now }), null);
});
test('visible expired deadlines are checked when JSON-LD is missing', () => {
  assert.equal(verifyPostingPage({ url, html: html({ json: false, extra: '<p>마감일: 2026.09.20</p>' }), company: '새회사', position: 'Product Manager', now }), null);
});
test('invalid calendar dates are not displayed as verified deadlines', () => {
  assert.equal(posting({ deadline: '2027-02-31' }).deadline, null);
});


test('clipping the negation from a CV sentence cannot create positive experience evidence', () => {
  const negative = { ...profile, experienceText: '자율 에이전트를 구축한 경험은 없습니다.' };
  const result = validateMatches({ items: [match('101', { matches: [{ profileQuote: '자율 에이전트를 구축한 경험', jobQuote: duty, explanation: '에이전트 경험이 있습니다.' }] })] }, [posting()], negative, '기존회사');
  assert.deepEqual(result, []);
});
test('missing structured company name cannot be filled from unsupported model output', () => {
  const page = html().replace(/새회사/g, '다른 회사').replace('"hiringOrganization":{"name":"다른 회사"},', '');
  assert.equal(verifyPostingPage({ url, html: page, company: '새회사', position: 'Product Manager', now }), null);
});
test('an expired visible deadline wins over conflicting future metadata', () => {
  assert.equal(verifyPostingPage({ url, html: html({ extra: '<p>마감일: 2026-09-20</p>' }), company: '새회사', position: 'Product Manager', now }), null);
});
