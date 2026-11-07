/**
 * About (협회 소개) page content — edit this file to change the page.
 *
 * Layout follows cdsa.kr/about (numbered editorial sections + "on this page" index).
 * Only facts already on the INDEX site are filled in; everything else is `null`,
 * which the page renders as an "입력 필요" marker so it's obvious what to fill.
 * Narrative copy (intro, philosophy) is a draft in INDEX's voice — revise freely.
 */

/** `null` = not provided yet → shown as "입력 필요" on the page. */
export type Maybe<T> = T | null;

export interface AboutStat {
  value: Maybe<string>;
  label: string;
  note: string;
}

export interface AboutService {
  letter: string;
  kicker: string;
  title: string;
  body: string;
  to?: string;
}

export interface AboutPartnerGroup {
  label: string;
  items: string[];
}

export interface AboutContactRow {
  label: string;
  value: Maybe<string>;
  href?: string;
}

export const about = {
  eyebrow: "한국실내건축가협회 · INDEX",
  title: "한국실내건축가협회",
  titleAccent: "INDEX",
  tagline: "인테리어 공사 정보, 검색으로 시작하세요.",
  intro:
    "INDEX는 한국실내건축가협회(K-IAA)가 운영하는 인테리어 공사 하자 사례 검색·분석 서비스입니다. 실내건축 현장에서 축적된 사례를 원인 분석부터 해결 과정, 재발 방지 방안까지 체계적으로 기록하고 공유하며, 실무 세미나를 통해 현장의 기준을 함께 만들어 갑니다.",

  stats: {
    items: [
      { value: null, label: "누적 하자 사례", note: "Case Library 등록 기준" },
      { value: null, label: "실무 세미나", note: "기초·심화 과정 누적 개최" },
      { value: null, label: "참여 전문가", note: "회원·자문 전문가" },
      { value: null, label: "설립 연도", note: "협회 설립" },
    ] satisfies AboutStat[],
    highlight: { label: "MEMBERSHIP", text: null as Maybe<string> },
  },

  services: {
    lead: "INDEX는 세 가지 축으로 현장의 하자 문제를 다룹니다. 사례를 모으고, 기준을 가르치고, 지식으로 정리합니다.",
    items: [
      {
        letter: "A",
        kicker: "CASE LIBRARY",
        title: "현장 하자 사례 도서관",
        body: "실내건축 현장에서 축적된 하자 사례를 원인 분석부터 해결 과정, 재발 방지 방안까지 정리해 실무에 필요한 인사이트와 전문적인 기준을 제공합니다.",
        to: "/cases",
      },
      {
        letter: "B",
        kicker: "SEMINARS · 기초 / 심화",
        title: "실무 세미나",
        body: "방수·타일·단열·구조 등 공종별 하자 예방과 진단을 다루는 실무 세미나를 운영합니다. 현장 사례를 중심으로 바로 적용할 수 있는 기준을 다룹니다.",
        to: "/seminars",
      },
      {
        letter: "C",
        kicker: "KNOWLEDGE ARCHIVE",
        title: "하자 지식 아카이브",
        body: "사례·법규·시공기준을 하자 유형별 지식 문서로 엮어, 질문하면 근거와 함께 답할 수 있는 지식 기반을 구축하고 있습니다. (준비 중)",
      },
    ] satisfies AboutService[],
  },

  partners: {
    lead: null as Maybe<string>,
    groups: [
      { label: "공공 기관", items: [] },
      { label: "기업", items: [] },
      { label: "학계 · 단체", items: [] },
    ] satisfies AboutPartnerGroup[],
  },

  philosophy: {
    quote: "현장에서 쌓인 사례가 다음 현장의 기준이 됩니다.",
    by: "INDEX 운영 원칙",
    paragraphs: [
      "하자는 대부분 처음 일어나는 일이 아닙니다. 같은 공종, 같은 부위에서 같은 원인으로 반복됩니다. INDEX는 흩어져 있던 현장의 경험을 사례로 기록해, 다음 현장이 같은 실수를 반복하지 않도록 돕습니다.",
      "사례는 결과만이 아니라 원인과 판단 과정까지 남길 때 기준이 됩니다. 그래서 INDEX의 모든 사례는 현상, 원인 분석, 보수 방법, 재발 방지 방안의 순서로 정리합니다.",
    ],
    pullQuote: "기록되지 않은 경험은 다음 현장에 전해지지 않습니다.",
    closing:
      "세미나와 지식 아카이브는 이 기록을 실무자의 역량으로 바꾸는 과정입니다. 사례를 읽는 사람이 곧 다음 사례를 막는 사람이 되도록, INDEX는 현장과 함께 기준을 만들어 갑니다.",
  },

  person: {
    section: "협회장",
    name: null as Maybe<string>,
    role: "한국실내건축가협회 회장",
    credentials: [] as string[],
    moreLink: { label: "운영진 전체 보기", to: "/about/organization" },
  },

  contact: [
    { label: "이메일", value: null },
    { label: "전화", value: null },
    { label: "주소", value: null },
    { label: "홈페이지", value: "www.kiaa.or.kr", href: "https://www.kiaa.or.kr" },
  ] satisfies AboutContactRow[],

  footer: {
    org: "한국실내건축가협회 (K-IAA) · INDEX",
    copyright: "© 2025 한국실내건축가협회 (K-IAA). All rights reserved.",
  },
};
