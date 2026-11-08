import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { isExternalLink, useNavigation, visibleLinks } from "../lib/navigation";
import type { NavLink } from "../data/navigation";
import "./Footer.css";

function MenuLink({ link }: { link: NavLink }) {
  return link.newTab || isExternalLink(link.to) ? (
    <a href={link.to} target={link.newTab ? "_blank" : undefined} rel="noopener">
      {link.label}
    </a>
  ) : (
    <Link to={link.to}>{link.label}</Link>
  );
}

export default function Footer() {
  const { nav } = useNavigation();
  const { isAdmin } = useAuth();
  const legal = visibleLinks(nav.legal, isAdmin);
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__brand">
          <Link to="/" className="site-footer__logo">
            index
          </Link>
          <p className="site-footer__org">{nav.org}</p>
        </div>

        {nav.footer.map((col, i) => (
          <nav key={i} className="site-footer__col" aria-label={`푸터 메뉴 ${i + 1}`}>
            <ul>
              {visibleLinks(col.links, isAdmin).map((link) => (
                <li key={link.to}>
                  <MenuLink link={link} />
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="site-footer__bottom">
        <p className="site-footer__copy">
          {nav.copyright}
        </p>
        <nav className="site-footer__legal" aria-label="약관">
          {legal.map((link, i) => (
            <span key={link.to}>
              <MenuLink link={link} />
              {i < legal.length - 1 && (
                <span className="site-footer__sep">|</span>
              )}
            </span>
          ))}
        </nav>
      </div>
    </footer>
  );
}
