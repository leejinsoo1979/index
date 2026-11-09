import { createHash, createHmac } from "node:crypto";
import { generateText } from "ai";
import { deepseekModel } from "./_deepseek.js";

/**
 * Apartment floor plans: images in the private R2 bucket (`plans/<id>.jpg`), one searchable index
 * (`index/index.json`, built by scripts/floorplans-index.mjs) and cached readings
 * (`analysis/v2/<id>.json`). Images leave the bucket only through short-lived signed URLs.
 */
type PlanRow = [id: string, pyeong: number, type: string, supply: number, exclusive: number, suspect: 0 | 1];
type DanjiRow = [region: number, name: string, dong: string, kbId: string, plans: PlanRow[]];
type FloorPlanIndex = { v: 1; regions: string[]; danji: DanjiRow[] };

export type PlanCard = { id: string; type: string; pyeong: number; supply: number; exclusive: number; suspect: boolean };
export type DanjiInfo = { kbId: string; name: string; region: string; dong: string; count: number };
export type FloorPlanCards =
  | { kind: "plans"; danji: DanjiInfo; plans: PlanCard[] }
  | { kind: "danji"; items: DanjiInfo[] };

const env = () => ({
  account: process.env.R2_ACCOUNT_ID?.trim() ?? "",
  accessKey: process.env.FLOORPLAN_R2_ACCESS_KEY_ID?.trim() ?? "",
  secret: process.env.FLOORPLAN_R2_SECRET_ACCESS_KEY?.trim() ?? "",
  bucket: process.env.FLOORPLAN_R2_BUCKET?.trim() ?? "",
});
export const floorPlansConfigured = () => Object.values(env()).every(Boolean);

const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const hmac = (key: string | Buffer, value: string) => createHmac("sha256", key).update(value).digest();
const signingKey = (secret: string, day: string) => hmac(hmac(hmac(hmac(`AWS4${secret}`, day), "auto"), "s3"), "aws4_request");
const amzDate = () => new Date().toISOString().replace(/[-:]|\.\d{3}/g, "");

async function r2(method: "GET" | "PUT" | "DELETE", key: string, body?: Buffer | string, contentType?: string) {
  const { account, accessKey, secret, bucket } = env();
  const host = `${account}.r2.cloudflarestorage.com`;
  const path = `/${bucket}/${key}`;
  const amz = amzDate();
  const day = amz.slice(0, 8);
  const payload = body ? sha(body) : "UNSIGNED-PAYLOAD";
  const signed = "host;x-amz-content-sha256;x-amz-date";
  const canonical = [method, path, "", `host:${host}\nx-amz-content-sha256:${payload}\nx-amz-date:${amz}\n`, signed, payload].join("\n");
  const scope = `${day}/auto/s3/aws4_request`;
  const signature = createHmac("sha256", signingKey(secret, day)).update(["AWS4-HMAC-SHA256", amz, scope, sha(canonical)].join("\n")).digest("hex");
  return fetch(`https://${host}${path}`, {
    method,
    signal: AbortSignal.timeout(20_000),
    body: body ? new Uint8Array(typeof body === "string" ? Buffer.from(body) : body) : undefined,
    headers: {
      "x-amz-date": amz,
      "x-amz-content-sha256": payload,
      ...(contentType ? { "content-type": contentType } : {}),
      authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signed}, Signature=${signature}`,
    },
  });
}

/** A surveyed drawing an admin registered in place of the collected image. */
export type VerifiedPlan = { planId: string; image: string; pdf: string | null; width: number; height: number; note: string; fileName: string; uploadedBy: string; uploadedAt: string };

export async function readVerified(id: string): Promise<VerifiedPlan | null> {
  const stored = await r2("GET", `verified/${id}.json`);
  return stored.ok ? ((await stored.json()) as VerifiedPlan) : null;
}

const imageKeyOf = (id: string, verified: VerifiedPlan | null) => verified?.image ?? `plans/${id}.jpg`;

/** Signed GET URL for the drawing currently in use (15 minutes). */
export async function floorPlanImageUrl(id: string): Promise<{ url: string; verified: VerifiedPlan | null }> {
  const verified = await readVerified(id).catch(() => null);
  return { url: signedUrl(imageKeyOf(id, verified)), verified };
}

export const signedFileUrl = (key: string) => signedUrl(key);

function signedUrl(key: string, expires = 900): string {
  const { account, accessKey, secret, bucket } = env();
  const host = `${account}.r2.cloudflarestorage.com`;
  const path = `/${bucket}/${key}`;
  const amz = amzDate();
  const day = amz.slice(0, 8);
  const scope = `${day}/auto/s3/aws4_request`;
  const query = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${accessKey}/${scope}`],
    ["X-Amz-Date", amz],
    ["X-Amz-Expires", String(expires)],
    ["X-Amz-SignedHeaders", "host"],
  ].map(([k, v]) => `${encodeURIComponent(k!)}=${encodeURIComponent(v!)}`).sort().join("&");
  const canonical = ["GET", path, query, `host:${host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const signature = createHmac("sha256", signingKey(secret, day)).update(["AWS4-HMAC-SHA256", amz, scope, sha(canonical)].join("\n")).digest("hex");
  return `https://${host}${path}?${query}&X-Amz-Signature=${signature}`;
}

let cached: { at: number; index: FloorPlanIndex } | null = null;
async function loadIndex(): Promise<FloorPlanIndex> {
  if (cached && Date.now() - cached.at < 3_600_000) return cached.index;
  const response = await r2("GET", "index/index.json");
  if (!response.ok) throw new Error(`평면도 목록을 불러오지 못했습니다 (${response.status}).`);
  const index = (await response.json()) as FloorPlanIndex;
  cached = { at: Date.now(), index };
  return index;
}

type MapSpot = [kbId: string, lat: number, lng: number, name: string, region: number, dong: string, count: number];
export type FloorPlanMapData = { regions: string[]; spots: MapSpot[]; total: number };

let cachedMap: { at: number; data: FloorPlanMapData } | null = null;
/** Every complex with coordinates (index/geo.json, built by scripts/floorplans-geocode.mjs --build). */
export async function floorPlanMap(): Promise<FloorPlanMapData> {
  if (cachedMap && Date.now() - cachedMap.at < 3_600_000) return cachedMap.data;
  const [index, response] = await Promise.all([loadIndex(), r2("GET", "index/geo.json")]);
  if (!response.ok) throw Object.assign(new Error("지도 위치 정보가 아직 준비되지 않았습니다."), { status: 503 });
  const geo = (await response.json()) as { spots: [string, number, number][] };
  const rows = new Map(index.danji.map((row) => [row[3], row]));
  const spots = geo.spots.flatMap(([kbId, lat, lng]): MapSpot[] => {
    const row = rows.get(kbId);
    return row ? [[kbId, lat, lng, row[1], row[0], row[2], row[4].length]] : [];
  });
  const data = { regions: index.regions, spots, total: index.danji.length };
  cachedMap = { at: Date.now(), data };
  return data;
}

const normalize = (value: string) =>
  value.normalize("NFC").toLowerCase().replace(/아파트/g, "").replace(/[\s()[\]·.,_-]/g, "");
const danjiInfo = (index: FloorPlanIndex, row: DanjiRow): DanjiInfo => ({ kbId: row[3], name: row[1], region: index.regions[row[0]] ?? "", dong: row[2], count: row[4].length });
const planCard = ([id, pyeong, type, supply, exclusive, suspect]: PlanRow): PlanCard => ({ id, type, pyeong, supply, exclusive, suspect: suspect === 1 });

function plansCards(index: FloorPlanIndex, row: DanjiRow, areaM2?: number): FloorPlanCards {
  const near = areaM2 ? row[4].filter((p) => Math.abs(p[4] - areaM2) <= 4 || Math.abs(p[3] - areaM2) <= 4) : [];
  return { kind: "plans", danji: danjiInfo(index, row), plans: (near.length ? near : row[4]).slice(0, 24).map(planCard) };
}

/** Find complexes by name/neighbourhood words: one match gives its plans, several give a list to pick from. */
export async function findFloorPlans(query: string, areaM2?: number): Promise<FloorPlanCards | null> {
  const index = await loadIndex();
  const terms = query.normalize("NFC").split(/\s+/).map(normalize).filter(Boolean);
  if (!terms.length) return null;
  const whole = terms.join("");
  const matches = index.danji
    .map((row) => {
      const name = normalize(row[1]);
      const place = normalize(`${index.regions[row[0]] ?? ""}${row[2]}`);
      if (!terms.every((term) => name.includes(term) || place.includes(term))) return null;
      const nameTerms = terms.filter((term) => name.includes(term));
      if (!nameTerms.length) return null; // a neighbourhood alone is not a complex
      return { row, score: (name === whole ? 100 : 0) + nameTerms.join("").length * 2 - name.length * 0.1 };
    })
    .filter((match): match is NonNullable<typeof match> => match !== null)
    .sort((a, b) => b.score - a.score);
  if (!matches.length) return null;
  if (matches.length === 1) return plansCards(index, matches[0]!.row, areaM2);
  return { kind: "danji", items: matches.slice(0, 8).map((match) => danjiInfo(index, match.row)) };
}

export async function floorPlansOfDanji(kbId: string): Promise<FloorPlanCards | null> {
  const index = await loadIndex();
  const row = index.danji.find((item) => item[3] === kbId);
  return row ? plansCards(index, row) : null;
}

type PlanFacts = {
  침실수: number | null; 욕실수: number | null; 드레스룸수: number | null; 발코니수: number | null;
  표기된_실이름: string[]; 표기된_전체치수_mm: { 가로: number | null; 세로: number | null };
};

const FACTS_PROMPT = `이 아파트 평면도에 실제로 그려지고 글자로 적힌 사실만 JSON으로 출력하세요. 코드블록 없이 JSON만 출력합니다.
추측하지 말고, 도면에서 확실히 읽을 수 없는 값은 null로 둡니다. 동선·형태·장단점은 쓰지 않습니다.
표기된_실이름에는 도면에 실제로 인쇄된 글자만 그대로 적습니다. 글자가 없는 빈 칸에 이름을 붙이지 않고, 워터마크와 회사 로고(KB부동산 등)는 제외합니다. 드레스룸이라는 글자가 없으면 드레스룸수는 0입니다.
{"침실수":숫자|null,"욕실수":숫자|null,"드레스룸수":숫자|null,"발코니수":숫자|null,"표기된_실이름":["..."],"표기된_전체치수_mm":{"가로":숫자|null,"세로":숫자|null}}`;

/** The model sometimes lists two 욕실 yet counts one: a count is never below the printed labels. */
function reconcileCounts(facts: PlanFacts): PlanFacts {
  const labels = Array.isArray(facts.표기된_실이름) ? facts.표기된_실이름 : [];
  const atLeast = (value: number | null, word: string) => {
    const printed = labels.filter((label) => label.replace(/\s/g, "").includes(word)).length;
    return printed > (value ?? 0) ? printed : value;
  };
  return { ...facts, 침실수: atLeast(facts.침실수, "침실"), 욕실수: atLeast(facts.욕실수, "욕실"), 드레스룸수: atLeast(facts.드레스룸수, "드레스룸"), 발코니수: atLeast(facts.발코니수, "발코니") };
}

/** What the plan visibly states, read once and cached so later members cost nothing. */
async function readPlanFacts(id: string, verified: VerifiedPlan | null): Promise<PlanFacts | null> {
  // A replaced drawing gets its own reading.
  const cacheKey = verified ? `analysis/v2/${id}-${Date.parse(verified.uploadedAt)}.json` : `analysis/v2/${id}.json`;
  const stored = await r2("GET", cacheKey);
  if (stored.ok) return reconcileCounts((await stored.json()) as PlanFacts);
  if (!process.env.DEEPSEEK_API_KEY) return null;
  const image = await r2("GET", imageKeyOf(id, verified));
  if (!image.ok) return null;
  const data = Buffer.from(await image.arrayBuffer()).toString("base64");
  const { text } = await generateText({
    model: deepseekModel("deepseek-flash"),
    maxOutputTokens: 500,
    messages: [{ role: "user", content: [{ type: "text", text: FACTS_PROMPT }, { type: "file", mediaType: "image/jpeg", data }] }],
  });
  const facts = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim()) as PlanFacts;
  await r2("PUT", cacheKey, JSON.stringify(facts), "application/json").catch(() => undefined);
  return reconcileCounts(facts);
}

/** Bearing walls drawn by a reviewer over one plan: fractions of the image size, kept in R2. */
export type WallSegment = { x1: number; y1: number; x2: number; y2: number };
export type WallRecord = { planId: string; status: "draft" | "approved"; walls: WallSegment[]; reviewer: string; evidence: string; updatedBy: string; updatedAt: string; label?: string };

export async function readWalls(id: string): Promise<WallRecord | null> {
  const stored = await r2("GET", `walls/${id}.json`);
  return stored.ok ? ((await stored.json()) as WallRecord) : null;
}

/** Only reviewed marks are ever shown to members. */
export async function approvedWalls(ids: string[]): Promise<Record<string, WallRecord>> {
  const records = await Promise.all(ids.map((id) => readWalls(id).catch(() => null)));
  return Object.fromEntries(records.filter((record): record is WallRecord => record?.status === "approved").map((record) => [record.planId, record]));
}

export async function reviewedWallList(): Promise<WallRecord[]> {
  const stored = await r2("GET", "walls/_list.json");
  return stored.ok ? ((await stored.json()) as WallRecord[]) : [];
}

async function planLabel(id: string): Promise<string | null> {
  const index = await loadIndex();
  for (const row of index.danji) {
    const plan = row[4].find((item) => item[0] === id);
    if (plan) return `${index.regions[row[0]] ?? ""} ${row[2]} ${row[1]} ${plan[2]}`;
  }
  return null;
}

export async function saveWalls(id: string, input: { status?: unknown; walls?: unknown; reviewer?: unknown; evidence?: unknown }, updatedBy: string): Promise<WallRecord> {
  const label = await planLabel(id);
  if (!label) throw Object.assign(new Error("도면을 찾지 못했습니다."), { status: 404 });
  const inRange = (value: unknown): value is number => typeof value === "number" && value >= 0 && value <= 1;
  const walls = (Array.isArray(input.walls) ? input.walls : []).slice(0, 300).filter((w): w is WallSegment => inRange(w?.x1) && inRange(w?.y1) && inRange(w?.x2) && inRange(w?.y2));
  const status = input.status === "approved" ? "approved" : "draft";
  const reviewer = String(input.reviewer ?? "").trim().slice(0, 80);
  const evidence = String(input.evidence ?? "").trim().slice(0, 500);
  if (status === "approved" && (!walls.length || !reviewer || !evidence)) throw Object.assign(new Error("검수 완료로 저장하려면 내력벽 표시, 검수자, 근거 자료가 모두 필요합니다."), { status: 400 });
  const record: WallRecord = { planId: id, status, walls, reviewer, evidence, updatedBy, updatedAt: new Date().toISOString(), label };
  const saved = await r2("PUT", `walls/${id}.json`, JSON.stringify(record), "application/json");
  if (!saved.ok) throw new Error(`저장하지 못했습니다 (${saved.status}).`);
  const list = (await reviewedWallList().catch(() => [])).filter((item) => item.planId !== id);
  await r2("PUT", "walls/_list.json", JSON.stringify([{ ...record, walls: [] }, ...list].slice(0, 2000)), "application/json");
  return record;
}

const planExists = async (id: string) => Boolean(await planLabel(id));

/** Marks drawn on the old drawing no longer line up, so they go back to 초안 for a fresh review. */
async function reopenWallReview(id: string, updatedBy: string): Promise<void> {
  const current = await readWalls(id).catch(() => null);
  if (current?.status === "approved") await saveWalls(id, { ...current, status: "draft" }, updatedBy);
}

export async function saveVerifiedImage(id: string, input: { image?: unknown; width?: unknown; height?: unknown; note?: unknown; fileName?: unknown }, uploadedBy: string): Promise<VerifiedPlan> {
  if (!(await planExists(id))) throw Object.assign(new Error("도면을 찾지 못했습니다."), { status: 404 });
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(input.image ?? ""));
  const note = String(input.note ?? "").trim().slice(0, 300);
  if (!match || match[1]!.length > 3_600_000) throw Object.assign(new Error("도면 이미지가 올바르지 않거나 너무 큽니다."), { status: 400 });
  if (!note) throw Object.assign(new Error("실측자와 실측일을 입력해 주세요."), { status: 400 });
  const bytes = Buffer.from(match[1]!, "base64");
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw Object.assign(new Error("JPEG 이미지가 아닙니다."), { status: 400 });
  const stamp = Date.now();
  const image = `verified/${id}-${stamp}.jpg`;
  const saved = await r2("PUT", image, bytes, "image/jpeg");
  if (!saved.ok) throw new Error(`저장하지 못했습니다 (${saved.status}).`);
  const record: VerifiedPlan = { planId: id, image, pdf: null, width: Number(input.width) || 0, height: Number(input.height) || 0, note, fileName: String(input.fileName ?? "").slice(0, 200), uploadedBy, uploadedAt: new Date(stamp).toISOString() };
  const written = await r2("PUT", `verified/${id}.json`, JSON.stringify(record), "application/json");
  if (!written.ok) throw new Error(`저장하지 못했습니다 (${written.status}).`);
  await reopenWallReview(id, uploadedBy);
  return record;
}

export async function saveVerifiedPdf(id: string, base64: unknown): Promise<VerifiedPlan> {
  const record = await readVerified(id);
  if (!record) throw Object.assign(new Error("먼저 실측 도면을 등록해 주세요."), { status: 400 });
  const text = String(base64 ?? "");
  if (!text || text.length > 4_100_000 || !/^[A-Za-z0-9+/=]+$/.test(text)) throw Object.assign(new Error("PDF 파일이 올바르지 않거나 너무 큽니다."), { status: 400 });
  const bytes = Buffer.from(text, "base64");
  if (bytes.subarray(0, 4).toString() !== "%PDF") throw Object.assign(new Error("PDF 파일이 아닙니다."), { status: 400 });
  const pdf = `verified/${id}-${Date.parse(record.uploadedAt)}.pdf`;
  const saved = await r2("PUT", pdf, bytes, "application/pdf");
  if (!saved.ok) throw new Error(`저장하지 못했습니다 (${saved.status}).`);
  const next = { ...record, pdf };
  await r2("PUT", `verified/${id}.json`, JSON.stringify(next), "application/json");
  return next;
}

/** Back to the collected image. Files stay in the bucket; only the pointer is removed. */
export async function removeVerified(id: string, updatedBy: string): Promise<void> {
  await r2("DELETE", `verified/${id}.json`);
  await reopenWallReview(id, updatedBy);
}

/** System-prompt block for the plan the member picked; null when the id is unknown. */
export async function selectedFloorPlanContext(id: string, mirrored = false): Promise<string | null> {
  const index = await loadIndex();
  for (const row of index.danji) {
    const plan = row[4].find((item) => item[0] === id);
    if (!plan) continue;
    const info = danjiInfo(index, row);
    const verified = await readVerified(id).catch(() => null);
    const facts = await readPlanFacts(id, verified).catch((error: unknown) => {
      console.error("[floorplans] reading failed", error);
      return null;
    });
    const walls = await readWalls(id).catch(() => null);
    return [
      "[사용자가 고른 평면도 — 사용자는 화면에서 이 도면을 보고 있다]",
      `단지: ${info.region} ${info.dong} ${info.name} / 타입: ${plan[2]} / 공급 ${plan[3]}㎡(${plan[1]}평) / 전용 ${plan[4]}㎡ / 기본형 기준`,
      mirrored ? "사용자의 집은 이 도면의 대칭형(좌우 반전)이다. 왼쪽과 오른쪽은 도면과 반대이며, 방향이 확실하지 않으면 좌우를 말하지 않는다." : "",
      facts ? `도면에서 읽은 사실: ${JSON.stringify(facts)}` : "도면 판독 결과가 없다. 면적 정보만 근거로 답하고, 구조는 사용자에게 물어본다.",
      "규칙: 위 사실과 면적만 도면 근거로 쓴다. 주방 형태, 현관 위치, 동선, 배치처럼 위에 없는 내용은 단정하지 말고 사용자에게 확인을 구한다. 도면에서 읽은 숫자는 AI가 읽은 추정치라고 한 번 밝힌다. 확장 여부는 알 수 없으므로 기본형 기준임을 알린다.",
      walls?.status === "approved"
        ? `이 도면의 붉은 선은 협회 검수자(${walls.reviewer})가 ${walls.evidence}을(를) 근거로 표시한 내력벽이다. 표시되지 않은 벽은 확인되지 않은 벽이지 비내력벽이 아니다.`
        : "이 도면에는 검수된 내력벽 표시가 없다. 어느 벽이 내력벽인지 말하지 않는다.",
      verified ? `이 도면은 협회가 등록한 실측 도면이다 (${verified.note}).` : "",
      !verified && plan[5] === 1 ? "주의: 이 도면은 같은 단지의 면적이 다른 타입과 이미지가 같아 다른 타입의 도면일 수 있다. 답변 첫머리에 이 점을 알린다." : "",
    ].filter(Boolean).join("\n");
  }
  return null;
}

export const FLOORPLAN_GUIDE = `자기 집의 인테리어(내 집 주방·수납·확장·동선·이사 등)를 묻는 대화이고 집 구조에 따라 답이 달라지면, 사는 아파트의 단지명이나 동네를 한 번만 물어본다. 동·호수는 묻지 않는다. 법규·자재·공법 같은 일반 질문에는 묻지 않고 바로 답한다. 사용자가 답하지 않거나 원치 않으면 재촉하지 않고 일반적인 조언을 한다. 이미 평면도를 고른 대화에서는 다시 묻지 않는다.
단지명을 알게 되면 findFloorPlans 도구를 호출한다. 결과가 카드로 화면에 표시되므로 목록을 글로 반복하지 말고 "사시는 집의 타입을 골라 주세요" 정도로 한 문장만 쓴다.
도구 결과 status가 unavailable이면 "도면 조회가 잠시 안 되고 있어요. 잠시 뒤 다시 시도해 주세요"라고만 말하고, 오류 번호나 내부 사정은 말하지 않으며 도면이 없다고 단정하지 않는다.
도구 결과 status가 none이면 도면이 없다고 말하고, 그 단지의 면적·평형·구조를 기억으로 지어내지 말고, 가지고 있는 평면도나 분양 안내문 이미지, 집 사진을 첨부해 달라고 한 번 요청한다. 사용자가 도면 이미지를 첨부하면 그 도면을 기준으로 상담하되, 도면에 보이는 사실만 근거로 쓰고 보이지 않는 구조와 치수는 단정하지 않는다.`;

/** Cards travel inside the text stream as an HTML comment the chat UI turns into a picker. */
export const floorPlanMarker = (cards: FloorPlanCards) => `\n\n<!--floorplans ${JSON.stringify(cards).replace(/--/g, "\\u002d\\u002d")}-->\n\n`;
export const FLOORPLAN_MARKER = /<!--floorplans [\s\S]*?-->/g;

/** Stored on a member's message when they pick a plan, so the choice survives reloads. */
export const FLOORPLAN_PICK = /<!--floorplan-pick (\d{1,12})\|[^>]*?-->/g;
export function pickedFloorPlan(contents: string[]): { id: string; mirrored: boolean } | null {
  for (let index = contents.length - 1; index >= 0; index -= 1) {
    const found = [...contents[index]!.matchAll(FLOORPLAN_PICK)].at(-1);
    if (found) return { id: found[1]!, mirrored: found[0].includes("대칭형") };
  }
  return null;
}

/** Applies to every chat, with or without a floor plan. */
export const STRUCTURE_SAFETY_GUIDE = `벽 철거·이동·개구부에 관한 답변 규칙: 어떤 벽도 "철거해도 된다", "비내력벽이다"라고 단정하지 않는다. 일반 평면도나 사진만으로는 내력벽을 판별할 수 없다고 밝힌다. 외벽, 세대 경계벽, 계단실·승강기 주변 벽은 구조체일 가능성이 높다는 일반론까지만 말하고, 세대 안쪽 벽은 벽식 구조에서 내력벽인 경우가 많아 구조도면 확인과 구조 검토, 관리주체 절차가 필요하다고 안내한다. 관리사무소에서 구조도면을 볼 수 있다고 단정하지 말고 단지마다 다르니 문의해 보라고 한다. 사용자가 내력벽이 표기된 구조도면 이미지를 첨부하면 도면에 실제로 표기된 범례와 해치만 읽어 설명하고, 표기가 없으면 판단할 수 없다고 답한다. 협회 검수 표시가 있어도 실제 철거 전에는 현장 구조 검토가 필요하다고 함께 말한다.`;
