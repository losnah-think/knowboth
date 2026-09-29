import type { Locale } from "@/lib/i18n/locale";
import type { Claim, Report } from "./schema";
export const SAMPLE_JOB =
  "노트웍스는 소규모 팀을 위한 업무 협업 도구를 만듭니다.\n\n주요 업무\n• 신규 고객의 제품 도입과 온보딩 과정을 개선합니다.\n• 고객 인터뷰와 사용 데이터를 바탕으로 문제를 정의합니다.\n• 개발자, 디자이너와 개선 실험을 설계하고 실행합니다.\n\n자격요건\n• 고객 문제를 발견하고 개선안을 제안한 경험\n• 데이터와 정성적 근거를 함께 활용하는 능력\n\n우대사항\n• B2B SaaS 온보딩 또는 고객 운영 경험";
export const SAMPLE_PROFILE =
  "대학 프로젝트에서 협업 도구 사용자 8명을 인터뷰했습니다. 가입 과정의 문제를 정리하고 개선안을 작성했습니다. 개발자, 디자이너와 함께 프로토타입을 만들고 사용성 테스트를 진행했습니다. B2B 고객사 온보딩을 직접 운영한 경험은 없습니다.";
const ENGLISH_JOB =
  "Noteworks builds collaboration software for small teams.\n\nResponsibilities\n• Improve adoption and onboarding for new customers.\n• Define problems through customer interviews and product usage data.\n• Design and run improvement experiments with engineers and designers.\n\nRequirements\n• Experience identifying customer problems and proposing improvements\n• Ability to combine quantitative data with qualitative evidence\n\nPreferred\n• Experience in B2B SaaS onboarding or customer operations";
const ENGLISH_PROFILE =
  "I interviewed eight users of collaboration tools for a university project. I documented problems in the sign-up process and proposed improvements. I worked with engineers and designers to build a prototype and run usability tests. I have no experience directly managing onboarding for B2B customers.";
/** Fictional, self-contained examples; never populated from a user's profile. */
export function sampleReport(locale: Locale = "ko"): Report {
  const text = (ko: string, en: string) => (locale === "en" ? en : ko);
  const jobText = locale === "en" ? ENGLISH_JOB : SAMPLE_JOB;
  const profileText = locale === "en" ? ENGLISH_PROFILE : SAMPLE_PROFILE;
  const now = new Date().toISOString();
  const claim = (
    id: string,
    topic: Claim["topic"],
    text: string,
    kind: Claim["kind"] = "sourced",
    sourceIds = ["sample-job"],
  ): Claim => ({ id, topic, text, kind, sourceIds, rationale: null, conflict: false });
  return {
    schemaVersion: "1.0",
    analysisId: "sample",
    generatedAt: now,
    summary: text(
      "이 포지션은 고객의 첫 제품 경험을 개선하는 역할이에요. 인터뷰와 개선안 작성 경험을 보여주고, B2B 고객 운영의 실제 범위는 확인해 보세요.",
      "This role improves the first experience customers have with a product. Show how your interviews led to proposed improvements, and clarify the scope of B2B customer operations.",
    ),
    job: {
      id: "sample-job",
      sourceUrl: null,
      inputMethod: "ai_research",
      companyDisplayName: text("노트웍스", "Noteworks"),
      positionTitle: text("Product Manager · 고객 온보딩", "Product Manager · Customer Onboarding"),
      rawText: jobText,
      collectedAt: now,
      userEdited: false,
    },
    companyIdentity: {
      displayName: text("노트웍스", "Noteworks"),
      legalName: null,
      website: null,
      corpCode: null,
      status: "unresolved",
      evidenceSourceIds: ["sample-job"],
      candidates: [],
    },
    sources: [
      {
        id: "sample-job",
        kind: "job",
        url: null,
        title: text("노트웍스 채용공고 · 가상 자료", "Noteworks job posting · Fictional example"),
        publisher: text("KnowBoth 예시", "KnowBoth example"),
        publishedAt: null,
        retrievedAt: now,
        evidenceMode: "user_provided",
        excerpt: jobText,
      },
      {
        id: "sample-profile",
        kind: "user",
        url: null,
        title: text("지원자 경험 · 가상 자료", "Candidate experience · Fictional example"),
        publisher: text("KnowBoth 예시", "KnowBoth example"),
        publishedAt: null,
        retrievedAt: now,
        evidenceMode: "user_provided",
        excerpt: profileText,
      },
    ],
    companyClaims: [
      claim(
        "c1",
        "customer",
        text(
          "여러 사람이 함께 일하는 소규모 팀이 주요 고객입니다.",
          "The company serves small teams that work together.",
        ),
      ),
      claim(
        "c2",
        "product",
        text(
          "팀의 업무와 협업을 돕는 소프트웨어를 제공합니다.",
          "It provides software for team workflows and collaboration.",
        ),
      ),
      claim(
        "c3",
        "revenue_model",
        text(
          "구독료·좌석당 과금 등 구체적인 수익 방식은 이 공고만으로 확인할 수 없습니다.",
          "The posting does not establish whether the company charges subscriptions, per-seat fees, or uses another revenue model.",
        ),
        "unknown",
        [],
      ),
      claim(
        "c4",
        "role_contribution",
        text(
          "고객이 도구를 처음 도입하는 과정의 어려움을 줄이는 데 이 포지션이 기여할 수 있습니다.",
          "This role may help reduce friction when customers first adopt the product.",
        ),
        "inference",
      ),
    ],
    businessChanges: [],
    roleClaims: [
      claim(
        "r1",
        "work",
        text(
          "신규 고객의 온보딩 과정을 개선하고, 인터뷰와 사용 데이터로 문제를 정의합니다.",
          "The role improves new-customer onboarding and uses interviews and product usage data to define problems.",
        ),
      ),
      claim(
        "r2",
        "collaboration",
        text(
          "개발자·디자이너와 개선 실험을 설계하고 실행합니다.",
          "The role designs and runs improvement experiments with engineers and designers.",
        ),
      ),
    ],
    revenue: {
      status: "not_found",
      selected: null,
      observations: [],
      reason: text(
        "가상 기업 예시로, 실제 매출 자료는 제공하지 않습니다.",
        "This company is fictional. No actual revenue data is provided.",
      ),
    },
    requirements: [
      {
        id: "req1",
        label: text(
          "고객 문제 발견과 개선안 제안",
          "Identify customer problems and propose improvements",
        ),
        category: "required",
        jobQuote: text(
          "고객 문제를 발견하고 개선안을 제안한 경험",
          "Experience identifying customer problems and proposing improvements",
        ),
        expectedLevel: null,
      },
      {
        id: "req2",
        label: text("데이터와 정성적 근거 활용", "Combine quantitative and qualitative evidence"),
        category: "required",
        jobQuote: text(
          "데이터와 정성적 근거를 함께 활용하는 능력",
          "Ability to combine quantitative data with qualitative evidence",
        ),
        expectedLevel: null,
      },
      {
        id: "req3",
        label: text("B2B 고객 온보딩 경험", "B2B customer onboarding experience"),
        category: "preferred",
        jobQuote: text(
          "B2B SaaS 온보딩 또는 고객 운영 경험",
          "Experience in B2B SaaS onboarding or customer operations",
        ),
        expectedLevel: null,
      },
    ],
    hiringHypotheses: [
      {
        id: "h1",
        kind: "inference",
        claim: text(
          "신규 고객이 제품을 활용하기까지의 과정을 더 잘 설계하려는 채용일 수 있습니다.",
          "The company may be hiring to improve the journey from initial adoption to active product use.",
        ),
        evidenceSourceIds: ["sample-job"],
        requirementIds: ["req1"],
        alternative: text(
          "사업 확장뿐 아니라 기존 온보딩 운영의 개선을 위한 채용일 수도 있습니다.",
          "The role could focus on improving existing onboarding operations rather than supporting expansion.",
        ),
        question: text(
          "이번 채용으로 가장 먼저 해결하려는 고객의 어려움은 무엇인가요?",
          "Which customer problem should this hire address first?",
        ),
      },
    ],
    fitItems: [
      {
        requirementId: "req1",
        status: "evidence",
        profileQuote: text(
          "가입 과정의 문제를 정리하고 개선안을 작성했습니다.",
          "I documented problems in the sign-up process and proposed improvements.",
        ),
        reason: text(
          "문제를 발견하고 개선안을 만든 경험이 공고의 요구와 연결됩니다. 실제 맡은 범위와 결과를 구체적으로 설명해 보세요.",
          "Your experience identifying problems and proposing improvements relates to this requirement. Explain your specific responsibilities and the results.",
        ),
        followUpQuestion: null,
      },
      {
        requirementId: "req2",
        status: "unknown",
        profileQuote: null,
        reason: text(
          "인터뷰 경험은 있지만 사용 데이터를 분석한 경험은 현재 자료에서 확인되지 않습니다.",
          "Your profile describes interviews but does not establish experience analyzing product usage data.",
        ),
        followUpQuestion: text(
          "문제를 판단할 때 어떤 지표나 데이터를 함께 살펴봤나요?",
          "Which metrics or data did you use alongside interviews to assess the problem?",
        ),
      },
      {
        requirementId: "req3",
        status: "gap",
        profileQuote: text(
          "B2B 고객사 온보딩을 직접 운영한 경험은 없습니다.",
          "I have no experience directly managing onboarding for B2B customers.",
        ),
        reason: text(
          "직접 운영한 경험이 없다고 밝혔어요. 우대 조건이므로 필수 조건과 구분해 준비하면 됩니다.",
          "You explicitly state that you have not managed B2B onboarding. This is a preferred qualification, so distinguish it from the essential requirements.",
        ),
        followUpQuestion: null,
      },
    ],
    conditionChecks: [],
    preferenceQuestions: [],
    actions: [
      {
        kind: "highlight",
        title: text(
          "사용자 인터뷰를 개선안으로 연결한 경험",
          "Show how user interviews informed your proposed improvements",
        ),
        requirementIds: ["req1"],
        claimIds: [],
        profileQuote: text(
          "대학 프로젝트에서 협업 도구 사용자 8명을 인터뷰했습니다.",
          "I interviewed eight users of collaboration tools for a university project.",
        ),
        deliverable: text(
          "문제 → 조사 → 판단 → 개선안의 흐름으로 사례 1개 정리",
          "One case study covering the problem, research, decisions, and proposed improvements",
        ),
        doneWhen: text(
          "내가 맡은 일과 판단 근거를 2분 안에 설명할 수 있어요.",
          "You can explain your contribution and the evidence behind your decisions in two minutes.",
        ),
      },
      {
        kind: "prepare",
        title: text(
          "고객 온보딩 개선안을 1페이지로 정리하기",
          "Write a one-page proposal to improve customer onboarding",
        ),
        requirementIds: ["req1", "req3"],
        claimIds: [],
        profileQuote: null,
        deliverable: text(
          "공개 체험 흐름, 이탈 가설, 확인할 지표, 개선안",
          "Public trial flow, drop-off hypotheses, metrics to investigate, and proposed improvements",
        ),
        doneWhen: text(
          "가설과 실제 확인한 사실을 구분하고 개선 이유를 설명해요.",
          "You can separate hypotheses from observed facts and explain the reasoning for each improvement.",
        ),
      },
      {
        kind: "ask",
        title: text(
          "입사 후 가장 먼저 맡게 될 온보딩 과제는 무엇인가요?",
          "What onboarding challenge would I work on first?",
        ),
        requirementIds: ["req1"],
        claimIds: ["c4"],
        profileQuote: null,
        deliverable: null,
        doneWhen: null,
      },
    ],
    sectionStates: {
      company: { status: "ready", reason: null },
      revenue: { status: "unavailable", reason: text("가상 예시", "Fictional example") },
      hiring: { status: "ready", reason: null },
      personalization: { status: "ready", reason: null },
      preparation: { status: "ready", reason: null },
    },
    warnings: [
      text(
        "이 보고서는 사용 방법을 보여주는 가상 예시입니다. 회사·공고·지원자 경험은 모두 가상 자료입니다.",
        "This report demonstrates how KnowBoth works. The company, job posting, and candidate experience are entirely fictional.",
      ),
    ],
  };
}
