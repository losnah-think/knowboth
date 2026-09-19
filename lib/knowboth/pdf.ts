import type {Claim, Report} from './schema';

type FontFiles={regular:Uint8Array;bold:Uint8Array};
type RGB=[number,number,number];

const COLORS={
 ink:[28,28,30] as RGB,
 secondary:[99,99,102] as RGB,
 tertiary:[142,142,147] as RGB,
 line:[222,222,226] as RGB,
 surface:[246,246,248] as RGB,
 blue:[0,113,227] as RGB,
 blueSoft:[232,243,255] as RGB,
 green:[24,126,76] as RGB,
 greenSoft:[232,247,238] as RGB,
 amber:[156,92,0] as RGB,
 amberSoft:[255,246,224] as RGB,
 red:[184,45,45] as RGB,
 redSoft:[255,237,237] as RGB,
 white:[255,255,255] as RGB,
};

const PAGE={width:210,height:297,left:18,right:18,top:18,bottom:20};
const CONTENT_WIDTH=PAGE.width-PAGE.left-PAGE.right;

function bytesToBase64(bytes:Uint8Array){
 let binary='';
 const size=0x8000;
 for(let offset=0;offset<bytes.length;offset+=size){
  binary+=String.fromCharCode(...bytes.subarray(offset,offset+size));
 }
 return btoa(binary);
}

async function fetchFont(path:string){
 const response=await fetch(path,{cache:'force-cache'});
 if(!response.ok)throw new Error('PDF용 한글 글꼴을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
 return new Uint8Array(await response.arrayBuffer());
}

function safeHttpUrl(value:string|null|undefined){
 if(!value)return null;
 try{
  const url=new URL(value);
  return (url.protocol==='http:'||url.protocol==='https:')&&!url.username&&!url.password?url.href:null;
 }catch{return null;}
}

function dateLabel(value:string){
 const date=new Date(value);
 return Number.isNaN(date.getTime())?value:new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'long',day:'numeric'}).format(date);
}

function moneyLabel(value:string,currency:string){
 const amount=Number(value);
 if(!Number.isFinite(amount))return `${value} ${currency}`;
 if(currency==='KRW'&&Math.abs(amount)>=100_000_000){
  return `${new Intl.NumberFormat('ko-KR',{maximumFractionDigits:2}).format(amount/100_000_000)}억 원`;
 }
 return `${new Intl.NumberFormat('ko-KR',{maximumFractionDigits:2}).format(amount)} ${currency==='KRW'?'원':currency}`;
}

function filenamePart(value:string){
 const cleaned=value.normalize('NFC').replace(/[^\p{L}\p{N}._-]+/gu,'-').replace(/^-+|-+$/g,'').slice(0,48);
 return cleaned||'report';
}

function evidenceLabel(kind:Claim['kind']){
 return kind==='sourced'?'출처 확인':kind==='inference'?'근거 해석':'확인 필요';
}

function evidenceColors(kind:Claim['kind']):{fill:RGB;text:RGB}{
 if(kind==='sourced')return {fill:COLORS.greenSoft,text:COLORS.green};
 if(kind==='inference')return {fill:COLORS.blueSoft,text:COLORS.blue};
 return {fill:COLORS.amberSoft,text:COLORS.amber};
}

/** Build the PDF bytes. Exposed separately so the same renderer can be checked in Node. */
export async function buildReportPdf(report:Report,fonts:FontFiles):Promise<Uint8Array>{
 const {jsPDF}=await import('jspdf');
 const isSample=/^sample(?:-|$)/i.test(report.analysisId);
 const sourceNumbers=new Map(report.sources.map((source,index)=>[source.id,index+1]));
 const sourceRefs=(ids:string[])=>ids.map(id=>sourceNumbers.get(id)).filter((value):value is number=>value!==undefined).map(value=>`[${value}]`).join(' ');
 const doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true,putOnlyUsedFonts:true});
 doc.addFileToVFS('NanumGothic-Regular.ttf',bytesToBase64(fonts.regular));
 doc.addFont('NanumGothic-Regular.ttf','NanumGothic','normal');
 doc.addFileToVFS('NanumGothic-Bold.ttf',bytesToBase64(fonts.bold));
 doc.addFont('NanumGothic-Bold.ttf','NanumGothic','bold');
 doc.setFont('NanumGothic','normal');
 doc.setProperties({
  title:`${isSample?'가상 예시 · ':''}${report.job.companyDisplayName} · ${report.job.positionTitle} 기업 분석`,
  subject:'KnowBoth 기업·포지션·지원자 분석 보고서',
  author:'KnowBoth',
  creator:'KnowBoth',
 });

 let y=PAGE.top;
 const maxY=PAGE.height-PAGE.bottom;
 const setText=(color:RGB)=>doc.setTextColor(...color);
 const setFill=(color:RGB)=>doc.setFillColor(...color);
 const setDraw=(color:RGB)=>doc.setDrawColor(...color);
 const setFont=(size:number,weight:'normal'|'bold'='normal')=>{doc.setFont('NanumGothic',weight);doc.setFontSize(size);};
 const lines=(text:string,width:number)=>doc.splitTextToSize(text.replace(/\s+/g,' ').trim(),width) as string[];
 const paragraphLines=(text:string,width:number)=>text.split(/\r?\n/).flatMap(part=>lines(part,width));
 const addPage=()=>{doc.addPage();y=PAGE.top;};
 const ensure=(height:number)=>{if(y+height>maxY)addPage();};
 const rule=()=>{setDraw(COLORS.line);doc.setLineWidth(0.25);doc.line(PAGE.left,y,PAGE.width-PAGE.right,y);y+=5;};

 function paragraph(text:string,options:{size?:number;color?:RGB;weight?:'normal'|'bold';lineHeight?:number;indent?:number;after?:number}={}){
  const size=options.size??9.5;
  const lineHeight=options.lineHeight??5;
  const indent=options.indent??0;
  setFont(size,options.weight??'normal');setText(options.color??COLORS.ink);
  const wrapped=lines(text,CONTENT_WIDTH-indent);
  for(const line of wrapped){ensure(lineHeight+1);doc.text(line,PAGE.left+indent,y);y+=lineHeight;}
  y+=options.after??2;
 }

 function linkedText(text:string,url:string|null,options:{size?:number;color?:RGB;lineHeight?:number;indent?:number;after?:number}={}){
  const size=options.size??8;
  const lineHeight=options.lineHeight??4.3;
  const indent=options.indent??0;
  setFont(size);setText(options.color??COLORS.blue);
  const wrapped=lines(text,CONTENT_WIDTH-indent);
  for(const line of wrapped){
   ensure(lineHeight+1);
   if(url)doc.textWithLink(line,PAGE.left+indent,y,{url});else doc.text(line,PAGE.left+indent,y);
   y+=lineHeight;
  }
  y+=options.after??1;
 }

 function section(title:string,subtitle:string,forcePage=false){
  if(forcePage&&y>PAGE.top+4)addPage();else ensure(25);
  setFont(7.5,'bold');setText(COLORS.blue);doc.text('KNOWBOTH BRIEF',PAGE.left,y);y+=7;
  setFont(20,'bold');setText(COLORS.ink);doc.text(title,PAGE.left,y);y+=6;
  paragraph(subtitle,{size:8.5,color:COLORS.secondary,lineHeight:4.5,after:5});
  rule();
 }

 function subheading(title:string){
  ensure(12);y+=2;setFont(11,'bold');setText(COLORS.ink);doc.text(title,PAGE.left,y);y+=6;
 }

 function pill(text:string,x:number,top:number,fill:RGB,color:RGB){
  setFont(6.7,'bold');
  const width=Math.min(doc.getTextWidth(text)+5,45);
  setFill(fill);doc.roundedRect(x,top-3.5,width,5.4,2.7,2.7,'F');
  setText(color);doc.text(text,x+2.5,top);
  return width;
 }

 function claimCard(claim:Claim){
  setFont(9);const wrapped=lines(claim.text,CONTENT_WIDTH-10);
  setFont(7.8);const rationale=claim.rationale?lines(claim.rationale,CONTENT_WIDTH-10):[];
  const references=sourceRefs(claim.sourceIds);
  const height=8+wrapped.length*4.7+(rationale.length?rationale.length*4+3:0)+(references?6:0)+(claim.conflict?7:0)+4;
  if(height>maxY-PAGE.top-6){
   ensure(24);
   const palette=evidenceColors(claim.kind);pill(evidenceLabel(claim.kind),PAGE.left,y+4,palette.fill,palette.text);y+=12;
   setFont(9);setText(COLORS.ink);for(const line of wrapped){ensure(5);doc.text(line,PAGE.left,y);y+=4.7;}
   if(rationale.length){y+=1;setFont(7.8);setText(COLORS.secondary);for(const line of rationale){ensure(4.5);doc.text(line,PAGE.left,y);y+=4;}}
   if(references){ensure(6);y+=1;setFont(7.2,'bold');setText(COLORS.blue);doc.text(`근거 ${references}`,PAGE.left,y);y+=5;}
   if(claim.conflict){ensure(8);y+=1;setFont(7.5,'bold');setText(COLORS.amber);doc.text('자료 간 설명이 달라 추가 확인이 필요합니다.',PAGE.left,y);y+=6;}
   y+=2;rule();return;
  }
  ensure(height);
  const top=y;
  setFill(COLORS.surface);doc.roundedRect(PAGE.left,top,CONTENT_WIDTH,height,3,3,'F');
  const palette=evidenceColors(claim.kind);pill(evidenceLabel(claim.kind),PAGE.left+5,top+7,palette.fill,palette.text);
  let innerY=top+14;setFont(9);setText(COLORS.ink);
  for(const line of wrapped){doc.text(line,PAGE.left+5,innerY);innerY+=4.7;}
  if(rationale.length){innerY+=1;setFont(7.8);setText(COLORS.secondary);for(const line of rationale){doc.text(line,PAGE.left+5,innerY);innerY+=4;}}
  if(references){innerY+=1;setFont(7.2,'bold');setText(COLORS.blue);doc.text(`근거 ${references}`,PAGE.left+5,innerY);innerY+=5;}
  if(claim.conflict){innerY+=1;setFont(7.5,'bold');setText(COLORS.amber);doc.text('자료 간 설명이 달라 추가 확인이 필요합니다.',PAGE.left+5,innerY);}
  y=top+height+3;
 }

 function simpleCard(title:string,body:string,label?:{text:string;fill:RGB;color:RGB}){
  setFont(10,'bold');const titleLines=lines(title,CONTENT_WIDTH-10);
  setFont(8.5);const bodyLines=paragraphLines(body,CONTENT_WIDTH-10);
  const height=7+titleLines.length*5+bodyLines.length*4.4+(label?7:0)+4;
  if(height>maxY-PAGE.top-6){
   ensure(25);
   if(label){pill(label.text,PAGE.left,y+4,label.fill,label.color);y+=12;}
   setFont(10,'bold');setText(COLORS.ink);for(const line of titleLines){ensure(5.5);doc.text(line,PAGE.left,y);y+=5;}
   y+=2;setFont(8.5);setText(COLORS.secondary);
   for(const line of bodyLines){ensure(4.8);if(line)doc.text(line,PAGE.left,y);y+=4.4;}
   y+=2;rule();return;
  }
  ensure(height);
  const top=y;setFill(COLORS.surface);doc.roundedRect(PAGE.left,top,CONTENT_WIDTH,height,3,3,'F');
  let innerY=top+6;
  if(label){pill(label.text,PAGE.left+5,innerY,label.fill,label.color);innerY+=8;}
  setFont(10,'bold');setText(COLORS.ink);for(const line of titleLines){doc.text(line,PAGE.left+5,innerY);innerY+=5;}
  innerY+=1;setFont(8.5);setText(COLORS.secondary);for(const line of bodyLines){if(line)doc.text(line,PAGE.left+5,innerY);innerY+=4.4;}
  y=top+height+3;
 }

 function bullets(items:string[]){
  for(const item of items){
   setFont(8.7);const wrapped=lines(item,CONTENT_WIDTH-8);const height=Math.max(5,wrapped.length*4.5+2);ensure(height);
   setFill(COLORS.blue);doc.circle(PAGE.left+1.5,y-1.1,0.65,'F');setText(COLORS.ink);
   for(const line of wrapped){doc.text(line,PAGE.left+6,y);y+=4.5;}y+=1.5;
  }
  y+=1;
 }

 // Cover
 setFont(8,'bold');setText(COLORS.blue);doc.text('KNOW THE COMPANY. KNOW YOURSELF.',PAGE.left,y);y+=12;
 setFont(27,'bold');setText(COLORS.ink);doc.text('KnowBoth',PAGE.left,y);y+=10;
 setFont(18,'bold');
 const companyLines=lines(report.job.companyDisplayName,CONTENT_WIDTH);
 for(const line of companyLines){doc.text(line,PAGE.left,y);y+=8;}
 setFont(11);setText(COLORS.secondary);
 for(const line of lines(report.job.positionTitle,CONTENT_WIDTH)){doc.text(line,PAGE.left,y);y+=5.5;}
 if(isSample){y+=3;pill('가상 예시 · 실제 기업 분석 아님',PAGE.left,y+4,COLORS.amberSoft,COLORS.amber);y+=11;}
 y+=3;rule();
 setFont(7.5,'bold');setText(COLORS.tertiary);doc.text('분석 기준일',PAGE.left,y);doc.text('보고서 유형',PAGE.left+55,y);y+=5;
 setFont(8.5);setText(COLORS.ink);doc.text(dateLabel(report.generatedAt),PAGE.left,y);doc.text(report.fitItems===null?'기업 · 역할 분석':'내 경험 포함 분석',PAGE.left+55,y);y+=10;
 const summaryLines=lines(report.summary,CONTENT_WIDTH-12);
 const summaryHeight=18+summaryLines.length*5;
 ensure(summaryHeight+8);
 setFill(COLORS.blueSoft);doc.roundedRect(PAGE.left,y,CONTENT_WIDTH,summaryHeight,4,4,'F');
 setFont(7.5,'bold');setText(COLORS.blue);doc.text('한눈에 보는 지원의 방향',PAGE.left+6,y+8);
 setFont(10,'bold');setText(COLORS.ink);
 let summaryY=y+15;for(const line of summaryLines){doc.text(line,PAGE.left+6,summaryY);summaryY+=5;}
 y+=summaryHeight+6;
 if(safeHttpUrl(report.job.sourceUrl))linkedText(`원티드 공고  ${report.job.sourceUrl}`,safeHttpUrl(report.job.sourceUrl),{size:7.8});

 section('기업 이해','회사가 누구의 어떤 문제를 해결하고, 최근 무엇이 달라졌는지 정리했습니다.',true);
 if(report.companyClaims.length){for(const claim of report.companyClaims)claimCard(claim);}else paragraph(report.sectionStates.company.reason||'공개 자료에서 기업 정보를 확인하지 못했습니다.',{color:COLORS.secondary});
 subheading('매출과 확인 범위');
 if(report.revenue.selected){
  const item=report.revenue.selected;
  simpleCard(moneyLabel(item.amountDecimal,item.currency),`${item.entityName} · ${item.periodStart} ~ ${item.periodEnd} · ${item.periodType==='annual'?'연간':item.periodType==='quarter'?'분기':'누적'} · ${item.accountingScope==='consolidated'?'연결':item.accountingScope==='separate'?'별도':'범위 미확인'} · 원문 계정 ${item.accountLabel}${sourceRefs(item.sourceIds)?` · 근거 ${sourceRefs(item.sourceIds)}`:''}`,{text:'자료 확인',fill:COLORS.greenSoft,color:COLORS.green});
 }else simpleCard('확정된 매출 수치를 표시하지 않습니다.',report.revenue.reason||'조사한 공개 자료에서 해당 법인의 매출을 확인하지 못했습니다.',{text:'확인 범위',fill:COLORS.amberSoft,color:COLORS.amber});
 if(report.revenue.status==='conflicting'&&report.revenue.observations.length){
  subheading('서로 다른 매출 자료');
  for(const item of report.revenue.observations){
   const references=sourceRefs(item.sourceIds);
   simpleCard(moneyLabel(item.amountDecimal,item.currency),`${item.entityName} · ${item.periodStart} ~ ${item.periodEnd} · ${item.periodType==='annual'?'연간':item.periodType==='quarter'?'분기':'누적'} · ${item.accountingScope==='consolidated'?'연결':item.accountingScope==='separate'?'별도':'범위 미확인'} · 원문 계정 ${item.accountLabel}${references?` · 근거 ${references}`:''}`,{text:'비교 필요',fill:COLORS.amberSoft,color:COLORS.amber});
  }
 }
 if(report.businessChanges.length){subheading('공고와 연결되는 사업 변화');for(const change of report.businessChanges){claimCard(change.claim);paragraph(`사건일 ${change.eventDate||'미확인'} · 발표일 ${change.publishedAt||'미확인'}`,{size:7.3,color:COLORS.tertiary,after:2});}}

 section('채용 배경','공고에서 확인한 역할과 사업 맥락을 연결하되, 사실과 해석을 구분했습니다.',true);
 if(report.roleClaims.length){subheading('공고에서 확인한 역할');for(const claim of report.roleClaims)claimCard(claim);}
 subheading('왜 이 포지션을 뽑을까');
 if(report.hiringHypotheses.length){
  for(const item of report.hiringHypotheses){
   const references=sourceRefs(item.evidenceSourceIds);
   simpleCard(item.claim,[references?`근거 ${references}`:null,item.alternative?`다른 가능성: ${item.alternative}`:null,`면접에서 확인할 질문: ${item.question}`].filter(Boolean).join('\n'),item.kind==='stated'?{text:'공고 명시',fill:COLORS.greenSoft,color:COLORS.green}:{text:'근거 해석',fill:COLORS.blueSoft,color:COLORS.blue});
  }
 }else paragraph(report.sectionStates.hiring.reason||'공개된 근거가 부족해 구체적인 채용 배경을 단정하지 않았습니다.',{color:COLORS.secondary});
 if(report.requirements.length){subheading('공고의 요구사항');for(const item of report.requirements){const category={required:'필수',preferred:'우대',work:'주요 업무',condition:'지원 조건'}[item.category];simpleCard(item.label,item.jobQuote,{text:category,fill:COLORS.surface,color:COLORS.secondary});}}

 section('나와 비교','공고의 요구와 지원자가 제공한 경험을 연결했습니다.',true);
 if(report.fitItems===null){
  simpleCard('내 경험을 추가하지 않은 분석입니다.','이력서나 프로젝트 경험을 추가하면 각 요구사항과 연결되는 근거, 보완할 점, 확인할 질문을 함께 분석할 수 있습니다.',{text:'프로필 없음',fill:COLORS.surface,color:COLORS.secondary});
 }else if(report.fitItems.length){
  for(const item of report.fitItems){
   const requirement=report.requirements.find(candidate=>candidate.id===item.requirementId);
   const label={evidence:'경험 근거 있음',partial:'일부 연결',gap:'보완 필요',unknown:'추가 확인'}[item.status];
   const palette=item.status==='evidence'?{fill:COLORS.greenSoft,color:COLORS.green}:item.status==='partial'?{fill:COLORS.blueSoft,color:COLORS.blue}:item.status==='gap'?{fill:COLORS.redSoft,color:COLORS.red}:{fill:COLORS.amberSoft,color:COLORS.amber};
   const body=[requirement?`공고: ${requirement.jobQuote}`:null,item.profileQuote?`내 경험: ${item.profileQuote}`:null,item.reason,item.followUpQuestion?`확인 질문: ${item.followUpQuestion}`:null].filter(Boolean).join('\n');
   simpleCard(requirement?.label||'요구 역량',body,{text:label,...palette});
  }
 }else paragraph(report.sectionStates.personalization.reason||'현재 자료에서 연결할 경험을 확인하지 못했습니다.',{color:COLORS.secondary});
 if(report.conditionChecks?.length){subheading('지원 조건');for(const item of report.conditionChecks){const requirement=report.requirements.find(candidate=>candidate.id===item.requirementId);simpleCard(requirement?.label||'지원 조건',item.reason,{text:{met:'충족 근거',not_met:'불일치 근거',unknown:'확인 필요'}[item.status],fill:item.status==='met'?COLORS.greenSoft:item.status==='not_met'?COLORS.redSoft:COLORS.amberSoft,color:item.status==='met'?COLORS.green:item.status==='not_met'?COLORS.red:COLORS.amber});}}
 if(report.preferenceQuestions.length){subheading('내가 확인할 회사 조건');bullets(report.preferenceQuestions.map(item=>`${item.preferenceQuote} — ${item.question}`));}

 section('지원 준비','분석 결과를 지원서와 면접에서 바로 쓸 수 있는 행동으로 바꿨습니다.',true);
 const actionGroups=[
  {kind:'highlight' as const,title:'지원서에서 강조할 경험'},
  {kind:'prepare' as const,title:'먼저 준비하면 좋은 것'},
  {kind:'ask' as const,title:'면접에서 확인할 질문'},
 ];
 for(const group of actionGroups){
  const items=report.actions.filter(item=>item.kind===group.kind);if(!items.length)continue;
  subheading(group.title);
  for(const item of items){
   const body=[item.profileQuote?`내 경험: ${item.profileQuote}`:null,item.deliverable?`결과물: ${item.deliverable}`:null,item.doneWhen?`완료 기준: ${item.doneWhen}`:null].filter(Boolean).join('\n')||'분석 결과를 바탕으로 준비해 보세요.';
   simpleCard(item.title,body);
  }
 }
 if(!report.actions.length)paragraph(report.sectionStates.preparation.reason||'준비 과제를 정할 근거가 아직 부족합니다.',{color:COLORS.secondary});
 if(report.warnings.length){subheading('확인 범위와 주의사항');bullets(report.warnings);}

 section('출처','보고서에서 사용한 공개 자료와 사용자 제공 자료입니다.',true);
 for(let index=0;index<report.sources.length;index++){
  const source=report.sources[index];
  const url=safeHttpUrl(source.url);
  setFont(8.5,'bold');const titleLines=lines(`${index+1}. ${source.title}`,CONTENT_WIDTH);
  ensure(titleLines.length*4.5+14);
  setText(COLORS.ink);for(const line of titleLines){doc.text(line,PAGE.left,y);y+=4.5;}
  paragraph(`${source.publisher||'발행기관 미확인'} · 발행일 ${source.publishedAt||'미확인'} · 확인일 ${dateLabel(source.retrievedAt)} · ${source.evidenceMode==='raw_text'?'확보 원문':source.evidenceMode==='provider_citation'?'검색 제공자 인용':'사용자 제공 자료'}`,{size:7.2,color:COLORS.secondary,lineHeight:3.8,after:1});
  if(url)linkedText(url,url,{size:7,color:COLORS.blue,lineHeight:3.8,after:3});else paragraph('외부 링크 없음',{size:7,color:COLORS.tertiary,lineHeight:3.8,after:3});
 }

 const pageCount=doc.getNumberOfPages();
 for(let page=1;page<=pageCount;page++){
  doc.setPage(page);setDraw(COLORS.line);doc.setLineWidth(0.2);doc.line(PAGE.left,284,PAGE.width-PAGE.right,284);
  setFont(6.7);setText(COLORS.tertiary);doc.text(`KnowBoth · ${isSample?'가상 예시 · ':''}${report.job.companyDisplayName} · ${report.job.positionTitle}`,PAGE.left,289,{maxWidth:135});
  doc.text(`${page} / ${pageCount}`,PAGE.width-PAGE.right,289,{align:'right'});
 }

 return new Uint8Array(doc.output('arraybuffer'));
}

export async function downloadReportPdf(report:Report):Promise<void>{
 if(typeof window==='undefined'||typeof document==='undefined')throw new Error('PDF 다운로드는 브라우저에서만 사용할 수 있어요.');
 const [regular,bold]=await Promise.all([
  fetchFont('/fonts/NanumGothic-Regular.ttf'),
  fetchFont('/fonts/NanumGothic-Bold.ttf'),
 ]);
 const bytes=await buildReportPdf(report,{regular,bold});
 const blob=new Blob([bytes as BlobPart],{type:'application/pdf'});
 const url=URL.createObjectURL(blob);
 const link=document.createElement('a');
 link.href=url;
 link.download=`KnowBoth-${filenamePart(report.job.companyDisplayName)}-${filenamePart(report.job.positionTitle)}.pdf`;
 document.body.appendChild(link);
 link.click();
 link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1_000);
}
