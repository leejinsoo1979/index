import { useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, Bot, Check, ChevronDown, Download, FileText, Image as ImageIcon, LoaderCircle, Send, Sparkles, X } from "lucide-react";
import {
  createAgentId,
  createBlock,
  getBlockText,
  setBlockText,
  type AgentAction,
  type AgentBlock,
  type AgentBlockType,
  type AgentChatMessage,
  type AgentCitation,
  type AgentDocument,
  type AgentKnowledgeSource,
  type AgentStudioData,
} from "../../lib/agentStudioStore";
import BlockOutline from "./BlockOutline";
import CanvasView from "./CanvasView";
import FlowBlockEditor from "./FlowBlockEditor";
import ImageLab from "./ImageLab";
import { ResizeHandle, useResizable } from "./Resizable";
import { agentAuthorizedFetch } from "../../lib/agentApi";

const STATUS_LABEL: Record<AgentDocument["status"], string> = { DRAFT: "작성 중", NEEDS_REVIEW: "검토 필요", APPROVED: "승인됨", ARCHIVED: "보관됨" };
const TEAMS = ["PM", "콘텐츠팀", "법규팀", "시공팀", "이미지팀", "지식팀"];
const MODELS = [
  { value: "gpt-5.4-nano", label: "GPT-5.4 nano" },
  { value: "gpt-5.4-mini", label: "GPT-5.4 mini" },
  { value: "gpt-5.4", label: "GPT-5.4" },
];

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]!);
}

async function download(document: AgentDocument, format: "md" | "txt" | "html" | "docx") {
  if (format === "docx") {
    const { Document: DocxDocument, HeadingLevel, Packer, Paragraph } = await import("docx");
    const children = [new Paragraph({ text: document.title, heading: HeadingLevel.TITLE }), ...document.blocks.flatMap((block) => {
      const text = getBlockText(block);
      const paragraphs = text.split("\n").map((line) => new Paragraph({ text: line || " ", heading: block.type === "heading" ? HeadingLevel.HEADING_2 : undefined, bullet: block.type === "checklist" ? { level: 0 } : undefined }));
      if (block.citations?.length) paragraphs.push(...block.citations.map((citation) => new Paragraph({ text: `출처: ${citation.title}${citation.url ? ` — ${citation.url}` : ""}` })));
      return paragraphs;
    })];
    const blob = await Packer.toBlob(new DocxDocument({ sections: [{ children }] }));
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a"); anchor.href = url; anchor.download = `${document.title || "document"}.docx`; anchor.click(); URL.revokeObjectURL(url);
    return;
  }
  const body = document.blocks.map((block) => {
    const text = getBlockText(block);
    if (format === "html") { const safe = escapeHtml(text).replace(/\n/g, "<br>"); return block.type === "heading" ? `<h2>${safe}</h2>` : block.type === "quote" ? `<blockquote>${safe}</blockquote>` : `<p>${safe}</p>`; }
    if (format === "md") return block.type === "heading" ? `## ${text}` : block.type === "quote" ? `> ${text}` : text;
    return text;
  }).join(format === "html" ? "\n" : "\n\n");
  const output = format === "html" ? `<!doctype html><html lang="ko"><meta charset="utf-8"><title>${escapeHtml(document.title)}</title><body><h1>${escapeHtml(document.title)}</h1>${body}</body></html>` : body;
  const url = URL.createObjectURL(new Blob([output], { type: format === "html" ? "text/html;charset=utf-8" : "text/plain;charset=utf-8" }));
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = `${document.title || "document"}.${format}`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function citationsFromText(text: string): AgentCitation[] {
  const urls = [...new Set(text.match(/https?:\/\/[^\s)\]}>,]+/g) ?? [])].slice(0, 8);
  return urls.map((url) => {
    let publisher = "웹 출처";
    try { publisher = new URL(url).hostname.replace(/^www\./, ""); } catch { /* validated by regex */ }
    return { id: createAgentId(), title: publisher, publisher, url, checkedAt: new Date().toISOString() };
  });
}

export default function DocumentStudio({ userId, document, data, onBack, onUpdateDocument, onUpdateData }: {
  userId: string;
  document: AgentDocument;
  data: AgentStudioData;
  onBack: () => void;
  onUpdateDocument: (patch: Partial<AgentDocument>) => void;
  onUpdateData: (updater: (current: AgentStudioData) => AgentStudioData) => void;
}) {
  const chatPanel = useResizable({ initial: 310, min: 250, max: 480, side: "right", storageKey: "agent-studio-chat-width" });
  const outlinePanel = useResizable({ initial: 238, min: 190, max: 360, side: "left", storageKey: "agent-studio-outline-width" });
  const [view, setView] = useState<"flow" | "canvas">("flow");
  const [selectedId, setSelectedId] = useState<string | null>(document.blocks[0]?.id ?? null);
  const [team, setTeam] = useState("PM");
  const [model, setModel] = useState(MODELS[0].value);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [imageLabOpen, setImageLabOpen] = useState(false);
  const [imageActionId, setImageActionId] = useState<string | null>(null);
  const [imagePrompt, setImagePrompt] = useState("");
  const existingConversation = data.conversations.find((conversation) => conversation.documentId === document.id);
  const [messages, setMessages] = useState<AgentChatMessage[]>(existingConversation?.messages ?? [{ id: createAgentId(), role: "assistant", content: "현재 문서를 읽었습니다. 수정할 내용이나 새 블록을 요청하세요.", createdAt: new Date().toISOString() }]);
  const approvedKnowledge = useMemo(() => data.knowledge.filter((source) => source.status === "APPROVED"), [data.knowledge]);
  const selectedBlock = useMemo(() => document.blocks.find((block) => block.id === selectedId) ?? null, [document.blocks, selectedId]);

  const updateBlock = (next: AgentBlock) => onUpdateDocument({ blocks: document.blocks.map((block) => block.id === next.id ? next : block) });
  const addBlock = (type: AgentBlockType, parentId: string | null = null) => {
    const next = { ...createBlock(type, "", document.blocks.length), parentId };
    onUpdateDocument({ blocks: [...document.blocks, next] });
    setSelectedId(next.id);
  };
  const deleteBlock = (id: string) => {
    if (!window.confirm("이 블록과 하위 블록을 삭제할까요? 이 작업은 되돌릴 수 없습니다.")) return;
    const descendants = new Set([id]);
    let changed = true;
    while (changed) { changed = false; document.blocks.forEach((block) => { if (block.parentId && descendants.has(block.parentId) && !descendants.has(block.id)) { descendants.add(block.id); changed = true; } }); }
    onUpdateDocument({ blocks: document.blocks.filter((block) => !descendants.has(block.id)).map((block, index) => ({ ...block, sortOrder: index })) });
    if (selectedId && descendants.has(selectedId)) setSelectedId(null);
  };
  const reorder = (draggedId: string, targetId: string) => {
    const ordered = [...document.blocks].sort((a, b) => a.sortOrder - b.sortOrder);
    const from = ordered.findIndex((block) => block.id === draggedId);
    const to = ordered.findIndex((block) => block.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = ordered.splice(from, 1);
    ordered.splice(to, 0, moved);
    onUpdateDocument({ blocks: ordered.map((block, index) => ({ ...block, sortOrder: index })) });
  };

  const setActionStatus = (id: string, status: AgentAction["status"]) => onUpdateData((current) => ({ ...current, actions: current.actions.map((action) => action.id === id ? { ...action, status } : action) }));
  const persistMessages = (nextMessages: AgentChatMessage[]) => onUpdateData((current) => {
    const now = new Date().toISOString();
    const cappedMessages = nextMessages.slice(-100);
    const found = current.conversations.find((conversation) => conversation.documentId === document.id);
    return {
      ...current,
      conversations: found
        ? current.conversations.map((conversation) => conversation.id === found.id ? { ...conversation, messages: cappedMessages, updatedAt: now } : conversation)
        : [{ id: createAgentId(), documentId: document.id, title: document.title, messages: cappedMessages, createdAt: now, updatedAt: now }, ...current.conversations],
    };
  });
  const approveAction = (action: AgentAction) => {
    const text = typeof action.payload.text === "string" ? action.payload.text : "";
    const type = typeof action.payload.blockType === "string" ? action.payload.blockType as AgentBlockType : "paragraph";
    if (action.type === "generate_image") { setImageActionId(action.id); setImagePrompt(typeof action.payload.prompt === "string" ? action.payload.prompt : ""); setImageLabOpen(true); return; }
    if (action.type === "extract_ontology") {
      const words = [...new Set(document.blocks.flatMap((block) => getBlockText(block).match(/[가-힣A-Za-z0-9]{2,12}/g) ?? []))].slice(0, 10);
      onUpdateData((current) => ({ ...current, ontologyNodes: [...current.ontologyNodes, ...words.filter((label) => !current.ontologyNodes.some((node) => node.label === label)).map((label) => ({ id: createAgentId(), label, type: "method" as const, description: `${document.title}에서 추출`, status: "CANDIDATE" as const, confidence: .72 }))], actions: current.actions.map((item) => item.id === action.id ? { ...item, status: "EXECUTED" } : item) }));
      return;
    }
    if ((action.type === "update_block" || action.type === "replace_block_content" || action.type === "append_to_block") && typeof action.payload.targetBlockId === "string") {
      const target = document.blocks.find((block) => block.id === action.payload.targetBlockId);
      if (target) {
        const replacement = action.type === "append_to_block" ? `${getBlockText(target)}\n${text}`.trim() : text;
        onUpdateDocument({ blocks: document.blocks.map((block) => block.id === target.id ? { ...setBlockText(block, replacement), citations: (action.payload.citations as AgentCitation[] | undefined) ?? block.citations } : block) });
        setSelectedId(target.id); setActionStatus(action.id, "EXECUTED"); return;
      }
    }
    const next = { ...createBlock(type, text, document.blocks.length), citations: (action.payload.citations as AgentCitation[] | undefined) ?? [] };
    onUpdateDocument({ blocks: [...document.blocks, next] }); setSelectedId(next.id); setActionStatus(action.id, "EXECUTED");
  };

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const content = input.trim();
    if (!content || busy) return;
    const userMessage: AgentChatMessage = { id: createAgentId(), role: "user", content, createdAt: new Date().toISOString() };
    const nextMessages = [...messages, userMessage];
    const replyId = createAgentId();
    const pendingReply: AgentChatMessage = { id: replyId, role: "assistant", content: "", createdAt: new Date().toISOString() };
    setMessages([...nextMessages, pendingReply]);
    persistMessages(nextMessages);
    setInput("");
    setBusy(true);
    let reply = "";
    try {
      const knowledge = approvedKnowledge.slice(0, 6).map((source: AgentKnowledgeSource) => `[${source.title}] ${source.excerpt ?? ""}`).join("\n");
      const selected = selectedBlock;
      const prompt = `역할: ARCHI Agent Studio ${team}. 현재 문서의 기존 내용을 직접 덮어쓰지 말고 변경안을 제안하세요. 법규·시공 기준은 검증 가능한 공식 출처 URL과 발행기관을 포함하고, 확인할 수 없다면 확인 불가라고 명시하세요.\n문서: ${document.title}\n${selected ? `선택 블록(${selected.type}): ${getBlockText(selected)}\n` : ""}내용:\n${document.blocks.map(getBlockText).join("\n")}\n${knowledge ? `승인된 내부 지식:\n${knowledge}\n` : ""}사용자 요청: ${content}`;
      const response = await agentAuthorizedFetch("/api/agent-chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, model, messages: nextMessages.map((message, index) => ({ role: message.role, content: index === nextMessages.length - 1 ? prompt : message.content })), memoryMessages: nextMessages.map((message) => ({ role: message.role, content: message.content })) }) });
      if (!response.ok || !response.body) throw new Error("AI 응답을 불러오지 못했습니다.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        reply += decoder.decode(chunk.value, { stream: true });
        setMessages((current) => current.map((message) => message.id === replyId ? { ...message, content: reply } : message));
      }
      const citations = citationsFromText(reply);
      const legallySupported = team !== "법규팀" || citations.length > 0 || /확인\s*(불가|할 수 없)/.test(reply);
      if (!legallySupported) reply += "\n\n⚠️ 확인 가능한 공식 출처가 없어 이 변경안은 문서에 적용할 수 없습니다. 공식 법령·고시 URL을 확인한 뒤 다시 요청하세요.";
      const finishedMessages = [...nextMessages, { ...pendingReply, content: reply, citations }];
      setMessages(finishedMessages);
      persistMessages(finishedMessages);
      const actionType: AgentAction["type"] = /이미지|렌더|사진/.test(content) ? "generate_image" : /온톨로지|지식\s*추출/.test(content) ? "extract_ontology" : selected && /수정|바꿔|교체|다듬/.test(content) ? "update_block" : selected && /이어|추가해/.test(content) ? "append_to_block" : "insert_blocks";
      const action: AgentAction = { id: createAgentId(), documentId: document.id, type: actionType, payload: { text: reply, prompt: content, blockType: "paragraph", targetBlockId: selected?.id, messageId: replyId, model, team, citations }, status: "PROPOSED", requiresApproval: true, riskLevel: team === "법규팀" || actionType === "generate_image" ? "high" : actionType === "update_block" ? "medium" : "low", createdAt: new Date().toISOString() };
      if (legallySupported) onUpdateData((current) => ({ ...current, actions: [action, ...current.actions] }));
    } catch (error) {
      const failure = error instanceof Error ? error.message : "AI 요청 중 오류가 발생했습니다.";
      const failedMessages = [...nextMessages, { ...pendingReply, content: failure }];
      setMessages(failedMessages);
      persistMessages(failedMessages);
    } finally { setBusy(false); }
  }

  const documentActions = data.actions.filter((action) => action.documentId === document.id);

  return <div className="agent-document-studio">
    <header className="agent-document-toolbar">
      <button type="button" onClick={onBack}><ArrowLeft /> 문서 목록</button>
      <span className="agent-document-toolbar__divider" />
      <FileText />
      <input value={document.title} onChange={(event) => onUpdateDocument({ title: event.target.value })} aria-label="문서 제목" />
      <span className="agent-document-toolbar__saved">자동 저장됨</span>
      <div className="agent-document-toolbar__views"><button type="button" className={view === "flow" ? "is-active" : ""} onClick={() => setView("flow")}>플로우</button><button type="button" className={view === "canvas" ? "is-active" : ""} onClick={() => setView("canvas")}>캔버스</button></div>
      <select value={document.status} onChange={(event) => onUpdateDocument({ status: event.target.value as AgentDocument["status"] })}>{Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <button type="button" onClick={() => setImageLabOpen(true)}><ImageIcon /> 이미지</button>
      <div className="agent-document-export"><button type="button" onClick={() => setExportOpen((value) => !value)}><Download /> 내보내기 <ChevronDown /></button>{exportOpen && <div><button type="button" onClick={() => void download(document, "docx")}>Word DOCX</button><button type="button" onClick={() => void download(document, "md")}>Markdown</button><button type="button" onClick={() => void download(document, "txt")}>TXT</button><button type="button" onClick={() => void download(document, "html")}>HTML</button><button type="button" onClick={() => window.print()}>PDF 인쇄</button></div>}</div>
    </header>
    <div className="agent-document-workspace">
      <aside className="agent-ai-panel" style={{ width: chatPanel.width }}>
        <ResizeHandle side="right" onPointerDown={chatPanel.beginResize} />
        <header><span><Bot /></span><div><strong>AI 에이전트</strong><small>{selectedBlock ? `선택: ${selectedBlock.type} · ${getBlockText(selectedBlock).slice(0, 24) || "빈 블록"}` : "문서 전체 컨텍스트"}</small></div></header>
        <div className="agent-ai-panel__controls"><select value={team} onChange={(event) => setTeam(event.target.value)}>{TEAMS.map((name) => <option key={name}>{name}</option>)}</select><select value={model} onChange={(event) => setModel(event.target.value)}>{MODELS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
        <div className="agent-ai-panel__messages">{messages.map((message) => {
          const actions = documentActions.filter((action) => action.payload.messageId === message.id);
          return <div key={message.id} className={`agent-ai-message is-${message.role}`}><p>{message.content || "작성 중..."}</p>{message.citations && message.citations.length > 0 && <div className="agent-source-cards">{message.citations.map((citation) => <a key={citation.id} href={citation.url} target="_blank" rel="noreferrer"><strong>{citation.title}</strong><small>{citation.url}</small></a>)}</div>}{actions.map((action) => <div key={action.id} className={`agent-action-card is-${action.status.toLowerCase()}`}><div><Sparkles /><span><strong>{action.type === "update_block" ? "선택 블록 수정" : action.type === "append_to_block" ? "선택 블록 이어쓰기" : action.type === "generate_image" ? "이미지 생성" : action.type === "extract_ontology" ? "온톨로지 후보 추출" : "문서 블록 삽입"}</strong><small>{action.riskLevel === "high" ? "출처 또는 비용 검토가 필요한 고위험 변경" : action.riskLevel === "medium" ? "기존 콘텐츠에 영향을 주는 변경" : "검토 후 적용되는 변경"}</small></span></div>{action.status === "PROPOSED" ? <footer><button type="button" onClick={() => setActionStatus(action.id, "REJECTED")}><X /> 거절</button><button type="button" onClick={() => approveAction(action)}><Check /> 적용</button></footer> : <em>{action.status === "EXECUTED" ? "적용됨" : "거절됨"}</em>}</div>)}</div>;
        })}{busy && <span className="agent-ai-panel__busy"><LoaderCircle /> 응답 생성 중</span>}</div>
        <form onSubmit={sendMessage}><textarea rows={3} value={input} onChange={(event) => setInput(event.target.value)} placeholder="문서 수정이나 자료 조사를 요청하세요" /><div><span>{approvedKnowledge.length}개 승인 지식 연결</span><button type="submit" disabled={!input.trim() || busy}><Send /></button></div></form>
      </aside>
      <main className={`agent-document-canvas is-${view}`}>
        {view === "flow" ? <div className="agent-document-paper"><FlowBlockEditor blocks={document.blocks} selectedId={selectedId} onSelect={setSelectedId} onChange={updateBlock} onDelete={deleteBlock} onAdd={addBlock} onReorder={reorder} /></div> : <CanvasView blocks={document.blocks} selectedId={selectedId} onSelect={(id) => setSelectedId(id || null)} onChange={updateBlock} />}
      </main>
      <div className="agent-outline-panel" style={{ width: outlinePanel.width }}><ResizeHandle side="left" onPointerDown={outlinePanel.beginResize} /><BlockOutline blocks={document.blocks} selectedId={selectedId} onSelect={setSelectedId} onDelete={deleteBlock} onAdd={addBlock} onReorder={reorder} /></div>
    </div>
    {imageLabOpen && <div className="agent-image-drawer"><div><header><div><strong>문서 이미지 스튜디오</strong><small>생성·인페인트 후 선택한 이미지를 현재 문서에 삽입합니다.</small></div><button type="button" onClick={() => { setImageLabOpen(false); setImageActionId(null); setImagePrompt(""); }}><X /></button></header><ImageLab userId={userId} data={data} onUpdateData={onUpdateData} initialPrompt={imagePrompt} onInsertImage={(src, caption) => { const block = createBlock("image", "", document.blocks.length); block.content = { src, caption, alt: caption }; onUpdateDocument({ blocks: [...document.blocks, block] }); setSelectedId(block.id); if (imageActionId) setActionStatus(imageActionId, "EXECUTED"); setImageLabOpen(false); setImageActionId(null); setImagePrompt(""); }} /></div></div>}
  </div>;
}
