/**
 * Admin data store — localStorage-backed demo persistence.
 * Seeds from the static site data on first run; every mutation in the
 * admin screens is saved so edits survive reloads. Swap the load/save
 * helpers for real API calls when a backend lands.
 */
import { cases } from "../data/cases";
import { upcomingSeminars } from "../data/seminars";

export interface AdminPost {
  id: number;
  title: string;
  group: string;
  category: string;
  date: string;
  views: number;
  visible: boolean;
}

export interface AdminSeminar {
  id: number;
  title: string;
  level: "기초" | "심화";
  status: "예정" | "접수중" | "완료";
  /** 진행 일자 — "2026.08.04 (화)" 형식 (사이트 표기와 동일) */
  date: string;
  location: string;
  capacity: number;
  enrolled: number;
  /** 수강료(원) — 신청 시 결제 금액으로 청구된다 */
  price: number;
  /** 진행 시간 — 예: "14:00 ~ 17:00" */
  time?: string;
  /** 접수 마감일 — "2026.08.01" */
  applyDeadline?: string;
  instructor?: string;
  description?: string;
  /** 섬네일(대표) 이미지 — URL 또는 업로드된 data URL */
  image?: string;
  /** 세미나 관련 이미지들 (업로드된 data URL) */
  gallery?: string[];
  /** 도로명 주소 — 지도 표시에 사용 */
  address?: string;
  /** 상세 장소명 — 예: "협회 3층 세미나실" */
  venue?: string;
}

export type PaymentStatus = "결제완료" | "환불요청" | "환불완료" | "취소";

export interface AdminPayment {
  id: number;
  orderNo: string;
  member: string;
  email: string;
  item: string;
  amount: number;
  method: string;
  date: string;
  status: PaymentStatus;
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

/* ── Seminars (세미나) ── */
export function loadSeminars(): AdminSeminar[] {
  const rows = load("seminars", () =>
    upcomingSeminars.map((item) => ({
      id: item.id,
      title: item.title,
      level: item.level,
      status: item.status,
      date: item.date,
      location: item.location,
      capacity: item.capacity,
      enrolled: item.enrolled,
      price: seminarFee(item.level),
      image: item.image,
    })),
  );
  // 가격 필드 도입 전 저장된 행 보정
  return rows.map((s) => ({ ...s, price: s.price ?? seminarFee(s.level) }));
}
export const saveSeminars = (rows: AdminSeminar[]) => save("seminars", rows);

/* ── Payments (결제) ── */
export function loadPayments(): AdminPayment[] {
  return load("payments", () => []);
}
export const savePayments = (rows: AdminPayment[]) => save("payments", rows);

function today() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}.${mm}.${dd}`;
}

function nextId(rows: { id: number }[]) {
  return rows.reduce((max, r) => Math.max(max, r.id), 0) + 1;
}

/** 세미나 수강료 — 데이터에 가격 필드가 없어 난이도 기준으로 산정 */
export function seminarFee(level: AdminSeminar["level"]): number {
  return level === "심화" ? 88000 : 66000;
}

/**
 * 세미나 신청 → 결제 내역 생성 + 신청 인원 증가.
 * SeminarApplyModal에서 호출되어 관리자 결제/세미나 화면과 연동된다.
 */
export function recordSeminarApplication(
  seminarId: number,
  applicant: { name: string; email: string },
): AdminPayment {
  const seminars = loadSeminars();
  const seminar = seminars.find((s) => s.id === seminarId);

  const payments = loadPayments();
  const d = new Date();
  const orderNo = `ORD-${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${String(payments.length + 1).padStart(4, "0")}`;
  const payment: AdminPayment = {
    id: nextId(payments),
    orderNo,
    member: applicant.name,
    email: applicant.email,
    item: seminar ? `${seminar.title} 세미나` : "세미나 신청",
    amount: seminar?.price ?? seminarFee(seminar?.level ?? "기초"),
    method: "카드",
    date: today(),
    status: "결제완료",
  };
  savePayments([payment, ...payments]);

  if (seminar) {
    saveSeminars(
      seminars.map((s) =>
        s.id === seminarId
          ? { ...s, enrolled: Math.min(s.capacity, s.enrolled + 1) }
          : s,
      ),
    );
  }
  return payment;
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

/** 관리자에서 수정한 세미나 값(상태·일정·정원 등)을 정적 데이터 위에 덮어쓴다. */
export function applySeminarOverrides<
  T extends { id: number; title: string; status: string; date: string; location: string; capacity: number; enrolled: number },
>(rows: T[]): T[] {
  try {
    const overrides = new Map(loadSeminars().map((s) => [s.id, s]));
    return rows.map((row) => {
      const o = overrides.get(row.id);
      if (!o) return row;
      return {
        ...row,
        title: o.title,
        status: o.status as T["status"],
        date: o.date,
        location: o.location,
        capacity: o.capacity,
        enrolled: o.enrolled,
      };
    });
  } catch {
    return rows;
  }
}

const SEMINAR_FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1505373877841-8d25f7d46678?w=1000&q=70";

/**
 * 사이트 세미나 목록용 병합 — 정적 데이터에 관리자 수정을 덮어쓰고,
 * 관리자에서 새로 등록한 세미나(정적 데이터에 없는 id)를 뒤에 추가한다.
 */
export function mergedUpcomingSeminars(): {
  id: number;
  level: AdminSeminar["level"];
  status: AdminSeminar["status"];
  title: string;
  date: string;
  location: string;
  capacity: number;
  enrolled: number;
  image: string;
}[] {
  try {
    const admin = loadSeminars();
    const byId = new Map(admin.map((s) => [s.id, s]));
    const staticIds = new Set(upcomingSeminars.map((s) => s.id));

    const merged = upcomingSeminars.map((row) => {
      const o = byId.get(row.id);
      if (!o) return row;
      return {
        ...row,
        title: o.title,
        level: o.level,
        status: o.status,
        date: o.date,
        location: o.location,
        capacity: o.capacity,
        enrolled: o.enrolled,
        image: o.image || row.image,
      };
    });

    const added = admin
      .filter((s) => !staticIds.has(s.id))
      .map((s) => ({
        id: s.id,
        level: s.level,
        status: s.status,
        title: s.title,
        date: s.date,
        location: s.location,
        capacity: s.capacity,
        enrolled: s.enrolled,
        image: s.image || SEMINAR_FALLBACK_IMAGE,
      }));

    return [...merged, ...added];
  } catch {
    return upcomingSeminars;
  }
}

/** 관리자에서 비노출 처리한 게시글(사례) id 집합 — Case Library에서 숨긴다. */
export function hiddenPostIds(): Set<number> {
  try {
    return new Set(loadPosts().filter((p) => !p.visible).map((p) => p.id));
  } catch {
    return new Set();
  }
}

/** Emails allowed into /admin. */
export const ADMIN_EMAILS = ["sbbc212@gmail.com"];
