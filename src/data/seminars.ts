export type SeminarLevel = "기초" | "심화";
export type SeminarStatus = "예정" | "접수중" | "완료";

export interface Seminar {
  id: number;
  level: SeminarLevel;
  status: SeminarStatus;
  title: string;
  date: string;
  location: string;
  capacity: number;
  enrolled: number;
  image: string;
}

const IMG = {
  audience: "https://images.unsplash.com/photo-1505373877841-8d25f7d46678?w=1000&q=70",
  clean: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=800&q=70",
  tower: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&q=70",
  living: "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800&q=70",
  chair: "https://images.unsplash.com/photo-1567016432779-094069958ea5?w=800&q=70",
  couple: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800&q=70",
  house: "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800&q=70",
  kitchen2: "https://images.unsplash.com/photo-1556911220-bff31c812dba?w=800&q=70",
};

/** First item is rendered as the featured seminar. */
export const upcomingSeminars: Seminar[] = [
  { id: 1, level: "심화", status: "접수중", title: "방수 시스템 설계 실무: 현장 적용 사례 중심", date: "2026.08.04 (화)", location: "서울 강남구", capacity: 48, enrolled: 32, image: IMG.audience },
  { id: 2, level: "기초", status: "예정", title: "타일 시공 불량 사례 분석과 하자 예방", date: "2026.08.12 (수)", location: "서울 중구", capacity: 40, enrolled: 28, image: IMG.clean },
  { id: 3, level: "기초", status: "예정", title: "단열재 종류와 시공 기준", date: "2026.08.19 (수)", location: "서울 마포구", capacity: 30, enrolled: 15, image: IMG.tower },
  { id: 4, level: "기초", status: "예정", title: "표준 점검 설계의 핵심 원리", date: "2026.08.26 (화)", location: "서울 영등포구", capacity: 35, enrolled: 5, image: IMG.living },
  { id: 5, level: "심화", status: "예정", title: "균열 메커니즘으로 읽는 구조 하자 진단", date: "2026.09.02 (화)", location: "서울 강남구", capacity: 40, enrolled: 0, image: IMG.chair },
];

export interface PastSeminar {
  id: number;
  level: SeminarLevel;
  date: string;
  location: string;
  title: string;
  image: string;
}

export const pastSeminars: PastSeminar[] = [
  { id: 11, level: "기초", date: "2026.05.10", location: "서울 중구", title: "타일 시공 불량 사례 분석과 하자 예방", image: IMG.couple },
  { id: 12, level: "기초", date: "2026.04.15", location: "서울 강남구", title: "방수 시스템 설계 실무 — 동습 결로의 원리", image: IMG.house },
  { id: 13, level: "기초", date: "2026.03.22", location: "서울 마포구", title: "단열재 시공 불량에 의한 에너지 손실 분석", image: IMG.kitchen2 },
  { id: 14, level: "기초", date: "2026.02.18", location: "서울 강남구", title: "방수 시스템 설계 실무 — 동습 결로의 원리", image: IMG.living },
  { id: 15, level: "심화", date: "2026.01.14", location: "서울 서초구", title: "단열재 시공 불량에 의한 에너지 손실 분석", image: IMG.chair },
];
