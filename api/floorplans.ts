import type { VercelRequest, VercelResponse } from "@vercel/node";
import { memberAccess, verifyFirebaseUser } from "./_firebaseAdmin.js";
import { floorPlanImageUrl, floorPlansConfigured } from "./_floorplans.js";

/** POST { ids }: short-lived image URLs for floor plan cards. Admins only until the rights are confirmed. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
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
  if (!floorPlansConfigured() || !(await memberAccess(user)).admin) {
    res.status(403).json({ error: "평면도를 볼 권한이 없습니다." });
    return;
  }
  const ids = Array.isArray((req.body as { ids?: unknown })?.ids) ? ((req.body as { ids: unknown[] }).ids) : [];
  const valid = ids.filter((id): id is string => typeof id === "string" && /^\d{1,12}$/.test(id)).slice(0, 30);
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ urls: Object.fromEntries(valid.map((id) => [id, floorPlanImageUrl(id)])) });
}
