import { find, findAll, parseXml, pick, records, textOf, type XmlNode } from "./_xml.js";

/**
 * Public regulation / building data clients used by the chat tools (api/_regulationTools.ts).
 * Every source is optional and switched on by its env key:
 *
 * | Source | Env | Notes |
 * |---|---|---|
 * | 법제처 국가법령정보 공동활용 (법령·행정규칙·자치법규·법령해석례·중앙부처 1차 해석) | LAW_OC (+ LAW_RELAY_URL, LAW_RELAY_SECRET) | Only registered server IPs are answered (a domain alone is not enough), so Vercel calls go through relay/law-relay.mjs on a fixed-IP host. |
 * | 국토교통부 건축HUB 건축물대장·건축인허가, 토지이용규제 행위제한 (data.go.kr) | DATA_GO_KR_SERVICE_KEY | One 일반 인증키 for all data.go.kr services; each service needs its own 활용신청. |
 * | 행정안전부 도로명주소 검색 | JUSO_API_KEY | Turns an address into the 법정동코드/지번 the data.go.kr services need. |
 * | 국가건설기준센터 KDS·KCS | KCSC_API_KEY | |
 *
 * These APIs only supply source text and records; they do not decide legality.
 */

export type RegulationSourceType = "official_law" | "kcsc" | "public_data" | "knowledge_base";

/** Same shape as the Agent Studio's SearchResult, so studio search can show these directly. */
export type RegulationSource = {
  id: string;
  title: string;
  sourceType: RegulationSourceType;
  publisher: string;
  url: string;
  snippet: string;
  retrievedAt: string;
};

export class RegulationError extends Error {}

const env = (key: string) => process.env[key]?.trim() ?? "";

export function regulationStatus() {
  const dataKey = Boolean(env("DATA_GO_KR_SERVICE_KEY"));
  return {
    law: Boolean(env("LAW_OC")),
    building: dataKey && Boolean(env("JUSO_API_KEY")),
    landUse: dataKey && Boolean(env("JUSO_API_KEY")),
    kcsc: Boolean(env("KCSC_API_KEY")),
    business: dataKey,
  };
}

export const anyRegulationSource = () => Object.values(regulationStatus()).some(Boolean);

const now = () => new Date().toISOString();
const clip = (value: string, max: number) => (value.length > max ? `${value.slice(0, max)}…` : value);
const squash = (value: string) => value.replace(/\s+/g, " ").trim();

async function fetchText(url: string, attempts = 2, headers?: Record<string, string>): Promise<string> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
      const body = await response.text();
      // law.go.kr DRF answers bursts with intermittent 404/429/5xx; data.go.kr reports key errors as 4xx with an XML/JSON body.
      if ([404, 429, 502, 503, 504].includes(response.status) && i < attempts - 1 && !body.includes("OpenAPI_ServiceResponse")) {
        await new Promise((r) => setTimeout(r, 600));
        continue;
      }
      if (!response.ok && !body.trim()) throw new RegulationError(`외부 API 오류 (HTTP ${response.status})`);
      return body;
    } catch (error) {
      lastError = error;
      if (error instanceof RegulationError) throw error;
    }
  }
  throw new RegulationError(`외부 API에 연결하지 못했습니다: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

const isHtml = (body: string) => /^\s*(<!doctype html|<html)/i.test(body);

// ─── 법제처 국가법령정보 공동활용 (law.go.kr DRF) ────────────────────────────────

export type LawKind = "law" | "admrul" | "ordin";

const LAW_KIND_LABEL: Record<LawKind, string> = { law: "법령", admrul: "행정규칙", ordin: "자치법규" };
/** Public (non-API) page path per kind, e.g. https://www.law.go.kr/법령/건축법 */
const LAW_PUBLIC_PATH: Record<LawKind, string> = { law: "법령", admrul: "행정규칙", ordin: "자치법규" };

/** Ministries offering 중앙부처 1차 해석 relevant to interiors (target `<code>CgmExpc`). `moleg` = 법제처 법령해석례 (target `expc`). */
export const INTERPRETATION_AGENCIES = {
  moleg: "법제처",
  molit: "국토교통부",
  nfa: "소방청",
  mohw: "보건복지부",
  me: "기후에너지환경부",
  mois: "행정안전부",
} as const;
export type InterpretationAgency = keyof typeof INTERPRETATION_AGENCIES;

const interpretationTarget = (agency: InterpretationAgency) => (agency === "moleg" ? "expc" : `${agency}CgmExpc`);

async function lawCall(path: "lawSearch.do" | "lawService.do", params: Record<string, string>): Promise<XmlNode> {
  const oc = env("LAW_OC");
  if (!oc) throw new RegulationError("법령 API(LAW_OC)가 설정되지 않았습니다.");
  const query = new URLSearchParams({ OC: oc, type: "XML", ...params });
  // law.go.kr only answers registered server IPs. Vercel has no fixed egress IP on the
  // Hobby plan, so production calls go through a fixed-IP relay (relay/law-relay.mjs).
  const relay = env("LAW_RELAY_URL").replace(/\/+$/, "");
  const body = relay
    ? await fetchText(`${relay}/DRF/${path}?${query}`, 3, { "x-relay-secret": env("LAW_RELAY_SECRET") })
    : await fetchText(`https://www.law.go.kr/DRF/${path}?${query}`, 3);
  if (isHtml(body)) throw new RegulationError("법령 API가 결과 대신 안내 페이지를 반환했습니다. 검색어나 식별자를 확인해 주세요.");
  const root = parseXml(body);
  const response = find(root, "Response");
  if (response && find(response, "result")) {
    // e.g. "사용자 정보 검증에 실패하였습니다." — the server IP/domain isn't registered for this OC.
    throw new RegulationError(`법령 API 오류: ${textOf(find(response, "result"))} ${textOf(find(response, "msg"))}`.trim());
  }
  return root;
}

export type LawSearchItem = { kind: LawKind; title: string; id: string; date: string; agency: string; category: string; url: string };

export async function searchLaws(query: string, kind: LawKind = "law", display = 8): Promise<LawSearchItem[]> {
  const root = await lawCall("lawSearch.do", { target: kind, query, display: String(Math.min(Math.max(display, 1), 20)) });
  return records(root)
    .map((r) => {
      const title = pick(r, "법령명한글", "행정규칙명", "자치법규명", "법령명");
      return {
        kind,
        title,
        id: pick(r, "법령일련번호", "행정규칙일련번호", "자치법규일련번호", "일련번호"),
        date: pick(r, "시행일자", "발령일자", "공포일자"),
        agency: pick(r, "소관부처명", "지자체기관명", "소관부처"),
        category: pick(r, "법령구분명", "행정규칙종류", "자치법규종류", "자치법규분야명"),
        url: `https://www.law.go.kr/${LAW_PUBLIC_PATH[kind]}/${encodeURIComponent(title)}`,
      };
    })
    .filter((item) => item.title);
}

export function lawSearchSources(items: LawSearchItem[]): RegulationSource[] {
  const retrievedAt = now();
  return items.map((item) => ({
    id: `law_${item.kind}_${item.id || item.title}`,
    title: item.title,
    sourceType: "official_law",
    publisher: `법제처 국가법령정보센터 (${LAW_KIND_LABEL[item.kind]}${item.agency ? ` · ${item.agency}` : ""})`,
    url: item.url,
    snippet: [item.category, item.date && `시행 ${item.date}`].filter(Boolean).join(" · "),
    retrievedAt,
  }));
}

/** Text of every 조문/항/호/목 content node under `node`, in document order. */
function contentText(node: XmlNode): string {
  const parts: string[] = [];
  const walk = (n: XmlNode) => {
    for (const child of n.children) {
      if (child.children.length === 0) {
        if (/(조문|항|호|목|조)내용$/.test(child.name) && child.text.trim()) parts.push(child.text.trim());
      } else walk(child);
    }
  };
  walk(node);
  return parts.join("\n");
}

export type LawArticle = { number: string; title: string; text: string };

export async function getLawArticles(input: {
  kind?: LawKind;
  id?: string;
  name?: string;
  article?: string;
  keyword?: string;
}): Promise<{ title: string; kind: LawKind; date: string; url: string; articles: LawArticle[]; totalArticles: number }> {
  const kind = input.kind ?? "law";
  let id = input.id?.trim();
  let title = input.name?.trim() ?? "";
  if (!id) {
    if (!title) throw new RegulationError("법령 이름이나 일련번호가 필요합니다.");
    const hits = await searchLaws(title, kind, 10);
    const hit = hits.find((h) => h.title === title) ?? hits[0];
    if (!hit) throw new RegulationError(`'${title}'에 해당하는 ${LAW_KIND_LABEL[kind]}을(를) 찾지 못했습니다.`);
    id = hit.id;
    title = hit.title;
  }
  const root = await lawCall("lawService.do", kind === "admrul" ? { target: kind, ID: id } : { target: kind, MST: id });
  title = textOf(find(root, "법령명_한글")) || textOf(find(root, "행정규칙명")) || textOf(find(root, "자치법규명")) || title;
  const date = textOf(find(root, "시행일자"));

  let articles: LawArticle[] = findAll(root, "조문단위")
    .filter((unit) => textOf(find(unit, "조문여부")) !== "전문") // skip 장/절 headings
    .map((unit) => {
      const branch = textOf(find(unit, "조문가지번호"));
      const number = textOf(find(unit, "조문번호"));
      return { number: number ? `제${number}조${branch && branch !== "0" ? `의${branch}` : ""}` : "", title: textOf(find(unit, "조문제목")), text: contentText(unit) };
    });
  if (articles.length === 0) {
    // 행정규칙/자치법규 bodies are not split into 조문단위 the same way: fall back to the whole text.
    // Their text still reads "제N조(제목) ...", so split it on those headings.
    const text = contentText(root);
    articles = text
      .split(/\n?(?=제\d+조(?:의\d+)?\s*\()/)
      .map((chunk) => chunk.trim())
      .filter(Boolean)
      .map((chunk) => {
        const head = chunk.match(/^제(\d+)조(?:의(\d+))?\s*\(([^)]*)\)/);
        return head
          ? { number: `제${head[1]}조${head[2] ? `의${head[2]}` : ""}`, title: head[3]!.trim(), text: chunk }
          : { number: "", title: "본문", text: chunk };
      });
  }
  const totalArticles = articles.length;

  if (input.article) {
    const wanted = input.article.replace(/\s/g, "").replace(/^제/, "").replace(/조/, "");
    articles = articles.filter((a) => a.number.replace(/^제/, "").replace(/조/, "") === wanted);
  }
  if (input.keyword) {
    const terms = input.keyword.split(/\s+/).filter(Boolean);
    articles = articles.filter((a) => terms.every((t) => `${a.title}\n${a.text}`.includes(t)));
  }

  // Keep the tool result within a sensible context budget.
  let budget = 8_000;
  const limited: LawArticle[] = [];
  for (const a of articles) {
    if (budget <= 0) break;
    const text = clip(a.text, Math.min(budget, 3_000));
    budget -= text.length;
    limited.push({ ...a, text });
  }
  return {
    title,
    kind,
    date,
    url: `https://www.law.go.kr/${LAW_PUBLIC_PATH[kind]}/${encodeURIComponent(title)}`,
    articles: limited,
    totalArticles,
  };
}

export type InterpretationItem = { agency: InterpretationAgency; id: string; title: string; caseNo: string; date: string; replyAgency: string };

export async function searchInterpretations(query: string, agency: InterpretationAgency = "moleg", display = 8): Promise<InterpretationItem[]> {
  const root = await lawCall("lawSearch.do", {
    target: interpretationTarget(agency),
    query,
    display: String(Math.min(Math.max(display, 1), 20)),
  });
  return records(root)
    .map((r) => ({
      agency,
      id: pick(r, "법령해석례일련번호", "법령해석일련번호", "일련번호", "id"),
      title: pick(r, "안건명", "법령해석명", "제목", "질의요지"),
      caseNo: pick(r, "안건번호", "법령해석례번호", "해석례번호"),
      date: pick(r, "회신일자", "해석일자", "의결일자"),
      replyAgency: pick(r, "해석기관명", "회신기관명") || INTERPRETATION_AGENCIES[agency],
    }))
    .filter((item) => item.title);
}

function interpretationUrl(item: { agency: InterpretationAgency; id: string }) {
  return item.agency === "moleg" && item.id ? `https://www.law.go.kr/LSW/expcInfoP.do?expcSeq=${encodeURIComponent(item.id)}` : "https://www.law.go.kr";
}

export function interpretationSources(items: InterpretationItem[]): RegulationSource[] {
  const retrievedAt = now();
  return items.map((item) => ({
    id: `expc_${item.agency}_${item.id || item.title}`,
    title: item.title,
    sourceType: "official_law",
    publisher: `법제처 국가법령정보센터 (${item.agency === "moleg" ? "법령해석례" : `${INTERPRETATION_AGENCIES[item.agency]} 1차 해석`})`,
    url: interpretationUrl(item),
    snippet: [item.caseNo, item.date && `회신 ${item.date}`, item.replyAgency].filter(Boolean).join(" · "),
    retrievedAt,
  }));
}

const INTERPRETATION_FIELDS = ["안건명", "안건번호", "질의기관명", "해석기관명", "회신일자", "해석일자", "질의요지", "회답", "이유", "관련법령"];

export async function getInterpretation(id: string, agency: InterpretationAgency = "moleg") {
  const root = await lawCall("lawService.do", { target: interpretationTarget(agency), ID: id });
  const leaves = new Map<string, string>();
  const walk = (n: XmlNode) => {
    for (const child of n.children) {
      if (child.children.length === 0) {
        const value = child.text.trim();
        if (value && !leaves.has(child.name)) leaves.set(child.name, value);
      } else walk(child);
    }
  };
  walk(root);
  if (leaves.size === 0) throw new RegulationError("해석례 본문을 찾지 못했습니다.");
  const ordered = [...INTERPRETATION_FIELDS.filter((k) => leaves.has(k)), ...[...leaves.keys()].filter((k) => !INTERPRETATION_FIELDS.includes(k))];
  let budget = 8_000;
  const body: Record<string, string> = {};
  for (const key of ordered) {
    if (budget <= 0) break;
    const value = clip(leaves.get(key)!, Math.min(budget, 4_000));
    budget -= value.length;
    body[key] = value;
  }
  return { agency, id, url: interpretationUrl({ agency, id }), body };
}

// ─── 도로명주소 → 법정동코드/지번 (business.juso.go.kr) ──────────────────────────

export type ResolvedAddress = {
  roadAddr: string;
  jibunAddr: string;
  buildingName: string;
  sigunguCd: string;
  bjdongCd: string;
  platGbCd: string;
  bun: string;
  ji: string;
  matches: number;
};

const pad4 = (value: string | undefined) => (value && /^\d+$/.test(value) ? value.padStart(4, "0") : "0000");

export async function resolveAddress(keyword: string): Promise<ResolvedAddress> {
  const key = env("JUSO_API_KEY");
  if (!key) throw new RegulationError("주소 검색 API(JUSO_API_KEY)가 설정되지 않았습니다.");
  // The juso API rejects some special characters in the keyword.
  const cleaned = keyword.replace(/[%=<>[\]'"`;]/g, " ").trim();
  if (cleaned.length < 2) throw new RegulationError("주소를 더 구체적으로 입력해 주세요.");
  const query = new URLSearchParams({ confmKey: key, currentPage: "1", countPerPage: "5", keyword: cleaned, resultType: "json" });
  const body = await fetchText(`https://business.juso.go.kr/addrlink/addrLinkApi.do?${query}`);
  const data = JSON.parse(body) as {
    results?: {
      common?: { errorCode?: string; errorMessage?: string; totalCount?: string };
      juso?: Array<Record<string, string>> | null;
    };
  };
  const common = data.results?.common;
  if (common?.errorCode !== "0") throw new RegulationError(`주소 검색 오류: ${common?.errorMessage ?? "알 수 없는 오류"}`);
  const hit = data.results?.juso?.[0];
  if (!hit || !hit.admCd || hit.admCd.length !== 10) throw new RegulationError(`'${keyword}' 주소를 찾지 못했습니다.`);
  return {
    roadAddr: hit.roadAddr ?? "",
    jibunAddr: hit.jibunAddr ?? "",
    buildingName: hit.bdNm ?? "",
    sigunguCd: hit.admCd.slice(0, 5),
    bjdongCd: hit.admCd.slice(5),
    platGbCd: hit.mtYn === "1" ? "1" : "0",
    bun: pad4(hit.lnbrMnnm),
    ji: pad4(hit.lnbrSlno),
    matches: Number(common?.totalCount ?? 1),
  };
}

// ─── data.go.kr (국토교통부) ───────────────────────────────────────────────────

function dataGoKrKey(): string {
  const raw = env("DATA_GO_KR_SERVICE_KEY");
  if (!raw) throw new RegulationError("공공데이터포털 인증키(DATA_GO_KR_SERVICE_KEY)가 설정되지 않았습니다.");
  // Accept either the "Encoding" or "Decoding" key from the portal; URLSearchParams encodes it once.
  try {
    return raw.includes("%") ? decodeURIComponent(raw) : raw;
  } catch {
    return raw;
  }
}

async function dataGoKr(service: string, operation: string, params: Record<string, string>): Promise<Record<string, string>[]> {
  return (await dataGoKrPage(service, operation, params)).items;
}

/** One page of a 국토교통부 (1613000) data.go.kr service, with its totalCount. */
export async function dataGoKrPage(
  service: string,
  operation: string,
  params: Record<string, string>,
): Promise<{ items: Record<string, string>[]; totalCount: number }> {
  const query = new URLSearchParams({ serviceKey: dataGoKrKey(), ...params });
  const body = await fetchText(`https://apis.data.go.kr/1613000/${service}/${operation}?${query}`);
  const root = parseXml(body);
  const authError = find(root, "cmmMsgHeader");
  if (authError) {
    const reason = textOf(find(authError, "errMsg"));
    const message =
      reason === "SERVICE_KEY_IS_NOT_REGISTERED_ERROR"
        ? `공공데이터포털에서 이 서비스(${service})의 활용신청이 승인되지 않았거나 인증키가 올바르지 않습니다.`
        : `${textOf(find(authError, "returnAuthMsg")) || reason}`;
    throw new RegulationError(`공공데이터 API 오류: ${message}`);
  }
  const code = textOf(find(root, "resultCode"));
  if (code && !/^0+$/.test(code)) throw new RegulationError(`공공데이터 API 오류: ${textOf(find(root, "resultMsg")) || code}`);
  const items = findAll(root, "item").map((item) => {
    const out: Record<string, string> = {};
    for (const child of item.children) if (child.children.length === 0 && child.text.trim()) out[child.name] = child.text.trim();
    return out;
  });
  return { items, totalCount: Number(textOf(find(root, "totalCount"))) || items.length };
}

const addressParams = (a: ResolvedAddress) => ({ sigunguCd: a.sigunguCd, bjdongCd: a.bjdongCd, platGbCd: a.platGbCd, bun: a.bun, ji: a.ji });

function only(record: Record<string, string>, keys: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of keys) if (record[key]) out[key] = record[key];
  return out;
}

const TITLE_FIELDS = [
  "bldNm", "dongNm", "mainAtchGbCdNm", "regstrKindCdNm", "mainPurpsCdNm", "etcPurps", "strctCdNm", "roofCdNm",
  "platArea", "archArea", "totArea", "bcRat", "vlRat", "grndFlrCnt", "ugrndFlrCnt", "heit",
  "rideUseElvtCnt", "emgenUseElvtCnt", "hhldCnt", "hoCnt", "pmsDay", "stcnsDay", "useAprDay",
];
const FLOOR_FIELDS = ["dongNm", "flrGbCdNm", "flrNoNm", "mainPurpsCdNm", "etcPurps", "strctCdNm", "area", "mainAtchGbCdNm"];
const ZONE_FIELDS = ["jijiguGbCdNm", "jijiguCdNm", "jijiguCd", "etcJijigu", "reprYn"];

/** 건축물대장 표제부·층별개요·지역지구구역 (+ 건축인허가 기본개요) for an address. */
export async function lookupBuilding(address: string, options: { includePermits?: boolean } = {}) {
  const resolved = await resolveAddress(address);
  const params = addressParams(resolved);
  const [titles, floors, zones, permits] = await Promise.allSettled([
    dataGoKr("BldRgstHubService", "getBrTitleInfo", { ...params, numOfRows: "20", pageNo: "1" }),
    dataGoKr("BldRgstHubService", "getBrFlrOulnInfo", { ...params, numOfRows: "100", pageNo: "1" }),
    dataGoKr("BldRgstHubService", "getBrJijiguInfo", { ...params, numOfRows: "50", pageNo: "1" }),
    options.includePermits
      ? dataGoKr("ArchPmsHubService", "getApBasisOulnInfo", { ...params, numOfRows: "10", pageNo: "1" })
      : Promise.resolve([] as Record<string, string>[]),
  ]);
  const value = <T,>(r: PromiseSettledResult<T>, fallback: T) => (r.status === "fulfilled" ? r.value : fallback);
  const errors = [titles, floors, zones, permits]
    .filter((r): r is PromiseRejectedResult => r.status === "rejected")
    .map((r) => (r.reason instanceof Error ? r.reason.message : String(r.reason)));
  if (errors.length === 4 || (titles.status === "rejected" && floors.status === "rejected")) {
    throw new RegulationError([...new Set(errors)].join(" / "));
  }
  const buildings = value(titles, []).map((r) => only(r, TITLE_FIELDS));
  const floorRows = value(floors, []);
  return {
    address: resolved,
    buildings,
    floors: floorRows.slice(0, 80).map((r) => only(r, FLOOR_FIELDS)),
    floorsTruncated: floorRows.length > 80,
    zones: value(zones, []).map((r) => only(r, ZONE_FIELDS)),
    // Field names of the 인허가 service aren't documented on the portal page: pass the non-empty fields through.
    permits: value(permits, []).slice(0, 5).map((r) => Object.fromEntries(Object.entries(r).slice(0, 25))),
    warnings: [...new Set(errors)],
  };
}

export function buildingSources(result: Awaited<ReturnType<typeof lookupBuilding>>): RegulationSource[] {
  const where = result.address.roadAddr || result.address.jibunAddr;
  const main = result.buildings[0];
  return [
    {
      id: `bld_${result.address.sigunguCd}${result.address.bjdongCd}_${result.address.bun}${result.address.ji}`,
      title: `건축물대장 — ${where}`,
      sourceType: "public_data",
      publisher: "국토교통부 건축HUB 건축물대장정보",
      url: "https://www.hub.go.kr",
      snippet: main
        ? squash(`${main.mainPurpsCdNm ?? ""} ${main.etcPurps ? `(${main.etcPurps})` : ""} · 연면적 ${main.totArea ?? "-"}㎡ · 지상 ${main.grndFlrCnt ?? "-"}층/지하 ${main.ugrndFlrCnt ?? "-"}층 · 사용승인 ${main.useAprDay ?? "-"}`)
        : "표제부 정보 없음",
      retrievedAt: now(),
    },
  ];
}

/** 토지이용규제 행위제한: is `activity` (e.g. 일반음식점) allowed in the zones of the parcel at `address`? */
export async function checkLandUseActivity(address: string, activity: string) {
  const resolved = await resolveAddress(address);
  const zones = await dataGoKr("BldRgstHubService", "getBrJijiguInfo", { ...addressParams(resolved), numOfRows: "50", pageNo: "1" });
  const codes = [...new Set(zones.map((z) => z.jijiguCd).filter((c): c is string => Boolean(c)))].slice(0, 5);
  if (codes.length === 0) {
    throw new RegulationError("이 지번의 건축물대장에 지역·지구 정보가 없어 행위제한을 조회할 수 없습니다. 토지이용계획확인원(토지이음)을 확인해 주세요.");
  }
  const results = await Promise.allSettled(
    codes.map((code) =>
      dataGoKr("arLandUseInfoService", "DTarLandUseInfo", { areaCd: resolved.sigunguCd, ucodeList: code, landUseNm: activity }).then((rows) => ({
        code,
        zone: zones.find((z) => z.jijiguCd === code)?.jijiguCdNm ?? code,
        // Response field names aren't documented on the portal page: pass the non-empty fields through.
        rows: rows.slice(0, 10).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, clip(v, 1_500)]))),
      })),
    ),
  );
  const ok = results.filter((r) => r.status === "fulfilled").map((r) => (r as PromiseFulfilledResult<{ code: string; zone: string; rows: Record<string, string>[] }>).value);
  if (ok.length === 0) {
    const first = results[0] as PromiseRejectedResult;
    throw first.reason instanceof Error ? first.reason : new RegulationError(String(first.reason));
  }
  return { address: resolved, activity, zones: zones.map((z) => only(z, ZONE_FIELDS)), restrictions: ok };
}

export function landUseSources(result: Awaited<ReturnType<typeof checkLandUseActivity>>): RegulationSource[] {
  return [
    {
      id: `luse_${result.address.sigunguCd}_${result.activity}`,
      title: `토지이용규제 행위제한 — ${result.activity} (${result.address.roadAddr || result.address.jibunAddr})`,
      sourceType: "public_data",
      publisher: "국토교통부 토지이용규제정보서비스",
      url: "https://www.eum.go.kr",
      snippet: result.restrictions.map((r) => r.zone).join(", "),
      retrievedAt: now(),
    },
  ];
}

// ─── 국가건설기준센터 KDS·KCS (kcsc.re.kr) ─────────────────────────────────────

type KcscCode = { codeType: string; code: string; fullCode: string; name: string; version: string; updateDate: string };
let kcscCache: { at: number; codes: KcscCode[] } | null = null;

function kcscKey(): string {
  const key = env("KCSC_API_KEY");
  if (!key) throw new RegulationError("국가건설기준 API(KCSC_API_KEY)가 설정되지 않았습니다.");
  return key;
}

async function kcscCodes(): Promise<KcscCode[]> {
  if (kcscCache && Date.now() - kcscCache.at < 6 * 3600_000) return kcscCache.codes;
  const body = await fetchText(`https://kcsc.re.kr/OpenApi/CodeList?${new URLSearchParams({ key: kcscKey() })}`);
  const rows = JSON.parse(body) as Array<Partial<KcscCode>>;
  const codes = (Array.isArray(rows) ? rows : [])
    .filter((r) => r.name && r.code)
    .map((r) => ({
      codeType: String(r.codeType ?? ""),
      code: String(r.code),
      fullCode: String(r.fullCode ?? ""),
      name: String(r.name),
      version: String(r.version ?? ""),
      updateDate: String(r.updateDate ?? ""),
    }));
  // An invalid key comes back as HTTP 200 with a single all-null record.
  if (codes.length === 0) throw new RegulationError("국가건설기준 API 인증키가 올바르지 않거나 목록이 비어 있습니다.");
  kcscCache = { at: Date.now(), codes };
  return codes;
}

export async function searchKcsc(keyword: string, type?: "KDS" | "KCS", limit = 10) {
  const terms = keyword.split(/\s+/).filter(Boolean);
  const codes = await kcscCodes();
  return codes
    .filter((c) => (!type || c.codeType === type) && terms.every((t) => c.name.includes(t) || c.fullCode.includes(t)))
    .slice(0, limit);
}

export function kcscSources(items: KcscCode[]): RegulationSource[] {
  const retrievedAt = now();
  return items.map((c) => ({
    id: `kcsc_${c.codeType}_${c.code}`,
    title: `${c.codeType} ${c.fullCode.replace(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/, "$2 $3 $4")} ${c.name}`.replace(/\s+/g, " ").trim(),
    sourceType: "kcsc",
    publisher: "국가건설기준센터(KCSC)",
    url: "https://www.kcsc.re.kr",
    snippet: [c.version, c.updateDate && `개정 ${c.updateDate}`].filter(Boolean).join(" · "),
    retrievedAt,
  }));
}

const stripHtml = (html: string) =>
  squash(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&"),
  );

export async function getKcscDocument(type: "KDS" | "KCS", code: string, keyword?: string) {
  if (!/^\d{6,10}$/.test(code)) throw new RegulationError("KDS/KCS 코드는 숫자 6자리(code) 또는 10자리(fullCode)여야 합니다.");
  const codes = await kcscCodes();
  const entry = codes.find((c) => c.codeType === type && (c.code === code || c.fullCode === code));
  const shortCode = entry?.code ?? code.slice(-6);
  const body = await fetchText(`https://kcsc.re.kr/OpenApi/CodeViewer/${type}/${shortCode}?${new URLSearchParams({ key: kcscKey() })}`);
  const parsed = JSON.parse(body) as unknown;
  const doc = (Array.isArray(parsed) ? parsed[0] : parsed) as
    | { name?: string | null; version?: string | null; list?: Array<{ label?: string | null; title?: string | null; contents?: string | null }> | null }
    | undefined;
  if (!doc?.name) throw new RegulationError(`${type} ${code} 기준 문서를 찾지 못했습니다.`);
  const terms = keyword?.split(/\s+/).filter(Boolean) ?? [];
  let sections = (doc.list ?? []).map((s) => ({
    label: s.label ?? "",
    title: s.title ?? "",
    text: stripHtml(s.contents ?? ""),
  }));
  if (terms.length) sections = sections.filter((s) => terms.every((t) => `${s.title} ${s.text}`.includes(t)));
  let budget = 8_000;
  const limited = [];
  for (const s of sections) {
    if (budget <= 0) break;
    const text = clip(s.text, Math.min(budget, 2_500));
    budget -= text.length + s.title.length;
    limited.push({ ...s, text });
  }
  return { type, code: shortCode, fullCode: entry?.fullCode ?? "", name: doc.name, version: doc.version ?? "", sections: limited, totalSections: (doc.list ?? []).length };
}

// ─── 국세청 사업자등록정보 상태조회·진위확인 (data.go.kr → api.odcloud.kr) ─────────

export type BusinessStatus = {
  businessNo: string;
  /** 계속사업자 / 휴업자 / 폐업자, or "" when the number isn't registered with 국세청. */
  status: string;
  taxType: string;
  closedOn: string;
  registered: boolean;
};

const normalizeBusinessNo = (value: string) => value.replace(/\D/g, "");

/** Checksum of a 10-digit 사업자등록번호 (rejects typos before calling the API). */
export function isValidBusinessNo(value: string): boolean {
  const n = normalizeBusinessNo(value);
  if (n.length !== 10) return false;
  const d = [...n].map(Number);
  const w = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  let sum = w.reduce((acc, weight, i) => acc + d[i]! * weight, 0);
  sum += Math.floor((d[8]! * 5) / 10);
  return (10 - (sum % 10)) % 10 === d[9];
}

async function ntsCall<T>(path: "status" | "validate", body: unknown): Promise<T> {
  const query = new URLSearchParams({ serviceKey: dataGoKrKey() });
  let response: Response;
  try {
    response = await fetch(`https://api.odcloud.kr/api/nts-businessman/v1/${path}?${query}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new RegulationError(`국세청 API에 연결하지 못했습니다: ${error instanceof Error ? error.message : String(error)}`);
  }
  const data = (await response.json().catch(() => null)) as (T & { code?: number; msg?: string; status_code?: string }) | null;
  if (!data) throw new RegulationError(`국세청 API 오류 (HTTP ${response.status})`);
  if (!response.ok || (typeof data.code === "number" && data.code < 0)) {
    throw new RegulationError(
      data.msg?.includes("등록되지 않은 인증키")
        ? "공공데이터포털에서 '국세청_사업자등록정보 진위확인 및 상태조회 서비스' 활용신청이 승인되지 않았거나 인증키가 올바르지 않습니다."
        : `국세청 API 오류: ${data.msg ?? response.status}`,
    );
  }
  return data;
}

/** 사업자등록 상태 (up to 100 numbers per call). Only lookup by number is possible — 국세청 offers no name search. */
export async function checkBusinessStatus(numbers: string[]): Promise<BusinessStatus[]> {
  const list = [...new Set(numbers.map(normalizeBusinessNo))].slice(0, 100);
  const invalid = list.filter((n) => !isValidBusinessNo(n));
  if (invalid.length === list.length) throw new RegulationError(`올바른 사업자등록번호(10자리)가 아닙니다: ${invalid.join(", ")}`);
  const result = await ntsCall<{ data?: Array<Record<string, string>> }>("status", { b_no: list.filter((n) => !invalid.includes(n)) });
  const rows = (result.data ?? []).map((r) => ({
    businessNo: r.b_no ?? "",
    status: r.b_stt ?? "",
    // For an unknown number 국세청 puts the explanation in tax_type ("국세청에 등록되지 않은 사업자등록번호입니다").
    taxType: r.tax_type ?? "",
    closedOn: r.end_dt ?? "",
    registered: Boolean(r.b_stt_cd),
  }));
  return [...rows, ...invalid.map((n) => ({ businessNo: n, status: "", taxType: "번호 형식 오류 (검증번호 불일치)", closedOn: "", registered: false }))];
}

/** 사업자등록 진위확인: do 번호 + 개업일자 + 대표자명 match 국세청 records? */
export async function validateBusiness(input: { businessNo: string; startDate: string; ownerName: string; companyName?: string }) {
  const businessNo = normalizeBusinessNo(input.businessNo);
  const startDate = input.startDate.replace(/\D/g, "");
  if (!isValidBusinessNo(businessNo)) throw new RegulationError("올바른 사업자등록번호(10자리)가 아닙니다.");
  if (startDate.length !== 8) throw new RegulationError("개업일자는 YYYYMMDD 8자리로 입력해 주세요.");
  const result = await ntsCall<{ data?: Array<{ valid?: string; valid_msg?: string; status?: Record<string, string> }> }>("validate", {
    businesses: [{ b_no: businessNo, start_dt: startDate, p_nm: input.ownerName.trim(), p_nm2: "", b_nm: input.companyName?.trim() ?? "", corp_no: "", b_sector: "", b_type: "", b_adr: "" }],
  });
  const row = result.data?.[0];
  return {
    businessNo,
    // "01" = 일치, "02" = 불일치
    matches: row?.valid === "01",
    message: row?.valid_msg ?? (row?.valid === "01" ? "" : "입력한 정보가 국세청 등록 정보와 일치하지 않습니다."),
    status: row?.status?.b_stt ?? "",
    taxType: row?.status?.tax_type ?? "",
  };
}

export function businessSources(rows: Array<{ businessNo: string; status: string; taxType: string }>): RegulationSource[] {
  const retrievedAt = now();
  return rows.map((r) => ({
    id: `nts_${r.businessNo}`,
    title: `사업자등록 상태 — ${r.businessNo.replace(/^(\d{3})(\d{2})(\d{5})$/, "$1-$2-$3")}`,
    sourceType: "public_data",
    publisher: "국세청 사업자등록정보 상태조회",
    url: "https://www.data.go.kr/data/15081808/openapi.do",
    snippet: [r.status || "미등록", r.taxType].filter(Boolean).join(" · "),
    retrievedAt,
  }));
}
