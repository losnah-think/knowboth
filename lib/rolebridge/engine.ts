import {type AnalysisInput,type Report,type Requirement,validateEvidence} from './model';
type Skill={name:string;re:RegExp;task:string;artifact:string};
const skills:Skill[]=[
 ['사용자 리서치',/리서치|인터뷰|사용자 조사|고객 조사|user research/i,'관심 있는 제품의 사용자 3명에게 같은 질문으로 인터뷰하고 불편을 분류해 보세요.','인터뷰 질문지와 문제 우선순위 문서'],
 ['요구사항 정의',/요구사항|요구 사항|PRD|정책 설계|문제.{0,8}정의/i,'인터뷰에서 확인한 문제 하나를 골라 범위, 사용자 흐름, 완료 조건을 작성해 보세요.','요구사항 문서 1개'],
 ['우선순위 판단',/우선순위|로드맵|roadmap/i,'서로 충돌하는 요구 3개를 영향·노력·근거로 비교하고 선택 이유를 써 보세요.','우선순위 표와 결정 근거'],
 ['SQL',/\bSQL\b|쿼리/i,'공개 데이터로 질문 3개를 만들고 JOIN과 GROUP BY를 이용해 답해 보세요.','쿼리 파일과 결과 해석'],
 ['데이터 분석',/데이터.{0,8}분석|지표|GA4|분석.{0,8}데이터/i,'사용자 행동 데이터에서 이탈 구간을 찾아 개선 가설과 검증 지표를 작성해 보세요.','분석 노트와 지표 정의'],
 ['실험 설계',/A\s*\/\s*B|가설.{0,6}검증|실험 설계/i,'제품의 가설 하나에 대상, 지표, 실험 기간과 중단 조건을 정의해 보세요.','실험 설계서 (실제 실행 전에는 실행했다고 쓰지 않기)'],
 ['협업',/협업|커뮤니케이션|이해관계자|코드 리뷰/i,'프로젝트에서 의견이 달랐던 상황, 합의 과정, 본인의 기여를 정리해 보세요.','결정 기록과 본인의 역할 설명'],
 ['Figma·프로토타이핑',/figma|프로토타입|프로토타이핑|화면 흐름/i,'핵심 사용자 흐름 하나를 클릭 가능한 프로토타입으로 만들고 피드백을 받아 보세요.','프로토타입과 수정 기록'],
 ['React',/\bReact\b|리액트/i,'입력·결과·오류 상태가 있는 작은 React 기능을 구현해 보세요.','실행 가능한 데모와 설계 설명'],
 ['TypeScript',/\bTypeScript\b|타입스크립트/i,'API 응답 타입과 런타임 검증을 작은 앱에 적용해 보세요.','타입 정의와 잘못된 입력 처리 사례'],
 ['JavaScript',/\bJavaScript\b|자바스크립트/i,'비동기 데이터 요청과 실패 복구를 직접 구현하고 설명해 보세요.','코드와 비동기 처리 설명'],
 ['Python',/\bPython\b|파이썬/i,'입력 검증과 오류 처리를 갖춘 데이터 처리 스크립트를 작성해 보세요.','재현 가능한 스크립트와 사용법'],
 ['API 연동',/\bAPI\b|시스템.{0,6}통합/i,'공개 API를 연결하고 시간 초과·빈 데이터·오류 응답을 처리해 보세요.','API 연동 데모와 실패 처리 기록'],
 ['Git',/\bGit\b|버전 관리/i,'작은 변경을 브랜치와 PR로 나누고 변경 이유를 기록해 보세요.','커밋과 리뷰 이력'],
 ['테스트',/자동화 테스트|단위 테스트|통합 테스트|\btesting\b/i,'핵심 사용자 흐름의 정상·실패·경계 사례를 검증해 보세요.','실행 가능한 테스트와 검증 결과'],
 ['배포·운영',/배포|운영.{0,5}경험|시스템 운영|장애|모니터링/i,'작은 서비스를 배포하고 실패 상황의 감지와 복구 절차를 적어 보세요.','배포 링크와 운영 기록'],
 ['접근성',/접근성|WCAG|a11y/i,'키보드만으로 핵심 흐름을 수행하고 폼 레이블과 오류 안내를 점검해 보세요.','점검 기록과 수정 전후 사례'],
 ['성능 개선',/성능|최적화|latency/i,'느린 구간을 측정하고 원인을 하나 수정한 뒤 같은 조건에서 다시 측정해 보세요.','측정 조건과 결과 기록'],
 ['LLM 활용',/\bLLM\b|언어 모델|생성형 AI/i,'명확한 입력·출력 규칙을 가진 작은 LLM 기능을 구현해 보세요.','입출력 예시와 실패 사례'],
 ['RAG',/\bRAG\b|검색 증강/i,'공개 문서로 검색과 답변을 연결하고 출처가 틀리는 사례를 확인해 보세요.','출처를 제시하는 검색 데모'],
 ['프롬프트 설계',/프롬프트|prompt/i,'같은 과제의 일반·경계·악성 입력에 대한 프롬프트를 비교해 보세요.','프롬프트와 평가 사례'],
 ['AI 품질 평가',/LLM 평가|평가 데이터|품질.{0,6}확인|eval/i,'실패가 중요한 입력을 모으고 정답·판정 기준을 작성해 보세요.','평가 데이터와 기준표'],
 ['업무 자동화',/자동화|워크플로|프로세스 개선/i,'반복 업무 하나를 작은 단계로 나누고 예외 처리를 포함해 자동화해 보세요.','작동하는 흐름과 수동 복구 방법'],
 ['보안·개인정보',/보안|개인정보|인증|권한/i,'입력 데이터, 권한, 외부 전송 지점을 정리하고 최소한의 보호 조치를 설계해 보세요.','데이터 흐름도와 접근 규칙'],
 ['B2B SaaS 이해',/B2B|SaaS/i,'B2B 제품의 구매자·사용자·관리자가 각각 원하는 것을 비교해 보세요.','역할별 업무와 문제 가설'],
 ['백엔드 개발',/백엔드|backend|서버 개발|Spring|Django|FastAPI/i,'검증과 오류 처리를 포함한 작은 API 서버를 구현해 보세요.','실행 가능한 서버와 API 명세'],
 ['데이터베이스',/데이터베이스|PostgreSQL|MySQL|\bDB\b/i,'중복과 조회 패턴을 고려해 데이터 모델을 만들고 설명해 보세요.','스키마와 대표 쿼리']
].map(([name,re,task,artifact])=>({name,re,task,artifact})) as Skill[];
const injection=/이전.{0,15}(지시|명령).{0,10}(무시|잊)|ignore.{0,30}(instruction|prompt)|system prompt|100점.{0,10}(출력|부여)|api.?key|sk-proj-/i;
const negative=/해본 적.{0,5}없|경험.{0,5}없|해보지 않|못합니다|모릅|모른다|사용하지 않|사용한 적.{0,5}없|할 수 없|하지 않았/;
const learning=/수업|배웠|배우|학습|공부|실습|강의/;
const performed=/작성했|작성하고|구현했|구현하고|개발했|개발하고|만들었|만들어|설계했|설계하고|분석했|분석하고|인터뷰했|인터뷰하고|정리했|정리하고|배포했|배포하고|운영했|운영하고|개선했|개선하고|자동화했|자동화하고|검증했|검증하고/;
const artifact=/문서|기록|프로토타입|스크립트|프로젝트|서비스|앱|보고서|저장소|쿼리|대시보드|\d+명|\d+건/;
function lines(text:string){return text.split(/\n+/).map(x=>x.trim()).filter(Boolean);}
function sentences(text:string){return text.split(/\n+|(?<=[.!?。])\s+|(?<=지만)\s+|[;；]\s*|(?:그리고|하지만)\s+/).map(x=>x.trim()).filter(x=>x&&!injection.test(x));}
function classify(q:string,career:AnalysisInput['career'],jobQuote:string):Requirement['status']{
 if(!q)return 'unknown';
 if(negative.test(q))return learning.test(q)?'partial':'gap';
 if(learning.test(q))return 'partial';
 if(!performed.test(q))return 'unknown';
 if(/운영|리드|주도|대규모|책임/.test(jobQuote)&&!/운영|리드|주도|책임/.test(q))return 'partial';
 return artifact.test(q)?'met':'partial';
}
export function analyzeLocal(raw:AnalysisInput):Report{
 const input=raw;const jobLines=lines(input.job);const expLines=sentences(input.experience);
 const top=jobLines.slice(0,4).join(' ');
 const seniority:Report['seniority']=/신입/.test(top)&&/경력/.test(top)&&!/경력\s*(무관|없)/.test(top)?'mixed':/신입|경력\s*무관/.test(top)?'entry':/경력|\d+\s*년/.test(top)?'experienced':'unknown';
 let section:Requirement['importance']='core_work';let contextOnly=false;const rows:{quote:string;importance:Requirement['importance']}[]=[];
 for(const line of jobLines){if(line==='회사·직무 소개'){contextOnly=true;continue;}if(contextOnly||injection.test(line))continue;if(/^(우대 사항|우대사항|우대 조건|우대조건|Preferred)\s*[:：]?$/i.test(line)){section='preferred';continue;}if(/^(자격 요건|자격요건|필수 사항|필수사항|필수 요건|자격 조건|Requirements)\s*[:：]?$/i.test(line)){section='required';continue;}if(/^(주요 업무|주요업무|담당 업무|담당업무|Responsibilities)\s*[:：]?$/i.test(line)){section='core_work';continue;}rows.push({quote:line,importance:/우대/.test(line)?'preferred':section});}
 const requirements:Requirement[]=[];
 for(const s of skills){const matched=rows.filter(x=>s.re.test(x.quote)&&!/^\[/.test(x.quote));if(!matched.length)continue;matched.sort((a,b)=>({required:3,core_work:2,preferred:1}[b.importance]-{required:3,core_work:2,preferred:1}[a.importance]));const row=matched[0];
 const candidates=expLines.filter(x=>s.re.test(x));const q=candidates.find(x=>negative.test(x))||candidates.find(x=>performed.test(x))||candidates[0]||'';
 const contradictory=candidates.some(x=>negative.test(x))&&candidates.some(x=>performed.test(x)&&!negative.test(x));
 const otherSkillNegation=negative.test(q)&&skills.some(other=>other.name!==s.name&&other.re.test(q));
 const status=contradictory||otherSkillNegation?'unknown':classify(q,input.career,row.quote);
 requirements.push({id:`r${requirements.length+1}`,skill:s.name,importance:row.importance,jobQuote:row.quote,status,evidenceQuote:q,reason:status==='met'?'직접 수행한 행동과 산출물이 입력에 있습니다. 실제 요구 수준은 원문과 함께 확인해 주세요.':status==='partial'?'관련 학습 또는 일부 수행 근거가 있습니다. 요구 범위 전체를 충족하는지 추가 확인이 필요합니다.':status==='gap'?'입력에서 아직 수행하지 못한 경험임을 명시했습니다.':'이 경험을 했는지 판단할 구체적 근거가 아직 없습니다.',question:`${s.name}와 관련해 직접 한 행동, 본인의 역할, 만든 결과물을 알려주세요.${input.career==='entry'?' 수업·개인 프로젝트도 괜찮아요.':' 공고가 요구하는 운영·책임 범위도 설명해 주세요.'}`,task:s.task,deliverable:s.artifact});
 }
 const conditions:Report['conditions']=[];
 for(const row of rows){const m=row.quote.match(/(\d+)\s*년\s*(이상|이상 필수)/);if(m&&/경력|실무 경험|업무 경험/.test(row.quote)&&!/우리|회사|설립|업력|기업 고객|서비스를 제공/.test(row.quote)&&row.importance!=='preferred'&&seniority!=='mixed'){
 const min=Number(m[1]);const specific=/개발|기획|PM|디자인|운영|SQL|Python|React|FDE|AX|관련|해당/i.test(row.quote);const known=input.career==='entry'||(!specific&&input.years!==null);const yrs=input.career==='entry'?0:input.years||0;
 conditions.push({label:`업무 경력 ${min}년 이상`,jobQuote:row.quote,status:known?(yrs>=min?'pass':'fail'):'unknown',reason:known?`입력한 업무 경력 ${yrs}년과 비교했습니다. 프로젝트·수업 기간은 업무 경력에 포함하지 않습니다.`:specific?'특정 직무 경력은 전체 업무 연차만으로 확인할 수 없어요. 해당 업무의 기간을 확인해 주세요.':'업무 경력 기간을 입력하면 확인할 수 있어요.'});}}
 const domains:Report['domains']=[];const connections=[{domain:'B2B SaaS',re:/리서치|요구사항|협업/,reason:'사용자의 불편을 발견하고 요구사항으로 정리하는 경험은 기업 고객의 복잡한 업무를 제품으로 옮기는 데 쓰입니다.',caveat:'구매자와 실제 사용자가 다를 수 있어요. 의사결정과 권한 구조는 별도 학습이 필요합니다.',experiment:'B2B 제품 하나를 골라 사용자·관리자·구매자의 목표를 비교해 보세요.'},{domain:'에듀테크',re:/실험|데이터|Figma|리서치/,reason:'사용자 행동을 관찰하고 흐름을 설계하는 경험을 학습 과정의 이탈 문제에 적용할 수 있습니다.',caveat:'학습 성과와 서비스 이용량은 다른 지표예요. 실제 학습 효과는 추가로 확인해야 합니다.',experiment:'학습 서비스의 첫 수업 흐름을 분석하고 학습자 2명에게 이탈 이유를 물어보세요.'},{domain:'업무 생산성 · AX',re:/Python|자동화|API|LLM/,reason:'반복 과정을 코드로 바꾼 경험을 현업의 수작업과 정보 전달 문제에 연결할 수 있습니다.',caveat:'예외 상황, 데이터 권한과 실제 사용자의 도입 의사를 확인해야 해요.',experiment:'주변 사람의 반복 업무 하나를 관찰하고 입력·출력·예외를 적어보세요.'}];
 for(const c of connections){const r=requirements.find(x=>c.re.test(x.skill)&&['met','partial'].includes(x.status));if(r)domains.push({domain:c.domain,evidenceQuote:r.evidenceQuote,reason:c.reason,caveat:c.caveat,experiment:c.experiment});}
 const evidence=[...new Set(requirements.filter(x=>x.status==='met').map(x=>x.evidenceQuote))].slice(0,3);
 const resume=evidence.map(q=>({before:q,after:q.replace(/했습니다/g,'함').replace(/만들었습니다/g,'제작함'),question:'이 경험에서 본인이 결정한 부분과 결과를 확인할 수 있는 자료는 무엇인가요? 확인한 사실만 추가해 주세요.'}));
 const report:Report={title:jobLines[0]?.slice(0,160)||'직접 입력한 공고',summary:input.experience.trim()?'공고가 요구하는 일에 내 경험을 연결했어요. 확인된 근거와 아직 답이 필요한 부분을 함께 살펴보세요.':'먼저 공고의 요구 사항을 정리했어요. 아래 확인 질문에 답하면 내 경험과 연결할 수 있어요.',seniority,requirements,conditions,domains,resume,limitations:['기본 분석은 사전·문장 규칙을 사용합니다. 문맥·부정 표현·복합 요구를 완전히 이해하지 못할 수 있어요.','등록된 IT 역량만 추출하므로 공고의 모든 요구 사항을 포함하지 않을 수 있습니다. 비율의 분모는 추출된 항목입니다.','근거는 사용자 자기 보고이며 외부 검증이나 합격 확률을 의미하지 않습니다.']};
 if(!requirements.length)return report;
 return validateEvidence(report,input);
}
