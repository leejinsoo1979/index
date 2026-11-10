import type { VercelRequest, VercelResponse } from "@vercel/node";
import { addCustomApi, apiKeyStatus, removeApiKey, removeCustomApi, saveApiKey, testApiKey } from "./_apiKeys.js";
import { isAdminEmail, verifyFirebaseUser } from "./_firebaseAdmin.js";
import { floorPlansConfigured } from "./_floorplans.js";

const validName = (name: unknown): name is string => typeof name === "string" && /^[A-Z][A-Z0-9_]{2,49}$/.test(name);

/** API 관리: super admins (ADMIN_EMAILS) only, since these keys run the whole site. */
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
  if (!isAdminEmail(user.email)) {
    res.status(403).json({ error: "최고 관리자만 API 키를 관리할 수 있습니다." });
    return;
  }
  if (!floorPlansConfigured()) {
    res.status(503).json({ error: "서버에 비공개 저장소 설정이 없어 API 키를 보관할 수 없습니다." });
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  const body = (req.body ?? {}) as Record<string, unknown>;
  const by = user.email ?? user.uid;
  try {
    if (body.action === "status") res.status(200).json(await apiKeyStatus());
    else if (body.action === "save" && validName(body.name)) { await saveApiKey(body.name, body.value, by); res.status(200).json({ ok: true }); }
    else if (body.action === "remove" && validName(body.name)) { await removeApiKey(body.name); res.status(200).json({ ok: true }); }
    else if (body.action === "addCustom") { await addCustomApi(body, by); res.status(200).json({ ok: true }); }
    else if (body.action === "removeCustom" && validName(body.name)) { await removeCustomApi(body.name); res.status(200).json({ ok: true }); }
    else if (body.action === "test" && validName(body.name)) res.status(200).json(await testApiKey(body.name));
    else res.status(400).json({ error: "지원하지 않는 요청입니다." });
  } catch (error) {
    const failure = error as Error & { status?: number };
    console.error("[api-keys]", failure.message);
    res.status(failure.status ?? 500).json({ error: failure.message || "요청을 처리하지 못했습니다." });
  }
}
