import {createHash} from 'node:crypto';
import {terms} from './retrieval/index.mjs';
import {personalEvidenceChunks} from './persona-evidence.mjs';

const isVoice=p=>p.category==='페르소나'||p.tags?.some(t=>['말투','페르소나','말투 자료'].includes(t));
export class PersonalWikiSearch{
  constructor(store){
    this.store=store;this.db=store.db;
    this.db.exec(`CREATE TABLE IF NOT EXISTS expert_search_docs(person_id TEXT NOT NULL,page_id TEXT NOT NULL,hash TEXT NOT NULL,PRIMARY KEY(person_id,page_id));
      CREATE TABLE IF NOT EXISTS expert_search_chunks(id TEXT PRIMARY KEY,person_id TEXT NOT NULL,page_id TEXT NOT NULL,ord INTEGER NOT NULL,text TEXT NOT NULL,meta TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS expert_search_scope ON expert_search_chunks(person_id,page_id,ord);
      CREATE VIRTUAL TABLE IF NOT EXISTS expert_search_fts USING fts5(chunk_id UNINDEXED,person_id UNINDEXED,title_terms,body_terms,tokenize='unicode61');`);
  }
  sync(personId,pages){
    const existing=new Map(this.db.prepare('SELECT page_id,hash FROM expert_search_docs WHERE person_id=?').all(personId).map(r=>[r.page_id,r.hash]));
    for(const page of pages){
      const hash=createHash('sha256').update(JSON.stringify([page.version,page.status,page.title,page.content,page.tags])).digest('hex');
      if(existing.get(page.id)===hash){existing.delete(page.id);continue;}
      const chunks=page.status==='published'&&!isVoice(page)?personalEvidenceChunks(page):[];
      this.store.transaction(()=>{
        this.remove(personId,page.id);
        for(const [ord,chunk] of chunks.entries()){
          const id=personId+':'+page.id+':'+ord;
          this.db.prepare('INSERT INTO expert_search_chunks VALUES(?,?,?,?,?,?)').run(id,personId,page.id,ord,chunk.text,JSON.stringify(chunk));
          this.db.prepare('INSERT INTO expert_search_fts VALUES(?,?,?,?)').run(id,personId,terms([page.title,...(page.aliases||[])].join(' ')).join(' '),terms(chunk.text).join(' '));
        }
        this.db.prepare('INSERT INTO expert_search_docs VALUES(?,?,?)').run(personId,page.id,hash);
      });existing.delete(page.id);
    }
    for(const id of existing.keys())this.store.transaction(()=>this.remove(personId,id));
  }
  remove(personId,pageId){
    const ids=this.db.prepare('SELECT id FROM expert_search_chunks WHERE person_id=? AND page_id=?').all(personId,pageId);
    for(const r of ids)this.db.prepare('DELETE FROM expert_search_fts WHERE chunk_id=?').run(r.id);
    this.db.prepare('DELETE FROM expert_search_chunks WHERE person_id=? AND page_id=?').run(personId,pageId);
    this.db.prepare('DELETE FROM expert_search_docs WHERE person_id=? AND page_id=?').run(personId,pageId);
  }
  search(personId,pages,query,limit=8){
    this.sync(personId,pages);
    const queryText=String(query).replace(/알려\s*(주세요|주실래요|줄래요|줄래|줘요|줘)|설명\s*(해주세요|해줘요|해줘)/g,' ');
    const tokens=[...new Set(terms(queryText,{query:true}))].slice(0,30);if(!tokens.length)return [];
    const expressions=tokens.map(t=>'"'+t.replaceAll('"','""')+'"');
    const statement=this.db.prepare(`SELECT c.*,bm25(expert_search_fts,0,0,3,1) AS rank FROM expert_search_fts JOIN expert_search_chunks c ON c.id=expert_search_fts.chunk_id WHERE expert_search_fts MATCH ? AND c.person_id=? ORDER BY rank LIMIT ?`);
    let rows=statement.all(expressions.join(' AND '),personId,limit);
    if(rows.length<Math.min(limit,3))rows=statement.all(expressions.join(' OR '),personId,limit*3);
    const byId=new Map(pages.filter(p=>p.status==='published'&&!isVoice(p)).map(p=>[p.id,p]));
    const counts=new Map(),result=[];
    for(const r of rows){const page=byId.get(r.page_id);if(!page||(counts.get(page.id)||0)>=3)continue;counts.set(page.id,(counts.get(page.id)||0)+1);result.push({...JSON.parse(r.meta),p:page,chunkIndex:r.ord});if(result.length>=limit)break;}
    return result;
  }
  read(personId,pages,pageId,chunkIndex=0){
    this.sync(personId,pages);const page=pages.find(p=>p.id===pageId&&p.status==='published'&&!isVoice(p));if(!page)return null;
    const index=Math.max(0,Math.floor(Number(chunkIndex)||0)),start=Math.max(0,index-1);
    const chunks=this.db.prepare('SELECT ord,meta FROM expert_search_chunks WHERE person_id=? AND page_id=? AND ord>=? ORDER BY ord LIMIT 5').all(personId,pageId,start).map(r=>({...JSON.parse(r.meta),chunkIndex:r.ord}));
    return {pageId,title:page.title,version:page.version,chunks,totalChunks:this.db.prepare('SELECT COUNT(*) n FROM expert_search_chunks WHERE person_id=? AND page_id=?').get(personId,pageId).n};
  }
}
