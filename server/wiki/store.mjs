import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync, openSync, fsyncSync, closeSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';

export const hash = value => createHash('sha256').update(value).digest('hex');
export const CAPTURE_MODELS = new Set(['Document', 'DocumentBlock', 'Citation', 'KnowledgeSource', 'KnowledgeChunk', 'OntologyNode', 'OntologyEdge', 'ChatMessage', 'ChannelMessage', 'Task', 'TaskEvent', 'AgentAction', 'AdminPost', 'Seminar', 'WikiPage']);
export function redact(value) {
  if (typeof value === 'string') return value.replace(/\bsk-[A-Za-z0-9_-]{20,}\b/g, '[redacted]').replace(/Bearer\s+[A-Za-z0-9_.-]{20,}/gi, 'Bearer [redacted]');
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([k]) => !/password|secret|token|apikey|encrypted|credential/i.test(k)).map(([k, v]) => [k, redact(v)]));
  return value;
}
export function atomicFile(path, bytes) {
  mkdirSync(dirname(path), { recursive: true });
  const temp = path + '.' + randomUUID() + '.tmp';
  const fd = openSync(temp, 'wx', 0o600);
  try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(temp, path);
}
const unpack = row => row ? JSON.parse(row.data) : null;
/** Activity records that are memory only — compiling them would duplicate existing pages. */
// Studio activity (document blocks, AI chats, wiki edits, ontology records…) is kept as raw
// evidence but never compiled into wiki pages: compiling it turned drafts and system records
// into pages like "34평형 아파트" or "온톨로지 노드". Only uploaded/imported sources compile.
export const NON_COMPILABLE_ACTIVITY = { has: () => true };

export class WikiStore {
  constructor(root) {
    this.root = resolve(root);
    mkdirSync(this.root, { recursive: true, mode: 0o700 });
    const tokenPath = join(this.root, 'runtime.token');
    if (!existsSync(tokenPath)) atomicFile(tokenPath, randomBytes(32).toString('hex'));
    this.token = readFileSync(tokenPath, 'utf8').trim();
    this.db = new DatabaseSync(join(this.root, 'knowledge.sqlite'));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS pages(id TEXT PRIMARY KEY, title TEXT NOT NULL, status TEXT NOT NULL, version INTEGER NOT NULL, data TEXT NOT NULL);
      CREATE UNIQUE INDEX IF NOT EXISTS page_title ON pages(lower(title)) WHERE status != 'archived';
      CREATE TABLE IF NOT EXISTS revisions(page_id TEXT NOT NULL, version INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(page_id,version));
      CREATE TABLE IF NOT EXISTS sources(id TEXT PRIMARY KEY, title TEXT NOT NULL, hash TEXT NOT NULL, path TEXT NOT NULL, text TEXT, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY, at TEXT NOT NULL, actor TEXT NOT NULL, model TEXT NOT NULL, entity_id TEXT NOT NULL, source_id TEXT, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, source_id TEXT UNIQUE NOT NULL REFERENCES sources(id), state TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, available_at INTEGER NOT NULL, lease_until INTEGER, error TEXT, result TEXT);
      CREATE TABLE IF NOT EXISTS links(source_id TEXT NOT NULL, target_title TEXT NOT NULL, PRIMARY KEY(source_id,target_title));
      CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE VIRTUAL TABLE IF NOT EXISTS page_search USING fts5(id UNINDEXED,title,content, tokenize='unicode61');`);
  }
  transaction(fn) {
    if (this.inTransaction) return fn();
    this.db.exec('BEGIN IMMEDIATE');
    this.inTransaction = true;
    try { const result = fn(); this.db.exec('COMMIT'); return result; } catch (error) { this.db.exec('ROLLBACK'); throw error; } finally { this.inTransaction = false; }
  }
  close() { this.db.close(); }
  pages() { return this.db.prepare('SELECT data FROM pages ORDER BY title').all().map(unpack); }
  page(id) { return unpack(this.db.prepare('SELECT data FROM pages WHERE id=?').get(id)); }
  history(id) { return this.db.prepare('SELECT data FROM revisions WHERE page_id=? ORDER BY version DESC').all(id).map(unpack); }
  source(id) { const row = this.db.prepare('SELECT * FROM sources WHERE id=?').get(id); return row ? { ...JSON.parse(row.data), content: row.text } : null; }
  /** All source rows (newest 100) by default. `{ originals: true }` lists uploaded files/documents only —
   *  activity snapshots share this table and otherwise bury every PDF beyond the 100-row window. */
  sources({ originals = false } = {}) {
    if (!originals) return this.db.prepare('SELECT data FROM sources ORDER BY rowid DESC LIMIT 100').all().map(unpack);
    return this.db.prepare("SELECT data FROM sources WHERE COALESCE(json_extract(data, '$.kind'), '') <> 'activity' ORDER BY rowid DESC LIMIT 500").all().map(unpack);
  }
  savePage(input, options, actor, capture = true) {
    const title = String(input.title || '').trim();
    if (!title || title.length > 200 || typeof input.content !== 'string' || input.content.length > 120000) throw new Error('문서 제목 또는 본문 길이가 올바르지 않습니다.');
    if (!['draft', 'review', 'published', 'archived'].includes(input.status)) throw new Error('문서 상태가 올바르지 않습니다.');
    const id = options.id || options.createId || randomUUID();
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error('문서 식별자가 올바르지 않습니다.');
    const page = this.transaction(() => {
      const current = this.page(id);
      if ((current?.version || 0) !== options.expectedVersion || (options.id && !current)) { const e = new Error('다른 작업에서 문서가 수정되었습니다. 최신 문서를 다시 열어 주세요.'); e.status = 409; throw e; }
      const now = new Date().toISOString();
      const entryType = input.entryType ?? current?.entryType ?? (id.startsWith('source-') ? 'source' : 'article');
      if (!['article', 'source', 'note'].includes(entryType)) throw new Error('문서 유형이 올바르지 않습니다.');
      const page = { title, entryType, content: input.content, category: String(input.category || '일반').slice(0, 50), tags: Array.isArray(input.tags) ? input.tags.slice(0, 20).map(t => String(t).slice(0, 40)) : [], status: input.status, sources: Array.isArray(input.sources) ? input.sources.slice(0, 40) : [], cover: String(input.cover || 'auto'), pinned: Boolean(input.pinned), id, workspaceId: 'index', version: (current?.version || 0) + 1, createdAt: current?.createdAt || now, updatedAt: now, updatedBy: actor, aliases: [...new Set([...(current?.aliases || []), ...(current && current.title !== title ? [current.title] : [])])].filter(t => t !== title) };
      this.db.prepare('INSERT INTO pages VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,status=excluded.status,version=excluded.version,data=excluded.data').run(id, title, page.status, page.version, JSON.stringify(page));
      this.db.prepare('INSERT INTO revisions VALUES(?,?,?)').run(id, page.version, JSON.stringify({ ...page, revisionId: `${id}-${page.version}`, reason: options.reason || '문서 저장' }));
      this.db.prepare('DELETE FROM page_search WHERE id=?').run(id);
      if (page.status !== 'archived') this.db.prepare('INSERT INTO page_search VALUES(?,?,?)').run(id, title, page.content);
      this.db.prepare('DELETE FROM links WHERE source_id=?').run(id);
      for (const target of new Set([...page.content.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)].map(m => m[1].trim()))) this.db.prepare('INSERT OR IGNORE INTO links VALUES(?,?)').run(id, target);
      if (capture) this.capture({ model: 'WikiPage', entityId: id, eventId: `wiki:${id}:${page.version}`, data: page }, actor);
      return page;
    });
    // Export is reproducible from SQLite; a failed export never removes a committed revision.
    if (!this.inTransaction) this.flushExports();
    return page;
  }
  flushExports() {
    try {
      for (const page of this.pages()) {
        const file = join(this.root, 'revisions', page.id, page.version + '.md');
        if (!existsSync(file) || !existsSync(join(this.root, 'wiki', page.id + '.md'))) this.exportPage(page);
      }
      this.db.prepare("DELETE FROM metadata WHERE key='export_error'").run();
    } catch { this.db.prepare("INSERT OR REPLACE INTO metadata VALUES('export_error',?)").run('Markdown 내보내기를 재시도하고 있습니다. 디스크 상태를 확인해 주세요.'); }
  }
  exportPage(page) {
    const text = `---\ntitle: ${JSON.stringify(page.title)}\naliases: ${JSON.stringify([page.title, ...page.aliases])}\nentryType: ${page.entryType || (page.id.startsWith('source-') ? 'source' : 'article')}\ncategory: ${JSON.stringify(page.category)}\ntags: ${JSON.stringify(page.tags)}\nstatus: ${page.status}\nversion: ${page.version}\nsources: ${JSON.stringify(page.sources.map(s => s.id))}\n---\n\n# ${page.title}\n\n${page.content}\n`;
    atomicFile(join(this.root, 'wiki', page.id + '.md'), text);
    atomicFile(join(this.root, 'revisions', page.id, page.version + '.md'), text);
  }
  addSource({ title, bytes, content, kind = 'file', mime = 'text/plain', name = 'source.txt', originalRefs = [], enqueue = true }, actor) {
    if (!Buffer.isBuffer(bytes)) bytes = Buffer.from(content || '');
    if (!bytes.length || bytes.length > 20 * 1024 * 1024) throw new Error('원본 자료는 1byte~20MB여야 합니다.');
    const digest = hash(bytes), id = hash(kind + ':' + title + ':' + digest);
    const existing = this.source(id);
    if (existing) return { source: existing, job: this.db.prepare('SELECT * FROM jobs WHERE source_id=?').get(id), duplicated: true };
    const path = join('raw', digest.slice(0, 2), digest);
    const destination = join(this.root, path);
    if (!existsSync(destination)) atomicFile(destination, bytes);
    const source = { id, title: String(title || name).slice(0, 200), hash: digest, path, kind, mime, name: String(name).replace(/[\\/]/g, '_'), createdAt: new Date().toISOString(), actor, originalRefs };
    this.transaction(() => {
      this.db.prepare('INSERT INTO sources VALUES(?,?,?,?,?,?)').run(id, source.title, digest, path, content || null, JSON.stringify(source));
      // Activity memories (e.g. wiki page saves) are kept but not compiled into new pages.
      if (enqueue) this.db.prepare('INSERT INTO jobs(id,source_id,state,available_at) VALUES(?,?,?,?)').run(randomUUID(), id, 'queued', Date.now() + 2000);
    });
    return { source, job: this.db.prepare('SELECT * FROM jobs WHERE source_id=?').get(id), duplicated: false };
  }
  capture(event, actor) {
    if (!CAPTURE_MODELS.has(event.model)) throw new Error('지식 수집 대상이 아닌 기록입니다.');
    const id = String(event.eventId || randomUUID()).slice(0, 200);
    if (this.db.prepare('SELECT id FROM events WHERE id=?').get(id)) return { accepted: true, duplicated: true };
    const data = redact(event.data || {}), text = JSON.stringify(data, null, 2);
    if (text.length > 500000) throw new Error('활동 기록이 너무 큽니다.');
    const entityId = String(event.entityId || data.id || id).slice(0, 200);
    const title = String(data.title || data.label || data.name || `${event.model} ${entityId}`).slice(0, 200);
    const meaningful = !['delete', 'upload'].includes(event.operation) && /Document|Block|Source|Chunk|Message|Post|Seminar|WikiPage|OntologyNode/.test(event.model) && text.length > 40;
    const source = meaningful ? this.addSource({ title, content: JSON.stringify({ recordType: event.model, data }, null, 2), kind: 'activity', name: `${event.model}.json`, enqueue: !NON_COMPILABLE_ACTIVITY.has(event.model) }, actor).source : null;
    this.db.prepare('INSERT OR IGNORE INTO events VALUES(?,?,?,?,?,?,?)').run(id, new Date().toISOString(), actor, event.model, entityId, source?.id || null, JSON.stringify({ operation: event.operation || 'save', data }));
    return { accepted: true, duplicated: false, sourceId: source?.id };
  }
  /** Explicit, non-destructive cancellation: the source, events and revisions stay. */
  cancel(jobIds, reason) {
    const result = JSON.stringify({ cancelled: true, reason, at: new Date().toISOString() });
    const stmt = this.db.prepare("UPDATE jobs SET state='cancelled',lease_until=NULL,result=?,error=NULL WHERE id=? AND state IN ('queued','running','failed')");
    return this.transaction(() => jobIds.reduce((n, id) => n + Number(stmt.run(result, id).changes), 0));
  }
  /** Re-check right before compiling: wiki page saves are activity memory, never compiled. */
  isCompilable(sourceId) {
    const row = this.db.prepare('SELECT text, data FROM sources WHERE id=?').get(sourceId);
    if (!row) return false;
    const source = JSON.parse(row.data);
    return source.kind !== 'activity';
  }
  claim() {
    return this.transaction(() => {
      const now = Date.now();
      this.db.prepare("UPDATE jobs SET state='queued',lease_until=NULL WHERE state='running' AND lease_until<?").run(now);
      let job = this.db.prepare("SELECT * FROM jobs WHERE state='queued' AND available_at<=? ORDER BY rowid LIMIT 1").get(now);
      while (job && !this.isCompilable(job.source_id)) {
        this.db.prepare("UPDATE jobs SET state='cancelled',lease_until=NULL,result=? WHERE id=?").run(JSON.stringify({ cancelled: true, reason: 'activity-not-compilable' }), job.id);
        job = this.db.prepare("SELECT * FROM jobs WHERE state='queued' AND available_at<=? ORDER BY rowid LIMIT 1").get(now);
      }
      if (!job) return null;
      this.db.prepare("UPDATE jobs SET state='running',attempts=attempts+1,lease_until=?,error=NULL WHERE id=?").run(now + 10 * 60 * 1000, job.id);
      return { ...job, state: 'running', attempts: job.attempts + 1 };
    });
  }
  finish(id, result) { this.db.prepare("UPDATE jobs SET state='done',lease_until=NULL,result=?,error=NULL WHERE id=?").run(JSON.stringify(result), id); }
  fail(job, error) { this.db.prepare('UPDATE jobs SET state=?,lease_until=NULL,available_at=?,error=? WHERE id=?').run(job.attempts >= 3 ? 'failed' : 'queued', Date.now() + Math.min(60000 * job.attempts, 300000), String(error.message || error).slice(0, 700), job.id); }
  retry(id) { this.db.prepare("UPDATE jobs SET state='queued',available_at=0,error=NULL,attempts=0 WHERE id=? AND state IN ('failed','queued')").run(id); }
  status() {
    const count = table => Number(this.db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n);
    return { mode: 'server', pages: count('pages'), sources: count('sources'), events: count('events'), exportError: this.db.prepare("SELECT value FROM metadata WHERE key='export_error'").get()?.value, jobs: this.db.prepare('SELECT id,source_id,state,attempts,error,result FROM jobs ORDER BY rowid DESC LIMIT 25').all(), storage: '서버 디스크 · SQLite + 원본 파일 + Markdown 이력' };
  }
  search(question, includeDrafts = false) {
    const words = question.toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [];
    const terms = [...new Set(words.flatMap(t => /[가-힣]/.test(t) ? [t, ...Array.from({ length: t.length - 1 }, (_, i) => t.slice(i, i + 2))] : [t]))].slice(0, 60);
    return this.pages().filter(p => p.status === 'published' || (includeDrafts && p.status !== 'archived')).map(p => {
      const text = (p.title + ' ' + p.content + ' ' + p.tags.join(' ')).toLocaleLowerCase();
      const score = terms.reduce((n, t) => n + (text.includes(t) ? 1 : 0) + (p.title.toLocaleLowerCase().includes(t) ? 3 : 0), 0);
      return { ...p, score };
    }).filter(p => p.score > 0).sort((a, b) => b.score - a.score).slice(0, 6);
  }
}
