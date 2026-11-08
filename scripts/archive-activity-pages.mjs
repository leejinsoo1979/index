// One-off cleanup: wiki pages that were compiled only from studio activity records
// (document blocks, AI chats, ontology records) are moved to 'archived' — never deleted,
// every page keeps its revision history. Run only while the knowledge server is stopped.
//   node scripts/archive-activity-pages.mjs [--apply]
import { WikiStore } from '../server/wiki/store.mjs';

const apply = process.argv.includes('--apply');
const store = new WikiStore(process.env.INDEX_KNOWLEDGE_DIR || '.index-knowledge');
try {
  const kinds = new Map(store.db.prepare('SELECT id, data FROM sources').all().map((r) => [r.id, JSON.parse(r.data).kind]));
  const targets = store.pages().filter((p) => p.status !== 'archived' && (p.sources ?? []).length > 0 && p.sources.every((s) => kinds.get(s.id ?? s.sourceId) === 'activity'));
  console.log(`${apply ? '보관 처리' : '대상(미리보기)'}: ${targets.length}개`);
  for (const p of targets) {
    if (apply) store.savePage({ ...p, status: 'archived' }, { id: p.id, expectedVersion: p.version, reason: '스튜디오 작업 기록에서 자동 생성된 문서 — 보관' }, 'system:cleanup', false);
    console.log(`- ${p.title}`);
  }
} finally {
  store.close();
}
