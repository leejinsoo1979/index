import { useEffect, useState, type ReactNode } from "react";
import { FiAlignCenter, FiAlignJustify, FiAlignLeft, FiAlignRight, FiArrowDown, FiArrowUp, FiBold, FiCopy, FiEye, FiHeart, FiImage, FiItalic, FiLink, FiLogIn, FiMail, FiMinus, FiMonitor, FiPhone, FiPlay, FiPlus, FiStar, FiTrash2, FiUnderline, FiUpload, FiX, FiCheck } from "react-icons/fi";
import { CustomSelect } from "../../../components/ui/custom-select";
import { BOOK_GRADIENTS, BOOK_GRIDS, BOOK_SHAPES, IMAGE_PRESETS } from "../../../components/flipbook/graphics";
import { BOOK_FONTS, type BookAction, type BookAnimation, type BookElement, type ChartElement, type Flipbook, type GridElement, type ImageElement, type SlideshowElement, type TableElement, type VideoElement, cropRect, formatTime, parseTime, uid, videoSource } from "../../../lib/flipbooks";
import BookReaderSettings from "./BookReaderSettings";
import { FilePickButton, GridTile, addFavourite } from "./BookEditorPanels";
import type { BookEditorApi } from "./useBookEditor";

type Kind = BookAction["kind"];

const ACTIONS: { kind: Kind; label: string; icon: ReactNode }[] = [
  { kind: "url", label: "링크 열기", icon: <FiLink /> },
  { kind: "page", label: "페이지로 이동", icon: <FiLogIn /> },
  { kind: "tel", label: "전화 걸기", icon: <FiPhone /> },
  { kind: "play", label: "재생 효과", icon: <FiStar /> },
  { kind: "popupWeb", label: "팝업 창", icon: <FiMonitor /> },
  { kind: "popupImage", label: "팝업 이미지", icon: <FiImage /> },
  { kind: "popupMessage", label: "팝업 메시지", icon: <FiMail /> },
  { kind: "toggle", label: "표시/숨기기", icon: <FiEye /> },
  { kind: "popupVideo", label: "팝업 비디오", icon: <FiPlay /> },
];

const emptyAction = (kind: Kind): BookAction => {
  switch (kind) {
    case "url": return { kind, url: "" };
    case "page": return { kind, pageId: "" };
    case "tel": return { kind, phone: "" };
    case "play": case "toggle": return { kind, targetId: "" };
    case "popupWeb": return { kind, url: "" };
    case "popupImage": return { kind, src: "" };
    case "popupMessage": return { kind, title: "", body: "" };
    case "popupVideo": return { kind, src: "" };
  }
};

const ANIMATIONS: { value: BookAnimation; label: string }[] = [
  { value: "none", label: "없음" },
  { value: "fade", label: "서서히 나타남" },
  { value: "up", label: "아래에서 올라옴" },
  { value: "left", label: "왼쪽에서 들어옴" },
  { value: "zoom", label: "확대되며 나타남" },
];

const ELEMENT_NAME: Record<BookElement["type"], string> = { image: "이미지", text: "텍스트", shape: "도형", link: "링크", button: "버튼", video: "비디오", slideshow: "슬라이드쇼", audio: "오디오", table: "표", map: "지도", embed: "타사 임베드", tooltip: "툴팁", pagenumber: "페이지 매김", toc: "자동 목차", grid: "사진 그리드", line: "선", icon: "그래픽", chart: "차트" };

/** Recolours a whole book in one step; each stays editable afterwards. */
const PALETTES: { name: string; page: string; text: string; accent: string; viewer: string }[] = [
  { name: "하늘색", page: "#ffffff", text: "#1e2b3c", accent: "#3f8ff0", viewer: "#1d2a3a" },
  { name: "고사리 녹색", page: "#f6f9f1", text: "#26361f", accent: "#6a9c3d", viewer: "#25301f" },
  { name: "따뜻한 브라운", page: "#f3ece3", text: "#46372b", accent: "#a97c50", viewer: "#30261d" },
  { name: "차콜", page: "#26282e", text: "#f2f2f3", accent: "#e8894f", viewer: "#121317" },
  { name: "테라코타", page: "#fbf6f1", text: "#2b211c", accent: "#b45f3e", viewer: "#3a2a22" },
  { name: "미스트 블루", page: "#f4f6f8", text: "#1f2a36", accent: "#6f8aa3", viewer: "#1b232c" },
];

function applyPalette(book: Flipbook, palette: (typeof PALETTES)[number]): Flipbook {
  return {
    ...book,
    background: palette.viewer,
    pages: book.pages.map((page) => ({
      ...page,
      background: page.image ? page.background : palette.page,
      elements: page.elements.map((element) => {
        if (element.type === "text" || element.type === "table" || element.type === "toc" || element.type === "pagenumber") return { ...element, color: palette.text, ...(element.type === "table" ? { headerColor: palette.accent } : {}) };
        if (element.type === "shape") return { ...element, fill: palette.accent, fill2: undefined };
        if (element.type === "line" || element.type === "icon") return { ...element, color: palette.text };
        if (element.type === "chart") return { ...element, color: palette.accent, textColor: palette.text };
        if (element.type === "button" || element.type === "audio" || element.type === "tooltip") return { ...element, color: palette.accent };
        return element;
      }),
    })),
  };
}
export const elementName = (element: BookElement) => (element.type === "text" ? element.text.slice(0, 14) || "텍스트" : element.type === "button" ? element.label : ELEMENT_NAME[element.type]);

function Num({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (value: number) => void; step?: number }) {
  return (
    <label className="be-num"><span>{label}</span>
      <input type="number" step={step} value={Math.round(value * 10) / 10} onChange={(event) => { const next = Number(event.target.value); if (Number.isFinite(next)) onChange(next); }} />
    </label>
  );
}

function Colour({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="be-colour"><span>{label}</span><input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff"} onChange={(event) => onChange(event.target.value)} /></label>;
}

function Segments<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: ReactNode; title?: string }[]; onChange: (value: T) => void }) {
  return <div className="be-seg">{options.map((option) => <button key={option.value} type="button" title={option.title} className={value === option.value ? "is-on" : ""} onClick={() => onChange(option.value)}>{option.label}</button>)}</div>;
}

function PageSettings({ ed }: { ed: BookEditorApi }) {
  const book = ed.book!;
  const page = book.pages[ed.pageIndex];
  const [mode, setMode] = useState<"image" | "color">(page.image ? "image" : "color");
  useEffect(() => setMode(page.image ? "image" : "color"), [page.id, page.image]);
  const applyAll = () => ed.commit((open) => ({ ...open, pages: open.pages.map((item) => ({ ...item, background: page.background, ...(mode === "image" ? { image: page.image } : {}) })) }));
  const setSize = (patch: { width?: number; height?: number }) => ed.commit((open) => ({ ...open, ...patch }), "page-size");
  return (
    <div className="be-inspect">
      <section>
        <h4>페이지 크기</h4>
        <div className="be-grid2">
          <Num label="W" value={book.width} onChange={(width) => { if (width >= 100) setSize({ width }); }} />
          <Num label="H" value={book.height} onChange={(height) => { if (height >= 100) setSize({ height }); }} />
        </div>
      </section>
      <section>
        <h4>페이지 이름</h4>
        <input className="be-input" placeholder="자동 목차에 표시됩니다" value={page.title ?? ""} onChange={(event) => ed.updatePage(ed.pageIndex, { title: event.target.value }, `title:${page.id}`)} />
      </section>
      <section>
        <h4>색 구성표</h4>
        <div className="be-palettes" role="list">
          {PALETTES.map((palette) => {
            const current = book.background === palette.viewer;
            return (
              <button key={palette.name} type="button" role="listitem" className={`be-palette${current ? " is-on" : ""}`} aria-pressed={current} title="종이 · 강조 · 배경" onClick={() => ed.commit((open) => applyPalette(open, palette))}>
                <span className="be-palette__strip">
                  <span className="be-palette__paper" style={{ background: palette.page, color: palette.text }}>
                    <b>제목</b><small>본문 글자</small>
                  </span>
                  <span className="be-palette__accent" style={{ background: palette.accent }} />
                  <span className="be-palette__viewer" style={{ background: palette.viewer }} />
                </span>
                <span className="be-palette__name">{palette.name}{current && <FiCheck />}</span>
              </button>
            );
          })}
        </div>
      </section>
      <section>
        <h4>배경</h4>
        <Segments value={mode} onChange={setMode} options={[{ value: "image", label: "이미지" }, { value: "color", label: "색상" }]} />
        {mode === "color" ? (
          <>
            <Colour label="색상을 선택하세요" value={page.background ?? "#ffffff"} onChange={(background) => ed.updatePage(ed.pageIndex, { background }, `bg:${page.id}`)} />
            <div className="be-gradients">{BOOK_GRADIENTS.map(([from, to]) => <button key={from + to} type="button" aria-label="그라데이션 배경" style={{ background: `linear-gradient(135deg, ${from}, ${to})` }} onClick={() => ed.updatePage(ed.pageIndex, { background: `linear-gradient(135deg, ${from}, ${to})` })} />)}</div>
          </>
        ) : (
          <div className="be-bgimage">
            {page.image && <img src={page.image} alt="" />}
            <FilePickButton accept="image/png,image/jpeg,image/webp" className="be-btn be-btn--line be-btn--wide" onPick={(file) => void ed.uploadImage(file).then((done) => { if (done) ed.updatePage(ed.pageIndex, { image: done.url }); })}><FiUpload />{page.image ? "이미지 바꾸기" : "이미지 올리기"}</FilePickButton>
            {page.image && <button type="button" className="be-btn be-btn--line be-btn--wide" onClick={() => ed.updatePage(ed.pageIndex, { image: undefined })}>이미지 지우기</button>}
          </div>
        )}
        <button type="button" className="be-btn be-btn--line be-btn--wide" onClick={applyAll}>모든 페이지에 적용</button>
      </section>
      <section>
        <h4>뷰어 배경</h4>
        <Colour label="책 뒤에 보이는 색" value={book.background} onChange={(background) => ed.commit((open) => ({ ...open, background }), "viewer-bg")} />
      </section>
      <BookReaderSettings ed={ed} />
    </div>
  );
}

function SlideImages({ element, ed }: { element: SlideshowElement; ed: BookEditorApi }) {
  const set = (images: string[]) => ed.updateElement(element.id, { images } as Partial<BookElement>);
  return (
    <section>
      <h4>사진 ({element.images.length})</h4>
      <div className="be-slideimages">
        {element.images.map((src, index) => (
          <div key={`${src}-${index}`}><img src={src} alt="" /><button type="button" aria-label="사진 빼기" onClick={() => set(element.images.filter((_, i) => i !== index))}><FiX /></button></div>
        ))}
      </div>
      <FilePickButton accept="image/png,image/jpeg,image/webp,image/gif" className="be-btn be-btn--line be-btn--wide" onPick={(file) => void ed.uploadImage(file).then((done) => { if (done) set([...element.images, done.url]); })}><FiPlus />사진 추가</FilePickButton>
      <label className="be-check"><input type="checkbox" checked={element.auto} onChange={(event) => ed.updateElement(element.id, { auto: event.target.checked } as Partial<BookElement>)} />자동으로 넘기기</label>
    </section>
  );
}

const px = (percent: number, size: number) => (percent * size) / 100;
const pct = (value: number, size: number) => (value / size) * 100;

function Slider({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  return (
    <label className="be-slider"><span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
      <output>{Math.round(value * 100) / 100}</output>
    </label>
  );
}

function TableEditor({ element, patch }: { element: TableElement; patch: (next: Record<string, unknown>, key?: string) => void }) {
  const columns = element.rows[0]?.length ?? 1;
  const setCell = (r: number, c: number, value: string) => patch({ rows: element.rows.map((row, i) => (i === r ? row.map((cell, j) => (j === c ? value : cell)) : row)) }, `cell:${r}:${c}`);
  const addRow = () => patch({ rows: [...element.rows, Array(columns).fill("")] });
  const removeRow = () => { if (element.rows.length > 1) patch({ rows: element.rows.slice(0, -1) }); };
  const addColumn = () => patch({ rows: element.rows.map((row) => [...row, ""]) });
  const removeColumn = () => { if (columns > 1) patch({ rows: element.rows.map((row) => row.slice(0, -1)) }); };
  return (
    <section>
      <h4>표</h4>
      <div className="be-tablegrid" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
        {element.rows.flatMap((row, r) => row.map((cell, c) => <input key={`${r}-${c}`} aria-label={`${r + 1}행 ${c + 1}열`} value={cell} onChange={(event) => setCell(r, c, event.target.value)} />))}
      </div>
      <div className="be-grid2">
        <button type="button" className="be-btn be-btn--line" onClick={addRow}>행 추가</button>
        <button type="button" className="be-btn be-btn--line" onClick={removeRow}>행 삭제</button>
        <button type="button" className="be-btn be-btn--line" onClick={addColumn}>열 추가</button>
        <button type="button" className="be-btn be-btn--line" onClick={removeColumn}>열 삭제</button>
      </div>
      <Num label="크기" value={element.size} onChange={(size) => { if (size > 0) patch({ size }, "size"); }} />
      <div className="be-grid2"><Colour label="제목 행" value={element.headerColor} onChange={(headerColor) => patch({ headerColor }, "headerColor")} /><Colour label="글자" value={element.color} onChange={(color) => patch({ color }, "color")} /></div>
    </section>
  );
}

/** Seconds shown and typed as 1:23; a bad entry falls back to what was there. */
function TimeField({ label, value, onChange }: { label: string; value?: number; onChange: (value: number | undefined) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const save = () => {
    if (draft === null) return;
    if (draft.trim() === "") onChange(undefined);
    else { const seconds = parseTime(draft); if (seconds !== null) onChange(seconds); }
    setDraft(null);
  };
  return (
    <label className="be-num"><span>{label}</span>
      <input placeholder="0:00" inputMode="numeric" value={draft ?? formatTime(value)} onChange={(event) => setDraft(event.target.value)} onBlur={save} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); event.stopPropagation(); }} />
    </label>
  );
}

function rangeNote(src: string, start?: number, end?: number): string {
  const source = videoSource(src);
  if (!source) return src.trim() ? "유튜브, 비메오, MP4·WEBM 주소를 넣어 주세요." : "";
  if (end !== undefined && end <= (start ?? 0)) return "끝 시간은 시작 시간보다 뒤여야 합니다.";
  if (source.kind === "vimeo" && end !== undefined) return "비메오는 시작 시간만 적용되고 끝 시간은 적용되지 않습니다.";
  return "";
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const MAX_CROP_ZOOM = 400;

/** The whole video with the visible area drawn on it: drag it to move, pull a corner to resize. */
function VideoCropPicker({ element, slotRatio, patch }: { element: VideoElement; slotRatio: number; patch: (next: Record<string, unknown>, key?: string) => void }) {
  const source = videoSource(element.src);
  const [fileRatio, setFileRatio] = useState(16 / 9);
  const [thumb, setThumb] = useState<"hq720" | "mqdefault">("hq720");
  const frameRatio = source?.kind === "file" ? fileRatio : source?.kind === "youtube" && source.vertical ? 9 / 16 : 16 / 9;
  const area = cropRect(frameRatio, slotRatio, element);
  const zoom = element.cropZoom ?? 100;

  const follow = (onMove: (event: PointerEvent) => void) => {
    const up = () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up); };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };
  const place = (nextZoom: number, left: number, top: number) => {
    const size = cropRect(frameRatio, slotRatio, { cropZoom: nextZoom });
    const x = size.w < 1 ? (clamp(left, 0, 1 - size.w) / (1 - size.w)) * 100 : 50;
    const y = size.h < 1 ? (clamp(top, 0, 1 - size.h) / (1 - size.h)) * 100 : 50;
    patch({ cropZoom: nextZoom, cropX: x, cropY: y }, "crop");
  };
  const startMove = (event: React.PointerEvent) => {
    event.preventDefault();
    const frame = (event.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
    const { clientX, clientY } = event;
    follow((move) => place(zoom, area.left + (move.clientX - clientX) / frame.width, area.top + (move.clientY - clientY) / frame.height));
  };
  const startResize = (event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const frame = (event.currentTarget.parentElement!.parentElement as HTMLElement).getBoundingClientRect();
    const centreX = area.left + area.w / 2;
    const centreY = area.top + area.h / 2;
    follow((move) => {
      const dx = Math.abs((move.clientX - frame.left) / frame.width - centreX);
      const dy = Math.abs((move.clientY - frame.top) / frame.height - centreY);
      const scale = Math.max(dx / (area.w / 2), dy / (area.h / 2));
      const nextZoom = Math.round(clamp(zoom / scale, 100, MAX_CROP_ZOOM));
      const size = cropRect(frameRatio, slotRatio, { cropZoom: nextZoom });
      place(nextZoom, centreX - size.w / 2, centreY - size.h / 2);
    });
  };

  return (
    <>
      <div className="be-cropframe" style={{ aspectRatio: frameRatio }}>
        {source?.kind === "youtube" && <img src={`https://i.ytimg.com/vi/${source.id}/${thumb}.jpg`} alt="" draggable={false} onError={() => setThumb("mqdefault")} />}
        {source?.kind === "file" && <video src={`${source.url}#t=${element.start ?? 0}`} preload="metadata" muted playsInline onLoadedMetadata={(event) => { const { videoWidth, videoHeight } = event.currentTarget; if (videoWidth && videoHeight) setFileRatio(videoWidth / videoHeight); }} />}
        <div className="be-croparea" role="slider" aria-label="보여 줄 영역" aria-valuenow={zoom} style={{ left: `${area.left * 100}%`, top: `${area.top * 100}%`, width: `${area.w * 100}%`, height: `${area.h * 100}%` }} onPointerDown={startMove}>
          {["nw", "ne", "sw", "se"].map((corner) => <i key={corner} className={`be-cropcorner be-cropcorner--${corner}`} onPointerDown={startResize} />)}
        </div>
      </div>
      <Slider label="확대" min={100} max={MAX_CROP_ZOOM} step={1} value={zoom} onChange={(next) => { const middleX = area.left + area.w / 2; const middleY = area.top + area.h / 2; const size = cropRect(frameRatio, slotRatio, { cropZoom: next }); place(next, middleX - size.w / 2, middleY - size.h / 2); }} />
      {zoom !== 100 && <button type="button" className="be-btn be-btn--line be-btn--wide" onClick={() => patch({ cropZoom: 100, cropX: 50, cropY: 50 })}>영역 처음으로</button>}
    </>
  );
}

function VideoEditor({ element, slotRatio, patch }: { element: VideoElement; slotRatio: number; patch: (next: Record<string, unknown>, key?: string) => void }) {
  const note = rangeNote(element.src, element.start, element.end);
  return (
    <section>
      <h4>동영상</h4>
      <input className="be-input" aria-label="동영상 주소" placeholder="유튜브, 비메오, MP4 주소" value={element.src.startsWith("data:") ? "" : element.src} onChange={(event) => patch({ src: event.target.value.trim() }, "src")} />
      <h4>슬롯에 보이는 방식</h4>
      <Segments value={element.fit ?? "cover"} onChange={(fit) => patch({ fit })} options={[{ value: "contain", label: "전체 보기", title: "영상 전체가 보이고 남는 곳은 여백이 됩니다" }, { value: "cover", label: "영역 선택", title: "영상에서 고른 영역을 슬롯에 꽉 채웁니다" }]} />
      {element.fit === "contain"
        ? <p className="be-hint">영상 전체가 슬롯 안에 보입니다. 비율이 다르면 여백이 생깁니다.</p>
        : videoSource(element.src) && <>
            <p className="be-hint">파란 영역이 슬롯에 보입니다. 끌어서 옮기고 모서리로 늘리거나 줄이세요.</p>
            <VideoCropPicker element={element} slotRatio={slotRatio} patch={patch} />
          </>}
      <h4>재생 구간</h4>
      <div className="be-grid2">
        <TimeField label="시작" value={element.start} onChange={(start) => patch({ start })} />
        <TimeField label="끝" value={element.end} onChange={(end) => patch({ end })} />
      </div>
      {note ? <p className="be-aierror">{note}</p> : <p className="be-hint">비워 두면 처음부터 끝까지 재생합니다. 1:30처럼 적으세요. 캔버스의 재생 버튼으로 바로 확인할 수 있습니다.</p>}
      <label className="be-check"><input type="checkbox" checked={Boolean(element.autoPlay)} onChange={(event) => patch({ autoPlay: event.target.checked })} />페이지가 열리면 소리 없이 자동 재생</label>
      <label className="be-check"><input type="checkbox" checked={Boolean(element.controls)} onChange={(event) => patch({ controls: event.target.checked })} />재생 바 표시</label>
    </section>
  );
}

function GridEditor({ element, ed, patch }: { element: GridElement; ed: BookEditorApi; patch: (next: Record<string, unknown>, key?: string) => void }) {
  const index = Math.min(ed.activeCell, element.cells.length - 1);
  const cell = element.cells[index];
  const swapLayout = (cells: [number, number, number, number][]) => {
    // Photos stay, in slot order, as far as the new layout has room.
    const photos = element.cells.filter((item) => item.src);
    patch({ cells: cells.map(([x, y, w, h], i) => ({ x, y, w, h, ...(photos[i] ? { src: photos[i].src, zoom: photos[i].zoom, focusX: photos[i].focusX, focusY: photos[i].focusY } : {}) })) });
    ed.setActiveCell(0);
  };
  return (
    <>
      <section>
        <h4>사진 넣기</h4>
        <p className="be-hint">칸에 사진을 끌어다 놓거나 칸을 더블클릭하세요. 아래에서 칸을 고를 수도 있습니다.</p>
        <div className="be-cellmap" style={{ aspectRatio: `${ed.book!.width * element.w} / ${ed.book!.height * element.h}` }}>
          {element.cells.map((item, i) => (
            <button key={i} type="button" aria-label={`${i + 1}번 칸`} className={i === index ? "is-on" : ""} style={{ left: `${item.x}%`, top: `${item.y}%`, width: `${item.w}%`, height: `${item.h}%` }} onClick={() => ed.setActiveCell(i)}>
              {item.src ? <img src={item.src} alt="" /> : i + 1}
            </button>
          ))}
        </div>
        <FilePickButton accept="image/png,image/jpeg,image/webp,image/gif" className="be-btn be-btn--line be-btn--wide" onPick={(file) => void ed.uploadImage(file).then((done) => { if (done) ed.setGridCell(element.id, index, { src: done.url, zoom: 100, focusX: 50, focusY: 50 }); })}><FiUpload />{cell?.src ? `${index + 1}번 칸 사진 바꾸기` : `${index + 1}번 칸에 사진 넣기`}</FilePickButton>
        {cell?.src && (
          <>
            <button type="button" className="be-btn be-btn--line be-btn--wide" onClick={() => ed.setGridCell(element.id, index, { src: undefined })}>칸 비우기</button>
            <Slider label="확대" min={100} max={300} step={1} value={cell.zoom ?? 100} onChange={(zoom) => ed.setGridCell(element.id, index, { zoom }, `cell-zoom:${element.id}:${index}`)} />
            <Slider label="가로" min={0} max={100} step={1} value={cell.focusX ?? 50} onChange={(focusX) => ed.setGridCell(element.id, index, { focusX }, `cell-x:${element.id}:${index}`)} />
            <Slider label="세로" min={0} max={100} step={1} value={cell.focusY ?? 50} onChange={(focusY) => ed.setGridCell(element.id, index, { focusY }, `cell-y:${element.id}:${index}`)} />
          </>
        )}
      </section>
      <section>
        <h4>간격과 모서리</h4>
        <Slider label="간격" min={0} max={60} step={1} value={element.gap} onChange={(gap) => patch({ gap }, "gap")} />
        <Slider label="모서리" min={0} max={80} step={1} value={element.radius} onChange={(radius) => patch({ radius }, "radius")} />
      </section>
      <section>
        <h4>레이아웃 바꾸기</h4>
        <div className="be-layoutpick">{BOOK_GRIDS.map((cells, i) => <button key={i} type="button" aria-label={`사진 ${cells.length}칸 레이아웃`} onClick={() => swapLayout(cells)}><GridTile cells={cells} /></button>)}</div>
      </section>
    </>
  );
}

function PhotoEditor({ element, patch }: { element: ImageElement; patch: (next: Record<string, unknown>, key?: string) => void }) {
  return (
    <section>
      <h4>사진 보정</h4>
      <div className="be-presets">{IMAGE_PRESETS.map((preset) => <button key={preset.label} type="button" onClick={() => patch(preset.values)}>{preset.label}</button>)}</div>
      <Slider label="밝기" min={40} max={180} step={1} value={element.brightness ?? 100} onChange={(brightness) => patch({ brightness }, "brightness")} />
      <Slider label="대비" min={40} max={180} step={1} value={element.contrast ?? 100} onChange={(contrast) => patch({ contrast }, "contrast")} />
      <Slider label="채도" min={0} max={200} step={1} value={element.saturate ?? 100} onChange={(saturate) => patch({ saturate }, "saturate")} />
      <Slider label="흐림" min={0} max={40} step={1} value={element.blur ?? 0} onChange={(blur) => patch({ blur }, "blur")} />
      <h4>자르기</h4>
      <Slider label="확대" min={100} max={300} step={1} value={element.zoom ?? 100} onChange={(zoom) => patch({ zoom }, "zoom")} />
      <Slider label="가로" min={0} max={100} step={1} value={element.focusX ?? 50} onChange={(focusX) => patch({ focusX }, "focusX")} />
      <Slider label="세로" min={0} max={100} step={1} value={element.focusY ?? 50} onChange={(focusY) => patch({ focusY }, "focusY")} />
      <div className="be-grid2">
        <button type="button" className="be-btn be-btn--line" onClick={() => patch({ flipX: !element.flipX })}>좌우 반전</button>
        <button type="button" className="be-btn be-btn--line" onClick={() => patch({ flipY: !element.flipY })}>상하 반전</button>
      </div>
      <h4>프레임</h4>
      <div className="be-shapepick">
        <button type="button" title="없음" className={!element.mask ? "is-on" : ""} onClick={() => patch({ mask: undefined })}><svg viewBox="0 0 100 100"><path d="M0 0H100V100H0Z" /></svg></button>
        {BOOK_SHAPES.filter((item) => item.frame).map((item) => <button key={item.name} type="button" title={item.label} className={element.mask === item.name ? "is-on" : ""} onClick={() => patch({ mask: item.name })}><svg viewBox="0 0 100 100"><path d={item.path} /></svg></button>)}
      </div>
    </section>
  );
}

function ChartEditor({ element, patch }: { element: ChartElement; patch: (next: Record<string, unknown>, key?: string) => void }) {
  const setLabel = (i: number, value: string) => patch({ labels: element.labels.map((label, j) => (j === i ? value : label)) }, `label:${i}`);
  const setValue = (i: number, value: number) => patch({ values: element.values.map((item, j) => (j === i ? value : item)) }, `value:${i}`);
  return (
    <section>
      <h4>차트</h4>
      <Segments value={element.kind} onChange={(kind) => patch({ kind })} options={[{ value: "bar", label: "막대" }, { value: "line", label: "꺾은선" }, { value: "pie", label: "원형" }, { value: "donut", label: "도넛" }]} />
      {element.labels.map((label, i) => (
        <div key={i} className="be-row">
          <input className="be-input" aria-label={`항목 ${i + 1}`} value={label} onChange={(event) => setLabel(i, event.target.value)} />
          <input className="be-input be-input--num" aria-label={`값 ${i + 1}`} type="number" value={element.values[i]} onChange={(event) => setValue(i, Number(event.target.value) || 0)} />
          <button type="button" className="be-toggle" aria-label="항목 삭제" disabled={element.labels.length <= 1} onClick={() => patch({ labels: element.labels.filter((_, j) => j !== i), values: element.values.filter((_, j) => j !== i) })}><FiX /></button>
        </div>
      ))}
      <button type="button" className="be-btn be-btn--line be-btn--wide" onClick={() => patch({ labels: [...element.labels, "항목"], values: [...element.values, 10] })}><FiPlus />항목 추가</button>
      <div className="be-grid2"><Colour label="색상" value={element.color} onChange={(color) => patch({ color }, "color")} /><Colour label="글자" value={element.textColor} onChange={(textColor) => patch({ textColor }, "textColor")} /></div>
    </section>
  );
}

function MultiSettings({ elements, ed }: { elements: BookElement[]; ed: BookEditorApi }) {
  const left = Math.min(...elements.map((item) => item.x));
  const top = Math.min(...elements.map((item) => item.y));
  const right = Math.max(...elements.map((item) => item.x + item.w));
  const bottom = Math.max(...elements.map((item) => item.y + item.h));
  const apply = (place: (item: BookElement) => Partial<BookElement>) => ed.updateElements(Object.fromEntries(elements.map((item) => [item.id, place(item)])));
  const grouped = elements.every((item) => item.groupId && item.groupId === elements[0].groupId);
  const distribute = (axis: "x" | "y") => {
    const size = axis === "x" ? "w" : "h";
    const sorted = [...elements].sort((a, b) => a[axis] - b[axis]);
    const start = axis === "x" ? left : top;
    const end = axis === "x" ? right : bottom;
    const gap = (end - start - sorted.reduce((sum, item) => sum + item[size], 0)) / (sorted.length - 1);
    let cursor = start;
    const patches: Record<string, Partial<BookElement>> = {};
    for (const item of sorted) { patches[item.id] = { [axis]: cursor }; cursor += item[size] + gap; }
    ed.updateElements(patches);
  };
  return (
    <div className="be-inspect">
      <section>
        <h4>{elements.length}개 선택됨</h4>
        <div className="be-aligns">
          <button type="button" title="왼쪽 맞춤" onClick={() => apply(() => ({ x: left }))}><FiAlignLeft /></button>
          <button type="button" title="가로 가운데" onClick={() => apply((item) => ({ x: (left + right) / 2 - item.w / 2 }))}><FiAlignCenter /></button>
          <button type="button" title="오른쪽 맞춤" onClick={() => apply((item) => ({ x: right - item.w }))}><FiAlignRight /></button>
          <button type="button" title="위쪽 맞춤" onClick={() => apply(() => ({ y: top }))}><FiArrowUp /></button>
          <button type="button" title="세로 가운데" onClick={() => apply((item) => ({ y: (top + bottom) / 2 - item.h / 2 }))}><FiMinus /></button>
          <button type="button" title="아래쪽 맞춤" onClick={() => apply((item) => ({ y: bottom - item.h }))}><FiArrowDown /></button>
        </div>
        {elements.length > 2 && <div className="be-grid2"><button type="button" className="be-btn be-btn--line" onClick={() => distribute("x")}>가로 균등</button><button type="button" className="be-btn be-btn--line" onClick={() => distribute("y")}>세로 균등</button></div>}
        <button type="button" className="be-btn be-btn--line be-btn--wide" onClick={() => { const groupId = grouped ? undefined : uid(); apply(() => ({ groupId })); }}>{grouped ? "그룹 해제" : "그룹으로 묶기"}</button>
      </section>
      <section className="be-iconrow">
        <button type="button" title="복제" onClick={() => ed.placeCopies(elements, ed.pageIndex)}><FiCopy /></button>
        <button type="button" title="삭제" onClick={() => ed.removeElements(elements.map((item) => item.id))}><FiTrash2 /></button>
      </section>
    </div>
  );
}

function ElementSettings({ element, ed, onOpenAi }: { element: BookElement; ed: BookEditorApi; onOpenAi: () => void }) {
  const { width, height } = ed.book!;
  const patch = (next: Record<string, unknown>, key?: string) => ed.updateElement(element.id, next as Partial<BookElement>, key ? `${key}:${element.id}` : undefined);
  return (
    <div className="be-inspect">
      {element.type === "text" && (
        <section>
          <h4>텍스트</h4>
          <textarea className="be-input be-area" value={element.text} onChange={(event) => patch({ text: event.target.value }, "text")} />
          <CustomSelect aria-label="서체" options={BOOK_FONTS.map(({ value, label }) => ({ value, label }))} value={element.font ?? "inherit"} onValueChange={(font) => patch({ font })} />
          <div className="be-row">
            <Colour label="" value={element.color} onChange={(color) => patch({ color }, "color")} />
            <Num label="크기" value={element.size} onChange={(size) => { if (size > 0) patch({ size }, "size"); }} />
            <button type="button" className="be-toggle" aria-label="글자 작게" onClick={() => patch({ size: Math.max(6, element.size - 2) }, "size")}><FiMinus /></button>
            <button type="button" className="be-toggle" aria-label="글자 크게" onClick={() => patch({ size: element.size + 2 }, "size")}><FiPlus /></button>
          </div>
          <div className="be-format">
            <button type="button" aria-label="굵게" className={element.bold ? "is-on" : ""} onClick={() => patch({ bold: !element.bold })}><FiBold /></button>
            <button type="button" aria-label="기울임" className={element.italic ? "is-on" : ""} onClick={() => patch({ italic: !element.italic })}><FiItalic /></button>
            <button type="button" aria-label="밑줄" className={element.underline ? "is-on" : ""} onClick={() => patch({ underline: !element.underline })}><FiUnderline /></button>
            <button type="button" aria-label="취소선" className={element.strike ? "is-on" : ""} onClick={() => patch({ strike: !element.strike })}><s>S</s></button>
            <button type="button" aria-label="입력한 대로" className={(element.textCase ?? "none") === "none" ? "is-on" : ""} onClick={() => patch({ textCase: "none" })}>Aa</button>
            <button type="button" aria-label="모두 대문자" className={element.textCase === "upper" ? "is-on" : ""} onClick={() => patch({ textCase: "upper" })}>AA</button>
            <button type="button" aria-label="모두 소문자" className={element.textCase === "lower" ? "is-on" : ""} onClick={() => patch({ textCase: "lower" })}>aa</button>
          </div>
          <div className="be-row">
            <Segments value={element.align} onChange={(align) => patch({ align })} options={[{ value: "left", label: <FiAlignLeft />, title: "왼쪽" }, { value: "center", label: <FiAlignCenter />, title: "가운데" }, { value: "right", label: <FiAlignRight />, title: "오른쪽" }, { value: "justify", label: <FiAlignJustify />, title: "양쪽" }]} />
            <button type="button" className={`be-toggle${element.vertical ? " is-on" : ""}`} aria-label="세로쓰기" title="세로쓰기" onClick={() => patch({ vertical: !element.vertical })}>세</button>
          </div>
          <button type="button" className="be-btn be-btn--line be-btn--wide" onClick={() => ed.commit((open) => ({ ...open, pages: open.pages.map((page) => ({ ...page, elements: page.elements.map((item) => (item.type === "text" ? { ...item, font: element.font } : item)) })) }))}>일괄 설정 폰트</button>
          <h4>간격</h4>
          <Slider label="자간" min={-50} max={500} step={5} value={element.spacing ?? 0} onChange={(spacing) => patch({ spacing }, "spacing")} />
          <Slider label="행 간격" min={0.8} max={3} step={0.02} value={element.lineHeight ?? 1.32} onChange={(lineHeight) => patch({ lineHeight }, "lineHeight")} />
          <Slider label="단 나누기" min={1} max={4} step={1} value={element.columns ?? 1} onChange={(columns) => patch({ columns }, "columns")} />
          <h4>글자 효과</h4>
          <CustomSelect aria-label="글자 효과" options={[{ value: "none", label: "없음" }, { value: "shadow", label: "그림자" }, { value: "lift", label: "띄우기" }, { value: "neon", label: "네온" }, { value: "hollow", label: "속 빈 글자" }, { value: "gradient", label: "그라데이션" }]} value={element.effect ?? "none"} onValueChange={(effect) => patch({ effect })} />
          {element.effect && ["shadow", "neon", "gradient"].includes(element.effect) && <Colour label="효과 색상" value={element.effectColor ?? "#3f8ff0"} onChange={(effectColor) => patch({ effectColor }, "effectColor")} />}
          <h4>배경 설정</h4>
          <label className="be-check"><input type="checkbox" checked={Boolean(element.background)} onChange={(event) => patch({ background: event.target.checked ? "#fff3a8" : "" })} />글자 상자에 배경색</label>
          {element.background && <Colour label="배경색" value={element.background} onChange={(background) => patch({ background }, "background")} />}
        </section>
      )}
      {(element.type === "grid" || element.type === "image") && <section><button type="button" className="be-btn be-btn--primary be-btn--wide" onClick={onOpenAi}>이 사진으로 AI 글쓰기</button></section>}
      {element.type === "grid" && <GridEditor element={element} ed={ed} patch={patch} />}
      {element.type === "image" && <PhotoEditor element={element} patch={patch} />}
      {element.type === "image" && (
        <section>
          <h4>이미지</h4>
          <Segments value={element.fit} onChange={(fit) => patch({ fit })} options={[{ value: "cover", label: "꽉 채우기" }, { value: "contain", label: "전체 보이기" }]} />
          <Num label="모서리" value={element.radius ?? 0} onChange={(radius) => patch({ radius: Math.max(0, radius) }, "radius")} />
          <FilePickButton accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" className="be-btn be-btn--line be-btn--wide" onPick={(file) => void ed.uploadImage(file).then((done) => { if (done) patch({ src: done.url }); })}><FiUpload />이미지 바꾸기</FilePickButton>
        </section>
      )}
      {element.type === "shape" && (
        <section>
          <h4>도형</h4>
          <div className="be-shapepick">{BOOK_SHAPES.map((item) => <button key={item.name} type="button" title={item.label} className={element.shape === item.name ? "is-on" : ""} onClick={() => patch({ shape: item.name })}><svg viewBox="0 0 100 100"><path d={item.path} fillRule="evenodd" /></svg></button>)}</div>
          <Colour label="색상" value={element.fill} onChange={(fill) => patch({ fill }, "fill")} />
          <label className="be-check"><input type="checkbox" checked={Boolean(element.fill2)} onChange={(event) => patch({ fill2: event.target.checked ? "#f5576c" : undefined })} />그라데이션</label>
          {element.fill2 && <><Colour label="두 번째 색" value={element.fill2} onChange={(fill2) => patch({ fill2 }, "fill2")} /><Slider label="방향" min={0} max={359} step={5} value={element.angle ?? 45} onChange={(angle) => patch({ angle }, "angle")} /></>}
          {(element.borderWidth ?? 0) > 0 && <label className="be-check"><input type="checkbox" checked={Boolean(element.dashed)} onChange={(event) => patch({ dashed: event.target.checked })} />외곽선 점선</label>}
        </section>
      )}
      {element.type === "line" && (
        <section>
          <h4>선</h4>
          <Segments value={element.style} onChange={(style) => patch({ style })} options={[{ value: "solid", label: "실선" }, { value: "dashed", label: "파선" }, { value: "dotted", label: "점선" }]} />
          <Colour label="색상" value={element.color} onChange={(color) => patch({ color }, "color")} />
          <Slider label="두께" min={1} max={40} step={1} value={element.thickness} onChange={(thickness) => patch({ thickness }, "thickness")} />
          <label className="be-check"><input type="checkbox" checked={element.arrow} onChange={(event) => patch({ arrow: event.target.checked })} />끝에 화살표</label>
        </section>
      )}
      {element.type === "icon" && <section><h4>그래픽</h4><Colour label="색상" value={element.color} onChange={(color) => patch({ color }, "color")} /><Slider label="선 굵기" min={0.5} max={4} step={0.1} value={element.stroke} onChange={(stroke) => patch({ stroke }, "stroke")} /></section>}
      {element.type === "chart" && <ChartEditor element={element} patch={patch} />}
      {element.type === "button" && (
        <section>
          <h4>버튼</h4>
          <input className="be-input" value={element.label} onChange={(event) => patch({ label: event.target.value }, "label")} />
          <div className="be-grid2"><Colour label="버튼" value={element.color} onChange={(color) => patch({ color }, "color")} /><Colour label="글자" value={element.textColor} onChange={(textColor) => patch({ textColor }, "textColor")} /></div>
          <Num label="모서리" value={element.radius} onChange={(radius) => patch({ radius: Math.max(0, radius) }, "radius")} />
        </section>
      )}
      {element.type === "table" && <TableEditor element={element} patch={patch} />}
      {element.type === "map" && <section><h4>지도</h4><input className="be-input" placeholder="주소 또는 장소 이름" value={element.address} onChange={(event) => patch({ address: event.target.value }, "address")} /><p className="be-hint">동작 미리보기나 공개 링크에서 지도가 열립니다.</p></section>}
      {element.type === "embed" && <section><h4>타사 임베드</h4><input className="be-input" placeholder="https://" value={element.url} onChange={(event) => patch({ url: event.target.value }, "url")} /><p className="be-hint">유튜브·비메오 링크는 영상으로 재생됩니다. 일부 사이트는 다른 페이지 안에 표시되는 것을 막아 두었습니다.</p></section>}
      {element.type === "tooltip" && <section><h4>툴팁</h4><textarea className="be-input be-area" value={element.text} onChange={(event) => patch({ text: event.target.value }, "text")} /><Colour label="아이콘 색상" value={element.color} onChange={(color) => patch({ color }, "color")} /></section>}
      {element.type === "pagenumber" && <section><h4>페이지 매김</h4><Num label="크기" value={element.size} onChange={(size) => { if (size > 0) patch({ size }, "size"); }} /><Colour label="색상" value={element.color} onChange={(color) => patch({ color }, "color")} /><label className="be-check"><input type="checkbox" checked={element.showTotal} onChange={(event) => patch({ showTotal: event.target.checked })} />전체 쪽수도 표시</label></section>}
      {element.type === "toc" && <section><h4>자동 목차</h4><Num label="크기" value={element.size} onChange={(size) => { if (size > 0) patch({ size }, "size"); }} /><Colour label="색상" value={element.color} onChange={(color) => patch({ color }, "color")} /><p className="be-hint">각 페이지의 이름이나 첫 글을 자동으로 모읍니다. 페이지 이름은 빈 곳을 누르면 나오는 설정에서 바꿉니다.</p></section>}
      {element.type === "video" && <VideoEditor element={element} slotRatio={(element.w * width) / (element.h * height)} patch={patch} />}
      {element.type === "audio" && <section><h4>오디오</h4><Colour label="버튼 색상" value={element.color} onChange={(color) => patch({ color }, "color")} /></section>}
      {element.type === "slideshow" && (
        <>
          <SlideImages element={element} ed={ed} />
          <section><h4>모양</h4><Segments value={element.variant} onChange={(variant) => patch({ variant })} options={[{ value: "basic", label: "기본" }, { value: "peek", label: "가운데 강조" }]} /></section>
        </>
      )}
      <section>
        <h4>크기 및 위치</h4>
        <div className="be-aligns">
          <button type="button" title="왼쪽 맞춤" onClick={() => patch({ x: 0 })}><FiAlignLeft /></button>
          <button type="button" title="가로 가운데" onClick={() => patch({ x: 50 - element.w / 2 })}><FiAlignCenter /></button>
          <button type="button" title="오른쪽 맞춤" onClick={() => patch({ x: 100 - element.w })}><FiAlignRight /></button>
          <button type="button" title="위쪽 맞춤" onClick={() => patch({ y: 0 })}><FiArrowUp /></button>
          <button type="button" title="세로 가운데" onClick={() => patch({ y: 50 - element.h / 2 })}><FiMinus /></button>
          <button type="button" title="아래쪽 맞춤" onClick={() => patch({ y: 100 - element.h })}><FiArrowDown /></button>
        </div>
        <div className="be-grid2">
          <Num label="X" value={px(element.x, width)} onChange={(x) => patch({ x: pct(x, width) }, "x")} />
          <Num label="Y" value={px(element.y, height)} onChange={(y) => patch({ y: pct(y, height) }, "y")} />
          <Num label="W" value={px(element.w, width)} onChange={(w) => { if (w >= 4) patch({ w: pct(w, width) }, "w"); }} />
          <Num label="H" value={px(element.h, height)} onChange={(h) => { if (h >= 4) patch({ h: pct(h, height) }, "h"); }} />
        </div>
        <div className="be-row">
          <button type="button" className="be-btn be-btn--line be-btn--icon be-heart" aria-label="즐겨찾기에 추가" title="즐겨찾기에 추가" onClick={() => { addFavourite(element); ed.setNotice("즐겨찾기에 넣었습니다."); }}><FiHeart /></button>
          <label className="be-check"><input type="checkbox" checked={Boolean(element.everyPage)} onChange={(event) => patch({ everyPage: event.target.checked })} />모든 페이지에 표시</label>
        </div>
      </section>
      <section>
        <h4>스타일</h4>
        <label className="be-check"><input type="checkbox" checked={Boolean(element.shadow)} onChange={(event) => patch({ shadow: event.target.checked })} />그림자</label>
        <Slider label="외곽선" min={0} max={24} step={1} value={element.borderWidth ?? 0} onChange={(borderWidth) => patch({ borderWidth }, "borderWidth")} />
        {(element.borderWidth ?? 0) > 0 && <Colour label="외곽선 색상" value={element.borderColor ?? "#000000"} onChange={(borderColor) => patch({ borderColor }, "borderColor")} />}
        <Slider label="불투명도" min={0} max={100} step={1} value={Math.round((element.opacity ?? 1) * 100)} onChange={(value) => patch({ opacity: value / 100 }, "opacity")} />
        <Slider label="회전" min={0} max={359} step={1} value={element.rotation ?? 0} onChange={(rotation) => patch({ rotation }, "rotation")} />
      </section>
      <section>
        <h4>등장 애니메이션</h4>
        <CustomSelect aria-label="등장 애니메이션" options={ANIMATIONS} value={element.animation ?? "none"} onValueChange={(animation) => patch({ animation })} />
        {element.animation && element.animation !== "none" && (
          <>
            <Slider label="시작" min={0} max={5} step={0.1} value={element.delay ?? 0} onChange={(delay) => patch({ delay }, "delay")} />
            <Slider label="길이" min={0.2} max={4} step={0.1} value={element.duration ?? 0.7} onChange={(duration) => patch({ duration }, "duration")} />
          </>
        )}
        <label className="be-check"><input type="checkbox" checked={Boolean(element.hidden)} onChange={(event) => patch({ hidden: event.target.checked })} />처음에는 숨기기</label>
      </section>
      <section>
        <label className="be-check"><input type="checkbox" checked={Boolean(element.locked)} onChange={(event) => patch({ locked: event.target.checked })} />위치 잠금</label>
      </section>
      <section className="be-iconrow">
        <button type="button" title="앞으로" onClick={() => ed.reorderElement(element.id, 1)}><FiArrowUp /></button>
        <button type="button" title="뒤로" onClick={() => ed.reorderElement(element.id, -1)}><FiArrowDown /></button>
        <button type="button" title="복제" onClick={() => ed.duplicateElement(element.id)}><FiCopy /></button>
        <button type="button" title="삭제" onClick={() => ed.removeElement(element.id)}><FiTrash2 /></button>
      </section>
    </div>
  );
}

function ActionFields({ action, onChange, element, ed }: { action: BookAction; onChange: (next: BookAction) => void; element: BookElement; ed: BookEditorApi }) {
  const book = ed.book!;
  const others = book.pages.flatMap((page) => page.elements).filter((item) => item.id !== element.id);
  switch (action.kind) {
    case "url":
      return <input className="be-input" placeholder="https://" value={action.url} onChange={(event) => onChange({ ...action, url: event.target.value })} />;
    case "popupWeb":
      return <input className="be-input" placeholder="창에 띄울 주소 https://" value={action.url} onChange={(event) => onChange({ ...action, url: event.target.value })} />;
    case "tel":
      return <input className="be-input" placeholder="02-000-0000" inputMode="tel" value={action.phone} onChange={(event) => onChange({ ...action, phone: event.target.value })} />;
    case "page":
      return <CustomSelect aria-label="이동할 페이지" placeholder="이동할 페이지" value={action.pageId} options={book.pages.map((page, index) => ({ value: page.id, label: `${index + 1}쪽` }))} onValueChange={(pageId) => onChange({ ...action, pageId })} />;
    case "play":
    case "toggle":
      return others.length === 0
        ? <p className="be-hint">대상이 될 다른 요소를 먼저 추가하세요.</p>
        : <CustomSelect aria-label="대상 요소" placeholder="대상 요소" value={action.targetId} options={others.map((item) => ({ value: item.id, label: `${book.pages.findIndex((page) => page.elements.includes(item)) + 1}쪽 · ${elementName(item)}` }))} onValueChange={(targetId) => onChange({ ...action, targetId })} />;
    case "popupImage":
      return (
        <>
          {action.src && <img className="be-actionimg" src={action.src} alt="" />}
          <FilePickButton accept="image/png,image/jpeg,image/webp,image/gif" className="be-btn be-btn--line be-btn--wide" onPick={(file) => void ed.uploadImage(file).then((done) => { if (done) onChange({ ...action, src: done.url }); })}><FiUpload />{action.src ? "이미지 바꾸기" : "이미지 올리기"}</FilePickButton>
        </>
      );
    case "popupMessage":
      return (
        <>
          <input className="be-input" placeholder="제목" value={action.title} onChange={(event) => onChange({ ...action, title: event.target.value })} />
          <textarea className="be-input be-area" placeholder="내용" value={action.body} onChange={(event) => onChange({ ...action, body: event.target.value })} />
        </>
      );
    case "popupVideo":
      return (
        <>
          <input className="be-input" placeholder="유튜브, 비메오, MP4 주소" value={action.src.startsWith("data:") ? "" : action.src} onChange={(event) => onChange({ ...action, src: event.target.value })} />
          <div className="be-grid2">
            <TimeField label="시작" value={action.start} onChange={(start) => onChange({ ...action, start })} />
            <TimeField label="끝" value={action.end} onChange={(end) => onChange({ ...action, end })} />
          </div>
          {rangeNote(action.src, action.start, action.end) && <p className="be-aierror">{rangeNote(action.src, action.start, action.end)}</p>}
          <FilePickButton accept="video/mp4,video/webm" className="be-btn be-btn--line be-btn--wide" onPick={(file) => void ed.uploadMedia(file, "video").then((url) => { if (url) onChange({ ...action, src: url }); })}><FiUpload />비디오 올리기</FilePickButton>
        </>
      );
  }
}

function ElementActions({ element, ed }: { element: BookElement; ed: BookEditorApi }) {
  const actions = element.actions ?? [];
  const [active, setActive] = useState(0);
  const at = Math.min(active, Math.max(0, actions.length - 1));
  const current = actions[at] as BookAction | undefined;
  const save = (next: BookAction[], key?: string) => ed.updateElement(element.id, { actions: next }, key ? `action:${element.id}:${at}` : undefined);
  const choose = (kind: Kind) => {
    if (current?.kind === kind) return;
    save(actions.length ? actions.map((item, i) => (i === at ? emptyAction(kind) : item)) : [emptyAction(kind)]);
  };
  const remove = () => { save(actions.filter((_, i) => i !== at)); setActive(Math.max(0, at - 1)); };
  return (
    <div className="be-inspect be-inspect--actions">
      <section>
        <div className="be-actionhead">
          <h4>액션 선택</h4>
          {current && <button type="button" aria-label="동작 삭제" onClick={remove}><FiTrash2 /></button>}
        </div>
        {actions.length > 1 && <div className="be-actiontabs">{actions.map((_, i) => <button key={i} type="button" className={i === at ? "is-on" : ""} onClick={() => setActive(i)}>동작 {i + 1}</button>)}</div>}
        <CustomSelect aria-label="실행 시점" options={[{ value: "click", label: "클릭 시 트리거" }, { value: "hover", label: "마우스를 올리면 트리거" }]} value={element.trigger ?? "click"} onValueChange={(trigger) => ed.updateElement(element.id, { trigger: trigger as "click" | "hover" })} />
        <div className="be-actiongrid">
          {ACTIONS.map((item) => <button key={item.kind} type="button" className={current?.kind === item.kind ? "is-on" : ""} onClick={() => choose(item.kind)}>{item.icon}<span>{item.label}</span></button>)}
        </div>
        {current && <div className="be-actionfields"><ActionFields action={current} element={element} ed={ed} onChange={(next) => save(actions.map((item, i) => (i === at ? next : item)), "field")} /></div>}
      </section>
      {current && <button type="button" className="be-btn be-btn--line be-btn--wide be-addaction" onClick={() => { save([...actions, emptyAction("url")]); setActive(actions.length); }}><FiPlus />다른 동작 추가</button>}
    </div>
  );
}

export function Inspector({ ed, element, multi, onOpenAi, tab, onTab }: { ed: BookEditorApi; element: BookElement | null; multi: BookElement[]; onOpenAi: () => void; tab: "settings" | "actions"; onTab: (tab: "settings" | "actions") => void }) {
  if (multi.length > 1) return <aside className="be-right"><MultiSettings elements={multi} ed={ed} /></aside>;
  if (!element) return <aside className="be-right"><PageSettings ed={ed} /></aside>;
  const hasActions = Boolean(element.actions?.length);
  return (
    <aside className="be-right">
      <div className="be-tabs">
        <button type="button" className={tab === "settings" ? "is-on" : ""} onClick={() => onTab("settings")}>설정</button>
        <button type="button" className={tab === "actions" ? "is-on" : ""} onClick={() => onTab("actions")}>액션{hasActions && <i />}</button>
      </div>
      {tab === "settings" ? <ElementSettings element={element} ed={ed} onOpenAi={onOpenAi} /> : <ElementActions key={element.id} element={element} ed={ed} />}
    </aside>
  );
}
