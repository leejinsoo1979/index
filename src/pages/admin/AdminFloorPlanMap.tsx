/**
 * 평면도 찾기 — the full-width map of every complex with floor plans. Clicking a pin opens its plans
 * on the left; the reviewing itself happens in 도면 내력벽 검수 (/admin/floorplans).
 */
import { useCallback, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { FloorPlanExplorer } from "../../components/FloorPlanExplorer";
import type { DanjiInfo, FloorPlanCards } from "../../components/FloorPlanCards";
import "./AdminFloorPlans.css";

export default function AdminFloorPlanMap() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<DanjiInfo[]>([]);
  const [focus, setFocus] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | undefined>(undefined);

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const token = await user?.getIdToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [user]);

  /** Cleared first, so the same complex reopens after its panel was closed. */
  function open(kbId: string) {
    setOpenId(undefined);
    window.setTimeout(() => setOpenId(kbId), 0);
  }

  async function search(event: FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/floorplans", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify({ action: "search", query }) });
      const payload = (await response.json().catch(() => ({}))) as { cards?: FloorPlanCards | null; error?: string };
      if (!response.ok) throw new Error(payload.error || "검색하지 못했습니다.");
      const found = payload.cards;
      if (!found) {
        setResults([]);
        setError("찾는 단지가 없습니다.");
      } else if (found.kind === "plans") {
        setResults([]);
        setFocus([found.danji.kbId]);
        open(found.danji.kbId);
      } else {
        setResults(found.items);
        setFocus(found.items.map((item) => item.kbId));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "검색하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fpf">
      <div className="fpf__bar">
        <form onSubmit={(event) => void search(event)}>
          <input type="search" value={query} placeholder="단지명과 동네 (예: 풍동 숲속마을 8단지)" aria-label="단지 검색" onChange={(event) => setQuery(event.target.value)} />
          <button type="submit" className="admin-btn admin-btn--primary" disabled={busy}>{busy ? "찾는 중…" : "찾기"}</button>
        </form>
        {error && <span className="fpf__error" role="alert">{error}</span>}
        {results.map((item) => (
          <button type="button" key={item.kbId} className="admin-btn fpf__result" onClick={() => { setFocus([item.kbId]); open(item.kbId); }}>{item.dong} {item.name}</button>
        ))}
      </div>
      <div className="fpf__map">
        <FloorPlanExplorer
          authHeaders={authHeaders}
          focus={focus}
          openId={openId}
          actionLabel="이 도면 검수하기"
          onAction={(danji, plan) => navigate(`/admin/floorplans?kbId=${encodeURIComponent(danji.kbId)}&plan=${encodeURIComponent(plan.id)}`)}
        />
      </div>
    </div>
  );
}
