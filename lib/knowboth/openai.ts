import { z } from "zod";
import { analysisInstructions, reportJsonSchema, researchInstructions, researchJsonSchema } from "./prompts";
import { revenueObservationSchema, revenueSchema } from "./schema";

const nullableText = z.string().nullable();
const sourceSchema = z.object({
  id: z.string().min(1).max(80),
  kind: z.enum(["job", "official", "filing", "news", "user"]),
  url: z.string().url().nullable(),
  title: z.string().min(1).max(300),
  publisher: nullableText,
  publishedAt: nullableText,
  retrievedAt: z.string(),
  evidenceMode: z.enum(["raw_text", "provider_citation", "user_provided"]),
  excerpt: nullableText,
});
const claimSchema = z.object({
  id: z.string().min(1).max(80),
  topic: z.enum(["customer", "problem", "product", "revenue_model", "role_contribution", "work", "output", "collaboration", "success_metric", "other"]),
  text: z.string().min(1).max(1200),
  kind: z.enum(["sourced", "inference", "unknown"]),
  sourceIds: z.array(z.string()),
  rationale: nullableText,
  conflict: z.boolean(),
});
const observationSchema = z.object({
  entityName: z.string(), amountDecimal: z.string(), currency: z.string(), periodStart: z.string(), periodEnd: z.string(),
  periodType: z.enum(["annual", "quarter", "ytd"]), accountingScope: z.enum(["consolidated", "separate", "unknown"]),
  accountLabel: z.string(), sourceIds: z.array(z.string()), disclosureId: nullableText,
});
const researchSchema = z.object({
  identity: z.object({
    displayName: z.string(), legalName: nullableText, website: z.string().url().nullable(), corpCode: nullableText,
    status: z.enum(["matched", "ambiguous", "unresolved"]), note: z.string(), sourceIds: z.array(z.string()),
    candidates: z.array(z.object({
      displayName: z.string(), legalName: nullableText, website: z.string().url().nullable(), sourceIds: z.array(z.string()),
    })).max(5),
  }),
  sources: z.array(sourceSchema),
  companyClaims: z.array(claimSchema).max(12),
  businessChanges: z.array(z.object({ claim: z.string(), eventDate: nullableText, publishedAt: nullableText, sourceIds: z.array(z.string()) })).max(3),
  revenue: z.object({
    status: z.enum(["available", "not_found", "access_failed", "identity_unresolved", "conflicting", "skipped"]),
    selected: observationSchema.nullable(), observations: z.array(observationSchema).max(8), reason: nullableText,
  }),
  warnings: z.array(z.string()).max(12),
});

export type CompanyResearch = z.infer<typeof researchSchema>;

type ApiOutput = {
  status?: string;
  error?: { message?: string } | null;
  incomplete_details?: { reason?: string } | null;
  output?: Array<{
    type?: string;
    action?: { sources?: Array<{ type?: string; url?: string; title?: string }> };
    content?: Array<{
      type?: string;
      text?: string;
      refusal?: string;
      annotations?: Array<{ type?: string; url?: string; title?: string }>;
    }>;
  }>;
};

type JobForAnalysis = {
  companyDisplayName: string;
  positionTitle: string;
  sourceUrl: string | null;
  inputMethod: "ai_research";
  rawText: string;
};

type ProfileForAnalysis = {
  experienceText: string;
  desiredWork: string | null;
  constraints: string | null;
  additionalAnswers: Array<{ question: string; answer: string }>;
} | null;

const nullableStringKeys = new Set([
  "alternative", "corpCode", "disclosureId", "doneWhen", "eventDate", "excerpt", "expectedLevel",
  "followUpQuestion", "legalName", "profileQuote", "publishedAt", "publisher", "rationale", "reason",
  "sourceUrl", "website", "deliverable",
]);
const dateOnlyKeys = new Set(["eventDate", "publishedAt"]);

function normalizeModelOutput(value: unknown, key = ""): unknown {
  if (Array.isArray(value)) return value.map(item => normalizeModelOutput(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, normalizeModelOutput(child, childKey)]));
  }
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (nullableStringKeys.has(key) && !trimmed) return null;
  if (dateOnlyKeys.has(key) && trimmed && !/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  return trimmed;
}

function model() {
  return process.env.OPENAI_MODEL?.trim() || "gpt-5.6-luna";
}

async function responseRequest(body: Record<string, unknown>, signal: AbortSignal): Promise<ApiOutput> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("OPENAI_API_KEY가 설정되지 않았어요.");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: model(), store: false, ...body }),
    signal,
  });
  const data = await response.json().catch(() => ({})) as ApiOutput;
  if (!response.ok) {
    if (response.status === 401) throw new Error("OpenAI API 키를 확인해 주세요.");
    if (response.status === 429) throw new Error("AI 요청 한도에 도달했어요. 잠시 후 다시 시도해 주세요.");
    if (response.status === 400 || response.status === 404) throw new Error("설정한 AI 모델이 웹 검색과 구조화 출력을 지원하는지 확인해 주세요.");
    throw new Error("AI 서비스에 일시적인 문제가 생겼어요. 잠시 후 다시 시도해 주세요.");
  }
  if (data.status === "incomplete") throw new Error(`AI 응답이 완료되지 않았어요${data.incomplete_details?.reason ? `: ${data.incomplete_details.reason}` : "."}`);
  if (data.status && data.status !== "completed") throw new Error("AI 응답이 완료되지 않았어요.");
  return data;
}

function outputText(data: ApiOutput) {
  const contents = (data.output || []).flatMap(item => item.type === "message" ? item.content || [] : []);
  const refusal = contents.find(item => item.type === "refusal")?.refusal;
  if (refusal) throw new Error("AI가 이 입력을 분석할 수 없다고 응답했어요.");
  const text = contents.filter(item => item.type === "output_text").map(item => item.text || "").join("");
  if (!text) throw new Error("AI 응답에 분석 결과가 없어요.");
  return text;
}

function normalizeUrl(value: string) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return "";
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|ref$|source$)/i.test(key)) url.searchParams.delete(key);
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return "";
  }
}

function hostname(value: string | null) {
  try { return value ? new URL(value).hostname.toLocaleLowerCase("en-US") : ""; } catch { return ""; }
}

function isSameSite(host: string, expected: string) {
  return Boolean(host && expected && (host === expected || host.endsWith(`.${expected}`)));
}

function consultedSources(data: ApiOutput) {
  const found = new Map<string, { url: string; title: string }>();
  for (const item of data.output || []) {
    for (const source of item.action?.sources || []) {
      if (!source.url) continue;
      const key = normalizeUrl(source.url);
      if (key) found.set(key, { url: source.url, title: source.title || source.url });
    }
    for (const content of item.content || []) for (const citation of content.annotations || []) {
      if (!citation.url) continue;
      const key = normalizeUrl(citation.url);
      if (key) found.set(key, { url: citation.url, title: citation.title || citation.url });
    }
  }
  return found;
}

function sameRevenueObservation(left: z.infer<typeof observationSchema>, right: z.infer<typeof observationSchema>) {
  return left.entityName === right.entityName
    && left.amountDecimal === right.amountDecimal
    && left.currency === right.currency
    && left.periodStart === right.periodStart
    && left.periodEnd === right.periodEnd
    && left.periodType === right.periodType
    && left.accountingScope === right.accountingScope
    && left.accountLabel === right.accountLabel
    && left.disclosureId === right.disclosureId
    && left.sourceIds.length === right.sourceIds.length
    && [...left.sourceIds].sort().every((id, index) => id === [...right.sourceIds].sort()[index]);
}

function verifiedResearch(raw: unknown, data: ApiOutput): CompanyResearch {
  const parsed = researchSchema.parse(raw);
  const consulted = consultedSources(data);
  const retrievedAt = new Date().toISOString();
  const accepted = parsed.sources.flatMap(source => {
    if (!source.url) return [];
    const match = consulted.get(normalizeUrl(source.url));
    if (!match) return [];
    const publishedAt = source.publishedAt?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] || null;
    return [{
      ...source,
      url: match.url,
      title: (source.title || match.title).trim().slice(0, 500),
      publisher: source.publisher?.trim().slice(0, 200) || null,
      publishedAt,
      retrievedAt,
      evidenceMode: "provider_citation" as const,
      excerpt: null,
    }];
  });
  const uniqueAccepted = [...new Map(accepted.map(source => [source.id, source])).values()];
  const idMap = new Map(uniqueAccepted.map((source, index) => [source.id, `web-${index + 1}`]));
  const sources = uniqueAccepted.map(source => ({ ...source, id: idMap.get(source.id)! }));
  const refs = (ids: string[]) => [...new Set(ids.flatMap(id => idMap.get(id) || []))];
  const companyClaims = parsed.companyClaims.map(claim => {
    const sourceIds = refs(claim.sourceIds);
    return { ...claim, sourceIds, kind: claim.kind === "sourced" && sourceIds.length === 0 ? "unknown" as const : claim.kind };
  });
  const businessChanges = parsed.businessChanges.map(change => ({ ...change, sourceIds: refs(change.sourceIds) })).filter(change => change.sourceIds.length > 0);
  const officialHost = hostname(parsed.identity.website).replace(/^www\./, "");
  const financialSourceIds = new Set(sources.filter(source => {
    const host = hostname(source.url);
    return host === "dart.fss.or.kr"
      || host === "opendart.fss.or.kr"
      || host === "kind.krx.co.kr"
      || (isSameSite(host, officialHost) && (source.kind === "official" || source.kind === "filing"));
  }).map(source => source.id));
  const observations = parsed.revenue.observations.flatMap(item => {
    const candidate = { ...item, sourceIds: refs(item.sourceIds) };
    if (!candidate.sourceIds.some(id => financialSourceIds.has(id))) return [];
    const result = revenueObservationSchema.safeParse(candidate);
    return result.success ? [result.data] : [];
  });
  const selected = parsed.revenue.selected
    ? observations.find(item => sameRevenueObservation(item, { ...parsed.revenue.selected!, sourceIds: refs(parsed.revenue.selected!.sourceIds) })) || null
    : null;
  const rejectedAllObservations = parsed.revenue.observations.length > 0 && observations.length === 0;
  const status = (parsed.revenue.status === "available" && !selected)
    || (parsed.revenue.status === "conflicting" && rejectedAllObservations)
    ? "not_found" as const
    : parsed.revenue.status;
  const reason = rejectedAllObservations
    ? "공식 공시 또는 기업 공식 도메인에서 검증 가능한 매출 원자료를 확인하지 못했습니다."
    : status === "available"
      ? parsed.revenue.reason
      : parsed.revenue.reason || "검증 가능한 매출 원자료를 확인하지 못했습니다.";
  const verifiedRevenue = revenueSchema.safeParse({
    ...parsed.revenue,
    status,
    selected: status === "available" ? selected : null,
    observations,
    reason,
  });
  return {
    ...parsed,
    identity: {
      ...parsed.identity,
      sourceIds: refs(parsed.identity.sourceIds),
      candidates: parsed.identity.candidates
        .map(candidate => ({ ...candidate, sourceIds: refs(candidate.sourceIds) }))
        .filter(candidate => candidate.sourceIds.length > 0),
    },
    sources,
    companyClaims,
    businessChanges,
    revenue: verifiedRevenue.success
      ? verifiedRevenue.data
      : { status: "not_found", selected: null, observations: [], reason: "매출 자료의 형식을 검증하지 못했습니다." },
    warnings: [
      ...parsed.warnings.filter(Boolean),
      ...(parsed.sources.length > sources.length ? ["검색 도구가 확인하지 않은 출처는 보고서에서 제외했습니다."] : []),
      ...(parsed.revenue.observations.length > observations.length ? ["공식 공시 또는 기업 공식 도메인에 연결되지 않은 매출 수치는 제외했습니다."] : []),
    ],
  };
}

export async function researchCompany(job: JobForAnalysis, signal: AbortSignal, companyHint?: { legalName: string; website: string | null } | null) {
  const data = await responseRequest({
    instructions: researchInstructions,
    input: JSON.stringify({
      companyDisplayName: job.companyDisplayName,
      positionTitle: job.positionTitle,
      sourceUrl: job.sourceUrl,
      companyHint: companyHint || null,
      jobText: job.rawText,
      researchDate: new Date().toISOString().slice(0, 10),
    }),
    tools: [{ type: "web_search", search_context_size: "medium" }],
    tool_choice: "required",
    include: ["web_search_call.action.sources"],
    text: { format: { type: "json_schema", name: "knowboth_company_research", strict: true, schema: researchJsonSchema } },
    max_output_tokens: 5000,
  }, signal);
  let raw: unknown;
  try { raw = normalizeModelOutput(JSON.parse(outputText(data))); } catch { throw new Error("기업 조사 결과를 읽지 못했어요."); }
  return verifiedResearch(raw, data);
}

export async function analyzeJob(job: JobForAnalysis, profile: ProfileForAnalysis, research: CompanyResearch, signal: AbortSignal) {
  const jobSource = {
    id: "job-1", kind: "job" as const, url: job.sourceUrl, title: `${job.companyDisplayName} ${job.positionTitle} 채용공고`,
    publisher: job.sourceUrl ? "원티드" : null, publishedAt: null, retrievedAt: new Date().toISOString(), evidenceMode: "provider_citation" as const,
    excerpt: null,
  };
  const sources = [jobSource, ...research.sources];
  const data = await responseRequest({
    instructions: analysisInstructions,
    input: JSON.stringify({ job, profile, research: { ...research, sources }, allowedSourceIds: sources.map(source => source.id) }),
    text: { format: { type: "json_schema", name: "knowboth_report", strict: true, schema: reportJsonSchema } },
    max_output_tokens: 7000,
  }, signal);
  let raw: unknown;
  try { raw = normalizeModelOutput(JSON.parse(outputText(data))); } catch { throw new Error("분석 보고서를 읽지 못했어요."); }
  if (raw && typeof raw === "object") (raw as Record<string, unknown>).sources = sources;
  return raw;
}
