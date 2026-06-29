export interface CaseItem {
  id: number;
  category: string;
  /** category group key used by the filter tabs */
  group: "방수" | "마감" | "설비" | "단열" | "전기" | "기타";
  date: string;
  title: string;
  excerpt: string;
  image: string;
  isNew?: boolean;
  views?: number;
}

/** One block of an article body. */
export type ArticleBlock =
  | { type: "paragraph"; text: string }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "callout"; text: string };

export interface ArticleSection {
  id: string;
  heading: string;
  blocks: ArticleBlock[];
}

/** Shared demo article body used by the case detail page. */
export const caseArticle: ArticleSection[] = [
  {
    id: "sec-1",
    heading: "1. 벽체와 단열재 사이 공기층 형성",
    blocks: [
      {
        type: "paragraph",
        text: "단열재를 벽체에 밀착 시공하지 않으면 단열재와 벽체 사이에 공기층이 형성됩니다. 이 공기층은 내부 대류를 통해 열을 전달하여 단열 성능을 크게 저하시키며, 건물 에너지 효율에도 직접적인 영향을 미칩니다.",
      },
      {
        type: "paragraph",
        text: "KS F ISO 6946 기준에 따르면 밀폐 공기층 두께가 5mm 이하일 경우 두께가 공기층을 높이지지 않고, 25mm를 초과하면 대류 열전달의 영향이 급증하여 열저항값이 감소하게 됩니다. 현장에서는 단열재 이음부 처리 불량, 복잡 보강재 설치 후 단열재 탈착 등의 이유로 이러한 상황이 빈번합니다.",
      },
      {
        type: "table",
        headers: ["두께", "열저항(Ra)(m²·K/W)", "비고"],
        rows: [
          ["5mm 이하", "0.11", "전도, 기체"],
          ["5~25mm", "0.11~0.18", "대류 운동"],
          ["25mm 이상", "0.18 이상 (개편)", "대류 자유"],
        ],
      },
      {
        type: "callout",
        text: "핵심: 단열재와 벽체 사이 공기층 25mm 초과 시 대류 열전달이 지배적으로 작용하여 단열 효과가 현저히 저하됩니다.",
      },
    ],
  },
  {
    id: "sec-2",
    heading: "2. 불박이장 후면의 곰팡이 발생",
    blocks: [
      {
        type: "paragraph",
        text: "불박이장을 벽체에 밀착 설치하면 가구 뒤편과 벽체 사이의 공기 순환이 차단됩니다.",
      },
      {
        type: "paragraph",
        text: "차단된 공간은 실외 공기온도(또는 건물 벽체)와 직접 접촉하는 외기와 가구 내부의 따뜻한 실내공기가 만나는 지점이 되어, 표면 온도가 이슬점 이하로 떨어지면 결로가 발생하고 이는 곰팡이로 이어집니다.",
      },
    ],
  },
  {
    id: "sec-3",
    heading: "3. 결론 및 개선 방향",
    blocks: [
      {
        type: "paragraph",
        text: "단열재는 벽체에 밀착 시공하고 이음부를 빈틈없이 처리해야 하며, 가구는 벽체와 일정 간격을 띄워 공기 순환 경로를 확보해야 합니다.",
      },
      {
        type: "paragraph",
        text: "설계 단계에서 결로 위험 지점을 사전에 식별하고, 시공 후 적외선 열화상 점검을 통해 단열 결함과 결로 가능 구간을 검증하는 것이 권장됩니다.",
      },
    ],
  },
];

const EXCERPT =
  "연막건진 화질 기초 부동침하 기초 부동침하 사례 분석에 대한 상세한 내용을 전문가 시각으로 분석하였습니다.";

// Unsplash source images matched to the Figma reference.
const IMG = {
  spray: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=500&h=280&fit=crop&auto=format&q=70",
  clean: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=500&h=280&fit=crop&auto=format&q=70",
  tower: "https://images.unsplash.com/photo-1534237710431-e2fc698436d0?w=500&h=280&fit=crop&auto=format&q=70",
  living: "https://images.unsplash.com/photo-1565182999561-18d7dc61c393?w=500&h=280&fit=crop&auto=format&q=70",
  chair: "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=500&h=280&fit=crop&auto=format&q=70",
  kitchen: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=500&h=280&fit=crop&auto=format&q=70",
  house: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=500&h=280&fit=crop&auto=format&q=70",
  sink: "https://images.unsplash.com/photo-1565538810643-b5bdb714032a?w=500&h=280&fit=crop&auto=format&q=70",
};

export const cases: CaseItem[] = [
  { id: 1, category: "설비/배관", group: "설비", date: "2024.03.15", title: "연막건진 화질 기초 부동침하 사례 분석", excerpt: EXCERPT, image: IMG.spray, isNew: true, views: 450 },
  { id: 2, category: "오염/냄새", group: "기타", date: "2024.02.20", title: "연막건진 화질 기초 부동침하 사례 분석", excerpt: EXCERPT, image: IMG.clean },
  { id: 3, category: "단열", group: "단열", date: "2024.02.10", title: "연막건진 화질 기초 부동침하 사례 분석", excerpt: EXCERPT, image: IMG.tower },
  { id: 4, category: "마감/불량", group: "마감", date: "2024.01.25", title: "연막건진 화질 기초 부동침하 사례 분석", excerpt: EXCERPT, image: IMG.living },
  { id: 5, category: "방수/누수", group: "방수", date: "2024.01.15", title: "연막건진 화질 기초 부동침하 사례 분석", excerpt: EXCERPT, image: IMG.chair },
  { id: 6, category: "마감/물량", group: "마감", date: "2023.12.30", title: "연막건진 화질 기초 부동침하 사례 분석", excerpt: EXCERPT, image: IMG.kitchen },
  { id: 7, category: "전기/노선", group: "전기", date: "2023.12.15", title: "연막건진 화질 기초 부동침하 사례 분석", excerpt: EXCERPT, image: IMG.house },
  { id: 8, category: "결로/습기", group: "기타", date: "2023.12.01", title: "연막건진 화질 기초 부동침하 사례 분석", excerpt: EXCERPT, image: IMG.sink },
];

export const caseFilters = [
  "전체",
  "방수",
  "마감",
  "설비",
  "단열",
  "전기",
  "기타",
] as const;

export type CaseFilter = (typeof caseFilters)[number];
