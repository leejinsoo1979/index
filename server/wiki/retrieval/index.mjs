/**
 * INDEX second brain — retrieval layer over the knowledge server's SQLite (single source
 * of truth). Wiki pages and the ORIGINAL text of uploaded sources (PDF page by page) are
 * split into passages ("chunks"); every chunk keeps where it came from (page id or source
 * id, heading, PDF page numbers) so answers can cite it.
 *
 * Ranking (stage 1, agreed by the agents; graph hops are stage 2 behind a flag):
 *   lexical  = BM25 over Hangul bigrams + latin words (FTS5), title weighted ×3
 *   semantic = cosine(query, chunk) when OpenAI embeddings exist (server-side only)
 *   score    = (semantic ? 0.55·lexical + 0.45·semantic : lexical) × trust × statusWeight
 * trust: 법령 1.0 / 협회 원본 자료 0.9 / 위키 문서 0.75 / 재구성 백과 0.65 / AI 요약 0.5
 * status: published 1.0 / review 0.8 / draft 0.6 (archived pages are never indexed)
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const RETRIEVAL_VERSION = 'index-retrieval-v5';
// Wiki figures served by the site (public/wiki-assets). Kept as markdown in stored chunks so
// answers can show them; stripped to "(그림: …)" for indexing and for the passage text.
const SITE_IMAGE = /!\[([^\]]*)\]\((\/wiki-assets\/[^)\s]+)\)/g;
const withoutImages = (text) => text.replace(SITE_IMAGE, '(그림: $1)');
const CHUNK_MAX = 900;
const CHUNK_MIN = 220;
const EMBED_MODEL = 'text-embedding-3-small';

const STATUS_WEIGHT = { published: 1, review: 0.8, draft: 0.6 };
const TRUST = {
  law: { weight: 1, label: '법령 원문' },
  association: { weight: 0.9, label: '협회 원본 자료' },
  wiki: { weight: 0.75, label: '위키 문서' },
  reconstructed: { weight: 0.65, label: '재구성 지식(외부 검증 전)' },
  ai_summary: { weight: 0.5, label: 'AI 요약' },
  // Tables of contents, guides and source lists: useful to browse, weak as evidence.
  navigation: { weight: 0.35, label: '목차·길잡이' },
};
const CATEGORIES = new Set(['일반', '공간', '설계·디자인', '공법', '자재', '주거 환경', '하자', '법규·기준', '디지털·AI', '사업·협업', '현장 기록']);

export function ensureRetrievalSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS rt_docs(doc_key TEXT PRIMARY KEY, kind TEXT NOT NULL, ref_id TEXT NOT NULL, title TEXT NOT NULL, hash TEXT NOT NULL, status TEXT NOT NULL, trust TEXT NOT NULL, category TEXT NOT NULL, indexed_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS rt_chunks(id TEXT PRIMARY KEY, doc_key TEXT NOT NULL, ord INTEGER NOT NULL, heading TEXT, page_from INTEGER, page_to INTEGER, text TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS rt_chunks_doc ON rt_chunks(doc_key);
    CREATE VIRTUAL TABLE IF NOT EXISTS rt_fts USING fts5(chunk_id UNINDEXED, title_terms, body_terms, tokenize='unicode61');
    CREATE TABLE IF NOT EXISTS rt_vectors(chunk_id TEXT PRIMARY KEY, model TEXT NOT NULL, dim INTEGER NOT NULL, vec BLOB NOT NULL);
  `);
}

// ─── text utilities ──────────────────────────────────────────────────────────

// Common Korean endings, stripped so "방수층은" also finds "방수층".
const PARTICLE = /(으로부터|에서부터|이라는|이라고|에서는|으로는|에게는|까지는|부터는|하는|되는|한다|된다|에서|으로|에게|까지|부터|처럼|보다|이나|이란|란|은|는|이|가|을|를|에|의|도|만|와|과|로|나)$/;
const STOP = new Set(['그리고', '하지만', '어떻게', '무엇', '뭐야', '알려줘', '주세요', '있나요', '되나요', '하나요', '인가요', '경우', '관련', '대해', '대한', '방법', '이유', '정도']);

/** Index terms: Hangul runs → bigrams (plus the stripped word), latin/digit words as-is. */
export function terms(text, { query = false } = {}) {
  const out = [];
  for (let word of String(text).toLowerCase().normalize('NFC').match(/[\p{L}\p{N}]+/gu) || []) {
    if (/[가-힣]/.test(word)) {
      if (query) {
        if (word.length > 2) word = word.replace(PARTICLE, '');
        if (STOP.has(word) || word.length < 2) continue;
      }
      const hangul = word.replace(/[^가-힣]/g, '');
      if (hangul.length === 1) out.push(hangul);
      for (let i = 0; i + 1 < hangul.length; i++) out.push(hangul.slice(i, i + 2));
      const rest = word.replace(/[가-힣]/g, '');
      if (rest.length >= 2) out.push(rest);
    } else if (word.length >= 2 || /\d/.test(word)) out.push(word);
  }
  return out;
}

const squash = (s) => s.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

function pack(paragraphs) {
  const chunks = [];
  let buf = '';
  for (const p of paragraphs) {
    if (p.length > CHUNK_MAX) {
      if (buf) { chunks.push(buf); buf = ''; }
      // split long paragraphs on sentence ends
      let part = '';
      for (const s of p.split(/(?<=[.!?。다요])\s+/)) {
        if ((part + ' ' + s).length > CHUNK_MAX && part) { chunks.push(part.trim()); part = ''; }
        part += (part ? ' ' : '') + s;
      }
      if (part) buf = part.trim();
      continue;
    }
    if ((buf + '\n\n' + p).length > CHUNK_MAX && buf.length >= CHUNK_MIN) { chunks.push(buf); buf = p; }
    else buf = buf ? buf + '\n\n' + p : p;
  }
  if (buf) {
    if (buf.length < CHUNK_MIN && chunks.length) chunks[chunks.length - 1] += '\n\n' + buf;
    else chunks.push(buf);
  }
  return chunks;
}

/** Markdown page → chunks under their nearest heading (images and link syntax kept readable). */
export function chunkMarkdown(content) {
  const clean = content
    .replace(/```index-process[\s\S]*?```/g, '')
    .replace(/!\[([^\]]*)\]\(([^)\s]*)\)/g, (m, alt, url) => (url.startsWith('/wiki-assets/') ? `\n\n![${alt}](${url})\n\n` : `(그림: ${alt})`))
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1');
  const sections = [];
  let heading = null;
  let lines = [];
  for (const line of clean.split('\n')) {
    const h = line.match(/^#{1,4}\s+(.+)$/);
    if (h) { if (lines.join('').trim()) sections.push({ heading, text: lines.join('\n') }); heading = h[1].trim(); lines = []; }
    else lines.push(line);
  }
  if (lines.join('').trim()) sections.push({ heading, text: lines.join('\n') });
  return sections.flatMap(s => pack(squash(s.text).split(/\n{2,}/).map(p => p.trim()).filter(Boolean)).map(text => ({ heading: s.heading, text })));
}

// Web-page chrome captured in saved PDFs (Naver cafe header/footer, comment box…).
const PDF_NOISE = [/댓글을 남겨보세요/, /^\s*(등록|목록|답글|좋아요|공유|신고|이전글|다음글|맨위로)\s*$/, /1:1 ?채팅/, /조회 ?\d+/, /^\s*(새싹|레벨\s*\d+)/, /^\s*\d{4}\.\s?\d{1,2}\.\s?\d{1,2}\.?\s+\d{1,2}:\d{2}/, /^\s*https?:\/\/\S+\s*$/, /^\s*\d+\s*\/\s*\d+\s*$/];
const cleanPdfText = (text) => text.split('\n').filter(line => !PDF_NOISE.some(re => re.test(line))).join('\n').replace(/\s*(구독|URL 복사|댓글 \d+|with INSHOW)\s*/g, ' ');

/** PDF pages → chunks that never cross a page boundary (exact page citations). */
export function chunkPages(pages) {
  return pages.flatMap(({ num, text }) => pack(squash(cleanPdfText(text)).split(/\n{2,}|\n(?=[•\-·\d]+[.)]?\s)/).map(p => p.replace(/\s*\n\s*/g, ' ').trim()).filter(p => p.length > 1))
    .filter(t => t.replace(/\s/g, '').length >= 20)
    .map(t => ({ heading: null, text: t, page: num })));
}

// Link lists and bibliographies match many queries but carry little knowledge.
const LIST_HEADINGS = /^(참고 출처|출처|관련 항목|관련 문서|관련 개념|근거 문서|주요 개념|연결된 개념|원본 자료|목차)/;

const normCategory = (c) => (typeof c === 'string' && CATEGORIES.has(c.trim()) ? c.trim() : '일반');

function trustForPage(page) {
  const tags = page.tags || [];
  if (page.entryType === 'note' || /목차|목록|길잡이|시작하기|이용 기준/.test(page.title)) return 'navigation';
  if (tags.includes('인테리어 지식백과') || tags.includes('인테리어SHOW')) return 'reconstructed';
  if ((page.updatedBy || '').includes('Compiler') || page.entryType === 'source') return 'ai_summary';
  return 'wiki';
}
function trustForSource(source) {
  const refs = JSON.stringify(source.originalRefs || []);
  if (/law\.go\.kr/.test(refs)) return 'law';
  if (/CA-|협회|cafe\.naver\.com/.test(refs + source.title + (source.name || ''))) return 'association';
  return 'wiki';
}

// ─── embeddings (optional, server-side only) ────────────────────────────────

async function embed(texts) {
  const key = process.env.OPENAI_API_KEY;
  if (!key || !texts.length) return null;
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts.map(t => t.slice(0, 6000)) }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`임베딩 요청 실패 (HTTP ${res.status})`);
  const body = await res.json();
  return body.data.map(d => Float32Array.from(d.embedding));
}
const toBlob = (v) => Buffer.from(v.buffer, v.byteOffset, v.byteLength);
const fromBlob = (b) => new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

// ─── indexing ────────────────────────────────────────────────────────────────

async function pdfPages(store, source) {
  const bytes = readFileSync(join(store.root, source.path));
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: new Uint8Array(bytes) });
  try { return (await parser.getText()).pages.map(p => ({ num: p.num, text: p.text })); } finally { await parser.destroy(); }
}

function writeDoc(db, doc, chunks) {
  const old = db.prepare('SELECT id FROM rt_chunks WHERE doc_key=?').all(doc.doc_key).map(r => r.id);
  for (const id of old) { db.prepare('DELETE FROM rt_fts WHERE chunk_id=?').run(id); db.prepare('DELETE FROM rt_vectors WHERE chunk_id=?').run(id); }
  db.prepare('DELETE FROM rt_chunks WHERE doc_key=?').run(doc.doc_key);
  db.prepare('INSERT OR REPLACE INTO rt_docs VALUES(?,?,?,?,?,?,?,?,?)').run(doc.doc_key, doc.kind, doc.ref_id, doc.title, doc.hash, doc.status, doc.trust, doc.category, new Date().toISOString());
  const titleTerms = terms(doc.title).join(' ');
  chunks.forEach((c, i) => {
    const id = `${doc.doc_key}#${i}`;
    db.prepare('INSERT INTO rt_chunks VALUES(?,?,?,?,?,?,?)').run(id, doc.doc_key, i, c.heading ?? null, c.page ?? null, c.page ?? null, c.text);
    db.prepare('INSERT INTO rt_fts VALUES(?,?,?)').run(id, titleTerms, terms((c.heading || '') + ' ' + withoutImages(c.text)).join(' '));
  });
  return chunks.map((c, i) => ({ id: `${doc.doc_key}#${i}`, text: `${doc.title}\n${c.heading || ''}\n${withoutImages(c.text)}` }));
}

function removeDoc(db, docKey) {
  for (const { id } of db.prepare('SELECT id FROM rt_chunks WHERE doc_key=?').all(docKey)) { db.prepare('DELETE FROM rt_fts WHERE chunk_id=?').run(id); db.prepare('DELETE FROM rt_vectors WHERE chunk_id=?').run(id); }
  db.prepare('DELETE FROM rt_chunks WHERE doc_key=?').run(docKey);
  db.prepare('DELETE FROM rt_docs WHERE doc_key=?').run(docKey);
}

/** Incremental (re)index: only documents whose content hash changed are rebuilt. */
export async function reindex(store, { log = () => {} } = {}) {
  const db = store.db;
  ensureRetrievalSchema(db);
  const seen = new Set();
  const pending = [];
  const report = { pages: 0, sources: 0, chunks: 0, unchanged: 0, removed: 0, failed: [], embedded: 0 };

  for (const page of store.pages()) {
    if (page.status === 'archived') continue;
    const doc_key = `page:${page.id}`;
    seen.add(doc_key);
    const hash = createHash('sha256').update(RETRIEVAL_VERSION + page.title + page.status + page.content).digest('hex');
    const prev = db.prepare('SELECT hash FROM rt_docs WHERE doc_key=?').get(doc_key);
    if (prev?.hash === hash) { report.unchanged++; continue; }
    const chunks = chunkMarkdown(`${page.content}`);
    if (!chunks.length) continue;
    pending.push(...writeDoc(db, { doc_key, kind: 'page', ref_id: page.id, title: page.title, hash, status: page.status, trust: trustForPage(page), category: normCategory(page.category) }, chunks));
    report.pages++; report.chunks += chunks.length;
  }

  for (const source of store.db.prepare('SELECT id, title, hash, path, data FROM sources').all().map(r => ({ ...JSON.parse(r.data), id: r.id, title: r.title, hash: r.hash, path: r.path }))) {
    // Activity captures (page saves, chats…) are a journal of other records, not knowledge: skip.
    if (source.kind === 'activity') continue;
    const doc_key = `source:${source.id}`;
    seen.add(doc_key);
    const hash = createHash('sha256').update(RETRIEVAL_VERSION + source.hash).digest('hex');
    if (db.prepare('SELECT hash FROM rt_docs WHERE doc_key=?').get(doc_key)?.hash === hash) { report.unchanged++; continue; }
    try {
      const isPdf = source.mime === 'application/pdf' || /\.pdf$/i.test(source.name || '');
      const chunks = isPdf ? chunkPages(await pdfPages(store, source)) : chunkMarkdown(readFileSync(join(store.root, source.path), 'utf8'));
      if (!chunks.length) throw new Error('텍스트 없음(스캔 자료는 OCR 필요)');
      pending.push(...writeDoc(db, { doc_key, kind: 'source', ref_id: source.id, title: source.title, hash, status: 'review', trust: trustForSource(source), category: '일반' }, chunks));
      report.sources++; report.chunks += chunks.length;
    } catch (error) { report.failed.push({ title: source.title, error: String(error.message || error) }); }
  }

  for (const { doc_key } of db.prepare('SELECT doc_key FROM rt_docs').all()) if (!seen.has(doc_key)) { removeDoc(db, doc_key); report.removed++; }

  // Embeddings for new/changed chunks; absence of a key keeps lexical-only retrieval working.
  try {
    for (let i = 0; i < pending.length; i += 64) {
      const batch = pending.slice(i, i + 64);
      const vectors = await embed(batch.map(b => b.text));
      if (!vectors) break;
      batch.forEach((b, j) => db.prepare('INSERT OR REPLACE INTO rt_vectors VALUES(?,?,?,?)').run(b.id, EMBED_MODEL, vectors[j].length, toBlob(vectors[j])));
      report.embedded += batch.length;
    }
  } catch (error) { report.embedError = String(error.message || error); }
  log(report);
  return report;
}

// ─── retrieval ───────────────────────────────────────────────────────────────

/**
 * @returns {{ chunks: Array<object>, coverage: 'ok'|'weak'|'none', version: string }}
 * includeReview=false keeps the public chatbot on 검수 완료 only (agreed default).
 */
// Cheap change signature so a search right after a save/upload never misses new content.
const lastSignature = new WeakMap();
function signature(store) {
  const p = store.db.prepare('SELECT count(*) n, coalesce(max(version),0) v, group_concat(substr(id,1,4)||version||status, \'\') s FROM pages').get();
  const s = store.db.prepare('SELECT count(*) n, coalesce(group_concat(substr(hash,1,6), \'\'),\'\') h FROM sources').get();
  return createHash('sha1').update(`${p.n}|${p.v}|${p.s}|${s.n}|${s.h}`).digest('hex');
}
export async function ensureFresh(store) {
  const sig = signature(store);
  if (lastSignature.get(store) === sig) return;
  await reindex(store);
  lastSignature.set(store, sig);
}

/** Figures in this passage, else the first figure elsewhere in the same document. */
function figuresFor(db, r) {
  const own = [...r.text.matchAll(new RegExp(SITE_IMAGE))];
  const found = own.length ? own : (() => {
    const docKey = r.chunk_id.slice(0, r.chunk_id.lastIndexOf('#'));
    const row = db.prepare("SELECT text FROM rt_chunks WHERE doc_key=? AND text LIKE '%](/wiki-assets/%' ORDER BY ord LIMIT 1").get(docKey);
    return row ? [...row.text.matchAll(new RegExp(SITE_IMAGE))].slice(0, 1) : [];
  })();
  return found.map(m => ({ alt: m[1] || r.heading || r.title, src: m[2] }));
}

export async function retrieve(store, query, { k = 6, includeReview = true } = {}) {
  const db = store.db;
  ensureRetrievalSchema(db);
  await ensureFresh(store);
  const q = terms(query, { query: true });
  if (!q.length) return { chunks: [], coverage: 'none', version: RETRIEVAL_VERSION };
  const match = [...new Set(q)].map(t => `"${t.replace(/"/g, '')}"`).join(' OR ');
  const rows = db.prepare(`
    SELECT f.chunk_id, bm25(rt_fts, 0, 3.0, 1.0) AS rank, c.text, c.heading, c.page_from, c.page_to, d.title, d.kind, d.ref_id, d.status, d.trust, d.category
    FROM rt_fts f JOIN rt_chunks c ON c.id = f.chunk_id JOIN rt_docs d ON d.doc_key = c.doc_key
    WHERE rt_fts MATCH ? ORDER BY rank LIMIT 80`).all(match)
    .filter(r => includeReview || r.status === 'published');

  let qvec = null;
  const hasVectors = db.prepare('SELECT 1 FROM rt_vectors LIMIT 1').get();
  if (hasVectors) { try { qvec = (await embed([query]))?.[0] ?? null; } catch { qvec = null; } }

  const best = rows.length ? Math.min(...rows.map(r => r.rank)) : 0; // bm25: more negative = better
  const scored = rows.map(r => {
    const lexical = best < 0 ? r.rank / best : 0; // 0..1, 1 = best lexical hit
    let semantic = null;
    if (qvec) { const v = db.prepare('SELECT vec FROM rt_vectors WHERE chunk_id=?').get(r.chunk_id); if (v) semantic = Math.max(0, cosine(qvec, fromBlob(v.vec))); }
    let base = semantic == null ? lexical : 0.55 * lexical + 0.45 * semantic;
    if (r.heading && LIST_HEADINGS.test(r.heading)) base *= 0.45;
    const trust = TRUST[r.trust] ?? TRUST.wiki;
    return { ...r, lexical, semantic, score: base * trust.weight * (STATUS_WEIGHT[r.status] ?? 0.6), trustLabel: trust.label };
  }).sort((a, b) => b.score - a.score);

  // At most two passages per document so one long file can't crowd out the rest.
  const perDoc = new Map();
  const seenText = new Set();
  const picked = [];
  for (const r of scored) {
    const key = `${r.kind}:${r.ref_id}`;
    const fingerprint = r.text.replace(/\s+/g, ' ').slice(0, 160);
    if (seenText.has(fingerprint)) continue;
    seenText.add(fingerprint);
    if ((perDoc.get(key) ?? 0) >= 2) continue;
    perDoc.set(key, (perDoc.get(key) ?? 0) + 1);
    picked.push(r);
    if (picked.length >= k) break;
  }
  const top = picked[0]?.score ?? 0;
  return {
    version: RETRIEVAL_VERSION,
    coverage: !picked.length ? 'none' : top < 0.35 ? 'weak' : 'ok',
    chunks: picked.map((r, i) => ({
      n: i + 1,
      id: r.chunk_id,
      title: r.title,
      heading: r.heading,
      kind: r.kind,
      refId: r.ref_id,
      pages: r.page_from ? (r.page_from === r.page_to ? `${r.page_from}쪽` : `${r.page_from}~${r.page_to}쪽`) : null,
      status: r.status,
      trust: r.trustLabel,
      category: r.category,
      score: Number(r.score.toFixed(4)),
      text: withoutImages(r.text),
      images: figuresFor(db, r),
    })),
  };
}

// ─── background refresh ─────────────────────────────────────────────────────

let timer = null;
let running = null;
/** Debounced incremental reindex after pages/sources change (and once at startup). */
export function scheduleReindex(store, delay = 4000) {
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (running) { scheduleReindex(store, delay); return; }
    running = reindex(store).catch(error => console.error('[retrieval] reindex failed', error)).finally(() => { running = null; });
  }, delay);
  timer.unref?.();
}
