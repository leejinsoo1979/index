import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyFirebaseUser } from "./_firebaseAdmin.js";
import { isServerFirestoreConfigured, serverFirestore } from "./_firebaseServer.js";
import { applyManagedKeys } from "./_apiKeys.js";

/**
 * Tells the operator on Telegram that a member just signed up (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID).
 * The browser only triggers it: who signed up comes from the verified ID token and Firebase's own
 * account record, and only accounts created in the last 15 minutes count, once each.
 */
const FRESH_MS = 15 * 60_000;
const sentHere = new Set<string>();

async function accountCreatedAt(idToken: string): Promise<number | null> {
  const key = process.env.VITE_FIREBASE_API_KEY?.trim();
  if (!key) return null;
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { users?: Array<{ createdAt?: string }> };
  const created = Number(body.users?.[0]?.createdAt);
  return Number.isFinite(created) ? created : null;
}

/** True the first time this uid is seen; Firestore when available, otherwise per server instance. */
async function firstNotice(uid: string): Promise<boolean> {
  if (sentHere.has(uid)) return false;
  sentHere.add(uid);
  if (!isServerFirestoreConfigured()) return true;
  try {
    await serverFirestore().doc(`signupNotified/${uid}`).create({ at: new Date().toISOString() });
    return true;
  } catch {
    return false;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await applyManagedKeys();
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "지원하지 않는 요청입니다." });
    return;
  }
  let user: Awaited<ReturnType<typeof verifyFirebaseUser>>;
  try {
    user = await verifyFirebaseUser(req);
  } catch {
    res.status(401).json({ error: "로그인이 필요합니다." });
    return;
  }
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!botToken || !chatId) {
    res.status(200).json({ sent: false, reason: "not-configured" });
    return;
  }
  try {
    const created = await accountCreatedAt(req.headers.authorization!.slice(7));
    if (created === null || Date.now() - created > FRESH_MS || !(await firstNotice(user.uid))) {
      res.status(200).json({ sent: false, reason: "not-new" });
      return;
    }
    const body = (req.body ?? {}) as { memberType?: unknown; company?: unknown };
    const type = body.memberType === "사업자회원" ? "사업자회원" : "일반회원";
    const company = typeof body.company === "string" ? body.company.trim().slice(0, 60) : "";
    const name = typeof (user as { name?: unknown }).name === "string" ? ((user as { name?: string }).name as string) : "";
    const when = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
    const text = `INDEX 신규 가입\n${[name, user.email, type, company].filter(Boolean).join(" · ")}\n${when}`;
    const sent = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(8000),
    });
    res.status(200).json({ sent: sent.ok });
  } catch (error) {
    console.warn("[signup-notify]", (error as Error).message);
    res.status(200).json({ sent: false, reason: "error" });
  }
}
