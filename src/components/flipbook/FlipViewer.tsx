import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { FiChevronLeft, FiChevronRight, FiChevronsLeft, FiChevronsRight, FiGrid, FiMaximize, FiMinimize, FiSliders, FiVolume2, FiVolumeX, FiX, FiZoomIn, FiZoomOut } from "react-icons/fi";
import { buildSpreads, fontsInBook, loadBookFonts, spreadOfPage, type BookPage, type Flipbook } from "../../lib/flipbooks";
import { BookPageView, BookProvider } from "./BookPageView";
import { BookPopup, useBookRuntime } from "./BookRuntime";
import BookReaderOptions from "./BookReaderOptions";
import { PageTurnAudio } from "./PageTurnAudio";
import PaperBook, { type PaperBookControls } from "./PaperBook";
import { useBookZoom } from "./useBookZoom";
import { resolveBookReaderSettings, type BookReaderSettings } from "../../lib/book-reader";
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
  const zoomLayer = useRef<HTMLDivElement>(null);
  const { zoom, zoomIn, zoomOut, resetZoom } = useBookZoom(stage, zoomLayer);
  const raf = useRef(0);
  const finish = useRef<(() => void) | null>(null);
  const dragCleanup = useRef<(() => void) | null>(null);
  const audio = useRef<PageTurnAudio | null>(null);
  const paperControls = useRef<PaperBookControls | null>(null);
  const [reader, setReader] = useState(() => resolveBookReaderSettings(book.reader));
  const [readerOptions, setReaderOptions] = useState(false);
  const optionsOpen = useRef(false);
  optionsOpen.current = readerOptions;
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const effect = reducedMotion ? "fade" : reader.effect;

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReducedMotion(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    finish.current?.();
    setReader(resolveBookReaderSettings(book.reader));
    audio.current?.stop();
  }, [book.id, book.reader]);
  useEffect(() => () => { audio.current?.dispose(); audio.current = null; }, []);
  useEffect(() => PageTurnAudio.preload(), []);
  const changeReader = useCallback((patch: Partial<BookReaderSettings>) => {
    finish.current?.();
    if (patch.sound === "none" || patch.volume === 0) audio.current?.stop();
    setReader(previous => resolveBookReaderSettings({ ...previous, ...patch }));
  }, []);
  const playSound = useCallback((maxWaitMs = Infinity) => {
    if (reader.sound === "none" || reader.volume === 0) return Promise.resolve(true);
    audio.current ??= new PageTurnAudio();
    return audio.current.play(reader.sound, reader.volume, maxWaitMs);
  }, [reader.sound, reader.volume]);

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
  const [pageLayout, setPageLayout] = useState(single);
  useLayoutEffect(() => {
    if (pageLayout === single || area.width === 0) return;
    finish.current?.();
    setStop((value) => {
      if (single) return spreads[value]?.left ?? spreads[value]?.right ?? 0;
      return spreadOfPage(value);
    });
    setPageLayout(single);
  }, [single, pageLayout, area.width, spreads]);

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
    element.style.setProperty("--p", String(progress));
    leaf.current?.style.setProperty("--p", String(progress));
    element.style.setProperty("--shade", String(Math.sin(progress * Math.PI)));
  }, [shiftAt]);

  useLayoutEffect(() => paint(turn), [paint, turn, stop]);

  const settle = useCallback((from: Turn, to: 0 | 1) => {
    const startedAt = performance.now();
    const duration = reducedMotion ? 1 : Math.max(120, reader.duration * Math.abs(to - from.progress));
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
  }, [paint, reader.duration, reducedMotion]);

  const go = useCallback((direction: 1 | -1) => {
    if (effect === "paper") { paperControls.current?.go(direction); return; }
    finish.current?.();
    const landing = stopRef.current;
    if (direction === 1 && landing >= lastStop) return;
    if (direction === -1 && landing <= 0) return;
    const from: Turn = direction === 1 ? { at: landing, progress: 0 } : { at: landing - 1, progress: 1 };
    void playSound(200);
    setTurn(from);
    settle(from, direction === 1 ? 1 : 0);
  }, [lastStop, settle, playSound, effect]);

  const jump = useCallback((target: number) => {
    finish.current?.();
    const next = clamp(target, 0, lastStop);
    audio.current?.stop();
    if (effect === "paper") {
      const spread = spreads[next];
      paperControls.current?.jump(single ? next : spread?.left ?? spread?.right ?? 0);
      return;
    }
    stopRef.current = next;
    setStop(next);
  }, [lastStop, effect, single, spreads]);

  const goToPage = useCallback((pageIndex: number) => jump(single ? pageIndex : spreadOfPage(pageIndex)), [jump, single]);

  const { runtime, popup, closePopup } = useBookRuntime(book, goToPage);
  const popupOpen = useRef(false);
  popupOpen.current = popup !== null;
  const gridOpen = useRef(false);
  gridOpen.current = grid;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && optionsOpen.current) { setReaderOptions(false); return; }
      if (popupOpen.current || gridOpen.current || optionsOpen.current || (event.target as HTMLElement).closest("input,textarea,select,[contenteditable=true]")) return;
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

  useEffect(() => () => { cancelAnimationFrame(raf.current); dragCleanup.current?.(); finish.current = null; }, []);
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
      dragCleanup.current?.();
      if (active) {
        const turned = forwardSide ? active.progress > 0.22 : active.progress < 0.78;
        if (turned) void playSound(200);
        settle(active, (forwardSide ? turned : !turned) ? 1 : 0);
      } else if (canTurn) {
        go(forwardSide ? 1 : -1); // a plain click on a page turns it
      }
    };
    const cancel = () => {
      dragCleanup.current?.();
      if (active) settle(active, forwardSide ? 0 : 1);
    };
    dragCleanup.current = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      dragCleanup.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
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
    return [...new Set(pages.slice(Math.max(0, centre - 2), centre + 4).flatMap(item => [item.image ?? "", ...item.elements.flatMap(element => element.type === "image" ? [element.src] : element.type === "grid" ? element.cells.map(cell => cell.src ?? "") : element.type === "slideshow" ? element.images : [])]).filter(Boolean))];
  }, [pages, single, stop]);

  const counter = single
    ? `${stop + 1} / ${pages.length}`
    : (() => {
        const spread = spreads[stop];
        const shown = [spread?.left, spread?.right].filter((value): value is number => value !== null && value !== undefined).map((value) => value + 1);
        return `${shown.join("-")} / ${pages.length}`;
      })();
  const animatedFlat = turn !== null && (effect === "slide" || effect === "fade");
  const flatSpread = (at: number) => <>
    {!single && <div className="fb-sheet fb-sheet--left">{page(spreads[at]?.left, true)}</div>}
    <div className="fb-sheet fb-sheet--right">{page(single ? at : spreads[at]?.right, true)}</div>
  </>;

  return (
    <BookProvider book={book}>
    <div ref={shell} className="fbv" style={{ background: book.background }} data-turn-effect={effect}>
      <div ref={stage} className="fbv__stage">
        <div ref={zoomLayer} className="fbv__zoom">
        {pageLayout === single && (pageHeight > 0 && effect === "paper" ? <PaperBook
          book={book} width={pageWidth} height={pageHeight} single={single} duration={reader.duration}
          page={single ? stop : spreads[stop]?.left ?? spreads[stop]?.right ?? 0}
          controls={paperControls} runtime={runtime}
          onPage={index => { const next = single ? index : spreadOfPage(index); stopRef.current = next; setStop(next); }}
          onTurn={() => { void playSound(200); }}
        /> : pageHeight > 0 && (
          <div
            ref={bookEl}
            className={`fb-book fb-book--${effect}${single ? " fb-book--single" : ""}${turn ? " is-turning" : ""}`}
            style={{ width: pageWidth * columns, height: pageHeight, ["--page-w" as string]: `${pageWidth}px`, perspective: `${pageWidth * (effect === "hardcover" ? 10 : 5)}px` }}
            onPointerDown={onPointerDown}
          >
            {animatedFlat && turn ? <div className="fb-transition">
              <div className="fb-transition__from">{flatSpread(turn.at)}</div>
              <div className="fb-transition__to">{flatSpread(turn.at + 1)}</div>
            </div> : <>
            {!single && <div className="fb-sheet fb-sheet--left">{page(leftPage)}</div>}
            <div className="fb-sheet fb-sheet--right">{page(rightPage)}</div>
            {turn && (
              <div ref={leaf} className="fb-leaf">
                <div className="fb-face fb-face--front">{page(front)}</div>
                <div className="fb-face fb-face--back">{page(back)}</div>
              </div>
            )}
            </>}
          </div>
        ))}
        </div>
      </div>

      <button type="button" className="fbv__arrow fbv__arrow--prev" aria-label="이전 쪽" disabled={stop <= 0 && !turn} onClick={() => go(-1)}><FiChevronLeft /></button>
      <button type="button" className="fbv__arrow fbv__arrow--next" aria-label="다음 쪽" disabled={stop >= lastStop && !turn} onClick={() => go(1)}><FiChevronRight /></button>

      <div className="fbv__bar">
        <button type="button" aria-label="처음으로" onClick={() => jump(0)}><FiChevronsLeft /></button>
        <span className="fbv__count" aria-live="polite">{counter}</span>
        <button type="button" aria-label="끝으로" onClick={() => jump(lastStop)}><FiChevronsRight /></button>
        <button type="button" aria-label="축소" title="축소" onClick={zoomOut}><FiZoomOut /></button>
        <button type="button" className="fbv__zoomvalue" aria-label="책 크기 원래대로" title="원래 크기로" onClick={resetZoom}>{Math.round(zoom * 100)}%</button>
        <button type="button" aria-label="확대" title="확대" onClick={zoomIn}><FiZoomIn /></button>
        <button type="button" aria-label="전체 쪽 보기" onClick={() => setGrid(true)}><FiGrid /></button>
        <button type="button" aria-label={fullscreen ? "전체 화면 끝내기" : "전체 화면"} onClick={toggleFullscreen}>{fullscreen ? <FiMinimize /> : <FiMaximize />}</button>
        <button type="button" aria-label={reader.sound === "none" ? "넘김 소리 켜기" : "넘김 소리 끄기"} title={reader.sound === "none" ? "넘김 소리 켜기" : "넘김 소리 끄기"} aria-pressed={reader.sound !== "none"} onClick={() => changeReader({ sound: reader.sound === "none" ? "paper" : "none" })}>{reader.sound === "none" ? <FiVolumeX /> : <FiVolume2 />}</button>
        <button type="button" aria-label="읽기 설정" title="읽기 설정" aria-expanded={readerOptions} onClick={() => setReaderOptions(value => !value)}><FiSliders /></button>
        {readerOptions && <section className="fbv-options" aria-label="책 넘김과 소리 설정"><h3 className="fbv-options__title">책 넘김과 소리</h3><BookReaderOptions value={reader} onChange={changeReader} onListen={playSound} /></section>}
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
