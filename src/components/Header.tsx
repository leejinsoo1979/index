import { NavLink, Link, useLocation } from "react-router-dom";
import { primaryNav } from "../data/navigation";
import { useAuth } from "../auth/AuthContext";
import { isAdminEmail } from "../lib/adminStore";
import ThemeToggle from "./ThemeToggle";
import "./Header.css";

export default function Header() {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const isAdmin = isAdminEmail(user?.email);
  // Same layout everywhere; home gets the transparent dark-overlay variant.
  const isHome = pathname === "/";

  return (
    <header
      className={`site-header ${isHome ? "site-header--home" : "site-header--inner"}`}
    >
      <Link to="/" className="site-header__home-logo">
        index
      </Link>
      <div className="site-header__auth">
        {isAdmin && (
          <Link to="/admin" className="site-header__admin" aria-label="관리자 페이지">
            Admin
          </Link>
        )}
        <ThemeToggle />
        {user ? (
          <>
            <Link to="/cases">{user.displayName || user.email || "Account"}</Link>
            <span aria-hidden="true">/</span>
            <button type="button" onClick={() => void logout()}>
              Logout
            </button>
          </>
        ) : (
          <>
            <Link to="/mypage">Login</Link>
            <span aria-hidden="true">/</span>
            <Link to="/signup">Join</Link>
          </>
        )}
      </div>
      <nav className="site-header__nav" aria-label="주요 메뉴">
        {primaryNav.filter((item) => !item.adminOnly || isAdmin).map((item) => {
          const labels = (
            <>
              <span className="site-header__label site-header__label--en">
                {item.englishLabel ?? item.label}
              </span>
              <span className="site-header__label site-header__label--ko">
                {item.label}
              </span>
            </>
          );
          return item.newTab ? (
            <a key={item.to} href={item.to} target="_blank" rel="noopener" className="site-header__link">
              {labels}
            </a>
          ) : (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                "site-header__link" + (isActive ? " is-active" : "")
              }
            >
              {labels}
            </NavLink>
          );
        })}
      </nav>
    </header>
  );
}
