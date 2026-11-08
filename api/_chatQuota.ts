import { memberAccess } from "./_firebaseAdmin.js";
import { isServerFirestoreConfigured, serverFirestore } from "./_firebaseServer.js";

/**
 * Daily INDEX AI question limits per member, counted server-side in Firestore
 * `chatUsage/{uid}` ({ day: YYYYMMDD (KST), count }). Member type comes from
 * `members/{uid}.memberType` (set at signup, changed by admins in /admin/members). Admins —
 * ADMIN_EMAILS plus members granted role "admin" — are unlimited; suspended members are refused.
 * Resets at 00:00 KST.
 *
 * Needs FIREBASE_SERVICE_ACCOUNT; without it (e.g. local dev) limits are not enforced.
 */
export const CHAT_DAILY_LIMITS = { 일반회원: 10, 사업자회원: 30 } as const;
type MemberType = keyof typeof CHAT_DAILY_LIMITS;

export type ChatQuota = { limit: number | null; used: number; remaining: number | null; memberType: MemberType | "관리자"; enforced: boolean };

export class QuotaExceededError extends Error {
  constructor(public quota: ChatQuota) {
    super(`오늘 질문 한도(${quota.limit}회)를 모두 사용했습니다. 내일 0시(한국 시간)에 다시 이용할 수 있습니다.`);
  }
}

const todayKst = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10).replace(/-/g, "");

async function memberType(uid: string): Promise<MemberType> {
  const snap = await serverFirestore().doc(`members/${uid}`).get();
  return snap.get("memberType") === "사업자회원" ? "사업자회원" : "일반회원";
}

export class MemberSuspendedError extends Error {
  status = 403;
  constructor() {
    super("정지된 계정입니다. 협회에 문의해 주세요.");
  }
}

export async function getChatQuota(user: { uid: string; email?: string }): Promise<ChatQuota> {
  const access = await memberAccess(user);
  if (access.suspended) throw new MemberSuspendedError();
  if (access.admin) return { limit: null, used: 0, remaining: null, memberType: "관리자", enforced: true };
  if (!isServerFirestoreConfigured()) return { limit: null, used: 0, remaining: null, memberType: "일반회원", enforced: false };
  const type = await memberType(user.uid);
  const limit = CHAT_DAILY_LIMITS[type];
  const snap = await serverFirestore().doc(`chatUsage/${user.uid}`).get();
  const used = snap.get("day") === todayKst() ? Number(snap.get("count") ?? 0) : 0;
  return { limit, used, remaining: Math.max(limit - used, 0), memberType: type, enforced: true };
}

/** Count one question, or throw QuotaExceededError. Returns the quota after this question. */
export async function consumeChatQuota(user: { uid: string; email?: string }): Promise<ChatQuota> {
  const access = await memberAccess(user);
  if (access.suspended) throw new MemberSuspendedError();
  if (access.admin) return getChatQuota(user);
  if (!isServerFirestoreConfigured()) {
    console.warn("[chat-quota] FIREBASE_SERVICE_ACCOUNT is not set — question limits are not enforced");
    return getChatQuota(user);
  }
  const db = serverFirestore();
  const type = await memberType(user.uid);
  const limit = CHAT_DAILY_LIMITS[type];
  const ref = db.doc(`chatUsage/${user.uid}`);
  const day = todayKst();
  const used = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.get("day") === day ? Number(snap.get("count") ?? 0) : 0;
    if (current >= limit) throw new QuotaExceededError({ limit, used: current, remaining: 0, memberType: type, enforced: true });
    tx.set(ref, { day, count: current + 1, memberType: type, updatedAt: new Date().toISOString() });
    return current + 1;
  });
  return { limit, used, remaining: Math.max(limit - used, 0), memberType: type, enforced: true };
}

/** Give a question back when the answer failed before anything was streamed. */
export async function refundChatQuota(user: { uid: string; email?: string }): Promise<void> {
  if (!isServerFirestoreConfigured() || (await memberAccess(user)).admin) return;
  const db = serverFirestore();
  const ref = db.doc(`chatUsage/${user.uid}`);
  const day = todayKst();
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.get("day") !== day) return;
    tx.update(ref, { count: Math.max(Number(snap.get("count") ?? 1) - 1, 0) });
  });
}
