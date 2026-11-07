/**
 * Admin data store — localStorage-backed demo persistence.
 * Seeds from the static site data on first run; every mutation in the
 * admin screens is saved so edits survive reloads. Swap the load/save
 * helpers for real API calls when a backend lands.
 */
import { cases } from "../data/cases";

export interface AdminPost {
  id: number;
  title: string;
  group: string;
  category: string;
  date: string;
  views: number;
  visible: boolean;
}

export interface AdminMember {
  id: number;
  name: string;
  email: string;
  joined: string;
  role: "관리자" | "일반";
  status: "활성" | "정지";
  provider: "Google" | "이메일";
  /** 가입 시 선택한 회원 유형 (회원가입 페이지와 연동) */
  memberType?: "일반회원" | "사업자회원";
  phone?: string;
  company?: string;
}

/* v2: 가짜 시드(회원/결제) 제거 — 실제 가입·신청 데이터로 채워짐 */
const PREFIX = "index-admin-v2";

function load<T>(key: string, seed: () => T[]): T[] {
  try {
    const saved = window.localStorage.getItem(`${PREFIX}:${key}`);
    if (saved) {
      const parsed = JSON.parse(saved) as T[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // fall through to seed
  }
  return seed();
}

function save<T>(key: string, rows: T[]) {
  window.localStorage.setItem(`${PREFIX}:${key}`, JSON.stringify(rows));
}

/* ── Posts (게시판) ── */
export function loadPosts(): AdminPost[] {
  return load("posts", () =>
    cases.map((item) => ({
      id: item.id,
      title: item.title,
      group: item.group,
      category: item.category,
      date: item.date,
      views: item.views ?? 0,
      visible: true,
    })),
  );
}
export const savePosts = (rows: AdminPost[]) => save("posts", rows);

function today() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}.${mm}.${dd}`;
}

function nextId(rows: { id: number }[]) {
  return rows.reduce((max, r) => Math.max(max, r.id), 0) + 1;
}

/* ── Members (회원) ── */
const MEMBER_SEED: AdminMember[] = [
  { id: 1, name: "이진수", email: "sbbc212@gmail.com", joined: "2026.06.02", role: "관리자", status: "활성", provider: "Google" },
];

/**
 * 회원 목록 — 관리자 계정 시드에 더해, 회원가입 페이지가 남긴
 * `index-member-profile:*` 프로필을 자동 병합한다 (실가입 연동).
 */
export function loadMembers(): AdminMember[] {
  const rows = load("members", () => MEMBER_SEED);
  const known = new Set(rows.map((m) => m.email.toLowerCase()));
  let changed = false;

  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (!key?.startsWith("index-member-profile:")) continue;
    const email = key.slice("index-member-profile:".length);
    if (known.has(email)) continue;
    try {
      const profile = JSON.parse(window.localStorage.getItem(key) ?? "{}") as {
        memberType?: string;
        userId?: string;
        phone?: string;
        company?: string;
        agreedAt?: string;
      };
      rows.push({
        id: nextId(rows),
        name: profile.userId || email.split("@")[0],
        email,
        joined: profile.agreedAt ? profile.agreedAt.slice(0, 10).replaceAll("-", ".") : today(),
        role: "일반",
        status: "활성",
        provider: "이메일",
        memberType: profile.memberType === "association" ? "사업자회원" : "일반회원",
        phone: profile.phone,
        company: profile.company,
      });
      known.add(email);
      changed = true;
    } catch {
      // skip malformed profile
    }
  }

  if (changed) save("members", rows);
  return rows;
}
export const saveMembers = (rows: AdminMember[]) => save("members", rows);

/** 회원가입 성공 직후 호출 — 관리자 회원 목록에 즉시 등록 */
export function registerMember(input: {
  name: string;
  email: string;
  provider: AdminMember["provider"];
  memberType?: AdminMember["memberType"];
  phone?: string;
  company?: string;
}) {
  const rows = loadMembers();
  if (rows.some((m) => m.email.toLowerCase() === input.email.toLowerCase()))
    return;
  rows.push({
    id: nextId(rows),
    name: input.name,
    email: input.email,
    joined: today(),
    role: "일반",
    status: "활성",
    provider: input.provider,
    memberType: input.memberType,
    phone: input.phone,
    company: input.company,
  });
  save("members", rows);
}

/* ── Site-side hooks (관리자 수정 → 사이트 반영) ── */

/** 관리자에서 비노출 처리한 게시글(사례) id 집합 — Case Library에서 숨긴다. */
export function hiddenPostIds(): Set<number> {
  try {
    return new Set(loadPosts().filter((p) => !p.visible).map((p) => p.id));
  } catch {
    return new Set();
  }
}

/** Emails allowed into /admin. Keep in sync with firestore.rules / storage.rules isAdmin(). */
export const ADMIN_EMAILS = ["sbbc212@gmail.com"];

export function isAdminEmail(email: string | null | undefined): boolean {
  return Boolean(email && ADMIN_EMAILS.includes(email));
}
