import {randomUUID,createHash} from 'node:crypto';
const unpack=r=>r?JSON.parse(r.data):null;
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const memberLabel=uid=>'회원 '+createHash('sha256').update(uid).digest('hex').slice(0,6);
const redact=s=>String(s).replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[이메일 생략]').replace(/\b01[016789][ -]?\d{3,4}[ -]?\d{4}\b/g,'[연락처 생략]');

/** Explicit owner review endpoints; member room APIs retain their existing isolation. */
export class PersonalConversations{
  constructor(personas){this.p=personas;this.store=personas.store;this.db=personas.db;this.db.exec('CREATE TABLE IF NOT EXISTS expert_corrections(person_id TEXT NOT NULL,message_id TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(person_id,message_id));');}
  /** Name and sign-in email once the member has chatted since this was added; older rooms stay anonymous until then. */
  member(uid){const m=this.db.prepare('SELECT name,email FROM expert_members WHERE uid=?').get(uid);if(!m)return memberLabel(uid);return [m.name,m.email].filter(Boolean).join(' · ');}
  manage(personId,actor){const profile=this.p.profile(personId);this.p.manage(profile,actor);return profile;}
  room(personId,roomId,actor){this.manage(personId,actor);return this.db.prepare('SELECT * FROM expert_rooms WHERE id=? AND person_id=?').get(roomId,personId)??fail('이 지식 공간의 대화가 아닙니다.',404);}
  corrections(personId){return this.db.prepare('SELECT data FROM expert_corrections WHERE person_id=?').all(personId).map(unpack).filter(c=>!c.deletedAt);}
  rooms(personId,actor){
    this.manage(personId,actor);const corrections=this.corrections(personId);
    return this.db.prepare('SELECT * FROM expert_rooms WHERE person_id=? ORDER BY updated_at DESC LIMIT 200').all(personId).map(r=>({id:r.id,title:r.title,updatedAt:r.updated_at,member:this.member(r.member_uid),messageCount:this.db.prepare('SELECT COUNT(*) n FROM expert_messages WHERE room_id=?').get(r.id).n,lastQuestion:unpack(this.db.prepare("SELECT data FROM expert_messages WHERE room_id=? AND role='user' ORDER BY rowid DESC LIMIT 1").get(r.id))?.content||'',correctedCount:corrections.filter(c=>c.roomId===r.id).length}));
  }
  view(personId,roomId,actor){
    const r=this.room(personId,roomId,actor),corrections=new Map(this.corrections(personId).map(c=>[c.messageId,c]));
    return {id:r.id,title:r.title,updatedAt:r.updated_at,member:this.member(r.member_uid),messages:this.db.prepare('SELECT data FROM expert_messages WHERE room_id=? ORDER BY rowid').all(r.id).map(unpack).map(m=>({...m,...(corrections.has(m.id)?{correction:corrections.get(m.id)}:{})}))};
  }
  correct(personId,body,actor){
    const profile=this.manage(personId,actor),r=this.room(personId,body.roomId,actor);
    const record=this.db.prepare('SELECT rowid,data,role FROM expert_messages WHERE room_id=? AND id=?').get(r.id,body.messageId),message=unpack(record);
    if(!message||record.role!=='assistant'||message.kind==='greeting')fail('보완할 실제 답변을 선택해 주세요.');
    const previous=unpack(this.db.prepare("SELECT data FROM expert_messages WHERE room_id=? AND role='user' AND rowid<? ORDER BY rowid DESC LIMIT 1").get(r.id,record.rowid));
    if(!previous)fail('연결된 질문을 찾지 못했습니다.');
    if(typeof body.content!=='string'||!body.content.trim()||body.content.length>30000)fail('보완 내용을 1~30,000자로 작성해 주세요.');
    const content=redact(body.content.trim()),question=redact(typeof body.question==='string'&&body.question.trim()?body.question.trim().slice(0,6000):previous.content);
    const old=unpack(this.db.prepare('SELECT data FROM expert_corrections WHERE person_id=? AND message_id=?').get(personId,message.id));
    const at=new Date().toISOString();let result;
    this.store.transaction(()=>{
      const oldPage=old?this.p.pages(personId).find(p=>p.id===old.pageId):null;
      const id=old?.id||randomUUID(),page=this.p.savePage(personId,{draft:{title:'답변 보완 · '+question.replace(/\s+/g,' ').slice(0,60),content:`## 질문\n\n${question}\n\n## 보완된 답변\n\n${content}`,category:'답변 보완',tags:['소유자 보완','질의응답'],status:'published',entryType:'article',pinned:false,cover:'auto',sources:[{id:'owner-correction:'+id,kind:'knowledge',title:profile.name+' 직접 보완'}]},options:{...(oldPage?{id:oldPage.id}:{}),expectedVersion:oldPage?.version||0,reason:'소유자가 대화 답변을 보완하여 개인 지식에 반영'}},actor);
      result={id,messageId:message.id,roomId:r.id,pageId:page.id,question,content,author:actor.name||profile.name,createdAt:old?.createdAt||at,updatedAt:at};
      this.db.prepare('INSERT INTO expert_corrections VALUES(?,?,?) ON CONFLICT(person_id,message_id) DO UPDATE SET data=excluded.data').run(personId,message.id,JSON.stringify(result));
      this.p.searchIndex.sync(personId,this.p.pages(personId));
    });
    return {correction:result};
  }
  remove(personId,messageId,actor){
    this.manage(personId,actor);const old=unpack(this.db.prepare('SELECT data FROM expert_corrections WHERE person_id=? AND message_id=?').get(personId,messageId));
    if(!old||old.deletedAt)return {deleted:true};
    this.store.transaction(()=>{
      const page=this.p.pages(personId).find(p=>p.id===old.pageId);
      if(page&&page.status!=='archived')this.p.savePage(personId,{draft:{...page,status:'archived'},options:{id:page.id,expectedVersion:page.version,reason:'소유자가 답변 보완을 철회'}},actor);
      this.db.prepare('UPDATE expert_corrections SET data=? WHERE person_id=? AND message_id=?').run(JSON.stringify({...old,deletedAt:new Date().toISOString()}),personId,messageId);
      this.p.searchIndex.sync(personId,this.p.pages(personId));
    });return {deleted:true};
  }
}
