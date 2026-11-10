/**
 * Flipbook editor (/admin/books/:id): left rail and panels to add things, the page in the middle,
 * settings and click actions on the right. The book is autosaved; /book/{id} is what readers get.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ChevronFirst, ChevronLast, CircleEllipsis, CirclePlay, CloudCheck, CloudUpload, FileText, Image as ImageIcon, LayoutDashboard, Link2, Music, Shapes, Sparkles, Type } from "lucide-react";
import { FiArrowLeft, FiBookOpen, FiChevronLeft, FiChevronRight, FiCopy, FiExternalLink, FiLayers, FiMenu, FiMousePointer, FiPlay, FiRotateCcw, FiRotateCw } from "react-icons/fi";
import { BookProvider } from "../../../components/flipbook/BookPageView";
import { BookPopup, useBookRuntime } from "../../../components/flipbook/BookRuntime";
import PaperBook, { type PaperBookControls } from "../../../components/flipbook/PaperBook";
import { resolveBookReaderSettings } from "../../../lib/book-reader";
import { BOOK_FONTS, bookLink, buildSpreads, loadBookFonts, spreadOfPage, uid, type BookElement } from "../../../lib/flipbooks";
import { AiWriterPanel } from "./BookEditorAi";
import { PageCanvas, TextToolbar } from "./BookEditorCanvas";
import BookElementToolbar from "./BookElementToolbar";
import BookZoomControls from "./BookZoomControls";
import { Inspector, elementName } from "./BookEditorInspector";
import { LeftPanel, type PanelId } from "./BookEditorPanels";
import { useBookEditor } from "./useBookEditor";
import "./BookEditor.css";
import "./BookEditorExit.css";

const SAVE_TEXT = { saved: "저장됨", dirty: "저장 대기", saving: "저장 중…", error: "저장 실패" } as const;
const isTyping = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA"].includes(target.tagName));

type RailPanel = PanelId | "ai";
const RAIL: { id: RailPanel | "link"; label: string; icon: ReactNode }[] = [
  { id: "pages", label: "페이지", icon: <FileText /> },
  { id: "templates", label: "템플릿", icon: <LayoutDashboard /> },
  { id: "elements", label: "요소", icon: <Shapes /> },
  { id: "link", label: "링크", icon: <Link2 /> },
  { id: "images", label: "이미지", icon: <ImageIcon /> },
  { id: "text", label: "텍스트", icon: <Type /> },
  { id: "ai", label: "AI 글쓰기", icon: <Sparkles /> },
  { id: "video", label: "비디오", icon: <CirclePlay /> },
  { id: "audio", label: "오디오", icon: <Music /> },
  { id: "more", label: "더 보기", icon: <CircleEllipsis /> },
];

const timeText = (time: number | null) => (time ? new Date(time).toLocaleTimeString("ko-KR", { hour12: false }) : "");

export default function BookEditor() {
  const navigate = useNavigate();
  const { id = "" } = useParams();
  const ed = useBookEditor(id);
  const { book, pageIndex, selectedId } = ed;
  const [panel, setPanel] = useState<RailPanel>("pages");
  const [panelOpen, setPanelOpen] = useState(true);
  const [inspectorTab, setInspectorTab] = useState<"settings" | "actions">("settings");
  const [zoom, setZoom] = useState("fit");
  const [spreadView, setSpreadView] = useState(true); // books are read two pages at a time
  const [preview, setPreview] = useState(false);
  // While a page turns, the preview's paper engine stands in for the editable pages.
  const [turning, setTurning] = useState<{ direction: 1 | -1; from: number; target: number } | null>(null);
  const paperControls = useRef<PaperBookControls | null>(null);
  const turnFallback = useRef(() => {});
  useEffect(() => {
    if (!turning) return;
    const frame = requestAnimationFrame(() => paperControls.current?.go(turning.direction));
    // If the engine never reports landing (it refused the turn), the page still changes.
    const timer = window.setTimeout(() => turnFallback.current(), 4000);
    return () => { cancelAnimationFrame(frame); window.clearTimeout(timer); };
  }, [turning]);
  const [menu, setMenu] = useState<"file" | "share" | "layers" | null>(null);
  const [copied, setCopied] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const leaveEditor = async () => {
    if (leaving) return;
    setLeaving(true);
    const saved = await ed.flush();
    if (saved) navigate("/admin/books");
    else {
      setLeaving(false);
      ed.setNotice("저장하지 못했습니다. 연결을 확인하고 다시 나가기를 눌러 주세요.");
    }
  };
  const stage = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () => setArea({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [book === null]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => loadBookFonts(BOOK_FONTS.map((font) => font.value)), []);

  const clipboard = useRef<BookElement[]>([]);
  const edRef = useRef(ed);
  edRef.current = ed;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || (event.target instanceof Element && event.target.closest('[role="dialog"]'))) return;
      const api = edRef.current;
      const command = event.metaKey || event.ctrlKey;
      if (command && event.key.toLowerCase() === "s") { event.preventDefault(); void api.flush(); return; }
      if (isTyping(event.target)) return;
      if (command && event.key.toLowerCase() === "z") { event.preventDefault(); if (event.shiftKey) api.redo(); else api.undo(); return; }
      if (command && event.key.toLowerCase() === "y") { event.preventDefault(); api.redo(); return; }
      const open = api.book;
      if (!open) return;
      const key = event.key.toLowerCase();
      const page = open.pages[api.pageIndex];
      if (command && key === "a") { event.preventDefault(); api.setSelection(page.elements.map((item) => item.id)); return; }
      if (command && key === "v") { if (clipboard.current.length > 0) { event.preventDefault(); api.placeCopies(clipboard.current, api.pageIndex); } return; }
      const ids = api.selectedIds;
      if (ids.length === 0) return;
      const chosen = open.pages.flatMap((item) => item.elements).filter((item) => ids.includes(item.id));
      if (command && key === "c") { clipboard.current = chosen; return; }
      if (command && key === "x") { event.preventDefault(); clipboard.current = chosen; api.removeElements(ids); return; }
      if (command && key === "d") { event.preventDefault(); api.placeCopies(chosen, api.pageIndex); return; }
      if (command && key === "g") {
        event.preventDefault();
        const groupId = event.shiftKey ? undefined : uid();
        api.updateElements(Object.fromEntries(ids.map((id) => [id, { groupId }])));
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); api.removeElements(ids.filter((id) => !chosen.find((item) => item.id === id)?.locked)); return; }
      if (event.key === "Escape") { api.setSelectedId(null); return; }
      const step = event.shiftKey ? 2 : 0.25;
      const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      const move = moves[event.key];
      if (!move) return;
      event.preventDefault();
      api.updateElements(Object.fromEntries(chosen.filter((item) => !item.locked).map((item) => [item.id, { x: item.x + move[0], y: item.y + move[1] }])), `nudge:${ids.join()}`);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const goToPage = (index: number) => { ed.setPageIndex(index); ed.setSelectedId(null); };
  const fallback = useMemo(() => book ?? { id: "", title: "", width: 1, height: 1, background: "", pages: [], assets: [], published: false, createdAt: 0, updatedAt: 0 }, [book]);
  const { runtime, popup, closePopup } = useBookRuntime(fallback, goToPage);

  if (ed.missing) return <div className="be be--message">책을 찾을 수 없습니다. <Link to="/admin/books">목록으로</Link></div>;
  if (!book) return <div className="be be--message">불러오는 중…</div>;

  const page = book.pages[pageIndex];
  const selected = page?.elements.find((element) => element.id === selectedId) ?? null;
  const multi = book.pages.flatMap((item) => item.elements).filter((element) => ed.selectedIds.includes(element.id));
  const spreads = buildSpreads(book.pages.length);
  const spread = spreads[spreadOfPage(pageIndex)];
  const columns = spreadView && spread ? Number(spread.left !== null) + Number(spread.right !== null) : 1;
  const fitScale = Math.max(0.05, Math.min((area.width - 60) / (columns * book.width), (area.height - 60) / book.height));
  const scale = zoom === "fit" ? fitScale : Number(zoom) / 100;
  const pageWidth = book.width * scale;
  const pageHeight = book.height * scale;
  const changeZoom = (value: string) => {
    setZoom(value);
    if (value === "fit") stage.current?.scrollTo({ left: 0, top: 0 });
  };

  const step = spreadView ? 2 : 1;
  const go = (target: number) => goToPage(Math.min(book.pages.length - 1, Math.max(0, target)));

  /** 이전·다음 turns the page the way the preview does; the editable pages come back when it lands. */
  const turnDuration = resolveBookReaderSettings(book.reader).duration;
  const turnPage = (direction: 1 | -1) => {
    const target = pageIndex + step * direction;
    if (target < 0 || target > book.pages.length - 1) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (turning || preview || reduced) { go(target); return; }
    ed.setSelectedId(null);
    setTurning({ direction, from: pageIndex, target });
  };
  const finishTurn = (landed: number) => {
    setTurning(null);
    go(landed);
  };
  turnFallback.current = () => { if (turning) finishTurn(turning.target); };
  const addLink = () => {
    const elementId = uid();
    ed.addElement({ id: elementId, type: "link", x: 35, y: 46, w: 30, h: 8, actions: [{ kind: "url", url: "" }] }, pageIndex);
    setInspectorTab("actions");
    setPreview(false);
  };
  const clickRail = (id: RailPanel | "link") => {
    if (id === "link") { addLink(); return; }
    setPanel(id);
    setPanelOpen(true);
  };
  const copyLink = async () => {
    await navigator.clipboard.writeText(bookLink(book.id));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };
  const renderPage = (index: number | null | undefined) => (index === null || index === undefined
    ? <div style={{ width: pageWidth, height: pageHeight }} />
    : <PageCanvas key={book.pages[index].id} ed={ed} index={index} width={pageWidth} height={pageHeight} preview={preview} runtime={runtime} />);

  return (
    <BookProvider book={book} editing>
    <div className="be" onPointerDown={(event) => { if (menu && !(event.target as HTMLElement).closest(".be-pop, .be-popbtn")) setMenu(null); }}>
      <header className="be-top">
        <button type="button" className="be-exit" aria-label="책 목록으로 나가기" title="저장 후 책 목록으로 나가기" disabled={leaving} onClick={() => void leaveEditor()}><FiArrowLeft /><span>{leaving ? "저장 중…" : "목록으로"}</span></button>
        <button type="button" className="be-top__icon be-popbtn" aria-label="메뉴" onClick={() => setMenu(menu === "file" ? null : "file")}><FiMenu /></button>
        {menu === "file" && (
          <div className="be-pop be-pop--file">
            <button type="button" className="be-file-exit" disabled={leaving} onClick={() => void leaveEditor()}>책 목록으로 나가기</button>
            <a href={`/book/${book.id}`} target="_blank" rel="noreferrer" onClick={() => void ed.flush()}>새 창에서 미리보기</a>
          </div>
        )}
        <input className="be-top__title" aria-label="책 제목" value={book.title} onChange={(event) => ed.commit((open) => ({ ...open, title: event.target.value }), "title")} />
        <span className={`be-top__state${ed.saveState === "error" ? " is-error" : ""}`}><CloudCheck size={18} />{ed.saveState === "saved" && ed.savedAt ? `마지막 저장됨 ${timeText(ed.savedAt)}` : SAVE_TEXT[ed.saveState]}</span>
        <div className="be-top__right">
          <BookZoomControls zoom={zoom} fitScale={fitScale} onChange={changeZoom} />
          <button type="button" className={`be-interact${preview ? " is-on" : ""}`} role="switch" aria-checked={preview} title="동작 미리보기" onClick={() => { setPreview(!preview); ed.setSelectedId(null); }}><i><FiMousePointer /></i></button>
          <a className="be-btn be-btn--soft" href={`/book/${book.id}`} target="_blank" rel="noreferrer" onClick={() => void ed.flush()}><FiPlay />미리보기</a>
          <button type="button" className="be-btn be-btn--line be-popbtn" onClick={() => setMenu(menu === "share" ? null : "share")}>공유</button>
          <button type="button" className="be-btn be-btn--primary" onClick={() => void ed.flush()}>저장</button>
        </div>
        {menu === "share" && (
          <div className="be-pop be-pop--share">
            <div className="be-share__row">
              <div><strong>링크로 공개</strong><small>{book.published ? "링크가 있으면 누구나 볼 수 있습니다." : "지금은 관리자만 볼 수 있습니다."}</small></div>
              <button type="button" role="switch" aria-checked={book.published} aria-label="링크로 공개" className={`be-switch${book.published ? " is-on" : ""}`} onClick={() => ed.commit((open) => ({ ...open, published: !open.published }))}><i /></button>
            </div>
            <div className="be-row"><input className="be-input" readOnly value={bookLink(book.id)} onFocus={(event) => event.target.select()} /><button type="button" className="be-btn be-btn--line be-btn--icon" aria-label="링크 복사" onClick={() => void copyLink()}><FiCopy /></button></div>
            <p className="be-hint">{copied ? "복사했습니다." : "저장되면 이 링크에 바로 반영됩니다."}</p>
            <a className="be-btn be-btn--line be-btn--wide" href={`/book/${book.id}`} target="_blank" rel="noreferrer" onClick={() => void ed.flush()}><FiExternalLink />새 창에서 열기</a>
          </div>
        )}
      </header>

      <div className="be-body">
        <nav className="be-rail" aria-label="도구">
          {RAIL.map((item) => (
            <button key={item.id} type="button" className={panelOpen && panel === item.id ? "is-on" : ""} onClick={() => clickRail(item.id)}>{item.icon}<span>{item.label}</span></button>
          ))}
          <i className="be-rail__fill" />
          <button type="button" className={panelOpen && panel === "uploads" ? "is-on" : ""} onClick={() => clickRail("uploads")}><CloudUpload /><span>업로드</span></button>
        </nav>
        {panelOpen && panel !== "ai" && <LeftPanel ed={ed} panel={panel} paired={spreadView} onClose={() => setPanel("pages")} />}
        {/* Stays mounted so a draft survives switching to another panel. */}
        <div style={{ display: panelOpen && panel === "ai" ? "contents" : "none" }}><AiWriterPanel ed={ed} onClose={() => setPanel("pages")} /></div>

        <main className="be-stagewrap">
          <button type="button" className="be-collapse" aria-label={panelOpen ? "패널 접기" : "패널 펼치기"} onClick={() => setPanelOpen(!panelOpen)}>{panelOpen ? <FiChevronLeft /> : <FiChevronRight />}</button>
          <div ref={stage} className="be-stage" onPointerDown={(event) => { if (event.target === event.currentTarget) ed.setSelectedId(null); }}>
            <div className="be-canvas" onPointerDown={(event) => { if (event.target === event.currentTarget) ed.setSelectedId(null); }}>
              {turning ? (
                <PaperBook
                  book={book} width={pageWidth} height={pageHeight} single={!spreadView} duration={turnDuration}
                  page={spreadView && spread ? spread.left ?? spread.right ?? 0 : pageIndex}
                  controls={paperControls} runtime={runtime}
                  onPage={(index) => { if ((spreadView ? spreadOfPage(index) !== spreadOfPage(turning.from) : index !== turning.from)) finishTurn(index); }}
                  onTurn={() => {}}
                />
              ) : spreadView && spread ? <div className="be-spread">{spread.left !== null && renderPage(spread.left)}{spread.right !== null && renderPage(spread.right)}</div> : renderPage(pageIndex)}
            </div>
          </div>
          {(() => {
            // Page turning under the book, with the pages in view and the total.
            const shown = spreadView && spread ? [spread.left, spread.right].filter((page): page is number => page !== null) : [pageIndex];
            const first = Math.min(...shown);
            const last = Math.max(...shown);
            return (
              <nav className="be-pagebar" aria-label="페이지 넘기기">
                <button type="button" aria-label="처음으로" title="처음으로" disabled={first === 0} onClick={() => go(0)}><ChevronFirst size={18} /></button>
                <button type="button" aria-label="이전" title="이전" disabled={first === 0} onClick={() => turnPage(-1)}><FiChevronLeft /></button>
                <span className="be-pagebar__count"><b>{first === last ? first + 1 : `${first + 1}–${last + 1}`}</b> / {book.pages.length}</span>
                <button type="button" aria-label="다음" title="다음" disabled={last >= book.pages.length - 1} onClick={() => turnPage(1)}><FiChevronRight /></button>
                <button type="button" aria-label="끝으로" title="끝으로" disabled={last >= book.pages.length - 1} onClick={() => go(book.pages.length - 1)}><ChevronLast size={18} /></button>
              </nav>
            );
          })()}
          {selected?.type === "text" && multi.length === 1 && !preview && <TextToolbar ed={ed} element={selected} />}
          {selected && selected.type !== "text" && multi.length === 1 && !preview && <BookElementToolbar key={selected.id} ed={ed} element={selected} />}
          {popup && <BookPopup action={popup} onClose={closePopup} />}
        </main>

        <div className="be-strip">
          <button type="button" aria-label="되돌리기" title="되돌리기" disabled={!ed.canUndo} onClick={ed.undo}><FiRotateCcw /></button>
          <button type="button" aria-label="다시 실행" title="다시 실행" disabled={!ed.canRedo} onClick={ed.redo}><FiRotateCw /></button>
          <hr />
          <button type="button" className={`be-popbtn${menu === "layers" ? " is-on" : ""}`} aria-label="레이어" title="레이어" onClick={() => setMenu(menu === "layers" ? null : "layers")}><FiLayers /></button>
          <button type="button" className={spreadView ? "is-on" : ""} aria-label="펼침면 보기" title="펼침면 보기" onClick={() => setSpreadView(!spreadView)}><FiBookOpen /></button>
          {menu === "layers" && (
            <div className="be-pop be-pop--layers">
              <h4>레이어</h4>
              {page.elements.length === 0 && <p className="be-hint">이 페이지에 요소가 없습니다.</p>}
              {[...page.elements].reverse().map((element) => (
                <button key={element.id} type="button" className={element.id === selectedId ? "is-on" : ""} onClick={() => ed.setSelectedId(element.id)}>{elementName(element)}</button>
              ))}
            </div>
          )}
        </div>
        <Inspector ed={ed} element={selected} multi={multi} onOpenAi={() => { setPanel("ai"); setPanelOpen(true); }} tab={inspectorTab} onTab={setInspectorTab} />
      </div>

      {ed.notice && <div className="be-toast" role="status">{ed.notice}<button type="button" aria-label="닫기" onClick={() => ed.setNotice("")}>×</button></div>}
    </div>
    </BookProvider>
  );
}
