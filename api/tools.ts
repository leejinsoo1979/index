import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyFirebaseUser } from "./_firebaseAdmin.js";
import { listTools, runTool } from "./_toolCatalog.js";
import { applyManagedKeys } from "./_apiKeys.js";

/**
 * INDEX AI 도구.
 * GET  /api/tools                → catalogue (public; shows which tools are connected)
 * POST /api/tools { id, input }  → run a tool (members only)
 */
export const config = { maxDuration: 60 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await applyManagedKeys();
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET") {
    res.status(200).json({ tools: await listTools() });
    return;
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  try {
    await verifyFirebaseUser(req);
  } catch {
    res.status(401).json({ error: "로그인이 필요합니다.", code: "LOGIN_REQUIRED" });
    return;
  }
  const body = (req.body ?? {}) as { id?: unknown; input?: unknown };
  if (typeof body.id !== "string") {
    res.status(400).json({ error: "도구를 선택해 주세요." });
    return;
  }
  const input = body.input && typeof body.input === "object" ? (body.input as Record<string, unknown>) : {};
  const result = await runTool(body.id, input);
  res.status(result.ok ? 200 : 422).json(result);
}
