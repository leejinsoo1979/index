'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BlockTypes } from '@archi/editor';
import { apiFetch } from '@archi-web/lib/client/api';
import { moveItem } from '@archi-web/lib/client/reorder';
import { ImageGenerateModal } from '@archi-web/components/image/ImageGenerateModal';
import { InpaintModal } from '@archi-web/components/image/InpaintModal';
import { ArrowDown, ArrowUp, Copy, GripVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import { BlockContentEditor } from './BlockContentEditor';
import { AI_IMAGE, BlockPalette, QUICK_TYPES, paletteItem } from './BlockPalette';
import './BlockEditor.css';

export type CanvasLayout = { x: number; y: number; w: number; h: number };

export type EditorBlock = {
  id: string;
  type: string;
  sortOrder: number;
  parentId?: string | null;
  content: Record<string, unknown>;
  metadata?: { canvas?: CanvasLayout | null } & Record<string, unknown>;
};

export type DocumentWithBlocks = {
  id: string;
  projectId: string;
  title: string;
  status: string;
  blocks: EditorBlock[];
};

const NEW_BLOCK_DEFAULTS: Record<string, Record<string, unknown>> = {
  [BlockTypes.HEADING]: { level: 2, text: '' },
  [BlockTypes.PARAGRAPH]: { text: '' },
  [BlockTypes.IMAGE]: { url: '', caption: '' },
  [BlockTypes.CHECKLIST]: { title: '', items: [{ text: '', checked: false }] },
  [BlockTypes.SOURCE_REFERENCE]: { title: '', summary: '', citations: [] },
  [BlockTypes.CTA]: { text: '', buttonLabel: '', url: '' },
  [BlockTypes.CHART]: {
    chartType: 'bar',
    title: '',
    labels: ['항목 1', '항목 2', '항목 3'],
    series: [{ name: '', values: [10, 20, 15] }],
  },
  [BlockTypes.TABLE]: {
    title: '',
    headers: ['항목', '규격', '비고'],
    rows: [['', '', '']],
  },
  [BlockTypes.FORMULA]: {
    title: '',
    expression: '',
    variables: [],
    result: '',
  },
  [BlockTypes.DOC_META]: {
    docCode: '',
    version: 'v1.0',
    author: '',
    publishedAt: '',
    reviewStatus: 'draft',
  },
  [BlockTypes.QNA]: {
    title: '현장 Q&A',
    items: [{ question: '', answer: '', basis: '' }],
  },
  [BlockTypes.LAW_REFERENCE]: { law: '', article: '', clause: '', summary: '', link: '' },
  [BlockTypes.CALLOUT]: { variant: 'info', title: '', text: '' },
  [BlockTypes.QUOTE]: { text: '', attribution: '' },
  [BlockTypes.CODE]: { language: '', code: '' },
  [BlockTypes.COST_TABLE]: {
    title: '',
    currency: '원',
    items: [{ name: '', spec: '', quantity: 1, unit: '', unitPrice: 0 }],
    note: '',
  },
  [BlockTypes.CONSTRUCTION_DETAIL]: {
    title: '',
    imageUrl: '',
    imagePrompt: '',
    steps: [''],
    notes: '',
  },
  [BlockTypes.CONTAINER]: { title: '새 컨테이너', collapsed: false },
  [BlockTypes.RICH_TEXT]: { text: '', format: 'markdown' },
  [BlockTypes.IMAGE_GALLERY]: { title: '', images: [{ url: '', caption: '', prompt: '' }] },
  [BlockTypes.BEFORE_AFTER]: {
    title: '',
    before: { url: '', label: '시공 전', prompt: '' },
    after: { url: '', label: '시공 후', prompt: '' },
  },
  [BlockTypes.DIAGRAM]: { title: '', source: '', imageUrl: '' },
  [BlockTypes.CONSTRUCTION_STANDARD]: {
    title: '',
    standardCode: '',
    clauses: [{ no: '1', text: '' }],
  },
  [BlockTypes.MATERIAL_SPEC]: { material: '', specs: [{ key: '', value: '' }] },
  [BlockTypes.SCHEDULE]: { title: '', items: [{ task: '', start: '', end: '', owner: '' }] },
  [BlockTypes.RISK_WARNING]: { severity: 'medium', title: '', risk: '', mitigation: '' },
  [BlockTypes.SEO_META]: { title: '', description: '', keywords: [], slug: '' },
  [BlockTypes.BLOG_SECTION]: { heading: '', body: '' },
  [BlockTypes.TECHNICAL_SECTION]: { heading: '', body: '', references: [] },
  [BlockTypes.ONTOLOGY_SUMMARY]: { title: '관련 지식', nodes: [] },
};

/** Block types this editor can create (palette hides anything else). ontology_summary is retired:
 *  existing blocks still render, but new ones can't be added. */
const AVAILABLE: ReadonlySet<string> = new Set(Object.values(BlockTypes).filter((t) => t !== 'ontology_summary'));

const BLOCK_TYPE_LABELS: Record<string, string> = {
  heading: '제목',
  paragraph: '문단',
  image: '이미지',
  checklist: '체크리스트',
  source_reference: '출처',
  cta: 'CTA',
  chart: '차트',
  table: '표',
  formula: '계산식',
  doc_meta: '문서정보',
  qna: 'Q&A',
  law_reference: '법규',
  callout: '강조',
  quote: '인용',
  code: '코드',
  cost_table: '견적표',
  construction_detail: '시공상세',
  container: '컨테이너',
  rich_text: '서식 텍스트',
  image_gallery: '갤러리',
  before_after: '전/후 비교',
  diagram: '다이어그램',
  construction_standard: '시공기준',
  material_spec: '자재사양',
  schedule: '공정표',
  risk_warning: '위험경고',
  seo_meta: 'SEO',
  blog_section: '블로그섹션',
  technical_section: '기술섹션',
  ontology_summary: '지식 요약(사용 중단)',
};

type Props = {
  documentId: string;
  selectedBlockId: string | null;
  onSelectBlock: (blockId: string | null) => void;
  /** AI action 실행 등 외부 변경 후 재로드 트리거 */
  reloadKey?: number;
  /** 블록 목록 사이드바 등 외부에 현재 블록 상태 전달 */
  onBlocksLoaded?: (blocks: EditorBlock[]) => void;
  /** 상단 바에 문서 메타 전달 */
  onDocumentLoaded?: (doc: { id: string; projectId: string; title: string; status: string }) => void;
  /** 상단 바에 저장 상태 전달 */
  onSaveStateChange?: (state: 'idle' | 'saving' | 'saved') => void;
  /** 외부(우측 패널)에서 블록 추가 메뉴 열기 트리거 */
  openAddMenuKey?: number;
};

export function BlockEditor({
  documentId,
  selectedBlockId,
  onSelectBlock,
  reloadKey,
  onBlocksLoaded,
  onDocumentLoaded,
  onSaveStateChange,
  openAddMenuKey,
}: Props) {
  const [doc, setDoc] = useState<DocumentWithBlocks | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [palette, setPalette] = useState<{ after: string } | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<{ id: string; position: 'before' | 'after' } | null>(null);
  const itemRefs = useRef<Map<string, HTMLLIElement>>(new Map());
  const imageInsertAfter = useRef<string | undefined>(undefined);
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [inpaintTarget, setInpaintTarget] = useState<EditorBlock | null>(null);
  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const load = useCallback(() => {
    setLoading(true);
    apiFetch<DocumentWithBlocks>(`/api/documents/${documentId}`)
      .then((data) => {
        setDoc(data);
        setError(null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [documentId]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  useEffect(() => {
    if (doc) {
      onBlocksLoaded?.(doc.blocks);
      onDocumentLoaded?.({
        id: doc.id,
        projectId: doc.projectId,
        title: doc.title,
        status: doc.status,
      });
    }
  }, [doc, onBlocksLoaded, onDocumentLoaded]);

  useEffect(() => {
    onSaveStateChange?.(saveState);
  }, [saveState, onSaveStateChange]);

  // 마운트 시점(예: 보기 모드 전환 후 재마운트)에는 열지 않고, 키가 실제로 바뀔 때만 메뉴를 연다.
  const addMenuKeyRef = useRef(openAddMenuKey);
  useEffect(() => {
    if (openAddMenuKey !== addMenuKeyRef.current && openAddMenuKey && openAddMenuKey > 0) {
      setPalette({ after: 'end' });
    }
    addMenuKeyRef.current = openAddMenuKey;
  }, [openAddMenuKey]);

  /** 블록 내용 변경: 로컬 즉시 반영 + 800ms 디바운스 autosave */
  function handleBlockChange(blockId: string, content: Record<string, unknown>) {
    setDoc((prev) =>
      prev
        ? {
            ...prev,
            blocks: prev.blocks.map((b) => (b.id === blockId ? { ...b, content } : b)),
          }
        : prev,
    );
    const timers = saveTimers.current;
    const existing = timers.get(blockId);
    if (existing) clearTimeout(existing);
    setSaveState('saving');
    timers.set(
      blockId,
      setTimeout(() => {
        apiFetch(`/api/blocks/${blockId}`, {
          method: 'PATCH',
          body: JSON.stringify({ content }),
        })
          .then(() => setSaveState('saved'))
          .catch((e: Error) => setError(e.message));
        timers.delete(blockId);
      }, 800),
    );
  }

  /** Insert a new block after `afterBlockId` (undefined → server default position / end). */
  async function insertBlock(type: string, afterBlockId: string | undefined) {
    setPalette(null);
    if (type === AI_IMAGE) {
      imageInsertAfter.current = afterBlockId;
      setImageModalOpen(true);
      return;
    }
    try {
      const block = await apiFetch<EditorBlock>(`/api/documents/${documentId}/blocks`, {
        method: 'POST',
        body: JSON.stringify({
          afterBlockId,
          block: { type, content: NEW_BLOCK_DEFAULTS[type] ?? {} },
        }),
      });
      load();
      onSelectBlock(block.id);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleDuplicate(block: EditorBlock) {
    setMenuFor(null);
    try {
      const copy = await apiFetch<EditorBlock>(`/api/documents/${documentId}/blocks`, {
        method: 'POST',
        body: JSON.stringify({ afterBlockId: block.id, block: { type: block.type, content: block.content } }),
      });
      load();
      onSelectBlock(copy.id);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleDeleteBlock(blockId: string) {
    setMenuFor(null);
    try {
      await apiFetch(`/api/blocks/${blockId}`, { method: 'DELETE' });
      if (selectedBlockId === blockId) onSelectBlock(null);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  /** Persist a new order (optimistic, then server reorder; reload on failure). */
  async function applyOrder(nextIds: string[]) {
    if (!doc) return;
    const ids = doc.blocks.map((b) => b.id);
    if (nextIds.join() === ids.join()) return;
    setDoc({
      ...doc,
      blocks: nextIds
        .map((id) => doc.blocks.find((b) => b.id === id))
        .filter((b): b is EditorBlock => Boolean(b)),
    });
    try {
      await apiFetch(`/api/documents/${documentId}/reorder-blocks`, {
        method: 'POST',
        body: JSON.stringify({ blockIds: nextIds }),
      });
    } catch (e) {
      setError((e as Error).message);
      load();
    }
  }

  function handleMove(blockId: string, direction: 'up' | 'down') {
    setMenuFor(null);
    if (!doc) return;
    const ids = doc.blocks.map((b) => b.id);
    void applyOrder(moveItem(ids, ids.indexOf(blockId), direction));
  }

  function handleDrop(targetId: string, position: 'before' | 'after') {
    const dragged = dragId;
    setDragId(null);
    setDropAt(null);
    if (!doc || !dragged || dragged === targetId) return;
    const ids = doc.blocks.map((b) => b.id).filter((id) => id !== dragged);
    const at = ids.indexOf(targetId);
    if (at < 0) return;
    ids.splice(position === 'before' ? at : at + 1, 0, dragged);
    void applyOrder(ids);
  }

  if (loading && !doc) {
    return <div className="be-state">문서를 불러오는 중…</div>;
  }

  if (error && !doc) {
    return <div className="be-state be-state--error">{error}</div>;
  }

  if (!doc) return null;

  const lastId = doc.blocks[doc.blocks.length - 1]?.id;

  return (
    <div className="be relative flex h-full flex-col" onClick={() => setMenuFor(null)}>
      {error && (
        <p className="be-error" role="alert">
          {error}
        </p>
      )}

      <div className="be-scroll flex-1 overflow-y-auto">
        {doc.blocks.length === 0 ? (
          <div className="be-empty">
            <strong>빈 문서입니다</strong>
            <span>블록을 추가하거나, 왼쪽 AI 패널에 “블로그 초안 써줘”처럼 요청하면 자동으로 채워집니다.</span>
            <div className="be-empty__quick">
              {QUICK_TYPES.filter((t) => AVAILABLE.has(t)).map((t) => {
                const item = paletteItem(t);
                return (
                  <button key={t} type="button" onClick={() => void insertBlock(t, undefined)}>
                    {item?.icon}
                    {item?.label ?? BLOCK_TYPE_LABELS[t]}
                  </button>
                );
              })}
              <button type="button" className="is-more" onClick={() => setPalette({ after: 'end' })}>
                <Plus size={15} />
                모든 블록
              </button>
            </div>
            {palette?.after === 'end' && (
              <div className="be-anchor">
                <BlockPalette available={AVAILABLE} onPick={(t) => void insertBlock(t, undefined)} onClose={() => setPalette(null)} />
              </div>
            )}
          </div>
        ) : (
          <ul className="be-list">
            {doc.blocks.map((block, index) => {
              const isSelected = selectedBlockId === block.id;
              const drop = dropAt?.id === block.id ? dropAt.position : null;
              const hasImageEdit = block.type === 'image' && Boolean((block.content as { versionId?: string }).versionId);
              return (
                <li
                  key={block.id}
                  ref={(el) => {
                    if (el) itemRefs.current.set(block.id, el);
                    else itemRefs.current.delete(block.id);
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuFor(null);
                    onSelectBlock(block.id);
                  }}
                  onDragOver={(e) => {
                    if (!dragId) return;
                    e.preventDefault();
                    const rect = e.currentTarget.getBoundingClientRect();
                    const position = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
                    if (dropAt?.id !== block.id || dropAt.position !== position) setDropAt({ id: block.id, position });
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dropAt) handleDrop(block.id, dropAt.position);
                  }}
                  className={`be-block${isSelected ? ' is-selected' : ''}${dragId === block.id ? ' is-dragging' : ''}${
                    drop ? ` drop-${drop}` : ''
                  }${block.parentId ? ' is-child' : ''}`}
                >
                  <div className="be-gutter" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="be-gutter__btn"
                      aria-label="아래에 블록 추가"
                      title="아래에 블록 추가"
                      onClick={() => {
                        setMenuFor(null);
                        setPalette((cur) => (cur?.after === block.id ? null : { after: block.id }));
                      }}
                    >
                      <Plus size={15} />
                    </button>
                    <button
                      type="button"
                      className="be-gutter__btn be-gutter__handle"
                      aria-label="끌어서 이동 · 눌러서 메뉴"
                      title="끌어서 이동 · 눌러서 메뉴"
                      draggable
                      onDragStart={(e) => {
                        setPalette(null);
                        setMenuFor(null);
                        setDragId(block.id);
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', block.id);
                        const row = itemRefs.current.get(block.id);
                        if (row) e.dataTransfer.setDragImage(row, 24, 18);
                      }}
                      onDragEnd={() => {
                        setDragId(null);
                        setDropAt(null);
                      }}
                      onClick={() => {
                        setPalette(null);
                        setMenuFor((cur) => (cur === block.id ? null : block.id));
                      }}
                    >
                      <GripVertical size={15} />
                    </button>
                  </div>

                  {menuFor === block.id && (
                    <div className="be-menu" role="menu" onClick={(e) => e.stopPropagation()}>
                      <p className="be-menu__label">{BLOCK_TYPE_LABELS[block.type] ?? block.type}</p>
                      <button type="button" role="menuitem" onClick={() => handleMove(block.id, 'up')} disabled={index === 0}>
                        <ArrowUp size={14} /> 위로 이동
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => handleMove(block.id, 'down')}
                        disabled={index === doc.blocks.length - 1}
                      >
                        <ArrowDown size={14} /> 아래로 이동
                      </button>
                      <button type="button" role="menuitem" onClick={() => void handleDuplicate(block)}>
                        <Copy size={14} /> 복제
                      </button>
                      {hasImageEdit && (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setMenuFor(null);
                            setInpaintTarget(block);
                          }}
                        >
                          <Pencil size={14} /> 이미지 부분 수정
                        </button>
                      )}
                      <button type="button" role="menuitem" className="is-danger" onClick={() => void handleDeleteBlock(block.id)}>
                        <Trash2 size={14} /> 삭제
                      </button>
                    </div>
                  )}

                  {palette?.after === block.id && (
                    <div className="be-anchor" onClick={(e) => e.stopPropagation()}>
                      <BlockPalette
                        available={AVAILABLE}
                        placement={index >= doc.blocks.length - 2 && doc.blocks.length > 3 ? 'above' : 'below'}
                        onPick={(t) => void insertBlock(t, block.id)}
                        onClose={() => setPalette(null)}
                      />
                    </div>
                  )}

                  <div className="be-content">
                    <BlockContentEditor
                      type={block.type}
                      content={block.content}
                      onChange={(content) => handleBlockChange(block.id, content)}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {doc.blocks.length > 0 && (
          <div className="be-end" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="be-end__add" onClick={() => setPalette((cur) => (cur?.after === 'end' ? null : { after: 'end' }))}>
              <Plus size={15} /> 블록 추가
              <span>표·이미지·견적표·법규 등</span>
            </button>
            {palette?.after === 'end' && (
              <div className="be-anchor be-anchor--end">
                <BlockPalette
                  available={AVAILABLE}
                  placement="above"
                  onPick={(t) => void insertBlock(t, lastId)}
                  onClose={() => setPalette(null)}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {inpaintTarget &&
        (() => {
          const c = inpaintTarget.content as {
            imageAssetId?: string;
            versionId?: string;
            url?: string;
            caption?: string;
          };
          if (!c.imageAssetId || !c.versionId || !c.url) return null;
          return (
            <InpaintModal
              blockId={inpaintTarget.id}
              imageAssetId={c.imageAssetId}
              baseVersionId={c.versionId}
              baseUrl={c.url}
              caption={c.caption}
              onClose={() => setInpaintTarget(null)}
              onApplied={() => {
                setInpaintTarget(null);
                load();
              }}
            />
          );
        })()}

      {imageModalOpen && doc && (
        <ImageGenerateModal
          projectId={doc.projectId}
          onClose={() => setImageModalOpen(false)}
          onInsert={async (image) => {
            setImageModalOpen(false);
            try {
              await apiFetch(`/api/documents/${documentId}/blocks`, {
                method: 'POST',
                body: JSON.stringify({
                  afterBlockId: imageInsertAfter.current ?? selectedBlockId ?? undefined,
                  block: {
                    type: 'image',
                    content: {
                      imageAssetId: image.imageAssetId,
                      versionId: image.versionId,
                      url: image.url,
                      caption: image.caption,
                    },
                  },
                }),
              });
              load();
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        />
      )}
    </div>
  );
}
