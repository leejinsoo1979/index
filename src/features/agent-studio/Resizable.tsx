import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

type ResizeSide = "left" | "right";

interface UseResizableOptions {
  initial: number;
  min: number;
  max: number;
  side: ResizeSide;
  storageKey: string;
}

export function useResizable({ initial, min, max, side, storageKey }: UseResizableOptions) {
  const [width, setWidth] = useState(() => {
    const saved = Number(window.localStorage.getItem(storageKey));
    return Number.isFinite(saved) && saved >= min && saved <= max ? saved : initial;
  });
  const widthRef = useRef(width);

  useEffect(() => { widthRef.current = width; }, [width]);

  const beginResize = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = widthRef.current;
    const cursorBefore = document.body.style.cursor;
    const selectionBefore = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const move = (moveEvent: PointerEvent) => {
      const delta = side === "right" ? moveEvent.clientX - startX : startX - moveEvent.clientX;
      setWidth(Math.min(max, Math.max(min, startWidth + delta)));
    };
    const end = () => {
      document.body.style.cursor = cursorBefore;
      document.body.style.userSelect = selectionBefore;
      window.localStorage.setItem(storageKey, String(widthRef.current));
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
  }, [max, min, side, storageKey]);

  return { width, beginResize };
}

export function ResizeHandle({ side, onPointerDown }: {
  side: ResizeSide;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      className={`agent-resize-handle is-${side}`}
      onPointerDown={onPointerDown}
      aria-label="패널 너비 조절"
      title="드래그하여 패널 너비 조절"
    ><span /></button>
  );
}
