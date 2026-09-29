"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Info, LoaderCircle, Search, Sparkles } from "lucide-react";
import type { Locale } from "@/lib/i18n/locale";
import { recommendationMessages } from "@/lib/i18n/recommendations";
import type { RecommendationContext } from "@/lib/knowboth/client-api";
import {
  parseRecommendationResult,
  record,
  type RecommendationResult,
} from "@/lib/knowboth/recommendation-core";
import styles from "./recommended-jobs.module.css";

type Props = {
  context: RecommendationContext | null;
  sample: boolean;
  onEditProfile: () => void;
  locale?: Locale;
};

// Memory only. Never persist full CVs, proof tokens or live recommendations to localStorage.
const cache = new Map<string, { expires: number; result: RecommendationResult }>();
const CACHE_TTL = 5 * 60_000;

function cacheResult(key: string, result: RecommendationResult) {
  cache.delete(key);
  cache.set(key, { expires: Date.now() + CACHE_TTL, result });
  while (cache.size > 10) cache.delete(cache.keys().next().value!);
}

function checkedAt(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function RecommendedJobs({ locale = "ko", ...props }: Props) {
  // A changed report or language cancels the old request and clears its UI state.
  return (
    <RecommendationSearch
      key={`${props.context?.analysisId ?? "unavailable"}:${locale}`}
      {...props}
      locale={locale}
    />
  );
}

function RecommendationSearch({
  context,
  sample,
  onEditProfile,
  locale,
}: Props & { locale: Locale }) {
  const text = recommendationMessages[locale];
  const cacheKey = `${context?.analysisId ?? "unavailable"}:${locale}`;
  const [result, setResult] = useState<RecommendationResult | null>(() => {
    const cached = cache.get(cacheKey);
    return cached && cached.expires > Date.now() ? cached.result : null;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [canRetry, setCanRetry] = useState(true);
  const [cancelled, setCancelled] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);

  useEffect(
    () => () => {
      generation.current += 1;
      controller.current?.abort();
    },
    [],
  );

  async function search() {
    if (sample || !context?.profile || loading) return;
    const id = ++generation.current;
    controller.current?.abort();
    setError("");
    setCancelled(false);
    setCanRetry(true);
    const current = new AbortController();
    controller.current = current;
    let timedOut = false;
    const timer = window.setTimeout(() => {
      timedOut = true;
      current.abort();
    }, 120_000);
    setLoading(true);
    try {
      const response = await fetch("/api/recommendations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-KnowBoth-Job-Proof": context.jobProof,
          "X-KnowBoth-Locale": locale,
        },
        body: JSON.stringify({ job: context.job, profile: context.profile }),
        signal: current.signal,
      });
      const raw: unknown = await response.json().catch(() => null);
      if (generation.current !== id) return;
      if (!response.ok) {
        const body = record(raw);
        setCanRetry(body.retryable !== false);
        throw new Error(typeof body.error === "string" ? body.error : text.searchError);
      }
      const parsed = parseRecommendationResult(raw);
      if (!parsed) throw new Error(text.formatError);
      cacheResult(cacheKey, parsed);
      setResult(parsed);
    } catch (cause) {
      if (generation.current !== id) return;
      if (current.signal.aborted && !timedOut) {
        setCancelled(true);
        return;
      }
      setError(
        timedOut
          ? text.timeoutError
          : cause instanceof Error
            ? cause.message
            : text.connectionError,
      );
    } finally {
      window.clearTimeout(timer);
      if (generation.current === id) setLoading(false);
    }
  }

  const unavailable = sample || !context?.profile;
  return (
    <section className={styles.section} aria-labelledby="recommendations-title" aria-busy={loading}>
      <div className={styles.heading}>
        <div>
          <p className="kb-eyebrow">EXPLORE YOUR NEXT OPPORTUNITY</p>
          <h2 id="recommendations-title">
            <Sparkles size={21} aria-hidden="true" />
            {text.title}
          </h2>
        </div>
        {!unavailable && !loading && canRetry && (result || cancelled) && (
          <button type="button" className="kb-text-button" onClick={() => void search()}>
            <Search size={15} aria-hidden="true" />
            {text.searchAgain}
          </button>
        )}
      </div>
      <p className={styles.intro}>{text.intro}</p>
      {unavailable ? (
        <div className={styles.state}>
          <Info size={20} aria-hidden="true" />
          <div>
            <strong>
              {sample ? text.sampleTitle : !context ? text.savedTitle : text.noProfileTitle}
            </strong>
            <p>{sample ? text.sampleBody : text.noProfileBody}</p>
            {!sample && (
              <button type="button" className="kb-text-button" onClick={onEditProfile}>
                {text.editProfile} <ArrowUpRight size={14} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          <p className={styles.privacy}>{text.privacy}</p>
          {!result && !loading && !error && !cancelled && (
            <div className={styles.state}>
              <Search size={20} aria-hidden="true" />
              <div>
                <strong>{text.readyTitle}</strong>
                <p>{text.readyBody}</p>
                <button type="button" className="kb-text-button" onClick={() => void search()}>
                  {text.search}
                </button>
              </div>
            </div>
          )}
          <div role="status" aria-live="polite">
            {loading && (
              <div className={styles.state}>
                <LoaderCircle className="kb-spin" size={21} aria-hidden="true" />
                <div>
                  <strong>{text.loadingTitle}</strong>
                  <p>{text.loadingBody}</p>
                  <button
                    type="button"
                    className="kb-text-button"
                    onClick={() => controller.current?.abort()}
                  >
                    {text.stop}
                  </button>
                </div>
              </div>
            )}
            {cancelled && !loading && <p className={styles.note}>{text.cancelled}</p>}
          </div>
          {error && (
            <div className={styles.error} role="alert">
              <Info size={17} aria-hidden="true" />
              <div>
                <p>{error}</p>
                {canRetry ? (
                  <button
                    type="button"
                    className="kb-text-button"
                    disabled={loading}
                    onClick={() => void search()}
                  >
                    {text.retry}
                  </button>
                ) : (
                  <button type="button" className="kb-text-button" onClick={onEditProfile}>
                    {text.reviewProfile}
                  </button>
                )}
              </div>
            </div>
          )}
          {result && (
            <>
              <p className={styles.note}>
                {text.checked}:{" "}
                <time dateTime={result.checkedAt}>{checkedAt(result.checkedAt, locale)} KST</time> ·{" "}
                {text.queries}: {result.queries.join(" / ")}
              </p>
              {result.status === "empty" ? (
                <div className={styles.state}>
                  <Search size={20} aria-hidden="true" />
                  <div>
                    <strong>{text.emptyTitle}</strong>
                    <p>{result.message}</p>
                    <button type="button" className="kb-text-button" onClick={onEditProfile}>
                      {text.refine}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className={styles.grid}>
                    {result.items.map((item) => (
                      <article className={styles.card} key={item.id}>
                        <span
                          className={
                            item.availability === "accepting" ? styles.verified : styles.uncertain
                          }
                        >
                          {item.availability === "accepting" ? text.accepting : text.checkRequired}
                        </span>
                        <h3>{item.company}</h3>
                        <p className={styles.position}>{item.position}</p>
                        {item.deadline && (
                          <p className={styles.note}>
                            {text.deadline}: {item.deadline}
                          </p>
                        )}
                        <h4>{text.matches}</h4>
                        {item.matches.map((match, index) => (
                          <div className={styles.match} key={index}>
                            <blockquote>
                              <span>{text.profileQuote}</span>
                              {match.profileQuote}
                            </blockquote>
                            <blockquote>
                              <span>{text.jobQuote}</span>
                              {match.jobQuote}
                            </blockquote>
                            <p>
                              <span className={styles.interpretation}>{text.interpretation}</span>
                              {match.explanation}
                            </p>
                          </div>
                        ))}
                        {item.conditions.length > 0 && (
                          <div className={styles.conditions}>
                            <h4>{text.conditions}</h4>
                            {item.conditions.map((condition, index) => (
                              <div key={index}>
                                <p>
                                  <strong>{condition.conditionQuote}</strong>
                                  <span>
                                    {condition.status === "supported"
                                      ? text.supported
                                      : text.unknown}
                                  </span>
                                </p>
                                {condition.jobQuote && (
                                  <blockquote>{condition.jobQuote}</blockquote>
                                )}
                                <p>{condition.explanation}</p>
                              </div>
                            ))}
                          </div>
                        )}
                        <a
                          className={styles.link}
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {text.viewPosting} <ArrowUpRight size={16} aria-hidden="true" />
                          <span className="kb-sr-only">
                            {" "}
                            · {item.company} {item.position}, {text.newWindow}
                          </span>
                        </a>
                      </article>
                    ))}
                  </div>
                  <p className={styles.disclaimer}>
                    <Info size={15} aria-hidden="true" />
                    {result.message} {text.disclaimer}
                  </p>
                </>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
