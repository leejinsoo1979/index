"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  AssistantRuntimeProvider,
  useAssistantRuntime,
  useAssistantToolUI,
  useLocalRuntime,
  type ChatModelAdapter,
  type ThreadAssistantMessagePart,
} from '@assistant-ui/react';
import { Thread } from '@/components/assistant-ui/thread';
import { apiFetch } from '@archi-web/lib/client/api';
import './AIChatPanel.css';

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
  serverDefault?: { provider: string; providerLabel: string; model: string | null } | null;
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

type ChatResult = {
  chatSessionId: string;
  reply: { text: string };
  agentRole?: { key: string; label: string };
  sources: SourceCard[];
  actions: ActionPreview[];
};

type Props = {
  documentId: string;
  selectedBlockId: string | null;
  /** 선택된 블록의 표시 이름 (예: "이미지 · 따뜻한 우드톤 거실") */
  selectedBlockLabel?: string | null;
  onDocumentChanged: () => void;
  /** 홈 입력창에서 넘어온 첫 요청 — 패널이 열리면 한 번 자동 전송한다. */
  initialPrompt?: string | null;
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
};

/** Per-panel state the in-thread cards need (approval status, decide handler, block selection). */
type PanelContextValue = {
  statuses: Record<string, { status: 'EXECUTED' | 'REJECTED'; warnings?: string[] }>;
  decide: (actionId: string, decision: 'approve' | 'reject') => Promise<void>;
  selectedBlockId: string | null;
};
const PanelContext = createContext<PanelContextValue>({ statuses: {}, decide: async () => {}, selectedBlockId: null });

/**
 * 문서 작성기 AI 패널 — assistant-ui의 Thread(ChatGPT식 대화 UI)를 쓰고,
 * 응답은 기존 /api/ai/chat(문서 에이전트)에서 받는다. 문서 수정 제안은 대화 안의 승인 카드로,
 * 근거는 접힌 한 줄로 보인다.
 */
export function AIChatPanel({ documentId, selectedBlockId, selectedBlockLabel, onDocumentChanged, initialPrompt }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [activeTeam, setActiveTeam] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<PanelContextValue['statuses']>({});
  const sessionRef = useRef<string | undefined>(undefined);
  const ctxRef = useRef({ documentId, selectedBlockId });
  ctxRef.current = { documentId, selectedBlockId };

  // 커서 스타일 모델 셀렉터
  const [modelInfo, setModelInfo] = useState<ChatModelInfo | null>(null);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [models, setModels] = useState<string[]>([]);

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
      : modelInfo?.serverDefault
        ? `${modelInfo.serverDefault.providerLabel} · ${modelInfo.serverDefault.model ?? '기본'}`
        : '모델 미설정';
  const modelShort = modelInfo?.isMock ? '미연결' : (modelInfo?.active?.model ?? modelInfo?.serverDefault?.model ?? '모델 선택');

  /** assistant-ui runtime adapter → existing document agent endpoint. */
  const adapter = useMemo<ChatModelAdapter>(
    () => ({
      async run({ messages }) {
        const last = [...messages].reverse().find((m) => m.role === 'user');
        const text = last
          ? last.content
              .map((part) => (part.type === 'text' ? part.text : ''))
              .join('\n')
              .trim()
          : '';
        if (!text) return { content: [{ type: 'text', text: '' }] };
        setError(null);
        const { documentId: docId, selectedBlockId: blockId } = ctxRef.current;
        const result = await apiFetch<ChatResult>('/api/ai/chat', {
          method: 'POST',
          body: JSON.stringify({
            chatSessionId: sessionRef.current,
            documentId: docId,
            selectedBlockIds: blockId ? [blockId] : [],
            message: text,
          }),
        });
        sessionRef.current = result.chatSessionId;
        if (result.agentRole) setActiveTeam(result.agentRole.label);
        const content: ThreadAssistantMessagePart[] = [{ type: 'text', text: result.reply.text }];
        if (result.sources.length > 0) {
          const args = { sources: result.sources.map((s) => ({ id: s.id, title: s.title, url: s.url })) };
          content.push({
            type: 'tool-call',
            toolCallId: `evidence-${result.sources[0]!.id}-${Date.now()}`,
            toolName: 'document_evidence',
            args,
            argsText: JSON.stringify(args),
            result: { ok: true },
          });
        }
        if (result.actions.length > 0) {
          const args = { actions: JSON.parse(JSON.stringify(result.actions)) };
          content.push({
            type: 'tool-call',
            toolCallId: `actions-${result.actions[0]!.id}`,
            toolName: 'document_actions',
            args,
            argsText: JSON.stringify(args),
            result: { proposed: true },
          });
        }
        return { content };
      },
    }),
    [],
  );
  const runtime = useLocalRuntime(adapter);

  // 홈에서 넘어온 첫 요청은 한 번만 보낸다.
  const initialSentRef = useRef(false);
  useEffect(() => {
    const message = initialPrompt?.trim();
    if (!message || initialSentRef.current) return;
    initialSentRef.current = true;
    runtime.thread.append({ role: 'user', content: [{ type: 'text', text: message }] });
  }, [initialPrompt, runtime]);

  const decide = useCallback(
    async (actionId: string, decision: 'approve' | 'reject') => {
      setError(null);
      try {
        const res = await apiFetch<{ result?: { warnings?: string[] } }>(`/api/ai/actions/${actionId}/${decision}`, {
          method: 'POST',
        });
        const warnings = Array.isArray(res?.result?.warnings) ? res.result!.warnings : undefined;
        setStatuses((prev) => ({
          ...prev,
          [actionId]: { status: decision === 'approve' ? 'EXECUTED' : 'REJECTED', warnings },
        }));
        if (decision === 'approve') onDocumentChanged();
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [onDocumentChanged],
  );

  const panelValue = useMemo(() => ({ statuses, decide, selectedBlockId }), [statuses, decide, selectedBlockId]);

  return (
    <PanelContext.Provider value={panelValue}>
      <AssistantRuntimeProvider runtime={runtime}>
        <div className="sd-chat dark flex h-full flex-col">
          <header className="sd-pane-head sd-chat__head">
            <div className="sd-chat__titlebar">
              <span className="sd-chat__logo" aria-label="INDEX">
                index
              </span>
              <span className="sd-chat__product">문서 AI</span>
              <div className="sd-chat__model-wrap">
                <button
                  type="button"
                  onClick={() => setModelMenuOpen((v) => !v)}
                  className="sd-model"
                  title={`모델 선택 · ${activeLabel}`}
                >
                  <span className="sd-model__name">{modelShort}</span>
                  <span aria-hidden>▾</span>
                </button>
                {modelMenuOpen && (
                  <div className="sd-model-menu" role="menu">
                    {modelInfo && modelInfo.options.length === 0 ? (
                      <a href="/agent-studio/settings">등록된 모델이 없습니다 — 설정에서 API 키 등록 →</a>
                    ) : (
                      <>
                        {(modelInfo?.options ?? [])
                          .filter((o) => o.configId !== modelInfo?.active?.configId)
                          .map((o) => (
                            <button key={o.configId} type="button" onClick={() => selectModel(o.configId, o.model ?? '')}>
                              {o.providerLabel} · {o.model ?? '기본'}
                            </button>
                          ))}
                        {modelInfo?.active && models.length > 0 && (
                          <>
                            <p>
                              {modelInfo.options.find((o) => o.configId === modelInfo.active!.configId)?.providerLabel ?? ''} 모델
                            </p>
                            {models.map((m) => (
                              <button
                                key={m}
                                type="button"
                                className={m === modelInfo.active!.model ? 'is-on' : undefined}
                                onClick={() => selectModel(modelInfo.active!.configId, m)}
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
            <div className="sd-chat__context">
              <span className={`sd-chat__context-target${selectedBlockId ? ' is-block' : ''}`}>
                {selectedBlockId ? `선택한 블록 · ${selectedBlockLabel || '블록'}` : '문서 전체에 요청'}
              </span>
              {activeTeam && <span className="sd-chat__context-team">담당 {activeTeam}</span>}
            </div>
          </header>

          {error && (
            <p className="sd-chat__error" role="alert">
              {error}
            </p>
          )}

          <div className="sd-chat__thread">
            <DocumentToolUIs />
            <Thread
              components={{ Welcome: IndexWelcome }}
              placeholder={selectedBlockId ? '선택한 블록을 어떻게 바꿀까요?' : '무엇을 작성하거나 고칠까요?'}
            />
          </div>
        </div>
      </AssistantRuntimeProvider>
    </PanelContext.Provider>
  );
}

/** Empty state: INDEX wordmark + suggestions that send right away. */
function IndexWelcome() {
  const runtime = useAssistantRuntime();
  const { selectedBlockId } = useContext(PanelContext);
  const suggestions = selectedBlockId
    ? ['전문가 톤으로 다듬어줘', '더 짧고 읽기 쉽게 줄여줘', '이 내용을 표로 바꿔줘']
    : ['34평 거실 리모델링 블로그 초안 써줘', '욕실 방수 시공 체크리스트 만들어줘', '공정별 비용 차트 만들어줘', '고객 제안서 목차 잡아줘'];
  return (
    <div className="sd-welcome">
      <span className="sd-welcome__logo" aria-hidden>
        index
      </span>
      <h2>무엇을 도와드릴까요?</h2>
      <p>
        {selectedBlockId
          ? '선택한 블록을 다듬거나 바꿔 드릴게요.'
          : '초안 작성, 블록 수정, 표·차트 만들기를 도와드려요. 블록을 선택하면 그 블록만 고칠 수 있어요.'}
      </p>
      <div className="sd-welcome__suggest">
        {suggestions.map((text) => (
          <button
            key={text}
            type="button"
            onClick={() => runtime.thread.append({ role: 'user', content: [{ type: 'text', text }] })}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

/** In-thread cards for the document agent's tool-shaped parts. */
function DocumentToolUIs() {
  useAssistantToolUI({
    toolName: 'document_actions',
    render: ({ args }) => <ActionCards actions={(args as { actions?: ActionPreview[] }).actions ?? []} />,
  });
  useAssistantToolUI({
    toolName: 'document_evidence',
    render: ({ args }) => {
      const sources = (args as { sources?: { id: string; title: string; url?: string }[] }).sources ?? [];
      if (sources.length === 0) return null;
      return (
        <details className="sd-evidence">
          <summary>근거 {sources.length}개</summary>
          <ul>
            {sources.map((s) => (
              <li key={s.id}>
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noreferrer">
                    {s.title}
                  </a>
                ) : (
                  <span>{s.title}</span>
                )}
              </li>
            ))}
          </ul>
        </details>
      );
    },
  });
  return null;
}

function ActionCards({ actions }: { actions: ActionPreview[] }) {
  const { statuses, decide } = useContext(PanelContext);
  const [busyId, setBusyId] = useState<string | null>(null);
  return (
    <div className="sd-actions">
      {actions.map((action) => {
        const done: PanelContextValue['statuses'][string] | undefined = statuses[action.id];
        const status: string = done ? done.status : action.status;
        return (
          <div key={action.id} className="sd-action">
            <div className="sd-action__head">
              <strong>{ACTION_LABELS[action.type] ?? action.type}</strong>
              <span>위험도 {action.riskLevel}</span>
            </div>
            <ActionPayloadPreview type={action.type} payload={action.payload} />
            {status === 'PROPOSED' ? (
              <div className="sd-action__buttons">
                <button
                  type="button"
                  className="sd-btn sd-btn--primary"
                  disabled={busyId !== null}
                  onClick={async () => {
                    setBusyId(action.id);
                    await decide(action.id, 'approve');
                    setBusyId(null);
                  }}
                >
                  승인하고 적용
                </button>
                <button
                  type="button"
                  className="sd-btn"
                  disabled={busyId !== null}
                  onClick={async () => {
                    setBusyId(action.id);
                    await decide(action.id, 'reject');
                    setBusyId(null);
                  }}
                >
                  거절
                </button>
              </div>
            ) : (
              <p className="sd-action__status">{status === 'EXECUTED' ? '✓ 문서에 적용되었습니다' : '거절되었습니다'}</p>
            )}
            {done?.warnings && done.warnings.length > 0 && <p className="sd-action__warn">⚠️ {done.warnings.join(' · ')}</p>}
          </div>
        );
      })}
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
  return null;
}
