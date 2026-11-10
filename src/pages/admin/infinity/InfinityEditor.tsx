/**
 * 인피니티북 editor (/admin/infinity/:id), laid out like Prezi's: a top bar with the insert tools, the path
 * of frames on the left (overview, topics, and inside a topic its subtopics), one endless canvas, the
 * navigation bar at the bottom and the style panel on the right.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ChartColumn, ChartPie, CloudUpload, CopyPlus, CornerLeftUp, FileDown, FilePlus2, Ellipsis, Hand, Image as ImageIcon, Layers, Menu, MousePointer2, NotebookPen, Paintbrush, PlayCircle, Redo2, Route, Shapes, Sparkles, Star, Table, Type, Undo2 } from "lucide-react";
import { FiAlignCenter, FiAlignLeft, FiAlignRight, FiArrowLeft, FiBold, FiChevronDown, FiChevronLeft, FiChevronRight, FiCloud, FiCopy, FiHelpCircle, FiHome, FiMinus, FiPlay, FiPlus, FiSearch, FiShare, FiTrash2, FiX } from "react-icons/fi";
import { BookProvider, textStyle } from "../../../components/flipbook/BookPageView";
import { BOOK_SHAPES } from "../../../components/flipbook/graphics";
import { Backdrop, InfinityWorld, backdropStyle, paintBackdrop, worldBox } from "../../../components/infinity/InfinityWorld";
import { CustomSelect } from "../../../components/ui/custom-select";
import { BOOK_FONTS, bookLink, getFlipbook, loadBookFonts, prepareImage, saveFlipbook, uid, uploadBookFile, videoSource, type BookAnimation, type BookElement, type Flipbook, type TextElement } from "../../../lib/flipbooks";
import { FRAME_STROKES, childrenOf, containedIn, fitCamera, flightAt, frameAt, overviewRect, parentOf, pathSteps, ringFrame, stepRange, worldTransform, type Camera, type InfinityCanvas, type InfinityFrame, type Rect } from "../../../lib/infinity";
import { InfinityAiPanel, InfinityTextAi } from "./InfinityAi";
import "./InfinityEditor.css";

type Selection = { kind: "frame" | "element"; id: string } | null;
type Corner = "nw" | "ne" | "sw" | "se";
type MenuName = "main" | "public" | "add" | "text" | "media" | "shape" | "story" | "animation" | "more" | "present" | "share" | null;
const HISTORY = 80;
const SAVE_DELAY = 900;
const FLIGHT_MS = 900;
const THUMB = { w: 236, h: 133 };
const isTyping = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA"].includes(target.tagName));
const hex = (value: string | undefined, fallback: string) => (value && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback);

const ANIMATIONS: { value: BookAnimation; label: string }[] = [
  { value: "none", label: "없음" },
  { value: "fade", label: "서서히 나타나기" },
  { value: "up", label: "아래에서 올라오기" },
  { value: "left", label: "옆에서 들어오기" },
  { value: "zoom", label: "확대되며 나타나기" },
  { value: "type", label: "타이핑 (키보드 소리)" },
];
const BACKGROUNDS = [
  "linear-gradient(180deg, #7fa3cf 0%, #5d6aa6 60%, #4c4787 100%)",
  "linear-gradient(160deg, #1b1f3b 0%, #2c2f6b 55%, #5a3d8c 100%)",
  "linear-gradient(180deg, #f3efe7 0%, #e4dccd 100%)",
  "linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)",
  "linear-gradient(180deg, #e9eef3 0%, #c9d6e3 100%)",
  "linear-gradient(160deg, #2b1d14 0%, #5a3b28 60%, #8a6243 100%)",
];

/** A small picture of part of the canvas, for the path list. */
function Thumb({ canvas, rect }: { canvas: InfinityCanvas; rect: Rect }) {
  const camera = fitCamera(rect, THUMB.w, THUMB.h, 0.92);
  return (
    <div className="ie-thumb__view" style={backdropStyle(canvas)}>
      <InfinityWorld canvas={canvas} still style={{ transform: worldTransform(camera, THUMB.w, THUMB.h) }} />
    </div>
  );
}

export default function InfinityEditor() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [book, setBook] = useState<Flipbook | null>(null);
  const [missing, setMissing] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "dirty" | "saving" | "error">("saved");
  const [selection, setSelection] = useState<Selection>(null);
  const [editingText, setEditingText] = useState<string | null>(null);
  const [context, setContext] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuName>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [panel, setPanel] = useState<"path" | "insert" | "uploads" | "style" | "ai">("path");
  const [panelOpen, setPanelOpen] = useState(true);
  const openPanel = (next: "path" | "insert" | "uploads" | "style" | "ai") => { if (panelOpen && panel === next) setPanelOpen(false); else { setPanel(next); setPanelOpen(true); } };
  const [tool, setTool] = useState<"select" | "hand">("select");
  const [itemMenu, setItemMenu] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [zoomLabel, setZoomLabel] = useState(100);
  const [step, setStep] = useState(-1);
  const [findOpen, setFindOpen] = useState(false);
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [pathSettingsOpen, setPathSettingsOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [showGrid, setShowGrid] = useState(() => localStorage.getItem("ie-grid") !== "off");
  const [spell, setSpell] = useState(() => localStorage.getItem("ie-spell") === "on");
  useEffect(() => { localStorage.setItem("ie-grid", showGrid ? "on" : "off"); }, [showGrid]);
  useEffect(() => { localStorage.setItem("ie-spell", spell ? "on" : "off"); }, [spell]);
  const clip = useRef<{ frames: InfinityFrame[]; elements: BookElement[] } | null>(null);
  const current = useRef<Flipbook | null>(null);
  const past = useRef<Flipbook[]>([]);
  const future = useRef<Flipbook[]>([]);
  const merge = useRef({ key: "", at: 0 });
  const timer = useRef(0);
  const stage = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const camera = useRef<Camera>({ x: 0, y: 0, zoom: 0.5 });
  const flight = useRef(0);
  const [size, setSize] = useState({ w: 0, h: 0 });
  // The panels sit beside the stage now, so the camera centres in the stage itself.
  const inset = { l: 0, r: 0 };
  const view = { w: Math.max(1, size.w - inset.l - inset.r), h: size.h };
  const viewRef = useRef({ ...view, l: inset.l });
  viewRef.current = { ...view, l: inset.l };
  const placeLayer = (cam: Camera) => {
    const { w, h, l } = viewRef.current;
    return `translate(${l + w / 2 - cam.x * cam.zoom}px, ${h / 2 - cam.y * cam.zoom}px) scale(${cam.zoom})`;
  };
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<"new" | "background" | string>("new");

  useEffect(() => {
    let live = true;
    getFlipbook(id).then((found) => {
      if (!live) return;
      if (!found?.canvas) { setMissing(true); return; }
      current.current = found;
      setBook(found);
    }).catch(() => { if (live) setMissing(true); });
    return () => { live = false; };
  }, [id]);
  useEffect(() => loadBookFonts(BOOK_FONTS.map((font) => font.value)), []);

  /* ---------- saving and history ---------- */
  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    if (!current.current) return;
    setSaveState("saving");
    try { await saveFlipbook(current.current); setSaveState("saved"); } catch { setSaveState("error"); }
  }, []);
  useEffect(() => () => { window.clearTimeout(timer.current); if (current.current) void saveFlipbook(current.current); }, []);
  const show = (changed: Flipbook) => {
    // A generated book that has been edited by hand is no longer refreshed by its generator.
    const next = changed.seed === "edited" ? changed : { ...changed, seed: "edited" };
    current.current = next;
    setBook(next);
    setSaveState("dirty");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), SAVE_DELAY);
  };
  const record = (before: Flipbook, key?: string) => {
    const now = Date.now();
    if (!key || key !== merge.current.key || now - merge.current.at > 900) { past.current.push(before); if (past.current.length > HISTORY) past.current.shift(); future.current = []; }
    merge.current = { key: key ?? "", at: now };
  };
  const commit = (change: (canvas: InfinityCanvas) => InfinityCanvas, key?: string) => {
    const before = current.current;
    if (!before?.canvas) return;
    record(before, key);
    show({ ...before, canvas: change(before.canvas) });
  };
  const setMeta = (patch: Partial<Flipbook>, key?: string) => {
    const before = current.current;
    if (!before) return;
    record(before, key);
    show({ ...before, ...patch });
  };
  const drag = (change: (canvas: InfinityCanvas) => InfinityCanvas) => { const open = current.current; if (open?.canvas) show({ ...open, canvas: change(open.canvas) }); };
  const remember = (before: Flipbook) => { if (current.current !== before) { past.current.push(before); future.current = []; } };
  const undo = () => { const previous = past.current.pop(); if (previous && current.current) { future.current.push(current.current); show(previous); setSelection(null); } };
  const redo = () => { const next = future.current.pop(); if (next && current.current) { past.current.push(current.current); show(next); setSelection(null); } };

  const updateFrame = (frameId: string, patch: Partial<InfinityFrame>, key?: string) => commit((canvas) => ({ ...canvas, frames: canvas.frames.map((frame) => (frame.id === frameId ? { ...frame, ...patch } : frame)) }), key);
  const updateElement = (elementId: string, patch: Partial<BookElement>, key?: string) => commit((canvas) => ({ ...canvas, elements: canvas.elements.map((element) => (element.id === elementId ? ({ ...element, ...patch } as BookElement) : element)) }), key);
  const setCanvas = (patch: Partial<InfinityCanvas>, key?: string) => commit((canvas) => ({ ...canvas, ...patch }), key);

  /* ---------- camera ---------- */
  const home = useCallback(() => (current.current?.canvas ? fitCamera(overviewRect(current.current.canvas), viewRef.current.w, viewRef.current.h, 0.9) : camera.current), []);
  const paint = useCallback(() => {
    const element = layer.current;
    if (!element) return;
    element.style.transform = placeLayer(camera.current);
    element.style.setProperty("--inv", String(1 / camera.current.zoom));
    if (current.current?.canvas) paintBackdrop(backdrop.current, current.current.canvas, camera.current, home(), size.w);
    setZoomLabel(Math.round((camera.current.zoom / Math.max(home().zoom, 1e-6)) * 100));
  }, [size, home]); // eslint-disable-line react-hooks/exhaustive-deps

  const flyTo = useCallback((next: Camera) => {
    cancelAnimationFrame(flight.current);
    const from = { ...camera.current };
    const started = performance.now();
    const frame = (now: number) => {
      const t = Math.min(1, (now - started) / FLIGHT_MS);
      camera.current = flightAt(from, next, t, viewRef.current.w, viewRef.current.h);
      paint();
      if (t < 1) flight.current = requestAnimationFrame(frame);
    };
    flight.current = requestAnimationFrame(frame);
  }, [paint]);
  const flyToRect = (rect: Rect) => flyTo(fitCamera(rect, view.w, view.h, 0.86));
  useLayoutEffect(() => { paint(); }, [panelOpen, paint]);

  useLayoutEffect(() => {
    const element = stage.current;
    if (!element) return;
    const measure = () => setSize({ w: element.clientWidth, h: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [book === null]); // eslint-disable-line react-hooks/exhaustive-deps

  const placed = useRef(false);
  useLayoutEffect(() => {
    if (!size.w || !current.current?.canvas) return;
    if (!placed.current) { camera.current = home(); placed.current = true; }
    paint();
  }, [size, paint, home, book === null]); // eslint-disable-line react-hooks/exhaustive-deps

  const toWorld = (clientX: number, clientY: number) => {
    const box = stage.current!.getBoundingClientRect();
    const cam = camera.current;
    return { x: cam.x + (clientX - box.left - viewRef.current.l - viewRef.current.w / 2) / cam.zoom, y: cam.y + (clientY - box.top - size.h / 2) / cam.zoom };
  };

  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      if (isTyping(event.target) || (event.target as HTMLElement).closest(".ie-path, .ie-style, .ie-notes, .ie-help, .ie-pop")) return;
      event.preventDefault();
      cancelAnimationFrame(flight.current);
      const cam = camera.current;
      if (event.ctrlKey || event.metaKey) {
        const box = element.getBoundingClientRect();
        const px = event.clientX - box.left - viewRef.current.l - viewRef.current.w / 2;
        const py = event.clientY - box.top - size.h / 2;
        const zoom = Math.min(40, Math.max(0.02, cam.zoom * Math.exp(-Math.max(-30, Math.min(30, event.deltaY)) * 0.01)));
        camera.current = { x: cam.x + px / cam.zoom - px / zoom, y: cam.y + py / cam.zoom - py / zoom, zoom };
      } else {
        camera.current = { ...cam, x: cam.x + event.deltaX / cam.zoom, y: cam.y + event.deltaY / cam.zoom };
      }
      paint();
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [paint, size, book === null]); // eslint-disable-line react-hooks/exhaustive-deps

  const zoomBy = (factor: number) => flyTo({ ...camera.current, zoom: Math.min(40, Math.max(0.02, camera.current.zoom * factor)) });

  /* ---------- path: overview, topics, subtopics ---------- */
  const canvasNow = book?.canvas;
  const steps = useMemo(() => (canvasNow ? pathSteps(canvasNow) : []), [canvasNow]);
  const contextFrame = canvasNow?.frames.find((frame) => frame.id === context) ?? null;
  const goOverview = () => { setContext(null); setSelection(null); setStep(-1); if (canvasNow) flyToRect(overviewRect(canvasNow)); };
  const enter = (frame: InfinityFrame) => {
    setContext(frame.id);
    setSelection({ kind: "frame", id: frame.id });
    setStep(steps.findIndex((item) => item.frame.id === frame.id));
    flyToRect(frame);
  };
  const goUp = () => {
    if (!canvasNow || !contextFrame) return;
    const parent = parentOf(canvasNow, contextFrame);
    if (parent) enter(parent); else goOverview();
  };
  const goStep = (index: number) => {
    if (index < 0) { goOverview(); return; }
    const target = steps[Math.min(index, steps.length - 1)];
    if (!target || !canvasNow) return;
    setStep(Math.min(index, steps.length - 1));
    setSelection({ kind: "frame", id: target.frame.id });
    setContext(parentOf(canvasNow, target.frame)?.id ?? null);
    flyToRect(target.frame);
  };

  /* ---------- pointer: select, move, resize, pan ---------- */
  const follow = (onMove: (event: PointerEvent) => void, onEnd: (event: PointerEvent) => void) => {
    const up = (event: PointerEvent) => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up); onEnd(event); };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const pan = (event: React.PointerEvent, onClick?: () => void) => {
    const startX = event.clientX;
    const startY = event.clientY;
    const startCam = { ...camera.current };
    let moved = false;
    follow((move) => {
      const dx = move.clientX - startX;
      const dy = move.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true;
      camera.current = { ...startCam, x: startCam.x - dx / startCam.zoom, y: startCam.y - dy / startCam.zoom };
      paint();
    }, () => { if (!moved) onClick?.(); });
  };

  const onStagePointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0 || !current.current?.canvas) return;
    const target = event.target as HTMLElement;
    if (target.closest(".ie-ctx, .ie-textedit")) return;
    cancelAnimationFrame(flight.current);
    if (tool === "hand") { pan(event); return; }
    const handle = target.closest<HTMLElement>("[data-corner]");
    const before = current.current;
    const canvas = before.canvas!;
    const startX = event.clientX;
    const startY = event.clientY;
    const zoom = camera.current.zoom;

    if (handle && selection) {
      const corner = handle.dataset.corner as Corner;
      const box = selection.kind === "frame" ? canvas.frames.find((f) => f.id === selection.id) : canvas.elements.find((e) => e.id === selection.id);
      if (!box) return;
      const keepRatio = selection.kind === "frame" ? (box as InfinityFrame).shape === "circle" : ["image", "icon", "chart"].includes((box as BookElement).type);
      const ratio = box.w / box.h;
      follow((move) => {
        const dx = (move.clientX - startX) / zoom;
        const dy = (move.clientY - startY) / zoom;
        let { x, y, w, h } = box;
        if (corner.includes("e")) w = Math.max(20, box.w + dx);
        if (corner.includes("w")) { w = Math.max(20, box.w - dx); x = box.x + box.w - w; }
        if (corner.includes("s")) h = Math.max(20, box.h + dy);
        if (corner.includes("n")) { h = Math.max(20, box.h - dy); y = box.y + box.h - h; }
        if (keepRatio) { h = w / ratio; if (corner.includes("n")) y = box.y + box.h - h; }
        drag((open) => selection.kind === "frame"
          ? { ...open, frames: open.frames.map((f) => (f.id === selection.id ? { ...f, x, y, w, h } : f)) }
          : { ...open, elements: open.elements.map((e) => (e.id === selection.id ? ({ ...e, x, y, w, h } as BookElement) : e)) });
      }, () => remember(before));
      return;
    }

    // Elements are hit directly; otherwise the smallest frame under the pointer (circles by their shape).
    const element = target.closest<HTMLElement>("[data-ib-kind]");
    const point = toWorld(event.clientX, event.clientY);
    const underFrame = element ? null : frameAt(canvas, point.x, point.y);
    const hit = element ? { kind: "element" as const, id: element.dataset.ibId! } : underFrame ? { kind: "frame" as const, id: underFrame.id } : null;

    if (hit) {
      const { kind, id: hitId } = hit;
      setSelection({ kind, id: hitId });
      if (editingText === hitId) return;
      setEditingText(null);
      // A frame carries what lies inside it.
      const frame = kind === "frame" ? canvas.frames.find((f) => f.id === hitId)! : null;
      const carried = frame ? new Set([...canvas.elements.filter((e) => containedIn(e, frame)).map((e) => e.id), ...canvas.frames.filter((f) => f.id !== hitId && containedIn(f, frame)).map((f) => f.id)]) : new Set<string>();
      const origin = new Map([...canvas.frames, ...canvas.elements].map((item) => [item.id, { x: item.x, y: item.y }]));
      let moved = false;
      follow((move) => {
        const dx = (move.clientX - startX) / zoom;
        const dy = (move.clientY - startY) / zoom;
        if (!moved && Math.hypot(move.clientX - startX, move.clientY - startY) < 3) return;
        moved = true;
        const shift = <T extends { id: string; x: number; y: number }>(item: T): T => (item.id === hitId || carried.has(item.id) ? { ...item, x: origin.get(item.id)!.x + dx, y: origin.get(item.id)!.y + dy } : item);
        drag((open) => ({ ...open, frames: open.frames.map(shift), elements: open.elements.map((e) => shift(e) as BookElement) }));
      }, () => remember(before));
      return;
    }
    pan(event, () => { setSelection(null); setEditingText(null); });
  };

  /** Double-clicking a frame goes into it, like opening a topic in the path. */
  const onStageDoubleClick = (event: React.MouseEvent) => {
    if (!canvasNow || (event.target as HTMLElement).closest("[data-ib-kind], .ie-ctx")) return;
    const point = toWorld(event.clientX, event.clientY);
    const frame = frameAt(canvasNow, point.x, point.y);
    if (frame) enter(frame);
  };

  /* ---------- adding things ---------- */
  const viewCentre = () => ({ x: camera.current.x, y: camera.current.y, unit: 1 / camera.current.zoom });
  const addElement = (element: BookElement) => {
    commit((canvas) => ({ ...canvas, elements: [...canvas.elements, element] }));
    setSelection({ kind: "element", id: element.id });
    setMenu(null);
  };
  const addElements = (elements: BookElement[]) => { commit((canvas) => ({ ...canvas, elements: [...canvas.elements, ...elements] })); setSelection(null); setMenu(null); };
  const textAt = (text: string, size: number, x: number, y: number, w: number, extra: Partial<TextElement> = {}): TextElement => ({ id: uid(), type: "text", text, size, color: "#ffffff", bold: false, align: "left", font: "'Noto Sans KR'", lineHeight: 1.3, x, y, w, h: size * 1.5, actions: [], ...extra });
  const addText = (kind: "title" | "subtitle" | "body") => {
    const { x, y, unit } = viewCentre();
    const size = { title: 80, subtitle: 44, body: 26 }[kind] * unit;
    addElement(textAt(kind === "title" ? "제목" : kind === "subtitle" ? "부제목" : "본문을 입력하세요", size, x - 300 * unit, y - size, 600 * unit, { bold: kind !== "body", font: kind === "title" ? "'Noto Serif KR'" : "'Noto Sans KR'" }));
  };
  const addShape = (shape: string) => {
    const { x, y, unit } = viewCentre();
    addElement({ id: uid(), type: "shape", shape, fill: "#ffffff", x: x - 100 * unit, y: y - 100 * unit, w: 200 * unit, h: 200 * unit, actions: [] });
  };
  const addLine = (arrow: boolean) => {
    const { x, y, unit } = viewCentre();
    addElement({ id: uid(), type: "line", color: "#ffffff", thickness: 6, style: "solid", arrow, x: x - 160 * unit, y: y - 3 * unit, w: 320 * unit, h: 6 * unit, actions: [] });
  };
  const addVideo = () => {
    const { x, y, unit } = viewCentre();
    addElement({ id: uid(), type: "video", src: "", x: x - 240 * unit, y: y - 135 * unit, w: 480 * unit, h: 270 * unit, actions: [] });
  };
  const addMore = (kind: "table" | "bar" | "pie" | "icon") => {
    const { x, y, unit } = viewCentre();
    if (kind === "table") addElement({ id: uid(), type: "table", rows: [["항목", "내용", "비고"], ["", "", ""], ["", "", ""]], size: 22 * unit, color: "#17181c", headerColor: "#4a3f8f", x: x - 300 * unit, y: y - 100 * unit, w: 600 * unit, h: 200 * unit, actions: [] });
    else if (kind === "icon") addElement({ id: uid(), type: "icon", name: "star", color: "#ffffff", stroke: 1.8, x: x - 60 * unit, y: y - 60 * unit, w: 120 * unit, h: 120 * unit, actions: [] });
    else addElement({ id: uid(), type: "chart", kind: kind === "bar" ? "bar" : "pie", labels: ["1월", "2월", "3월", "4월"], values: [12, 28, 20, 35], color: "#4a3f8f", textColor: "#ffffff", x: x - 250 * unit, y: y - 170 * unit, w: 500 * unit, h: 340 * unit, actions: [] });
  };
  const addStory = (kind: "heading" | "photo" | "numbers" | "steps") => {
    const { x, y, unit: u } = viewCentre();
    if (kind === "heading") addElements([textAt("제목", 64 * u, x - 340 * u, y - 110 * u, 680 * u, { bold: true, font: "'Noto Serif KR'" }), textAt("여기에 내용을 적어 주세요. 핵심을 두세 문장으로 정리하면 발표할 때 읽기 좋습니다.", 26 * u, x - 340 * u, y, 680 * u, { h: 110 * u })]);
    if (kind === "photo") {
      addElements([textAt("사진 설명", 30 * u, x + 20 * u, y - 60 * u, 360 * u, { bold: true }), textAt("사진에 대한 설명을 적어 주세요.", 22 * u, x + 20 * u, y, 360 * u, { h: 90 * u })]);
      pickImage("new");
    }
    if (kind === "numbers") addElements([0, 1, 2].flatMap((i) => [textAt(["120", "35%", "8주"][i], 72 * u, x - 420 * u + i * 290 * u, y - 90 * u, 260 * u, { bold: true, align: "center" }), textAt("설명을 입력하세요", 22 * u, x - 420 * u + i * 290 * u, y + 30 * u, 260 * u, { align: "center" })]));
    if (kind === "steps") addElements([0, 1, 2].flatMap((i) => [textAt(`0${i + 1}`, 40 * u, x - 420 * u + i * 290 * u, y - 90 * u, 260 * u, { bold: true }), textAt(["준비", "진행", "마무리"][i], 30 * u, x - 420 * u + i * 290 * u, y - 30 * u, 260 * u, { bold: true }), textAt("단계 설명을 입력하세요", 20 * u, x - 420 * u + i * 290 * u, y + 20 * u, 260 * u, { h: 70 * u })]));
  };

  /** A new frame: on the open canvas beside what is there, or inside the topic being edited. */
  const addFrame = (kind: "circle" | "rect" | "invisible") => {
    const canvas = current.current?.canvas;
    if (!canvas) return;
    const style = kind === "invisible" ? { shape: "rect" as const, fill: "transparent", stroke: undefined } : { shape: kind, ...ringFrame };
    let frame: InfinityFrame;
    if (contextFrame) {
      // Subtopics line up in the lower half of the topic, under its heading.
      const siblings = childrenOf(canvas, contextFrame).length;
      const inner = Math.min(contextFrame.w, contextFrame.h) * 0.2;
      const slots = [0.5, 0.27, 0.73, 0.385, 0.615];
      const cx = contextFrame.x + contextFrame.w * slots[siblings % slots.length];
      const cy = contextFrame.y + contextFrame.h * (siblings < 3 ? 0.7 : 0.88 - 0.06);
      frame = { id: uid(), x: cx - inner / 2, y: cy - inner / 2, w: inner, h: inner * (kind === "circle" ? 1 : 0.62), ...style, title: "하위 주제" };
    } else {
      const bounds = overviewRect(canvas);
      const outer = 300;
      frame = { id: uid(), x: bounds.x + bounds.w + 80, y: bounds.y + bounds.h / 2 - outer / 2, w: outer, h: kind === "circle" ? outer : outer * 0.62, ...style, title: kind === "circle" ? "원으로 확대" : "프레임" };
    }
    commit((open) => ({ ...open, frames: [...open.frames, frame] }));
    setSelection({ kind: "frame", id: frame.id });
    setMenu(null);
    flyToRect(contextFrame ?? overviewRect({ ...canvas, frames: [...canvas.frames, frame] }));
  };

  const pickImage = (target: "new" | "background" | string) => { uploadTarget.current = target; setMenu(null); fileInput.current?.click(); };
  const onImage = async (file: File) => {
    setNotice("사진을 올리는 중…");
    try {
      const prepared = await prepareImage(file);
      const url = await uploadBookFile(id, prepared.image);
      const target = uploadTarget.current;
      if (target === "background") setCanvas({ backgroundImage: url });
      else if (target !== "new") updateElement(target, { src: url } as Partial<BookElement>);
      else {
        const { x, y, unit } = viewCentre();
        const w = 420 * unit;
        const h = w * (prepared.height / prepared.width);
        addElement({ id: uid(), type: "image", src: url, fit: "cover", x: x - w / 2, y: y - h / 2, w, h, actions: [] });
      }
      setNotice("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "사진을 올리지 못했습니다.");
    }
  };

  /** Deleting a frame takes what is inside it too. */
  const removeItem = (target: Selection) => {
    if (!target || !current.current?.canvas) return;
    if (target.kind === "frame") {
      const frame = current.current.canvas.frames.find((f) => f.id === target.id);
      if (!frame) return;
      commit((canvas) => ({ ...canvas, frames: canvas.frames.filter((f) => f.id !== frame.id && !containedIn(f, frame)), elements: canvas.elements.filter((e) => !containedIn(e, frame)) }));
      if (context === frame.id) setContext(null);
    } else commit((canvas) => ({ ...canvas, elements: canvas.elements.filter((e) => e.id !== target.id) }));
    setSelection(null);
    setItemMenu(null);
  };
  const duplicateItem = (target: Selection) => {
    if (!target || !current.current?.canvas) return;
    const canvas = current.current.canvas;
    if (target.kind === "frame") {
      const source = canvas.frames.find((f) => f.id === target.id);
      if (!source) return;
      const dx = source.w * 1.15;
      const frames = canvas.frames.filter((f) => f.id !== source.id && containedIn(f, source)).map((f) => ({ ...f, id: uid(), x: f.x + dx }));
      const elements = canvas.elements.filter((e) => containedIn(e, source)).map((e) => ({ ...e, id: uid(), x: e.x + dx }) as BookElement);
      const copy = { ...source, id: uid(), x: source.x + dx, title: `${source.title} 복사` };
      commit((open) => ({ ...open, frames: [...open.frames, copy, ...frames], elements: [...open.elements, ...elements] }));
      setSelection({ kind: "frame", id: copy.id });
    } else {
      const source = canvas.elements.find((e) => e.id === target.id);
      if (!source) return;
      const offset = 30 / camera.current.zoom;
      const copy = { ...source, id: uid(), x: source.x + offset, y: source.y + offset } as BookElement;
      commit((open) => ({ ...open, elements: [...open.elements, copy] }));
      setSelection({ kind: "element", id: copy.id });
    }
    setItemMenu(null);
  };
  const bringForward = (elementId: string) => commit((canvas) => {
    const elements = [...canvas.elements];
    const at = elements.findIndex((e) => e.id === elementId);
    if (at < 0 || at === elements.length - 1) return canvas;
    [elements[at], elements[at + 1]] = [elements[at + 1], elements[at]];
    return { ...canvas, elements };
  });

  /* ---------- clipboard, find, copies ---------- */
  const copyItem = (target: Selection) => {
    const canvas = current.current?.canvas;
    if (!target || !canvas) return false;
    if (target.kind === "frame") {
      const frame = canvas.frames.find((f) => f.id === target.id);
      if (!frame) return false;
      clip.current = { frames: [frame, ...canvas.frames.filter((f) => f.id !== frame.id && containedIn(f, frame))], elements: canvas.elements.filter((e) => containedIn(e, frame)) };
    } else {
      const element = canvas.elements.find((e) => e.id === target.id);
      if (!element) return false;
      clip.current = { frames: [], elements: [element] };
    }
    setNotice("복사했습니다.");
    window.setTimeout(() => setNotice(""), 1200);
    return true;
  };
  const cutItem = (target: Selection) => { if (copyItem(target)) removeItem(target); };
  const pasteItems = () => {
    const copied = clip.current;
    if (!copied) return;
    const offset = 40 / camera.current.zoom;
    const frames = copied.frames.map((f) => ({ ...f, id: uid(), x: f.x + offset, y: f.y + offset }));
    const elements = copied.elements.map((e) => ({ ...e, id: uid(), x: e.x + offset, y: e.y + offset }) as BookElement);
    commit((canvas) => ({ ...canvas, frames: [...canvas.frames, ...frames], elements: [...canvas.elements, ...elements] }));
    setSelection(frames[0] ? { kind: "frame", id: frames[0].id } : elements[0] ? { kind: "element", id: elements[0].id } : null);
  };
  const makeCopy = async () => {
    const open = current.current;
    if (!open) return;
    await flush();
    const now = Date.now();
    const copy: Flipbook = { ...open, id: uid(), title: `${open.title} 사본`, published: false, createdAt: now, updatedAt: now };
    try { await saveFlipbook(copy); window.location.assign(`/admin/infinity/${copy.id}`); } catch { setNotice("사본을 만들지 못했습니다."); }
  };
  const removeAnimations = () => commit((canvas) => ({ ...canvas, elements: canvas.elements.map((e) => (e.animation && e.animation !== "none" ? ({ ...e, animation: "none" } as BookElement) : e)) }));
  const matches = (canvasNow?.elements ?? []).filter((e): e is TextElement => e.type === "text" && Boolean(findText) && e.text.includes(findText));
  const frameMatches = (canvasNow?.frames ?? []).filter((f) => Boolean(findText) && f.title.includes(findText));
  const findAt = useRef(0);
  const findNext = () => {
    const all = [...matches, ...frameMatches];
    if (all.length === 0) return;
    const target = all[findAt.current % all.length];
    findAt.current += 1;
    setSelection({ kind: "title" in target ? "frame" : "element", id: target.id });
    flyToRect({ x: target.x - target.w * 0.6, y: target.y - target.h * 2, w: target.w * 2.2, h: target.h * 5 });
  };
  const replaceAll = () => {
    if (!findText) return;
    commit((canvas) => ({
      ...canvas,
      elements: canvas.elements.map((e) => (e.type === "text" && e.text.includes(findText) ? { ...e, text: e.text.split(findText).join(replaceText) } : e)),
      frames: canvas.frames.map((f) => (f.title.includes(findText) ? { ...f, title: f.title.split(findText).join(replaceText) } : f)),
    }));
  };

  const stateRef = useRef({ selection, undo, redo, removeItem, duplicateItem, flush, goStep, step, copyItem, cutItem, pasteItems });
  stateRef.current = { selection, undo, redo, removeItem, duplicateItem, flush, goStep, step, copyItem, cutItem, pasteItems };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const api = stateRef.current;
      const command = event.metaKey || event.ctrlKey;
      if (command && event.key.toLowerCase() === "s") { event.preventDefault(); void api.flush(); return; }
      if (isTyping(event.target)) return;
      if (command && event.key.toLowerCase() === "z") { event.preventDefault(); if (event.shiftKey) api.redo(); else api.undo(); return; }
      if (command && event.key.toLowerCase() === "y") { event.preventDefault(); api.redo(); return; }
      if (command && event.key.toLowerCase() === "f") { event.preventDefault(); setFindOpen(true); return; }
      if (command && event.key.toLowerCase() === "v") { event.preventDefault(); api.pasteItems(); return; }
      if (command && event.key.toLowerCase() === "c" && api.selection) { event.preventDefault(); api.copyItem(api.selection); return; }
      if (command && event.key.toLowerCase() === "x" && api.selection) { event.preventDefault(); api.cutItem(api.selection); return; }
      if (event.key === "Escape") { setSelection(null); setMenu(null); setEditingText(null); return; }
      if (!api.selection || api.selection.kind === "frame") {
        if (event.key === "ArrowRight") { api.goStep(api.step + 1); return; }
        if (event.key === "ArrowLeft") { api.goStep(api.step - 1); return; }
      }
      if (!api.selection) return;
      if (command && event.key.toLowerCase() === "d") { event.preventDefault(); api.duplicateItem(api.selection); return; }
      if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); api.removeItem(api.selection); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ---------- path list drag: reorder among siblings ---------- */
  const dragFrom = useRef<string | null>(null);
  const dropOn = (targetId: string) => {
    const from = dragFrom.current;
    dragFrom.current = null;
    if (!from || from === targetId) return;
    commit((canvas) => {
      const after = canvas.frames.findIndex((f) => f.id === targetId) > canvas.frames.findIndex((f) => f.id === from);
      const frames = canvas.frames.filter((f) => f.id !== from);
      const at = frames.findIndex((f) => f.id === targetId);
      frames.splice(after ? at + 1 : at, 0, canvas.frames.find((f) => f.id === from)!);
      return { ...canvas, frames };
    });
  };

  if (missing) return <div className="ie ie--message">인피니티북을 찾을 수 없습니다. <Link to="/admin/infinity">목록으로</Link></div>;
  if (!book?.canvas) return <div className="ie ie--message">불러오는 중…</div>;
  const canvas = book.canvas;
  const selectedFrame = selection?.kind === "frame" ? canvas.frames.find((f) => f.id === selection.id) ?? null : null;
  const selectedElement = selection?.kind === "element" ? canvas.elements.find((e) => e.id === selection.id) ?? null : null;
  const selectedBox = selectedFrame ?? selectedElement;
  const editing = selectedElement?.type === "text" && editingText === selectedElement.id ? (selectedElement as TextElement) : null;
  const saveText = { saved: "모든 변경 사항이 저장됨", dirty: "저장 대기 중", saving: "저장 중…", error: "저장하지 못했습니다" }[saveState];
  const overview = overviewRect(canvas);
  const listed = childrenOf(canvas, contextFrame);
  const parentOfContext = contextFrame ? parentOf(canvas, contextFrame) : null;
  const notesFrame = selectedFrame ?? contextFrame ?? (step >= 0 ? steps[step]?.frame : null) ?? null;
  const toggle = (name: MenuName) => setMenu((open) => (open === name ? null : name));
  const invisible = (frame: InfinityFrame) => !frame.stroke && (frame.fill === "transparent" || !frame.fill);

  const renderElement = (element: BookElement, body: ReactNode) => (
    <div key={element.id} className={`ib-el fb-el--${element.type} ie-el`} style={worldBox(element)} data-ib-kind="element" data-ib-id={element.id} onDoubleClick={() => { if (element.type === "text") setEditingText(element.id); }}>
      <div className="fb-el__in" style={editingText === element.id ? { visibility: "hidden" } : undefined}>{body}</div>
    </div>
  );

  const pathItem = (frame: InfinityFrame) => (
    <li key={frame.id} draggable onDragStart={() => { dragFrom.current = frame.id; }} onDragOver={(event) => event.preventDefault()} onDrop={() => dropOn(frame.id)}
      className={`ie-item${selection?.id === frame.id ? " is-on" : ""}`}>
      <i className="ie-item__dot" />
      <div className="ie-item__card">
        <button type="button" className="ie-thumb" onClick={() => enter(frame)}>
          <Thumb canvas={canvas} rect={frame} />
          <b className="ie-thumb__badge">{stepRange(steps, canvas, frame)}</b>
        </button>
        <span className="ie-item__more">
          <button type="button" aria-label="프레임 메뉴" onClick={() => setItemMenu((open) => (open === frame.id ? null : frame.id))}><Ellipsis size={15} /></button>
          {itemMenu === frame.id && (
            <span className="ie-pop ie-pop--item">
              <button type="button" onClick={() => { setRenaming(frame.id); setItemMenu(null); }}>이름 바꾸기</button>
              <button type="button" onClick={() => duplicateItem({ kind: "frame", id: frame.id })}>복제</button>
              <button type="button" className="is-danger" onClick={() => removeItem({ kind: "frame", id: frame.id })}>삭제</button>
            </span>
          )}
        </span>
      </div>
      {renaming === frame.id
        ? <input className="ie-item__rename" autoFocus defaultValue={frame.title} onBlur={(event) => { updateFrame(frame.id, { title: event.target.value }); setRenaming(null); }} onKeyDown={(event) => { if (event.key === "Enter") (event.target as HTMLInputElement).blur(); if (event.key === "Escape") setRenaming(null); }} />
        : <span className="ie-item__label" onDoubleClick={() => setRenaming(frame.id)}>{frame.title || "프레임"}</span>}
    </li>
  );

  /* ---------- right bar: settings of the selection, or of the canvas ---------- */
  const numberField = (label: string, value: number, onChange: (value: number) => void, key: string) => (
    <label className="ie-num"><span>{label}</span><input type="number" value={Math.round(value)} onChange={(event) => { const next = Number(event.target.value); if (Number.isFinite(next)) onChange(next); }} data-key={key} /></label>
  );
  const boxFields = (box: { id: string; x: number; y: number; w: number; h: number }, patch: (value: Partial<Rect>, key: string) => void) => (
    <section>
      <h4>위치와 크기</h4>
      <div className="ie-grid2">
        {numberField("X", box.x, (x) => patch({ x }, `x:${box.id}`), "x")}
        {numberField("Y", box.y, (y) => patch({ y }, `y:${box.id}`), "y")}
        {numberField("너비", box.w, (w) => patch({ w: Math.max(10, w) }, `w:${box.id}`), "w")}
        {numberField("높이", box.h, (h) => patch({ h: Math.max(10, h) }, `h:${box.id}`), "h")}
      </div>
    </section>
  );
  const colorRow = (label: string, value: string | undefined, fallback: string, onChange: (value: string) => void, key: string, extra?: ReactNode) => (
    <div className="ie-field"><span>{label}</span><span className="ie-field__end">{extra}<input type="color" value={hex(value, fallback)} onChange={(event) => onChange(event.target.value)} data-key={key} /></span></div>
  );

  const elementPatch = (element: BookElement) => (patch: Partial<BookElement>, key?: string) => updateElement(element.id, patch, key);
  const inspector = (() => {
    if (selectedFrame) {
      const frame = selectedFrame;
      const set = (patch: Partial<InfinityFrame>, key?: string) => updateFrame(frame.id, patch, key);
      return (
        <>
          <section>
            <h4>프레임 <small>{stepRange(steps, canvas, frame) || "경로 밖"}</small></h4>
            <label className="ie-field ie-field--col"><span>이름 (경로에 표시)</span><input className="ie-input" value={frame.title} onChange={(event) => set({ title: event.target.value }, `title:${frame.id}`)} /></label>
            <div className="ie-seg">
              <button type="button" className={frame.shape === "circle" && !invisible(frame) ? "is-on" : ""} onClick={() => set({ shape: "circle", h: frame.w, ...(invisible(frame) ? ringFrame : {}) })}>원</button>
              <button type="button" className={frame.shape === "rect" && !invisible(frame) ? "is-on" : ""} onClick={() => set({ shape: "rect", ...(invisible(frame) ? ringFrame : {}) })}>사각형</button>
              <button type="button" className={invisible(frame) ? "is-on" : ""} onClick={() => set({ shape: "rect", fill: "transparent", stroke: undefined })}>보이지 않음</button>
            </div>
            {colorRow("테두리", frame.stroke, "#4a3f8f", (stroke) => set({ stroke }, `stroke:${frame.id}`), "stroke", frame.stroke ? <button type="button" className="ie-link" onClick={() => set({ stroke: undefined })}>없음</button> : null)}
            {colorRow("채우기", frame.fill, "#ffffff", (fill) => set({ fill }, `fill:${frame.id}`), "fill", frame.fill !== "transparent" ? <button type="button" className="ie-link" onClick={() => set({ fill: "transparent" })}>없음</button> : null)}
            <div className="ie-swatches">{FRAME_STROKES.map((stroke) => <button key={stroke} type="button" aria-label={`테두리 ${stroke}`} style={{ background: stroke }} onClick={() => set({ stroke })} />)}</div>
          </section>
          {boxFields(frame, (patch, key) => set(patch, key))}
          <section>
            <h4>발표자 노트</h4>
            <textarea className="ie-input ie-area" placeholder="이 프레임에서 할 말을 적어 두세요." value={frame.notes ?? ""} onChange={(event) => set({ notes: event.target.value }, `notes:${frame.id}`)} />
          </section>
          <section>
            <div className="ie-row">
              <button type="button" className="ie-btn" onClick={() => enter(frame)}>안으로 들어가기</button>
              <button type="button" className="ie-btn" onClick={() => duplicateItem(selection)}><FiCopy />복제</button>
              <button type="button" className="ie-btn ie-btn--danger" aria-label="삭제" onClick={() => removeItem(selection)}><FiTrash2 /></button>
            </div>
            <p className="ie-hint">프레임을 지우면 그 안의 내용도 함께 지워집니다.</p>
          </section>
        </>
      );
    }
    if (selectedElement) {
      const element = selectedElement;
      const set = elementPatch(element);
      const owner = parentOf(canvas, element);
      return (
        <>
          {element.type === "text" && (
            <section>
              <h4>텍스트</h4>
              <textarea className="ie-input ie-area" spellCheck={spell} value={element.text} onChange={(event) => set({ text: event.target.value } as Partial<BookElement>, `text:${element.id}`)} />
              <CustomSelect aria-label="서체" options={BOOK_FONTS.map(({ value, label }) => ({ value, label }))} value={element.font ?? "inherit"} onValueChange={(font) => set({ font } as Partial<BookElement>)} />
              <div className="ie-row">
                {numberField("크기", element.size, (size) => size > 0 && set({ size } as Partial<BookElement>, `size:${element.id}`), "size")}
                <input type="color" aria-label="글자색" value={hex(element.color, "#000000")} onChange={(event) => set({ color: event.target.value } as Partial<BookElement>, `color:${element.id}`)} />
                <button type="button" className={`ie-icon${element.bold ? " is-on" : ""}`} aria-label="굵게" onClick={() => set({ bold: !element.bold } as Partial<BookElement>)}><FiBold /></button>
              </div>
              <div className="ie-seg">
                {(["left", "center", "right"] as const).map((align) => <button key={align} type="button" aria-label={`${align} 정렬`} className={element.align === align ? "is-on" : ""} onClick={() => set({ align } as Partial<BookElement>)}>{align === "left" ? <FiAlignLeft /> : align === "center" ? <FiAlignCenter /> : <FiAlignRight />}</button>)}
              </div>
              <label className="ie-field"><span>줄 간격</span><input className="ie-range" type="range" min={0.9} max={2.2} step={0.05} value={element.lineHeight ?? 1.3} onChange={(event) => set({ lineHeight: Number(event.target.value) } as Partial<BookElement>, `lh:${element.id}`)} /></label>
              <p className="ie-hint">캔버스에서 더블클릭하면 바로 고칠 수 있습니다.</p>
            </section>
          )}
          {element.type === "text" && <InfinityTextAi key={element.id} element={element} onApply={(value) => set({ text: value } as Partial<BookElement>)} />}
          {element.type === "image" && (
            <section>
              <h4>이미지</h4>
              <div className="ie-imgprev" style={{ backgroundImage: `url("${element.src}")` }} />
              <button type="button" className="ie-btn ie-btn--wide" onClick={() => pickImage(element.id)}>이미지 바꾸기</button>
              <div className="ie-seg">
                <button type="button" className={element.fit === "cover" ? "is-on" : ""} onClick={() => set({ fit: "cover" } as Partial<BookElement>)}>꽉 채우기</button>
                <button type="button" className={element.fit === "contain" ? "is-on" : ""} onClick={() => set({ fit: "contain" } as Partial<BookElement>)}>전체 보이기</button>
              </div>
            </section>
          )}
          {element.type === "shape" && (
            <section>
              <h4>도형</h4>
              <div className="ie-shapes">{BOOK_SHAPES.slice(0, 12).map((shape) => <button key={shape.name} type="button" title={shape.label} aria-label={shape.label} className={element.shape === shape.name ? "is-on" : ""} onClick={() => set({ shape: shape.name } as Partial<BookElement>)}><svg viewBox="0 0 100 100"><path d={shape.path} /></svg></button>)}</div>
              {colorRow("색", element.fill, "#ffffff", (fill) => set({ fill } as Partial<BookElement>, `fill:${element.id}`), "fill")}
            </section>
          )}
          {element.type === "line" && (
            <section>
              <h4>선</h4>
              {colorRow("색", element.color, "#ffffff", (color) => set({ color } as Partial<BookElement>, `color:${element.id}`), "color")}
              <label className="ie-field"><span>두께</span><input className="ie-range" type="range" min={1} max={40} value={element.thickness} onChange={(event) => set({ thickness: Number(event.target.value) } as Partial<BookElement>, `th:${element.id}`)} /></label>
              <div className="ie-seg">
                <button type="button" className={!element.arrow ? "is-on" : ""} onClick={() => set({ arrow: false } as Partial<BookElement>)}>선</button>
                <button type="button" className={element.arrow ? "is-on" : ""} onClick={() => set({ arrow: true } as Partial<BookElement>)}>화살표</button>
              </div>
            </section>
          )}
          {(element.type === "icon" || element.type === "chart") && (
            <section>
              <h4>{element.type === "icon" ? "아이콘" : "차트"}</h4>
              {colorRow("색", element.color, "#ffffff", (color) => set({ color } as Partial<BookElement>, `color:${element.id}`), "color")}
            </section>
          )}
          {element.type === "table" && (
            <section>
              <h4>표</h4>
              {colorRow("머리글 색", element.headerColor, "#4a3f8f", (headerColor) => set({ headerColor } as Partial<BookElement>, `hc:${element.id}`), "hc")}
              <div className="ie-tablegrid" style={{ gridTemplateColumns: `repeat(${element.rows[0]?.length ?? 1}, 1fr)` }}>
                {element.rows.flatMap((row, r) => row.map((cell, c) => <input key={`${r}-${c}`} value={cell} onChange={(event) => set({ rows: element.rows.map((line, i) => (i === r ? line.map((value, j) => (j === c ? event.target.value : value)) : line)) } as Partial<BookElement>, `cell:${element.id}:${r}:${c}`)} />))}
              </div>
            </section>
          )}
          {element.type === "video" && (
            <section>
              <h4>영상</h4>
              <input className="ie-input" placeholder="유튜브, 비메오, MP4 주소" value={element.src} onChange={(event) => set({ src: event.target.value.trim() } as Partial<BookElement>, `src:${element.id}`)} />
              {element.src && !videoSource(element.src) && <p className="ie-error">재생할 수 없는 주소입니다.</p>}
              <p className="ie-hint">발표 화면에서 재생됩니다.</p>
            </section>
          )}
          <section>
            <h4>효과</h4>
            <label className="ie-field"><span>투명도</span><input className="ie-range" type="range" min={0.1} max={1} step={0.05} value={element.opacity ?? 1} onChange={(event) => set({ opacity: Number(event.target.value) }, `op:${element.id}`)} /></label>
            <label className="ie-field"><span>회전</span><input className="ie-range" type="range" min={-180} max={180} value={element.rotation ?? 0} onChange={(event) => set({ rotation: Number(event.target.value) }, `rot:${element.id}`)} /></label>
            <div className="ie-field ie-field--col"><span>애니메이션 {owner ? <small>「{owner.title || "프레임"}」에 도착하면 재생</small> : <small>프레임 안에 있어야 재생됩니다</small>}</span>
              <CustomSelect aria-label="애니메이션" options={ANIMATIONS} value={element.animation ?? "none"} onValueChange={(animation) => set({ animation: animation as BookAnimation })} />
            </div>
          </section>
          {boxFields(element, (patch, key) => set(patch as Partial<BookElement>, key))}
          <section>
            <div className="ie-row">
              <button type="button" className="ie-btn" onClick={() => bringForward(element.id)}><Layers size={15} />앞으로</button>
              <button type="button" className="ie-btn" onClick={() => duplicateItem(selection)}><FiCopy />복제</button>
              <button type="button" className="ie-btn ie-btn--danger" aria-label="삭제" onClick={() => removeItem(selection)}><FiTrash2 /></button>
            </div>
          </section>
        </>
      );
    }
    return (
      <>
        <section>
          <h4>{contextFrame ? contextFrame.title || "프레임" : "캔버스"}</h4>
          <p className="ie-hint">{contextFrame ? "이 프레임 안을 편집하고 있습니다. 왼쪽 경로에서 하위 주제를 추가하거나, 캔버스에서 요소를 선택해 속성을 바꾸세요." : "캔버스에서 프레임이나 요소를 선택하면 여기에서 속성을 바꿀 수 있습니다."}</p>
        </section>
        <section>
          <h4>배경</h4>
          <div className="ie-style__preview ie-style__preview--sm" style={backdropStyle(canvas)} />
          {colorRow("배경색", canvas.background, "#5b6aa8", (background) => setCanvas({ background }, "bg"), "bg")}
          <label className="ie-field"><span>배경 패럴랙스</span><input type="checkbox" className="ie-switch" checked={Boolean(canvas.parallax)} onChange={(event) => setCanvas({ parallax: event.target.checked })} /></label>
          <div className="ie-field"><span>화면 비율</span><CustomSelect aria-label="화면 비율" className="ie-select-sm" options={[{ value: "16:9", label: "16:9" }, { value: "4:3", label: "4:3" }]} value={canvas.ratio ?? "16:9"} onValueChange={(ratio) => setCanvas({ ratio: ratio as "16:9" | "4:3" })} /></div>
          <button type="button" className="ie-btn ie-btn--wide" onClick={() => openPanel("style")}>배경 더 바꾸기</button>
        </section>
        <section>
          <h4>경로 <small>{steps.length}단계</small></h4>
          <p className="ie-hint">프레임은 경로 순서대로 발표됩니다. 주제 안의 하위 주제가 끝나면 주제로 돌아옵니다.</p>
        </section>
      </>
    );
  })();

  /* ---------- left panels ---------- */
  const tile = (label: string, icon: ReactNode, onClick: () => void) => <button type="button" className="ie-tile" onClick={onClick}>{icon}<span>{label}</span></button>;
  const usedImages = [...new Set(canvas.elements.flatMap((element) => (element.type === "image" && element.src ? [element.src] : [])))];
  const addImageFromUrl = (src: string) => {
    const { x, y, unit } = viewCentre();
    addElement({ id: uid(), type: "image", src, fit: "cover", x: x - 210 * unit, y: y - 140 * unit, w: 420 * unit, h: 280 * unit, actions: [] });
  };

  const pathPanel = (
    <>
      <div className="ie-path__head">
        <span data-menu className="ie-anchor ie-addframe">
          <button type="button" className="ie-addframe__main" onClick={() => addFrame("circle")}><FiPlus />{contextFrame ? "하위 주제 추가" : "프레임 추가"}</button>
          <button type="button" className="ie-addframe__caret" aria-label="프레임 종류" onClick={() => toggle("add")}><FiChevronDown /></button>
          {menu === "add" && (
            <div className="ie-pop ie-pop--left ie-pop--full">
              <button type="button" onClick={() => addFrame("circle")}><span className="ie-swatch ie-swatch--circle" />원 프레임</button>
              <button type="button" onClick={() => addFrame("rect")}><span className="ie-swatch ie-swatch--rect" />사각 프레임</button>
              <button type="button" onClick={() => addFrame("invisible")}><span className="ie-swatch ie-swatch--ghost" />보이지 않는 프레임</button>
            </div>
          )}
        </span>
      </div>
      <div className="ie-path__scroll">
        <div className={`ie-current${!selection ? " is-on" : ""}`}>
          <button type="button" className="ie-thumb ie-thumb--current" onClick={() => (contextFrame ? enter(contextFrame) : goOverview())}>
            <Thumb canvas={canvas} rect={contextFrame ?? overview} />
            {contextFrame ? <b className="ie-thumb__badge">{stepRange(steps, canvas, contextFrame)}</b> : <b className="ie-thumb__home"><FiHome /></b>}
          </button>
          <span className="ie-item__label">{contextFrame ? contextFrame.title || "프레임" : "개요"}</span>
        </div>
        <ol className="ie-list">
          {listed.map(pathItem)}
          {contextFrame && (
            <li className="ie-item ie-item--back">
              <i className="ie-item__dot" />
              <div className="ie-item__card">
                <button type="button" className="ie-thumb" onClick={goUp}>
                  <Thumb canvas={canvas} rect={parentOfContext ?? overview} />
                  <b className="ie-thumb__badge"><CornerLeftUp size={13} /></b>
                </button>
              </div>
              <span className="ie-item__label">상위로 돌아가기</span>
            </li>
          )}
        </ol>
        {listed.length === 0 && <p className="ie-path__empty">{contextFrame ? "이 프레임 안에 하위 주제를 추가해 보세요." : "프레임을 추가해 발표 경로를 만드세요."}</p>}
      </div>
    </>
  );

  const insertPanel = (
    <div className="ie-panel__scroll">
      <h5>프레임</h5>
      <div className="ie-tiles">
        {tile("원", <span className="ie-swatch ie-swatch--circle" />, () => addFrame("circle"))}
        {tile("사각형", <span className="ie-swatch ie-swatch--rect" />, () => addFrame("rect"))}
        {tile("보이지 않음", <span className="ie-swatch ie-swatch--ghost" />, () => addFrame("invisible"))}
      </div>
      <h5>텍스트</h5>
      <div className="ie-textadds">
        <button type="button" className="ie-textadd ie-textadd--title" onClick={() => addText("title")}>제목 추가</button>
        <button type="button" className="ie-textadd ie-textadd--subtitle" onClick={() => addText("subtitle")}>부제목 추가</button>
        <button type="button" className="ie-textadd" onClick={() => addText("body")}>본문 추가</button>
      </div>
      <h5>미디어</h5>
      <div className="ie-tiles">
        {tile("이미지", <ImageIcon size={20} />, () => pickImage("new"))}
        {tile("영상", <PlayCircle size={20} />, addVideo)}
      </div>
      <h5>도형</h5>
      <div className="ie-shapes">
        {BOOK_SHAPES.slice(0, 12).map((shape) => <button key={shape.name} type="button" title={shape.label} aria-label={shape.label} onClick={() => addShape(shape.name)}><svg viewBox="0 0 100 100"><path d={shape.path} /></svg></button>)}
        <button type="button" title="선" aria-label="선" onClick={() => addLine(false)}><svg viewBox="0 0 100 100"><path d="M10 50H90" strokeWidth="8" stroke="currentColor" /></svg></button>
        <button type="button" title="화살표" aria-label="화살표" onClick={() => addLine(true)}><svg viewBox="0 0 100 100"><path d="M10 50H80M62 32L84 50L62 68" strokeWidth="8" stroke="currentColor" fill="none" /></svg></button>
      </div>
      <h5>스토리 블록</h5>
      <div className="ie-tiles ie-tiles--2">
        {tile("제목과 본문", <Type size={18} />, () => addStory("heading"))}
        {tile("사진과 설명", <ImageIcon size={18} />, () => addStory("photo"))}
        {tile("숫자 세 개", <ChartColumn size={18} />, () => addStory("numbers"))}
        {tile("단계 세 개", <Layers size={18} />, () => addStory("steps"))}
      </div>
      <h5>표 · 차트</h5>
      <div className="ie-tiles">
        {tile("표", <Table size={20} />, () => addMore("table"))}
        {tile("막대 차트", <ChartColumn size={20} />, () => addMore("bar"))}
        {tile("원 차트", <ChartPie size={20} />, () => addMore("pie"))}
        {tile("아이콘", <Star size={20} />, () => addMore("icon"))}
      </div>
    </div>
  );

  const uploadsPanel = (
    <div className="ie-panel__scroll">
      <button type="button" className="ie-upload" onClick={() => pickImage("new")}><CloudUpload size={18} />이미지 올리기</button>
      <h5>이 인피니티북의 이미지</h5>
      {usedImages.length === 0 ? <p className="ie-hint">아직 올린 이미지가 없습니다.</p> : (
        <div className="ie-imagegrid">{usedImages.map((src) => <button key={src} type="button" aria-label="캔버스에 넣기" style={{ backgroundImage: `url("${src}")` }} onClick={() => addImageFromUrl(src)} />)}</div>
      )}
    </div>
  );

  const stylePanel = (
    <div className="ie-panel__scroll ie-stylepanel">
      <div className="ie-style__preview" style={backdropStyle(canvas)} />
      <div className="ie-style__rows">
        {colorRow("배경색", canvas.background, "#5b6aa8", (background) => setCanvas({ background }, "bg"), "bg")}
        <label className="ie-field"><span>배경 패럴랙스</span><input type="checkbox" className="ie-switch" checked={Boolean(canvas.parallax)} onChange={(event) => setCanvas({ parallax: event.target.checked })} /></label>
        <div className="ie-field"><span>이미지 맞춤</span><CustomSelect aria-label="이미지 맞춤" className="ie-select-sm" options={[{ value: "cover", label: "채우기" }, { value: "contain", label: "맞추기" }]} value={canvas.imageFit === "contain" ? "contain" : "cover"} onValueChange={(imageFit) => setCanvas({ imageFit: imageFit as "cover" | "contain" })} /></div>
        <div className="ie-field"><span>화면 비율</span><CustomSelect aria-label="화면 비율" className="ie-select-sm" options={[{ value: "16:9", label: "16:9" }, { value: "4:3", label: "4:3" }]} value={canvas.ratio ?? "16:9"} onValueChange={(ratio) => setCanvas({ ratio: ratio as "16:9" | "4:3" })} /></div>
      </div>
      <h5>파일 업로드</h5>
      <div className="ie-row">
        <button type="button" className="ie-btn" onClick={() => pickImage("background")}><CloudUpload size={15} />배경 이미지 업로드</button>
        {canvas.backgroundImage && <button type="button" className="ie-link" onClick={() => setCanvas({ backgroundImage: undefined })}>지우기</button>}
      </div>
      <h5>기본 배경</h5>
      <div className="ie-style__grid">
        {BACKGROUNDS.map((image) => <button key={image} type="button" aria-label="배경 선택" className={canvas.backgroundImage === image ? "is-on" : ""} style={{ backgroundImage: image }} onClick={() => setCanvas({ backgroundImage: image })} />)}
      </div>
      <h5>프레임 테두리 색 (전체)</h5>
      <div className="ie-swatches">
        {FRAME_STROKES.map((stroke) => <button key={stroke} type="button" aria-label={stroke} style={{ background: stroke }} onClick={() => commit((open) => ({ ...open, frames: open.frames.map((frame) => (frame.stroke ? { ...frame, stroke } : frame)) }))} />)}
      </div>
    </div>
  );

  const RAIL = [
    { id: "path" as const, label: "경로", icon: <Route /> },
    { id: "insert" as const, label: "요소", icon: <Shapes /> },
    { id: "uploads" as const, label: "업로드", icon: <CloudUpload /> },
    { id: "style" as const, label: "스타일", icon: <Paintbrush /> },
    { id: "ai" as const, label: "AI", icon: <Sparkles /> },
  ];
  const panelTitle = { path: "경로", insert: "요소", uploads: "업로드", style: "배경", ai: "AI 글쓰기" }[panel];

  /** AI article: add it, and with `wrap` put a frame around the photos and the text so it becomes a stop. */
  const insertArticle = (added: BookElement[], wrap: { anchor: Rect; title: string } | null) => {
    const boxes = [...added.filter((e) => e.type !== "line"), ...(wrap ? [wrap.anchor] : [])];
    const pad = 40 / camera.current.zoom;
    const x = Math.min(...boxes.map((b) => b.x)) - pad; const y = Math.min(...boxes.map((b) => b.y)) - pad;
    const r = Math.max(...boxes.map((b) => b.x + b.w)) + pad; const b = Math.max(...boxes.map((box) => box.y + box.h)) + pad;
    const frameAdded: InfinityFrame | null = wrap ? { id: uid(), x, y, w: r - x, h: b - y, shape: "rect", fill: "transparent", title: wrap.title || "AI 글" } : null;
    commit((open) => ({ ...open, elements: [...open.elements, ...added], frames: frameAdded ? [...open.frames, frameAdded] : open.frames }));
    if (frameAdded) { setSelection({ kind: "frame", id: frameAdded.id }); flyToRect(frameAdded); } else setSelection(null);
  };

  return (
    <BookProvider book={book} editing>
      <div className="ie" onPointerDown={(event) => { const target = event.target as HTMLElement; if (!target.closest("[data-menu]")) setMenu(null); if (!target.closest(".ie-item__more")) setItemMenu(null); }}>
        <header className="ie-top">
          <div className="ie-top__left">
            <button type="button" className="ie-exit" aria-label="목록으로 나가기" onClick={() => { void flush().then(() => navigate("/admin/infinity")); }}><FiArrowLeft /><span>목록으로</span></button>
            <span data-menu className="ie-anchor">
              <button type="button" className="ie-top__icon" aria-label="메뉴" onClick={() => toggle("main")}><Menu size={20} /></button>
              {menu === "main" && (
                <div className="ie-pop ie-pop--left ie-menu">
                  <button type="button" onClick={() => { void flush().then(() => navigate("/admin/infinity")); }}>목록으로 돌아가기</button>
                  <hr />
                  <button type="button" onClick={() => { void flush().then(() => navigate("/admin/infinity?new=1")); }}><FilePlus2 size={16} />새 인피니티북<kbd>›</kbd></button>
                  <button type="button" onClick={() => { setMenu(null); void makeCopy(); }}><CopyPlus size={16} />사본 만들기</button>
                  <button type="button" onClick={() => { setMenu(null); void flush(); }}>변경 사항 저장<kbd>⌘S</kbd></button>
                  <hr />
                  <a href={`/book/${book.id}?print=1`} target="_blank" rel="noreferrer" onClick={() => { void flush(); setMenu(null); }}><FileDown size={16} />PDF로 내보내기</a>
                  <hr />
                  <button type="button" disabled={past.current.length === 0} onClick={() => { undo(); setMenu(null); }}><Undo2 size={16} />실행 취소<kbd>⌘Z</kbd></button>
                  <button type="button" disabled={future.current.length === 0} onClick={() => { redo(); setMenu(null); }}><Redo2 size={16} />다시 실행<kbd>⌘Y</kbd></button>
                  <hr />
                  <button type="button" disabled={!selection} onClick={() => { cutItem(selection); setMenu(null); }}>잘라내기<kbd>⌘X</kbd></button>
                  <button type="button" disabled={!selection} onClick={() => { copyItem(selection); setMenu(null); }}>복사<kbd>⌘C</kbd></button>
                  <button type="button" disabled={!clip.current} onClick={() => { pasteItems(); setMenu(null); }}>붙여넣기<kbd>⌘V</kbd></button>
                  <button type="button" onClick={() => { setFindOpen(true); setMenu(null); }}><FiSearch />찾아 바꾸기<kbd>⌘F</kbd></button>
                  <hr />
                  <button type="button" onClick={() => setNavOpen((open) => !open)}><Hand size={16} />탐색<kbd>{navOpen ? "⌄" : "›"}</kbd></button>
                  {navOpen && (
                    <div className="ie-menu__sub">
                      <button type="button" className={tool === "select" ? "is-on" : ""} onClick={() => { setTool("select"); setMenu(null); }}>선택 도구 (끌어서 선택·이동)</button>
                      <button type="button" className={tool === "hand" ? "is-on" : ""} onClick={() => { setTool("hand"); setMenu(null); }}>손 도구 (끌어서 화면 이동)</button>
                    </div>
                  )}
                  <button type="button" onClick={() => { setPathSettingsOpen(true); setMenu(null); }}><Route size={16} />주제 경로 설정</button>
                  <button type="button" onClick={() => { setShowGrid((on) => !on); setMenu(null); }}>{showGrid ? "격자 숨기기" : "격자 보이기"}</button>
                  <hr />
                  <button type="button" onClick={() => { removeAnimations(); setMenu(null); }}>모든 애니메이션 제거</button>
                  <button type="button" onClick={() => { setSpell((on) => !on); setMenu(null); }}>{spell ? "맞춤법 검사 끄기" : "맞춤법 검사 켜기"}</button>
                  <hr />
                  <button type="button" onClick={() => { setHelpOpen(true); setNotesOpen(false); setMenu(null); }}>단축키</button>
                  <button type="button" onClick={() => { setHelpOpen(true); setNotesOpen(false); setMenu(null); }}>도움말</button>
                </div>
              )}
            </span>
            <input className="ie-top__title" aria-label="제목" value={book.title} onChange={(event) => setMeta({ title: event.target.value }, "title")} />
            <span data-menu className="ie-anchor">
              <button type="button" className={`ie-public${book.published ? " is-public" : ""}`} onClick={() => toggle("public")}>{book.published ? "공개" : "비공개"}<FiChevronDown /></button>
              {menu === "public" && (
                <div className="ie-pop ie-pop--left ie-pop--wide">
                  <button type="button" className={book.published ? "is-on" : ""} onClick={() => { setMeta({ published: true }); setMenu(null); }}><span><strong>공개</strong><small>링크가 있으면 누구나 볼 수 있습니다.</small></span></button>
                  <button type="button" className={!book.published ? "is-on" : ""} onClick={() => { setMeta({ published: false }); setMenu(null); }}><span><strong>비공개</strong><small>관리자만 볼 수 있습니다.</small></span></button>
                </div>
              )}
            </span>
            <button type="button" className="ie-top__icon ie-top__icon--sm" aria-label="실행 취소" title="실행 취소" disabled={past.current.length === 0} onClick={undo}><Undo2 size={18} /></button>
            <button type="button" className="ie-top__icon ie-top__icon--sm" aria-label="다시 실행" title="다시 실행" disabled={future.current.length === 0} onClick={redo}><Redo2 size={18} /></button>
            <span className={`ie-top__cloud is-${saveState}`} title={saveText} aria-label={saveText}><FiCloud /></span>
          </div>

          <nav className="ie-tools" aria-label="삽입">
            <button type="button" className={panelOpen && panel === "style" ? "is-on" : ""} onClick={() => openPanel("style")}><Paintbrush size={19} /><span>스타일</span></button>
            <i className="ie-tools__sep" />
            <span data-menu className="ie-anchor">
              <button type="button" className={menu === "text" ? "is-on" : ""} onClick={() => toggle("text")}><Type size={19} /><span>텍스트</span></button>
              {menu === "text" && (
                <div className="ie-pop">
                  <button type="button" className="ie-pop__title" onClick={() => addText("title")}>제목</button>
                  <button type="button" className="ie-pop__subtitle" onClick={() => addText("subtitle")}>부제목</button>
                  <button type="button" onClick={() => addText("body")}>본문</button>
                </div>
              )}
            </span>
            <span data-menu className="ie-anchor">
              <button type="button" className={menu === "media" ? "is-on" : ""} onClick={() => toggle("media")}><ImageIcon size={19} /><span>미디어</span></button>
              {menu === "media" && (
                <div className="ie-pop">
                  <button type="button" onClick={() => pickImage("new")}><ImageIcon size={16} />이미지 업로드</button>
                  <button type="button" onClick={addVideo}><PlayCircle size={16} />영상 링크</button>
                </div>
              )}
            </span>
            <span data-menu className="ie-anchor">
              <button type="button" className={menu === "shape" ? "is-on" : ""} onClick={() => toggle("shape")}><Shapes size={19} /><span>도형</span></button>
              {menu === "shape" && (
                <div className="ie-pop ie-pop--grid">
                  {BOOK_SHAPES.slice(0, 12).map((shape) => (
                    <button key={shape.name} type="button" title={shape.label} aria-label={shape.label} onClick={() => addShape(shape.name)}><svg viewBox="0 0 100 100"><path d={shape.path} /></svg></button>
                  ))}
                  <button type="button" title="선" aria-label="선" onClick={() => addLine(false)}><svg viewBox="0 0 100 100"><path d="M10 50H90" strokeWidth="8" stroke="currentColor" /></svg></button>
                  <button type="button" title="화살표" aria-label="화살표" onClick={() => addLine(true)}><svg viewBox="0 0 100 100"><path d="M10 50H80M62 32L84 50L62 68" strokeWidth="8" stroke="currentColor" fill="none" /></svg></button>
                </div>
              )}
            </span>
            <span data-menu className="ie-anchor">
              <button type="button" className={menu === "story" ? "is-on" : ""} onClick={() => toggle("story")}><Layers size={19} /><span>스토리 블록</span></button>
              {menu === "story" && (
                <div className="ie-pop">
                  <button type="button" onClick={() => addStory("heading")}>제목과 본문</button>
                  <button type="button" onClick={() => addStory("photo")}>사진과 설명</button>
                  <button type="button" onClick={() => addStory("numbers")}>숫자 세 개</button>
                  <button type="button" onClick={() => addStory("steps")}>단계 세 개</button>
                </div>
              )}
            </span>
            <span data-menu className="ie-anchor">
              <button type="button" className={menu === "animation" ? "is-on" : ""} onClick={() => toggle("animation")}><Sparkles size={19} /><span>애니메이션</span></button>
              {menu === "animation" && (
                <div className="ie-pop ie-pop--wide">
                  {selectedElement ? (
                    <>
                      <p className="ie-pop__hint">발표에서 이 요소가 든 프레임에 도착하면 재생됩니다.</p>
                      {ANIMATIONS.map((item) => <button key={item.value} type="button" className={(selectedElement.animation ?? "none") === item.value ? "is-on" : ""} onClick={() => updateElement(selectedElement.id, { animation: item.value } as Partial<BookElement>)}>{item.label}</button>)}
                    </>
                  ) : <p className="ie-pop__hint">캔버스에서 텍스트나 이미지를 먼저 선택하세요.</p>}
                </div>
              )}
            </span>
            <span data-menu className="ie-anchor">
              <button type="button" className={menu === "more" ? "is-on" : ""} onClick={() => toggle("more")}><Ellipsis size={19} /><span>더보기</span></button>
              {menu === "more" && (
                <div className="ie-pop ie-pop--right">
                  <button type="button" onClick={() => addMore("table")}><Table size={16} />표</button>
                  <button type="button" onClick={() => addMore("bar")}><ChartColumn size={16} />막대 차트</button>
                  <button type="button" onClick={() => addMore("pie")}><ChartPie size={16} />원 차트</button>
                  <button type="button" onClick={() => addMore("icon")}><Star size={16} />아이콘</button>
                </div>
              )}
            </span>
          </nav>

          <div className="ie-top__right">
            <span data-menu className="ie-anchor ie-split">
              <a className="ie-present" href={`/book/${book.id}`} target="_blank" rel="noreferrer" onClick={() => void flush()}><FiPlay />발표</a>
              <button type="button" className="ie-present ie-split__caret" aria-label="발표 옵션" onClick={() => toggle("present")}><FiChevronDown /></button>
              {menu === "present" && (
                <div className="ie-pop ie-pop--right">
                  <a href={`/book/${book.id}`} target="_blank" rel="noreferrer" onClick={() => { void flush(); setMenu(null); }}>처음부터 발표</a>
                  <a href={`/book/${book.id}?step=${Math.max(0, step)}`} target="_blank" rel="noreferrer" onClick={() => { void flush(); setMenu(null); }}>현재 프레임부터 발표</a>
                </div>
              )}
            </span>
            <span data-menu className="ie-anchor ie-split">
              <button type="button" className="ie-sharebtn" onClick={() => toggle("share")}><FiShare />공유</button>
              <button type="button" className="ie-sharebtn ie-split__caret" aria-label="공유 옵션" onClick={() => toggle("share")}><FiChevronDown /></button>
              {menu === "share" && (
                <div className="ie-pop ie-pop--right ie-pop--share">
                  <label className="ie-sharerow"><span><strong>링크로 공개</strong><small>{book.published ? "링크가 있으면 누구나 볼 수 있습니다." : "지금은 관리자만 볼 수 있습니다."}</small></span>
                    <input type="checkbox" className="ie-switch" checked={book.published} onChange={(event) => setMeta({ published: event.target.checked })} /></label>
                  <div className="ie-sharelink"><input readOnly value={bookLink(book.id)} onFocus={(event) => event.target.select()} /><button type="button" onClick={() => void navigator.clipboard.writeText(bookLink(book.id))}>복사</button></div>
                </div>
              )}
            </span>
          </div>
        </header>

        <div className="ie-body">
          <nav className="ie-rail" aria-label="도구">
            {RAIL.map((item) => <button key={item.id} type="button" className={panelOpen && panel === item.id ? "is-on" : ""} onClick={() => openPanel(item.id)}>{item.icon}<span>{item.label}</span></button>)}
            <i className="ie-rail__fill" />
          </nav>
          {panelOpen && (
            <aside className={`ie-panel ie-panel--${panel}`}>
              {panel !== "path" && <div className="ie-panel__head"><h3>{panelTitle}</h3><button type="button" aria-label="패널 닫기" onClick={() => setPanelOpen(false)}><FiX /></button></div>}
              {panel === "path" ? pathPanel : panel === "insert" ? insertPanel : panel === "uploads" ? uploadsPanel : panel === "ai"
                ? <InfinityAiPanel canvas={canvas} selectedId={selectedElement?.id ?? null} frame={selectedFrame ?? contextFrame} onInsert={insertArticle} />
                : stylePanel}
            </aside>
          )}

          <main ref={stage} className={`ie-stage${tool === "hand" ? " is-hand" : ""}`} style={{ backgroundColor: canvas.background }} onPointerDown={onStagePointerDown} onDoubleClick={onStageDoubleClick}>
            <button type="button" className="ie-collapse" aria-label={panelOpen ? "패널 접기" : "패널 펼치기"} onPointerDown={(event) => event.stopPropagation()} onClick={() => setPanelOpen((open) => !open)}>{panelOpen ? <FiChevronLeft /> : <FiChevronRight />}</button>
            <Backdrop canvas={canvas} backdropRef={backdrop} />
            {showGrid && <div className="ie-dots" />}
            <InfinityWorld layerRef={layer} canvas={canvas} still renderElement={renderElement} style={{ transform: placeLayer(camera.current), ["--inv" as string]: 1 / camera.current.zoom }}>
              <div className="ie-bounds" style={worldBox(contextFrame ?? overview)} />
              {canvas.frames.filter(invisible).map((frame) => <div key={frame.id} className="ie-ghost" style={worldBox(frame)} />)}
              {editing && (
                <textarea className="ie-textedit" autoFocus spellCheck={spell} value={editing.text} style={{ ...worldBox(editing), ...textStyle(editing) }}
                  onChange={(event) => updateElement(editing.id, { text: event.target.value } as Partial<BookElement>, `text:${editing.id}`)} onKeyDown={(event) => { if (event.key === "Escape") setEditingText(null); event.stopPropagation(); }} />
              )}
              {selectedBox && !editing && (
                <div className={`ie-selection${selectedFrame?.shape === "circle" && !invisible(selectedFrame) ? " ie-selection--circle" : ""}`} style={worldBox(selectedBox)}>
                  {(["nw", "ne", "sw", "se"] as Corner[]).map((corner) => <i key={corner} className={`ie-handle ie-handle--${corner}`} data-corner={corner} />)}
                </div>
              )}
            </InfinityWorld>

            <div className="ie-navbar" onPointerDown={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}>
              <button type="button" aria-label="손 도구" title="손 도구 (캔버스 이동)" className={tool === "hand" ? "is-on" : ""} onClick={() => setTool("hand")}><Hand size={17} /></button>
              <button type="button" aria-label="선택 도구" title="선택 도구" className={tool === "select" ? "is-on" : ""} onClick={() => setTool("select")}><MousePointer2 size={17} /></button>
              <i />
              <button type="button" aria-label="이전" onClick={() => goStep(step - 1)} disabled={step < 0}><FiChevronLeft /></button>
              <button type="button" aria-label="다음" onClick={() => goStep(step + 1)} disabled={step >= steps.length - 1}><FiChevronRight /></button>
              <i />
              <button type="button" aria-label="개요" title="개요" onClick={goOverview}><FiHome /></button>
              {contextFrame && <button type="button" aria-label="상위로" title="상위로" onClick={goUp}><CornerLeftUp size={17} /></button>}
              <i />
              <button type="button" aria-label="축소" onClick={() => zoomBy(1 / 1.25)}><FiMinus /></button>
              <span>{zoomLabel}%</span>
              <button type="button" aria-label="확대" onClick={() => zoomBy(1.25)}><FiPlus /></button>
            </div>

            <div className="ie-corner" onPointerDown={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}>
              <button type="button" aria-label="노트" title="발표자 노트" className={notesOpen ? "is-on" : ""} onClick={() => { setNotesOpen((open) => !open); setHelpOpen(false); }}><NotebookPen size={17} /></button>
              <button type="button" className={helpOpen ? "is-on" : ""} onClick={() => { setHelpOpen((open) => !open); setNotesOpen(false); }}><FiHelpCircle />도움말</button>
            </div>
            {notesOpen && (
              <div className="ie-notes" onPointerDown={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}>
                <header><strong>노트</strong><span>{notesFrame ? notesFrame.title || "프레임" : "개요"}</span><button type="button" aria-label="닫기" onClick={() => setNotesOpen(false)}><FiX /></button></header>
                {notesFrame
                  ? <textarea placeholder="이 프레임에서 할 말을 적어 두세요." value={notesFrame.notes ?? ""} onChange={(event) => updateFrame(notesFrame.id, { notes: event.target.value }, `notes:${notesFrame.id}`)} />
                  : <p>프레임을 선택하면 그 프레임의 노트를 적을 수 있습니다.</p>}
              </div>
            )}
            {helpOpen && (
              <div className="ie-help" onPointerDown={(event) => event.stopPropagation()}>
                <header><strong>도움말</strong><button type="button" aria-label="닫기" onClick={() => setHelpOpen(false)}><FiX /></button></header>
                <dl>
                  <dt>이동</dt><dd>빈 곳 끌기, 스크롤</dd>
                  <dt>확대·축소</dt><dd>Ctrl/Cmd + 스크롤, 핀치</dd>
                  <dt>프레임 안으로</dt><dd>프레임 더블클릭</dd>
                  <dt>텍스트 고치기</dt><dd>텍스트 더블클릭</dd>
                  <dt>경로 이동</dt><dd>← →</dd>
                  <dt>복제 / 삭제</dt><dd>Cmd+D / Delete</dd>
                  <dt>되돌리기</dt><dd>Cmd+Z, Cmd+Shift+Z</dd>
                </dl>
              </div>
            )}
            {notice && <div className="ie-notice" role="status">{notice}</div>}
            {findOpen && (
              <div className="ie-find" onPointerDown={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}>
                <header><strong>찾아 바꾸기</strong><button type="button" aria-label="닫기" onClick={() => setFindOpen(false)}><FiX /></button></header>
                <input className="ie-input" autoFocus placeholder="찾을 글자" value={findText} onChange={(event) => { setFindText(event.target.value); findAt.current = 0; }} onKeyDown={(event) => { if (event.key === "Enter") findNext(); if (event.key === "Escape") setFindOpen(false); }} />
                <input className="ie-input" placeholder="바꿀 글자" value={replaceText} onChange={(event) => setReplaceText(event.target.value)} />
                <p className="ie-hint">{findText ? `${matches.length + frameMatches.length}곳에서 찾았습니다.` : "텍스트와 프레임 이름에서 찾습니다."}</p>
                <div className="ie-row">
                  <button type="button" className="ie-btn" disabled={!findText} onClick={findNext}>다음 찾기</button>
                  <button type="button" className="ie-btn" disabled={!findText || matches.length + frameMatches.length === 0} onClick={replaceAll}>모두 바꾸기</button>
                </div>
              </div>
            )}
            {pathSettingsOpen && (
              <div className="ie-find" onPointerDown={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}>
                <header><strong>주제 경로 설정</strong><button type="button" aria-label="닫기" onClick={() => setPathSettingsOpen(false)}><FiX /></button></header>
                <label className="ie-choice"><input type="radio" name="ie-path" checked={canvas.returnToTopic !== false} onChange={() => setCanvas({ returnToTopic: true })} /><span><strong>주제로 돌아오기</strong><small>하위 주제를 모두 본 뒤 주제 전체 화면으로 돌아왔다가 다음 주제로 갑니다.</small></span></label>
                <label className="ie-choice"><input type="radio" name="ie-path" checked={canvas.returnToTopic === false} onChange={() => setCanvas({ returnToTopic: false })} /><span><strong>바로 다음 주제로</strong><small>마지막 하위 주제에서 다음 주제로 곧장 넘어갑니다.</small></span></label>
              </div>
            )}
          </main>

          <aside className="ie-right" aria-label="속성">{inspector}</aside>
        </div>
        <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void onImage(file); }} />
      </div>
    </BookProvider>
  );
}
