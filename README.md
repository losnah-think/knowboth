# RoleBridge

공고 중심 IT 직무 탐색 MVP. AX·PM·FDE 같은 키워드 검색과 이력서 파일에서 시작해 요구 역량/경험 근거/미확인/보완/도메인 전이/이력서 초안을 연결합니다.

## 개발

Node.js 22.13 이상. `npm install`, `npm run dev`.

선택 환경변수:
- `OPENAI_API_KEY`: 서버 전용 비밀값. 없으면 로컬 기본 분석과 프롬프트 내보내기/결과 가져오기를 제공합니다.
- `OPENAI_MODEL`: 기본 `gpt-4.1-mini`.

API 키를 브라우저나 Git에 넣지 마세요. `.env.example`을 참고합니다. Sites 운영 비밀값은 Sites 환경변수로 설정합니다.

## 검증

`npx tsc --noEmit`

`node scripts/test-core.mjs`

빌드/배포는 프로젝트에 등록된 Sites 플로우를 사용합니다. `.openai/hosting.json`의 기존 project_id를 재사용하세요.

## 제품 문서

[기획·신청서 초안·실제 구현 범위](docs/PROJECT.md)

[분석 프롬프트](docs/ANALYSIS_PROMPT.md)

## 데이터 처리

이력서 파일은 브라우저 메모리에서 파싱하며 서버에 저장하지 않습니다. 기본 분석은 브라우저에서 수행합니다. 사용자가 AI 분석을 시작한 경우에만 추출된 텍스트가 OpenAI로 전달됩니다. API는 응답 저장을 요청하지 않지만 제공사의 별도 데이터 처리 정책이 적용됩니다.

외부 채용 사이트에서 공개적으로 읽을 수 있는 HTML만 가져옵니다. 검색 목록 수집과 본문 확보는 구분되며, 전체 수집이나 모든 사이트의 접근을 보장하지 않습니다.
