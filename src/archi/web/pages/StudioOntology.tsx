'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@archi-web/lib/client/api';
import { NavRail } from '@archi-web/components/studio/NavRail';
import { ResizeHandle, useResizable } from '@archi-web/components/studio/Resizable';
import { GraphView, type GraphEdgeData, type GraphNodeData } from '@archi-web/components/ontology/GraphView';

type Me = { organizations: { workspaces: { id: string; name: string }[] }[] };

type GraphNode = GraphNodeData & {
  description: string | null;
  confidence: number | null;
};

type NodeDetail = {
  node: { id: string; label: string; type: string; status: string; confidence: number | null };
  documents: { id: string; title: string; type: string }[];
  knowledgeSources: { id: string; title: string; status: string }[];
  connections: { edgeId: string; relationType: string; direction: string; nodeId: string; label: string }[];
  excerpts: { source: string; text: string }[];
  relatedKeywords: string[];
  extractionCount: number;
};

const TYPE_LABELS: Record<string, string> = {
  space: '공간',
  method: '공법',
  material: '자재',
  defect: '하자',
  regulation: '법규',
};

/**
 * 온톨로지 그래프 — 옵시디언 그래프 뷰 스타일.
 * 풀스크린 다크 캔버스 + 우측 플로팅 설정 패널(필터/표시/힘) + 노드 상세 플로팅 카드.
 */
export default function OntologyPage() {
  const router = useRouter();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [detail, setDetail] = useState<NodeDetail | null>(null);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdgeData[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'approved' | 'candidate'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const detailPanel = useResizable({
    initial: 384,
    min: 280,
    max: 620,
    side: 'right',
    storageKey: 'archi.onto.panel.w',
  });

  // 옵시디언 노트 패널 — 노드 설명(description)을 마크다운으로 편집
  const [note, setNote] = useState('');
  const [noteSaving, setNoteSaving] = useState<'idle' | 'saving' | 'saved'>('idle');

  // 옵시디언 '그래프 설정' 상태
  const [search, setSearch] = useState('');
  const [showLabels, setShowLabels] = useState(true);
  const [centerForce, setCenterForce] = useState(0.015);
  const [repelForce, setRepelForce] = useState(5200);
  const [linkDistance, setLinkDistance] = useState(110);

  useEffect(() => {
    apiFetch<Me>('/api/auth/me')
      .then((me) => setWorkspaceId(me.organizations[0]?.workspaces[0]?.id ?? null))
      .catch(() => setError('로그인이 필요합니다. 스튜디오에서 먼저 로그인해 주세요.'));
  }, []);

  const loadGraph = useCallback((wsId: string, filter: string) => {
    apiFetch<{ nodes: GraphNode[]; edges: GraphEdgeData[] }>(
      `/api/ontology/graph?workspaceId=${wsId}&status=${filter}`,
    )
      .then((graph) => {
        setNodes(graph.nodes);
        setEdges(graph.edges);
        setSelectedId((prev) => (graph.nodes.some((n) => n.id === prev) ? prev : null));
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (workspaceId) loadGraph(workspaceId, statusFilter);
  }, [workspaceId, statusFilter, loadGraph]);

  // 선택 노드의 실제 provenance(관련 문서/지식소스/관계) 로드
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    apiFetch<NodeDetail>(`/api/ontology/nodes/${selectedId}`)
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  // 선택이 바뀌면 노트 편집기를 해당 노드의 설명으로 동기화
  useEffect(() => {
    const node = nodes.find((n) => n.id === selectedId);
    setNote(node?.description ?? '');
    setNoteSaving('idle');
  }, [selectedId, nodes]);

  const saveNote = useCallback(async () => {
    if (!selectedId) return;
    setNoteSaving('saving');
    try {
      await apiFetch(`/api/ontology/nodes/${selectedId}`, {
        method: 'PATCH',
        body: JSON.stringify({ description: note }),
      });
      setNodes((prev) =>
        prev.map((n) => (n.id === selectedId ? { ...n, description: note } : n)),
      );
      setNoteSaving('saved');
    } catch {
      setNoteSaving('idle');
    }
  }, [selectedId, note]);

  async function handleReview(nodeId: string, status: 'APPROVED' | 'REJECTED') {
    if (busy || !workspaceId) return;
    setBusy(true);
    try {
      await apiFetch(`/api/ontology/nodes/${nodeId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      if (status === 'REJECTED') setSelectedId(null);
      loadGraph(workspaceId, statusFilter);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const selected = nodes.find((n) => n.id === selectedId) ?? null;
  const selectedConnections = selected
    ? edges.filter((e) => e.sourceNodeId === selected.id || e.targetNodeId === selected.id)
    : [];

  return (
    <div className="flex h-screen overflow-hidden bg-[#111114]">
      <NavRail />

      <main className="relative min-w-0 flex-1">
        {/* 그래프 캔버스 (풀스크린) */}
        {nodes.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-zinc-500">
            <p className="text-sm">아직 지식 그래프가 비어 있습니다.</p>
            <p className="max-w-sm text-center text-xs leading-5 text-zinc-600">
              문서를 작성하고 AI 액션을 승인하거나, 에디터의 ‘지식 추출’ 버튼·지식베이스 업로드를
              실행하면 실제 작업 내용이 노드로 누적됩니다.
            </p>
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => router.push('/studio')}
                className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-zinc-900"
              >
                문서 작성하러 가기
              </button>
              <button
                onClick={() => router.push('/studio/sources')}
                className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-zinc-300 hover:border-white"
              >
                지식베이스 업로드
              </button>
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
          </div>
        ) : (
          <GraphView
            nodes={nodes}
            edges={edges}
            selectedId={selectedId}
            onSelect={setSelectedId}
            search={search}
            showLabels={showLabels}
            showSettings={false}
            params={{
              centerStrength: centerForce,
              repulsion: repelForce,
              springLength: linkDistance,
            }}
          />
        )}

        {/* 좌상단: 타이틀/통계 */}
        <div className="pointer-events-none absolute left-4 top-4 text-zinc-400">
          <h1 className="text-sm font-bold text-zinc-100">온톨로지 그래프</h1>
          <p className="text-[11px]">
            노드 {nodes.length} · 관계 {edges.length}
          </p>
          {error && nodes.length > 0 && <p className="text-[11px] text-red-400">{error}</p>}
        </div>

        {/* 우상단: 그래프 설정 패널 (옵시디언 스타일) */}
        <div className="absolute right-4 top-4 w-60">
          <button
            onClick={() => setSettingsOpen((v) => !v)}
            className="mb-1 ml-auto block rounded-md bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-zinc-300 hover:bg-white/20"
          >
            그래프 설정 {settingsOpen ? '▾' : '▸'}
          </button>
          {settingsOpen && (
            <div className="space-y-4 rounded-xl border border-white/10 bg-[#1c1c24]/95 p-4 text-zinc-300 shadow-2xl backdrop-blur">
              <section>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                  필터
                </p>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="노드 검색..."
                  className="mb-2 w-full rounded-md bg-white/5 px-2.5 py-1.5 text-xs outline-none placeholder:text-zinc-600"
                />
                <div className="flex gap-1">
                  {(
                    [
                      ['all', '전체'],
                      ['approved', '승인'],
                      ['candidate', '후보'],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      onClick={() => setStatusFilter(value)}
                      className={`flex-1 rounded-md py-1 text-[11px] font-semibold ${
                        statusFilter === value
                          ? 'bg-white text-zinc-900'
                          : 'bg-white/5 text-zinc-400 hover:bg-white/10'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                  표시
                </p>
                <label className="flex items-center justify-between text-xs">
                  텍스트 라벨
                  <input
                    type="checkbox"
                    checked={showLabels}
                    onChange={(e) => setShowLabels(e.target.checked)}
                  />
                </label>
              </section>

              <section className="space-y-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">힘</p>
                <Slider
                  label="중심 힘"
                  min={0}
                  max={0.06}
                  step={0.003}
                  value={centerForce}
                  onChange={setCenterForce}
                />
                <Slider
                  label="반발력"
                  min={500}
                  max={15000}
                  step={500}
                  value={repelForce}
                  onChange={setRepelForce}
                />
                <Slider
                  label="링크 거리"
                  min={40}
                  max={300}
                  step={10}
                  value={linkDistance}
                  onChange={setLinkDistance}
                />
              </section>
            </div>
          )}
        </div>

      </main>

      {/* 우측 도킹 노트 패널 — 옵시디언 마크다운 에디터 스타일 */}
      {selected && (
        <aside
          style={{ width: detailPanel.width }}
          className="relative flex shrink-0 flex-col border-l border-white/10 bg-[#16161b] text-zinc-200"
        >
          <ResizeHandle side="right" onPointerDown={detailPanel.onPointerDown} dark />
          {/* 헤더: 제목 + 타입 + 닫기 */}
          <div className="flex items-start justify-between gap-2 border-b border-white/10 px-5 py-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-lg font-bold text-white">{selected.label}</h1>
                <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-zinc-400">
                  {TYPE_LABELS[selected.type] ?? selected.type}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-zinc-500">
                {selected.status === 'APPROVED' ? (
                  <span className="text-zinc-300">승인됨</span>
                ) : (
                  <span>후보</span>
                )}
                {selected.confidence != null && (
                  <span className="ml-2">신뢰도 {(selected.confidence * 100).toFixed(0)}%</span>
                )}
                <span className="ml-2">연결 {selectedConnections.length}</span>
                {detail && detail.extractionCount > 0 && (
                  <span className="ml-2">추출 {detail.extractionCount}회</span>
                )}
              </p>
            </div>
            <button
              onClick={() => setSelectedId(null)}
              aria-label="패널 닫기"
              className="shrink-0 rounded-md px-2 py-1 text-zinc-500 hover:bg-white/10 hover:text-white"
            >
              ✕
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {/* 마크다운 노트 편집기 */}
            <div className="flex flex-col border-b border-white/10 px-5 py-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                  노트
                </span>
                <span className="text-[10px] text-zinc-600">
                  {noteSaving === 'saving' ? '저장 중…' : noteSaving === 'saved' ? '저장됨' : ''}
                </span>
              </div>
              <textarea
                value={note}
                onChange={(e) => {
                  setNote(e.target.value);
                  setNoteSaving('idle');
                }}
                onBlur={saveNote}
                placeholder={`# ${selected.label}\n\n이 노드에 대한 메모를 마크다운으로 작성하세요…`}
                spellCheck={false}
                className="min-h-[180px] w-full resize-y rounded-lg border border-white/10 bg-[#0f0f13] px-3 py-2.5 font-mono text-[13px] leading-6 text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-white/30"
              />
            </div>

            {/* 관련 키워드 — 옵시디언 [[링크]] 스타일, 클릭해 이동 */}
            {detail && detail.relatedKeywords.length > 0 && (
              <div className="border-b border-white/10 px-5 py-4">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                  관련 키워드
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(detail.connections ?? []).map((connection) => (
                    <button
                      key={connection.edgeId}
                      onClick={() => setSelectedId(connection.nodeId)}
                      title={connection.relationType}
                      className="rounded bg-white/5 px-2 py-1 text-[11px] text-zinc-300 underline decoration-white/20 underline-offset-2 hover:bg-white/15 hover:text-white"
                    >
                      [[{connection.label}]]
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 백링크 문맥 — 노드가 등장한 실제 문서 내용 */}
            {detail && detail.excerpts.length > 0 && (
              <div className="border-b border-white/10 px-5 py-4">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                  백링크 ({detail.excerpts.length})
                </p>
                <ul className="space-y-2.5">
                  {detail.excerpts.map((ex, i) => (
                    <li
                      key={i}
                      className="border-l-2 border-white/15 pl-3 text-[12px] leading-5 text-zinc-400"
                    >
                      <p className="mb-0.5 text-[10px] text-zinc-600">{ex.source}</p>
                      <p className="text-zinc-300">{ex.text}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* provenance: 추출된 문서 */}
            {detail && detail.documents.length > 0 && (
              <div className="border-b border-white/10 px-5 py-4">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                  관련 문서 {detail.documents.length}
                </p>
                <ul className="space-y-1">
                  {detail.documents.map((doc) => (
                    <li key={doc.id}>
                      <button
                        onClick={() => router.push(`/studio/${doc.id}`)}
                        className="w-full truncate rounded px-2 py-1.5 text-left text-[12px] text-zinc-300 hover:bg-white/10 hover:text-white"
                      >
                        📄 {doc.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* provenance: 지식소스 */}
            {detail && detail.knowledgeSources.length > 0 && (
              <div className="border-b border-white/10 px-5 py-4">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                  관련 지식소스 {detail.knowledgeSources.length}
                </p>
                <ul className="space-y-1">
                  {detail.knowledgeSources.map((source) => (
                    <li key={source.id}>
                      <button
                        onClick={() => router.push('/studio/sources')}
                        className="w-full truncate rounded px-2 py-1.5 text-left text-[12px] text-zinc-300 hover:bg-white/10 hover:text-white"
                      >
                        📚 {source.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* 후보 노드 검수: 승인 / 반려 */}
          {selected.status === 'CANDIDATE' && (
            <div className="flex gap-2 border-t border-white/10 p-4">
              <button
                onClick={() => handleReview(selected.id, 'APPROVED')}
                disabled={busy}
                className="flex-1 rounded-lg bg-white py-2 text-xs font-bold text-zinc-900 disabled:opacity-50"
              >
                승인
              </button>
              <button
                onClick={() => handleReview(selected.id, 'REJECTED')}
                disabled={busy}
                className="flex-1 rounded-lg border border-white/20 py-2 text-xs font-bold text-zinc-300 hover:border-white hover:text-white disabled:opacity-50"
              >
                반려
              </button>
            </div>
          )}
        </aside>
      )}
    </div>
  );
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block text-xs">
      <span className="mb-1 flex justify-between text-zinc-400">
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-white"
      />
    </label>
  );
}
