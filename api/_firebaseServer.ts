import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

/**
 * Server-side Firestore (Admin SDK) for data the server owns, e.g. the KISCON
 * contractor index. Needs a service account: FIREBASE_SERVICE_ACCOUNT holds the
 * downloaded JSON key, raw or base64-encoded.
 */
let app: App | null = null;

function serviceAccount(): Record<string, string> | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (!raw) return null;
  const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  const parsed = JSON.parse(json) as Record<string, string>;
  // Env UIs often store the key with literal "\n".
  if (parsed.private_key) parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
  return parsed;
}

export const isServerFirestoreConfigured = () => Boolean(process.env.FIREBASE_SERVICE_ACCOUNT?.trim());

export function serverFirestore(): Firestore {
  if (!app) {
    const account = serviceAccount();
    if (!account) throw new Error("FIREBASE_SERVICE_ACCOUNT가 설정되지 않았습니다.");
    app = getApps()[0] ?? initializeApp({ credential: cert(account as Parameters<typeof cert>[0]) });
  }
  return getFirestore(app);
}
