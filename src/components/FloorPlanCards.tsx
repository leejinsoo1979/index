/**
 * Floor plan picker inside the INDEX AI chat. The server embeds cards in the answer as an HTML
 * comment (api/_floorplans.ts); images come from short-lived signed URLs fetched per card list.
 */
import { useState } from "react";
import { FloorPlanMapDialog } from "./FloorPlanExplorer";
import { FloorPlanZoom, PlanFigure, WallNotice, useFloorPlanUrls } from "./FloorPlanFigure";
import { floorPlanMapAvailable } from "./FloorPlanMap";
import "./FloorPlanCards.css";

export type DanjiInfo = { kbId: string; name: string; region: string; dong: string; count: number };
export type PlanCard = { id: string; type: string; pyeong: number; supply: number; exclusive: number; suspect: boolean };
export type FloorPlanCards = { kind: "plans"; danji: DanjiInfo; plans: PlanCard[] } | { kind: "danji"; items: DanjiInfo[] };
type AuthHeaders = () => Promise<Record<string, string>>;
export type WallSegment = { x1: number; y1: number; x2: number; y2: number };
export type WallRecord = { planId: string; status: "draft" | "approved"; walls: WallSegment[]; reviewer: string; evidence: string; updatedAt: string; label?: string };

/** Also hides a marker still arriving, so raw JSON never flashes in the answer. */
export function splitFloorPlanCards(content: string): { text: string; cards: FloorPlanCards[] } {
  const cards: FloorPlanCards[] = [];
  const text = content
    .replace(/<!--floorplans ([\s\S]*?)-->/g, (_, json: string) => {
      try {
        cards.push(JSON.parse(json) as FloorPlanCards);
      } catch {
        /* malformed marker: show nothing */
      }
      return "";
    })
    .replace(/<!--floorplans[\s\S]*$/, "")
    .trim();
  return { text, cards };
}

/** A member's pick, kept on their message: `<!--floorplan-pick id|label-->`. */
export function floorPlanPickMarker(id: string, label: string) {
  return `<!--floorplan-pick ${id}|${label.replace(/[<>|-]/g, " ")}-->`;
}
export function floorPlanPickOf(content: string): { id: string; label: string } | null {
  const found = content.match(/<!--floorplan-pick (\d{1,12})\|([^>]*?)-->/);
  return found ? { id: found[1]!, label: found[2]!.trim() } : null;
}

function PlanCardItem({ danji, plan, url, record, surveyed, disabled, onPick }: { danji: DanjiInfo; plan: PlanCard; url?: string; record?: WallRecord; surveyed?: string; disabled: boolean; onPick: (mirrored: boolean) => void }) {
  const [mirrored, setMirrored] = useState(false);
  const [zoom, setZoom] = useState(false);
  return (
    <div className="fp-card" role="listitem">
      <button type="button" className="fp-card__img" aria-label={`${plan.type} 평면도 크게 보기`} onClick={() => url && setZoom(true)}>
        {url ? <PlanFigure url={url} alt={`${plan.type} 평면도`} walls={record?.walls} mirrored={mirrored} /> : null}
      </button>
      <strong>{plan.type}{mirrored ? " 대칭형" : ""}</strong>
      <span className="fp-card__meta">전용 {plan.exclusive}㎡ · 공급 {plan.pyeong}평</span>
      {plan.suspect && !surveyed && <em>다른 타입과 도면이 같음</em>}
      {surveyed && <span className="fp-card__surveyed" title={surveyed}>실측 도면</span>}
      {record && <span className="fp-card__verified">내력벽 협회 검수 완료</span>}
      <div className="fp-card__actions">
        <button type="button" aria-pressed={mirrored} onClick={() => setMirrored((value) => !value)}>대칭형</button>
        <button type="button" className="is-primary" disabled={disabled} onClick={() => onPick(mirrored)}>이 도면으로 상담</button>
      </div>
      {zoom && url && <FloorPlanZoom url={url} label={`${danji.name} ${plan.type}${mirrored ? " 대칭형" : ""}`} mirrored={mirrored} record={record} onMirror={setMirrored} onClose={() => setZoom(false)} />}
    </div>
  );
}

export function FloorPlanCardList({
  cards,
  disabled,
  authHeaders,
  onPickPlan,
  onPickDanji,
}: {
  cards: FloorPlanCards;
  disabled: boolean;
  authHeaders: AuthHeaders;
  onPickPlan: (danji: DanjiInfo, plan: PlanCard, mirrored: boolean) => void;
  onPickDanji: (item: DanjiInfo) => void;
}) {
  const { urls, walls, verified } = useFloorPlanUrls(cards.kind === "plans" ? cards.plans.map((plan) => plan.id) : [], authHeaders);
  const [mapOpen, setMapOpen] = useState(false);

  const mapButton = floorPlanMapAvailable ? <button type="button" className="fp-map-open" disabled={disabled} onClick={() => setMapOpen(true)}>지도로 보기</button> : null;
  const mapDialog = mapOpen ? (
    <FloorPlanMapDialog
      authHeaders={authHeaders}
      focus={cards.kind === "plans" ? [cards.danji.kbId] : cards.items.map((item) => item.kbId)}
      openId={cards.kind === "plans" ? cards.danji.kbId : undefined}
      disabled={disabled}
      onPick={onPickPlan}
      onClose={() => setMapOpen(false)}
    />
  ) : null;

  if (cards.kind === "danji") {
    return (
      <>
        <div className="fp-danji" role="list" aria-label="단지 선택">
          {cards.items.map((item) => (
            <button type="button" key={item.kbId} disabled={disabled} onClick={() => onPickDanji(item)}>
              <strong>{item.name}</strong>
              <span>{item.region} {item.dong} · 도면 {item.count}개</span>
            </button>
          ))}
        </div>
        {mapButton}
        {mapDialog}
      </>
    );
  }

  return (
    <div className="fp-plans">
      <div className="fp-plans__top">
        <p className="fp-plans__head">{cards.danji.region} {cards.danji.dong} <strong>{cards.danji.name}</strong></p>
        {mapButton}
      </div>
      {mapDialog}
      <div className="fp-plans__grid" role="list" aria-label="평면도 타입 선택">
        {cards.plans.map((plan) => (
          <PlanCardItem key={plan.id} danji={cards.danji} plan={plan} url={urls[plan.id]} record={walls[plan.id]} surveyed={verified[plan.id]} disabled={disabled} onPick={(mirrored) => onPickPlan(cards.danji, plan, mirrored)} />
        ))}
      </div>
      <p className="fp-plans__note">도면을 누르면 크게 볼 수 있습니다. 대칭형은 기본형을 좌우로 뒤집어 보여 주므로 도면 글자도 뒤집혀 보입니다. 찾는 도면이 없으면 평면도 이미지를 첨부해 주세요.</p>
    </div>
  );
}

export function FloorPlanImage({ id, label, authHeaders }: { id: string; label: string; authHeaders: AuthHeaders }) {
  const { urls, walls } = useFloorPlanUrls([id], authHeaders);
  const [zoom, setZoom] = useState(false);
  const mirrored = label.includes("대칭형");
  return (
    <figure className="fp-picked">
      {urls[id] ? (
        <button type="button" className="fp-picked__open" aria-label={`${label} 평면도 크게 보기`} onClick={() => setZoom(true)}>
          <PlanFigure url={urls[id]!} alt={`${label} 평면도`} walls={walls[id]?.walls} mirrored={mirrored} />
        </button>
      ) : (
        <span className="fp-picked__blank" />
      )}
      <figcaption>{label}</figcaption>
      {walls[id] && <WallNotice record={walls[id]!} />}
      {zoom && urls[id] && <FloorPlanZoom url={urls[id]!} label={label} mirrored={mirrored} record={walls[id]} onClose={() => setZoom(false)} />}
    </figure>
  );
}
