import { floorPlanImageUrl, loadGeo, loadMerged, mutateEdits, r2, reviewedWallList, type MergedDanji } from "./_floorplans.js";

/** 도면 관리 (/admin/floorplan-manage): listing and editing the floor plan collection. */
const badRequest = (message: string) => Object.assign(new Error(message), { status: 400 });
const notFound = (message: string) => Object.assign(new Error(message), { status: 404 });

type Input = Record<string, unknown>;
const text = (value: unknown, label: string, max: number) => {
  const clean = String(value ?? "").normalize("NFC").trim();
  if (!clean || clean.length > max) throw badRequest(`${label}을(를) ${max}자 이내로 입력해 주세요.`);
  return clean;
};
const area = (value: unknown, label: string, max = 2000) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || number > max) throw badRequest(`${label} 값이 올바르지 않습니다.`);
  return Math.round(number * 100) / 100;
};
function coords(input: Input) {
  const lat = Number(input.lat), lng = Number(input.lng);
  if (!(lat > 32.5 && lat < 39) || !(lng > 124 && lng < 132)) throw badRequest("대한민국 안의 위치를 지정해 주세요.");
  return { lat: Math.round(lat * 100000) / 100000, lng: Math.round(lng * 100000) / 100000 };
}
const newId = () => String(900_000_000_000 + (Date.now() % 90_000_000_000));
const toPyeong = (supply: number) => Math.round((supply / 3.3058) * 100) / 100;

const FILTERS = ["all", "noLocation", "suspect", "surveyed", "reviewed", "hidden", "added"] as const;
type Filter = (typeof FILTERS)[number];

const normalize = (value: string) => value.normalize("NFC").toLowerCase().replace(/아파트|[\s()[\]·.,_-]/g, "");
const PAGE_SIZE = 50;

async function approvedPlanIds() {
  const records = await reviewedWallList().catch(() => []);
  return new Map(records.map((record) => [record.planId, record.status]));
}

/** "경기도 수원시 장안구" → 경기도 / 수원시 장안구. */
function splitRegion(region: string): [sido: string, sigungu: string] {
  const space = region.indexOf(" ");
  return space < 0 ? [region, ""] : [region.slice(0, space), region.slice(space + 1)];
}

/** 시·도 → 시·군·구 → 읍·면·동, for the dropdowns. */
export async function managedRegionTree() {
  const { danji } = await loadMerged();
  const tree = new Map<string, Map<string, Set<string>>>();
  for (const item of danji) {
    const [sido, sigungu] = splitRegion(item.region);
    if (!tree.has(sido)) tree.set(sido, new Map());
    const districts = tree.get(sido)!;
    if (!districts.has(sigungu)) districts.set(sigungu, new Set());
    districts.get(sigungu)!.add(item.dong);
  }
  const korean = (a: string, b: string) => a.localeCompare(b, "ko");
  return {
    tree: Object.fromEntries([...tree].sort(([a], [b]) => korean(a, b)).map(([sido, districts]) => [
      sido,
      Object.fromEntries([...districts].sort(([a], [b]) => korean(a, b)).map(([sigungu, dongs]) => [sigungu, [...dongs].sort(korean)])),
    ])),
  };
}

export async function managedDanjiList(input: Input) {
  const [{ danji, edits }, geo, reviews] = await Promise.all([loadMerged(), loadGeo().catch(() => new Map<string, [number, number]>()), approvedPlanIds()]);
  const located = (item: MergedDanji) => edits.danji[item.kbId]?.lat !== undefined || geo.has(item.kbId);
  const sido = String(input.sido ?? ""), sigungu = String(input.sigungu ?? ""), dong = String(input.dong ?? "");
  const inRegion = (item: MergedDanji) => {
    const [itemSido, itemSigungu] = splitRegion(item.region);
    return (!sido || itemSido === sido) && (!sigungu || itemSigungu === sigungu) && (!dong || item.dong === dong);
  };
  const facts = danji.filter(inRegion).map((item) => {
    const visible = item.plans.filter((plan) => !plan.hidden);
    return {
      item,
      located: located(item),
      suspect: visible.filter((plan) => plan.row[5] === 1 && !plan.surveyed).length,
      surveyed: visible.filter((plan) => plan.surveyed).length,
      reviewed: visible.filter((plan) => reviews.get(plan.row[0]) === "approved").length,
      hiddenPlans: item.plans.length - visible.length,
      count: visible.length,
    };
  });
  type Fact = (typeof facts)[number];
  const tests: Record<Filter, (fact: Fact) => boolean> = {
    all: () => true,
    noLocation: (fact) => !fact.located && !fact.item.hidden,
    suspect: (fact) => fact.suspect > 0 && !fact.item.hidden,
    surveyed: (fact) => fact.surveyed > 0,
    reviewed: (fact) => fact.reviewed > 0,
    hidden: (fact) => fact.item.hidden || fact.hiddenPlans > 0,
    added: (fact) => fact.item.added || fact.item.plans.some((plan) => plan.added),
  };
  const counts = Object.fromEntries(FILTERS.map((filter) => [filter, facts.filter(tests[filter]).length]));
  const filter: Filter = FILTERS.includes(input.filter as Filter) ? (input.filter as Filter) : "all";
  const terms = String(input.query ?? "").normalize("NFC").split(/\s+/).map(normalize).filter(Boolean);
  const matched = facts.filter((fact) => {
    if (!tests[filter](fact)) return false;
    const haystack = normalize(`${fact.item.region}${fact.item.dong}${fact.item.name}`);
    return terms.every((term) => haystack.includes(term));
  });
  const pages = Math.max(1, Math.ceil(matched.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Math.floor(Number(input.page)) || 1));
  return {
    counts,
    total: matched.length,
    page,
    pages,
    rows: matched.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(({ item, ...fact }) => ({ kbId: item.kbId, name: item.name, region: item.region, dong: item.dong, hidden: item.hidden, added: item.added, ...fact })),
  };
}

async function findDanji(kbId: string) {
  const { danji, edits } = await loadMerged();
  const item = danji.find((entry) => entry.kbId === kbId);
  if (!item) throw notFound("단지를 찾지 못했습니다.");
  return { item, edits };
}

export async function managedDanjiDetail(kbId: string) {
  const [{ item, edits }, geo, reviews] = await Promise.all([findDanji(kbId), loadGeo().catch(() => new Map<string, [number, number]>()), approvedPlanIds()]);
  const edit = edits.danji[kbId];
  const at = edit?.lat !== undefined && edit.lng !== undefined ? ([edit.lat, edit.lng] as const) : geo.get(kbId);
  const plans = await Promise.all(item.plans.map(async ({ row: [id, pyeong, type, supply, exclusive, suspect], hidden, added }) => {
    const image = await floorPlanImageUrl(id);
    return { id, type, pyeong, supply, exclusive, suspect: suspect === 1, hidden, added, surveyedNote: image.verified?.note ?? null, review: reviews.get(id) ?? null, url: image.url };
  }));
  return { danji: { kbId, name: item.name, region: item.region, dong: item.dong, hidden: item.hidden, added: item.added, lat: at?.[0] ?? null, lng: at?.[1] ?? null }, plans };
}

export async function updateManagedDanji(kbId: string, input: Input) {
  await findDanji(kbId);
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = text(input.name, "단지명", 80);
  if (input.region !== undefined) patch.region = text(input.region, "지역", 40);
  if (input.dong !== undefined) patch.dong = text(input.dong, "동", 30);
  if (typeof input.hidden === "boolean") patch.hidden = input.hidden;
  if (input.lat !== undefined || input.lng !== undefined) Object.assign(patch, coords(input));
  await mutateEdits((edits) => {
    edits.danji[kbId] = { ...edits.danji[kbId], ...patch };
  });
}

export async function addManagedDanji(input: Input) {
  const item = { kbId: newId(), name: text(input.name, "단지명", 80), region: text(input.region, "지역", 40), dong: text(input.dong, "동", 30) };
  const at = input.lat !== undefined || input.lng !== undefined ? coords(input) : null;
  await mutateEdits((edits) => {
    edits.addedDanji.push(item);
    if (at) edits.danji[item.kbId] = at;
  });
  return { kbId: item.kbId };
}

async function planOwner(id: string) {
  const { danji } = await loadMerged();
  return danji.find((entry) => entry.plans.some((plan) => plan.row[0] === id)) ?? null;
}

export async function updateManagedPlan(id: string, input: Input) {
  if (!(await planOwner(id))) throw notFound("도면을 찾지 못했습니다.");
  const patch: Record<string, unknown> = {};
  if (input.type !== undefined) patch.type = text(input.type, "타입", 40);
  if (input.exclusive !== undefined) patch.exclusive = area(input.exclusive, "전용면적");
  if (input.supply !== undefined) patch.supply = area(input.supply, "공급면적");
  if (input.pyeong !== undefined) patch.pyeong = area(input.pyeong, "평수", 600);
  if (typeof input.hidden === "boolean") patch.hidden = input.hidden;
  if (typeof input.notSuspect === "boolean") patch.notSuspect = input.notSuspect;
  await mutateEdits((edits) => {
    edits.plans[id] = { ...edits.plans[id], ...patch };
  });
}

export async function addManagedPlan(kbId: string, input: Input) {
  await findDanji(kbId);
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(input.image ?? ""));
  if (!match || match[1]!.length > 3_600_000) throw badRequest("도면 이미지가 올바르지 않거나 너무 큽니다.");
  const bytes = Buffer.from(match[1]!, "base64");
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw badRequest("JPEG 이미지가 아닙니다.");
  const supply = area(input.supply, "공급면적");
  const plan = { id: newId(), kbId, type: text(input.type, "타입", 40), exclusive: area(input.exclusive, "전용면적"), supply, pyeong: toPyeong(supply) };
  const saved = await r2("PUT", `plans/${plan.id}.jpg`, bytes, "image/jpeg");
  if (!saved.ok) throw new Error(`저장하지 못했습니다 (${saved.status}).`);
  await mutateEdits((edits) => {
    edits.addedPlans.push(plan);
  });
  return { id: plan.id };
}
