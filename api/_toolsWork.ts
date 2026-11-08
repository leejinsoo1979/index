import { generateText, type ModelMessage } from "ai";
import { createOpenAI, openai } from "@ai-sdk/openai";
import { deepseekModel } from "./_deepseek.js";
import { checkBusinessStatus, lookupBuilding, RegulationError, regulationStatus, type RegulationSource } from "./_regulations.js";
import { isServerFirestoreConfigured } from "./_firebaseServer.js";
import { searchContractors } from "./_kiscon.js";

/**
 * Work tools for the INDEX AI 도구 catalogue — 업체 확인, 공사 신고·허가 판정, 하자 책임기간,
 * 견적서 검토, 하자 진단. Each returns a `Report` the /tools page renders as a verdict sheet.
 *
 * Legal tables are transcribed from the official 별표 PDFs on law.go.kr:
 *  - 공동주택관리법 시행령 [별표 3] <개정 2025. 4. 15.> 공동주택의 행위허가 또는 신고의 기준
 *  - 건설산업기본법 시행령 [별표 4] <개정 2021. 8. 3.> 건설공사의 종류별 하자담보책임기간
 * Update them here when those 별표 are amended.
 */

export type Tone = "ok" | "caution" | "stop" | "info";
export type ReportRow = { label: string; value: string; tone?: Tone; note?: string };
export type Report = {
  kind: "report";
  headline: string;
  verdict?: { label: string; tone: Tone };
  sections: { title: string; rows: ReportRow[] }[];
  notes?: string[];
};

const now = () => new Date().toISOString();
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : typeof v === "string" && v ? v.split(",") : []).map((s) => s.trim()).filter(Boolean);
const digits = (v: string) => v.replace(/\D/g, "");
const fmtBiz = (n: string) => n.replace(/^(\d{3})(\d{2})(\d{5})$/, "$1-$2-$3");

const LAW = {
  housingAnnex3: "https://www.law.go.kr/법령/공동주택관리법시행령",
  housingAct35: "https://www.law.go.kr/법령/공동주택관리법/제35조",
  buildingDecree: "https://www.law.go.kr/법령/건축법시행령/제3조의2",
  evacuation: "https://www.law.go.kr/법령/건축법시행령/제46조",
  constructionAnnex4: "https://www.law.go.kr/법령/건설산업기본법시행령",
  constructionAct28: "https://www.law.go.kr/법령/건설산업기본법/제28조",
  minorWork: "https://www.law.go.kr/법령/건설산업기본법시행령/제8조",
  fireDecree: "https://www.law.go.kr/법령/소방시설공사업법시행령/제6조",
};
const lawSource = (id: string, title: string, url: string, snippet: string): RegulationSource => ({
  id,
  title,
  sourceType: "official_law",
  publisher: "법제처 국가법령정보센터",
  url,
  snippet,
  retrievedAt: now(),
});

// ─── 1. 업체 한 번에 확인 ──────────────────────────────────────────────────────

export async function companyCheck(input: Record<string, unknown>): Promise<{ sources: RegulationSource[]; data: Report }> {
  const businessNo = digits(str(input.businessNo));
  if (businessNo.length !== 10) throw new RegulationError("사업자등록번호 10자리를 입력해 주세요.");
  const s = regulationStatus();

  const [nts, kiscon] = await Promise.all([
    s.business ? checkBusinessStatus([businessNo]).then((r) => r[0]).catch((e: Error) => e) : Promise.resolve(new Error("국세청 조회 키가 연결되지 않았습니다.")),
    isServerFirestoreConfigured() ? searchContractors({ businessNo }).catch((e: Error) => e) : Promise.resolve(new Error("건설업 등록 색인이 연결되지 않았습니다.")),
  ]);

  const sections: Report["sections"] = [];
  const notes: string[] = [];
  let tone = "ok" as Tone;
  const raise = (t: Tone) => {
    const rank = { ok: 0, info: 0, caution: 1, stop: 2 } as const;
    if (rank[t] > rank[tone]) tone = t;
  };

  // 국세청
  if (nts instanceof Error) {
    sections.push({ title: "국세청 사업자 상태", rows: [{ label: "조회", value: "확인 불가", tone: "info", note: nts.message }] });
    raise("caution");
  } else if (nts) {
    const closed = /폐업/.test(nts.status);
    const paused = /휴업/.test(nts.status);
    const rowTone: Tone = !nts.registered || closed ? "stop" : paused ? "caution" : "ok";
    raise(rowTone);
    sections.push({
      title: "국세청 사업자 상태",
      rows: [
        { label: "상태", value: nts.registered ? nts.status || "확인됨" : "국세청에 없는 번호", tone: rowTone, note: nts.registered ? undefined : nts.taxType },
        ...(nts.registered ? [{ label: "과세 유형", value: nts.taxType || "-" }] : []),
        ...(nts.closedOn ? [{ label: "폐업일", value: nts.closedOn, tone: "stop" as Tone }] : []),
      ],
    });
  }

  // 건설업 등록(면허)
  let company: Awaited<ReturnType<typeof searchContractors>>["results"][number] | null = null;
  let syncedThrough = "";
  if (kiscon instanceof Error) {
    sections.push({ title: "건설업 등록(면허)", rows: [{ label: "조회", value: "확인 불가", tone: "info", note: kiscon.message }] });
    raise("caution");
  } else {
    syncedThrough = kiscon.syncedThrough;
    company = kiscon.results[0] ?? null;
    if (!company) {
      raise("caution");
      sections.push({
        title: "건설업 등록(면허)",
        rows: [{ label: "등록 업종", value: "공시된 건설업 등록 없음", tone: "caution", note: "공사예정금액 1,500만 원 이상인 실내건축 공사는 건설업 등록 업체가 맡아야 합니다(건설산업기본법 시행령 제8조)." }],
      });
    } else {
      const interior = company.licenses.find((l) => l.item.includes("실내건축"));
      const interiorActive = company.activeItems.some((i) => i.includes("실내건축"));
      const licenseTone: Tone = interiorActive ? "ok" : "caution";
      raise(licenseTone);
      sections.push({
        title: "건설업 등록(면허)",
        rows: [
          { label: "업체명", value: `${company.name}${company.owner ? ` (대표 ${company.owner})` : ""}` },
          { label: "실내건축공사업", value: interiorActive ? "등록 유지" : interior ? interior.status : "등록 없음", tone: licenseTone, note: interiorActive ? undefined : "다른 업종만 있거나 실내건축공사업이 폐업·말소된 상태입니다." },
          { label: "유효 업종", value: company.activeItems.join(", ") || "없음" },
          ...(company.address ? [{ label: "소재지", value: company.address }] : []),
        ],
      });
      const recent = company.sanctions.filter((x) => x.decidedOn && Date.now() - Date.parse(x.decidedOn.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3")) < 3 * 365 * 864e5);
      if (company.sanctions.length) {
        raise(recent.length ? "caution" : "info");
        sections.push({
          title: "행정처분 이력",
          rows: company.sanctions.slice(0, 5).map((x) => ({
            label: x.decidedOn || "-",
            value: [x.item, x.penalty || (x.stopFrom ? `영업정지 ${x.stopFrom}~${x.stopTo ?? ""}` : "")].filter(Boolean).join(" · "),
            tone: recent.includes(x) ? ("caution" as Tone) : ("info" as Tone),
            note: x.violation,
          })),
        });
      } else {
        sections.push({ title: "행정처분 이력", rows: [{ label: "처분", value: "공시된 처분 없음", tone: "ok" }] });
      }
      notes.push(`건설업 정보는 키스콘 공시를 ${syncedThrough}까지 반영한 것입니다. 최근 변경은 키스콘에서 한 번 더 확인하세요.`);
    }
  }

  const verdictLabel = tone === "stop" ? "계약 보류 권장" : tone === "caution" ? "계약 전 확인 필요" : "확인된 문제 없음";
  const headline =
    tone === "stop"
      ? "정상 영업 중인 사업자가 아닙니다. 계약을 멈추고 사업자 정보를 다시 확인하세요."
      : tone === "caution"
        ? "영업은 확인되지만, 면허 또는 처분 이력에서 계약 전에 짚을 부분이 있습니다."
        : "정상 영업 중이며 실내건축공사업 등록이 확인됩니다.";
  notes.push("견적 금액이 1,500만 원 이상이면 계약서에 건설업 등록번호를 적게 하세요.");

  const sources: RegulationSource[] = [];
  if (!(nts instanceof Error) && nts) sources.push({ id: `nts_${businessNo}`, title: `사업자등록 상태 — ${fmtBiz(businessNo)}`, sourceType: "public_data", publisher: "국세청 사업자등록정보 상태조회", url: "https://www.data.go.kr/data/15081808/openapi.do", snippet: nts.status || "미등록", retrievedAt: now() });
  if (company) sources.push({ id: `kiscon_${businessNo}`, title: `${company.name} — 건설업 등록정보`, sourceType: "public_data", publisher: `국토교통부 키스콘 (공시 ${syncedThrough}까지)`, url: "https://www.kiscon.net", snippet: company.activeItems.join(", ") || "유효 업종 없음", retrievedAt: now() });
  sources.push(lawSource("law_minor_work", "건설산업기본법 시행령 제8조(경미한 건설공사)", LAW.minorWork, "전문공사로서 공사예정금액 1천5백만 원 미만은 건설업 등록 없이 시공할 수 있는 경미한 공사"));

  return { sources, data: { kind: "report", headline, verdict: { label: verdictLabel, tone }, sections, notes } };
}

// ─── 2. 공사 신고·허가 판정 ────────────────────────────────────────────────────

export const WORK_ITEMS = [
  { value: "finish", label: "마감 공사 (도배·바닥·타일·도장·가구·조명)" },
  { value: "balcony", label: "발코니 확장" },
  { value: "wall-remove", label: "비내력벽 철거 (방 합치기 등)" },
  { value: "wall-add", label: "벽체 신설 (방 나누기)" },
  { value: "bearing", label: "내력벽 철거·타공" },
  { value: "plumbing", label: "욕실·주방 위치 이동 (배관 이설)" },
  { value: "window", label: "외부 창호(샷시) 교체" },
  { value: "fire", label: "스프링클러·감지기 위치 변경" },
  { value: "evacuation", label: "대피공간·방화문 변경" },
  { value: "heating", label: "바닥 난방 배관 교체" },
] as const;

export const HOUSING_TYPES = [
  { value: "apartment", label: "아파트 등 공동주택 (주택법 사업승인)" },
  { value: "permit-housing", label: "건축허가로 지은 공동주택 (주상복합·도시형 생활주택·빌라 등)" },
  { value: "detached", label: "단독·다가구 주택" },
] as const;

type Rule = { procedure: string; tone: Tone; detail: string; basis: string };

const APARTMENT_RULES: Record<string, Rule> = {
  finish: {
    procedure: "행위허가·신고 대상 아님 → 관리사무소 공사 신고",
    tone: "ok",
    detail: "관리규약에 따라 관리사무소 공사 신고, 이웃 동의서(규약에 정한 경우), 작업 시간·소음 기준, 승강기 보양을 지킵니다.",
    basis: "공동주택관리법 시행령 별표 3에 해당하지 않는 세대 내 마감 공사 · 단지 관리규약",
  },
  balcony: {
    procedure: "행위허가 (시장·군수·구청장) · 해당 동 거주 입주자등 1/2 이상 동의",
    tone: "caution",
    detail:
      "일반적인 발코니 확장은 행위허가신청서의 '비내력벽 철거'에 해당합니다. 구조안전에 이상이 없다는 인정이 필요하고, 확장부에 감지기 추가, 스프링클러 살수 범위에 따라 방화판(또는 방화유리창), 층수·칸막이에 따라 대피공간 기준을 맞춥니다. 공사 후 사용검사를 받아 건축물대장에 등재해야 끝납니다.",
    basis: "공동주택관리법 시행령 별표 3 제3호 가목 1)(파손·철거, 전유부분) · 협회 연구자료 「발코니 확장의 행정 절차」·「발코니 확장시 방화판/감지기/대피공간」",
  },
  "wall-remove": {
    procedure: "행위허가 (시장·군수·구청장) · 해당 동 거주 입주자등 1/2 이상 동의",
    tone: "caution",
    detail: "철거하려는 벽이 비내력벽인지 단위세대 구조도면으로 먼저 확인합니다(관리사무소, 세움터 건축물 현황도). 구조안전에 이상이 없다는 시장·군수·구청장의 인정이 필요합니다.",
    basis: "공동주택관리법 시행령 별표 3 제3호 가목 1) 가)(파손·철거, 전유부분)",
  },
  "wall-add": {
    procedure: "행위허가 (증설) · 해당 동 거주 입주자등 1/2 이상 동의",
    tone: "caution",
    detail: "세대 안에 벽을 새로 세우는 것은 '증설'(시설물을 늘리는 것)입니다. 구조안전에 이상이 없다는 인정과 동의가 필요합니다. 가벼운 가구식 칸막이는 대상이 아닐 수 있으니 구청에 확인하세요.",
    basis: "공동주택관리법 시행령 별표 3 제6호 가목 2) 가)(증설, 전유부분) · 비고 7(증설의 정의)",
  },
  bearing: {
    procedure: "대수선 행위허가 · 해당 동 입주자 2/3 이상 동의 (내력벽에 배관만 설치하는 경우 1/2)",
    tone: "stop",
    detail:
      "내력벽 일부 철거나 타공도 '내력벽의 해체'로 보아 대수선에 해당합니다. 동 전체 구조안전성 검토(구조기술사)가 필요하고, 지자체 조례나 단지 규정이 내력벽 해체를 아예 허용하지 않거나 100% 동의를 요구하기도 합니다. 신청은 세대 소유주 명의로만 할 수 있고 인테리어 업체가 대행할 수 없습니다.",
    basis: "공동주택관리법 시행령 별표 3 제2호 가목(개축·재축·대수선) · 협회 연구자료 「아파트 구조변경_내력벽 철거(공동주택 대수선 절차)」",
  },
  plumbing: {
    procedure: "조건부 — 내력벽·바닥 슬래브를 새로 뚫으면 행위허가 검토, 기존 배관 범위면 관리사무소 신고",
    tone: "caution",
    detail: "내력벽에 배관설비를 새로 설치하면 대수선 행위허가(해당 동 거주 입주자등 1/2 이상 동의) 대상입니다. 아래층 천장이나 공용 배관에 연결을 바꾸는 경우 관리주체와 먼저 협의하고, 방수층 재시공을 견적에 넣습니다.",
    basis: "공동주택관리법 시행령 별표 3 제2호 가목 단서(내력벽 배관설비 설치)",
  },
  window: {
    procedure: "별표 3 직접 항목 없음 → 관리규약에 따른 관리주체 승인·신고",
    tone: "info",
    detail: "외관 통일(색상·분할), 발코니 외창의 단열·방화 사양을 단지 규약으로 정한 경우가 많습니다. 발코니 확장과 함께 하면 확장 행위허가에 포함해 처리합니다.",
    basis: "단지 관리규약 · 발코니 등의 구조변경절차 및 설치기준",
  },
  fire: {
    procedure: "소방시설공사업자 시공 · 관할 소방서 신고 (경미한 변경은 면제될 수 있음)",
    tone: "caution",
    detail: "스프링클러 헤드·감지기 이설은 소방시설공사업자가 해야 합니다. 주요 변경은 소방서에 신고하고, 배관 소폭 조정 같은 경미한 변경은 면제될 수 있으니 관할 소방서에 미리 문의합니다. 관리사무소 협조가 필요합니다.",
    basis: "소방시설공사업법 · 협회 연구자료 「아파트 세대 내 소방관련 시설」",
  },
  evacuation: {
    procedure: "원칙적으로 불가 — 법정 피난시설",
    tone: "stop",
    detail: "대피공간과 그 방화문은 아파트 4층 이상 발코니에 두게 한 법정 피난시설입니다. 없애거나 다른 용도로 바꾸면 사용검사를 받을 수 없고 위반건축물로 등재될 수 있습니다. 대체 시설(하향식 피난구 등) 인정 여부는 구청과 소방서에 확인합니다.",
    basis: "건축법 시행령 제46조 · 협회 연구자료 「발코니 확장의 행정 절차」",
  },
  heating: {
    procedure: "세대 내 배관 교체는 관리사무소 신고 · 분배기·공용 배관 변경은 관리주체 협의",
    tone: "info",
    detail: "같은 자리의 난방 배관 교체는 별표 3의 철거·증설에 해당하지 않는 것이 일반적입니다. 난방 방식 변경이나 공용 배관 연결 변경은 관리주체와 먼저 협의합니다.",
    basis: "단지 관리규약",
  },
};

const BUILDING_ACT_RULES: Record<string, Rule> = {
  bearing: {
    procedure: "건축법 대수선 — 허가 또는 신고 (구청 건축과)",
    tone: "stop",
    detail: "내력벽의 증설·해체, 또는 벽면적 30㎡ 이상 수선·변경은 대수선입니다. 연면적 200㎡ 미만이고 3층 미만인 건축물은 신고, 그 밖에는 허가 대상입니다. 구조안전 확인이 필요합니다.",
    basis: "건축법 시행령 제3조의2 제1호 · 건축법 제11조·제14조",
  },
  "wall-remove": {
    procedure: "일반적으로 대수선 아님 → 신고 불필요 (세대 간 경계벽은 대수선)",
    tone: "caution",
    detail: "세대 안 비내력벽 철거는 대수선이 아니지만, 다가구·다세대의 가구·세대 간 경계벽을 철거·수선하면 대수선입니다. 벽이 내력벽인지 먼저 확인하세요.",
    basis: "건축법 시행령 제3조의2 제7호",
  },
  "wall-add": {
    procedure: "일반적으로 대수선 아님 (세대 간 경계벽 증설은 대수선)",
    tone: "info",
    detail: "세대 안 칸막이 신설은 대수선이 아닙니다. 방화구획 벽이나 세대 간 경계벽을 만들거나 바꾸면 대수선입니다.",
    basis: "건축법 시행령 제3조의2 제5호·제7호",
  },
  balcony: {
    procedure: "건축법 기준 — 구조·면적에 따라 대수선 또는 용도·면적 변경 검토",
    tone: "caution",
    detail: "발코니를 실내로 바꾸는 범위가 내력벽·외벽 마감(30㎡ 이상)에 걸리면 대수선입니다. 건축물대장 면적이 바뀌는지 구청 건축과에 먼저 확인하세요.",
    basis: "건축법 시행령 제3조의2 제1호·제8호",
  },
};

function ruleFor(housing: string, item: string): Rule {
  if (housing === "apartment") return APARTMENT_RULES[item] ?? APARTMENT_RULES.finish!;
  const rule = BUILDING_ACT_RULES[item];
  if (rule) return rule;
  const base = APARTMENT_RULES[item] ?? APARTMENT_RULES.finish!;
  // Items with no 건축법 trigger: same practical guidance, without the 별표 3 procedure.
  if (item === "finish" || item === "window" || item === "heating") return { ...base, basis: base.basis.replace("공동주택관리법 시행령 별표 3에 해당하지 않는 세대 내 마감 공사 · ", "") };
  return base;
}

export async function workPermit(input: Record<string, unknown>): Promise<{ sources: RegulationSource[]; data: Report }> {
  const housing = str(input.housing) || "apartment";
  const items = list(input.works).filter((v) => WORK_ITEMS.some((w) => w.value === v));
  if (!items.length) throw new RegulationError("공사 항목을 하나 이상 골라 주세요.");

  const rows: ReportRow[] = items.map((item) => {
    const rule = ruleFor(housing, item);
    return { label: WORK_ITEMS.find((w) => w.value === item)!.label, value: rule.procedure, tone: rule.tone, note: `${rule.detail}\n근거: ${rule.basis}` };
  });

  const sections: Report["sections"] = [{ title: "공사 항목별 절차", rows }];
  const notes: string[] = [];

  // Optional address: confirm the building type and age from 건축물대장.
  const address = str(input.address);
  if (address && regulationStatus().building) {
    try {
      const b = await lookupBuilding(address);
      const main = b.buildings[0] as Record<string, string | undefined> | undefined;
      const purpose = String(main?.mainPurpsCdNm ?? "");
      const approved = String(main?.useAprDay ?? "");
      const infoRows: ReportRow[] = [];
      if (purpose) infoRows.push({ label: "주용도", value: purpose, tone: /공동주택|아파트/.test(purpose) || housing !== "apartment" ? "info" : "caution", note: housing === "apartment" && !/공동주택|아파트/.test(purpose) ? "건축물대장 주용도가 공동주택이 아닙니다. 주택 유형을 다시 확인하세요." : undefined });
      if (approved) {
        infoRows.push({ label: "사용승인일", value: approved });
        if (/^\d{8}$/.test(approved) && approved < "19920601") notes.push("1992년 6월 1일 이전에 건축허가를 받은 건물은 철거·증설 행위허가 때 구조안전확인서를 요구하는 구청이 많습니다.");
      }
      if (infoRows.length) sections.unshift({ title: "건축물대장", rows: infoRows });
    } catch (e) {
      notes.push(`건축물대장을 조회하지 못했습니다: ${(e as Error).message}`);
    }
  }

  const permitItems = rows.filter((r) => r.tone === "caution" || r.tone === "stop");
  const blocked = rows.filter((r) => r.tone === "stop");
  const tone: Tone = blocked.length ? "stop" : permitItems.length ? "caution" : "ok";
  const headline = blocked.length
    ? `${blocked.map((r) => r.label.split(" (")[0]).join(", ")}은(는) 허가 요건이 까다롭거나 원칙적으로 불가합니다. 착공 전에 구청과 먼저 협의하세요.`
    : permitItems.length
      ? `${permitItems.map((r) => r.label.split(" (")[0]).join(", ")}은(는) 착공 전에 허가·동의가 필요합니다.`
      : "선택한 공사는 행위허가·신고 대상이 아닙니다. 관리사무소 공사 신고만 하면 됩니다.";

  if (housing === "apartment") {
    notes.push("동의율은 법령 최소 기준입니다. 관할 지자체나 단지 관리규약이 더 높은 동의(최대 100%)를 요구할 수 있습니다.");
    notes.push("행위허가 신청은 세대 소유주 명의로 합니다. 소음을 유발하는 공사는 동의서에 공사 기간과 방법을 적습니다(공동주택관리법 시행규칙 제15조).");
  } else {
    notes.push("건축허가로 지은 공동주택과 단독·다가구는 공동주택관리법 별표 3이 아니라 건축법 기준을 따릅니다(별표 3 비고 5).");
  }

  const sources: RegulationSource[] = [
    housing === "apartment"
      ? lawSource("law_housing_annex3", "공동주택관리법 시행령 [별표 3] 공동주택의 행위허가 또는 신고의 기준 (2025. 4. 15. 개정)", LAW.housingAnnex3, "파손·철거(전유부분): 구조안전 인정 + 해당 동 거주 입주자등 1/2 이상 동의 / 대수선: 해당 동 입주자 2/3 이상 동의")
      : lawSource("law_building_major_repair", "건축법 시행령 제3조의2 (대수선의 범위)", LAW.buildingDecree, "내력벽 증설·해체 또는 벽면적 30㎡ 이상 수선, 세대 간 경계벽 증설·해체 등"),
    lawSource("law_housing_35", "공동주택관리법 제35조 (행위허가 등)", LAW.housingAct35, "공동주택의 증축·개축·대수선, 파손·철거 등은 시장·군수·구청장의 허가 또는 신고 대상"),
  ];
  if (items.includes("evacuation") || items.includes("balcony")) sources.push(lawSource("law_evacuation", "건축법 시행령 제46조 (방화구획·대피공간)", LAW.evacuation, "아파트 4층 이상 층의 발코니 대피공간 설치 기준"));

  return { sources, data: { kind: "report", headline, verdict: { label: tone === "stop" ? "착공 전 협의 필요" : tone === "caution" ? "허가·동의 필요" : "신고만 필요", tone }, sections, notes } };
}

// ─── 3. 하자 책임기간 계산 ─────────────────────────────────────────────────────

/** 건설산업기본법 시행령 [별표 4] <개정 2021. 8. 3.> — 건축·전문공사 rows relevant to interiors. */
export const DEFECT_TRADES = [
  { value: "interior", label: "실내건축", years: 1, basis: "별표 4 제15호 ①" },
  { value: "plaster-tile", label: "미장·타일", years: 1, basis: "별표 4 제15호 ③" },
  { value: "waterproof", label: "방수", years: 3, basis: "별표 4 제15호 ④" },
  { value: "paint", label: "도장", years: 1, basis: "별표 4 제15호 ⑤" },
  { value: "stone-masonry", label: "석공사·조적", years: 2, basis: "별표 4 제15호 ⑥" },
  { value: "window", label: "창호설치", years: 1, basis: "별표 4 제15호 ⑦" },
  { value: "roof", label: "지붕", years: 3, basis: "별표 4 제15호 ⑧" },
  { value: "sheet-metal", label: "판금", years: 1, basis: "별표 4 제15호 ⑨" },
  { value: "hardware", label: "철물", years: 2, basis: "별표 4 제15호 ⑩" },
  { value: "concrete", label: "철근콘크리트·콘크리트 포장", years: 3, basis: "별표 4 제15호 ⑪" },
  { value: "mep", label: "급배수·냉난방·환기·공기조화·가스·배연설비", years: 2, basis: "별표 4 제15호 ⑫" },
  { value: "elevator", label: "승강기·인양기기 설비", years: 3, basis: "별표 4 제15호 ⑬" },
  { value: "boiler", label: "보일러 설치", years: 1, basis: "별표 4 제15호 ⑭" },
  { value: "other-mep", label: "그 밖의 건물 내 설비", years: 1, basis: "별표 4 제15호 ⑮" },
  { value: "assembly", label: "건축물 조립", years: 1, basis: "별표 4 제15호 ⑱" },
  { value: "structure-major", label: "공동주택 기둥·내력벽", years: 10, basis: "별표 4 제14호 ①" },
  { value: "structure-other", label: "그 밖의 구조상 주요부분", years: 5, basis: "별표 4 제14호 ②" },
] as const;

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function parseDate(v: string): Date | null {
  const m = v.match(/^(\d{4})[-./]?(\d{1,2})[-./]?(\d{1,2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) || d.getMonth() !== Number(m[2]) - 1 ? null : d;
}
/** Last day of the period: start + N years − 1 day (기간 계산은 초일 불산입 원칙에 맞춘 근사). */
function periodEnd(start: Date, years: number) {
  const end = new Date(start.getFullYear() + years, start.getMonth(), start.getDate());
  end.setDate(end.getDate() - 1);
  return end;
}

export function defectPeriods(input: Record<string, unknown>): { sources: RegulationSource[]; data: Report } {
  const start = parseDate(str(input.completedOn));
  if (!start) throw new RegulationError("완공일(또는 사용 시작일)을 YYYY-MM-DD 형식으로 입력해 주세요.");
  const asOf = parseDate(str(input.asOf)) ?? new Date();
  const today = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());
  const chosen = list(input.trades);
  const trades = DEFECT_TRADES.filter((t) => (chosen.length ? chosen.includes(t.value) : ["interior", "plaster-tile", "waterproof", "paint", "window", "mep"].includes(t.value)));

  const rows: ReportRow[] = trades
    .map((t) => {
      const end = periodEnd(start, t.years);
      const left = Math.round((end.getTime() - today.getTime()) / 864e5);
      const tone: Tone = left < 0 ? "stop" : left <= 60 ? "caution" : "ok";
      return {
        row: { label: `${t.label} · ${t.years}년`, value: left < 0 ? `만료 (${ymd(end)})` : `${ymd(end)}까지 · ${left}일 남음`, tone, note: `건설산업기본법 시행령 ${t.basis}` } as ReportRow,
        left,
      };
    })
    .sort((a, b) => a.left - b.left)
    .map((x) => x.row);

  const name = (r: ReportRow) => r.label.split(" · ")[0];
  const until = (r: ReportRow) => r.value.split("까지")[0];
  const open = rows.filter((r) => r.tone !== "stop");
  const expired = rows.filter((r) => r.tone === "stop");
  const soon = rows.filter((r) => r.tone === "caution");
  const tone: Tone = open.length === 0 ? "stop" : expired.length || soon.length ? "caution" : "ok";
  const headline =
    open.length === 0
      ? "선택한 공종의 법정 하자담보책임기간이 모두 지났습니다. 계약서의 별도 보증 조항을 확인하세요."
      : expired.length
        ? `${expired.map(name).join(", ")}은(는) 만료됐고, ${open.map((r) => `${name(r)}(${until(r)})`).join(", ")}은(는) 아직 책임기간 안입니다.`
        : soon.length
          ? `${soon.map(name).join(", ")}의 책임기간이 60일 안에 끝납니다. 하자가 있으면 지금 서면으로 알리세요.`
          : `선택한 공종 모두 책임기간 안입니다. 가장 먼저 끝나는 것은 ${name(rows[0]!)}(${until(rows[0]!)})입니다.`;

  const notes = [
    "기간은 공사 완공일과 목적물의 관리·사용을 시작한 날 중 먼저 온 날부터 셉니다(건설산업기본법 제28조).",
    "여러 공종이 섞인 공사는 하자 책임을 나눌 수 없는 경우가 아니면 공종별 기간을 따로 적용합니다(별표 4 비고).",
    "전기·정보통신·소방 공사는 각 개별법의 기간을 따릅니다(같은 법 시행령 제28조 제3항 취지). 소방시설은 소방시설공사업법 시행령 제6조(2년 또는 3년)를 확인하세요.",
    "신축 아파트를 분양받은 경우의 사업주체 담보책임은 공동주택관리법 시행령 별표 4(마감 2년, 설비 3년 등)로 기간이 다릅니다.",
    "책임기간 안에 하자를 발견하면 사진과 함께 내용증명 등 서면으로 통지해 기록을 남기세요.",
  ];
  const sources = [
    lawSource("law_annex4", "건설산업기본법 시행령 [별표 4] 건설공사의 종류별 하자담보책임기간 (2021. 8. 3. 개정)", LAW.constructionAnnex4, "실내건축 1년, 미장·타일 1년, 방수 3년, 도장 1년, 창호설치 1년, 급배수·냉난방 등 설비 2년"),
    lawSource("law_act28", "건설산업기본법 제28조 (건설공사 수급인 등의 하자담보책임)", LAW.constructionAct28, "완공일과 관리·사용 개시일 중 먼저 도래한 날부터 기산"),
  ];
  return { sources, data: { kind: "report", headline, verdict: { label: open.length === 0 ? "법정 기간 만료" : expired.length ? "일부 만료" : soon.length ? "곧 만료" : "책임기간 안", tone }, sections: [{ title: `공종별 책임기간 (기산일 ${ymd(start)} · 기준일 ${ymd(today)})`, rows }], notes } };
}

// ─── LLM helper (견적 검토 · 하자 진단) ──────────────────────────────────────

export const hasToolModel = () => Boolean(process.env.DEEPSEEK_API_KEY?.trim() || process.env.CHAT_LLM_BASE_URL?.trim() || process.env.OPENAI_API_KEY?.trim());
const hasVision = () => Boolean(process.env.OPENAI_API_KEY?.trim());

function toolModel() {
  if (process.env.DEEPSEEK_API_KEY?.trim() && (process.env.CHAT_AI_PROVIDER === "deepseek" || !process.env.OPENAI_API_KEY)) return deepseekModel();
  const baseURL = process.env.CHAT_LLM_BASE_URL?.trim();
  if (baseURL && !process.env.OPENAI_API_KEY) return createOpenAI({ baseURL, apiKey: process.env.CHAT_LLM_API_KEY || "local", name: "local" }).chat(process.env.CHAT_LLM_MODEL?.trim() || "qwen3.5:27b");
  return openai(process.env.OPENAI_MODEL_HEAVY || "gpt-5.4-mini");
}

/** Ask the model for a JSON object; returns null instead of throwing so rule-based output still ships. */
async function askJson<T>(system: string, messages: ModelMessage[], model = toolModel()): Promise<T | null> {
  try {
    const { text } = await generateText({ model, system: `${system}\n반드시 JSON 객체 하나만 출력한다. 설명 문장이나 코드블록 표시는 쓰지 않는다.`, messages, maxOutputTokens: 1400, abortSignal: AbortSignal.timeout(60_000) });
    const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
    return json ? (JSON.parse(json) as T) : null;
  } catch (e) {
    console.warn("[tools] model call failed", (e as Error).message);
    return null;
  }
}

// ─── 4. 견적서 검토 ────────────────────────────────────────────────────────────

const TRADES: { key: string; label: string; words: RegExp }[] = [
  { key: "demolition", label: "철거", words: /철거|해체/ },
  { key: "waste", label: "폐기물 처리", words: /폐기물|폐자재|운반|반출/ },
  { key: "protection", label: "보양", words: /보양/ },
  { key: "plumbing", label: "설비(급배수)", words: /설비|배관|급수|배수|수도/ },
  { key: "waterproof", label: "방수", words: /방수/ },
  { key: "electric", label: "전기", words: /전기|배선|콘센트|스위치|분전/ },
  { key: "lighting", label: "조명", words: /조명|등기구|LED|다운라이트|매입등/ },
  { key: "carpentry", label: "목공", words: /목공|목작업|천장|몰딩|걸레받이|가벽|석고/ },
  { key: "tile", label: "타일", words: /타일|포세린|줄눈/ },
  { key: "bath", label: "욕실(도기·수전)", words: /욕실|양변기|세면대|수전|욕조|샤워/ },
  { key: "paint", label: "도장", words: /도장|페인트|칠/ },
  { key: "wallpaper", label: "도배", words: /도배|벽지/ },
  { key: "floor", label: "바닥재", words: /마루|강마루|원목|장판|데코타일|바닥재/ },
  { key: "window", label: "창호(샷시)", words: /샷시|새시|창호|창틀|PVC창/ },
  { key: "furniture", label: "가구(주방·붙박이)", words: /싱크|주방가구|붙박이|수납장|신발장|가구/ },
  { key: "film", label: "필름", words: /필름|인테리어필름/ },
  { key: "balcony", label: "발코니 확장", words: /확장|방화판|단열/ },
  { key: "hvac", label: "냉난방", words: /에어컨|냉난방|보일러|난방/ },
  { key: "cleaning", label: "준공 청소", words: /청소|입주청소/ },
  { key: "management", label: "현장관리·공과잡비", words: /관리비|공과|잡비|감리|현장관리|일반관리/ },
  { key: "vat", label: "부가가치세", words: /부가세|부가가치세|VAT/i },
];

function parseAmounts(text: string) {
  const amounts: number[] = [];
  for (const line of text.split(/\n/)) {
    const m = line.match(/(\d{1,3}(?:,\d{3})+|\d{4,})\s*(원|$)/);
    if (m) amounts.push(Number(m[1]!.replace(/,/g, "")));
  }
  const totalLine = text.split(/\n/).find((l) => /합계|총액|총\s*공사비|총계/.test(l));
  const totalMatch = totalLine?.match(/(\d{1,3}(?:,\d{3})+|\d{4,})/);
  const manMatch = totalLine?.match(/(\d+(?:\.\d+)?)\s*만\s*원/);
  const total = totalMatch ? Number(totalMatch[1]!.replace(/,/g, "")) : manMatch ? Math.round(Number(manMatch[1]) * 10000) : amounts.length ? Math.max(...amounts) : 0;
  return { total, lines: amounts.length };
}

export async function quoteReview(input: Record<string, unknown>): Promise<{ sources: RegulationSource[]; data: Report }> {
  const quote = str(input.quote);
  if (quote.length < 30) throw new RegulationError("견적서 내용을 붙여 넣어 주세요(엑셀·PDF에서 복사해도 됩니다).");
  if (quote.length > 20000) throw new RegulationError("견적서가 너무 깁니다. 공종별 합계 위주로 2만 자 이내로 줄여 주세요.");
  const area = str(input.area);
  const scope = str(input.scope);

  const present = new Set(TRADES.filter((t) => t.words.test(quote)).map((t) => t.key));
  const has = (k: string) => present.has(k);
  const findings: ReportRow[] = [];
  if ((has("bath") || has("tile")) && !has("waterproof")) findings.push({ label: "방수", value: "욕실·타일 공사가 있는데 방수 항목이 없습니다", tone: "stop", note: "욕실 바닥·벽 방수(도막·시트)와 담수 시험을 별도 항목으로 받으세요. 방수 하자 책임기간은 3년입니다." });
  if (has("demolition") && !has("waste")) findings.push({ label: "폐기물", value: "철거는 있는데 폐기물 처리·운반비가 보이지 않습니다", tone: "caution", note: "나중에 추가 청구되기 쉬운 항목입니다. 포함 여부를 확인하세요." });
  if (has("demolition") && !has("protection")) findings.push({ label: "보양", value: "공용부(엘리베이터·복도) 보양 항목이 없습니다", tone: "caution", note: "관리사무소 공사 신고 조건인 경우가 많습니다." });
  if (has("balcony")) findings.push({ label: "발코니 확장", value: "행위허가·소방 시설 비용이 포함됐는지 확인하세요", tone: "caution", note: "감지기 추가, 방화판(또는 방화유리창), 사용검사·건축물대장 등재 대행비가 빠지기 쉽습니다." });
  if (has("electric") === false && (has("lighting") || has("carpentry"))) findings.push({ label: "전기", value: "조명·목공은 있는데 전기(배선·콘센트) 항목이 없습니다", tone: "caution", note: "조명 위치 변경, 콘센트 증설 배선 비용이 어디에 들어 있는지 확인하세요." });
  if (!has("vat")) findings.push({ label: "부가가치세", value: "부가세 포함 여부가 적혀 있지 않습니다", tone: "caution", note: "같은 금액이라도 10% 차이가 납니다. 계약서에 포함·별도를 적으세요." });
  if (!has("management")) findings.push({ label: "현장관리비", value: "현장관리·공과잡비 항목이 없습니다", tone: "info", note: "각 공종 단가에 녹여 넣었는지, 나중에 따로 청구하는지 확인하세요." });
  if (!has("cleaning")) findings.push({ label: "준공 청소", value: "준공(입주) 청소 포함 여부가 없습니다", tone: "info" });
  const lumpLines = quote.split(/\n/).filter((l) => /(^|\s)(1\s*식|일식|식\s*$|1식)/.test(l)).length;
  if (lumpLines >= 3) findings.push({ label: "일식(一式) 항목", value: `수량 없이 '1식'으로 적힌 줄이 ${lumpLines}개입니다`, tone: "caution", note: "주요 공종은 수량·단가로 풀어 받아야 비교와 정산이 가능합니다." });

  const { total, lines } = parseAmounts(quote);
  if (total >= 15_000_000) findings.push({ label: "업체 자격", value: `총액이 약 ${Math.round(total / 10000).toLocaleString()}만 원으로 1,500만 원 이상입니다`, tone: "caution", note: "건설업(실내건축공사업) 등록 업체와 계약해야 합니다. 'Apps › 업체 한 번에 확인'으로 등록을 확인하세요." });

  const presentLabels = TRADES.filter((t) => present.has(t.key)).map((t) => t.label);

  // Model pass: overall read, odd quantities/prices, questions to ask. Rule findings stay authoritative.
  const ai = hasToolModel()
    ? await askJson<{ summary?: string; concerns?: { item: string; reason: string }[]; questions?: string[] }>(
        "너는 주거 인테리어 견적서를 검토하는 협회 실무 자문이다. 시공사와 건축주 어느 쪽 편도 들지 않는다. 시세를 단정하지 말고, 견적서 안에서 근거를 찾을 수 있는 것만 지적한다. 출력 형식: {\"summary\": \"2~3문장 총평\", \"concerns\": [{\"item\": \"항목\", \"reason\": \"이유(한 문장)\"}] (최대 5개), \"questions\": [\"업체에 물어볼 질문\"] (최대 5개)}",
        [{ role: "user", content: `주거 공사 면적: ${area || "미기재"}\n공사 범위: ${scope || "미기재"}\n이미 규칙으로 찾은 문제: ${findings.map((f) => f.value).join(" / ") || "없음"}\n\n견적서:\n${quote.slice(0, 12000)}` }],
      )
    : null;

  const sections: Report["sections"] = [];
  if (findings.length) sections.push({ title: "빠졌거나 확인할 항목", rows: findings });
  sections.push({
    title: "견적서에 있는 공종",
    rows: [
      { label: "포함", value: presentLabels.join(", ") || "공종을 찾지 못했습니다" },
      { label: "금액 줄 수", value: `${lines}줄${total ? ` · 총액 추정 ${total.toLocaleString()}원` : ""}` },
      ...(area && total ? [{ label: "면적당", value: (() => { const py = Number(area.replace(/[^\d.]/g, "")); return py ? `약 ${Math.round(total / py / 10000).toLocaleString()}만 원 / ${/㎡|m2|제곱/.test(area) ? "㎡" : "평"}` : "-"; })() }] : []),
    ],
  });
  if (ai?.concerns?.length) sections.push({ title: "AI 검토 의견", rows: ai.concerns.slice(0, 5).map((c) => ({ label: c.item, value: c.reason, tone: "caution" as Tone })) });
  if (ai?.questions?.length) sections.push({ title: "업체에 물어볼 것", rows: ai.questions.slice(0, 5).map((q, i) => ({ label: `질문 ${i + 1}`, value: q })) });

  const stops = findings.filter((f) => f.tone === "stop").length;
  const cautions = findings.filter((f) => f.tone === "caution").length;
  const tone: Tone = stops ? "stop" : cautions ? "caution" : "ok";
  const headline = ai?.summary?.trim() || (stops ? "하자로 이어질 수 있는 항목이 빠져 있습니다. 계약 전에 견적을 보완받으세요." : cautions ? `계약 전에 확인할 항목이 ${cautions}개 있습니다.` : "기본 공종이 고루 들어 있습니다.");
  const notes = ["시세 비교가 아니라 견적서 구성(누락·중복·표기)을 점검한 결과입니다.", ...(ai ? [] : ["AI 검토는 이번에 실행되지 않았습니다. 규칙 검사 결과만 표시합니다."])];
  const sources = [lawSource("law_minor_work", "건설산업기본법 시행령 제8조 (경미한 건설공사)", LAW.minorWork, "공사예정금액 1천5백만 원 미만 전문공사는 건설업 등록 없이 시공 가능")];
  return { sources, data: { kind: "report", headline, verdict: { label: stops ? "보완 필요" : cautions ? "확인 필요" : "양호", tone }, sections, notes } };
}

// ─── 5. 하자 진단 ──────────────────────────────────────────────────────────────

export const DEFECT_LOCATIONS = ["욕실", "주방", "거실·방", "발코니", "현관", "창호 주변", "천장", "벽", "바닥"];
export const DEFECT_TIMING = [
  { value: "just-after", label: "공사 직후 (1개월 이내)" },
  { value: "months", label: "몇 달 뒤" },
  { value: "year", label: "1년 이상 지나서" },
  { value: "winter", label: "겨울철에 반복" },
  { value: "rain", label: "비 온 뒤" },
];

type Evidence = { title: string; text: string; pages?: string | null; trust: string };

export async function defectDiagnosis(
  input: Record<string, unknown>,
  retrieve: (query: string) => Promise<Evidence[]>,
): Promise<{ sources: RegulationSource[]; data: Report }> {
  const symptom = str(input.symptom);
  if (symptom.length < 6) throw new RegulationError("증상을 한두 문장으로 적어 주세요(어디에, 어떤 모양으로, 언제부터).");
  const location = str(input.location);
  const timing = DEFECT_TIMING.find((t) => t.value === str(input.timing))?.label ?? "";
  const photo = str(input.photo);
  if (photo && !/^data:image\/(png|jpe?g|webp);base64,/.test(photo)) throw new RegulationError("사진은 JPG·PNG·WEBP만 올릴 수 있습니다.");
  if (photo.length > 4_000_000) throw new RegulationError("사진이 너무 큽니다. 3MB 이하로 줄여 주세요.");

  const evidence = await retrieve(`${location} ${symptom}`).catch(() => [] as Evidence[]);
  const usePhoto = Boolean(photo && hasVision());

  const content: Exclude<ModelMessage["content"], string> = [
    { type: "text", text: `위치: ${location || "미기재"}\n발생 시기: ${timing || "미기재"}\n증상: ${symptom}\n\n협회 자료 근거:\n${evidence.map((e, i) => `[${i + 1}] ${e.title}${e.pages ? ` (${e.pages})` : ""}\n${e.text.slice(0, 900)}`).join("\n\n") || "관련 자료 없음"}` },
    ...(usePhoto ? [{ type: "image" as const, image: photo }] : []),
  ];
  const ai = hasToolModel()
    ? await askJson<{ summary?: string; causes?: { cause: string; likelihood: string; why: string }[]; checks?: string[]; urgent?: string; trade?: string }>(
        "너는 주거 인테리어 하자를 진단하는 협회 실무 자문이다. 협회 자료 근거가 있으면 우선 사용하고 근거 번호를 [1]처럼 붙인다. 현장을 보지 않았으므로 원인을 단정하지 않고 가능성 순으로 제시한다. 출력 형식: {\"summary\": \"2문장 결론\", \"causes\": [{\"cause\": \"원인\", \"likelihood\": \"높음|중간|낮음\", \"why\": \"그렇게 본 이유\"}] (최대 4개), \"checks\": [\"확인 순서(집에서 해볼 것 → 전문가 점검)\"] (최대 5개), \"urgent\": \"지금 해야 할 응급 조치(없으면 빈 문자열)\", \"trade\": \"책임 공종(예: 방수, 설비, 타일, 창호, 도장, 실내건축)\"}",
        [{ role: "user", content }],
        usePhoto ? openai(process.env.OPENAI_MODEL_HEAVY || "gpt-5.4-mini") : toolModel(),
      )
    : null;

  const sections: Report["sections"] = [];
  if (ai?.causes?.length) {
    sections.push({
      title: "원인 후보",
      rows: ai.causes.slice(0, 4).map((c) => ({ label: c.cause, value: `가능성 ${c.likelihood}`, tone: (c.likelihood === "높음" ? "caution" : "info") as Tone, note: c.why })),
    });
  }
  if (ai?.checks?.length) sections.push({ title: "확인 순서", rows: ai.checks.slice(0, 5).map((c, i) => ({ label: `${i + 1}단계`, value: c })) });
  if (ai?.urgent?.trim()) sections.push({ title: "지금 할 일", rows: [{ label: "응급 조치", value: ai.urgent.trim(), tone: "stop" }] });
  const trade = DEFECT_TRADES.find((t) => ai?.trade && (ai.trade.includes(t.label) || t.label.includes(ai.trade)));
  if (ai?.trade) sections.push({ title: "책임 공종", rows: [{ label: ai.trade, value: trade ? `법정 하자담보책임기간 ${trade.years}년` : "공종별 기간은 '하자 책임기간 계산기'에서 확인", note: trade ? `건설산업기본법 시행령 ${trade.basis}` : undefined }] });
  if (!ai && evidence.length) sections.push({ title: "협회 자료에서 찾은 내용", rows: evidence.slice(0, 4).map((e) => ({ label: e.title, value: e.text.slice(0, 220) })) });

  const notes = [
    "사진과 설명만으로 본 1차 의견입니다. 누수·구조 문제는 현장 점검으로 확정하세요.",
    ...(photo && !usePhoto ? ["사진 분석 모델이 아직 연결되지 않아 설명만으로 진단했습니다."] : []),
    ...(ai ? [] : ["AI 진단이 실행되지 않아 협회 자료만 보여 드립니다."]),
  ];
  const headline = ai?.summary?.trim() || (evidence.length ? "관련 협회 자료를 찾았습니다. 아래 내용을 확인하세요." : "관련 자료를 찾지 못했습니다. 증상을 더 구체적으로 적어 주세요.");
  const sources: RegulationSource[] = evidence.map((e, i) => ({ id: `wiki_defect_${i}`, title: `${e.title}${e.pages ? ` (${e.pages})` : ""}`, sourceType: "knowledge_base", publisher: `INDEX 위키 · ${e.trust}`, url: "", snippet: e.text.slice(0, 200), retrievedAt: now() }));
  const high = ai?.causes?.some((c) => c.likelihood === "높음");
  return { sources, data: { kind: "report", headline, verdict: { label: ai?.urgent?.trim() ? "빠른 조치 필요" : high ? "원인 확인 필요" : "점검 권장", tone: ai?.urgent?.trim() ? "stop" : "caution" }, sections, notes } };
}
