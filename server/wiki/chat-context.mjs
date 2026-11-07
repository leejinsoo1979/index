import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

/** null means this deployment has no shared file database; errors on an existing database are surfaced. */
export async function loadServerPublishedWiki() {
  const root = resolve(process.env.INDEX_KNOWLEDGE_DIR || '.index-knowledge');
  if (!existsSync(join(root, 'knowledge.sqlite'))) return null;
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(join(root, 'knowledge.sqlite'), { readOnly: true });
  try { return db.prepare("SELECT data FROM pages WHERE status='published'").all().map(r => JSON.parse(r.data)); }
  finally { db.close(); }
}
