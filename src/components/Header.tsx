import { NavLink, Link, useLocation } from "react-router-dom";
import { primaryNav } from "../data/navigation";
import { useAuth } from "../auth/AuthContext";
import { PlusIcon, MicIcon } from "./icons";
import "./Header.css";

export default function Header() {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  // Home uses the centered minimal nav; inner pages get logo + compact search.
  const isHome = pathname === "/";

  if (isHome) {
    return (
      <header className="site-header site-header--home">
        <Link to="/" className="site-header__home-logo">
          index
        </Link>
        <div className="site-header__auth">
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

  return (
    <header className="site-header site-header--inner">
      <div className="site-header__bar">
        <Link to="/" className="site-header__logo">
          index
        </Link>

        <nav className="site-header__nav" aria-label="주요 메뉴">
          {primaryNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                "site-header__link" + (isActive ? " is-active" : "")
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Centered search bar below the nav row (matches original) */}
      <div className="site-header__search-row">
        <form
          className="site-header__search"
          role="search"
          onSubmit={(e) => e.preventDefault()}
        >
          <input
            type="text"
            placeholder="물어보세요"
            aria-label="검색"
            autoComplete="off"
          />
          <div className="site-header__search-icons">
            <button type="button" aria-label="첨부 추가">
              <PlusIcon />
            </button>
            <button type="button" aria-label="음성 검색">
              <MicIcon />
            </button>
          </div>
        </form>
      </div>
    </header>
  );
}
