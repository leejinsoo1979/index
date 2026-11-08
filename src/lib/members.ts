/**
 * Member records — Firestore `members/{uid}` (firestore.rules).
 *
 * - The member keeps `name`, `email`, `lastLoginAt` current (written on every sign-in by
 *   `syncMemberProfile`); `memberType`, `company`, `phone`, `provider` are set once at signup.
 * - Admins change `memberType` (AI 질문 한도), `role: "admin"` (관리자 지정) and
 *   `status: "suspended"` (정지) in /admin/members — never in code.
 * - Super admins (ADMIN_EMAILS) are always admins and can't be demoted or suspended.
 *
 * Without Firebase (local demo) the admin screen falls back to the localStorage list in adminStore.
 */
import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { collection, doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc, type Timestamp } from "firebase/firestore";
import { firebaseDb } from "./firebase";
import { isAdminEmail } from "./adminStore";

export type MemberType = "일반회원" | "사업자회원";
export type MemberRole = "admin" | "member";
export type MemberStatus = "active" | "suspended";

export interface MemberRecord {
  uid: string;
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  provider?: string;
  memberType?: MemberType;
  role?: MemberRole;
  status?: MemberStatus;
  createdAt?: Timestamp | null;
  lastLoginAt?: Timestamp | null;
  suspendedReason?: string;
}

export const isSuperAdmin = (email?: string | null) => isAdminEmail(email ?? undefined);

/** Live record of one member (null while loading / when there is none). */
export function useMemberRecord(uid: string | null | undefined): { record: MemberRecord | null; loading: boolean } {
  const [state, setState] = useState<{ record: MemberRecord | null; loading: boolean }>({ record: null, loading: Boolean(uid && firebaseDb) });
  useEffect(() => {
    if (!uid || !firebaseDb) {
      setState({ record: null, loading: false });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    return onSnapshot(
      doc(firebaseDb, "members", uid),
      (snap) => setState({ record: snap.exists() ? ({ uid, ...snap.data() } as MemberRecord) : null, loading: false }),
      () => setState({ record: null, loading: false }),
    );
  }, [uid]);
  return state;
}

/** Set while the signup page creates the member record itself, so sign-in sync doesn't race it. */
let signupInProgress = false;
export function markSignupInProgress(value: boolean) {
  signupInProgress = value;
}

/**
 * Keep the signed-in member's own name/email/last login current. Members who signed up before
 * records existed (or via Google) get a record on their next sign-in, as 일반회원.
 */
export async function syncMemberProfile(user: User): Promise<void> {
  if (!firebaseDb) return;
  const ref = doc(firebaseDb, "members", user.uid);
  const name = (user.displayName || user.email?.split("@")[0] || "").slice(0, 80);
  const email = user.email ?? "";
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    if (signupInProgress) return; // Signup.tsx writes the full record (memberType, company…)
    const provider = user.providerData.some((p) => p.providerId === "google.com") ? "Google" : "이메일";
    await setDoc(ref, { memberType: "일반회원", name, email, provider, createdAt: serverTimestamp(), lastLoginAt: serverTimestamp() });
    return;
  }
  await updateDoc(ref, { name: snap.data().name || name, email, lastLoginAt: serverTimestamp() });
}

/** All member records, live (admins only — firestore.rules). */
export function useAllMembers(enabled: boolean): { members: MemberRecord[]; loading: boolean; error: string } {
  const [state, setState] = useState<{ members: MemberRecord[]; loading: boolean; error: string }>({ members: [], loading: enabled, error: "" });
  useEffect(() => {
    if (!enabled || !firebaseDb) {
      setState({ members: [], loading: false, error: "" });
      return;
    }
    return onSnapshot(
      collection(firebaseDb, "members"),
      (snap) => setState({ members: snap.docs.map((d) => ({ uid: d.id, ...d.data() }) as MemberRecord), loading: false, error: "" }),
      (err) => setState({ members: [], loading: false, error: err.message.includes("permission") ? "회원 목록을 볼 권한이 없습니다. Firestore 규칙 배포가 필요할 수 있습니다." : err.message }),
    );
  }, [enabled]);
  return state;
}

/** Admin edit of the fields members can't change themselves. */
export async function updateMemberByAdmin(
  uid: string,
  patch: Partial<Pick<MemberRecord, "memberType" | "role" | "status" | "suspendedReason" | "company" | "phone" | "name">>,
): Promise<void> {
  if (!firebaseDb) throw new Error("Firebase가 설정되지 않았습니다.");
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  await updateDoc(doc(firebaseDb, "members", uid), { ...clean, updatedAt: serverTimestamp() });
}
