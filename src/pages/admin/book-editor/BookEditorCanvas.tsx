import { useEffect, useState, type DragEvent, type MouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { FiAlignCenter, FiAlignJustify, FiAlignLeft, FiAlignRight, FiBold, FiLock, FiMinus, FiPlay, FiPlus, FiSquare, FiUnderline } from "react-icons/fi";
import { BookPageView, ElementBody, VideoPlayer, elementBox, textStyle, useSharedElements } from "../../../components/flipbook/BookPageView";
import { CustomSelect } from "../../../components/ui/custom-select";
import type { BookRuntime } from "../../../components/flipbook/BookRuntime";
import { BOOK_FONTS, type BookElement, type GridElement, type ImageElement, type TextElement } from "../../../lib/flipbooks";
import type { BookEditorApi } from "./useBookEditor";

const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
type Handle = (typeof HANDLES)[number];
const MIN_SIZE = 2;
const SNAP = 0.6;
const ROTATE_SNAP = 3;

type Guides = { x: number | null; y: number | null };
type Marquee = { x: number; y: number; w: number; h: number };
const NO_GUIDES: Guides = { x: null, y: null };

const follow = (onMove: (event: PointerEvent) => void, onEnd: () => void) => {
  const up = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
    onEnd();
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", up);
};

const wrapRect = (event: { currentTarget: EventTarget }) => (event.currentTarget as HTMLElement).closest(".be-pagewrap")!.getBoundingClientRect();
const wrapOf = (event: ReactPointerEvent) => wrapRect(event);

/** The nearest alignment for this box's start, centre and end among the targets. */
function snapAxis(start: number, size: number, targets: number[]): { value: number; guide: number | null } {
  let best: { value: number; guide: number; distance: number } | null = null;
  for (const anchor of [0, size / 2, size]) {
    for (const target of targets) {
      const distance = Math.abs(start + anchor - target);
      if (distance < SNAP && (!best || distance < best.distance)) best = { value: target - anchor, guide: target, distance };
    }
  }
  return best ? { value: best.value, guide: best.guide } : { value: start, guide: null };
}

/** One page on the canvas: click to select, drag to move, handles to resize and rotate. */
export function PageCanvas({ ed, index, width, height, preview, runtime }: { ed: BookEditorApi; index: number; width: number; height: number; preview: boolean; runtime: BookRuntime }) {
  const page = ed.book!.pages[index];
  const [editingId, setEditingId] = useState<string | null>(null);
  const [guides, setGuides] = useState<Guides>(NO_GUIDES);
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const shared = useSharedElements(page.id);
  // A video can be tried right on the canvas; selecting anything else puts it back to its still.
  const [playingId, setPlayingId] = useState<string | null>(null);
  useEffect(() => {
    if (playingId && !ed.selectedIds.includes(playingId)) setPlayingId(null);
  }, [playingId, ed.selectedIds]);
  const selectedHere = page.elements.filter((element) => ed.selectedIds.includes(element.id));
  const selected = selectedHere.length === 1 ? selectedHere[0] : null;

  if (preview) return <div className="be-pagewrap" style={{ width, height }}><BookPageView page={page} runtime={runtime} /></div>;

  const cellAt = (element: GridElement, clientX: number, clientY: number, rect: DOMRect) => {
    const px = (((clientX - rect.left) / rect.width) * 100 - element.x) / element.w * 100;
    const py = (((clientY - rect.top) / rect.height) * 100 - element.y) / element.h * 100;
    const found = element.cells.findIndex((cell) => px >= cell.x && px <= cell.x + cell.w && py >= cell.y && py <= cell.y + cell.h);
    return Math.max(0, found);
  };
  /** Photos go into the slot asked for, then on into the empty ones. */
  const fillCells = (element: GridElement, start: number, files: File[]) => {
    const order = [start, ...element.cells.map((_, i) => i).filter((i) => i !== start && !element.cells[i].src)];
    files.slice(0, order.length).forEach((file, i) => {
      void ed.uploadImage(file).then((done) => { if (done) ed.setGridCell(element.id, order[i], { src: done.url, zoom: 100, focusX: 50, focusY: 50 }); });
    });
  };
  const pickForCell = (element: GridElement, index: number) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp,image/gif";
    input.multiple = true;
    input.onchange = () => fillCells(element, index, [...(input.files ?? [])]);
    input.click();
  };
  /** A grid takes photos dropped on it or a double click on a slot. */
  const gridProps = (element: BookElement) => (element.type !== "grid" ? {} : {
    onDragOver: (event: DragEvent) => { event.preventDefault(); event.stopPropagation(); },
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const files = [...event.dataTransfer.files].filter((file) => file.type.startsWith("image/"));
      if (files.length === 0) return;
      const index = cellAt(element, event.clientX, event.clientY, wrapRect(event));
      ed.setSelection([element.id]);
      ed.setActiveCell(index);
      fillCells(element, index, files);
    },
  });
  const doubleClick = (event: MouseEvent, element: BookElement) => {
    if (element.locked) return;
    if (element.type === "text") setEditingId(element.id);
    if (element.type === "grid") pickForCell(element, cellAt(element, event.clientX, event.clientY, wrapRect(event)));
  };

  const membersOf = (element: BookElement) => (element.groupId ? page.elements.filter((item) => item.groupId === element.groupId).map((item) => item.id) : [element.id]);

  const startMove = (event: ReactPointerEvent, element: BookElement) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    ed.setPageIndex(index);
    const members = membersOf(element);
    if (event.shiftKey) {
      const current = ed.selectedIds;
      ed.setSelection(current.includes(element.id) ? current.filter((id) => !members.includes(id)) : [...current, ...members]);
      return;
    }
    const ids = ed.selectedIds.includes(element.id) && ed.selectedIds.length > 1 ? ed.selectedIds : members;
    ed.setSelection(ids);
    if (element.type === "grid") ed.setActiveCell(cellAt(element, event.clientX, event.clientY, wrapOf(event)));
    if (editingId === element.id) return;
    setEditingId(null);
    const moving = page.elements.filter((item) => ids.includes(item.id) && !item.locked);
    if (moving.length === 0) return;
    const rect = wrapOf(event);
    const before = ed.snapshot();
    const startX = event.clientX;
    const startY = event.clientY;
    const others = page.elements.filter((item) => !ids.includes(item.id));
    const targetsX = [0, 50, 100, ...others.flatMap((item) => [item.x, item.x + item.w / 2, item.x + item.w])];
    const targetsY = [0, 50, 100, ...others.flatMap((item) => [item.y, item.y + item.h / 2, item.y + item.h])];
    const lead = moving[0];
    let moved = false;
    follow((move) => {
      if (!moved && Math.hypot(move.clientX - startX, move.clientY - startY) < 3) return;
      moved = true;
      let dx = ((move.clientX - startX) / rect.width) * 100;
      let dy = ((move.clientY - startY) / rect.height) * 100;
      const next: Guides = { x: null, y: null };
      if (moving.length === 1 && !move.altKey) {
        const snapX = snapAxis(lead.x + dx, lead.w, targetsX);
        const snapY = snapAxis(lead.y + dy, lead.h, targetsY);
        dx = snapX.value - lead.x;
        dy = snapY.value - lead.y;
        next.x = snapX.guide;
        next.y = snapY.guide;
      }
      setGuides(next);
      const patches: Record<string, Partial<BookElement>> = {};
      for (const item of moving) patches[item.id] = { x: Math.min(98, Math.max(2 - item.w, item.x + dx)), y: Math.min(98, Math.max(2 - item.h, item.y + dy)) };
      ed.dragElements(patches);
    }, () => { setGuides(NO_GUIDES); ed.endDrag(before); });
  };

  const startResize = (event: ReactPointerEvent, element: BookElement, handle: Handle) => {
    event.stopPropagation();
    if (event.button !== 0) return;
    const rect = wrapOf(event);
    const before = ed.snapshot();
    const radians = (-(element.rotation ?? 0) * Math.PI) / 180;
    const startX = event.clientX;
    const startY = event.clientY;
    const ratio = element.w / element.h;
    const lockRatio = ["image", "audio", "icon", "chart"].includes(element.type) && handle.length === 2;
    follow((move) => {
      const px = move.clientX - startX;
      const py = move.clientY - startY;
      const dx = ((px * Math.cos(radians) - py * Math.sin(radians)) / rect.width) * 100;
      const dy = ((px * Math.sin(radians) + py * Math.cos(radians)) / rect.height) * 100;
      let { x, y, w, h } = element;
      if (handle.includes("e")) w = Math.max(MIN_SIZE, element.w + dx);
      if (handle.includes("s")) h = Math.max(MIN_SIZE, element.h + dy);
      if (handle.includes("w")) { w = Math.max(MIN_SIZE, element.w - dx); x = element.x + element.w - w; }
      if (handle.includes("n")) { h = Math.max(MIN_SIZE, element.h - dy); y = element.y + element.h - h; }
      if (lockRatio && !move.shiftKey) {
        h = w / ratio;
        if (handle.includes("n")) y = element.y + element.h - h;
      }
      ed.dragElement(element.id, { x, y, w, h });
    }, () => ed.endDrag(before));
  };

  const startRotate = (event: ReactPointerEvent, element: BookElement) => {
    event.stopPropagation();
    if (event.button !== 0) return;
    const rect = wrapOf(event);
    const before = ed.snapshot();
    const centreX = rect.left + (rect.width * (element.x + element.w / 2)) / 100;
    const centreY = rect.top + (rect.height * (element.y + element.h / 2)) / 100;
    follow((move) => {
      let angle = (Math.atan2(move.clientY - centreY, move.clientX - centreX) * 180) / Math.PI - 90;
      angle = ((Math.round(angle) % 360) + 360) % 360;
      for (const stop of [0, 90, 180, 270, 360]) if (Math.abs(angle - stop) < ROTATE_SNAP) angle = stop % 360;
      ed.dragElement(element.id, { rotation: angle });
    }, () => ed.endDrag(before));
  };

  /** Dragging on empty paper draws a box and selects what it touches. */
  const startMarquee = (event: ReactPointerEvent) => {
    if (event.button !== 0) return;
    ed.setPageIndex(index);
    ed.setSelectedId(null);
    setEditingId(null);
    const rect = event.currentTarget.getBoundingClientRect();
    const toX = (client: number) => ((client - rect.left) / rect.width) * 100;
    const toY = (client: number) => ((client - rect.top) / rect.height) * 100;
    const originX = toX(event.clientX);
    const originY = toY(event.clientY);
    let box: Marquee | null = null;
    follow((move) => {
      const x = toX(move.clientX);
      const y = toY(move.clientY);
      box = { x: Math.min(originX, x), y: Math.min(originY, y), w: Math.abs(x - originX), h: Math.abs(y - originY) };
      setMarquee(box);
    }, () => {
      setMarquee(null);
      if (!box || box.w + box.h < 1) return;
      const area = box;
      const hit = page.elements.filter((item) => item.x < area.x + area.w && item.x + item.w > area.x && item.y < area.y + area.h && item.y + item.h > area.y);
      ed.setSelection([...new Set(hit.flatMap(membersOf))]);
    });
  };

  const editing = selected?.type === "text" && editingId === selected.id ? (selected as TextElement) : null;

  return (
    <div className="be-pagewrap" style={{ width, height }} onPointerDown={startMarquee}>
      <BookPageView page={page} still>
        {shared.map((element) => (
          <div key={element.id} className={`fb-el fb-el--${element.type} be-el--shared`} style={elementBox(element)}><div className="fb-el__in"><ElementBody element={element} still pageId={page.id} /></div></div>
        ))}
        {page.elements.map((element) => (
          <div
            key={element.id}
            data-element-id={element.id}
            className={`fb-el fb-el--${element.type} be-el${playingId === element.id ? " is-playing" : ""}${element.hidden ? " is-hidden-at-start" : ""}${element.type === "link" && ed.selectedIds.includes(element.id) ? " is-selected-link" : ""}`}
            style={elementBox(element)}
            onPointerDown={(event) => startMove(event, element)}
            onDoubleClick={(event) => doubleClick(event, element)}
            {...gridProps(element)}
          >
            <div className="fb-el__in" style={{ ...(editingId === element.id ? { visibility: "hidden" } : {}), ...(element.shadow ? { filter: "drop-shadow(0 .5cqw 1cqw rgba(0,0,0,.35))" } : {}) }}>{element.type === "video" && playingId === element.id
              ? <VideoPlayer src={element.src} start={element.start} end={element.end} autoStart controls={element.controls} crop={element} />
              : <ElementBody element={element} still pageId={page.id} />}{element.type === "video" && element.src && playingId !== element.id && <button type="button" className="be-videoplay" aria-label="재생해 보기" onPointerDown={(event) => event.stopPropagation()} onClick={() => { ed.setPageIndex(index); ed.setSelection([element.id]); setPlayingId(element.id); }}><FiPlay /></button>}</div>
          </div>
        ))}
      </BookPageView>

      {guides.x !== null && <i className="be-guide be-guide--x" style={{ left: `${guides.x}%` }} />}
      {guides.y !== null && <i className="be-guide be-guide--y" style={{ top: `${guides.y}%` }} />}
      {marquee && <i className="be-marquee" style={{ left: `${marquee.x}%`, top: `${marquee.y}%`, width: `${marquee.w}%`, height: `${marquee.h}%` }} />}

      {editing && (
        <textarea
          className="be-textedit"
          autoFocus
          style={{ ...elementBox(editing), ...textStyle(editing), color: editing.color, backgroundImage: "none", background: "rgba(255, 255, 255, .55)" }}
          value={editing.text}
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) => ed.updateElement(editing.id, { text: event.target.value }, `text:${editing.id}`)}
          onKeyDown={(event) => { if (event.key === "Escape") setEditingId(null); event.stopPropagation(); }}
        />
      )}

      {selectedHere.length > 1 && selectedHere.map((element) => (
        <div key={element.id} className="be-selection be-selection--multi" style={elementBox({ ...element, opacity: 1 })} onPointerDown={(event) => startMove(event, element)} />
      ))}

      {selected && !editing && (
        <div className="be-selection" style={elementBox({ ...selected, opacity: 1 })} onPointerDown={(event) => startMove(event, selected)} onDoubleClick={(event) => doubleClick(event, selected)} {...gridProps(selected)}>
          {selected.type === "grid" && selected.cells[ed.activeCell] && <i className="be-cellmark" style={{ left: `${selected.cells[ed.activeCell].x}%`, top: `${selected.cells[ed.activeCell].y}%`, width: `${selected.cells[ed.activeCell].w}%`, height: `${selected.cells[ed.activeCell].h}%` }} />}
          {playingId === selected.id && <button type="button" className="be-videostop" onPointerDown={(event) => event.stopPropagation()} onClick={() => setPlayingId(null)}><FiSquare />정지</button>}
          {selected.locked
            ? <i className="be-lockmark"><FiLock /></i>
            : <>
                {HANDLES.map((handle) => <i key={handle} className={`be-handle be-handle--${handle}`} onPointerDown={(event) => startResize(event, selected, handle)} />)}
                <i className="be-rotate" title="회전" onPointerDown={(event) => startRotate(event, selected)} />
              </>}
        </div>
      )}
    </div>
  );
}

const NEXT_ALIGN = { left: "center", center: "right", right: "justify", justify: "left" } as const;
const ALIGN_ICON = { left: <FiAlignLeft />, center: <FiAlignCenter />, right: <FiAlignRight />, justify: <FiAlignJustify /> };

/** Quick text formatting for the selected text, pinned to the top of the canvas so it never covers the page. */
export function TextToolbar({ ed, element }: { ed: BookEditorApi; element: TextElement }) {
  const patch = (next: Partial<TextElement>, key?: string) => ed.updateElement(element.id, next, key ? `${key}:${element.id}` : undefined);
  return (
    <div className="be-floatbar" onPointerDown={(event) => event.stopPropagation()}>
      <div className="be-floatbar__font"><CustomSelect aria-label="서체" options={BOOK_FONTS.map(({ value, label }) => ({ value, label }))} value={element.font ?? "inherit"} onValueChange={(font) => patch({ font })} /></div>
      <button type="button" aria-label="글자 작게" onClick={() => patch({ size: Math.max(6, element.size - 2) }, "size")}><FiMinus /></button>
      <span>{element.size}</span>
      <button type="button" aria-label="글자 크게" onClick={() => patch({ size: element.size + 2 }, "size")}><FiPlus /></button>
      <input type="color" aria-label="글자 색상" value={/^#[0-9a-f]{6}$/i.test(element.color) ? element.color : "#000000"} onChange={(event) => patch({ color: event.target.value }, "color")} />
      <button type="button" aria-label="굵게" className={element.bold ? "is-on" : ""} onClick={() => patch({ bold: !element.bold })}><FiBold /></button>
      <button type="button" aria-label="밑줄" className={element.underline ? "is-on" : ""} onClick={() => patch({ underline: !element.underline })}><FiUnderline /></button>
      <button type="button" aria-label="문단 정렬" onClick={() => patch({ align: NEXT_ALIGN[element.align] })}>{ALIGN_ICON[element.align]}</button>
    </div>
  );
}

/** Size of a new image so it keeps its proportions on this page. */
export function fittedImage(src: string, imageWidth: number, imageHeight: number, pageWidth: number, pageHeight: number, id: string): ImageElement {
  const w = 50;
  const h = Math.min(90, (w * (imageHeight / imageWidth) * pageWidth) / pageHeight);
  return { id, type: "image", src, fit: "cover", x: 25, y: (100 - h) / 2, w, h, actions: [] };
}
