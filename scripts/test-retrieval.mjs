// Second-brain retrieval tests (server/wiki/retrieval). Run: node --test scripts/test-retrieval.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WikiStore } from '../server/wiki/store.mjs';
import { chunkPages, chunkMarkdown, retrieve, terms } from '../server/wiki/retrieval/index.mjs';

const page = (title, content, extra = {}) => ({ title, content, category: '공간', tags: [], status: 'review', sources: [], pinned: false, cover: 'auto', entryType: 'article', ...extra });

test('Korean terms strip particles and become bigrams', () => {
  assert.deepEqual(terms('방수층은', { query: true }), ['방수', '수층']);
  assert.ok(terms('KS 인증').includes('ks'));
});

test('PDF chunks keep page numbers, never cross pages, and drop web-page chrome', () => {
  const chunks = chunkPages([
    { num: 1, text: '새싹 1:1 채팅 2025.02.18. 09:55 조회 792\n욕조 배수구에 트랩이 없으면 하수구 냄새가 실내로 들어온다. 봉수가 냄새를 막는다.' },
    { num: 2, text: '댓글을 남겨보세요\n등록' },
  ]);
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].page, 1);
  assert.ok(!/조회|채팅/.test(chunks[0].text));
});

test('Markdown chunks carry their heading', () => {
  const chunks = chunkMarkdown('## 원리\n가림턱 뒤 광원에서 천장으로 간 빛이 반사되어 공간을 밝힌다. '.repeat(3) + '\n\n## 관련 항목\n- [[조명 계획]]');
  assert.equal(chunks[0].heading, '원리');
});

test('retrieve: cites passages, honours review filter, ranks association sources above reconstructed notes', async () => {
  const root = mkdtempSync(join(tmpdir(), 'retrieval-'));
  const store = new WikiStore(root);
  try {
    store.savePage(page('발코니 결로', '발코니 확장부의 결로는 단열이 끊긴 모서리에서 생긴다. 단열을 연속으로 시공해야 한다. '.repeat(4), { tags: ['인테리어 지식백과'] }), { expectedVersion: 0 }, 'admin', false);
    const published = store.savePage(page('결로 점검', '결로 점검은 표면 온도와 환기를 함께 본다. 발코니 확장부 모서리 결로를 확인한다. '.repeat(4), { status: 'published' }), { expectedVersion: 0 }, 'admin', false);
    const all = await retrieve(store, '발코니 결로 막는 방법', { k: 5 });
    assert.ok(all.chunks.length >= 2);
    assert.ok(all.chunks.every(c => c.text && c.title && c.trust));
    const approvedOnly = await retrieve(store, '발코니 결로 막는 방법', { k: 5, includeReview: false });
    assert.ok(approvedOnly.chunks.length >= 1 && approvedOnly.chunks.every(c => c.refId === published.id));
    const none = await retrieve(store, '전혀관계없는외계어질문', { k: 5 });
    assert.equal(none.coverage, 'none');
  } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
});
