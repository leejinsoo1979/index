'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  FiArrowRight,
  FiArrowUp,
  FiBookOpen,
  FiCheckSquare,
  FiChevronRight,
  FiFileText,
  FiFolder,
  FiLogOut,
  FiPlus,
  FiSearch,
  FiShare2,
  FiZap,
} from 'react-icons/fi';
import { listProfessionalTemplates } from '@archi/editor';
import { apiFetch } from '@archi-web/lib/client/api';
import { NavRail } from '@archi-web/components/studio/NavRail';
import { useAuth } from '@/auth/AuthContext';

type Me = {
  user: { id: string; email: string; name: string | null };
  organizations: {
    organizationId: string;
    organizationName: string;
    role: string;
    workspaces: { id: string; name: string }[];
  }[];
};

type Project = { id: string; name: string; _count?: { documents: number } };

type Dashboard = {
  counts: {
    projects: number;
    documents: number;
    openTasks: number;
    ontologyNodes: number;
    candidateNodes: number;
    approvedSources: number;
  };
  recentDocuments: {
    id: string;
    title: string;
    type: string;
    status: string;
    updatedAt: string;
    project: { id: string; name: string };
    _count: { blocks: number };
  }[];
  openTasks: {
    id: string;
    title: string;
    status: string;
    assigneeAgent: string | null;
    outputDocumentId: string | null;
  }[];
};

const DOC_TYPES = [
  { type: 'BLOG_POST', label: '블로그' },
  { type: 'REPORT', label: '기술자료' },
  { type: 'PROPOSAL', label: '제안서' },
  { type: 'SNS_CAPTION', label: 'SNS 캡션' },
  { type: 'KNOWLEDGE_NOTE', label: '지식 노트' },
] as const;

type DocType = (typeof DOC_TYPES)[number]['type'];

const PROMPT_SUGGESTIONS: { text: string; type: DocType }[] = [
  { text: '34평 아파트 거실 리모델링 시공사례 블로그 글 써줘', type: 'BLOG_POST' },
  { text: '욕실 방수 시공 기준과 체크리스트 정리해줘', type: 'REPORT' },
  { text: '아파트 인테리어 고객 제안서 초안 만들어줘', type: 'PROPOSAL' },
  { text: '준공 사진용 인스타 캡션 3개 뽑아줘', type: 'SNS_CAPTION' },
];

const TYPE_LABELS: Record<string, string> = {
  REPORT: '기술자료',
  PROPOSAL: '제안서',
  BLOG_POST: '블로그',
  SNS_CAPTION: 'SNS',
  KNOWLEDGE_NOTE: '노트',
};

const STATUS_META: Record<string, { label: string; dot: string }> = {
  DRAFT: { label: '작성 중', dot: 'bg-zinc-400' },
  NEEDS_REVIEW: { label: '검토 필요', dot: 'bg-amber-500' },
  APPROVED: { label: '승인됨', dot: 'bg-emerald-500' },
  ARCHIVED: { label: '보관됨', dot: 'bg-zinc-300' },
};

const TASK_STATUS_META: Record<string, { label: string; tone: string }> = {
  QUEUED: { label: '대기', tone: 'bg-zinc-100 text-zinc-500' },
  RUNNING: { label: '진행 중', tone: 'bg-sky-50 text-sky-700' },
  BLOCKED: { label: '차단됨', tone: 'bg-rose-50 text-rose-600' },
  NEEDS_REVIEW: { label: '검토 필요', tone: 'bg-amber-50 text-amber-700' },
};

const AGENT_LABELS: Record<string, string> = {
  content_agent: '콘텐츠팀',
  legal_agent: '법규팀',
  construction_agent: '시공팀',
  image_agent: '이미지팀',
  knowledge_agent: '지식팀',
  pm_agent: 'PM',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}일 전`;
  return new Date(iso).toLocaleDateString('ko-KR');
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 6) return '늦은 시간까지 수고 많으세요';
  if (h < 12) return '좋은 아침이에요';
  if (h < 18) return '좋은 오후예요';
  return '좋은 저녁이에요';
}

/** 문서 유형별 추상 썸네일 — 종이 위에 블록 구조를 미니어처로 그린다. */
function DocThumb({ type }: { type: string }) {
  const line = (w: string, key?: number) => (
    <span key={key} className="block h-[3px] rounded-full bg-zinc-200" style={{ width: w }} />
  );
  let body: React.ReactNode;
  switch (type) {
    case 'BLOG_POST':
      body = (
        <>
          <span className="block h-9 rounded-[3px] bg-gradient-to-br from-zinc-200 to-zinc-100" />
          <span className="mt-2 block h-[5px] w-3/4 rounded-full bg-zinc-800" />
          <span className="mt-1.5 flex flex-col gap-1">{['100%', '92%', '64%'].map(line)}</span>
        </>
      );
      break;
    case 'PROPOSAL':
      body = (
        <>
          <span className="block h-[5px] w-2/3 rounded-full bg-zinc-800" />
          <span className="mt-1.5 flex flex-col gap-1">{['100%', '80%'].map(line)}</span>
          <span className="mt-2 flex h-8 items-end gap-1">
            {[40, 62, 50, 85, 70].map((h, i) => (
              <span key={i} className="flex-1 rounded-t-[2px] bg-zinc-300" style={{ height: `${h}%` }} />
            ))}
          </span>
        </>
      );
      break;
    case 'SNS_CAPTION':
      body = (
        <span className="mx-auto flex w-3/5 flex-col">
          <span className="block aspect-square rounded-[3px] bg-gradient-to-br from-zinc-200 to-zinc-100" />
          <span className="mt-1.5 flex flex-col gap-1">{['100%', '70%'].map(line)}</span>
        </span>
      );
      break;
    case 'KNOWLEDGE_NOTE':
      body = (
        <>
          {[0, 1].map((i) => (
            <span key={i} className="mb-2 flex flex-col gap-1">
              <span className="block h-[4px] w-1/2 rounded-full bg-zinc-700" />
              {['100%', '84%'].map(line)}
            </span>
          ))}
        </>
      );
      break;
    default:
      body = (
        <>
          <span className="block h-[5px] w-3/4 rounded-full bg-zinc-800" />
          <span className="mt-1.5 flex flex-col gap-1">{['100%', '88%'].map(line)}</span>
          <span className="mt-2 grid grid-cols-3 gap-[2px] overflow-hidden rounded-[2px]">
            {Array.from({ length: 9 }).map((_, i) => (
              <span key={i} className={`h-2 ${i < 3 ? 'bg-zinc-300' : 'bg-zinc-100'}`} />
            ))}
          </span>
        </>
      );
  }
  return (
    <span className="relative flex h-full w-full items-end justify-center overflow-hidden bg-[#f4f4f5] px-5 pt-5">
      <span className="block h-full w-full rounded-t-md border border-b-0 border-zinc-200/80 bg-white p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-transform duration-300 group-hover:-translate-y-1">
        {body}
      </span>
    </span>
  );
}

/** 사용자 대시보드 — AI 요청 중심의 홈 */
export default function StudioDashboardPage() {
  const router = useRouter();
  const { logout } = useAuth();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [prompt, setPrompt] = useState('');
  const [docType, setDocType] = useState<DocType>('BLOG_POST');
  const [newProjectName, setNewProjectName] = useState('');
  const [creating, setCreating] = useState<string | null>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    apiFetch<Me>('/api/auth/me')
      .then((data) => {
        setMe(data);
        const ws = data.organizations[0]?.workspaces[0];
        if (ws) setWorkspaceId(ws.id);
        else setLoading(false);
      })
      .catch(() => router.replace('/login'));
  }, [router]);

  const reload = useCallback((wsId: string) => {
    Promise.all([
      apiFetch<Dashboard>(`/api/dashboard?workspaceId=${wsId}`),
      apiFetch<{ projects: Project[] }>(`/api/projects?workspaceId=${wsId}`),
    ])
      .then(([dash, projectData]) => {
        setDashboard(dash);
        setProjects(projectData.projects);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (workspaceId) reload(workspaceId);
  }, [workspaceId, reload]);

  // 입력창 높이 자동 조절
  useEffect(() => {
    const el = promptRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [prompt]);

  const filteredDocs = useMemo(() => {
    const docs = dashboard?.recentDocuments ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter(
      (d) => d.title.toLowerCase().includes(q) || d.project.name.toLowerCase().includes(q),
    );
  }, [dashboard, search]);

  async function handleLogout() {
    try {
      // 세션은 index의 Firebase 로그인을 공유한다.
      await logout();
    } finally {
      router.replace('/login');
    }
  }

  /** 프로젝트가 없으면 기본 프로젝트를 만든다. */
  async function ensureProjectId(wsId: string): Promise<string> {
    if (projects[0]?.id) return projects[0].id;
    const project = await apiFetch<{ id: string }>('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ workspaceId: wsId, name: '내 작업' }),
    });
    return project.id;
  }

  /** 입력창 제출 → 선택한 유형으로 문서 생성 후, 요청을 에이전트에게 그대로 전달 */
  async function handleCompose(e?: React.FormEvent) {
    e?.preventDefault();
    if (!workspaceId || creating) return;
    const message = prompt.trim();
    const typeLabel = DOC_TYPES.find((d) => d.type === docType)?.label ?? '문서';
    setCreating('compose');
    setError(null);
    try {
      const projectId = await ensureProjectId(workspaceId);
      const title = message ? (message.length > 40 ? `${message.slice(0, 40)}…` : message) : `제목 없는 ${typeLabel}`;
      const doc = await apiFetch<{ id: string }>('/api/documents', {
        method: 'POST',
        body: JSON.stringify({ projectId, title, type: docType, withTemplate: false }),
      });
      router.push(message ? `/studio/${doc.id}?prompt=${encodeURIComponent(message)}` : `/studio/${doc.id}`);
    } catch (err) {
      setError((err as Error).message);
      setCreating(null);
    }
  }

  /** 전문 템플릿으로 즉시 생성 (container 기반 구조화 문서) */
  async function handleCreateFromTemplate(tpl: { id: string; label: string }) {
    if (!workspaceId || creating) return;
    setCreating(`tpl:${tpl.id}`);
    setError(null);
    try {
      const projectId = await ensureProjectId(workspaceId);
      const doc = await apiFetch<{ id: string }>('/api/documents', {
        method: 'POST',
        body: JSON.stringify({ projectId, title: tpl.label, templateId: tpl.id }),
      });
      router.push(`/studio/${doc.id}`);
    } catch (err) {
      setError((err as Error).message);
      setCreating(null);
    }
  }

  async function handleCreateProject(e: React.FormEvent) {
    e.preventDefault();
    if (!workspaceId || !newProjectName.trim()) return;
    try {
      await apiFetch('/api/projects', {
        method: 'POST',
        body: JSON.stringify({ workspaceId, name: newProjectName.trim() }),
      });
      setNewProjectName('');
      reload(workspaceId);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#f7f7f8]">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" />
      </div>
    );
  }

  const counts = dashboard?.counts;
  const displayName = me?.user.name || me?.user.email.split('@')[0] || '';
  const org = me?.organizations[0];
  const templates = listProfessionalTemplates();

  return (
    <div className="flex h-screen overflow-hidden bg-[#f7f7f8]">
      <NavRail />

      <main className="flex min-w-0 flex-1 flex-col">
        {/* 상단 바 */}
        <header className="flex h-14 shrink-0 items-center gap-4 border-b border-zinc-200/70 bg-white/80 px-6 backdrop-blur">
          <label className="flex h-9 w-full max-w-sm items-center gap-2 rounded-full bg-zinc-100 px-4 text-zinc-400 transition focus-within:bg-white focus-within:ring-1 focus-within:ring-zinc-300">
            <FiSearch size={14} className="shrink-0" aria-hidden />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="문서·프로젝트 검색"
              className="w-full bg-transparent text-[13px] text-zinc-900 outline-none placeholder:text-zinc-400"
            />
          </label>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.push('/studio/wiki')}
              className="mr-2 inline-flex h-8 items-center gap-2 rounded-lg border border-indigo-100 bg-indigo-50 px-3 text-[12px] font-semibold text-indigo-600 transition hover:bg-indigo-100"
            >
              <FiBookOpen size={14} aria-hidden />
              LLM Wiki
            </button>
            <div className="hidden text-right sm:block">
              <p className="text-[12px] font-semibold text-zinc-900">{displayName}</p>
              {org && (
                <p className="text-[10px] text-zinc-400">
                  {org.organizationName} · {org.role}
                </p>
              )}
            </div>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-900 text-[11px] font-semibold text-white">
              {displayName.slice(0, 1).toUpperCase()}
            </span>
            <button
              onClick={handleLogout}
              title="로그아웃"
              className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-900"
            >
              <FiLogOut size={14} aria-hidden />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* ── 히어로: AI 요청 입력 ── */}
          <section className="relative border-b border-zinc-200/70 bg-white">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-[0.5] [background-image:radial-gradient(var(--color-zinc-300)_1px,transparent_1px)] [background-size:20px_20px] [mask-image:linear-gradient(to_bottom,black,transparent)]"
            />
            <div className="relative mx-auto max-w-3xl px-6 pb-12 pt-14 text-center">
              <p className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11px] font-medium text-zinc-500">
                <FiZap size={11} className="text-zinc-900" aria-hidden />
                INDEX 에이전트 팀이 대기 중입니다
              </p>
              <h1 className="text-[30px] font-semibold leading-tight tracking-[-0.02em] text-zinc-900">
                {greeting()}, {displayName}님.
                <br />
                <span className="text-zinc-400">오늘은 무엇을 만들까요?</span>
              </h1>

              <form
                onSubmit={handleCompose}
                className="mt-8 rounded-2xl border border-zinc-200 bg-white text-left shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.12)] transition focus-within:border-zinc-400"
              >
                <textarea
                  ref={promptRef}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      void handleCompose();
                    }
                  }}
                  rows={2}
                  placeholder="에이전트에게 요청하세요. 예) 34평 아파트 거실 리모델링 사례를 블로그 글로 써줘"
                  className="block w-full resize-none bg-transparent px-5 pt-4 text-[15px] leading-6 text-zinc-900 outline-none placeholder:text-zinc-400"
                />
                <div className="flex items-center gap-2 px-3 pb-3 pt-2">
                  <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="문서 유형">
                    {DOC_TYPES.map((d) => (
                      <button
                        key={d.type}
                        type="button"
                        role="radio"
                        aria-checked={docType === d.type}
                        onClick={() => setDocType(d.type)}
                        className={`h-7 rounded-full px-3 text-[12px] font-medium transition ${
                          docType === d.type
                            ? 'bg-zinc-900 text-white'
                            : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900'
                        }`}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="submit"
                    disabled={creating !== null}
                    className="ml-auto flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-zinc-900 pl-4 pr-3 text-[12px] font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-50"
                  >
                    {creating === 'compose' ? '만드는 중…' : prompt.trim() ? '시작하기' : '빈 문서'}
                    <FiArrowUp size={14} aria-hidden />
                  </button>
                </div>
              </form>

              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {PROMPT_SUGGESTIONS.map((s) => (
                  <button
                    key={s.text}
                    type="button"
                    onClick={() => {
                      setPrompt(s.text);
                      setDocType(s.type);
                      promptRef.current?.focus();
                    }}
                    className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-[12px] text-zinc-600 transition hover:border-zinc-900 hover:text-zinc-900"
                  >
                    {s.text}
                  </button>
                ))}
              </div>

              {error && <p className="mt-4 text-[13px] text-rose-600">{error}</p>}
            </div>
          </section>

          <div className="mx-auto grid max-w-6xl gap-10 px-6 py-10 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-w-0 space-y-12">
              {/* ── 최근 문서 ── */}
              <section>
                <div className="mb-4 flex items-end justify-between">
                  <div>
                    <h2 className="text-[15px] font-semibold tracking-tight text-zinc-900">최근 문서</h2>
                    <p className="mt-0.5 text-[12px] text-zinc-400">마지막으로 수정한 순서</p>
                  </div>
                  {search && (
                    <span className="text-[12px] text-zinc-400">
                      ‘{search}’ 검색 결과 {filteredDocs.length}개
                    </span>
                  )}
                </div>
                {filteredDocs.length === 0 ? (
                  <div className="flex h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-white text-center">
                    <FiFileText size={20} className="text-zinc-300" aria-hidden />
                    <p className="mt-3 text-[13px] font-medium text-zinc-700">
                      {search ? '검색 결과가 없습니다' : '아직 문서가 없습니다'}
                    </p>
                    {!search && (
                      <p className="mt-1 text-[12px] text-zinc-400">위 입력창에 요청을 적으면 첫 문서가 만들어집니다.</p>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
                    {filteredDocs.map((doc) => {
                      const status = STATUS_META[doc.status] ?? { label: doc.status, dot: 'bg-zinc-400' };
                      return (
                        <button
                          key={doc.id}
                          onClick={() => router.push(`/studio/${doc.id}`)}
                          className="group overflow-hidden rounded-xl border border-zinc-200 bg-white text-left transition hover:border-zinc-300 hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.18)]"
                        >
                          <span className="relative block h-32">
                            <DocThumb type={doc.type} />
                            <span className="absolute left-2.5 top-2.5 rounded-md bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600 shadow-sm backdrop-blur">
                              {TYPE_LABELS[doc.type] ?? doc.type}
                            </span>
                          </span>
                          <span className="block border-t border-zinc-100 p-3.5">
                            <span className="block truncate text-[13px] font-semibold text-zinc-900">{doc.title}</span>
                            <span className="mt-1.5 flex items-center gap-1.5 text-[11px] text-zinc-400">
                              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${status.dot}`} />
                              <span className="shrink-0 text-zinc-500">{status.label}</span>
                              <span className="text-zinc-300">·</span>
                              <span className="truncate">{doc.project.name}</span>
                              <span className="ml-auto shrink-0">{timeAgo(doc.updatedAt)}</span>
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* ── 전문 템플릿 ── */}
              <section>
                <div className="mb-4">
                  <h2 className="text-[15px] font-semibold tracking-tight text-zinc-900">전문 템플릿</h2>
                  <p className="mt-0.5 text-[12px] text-zinc-400">
                    법규·계산식·견적표까지 구조가 잡힌 문서로 바로 시작하세요.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {templates.map((tpl) => (
                    <button
                      key={tpl.id}
                      onClick={() => handleCreateFromTemplate(tpl)}
                      disabled={creating !== null}
                      className="group flex items-start gap-3 rounded-xl border border-zinc-200 bg-white p-3.5 text-left transition hover:border-zinc-900 disabled:opacity-60"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-500 transition group-hover:bg-zinc-900 group-hover:text-white">
                        <FiFileText size={15} aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold text-zinc-900">{tpl.label}</span>
                        <span className="mt-0.5 line-clamp-2 block text-[11px] leading-4 text-zinc-400">
                          {creating === `tpl:${tpl.id}` ? '만드는 중…' : tpl.description}
                        </span>
                      </span>
                      <FiPlus
                        size={14}
                        className="mt-0.5 shrink-0 text-zinc-300 transition group-hover:text-zinc-900"
                        aria-hidden
                      />
                    </button>
                  ))}
                </div>
              </section>
            </div>

            {/* ── 우측 사이드 ── */}
            <aside className="space-y-5">
              {/* 현황 */}
              <section className="rounded-2xl border border-zinc-200 bg-white">
                <h2 className="px-5 pt-4 text-[13px] font-semibold text-zinc-900">워크스페이스</h2>
                <dl className="grid grid-cols-2">
                  {[
                    { icon: FiFolder, label: '프로젝트', value: counts?.projects ?? 0, href: null },
                    { icon: FiFileText, label: '문서', value: counts?.documents ?? 0, href: null },
                    { icon: FiCheckSquare, label: '진행 중 업무', value: counts?.openTasks ?? 0, href: '/studio/messenger' },
                    { icon: FiShare2, label: '지식 노드', value: counts?.ontologyNodes ?? 0, href: '/studio/ontology' },
                  ].map(({ icon: Icon, label, value, href }, i) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => href && router.push(href)}
                      className={`flex flex-col items-start px-5 py-4 text-left ${i % 2 === 0 ? 'border-r' : ''} ${
                        i < 2 ? 'border-b' : ''
                      } border-zinc-100 ${href ? 'transition hover:bg-zinc-50' : 'cursor-default'}`}
                    >
                      <dt className="flex items-center gap-1.5 text-[11px] text-zinc-400">
                        <Icon size={11} aria-hidden />
                        {label}
                      </dt>
                      <dd className="mt-1 text-[22px] font-semibold tabular-nums tracking-tight text-zinc-900">
                        {value}
                      </dd>
                    </button>
                  ))}
                </dl>
              </section>

              {/* 진행 중 업무 */}
              <section className="rounded-2xl border border-zinc-200 bg-white p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-[13px] font-semibold text-zinc-900">진행 중 업무</h2>
                  <button
                    onClick={() => router.push('/studio/messenger')}
                    className="flex items-center gap-0.5 text-[11px] font-medium text-zinc-400 transition hover:text-zinc-900"
                  >
                    전체 <FiChevronRight size={12} aria-hidden />
                  </button>
                </div>
                {(dashboard?.openTasks.length ?? 0) === 0 ? (
                  <p className="rounded-xl bg-zinc-50 px-4 py-5 text-center text-[12px] leading-5 text-zinc-400">
                    진행 중인 업무가 없습니다.
                    <br />
                    메신저에서 @에이전트를 멘션해 보세요.
                  </p>
                ) : (
                  <ul className="-mx-2 space-y-0.5">
                    {dashboard!.openTasks.map((task) => {
                      const st = TASK_STATUS_META[task.status] ?? { label: task.status, tone: 'bg-zinc-100 text-zinc-500' };
                      return (
                        <li key={task.id}>
                          <button
                            type="button"
                            onClick={() =>
                              router.push(task.outputDocumentId ? `/studio/${task.outputDocumentId}` : '/studio/messenger')
                            }
                            className="w-full rounded-lg px-2 py-2 text-left transition hover:bg-zinc-50"
                          >
                            <span className="block truncate text-[12px] font-medium text-zinc-800">{task.title}</span>
                            <span className="mt-1 flex items-center gap-1.5 text-[10px]">
                              <span className={`rounded px-1.5 py-0.5 font-medium ${st.tone}`}>{st.label}</span>
                              {task.assigneeAgent && (
                                <span className="text-zinc-400">
                                  {AGENT_LABELS[task.assigneeAgent] ?? task.assigneeAgent}
                                </span>
                              )}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              {/* 프로젝트 */}
              <section className="rounded-2xl border border-zinc-200 bg-white p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-[13px] font-semibold text-zinc-900">프로젝트</h2>
                  <span className="text-[11px] tabular-nums text-zinc-400">{projects.length}</span>
                </div>
                {projects.length > 0 && (
                  <ul className="-mx-2 mb-3 space-y-0.5">
                    {projects.slice(0, 5).map((project) => (
                      <li
                        key={project.id}
                        className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[12px]"
                      >
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-[10px] font-semibold text-zinc-500">
                          {project.name.slice(0, 1)}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-medium text-zinc-700">{project.name}</span>
                        <span className="shrink-0 text-[11px] tabular-nums text-zinc-400">
                          {project._count?.documents ?? 0}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <form
                  onSubmit={handleCreateProject}
                  className="flex h-9 items-center gap-1 rounded-lg border border-zinc-200 pl-3 pr-1 transition focus-within:border-zinc-900"
                >
                  <input
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="새 프로젝트 이름"
                    className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-zinc-400"
                  />
                  <button
                    type="submit"
                    disabled={!newProjectName.trim()}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-zinc-900 text-white transition disabled:bg-zinc-200"
                    aria-label="프로젝트 추가"
                  >
                    <FiPlus size={13} aria-hidden />
                  </button>
                </form>
              </section>

              {/* 지식 그래프 */}
              <button
                type="button"
                onClick={() => router.push('/studio/ontology')}
                className="group relative w-full overflow-hidden rounded-2xl bg-zinc-900 p-5 text-left text-white"
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full border border-white/10"
                />
                <span
                  aria-hidden
                  className="pointer-events-none absolute -right-2 top-6 h-14 w-14 rounded-full border border-white/10"
                />
                <span className="flex items-center gap-2 text-[13px] font-semibold">
                  <FiBookOpen size={14} aria-hidden />
                  지식 그래프
                </span>
                <span className="mt-1.5 block text-[11px] leading-4 text-zinc-400">
                  노드 {counts?.ontologyNodes ?? 0} · 검수 대기 {counts?.candidateNodes ?? 0} · 승인 소스{' '}
                  {counts?.approvedSources ?? 0}
                </span>
                <span className="mt-4 inline-flex items-center gap-1 text-[12px] font-medium text-white">
                  그래프 열기
                  <FiArrowRight size={12} className="transition group-hover:translate-x-0.5" aria-hidden />
                </span>
              </button>
            </aside>
          </div>
        </div>
      </main>
    </div>
  );
}
