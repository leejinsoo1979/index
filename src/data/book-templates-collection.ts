import type { BookElement, BookPage, Flipbook, TextElement } from "../lib/flipbooks";
import type { BookTemplate, TemplateCategory } from "./book-templates";

/**
 * Starting books for every kind of publication: each is ordinary text, image and shape objects
 * in separate areas, so anything can be swapped. Sample copy is placeholder for the user's own.
 */
type Theme = { paper: string; ink: string; muted: string; soft: string; accent: string; deep: string; onDeep: string };
const THEMES = {
  clay: { paper: "#ffffff", ink: "#1c1a18", muted: "#857e76", soft: "#ece7e1", accent: "#b45f3e", deep: "#a9583a", onDeep: "#fbf3ec" },
  ink: { paper: "#f5f4f0", ink: "#121312", muted: "#74756f", soft: "#e2e1da", accent: "#121312", deep: "#171817", onDeep: "#f3f1ea" },
  sage: { paper: "#fbfaf6", ink: "#20261f", muted: "#7b8176", soft: "#e4e6db", accent: "#5c6b52", deep: "#3f4c39", onDeep: "#f1f1e6" },
  blue: { paper: "#ffffff", ink: "#14202e", muted: "#6d7a89", soft: "#e4ebf3", accent: "#2f5fa8", deep: "#1f3a63", onDeep: "#eef3f9" },
  sand: { paper: "#f6f0e6", ink: "#2c261e", muted: "#857a68", soft: "#e8dfcf", accent: "#9a7443", deep: "#5b4a33", onDeep: "#f6f0e6" },
} satisfies Record<string, Theme>;

const LOREM = "빛과 재료, 동선을 먼저 살피고 꼭 필요한 것만 남겼습니다. 이 자리에 소개할 내용을 적어 주세요.";
const LOREM2 = "공간의 쓰임과 사람의 습관을 함께 봅니다. 사진과 글은 모두 따로 선택해서 바꿀 수 있습니다.";

let serial = 0;
const id = () => `col-${++serial}`;
type Photo = "living" | "dining" | "chair" | "detail" | "bedroom" | "moody" | "white-loft" | "concrete-house" | "terracotta-objects" | "chrome-chair" | "city-kitchen" | "green-bath";
const display = "'Montserrat'";
const sans = "'Noto Sans KR'";

const P = (key: Photo, x: number, y: number, w: number, h: number): BookElement => ({ id: id(), type: "image", src: `/book-templates/editorial/${key}.jpg`, fit: "cover", x, y, w, h, actions: [] });
const T = (value: string, x: number, y: number, w: number, h: number, size: number, color: string, extra: Partial<TextElement> = {}): BookElement => ({ id: id(), type: "text", text: value, x, y, w, h, size, color, bold: false, align: "left", font: sans, lineHeight: 1.65, actions: [], ...extra });
const H = (value: string, x: number, y: number, w: number, h: number, size: number, color: string, extra: Partial<TextElement> = {}) => T(value, x, y, w, h, size, color, { bold: true, lineHeight: 1.15, spacing: -10, ...extra });
const L = (value: string, x: number, y: number, w: number, color: string, h = 2.4) => T(value, x, y, w, h, 13, color, { font: display, bold: true, spacing: 150, lineHeight: 1.2, textCase: "upper" });
const R = (x: number, y: number, w: number, h: number, fill: string): BookElement => ({ id: id(), type: "shape", shape: "rect", fill, x, y, w, h, actions: [] });
const C = (x: number, y: number, w: number, h: number, fill: string): BookElement => ({ id: id(), type: "shape", shape: "circle", fill, x, y, w, h, actions: [] });
const page = (title: string, t: Theme, elements: BookElement[], background = t.paper): BookPage => ({ id: id(), title, background, elements });
const tableEl = (x: number, y: number, w: number, h: number, t: Theme, rows: string[][], size = 22): BookElement => ({ id: id(), type: "table", rows, size, color: t.ink, headerColor: t.accent, x, y, w, h, actions: [] });
const chart = (x: number, y: number, w: number, h: number, t: Theme): BookElement => ({ id: id(), type: "chart", kind: "bar", labels: ["1분기", "2분기", "3분기", "4분기"], values: [18, 26, 31, 42], color: t.accent, textColor: t.ink, x, y, w, h, actions: [] });
const toc = (x: number, y: number, w: number, h: number, t: Theme): BookElement => ({ id: id(), type: "toc", size: 26, color: t.ink, x, y, w, h, actions: [] });

/* Page patterns shared by the portrait kinds */
const coverSplit = (t: Theme, kicker: string, title: string, sub: string, key: Photo) => page("표지", t, [L(kicker, 8, 6, 80, t.muted), H(title, 8, 11, 84, 22, 104, t.ink), T(sub, 8, 35, 70, 7, 24, t.muted), P(key, 0, 46, 100, 54)]);
const coverPanel = (t: Theme, kicker: string, title: string, sub: string, key: Photo) => page("표지", t, [P(key, 0, 0, 56, 100), L(kicker, 62, 8, 34, t.onDeep, 5), H(title, 62, 38, 34, 26, 62, t.onDeep), R(62, 66, 8, 0.3, t.onDeep), T(sub, 62, 68, 34, 14, 20, t.onDeep)], t.deep);
const coverType = (t: Theme, kicker: string, title: string, sub: string) => page("표지", t, [L(kicker, 10, 8, 80, t.onDeep), H(title, 10, 36, 80, 30, 112, t.onDeep), R(10, 68, 12, 0.3, t.onDeep), T(sub, 10, 71, 76, 8, 24, t.onDeep)], t.deep);
const textPage = (t: Theme, title: string, heading: string) => page(title, t, [L(title, 8, 7, 80, t.muted), H(heading, 8, 11, 84, 12, 62, t.ink), T(`${LOREM}\n\n${LOREM2}\n\n${LOREM}`, 8, 28, 40, 62, 21, t.ink), T(`${LOREM2}\n\n${LOREM}\n\n${LOREM2}`, 52, 28, 40, 62, 21, t.ink)]);
const photoTop = (t: Theme, title: string, heading: string, key: Photo) => page(title, t, [P(key, 0, 0, 100, 56), H(heading, 8, 61, 84, 7, 54, t.ink), T(`${LOREM} ${LOREM2}`, 8, 70, 84, 18, 22, t.muted)]);
const photoFull = (t: Theme, title: string, key: Photo, caption: string) => page(title, t, [P(key, 6, 6, 88, 80), T(caption, 6, 89, 88, 5, 20, t.muted)]);
const twoUp = (t: Theme, title: string, a: Photo, b: Photo, caption: string) => page(title, t, [P(a, 8, 8, 40, 66), P(b, 52, 8, 40, 66), H(title, 8, 78, 84, 5, 42, t.ink), T(caption, 8, 85, 84, 8, 20, t.muted)]);
const threeUp = (t: Theme, title: string, keys: [Photo, Photo, Photo]) => page(title, t, [H(title, 8, 7, 84, 7, 54, t.ink), P(keys[0], 8, 17, 84, 36), P(keys[1], 8, 55, 41, 28), P(keys[2], 51, 55, 41, 28), T(LOREM, 8, 86, 84, 8, 19, t.muted)]);
const steps = (t: Theme, title: string, items: string[]) => page(title, t, [L(title, 8, 7, 80, t.muted), H(title, 8, 11, 84, 7, 58, t.ink), ...items.flatMap((item, i) => [H(String(i + 1).padStart(2, "0"), 8, 23 + i * (68 / items.length), 14, 6, 50, t.accent), H(item, 24, 23.4 + i * (68 / items.length), 68, 3.6, 28, t.ink), T(LOREM2, 24, 27.4 + i * (68 / items.length), 68, 7, 18, t.muted)])]);
const checklist = (t: Theme, title: string, items: string[]) => page(title, t, [H(title, 8, 8, 84, 7, 58, t.ink), ...items.flatMap((item, i) => [R(8, 20.5 + i * 8.6, 3.2, (3.2 * 794) / 1123, t.soft), T(item, 14, 20 + i * 8.6, 78, 3.6, 24, t.ink, { lineHeight: 1.3 }), R(8, 25.4 + i * 8.6, 84, 0.08, t.soft)])]);
const tablePage = (t: Theme, title: string, rows: string[][]) => page(title, t, [H(title, 8, 8, 84, 7, 58, t.ink), T(LOREM2, 8, 16, 84, 6, 20, t.muted), tableEl(8, 25, 84, 40, t, rows), T("표의 칸은 오른쪽 설정에서 고칠 수 있습니다.", 8, 68, 84, 3, 18, t.muted)]);
const contents = (t: Theme, title: string) => page("목차", t, [L("Contents", 8, 7, 80, t.muted), H(title, 8, 11, 84, 7, 58, t.ink), toc(8, 22, 84, 66, t)]);
const closing = (t: Theme, line: string) => page("뒤표지", t, [H(line, 10, 40, 80, 14, 72, t.onDeep), R(10, 56, 12, 0.3, t.onDeep), T("대표 전화 02-000-0000\nhello@index.kr", 10, 59, 76, 8, 22, t.onDeep)], t.deep);

/* Kinds with their own structure */
const flyer = (t: Theme): BookPage[] => [
  page("앞면", t, [R(0, 0, 100, 34, t.deep), L("Open House", 8, 5, 60, t.onDeep), H("집을 여는\n주말", 8, 9, 84, 22, 104, t.onDeep), P("living", 8, 38, 84, 40), H("2026. 12. 05 — 12. 06", 8, 81, 84, 4, 34, t.ink), T("서울시 ○○구 ○○로 00  |  사전 예약 02-000-0000", 8, 87, 84, 4, 21, t.muted)]),
  page("뒷면", t, [H("현장에서 볼 수 있는 것", 8, 8, 84, 6, 50, t.ink), ...["완공 현장 투어", "자재 샘플 체험", "1:1 설계 상담"].flatMap((item, i) => [C(8, 20 + i * 18, 11, (11 * 794) / 1123, t.accent), H(String(i + 1), 8, 21.6 + i * 18, 11, 4.4, 32, "#ffffff", { align: "center" }), H(item, 24, 20.4 + i * 18, 68, 4, 32, t.ink), T(LOREM2, 24, 25 + i * 18, 68, 9, 19, t.muted)]), P("detail", 8, 74, 84, 20)]),
];
const newsletter = (t: Theme): BookPage[] => [
  page("1면", t, [R(0, 0, 100, 12, t.deep), H("INDEX 소식", 6, 3.4, 60, 6, 56, t.onDeep), T("2026 겨울호", 68, 5, 26, 3, 20, t.onDeep, { align: "right" }), H("이달의 주요 소식을 적어 주세요", 6, 16, 88, 6, 50, t.ink), P("dining", 6, 25, 56, 36), T(`${LOREM}\n\n${LOREM2}`, 65, 25, 29, 36, 19, t.ink), R(6, 64, 88, 0.1, t.soft), ...[0, 1, 2].flatMap((i) => [H(`소식 ${i + 1}`, 6 + i * 30.5, 67, 27, 3.4, 28, t.ink), T(LOREM, 6 + i * 30.5, 71.5, 27, 22, 18, t.muted)])]),
  page("2면", t, [L("Member News", 6, 5, 60, t.muted), H("회원 소식", 6, 9, 88, 6, 50, t.ink), P("chair", 6, 18, 42, 34), T(`${LOREM}\n\n${LOREM2}`, 52, 18, 42, 34, 19, t.ink), tableEl(6, 57, 88, 24, t, [["일정", "행사", "장소"], ["12월 5일", "세미나", "서울"], ["12월 19일", "현장 투어", "경기"]], 20), T("문의 hello@index.kr", 6, 86, 88, 3, 19, t.muted)]),
];
const newspaper = (t: Theme): BookPage[] => [
  page("1면", t, [T("제 1호  |  2026년 12월", 5, 3, 90, 2.4, 16, t.muted, { align: "center", lineHeight: 1.2 }), H("THE INDEX TIMES", 5, 6, 90, 7, 84, t.ink, { font: display, align: "center" }), R(5, 14, 90, 0.3, t.ink), H("머리기사 제목을 이곳에 적어 주세요", 5, 16, 90, 5.4, 52, t.ink, { align: "center" }), P("moody", 5, 24, 58, 34), T("사진 설명", 5, 58.6, 58, 2.4, 16, t.muted, { lineHeight: 1.2 }), T(`${LOREM}\n\n${LOREM2}\n\n${LOREM}`, 66, 24, 29, 37, 18, t.ink), R(5, 63, 90, 0.12, t.ink), ...[0, 1, 2, 3].flatMap((i) => [H(`기사 ${i + 1}`, 5 + i * 23, 65, 21, 3.2, 26, t.ink), T(`${LOREM} ${LOREM2}`, 5 + i * 23, 69, 21, 26, 16, t.ink)])]),
  page("2면", t, [L("Opinion", 5, 4, 60, t.muted), H("오피니언", 5, 7, 90, 5, 46, t.ink), R(5, 13, 90, 0.2, t.ink), ...[0, 1, 2].flatMap((i) => [H(`칼럼 ${i + 1}`, 5 + i * 31, 15, 28, 3.2, 28, t.ink), T(`${LOREM}\n\n${LOREM2}\n\n${LOREM}`, 5 + i * 31, 19.5, 28, 40, 17, t.ink)]), P("living", 5, 63, 44, 32), H("현장 사진", 52, 63, 43, 4, 34, t.ink), T(`${LOREM} ${LOREM2}`, 52, 68, 43, 26, 18, t.muted)]),
];
const moodboard = (t: Theme, title: string): BookPage[] => {
  const swatches = (y: number, colours: string[]) => colours.flatMap((colour, i) => [C(62 + i * 9.2, y, 7.6, (7.6 * 1123) / 794, colour)]);
  return [
    page("무드 1", t, [H(title, 4, 6, 50, 11, 56, t.ink), T("따뜻한 흙빛과 낮은 조도, 손에 닿는 재료", 4, 19, 50, 8, 20, t.muted), P("living", 4, 30, 26, 64), P("detail", 31, 30, 24, 31), P("chair", 31, 63, 24, 31), P("moody", 57, 6, 39, 44), L("Palette", 62, 55, 30, t.muted, 3.4), ...swatches(60, [t.deep, t.accent, t.muted, t.soft]), L("Keywords", 62, 78, 30, t.muted, 3.4), T("나무결  /  석회 질감  /  간접광\n낮은 가구  /  리넨", 62, 83, 34, 11, 20, t.ink)]),
    page("무드 2", t, [P("bedroom", 4, 6, 30, 88), P("dining", 36, 6, 30, 42), P("detail", 36, 50, 30, 44), H("재료와 색", 69, 6, 28, 8, 40, t.ink), T(LOREM, 69, 16, 27, 24, 18, t.muted), ...[t.deep, t.accent, t.soft].map((colour, i) => R(69, 44 + i * 17, 27, 15, colour))]),
  ];
};
const deck = (t: Theme): BookPage[] => [
  page("제목", t, [L("Proposal 2026", 6, 10, 60, t.onDeep, 4), H("공간 제안서", 6, 34, 56, 22, 92, t.onDeep), T("프로젝트 이름과 날짜를 적어 주세요", 6, 60, 56, 7, 26, t.onDeep), P("living", 66, 0, 34, 100)], t.deep),
  page("순서", t, [H("오늘의 순서", 6, 9, 88, 16, 62, t.ink), ...["현장 분석", "설계 방향", "자재 제안", "일정과 비용"].flatMap((item, i) => [H(String(i + 1).padStart(2, "0"), 6 + i * 23, 38, 20, 17, 76, t.accent), H(item, 6 + i * 23, 56, 20, 8, 30, t.ink), T(LOREM2, 6 + i * 23, 65, 20, 26, 17, t.muted)])]),
  page("핵심", t, [H("핵심 메시지를\n한 문장으로.", 8, 28, 84, 44, 96, t.onDeep)], t.deep),
  page("사진과 요점", t, [P("dining", 0, 0, 50, 100), H("설계 방향", 55, 10, 40, 16, 56, t.ink), ...["자연광을 깊게 끌어들입니다", "수납은 벽 안으로 넣습니다", "재료는 세 가지로 줄입니다"].flatMap((item, i) => [R(55, 33 + i * 18, 2, 3, t.accent), T(item, 59, 30 + i * 18, 36, 11, 24, t.ink)])]),
  page("수치", t, [H("일정과 비용", 6, 8, 40, 12, 56, t.ink), T(LOREM, 6, 26, 34, 40, 21, t.muted), chart(44, 12, 50, 76, t)]),
  page("마무리", t, [H("감사합니다", 8, 32, 84, 27, 96, t.onDeep), T("hello@index.kr", 8, 60, 84, 8, 28, t.onDeep)], t.deep),
];
const reportDeck = (t: Theme): BookPage[] => [
  page("표지",t,[L("Residential design proposal",6,8,56,t.muted,4),H("A better\nplace to live.",6,24,56,37,72,t.ink,{font:display}),T("생활에서 시작하는 공간 제안\n프로젝트명 · 작성일",6,77,56,14,24,t.muted),P("white-loft",68,0,32,100)]),
  page("제안의 구성",t,[P("concrete-house",6,10,37,80),H("제안의 구성",50,10,44,15,56,t.ink),...["공간의 조건","설계의 방향","재료와 구현"].flatMap((s,i)=>[H(`0${i+1}`,50,34+i*19,10,9,42,t.accent),T(s,65,34+i*19,29,9,28,t.ink),R(50,48+i*19,44,.15,t.soft)])]),
  page("공간의 가능성",t,[P("city-kitchen",0,0,100,72),H("작은 공간, 다양한 생활",6,78,60,13,45,t.ink),T("동선과 수납, 식탁의 쓰임을 함께 계획합니다.",69,80,25,12,20,t.muted)]),
  page("재료 제안",t,[L("Materials & finishes",6,7,88,t.muted,4),H("재료의 조합",6,16,88,13,54,t.ink),P("detail",6,39,27,48),P("green-bath",36.5,39,27,48),P("white-loft",67,39,27,48),T("01 원목",6,91,27,6,18,t.muted),T("02 석재",36.5,91,27,6,18,t.muted),T("03 미장",67,91,27,6,18,t.muted)]),
  page("진행 계획",t,[H("함께 완성하는 과정",6,10,88,16,55,t.ink),R(6,40,88,.2,t.accent),...["살피기","계획하기","만들기","살아가기"].flatMap((s,i)=>[H(`0${i+1}`,6+i*23,47,19,12,62,t.accent,{font:display}),T(s,6+i*23,65,19,10,25,t.ink,{bold:true}),T("일정과 주요 내용을\n입력하세요.",6+i*23,80,19,13,18,t.muted)])]),
  page("연락처",t,[H("Let’s make\nsomething good.",6,20,88,36,76,t.onDeep,{font:display}),R(6,71,88,.2,t.onDeep),T("YOUR STUDIO  /  연락처를 입력하세요",6,81,88,10,24,t.onDeep)],t.deep),
];
const products = (t: Theme, title: string, keys: Photo[]) => page(title, t, [H(title, 8, 7, 84, 7, 54, t.ink), ...keys.flatMap((key, i) => { const x = 8 + (i % 2) * 44; const y = 18 + Math.floor(i / 2) * 39; return [P(key, x, y, 40, 28), H(`제품 ${i + 1}`, x, y + 29, 26, 3.2, 26, t.ink), T("000,000원", x + 26, y + 29.3, 14, 3, 19, t.accent, { align: "right", lineHeight: 1.2 }), T("크기와 소재를 적어 주세요", x, y + 33, 40, 3, 17, t.muted, { lineHeight: 1.3 })]; })]);

const A4 = { width: 794, height: 1123 };
const A5 = { width: 560, height: 794 };
const SQUARE = { width: 800, height: 800 };
const WIDE = { width: 1280, height: 720 };
const LANDSCAPE = { width: 1123, height: 794 };

function make(key: string, name: string, subtitle: string, category: TemplateCategory, theme: Theme, size: { width: number; height: number }, pages: BookPage[]): BookTemplate {
  const images = [...new Set(pages.flatMap(p => p.elements.flatMap(e => e.type === "image" ? [e.src] : [])))];
  const book: Flipbook = { id: `col-${key}`, title: name, ...size, background: "#1d2026", pages, assets: images.map(url => ({ url, kind: "image" as const })), published: false, createdAt: 0, updatedAt: 0 };
  return { id: `col-${key}`, name, subtitle, category, palette: [theme.paper, theme.ink, theme.accent], book };
}
const { clay, ink, sage, blue, sand } = THEMES;

export const COLLECTION_TEMPLATES: BookTemplate[] = [
  make("brochure", "회사 소개 브로셔", "서비스와 사례를 담은 6쪽", "brochure", sage, A4, [coverPanel(sage, "Company Profile", "우리가\n짓는 집", "주거 실내건축 전문 스튜디오", "living"), textPage(sage, "About", "회사 소개"), steps(sage, "서비스", ["설계", "시공", "사후 관리"]), threeUp(sage, "대표 사례", ["dining", "bedroom", "detail"]), twoUp(sage, "고객 후기", "chair", "moody", LOREM), closing(sage, "함께 시작해요")]),
  make("flyer", "오픈 하우스 전단지", "앞뒤 2쪽 행사 안내", "flyer", clay, A4, flyer(clay)),
  make("flyer2", "디자인 전시 초대장", "가로형 타이포와 작품 사진 · 앞뒤 2쪽", "flyer", ink, LANDSCAPE, [page("초대장", ink, [P("chrome-chair", 0, 0, 48, 100), L("An invitation", 55, 8, 39, ink.ink), H("디자인을\n만나는\n주말", 55, 24, 39, 40, 64, ink.ink), R(55, 70, 39, .2, ink.ink), T("날짜 · 장소를 입력하세요\n사전 예약 · 연락처", 55, 77, 39, 17, 21, ink.muted)]), page("전시 안내", ink, [L("Exhibition notes", 6, 8, 88, ink.muted), H("Objects & people", 6, 18, 88, 13, 61, ink.ink, {font:display}), P("terracotta-objects", 6, 40, 38, 52), T("가구 한 점을 가까이 보고, 재료를 만지고, 만드는 사람의 이야기를 듣는 자리입니다.", 52, 43, 42, 26, 26, ink.ink), T("운영 시간과 프로그램, 찾아오는 길을 이곳에 적어 주세요.", 52, 77, 42, 15, 21, ink.muted)])]),
  make("album", "우리 집 사진 앨범", "사진 중심의 정사각 8쪽", "album", ink, SQUARE, [coverSplit(ink, "Photo Album", "우리 집", "2026년의 기록", "bedroom"), photoFull(ink, "거실", "living", "거실, 오후 네 시"), photoFull(ink, "주방", "dining", "저녁을 준비하는 시간"), twoUp(ink, "침실과 서재", "bedroom", "chair", "조용한 방들"), photoFull(ink, "밤", "moody", "불을 낮춘 밤"), photoFull(ink, "디테일", "detail", "손이 닿는 곳들"), twoUp(ink, "함께한 순간", "living", "dining", "기억하고 싶은 장면"), closing(ink, "다음 장면까지")]),
  make("flipbook", "기본 플립북", "무엇이든 시작하는 4쪽", "flipbook", blue, A4, [coverSplit(blue, "Flipbook", "제목을\n입력하세요", "부제를 입력하세요", "dining"), textPage(blue, "Chapter 1", "첫 번째 이야기"), photoTop(blue, "Chapter 2", "두 번째 이야기", "living"), closing(blue, "감사합니다")]),
  make("ebook", "실내건축 전자책", "목차와 장 구성의 8쪽", "ebook", sand, A5, [coverType(sand, "E-Book", "집을\n읽는 법", "주거 공간을 이해하는 여덟 가지 시선"), contents(sand, "차례"), coverType(sand, "Chapter 1", "빛", "공간의 첫 번째 재료"), textPage(sand, "1장", "빛이 드는 자리"), photoTop(sand, "2장", "재료의 표정", "detail"), textPage(sand, "3장", "동선과 습관"), photoTop(sand, "4장", "머무는 가구", "chair"), closing(sand, "읽어 주셔서 감사합니다")]),
  make("guide", "리모델링 가이드북", "처음 고객을 위한 6쪽 안내", "guide", clay, A4, [coverSplit(clay, "Remodeling Guide", "처음 하는\n리모델링", "계약부터 입주까지 한눈에", "detail"), contents(clay, "이 책의 순서"), steps(clay, "진행 순서", ["현장 실측", "설계와 견적", "공사", "입주와 사후 관리"]), tablePage(clay, "예상 비용", [["항목", "비율", "메모"], ["철거", "10%", ""], ["설비", "25%", ""], ["마감", "40%", ""], ["가구", "25%", ""]]), checklist(clay, "계약 전 확인", ["건설업 등록 여부", "견적서 항목별 금액", "공사 기간과 지체상금", "하자 보수 기간", "공사 신고·동의 여부"]), closing(clay, "궁금한 점은 언제든")]),
  make("manual", "시공 매뉴얼", "표준 절차를 담은 8쪽", "manual", blue, A4, [coverType(blue, "Construction Manual", "시공\n매뉴얼", "현장 표준 절차 · 버전 1.0"), contents(blue, "목차"), checklist(blue, "안전 수칙", ["작업 전 보호구 착용", "전기 차단 확인", "자재 적재 높이 준수", "환기 상태 점검", "작업 후 정리"]), steps(blue, "작업 순서", ["바탕 정리", "자재 재단", "시공", "양생과 검수"]), tablePage(blue, "규격과 허용 오차", [["항목", "기준", "허용 오차"], ["수평", "1m당", "±2mm"], ["줄눈", "3mm", "±0.5mm"], ["양생", "24시간", "이상"]]), photoTop(blue, "시공 사진", "올바른 예시", "detail"), checklist(blue, "완료 점검표", ["표면 상태", "이음부 마감", "작동 확인", "청소 완료", "사진 기록"]), closing(blue, "안전이 먼저입니다")]),
  make("newsletter", "협회 뉴스레터", "소식을 전하는 2쪽", "newsletter", sage, A4, newsletter(sage)),
  make("handbook", "신입 사원 핸드북", "A5 크기의 6쪽 안내", "handbook", ink, A5, [coverType(ink, "Handbook", "함께\n일하는 법", "처음 오신 분을 위한 안내"), textPage(ink, "우리의 원칙", "일하는 원칙"), steps(ink, "하루 일과", ["현장 확인", "공정 회의", "기록 정리"]), checklist(ink, "첫 주 할 일", ["계정 만들기", "안전 교육", "현장 방문", "담당자 인사"]), tablePage(ink, "연락처", [["부서", "담당", "내선"], ["설계", "", ""], ["시공", "", ""], ["경영", "", ""]]), closing(ink, "환영합니다")]),
  make("deck", "공간 제안 프레젠테이션", "16:9 가로 6장", "presentation", clay, WIDE, deck(clay)),
  make("deck2", "프로젝트 보고 프레젠테이션", "16:9 가로 6장", "presentation", ink, WIDE, reportDeck(ink)),
  make("portfolio", "설계 포트폴리오", "프로젝트 중심의 8쪽", "portfolio", sand, A4, [coverPanel(sand, "Portfolio", "Selected\nWorks", "2020 — 2026", "chair"), contents(sand, "프로젝트"), photoTop(sand, "프로젝트 1", "한강변 아파트", "living"), threeUp(sand, "프로젝트 1 상세", ["dining", "detail", "bedroom"]), photoTop(sand, "프로젝트 2", "중정 주택", "concrete-house"), twoUp(sand, "프로젝트 2 상세", "bedroom", "chair", LOREM), textPage(sand, "소개", "일하는 방식"), closing(sand, "다음 프로젝트를 함께")]),
  make("catalog", "가구 제품 카탈로그", "제품 그리드 6쪽", "furniture", clay, A4, [coverSplit(clay, "Product Catalogue", "2026\n컬렉션", "의자, 조명, 수납", "chair"), products(clay, "의자와 오브제", ["chair", "chrome-chair", "terracotta-objects", "detail"]), products(clay, "공간 속 가구", ["dining", "city-kitchen", "white-loft", "moody"]), photoTop(clay, "브랜드", "만드는 사람들", "detail"), tablePage(clay, "규격표", [["제품", "크기", "재질"], ["의자", "", ""], ["테이블", "", ""], ["선반", "", ""]]), closing(clay, "주문 문의")]),
  make("newspaper", "INDEX 타임즈 신문", "다단 기사 2면", "newspaper", ink, { width: 900, height: 1200 }, newspaper(ink)),
  make("booklet", "브랜드 북렛", "정사각 6쪽", "booklet", sage, SQUARE, [coverType(sage, "Brand Booklet", "우리의\n태도", "짧게 담은 브랜드 이야기"), photoFull(sage, "장면 1", "living", "오래 머무는 공간"), textPage(sage, "철학", "덜어내기"), photoFull(sage, "장면 2", "detail", "재료의 정직함"), twoUp(sage, "사람들", "chair", "dining", LOREM), closing(sage, "함께해요")]),
  make("lookbook", "시즌 룩북", "사진이 주인공인 8쪽", "lookbook", ink, A4, [coverPanel(ink, "Lookbook 26", "Calm\nRooms", "겨울 스타일링", "moody"), photoFull(ink, "Look 01", "living", "Look 01  낮은 소파와 큰 창"), photoFull(ink, "Look 02", "bedroom", "Look 02  리넨의 침실"), twoUp(ink, "Look 03", "chair", "detail", "오크와 석회"), photoFull(ink, "Look 04", "dining", "Look 04  긴 테이블"), photoFull(ink, "Look 05", "moody", "Look 05  불을 낮춘 저녁"), threeUp(ink, "Details", ["detail", "chair", "bedroom"]), closing(ink, "Calm Rooms")]),
  make("pamphlet", "행사 소책자", "A5 4쪽 안내", "pamphlet", clay, A5, [coverPanel(clay, "Seminar", "실내건축\n세미나", "2026. 12. 12", "dining"), tablePage(clay, "프로그램", [["시간", "내용"], ["14:00", "개회"], ["14:30", "강연"], ["16:00", "질의응답"]]), steps(clay, "참가 안내", ["사전 신청", "현장 등록", "자료 수령"]), closing(clay, "많은 참여 바랍니다")]),
  make("moodboard", "웜 톤 무드보드", "가로 2장 사진·색·키워드", "moodboard", sand, LANDSCAPE, moodboard(sand, "Warm Minimal")),
  make("moodboard2", "딥 그린 무드보드", "큰 소재 사진과 수평 스와치 · 가로 2장", "moodboard", sage, LANDSCAPE, [page("딥 그린", sage, [P("green-bath", 0, 0, 44, 100), H("Deep\nGreen", 51, 9, 43, 24, 66, sage.ink), P("detail", 51, 40, 19, 29), P("moody", 74, 40, 20, 29), ...["#173d32", "#52634d", "#bc9866", "#e9e2d1"].map((fill,i)=>R(51+i*11,76,9,10,fill)), T("짙은 석재 · 브라스 · 부드러운 간접광", 51, 91, 43, 5, 17, sage.muted)]), page("재료 조합", sage, [H("Material study", 5, 8, 90, 11, 58, sage.ink), P("green-bath", 5, 28, 28, 60), P("detail", 36, 28, 28, 60), P("moody", 67, 28, 28, 60), L("01 Stone",5,92,28,sage.muted),L("02 Timber",36,92,28,sage.muted),L("03 Light",67,92,28,sage.muted)])]),
  make("moodboard3", "모노톤 무드보드", "건축·금속의 흑백 대비 · 정사각 2장", "moodboard", ink, SQUARE, [page("모노톤", ink, [L("Spatial composition",7,6,86,ink.muted),H("MONO",7,13,86,15,132,ink.ink,{font:display}),P("white-loft",7,36,56,40),P("concrete-house",67,36,26,58),R(7,82,15,12,"#151818"),R(25,82,15,12,"#aeb0aa"),R(43,82,20,12,"#e7e8e1")]),page("형태와 면",ink,[P("concrete-house",0,0,100,52),H("Lines.\nPlanes.\nLight.",7,60,48,31,74,ink.ink,{font:display}),P("chrome-chair",63,60,30,34)])]),
];
