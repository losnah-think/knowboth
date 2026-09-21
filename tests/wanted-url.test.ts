import test from 'node:test';
import assert from 'node:assert/strict';
import { extractWantedJobUrl, normalizeWantedJobUrl, resolveWantedJobUrl } from '../lib/knowboth/wanted-url';

const shared = '마인드허브에서 채용 중인 서비스 기획(PM/PO)에 한번 지원해 보세요. http://wntd.co/3ec8da00';
test('extracts the user-reported Wanted share text', () => assert.equal(extractWantedJobUrl(shared), 'https://wntd.co/3ec8da00'));
test('short IDs never masquerade as canonical numeric posting IDs', () => assert.equal(normalizeWantedJobUrl('https://wntd.co/3ec8da00'), null));
test('handles surrounding punctuation, markup, http and non-www job URLs', () => {
  assert.equal(extractWantedJobUrl('공고: (http://wanted.co.kr/wd/123).'), 'https://www.wanted.co.kr/wd/123');
  assert.equal(extractWantedJobUrl('[공고](https://www.wanted.co.kr/wd/123?utm_source=x)'), 'https://www.wanted.co.kr/wd/123');
  assert.equal(extractWantedJobUrl('참고 https://example.org 공고 https://wntd.co/abc'), 'https://wntd.co/abc');
});
test('does not extract credentials, custom ports or lookalike domains', () => {
  for (const value of ['http://wntd.co.evil.test/abc', 'https://foo@wntd.co/abc', 'https://www.wanted.co.kr:8000/wd/123', 'https://evil.test/?next=https://wntd.co/abc']) assert.equal(extractWantedJobUrl(value), null);
});
test('resolves an official share link before passing the URL to research', async () => {
  const called: string[] = [];
  const result = await resolveWantedJobUrl(shared, new AbortController().signal, async (input, init) => {
    called.push(String(input)); assert.equal(init?.redirect, 'manual');
    return new Response(null, { status: 302, headers: { Location: 'https://wanted.co.kr/wd/123?utm_source=share' } });
  });
  assert.equal(result, 'https://www.wanted.co.kr/wd/123'); assert.deepEqual(called, ['https://wntd.co/3ec8da00']);
});
test('direct canonical URLs need no redirect request', async () => {
  assert.equal(await resolveWantedJobUrl('https://www.wanted.co.kr/wd/123', new AbortController().signal, async () => { throw new Error('Unexpected fetch'); }), 'https://www.wanted.co.kr/wd/123');
});
test('rejects short-link redirects to private or unapproved hosts', async () => {
  for (const location of ['http://127.0.0.1/private', 'https://evil.test/wd/123', 'https://www.wanted.co.kr:8000/wd/123']) {
    let calls = 0;
    assert.equal(await resolveWantedJobUrl(shared, new AbortController().signal, async () => { calls++; return new Response(null, { status: 302, headers: { Location: location } }); }), null);
    assert.equal(calls, 1);
  }
});
test('bounds redirect cycles and rejects a non-redirect share page', async () => {
  let calls = 0;
  assert.equal(await resolveWantedJobUrl(shared, new AbortController().signal, async () => { calls++; return new Response(null, { status: 302, headers: { Location: 'https://wntd.co/3ec8da00' } }); }), null);
  assert.equal(calls, 1);
  assert.equal(await resolveWantedJobUrl(shared, new AbortController().signal, async () => new Response('not a redirect')), null);
});
test('cancelled short-link resolution does not continue fetching', async () => {
  await assert.rejects(resolveWantedJobUrl(shared, AbortSignal.abort(new Error('cancelled')), async () => { throw new Error('Unexpected fetch'); }), /cancelled/);
});
