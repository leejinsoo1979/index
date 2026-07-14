import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAgentAdmin } from "./_firebaseAdmin.js";

export const config = { maxDuration: 60 };

type ImageBody = {
  action?: "generate" | "inpaint";
  prompt?: string;
  size?: string;
  imageDataUrl?: string;
  imageUrl?: string;
  maskDataUrl?: string;
  userId?: string;
};

const ALLOWED_SIZES = new Set(["1024x1024", "1024x1536", "1536x1024"]);

function decodeDataUrl(input: string, label: string) {
  const match = input.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/s);
  if (!match) throw new Error(`${label} 형식이 올바르지 않습니다.`);
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > 8_000_000) throw new Error(`${label} 크기가 허용 범위를 벗어났습니다.`);
  return { bytes, mime: match[1] };
}

async function fetchStoredImage(input: string) {
  const url = new URL(input);
  if (url.protocol !== "https:" || !["firebasestorage.googleapis.com", "storage.googleapis.com"].includes(url.hostname)) throw new Error("허용되지 않은 이미지 저장소입니다.");
  const response = await fetch(url, { redirect: "error" });
  if (!response.ok) throw new Error("저장된 원본 이미지를 불러오지 못했습니다.");
  const size = Number(response.headers.get("content-length") ?? 0);
  if (size > 8_000_000) throw new Error("원본 이미지가 너무 큽니다.");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 8_000_000) throw new Error("원본 이미지 크기가 허용 범위를 벗어났습니다.");
  const mime = response.headers.get("content-type") || "image/png";
  if (!/^image\/(png|jpeg|webp)$/.test(mime)) throw new Error("지원하지 않는 이미지 형식입니다.");
  return { bytes, mime };
}

async function responseImage(response: Response) {
  const body = await response.json() as { data?: Array<{ b64_json?: string; url?: string }>; error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message || `이미지 API 오류 (${response.status})`);
  const image = body.data?.[0];
  if (image?.b64_json) return `data:image/webp;base64,${image.b64_json}`;
  if (image?.url) {
    const remote = await fetch(image.url);
    if (!remote.ok) throw new Error("생성 이미지를 가져오지 못했습니다.");
    return `data:${remote.headers.get("content-type") || "image/png"};base64,${Buffer.from(await remote.arrayBuffer()).toString("base64")}`;
  }
  throw new Error("이미지 응답이 비어 있습니다.");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); res.status(405).json({ error: "Method not allowed" }); return; }
  try {
    const body = (req.body ?? {}) as ImageBody;
    await requireAgentAdmin(req, body.userId);
    if (!process.env.OPENAI_API_KEY) { res.status(503).json({ error: "OPENAI_API_KEY is not configured" }); return; }
    const prompt = body.prompt?.trim().slice(0, 4000);
    if (!prompt) { res.status(400).json({ error: "프롬프트가 필요합니다." }); return; }
    const size = body.size && ALLOWED_SIZES.has(body.size) ? body.size : "1024x1024";
    let response: Response;
    if (body.action === "inpaint") {
      if (!body.imageDataUrl && !body.imageUrl) { res.status(400).json({ error: "원본 이미지가 필요합니다." }); return; }
      const image = body.imageUrl ? await fetchStoredImage(body.imageUrl) : decodeDataUrl(body.imageDataUrl!, "원본 이미지");
      const form = new FormData();
      form.append("model", "gpt-image-1");
      form.append("prompt", prompt);
      form.append("size", size);
      form.append("output_format", "webp");
      form.append("output_compression", "85");
      form.append("image", new Blob([image.bytes], { type: image.mime }), "image.png");
      if (body.maskDataUrl) {
        const mask = decodeDataUrl(body.maskDataUrl, "마스크");
        form.append("mask", new Blob([mask.bytes], { type: mask.mime }), "mask.png");
      }
      response = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: form });
    } else {
      response = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-image-1", prompt, size, n: 1, quality: "low", output_format: "webp", output_compression: 85 }),
      });
    }
    res.status(200).json({ imageDataUrl: await responseImage(response), model: "gpt-image-1", prompt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "이미지 처리에 실패했습니다.";
    res.status(/인증|권한|사용자/.test(message) ? 401 : 500).json({ error: message });
  }
}
