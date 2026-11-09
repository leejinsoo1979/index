/**
 * Floor plan picker inside the INDEX AI chat. The server embeds cards in the answer as an HTML
 * comment (api/_floorplans.ts); images come from short-lived signed URLs fetched per card list.
 */
import { useEffect, useState } from "react";
import { Dialog } from "radix-ui";
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

function useFloorPlanUrls(ids: string[], authHeaders: AuthHeaders) {
  const [data, setData] = useState<{ urls: Record<string, string>; walls: Record<string, WallRecord> }>({ urls: {}, walls: {} });
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
      const payload = (await response.json()) as { urls?: Record<string, string>; walls?: Record<string, WallRecord> };
      if (active) setData({ urls: payload.urls ?? {}, walls: payload.walls ?? {} });
    })().catch(() => undefined);
    return () => {
      active = false;
    };
    // authHeaders is recreated each render; the ids decide when to fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return data;
}

/** Plan image with reviewed bearing walls drawn in the image's own coordinates; flips as one piece. */
function PlanFigure({ url, alt, walls, mirrored }: { url: string; alt: string; walls?: WallSegment[]; mirrored?: boolean }) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  return (
    <span className={`fp-figure${mirrored ? " fp-mirror" : ""}`}>
      <img src={url} alt={alt} loading="lazy" onLoad={(event) => setSize({ w: event.currentTarget.naturalWidth, h: event.currentTarget.naturalHeight })} />
      {size && walls?.length ? (
        <svg viewBox={`0 0 ${size.w} ${size.h}`} preserveAspectRatio="xMidYMid meet" aria-hidden>
          {walls.map((wall, index) => (
            <line key={index} x1={wall.x1 * size.w} y1={wall.y1 * size.h} x2={wall.x2 * size.w} y2={wall.y2 * size.h} />
          ))}
        </svg>
      ) : null}
    </span>
  );
}

function WallNotice({ record }: { record: WallRecord }) {
  return <p className="fp-walls-note"><b>붉은 선: 협회 검수 내력벽</b> · {record.reviewer} · {record.updatedAt.slice(0, 10)}<br />표시되지 않은 벽도 내력벽일 수 있습니다. 철거 전 반드시 현장 구조 검토가 필요합니다.</p>;
}

/** Full-size plan; 대칭형 flips it left-right, as mirrored units in a complex are built. */
function FloorPlanZoom({ url, label, mirrored, record, onMirror, onClose }: { url: string; label: string; mirrored: boolean; record?: WallRecord; onMirror?: (next: boolean) => void; onClose: () => void }) {
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fp-zoom__overlay" />
        <Dialog.Content className="fp-zoom" aria-describedby={undefined} onClick={(event) => event.target === event.currentTarget && onClose()}>
          <Dialog.Title className="fp-zoom__bar">
            <span>{label}</span>
            {onMirror && <button type="button" aria-pressed={mirrored} onClick={() => onMirror(!mirrored)}>대칭형</button>}
            <Dialog.Close asChild><button type="button">닫기</button></Dialog.Close>
          </Dialog.Title>
          <PlanFigure url={url} alt={`${label} 평면도`} walls={record?.walls} mirrored={mirrored} />
          {record && <WallNotice record={record} />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function PlanCardItem({ danji, plan, url, record, disabled, onPick }: { danji: DanjiInfo; plan: PlanCard; url?: string; record?: WallRecord; disabled: boolean; onPick: (mirrored: boolean) => void }) {
  const [mirrored, setMirrored] = useState(false);
  const [zoom, setZoom] = useState(false);
  return (
    <div className="fp-card" role="listitem">
      <button type="button" className="fp-card__img" aria-label={`${plan.type} 평면도 크게 보기`} onClick={() => url && setZoom(true)}>
        {url ? <PlanFigure url={url} alt={`${plan.type} 평면도`} walls={record?.walls} mirrored={mirrored} /> : null}
      </button>
      <strong>{plan.type}{mirrored ? " 대칭형" : ""}</strong>
      <span className="fp-card__meta">전용 {plan.exclusive}㎡ · 공급 {plan.pyeong}평</span>
      {plan.suspect && <em>다른 타입과 도면이 같음</em>}
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
  const { urls, walls } = useFloorPlanUrls(cards.kind === "plans" ? cards.plans.map((plan) => plan.id) : [], authHeaders);

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
          <PlanCardItem key={plan.id} danji={cards.danji} plan={plan} url={urls[plan.id]} record={walls[plan.id]} disabled={disabled} onPick={(mirrored) => onPickPlan(cards.danji, plan, mirrored)} />
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
