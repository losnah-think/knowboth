# KnowBoth — Vercel 배포·운영 인수인계

기준일: 2026-09-19

KnowBoth MVP는 표준 Next.js 16 App Router와 Node.js 런타임으로 실행된다. 이 문서는 새 구현 지시가 아니라 현재 코드를 Vercel에 연결하고 검증하기 위한 체크리스트다. 제품과 API의 기준은 [PROJECT.md](PROJECT.md), 분석 규칙은 [ANALYSIS_PROMPT.md](ANALYSIS_PROMPT.md)에 있다.

## 배포 전 확인

필수 조건:

- Node.js 22
- GitHub, GitLab 또는 Bitbucket 저장소
- Vercel 프로젝트를 만들 권한
- Responses API의 웹 검색과 Structured Outputs를 지원하는 모델에 접근 가능한 OpenAI API 키

로컬에서 아래 명령을 모두 통과시킨다.

```sh
npm install
npm test
npx tsc --noEmit
npm run lint
npm run build
```

로컬 실사용 검증에는 `.env.local`을 만든다.

```dotenv
OPENAI_API_KEY=your_api_key
OPENAI_MODEL=gpt-5.6-luna
```

`OPENAI_API_KEY`는 필수다. `OPENAI_MODEL`은 선택 사항이며 생략 시 코드 기본값은 `gpt-5.6-luna`다. 사용자가 선택한 모델도 `gpt-5.6-luna`이며, 해당 계정에서 웹 검색과 JSON Schema 출력을 함께 호출할 수 있는지 확인한다. 비밀값은 Git에 커밋하지 않고 `NEXT_PUBLIC_` 접두사를 붙이지 않는다.

## Dashboard에서 처음 배포하기

1. 배포할 커밋을 원격 Git 저장소에 푸시한다.
2. [Vercel Dashboard](https://vercel.com/dashboard)에서 사용할 Team을 선택한다.
3. **Add New → Project**를 누르고 해당 Git 저장소의 **Import**를 선택한다.
4. 프로젝트 설정에서 다음 값을 확인한다.
   - Framework Preset: **Next.js**
   - Root Directory: 저장소 루트
   - Node.js: `package.json`의 `22.x` 사용
   - Install Command: 재정의하지 않음
   - Build Command: 재정의하지 않음
   - Output Directory: 재정의하지 않음
5. 같은 화면의 **Environment Variables**에 `OPENAI_API_KEY`를 추가한다. Preview와 Production을 모두 선택한다.
6. 사용할 모델을 고정하려면 `OPENAI_MODEL`도 같은 환경에 추가한다. 생략하면 코드 기본값을 사용한다.
7. **Deploy**를 선택하고 빌드가 끝날 때까지 기다린다.
8. 배포 상세의 Build Logs에서 `next build`가 성공했는지 확인한다.

Vercel은 Next.js 프로젝트를 별도 어댑터 없이 배포한다. 이 저장소에는 `vercel.json`이나 사용자 지정 Output Directory가 필요하지 않다. 공식 절차는 [Next.js on Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs)과 [Git 저장소 배포](https://vercel.com/docs/git)를 따른다.

환경변수를 추가·수정해도 기존 배포에는 적용되지 않는다. **Deployments → 최신 배포의 `…` → Redeploy**로 새 배포를 만들어야 한다. 자세한 동작은 [Vercel 환경변수 문서](https://vercel.com/docs/environment-variables)에 있다.

## CLI로 배포하기

Dashboard 대신 CLI를 쓰려면 저장소 루트에서 실행한다.

```sh
npx vercel@latest link
npx vercel@latest env pull .env.local
npx vercel@latest
```

첫 명령에서 Team과 프로젝트를 선택하거나 새 프로젝트를 만든다. 환경변수는 Dashboard의 **Project → Settings → Environment Variables**에서 먼저 넣는 편이 안전하다. 미리보기 검증이 끝나면 프로덕션으로 배포한다.

```sh
npx vercel@latest --prod
```

공식 CLI 흐름은 [Deploying a project from the CLI](https://vercel.com/docs/projects/deploy-from-cli)를 참고한다. `vercel link`가 만드는 `.vercel/`은 `.gitignore` 대상이다.

## 배포 후 점검

먼저 설정 상태를 확인한다.

```sh
curl -sS https://YOUR_DOMAIN/api/analyze
```

정상 설정이면 `available`이 `true`다. `modelConfigured`는 `OPENAI_MODEL`을 명시했는지만 나타내며, `false`여도 코드 기본 모델을 사용한다. 이 응답은 키와 모델 값을 공개하지 않는다.

PDF용 정적 글꼴도 배포 출처에서 확인한다.

```sh
curl -sSI https://YOUR_DOMAIN/fonts/NanumGothic-Regular.ttf
curl -sSI https://YOUR_DOMAIN/fonts/NanumGothic-Bold.ttf
```

두 요청 모두 `200`과 `Content-Type: font/ttf`를 반환해야 한다. 파일은 Next.js의 `public/fonts`에서 그대로 제공되므로 별도 Vercel 설정이나 환경변수가 필요 없다. 글꼴 출처와 SIL Open Font License 1.1 전문은 [`public/fonts/README.md`](../public/fonts/README.md)와 [`public/fonts/OFL.txt`](../public/fonts/OFL.txt)에 있다.

브라우저에서 다음 순서로 점검한다.

1. 첫 화면과 “가상 예시 보기”가 정상 표시되는지 확인한다.
2. `https://www.wanted.co.kr/wd/숫자` 형식의 공개 공고 URL을 입력해 공고 확인을 실행한다. 로딩 화면에 공고 확인부터 보고서 준비까지 순서가 보이는지 확인한다.
3. 로딩 중 `홈`을 눌러 요청이 취소되고 URL은 유지된 첫 화면으로 돌아오는지 확인한다.
4. 조사된 공고 카드의 회사명, 포지션명, 주요 업무, 자격요건, 우대사항을 실제 원티드 공고와 대조한다. 회사명이나 공고 본문을 추가로 입력하는 칸이 없어야 한다.
5. 경험을 넣지 않고 기업·역할 분석을 실행한 뒤 실제 출처 링크가 열리고 회사·법인·회계기간·통화·연결/별도 범위가 원문과 맞는지 확인한다.
6. 같은 공고에 경험을 추가해 다시 분석하고, 이력서에 없는 역량이 `보완 필요`로 단정되지 않는지 확인한다.
7. PDF와 DOCX 한 건씩 올려 추출 내용이 수정 가능하고 원본 파일이 네트워크 요청으로 전송되지 않는지 브라우저 DevTools에서 확인한다.
8. `PDF 다운로드`로 받은 문서를 열어 한글, 페이지 번호, 출처 링크가 정상인지 확인한다. Markdown 다운로드와 인쇄 버튼은 없어야 한다.
9. 실제 보고서가 첫 화면의 최근 분석에 나타나고 새로고침 후에도 API 재호출 없이 열리는지 확인한다. 개별 삭제가 동작하고 다른 브라우저에는 기록이 나타나지 않아야 한다.
10. 375px 모바일 폭, 키보드 탭 이동, `prefers-reduced-motion`에서 애니메이션 정지를 확인한다.
11. 조사된 공고 내용에 없는 인용, 존재하지 않는 출처, 법인이 다른 매출이 보고서에 노출되지 않는지 실제 사례 3건을 사람이 대조한다.

만료·삭제·비공개 공고도 한 건 확인한다. 공개 검색에서 해당 URL의 주요 업무와 자격요건을 충분히 확인하지 못하면 내용을 추측하지 않고 공고 조사 실패를 보여야 한다. 함수 오류는 Vercel 프로젝트의 **Logs**에서 확인하며, 로그나 오류 추적에 조사된 공고 텍스트, 이력서 텍스트, API 키를 새로 기록하지 않는다.

## 실행 특성

| 항목 | 현재 값 |
|---|---|
| 프레임워크 | Next.js 16.2 App Router |
| 함수 런타임 | Node.js |
| 공고 조사 함수 | `maxDuration = 60`, 앱 자체 제한 50초 |
| 기업·보고서 분석 함수 | `maxDuration = 120`, 앱 자체 제한 110초 |
| 응답 방식 | 공고 조사는 `{ status: "ready", job, jobProof }`, 최종 분석은 `{ report }` JSON 반환 |
| AI 호출 | 일반적인 새 분석은 공고 조사 1회 + 기업 조사 1회 + 보고서 생성 1회. 각 단계는 최대 3회 시도 |
| 자동 재시도 | 일시적 API 오류·요청 제한·결과 검증 실패는 단계별 총 3회. 설정·입력 오류, AI 거절, 취소·시간 초과는 즉시 종료 |
| 공고 조사 입력 | 엄격한 `{ url }` JSON, 요청 2KB 이하 |
| 조사된 공고·경험 | 각각 최대 20,000자 |
| 최종 분석 입력 | UTF-8 160KB 이하, HTTP 요청 170KB에서 추가 차단 |
| 이력서 파일 | 8MB 이하, PDF 40쪽 이하 |
| 저장소 | 서버 DB 없음. 실제 완료 보고서만 브라우저 `localStorage`에 최대 10개·직렬화 약 200만 자 범위로 보관 |
| 배포 접근 제어 | 별도 접근 코드 없음. 동일 출처 검사와 `jobProof` 변조 검증 유지 |

공고 조사 호출 한 번은 OpenAI Responses API에서 최대 3회의 웹 검색 도구 호출을 허용한다. 공고 조사, 기업 조사, 보고서 생성은 각각 실패 시 총 3회까지 자동 재시도하므로 새 분석은 정상적으로 3회, 최악의 경우 최대 9회의 AI 호출을 만들 수 있다. 법인 후보를 선택해 다시 분석하면 기업 조사와 보고서 생성 호출이 추가된다. 모든 재시도는 기존 요청 시간 제한을 공유하며, 사용자 취소나 시간 초과가 발생하면 즉시 종료한다. Vercel 요금제의 함수 실행 한도가 각 라우트의 선언값보다 짧으면 플랫폼이 먼저 요청을 종료한다. 배포할 Team의 Functions 설정과 사용량을 확인한다. 라우트별 `maxDuration` 방식은 [Vercel Functions duration 문서](https://vercel.com/docs/functions/configuring-functions/duration)를 참고한다.

## 개인정보와 비용

공고 확인 시 원티드 URL은 `/api/job`, 원티드, OpenAI 웹 검색에 전달된다. PDF.js와 Mammoth는 브라우저에서 원본 파일을 읽으며 원본 파일 자체는 업로드하지 않는다. 최종 분석 시에는 조사된 공고와 사용자가 확인한 경험 텍스트가 `/api/analyze`와 OpenAI로 전달된다. OpenAI 요청에는 `store: false`를 사용하며 앱은 입력과 보고서를 서버 DB에 저장하지 않는다. 모델 제공자의 별도 처리·보존 정책은 따로 적용된다.

완료한 실제 보고서는 최근 분석을 위해 브라우저 `localStorage`에 저장한다. `reportSchema` 검증을 통과한 기록만 유지하며 최신순 최대 10개, 직렬화 문자열 약 200만 자로 제한한다. 다른 기기·브라우저와 동기화되지 않는다. 이력서 원본과 `jobProof`는 저장하지 않지만 보고서에는 분석에 사용된 경험 인용이 포함될 수 있다. 사용자는 각 기록의 삭제 버튼으로 지울 수 있고, 브라우저 사이트 데이터를 지우면 전체 기록이 사라진다.

배포 환경의 `/api/job`과 `/api/analyze`는 별도 접근 코드 없이 공개된다. `/api/job`이 반환한 `jobProof`는 브라우저가 `x-knowboth-job-proof`로 다시 보내며, 서버는 이 서명으로 공고 결과의 변조와 수동 본문 우회를 막는다. `jobProof`는 브라우저 상태에만 두고 영구 저장하지 않는다. 사용자별 인증, CAPTCHA, 서버 요청 제한, 계정별 비용 할당량은 없으므로 공개 링크를 배포하기 전 최소한 아래 운영 설정을 적용한다.

- OpenAI 프로젝트의 사용량·예산 한도와 알림
- Vercel 사용량 알림과 방화벽 규칙
- 필요하면 Vercel Deployment Protection으로 공개 범위 제한
- Preview와 Production의 키 분리 또는 최소 권한 키 사용

Origin 검사는 비용 통제가 아니며, 공개 API를 단독으로 보호하지 못한다.

## 알려진 제한과 다음 우선순위

- 서버는 원티드 페이지의 표시 텍스트를 직접 확보해 AI 추출값을 대조한다. 원문 요청이 차단되면 검색 제공자의 정확한 공고 URL 인용이 필요하며, 둘 다 확보하지 못하면 실패한다. 수동 공고 본문 입력 경로는 없다.
- 공고 조사와 최종 분석은 각각 완료 후 JSON을 반환한다. 화면은 작업 순서를 표시하지만 서버의 중간 진행 이벤트를 받지는 않는다. 부분 결과 보존과 연결 복구도 없다.
- 법인 후보 선택은 한 번의 추가 조사·분석 요청을 발생시킨다. 선택값은 식별 힌트이며 실제 출처 대조를 다시 거친다.
- OpenDART API를 직접 호출하지 않으며 웹 검색 결과에 없는 재무 자료를 찾지 못할 수 있다.
- 원티드 표시 텍스트를 확보한 경우 회사명·포지션·업무·자격요건을 정확히 대조하고, 그렇지 않으면 검색 제공자의 정확한 URL 인용을 요구한다. 보고서 참조와 짧은 인용도 구조적으로 검사하지만, 해당 페이지가 모든 요약·기업 주장·매출을 의미상 뒷받침하는지까지 자동으로 증명하지 못하므로 중요한 지원 조건, 법인, 매출은 실제 지원 전 링크를 열어 확인해야 한다.
- 계정, 서버 저장, 공유 링크, 기기 간 동기화는 없다. 입력 중인 이력서는 새로고침하면 사라지고 완료 보고서만 같은 브라우저의 최근 분석에 남는다.

다음 개발 우선순위는 사용자·IP별 요청 제한, 검사를 통과한 부분 결과의 스트리밍, 실제 사례 평가 자동화 순이다.
