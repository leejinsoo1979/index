import { useEffect, useState } from "react";
import { Brain, LoaderCircle, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { agentAuthorizedFetch } from "../../lib/agentApi";

type Memory = { id: string; memory?: string; categories?: string[]; created_at?: string };

export default function MemoryManager({ userId }: { userId: string }) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const response = await agentAuthorizedFetch(`/api/agent-memories?userId=${encodeURIComponent(userId)}`);
      const payload = await response.json() as { memories?: Memory[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "기억을 불러오지 못했습니다.");
      setMemories(payload.memories ?? []);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "기억을 불러오지 못했습니다."); } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [userId]);

  async function edit(memory: Memory) {
    const text = window.prompt("기억 내용을 수정하세요.", memory.memory ?? "")?.trim();
    if (!text || text === memory.memory) return;
    const response = await agentAuthorizedFetch("/api/agent-memories", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, memoryId: memory.id, text }) });
    if (response.ok) setMemories((current) => current.map((item) => item.id === memory.id ? { ...item, memory: text } : item));
  }

  async function remove(memoryId?: string) {
    if (!window.confirm(memoryId ? "이 기억을 삭제할까요?" : "저장된 모든 기억을 삭제할까요?")) return;
    const response = await agentAuthorizedFetch("/api/agent-memories", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, memoryId }) });
    if (response.ok) setMemories((current) => memoryId ? current.filter((memory) => memory.id !== memoryId) : []);
  }

  return <section className="agent-memory-manager"><header><div><Brain /><span><strong>Mem0 장기 기억</strong><small>현재 관리자 UID에 저장된 개인화 기억을 직접 관리합니다.</small></span></div><button type="button" onClick={() => void load()}><RefreshCw /> 새로고침</button></header>{loading ? <p className="agent-memory-manager__status"><LoaderCircle /> 기억을 불러오는 중</p> : error ? <p className="agent-memory-manager__status is-error">{error}</p> : memories.length ? <div>{memories.map((memory) => <article key={memory.id}><div><p>{memory.memory}</p>{memory.categories?.length ? <small>{memory.categories.join(" · ")}</small> : null}</div><button type="button" onClick={() => void edit(memory)}><Pencil /> 수정</button><button type="button" onClick={() => void remove(memory.id)}><Trash2 /> 삭제</button></article>)}<button className="agent-memory-manager__clear" type="button" onClick={() => void remove()}><Trash2 /> 모든 기억 삭제</button></div> : <p className="agent-memory-manager__status">아직 저장된 기억이 없습니다. Agent와 대화하면 관련 선호와 맥락이 축적됩니다.</p>}</section>;
}
