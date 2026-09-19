# KnowBoth

**Know the company. Know yourself.**

원티드 채용공고와 내 경험을 바탕으로 기업의 사업·매출, 채용 배경, 요구 역량, 지원 준비를 연결하는 기업 분석기입니다.

## 구현 상태

Next.js 16 App Router 기반 MVP가 구현되어 있습니다. 원티드 공고 URL과 선택적인 이력서를 입력하면 원티드 페이지와 OpenAI 웹 검색으로 공고·기업 자료를 조사하고, 구조화된 보고서를 생성한 뒤 인용·출처·매출 기준을 서버에서 다시 검사합니다.

현재 제공하는 기능:

- 원티드 공고 URL에서 회사·포지션·주요 업무·자격요건·우대사항 조사
- 조사한 공고를 간단한 카드로 확인한 뒤 분석
- PDF, DOCX, TXT, MD 이력서의 브라우저 내 텍스트 추출
- 기업의 고객·문제·제품·수익 방식과 확인 가능한 매출 조사
- 공고에 명시된 역할과 근거에 따른 채용 배경 가설 구분
- 공고 요구와 사용자 경험 대조, 지원 조건 별도 표시
- 강조할 경험·준비할 일·면접 질문 제안
- 공고 확인과 기업 분석의 순서를 보여주는 단계별 로딩 화면, 요청 취소, 홈 이동
- 출처 링크와 한글 글꼴을 포함한 PDF 보고서 다운로드
- 완료한 실제 보고서를 이 브라우저에서 다시 여는 최근 분석 기록
- 실제 API와 분리해 표시하는 가상 예시 보고서

공고 조사도 유료 AI 호출입니다. 공개 웹에서 해당 공고를 확인하지 못하거나 공고가 만료·삭제된 경우 분석을 시작할 수 없습니다. 현재 공고 본문을 직접 붙여넣는 우회 경로는 제공하지 않습니다.

## 로컬 실행

Node.js 22와 OpenAI API 키가 필요합니다. 사용하는 API 모델은 Responses API의 웹 검색과 Structured Outputs를 모두 지원해야 합니다.

```sh
npm install
cp .env.example .env.local
```

`.env.local`에 값을 설정합니다.

```dotenv
OPENAI_API_KEY=your_api_key
OPENAI_MODEL=gpt-5.6-luna
```

`OPENAI_API_KEY`는 필수입니다. `OPENAI_MODEL`은 선택 사항이며, 생략하면 현재 코드의 기본값 `gpt-5.6-luna`를 사용합니다. 사용자가 선택한 모델도 `gpt-5.6-luna`이며 계정에서 실제 호출 가능한지 먼저 확인하세요. 두 값 모두 `NEXT_PUBLIC_` 접두사를 붙이지 않습니다.

```sh
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 엽니다.

## 검사

```sh
npm test
npx tsc --noEmit
npm run lint
npm run build
```

핵심 테스트는 원문에 없는 인용, 존재하지 않는 출처, 프로필 없는 개인화, 조건과 역량의 혼합, 법인 미확정·상충 매출의 대표값 노출을 막는 경계를 확인합니다.

## Vercel 배포

1. 저장소를 GitHub, GitLab 또는 Bitbucket에 푸시합니다.
2. Vercel Dashboard에서 **Add New → Project**를 선택하고 저장소를 Import합니다.
3. Framework Preset은 **Next.js**, Root Directory는 저장소 루트로 둡니다. Build Command, Install Command, Output Directory는 재정의하지 않습니다.
4. **Environment Variables**에 `OPENAI_API_KEY`를 추가하고 Production과 Preview에 적용합니다. 필요하면 `OPENAI_MODEL`도 같은 환경에 추가합니다.
5. **Deploy**를 선택합니다. 환경변수를 나중에 바꾸면 기존 배포에는 반영되지 않으므로 새로 배포합니다.
6. 배포 후 `/api/analyze`의 GET 응답에서 `available: true`인지 확인하고 실제 공고 한 건을 원문과 대조합니다. `/fonts/NanumGothic-Regular.ttf`와 `/fonts/NanumGothic-Bold.ttf`가 200으로 제공되는지도 확인합니다. 응답에 키 값 자체가 노출되지는 않습니다.

상세 절차와 배포 후 점검은 [Vercel 배포·운영 인수인계](docs/SOL_HANDOFF.md)에 있습니다. 공식 참고 문서는 [Next.js on Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs), [Git 저장소 배포](https://vercel.com/docs/git), [환경변수](https://vercel.com/docs/environment-variables)입니다.

## 데이터와 운영 경계

- 파일은 브라우저 메모리에서 읽고 원본 파일을 서버에 업로드하지 않습니다. 분석을 실행하면 추출한 텍스트는 서버와 OpenAI에 전달됩니다.
- 공고 조사 요청은 URL만 담은 2KB 이하 JSON입니다. 조사된 공고 텍스트와 사용자 경험은 각각 최대 20,000자이며 최종 분석 요청은 UTF-8 기준 160KB 이하입니다. 파일은 8MB 이하, PDF는 40쪽 이하입니다.
- 공고 조사 성공 시 서버가 JobInput과 현재 브라우저 메모리에 보관할 `jobProof`를 함께 반환합니다. 최종 분석은 이 서명을 `X-KnowBoth-Job-Proof` 헤더로 검증해, `/api/job`을 거치지 않은 임의 공고 본문을 거부합니다.
- OpenAI 요청에는 `store: false`를 사용하며 서버 DB에는 입력이나 보고서를 저장하지 않습니다. 완료한 실제 보고서는 최근 분석 기능을 위해 브라우저 `localStorage`에 최대 10개, 직렬화 문자열 약 200만 자 범위에서 보관합니다. 다른 기기나 브라우저와 동기화되지 않으며 각 기록의 삭제 버튼이나 브라우저 사이트 데이터 삭제로 지울 수 있습니다. 이력서 원본과 `jobProof`는 저장하지 않지만, 보고서에는 분석에 사용된 경험 인용이 포함될 수 있습니다. 모델 제공자의 별도 처리·보존 정책은 따로 적용됩니다.
- PDF는 다운로드할 때만 저장소의 `public/fonts`에 포함되어 `/fonts/...`로 제공되는 Nanum Gothic Regular/Bold를 가져와 문서에 내장합니다. 글꼴은 SIL Open Font License 1.1로 배포되며 라이선스와 출처는 [`public/fonts/README.md`](public/fonts/README.md)에 있습니다.
- 공고 조사는 50초, 기업·보고서 분석은 110초 안에서 중단됩니다. Vercel 함수의 `maxDuration`은 각각 60초와 120초이며 실제 허용 시간은 요금제 설정을 따릅니다.
- 새 URL을 분석하면 공고 조사, 기업 조사, 보고서 생성의 AI 호출이 순서대로 실행됩니다. 각 단계는 일시적인 API 오류나 결과 검증 실패가 발생하면 총 3회까지 자동으로 다시 생성합니다. 정상 경로는 3회, 모든 단계가 최대 횟수까지 실패하면 최대 9회 호출될 수 있습니다. 설정·입력 오류와 사용자 취소·시간 초과는 재시도하지 않습니다.
- 공고 조사와 최종 분석 API는 별도 접근 코드 없이 공개됩니다. 사용자 계정, 서버 캐시, 사용자·IP별 요청 제한은 없으므로 Vercel 방화벽·사용량 알림과 OpenAI 예산 제한을 설정하세요.
- OpenDART API를 직접 호출하지 않습니다. 웹 검색에서 확인한 공식 공시·IR 자료만 사용하므로 비상장사나 동명 법인은 매출이 미확인으로 남을 수 있습니다.
- 서버가 원티드 페이지의 표시 텍스트를 확보하면 AI가 추출한 회사·포지션·업무·자격요건을 원문과 정확히 대조합니다. 직접 원문을 읽지 못하면 검색 제공자가 요청한 정확한 공고 URL을 출처로 반환해야 합니다. 이 검사도 모든 기업 주장과 수치의 의미까지 보장하지 않으므로 지원 전 중요한 정보는 원문 링크에서 확인하세요.

제품 범위와 실제 API 구조는 [PROJECT.md](docs/PROJECT.md), 분석 규칙은 [ANALYSIS_PROMPT.md](docs/ANALYSIS_PROMPT.md)를 참고하세요.
