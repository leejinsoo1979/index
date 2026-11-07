import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getChatQuota } from "./_chatQuota.js";
import { verifyFirebaseUser } from "./_firebaseAdmin.js";

/** GET: the signed-in member's INDEX AI question quota for today. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  let user;
  try {
    user = await verifyFirebaseUser(req);
  } catch (error) {
    res.status(401).json({ error: error instanceof Error ? error.message : "로그인이 필요합니다." });
    return;
  }
  try {
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json(await getChatQuota(user));
  } catch (error) {
    console.error("[chat-quota]", error);
    res.status(500).json({ error: "질문 한도를 확인하지 못했습니다." });
  }
}
