import { z } from "zod";
import { resolveLocale, type Locale } from "../i18n/locale";
import { boundedText } from "./bounded-text";

const messages = {
  origin: [
    "이 사이트의 분석 화면에서 요청해 주세요.",
    "Please submit this request from the KnowBoth website.",
  ],
  json: ["JSON 입력이 필요해요.", "The request must contain JSON."],
  tooLarge: ["입력이 너무 길어요.", "The input is too long."],
  invalid: ["입력 내용을 확인해 주세요.", "Please check the information you entered."],
  unreadable: ["입력 내용을 읽지 못했어요.", "The request could not be read. Please try again."],
  configuration: ["AI 분석 설정이 아직 연결되지 않았어요.", "AI analysis is not configured yet."],
  jobRequired: [
    "공고를 다시 확인한 뒤 분석해 주세요.",
    "Please verify the job posting again before continuing.",
  ],
  jobProof: [
    "공고 확인 정보가 일치하지 않아요. 공고를 다시 확인해 주세요.",
    "The job verification no longer matches. Please verify the posting again.",
  ],
  jobUrl: [
    "원티드 공고 주소나 wntd.co 링크가 포함된 공유 문구를 입력해 주세요.",
    "Paste a Wanted job URL or shared text containing a wntd.co link.",
  ],
  shareLink: [
    "공유 링크에서 원티드 공고를 확인하지 못했어요. 원티드 공고를 연 뒤 /wd/숫자 주소를 붙여넣어 주세요.",
    "The shared link could not be resolved. Open the posting and paste its wanted.co.kr/wd/number URL.",
  ],
  jobTimeout: [
    "공고 확인 시간이 길어져 중단했어요. 잠시 후 다시 시도해 주세요.",
    "Job verification timed out. Please try again shortly.",
  ],
  jobConfiguration: [
    "AI 공고 조사 설정을 확인해 주세요.",
    "Job research is unavailable. Please check the AI configuration.",
  ],
  jobRefusal: [
    "AI가 이 공고를 조사할 수 없다고 응답했어요.",
    "The AI service could not research this posting.",
  ],
  rateLimit: [
    "AI 요청이 많아요. 잠시 후 다시 시도해 주세요.",
    "The AI service is busy. Please try again shortly.",
  ],
  jobNotFound: [
    "해당 원티드 공고의 공개 내용을 확인하지 못했어요. 공고가 열려 있는지 확인한 뒤 다시 시도해 주세요.",
    "The public posting could not be verified. Check that it is still available and try again.",
  ],
  jobInvalid: [
    "공고 내용을 충분히 확인하지 못했어요. 잠시 후 다시 시도해 주세요.",
    "Not enough posting content could be verified. Please try again shortly.",
  ],
  jobUpstream: [
    "공고 조사 중 일시적인 문제가 생겼어요. 잠시 후 다시 시도해 주세요.",
    "Job research is temporarily unavailable. Please try again shortly.",
  ],
  companyMismatch: [
    "선택한 법인과 조사 결과가 일치하지 않아 매출 분석을 중단했어요. 회사명을 확인해 주세요.",
    "The research did not match the selected legal entity. Please check the company name.",
  ],
  analysisTimeout: [
    "분석 시간이 길어져 중단했어요. 입력은 그대로 두고 다시 시도해 주세요.",
    "Analysis timed out. Your input is still here; please try again.",
  ],
  analysisInvalid: [
    "AI 결과의 근거 또는 형식을 검증하지 못했어요. 다시 시도해 주세요.",
    "The analysis format or evidence could not be verified. Please try again.",
  ],
  analysisFailed: [
    "분석 중 문제가 생겼어요. 다시 시도해 주세요.",
    "Analysis failed. Please try again.",
  ],
  recommendationsInvalid: [
    "추천에 사용할 공고와 이력서를 확인해 주세요.",
    "Please check the job posting and experience used for recommendations.",
  ],
  recommendationsTimeout: [
    "다른 공고 검색 시간이 길어져 멈췄어요. 기존 분석은 그대로이며 다시 검색할 수 있어요.",
    "The search timed out. Your existing analysis is unchanged; you can search again.",
  ],
  recommendationsConfiguration: [
    "공고 추천에 사용할 AI 모델과 API 설정을 확인해 주세요.",
    "Recommendations are unavailable. Please check the AI model and API configuration.",
  ],
  recommendationsFailed: [
    "추천 공고의 출처나 내용을 검증하지 못했어요. 기존 분석은 유지되며 다시 검색할 수 있어요.",
    "The recommended postings could not be verified. Your existing analysis is unchanged; you can search again.",
  ],
} as const;

type MessageKey = keyof typeof messages;

export class HttpError extends Error {
  constructor(
    public readonly key: MessageKey,
    public readonly status: number,
  ) {
    super(key);
    this.name = "HttpError";
  }
}

/** Existing API consumers keep Korean unless they explicitly request English. */
export function requestLocale(request: Request): Locale {
  return resolveLocale(request.headers.get("x-knowboth-locale"), "ko");
}

export function jsonReply(value: unknown, locale: Locale, status = 200) {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store", "Content-Language": locale },
  });
}

export function errorReply(
  key: MessageKey,
  locale: Locale,
  status: number,
  details: { code?: string; retryable?: boolean } = {},
) {
  return jsonReply({ error: messages[key][locale === "ko" ? 0 : 1], ...details }, locale, status);
}

/** HTTP validation stays at the transport boundary, before any external work. */
export async function readJson<T>(
  request: Request,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  limit: number,
  invalid: MessageKey = "invalid",
  signal: AbortSignal = request.signal,
): Promise<T> {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) throw new HttpError("origin", 403);
  if (
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json"
  )
    throw new HttpError("json", 415);
  const raw = await boundedText(
    new Response(request.body, { headers: request.headers }),
    signal,
    limit,
  );
  if (raw === null) throw new HttpError("tooLarge", 413);
  try {
    return schema.parse(JSON.parse(raw));
  } catch (error) {
    throw new HttpError(error instanceof z.ZodError ? invalid : "unreadable", 400);
  }
}
