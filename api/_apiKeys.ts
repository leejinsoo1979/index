import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { r2 } from "./_floorplans.js";

/**
 * API 관리 (/admin/api-keys): outside-service keys that admins register and rotate without a deploy.
 *
 * - Values are encrypted here and kept in the private bucket (config/api-keys.json); the browser
 *   only ever sees the last four characters.
 * - A registered value takes precedence over the Vercel env var of the same name; removing it falls
 *   back to the env var. Handlers call applyManagedKeys() first, so every existing
 *   process.env.X read picks the value up (within a minute on other instances).
 * - Keys the server itself stands on (bucket credentials, the encryption secret, ADMIN_EMAILS…)
 *   stay in Vercel only: they are listed read-only.
 */
type Item = { name: string; label: string; group: string; use: string; test?: TestKind };
type TestKind = "openai" | "deepseek" | "telegram" | "kakao" | "datagokr" | "law" | "juso";

export const MANAGED_KEYS: Item[] = [
  { name: "OPENAI_API_KEY", label: "OpenAI", group: "AI", use: "INDEX AI 답변, 위키 정리, 이미지 판독", test: "openai" },
  { name: "DEEPSEEK_API_KEY", label: "DeepSeek", group: "AI", use: "챗봇·개인 AI 답변, 평면도 판독", test: "deepseek" },
  { name: "AI_GATEWAY_API_KEY", label: "Vercel AI Gateway", group: "AI", use: "인터랙션 북 AI 글쓰기" },
  { name: "MEM0_API_KEY", label: "Mem0", group: "AI", use: "챗봇의 저장된 기억" },
  { name: "DATA_GO_KR_SERVICE_KEY", label: "공공데이터포털", group: "공공데이터", use: "건축물대장·인허가·토지이용규제·사업자 조회·건설업 등록", test: "datagokr" },
  { name: "LAW_OC", label: "법제처 Open API", group: "공공데이터", use: "법령·해석례 조회", test: "law" },
  { name: "JUSO_API_KEY", label: "도로명주소", group: "공공데이터", use: "주소 검색", test: "juso" },
  { name: "KCSC_API_KEY", label: "국가건설기준센터", group: "공공데이터", use: "KDS·KCS 기준 조회" },
  { name: "KAKAO_REST_API_KEY", label: "카카오 REST", group: "지도", use: "평면도 단지 위치 찾기", test: "kakao" },
  { name: "TELEGRAM_BOT_TOKEN", label: "텔레그램 봇 토큰", group: "알림", use: "회원가입 알림", test: "telegram" },
  { name: "TELEGRAM_CHAT_ID", label: "텔레그램 채팅 ID", group: "알림", use: "회원가입 알림을 받을 대화방" },
];

/** Shown for reference only: changing these from a web page could lock the server out of itself. */
export const SERVER_ONLY_KEYS: { name: string; label: string }[] = [
  { name: "FIREBASE_SERVICE_ACCOUNT", label: "Firebase 서버 계정" },
  { name: "ADMIN_EMAILS", label: "최고 관리자 이메일" },
  { name: "FLOORPLAN_R2_ACCESS_KEY_ID", label: "비공개 저장소(R2) 접속 키" },
  { name: "R2_ACCESS_KEY_ID", label: "공개 미디어 저장소(R2) 접속 키" },
  { name: "ARCHI_KEY_SECRET", label: "Agent Studio 키 암호화" },
  { name: "CRON_SECRET", label: "예약 작업 인증" },
  { name: "VITE_KAKAO_MAP_JS_KEY", label: "카카오 지도 JavaScript 키 (빌드 시 적용)" },
];

const RESERVED = /^(VITE_|FIREBASE|R2_|FLOORPLAN_R2_|ADMIN_|ARCHI_KEY|API_KEYS_SECRET|CRON_|VERCEL)/;
const NAME = /^[A-Z][A-Z0-9_]{2,49}$/;
const STORE_KEY = "config/api-keys.json";

type Stored = { cipher: string; last4: string; updatedAt: string; updatedBy: string };
type Custom = { name: string; label: string; use: string };
type Store = { v: 1; keys: Record<string, Stored>; custom: Custom[] };

const httpError = (status: number, message: string) => Object.assign(new Error(message), { status });

function cipherKey(): Buffer {
  // A dedicated secret if one is set; otherwise one the server already has, so this works without setup.
  const source = process.env.API_KEYS_SECRET || process.env.ARCHI_KEY_SECRET || process.env.FLOORPLAN_R2_SECRET_ACCESS_KEY || "";
  if (!source) throw httpError(503, "서버에 암호화 키가 없어 API 키를 저장할 수 없습니다.");
  return createHash("sha256").update(`index-api-keys:${source}`).digest();
}
function encrypt(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", cipherKey(), iv);
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((part) => part.toString("base64")).join(".");
}
function decrypt(payload: string): string | null {
  try {
    const [iv, tag, data] = payload.split(".").map((part) => Buffer.from(part, "base64"));
    const decipher = createDecipheriv("aes-256-gcm", cipherKey(), iv!);
    decipher.setAuthTag(tag!);
    return Buffer.concat([decipher.update(data!), decipher.final()]).toString("utf8");
  } catch {
    return null; // the server's secret changed: the value has to be entered again
  }
}

const emptyStore = (): Store => ({ v: 1, keys: {}, custom: [] });
/** Throws unless the bucket really answered, so a failed read never overwrites the store. */
async function readStore(): Promise<Store> {
  const response = await r2("GET", STORE_KEY);
  if (response.status === 404) return emptyStore();
  if (!response.ok) throw httpError(503, `API 키 저장소를 읽지 못했습니다 (${response.status}).`);
  return { ...emptyStore(), ...((await response.json()) as Partial<Store>) };
}
async function writeStore(store: Store) {
  const saved = await r2("PUT", STORE_KEY, JSON.stringify(store), "application/json");
  if (!saved.ok) throw httpError(503, `저장하지 못했습니다 (${saved.status}).`);
  cached = { at: Date.now(), store, endpoint: cached?.endpoint ?? null };
}

// The Vercel values, remembered before any override, so removing an admin value restores them.
const baseline = new Map<string, string | undefined>();
const remember = (name: string) => {
  if (!baseline.has(name)) baseline.set(name, process.env[name]);
};

let cached: { at: number; store: Store; endpoint: Endpoint | null } | null = null;
const managedNames = (store: Store) => [...MANAGED_KEYS.map((item) => item.name), ...store.custom.map((item) => item.name)];

function restore(name: string) {
  remember(name);
  if (baseline.get(name) === undefined) delete process.env[name];
  else process.env[name] = baseline.get(name);
}

function apply(store: Store) {
  for (const name of managedNames(store)) {
    remember(name);
    const stored = store.keys[name];
    const value = stored ? decrypt(stored.cipher) : null;
    if (value) process.env[name] = value;
    else restore(name);
  }
}

/**
 * Where the INDEX knowledge server can be reached when it isn't set in Vercel: published by
 * scripts/knowledge-tunnel.mjs on the Mac that runs it. The token is sealed with a key derived
 * from the bucket secret, which both sides already hold.
 */
type Endpoint = { url: string | null; token: string | null; updatedAt: string };
const ENDPOINT_KEY = "config/knowledge-endpoint.json";
const endpointCipher = () => createHash("sha256").update(`index-knowledge-endpoint:${process.env.FLOORPLAN_R2_SECRET_ACCESS_KEY ?? ""}`).digest();
function openEndpointToken(payload: string): string | null {
  try {
    const [iv, tag, data] = payload.split(".").map((part) => Buffer.from(part, "base64"));
    const decipher = createDecipheriv("aes-256-gcm", endpointCipher(), iv!);
    decipher.setAuthTag(tag!);
    return Buffer.concat([decipher.update(data!), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
async function readEndpoint(): Promise<Endpoint | null> {
  const response = await r2("GET", ENDPOINT_KEY).catch(() => null);
  return response?.ok ? ((await response.json()) as Endpoint) : null;
}
function applyEndpoint(endpoint: Endpoint | null) {
  for (const name of ["INDEX_WIKI_URL", "WIKI_SERVICE_TOKEN"]) remember(name);
  // A Vercel value or an admin-registered one wins; the published tunnel only fills the gap.
  if (baseline.get("INDEX_WIKI_URL") || cached?.store.keys.INDEX_WIKI_URL) return;
  const token = endpoint?.url && endpoint.token ? openEndpointToken(endpoint.token) : null;
  if (endpoint?.url && token) {
    process.env.INDEX_WIKI_URL = endpoint.url;
    process.env.WIKI_SERVICE_TOKEN = token;
  } else {
    restore("INDEX_WIKI_URL");
    restore("WIKI_SERVICE_TOKEN");
  }
}

/** Puts admin-registered keys into process.env for this request. Never throws: Vercel values still work. */
export async function applyManagedKeys(): Promise<void> {
  try {
    // 30s, so a restarted tunnel's new address is picked up quickly.
    if (!cached || Date.now() - cached.at > 30_000) {
      const [store, endpoint] = await Promise.all([readStore(), readEndpoint()]);
      cached = { at: Date.now(), store, endpoint };
    }
    apply(cached.store);
    applyEndpoint(cached.endpoint);
  } catch (error) {
    console.warn("[api-keys] using server values only", error instanceof Error ? error.message : error);
  }
}

export async function apiKeyStatus() {
  const store = await readStore();
  cached = { at: Date.now(), store, endpoint: cached?.endpoint ?? null };
  for (const name of managedNames(store)) remember(name);
  const row = (item: Item | Custom, custom: boolean) => {
    const stored = store.keys[item.name];
    const broken = Boolean(stored && decrypt(stored.cipher) === null);
    const server = Boolean(baseline.get(item.name)?.trim());
    return {
      ...item,
      custom,
      test: "test" in item ? item.test ?? null : null,
      source: stored && !broken ? "admin" : server ? "server" : "none",
      broken,
      last4: stored && !broken ? stored.last4 : null,
      updatedAt: stored?.updatedAt ?? null,
      updatedBy: stored?.updatedBy ?? null,
    };
  };
  return {
    keys: [...MANAGED_KEYS.map((item) => row(item, false)), ...store.custom.map((item) => row({ ...item, group: "직접 추가" } as Item, true))],
    serverOnly: SERVER_ONLY_KEYS.map((item) => ({ ...item, configured: Boolean(process.env[item.name]?.trim()) })),
  };
}

const known = (store: Store, name: string) => MANAGED_KEYS.some((item) => item.name === name) || store.custom.some((item) => item.name === name);

export async function saveApiKey(name: string, value: unknown, by: string) {
  const text = String(value ?? "").trim();
  if (!text || text.length > 4000 || /[\r\n]/.test(text)) throw httpError(400, "키 값이 올바르지 않습니다.");
  const store = await readStore();
  if (!known(store, name)) throw httpError(404, "등록된 API가 아닙니다.");
  store.keys[name] = { cipher: encrypt(text), last4: text.slice(-4), updatedAt: new Date().toISOString(), updatedBy: by };
  await writeStore(store);
  apply(store);
}

export async function removeApiKey(name: string) {
  const store = await readStore();
  delete store.keys[name];
  await writeStore(store);
  apply(store);
}

export async function addCustomApi(input: { name?: unknown; label?: unknown; use?: unknown; value?: unknown }, by: string) {
  const name = String(input.name ?? "").trim().toUpperCase();
  const label = String(input.label ?? "").trim().slice(0, 40);
  const use = String(input.use ?? "").trim().slice(0, 120);
  if (!NAME.test(name)) throw httpError(400, "변수 이름은 영문 대문자·숫자·밑줄 3~50자로 입력해 주세요. (예: NAVER_CLIENT_SECRET)");
  if (RESERVED.test(name) || SERVER_ONLY_KEYS.some((item) => item.name === name)) throw httpError(400, "서버 기본 설정에 쓰는 이름이라 여기서는 등록할 수 없습니다.");
  if (!label) throw httpError(400, "표시 이름을 입력해 주세요.");
  const store = await readStore();
  if (known(store, name)) throw httpError(409, "이미 있는 API입니다.");
  store.custom.push({ name, label, use });
  await writeStore(store);
  if (input.value !== undefined && String(input.value).trim()) await saveApiKey(name, input.value, by);
}

export async function removeCustomApi(name: string) {
  const store = await readStore();
  if (!store.custom.some((item) => item.name === name)) throw httpError(404, "직접 추가한 API만 지울 수 있습니다.");
  store.custom = store.custom.filter((item) => item.name !== name);
  delete store.keys[name];
  await writeStore(store);
  restore(name);
  apply(store);
}

/** A small real request with the key in effect; reports whether the service accepted it. */
export async function testApiKey(name: string): Promise<{ ok: boolean; message: string }> {
  await applyManagedKeys();
  const kind = MANAGED_KEYS.find((item) => item.name === name)?.test;
  if (!kind) throw httpError(400, "이 API는 연결 확인을 지원하지 않습니다.");
  const key = process.env[name]?.trim();
  if (!key) return { ok: false, message: "등록된 키가 없습니다." };
  const get = (url: string, headers: Record<string, string> = {}) => fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
  try {
    if (kind === "openai" || kind === "deepseek") {
      const response = await get(kind === "openai" ? "https://api.openai.com/v1/models" : "https://api.deepseek.com/models", { Authorization: `Bearer ${key}` });
      return response.ok ? { ok: true, message: "정상입니다." } : { ok: false, message: response.status === 401 ? "키가 맞지 않습니다." : `응답 오류 (${response.status})` };
    }
    if (kind === "telegram") {
      const body = (await (await get(`https://api.telegram.org/bot${key}/getMe`)).json()) as { ok?: boolean; result?: { username?: string } };
      return body.ok ? { ok: true, message: `정상입니다. (@${body.result?.username ?? "bot"})` } : { ok: false, message: "봇 토큰이 맞지 않습니다." };
    }
    if (kind === "kakao") {
      const response = await get(`https://dapi.kakao.com/v2/local/search/keyword.json?size=1&query=${encodeURIComponent("서울역")}`, { Authorization: `KakaoAK ${key}` });
      if (response.ok) return { ok: true, message: "정상입니다." };
      const text = await response.text();
      return { ok: false, message: /disabled/i.test(text) ? "카카오 콘솔에서 카카오맵(로컬) 사용이 꺼져 있습니다." : response.status === 401 ? "키가 맞지 않습니다." : `응답 오류 (${response.status})` };
    }
    if (kind === "datagokr") {
      const text = await (await get(`https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo?serviceKey=${encodeURIComponent(key)}&sigunguCd=11680&bjdongCd=10300&numOfRows=1&pageNo=1&_type=json`)).text();
      if (/SERVICE_KEY_IS_NOT_REGISTERED|SERVICE KEY IS NOT REGISTERED/i.test(text)) return { ok: false, message: "등록되지 않은 키입니다. 활용신청 승인 여부를 확인해 주세요." };
      if (/LIMITED_NUMBER_OF_SERVICE_REQUESTS/i.test(text)) return { ok: false, message: "오늘 호출 한도를 넘었습니다." };
      return /"resultCode"\s*:\s*"00"|<resultCode>00</.test(text) ? { ok: true, message: "정상입니다. (건축물대장)" } : { ok: false, message: "응답을 확인하지 못했습니다. 건축물대장 활용신청이 되어 있는지 확인해 주세요." };
    }
    if (kind === "law") {
      const text = await (await get(`https://www.law.go.kr/DRF/lawSearch.do?OC=${encodeURIComponent(key)}&target=law&type=JSON&display=1&query=${encodeURIComponent("건축법")}`)).text();
      return /LawSearch/.test(text) ? { ok: true, message: "정상입니다." } : { ok: false, message: "법제처에서 인증되지 않았습니다. OC(이메일 ID)와 서버 IP 등록을 확인해 주세요." };
    }
    const body = (await (await get(`https://business.juso.go.kr/addrlink/addrLinkApi.do?confmKey=${encodeURIComponent(key)}&keyword=${encodeURIComponent("세종대로")}&resultType=json&countPerPage=1`)).json()) as { results?: { common?: { errorCode?: string; errorMessage?: string } } };
    const common = body.results?.common;
    return common?.errorCode === "0" ? { ok: true, message: "정상입니다." } : { ok: false, message: common?.errorMessage || "키가 맞지 않습니다." };
  } catch (error) {
    return { ok: false, message: error instanceof Error && error.name === "TimeoutError" ? "응답이 없습니다 (10초)." : "연결하지 못했습니다." };
  }
}
