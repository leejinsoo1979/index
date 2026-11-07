'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PanelLeft, PanelRight } from 'lucide-react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '@archi-web/lib/client/api';
import { AIChatPanel } from '@archi-web/components/ai/AIChatPanel';
import { BlockEditor, type EditorBlock } from '@archi-web/components/editor/BlockEditor';
import { CanvasView } from '@archi-web/components/editor/CanvasView';
import { BlockOutline } from '@archi-web/components/studio/BlockOutline';
import { NavRail } from '@archi-web/components/studio/NavRail';
import { ResizeHandle, useResizable } from '@archi-web/components/studio/Resizable';
import { TopBar } from '@archi-web/components/studio/TopBar';
import './StudioDocument.css';

type DocMeta = { id: string; projectId: string; title: string; status: string };

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
  ontology_summary: '지식요약',
};

export default function DocumentStudioPage() {
  const { documentId = '' } = useParams<{ documentId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  // 홈에서 넘어온 첫 요청(?prompt=)은 한 번만 쓰고 주소에서 지운다 (새로고침 시 재전송 방지).
  const [initialPrompt] = useState(() => searchParams.get('prompt'));
  useEffect(() => {
    if (searchParams.has('prompt')) router.replace(`/studio/${documentId}`);
  }, [searchParams, router, documentId]);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [blocks, setBlocks] = useState<EditorBlock[]>([]);
  const [docMeta, setDocMeta] = useState<DocMeta | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [addMenuKey, setAddMenuKey] = useState(0);
  const [viewMode, setViewMode] = useState<'doc' | 'canvas'>('doc');
  // 패널 접기/펴기 — 문서 공간을 넓게 쓰도록. 상태는 브라우저에 기억한다.
  const [showChat, setShowChat] = useState(() => readPanelPref('archi.doc.chat', true));
  const [showOutline, setShowOutline] = useState(() => readPanelPref('archi.doc.outline', false));
  useEffect(() => writePanelPref('archi.doc.chat', showChat), [showChat]);
  useEffect(() => writePanelPref('archi.doc.outline', showOutline), [showOutline]);
  const chatPanel = useResizable({
    initial: 340,
    min: 280,
    max: 560,
    side: 'left',
    storageKey: 'archi.studio.chat.w',
  });
  const outlinePanel = useResizable({
    initial: 224,
    min: 180,
    max: 420,
    side: 'right',
    storageKey: 'archi.studio.outline.w',
  });

  const handleDocumentChanged = useCallback(() => setReloadKey((k) => k + 1), []);

  /** 우측 패널에서 블록 삭제: DB 삭제 후 에디터 재로드 → 본문 컨테이너도 사라진다 */
  const handleDeleteBlock = useCallback(
    async (id: string) => {
      setBlocks((prev) => prev.filter((b) => b.id !== id)); // 낙관적 갱신
      setSelectedBlockId((prev) => (prev === id ? null : prev));
      try {
        await apiFetch(`/api/blocks/${id}`, { method: 'DELETE' });
      } finally {
        setReloadKey((k) => k + 1);
      }
    },
    [],
  );

  const selectedBlockLabel = useMemo(() => {
    const block = blocks.find((b) => b.id === selectedBlockId);
    if (!block) return null;
    const c = block.content as { text?: string; title?: string; caption?: string };
    const summary = (c.text ?? c.title ?? c.caption ?? '').slice(0, 16);
    const typeLabel = BLOCK_TYPE_LABELS[block.type] ?? block.type;
    return summary ? `${typeLabel} · ${summary}` : typeLabel;
  }, [blocks, selectedBlockId]);

  return (
    <div className="sd-doc flex h-screen overflow-hidden bg-zinc-100">
      <NavRail />

      {/* 좌측 AI 에이전트 패널 (드래그로 너비 조절) */}
      {showChat && (
      <aside style={{ width: chatPanel.width }} className="sd-pane sd-pane--chat relative shrink-0 overflow-hidden">
        <AIChatPanel
          documentId={documentId}
          selectedBlockId={selectedBlockId}
          selectedBlockLabel={selectedBlockLabel}
          onDocumentChanged={handleDocumentChanged}
          initialPrompt={initialPrompt}
        />
        <ResizeHandle side="left" onPointerDown={chatPanel.onPointerDown} />
      </aside>
      )}

      {/* 중앙: 상단 바 + 문서 캔버스 */}
      <main className="sd-main flex min-w-0 flex-1 flex-col">
        <TopBar
          documentId={documentId}
          title={docMeta?.title ?? ''}
          status={docMeta?.status ?? 'DRAFT'}
          saveState={saveState}
        />

        {/* 보기 전환: 문서(세로 흐름) ↔ 캔버스(자유 배치) */}
        <div className="sd-tabs flex items-center gap-1 border-b border-zinc-200 bg-white px-4 py-1.5">
          {(
            [
              ['doc', '문서'],
              ['canvas', '캔버스'],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`sd-tab rounded-md px-3 py-1 text-xs font-semibold transition ${
                viewMode === mode
                  ? 'is-on bg-zinc-900 text-white'
                  : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900'
              }`}
            >
              {label}
            </button>
          ))}
          <div className="sd-tabs__toggles">
            <button
              type="button"
              className={`sd-toggle${showChat ? ' is-on' : ''}`}
              onClick={() => setShowChat((v) => !v)}
              aria-pressed={showChat}
              title={showChat ? 'AI 패널 접기' : 'AI 패널 펴기'}
            >
              <PanelLeft size={15} /> AI
            </button>
            <button
              type="button"
              className={`sd-toggle${showOutline ? ' is-on' : ''}`}
              onClick={() => setShowOutline((v) => !v)}
              aria-pressed={showOutline}
              title={showOutline ? '문서 구조 접기' : '문서 구조 펴기'}
            >
              <PanelRight size={15} /> 구조
            </button>
          </div>
          {viewMode === 'canvas' && (
            <span className="sd-tabs__hint ml-2 text-[11px] text-zinc-400">
              클릭=선택 · 드래그=이동 · 핸들=크기 · 더블클릭=편집 · Del=삭제 · ⌘/Ctrl+C·V=복사·붙여넣기
            </span>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          {viewMode === 'doc' ? (
            <div className="sd-stage h-full p-4">
              <div className="sd-paper mx-auto h-full max-w-3xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
                <BlockEditor
                  documentId={documentId}
                  selectedBlockId={selectedBlockId}
                  onSelectBlock={setSelectedBlockId}
                  reloadKey={reloadKey}
                  onBlocksLoaded={setBlocks}
                  onDocumentLoaded={setDocMeta}
                  onSaveStateChange={setSaveState}
                  openAddMenuKey={addMenuKey}
                />
              </div>
            </div>
          ) : (
            <CanvasView
              documentId={documentId}
              selectedBlockId={selectedBlockId}
              onSelectBlock={setSelectedBlockId}
              reloadKey={reloadKey}
              onBlocksLoaded={setBlocks}
              onDocumentLoaded={setDocMeta}
              onSaveStateChange={setSaveState}
              openAddMenuKey={addMenuKey}
            />
          )}
        </div>
      </main>

      {/* 우측 블록 패널 (드래그로 너비 조절) */}
      {showOutline && (
      <aside style={{ width: outlinePanel.width }} className="sd-pane sd-pane--outline relative shrink-0 overflow-hidden">
        <ResizeHandle side="right" onPointerDown={outlinePanel.onPointerDown} />
        <BlockOutline
          blocks={blocks}
          selectedBlockId={selectedBlockId}
          onSelectBlock={setSelectedBlockId}
          onAddBlock={() => setAddMenuKey((k) => k + 1)}
          onDeleteBlock={handleDeleteBlock}
        />
      </aside>
      )}
    </div>
  );
}

function readPanelPref(key: string, fallback: boolean): boolean {
  try {
    const v = window.localStorage.getItem(key);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}

function writePanelPref(key: string, value: boolean) {
  try {
    window.localStorage.setItem(key, value ? '1' : '0');
  } catch {
    // storage unavailable (private mode) — keep in-memory state only
  }
}
