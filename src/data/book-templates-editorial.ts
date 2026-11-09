import type { BookElement, BookPage, TextElement } from "../lib/flipbooks";
import type { BookTemplate, TemplateCategory } from "./book-templates";

// These are six independently composed publications, not palette variants of one page sequence.
type Photo = "living" | "dining" | "chair" | "detail" | "bedroom" | "moody" | "white-loft" | "concrete-house" | "terracotta-objects" | "chrome-chair" | "city-kitchen" | "green-bath";
const serif = "'Playfair Display'";
const sans = "'Montserrat'";
const korean = "'Noto Sans KR'";
let serial = 0;
const id = () => `editorial-${++serial}`;
const path = (key: Photo) => `/book-templates/editorial/${key}.jpg`;
const P = (key: Photo, x: number, y: number, w: number, h: number, extra: Record<string, number> = {}): BookElement => ({ id: id(), type: "image", src: path(key), x, y, w, h, fit: "cover", ...extra });
const T = (text: string, x: number, y: number, w: number, h: number, size = 22, color = "#302e2a", extra: Partial<TextElement> = {}): TextElement => ({ id: id(), type: "text", text, x, y, w, h, size, color, bold: false, align: "left", font: korean, lineHeight: 1.75, ...extra });
const H = (text: string, x: number, y: number, w: number, h: number, size = 72, color = "#302e2a", extra: Partial<TextElement> = {}) => T(text, x, y, w, h, size, color, { font: serif, lineHeight: 1.06, ...extra });
const K = (text: string, x: number, y: number, w = 70, color = "#77746b") => T(text, x, y, w, 3, 12, color, { font: sans, spacing: 160, lineHeight: 1.25 });
const R = (x: number, y: number, w: number, h: number, fill: string, opacity = 1): BookElement => ({ id: id(), type: "shape", shape: "rect", x, y, w, h, fill, opacity });
const L = (x: number, y: number, w: number, color = "#b7b3a8"): BookElement => ({ id: id(), type: "line", x, y, w, h: .1, color, thickness: .65, style: "solid", arrow: false });
const page = (title: string, background: string, elements: BookElement[]): BookPage => ({ id: id(), title, background, elements });
const CREAM = "#f1eee6", WHITE = "#fafaf7", INK = "#171c1b", LIME = "#dfe86f", COBALT = "#263db4";
const homeCopy = "집을 이루는 것은 벽과 가구만이 아닙니다. 아침에 빛이 드는 자리, 저녁에 앉는 의자, 손에 익은 재료가 하루의 리듬을 만듭니다. 생활을 먼저 살피고 공간은 그 뒤에 따라오도록 설계했습니다.";
const materialCopy = "나무의 방향과 돌의 이음, 손이 닿는 모서리를 조율했습니다. 서로 다른 재료가 만나는 곳에서 같은 두께와 정렬선을 찾으면 공간은 한층 차분해집니다.";
const cityCopy = "작은 집에서는 하나의 공간이 여러 역할을 맡습니다. 식탁은 작업대가 되고, 창가는 잠시 쉬는 자리가 됩니다. 닫힌 수납과 열린 동선을 함께 계획해 일상의 장면이 자연스럽게 이어지도록 했습니다.";
const designCopy = "형태를 정하기 전에 어떻게 사용할지 질문합니다. 앉는 자세와 손의 위치, 주변 가구와의 간격을 검토하고, 재료의 특성을 살리는 구조로 완성합니다.";

function publication(idValue: string, name: string, subtitle: string, category: TemplateCategory, width: number, height: number, palette: string[], pages: BookPage[]): BookTemplate {
  const images = [...new Set(pages.flatMap(p => p.elements.flatMap(e => e.type === "image" ? [e.src] : [])))];
  return { id: idValue, name, subtitle, category, palette, book: { id: idValue, title: name, width, height, pages, assets: images.map(url => ({ url, kind: "image" as const })), background: "#dbdcd5", published: false, createdAt: 0, updatedAt: 0 } };
}
function linkText(page: BookPage, label: string, target: BookPage) {
  const element = page.elements.find(e => e.type === "text" && e.text === label);
  if (element) element.actions = [{ kind: "page", pageId: target.id }];
}

function quietLiving(): BookTemplate {
  const pages = [
    page("표지", CREAM, [K("THE RESIDENTIAL ISSUE", 7, 4, 60), K("VOL. 01", 79, 4, 17), H("Quiet Living", 6, 9, 90, 12, 102), P("living", 7, 25, 86, 55), K("IN FOCUS / A QUIETER HOME", 7, 83), T("고요한 집을 만드는 것들", 7, 88, 70, 6, 29, INK), T("공간 · 빛 · 재료", 7, 95, 65, 3, 14), H("01", 80, 87, 13, 8, 54)]),
    page("편집자의 글", CREAM, [K("EDITOR’S LETTER", 9, 7), H("A home,\nslowly made.", 9, 15, 76, 18, 71), P("bedroom", 61, 40, 30, 40), T("천천히 완성되는 집", 9, 41, 44, 8, 31, INK, { font: "'Noto Serif KR'" }), T(homeCopy, 9, 54, 42, 25, 22), L(9, 86, 82), K("EDITORIAL / INDEX", 9, 90), K("02", 85, 90, 6)]),
    page("머무는 장면", WHITE, [P("dining", 0, 0, 74, 100), K("01 / SHARED MOMENTS", 79, 10, 17), T("마주\n앉는\n시간", 79, 22, 17, 20, 38, INK, { font: "'Noto Serif KR'", lineHeight: 1.5 }), T("창 옆의 식탁.\n서로의 하루를\n나누는 자리.", 79, 68, 17, 19, 17), K("03", 88, 94, 8)]),
    page("빛과 재료", CREAM, [K("NOTES ON MATERIAL", 8, 6), H("The things\nwe touch.", 8, 12, 82, 16, 66), P("detail", 8, 34, 38, 42), P("green-bath", 52, 45, 40, 42), T(materialCopy, 8, 80, 38, 13, 18), K("STONE / WOOD / LINEN", 52, 36, 40), K("04", 86, 94, 8)]),
    page("집의 대화", WHITE, [H("“여백은 다음 생활을\n위해 남겨 둔 자리.”", 8, 8, 84, 16, 43, INK, { font: "'Noto Serif KR'", lineHeight: 1.45 }), P("white-loft", 8, 32, 84, 36), T(homeCopy, 8, 73, 39, 20, 19), T(materialCopy, 53, 73, 39, 20, 19), K("05", 86, 95, 8)]),
    page("작은 취향", CREAM, [K("THE EVERYDAY EDIT", 8, 6), H("Small rituals.", 8, 12, 84, 11, 69), P("chair", 8, 30, 34, 43), T("01 / 몸을 맡기는 의자", 8, 77, 34, 5, 19), P("bedroom", 50, 30, 42, 28), T("02 / 불을 낮춘 방", 50, 62, 42, 5, 19), T("편안함을 결정하는 것은 작은 선택입니다. 손에 익은 질감과 눈부시지 않은 빛을 곁에 둡니다.", 50, 72, 42, 17, 20), K("06", 86, 95, 8)]),
    page("이번 호의 기록", WHITE, [K("INDEX / IN THIS ISSUE", 8, 7), H("Room notes.", 8, 14, 84, 12, 74), ...["편집자의 글", "머무는 장면", "빛과 재료", "작은 취향"].flatMap((s, i) => [H(`0${i + 1}`, 8, 36 + i * 12, 12, 6, 35), T(s, 29, 36 + i * 12, 57, 5, 27), L(29, 44 + i * 12, 63)]), T("사진과 글을 당신의 프로젝트 기록으로 채워 보세요.", 8, 90, 84, 5, 18)]),
    page("뒤표지", CREAM, [P("detail", 0, 0, 61, 100), H("Live\nwell.", 68, 54, 25, 20, 71), K("QUIET LIVING", 68, 83, 25), T("당신의 다음 공간을\n이야기해 주세요.", 68, 89, 25, 7, 16)]),
  ];
  [1, 2, 3, 5].forEach((index, i) => linkText(pages[6], ["편집자의 글", "머무는 장면", "빛과 재료", "작은 취향"][i], pages[index]));
  return publication("quiet-living", "고요한 집", "자연광과 여백, 긴 호흡의 주거 화보 · 8쪽", "interior", 794, 1123, [CREAM, INK, "#b89e7e"], pages);
}

function betweenSpaces(): BookTemplate {
  const pages = [
    page("표지", INK, [K("ARCHITECTURE / FIELD JOURNAL", 5, 8, 34, LIME), H("BETWEEN", 5, 21, 37, 13, 52, WHITE, { font: sans, bold: true }), H("SPACES", 5, 37, 36, 13, 70, WHITE, { font: sans, bold: true }), T("공간의 사이", 5, 71, 30, 9, 24, WHITE), K("STUDIES IN RESIDENTIAL DESIGN", 5, 88, 32, LIME), P("concrete-house", 44, 0, 56, 100)]),
    page("프로젝트 색인", WHITE, [K("PROJECT REGISTER", 5, 7), H("질문에서 시작하는 설계", 5, 15, 90, 13, 42, INK, { font: korean, bold: true }), ...["대지", "구조", "생활", "디테일"].flatMap((s, i) => [R(5 + i * 23, 37, 20, .4, INK), H(`0${i + 1}`, 5 + i * 23, 42, 20, 13, 59, INK, { font: sans }), T(s, 5 + i * 23, 61, 20, 8, 27, INK, { bold: true }), T(["빛과 외부의 관계를\n먼저 살핍니다.", "하중과 빈 공간의\n질서를 찾습니다.", "머무는 시간에 맞춰\n동선을 다듬습니다.", "손에 닿는 곳부터\n재료를 조율합니다."][i], 5 + i * 23, 74, 20, 15, 17)]), K("02 / CONTENTS", 5, 95)]),
    page("중정 주택", WHITE, [P("concrete-house", 0, 0, 65, 83), K("CASE STUDY / 01", 70, 8, 25), H("Courtyard\nhouse.", 70, 23, 25, 23, 43, INK, { font: sans, bold: true }), T("중정을 중심으로\n다시 연결한 일상", 70, 57, 25, 14, 23), L(5, 88, 90), K("CONCEPT / OPENNESS", 5, 93), K("03", 89, 93, 6)]),
    page("개방과 경계", INK, [K("SPATIAL STRATEGY", 5, 7, 60, LIME), H("Open / Close", 5, 16, 88, 13, 65, WHITE, { font: sans, bold: true }), P("white-loft", 5, 37, 42, 43), P("dining", 53, 37, 42, 43), T("01  빛의 깊이를 확보하는 열린 단면", 5, 86, 42, 7, 17, WHITE), T("02  생활의 크기를 담아내는 낮은 경계", 53, 86, 42, 7, 17, WHITE)]),
    page("설계 메모", WHITE, [K("DESIGN MEMORANDUM", 5, 7), H("사람의 움직임을\n공간의 기준으로.", 5, 23, 40, 30, 40, INK, { font: korean, bold: true, lineHeight: 1.45 }), T(homeCopy, 5, 64, 38, 25, 18), L(51, 11, 44), ...["빛  /  Natural light", "동선  /  Circulation", "수납  /  Storage"].flatMap((s, i) => [T(s, 52, 18 + i * 25, 42, 6, 23, INK, { bold: true }), T(["창을 통해 들어온 빛이 실내 깊숙이 닿는 경로를 검토합니다.", "자주 오가는 길에 가구가 걸리지 않도록 폭과 거리를 조정합니다.", "일상적으로 쓰는 물건의 크기와 수납 위치를 함께 계획합니다."][i], 52, 28 + i * 25, 42, 13, 18), L(52, 44 + i * 25, 42)])]),
    page("구축의 언어", "#e9e9e3", [K("MATERIAL / ASSEMBLY", 5, 7), P("detail", 5, 22, 28, 59), P("green-bath", 36, 22, 28, 59), P("white-loft", 67, 22, 28, 59), T("WOOD", 5, 87, 28, 5, 24, INK, { font: sans }), T("STONE", 36, 87, 28, 5, 24, INK, { font: sans }), T("PLASTER", 67, 87, 28, 5, 24, INK, { font: sans })]),
    page("프로젝트 정보", WHITE, [H("Project\ninformation.", 5, 12, 44, 24, 55, INK, { font: sans, bold: true }), ...["프로젝트명", "설계 범위", "면적", "주요 재료", "기록"].flatMap((s, i) => [L(53, 16 + i * 14, 42), T(s, 53, 20 + i * 14, 17, 5, 18), T("프로젝트에 맞게 입력", 74, 20 + i * 14, 21, 5, 16, "#777b76")]), T("원본 도면과 현장 사진을 추가해 설계의 판단 과정을 기록하는 페이지입니다.", 5, 69, 38, 18, 19)]),
    page("뒤표지", INK, [R(5, 9, 90, .3, LIME), H("Space is\na conversation.", 5, 25, 90, 36, 76, WHITE, { font: sans, bold: true }), K("BETWEEN SPACES / YOUR STUDIO", 5, 87, 75, LIME)]),
  ];
  [2, 3, 4, 5].forEach((target, i) => linkText(pages[1], ["대지", "구조", "생활", "디테일"][i], pages[target]));
  return publication("between-spaces", "공간의 사이", "흑백 건축 사진과 정렬된 정보, 가로 저널 · 8쪽", "interior", 1100, 825, [INK, WHITE, LIME], pages);
}

function formMaterial(): BookTemplate {
  const paper = "#efe7d6", brown = "#4b3628";
  const product = (key: Photo, n: string, name: string, x: number, y: number): BookElement[] => [P(key, x, y, 40, 29), K(n, x, y + 31, 8, brown), T(name, x + 9, y + 31, 31, 5, 20, brown), T("소재 · 크기 · 마감 입력", x + 9, y + 37, 31, 4, 15, "#81715e")];
  const pages = [
    page("표지", paper, [K("A COLLECTION OF CONSIDERED OBJECTS", 7, 6, 84, brown), H("FORM", 6, 13, 88, 18, 143, brown, { font: sans, bold: true, spacing: -60 }), H("& material", 7, 32, 86, 11, 68, brown), P("terracotta-objects", 7, 46, 58, 47), T("형태를 만지고\n재료를 읽다.", 71, 67, 23, 13, 25, brown, { font: "'Noto Serif KR'" }), K("COLLECTION 01", 71, 89, 23, brown)]),
    page("브랜드 노트", paper, [H("Made for\nevery day.", 7, 11, 48, 28, 72, brown), T(designCopy, 7, 51, 43, 22, 23, brown), P("chair", 58, 12, 35, 62), L(7, 85, 86, "#a8997f"), T("유행보다 사용을, 장식보다 구조를 생각합니다.", 7, 89, 86, 5, 20, brown)]),
    page("시팅 컬렉션", "#fbf8f0", [H("Seating / 01", 7, 5, 86, 10, 55, brown), ...product("chair", "01", "TIMBER LOUNGE", 7, 20), ...product("chrome-chair", "02", "SLING CHAIR", 53, 20), ...product("terracotta-objects", "03", "LOW OBJECTS", 7, 59), ...product("bedroom", "04", "RESTING PLACE", 53, 59)]),
    page("제품 한 점", brown, [P("chrome-chair", 0, 0, 60, 100), K("OBJECT NO. 02", 66, 9, 28, paper), H("Sling\nchair", 66, 29, 28, 21, 64, paper), T("금속의 선과\n가죽의 면이\n만나는 의자", 66, 59, 28, 17, 24, paper), T("TUBULAR STEEL\nWOVEN LEATHER", 66, 86, 28, 7, 13, paper, { font: sans })]),
    page("재료와 마감", paper, [K("FINISH LIBRARY", 7, 7, 86, brown), H("Touch & feel.", 7, 14, 86, 11, 70, brown), P("detail", 7, 34, 40, 44), ...["#9c7352", "#d0bba0", "#e8e0d1", "#635a4d"].map((fill, i) => R(56 + i * 9.5, 35, 7.5, 18, fill)), T("재료의 표정", 56, 59, 37, 6, 27, brown, { bold: true }), T(materialCopy, 56, 70, 37, 22, 20, brown), T("선택한 마감과 샘플 번호를 기록하세요.", 7, 86, 40, 7, 17, brown)]),
    page("공간 속 컬렉션", "#fbf8f0", [P("living", 0, 0, 100, 64), H("In good company.", 7, 71, 86, 10, 57, brown), T("의자, 테이블, 조명의 간격을 함께 생각합니다. 가구는 한 점의 물건이면서 생활을 연결하는 풍경입니다.", 7, 85, 86, 9, 21, brown)]),
    page("제품 정보", paper, [K("TECHNICAL / PRODUCT INDEX", 7, 7, 86, brown), H("The details.", 7, 15, 86, 12, 69, brown), ...["TIMBER LOUNGE", "SLING CHAIR", "LOW OBJECTS"].flatMap((s, i) => [L(7, 36 + i * 18, 86, "#b7a68b"), T(s, 7, 41 + i * 18, 40, 5, 23, brown, { font: sans }), T("규격  /  소재  /  마감\n제품 정보를 입력하세요.", 57, 40 + i * 18, 36, 11, 18, brown)]), K("SPECIFICATIONS TO BE CONFIRMED", 7, 94, 86, brown)]),
    page("뒤표지", brown, [H("Objects\nwith purpose.", 7, 18, 86, 31, 85, paper), L(7, 68, 86, "#a38d70"), T("당신의 공간을 위한\n다음 한 점을 찾아보세요.", 7, 76, 86, 13, 27, paper), K("FORM & MATERIAL / YOUR BRAND", 7, 94, 86, paper)]),
  ];
  return publication("form-material", "형태와 소재", "제품 네 칸과 스펙 페이지를 갖춘 정사각 카탈로그 · 8쪽", "furniture", 900, 900, [paper, brown, "#a84330"], pages);
}

function objectsEdit(): BookTemplate {
  const pink = "#eed8c9", red = "#a84330";
  const pages = [
    page("표지", red, [K("THE COLLECTIBLE DESIGN EDIT", 8, 5, 84, pink), H("OBJECTS", 7, 12, 86, 11, 95, pink, { font: sans, bold: true, spacing: -35 }), K("CRAFT / FORM / PERSONALITY", 8, 25, 84, pink), P("chrome-chair", 8, 33, 84, 52), H("Worth keeping.", 8, 89, 84, 7, 46, pink)]),
    page("시선", pink, [H("One object.\nMany stories.", 8, 10, 84, 18, 72, red), P("chrome-chair", 8, 36, 42, 48), H("02", 63, 40, 29, 13, 93, red, { font: sans }), T("선이 만드는\n존재감", 59, 61, 33, 10, 31, red), T("가벼운 프레임과 반사되는 표면이 공간에 또 하나의 선을 그립니다.", 59, 77, 33, 15, 19, red)]),
    page("페어링", "#fbf5eb", [K("PAIRING / CONTRAST", 8, 6), P("chair", 8, 17, 84, 33), P("chrome-chair", 8, 53, 39, 34), P("terracotta-objects", 53, 53, 39, 34), T("서로 다른 질감을 나란히 놓는 방식", 8, 92, 84, 4, 20)]),
    page("만드는 태도", red, [H("Less,\nbut with\ncharacter.", 8, 14, 84, 35, 89, pink), L(8, 59, 84, pink), T(designCopy, 8, 66, 39, 24, 20, pink), T("하나의 가구가 가진 비례와 촉감, 제작의 흔적을 살핍니다. 공간 전체를 채우기보다 오래 바라볼 한 점을 선택합니다.", 53, 66, 39, 24, 20, pink)]),
    page("질감의 클로즈업", pink, [P("detail", 0, 0, 68, 100), K("CRAFT / DETAIL", 75, 8, 19, red), T("가까이\n볼수록\n보이는 것", 75, 31, 19, 28, 31, red, { font: "'Noto Serif KR'" }), T("결의 방향.\n접합의 선.\n손에 남는 감촉.", 75, 76, 19, 16, 16, red)]),
    page("색의 조합", "#fbf5eb", [K("COLOUR COMPOSITION", 8, 6), H("A bolder\npoint of view.", 8, 13, 84, 19, 68, red), P("city-kitchen", 8, 39, 53, 49), ...[red, COBALT, pink].map((fill, i) => R(69, 39 + i * 17, 23, 14, fill)), T("색은 사물을 연결하고, 사물은 공간에 성격을 줍니다.", 8, 92, 84, 4, 18, red)]),
    page("에디터의 선택", pink, [H("The edit.", 8, 10, 84, 12, 81, red), ...["구조를 드러내는 의자", "질감을 살린 작은 테이블", "오래 곁에 두는 오브제"].flatMap((s, i) => [H(`0${i + 1}`, 8, 34 + i * 19, 16, 8, 44, red, { font: sans }), T(s, 31, 35 + i * 19, 61, 6, 25, red), L(31, 46 + i * 19, 61, "#bd8a75")]), K("YOUR COLLECTION / YOUR STORY", 8, 94, 84, red)]),
    page("뒤표지", red, [P("terracotta-objects", 8, 8, 84, 61), H("Keep it\ninteresting.", 8, 76, 84, 17, 67, pink)]),
  ];
  return publication("objects-edit", "오브제 에디트", "테라코타·코발트 대비와 큰 타이포의 오브제 북 · 8쪽", "furniture", 720, 1000, [red, pink, COBALT], pages);
}

function selectedWorks(): BookTemplate {
  const pages = [
    page("표지", WHITE, [K("STUDIO / RESIDENTIAL DESIGN", 5, 7), H("Selected works", 5, 19, 90, 13, 66, INK, { font: sans, bold: true, spacing: -40 }), L(5, 36, 90, INK), P("white-loft", 39, 43, 56, 48), H("01—03", 5, 47, 29, 13, 55, INK, { font: sans }), T("주거의 새로운 가능성\n설계 포트폴리오", 5, 78, 29, 13, 23), K("YOUR STUDIO / DESIGN ARCHIVE", 5, 95)]),
    page("작업 목록", INK, [K("SELECTED PROJECTS", 5, 7, 75, WHITE), ...["COURTYARD", "WHITE ROOM", "CITY HOME"].flatMap((s, i) => [H(`0${i + 1}`, 5, 25 + i * 22, 14, 11, 51, WHITE, { font: sans }), H(s, 25, 25 + i * 22, 70, 12, 43, WHITE, { font: sans }), L(25, 41 + i * 22, 70, "#5a625f")])]),
    page("프로젝트 01", WHITE, [P("concrete-house", 0, 0, 72, 82), K("01 / COURTYARD", 77, 8, 18), T("경계 안의\n열린 풍경", 77, 26, 18, 18, 29, INK, { bold: true }), T("외부와 내부의\n거리감을 조절한\n주거 프로젝트", 77, 61, 18, 20, 17), T("대지의 조건과 생활의 요구를 하나의 구조로 엮습니다.", 5, 90, 90, 5, 20)]),
    page("프로젝트 02", WHITE, [K("02 / WHITE ROOM", 5, 6), H("빛이 머무는 단면", 5, 13, 90, 12, 44, INK, { font: korean }), P("white-loft", 5, 32, 58, 58), T("문제를 정리하다", 69, 35, 26, 6, 25, INK, { bold: true }), T("시야를 막는 가구를 줄이고, 빛이 안쪽까지 이어지는 동선을 계획했습니다.", 69, 48, 26, 25, 19), L(69, 79, 26), K("SPACE / LIGHT / FLOW", 69, 86, 26)]),
    page("프로젝트 03", "#e8e4df", [K("03 / CITY HOME", 5, 7), P("city-kitchen", 5, 20, 42, 69), H("Colour\nin everyday.", 53, 21, 42, 26, 52, INK, { font: sans, bold: true }), T(cityCopy, 53, 61, 42, 28, 20)]),
    page("재료 아카이브", WHITE, [K("DETAIL / MATERIAL ARCHIVE", 5, 7), ...["detail", "green-bath", "bedroom"].map((key, i) => P(key as Photo, 5 + i * 31, 23, 28, 53)), ...["01  접합의 선", "02  재료의 깊이", "03  부드러운 면"].map((s, i) => T(s, 5 + i * 31, 82, 28, 8, 18)), L(5, 95, 90)]),
    page("설계의 판단", WHITE, [H("What matters.", 5, 11, 90, 15, 70, INK, { font: sans, bold: true }), ...["사용자의 생활", "공간의 구조", "구현의 디테일"].flatMap((s, i) => [K(`0${i + 1}`, 5 + i * 31, 40, 28), T(s, 5 + i * 31, 48, 28, 8, 27, INK, { bold: true }), T([homeCopy, cityCopy, materialCopy][i], 5 + i * 31, 63, 28, 28, 18)])]),
    page("연락처", INK, [K("LET’S WORK TOGETHER", 5, 9, 90, WHITE), H("Your next\nspace starts here.", 5, 29, 90, 35, 70, WHITE, { font: sans, bold: true }), L(5, 83, 90, "#6a716d"), T("YOUR STUDIO  /  연락처를 입력하세요", 5, 90, 90, 6, 21, WHITE)]),
  ];
  [2, 3, 4].forEach((target, i) => linkText(pages[1], ["COURTYARD", "WHITE ROOM", "CITY HOME"][i], pages[target]));
  return publication("selected-works", "셀렉티드 웍스", "3개 프로젝트와 설계 판단을 담은 가로 포트폴리오 · 8쪽", "portfolio", 1123, 794, [WHITE, INK, "#adb6ab"], pages);
}

function afterHours(): BookTemplate {
  const navy = "#151b28", bone = "#ede4d1", gold = "#c2a579";
  const pages = [
    page("표지", navy, [P("moody", 0, 0, 100, 100), K("A STUDIO MONOGRAPH", 7, 5, 86, bone), H("After Hours", 6, 11, 89, 12, 91, bone), R(0, 80, 100, 20, navy, .85), T("빛을 낮춘 뒤에 보이는 공간", 7, 84, 86, 5, 26, bone), K("NIGHT STUDIES / VOLUME 01", 7, 94, 86, gold)]),
    page("밤의 문장", navy, [K("THE ATMOSPHERE OF HOME", 9, 7, 82, gold), H("When the\nlights go low.", 9, 19, 82, 21, 78, bone), T("낮에 보이지 않던 재료의 깊이와 가구의 윤곽이 저녁의 빛 속에서 다시 드러납니다. 밝기의 총량보다 어디를 비추고 어디를 남길지에 집중했습니다.", 9, 55, 35, 27, 22, bone), P("green-bath", 53, 50, 38, 38), K("02 / EDITORIAL", 9, 94, 82, gold)]),
    page("빛의 풍경", navy, [P("moody", 0, 0, 100, 85), K("01 / WARMTH IN THE SHADOW", 7, 90, 86, gold), T("그림자가 깊어질수록 머무는 자리가 선명해집니다.", 7, 95, 86, 3, 16, bone)]),
    page("소재의 깊이", bone, [K("CLOSE OBSERVATION", 8, 6, 84, navy), H("Texture,\nrevealed.", 8, 13, 84, 19, 74, navy), P("green-bath", 8, 40, 39, 48), P("detail", 53, 40, 39, 31), T(materialCopy, 53, 76, 39, 16, 18, navy), K("04", 8, 94, 84, navy)]),
    page("하나의 시퀀스", navy, [K("A SEQUENCE OF SPACES", 8, 6, 84, gold), ...["moody", "city-kitchen", "bedroom"].map((key, i) => P(key as Photo, 8 + i * 29, 23, 26, 54)), ...["거실 / Gathering", "주방 / Conversation", "침실 / Rest"].map((s, i) => T(s, 8 + i * 29, 82, 26, 6, 16, bone)), T("연결된 장면, 서로 다른 빛의 온도.", 8, 94, 84, 3, 16, gold)]),
    page("조명 노트", navy, [H("Light is\na material.", 8, 10, 84, 20, 81, bone), L(8, 38, 84, gold), ...["시선의 높이", "표면의 질감", "그림자의 여백"].flatMap((s, i) => [H(`0${i + 1}`, 8, 47 + i * 15, 15, 7, 40, gold), T(s, 30, 46 + i * 15, 62, 5, 27, bone), T(["눈부심을 줄이고 머무는 자리에 빛을 둡니다.", "빛이 닿는 각도로 재료의 표정을 조절합니다.", "공간의 모든 면을 같은 밝기로 채우지 않습니다."][i], 30, 53 + i * 15, 62, 6, 17, bone)])]),
    page("프로젝트 크레디트", bone, [K("CREDITS / PROJECT NOTES", 8, 7, 84, navy), H("Behind\nthe scenes.", 8, 17, 84, 20, 78, navy), ...["프로젝트명", "기획 · 설계", "주요 재료", "사진 · 기록"].flatMap((s, i) => [L(8, 49 + i * 10, 84, "#b8aa92"), T(s, 8, 52 + i * 10, 27, 5, 21, navy), T("정보를 입력하세요", 43, 52 + i * 10, 49, 5, 19, navy)]), K("07 / YOUR STUDIO", 8, 95, 84, navy)]),
    page("뒤표지", navy, [H("Stay\na little\nlonger.", 8, 21, 84, 39, 102, bone), L(8, 77, 84, gold), K("AFTER HOURS / A STUDIO MONOGRAPH", 8, 85, 84, gold), T("당신의 다음 공간에 관한 이야기를 기다립니다.", 8, 93, 84, 4, 18, bone)]),
  ];
  return publication("after-hours", "애프터 아워스", "밤의 빛과 재료의 질감을 따라가는 스튜디오 모노그래프 · 8쪽", "portfolio", 800, 1100, [navy, bone, gold], pages);
}

export const EDITORIAL_TEMPLATES: BookTemplate[] = [quietLiving(), betweenSpaces(), formMaterial(), objectsEdit(), selectedWorks(), afterHours()];
