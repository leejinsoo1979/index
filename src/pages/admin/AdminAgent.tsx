import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import {
  ArrowLeft,
  Bot,
  BookOpen,
  Check,
  CheckSquare,
  Download,
  FileText,
  Folder,
  Home,
  LoaderCircle,
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
import {
  createAgentId,
  hydrateAgentStudio,
  loadAgentStudio,
  saveAgentStudio,
  type AgentBlockType,
  type AgentDocument,
  type AgentDocumentType,
  type AgentKnowledgeSource,
  type AgentStudioData,
} from "../../lib/agentStudioStore";
import "./AdminAgent.css";

type Section = "home" | "projects" | "agents" | "knowledge" | "ontology" | "messenger" | "tasks" | "settings";
type ChatMessage = { id: string; role: "user" | "assistant"; content: string };

const SECTIONS: Array<{ id: Section; label: string; icon: typeof Home }> = [
  { id: "home", label: "홈", icon: Home },
  { id: "projects", label: "프로젝트·문서", icon: Folder },
  { id: "agents", label: "에이전트", icon: Bot },
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

function exportMarkdown(document: AgentDocument) {
  const markdown = document.blocks.map((block) => {
    if (block.type === "heading") return `# ${block.content}`;
    if (block.type === "quote") return `> ${block.content}`;
    if (block.type === "checklist") return block.content.split("\n").map((line) => `- [ ] ${line}`).join("\n");
    return block.content;
  }).join("\n\n");
  const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = `${document.title || "document"}.md`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function AdminAgent() {
  const { user } = useAuth();
  const userId = user?.uid ?? "local-admin";
  const [data, setData] = useState<AgentStudioData>(() => loadAgentStudio(userId));
  const [section, setSection] = useState<Section>("home");
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [activeTeam, setActiveTeam] = useState("PM");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { id: createAgentId(), role: "assistant", content: "안녕하세요. INDEX Agent Studio입니다. 문서 초안, 공법 검토, 블록 수정을 요청하세요." },
  ]);
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

  function createDocument(type: AgentDocumentType) {
    let projectId = data.projects[0]?.id;
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
      blocks: [{ id: createAgentId(), type: "heading", content: `제목 없는 ${TYPE_LABEL[type]}` }],
    };
    updateData((current) => ({ ...current, documents: [document, ...current.documents] }));
    setActiveDocumentId(document.id);
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

  function addBlock(type: AgentBlockType, content = "") {
    if (!activeDocument) return;
    updateDocument({ blocks: [...activeDocument.blocks, { id: createAgentId(), type, content }] });
  }

  function updateBlock(id: string, content: string) {
    if (!activeDocument) return;
    updateDocument({ blocks: activeDocument.blocks.map((block) => block.id === id ? { ...block, content } : block) });
  }

  function deleteBlock(id: string) {
    if (!activeDocument || !window.confirm("이 블록을 삭제할까요?")) return;
    updateDocument({ blocks: activeDocument.blocks.filter((block) => block.id !== id) });
  }

  async function sendAgentMessage(event: FormEvent) {
    event.preventDefault();
    const content = chatInput.trim();
    if (!content || chatBusy) return;
    const userMessage: ChatMessage = { id: createAgentId(), role: "user", content };
    const nextMessages = [...chatMessages, userMessage];
    setChatMessages(nextMessages);
    setChatInput("");
    setChatBusy(true);
    const replyId = createAgentId();
    let reply = "";
    try {
      const context = activeDocument
        ? `\n\n현재 문서 제목: ${activeDocument.title}\n현재 문서 내용:\n${activeDocument.blocks.map((block) => block.content).join("\n")}`
        : "";
      const knowledgeContext = data.knowledge
        .filter((source) => source.status === "APPROVED" && source.excerpt)
        .slice(0, 5)
        .map((source) => `[${source.title}] ${source.excerpt}`)
        .join("\n");
      const roleInstruction = `당신은 ARCHI Agent Studio의 ${activeTeam}입니다. 제안한 문서 변경은 사용자가 검토 후 적용할 수 있도록 답변으로 제시하세요.${activeTeam === "법규팀" ? " 법규·기준 답변에는 확인 가능한 출처를 포함하고 불확실하면 확인 불가라고 명시하세요." : ""}`;
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          messages: nextMessages.map((message, index) => ({
            role: message.role,
            content: index === nextMessages.length - 1
              ? `${roleInstruction}\n\n${message.content}${context}${knowledgeContext ? `\n\n승인된 내부 지식:\n${knowledgeContext}` : ""}`
              : message.content,
          })),
        }),
      });
      if (!response.ok || !response.body) throw new Error("AI 응답을 불러오지 못했습니다.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      setChatMessages((current) => [...current, { id: replyId, role: "assistant", content: "" }]);
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        reply += decoder.decode(value, { stream: true });
        setChatMessages((current) => current.map((message) => message.id === replyId ? { ...message, content: reply } : message));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI 요청 중 오류가 발생했습니다.";
      setChatMessages((current) => [...current.filter((item) => item.id !== replyId), { id: replyId, role: "assistant", content: message }]);
    } finally {
      setChatBusy(false);
    }
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
    return (
      <div className="agent-editor">
        <header className="agent-editor__topbar">
          <button type="button" onClick={() => setActiveDocumentId(null)}><ArrowLeft /> 문서 목록</button>
          <input value={activeDocument.title} onChange={(event) => updateDocument({ title: event.target.value })} aria-label="문서 제목" />
          <select value={activeDocument.status} onChange={(event) => updateDocument({ status: event.target.value as AgentDocument["status"] })}>
            {Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <button type="button" onClick={() => exportMarkdown(activeDocument)}><Download /> Markdown</button>
        </header>
        <div className="agent-editor__workspace">
          <aside className="agent-chat">
            <header><span><Bot /></span><div><strong>AI 에이전트</strong><small>현재 문서 전체 모드</small></div></header>
            <div className="agent-chat__teams">{TEAMS.map((team) => <button key={team.key} type="button" className={activeTeam === team.name ? "is-active" : ""} onClick={() => setActiveTeam(team.name)}>{team.name}</button>)}</div>
            <div className="agent-chat__messages">
              {chatMessages.map((message) => (
                <div key={message.id} className={`agent-chat__message is-${message.role}`}>
                  <p>{message.content || "작성 중..."}</p>
                  {message.role === "assistant" && message.content && activeDocument && (
                    <button type="button" onClick={() => addBlock("paragraph", message.content)}><Plus /> 문서에 추가</button>
                  )}
                </div>
              ))}
              {chatBusy && <span className="agent-chat__busy"><LoaderCircle /> 에이전트 작업 중</span>}
            </div>
            <form className="agent-chat__composer" onSubmit={sendAgentMessage}>
              <textarea value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder="에이전트에게 작업을 지시하세요" rows={3} />
              <button type="submit" disabled={!chatInput.trim() || chatBusy}><Send /></button>
            </form>
          </aside>
          <main className="agent-canvas">
            <div className="agent-canvas__paper">
              <div className="agent-canvas__meta"><span>{TYPE_LABEL[activeDocument.type]}</span><span>자동 저장됨</span></div>
              {activeDocument.blocks.map((block) => (
                <article key={block.id} className={`agent-block agent-block--${block.type}`}>
                  <span className="agent-block__type">{block.type}</span>
                  <textarea value={block.content} onChange={(event) => updateBlock(block.id, event.target.value)} rows={block.type === "heading" ? 2 : 5} aria-label={`${block.type} 블록`} />
                  <button type="button" onClick={() => deleteBlock(block.id)} aria-label="블록 삭제"><Trash2 /></button>
                </article>
              ))}
              <div className="agent-canvas__add">
                {(["heading", "paragraph", "checklist", "quote"] as AgentBlockType[]).map((type) => (
                  <button key={type} type="button" onClick={() => addBlock(type)}><Plus /> {type}</button>
                ))}
              </div>
            </div>
          </main>
        </div>
      </div>
    );
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

        {section === "projects" && <section className="agent-section"><header><div><h1>프로젝트·문서</h1><p>에이전트가 생성한 산출물과 직접 작성한 문서를 관리합니다.</p></div><button type="button" onClick={() => createDocument("REPORT")}><Plus /> 새 문서</button></header><div className="agent-projects">{data.projects.map((project) => <article key={project.id}><span><Folder /></span><div><strong>{project.name}</strong><small>{project.clientName} · {project.location}</small></div><em>{data.documents.filter((document) => document.projectId === project.id).length}개 문서</em></article>)}</div><div className="agent-documents-grid">{filteredDocuments.map((document) => <button key={document.id} type="button" onClick={() => setActiveDocumentId(document.id)}><span><FileText /></span><strong>{document.title}</strong><small>{TYPE_LABEL[document.type]} · {formatTime(document.updatedAt)}</small><em>{STATUS_LABEL[document.status]}</em></button>)}</div></section>}

        {section === "agents" && <section className="agent-section"><header><div><h1>AI 에이전트</h1><p>업무 성격에 맞는 전문 팀을 선택해 문서 작업을 시작합니다.</p></div></header><div className="agent-team-grid">{TEAMS.map((team) => <article key={team.key}><span><Bot /></span><div><strong>{team.name}</strong><small>{team.description}</small></div><em><i /> 준비됨</em><button type="button" onClick={() => createDocument("REPORT")}>작업 시작</button></article>)}</div></section>}

        {section === "knowledge" && <section className="agent-section"><header><div><h1>지식베이스</h1><p>내부 매뉴얼과 현장 자료를 검토한 뒤 에이전트 지식으로 승인합니다.</p></div><button type="button" onClick={() => fileInputRef.current?.click()}><Plus /> 자료 업로드</button><input ref={fileInputRef} type="file" multiple hidden onChange={(event) => void addKnowledgeFiles(event.target.files)} /></header><div className="agent-knowledge-list">{data.knowledge.length === 0 ? <div className="agent-empty"><BookOpen /><strong>등록된 자료가 없습니다.</strong><p>TXT, Markdown, CSV와 내부 문서를 업로드하세요.</p></div> : data.knowledge.map((source) => <article key={source.id}><span><FileText /></span><div><strong>{source.title}</strong><small>{source.sourceType} · {formatTime(source.createdAt)}</small><p>{source.excerpt?.slice(0, 120)}</p></div><em className={`is-${source.status.toLowerCase()}`}>{source.status === "APPROVED" ? "승인됨" : "검토 대기"}</em>{source.status !== "APPROVED" && <button type="button" onClick={() => updateData((current) => ({ ...current, knowledge: current.knowledge.map((item) => item.id === source.id ? { ...item, status: "APPROVED", trustLevel: "INTERNAL_APPROVED" } : item) }))}><Check /> 승인</button>}</article>)}</div></section>}

        {section === "ontology" && <section className="agent-section"><header><div><h1>온톨로지 뇌지도</h1><p>INDEX의 시공·법규·자재 지식 관계를 시각화합니다.</p></div></header><div className="agent-ontology"><span className="is-center">INDEX 지식</span>{["방수", "단열", "마감", "전기", "설비", "하자", "법규", "자재", ...data.knowledge.filter((item) => item.status === "APPROVED").map((item) => item.title.slice(0, 8))].map((label, index) => <span key={`${label}-${index}`} style={{ "--node-index": index } as CSSProperties}>{label}</span>)}</div></section>}

        {section === "messenger" && <section className="agent-section"><header><div><h1>에이전트 메신저</h1><p>@콘텐츠, @법규, @시공처럼 팀을 지정하면 작업센터에 업무가 생성됩니다.</p></div></header><div className="agent-messenger"><div className="agent-messenger__intro"><MessageSquare /><h2>새 업무를 지시하세요</h2><p>예: @시공 욕실 방수 체크리스트를 기술자료로 만들어줘</p></div><form onSubmit={sendMessenger}><textarea value={messengerInput} onChange={(event) => setMessengerInput(event.target.value)} rows={4} placeholder="@에이전트에게 업무 지시" /><button type="submit" disabled={!messengerInput.trim()}><Send /> 작업 생성</button></form></div></section>}

        {section === "tasks" && <section className="agent-section"><header><div><h1>작업센터</h1><p>에이전트 업무의 진행 상태와 검토 대상을 확인합니다.</p></div></header><div className="agent-task-list">{data.tasks.map((task) => <article key={task.id}><span className={`is-${task.status.toLowerCase()}`} /><div><strong>{task.title}</strong><small>{task.agent} · {formatTime(task.createdAt)}</small></div><select value={task.status} onChange={(event) => updateData((current) => ({ ...current, tasks: current.tasks.map((item) => item.id === task.id ? { ...item, status: event.target.value as typeof task.status } : item) }))}><option value="QUEUED">대기</option><option value="RUNNING">진행 중</option><option value="NEEDS_REVIEW">검토 필요</option><option value="DONE">완료</option></select></article>)}</div></section>}

        {section === "settings" && <section className="agent-section"><header><div><h1>Agent Studio 설정</h1><p>현재 INDEX 관리자 인증과 AI 연결 상태입니다.</p></div></header><div className="agent-settings"><article><span><Check /></span><div><strong>관리자 인증 공유</strong><small>{user?.email || "로컬 관리자"} 계정으로 별도 로그인 없이 사용 중</small></div></article><article><span><Sparkles /></span><div><strong>INDEX AI</strong><small>기존 /api/chat 스트리밍 엔드포인트와 연결됨</small></div></article><article><span><BookOpen /></span><div><strong>Mem0 사용자 기억</strong><small>현재 관리자 UID를 기준으로 대화 기억을 분리</small></div></article></div></section>}
      </main>
    </div>
  );
}
