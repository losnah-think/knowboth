"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Info, LoaderCircle, Search, Sparkles } from 'lucide-react';
import type { JobInput } from '@/lib/knowboth/schema';
import { parseRecommendationResult, record, type RecommendationProfile, type RecommendationResult } from '@/lib/knowboth/recommendation-core';
import styles from './recommended-jobs.module.css';

export type RecommendationContext = {
  analysisId: string;
  job: JobInput;
  profile: RecommendationProfile | null;
  jobProof: string;
};
// Memory only. Never persist full CVs, proof tokens or live recommendations to localStorage.
const cache = new Map<string, { expires: number; result: RecommendationResult }>();
const CACHE_TTL = 5 * 60_000;
function cacheResult(id: string, result: RecommendationResult) {
  cache.delete(id);
  cache.set(id, { expires: Date.now() + CACHE_TTL, result });
  while (cache.size > 10) cache.delete(cache.keys().next().value!);
}
function checkedAt(value: string) {
  return new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function RecommendedJobs({ context, sample, onEditProfile }: {
  context: RecommendationContext | null;
  sample: boolean;
  onEditProfile: () => void;
}) {
  const [result, setResult] = useState<RecommendationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [canRetry, setCanRetry] = useState(true);
  const [cancelled, setCancelled] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);

  const search = useCallback(async (useCache = false) => {
    if (sample || !context?.profile) return;
    const id = ++generation.current;
    controller.current?.abort();
    setError(''); setCancelled(false); setCanRetry(true);
    const cached = cache.get(context.analysisId);
    if (useCache && cached && cached.expires > Date.now()) { setResult(cached.result); setLoading(false); return; }
    const current = new AbortController();
    controller.current = current;
    let timedOut = false;
    const timer = window.setTimeout(() => { timedOut = true; current.abort(); }, 120_000);
    setLoading(true);
    try {
      const response = await fetch('/api/recommendations', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-KnowBoth-Job-Proof': context.jobProof },
        body: JSON.stringify({ job: context.job, profile: context.profile }), signal: current.signal,
      });
      const raw: unknown = await response.json().catch(() => null);
      if (generation.current !== id) return;
      if (!response.ok) {
        const body = record(raw);
        setCanRetry(body.retryable !== false);
        throw new Error(typeof body.error === 'string' ? body.error : '공고 검색을 완료하지 못했어요. 기존 분석은 그대로예요.');
      }
      const parsed = parseRecommendationResult(raw);
      if (!parsed) throw new Error('추천 공고의 형식을 확인하지 못했어요. 다시 검색해 주세요.');
      cacheResult(context.analysisId, parsed);
      setResult(parsed);
    } catch (cause) {
      if (generation.current !== id) return;
      if (current.signal.aborted && !timedOut) { setCancelled(true); return; }
      setError(timedOut ? '다른 공고 검색 시간이 길어져 멈췄어요. 기존 분석은 그대로예요.' : cause instanceof Error ? cause.message : '공고 검색에 연결하지 못했어요.');
    } finally {
      window.clearTimeout(timer);
      if (generation.current === id) setLoading(false);
    }
  }, [context, sample]);

  useEffect(() => {
    // Defer one tick so React Strict Mode cleanup cancels the first mount before any paid request.
    const timer = window.setTimeout(() => { void search(true); }, 0);
    return () => { window.clearTimeout(timer); generation.current += 1; controller.current?.abort(); };
  }, [search]);

  const unavailable = sample || !context?.profile;
  return <section className={styles.section} aria-labelledby="recommendations-title" aria-busy={loading}>
    <div className={styles.heading}><div><p className="kb-eyebrow">EXPLORE YOUR NEXT OPPORTUNITY</p><h2 id="recommendations-title"><Sparkles size={21} aria-hidden="true" />나의 경험과 연결되는 다른 회사</h2></div>
      {!unavailable && !loading && canRetry && <button type="button" className="kb-text-button" onClick={() => void search()}><Search size={15} aria-hidden="true" />다시 검색</button>}
    </div>
    <p className={styles.intro}>직무 이름만 비슷한 곳이 아니라, 이 분석에 제공한 경험과 희망 조건을 원티드 공고의 문구에 연결해 봐요.</p>
    {unavailable ? <div className={styles.state}>
      <Info size={20} aria-hidden="true" /><div><strong>{sample ? '가상 예시에서는 실제 회사에 대한 추천을 만들지 않아요.' : !context ? '저장된 보고서에는 당시의 이력서 원문과 확인 서명이 보관되지 않아요.' : '이력서나 경험을 추가하면 다른 회사도 찾아드려요.'}</strong>
        <p>{sample ? '실제 공고와 경험을 분석하면 이곳에 원티드 공고 후보가 나타나요.' : '직무만으로 나와 잘 맞는 회사라고 판단하지 않아요. 경험을 포함해 다시 분석해 주세요.'}</p>
        {!sample && <button type="button" className="kb-text-button" onClick={onEditProfile}>경험 추가하고 다시 분석하기 <ArrowUpRight size={14} aria-hidden="true" /></button>}
      </div>
    </div> : <>
      <p className={styles.privacy}>검색어는 경력·기술 키워드로 만들어요. 경험 텍스트는 AI 비교에 사용되며, 웹 검색 단계에는 검색어만 전달해요. 새로고침 시점에 따라 결과가 달라질 수 있어요.</p>
      <div role="status" aria-live="polite">
        {loading && <div className={styles.state}><LoaderCircle className="kb-spin" size={21} aria-hidden="true" /><div><strong>원티드 공고를 찾고 원문을 확인하고 있어요.</strong><p>기존 보고서는 바로 읽을 수 있어요. 확인된 후보만 최대 3개 표시해요.</p><button type="button" className="kb-text-button" onClick={() => controller.current?.abort()}>검색 멈추기</button></div></div>}
        {cancelled && !loading && <p className={styles.note}>검색을 멈췄어요. 기존 보고서와 이력서는 그대로예요.</p>}
      </div>
      {error && <div className={styles.error} role="alert"><Info size={17} aria-hidden="true" /><div><p>{error}</p>{canRetry ? <button type="button" className="kb-text-button" disabled={loading} onClick={() => void search()}>추천 공고만 다시 검색</button> : <button type="button" className="kb-text-button" onClick={onEditProfile}>공고·경험 다시 확인하기</button>}</div></div>}
      {result && <>
        <p className={styles.note}><time dateTime={result.checkedAt}>{checkedAt(result.checkedAt)} KST 확인</time> · 검색어: {result.queries.join(' / ')}</p>
        {result.status === 'empty' ? <div className={styles.state}><Search size={20} aria-hidden="true" /><div><strong>검증을 통과한 추천 공고가 아직 없어요.</strong><p>{result.message}</p><button type="button" className="kb-text-button" onClick={onEditProfile}>희망 업무·조건 다듬기</button></div></div> : <>
          <div className={styles.grid}>{result.items.map(item => <article className={styles.card} key={item.id}>
            <span className={item.availability === 'accepting' ? styles.verified : styles.uncertain}>{item.availability === 'accepting' ? '지원 버튼 확인 · 접수 여부 재확인 필요' : '공고 원문 확인 · 채용 상태 확인 필요'}</span>
            <h3>{item.company}</h3><p className={styles.position}>{item.position}</p>
            {item.deadline && <p className={styles.note}>공고에 표시된 마감일: {item.deadline}</p>}
            <h4>내 경험과 연결되는 근거</h4>
            {item.matches.map((match, index) => <div className={styles.match} key={index}>
              <blockquote><span>내 경험</span>{match.profileQuote}</blockquote><blockquote><span>공고 원문</span>{match.jobQuote}</blockquote>
              <p><span className={styles.interpretation}>연결 해석</span>{match.explanation}</p>
            </div>)}
            {item.conditions.length > 0 && <div className={styles.conditions}><h4>희망 조건은 따로 확인해요</h4>{item.conditions.map((condition, index) => <div key={index}>
              <p><strong>{condition.conditionQuote}</strong><span>{condition.status === 'supported' ? '연결되는 공고 문구 있음' : '미확인'}</span></p>
              {condition.jobQuote && <blockquote>{condition.jobQuote}</blockquote>}<p>{condition.explanation}</p>
            </div>)}</div>}
            <a className={styles.link} href={item.url} target="_blank" rel="noopener noreferrer">원티드 공고 보기 <ArrowUpRight size={16} aria-hidden="true" /><span className="kb-sr-only"> · {item.company} {item.position}, 새 창</span></a>
          </article>)}</div>
          <p className={styles.disclaimer}><Info size={15} aria-hidden="true" />{result.message} 이 실시간 추천 영역은 최근 분석 기록과 PDF에는 저장되지 않아요.</p>
        </>}
      </>}
    </>}
  </section>;
}
