/**
 * 도면 내력벽 검수 — a reviewer draws bearing walls over a floor plan from the structural drawings.
 * Only "검수 완료" marks reach members; one review serves every unit of that type, and the mirrored
 * view flips with it. Stored in R2 via api/floorplans.ts.
 */
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useAuth } from "../../auth/AuthContext";
import { CustomSelect } from "../../components/ui/custom-select";
import type { DanjiInfo, FloorPlanCards, PlanCard, WallRecord, WallSegment } from "../../components/FloorPlanCards";
import "./AdminFloorPlans.css";

const STATUS = [
  { value: "draft", label: "초안 (회원에게 안 보임)" },
  { value: "approved", label: "검수 완료 (회원에게 표시)" },
];

export default function AdminFloorPlans() {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [cards, setCards] = useState<FloorPlanCards | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<{ plan: PlanCard; danji: DanjiInfo } | null>(null);
  const [reviewed, setReviewed] = useState<WallRecord[]>([]);

  const call = useCallback(async <T,>(body: Record<string, unknown>): Promise<T> => {
    const token = await user?.getIdToken();
    const response = await fetch("/api/floorplans", { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
    if (!response.ok) throw new Error(payload.error || "요청을 처리하지 못했습니다.");
    return payload;
  }, [user]);

  const refreshReviewed = useCallback(() => {
    void call<{ records: WallRecord[] }>({ action: "reviewed" }).then((r) => setReviewed(r.records)).catch(() => undefined);
  }, [call]);
  useEffect(refreshReviewed, [refreshReviewed]);

  async function run(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      setCards((await call<{ cards: FloorPlanCards | null }>(body)).cards);
    } catch (e) {
      setError(e instanceof Error ? e.message : "검색하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-page">
      <header className="admin-page__head">
        <h1>도면 내력벽 검수</h1>
        <p>구조도면을 근거로 도면 위에 내력벽을 표시합니다. 검수 완료한 표시만 챗봇 도면에 나타나며, 같은 타입의 모든 세대와 대칭형에 함께 적용됩니다.</p>
      </header>

      <form className="fpr-search" onSubmit={(event) => { event.preventDefault(); if (query.trim()) void run({ action: "search", query }); }}>
        <input type="search" value={query} placeholder="단지명과 동네 (예: 풍동 숲속마을 8단지)" onChange={(event) => setQuery(event.target.value)} />
        <button type="submit" className="admin-btn admin-btn--primary" disabled={busy}>{busy ? "찾는 중…" : "찾기"}</button>
      </form>
      {error && <p className="admin-note admin-note--error" role="alert">{error}</p>}
      {cards === null && <p className="admin-note">찾는 단지가 없습니다.</p>}

      {cards?.kind === "danji" && (
        <div className="fpr-chips">
          {cards.items.map((item) => (
            <button type="button" key={item.kbId} className="admin-btn" onClick={() => void run({ action: "danji", kbId: item.kbId })}>{item.dong} {item.name}</button>
          ))}
        </div>
      )}
      {cards?.kind === "plans" && (
        <div className="fpr-chips">
          <span className="fpr-chips__title">{cards.danji.dong} {cards.danji.name}</span>
          {cards.plans.map((plan) => (
            <button type="button" key={plan.id} className={`admin-btn${selected?.plan.id === plan.id ? " admin-btn--primary" : ""}`} onClick={() => setSelected({ plan, danji: cards.danji })}>{plan.type} · 전용 {plan.exclusive}㎡</button>
          ))}
        </div>
      )}

      {selected ? (
        <WallEditor key={selected.plan.id} title={`${selected.danji.name} ${selected.plan.type}`} id={selected.plan.id} suspect={selected.plan.suspect} call={call} onSaved={refreshReviewed} />
      ) : null}

      <section className="admin-card fpr-list">
        <h2>검수 기록 <small>{reviewed.length}건</small></h2>
        {reviewed.length === 0 ? <p className="admin-table__empty">아직 검수한 도면이 없습니다.</p> : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>도면</th><th>상태</th><th>검수자</th><th>근거</th><th>수정일</th></tr></thead>
              <tbody>
                {reviewed.slice(0, 200).map((r) => (
                  <tr key={r.planId}><td>{r.label}</td><td>{r.status === "approved" ? "검수 완료" : "초안"}</td><td>{r.reviewer || "—"}</td><td>{r.evidence || "—"}</td><td>{r.updatedAt.slice(0, 10)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

type Call = <T>(body: Record<string, unknown>) => Promise<T>;

function WallEditor({ id, title, suspect, call, onSaved }: { id: string; title: string; suspect: boolean; call: Call; onSaved: () => void }) {
  const [url, setUrl] = useState("");
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [walls, setWalls] = useState<WallSegment[]>([]);
  const [status, setStatus] = useState("draft");
  const [reviewer, setReviewer] = useState("");
  const [evidence, setEvidence] = useState("");
  const [picked, setPicked] = useState<number | null>(null);
  const [draft, setDraft] = useState<WallSegment | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    let active = true;
    void call<{ record: WallRecord | null; url: string }>({ action: "getWalls", id }).then(({ record, url: image }) => {
      if (!active) return;
      setUrl(image);
      setWalls(record?.walls ?? []);
      setStatus(record?.status ?? "draft");
      setReviewer(record?.reviewer ?? "");
      setEvidence(record?.evidence ?? "");
    }).catch((e: unknown) => setMessage(e instanceof Error ? e.message : "도면을 불러오지 못했습니다."));
    return () => { active = false; };
  }, [id, call]);

  const removePicked = useCallback(() => {
    setWalls((current) => current.filter((_, index) => index !== picked));
    setPicked(null);
  }, [picked]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.key === "Delete" || event.key === "Backspace") && picked !== null && !(event.target as HTMLElement).matches("input,textarea")) {
        event.preventDefault();
        removePicked();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [picked, removePicked]);

  function toFraction(event: ReactPointerEvent) {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix || !size) return null;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return { x: Math.min(1, Math.max(0, point.x / size.w)), y: Math.min(1, Math.max(0, point.y / size.h)) };
  }

  /** Walls run straight on these drawings, so a nearly level or plumb stroke snaps. */
  function snapped(x1: number, y1: number, x2: number, y2: number): WallSegment {
    if (!size) return { x1, y1, x2, y2 };
    const dx = Math.abs(x2 - x1) * size.w;
    const dy = Math.abs(y2 - y1) * size.h;
    if (dy < dx * 0.18) return { x1, y1, x2, y2: y1 };
    if (dx < dy * 0.18) return { x1, y1, x2: x1, y2 };
    return { x1, y1, x2, y2 };
  }

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      await call({ action: "saveWalls", id, walls, status, reviewer, evidence });
      setMessage(status === "approved" ? "검수 완료로 저장했습니다. 챗봇 도면에 표시됩니다." : "초안으로 저장했습니다. 회원에게는 보이지 않습니다.");
      onSaved();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="admin-card fpr-editor">
      <div className="fpr-canvas">
        {url ? <img src={url} alt={`${title} 평면도`} draggable={false} onLoad={(event) => setSize({ w: event.currentTarget.naturalWidth, h: event.currentTarget.naturalHeight })} /> : <div className="fpr-canvas__blank" />}
        {size && (
          <svg
            ref={svgRef}
            viewBox={`0 0 ${size.w} ${size.h}`}
            onPointerDown={(event) => {
              const point = toFraction(event);
              if (!point) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              setPicked(null);
              setDraft({ x1: point.x, y1: point.y, x2: point.x, y2: point.y });
            }}
            onPointerMove={(event) => {
              if (!draft) return;
              const point = toFraction(event);
              if (point) setDraft(snapped(draft.x1, draft.y1, point.x, point.y));
            }}
            onPointerUp={() => {
              if (draft && size && Math.hypot((draft.x2 - draft.x1) * size.w, (draft.y2 - draft.y1) * size.h) > 8) setWalls((current) => [...current, draft]);
              setDraft(null);
            }}
          >
            {walls.map((wall, index) => (
              <g key={index}>
                <line className={`fpr-wall${picked === index ? " is-picked" : ""}`} x1={wall.x1 * size.w} y1={wall.y1 * size.h} x2={wall.x2 * size.w} y2={wall.y2 * size.h} />
                <line className="fpr-hit" x1={wall.x1 * size.w} y1={wall.y1 * size.h} x2={wall.x2 * size.w} y2={wall.y2 * size.h} onPointerDown={(event) => { event.stopPropagation(); setPicked(index); }} />
              </g>
            ))}
            {draft && <line className="fpr-wall is-draft" x1={draft.x1 * size.w} y1={draft.y1 * size.h} x2={draft.x2 * size.w} y2={draft.y2 * size.h} />}
          </svg>
        )}
      </div>

      <aside className="fpr-side">
        <h2>{title}</h2>
        {suspect && <p className="admin-note admin-note--error">이 도면은 같은 단지의 면적이 다른 타입과 이미지가 같습니다. 올바른 도면인지 먼저 확인해 주세요.</p>}
        <p className="fpr-help">내력벽을 따라 드래그하면 선이 그려집니다. 선을 누르고 Delete를 누르면 지워집니다.</p>
        <div className="fpr-tools">
          <button type="button" className="admin-btn" disabled={!walls.length} onClick={() => { setWalls((c) => c.slice(0, -1)); setPicked(null); }}>되돌리기</button>
          <button type="button" className="admin-btn admin-btn--danger" disabled={picked === null} onClick={removePicked}>선택한 선 삭제</button>
          <span>{walls.length}개 구간</span>
        </div>
        <label className="fpr-field"><span>상태</span><CustomSelect options={STATUS} value={status} onValueChange={setStatus} /></label>
        <label className="fpr-field"><span>검수자 (이름·자격)</span><input value={reviewer} placeholder="예: 홍길동 구조기술사" onChange={(event) => setReviewer(event.target.value)} /></label>
        <label className="fpr-field"><span>근거 자료</span><textarea rows={3} value={evidence} placeholder="예: 관리사무소 제공 구조평면도 S-101 (2024.5)" onChange={(event) => setEvidence(event.target.value)} /></label>
        <button type="button" className="admin-btn admin-btn--primary fpr-save" disabled={saving} onClick={() => void save()}>{saving ? "저장 중…" : "저장"}</button>
        {message && <p className="admin-note" role="status">{message}</p>}
      </aside>
    </section>
  );
}
