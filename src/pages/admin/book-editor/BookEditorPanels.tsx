import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties, type DragEvent, type ReactNode } from "react";
import { ChevronFirst, ChevronLast, LayoutGrid, LogIn } from "lucide-react";
import { FiChevronLeft, FiChevronRight, FiCode, FiCopy, FiGrid, FiHash, FiInfo, FiList, FiMapPin, FiMusic, FiPlus, FiTrash2, FiUpload, FiX } from "react-icons/fi";
import { BookPageView } from "../../../components/flipbook/BookPageView";
import { BOOK_GRIDS, BOOK_ICONS, BOOK_SHAPES } from "../../../components/flipbook/graphics";
import { blankPage, buildSpreads, spreadOfPage, uid, videoSource, type BookElement, type TextElement } from "../../../lib/flipbooks";
import { fittedImage } from "./BookEditorCanvas";
import type { BookEditorApi } from "./useBookEditor";
import TemplatesPanel from "./BookTemplatesPanel";
import BookElementLibrary, { searchBookElements } from "./BookElementLibrary";

export type PanelId = "pages" | "templates" | "elements" | "images" | "text" | "video" | "audio" | "more" | "uploads";

function Pick({ accept, onPick, className, children }: { accept: string; onPick: (file: File) => void; className?: string; children: ReactNode }) {
  const input = useRef<HTMLInputElement>(null);
  const change = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) onPick(file);
  };
  return (
    <>
      <button type="button" className={className} onClick={() => input.current?.click()}>{children}</button>
      <input ref={input} type="file" accept={accept} hidden onChange={change} />
    </>
  );
}
export { Pick as FilePickButton };

function PagesPanel({ ed, paired }: { ed: BookEditorApi; paired: boolean }) {
  const book = ed.book!;
  const dragFrom = useRef<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [overview, setOverview] = useState(false);
  const pageCount = book.pages.length;
  const spreads = buildSpreads(pageCount);
  const rows = paired ? spreads : book.pages.map((_, index) => ({ left: null, right: index }));
  const go = (index: number) => { ed.setPageIndex(Math.min(pageCount - 1, Math.max(0, index))); ed.setSelectedId(null); };
  const current = spreadOfPage(ed.pageIndex);
  const goSpread = (index: number) => {
    const spread = spreads[Math.min(spreads.length - 1, Math.max(0, index))];
    if (spread) go(spread.left ?? spread.right ?? 0);
  };
  const stepTo = (delta: number) => (paired ? goSpread(current + delta) : go(ed.pageIndex + delta));

  const addBlank = () => {
    const spread = spreads[current];
    // New pages go after this spread, but never behind the back cover.
    const onBackCover = spread && spread.left !== null && spread.right === null;
    const at = paired ? (onBackCover ? spread.left! : (spread?.right ?? ed.pageIndex) + 1) : ed.pageIndex + 1;
    ed.commit((open) => { const pages = [...open.pages]; pages.splice(at, 0, ...(paired ? [blankPage(), blankPage()] : [blankPage()])); return { ...open, pages }; });
    go(at);
  };
  const duplicate = (index: number) => {
    ed.commit((open) => {
      const source = open.pages[index];
      const pages = [...open.pages];
      pages.splice(index + 1, 0, { ...source, id: uid(), elements: source.elements.map((element) => ({ ...element, id: uid() })) });
      return { ...open, pages };
    });
    ed.setPageIndex(index + 1);
  };
  const remove = (index: number) => {
    if (pageCount <= 1) return;
    ed.commit((open) => ({ ...open, pages: open.pages.filter((_, i) => i !== index) }));
    ed.setPageIndex(Math.min(index, pageCount - 2));
    ed.setSelectedId(null);
  };
  const drop = (event: DragEvent, index: number) => {
    event.preventDefault();
    const from = dragFrom.current;
    dragFrom.current = null;
    setDropAt(null);
    if (from === null || from === index) return;
    ed.commit((open) => { const pages = [...open.pages]; const [moved] = pages.splice(from, 1); pages.splice(index, 0, moved); return { ...open, pages }; });
    ed.setPageIndex(index);
  };

  const number = (index: number) => String(index + 1).padStart(2, "0");
  const thumb = (index: number) => {
    const page = book.pages[index];
    return (
      <div
        key={page.id}
        className={`be-thumb${dropAt === index ? " is-drop" : ""}`}
        style={{ aspectRatio: `${book.width} / ${book.height}` }}
        draggable
        onDragStart={() => { dragFrom.current = index; }}
        onDragOver={(event) => { event.preventDefault(); setDropAt(index); }}
        onDragLeave={() => setDropAt((value) => (value === index ? null : value))}
        onDrop={(event) => drop(event, index)}
        onClick={() => { go(index); setOverview(false); }}
      >
        <div className="be-thumb__page"><BookPageView page={page} still /></div>
        <div className="be-thumb__tools">
          <button type="button" aria-label="페이지 복제" onClick={(event) => { event.stopPropagation(); duplicate(index); }}><FiCopy /></button>
          <button type="button" aria-label="페이지 삭제" disabled={pageCount <= 1} onClick={(event) => { event.stopPropagation(); remove(index); }}><FiTrash2 /></button>
        </div>
      </div>
    );
  };
  const cards = rows.map(({ left, right }) => {
    const active = ed.pageIndex === left || ed.pageIndex === right;
    return (
      <div key={`${left ?? "x"}-${right ?? "x"}`} className={`be-card${active ? " is-on" : ""}`}>
        {left !== null && thumb(left)}
        {right !== null && thumb(right)}
        {left !== null && <b className="be-card__num be-card__num--left">{number(left)}</b>}
        {right !== null && <b className="be-card__num be-card__num--right">{number(right)}</b>}
      </div>
    );
  });
  const spread = spreads[current];
  const position = paired && spread ? [spread.left, spread.right].filter((value): value is number => value !== null).map((value) => value + 1).join("-") : String(ed.pageIndex + 1);

  return (
    <div className="be-pages">
      <div className="be-pages__add">
        <button type="button" className="be-btn be-btn--line be-pages__blank" onClick={addBlank}><FiPlus />{paired ? "새 두 페이지" : "새 빈 페이지"}</button>
        <Pick accept="application/pdf" className="be-btn be-btn--line be-btn--icon" onPick={(file) => void ed.importPdf(file, ed.pageIndex)}><span title="PDF 가져오기" style={{ display: "grid" }}><LogIn size={18} /></span></Pick>
      </div>
      <div className="be-pages__list">{cards}</div>
      <div className="be-pager">
        <button type="button" aria-label="첫 페이지" onClick={() => go(0)}><ChevronFirst size={18} /></button>
        <button type="button" aria-label="이전" onClick={() => stepTo(-1)}><FiChevronLeft /></button>
        <span>{position}<small>/{pageCount}</small></span>
        <button type="button" aria-label="다음" onClick={() => stepTo(1)}><FiChevronRight /></button>
        <button type="button" aria-label="마지막 페이지" onClick={() => go(pageCount - 1)}><ChevronLast size={18} /></button>
        <button type="button" className={`be-pager__grid${overview ? " is-on" : ""}`} aria-label="전체 페이지 보기" onClick={() => setOverview(!overview)}><LayoutGrid size={18} /></button>
      </div>
      {overview && <div className="be-overview">{cards}</div>}
    </div>
  );
}

const FAVOURITES_KEY = "index-flipbook:favourites";
const FAVOURITES_EVENT = "index-flipbook-favourites";

function readFavourites(): BookElement[] {
  try {
    return JSON.parse(localStorage.getItem(FAVOURITES_KEY) ?? "[]") as BookElement[];
  } catch {
    return [];
  }
}

export function addFavourite(element: BookElement) {
  try {
    localStorage.setItem(FAVOURITES_KEY, JSON.stringify([{ ...element, id: uid() }, ...readFavourites()].slice(0, 40)));
    window.dispatchEvent(new Event(FAVOURITES_EVENT));
  } catch {
    /* private mode: nothing to keep it in */
  }
}

function useFavourites() {
  const [items, setItems] = useState(readFavourites);
  useEffect(() => {
    const refresh = () => setItems(readFavourites());
    window.addEventListener(FAVOURITES_EVENT, refresh);
    return () => window.removeEventListener(FAVOURITES_EVENT, refresh);
  }, []);
  return items;
}

function Segmented({ value, onChange }: { value: "library" | "favourites"; onChange: (value: "library" | "favourites") => void }) {
  return (
    <div className="be-seg be-seg--flat">
      <button type="button" className={value === "library" ? "is-on" : ""} onClick={() => onChange("library")}>라이브러리</button>
      <button type="button" className={value === "favourites" ? "is-on" : ""} onClick={() => onChange("favourites")}>즐겨찾기</button>
    </div>
  );
}

/** If a photo grid is selected, the photo goes into its slot instead of onto the page. */
function fillSelectedGrid(ed: BookEditorApi, url: string) {
  if (ed.selectedIds.length !== 1) return false;
  const grid = ed.book!.pages.flatMap((page) => page.elements).find((element) => element.id === ed.selectedIds[0]);
  if (grid?.type !== "grid") return false;
  const active = grid.cells[ed.activeCell];
  const index = active && !active.src ? ed.activeCell : Math.max(grid.cells.findIndex((cell) => !cell.src), 0);
  const target = grid.cells.every((cell) => cell.src) ? ed.activeCell : index;
  ed.setGridCell(grid.id, target, { src: url, zoom: 100, focusX: 50, focusY: 50 });
  ed.setActiveCell(target);
  return true;
}

export function GridTile({ cells }: { cells: [number, number, number, number][] }) {
  return <span className="be-gridtile">{cells.map(([x, y, w, h], i) => <i key={i} style={{ left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%` }} />)}</span>;
}

function WidgetTiles({ ed, add }: { ed: BookEditorApi; add: (element: BookElement) => void }) {
  const widget = (element: BookElement) => add(element);
  const box = { actions: [] as never[] };
  return (
      <div className="be-tiles be-tiles--3">
        <button type="button" className="be-tile be-tile--icon" onClick={() => widget({ id: uid(), type: "table", rows: [["항목", "내용", "비고"], ["", "", ""], ["", "", ""]], size: 24, color: "#17181c", headerColor: "#3f6fe0", x: 12, y: 38, w: 76, h: 22, ...box })}><FiGrid /><span>표</span></button>
        <button type="button" className="be-tile be-tile--icon" onClick={() => widget({ id: uid(), type: "map", address: "", x: 15, y: 32, w: 70, h: 32, ...box })}><FiMapPin /><span>지도</span></button>
        <button type="button" className="be-tile be-tile--icon" onClick={() => widget({ id: uid(), type: "embed", url: "", x: 15, y: 32, w: 70, h: 32, ...box })}><FiCode /><span>타사 임베드</span></button>
        <button type="button" className="be-tile be-tile--icon" onClick={() => widget({ id: uid(), type: "tooltip", text: "설명을 입력하세요", color: "#3f6fe0", x: 46, y: 47, w: 6, h: (6 * ed.book!.width) / ed.book!.height, ...box })}><FiInfo /><span>툴팁</span></button>
        <button type="button" className="be-tile be-tile--icon" onClick={() => widget({ id: uid(), type: "pagenumber", size: 26, color: "#17181c", showTotal: false, x: 42, y: 93, w: 16, h: 4, ...box })}><FiHash /><span>페이지 매김</span></button>
        <button type="button" className="be-tile be-tile--icon" onClick={() => widget({ id: uid(), type: "toc", size: 28, color: "#17181c", x: 12, y: 20, w: 76, h: 60, ...box })}><FiList /><span>자동 목차</span></button>
      </div>
  );
}

function ElementsPanel({ ed, add }: { ed: BookEditorApi; add: (element: BookElement) => void }) {
  const [library, setLibrary] = useState<"library" | "favourites">("library");
  const [allGrids, setAllGrids] = useState(false);
  const addGrid = (cells: [number, number, number, number][]) => add({ id: uid(), type: "grid", gap: 8, radius: 0, x: 6, y: 6, w: 88, h: 88, cells: cells.map(([x, y, w, h]) => ({ x, y, w, h })), actions: [] });
  const square = (w: number) => (w * ed.book!.width) / ed.book!.height;
  const addShape = (kind: string) => add({ id: uid(), type: "shape", shape: kind, fill: "#4a78e8", x: 35, y: 40, w: 30, h: square(30), actions: [] });
  const addFrame = (mask: string) => add({ id: uid(), type: "image", src: "", fit: "cover", mask, x: 30, y: 38, w: 40, h: square(40), actions: [] });
  const addIcon = (name: string) => add({ id: uid(), type: "icon", name, color: "#17181c", stroke: 1.8, x: 41, y: 45, w: 18, h: square(18), actions: [] });
  const addLine = (style: "solid" | "dashed" | "dotted", arrow: boolean) => add({ id: uid(), type: "line", color: "#17181c", thickness: 6, style, arrow, x: 25, y: 49, w: 50, h: 2, actions: [] });
  const addChart = (kind: "bar" | "line" | "pie" | "donut") => add({ id: uid(), type: "chart", kind, labels: ["1월", "2월", "3월", "4월"], values: [12, 28, 20, 35], color: "#3f6fe0", textColor: "#17181c", x: 12, y: 35, w: 76, h: 76 * 0.65 * (ed.book!.width / ed.book!.height), actions: [] });
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shapes = BOOK_SHAPES.filter((item) => !q || item.label.includes(q));
  const icons = BOOK_ICONS.filter((item) => !q || item.tags.includes(q) || item.name.toLowerCase().includes(q));
  const button = (color: string, radius: number) => add({ id: uid(), type: "button", label: "버튼", color, textColor: "#ffffff", radius, x: 35, y: 46, w: 30, h: 6, actions: [] });
  const slides = (variant: "basic" | "peek") => add({ id: uid(), type: "slideshow", images: [], auto: true, variant, x: 15, y: 30, w: 70, h: 35, actions: [] });
  const placeLibraryImage = (url: string, width: number, height: number) => { if (!fillSelectedGrid(ed, url)) add(fittedImage(url, width, height, ed.book!.width, ed.book!.height, uid())); };
  const favourites = useFavourites();
  const placeFavourite = (element: BookElement) => add({ ...element, id: uid() });
  if (allGrids) {
    return (
      <div className="be-scroll">
        <button type="button" className="be-backrow" onClick={() => setAllGrids(false)}><FiChevronLeft />사진 그리드</button>
        <div className="be-tiles be-tiles--3">{BOOK_GRIDS.map((cells, i) => <button key={i} type="button" className="be-gridbtn" aria-label={`사진 ${cells.length}칸 그리드`} onClick={() => addGrid(cells)}><GridTile cells={cells} /></button>)}</div>
      </div>
    );
  }
  return (
    <div className="be-scroll">
      <input className="be-input" type="search" placeholder="도형, 그래픽 검색 (예: 소파, 별)" value={query} onChange={(event) => setQuery(event.target.value)} />
      <Segmented value={library} onChange={setLibrary} />
      {library === "favourites" ? (favourites.length === 0
        ? <p className="be-empty">즐겨찾기한 요소가 없습니다.<br />요소를 고르고 설정의 ♥를 누르세요.</p>
        : <div className="be-favlist">{favourites.map((item) => <button key={item.id} type="button" onClick={() => placeFavourite(item)}>{item.type === "text" ? item.text.slice(0, 18) : item.type}</button>)}</div>
      ) : <>
      <BookElementLibrary query={q} onPick={placeLibraryImage} />
      {!q && <>
        <div className="be-sectionhead"><h4>사진 그리드</h4><button type="button" onClick={() => setAllGrids(true)}>모두 보기</button></div>
        <div className="be-tiles be-tiles--3">{BOOK_GRIDS.slice(0, 6).map((cells, i) => <button key={i} type="button" className="be-gridbtn" aria-label={`사진 ${cells.length}칸 그리드`} onClick={() => addGrid(cells)}><GridTile cells={cells} /></button>)}</div>
      </>}
      <h4>위젯</h4>
      <WidgetTiles ed={ed} add={add} />
      <h4>도형</h4>
      <div className="be-tiles be-tiles--4">
        {shapes.map((item) => (
          <button key={item.name} type="button" className="be-tile be-tile--mini" aria-label={item.label} title={item.label} onClick={() => addShape(item.name)}>
            <svg viewBox="0 0 100 100"><path d={item.path} fill="#4a78e8" fillRule="evenodd" /></svg>
          </button>
        ))}
      </div>
      {!q && <>
        <h4>선</h4>
        <div className="be-tiles be-tiles--4">
          <button type="button" className="be-tile be-tile--mini" aria-label="실선" onClick={() => addLine("solid", false)}><span className="be-sampleline" /></button>
          <button type="button" className="be-tile be-tile--mini" aria-label="파선" onClick={() => addLine("dashed", false)}><span className="be-sampleline be-sampleline--dashed" /></button>
          <button type="button" className="be-tile be-tile--mini" aria-label="점선" onClick={() => addLine("dotted", false)}><span className="be-sampleline be-sampleline--dotted" /></button>
          <button type="button" className="be-tile be-tile--mini" aria-label="화살표 선" onClick={() => addLine("solid", true)}><span className="be-sampleline be-sampleline--arrow" /></button>
        </div>
        <h4>사진 프레임</h4>
        <div className="be-tiles be-tiles--4">
          {BOOK_SHAPES.filter((item) => item.frame).map((item) => (
            <button key={item.name} type="button" className="be-tile be-tile--mini" aria-label={`${item.label} 프레임`} title={`${item.label} 프레임`} onClick={() => addFrame(item.name)}>
              <svg viewBox="0 0 100 100"><path d={item.path} fill="#b9c0cc" /></svg>
            </button>
          ))}
        </div>
        <h4>차트</h4>
        <div className="be-tiles be-tiles--4">
          <button type="button" className="be-tile be-tile--mini be-tile--label" onClick={() => addChart("bar")}>막대</button>
          <button type="button" className="be-tile be-tile--mini be-tile--label" onClick={() => addChart("line")}>꺾은선</button>
          <button type="button" className="be-tile be-tile--mini be-tile--label" onClick={() => addChart("pie")}>원형</button>
          <button type="button" className="be-tile be-tile--mini be-tile--label" onClick={() => addChart("donut")}>도넛</button>
        </div>
      </>}
      <h4>그래픽</h4>
      <div className="be-tiles be-tiles--5">
        {icons.map(({ name, tags, Icon }) => <button key={name} type="button" className="be-tile be-tile--mini" aria-label={tags} title={tags} onClick={() => addIcon(name)}><Icon size={22} /></button>)}
      </div>
      {q && shapes.length === 0 && icons.length === 0 && searchBookElements(q).length === 0 && <p className="be-empty">검색 결과가 없습니다.</p>}
      <h4>버튼</h4>
      <div className="be-tiles be-tiles--2">
        <button type="button" className="be-tile" onClick={() => button("#3f6fe0", 300)}><span className="be-samplebtn" style={{ background: "#3f6fe0", borderRadius: 99 }}>둥근 버튼</span></button>
        <button type="button" className="be-tile" onClick={() => button("#17181c", 12)}><span className="be-samplebtn" style={{ background: "#17181c", borderRadius: 6 }}>각진 버튼</span></button>
      </div>
      <h4>슬라이드쇼</h4>
      <div className="be-tiles be-tiles--2">
        <button type="button" className="be-tile" aria-label="기본 슬라이드쇼" onClick={() => slides("basic")}><span className="be-sampleslide"><i /></span></button>
        <button type="button" className="be-tile" aria-label="가운데 강조 슬라이드쇼" onClick={() => slides("peek")}><span className="be-sampleslide be-sampleslide--peek"><u /><i /><u /></span></button>
      </div>
      </>}
    </div>
  );
}

function ImagesPanel({ ed, add }: { ed: BookEditorApi; add: (element: BookElement) => void }) {
  const book = ed.book!;
  const place = (url: string, width: number, height: number) => { if (!fillSelectedGrid(ed, url)) add(fittedImage(url, width, height, book.width, book.height, uid())); };
  const placeKnown = (url: string) => {
    const probe = new Image();
    probe.onload = () => place(url, probe.naturalWidth || 1, probe.naturalHeight || 1);
    probe.onerror = () => place(url, 1, 1);
    probe.src = url;
  };
  const images = book.assets.filter((asset) => asset.kind === "image");
  return (
    <div className="be-scroll">
      <Pick accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" className="be-btn be-btn--primary be-btn--wide" onPick={(file) => void ed.uploadImage(file).then((done) => { if (done) place(done.url, done.width, done.height); })}><FiUpload />이미지 업로드</Pick>
      {images.length === 0 ? <p className="be-empty">아직 올린 이미지가 없습니다.<br />PNG, JPG, GIF, SVG</p> : (
        <div className="be-assets">{images.map((asset) => <button key={asset.url} type="button" onClick={() => placeKnown(asset.url)}><img src={asset.url} alt="" loading="lazy" draggable={false} /></button>)}</div>
      )}
    </div>
  );
}

const TEXT_STYLES: { label: string; color: string; patch: Partial<TextElement>; preview: CSSProperties }[] = [
  { label: "네온", color: "#ffffff", patch: { effect: "neon", effectColor: "#ff4fa3" }, preview: { background: "#17181c", color: "#fff", textShadow: "0 0 6px #ff4fa3, 0 0 14px #ff4fa3" } },
  { label: "그림자", color: "#17181c", patch: { effect: "shadow", effectColor: "#f2b705" }, preview: { color: "#17181c", textShadow: "2px 2px 0 #f2b705" } },
  { label: "속 빈 글자", color: "#17181c", patch: { effect: "hollow" }, preview: { color: "transparent", WebkitTextStroke: "1px #17181c" } },
  { label: "그라데이션", color: "#667eea", patch: { effect: "gradient", effectColor: "#f5576c" }, preview: { color: "transparent", backgroundImage: "linear-gradient(90deg,#667eea,#f5576c)", WebkitBackgroundClip: "text" } },
  { label: "강조 배경", color: "#17181c", patch: { background: "#ffe45c" }, preview: { color: "#17181c", background: "#ffe45c" } },
  { label: "넓은 자간", color: "#17181c", patch: { spacing: 300, textCase: "upper" }, preview: { color: "#17181c", letterSpacing: ".2em" } },
  { label: "명조 제목", color: "#17181c", patch: { font: "'Noto Serif KR'" }, preview: { color: "#17181c", fontFamily: "'Noto Serif KR'" } },
  { label: "둥근 제목", color: "#3f6fe0", patch: { font: "'Jua'", bold: false }, preview: { color: "#3f6fe0", fontFamily: "'Jua'" } },
];

function TextPanel({ add }: { add: (element: BookElement) => void }) {
  const text = (value: string, size: number, bold: boolean, y: number, h: number) => add({ id: uid(), type: "text", text: value, size, color: "#17181c", bold, align: "left", x: 15, y, w: 70, h, actions: [] });
  return (
    <div className="be-scroll be-textadd">
      <button type="button" onClick={() => text("제목을 입력하세요", 72, true, 40, 10)}><strong>제목 추가</strong></button>
      <button type="button" onClick={() => text("부제를 입력하세요", 44, true, 44, 6)}><b>부제 추가</b></button>
      <button type="button" onClick={() => text("본문 내용을 입력하세요", 26, false, 46, 12)}><span>본문 추가</span></button>
      <h4>글자 스타일</h4>
      <div className="be-tiles be-tiles--2">
        {TEXT_STYLES.map((item) => <button key={item.label} type="button" className="be-styletile" style={item.preview} onClick={() => add({ id: uid(), type: "text", text: item.label, size: 72, color: item.color, bold: true, align: "center", x: 10, y: 44, w: 80, h: 11, actions: [], ...item.patch })}>{item.label}</button>)}
      </div>
    </div>
  );
}

function VideoPanel({ ed, add }: { ed: BookEditorApi; add: (element: BookElement) => void }) {
  const [address, setAddress] = useState("");
  const book = ed.book!;
  const place = (src: string) => {
    const w = 70;
    add({ id: uid(), type: "video", src, x: 15, y: 35, w, h: (w * 0.5625 * book.width) / book.height, actions: [] });
  };
  const videos = book.assets.filter((asset) => asset.kind === "video");
  const valid = videoSource(address) !== null;
  return (
    <div className="be-scroll">
      <Pick accept="video/mp4,video/webm" className="be-btn be-btn--primary be-btn--wide" onPick={(file) => void ed.uploadMedia(file, "video").then((url) => { if (url) place(url); })}><FiUpload />비디오 업로드</Pick>
      <p className="be-hint">MP4, 100MB 미만</p>
      <h4>동영상 링크로 넣기</h4>
      <div className="be-row">
        <input className="be-input" value={address} placeholder="유튜브, 비메오, MP4 주소" onChange={(event) => setAddress(event.target.value)} />
        <button type="button" className="be-btn be-btn--line" disabled={!valid} onClick={() => { place(address.trim()); setAddress(""); }}>추가</button>
      </div>
      <p className="be-hint">넣은 뒤 오른쪽 설정에서 재생 구간을 정할 수 있습니다.</p>
      {videos.length > 0 && <h4>올린 비디오</h4>}
      <div className="be-assets">{videos.map((asset) => <button key={asset.url} type="button" onClick={() => place(asset.url)}><video src={asset.url} preload="metadata" muted /></button>)}</div>
    </div>
  );
}

function AudioPanel({ ed, add }: { ed: BookEditorApi; add: (element: BookElement) => void }) {
  const book = ed.book!;
  const place = (src: string) => {
    const w = 10;
    add({ id: uid(), type: "audio", src, color: "#3f6fe0", x: 45, y: 45, w, h: (w * book.width) / book.height, actions: [] });
  };
  const files = book.assets.filter((asset) => asset.kind === "audio");
  return (
    <div className="be-scroll">
      <Pick accept="audio/mpeg,audio/mp4,audio/wav,audio/ogg,audio/aac,audio/x-m4a" className="be-btn be-btn--primary be-btn--wide" onPick={(file) => void ed.uploadMedia(file, "audio").then((url) => { if (url) place(url); })}><FiUpload />오디오 업로드</Pick>
      <p className="be-hint">MP3, M4A, WAV</p>
      {files.map((asset, index) => <button key={asset.url} type="button" className="be-audiofile" onClick={() => place(asset.url)}><FiMusic />오디오 {index + 1}</button>)}
    </div>
  );
}

function UploadsPanel({ ed, add }: { ed: BookEditorApi; add: (element: BookElement) => void }) {
  const book = ed.book!;
  const placeImage = (url: string, width: number, height: number) => { if (!fillSelectedGrid(ed, url)) add(fittedImage(url, width, height, book.width, book.height, uid())); };
  const placeVideo = (src: string) => add({ id: uid(), type: "video", src, x: 15, y: 35, w: 70, h: (70 * 0.5625 * book.width) / book.height, actions: [] });
  const placeAudio = (src: string) => add({ id: uid(), type: "audio", src, color: "#3f6fe0", x: 45, y: 45, w: 10, h: (10 * book.width) / book.height, actions: [] });
  const upload = (file: File) => {
    if (file.type.startsWith("video/")) void ed.uploadMedia(file, "video").then((url) => { if (url) placeVideo(url); });
    else if (file.type.startsWith("audio/")) void ed.uploadMedia(file, "audio").then((url) => { if (url) placeAudio(url); });
    else void ed.uploadImage(file).then((done) => { if (done) placeImage(done.url, done.width, done.height); });
  };
  const placeKnown = (url: string) => {
    const probe = new Image();
    probe.onload = () => placeImage(url, probe.naturalWidth || 1, probe.naturalHeight || 1);
    probe.onerror = () => placeImage(url, 1, 1);
    probe.src = url;
  };
  return (
    <div className="be-scroll">
      <Pick accept="image/*,video/mp4,video/webm,audio/*" className="be-btn be-btn--primary be-btn--wide" onPick={upload}><FiUpload />파일 업로드</Pick>
      {book.assets.length === 0 ? <p className="be-empty">아직 올린 자료가 없습니다.<br />이미지, MP4, 오디오 · 100MB 미만</p> : (
        <div className="be-assets">
          {book.assets.map((asset) => (
            <button key={asset.url} type="button" aria-label="자료 넣기" onClick={() => (asset.kind === "video" ? placeVideo(asset.url) : asset.kind === "audio" ? placeAudio(asset.url) : placeKnown(asset.url))}>
              {asset.kind === "image" ? <img src={asset.url} alt="" loading="lazy" draggable={false} /> : asset.kind === "video" ? <video src={asset.url} preload="metadata" muted /> : <FiMusic />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const TITLES: Record<PanelId, string> = { more: "더 보기", uploads: "업로드", pages: "페이지", templates: "템플릿", elements: "요소", images: "이미지", text: "텍스트", video: "비디오", audio: "오디오" };

export function LeftPanel({ ed, panel, paired, onClose }: { ed: BookEditorApi; panel: PanelId; paired: boolean; onClose: () => void }) {
  const add = (element: BookElement) => ed.addElement(element, ed.pageIndex);
  return (
    <div className="be-panel">
      {panel !== "pages" && <header className="be-panel__head"><h3>{TITLES[panel]}</h3><button type="button" aria-label="패널 닫기" onClick={onClose}><FiX /></button></header>}
      {panel === "pages" && <PagesPanel ed={ed} paired={paired} />}
      {panel === "templates" && <TemplatesPanel ed={ed} />}
      {panel === "more" && <div className="be-scroll"><WidgetTiles ed={ed} add={add} /></div>}
      {panel === "uploads" && <UploadsPanel ed={ed} add={add} />}
      {panel === "elements" && <ElementsPanel ed={ed} add={add} />}
      {panel === "images" && <ImagesPanel ed={ed} add={add} />}
      {panel === "text" && <TextPanel add={add} />}
      {panel === "video" && <VideoPanel ed={ed} add={add} />}
      {panel === "audio" && <AudioPanel ed={ed} add={add} />}
    </div>
  );
}
