import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { FiArrowRight, FiCheckSquare, FiFileText, FiFolder, FiLogOut, FiPlus, FiSearch, FiShare2 } from "react-icons/fi";
import { useAuth } from "../auth/AuthContext";
import AgentNavRail, { type AgentSection } from "../features/agent-studio/AgentNavRail";
import DocumentStudio from "../features/agent-studio/DocumentStudio";
import ImageLab from "../features/agent-studio/ImageLab";
import MemoryManager from "../features/agent-studio/MemoryManager";
import { ADMIN_EMAILS } from "../lib/adminStore";
import { createAgentId, hydrateAgentStudio, loadAgentStudio, saveAgentStudio, type AgentDocument, type AgentDocumentType, type AgentStudioData } from "../lib/agentStudioStore";
import "./AgentStandalone.css";

const DOC_TYPES: Array<{ type: AgentDocumentType; label: string; desc: string }> = [
  { type: "REPORT", label: "기술자료", desc: "법규·계산식·기준표 템플릿" },
  { type: "PROPOSAL", label: "제안서", desc: "범위·비용 차트 템플릿" },
  { type: "BLOG_POST", label: "블로그", desc: "초안·체크리스트·CTA" },
  { type: "SNS_CAPTION", label: "SNS 캡션", desc: "짧은 글 + 이미지" },
  { type: "KNOWLEDGE_NOTE", label: "지식 노트", desc: "Q&A·출처 정리" },
];
const TYPE_LABEL: Record<AgentDocumentType, string> = { REPORT: "기술자료", PROPOSAL: "제안서", BLOG_POST: "블로그", SNS_CAPTION: "SNS", KNOWLEDGE_NOTE: "노트" };
const STATUS_LABEL: Record<AgentDocument["status"], string> = { DRAFT: "작성 중", NEEDS_REVIEW: "검토 필요", APPROVED: "승인됨", ARCHIVED: "보관됨" };

function ago(iso: string) { const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000); if (minutes < 1) return "방금 전"; if (minutes < 60) return `${minutes}분 전`; if (minutes < 1440) return `${Math.floor(minutes / 60)}시간 전`; return `${Math.floor(minutes / 1440)}일 전`; }

export default function AgentStandalone() {
  const { user, loading, configured, logout } = useAuth();
  const userId = user?.uid ?? "local-admin";
  const [data, setData] = useState<AgentStudioData>(() => loadAgentStudio(userId));
  const [section, setSection] = useState<AgentSection>("home");
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [newProject, setNewProject] = useState("");
  const hydrated = useRef<string | null>(null);

  useEffect(() => { if (hydrated.current === userId) return; hydrated.current = userId; void hydrateAgentStudio(userId).then(setData); }, [userId]);
  useEffect(() => { const timer = window.setTimeout(() => void saveAgentStudio(userId, data), 450); return () => clearTimeout(timer); }, [data, userId]);

  const allowed = !configured || Boolean(user && ADMIN_EMAILS.includes(user.email ?? ""));
  const activeDocument = data.documents.find((document) => document.id === activeDocumentId) ?? null;
  const documents = useMemo(() => { const q = search.trim().toLowerCase(); return q ? data.documents.filter((document) => document.title.toLowerCase().includes(q) || data.projects.find((project) => project.id === document.projectId)?.name.toLowerCase().includes(q)) : data.documents; }, [data.documents, data.projects, search]);
  const updateData = (updater: (current: AgentStudioData) => AgentStudioData) => setData(updater);
  const updateDocument = (patch: Partial<AgentDocument>) => activeDocumentId && updateData((current) => ({ ...current, documents: current.documents.map((document) => document.id === activeDocumentId ? { ...document, ...patch, updatedAt: new Date().toISOString() } : document) }));

  function createDocument(type: AgentDocumentType) {
    const projectId = data.projects[0]?.id ?? createAgentId();
    const now = new Date().toISOString();
    const document: AgentDocument = { id: createAgentId(), projectId, title: `제목 없는 ${DOC_TYPES.find((item) => item.type === type)?.label}`, type, status: "DRAFT", updatedAt: now, blocks: [] };
    updateData((current) => ({ ...current, projects: current.projects.length ? current.projects : [{ id: projectId, name: "내 작업", clientName: "", location: "", createdAt: now }], documents: [document, ...current.documents] }));
    setActiveDocumentId(document.id);
  }

  function addProject(event: FormEvent) { event.preventDefault(); const name = newProject.trim(); if (!name) return; updateData((current) => ({ ...current, projects: [...current.projects, { id: createAgentId(), name, clientName: "", location: "", createdAt: new Date().toISOString() }] })); setNewProject(""); }

  if (loading) return <div className="archi-loading">대시보드를 불러오는 중...</div>;
  if (!allowed) return <div className="archi-loading"><div><strong>관리자 권한이 필요합니다.</strong><a href="/mypage">로그인으로 이동</a></div></div>;

  if (activeDocument) return <div className="archi-shell"><AgentNavRail section="documents" onSelect={(next) => { setActiveDocumentId(null); setSection(next); }} /><div className="archi-shell__document"><DocumentStudio userId={userId} document={activeDocument} data={data} onBack={() => setActiveDocumentId(null)} onUpdateDocument={updateDocument} onUpdateData={updateData} /></div></div>;

  const displayName = user?.displayName || user?.email?.split("@")[0] || "관리자";
  const counts = { projects: data.projects.length, documents: data.documents.length, openTasks: data.tasks.filter((task) => task.status !== "DONE").length, ontology: data.ontologyNodes.filter((node) => node.status === "APPROVED").length, candidates: data.ontologyNodes.filter((node) => node.status === "CANDIDATE").length };

  return <div className="archi-shell"><AgentNavRail section={section} onSelect={setSection} /><main className="archi-main">
    <header className="archi-header"><label><FiSearch /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="문서·프로젝트 검색" /></label><div><span><strong>{displayName}</strong><small>INDEX · 관리자</small></span><i>{displayName.slice(0, 1).toUpperCase()}</i><button type="button" onClick={() => void logout()} title="로그아웃"><FiLogOut /></button></div></header>
    <div className="archi-scroll"><div className="archi-content">
      {section === "home" && <>
        <div className="archi-welcome"><h1>{displayName}님, 무엇을 만들까요?</h1><p>유형을 고르면 블록 템플릿이 자동 구성되고, AI 에이전트가 초안을 도와줍니다.</p></div>
        <div className="archi-create">{DOC_TYPES.map((item) => <button key={item.type} type="button" onClick={() => createDocument(item.type)}><span><FiPlus /></span><strong>{item.label}</strong><small>{item.desc}</small></button>)}</div>
        <section className="archi-templates"><h2>전문 템플릿</h2><p>컨테이너·법규·계산식·견적표까지 구조가 잡힌 문서로 바로 시작하세요.</p><div>{["인테리어 공사 제안서", "현장 시공 품질 보고서", "공간 콘텐츠 패키지"].map((label) => <button key={label} type="button" onClick={() => createDocument("REPORT")}><strong>{label}</strong><small>전문 블록 구조로 시작</small></button>)}</div></section>
        <div className="archi-stats">{[{ icon: FiFolder, value: counts.projects, label: "프로젝트" }, { icon: FiFileText, value: counts.documents, label: "문서" }, { icon: FiCheckSquare, value: counts.openTasks, label: "진행 중 업무" }, { icon: FiShare2, value: counts.ontology, label: `지식 노드 · 검수 대기 ${counts.candidates}` }].map(({ icon: Icon, value, label }) => <button key={label} type="button"><span><Icon /></span><i><strong>{value}</strong><small>{label}</small></i></button>)}</div>
        <div className="archi-dashboard"><section><header><h2>최근 문서</h2><small>최근 수정 순</small></header><div className="archi-doc-grid">{documents.slice(0, 6).map((document) => <button key={document.id} type="button" onClick={() => setActiveDocumentId(document.id)}><div><b>{TYPE_LABEL[document.type]}</b><span>{TYPE_LABEL[document.type]}</span><small>블록 {document.blocks.length}</small></div><section><strong>{document.title}</strong><p><span>{data.projects.find((project) => project.id === document.projectId)?.name}</span><span>{ago(document.updatedAt)}</span></p><em>{STATUS_LABEL[document.status]}</em></section></button>)}</div></section><aside><section><header><h2>진행 중 업무</h2><button type="button" onClick={() => setSection("tasks")}>전체 보기 <FiArrowRight /></button></header>{data.tasks.slice(0, 5).map((task) => <article key={task.id}><strong>{task.title}</strong><small>{task.agent} · {task.status}</small></article>)}</section><section><header><h2>프로젝트</h2><small>{data.projects.length}개</small></header>{data.projects.slice(0, 5).map((project) => <article key={project.id}><strong>{project.name}</strong><small>문서 {data.documents.filter((document) => document.projectId === project.id).length}</small></article>)}<form onSubmit={addProject}><input value={newProject} onChange={(event) => setNewProject(event.target.value)} placeholder="새 프로젝트" /><button><FiPlus /></button></form></section><section className="archi-graph-card"><h2>지식 그래프</h2><p>노드 {counts.ontology}개 · 승인된 지식소스 {data.knowledge.filter((item) => item.status === "APPROVED").length}개</p><button type="button" onClick={() => setSection("ontology")}>그래프 탐험하기 →</button></section></aside></div>
      </>}
      {(section === "projects" || section === "documents") && <StudioDocuments data={data} documents={documents} onOpen={setActiveDocumentId} onCreate={() => createDocument("REPORT")} />}
      {section === "agents" && <StudioSimple title="AI 에이전트" description="콘텐츠·법규·시공·이미지·지식 전문 에이전트 팀"><div className="archi-agent-grid">{["콘텐츠팀", "법규팀", "시공팀", "이미지팀", "지식팀", "PM"].map((team) => <article key={team}><span>A</span><strong>{team}</strong><small>준비됨</small><button type="button" onClick={() => createDocument("REPORT")}>작업 시작</button></article>)}</div></StudioSimple>}
      {section === "knowledge" && <StudioSimple title="지식베이스" description="검수된 내부 자료를 AI 컨텍스트로 사용합니다."><div className="archi-list">{data.knowledge.map((item) => <article key={item.id}><FiFileText /><div><strong>{item.title}</strong><small>{item.sourceType}</small></div><em>{item.status}</em></article>)}</div></StudioSimple>}
      {section === "ontology" && <StudioSimple title="온톨로지" description="승인된 지식 노드와 검수 대기 후보"><div className="archi-list">{data.ontologyNodes.map((node) => <article key={node.id}><FiShare2 /><div><strong>{node.label}</strong><small>{node.type}</small></div><em>{node.status}</em></article>)}</div></StudioSimple>}
      {(section === "messenger" || section === "tasks") && <StudioSimple title={section === "messenger" ? "에이전트 메신저" : "작업센터"} description="에이전트 업무 요청과 진행 상태"><div className="archi-list">{data.tasks.map((task) => <article key={task.id}><FiCheckSquare /><div><strong>{task.title}</strong><small>{task.agent}</small></div><em>{task.status}</em></article>)}</div></StudioSimple>}
      {section === "settings" && <StudioSimple title="설정" description="AI, Firebase, Mem0 연결 관리"><MemoryManager userId={userId} /><div className="archi-image-section"><ImageLab userId={userId} data={data} onUpdateData={updateData} /></div></StudioSimple>}
    </div></div>
  </main></div>;
}

function StudioSimple({ title, description, children }: { title: string; description: string; children: ReactNode }) { return <section className="archi-page"><header><h1>{title}</h1><p>{description}</p></header>{children}</section>; }
function StudioDocuments({ data, documents, onOpen, onCreate }: { data: AgentStudioData; documents: AgentDocument[]; onOpen: (id: string) => void; onCreate: () => void }) { return <StudioSimple title="프로젝트·문서" description="프로젝트별 산출물과 최근 문서"><button className="archi-primary" type="button" onClick={onCreate}><FiPlus /> 새 문서</button><div className="archi-doc-grid is-library">{documents.map((document) => <button key={document.id} type="button" onClick={() => onOpen(document.id)}><div><b>{TYPE_LABEL[document.type]}</b><span>{TYPE_LABEL[document.type]}</span><small>블록 {document.blocks.length}</small></div><section><strong>{document.title}</strong><p><span>{data.projects.find((project) => project.id === document.projectId)?.name}</span><span>{ago(document.updatedAt)}</span></p><em>{STATUS_LABEL[document.status]}</em></section></button>)}</div></StudioSimple>; }
