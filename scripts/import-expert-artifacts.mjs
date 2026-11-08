/** Complete, local-only import after scripts/audit preparation. Originals remain private.
 * Usage: node scripts/import-expert-artifacts.mjs <inventory.json> <pdf-pages.json> <pdf-ocr.jsonl>
 */
import {readFileSync,writeFileSync,mkdirSync,existsSync,copyFileSync} from 'node:fs';
import {dirname,join,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {WikiStore} from '../server/wiki/store.mjs';
import {PersonaStore} from '../server/wiki/persona-store.mjs';
const [inventoryFile,pdfFile,ocrFile]=process.argv.slice(2);
if(!inventoryFile||!pdfFile||!ocrFile)throw new Error('원본 목록, PDF 전체 본문, OCR 결과 경로가 필요합니다.');
const inventory=JSON.parse(readFileSync(inventoryFile,'utf8')),pack=dirname(inventoryFile),extracted=join(pack,'extracted');
const pdfs=JSON.parse(readFileSync(pdfFile,'utf8')),ocr=readFileSync(ocrFile,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const ocrByPage=new Map(ocr.map(r=>[r.name+':'+r.num,r]));
if(pdfs.length!==26||pdfs.some(d=>d.pages.some(p=>!ocrByPage.has(d.name+':'+p.num))))throw new Error('26개 PDF의 전체 페이지 OCR이 끝나지 않았습니다.');
if(inventory.folderDifferences.length)throw new Error('폴더와 ZIP이 다릅니다. 최신본을 먼저 확인해 주세요.');
const store=new WikiStore(process.env.INDEX_KNOWLEDGE_DIR||'.index-knowledge'),personas=new PersonaStore(store),personId='interior-show';
const actor={uid:'index-owner-import',admin:true,name:'사용자 지정 전체 자료 이관'};
const rawRoot=join(store.root,'experts',personId,'raw');mkdirSync(rawRoot,{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex');
const saved=[],existing=()=>personas.pages(personId);
function preserve(path,name=basename(path)){
 const bytes=readFileSync(path),id=sha(bytes),extension=name.split('.').at(-1).toLowerCase();
 writeFileSync(join(rawRoot,id+'.'+extension),bytes,{mode:0o600});
 writeFileSync(join(rawRoot,id+'.json'),JSON.stringify({name,extension,sourceId:id}),{mode:0o600});
 return {id,kind:'file',title:name,storage:'server',fileKey:extension};
}
function save(draft,originKey){
 const prior=existing().find(p=>p.sources.some(s=>s.id===originKey));
 if(prior){saved.push({id:prior.id,title:prior.title,originKey,alreadyImported:true});return prior;}
 const page=personas.savePage(personId,{draft:{pinned:false,cover:'auto',category:'공간',...draft,sources:[{id:originKey,kind:'knowledge',title:draft.title},...(draft.sources||[])]},options:{expectedVersion:0,reason:'사용자 지시: artifacts 전체 자료 반영 · 원본·쪽번호·OCR·이미지 보존'}},actor);
 saved.push({id:page.id,title:page.title,originKey});return page;
}
const strip=t=>t.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/,'');
const title=t=>t.match(/^title:\s*["']?(.+?)["']?\s*$/m)?.[1]||t.match(/^# (.+)$/m)?.[1];
const before={pages:store.pages().length,events:store.status().events};
try{
 for(const d of pdfs){
  const raw=preserve(d.path,d.name);
  const content=d.pages.map(p=>{
   const o=ocrByPage.get(d.name+':'+p.num),normal=x=>x.replace(/[\s·•]/g,'').toLowerCase();
   const base=normal(p.text);const supplement=o.text.split('\n').filter(l=>normal(l).length>1&&!base.includes(normal(l))).join('\n');
   return `## ${p.num}쪽\n\n${p.text}${supplement?'\n\n### 그림·표 OCR (자동 인식 · 원본 대조 필요)\n\n'+supplement:''}`;
  }).join('\n\n');
  const pdfTitle=d.name.replace(/^\d+_/,'').replace(/\.pdf$/i,'');
  save({title:pdfTitle,content:`# ${pdfTitle}\n\n사용자가 인쇼 대표 지식자료로 지정한 협회 연구자료입니다. 원본 PDF ${d.total}쪽을 전부 보존했고 아래 본문과 그림·표 OCR은 따로 표시했습니다. OCR은 표의 행·열 관계를 확정하지 않습니다.\n\n${content}`,entryType:'source',category:/하자|HZ-/.test(d.name)?'하자':/법|적법|행정|보험|허가|소방/.test(d.name)?'법규·기준':'공법',tags:['협회 연구자료','PDF 원문'],status:'published',sources:[raw]},'pdf-full:'+raw.id);
 }
 const encyEntries=inventory.files.filter(f=>f.archive==='인테리어_지식백과_개념70_설명이미지포함.zip'&&f.path.endsWith('.md'));
 const guideTitles=new Map(encyEntries.filter(f=>!f.path.includes('/지식/')).map(f=>{const t=title(readFileSync(join(extracted,f.path),'utf8'));return [t,'지식백과 · '+t];}));
 const rewriteLinks=t=>t.replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g,(_,target,label)=>`[[${guideTitles.get(target)||target}${label||''}]]`);
 for(const f of encyEntries){
  const original=readFileSync(join(extracted,f.path),'utf8'),isConcept=f.path.includes('/지식/'),name=title(original);
  const imageRewrite=strip(original).replace(/!\[([^\]]*)\]\(([^)]+)\)/g,(_,alt,path)=>{
   const relative=decodeURI(path).split('assets/')[1];if(!relative)throw new Error('알 수 없는 이미지 경로 '+path);
   const file=join('public/wiki-assets/interior-encyclopedia',relative);const match=inventory.files.find(x=>x.path.endsWith('/assets/'+relative));
   if(!existsSync(file)||!match||sha(readFileSync(file))!==match.sha256)throw new Error('그림 원본 불일치 '+relative);
   return `![${alt}](${encodeURI('/wiki-assets/interior-encyclopedia/'+relative)})`;
  });
  const aliasesText=original.match(/^aliases:\s*(\[[^\n]*\])/m)?.[1];let aliases=[];try{if(aliasesText)aliases=JSON.parse(aliasesText);}catch{}
  const urls=[...new Set([...original.matchAll(/https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}(?:&t=\d+)?/g)].map(m=>m[0]))];
  save({title:isConcept?name:guideTitles.get(name),content:rewriteLinks(imageRewrite),entryType:isConcept?'article':'note',aliases,category:'공간',tags:['인테리어SHOW','지식백과',...(isConcept?[]:['자료 목록'])],status:isConcept?'published':'review',sources:[preserve(join(extracted,f.path),basename(f.path)),...urls.map(url=>({id:'video-ref:'+sha(Buffer.from(url)),kind:'knowledge',title:'개념의 원본 영상',href:url}))]},'encyclopedia:'+f.sha256);
 }
 // The transcript ZIP contains 75 video entries + one catalog. Five videos have
 // no substantive spoken transcript; preserve their real status, never invent it.
 const manifest=JSON.parse(readFileSync(join(store.root,'experts',personId,'knowledge-packs/youtube-v1/import.json'),'utf8'));
 const included=new Set(manifest.pages.map(p=>p.videoId).filter(Boolean));let unavailable=0;
 for(const f of inventory.files.filter(f=>f.archive==='인테리어SHOW_동영상_스크립트.zip')){
  if(basename(f.path)==='00_목록.md')continue;
  const text=readFileSync(join(extracted,f.path),'utf8'),vid=text.match(/watch\?v=([\w-]{11})/)?.[1];
  if(included.has(vid))continue;
  unavailable++;
  save({title:'원본 상태 · '+title(text),content:text+'\n\n이 파일은 자막 부재 또는 음악 중심의 영어 자동자막으로 실질적인 한국어 발언이 없습니다. 내용을 임의로 보충하지 않았습니다.',entryType:'note',category:'일반',tags:['인테리어SHOW','자료 목록'],status:'review',sources:[preserve(join(extracted,f.path),basename(f.path))]},'unavailable-transcript:'+f.sha256);
 }
 const catalog=inventory.files.find(f=>f.archive==='인테리어SHOW_동영상_스크립트.zip'&&basename(f.path)==='00_목록.md');
 save({title:'방송 원본 전체 목록 · 75편',content:readFileSync(join(extracted,catalog.path),'utf8'),entryType:'note',category:'일반',tags:['자료 목록'],status:'review',sources:[preserve(join(extracted,catalog.path),'방송 원본 목록.md')]},'transcript-catalog:'+catalog.sha256);
 const images=inventory.files.filter(f=>f.standalone&&f.path.endsWith('.png'));
 let imageMd='# 제공된 전체 설명 이미지\n\nAI 생성 설명용 이미지입니다. 실제 현장이나 시공 검증 자료로 해석하지 않습니다.\n\n';
 for(const f of images){
  const duplicate=inventory.files.find(x=>x.archive==='인테리어_지식백과_개념70_설명이미지포함.zip'&&x.sha256===f.sha256&&x.path.endsWith('.png'));
  const url=duplicate?encodeURI('/wiki-assets/interior-encyclopedia/'+duplicate.path.split('/assets/')[1]):'/wiki-assets/interior-show-reference/'+f.sha256+'.png';
  if(!duplicate){const target=join('public/wiki-assets/interior-show-reference',f.sha256+'.png');mkdirSync(dirname(target),{recursive:true});if(!existsSync(target))copyFileSync(join(pack,'standalone',f.path),target);}
  imageMd+=`## ${f.path}\n\n![AI 생성 설명 이미지](${url})\n\n`;
 }
 save({title:'제공된 설명 이미지',content:imageMd,entryType:'note',category:'일반',tags:['참고 이미지'],status:'review',sources:images.map(f=>preserve(join(pack,'standalone',f.path),f.path))},'standalone-images-v1');
 const report={at:new Date().toISOString(),pdfs:pdfs.length,pdfPages:pdfs.reduce((n,d)=>n+d.total,0),ocrPages:ocr.length,encyclopediaDocuments:encyEntries.length,concepts:encyEntries.filter(f=>f.path.includes('/지식/')).length,encyclopediaImages:inventory.files.filter(f=>f.archive==='인테리어_지식백과_개념70_설명이미지포함.zip'&&/\.(svg|png)$/.test(f.path)).length,unavailableTranscripts:unavailable,standaloneImages:images.length,archives:inventory.archives.map(a=>({name:a.path,sha256:a.sha256})),folderMatches:inventory.folderComparisons.length,pages:saved,styleVersion:'v2',legacyStyle:'v1 preserved as superseded archive; not mixed into active style'};
 if(before.pages!==store.pages().length||before.events!==store.status().events)throw new Error('공용 지식에 예상치 못한 변경이 생겼습니다.');
 report.sharedUnchanged=true;writeFileSync(join(pack,'import.json'),JSON.stringify(report,null,2),{mode:0o600});
 copyFileSync(pdfFile,join(pack,'pdf-pages.json'));copyFileSync(ocrFile,join(pack,'pdf-ocr.jsonl'));
 personas.searchIndex.sync(personId,personas.pages(personId));
 console.log(JSON.stringify({...report,pages:saved.length,archives:report.archives.length}));
}finally{store.close();}
