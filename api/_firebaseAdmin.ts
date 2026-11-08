import { decodeProtectedHeader, importX509, jwtVerify, type JWTPayload } from "jose";
import { isServerFirestoreConfigured, serverFirestore } from "./_firebaseServer.js";
import type { VercelRequest } from "@vercel/node";

const DEFAULT_ADMIN_EMAIL = "sbbc212@gmail.com";
const CERT_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
let certificates = new Map<string, CryptoKey>();
let certificatesExpireAt = 0;

async function firebasePublicKey(kid: string) {
  if (Date.now() < certificatesExpireAt && certificates.has(kid)) return certificates.get(kid)!;
  const response = await fetch(CERT_URL);
  if (!response.ok) throw new Error("Firebase 공개 인증서를 가져오지 못했습니다.");
  const values = await response.json() as Record<string, string>;
  const next = new Map<string, CryptoKey>();
  for (const [keyId, certificate] of Object.entries(values)) next.set(keyId, await importX509(certificate, "RS256"));
  certificates = next;
  const maxAge = Number(response.headers.get("cache-control")?.match(/max-age=(\d+)/)?.[1] ?? 3600);
  certificatesExpireAt = Date.now() + Math.max(300, maxAge) * 1000;
  const key = certificates.get(kid);
  if (!key) throw new Error("Firebase 인증서 키를 찾지 못했습니다.");
  return key;
}

type FirebasePayload = JWTPayload & { email?: string; user_id?: string };

/** Verify a Firebase ID token from `Authorization: Bearer <token>` (any signed-in user). */
export async function verifyFirebaseUser(req: VercelRequest) {
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) throw new Error("로그인이 필요합니다.");
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error("FIREBASE_PROJECT_ID가 설정되지 않았습니다.");
  const token = authorization.slice(7);
  const header = decodeProtectedHeader(token);
  if (header.alg !== "RS256" || !header.kid) throw new Error("Firebase 인증 토큰 형식이 올바르지 않습니다.");
  const { payload: decoded } = await jwtVerify(token, await firebasePublicKey(header.kid), {
    algorithms: ["RS256"],
    audience: projectId,
    issuer: `https://securetoken.google.com/${projectId}`,
  }) as { payload: FirebasePayload };
  const uid = decoded.user_id || decoded.sub;
  if (!uid || uid.length > 128) throw new Error("Firebase 사용자 식별자가 올바르지 않습니다.");
  return { ...decoded, uid };
}

export function isAdminEmail(email: string | undefined): boolean {
  const allowedEmails = (process.env.ADMIN_EMAILS || DEFAULT_ADMIN_EMAIL).split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return Boolean(email && allowedEmails.includes(email.toLowerCase()));
}

/**
 * Admin / suspension state of a signed-in user. Super admins come from ADMIN_EMAILS; further admins
 * and suspensions are set in /admin/members (Firestore members/{uid}.role / .status). Reading the
 * member record needs FIREBASE_SERVICE_ACCOUNT; without it only ADMIN_EMAILS count as admins.
 */
export async function memberAccess(user: { uid: string; email?: string }): Promise<{ admin: boolean; suspended: boolean; memberType?: string }> {
  const superAdmin = isAdminEmail(user.email);
  if (!isServerFirestoreConfigured()) return { admin: superAdmin, suspended: false };
  try {
    const snap = await serverFirestore().doc(`members/${user.uid}`).get();
    const suspended = !superAdmin && snap.get("status") === "suspended";
    return { admin: superAdmin || (snap.get("role") === "admin" && !suspended), suspended, memberType: snap.get("memberType") };
  } catch (error) {
    console.warn("[member-access] member record read failed", error);
    return { admin: superAdmin, suspended: false };
  }
}

export async function requireAgentAdmin(req: VercelRequest, expectedUserId?: string) {
  const decoded = await verifyFirebaseUser(req);
  if (!(await memberAccess(decoded)).admin) throw new Error("Agent Studio 관리자 권한이 없습니다.");
  if (expectedUserId && decoded.uid !== expectedUserId) throw new Error("사용자 인증 정보가 일치하지 않습니다.");
  return decoded;
}
