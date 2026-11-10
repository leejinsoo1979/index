/**
 * 인피니티북: one endless canvas instead of pages. Frames (circles or rectangles) are the stops of the
 * presentation, shown in their array order; the viewer flies the camera from one to the next. A book is
 * stored like any flipbook (`kind: "infinite"`, `canvas`), so saving, uploads and links are shared.
 *
 * Canvas positions are world pixels. The world is drawn inside a 1000 px container, so text sizes in page
 * units (`0.1cqw`) come out as world pixels too.
 */
import { createFlipbook, uid, type BookElement, type Flipbook, type TextElement } from "./flipbooks";

export type InfinityCanvas = NonNullable<Flipbook["canvas"]>;
export type InfinityFrame = InfinityCanvas["frames"][number];
export type Rect = { x: number; y: number; w: number; h: number };
/** The world point at the centre of the screen, and how many screen pixels one world pixel takes. */
export type Camera = { x: number; y: number; zoom: number };

export const FRAME_FILLS = ["#e9e2d6", "#dfe7df", "#dde4ee", "#efe0d8", "#e6e1ef", "#ffffff", "#2b2d33"];
/** Ring colours for outlined frames. */
export const FRAME_STROKES = ["#4a3f8f", "#1d2026", "#ffffff", "#2f6fd0", "#c8553d", "#2e7d5b"];
export const ringFrame = { fill: "transparent", stroke: FRAME_STROKES[0] };

const heading = (text: string, x: number, y: number, w: number, h: number, size: number, color = "#1c1d21"): TextElement => ({
  id: uid(), type: "text", text, x, y, w, h, size, color, bold: true, align: "center", font: "'Noto Sans KR'", lineHeight: 1.2, actions: [],
});

export function createInfinityBook(title = "제목 없는 인피니티북", from?: InfinityCanvas): Flipbook {
  const book = createFlipbook(title);
  if (from) return { ...book, kind: "infinite", pages: [], background: "#1d2026", canvas: from };
  const ring = (x: number, y: number, size: number): InfinityFrame => ({ id: uid(), x, y, w: size, h: size, shape: "circle", ...ringFrame, title: "원으로 확대" });
  const frames = [ring(-80, -330, 300), ring(560, -300, 250), ring(700, 120, 400), ring(-310, 220, 390), ring(180, -120, 610)];
  const label = (frame: InfinityFrame, size: number): TextElement[] => [
    { ...heading("더블클릭해 입력", frame.x + frame.w * 0.15, frame.y + frame.h * 0.3, frame.w * 0.7, size * 1.4, size, "#ffffff"), font: "'Noto Serif KR'", align: "left" },
    { ...heading("더블클릭해 텍스트 입력", frame.x + frame.w * 0.15, frame.y + frame.h * 0.3 + size * 1.6, frame.w * 0.7, size * 0.8, size * 0.45, "#ffffff"), bold: false, align: "left" },
  ];
  const elements: BookElement[] = [
    { ...heading("더블클릭해 제목 입력", -1200, -60, 1050, 120, 90, "#ffffff"), font: "'Noto Serif KR'", align: "left" },
    ...frames.flatMap((frame) => label(frame, frame.w / 15)),
  ];
  return { ...book, kind: "infinite", pages: [], background: "#1d2026", canvas: { background: "#5b6aa8", backgroundImage: "linear-gradient(180deg, #7fa3cf 0%, #5d6aa6 60%, #4c4787 100%)", parallax: true, ratio: "16:9", frames: [frames[4], frames[0], frames[1], frames[2], frames[3]], elements } };
}

export const isInfinityBook = (book: Flipbook) => book.kind === "infinite";

const union = (rects: Rect[]): Rect | null => {
  if (rects.length === 0) return null;
  const left = Math.min(...rects.map((r) => r.x));
  const top = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.w));
  const bottom = Math.max(...rects.map((r) => r.y + r.h));
  return { x: left, y: top, w: right - left, h: bottom - top };
};

/** The box a rotated element really covers. */
const turned = (box: Rect & { rotation?: number }): Rect => {
  if (!box.rotation) return box;
  const a = (box.rotation * Math.PI) / 180;
  const w = Math.abs(box.w * Math.cos(a)) + Math.abs(box.h * Math.sin(a));
  const h = Math.abs(box.w * Math.sin(a)) + Math.abs(box.h * Math.cos(a));
  return { x: box.x + box.w / 2 - w / 2, y: box.y + box.h / 2 - h / 2, w, h };
};

/** Everything on the canvas, for the overview. */
export function canvasBounds(canvas: InfinityCanvas): Rect {
  return union([...canvas.frames, ...canvas.elements.map(turned)]) ?? { x: -500, y: -300, w: 1000, h: 600 };
}

/** The camera that shows a rectangle whole, with a margin. */
export function fitCamera(rect: Rect, viewWidth: number, viewHeight: number, margin = 0.86): Camera {
  const zoom = Math.min((viewWidth * margin) / Math.max(rect.w, 1), (viewHeight * margin) / Math.max(rect.h, 1));
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2, zoom };
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * A camera move that pulls back while it travels, so the jump between two close-ups reads as one
 * continuous flight across the canvas rather than a slide.
 */
export function flightAt(from: Camera, to: Camera, progress: number, viewWidth: number, viewHeight: number): Camera {
  const t = ease(progress);
  const travel = Math.hypot(to.x - from.x, to.y - from.y);
  // How far out both ends must be to see the whole way at once.
  const overview = Math.min(viewWidth, viewHeight) / Math.max(travel * 1.3, 1);
  const lowest = Math.min(from.zoom, to.zoom);
  const dip = Math.max(0, Math.log(lowest) - Math.log(Math.min(lowest, overview)));
  const logZoom = Math.log(from.zoom) + (Math.log(to.zoom) - Math.log(from.zoom)) * t - dip * Math.sin(Math.PI * t);
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, zoom: Math.exp(logZoom) };
}

export const worldTransform = (camera: Camera, viewWidth: number, viewHeight: number) =>
  `translate(${viewWidth / 2 - camera.x * camera.zoom}px, ${viewHeight / 2 - camera.y * camera.zoom}px) scale(${camera.zoom})`;

/** The frame a world point falls in, smallest first so a frame inside another wins. */
export function frameAt(canvas: InfinityCanvas, x: number, y: number): InfinityFrame | null {
  const inside = canvas.frames.filter((frame) => {
    if (frame.shape === "circle") {
      const rx = frame.w / 2;
      const ry = frame.h / 2;
      return ((x - frame.x - rx) / rx) ** 2 + ((y - frame.y - ry) / ry) ** 2 <= 1;
    }
    return x >= frame.x && x <= frame.x + frame.w && y >= frame.y && y <= frame.y + frame.h;
  });
  return inside.sort((a, b) => a.w * a.h - b.w * b.h)[0] ?? null;
}

/** Whether a box lies inside a frame, so moving the frame carries it along. */
export const containedIn = (box: Rect, frame: Rect) =>
  box.x >= frame.x - 1 && box.y >= frame.y - 1 && box.x + box.w <= frame.x + frame.w + 1 && box.y + box.h <= frame.y + frame.h + 1 && box.w * box.h < frame.w * frame.h;

/* ---------- structure: topics, subtopics and the presentation path ---------- */

/** The smallest frame that holds a box (its topic), or null on the open canvas. */
export function parentOf(canvas: InfinityCanvas, box: Rect & { id?: string }): InfinityFrame | null {
  const holders = canvas.frames.filter((frame) => frame.id !== box.id && containedIn(box, frame));
  return holders.sort((a, b) => a.w * a.h - b.w * b.h)[0] ?? null;
}

/** Frames directly inside a frame (or on the open canvas when `frame` is null), in path order. */
export const childrenOf = (canvas: InfinityCanvas, frame: InfinityFrame | null) =>
  canvas.frames.filter((item) => item.id !== frame?.id && (parentOf(canvas, item)?.id ?? null) === (frame?.id ?? null));

/** One stop of the presentation; `back` is the return to a topic after its subtopics. */
export type PathStep = { frame: InfinityFrame; back?: boolean };

/** Topics in order, each followed by everything inside it, then a return to the topic. */
export function pathSteps(canvas: InfinityCanvas): PathStep[] {
  const walk = (frame: InfinityFrame): PathStep[] => [{ frame }, ...childrenOf(canvas, frame).flatMap(walk)];
  return childrenOf(canvas, null).flatMap((topic) => {
    const inside = walk(topic);
    return inside.length > 1 && canvas.returnToTopic !== false ? [...inside, { frame: topic, back: true }] : inside;
  });
}

/** The 1-based step numbers a frame covers in the path, e.g. "1-6" for a topic with its subtopics. */
export function stepRange(steps: PathStep[], canvas: InfinityCanvas, frame: InfinityFrame): string {
  const inside = (item: InfinityFrame) => item.id === frame.id || containedIn(item, frame);
  const numbers = steps.flatMap((step, index) => (inside(step.frame) ? [index + 1] : []));
  if (numbers.length === 0) return "";
  const first = numbers[0];
  const last = numbers[numbers.length - 1];
  void canvas;
  return first === last ? String(first) : `${first}-${last}`;
}

/** The frame an element belongs to, for entrance animations that play on arriving there. */
export const ownerFrame = (canvas: InfinityCanvas, element: BookElement) => parentOf(canvas, element);

/** The overview: everything on the canvas, widened to the screen ratio. */
export function overviewRect(canvas: InfinityCanvas): Rect {
  const bounds = canvasBounds(canvas);
  const ratio = canvas.ratio === "4:3" ? 4 / 3 : 16 / 9;
  const pad = 0.08;
  let w = bounds.w * (1 + pad * 2);
  let h = bounds.h * (1 + pad * 2);
  if (w / h > ratio) h = w / ratio; else w = h * ratio;
  return { x: bounds.x + bounds.w / 2 - w / 2, y: bounds.y + bounds.h / 2 - h / 2, w, h };
}
