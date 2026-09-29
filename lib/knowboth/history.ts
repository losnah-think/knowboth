import { reportSchema, type Report } from "./schema";
import { safeUrl } from "./urls";
import { resolveLocale, type Locale } from "../i18n/locale";
const HISTORY_STORAGE_KEY = "knowboth.analysis-history.v1";
const HISTORY_MAX_COUNT = 10;
const HISTORY_MAX_CHARS = 2_000_000;
export type StoredAnalysis = {
  locale: Locale;
  id: string;
  originalUrl: string;
  generatedAt: string;
  company: string;
  position: string;
  report: Report;
};
export function storedAnalysis(
  report: Report,
  originalUrl: string,
  locale: Locale = "ko",
): StoredAnalysis {
  return {
    locale,
    id: report.analysisId,
    originalUrl: report.job.sourceUrl || originalUrl,
    generatedAt: report.generatedAt,
    company: report.job.companyDisplayName,
    position: report.job.positionTitle,
    report,
  };
}
export function trimHistory(records: StoredAnalysis[]) {
  const next = records.slice(0, HISTORY_MAX_COUNT);
  while (next.length && JSON.stringify(next).length > HISTORY_MAX_CHARS) next.pop();
  return next;
}
export function readStoredHistory(storage?: Storage): StoredAnalysis[] {
  try {
    const value: unknown = JSON.parse(
      (storage ?? window.localStorage).getItem(HISTORY_STORAGE_KEY) || "[]",
    );
    if (!Array.isArray(value)) return [];
    const records: StoredAnalysis[] = [];
    for (const item of value) {
      if (!item || typeof item !== "object") continue;
      const candidate = item as { report?: unknown; originalUrl?: unknown; locale?: unknown };
      const parsed = reportSchema.safeParse(candidate.report);
      if (!parsed.success || parsed.data.analysisId === "sample") continue;
      const originalUrl =
        (typeof candidate.originalUrl === "string" ? safeUrl(candidate.originalUrl) : null) ||
        parsed.data.job.sourceUrl ||
        "";
      records.push(storedAnalysis(parsed.data, originalUrl, resolveLocale(candidate.locale, "ko")));
    }
    return trimHistory(records);
  } catch {
    return [];
  }
}
export function writeStoredHistory(records: StoredAnalysis[], storage?: Storage) {
  const next = trimHistory(records);
  if (!next.length) {
    if (records.length) return { records: readStoredHistory(storage), persisted: false };
    try {
      (storage ?? window.localStorage).removeItem(HISTORY_STORAGE_KEY);
      return { records: [], persisted: true };
    } catch {
      return { records: readStoredHistory(storage), persisted: false };
    }
  }
  while (next.length) {
    try {
      (storage ?? window.localStorage).setItem(HISTORY_STORAGE_KEY, JSON.stringify(next));
      return { records: next, persisted: true };
    } catch {
      next.pop();
    }
  }
  return { records: readStoredHistory(storage), persisted: false };
}
