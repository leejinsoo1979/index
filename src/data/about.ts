/**
 * About (협회 소개) landing page copy — modelled on the cdsa.kr home page structure
 * (hero → mission → problems → curriculum → showcase → people → keyword cloud → CTA).
 * Seminars and cases on the page come from live data; this file holds the copy.
 */
export const about = {
  hero: {
    eyebrow: "주거인테리어 협회 · INDEX",
    title: "전문가의 연결로,",
    titleAccent: "더 나은 주거공간을 만듭니다.",
    lead: "INDEX는 주거 실내건축 분야의 전문가들이 모여\n정보와 경험을 나누고, 공간의 혁신과 인테리어의 다양한 문제 해결을 함께 추구하는 집단입니다.",
    primary: { label: "경험과 사례 둘러보기", to: "/cases" },
    secondary: { label: "세미나 일정 보기", to: "/seminars" },
  },

  mission: {
    eyebrow: "OUR MISSION",
    statement: "서로의 전문성이 만나,",
    statementAccent: "주거의 가능성을 넓힙니다.",
    pillars: [
      { no: "01", title: "교류", en: "EXCHANGE", body: "설계·시공·자재·기술 등 각 분야의 전문가들이 정보와 경험, 서로 다른 관점을 나눕니다." },
      { no: "02", title: "혁신", en: "INNOVATE", body: "변화하는 생활 방식과 새로운 기술을 탐구하고, 더 나은 주거공간과 일하는 방식을 제안합니다." },
      { no: "03", title: "해결", en: "SOLVE", body: "기획부터 설계, 시공과 사용까지 인테리어 과정에서 마주하는 다양한 문제의 해법을 함께 찾습니다." },
    ],
  },

  problems: {
    eyebrow: "SHARED CHALLENGES · 함께 풀어가는 과제",
    title: "우리가",
    titleAccent: "함께 푸는",
    titleTail: "문제들.",
    lead: "공간의 쓰임부터 자재 선택, 시공 품질과 기술 활용까지. 주거 실내건축의 다양한 과제를 전문가의 경험과 지식으로 함께 풀어갑니다.",
    items: [
      { image: "/images/wiki/interior", imageAlt: "주거공간의 구성과 생활 동선을 표현한 AI 생성 대표 이미지", tag: "공간/설계", title: "변화하는 삶에 공간은 어떻게 답할까요?", body: "가족 구성과 생활 방식의 변화를 읽고, 동선·수납·조명 등 일상의 질을 높이는 공간 해법을 나눕니다." },
      { image: "/images/wiki/materials", imageAlt: "주거인테리어 자재의 질감과 조합을 표현한 AI 생성 대표 이미지", tag: "자재/환경", title: "자재 선택에 필요한 정보를 연결합니다", body: "디자인과 성능, 비용과 유지관리까지. 흩어진 자재 정보와 사용 경험을 모아 선택의 근거를 쌓습니다." },
      { image: "/images/wiki/site-inspection", imageAlt: "도면과 현장 시공을 함께 검토하는 AI 생성 대표 이미지", tag: "시공/품질", title: "설계의 의도를 현장의 완성도로 잇습니다", body: "도면과 현장 사이의 간극, 공정 간 소통과 품질 관리의 과제를 여러 분야의 시선으로 검토합니다." },
      { image: "/images/ai/problem-tile-defect", imageAlt: "현장의 문제를 점검하고 원인을 살피는 AI 생성 대표 이미지", tag: "현장/해결", title: "반복되는 문제에서 다음 현장의 답을 찾습니다", body: "하자와 사용 불편, 예상 밖의 현장 변수까지. 원인과 대응 경험을 나누고 더 나은 판단 기준을 만듭니다." },
      { image: "/images/ai/agent-messenger", imageAlt: "자료를 함께 검토하며 의견을 나누는 전문가들의 AI 생성 대표 이미지", tag: "지식/교류", title: "개인의 경험을 함께 쓰는 지식으로 바꿉니다", body: "전문가마다 쌓아온 노하우와 자료를 연결하고, 질문과 토론을 통해 서로의 시야와 역량을 넓힙니다." },
      { image: "/images/ai/agent-graph", imageAlt: "다양한 자재와 지식의 새로운 연결을 표현한 AI 생성 대표 이미지", tag: "기술/혁신", title: "새로운 기술을 주거 실무의 가능성으로", body: "AI와 디지털 도구를 설계·문서·정보 탐색에 활용하며, 공간을 만들고 일하는 새로운 방식을 탐구합니다." },
    ],
  },

  curriculum: {
    eyebrow: "SEMINARS · 실무 세미나",
    title: "경험을 나누고,",
    titleAccent: "전문성을 함께 넓힙니다.",
    lead: "공간 설계와 시공, 자재와 환경, AI 활용과 협업까지. 서로의 경험을 배우고 실무의 새로운 관점을 발견하는 세미나입니다.",
    topics: [
      { key: "공간", label: "공간 · 설계", match: /공간|설계|디자인|동선|수납|조명/ },
      { key: "시공", label: "시공 · 품질", match: /시공|공정|품질|하자|방수|누수|타일|마감|단열|결로|구조|균열|침하/ },
      { key: "자재", label: "자재 · 환경", match: /자재|소재|환경|친환경|지속가능/ },
      { key: "기술", label: "AI · 디지털", match: /AI|인공지능|디지털|자동화|BIM/i },
      { key: "기타", label: "사업 · 협업", match: /.*/ },
    ],
    cards: [
      { kicker: "BASIC · 기초 과정", title: "분야를 이해하고\n실무의 바탕을 쌓습니다", body: "주거 실내건축의 개념과 흐름을 익히고, 설계·시공·자재의 기본을 함께 살펴봅니다.", link: "기초 세미나 보기" },
      { kicker: "ADVANCED · 심화 과정", title: "경험을 비교하며\n해법을 깊이 탐구합니다", body: "구체적인 프로젝트와 과제를 중심으로 분야 간 관점을 나누고 실무 판단을 발전시킵니다.", link: "심화 세미나 보기" },
      { kicker: "CUSTOM · 맞춤 교육", title: "우리 팀의 과제에서\n배움이 시작됩니다", body: "팀과 프로젝트가 마주한 과제에 맞춰 필요한 지식과 도구, 협업 방식을 함께 탐구합니다.", link: "세미나 일정 보기", dark: true },
    ],
  },

  agents: {
    eyebrow: "AI AGENTS · 실무에 사용하는 AI 도구",
    title: "전문가의 지식과 실무에,",
    titleAccent: "AI 도구를 더하세요.",
    lead: "아이디어 탐색부터 문서 작성, 자료 정리와 지식 연결까지. 전문가의 판단과 협업을 돕는 INDEX의 AI 도구를 만나보세요.",
  },

  people: {
    eyebrow: "THE NETWORK",
    title: "협회의 전문가들.",
    lead: "주거 실내건축의 다양한 분야에서 활동하는 전문가들이 모여 정보를 주고받고, 서로의 경험으로 새로운 가능성을 탐구합니다.",
    more: "운영진 전체 보기",
    keywords: ["설계", "시공", "자재", "기술", "교류", "혁신"],
  },

  cloud: {
    eyebrow: "WHAT WE EXPLORE",
    title: "INDEX가 함께 탐구하는",
    titleAccent: "주거의 가능성.",
    lead: "생활과 공간, 재료와 기술, 사람과 협업. 다양한 전문성이 만나는 주제들을 연결합니다.",
    words: [
      ["주거공간", 5], ["전문가 교류", 5], ["공간 혁신", 4], ["라이프스타일", 4], ["설계", 4], ["리모델링", 3],
      ["자재", 3], ["시공 품질", 3], ["AI 활용", 3], ["지속가능성", 2], ["조명", 2],
      ["수납", 2], ["동선", 2], ["실내환경", 2], ["디지털 전환", 2], ["협업", 2],
      ["프로젝트 관리", 2], ["시공 디테일", 1], ["유지관리", 1], ["사용자 경험", 1], ["비용과 가치", 1],
      ["현장 문제 해결", 1], ["정보 공유", 1], ["세미나", 1], ["지식 아카이브", 1], ["새로운 주거문화", 1],
    ] as [string, number][],
  },

  cta: {
    eyebrow: "INDEX · 주거인테리어 협회",
    title: "경험을 나누고,",
    titleAccent: "함께 주거의 다음을 만듭니다.",
    body: "질문과 경험, 새로운 아이디어를 연결합니다.\n주거 실내건축의 더 나은 해법을 INDEX에서 함께 찾아보세요.",
    primary: { label: "경험과 사례 둘러보기", to: "/cases" },
    secondary: { label: "세미나 신청하기", to: "/seminars" },
  },
};
