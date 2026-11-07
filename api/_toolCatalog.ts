import {
  buildingSources,
  businessSources,
  checkBusinessStatus,
  checkLandUseActivity,
  getLawArticles,
  interpretationSources,
  INTERPRETATION_AGENCIES,
  kcscSources,
  landUseSources,
  lawSearchSources,
  lookupBuilding,
  regulationStatus,
  RegulationError,
  searchInterpretations,
  searchKcsc,
  searchLaws,
  validateBusiness,
  type InterpretationAgency,
  type LawKind,
  type RegulationSource,
} from "./_regulations.js";
import { isServerFirestoreConfigured } from "./_firebaseServer.js";
import { contractorSources, searchContractors } from "./_kiscon.js";
import type { AudienceId, StageId } from "../src/data/lifecycle.js";

/**
 * INDEX AI 도구 catalogue. Every tool has one shared shape — metadata for the /tools
 * explorer (stage, audience, inputs, data sources) plus a server-side `run` that returns
 * `{ ok, sources, data }` with citations — so the same tool can be run from its page or
 * called by the chatbots/agents. `stages`/`audience` use the shared ids in
 * src/data/lifecycle.ts (same as 업무 지도·커리큘럼); empty `stages` = 전 단계 공통.
 */

export type ToolField = {
  name: string;
  label: string;
  type: "text" | "textarea" | "select" | "checkbox";
  placeholder?: string;
  required?: boolean;
  help?: string;
  options?: { value: string; label: string }[];
};

type Requirement = "law" | "building" | "landUse" | "kcsc" | "business" | "contractors" | "wiki";

export type ToolResult = { ok: true; sources: RegulationSource[]; data: unknown } | { ok: false; error: string };

type ToolDef = {
  id: string;
  name: string;
  summary: string;
  description: string;
  stages: StageId[];
  audience: AudienceId[];
  tags: string[];
  dataSources: string[];
  status: "beta" | "stable";
  requires: Requirement[];
  inputs: ToolField[];
  example: Record<string, string | boolean>;
  run: (input: Record<string, unknown>) => Promise<{ sources: RegulationSource[]; data: unknown }>;
};

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const need = (v: unknown, label: string) => {
  const s = str(v);
  if (!s) throw new RegulationError(`${label}을(를) 입력해 주세요.`);
  return s;
};

const LAW_KIND_OPTIONS = [
  { value: "law", label: "법령 (법률·시행령·시행규칙)" },
  { value: "admrul", label: "행정규칙 (고시·훈령·예규)" },
  { value: "ordin", label: "자치법규 (조례·규칙)" },
];
const AGENCY_OPTIONS = (Object.keys(INTERPRETATION_AGENCIES) as InterpretationAgency[]).map((a) => ({
  value: a,
  label: a === "moleg" ? "법제처 법령해석례" : `${INTERPRETATION_AGENCIES[a]} 1차 해석`,
}));

const TOOLS: ToolDef[] = [
  {
    id: "site-building-check",
    name: "현장 건물 정보 조회",
    summary: "주소만 넣으면 건물 용도·연면적·층수·사용승인일·용도지역을 건축물대장에서 가져옵니다.",
    description: "공사 전 상담 단계에서 건물의 법규 적용 조건을 확인합니다. 표제부(주용도·구조·면적·층수), 층별 개요, 지역·지구를 함께 보여 주고, 원하면 건축인허가 기본개요도 조회합니다.",
    stages: ["needs", "prep"],
    audience: ["designer", "builder", "owner"],
    tags: ["건축물대장", "용도", "용도지역"],
    dataSources: ["국토교통부 건축HUB 건축물대장", "행정안전부 도로명주소"],
    status: "beta",
    requires: ["building"],
    inputs: [
      { name: "address", label: "현장 주소", type: "text", placeholder: "예: 서울 강남구 테헤란로 152", required: true },
      { name: "includePermits", label: "건축인허가 기본개요도 함께 조회", type: "checkbox" },
    ],
    example: { address: "서울 강남구 테헤란로 152" },
    run: async (i) => {
      const result = await lookupBuilding(need(i.address, "현장 주소"), { includePermits: i.includePermits === true });
      return { sources: buildingSources(result), data: result };
    },
  },
  {
    id: "land-use-check",
    name: "업종 입점 가능 여부",
    summary: "주소와 업종(예: 일반음식점)을 넣으면 그 땅의 용도지역에서 가능한 행위인지 확인합니다.",
    description: "상가 인테리어·용도변경 상담 전에 토지이용규제 행위제한 정보를 조회합니다. 결과는 참고용이며 최종 판단은 관할 기관 확인이 필요합니다.",
    stages: ["needs"],
    audience: ["designer", "builder", "owner"],
    tags: ["용도변경", "행위제한", "상가"],
    dataSources: ["국토교통부 토지이용규제정보서비스", "건축물대장 지역지구"],
    status: "beta",
    requires: ["landUse"],
    inputs: [
      { name: "address", label: "현장 주소", type: "text", placeholder: "예: 서울 마포구 양화로 45", required: true },
      { name: "activity", label: "업종·시설", type: "text", placeholder: "예: 일반음식점, 학원, 사무소", required: true },
    ],
    example: { address: "서울 마포구 양화로 45", activity: "일반음식점" },
    run: async (i) => {
      const result = await checkLandUseActivity(need(i.address, "현장 주소"), need(i.activity, "업종·시설"));
      return { sources: landUseSources(result), data: result };
    },
  },
  {
    id: "law-search",
    name: "법령 찾기",
    summary: "법령·고시·조례를 이름이나 핵심어로 찾아 시행일과 원문 링크를 보여 줍니다.",
    description: "건축법, 소방시설법, 실내건축 고시, 지자체 조례처럼 인테리어에 적용되는 규정을 국가법령정보센터에서 검색합니다.",
    stages: [],
    audience: ["designer", "builder"],
    tags: ["법령", "조례", "고시"],
    dataSources: ["법제처 국가법령정보"],
    status: "beta",
    requires: ["law"],
    inputs: [
      { name: "query", label: "법령명 또는 핵심어", type: "text", placeholder: "예: 실내건축, 건축법, 편의증진", required: true },
      { name: "kind", label: "종류", type: "select", options: LAW_KIND_OPTIONS },
    ],
    example: { query: "실내건축", kind: "admrul" },
    run: async (i) => {
      const items = await searchLaws(need(i.query, "법령명 또는 핵심어"), (str(i.kind) || "law") as LawKind);
      return { sources: lawSearchSources(items), data: { results: items } };
    },
  },
  {
    id: "law-articles",
    name: "조문 원문 보기",
    summary: "법령 이름과 조문 번호(또는 키워드)로 조문 원문을 그대로 가져옵니다.",
    description: "답변에 인용할 조문을 원문으로 확인합니다. 조문 번호(예: 46, 52의2)나 본문 키워드(예: 방화구획)로 찾을 수 있습니다.",
    stages: [],
    audience: ["designer", "builder"],
    tags: ["조문", "원문", "법령"],
    dataSources: ["법제처 국가법령정보"],
    status: "beta",
    requires: ["law"],
    inputs: [
      { name: "name", label: "정확한 법령명", type: "text", placeholder: "예: 건축법 시행령", required: true },
      { name: "article", label: "조문 번호", type: "text", placeholder: "예: 46, 52의2" },
      { name: "keyword", label: "본문 키워드", type: "text", placeholder: "예: 방화구획" },
      { name: "kind", label: "종류", type: "select", options: LAW_KIND_OPTIONS },
    ],
    example: { name: "건축법", article: "52의2" },
    run: async (i) => {
      const result = await getLawArticles({ name: need(i.name, "법령명"), article: str(i.article) || undefined, keyword: str(i.keyword) || undefined, kind: (str(i.kind) || "law") as LawKind });
      return {
        sources: result.articles.slice(0, 5).map((a) => ({ id: `law_${result.title}_${a.number}`, title: `${result.title} ${a.number}${a.title ? `(${a.title})` : ""}`.trim(), sourceType: "official_law" as const, publisher: "법제처 국가법령정보센터", url: result.url, snippet: a.text.slice(0, 300), retrievedAt: new Date().toISOString() })),
        data: result,
      };
    },
  },
  {
    id: "law-interpretations",
    name: "법령 해석 사례 찾기",
    summary: "국토교통부·소방청·법제처가 실제로 답한 해석 사례를 찾습니다.",
    description: "'이 상황에 어떤 규정이 적용되나'를 설명할 때 근거로 쓰는 공식 해석 사례입니다. 건축·주택은 국토교통부, 소방·다중이용업소는 소방청이 적합합니다.",
    stages: ["prep", "care"],
    audience: ["designer", "builder"],
    tags: ["법령해석", "국토교통부", "소방청"],
    dataSources: ["법제처 법령해석례", "중앙부처 1차 해석"],
    status: "beta",
    requires: ["law"],
    inputs: [
      { name: "query", label: "핵심어", type: "text", placeholder: "예: 용도변경, 방염, 발코니", required: true },
      { name: "agency", label: "해석 기관", type: "select", options: AGENCY_OPTIONS },
    ],
    example: { query: "방염", agency: "nfa" },
    run: async (i) => {
      const items = await searchInterpretations(need(i.query, "핵심어"), (str(i.agency) || "moleg") as InterpretationAgency);
      return { sources: interpretationSources(items), data: { results: items } };
    },
  },
  {
    id: "construction-standards",
    name: "설계·시공 기준(KDS·KCS) 찾기",
    summary: "국가건설기준 KDS(설계기준)·KCS(표준시방서)에서 공종별 기준을 찾습니다.",
    description: "방수·타일·도장·수장 공사처럼 시공 기준을 확인할 때 씁니다. 기준명 키워드로 찾습니다.",
    stages: ["design", "build", "quality"],
    audience: ["builder", "designer"],
    tags: ["KCS", "KDS", "표준시방서"],
    dataSources: ["국가건설기준센터"],
    status: "beta",
    requires: ["kcsc"],
    inputs: [
      { name: "keyword", label: "기준명 키워드", type: "text", placeholder: "예: 방수, 타일, 도장", required: true },
      { name: "type", label: "구분", type: "select", options: [{ value: "all", label: "전체" }, { value: "KCS", label: "KCS 표준시방서" }, { value: "KDS", label: "KDS 설계기준" }] },
    ],
    example: { keyword: "방수" },
    run: async (i) => {
      const items = await searchKcsc(need(i.keyword, "키워드"), (["KDS", "KCS"].includes(str(i.type)) ? str(i.type) : undefined) as "KDS" | "KCS" | undefined);
      return { sources: kcscSources(items), data: { results: items } };
    },
  },
  {
    id: "business-status",
    name: "사업자 상태 확인",
    summary: "사업자등록번호로 계속사업자·휴업·폐업 여부와 과세유형을 국세청에서 확인합니다.",
    description: "협력업체나 거래처가 정상 영업 중인지 계약 전에 확인합니다. 여러 번호를 쉼표로 구분해 한 번에 조회할 수 있습니다.",
    stages: ["contract"],
    audience: ["owner", "builder"],
    tags: ["사업자", "국세청", "거래처 확인"],
    dataSources: ["국세청 사업자등록 상태조회"],
    status: "beta",
    requires: ["business"],
    inputs: [{ name: "numbers", label: "사업자등록번호", type: "text", placeholder: "예: 124-81-00998, 220-81-62517", required: true }],
    example: { numbers: "124-81-00998" },
    run: async (i) => {
      const rows = await checkBusinessStatus(need(i.numbers, "사업자등록번호").split(/[,\s]+/).filter(Boolean));
      return { sources: businessSources(rows), data: { results: rows } };
    },
  },
  {
    id: "business-validate",
    name: "사업자등록증 진위 확인",
    summary: "등록증의 번호·개업일·대표자명이 국세청 정보와 일치하는지 확인합니다.",
    description: "받은 사업자등록증 사본이 실제 국세청 정보와 맞는지 확인합니다.",
    stages: ["contract"],
    audience: ["owner", "builder"],
    tags: ["사업자등록증", "진위확인"],
    dataSources: ["국세청 진위확인"],
    status: "beta",
    requires: ["business"],
    inputs: [
      { name: "businessNo", label: "사업자등록번호", type: "text", required: true },
      { name: "startDate", label: "개업연월일", type: "text", placeholder: "YYYYMMDD", required: true },
      { name: "ownerName", label: "대표자 성명", type: "text", required: true },
      { name: "companyName", label: "상호 (선택)", type: "text" },
    ],
    example: {},
    run: async (i) => {
      const result = await validateBusiness({ businessNo: need(i.businessNo, "사업자등록번호"), startDate: need(i.startDate, "개업연월일"), ownerName: need(i.ownerName, "대표자 성명"), companyName: str(i.companyName) || undefined });
      return { sources: businessSources([{ businessNo: result.businessNo, status: result.status, taxType: result.taxType }]), data: result };
    },
  },
  {
    id: "contractor-license",
    name: "건설업 면허 조회",
    summary: "업체의 등록 업종(실내건축공사업 등)·폐업 여부·행정처분 이력을 확인합니다.",
    description: "국토교통부 키스콘 공시를 모아 만든 색인에서 찾습니다. 사업자번호가 가장 정확하고, 업체명·업종·지역으로도 찾을 수 있습니다. 공시 반영일까지의 정보입니다.",
    stages: ["contract"],
    audience: ["owner", "designer"],
    tags: ["실내건축공사업", "면허", "행정처분"],
    dataSources: ["국토교통부 키스콘 건설업체정보"],
    status: "beta",
    requires: ["contractors"],
    inputs: [
      { name: "businessNo", label: "사업자등록번호", type: "text" },
      { name: "name", label: "업체명", type: "text" },
      { name: "item", label: "업종", type: "text", placeholder: "예: 실내건축공사업" },
      { name: "region", label: "지역", type: "text", placeholder: "예: 서울 강남구" },
    ],
    example: { item: "실내건축공사업", region: "서울 강남구" },
    run: async (i) => {
      const result = await searchContractors({ businessNo: str(i.businessNo) || undefined, name: str(i.name) || undefined, item: str(i.item) || undefined, region: str(i.region) || undefined });
      return { sources: contractorSources(result), data: result };
    },
  },
  {
    id: "wiki-evidence",
    name: "INDEX 지식 근거 찾기",
    summary: "협회 연구자료·위키·지식백과에서 질문과 관련된 원문 문단을 쪽 번호와 함께 찾습니다.",
    description: "INDEX 제2의 두뇌 검색입니다. 원문 문단을 그대로 보여 주고, 협회 원본 자료를 가장 높은 근거로 칩니다. 검토 대기 문서는 표시와 함께 보여 줍니다.",
    stages: [],
    audience: ["designer", "builder", "owner"],
    tags: ["위키", "협회 자료", "근거"],
    dataSources: ["INDEX 위키", "협회 연구자료"],
    status: "beta",
    requires: ["wiki"],
    inputs: [{ name: "query", label: "질문", type: "textarea", placeholder: "예: 셀프 인테리어도 건설업 등록이 필요한가요?", required: true }],
    example: { query: "욕조 배수구 악취 원인" },
    run: async (i) => {
      const query = need(i.query, "질문");
      const found = await knowledgeRetrieve(query);
      const retrievedAt = new Date().toISOString();
      return {
        sources: found.chunks.map((c) => ({ id: `wiki_${c.id}`, title: `${c.title}${c.pages ? ` (${c.pages})` : ""}`, sourceType: "knowledge_base" as const, publisher: `INDEX 위키 · ${c.trust}${c.status !== "published" ? " · 검수 전" : ""}`, url: "", snippet: c.text.slice(0, 300), retrievedAt })),
        data: { coverage: found.coverage, passages: found.chunks.map((c) => ({ 문서: c.title, 위치: [c.heading, c.pages].filter(Boolean).join(" · "), 근거: c.trust, 상태: c.status === "published" ? "검수 완료" : "검수 전", 원문: c.text })) },
      };
    },
  },
];

type KnowledgeChunk = { id: string; title: string; heading?: string | null; pages?: string | null; trust: string; status: string; text: string };

async function knowledgeToken(): Promise<string | null> {
  if (process.env.WIKI_SERVICE_TOKEN) return process.env.WIKI_SERVICE_TOKEN;
  try {
    const { readFileSync } = await import("node:fs");
    return readFileSync(".index-knowledge/runtime.token", "utf8").trim();
  } catch {
    return null;
  }
}
const knowledgeBase = () => (process.env.INDEX_WIKI_URL || "http://127.0.0.1:5318").replace(/\/$/, "");

async function knowledgeRetrieve(query: string): Promise<{ coverage: string; chunks: KnowledgeChunk[] }> {
  const token = await knowledgeToken();
  if (!token) throw new RegulationError("INDEX 지식 서버에 연결되어 있지 않습니다.");
  const res = await fetch(`${knowledgeBase()}/api/wiki/retrieve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, k: 6, includeReview: true }),
    signal: AbortSignal.timeout(6000),
  }).catch(() => null);
  if (!res?.ok) throw new RegulationError("INDEX 지식 서버에 연결할 수 없습니다.");
  return (await res.json()) as { coverage: string; chunks: KnowledgeChunk[] };
}

async function availability(): Promise<Record<Requirement, boolean>> {
  const s = regulationStatus();
  let wiki = false;
  const token = await knowledgeToken();
  if (token) wiki = Boolean(await fetch(`${knowledgeBase()}/api/wiki/health`, { signal: AbortSignal.timeout(800) }).then((r) => r.ok).catch(() => false));
  return { law: s.law, building: s.building, landUse: s.landUse, kcsc: s.kcsc, business: s.business, contractors: s.business && isServerFirestoreConfigured(), wiki };
}

const REQUIREMENT_LABEL: Record<Requirement, string> = {
  law: "법제처 API 키(LAW_OC)",
  building: "공공데이터·도로명주소 키",
  landUse: "공공데이터·도로명주소 키",
  kcsc: "국가건설기준 키(KCSC_API_KEY)",
  business: "공공데이터 키(국세청 활용신청)",
  contractors: "공공데이터 키 + Firebase 서비스 계정",
  wiki: "INDEX 지식 서버",
};

export async function listTools() {
  const ready = await availability();
  return TOOLS.map(({ run: _run, requires, ...meta }) => {
    const missing = requires.filter((r) => !ready[r]).map((r) => REQUIREMENT_LABEL[r]);
    return { ...meta, available: missing.length === 0, missing };
  });
}

export async function runTool(id: string, input: Record<string, unknown>): Promise<ToolResult> {
  const def = TOOLS.find((t) => t.id === id);
  if (!def) return { ok: false, error: "없는 도구입니다." };
  try {
    return { ok: true, ...(await def.run(input ?? {})) };
  } catch (error) {
    if (!(error instanceof RegulationError)) console.error("[tools]", id, error);
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
