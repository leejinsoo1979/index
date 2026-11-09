import { useCallback, useEffect, useMemo, useState } from "react";
import { FiExternalLink, FiX } from "react-icons/fi";
import { safeUrl, type BookAction, type Flipbook } from "../../lib/flipbooks";
import { VideoPlayer } from "./BookPageView";
import "./Flipbook.css";

export type BookRuntime = {
  run: (actions: BookAction[]) => void;
  /** Elements shown or hidden by actions since the book opened. */
  hidden: Record<string, boolean>;
  /** Bumped to replay an element's entrance animation. */
  plays: Record<string, number>;
};

export type PopupAction = Extract<BookAction, { kind: "popupWeb" | "popupImage" | "popupMessage" | "popupVideo" }>;

/** Carries out element actions; shared by the public viewer and the editor's interaction preview. */
export function useBookRuntime(book: Flipbook, goToPage: (pageIndex: number) => void) {
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [plays, setPlays] = useState<Record<string, number>>({});
  const [popup, setPopup] = useState<PopupAction | null>(null);

  const startsHidden = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const page of book.pages) for (const element of page.elements) map[element.id] = Boolean(element.hidden);
    return map;
  }, [book.pages]);

  const run = useCallback((actions: BookAction[]) => {
    for (const action of actions) {
      switch (action.kind) {
        case "url": {
          const href = safeUrl(action.url);
          if (href) window.open(href, "_blank", "noopener,noreferrer");
          break;
        }
        case "tel":
          if (action.phone.trim()) window.location.href = `tel:${action.phone.replace(/[^\d+]/g, "")}`;
          break;
        case "page": {
          const index = book.pages.findIndex((page) => page.id === action.pageId);
          if (index >= 0) goToPage(index);
          break;
        }
        case "toggle":
          setHidden((current) => ({ ...current, [action.targetId]: !(current[action.targetId] ?? startsHidden[action.targetId]) }));
          break;
        case "play":
          setHidden((current) => ({ ...current, [action.targetId]: false }));
          setPlays((current) => ({ ...current, [action.targetId]: (current[action.targetId] ?? 0) + 1 }));
          break;
        default:
          setPopup(action);
      }
    }
  }, [book.pages, goToPage, startsHidden]);

  const runtime = useMemo<BookRuntime>(() => ({ run, hidden, plays }), [run, hidden, plays]);
  const closePopup = useCallback(() => setPopup(null), []);
  return { runtime, popup, closePopup };
}

export function BookPopup({ action, onClose }: { action: PopupAction; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const web = action.kind === "popupWeb" ? safeUrl(action.url) : null;

  return (
    <div className="fb-popup" role="dialog" aria-modal="true" onClick={onClose}>
      <div className={`fb-popup__box fb-popup__box--${action.kind}`} onClick={(event) => event.stopPropagation()}>
        <div className="fb-popup__tools">
          {web && <a href={web} target="_blank" rel="noopener noreferrer" aria-label="새 창으로 열기"><FiExternalLink /></a>}
          <button type="button" aria-label="닫기" onClick={onClose}><FiX /></button>
        </div>
        {action.kind === "popupImage" && action.src && <img src={action.src} alt="" />}
        {action.kind === "popupMessage" && <div className="fb-popup__message"><h3>{action.title}</h3><p>{action.body}</p></div>}
        {web && <iframe src={web} title="웹페이지" />}
        {action.kind === "popupVideo" && action.src && <div className="fb-popup__video"><VideoPlayer src={action.src} start={action.start} end={action.end} autoStart controls /></div>}
      </div>
    </div>
  );
}
