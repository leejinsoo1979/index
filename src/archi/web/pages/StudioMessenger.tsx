'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { FiHash, FiPlus, FiSend } from 'react-icons/fi';
import { apiFetch } from '@archi-web/lib/client/api';
import { NavRail } from '@archi-web/components/studio/NavRail';
import { ResizeHandle, useResizable } from '@archi-web/components/studio/Resizable';

type Me = { organizations: { workspaces: { id: string; name: string }[] }[] };
type Channel = { id: string; name: string };
type Message = { id: string; authorType: string; text: string; createdAt: string };
type Task = {
  id: string;
  title: string;
  assigneeAgent: string | null;
  status: string;
  outputDocumentId: string | null;
};

const TASK_STATUS_LABELS: Record<string, string> = {
  QUEUED: '대기',
  RUNNING: '진행 중',
  BLOCKED: '차단됨',
  NEEDS_REVIEW: '검토 필요',
  DONE: '완료',
  FAILED: '실패',
  CANCELED: '취소',
};

const AGENT_LABELS: Record<string, string> = {
  content_agent: '콘텐츠팀',
  image_agent: '이미지팀',
  legal_agent: '법규팀',
  knowledge_agent: '지식관리팀',
};

/** 메신저 + Task Center — 스튜디오 디자인 시스템 */
export default function MessengerPage() {
  const channelPanel = useResizable({
    initial: 208,
    min: 160,
    max: 400,
    side: 'left',
    storageKey: 'archi.msg.channels.w',
  });
  const detailPanel = useResizable({
    initial: 320,
    min: 240,
    max: 520,
    side: 'right',
    storageKey: 'archi.msg.detail.w',
  });
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [text, setText] = useState('');
  const [newChannel, setNewChannel] = useState('');
  const [linkDrafts, setLinkDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiFetch<Me>('/api/auth/me')
      .then((me) => setWorkspaceId(me.organizations[0]?.workspaces[0]?.id ?? null))
      .catch(() => setError('로그인이 필요합니다. 스튜디오에서 먼저 로그인해 주세요.'));
  }, []);

  const loadChannels = useCallback((wsId: string) => {
    apiFetch<{ channels: Channel[] }>(`/api/channels?workspaceId=${wsId}`)
      .then((data) => {
        setChannels(data.channels);
        setChannelId((prev) => prev ?? data.channels[0]?.id ?? null);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const loadTasks = useCallback((wsId: string) => {
    apiFetch<{ tasks: Task[] }>(`/api/tasks?workspaceId=${wsId}`)
      .then((data) => setTasks(data.tasks))
      .catch((e: Error) => setError(e.message));
  }, []);

  const loadMessages = useCallback((chId: string) => {
    apiFetch<{ messages: Message[] }>(`/api/channels/${chId}/messages`)
      .then((data) => setMessages(data.messages))
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (workspaceId) {
      loadChannels(workspaceId);
      loadTasks(workspaceId);
    }
  }, [workspaceId, loadChannels, loadTasks]);

  useEffect(() => {
    if (channelId) loadMessages(channelId);
  }, [channelId, loadMessages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function handleCreateChannel(e: React.FormEvent) {
    e.preventDefault();
    if (!workspaceId || !newChannel.trim()) return;
    try {
      const channel = await apiFetch<Channel>('/api/channels', {
        method: 'POST',
        body: JSON.stringify({ workspaceId, name: newChannel.trim() }),
      });
      setNewChannel('');
      loadChannels(workspaceId);
      setChannelId(channel.id);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!channelId || !text.trim() || !workspaceId) return;
    try {
      await apiFetch(`/api/channels/${channelId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ text: text.trim() }),
      });
      setText('');
      loadMessages(channelId);
      loadTasks(workspaceId);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleTaskStatus(taskId: string, status: string) {
    if (!workspaceId) return;
    try {
      await apiFetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      loadTasks(workspaceId);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleLinkOutput(taskId: string) {
    const documentId = linkDrafts[taskId]?.trim();
    if (!documentId || !workspaceId) return;
    try {
      await apiFetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({ outputDocumentId: documentId }),
      });
      setLinkDrafts((prev) => ({ ...prev, [taskId]: '' }));
      loadTasks(workspaceId);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const currentChannel = channels.find((c) => c.id === channelId);

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-100">
      <NavRail />

      {/* 채널 목록 */}
      <aside
        style={{ width: channelPanel.width }}
        className="relative flex shrink-0 flex-col border-r border-zinc-200 bg-white"
      >
        <ResizeHandle side="left" onPointerDown={channelPanel.onPointerDown} />
        <div className="border-b border-zinc-200 px-4 py-3">
          <h2 className="text-xs font-bold text-zinc-700">채널</h2>
        </div>
        <ul className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {channels.map((channel) => (
            <li key={channel.id}>
              <button
                onClick={() => setChannelId(channel.id)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] transition ${
                  channelId === channel.id
                    ? 'bg-zinc-900 font-semibold text-white'
                    : 'text-zinc-600 hover:bg-zinc-100'
                }`}
              >
                <FiHash size={12} aria-hidden className="shrink-0 opacity-60" />
                {channel.name}
              </button>
            </li>
          ))}
        </ul>
        <form onSubmit={handleCreateChannel} className="border-t border-zinc-200 p-2">
          <div className="flex items-center gap-1 rounded-lg border border-zinc-200 px-2 py-1.5 focus-within:border-zinc-900">
            <FiPlus size={12} className="shrink-0 text-zinc-400" aria-hidden />
            <input
              value={newChannel}
              onChange={(e) => setNewChannel(e.target.value)}
              placeholder="새 채널"
              className="w-full text-xs outline-none"
            />
          </div>
        </form>
      </aside>

      {/* 메시지 영역 */}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-zinc-200 bg-white px-5">
          <h1 className="flex items-center gap-1.5 text-sm font-bold text-zinc-900">
            {currentChannel ? (
              <>
                <FiHash size={13} aria-hidden className="text-zinc-400" />
                {currentChannel.name}
              </>
            ) : (
              '메신저'
            )}
          </h1>
          <span className="text-[11px] text-zinc-400">
            @에이전트 멘션으로 업무를 지시하세요
          </span>
        </header>

        {error && <p className="px-5 pt-2 text-xs text-red-600">{error}</p>}

        <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-5">
          {!channelId ? (
            <div className="flex h-full flex-col items-center justify-center text-zinc-400">
              <p className="text-sm font-semibold">채널을 만들어 시작하세요</p>
              <p className="mt-1 text-xs">
                «@콘텐츠에이전트 블로그 초안 작성» 처럼 멘션하면 업무가 생성됩니다
              </p>
            </div>
          ) : (
            messages.map((message) =>
              message.authorType === 'system' ? (
                <div key={message.id} className="flex justify-center">
                  <span className="rounded-full bg-zinc-200 px-3 py-1 text-[11px] text-zinc-600">
                    {message.text}
                  </span>
                </div>
              ) : (
                <div key={message.id} className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-[10px] font-bold text-white">
                    나
                  </span>
                  <div className="max-w-xl rounded-2xl rounded-tl-sm bg-white px-3.5 py-2 text-sm leading-6 text-zinc-800 shadow-sm">
                    {message.text}
                  </div>
                </div>
              ),
            )
          )}
        </div>

        {channelId && (
          <form onSubmit={handleSend} className="border-t border-zinc-200 bg-white p-3">
            <div className="flex items-center gap-2 rounded-xl border border-zinc-300 px-3 py-2 focus-within:border-zinc-900">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder='메시지 입력... (예: "@콘텐츠에이전트 무몰딩 블로그 초안 작성")'
                className="flex-1 text-sm outline-none"
              />
              <button
                type="submit"
                disabled={!text.trim()}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-white disabled:opacity-40"
                aria-label="전송"
              >
                <FiSend size={13} aria-hidden />
              </button>
            </div>
          </form>
        )}
      </main>

      {/* Task Center */}
      <aside
        style={{ width: detailPanel.width }}
        className="relative flex shrink-0 flex-col border-l border-zinc-200 bg-white"
      >
        <ResizeHandle side="right" onPointerDown={detailPanel.onPointerDown} />
        <div className="border-b border-zinc-200 px-4 py-3">
          <h2 className="text-xs font-bold text-zinc-700">Task Center</h2>
          <p className="text-[10px] text-zinc-400">진행 중 {tasks.filter((t) => t.status === 'RUNNING').length} · 전체 {tasks.length}</p>
        </div>
        <ul className="flex-1 space-y-2 overflow-y-auto p-3">
          {tasks.length === 0 && (
            <p className="pt-8 text-center text-xs text-zinc-400">아직 업무가 없습니다.</p>
          )}
          {tasks.map((task) => (
            <li key={task.id} className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
              <p className="mb-2 text-[13px] font-semibold leading-5 text-zinc-900">
                {task.title}
              </p>
              <div className="mb-2 flex items-center gap-1.5">
                {task.assigneeAgent && (
                  <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-[10px] font-bold text-white">
                    {AGENT_LABELS[task.assigneeAgent] ?? task.assigneeAgent}
                  </span>
                )}
                <select
                  value={task.status}
                  onChange={(e) => handleTaskStatus(task.id, e.target.value)}
                  className="rounded-md border border-zinc-200 px-1.5 py-0.5 text-[11px] text-zinc-600"
                >
                  {Object.entries(TASK_STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              {task.outputDocumentId ? (
                <Link
                  href={`/studio/${task.outputDocumentId}`}
                  className="text-[11px] font-bold text-zinc-900 underline hover:text-zinc-600"
                >
                  산출물 문서 열기 →
                </Link>
              ) : (
                <div className="flex gap-1">
                  <input
                    value={linkDrafts[task.id] ?? ''}
                    onChange={(e) =>
                      setLinkDrafts((prev) => ({ ...prev, [task.id]: e.target.value }))
                    }
                    placeholder="문서 ID 연결"
                    className="min-w-0 flex-1 rounded-md border border-zinc-200 px-2 py-1 text-[11px]"
                  />
                  <button
                    onClick={() => handleLinkOutput(task.id)}
                    className="rounded-md bg-zinc-900 px-2.5 py-1 text-[11px] font-semibold text-white"
                  >
                    연결
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
