import { NavLink, Link, useLocation } from "react-router-dom";
import { primaryNav } from "../data/navigation";
import { useAuth } from "../auth/AuthContext";
import ThemeToggle from "./ThemeToggle";
import "./Header.css";

export default function Header() {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
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
        {primaryNav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              "site-header__link" + (isActive ? " is-active" : "")
            }
          >
            <span className="site-header__label site-header__label--en">
              {item.englishLabel ?? item.label}
            </span>
            <span className="site-header__label site-header__label--ko">
              {item.label}
            </span>
          </NavLink>
        ))}
      </nav>
    </header>
  );
}
