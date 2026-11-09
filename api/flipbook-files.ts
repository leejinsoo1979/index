import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomBytes } from "node:crypto";
import { memberAccess, verifyFirebaseUser } from "./_firebaseAdmin.js";
import { isR2Configured, r2DeletePrefix, r2PresignPut, r2PublicUrl } from "./_r2.js";

/**
 * Files of interactive flipbooks, kept in R2 under flipbooks/{bookId}/. Admins only: `sign` hands the
 * browser a one-file upload address, `delete` removes a book's files. Readers get the public R2 URLs.
 */
const MAX_BYTES = 100 * 1024 * 1024; // the editor says 100MB too (src/lib/flipbooks.ts)
const BOOK_ID = /^[a-z0-9]{6,32}$/;
const MEDIA_TYPE = /^(image|video|audio)\/([a-z0-9.+-]{1,40})$/;
const CACHE = "public, max-age=31536000, immutable"; // file names are random, so a file never changes

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const user = await verifyFirebaseUser(req);
    const access = await memberAccess(user);
    if (!access.admin) return res.status(403).json({ error: "관리자만 사용할 수 있습니다." });
  } catch (error) {
    return res.status(401).json({ error: error instanceof Error ? error.message : "로그인이 필요합니다." });
  }
  if (!isR2Configured()) return res.status(503).json({ error: "파일 저장소(R2)가 설정되지 않았습니다." });

  const { action, bookId, contentType, size } = (req.body ?? {}) as { action?: string; bookId?: string; contentType?: string; size?: number };
  if (typeof bookId !== "string" || !BOOK_ID.test(bookId)) return res.status(400).json({ error: "책 번호가 올바르지 않습니다." });

  if (action === "sign") {
    const media = typeof contentType === "string" ? MEDIA_TYPE.exec(contentType) : null;
    if (!media) return res.status(400).json({ error: "이미지, 비디오, 오디오 파일만 올릴 수 있습니다." });
    if (typeof size !== "number" || !Number.isInteger(size) || size <= 0 || size >= MAX_BYTES) return res.status(400).json({ error: "파일은 100MB보다 작아야 합니다." });
    const extension = media[2].replace(/[^a-z0-9]/g, "").slice(0, 8) || "bin";
    const key = `flipbooks/${bookId}/${randomBytes(9).toString("hex")}.${extension}`;
    return res.status(200).json({ uploadUrl: r2PresignPut(key, contentType!, size, CACHE), publicUrl: r2PublicUrl(key), cacheControl: CACHE });
  }

  if (action === "delete") {
    try {
      return res.status(200).json({ deleted: await r2DeletePrefix(`flipbooks/${bookId}/`) });
    } catch (error) {
      console.error("[flipbook-files] delete failed", error);
      return res.status(502).json({ error: "파일을 삭제하지 못했습니다." });
    }
  }

  return res.status(400).json({ error: "알 수 없는 요청입니다." });
}
