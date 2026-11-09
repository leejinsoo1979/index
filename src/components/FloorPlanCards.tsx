/**
 * Floor plan picker inside the INDEX AI chat. The server embeds cards in the answer as an HTML
 * comment (api/_floorplans.ts); images come from short-lived signed URLs fetched per card list.
 */
import { useEffect, useState } from "react";
import "./FloorPlanCards.css";

export type DanjiInfo = { kbId: string; name: string; region: string; dong: string; count: number };
export type PlanCard = { id: string; type: string; pyeong: number; supply: number; exclusive: number; suspect: boolean };
export type FloorPlanCards = { kind: "plans"; danji: DanjiInfo; plans: PlanCard[] } | { kind: "danji"; items: DanjiInfo[] };
type AuthHeaders = () => Promise<Record<string, string>>;

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

function useFloorPlanUrls(ids: string[], authHeaders: AuthHeaders) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const key = ids.join(",");
  useEffect(() => {
    if (!key) return;
    let active = true;
    void (async () => {
      const response = await fetch("/api/floorplans", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ ids: key.split(",") }),
      });
      if (!response.ok) return;
      const data = (await response.json()) as { urls?: Record<string, string> };
      if (active) setUrls(data.urls ?? {});
    })().catch(() => undefined);
    return () => {
      active = false;
    };
    // authHeaders is recreated each render; the ids decide when to fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return urls;
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
  onPickPlan: (danji: DanjiInfo, plan: PlanCard) => void;
  onPickDanji: (item: DanjiInfo) => void;
}) {
  const urls = useFloorPlanUrls(cards.kind === "plans" ? cards.plans.map((plan) => plan.id) : [], authHeaders);

  if (cards.kind === "danji") {
    return (
      <div className="fp-danji" role="list" aria-label="단지 선택">
        {cards.items.map((item) => (
          <button type="button" key={item.kbId} disabled={disabled} onClick={() => onPickDanji(item)}>
            <strong>{item.name}</strong>
            <span>{item.region} {item.dong} · 도면 {item.count}개</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="fp-plans">
      <p className="fp-plans__head">{cards.danji.region} {cards.danji.dong} <strong>{cards.danji.name}</strong></p>
      <div className="fp-plans__grid" role="list" aria-label="평면도 타입 선택">
        {cards.plans.map((plan) => (
          <button type="button" key={plan.id} disabled={disabled} onClick={() => onPickPlan(cards.danji, plan)}>
            <span className="fp-plans__img">{urls[plan.id] ? <img src={urls[plan.id]} alt={`${plan.type} 평면도`} loading="lazy" /> : null}</span>
            <strong>{plan.type}</strong>
            <span>전용 {plan.exclusive}㎡ · 공급 {plan.pyeong}평</span>
            {plan.suspect && <em>다른 타입과 도면이 같음</em>}
          </button>
        ))}
      </div>
      <p className="fp-plans__note">기본형 기준입니다. 찾는 도면이 없으면 가지고 계신 평면도 이미지를 첨부해 주세요.</p>
    </div>
  );
}

export function FloorPlanImage({ id, label, authHeaders }: { id: string; label: string; authHeaders: AuthHeaders }) {
  const urls = useFloorPlanUrls([id], authHeaders);
  return <figure className="fp-picked">{urls[id] ? <a href={urls[id]} target="_blank" rel="noreferrer"><img src={urls[id]} alt={`${label} 평면도`} /></a> : <span className="fp-picked__blank" />}<figcaption>{label}</figcaption></figure>;
}
