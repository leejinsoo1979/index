import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAgentAdmin } from "./_firebaseAdmin.js";
import { runKisconSync } from "./_kiscon.js";
import { applyManagedKeys } from "./_apiKeys.js";

/**
 * Daily KISCON 건설업 공시 sync (vercel.json cron). Each run continues from the saved
 * cursor, so it also works through the initial backfill a few years at a time; for a
 * one-shot backfill run `npm run kiscon:backfill` locally.
 * Auth: Vercel Cron's `Authorization: Bearer $CRON_SECRET`, or an admin's Firebase ID token.
 */
export const config = { maxDuration: 300 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await applyManagedKeys();
  const secret = process.env.CRON_SECRET;
  const fromCron = Boolean(secret) && req.headers.authorization === `Bearer ${secret}`;
  if (!fromCron) {
    try {
      await requireAgentAdmin(req);
    } catch (error) {
      res.status(401).json({ error: error instanceof Error ? error.message : "인증에 실패했습니다." });
      return;
    }
  }
  try {
    // Leave headroom under maxDuration for the last window's writes.
    const report = await runKisconSync(Date.now() + 240_000, (msg) => console.log("[kiscon-sync]", msg));
    res.status(200).json(report);
  } catch (error) {
    console.error("[kiscon-sync]", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "동기화에 실패했습니다." });
  }
}
