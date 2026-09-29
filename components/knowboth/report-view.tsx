"use client";
import { useState, type KeyboardEvent, type RefObject } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Building2,
  Check,
  ChevronDown,
  Download,
  ExternalLink,
  Info,
  LoaderCircle,
  Plus,
  Search,
  Sparkles,
  Target,
  UserRound,
} from "lucide-react";
import type { Report, Claim, Source } from "@/lib/knowboth/schema";
import type { Locale } from "@/lib/i18n/locale";
import type { Messages } from "@/lib/i18n/messages";
import { dateLabel, moneyLabel } from "@/lib/i18n/format";
import { safeUrl } from "@/lib/knowboth/urls";
import { useLocale } from "@/components/locale-provider";
import RecommendedJobs from "@/components/recommended-jobs";
import type { RecommendationContext } from "@/lib/knowboth/client-api";
function getTabs(copy: Messages) {
  return [
    { id: "company", label: copy.companyTab, icon: Building2 },
    { id: "hiring", label: copy.hiringTab, icon: Search },
    { id: "fit", label: copy.fitTab, icon: UserRound },
    { id: "prepare", label: copy.prepareTab, icon: Target },
  ] as const;
}
type Tab = ReturnType<typeof getTabs>[number]["id"];
function EvidenceBadge({ kind }: { kind: Claim["kind"] }) {
  const { copy } = useLocale();
  return (
    <span className={`kb-badge kb-${kind}`}>
      {kind === "sourced" ? (
        <Check size={12} />
      ) : kind === "inference" ? (
        <Sparkles size={12} />
      ) : (
        <Info size={12} />
      )}
      {kind === "sourced"
        ? copy.sourced
        : kind === "inference"
          ? copy.inference
          : copy.needsVerification}
    </span>
  );
}
function SourceRefs({ ids, sources }: { ids: string[]; sources: Source[] }) {
  const found = sources.filter((source) => ids.includes(source.id));
  if (!found.length) return null;
  return (
    <span className="kb-source-refs">
      {found.map((source) => (
        <a
          key={source.id}
          href={`#source-${source.id}`}
          onClick={() =>
            document
              .getElementById(`source-${source.id}`)
              ?.closest("details")
              ?.setAttribute("open", "")
          }
          title={source.title}
        >
          [{sources.indexOf(source) + 1}]
        </a>
      ))}
    </span>
  );
}
function ClaimCard({ claim, sources }: { claim: Claim; sources: Source[] }) {
  const { copy } = useLocale();
  return (
    <article className="kb-claim">
      <EvidenceBadge kind={claim.kind} />
      <p>
        {claim.text}
        <SourceRefs ids={claim.sourceIds} sources={sources} />
      </p>
      {claim.rationale && <p className="kb-muted kb-small">{claim.rationale}</p>}
      {claim.conflict && <p className="kb-small kb-amber">{copy.conflict}</p>}
    </article>
  );
}

function fitLabels(copy: Messages) {
  return {
    evidence: copy.fitEvidence,
    partial: copy.fitPartial,
    gap: copy.fitGap,
    unknown: copy.fitUnknown,
  };
}
function revenueLabels(copy: Messages) {
  return {
    available: copy.revenueAvailable,
    not_found: copy.revenueNotFound,
    access_failed: copy.revenueAccessFailed,
    identity_unresolved: copy.revenueIdentity,
    conflicting: copy.revenueConflicting,
    skipped: copy.revenueSkipped,
  };
}

type Props = {
  report: Report;
  reportLocale: Locale;
  sample: boolean;
  notice: string;
  openedFromHistory: boolean;
  recommendationContext: RecommendationContext | null;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onEditProfile: () => void;
  onBack: () => void;
};
export function ReportView({
  report,
  reportLocale,
  sample,
  notice,
  openedFromHistory,
  recommendationContext,
  headingRef,
  onEditProfile,
  onBack,
}: Props) {
  const { locale, copy } = useLocale();
  const TABS = getTabs(copy),
    FIT_LABEL = fitLabels(copy),
    REVENUE_LABEL = revenueLabels(copy);
  const [activeTab, setActiveTab] = useState<Tab>("company");
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  async function downloadPdf() {
    if (!report || downloadingPdf) return;
    setDownloadingPdf(true);
    setDownloadError("");
    try {
      const { downloadReportPdf } = await import("@/lib/knowboth/pdf");
      await downloadReportPdf(report, locale);
    } catch {
      setDownloadError(copy.pdfFailed);
    } finally {
      setDownloadingPdf(false);
    }
  }
  function tabKeys(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % TABS.length;
    else if (event.key === "ArrowLeft") next = (index + TABS.length - 1) % TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TABS.length - 1;
    else return;
    event.preventDefault();
    setActiveTab(TABS[next].id);
    document.getElementById(`tab-${TABS[next].id}`)?.focus();
  }

  return (
    <section className="kb-result-column" aria-label={copy.reportLabel}>
      <div className="kb-report-heading">
        <div>
          <p className="kb-eyebrow">YOUR APPLICATION BRIEF</p>
          <h1 ref={headingRef} tabIndex={-1}>
            {report.job.companyDisplayName}
            <span className="kb-sr-only">
              {" "}
              {copy.reportLabel} {sample ? copy.sampleLabel : copy.complete}
            </span>
          </h1>
          <p>{report.job.positionTitle}</p>
        </div>
        <span className={`kb-report-label ${sample ? "kb-sample-label" : ""}`}>
          {sample
            ? copy.sampleLabel
            : report.fitItems === null
              ? copy.companyRole
              : copy.withExperience}
        </span>
      </div>
      {!sample && reportLocale !== locale && (
        <p className="kb-notice">{copy.originalLanguageNotice}</p>
      )}
      {sample && (
        <p className="kb-sample-banner">
          <Info size={16} />
          {copy.sampleDisclaimer}
        </p>
      )}
      <div className="kb-report-meta">
        <span>
          {locale === "en"
            ? `As of ${dateLabel(report.generatedAt, locale)}`
            : `${dateLabel(report.generatedAt, locale)} 기준`}
        </span>
        {safeUrl(report.job.sourceUrl) && (
          <a href={safeUrl(report.job.sourceUrl)!} target="_blank" rel="noopener noreferrer">
            {copy.originalPosting} <ArrowUpRight size={13} />
          </a>
        )}
        <div>
          <button
            type="button"
            onClick={() => void downloadPdf()}
            disabled={downloadingPdf}
            title={copy.pdfTitle}
          >
            {downloadingPdf ? (
              <LoaderCircle size={15} className="kb-spin" />
            ) : (
              <Download size={15} />
            )}
            <span>{downloadingPdf ? copy.pdfBuilding : copy.pdfDownload}</span>
          </button>
        </div>
      </div>
      {notice && (
        <div className="kb-notice" role="status">
          <Info size={16} />
          <p>{notice}</p>
        </div>
      )}
      {downloadError && (
        <p className="kb-download-error" role="alert">
          <Info size={14} />
          {downloadError}
        </p>
      )}
      <div className="kb-report-summary">
        <span className="kb-eyebrow">{copy.summary}</span>
        <p>{report.summary}</p>
      </div>
      <div className="kb-report-tabs" role="tablist" aria-label={copy.reportSections}>
        {TABS.map((tab, index) => (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={(event) => tabKeys(event, index)}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>
      <div
        id="panel-company"
        hidden={activeTab !== "company"}
        role="tabpanel"
        aria-labelledby="tab-company"
        tabIndex={0}
        className={`kb-tab-panel ${activeTab !== "company" ? "kb-inactive" : ""}`}
      >
        <SectionTitle number="01" title={copy.companyTab} text={copy.companyDescription} />
        {report.companyClaims.length ? (
          <div className="kb-surface kb-claims">
            {report.companyClaims.map((claim) => (
              <ClaimCard key={claim.id} claim={claim} sources={report.sources} />
            ))}
          </div>
        ) : (
          <EmptyState
            title={copy.companyUnavailable}
            text={report.sectionStates.company.reason || copy.companyUnavailableDetail}
          />
        )}
        <div className="kb-surface kb-revenue">
          <div className="kb-section-label">
            <h3>{copy.revenueTitle}</h3>
            <span
              className={`kb-badge ${report.revenue.status === "available" ? "kb-sourced" : "kb-unknown"}`}
            >
              {REVENUE_LABEL[report.revenue.status]}
            </span>
          </div>
          {report.revenue.selected ? (
            <>
              <strong className="kb-revenue-amount">
                {moneyLabel(
                  report.revenue.selected.amountDecimal,
                  report.revenue.selected.currency,
                  locale,
                )}
              </strong>
              <p>
                {report.revenue.selected.entityName}
                <SourceRefs ids={report.revenue.selected.sourceIds} sources={report.sources} />
              </p>
              <dl className="kb-revenue-details">
                <div>
                  <dt>{copy.accountingPeriod}</dt>
                  <dd>
                    {report.revenue.selected.periodStart} ~ {report.revenue.selected.periodEnd}
                  </dd>
                </div>
                <div>
                  <dt>{copy.reportingBasis}</dt>
                  <dd>
                    {
                      { annual: copy.annual, quarter: copy.quarter, ytd: copy.ytd }[
                        report.revenue.selected.periodType
                      ]
                    }{" "}
                    ·{" "}
                    {
                      {
                        consolidated: copy.consolidated,
                        separate: copy.separate,
                        unknown: copy.scopeUnknown,
                      }[report.revenue.selected.accountingScope]
                    }
                  </dd>
                </div>
                <div>
                  <dt>{copy.accountLabel}</dt>
                  <dd>{report.revenue.selected.accountLabel}</dd>
                </div>
              </dl>
            </>
          ) : (
            <div className="kb-revenue-unavailable">
              <Info size={22} />
              <p>
                {report.revenue.reason || copy.revenueMissing}
                <span>{copy.revenueNotZero}</span>
              </p>
            </div>
          )}
          {report.revenue.status === "conflicting" &&
            report.revenue.observations.map((item, i) => (
              <p key={i} className="kb-small">
                {item.entityName} · {moneyLabel(item.amountDecimal, item.currency, locale)} ·{" "}
                {item.periodStart} ~ {item.periodEnd} · {item.accountingScope}
                <SourceRefs ids={item.sourceIds} sources={report.sources} />
              </p>
            ))}
        </div>
        {report.businessChanges.length > 0 && (
          <div className="kb-surface">
            <h3>{copy.businessChanges}</h3>
            {report.businessChanges.map((change, i) => (
              <div key={i}>
                <ClaimCard claim={change.claim} sources={report.sources} />
                <p className="kb-small kb-muted">
                  {copy.eventDate} {change.eventDate || copy.unknown} {copy.publishedAt}{" "}
                  {change.publishedAt || copy.unknown}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
      <div
        id="panel-hiring"
        hidden={activeTab !== "hiring"}
        role="tabpanel"
        aria-labelledby="tab-hiring"
        tabIndex={0}
        className={`kb-tab-panel ${activeTab !== "hiring" ? "kb-inactive" : ""}`}
      >
        <SectionTitle number="02" title={copy.hiringTab} text={copy.hiringDescription} />
        {report.roleClaims.length > 0 && (
          <div className="kb-surface kb-claims">
            <h3>{copy.verifiedRole}</h3>
            {report.roleClaims.map((claim) => (
              <ClaimCard key={claim.id} claim={claim} sources={report.sources} />
            ))}
          </div>
        )}
        {report.hiringHypotheses.map((hypothesis, i) => (
          <article key={hypothesis.id} className="kb-surface kb-hypothesis">
            <span className="kb-small kb-muted">
              {copy.hiringTab} {i + 1}
            </span>
            <div className="kb-claim">
              <span
                className={`kb-badge ${hypothesis.kind === "stated" ? "kb-sourced" : "kb-inference"}`}
              >
                {hypothesis.kind === "stated" ? copy.stated : copy.inference}
              </span>
              <p>
                {hypothesis.claim}
                <SourceRefs ids={hypothesis.evidenceSourceIds} sources={report.sources} />
              </p>
            </div>
            {hypothesis.alternative && (
              <div className="kb-alt">
                <strong>{copy.alternative}</strong>
                <p>{hypothesis.alternative}</p>
              </div>
            )}
            <p className="kb-question">
              <span>{copy.askInterview}</span>
              {hypothesis.question}
            </p>
          </article>
        ))}
        {!report.hiringHypotheses.length && (
          <EmptyState title={copy.hiringUnknown} text={copy.hiringUnknownDetail} />
        )}
        {report.requirements.length > 0 && (
          <div className="kb-surface">
            <h3>{copy.requirements}</h3>
            <div className="kb-requirements">
              {report.requirements.map((item) => (
                <div key={item.id}>
                  <span className="kb-category">
                    {
                      {
                        required: copy.required,
                        preferred: copy.preferred,
                        work: copy.work,
                        condition: copy.conditions,
                      }[item.category]
                    }
                  </span>
                  <div>
                    <strong>{item.label}</strong>
                    <p>{item.jobQuote}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div
        id="panel-fit"
        hidden={activeTab !== "fit"}
        role="tabpanel"
        aria-labelledby="tab-fit"
        tabIndex={0}
        className={`kb-tab-panel ${activeTab !== "fit" ? "kb-inactive" : ""}`}
      >
        <SectionTitle number="03" title={copy.fitTab} text={copy.fitDescription} />
        {report.fitItems === null ? (
          <div className="kb-surface kb-add-experience">
            <UserRound size={28} />
            <h3>{copy.addExperienceTitle}</h3>
            <p>
              {copy.addExperienceDetail}
              <br />
              {copy.rerunResearch}
            </p>
            <button type="button" className="kb-secondary" onClick={onEditProfile}>
              <Plus size={16} />
              {copy.addExperience}
            </button>
          </div>
        ) : (
          <>
            <p className="kb-fit-note">
              <Info size={15} />
              {copy.fitDisclaimer}
            </p>
            {report.fitItems.map((item, i) => {
              const req = report.requirements.find((r) => r.id === item.requirementId);
              return (
                <article key={i} className="kb-surface kb-fit-item">
                  <div className="kb-section-label">
                    <span className="kb-category">
                      {req?.category === "preferred"
                        ? copy.preferred
                        : req?.category === "work"
                          ? copy.mainWork
                          : copy.required}
                    </span>
                    <span className={`kb-badge kb-fit-${item.status}`}>
                      {FIT_LABEL[item.status]}
                    </span>
                  </div>
                  <h3>{req?.label || copy.requiredSkill}</h3>
                  {req && (
                    <p className="kb-job-quote">
                      {copy.postingQuote} {req.jobQuote}
                    </p>
                  )}
                  {item.profileQuote && (
                    <blockquote>
                      <span>{copy.experienceQuote}</span>
                      {item.profileQuote}
                    </blockquote>
                  )}
                  <p>{item.reason}</p>
                  {item.followUpQuestion && (
                    <p className="kb-question">
                      <span>{copy.followUp}</span>
                      {item.followUpQuestion}
                    </p>
                  )}
                </article>
              );
            })}
            {!report.fitItems.length && (
              <EmptyState
                title={copy.fitEmpty}
                text={report.sectionStates.personalization.reason || copy.fitEmptyDetail}
              />
            )}
          </>
        )}
        {!!report.conditionChecks?.length && (
          <div className="kb-surface">
            <h3>{copy.conditions}</h3>
            {report.conditionChecks.map((item, i) => (
              <div className="kb-condition" key={i}>
                <strong>
                  {report.requirements.find((r) => r.id === item.requirementId)?.label}
                </strong>
                <span className="kb-badge kb-unknown">
                  {
                    {
                      met: copy.conditionMet,
                      not_met: copy.conditionNotMet,
                      unknown: copy.needsVerification,
                    }[item.status]
                  }
                </span>
                <p>{item.reason}</p>
              </div>
            ))}
          </div>
        )}
        {report.preferenceQuestions.length > 0 && (
          <div className="kb-surface">
            <h3>{copy.companyConditions}</h3>
            {report.preferenceQuestions.map((item, i) => (
              <p className="kb-question" key={i}>
                <span>{item.preferenceQuote}</span>
                {item.question}
              </p>
            ))}
          </div>
        )}
      </div>
      <div
        id="panel-prepare"
        hidden={activeTab !== "prepare"}
        role="tabpanel"
        aria-labelledby="tab-prepare"
        tabIndex={0}
        className={`kb-tab-panel ${activeTab !== "prepare" ? "kb-inactive" : ""}`}
      >
        <SectionTitle number="04" title={copy.prepareTab} text={copy.prepareDescription} />
        {(["highlight", "prepare", "ask"] as const).map((kind) => {
          const items = report.actions.filter((item) => item.kind === kind);
          if (!items.length) return null;
          return (
            <div className="kb-surface kb-action-group" key={kind}>
              <h3>
                {kind === "highlight"
                  ? copy.highlightExperience
                  : kind === "prepare"
                    ? copy.prepareFirst
                    : copy.interviewQuestions}
              </h3>
              {items.map((item, i) => (
                <article className="kb-action" key={i}>
                  <span className="kb-action-number">{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <h4>{item.title}</h4>
                    {item.profileQuote && <blockquote>{item.profileQuote}</blockquote>}
                    {item.deliverable && (
                      <p>
                        <strong>{copy.deliverable}</strong>
                        {item.deliverable}
                      </p>
                    )}
                    {item.doneWhen && (
                      <p>
                        <strong>{copy.doneWhen}</strong>
                        {item.doneWhen}
                      </p>
                    )}
                    {item.requirementIds.length > 0 && (
                      <div className="kb-linked-requirements">
                        {item.requirementIds.map((id) => (
                          <span key={id}>
                            {report.requirements.find((req) => req.id === id)?.label || id}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          );
        })}
        {!report.actions.length && (
          <EmptyState
            title={copy.prepareEmpty}
            text={report.sectionStates.preparation.reason || copy.prepareEmptyDetail}
          />
        )}
      </div>
      <details className="kb-sources" open>
        <summary>
          <BookOpen size={16} />
          {copy.sources} <span>{report.sources.length}</span>
          <ChevronDown size={16} />
        </summary>
        <div>
          {report.warnings.map((warning, i) => (
            <p className="kb-source-warning" key={i}>
              <Info size={14} />
              {warning}
            </p>
          ))}
          {report.sources.map((source, index) => (
            <article id={`source-${source.id}`} className="kb-source" key={source.id}>
              <span className="kb-source-number">{index + 1}</span>
              <div>
                {safeUrl(source.url) ? (
                  <a href={safeUrl(source.url)!} target="_blank" rel="noopener noreferrer">
                    {source.title}
                    <ExternalLink size={12} />
                  </a>
                ) : (
                  <strong>{source.title}</strong>
                )}
                <p>
                  {source.publisher || copy.publisherUnknown} ·{" "}
                  {source.evidenceMode === "raw_text"
                    ? copy.rawText
                    : source.evidenceMode === "provider_citation"
                      ? copy.providerCitation
                      : copy.userProvided}
                </p>
                <p>
                  {copy.publishedDate} {source.publishedAt || copy.unknown} {copy.retrievedDate}{" "}
                  {dateLabel(source.retrievedAt, locale)}
                </p>
                {source.excerpt && source.kind !== "job" && (
                  <details className="kb-excerpt">
                    <summary>{copy.viewEvidence}</summary>
                    <p>{source.excerpt}</p>
                  </details>
                )}
              </div>
            </article>
          ))}
        </div>
      </details>
      <RecommendedJobs
        locale={locale}
        key={report.analysisId}
        context={
          recommendationContext?.analysisId === report.analysisId ? recommendationContext : null
        }
        sample={sample}
        onEditProfile={onEditProfile}
      />
      <div className="kb-report-end">
        <button type="button" className="kb-secondary" onClick={onBack}>
          {copy.analyzeAnother} <ArrowRight size={16} />
        </button>
        {!sample && (
          <button type="button" className="kb-text-button" onClick={onEditProfile}>
            {openedFromHistory ? copy.recheckEdit : copy.editExperience}
          </button>
        )}
      </div>
    </section>
  );
}
function SectionTitle({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <div className="kb-section-title">
      <span>{number}</span>
      <div>
        <h2>{title}</h2>
        <p>{text}</p>
      </div>
    </div>
  );
}
function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="kb-surface kb-empty">
      <Info size={23} />
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
