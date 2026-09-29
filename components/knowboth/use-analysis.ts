"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { reportSchema, type JobInput, type Report } from "@/lib/knowboth/schema";
import type { RecommendationContext } from "@/lib/knowboth/client-api";
import {
  storedAnalysis,
  readStoredHistory,
  writeStoredHistory,
  type StoredAnalysis,
} from "@/lib/knowboth/history";
import {
  requestJob,
  requestAnalysis,
  ApiRequestError,
  type CompanyCandidate,
} from "@/lib/knowboth/client-api";
import { extractResumeText } from "@/lib/knowboth/resume-file";
import { useLocale } from "@/components/locale-provider";
import { sampleReport } from "@/lib/knowboth/sample-report";
import { extractWantedJobUrl } from "@/lib/knowboth/wanted-url";
export const MAX_TEXT = 20_000;
type View = "search" | "job" | "profile" | "analysis" | "choice" | "report";
function extractHttpUrl(value: string) {
  return extractWantedJobUrl(value) || value.trim();
}
function scrollBehavior(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}
export function useAnalysis() {
  const { locale, copy } = useLocale();

  const [view, setView] = useState<View>("search");
  const [url, setUrl] = useState("");
  const [jobPreview, setJobPreview] = useState<{
    company: string;
    position: string;
    sourceUrl: string | null;
  } | null>(null);
  const [experience, setExperience] = useState("");
  const [preferences, setPreferences] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState("");
  const [reading, setReading] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [needsJobRefresh, setNeedsJobRefresh] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [recommendationContext, setRecommendationContext] = useState<RecommendationContext | null>(
    null,
  );
  const [sample, setSample] = useState(false);
  const [reportLocale, setReportLocale] = useState(locale);
  const [candidates, setCandidates] = useState<CompanyCandidate[]>([]);
  const [savedAnalyses, setSavedAnalyses] = useState<StoredAnalysis[]>([]);
  const [openedFromHistory, setOpenedFromHistory] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const reportRef = useRef<HTMLElement>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const confirmedJob = useRef<JobInput | null>(null);
  const confirmedJobProof = useRef("");
  const confirmedUrl = useRef("");
  const savedAnalysesRef = useRef<StoredAnalysis[]>([]);
  // Invalidate stale responses, including transports that finish after cancellation.
  const generation = useRef(0);
  const [profileIncluded, setProfileIncluded] = useState(true);
  const previousView = useRef<View>("search");
  const working = view === "job" || view === "analysis";
  const statusMessage =
    view === "job"
      ? copy.statusJob
      : view === "analysis"
        ? copy.statusAnalysis
        : view === "profile"
          ? copy.statusProfile
          : view === "report"
            ? sample
              ? copy.statusSample
              : copy.statusReport
            : view === "choice"
              ? copy.statusChoice
              : "";
  useEffect(() => {
    if (view === previousView.current && view !== "report") return;
    if (view === "search") urlRef.current?.focus({ preventScroll: true });
    else resultHeadingRef.current?.focus({ preventScroll: true });
    reportRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
    previousView.current = view;
  }, [view, report]);
  useEffect(() => {
    const historyTimer = window.setTimeout(() => {
      const stored = readStoredHistory();
      savedAnalysesRef.current = stored;
      setSavedAnalyses(stored);
    }, 0);
    return () => {
      window.clearTimeout(historyTimer);
      generation.current += 1;
      controller.current?.abort();
    };
  }, []);

  function clearConfirmedJob() {
    confirmedJob.current = null;
    confirmedJobProof.current = "";
    confirmedUrl.current = "";
    setJobPreview(null);
    setCandidates([]);
  }
  function backToSearch() {
    setError("");
    setNotice("");
    setView("search");
  }
  function goHome() {
    generation.current += 1;
    controller.current?.abort();
    setError("");
    setNotice("");
    setView("search");
  }
  function editProfile() {
    setError("");
    setProfileOpen(true);
    if (
      confirmedJob.current &&
      confirmedJobProof.current &&
      confirmedUrl.current === extractHttpUrl(url)
    ) {
      setNotice("");
      setView("profile");
      return;
    }
    setNeedsJobRefresh(true);
    setNotice(copy.historyRecheck);
    setView("search");
  }
  function rememberReport(nextReport: Report, originalUrl: string) {
    const parsed = reportSchema.safeParse(nextReport);
    if (!parsed.success || parsed.data.analysisId === "sample") return;
    const record = storedAnalysis(
      parsed.data,
      originalUrl || parsed.data.job.sourceUrl || "",
      locale,
    );
    const next = [record, ...savedAnalysesRef.current.filter((item) => item.id !== record.id)];
    const stored = writeStoredHistory(next);
    savedAnalysesRef.current = stored.records;
    setSavedAnalyses(stored.records);
    if (!stored.persisted || !stored.records.some((item) => item.id === record.id))
      setNotice(copy.historySaveFailed);
  }
  function openSavedAnalysis(item: StoredAnalysis) {
    const parsed = reportSchema.safeParse(item.report);
    if (!parsed.success) return;
    clearConfirmedJob();
    setUrl(item.originalUrl);
    setReport(parsed.data);
    setReportLocale(item.locale);
    setRecommendationContext(null);
    setSample(false);
    setOpenedFromHistory(true);

    setNotice("");
    setView("report");
  }
  function deleteSavedAnalysis(id: string) {
    const stored = writeStoredHistory(savedAnalysesRef.current.filter((item) => item.id !== id));
    savedAnalysesRef.current = stored.records;
    setSavedAnalyses(stored.records);
    if (!stored.persisted) setNotice(copy.historyDeleteFailed);
  }
  async function readResume(file: File) {
    const fileGeneration = generation.current;
    setReading(true);
    setFileError("");
    try {
      const text = await extractResumeText(file, locale);
      if (fileGeneration !== generation.current) return;
      setExperience(text.trim());
      setFileName(file.name);
      setProfileOpen(true);
      if (text.trim().length > MAX_TEXT) setFileError(copy.fileTextTooLong);
    } catch (cause) {
      if (fileGeneration === generation.current)
        setFileError(
          cause instanceof Error &&
            [copy.fileTooLarge, copy.pdfTooLong, copy.fileUnsupported, copy.fileEmpty].includes(
              cause.message,
            )
            ? cause.message
            : copy.fileReadFailed,
        );
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function importJob(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!url.trim()) {
      setError(copy.urlRequired);
      urlRef.current?.focus();
      return;
    }
    setView("job");
    setCandidates([]);
    controller.current?.abort();
    const requestId = ++generation.current;
    const current = new AbortController();
    controller.current = current;
    try {
      const result = await requestJob(extractHttpUrl(url), locale, current.signal);
      if (generation.current !== requestId || current.signal.aborted) return;
      confirmedJob.current = result.job;
      confirmedJobProof.current = result.jobProof;
      confirmedUrl.current = extractHttpUrl(url);
      setJobPreview({
        company: result.job.companyDisplayName,
        position: result.job.positionTitle,
        sourceUrl: result.job.sourceUrl,
      });
      setNeedsJobRefresh(false);
      setView("profile");
    } catch (cause) {
      if (generation.current !== requestId) return;
      setView("search");
      if (current.signal.aborted) setNotice(copy.jobCancelled);
      else setError(cause instanceof ApiRequestError ? cause.message : copy.jobNotFound);
    }
  }

  async function analyze(
    event?: FormEvent,
    choice?: CompanyCandidate | "skip_financials",
    includeProfile = true,
  ) {
    event?.preventDefault();
    setError("");
    setNotice("");
    const withProfile = choice ? profileIncluded : includeProfile;
    if (withProfile && experience.length > MAX_TEXT) {
      setError(copy.experienceTooLong);
      document.getElementById("experience")?.focus();
      return;
    }
    const job = confirmedJob.current;
    if (!job || !confirmedJobProof.current || confirmedUrl.current !== extractHttpUrl(url)) {
      clearConfirmedJob();
      setNeedsJobRefresh(true);
      setError(copy.jobRecheck);
      setView("search");
      return;
    }
    setProfileIncluded(withProfile);
    setView("analysis");
    setCandidates([]);
    controller.current?.abort();
    const requestId = ++generation.current;
    const current = new AbortController();
    controller.current = current;
    const submittedProfile =
      withProfile && experience.trim()
        ? {
            experienceText: experience.trim(),
            desiredWork: preferences.trim() || null,
            constraints: null,
            additionalAnswers: [],
          }
        : null;
    const submittedProof = confirmedJobProof.current;
    try {
      const result = await requestAnalysis(
        {
          job,
          profile: submittedProfile,
          companyHint:
            choice && choice !== "skip_financials"
              ? {
                  legalName: choice.legalName || choice.displayName,
                  website: choice.website || null,
                }
              : null,
          companyResolution:
            choice === "skip_financials" ? "skip_financials" : choice ? "selected" : "auto",
        },
        submittedProof,
        locale,
        current.signal,
      );
      if (generation.current !== requestId || current.signal.aborted) return;
      if ("type" in result) {
        setCandidates(result.candidates);
        setNotice(result.message || copy.companyAmbiguous);
        setView("choice");
      } else {
        setReport(result.report);
        setReportLocale(locale);
        setSample(false);
        setOpenedFromHistory(false);
        setRecommendationContext({
          analysisId: result.report.analysisId,
          job,
          profile: submittedProfile,
          jobProof: submittedProof,
        });
        rememberReport(
          result.report,
          result.report.job.sourceUrl || confirmedUrl.current || url.trim(),
        );
        setView("report");
      }
    } catch (cause) {
      if (generation.current !== requestId) return;
      if (cause instanceof ApiRequestError && cause.code === "JOB_PROOF_INVALID") {
        clearConfirmedJob();
        setNeedsJobRefresh(true);
        setError(copy.proofExpired);
        setView("search");
        return;
      }
      setView("profile");
      if (current.signal.aborted) setNotice(copy.analysisCancelled);
      else setError(cause instanceof ApiRequestError ? cause.message : copy.connectionFailed);
    }
  }
  function cancel() {
    generation.current += 1;
    controller.current?.abort();
    setView(view === "job" ? "search" : "profile");
    setNotice(view === "job" ? copy.jobCancelled : copy.analysisCancelled);
  }
  function showSample() {
    setCandidates([]);
    setError("");
    setNotice("");
    setReport(sampleReport(locale));
    setSample(true);
    setOpenedFromHistory(false);
    setView("report");
  }
  return {
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
  };
}
