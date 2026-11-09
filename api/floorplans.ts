import type { VercelRequest, VercelResponse } from "@vercel/node";
import { memberAccess, verifyFirebaseUser } from "./_firebaseAdmin.js";
import { approvedWalls, findFloorPlans, floorPlanImageUrl, floorPlansConfigured, floorPlansOfDanji, readWalls, reviewedWallList, saveWalls } from "./_floorplans.js";

const validId = (id: unknown): id is string => typeof id === "string" && /^\d{1,12}$/.test(id);

/**
 * POST { ids }: short-lived image URLs and reviewed bearing-wall marks for floor plan cards.
 * POST { action }: the bearing-wall review tool (/admin/floorplans).
 * Admins only until the rights to the collection are confirmed.
 */
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
  const body = (req.body ?? {}) as Record<string, unknown>;
  res.setHeader("Cache-Control", "no-store");
  try {
    if (body.action === "search") {
      res.status(200).json({ cards: await findFloorPlans(String(body.query ?? "")) });
    } else if (body.action === "danji") {
      res.status(200).json({ cards: await floorPlansOfDanji(String(body.kbId ?? "")) });
    } else if (body.action === "getWalls" && validId(body.id)) {
      res.status(200).json({ record: await readWalls(body.id), url: floorPlanImageUrl(body.id) });
    } else if (body.action === "saveWalls" && validId(body.id)) {
      res.status(200).json({ record: await saveWalls(body.id, body, user.email ?? user.uid) });
    } else if (body.action === "reviewed") {
      res.status(200).json({ records: await reviewedWallList() });
    } else if (!body.action) {
      const ids = (Array.isArray(body.ids) ? body.ids : []).filter(validId).slice(0, 30);
      res.status(200).json({ urls: Object.fromEntries(ids.map((id) => [id, floorPlanImageUrl(id)])), walls: await approvedWalls(ids) });
    } else {
      res.status(400).json({ error: "지원하지 않는 요청입니다." });
    }
  } catch (error) {
    const failure = error as Error & { status?: number };
    console.error("[floorplans]", failure);
    res.status(failure.status ?? 500).json({ error: failure.message || "요청을 처리하지 못했습니다." });
  }
}
