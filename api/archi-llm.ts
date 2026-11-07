import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAgentAdmin } from "./_firebaseAdmin.js";
// Original ARCHI Agent Studio provider adapters (src/archi/packages), run server-side.
import { OpenAIProvider } from "../src/archi/packages/ai/openai.js";
import { AnthropicProvider } from "../src/archi/packages/ai/anthropic.js";
import { GeminiProvider } from "../src/archi/packages/ai/gemini.js";
import { GrokProvider } from "../src/archi/packages/ai/grok.js";
import { OpenAIImageProvider } from "../src/archi/packages/image/openai-image.js";
import { fetchProviderModels } from "../src/archi/web/lib/llm-models.js";
import { anyRegulationSource, regulationStatus } from "./_regulations.js";
import { searchRegulationSources } from "./_regulationTools.js";

/**
 * Server side of the ported Agent Studio (everything else runs in the browser).
 * Holds the secrets: encrypts workspace provider keys (the browser stores only
 * ciphertext), decrypts them per call, and runs LLM / image provider requests.
 * Falls back to this deployment's own provider keys when no workspace key is given.
 */
export const config = { maxDuration: 120 };

type Provider = "openai" | "anthropic" | "google" | "grok";
type Target = { provider?: string; model?: string; baseUrl?: string; encryptedApiKey?: string };

const PROVIDERS: Provider[] = ["openai", "anthropic", "google", "grok"];
const MAX_PROMPT_CHARS = 400_000;
const MAX_IMAGE_BYTES = 8_000_000;

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// ─── secrets ────────────────────────────────────────────────────────────────
function encryptionKey(): Buffer {
  const secret = process.env.ARCHI_KEY_SECRET;
  if (!secret || secret.length < 16) {
    throw new HttpError(503, "ARCHI_KEY_SECRET(16자 이상)가 서버에 설정되지 않아 API 키를 저장할 수 없습니다.");
  }
  return createHash("sha256").update(`archi-llm-key:${secret}`).digest();
}

/** Same AES-256-GCM format as the original (iv.tag.data, base64). */
function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `${iv.toString("base64")}.${cipher.getAuthTag().toString("base64")}.${encrypted.toString("base64")}`;
}

function decryptSecret(payload: string): string {
  const [iv, tag, data] = payload.split(".");
  if (!iv || !tag || !data) throw new HttpError(400, "잘못된 암호화 데이터 형식입니다.");
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "저장된 API 키를 복호화하지 못했습니다. 설정에서 키를 다시 등록해 주세요.");
  }
}

const ENV_KEYS: Record<Provider, { key: string[]; model: string[]; defaultModel: string }> = {
  openai: { key: ["OPENAI_API_KEY"], model: ["ARCHI_OPENAI_MODEL"], defaultModel: "gpt-5.4-mini" },
  anthropic: { key: ["ANTHROPIC_API_KEY"], model: ["ARCHI_ANTHROPIC_MODEL"], defaultModel: "claude-sonnet-5-5" },
  google: { key: ["GEMINI_API_KEY", "GOOGLE_API_KEY"], model: ["ARCHI_GEMINI_MODEL"], defaultModel: "gemini-2.5-flash" },
  grok: { key: ["XAI_API_KEY", "GROK_API_KEY"], model: ["ARCHI_GROK_MODEL"], defaultModel: "grok-4" },
};
const firstEnv = (names: string[]) => names.map((n) => process.env[n]).find((v) => v && v.trim());

function serverProviders(): Partial<Record<Provider, string>> {
  const out: Partial<Record<Provider, string>> = {};
  for (const p of PROVIDERS) {
    if (firstEnv(ENV_KEYS[p].key)) out[p] = firstEnv(ENV_KEYS[p].model) || ENV_KEYS[p].defaultModel;
  }
  return out;
}

function resolveTarget(raw: unknown) {
  const target = (raw ?? {}) as Target;
  const provider = target.provider as Provider;
  if (!PROVIDERS.includes(provider)) throw new HttpError(400, "지원하지 않는 provider입니다.");
  let baseUrl: string | undefined;
  if (target.baseUrl) {
    const url = new URL(target.baseUrl);
    if (url.protocol !== "https:") throw new HttpError(400, "baseUrl은 https만 허용됩니다.");
    baseUrl = url.toString();
  }
  const apiKey = target.encryptedApiKey ? decryptSecret(target.encryptedApiKey) : firstEnv(ENV_KEYS[provider].key);
  if (!apiKey) throw new HttpError(503, `${provider} API 키가 등록되어 있지 않습니다.`);
  // A workspace key may use a custom endpoint; the server's own key only talks to the official API.
  const model = target.model || (target.encryptedApiKey ? undefined : serverProviders()[provider]);
  return { provider, apiKey, model, baseUrl: target.encryptedApiKey ? baseUrl : undefined };
}

function llm(t: ReturnType<typeof resolveTarget>) {
  const opts = { apiKey: t.apiKey, model: t.model, baseUrl: t.baseUrl };
  switch (t.provider) {
    case "openai":
      return new OpenAIProvider(opts);
    case "anthropic":
      return new AnthropicProvider(opts);
    case "google":
      return new GeminiProvider(opts);
    case "grok":
      return new GrokProvider(opts);
  }
}

// ─── images ─────────────────────────────────────────────────────────────────
async function fetchStoredImage(input: string) {
  const url = new URL(input);
  if (url.protocol !== "https:" || !["firebasestorage.googleapis.com", "storage.googleapis.com"].includes(url.hostname)) {
    throw new HttpError(400, "허용되지 않은 이미지 저장소입니다.");
  }
  const response = await fetch(url, { redirect: "error" });
  if (!response.ok) throw new HttpError(502, "저장된 원본 이미지를 불러오지 못했습니다.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new HttpError(400, "원본 이미지 크기가 허용 범위를 벗어났습니다.");
  return { bytes, mime: response.headers.get("content-type") || "image/png" };
}

function decodeB64(value: unknown, label: string): Uint8Array {
  if (typeof value !== "string" || !value) throw new HttpError(400, `${label}가 필요합니다.`);
  const bytes = new Uint8Array(Buffer.from(value, "base64"));
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new HttpError(400, `${label} 크기가 허용 범위를 벗어났습니다.`);
  return bytes;
}

const toWire = (img: { data: Uint8Array; mimeType: string; width: number; height: number }) => ({
  b64: Buffer.from(img.data).toString("base64"),
  mimeType: img.mimeType,
  width: img.width,
  height: img.height,
});

// ─── handler ────────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  try {
    try {
      await requireAgentAdmin(req);
    } catch (error) {
      throw new HttpError(401, error instanceof Error ? error.message : "인증에 실패했습니다.");
    }
    const body = (req.body ?? {}) as Record<string, unknown>;

    switch (body.action) {
      case "status":
        res.status(200).json({
          available: true,
          serverProviders: serverProviders(),
          canEncrypt: Boolean(process.env.ARCHI_KEY_SECRET && process.env.ARCHI_KEY_SECRET.length >= 16),
          // Public regulation APIs (api/_regulations.ts); studio search needs one of them plus OPENAI_API_KEY.
          regulationSources: regulationStatus(),
          regulationSearch: anyRegulationSource() && Boolean(process.env.OPENAI_API_KEY),
        });
        return;

      case "regulation-search": {
        const query = body.query;
        if (typeof query !== "string" || !query.trim() || query.length > 4000) throw new HttpError(400, "검색어가 올바르지 않습니다.");
        const limit = typeof body.limit === "number" ? Math.min(Math.max(body.limit, 1), 10) : 8;
        res.status(200).json({ results: await searchRegulationSources(query, limit) });
        return;
      }

      case "encrypt": {
        const plaintext = body.plaintext;
        if (typeof plaintext !== "string" || plaintext.length < 8 || plaintext.length > 500) {
          throw new HttpError(400, "API 키 형식이 올바르지 않습니다.");
        }
        res.status(200).json({ ciphertext: encryptSecret(plaintext) });
        return;
      }

      case "generate": {
        const input = (body.input ?? {}) as { system?: unknown; prompt?: unknown; maxTokens?: unknown; temperature?: unknown };
        if (typeof input.prompt !== "string" || !input.prompt) throw new HttpError(400, "prompt가 필요합니다.");
        const system = typeof input.system === "string" ? input.system : undefined;
        if (input.prompt.length + (system?.length ?? 0) > MAX_PROMPT_CHARS) throw new HttpError(413, "프롬프트가 너무 깁니다.");
        const maxTokens = typeof input.maxTokens === "number" ? Math.min(Math.max(input.maxTokens, 1), 16_000) : undefined;
        const temperature = typeof input.temperature === "number" ? input.temperature : undefined;
        const result = await llm(resolveTarget(body.target)).generateText({ system, prompt: input.prompt, maxTokens, temperature });
        res.status(200).json(result);
        return;
      }

      case "models": {
        const t = resolveTarget(body.target);
        res.status(200).json({ models: await fetchProviderModels(t.provider, t.apiKey, t.baseUrl) });
        return;
      }

      case "image-generate": {
        const t = resolveTarget({ ...(body.target as object), provider: "openai" });
        const input = (body.input ?? {}) as { prompt?: unknown; style?: unknown; size?: unknown };
        if (typeof input.prompt !== "string" || !input.prompt || input.prompt.length > 4000) {
          throw new HttpError(400, "이미지 프롬프트가 올바르지 않습니다.");
        }
        const provider = new OpenAIImageProvider({ apiKey: t.apiKey, baseUrl: t.baseUrl });
        const result = await provider.generate({
          prompt: input.prompt,
          style: typeof input.style === "string" ? input.style : undefined,
          size: typeof input.size === "string" ? input.size : undefined,
          count: 1,
        });
        res.status(200).json({ ...result, images: result.images.map(toWire) });
        return;
      }

      case "image-inpaint": {
        const t = resolveTarget({ ...(body.target as object), provider: "openai" });
        const input = (body.input ?? {}) as Record<string, unknown>;
        if (typeof input.prompt !== "string" || !input.prompt || input.prompt.length > 4000) {
          throw new HttpError(400, "수정 프롬프트가 올바르지 않습니다.");
        }
        const base =
          typeof input.baseImageUrl === "string"
            ? await fetchStoredImage(input.baseImageUrl)
            : { bytes: decodeB64(input.baseImageB64, "원본 이미지"), mime: String(input.baseMimeType || "image/png") };
        const provider = new OpenAIImageProvider({ apiKey: t.apiKey, baseUrl: t.baseUrl });
        const result = await provider.inpaint({
          baseImage: base.bytes,
          baseMimeType: base.mime,
          mask: input.maskB64 ? decodeB64(input.maskB64, "마스크") : undefined,
          prompt: input.prompt,
          size: typeof input.size === "string" ? input.size : undefined,
        });
        res.status(200).json({ ...result, image: toWire(result.image) });
        return;
      }

      default:
        throw new HttpError(400, "알 수 없는 action입니다.");
    }
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 502;
    const message = error instanceof Error ? error.message : "AI 서버 요청에 실패했습니다.";
    if (status >= 500) console.error("[archi-llm]", error);
    res.status(status).json({ error: message });
  }
}
