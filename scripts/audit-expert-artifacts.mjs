import {readFileSync,existsSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {WikiStore} from '../server/wiki/store.mjs';
import {PersonaStore} from '../server/wiki/persona-store.mjs';
const root=process.env.INDEX_KNOWLEDGE_DIR||'.index-knowledge',personRoot=join(root,'experts/interior-show'),pack=join(personRoot,'knowledge-packs/artifacts-v1');
const inventory=JSON.parse(readFileSync(join(pack,'inventory.json'))),report=JSON.parse(readFileSync(join(pack,'import.json'))),pdfs=JSON.parse(readFileSync(join(pack,'pdf-pages.json')));
const sha=b=>createHash('sha256').update(b).digest('hex');
const verified=[];
for(const f of inventory.files){const path=f.standalone?join(pack,'standalone',f.path):join(pack,'extracted',f.path);assert.equal(sha(readFileSync(path)),f.sha256,'보존 파일 불일치: '+f.path);verified.push(f.path);}
for(const a of inventory.archives)assert.equal(sha(readFileSync(join(pack,'archives',a.path))),a.sha256,'ZIP 원본 불일치');
assert.equal(inventory.folderDifferences.length,0);
const store=new WikiStore(root),personas=new PersonaStore(store);try{
 const pages=personas.pages('interior-show');
 const yt=JSON.parse(readFileSync(join(personRoot,'knowledge-packs/youtube-v1/import.json')));
 let transcriptVideos=0;
 for(const vid of new Set(yt.pages.map(p=>p.videoId).filter(Boolean))){
  const parts=yt.pages.filter(p=>p.videoId===vid).sort((a,b)=>a.part-b.part);
  const raw=readFileSync(join(personRoot,'raw',parts[0].sourceHash+'.md'),'utf8');
  const expected=raw.split('## 스크립트')[1].replace(/\s/g,'');
  const actual=parts.map(p=>pages.find(d=>d.id===p.id).content.split('## 원문 자막')[1].split('## 참고 정리')[0]).join('').replace(/\s/g,'');
  assert.equal(actual,expected,'자막 누락: '+vid);transcriptVideos++;
 }
 let pdfPages=0;
 for(const d of pdfs){
  const page=pages.find(p=>p.sources.some(s=>s.id==='pdf-full:'+d.sha256));assert.ok(page,d.name);
  assert.equal(sha(readFileSync(join(personRoot,'raw',d.sha256+'.pdf'))),d.sha256);
  for(const original of d.pages){assert.ok(page.content.includes('## '+original.num+'쪽'));assert.ok(page.content.includes(original.text));pdfPages++;}
 }
 let assets=0;
 for(const f of inventory.files.filter(f=>f.archive==='인테리어_지식백과_개념70_설명이미지포함.zip'&&/\.(png|svg)$/.test(f.path))){const target=join('public/wiki-assets/interior-encyclopedia',f.path.split('/assets/')[1]);assert.ok(existsSync(target));assert.equal(sha(readFileSync(target)),f.sha256);assets++;}
 assert.equal(report.encyclopediaDocuments,83);for(const p of report.pages)assert.ok(pages.some(d=>d.id===p.id));
 personas.searchIndex.sync('interior-show',pages);
 const result={at:new Date().toISOString(),archiveFilesVerified:inventory.archives.length,extractedItemsVerified:verified.length,folderDuplicatesVerified:inventory.folderComparisons.length,transcriptVideosVerified:transcriptVideos,pdfOriginalsVerified:pdfs.length,pdfPagesVerified:pdfPages,ocrPagesProcessed:report.ocrPages,encyclopediaDocumentsVerified:report.encyclopediaDocuments,encyclopediaImagesVerified:assets,unavailableTranscriptVideos:report.unavailableTranscripts,personalWikiDocuments:pages.length,publishedKnowledgeDocuments:pages.filter(p=>p.status==='published').length,searchablePassages:store.db.prepare('SELECT COUNT(*) n FROM expert_search_chunks WHERE person_id=?').get('interior-show').n,sharedWikiUnchangedDuringImport:report.sharedUnchanged,passed:true};
 writeFileSync(join(pack,'audit.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{store.close();}
