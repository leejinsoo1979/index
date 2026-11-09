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

async function r2(method: "GET" | "PUT", key: string, body?: Buffer | string, contentType?: string) {
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

/** Signed GET URL for one plan image (15 minutes). */
export function floorPlanImageUrl(id: string, expires = 900): string {
  const { account, accessKey, secret, bucket } = env();
  const host = `${account}.r2.cloudflarestorage.com`;
  const path = `/${bucket}/plans/${id}.jpg`;
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
async function readPlanFacts(id: string): Promise<PlanFacts | null> {
  const stored = await r2("GET", `analysis/v2/${id}.json`);
  if (stored.ok) return reconcileCounts((await stored.json()) as PlanFacts);
  if (!process.env.DEEPSEEK_API_KEY) return null;
  const image = await r2("GET", `plans/${id}.jpg`);
  if (!image.ok) return null;
  const data = Buffer.from(await image.arrayBuffer()).toString("base64");
  const { text } = await generateText({
    model: deepseekModel("deepseek-flash"),
    maxOutputTokens: 500,
    messages: [{ role: "user", content: [{ type: "text", text: FACTS_PROMPT }, { type: "file", mediaType: "image/jpeg", data }] }],
  });
  const facts = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim()) as PlanFacts;
  await r2("PUT", `analysis/v2/${id}.json`, JSON.stringify(facts), "application/json").catch(() => undefined);
  return reconcileCounts(facts);
}

/** System-prompt block for the plan the member picked; null when the id is unknown. */
export async function selectedFloorPlanContext(id: string): Promise<string | null> {
  const index = await loadIndex();
  for (const row of index.danji) {
    const plan = row[4].find((item) => item[0] === id);
    if (!plan) continue;
    const info = danjiInfo(index, row);
    const facts = await readPlanFacts(id).catch((error: unknown) => {
      console.error("[floorplans] reading failed", error);
      return null;
    });
    return [
      "[사용자가 고른 평면도 — 사용자는 화면에서 이 도면을 보고 있다]",
      `단지: ${info.region} ${info.dong} ${info.name} / 타입: ${plan[2]} / 공급 ${plan[3]}㎡(${plan[1]}평) / 전용 ${plan[4]}㎡ / 기본형 기준`,
      facts ? `도면에서 읽은 사실: ${JSON.stringify(facts)}` : "도면 판독 결과가 없다. 면적 정보만 근거로 답하고, 구조는 사용자에게 물어본다.",
      "규칙: 위 사실과 면적만 도면 근거로 쓴다. 주방 형태, 현관 위치, 동선, 배치처럼 위에 없는 내용은 단정하지 말고 사용자에게 확인을 구한다. 도면에서 읽은 숫자는 AI가 읽은 추정치라고 한 번 밝힌다. 확장 여부는 알 수 없으므로 기본형 기준임을 알린다.",
      plan[5] === 1 ? "주의: 이 도면은 같은 단지의 면적이 다른 타입과 이미지가 같아 다른 타입의 도면일 수 있다. 답변 첫머리에 이 점을 알린다." : "",
    ].filter(Boolean).join("\n");
  }
  return null;
}

export const FLOORPLAN_GUIDE = `자기 집의 인테리어(내 집 주방·수납·확장·동선·이사 등)를 묻는 대화이고 집 구조에 따라 답이 달라지면, 사는 아파트의 단지명이나 동네를 한 번만 물어본다. 동·호수는 묻지 않는다. 법규·자재·공법 같은 일반 질문에는 묻지 않고 바로 답한다. 사용자가 답하지 않거나 원치 않으면 재촉하지 않고 일반적인 조언을 한다. 이미 평면도를 고른 대화에서는 다시 묻지 않는다.
단지명을 알게 되면 findFloorPlans 도구를 호출한다. 결과가 카드로 화면에 표시되므로 목록을 글로 반복하지 말고 "사시는 집의 타입을 골라 주세요" 정도로 한 문장만 쓴다.
도구 결과 status가 unavailable이면 "도면 조회가 잠시 안 되고 있어요. 잠시 뒤 다시 시도해 주세요"라고만 말하고, 오류 번호나 내부 사정은 말하지 않으며 도면이 없다고 단정하지 않는다.
도구 결과 status가 none이면 도면이 없다고 말하고, 가지고 있는 평면도나 분양 안내문 이미지, 집 사진을 첨부해 달라고 한 번 요청한다. 사용자가 도면 이미지를 첨부하면 그 도면을 기준으로 상담하되, 도면에 보이는 사실만 근거로 쓰고 보이지 않는 구조와 치수는 단정하지 않는다.`;

/** Cards travel inside the text stream as an HTML comment the chat UI turns into a picker. */
export const floorPlanMarker = (cards: FloorPlanCards) => `\n\n<!--floorplans ${JSON.stringify(cards).replace(/--/g, "\\u002d\\u002d")}-->\n\n`;
export const FLOORPLAN_MARKER = /<!--floorplans [\s\S]*?-->/g;

/** Stored on a member's message when they pick a plan, so the choice survives reloads. */
export const FLOORPLAN_PICK = /<!--floorplan-pick (\d{1,12})\|[^>]*?-->/g;
export function pickedFloorPlanId(contents: string[]): string | null {
  for (let index = contents.length - 1; index >= 0; index -= 1) {
    const found = [...contents[index]!.matchAll(FLOORPLAN_PICK)].at(-1);
    if (found) return found[1]!;
  }
  return null;
}
