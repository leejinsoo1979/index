import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import {
  Bot,
  BookOpen,
  Check,
  CheckSquare,
  FileText,
  Folder,
  Home,
  Image as ImageIcon,
  MessageSquare,
  Network,
  Plus,
  Search,
  Send,
  Settings,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import DocumentStudio from "../../features/agent-studio/DocumentStudio";
import ImageLab from "../../features/agent-studio/ImageLab";
import MemoryManager from "../../features/agent-studio/MemoryManager";
import {
  createAgentId,
  createBlock,
  hydrateAgentStudio,
  loadAgentStudio,
  saveAgentStudio,
  type AgentDocument,
  type AgentDocumentType,
  type AgentKnowledgeSource,
  type AgentStudioData,
} from "../../lib/agentStudioStore";
import "./AdminAgent.css";

type Section = "home" | "projects" | "agents" | "images" | "knowledge" | "ontology" | "messenger" | "tasks" | "settings";

const SECTIONS: Array<{ id: Section; label: string; icon: typeof Home }> = [
  { id: "home", label: "홈", icon: Home },
  { id: "projects", label: "프로젝트·문서", icon: Folder },
  { id: "agents", label: "에이전트", icon: Bot },
  { id: "images", label: "이미지 스튜디오", icon: ImageIcon },
  { id: "knowledge", label: "지식베이스", icon: BookOpen },
  { id: "ontology", label: "온톨로지", icon: Network },
  { id: "messenger", label: "메신저", icon: MessageSquare },
  { id: "tasks", label: "작업센터", icon: CheckSquare },
  { id: "settings", label: "설정", icon: Settings },
];

const DOC_TYPES: Array<{ type: AgentDocumentType; label: string; description: string }> = [
  { type: "REPORT", label: "기술자료", description: "법규·공법·기준표" },
  { type: "PROPOSAL", label: "제안서", description: "범위·비용·일정" },
  { type: "BLOG_POST", label: "블로그", description: "시공사례·SEO 콘텐츠" },
  { type: "SNS_CAPTION", label: "SNS 캡션", description: "짧은 글·해시태그" },
  { type: "KNOWLEDGE_NOTE", label: "지식 노트", description: "출처와 실무 Q&A" },
];

const TYPE_LABEL: Record<AgentDocumentType, string> = Object.fromEntries(
  DOC_TYPES.map((item) => [item.type, item.label]),
) as Record<AgentDocumentType, string>;

const STATUS_LABEL = {
  DRAFT: "작성 중",
  NEEDS_REVIEW: "검토 필요",
  APPROVED: "승인됨",
  ARCHIVED: "보관됨",
} as const;

const TEAMS = [
  { name: "콘텐츠팀", key: "content_agent", description: "블로그, SNS, 제안서 콘텐츠 작성" },
  { name: "법규팀", key: "legal_agent", description: "법령·기준 검색과 출처 검토" },
  { name: "시공팀", key: "construction_agent", description: "공법, 자재, 하자 및 체크리스트" },
  { name: "이미지팀", key: "image_agent", description: "컨셉 이미지와 시각 자료 기획" },
  { name: "지식팀", key: "knowledge_agent", description: "내부 문서 정리와 지식 구조화" },
  { name: "PM", key: "pm_agent", description: "업무 분배, 검토, 산출물 관리" },
];

function formatTime(iso: string) {
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export default function AdminAgent() {
  const { user } = useAuth();
  const userId = user?.uid ?? "local-admin";
  const [data, setData] = useState<AgentStudioData>(() => loadAgentStudio(userId));
  const [section, setSection] = useState<Section>("home");
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [messengerInput, setMessengerInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hydratedUserRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (hydratedUserRef.current === userId) return;
    hydratedUserRef.current = userId;
    void hydrateAgentStudio(userId).then((remote) => {
      if (!cancelled) setData(remote);
    });
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void saveAgentStudio(userId, data), 450);
    return () => window.clearTimeout(timer);
  }, [data, userId]);

  const activeDocument = data.documents.find((document) => document.id === activeDocumentId) ?? null;
  const filteredDocuments = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return data.documents;
    return data.documents.filter((document) => document.title.toLowerCase().includes(normalized));
  }, [data.documents, query]);

  function updateData(updater: (current: AgentStudioData) => AgentStudioData) {
    setData((current) => updater(current));
  }

  function createDocument(type: AgentDocumentType, targetProjectId?: string) {
    let projectId = targetProjectId ?? data.projects[0]?.id;
    if (!projectId) {
      projectId = createAgentId();
      const now = new Date().toISOString();
      updateData((current) => ({
        ...current,
        projects: [{ id: projectId!, name: "내 작업", clientName: "", location: "", createdAt: now }],
      }));
    }
    const document: AgentDocument = {
      id: createAgentId(),
      projectId,
      title: `제목 없는 ${TYPE_LABEL[type]}`,
      type,
      status: "DRAFT",
      updatedAt: new Date().toISOString(),
      blocks: [createBlock("heading", `제목 없는 ${TYPE_LABEL[type]}`, 0)],
    };
    updateData((current) => ({ ...current, documents: [document, ...current.documents] }));
    setActiveDocumentId(document.id);
  }

  function createProject() {
    const name = window.prompt("새 프로젝트 이름을 입력하세요.")?.trim();
    if (!name) return;
    const clientName = window.prompt("클라이언트명(선택)")?.trim() ?? "";
    const location = window.prompt("현장 위치(선택)")?.trim() ?? "";
    updateData((current) => ({ ...current, projects: [{ id: createAgentId(), name, clientName, location, createdAt: new Date().toISOString() }, ...current.projects] }));
  }

  function deleteDocument(documentId: string) {
    const target = data.documents.find((document) => document.id === documentId);
    if (!target || !window.confirm(`“${target.title}” 문서를 삭제할까요? 연결된 대화와 액션도 함께 삭제됩니다.`)) return;
    updateData((current) => ({
      ...current,
      documents: current.documents.filter((document) => document.id !== documentId),
      conversations: current.conversations.filter((conversation) => conversation.documentId !== documentId),
      actions: current.actions.filter((action) => action.documentId !== documentId),
      tasks: current.tasks.filter((task) => task.documentId !== documentId),
    }));
  }

  function updateDocument(patch: Partial<AgentDocument>) {
    if (!activeDocumentId) return;
    updateData((current) => ({
      ...current,
      documents: current.documents.map((document) =>
        document.id === activeDocumentId ? { ...document, ...patch, updatedAt: new Date().toISOString() } : document,
      ),
    }));
  }

  async function addKnowledgeFiles(files: FileList | null) {
    if (!files?.length) return;
    const sources: AgentKnowledgeSource[] = [];
    for (const file of Array.from(files)) {
      let excerpt = "";
      if (file.type.startsWith("text/") || /\.(md|txt|csv)$/i.test(file.name)) {
        excerpt = (await file.text()).slice(0, 5000);
      }
      sources.push({
        id: createAgentId(),
        title: file.name,
        sourceType: "FILE",
        status: "PENDING_REVIEW",
        trustLevel: "INTERNAL_UNVERIFIED",
        createdAt: new Date().toISOString(),
        excerpt,
      });
    }
    updateData((current) => ({ ...current, knowledge: [...sources, ...current.knowledge] }));
  }

  function extractOntologyCandidates() {
    const approved = data.knowledge.filter((source) => source.status === "APPROVED");
    const seeds = approved.flatMap((source) => `${source.title} ${source.excerpt ?? ""}`.match(/[가-힣A-Za-z0-9]{2,12}/g) ?? [])
      .filter((word) => !["그리고", "대한", "관련", "위한", "합니다", "있는", "자료", "문서"].includes(word));
    const counts = new Map<string, number>();
    seeds.forEach((word) => counts.set(word, (counts.get(word) ?? 0) + 1));
    const existing = new Set(data.ontologyNodes.map((node) => node.label));
    const labels = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([label]) => label).filter((label) => !existing.has(label)).slice(0, 12);
    const nodes = labels.map((label) => ({
      id: createAgentId(),
      label,
      type: (/법|규정|기준|조례/.test(label) ? "regulation" : /자재|타일|목재|도장|석재/.test(label) ? "material" : /하자|균열|누수|결로/.test(label) ? "defect" : /공법|시공|방수|단열/.test(label) ? "method" : "space") as "space" | "method" | "material" | "defect" | "regulation",
      description: "승인된 내부 지식에서 추출된 후보",
      status: "CANDIDATE" as const,
      confidence: Math.min(.98, .55 + (counts.get(label) ?? 1) * .08),
    }));
    const edges = nodes.slice(1).map((node, index) => ({ id: createAgentId(), sourceNodeId: nodes[index].id, targetNodeId: node.id, relationType: "관련", status: "CANDIDATE" as const }));
    updateData((current) => ({ ...current, ontologyNodes: [...current.ontologyNodes, ...nodes], ontologyEdges: [...current.ontologyEdges, ...edges] }));
  }

  function sendMessenger(event: FormEvent) {
    event.preventDefault();
    const title = messengerInput.trim();
    if (!title) return;
    const agent = TEAMS.find((team) => title.includes(`@${team.name.replace("팀", "")}`))?.name ?? "PM";
    updateData((current) => ({
      ...current,
      tasks: [{ id: createAgentId(), title, status: "QUEUED", agent, createdAt: new Date().toISOString() }, ...current.tasks],
    }));
    setMessengerInput("");
    setSection("tasks");
  }

  if (activeDocument) {
    return <DocumentStudio userId={userId} document={activeDocument} data={data} onBack={() => setActiveDocumentId(null)} onUpdateDocument={updateDocument} onUpdateData={updateData} />;
  }

  return (
    <div className="agent-studio">
      <header className="agent-studio__topbar">
        <div><span><Sparkles /></span><div><strong>ARCHI Agent Studio</strong><small>INDEX 관리자 워크스페이스</small></div></div>
        <label><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="문서 검색" /></label>
        <div className="agent-studio__user"><span>{(user?.displayName || user?.email || "A").slice(0, 1).toUpperCase()}</span><div><strong>{user?.displayName || "관리자"}</strong><small>{user?.email || "로컬 관리자"}</small></div></div>
      </header>

      <nav className="agent-studio__nav" aria-label="Agent Studio 메뉴">
        {SECTIONS.map((item) => {
          const Icon = item.icon;
          return <button key={item.id} type="button" className={section === item.id ? "is-active" : ""} onClick={() => setSection(item.id)}><Icon />{item.label}</button>;
        })}
      </nav>

      <main className="agent-studio__content">
        {section === "home" && (
          <>
            <div className="agent-studio__welcome"><h1>무엇을 만들까요?</h1><p>유형을 선택하면 문서를 만들고 AI 에이전트와 바로 작업할 수 있습니다.</p></div>
            <div className="agent-create-grid">{DOC_TYPES.map((item) => <button key={item.type} type="button" onClick={() => createDocument(item.type)}><span><Plus /></span><strong>{item.label}</strong><small>{item.description}</small></button>)}</div>
            <div className="agent-dashboard-grid">
              <section className="agent-panel"><header><h2>최근 문서</h2><button type="button" onClick={() => setSection("projects")}>전체 보기</button></header>{data.documents.slice(0, 5).map((document) => <button className="agent-document-row" key={document.id} type="button" onClick={() => setActiveDocumentId(document.id)}><FileText /><span><strong>{document.title}</strong><small>{TYPE_LABEL[document.type]} · {formatTime(document.updatedAt)}</small></span><em>{STATUS_LABEL[document.status]}</em></button>)}</section>
              <section className="agent-panel"><header><h2>진행 작업</h2><button type="button" onClick={() => setSection("tasks")}>작업센터</button></header>{data.tasks.slice(0, 5).map((task) => <div className="agent-task-row" key={task.id}><span className={`is-${task.status.toLowerCase()}`} /><div><strong>{task.title}</strong><small>{task.agent} · {formatTime(task.createdAt)}</small></div></div>)}</section>
            </div>
          </>
        )}

        {section === "projects" && <section className="agent-section"><header><div><h1>프로젝트·문서</h1><p>에이전트가 생성한 산출물과 직접 작성한 문서를 관리합니다.</p></div><div className="agent-section__actions"><button type="button" onClick={createProject}><Folder /> 새 프로젝트</button><button type="button" onClick={() => createDocument("REPORT")}><Plus /> 새 문서</button></div></header><div className="agent-projects">{data.projects.map((project) => <article key={project.id}><span><Folder /></span><div><strong>{project.name}</strong><small>{project.clientName} · {project.location}</small></div><em>{data.documents.filter((document) => document.projectId === project.id).length}개 문서</em><button type="button" onClick={() => createDocument("REPORT", project.id)}><Plus /> 문서</button></article>)}</div><div className="agent-documents-grid">{filteredDocuments.map((document) => <article key={document.id}><button type="button" onClick={() => setActiveDocumentId(document.id)}><span><FileText /></span><strong>{document.title}</strong><small>{TYPE_LABEL[document.type]} · {formatTime(document.updatedAt)}</small><em>{STATUS_LABEL[document.status]}</em></button><button type="button" className="agent-document-delete" onClick={() => deleteDocument(document.id)}><Trash2 /> 삭제</button></article>)}</div></section>}

        {section === "agents" && <section className="agent-section"><header><div><h1>AI 에이전트</h1><p>업무 성격에 맞는 전문 팀을 선택해 문서 작업을 시작합니다.</p></div></header><div className="agent-team-grid">{TEAMS.map((team) => <article key={team.key}><span><Bot /></span><div><strong>{team.name}</strong><small>{team.description}</small></div><em><i /> 준비됨</em><button type="button" onClick={() => createDocument("REPORT")}>작업 시작</button></article>)}</div></section>}

        {section === "images" && <section className="agent-section"><header><div><h1>이미지 스튜디오</h1><p>이미지를 생성하고 마스크 인페인트로 수정 버전을 관리합니다.</p></div></header><ImageLab userId={userId} data={data} onUpdateData={updateData} /></section>}

        {section === "knowledge" && <section className="agent-section"><header><div><h1>지식베이스</h1><p>내부 매뉴얼과 현장 자료를 검토한 뒤 에이전트 지식으로 승인합니다.</p></div><button type="button" onClick={() => fileInputRef.current?.click()}><Plus /> 자료 업로드</button><input ref={fileInputRef} type="file" multiple hidden onChange={(event) => void addKnowledgeFiles(event.target.files)} /></header><div className="agent-knowledge-list">{data.knowledge.length === 0 ? <div className="agent-empty"><BookOpen /><strong>등록된 자료가 없습니다.</strong><p>TXT, Markdown, CSV와 내부 문서를 업로드하세요.</p></div> : data.knowledge.map((source) => <article key={source.id}><span><FileText /></span><div><strong>{source.title}</strong><small>{source.sourceType} · {formatTime(source.createdAt)}</small><p>{source.excerpt?.slice(0, 120)}</p></div><em className={`is-${source.status.toLowerCase()}`}>{source.status === "APPROVED" ? "승인됨" : "검토 대기"}</em>{source.status !== "APPROVED" && <button type="button" onClick={() => updateData((current) => ({ ...current, knowledge: current.knowledge.map((item) => item.id === source.id ? { ...item, status: "APPROVED", trustLevel: "INTERNAL_APPROVED" } : item) }))}><Check /> 승인</button>}</article>)}</div></section>}

        {section === "ontology" && <section className="agent-section"><header><div><h1>온톨로지 뇌지도</h1><p>승인된 지식에서 관계 후보를 추출한 뒤 사람이 승인해야 그래프에 반영됩니다.</p></div><button type="button" onClick={extractOntologyCandidates} disabled={!data.knowledge.some((source) => source.status === "APPROVED")}><Sparkles /> 지식 후보 추출</button></header><div className="agent-ontology-layout"><div className="agent-ontology"><span className="is-center">INDEX 지식</span>{data.ontologyNodes.filter((node) => node.status === "APPROVED").slice(0, 12).map((node, index) => <span key={node.id} style={{ "--node-index": index } as CSSProperties}>{node.label}</span>)}</div><aside className="agent-ontology-review"><header><strong>검토 대기 후보</strong><small>{data.ontologyNodes.filter((node) => node.status === "CANDIDATE").length}개</small></header>{data.ontologyNodes.filter((node) => node.status === "CANDIDATE").length ? data.ontologyNodes.filter((node) => node.status === "CANDIDATE").map((node) => <article key={node.id}><div><strong>{node.label}</strong><small>{node.type} · 신뢰도 {Math.round((node.confidence ?? 0) * 100)}%</small></div><button type="button" onClick={() => updateData((current) => ({ ...current, ontologyNodes: current.ontologyNodes.map((item) => item.id === node.id ? { ...item, status: "REJECTED" } : item) }))}>거절</button><button type="button" onClick={() => updateData((current) => ({ ...current, ontologyNodes: current.ontologyNodes.map((item) => item.id === node.id ? { ...item, status: "APPROVED" } : item), ontologyEdges: current.ontologyEdges.map((edge) => edge.sourceNodeId === node.id || edge.targetNodeId === node.id ? { ...edge, status: "APPROVED" } : edge) }))}>승인</button></article>) : <div className="agent-empty"><Network /><strong>검토할 후보가 없습니다.</strong><p>지식베이스 자료를 승인한 뒤 후보를 추출하세요.</p></div>}</aside></div></section>}

        {section === "messenger" && <section className="agent-section"><header><div><h1>에이전트 메신저</h1><p>@콘텐츠, @법규, @시공처럼 팀을 지정하면 작업센터에 업무가 생성됩니다.</p></div></header><div className="agent-messenger"><div className="agent-messenger__intro"><MessageSquare /><h2>새 업무를 지시하세요</h2><p>예: @시공 욕실 방수 체크리스트를 기술자료로 만들어줘</p></div><form onSubmit={sendMessenger}><textarea value={messengerInput} onChange={(event) => setMessengerInput(event.target.value)} rows={4} placeholder="@에이전트에게 업무 지시" /><button type="submit" disabled={!messengerInput.trim()}><Send /> 작업 생성</button></form></div></section>}

        {section === "tasks" && <section className="agent-section"><header><div><h1>작업센터</h1><p>에이전트 업무의 진행 상태와 검토 대상을 확인합니다.</p></div></header><div className="agent-task-list">{data.tasks.map((task) => <article key={task.id}><span className={`is-${task.status.toLowerCase()}`} /><div><strong>{task.title}</strong><small>{task.agent} · {formatTime(task.createdAt)}</small></div><select value={task.status} onChange={(event) => updateData((current) => ({ ...current, tasks: current.tasks.map((item) => item.id === task.id ? { ...item, status: event.target.value as typeof task.status } : item) }))}><option value="QUEUED">대기</option><option value="RUNNING">진행 중</option><option value="NEEDS_REVIEW">검토 필요</option><option value="DONE">완료</option></select></article>)}</div></section>}

        {section === "settings" && <section className="agent-section"><header><div><h1>Agent Studio 설정</h1><p>현재 INDEX 관리자 인증과 AI 연결 상태입니다.</p></div></header><div className="agent-settings"><article><span><Check /></span><div><strong>Firebase 관리자 인증</strong><small>{user?.email || "로컬 관리자"}의 ID 토큰을 Agent 전용 API에서 검증</small></div></article><article><span><Sparkles /></span><div><strong>INDEX AI</strong><small>관리자 전용 /api/agent-chat 스트리밍 엔드포인트와 연결됨</small></div></article><article><span><BookOpen /></span><div><strong>Firebase 데이터·파일</strong><small>Firestore UID 워크스페이스와 Storage 이미지 버전 사용</small></div></article></div><MemoryManager userId={userId} /></section>}
      </main>
    </div>
  );
}
