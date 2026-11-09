import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync,readFileSync,existsSync } from 'node:fs';
import { join } from 'node:path';
import { atomicFile } from './store.mjs';
import { PersonalWikiSearch } from './persona-search.mjs';
import { PersonalConversations } from './persona-conversations.mjs';

const BUILTIN = {id:'interior-show',name:'인테리어쇼 대표',role:'주거 실내건축 · 개인 AI',bio:'자료와 경험을 쌓고, 생각을 나누는 인테리어쇼 대표의 개인 지식 공간입니다.',video:'/media/representative/interior-show-greeting.webm',animation:'/media/representative/interior-show-greeting.webp',poster:'/media/representative/interior-show-poster.png',published:true,version:1,ownerUid:'',voice:'',principles:'',suggestions:['주거 공간을 계획할 때 무엇부터 정리하면 좋을까요?','디자인과 실제 생활의 편리함을 어떻게 맞추면 좋을까요?','공사를 시작하기 전에 어떤 질문을 해봐야 할까요?']};
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const text=(v,max=2000)=>typeof v==='string'?v.trim().slice(0,max):'';
const unpack=r=>r?JSON.parse(r.data):null;
const safeId=id=>typeof id==='string'&&/^[\w-]{1,100}$/.test(id);
function publicProfile(p,docs,styleVersion){const {ownerUid,voice,principles,...rest}=p;return {...rest,documentCount:docs.filter(d=>d.status==='published'&&!isVoice(d)).length,voiceReady:Boolean(voice||styleVersion||docs.some(d=>d.status==='published'&&isVoice(d))),styleVersion};}
const isVoice=p=>p.category==='페르소나'||p.tags?.some(t=>['말투','페르소나','말투 자료'].includes(t));
export class PersonaStore {
  constructor(store){
    this.store=store;this.db=store.db;
    this.db.exec(`CREATE TABLE IF NOT EXISTS expert_profiles(id TEXT PRIMARY KEY,data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS expert_pages(person_id TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(person_id,id));
      CREATE TABLE IF NOT EXISTS expert_revisions(person_id TEXT NOT NULL,page_id TEXT NOT NULL,version INTEGER NOT NULL,data TEXT NOT NULL,PRIMARY KEY(person_id,page_id,version));
      CREATE TABLE IF NOT EXISTS expert_rooms(id TEXT PRIMARY KEY,member_uid TEXT NOT NULL,person_id TEXT NOT NULL,title TEXT NOT NULL,updated_at TEXT NOT NULL,pending_id TEXT,lease_until INTEGER);
      CREATE INDEX IF NOT EXISTS expert_room_member ON expert_rooms(member_uid,person_id,updated_at);
      CREATE TABLE IF NOT EXISTS expert_messages(id TEXT PRIMARY KEY,room_id TEXT NOT NULL,role TEXT NOT NULL,state TEXT NOT NULL,data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS expert_message_room ON expert_messages(room_id);
      CREATE TABLE IF NOT EXISTS expert_members(uid TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL,updated_at TEXT NOT NULL);`);
    this.db.prepare('INSERT OR IGNORE INTO expert_profiles VALUES(?,?)').run(BUILTIN.id,JSON.stringify(BUILTIN));
    this.searchIndex=new PersonalWikiSearch(store);
    this.conversations=new PersonalConversations(this);
  }
  profile(id){if(!safeId(id))fail('인물 식별자가 올바르지 않습니다.');return unpack(this.db.prepare('SELECT data FROM expert_profiles WHERE id=?').get(id))??fail('인물 공간을 찾지 못했습니다.',404);}
  canManage(p,actor){return Boolean(actor?.uid&&(actor.admin||p.ownerUid===actor.uid));}
  manage(p,actor){if(!this.canManage(p,actor))fail('본인에게 배정된 지식 공간만 관리할 수 있습니다.',403);}
  view(p,actor){if(!p.published&&!this.canManage(p,actor))fail('공개되지 않은 인물 공간입니다.',404);}
  requireMember(actor){if(!actor?.uid)fail('회원 로그인이 필요합니다.',401);}
  /** Who is asking, for the owning executive's conversation log. Taken from the verified sign-in token. */
  rememberMember(actor){const name=text(actor?.name,60),email=text(actor?.email,120);if(!actor?.uid||(!name&&!email))return;this.db.prepare('INSERT INTO expert_members VALUES(?,?,?,?) ON CONFLICT(uid) DO UPDATE SET name=excluded.name,email=excluded.email,updated_at=excluded.updated_at').run(actor.uid,name,email,new Date().toISOString());}
  pages(id){return this.db.prepare('SELECT data FROM expert_pages WHERE person_id=? ORDER BY rowid DESC').all(id).map(unpack);}
  directory(actor){return this.db.prepare('SELECT data FROM expert_profiles ORDER BY rowid').all().map(unpack).filter(p=>p.published||this.canManage(p,actor)).map(p=>publicProfile(p,this.pages(p.id),this.stylePack(p.id)?.version));}
  saveProfile(input,actor){
    if(!actor?.admin)fail('관리자만 공간과 소유자를 배정할 수 있습니다.',403);
    const id=input.id||randomUUID();if(!safeId(id))fail('인물 식별자가 올바르지 않습니다.');
    const old=unpack(this.db.prepare('SELECT data FROM expert_profiles WHERE id=?').get(id));
    if((old?.version??0)!==input.expectedVersion)fail('프로필이 변경되었습니다. 새로고침 후 저장해 주세요.',409);
    if(!text(input.name,100))fail('이름을 입력해 주세요.');
    const media=(v)=>{const s=text(v,500);if(s&&!s.startsWith('/media/')&&!/^https:\/\//.test(s))fail('프로필 미디어 주소가 올바르지 않습니다.');return s;};
    const next={...old,id,name:text(input.name,100),role:text(input.role,150),bio:text(input.bio,2000),ownerUid:text(input.ownerUid,128),published:input.published===true,video:media(input.video),animation:media(input.animation),poster:media(input.poster),voice:text(input.voice,16000),principles:text(input.principles,6000),suggestions:(Array.isArray(input.suggestions)?input.suggestions:BUILTIN.suggestions).map(s=>text(s,200)).filter(Boolean).slice(0,6),version:(old?.version??0)+1,updatedAt:new Date().toISOString()};
    this.db.prepare('INSERT INTO expert_profiles VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(id,JSON.stringify(next));
    this.exportProfile(next);return next;
  }
  exportProfile(profile){const root=join(this.store.root,'experts',profile.id);mkdirSync(root,{recursive:true});atomicFile(join(root,'profile.json'),JSON.stringify(profile,null,2));}
  saveVoice(id,body,actor){const p=this.profile(id);this.manage(p,actor);if(p.version!==body.expectedVersion)fail('프로필이 변경되었습니다.',409);const next={...p,voice:text(body.voice,16000),principles:text(body.principles,6000),version:p.version+1,updatedAt:new Date().toISOString()};this.db.prepare('UPDATE expert_profiles SET data=? WHERE id=?').run(JSON.stringify(next),id);this.exportProfile(next);return next;}
  savePage(id,body,actor){
    const person=this.profile(id);this.manage(person,actor);const input=body.draft??{},options=body.options??{};
    const pageId=options.id||randomUUID();if(!safeId(pageId))fail('문서 식별자가 올바르지 않습니다.');
    const page=this.store.transaction(()=>{
      const old=unpack(this.db.prepare('SELECT data FROM expert_pages WHERE person_id=? AND id=?').get(id,pageId));
      if((old?.version??0)!==options.expectedVersion||(options.id&&!old))fail('다른 창에서 문서가 수정되었습니다.',409);
      const title=text(input.title,200);if(!title||typeof input.content!=='string'||input.content.length>120000)fail('제목과 본문을 확인해 주세요.');
      if(!['draft','review','published','archived'].includes(input.status))fail('문서 상태가 올바르지 않습니다.');
      const at=new Date().toISOString();const next={...input,id:pageId,title,content:input.content,workspaceId:id,ownerUid:person.ownerUid,version:(old?.version??0)+1,createdAt:old?.createdAt??at,updatedAt:at,updatedBy:actor.name||actor.email||actor.uid,aliases:[...new Set([...(old?.aliases??[]),...(Array.isArray(input.aliases)?input.aliases.map(a=>text(a,200)):[]),...(old&&old.title!==title?[old.title]:[])])],tags:(Array.isArray(input.tags)?input.tags:[]).map(t=>text(t,40)).slice(0,20),sources:(Array.isArray(input.sources)?input.sources:[]).slice(0,40),category:text(input.category,50)||'일반',entryType:input.entryType||'article',cover:input.cover||'auto',pinned:Boolean(input.pinned)};
      this.db.prepare('INSERT INTO expert_pages VALUES(?,?,?) ON CONFLICT(person_id,id) DO UPDATE SET data=excluded.data').run(id,pageId,JSON.stringify(next));
      this.db.prepare('INSERT INTO expert_revisions VALUES(?,?,?,?)').run(id,pageId,next.version,JSON.stringify({...next,revisionId:pageId+'-'+next.version,reason:text(options.reason)||'개인 위키 저장'}));return next;
    });
    const dir=join(this.store.root,'experts',id,'wiki');mkdirSync(dir,{recursive:true});atomicFile(join(dir,page.id+'.md'),`# ${page.title}\n\n${page.content}\n`);return page;
  }
  room(id,actor){this.requireMember(actor);const r=this.db.prepare('SELECT * FROM expert_rooms WHERE id=? AND member_uid=?').get(id,actor.uid);if(!r)fail('대화방을 찾지 못했습니다.',404);const p=this.profile(r.person_id);this.view(p,actor);return r;}
  messages(room){return this.db.prepare('SELECT data FROM expert_messages WHERE room_id=? ORDER BY rowid DESC LIMIT 80').all(room.id).map(unpack).reverse();}
  replyHistory(room){
    // Keep the initial description of the member's home as the chat grows. These
    // are original private messages, never added to an expert's shared knowledge.
    const early=this.db.prepare('SELECT data FROM expert_messages WHERE room_id=? ORDER BY rowid LIMIT 10').all(room.id).map(unpack);
    const recent=this.db.prepare('SELECT data FROM expert_messages WHERE room_id=? ORDER BY rowid DESC LIMIT 24').all(room.id).map(unpack).reverse();
    return [...new Map([...early,...recent].map(m=>[m.id,m])).values()].filter(m=>m.state==='complete'&&(m.role==='user'||m.kind==='greeting'||['social','grounded','wiki_first','general'].includes(m.grounding)||m.sources?.length)).map(m=>({role:m.role,content:m.content}));
  }
  roomView(r,messages=false){return {id:r.id,personId:r.person_id,title:r.title,updatedAt:r.updated_at,...(messages?{messages:this.messages(r)}:{})};}
  createRoom(id,actor){
    this.requireMember(actor);const p=this.profile(id);this.view(p,actor);this.rememberMember(actor);
    if(this.db.prepare('SELECT COUNT(*) n FROM expert_rooms WHERE member_uid=?').get(actor.uid).n>=200)fail('대화방은 200개까지 보관할 수 있습니다.');
    const r={id:randomUUID(),person_id:id,member_uid:actor.uid,title:'새 대화',updated_at:new Date().toISOString()};
    this.store.transaction(()=>{
      this.db.prepare('INSERT INTO expert_rooms(id,member_uid,person_id,title,updated_at) VALUES(?,?,?,?,?)').run(r.id,r.member_uid,id,r.title,r.updated_at);
      const greeting={id:randomUUID(),role:'assistant',state:'complete',content:id==='interior-show'?'유튜브 친구 안녕~':`${p.name}의 개인 대화 공간입니다. 편하게 질문해 주세요.`,createdAt:r.updated_at,sources:[],kind:'greeting'};
      this.db.prepare('INSERT INTO expert_messages VALUES(?,?,?,?,?)').run(greeting.id,r.id,greeting.role,greeting.state,JSON.stringify(greeting));
    });
    return this.roomView(r,true);
  }
  stylePack(id){
    const root=join(this.store.root,'experts',id,'style-packs'),active=join(root,'active.json');
    if(!existsSync(active))return null;
    const meta=JSON.parse(readFileSync(active,'utf8'));if(!/^v[0-9]+$/.test(meta.version))return null;
    return JSON.parse(readFileSync(join(root,meta.version,'compiled-style.json'),'utf8'));
  }
  styleContext(id,question){
    const pack=this.stylePack(id);if(!pack)return {text:'',version:null};
    const words=question.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu)??[];
    const examples=[...(pack.signatureExamples??[]),...(pack.generalExamples??[])].map((e,i)=>({e,score:words.reduce((n,w)=>n+(JSON.stringify(e.messages).toLowerCase().includes(w)?1:0),0)+(i<12?.25:0)})).sort((a,b)=>b.score-a.score).slice(0,3).map(v=>v.e);
    return {version:pack.version,text:[`소유자가 제공한 말투사전 ${pack.version}. 아래 예시는 합성된 문체 예시이며 실제 발언·기술 사실의 근거가 아닙니다.`,
      '대화 설정: '+JSON.stringify(pack.defaults),
      '적용 규칙: '+JSON.stringify(pack.rules.filter(r=>r.id!=='S14').map(r=>({name:r.name,rule:r.implementation}))),
      '시그니처 어휘의 용도와 조건: '+JSON.stringify(pack.lexicon),
      '사물 지칭: '+JSON.stringify(pack.objects),
      '대화 전개: '+JSON.stringify(pack.templates),
      '현재 질문과 가까운 문체 예시(실제 원화자 인용 아님): '+JSON.stringify(examples.map(e=>e.messages))].join('\n\n')};
  }
  retrieve(person,question){
    const docs=this.pages(person.id).filter(p=>p.status==='published');
    const voice=docs.filter(isVoice).slice(0,6).map(p=>`${p.title}\n${p.content.slice(0,3000)}`).join('\n\n');
    const hits=this.searchIndex.search(person.id,this.pages(person.id),question);
    const style=this.styleContext(person.id,question);
    return {voice:[voice,style.text].filter(Boolean).join('\n\n'),styleVersion:style.version,sources:hits.map((h,i)=>({id:h.p.id,title:h.p.title,personId:person.id,personName:person.name,version:h.p.version,excerpt:h.text,updatedAt:h.p.updatedAt,url:h.url,timestamp:h.timestamp,attribution:h.attribution,pages:h.pages,chunkIndex:h.chunkIndex,ownerCorrection:h.ownerCorrection,ref:i+1}))};
  }
  begin(id,body,actor){
    const question=text(body.question,6000);if(!question)fail('질문을 입력해 주세요.');if(!safeId(body.requestId))fail('요청 식별자가 올바르지 않습니다.');
    const r=this.room(id,actor),p=this.profile(r.person_id);this.rememberMember(actor);
    const previousQuestion=this.messages(r).filter(m=>m.role==='user').at(-1)?.content;
    const lookup=previousQuestion&&/^(그럼|그러면|그런데|근데|그건|그게|이건|아까|그거|그렇게)/.test(question)?previousQuestion+'\n'+question:question;
    const context=this.retrieve(p,lookup),at=new Date().toISOString();const requestId=body.requestId;
    this.store.transaction(()=>{const current=this.room(id,actor);if(current.lease_until>Date.now()&&current.pending_id)fail('이 대화방에서 답변을 작성하고 있습니다.',409);if(this.db.prepare('SELECT id FROM expert_messages WHERE id=?').get(requestId))fail('이미 보낸 요청입니다.',409);
      const message={id:requestId,role:'user',content:question,state:'complete',createdAt:at,sources:[]};
      this.db.prepare('INSERT INTO expert_messages VALUES(?,?,?,?,?)').run(requestId,id,'user','complete',JSON.stringify(message));
      this.db.prepare('UPDATE expert_rooms SET title=?,updated_at=?,pending_id=?,lease_until=? WHERE id=?').run(r.title==='새 대화'?question.slice(0,50):r.title,at,requestId,Date.now()+180000,id);
    });
    return {profile:p,context,requestId,roomId:id,messages:this.replyHistory(r)};
  }
  finish(id,body,actor){const r=this.room(id,actor);if(r.pending_id!==body.requestId)fail('응답 요청이 일치하지 않습니다.',409);const content=text(body.content,50000),state=body.error?'error':'complete';if(!content&&!body.error)fail('빈 답변은 저장할 수 없습니다.');const m={id:randomUUID(),role:'assistant',content,state,createdAt:new Date().toISOString(),sources:Array.isArray(body.sources)?body.sources:[],profileVersion:body.profileVersion,styleVersion:body.styleVersion,grounding:['grounded','not_found','social','wiki_first','general'].includes(body.grounding)?body.grounding:undefined,error:body.error?text(body.error,500):undefined};this.store.transaction(()=>{this.db.prepare('INSERT INTO expert_messages VALUES(?,?,?,?,?)').run(m.id,id,m.role,state,JSON.stringify(m));this.db.prepare('UPDATE expert_rooms SET pending_id=NULL,lease_until=NULL,updated_at=? WHERE id=?').run(m.createdAt,id);});return m;}
  async importDraft(id,body,actor){
    this.manage(this.profile(id),actor);
    const name=text(body.name,200);if(!/\.(pdf|md|txt)$/i.test(name))fail('PDF, Markdown, TXT 자료를 올려 주세요.');
    const bytes=Buffer.from(String(body.base64||''),'base64');if(!bytes.length||bytes.length>10*1024*1024)fail('원본 파일은 10MB까지 올릴 수 있습니다.');
    const sourceId=createHash('sha256').update(bytes).digest('hex'),extension=name.split('.').pop().toLowerCase();
    const root=join(this.store.root,'experts',id,'raw');mkdirSync(root,{recursive:true});atomicFile(join(root,sourceId+'.'+extension),bytes);
    atomicFile(join(root,sourceId+'.json'),JSON.stringify({name,extension,sourceId}));
    let content='';if(extension==='pdf'){const {PDFParse}=await import('pdf-parse');const parser=new PDFParse({data:new Uint8Array(bytes)});try{const result=await parser.getText();content=result.pages.map(p=>`## ${p.num}쪽\n\n${p.text}`).join('\n\n');}finally{await parser.destroy();}}else content=bytes.toString('utf8');
    if(!content.trim())fail('텍스트를 읽을 수 없습니다. 원본은 보존했으며 스캔 PDF는 OCR이 필요합니다.');
    if(content.length>120000)fail('본문이 120,000자를 넘습니다. 원본은 보존했으며 문서를 나눠 올려 주세요.');
    return {title:name.replace(/\.[^.]+$/,''),content,category:body.kind==='voice'?'페르소나':'일반',tags:body.kind==='voice'?['말투 자료']:[],status:'review',entryType:'source',pinned:false,cover:'auto',sources:[{id:sourceId,kind:'file',title:name,storage:'server',fileKey:extension,excerpt:'개인 지식 공간에 원본 파일을 보존했습니다.'}]};
  }
  original(id,body,actor){this.manage(this.profile(id),actor);if(!/^[a-f0-9]{64}$/.test(body.sourceId))fail('원본을 찾지 못했습니다.',404);const root=join(this.store.root,'experts',id,'raw');let meta;try{meta=JSON.parse(readFileSync(join(root,body.sourceId+'.json'),'utf8'));}catch{fail('원본을 찾지 못했습니다.',404);}return {name:meta.name,base64:readFileSync(join(root,body.sourceId+'.'+meta.extension)).toString('base64')};}
  dispatch(body){
    const actor=body.actor,pid=body.personId,action=body.action;
    if(action==='directory')return {profiles:this.directory(actor)};
    if(action==='profile'){const p=this.profile(pid);this.view(p,actor);return {profile:publicProfile(p,this.pages(pid),this.stylePack(pid)?.version),canManage:this.canManage(p,actor)};}
    if(action==='saveProfile')return this.saveProfile(body.profile??{},actor);
    if(action==='ownerRooms')return this.conversations.rooms(pid,actor);
    if(action==='ownerRoom')return this.conversations.view(pid,body.roomId,actor);
    if(action==='correctAnswer')return this.conversations.correct(pid,body,actor);
    if(action==='deleteCorrection')return this.conversations.remove(pid,body.messageId,actor);
    if(action==='settings'){const p=this.profile(pid);this.manage(p,actor);return p;}
    if(action==='saveVoice')return this.saveVoice(pid,body,actor);
    if(action==='importDraft')return this.importDraft(pid,body,actor);
    if(action==='original')return this.original(pid,body,actor);
    if(action==='pages'){this.manage(this.profile(pid),actor);return this.pages(pid);}
    if(action==='savePage')return this.savePage(pid,body,actor);
    if(action==='history'){this.manage(this.profile(pid),actor);return this.db.prepare('SELECT data FROM expert_revisions WHERE person_id=? AND page_id=? ORDER BY version DESC').all(pid,body.pageId).map(unpack);}
    if(action==='source'){this.requireMember(actor);const p=this.profile(pid);this.view(p,actor);const page=this.pages(pid).find(p=>p.id===body.pageId);if(!page||(page.status!=='published'&&!this.canManage(p,actor)))fail('공유된 출처를 찾지 못했습니다.',404);return page;}
    if(action==='rooms'){this.requireMember(actor);this.view(this.profile(pid),actor);return this.db.prepare('SELECT * FROM expert_rooms WHERE member_uid=? AND person_id=? ORDER BY updated_at DESC LIMIT 200').all(actor.uid,pid).map(r=>this.roomView(r));}
    if(action==='createRoom')return this.createRoom(pid,actor);
    if(action==='room')return this.roomView(this.room(body.roomId,actor),true);
    if(action==='deleteRoom'){const r=this.room(body.roomId,actor);this.store.transaction(()=>{this.db.prepare('DELETE FROM expert_messages WHERE room_id=?').run(r.id);this.db.prepare('DELETE FROM expert_rooms WHERE id=?').run(r.id);});return {deleted:true};}
    if(action==='searchEvidence'){const r=this.room(body.roomId,actor);return this.retrieve(this.profile(r.person_id),text(body.query,2000));}
    if(action==='readEvidence'){const r=this.room(body.roomId,actor);return this.searchIndex.read(r.person_id,this.pages(r.person_id),body.pageId,body.chunkIndex)??fail('공유된 원문을 찾지 못했습니다.',404);}
    if(action==='knowledgeCatalog'){const r=this.room(body.roomId,actor);return this.pages(r.person_id).filter(p=>p.status==='published'&&!isVoice(p)).map(p=>({id:p.id,title:p.title,category:p.category})).slice(0,400);}
    if(action==='begin')return this.begin(body.roomId,body,actor);
    if(action==='finish')return this.finish(body.roomId,body,actor);
    fail('지원하지 않는 요청입니다.');
  }
}
