import { useMemo, useState } from "react";
import {
  loadMembers,
  saveMembers,
  type AdminMember,
} from "../../lib/adminStore";

const FILTERS = ["전체", "관리자", "일반", "정지"] as const;

export default function AdminMembers() {
  const [members, setMembers] = useState<AdminMember[]>(loadMembers);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("전체");

  function update(next: AdminMember[]) {
    setMembers(next);
    saveMembers(next);
  }

  const filtered = useMemo(
    () =>
      members.filter((m) => {
        const matchFilter =
          filter === "전체" ||
          (filter === "정지" ? m.status === "정지" : m.role === filter);
        const q = query.trim().toLowerCase();
        const matchQuery =
          !q || m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q);
        return matchFilter && matchQuery;
      }),
    [members, query, filter],
  );

  function toggleRole(id: number) {
    update(
      members.map((m) =>
        m.id === id ? { ...m, role: m.role === "관리자" ? "일반" : "관리자" } : m,
      ),
    );
  }

  function toggleStatus(member: AdminMember) {
    const next = member.status === "활성" ? "정지" : "활성";
    if (
      next === "정지" &&
      !window.confirm(`${member.name}님 계정을 정지할까요? 로그인이 차단됩니다.`)
    )
      return;
    update(
      members.map((m) => (m.id === member.id ? { ...m, status: next } : m)),
    );
  }

  return (
    <div className="admin-page">
      <header className="admin-page__head">
        <h1>회원 관리</h1>
        <p>회원 정보·권한·상태를 관리합니다.</p>
      </header>

      <div className="admin-toolbar">
        <input
          type="search"
          placeholder="이름·이메일 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="admin-toolbar__tabs" role="tablist">
          {FILTERS.map((item) => (
            <button
              key={item}
              type="button"
              className={filter === item ? "is-active" : ""}
              onClick={() => setFilter(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <section className="admin-card">
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>번호</th>
                <th>이름</th>
                <th>이메일</th>
                <th>가입 방식</th>
                <th>유형</th>
                <th>가입일</th>
                <th>권한</th>
                <th>상태</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id} className={m.status === "정지" ? "is-muted" : ""}>
                  <td>{m.id}</td>
                  <td>{m.name}</td>
                  <td className="admin-table__mono">{m.email}</td>
                  <td>{m.provider}</td>
                  <td title={m.company ? `업체명: ${m.company}` : undefined}>
                    {m.memberType ?? "일반회원"}
                  </td>
                  <td>{m.joined}</td>
                  <td>
                    <span
                      className={`admin-chip${m.role === "관리자" ? " admin-chip--accent" : ""}`}
                    >
                      {m.role}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`admin-badge admin-badge--${m.status === "활성" ? "결제완료" : "취소"}`}
                    >
                      {m.status}
                    </span>
                  </td>
                  <td className="admin-table__actions">
                    <button
                      type="button"
                      className="admin-btn"
                      onClick={() => toggleRole(m.id)}
                    >
                      {m.role === "관리자" ? "일반으로" : "관리자로"}
                    </button>
                    <button
                      type="button"
                      className={`admin-btn${m.status === "활성" ? " admin-btn--danger" : ""}`}
                      onClick={() => toggleStatus(m)}
                    >
                      {m.status === "활성" ? "정지" : "해제"}
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="admin-table__empty">
                    조건에 맞는 회원이 없습니다.
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
