import type {AnalysisInput} from './model';
export const roles=['PM','서비스 기획','개발자','FDE','AX'];
export const sampleExperience='팀 프로젝트에서 사용자 12명을 인터뷰하고 인터뷰 기록을 정리했습니다. 요구사항 문서를 작성하고 Figma로 프로토타입을 만들어 개발자 2명과 협업했습니다. SQL은 수업에서 배우고 쿼리 실습을 했지만 실무 분석은 아직 해보지 않았습니다. Notion과 Python으로 반복 보고서를 자동화하는 스크립트를 개발했습니다. A/B 테스트는 해본 적이 없습니다.';
export const sampleJobs:Record<string,string>={
 'PM':`[가상 공고] 루프랩 · B2B SaaS Product Manager
신입 / 경력 모두 지원 가능

주요 업무
고객 인터뷰를 통해 문제를 정의하고 요구사항 문서를 작성합니다.
SQL로 사용 데이터를 분석하고 제품 개선 가설을 검증합니다.
디자이너, 개발자와 협업하며 제품 출시를 관리합니다.

자격 요건
사용자 리서치를 통해 문제를 발견한 프로젝트 경험
요구사항을 구조화하고 우선순위를 정할 수 있는 분

우대 사항
A/B 테스트를 설계하고 결과를 해석한 경험
B2B SaaS 고객의 업무를 이해하는 분`,
 '서비스 기획':`[가상 공고] 데이원 · 서비스 기획자
신입 채용

주요 업무
사용자 리서치와 고객 인터뷰로 서비스의 문제를 정의합니다.
요구사항 문서를 작성하고 Figma로 화면 흐름을 설계합니다.
디자인, 개발 담당자와 협업해 기능을 출시합니다.

자격 요건
개인 또는 팀 프로젝트에서 요구사항 문서를 작성한 경험
사용자 관점에서 문제를 정의하고 설명할 수 있는 분

우대 사항
SQL을 이용한 데이터 분석 경험
접근성을 고려한 서비스 설계 경험`,
 '개발자':`[가상 공고] 모멘트 · Frontend Developer
신입 채용

주요 업무
React와 TypeScript로 사용자 화면을 개발합니다.
REST API를 연동하고 에러를 처리합니다.
Git으로 협업하며 코드 리뷰에 참여합니다.

자격 요건
React로 직접 구현한 프로젝트
JavaScript와 TypeScript의 기본 이해

우대 사항
접근성과 웹 성능 개선 경험
자동화 테스트와 배포 경험`,
 'FDE':`[가상 공고] 프론티어 · Forward Deployed Engineer
경력 3년 이상 필수

주요 업무
고객 인터뷰로 현장의 문제와 요구사항을 정의합니다.
Python과 REST API로 고객 데이터와 제품을 통합합니다.
LLM과 RAG로 프로토타입을 구현하고 운영 환경에 배포합니다.

자격 요건
Python 개발과 시스템 운영 경험
고객과 협업하여 기술적 해결책을 전달한 경험

우대 사항
LLM 평가 및 보안 설계 경험
B2B SaaS 프로젝트 경험`,
 'AX':`[가상 공고] 워크플로우 · AX Specialist
신입 / 경력 모두 지원 가능

주요 업무
고객 인터뷰로 반복 업무를 분석하고 자동화 과제를 발굴합니다.
Python과 워크플로 도구로 프로세스를 자동화합니다.
LLM 프롬프트를 설계하고 평가 데이터로 품질을 확인합니다.

자격 요건
업무 자동화 프로젝트 경험
사용자 리서치와 요구사항 정의 경험

우대 사항
RAG를 활용한 문서 검색 구현 경험
개인정보 보호와 보안에 대한 이해`
};
export function sampleInput(role='PM'):AnalysisInput{return {job:sampleJobs[role],experience:sampleExperience,career:'entry',years:null,role};}
