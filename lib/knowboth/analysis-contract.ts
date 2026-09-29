import type { Locale } from "../i18n/locale";
import type { Claim, CompanyHint, JobInput, ProfileInput, Revenue, Source } from "./schema";

/** Provider-independent, verified company research passed into report generation. */
export type CompanyResearch = {
  identity: {
    displayName: string;
    legalName: string | null;
    website: string | null;
    corpCode: string | null;
    status: "matched" | "ambiguous" | "unresolved";
    note: string;
    sourceIds: string[];
    candidates: Array<{
      displayName: string;
      legalName: string | null;
      website: string | null;
      sourceIds: string[];
    }>;
  };
  sources: Source[];
  companyClaims: Claim[];
  businessChanges: Array<{
    claim: string;
    eventDate: string | null;
    publishedAt: string | null;
    sourceIds: string[];
  }>;
  revenue: Revenue;
  warnings: string[];
};

/** The application needs these operations, independent of the provider's API. */
export type AnalysisServices = {
  researchCompany(
    job: JobInput,
    signal: AbortSignal,
    companyHint: CompanyHint | null,
    locale: Locale,
  ): Promise<CompanyResearch>;
  analyzeJob(
    job: JobInput,
    profile: ProfileInput | null,
    research: CompanyResearch,
    signal: AbortSignal,
    locale: Locale,
  ): Promise<unknown>;
};

export class AnalysisServiceError extends Error {
  constructor(
    public readonly code:
      | "configuration"
      | "credentials"
      | "rate_limit"
      | "model"
      | "upstream"
      | "incomplete"
      | "refusal"
      | "invalid_research"
      | "invalid_report",
    public readonly retryable: boolean,
  ) {
    super(code);
    this.name = "AnalysisServiceError";
  }
}
