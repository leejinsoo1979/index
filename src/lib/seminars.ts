/**
 * Seminars + applications — shared by the public pages, My Page and the admin screens.
 *
 * With Firebase configured, seminars live in Firestore `seminars/{id}` and are read
 * through realtime listeners, so anything an admin publishes shows up immediately on
 * the list/calendar pages. Members apply via `seminarApplications/{seminarId}__{uid}`;
 * the seat counter (`seminars/{id}.enrolled`) changes in the same transaction, and
 * firestore.rules only allow that together with the member's own application.
 *
 * Payment is not attached yet: applications carry the price at the time of applying
 * and `paymentStatus: "UNPAID"` so a payment step can be added later.
 *
 * Without Firebase (local demo) the same API is backed by localStorage.
 */
import { useEffect, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { firebaseDb, firebaseStorage, isFirebaseConfigured } from "./firebase";
import { pastSeminars, upcomingSeminars } from "../data/seminars";

export type SeminarLevel = "기초" | "심화";
/** Status chosen by the admin. "완료" is also applied automatically once the date passes. */
export type SeminarStatus = "예정" | "접수중" | "완료";

export interface Seminar {
  id: string;
  title: string;
  level: SeminarLevel;
  status: SeminarStatus;
  /** ISO date "2026-08-04" */
  date: string;
  timeStart?: string;
  timeEnd?: string;
  /** ISO date; applications close after this day */
  applyDeadline?: string;
  location: string;
  venue?: string;
  address?: string;
  capacity: number;
  /** Paid seats — maintained by the payment server, never by the admin form. */
  enrolled: number;
  price: number;
  instructor?: string;
  description?: string;
  image: string;
  gallery: string[];
  published: boolean;
  createdAt: number;
  updatedAt: number;
}

export type SeminarInput = Omit<Seminar, "id" | "enrolled" | "createdAt" | "updatedAt">;

/** APPLIED = 신청(접수 대기), CONFIRMED = 접수 확정, CANCELED = 취소. Seats count APPLIED + CONFIRMED. */
export type ApplicationStatus = "APPLIED" | "CONFIRMED" | "CANCELED";

export type Applicant = { name: string; email: string; phone?: string; affiliation?: string; motivation?: string };

export interface SeminarApplication {
  /** `${seminarId}__${uid}` — one application per member per seminar */
  id: string;
  seminarId: string;
  seminarTitle: string;
  seminarDate: string;
  uid: string;
  applicant: Applicant;
  /** Price when applied (payment to be attached later). */
  amount: number;
  paymentStatus: "UNPAID";
  status: ApplicationStatus;
  canceledBy?: "member" | "admin";
  cancelReason?: string;
  createdAt: number;
  updatedAt: number;
}

export const APPLICATION_STATUS_LABEL: Record<ApplicationStatus, string> = {
  APPLIED: "신청완료",
  CONFIRMED: "접수확정",
  CANCELED: "취소",
};

export const applicationId = (seminarId: string, uid: string) => `${seminarId}__${uid}`;
export const holdsSeat = (status: ApplicationStatus) => status === "APPLIED" || status === "CONFIRMED";

// ── display helpers ───────────────────────────────────────────────────────────
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export function todayIso(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** "2026-08-04" → "2026.08.04 (화)" */
export function formatSeminarDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${iso.replaceAll("-", ".")} (${WEEKDAYS[d.getDay()]})`;
}

export function formatTimeRange(s: Pick<Seminar, "timeStart" | "timeEnd">): string | null {
  if (s.timeStart && s.timeEnd) return `${s.timeStart} ~ ${s.timeEnd}`;
  return s.timeStart ?? null;
}

export const formatWon = (n: number) => (n === 0 ? "무료" : `${n.toLocaleString("ko-KR")}원`);

/** Status shown to users: past seminars are always "완료". */
export function effectiveStatus(s: Pick<Seminar, "status" | "date">, now = new Date()): SeminarStatus {
  return s.date < todayIso(now) ? "완료" : s.status;
}

export type ApplyState = { open: true } | { open: false; reason: string };

/** Same rules the payment server enforces. */
export function applyState(s: Seminar, now = new Date()): ApplyState {
  const status = effectiveStatus(s, now);
  if (status === "완료") return { open: false, reason: "종료된 세미나입니다." };
  if (status !== "접수중") return { open: false, reason: "아직 접수 기간이 아닙니다." };
  if (s.applyDeadline && todayIso(now) > s.applyDeadline) return { open: false, reason: "접수가 마감되었습니다." };
  if (s.enrolled >= s.capacity) return { open: false, reason: "정원이 마감되었습니다." };
  return { open: true };
}

const bySchedule = (a: Seminar, b: Seminar) =>
  a.date === b.date ? (a.timeStart ?? "").localeCompare(b.timeStart ?? "") : a.date.localeCompare(b.date);

// ── legacy data (static site seminars) ───────────────────────────────────────
function dotToIso(dot: string): string {
  const m = dot.match(/(\d{4})[.-](\d{2})[.-](\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : dot;
}

/** The seminars that used to be hard-coded in src/data/seminars.ts, as documents. */
export function legacySeminars(now = Date.now()): Seminar[] {
  const base = { timeStart: "14:00", timeEnd: "17:00", gallery: [], published: true, createdAt: now, updatedAt: now };
  return [
    ...upcomingSeminars.map((s) => ({
      ...base,
      id: `legacy-${s.id}`,
      title: s.title,
      level: s.level,
      status: s.status,
      date: dotToIso(s.date),
      location: s.location,
      capacity: s.capacity,
      // The old hard-coded counts weren't real applicants; seats now come from applications.
      enrolled: 0,
      price: s.level === "심화" ? 88000 : 66000,
      image: s.image,
    })),
    ...pastSeminars.map((s) => ({
      ...base,
      id: `legacy-${s.id}`,
      title: s.title,
      level: s.level,
      status: "완료" as const,
      date: dotToIso(s.date),
      location: s.location,
      capacity: 40,
      enrolled: 0,
      price: s.level === "심화" ? 88000 : 66000,
      image: s.image,
    })),
  ];
}

// ── local fallback (no Firebase) ──────────────────────────────────────────────
const LOCAL_SEMINARS = "index-seminars-v1";
const LOCAL_APPLICATIONS = "index-seminar-applications-v1";
const localListeners = new Set<() => void>();

function readLocal<T>(key: string, seed: () => T[]): T[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T[];
  } catch {
    // fall through
  }
  const rows = seed();
  writeLocal(key, rows, false);
  return rows;
}

function writeLocal<T>(key: string, rows: T[], notify = true) {
  try {
    window.localStorage.setItem(key, JSON.stringify(rows));
  } catch (error) {
    throw new Error(`브라우저 저장 공간이 부족합니다: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (notify) localListeners.forEach((fn) => fn());
}

const localSeminars = () => readLocal<Seminar>(LOCAL_SEMINARS, () => legacySeminars());
const localApplications = () => readLocal<SeminarApplication>(LOCAL_APPLICATIONS, () => []);
const saveLocalSeminars = (rows: Seminar[]) => writeLocal(LOCAL_SEMINARS, rows);
const saveLocalApplications = (rows: SeminarApplication[]) => writeLocal(LOCAL_APPLICATIONS, rows);

function subscribeLocal(fn: () => void) {
  localListeners.add(fn);
  const onStorage = (e: StorageEvent) => {
    if (e.key === LOCAL_SEMINARS || e.key === LOCAL_APPLICATIONS) fn();
  };
  window.addEventListener("storage", onStorage);
  fn();
  return () => {
    localListeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
}

const firestoreEnabled = () => Boolean(isFirebaseConfigured && firebaseDb);

// ── realtime reads ────────────────────────────────────────────────────────────
type Live<T> = { data: T; loading: boolean; error: string | null };

function normalizeSeminar(id: string, raw: Record<string, unknown>): Seminar {
  return {
    id,
    title: String(raw.title ?? ""),
    level: raw.level === "심화" ? "심화" : "기초",
    status: (["예정", "접수중", "완료"].includes(raw.status as string) ? raw.status : "예정") as SeminarStatus,
    date: String(raw.date ?? ""),
    timeStart: (raw.timeStart as string) || undefined,
    timeEnd: (raw.timeEnd as string) || undefined,
    applyDeadline: (raw.applyDeadline as string) || undefined,
    location: String(raw.location ?? ""),
    venue: (raw.venue as string) || undefined,
    address: (raw.address as string) || undefined,
    capacity: Number(raw.capacity ?? 0),
    enrolled: Number(raw.enrolled ?? 0),
    price: Number(raw.price ?? 0),
    instructor: (raw.instructor as string) || undefined,
    description: (raw.description as string) || undefined,
    image: String(raw.image ?? ""),
    gallery: Array.isArray(raw.gallery) ? (raw.gallery as string[]) : [],
    published: raw.published !== false,
    createdAt: Number(raw.createdAt ?? 0),
    updatedAt: Number(raw.updatedAt ?? 0),
  };
}

/**
 * Live seminar list. Public pages see published seminars only; the admin screen
 * passes `includeUnpublished` (Firestore rules let only admins read drafts).
 */
export function useSeminars(options: { includeUnpublished?: boolean } = {}): Live<Seminar[]> {
  const { includeUnpublished = false } = options;
  const [state, setState] = useState<Live<Seminar[]>>({ data: [], loading: true, error: null });

  useEffect(() => {
    if (!firestoreEnabled()) {
      return subscribeLocal(() => {
        const rows = localSeminars().filter((s) => includeUnpublished || s.published);
        setState({ data: [...rows].sort(bySchedule), loading: false, error: null });
      });
    }
    const col = collection(firebaseDb!, "seminars");
    const q = includeUnpublished ? col : query(col, where("published", "==", true));
    return onSnapshot(
      q,
      (snap) =>
        setState({
          data: snap.docs.map((d) => normalizeSeminar(d.id, d.data())).sort(bySchedule),
          loading: false,
          error: null,
        }),
      (error) => setState((s) => ({ ...s, loading: false, error: error.message })),
    );
  }, [includeUnpublished]);

  return state;
}

export function useSeminar(id: string | undefined): Live<Seminar | null> {
  const [state, setState] = useState<Live<Seminar | null>>({ data: null, loading: true, error: null });

  useEffect(() => {
    if (!id) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    // Old site links used the static numeric ids (/seminars/1) → imported as "legacy-1".
    const docId = /^\d+$/.test(id) ? `legacy-${id}` : id;
    if (!firestoreEnabled()) {
      return subscribeLocal(() => {
        const found = localSeminars().find((s) => s.id === docId) ?? null;
        setState({ data: found, loading: false, error: null });
      });
    }
    return onSnapshot(
      doc(firebaseDb!, "seminars", docId),
      (snap) =>
        setState({
          data: snap.exists() ? normalizeSeminar(snap.id, snap.data()) : null,
          loading: false,
          error: null,
        }),
      // Unpublished seminars are unreadable for visitors → treat as not found.
      () => setState({ data: null, loading: false, error: null }),
    );
  }, [id]);

  return state;
}

/** Live applications: all of them for admins, or only the signed-in member's own. */
export function useSeminarApplications(scope: { all: true } | { uid: string | null }): Live<SeminarApplication[]> {
  const [state, setState] = useState<Live<SeminarApplication[]>>({ data: [], loading: true, error: null });
  const key = "all" in scope ? "*" : (scope.uid ?? "");

  useEffect(() => {
    if (!key) {
      setState({ data: [], loading: false, error: null });
      return;
    }
    const sort = (rows: SeminarApplication[]) => [...rows].sort((a, b) => b.createdAt - a.createdAt);
    if (!firestoreEnabled()) {
      return subscribeLocal(() => {
        const rows = localApplications().filter((a) => key === "*" || a.uid === key);
        setState({ data: sort(rows), loading: false, error: null });
      });
    }
    const col = collection(firebaseDb!, "seminarApplications");
    // No orderBy in the member query: uid + createdAt would need a composite index.
    const q = key === "*" ? col : query(col, where("uid", "==", key));
    return onSnapshot(
      q,
      (snap) =>
        setState({
          data: sort(snap.docs.map((d) => ({ ...(d.data() as Omit<SeminarApplication, "id">), id: d.id }))),
          loading: false,
          error: null,
        }),
      (error) => setState((s) => ({ ...s, loading: false, error: error.message })),
    );
  }, [key]);

  return state;
}

// ── member actions ────────────────────────────────────────────────────────────
export class ApplyError extends Error {}

function cleanApplicant(a: Applicant): Applicant {
  const out: Applicant = { name: a.name.trim(), email: a.email.trim() };
  if (a.phone?.trim()) out.phone = a.phone.trim();
  if (a.affiliation?.trim()) out.affiliation = a.affiliation.trim();
  if (a.motivation?.trim()) out.motivation = a.motivation.trim();
  return out;
}

/**
 * Apply to a seminar (members only). Takes a seat in the same transaction; a member
 * who cancelled before may apply again.
 */
export async function applyToSeminar(seminarId: string, uid: string, applicant: Applicant): Promise<string> {
  const id = applicationId(seminarId, uid);
  const now = Date.now();
  const person = cleanApplicant(applicant);
  if (!person.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(person.email)) {
    throw new ApplyError("이름과 올바른 이메일을 입력해 주세요.");
  }
  const build = (s: Seminar): SeminarApplication => ({
    id,
    seminarId,
    seminarTitle: s.title,
    seminarDate: s.date,
    uid,
    applicant: person,
    amount: s.price,
    paymentStatus: "UNPAID",
    status: "APPLIED",
    createdAt: now,
    updatedAt: now,
  });
  const check = (s: Seminar | null, existing: SeminarApplication | null) => {
    if (!s || !s.published) throw new ApplyError("세미나를 찾을 수 없습니다.");
    const state = applyState(s);
    if (!state.open) throw new ApplyError(state.reason);
    if (existing && holdsSeat(existing.status)) throw new ApplyError("이미 신청한 세미나입니다. 마이페이지에서 확인해 주세요.");
  };

  if (!firestoreEnabled()) {
    const seminars = localSeminars();
    const s = seminars.find((x) => x.id === seminarId) ?? null;
    const apps = localApplications();
    const existing = apps.find((a) => a.id === id) ?? null;
    check(s, existing);
    const { id: _ignored, ...record } = build(s!);
    saveLocalApplications([{ id, ...record }, ...apps.filter((a) => a.id !== id)]);
    saveLocalSeminars(seminars.map((x) => (x.id === seminarId ? { ...x, enrolled: x.enrolled + 1 } : x)));
    return id;
  }

  const semRef = doc(firebaseDb!, "seminars", seminarId);
  const appRef = doc(firebaseDb!, "seminarApplications", id);
  try {
    await runTransaction(firebaseDb!, async (tx) => {
      const semSnap = await tx.get(semRef);
      const appSnap = await tx.get(appRef);
      const s = semSnap.exists() ? normalizeSeminar(semSnap.id, semSnap.data()) : null;
      const existing = appSnap.exists() ? ({ ...appSnap.data(), id } as SeminarApplication) : null;
      check(s, existing);
      const { id: _ignored, ...record } = build(s!);
      // Re-applying keeps the original createdAt for history.
      tx.set(appRef, existing ? { ...record, createdAt: existing.createdAt } : record);
      tx.update(semRef, { enrolled: s!.enrolled + 1 });
    });
  } catch (error) {
    if (error instanceof ApplyError) throw error;
    const code = (error as { code?: string }).code;
    if (code === "permission-denied") throw new ApplyError("신청할 수 없습니다. 정원 또는 접수 상태를 확인해 주세요.");
    throw error;
  }
  return id;
}

/** Cancel an application (member: own; admin: any). Releases the seat. */
export async function cancelApplication(id: string, by: "member" | "admin", reason?: string) {
  const patch = {
    status: "CANCELED" as const,
    canceledBy: by,
    ...(reason ? { cancelReason: reason } : {}),
    updatedAt: Date.now(),
  };
  if (!firestoreEnabled()) {
    const apps = localApplications();
    const app = apps.find((a) => a.id === id);
    if (!app || !holdsSeat(app.status)) throw new ApplyError("취소할 수 있는 신청이 아닙니다.");
    saveLocalApplications(apps.map((a) => (a.id === id ? { ...a, ...patch } : a)));
    saveLocalSeminars(
      localSeminars().map((s) => (s.id === app.seminarId ? { ...s, enrolled: Math.max(0, s.enrolled - 1) } : s)),
    );
    return;
  }
  const appRef = doc(firebaseDb!, "seminarApplications", id);
  await runTransaction(firebaseDb!, async (tx) => {
    const appSnap = await tx.get(appRef);
    const app = appSnap.data() as SeminarApplication | undefined;
    if (!app || !holdsSeat(app.status)) throw new ApplyError("취소할 수 있는 신청이 아닙니다.");
    const semRef = doc(firebaseDb!, "seminars", app.seminarId);
    const semSnap = await tx.get(semRef);
    tx.update(appRef, patch);
    if (semSnap.exists()) tx.update(semRef, { enrolled: Math.max(0, Number(semSnap.data().enrolled ?? 0) - 1) });
  });
}

/** Admin: APPLIED ⇄ CONFIRMED (no seat change). */
export async function setApplicationConfirmed(id: string, confirmed: boolean) {
  const status: ApplicationStatus = confirmed ? "CONFIRMED" : "APPLIED";
  if (!firestoreEnabled()) {
    saveLocalApplications(localApplications().map((a) => (a.id === id ? { ...a, status, updatedAt: Date.now() } : a)));
    return;
  }
  await updateDoc(doc(firebaseDb!, "seminarApplications", id), { status, updatedAt: Date.now() });
}

// ── admin writes ──────────────────────────────────────────────────────────────
function clean<T extends Record<string, unknown>>(obj: T): T {
  // Firestore rejects `undefined` values.
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

/** Create or update a seminar. `enrolled` is never touched here (server-managed). */
export async function saveSeminar(input: SeminarInput, id?: string): Promise<string> {
  const now = Date.now();
  if (!firestoreEnabled()) {
    const rows = localSeminars();
    if (id) {
      saveLocalSeminars(rows.map((s) => (s.id === id ? { ...s, ...input, id, updatedAt: now } : s)));
      return id;
    }
    const newId = `sem-${now.toString(36)}`;
    saveLocalSeminars([...rows, { ...input, id: newId, enrolled: 0, createdAt: now, updatedAt: now }]);
    return newId;
  }
  if (id) {
    await updateDoc(doc(firebaseDb!, "seminars", id), clean({ ...input, updatedAt: now }) as Record<string, unknown>);
    return id;
  }
  const ref_ = doc(collection(firebaseDb!, "seminars"));
  await setDoc(ref_, clean({ ...input, enrolled: 0, createdAt: now, updatedAt: now }));
  return ref_.id;
}

export async function setSeminarFields(id: string, fields: Partial<Pick<Seminar, "status" | "published">>) {
  if (!firestoreEnabled()) {
    saveLocalSeminars(localSeminars().map((s) => (s.id === id ? { ...s, ...fields, updatedAt: Date.now() } : s)));
    return;
  }
  await updateDoc(doc(firebaseDb!, "seminars", id), { ...fields, updatedAt: Date.now() });
}

export async function deleteSeminar(id: string) {
  if (!firestoreEnabled()) {
    saveLocalSeminars(localSeminars().filter((s) => s.id !== id));
    return;
  }
  await deleteDoc(doc(firebaseDb!, "seminars", id));
}

/** One-time import of the seminars that used to be hard-coded in the site. */
export async function importLegacySeminars(): Promise<number> {
  const rows = legacySeminars();
  if (!firestoreEnabled()) {
    const existing = new Set(localSeminars().map((s) => s.id));
    saveLocalSeminars([...localSeminars(), ...rows.filter((s) => !existing.has(s.id))]);
    return rows.length;
  }
  const batch = writeBatch(firebaseDb!);
  for (const { id, ...data } of rows) batch.set(doc(firebaseDb!, "seminars", id), data, { merge: true });
  await batch.commit();
  return rows.length;
}

/** Resize to JPEG and upload; returns a URL to store on the seminar. */
export async function uploadSeminarImage(file: File, maxSize = 1600): Promise<string> {
  const blob = await resizeImage(file, maxSize);
  if (!firestoreEnabled() || !firebaseStorage) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("이미지를 읽을 수 없습니다."));
      reader.readAsDataURL(blob);
    });
  }
  const path = `seminars/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const target = ref(firebaseStorage, path);
  await uploadBytes(target, blob, { contentType: "image/jpeg" });
  return getDownloadURL(target);
}

function resizeImage(file: File, maxSize: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      URL.revokeObjectURL(url);
      if (!ctx) return reject(new Error("canvas context unavailable"));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("이미지를 변환할 수 없습니다."))), "image/jpeg", 0.82);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("이미지를 읽을 수 없습니다."));
    };
    img.src = url;
  });
}
