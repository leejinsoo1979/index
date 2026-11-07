import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync,rmSync,readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WikiStore } from '../server/wiki/store.mjs';
import { PersonaStore } from '../server/wiki/persona-store.mjs';
import { randomUUID } from 'node:crypto';
import { personalEvidenceChunks } from '../server/wiki/persona-evidence.mjs';
const admin={uid:'admin',admin:true,name:'관리자'},owner={uid:'owner'},other={uid:'other'},member={uid:'member'};
function fixture(fn){const root=mkdtempSync(join(tmpdir(),'index-personas-'));const store=new WikiStore(root),p=new PersonaStore(store);return Promise.resolve().then(()=>fn(p,store,root)).finally(()=>{store.close();rmSync(root,{recursive:true,force:true});});}
const profile=(id='interior-show')=>({id,name:'인테리어쇼 대표',role:'주거 실내건축',ownerUid:'owner',published:true,video:'',poster:'',voice:'',principles:'',expectedVersion:1});
const page=(title='수납 동선',content='냉장고 문과 통행 동선을 먼저 확인합니다.',status='published')=>({title,content,status,category:'공간',tags:[],sources:[]});
await test('only administrators allocate spaces; only the assigned owner or administrator reads settings or unpublished knowledge',()=>fixture(p=>{
 assert.equal(p.directory(null)[0].voiceReady,false);
 assert.throws(()=>p.saveProfile(profile(),owner),e=>e.status===403);
 const saved=p.saveProfile(profile(),admin);assert.equal(saved.ownerUid,'owner');
 assert.throws(()=>p.dispatch({action:'settings',personId:saved.id,actor:other}),e=>e.status===403);
 assert.equal(p.dispatch({action:'settings',personId:saved.id,actor:owner}).name,saved.name);
 const publicValue=p.directory(member)[0];assert.ok(!('ownerUid'in publicValue));assert.ok(!('voice'in publicValue));
}));
await test('facts and voice examples never mix; review drafts and another person’s pages never become this person’s evidence',()=>fixture(p=>{
 p.saveProfile(profile(),admin);
 const a=p.savePage('interior-show',{draft:page(),options:{expectedVersion:0}},owner);
 p.savePage('interior-show',{draft:page('비공개','냉장고 문 비공개 치수', 'review'),options:{expectedVersion:0}},owner);
 p.savePage('interior-show',{draft:{...page('말투','냉장고 문을 확인하라는 말투 예시'),tags:['말투 자료']},options:{expectedVersion:0}},owner);
 const second=p.saveProfile({...profile('second'),ownerUid:'other',name:'다른 전문가',expectedVersion:0},admin);
 p.savePage(second.id,{draft:page('다른 사람의 경험','냉장고 문은 다른 사람 경험입니다.'),options:{expectedVersion:0}},other);
 const result=p.retrieve(p.profile('interior-show'),'냉장고 문');
 assert.equal(result.sources.length,1);assert.equal(result.sources[0].id,a.id);assert.equal(result.sources[0].personName,'인테리어쇼 대표');assert.match(result.voice,/말투 예시/);
 assert.equal(p.store.pages().length,0);assert.equal(p.store.status().events,0);
}));
await test('room identity comes from authenticated membership and persists across restart; other members cannot read, append, or delete it',()=>fixture((p,store,root)=>{
 const r=p.createRoom('interior-show',member);
 assert.equal(r.messages[0].content,'유튜브 친구 안녕~');
 assert.equal(r.messages.length,1);
 for(const action of ['room','begin','deleteRoom'])assert.throws(()=>p.dispatch({action,roomId:r.id,actor:other,question:'질문',requestId:randomUUID()}),e=>e.status===404);
 p.begin(r.id,{question:'수납 동선을 봐주세요',requestId:randomUUID()},member);
 const second=new WikiStore(root);try{const restored=new PersonaStore(second);assert.equal(restored.dispatch({action:'room',roomId:r.id,actor:member}).messages.at(-1).content,'수납 동선을 봐주세요');}finally{second.close();}
 assert.equal(p.dispatch({action:'rooms',personId:'interior-show',actor:other}).length,0);
}));
await test('concurrent chat turns cannot overwrite each other; source versions and excerpts remain attached to the original reply',()=>fixture(p=>{
 p.saveProfile(profile(),admin);const doc=p.savePage('interior-show',{draft:page(),options:{expectedVersion:0}},owner);const room=p.createRoom('interior-show',member),requestId=randomUUID();
 const prepared=p.begin(room.id,{question:'수납 동선을 알려주세요',requestId},member);
 assert.throws(()=>p.begin(room.id,{question:'두 번째',requestId:randomUUID()},member),e=>e.status===409);
 assert.throws(()=>p.finish(room.id,{requestId:'wrong',content:'답변'},member),e=>e.status===409);
 p.finish(room.id,{requestId,content:'통행 동선을 먼저 확인합니다. [1]',sources:prepared.context.sources},member);
 p.savePage('interior-show',{draft:{...doc,content:'새롭게 수정한 기록입니다.'},options:{id:doc.id,expectedVersion:1}},owner);
 const reply=p.dispatch({action:'room',roomId:room.id,actor:member}).messages.at(-1);
 assert.equal(reply.sources[0].version,1);assert.match(reply.sources[0].excerpt,/통행 동선/);assert.equal(p.pages('interior-show')[0].version,2);
 p.saveVoice('interior-show',{expectedVersion:2,voice:'이유를 먼저 설명합니다.',principles:'생활 동선'},owner);
 const next=p.begin(room.id,{question:'다음 질문',requestId:randomUUID()},member);assert.equal(next.profile.voice,'이유를 먼저 설명합니다.');
}));
await test('owner uploads preserve exact original bytes within that space and require explicit review before answer retrieval',()=>fixture(async(p,store,root)=>{
 p.saveProfile(profile(),admin);const raw='## 냉장고\n\n문을 열고 통행을 확인합니다.';const draft=await p.importDraft('interior-show',{name:'현장.md',base64:Buffer.from(raw).toString('base64')},owner);
 assert.equal(draft.status,'review');assert.equal(draft.content,raw);
 const original=p.original('interior-show',{sourceId:draft.sources[0].id},owner);assert.equal(Buffer.from(original.base64,'base64').toString(),raw);
 assert.throws(()=>p.original('interior-show',{sourceId:draft.sources[0].id},member),e=>e.status===403);
 p.savePage('interior-show',{draft,options:{expectedVersion:0}},owner);assert.equal(p.retrieve(p.profile('interior-show'),'냉장고').sources.length,0);
 assert.equal(readFileSync(join(root,'experts','interior-show','raw',draft.sources[0].id+'.md'),'utf8'),raw);
 assert.equal(store.status().sources,0);
}));

await test('YouTube answers use exact timestamped transcript, not generated note summaries or navigation pages',()=>fixture(p=>{
 const raw='[01:02 - 01:08] 아일랜드를 크게 놓으면 통로가 좁아집니다.\n[01:08 - 01:15] 이 현장에서는 통로부터 확인했습니다.';
 const draft={...page('아일랜드 원문',`발언 출처: 채널 자료 · 게스트\n\n## 원문 자막\n\n${raw}\n\n## 참고 정리\n\n아일랜드 통로는 반드시 999cm라는 합성 요약입니다.`),tags:['유튜브 원문'],sources:[{kind:'knowledge',href:'https://www.youtube.com/watch?v=abcdefghijk'}]};
 const chunks=personalEvidenceChunks(draft);assert.equal(chunks.length,1);assert.equal(chunks[0].text,raw);assert.equal(chunks[0].timestamp,'01:02 - 01:08');assert.equal(chunks[0].attribution,'채널 자료 · 게스트');
 p.savePage('interior-show',{draft,options:{expectedVersion:0}},admin);
 const sources=p.retrieve(p.profile('interior-show'),'아일랜드 통로').sources;assert.equal(sources.length,1);assert.ok(!sources[0].excerpt.includes('999'));assert.equal(sources[0].url,'https://www.youtube.com/watch?v=abcdefghijk');
 assert.equal(personalEvidenceChunks({...draft,tags:['유튜브 목차']}).length,0);
}));

await test('legacy unsupported assistant claims do not become evidence in a later turn',()=>fixture(p=>{
 const room=p.createRoom('interior-show',member),requestId=randomUUID();p.begin(room.id,{question:'첫 질문',requestId},member);
 p.finish(room.id,{requestId,content:'내가 모든 현장을 직접 봤다는 오래된 근거 없는 답변',sources:[]},member);
 const next=p.begin(room.id,{question:'그럼 다음은?',requestId:randomUUID()},member);
 assert.ok(!next.messages.some(m=>m.content.includes('오래된 근거 없는')));assert.ok(next.messages.some(m=>m.content==='유튜브 친구 안녕~'));
}));

await test('the initial home description stays in later conversation context without leaking into another room or the expert wiki',()=>fixture(p=>{
 const room=p.createRoom('interior-show',member);
 for(let i=0;i<18;i++){
  const requestId=randomUUID();p.begin(room.id,{question:i===0?'32평 아파트에 네 식구가 살고 주방은 ㄷ자야.':'생활 동선 이야기 '+i,requestId},member);
  p.finish(room.id,{requestId,content:'공간을 쓰는 순서를 생각해 보자.',sources:[],grounding:'general'},member);
 }
 const next=p.begin(room.id,{question:'그럼 우리 집에서는 어떻게 할까?',requestId:randomUUID()},member);
 assert.ok(next.messages.some(m=>m.content.includes('32평 아파트')));
 const otherRoom=p.createRoom('interior-show',other);
 assert.ok(!p.replyHistory(otherRoom).some(m=>m.content.includes('32평')));
 assert.equal(p.pages('interior-show').length,0);assert.equal(p.store.pages().length,0);
}));
