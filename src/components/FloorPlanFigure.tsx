/** Floor plan image pieces shared by the chat cards and the map's side panel. */
import { useEffect, useState } from "react";
import { Dialog } from "radix-ui";
import type { WallRecord, WallSegment } from "./FloorPlanCards";
import "./FloorPlanCards.css";

type AuthHeaders = () => Promise<Record<string, string>>;

export function useFloorPlanUrls(ids: string[], authHeaders: AuthHeaders) {
  const [data, setData] = useState<{ urls: Record<string, string>; walls: Record<string, WallRecord>; verified: Record<string, string> }>({ urls: {}, walls: {}, verified: {} });
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
      const payload = (await response.json()) as { urls?: Record<string, string>; walls?: Record<string, WallRecord>; verified?: Record<string, string> };
      if (active) setData({ urls: payload.urls ?? {}, walls: payload.walls ?? {}, verified: payload.verified ?? {} });
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
export function PlanFigure({ url, alt, walls, mirrored }: { url: string; alt: string; walls?: WallSegment[]; mirrored?: boolean }) {
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

export function WallNotice({ record }: { record: WallRecord }) {
  return <p className="fp-walls-note"><b>붉은 선: 협회 검수 내력벽</b> · {record.reviewer} · {record.updatedAt.slice(0, 10)}<br />표시되지 않은 벽도 내력벽일 수 있습니다. 철거 전 반드시 현장 구조 검토가 필요합니다.</p>;
}

/** Full-size plan; 대칭형 flips it left-right, as mirrored units in a complex are built. */
export function FloorPlanZoom({ url, label, mirrored, record, onMirror, onClose }: { url: string; label: string; mirrored: boolean; record?: WallRecord; onMirror?: (next: boolean) => void; onClose: () => void }) {
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
