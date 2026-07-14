import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  loadMembers,
  loadPayments,
  loadPosts,
  loadSeminars,
} from "../../lib/adminStore";

const fmt = (n: number) => n.toLocaleString("ko-KR");

export default function AdminDashboard() {
  const posts = useMemo(loadPosts, []);
  const seminars = useMemo(loadSeminars, []);
  const payments = useMemo(loadPayments, []);
  const members = useMemo(loadMembers, []);

  const revenue = payments
    .filter((p) => p.status === "결제완료")
    .reduce((sum, p) => sum + p.amount, 0);
  const refundRequests = payments.filter((p) => p.status === "환불요청").length;
  const openSeminars = seminars.filter((s) => s.status === "접수중").length;
  const recent = payments.slice(0, 5);

  const stats = [
    { label: "전체 회원", value: `${fmt(members.length)}명`, to: "/admin/members", note: `정지 ${members.filter((m) => m.status === "정지").length}명` },
    { label: "게시글", value: `${fmt(posts.length)}건`, to: "/admin/boards", note: `비노출 ${posts.filter((p) => !p.visible).length}건` },
    { label: "세미나", value: `${fmt(seminars.length)}개`, to: "/admin/seminars", note: `접수중 ${openSeminars}개` },
    { label: "결제 금액", value: `${fmt(revenue)}원`, to: "/admin/payments", note: `환불요청 ${refundRequests}건` },
  ];

  return (
    <div className="admin-page">
      <header className="admin-page__head">
        <h1>대시보드</h1>
        <p>INDEX 운영 현황을 한눈에 확인하세요.</p>
      </header>

      <div className="admin-stats">
        {stats.map((item) => (
          <Link key={item.label} to={item.to} className="admin-stat">
            <span className="admin-stat__label">{item.label}</span>
            <strong className="admin-stat__value">{item.value}</strong>
            <span className="admin-stat__note">{item.note}</span>
          </Link>
        ))}
      </div>

      <section className="admin-card">
        <div className="admin-card__head">
          <h2>최근 결제</h2>
          <Link to="/admin/payments" className="admin-card__more">
            전체 보기
          </Link>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>주문번호</th>
                <th>회원</th>
                <th>항목</th>
                <th>금액</th>
                <th>일자</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((p) => (
                <tr key={p.id}>
                  <td className="admin-table__mono">{p.orderNo}</td>
                  <td>{p.member}</td>
                  <td className="admin-table__ellipsis">{p.item}</td>
                  <td>{fmt(p.amount)}원</td>
                  <td>{p.date}</td>
                  <td>
                    <span className={`admin-badge admin-badge--${p.status}`}>
                      {p.status}
                    </span>
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
