import { prisma } from '@archi/db';
import { Capabilities } from '@archi/shared';
import { requireWorkspaceCapability } from '@archi-web/lib/authz';
import { extractKnowledgeText } from '@archi-web/lib/services/knowledge';
import { saveStorageFile, storageFileUrl } from '@archi-web/lib/storage';
import type { WikiDraft, WikiSource } from './types';
import { emptyWikiDraft } from './types';
import { knowledgeOriginal } from '@/lib/knowledgeServer';

export type ImportItem = { id: string; title: string; kind: 'document' | 'knowledge' | 'ontology'; subtitle: string };

export async function listWikiImports(userId: string, workspaceId: string): Promise<ImportItem[]> {
  await requireWorkspaceCapability(userId, workspaceId, Capabilities.VIEW_DOCUMENTS);
  const [documents, sources, nodes] = await Promise.all([
    prisma.document.findMany({ where: { project: { workspaceId } }, orderBy: { updatedAt: 'desc' } }),
    prisma.knowledgeSource.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' } }),
    prisma.ontologyNode.findMany({ where: { workspaceId, status: { in: ['CANDIDATE', 'APPROVED'] } }, orderBy: { updatedAt: 'desc' } }),
  ]);
  return [
    ...documents.map(d => ({ id: d.id, title: d.title, kind: 'document' as const, subtitle: '스튜디오 문서' })),
    ...sources.map(s => ({ id: s.id, title: s.title, kind: 'knowledge' as const, subtitle: s.status === 'APPROVED' ? '검수된 원본 자료' : '원본 자료 · 검토 필요' })),
    ...nodes.map(n => ({ id: n.id, title: n.label, kind: 'ontology' as const, subtitle: '지식 그래프 · ' + n.type })),
  ];
}

function blockMarkdown(type: string, content: Record<string, unknown>): string {
  const text = typeof content.text === 'string' ? content.text : typeof content.title === 'string' ? content.title : '';
  if (type === 'heading') return '## ' + text;
  if (type === 'quote' || type === 'callout') return '> ' + text.replace(/\n/g, '\n> ');
  if (type === 'table' && Array.isArray(content.headers) && Array.isArray(content.rows)) {
    const cell = (v: unknown) => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
    return '| ' + content.headers.map(cell).join(' | ') + ' |\n| ' + content.headers.map(() => '---').join(' | ') + ' |\n' + content.rows.map(row => '| ' + (Array.isArray(row) ? row : []).map(cell).join(' | ') + ' |').join('\n');
  }
  if (Array.isArray(content.items)) return content.items.map(item => '- ' + (typeof item === 'string' ? item : String(item?.text ?? item?.question ?? ''))).join('\n');
  return text || String(content.summary ?? content.caption ?? '');
}

export async function draftFromExisting(userId: string, workspaceId: string, item: ImportItem): Promise<WikiDraft> {
  await requireWorkspaceCapability(userId, workspaceId, Capabilities.VIEW_DOCUMENTS);
  const draft = emptyWikiDraft(item.title);
  let source: WikiSource;
  if (item.kind === 'document') {
    const document = await prisma.document.findFirst({ where: { id: item.id, project: { workspaceId } }, include: { blocks: { orderBy: { sortOrder: 'asc' } } } });
    if (!document) throw new Error('문서를 찾을 수 없습니다.');
    draft.content = document.blocks.map(b => blockMarkdown(b.type, b.content as Record<string, unknown>)).filter(Boolean).join('\n\n');
    source = { id: document.id, kind: 'document', title: document.title, href: '/agent-studio/' + document.id, excerpt: draft.content.slice(0, 1000) };
  } else if (item.kind === 'knowledge') {
    const original = await prisma.knowledgeSource.findFirst({ where: { id: item.id, workspaceId }, include: { chunks: { orderBy: { chunkIndex: 'asc' } } } });
    if (!original) throw new Error('원본 자료를 찾을 수 없습니다.');
    if (!original.chunks.length) throw new Error('아직 텍스트가 추출되지 않은 자료입니다. 지식베이스에서 자료를 처리한 뒤 가져와 주세요.');
    draft.content = original.chunks.map(c => c.text).join('\n\n');
    source = { id: original.id, kind: 'knowledge', title: original.title, href: '/agent-studio/sources', fileKey: original.fileKey ?? undefined, storage: 'cloud', excerpt: draft.content.slice(0, 1000) };
  } else {
    const node = await prisma.ontologyNode.findFirst({ where: { id: item.id, workspaceId } });
    if (!node) throw new Error('개념을 찾을 수 없습니다.');
    const edges = await prisma.ontologyEdge.findMany({ where: { workspaceId, OR: [{ sourceNodeId: node.id }, { targetNodeId: node.id }] } });
    const ids = edges.map(e => e.sourceNodeId === node.id ? e.targetNodeId : e.sourceNodeId);
    const related = await prisma.ontologyNode.findMany({ where: { id: { in: ids }, workspaceId } });
    draft.content = (node.description || '') + (related.length ? '\n\n## 연결된 개념\n\n' + related.map(n => '- [[' + n.label + ']]').join('\n') : '');
    draft.category = ({ space: '공간', method: '공법', material: '자재', defect: '하자', regulation: '법규·기준' } as Record<string, string>)[node.type] || '일반';
    source = { id: node.id, kind: 'ontology', title: node.label, href: '/agent-studio/ontology', excerpt: (node.description || '').slice(0, 1000) };
  }
  draft.sources = [source];
  // Imported/AI-produced content is always a draft until explicitly reviewed.
  return draft;
}

async function fileDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('index-wiki-files', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('files');
    request.onerror = () => reject(new Error('원본 파일 저장소를 열지 못했습니다.'));
    request.onsuccess = () => resolve(request.result);
  });
}

export async function draftFromFile(file: File, workspaceId: string, mode: 'cloud' | 'local' | 'server'): Promise<WikiDraft> {
  if (mode === 'server') throw new Error('서버 자료 가져오기를 이용해 주세요.');
  if (!/\.(pdf|md|txt)$/i.test(file.name)) throw new Error('PDF, Markdown, TXT 파일을 선택해 주세요.');
  if (!file.size || file.size > 20 * 1024 * 1024) throw new Error('파일 크기는 1byte 이상, 20MB 이하여야 합니다.');
  const data = new Uint8Array(await file.arrayBuffer());
  const content = await extractKnowledgeText(data, file.name);
  if (!content.trim()) throw new Error('텍스트를 찾을 수 없습니다. 스캔 PDF는 OCR로 변환한 후 가져와 주세요.');
  if (content.length > 120_000) throw new Error('문서가 너무 큽니다. 120,000자 이하로 나눠 가져와 주세요.');
  const id = crypto.randomUUID();
  const fileKey = 'wiki/originals/' + workspaceId + '/' + id + '/' + file.name.replace(/[^\w.가-힣-]/g, '_');
  if (mode === 'cloud') await saveStorageFile(fileKey, data);
  else {
    const db = await fileDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction('files', 'readwrite');
        transaction.objectStore('files').put(file, fileKey);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(new Error('원본 파일 저장에 실패했습니다.'));
        transaction.onabort = () => reject(new Error('원본 파일 저장이 취소되었습니다.'));
      });
    } finally { db.close(); }
  }
  return { ...emptyWikiDraft(file.name.replace(/\.[^.]+$/, '')), content, sources: [{ id, kind: 'file', title: file.name, fileKey, storage: mode, excerpt: content.slice(0, 1000) }] };
}

export async function originalFileUrl(source: WikiSource) {
  if (!source.fileKey) return null;
  if (source.storage === 'server') return knowledgeOriginal(source.fileKey);
  if (source.storage !== 'local') return storageFileUrl(source.fileKey);
  const db = await fileDatabase();
  try {
    const file = await new Promise<Blob>((resolve, reject) => {
      const request = db.transaction('files', 'readonly').objectStore('files').get(source.fileKey!);
      request.onsuccess = () => request.result ? resolve(request.result as Blob) : reject(new Error('이 브라우저에서 원본 파일을 찾지 못했습니다.'));
      request.onerror = () => reject(new Error('원본 파일을 읽지 못했습니다.'));
    });
    return URL.createObjectURL(file);
  } finally { db.close(); }
}
