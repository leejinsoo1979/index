import { terms,chunkMarkdown,chunkPages } from './retrieval/index.mjs';

const TRANSCRIPT='## 원문 자막';
const SUMMARY='## 참고 정리';
const ATTRIBUTION=/^발언 출처: (.+)$/m;

/** Imported notes remain readable, but only their exact timestamped transcript is evidence. */
export function personalEvidenceChunks(page){
  if(page.tags?.some(t=>['유튜브 목차','자료 목록','참고 이미지'].includes(t)))return [];
  if(page.category==='답변 보완'){
    const question=page.content.match(/## 질문\s*\n([\s\S]*?)\n## 보완된 답변/)?.[1]?.trim()||page.title;
    const answer=page.content.split('## 보완된 답변')[1]||page.content;
    return chunkMarkdown(answer).map(c=>({text:`질문: ${question.slice(0,1500)}\n\n소유자 보완 답변:\n${c.text}`,ownerCorrection:true,attribution:'소유 임원이 직접 보완한 답변 · 최우선'}));
  }
  if(page.tags?.includes('PDF 원문')){
    const sections=[...page.content.matchAll(/^## (\d+)쪽\s*\n([\s\S]*?)(?=^## \d+쪽\s*\n|(?![\s\S]))/gm)];
    return sections.flatMap(m=>chunkPages([{num:Number(m[1]),text:m[2]}]).map(c=>({text:c.text,pages:`${c.page}쪽`,attribution:'사용자가 제공한 협회 연구자료 PDF · 원문 본문과 별도 표시된 OCR'})));
  }
  if(!page.tags?.includes('유튜브 원문'))return chunkMarkdown(page.content).filter(c=>!c.heading||!/^(참고 출처|관련 항목|관련 문서|목차)/.test(c.heading)).map(c=>({text:c.text,heading:c.heading,ownerCorrection:page.category==='답변 보완',attribution:page.category==='답변 보완'?'소유 임원이 직접 보완한 답변 · 최우선':page.tags?.includes('지식백과')?'영상 자막에 기반한 개념 정리 · 직접 발언 인용 아님':undefined}));
  const start=page.content.indexOf(TRANSCRIPT);
  if(start<0)return [];
  const raw=page.content.slice(start+TRANSCRIPT.length).split(SUMMARY)[0];
  const attribution=page.content.match(ATTRIBUTION)?.[1]||'채널 자료 · 발언자 확인 필요';
  const url=page.sources?.find(s=>s.href&&/^https:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]{11}/.test(s.href))?.href;
  const lines=raw.split('\n').filter(l=>/^\[\d{1,2}:\d{2}(?::\d{2})?\s*-\s*\d{1,2}:\d{2}/.test(l));
  const chunks=[];let buffer=[];let size=0;
  const flush=()=>{if(buffer.length){const text=buffer.join('\n');const timestamp=buffer[0].match(/^\[([^\]]+)\]/)?.[1];chunks.push({text,timestamp,url,attribution});}buffer=[];size=0;};
  for(const line of lines){if(size+line.length>1000)flush();buffer.push(line);size+=line.length;}
  flush();return chunks;
}

/** Reuses the knowledge server's Korean tokenization; title-only matches are not evidence. */
export function rankPersonalEvidence(pages,question){
  const queryText=question.replace(/알려\s*(주세요|주실래요|줄래요|줄래|줘요|줘)|설명\s*(해주세요|해줘요|해줘)|궁금(?:합니다|해요|해)/g,' ');
  const query=[...new Set(terms(queryText,{query:true}))];if(!query.length)return [];
  const chunks=pages.flatMap(p=>personalEvidenceChunks(p).map(c=>({...c,p,tokens:new Set(terms(c.text)),titleTokens:new Set(terms(p.title))})));
  const frequency=new Map(query.map(t=>[t,chunks.reduce((n,c)=>n+(c.tokens.has(t)?1:0),0)]));
  const scored=chunks.map(c=>{
    const matching=query.filter(t=>c.tokens.has(t));
    const score=matching.reduce((n,t)=>n+Math.log(1+(chunks.length+1)/((frequency.get(t)||0)+1))*(c.titleTokens.has(t)?1.4:1),0)/Math.sqrt(Math.max(1,c.text.length/700));
    return {...c,score,matching};
  }).filter(c=>c.matching.length>=(query.length>2?2:1)).sort((a,b)=>b.score-a.score);
  const result=[],counts=new Map();
  for(const c of scored){if((counts.get(c.p.id)||0)>=3)continue;counts.set(c.p.id,(counts.get(c.p.id)||0)+1);result.push(c);if(result.length>=6)break;}
  return result;
}
