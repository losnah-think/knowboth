'use client';
import {useState,useRef,useEffect} from 'react';
import {Upload,Loader2,FileCheck2,X,ArrowRight,Search} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import type {ImportedJob,JobLink} from '@/lib/rolebridge/job-source';
import {toast} from 'sonner';
type ImportResponse = {error?:string; retryable?:boolean; job?:ImportedJob; links?:JobLink[]; nextOffset?:number|null; total?:number};
export function SourceImporter({onBatch,onCandidates,onBusy}:{onBatch:(jobs:ImportedJob[])=>void;onCandidates:(links:JobLink[])=>void;onBusy:(busy:boolean)=>void}){
 const [keyword,setKeyword]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 const [failures,setFailures]=useState<{title:string;message:string}[]>([]),[next,setNext]=useState<number|null>(null),[activeKeyword,setActiveKeyword]=useState('');
 const [total,setTotal]=useState<number|null>(null),[checked,setChecked]=useState(0);
 const controller=useRef<AbortController|null>(null),collected=useRef<ImportedJob[]>([]),seen=useRef(new Set<number>()),candidates=useRef(new Map<number,JobLink>()),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;controller.current?.abort();};},[]);
 async function pause(ms:number,signal:AbortSignal){await new Promise<void>((resolve,reject)=>{const cancel=()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'));};const timer=setTimeout(()=>{signal.removeEventListener('abort',cancel);resolve();},ms);if(signal.aborted)cancel();else signal.addEventListener('abort',cancel,{once:true});});}
 async function request(body:{mode:'search';keyword:string;offset:number}|{mode:'job';id:number},signal:AbortSignal):Promise<ImportResponse>{
  for(let attempt=0;attempt<3;attempt++){
   try{
    const response=await fetch('/api/import-jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});
    const data=await response.json().catch(()=>({error:'원티드 정보를 가져오는 중 일시적인 오류가 발생했어요.'})) as ImportResponse;
    if(response.ok)return data;
    if((data.retryable||response.status>=500)&&attempt<2){await pause(1500*(attempt+1),signal);continue;}
    throw new Error(data.error||'원티드 정보를 읽지 못했어요.');
   }catch(e){
    if(signal.aborted)throw e;
    if(e instanceof TypeError&&attempt<2){await pause(1500*(attempt+1),signal);continue;}
    throw e;
   }
  }
  throw new Error('원티드 정보를 읽지 못했어요.');
 }
 async function run(resume=false){
  const term=resume?activeKeyword:keyword.trim();if(!term)return;
  controller.current?.abort();const c=new AbortController();controller.current=c;setBusy(true);onBusy(true);setError('');
  if(!resume){collected.current=[];seen.current.clear();candidates.current.clear();setFailures([]);setNext(0);setTotal(null);setChecked(0);setActiveKeyword(term);onCandidates([]);onBatch([]);}
  let offset:number|null=resume?next:0;let excluded=resume?failures.length:0;
  try{
   while(offset!==null&&!c.signal.aborted){
    const currentOffset:number=offset;setNext(currentOffset);setMessage(`원티드에서 ‘${term}’ 검색결과를 가져오고 있어요…`);
    const data=await request({mode:'search',keyword:term,offset:currentOffset},c.signal);
    setTotal(data.total??null);
    for(const link of data.links||[])candidates.current.set(link.id,link);
    onCandidates([...candidates.current.values()]);
    const links=(data.links||[]).filter(x=>!seen.current.has(x.id));
    for(const link of links){
     c.signal.throwIfAborted();setMessage(`${seen.current.size+1}번째 공고를 읽고 있어요 · ${link.company||'원티드'} / ${link.title}`);
     try{
      const detail=await request({mode:'job',id:link.id},c.signal);
      if(!detail.job)throw new Error('공고 본문을 확인하지 못해 제외했어요.');
      collected.current.push(detail.job);onBatch([...collected.current]);
     }catch(e){if(c.signal.aborted)throw e;excluded++;setFailures(p=>[...p,{title:link.title,message:e instanceof Error?e.message:'자동 확인 실패'}]);}
     seen.current.add(link.id);setChecked(seen.current.size);
     await pause(250,c.signal);
    }
    offset=data.nextOffset??null;setNext(offset);
   }
   if(!c.signal.aborted)setMessage(candidates.current.size?`확인 완료 · 비교할 수 있는 공고 ${collected.current.length}개${excluded?` · 자동 제외 ${excluded}개`:''}`:`원티드에서 ‘${term}’ 검색결과가 없어요. 다른 직무나 키워드로 검색해 주세요.`);
  }catch(e){if(!c.signal.aborted)setError(e instanceof Error?e.message:'원티드 검색을 이어가지 못했어요.');}
  finally{if(alive.current){setBusy(false);onBusy(false);if(c.signal.aborted)setMessage(`잠시 멈췄어요. 읽어낸 ${collected.current.length}개 공고는 바로 비교할 수 있어요.`);}}
 }
 return <div className="source-import"><form onSubmit={e=>{e.preventDefault();void run();}}><label htmlFor="job-search">원티드에서 찾을 직무 또는 키워드</label><div className="url-input-wrap"><Search size={18}/><Input id="job-search" type="search" maxLength={80} value={keyword} onChange={e=>setKeyword(e.target.value)} disabled={busy} placeholder="AX, PM, FDE… 어떤 일을 찾고 있나요?"/></div><div className="search-suggestions">{['AX','PM','FDE','서비스 기획','프론트엔드'].map(word=><button key={word} type="button" disabled={busy} onClick={()=>setKeyword(word)}>{word}</button>)}</div><Button type="submit" variant="outline" className="import-button" disabled={busy||!keyword.trim()}>{busy?<Loader2 className="animate-spin"/>:<Search/>}원티드 공고 찾기<ArrowRight/></Button></form><p className="field-hint">검색결과의 상세 공고를 하나씩 읽어요. 주요 업무·자격 요건·우대 사항을 자동으로 가져오고, 일시적인 오류는 다시 시도해요.</p>{total!==null&&<div className="collection-progress"><div><strong>{checked} / {total}개 확인</strong><span>비교 준비 {collected.current.length}개</span></div><progress aria-label="원티드 공고 확인 진행률" max={Math.max(total,checked,1)} value={checked}/></div>}{message&&<p className="import-status" role="status">{message}</p>}{busy&&<Button variant="ghost" size="sm" onClick={()=>controller.current?.abort()}><X/>잠시 멈추기</Button>}{error&&<p className="error-message" role="alert">{error}</p>}{!busy&&next!==null&&<Button variant="outline" className="mt-3" onClick={()=>run(true)}>‘{activeKeyword}’ 공고 확인 이어가기</Button>}{failures.length>0&&<details className="import-failures"><summary>자동으로 제외한 공고 {failures.length}개</summary><p>마감되었거나 본문을 확인하지 못한 공고는 비교에 포함하지 않아요.</p>{failures.map((f,i)=><p key={i}><strong>{f.title}</strong><br/>{f.message}</p>)}</details>}</div>;
}
export function ResumeUpload({onText}:{onText:(text:string,name:string)=>void}){
 const [busy,setBusy]=useState(false),[name,setName]=useState(''),[error,setError]=useState('');const fileRef=useRef<HTMLInputElement>(null);
 async function read(file:File){setBusy(true);setError('');try{if(file.size>8*1024*1024)throw new Error('8MB 이하 파일을 올려주세요.');let text='';const ext=file.name.split('.').pop()?.toLowerCase();const bytes=await file.arrayBuffer();
 if(ext==='pdf'){const pdfjs=await import('pdfjs-dist');pdfjs.GlobalWorkerOptions.workerSrc='/vendor/pdf.worker.min.mjs';const loading=pdfjs.getDocument({data:bytes,useSystemFonts:true});const doc=await loading.promise;try{if(doc.numPages>40)throw new Error('40페이지 이하 이력서를 올려주세요.');const parts:string[]=[];for(let p=1;p<=doc.numPages;p++){const page=await doc.getPage(p);const content=await page.getTextContent();parts.push(content.items.map(item=>'str'in item?item.str+('hasEOL'in item&&item.hasEOL?'\n':' '):'').join(''));page.cleanup();}text=parts.join('\n\n');}finally{await loading.destroy();}}
 else if(ext==='docx'){const mammoth=await import('mammoth');const result=await mammoth.extractRawText({arrayBuffer:bytes});text=result.value;}
 else if(ext==='txt'||ext==='md'){text=new TextDecoder().decode(bytes);}
 else throw new Error('PDF, DOCX, TXT, MD 파일을 지원해요. HWP·이미지는 PDF나 DOCX로 변환해 주세요.');
 text=text.trim();if(text.length<30)throw new Error('읽을 수 있는 텍스트가 부족해요. 스캔·이미지 PDF는 텍스트가 있는 PDF로 변환해 주세요.');if(text.length>14000)throw new Error('이력서 내용이 14,000자를 넘어요. 경력·프로젝트 중심으로 줄여주세요.');onText(text,file.name);setName(file.name);toast.success('이력서를 읽었어요. 추출 내용은 아래에서 확인할 수 있어요.');
 }catch(e){setError(e instanceof Error?e.message:'이력서를 읽지 못했어요. 암호화 여부와 파일 형식을 확인해 주세요.');}finally{setBusy(false);if(fileRef.current)fileRef.current.value='';}}
 return <div className="resume-upload"><input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.md" className="sr-only" aria-label="이력서 파일 업로드" onChange={e=>{const f=e.target.files?.[0];if(f)void read(f);}}/><button className="upload-zone" type="button" disabled={busy} onClick={()=>fileRef.current?.click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(!busy&&e.dataTransfer.files[0])void read(e.dataTransfer.files[0]);}}>{busy?<Loader2 className="animate-spin"/>:name?<FileCheck2/>:<Upload/>}<strong>{busy?'이력서의 경험을 읽고 있어요…':name||'이력서를 놓거나 클릭해 주세요'}</strong><span>PDF · DOCX · TXT · MD / 최대 8MB</span></button><p className="field-hint">파일은 브라우저에서 읽어요. 서버에 저장하지 않아요. 연락처 등 불필요한 정보는 추출 내용에서 지워주세요.</p>{error&&<p className="error-message" role="alert">{error}</p>}</div>;
}
