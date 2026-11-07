/**
 * About (협회 소개) landing page copy — modelled on the cdsa.kr home page structure
 * (hero → mission → problems → curriculum → showcase → people → keyword cloud → CTA).
 * Seminars and cases on the page come from live data; this file holds the copy.
 */
export const about = {
  hero: {
    eyebrow: "K-IAA · INDEX CASE LIBRARY",
    title: "하자의 기록이,",
    titleAccent: "실내건축의 기준이 됩니다.",
    lead: "한국실내건축가협회와 함께\n현장의 경험을 기록하고, 다음 현장의 실수를 막으세요.",
    body: "INDEX는 실내건축 현장에서 축적된 하자 사례를 원인 분석부터 보수 방법, 재발 방지 방안까지 정리하고, 실무 세미나로 현장의 기준을 함께 만들어 갑니다.",
    primary: { label: "사례 검색하기", to: "/cases" },
    secondary: { label: "세미나 일정 보기", to: "/seminars" },
  },

  mission: {
    eyebrow: "OUR MISSION",
    statement: "하자는 반복됩니다.",
    statementAccent: "기록되지 않았기 때문입니다.",
    pillars: [
      { no: "01", title: "기록", en: "RECORD", body: "흩어진 현장의 하자를 현상·원인·보수·재발 방지의 같은 틀로 남깁니다." },
      { no: "02", title: "분석", en: "ANALYZE", body: "공종과 부위별로 원인을 분석해, 반복되는 하자의 패턴을 찾아냅니다." },
      { no: "03", title: "공유", en: "SHARE", body: "사례와 세미나로 실무자에게 전해, 다음 현장의 기준이 되게 합니다." },
    ],
  },

  problems: {
    eyebrow: "THE FIELD · 현장의 문제",
    title: "우리가",
    titleAccent: "실제로 푸는",
    titleTail: "문제들.",
    lead: "실내건축 현장에서 가장 자주, 가장 비싸게 반복되는 하자들. INDEX는 이 문제들을 사례로 정리합니다.",
    items: [
      { tag: "방수/누수", title: "욕실 방수층 시공 후 반복되는 누수", body: "담수 테스트 기준, 방수층 립업 높이, 배수구 주변 처리까지 누수 경로를 추적합니다." },
      { tag: "타일/마감", title: "타일 들뜸·균열의 바탕면 원인", body: "접착제 선정, 바탕면 함수율, 신축 줄눈 누락 등 들뜸의 진짜 원인을 판별합니다." },
      { tag: "단열/결로", title: "결로·곰팡이와 단열 결손 구간", body: "열교 부위와 단열재 이음부 처리 불량으로 생기는 결로를 진단하고 보완합니다." },
      { tag: "구조/균열", title: "부동침하에 의한 벽체·바닥 균열", body: "균열의 형태와 방향으로 원인을 판독하고, 보수 공법을 선정하는 기준을 다룹니다." },
      { tag: "설비/배관", title: "숨은 배관 누수 위치 특정", body: "비파괴 진단 장비와 시공 도면으로 매립 배관의 누수 지점을 좁혀 갑니다." },
      { tag: "분쟁/기준", title: "하자 분쟁 시 판단 기준 정리", body: "시공 기준과 사례를 근거로, 하자 여부와 책임 범위를 판단하는 기준을 정리합니다." },
    ],
  },

  curriculum: {
    eyebrow: "SEMINARS · 실무 세미나",
    title: "우리 현장은 지금",
    titleAccent: "어느 단계에 있습니까?",
    lead: "공종별 기초 과정으로 하자를 이해하고, 심화 과정으로 진단과 보수 판단까지. 관리자가 게시한 세미나가 이 표에 바로 반영됩니다.",
    topics: [
      { key: "방수", label: "방수 · 누수", match: /방수|누수/ },
      { key: "마감", label: "타일 · 마감", match: /타일|마감/ },
      { key: "단열", label: "단열 · 결로", match: /단열|결로/ },
      { key: "구조", label: "구조 · 균열", match: /구조|균열|침하/ },
      { key: "기타", label: "설계 · 품질", match: /.*/ },
    ],
    cards: [
      { kicker: "BASIC · 기초 과정", title: "하자를 이해하는\n공종별 기초", body: "하자가 생기는 원리와 공종별 시공 기준을 현장 사례로 익힙니다.", link: "기초 세미나 보기" },
      { kicker: "ADVANCED · 심화 과정", title: "진단과 보수 판단까지\n심화 실무", body: "원인 판독, 진단 장비 활용, 보수 공법 선정까지 실무 판단을 다룹니다.", link: "심화 세미나 보기" },
      { kicker: "CUSTOM · 맞춤 교육", title: "우리 조직에 맞춘\n교육 설계", body: "조직의 현장과 공종에 맞춰 사례 중심의 맞춤 세미나를 설계합니다.", link: "세미나 일정 보기", dark: true },
    ],
  },

  showcase: {
    eyebrow: "CASE LIBRARY · 사례 도서관",
    title: "INDEX에서 이런 사례를",
    titleAccent: "찾을 수 있습니다.",
    lead: "모든 사례는 현상, 원인 분석, 보수 방법, 재발 방지 방안의 순서로 정리되어 있습니다.",
    more: "사례 전체 보기",
  },

  people: {
    eyebrow: "THE NETWORK",
    title: "협회의 전문가들.",
    lead: "실내건축 현장 경험을 가진 협회 운영진과 분야별 전문가들이 사례를 검토하고 세미나를 설계합니다.",
    more: "운영진 전체 보기",
    keywords: ["K-IAA", "VICE", "TECH", "EDU", "CASE", "OFFICE"],
  },

  cloud: {
    eyebrow: "WHAT WE RECORD",
    title: "INDEX가 기록하는",
    titleAccent: "하자들.",
    lead: "방수부터 설비까지, 실내건축 현장에서 마주하는 하자를 유형별로 기록합니다.",
    words: [
      ["누수", 5], ["결로", 5], ["타일 들뜸", 4], ["균열", 4], ["곰팡이", 4], ["방수층 파손", 3],
      ["부동침하", 3], ["배관 누수", 3], ["단열 결손", 3], ["줄눈 탈락", 2], ["도장 박리", 2],
      ["마루 들뜸", 2], ["실리콘 열화", 2], ["창호 누기", 2], ["층간 소음", 2], ["열교", 2],
      ["배수 불량", 2], ["백화", 1], ["석고보드 처짐", 1], ["문틀 뒤틀림", 1], ["벽지 들뜸", 1],
      ["하수 냄새", 1], ["전기 누전", 1], ["환기 불량", 1], ["천장 누수", 1], ["몰딩 벌어짐", 1],
    ] as [string, number][],
  },

  cta: {
    eyebrow: "INDEX · K-IAA",
    title: "하자를 기록하고,",
    titleAccent: "더 나은 시공의 기준을 쌓는 곳.",
    body: "사례를 찾아보고, 세미나에서 기준을 익히세요.\n기록이 쌓일수록 다음 현장은 더 단단해집니다.",
    primary: { label: "사례 검색하기", to: "/cases" },
    secondary: { label: "세미나 신청하기", to: "/seminars" },
  },
};
