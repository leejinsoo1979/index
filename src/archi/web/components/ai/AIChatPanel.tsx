'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@archi-web/lib/client/api';

type ChatModelInfo = {
  workspaceId: string;
  active: { configId: string; provider: string; model: string | null } | null;
  options: {
    configId: string;
    provider: string;
    providerLabel: string;
    model: string | null;
    authType: string;
  }[];
  isMock: boolean;
};

type ActionPreview = {
  id: string;
  type: string;
  payload: unknown;
  riskLevel: string;
  requiresApproval: boolean;
  status: string;
};

type SourceCard = {
  id: string;
  title: string;
  publisher: string;
  url: string;
  snippet: string;
  sourceType: string;
};

type ChatItem =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; text: string; streaming?: boolean; agentLabel?: string }
  | { kind: 'sources'; sources: SourceCard[] }
  | { kind: 'actions'; actions: ActionPreview[] };

type Props = {
  documentId: string;
  selectedBlockId: string | null;
  /** 선택된 블록의 표시 이름 (예: "이미지 · 따뜻한 우드톤 거실") */
  selectedBlockLabel?: string | null;
  onDocumentChanged: () => void;
};

const ACTION_LABELS: Record<string, string> = {
  insert_blocks: '블록 삽입',
  update_block: '블록 수정',
  replace_block_content: '블록 내용 교체',
  append_to_block: '블록에 이어쓰기',
  create_container: '컨테이너 생성',
  insert_block_before: '앞에 블록 삽입',
  create_child_block: '자식 블록 추가',
  convert_block_type: '블록 타입 변환',
  update_block_title: '제목 변경',
  mark_block_approved: '블록 승인',
  generate_image: '이미지 생성',
  extract_ontology: '지식 추출',
};

export function AIChatPanel({
  documentId,
  selectedBlockId,
  selectedBlockLabel,
  onDocumentChanged,
}: Props) {
  const [items, setItems] = useState<ChatItem[]>([
    {
      kind: 'assistant',
      text: '안녕하세요, ARCHI 에이전트입니다. 블로그 초안 작성이나 블록 수정을 도와드릴게요. 블록을 선택한 뒤 "전문가 톤으로 바꿔줘"처럼 요청할 수도 있습니다.',
    },
  ]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTeam, setActiveTeam] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 커서 스타일 모델 셀렉터
  const [modelInfo, setModelInfo] = useState<ChatModelInfo | null>(null);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [models, setModels] = useState<string[]>([]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [items]);

  const loadModelInfo = useCallback(() => {
    apiFetch<ChatModelInfo>(`/api/ai/model?documentId=${documentId}`)
      .then(setModelInfo)
      .catch(() => setModelInfo(null));
  }, [documentId]);

  useEffect(() => {
    loadModelInfo();
  }, [loadModelInfo]);

  // 메뉴 열 때 해당 provider의 모델 목록(라이브) 로드
  useEffect(() => {
    if (!modelMenuOpen || !modelInfo?.active || !modelInfo.workspaceId) return;
    apiFetch<{ models: string[] }>(
      `/api/settings/llm/models?workspaceId=${modelInfo.workspaceId}&provider=${modelInfo.active.provider}`,
    )
      .then((data) => setModels(data.models))
      .catch(() => setModels([]));
  }, [modelMenuOpen, modelInfo]);

  async function selectModel(configId: string, model: string) {
    setModelMenuOpen(false);
    try {
      await apiFetch(`/api/ai/model?documentId=${documentId}`, {
        method: 'POST',
        body: JSON.stringify({ configId, model }),
      });
      loadModelInfo();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const activeLabel = modelInfo?.isMock
    ? 'mock (미연결)'
    : modelInfo?.active
      ? `${modelInfo.options.find((o) => o.configId === modelInfo.active!.configId)?.providerLabel ?? ''} · ${modelInfo.active.model ?? '기본'}`
      : '모델 미설정';

  /** 어시스턴트 응답을 표시 (전체 텍스트를 한 번에 — 타자기 효과의 잔여 글자 버그 제거) */
  function streamAssistantText(text: string, agentLabel?: string): Promise<void> {
    setItems((prev) => [...prev, { kind: 'assistant', text, streaming: false, agentLabel }]);
    return Promise.resolve();
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const message = input.trim();
    if (!message || busy) return;
    setInput('');
    setError(null);
    setBusy(true);
    setItems((prev) => [...prev, { kind: 'user', text: message }]);
    try {
      const result = await apiFetch<{
        chatSessionId: string;
        reply: { text: string };
        agentRole?: { key: string; label: string };
        sources: SourceCard[];
        actions: ActionPreview[];
      }>('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          chatSessionId: sessionId,
          documentId,
          selectedBlockIds: selectedBlockId ? [selectedBlockId] : [],
          message,
        }),
      });
      setSessionId(result.chatSessionId);
      if (result.agentRole) setActiveTeam(result.agentRole.label);
      await streamAssistantText(result.reply.text, result.agentRole?.label);
      if (result.sources.length > 0) {
        setItems((prev) => [...prev, { kind: 'sources', sources: result.sources }]);
      }
      if (result.actions.length > 0) {
        setItems((prev) => [...prev, { kind: 'actions', actions: result.actions }]);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleAction(actionId: string, decision: 'approve' | 'reject') {
    setError(null);
    try {
      const res = await apiFetch<{ result?: { warnings?: string[] } }>(
        `/api/ai/actions/${actionId}/${decision}`,
        { method: 'POST' },
      );
      // 액션 실행 중 발생한 경고(예: 이미지 provider 미설정)를 채팅에 노출한다.
      const warnings = res?.result?.warnings;
      if (decision === 'approve' && Array.isArray(warnings) && warnings.length > 0) {
        await streamAssistantText(`⚠️ ${warnings.join('\n')}`);
      }
      setItems((prev) =>
        prev.map((item) =>
          item.kind === 'actions'
            ? {
                ...item,
                actions: item.actions.map((a) =>
                  a.id === actionId
                    ? { ...a, status: decision === 'approve' ? 'EXECUTED' : 'REJECTED' }
                    : a,
                ),
              }
            : item,
        ),
      );
      if (decision === 'approve') onDocumentChanged();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="flex h-full flex-col bg-[#1c1c2a] text-zinc-100">
      <header className="border-b border-white/10 px-4 pb-2.5 pt-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-xs font-bold text-zinc-900">
            AI
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">AI 에이전트</p>
            <p className="truncate text-[11px] text-zinc-400">
              {selectedBlockId
                ? `선택: ${selectedBlockLabel || '블록'}`
                : '문서 전체 모드'}
            </p>
          </div>

          {/* 커서 스타일 모델 셀렉터 */}
          <div className="relative ml-auto">
            <button
              onClick={() => setModelMenuOpen((v) => !v)}
              className="flex items-center gap-1 rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[11px] text-zinc-300 hover:border-white/40"
              title="모델 선택"
            >
              {activeLabel}
              <span className="text-zinc-500">▾</span>
            </button>
            {modelMenuOpen && (
              <div className="absolute right-0 top-full z-30 mt-1 w-56 overflow-hidden rounded-lg border border-white/10 bg-[#23232f] py-1 shadow-xl">
                {modelInfo && modelInfo.options.length === 0 ? (
                  <a
                    href="/studio/settings"
                    className="block px-3 py-2 text-[11px] text-zinc-400 hover:bg-white/5"
                  >
                    등록된 LLM이 없습니다 — 설정에서 API 키 등록 →
                  </a>
                ) : (
                  <>
                    {/* 다른 provider로 전환 */}
                    {(modelInfo?.options ?? [])
                      .filter((o) => o.configId !== modelInfo?.active?.configId)
                      .map((o) => (
                        <button
                          key={o.configId}
                          onClick={() => selectModel(o.configId, o.model ?? '')}
                          className="block w-full px-3 py-2 text-left text-[11px] text-zinc-300 hover:bg-white/5"
                        >
                          {o.providerLabel} · {o.model ?? '기본'}
                        </button>
                      ))}
                    {/* 활성 provider의 모델 목록 */}
                    {modelInfo?.active && models.length > 0 && (
                      <>
                        <p className="border-t border-white/5 px-3 pb-1 pt-2 text-[9px] tracking-wide text-zinc-500">
                          {modelInfo.options.find((o) => o.configId === modelInfo.active!.configId)
                            ?.providerLabel ?? ''}{' '}
                          모델
                        </p>
                        {models.map((m) => (
                          <button
                            key={m}
                            onClick={() => selectModel(modelInfo.active!.configId, m)}
                            className={`block w-full px-3 py-1.5 text-left text-[11px] hover:bg-white/5 ${
                              m === modelInfo.active!.model ? 'text-white' : 'text-zinc-400'
                            }`}
                          >
                            {m === modelInfo.active!.model ? '✓ ' : ''}
                            {m}
                          </button>
                        ))}
                      </>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1">
          {['콘텐츠팀', '법규팀', '시공디테일팀', '이미지팀', '지식관리팀', 'PM'].map((team) => (
            <span
              key={team}
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                activeTeam?.startsWith(team)
                  ? 'bg-white text-zinc-900'
                  : 'bg-white/10 text-zinc-400'
              }`}
            >
              {team}
            </span>
          ))}
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {items.map((item, i) => {
          if (item.kind === 'user') {
            return (
              <div key={i} className="ml-8 rounded-2xl rounded-tr-sm bg-white px-3.5 py-2.5 text-sm text-zinc-900">
                {item.text}
              </div>
            );
          }
          if (item.kind === 'assistant') {
            return (
              <div key={i} className="mr-6 rounded-2xl rounded-tl-sm bg-white/5 px-3.5 py-2.5 text-sm leading-6">
                {item.agentLabel && (
                  <span className="mb-1 inline-block rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-300">
                    {item.agentLabel}
                  </span>
                )}
                <div>
                  {item.text}
                  {item.streaming && <span className="animate-pulse">▍</span>}
                </div>
              </div>
            );
          }
          if (item.kind === 'sources') {
            return (
              <div key={i} className="mr-4 space-y-2">
                {item.sources.map((source) => (
                  <a
                    key={source.id}
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-xl border border-white/10 bg-white/5 p-3 hover:border-white/40"
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <span className="rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-200">
                        {source.sourceType === 'official_law'
                          ? '공식 법령'
                          : source.sourceType === 'kcsc'
                            ? 'KCSC'
                            : source.sourceType === 'public_data'
                              ? '공공데이터'
                              : '출처'}
                      </span>
                      <span className="text-[11px] text-zinc-400">{source.publisher}</span>
                    </div>
                    <p className="text-xs font-semibold text-zinc-100">{source.title}</p>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-zinc-400">
                      {source.snippet}
                    </p>
                  </a>
                ))}
              </div>
            );
          }
          return (
            <div key={i} className="mr-4 space-y-2">
              {item.actions.map((action) => (
                <div key={action.id} className="rounded-xl border border-white/20 bg-white/5 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold text-zinc-300">
                      {ACTION_LABELS[action.type] ?? action.type}
                    </span>
                    <span className="text-[10px] uppercase text-zinc-400">
                      위험도 {action.riskLevel}
                    </span>
                  </div>
                  <ActionPayloadPreview type={action.type} payload={action.payload} />
                  {action.status === 'PROPOSED' ? (
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => handleAction(action.id, 'approve')}
                        className="flex-1 rounded-lg bg-white py-1.5 text-xs font-semibold text-zinc-900 hover:bg-zinc-200"
                      >
                        승인하고 적용
                      </button>
                      <button
                        onClick={() => handleAction(action.id, 'reject')}
                        className="rounded-lg border border-white/20 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/10"
                      >
                        거절
                      </button>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-zinc-400">
                      {action.status === 'EXECUTED' ? '✓ 문서에 적용되었습니다' : '거절되었습니다'}
                    </p>
                  )}
                </div>
              ))}
            </div>
          );
        })}
        {busy && <p className="text-xs text-zinc-500">에이전트가 작업 중...</p>}
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>

      <div className="flex gap-1.5 overflow-x-auto px-3 pb-1">
        {['블로그 초안 작성해줘', '방화문 법규 알려줘', '공정별 비용 차트 만들어줘'].map(
          (preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setInput(preset)}
              className="shrink-0 rounded-full border border-white/15 px-2.5 py-1 text-[10px] text-zinc-400 hover:border-white/40 hover:text-zinc-200"
            >
              {preset}
            </button>
          ),
        )}
      </div>
      <form onSubmit={handleSend} className="border-t border-white/10 p-3">
        <div className="flex items-end gap-2 rounded-xl bg-white/5 p-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // 한글 IME 조합 중(Enter로 글자 확정)이면 전송하지 않는다 — 마지막 글자 남는 버그 방지
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void handleSend(e);
              }
            }}
            rows={2}
            placeholder="AI에게 요청하기... (예: 블로그 초안 작성해줘)"
            className="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-zinc-500"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-zinc-900 disabled:opacity-40"
          >
            전송
          </button>
        </div>
      </form>
    </div>
  );
}

function ActionPayloadPreview({ type, payload }: { type: string; payload: unknown }) {
  if (type === 'insert_blocks') {
    const p = payload as {
      payload?: {
        blocks?: { type: string; content: { text?: string; title?: string; prompt?: string } }[];
      };
    };
    const blocks = p.payload?.blocks ?? [];
    return (
      <ul className="space-y-1 text-xs text-zinc-300">
        {blocks.slice(0, 6).map((b, i) => (
          <li key={i} className="truncate">
            <span className="text-zinc-500">{b.type === 'image' ? '🖼 이미지' : b.type}</span>{' '}
            {b.type === 'image'
              ? (b.content.prompt ?? '생성 예정')
              : (b.content.text ?? b.content.title ?? '')}
          </li>
        ))}
        {blocks.length > 6 && <li className="text-zinc-500">…외 {blocks.length - 6}개 블록</li>}
      </ul>
    );
  }
  if (type === 'update_block' || type === 'replace_block_content') {
    const p = payload as { payload?: { content?: { text?: string; title?: string } } };
    return (
      <p className="line-clamp-3 text-xs text-zinc-300">
        {p.payload?.content?.text ?? p.payload?.content?.title ?? '(내용 변경)'}
      </p>
    );
  }
  if (type === 'append_to_block') {
    const p = payload as { payload?: { text?: string } };
    return <p className="line-clamp-3 text-xs text-zinc-300">＋ {p.payload?.text ?? ''}</p>;
  }
  if (type === 'create_container') {
    const p = payload as { payload?: { title?: string; children?: unknown[] } };
    return (
      <p className="text-xs text-zinc-300">
        📦 {p.payload?.title ?? '컨테이너'}{' '}
        <span className="text-zinc-500">· 자식 {p.payload?.children?.length ?? 0}개</span>
      </p>
    );
  }
  if (type === 'insert_block_before' || type === 'create_child_block') {
    const p = payload as {
      payload?: {
        blocks?: { type: string; content: { text?: string; title?: string } }[];
        block?: { type: string; content: { text?: string; title?: string } };
      };
    };
    const list = p.payload?.blocks ?? (p.payload?.block ? [p.payload.block] : []);
    return (
      <ul className="space-y-1 text-xs text-zinc-300">
        {list.map((b, i) => (
          <li key={i} className="truncate">
            <span className="text-zinc-500">{b.type}</span> {b.content.text ?? b.content.title ?? ''}
          </li>
        ))}
      </ul>
    );
  }
  if (type === 'convert_block_type') {
    const p = payload as { payload?: { block?: { type?: string } } };
    return <p className="text-xs text-zinc-300">→ {p.payload?.block?.type ?? ''} 타입으로 변환</p>;
  }
  if (type === 'update_block_title') {
    const p = payload as { payload?: { title?: string } };
    return <p className="text-xs text-zinc-300">제목: {p.payload?.title ?? ''}</p>;
  }
  if (type === 'mark_block_approved') {
    return <p className="text-xs text-zinc-300">이 블록을 검수 완료로 표시합니다.</p>;
  }
  if (type === 'generate_image') {
    const p = payload as { payload?: { prompt?: string } };
    return <p className="line-clamp-2 text-xs text-zinc-300">🖼 {p.payload?.prompt ?? ''}</p>;
  }
  if (type === 'extract_ontology') {
    return <p className="text-xs text-zinc-300">이 문서에서 지식 노드/관계를 추출합니다.</p>;
  }
  return null;
}
