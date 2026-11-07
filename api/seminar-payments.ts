import type { VercelRequest, VercelResponse } from "@vercel/node";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore, type DocumentReference, type Firestore } from "firebase-admin/firestore";

/**
 * Seminar payments (Toss Payments) — the only writer of `seminarOrders` and of
 * `seminars/{id}.enrolled`. Prices and seat availability are always read from
 * Firestore here, never trusted from the browser.
 *
 * Env: FIREBASE_SERVICE_ACCOUNT (JSON or base64 JSON), TOSS_CLIENT_KEY, TOSS_SECRET_KEY,
 *      ADMIN_EMAILS (comma separated, default sbbc212@gmail.com).
 */
export const config = { maxDuration: 30 };

const TOSS_API = "https://api.tosspayments.com/v1/payments";
const DEFAULT_ADMIN_EMAIL = "sbbc212@gmail.com";
const ACTIVE_STATUSES = ["PAID", "REFUND_REQUESTED", "CONFIRMING"];

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// ─── firebase-admin ─────────────────────────────────────────────────────────
let app: App | null = null;
function firebase(): { db: Firestore; app: App } {
  if (!app) {
    app = getApps()[0] ?? null;
    if (!app) {
      const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
      if (!raw) throw new HttpError(503, "FIREBASE_SERVICE_ACCOUNT가 서버에 설정되지 않아 결제를 처리할 수 없습니다.");
      let account: Record<string, string>;
      try {
        account = JSON.parse(raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8"));
      } catch {
        throw new HttpError(503, "FIREBASE_SERVICE_ACCOUNT 형식이 올바르지 않습니다 (서비스 계정 JSON).");
      }
      app = initializeApp({ credential: cert(account as Parameters<typeof cert>[0]) });
    }
  }
  return { db: getFirestore(app), app };
}

type Caller = { uid: string; email: string | null; isAdmin: boolean };

async function caller(req: VercelRequest): Promise<Caller> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw new HttpError(401, "로그인이 필요합니다.");
  let decoded;
  try {
    decoded = await getAuth(firebase().app).verifyIdToken(header.slice(7));
  } catch {
    throw new HttpError(401, "로그인 정보가 만료되었습니다. 다시 로그인해 주세요.");
  }
  const admins = (process.env.ADMIN_EMAILS || DEFAULT_ADMIN_EMAIL).split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  const email = decoded.email?.toLowerCase() ?? null;
  return { uid: decoded.uid, email, isAdmin: Boolean(email && decoded.email_verified && admins.includes(email)) };
}

// ─── Toss ───────────────────────────────────────────────────────────────────
function tossKeys() {
  const clientKey = process.env.TOSS_CLIENT_KEY?.trim();
  const secretKey = process.env.TOSS_SECRET_KEY?.trim();
  return { clientKey, secretKey, testMode: Boolean(clientKey?.startsWith("test_")) };
}

async function toss(path: string, body: unknown, idempotencyKey?: string) {
  const { secretKey } = tossKeys();
  if (!secretKey) throw new HttpError(503, "TOSS_SECRET_KEY가 서버에 설정되지 않았습니다.");
  const response = await fetch(`${TOSS_API}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, any>;
  return { ok: response.ok, data };
}

// ─── helpers ────────────────────────────────────────────────────────────────
/** Today in Korea as "YYYY-MM-DD" (seminar dates are local dates). */
function todayKst(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(now);
}

function makeOrderId(): string {
  const ymd = todayKst().replaceAll("-", "");
  const rand = Array.from({ length: 8 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("");
  return `SEM-${ymd}-${rand}`;
}

function str(value: unknown, label: string, max: number, required = false): string | undefined {
  if (value === undefined || value === null || value === "") {
    if (required) throw new HttpError(400, `${label}을(를) 입력해 주세요.`);
    return undefined;
  }
  if (typeof value !== "string" || value.trim().length > max) throw new HttpError(400, `${label} 형식이 올바르지 않습니다.`);
  return value.trim();
}

function parseApplicant(raw: unknown) {
  const a = (raw ?? {}) as Record<string, unknown>;
  const email = str(a.email, "이메일", 200, true)!;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "이메일 형식이 올바르지 않습니다.");
  const applicant = {
    name: str(a.name, "이름", 50, true)!,
    email,
    phone: str(a.phone, "전화번호", 30),
    affiliation: str(a.affiliation, "소속", 100),
    motivation: str(a.motivation, "신청 동기", 1000),
  };
  return Object.fromEntries(Object.entries(applicant).filter(([, v]) => v !== undefined)) as typeof applicant;
}

/** Mirrors applyState() in src/lib/seminars.ts. */
function assertApplyOpen(s: Record<string, any>) {
  const today = todayKst();
  if (!s.published) throw new HttpError(404, "세미나를 찾을 수 없습니다.");
  if (String(s.date) < today || s.status === "완료") throw new HttpError(409, "종료된 세미나입니다.");
  if (s.status !== "접수중") throw new HttpError(409, "아직 접수 기간이 아닙니다.");
  if (s.applyDeadline && today > String(s.applyDeadline)) throw new HttpError(409, "접수가 마감되었습니다.");
  if (Number(s.enrolled ?? 0) >= Number(s.capacity ?? 0)) throw new HttpError(409, "정원이 마감되었습니다.");
}

async function loadOwnedOrder(db: Firestore, orderId: unknown, who: Caller) {
  if (typeof orderId !== "string" || !/^SEM-\d{8}-[A-Z0-9]{8}$/.test(orderId)) throw new HttpError(400, "주문번호가 올바르지 않습니다.");
  const ref = db.doc(`seminarOrders/${orderId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpError(404, "주문을 찾을 수 없습니다.");
  const order = snap.data()!;
  if (order.uid !== who.uid && !who.isAdmin) throw new HttpError(403, "본인 주문만 처리할 수 있습니다.");
  return { ref, order };
}

/** Moves an order between states atomically, adjusting the seminar's seat count. */
async function transition(
  db: Firestore,
  ref: DocumentReference,
  from: string[],
  patch: Record<string, unknown>,
  enrolledDelta = 0,
) {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const order = snap.data();
    if (!order) throw new HttpError(404, "주문을 찾을 수 없습니다.");
    if (!from.includes(order.status)) throw new HttpError(409, "현재 상태에서는 처리할 수 없습니다.");
    if (enrolledDelta !== 0) {
      const semRef = db.doc(`seminars/${order.seminarId}`);
      const sem = await tx.get(semRef);
      if (sem.exists) {
        const next = Math.max(0, Number(sem.data()!.enrolled ?? 0) + enrolledDelta);
        tx.update(semRef, { enrolled: next });
      }
    }
    const updated = { ...patch, updatedAt: Date.now() };
    tx.update(ref, updated);
    return { ...order, ...updated };
  });
}

// ─── actions ────────────────────────────────────────────────────────────────
async function prepare(who: Caller, body: Record<string, unknown>) {
  const { db } = firebase();
  const seminarId = str(body.seminarId, "세미나", 100, true)!;
  const applicant = parseApplicant(body.applicant);
  const semRef = db.doc(`seminars/${seminarId}`);
  const orderId = makeOrderId();
  const orderRef = db.doc(`seminarOrders/${orderId}`);
  const keys = tossKeys();

  const result = await db.runTransaction(async (tx) => {
    const semSnap = await tx.get(semRef);
    if (!semSnap.exists) throw new HttpError(404, "세미나를 찾을 수 없습니다.");
    const s = semSnap.data()!;
    assertApplyOpen(s);
    const existing = await tx.get(
      db.collection("seminarOrders").where("uid", "==", who.uid).where("seminarId", "==", seminarId),
    );
    if (existing.docs.some((d) => ACTIVE_STATUSES.includes(d.data().status))) {
      throw new HttpError(409, "이미 신청한 세미나입니다. 마이페이지에서 신청 내역을 확인해 주세요.");
    }
    const price = Math.max(0, Math.round(Number(s.price ?? 0)));
    if (price > 0 && (!keys.clientKey || !keys.secretKey)) {
      throw new HttpError(503, "결제 키(TOSS_CLIENT_KEY / TOSS_SECRET_KEY)가 서버에 설정되지 않았습니다.");
    }
    const now = Date.now();
    tx.set(orderRef, {
      seminarId,
      seminarTitle: String(s.title ?? ""),
      seminarDate: String(s.date ?? ""),
      uid: who.uid,
      applicant,
      amount: price,
      status: price === 0 ? "PAID" : "PENDING",
      ...(price === 0 ? { method: "무료", approvedAt: now } : { testMode: keys.testMode }),
      createdAt: now,
      updatedAt: now,
    });
    if (price === 0) tx.update(semRef, { enrolled: FieldValue.increment(1) });
    return { price, title: String(s.title ?? "세미나") };
  });

  if (result.price === 0) return { free: true, orderId };
  return {
    free: false,
    orderId,
    amount: result.price,
    orderName: `${result.title} 세미나`.slice(0, 100),
    customerKey: who.uid,
    clientKey: keys.clientKey,
  };
}

async function confirm(who: Caller, body: Record<string, unknown>) {
  const { db } = firebase();
  const paymentKey = str(body.paymentKey, "결제 키", 200, true)!;
  const amount = Number(body.amount);
  const { ref, order } = await loadOwnedOrder(db, body.orderId, who);
  if (order.status === "PAID" && order.paymentKey === paymentKey) return { order: { id: ref.id, ...order } };

  // 1) Reserve the seat atomically before charging (prevents overbooking on races).
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.data()!;
    if (current.status !== "PENDING") throw new HttpError(409, "이미 처리되었거나 만료된 주문입니다.");
    if (!Number.isFinite(amount) || amount !== current.amount) throw new HttpError(400, "결제 금액이 주문 금액과 일치하지 않습니다.");
    const semRef = db.doc(`seminars/${current.seminarId}`);
    const sem = await tx.get(semRef);
    const s = sem.data();
    if (!s || Number(s.enrolled ?? 0) >= Number(s.capacity ?? 0)) {
      tx.update(ref, { status: "FAILED", failReason: "정원 마감", updatedAt: Date.now() });
      return;
    }
    tx.update(semRef, { enrolled: FieldValue.increment(1) });
    tx.update(ref, { status: "CONFIRMING", paymentKey, updatedAt: Date.now() });
  });
  const reserved = (await ref.get()).data()!;
  if (reserved.status === "FAILED") throw new HttpError(409, "정원이 마감되어 결제가 승인되지 않았습니다. 결제 금액은 청구되지 않습니다.");

  // 2) Confirm with Toss. A retried confirm reports ALREADY_PROCESSED_PAYMENT → verify instead.
  let { ok, data } = await toss("/confirm", { paymentKey, orderId: ref.id, amount }, `confirm-${ref.id}`);
  if (!ok && data.code === "ALREADY_PROCESSED_PAYMENT") {
    const lookup = await toss(`/${encodeURIComponent(paymentKey)}`, undefined);
    ok = lookup.ok && lookup.data.status === "DONE" && lookup.data.orderId === ref.id && lookup.data.totalAmount === amount;
    data = lookup.data;
  }
  if (!ok) {
    await transition(db, ref, ["CONFIRMING"], { status: "FAILED", failReason: String(data.message ?? "결제 승인 실패") }, -1);
    throw new HttpError(402, String(data.message ?? "결제 승인에 실패했습니다."));
  }

  // 3) Record the payment.
  const paid = await transition(db, ref, ["CONFIRMING"], {
    status: "PAID",
    method: String(data.method ?? "카드"),
    approvedAt: data.approvedAt ? Date.parse(data.approvedAt) : Date.now(),
    receiptUrl: data.receipt?.url ?? null,
  });
  return { order: { id: ref.id, ...paid } };
}

async function abandon(who: Caller, body: Record<string, unknown>) {
  const { db } = firebase();
  const { ref } = await loadOwnedOrder(db, body.orderId, who);
  const reason = str(body.reason, "사유", 300) ?? "결제 취소";
  await transition(db, ref, ["PENDING"], { status: "FAILED", failReason: reason }).catch((e) => {
    if (!(e instanceof HttpError && e.status === 409)) throw e;
  });
  return { ok: true };
}

async function requestRefund(who: Caller, body: Record<string, unknown>) {
  const { db } = firebase();
  const { ref, order } = await loadOwnedOrder(db, body.orderId, who);
  if (order.uid !== who.uid) throw new HttpError(403, "본인 주문만 환불 요청할 수 있습니다.");
  const reason = str(body.reason, "환불 사유", 500, true)!;
  await transition(db, ref, ["PAID"], { status: "REFUND_REQUESTED", refundReason: reason, refundRequestedAt: Date.now() });
  return { ok: true };
}

async function rejectRefund(who: Caller, body: Record<string, unknown>) {
  if (!who.isAdmin) throw new HttpError(403, "관리자만 처리할 수 있습니다.");
  const { db } = firebase();
  const { ref } = await loadOwnedOrder(db, body.orderId, who);
  await transition(db, ref, ["REFUND_REQUESTED"], { status: "PAID" });
  return { ok: true };
}

async function cancel(who: Caller, body: Record<string, unknown>) {
  if (!who.isAdmin) throw new HttpError(403, "관리자만 처리할 수 있습니다.");
  const { db } = firebase();
  const { ref, order } = await loadOwnedOrder(db, body.orderId, who);
  const reason = str(body.reason, "취소 사유", 200, true)!;
  if (!["PAID", "REFUND_REQUESTED"].includes(order.status)) throw new HttpError(409, "현재 상태에서는 취소할 수 없습니다.");
  if (order.amount > 0) {
    if (!order.paymentKey) throw new HttpError(409, "결제 키가 없는 주문입니다.");
    const { ok, data } = await toss(`/${encodeURIComponent(order.paymentKey)}/cancel`, { cancelReason: reason }, `cancel-${ref.id}`);
    // A repeated cancel (e.g. after a timeout) reports the payment as already canceled.
    if (!ok && data.code !== "ALREADY_CANCELED_PAYMENT") {
      throw new HttpError(502, String(data.message ?? "토스페이먼츠 결제 취소에 실패했습니다."));
    }
  }
  const status = order.status === "REFUND_REQUESTED" ? "REFUNDED" : "CANCELED";
  await transition(db, ref, ["PAID", "REFUND_REQUESTED"], { status, cancelReason: reason, canceledAt: Date.now() }, -1);
  return { ok: true, status };
}

// ─── handler ────────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (body.action === "config") {
      const keys = tossKeys();
      res.status(200).json({
        ready: Boolean(keys.clientKey && keys.secretKey && process.env.FIREBASE_SERVICE_ACCOUNT),
        testMode: keys.testMode,
      });
      return;
    }
    const who = await caller(req);
    const actions: Record<string, (w: Caller, b: Record<string, unknown>) => Promise<unknown>> = {
      prepare,
      confirm,
      abandon,
      "request-refund": requestRefund,
      "reject-refund": rejectRefund,
      cancel,
    };
    const action = actions[String(body.action)];
    if (!action) throw new HttpError(400, "알 수 없는 action입니다.");
    res.status(200).json(await action(who, body));
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    if (status >= 500) console.error("[seminar-payments]", error);
    res.status(status).json({ error: error instanceof Error ? error.message : "결제 처리 중 오류가 발생했습니다." });
  }
}
