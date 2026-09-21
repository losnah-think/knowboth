import test from 'node:test';
import assert from 'node:assert/strict';
import { hasExperienceQuote, verifyPostingPage } from '../lib/knowboth/recommendation-core';

test('PDF visual line wrapping does not erase a positive experience quote', () => {
  assert.equal(hasExperienceQuote('고객 인터뷰를 진행하고\n데이터를 분석해 제품을 개선했습니다.', '고객 인터뷰를 진행하고 데이터를 분석해 제품을 개선했습니다.'), true);
  assert.equal(hasExperienceQuote('자율 에이전트를 구축한\n경험은 없습니다.', '자율 에이전트를 구축한 경험'), false);
});

test('a future hiring-deadline label is not a closed-posting notice', () => {
  const html = '<main><h1>Product Manager</h1><h2>검증회사</h2><p>주요업무: 고객 인터뷰와 데이터 분석을 통해 제품의 온보딩을 개선하고 개발팀 및 디자인팀과 함께 문제를 정의합니다. 자격요건: 서비스 기획과 데이터 기반의 의사결정 경험이 있으며 제품 출시를 위해 여러 직군과 협업한 경험이 있는 분을 찾습니다.</p><p>채용 마감일: 2026-10-01</p><button>지원하기</button></main>';
  const result = verifyPostingPage({ html, url: 'https://www.wanted.co.kr/wd/101', company: '검증회사', position: 'Product Manager', now: new Date('2026-09-21T04:00:00Z') });
  assert.ok(result);
  assert.equal(result.deadline, '2026-10-01');
});
