export interface NavLink {
  label: string;
  englishLabel?: string;
  to: string;
}

export const primaryNav: NavLink[] = [
  { label: "케이스 라이브러리", englishLabel: "Case Library", to: "/cases" },
  { label: "세미나", englishLabel: "Seminars", to: "/seminars" },
  { label: "마이페이지", englishLabel: "My Page", to: "/mypage" },
];

export interface FooterColumn {
  links: NavLink[];
}

export const footerColumns: FooterColumn[] = [
  {
    links: [
      { label: "협회 소개", to: "/about" },
      { label: "인사말", to: "/about/greeting" },
      { label: "조직 안내", to: "/about/organization" },
      { label: "연혁", to: "/about/history" },
    ],
  },
  {
    links: [
      { label: "하자 정보", to: "/defects" },
      { label: "하자 유형", to: "/defects/types" },
      { label: "사례 데이터베이스", to: "/defects/database" },
      { label: "표준 지침", to: "/defects/standards" },
    ],
  },
  {
    links: [
      { label: "고객 지원", to: "/support" },
      { label: "공지사항", to: "/support/notices" },
      { label: "자주 묻는 질문", to: "/support/faq" },
      { label: "문의하기", to: "/support/contact" },
    ],
  },
];

export const legalLinks: NavLink[] = [
  { label: "개인정보처리방침", to: "/privacy" },
  { label: "이용약관", to: "/terms" },
];
