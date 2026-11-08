/**
 * Default site menus. Operators edit menus in /admin/menus (stored as the `navigation`
 * site-content block); these values are only the starting point and the fallback.
 * Read menus through `useNavigation()` (src/lib/navigation.ts), not these constants.
 */
export interface NavLink {
  label: string;
  englishLabel?: string;
  to: string;
  /** Shown in the header only to admin accounts (e.g. while the page is being prepared). */
  adminOnly?: boolean;
  /** Open in a new tab (standalone pages with their own navigation, e.g. /ai). */
  newTab?: boolean;
  /** Kept in the list but not shown anywhere. */
  hidden?: boolean;
}

export const primaryNav: NavLink[] = [
  { label: "AI", englishLabel: "AI", to: "/ai", adminOnly: true, newTab: true },
  { label: "케이스 라이브러리", englishLabel: "Case Library", to: "/cases" },
  { label: "세미나", englishLabel: "Seminars", to: "/seminars" },
  { label: "마이페이지", englishLabel: "My Page", to: "/mypage" },
];

export interface FooterColumn {
  links: NavLink[];
}

export interface SiteNavigation {
  primary: NavLink[];
  footer: FooterColumn[];
  legal: NavLink[];
  /** Footer brand line under the logo. */
  org: string;
  copyright: string;
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

export const defaultNavigation: SiteNavigation = {
  primary: primaryNav,
  footer: footerColumns,
  legal: legalLinks,
  org: "주거인테리어 협회",
  copyright: "© 2025 주거인테리어 협회. All rights reserved.",
};
