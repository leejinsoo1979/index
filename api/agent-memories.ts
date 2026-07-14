import type { VercelRequest, VercelResponse } from "@vercel/node";
import memoriesHandler from "./memories.js";
import { requireAgentAdmin } from "./_firebaseAdmin.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const queryUserId = Array.isArray(req.query.userId) ? req.query.userId[0] : req.query.userId;
    const bodyUserId = typeof req.body?.userId === "string" ? req.body.userId : undefined;
    await requireAgentAdmin(req, bodyUserId || queryUserId);
    return memoriesHandler(req, res);
  } catch (error) {
    res.status(401).json({ error: error instanceof Error ? error.message : "Unauthorized" });
  }
}
