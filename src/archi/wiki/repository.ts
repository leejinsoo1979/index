import { collection, doc, getDocsFromServer, query, runTransaction, where } from 'firebase/firestore';
import { firebaseAuth, firebaseDb, isFirebaseConfigured } from '@/lib/firebase';
import { normalizeDraft, WikiConflictError, type WikiPage, type WikiRepository, type WikiRevision } from './types';
import { knowledgeRequest } from '@/lib/knowledgeServer';

type LocalVault = { pages: WikiPage[]; revisions: WikiRevision[] };
type TextStorage = Pick<Storage, 'getItem' | 'setItem'>;

function makePage(workspaceId: string, actor: string, draft: Parameters<WikiRepository['save']>[0], id: string, current?: WikiPage): WikiPage {
  const now = new Date().toISOString();
  const normalized = normalizeDraft(draft);
  const aliases = [...new Set([...(current?.aliases ?? []), ...(current && current.title !== normalized.title ? [current.title] : [])])].filter(title => title !== normalized.title);
  return { ...normalized, id, workspaceId, version: (current?.version ?? 0) + 1, createdAt: current?.createdAt ?? now, updatedAt: now, updatedBy: actor, aliases };
}

function revision(page: WikiPage, reason?: string): WikiRevision {
  return { ...page, revisionId: page.id + '-' + page.version, reason: reason || (page.version === 1 ? '문서 생성' : '문서 수정') };
}

/** One atomic localStorage value holds both pages and immutable revisions. Never falls back after cloud errors. */
export function createLocalWikiRepository(workspaceId: string, actor: string, storage: TextStorage = window.localStorage): WikiRepository {
  const key = 'index-wiki:v1:' + workspaceId;
  const read = (): LocalVault => {
    const raw = storage.getItem(key);
    if (!raw) return { pages: [], revisions: [] };
    const value = JSON.parse(raw) as LocalVault;
    if (!Array.isArray(value.pages) || !Array.isArray(value.revisions)) throw new Error('라이브러리 저장 데이터가 손상되었습니다. 백업을 확인해 주세요.');
    return value;
  };
  return {
    mode: 'local',
    async list() { return read().pages; },
    async save(draft, options) {
      const commit = () => {
      const vault = read();
      const id = options.id || crypto.randomUUID();
      const current = vault.pages.find(page => page.id === id);
      if ((current?.version ?? 0) !== options.expectedVersion || (options.id && !current)) throw new WikiConflictError();
      const page = makePage(workspaceId, actor, draft, id, current);
      const next = { pages: [...vault.pages.filter(p => p.id !== id), page], revisions: [...vault.revisions, revision(page, options.reason)] };
      // Quota/permission failures propagate: UI must retain the unsaved draft.
      storage.setItem(key, JSON.stringify(next));
      return page;
      };
      // Serialize writers across browser tabs when the browser supports Web Locks.
      return typeof window !== 'undefined' && navigator.locks ? navigator.locks.request(key, async () => commit()) : commit();
    },
    async history(pageId) { return read().revisions.filter(r => r.id === pageId).sort((a, b) => b.version - a.version); },
  };
}

export function createLegacyWikiRepository(workspaceId: string, actor: string): WikiRepository {
  if (!isFirebaseConfigured) return createLocalWikiRepository(workspaceId, actor);
  const db = firebaseDb, uid = firebaseAuth?.currentUser?.uid;
  if (!db || !uid) throw new Error('라이브러리를 열려면 다시 로그인해 주세요.');
  // Existing owner-only Firestore rule: /archiStudio/{uid}/{model}/{recordId}.
  const pages = collection(db, 'archiStudio', uid, 'WikiPage');
  const revisions = collection(db, 'archiStudio', uid, 'WikiRevision');
  const ensureIdentity = () => {
    if (firebaseAuth?.currentUser?.uid !== uid) throw new Error('계정이 변경되었습니다. 라이브러리를 다시 열어 주세요.');
  };
  return {
    mode: 'cloud',
    async list() {
      ensureIdentity();
      const snapshot = await getDocsFromServer(query(pages, where('workspaceId', '==', workspaceId)));
      return snapshot.docs.map(row => row.data() as WikiPage);
    },
    async save(draft, options) {
      ensureIdentity();
      const id = options.id || crypto.randomUUID();
      const reference = doc(pages, id);
      return runTransaction(db, async transaction => {
        const snapshot = await transaction.get(reference);
        const current = snapshot.exists() ? snapshot.data() as WikiPage : undefined;
        if ((current?.version ?? 0) !== options.expectedVersion || (options.id && !current)) throw new WikiConflictError();
        if (current && current.workspaceId !== workspaceId) throw new Error('다른 작업공간의 문서는 수정할 수 없습니다.');
        const page = makePage(workspaceId, actor, draft, id, current);
        const rev = revision(page, options.reason);
        transaction.set(reference, JSON.parse(JSON.stringify(page)));
        transaction.set(doc(revisions, rev.revisionId), JSON.parse(JSON.stringify(rev)));
        return page;
      });
    },
    async history(pageId) {
      ensureIdentity();
      const snapshot = await getDocsFromServer(query(revisions, where('id', '==', pageId)));
      return snapshot.docs.map(row => row.data() as WikiRevision).filter(row => row.workspaceId === workspaceId).sort((a, b) => b.version - a.version);
    },
  };
}

/** Shared INDEX server storage; connection errors never silently switch stores. */
export function createWikiRepository(_workspaceId: string, _actor: string): WikiRepository {
  return {
    mode: 'server',
    list: () => knowledgeRequest<WikiPage[]>('pages'),
    save: (draft, options) => knowledgeRequest<WikiPage>('pages', { method: 'POST', body: JSON.stringify({ draft: normalizeDraft(draft), options }) }),
    history: id => knowledgeRequest<WikiRevision[]>('pages/' + encodeURIComponent(id) + '/history'),
  };
}
