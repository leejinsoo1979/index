/**
 * 커리큘럼 빌더 데이터 — 강의 모듈 라이브러리와 관리자가 구성한 과정(커리큘럼).
 *
 * Firebase가 있으면 Firestore `curriculumModules/{id}`, `curricula/{id}` 에 저장하고
 * 실시간 리스너로 읽는다. 게시(published)된 과정만 일반 사용자가 읽을 수 있다(firestore.rules).
 * Firebase가 없으면(로컬 데모) 같은 API를 localStorage로 처리하며, 모듈은 기본 목록으로 시드한다.
 *
 * 과정은 모듈을 id로만 참조한다. 모듈이 삭제되면 과정 화면에 "삭제된 모듈"로 표시된다.
 */
import { useEffect, useState } from "react";
import { collection, deleteDoc, doc, onSnapshot, query, setDoc, where, writeBatch } from "firebase/firestore";
import { firebaseDb, isFirebaseConfigured } from "./firebase";
import { SEED_MODULES, type CurriculumModule, type ModuleLevel } from "../data/curriculumModules";

export type { CurriculumModule, ModuleLevel } from "../data/curriculumModules";

export type CurriculumStatus = "draft" | "published";

export interface CurriculumItem {
  moduleId: string;
  /** 이 과정에서만 쓰는 메모 (예: "우리 회사 견적서로 실습") */
  note?: string;
}

export interface CurriculumDay {
  id: string;
  /** 일차 주제 (비우면 "N일차"만 표시) */
  theme?: string;
  items: CurriculumItem[];
}

export interface Curriculum {
  id: string;
  title: string;
  summary: string;
  audience: string;
  days: CurriculumDay[];
  status: CurriculumStatus;
  createdAt: number;
  updatedAt: number;
}

export type CurriculumInput = Omit<Curriculum, "id" | "createdAt" | "updatedAt">;

type Live<T> = { data: T; loading: boolean; error: string | null };

const firestoreEnabled = () => Boolean(isFirebaseConfigured && firebaseDb);

export const newDayId = () => `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

// ── normalize ────────────────────────────────────────────────────────────────
const LEVELS: ModuleLevel[] = ["기초", "응용", "심화"];

function normalizeModule(id: string, raw: Record<string, unknown>): CurriculumModule {
  return {
    id,
    category: String(raw.category ?? "ai"),
    level: (LEVELS.includes(raw.level as ModuleLevel) ? raw.level : "기초") as ModuleLevel,
    title: String(raw.title ?? ""),
    summary: String(raw.summary ?? ""),
    minutes: Number(raw.minutes ?? 60) || 60,
    objectives: Array.isArray(raw.objectives) ? (raw.objectives as unknown[]).map(String) : [],
    practice: String(raw.practice ?? ""),
    deliverable: String(raw.deliverable ?? ""),
    audience: String(raw.audience ?? ""),
    caution: (raw.caution as string) || undefined,
  };
}

function normalizeCurriculum(id: string, raw: Record<string, unknown>): Curriculum {
  const days = Array.isArray(raw.days) ? (raw.days as Record<string, unknown>[]) : [];
  return {
    id,
    title: String(raw.title ?? ""),
    summary: String(raw.summary ?? ""),
    audience: String(raw.audience ?? ""),
    status: raw.status === "published" ? "published" : "draft",
    days: days.map((d, i) => ({
      id: String(d.id ?? `d-${i}`),
      theme: (d.theme as string) || undefined,
      items: Array.isArray(d.items)
        ? (d.items as Record<string, unknown>[]).map((it) => ({
            moduleId: String(it.moduleId ?? ""),
            note: (it.note as string) || undefined,
          }))
        : [],
    })),
    createdAt: Number(raw.createdAt ?? 0),
    updatedAt: Number(raw.updatedAt ?? 0),
  };
}

/** Firestore는 undefined 값을 거부하므로 저장 전에 제거한다. */
function clean<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const byModuleId = (a: CurriculumModule, b: CurriculumModule) =>
  a.id.localeCompare(b.id, "en", { numeric: true });
const byUpdated = (a: Curriculum, b: Curriculum) => b.updatedAt - a.updatedAt;

// ── local fallback (no Firebase) ─────────────────────────────────────────────
const LOCAL_MODULES = "index-curriculum-modules-v1";
const LOCAL_CURRICULA = "index-curricula-v1";
const localListeners = new Set<() => void>();

function readLocal<T>(key: string, seed: () => T[]): T[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T[];
  } catch {
    // fall through to the seed
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

const localModules = () => readLocal<CurriculumModule>(LOCAL_MODULES, () => SEED_MODULES);
const localCurricula = () => readLocal<Curriculum>(LOCAL_CURRICULA, () => []);

function subscribeLocal(fn: () => void) {
  localListeners.add(fn);
  const onStorage = (e: StorageEvent) => {
    if (e.key === LOCAL_MODULES || e.key === LOCAL_CURRICULA) fn();
  };
  window.addEventListener("storage", onStorage);
  fn();
  return () => {
    localListeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
}

// ── modules ──────────────────────────────────────────────────────────────────
export function useCurriculumModules(): Live<CurriculumModule[]> {
  const [state, setState] = useState<Live<CurriculumModule[]>>({ data: [], loading: true, error: null });

  useEffect(() => {
    if (!firestoreEnabled()) {
      return subscribeLocal(() =>
        setState({ data: [...localModules()].sort(byModuleId), loading: false, error: null }),
      );
    }
    return onSnapshot(
      collection(firebaseDb!, "curriculumModules"),
      (snap) =>
        setState({
          data: snap.docs.map((d) => normalizeModule(d.id, d.data())).sort(byModuleId),
          loading: false,
          error: null,
        }),
      (error) => setState((s) => ({ ...s, loading: false, error: error.message })),
    );
  }, []);

  return state;
}

/** 모듈 저장. id(코드)가 곧 문서 id라서, 코드를 바꾸면 이전 id 문서를 지우고 새로 만든다. */
export async function saveCurriculumModule(module: CurriculumModule, previousId?: string) {
  const id = module.id.trim();
  if (!id) throw new Error("모듈 코드를 입력하세요.");
  const row = { ...module, id };
  if (!firestoreEnabled()) {
    const rows = localModules().filter((m) => m.id !== previousId && m.id !== id);
    writeLocal(LOCAL_MODULES, [...rows, row]);
    return;
  }
  const { id: _omit, ...data } = row;
  await setDoc(doc(firebaseDb!, "curriculumModules", id), clean(data));
  if (previousId && previousId !== id) await deleteDoc(doc(firebaseDb!, "curriculumModules", previousId));
}

export async function deleteCurriculumModule(id: string) {
  if (!firestoreEnabled()) {
    writeLocal(LOCAL_MODULES, localModules().filter((m) => m.id !== id));
    return;
  }
  await deleteDoc(doc(firebaseDb!, "curriculumModules", id));
}

/** 기본 모듈 라이브러리를 한 번에 옮겨 담는다. 같은 코드가 이미 있으면 건너뛴다. */
export async function importSeedModules(existingIds: Set<string>): Promise<number> {
  const rows = SEED_MODULES.filter((m) => !existingIds.has(m.id));
  if (rows.length === 0) return 0;
  if (!firestoreEnabled()) {
    writeLocal(LOCAL_MODULES, [...localModules(), ...rows]);
    return rows.length;
  }
  const batch = writeBatch(firebaseDb!);
  for (const { id, ...data } of rows) batch.set(doc(firebaseDb!, "curriculumModules", id), clean(data));
  await batch.commit();
  return rows.length;
}

// ── curricula ────────────────────────────────────────────────────────────────
/** 관리자 화면은 `includeDrafts`로 초안까지 읽는다. 일반 화면은 게시된 과정만 읽는다. */
export function useCurricula(options: { includeDrafts?: boolean } = {}): Live<Curriculum[]> {
  const { includeDrafts = false } = options;
  const [state, setState] = useState<Live<Curriculum[]>>({ data: [], loading: true, error: null });

  useEffect(() => {
    if (!firestoreEnabled()) {
      return subscribeLocal(() => {
        const rows = localCurricula().filter((c) => includeDrafts || c.status === "published");
        setState({ data: [...rows].sort(byUpdated), loading: false, error: null });
      });
    }
    const col = collection(firebaseDb!, "curricula");
    const q = includeDrafts ? col : query(col, where("status", "==", "published"));
    return onSnapshot(
      q,
      (snap) =>
        setState({
          data: snap.docs.map((d) => normalizeCurriculum(d.id, d.data())).sort(byUpdated),
          loading: false,
          error: null,
        }),
      (error) => setState((s) => ({ ...s, loading: false, error: error.message })),
    );
  }, [includeDrafts]);

  return state;
}

/** 과정 저장. id가 없으면 새로 만들고 새 id를 돌려준다. */
export async function saveCurriculum(input: CurriculumInput, id?: string, createdAt?: number): Promise<string> {
  const now = Date.now();
  if (!firestoreEnabled()) {
    const rows = localCurricula();
    const newId = id ?? `cur-${now.toString(36)}`;
    const row: Curriculum = { ...input, id: newId, createdAt: createdAt ?? now, updatedAt: now };
    writeLocal(LOCAL_CURRICULA, [...rows.filter((c) => c.id !== newId), row]);
    return newId;
  }
  const ref_ = id ? doc(firebaseDb!, "curricula", id) : doc(collection(firebaseDb!, "curricula"));
  await setDoc(ref_, clean({ ...input, createdAt: createdAt ?? now, updatedAt: now }));
  return ref_.id;
}

export async function deleteCurriculum(id: string) {
  if (!firestoreEnabled()) {
    writeLocal(LOCAL_CURRICULA, localCurricula().filter((c) => c.id !== id));
    return;
  }
  await deleteDoc(doc(firebaseDb!, "curricula", id));
}

// ── helpers ──────────────────────────────────────────────────────────────────
export function formatMinutes(total: number): string {
  if (total <= 0) return "0분";
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}분`;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

/** 과정을 공유용 텍스트로 만든다 (구성안 복사). */
export function curriculumToText(
  c: Pick<Curriculum, "title" | "summary" | "audience" | "days">,
  modules: Map<string, CurriculumModule>,
): string {
  const lines: string[] = [];
  lines.push(`# ${c.title || "제목 없는 과정"}`);
  if (c.summary) lines.push(c.summary);
  if (c.audience) lines.push(`대상: ${c.audience}`);
  const total = c.days.flatMap((d) => d.items).reduce((sum, it) => sum + (modules.get(it.moduleId)?.minutes ?? 0), 0);
  lines.push(`구성: ${c.days.length}일 · 모듈 ${c.days.reduce((n, d) => n + d.items.length, 0)}개 · 총 ${formatMinutes(total)}`);
  c.days.forEach((day, i) => {
    const dayMin = day.items.reduce((sum, it) => sum + (modules.get(it.moduleId)?.minutes ?? 0), 0);
    lines.push("", `## ${i + 1}일차${day.theme ? ` — ${day.theme}` : ""} (${formatMinutes(dayMin)})`);
    day.items.forEach((it, j) => {
      const m = modules.get(it.moduleId);
      if (!m) {
        lines.push(`${j + 1}. [삭제된 모듈 ${it.moduleId}]`);
        return;
      }
      lines.push(`${j + 1}. [${m.id}] ${m.title} (${m.level} · ${m.minutes}분)`);
      if (m.deliverable) lines.push(`   - 산출물: ${m.deliverable}`);
      if (it.note) lines.push(`   - 메모: ${it.note}`);
    });
  });
  return lines.join("\n");
}
