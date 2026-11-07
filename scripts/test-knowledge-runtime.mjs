import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WikiStore } from '../server/wiki/store.mjs';
import { compileSource, answerQuestion } from '../server/wiki/llm.mjs';
import { createWikiServer } from '../server/wiki/server.mjs';
import { collectMarkdownArchive, assertReviewedArchive, privacyWarnings } from '../server/wiki/markdown-archive.mjs';
import { loadServerPublishedWiki } from '../server/wiki/chat-context.mjs';

const draft = (title = '공간 설계') => ({ title, content: '거실 동선과 수납을 함께 검토합니다.', status: 'draft', category: '공간', tags: ['동선'], sources: [], pinned: false, cover: 'auto' });
const fixture = () => mkdtempSync(join(tmpdir(), 'index-knowledge-test-'));
await test('manual changes atomically persist revisions, events, raw sources and jobs across restart; stale writes fail', () => {
  const root = fixture(); let store = new WikiStore(root);
  try {
    const page = store.savePage(draft(), { expectedVersion: 0 }, 'admin');
    store.savePage({ ...page, content: '변경된 공간 기록' }, { id: page.id, expectedVersion: 1 }, 'admin');
    assert.throws(() => store.savePage(page, { id: page.id, expectedVersion: 1 }, 'admin'), /다른 작업/);
    store.close(); store = new WikiStore(root);
    assert.equal(store.history(page.id).length, 2);
    assert.equal(store.status().events, 2);
    assert.equal(store.status().sources, 2);
    for (const source of store.sources()) assert.ok(existsSync(join(root, source.path)));
    assert.ok(existsSync(join(root, 'wiki', page.id + '.md')));
  } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
});
await test('encyclopedia document types persist through revisions and Markdown without treating raw summaries as entries', () => {
  const root = fixture(); const store = new WikiStore(root);
  try {
    const source = store.savePage(draft('원본 요약'), { createId: 'source-fixture', expectedVersion: 0 }, 'admin', false);
    assert.equal(source.entryType, 'source');
    const note = store.savePage({ ...draft('실무 기록'), entryType: 'note' }, { expectedVersion: 0 }, 'admin', false);
    const article = store.savePage({ ...note, entryType: 'article' }, { id: note.id, expectedVersion: 1 }, 'admin', false);
    assert.equal(store.history(note.id)[1].entryType, 'note');
    assert.equal(article.entryType, 'article');
    assert.match(readFileSync(join(root, 'wiki', article.id + '.md'), 'utf8'), /entryType: article/);
    assert.throws(() => store.savePage({ ...draft(), entryType: 'invalid' }, { expectedVersion: 0 }, 'admin'), /유형/);
  } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
});
await test('source and event retries dedupe; deleted entities keep original evidence; credentials never become knowledge', () => {
  const root = fixture(); const store = new WikiStore(root);
  try {
    const event = { eventId: 'same-event', model: 'Document', entityId: 'a', data: { title: '주거 공간', content: '전문가가 동선과 자재를 함께 검토한다.', apiKey: 'not-for-wiki' } };
    store.capture(event, 'admin'); store.capture(event, 'admin');
    assert.equal(store.status().events, 1); assert.equal(store.status().sources, 1);
    assert.ok(!JSON.stringify(store.sources()).includes('not-for-wiki'));
    assert.ok(!store.source(store.sources()[0].id).content.includes('not-for-wiki'));
    store.capture({ ...event, eventId: 'delete', operation: 'delete' }, 'admin');
    assert.equal(store.status().events, 2); assert.equal(store.status().sources, 1);
    assert.throws(() => store.capture({ model: 'LlmProviderConfig', data: {} }, 'admin'), /대상이 아닌/);
  } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
});
await test('two-stage compilation checkpoints, creates linked review drafts with real provenance, and is idempotent on replay', async () => {
  const root = fixture(); const store = new WikiStore(root); let calls = 0;
  try {
    const { source } = store.addSource({ title: '설계 검토 원칙', content: '동선과 수납을 함께 검토한다.' }, 'admin');
    const fake = async () => ++calls === 1 ? { summary: '동선 검토', facts: ['동선과 수납을 함께 검토한다.'] } : { title: '주거 동선의 검토', content: '## 주요 내용\n동선과 수납을 함께 검토합니다.', tags: ['설계'], concepts: [{ title: '주거 동선', content: '생활 동선의 검토입니다.' }] };
    const result = await compileSource(store, store.source(source.id), fake);
    assert.equal(calls, 2); assert.equal(result.pageIds.length, 2);
    for (const p of store.pages()) { assert.equal(p.status, 'review'); assert.equal(p.sources[0].id, source.id); }
    assert.match(store.pages().find(p => p.id.startsWith('source-')).content, /\[\[주거 동선\]\]/);
    const again = await compileSource(store, store.source(source.id), async () => ({ title: '주거 동선의 검토', content: 'ignored' }));
    assert.equal(again.alreadyCompiled, true); assert.equal(store.pages().length, 2);
    const next = store.addSource({ title: '추가 설계 자료', content: '출입 동선의 폭도 함께 확인한다.' }, 'admin').source;
    let nextCalls = 0;
    await compileSource(store, store.source(next.id), async () => ++nextCalls === 1 ? { summary: '추가 자료', facts: ['출입 동선의 폭을 확인한다.'] } : { title: '동선 폭의 검토', content: '출입 동선의 폭을 검토합니다.', concepts: [{ title: '주거 동선', content: '동선의 폭을 함께 검토합니다.' }] });
    const concept = store.pages().find(p => p.title === '주거 동선');
    assert.equal(concept.version, 2); assert.equal(concept.sources.length, 2); assert.match(concept.content, /동선의 폭/);
    store.savePage({ ...concept, status: 'published' }, { id: concept.id, expectedVersion: 2 }, 'human', false);
    const third = store.addSource({ title: '세 번째 자료', content: '새로운 주거 동선 검토' }, 'admin').source;
    let thirdCalls = 0;
    await compileSource(store, store.source(third.id), async () => ++thirdCalls === 1 ? { summary: '새 자료', facts: ['새 근거'] } : { title: '새 동선 관점', content: '새 근거입니다.', concepts: [{ title: '주거 동선', content: '추가 판단이 필요합니다.' }] });
    assert.equal(store.page(concept.id).version, 3); assert.equal(store.page(concept.id).status, 'published');
    assert.ok(store.pages().some(p => p.title.startsWith('주거 동선 · 추가 검토')));
  } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
});
await test('interrupted leases recover, failures retain originals, and retry exhaustion is visible', async () => {
  const root = fixture(); const store = new WikiStore(root);
  try {
    const { source } = store.addSource({ title: '원문', content: '보존되어야 하는 원문' }, 'admin');
    store.db.prepare('UPDATE jobs SET available_at=0').run();
    let job = store.claim(); assert.equal(job.attempts, 1);
    store.db.prepare('UPDATE jobs SET lease_until=0').run();
    job = store.claim(); assert.equal(job.attempts, 2);
    store.fail(job, new Error('provider unavailable'));
    store.db.prepare('UPDATE jobs SET available_at=0').run();
    job = store.claim(); store.fail(job, new Error('provider unavailable'));
    assert.equal(store.status().jobs[0].state, 'failed');
    assert.equal(readFileSync(join(root, source.path), 'utf8'), '보존되어야 하는 원문');
    assert.equal(store.pages().length, 0); store.retry(job.id); assert.equal(store.claim().attempts, 1);
  } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
});
await test('Q&A defaults to approved evidence and returns exact versioned citations; no evidence makes no LLM request', async () => {
  const root = fixture(); const store = new WikiStore(root);
  try {
    const p = store.savePage(draft(), { expectedVersion: 0 }, 'admin', false);
    let calls = 0; const fake = async () => { calls++; return '동선과 수납을 함께 검토합니다. [1]'; };
    assert.equal((await answerQuestion(store, '동선을 어떻게 검토하나요?', false, fake)).citations.length, 0); assert.equal(calls, 0);
    store.savePage({ ...p, status: 'published' }, { id: p.id, expectedVersion: 1 }, 'admin', false);
    const result = await answerQuestion(store, '동선을 어떻게 검토하나요?', false, fake);
    assert.equal(result.citations[0].id, p.id); assert.equal(result.citations[0].version, 2); assert.equal(calls, 1);
  } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
});
await test('HTTP requires auth, rejects cross-origin writes, preserves uploaded original and exposes durable job state', async () => {
  const root = fixture(); const runtime = createWikiServer({ root, worker: false });
  await new Promise(r => runtime.server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + runtime.server.address().port + '/api/wiki/';
  const headers = { Authorization: `Bearer ${runtime.store.token}`, 'Content-Type': 'application/json' };
  try {
    assert.equal((await fetch(base + 'pages')).status, 401);
    assert.equal((await fetch(base + 'sources', { method: 'POST', headers: { ...headers, Origin: 'https://untrusted.example' }, body: '{}' })).status, 403);
    const bytes = Buffer.from('검증용 원본 파일');
    const response = await fetch(base + 'sources', { method: 'POST', headers, body: JSON.stringify({ title: '원본 검증', name: '원본.txt', base64: bytes.toString('base64') }) });
    assert.equal(response.status, 202); const { source } = await response.json();
    assert.deepEqual(Buffer.from(await (await fetch(base + 'originals/' + source.id, { headers })).arrayBuffer()), bytes);
    const status = await (await fetch(base + 'status', { headers })).json(); assert.equal(status.sources, 1); assert.equal(status.jobs[0].state, 'queued');
    assert.equal((await fetch(base + 'originals/' + source.id)).status, 401);
  } finally { await runtime.close(); rmSync(root, { recursive: true, force: true }); }
});
await test('a real PDF is extracted on the server and the exact original survives compilation', async () => {
  const { PDFDocument, StandardFonts } = await import('pdf-lib');
  const pdf = await PDFDocument.create(); const page = pdf.addPage();
  page.drawText('INDEX: Experts share residential design and materials knowledge.', { x: 40, y: 750, size: 12, font: await pdf.embedFont(StandardFonts.Helvetica) });
  const bytes = Buffer.from(await pdf.save());
  const root = fixture(); const store = new WikiStore(root); let calls = 0;
  try {
    const { source } = store.addSource({ title: 'PDF extraction verification', name: 'source.pdf', mime: 'application/pdf', bytes }, 'test');
    await compileSource(store, store.source(source.id), async messages => {
      if (++calls === 1) { assert.match(messages[1].content, /residential design/); return { summary: '주거 설계 지식 교류', facts: ['Experts share knowledge.'] }; }
      return { title: 'PDF에서 추출된 지식', content: '전문가가 지식을 나눕니다.', concepts: [] };
    });
    assert.equal(calls, 2); assert.deepEqual(readFileSync(join(root, source.path)), bytes);
    assert.ok(store.source(source.id).content.includes('residential design'));
  } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
});
await test('existing INDEX chat reads approved shared knowledge without exposing review drafts', async () => {
  const root = fixture(); const store = new WikiStore(root); const previous = process.env.INDEX_KNOWLEDGE_DIR;
  process.env.INDEX_KNOWLEDGE_DIR = root;
  try {
    const p = store.savePage(draft(), { expectedVersion: 0 }, 'admin', false);
    assert.deepEqual(await loadServerPublishedWiki(), []);
    store.savePage({ ...p, status: 'published' }, { id: p.id, expectedVersion: 1 }, 'admin', false);
    store.savePage({ ...draft('동선 미검수'), content: 'PRIVATE_DRAFT_MARKER 동선', status: 'review' }, { expectedVersion: 0 }, 'admin', false);
    const pages = await loadServerPublishedWiki();
    assert.equal(pages[0].id, p.id); assert.equal(pages[0].version, 2); assert.ok(!JSON.stringify(pages).includes('PRIVATE_DRAFT_MARKER'));
  } finally { if (previous === undefined) delete process.env.INDEX_KNOWLEDGE_DIR; else process.env.INDEX_KNOWLEDGE_DIR = previous; store.close(); rmSync(root, { recursive: true, force: true }); }
});

await test('GitHub archive includes only reviewed Markdown, omits actor metadata, and blocks sensitive current or historical content', () => {
  const root = fixture(); const store = new WikiStore(root);
  try {
    const first = store.savePage(draft('주거 동선'), { expectedVersion: 0 }, 'private-person@example.com', false);
    store.addSource({ title: '원본 PDF', name: 'source.pdf', bytes: Buffer.from('private PDF bytes'), mime: 'application/pdf' }, 'private-person@example.com');
    const plan = collectMarkdownArchive(root);
    assert.equal(plan.pageCount, 1); assert.equal(plan.revisionCount, 1);
    assert.ok(plan.files.every(file => file.path.endsWith('.md')));
    assert.ok(plan.files.every(file => !file.content.includes('private-person') && !file.content.includes('private PDF bytes')));
    assertReviewedArchive(plan, plan.digest);
    assert.throws(() => assertReviewedArchive(plan, 'unreviewed'), /검토가 필요/);
    const changed = store.savePage({ ...first, content: '문의 private-person@example.com' }, { id: first.id, expectedVersion: 1 }, 'admin', false);
    store.savePage({ ...changed, content: '현재는 연락처를 제거한 본문' }, { id: first.id, expectedVersion: 2 }, 'admin', false);
    const historyPlan = collectMarkdownArchive(root);
    assert.ok(historyPlan.entries.some(entry => entry.path.endsWith('/2.md') && entry.warnings.includes('이메일 주소')));
    assert.throws(() => assertReviewedArchive(historyPlan, historyPlan.digest), /개인정보/);
    assert.ok(privacyWarnings('연락처 010-1234-5678').includes('전화번호'));
    assert.ok(privacyWarnings('sk-abcdefghijklmnopqrstuvwxyz123456').includes('API 키 또는 인증 정보'));
  } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
});
