import { WIKI_COVERS, type WikiCoverChoice } from './covers';
export type WikiStatus = 'draft' | 'review' | 'published' | 'archived';
export type WikiSource = {
  id: string;
  kind: 'file' | 'document' | 'knowledge' | 'ontology';
  title: string;
  excerpt?: string;
  href?: string;
  fileKey?: string;
  storage?: 'cloud' | 'local' | 'server';
};

export type WikiDraft = {
  title: string;
  entryType?: 'article' | 'source' | 'note';
  content: string;
  category: string;
  tags: string[];
  status: WikiStatus;
  sources: WikiSource[];
  pinned: boolean;
  cover: WikiCoverChoice;
};

export type WikiPage = WikiDraft & {
  id: string;
  workspaceId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
  aliases: string[];
};

export type WikiRevision = WikiPage & { revisionId: string; reason: string };

export interface WikiRepository {
  readonly mode: 'cloud' | 'local' | 'server';
  list(): Promise<WikiPage[]>;
  save(draft: WikiDraft, options: { id?: string; expectedVersion: number; reason?: string }): Promise<WikiPage>;
  history(pageId: string): Promise<WikiRevision[]>;
}

export const WIKI_CATEGORIES = ['일반', '공간', '설계·디자인', '공법', '자재', '주거 환경', '하자', '법규·기준', '디지털·AI', '사업·협업', '현장 기록'];
export const WIKI_STATUS: Record<WikiStatus, string> = { draft: '초안', review: '검토 대기', published: '검수 완료', archived: '보관됨' };

export function emptyWikiDraft(title = ''): WikiDraft {
  return { title, content: '', category: '일반', tags: [], status: 'draft', sources: [], pinned: false, cover: 'auto' };
}

export function normalizeDraft(draft: WikiDraft): WikiDraft {
  const title = draft.title.trim();
  if (!title || title.length > 200) throw new Error('문서 제목은 1~200자로 입력해 주세요.');
  if (draft.content.length > 120_000) throw new Error('문서 본문은 120,000자까지 저장할 수 있습니다. 문서를 나눠 주세요.');
  if (!Object.hasOwn(WIKI_STATUS, draft.status)) throw new Error('문서 상태가 올바르지 않습니다.');
  if (draft.sources.length > 40) throw new Error('한 문서에는 출처를 40개까지 연결할 수 있습니다.');
  return {
    title, entryType: draft.entryType === 'source' || draft.entryType === 'note' ? draft.entryType : draft.entryType === 'article' ? 'article' : ('id' in draft && String(draft.id).startsWith('source-') ? 'source' : 'article'), content: draft.content, category: draft.category.trim().slice(0, 50) || '일반',
    tags: [...new Set(draft.tags.map(t => t.trim().slice(0, 40)).filter(Boolean))].slice(0, 20),
    status: draft.status, sources: draft.sources.map(source => ({
      ...source, title: source.title.slice(0, 200), excerpt: (source.excerpt ?? '').slice(0, 1500),
    })), pinned: Boolean(draft.pinned), cover: draft.cover && Object.hasOwn(WIKI_COVERS, draft.cover) ? draft.cover : 'auto',
  };
}

export class WikiConflictError extends Error {
  constructor() { super('다른 창에서 문서가 수정되었습니다. 작성 중인 내용을 복사한 후 최신 문서를 다시 열어 주세요.'); }
}
