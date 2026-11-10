import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { FiChevronLeft, FiChevronRight, FiMaximize, FiMinimize, FiVolume2, FiVolumeX } from "react-icons/fi";
import { setTypingSound, typingSoundOn } from "./TypeText";
import { Map as MapIcon } from "lucide-react";
import { BookProvider } from "../flipbook/BookPageView";
import { BookPopup, useBookRuntime } from "../flipbook/BookRuntime";
import { loadBookFonts, type Flipbook } from "../../lib/flipbooks";
import { fitCamera, flightAt, frameAt, overviewRect, ownerFrame, pathSteps, worldTransform, type Camera } from "../../lib/infinity";
import type { BookElement } from "../../lib/flipbooks";
import { Backdrop, InfinityWorld, paintBackdrop } from "./InfinityWorld";
import "./Infinity.css";

const FLIGHT_MS = 1300;
const OVERVIEW = -1;

/**
 * Presents an 인피니티북: the camera flies from frame to frame along the path. Arrows, space and the bar
 * step through it; clicking a frame flies into it; the wheel and dragging look around freely.
 */
export default function InfinityViewer({ book, embedded = false }: { book: Flipbook; embedded?: boolean }) {
  const canvas = book.canvas!;
  const root = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const steps = useMemo(() => pathSteps(canvas), [canvas]);
  // Entrance animations: how many times each frame has been arrived at (0 = not yet).
  const [arrivals, setArrivals] = useState<Record<string, number>>({});
  const camera = useRef<Camera>({ x: 0, y: 0, zoom: 1 });
  const flight = useRef(0);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [step, setStep] = useState(() => {
    const asked = Number(new URLSearchParams(window.location.search).get("step"));
    return Number.isInteger(asked) && asked > 0 ? asked : OVERVIEW;
  });
  const [fullscreen, setFullscreen] = useState(false);
  const [sound, setSound] = useState(typingSoundOn);
  const stepRef = useRef(step);
  stepRef.current = step;

  const paint = useCallback(() => {
    if (layer.current) layer.current.style.transform = worldTransform(camera.current, size.w, size.h);
    paintBackdrop(backdrop.current, canvas, camera.current, fitCamera(overviewRect(canvas), size.w, size.h, 0.92), size.w);
  }, [size, canvas]);

  const target = useCallback((index: number): Camera => {
    const frame = steps[index]?.frame;
    return frame ? fitCamera(frame, size.w, size.h, 0.92) : fitCamera(overviewRect(canvas), size.w, size.h, 0.92);
  }, [canvas, steps, size]);

  const flyTo = useCallback((next: Camera) => {
    cancelAnimationFrame(flight.current);
    const from = { ...camera.current };
    const started = performance.now();
    const frame = (now: number) => {
      const t = Math.min(1, (now - started) / FLIGHT_MS);
      camera.current = flightAt(from, next, t, size.w, size.h);
      paint();
      if (t < 1) flight.current = requestAnimationFrame(frame);
    };
    flight.current = requestAnimationFrame(frame);
  }, [paint, size]);

  const go = useCallback((index: number) => {
    const clamped = Math.max(OVERVIEW, Math.min(steps.length - 1, index));
    setStep(clamped);
    const arrived = steps[clamped]?.frame.id;
    if (arrived) setArrivals((seen) => ({ ...seen, [arrived]: (seen[arrived] ?? 0) + 1 }));
    flyTo(target(clamped));
  }, [steps, flyTo, target]);

  // Animated elements show as they are on the overview; arriving at their frame plays them (typing starts over).
  const reveal = useCallback((element: BookElement) => {
    if (!element.animation || element.animation === "none") return undefined;
    const owner = ownerFrame(canvas, element);
    if (!owner) return undefined;
    return arrivals[owner.id] ? arrivals[owner.id] : undefined;
  }, [arrivals, canvas]);

  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const measure = () => setSize({ w: element.clientWidth, h: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Opened at a step (?step=n): count it as arrived so its animations show.
  useEffect(() => {
    const first = steps[stepRef.current]?.frame.id;
    if (first) setArrivals((seen) => (seen[first] ? seen : { ...seen, [first]: 1 }));
  }, [steps]);

  // Start on the overview; keep the current stop framed when the window changes size.
  useLayoutEffect(() => {
    if (!size.w) return;
    camera.current = target(stepRef.current);
    paint();
  }, [size, target, paint]);

  useEffect(() => loadBookFonts(canvas.elements.flatMap((element) => (element.type === "text" && element.font ? [element.font] : []))), [canvas]);
  useEffect(() => () => cancelAnimationFrame(flight.current), []);

  const goToPage = useCallback(() => undefined, []);
  const { runtime, popup, closePopup } = useBookRuntime(book, goToPage);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (popup) return;
      if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(event.key)) { event.preventDefault(); go(stepRef.current + 1); }
      else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(event.key)) { event.preventDefault(); go(stepRef.current - 1); }
      else if (event.key === "Escape" || event.key === "Home") go(OVERVIEW);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, popup]);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Free look: the wheel zooms around the pointer (or pans with a trackpad), dragging pans.
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      cancelAnimationFrame(flight.current);
      const box = element.getBoundingClientRect();
      const cam = camera.current;
      if (event.ctrlKey || event.metaKey || Math.abs(event.deltaY) > 40 && event.deltaX === 0 && !event.shiftKey) {
        const factor = Math.exp(-Math.max(-30, Math.min(30, event.deltaY)) * 0.01);
        const px = event.clientX - box.left - size.w / 2;
        const py = event.clientY - box.top - size.h / 2;
        const zoom = Math.min(40, Math.max(0.02, cam.zoom * factor));
        camera.current = { x: cam.x + px / cam.zoom - px / zoom, y: cam.y + py / cam.zoom - py / zoom, zoom };
      } else {
        camera.current = { ...cam, x: cam.x + event.deltaX / cam.zoom, y: cam.y + event.deltaY / cam.zoom };
      }
      paint();
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [paint, size]);

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0 || (event.target as Element).closest("[data-interactive], .ibv__bar")) return;
    cancelAnimationFrame(flight.current);
    const start = { x: event.clientX, y: event.clientY, cam: { ...camera.current } };
    let moved = false;
    const move = (next: PointerEvent) => {
      const dx = next.clientX - start.x;
      const dy = next.clientY - start.y;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true;
      camera.current = { ...start.cam, x: start.cam.x - dx / start.cam.zoom, y: start.cam.y - dy / start.cam.zoom };
      paint();
    };
    const up = (last: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (moved) return;
      // A click on a frame flies into it.
      const box = root.current!.getBoundingClientRect();
      const cam = camera.current;
      const wx = cam.x + (last.clientX - box.left - size.w / 2) / cam.zoom;
      const wy = cam.y + (last.clientY - box.top - size.h / 2) / cam.zoom;
      const hit = frameAt(canvas, wx, wy);
      if (hit) go(steps.findIndex((item) => item.frame.id === hit.id));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void root.current?.requestFullscreen?.();
  };
  const total = steps.length;

  return (
    <BookProvider book={book}>
      <div ref={root} className="ibv" style={{ background: canvas.background, position: embedded ? "absolute" : "fixed" }} onPointerDown={onPointerDown}>
        <Backdrop canvas={canvas} backdropRef={backdrop} />
        <InfinityWorld layerRef={layer} canvas={canvas} still={false} runtime={runtime} reveal={reveal} style={{ transform: worldTransform(camera.current, size.w, size.h) }} />
        <div className="ibv__bar">
          <button type="button" aria-label="이전" disabled={step <= OVERVIEW} onClick={() => go(step - 1)}><FiChevronLeft /></button>
          <span className="ibv__count" aria-live="polite">{step === OVERVIEW ? "개요" : `${step + 1} / ${total}`}</span>
          <button type="button" aria-label="다음" disabled={step >= total - 1} onClick={() => go(step + 1)}><FiChevronRight /></button>
          <button type="button" aria-label="개요 보기" title="개요 보기" onClick={() => go(OVERVIEW)}><MapIcon size={16} /></button>
          <button type="button" aria-label={sound ? "타이핑 소리 끄기" : "타이핑 소리 켜기"} title={sound ? "타이핑 소리 끄기" : "타이핑 소리 켜기"} onClick={() => { setTypingSound(!sound); setSound(!sound); }}>{sound ? <FiVolume2 /> : <FiVolumeX />}</button>
          <button type="button" aria-label={fullscreen ? "전체 화면 끝내기" : "전체 화면"} onClick={toggleFullscreen}>{fullscreen ? <FiMinimize /> : <FiMaximize />}</button>
        </div>
        <div className="ibv__progress" style={{ width: `${total ? ((step + 1) / total) * 100 : 0}%`, background: "rgba(0, 0, 0, .55)" }} />
        {popup && <BookPopup action={popup} onClose={closePopup} />}
      </div>
    </BookProvider>
  );
}
