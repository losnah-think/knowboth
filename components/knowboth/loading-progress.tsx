import { Check, LoaderCircle } from "lucide-react";
import { useLocale } from "@/components/locale-provider";
type ProgressState = "complete" | "current" | "upcoming";
export function LoadingProgress({
  phase,
  includeProfile,
}: {
  phase: "job" | "analysis";
  includeProfile: boolean;
}) {
  const { copy } = useLocale();
  const steps: { title: string; detail: string; state: ProgressState }[] =
    phase === "job"
      ? [
          { title: copy.checkJob, detail: copy.findingJob, state: "current" },
          { title: copy.optionalResume, detail: copy.resumeLater, state: "upcoming" },
          { title: copy.analyzeCompany, detail: copy.researchScope, state: "upcoming" },
          { title: copy.showReport, detail: copy.reportEvidence, state: "upcoming" },
        ]
      : [
          { title: copy.checkJob, detail: copy.jobConfirmed, state: "complete" },
          {
            title: includeProfile ? copy.resumeAdded : copy.continueWithout,
            detail: includeProfile ? copy.experienceIncluded : copy.companyOnly,
            state: "complete",
          },
          {
            title: copy.analyzeCompany,
            detail: includeProfile ? copy.researchWithProfile : copy.researchWithoutProfile,
            state: "current",
          },
          { title: copy.showReport, detail: copy.reportWhenReady, state: "upcoming" },
        ];
  const stateLabel = { complete: copy.complete, current: copy.inProgress, upcoming: copy.upcoming };
  return (
    <div className="kb-progress" aria-label={copy.progressLabel}>
      <div className="kb-progress-track" aria-hidden="true">
        <span />
      </div>
      <ol>
        {steps.map((step, index) => (
          <li
            key={step.title}
            className={`kb-progress-${step.state}`}
            aria-current={step.state === "current" ? "step" : undefined}
          >
            <span className="kb-progress-marker" aria-hidden="true">
              {step.state === "complete" ? (
                <Check size={14} />
              ) : step.state === "current" ? (
                <LoaderCircle size={15} className="kb-spin" />
              ) : (
                index + 1
              )}
            </span>
            <div>
              <strong>{step.title}</strong>
              <p>{step.detail}</p>
            </div>
            <span className="kb-progress-state">{stateLabel[step.state]}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
