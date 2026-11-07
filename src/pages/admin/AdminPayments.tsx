import { useMemo, useState } from "react";
import {
  APPLICATION_STATUS_LABEL,
  cancelApplication,
  formatSeminarDate,
  formatWon,
  holdsSeat,
  setApplicationConfirmed,
  useSeminarApplications,
  type ApplicationStatus,
} from "../../lib/seminars";

const FILTERS: ("ALL" | ApplicationStatus)[] = ["ALL", "APPLIED", "CONFIRMED", "CANCELED"];
const FILTER_LABEL = { ALL: "전체", ...APPLICATION_STATUS_LABEL };

const fmt = (n: number) => n.toLocaleString("ko-KR");

/**
 * 신청·결제 관리 — all seminar applications across seminars, live.
 * Payment isn't attached yet: amounts are the price at application time, shown as unpaid.
 */
export default function AdminPayments() {
  const { data: applications, loading, error } = useSeminarApplications({ all: true });
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("ALL");
  const [seminarId, setSeminarId] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const seminarOptions = useMemo(() => {
    const map = new Map<string, { title: string; date: string }>();
    for (const a of applications) map.set(a.seminarId, { title: a.seminarTitle, date: a.seminarDate });
    return [...map.entries()].sort((a, b) => b[1].date.localeCompare(a[1].date));
  }, [applications]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return applications.filter(
      (a) =>
        (filter === "ALL" || a.status === filter) &&
        (!seminarId || a.seminarId === seminarId) &&
        (!q ||
          a.applicant.name.toLowerCase().includes(q) ||
          a.applicant.email.toLowerCase().includes(q) ||
          (a.applicant.phone ?? "").includes(q) ||
          a.seminarTitle.toLowerCase().includes(q)),
    );
  }, [applications, filter, seminarId, query]);

  const totals = useMemo(() => {
    const active = applications.filter((a) => holdsSeat(a.status));
    return {
      active: active.length,
      waiting: applications.filter((a) => a.status === "APPLIED").length,
      confirmed: applications.filter((a) => a.status === "CONFIRMED").length,
      expected: active.reduce((sum, a) => sum + a.amount, 0),
    };
  }, [applications]);

  async function act(id: string, action: () => Promise<unknown>) {
    setBusy(id);
    setNotice("");
    try {
      await action();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="admin-page">
      <header className="admin-page__head">
        <h1>신청·결제 관리</h1>
        <p>회원의 세미나 신청을 접수·확정·취소합니다. 결제 기능은 연동 예정이며, 금액은 신청 시점의 수강료입니다.</p>
      </header>

      <div className="admin-stats admin-stats--sub">
        <div className="admin-stat">
          <span className="admin-stat__label">유효 신청</span>
          <strong className="admin-stat__value">{fmt(totals.active)}건</strong>
          <span className="admin-stat__note">취소 제외</span>
        </div>
        <div className="admin-stat">
          <span className="admin-stat__label">접수 대기</span>
          <strong className="admin-stat__value">{fmt(totals.waiting)}건</strong>
        </div>
        <div className="admin-stat">
          <span className="admin-stat__label">접수 확정</span>
          <strong className="admin-stat__value">{fmt(totals.confirmed)}건</strong>
        </div>
        <div className="admin-stat">
          <span className="admin-stat__label">예상 수강료</span>
          <strong className="admin-stat__value">{fmt(totals.expected)}원</strong>
          <span className="admin-stat__note">결제 연동 전</span>
        </div>
      </div>

      <div className="admin-toolbar">
        <input
          type="search"
          placeholder="이름·이메일·전화번호·세미나 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select className="admin-select" value={seminarId} onChange={(e) => setSeminarId(e.target.value)} aria-label="세미나 선택">
          <option value="">전체 세미나</option>
          {seminarOptions.map(([id, s]) => (
            <option key={id} value={id}>
              {s.date} {s.title}
            </option>
          ))}
        </select>
        <div className="admin-toolbar__tabs" role="tablist">
          {FILTERS.map((item) => (
            <button
              key={item}
              type="button"
              className={filter === item ? "is-active" : ""}
              onClick={() => setFilter(item)}
            >
              {FILTER_LABEL[item]}
            </button>
          ))}
        </div>
      </div>

      {(error || notice) && <p className="admin-modal__error">{error ?? notice}</p>}

      <section className="admin-card">
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>신청자</th>
                <th>세미나</th>
                <th>금액</th>
                <th>결제</th>
                <th>신청일</th>
                <th>상태</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id}>
                  <td>
                    {a.applicant.name}
                    <small className="admin-table__sub">
                      {a.applicant.email}
                      {a.applicant.phone ? ` · ${a.applicant.phone}` : ""}
                    </small>
                  </td>
                  <td className="admin-table__ellipsis">
                    {a.seminarTitle}
                    <small className="admin-table__sub">{formatSeminarDate(a.seminarDate)}</small>
                  </td>
                  <td>{formatWon(a.amount)}</td>
                  <td>{a.amount === 0 ? "-" : <span className="admin-table__sub">미결제 (연동 예정)</span>}</td>
                  <td>{new Date(a.createdAt).toLocaleDateString("ko-KR")}</td>
                  <td>
                    <span className={`admin-badge admin-badge--app-${a.status.toLowerCase()}`}>
                      {APPLICATION_STATUS_LABEL[a.status]}
                    </span>
                  </td>
                  <td className="admin-table__actions">
                    {a.status === "APPLIED" && (
                      <button
                        type="button"
                        className="admin-btn admin-btn--primary"
                        disabled={busy === a.id}
                        onClick={() => void act(a.id, () => setApplicationConfirmed(a.id, true))}
                      >
                        접수 확정
                      </button>
                    )}
                    {a.status === "CONFIRMED" && (
                      <button
                        type="button"
                        className="admin-btn"
                        disabled={busy === a.id}
                        onClick={() => void act(a.id, () => setApplicationConfirmed(a.id, false))}
                      >
                        확정 해제
                      </button>
                    )}
                    {holdsSeat(a.status) && (
                      <button
                        type="button"
                        className="admin-btn admin-btn--danger"
                        disabled={busy === a.id}
                        onClick={() => {
                          if (window.confirm(`${a.applicant.name}님의 신청을 취소할까요? 정원이 1석 반환됩니다.`)) {
                            void act(a.id, () => cancelApplication(a.id, "admin"));
                          }
                        }}
                      >
                        신청 취소
                      </button>
                    )}
                    {a.status === "CANCELED" && (
                      <span className="admin-table__done">{a.canceledBy === "admin" ? "관리자 취소" : "본인 취소"}</span>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="admin-table__empty">
                    {loading ? "불러오는 중…" : "조건에 맞는 신청 내역이 없습니다."}
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
