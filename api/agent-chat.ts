import type { VercelRequest, VercelResponse } from "@vercel/node";
import chatHandler from "./chat.js";
import { requireAgentAdmin } from "./_firebaseAdmin.js";

export const config = { maxDuration: 30 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const userId = typeof req.body?.userId === "string" ? req.body.userId : undefined;
    await requireAgentAdmin(req, userId);
    return chatHandler(req, res);
  } catch (error) {
    res.status(401).json({ error: error instanceof Error ? error.message : "Unauthorized" });
  }
}
