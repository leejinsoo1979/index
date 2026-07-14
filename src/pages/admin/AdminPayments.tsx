import { useMemo, useState } from "react";
import {
  loadPayments,
  savePayments,
  type AdminPayment,
  type PaymentStatus,
} from "../../lib/adminStore";

const FILTERS: ("전체" | PaymentStatus)[] = [
  "전체",
  "결제완료",
  "환불요청",
  "환불완료",
  "취소",
];

const fmt = (n: number) => n.toLocaleString("ko-KR");

export default function AdminPayments() {
  const [payments, setPayments] = useState<AdminPayment[]>(loadPayments);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("전체");
  const [query, setQuery] = useState("");

  function update(next: AdminPayment[]) {
    setPayments(next);
    savePayments(next);
  }

  const filtered = useMemo(
    () =>
      payments.filter(
        (p) =>
          (filter === "전체" || p.status === filter) &&
          (!query.trim() ||
            p.member.includes(query.trim()) ||
            p.orderNo.toLowerCase().includes(query.trim().toLowerCase()) ||
            p.item.includes(query.trim())),
      ),
    [payments, filter, query],
  );

  const totals = useMemo(() => {
    const paid = payments.filter((p) => p.status === "결제완료");
    const refunded = payments.filter((p) => p.status === "환불완료");
    return {
      revenue: paid.reduce((sum, p) => sum + p.amount, 0),
      count: paid.length,
      refunded: refunded.reduce((sum, p) => sum + p.amount, 0),
      pending: payments.filter((p) => p.status === "환불요청").length,
    };
  }, [payments]);

  function setStatus(id: number, status: PaymentStatus) {
    update(payments.map((p) => (p.id === id ? { ...p, status } : p)));
  }

  function approveRefund(p: AdminPayment) {
    if (!window.confirm(`${p.member}님의 ${fmt(p.amount)}원을 환불 처리할까요?`)) return;
    setStatus(p.id, "환불완료");
  }

  return (
    <div className="admin-page">
      <header className="admin-page__head">
        <h1>결제 관리</h1>
        <p>세미나 신청·회원권 결제 내역을 관리합니다.</p>
      </header>

      <div className="admin-stats admin-stats--sub">
        <div className="admin-stat">
          <span className="admin-stat__label">결제 금액</span>
          <strong className="admin-stat__value">{fmt(totals.revenue)}원</strong>
          <span className="admin-stat__note">{totals.count}건</span>
        </div>
        <div className="admin-stat">
          <span className="admin-stat__label">환불 완료</span>
          <strong className="admin-stat__value">{fmt(totals.refunded)}원</strong>
        </div>
        <div className="admin-stat">
          <span className="admin-stat__label">환불 대기</span>
          <strong className="admin-stat__value">{totals.pending}건</strong>
        </div>
      </div>

      <div className="admin-toolbar">
        <input
          type="search"
          placeholder="회원명·주문번호·항목 검색"
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
                <th>주문번호</th>
                <th>회원</th>
                <th>항목</th>
                <th>금액</th>
                <th>수단</th>
                <th>일자</th>
                <th>상태</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td className="admin-table__mono">{p.orderNo}</td>
                  <td>
                    {p.member}
                    <small className="admin-table__sub">{p.email}</small>
                  </td>
                  <td className="admin-table__ellipsis">{p.item}</td>
                  <td>{fmt(p.amount)}원</td>
                  <td>{p.method}</td>
                  <td>{p.date}</td>
                  <td>
                    <span className={`admin-badge admin-badge--${p.status}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="admin-table__actions">
                    {p.status === "환불요청" && (
                      <button
                        type="button"
                        className="admin-btn admin-btn--primary"
                        onClick={() => approveRefund(p)}
                      >
                        환불 승인
                      </button>
                    )}
                    {p.status === "결제완료" && (
                      <button
                        type="button"
                        className="admin-btn"
                        onClick={() => setStatus(p.id, "취소")}
                      >
                        결제 취소
                      </button>
                    )}
                    {(p.status === "환불완료" || p.status === "취소") && (
                      <span className="admin-table__done">처리 완료</span>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="admin-table__empty">
                    조건에 맞는 결제 내역이 없습니다.
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
