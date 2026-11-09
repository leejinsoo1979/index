import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { FiChevronLeft, FiChevronRight, FiChevronsLeft, FiChevronsRight, FiGrid, FiMaximize, FiMinimize, FiX } from "react-icons/fi";
import { buildSpreads, fontsInBook, loadBookFonts, spreadOfPage, type BookPage, type Flipbook } from "../../lib/flipbooks";
import { BookPageView, BookProvider } from "./BookPageView";
import { BookPopup, useBookRuntime } from "./BookRuntime";
import "./Flipbook.css";

/**
 * Reads a book like a book: drag a page across the spine, click its edge, or use the arrows and keys.
 *
 * A turn is always described as "the leaf between stop `at` and stop `at + 1`" with progress 0..1, so
 * turning back is the same animation run the other way. Facing pages on wide screens, one page on
 * narrow ones.
 */
type Turn = { at: number; progress: number };

const SINGLE_BELOW = 560; // two pages stay readable down to tablet width
const TURN_MS = 620;
const DRAG_START_PX = 6;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export default function FlipViewer({ book }: { book: Flipbook }) {
  const shell = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const bookEl = useRef<HTMLDivElement>(null);
  const leaf = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState({ width: 0, height: 0 });
  const [stop, setStop] = useState(0);
  const [turn, setTurn] = useState<Turn | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [grid, setGrid] = useState(false);
  const raf = useRef(0);
  const finish = useRef<(() => void) | null>(null);

  const single = area.width < SINGLE_BELOW;
  const spreads = useMemo(() => buildSpreads(book.pages.length), [book.pages.length]);
  const lastStop = single ? book.pages.length - 1 : spreads.length - 1;
  const stopRef = useRef(stop);
  stopRef.current = stop;

  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () => setArea({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Facing pages and single pages count stops differently; stay on the same page when the layout changes.
  const previousSingle = useRef(single);
  useLayoutEffect(() => {
    if (previousSingle.current === single || area.width === 0) return;
    previousSingle.current = single;
    finish.current?.();
    setStop((value) => {
      if (single) return spreads[value]?.right ?? spreads[value]?.left ?? 0;
      return spreadOfPage(value);
    });
  }, [single, area.width, spreads]);

  const ratio = book.width / book.height;
  const columns = single ? 1 : 2;
  const pageHeight = Math.max(0, Math.min(area.height, (area.width / columns) / ratio));
  const pageWidth = pageHeight * ratio;

  /** Sideways shift that keeps a closed book centred. */
  const shiftAt = useCallback((at: number) => {
    if (single) return 0;
    const spread = spreads[at];
    if (!spread) return 0;
    if (spread.left === null) return -pageWidth / 2;
    if (spread.right === null) return pageWidth / 2;
    return 0;
  }, [single, spreads, pageWidth]);

  /** Moved straight onto the DOM each frame; re-rendering the pages at 60fps would be wasteful. */
  const paint = useCallback((next: Turn | null) => {
    const element = bookEl.current;
    if (!element) return;
    const progress = next?.progress ?? 0;
    const at = next?.at ?? stopRef.current;
    const shift = next ? shiftAt(at) + (shiftAt(at + 1) - shiftAt(at)) * progress : shiftAt(at);
    element.style.setProperty("--shift", `${shift}px`);
    leaf.current?.style.setProperty("--p", String(progress));
    element.style.setProperty("--shade", String(Math.sin(progress * Math.PI)));
  }, [shiftAt]);

  useLayoutEffect(() => paint(turn), [paint, turn, stop]);

  const settle = useCallback((from: Turn, to: 0 | 1) => {
    const startedAt = performance.now();
    const duration = Math.max(160, TURN_MS * Math.abs(to - from.progress));
    const done = () => {
      cancelAnimationFrame(raf.current);
      finish.current = null;
      stopRef.current = from.at + to; // a key press can start the next turn before React renders
      setStop(from.at + to);
      setTurn(null);
    };
    finish.current = done;
    const frame = (now: number) => {
      const t = clamp((now - startedAt) / duration, 0, 1);
      paint({ at: from.at, progress: from.progress + (to - from.progress) * ease(t) });
      if (t < 1) raf.current = requestAnimationFrame(frame);
      else done();
    };
    raf.current = requestAnimationFrame(frame);
  }, [paint]);

  const go = useCallback((direction: 1 | -1) => {
    finish.current?.();
    const landing = stopRef.current;
    if (direction === 1 && landing >= lastStop) return;
    if (direction === -1 && landing <= 0) return;
    const from: Turn = direction === 1 ? { at: landing, progress: 0 } : { at: landing - 1, progress: 1 };
    setTurn(from);
    settle(from, direction === 1 ? 1 : 0);
  }, [lastStop, settle]);

  const jump = useCallback((target: number) => {
    finish.current?.();
    setStop(clamp(target, 0, lastStop));
  }, [lastStop]);

  const goToPage = useCallback((pageIndex: number) => jump(single ? pageIndex : spreadOfPage(pageIndex)), [jump, single]);

  const { runtime, popup, closePopup } = useBookRuntime(book, goToPage);
  const popupOpen = useRef(false);
  popupOpen.current = popup !== null;
  const gridOpen = useRef(false);
  gridOpen.current = grid;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (popupOpen.current || gridOpen.current) return;
      if (event.key === "ArrowRight" || event.key === "PageDown") go(1);
      else if (event.key === "ArrowLeft" || event.key === "PageUp") go(-1);
      else if (event.key === "Home") jump(0);
      else if (event.key === "End") jump(lastStop);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, jump, lastStop]);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  useEffect(() => loadBookFonts(fontsInBook(book)), [book]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("[data-interactive]")) return;
    if (finish.current) return;
    const element = bookEl.current;
    if (!element) return;
    const box = element.getBoundingClientRect();
    const startX = event.clientX;
    const forwardSide = startX > box.left + box.width / 2;
    const current = stopRef.current;
    const canTurn = forwardSide ? current < lastStop : current > 0;
    let active: Turn | null = null;
    const span = single ? pageWidth : pageWidth * 2;

    const move = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startX;
      if (!active) {
        if (!canTurn || Math.abs(dx) < DRAG_START_PX) return;
        active = forwardSide ? { at: current, progress: 0 } : { at: current - 1, progress: 1 };
        setTurn(active);
      }
      const progress = forwardSide ? clamp(-dx / span, 0, 1) : clamp(1 - dx / span, 0, 1);
      active = { at: active.at, progress };
      paint(active);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (active) {
        const turned = forwardSide ? active.progress > 0.22 : active.progress < 0.78;
        settle(active, (forwardSide ? turned : !turned) ? 1 : 0);
      } else if (canTurn) {
        go(forwardSide ? 1 : -1); // a plain click on a page turns it
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void shell.current?.requestFullscreen?.();
  };

  const pages = book.pages;
  const pageAt = (index: number | null | undefined): BookPage | null => (index === null || index === undefined ? null : pages[index] ?? null);
  const page = (index: number | null | undefined, still = turn !== null) => {
    const item = pageAt(index);
    return item ? <BookPageView page={item} runtime={runtime} still={still} /> : null;
  };

  // What's lying flat, and what's on the leaf if one is turning.
  let leftPage: number | null = null;
  let rightPage: number | null = null;
  let front: number | null = null;
  let back: number | null = null;
  if (single) {
    rightPage = turn ? turn.at + 1 : stop;
    front = turn ? turn.at : null;
  } else if (turn) {
    leftPage = spreads[turn.at]?.left ?? null;
    rightPage = spreads[turn.at + 1]?.right ?? null;
    front = spreads[turn.at]?.right ?? null;
    back = spreads[turn.at + 1]?.left ?? null;
  } else {
    leftPage = spreads[stop]?.left ?? null;
    rightPage = spreads[stop]?.right ?? null;
  }

  // Keep the next pages' images warm so a turn never shows an empty sheet.
  const nearby = useMemo(() => {
    const centre = single ? stop : stop * 2;
    return pages.slice(Math.max(0, centre - 2), centre + 4).map((item) => item.image).filter(Boolean) as string[];
  }, [pages, single, stop]);

  const counter = single
    ? `${stop + 1} / ${pages.length}`
    : (() => {
        const spread = spreads[stop];
        const shown = [spread?.left, spread?.right].filter((value): value is number => value !== null && value !== undefined).map((value) => value + 1);
        return `${shown.join("-")} / ${pages.length}`;
      })();

  return (
    <BookProvider book={book}>
    <div ref={shell} className="fbv" style={{ background: book.background }}>
      <div ref={stage} className="fbv__stage">
        {pageHeight > 0 && (
          <div
            ref={bookEl}
            className={`fb-book${single ? " fb-book--single" : ""}${turn ? " is-turning" : ""}`}
            style={{ width: pageWidth * columns, height: pageHeight, ["--page-w" as string]: `${pageWidth}px`, perspective: `${pageWidth * 5}px` }}
            onPointerDown={onPointerDown}
          >
            {!single && <div className="fb-sheet fb-sheet--left">{page(leftPage)}</div>}
            <div className="fb-sheet fb-sheet--right">{page(rightPage)}</div>
            {turn && (
              <div ref={leaf} className="fb-leaf">
                <div className="fb-face fb-face--front">{page(front)}</div>
                <div className="fb-face fb-face--back">{page(back)}</div>
              </div>
            )}
          </div>
        )}
      </div>

      <button type="button" className="fbv__arrow fbv__arrow--prev" aria-label="이전 쪽" disabled={stop <= 0 && !turn} onClick={() => go(-1)}><FiChevronLeft /></button>
      <button type="button" className="fbv__arrow fbv__arrow--next" aria-label="다음 쪽" disabled={stop >= lastStop && !turn} onClick={() => go(1)}><FiChevronRight /></button>

      <div className="fbv__bar">
        <button type="button" aria-label="처음으로" onClick={() => jump(0)}><FiChevronsLeft /></button>
        <span className="fbv__count" aria-live="polite">{counter}</span>
        <button type="button" aria-label="끝으로" onClick={() => jump(lastStop)}><FiChevronsRight /></button>
        <button type="button" aria-label="전체 쪽 보기" onClick={() => setGrid(true)}><FiGrid /></button>
        <button type="button" aria-label={fullscreen ? "전체 화면 끝내기" : "전체 화면"} onClick={toggleFullscreen}>{fullscreen ? <FiMinimize /> : <FiMaximize />}</button>
      </div>

      {popup && <BookPopup action={popup} onClose={closePopup} />}
      {grid && (
        <div className="fbv-grid">
          <button type="button" className="fbv-grid__close" aria-label="목록 닫기" onClick={() => setGrid(false)}><FiX /></button>
          <div className="fbv-grid__list">
            {pages.map((item, index) => (
              <button key={item.id} type="button" onClick={() => { goToPage(index); setGrid(false); }}>
                <div style={{ aspectRatio: `${book.width} / ${book.height}` }}><BookPageView page={item} still /></div>
                {index + 1}
              </button>
            ))}
          </div>
        </div>
      )}
      <div hidden>{nearby.map((src) => <img key={src} src={src} alt="" />)}</div>
    </div>
    </BookProvider>
  );
}
