import type { Locale } from "./locale";

const ko = {
  title: "나의 경험과 연결되는 다른 회사",
  search: "다른 공고 찾기",
  searchAgain: "다시 검색",
  intro:
    "직무 이름만 비슷한 곳이 아니라, 이 분석에 제공한 경험과 희망 조건을 원티드 공고의 문구에 연결해 봐요.",
  sampleTitle: "가상 예시에서는 실제 회사에 대한 추천을 만들지 않아요.",
  sampleBody: "실제 공고와 경험을 분석하면 이곳에서 원티드 공고 후보를 찾아볼 수 있어요.",
  savedTitle: "저장된 보고서에는 당시의 이력서 원문과 확인 서명이 보관되지 않아요.",
  noProfileTitle: "이력서나 경험을 추가하면 다른 회사도 찾아드려요.",
  noProfileBody:
    "직무만으로 나와 잘 맞는 회사라고 판단하지 않아요. 경험을 포함해 다시 분석해 주세요.",
  editProfile: "경험 추가하고 다시 분석하기",
  privacy:
    "검색어는 경력·기술 키워드로 만들어요. 경험 텍스트는 AI 비교에 사용되며, 웹 검색 단계에는 검색어만 전달해요. 검색 시점에 따라 결과가 달라질 수 있어요.",
  readyTitle: "경험과 연결되는 다른 기회도 살펴보세요.",
  readyBody:
    "버튼을 누르면 새로운 검색을 시작해요. 언어를 바꾸거나 보고서를 다시 열어도 자동으로 검색하지 않아요.",
  loadingTitle: "원티드 공고를 찾고 원문을 확인하고 있어요.",
  loadingBody: "기존 보고서는 바로 읽을 수 있어요. 확인된 후보만 최대 3개 표시해요.",
  stop: "검색 멈추기",
  cancelled: "검색을 멈췄어요. 기존 보고서와 이력서는 그대로예요.",
  retry: "추천 공고만 다시 검색",
  reviewProfile: "공고·경험 다시 확인하기",
  checked: "확인",
  queries: "검색어",
  emptyTitle: "검증을 통과한 추천 공고가 아직 없어요.",
  refine: "희망 업무·조건 다듬기",
  accepting: "지원 버튼 확인 · 접수 여부 재확인 필요",
  checkRequired: "공고 원문 확인 · 채용 상태 확인 필요",
  deadline: "공고에 표시된 마감일",
  matches: "내 경험과 연결되는 근거",
  profileQuote: "내 경험",
  jobQuote: "공고 원문",
  interpretation: "연결 해석",
  conditions: "희망 조건은 따로 확인해요",
  supported: "연결되는 공고 문구 있음",
  unknown: "미확인",
  viewPosting: "원티드 공고 보기",
  newWindow: "새 창",
  disclaimer: "이 실시간 추천 영역은 최근 분석 기록과 PDF에는 저장되지 않아요.",
  searchError: "공고 검색을 완료하지 못했어요. 기존 분석은 그대로예요.",
  formatError: "추천 공고의 형식을 확인하지 못했어요. 다시 검색해 주세요.",
  timeoutError: "다른 공고 검색 시간이 길어져 멈췄어요. 기존 분석은 그대로예요.",
  connectionError: "공고 검색에 연결하지 못했어요.",
};

const en: Record<keyof typeof ko, string> = {
  title: "More opportunities connected to your experience",
  search: "Find other opportunities",
  searchAgain: "Search again",
  intro:
    "Explore Wanted job postings connected to the experience and preferences you provided, using evidence beyond similar job titles.",
  sampleTitle: "Live recommendations are not available in this fictional example.",
  sampleBody:
    "Analyze a real posting with your experience to explore other opportunities on Wanted.",
  savedTitle: "Saved reports do not retain your original resume or posting verification token.",
  noProfileTitle: "Add your resume or experience to explore other companies.",
  noProfileBody:
    "A job title alone cannot establish a match. Run a new analysis with your experience included.",
  editProfile: "Add experience and analyze again",
  privacy:
    "Search queries use career and skill keywords. Your experience is used for AI comparison; only search keywords are sent to web search. Results may change over time.",
  readyTitle: "Explore other opportunities connected to your experience.",
  readyBody:
    "Start a new search when you are ready. Changing the language or reopening a report does not start a search automatically.",
  loadingTitle: "Finding Wanted postings and checking their source text.",
  loadingBody:
    "You can keep reading your report. Up to three verified candidates will appear here.",
  stop: "Stop search",
  cancelled: "Search stopped. Your report and resume are unchanged.",
  retry: "Retry opportunity search",
  reviewProfile: "Review posting and experience",
  checked: "Checked",
  queries: "Search terms",
  emptyTitle: "No opportunities have passed verification yet.",
  refine: "Refine your role preferences",
  accepting: "Apply button found · Confirm applications are open",
  checkRequired: "Posting text verified · Confirm hiring status",
  deadline: "Deadline shown in the posting",
  matches: "Evidence connected to your experience",
  profileQuote: "Your experience",
  jobQuote: "Job posting",
  interpretation: "Interpretation",
  conditions: "Check your preferences separately",
  supported: "Related evidence in the posting",
  unknown: "Unverified",
  viewPosting: "View posting on Wanted",
  newWindow: "opens in a new tab",
  disclaimer: "Live recommendations are not included in saved reports or PDF downloads.",
  searchError:
    "The opportunity search could not be completed. Your existing analysis is unchanged.",
  formatError: "The recommendation response could not be verified. Please search again.",
  timeoutError:
    "The opportunity search took too long and was stopped. Your existing analysis is unchanged.",
  connectionError: "Could not connect to the opportunity search.",
};

export const recommendationMessages: Record<Locale, typeof ko> = { ko, en };
