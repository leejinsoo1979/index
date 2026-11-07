'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Black_Han_Sans } from 'next/font/google';
import {
  FiArrowRight,
  FiCheckSquare,
  FiFileText,
  FiFolder,
  FiLogOut,
  FiPlus,
  FiSearch,
  FiShare2,
} from 'react-icons/fi';
import { listProfessionalTemplates } from '@archi/editor';
import { apiFetch } from '@archi-web/lib/client/api';
import { NavRail } from '@archi-web/components/studio/NavRail';
import { useAuth } from '@/auth/AuthContext';

const display = Black_Han_Sans({ weight: '400', preload: false, display: 'swap' });

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
  { type: 'REPORT', label: '기술자료', desc: '법규·계산식·기준표 템플릿' },
  { type: 'PROPOSAL', label: '제안서', desc: '범위·비용 차트 템플릿' },
  { type: 'BLOG_POST', label: '블로그', desc: '초안·체크리스트·CTA' },
  { type: 'SNS_CAPTION', label: 'SNS 캡션', desc: '짧은 글 + 이미지' },
  { type: 'KNOWLEDGE_NOTE', label: '지식 노트', desc: 'Q&A·출처 정리' },
] as const;

const TYPE_LABELS: Record<string, string> = {
  REPORT: '기술자료',
  PROPOSAL: '제안서',
  BLOG_POST: '블로그',
  SNS_CAPTION: 'SNS',
  KNOWLEDGE_NOTE: '노트',
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: '작성 중',
  NEEDS_REVIEW: '검토 필요',
  APPROVED: '승인됨',
  ARCHIVED: '보관됨',
};

const TASK_STATUS_LABELS: Record<string, string> = {
  QUEUED: '대기',
  RUNNING: '진행 중',
  BLOCKED: '차단됨',
  NEEDS_REVIEW: '검토 필요',
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

/** 사용자 대시보드 — 로그인 후 홈 (Figma/Canva 스타일 파일 허브) */
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

  const [newProjectName, setNewProjectName] = useState('');
  const [creating, setCreating] = useState<string | null>(null);

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

  /** 템플릿 카드 클릭 → 즉시 생성 후 에디터로 (이름/프로젝트는 에디터에서 수정). Canva 스타일. */
  async function handleQuickCreate(docType: (typeof DOC_TYPES)[number]) {
    if (!workspaceId || creating) return;
    setCreating(docType.type);
    setError(null);
    try {
      // 프로젝트가 없으면 기본 프로젝트를 자동 생성
      let projectId = projects[0]?.id;
      if (!projectId) {
        const project = await apiFetch<{ id: string }>('/api/projects', {
          method: 'POST',
          body: JSON.stringify({ workspaceId, name: '내 작업' }),
        });
        projectId = project.id;
      }
      const doc = await apiFetch<{ id: string }>('/api/documents', {
        method: 'POST',
        body: JSON.stringify({
          projectId,
          title: `제목 없는 ${docType.label}`,
          type: docType.type,
          // 빈 문서로 시작 — 블록은 사용자가 +로 직접 추가한다
          withTemplate: false,
        }),
      });
      router.push(`/studio/${doc.id}`);
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
      let projectId = projects[0]?.id;
      if (!projectId) {
        const project = await apiFetch<{ id: string }>('/api/projects', {
          method: 'POST',
          body: JSON.stringify({ workspaceId, name: '내 작업' }),
        });
        projectId = project.id;
      }
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

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-100 text-sm text-zinc-400">
        대시보드를 불러오는 중...
      </div>
    );
  }

  const counts = dashboard?.counts;
  const displayName = me?.user.name || me?.user.email.split('@')[0] || '';

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-100">
      <NavRail />

      <main className="flex min-w-0 flex-1 flex-col">
        {/* 상단 바: 검색 + 프로필 */}
        <header className="flex h-14 shrink-0 items-center gap-4 border-b border-zinc-200 bg-white px-6">
          <div className="flex h-9 w-80 items-center gap-2 rounded-lg border border-zinc-200 px-3 focus-within:border-zinc-900">
            <FiSearch size={14} className="shrink-0 text-zinc-400" aria-hidden />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="문서·프로젝트 검색"
              className="w-full bg-transparent text-[13px] outline-none"
            />
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs font-bold text-zinc-900">{displayName}</p>
              <p className="text-[10px] text-zinc-400">
                {me?.organizations[0]?.organizationName} · {me?.organizations[0]?.role}
              </p>
            </div>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-900 text-xs font-bold text-white">
              {displayName.slice(0, 1).toUpperCase()}
            </span>
            <button
              onClick={handleLogout}
              title="로그아웃"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 hover:border-zinc-900 hover:text-zinc-900"
            >
              <FiLogOut size={14} aria-hidden />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl px-8 py-8">
            {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

            {/* 인사 + 새로 만들기 */}
            <div className="mb-8">
              <h1 className={`${display.className} text-3xl text-zinc-900`}>
                {displayName}님, 무엇을 만들까요?
              </h1>
              <p className="mt-1 text-xs text-zinc-500">
                유형을 고르면 블록 템플릿이 자동 구성되고, AI 에이전트가 초안을 도와줍니다.
              </p>
            </div>

            <div className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {DOC_TYPES.map((docType) => (
                <button
                  key={docType.type}
                  onClick={() => handleQuickCreate(docType)}
                  disabled={creating !== null}
                  className="group rounded-2xl border border-zinc-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-zinc-900 hover:shadow-md disabled:opacity-60"
                >
                  <span className="mb-6 flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-900 text-white transition group-hover:scale-105">
                    <FiPlus size={15} aria-hidden />
                  </span>
                  <p className={`${display.className} text-lg text-zinc-900`}>{docType.label}</p>
                  <p className="mt-0.5 text-[10px] leading-4 text-zinc-400">
                    {creating === docType.type ? '만드는 중...' : docType.desc}
                  </p>
                </button>
              ))}
            </div>

            {/* 전문 템플릿 (container 기반 구조화 문서) */}
            <div className="mb-10">
              <h2 className="mb-1 text-sm font-bold text-zinc-900">전문 템플릿</h2>
              <p className="mb-3 text-[11px] text-zinc-500">
                컨테이너·법규·계산식·견적표까지 구조가 잡힌 문서로 바로 시작하세요.
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {listProfessionalTemplates().map((tpl) => (
                  <button
                    key={tpl.id}
                    onClick={() => handleCreateFromTemplate(tpl)}
                    disabled={creating !== null}
                    className="group rounded-xl border border-zinc-200 bg-white p-3 text-left transition hover:border-zinc-900 hover:shadow-sm disabled:opacity-60"
                  >
                    <p className="text-[13px] font-bold text-zinc-900">{tpl.label}</p>
                    <p className="mt-0.5 text-[10px] leading-4 text-zinc-400">
                      {creating === `tpl:${tpl.id}` ? '만드는 중...' : tpl.description}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* 현황 스탯 */}
            <div className="mb-10 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                { icon: FiFolder, value: counts?.projects ?? 0, label: '프로젝트', href: null },
                { icon: FiFileText, value: counts?.documents ?? 0, label: '문서', href: null },
                {
                  icon: FiCheckSquare,
                  value: counts?.openTasks ?? 0,
                  label: '진행 중 업무',
                  href: '/studio/messenger',
                },
                {
                  icon: FiShare2,
                  value: counts?.ontologyNodes ?? 0,
                  label: `지식 노드 · 검수 대기 ${counts?.candidateNodes ?? 0}`,
                  href: '/studio/ontology',
                },
              ].map(({ icon: Icon, value, label, href }) => (
                <button
                  key={label}
                  onClick={() => href && router.push(href)}
                  className={`flex items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-5 text-left ${
                    href ? 'transition hover:border-zinc-900' : 'cursor-default'
                  }`}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-600">
                    <Icon size={16} aria-hidden />
                  </span>
                  <span>
                    <span className={`${display.className} block text-2xl text-zinc-900`}>{value}</span>
                    <span className="text-[10px] tracking-wide text-zinc-400">{label}</span>
                  </span>
                </button>
              ))}
            </div>

            <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
              {/* 최근 문서 그리드 */}
              <section>
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-sm font-bold text-zinc-900">최근 문서</h2>
                  <span className="text-[10px] text-zinc-400">최근 수정 순</span>
                </div>
                {filteredDocs.length === 0 ? (
                  <div className="flex h-44 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-zinc-200 text-zinc-400">
                    <p className="text-sm">{search ? '검색 결과가 없습니다.' : '아직 문서가 없습니다.'}</p>
                    {!search && <p className="mt-1 text-xs">위에서 유형을 골라 첫 문서를 만들어 보세요.</p>}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
                    {filteredDocs.map((doc) => (
                      <button
                        key={doc.id}
                        onClick={() => router.push(`/studio/${doc.id}`)}
                        className="group overflow-hidden rounded-2xl border border-zinc-200 bg-white text-left transition hover:-translate-y-0.5 hover:border-zinc-900 hover:shadow-md"
                      >
                        {/* 추상 프리뷰 (파일 카드) */}
                        <div className="relative flex h-28 items-center justify-center bg-zinc-900">
                          <span className={`${display.className} text-4xl text-white/10`}>
                            {TYPE_LABELS[doc.type] ?? 'DOC'}
                          </span>
                          <span className="absolute left-3 top-3 rounded bg-white/10 px-1.5 py-0.5 text-[9px] tracking-widest text-zinc-300">
                            {TYPE_LABELS[doc.type] ?? doc.type}
                          </span>
                          <span className="absolute bottom-3 right-3 text-[9px] text-zinc-500">
                            블록 {doc._count.blocks}
                          </span>
                        </div>
                        <div className="p-3.5">
                          <p className="truncate text-[13px] font-bold text-zinc-900">{doc.title}</p>
                          <p className="mt-1 flex items-center justify-between text-[10px] text-zinc-400">
                            <span className="truncate">{doc.project.name}</span>
                            <span className="shrink-0">{timeAgo(doc.updatedAt)}</span>
                          </p>
                          <span className="mt-2 inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-[9px] font-bold text-zinc-500">
                            {STATUS_LABELS[doc.status] ?? doc.status}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              {/* 우측: 업무 + 프로젝트 */}
              <aside className="space-y-6">
                <section className="rounded-2xl border border-zinc-200 bg-white p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-sm font-bold text-zinc-900">진행 중 업무</h2>
                    <button
                      onClick={() => router.push('/studio/messenger')}
                      className="text-[10px] font-bold text-zinc-400 hover:text-zinc-900"
                    >
                      전체 보기 <FiArrowRight className="inline" size={10} aria-hidden />
                    </button>
                  </div>
                  {(dashboard?.openTasks.length ?? 0) === 0 ? (
                    <p className="py-4 text-center text-xs text-zinc-400">
                      진행 중인 업무가 없습니다.
                      <br />
                      메신저에서 @에이전트를 멘션해 보세요.
                    </p>
                  ) : (
                    <ul className="space-y-2.5">
                      {dashboard!.openTasks.map((task) => (
                        <li key={task.id} className="text-xs">
                          <p className="truncate font-semibold text-zinc-800">{task.title}</p>
                          <p className="mt-0.5 flex gap-1.5 text-[10px] text-zinc-400">
                            {task.assigneeAgent && (
                              <span className="rounded bg-zinc-900 px-1.5 text-white">
                                {AGENT_LABELS[task.assigneeAgent] ?? task.assigneeAgent}
                              </span>
                            )}
                            <span>{TASK_STATUS_LABELS[task.status] ?? task.status}</span>
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="rounded-2xl border border-zinc-200 bg-white p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-sm font-bold text-zinc-900">프로젝트</h2>
                    <span className="text-[10px] text-zinc-400">{projects.length}개</span>
                  </div>
                  <ul className="mb-3 space-y-1.5">
                    {projects.slice(0, 5).map((project) => (
                      <li
                        key={project.id}
                        className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2 text-xs"
                      >
                        <span className="truncate font-semibold text-zinc-700">{project.name}</span>
                        <span className="shrink-0 text-[10px] text-zinc-400">
                          문서 {project._count?.documents ?? 0}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <form
                    onSubmit={async (e) => {
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
                    }}
                    className="flex gap-1.5"
                  >
                    <input
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      placeholder="새 프로젝트"
                      className="h-9 min-w-0 flex-1 rounded-lg border border-zinc-200 px-2.5 text-xs outline-none focus:border-zinc-900"
                    />
                    <button
                      type="submit"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-white"
                      aria-label="프로젝트 추가"
                    >
                      <FiPlus size={14} aria-hidden />
                    </button>
                  </form>
                </section>

                <section className="rounded-2xl bg-zinc-900 p-5 text-white">
                  <h2 className={`${display.className} text-lg`}>지식 그래프</h2>
                  <p className="mt-1 text-[11px] leading-4 text-zinc-400">
                    노드 {counts?.ontologyNodes ?? 0}개 · 승인된 지식소스 {counts?.approvedSources ?? 0}개
                  </p>
                  <button
                    onClick={() => router.push('/studio/ontology')}
                    className="mt-4 w-full rounded-lg bg-white py-2 text-xs font-bold text-zinc-900 hover:bg-zinc-200"
                  >
                    그래프 탐험하기 →
                  </button>
                </section>
              </aside>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
