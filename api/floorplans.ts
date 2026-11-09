import type { VercelRequest, VercelResponse } from "@vercel/node";
import { memberAccess, verifyFirebaseUser } from "./_firebaseAdmin.js";
import { addManagedDanji, addManagedPlan, managedDanjiDetail, managedDanjiList, managedRegionTree, updateManagedDanji, updateManagedPlan } from "./_floorplanManage.js";
import { approvedWalls, findFloorPlans, floorPlanImageUrl, floorPlanMap, floorPlansConfigured, floorPlansOfDanji, readWalls, removeVerified, reviewedWallList, saveVerifiedImage, saveVerifiedPdf, saveWalls, signedFileUrl } from "./_floorplans.js";

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
    } else if (body.action === "manageList") {
      res.status(200).json(await managedDanjiList(body));
    } else if (body.action === "manageRegions") {
      res.status(200).json(await managedRegionTree());
    } else if (body.action === "manageDetail" && validId(body.kbId)) {
      res.status(200).json(await managedDanjiDetail(body.kbId));
    } else if (body.action === "manageDanji" && validId(body.kbId)) {
      await updateManagedDanji(body.kbId, body);
      res.status(200).json({ ok: true });
    } else if (body.action === "manageAddDanji") {
      res.status(200).json(await addManagedDanji(body));
    } else if (body.action === "managePlan" && validId(body.id)) {
      await updateManagedPlan(body.id, body);
      res.status(200).json({ ok: true });
    } else if (body.action === "manageAddPlan" && validId(body.kbId)) {
      res.status(200).json(await addManagedPlan(body.kbId, body));
    } else if (body.action === "map") {
      res.status(200).json(await floorPlanMap());
    } else if (body.action === "getWalls" && validId(body.id)) {
      const { url, verified } = await floorPlanImageUrl(body.id);
      res.status(200).json({ record: await readWalls(body.id), url, verified, pdfUrl: verified?.pdf ? signedFileUrl(verified.pdf) : null });
    } else if (body.action === "uploadVerified" && validId(body.id)) {
      res.status(200).json({ verified: await saveVerifiedImage(body.id, body, user.email ?? user.uid) });
    } else if (body.action === "uploadVerifiedPdf" && validId(body.id)) {
      res.status(200).json({ verified: await saveVerifiedPdf(body.id, body.pdf) });
    } else if (body.action === "removeVerified" && validId(body.id)) {
      await removeVerified(body.id, user.email ?? user.uid);
      res.status(200).json({ ok: true });
    } else if (body.action === "saveWalls" && validId(body.id)) {
      res.status(200).json({ record: await saveWalls(body.id, body, user.email ?? user.uid) });
    } else if (body.action === "reviewed") {
      res.status(200).json({ records: await reviewedWallList() });
    } else if (!body.action) {
      const ids = (Array.isArray(body.ids) ? body.ids : []).filter(validId).slice(0, 30);
      const images = await Promise.all(ids.map(async (id) => [id, await floorPlanImageUrl(id)] as const));
      res.status(200).json({
        urls: Object.fromEntries(images.map(([id, image]) => [id, image.url])),
        verified: Object.fromEntries(images.filter(([, image]) => image.verified).map(([id, image]) => [id, image.verified!.note])),
        walls: await approvedWalls(ids),
      });
    } else {
      res.status(400).json({ error: "지원하지 않는 요청입니다." });
    }
  } catch (error) {
    const failure = error as Error & { status?: number };
    console.error("[floorplans]", failure);
    res.status(failure.status ?? 500).json({ error: failure.message || "요청을 처리하지 못했습니다." });
  }
}
