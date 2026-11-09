import { jsonSchema, tool, type ToolSet } from "ai";
import {
  buildingSources,
  businessSources,
  checkBusinessStatus,
  checkLandUseActivity,
  getInterpretation,
  getKcscDocument,
  getLawArticles,
  INTERPRETATION_AGENCIES,
  interpretationSources,
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
import { DEFECT_TRADES, defectPeriods, HOUSING_TYPES, WORK_ITEMS, workPermit } from "./_toolsWork.js";

/**
 * AI SDK tools over the public regulation APIs. Only sources whose env key is set are
 * exposed. Every tool returns `{ ok, sources, data }` or `{ ok: false, error }`, so the
 * model sees API failures as text, and callers can collect `sources` for citations.
 */
export type RegulationToolOutput =
  | { ok: true; sources: RegulationSource[]; data: unknown }
  | { ok: false; error: string };

async function run(work: () => Promise<{ sources: RegulationSource[]; data: unknown }>): Promise<RegulationToolOutput> {
  try {
    return { ok: true, ...(await work()) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!(error instanceof RegulationError)) console.error("[regulation-tool]", error);
    return { ok: false, error: message };
  }
}

const LAW_KINDS = ["law", "admrul", "ordin"] as const;
const AGENCIES = Object.keys(INTERPRETATION_AGENCIES) as InterpretationAgency[];
const agencyList = AGENCIES.map((a) => `${a}=${INTERPRETATION_AGENCIES[a]}`).join(", ");

export function regulationTools(): ToolSet {
  const status = regulationStatus();
  const tools: ToolSet = {};

  if (status.law) {
    tools.searchLaws = tool({
      description:
        "국가법령정보센터에서 법령(law: 법률·시행령·시행규칙), 행정규칙(admrul: 고시·훈령·예규), 자치법규(ordin: 조례·규칙)를 이름/키워드로 검색한다. " +
        "문장이 아니라 법령명이나 짧은 핵심어로 검색해야 결과가 나온다 (예: '건축법', '소방시설', '장애인등편의법', '실내공기질', '서울특별시 건축 조례').",
      inputSchema: jsonSchema<{ query: string; kind?: LawKind }>({
        type: "object",
        properties: {
          query: { type: "string", description: "법령명 또는 핵심어 (2~20자)" },
          kind: { type: "string", enum: [...LAW_KINDS], description: "law(기본) | admrul | ordin" },
        },
        required: ["query"],
        additionalProperties: false,
      }),
      execute: ({ query, kind }) =>
        run(async () => {
          const items = await searchLaws(query, kind ?? "law");
          return { sources: lawSearchSources(items), data: { results: items } };
        }),
    });

    tools.getLawArticles = tool({
      description:
        "법령·행정규칙·자치법규의 조문 원문을 가져온다. name(정확한 법령명) 또는 searchLaws 결과의 id를 주고, " +
        "article(예: '46', '10의2')로 특정 조문을, keyword로 해당 단어가 들어간 조문만 골라 받을 수 있다.",
      inputSchema: jsonSchema<{ name?: string; id?: string; kind?: LawKind; article?: string; keyword?: string }>({
        type: "object",
        properties: {
          name: { type: "string", description: "정확한 법령명 (예: '건축법 시행령')" },
          id: { type: "string", description: "searchLaws 결과의 id (일련번호)" },
          kind: { type: "string", enum: [...LAW_KINDS] },
          article: { type: "string", description: "조문 번호 (예: '46', '제46조', '10의2')" },
          keyword: { type: "string", description: "조문에 포함되어야 할 단어 (예: '방화구획')" },
        },
        additionalProperties: false,
      }),
      execute: (input) =>
        run(async () => {
          const result = await getLawArticles(input);
          const sources: RegulationSource[] = result.articles.slice(0, 5).map((a) => ({
            id: `law_${result.kind}_${result.title}_${a.number}`,
            title: `${result.title} ${a.number}${a.title ? `(${a.title})` : ""}`.trim(),
            sourceType: "official_law",
            publisher: "법제처 국가법령정보센터",
            url: result.url,
            snippet: a.text.slice(0, 300),
            retrievedAt: new Date().toISOString(),
          }));
          return { sources, data: result };
        }),
    });

    tools.searchInterpretations = tool({
      description:
        "법령해석 사례를 검색한다. agency: moleg=법제처 법령해석례(기본), 그 외는 중앙부처 1차 해석 " +
        `(${agencyList}). 건축·주택·국토계획은 molit, 소방시설·다중이용업소는 nfa가 적합하다. 짧은 핵심어로 검색한다.`,
      inputSchema: jsonSchema<{ query: string; agency?: InterpretationAgency }>({
        type: "object",
        properties: {
          query: { type: "string", description: "핵심어 (예: '용도변경', '방화문', '스프링클러')" },
          agency: { type: "string", enum: AGENCIES },
        },
        required: ["query"],
        additionalProperties: false,
      }),
      execute: ({ query, agency }) =>
        run(async () => {
          const items = await searchInterpretations(query, agency ?? "moleg");
          return { sources: interpretationSources(items), data: { results: items } };
        }),
    });

    tools.getInterpretation = tool({
      description: "searchInterpretations 결과의 id로 해석례 본문(질의요지·회답·이유)을 가져온다. agency는 검색 때와 같은 값을 준다.",
      inputSchema: jsonSchema<{ id: string; agency?: InterpretationAgency }>({
        type: "object",
        properties: { id: { type: "string" }, agency: { type: "string", enum: AGENCIES } },
        required: ["id"],
        additionalProperties: false,
      }),
      execute: ({ id, agency }) =>
        run(async () => {
          const result = await getInterpretation(id, agency ?? "moleg");
          const title = result.body["안건명"] ?? `해석례 ${id}`;
          return {
            sources: [
              {
                id: `expc_${result.agency}_${id}`,
                title,
                sourceType: "official_law",
                publisher: `법제처 국가법령정보센터 (${INTERPRETATION_AGENCIES[result.agency]})`,
                url: result.url,
                snippet: (result.body["회답"] ?? result.body["질의요지"] ?? "").slice(0, 300),
                retrievedAt: new Date().toISOString(),
              },
            ],
            data: result,
          };
        }),
    });
  }

  if (status.building) {
    tools.lookupBuilding = tool({
      description:
        "주소로 건축물대장(표제부: 주용도·구조·연면적·층수·사용승인일, 층별개요: 층별 용도·면적, 지역지구구역)을 조회한다. " +
        "인테리어 대상 건물의 법규 적용 조건(용도, 면적, 층수, 용도지역)을 파악할 때 먼저 사용한다. includePermits=true면 건축인허가 기본개요도 함께 가져온다.",
      inputSchema: jsonSchema<{ address: string; includePermits?: boolean }>({
        type: "object",
        properties: {
          address: { type: "string", description: "도로명 또는 지번 주소 (예: '서울 강남구 테헤란로 152')" },
          includePermits: { type: "boolean" },
        },
        required: ["address"],
        additionalProperties: false,
      }),
      execute: ({ address, includePermits }) =>
        run(async () => {
          const result = await lookupBuilding(address, { includePermits });
          return { sources: buildingSources(result), data: result };
        }),
    });
  }

  if (status.landUse) {
    tools.checkLandUseActivity = tool({
      description:
        "주소의 용도지역·지구에서 특정 토지이용행위(업종·시설)가 가능한지 토지이용규제 행위제한 정보를 조회한다. " +
        "activity는 건축법 시설 용어로 준다 (예: '일반음식점', '휴게음식점', '제2종근린생활시설', '사무소', '학원', '숙박시설').",
      inputSchema: jsonSchema<{ address: string; activity: string }>({
        type: "object",
        properties: {
          address: { type: "string" },
          activity: { type: "string", description: "토지이용행위명 (예: '일반음식점')" },
        },
        required: ["address", "activity"],
        additionalProperties: false,
      }),
      execute: ({ address, activity }) =>
        run(async () => {
          const result = await checkLandUseActivity(address, activity);
          return { sources: landUseSources(result), data: result };
        }),
    });
  }

  if (status.kcsc) {
    tools.searchConstructionStandards = tool({
      description:
        "국가건설기준 KDS(설계기준)·KCS(표준시방서) 목록을 기준명 키워드로 검색한다 (예: '방수', '타일', '수장', '도장', '내화', '실내건축'). " +
        "결과의 type과 code로 getConstructionStandard를 호출해 본문을 본다.",
      inputSchema: jsonSchema<{ keyword: string; type?: "KDS" | "KCS" }>({
        type: "object",
        properties: {
          keyword: { type: "string", description: "기준명에 포함된 단어 (공백으로 여러 개)" },
          type: { type: "string", enum: ["KDS", "KCS"] },
        },
        required: ["keyword"],
        additionalProperties: false,
      }),
      execute: ({ keyword, type }) =>
        run(async () => {
          const items = await searchKcsc(keyword, type);
          return { sources: kcscSources(items), data: { results: items } };
        }),
    });

    tools.getConstructionStandard = tool({
      description: "KDS/KCS 기준 본문을 가져온다. keyword를 주면 그 단어가 들어간 절만 돌려준다 (예: '담수시험', '양생').",
      inputSchema: jsonSchema<{ type: "KDS" | "KCS"; code: string; keyword?: string }>({
        type: "object",
        properties: {
          type: { type: "string", enum: ["KDS", "KCS"] },
          code: { type: "string", description: "searchConstructionStandards 결과의 code(6자리) 또는 fullCode" },
          keyword: { type: "string" },
        },
        required: ["type", "code"],
        additionalProperties: false,
      }),
      execute: ({ type, code, keyword }) =>
        run(async () => {
          const doc = await getKcscDocument(type, code, keyword);
          return {
            sources: [
              {
                id: `kcsc_${doc.type}_${doc.code}`,
                title: `${doc.type} ${doc.name}`,
                sourceType: "kcsc",
                publisher: "국가건설기준센터(KCSC)",
                url: "https://www.kcsc.re.kr",
                snippet: (doc.sections[0]?.text ?? "").slice(0, 300),
                retrievedAt: new Date().toISOString(),
              },
            ],
            data: doc,
          };
        }),
    });
  }

  if (status.business) {
    tools.checkBusinessRegistration = tool({
      description:
        "사업자등록번호(10자리)로 국세청 사업자 상태(계속사업자·휴업자·폐업자, 과세유형, 폐업일)를 조회한다. 여러 개를 한 번에 줄 수 있다. " +
        "국세청은 상호명 검색을 제공하지 않으므로 번호가 없으면 사용자에게 번호를 요청한다.",
      inputSchema: jsonSchema<{ businessNumbers: string[] }>({
        type: "object",
        properties: {
          businessNumbers: { type: "array", items: { type: "string" }, description: "사업자등록번호 (하이픈 있어도 됨)", minItems: 1, maxItems: 20 },
        },
        required: ["businessNumbers"],
        additionalProperties: false,
      }),
      execute: ({ businessNumbers }) =>
        run(async () => {
          const rows = await checkBusinessStatus(businessNumbers);
          return { sources: businessSources(rows), data: { results: rows } };
        }),
    });

    tools.validateBusinessRegistration = tool({
      description:
        "사업자등록증 진위확인: 사업자등록번호·개업일자·대표자명(선택: 상호)이 국세청 등록 정보와 일치하는지 확인한다. 사업자등록증에 적힌 값을 그대로 넣는다.",
      inputSchema: jsonSchema<{ businessNo: string; startDate: string; ownerName: string; companyName?: string }>({
        type: "object",
        properties: {
          businessNo: { type: "string" },
          startDate: { type: "string", description: "개업연월일 YYYYMMDD" },
          ownerName: { type: "string", description: "대표자 성명" },
          companyName: { type: "string", description: "상호 (선택)" },
        },
        required: ["businessNo", "startDate", "ownerName"],
        additionalProperties: false,
      }),
      execute: (input) =>
        run(async () => {
          const result = await validateBusiness(input);
          return { sources: businessSources([{ businessNo: result.businessNo, status: result.status, taxType: result.taxType }]), data: result };
        }),
    });
  }

  if (status.business && isServerFirestoreConfigured()) {
    tools.searchContractorLicense = tool({
      description:
        "건설업 등록(면허) 조회: 국토교통부 키스콘 공시 기준으로 업체의 등록 업종(예: 실내건축공사업)·업종등록번호·등록일, 폐업·등록말소 여부, 최근 행정처분(영업정지·과징금)을 찾는다. " +
        "사업자등록번호(가장 정확), 업체명(2글자 이상), 업종명 중 하나로 검색하고 region(예: '서울 강남구')으로 좁힐 수 있다. " +
        "공시 데이터를 모아 만든 색인이므로 결과의 syncedThrough 날짜까지만 반영되어 있음을 답변에 밝힌다.",
      inputSchema: jsonSchema<{ businessNo?: string; name?: string; item?: string; region?: string }>({
        type: "object",
        properties: {
          businessNo: { type: "string", description: "사업자등록번호 10자리" },
          name: { type: "string", description: "업체명 (주식회사·(주) 제외해도 됨)" },
          item: { type: "string", description: "업종명 (예: '실내건축공사업')" },
          region: { type: "string", description: "시도/시군구 (예: '서울 강남구')" },
        },
        additionalProperties: false,
      }),
      execute: (input) =>
        run(async () => {
          const result = await searchContractors(input);
          return { sources: contractorSources(result), data: result };
        }),
    });
  }

  // Rule-based work tools (no external key): the same engines as the /tools 앱.
  tools.checkWorkPermit = tool({
    description:
      "공사 신고·허가 판정: 공동주택관리법 시행령 별표 3(2025.4.15 개정)과 협회 연구자료 기준으로 공사 항목별 절차(행위허가/신고/관리사무소 신고/불가), 필요한 입주자 동의 비율, 준비 사항을 판정한다. " +
      "발코니 확장, 벽 철거·신설, 내력벽, 욕실 이동, 대피공간 같은 질문에 쓴다. 주소를 주면 건축물대장으로 주용도·사용승인일도 확인한다.",
    inputSchema: jsonSchema<{ housing?: string; works: string[]; address?: string }>({
      type: "object",
      properties: {
        housing: { type: "string", enum: HOUSING_TYPES.map((h) => h.value), description: "apartment=주택법 사업승인 공동주택(기본), permit-housing=건축허가 공동주택(주상복합·빌라), detached=단독·다가구" },
        works: { type: "array", items: { type: "string", enum: WORK_ITEMS.map((w) => w.value) }, description: WORK_ITEMS.map((w) => `${w.value}=${w.label}`).join(", ") },
        address: { type: "string", description: "현장 주소(선택)" },
      },
      required: ["works"],
      additionalProperties: false,
    }),
    execute: (input) => run(() => workPermit(input)),
  });
  tools.calculateDefectPeriod = tool({
    description:
      "하자담보책임기간 계산: 건설산업기본법 시행령 별표 4(2021.8.3 개정) 기준으로 공종별 법정 기간, 만료일, 남은 날수를 계산한다. 하자 보수 책임이 아직 남았는지 묻는 질문에 쓴다.",
    inputSchema: jsonSchema<{ completedOn: string; trades?: string[]; asOf?: string }>({
      type: "object",
      properties: {
        completedOn: { type: "string", description: "완공일 또는 사용 시작일 중 빠른 날 (YYYY-MM-DD)" },
        trades: { type: "array", items: { type: "string", enum: DEFECT_TRADES.map((t) => t.value) }, description: DEFECT_TRADES.map((t) => `${t.value}=${t.label}(${t.years}년)`).join(", ") },
        asOf: { type: "string", description: "기준일 YYYY-MM-DD (생략 시 오늘)" },
      },
      required: ["completedOn"],
      additionalProperties: false,
    }),
    execute: (input) => run(async () => defectPeriods(input)),
  });

  return tools;
}

/**
 * Where interior-work questions usually land. Given to the model as known law names so
 * searches start from the right 법령/고시 (and so answers without tools name real laws).
 */
export const INTERIOR_LAW_MAP = `실내건축·인테리어에 주로 적용되는 법령 (검색 출발점):
- 건축법·건축법 시행령: 용도변경, 대수선(내력벽·기둥·보·주계단·방화벽·세대 간 경계벽), 건축물의 마감재료, 실내건축, 방화구획, 직통계단·복도 등 피난
- 건축물의 피난·방화구조 등의 기준에 관한 규칙: 내부 마감재료(불연·준불연·난연), 방화문·방화구획 구조
- 실내건축의 구조·시공방법 등에 관한 기준 (국토교통부 고시, 행정규칙): 다중이용 건축물 등의 실내건축
- 소방시설 설치 및 관리에 관한 법률: 방염대상물품, 천장·칸막이 변경에 따른 스프링클러·감지기
- 다중이용업소의 안전관리에 관한 특별법: 음식점·노래연습장·학원 등 비상구, 영업장 내부 통로, 안전시설 등
- 건설산업기본법: 실내건축공사업 등록, 경미한 건설공사 기준
- 공동주택관리법: 아파트 발코니 확장·비내력벽 철거 등 행위허가·신고
- 장애인ㆍ노인ㆍ임산부 등의 편의증진 보장에 관한 법률 (검색어 '편의증진'): 출입구·화장실 등 편의시설
- 실내공기질 관리법: 다중이용시설, 오염물질 방출 건축자재
- 건축물의 에너지절약설계기준 (국토교통부 고시): 단열
- 지자체 건축 조례 (자치법규): 지역별 차이
조문 번호와 수치는 개정될 수 있으므로 확인한 원문 기준으로만 단정한다.`;

/** System prompt addendum telling the model how to use the tools and how to answer. */
export const REGULATION_TOOL_GUIDE = `법규·설계기준·건물 현황 질문에는 제공된 조회 도구를 사용해 공식 원문을 확인한 뒤 답하라.
- 법령 검색은 문장이 아닌 법령명/핵심어로 한다 (아래 법령 목록 참고, 고시는 kind=admrul, 조례는 kind=ordin). 필요한 조문은 getLawArticles로 원문을 확인한다.
- 주소가 주어지면 lookupBuilding으로 건물 용도·면적·층수·용도지역을 먼저 확인하고, 그 조건에 맞는 규정을 찾는다.
- 업종 입점·용도변경 가능 여부는 checkLandUseActivity와 관련 법령·조례를 함께 본다.
- 시공·설계 기준은 KDS/KCS 도구로 확인한다.
- 업체 확인 요청에는 searchContractorLicense로 건설업 등록 업종·행정처분을 확인하고, 사업자등록번호로 국세청 상태를 조회하고, 사업자등록증 내용(번호·개업일자·대표자명)이 주어지면 진위확인을 한다. 개인정보는 확인 결과에 필요한 만큼만 언급한다.
- 공동주택 공사 절차(발코니 확장, 벽 철거·신설, 내력벽, 욕실 이동, 대피공간)는 checkWorkPermit으로, 하자 보수 책임기간은 calculateDefectPeriod로 판정한 결과를 근거로 답한다. 동의 비율·허가·신고 구분은 INDEX 위키 발췌보다 이 판정 결과가 우선하며, 둘이 다르면 판정 결과를 따른다. 위키에 나온 대수선 기준을 세대 내 비내력벽 철거에 옮겨 쓰지 않는다.
- 답변에는 근거로 쓴 법령명·조문·해석례·기준명을 명시하고, 도구가 돌려준 url이 있으면 링크로 붙인다. 조회하지 않은 조문 번호나 수치를 지어내지 마라.
- 도구가 오류를 돌려주면 그 사실을 알리고, 일반 지식으로 답할 때는 원문 확인이 필요하다고 밝힌다.
- 답변 끝에 "법규 정보는 참고용이며, 시행일·지자체 조례·현장 치수·피난 동선 등은 관할 기관과 전문가를 통해 최종 확인이 필요합니다."라는 안내를 한 줄로 붙인다.`;

/** Collect de-duplicated sources from tool results (AI SDK `steps[].toolResults`). */
export function collectSources(toolResults: Array<{ output: unknown }>): RegulationSource[] {
  const seen = new Map<string, RegulationSource>();
  for (const result of toolResults) {
    const output = result.output as RegulationToolOutput | undefined;
    if (output && output.ok) for (const source of output.sources) if (!seen.has(source.id)) seen.set(source.id, source);
  }
  return [...seen.values()];
}

/**
 * One-shot source search for the Agent Studio's SearchProvider: a small model picks
 * the tool calls for the user's message (law names, 해석례, KDS/KCS, address lookups)
 * and only the collected sources are returned. Needs OPENAI_API_KEY.
 */
export async function searchRegulationSources(message: string, limit = 8): Promise<RegulationSource[]> {
  const tools = regulationTools();
  if (Object.keys(tools).length === 0 || !process.env.OPENAI_API_KEY) return [];
  const { generateText, isStepCount } = await import("ai");
  const { openai } = await import("@ai-sdk/openai");
  const result = await generateText({
    model: openai(process.env.OPENAI_MODEL || "gpt-5.4-nano"),
    system:
      "너는 실내건축 법규 질문의 근거 자료를 찾는 검색 담당이다. 사용자의 질문에 답하지 말고, 근거가 될 법령·조문·해석례·KDS/KCS 기준·건축물대장을 도구로 찾아라. " +
      "법령명/핵심어로 2~4회 검색하고, 핵심 조문은 getLawArticles로 확인한다. 검색이 끝나면 '완료'라고만 답한다.\n\n" +
      INTERIOR_LAW_MAP,
    prompt: message.slice(0, 4_000),
    tools,
    stopWhen: isStepCount(5),
  });
  return collectSources(result.steps.flatMap((step) => step.toolResults)).slice(0, limit);
}
