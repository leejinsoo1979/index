import type { VercelRequest, VercelResponse } from "@vercel/node";
import { memberAccess, verifyFirebaseUser } from "./_firebaseAdmin.js";
import { WRITING_STYLES, readPhotos, rewriteText, writeArticle, type Article } from "./_flipbookWriter.js";

/** AI writing in the flipbook editor (admins only). Photos must be files already in the book's public storage. */
const MAX_IMAGES = 6;
const MAX_TEXT = 8000;

const text = (value: unknown, limit = MAX_TEXT) => (typeof value === "string" ? value.slice(0, limit) : "");

function bookImages(value: unknown): string[] | null {
  const base = process.env.R2_PUBLIC_URL?.trim().replace(/\/+$/, "");
  if (!base || !Array.isArray(value) || value.length === 0 || value.length > MAX_IMAGES) return null;
  const prefix = `${base}/flipbooks/`;
  return value.every((url) => typeof url === "string" && url.startsWith(prefix)) ? (value as string[]) : null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const user = await verifyFirebaseUser(req);
    const access = await memberAccess(user);
    if (!access.admin) return res.status(403).json({ error: "관리자만 사용할 수 있습니다." });
  } catch (error) {
    return res.status(401).json({ error: error instanceof Error ? error.message : "로그인이 필요합니다." });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  try {
    if (body.action === "rewrite") {
      const original = text(body.text);
      const instruction = text(body.instruction, 300);
      if (!original.trim() || !instruction.trim()) return res.status(400).json({ error: "고칠 글과 요청을 입력해 주세요." });
      return res.status(200).json({ text: await rewriteText(original, instruction, text(body.context) || undefined) });
    }

    const images = bookImages(body.images);
    if (!images) return res.status(400).json({ error: `이 책에 올린 사진을 1~${MAX_IMAGES}장 선택해 주세요.` });
    const memo = text(body.memo, 1500);

    if (body.action === "read") return res.status(200).json(await readPhotos(images, memo));

    if (body.action === "write") {
      const understanding = text(body.understanding);
      if (!understanding.trim()) return res.status(400).json({ error: "사진 분석을 먼저 해 주세요." });
      const style = typeof body.style === "string" && WRITING_STYLES[body.style] ? body.style : "magazine";
      const article = await writeArticle({ images, understanding, style, length: text(body.length, 10), memo, previous: body.previous as Article | undefined, instruction: text(body.instruction, 500) });
      return res.status(200).json(article);
    }
    return res.status(400).json({ error: "알 수 없는 요청입니다." });
  } catch (error) {
    console.error("[flipbook-write]", error);
    return res.status(502).json({ error: "AI가 글을 만들지 못했습니다. 잠시 후 다시 시도해 주세요." });
  }
}
