import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  AiStateAnimation,
  AnimatedModeText,
  aiModes,
  aiShapeGlyph,
  aiShapes,
  modeColor,
  modeLabel,
  type AiMode,
  type AiShape,
} from "../components/AiStateAnimation";
import ParticleTitle from "../components/ParticleTitle";
import { useAuth } from "../auth/AuthContext";
import "./Home.css";

type ChatRole = "user" | "assistant";

interface ChatEntry {
  id: string;
  role: ChatRole;
  content: string;
  /** Response time shown under assistant replies. */
  ms?: number;
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
const ANONYMOUS_USER_KEY = "index-ai-anonymous-user";

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

function loadAnonymousUserId() {
  const saved = window.localStorage.getItem(ANONYMOUS_USER_KEY);
  if (saved) return saved;
  const id = `anonymous-${createId()}`;
  window.localStorage.setItem(ANONYMOUS_USER_KEY, id);
  return id;
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
  { name: "심층 분석", description: "추론이 필요한 하자·사례 분석" },
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

export default function Home() {
  const { user } = useAuth();
  const [mode, setMode] = useState<AiMode>("analyze");
  const [shape, setShape] = useState<AiShape>("clean");
  const modeAudioRef = useRef<HTMLAudioElement>(null);
  const shapeAudioRef = useRef<HTMLAudioElement>(null);
  const [message, setMessage] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>(loadConversations);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [isResponding, setIsResponding] = useState(false);
  const [listening, setListening] = useState(false);
  const [anonymousUserId] = useState(loadAnonymousUserId);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [memories, setMemories] = useState<StoredMemory[]>([]);
  const [memoriesLoading, setMemoriesLoading] = useState(false);
  const [memoryError, setMemoryError] = useState("");
  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  const requestControllerRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [askModel, setAskModel] = useState<(typeof askModels)[number]["name"]>(askModels[0].name);
  const [askModelOpen, setAskModelOpen] = useState(false);
  const askModelRef = useRef<HTMLDivElement>(null);
  const memoryUserId = user?.uid ?? anonymousUserId;

  useEffect(() => {
    if (!askModelOpen) return;
    function handlePointerDown(event: MouseEvent) {
      if (!askModelRef.current?.contains(event.target as Node)) setAskModelOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [askModelOpen]);

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeId) ?? null,
    [activeId, conversations],
  );

  useEffect(() => {
    if (modeAudioRef.current) modeAudioRef.current.volume = 0.45;
    if (shapeAudioRef.current) shapeAudioRef.current.volume = 0.45;
  }, []);

  useEffect(() => {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(conversations));
  }, [conversations]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [activeConversation?.messages.length, isResponding, chatOpen]);

  function playAudio(audio: HTMLAudioElement | null) {
    if (!audio) return;
    audio.currentTime = 0;
    audio.play().catch(() => undefined);
  }

  function handleModeChange(item: AiMode) {
    setMode(item);
    playAudio(modeAudioRef.current);
  }

  function handleShapeChange(item: AiShape) {
    setShape(item);
    playAudio(shapeAudioRef.current);
  }

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

  async function streamAssistantReply(conversationId: string, sourceMessages: ChatEntry[]) {
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: memoryUserId,
          messages: sourceMessages.map(({ role, content }) => ({ role, content })),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error || "AI 응답을 불러오지 못했습니다.");
      }
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

  function handleSubmit(value: string) {
    const question = (value || message).trim();
    if (!question || isResponding) return;

    const userEntry: ChatEntry = { id: createId(), role: "user", content: question };
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
    void streamAssistantReply(conversationId, sourceMessages);
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
      const response = await fetch(`/api/memories?userId=${encodeURIComponent(memoryUserId)}`);
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: memoryUserId, memoryId: memory.id, text }),
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: memoryUserId, memoryId }),
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
        onKeyDown={(event) => {
          if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault();
        }}
        placeholder="INDEX AI에게 질문하세요"
        aria-label="INDEX AI에게 질문"
        autoComplete="off"
      />
      <div className="home__ask-model-wrap" ref={askModelRef}>
        <button
          type="button"
          className="home__ask-model"
          aria-haspopup="listbox"
          aria-expanded={askModelOpen}
          onClick={() => setAskModelOpen((open) => !open)}
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
      <audio ref={modeAudioRef} src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/animation-menu-SBSEhsCLzhfXdw8sBI16r613N8tkGr.mp3" preload="auto" />
      <audio ref={shapeAudioRef} src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/select-forms-Y6f2sUOHatrkKO1eoSZpRtMTCUUzTD.mp3" preload="auto" />

      {!chatOpen ? (
        <>
          <AiStateAnimation mode={mode} shape={shape} />
          <div className="home__hero">
            <ParticleTitle text="index" className="home__logo-canvas" />
          </div>

          <div className="home__composer">{composer}</div>

          <div className="home__mode-rail" role="tablist" aria-label="Animation mode">
            {aiModes.map((item) => (
              <button key={item} type="button" className={`home__mode${mode === item ? " is-active" : ""}`} onClick={() => handleModeChange(item)} aria-pressed={mode === item}>
                {modeLabel(item)}
              </button>
            ))}
          </div>

          <div className="home__controls" aria-label="AI animation controls">
            <p className="home__mode-caption" aria-live="polite">
              <AnimatedModeText text={modeLabel(mode)} />
            </p>
            <div className="home__shape-tabs" role="tablist" aria-label="Particle shape">
              {aiShapes.map((item) => (
                <button key={item} type="button" className={`home__control${shape === item ? " is-active" : ""}`} onClick={() => handleShapeChange(item)} aria-pressed={shape === item} aria-label={item === "clean" ? "픽셀 효과 없음" : `${item} 픽셀`} title={item === "clean" ? "픽셀 효과 없음" : undefined}>
                  {aiShapeGlyph[item]}
                </button>
              ))}
            </div>
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
                      <div className="home-chat__bubble">{entry.content}</div>
                      <div className="home-chat__msg-actions home-chat__msg-actions--user">
                        <button type="button" aria-label="복사" onClick={() => copyMessage(entry.content)}><CopyIcon /></button>
                        <button type="button" aria-label="수정" onClick={() => setMessage(entry.content)}><PencilIcon /></button>
                      </div>
                    </div>
                  ) : (
                    <div className="home-chat__msg home-chat__msg--assistant" key={entry.id}>
                      <p>{entry.content}</p>
                      <div className="home-chat__msg-actions">
                        <button type="button" aria-label="복사" onClick={() => copyMessage(entry.content)}><CopyIcon /></button>
                        <button type="button" aria-label="다시 생성" onClick={regenerateReply}><RefreshIcon /></button>
                        <button type="button" aria-label="더 보기"><DotsIcon /></button>
                        {entry.ms != null && <span>{entry.ms}ms</span>}
                      </div>
                    </div>
                  ),
                )}

                {isResponding && activeConversation?.messages.at(-1)?.role !== "assistant" && (
                  <div className="home-chat__msg home-chat__msg--assistant">
                    <span className="home-chat__typing"><i /><i /><i /></span>
                  </div>
                )}

                {!activeConversation && !isResponding && (
                  <div className="home-chat__empty">
                    <span><SparkIcon /></span>
                    <h1>무엇이 궁금하신가요?</h1>
                    <p>실내건축 현장 사례, 하자 원인, 시공 기준을 질문해 보세요.</p>
                  </div>
                )}
              </div>
            </div>

            <form
              className="home-chat__composer-box"
              onSubmit={(event) => {
                event.preventDefault();
                handleSubmit(message);
              }}
            >
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    handleSubmit(message);
                  }
                }}
                placeholder="메시지를 입력하세요..."
                rows={1}
                aria-label="메시지 입력"
              />
              <div className="home-chat__composer-row">
                <div className="home-chat__composer-left">
                  <button type="button" className="home-chat__tool" aria-label="첨부 (준비 중)" disabled>
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
                  <button type="submit" className="home-chat__send" aria-label="보내기" disabled={!message.trim() || isResponding}>
                    <ArrowUpIcon />
                  </button>
                </div>
              </div>
            </form>
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
