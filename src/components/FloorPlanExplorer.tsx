/**
 * 지도로 도면 찾기 — the map with a side panel: click a pin and that complex's floor plans open on
 * the left, with type tabs, areas and the mirrored view. What the button does is up to the host
 * (start a consultation in chat, open the review editor in admin).
 */
import { useEffect, useState } from "react";
import { Dialog } from "radix-ui";
import type { DanjiInfo, FloorPlanCards, PlanCard } from "./FloorPlanCards";
import { FloorPlanZoom, PlanFigure, WallNotice, useFloorPlanUrls } from "./FloorPlanFigure";
import { FloorPlanMap } from "./FloorPlanMap";
import "./FloorPlanExplorer.css";

type AuthHeaders = () => Promise<Record<string, string>>;
type PlansCards = Extract<FloorPlanCards, { kind: "plans" }>;

function DanjiPanel({ kbId, authHeaders, actionLabel, actionDisabled, onAction, onClose }: { kbId: string; authHeaders: AuthHeaders; actionLabel: string; actionDisabled?: boolean; onAction: (danji: DanjiInfo, plan: PlanCard, mirrored: boolean) => void; onClose: () => void }) {
  const [cards, setCards] = useState<PlansCards | null>(null);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState(0);
  const [mirrored, setMirrored] = useState(false);
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    let active = true;
    setCards(null);
    setError("");
    setPicked(0);
    setMirrored(false);
    void (async () => {
      const response = await fetch("/api/floorplans", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify({ action: "danji", kbId }) });
      const payload = (await response.json().catch(() => ({}))) as { cards?: FloorPlanCards | null; error?: string };
      if (!active) return;
      if (!response.ok) setError(payload.error || "도면을 불러오지 못했습니다.");
      else if (payload.cards?.kind === "plans") setCards(payload.cards);
      else setError("이 단지의 도면을 찾지 못했습니다.");
    })().catch(() => active && setError("도면을 불러오지 못했습니다."));
    return () => {
      active = false;
    };
    // authHeaders is recreated each render; the complex decides when to fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kbId]);

  const { urls, walls, verified } = useFloorPlanUrls(cards ? cards.plans.map((plan) => plan.id) : [], authHeaders);
  const plan = cards?.plans[picked];
  const url = plan ? urls[plan.id] : undefined;
  const record = plan ? walls[plan.id] : undefined;
  const surveyed = plan ? verified[plan.id] : undefined;

  return (
    <aside className="fpx-panel" aria-label="단지 도면">
      <button type="button" className="fpx-panel__close" aria-label="도면 닫기" onClick={onClose}>×</button>
      {error ? <p className="fpx-panel__empty">{error}</p> : !cards || !plan ? <p className="fpx-panel__empty">도면을 불러오는 중입니다…</p> : (
        <>
          <header className="fpx-panel__head">
            <h3>{cards.danji.name}</h3>
            <p>{cards.danji.region} {cards.danji.dong}</p>
          </header>

          <div className="fpx-types" role="tablist" aria-label="평면도 타입">
            {cards.plans.map((item, index) => (
              <button type="button" role="tab" key={item.id} aria-selected={index === picked} onClick={() => setPicked(index)}>
                {item.type}<small>{item.exclusive}㎡</small>
              </button>
            ))}
          </div>

          <button type="button" className="fpx-plan" aria-label={`${plan.type} 평면도 크게 보기`} onClick={() => url && setZoom(true)}>
            {url ? <PlanFigure url={url} alt={`${cards.danji.name} ${plan.type} 평면도`} walls={record?.walls} mirrored={mirrored} /> : null}
          </button>

          <dl className="fpx-facts">
            <div><dt>전용면적</dt><dd>{plan.exclusive}㎡</dd></div>
            <div><dt>공급면적</dt><dd>{plan.supply}㎡ · {plan.pyeong}평</dd></div>
          </dl>

          {plan.suspect && !surveyed && <p className="fpx-warn">다른 타입과 도면이 같습니다. 올바른 도면인지 확인이 필요합니다.</p>}
          {surveyed && <p className="fpx-note"><b>실측 도면</b> · {surveyed}</p>}
          {record && <WallNotice record={record} />}

          <div className="fpx-actions">
            <button type="button" aria-pressed={mirrored} onClick={() => setMirrored((value) => !value)}>대칭형</button>
            <button type="button" className="is-primary" disabled={actionDisabled} onClick={() => onAction(cards.danji, plan, mirrored)}>{actionLabel}</button>
          </div>

          {zoom && url && <FloorPlanZoom url={url} label={`${cards.danji.name} ${plan.type}${mirrored ? " 대칭형" : ""}`} mirrored={mirrored} record={record} onMirror={setMirrored} onClose={() => setZoom(false)} />}
        </>
      )}
    </aside>
  );
}

export function FloorPlanExplorer({ authHeaders, focus, openId, actionLabel, actionDisabled, onAction }: { authHeaders: AuthHeaders; focus?: string[]; openId?: string; actionLabel: string; actionDisabled?: boolean; onAction: (danji: DanjiInfo, plan: PlanCard, mirrored: boolean) => void }) {
  const [current, setCurrent] = useState<string | null>(openId ?? null);
  useEffect(() => {
    if (openId) setCurrent(openId);
  }, [openId]);

  return (
    <div className="fpx">
      {current && <DanjiPanel kbId={current} authHeaders={authHeaders} actionLabel={actionLabel} actionDisabled={actionDisabled} onAction={onAction} onClose={() => setCurrent(null)} />}
      <div className="fpx__map">
        <FloorPlanMap authHeaders={authHeaders} focus={focus} activeId={current ?? undefined} onSelect={(spot) => setCurrent(spot.kbId)} />
      </div>
    </div>
  );
}

/** The map over a chat: picking a plan continues the conversation with it. */
export function FloorPlanMapDialog({ authHeaders, focus, openId, disabled, onPick, onClose }: { authHeaders: AuthHeaders; focus: string[]; openId?: string; disabled: boolean; onPick: (danji: DanjiInfo, plan: PlanCard, mirrored: boolean) => void; onClose: () => void }) {
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fp-zoom__overlay" />
        <Dialog.Content className="fp-mapdlg" aria-describedby={undefined}>
          <Dialog.Title className="fp-mapdlg__bar">
            <span>지도로 도면 찾기</span>
            <Dialog.Close asChild><button type="button">닫기</button></Dialog.Close>
          </Dialog.Title>
          <div className="fp-mapdlg__map">
            <FloorPlanExplorer authHeaders={authHeaders} focus={focus} openId={openId} actionLabel="이 도면으로 상담" actionDisabled={disabled} onAction={(danji, plan, mirrored) => { onPick(danji, plan, mirrored); onClose(); }} />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
