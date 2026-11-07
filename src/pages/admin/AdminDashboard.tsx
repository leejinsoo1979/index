import { useMemo } from "react";
import { Link } from "react-router-dom";
import { loadMembers, loadPosts } from "../../lib/adminStore";
import {
  APPLICATION_STATUS_LABEL,
  effectiveStatus,
  formatSeminarDate,
  useSeminarApplications,
  useSeminars,
} from "../../lib/seminars";

const fmt = (n: number) => n.toLocaleString("ko-KR");

export default function AdminDashboard() {
  const posts = useMemo(loadPosts, []);
  const { data: seminars } = useSeminars({ includeUnpublished: true });
  const { data: applications } = useSeminarApplications({ all: true });
  const members = useMemo(loadMembers, []);

  const active = applications.filter((a) => a.status !== "CANCELED");
  const waiting = applications.filter((a) => a.status === "APPLIED").length;
  const openSeminars = seminars.filter((s) => s.published && effectiveStatus(s) === "접수중").length;
  const recent = applications.slice(0, 5);

  const stats = [
    { label: "전체 회원", value: `${fmt(members.length)}명`, to: "/admin/members", note: `정지 ${members.filter((m) => m.status === "정지").length}명` },
    { label: "게시글", value: `${fmt(posts.length)}건`, to: "/admin/boards", note: `비노출 ${posts.filter((p) => !p.visible).length}건` },
    { label: "세미나", value: `${fmt(seminars.length)}개`, to: "/admin/seminars", note: `접수중 ${openSeminars}개` },
    { label: "세미나 신청", value: `${fmt(active.length)}건`, to: "/admin/payments", note: `접수 대기 ${waiting}건` },
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
          <h2>최근 세미나 신청</h2>
          <Link to="/admin/payments" className="admin-card__more">
            전체 보기
          </Link>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>신청자</th>
                <th>세미나</th>
                <th>세미나 일자</th>
                <th>신청일</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((a) => (
                <tr key={a.id}>
                  <td>
                    {a.applicant.name}
                    <small className="admin-table__sub">{a.applicant.email}</small>
                  </td>
                  <td className="admin-table__ellipsis">{a.seminarTitle}</td>
                  <td>{formatSeminarDate(a.seminarDate)}</td>
                  <td>{new Date(a.createdAt).toLocaleDateString("ko-KR")}</td>
                  <td>
                    <span className={`admin-badge admin-badge--app-${a.status.toLowerCase()}`}>
                      {APPLICATION_STATUS_LABEL[a.status]}
                    </span>
                  </td>
                </tr>
              ))}
              {recent.length === 0 && (
                <tr>
                  <td colSpan={5} className="admin-table__empty">
                    아직 세미나 신청이 없습니다.
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
