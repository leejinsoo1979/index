import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync, cpSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { loadEnvironment } from '../server/wiki/env.mjs';
loadEnvironment();
const root = resolve(process.env.INDEX_KNOWLEDGE_DIR || '.index-knowledge');
const target = resolve(process.argv[2] || join(root, 'backups', new Date().toISOString().replace(/[:.]/g, '-')));
if (existsSync(join(target, 'knowledge.sqlite'))) throw new Error('기존 백업을 덮어쓸 수 없습니다. 새 디렉터리를 지정해 주세요.');
mkdirSync(target, { recursive: true, mode: 0o700 });
const db = new DatabaseSync(join(root, 'knowledge.sqlite'), { readOnly: true });
try {
  await backup(db, join(target, 'knowledge.sqlite'));
  for (const folder of ['raw', 'wiki', 'revisions']) if (existsSync(join(root, folder))) cpSync(join(root, folder), join(target, folder), { recursive: true });
  const snapshot = new DatabaseSync(join(target, 'knowledge.sqlite'), { readOnly: true });
  const integrity = snapshot.prepare('PRAGMA integrity_check').get();
  if (!Object.values(integrity).every(value => value === 'ok')) throw new Error('백업 데이터베이스 무결성 검사가 실패했습니다.');
  const sources = snapshot.prepare('SELECT path FROM sources').all();
  for (const source of sources) if (!existsSync(join(target, source.path))) throw new Error('백업 원본 파일이 누락되었습니다.');
  snapshot.close();
  writeFileSync(join(target, 'manifest.json'), JSON.stringify({ version: 1, createdAt: new Date().toISOString(), sources: sources.length, integrity, includes: ['database', 'raw originals', 'wiki exports', 'revisions'], excludes: ['credentials', 'Mercury runtime state'] }, null, 2), { mode: 0o600 });
  console.log('Verified INDEX knowledge backup: ' + target);
} finally { db.close(); }
