"use client";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  History as HistoryIcon,
  House,
  Info,
  Link2,
  LoaderCircle,
  LockKeyhole,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { safeUrl } from "@/lib/knowboth/urls";
import { dateLabel } from "@/lib/i18n/format";
import { sampleReport } from "@/lib/knowboth/sample-report";
import { LoadingProgress } from "@/components/knowboth/loading-progress";
import { ReportView } from "@/components/knowboth/report-view";
import { useAnalysis, MAX_TEXT } from "@/components/knowboth/use-analysis";
import { LanguageSwitcher } from "@/components/locale-provider";

export default function KnowBothApp() {
  const {
    locale,
    copy,
    view,
    setView,
    url,
    setUrl,
    jobPreview,
    experience,
    setExperience,
    preferences,
    setPreferences,
    fileName,
    fileError,
    reading,
    profileOpen,
    setProfileOpen,
    error,
    setError,
    notice,
    setNotice,
    needsJobRefresh,
    setNeedsJobRefresh,
    report,
    reportLocale,
    recommendationContext,
    sample,
    candidates,
    savedAnalyses,
    openedFromHistory,
    fileRef,
    reportRef,
    resultHeadingRef,
    urlRef,
    profileIncluded,
    working,
    statusMessage,
    clearConfirmedJob,
    backToSearch,
    goHome,
    editProfile,
    openSavedAnalysis,
    deleteSavedAnalysis,
    readResume,
    importJob,
    analyze,
    showSample,
    cancel,
  } = useAnalysis();
  const feedback = (
    <>
      {notice && (
        <div className="kb-notice" role="status">
          <Info size={16} />
          <p>{notice}</p>
        </div>
      )}
      {error && (
        <div id="search-error" className="kb-error" role="alert">
          <Info size={17} />
          <p>{error}</p>
        </div>
      )}
    </>
  );
  return (
    <div className={`kb-app ${view === "search" ? "kb-search-page" : ""}`}>
      <a className="kb-skip" href="#analysis-content">
        {copy.skipContent}
      </a>
      <header className={`kb-header ${view === "search" ? "kb-header-home" : ""}`}>
        {view !== "search" ? (
          <button type="button" className="kb-brand" aria-label={copy.homeLabel} onClick={goHome}>
            <span className="kb-logo" aria-hidden="true">
              <span />
              <span />
            </span>
            KnowBoth
          </button>
        ) : (
          <span className="kb-header-caption">{copy.headerCaption}</span>
        )}
        <div className="kb-header-actions">
          <LanguageSwitcher disabled={working || reading} />
          {view !== "search" && (
            <button type="button" className="kb-home-button" onClick={goHome}>
              <House size={15} />
              {copy.home}
            </button>
          )}
        </div>
      </header>
      <p className="kb-sr-only" role="status" aria-live="polite" aria-atomic="true">
        {statusMessage}
      </p>
      <main
        ref={reportRef}
        id="analysis-content"
        tabIndex={-1}
        className={`kb-main ${view === "search" ? "kb-search-main" : view === "report" ? "kb-report-main" : "kb-flow-main"}`}
        aria-busy={working}
      >
        {view === "search" && (
          <section className="kb-search-home" aria-labelledby="search-title">
            <div className="kb-search-brand">
              <span className="kb-logo" aria-hidden="true">
                <span />
                <span />
              </span>
              <h1 id="search-title">KnowBoth</h1>
            </div>
            <p className="kb-search-copy">
              {copy.heroFirst} <br />
              {copy.heroSecond}
            </p>
            <form
              className="kb-search-form"
              onSubmit={(event) => void importJob(event)}
              aria-label={copy.searchForm}
            >
              <label className="kb-url-label" htmlFor="job-url">
                {copy.urlLabel}
              </label>
              <div className="kb-search-bar">
                <Link2 size={20} aria-hidden="true" />
                <input
                  ref={urlRef}
                  id="job-url"
                  type="text"
                  inputMode="url"
                  required
                  value={url}
                  onChange={(event) => {
                    setUrl(event.target.value);
                    clearConfirmedJob();
                    setNeedsJobRefresh(false);
                    setError("");
                    setNotice("");
                  }}
                  placeholder={copy.urlPlaceholder}
                  autoComplete="off"
                  aria-describedby={error ? "job-url-hint search-error" : "job-url-hint"}
                  aria-invalid={!!error}
                />
                <button type="submit">
                  {needsJobRefresh ? copy.verifyAgain : copy.analyze}
                  <ArrowRight size={17} aria-hidden="true" />
                </button>
              </div>
              <p id="job-url-hint" className="kb-search-hint">
                {copy.platformHint}
              </p>
              <p className="kb-search-description">{copy.searchHint}</p>
              {feedback}
            </form>
            <div className="kb-home-links">
              <button type="button" className="kb-secondary kb-sample-button" onClick={showSample}>
                {copy.viewSample} <ArrowUpRight size={14} />
              </button>
              {report && (
                <button type="button" className="kb-text-button" onClick={() => setView("report")}>
                  {copy.previousReport}
                </button>
              )}
            </div>
            {savedAnalyses.length > 0 && (
              <section className="kb-history" aria-labelledby="history-title">
                <div className="kb-history-heading">
                  <HistoryIcon size={17} aria-hidden="true" />
                  <div>
                    <h2 id="history-title">{copy.recentAnalyses}</h2>
                    <p>
                      <LockKeyhole size={11} />
                      {copy.localHistory}
                    </p>
                  </div>
                </div>
                <ul>
                  {savedAnalyses.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className="kb-history-open"
                        onClick={() => openSavedAnalysis(item)}
                      >
                        <span>
                          <strong>{item.company}</strong>
                          <small>{item.position}</small>
                        </span>
                        <time dateTime={item.generatedAt}>
                          {dateLabel(item.generatedAt, locale)}
                        </time>
                        <ArrowRight size={15} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="kb-history-delete"
                        onClick={() => deleteSavedAnalysis(item.id)}
                        aria-label={`${copy.deleteHistory}: ${item.company} ${item.position}`}
                        title={copy.deleteHistory}
                      >
                        <Trash2 size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </section>
        )}
        {view === "profile" && jobPreview && (
          <section className="kb-profile-card kb-input-card" aria-labelledby="profile-title">
            <button
              type="button"
              className="kb-text-button kb-back"
              onClick={backToSearch}
              disabled={reading}
            >
              <ArrowLeft size={15} />
              {copy.changeJob}
            </button>
            <p className="kb-confirmed-label">
              <Check size={14} />
              {copy.postingVerified}
            </p>
            <h1 ref={resultHeadingRef} tabIndex={-1} id="profile-title">
              {jobPreview.company}
            </h1>
            <p className="kb-position-title">{jobPreview.position}</p>
            {safeUrl(jobPreview?.sourceUrl) && (
              <a
                className="kb-original-link"
                href={safeUrl(url)!}
                target="_blank"
                rel="noopener noreferrer"
              >
                {copy.originalPosting} <ArrowUpRight size={12} />
              </a>
            )}
            <div className="kb-input-divider" />
            <h2>{copy.personalizeTitle}</h2>
            <p className="kb-profile-intro">{copy.personalizeIntro}</p>
            <form onSubmit={(event) => void analyze(event)} aria-label={copy.profileForm}>
              <label className="kb-sr-only" htmlFor="resume-file">
                {copy.addResume}
              </label>
              <input
                ref={fileRef}
                id="resume-file"
                type="file"
                accept=".pdf,.docx,.txt,.md"
                className="kb-sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void readResume(file);
                }}
                disabled={reading}
              />
              <button
                className="kb-upload"
                type="button"
                disabled={reading}
                onClick={() => fileRef.current?.click()}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const file = event.dataTransfer.files[0];
                  if (file && !reading) void readResume(file);
                }}
              >
                {reading ? <LoaderCircle size={23} className="kb-spin" /> : <Upload size={23} />}
                <strong>{reading ? copy.readingFile : fileName || copy.addResume}</strong>
                <span>{copy.fileFormats}</span>
              </button>
              {fileError && (
                <p className="kb-inline-error" role="alert">
                  {fileError}
                </p>
              )}
              <button
                type="button"
                className="kb-text-button kb-manual-toggle"
                aria-expanded={profileOpen}
                aria-controls="profile-input"
                onClick={() => setProfileOpen(!profileOpen)}
              >
                {profileOpen ? copy.collapseExperience : copy.pasteExperience}
                <ChevronDown size={15} className={profileOpen ? "kb-rotated" : ""} />
              </button>
              {profileOpen && (
                <div id="profile-input" className="kb-profile-fields">
                  <label htmlFor="experience">
                    {fileName ? copy.extractedExperience : copy.myExperience}
                  </label>
                  <textarea
                    id="experience"
                    value={experience}
                    onChange={(event) => setExperience(event.target.value)}
                    placeholder={copy.experiencePlaceholder}
                    rows={6}
                    disabled={reading}
                    aria-describedby="experience-hint experience-count"
                    aria-invalid={experience.length > MAX_TEXT}
                  />
                  <p
                    id="experience-count"
                    className={`kb-count ${experience.length > MAX_TEXT ? "kb-danger" : ""}`}
                  >
                    {experience.length.toLocaleString(locale === "en" ? "en-US" : "ko-KR")}
                    {copy.characterLimit}
                  </p>
                  <p id="experience-hint" className="kb-field-hint">
                    {copy.removePrivateDetails}
                  </p>
                  <label htmlFor="preferences">
                    {copy.preferencesLabel} <span className="kb-optional">{copy.optional}</span>
                  </label>
                  <input
                    id="preferences"
                    value={preferences}
                    onChange={(event) => setPreferences(event.target.value)}
                    placeholder={copy.preferencesPlaceholder}
                    maxLength={1000}
                  />
                </div>
              )}
              {feedback}
              <div className="kb-profile-actions">
                <button
                  type="submit"
                  className="kb-primary"
                  disabled={reading || !experience.trim()}
                >
                  <Sparkles size={16} />
                  {copy.analyzeWithProfile}
                  <ArrowRight size={17} />
                </button>
                <button
                  type="button"
                  className="kb-without-resume"
                  disabled={reading}
                  onClick={() => void analyze(undefined, undefined, false)}
                >
                  {copy.continueWithout} <ArrowRight size={15} />
                </button>
              </div>
              <p className="kb-privacy">
                <LockKeyhole size={12} />
                <span>
                  {copy.privacy} {copy.savedReportPrivacy}
                </span>
              </p>
            </form>
            {report && (
              <button
                type="button"
                className="kb-text-button kb-previous-report"
                disabled={reading}
                onClick={() => setView("report")}
              >
                {copy.previousReport} <ArrowUpRight size={13} />
              </button>
            )}
          </section>
        )}
        {working && (
          <section className="kb-analysis-loading" aria-labelledby="loading-title">
            <span className="kb-loading-symbol" aria-hidden="true">
              <LoaderCircle size={30} className="kb-spin" />
            </span>
            <p className="kb-eyebrow">
              {view === "job" ? "READING THE OPPORTUNITY" : "CONNECTING THE DOTS"}
            </p>
            <h1 ref={resultHeadingRef} tabIndex={-1} id="loading-title">
              {view === "job" ? copy.loadingJob : copy.loadingCompany}
            </h1>
            <p className="kb-loading-copy">
              {view === "job"
                ? copy.loadingJobDetail
                : `${jobPreview?.company || copy.targetCompany} · ${copy.researchScope}`}
            </p>
            {view === "job" && (
              <div className="kb-loading-url">
                <Link2 size={15} />
                <span>{url}</span>
              </div>
            )}
            <LoadingProgress
              phase={view === "job" ? "job" : "analysis"}
              includeProfile={profileIncluded && !!experience.trim()}
            />
            <p className="kb-loading-note">
              {view === "job" ? copy.resumeAfterCheck : copy.loadingNext}
            </p>
            <button type="button" className="kb-text-button" onClick={cancel}>
              {copy.stopAndBack}
            </button>
          </section>
        )}
        {view === "choice" && (
          <section className="kb-profile-card kb-company-choice">
            <h1 ref={resultHeadingRef} tabIndex={-1}>
              {copy.confirmCompany}
            </h1>
            <p>{notice || copy.selectEntity}</p>
            {candidates.map((candidate, index) => (
              <button key={index} type="button" onClick={() => void analyze(undefined, candidate)}>
                <strong>{candidate.legalName || candidate.displayName}</strong>
                <span>{candidate.website || copy.websiteUnknown}</span>
                <ArrowRight size={16} />
              </button>
            ))}
            <button
              className="kb-text-button"
              type="button"
              onClick={() => void analyze(undefined, "skip_financials")}
            >
              {copy.skipExternal} <ArrowRight size={15} />
            </button>
            <button
              className="kb-text-button kb-back"
              type="button"
              onClick={() => setView("profile")}
            >
              <ArrowLeft size={14} />
              {copy.back}
            </button>
          </section>
        )}
        {view === "report" && report && (
          <ReportView
            report={sample ? sampleReport(locale) : report}
            reportLocale={reportLocale}
            sample={sample}
            notice={notice}
            openedFromHistory={openedFromHistory}
            recommendationContext={recommendationContext}
            headingRef={resultHeadingRef}
            onEditProfile={editProfile}
            onBack={backToSearch}
          />
        )}
      </main>
      <footer className="kb-footer">Know the company. Know yourself.</footer>
    </div>
  );
}
