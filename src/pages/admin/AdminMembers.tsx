import { useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { CustomSelect } from "../../components/ui/custom-select";
import { loadMembers, saveMembers, type AdminMember } from "../../lib/adminStore";
import { isSuperAdmin, updateMemberByAdmin, useAllMembers, type MemberRecord, type MemberType } from "../../lib/members";

/**
 * 회원 관리 — Firestore members/{uid} (실가입 회원). 회원 유형(AI 질문 한도), 관리자 지정, 정지를
 * 여기서 바꾼다. 최고 관리자(ADMIN_EMAILS)는 강등·정지할 수 없다.
 * Firebase가 없는 로컬 데모에서는 이 브라우저의 localStorage 목록을 보여 준다.
 */
const FILTERS = ["전체", "관리자", "사업자회원", "일반회원", "정지"] as const;
type Filter = (typeof FILTERS)[number];

const fmt = (t?: { toDate?: () => Date } | null) => {
  const d = t?.toDate?.();
  return d ? `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}` : "—";
};

export default function AdminMembers() {
  const { configured } = useAuth();
  return configured ? <FirestoreMembers /> : <LocalMembers />;
}

function FirestoreMembers() {
  const { user } = useAuth();
  const { members, loading, error } = useAllMembers(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("전체");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members
      .filter((m) => {
        const admin = isSuperAdmin(m.email) || m.role === "admin";
        const suspended = m.status === "suspended";
        const byFilter =
          filter === "전체" ||
          (filter === "관리자" && admin) ||
          (filter === "정지" && suspended) ||
          (filter === m.memberType || (filter === "일반회원" && !m.memberType));
        const byQuery = !q || [m.name, m.email, m.company, m.phone].some((v) => v?.toLowerCase().includes(q));
        return byFilter && byQuery;
      })
      .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
  }, [members, query, filter]);

  const counts = useMemo(
    () => ({
      total: members.length,
      business: members.filter((m) => m.memberType === "사업자회원").length,
      admins: members.filter((m) => isSuperAdmin(m.email) || m.role === "admin").length,
      suspended: members.filter((m) => m.status === "suspended").length,
    }),
    [members],
  );

  async function run(uid: string, label: string, patch: Parameters<typeof updateMemberByAdmin>[1]) {
    setBusy(uid);
    setNotice("");
    try {
      await updateMemberByAdmin(uid, patch);
      setNotice(label);
    } catch (e) {
      setNotice(e instanceof Error ? `저장하지 못했습니다: ${e.message}` : "저장하지 못했습니다.");
    } finally {
      setBusy(null);
    }
  }

  function toggleAdmin(m: MemberRecord) {
    const next = m.role === "admin" ? "member" : "admin";
    if (next === "admin" && !window.confirm(`${m.name || m.email}님을 관리자로 지정할까요?\n관리자 모드의 모든 기능(회원·메뉴·페이지 관리)을 쓸 수 있게 됩니다.`)) return;
    if (next === "member" && m.uid === user?.uid && !window.confirm("본인의 관리자 권한을 해제합니다. 계속할까요?")) return;
    void run(m.uid, next === "admin" ? `${m.name || m.email}님을 관리자로 지정했습니다.` : `${m.name || m.email}님의 관리자 권한을 해제했습니다.`, { role: next });
  }

  function toggleSuspend(m: MemberRecord) {
    if (m.status === "suspended") {
      void run(m.uid, `${m.name || m.email}님의 정지를 해제했습니다.`, { status: "active", suspendedReason: "" });
      return;
    }
    const reason = window.prompt(`${m.name || m.email}님 계정을 정지합니다. 로그인하면 바로 로그아웃됩니다.\n정지 사유(회원에게 표시, 비워도 됨):`, "");
    if (reason === null) return;
    void run(m.uid, `${m.name || m.email}님 계정을 정지했습니다.`, { status: "suspended", suspendedReason: reason.trim().slice(0, 200) });
  }

  return (
    <div className="admin-page">
      <header className="admin-page__head">
        <h1>회원 관리</h1>
        <p>
          실제 가입 회원 {counts.total}명 · 사업자 {counts.business} · 관리자 {counts.admins} · 정지 {counts.suspended}. 회원 유형을 바꾸면 INDEX AI 하루 질문 한도(일반 10 / 사업자 30)가 바로 바뀝니다.
        </p>
      </header>

      <div className="admin-toolbar">
        <input type="search" placeholder="이름·이메일·업체·연락처 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="admin-toolbar__tabs" role="tablist">
          {FILTERS.map((item) => (
            <button key={item} type="button" className={filter === item ? "is-active" : ""} onClick={() => setFilter(item)}>
              {item}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="admin-note admin-note--error" role="alert">{error}</p>}
      {notice && <p className="admin-note" role="status">{notice}</p>}

      <section className="admin-card">
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>이름</th>
                <th>이메일</th>
                <th>연락처</th>
                <th>가입</th>
                <th>회원 유형</th>
                <th>업체명</th>
                <th>가입일</th>
                <th>최근 로그인</th>
                <th>권한</th>
                <th>상태</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={11} className="admin-table__empty">회원 목록을 불러오는 중입니다.</td>
                </tr>
              )}
              {!loading &&
                rows.map((m) => {
                  const superAdmin = isSuperAdmin(m.email);
                  const admin = superAdmin || m.role === "admin";
                  const suspended = m.status === "suspended";
                  return (
                    <tr key={m.uid} className={suspended ? "is-muted" : ""}>
                      <td>{m.name || "—"}</td>
                      <td className="admin-table__mono">{m.email || "—"}</td>
                      <td className="admin-table__mono">{m.phone || "—"}</td>
                      <td>{m.provider || "—"}</td>
                      <td style={{ minWidth: 130 }}>
                        <CustomSelect
                          options={["일반회원", "사업자회원"]}
                          value={m.memberType ?? "일반회원"}
                          disabled={busy === m.uid}
                          onValueChange={(v) => {
                            if (v !== (m.memberType ?? "일반회원")) void run(m.uid, `${m.name || m.email}님을 ${v}으로 바꿨습니다.`, { memberType: v as MemberType });
                          }}
                        />
                      </td>
                      <td>{m.company || "—"}</td>
                      <td>{fmt(m.createdAt)}</td>
                      <td>{fmt(m.lastLoginAt)}</td>
                      <td>
                        <span className={`admin-chip${admin ? " admin-chip--accent" : ""}`}>{superAdmin ? "최고 관리자" : admin ? "관리자" : "일반"}</span>
                      </td>
                      <td>
                        <span className={`admin-badge admin-badge--${suspended ? "취소" : "결제완료"}`} title={suspended && m.suspendedReason ? `사유: ${m.suspendedReason}` : undefined}>
                          {suspended ? "정지" : "활성"}
                        </span>
                      </td>
                      <td className="admin-table__actions">
                        {superAdmin ? (
                          <span className="admin-table__sub">변경 불가</span>
                        ) : (
                          <>
                            <button type="button" className="admin-btn" disabled={busy === m.uid} onClick={() => toggleAdmin(m)}>
                              {m.role === "admin" ? "관리자 해제" : "관리자로"}
                            </button>
                            <button type="button" className={`admin-btn${suspended ? "" : " admin-btn--danger"}`} disabled={busy === m.uid} onClick={() => toggleSuspend(m)}>
                              {suspended ? "정지 해제" : "정지"}
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={11} className="admin-table__empty">
                    {members.length === 0 ? "아직 회원 기록이 없습니다. 회원이 가입하거나 다시 로그인하면 여기에 나타납니다." : "조건에 맞는 회원이 없습니다."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/** Local demo (no Firebase): the browser-only list from adminStore. */
function LocalMembers() {
  const [members, setMembers] = useState<AdminMember[]>(loadMembers);
  const update = (next: AdminMember[]) => {
    setMembers(next);
    saveMembers(next);
  };
  return (
    <div className="admin-page">
      <header className="admin-page__head">
        <h1>회원 관리</h1>
        <p>로컬 데모 모드입니다. Firebase가 연결되면 실제 가입 회원이 표시됩니다.</p>
      </header>
      <section className="admin-card">
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>이름</th>
                <th>이메일</th>
                <th>유형</th>
                <th>권한</th>
                <th>상태</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className={m.status === "정지" ? "is-muted" : ""}>
                  <td>{m.name}</td>
                  <td className="admin-table__mono">{m.email}</td>
                  <td>{m.memberType ?? "일반회원"}</td>
                  <td>{m.role}</td>
                  <td>{m.status}</td>
                  <td className="admin-table__actions">
                    <button type="button" className="admin-btn" onClick={() => update(members.map((x) => (x.id === m.id ? { ...x, role: x.role === "관리자" ? "일반" : "관리자" } : x)))}>
                      {m.role === "관리자" ? "일반으로" : "관리자로"}
                    </button>
                    <button type="button" className="admin-btn" onClick={() => update(members.map((x) => (x.id === m.id ? { ...x, status: x.status === "활성" ? "정지" : "활성" } : x)))}>
                      {m.status === "활성" ? "정지" : "해제"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
