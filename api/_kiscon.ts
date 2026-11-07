import { createHash } from "node:crypto";
import type { DocumentData, Firestore } from "firebase-admin/firestore";
import { serverFirestore } from "./_firebaseServer.js";
import { dataGoKrPage, RegulationError, type RegulationSource } from "./_regulations.js";

/**
 * 건설업 등록(면허) index built from 국토교통부 키스콘 건설업체정보 (data.go.kr 15061362).
 *
 * The API has no lookup by 업체명/사업자등록번호 — it only lists 공시 (notices) for a
 * 공시기간 window. So notices are replayed in date order into one Firestore document
 * per company (`kisconContractors/{key}`), which the chat tool searches.
 *
 * - GongsiReg: 건설업 등록 공시 (신규·정정·변경·철회)
 * - GongsiAdmi: 행정처분 (영업정지·과징금·과태료·등록말소)
 * - GongsiCess: 폐업신고
 *
 * Sync state lives in `kisconSync/state.syncedThrough` (YYYYMMDD, inclusive); each run
 * continues forward from there in monthly windows until the time budget runs out, so the
 * same job does the initial backfill (from 2003-01-01, the API's earliest data) and the
 * daily catch-up. Server-only data: clients never read these collections.
 */

const SERVICE = "ConAdminInfoSvc1";
const OPERATIONS = { reg: "GongsiReg", admi: "GongsiAdmi", cess: "GongsiCess" } as const;
type NoticeKind = keyof typeof OPERATIONS;
const KIND_ORDER: Record<NoticeKind, number> = { reg: 0, admi: 1, cess: 2 };
const PAGE_SIZE = 500;
const COLLECTION = "kisconContractors";
const STATE_DOC = "kisconSync/state";
const FIRST_DAY = "20030101";

export type License = {
  item: string;
  regNo: string;
  registeredOn: string;
  closedOn?: string;
  closeReason?: string;
  canceledOn?: string;
  lastNoticeOn: string;
};

export type Sanction = {
  seq: string;
  name: string;
  item: string;
  decidedOn: string;
  penalty?: string;
  fine?: string;
  stopFrom?: string;
  stopTo?: string;
  canceledOn?: string;
  violation?: string;
  basis?: string;
};

export type Contractor = {
  key: string;
  name: string;
  normalizedName: string;
  owner: string;
  businessNo: string;
  address: string;
  sido: string;
  sigungu: string;
  tel: string;
  lastNoticeOn: string;
  licenses: Record<string, License>;
  sanctions: Sanction[];
  activeItems: string[];
  nameTokens: string[];
  updatedAt: string;
};

// ─── helpers ────────────────────────────────────────────────────────────────

const digits = (value: string | undefined) => (value ?? "").replace(/\D/g, "");

export function normalizeCompanyName(name: string): string {
  return name
    .replace(/주식회사|유한회사|합자회사|합명회사|\(주\)|\(유\)|\(합\)|㈜|㈲/g, "")
    .replace(/[\s()[\]{}.,·\-_'"]/g, "")
    .toLowerCase();
}

function bigrams(value: string): string[] {
  if (value.length < 2) return value ? [value] : [];
  const out = new Set<string>();
  for (let i = 0; i < value.length - 1; i += 1) out.add(value.slice(i, i + 2));
  return [...out].slice(0, 80);
}

const stripTags = (value: string | undefined) => (value ?? "").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

function companyKey(row: Record<string, string>, name: string, owner: string): string {
  const bizNo = digits(row.ncrMasterNum);
  if (bizNo.length === 10) return bizNo;
  return `n_${createHash("sha1").update(`${normalizeCompanyName(name)}|${owner}`).digest("hex").slice(0, 20)}`;
}

/** Firestore map keys: keep them free of path separators. */
const licenseKey = (regNo: string, item: string) => (regNo || item || "unknown").replace(/[./~*[\]]/g, "_");

const ymd = (date: Date) => date.toISOString().slice(0, 10).replace(/-/g, "");
function parseYmd(value: string): Date {
  return new Date(Date.UTC(Number(value.slice(0, 4)), Number(value.slice(4, 6)) - 1, Number(value.slice(6, 8))));
}
function addDays(value: string, days: number): string {
  const d = parseYmd(value);
  d.setUTCDate(d.getUTCDate() + days);
  return ymd(d);
}
/** Yesterday in KST: the newest 공시일 that can be complete. */
function yesterdayKst(): string {
  const now = new Date(Date.now() + 9 * 3600_000);
  now.setUTCDate(now.getUTCDate() - 1);
  return ymd(now);
}

// ─── fetching ───────────────────────────────────────────────────────────────

type Notice = { kind: NoticeKind; row: Record<string, string> };

async function fetchNotices(kind: NoticeKind, sDate: string, eDate: string): Promise<Notice[]> {
  const out: Notice[] = [];
  for (let page = 1; ; page += 1) {
    const { items, totalCount } = await dataGoKrPage(SERVICE, OPERATIONS[kind], {
      sDate,
      eDate,
      pageNo: String(page),
      numOfRows: String(PAGE_SIZE),
    });
    out.push(...items.map((row) => ({ kind, row })));
    if (items.length < PAGE_SIZE || page * PAGE_SIZE >= totalCount) break;
  }
  return out;
}

// ─── merging ────────────────────────────────────────────────────────────────

function emptyContractor(key: string): Contractor {
  return {
    key,
    name: "",
    normalizedName: "",
    owner: "",
    businessNo: key.startsWith("n_") ? "" : key,
    address: "",
    sido: "",
    sigungu: "",
    tel: "",
    lastNoticeOn: "",
    licenses: {},
    sanctions: [],
    activeItems: [],
    nameTokens: [],
    updatedAt: "",
  };
}

function noticeIdentity(notice: Notice) {
  const r = notice.row;
  if (notice.kind === "admi") return { name: r.ncrAdmiKname ?? "", owner: r.ncrAdmiMaster ?? "", address: r.ncrAdmiAddr ?? "" };
  return { name: r.ncrGsKname ?? "", owner: r.ncrGsMaster ?? "", address: r.ncrGsAddr ?? "" };
}

function applyNotice(c: Contractor, notice: Notice) {
  const r = notice.row;
  const noticeOn = r.ncrGsRegdate ?? "";
  const id = noticeIdentity(notice);
  // Company details follow the newest notice (registration notices carry the full set).
  if (noticeOn >= c.lastNoticeOn && id.name) {
    c.name = id.name;
    c.owner = id.owner || c.owner;
    c.address = id.address || c.address;
    c.sido = r.ncrAreaName || c.sido;
    c.sigungu = r.ncrAreaDetailName || c.sigungu;
    c.tel = r.ncrOffTel || c.tel;
    c.lastNoticeOn = noticeOn;
  }
  const item = r.ncrItemName ?? "";
  const regNo = r.ncrItemregno ?? "";
  const lk = licenseKey(regNo, item);
  const license: License = c.licenses[lk] ?? { item, regNo, registeredOn: "", lastNoticeOn: "" };

  if (notice.kind === "reg") {
    const registeredOn = r.ncrGsDate || noticeOn;
    // A registration after a closure re-opens the license.
    if (license.closedOn && registeredOn > license.closedOn) {
      delete license.closedOn;
      delete license.closeReason;
    }
    license.registeredOn ||= registeredOn;
    license.item = item || license.item;
  } else if (notice.kind === "cess") {
    license.closedOn = r.ncrGsDate || noticeOn;
    const reason = stripTags(r.ncrCessReason);
    if (reason) license.closeReason = reason.slice(0, 300);
  } else {
    const seq = r.ncrGsSeq ?? `${noticeOn}_${r.ncrAdmiDename ?? ""}`;
    if (!c.sanctions.some((s) => s.seq === seq)) {
      c.sanctions.push({
        seq,
        name: r.ncrAdmiDename ?? "",
        item,
        decidedOn: r.ncrGsDate ?? noticeOn,
        penalty: r.ncrAdmiPenalty || undefined,
        fine: r.ncrAdmiFine || undefined,
        stopFrom: r.ncrAdmiStopSdate || undefined,
        stopTo: r.ncrAdmiStopEdate || undefined,
        canceledOn: r.ncrAdmiCanceldate || undefined,
        violation: stripTags(r.ecodeAdmiCon).slice(0, 300) || undefined,
        basis: stripTags(r.ecodeAdmiGround).slice(0, 200) || undefined,
      });
      c.sanctions.sort((a, b) => b.decidedOn.localeCompare(a.decidedOn));
      c.sanctions = c.sanctions.slice(0, 30);
    }
    if (r.ncrAdmiCanceldate) license.canceledOn = r.ncrAdmiCanceldate;
  }
  license.lastNoticeOn = noticeOn > license.lastNoticeOn ? noticeOn : license.lastNoticeOn;
  c.licenses[lk] = license;
}

function finalize(c: Contractor) {
  c.normalizedName = normalizeCompanyName(c.name);
  c.nameTokens = bigrams(c.normalizedName);
  c.activeItems = [...new Set(Object.values(c.licenses).filter((l) => !l.closedOn && !l.canceledOn).map((l) => l.item).filter(Boolean))];
  c.updatedAt = new Date().toISOString();
  // Firestore rejects undefined values.
  c.sanctions = c.sanctions.map((s) => Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined)) as Sanction);
}

async function syncWindow(db: Firestore, sDate: string, eDate: string) {
  const notices = (await Promise.all((Object.keys(OPERATIONS) as NoticeKind[]).map((k) => fetchNotices(k, sDate, eDate)))).flat();
  // "철회" withdraws an earlier notice; replaying it as a change would be wrong, so skip it.
  const usable = notices.filter((n) => n.row.ncrGsFlag !== "철회" && noticeIdentity(n).name);
  usable.sort((a, b) => (a.row.ncrGsRegdate ?? "").localeCompare(b.row.ncrGsRegdate ?? "") || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);

  const byKey = new Map<string, Notice[]>();
  for (const n of usable) {
    const id = noticeIdentity(n);
    const key = companyKey(n.row, id.name, id.owner);
    byKey.set(key, [...(byKey.get(key) ?? []), n]);
  }

  const keys = [...byKey.keys()];
  for (let i = 0; i < keys.length; i += 300) {
    const chunk = keys.slice(i, i + 300);
    const snaps = chunk.length ? await db.getAll(...chunk.map((k) => db.collection(COLLECTION).doc(k))) : [];
    const batch = db.batch();
    snaps.forEach((snap, j) => {
      const key = chunk[j]!;
      const c = snap.exists ? ({ ...emptyContractor(key), ...(snap.data() as DocumentData) } as Contractor) : emptyContractor(key);
      for (const n of byKey.get(key)!) applyNotice(c, n);
      finalize(c);
      batch.set(snap.ref, c);
    });
    await batch.commit();
  }
  return { notices: notices.length, companies: keys.length };
}

export type SyncReport = { from: string; to: string; syncedThrough: string; windows: number; notices: number; companies: number; done: boolean };

/** Advance the index from the saved cursor in monthly windows until `deadline` (ms epoch). */
export async function runKisconSync(
  deadline: number,
  log: (msg: string) => void = () => undefined,
  db: Firestore = serverFirestore(),
): Promise<SyncReport> {
  const stateRef = db.doc(STATE_DOC);
  const state = (await stateRef.get()).data() as { syncedThrough?: string } | undefined;
  const start = state?.syncedThrough ?? addDays(FIRST_DAY, -1);
  const until = yesterdayKst();
  let cursor = start;
  const report: SyncReport = { from: addDays(start, 1), to: until, syncedThrough: start, windows: 0, notices: 0, companies: 0, done: cursor >= until };

  while (cursor < until && Date.now() < deadline) {
    const sDate = addDays(cursor, 1);
    const monthEnd = ymd(new Date(Date.UTC(Number(sDate.slice(0, 4)), Number(sDate.slice(4, 6)), 0)));
    const eDate = monthEnd < until ? monthEnd : until;
    const result = await syncWindow(db, sDate, eDate);
    cursor = eDate;
    await stateRef.set({ syncedThrough: cursor, updatedAt: new Date().toISOString() }, { merge: true });
    report.windows += 1;
    report.notices += result.notices;
    report.companies += result.companies;
    report.syncedThrough = cursor;
    log(`${sDate}~${eDate}: 공시 ${result.notices}건, 업체 ${result.companies}곳`);
  }
  report.done = cursor >= until;
  return report;
}

// ─── search ─────────────────────────────────────────────────────────────────

const COMMON_NAME_TOKENS = new Set(["건설", "설산", "산업", "종합", "합건", "개발", "인테", "테리", "리어", "디자", "자인", "공사", "엔지", "지니", "니어", "어링", "기술", "건축", "축사", "토건", "환경", "전기", "설비", "이앤", "앤씨", "에스", "코리", "리아"]);

export type ContractorQuery = { businessNo?: string; name?: string; item?: string; region?: string };

function summarize(c: Contractor) {
  const licenses = Object.values(c.licenses)
    .sort((a, b) => (a.closedOn || a.canceledOn ? 1 : 0) - (b.closedOn || b.canceledOn ? 1 : 0) || a.item.localeCompare(b.item))
    .map((l) => ({
      item: l.item,
      regNo: l.regNo,
      registeredOn: l.registeredOn,
      status: l.canceledOn ? `등록말소 ${l.canceledOn}` : l.closedOn ? `폐업 ${l.closedOn}` : "등록 유지(공시 기준)",
      ...(l.closeReason ? { closeReason: l.closeReason } : {}),
    }));
  return {
    name: c.name,
    owner: c.owner,
    businessNo: c.businessNo,
    address: c.address,
    region: [c.sido, c.sigungu].filter(Boolean).join(" "),
    activeItems: c.activeItems,
    licenses,
    sanctions: c.sanctions.slice(0, 5),
    lastNoticeOn: c.lastNoticeOn,
  };
}

export async function searchContractors(q: ContractorQuery, db: Firestore = serverFirestore()) {
  const col = db.collection(COLLECTION);
  const state = (await db.doc(STATE_DOC).get()).data() as { syncedThrough?: string } | undefined;
  if (!state?.syncedThrough) throw new RegulationError("건설업체 공시 데이터가 아직 동기화되지 않았습니다.");

  let candidates: Contractor[] = [];
  const bizNo = digits(q.businessNo);
  if (bizNo) {
    if (bizNo.length !== 10) throw new RegulationError("사업자등록번호는 10자리여야 합니다.");
    const snap = await col.doc(bizNo).get();
    candidates = snap.exists ? [snap.data() as Contractor] : [];
  } else if (q.name) {
    const name = normalizeCompanyName(q.name);
    if (name.length < 2) throw new RegulationError("업체명은 2글자 이상으로 검색해 주세요.");
    // Firestore can't AND several array-contains filters: query a few distinctive bigrams
    // (skipping ones shared by thousands of 업체명) plus a name-prefix range, then confirm in memory.
    const tokens = bigrams(name);
    const distinctive = tokens.filter((t) => !COMMON_NAME_TOKENS.has(t));
    const picks = [...new Set([distinctive[0], distinctive[distinctive.length - 1], distinctive[Math.floor(distinctive.length / 2)]].filter(Boolean))] as string[];
    const queries = [
      col.where("normalizedName", ">=", name).where("normalizedName", "<", `${name}\uf8ff`).limit(50).get(),
      ...(picks.length ? picks : tokens.slice(-1)).map((t) => col.where("nameTokens", "array-contains", t).limit(400).get()),
    ];
    const seen = new Map<string, Contractor>();
    for (const snap of await Promise.all(queries)) for (const d of snap.docs) seen.set(d.id, d.data() as Contractor);
    candidates = [...seen.values()].filter((c) => c.normalizedName.includes(name));
  } else if (q.item) {
    const snap = await col.where("activeItems", "array-contains", q.item.trim()).limit(300).get();
    candidates = snap.docs.map((d) => d.data() as Contractor);
  } else {
    throw new RegulationError("사업자등록번호, 업체명, 업종 중 하나는 필요합니다.");
  }

  if (q.item) {
    const item = q.item.trim();
    candidates = candidates.filter((c) => Object.values(c.licenses).some((l) => l.item.includes(item)));
  }
  if (q.region) {
    const terms = q.region.split(/\s+/).filter(Boolean);
    candidates = candidates.filter((c) => terms.every((t) => `${c.sido} ${c.sigungu} ${c.address}`.includes(t)));
  }
  candidates.sort((a, b) => b.activeItems.length - a.activeItems.length || b.lastNoticeOn.localeCompare(a.lastNoticeOn));
  return {
    syncedThrough: state.syncedThrough,
    upToDate: state.syncedThrough >= addDays(yesterdayKst(), -3),
    total: candidates.length,
    results: candidates.slice(0, 10).map(summarize),
  };
}

export function contractorSources(result: Awaited<ReturnType<typeof searchContractors>>): RegulationSource[] {
  const retrievedAt = new Date().toISOString();
  return result.results.map((c) => ({
    id: `kiscon_${c.businessNo || c.name}`,
    title: `${c.name} — 건설업 등록정보`,
    sourceType: "public_data",
    publisher: `국토교통부 키스콘 건설업체정보 (공시 ${result.syncedThrough}까지 반영)`,
    url: "https://www.kiscon.net",
    snippet: c.activeItems.length ? `등록 업종: ${c.activeItems.join(", ")}` : "유효한 등록 업종 없음(공시 기준)",
    retrievedAt,
  }));
}
