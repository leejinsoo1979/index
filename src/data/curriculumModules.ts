/**
 * 커리큘럼 빌더의 기본 강의 모듈 라이브러리 (인테리어 실무 × AI).
 *
 * 관리자는 /admin/curriculum 에서 이 모듈들을 일차별로 배치해 과정을 만든다.
 * Firestore가 비어 있으면 "기본 모듈 불러오기"로 이 목록을 한 번 옮겨 담고,
 * 이후 추가·수정·삭제는 Firestore(`curriculumModules`)에서 관리한다.
 */

export type ModuleLevel = "기초" | "응용" | "심화";

export interface CurriculumCategory {
  key: string;
  label: string;
}

export interface CurriculumModule {
  /** 모듈 코드 겸 문서 id (예: "EST-01") */
  id: string;
  category: string;
  level: ModuleLevel;
  title: string;
  summary: string;
  /** 강의 시간(분) */
  minutes: number;
  /** 학습 목표 */
  objectives: string[];
  /** 실습 내용 */
  practice: string;
  /** 수강 후 손에 남는 산출물 */
  deliverable: string;
  /** 대상 예 */
  audience: string;
  /** 주의할 점 (법규·수량 등 사람이 꼭 확인해야 하는 부분) */
  caution?: string;
}

export const MODULE_LEVELS: ModuleLevel[] = ["기초", "응용", "심화"];

export const CURRICULUM_CATEGORIES: CurriculumCategory[] = [
  { key: "ai", label: "AI 기초·요청·검증" },
  { key: "estimate", label: "견적·자재" },
  { key: "site", label: "시공·현장" },
  { key: "law", label: "법규·기준" },
  { key: "defect", label: "하자·사후관리" },
  { key: "contract", label: "계약·분쟁" },
  { key: "safety", label: "안전관리" },
  { key: "cost", label: "원가·정산" },
  { key: "partner", label: "협력업체·인력" },
  { key: "client", label: "고객 커뮤니케이션" },
  { key: "knowledge", label: "교육·지식·협회" },
  { key: "tools", label: "업무 자동화·도구" },
];

export const SEED_MODULES: CurriculumModule[] = [
  // ── AI 기초·요청·검증 ──
  {
    id: "AI-01", category: "ai", level: "기초", minutes: 90,
    title: "AI 실무 입문: 인테리어 업무에서 AI가 잘하는 일과 못하는 일",
    summary: "글쓰기·정리·분류·초안처럼 AI에 맡기기 좋은 일과, 법규 판단·최종 수량처럼 사람이 확인해야 하는 일을 구분합니다.",
    objectives: ["생성형 AI의 작동 방식과 한계를 이해한다", "내 업무 중 AI에 맡길 일을 고른다"],
    practice: "자기 업무 10개를 적고 AI 위임 가능·보조·불가로 분류",
    deliverable: "AI 위임 업무표",
    audience: "대표·실장·현장소장 전원",
  },
  {
    id: "AI-02", category: "ai", level: "기초", minutes: 90,
    title: "좋은 요청 쓰기: 현장 정보를 AI가 알아듣게 정리하기",
    summary: "공간 조건·예산·자재·일정을 빠짐없이 담는 요청 구조를 익혀, 다시 묻지 않아도 되는 답을 받습니다.",
    objectives: ["역할·맥락·조건·형식으로 요청을 구성한다", "반복 업무용 요청 템플릿을 만든다"],
    practice: "실제 현장 메모를 구조화된 요청으로 바꿔 결과 비교",
    deliverable: "업무별 요청 템플릿 5종",
    audience: "AI를 처음 쓰는 실무자",
  },
  {
    id: "AI-03", category: "ai", level: "응용", minutes: 60,
    title: "AI 결과 검증하기: 숫자·법규·출처 확인 루틴",
    summary: "그럴듯하지만 틀린 답을 걸러내는 확인 순서를 정하고, 수치와 근거를 원문으로 대조합니다.",
    objectives: ["AI 답변의 오류 유형을 안다", "숫자·법규·출처 검증 순서를 습관화한다"],
    practice: "일부러 오류가 섞인 AI 답변에서 틀린 곳 찾기",
    deliverable: "AI 결과 검증 체크리스트",
    audience: "AI 결과물을 고객·현장에 쓰는 실무자",
  },
  {
    id: "AI-04", category: "ai", level: "응용", minutes: 60,
    title: "사진·도면을 AI에게 보여주고 묻기",
    summary: "현장 사진, 평면도, 견적서 캡처를 AI에게 보여주고 상태 설명·항목 추출·누락 확인을 받습니다.",
    objectives: ["이미지 입력으로 할 수 있는 일과 한계를 안다", "사진 기반 질문을 정확하게 쓴다"],
    practice: "공정 중 현장 사진으로 진행 상태와 확인 포인트 받아보기",
    deliverable: "사진 질의 예시 모음",
    audience: "현장소장·공무",
  },
  {
    id: "AI-05", category: "ai", level: "심화", minutes: 90,
    title: "회사 자료로 답하는 AI 만들기 (지식베이스·RAG)",
    summary: "시공기준서·하자 사례·견적 자료를 지식베이스로 묶어, 회사 기준대로 답하는 AI의 구조를 이해합니다.",
    objectives: ["지식베이스·검색 기반 답변(RAG)의 원리를 안다", "AI에 넣을 회사 자료를 고르고 정리한다"],
    practice: "회사 문서 3종을 지식베이스로 올리고 질문해 보기",
    deliverable: "지식베이스 자료 목록과 정리 기준",
    audience: "대표·지식관리 담당",
  },

  // ── 견적·자재 ──
  {
    id: "EST-01", category: "estimate", level: "기초", minutes: 90,
    title: "견적 항목을 고객 언어로 풀어 쓰기",
    summary: "공종·자재·수량 위주의 견적서를 고객이 이해할 수 있는 설명서로 바꿔, 상담 시간을 줄이고 신뢰를 높입니다.",
    objectives: ["견적 항목별로 왜 필요한지 설명하는 문장을 만든다", "옵션·대안 비교를 함께 제시한다"],
    practice: "실제 견적서 1건을 고객용 견적 설명서로 변환",
    deliverable: "견적 설명서 템플릿",
    audience: "영업·상담·실장",
  },
  {
    id: "EST-02", category: "estimate", level: "기초", minutes: 60,
    title: "자재 비교표 만들기: 가격·내구성·관리 기준",
    summary: "마루·타일·도기·벽지 등을 같은 기준으로 비교한 표를 만들어 고객 선택을 돕습니다.",
    objectives: ["비교 기준(가격·내구성·관리·친환경)을 정한다", "AI로 비교표 초안을 만들고 검증한다"],
    practice: "욕실 타일 3종 비교표 작성",
    deliverable: "자재 비교표",
    audience: "디자이너·영업",
    caution: "가격·인증 정보는 제조사·대리점 최신 자료로 확인",
  },
  {
    id: "EST-03", category: "estimate", level: "응용", minutes: 90,
    title: "면적·수량 개략 산출 보조",
    summary: "평면 치수로 바닥·벽 면적과 타일·도배 수량을 개략 계산하고, 할증과 로스를 반영합니다.",
    objectives: ["면적·수량 산출 과정을 AI와 단계별로 진행한다", "로스율·할증 반영 기준을 정한다"],
    practice: "주방·욕실 1세트 개략 물량 산출",
    deliverable: "개략 물량 산출표",
    audience: "공무·견적 담당",
    caution: "최종 수량은 실측·도면 기준으로 재확인",
  },
  {
    id: "EST-04", category: "estimate", level: "응용", minutes: 90,
    title: "거래명세서로 자재 단가 DB 쌓기",
    summary: "흩어진 거래명세서·견적서에서 자재명·규격·단가를 뽑아 회사 단가표로 정리합니다.",
    objectives: ["문서에서 표 데이터를 추출한다", "규격·단위가 섞인 데이터를 정규화한다"],
    practice: "명세서 사진 10장을 단가표로 변환",
    deliverable: "자재 단가 DB (엑셀)",
    audience: "공무·구매 담당",
  },
  {
    id: "EST-05", category: "estimate", level: "심화", minutes: 120,
    title: "견적서 자동 초안: 공종 템플릿과 단가 DB 연결",
    summary: "공종별 견적 템플릿과 단가 DB를 묶어, 평형·범위만 넣으면 견적 초안이 나오는 흐름을 만듭니다.",
    objectives: ["공종 템플릿을 설계한다", "단가 DB와 연결해 초안을 자동 생성한다"],
    practice: "30평대 아파트 전체 리모델링 견적 초안 만들기",
    deliverable: "자동 견적 초안 양식",
    audience: "대표·견적 담당",
    caution: "현장 조건에 따른 조정은 담당자가 최종 판단",
  },

  // ── 시공·현장 ──
  {
    id: "SITE-01", category: "site", level: "기초", minutes: 60,
    title: "공정표 초안 만들기: 철거부터 준공까지",
    summary: "공사 범위를 넣으면 공종 순서·기간·선후 관계가 잡힌 공정표 초안을 만들고 현장에 맞게 조정합니다.",
    objectives: ["공종 선후 관계를 정리한다", "AI 공정표를 현장 조건으로 보정한다"],
    practice: "욕실·주방 포함 부분 리모델링 공정표 작성",
    deliverable: "공정표 초안",
    audience: "현장소장·실장",
  },
  {
    id: "SITE-02", category: "site", level: "기초", minutes: 60,
    title: "공종별 시공 체크리스트 (방수·단열·전기·목공)",
    summary: "공종별로 놓치기 쉬운 확인 항목을 체크리스트로 만들어 현장 점검에 바로 씁니다.",
    objectives: ["공종별 핵심 확인 항목을 정리한다", "사진 기록 항목을 함께 정한다"],
    practice: "욕실 방수 공정 체크리스트 작성",
    deliverable: "공종별 체크리스트",
    audience: "현장소장·작업 반장",
  },
  {
    id: "SITE-03", category: "site", level: "응용", minutes: 90,
    title: "현장 사진으로 품질 1차 점검하기",
    summary: "균열·누수 흔적·마감 불량을 사진으로 1차 확인하고, 추가 확인이 필요한 부분을 표시합니다.",
    objectives: ["사진 판독 요청을 정확하게 쓴다", "AI 판독 결과의 한계를 안다"],
    practice: "마감 공정 사진 세트로 불량 후보 찾기",
    deliverable: "사진 점검 기록지",
    audience: "현장소장·감리",
    caution: "최종 판단은 현장 확인으로",
  },
  {
    id: "SITE-04", category: "site", level: "응용", minutes: 60,
    title: "음성 메모·카톡을 작업일지로 정리하기",
    summary: "현장에서 남긴 음성 메모와 단톡방 대화를 날짜별 작업일지·이슈 목록으로 자동 정리합니다.",
    objectives: ["비정형 기록을 일지 형식으로 바꾼다", "이슈·결정 사항을 따로 뽑는다"],
    practice: "하루치 단톡방 대화를 작업일지로 변환",
    deliverable: "작업일지 양식",
    audience: "현장소장·공무",
  },
  {
    id: "SITE-05", category: "site", level: "심화", minutes: 120,
    title: "시공기준서 만들기: 회사 표준 공법 문서화",
    summary: "사람마다 다른 시공 방식을 회사 표준으로 정리해, 신입 교육과 품질 관리의 기준 문서로 만듭니다.",
    objectives: ["표준 공법 문서의 구성을 안다", "현장 노하우를 기준 문서로 옮긴다"],
    practice: "주력 공종 1개의 시공기준서 작성",
    deliverable: "공종별 시공기준서",
    audience: "대표·기술 책임자",
  },

  // ── 법규·기준 ──
  {
    id: "LAW-01", category: "law", level: "기초", minutes: 90,
    title: "법령·기준 찾고 쉬운 말로 풀기 (건축법·소방·KCS)",
    summary: "건축법·소방 관련 법령·KCS 기준을 찾아 조문을 쉬운 말로 풀고, 적용 사례를 정리합니다.",
    objectives: ["법령·기준 원문을 찾는 경로를 안다", "AI 해설을 원문과 대조한다"],
    practice: "실내 마감재 방염 기준 찾아 해설하기",
    deliverable: "법규 해설 노트",
    audience: "실장·설계 담당",
    caution: "해석 결과는 원문과 유권해석으로 반드시 확인",
  },
  {
    id: "LAW-02", category: "law", level: "응용", minutes: 90,
    title: "용도변경·인허가 체크리스트 만들기",
    summary: "상가·근린생활시설 인테리어에서 자주 걸리는 용도변경·신고 항목을 체크리스트로 정리합니다.",
    objectives: ["인허가가 필요한 공사 유형을 구분한다", "필요 서류와 절차를 정리한다"],
    practice: "카페 → 학원 용도변경 사례 체크리스트",
    deliverable: "인허가 체크리스트",
    audience: "상업 공간 실장·영업",
    caution: "관할 지자체 기준이 다를 수 있음",
  },
  {
    id: "LAW-03", category: "law", level: "응용", minutes: 60,
    title: "방화·내화·피난 기준 현장 적용 사례",
    summary: "방화구획·내화 마감·피난 동선 기준이 실제 인테리어 공사에 어떻게 적용되는지 사례로 익힙니다.",
    objectives: ["현장에서 자주 문제 되는 기준을 안다", "설계 단계에서 미리 확인한다"],
    practice: "상가 평면에서 피난 동선 문제 찾기",
    deliverable: "기준 적용 사례집",
    audience: "설계·현장 담당",
    caution: "최신 개정 여부 확인 필수",
  },
  {
    id: "LAW-04", category: "law", level: "심화", minutes: 90,
    title: "법규 해설서 작성: 출처 인용 원칙",
    summary: "고객·회원에게 배포할 법규 해설서를 조문 인용·개정일·출처 표기 원칙에 맞춰 작성합니다.",
    objectives: ["출처 없는 단정을 피하는 문장 원칙을 안다", "해설서 구조를 설계한다"],
    practice: "주제 1개로 해설서 초안 작성",
    deliverable: "법규 해설서",
    audience: "협회 교육 담당·실장",
  },

  // ── 하자·사후관리 ──
  {
    id: "DEF-01", category: "defect", level: "기초", minutes: 90,
    title: "하자 유형 분류와 원인 추정 (결로·누수·들뜸·균열)",
    summary: "대표 하자를 유형별로 분류하고, 증상에서 원인을 추정하는 질문 순서를 익힙니다.",
    objectives: ["하자 유형별 대표 원인을 안다", "원인 추정에 필요한 정보를 묻는다"],
    practice: "하자 사진·증상으로 원인 후보 정리",
    deliverable: "하자 유형 분류표",
    audience: "현장소장·AS 담당",
  },
  {
    id: "DEF-02", category: "defect", level: "기초", minutes: 60,
    title: "하자 사례 검색: INDEX 사례 DB 활용",
    summary: "INDEX 하자 사례 DB에서 비슷한 사례와 해결 방법을 찾고, 내 현장 대응에 적용합니다.",
    objectives: ["사례 검색어를 잘 고른다", "사례의 조건 차이를 비교한다"],
    practice: "실제 하자 1건으로 유사 사례 3건 찾기",
    deliverable: "사례 비교 메모",
    audience: "현장소장·AS 담당",
  },
  {
    id: "DEF-03", category: "defect", level: "응용", minutes: 90,
    title: "하자 분석 보고서 작성",
    summary: "현상·원인·보수 방법·재발 방지책을 담은 하자 분석 보고서를 사진과 함께 작성합니다.",
    objectives: ["보고서 구성을 안다", "원인과 책임 판단을 구분해 쓴다"],
    practice: "욕실 누수 사례 보고서 작성",
    deliverable: "하자 분석 보고서",
    audience: "현장소장·기술 책임자",
  },
  {
    id: "DEF-04", category: "defect", level: "응용", minutes: 60,
    title: "AS 접수 자동 분류와 긴급도 판단",
    summary: "고객 AS 접수 내용을 하자 종류·긴급도별로 자동 분류해 출동 우선순위를 정합니다.",
    objectives: ["분류 기준과 긴급도 기준을 정한다", "AI 분류 결과를 검토하는 흐름을 만든다"],
    practice: "AS 접수 20건 자동 분류",
    deliverable: "AS 분류 기준표",
    audience: "AS 담당·고객관리",
  },
  {
    id: "DEF-05", category: "defect", level: "응용", minutes: 60,
    title: "보증기간·정기점검 일정 관리",
    summary: "준공일 기준 하자보수 기간과 정기점검 일정을 정리하고, 만료 전 알림과 점검 안내문을 만듭니다.",
    objectives: ["공종별 보증기간을 정리한다", "점검 안내를 자동화한다"],
    practice: "준공 현장 목록으로 점검 일정표 만들기",
    deliverable: "보증·점검 관리표",
    audience: "AS 담당·고객관리",
  },
  {
    id: "DEF-06", category: "defect", level: "심화", minutes: 120,
    title: "반복 하자 데이터로 예방 체크리스트 만들기",
    summary: "과거 AS·하자 기록을 분석해 자주 생기는 하자를 찾고, 시공 단계 예방 체크리스트로 되돌립니다.",
    objectives: ["하자 데이터를 정리·집계한다", "분석 결과를 시공 기준에 반영한다"],
    practice: "1년치 AS 기록 분석",
    deliverable: "하자 예방 체크리스트",
    audience: "대표·기술 책임자",
  },

  // ── 계약·분쟁 ──
  {
    id: "CON-01", category: "contract", level: "기초", minutes: 60,
    title: "공사 계약서 필수 조항 점검 (하자보수·지체상금·추가공사)",
    summary: "표준계약서 기준으로 빠지기 쉬운 조항을 점검하고, 분쟁을 줄이는 문구를 정리합니다.",
    objectives: ["분쟁이 잦은 조항을 안다", "계약서 점검 순서를 익힌다"],
    practice: "실제 계약서에서 누락 조항 찾기",
    deliverable: "계약서 점검표",
    audience: "대표·영업",
    caution: "법률 자문을 대체하지 않음",
  },
  {
    id: "CON-02", category: "contract", level: "응용", minutes: 60,
    title: "추가·변경 공사 내역서와 고객 서명 문서",
    summary: "현장에서 바뀐 요청을 금액·기간 변경과 함께 정리해 고객 확인을 받는 문서를 만듭니다.",
    objectives: ["변경 내역을 빠짐없이 기록한다", "고객 확인 절차를 정한다"],
    practice: "변경 요청 대화로 변경 내역서 작성",
    deliverable: "추가·변경 공사 내역서",
    audience: "현장소장·영업",
  },
  {
    id: "CON-03", category: "contract", level: "심화", minutes: 90,
    title: "분쟁 대응 경위서: 사진·공정·대화 기록 시간순 정리",
    summary: "분쟁이 생겼을 때 사진·공정 기록·대화 내역을 시간순으로 묶어 경위서 초안을 만듭니다.",
    objectives: ["증빙 자료를 시간순으로 정리한다", "사실과 의견을 구분해 쓴다"],
    practice: "가상 분쟁 사례로 경위서 작성",
    deliverable: "분쟁 경위서",
    audience: "대표·실장",
    caution: "법적 대응은 전문가와 함께",
  },

  // ── 안전관리 ──
  {
    id: "SAF-01", category: "safety", level: "기초", minutes: 60,
    title: "공종별 위험성평가서 작성",
    summary: "철거·전기·고소작업 등 공종별 위험요인과 대책을 정리한 위험성평가서를 만듭니다.",
    objectives: ["위험요인 도출 방법을 안다", "대책을 구체적으로 쓴다"],
    practice: "철거 공정 위험성평가서 작성",
    deliverable: "위험성평가서",
    audience: "현장소장·안전 담당",
  },
  {
    id: "SAF-02", category: "safety", level: "기초", minutes: 45,
    title: "TBM(작업 전 안전회의) 일지 자동 작성",
    summary: "그날 작업 내용만 입력하면 안전 지시사항과 TBM 일지가 만들어지는 흐름을 익힙니다.",
    objectives: ["TBM 일지 필수 항목을 안다", "매일 쓰는 양식을 자동화한다"],
    practice: "오늘 작업으로 TBM 일지 만들기",
    deliverable: "TBM 일지 양식",
    audience: "현장소장·반장",
  },
  {
    id: "SAF-03", category: "safety", level: "응용", minutes: 90,
    title: "중대재해처벌법 대응 서류 관리 (점검표·교육 기록)",
    summary: "안전보건 점검표·교육 기록·조치 이력을 체계적으로 남기는 서류 관리 방법을 익힙니다.",
    objectives: ["필요 서류 목록을 안다", "기록이 쌓이는 관리 구조를 만든다"],
    practice: "월간 안전 점검 서류 묶음 만들기",
    deliverable: "안전 서류 관리 체계",
    audience: "대표·안전 담당",
    caution: "최신 법령·고시 기준 확인",
  },

  // ── 원가·정산 ──
  {
    id: "COST-01", category: "cost", level: "응용", minutes: 90,
    title: "실행예산 대비 실적 비교표",
    summary: "계획한 실행예산과 실제 지출을 공종별로 비교해 어디서 비용이 초과됐는지 찾습니다.",
    objectives: ["예산·실적 비교 구조를 만든다", "초과 원인을 정리한다"],
    practice: "완료 현장 1건 예산·실적 비교",
    deliverable: "예산 대비 실적표",
    audience: "대표·공무",
  },
  {
    id: "COST-02", category: "cost", level: "응용", minutes: 60,
    title: "기성 정산서: 공정률 기준 중간 정산",
    summary: "공정률을 기준으로 중간 정산 금액을 계산하고 고객·협력업체용 정산서를 만듭니다.",
    objectives: ["공정률 산정 방법을 안다", "정산서 양식을 표준화한다"],
    practice: "진행 현장 기성 정산서 작성",
    deliverable: "기성 정산서",
    audience: "공무·경리",
  },
  {
    id: "COST-03", category: "cost", level: "심화", minutes: 90,
    title: "현장별 수익성 분석 리포트",
    summary: "현장별 매출·원가·추가공사·AS 비용을 모아 수익성을 비교하고 다음 수주 판단에 씁니다.",
    objectives: ["현장 데이터를 한 표로 모은다", "수익성 지표를 정한다"],
    practice: "최근 현장 5건 수익성 비교",
    deliverable: "수익성 분석 리포트",
    audience: "대표",
  },

  // ── 협력업체·인력 ──
  {
    id: "PTN-01", category: "partner", level: "기초", minutes: 60,
    title: "협력업체 평가 기록표",
    summary: "업체별 품질·일정 준수·하자 발생 이력을 기록해 다음 발주 판단에 씁니다.",
    objectives: ["평가 항목을 정한다", "현장마다 기록이 쌓이게 한다"],
    practice: "주요 협력업체 5곳 평가표 작성",
    deliverable: "협력업체 평가표",
    audience: "대표·현장소장",
  },
  {
    id: "PTN-02", category: "partner", level: "응용", minutes: 60,
    title: "공정표 연동 작업자 배정표",
    summary: "공정표에 맞춰 공종별 인력·업체 투입 일정을 짜고 겹치는 일정을 찾습니다.",
    objectives: ["공정과 인력 투입을 연결한다", "현장 간 일정 충돌을 찾는다"],
    practice: "동시 진행 현장 2곳 배정표 만들기",
    deliverable: "작업자 배정표",
    audience: "현장소장·공무",
  },

  // ── 고객 커뮤니케이션 ──
  {
    id: "CLI-01", category: "client", level: "기초", minutes: 60,
    title: "공사 진행 리포트: 오늘 사진으로 고객 보고서",
    summary: "현장 사진과 짧은 메모로 고객용 진행 보고를 만들어, 불안과 문의 전화를 줄입니다.",
    objectives: ["고객이 궁금해하는 정보를 안다", "사진 설명을 고객 언어로 쓴다"],
    practice: "하루치 현장 사진으로 진행 리포트 작성",
    deliverable: "공사 진행 리포트 양식",
    audience: "현장소장·실장",
  },
  {
    id: "CLI-02", category: "client", level: "기초", minutes: 45,
    title: "관리사무소 공사 신고서·이웃 안내문",
    summary: "공사 기간·소음 작업 시간·연락처를 담은 신고서와 이웃 안내문을 빠르게 만듭니다.",
    objectives: ["필수 안내 항목을 안다", "민원을 줄이는 문장을 쓴다"],
    practice: "아파트 리모델링 안내문 작성",
    deliverable: "공사 안내문 세트",
    audience: "현장소장·공무",
  },
  {
    id: "CLI-03", category: "client", level: "응용", minutes: 60,
    title: "준공 인수인계서 (자재·관리법·보증·AS)",
    summary: "사용 자재·관리 방법·보증 기간·AS 연락처를 한 문서로 정리해 준공 때 전달합니다.",
    objectives: ["인수인계 필수 항목을 안다", "현장별로 자동 작성한다"],
    practice: "준공 현장 인수인계서 작성",
    deliverable: "준공 인수인계서",
    audience: "실장·AS 담당",
  },
  {
    id: "CLI-04", category: "client", level: "응용", minutes: 60,
    title: "상담 문의 1차 응대와 상담 예약 연결",
    summary: "홈페이지·메신저 문의에 1차 답변하고 필요한 정보를 받아 상담 예약으로 연결하는 흐름을 만듭니다.",
    objectives: ["자주 묻는 질문을 정리한다", "상담 전 받을 정보를 정한다"],
    practice: "문의 유형별 응대 문구 만들기",
    deliverable: "문의 응대 스크립트",
    audience: "영업·상담",
  },
  {
    id: "CLI-05", category: "client", level: "기초", minutes: 60,
    title: "시공사례 블로그·SNS 글 쓰기",
    summary: "전후 사진·자재·시공 포인트로 시공사례 블로그 글과 SNS 캡션을 만듭니다.",
    objectives: ["사례 글 구성을 안다", "검색에 걸리는 제목을 만든다"],
    practice: "준공 현장 1건으로 블로그 글·캡션 작성",
    deliverable: "시공사례 글 템플릿",
    audience: "마케팅·실장",
  },

  // ── 교육·지식·협회 ──
  {
    id: "EDU-01", category: "knowledge", level: "기초", minutes: 60,
    title: "신입 교육자료와 퀴즈 만들기",
    summary: "시공기준서·체크리스트를 바탕으로 신입 교육 문서와 확인 퀴즈를 만듭니다.",
    objectives: ["교육 목표를 정한다", "기준 문서로 교육자료를 만든다"],
    practice: "방수 공정 신입 교육자료·퀴즈 작성",
    deliverable: "신입 교육 패키지",
    audience: "대표·교육 담당",
  },
  {
    id: "EDU-02", category: "knowledge", level: "응용", minutes: 90,
    title: "회사 기술 Q&A 챗봇: 하자 사례·시공기준 근거 답변",
    summary: "하자 사례와 시공기준을 근거로 직원·회원 질문에 답하는 Q&A 챗봇을 구성합니다.",
    objectives: ["챗봇에 넣을 근거 자료를 정한다", "근거 없는 답을 막는 규칙을 만든다"],
    practice: "자주 묻는 기술 질문 10개로 챗봇 테스트",
    deliverable: "기술 Q&A 챗봇 설계서",
    audience: "기술 책임자·협회 운영",
  },
  {
    id: "EDU-03", category: "knowledge", level: "응용", minutes: 60,
    title: "업계 동향 리포트: 자재 가격·법 개정 정기 요약",
    summary: "자재 가격 변동과 법 개정 소식을 정해진 형식으로 모아 주기적으로 요약합니다.",
    objectives: ["모을 정보원과 형식을 정한다", "누락·중복을 점검한다"],
    practice: "한 달치 업계 소식 요약 리포트",
    deliverable: "월간 동향 리포트 양식",
    audience: "대표·협회 운영",
  },
  {
    id: "EDU-04", category: "knowledge", level: "기초", minutes: 45,
    title: "세미나 안내문·회원 공지 작성",
    summary: "세미나 개요·일정·신청 방법을 담은 안내문과 회원 공지를 빠르게 만듭니다.",
    objectives: ["안내문 필수 항목을 안다", "채널별(문자·메일·게시판) 문구를 만든다"],
    practice: "세미나 1건 안내문 세트 작성",
    deliverable: "안내문 템플릿",
    audience: "협회 운영",
  },

  // ── 업무 자동화·도구 ──
  {
    id: "TOOL-01", category: "tools", level: "응용", minutes: 90,
    title: "반복 문서를 템플릿으로: 견적·일지·보고서 양식 자동화",
    summary: "매번 새로 쓰는 문서를 템플릿과 입력 항목으로 나눠, 항목만 채우면 완성되게 만듭니다.",
    objectives: ["반복 문서의 고정·변동 부분을 나눈다", "입력 항목을 설계한다"],
    practice: "작업일지·보고서 양식 자동화",
    deliverable: "업무 템플릿 3종",
    audience: "공무·사무 담당",
  },
  {
    id: "TOOL-02", category: "tools", level: "심화", minutes: 120,
    title: "엑셀 대신 웹 도구 만들기: 현장 관리 미니 앱",
    summary: "현장 목록·공정·사진 기록을 한 화면에서 보는 간단한 웹 도구를 AI와 함께 만듭니다.",
    objectives: ["필요한 화면과 데이터를 정의한다", "AI로 도구를 만들고 고친다"],
    practice: "현장 관리 미니 앱 만들기",
    deliverable: "현장 관리 웹 도구",
    audience: "대표·IT 관심 실무자",
  },
  {
    id: "TOOL-03", category: "tools", level: "심화", minutes: 90,
    title: "예약 실행: 매주 자동으로 받는 리포트",
    summary: "정해진 시간에 자료를 모아 요약 리포트를 보내주는 자동 실행을 설정합니다.",
    objectives: ["자동화할 주기와 형식을 정한다", "결과 점검 방법을 정한다"],
    practice: "주간 현장 현황 리포트 자동화",
    deliverable: "자동 리포트 설정",
    audience: "대표·운영 담당",
  },
];

export interface CurriculumPreset {
  key: string;
  title: string;
  summary: string;
  audience: string;
  /** 일차별 모듈 id */
  days: string[][];
}

export const CURRICULUM_PRESETS: CurriculumPreset[] = [
  {
    key: "intro",
    title: "AI 실무 입문",
    summary: "인테리어 실무자가 AI로 문서·견적·자재 업무를 시작하는 1일 과정",
    audience: "AI를 처음 쓰는 실무자",
    days: [["AI-01", "AI-02", "AI-03", "EST-02"]],
  },
  {
    key: "site",
    title: "현장 실무자 과정",
    summary: "공정·체크리스트·작업일지·고객 보고까지 현장 문서 업무를 AI로 줄이는 2일 과정",
    audience: "현장소장·공무·반장",
    days: [
      ["AI-02", "SITE-01", "SITE-02", "SAF-02"],
      ["SITE-03", "SITE-04", "CLI-01", "DEF-01"],
    ],
  },
  {
    key: "owner",
    title: "대표·실장 경영 과정",
    summary: "견적·계약·원가·협력업체 관리를 데이터로 운영하는 2일 과정",
    audience: "대표·실장",
    days: [
      ["AI-01", "EST-01", "EST-04", "CON-01"],
      ["COST-01", "COST-02", "CON-02", "PTN-01"],
    ],
  },
  {
    key: "defect",
    title: "하자·품질 심화 과정",
    summary: "하자 분석·사례 검색·예방 체크리스트와 기술 Q&A까지 다루는 2일 심화 과정",
    audience: "기술 책임자·AS 담당",
    days: [
      ["DEF-01", "DEF-02", "DEF-03", "LAW-01"],
      ["DEF-04", "DEF-06", "SITE-05", "EDU-02"],
    ],
  },
  {
    key: "law-safety",
    title: "법규·안전 과정",
    summary: "법령 해설·인허가 체크리스트·위험성평가·안전 서류를 다루는 1일 과정",
    audience: "실장·안전 담당",
    days: [["LAW-01", "LAW-02", "SAF-01", "SAF-03"]],
  },
];
