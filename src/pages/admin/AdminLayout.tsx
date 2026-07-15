import { useState } from "react";
import { FiBell, FiMenu, FiSearch, FiSettings, FiUser, FiX } from "react-icons/fi";
import { NavLink, Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { ADMIN_EMAILS } from "../../lib/adminStore";
import "./Admin.css";

function DashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function BoardIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 9h8M8 12.5h8M8 16h5" />
    </svg>
  );
}

function SeminarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="5.5" width="16" height="14" rx="2" />
      <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
    </svg>
  );
}

function PayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3.5" y="6" width="17" height="12" rx="2" />
      <path d="M3.5 10h17M7 14.5h4" />
    </svg>
  );
}

function MemberIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="9.5" cy="8.5" r="3.2" />
      <path d="M4 19.5c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5M16 5.8a3.2 3.2 0 0 1 0 5.4M17.5 14.6c1.6.7 2.8 2.4 3.2 4.9" />
    </svg>
  );
}

function AgentIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="6" width="16" height="13" rx="3" />
      <path d="M12 3v3M8.5 11h.01M15.5 11h.01M8.5 15c1 .8 2.2 1.2 3.5 1.2s2.5-.4 3.5-1.2" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10 6l-6 6 6 6M4 12h16" />
    </svg>
  );
}

const NAV = [
  { to: "/admin", label: "대시보드", icon: <DashIcon />, end: true },
  { to: "/agent-studio", label: "Agent Studio", icon: <AgentIcon />, external: true },
  { to: "/admin/boards", label: "게시판 관리", icon: <BoardIcon /> },
  { to: "/admin/seminars", label: "세미나 관리", icon: <SeminarIcon /> },
  { to: "/admin/payments", label: "결제 관리", icon: <PayIcon /> },
  { to: "/admin/members", label: "회원 관리", icon: <MemberIcon /> },
];

export default function AdminLayout() {
  const { user, loading, configured } = useAuth();
  const { pathname } = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Firebase 미설정(로컬 데모)일 때는 게이트 없이 통과시킨다.
  const allowed = !configured || (user && ADMIN_EMAILS.includes(user.email ?? ""));

  if (loading) {
    return (
      <div className="admin admin--gate">
        <p>확인 중…</p>
      </div>
    );
  }

  if (configured && !user) {
    return (
      <div className="admin admin--gate">
        <h1>관리자 로그인이 필요합니다</h1>
        <p>관리자 계정으로 로그인한 뒤 다시 접속해주세요.</p>
        <Link className="admin-gate__btn" to="/mypage">
          로그인하러 가기
        </Link>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="admin admin--gate">
        <h1>접근 권한이 없습니다</h1>
        <p>
          {user?.email} 계정은 관리자로 등록되어 있지 않습니다.
        </p>
        <Link className="admin-gate__btn" to="/">
          홈으로 돌아가기
        </Link>
      </div>
    );
  }

  const current = NAV.find((item) => item.to === pathname || (!item.end && pathname.startsWith(item.to)));
  const renderItem = (item: (typeof NAV)[number]) => item.external ? (
    <a key={item.to} href={item.to} target="_blank" rel="noreferrer" className="admin__nav-item">
      {item.icon}<span>{item.label}</span><em>↗</em>
    </a>
  ) : (
    <NavLink key={item.to} to={item.to} end={item.end} onClick={() => setMobileOpen(false)} className={({ isActive }) => `admin__nav-item${isActive ? " is-active" : ""}`}>
      {item.icon}<span>{item.label}</span>
    </NavLink>
  );

  return (
    <div className={`admin${mobileOpen ? " admin--menu-open" : ""}`}>
      <button type="button" className="admin__side-overlay" aria-label="메뉴 닫기" onClick={() => setMobileOpen(false)} />
      <aside className="admin__side">
        <Link to="/" className="admin__logo">
          <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M18 28c2.76 0 5.05-2.26 4.5-4.97a27.2 27.2 0 0 0-1.25-4.21 24 24 0 0 0-4.99-7.79A23.7 23.7 0 0 0 8.8 5.83a23.9 23.9 0 0 0-3.84-1.27C2.27 3.94 0 6.24 0 9v14c0 2.76 2.24 5 5 5h13Z" fill="#5D87FF"/><path d="M14 28c-2.76 0-5.05-2.26-4.5-4.97a27.2 27.2 0 0 1 1.25-4.21 24 24 0 0 1 4.99-7.79 23.7 23.7 0 0 1 7.46-5.2 23.9 23.9 0 0 1 3.84-1.27C29.73 3.94 32 6.24 32 9v14c0 2.76-2.24 5-5 5H14Z" fill="#49BEFF" style={{ mixBlendMode: "multiply" }}/></svg>
          <strong>index<span>Admin</span></strong>
        </Link>

        <nav className="admin__nav" aria-label="관리자 메뉴">
          <p className="admin__nav-label">HOME</p>
          {NAV.slice(0, 2).map(renderItem)}
          <p className="admin__nav-label">MANAGEMENT</p>
          {NAV.slice(2).map(renderItem)}
        </nav>

        <div className="admin__side-foot">
          <div className="admin__profile"><span>{(user?.email || "A").slice(0, 1).toUpperCase()}</span><p><strong>INDEX Admin</strong><small>{user?.email || "Local manager"}</small></p></div>
          <Link to="/" className="admin__back">
            <BackIcon />
            사이트로 돌아가기
          </Link>
        </div>
      </aside>

      <div className="admin__body">
        <header className="admin__topbar">
          <button type="button" className="admin__menu" onClick={() => setMobileOpen((value) => !value)} aria-label="메뉴 열기">{mobileOpen ? <FiX /> : <FiMenu />}</button>
          <label className="admin__global-search"><FiSearch /><input type="search" placeholder="Search..." aria-label="관리자 전체 검색" /></label>
          <div className="admin__top-actions"><button type="button" aria-label="알림"><FiBell /><i>2</i></button><button type="button" aria-label="설정"><FiSettings /></button><span className="admin__avatar"><FiUser /></span></div>
        </header>
        <main className="admin__main">
          <div className="admin__breadcrumb"><span>INDEX Admin</span><b>/</b><strong>{current?.label ?? "대시보드"}</strong></div>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
