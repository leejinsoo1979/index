import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const BUTTON_STEP = 1.25;
const WHEEL_SPEED = 0.01;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Zooms only the book. Pinch, Ctrl/Cmd + wheel and Ctrl/Cmd + +/-/0 would otherwise scale the whole
 * browser page, toolbar included, so they are taken over while the viewer is open. While zoomed, dragging
 * moves the book instead of turning the page; links, buttons and videos keep working.
 */
export function useBookZoom(stage: RefObject<HTMLElement | null>, layer: RefObject<HTMLElement | null>) {
  const view = useRef({ zoom: 1, x: 0, y: 0 });
  const [zoom, setZoomValue] = useState(1);

  const paint = useCallback(() => {
    const element = layer.current;
    const area = stage.current;
    if (!element || !area) return;
    const content = element.firstElementChild as HTMLElement | null;
    const state = view.current;
    const reachX = Math.max(0, ((content?.offsetWidth ?? 0) * state.zoom - area.clientWidth) / 2);
    const reachY = Math.max(0, ((content?.offsetHeight ?? 0) * state.zoom - area.clientHeight) / 2);
    state.x = clamp(state.x, -reachX, reachX);
    state.y = clamp(state.y, -reachY, reachY);
    element.style.transform = state.zoom === 1 ? "" : `translate(${state.x}px, ${state.y}px) scale(${state.zoom})`;
    element.classList.toggle("is-zoomed", state.zoom !== 1);
    setZoomValue(state.zoom);
  }, [layer, stage]);

  /** Keeps the point under the pointer (or the middle of the book) where it is. */
  const zoomTo = useCallback((next: number, clientX?: number, clientY?: number) => {
    const area = stage.current;
    if (!area) return;
    const state = view.current;
    const target = Math.abs(clamp(next, MIN_ZOOM, MAX_ZOOM) - 1) < 0.02 ? 1 : clamp(next, MIN_ZOOM, MAX_ZOOM);
    const box = area.getBoundingClientRect();
    const px = (clientX ?? box.left + box.width / 2) - (box.left + box.width / 2);
    const py = (clientY ?? box.top + box.height / 2) - (box.top + box.height / 2);
    const ratio = target / state.zoom;
    state.x = px - (px - state.x) * ratio;
    state.y = py - (py - state.y) * ratio;
    state.zoom = target;
    if (target <= 1) { state.x = 0; state.y = 0; }
    paint();
  }, [paint, stage]);

  const zoomIn = useCallback(() => zoomTo(view.current.zoom * BUTTON_STEP), [zoomTo]);
  const zoomOut = useCallback(() => zoomTo(view.current.zoom / BUTTON_STEP), [zoomTo]);
  const resetZoom = useCallback(() => zoomTo(1), [zoomTo]);

  useEffect(() => {
    let gestureStart = 1;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        zoomTo(view.current.zoom * Math.exp(-event.deltaY * WHEEL_SPEED), event.clientX, event.clientY);
      } else if (view.current.zoom > 1 && stage.current?.contains(event.target as Node)) {
        event.preventDefault();
        view.current.x -= event.deltaX;
        view.current.y -= event.deltaY;
        paint();
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key === "=" || event.key === "+") { event.preventDefault(); zoomIn(); }
      else if (event.key === "-") { event.preventDefault(); zoomOut(); }
      else if (event.key === "0") { event.preventDefault(); resetZoom(); }
    };
    // Safari on Mac reports trackpad pinches as gesture events instead of wheel events.
    const onGestureStart = (event: Event) => { event.preventDefault(); gestureStart = view.current.zoom; };
    const onGestureChange = (event: Event) => {
      event.preventDefault();
      const gesture = event as Event & { scale: number; clientX: number; clientY: number };
      zoomTo(gestureStart * gesture.scale, gesture.clientX, gesture.clientY);
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("gesturestart", onGestureStart, { passive: false });
    window.addEventListener("gesturechange", onGestureChange, { passive: false });
    window.addEventListener("resize", paint);
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("gesturestart", onGestureStart);
      window.removeEventListener("gesturechange", onGestureChange);
      window.removeEventListener("resize", paint);
    };
  }, [paint, resetZoom, stage, zoomIn, zoomOut, zoomTo]);

  useEffect(() => {
    const area = stage.current;
    if (!area) return;
    const isControl = (target: EventTarget | null) => target instanceof Element && target.closest("[data-interactive]");

    // Two fingers zoom the book; the page itself stays put.
    let pinch: { distance: number; zoom: number } | null = null;
    const spread = (touches: TouchList) => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 2) return;
      pinch = { distance: spread(event.touches), zoom: view.current.zoom };
      event.preventDefault();
      event.stopPropagation();
    };
    const onTouchMove = (event: TouchEvent) => {
      if (!pinch || event.touches.length !== 2) return;
      event.preventDefault();
      event.stopPropagation();
      zoomTo(pinch.zoom * (spread(event.touches) / pinch.distance), (event.touches[0].clientX + event.touches[1].clientX) / 2, (event.touches[0].clientY + event.touches[1].clientY) / 2);
    };
    const onTouchEnd = () => { pinch = null; };

    // The page-turn engines measure the unscaled page, so turning by hand waits until the zoom is back to 100%.
    const hold = (event: Event) => {
      if (view.current.zoom !== 1 && !isControl(event.target)) event.stopPropagation();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (view.current.zoom === 1 || isControl(event.target)) return;
      event.stopPropagation();
      if (event.button !== 0 || view.current.zoom < 1) return;
      const start = { x: event.clientX - view.current.x, y: event.clientY - view.current.y };
      const move = (next: PointerEvent) => {
        view.current.x = next.clientX - start.x;
        view.current.y = next.clientY - start.y;
        paint();
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    };

    area.addEventListener("touchstart", onTouchStart, { capture: true, passive: false });
    area.addEventListener("touchmove", onTouchMove, { capture: true, passive: false });
    area.addEventListener("touchend", onTouchEnd);
    area.addEventListener("touchcancel", onTouchEnd);
    area.addEventListener("pointerdown", onPointerDown, true);
    area.addEventListener("mousedown", hold, true);
    area.addEventListener("touchstart", hold, true);
    return () => {
      area.removeEventListener("touchstart", onTouchStart, true);
      area.removeEventListener("touchmove", onTouchMove, true);
      area.removeEventListener("touchend", onTouchEnd);
      area.removeEventListener("touchcancel", onTouchEnd);
      area.removeEventListener("pointerdown", onPointerDown, true);
      area.removeEventListener("mousedown", hold, true);
      area.removeEventListener("touchstart", hold, true);
    };
  }, [paint, stage, zoomTo]);

  return { zoom, zoomIn, zoomOut, resetZoom };
}
