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
  date: string;
  location: string;
  capacity: number;
  enrolled: number;
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
}

const PREFIX = "index-admin";

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
  return load("seminars", () =>
    upcomingSeminars.map((item) => ({
      id: item.id,
      title: item.title,
      level: item.level,
      status: item.status,
      date: item.date,
      location: item.location,
      capacity: item.capacity,
      enrolled: item.enrolled,
    })),
  );
}
export const saveSeminars = (rows: AdminSeminar[]) => save("seminars", rows);

/* ── Payments (결제) ── */
export function loadPayments(): AdminPayment[] {
  return load("payments", () => [
    { id: 1, orderNo: "ORD-260712-0041", member: "김민준", email: "minjun.kim@example.com", item: "방수 시스템 설계 실무 세미나", amount: 88000, method: "카드", date: "2026.07.12", status: "결제완료" },
    { id: 2, orderNo: "ORD-260712-0038", member: "이서연", email: "seoyeon.lee@example.com", item: "방수 시스템 설계 실무 세미나", amount: 88000, method: "카드", date: "2026.07.12", status: "결제완료" },
    { id: 3, orderNo: "ORD-260711-0102", member: "박지훈", email: "jihoon.park@example.com", item: "타일 시공 불량 사례 분석 세미나", amount: 66000, method: "계좌이체", date: "2026.07.11", status: "환불요청" },
    { id: 4, orderNo: "ORD-260710-0027", member: "최수아", email: "sua.choi@example.com", item: "연간 회원권", amount: 120000, method: "카드", date: "2026.07.10", status: "결제완료" },
    { id: 5, orderNo: "ORD-260709-0093", member: "정도윤", email: "doyun.jung@example.com", item: "단열재 종류와 시공 기준 세미나", amount: 66000, method: "카드", date: "2026.07.09", status: "환불완료" },
    { id: 6, orderNo: "ORD-260708-0015", member: "강하은", email: "haeun.kang@example.com", item: "방수 시스템 설계 실무 세미나", amount: 88000, method: "카카오페이", date: "2026.07.08", status: "결제완료" },
    { id: 7, orderNo: "ORD-260706-0064", member: "윤시우", email: "siwoo.yoon@example.com", item: "균열 메커니즘 구조 하자 진단 세미나", amount: 99000, method: "카드", date: "2026.07.06", status: "취소" },
    { id: 8, orderNo: "ORD-260705-0009", member: "임서준", email: "seojun.lim@example.com", item: "연간 회원권", amount: 120000, method: "계좌이체", date: "2026.07.05", status: "결제완료" },
  ]);
}
export const savePayments = (rows: AdminPayment[]) => save("payments", rows);

/* ── Members (회원) ── */
export function loadMembers(): AdminMember[] {
  return load("members", () => [
    { id: 1, name: "이진수", email: "sbbc212@gmail.com", joined: "2026.06.02", role: "관리자", status: "활성", provider: "Google" },
    { id: 2, name: "김민준", email: "minjun.kim@example.com", joined: "2026.06.14", role: "일반", status: "활성", provider: "Google" },
    { id: 3, name: "이서연", email: "seoyeon.lee@example.com", joined: "2026.06.18", role: "일반", status: "활성", provider: "이메일" },
    { id: 4, name: "박지훈", email: "jihoon.park@example.com", joined: "2026.06.21", role: "일반", status: "활성", provider: "Google" },
    { id: 5, name: "최수아", email: "sua.choi@example.com", joined: "2026.06.25", role: "일반", status: "활성", provider: "이메일" },
    { id: 6, name: "정도윤", email: "doyun.jung@example.com", joined: "2026.06.29", role: "일반", status: "정지", provider: "이메일" },
    { id: 7, name: "강하은", email: "haeun.kang@example.com", joined: "2026.07.03", role: "일반", status: "활성", provider: "Google" },
    { id: 8, name: "윤시우", email: "siwoo.yoon@example.com", joined: "2026.07.07", role: "일반", status: "활성", provider: "이메일" },
  ]);
}
export const saveMembers = (rows: AdminMember[]) => save("members", rows);

/** Emails allowed into /admin. */
export const ADMIN_EMAILS = ["sbbc212@gmail.com"];
