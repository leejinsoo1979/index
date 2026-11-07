'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FiFileText, FiSearch, FiUploadCloud } from 'react-icons/fi';
import { apiFetch } from '@archi-web/lib/client/api';
import { NavRail } from '@archi-web/components/studio/NavRail';
import { studioFetch } from '@archi-web/lib/client/router';
import { ResizeHandle, useResizable } from '@archi-web/components/studio/Resizable';

type Me = {
  organizations: { workspaces: { id: string; name: string }[] }[];
};

type Source = {
  id: string;
  title: string;
  status: string;
  trustLevel: string;
  error: string | null;
  _count: { chunks: number };
};

type Chunk = { id: string; chunkIndex: number; text: string; section: string | null };

type QueryResult = {
  answer: string;
  citations: { sourceId: string; chunkId: string; title: string; quote: string; score: number }[];
};

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  PENDING_PROCESSING: { label: '처리 대기', cls: 'bg-zinc-100 text-zinc-600' },
  PROCESSING: { label: '처리 중', cls: 'bg-zinc-200 text-zinc-700' },
  PENDING_REVIEW: { label: '검토 대기', cls: 'bg-zinc-300 text-zinc-800' },
  APPROVED: { label: '승인됨', cls: 'bg-zinc-900 text-white' },
  FAILED: { label: '실패', cls: 'bg-white text-red-600 border border-red-200' },
  ARCHIVED: { label: '보관됨', cls: 'bg-zinc-100 text-zinc-500' },
};

/** 지식베이스 — 스튜디오 디자인 시스템 (다크 네비 + 화이트 카드 + 우측 질의 패널) */
export default function KnowledgePage() {
  const queryPanel = useResizable({
    initial: 320,
    min: 240,
    max: 520,
    side: 'right',
    storageKey: 'archi.kb.query.w',
  });
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [chunksFor, setChunksFor] = useState<string | null>(null);
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [query, setQuery] = useState('');
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Me>('/api/auth/me')
      .then((me) => setWorkspaceId(me.organizations[0]?.workspaces[0]?.id ?? null))
      .catch(() => setError('로그인이 필요합니다. 스튜디오에서 먼저 로그인해 주세요.'));
  }, []);

  const loadSources = useCallback((wsId: string) => {
    apiFetch<{ sources: Source[] }>(`/api/kb/sources?workspaceId=${wsId}`)
      .then((data) => setSources(data.sources))
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (workspaceId) loadSources(workspaceId);
  }, [workspaceId, loadSources]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file || !workspaceId) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('workspaceId', workspaceId);
      const response = await studioFetch('/api/kb/sources', { method: 'POST', body: form });
      if (!response.ok) {
        const body = (await response.json()) as { message?: string };
        throw new Error(body.message ?? '업로드에 실패했습니다.');
      }
      if (fileRef.current) fileRef.current.value = '';
      setFileName(null);
      loadSources(workspaceId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleAction(sourceId: string, action: 'process' | 'approve') {
    if (!workspaceId) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/kb/sources/${sourceId}/${action}`, { method: 'POST' });
      loadSources(workspaceId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleShowChunks(sourceId: string) {
    if (chunksFor === sourceId) {
      setChunksFor(null);
      return;
    }
    try {
      const data = await apiFetch<{ chunks: Chunk[] }>(`/api/kb/sources/${sourceId}/chunks`);
      setChunks(data.chunks);
      setChunksFor(sourceId);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleQuery(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim() || !workspaceId) return;
    setBusy(true);
    setError(null);
    try {
      const result = await apiFetch<QueryResult>('/api/kb/query', {
        method: 'POST',
        body: JSON.stringify({ workspaceId, query: query.trim() }),
      });
      setQueryResult(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-100">
      <NavRail />

      {/* 중앙: 소스 관리 */}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-zinc-200 bg-white px-5">
          <h1 className="text-sm font-bold text-zinc-900">지식베이스</h1>
          <span className="text-[11px] text-zinc-400">
            소스 {sources.length}개 · 승인된 소스만 검색에 사용됩니다
          </span>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="mx-auto max-w-3xl space-y-4">
            {error && <p className="text-sm text-red-600">{error}</p>}

            {/* 업로드 드롭존 */}
            <form
              onSubmit={handleUpload}
              className="rounded-2xl border-2 border-dashed border-zinc-300 bg-white p-6 text-center transition hover:border-zinc-900"
            >
              <FiUploadCloud className="mx-auto mb-2 text-zinc-400" size={28} aria-hidden />
              <p className="text-sm font-semibold text-zinc-700">
                PDF · TXT · MD 파일을 업로드하세요
              </p>
              <p className="mb-3 text-xs text-zinc-400">
                업로드 → 처리(텍스트 추출·청킹·지식 추출) → 검토 승인 → 검색 활용
              </p>
              <div className="flex items-center justify-center gap-2">
                <label className="cursor-pointer rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:border-zinc-900">
                  파일 선택
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".pdf,.txt,.md"
                    className="hidden"
                    onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
                  />
                </label>
                {fileName && <span className="text-xs text-zinc-500">{fileName}</span>}
                <button
                  type="submit"
                  disabled={busy || !fileName}
                  className="rounded-lg bg-zinc-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700 disabled:opacity-40"
                >
                  업로드
                </button>
              </div>
            </form>

            {/* 소스 카드 목록 */}
            {sources.length === 0 ? (
              <p className="py-10 text-center text-sm text-zinc-400">
                아직 등록된 지식 소스가 없습니다.
              </p>
            ) : (
              <ul className="space-y-2">
                {sources.map((source) => {
                  const status = STATUS_LABELS[source.status] ?? {
                    label: source.status,
                    cls: 'bg-zinc-100 text-zinc-600',
                  };
                  return (
                    <li
                      key={source.id}
                      className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-500">
                          <FiFileText size={16} aria-hidden />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-zinc-900">
                            {source.title}
                          </p>
                          <p className="text-[11px] text-zinc-400">
                            청크 {source._count.chunks}개
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${status.cls}`}
                        >
                          {status.label}
                        </span>
                        {(source.status === 'PENDING_PROCESSING' || source.status === 'FAILED') && (
                          <button
                            onClick={() => handleAction(source.id, 'process')}
                            disabled={busy}
                            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                          >
                            처리
                          </button>
                        )}
                        {source.status === 'PENDING_REVIEW' && (
                          <button
                            onClick={() => handleAction(source.id, 'approve')}
                            disabled={busy}
                            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                          >
                            승인
                          </button>
                        )}
                        {source._count.chunks > 0 && (
                          <button
                            onClick={() => handleShowChunks(source.id)}
                            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:border-zinc-900 hover:text-zinc-900"
                          >
                            청크 {chunksFor === source.id ? '닫기' : '보기'}
                          </button>
                        )}
                      </div>
                      {source.error && (
                        <p className="mt-2 text-xs text-red-500">{source.error}</p>
                      )}
                      {chunksFor === source.id && (
                        <ul className="mt-3 max-h-60 space-y-1.5 overflow-y-auto border-t border-zinc-100 pt-3">
                          {chunks.map((chunk) => (
                            <li
                              key={chunk.id}
                              className="rounded-lg bg-zinc-50 px-3 py-2 text-xs leading-5 text-zinc-600"
                            >
                              <span className="mr-2 font-bold text-zinc-400">
                                #{chunk.chunkIndex}
                                {chunk.section ? ` · ${chunk.section}` : ''}
                              </span>
                              {chunk.text.slice(0, 180)}
                              {chunk.text.length > 180 && '…'}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </main>

      {/* 우측: 질의 패널 */}
      <aside
        style={{ width: queryPanel.width }}
        className="relative flex shrink-0 flex-col border-l border-zinc-200 bg-white"
      >
        <ResizeHandle side="right" onPointerDown={queryPanel.onPointerDown} />
        <div className="border-b border-zinc-200 px-4 py-3">
          <h2 className="text-xs font-bold text-zinc-700">지식베이스 질의</h2>
          <p className="text-[10px] text-zinc-400">승인된 소스에서 근거와 함께 검색합니다</p>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          <form onSubmit={handleQuery} className="flex items-center gap-1.5">
            <div className="flex flex-1 items-center gap-1.5 rounded-lg border border-zinc-300 px-2.5 py-1.5 focus-within:border-zinc-900">
              <FiSearch size={12} className="shrink-0 text-zinc-400" aria-hidden />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="예: 욕실 방수 담수 테스트"
                className="w-full text-xs outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={busy || !query.trim()}
              className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
            >
              질문
            </button>
          </form>

          {queryResult ? (
            <>
              <p className="whitespace-pre-wrap rounded-xl bg-zinc-50 p-3 text-xs leading-5 text-zinc-700">
                {queryResult.answer}
              </p>
              {queryResult.citations.map((citation) => (
                <div
                  key={citation.chunkId}
                  className="rounded-xl border border-zinc-200 bg-zinc-50 p-3"
                >
                  <p className="text-[11px] font-bold text-zinc-800">
                    {citation.title}
                    <span className="ml-2 font-normal text-zinc-400">
                      관련도 {(citation.score * 100).toFixed(0)}%
                    </span>
                  </p>
                  <p className="mt-1 text-[11px] leading-4 text-zinc-500">{citation.quote}…</p>
                </div>
              ))}
            </>
          ) : (
            <p className="pt-6 text-center text-[11px] text-zinc-400">
              질문을 입력하면 관련 청크와
              <br />
              출처가 카드로 표시됩니다.
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}
