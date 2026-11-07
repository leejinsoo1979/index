/** Local operator import of user-supplied transcript/note ZIPs into ONE personal space.
 * No shared wiki writes, network downloads, model-generated facts, or activity jobs.
 * Usage: node scripts/import-expert-youtube.mjs <transcripts.zip> <notes.zip>
 */
import { execFileSync } from 'node:child_process';
import { readFileSync,writeFileSync,mkdirSync,copyFileSync,existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join,resolve } from 'node:path';
import { WikiStore } from '../server/wiki/store.mjs';
import { PersonaStore } from '../server/wiki/persona-store.mjs';

const [transcriptZip,notesZip]=process.argv.slice(2);
if(!transcriptZip||!notesZip)throw new Error('원문 자막 ZIP과 정리 노트 ZIP 경로를 지정해 주세요.');
const extract=String.raw`import sys,zipfile,json,unicodedata
result=[]
for filename in sys.argv[1:]:
 rows=[]
 with zipfile.ZipFile(filename) as z:
  for i in z.infolist():
   if not i.filename.endswith('.md') or i.filename.startswith('__MACOSX/'):continue
   if i.file_size>2000000:raise ValueError('Oversized Markdown')
   name=i.filename
   if not i.flag_bits&0x800:
    try:name=name.encode('cp437').decode('utf8')
    except (UnicodeError,LookupError):pass
   rows.append({'path':unicodedata.normalize('NFC',name),'text':z.read(i).decode('utf8')})
 result.append(rows)
print(json.dumps(result,ensure_ascii=False))`;
const [transcripts,notes]=JSON.parse(execFileSync('python3',['-c',extract,resolve(transcriptZip),resolve(notesZip)],{maxBuffer:15*1024*1024,encoding:'utf8'}));
const videoId=s=>s.match(/youtube\.com\/watch\?v=([\w-]{11})/)?.[1];
const sourceByVideo=new Map(transcripts.filter(d=>videoId(d.text)).map(d=>[videoId(d.text),d]));
const store=new WikiStore(process.env.INDEX_KNOWLEDGE_DIR||'.index-knowledge');const personas=new PersonaStore(store);
const personId='interior-show',actor={uid:'index-owner-import',admin:true,name:'사용자 지정 유튜브 자료 이관'};
const root=join(store.root,'experts',personId),packRoot=join(root,'knowledge-packs','youtube-v1');mkdirSync(packRoot,{recursive:true});
const digest=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const packHash=digest(transcriptZip)+':'+digest(notesZip);
const manifestPath=join(packRoot,'import.json');
if(existsSync(manifestPath)){
  const previous=JSON.parse(readFileSync(manifestPath,'utf8'));
  if(previous.packHash===packHash&&previous.pages.every(p=>personas.pages(personId).some(d=>d.id===p.id))){console.log(JSON.stringify({alreadyImported:true,...previous.counts}));store.close();process.exit(0);}
  throw new Error('다른 버전 또는 일부 이관 기록이 있습니다. 원본 이력을 확인해 주세요.');
}
copyFileSync(transcriptZip,join(packRoot,'transcripts.zip'));copyFileSync(notesZip,join(packRoot,'notes.zip'));
const styleProfilePath=join(root,'style-packs','v2','speaker_profile.json');
const provisional=existsSync(styleProfilePath)?JSON.parse(readFileSync(styleProfilePath,'utf8')).scope.included_source_numbers:[];
const stripFrontMatter=t=>t.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/,'');
const titleOf=d=>d.text.match(/^title:\s*["']?(.+?)["']?\s*$/m)?.[1]||d.text.match(/^# (.+)$/m)?.[1]||d.path.split('/').at(-1).replace(/\.md$/,'');
const docNotes=notes.filter(d=>d.path.includes('/notes/')&&videoId(d.text));
if(docNotes.length!==70)throw new Error('70편 지식 노트 묶음인지 확인해 주세요.');
const names=new Map(notes.map(d=>[d.path.split('/').at(-1).replace(/\.md$/,''),titleOf(d)]));
const rewrite=t=>t.replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g,(_,target,label)=>`[[${names.get(target)||target}${label||''}]]`);
const saved=[],missing=[],rawRoot=join(root,'raw');mkdirSync(rawRoot,{recursive:true});
try{
  const before={sharedPages:store.pages().length,sharedEvents:store.status().events};
  for(const note of docNotes){
    const vid=videoId(note.text),source=sourceByVideo.get(vid);if(!source){missing.push(vid);continue;}
    const title=titleOf(note),sourceHash=createHash('sha256').update(source.text).digest('hex');
    writeFileSync(join(rawRoot,sourceHash+'.md'),source.text,{mode:0o600});
    writeFileSync(join(rawRoot,sourceHash+'.json'),JSON.stringify({name:source.path.split('/').at(-1),extension:'md',sourceId:sourceHash}),{mode:0o600});
    const number=Number(note.path.split('/').at(-1).match(/^(\d+)_/)?.[1]);
    const attribution=provisional.includes(number)?'대표 설명형으로 분류된 자막 · 음성·영상 대조 전':'인테리어SHOW 채널 자료 · 직원·게스트 발언 포함 가능, 대표 본인 발언으로 단정 금지';
    const raw=source.text.split('## 스크립트')[1]?.trim();if(!raw||!/^\[\d{1,2}:\d{2}/m.test(raw))throw new Error('시간대별 자막이 없습니다: '+title);
    const segments=[];let buf='';for(const line of raw.split('\n')){if(buf.length+line.length>85000){segments.push(buf);buf='';}buf+=line+'\n';}if(buf)segments.push(buf);
    for(let part=0;part<segments.length;part++){
      const partTitle=title+(part?` · 원문 ${part+1}`:'');
      const summary=part===0?`\n\n## 참고 정리\n\n아래는 제공된 정리 노트이며 직접 발언 인용의 근거는 위 원문 자막입니다.\n\n${rewrite(stripFrontMatter(note.text))}`:'';
      const sourceUrl='https://www.youtube.com/watch?v='+vid;
      const content=`영상: [${title}](${sourceUrl})\n\n발언 출처: ${attribution}\n\n자료: 사용자 제공 한국어 자동 생성 자막. 오인식·발언자 불확실성은 원 영상에서 확인해야 합니다.\n\n## 원문 자막\n\n${segments[part]}${summary}`;
      const draft={title:partTitle,content,entryType:'source',category:'공간',tags:['인테리어SHOW','유튜브 원문'],status:'published',pinned:false,cover:'auto',sources:[{id:'youtube-'+vid,kind:'knowledge',title,href:sourceUrl,excerpt:'사용자가 인쇼 대표 지식자료로 지정한 개인 방송 원문 자막. 음성·영상 전수 검증과 별개입니다.'},{id:sourceHash,kind:'file',title:source.path.split('/').at(-1),storage:'server',fileKey:'md'}]};
      const p=personas.savePage(personId,{draft,options:{expectedVersion:0,reason:'사용자 지시: 개인 방송 지식자료 이관 · 원문과 출처 보존'}},actor);saved.push({id:p.id,title:p.title,videoId:vid,part:part+1,sourceHash});
    }
  }
  if(missing.length)throw new Error('자막이 없는 노트: '+missing.join(','));
  for(const note of notes.filter(d=>!d.path.includes('/notes/'))){
    const p=personas.savePage(personId,{draft:{title:titleOf(note),content:rewrite(stripFrontMatter(note.text)),entryType:'note',category:'일반',tags:['인테리어SHOW','유튜브 목차'],status:'review',pinned:false,cover:'auto',sources:[]},options:{expectedVersion:0,reason:'개인 지식위키 탐색용 목차'}},actor);saved.push({id:p.id,title:p.title,index:true});
  }
  const after={sharedPages:store.pages().length,sharedEvents:store.status().events};if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('공용 위키가 변경되었습니다. 점검이 필요합니다.');
  const counts={videos:docNotes.length,knowledgePages:saved.filter(p=>!p.index).length,indexPages:saved.filter(p=>p.index).length,originals:new Set(saved.filter(p=>p.videoId).map(p=>p.videoId)).size};
  writeFileSync(manifestPath,JSON.stringify({packHash,at:new Date().toISOString(),personId,counts,pages:saved,sharedUnchanged:true},null,2),{mode:0o600});
  console.log(JSON.stringify({...counts,sharedUnchanged:true}));
}finally{store.close();}
