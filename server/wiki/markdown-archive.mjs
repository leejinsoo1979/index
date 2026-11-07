import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const sha256 = value => createHash('sha256').update(value).digest('hex');
const idPattern = /^[a-zA-Z0-9_-]{1,100}$/;
export function markdownForArchive(page) {
  if (!idPattern.test(page.id) || !Number.isSafeInteger(page.version) || page.version < 1) throw new Error('문서 식별자 또는 버전이 올바르지 않습니다.');
  // Explicit metadata allowlist: never export actors, emails, activity records or credentials.
  const metadata = {
    title: page.title, aliases: page.aliases || [],
    entryType: page.entryType || (page.id.startsWith('source-') ? 'source' : 'article'),
    category: page.category || '일반', tags: page.tags || [], status: page.status,
    version: page.version, sources: (page.sources || []).map(source => source.id),
  };
  return '---\n' + Object.entries(metadata).map(([key, value]) => key + ': ' + JSON.stringify(value)).join('\n') + '\n---\n\n# ' + page.title + '\n\n' + page.content + '\n';
}
export function privacyWarnings(content) {
  const rules = [
    ['이메일 주소', /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i],
    ['전화번호', /(?<!\d)(?:\+82[- .]?)?0?(?:1[016789]|2|[3-6][1-5])[- .]?\d{3,4}[- .]?\d{4}(?!\d)/],
    ['주민등록번호', /\b\d{6}[- ]?[1-8]\d{6}\b/],
    ['API 키 또는 인증 정보', /\bsk-[A-Za-z0-9_-]{16,}|Bearer\s+[A-Za-z0-9_.-]{16,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i],
    ['인증 정보가 포함된 URL', /https?:\/\/[^\s/@:]+:[^\s/@]+@/i],
  ];
  return rules.filter(([, pattern]) => pattern.test(content)).map(([label]) => label);
}
export function collectMarkdownArchive(root) {
  const db = new DatabaseSync(join(root, 'knowledge.sqlite'), { readOnly: true });
  const files = [];
  let pages, revisions;
  try {
    db.exec('BEGIN');
    pages = db.prepare('SELECT data FROM pages ORDER BY id').all().map(row => JSON.parse(row.data));
    revisions = db.prepare('SELECT data FROM revisions ORDER BY page_id,version').all().map(row => JSON.parse(row.data));
    db.exec('COMMIT');
  } finally { db.close(); }
  for (const page of pages) files.push({ path: `wiki/${page.id}.md`, content: markdownForArchive(page) });
  for (const page of revisions) files.push({ path: `revisions/${page.id}/${page.version}.md`, content: markdownForArchive(page) });
  files.sort((a, b) => a.path.localeCompare(b.path));
  const entries = files.map(file => ({ path: file.path, sha256: sha256(file.content), warnings: privacyWarnings(file.content) }));
  return { files, entries, digest: sha256(JSON.stringify(entries)), pageCount: pages.length, revisionCount: revisions.length };
}
export function assertReviewedArchive(plan, approvedDigest) {
  if (plan.entries.some(entry => entry.warnings.length)) throw new Error('개인정보 또는 인증 정보가 감지되어 백업을 중단했습니다. 로컬 검토 목록을 확인해 주세요.');
  if (plan.digest !== approvedDigest) throw new Error('새 문서나 변경된 내용의 개인정보 검토가 필요합니다. --plan으로 목록을 확인한 후 검토한 해시만 승인해 주세요.');
}
