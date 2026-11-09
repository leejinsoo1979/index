import type { BookElement, BookPage, Flipbook, TextElement } from "../lib/flipbooks";
import type { BookTemplate, TemplateCategory } from "./book-templates";

/**
 * Modern magazine templates: bold sans titles, pale oversized numbers, sideways headings and photo
 * mosaics. Text and photos are always separate objects in separate areas, so each can be replaced.
 */
type Theme = { paper: string; ink: string; muted: string; ghost: string; accent: string; deep: string; deepInk: string };

const terracotta: Theme = { paper: "#ffffff", ink: "#1b1a18", muted: "#837d76", ghost: "#dedbd6", accent: "#b45f3e", deep: "#a9583a", deepInk: "#fbf3ec" };
const graphite: Theme = { paper: "#f5f4f0", ink: "#121312", muted: "#777871", ghost: "#d9d8d2", accent: "#121312", deep: "#161716", deepInk: "#f3f1ea" };
const sage: Theme = { paper: "#fbfaf6", ink: "#20261f", muted: "#7b8176", ghost: "#dfe1d8", accent: "#5c6b52", deep: "#3f4c39", deepInk: "#f1f1e6" };

const PAGE_W = 794;
const PAGE_H = 1123;
const display = "'Montserrat'";
const body = "'Noto Sans KR'";

const COPY = "창을 크게 열고 벽의 선을 줄이자 집 안의 시간이 달라졌다. 아침의 빛은 바닥을 따라 천천히 번지고, 오후가 되면 낮은 가구의 그림자가 길어진다. 재료는 몇 가지로 줄이고 질감은 손끝에 남도록 골랐다.";
const COPY2 = "좋은 공간은 처음 들어섰을 때보다 오래 머물수록 또렷해진다. 수납은 벽 안으로 숨기고, 자주 쓰는 물건만 손이 닿는 곳에 둔다. 조명은 천장보다 눈높이에 가깝게 내려 저녁의 온도를 낮췄다.";
const COPY3 = "여백은 비어 있는 곳이 아니라 다음 장면을 위해 남겨 둔 자리다. 색은 흙과 나무에서 가져왔고, 벽과 천장은 같은 톤으로 이어 경계를 지웠다.";

let serial = 0;
const id = () => `mod-${++serial}`;

type Photo = "living" | "dining" | "chair" | "detail" | "bedroom" | "moody";
const src = (key: Photo) => `/book-templates/editorial/${key}.jpg`;

function photo(key: Photo, x: number, y: number, w: number, h: number, crop: { zoom?: number; focusX?: number; focusY?: number } = {}): BookElement {
  return { id: id(), type: "image", src: src(key), fit: "cover", x, y, w, h, actions: [], ...crop };
}
function text(value: string, x: number, y: number, w: number, h: number, size: number, color: string, extra: Partial<TextElement> = {}): BookElement {
  return { id: id(), type: "text", text: value, x, y, w, h, size, color, bold: false, align: "left", font: body, lineHeight: 1.7, actions: [], ...extra };
}
const title = (value: string, x: number, y: number, w: number, h: number, size: number, color: string, extra: Partial<TextElement> = {}) => text(value, x, y, w, h, size, color, { font: display, bold: true, lineHeight: 1.08, spacing: -15, ...extra });
const small = (value: string, x: number, y: number, w: number, color: string) => text(value, x, y, w, 2.2, 13, color, { font: display, bold: true, spacing: 170, lineHeight: 1.2, textCase: "upper" });
const ghost = (value: string, x: number, y: number, w: number, h: number, size: number, t: Theme, extra: Partial<TextElement> = {}) => title(value, x, y, w, h, size, t.ghost, { spacing: -30, ...extra });
const rule = (x: number, y: number, w: number, h: number, fill: string): BookElement => ({ id: id(), type: "shape", shape: "rect", fill, x, y, w, h, actions: [] });

/** A heading read from bottom to top, centred at (cx, cy) in page percent; length is along the page height. */
function sideways(value: string, cx: number, cy: number, length: number, thickness: number, size: number, color: string): BookElement {
  const w = ((length / 100) * PAGE_H / PAGE_W) * 100;
  const h = ((thickness / 100) * PAGE_W / PAGE_H) * 100;
  return { ...title(value, cx - w / 2, cy - h / 2, w, h, size, color, { lineHeight: 1.05 }), rotation: 270 } as BookElement;
}

const page = (name: string, t: Theme, elements: BookElement[], background = t.paper): BookPage => ({ id: id(), title: name, background, elements });
const folio = (n: string, right: boolean, t: Theme) => text(n, right ? 82 : 8, 95, 10, 2.2, 13, t.muted, { font: display, bold: true, align: right ? "right" : "left", lineHeight: 1.2 });

function buildPages(t: Theme, name: string[], label: string): BookPage[] {
  const cover = page("표지", t, [
    small(label, 8, 6, 60, t.muted),
    text("VOL. 01", 72, 6, 20, 2.2, 13, t.muted, { font: display, bold: true, align: "right", lineHeight: 1.2 }),
    title(name.join("\n"), 8, 12, 84, 26, 128, t.ink),
    rule(8, 41, 10, 0.3, t.ink),
    text("공간과 재료, 그리고 그 안의 하루를 기록하는 인테리어 매거진", 8, 43.5, 46, 7, 24, t.muted),
    photo("living", 30, 55, 70, 45),
  ]);

  const introL = page("들어가며", t, [
    small("Editor's Note", 8, 7, 50, t.muted),
    title("Intro\nduction", 8, 12, 60, 16, 92, t.ink),
    rule(82, 12, 0.25, 14, t.ink),
    text(COPY, 8, 62, 40, 30, 21, t.ink),
    text(COPY2, 52, 62, 40, 30, 21, t.ink),
    folio("02", false, t),
  ]);
  const introR = page("작업실", t, [
    ghost("01", 62, 2, 32, 13.5, 150, t, { align: "right" }),
    photo("detail", 8, 16, 62, 58),
    sideways("Head Office", 82, 45, 44, 9, 54, t.ink),
    title("머무는 집", 8, 78, 60, 5, 42, t.ink, { font: body, spacing: -5 }),
    text("재료를 줄일수록 빛이 많은 말을 한다.", 8, 85, 60, 3, 20, t.muted),
    folio("03", true, t),
  ]);

  const contentsL = page("이미지", t, [photo("bedroom", 0, 0, 42, 100), small("Table of", 50, 8, 40, t.muted), title("Con\ntents", 50, 12, 44, 15, 84, t.ink), text(COPY3, 50, 72, 42, 20, 20, t.muted), text("04", 50, 95, 10, 2.2, 13, t.muted, { font: display, bold: true, lineHeight: 1.2 })]);
  const contentsR = page("목차", t, [
    small("In this issue", 8, 8, 60, t.muted),
    ...[["Soft Tones", "06"], ["Weekend Look", "08"], ["Article.01", "10"], ["Object Study", "12"], ["Inspired", "14"]].flatMap(([label2, n], i) => [
      title(label2, 8, 16 + i * 14, 66, 5, 40, t.ink),
      text("여백과 재료, 빛이 만드는 장면", 8, 21.2 + i * 14, 66, 3, 18, t.muted),
      title(n, 80, 16 + i * 14, 12, 5, 40, t.accent, { align: "right" }),
      rule(8, 26 + i * 14, 84, 0.08, t.ghost),
    ]),
    folio("05", true, t),
  ]);

  const softL = page("소프트 톤", t, [
    photo("chair", 8, 8, 58, 62),
    rule(74, 8, 0.25, 14, t.ink),
    text("낮은 의자 하나가\n방의 중심이 된다.", 74, 24, 20, 12, 19, t.ink, { bold: true }),
    title("Architects", 8, 76, 60, 5, 46, t.ink),
    text(COPY3, 8, 83, 58, 10, 18, t.muted),
    folio("06", false, t),
  ]);
  const softR = page("소프트 톤 2", t, [
    ghost("02", 56, 60.5, 38, 15, 170, t, { align: "right" }),
    sideways("Soft Tones", 16, 40, 60, 12, 74, t.ink),
    photo("dining", 34, 8, 58, 50),
    text(COPY, 34, 76, 58, 16, 19, t.ink),
    folio("07", true, t),
  ]);

  const weekendL = page("주말", t, [ghost("03", 8, 1.5, 40, 15, 170, t), photo("moody", 8, 17, 84, 56), small("Beautiful Living", 8, 76, 60, t.muted), text(COPY2, 8, 80, 84, 12, 19, t.ink), folio("08", false, t)]);
  const weekendR = page("주말 2", t, [
    photo("detail", 8, 8, 40, 30, { zoom: 150, focusX: 30, focusY: 60 }),
    rule(56, 8, 0.25, 12, t.ink),
    text("손끝에 남는 재료만\n남겼다.", 60, 8, 32, 8, 19, t.ink, { bold: true }),
    title("Weekend\nLook", 8, 44, 84, 15, 88, t.ink),
    text(COPY, 8, 62, 40, 30, 19, t.ink),
    text(COPY3, 52, 62, 40, 30, 19, t.ink),
    folio("09", true, t),
  ]);

  const sectionL = page("섹션", t, [title("Article.01", 8, 46, 44, 7, 58, t.ink), rule(54, 49.5, 22, 0.12, t.ink), ghost("01", 78, 42, 22, 13, 150, t), folio("10", false, t)]);
  const sectionR = page("모자이크", t, [
    photo("living", 8, 8, 40, 26, { zoom: 140, focusX: 20 }),
    photo("chair", 52, 8, 40, 42),
    photo("dining", 8, 38, 40, 40),
    photo("bedroom", 52, 54, 40, 24),
    title("Deco & Light", 8, 82, 60, 4.6, 40, t.ink),
    text("장면을 모아 하나의 분위기로 엮었다.", 8, 87.4, 60, 3, 18, t.muted),
    folio("11", true, t),
  ]);

  const panoramaL = page("파노라마", t, [small("Space Setup", 8, 6, 60, t.muted), title("One long\nroom.", 8, 10, 60, 13, 72, t.ink), photo("moody", 8, 30, 92, 62, { zoom: 200, focusX: 0 }), folio("12", false, t)]);
  const panoramaR = page("파노라마 2", t, [
    text(COPY3, 40, 10, 52, 14, 19, t.ink),
    photo("moody", 0, 30, 92, 62, { zoom: 200, focusX: 100 }),
    folio("13", true, t),
  ]);

  const objectL = page("오브제", t, [
    small("Object Study", 8, 6, 60, t.muted),
    title("Five\nobjects.", 8, 10, 60, 13, 72, t.ink),
    photo("chair", 24, 32, 52, 40),
    ...[["1", "낮은 등받이", 8, 32], ["2", "나무결 다리", 80, 32], ["3", "면 패브릭", 8, 62], ["4", "둥근 팔걸이", 80, 62]].flatMap(([n, label2, x, y]) => [title(n as string, x as number, y as number, 14, 4, 34, t.accent), text(label2 as string, x as number, (y as number) + 4.4, 14, 5, 16, t.ink, { lineHeight: 1.4 })]),
    text(COPY3, 24, 76, 52, 14, 18, t.muted),
    folio("14", false, t),
  ]);
  const quoteR = page("인용", t, [
    small("Words", 10, 8, 60, t.deepInk),
    title("빛이 먼저\n들어오고,\n사람이\n따라온다.", 10, 30, 80, 38, 100, t.deepInk, { font: body, lineHeight: 1.22, spacing: -30 }),
    rule(10, 72, 12, 0.3, t.deepInk),
    text("INDEX 편집부", 10, 74.5, 60, 3, 20, t.deepInk),
    folio("15", true, { ...t, muted: t.deepInk }),
  ], t.deep);

  const stripsL = page("세 장면", t, [
    photo("bedroom", 8, 8, 26, 66),
    photo("living", 37, 8, 26, 66, { zoom: 130, focusX: 40 }),
    photo("dining", 66, 8, 26, 66),
    title("Inspired", 8, 78, 60, 5, 46, t.ink),
    text("같은 집의 세 시간대를 나란히 두었다.", 8, 85, 80, 3, 19, t.muted),
    folio("16", false, t),
  ]);
  const articleR = page("본문", t, [
    small("Interior Editorial", 8, 7, 60, t.muted),
    rule(70, 8, 22, 0.12, t.ink),
    title("Article.02", 8, 11, 84, 7, 58, t.ink),
    text(`${COPY}\n\n${COPY2}\n\n${COPY3}`, 8, 22, 40, 70, 19, t.ink, { lineHeight: 1.85 }),
    text(`${COPY2}\n\n${COPY3}\n\n${COPY}`, 52, 22, 40, 70, 19, t.ink, { lineHeight: 1.85 }),
    folio("17", true, t),
  ]);

  const back = page("뒤표지", t, [
    photo("detail", 0, 0, 100, 58),
    title(name.join(" "), 8, 66, 84, 6, 44, t.ink),
    rule(8, 74, 10, 0.3, t.ink),
    text("hello@index.kr\nwww.index.kr", 8, 77, 60, 8, 21, t.muted),
  ]);

  const pages = [cover, introL, introR, contentsL, contentsR, softL, softR, weekendL, weekendR, sectionL, sectionR, panoramaL, panoramaR, objectL, quoteR, stripsL, articleR, back];
  // Contents rows jump to their chapters; the ids are remapped when the template is applied.
  [["Soft Tones", 5], ["Weekend Look", 7], ["Article.01", 9], ["Object Study", 13], ["Inspired", 15]].forEach(([label2, target]) => {
    const row = contentsR.elements.find((element) => element.type === "text" && element.text === label2);
    if (row) row.actions = [{ kind: "page", pageId: pages[target as number].id }];
  });
  return pages;
}

function make(templateId: string, label: string, subtitle: string, category: TemplateCategory, theme: Theme, nameWords: string[], tag: string): BookTemplate {
  const book: Flipbook = { id: templateId, title: label, width: PAGE_W, height: PAGE_H, background: "#1d2026", pages: buildPages(theme, nameWords, tag), assets: [], published: false, createdAt: 0, updatedAt: 0 };
  return { id: templateId, name: label, subtitle, category, palette: [theme.paper, theme.ink, theme.accent], book };
}

export const MODERN_TEMPLATES: BookTemplate[] = [
  make("modern-terracotta", "모던 테라코타", "큰 번호와 세로 제목의 18쪽 매거진", "interior", terracotta, ["Form", "& Light"], "Interior Magazine"),
  make("modern-graphite", "모던 그래파이트", "흑백 대비가 강한 18쪽 포트폴리오", "portfolio", graphite, ["Selected", "Spaces"], "Studio Portfolio"),
  make("modern-sage", "모던 세이지", "차분한 녹색 톤의 18쪽 가구 카탈로그", "furniture", sage, ["Quiet", "Objects"], "Furniture Catalogue"),
];
