/**
 * 인테리어쇼 포트폴리오 인피니티북: one book per site. Every stop is a scene — a photograph with its own
 * caption block (number, space name, a rule, a symbol, and a sentence typed out when the camera arrives) —
 * and each site arranges its scenes differently. Photos are the selection Codex prepared for the flipbooks
 * (public/portfolios/interior-show/manifest.json); captions describe what is in each photograph.
 */
import { createFlipbook, uid, type BookElement, type Flipbook, type ImageElement, type LineElement, type ShapeElement, type TextElement } from "../lib/flipbooks";
import type { InfinityCanvas, InfinityFrame, Rect } from "../lib/infinity";

export type ShowPhoto = { src: string; w: number; h: number; file: string };
type Cap = [file: string, en: string, ko: string, line: string];
type Scene = { photo: ShowPhoto; en: string; ko: string; line: string };
type Theme = { bg: string; image?: string; ink: string; muted: string; accent: string; plate: string; plateInk: string; plateMuted: string };
type Fonts = { display: string; serif: string; body: string; italic?: boolean };
type Layout = (site: ShowSite, cover: ShowPhoto, scenes: Scene[], spare: ShowPhoto[]) => InfinityCanvas;
export type ShowSite = { slug: string; name: string; latin: string; area: string; kind: "RESIDENCE" | "OFFICE"; fonts: Fonts; theme: Theme; layout: Layout; captions: Cap[]; materials: [string, string][] };

/* ---------- building blocks (world pixels) ---------- */
let F: Fonts = { display: "'Playfair Display'", serif: "'Noto Serif KR'", body: "'Noto Sans KR'" };
const LABEL = "'Montserrat'";
const two = (n: number) => String(n).padStart(2, "0");

/** How many lines a text takes at this width, counting wrapping (Hangul is about one em per letter). */
const lineCount = (value: string, w: number, size: number) =>
  value.split("\n").reduce((sum, part) => sum + Math.max(1, Math.ceil((Array.from(part).length * size * 0.92) / Math.max(w, 1))), 0);
const text = (value: string, x: number, y: number, w: number, size: number, color: string, extra: Partial<TextElement> = {}): TextElement => ({
  id: uid(), type: "text", text: value, x, y, w, h: size * (extra.lineHeight ?? 1.3) * lineCount(value, w, size) + size * 0.3, size, color, bold: false, align: "left",
  font: F.body, lineHeight: 1.3, actions: [], ...extra,
});
const label = (value: string, x: number, y: number, w: number, size: number, color: string, extra: Partial<TextElement> = {}) =>
  text(value, x, y, w, size, color, { font: LABEL, bold: true, spacing: 240, textCase: "upper", ...extra });
const display = (value: string, x: number, y: number, w: number, size: number, color: string, extra: Partial<TextElement> = {}) =>
  text(value, x, y, w, size, color, { font: F.display, italic: F.italic, lineHeight: 1.02, ...extra });
const serif = (value: string, x: number, y: number, w: number, size: number, color: string, extra: Partial<TextElement> = {}) =>
  text(value, x, y, w, size, color, { font: F.serif, bold: true, ...extra });
const photo = (p: ShowPhoto, x: number, y: number, w: number, h: number, extra: Partial<ImageElement> = {}): ImageElement =>
  ({ id: uid(), type: "image", src: p.src, fit: "cover", x, y, w, h, actions: [], ...extra });
const shape = (x: number, y: number, w: number, h: number, fill: string, kind = "rect", extra: Partial<ShapeElement> = {}): ShapeElement =>
  ({ id: uid(), type: "shape", shape: kind, fill, x, y, w, h, actions: [], ...extra });
const line = (x1: number, y1: number, x2: number, y2: number, color: string, thickness: number, extra: Partial<LineElement> = {}): LineElement => {
  const length = Math.hypot(x2 - x1, y2 - y1);
  return { id: uid(), type: "line", color, thickness, style: "solid", arrow: false, x: (x1 + x2) / 2 - length / 2, y: (y1 + y2) / 2 - thickness / 2, w: length, h: thickness, rotation: (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI, actions: [], ...extra };
};
const frame = (r: Rect, title: string, shapeKind: "circle" | "rect" = "rect", stroke?: string): InfinityFrame =>
  ({ id: uid(), x: r.x, y: r.y, w: r.w, h: r.h, shape: shapeKind, fill: "transparent", stroke, title });
/** Written out letter by letter, with key clicks, when its frame is reached. */
const typed = <T extends TextElement>(element: T, delay = 0.35): T => ({ ...element, animation: "type", delay });
const fade = <T extends BookElement>(element: T, delay = 0): T => ({ ...element, animation: "fade", delay, duration: 0.9 });
/** The box around a set of elements, padded, for the scene's frame. */
const around = (elements: BookElement[], pad: number): Rect => {
  const boxes = elements.filter((e) => e.type !== "line");
  const x = Math.min(...boxes.map((e) => e.x)) - pad; const y = Math.min(...boxes.map((e) => e.y)) - pad;
  const r = Math.max(...boxes.map((e) => e.x + e.w)) + pad; const b = Math.max(...boxes.map((e) => e.y + e.h)) + pad;
  return { x, y, w: r - x, h: b - y };
};
const canvasOf = (t: Theme, frames: InfinityFrame[], elements: BookElement[]): InfinityCanvas =>
  ({ background: t.bg, backgroundImage: t.image, parallax: false, ratio: "16:9", frames, elements });

/* ---------- captions and scenes ---------- */

/** Number, space name, a short rule, the Korean heading, then the sentence that types out. */
function caption(t: Theme, s: Scene, n: number, x: number, y: number, w: number, size: number, opts: { align?: TextElement["align"]; plate?: boolean; symbol?: boolean } = {}): BookElement[] {
  const align = opts.align ?? "left";
  const ink = opts.plate ? t.plateInk : t.ink; const muted = opts.plate ? t.plateMuted : t.muted;
  const ruleX = align === "right" ? x + w - size * 2.2 : align === "center" ? x + w / 2 - size * 1.1 : x;
  return [
    label(`${two(n)}  —  ${s.en}`, x, y, w, size * 0.42, t.accent, { align }),
    serif(s.ko, x, y + size * 0.85, w, size, ink, { align }),
    line(ruleX, y + size * 2.45, ruleX + size * 2.2, y + size * 2.45, t.accent, Math.max(2, size * 0.05)),
    typed(text(s.line, x, y + size * 2.85, w, size * 0.5, muted, { align, lineHeight: 1.65 })),
    ...(opts.symbol ? [text("✦", align === "right" ? x + w - size * 0.6 : x, y - size * 1.1, size, size * 0.5, t.accent, { align })] : []),
  ];
}
const captionHeight = (s: Scene, w: number, size: number) => size * 2.85 + lineCount(s.line, w, size * 0.5) * size * 0.5 * 1.65 + size * 0.4;

/** A big numeral, faint, behind a caption. */
const numeral = (t: Theme, n: number, x: number, y: number, w: number, size: number, align: TextElement["align"] = "left") =>
  display(two(n), x, y, w, size, t.accent, { align, opacity: 0.16 });

type Built = { frame: InfinityFrame; elements: BookElement[] };

/** Photo on one side, caption column on the other. */
function sideScene(t: Theme, s: Scene, n: number, box: Rect, flip = false): Built {
  const pw = box.w * 0.6;
  const px = flip ? box.x + box.w - pw : box.x;
  const cx = flip ? box.x : box.x + pw + box.w * 0.05;
  const cw = box.w * 0.35;
  const size = Math.min(box.h * 0.085, cw * 0.17);
  const elements: BookElement[] = [
    photo(s.photo, px, box.y, pw, box.h),
    numeral(t, n, cx, box.y - size * 0.4, cw, size * 3.4, flip ? "right" : "left"),
    ...caption(t, s, n, cx, box.y + box.h * 0.4, cw, size, { align: flip ? "right" : "left", symbol: true }),
  ];
  return { frame: frame(around(elements, size), `${two(n)} ${s.ko}`), elements };
}

/** Photo on top, a gallery-style caption beneath. */
function stackScene(t: Theme, s: Scene, n: number, box: Rect, mat = false): Built {
  const ph = box.h * 0.7;
  const size = Math.min(box.w * 0.06, box.h * 0.055);
  const elements: BookElement[] = [
    ...(mat ? [shape(box.x - size * 0.5, box.y - size * 0.5, box.w + size, ph + size, "#ffffff", "rect", { shadow: true })] : []),
    photo(s.photo, box.x, box.y, box.w, ph),
    numeral(t, n, box.x + box.w * 0.6, box.y + ph + size * 0.2, box.w * 0.4, size * 3, "right"),
    ...caption(t, s, n, box.x, box.y + ph + size * 1.1, box.w * 0.82, size),
  ];
  return { frame: frame(around(elements, size), `${two(n)} ${s.ko}`), elements };
}

/** A big photo with a smaller detail photo overlapping its corner; caption beside. */
function insetScene(t: Theme, s: Scene, detail: ShowPhoto, n: number, box: Rect): Built {
  const mw = box.w * 0.6; const mh = box.h * 0.84;
  const dw = box.w * 0.24; const dh = box.h * 0.46;
  const size = Math.min(box.w * 0.042, box.h * 0.08);
  const elements: BookElement[] = [
    photo(s.photo, box.x, box.y, mw, mh),
    shape(box.x + mw - dw * 0.85 - size * 0.4, box.y + box.h - dh - size * 0.4, dw + size * 0.8, dh + size * 0.8, "#ffffff"),
    photo(detail, box.x + mw - dw * 0.85, box.y + box.h - dh, dw, dh),
    numeral(t, n, box.x + mw + box.w * 0.08, box.y - size, box.w * 0.3, size * 4.2),
    ...caption(t, s, n, box.x + mw + box.w * 0.1, box.y + box.h * 0.34, box.w * 0.29, size, { symbol: true }),
  ];
  return { frame: frame(around(elements, size), `${two(n)} ${s.ko}`), elements };
}

/** A round photo with its caption on the outer side. */
function circleScene(t: Theme, s: Scene, n: number, cx: number, cy: number, r: number, side: "left" | "right", ring?: string): Built {
  const size = r * 0.2; const cw = r * 2.1;
  const tx = side === "right" ? cx + r * 1.22 : cx - r * 1.22 - cw;
  const elements: BookElement[] = [
    ...(ring ? [shape(cx - r - size * 0.35, cy - r - size * 0.35, (r + size * 0.35) * 2, (r + size * 0.35) * 2, ring, "circle")] : []),
    photo(s.photo, cx - r, cy - r, r * 2, r * 2, { mask: "circle" }),
    numeral(t, n, tx, cy - r * 1.05, cw, size * 3, side === "right" ? "left" : "right"),
    ...caption(t, s, n, tx, cy - r * 0.25, cw, size, { align: side === "right" ? "left" : "right" }),
  ];
  return { frame: frame(around(elements, size), `${two(n)} ${s.ko}`), elements };
}

/** The site title block: label, display name, Korean name, a rule and an intro line. */
function titleBlock(t: Theme, site: ShowSite, x: number, y: number, w: number, size: number, align: TextElement["align"] = "left", intro?: string): BookElement[] {
  const ruleX = align === "center" ? x + w / 2 - size * 1.2 : align === "right" ? x + w - size * 2.4 : x;
  return [
    label(`Interior Show  ·  ${site.kind}  ·  ${site.area}`, x, y, w, size * 0.18, t.accent, { align }),
    display(site.latin, x - size * 0.04, y + size * 0.35, w, size, t.ink, { align }),
    serif(site.name, x, y + size * 1.55, w, size * 0.3, t.ink, { align, bold: false }),
    line(ruleX, y + size * 2.1, ruleX + size * 2.4, y + size * 2.1, t.accent, Math.max(3, size * 0.025)),
    ...(intro ? [typed(text(intro, x, y + size * 2.35, w, size * 0.17, t.muted, { align, lineHeight: 1.7, font: F.serif }), 0.6)] : []),
  ];
}

/** 시공 항목 as two columns, the values typed out. */
function materialsBlock(t: Theme, site: ShowSite, x: number, y: number, w: number, size: number): BookElement[] {
  const rows = site.materials.slice(0, 12);
  if (rows.length === 0) return [];
  return [
    label("Materials", x, y, w, size * 0.75, t.accent),
    line(x, y + size * 1.5, x + w, y + size * 1.5, t.muted, 2, { opacity: 0.5 }),
    fade(text(rows.map(([k]) => k).join("\n"), x, y + size * 2.1, w * 0.36, size, t.muted, { lineHeight: 1.75 })),
    typed(text(rows.map(([, v]) => v).join("\n"), x + w * 0.38, y + size * 2.1, w * 0.62, size, t.ink, { lineHeight: 1.75 }), 0.4),
  ];
}

/** A frame around the given elements, so the title or the materials become a stop of their own. */
const pack = (elements: BookElement[], title: string, pad = 60): InfinityFrame[] => (elements.length ? [frame(around(elements, pad), title)] : []);

/* ---------- 13 layouts ---------- */

/** 대장동: the cover in a gold ring at the centre, scenes orbiting it with their captions outside. */
const orbit: Layout = (site, cover, scenes) => {
  const t = site.theme;
  const hero = frame({ x: -560, y: -560, w: 1120, h: 1120 }, "메인", "circle", t.accent);
  const built = scenes.slice(0, 8).map((s, i) => {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2 + Math.PI / 8;
    const x = Math.cos(a) * 1500; const y = Math.sin(a) * 1050;
    return { b: circleScene(t, s, i + 1, x, y, 210, Math.cos(a) >= 0 ? "right" : "left", "rgba(200,169,126,.55)"), x, y };
  });
  const introEls = titleBlock(t, site, -3500, -1500, 1300, 210, "left", `${site.area}, 돌과 금속과 어둠으로\n짜인 집을 여덟 장면으로 봅니다.`);
  const matEls = materialsBlock(t, site, 2450, 900, 1000, 26);
  return canvasOf(t, [...pack(introEls, "소개"), hero, ...built.map((x) => x.b.frame), ...pack(matEls, "자재")], [
    ...introEls,
    photo(cover, hero.x + 26, hero.y + 26, hero.w - 52, hero.h - 52, { mask: "circle" }),
    ...built.map(({ x, y }) => line(x * 0.4, y * 0.55, x * 0.8, y * 0.8, "rgba(200,169,126,.4)", 3)),
    ...built.flatMap((x) => x.b.elements),
    ...matEls,
  ]);
};

/** 청담: a salon wall — matted photographs with museum captions. */
const salon: Layout = (site, cover, scenes) => {
  const t = site.theme;
  // Two rows of equal height; the widths vary like frames hung on one line.
  const gap = 110; const boxes: Rect[] = []; const H = 1120;
  let x = -2100;
  [1000, 760, 1000, 760].forEach((w) => { boxes.push({ x, y: -1300, w, h: H }); x += w + gap; });
  x = -2100 + 380;
  [760, 1000, 760].forEach((w) => { boxes.push({ x, y: 340, w, h: H }); x += w + gap; });
  const built = scenes.slice(0, boxes.length).map((s, i) => stackScene(t, s, i + 1, boxes[i], true));
  const introEls = [...titleBlock(t, site, -3800, -1250, 1300, 190, "left", "대리석과 물결 천장, 검은 가구가\n한 벽에 걸린 작품처럼 놓인 집."), shape(-3820, -320, 1190, 900, "#ffffff", "rect", { shadow: true }), photo(cover, -3800, -300, 1150, 860)];
  const matEls = materialsBlock(t, site, 2650, -1250, 1050, 26);
  return canvasOf(t, [...pack(introEls, "소개"), ...built.map((b) => b.frame), ...pack(matEls, "자재")], [...introEls, ...built.flatMap((b) => b.elements), ...matEls]);
};

/** 잠실: two long rows of scenes, photo and caption alternating sides, like a contact strip. */
const strip: Layout = (site, cover, scenes) => {
  const t = site.theme;
  const built = scenes.slice(0, 8).map((s, i) => {
    const row = i < 4 ? 0 : 1; const col = i % 4;
    return sideScene(t, s, i + 1, { x: -3300 + col * 1720 + row * 860, y: row === 0 ? -900 : 60, w: 1520, h: 640 }, col % 2 === 1);
  });
  const introEls = [photo(cover, -3300, 1050, 1500, 900), ...titleBlock(t, site, -1600, 1130, 2200, 230, "left", "따뜻한 베이지와 우드, 석재로 맞춘 50평.\n방마다 한 컷씩, 여덟 장면입니다.")];
  const matEls = materialsBlock(t, site, 1700, 1130, 1500, 26);
  return canvasOf(t, [...pack(introEls, "소개"), ...built.map((b) => b.frame), ...pack(matEls, "자재")], [
    line(-3300, -1050, 4100, -1050, t.muted, 2, { opacity: 0.35 }), line(-3300, 900, 4100, 900, t.muted, 2, { opacity: 0.35 }),
    ...introEls, ...built.flatMap((b) => b.elements), ...matEls,
  ]);
};

/** 용인: one great photograph with small scenes set into it to zoom into. */
const hidden: Layout = (site, cover, scenes) => {
  const t = site.theme;
  const W = 4400; const H = W / 1.6; const X = -W / 2; const Y = -H / 2;
  const big = frame({ x: X, y: Y, w: W, h: H }, "전경");
  const spots = [[0.04, 0.05], [0.5, 0.05], [0.68, 0.38], [0.5, 0.73], [0.05, 0.75]] as const;
  const built = scenes.slice(0, 5).map((s, i) => {
    const bx = X + W * spots[i][0]; const by = Y + H * spots[i][1];
    const pw = 640; const ph = 440; const size = 34;
    const els: BookElement[] = [photo(s.photo, bx, by, pw, ph), shape(bx + pw, by, 560, ph, t.plate), ...caption(t, s, i + 1, bx + pw + 44, by + 44, 470, size, { plate: true })];
    return { frame: frame(around(els, 24), `${two(i + 1)} ${s.ko}`), elements: els };
  });
  const card: BookElement[] = [shape(X, Y + H * 0.36, W * 0.42, H * 0.32, "rgba(18,22,20,.62)"), ...titleBlock({ ...t, ink: "#ffffff" }, site, X + 150, Y + H * 0.36 + 90, W * 0.38, 170, "left", "넓은 창과 석재, 패브릭이 만든 68평.\n사진 속으로 들어가 봅니다.")];
  const matEls = materialsBlock(t, site, X + W + 220, Y + 220, 1100, 28);
  return canvasOf(t, [big, ...built.map((b) => b.frame), ...pack(matEls, "자재", 70)], [photo(cover, X, Y, W, H, { brightness: 94 }), ...card, ...built.flatMap((b) => b.elements), ...matEls]);
};

/** 성북: white magazine spreads with soft shadows; a title spread then five feature spreads. */
const magazine: Layout = (site, cover, scenes, spare) => {
  const t = site.theme;
  const cells: Rect[] = Array.from({ length: 6 }, (_, i) => ({ x: -2800 + (i % 3) * 1900, y: i < 3 ? -1200 : 100, w: 1750, h: 1150 }));
  const pads = cells.map((c) => shape(c.x, c.y, c.w, c.h, "#ffffff", "rect", { shadow: true }));
  const titleEls = [photo(cover, cells[0].x + 90, cells[0].y + 90, 880, cells[0].h - 180), ...titleBlock(t, site, cells[0].x + 1040, cells[0].y + 170, 620, 120, "left", "흰색과 회색 사이,\n가족의 물건이 색이 되는 집.")];
  const built = scenes.slice(0, 5).map((s, i) => {
    const c = cells[i + 1]; const box = { x: c.x + 90, y: c.y + 120, w: c.w - 180, h: c.h - 240 };
    return i === 2 && spare[0] ? insetScene(t, s, spare[0], i + 1, box) : sideScene(t, s, i + 1, box, i % 2 === 1);
  });
  const matEls = materialsBlock(t, site, -2800, 1420, 1700, 26);
  return canvasOf(t, [frame(cells[0], "표지"), ...built.map((b, i) => ({ ...b.frame, ...cells[i + 1] })), ...pack(matEls, "자재")], [...pads, ...titleEls, ...built.flatMap((b) => b.elements), ...matEls]);
};

/** 서초: a title disc with scenes radiating around it, each a round photo with its caption outside. */
const radial: Layout = (site, cover, scenes) => {
  const t = site.theme;
  const centre = frame({ x: -480, y: -480, w: 960, h: 960 }, "중심", "circle", t.accent);
  const built = scenes.slice(0, 8).map((s, i) => {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * 1950; const y = Math.sin(a) * 1300;
    return { b: circleScene(t, s, i + 1, x, y, 250, Math.cos(a) >= -0.01 ? "right" : "left"), a };
  });
  const matEls = materialsBlock(t, site, 2900, 1350, 1000, 24);
  return canvasOf(t, [centre, ...built.map((x) => x.b.frame), ...pack(matEls, "자재")], [
    shape(centre.x, centre.y, centre.w, centre.h, "#fbf8f2", "circle", { shadow: true }),
    photo(cover, -310, -390, 620, 340, { radius: 20 }),
    ...titleBlock(t, site, -420, -20, 840, 120, "center"),
    ...built.map(({ a }) => line(Math.cos(a) * 530, Math.sin(a) * 530, Math.cos(a) * 1600, Math.sin(a) * 1030, t.accent, 3, { opacity: 0.6 })),
    ...built.flatMap((x) => x.b.elements),
    ...matEls,
  ]);
};

/** 대치: scenes climbing a staircase, each a photo with its caption under it. */
const stairs: Layout = (site, cover, scenes) => {
  const t = site.theme;
  const boxes: Rect[] = []; let x = -3600; let base = 1450;
  scenes.slice(0, 7).forEach((_, i) => { const w = 620 + i * 60; const h = w * 1.3; boxes.push({ x, y: base - h, w, h }); x += w + 180; base -= 320; });
  const built = scenes.slice(0, 7).map((s, i) => stackScene(t, s, i + 1, boxes[i]));
  const introEls = [...titleBlock(t, site, -3600, -1700, 2000, 200, "left", "회색 결의 벽과 블랙 가죽, 마른 풀.\n한 칸씩 올라가며 보는 45평입니다."), photo(cover, -1300, -1700, 900, 700)];
  const matEls = materialsBlock(t, site, 1700, 1000, 1300, 24);
  return canvasOf(t, [...pack(introEls, "소개"), ...built.map((b) => b.frame), ...pack(matEls, "자재")], [
    ...introEls,
    ...boxes.slice(0, -1).map((b, i) => line(b.x + b.w + 30, b.y + b.h * 0.2, boxes[i + 1].x - 30, boxes[i + 1].y + boxes[i + 1].h * 0.5, t.accent, 3, { opacity: 0.5 })),
    ...built.flatMap((b) => b.elements), ...matEls,
  ]);
};

/** 이촌: rooms packed like a floor plan, each photo with a white plate naming the room. */
const plan: Layout = (site, cover, scenes) => {
  const t = site.theme;
  const rooms: Rect[] = [{ x: -1800, y: -900, w: 1500, h: 1000 }, { x: -300, y: -900, w: 1000, h: 640 }, { x: 700, y: -900, w: 1100, h: 640 }, { x: -300, y: -260, w: 600, h: 820 }, { x: 300, y: -260, w: 1500, h: 820 }, { x: -1800, y: 100, w: 1500, h: 460 }, { x: -1800, y: 560, w: 900, h: 500 }, { x: -900, y: 560, w: 1200, h: 500 }, { x: 300, y: 560, w: 1500, h: 500 }];
  const elements: BookElement[] = []; const frames: InfinityFrame[] = [];
  scenes.slice(0, rooms.length).forEach((s, i) => {
    const r = rooms[i];
    const pw = Math.min(r.w * 0.66, 640); const size = pw * 0.075;
    const ph = captionHeight(s, pw - size * 2, size) + size * 1.4;
    elements.push(photo(s.photo, r.x + 18, r.y + 18, r.w - 36, r.h - 36), shape(r.x + 18, r.y + r.h - 18 - ph, pw, ph, t.plate), ...caption(t, s, i + 1, r.x + 18 + size, r.y + r.h - 18 - ph + size * 0.8, pw - size * 2, size, { plate: true }));
    frames.push(frame(r, `${two(i + 1)} ${s.ko}`));
  });
  const introEls = [...titleBlock(t, site, 2100, -900, 1100, 170, "left", "32평의 평면을 따라 걷는 길.\n방마다 무엇을 남겼는지 봅니다."), photo(cover, 2100, -180, 1100, 740)];
  const matEls = materialsBlock(t, site, 2100, 720, 1100, 24);
  return canvasOf(t, [...pack(introEls, "소개"), ...frames, ...pack(matEls, "자재")], [
    ...elements,
    line(-1800, -900, 1800, -900, t.ink, 20), line(-1800, 1060, 1800, 1060, t.ink, 20), line(-1800, -900, -1800, 1060, t.ink, 20), line(1800, -900, 1800, 1060, t.ink, 20),
    ...introEls, ...matEls,
  ]);
};

/** 한남: a tight mosaic wall; each column opens with a caption block. */
const mosaic: Layout = (site, cover, scenes, spare) => {
  const t = site.theme;
  const cols = [[620, 400, 520], [560, 640, 300], [700, 300, 560], [500, 520, 460]] as const;
  const gap = 26; let x = -1500; const frames: InfinityFrame[] = []; const elements: BookElement[] = [];
  const pool = [...spare];
  cols.forEach((heights, c) => {
    const w = c % 2 ? 700 : 860; const s = scenes[c];
    if (!s) return;
    const size = w * 0.06;
    const els: BookElement[] = [numeral(t, c + 1, x + w * 0.5, -1520, w * 0.5, size * 3.2, "right"), ...caption(t, s, c + 1, x, -1420, w * 0.9, size)];
    let y = -1420 + captionHeight(s, w * 0.9, size) + 50;
    heights.forEach((h, r) => { els.push(photo(r === 0 ? s.photo : pool.shift() ?? s.photo, x, y, w, h)); y += h + gap; });
    elements.push(...els); frames.push(frame(around(els, 30), `${two(c + 1)} ${s.ko}`));
    x += w + gap;
  });
  const introEls = [...titleBlock(t, site, -3300, -1420, 1500, 200, "left", "석재 벽과 낮은 조도, 초록 스탠드 하나.\n33평을 네 줄의 벽으로 봅니다."), photo(cover, -3300, -380, 1500, 1000)];
  const matEls = materialsBlock(t, site, -3300, 780, 1500, 26);
  return canvasOf(t, [...pack(introEls, "소개"), ...frames, ...pack(matEls, "자재")], [...introEls, ...elements, ...matEls]);
};

/** 프린테크 사옥: an architectural sheet — grid, dimensioned photos and callout notes. */
const blueprint: Layout = (site, cover, scenes) => {
  const t = site.theme;
  const elements: BookElement[] = [];
  for (let gx = -3600; gx <= 4200; gx += 200) elements.push(line(gx, -1500, gx, 2000, "rgba(127,180,230,.09)", 2));
  for (let gy = -1500; gy <= 2000; gy += 200) elements.push(line(-3600, gy, 4200, gy, "rgba(127,180,230,.09)", 2));
  const boxes: Rect[] = [{ x: -3300, y: -1250, w: 1500, h: 950 }, { x: -600, y: -1250, w: 1150, h: 720 }, { x: 1500, y: -1250, w: 1500, h: 950 }, { x: -600, y: -150, w: 1150, h: 820 }, { x: -3300, y: 250, w: 1400, h: 900 }, { x: 1500, y: 250, w: 1500, h: 900 }];
  const frames: InfinityFrame[] = [];
  scenes.slice(0, boxes.length).forEach((s, i) => {
    const b = boxes[i]; const letter = String.fromCharCode(65 + i);
    const size = 62;
    const below = i === 1 || i === 3;
    const nx = below ? b.x : b.x + b.w + 110; const ny = below ? b.y + b.h + 70 : b.y + 60; const nw = below ? b.w : 820;
    const els: BookElement[] = [
      photo(s.photo, b.x, b.y, b.w, b.h, { saturate: 88 }),
      line(b.x, b.y - 46, b.x + b.w, b.y - 46, t.accent, 2),
      label(`${letter}  /  ${Math.round(b.w * 3)} × ${Math.round(b.h * 3)}`, b.x, b.y - 84, b.w, 18, t.accent),
      shape(b.x + b.w - 74, b.y + 22, 52, 52, "#0f1c2e", "circle"),
      label(letter, b.x + b.w - 74, b.y + 36, 52, 20, t.accent, { align: "center", spacing: 0 }),
      ...(below ? [] : [line(b.x + b.w, b.y + 90, nx - 20, b.y + 90, t.accent, 2, { opacity: 0.6 })]),
      ...caption(t, s, i + 1, nx, ny, nw, size),
    ];
    elements.push(...els); frames.push(frame(around(els, 40), `${letter} ${s.ko}`));
  });
  const introEls = [...titleBlock(t, site, -3300, 1350, 2400, 220, "left", "라인 조명과 석재, 우드 루버로 정리한\n일하는 공간의 도면."), photo(cover, -600, 1350, 1150, 600)];
  return canvasOf(t, [...pack(introEls, "소개"), ...frames], [...elements, ...introEls]);
};

/** 서래마을: a golden rectangle cut into squares, each a photograph with its caption laid over it. */
const golden: Layout = (site, cover, scenes) => {
  const t = site.theme;
  let rest = { x: -1600, y: -989, w: 3200, h: 1978 };
  const tiles: Rect[] = []; const sides = ["left", "top", "right", "bottom"] as const;
  for (let i = 0; i < 7; i++) {
    const side = sides[i % 4]; const size = Math.min(rest.w, rest.h);
    if (side === "left") { tiles.push({ x: rest.x, y: rest.y, w: size, h: size }); rest = { ...rest, x: rest.x + size, w: rest.w - size }; }
    if (side === "top") { tiles.push({ x: rest.x, y: rest.y, w: size, h: size }); rest = { ...rest, y: rest.y + size, h: rest.h - size }; }
    if (side === "right") { tiles.push({ x: rest.x + rest.w - size, y: rest.y, w: size, h: size }); rest = { ...rest, w: rest.w - size }; }
    if (side === "bottom") { tiles.push({ x: rest.x, y: rest.y + rest.h - size, w: size, h: size }); rest = { ...rest, h: rest.h - size }; }
  }
  tiles.push(rest);
  const frames: InfinityFrame[] = []; const elements: BookElement[] = [];
  tiles.forEach((tile, i) => {
    const s: Scene | undefined = i === 0 ? undefined : scenes[i - 1];
    const gap = Math.max(4, tile.w * 0.01);
    elements.push(photo(i === 0 ? cover : s?.photo ?? cover, tile.x + gap, tile.y + gap, tile.w - gap * 2, tile.h - gap * 2));
    if (s) {
      const size = tile.w * 0.05;
      const ph = captionHeight(s, tile.w * 0.6, size) + size * 1.2;
      elements.push(shape(tile.x + gap, tile.y + tile.h - gap - ph, tile.w * 0.72, ph, t.plate), ...caption(t, s, i, tile.x + gap + size * 0.8, tile.y + tile.h - gap - ph + size * 0.7, tile.w * 0.6, size, { plate: true }));
    }
    frames.push(frame(tile, i === 0 ? "표지 사진" : `${two(i)} ${s?.ko ?? ""}`));
  });
  const introEls = titleBlock(t, site, -3250, -989, 1400, 190, "left", "흰 벽과 대리석, 샹들리에의 빛.\n큰 장면에서 작은 장면으로 파고듭니다.");
  const matEls = materialsBlock(t, site, -3250, 420, 1400, 26);
  return canvasOf(t, [...pack(introEls, "소개"), ...frames, ...pack(matEls, "자재")], [...introEls, ...elements, ...matEls]);
};

/** 하남 35PY: scenes as round photographs joined by fine lines, captions beside each star. */
const constellation: Layout = (site, cover, scenes) => {
  const t = site.theme;
  const nodes = [[-1450, -750, 230, "left"], [-1650, 600, 250, "left"], [-350, 1150, 200, "left"], [900, 950, 260, "right"], [1750, -100, 230, "right"], [800, -1050, 210, "right"], [-350, -1250, 180, "left"]] as const;
  const R = 420;
  const built = scenes.slice(0, nodes.length).map((s, i) => circleScene(t, s, i + 1, nodes[i][0], nodes[i][1], nodes[i][2], nodes[i][3], "#1b2430"));
  const links = [[-1, 0], [-1, 1], [1, 2], [-1, 3], [3, 4], [-1, 4], [4, 5], [5, 6], [6, 0]];
  const pos = (k: number) => (k < 0 ? [0, 0] : [nodes[k][0], nodes[k][1]]);
  const hero = frame({ x: -R, y: -R, w: R * 2, h: R * 2 }, "메인", "circle", "rgba(238,241,244,.5)");
  const introEls = titleBlock(t, site, -3800, -1350, 1400, 200, "left", "석재와 오렌지 가죽, 숨은 조명.\n별을 잇듯 한 장면씩 이어 봅니다.");
  const matEls = materialsBlock(t, site, -3800, 250, 1300, 26);
  return canvasOf(t, [...pack(introEls, "소개"), hero, ...built.map((b) => b.frame), ...pack(matEls, "자재")], [
    ...links.map(([a, b]) => line(pos(a)[0], pos(a)[1], pos(b)[0], pos(b)[1], "rgba(238,241,244,.22)", 3)),
    shape(-R - 20, -R - 20, R * 2 + 40, R * 2 + 40, "#1b2430", "circle"),
    photo(cover, -R, -R, R * 2, R * 2, { mask: "circle" }),
    ...built.flatMap((b) => b.elements), ...introEls, ...matEls,
  ]);
};

/** 하남 45PY: one photograph read in three parts, each zoom with its caption and materials typed out. */
const single: Layout = (site, cover) => {
  const t = site.theme;
  const W = 3800; const H = W / (cover.w / cover.h); const X = -W / 2; const Y = -H / 2;
  const parts = [[0.02, 0.05, 0.42, "Ceiling", "천장의 빛", "천장 단을 따라 숨긴 라인 조명이 벽지와 커튼을 은은하게 밝힙니다."], [0.32, 0.32, 0.36, "Kitchen", "레논 아일랜드", "천연석 레논 아일랜드와 인쇼 패브릭 도어가 주방을 이룹니다."], [0.56, 0.42, 0.42, "Dining", "긴 식탁", "900×2700 인쇼 다이닝 테이블과 체어, 그리고 꽃 한 다발."]] as const;
  const groups = [site.materials.slice(0, 4), site.materials.slice(4, 8), site.materials.slice(8, 12)];
  const frames: InfinityFrame[] = []; const elements: BookElement[] = [photo(cover, X, Y, W, H)];
  parts.forEach(([fx, fy, fw, en, ko, sentence], i) => {
    const z = { x: X + W * fx, y: Y + H * fy, w: W * fw, h: W * fw * 0.5625 };
    const size = z.w / 32; const pw = z.w * 0.46;
    const scene: Scene = { photo: cover, en, ko, line: sentence };
    const ph = captionHeight(scene, pw - size * 1.6, size) + size * 1.2;
    const rows = groups[i];
    elements.push(
      fade(shape(z.x + z.w * 0.04, z.y + z.h - ph - z.h * 0.05, pw, ph, t.plate)),
      ...caption(t, scene, i + 1, z.x + z.w * 0.04 + size * 0.8, z.y + z.h - ph - z.h * 0.05 + size * 0.6, pw - size * 1.6, size, { plate: true }).map((e) => (e.animation ? e : fade(e))),
      ...(rows.length ? [typed(text(rows.map(([k, v]) => `${k}  ${v}`).join("\n"), z.x + z.w * 0.54, z.y + z.h * 0.6, z.w * 0.42, size * 0.42, "#ffffff", { lineHeight: 1.7 }), 1.8)] : []),
    );
    frames.push(frame(z, `${i + 1} ${ko}`));
  });
  elements.push(shape(X, Y + H - 560, W, 560, "rgba(10,10,10,.42)"), ...titleBlock({ ...t, ink: "#ffffff" }, site, X + 140, Y + H - 500, 2400, 200));
  return canvasOf(t, frames, elements);
};

/* ---------- sites ---------- */
const m = (...pairs: [string, string][]) => pairs;
const dark = (bg: string, accent: string, image?: string): Theme => ({ bg, image, ink: "#f3efe8", muted: "rgba(243,239,232,.62)", accent, plate: "rgba(14,15,18,.84)", plateInk: "#f3efe8", plateMuted: "rgba(243,239,232,.72)" });
const light = (bg: string, ink: string, accent: string, image?: string): Theme => ({ bg, image, ink, muted: "#7d766d", accent, plate: "rgba(255,255,255,.95)", plateInk: ink, plateMuted: "#6f6a63" });

export const SHOW_SITES: ShowSite[] = [
  { slug: "daejang-62", name: "대장동 62PY", latin: "Daejang-dong", area: "62평", kind: "RESIDENCE", layout: orbit,
    fonts: { display: "'Cormorant Garamond'", serif: "'Gowun Batang'", body: "'IBM Plex Sans KR'", italic: true },
    theme: dark("#16181c", "#c8a97e", "radial-gradient(circle at 50% 50%, #23262c 0%, #14161a 65%)"),
    captions: [["13.jpg", "Dining", "다이닝", "긴 블랙 테이블 위로 유리 펜던트 두 개를 나란히 걸었습니다."], ["24.jpg", "Living", "거실", "가죽 소파와 낮은 테이블, 커튼으로 거른 빛만 남겼습니다."], ["38.jpg", "Kitchen", "주방", "천연석 아일랜드를 한 덩어리로 깎아 주방의 무게를 잡았습니다."], ["46.jpg", "Shelf", "석재 선반", "돌 선반 아래 간접등을 숨겨 표면의 결이 드러나게 했습니다."], ["52.jpg", "Bedroom", "침실", "밝은 침실은 헤드보드와 침구만으로 조용히 정리했습니다."], ["58.jpg", "Bath", "욕실", "어두운 석재와 세로 골유리로 욕실에 깊이를 만들었습니다."], ["41.jpg", "Detail", "수전", "거친 돌 벽면에 매끈한 메탈 수전을 대비시켰습니다."], ["56.jpg", "Dress room", "드레스룸", "밝은 우드 가구와 라인 조명으로 수납을 벽처럼 정돈했습니다."]],
    materials: m(["주방 아일랜드", "천연석"], ["주방 가구 도어", "무니"], ["유리장 도어", "베스컴"], ["조명·스위치", "인쇼 CCT 조명, 메탈실버·블랙"], ["방문 손잡이", "인쇼 × 예림"], ["다이닝 테이블", "인쇼 블랙 테이블 2700×900"], ["다이닝·바 체어", "인쇼 블랙 체어"], ["거실 소파", "인쇼 소파#1 천연가죽 블랙"], ["소파 테이블", "인쇼 커피테이블 블랙"], ["거실 러그", "이씨라메종"], ["식탁 펜던트", "폴크 칸딘스키"], ["커튼", "패브릭온도"]) },
  { slug: "cheongdam-57", name: "청담 57PY", latin: "Cheongdam", area: "57평", kind: "RESIDENCE", layout: salon,
    fonts: { display: "'Bodoni Moda'", serif: "'Hahmlet'", body: "'IBM Plex Sans KR'" },
    theme: light("#ebe6de", "#2a2622", "#8a6a4a", "linear-gradient(180deg, #efeae2 0%, #e2dbcf 100%)"),
    captions: [["01.jpg", "Dining", "다이닝", "대리석 벽을 따라 긴 다이닝이 깊숙이 이어집니다."], ["13.jpg", "Living", "거실", "물결치는 천장 아래 낮은 소파와 러그를 두었습니다."], ["28.jpg", "Kitchen", "주방", "블랙 아일랜드 두 개를 나란히 놓아 동선을 나눴습니다."], ["34.jpg", "Entrance", "현관", "골유리 문과 대리석 벽이 첫인상을 정합니다."], ["43.jpg", "Powder", "파우더룸", "석재 상판 위로 빛을 세로로 세운 세 개의 거울."], ["47.jpg", "Bath", "욕실 선반", "블랙코스믹 천연석 선반에 둥근 손잡이를 더했습니다."], ["37.jpg", "Tea bar", "티 바", "질감 있는 타일 벽 앞에 작은 바를 만들었습니다."]],
    materials: m(["다이닝 테이블·체어", "자체 제작"], ["욕실 벽 타일", "인쇼타일02 그레이 750×1500"], ["욕실 선반", "천연석 블랙코스믹"], ["드레스룸 가구", "영림 로얄블랙"], ["조명", "인쇼 CCT 조명 시스템"], ["스위치", "인쇼 75 스위치·온도조절기 메탈실버"]) },
  { slug: "jamsil-50", name: "잠실 50PY", latin: "Jamsil", area: "50평", kind: "RESIDENCE", layout: strip,
    fonts: { display: "'DM Serif Display'", serif: "'Gowun Batang'", body: "'IBM Plex Sans KR'" },
    theme: dark("#0f0f10", "#d6b98c"),
    captions: [["08.jpg", "Living", "거실", "길게 뻗은 벽면 수납과 소파가 창까지 시선을 이끕니다."], ["14.jpg", "Dining", "다이닝", "블랙 테이블과 체어를 밝은 공간 한가운데 두었습니다."], ["19.jpg", "Kitchen", "아일랜드", "세라믹 쥬라화이트 아일랜드에 바 체어 세 개를 붙였습니다."], ["24.jpg", "Shelf", "석재 선반", "석재 벽에 간접등을 두른 선반을 매립했습니다."], ["30.jpg", "Louver", "루버", "세로 루버로 우드의 결을 리듬처럼 반복했습니다."], ["38.jpg", "Study", "서재", "타공 수납 벽과 긴 책상으로 작업 공간을 꾸렸습니다."], ["22.jpg", "Kitchen", "주방", "빈티지 그레이 무늬목 가구와 석재 벽이 만납니다."], ["40.jpg", "Moment", "한 장면", "커피와 책, 의자 하나로 집의 분위기를 보여 줍니다."]],
    materials: m(["주방 아일랜드", "세라믹 쥬라화이트"], ["공용부 석재", "세라믹 쥬라화이트"], ["공용부 가구 도어", "무늬목 빈티지 그레이"], ["파우더룸 도어", "인쇼 라이트레더"], ["조명·스위치", "인쇼 CCT 조명, 메탈실버·블랙"], ["방문 손잡이", "인쇼 × 예림"], ["다이닝 테이블", "인쇼 블랙 테이블 2700×900"], ["다이닝·바 체어", "인쇼 블랙 체어"], ["거실 소파", "인쇼 소파#1 패브릭 아이보리"], ["거실 커튼", "패브릭온도 TU14"]) },
  { slug: "yongin-68", name: "용인 68PY", latin: "Yongin", area: "68평", kind: "RESIDENCE", layout: hidden,
    fonts: { display: "'Cormorant Garamond'", serif: "'Hahmlet'", body: "'IBM Plex Sans KR'" },
    theme: { ...dark("#1d2420", "#d8c3a0"), plate: "rgba(20,24,22,.86)" },
    captions: [["01.jpg", "Living", "거실", "넓은 창 앞에 소파 두 개를 마주 놓아 대화가 머뭅니다."], ["28.jpg", "Lounge", "라운지", "원형 우드 패널과 가죽 소파로 작은 쉼터를 만들었습니다."], ["30.jpg", "Entrance", "현관", "둥근 개구부 너머로 다음 공간이 살짝 보입니다."], ["45.jpg", "Bath", "욕실", "진그레이 대형 타일과 매립 조명으로 욕실을 감쌌습니다."], ["33.jpg", "Art", "그림", "노채영 작가의 그림이 석재 벽 앞에 기대어 섭니다."]],
    materials: m(["공용부 벽면", "세라믹 쥬라화이트"], ["공용부 필름", "레놀릿 샌드링햄오크그레이"], ["주방 키큰장 도어", "무니끄 NPD022S"], ["주방 아일랜드", "세라믹 쥬라화이트"], ["다이닝룸 벽면", "타일 엘리시안08 600×1200"], ["욕실 벽면", "인쇼타일03 진그레이 750×1500"], ["조명·스위치", "인쇼 CCT 조명 메탈실버"], ["다이닝 테이블", "인쇼 블랙 다이닝 테이블 2700×900"], ["거실 소파", "인쇼 소파 패브릭 아이보리"], ["다이닝룸 소파", "인쇼 소파 블랙 천연가죽"], ["커튼", "패브릭온도 V02"], ["그림", "노채영 작가 Dispersion of Life"]) },
  { slug: "seongbuk-52", name: "성북 52PY", latin: "Seongbuk", area: "52평", kind: "RESIDENCE", layout: magazine,
    fonts: { display: "'Playfair Display'", serif: "'Hahmlet'", body: "'IBM Plex Sans KR'" },
    theme: light("#efefec", "#151515", "#b0412e"),
    captions: [["01.jpg", "Kitchen", "주방", "흰 주방 가구와 아일랜드가 하나의 면처럼 이어집니다."], ["21.jpg", "Dining", "다이닝", "물결 모양 조명 아래 덱톤 세라믹 상판 테이블을 놓았습니다."], ["32.jpg", "Library", "서재", "벽 전체를 책장으로 만들어 색은 책이 채우게 했습니다."], ["44.jpg", "Family room", "가족실", "작은 소파와 피아노, 아이 의자가 함께 놓입니다."], ["53.jpg", "Bedroom", "침실", "침대 뒤 낮은 벽과 간접등으로 아늑하게 감쌌습니다."]],
    materials: m(["공용부 테이블", "자체 제작, 덱톤 세라믹 상판"], ["공용부 의자", "보컨셉 프린스턴"]) },
  { slug: "seocho-53", name: "서초 53PY", latin: "Seocho", area: "53평", kind: "RESIDENCE", layout: radial,
    fonts: { display: "'Bodoni Moda'", serif: "'Gowun Batang'", body: "'IBM Plex Sans KR'", italic: true },
    theme: light("#efebe4", "#2b2925", "#a07c4f"),
    captions: [["08.jpg", "Living", "거실", "노란 원과 회색 원의 그림이 거실의 색을 정합니다."], ["16.jpg", "Kitchen", "주방", "흰 주방과 체르너 체어, 데살토 오발 테이블이 어울립니다."], ["10.jpg", "Hall", "긴 거실", "천장 라인 조명이 집의 길이를 따라 달립니다."], ["37.jpg", "Study", "작업실", "색 띠 그림 옆에 작은 책상을 붙였습니다."], ["41.jpg", "Bedroom", "침실", "창밖 도시를 등지고 그린 쿠션으로 색을 더했습니다."], ["48.jpg", "Bath", "욕실", "그레이 석재와 둥근 욕조, 원형 거울을 맞췄습니다."], ["50.jpg", "Vanity", "세면대", "두 개의 유리 펜던트가 세면대 위를 밝힙니다."], ["33.jpg", "Detail", "조명", "타원 펜던트 아래 붉은 꽃 한 다발."]],
    materials: m(["공용부 테이블", "데살토 클레이 오발 테이블"], ["공용부 체어", "체르너 사이드체어"]) },
  { slug: "daechi-45", name: "대치 45PY", latin: "Daechi", area: "45평", kind: "RESIDENCE", layout: stairs,
    fonts: { display: "'DM Serif Display'", serif: "'Hahmlet'", body: "'IBM Plex Sans KR'" },
    theme: light("#e9edf2", "#1c2430", "#3a5a86", "linear-gradient(160deg, #f1f4f7 0%, #dde4ec 100%)"),
    captions: [["01.jpg", "Living & dining", "거실과 다이닝", "버블 펜던트 아래 긴 테이블과 블랙 가죽 소파가 이어집니다."], ["10.jpg", "Dining", "다이닝", "조명이 든 유리장 앞에 원형 테이블을 놓았습니다."], ["16.jpg", "Kitchen", "주방", "흰 아일랜드와 바 체어로 주방을 가볍게 비웠습니다."], ["28.jpg", "Living", "거실", "마른 풀 화분이 벽 끝에서 거실을 마무리합니다."], ["34.jpg", "Light", "빛", "벽 틈 사이로 세로 조명이 금빛 선을 긋습니다."], ["42.jpg", "Bath", "욕실", "밝은 타일과 라인 조명으로 욕조 공간을 감쌌습니다."], ["53.jpg", "Study", "서재", "책장 벽과 라운지 체어가 있는 작은 서재입니다."]],
    materials: m(["공용부 테이블", "보컨셉 오타와"], ["공용부 의자", "보컨셉 오타와"]) },
  { slug: "ichon-32", name: "이촌 32PY", latin: "Ichon", area: "32평", kind: "RESIDENCE", layout: plan,
    fonts: { display: "'Montserrat'", serif: "'IBM Plex Sans KR'", body: "'IBM Plex Sans KR'" },
    theme: light("#f3f1ec", "#202020", "#8b7355"),
    captions: [["01.jpg", "Dining", "다이닝", "보컨셉 오타와 테이블이 주방 앞에 길게 놓입니다."], ["17.jpg", "Kitchen", "주방", "흰 주방 가구와 아일랜드를 단정하게 맞췄습니다."], ["27.jpg", "Living", "거실", "모듈 소파 하나를 창 쪽으로 붙였습니다."], ["30.jpg", "Powder", "파우더", "거울장과 간접등이 좁은 공간을 넓혀 보입니다."], ["08.jpg", "Living & dining", "거실과 다이닝", "커튼으로 거른 빛 아래 소파와 식탁이 한 공간에 놓입니다."], ["36.jpg", "Bedroom", "침실", "비워 둔 방에 커튼과 빛만 남겼습니다."], ["31.jpg", "Detail", "손잡이", "문 손잡이까지 같은 톤의 메탈로 골랐습니다."], ["41.jpg", "Bath", "욕실", "골유리 칸막이와 매립 수전으로 욕실을 정리했습니다."], ["44.jpg", "Vanity", "세면대", "벽 수전과 상부장으로 세면대를 단순하게 만들었습니다."]],
    materials: m(["공용부 테이블", "보컨셉 오타와"], ["공용부 의자", "보컨셉 오타와"]) },
  { slug: "hannam-33", name: "한남 33PY", latin: "Hannam", area: "33평", kind: "RESIDENCE", layout: mosaic,
    fonts: { display: "'Cormorant Garamond'", serif: "'Gowun Batang'", body: "'IBM Plex Sans KR'" },
    theme: dark("#1a1714", "#c8a97e"),
    captions: [["01.jpg", "Living", "거실", "회색 소파와 원형 테이블, 녹색 스탠드 하나가 포인트입니다."], ["16.jpg", "Kitchen", "주방", "어두운 주방 가구 위로 다운라이트를 줄 세웠습니다."], ["30.jpg", "Dining", "다이닝", "보컨셉 오타와 체어가 테이블을 둘러쌉니다."], ["40.jpg", "Bedroom", "침실", "커튼 뒤 간접등으로 침실을 은은하게 밝혔습니다."]],
    materials: m(["공용부 테이블", "자체 제작, 프린테크 ACREX 상판"], ["공용부 의자", "보컨셉 오타와"]) },
  { slug: "printech-office", name: "프린테크 사옥", latin: "Printech", area: "사옥", kind: "OFFICE", layout: blueprint,
    fonts: { display: "'Montserrat'", serif: "'IBM Plex Sans KR'", body: "'IBM Plex Sans KR'" },
    theme: { ...dark("#0f1c2e", "#7fb4e6"), ink: "#e8eef7", muted: "rgba(232,238,247,.62)" },
    captions: [["05.jpg", "Workspace", "업무 공간", "천장을 가르는 라인 조명이 데스크 줄을 따라갑니다."], ["03.jpg", "Aisle", "통로", "기둥과 수납 벽 사이로 넓은 통로를 냈습니다."], ["13.jpg", "Meeting", "회의실", "천장을 조명으로 채운 밝은 회의실입니다."], ["30.jpg", "Chairman", "대표실", "석재 벽에 사인을 새긴 대표실 입구."], ["22.jpg", "Conference", "큰 회의실", "가죽 벤치와 긴 테이블로 큰 회의를 받습니다."], ["32.jpg", "Boardroom", "임원 회의실", "석재 벽과 우드 테이블로 무게를 더했습니다."]],
    materials: [] },
  { slug: "seorae-70", name: "서래마을 70PY", latin: "Seorae", area: "70평", kind: "RESIDENCE", layout: golden,
    fonts: { display: "'Playfair Display'", serif: "'Hahmlet'", body: "'IBM Plex Sans KR'", italic: true },
    theme: light("#f1ede6", "#2d2a26", "#9a7b55"),
    captions: [["06.jpg", "Living", "거실", "가죽 라운지 체어와 유리 테이블이 거실 중심에 놓입니다."], ["15.jpg", "Dining", "다이닝", "곡선 커튼 벽 앞에 오벌 테이블과 샹들리에."], ["11.jpg", "Kitchen", "주방", "긴 아일랜드 위에 막대 조명 하나를 걸었습니다."], ["02.jpg", "Entrance", "현관", "흰 벽 사이 라인 조명이 현관문까지 길을 냅니다."], ["19.jpg", "Bedroom", "침실", "회색 헤드월과 우드 바닥으로 침실을 차분하게."], ["21.jpg", "Study", "서재", "큰 그림과 가죽 체어가 있는 방."], ["18.jpg", "Corner", "작은 방", "올리브색 커튼 앞 작은 의자 하나."]],
    materials: m(["공용부 테이블 상판", "CALACATTA MACCHIA VECCHIA"]) },
  { slug: "hanam-35", name: "하남 35PY", latin: "Hanam", area: "35평", kind: "RESIDENCE", layout: constellation,
    fonts: { display: "'Cormorant Garamond'", serif: "'Gowun Batang'", body: "'IBM Plex Sans KR'", italic: true },
    theme: dark("#141b24", "#d9b98a", "radial-gradient(circle at 45% 45%, #1f2a38 0%, #121820 70%)"),
    captions: [["07.jpg", "Living & dining", "거실과 다이닝", "드롭 체어 다이닝과 오렌지 소파가 한 공간에 놓입니다."], ["41.jpg", "Living", "거실", "오렌지 가죽 소파가 차분한 톤에 온기를 더합니다."], ["56.jpg", "Bedroom", "침실", "낮은 침대 아래 간접등으로 떠 있는 듯 보이게 했습니다."], ["01.jpg", "Kitchen", "주방", "긴 아일랜드와 석재 기둥이 주방의 축이 됩니다."], ["23.jpg", "Hall", "복도", "벽감 속 드라이플라워가 복도 끝을 밝힙니다."], ["12.jpg", "Light", "조명", "천장 라인 조명과 펜던트가 하나의 선을 이룹니다."], ["55.jpg", "Detail", "손잡이", "석재 벽 옆, 메탈 손잡이의 디테일."]],
    materials: m(["공용부 테이블", "보컨셉 오타와"], ["공용부 의자", "보컨셉 오타와"]) },
  { slug: "hanam-45", name: "하남 45PY", latin: "Hanam", area: "45평", kind: "RESIDENCE", layout: single,
    fonts: { display: "'Bodoni Moda'", serif: "'Gowun Batang'", body: "'IBM Plex Sans KR'" },
    theme: dark("#111111", "#e0c9a6"),
    captions: [],
    materials: m(["벽지", "인쇼 2번 아이보리 캔버스"], ["마루", "인쇼 플랫 그레이지 190×1900"], ["주방 아일랜드", "천연석 레논"], ["주방 가구 도어", "인쇼 패브릭 도어"], ["조명·스위치", "인쇼 CCT 조명, 메탈실버"], ["방문 손잡이", "인쇼 매립형 히든도어 핸들"], ["다이닝", "인쇼 다이닝 테이블 900×2700·체어"], ["거실 소파", "인쇼 소파#1 패브릭 아이보리"], ["거실 러그", "이씨라메종"], ["커튼", "패브릭온도"], ["팬트리 도어", "인쇼 제작 패브릭 도어"]) },
];

/* ---------- import ---------- */
type ManifestEntry = { slug: string; photos?: { src?: string; file: string; width: number; height: number }[] };
const BASE = "/portfolios/interior-show";
/** Bump when the layouts change; books still carrying an older seed are rebuilt in place. */
export const SHOW_SEED = "interior-show:2";
export const SHOW_TITLES = new Set(SHOW_SITES.map((site) => `${site.name} · 인피니티북`));

/** Reads the shared photo selection and turns each site into an 인피니티북. */
export async function buildInteriorShowBooks(): Promise<Flipbook[]> {
  const response = await fetch(`${BASE}/manifest.json`, { cache: "no-store" });
  if (!response.ok) throw new Error("사진 목록(manifest.json)을 찾지 못했습니다.");
  const entries = (await response.json()) as ManifestEntry[];
  return SHOW_SITES.flatMap((site) => {
    const entry = entries.find((item) => item.slug === site.slug);
    const photos: ShowPhoto[] = (entry?.photos ?? []).map((p) => ({ src: p.src ?? `${BASE}/${site.slug}/${p.file}`, w: p.width, h: p.height, file: p.file }));
    if (photos.length === 0) return [];
    const byFile = new Map(photos.map((p) => [p.file, p]));
    const scenes = site.captions.flatMap(([file, en, ko, line]) => { const p = byFile.get(file); return p ? [{ photo: p, en, ko, line }] : []; });
    const used = new Set([photos[0].file, ...scenes.map((s) => s.photo.file)]);
    const spare = photos.filter((p) => !used.has(p.file));
    F = site.fonts;
    const book = createFlipbook(`${site.name} · 인피니티북`);
    return [{ ...book, kind: "infinite" as const, seed: SHOW_SEED, pages: [], background: "#111111", canvas: site.layout(site, photos[0], scenes, spare) }];
  });
}
