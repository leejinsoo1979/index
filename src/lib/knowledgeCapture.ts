import { knowledgeRequest, ingestWikiFile } from './knowledgeServer';
import { firebaseAuth } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';

const models = new Set(['Document', 'DocumentBlock', 'Citation', 'KnowledgeSource', 'KnowledgeChunk', 'OntologyNode', 'OntologyEdge', 'ChatMessage', 'ChannelMessage', 'Task', 'TaskEvent', 'AgentAction', 'AdminPost', 'Seminar']);
type Event = { eventId: string; model: string; entityId: string; operation: string; data: unknown; uid: string; file?: File };
let database: Promise<IDBDatabase> | undefined;
let flushing = false;
export let knowledgeCaptureError = '';
function db() {
  return database ||= new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open('index-knowledge-outbox', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('events', { keyPath: 'eventId' });
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
}
async function operation<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) {
  const database = await db();
  return new Promise<T>((resolve, reject) => {
    const tx = database.transaction('events', mode), request = fn(tx.objectStore('events'));
    tx.oncomplete = () => resolve(request.result); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  });
}
export async function pendingKnowledgeEvents() { return (await operation('readonly', s => s.getAll()) as Event[]).filter(e => e.uid === firebaseAuth?.currentUser?.uid).length; }
export async function flushKnowledgeEvents() {
  if (flushing || !firebaseAuth?.currentUser) return;
  flushing = true;
  try {
    const uid = firebaseAuth.currentUser.uid;
    const rows = (await operation('readonly', s => s.getAll()) as Event[]).filter(e => e.uid === uid).slice(0, 40);
    if (rows.length) {
      for (const row of rows.filter(e => e.file)) {
        await ingestWikiFile(row.file!);
        await operation('readwrite', s => s.delete(row.eventId));
      }
      const events = rows.filter(e => !e.file);
      if (events.length) {
        await knowledgeRequest('events', { method: 'POST', body: JSON.stringify({ events: events.map(({ uid: _uid, ...event }) => event) }) });
        for (const row of events) await operation('readwrite', s => s.delete(row.eventId));
      }
    }
    knowledgeCaptureError = '';
  } catch (error) { knowledgeCaptureError = error instanceof Error ? error.message : '지식 기록 동기화 실패'; }
  finally { flushing = false; }
}
/** Stage original Studio PDFs/text durably before the tab can be closed; delivery uses the same acknowledged outbox. */
export async function captureKnowledgeFile(key: string, bytes: Uint8Array) {
  if (!/\.(pdf|md|txt)$/i.test(key) || typeof indexedDB === 'undefined' || !firebaseAuth?.currentUser) return;
  if (bytes.length > 20 * 1024 * 1024) { knowledgeCaptureError = '20MB를 초과한 원본은 별도 위키 가져오기가 필요합니다.'; return; }
  const file = new File([bytes.slice().buffer], key.split('/').pop() || 'source.txt');
  const event: Event = { eventId: crypto.randomUUID(), model: 'KnowledgeSource', entityId: key, operation: 'upload', data: { originalKey: key }, uid: firebaseAuth.currentUser.uid, file };
  await operation('readwrite', s => s.put(event));
  void flushKnowledgeEvents();
}
/** Persist before attempting delivery; server event IDs make retries idempotent. Credentials and member profiles are not capture targets. */
export function captureKnowledge(model: string, entityId: string, data: unknown, operationName = 'save') {
  if (!models.has(model) || typeof indexedDB === 'undefined' || !firebaseAuth?.currentUser) return;
  const event: Event = { eventId: crypto.randomUUID(), model, entityId, operation: operationName, data: JSON.parse(JSON.stringify(data)), uid: firebaseAuth.currentUser.uid };
  void operation('readwrite', s => s.put(event)).then(() => flushKnowledgeEvents()).catch(error => { knowledgeCaptureError = String(error); });
}
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void flushKnowledgeEvents());
  setInterval(() => void flushKnowledgeEvents(), 15000);
  if (firebaseAuth) onAuthStateChanged(firebaseAuth, () => void flushKnowledgeEvents());
}
