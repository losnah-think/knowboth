"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Building2, Check, ChevronDown, Download, ExternalLink, History as HistoryIcon, House, Info, Link2, LoaderCircle, LockKeyhole, Plus, Search, Sparkles, Target, Trash2, Upload, UserRound } from "lucide-react";
import { reportSchema, type JobInput, type Report } from "@/lib/knowboth/schema";

const MAX_TEXT = 20_000;
const HISTORY_STORAGE_KEY = "knowboth.analysis-history.v1";
const HISTORY_MAX_COUNT = 10;
const HISTORY_MAX_CHARS = 2_000_000;
const TABS = [
  { id: "company", label: "기업 이해", icon: Building2 },
  { id: "hiring", label: "채용 배경", icon: Search },
  { id: "fit", label: "나와 비교", icon: UserRound },
  { id: "prepare", label: "지원 준비", icon: Target },
] as const;
type Tab = typeof TABS[number]["id"];
type View = "search" | "job" | "profile" | "analysis" | "choice" | "report";
type Claim = Report["companyClaims"][number];
type Source = Report["sources"][number];
type CompanyCandidate = { legalName?: string; displayName?: string; name?: string; website?: string | null; reason?: string };
type StoredAnalysis = {
  id: string;
  originalUrl: string;
  generatedAt: string;
  company: string;
  position: string;
  report: Report;
};
type ProgressState = "complete" | "current" | "upcoming";

function extractHttpUrl(value: string) {
  const match = value.match(/https?:\/\/[^\s<>"]+/i);
  return match ? match[0].replace(/[),.;!?]+$/, "") : value.trim();
}
function safeUrl(value: string | null | undefined) {
  if (!value) return null;
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}
function objectRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
}
function apiMessage(value: unknown, fallback: string) {
  const result = objectRecord(value);
  if (typeof result.error === "string") return result.error;
  if (typeof result.message === "string") return result.message;
  const nestedError = objectRecord(result.error);
  return typeof nestedError.message === "string" ? nestedError.message : fallback;
}
function scrollBehavior(): ScrollBehavior { return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"; }
function dateLabel(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" }); }
function moneyLabel(value: string, currency: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return `${value} ${currency}`;
  if (currency === "KRW" && Math.abs(amount) >= 100_000_000) return `${(amount / 100_000_000).toLocaleString("ko-KR", { maximumFractionDigits: 2 })}억 원`;
  return `${amount.toLocaleString("ko-KR", { maximumFractionDigits: 2 })} ${currency === "KRW" ? "원" : currency}`;
}
function EvidenceBadge({ kind }: { kind: Claim["kind"] }) {
  return <span className={`kb-badge kb-${kind}`}>{kind === "sourced" ? <Check size={12} /> : kind === "inference" ? <Sparkles size={12} /> : <Info size={12} />}{kind === "sourced" ? "출처 연결 정보" : kind === "inference" ? "근거에 따른 해석" : "확인 필요"}</span>;
}
function SourceRefs({ ids, sources }: { ids: string[]; sources: Source[] }) {
  const found = sources.filter(source => ids.includes(source.id));
  if (!found.length) return null;
  return <span className="kb-source-refs">{found.map(source => <a key={source.id} href={`#source-${source.id}`} onClick={() => document.getElementById(`source-${source.id}`)?.closest("details")?.setAttribute("open", "")} title={source.title}>[{sources.indexOf(source) + 1}]</a>)}</span>;
}
function ClaimCard({ claim, sources }: { claim: Claim; sources: Source[] }) {
  return <article className="kb-claim"><EvidenceBadge kind={claim.kind} /><p>{claim.text}<SourceRefs ids={claim.sourceIds} sources={sources} /></p>{claim.rationale && <p className="kb-muted kb-small">{claim.rationale}</p>}{claim.conflict && <p className="kb-small kb-amber">자료에 서로 다른 설명이 있어 확인이 필요해요.</p>}</article>;
}

function storedAnalysis(report: Report, originalUrl: string): StoredAnalysis {
  return { id: report.analysisId, originalUrl: report.job.sourceUrl || originalUrl, generatedAt: report.generatedAt, company: report.job.companyDisplayName, position: report.job.positionTitle, report };
}
function trimHistory(records: StoredAnalysis[]) {
  const next = records.slice(0, HISTORY_MAX_COUNT);
  while (next.length && JSON.stringify(next).length > HISTORY_MAX_CHARS) next.pop();
  return next;
}
function readStoredHistory(): StoredAnalysis[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(HISTORY_STORAGE_KEY) || "[]");
    if (!Array.isArray(value)) return [];
    const records: StoredAnalysis[] = [];
    for (const item of value) {
      if (!item || typeof item !== "object") continue;
      const candidate = item as { report?: unknown; originalUrl?: unknown };
      const parsed = reportSchema.safeParse(candidate.report);
      if (!parsed.success || parsed.data.analysisId === "sample") continue;
      const originalUrl = (typeof candidate.originalUrl === "string" ? safeUrl(candidate.originalUrl) : null) || parsed.data.job.sourceUrl || "";
      records.push(storedAnalysis(parsed.data, originalUrl));
    }
    return trimHistory(records);
  } catch { return []; }
}
function writeStoredHistory(records: StoredAnalysis[]) {
  const next = trimHistory(records);
  if (!next.length) {
    if (records.length) return { records: readStoredHistory(), persisted: false };
    try { window.localStorage.removeItem(HISTORY_STORAGE_KEY); return { records: [], persisted: true }; }
    catch { return { records: readStoredHistory(), persisted: false }; }
  }
  while (next.length) {
    try { window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next)); return { records: next, persisted: true }; }
    catch { next.pop(); }
  }
  return { records: readStoredHistory(), persisted: false };
}
function LoadingProgress({ phase, includeProfile }: { phase: "job" | "analysis"; includeProfile: boolean }) {
  const steps: { title: string; detail: string; state: ProgressState }[] = phase === "job" ? [
    { title: "원티드 공고 확인", detail: "기업명과 채용 포지션을 찾고 있어요.", state: "current" },
    { title: "이력서 선택 · 선택사항", detail: "공고 확인 후 원하면 추가할 수 있어요.", state: "upcoming" },
    { title: "기업과 역할 분석", detail: "사업·매출·채용 배경·필요 역량을 함께 살펴봐요.", state: "upcoming" },
    { title: "분석 결과 표시", detail: "찾은 근거를 지원 보고서로 보여드려요.", state: "upcoming" },
  ] : [
    { title: "원티드 공고 확인", detail: "기업명과 채용 포지션을 확인했어요.", state: "complete" },
    { title: includeProfile ? "이력서와 경험 추가" : "이력서 없이 계속", detail: includeProfile ? "선택한 경험을 분석에 포함했어요." : "기업과 포지션을 먼저 분석해요.", state: "complete" },
    { title: "기업과 역할 분석", detail: includeProfile ? "사업·매출·채용 배경을 조사하고 내 경험과 필요한 역량을 연결하고 있어요." : "사업·매출·채용 배경과 필요한 역량을 조사하고 있어요.", state: "current" },
    { title: "분석 결과 표시", detail: "검증이 끝나는 대로 이 화면에 보고서를 보여드려요.", state: "upcoming" },
  ];
  const stateLabel = { complete: "완료", current: "진행 중", upcoming: "예정" };
  return <div className="kb-progress" aria-label="분석 진행 단계">
    <div className="kb-progress-track" aria-hidden="true"><span /></div>
    <ol>{steps.map((step, index) => <li key={step.title} className={`kb-progress-${step.state}`} aria-current={step.state === "current" ? "step" : undefined}>
      <span className="kb-progress-marker" aria-hidden="true">{step.state === "complete" ? <Check size={14} /> : step.state === "current" ? <LoaderCircle size={15} className="kb-spin" /> : index + 1}</span>
      <div><strong>{step.title}</strong><p>{step.detail}</p></div><span className="kb-progress-state">{stateLabel[step.state]}</span>
    </li>)}</ol>
  </div>;
}

const SAMPLE_JOB = "노트웍스는 소규모 팀을 위한 업무 협업 도구를 만듭니다.\n\n주요 업무\n• 신규 고객의 제품 도입과 온보딩 과정을 개선합니다.\n• 고객 인터뷰와 사용 데이터를 바탕으로 문제를 정의합니다.\n• 개발자, 디자이너와 개선 실험을 설계하고 실행합니다.\n\n자격요건\n• 고객 문제를 발견하고 개선안을 제안한 경험\n• 데이터와 정성적 근거를 함께 활용하는 능력\n\n우대사항\n• B2B SaaS 온보딩 또는 고객 운영 경험";
const SAMPLE_PROFILE = "대학 프로젝트에서 협업 도구 사용자 8명을 인터뷰했습니다. 가입 과정의 문제를 정리하고 개선안을 작성했습니다. 개발자, 디자이너와 함께 프로토타입을 만들고 사용성 테스트를 진행했습니다. B2B 고객사 온보딩을 직접 운영한 경험은 없습니다.";
function sampleReport(): Report {
  const now = new Date().toISOString();
  const claim = (id: string, topic: Claim["topic"], text: string, kind: Claim["kind"] = "sourced", sourceIds = ["sample-job"]): Claim => ({ id, topic, text, kind, sourceIds, rationale: null, conflict: false });
  return {
    schemaVersion: "1.0", analysisId: "sample", generatedAt: now, summary: "이 포지션은 고객의 첫 제품 경험을 개선하는 역할이에요. 인터뷰와 개선안 작성 경험을 보여주고, B2B 고객 운영의 실제 범위는 확인해 보세요.",
    job: { id: "sample-job", sourceUrl: null, inputMethod: "ai_research", companyDisplayName: "노트웍스", positionTitle: "Product Manager · 고객 온보딩", rawText: SAMPLE_JOB, collectedAt: now, userEdited: false },
    companyIdentity: { displayName: "노트웍스", legalName: null, website: null, corpCode: null, status: "unresolved", evidenceSourceIds: ["sample-job"], candidates: [] },
    sources: [
      { id: "sample-job", kind: "job", url: null, title: "노트웍스 채용공고 · 가상 자료", publisher: "KnowBoth 예시", publishedAt: null, retrievedAt: now, evidenceMode: "user_provided", excerpt: SAMPLE_JOB },
      { id: "sample-profile", kind: "user", url: null, title: "지원자 경험 · 가상 자료", publisher: "KnowBoth 예시", publishedAt: null, retrievedAt: now, evidenceMode: "user_provided", excerpt: SAMPLE_PROFILE },
    ],
    companyClaims: [claim("c1", "customer", "여러 사람이 함께 일하는 소규모 팀이 주요 고객입니다."), claim("c2", "product", "팀의 업무와 협업을 돕는 소프트웨어를 제공합니다."), claim("c3", "revenue_model", "구독료·좌석당 과금 등 구체적인 수익 방식은 이 공고만으로 확인할 수 없습니다.", "unknown", []), claim("c4", "role_contribution", "고객이 도구를 처음 도입하는 과정의 어려움을 줄이는 데 이 포지션이 기여할 수 있습니다.", "inference")],
    businessChanges: [],
    roleClaims: [claim("r1", "work", "신규 고객의 온보딩 과정을 개선하고, 인터뷰와 사용 데이터로 문제를 정의합니다."), claim("r2", "collaboration", "개발자·디자이너와 개선 실험을 설계하고 실행합니다.")],
    revenue: { status: "not_found", selected: null, observations: [], reason: "가상 기업 예시로, 실제 매출 자료는 제공하지 않습니다." },
    requirements: [
      { id: "req1", label: "고객 문제 발견과 개선안 제안", category: "required", jobQuote: "고객 문제를 발견하고 개선안을 제안한 경험", expectedLevel: null },
      { id: "req2", label: "데이터와 정성적 근거 활용", category: "required", jobQuote: "데이터와 정성적 근거를 함께 활용하는 능력", expectedLevel: null },
      { id: "req3", label: "B2B 고객 온보딩 경험", category: "preferred", jobQuote: "B2B SaaS 온보딩 또는 고객 운영 경험", expectedLevel: null },
    ],
    hiringHypotheses: [{ id: "h1", kind: "inference", claim: "신규 고객이 제품을 활용하기까지의 과정을 더 잘 설계하려는 채용일 수 있습니다.", evidenceSourceIds: ["sample-job"], requirementIds: ["req1"], alternative: "사업 확장뿐 아니라 기존 온보딩 운영의 개선을 위한 채용일 수도 있습니다.", question: "이번 채용으로 가장 먼저 해결하려는 고객의 어려움은 무엇인가요?" }],
    fitItems: [
      { requirementId: "req1", status: "evidence", profileQuote: "가입 과정의 문제를 정리하고 개선안을 작성했습니다.", reason: "문제를 발견하고 개선안을 만든 경험이 공고의 요구와 연결됩니다. 실제 맡은 범위와 결과를 구체적으로 설명해 보세요.", followUpQuestion: null },
      { requirementId: "req2", status: "unknown", profileQuote: null, reason: "인터뷰 경험은 있지만 사용 데이터를 분석한 경험은 현재 자료에서 확인되지 않습니다.", followUpQuestion: "문제를 판단할 때 어떤 지표나 데이터를 함께 살펴봤나요?" },
      { requirementId: "req3", status: "gap", profileQuote: "B2B 고객사 온보딩을 직접 운영한 경험은 없습니다.", reason: "직접 운영한 경험이 없다고 밝혔어요. 우대 조건이므로 필수 조건과 구분해 준비하면 됩니다.", followUpQuestion: null },
    ], conditionChecks: [], preferenceQuestions: [],
    actions: [
      { kind: "highlight", title: "사용자 인터뷰를 개선안으로 연결한 경험", requirementIds: ["req1"], claimIds: [], profileQuote: "대학 프로젝트에서 협업 도구 사용자 8명을 인터뷰했습니다.", deliverable: "문제 → 조사 → 판단 → 개선안의 흐름으로 사례 1개 정리", doneWhen: "내가 맡은 일과 판단 근거를 2분 안에 설명할 수 있어요." },
      { kind: "prepare", title: "고객 온보딩 개선안을 1페이지로 정리하기", requirementIds: ["req1", "req3"], claimIds: [], profileQuote: null, deliverable: "공개 체험 흐름, 이탈 가설, 확인할 지표, 개선안", doneWhen: "가설과 실제 확인한 사실을 구분하고 개선 이유를 설명해요." },
      { kind: "ask", title: "입사 후 가장 먼저 맡게 될 온보딩 과제는 무엇인가요?", requirementIds: ["req1"], claimIds: ["c4"], profileQuote: null, deliverable: null, doneWhen: null },
    ],
    sectionStates: { company: { status: "ready", reason: null }, revenue: { status: "unavailable", reason: "가상 예시" }, hiring: { status: "ready", reason: null }, personalization: { status: "ready", reason: null }, preparation: { status: "ready", reason: null } },
    warnings: ["이 보고서는 사용 방법을 보여주는 가상 예시입니다. 회사·공고·지원자 경험은 모두 가상 자료입니다."],
  };
}

const FIT_LABEL = { evidence: "경험 근거 있음", partial: "일부 연결", gap: "보완 필요", unknown: "추가 확인" };
const REVENUE_LABEL = { available: "확인됨", not_found: "자료에서 확인하지 못함", access_failed: "자료 접근 실패", identity_unresolved: "법인 식별 필요", conflicting: "자료 간 불일치", skipped: "매출 분석 생략" };

export default function KnowBothApp() {
  const [view, setView] = useState<View>("search");
  const [url, setUrl] = useState("");
  const [jobPreview, setJobPreview] = useState<{ company: string; position: string } | null>(null);
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
  const [sample, setSample] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("company");
  const [candidates, setCandidates] = useState<CompanyCandidate[]>([]);
  const [savedAnalyses, setSavedAnalyses] = useState<StoredAnalysis[]>([]);
  const [openedFromHistory, setOpenedFromHistory] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const reportRef = useRef<HTMLElement>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const confirmedJob = useRef<JobInput | null>(null);
  const confirmedJobProof = useRef("");
  const confirmedUrl = useRef("");
  const savedAnalysesRef = useRef<StoredAnalysis[]>([]);
  const homeRequested = useRef(false);
  const [profileIncluded, setProfileIncluded] = useState(true);
  const previousView = useRef<View>("search");
  const working = view === "job" || view === "analysis";
  const statusMessage = view === "job" ? "원티드 공고를 확인하고 있어요." : view === "analysis" ? "기업과 매출, 채용 배경과 필요한 역량을 분석하고 있어요." : view === "profile" ? "공고를 찾았어요. 선택적으로 이력서나 경험을 추가할 수 있어요." : view === "report" ? sample ? "가상 예시 보고서가 열렸어요." : "분석이 완료됐어요. 보고서에서 결과를 확인하세요." : view === "choice" ? "지원할 기업을 선택해 주세요." : "";
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
    return () => { window.clearTimeout(historyTimer); controller.current?.abort(); };
  }, []);

  function clearConfirmedJob() { confirmedJob.current = null; confirmedJobProof.current = ""; confirmedUrl.current = ""; setJobPreview(null); setCandidates([]); }
  function backToSearch() { setError(""); setNotice(""); setView("search"); }
  function goHome() { homeRequested.current = true; controller.current?.abort(); setDownloadError(""); setError(""); setNotice(""); setView("search"); }
  function editProfile() {
    setError(""); setProfileOpen(true);
    if (confirmedJob.current && confirmedJobProof.current && confirmedUrl.current === extractHttpUrl(url)) { setNotice(""); setView("profile"); return; }
    setNeedsJobRefresh(true);
    setNotice("저장된 보고서는 공고를 다시 확인한 뒤 경험을 추가하거나 수정할 수 있어요.");
    setView("search");
  }
  function rememberReport(nextReport: Report, originalUrl: string) {
    const parsed = reportSchema.safeParse(nextReport);
    if (!parsed.success || parsed.data.analysisId === "sample") return;
    const record = storedAnalysis(parsed.data, originalUrl || parsed.data.job.sourceUrl || "");
    const next = [record, ...savedAnalysesRef.current.filter(item => item.id !== record.id)];
    const stored = writeStoredHistory(next);
    savedAnalysesRef.current = stored.records;
    setSavedAnalyses(stored.records);
    if (!stored.persisted || !stored.records.some(item => item.id === record.id)) setNotice("분석 결과는 열렸지만 이 브라우저의 최근 분석에는 저장하지 못했어요. 브라우저 저장 공간을 확인해 주세요.");
  }
  function openSavedAnalysis(item: StoredAnalysis) {
    const parsed = reportSchema.safeParse(item.report);
    if (!parsed.success) return;
    clearConfirmedJob();
    setUrl(item.originalUrl);
    setReport(parsed.data);
    setSample(false);
    setOpenedFromHistory(true);
    setActiveTab("company");
    setDownloadError("");
    setNotice("");
    setView("report");
  }
  function deleteSavedAnalysis(id: string) {
    const stored = writeStoredHistory(savedAnalysesRef.current.filter(item => item.id !== id));
    savedAnalysesRef.current = stored.records;
    setSavedAnalyses(stored.records);
    if (!stored.persisted) setNotice("기록을 삭제하지 못했어요. 브라우저 저장 공간을 확인한 뒤 다시 시도해 주세요.");
  }
  async function readResume(file: File) {
    setReading(true); setFileError("");
    try {
      if (file.size > 8 * 1024 * 1024) throw new Error("8MB 이하 파일을 선택해 주세요. 경험을 직접 입력해도 괜찮아요.");
      const ext = file.name.split(".").pop()?.toLowerCase();
      const bytes = await file.arrayBuffer(); let text = "";
      if (ext === "pdf") {
        const pdfjs = await import("pdfjs-dist"); pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.mjs";
        const loading = pdfjs.getDocument({ data: bytes, useSystemFonts: true });
        try {
          const document = await loading.promise;
          if (document.numPages > 40) throw new Error("40페이지 이하의 PDF를 선택해 주세요.");
          const pages: string[] = [];
          for (let p = 1; p <= document.numPages; p++) { const page = await document.getPage(p); const content = await page.getTextContent(); pages.push(content.items.map(item => "str" in item ? `${item.str}${"hasEOL" in item && item.hasEOL ? "\n" : " "}` : "").join("")); page.cleanup(); }
          text = pages.join("\n\n");
        } finally { await loading.destroy(); }
      } else if (ext === "docx") { const mammoth = await import("mammoth"); text = (await mammoth.extractRawText({ arrayBuffer: bytes })).value; }
      else if (ext === "txt" || ext === "md") text = new TextDecoder().decode(bytes);
      else throw new Error("PDF, DOCX, TXT, MD 파일을 지원해요. HWP나 이미지는 경험을 직접 붙여넣어 주세요.");
      if (!text.trim()) throw new Error("읽을 수 있는 텍스트가 없어요. 스캔 PDF는 텍스트를 직접 입력해 주세요.");
      setExperience(text.trim()); setFileName(file.name); setProfileOpen(true);
      if (text.trim().length > MAX_TEXT) setFileError("추출한 내용이 20,000자를 넘었어요. 아래 미리보기에서 필요한 경험만 남겨 주세요. 내용을 자동으로 자르지 않았어요.");
    } catch (cause) { setFileError(cause instanceof Error ? cause.message : "파일을 읽지 못했어요. 암호화 여부를 확인하거나 경험을 직접 입력해 주세요."); }
    finally { setReading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  async function normalizeJob(signal?: AbortSignal) {
    const response = await fetch("/api/job", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: extractHttpUrl(url) }), signal });
    const result = objectRecord(await response.json().catch(() => null));
    if (!response.ok) throw new Error(apiMessage(result, "공고를 확인하지 못했어요. 주소를 확인하고 다시 시도해 주세요."));
    if (result.status !== "ready" || !result.job || typeof result.jobProof !== "string") throw new Error(apiMessage(result, "공고 내용을 충분히 확인하지 못했어요. 잠시 후 다시 시도해 주세요."));
    const job = result.job as JobInput;
    confirmedJob.current = job; confirmedJobProof.current = result.jobProof; confirmedUrl.current = extractHttpUrl(url);
    setJobPreview({ company: job.companyDisplayName, position: job.positionTitle });
    return job;
  }

  async function importJob(event: FormEvent) {
    event.preventDefault(); setError(""); setNotice("");
    if (!url.trim()) { setError("원티드 공고 주소를 입력해 주세요."); urlRef.current?.focus(); return; }
    homeRequested.current = false; setView("job"); setCandidates([]);
    const current = new AbortController(); controller.current = current;
    try { await normalizeJob(current.signal); setNeedsJobRefresh(false); setView("profile"); }
    catch (cause) {
      setView("search");
      if (current.signal.aborted && homeRequested.current) { homeRequested.current = false; return; }
      if (current.signal.aborted) setNotice("공고 찾기를 멈췄어요. 주소는 그대로 남아 있어요."); else setError(cause instanceof Error ? cause.message : "공고를 찾지 못했어요. 주소를 확인하고 다시 시도해 주세요.");
    }
  }

  async function analyze(event?: FormEvent, choice?: CompanyCandidate | "skip_financials", includeProfile = true) {
    event?.preventDefault(); setError(""); setNotice("");
    const withProfile = choice ? profileIncluded : includeProfile;
    if (withProfile && experience.length > MAX_TEXT) { setError("내 경험은 20,000자까지 분석할 수 있어요. 필요한 경험만 남겨 주세요."); document.getElementById("experience")?.focus(); return; }
    const job = confirmedJob.current;
    if (!job || !confirmedJobProof.current || confirmedUrl.current !== extractHttpUrl(url)) { clearConfirmedJob(); setNeedsJobRefresh(true); setError("분석 전에 공고를 다시 확인해 주세요. 입력한 주소는 그대로 남아 있어요."); setView("search"); return; }
    homeRequested.current = false; setProfileIncluded(withProfile);
    setView("analysis"); setCandidates([]);
    const current = new AbortController(); controller.current = current;
    try {
      const response = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json", "X-KnowBoth-Job-Proof": confirmedJobProof.current }, signal: current.signal, body: JSON.stringify({ job, profile: withProfile && experience.trim() ? { experienceText: experience.trim(), desiredWork: preferences.trim() || null, constraints: null, additionalAnswers: [] } : null, companyHint: choice && choice !== "skip_financials" ? { legalName: choice.legalName || choice.displayName || choice.name, website: choice.website || null } : null, companyResolution: choice === "skip_financials" ? "skip_financials" : choice ? "selected" : "auto" }) });
      const result = objectRecord(await response.json().catch(() => null));
      if (!response.ok) {
        if (result.code === "JOB_PROOF_INVALID") { clearConfirmedJob(); setNeedsJobRefresh(true); setError("공고 확인 정보가 만료됐어요. 아래 버튼으로 다시 확인하면 이어서 분석할 수 있어요."); setView("search"); return; }
        throw new Error(apiMessage(result, "분석을 완료하지 못했어요. 입력은 유지되어 있으니 다시 시도해 주세요."));
      }
      if (result.type === "needs_company" || result.status === "needs_company") {
        const identity = objectRecord(result.companyIdentity);
        const candidateList = Array.isArray(result.candidates) ? result.candidates : Array.isArray(identity.candidates) ? identity.candidates : [];
        setCandidates(candidateList as CompanyCandidate[]);
        setNotice(typeof result.message === "string" ? result.message : "같은 이름의 기업이 있어요. 지원할 기업을 선택해 주세요."); setView("choice");
      } else if (result.report) {
        const parsed = reportSchema.safeParse(result.report);
        if (!parsed.success) throw new Error("분석 결과 형식을 확인하지 못했어요. 입력은 유지되어 있으니 다시 시도해 주세요.");
        setReport(parsed.data); setSample(false); setOpenedFromHistory(false); setActiveTab("company"); setDownloadError("");
        rememberReport(parsed.data, parsed.data.job.sourceUrl || confirmedUrl.current || url.trim());
        setView("report");
      }
      else throw new Error(apiMessage(result, "분석 결과를 읽지 못했어요. 입력을 유지했으니 다시 시도해 주세요."));
    } catch (cause) {
      if (current.signal.aborted && homeRequested.current) { homeRequested.current = false; return; }
      setView("profile");
      if (current.signal.aborted) setNotice("분석을 멈췄어요. 이력서와 입력한 내용은 그대로 남아 있어요."); else setError(cause instanceof Error ? cause.message : "분석에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
  }
  function showSample() { setCandidates([]); setError(""); setNotice(""); setReport(sampleReport()); setSample(true); setOpenedFromHistory(false); setActiveTab("company"); setView("report"); }
  async function downloadPdf() {
    if (!report || downloadingPdf) return;
    setDownloadingPdf(true); setDownloadError("");
    try { const { downloadReportPdf } = await import("@/lib/knowboth/pdf"); await downloadReportPdf(report); }
    catch { setDownloadError("PDF를 만들지 못했어요. 잠시 후 다시 시도해 주세요."); }
    finally { setDownloadingPdf(false); }
  }
  function tabKeys(event: KeyboardEvent<HTMLButtonElement>, index: number) { let next = index; if (event.key === "ArrowRight") next = (index + 1) % TABS.length; else if (event.key === "ArrowLeft") next = (index + TABS.length - 1) % TABS.length; else if (event.key === "Home") next = 0; else if (event.key === "End") next = TABS.length - 1; else return; event.preventDefault(); setActiveTab(TABS[next].id); document.getElementById(`tab-${TABS[next].id}`)?.focus(); }

  const feedback = <>{notice && <div className="kb-notice" role="status"><Info size={16} /><p>{notice}</p></div>}{error && <div className="kb-error" role="alert"><Info size={17} /><p>{error}</p></div>}</>;
  return <div className={`kb-app ${view === "search" ? "kb-search-page" : ""}`}>
    <a className="kb-skip" href="#analysis-content">본문으로 바로가기</a>
    {view !== "search" && <header className="kb-header"><button type="button" className="kb-brand" aria-label="홈으로 이동" onClick={goHome}><span className="kb-logo" aria-hidden="true"><span /><span /></span>KnowBoth</button><button type="button" className="kb-home-button" onClick={goHome}><House size={15} />홈</button></header>}
    <p className="kb-sr-only" role="status" aria-live="polite" aria-atomic="true">{statusMessage}</p>
    <main ref={reportRef} id="analysis-content" tabIndex={-1} className={`kb-main ${view === "search" ? "kb-search-main" : view === "report" ? "kb-report-main" : "kb-flow-main"}`} aria-busy={working}>
      {view === "search" && <section className="kb-search-home" aria-labelledby="search-title">
        <div className="kb-search-brand"><span className="kb-logo" aria-hidden="true"><span /><span /></span><h1 id="search-title">KnowBoth</h1></div>
        <p className="kb-search-copy">기업을 알고, 나를 알고.<br />지원의 방향을 찾다.</p>
        <form className="kb-search-form" onSubmit={event => void importJob(event)} aria-label="원티드 공고 분석">
          <label className="kb-sr-only" htmlFor="job-url">원티드 공고 URL</label>
          <div className="kb-search-bar"><Link2 size={20} aria-hidden="true" /><input ref={urlRef} id="job-url" type="url" required value={url} onChange={event => { setUrl(event.target.value); clearConfirmedJob(); setNeedsJobRefresh(false); setError(""); setNotice(""); }} placeholder="원티드 공고 URL을 붙여넣으세요" autoComplete="off" aria-describedby="job-url-hint" /><button type="submit">{needsJobRefresh ? "공고 다시 확인" : "분석하기"}<ArrowRight size={17} aria-hidden="true" /></button></div>
          <p id="job-url-hint" className="kb-search-hint">매출과 주요 사업부터, 채용 이유와 필요한 역량까지.</p>
          {feedback}
        </form>
        <div className="kb-home-links"><button type="button" className="kb-text-button" onClick={showSample}>예시 보고서 보기 <ArrowUpRight size={14} /></button>{report && <button type="button" className="kb-text-button" onClick={() => setView("report")}>이전 보고서 보기</button>}</div>
        {savedAnalyses.length > 0 && <section className="kb-history" aria-labelledby="history-title">
          <div className="kb-history-heading"><HistoryIcon size={17} aria-hidden="true" /><div><h2 id="history-title">최근 분석</h2><p><LockKeyhole size={11} />이 브라우저에만 저장돼요.</p></div></div>
          <ul>{savedAnalyses.map(item => <li key={item.id}>
            <button type="button" className="kb-history-open" onClick={() => openSavedAnalysis(item)}><span><strong>{item.company}</strong><small>{item.position}</small></span><time dateTime={item.generatedAt}>{dateLabel(item.generatedAt)}</time><ArrowRight size={15} aria-hidden="true" /></button>
            <button type="button" className="kb-history-delete" onClick={() => deleteSavedAnalysis(item.id)} aria-label={`${item.company} ${item.position} 분석 기록 삭제`} title="기록 삭제"><Trash2 size={14} /></button>
          </li>)}</ul>
        </section>}
      </section>}
      {view === "profile" && jobPreview && <section className="kb-profile-card kb-input-card" aria-labelledby="profile-title">
        <button type="button" className="kb-text-button kb-back" onClick={backToSearch} disabled={reading}><ArrowLeft size={15} />공고 바꾸기</button>
        <p className="kb-confirmed-label"><Check size={14} />공고 확인 완료</p><h1 ref={resultHeadingRef} tabIndex={-1} id="profile-title">{jobPreview.company}</h1><p className="kb-position-title">{jobPreview.position}</p>
        {safeUrl(url) && <a className="kb-original-link" href={safeUrl(url)!} target="_blank" rel="noopener noreferrer">공고 원문 <ArrowUpRight size={12} /></a>}
        <div className="kb-input-divider" /><h2>나에게 맞춰서 볼까요?</h2><p className="kb-profile-intro">이력서를 더하면, 내 경험과 필요한 준비도 함께 알려드려요. 지금은 건너뛰어도 괜찮아요.</p>
        <form onSubmit={event => void analyze(event)} aria-label="선택적 경험 추가 및 분석">
          <input ref={fileRef} id="resume-file" type="file" accept=".pdf,.docx,.txt,.md" className="kb-sr-only" onChange={event => { const file = event.target.files?.[0]; if (file) void readResume(file); }} disabled={reading} />
          <button className="kb-upload" type="button" disabled={reading} onClick={() => fileRef.current?.click()} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file && !reading) void readResume(file); }}>{reading ? <LoaderCircle size={23} className="kb-spin" /> : <Upload size={23} />}<strong>{reading ? "파일에서 경험을 읽고 있어요" : fileName || "이력서 추가하기"}</strong><span>PDF · DOCX · TXT · MD / 8MB 이하</span></button>
          {fileError && <p className="kb-inline-error" role="alert">{fileError}</p>}
          <button type="button" className="kb-text-button kb-manual-toggle" aria-expanded={profileOpen} aria-controls="profile-input" onClick={() => setProfileOpen(!profileOpen)}>{profileOpen ? "경험 입력 접기" : "파일 없이 경험 직접 입력하기"}<ChevronDown size={15} className={profileOpen ? "kb-rotated" : ""} /></button>
          {profileOpen && <div id="profile-input" className="kb-profile-fields"><label htmlFor="experience">{fileName ? "추출한 경험 · 수정할 수 있어요" : "내 경험"}</label><textarea id="experience" value={experience} onChange={event => setExperience(event.target.value)} placeholder="내가 맡은 역할, 해결한 문제, 결과를 적어주세요. 학교·개인 프로젝트도 좋아요." rows={6} disabled={reading} aria-describedby="experience-hint experience-count" aria-invalid={experience.length > MAX_TEXT} /><p id="experience-count" className={`kb-count ${experience.length > MAX_TEXT ? "kb-danger" : ""}`}>{experience.length.toLocaleString()} / 20,000자</p><p id="experience-hint" className="kb-field-hint">연락처 등 분석에 필요 없는 정보는 지워주세요.</p><label htmlFor="preferences">내가 중요하게 생각하는 것 <span className="kb-optional">선택</span></label><input id="preferences" value={preferences} onChange={event => setPreferences(event.target.value)} placeholder="예: 고객과 가까이 일하기, 원격 근무" maxLength={1000} /></div>}
          {feedback}
          <div className="kb-profile-actions"><button type="submit" className="kb-primary" disabled={reading || !experience.trim()}><Sparkles size={16} />기업과 나 분석하기<ArrowRight size={17} /></button><button type="button" className="kb-without-resume" disabled={reading} onClick={() => void analyze(undefined, undefined, false)}>이력서 없이 계속 <ArrowRight size={15} /></button></div>
          <p className="kb-privacy"><LockKeyhole size={12} /><span>파일은 브라우저에서 읽어요. 분석 시 선택한 경험 텍스트가 서버와 AI 제공자에 전달돼요.</span></p>
        </form>
        {report && <button type="button" className="kb-text-button kb-previous-report" disabled={reading} onClick={() => setView("report")}>이전 보고서 보기 <ArrowUpRight size={13} /></button>}
      </section>}
      {working && <section className="kb-analysis-loading" aria-labelledby="loading-title"><span className="kb-loading-symbol" aria-hidden="true"><LoaderCircle size={30} className="kb-spin" /></span><p className="kb-eyebrow">{view === "job" ? "READING THE OPPORTUNITY" : "CONNECTING THE DOTS"}</p><h1 ref={resultHeadingRef} tabIndex={-1} id="loading-title">{view === "job" ? "공고를 확인하고 있어요." : "회사를 알아보고 있어요."}</h1><p className="kb-loading-copy">{view === "job" ? "원티드 링크에서 기업과 채용 포지션을 찾고 있어요." : `${jobPreview?.company || "지원할 기업"}의 사업과 공고를 연결해 분석해요.`}</p>{view === "job" && <div className="kb-loading-url"><Link2 size={15} /><span>{url}</span></div>}<LoadingProgress phase={view} includeProfile={profileIncluded && !!experience.trim()} /><p className="kb-loading-note">{view === "job" ? "공고 확인이 끝나면 이력서를 선택할 수 있어요." : "현재 진행 중인 단계가 끝나면 다음 단계로 이어져요."}</p><button type="button" className="kb-text-button" onClick={() => controller.current?.abort()}>멈추고 돌아가기</button></section>}
      {view === "choice" && <section className="kb-profile-card kb-company-choice"><h1 ref={resultHeadingRef} tabIndex={-1}>지원할 기업을 확인해 주세요</h1><p>{notice || "같은 이름의 기업이 있어요. 실제 고용 법인을 선택해 주세요."}</p>{candidates.map((candidate, index) => <button key={index} type="button" onClick={() => void analyze(undefined, candidate)}><strong>{candidate.legalName || candidate.displayName || candidate.name}</strong><span>{candidate.website || candidate.reason || "홈페이지 미확인"}</span><ArrowRight size={16} /></button>)}<button className="kb-text-button" type="button" onClick={() => void analyze(undefined, "skip_financials")}>기업 외부 조사 없이 공고만 분석하기 <ArrowRight size={15} /></button><button className="kb-text-button kb-back" type="button" onClick={() => setView("profile")}><ArrowLeft size={14} />이전으로</button></section>}
      {view === "report" && report && <section className="kb-result-column" aria-label="분석 보고서">
            <div className="kb-report-heading"><div><p className="kb-eyebrow">YOUR APPLICATION BRIEF</p><h2 ref={resultHeadingRef} tabIndex={-1}>{report.job.companyDisplayName}<span className="kb-sr-only"> 분석 보고서{sample ? " 가상 예시" : " 완료"}</span></h2><p>{report.job.positionTitle}</p></div><span className={`kb-report-label ${sample ? "kb-sample-label" : ""}`}>{sample ? "가상 예시" : report.fitItems === null ? "기업 · 역할 분석" : "내 경험 포함"}</span></div>
            {sample && <p className="kb-sample-banner"><Info size={16} />사용 방법을 보여주는 예시예요. 회사·공고·경험은 모두 가상 자료입니다.</p>}
            <div className="kb-report-meta"><span>{dateLabel(report.generatedAt)} 기준</span>{safeUrl(report.job.sourceUrl) && <a href={safeUrl(report.job.sourceUrl)!} target="_blank" rel="noopener noreferrer">공고 원문 <ArrowUpRight size={13} /></a>}<div><button type="button" onClick={() => void downloadPdf()} disabled={downloadingPdf} title="PDF로 다운로드">{downloadingPdf ? <LoaderCircle size={15} className="kb-spin" /> : <Download size={15} />}<span>{downloadingPdf ? "PDF 만드는 중" : "PDF 다운로드"}</span></button></div></div>
            {notice && <div className="kb-notice" role="status"><Info size={16} /><p>{notice}</p></div>}
            {downloadError && <p className="kb-download-error" role="alert"><Info size={14} />{downloadError}</p>}
            <div className="kb-report-summary"><span className="kb-eyebrow">한눈에 보는 지원의 방향</span><p>{report.summary}</p></div><div className="kb-report-tabs" role="tablist" aria-label="보고서 영역">{TABS.map((tab, index) => <button key={tab.id} id={`tab-${tab.id}`} type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls={`panel-${tab.id}`} tabIndex={activeTab === tab.id ? 0 : -1} onClick={() => setActiveTab(tab.id)} onKeyDown={event => tabKeys(event, index)}><tab.icon size={16} />{tab.label}</button>)}</div>
            <div id="panel-company" role="tabpanel" aria-labelledby="tab-company" tabIndex={0} className={`kb-tab-panel ${activeTab !== "company" ? "kb-inactive" : ""}`}><SectionTitle number="01" title="기업 이해" text="고객의 문제와 기업의 수익 구조를 함께 살펴봐요." />{report.companyClaims.length ? <div className="kb-surface kb-claims">{report.companyClaims.map(claim => <ClaimCard key={claim.id} claim={claim} sources={report.sources} />)}</div> : <EmptyState title="기업 외부 정보를 확인하지 못했어요" text={report.sectionStates.company.reason || "아래 채용 배경에서 입력 공고를 기준으로 확인한 역할을 살펴보세요."} />}
              <div className="kb-surface kb-revenue"><div className="kb-section-label"><h3>매출과 확인 범위</h3><span className={`kb-badge ${report.revenue.status === "available" ? "kb-sourced" : "kb-unknown"}`}>{REVENUE_LABEL[report.revenue.status]}</span></div>{report.revenue.selected ? <><strong className="kb-revenue-amount">{moneyLabel(report.revenue.selected.amountDecimal, report.revenue.selected.currency)}</strong><p>{report.revenue.selected.entityName}<SourceRefs ids={report.revenue.selected.sourceIds} sources={report.sources} /></p><dl className="kb-revenue-details"><div><dt>회계기간</dt><dd>{report.revenue.selected.periodStart} ~ {report.revenue.selected.periodEnd}</dd></div><div><dt>보고 기준</dt><dd>{{ annual: "연간", quarter: "분기", ytd: "누적" }[report.revenue.selected.periodType]} · {{ consolidated: "연결", separate: "별도", unknown: "회계 범위 미확인" }[report.revenue.selected.accountingScope]}</dd></div><div><dt>원문 계정</dt><dd>{report.revenue.selected.accountLabel}</dd></div></dl></> : <div className="kb-revenue-unavailable"><Info size={22} /><p>{report.revenue.reason || "조사한 자료에서 해당 기업의 매출을 확인하지 못했어요."}<span>자료가 없다는 뜻이며, 매출이 0원이라는 뜻은 아니에요.</span></p></div>}{report.revenue.status === "conflicting" && report.revenue.observations.map((item, i) => <p key={i} className="kb-small">{item.entityName} · {moneyLabel(item.amountDecimal, item.currency)} · {item.periodStart} ~ {item.periodEnd} · {item.accountingScope}<SourceRefs ids={item.sourceIds} sources={report.sources} /></p>)}</div>
              {report.businessChanges.length > 0 && <div className="kb-surface"><h3>공고와 연결되는 사업 변화</h3>{report.businessChanges.map((change, i) => <div key={i}><ClaimCard claim={change.claim} sources={report.sources} /><p className="kb-small kb-muted">사건일 {change.eventDate || "미확인"} · 발표일 {change.publishedAt || "미확인"}</p></div>)}</div>}
            </div>
            <div id="panel-hiring" role="tabpanel" aria-labelledby="tab-hiring" tabIndex={0} className={`kb-tab-panel ${activeTab !== "hiring" ? "kb-inactive" : ""}`}><SectionTitle number="02" title="채용 배경" text="공고에 적힌 역할과 그 뒤에 있을 사업의 필요를 구분해요." />{report.roleClaims.length > 0 && <div className="kb-surface kb-claims"><h3>공고에서 확인한 역할</h3>{report.roleClaims.map(claim => <ClaimCard key={claim.id} claim={claim} sources={report.sources} />)}</div>}{report.hiringHypotheses.map((hypothesis, i) => <article key={hypothesis.id} className="kb-surface kb-hypothesis"><span className="kb-small kb-muted">채용 배경 {i + 1}</span><div className="kb-claim"><span className={`kb-badge ${hypothesis.kind === "stated" ? "kb-sourced" : "kb-inference"}`}>{hypothesis.kind === "stated" ? "공고에 명시" : "근거에 따른 해석"}</span><p>{hypothesis.claim}<SourceRefs ids={hypothesis.evidenceSourceIds} sources={report.sources} /></p></div>{hypothesis.alternative && <div className="kb-alt"><strong>다른 가능한 설명</strong><p>{hypothesis.alternative}</p></div>}<p className="kb-question"><span>면접에서 물어보기</span>{hypothesis.question}</p></article>)}{!report.hiringHypotheses.length && <EmptyState title="구체적인 채용 이유는 확인이 필요해요" text="공개된 근거가 부족해 채용 배경을 단정하지 않았어요. 이번 채용으로 해결하려는 과제를 면접에서 물어보세요." />}{report.requirements.length > 0 && <div className="kb-surface"><h3>공고의 요구사항</h3><div className="kb-requirements">{report.requirements.map(item => <div key={item.id}><span className="kb-category">{{ required: "필수", preferred: "우대", work: "업무", condition: "지원 조건" }[item.category]}</span><div><strong>{item.label}</strong><p>{item.jobQuote}</p></div></div>)}</div></div>}</div>
            <div id="panel-fit" role="tabpanel" aria-labelledby="tab-fit" tabIndex={0} className={`kb-tab-panel ${activeTab !== "fit" ? "kb-inactive" : ""}`}><SectionTitle number="03" title="나와 비교" text="공고의 요구와 내가 실제로 해본 일을 연결해요." />{report.fitItems === null ? <div className="kb-surface kb-add-experience"><UserRound size={28} /><h3>내 경험을 더하면, 연결이 시작돼요</h3><p>이력서나 프로젝트 경험을 추가해 주세요.<br />기업 조사를 다시 실행하고 나에게 필요한 준비를 함께 분석해요.</p><button type="button" className="kb-secondary" onClick={editProfile}><Plus size={16} />내 경험 추가하기</button></div> : <><p className="kb-fit-note"><Info size={15} />이력서에 없는 역량은 ‘부족’ 대신 ‘추가 확인’으로 표시해요.</p>{report.fitItems.map((item, i) => { const req = report.requirements.find(r => r.id === item.requirementId); return <article key={i} className="kb-surface kb-fit-item"><div className="kb-section-label"><span className="kb-category">{req?.category === "preferred" ? "우대" : req?.category === "work" ? "주요 업무" : "필수"}</span><span className={`kb-badge kb-fit-${item.status}`}>{FIT_LABEL[item.status]}</span></div><h3>{req?.label || "요구 역량"}</h3>{req && <p className="kb-job-quote">공고 · {req.jobQuote}</p>}{item.profileQuote && <blockquote><span>내 경험에서</span>{item.profileQuote}</blockquote>}<p>{item.reason}</p>{item.followUpQuestion && <p className="kb-question"><span>확인해 볼 질문</span>{item.followUpQuestion}</p>}</article>; })}{!report.fitItems.length && <EmptyState title="연결할 경험을 더 확인하고 있어요" text={report.sectionStates.personalization.reason || "직접 맡은 역할과 경험을 조금 더 구체적으로 입력해 주세요."} />}</>}{!!report.conditionChecks?.length && <div className="kb-surface"><h3>지원 조건</h3>{report.conditionChecks.map((item, i) => <div className="kb-condition" key={i}><strong>{report.requirements.find(r => r.id === item.requirementId)?.label}</strong><span className="kb-badge kb-unknown">{{ met: "충족 근거 있음", not_met: "불일치 근거 있음", unknown: "확인 필요" }[item.status]}</span><p>{item.reason}</p></div>)}</div>}{report.preferenceQuestions.length > 0 && <div className="kb-surface"><h3>내가 확인할 회사 조건</h3>{report.preferenceQuestions.map((item, i) => <p className="kb-question" key={i}><span>{item.preferenceQuote}</span>{item.question}</p>)}</div>}</div>
            <div id="panel-prepare" role="tabpanel" aria-labelledby="tab-prepare" tabIndex={0} className={`kb-tab-panel ${activeTab !== "prepare" ? "kb-inactive" : ""}`}><SectionTitle number="04" title="지원 준비" text="더 알아봐야 할 것을, 지금 할 수 있는 행동으로 바꿔요." />{(["highlight", "prepare", "ask"] as const).map(kind => { const items = report.actions.filter(item => item.kind === kind); if (!items.length) return null; return <div className="kb-surface kb-action-group" key={kind}><h3>{kind === "highlight" ? "지원서에서 강조할 경험" : kind === "prepare" ? "먼저 준비하면 좋은 것" : "면접에서 확인할 질문"}</h3>{items.map((item, i) => <article className="kb-action" key={i}><span className="kb-action-number">{String(i + 1).padStart(2, "0")}</span><div><h4>{item.title}</h4>{item.profileQuote && <blockquote>{item.profileQuote}</blockquote>}{item.deliverable && <p><strong>결과물</strong>{item.deliverable}</p>}{item.doneWhen && <p><strong>완료 기준</strong>{item.doneWhen}</p>}{item.requirementIds.length > 0 && <div className="kb-linked-requirements">{item.requirementIds.map(id => <span key={id}>{report.requirements.find(req => req.id === id)?.label || id}</span>)}</div>}</div></article>)}</div>; })}{!report.actions.length && <EmptyState title="준비 과제를 정할 근거가 아직 부족해요" text={report.sectionStates.preparation.reason || "내가 맡은 역할과 경험을 보완해서 다시 분석해 주세요."} />}</div>
            <details className="kb-sources" open><summary><BookOpen size={16} />출처와 확인 범위 <span>{report.sources.length}</span><ChevronDown size={16} /></summary><div>{report.warnings.filter(warning => !sample || !warning.includes("가상")).map((warning, i) => <p className="kb-source-warning" key={i}><Info size={14} />{warning}</p>)}{report.sources.map((source, index) => <article id={`source-${source.id}`} className="kb-source" key={source.id}><span className="kb-source-number">{index + 1}</span><div>{safeUrl(source.url) ? <a href={safeUrl(source.url)!} target="_blank" rel="noopener noreferrer">{source.title}<ExternalLink size={12} /></a> : <strong>{source.title}</strong>}<p>{source.publisher || "발행기관 미확인"} · {source.evidenceMode === "raw_text" ? "확보 원문" : source.evidenceMode === "provider_citation" ? "검색 제공자 인용" : "사용자 제공 자료"}</p><p>발행일 {source.publishedAt || "미확인"} · 확인일 {dateLabel(source.retrievedAt)}</p>{source.excerpt && source.kind !== "job" && <details className="kb-excerpt"><summary>근거 내용 보기</summary><p>{source.excerpt}</p></details>}</div></article>)}</div></details>
        <div className="kb-report-end"><button type="button" className="kb-secondary" onClick={backToSearch}>다른 공고 분석하기 <ArrowRight size={16} /></button>{!sample && <button type="button" className="kb-text-button" onClick={editProfile}>{openedFromHistory ? "공고 재확인 후 경험 수정하기" : "내 경험 수정하기"}</button>}</div>
      </section>}
    </main>
    <footer className="kb-footer">Know the company. Know yourself.</footer>
  </div>;
}
function SectionTitle({ number, title, text }: { number: string; title: string; text: string }) { return <div className="kb-section-title"><span>{number}</span><div><h3>{title}</h3><p>{text}</p></div></div>; }
function EmptyState({ title, text }: { title: string; text: string }) { return <div className="kb-surface kb-empty"><Info size={23} /><h3>{title}</h3><p>{text}</p></div>; }
