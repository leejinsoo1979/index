/**
 * 인피니티북 templates: the usual zooming-presentation structures (planets around a topic, a timeline,
 * steps, a mind map, drilling into detail, a grid report, a portfolio strip) built from our own frames,
 * shapes and text. Each `build` returns a fresh canvas with new ids.
 */
import { uid, type BookElement, type LineElement, type ShapeElement, type TextElement } from "../lib/flipbooks";
import type { InfinityCanvas, InfinityFrame } from "../lib/infinity";

export type InfinityTemplate = { id: string; name: string; category: string; description: string; build: () => InfinityCanvas };
export const INFINITY_CATEGORIES = ["전체", "기본", "비즈니스", "기획·보고", "교육", "포트폴리오"];

type Palette = { bg: string; image: string; ink: string; muted: string; stroke: string; accent: string; serif?: boolean };
const PALETTES = {
  dusk: { bg: "#5b6aa8", image: "linear-gradient(180deg, #7fa3cf 0%, #5d6aa6 60%, #4c4787 100%)", ink: "#ffffff", muted: "rgba(255,255,255,.78)", stroke: "#4a3f8f", accent: "#ffffff", serif: true },
  night: { bg: "#1b1f3b", image: "linear-gradient(160deg, #141833 0%, #24295c 55%, #4a3277 100%)", ink: "#ffffff", muted: "rgba(255,255,255,.7)", stroke: "#8f86e8", accent: "#f2c86b" },
  paper: { bg: "#f3efe7", image: "linear-gradient(180deg, #f6f2ea 0%, #e8e0d1 100%)", ink: "#2a2420", muted: "#6f655b", stroke: "#2a2420", accent: "#b5794a", serif: true },
  ocean: { bg: "#203a43", image: "linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)", ink: "#ffffff", muted: "rgba(255,255,255,.72)", stroke: "#7fd1c7", accent: "#7fd1c7" },
  mist: { bg: "#dfe6ee", image: "linear-gradient(180deg, #edf1f5 0%, #cfd9e4 100%)", ink: "#1f2a37", muted: "#5b6878", stroke: "#2f5be0", accent: "#2f5be0" },
  walnut: { bg: "#3b2a1f", image: "linear-gradient(160deg, #2b1d14 0%, #4f3424 60%, #7a5638 100%)", ink: "#f7efe6", muted: "rgba(247,239,230,.72)", stroke: "#d9b48a", accent: "#d9b48a", serif: true },
} satisfies Record<string, Palette>;

/* ---------- building blocks (world pixels) ---------- */
const text = (p: Palette, value: string, x: number, y: number, w: number, size: number, extra: Partial<TextElement> = {}): TextElement => ({
  id: uid(), type: "text", text: value, x, y, w, h: size * 1.35 * Math.max(1, value.split("\n").length), size, color: p.ink, bold: false, align: "left",
  font: "'Noto Sans KR'", lineHeight: 1.3, actions: [], ...extra,
});
const title = (p: Palette, value: string, x: number, y: number, w: number, size: number, extra: Partial<TextElement> = {}) =>
  text(p, value, x, y, w, size, { bold: true, font: p.serif ? "'Noto Serif KR'" : "'Noto Sans KR'", ...extra });
const ring = (p: Palette, cx: number, cy: number, r: number, name: string, fill = "transparent"): InfinityFrame =>
  ({ id: uid(), x: cx - r, y: cy - r, w: r * 2, h: r * 2, shape: "circle", fill, stroke: p.stroke, title: name });
const box = (p: Palette, x: number, y: number, w: number, h: number, name: string, fill = "transparent", stroke: string | undefined = p.stroke): InfinityFrame =>
  ({ id: uid(), x, y, w, h, shape: "rect", fill, stroke, title: name });
const shape = (x: number, y: number, w: number, h: number, fill: string, kind = "rect", extra: Partial<ShapeElement> = {}): ShapeElement =>
  ({ id: uid(), type: "shape", shape: kind, fill, x, y, w, h, actions: [], ...extra });
/** A straight line (or arrow) between two points. */
const line = (x1: number, y1: number, x2: number, y2: number, color: string, thickness: number, arrow = false, style: LineElement["style"] = "solid"): LineElement => {
  const length = Math.hypot(x2 - x1, y2 - y1);
  return { id: uid(), type: "line", color, thickness, style, arrow, x: (x1 + x2) / 2 - length / 2, y: (y1 + y2) / 2 - thickness / 2, w: length, h: thickness, rotation: (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI, actions: [] };
};
/** Heading and a line of body text, placed inside a frame. */
const label = (p: Palette, frame: InfinityFrame, heading: string, body: string, align: TextElement["align"] = "center"): TextElement[] => {
  const size = Math.min(frame.w, frame.h) / 9;
  const w = frame.w * 0.72;
  const x = frame.x + (frame.w - w) / 2;
  const y = frame.y + frame.h * 0.36;
  return [title(p, heading, x, y, w, size, { align }), text(p, body, x, y + size * 1.6, w, size * 0.42, { align, color: p.muted })];
};
const canvas = (p: Palette, frames: InfinityFrame[], elements: BookElement[]): InfinityCanvas =>
  ({ background: p.bg, backgroundImage: p.image, parallax: true, ratio: "16:9", frames, elements });

/* ---------- templates ---------- */
function planets(): InfinityCanvas {
  const p = PALETTES.dusk;
  const centre = ring(p, 300, 40, 330, "핵심 주제");
  const orbit = [ring(p, -160, -330, 150, "첫 번째"), ring(p, 760, -310, 130, "두 번째"), ring(p, 870, 330, 200, "세 번째"), ring(p, -60, 420, 190, "네 번째")];
  return canvas(p, [centre, ...orbit], [
    title(p, "더블클릭해 제목 입력", -1150, -70, 1000, 88),
    text(p, "부제를 입력하세요", -1150, 60, 900, 34, { color: p.muted }),
    ...label(p, centre, "핵심 주제", "더블클릭해 내용을 입력하세요"),
    ...orbit.flatMap((frame) => label(p, frame, frame.title, "내용 입력")),
    line(40, -230, 0, -190, p.ink, 5, true), line(560, -140, 640, -220, p.ink, 5, true), line(620, 200, 690, 240, p.ink, 5, true), line(90, 300, 40, 330, p.ink, 5, true),
  ]);
}

function timeline(): InfinityCanvas {
  const p = PALETTES.mist;
  const stops = ["착공 준비", "철거·설비", "목공·전기", "마감", "준공·인수"];
  const frames = stops.map((name, i) => ring(p, -1000 + i * 500, i % 2 ? 120 : -120, 170, name, "#ffffff"));
  return canvas(p, frames, [
    title(p, "현장 공정 타임라인", -1200, -720, 1600, 96, { color: p.ink }),
    text(p, "공사 기간 동안의 주요 단계를 순서대로 보여 줍니다.", -1200, -580, 1400, 34, { color: p.muted }),
    line(-1250, 0, 1350, 0, "#9aa9bb", 10, true),
    ...frames.flatMap((frame, i) => [
      shape(frame.x + frame.w / 2 - 14, -14, 28, 28, p.accent, "circle"),
      text(p, `${i + 1}주차`, frame.x, frame.y + frame.h * 0.24, frame.w, 30, { align: "center", bold: true, color: p.accent }),
      ...label(p, frame, frame.title, "작업 내용을 입력하세요").map((item) => ({ ...item, color: item.bold ? p.ink : p.muted })),
    ]),
  ]);
}

function steps(): InfinityCanvas {
  const p = PALETTES.night;
  const frames = [0, 1, 2, 3].map((i) => box(p, -1100 + i * 560, 380 - i * 230, 500, 320, `${i + 1}단계`, "rgba(255,255,255,.06)"));
  return canvas(p, frames, [
    title(p, "목표까지 네 단계", -1150, -760, 1500, 96),
    text(p, "한 계단씩 올라가며 설명합니다.", -1150, -620, 1200, 34, { color: p.muted }),
    ...frames.flatMap((frame, i) => [
      text(p, `0${i + 1}`, frame.x + 40, frame.y + 34, 200, 64, { bold: true, color: p.accent }),
      title(p, ["현황 파악", "방향 설정", "실행", "점검과 개선"][i], frame.x + 40, frame.y + 130, frame.w - 80, 46),
      text(p, "이 단계의 내용을 입력하세요", frame.x + 40, frame.y + 210, frame.w - 80, 24, { color: p.muted }),
    ]),
    line(-640, 330, -560, 260, p.accent, 6, true), line(-80, 100, 0, 30, p.accent, 6, true), line(480, -130, 560, -200, p.accent, 6, true),
  ]);
}

function mindmap(): InfinityCanvas {
  const p = PALETTES.paper;
  const centre = ring(p, 0, 0, 260, "중심 생각", "#ffffff");
  const names = ["공간 기획", "자재", "예산", "일정", "협력 업체", "사후 관리"];
  const branches = names.map((name, i) => {
    const angle = (i / names.length) * Math.PI * 2 - Math.PI / 2;
    return { frame: ring(p, Math.cos(angle) * 760, Math.sin(angle) * 520, 160, name), angle };
  });
  return canvas(p, [centre, ...branches.map((b) => b.frame)], [
    ...label(p, centre, "중심 생각", "더블클릭해 입력"),
    ...branches.flatMap(({ frame, angle }) => [
      line(Math.cos(angle) * 270, Math.sin(angle) * 270, Math.cos(angle) * 590, Math.sin(angle) * 360, p.stroke, 4),
      ...label(p, frame, frame.title, "생각을 적어 보세요"),
    ]),
  ]);
}

function drilldown(): InfinityCanvas {
  const p = PALETTES.ocean;
  const outer = ring(p, 0, 0, 620, "전체 그림");
  const middle = ring(p, 170, 130, 260, "자세히");
  const inner = ring(p, 230, 210, 90, "핵심");
  return canvas(p, [outer, middle, inner], [
    title(p, "큰 그림에서 핵심까지", -480, -420, 960, 80, { align: "center" }),
    text(p, "안으로 확대할수록 더 구체적인 이야기가 나옵니다.", -430, -300, 860, 30, { align: "center", color: p.muted }),
    title(p, "자세히 보기", 0, 0, 340, 38, { align: "center" }),
    text(p, "세부 내용을 입력하세요", 20, 52, 300, 16, { align: "center", color: p.muted }),
    title(p, "핵심", 170, 180, 120, 22, { align: "center", color: p.accent }),
    text(p, "한 문장으로", 165, 210, 130, 8, { align: "center", color: p.muted }),
  ]);
}

function report(): InfinityCanvas {
  const p = PALETTES.mist;
  const cells = [["현황", -980, -260], ["성과", 40, -260], ["이슈", -980, 400], ["다음 단계", 40, 400]] as const;
  const frames = cells.map(([name, x, y]) => box(p, x, y, 940, 580, name, "#ffffff", undefined));
  return canvas(p, frames, [
    title(p, "프로젝트 현황 보고", -980, -620, 1800, 90),
    text(p, "2026년 4분기 · 담당 부서", -980, -490, 1200, 32, { color: p.muted }),
    ...frames.flatMap((frame, i) => [
      shape(frame.x, frame.y, 14, frame.h, [p.accent, "#2e9d6a", "#d0573f", "#8a5cd1"][i]),
      title(p, frame.title, frame.x + 60, frame.y + 50, 600, 52),
      text(p, "• 첫 번째 내용\n• 두 번째 내용\n• 세 번째 내용", frame.x + 60, frame.y + 150, frame.w - 120, 30, { color: p.muted }),
    ]),
  ]);
}

function portfolio(): InfinityCanvas {
  const p = PALETTES.walnut;
  const frames = [0, 1, 2, 3].map((i) => box(p, -1300 + i * 680, -260, 620, 640, `작업 ${i + 1}`, "transparent", undefined));
  return canvas(p, frames, [
    title(p, "인테리어 포트폴리오", -1300, -620, 1800, 100),
    text(p, "공간마다 다른 이야기를 담았습니다.", -1300, -480, 1400, 34, { color: p.muted }),
    ...frames.flatMap((frame, i) => [
      shape(frame.x, frame.y, frame.w, 420, "rgba(255,255,255,.12)", "rect"),
      text(p, "사진을 넣으세요", frame.x, frame.y + 190, frame.w, 26, { align: "center", color: p.muted }),
      title(p, ["거실", "주방", "침실", "욕실"][i], frame.x, frame.y + 460, frame.w, 44),
      text(p, "평형 · 스타일 · 시공 기간", frame.x, frame.y + 530, frame.w, 24, { color: p.muted }),
    ]),
  ]);
}

function lecture(): InfinityCanvas {
  const p = PALETTES.dusk;
  const chapters = [-760, 0, 760].map((cx, i) => ring(p, cx, 180, 300, `${i + 1}장`));
  const subs = chapters.flatMap((chapter) => [0.32, 0.68].map((fx, j) => ring(p, chapter.x + chapter.w * fx, chapter.y + chapter.h * 0.72, 62, `${chapter.title} - ${j + 1}`)));
  return canvas(p, [...chapters, ...subs], [
    title(p, "강의 제목", -700, -560, 1400, 100, { align: "center" }),
    text(p, "강사 이름 · 날짜", -700, -420, 1400, 34, { align: "center", color: p.muted }),
    ...chapters.flatMap((frame, i) => [
      title(p, `${i + 1}장`, frame.x + 80, frame.y + 120, frame.w - 160, 54, { align: "center" }),
      text(p, "이번 장에서 다룰 내용", frame.x + 80, frame.y + 200, frame.w - 160, 24, { align: "center", color: p.muted }),
    ]),
    ...subs.map((frame) => text(p, "소주제", frame.x, frame.y + frame.h * 0.4, frame.w, 18, { align: "center" })),
  ]);
}

function compare(): InfinityCanvas {
  const p = PALETTES.paper;
  const left = ring(p, -520, 80, 420, "A안", "#ffffff");
  const right = ring(p, 520, 80, 420, "B안", "#ffffff");
  return canvas(p, [left, right], [
    title(p, "두 가지 안 비교", -800, -620, 1600, 96, { align: "center" }),
    text(p, "VS", -60, 30, 120, 60, { align: "center", bold: true, color: p.accent }),
    ...[left, right].flatMap((frame) => [
      title(p, frame.title, frame.x + 120, frame.y + 170, frame.w - 240, 72, { align: "center" }),
      text(p, "• 장점\n• 단점\n• 예상 비용", frame.x + 220, frame.y + 330, frame.w - 440, 34, { color: p.muted }),
    ]),
  ]);
}

function agenda(): InfinityCanvas {
  const p = PALETTES.night;
  const items = ["지난 회의 확인", "현장 진행 상황", "예산 검토", "결정할 사항", "다음 일정"];
  const frames = items.map((name, i) => box(p, 0, -620 + i * 280, 1300, 230, name, "rgba(255,255,255,.05)"));
  return canvas(p, frames, [
    title(p, "회의 안건", -1100, -620, 900, 110),
    text(p, "2026. 11. 10 · 회의실", -1100, -470, 900, 34, { color: p.muted }),
    ...frames.flatMap((frame, i) => [
      text(p, String(i + 1).padStart(2, "0"), frame.x + 50, frame.y + 70, 140, 70, { bold: true, color: p.accent }),
      title(p, frame.title, frame.x + 220, frame.y + 60, 900, 48),
      text(p, "담당 · 시간", frame.x + 220, frame.y + 135, 900, 24, { color: p.muted }),
    ]),
  ]);
}

function blank(): InfinityCanvas {
  const p = PALETTES.mist;
  const frame = ring(p, 0, 0, 300, "첫 프레임");
  return canvas(p, [frame], [title(p, "제목", -700, -520, 1400, 90, { align: "center" }), ...label(p, frame, "첫 프레임", "더블클릭해 입력")]);
}


/** A big number in a ring with a short name under it, as numbered topic rings. */
const numbered = (p: Palette, frame: InfinityFrame, n: number, name = ""): TextElement[] => [
  title(p, String(n), frame.x, frame.y + frame.h * 0.26, frame.w, frame.h * 0.34, { align: "center" }),
  ...(name ? [text(p, name, frame.x + frame.w * 0.15, frame.y + frame.h * 0.66, frame.w * 0.7, frame.h * 0.08, { align: "center", color: p.muted })] : []),
];

function explain(): InfinityCanvas {
  const p = PALETTES.dusk;
  const centre = ring(p, 0, 0, 300, "주제");
  const around = [ring(p, -420, -330, 140, "첫째"), ring(p, -560, 300, 170, "둘째"), ring(p, 640, 260, 190, "셋째"), ring(p, 480, -350, 120, "넷째")];
  return canvas(p, [centre, ...around], [
    title(p, "주제 설명하기", -620, -90, 1240, 120, { align: "center" }),
    ...around.flatMap((frame, i) => numbered(p, frame, i + 1, "더블클릭해 입력")),
    line(-300, -230, -330, -250, p.ink, 5, true), line(-280, 140, -380, 220, p.ink, 5, true), line(300, 100, 470, 170, p.ink, 5, true), line(280, -200, 370, -270, p.ink, 5, true),
  ]);
}

function radial(): InfinityCanvas {
  const p = PALETTES.paper;
  const centre = ring(p, 0, 0, 200, "중심", "#ffffff");
  const count = 8;
  const around = Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
    return { frame: ring(p, Math.cos(angle) * 620, Math.sin(angle) * 620, 110, `${i + 2}번`), angle };
  });
  return canvas(p, [centre, ...around.map((a) => a.frame)], [
    title(p, "한눈에 보는 여덟 가지", -1500, -780, 1100, 92),
    ...numbered(p, centre, 1, "핵심"),
    ...around.flatMap(({ frame, angle }, i) => [line(Math.cos(angle) * 210, Math.sin(angle) * 210, Math.cos(angle) * 500, Math.sin(angle) * 500, p.stroke, 3), ...numbered(p, frame, i + 2)]),
  ]);
}

function ascend(): InfinityCanvas {
  const p = PALETTES.mist;
  const sizes = [90, 120, 150, 185];
  const frames = sizes.map((r, i) => ring(p, -700 + i * 470, 380 - i * 300, r, `${i + 1}단계`, "#ffffff"));
  return canvas(p, frames, [
    title(p, "구름 위로", -900, 540, 1400, 110),
    text(p, "작은 목표에서 큰 목표로 올라갑니다.", -900, 690, 1300, 34, { color: p.muted }),
    ...frames.flatMap((frame, i) => numbered(p, frame, i + 1)),
    ...frames.slice(0, -1).map((frame, i) => line(frame.x + frame.w, frame.y + frame.h * 0.3, frames[i + 1].x, frames[i + 1].y + frames[i + 1].h * 0.6, p.accent, 5, true)),
  ]);
}

function nodes(): InfinityCanvas {
  const p = PALETTES.ocean;
  const points = [[0, 0, 130], [-520, -160, 90], [-640, 220, 80], [-180, 420, 100], [520, -260, 110], [760, -560, 70], [960, -300, 70], [380, 380, 120]] as const;
  const frames = points.map(([x, y, r], i) => ring(p, x, y, r, `${i + 1}번`, "#ffffff"));
  const links = [[0, 1], [1, 2], [0, 3], [0, 4], [4, 5], [4, 6], [0, 7]];
  return canvas(p, frames, [
    shape(80, -60, 620, 150, "#0b1a20"),
    title(p, "노드", 120, -40, 560, 96, { color: "#ffffff" }),
    ...links.map(([a, b]) => line(points[a][0], points[a][1], points[b][0], points[b][1], p.accent, 4)),
    ...frames.flatMap((frame, i) => numbered(p, frame, i + 1).map((item) => ({ ...item, color: "#203a43" }))),
  ]);
}

function orbit(): InfinityCanvas {
  const p = PALETTES.night;
  const count = 6;
  const frames = Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
    const radius = 520 + (i % 2) * 160;
    return ring(p, Math.cos(angle) * radius, Math.sin(angle) * radius * 0.82, 90 + (i % 3) * 25, `${i + 1}번`, "#ffffff");
  });
  return canvas(p, frames, [
    shape(-180, -180, 360, 360, "#e2b35c", "circle", { shadow: true }),
    shape(-300, -300, 600, 600, "#e2b35c", "circle", { opacity: 0.14 }),
    title(p, "인피니티", -1400, 520, 900, 120),
    ...frames.flatMap((frame, i) => numbered(p, frame, i + 1).map((item) => ({ ...item, color: "#1b1f3b" }))),
  ]);
}

/** 빈 캔버스: a white canvas with just a title, like starting from nothing. */
export function emptyCanvas(): InfinityCanvas {
  const p: Palette = { bg: "#ffffff", image: "", ink: "#16181d", muted: "#4a4f5c", stroke: "#16181d", accent: "#16181d" };
  return { background: "#ffffff", parallax: false, ratio: "16:9", frames: [], elements: [
    title(p, "제목을 입력하세요", -700, -90, 1400, 110, { align: "center" }),
    text(p, "부제를 입력하세요", -500, 60, 1000, 34, { align: "center", bold: true }),
  ] };
}

export const INFINITY_TEMPLATES: InfinityTemplate[] = [
  { id: "explain", name: "주제 설명하기", category: "기본", description: "가운데 주제와 번호 붙은 원들", build: explain },
  { id: "planets", name: "원으로 확대", category: "기본", description: "가운데 주제와 주변 원들", build: planets },
  { id: "radial", name: "방사형", category: "기본", description: "중심에서 여덟 방향으로", build: radial },
  { id: "ascend", name: "구름 위로", category: "비즈니스", description: "작은 목표에서 큰 목표로", build: ascend },
  { id: "nodes", name: "노드", category: "기획·보고", description: "선으로 이어진 번호 원", build: nodes },
  { id: "orbit", name: "인피니티", category: "기본", description: "중심을 도는 궤도", build: orbit },
  { id: "blank", name: "단순한 시작", category: "기본", description: "프레임 하나에서 시작", build: blank },
  { id: "timeline", name: "공정 타임라인", category: "기획·보고", description: "단계를 시간 순으로", build: timeline },
  { id: "steps", name: "네 단계 계단", category: "비즈니스", description: "목표까지 올라가는 단계", build: steps },
  { id: "mindmap", name: "마인드맵", category: "기획·보고", description: "중심에서 뻗는 생각", build: mindmap },
  { id: "drilldown", name: "핵심으로 확대", category: "비즈니스", description: "큰 그림에서 핵심까지", build: drilldown },
  { id: "report", name: "현황 보고", category: "기획·보고", description: "현황 · 성과 · 이슈 · 다음 단계", build: report },
  { id: "compare", name: "두 안 비교", category: "비즈니스", description: "A안과 B안을 나란히", build: compare },
  { id: "agenda", name: "회의 안건", category: "비즈니스", description: "안건을 차례로", build: agenda },
  { id: "lecture", name: "강의", category: "교육", description: "장마다 소주제로 확대", build: lecture },
  { id: "portfolio", name: "포트폴리오", category: "포트폴리오", description: "공간별 작업 사진", build: portfolio },
];
