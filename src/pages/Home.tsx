import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { CHAT_ATTACHMENT_ACCEPT, MAX_ATTACHMENTS, readChatAttachment, type ChatAttachment } from "../lib/chatAttachments";
import { FloorPlanCardList, FloorPlanImage, splitFloorPlanCards } from "../components/FloorPlanCards";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AiStateAnimation,
  modeColor,
  type AiMode,
  type AiShape,
} from "../components/AiStateAnimation";
import { Link, useNavigate } from "react-router-dom";
import { expertRequest } from "../lib/personas";
import type { ExpertProfile } from "../types/personas";
import ParticleTitle from "../components/ParticleTitle";
import { ThinkingOrbLabel } from "../components/orbs/ThinkingOrb";
import { useAuth } from "../auth/AuthContext";
import "./Home.css";

type ChatRole = "user" | "assistant";

interface ChatEntry {
  id: string;
  role: ChatRole;
  content: string;
  /** Response time shown under assistant replies. */
  ms?: number;
  /** Names only: the content is kept for the open session, not in saved history. */
  attachments?: Array<{ name: string; kind: ChatAttachment["kind"] }>;
  /** The floor plan this message picked; later questions in the conversation use it. */
  floorPlan?: { id: string; label: string };
}

interface StoredMemory {
  id: string;
  memory?: string;
  createdAt?: string;
  categories?: string[];
}

interface Conversation {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatEntry[];
}

const HISTORY_KEY = "index-ai-conversations";
const PENDING_QUESTION_KEY = "index-ai-pending-question";

function createId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function loadConversations(): Conversation[] {
  try {
    const saved = window.localStorage.getItem(HISTORY_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved) as Conversation[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function PanelIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
      <path d="M9.5 4.5v15" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3v12M8 6.5 12 3l4 3.5M5 12v7.5h14V12" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h9" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 11a8 8 0 1 0-1.5 6.5M20 5v6h-6" />
    </svg>
  );
}

function DotsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="5.5" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="18.5" cy="12" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.5 6.5h15M9.5 6V4.5h5V6M7 6.5l1 13h8l1-13M10.2 10v6M13.8 10v6" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m14.5 5.5 4 4L8 20l-4.5.5L4 16 14.5 5.5ZM12.5 7.5l4 4" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="9.2" y="3" width="5.6" height="11" rx="2.8" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3.5" />
    </svg>
  );
}

function ArrowUpIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 19V5M6 11l6-6 6 6" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m7 10 5 5 5-5" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

const askModels = [
  { name: "빠른 답변", description: "일반 질문에 빠른 도움" },
  { name: "심층 분석", description: "설계·현장 과제와 사례를 깊이 분석" },
] as const;

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3c.7 4.7 3.3 7.3 8 8-4.7.7-7.3 3.3-8 8-.7-4.7-3.3-7.3-8-8 4.7-.7 7.3-3.3 8-8Z" />
    </svg>
  );
}

function MemoryIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 4.5A3.5 3.5 0 0 0 5.5 8v.8A3.2 3.2 0 0 0 4 11.5c0 1.1.5 2.1 1.3 2.7-.2.4-.3.9-.3 1.3A3.5 3.5 0 0 0 8.5 19H10V5.5A1 1 0 0 0 9 4.5ZM15 4.5A3.5 3.5 0 0 1 18.5 8v.8a3.2 3.2 0 0 1 1.5 2.7c0 1.1-.5 2.1-1.3 2.7.2.4.3.9.3 1.3a3.5 3.5 0 0 1-3.5 3.5H14V5.5a1 1 0 0 1 1-1Z" />
      <path d="M7.5 9.5H10M14 9.5h2.5M7.5 14H10M14 14h2.5" />
    </svg>
  );
}

/**
 * Answers are markdown. Images are shown only from the INDEX wiki's own figures
 * (/wiki-assets/…, or the index-wiki R2 bucket); any other image URL the model writes is shown as its caption.
 */
const ANSWER_COMPONENTS: Components = {
  img: ({ src, alt }) =>
    typeof src === "string" && (src.startsWith("/wiki-assets/") || src.startsWith("https://index-wiki.uable.co.kr/")) ? (
      <figure className="home-chat__figure">
        <a href={src} target="_blank" rel="noreferrer">
          <img src={src} alt={alt ?? ""} loading="lazy" />
        </a>
        {alt && <figcaption>{alt}</figcaption>}
      </figure>
    ) : (
      <span>{alt ? `(그림: ${alt})` : ""}</span>
    ),
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  ),
};

export default function Home() {
  const { user } = useAuth();
  const [mode] = useState<AiMode>("analyze");
  const [shape] = useState<AiShape>("clean");
  const [message, setMessage] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>(loadConversations);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [isResponding, setIsResponding] = useState(false);
  const [listening, setListening] = useState(false);
  /** Today's question quota from the server (null limit = unlimited / not enforced). */
  const [quota, setQuota] = useState<{ limit: number | null; remaining: number | null } | null>(null);
  const [loginPrompt, setLoginPrompt] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [memories, setMemories] = useState<StoredMemory[]>([]);
  const [memoriesLoading, setMemoriesLoading] = useState(false);
  const [memoryError, setMemoryError] = useState("");
  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  const requestControllerRef = useRef<AbortController | null>(null);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [attachBusy, setAttachBusy] = useState(false);
  const [attachError, setAttachError] = useState("");
  const [attachDrag, setAttachDrag] = useState(false);
  const attachInputRef = useRef<HTMLInputElement>(null);
  /** Attachment content per sent message, so follow-up questions can still see it this session. */
  const sentAttachmentsRef = useRef(new Map<string, ChatAttachment[]>());
  const scrollRef = useRef<HTMLDivElement>(null);
  const [askModel, setAskModel] = useState<(typeof askModels)[number]["name"]>(askModels[0].name);
  const [askModelOpen, setAskModelOpen] = useState(false);
  const askModelRef = useRef<HTMLDivElement>(null);
  // 질문할 에이전트: INDEX AI(범용) 또는 개별 대표의 개인 AI. 응답 모드는 모든 에이전트 공통.
  const navigate = useNavigate();
  const [askAgent, setAskAgent] = useState("index");
  const [askAgentOpen, setAskAgentOpen] = useState(false);
  const askAgentRef = useRef<HTMLDivElement>(null);
  const [experts, setExperts] = useState<ExpertProfile[]>([]);
  const agentExpert = askAgent === "index" ? null : experts.find((item) => item.id === askAgent) ?? null;

  /** INDEX AI is members-only: every call carries the Firebase ID token. */
  async function authHeaders(): Promise<Record<string, string>> {
    const token = await user?.getIdToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  useEffect(() => {
    if (!user) return;
    const pending = window.sessionStorage.getItem(PENDING_QUESTION_KEY);
    if (!pending) return;
    window.sessionStorage.removeItem(PENDING_QUESTION_KEY);
    handleSubmit(pending);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!user) {
      setQuota(null);
      return;
    }
    setLoginPrompt(false);
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/chat-quota", { headers: await authHeaders() });
        const payload = await response.json() as { limit?: number | null; remaining?: number | null };
        if (!cancelled && response.ok) setQuota({ limit: payload.limit ?? null, remaining: payload.remaining ?? null });
      } catch {
        // quota display is best-effort; the server still enforces the limit
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!askModelOpen && !askAgentOpen) return;
    function handlePointerDown(event: MouseEvent) {
      if (!askModelRef.current?.contains(event.target as Node)) setAskModelOpen(false);
      if (!askAgentRef.current?.contains(event.target as Node)) setAskAgentOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [askModelOpen, askAgentOpen]);

  useEffect(() => {
    let active = true;
    expertRequest<{ profiles: ExpertProfile[] }>("directory")
      .then((result) => active && setExperts(result.profiles.filter((item) => item.published !== false)))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [user?.uid]);

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeId) ?? null,
    [activeId, conversations],
  );

  useEffect(() => {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(conversations));
  }, [conversations]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [activeConversation?.messages.length, isResponding, chatOpen]);

  function addEntry(conversationId: string, entry: ChatEntry) {
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === conversationId
          ? { ...conversation, updatedAt: Date.now(), messages: [...conversation.messages, entry] }
          : conversation,
      ),
    );
  }

  function updateEntry(conversationId: string, entryId: string, content: string, ms?: number) {
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === conversationId
          ? {
              ...conversation,
              updatedAt: Date.now(),
              messages: conversation.messages.map((entry) =>
                entry.id === entryId ? { ...entry, content, ...(ms == null ? {} : { ms }) } : entry,
              ),
            }
          : conversation,
      ),
    );
  }

  function latestAttachments(entries: ChatEntry[]) {
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const sent = sentAttachmentsRef.current.get(entries[index]!.id);
      if (sent) return sent.map(({ kind, name, dataUrl, text }) => ({ kind, name, dataUrl, text }));
    }
    return [];
  }

  async function addAttachments(list: File[]) {
    if (!list.length) return;
    setAttachError("");
    const room = MAX_ATTACHMENTS - attachments.length;
    if (list.length > room) setAttachError(`파일은 한 번에 ${MAX_ATTACHMENTS}개까지 첨부할 수 있습니다.`);
    setAttachBusy(true);
    try {
      for (const file of list.slice(0, Math.max(room, 0))) {
        try {
          const attachment = await readChatAttachment(file);
          setAttachments((current) => [...current, attachment]);
        } catch (error) {
          setAttachError(error instanceof Error ? error.message : "파일을 읽지 못했습니다.");
        }
      }
    } finally {
      setAttachBusy(false);
    }
  }

  async function streamAssistantReply(conversationId: string, sourceMessages: ChatEntry[], floorPlanDanji?: string) {
    const replyId = createId();
    const controller = new AbortController();
    const startedAt = Date.now();
    let replyText = "";
    let replyAdded = false;

    requestControllerRef.current?.abort();
    requestControllerRef.current = controller;
    setIsResponding(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({
          messages: sourceMessages.map(({ role, content, attachments: names }) => ({
            role,
            content: names?.length ? `${content}\n\n[첨부: ${names.map((item) => item.name).join(", ")}]` : content,
          })),
          attachments: latestAttachments(sourceMessages),
          floorPlanId: [...sourceMessages].reverse().find((entry) => entry.floorPlan)?.floorPlan?.id,
          ...(floorPlanDanji ? { floorPlanDanji } : {}),
          mode: askModel === "심층 분석" ? "deep" : "fast",
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null) as
          | { error?: string; quota?: { limit: number | null; remaining: number | null } }
          | null;
        if (payload?.quota) setQuota({ limit: payload.quota.limit, remaining: payload.quota.remaining });
        throw new Error(payload?.error || "AI 응답을 불러오지 못했습니다.");
      }
      const remaining = response.headers.get("X-Chat-Remaining");
      const limit = response.headers.get("X-Chat-Limit");
      if (remaining !== null && limit !== null) setQuota({ limit: Number(limit), remaining: Number(remaining) });
      if (!response.body) throw new Error("응답 스트림을 열 수 없습니다.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        replyText += decoder.decode(value, { stream: true });
        if (!replyAdded) {
          addEntry(conversationId, { id: replyId, role: "assistant", content: replyText });
          replyAdded = true;
        } else {
          updateEntry(conversationId, replyId, replyText);
        }
      }
      replyText += decoder.decode();
      if (replyAdded) updateEntry(conversationId, replyId, replyText, Date.now() - startedAt);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      const content = error instanceof Error ? error.message : "AI 요청 중 오류가 발생했습니다.";
      if (replyAdded) updateEntry(conversationId, replyId, `${replyText}\n\n${content}`);
      else addEntry(conversationId, { id: replyId, role: "assistant", content });
    } finally {
      if (requestControllerRef.current === controller) requestControllerRef.current = null;
      setIsResponding(false);
    }
  }

  function regenerateReply() {
    if (!activeConversation || isResponding) return;
    if (!activeConversation.messages.some((entry) => entry.role === "user")) return;
    void streamAssistantReply(activeConversation.id, activeConversation.messages);
  }

  function copyMessage(content: string) {
    navigator.clipboard?.writeText(content).catch(() => undefined);
  }

  function deleteConversation(conversationId: string) {
    setConversations((current) =>
      current.filter((conversation) => conversation.id !== conversationId),
    );
    if (activeId === conversationId) setActiveId(null);
  }

  function toggleMic() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const SpeechRecognitionImpl =
      (window as unknown as Record<string, unknown>).SpeechRecognition ??
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    if (typeof SpeechRecognitionImpl !== "function") {
      alert("이 브라우저는 음성 입력을 지원하지 않습니다.");
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition = new (SpeechRecognitionImpl as any)();
    recognition.lang = "ko-KR";
    recognition.interimResults = false;
    recognition.onresult = (event: { results: { [i: number]: { [j: number]: { transcript: string } } } }) => {
      const transcript = event.results[0][0].transcript;
      setMessage((current) => (current ? `${current} ${transcript}` : transcript));
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  /**
   * Enter sends once. During Hangul composition some browsers consume the Enter to commit the
   * last syllable and never fire a second keydown, so send after the commit instead of dropping
   * it; browsers that do fire a second keydown are de-duplicated.
   */
  const lastSubmitRef = useRef({ text: "", at: 0 });
  function submitOnEnter(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    const field = event.currentTarget;
    const send = () => {
      const text = field.value.trim();
      if (!text && attachments.length) {
        handleSubmit("");
        return;
      }
      const now = Date.now();
      if (!text || (lastSubmitRef.current.text === text && now - lastSubmitRef.current.at < 800)) return;
      lastSubmitRef.current = { text, at: now };
      handleSubmit(text);
    };
    if (event.nativeEvent.isComposing || event.keyCode === 229) window.setTimeout(send, 0);
    else send();
  }

  function handleSubmit(value: string, pick?: { floorPlan?: ChatEntry["floorPlan"]; danji?: string }) {
    const question = (value || message).trim() || (attachments.length ? "첨부한 자료를 분석해 주세요." : "");
    if (!question || isResponding || attachBusy) return;
    if (agentExpert) {
      // 개별 대표에게: 그 대표의 개인 대화방으로 가서 같은 질문을 같은 모드로 보낸다.
      setMessage("");
      const mode = askModel === "심층 분석" ? "deep" : "fast";
      navigate(`/experts/${encodeURIComponent(agentExpert.id)}?q=${encodeURIComponent(question)}&mode=${mode}`);
      return;
    }
    if (!user) {
      // Members only: keep the question, show the login card, and send it after login.
      window.sessionStorage.setItem(PENDING_QUESTION_KEY, question);
      setLoginPrompt(true);
      setChatOpen(true);
      setSidebarOpen(false);
      return;
    }

    const userEntry: ChatEntry = {
      id: createId(),
      role: "user",
      content: question,
      ...(attachments.length ? { attachments: attachments.map(({ name, kind }) => ({ name, kind })) } : {}),
      ...(pick?.floorPlan ? { floorPlan: pick.floorPlan } : {}),
    };
    if (attachments.length) sentAttachmentsRef.current.set(userEntry.id, attachments);
    setAttachments([]);
    setAttachError("");
    let conversationId = activeId;
    let sourceMessages: ChatEntry[] = [userEntry];

    if (conversationId) {
      sourceMessages = [...(activeConversation?.messages ?? []), userEntry];
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === conversationId
            ? { ...conversation, updatedAt: Date.now(), messages: [...conversation.messages, userEntry] }
            : conversation,
        ),
      );
    } else {
      conversationId = createId();
      const nextConversation: Conversation = {
        id: conversationId,
        title: question.length > 34 ? `${question.slice(0, 34)}…` : question,
        updatedAt: Date.now(),
        messages: [userEntry],
      };
      setConversations((current) => [nextConversation, ...current]);
      setActiveId(conversationId);
    }

    setMessage("");
    setChatOpen(true);
    setSidebarOpen(false);
    void streamAssistantReply(conversationId, sourceMessages, pick?.danji);
  }

  function startNewChat() {
    requestControllerRef.current?.abort();
    setActiveId(null);
    setMessage("");
    setChatOpen(true);
    setSidebarOpen(false);
    setIsResponding(false);
  }

  async function loadMemories() {
    setMemoryOpen(true);
    setMemoriesLoading(true);
    setMemoryError("");
    try {
      const response = await fetch("/api/memories", { headers: await authHeaders() });
      const payload = await response.json() as { memories?: StoredMemory[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "기억을 불러오지 못했습니다.");
      setMemories(payload.memories ?? []);
    } catch (error) {
      setMemoryError(error instanceof Error ? error.message : "기억을 불러오지 못했습니다.");
    } finally {
      setMemoriesLoading(false);
    }
  }

  async function editMemory(memory: StoredMemory) {
    const text = window.prompt("기억 내용을 수정하세요.", memory.memory ?? "")?.trim();
    if (!text || text === memory.memory) return;
    const response = await fetch("/api/memories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ memoryId: memory.id, text }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      setMemoryError(payload?.error || "기억을 수정하지 못했습니다.");
      return;
    }
    setMemories((current) =>
      current.map((item) => item.id === memory.id ? { ...item, memory: text } : item),
    );
  }

  async function deleteMemory(memoryId?: string) {
    const label = memoryId ? "이 기억을 삭제할까요?" : "저장된 모든 기억을 삭제할까요?";
    if (!window.confirm(label)) return;
    const response = await fetch("/api/memories", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ memoryId }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      setMemoryError(payload?.error || "기억을 삭제하지 못했습니다.");
      return;
    }
    setMemories((current) => memoryId ? current.filter((item) => item.id !== memoryId) : []);
  }

  const composer = (
    <form
      className="home__ask"
      onSubmit={(event) => {
        event.preventDefault();
        handleSubmit(message);
      }}
    >
      <button type="button" className="home__ask-tool" aria-label="첨부 (준비 중)" disabled>
        <PlusIcon />
      </button>
      <input
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        onKeyDown={submitOnEnter}
        placeholder={!user ? "로그인 후 질문할 수 있어요" : agentExpert ? `${agentExpert.name}에게 물어보세요` : "무엇이든 물어보세요"}
        aria-label={agentExpert ? `${agentExpert.name}에게 질문` : "INDEX AI에게 질문"}
        autoComplete="off"
      />
      <div className="home__ask-model-wrap" ref={askAgentRef}>
        <button
          type="button"
          className="home__ask-model"
          aria-haspopup="listbox"
          aria-expanded={askAgentOpen}
          aria-label="에이전트 선택"
          onClick={() => {
            setAskAgentOpen((open) => !open);
            setAskModelOpen(false);
          }}
        >
          {agentExpert ? agentExpert.name : "INDEX AI"} <ChevronDownIcon />
        </button>
        {askAgentOpen && (
          <div className="home__ask-menu" role="listbox" aria-label="에이전트 선택">
            {[{ id: "index", name: "INDEX AI", description: "협회 지식·법규·사례 전반" }, ...experts.map((item) => ({ id: item.id, name: item.name, description: item.role || "개인 AI" }))].map((item) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={askAgent === item.id}
                onClick={() => {
                  setAskAgent(item.id);
                  setAskAgentOpen(false);
                }}
              >
                <span className="home__ask-menu-check">{askAgent === item.id && <CheckIcon />}</span>
                <span className="home__ask-menu-label">
                  <strong>{item.name}</strong>
                  <small>{item.description}</small>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="home__ask-model-wrap" ref={askModelRef}>
        <button
          type="button"
          className="home__ask-model"
          aria-haspopup="listbox"
          aria-expanded={askModelOpen}
          aria-label="응답 모드 선택"
          onClick={() => {
            setAskModelOpen((open) => !open);
            setAskAgentOpen(false);
          }}
        >
          {askModel} <ChevronDownIcon />
        </button>
        {askModelOpen && (
          <div className="home__ask-menu" role="listbox" aria-label="응답 모드 선택">
            {askModels.map((item) => (
              <button
                key={item.name}
                type="button"
                role="option"
                aria-selected={askModel === item.name}
                onClick={() => {
                  setAskModel(item.name);
                  setAskModelOpen(false);
                }}
              >
                <span className="home__ask-menu-check">
                  {askModel === item.name && <CheckIcon />}
                </span>
                <span className="home__ask-menu-label">
                  <strong>{item.name}</strong>
                  <small>{item.description}</small>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        type="button"
        className={`home__ask-tool${listening ? " is-listening" : ""}`}
        aria-label="음성 입력"
        onClick={toggleMic}
      >
        <MicIcon />
      </button>
      {message.trim() && (
        <button type="submit" className="home__ask-send" aria-label="보내기" disabled={isResponding}>
          <ArrowUpIcon />
        </button>
      )}
    </form>
  );

  const [glowR, glowG, glowB] = modeColor[mode];

  return (
    <section
      className={`home${chatOpen ? " home--chat" : ""}`}
      style={{ "--mode-glow": `${glowR}, ${glowG}, ${glowB}` } as CSSProperties}
    >
      {!chatOpen ? (
        <>
          <AiStateAnimation mode={mode} shape={shape} />
          <div className="home__hero">
            <ParticleTitle text="index" className="home__logo-canvas" />
          </div>

          <div className="home__composer">
            {composer}
          </div>

        </>
      ) : (
        <div className={`home-chat${sidebarHidden ? " home-chat--collapsed" : ""}`}>
          <button className={`home-chat__scrim${sidebarOpen ? " is-open" : ""}`} type="button" aria-label="히스토리 닫기" onClick={() => setSidebarOpen(false)} />

          <aside className={`home-chat__sidebar${sidebarOpen ? " is-open" : ""}`}>
            <button className="home-chat__new" type="button" onClick={startNewChat}>
              <PlusIcon /> 새 대화
            </button>
            <button className="home-chat__memory-button" type="button" onClick={() => void loadMemories()}>
              <MemoryIcon /> 저장된 기억
            </button>

            <nav className="home-chat__history" aria-label="대화 기록">
              {conversations.length === 0 ? (
                <p>아직 저장된 대화가 없습니다.</p>
              ) : (
                conversations.map((conversation) => (
                  <div key={conversation.id} className={`home-chat__thread-item${activeId === conversation.id ? " is-active" : ""}`}>
                    <button type="button" onClick={() => { setActiveId(conversation.id); setSidebarOpen(false); }}>
                      <span>{conversation.title}</span>
                    </button>
                    <button type="button" className="home-chat__thread-delete" aria-label="대화 삭제" onClick={() => deleteConversation(conversation.id)}>
                      <TrashIcon />
                    </button>
                  </div>
                ))
              )}
            </nav>
          </aside>

          <div className="home-chat__main">
            <header className="home-chat__topbar">
              <button
                type="button"
                aria-label="사이드바 토글"
                onClick={() => {
                  if (window.innerWidth <= 760) setSidebarOpen((open) => !open);
                  else setSidebarHidden((hidden) => !hidden);
                }}
              >
                <PanelIcon />
              </button>
              <strong>{activeConversation?.title ?? "새 대화"}</strong>
              <button
                type="button"
                className="home-chat__share"
                aria-label="대화 공유"
                onClick={() => {
                  navigator.clipboard?.writeText(window.location.href).catch(() => undefined);
                }}
              >
                <ShareIcon />
              </button>
            </header>

            <div className="home-chat__scroll" ref={scrollRef}>
              <div className="home-chat__thread">
                {(activeConversation?.messages ?? []).map((entry) =>
                  entry.role === "user" ? (
                    <div className="home-chat__msg home-chat__msg--user" key={entry.id}>
                      {entry.attachments?.length ? (
                        <div className="home-chat__sent-files">
                          {entry.attachments.map((item, index) => {
                            const preview = sentAttachmentsRef.current.get(entry.id)?.[index]?.dataUrl;
                            return preview ? (
                              <img key={item.name + index} src={preview} alt={item.name} />
                            ) : (
                              <span key={item.name + index}>{item.name}</span>
                            );
                          })}
                        </div>
                      ) : null}
                      {entry.floorPlan && <FloorPlanImage id={entry.floorPlan.id} label={entry.floorPlan.label} authHeaders={authHeaders} />}
                      <div className="home-chat__bubble">{entry.content}</div>
                      <div className="home-chat__msg-actions home-chat__msg-actions--user">
                        <button type="button" aria-label="복사" onClick={() => copyMessage(entry.content)}><CopyIcon /></button>
                        <button type="button" aria-label="수정" onClick={() => setMessage(entry.content)}><PencilIcon /></button>
                      </div>
                    </div>
                  ) : (
                    <div className="home-chat__msg home-chat__msg--assistant" key={entry.id}>
                      <div className="home-chat__md">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={ANSWER_COMPONENTS}>
                          {splitFloorPlanCards(entry.content).text}
                        </ReactMarkdown>
                        {splitFloorPlanCards(entry.content).cards.map((cards, index) => (
                          <FloorPlanCardList
                            key={index}
                            cards={cards}
                            disabled={isResponding}
                            authHeaders={authHeaders}
                            onPickPlan={(danji, plan) => handleSubmit(`${danji.name} ${plan.type} 타입이에요.`, { floorPlan: { id: plan.id, label: `${danji.name} ${plan.type}` } })}
                            onPickDanji={(item) => handleSubmit(`${item.dong} ${item.name}이에요.`, { danji: item.kbId })}
                          />
                        ))}
                      </div>
                      <div className="home-chat__msg-actions">
                        <button type="button" aria-label="복사" onClick={() => copyMessage(splitFloorPlanCards(entry.content).text)}><CopyIcon /></button>
                        <button type="button" aria-label="다시 생성" onClick={regenerateReply}><RefreshIcon /></button>
                        <button type="button" aria-label="더 보기"><DotsIcon /></button>
                        {entry.ms != null && <span>{entry.ms}ms</span>}
                      </div>
                    </div>
                  ),
                )}

                {isResponding && activeConversation?.messages.at(-1)?.role !== "assistant" && (
                  <div className="home-chat__msg home-chat__msg--assistant">
                    <ThinkingOrbLabel design={askModel === "심층 분석" ? "solving" : "composing"}>
                      {askModel === "심층 분석" ? "깊이 분석하는 중…" : "답변을 준비하는 중…"}
                    </ThinkingOrbLabel>
                  </div>
                )}

                {!user && (loginPrompt || !activeConversation) && (
                  <div className="home-chat__login">
                    <span><SparkIcon /></span>
                    <h1>INDEX AI는 회원 전용입니다</h1>
                    <p>로그인하면 바로 답변해 드려요. 입력하신 질문은 로그인 후 자동으로 이어서 보냅니다.</p>
                    <p className="home-chat__login-limits">일반회원 하루 10회 · 사업자회원 하루 30회</p>
                    <div className="home-chat__login-actions">
                      <Link className="home-chat__login-primary" to="/mypage?redirect=/">로그인</Link>
                      <Link className="home-chat__login-secondary" to="/signup">회원가입</Link>
                    </div>
                  </div>
                )}
                {user && !activeConversation && !isResponding && (
                  <div className="home-chat__empty">
                    <span><SparkIcon /></span>
                    <h1>무엇이 궁금하신가요?</h1>
                    <p>주거공간의 설계와 시공, 자재 선택부터 새로운 기술 활용까지 질문해 보세요.</p>
                  </div>
                )}
              </div>
            </div>

            <form
              className={`home-chat__composer-box${attachDrag ? " is-dragging" : ""}`}
              onSubmit={(event) => {
                event.preventDefault();
                handleSubmit(message);
              }}
              onDragOver={(event) => {
                if (!user || !event.dataTransfer.types.includes("Files")) return;
                event.preventDefault();
                setAttachDrag(true);
              }}
              onDragLeave={() => setAttachDrag(false)}
              onDrop={(event) => {
                if (!user || !event.dataTransfer.files.length) return;
                event.preventDefault();
                setAttachDrag(false);
                void addAttachments([...event.dataTransfer.files]);
              }}
            >
              {(attachments.length > 0 || attachBusy) && (
                <div className="home-chat__attachments">
                  {attachments.map((item) => (
                    <div className="home-chat__attachment" key={item.id} title={item.name}>
                      {item.dataUrl ? <img src={item.dataUrl} alt="" /> : <span className="home-chat__attachment-type">{item.name.split(".").pop()?.toUpperCase()}</span>}
                      <span className="home-chat__attachment-name">{item.name}</span>
                      <button type="button" aria-label={`${item.name} 첨부 취소`} onClick={() => setAttachments((current) => current.filter((other) => other.id !== item.id))}>×</button>
                    </div>
                  ))}
                  {attachBusy && <span className="home-chat__attachment-busy">파일을 읽는 중…</span>}
                </div>
              )}
              {attachError && <p className="home-chat__attach-error" role="alert">{attachError}</p>}
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={submitOnEnter}
                onPaste={(event) => {
                  const pasted = [...event.clipboardData.files];
                  if (!user || !pasted.length) return;
                  event.preventDefault();
                  void addAttachments(pasted);
                }}
                placeholder={user ? "메시지를 입력하세요..." : "로그인 후 질문할 수 있습니다"}
                rows={1}
                aria-label="메시지 입력"
              />
              <div className="home-chat__composer-row">
                <div className="home-chat__composer-left">
                  <input
                    ref={attachInputRef}
                    type="file"
                    accept={CHAT_ATTACHMENT_ACCEPT}
                    multiple
                    hidden
                    onChange={(event) => {
                      void addAttachments([...(event.target.files ?? [])]);
                      event.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    className="home-chat__tool"
                    aria-label="이미지·파일 첨부"
                    title="이미지, PDF, TXT, Markdown 첨부"
                    disabled={!user || attachBusy || attachments.length >= MAX_ATTACHMENTS}
                    onClick={() => attachInputRef.current?.click()}
                  >
                    <PlusIcon />
                  </button>
                  <button type="button" className="home-chat__model" disabled>
                    <SparkIcon /> INDEX AI <ChevronDownIcon />
                  </button>
                </div>
                <div className="home-chat__composer-right">
                  <button type="button" className={`home-chat__tool${listening ? " is-listening" : ""}`} aria-label="음성 입력" onClick={toggleMic}>
                    <MicIcon />
                  </button>
                  <button type="submit" className="home-chat__send" aria-label="보내기" disabled={(!message.trim() && !attachments.length) || isResponding || attachBusy}>
                    <ArrowUpIcon />
                  </button>
                </div>
              </div>
            </form>
            {user && quota?.limit != null && (
              <p className={`home-chat__notice${quota.remaining === 0 ? " is-highlight" : ""}`}>
                {quota.remaining === 0
                  ? `오늘 질문 ${quota.limit}회를 모두 사용했습니다. 내일 0시에 다시 이용할 수 있습니다.`
                  : `오늘 남은 질문 ${quota.remaining}/${quota.limit}회`}
              </p>
            )}
            <p className="home-chat__disclaimer">INDEX AI는 실수할 수 있습니다. 중요한 정보는 전문가와 다시 확인하세요.</p>
          </div>

          <aside className={`home-chat__memory-panel${memoryOpen ? " is-open" : ""}`} aria-hidden={!memoryOpen}>
            <header>
              <div>
                <span><MemoryIcon /></span>
                <div><strong>저장된 기억</strong><small>Mem0가 대화에서 기억한 정보</small></div>
              </div>
              <button type="button" aria-label="기억 패널 닫기" onClick={() => setMemoryOpen(false)}>×</button>
            </header>
            <div className="home-chat__memory-list">
              {memoriesLoading ? (
                <p className="home-chat__memory-status">기억을 불러오는 중...</p>
              ) : memoryError ? (
                <p className="home-chat__memory-status is-error">{memoryError}</p>
              ) : memories.length === 0 ? (
                <p className="home-chat__memory-status">아직 저장된 기억이 없습니다. 대화를 이어가면 취향과 맥락을 기억합니다.</p>
              ) : (
                memories.map((memory) => (
                  <article key={memory.id}>
                    <p>{memory.memory}</p>
                    {memory.categories && memory.categories.length > 0 && (
                      <small>{memory.categories.join(" · ")}</small>
                    )}
                    <div>
                      <button type="button" onClick={() => void editMemory(memory)}>수정</button>
                      <button type="button" onClick={() => void deleteMemory(memory.id)}>삭제</button>
                    </div>
                  </article>
                ))
              )}
            </div>
            {memories.length > 0 && !memoriesLoading && (
              <button className="home-chat__memory-clear" type="button" onClick={() => void deleteMemory()}>
                모든 기억 삭제
              </button>
            )}
          </aside>
        </div>
      )}
    </section>
  );
}
